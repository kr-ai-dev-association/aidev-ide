/**
 * Remove File Tool Handler
 * 파일 삭제 툴 핸들러
 */
import { Tool } from '../types';
import { ActionType, FileOperationType } from '../../managers/action/types';
import * as path from 'path';
import * as fs from 'fs';
export class RemoveFileToolHandler {
    name = Tool.REMOVE_FILE;
    async execute(toolUse, context) {
        const filePath = toolUse.params.path;
        if (!filePath) {
            return {
                success: false,
                message: 'Path parameter is required',
                error: { code: 'MISSING_PARAM', message: 'path is required' }
            };
        }
        // 파일 존재 여부 확인
        const absolutePath = path.isAbsolute(filePath)
            ? filePath
            : path.join(context.projectRoot, filePath);
        if (!fs.existsSync(absolutePath)) {
            console.log(`[RemoveFileToolHandler] File does not exist, skipping: ${absolutePath}`);
            return {
                success: true, // 이미 없는 파일은 성공으로 처리 (idempotent)
                message: `File does not exist (already deleted or never existed): ${filePath}`,
                data: { filePath, skipped: true }
            };
        }
        // 기존 ActionManager의 executeFileOperation 사용
        const action = {
            id: `tool_${Date.now()}_${Math.random()}`,
            type: ActionType.FILE_OPERATION,
            params: {
                operation: FileOperationType.DELETE,
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
//# sourceMappingURL=RemoveFileToolHandler.js.map