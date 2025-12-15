/**
 * Context History Manager
 * 컨텍스트 변경사항 추적, 체크포인트 관리, 자동 요약 트리거
 */

import * as vscode from 'vscode';
import { ConversationEntry } from '../state/types';
import { ContextData } from './types';
import {
    ContextUpdate,
    ContextUpdateType,
    ContextCheckpoint,
    ContextSizeInfo,
    ConversationSummary,
    TaskProgress,
    ConversationHistoryDeletedRange,
    MessageHistoryIndex
} from './types/contextHistory';
import { estimateTokens } from '../../utils';
import { ConversationSummarizer } from './ConversationSummarizer';

export class ContextHistoryManager {
    private static instance: ContextHistoryManager;
    private context: vscode.ExtensionContext;
    private updates: Map<number, ContextUpdate[]> = new Map(); // messageIndex -> updates
    private checkpoints: Map<string, ContextCheckpoint> = new Map();
    private summaries: Map<string, ConversationSummary> = new Map(); // summaryId -> summary
    private maxContextSize: number = 100000; // 기본 100K 문자
    private maxTokenSize: number = 50000; // 기본 50K 토큰

    // 삭제된 대화 범위 추적
    private conversationHistoryDeletedRange?: [number, number];

    // 이중 히스토리 구조 (향후 확장용)
    private apiConversationHistory: any[] = []; // API에 전송할 실제 대화 히스토리
    private uiMessages: ConversationEntry[] = []; // UI에 표시할 메시지들
    private summarizer?: ConversationSummarizer;

    private constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.loadHistory();
    }

    public static getInstance(context?: vscode.ExtensionContext): ContextHistoryManager {
        if (!ContextHistoryManager.instance && context) {
            ContextHistoryManager.instance = new ContextHistoryManager(context);
        }
        return ContextHistoryManager.instance!;
    }

    /**
     * 컨텍스트 업데이트 기록
     */
    public recordContextUpdate(
        messageIndex: number,
        updateType: ContextUpdateType,
        contextType: string,
        content: string,
        metadata?: Record<string, any>
    ): void {
        const update: ContextUpdate = {
            id: this.generateId(),
            messageIndex,
            timestamp: Date.now(),
            updateType,
            contextType,
            content,
            metadata
        };

        if (!this.updates.has(messageIndex)) {
            this.updates.set(messageIndex, []);
        }
        this.updates.get(messageIndex)!.push(update);

        this.saveHistory();
        console.log(`[ContextHistoryManager] Recorded context update: ${updateType} for message ${messageIndex}`);
    }

    /**
     * 특정 시점의 컨텍스트 복원
     */
    public restoreContextToCheckpoint(checkpointId: string): ContextData | null {
        const checkpoint = this.checkpoints.get(checkpointId);
        if (!checkpoint) {
            console.warn(`[ContextHistoryManager] Checkpoint not found: ${checkpointId}`);
            return null;
        }

        console.log(`[ContextHistoryManager] Restoring context to checkpoint: ${checkpointId}`);
        return checkpoint.contextData;
    }

    /**
     * 컨텍스트 체크포인트 생성
     */
    public createCheckpoint(
        messageIndex: number,
        contextData: ContextData
    ): string {
        const checkpointId = this.generateId();
        const updates = this.updates.get(messageIndex) || [];

        const checkpoint: ContextCheckpoint = {
            id: checkpointId,
            messageIndex,
            timestamp: Date.now(),
            contextData,
            updates
        };

        this.checkpoints.set(checkpointId, checkpoint);
        this.saveHistory();

        console.log(`[ContextHistoryManager] Created checkpoint: ${checkpointId} for message ${messageIndex}`);
        return checkpointId;
    }

    /**
     * 컨텍스트 히스토리 조회
     */
    public getContextHistory(messageIndex: number): ContextUpdate[] {
        return this.updates.get(messageIndex) || [];
    }

    /**
     * 컨텍스트 크기 확인
     */
    public checkContextSize(contextData?: ContextData, conversationHistory?: ConversationEntry[]): ContextSizeInfo {
        let currentSize = 0;
        let tokenCount = 0;

        // 컨텍스트 데이터 크기 계산
        if (contextData) {
            const contextStr = this.serializeContext(contextData);
            currentSize = contextStr.length;
            tokenCount = estimateTokens(contextStr);
        }

        // 대화 히스토리 크기 계산
        if (conversationHistory) {
            for (const entry of conversationHistory) {
                currentSize += entry.content.length;
                tokenCount += estimateTokens(entry.content);
            }
        }

        const isExceeded = currentSize > this.maxContextSize || tokenCount > this.maxTokenSize;

        return {
            currentSize,
            maxSize: this.maxContextSize,
            isExceeded,
            tokenCount,
            characterCount: currentSize
        };
    }

    /**
     * 삭제된 대화 범위 가져오기
     */
    public getConversationHistoryDeletedRange(): ConversationHistoryDeletedRange {
        return this.conversationHistoryDeletedRange;
    }

    /**
     * 삭제된 대화 범위 설정
     */
    public setConversationHistoryDeletedRange(range: ConversationHistoryDeletedRange): void {
        this.conversationHistoryDeletedRange = range;
        this.saveHistory();
        console.log(`[ContextHistoryManager] Set deleted range: ${range ? `[${range[0]}, ${range[1]}]` : 'none'}`);
    }

    /**
     * 다음 삭제 범위 계산
     * keep 전략에 따라 삭제할 메시지 범위를 계산
     */
    public getNextTruncationRange(
        apiMessages: any[],
        currentDeletedRange: ConversationHistoryDeletedRange,
        keep: 'none' | 'lastTwo' | 'half' | 'quarter' = 'half'
    ): [number, number] {
        // 첫 번째 user-assistant 페어는 항상 유지 (인덱스 0, 1)
        const rangeStartIndex = 2;
        const startOfRest = currentDeletedRange ? currentDeletedRange[1] + 1 : 2;

        let messagesToRemove: number;
        const totalMessages = apiMessages.length - startOfRest;

        switch (keep) {
            case 'none':
                // 모든 메시지 삭제 (첫 페어 제외)
                messagesToRemove = Math.max(totalMessages, 0);
                break;
            case 'lastTwo':
                // 마지막 2개만 유지
                messagesToRemove = Math.max(totalMessages - 2, 0);
                break;
            case 'half':
                // 절반 유지
                messagesToRemove = Math.floor(totalMessages / 2);
                break;
            case 'quarter':
                // 1/4만 유지
                messagesToRemove = Math.floor(totalMessages * 3 / 4);
                break;
            default:
                messagesToRemove = Math.floor(totalMessages / 2);
        }

        // 짝수 개의 메시지만 삭제 (user-assistant 페어 유지)
        if (messagesToRemove % 2 !== 0 && messagesToRemove > 0) {
            messagesToRemove -= 1;
        }

        const endIndex = startOfRest + messagesToRemove - 1;

        if (messagesToRemove === 0) {
            return currentDeletedRange || [rangeStartIndex, rangeStartIndex - 1];
        }

        return [rangeStartIndex, endIndex];
    }

    /**
     * 메시지 히스토리 인덱스 정보 가져오기
     */
    public getMessageHistoryIndex(messageIndex: number): MessageHistoryIndex {
        return {
            conversationHistoryIndex: messageIndex < this.apiConversationHistory.length ? messageIndex : undefined,
            conversationHistoryDeletedRange: this.conversationHistoryDeletedRange
        };
    }

    /**
     * API 히스토리 가져오기
     */
    public getApiConversationHistory(): any[] {
        return this.apiConversationHistory;
    }

    /**
     * API 히스토리 설정
     */
    public setApiConversationHistory(history: any[]): void {
        this.apiConversationHistory = history;
        this.saveHistory();
    }

    /**
     * UI 메시지 가져오기
     */
    public getUiMessages(): ConversationEntry[] {
        return this.uiMessages;
    }

    /**
     * UI 메시지 설정
     */
    public setUiMessages(messages: ConversationEntry[]): void {
        this.uiMessages = messages;
        this.saveHistory();
    }

    /**
     * Conversation Summarizer 설정
     */
    public setSummarizer(summarizer: ConversationSummarizer): void {
        this.summarizer = summarizer;
    }

    /**
     * 자동 요약 트리거
     */
    public async triggerAutoSummarization(
        conversationHistory: ConversationEntry[],
        contextData?: ContextData,
        taskProgress?: TaskProgress
    ): Promise<ConversationSummary | null> {
        if (!this.summarizer) {
            console.warn('[ContextHistoryManager] Summarizer not set, cannot summarize');
            return null;
        }

        const sizeInfo = this.checkContextSize(contextData, conversationHistory);

        if (!sizeInfo.isExceeded) {
            console.log('[ContextHistoryManager] Context size within limits, no summarization needed');
            return null;
        }

        console.log(`[ContextHistoryManager] Context size exceeded (${sizeInfo.characterCount}/${sizeInfo.maxSize}), triggering summarization...`);

        try {
            const summary = await this.summarizer.summarizeConversation(conversationHistory, {
                includeTechnicalDetails: true,
                includeCodeSnippets: true,
                includeFileChanges: true
            }, taskProgress);

            // 요약 후 처리: 삭제 범위 업데이트
            const apiHistory = this.getApiConversationHistory();
            const currentDeletedRange = this.getConversationHistoryDeletedRange();
            const newDeletedRange = this.getNextTruncationRange(
                apiHistory,
                currentDeletedRange,
                'none' // 요약 후에는 모든 메시지를 삭제하고 요약으로 대체
            );
            this.setConversationHistoryDeletedRange(newDeletedRange);

            // 요약 저장
            this.summaries.set(summary.id, summary);
            this.saveHistory();

            console.log(`[ContextHistoryManager] Summarization completed: ${summary.id}`);
            return summary;
        } catch (error) {
            console.error('[ContextHistoryManager] Summarization failed:', error);
            return null;
        }
    }

    /**
     * 저장된 요약 가져오기
     */
    public getSummary(summaryId: string): ConversationSummary | undefined {
        return this.summaries.get(summaryId);
    }

    /**
     * 모든 요약 가져오기
     */
    public getAllSummaries(): ConversationSummary[] {
        return Array.from(this.summaries.values());
    }

    /**
     * 요약된 세션 재개 프롬프트 생성
     */
    public createContinuationPrompt(summary: ConversationSummary): string {
        const lines: string[] = [];

        lines.push('## 이전 대화 요약');
        lines.push(`이 세션은 컨텍스트가 부족해진 이전 대화에서 계속됩니다. 대화 요약은 아래와 같습니다:\n`);
        lines.push(`**주요 요청**: ${summary.primaryRequest}`);

        if (summary.keyConcepts.length > 0) {
            lines.push(`**핵심 개념**: ${summary.keyConcepts.join(', ')}`);
        }

        if (summary.filesModified.length > 0) {
            lines.push(`**수정된 파일**: ${summary.filesModified.join(', ')}`);
        }
        if (summary.filesCreated.length > 0) {
            lines.push(`**생성된 파일**: ${summary.filesCreated.join(', ')}`);
        }
        if (summary.filesDeleted.length > 0) {
            lines.push(`**삭제된 파일**: ${summary.filesDeleted.join(', ')}`);
        }

        if (summary.pendingTasks.length > 0) {
            lines.push(`**대기 중인 작업**: ${summary.pendingTasks.join(', ')}`);
        }

        if (summary.currentWork) {
            lines.push(`**현재 작업**: ${summary.currentWork}`);
        }

        if (summary.nextStep) {
            lines.push(`**다음 단계**: ${summary.nextStep}`);
        }

        if (summary.requiredFiles.length > 0) {
            lines.push(`**필요한 파일**: ${summary.requiredFiles.join(', ')}`);
        }

        if (summary.technicalDetails) {
            lines.push(`\n**기술 세부사항**:\n${summary.technicalDetails}`);
        }

        lines.push(`\n이전 대화를 이어서 계속 진행해주세요. 사용자에게 추가 질문을 하지 말고, 마지막 작업을 계속 진행하세요.`);

        return lines.join('\n');
    }

    /**
     * 최대 컨텍스트 크기 설정
     */
    public setMaxContextSize(maxSize: number, maxTokens?: number): void {
        this.maxContextSize = maxSize;
        if (maxTokens !== undefined) {
            this.maxTokenSize = maxTokens;
        }
        console.log(`[ContextHistoryManager] Max context size set: ${maxSize} chars, ${this.maxTokenSize} tokens`);
    }

    /**
     * 최대 토큰 크기 가져오기
     */
    public getMaxTokenSize(): number {
        return this.maxTokenSize;
    }

    /**
     * 히스토리 초기화
     */
    public clearHistory(): void {
        this.updates.clear();
        this.checkpoints.clear();
        this.summaries.clear();
        this.conversationHistoryDeletedRange = undefined;
        this.apiConversationHistory = [];
        this.uiMessages = [];
        this.saveHistory();
        console.log('[ContextHistoryManager] History cleared');
    }

    /**
     * 컨텍스트를 문자열로 직렬화
     */
    private serializeContext(contextData: ContextData): string {
        const parts: string[] = [];

        if (contextData.file?.content) {
            parts.push(`File: ${contextData.file.path}\n${contextData.file.content}`);
        }
        if (contextData.selection?.text) {
            parts.push(`Selection: ${contextData.selection.text}`);
        }
        if (contextData.cursor?.surroundingLines) {
            parts.push(`Cursor: ${contextData.cursor.surroundingLines.join('\n')}`);
        }
        if (contextData.terminal?.lastOutput) {
            parts.push(`Terminal: ${contextData.terminal.lastOutput}`);
        }
        if (contextData.errors) {
            for (const error of contextData.errors) {
                parts.push(`Error: ${error.message}`);
            }
        }

        return parts.join('\n\n');
    }

    /**
     * 히스토리 저장
     */
    private saveHistory(): void {
        try {
            const historyData = {
                updates: Array.from(this.updates.entries()),
                checkpoints: Array.from(this.checkpoints.entries()),
                summaries: Array.from(this.summaries.entries()),
                conversationHistoryDeletedRange: this.conversationHistoryDeletedRange,
                // API 히스토리는 크기가 클 수 있으므로 선택적으로 저장
                // apiConversationHistory: this.apiConversationHistory,
                // uiMessages: this.uiMessages
            };
            this.context.globalState.update('contextHistory', historyData);
        } catch (error) {
            console.error('[ContextHistoryManager] Failed to save history:', error);
        }
    }

    /**
     * 히스토리 로드
     */
    private loadHistory(): void {
        try {
            const historyData = this.context.globalState.get<{
                updates: [number, ContextUpdate[]][];
                checkpoints: [string, ContextCheckpoint][];
                summaries?: [string, ConversationSummary][];
                conversationHistoryDeletedRange?: [number, number];
            }>('contextHistory');

            if (historyData) {
                try {
                    // 이전 버전 호환성: id가 없는 ContextUpdate에 id 추가
                    const migratedUpdates: [number, ContextUpdate[]][] = historyData.updates.map(([messageIndex, updates]) => {
                        const migratedUpdateList = updates.map(update => {
                            if (!update.id) {
                                // id가 없으면 생성
                                return {
                                    ...update,
                                    id: this.generateId()
                                };
                            }
                            return update;
                        });
                        return [messageIndex, migratedUpdateList];
                    });

                    this.updates = new Map(migratedUpdates);
                    this.checkpoints = new Map(historyData.checkpoints);
                    if (historyData.summaries) {
                        this.summaries = new Map(historyData.summaries);
                    }
                    this.conversationHistoryDeletedRange = historyData.conversationHistoryDeletedRange;
                    console.log(`[ContextHistoryManager] Loaded history: ${this.updates.size} message updates, ${this.checkpoints.size} checkpoints, ${this.summaries.size} summaries, deleted range: ${this.conversationHistoryDeletedRange ? `[${this.conversationHistoryDeletedRange[0]}, ${this.conversationHistoryDeletedRange[1]}]` : 'none'}`);
                } catch (migrationError) {
                    console.error('[ContextHistoryManager] Failed to migrate history data:', migrationError);
                    // 마이그레이션 실패 시 빈 상태로 초기화
                    this.updates = new Map();
                    this.checkpoints = new Map();
                    this.summaries = new Map();
                    this.conversationHistoryDeletedRange = undefined;
                }
            } else {
                console.log('[ContextHistoryManager] No history data found, starting fresh');
            }
        } catch (error) {
            console.error('[ContextHistoryManager] Failed to load history:', error);
            // 에러 발생 시 빈 상태로 초기화
            this.updates = new Map();
            this.checkpoints = new Map();
            this.summaries = new Map();
            this.conversationHistoryDeletedRange = undefined;
        }
    }

    /**
     * ID 생성
     */
    private generateId(): string {
        return `ctx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

