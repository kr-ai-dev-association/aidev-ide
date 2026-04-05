"use strict";
exports.id = 6;
exports.ids = [6];
exports.modules = {

/***/ 899:
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   AutoDreamService: () => (/* binding */ AutoDreamService)
/* harmony export */ });
/* harmony import */ var _MemoryManager__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(390);
/**
 * AutoDream — Automatic Memory Consolidation
 * Periodically consolidates/merges/cleans up memories in the background.
 *
 * Trigger conditions (both must be met):
 * 1. Time gate: 24+ hours since last consolidation
 * 2. Session gate: 5+ sessions since last consolidation
 *
 * No /dream slash command — system auto-execution only.
 * Claude Code reference: src/services/autoDream/
 */

const DEFAULT_CONFIG = {
    minHoursSinceLastDream: 24,
    minSessionsSinceLastDream: 5,
    maxConsolidationTokens: 2000,
};
class AutoDreamService {
    static instance;
    llmManager;
    config;
    lastDreamTime = 0;
    sessionsSinceLastDream = 0;
    isRunning = false;
    constructor(llmManager) {
        this.llmManager = llmManager;
        this.config = DEFAULT_CONFIG;
        this.loadState();
    }
    static getInstance(llmManager) {
        if (!this.instance && llmManager) {
            this.instance = new AutoDreamService(llmManager);
        }
        return this.instance;
    }
    /**
     * Called after each session completes to increment session counter
     */
    onSessionComplete() {
        this.sessionsSinceLastDream++;
        console.log(`[AutoDreamService] Session completed. Count since last dream: ${this.sessionsSinceLastDream}`);
    }
    /**
     * Check if consolidation should run
     */
    shouldConsolidate() {
        if (this.isRunning)
            return false;
        const hoursSinceLastDream = (Date.now() - this.lastDreamTime) / (1000 * 60 * 60);
        if (hoursSinceLastDream < this.config.minHoursSinceLastDream)
            return false;
        if (this.sessionsSinceLastDream < this.config.minSessionsSinceLastDream)
            return false;
        return true;
    }
    /**
     * Run memory consolidation
     */
    async consolidate() {
        if (this.isRunning) {
            console.log('[AutoDreamService] Already running, skipping');
            return;
        }
        const memoryManager = _MemoryManager__WEBPACK_IMPORTED_MODULE_0__.MemoryManager.getInstance();
        const currentMemories = await memoryManager.loadForPrompt();
        if (!currentMemories || currentMemories.trim().length < 100) {
            console.log('[AutoDreamService] Not enough memories to consolidate');
            this.lastDreamTime = Date.now();
            this.sessionsSinceLastDream = 0;
            this.saveState();
            return;
        }
        this.isRunning = true;
        console.log('[AutoDreamService] Starting memory consolidation...');
        try {
            const consolidationPrompt = `You are a memory consolidation assistant. Review the existing memories below and improve their quality.

Tasks:
1. **Merge duplicates**: If two memories say the same thing, combine them into one
2. **Remove outdated**: If a memory contradicts a newer one, remove the old one
3. **Convert dates**: Change relative dates ("yesterday", "last week") to absolute dates
4. **Trim noise**: Remove memories that are too specific to a single session and won't help future sessions

Output a JSON array of actions:
[
  {"action": "delete", "name": "memory_name_to_delete"},
  {"action": "update", "name": "existing_memory_name", "content": "updated content"},
  {"action": "keep", "name": "memory_name"}
]

Rules:
- Maximum 10 actions per consolidation
- Prefer "keep" over "delete" when uncertain
- Never delete "user" type memories (user preferences are important)
- Output [] if no changes needed

Current memories:
${currentMemories}`;
            const response = await this.llmManager.sendMessageWithSystemPrompt('You are a JSON-only assistant. Output only valid JSON arrays.', [{ text: consolidationPrompt }], { maxTokens: this.config.maxConsolidationTokens, retry: { querySource: 'background' } });
            // Parse actions
            const jsonMatch = response.match(/\[[\s\S]*\]/);
            if (!jsonMatch) {
                console.log('[AutoDreamService] No valid JSON in response');
                return;
            }
            const actions = JSON.parse(jsonMatch[0]);
            if (!Array.isArray(actions) || actions.length === 0) {
                console.log('[AutoDreamService] No consolidation actions needed');
                return;
            }
            let deleteCount = 0;
            let updateCount = 0;
            for (const action of actions.slice(0, 10)) {
                if (action.action === 'delete' && action.name) {
                    const exists = await memoryManager.exists(action.name);
                    if (exists) {
                        await memoryManager.remove(action.name);
                        deleteCount++;
                        console.log(`[AutoDreamService] Deleted: ${action.name}`);
                    }
                }
                else if (action.action === 'update' && action.name && action.content) {
                    const exists = await memoryManager.exists(action.name);
                    if (exists) {
                        await memoryManager.save({
                            name: action.name,
                            type: 'project',
                            content: action.content,
                            description: `[통합] ${action.content.substring(0, 50)}`,
                        });
                        updateCount++;
                        console.log(`[AutoDreamService] Updated: ${action.name}`);
                    }
                }
            }
            console.log(`[AutoDreamService] Consolidation complete: ${deleteCount} deleted, ${updateCount} updated, ${actions.filter((a) => a.action === 'keep').length} kept`);
        }
        catch (error) {
            console.warn('[AutoDreamService] Consolidation failed:', error);
        }
        finally {
            this.isRunning = false;
            this.lastDreamTime = Date.now();
            this.sessionsSinceLastDream = 0;
            this.saveState();
        }
    }
    loadState() {
        try {
            // Use a simple in-memory approach — state resets on extension restart
            // For persistence, could use globalState or a file
            this.lastDreamTime = 0;
            this.sessionsSinceLastDream = 0;
        }
        catch {
            // Ignore
        }
    }
    saveState() {
        // In-memory only for now
        console.log(`[AutoDreamService] State saved: lastDream=${new Date(this.lastDreamTime).toISOString()}, sessions=${this.sessionsSinceLastDream}`);
    }
    reset() {
        this.lastDreamTime = 0;
        this.sessionsSinceLastDream = 0;
        this.isRunning = false;
    }
}


/***/ })

};
;
//# sourceMappingURL=6.extension.js.map