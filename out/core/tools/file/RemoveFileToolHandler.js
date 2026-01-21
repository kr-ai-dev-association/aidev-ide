"use strict";
/**
 * Remove File Tool Handler
 * 파일 삭제 툴 핸들러
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RemoveFileToolHandler = void 0;
const types_1 = require("../types");
const types_2 = require("../../managers/action/types");
class RemoveFileToolHandler {
    name = types_1.Tool.REMOVE_FILE;
    async execute(toolUse, context) {
        const filePath = toolUse.params.path;
        if (!filePath) {
            return {
                success: false,
                message: 'Path parameter is required',
                error: { code: 'MISSING_PARAM', message: 'path is required' }
            };
        }
        // 기존 ActionManager의 executeFileOperation 사용
        const action = {
            id: `tool_${Date.now()}_${Math.random()}`,
            type: types_2.ActionType.FILE_OPERATION,
            params: {
                operation: types_2.FileOperationType.DELETE,
                sourcePath: filePath
            },
            permissions: [],
            validation: []
        };
        const result = await context.actionManager.executeAction(action);
        return {
            success: result.success,
            message: result.message || `File ${filePath} deleted successfully`,
            data: { filePath, actionId: result.actionId },
            filePath: filePath
        };
    }
    getDescription(toolUse) {
        return `[remove_file: ${toolUse.params.path}]`;
    }
}
exports.RemoveFileToolHandler = RemoveFileToolHandler;
//# sourceMappingURL=RemoveFileToolHandler.js.map