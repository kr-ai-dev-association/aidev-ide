"use strict";
exports.id = 5;
exports.ids = [5];
exports.modules = {

/***/ 900:
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   SessionMemoryExtractor: () => (/* binding */ SessionMemoryExtractor)
/* harmony export */ });
/* harmony import */ var _MemoryManager__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(391);
/* harmony import */ var _managers_state_UsageMetricsManager__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(78);
/* harmony import */ var _utils__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(24);
/**
 * Session Memory Auto-extraction
 * Automatically extracts key information from conversations and saves to memory.
 * Triggered after each conversation entry is saved, if token threshold is met.
 */



const DEFAULT_CONFIG = {
    minTokensForExtraction: 20000,
    minTurnsSinceLastExtraction: 5,
    maxExtractionTokens: 500,
};
class SessionMemoryExtractor {
    static instance;
    llmManager;
    lastExtractionTurn = 0;
    config;
    constructor(llmManager) {
        this.llmManager = llmManager;
        this.config = DEFAULT_CONFIG;
    }
    static getInstance(llmManager) {
        if (!this.instance && llmManager) {
            this.instance = new SessionMemoryExtractor(llmManager);
        }
        return this.instance;
    }
    /**
     * Check if extraction should run based on thresholds
     */
    shouldExtract(currentTokens, currentTurn) {
        if (currentTokens < this.config.minTokensForExtraction)
            return false;
        if (currentTurn - this.lastExtractionTurn < this.config.minTurnsSinceLastExtraction)
            return false;
        return true;
    }
    /**
     * Extract key information from conversation summary and save to memory
     */
    async extractAndSave(conversationSummary, currentTurn, abortSignal) {
        if (!conversationSummary || conversationSummary.trim().length < 100)
            return;
        try {
            console.log(`[SessionMemoryExtractor] Starting extraction at turn ${currentTurn}`);
            const extractionPrompt = `You are a memory extraction assistant. Analyze the conversation summary below and extract ONLY information worth remembering for future sessions.

Extract these types ONLY if genuinely useful:
- **user**: User's role, preferences, expertise level
- **project**: Project decisions, architecture choices, important constraints
- **feedback**: User corrections or confirmed approaches

Rules:
- Output JSON array of objects: [{"type": "user|project|feedback", "name": "short_name", "content": "one-line description"}]
- Maximum 3 items per extraction
- Skip if nothing is worth remembering
- Output [] if no useful memories found

Conversation summary:
${conversationSummary}`;
            const _llmStart = Date.now();
            const response = await this.llmManager.sendMessageWithSystemPrompt('You are a JSON-only extraction assistant. Output only valid JSON arrays.', [{ text: extractionPrompt }], { signal: abortSignal, maxTokens: this.config.maxExtractionTokens, retry: { querySource: 'background' } });
            try {
                _managers_state_UsageMetricsManager__WEBPACK_IMPORTED_MODULE_1__.UsageMetricsManager.getInstance().recordLLMCall(Date.now() - _llmStart, (0,_utils__WEBPACK_IMPORTED_MODULE_2__.estimateTokens)(response), true);
            }
            catch { /* metrics should never break main flow */ }
            // Parse response
            const jsonMatch = response.match(/\[[\s\S]*\]/);
            if (!jsonMatch) {
                console.log('[SessionMemoryExtractor] No JSON array found in response');
                return;
            }
            const memories = JSON.parse(jsonMatch[0]);
            if (!Array.isArray(memories) || memories.length === 0) {
                console.log('[SessionMemoryExtractor] No memories to extract');
                return;
            }
            // Save each memory
            const memoryManager = _MemoryManager__WEBPACK_IMPORTED_MODULE_0__.MemoryManager.getInstance();
            for (const mem of memories.slice(0, 3)) {
                if (mem.type && mem.name && mem.content) {
                    await memoryManager.save({
                        name: `auto_${mem.name}`,
                        type: mem.type,
                        content: mem.content,
                        description: `[자동 추출] ${mem.content.substring(0, 50)}`,
                    });
                    console.log(`[SessionMemoryExtractor] Saved: ${mem.type}/${mem.name}`);
                }
            }
            this.lastExtractionTurn = currentTurn;
            console.log(`[SessionMemoryExtractor] Extraction complete: ${memories.length} memories saved`);
        }
        catch (error) {
            console.warn('[SessionMemoryExtractor] Extraction failed:', error);
        }
    }
    reset() {
        this.lastExtractionTurn = 0;
    }
}


/***/ })

};
;
//# sourceMappingURL=5.extension.js.map