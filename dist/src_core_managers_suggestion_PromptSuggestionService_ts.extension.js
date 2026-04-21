"use strict";
exports.id = "src_core_managers_suggestion_PromptSuggestionService_ts";
exports.ids = ["src_core_managers_suggestion_PromptSuggestionService_ts"];
exports.modules = {

/***/ "./src/core/managers/suggestion/PromptSuggestionService.ts":
/*!*****************************************************************!*\
  !*** ./src/core/managers/suggestion/PromptSuggestionService.ts ***!
  \*****************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   PromptSuggestionService: () => (/* binding */ PromptSuggestionService)
/* harmony export */ });
/* harmony import */ var _state_UsageMetricsManager__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../state/UsageMetricsManager */ "./src/core/managers/state/UsageMetricsManager.ts");
/* harmony import */ var _utils__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../../utils */ "./src/utils/index.ts");
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
                userQuery ? `요청: ${userQuery}` : '',
                createdFiles.length > 0 ? `생성: ${createdFiles.join(', ')}` : '',
                modifiedFiles.length > 0 ? `수정: ${modifiedFiles.join(', ')}` : '',
                assistantSummary ? `결과: ${assistantSummary.substring(0, 150)}` : '',
            ].filter(Boolean).join(' | ');
            // Few-shot 프롬프트: 모델이 패턴을 따라하도록 유도 (thinking 최소화)
            const prompt = `Task: suggest 3 follow-up actions as JSON.

Input: 요청: 로그인 페이지 만들어줘 | 생성: src/pages/Login.tsx
Output: [{"text":"회원가입 페이지 추가","prompt":"회원가입 페이지도 만들어줘"},{"text":"로그인 API 연동","prompt":"로그인 페이지에 백엔드 API 연동해줘"},{"text":"비밀번호 찾기 추가","prompt":"비밀번호 찾기 기능 추가해줘"}]

Input: 요청: 버튼 스타일 수정해줘 | 수정: src/components/Button.tsx
Output: [{"text":"다른 컴포넌트에 적용","prompt":"수정된 버튼을 다른 페이지에도 적용해줘"},{"text":"호버 애니메이션 추가","prompt":"버튼에 호버 애니메이션 효과 추가해줘"},{"text":"테스트 코드 작성","prompt":"버튼 컴포넌트 테스트 코드 작성해줘"}]

Input: ${context}
Output: `;
            const _llmStart = Date.now();
            const response = await this.llmManager.sendMessageWithSystemPrompt('Output ONLY a JSON array. No thinking, no explanation. Copy the format exactly.', [{ text: prompt }], { maxTokens: 2000, disableThinking: true, disableRetry: true, retry: { querySource: 'background' } });
            try {
                _state_UsageMetricsManager__WEBPACK_IMPORTED_MODULE_0__.UsageMetricsManager.getInstance().recordLLMCall(Date.now() - _llmStart, (0,_utils__WEBPACK_IMPORTED_MODULE_1__.estimateTokens)(response), true);
            }
            catch { /* metrics should never break main flow */ }
            // Strip <think>...</think> tags (some LLMs wrap response in thinking blocks)
            // Also handle unclosed <think> tags (no </think>)
            const cleaned = response
                .replace(/<think>[\s\S]*?<\/think>/gi, '')
                .replace(/<think>[\s\S]*/gi, '')
                .trim();
            // Try to extract JSON array — first from cleaned, then from original response
            const jsonMatch = (cleaned || response).match(/\[[\s\S]*\]/) || response.match(/\[[\s\S]*\]/);
            if (!jsonMatch) {
                console.log(`[PromptSuggestionService] No JSON array found in LLM response: ${response.substring(0, 100)}`);
                return [];
            }
            const suggestions = JSON.parse(jsonMatch[0]);
            if (!Array.isArray(suggestions)) {
                console.log('[PromptSuggestionService] Parsed result is not an array');
                return [];
            }
            const filtered = suggestions
                .filter((s) => s.text && s.prompt)
                .slice(0, 3)
                .map((s) => ({
                text: s.text.substring(0, 40),
                prompt: s.prompt,
            }));
            console.log(`[PromptSuggestionService] Generated ${filtered.length} suggestion(s)`);
            return filtered;
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
//# sourceMappingURL=src_core_managers_suggestion_PromptSuggestionService_ts.extension.js.map