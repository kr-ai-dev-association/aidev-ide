/**
 * Conversation Summarizer
 * 대화 요약 생성, 요약 형식 검증, 필수 정보 추출
 */

import { ConversationEntry } from '../state/types';
import {
    ConversationSummary,
    SummarizationOptions,
    TaskProgress
} from './types/contextHistory';
import { LLMApiClient } from '../model/LLMApiClient';
import { getSummarizationPrompt } from './prompts/task/summarize';
import { estimateTokens } from '../../../utils';

export class ConversationSummarizer {
    private llmClient?: LLMApiClient;

    /**
     * LLM 클라이언트 설정
     */
    public setLLMClient(llmClient: LLMApiClient): void {
        this.llmClient = llmClient;
    }

    /**
     * 대화 요약 생성
     */
    public async summarizeConversation(
        messages: ConversationEntry[],
        options: SummarizationOptions,
        taskProgress?: TaskProgress
    ): Promise<ConversationSummary> {
        if (!this.llmClient) {
            throw new Error('LLM client not set');
        }

        // 대화 히스토리를 텍스트로 변환
        const conversationText = this.formatConversationHistory(messages);

        // 요약 프롬프트 생성
        const systemPrompt = getSummarizationPrompt(options, taskProgress);

        // LLM 호출
        console.log('[ConversationSummarizer] Requesting summarization from LLM...');
        const summaryText = await this.llmClient.sendMessageWithSystemPrompt(
            systemPrompt,
            [{ text: conversationText }],
            {
                temperature: 0.3, // 요약은 일관성 있게
                maxTokens: 2000
            }
        );

        // 요약 파싱
        const summary = this.parseSummary(summaryText, messages);

        // 요약 형식 검증
        if (!this.validateSummaryFormat(summary)) {
            console.warn('[ConversationSummarizer] Summary format validation failed, attempting to fix...');
            return this.fixSummaryFormat(summary, messages);
        }

        console.log('[ConversationSummarizer] Summary generated successfully');
        return summary;
    }

    /**
     * 요약 형식 검증
     */
    public validateSummaryFormat(summary: ConversationSummary): boolean {
        // 필수 필드 확인
        if (!summary.primaryRequest || summary.primaryRequest.trim() === '') {
            return false;
        }

        // 배열 필드 확인
        if (!Array.isArray(summary.keyConcepts)) {
            return false;
        }
        if (!Array.isArray(summary.filesModified)) {
            return false;
        }
        if (!Array.isArray(summary.filesCreated)) {
            return false;
        }
        if (!Array.isArray(summary.filesDeleted)) {
            return false;
        }
        if (!Array.isArray(summary.pendingTasks)) {
            return false;
        }
        if (!Array.isArray(summary.problemSolving)) {
            return false;
        }
        if (!Array.isArray(summary.taskEvolution)) {
            return false;
        }
        if (!Array.isArray(summary.requiredFiles)) {
            return false;
        }

        return true;
    }

    /**
     * 요약에서 필수 정보 추출
     */
    public extractEssentialInfo(summary: ConversationSummary): {
        primaryRequest: string;
        keyConcepts: string[];
        filesModified: string[];
        pendingTasks: string[];
        nextSteps: string[];
    } {
        return {
            primaryRequest: summary.primaryRequest,
            keyConcepts: summary.keyConcepts,
            filesModified: summary.filesModified,
            pendingTasks: summary.pendingTasks,
            nextSteps: summary.nextStep ? [summary.nextStep] : []
        };
    }

    /**
     * 대화 히스토리를 텍스트로 포맷팅
     */
    private formatConversationHistory(messages: ConversationEntry[]): string {
        const lines: string[] = [];

        for (const message of messages) {
            const role = message.type === 'user' ? '사용자' : message.type === 'assistant' ? 'AI' : '시스템';
            lines.push(`[${role}] ${message.content}`);
            if (message.metadata) {
                lines.push(`(메타데이터: ${JSON.stringify(message.metadata)})`);
            }
        }

        return lines.join('\n\n');
    }

    /**
     * 요약 텍스트 파싱
     */
    private parseSummary(summaryText: string, messages: ConversationEntry[]): ConversationSummary {
        const summary: ConversationSummary = {
            id: this.generateId(),
            createdAt: Date.now(),
            messageRange: {
                startIndex: 0,
                endIndex: messages.length - 1
            },
            primaryRequest: '',
            keyConcepts: [],
            filesModified: [],
            filesCreated: [],
            filesDeleted: [],
            pendingTasks: [],
            problemSolving: [],
            taskEvolution: [],
            currentWork: '',
            nextStep: '',
            requiredFiles: []
        };

        // 간단한 파싱 로직 (실제로는 더 정교한 파싱 필요)
        const lines = summaryText.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            if (line.includes('주요 요청') || line.includes('Primary Request') || line.includes('1.')) {
                summary.primaryRequest = this.extractValue(line) || this.extractMultilineValue(lines, i) || '';
            } else if (line.includes('핵심 개념') || line.includes('Key Technical Concepts') || line.includes('2.')) {
                summary.keyConcepts = this.extractList(lines, i);
            } else if (line.includes('수정된 파일') || line.includes('Files Modified') || line.includes('3.')) {
                summary.filesModified = this.extractList(lines, i);
            } else if (line.includes('생성된 파일') || line.includes('Files Created')) {
                summary.filesCreated = this.extractList(lines, i);
            } else if (line.includes('삭제된 파일') || line.includes('Files Deleted')) {
                summary.filesDeleted = this.extractList(lines, i);
            } else if (line.includes('대기 중인 작업') || line.includes('Pending Tasks') || line.includes('5.')) {
                summary.pendingTasks = this.extractList(lines, i);
            } else if (line.includes('문제 해결') || line.includes('Problem Solving') || line.includes('4.')) {
                summary.problemSolving = this.extractList(lines, i);
            } else if (line.includes('작업 진화') || line.includes('Task Evolution') || line.includes('6.')) {
                summary.taskEvolution = this.extractList(lines, i);
            } else if (line.includes('현재 작업') || line.includes('Current Work') || line.includes('7.')) {
                summary.currentWork = this.extractValue(line) || this.extractMultilineValue(lines, i) || '';
            } else if (line.includes('다음 단계') || line.includes('Next Step') || line.includes('8.')) {
                summary.nextStep = this.extractValue(line) || this.extractMultilineValue(lines, i) || '';
            } else if (line.includes('필요한 파일') || line.includes('Required Files') || line.includes('9.')) {
                summary.requiredFiles = this.extractList(lines, i);
            } else if (line.includes('기술 세부사항') || line.includes('Technical Details') || line.includes('10.')) {
                summary.technicalDetails = this.extractMultilineValue(lines, i);
            } else if (line.includes('코드 스니펫') || line.includes('Code Snippets') || line.includes('11.')) {
                const snippets = this.extractList(lines, i);
                summary.codeSnippets = snippets;
            }
        }

        // 파싱 실패 시 기본값 설정
        if (!summary.primaryRequest) {
            summary.primaryRequest = messages.find(m => m.type === 'user')?.content || '요약 생성됨';
        }

        return summary;
    }

    /**
     * 값 추출 (예: "주요 요청: React 컴포넌트 생성" -> "React 컴포넌트 생성")
     */
    private extractValue(line: string): string {
        const match = line.match(/[:：]\s*(.+)/);
        return match ? match[1].trim() : '';
    }

    /**
     * 여러 줄 값 추출
     */
    private extractMultilineValue(lines: string[], startIndex: number): string {
        const values: string[] = [];
        let i = startIndex + 1;

        while (i < lines.length && lines[i].trim() !== '' && !lines[i].match(/^\d+\./)) {
            const line = lines[i].trim();
            if (line && !line.match(/^[-*•]/)) {
                values.push(line);
            }
            i++;
        }

        return values.join('\n');
    }

    /**
     * 리스트 추출 (다음 줄들에서 리스트 항목 추출)
     */
    private extractList(lines: string[], startIndex: number): string[] {
        const items: string[] = [];
        let i = startIndex + 1;

        while (i < lines.length && lines[i].trim() !== '' && !lines[i].match(/^\d+\./)) {
            const line = lines[i].trim();
            // 리스트 마커 제거 (-, *, •, 1., etc.)
            const cleaned = line.replace(/^[-*•]\s*/, '').replace(/^\d+\.\s*/, '').trim();
            if (cleaned) {
                items.push(cleaned);
            }
            i++;
        }

        return items;
    }

    /**
     * 요약 형식 수정 (파싱 실패 시)
     */
    private fixSummaryFormat(summary: ConversationSummary, messages: ConversationEntry[]): ConversationSummary {
        // 기본값으로 채우기
        if (!summary.primaryRequest) {
            summary.primaryRequest = messages.find(m => m.type === 'user')?.content || '요약 생성됨';
        }

        // 배열 필드 초기화
        if (!Array.isArray(summary.keyConcepts)) {
            summary.keyConcepts = [];
        }
        if (!Array.isArray(summary.filesModified)) {
            summary.filesModified = [];
        }
        if (!Array.isArray(summary.filesCreated)) {
            summary.filesCreated = [];
        }
        if (!Array.isArray(summary.filesDeleted)) {
            summary.filesDeleted = [];
        }
        if (!Array.isArray(summary.pendingTasks)) {
            summary.pendingTasks = [];
        }
        if (!Array.isArray(summary.problemSolving)) {
            summary.problemSolving = [];
        }
        if (!Array.isArray(summary.taskEvolution)) {
            summary.taskEvolution = [];
        }
        if (!Array.isArray(summary.requiredFiles)) {
            summary.requiredFiles = [];
        }

        return summary;
    }

    /**
     * ID 생성
     */
    private generateId(): string {
        return `summary_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

