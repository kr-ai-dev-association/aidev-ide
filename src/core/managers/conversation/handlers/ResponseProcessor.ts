/**
 * ResponseProcessor
 * LLM 응답 처리, 검증, 정제를 담당하는 클래스
 */

import { getSimpleSummaryPrompt } from '../../context/prompts/task';
import { LLMManager } from '../../model/LLMManager';
import { StringUtils } from '../../../utils/StringUtils';
import { AgentConfig } from '../../../config/AgentConfig';
import * as fs from 'fs/promises';
import * as path from 'path';

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
     * 실제 파일 목록을 주입하여 검증된 요약 생성
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
        // 실제 디스크에서 파일 존재 여부 확인
        const verifiedCreated: string[] = [];
        const verifiedModified: string[] = [];

        for (const filePath of createdFiles) {
            try {
                const absPath = path.isAbsolute(filePath) ? filePath : path.join(workspaceRoot, filePath);
                await fs.access(absPath);
                verifiedCreated.push(filePath);
            } catch {
                // 파일이 존재하지 않으면 무시
            }
        }

        for (const filePath of modifiedFiles) {
            try {
                const absPath = path.isAbsolute(filePath) ? filePath : path.join(workspaceRoot, filePath);
                await fs.access(absPath);
                verifiedModified.push(filePath);
            } catch {
                // 파일이 존재하지 않으면 무시
            }
        }

        // 실제 파일 목록이 없으면 원본 요약 반환
        if (verifiedCreated.length === 0 && verifiedModified.length === 0) {
            return originalSummary || AgentConfig.DEFAULT_COMPLETION_MESSAGE;
        }

        // 원본 요약이 있으면 검증만 수행, 없으면 새로 생성
        if (originalSummary && originalSummary.trim()) {
            return originalSummary +
                (verifiedCreated.length > 0 ? `\n\n[생성된 파일: ${verifiedCreated.join(', ')}]` : '') +
                (verifiedModified.length > 0 ? `\n[수정된 파일: ${verifiedModified.join(', ')}]` : '');
        } else {
            // 원본 요약이 없는 경우: LLM에게 요약 생성 요청
            const summaryPrompt = getSimpleSummaryPrompt(verifiedCreated, verifiedModified);

            try {
                const verifiedSummary = await this.llmManager.sendMessageWithSystemPrompt(
                    summaryPrompt,
                    accumulatedParts,
                    { signal: abortSignal }
                );

                // StringUtils를 사용하여 완전히 정제
                const summaryText = StringUtils.cleanText(verifiedSummary, {
                    removeThinking: true,
                    removeNaturalLanguage: true,
                    removeSystemMessages: true,
                    removeToolTags: true,
                    removeJsonThinking: true,
                    extractJson: true
                });

                return summaryText.trim() || AgentConfig.DEFAULT_COMPLETION_MESSAGE;
            } catch (error) {
                console.warn('[ResponseProcessor] Failed to generate verified summary:', error);
                return '작업이 완료되었습니다.';
            }
        }
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
