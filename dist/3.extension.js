"use strict";
exports.id = 3;
exports.ids = [3];
exports.modules = {

/***/ 370:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


/**
 * Tool Executor
 * 툴을 실행하는 실행기
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ToolExecutor = void 0;
const types_1 = __webpack_require__(277);
const ToolRegistry_1 = __webpack_require__(342);
class ToolExecutor {
    registry;
    constructor() {
        this.registry = ToolRegistry_1.ToolRegistry.getInstance();
    }
    /**
     * 툴 실행
     */
    async executeTool(toolUse, context) {
        const handler = this.registry.getHandler(toolUse.name);
        if (!handler) {
            return {
                success: false,
                message: `Unknown tool: ${toolUse.name}`,
                error: { code: 'UNKNOWN_TOOL', message: `Tool ${toolUse.name} is not registered` }
            };
        }
        try {
            console.log(`[ToolExecutor] Executing tool: ${toolUse.name}`);
            const result = await handler.execute(toolUse, context);
            console.log(`[ToolExecutor] Tool ${toolUse.name} completed: ${result.success ? 'success' : 'failed'}`);
            return result;
        }
        catch (error) {
            console.error(`[ToolExecutor] Tool execution failed: ${toolUse.name}`, error);
            return {
                success: false,
                message: `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`,
                error: { code: 'EXECUTION_ERROR', message: error instanceof Error ? error.message : String(error) }
            };
        }
    }
    /**
     * 여러 툴 순차 실행
     */
    async executeTools(toolUses, context) {
        const results = [];
        for (const toolUse of toolUses) {
            const result = await this.executeTool(toolUse, context);
            results.push(result);
            // 실패 시 중단 여부 결정 (필요에 따라)
            if (!result.success && toolUse.name === types_1.Tool.RUN_COMMAND) {
                // 명령어 실패 시 중단
                console.log(`[ToolExecutor] Command failed, stopping execution`);
                break;
            }
        }
        return results;
    }
}
exports.ToolExecutor = ToolExecutor;


/***/ })

};
;
//# sourceMappingURL=3.extension.js.map