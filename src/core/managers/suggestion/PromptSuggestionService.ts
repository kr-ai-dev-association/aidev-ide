/**
 * Prompt Suggestion Service
 * After each conversation completes, suggests 2-3 follow-up actions.
 * Displayed as clickable buttons in the chat panel.
 *
 * Claude Code reference: src/services/PromptSuggestion/
 */

import { LLMManager } from '../model/LLMManager';

export interface Suggestion {
    text: string;      // Short button label (max 40 chars)
    prompt: string;     // Full prompt to send when clicked
}

export class PromptSuggestionService {
    private static instance: PromptSuggestionService;
    private llmManager: LLMManager;

    private constructor(llmManager: LLMManager) {
        this.llmManager = llmManager;
    }

    static getInstance(llmManager?: LLMManager): PromptSuggestionService {
        if (!this.instance && llmManager) {
            this.instance = new PromptSuggestionService(llmManager);
        }
        return this.instance;
    }

    /**
     * Generate follow-up suggestions based on what was just done
     */
    async generateSuggestions(
        userQuery: string,
        createdFiles: string[],
        modifiedFiles: string[],
        assistantSummary: string,
    ): Promise<Suggestion[]> {
        if (!userQuery && createdFiles.length === 0 && modifiedFiles.length === 0) {
            return [];
        }

        try {
            const context = [
                userQuery ? `사용자 요청: ${userQuery}` : '',
                createdFiles.length > 0 ? `생성된 파일: ${createdFiles.join(', ')}` : '',
                modifiedFiles.length > 0 ? `수정된 파일: ${modifiedFiles.join(', ')}` : '',
                assistantSummary ? `작업 결과: ${assistantSummary.substring(0, 200)}` : '',
            ].filter(Boolean).join('\n');

            const prompt = `Based on the completed task below, suggest 2-3 logical follow-up actions the user might want to do next.

${context}

Output a JSON array of suggestions. Each suggestion:
- "text": Short Korean label for a button (max 40 chars)
- "prompt": Full Korean prompt to send (what the user would type)

Rules:
- Maximum 3 suggestions
- Make them practical and specific to the work just done
- First suggestion should be the most likely next step
- Output [] if no good suggestions

Example output:
[
  {"text": "테스트 코드 추가", "prompt": "방금 만든 컴포넌트에 테스트 코드를 추가해줘"},
  {"text": "API 연동", "prompt": "백엔드 API와 연동해서 실제 데이터로 표시해줘"}
]`;

            const response = await this.llmManager.sendMessageWithSystemPrompt(
                'You are a JSON-only assistant. Output only valid JSON arrays.',
                [{ text: prompt }],
                { maxTokens: 300 },
            );

            const jsonMatch = response.match(/\[[\s\S]*\]/);
            if (!jsonMatch) return [];

            const suggestions = JSON.parse(jsonMatch[0]);
            if (!Array.isArray(suggestions)) return [];

            return suggestions
                .filter((s: any) => s.text && s.prompt)
                .slice(0, 3)
                .map((s: any) => ({
                    text: s.text.substring(0, 40),
                    prompt: s.prompt,
                }));
        } catch (error) {
            console.warn('[PromptSuggestionService] Failed to generate suggestions:', error);
            return [];
        }
    }
}
