/**
 * Remove File Tool Handler
 * 파일 삭제 툴 핸들러
 */

import { IToolHandler, ToolExecutionContext } from '../IToolHandler';
import { ToolUse, ToolResponse, Tool } from '../types';
import { ActionType, FileOperationType } from '../../managers/action/types';
import * as path from 'path';
import * as fs from 'fs';
import { z } from 'zod';

const RemoveFileParamsSchema = z.object({
    path: z.string().min(1),
});

export class RemoveFileToolHandler implements IToolHandler {
    readonly name = Tool.REMOVE_FILE;

    async execute(toolUse: ToolUse, context: ToolExecutionContext): Promise<ToolResponse> {
        const parseResult = RemoveFileParamsSchema.safeParse(toolUse.params);
        if (!parseResult.success) {
            const msg = parseResult.error.errors[0]?.message ?? 'Invalid params';
            return { success: false, message: msg, error: { code: 'INVALID_PARAMS', message: msg } };
        }
        const filePath = parseResult.data.path;

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

    getDescription(toolUse: ToolUse): string {
        return `[remove_file: ${toolUse.params.path}]`;
    }
}


