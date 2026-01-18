/**
 * ResponseProcessor
 * LLM 응답 처리, 검증, 정제를 담당하는 클래스
 */

import { getSimpleSummaryPrompt } from '../../context/prompts/task';
import { LLMManager } from '../../model/LLMManager';
import { StringUtils } from '../../../utils/StringUtils';
import { AgentConfig } from '../../../config/AgentConfig';

export class ResponseProcessor {
    private llmManager: LLMManager;

    constructor(llmManager: LLMManager) {
        this.llmManager = llmManager;
    }

    /**
     * LLM 응답에서 텍스트 추출 (thinking 태그 제거)
     */
    public extractResponseText(llmResponse: string): string {
        if (!llmResponse) return '';

        // StringUtils를 사용하여 모든 패턴 제거
        return StringUtils.cleanText(llmResponse, {
            removeThinking: true,
            removeNaturalLanguage: true,
            removeSystemMessages: true,
            removeToolTags: true,
            removeJsonThinking: true,
            extractJson: true
        });
    }

    /**
     * 파일 목록을 기반으로 요약 생성
     *
     * ✅ 수정: 디스크 검증 제거 (InlineDiffManager pending 상태 파일도 포함)
     * - 파일이 pending 상태(diff 표시 중)일 때 디스크에 없어도 요약 생성
     * - createdFiles/modifiedFiles는 이미 도구 실행 시 수집된 정확한 목록
     */
    public async generateVerifiedSummary(
        originalSummary: string,
        createdFiles: string[],
        modifiedFiles: string[],
        workspaceRoot: string,
        systemPrompt: string,
        accumulatedParts: any[],
        abortSignal?: AbortSignal
    ): Promise<string> {
        // ✅ 디스크 검증 제거: pending 상태 파일도 포함하여 요약 생성
        const verifiedCreated = [...createdFiles];
        const verifiedModified = [...modifiedFiles];

        // 파일 목록이 없으면 기본 메시지 반환
        if (verifiedCreated.length === 0 && verifiedModified.length === 0) {
            return originalSummary || AgentConfig.DEFAULT_COMPLETION_MESSAGE;
        }

        // 원본 요약이 있으면 그대로 반환 (파일 목록 추가 제거)
        if (originalSummary && originalSummary.trim()) {
            return originalSummary;
        }

        // 원본 요약이 없는 경우: LLM에게 요약 생성 요청
        return await this.requestLLMSummary(verifiedCreated, verifiedModified, accumulatedParts, abortSignal);
    }

    /**
     * LLM에게 요약 요청 (재시도 로직 포함)
     */
    private async requestLLMSummary(
        createdFiles: string[],
        modifiedFiles: string[],
        accumulatedParts: any[],
        abortSignal?: AbortSignal,
        retryCount: number = 0
    ): Promise<string> {
        const MAX_RETRIES = 2;
        const summaryPrompt = getSimpleSummaryPrompt(createdFiles, modifiedFiles);

        try {
            // 첫 시도: accumulated context 포함
            // 재시도: accumulated context 없이 (도구 태그 응답 방지)
            const contextParts = retryCount === 0 ? accumulatedParts : [];

            console.log(`[ResponseProcessor] Requesting LLM summary (attempt ${retryCount + 1}/${MAX_RETRIES + 1}, contextParts=${contextParts.length})`);

            const verifiedSummary = await this.llmManager.sendMessageWithSystemPrompt(
                summaryPrompt,
                contextParts,
                { signal: abortSignal }
            );

            // ✅ LLM이 도구 태그로 응답한 경우
            const hasToolTags = /<(create_file|update_file|remove_file|read_file|run_command|list_files|search_files|ripgrep_search)>/i.test(verifiedSummary);
            if (hasToolTags) {
                console.warn(`[ResponseProcessor] LLM responded with tool tags (attempt ${retryCount + 1})`);

                // 재시도 가능하면 context 없이 재시도
                if (retryCount < MAX_RETRIES) {
                    console.log('[ResponseProcessor] Retrying without accumulated context...');
                    return await this.requestLLMSummary(createdFiles, modifiedFiles, accumulatedParts, abortSignal, retryCount + 1);
                }

                // 재시도 실패: 도구 태그 제거 후 텍스트만 추출 시도
                console.warn('[ResponseProcessor] Max retries reached. Extracting text from response.');
                const cleanedText = this.extractTextFromToolResponse(verifiedSummary);
                if (cleanedText.trim()) {
                    return cleanedText;
                }

                // 최후의 수단: 기본 요약 생성
                return this.generateDefaultSummary(createdFiles, modifiedFiles);
            }

            // StringUtils를 사용하여 정제 (자연어는 유지)
            const summaryText = StringUtils.cleanText(verifiedSummary, {
                removeThinking: true,
                removeNaturalLanguage: false,  // ✅ 요약은 자연어이므로 유지
                removeSystemMessages: true,
                removeToolTags: true,
                removeJsonThinking: true,
                extractJson: false  // ✅ JSON 추출 불필요
            });

            // 정제 후 빈 문자열이면 기본 요약 생성
            if (!summaryText.trim()) {
                console.warn('[ResponseProcessor] Summary text is empty after cleaning.');
                if (retryCount < MAX_RETRIES) {
                    return await this.requestLLMSummary(createdFiles, modifiedFiles, accumulatedParts, abortSignal, retryCount + 1);
                }
                return this.generateDefaultSummary(createdFiles, modifiedFiles);
            }

            return summaryText.trim();
        } catch (error) {
            console.warn('[ResponseProcessor] Failed to generate summary:', error);
            if (retryCount < MAX_RETRIES) {
                return await this.requestLLMSummary(createdFiles, modifiedFiles, accumulatedParts, abortSignal, retryCount + 1);
            }
            return this.generateDefaultSummary(createdFiles, modifiedFiles);
        }
    }

    /**
     * 도구 태그 응답에서 텍스트만 추출
     */
    private extractTextFromToolResponse(response: string): string {
        // 도구 태그 제거
        let text = response.replace(/<(create_file|update_file|remove_file|read_file|run_command|list_files|search_files|ripgrep_search)>[\s\S]*?<\/\1>/gi, '');
        // thinking 태그 제거
        text = text.replace(/<(think|thinking|reasoning)>[\s\S]*?<\/\1>/gi, '');
        // 연속 공백 정리
        text = text.replace(/\n{3,}/g, '\n\n').trim();
        return text;
    }

    /**
     * 기본 요약 생성 (LLM 요약 실패 시 fallback)
     *
     * ✅ 개선: 마크다운 형식으로 보기 좋게 표현
     */
    private generateDefaultSummary(createdFiles: string[], modifiedFiles: string[]): string {
        if (createdFiles.length === 0 && modifiedFiles.length === 0) {
            return AgentConfig.DEFAULT_COMPLETION_MESSAGE;
        }

        let summary = '### 작업 완료\n';
        summary += '요청하신 작업이 완료되었습니다.\n\n';
        summary += '### 변경 내용\n';

        if (createdFiles.length > 0) {
            createdFiles.forEach(f => {
                const fileName = f.split('/').pop() || f;
                summary += `- **${fileName}**: 새로 생성됨\n`;
            });
        }

        if (modifiedFiles.length > 0) {
            modifiedFiles.forEach(f => {
                const fileName = f.split('/').pop() || f;
                summary += `- **${fileName}**: 수정됨\n`;
            });
        }

        return summary.trim();
    }

    /**
     * 응답 형식 검증
     */
    public validateOutputFormat(response: string, phase: string): {
        isValid: boolean;
        hasToolCalls: boolean;
        hasNaturalLanguage: boolean;
        extractedToolCalls: string;
    } {
        const hasToolCalls = /<(create_file|update_file|remove_file|read_file|list_files|search_files|ripgrep_search|run_command|plan|task_progress)>/i.test(response);
        const hasNaturalLanguage = /[가-힣a-zA-Z]{3,}/.test(response.replace(/<[^>]+>/g, '').trim());

        // EXECUTION phase에서는 자연어가 있으면 안 됨
        if (phase === 'EXECUTION' && hasNaturalLanguage && !hasToolCalls) {
            return {
                isValid: false,
                hasToolCalls,
                hasNaturalLanguage,
                extractedToolCalls: ''
            };
        }

        // Tool calls 추출
        const toolCallMatch = response.match(/<(create_file|update_file|remove_file|read_file|list_files|search_files|ripgrep_search|run_command|plan|task_progress)[\s\S]*?<\/(?:create_file|update_file|remove_file|read_file|list_files|search_files|ripgrep_search|run_command|plan|task_progress)>/gi);
        const extractedToolCalls = toolCallMatch ? toolCallMatch.join('\n') : '';

        return {
            isValid: true,
            hasToolCalls,
            hasNaturalLanguage,
            extractedToolCalls
        };
    }
}
