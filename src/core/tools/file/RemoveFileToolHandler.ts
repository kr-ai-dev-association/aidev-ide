/**
 * Remove File Tool Handler
 * 파일 삭제 툴 핸들러
 */

import { IToolHandler, ToolExecutionContext } from '../IToolHandler';
import { ToolUse, ToolResponse, Tool } from '../types';
import { ActionType, FileOperationType } from '../../managers/action/types';
import * as path from 'path';

export class RemoveFileToolHandler implements IToolHandler {
    readonly name = Tool.REMOVE_FILE;

    async execute(toolUse: ToolUse, context: ToolExecutionContext): Promise<ToolResponse> {
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

    getDescription(toolUse: ToolUse): string {
        return `[remove_file: ${toolUse.params.path}]`;
    }
}


