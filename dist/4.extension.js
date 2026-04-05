"use strict";
exports.id = 4;
exports.ids = [4];
exports.modules = {

/***/ 897:
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   PromptSuggestionService: () => (/* binding */ PromptSuggestionService)
/* harmony export */ });
/**
 * Prompt Suggestion Service
 * After each conversation completes, suggests 2-3 follow-up actions.
 * Displayed as clickable buttons in the chat panel.
 *
 * Claude Code reference: src/services/PromptSuggestion/
 */
class PromptSuggestionService {
    static instance;
    llmManager;
    constructor(llmManager) {
        this.llmManager = llmManager;
    }
    static getInstance(llmManager) {
        if (!this.instance && llmManager) {
            this.instance = new PromptSuggestionService(llmManager);
        }
        return this.instance;
    }
    /**
     * Generate follow-up suggestions based on what was just done
     */
    async generateSuggestions(userQuery, createdFiles, modifiedFiles, assistantSummary) {
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
            const response = await this.llmManager.sendMessageWithSystemPrompt('You are a JSON-only assistant. Output only valid JSON arrays.', [{ text: prompt }], { maxTokens: 300, retry: { querySource: 'background' } });
            const jsonMatch = response.match(/\[[\s\S]*\]/);
            if (!jsonMatch)
                return [];
            const suggestions = JSON.parse(jsonMatch[0]);
            if (!Array.isArray(suggestions))
                return [];
            return suggestions
                .filter((s) => s.text && s.prompt)
                .slice(0, 3)
                .map((s) => ({
                text: s.text.substring(0, 40),
                prompt: s.prompt,
            }));
        }
        catch (error) {
            console.warn('[PromptSuggestionService] Failed to generate suggestions:', error);
            return [];
        }
    }
}


/***/ })

};
;
//# sourceMappingURL=4.extension.js.map