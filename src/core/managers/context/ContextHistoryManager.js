/**
 * Context History Manager
 * 컨텍스트 변경사항 추적, 체크포인트 관리, 자동 요약 트리거
 */
import { estimateTokens } from '../../../utils';
export class ContextHistoryManager {
    static instance;
    context;
    updates = new Map(); // messageIndex -> updates
    checkpoints = new Map();
    summaries = new Map(); // summaryId -> summary
    maxContextSize = 100000; // 기본 100K 문자
    maxTokenSize = 50000; // 기본 50K 토큰
    // 삭제된 대화 범위 추적
    conversationHistoryDeletedRange;
    // 이중 히스토리 구조 (향후 확장용)
    apiConversationHistory = []; // API에 전송할 실제 대화 히스토리
    uiMessages = []; // UI에 표시할 메시지들
    constructor(context) {
        this.context = context;
        this.loadHistory();
    }
    static getInstance(context) {
        if (!ContextHistoryManager.instance && context) {
            ContextHistoryManager.instance = new ContextHistoryManager(context);
        }
        return ContextHistoryManager.instance;
    }
    /**
     * 컨텍스트 업데이트 기록
     */
    recordContextUpdate(messageIndex, updateType, contextType, content, metadata) {
        const update = {
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
        this.updates.get(messageIndex).push(update);
        this.saveHistory();
        console.log(`[ContextHistoryManager] Recorded context update: ${updateType} for message ${messageIndex}`);
    }
    /**
     * 특정 시점의 컨텍스트 복원
     */
    restoreContextToCheckpoint(checkpointId) {
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
    createCheckpoint(messageIndex, contextData) {
        const checkpointId = this.generateId();
        const updates = this.updates.get(messageIndex) || [];
        const checkpoint = {
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
    getContextHistory(messageIndex) {
        return this.updates.get(messageIndex) || [];
    }
    /**
     * 컨텍스트 크기 확인
     */
    checkContextSize(contextData, conversationHistory) {
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
                const content = entry.userRequest + (entry.assistantResponse || '');
                currentSize += content.length;
                tokenCount += estimateTokens(content);
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
    getConversationHistoryDeletedRange() {
        return this.conversationHistoryDeletedRange;
    }
    /**
     * 삭제된 대화 범위 설정
     */
    setConversationHistoryDeletedRange(range) {
        this.conversationHistoryDeletedRange = range;
        this.saveHistory();
        console.log(`[ContextHistoryManager] Set deleted range: ${range ? `[${range[0]}, ${range[1]}]` : 'none'}`);
    }
    /**
     * 다음 삭제 범위 계산
     * keep 전략에 따라 삭제할 메시지 범위를 계산
     */
    getNextTruncationRange(apiMessages, currentDeletedRange, keep = 'half') {
        // 첫 번째 user-assistant 페어는 항상 유지 (인덱스 0, 1)
        const rangeStartIndex = 2;
        const startOfRest = currentDeletedRange ? currentDeletedRange[1] + 1 : 2;
        let messagesToRemove;
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
    getMessageHistoryIndex(messageIndex) {
        return {
            conversationHistoryIndex: messageIndex < this.apiConversationHistory.length ? messageIndex : undefined,
            conversationHistoryDeletedRange: this.conversationHistoryDeletedRange
        };
    }
    /**
     * API 히스토리 가져오기
     */
    getApiConversationHistory() {
        return this.apiConversationHistory;
    }
    /**
     * API 히스토리 설정
     */
    setApiConversationHistory(history) {
        this.apiConversationHistory = history;
        this.saveHistory();
    }
    /**
     * UI 메시지 가져오기
     */
    getUiMessages() {
        return this.uiMessages;
    }
    /**
     * UI 메시지 설정
     */
    setUiMessages(messages) {
        this.uiMessages = messages;
        this.saveHistory();
    }
    /**
     * 최대 컨텍스트 크기 설정
     */
    setMaxContextSize(maxSize, maxTokens) {
        this.maxContextSize = maxSize;
        if (maxTokens !== undefined) {
            this.maxTokenSize = maxTokens;
        }
        console.log(`[ContextHistoryManager] Max context size set: ${maxSize} chars, ${this.maxTokenSize} tokens`);
    }
    /**
     * 최대 토큰 크기 가져오기
     */
    getMaxTokenSize() {
        return this.maxTokenSize;
    }
    /**
     * 히스토리 초기화
     */
    clearHistory() {
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
    serializeContext(contextData) {
        const parts = [];
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
    saveHistory() {
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
        }
        catch (error) {
            console.error('[ContextHistoryManager] Failed to save history:', error);
        }
    }
    /**
     * 히스토리 로드
     */
    loadHistory() {
        try {
            const historyData = this.context.globalState.get('contextHistory');
            if (historyData) {
                try {
                    // 이전 버전 호환성: id가 없는 ContextUpdate에 id 추가
                    const migratedUpdates = historyData.updates.map(([messageIndex, updates]) => {
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
                }
                catch (migrationError) {
                    console.error('[ContextHistoryManager] Failed to migrate history data:', migrationError);
                    // 마이그레이션 실패 시 빈 상태로 초기화
                    this.updates = new Map();
                    this.checkpoints = new Map();
                    this.summaries = new Map();
                    this.conversationHistoryDeletedRange = undefined;
                }
            }
            else {
                console.log('[ContextHistoryManager] No history data found, starting fresh');
            }
        }
        catch (error) {
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
    generateId() {
        return `ctx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    // ===== 대화 히스토리 영구 저장 개선 =====
    /**
     * 대화 히스토리를 파일로 내보내기
     */
    async exportHistoryToFile(filePath) {
        try {
            const historyData = {
                apiConversationHistory: this.apiConversationHistory,
                uiMessages: this.uiMessages,
                updates: Array.from(this.updates.entries()),
                checkpoints: Array.from(this.checkpoints.entries()),
                summaries: Array.from(this.summaries.entries()),
                conversationHistoryDeletedRange: this.conversationHistoryDeletedRange,
                exportedAt: Date.now(),
                version: '1.0.0'
            };
            const fs = await import('fs/promises');
            await fs.writeFile(filePath, JSON.stringify(historyData, null, 2), 'utf-8');
            console.log(`[ContextHistoryManager] Exported history to: ${filePath}`);
        }
        catch (error) {
            console.error('[ContextHistoryManager] Failed to export history:', error);
            throw error;
        }
    }
    /**
     * 파일에서 대화 히스토리 가져오기
     */
    async importHistoryFromFile(filePath) {
        try {
            const fs = await import('fs/promises');
            const data = await fs.readFile(filePath, 'utf-8');
            const historyData = JSON.parse(data);
            // 버전 체크 (향후 호환성)
            if (historyData.version !== '1.0.0') {
                console.warn('[ContextHistoryManager] History version mismatch, attempting migration');
            }
            // 데이터 복원
            this.apiConversationHistory = historyData.apiConversationHistory || [];
            this.uiMessages = historyData.uiMessages || [];
            this.updates = new Map(historyData.updates || []);
            this.checkpoints = new Map(historyData.checkpoints || []);
            this.summaries = new Map(historyData.summaries || []);
            this.conversationHistoryDeletedRange = historyData.conversationHistoryDeletedRange;
            this.saveHistory();
            console.log(`[ContextHistoryManager] Imported history from: ${filePath}`);
        }
        catch (error) {
            console.error('[ContextHistoryManager] Failed to import history:', error);
            throw error;
        }
    }
    /**
     * 대화 히스토리 백업 생성
     */
    async createBackup() {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupId = `backup_${timestamp}`;
            const backupData = {
                id: backupId,
                apiConversationHistory: this.apiConversationHistory,
                uiMessages: this.uiMessages,
                updates: Array.from(this.updates.entries()),
                checkpoints: Array.from(this.checkpoints.entries()),
                summaries: Array.from(this.summaries.entries()),
                conversationHistoryDeletedRange: this.conversationHistoryDeletedRange,
                createdAt: Date.now()
            };
            await this.context.globalState.update(`contextHistory.backup.${backupId}`, backupData);
            console.log(`[ContextHistoryManager] Created backup: ${backupId}`);
            return backupId;
        }
        catch (error) {
            console.error('[ContextHistoryManager] Failed to create backup:', error);
            throw error;
        }
    }
    /**
     * 백업에서 복원
     */
    async restoreFromBackup(backupId) {
        try {
            const backupData = this.context.globalState.get(`contextHistory.backup.${backupId}`);
            if (!backupData) {
                throw new Error(`Backup not found: ${backupId}`);
            }
            // 데이터 복원
            this.apiConversationHistory = backupData.apiConversationHistory || [];
            this.uiMessages = backupData.uiMessages || [];
            this.updates = new Map(backupData.updates || []);
            this.checkpoints = new Map(backupData.checkpoints || []);
            this.summaries = new Map(backupData.summaries || []);
            this.conversationHistoryDeletedRange = backupData.conversationHistoryDeletedRange;
            this.saveHistory();
            console.log(`[ContextHistoryManager] Restored from backup: ${backupId}`);
        }
        catch (error) {
            console.error('[ContextHistoryManager] Failed to restore from backup:', error);
            throw error;
        }
    }
    /**
     * 모든 백업 목록 가져오기
     */
    async listBackups() {
        try {
            const keys = this.context.globalState.keys();
            const backups = [];
            for (const key of keys) {
                if (key.startsWith('contextHistory.backup.')) {
                    const backupData = this.context.globalState.get(key);
                    if (backupData) {
                        backups.push({
                            id: backupData.id,
                            createdAt: backupData.createdAt
                        });
                    }
                }
            }
            // 최신 순으로 정렬
            backups.sort((a, b) => b.createdAt - a.createdAt);
            return backups;
        }
        catch (error) {
            console.error('[ContextHistoryManager] Failed to list backups:', error);
            return [];
        }
    }
    /**
     * 백업 삭제
     */
    async deleteBackup(backupId) {
        try {
            await this.context.globalState.update(`contextHistory.backup.${backupId}`, undefined);
            console.log(`[ContextHistoryManager] Deleted backup: ${backupId}`);
        }
        catch (error) {
            console.error('[ContextHistoryManager] Failed to delete backup:', error);
            throw error;
        }
    }
    /**
     * 대화 히스토리 통계 가져오기
     */
    getHistoryStats() {
        return {
            totalApiMessages: this.apiConversationHistory.length,
            totalUiMessages: this.uiMessages.length,
            totalUpdates: Array.from(this.updates.values()).reduce((sum, arr) => sum + arr.length, 0),
            totalCheckpoints: this.checkpoints.size,
            totalSummaries: this.summaries.size,
            deletedRange: this.conversationHistoryDeletedRange
        };
    }
}
//# sourceMappingURL=ContextHistoryManager.js.map