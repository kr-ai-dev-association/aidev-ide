/**
 * Create File Tool Handler
 * 파일 생성 툴 핸들러
 */

import { IToolHandler, ToolExecutionContext } from '../IToolHandler';
import { ToolUse, ToolResponse, Tool } from '../types';
import { ActionType } from '../../managers/action/types';
import * as path from 'path';
import * as vscode from 'vscode';

export class CreateFileToolHandler implements IToolHandler {
    readonly name = Tool.CREATE_FILE;

    async execute(toolUse: ToolUse, context: ToolExecutionContext): Promise<ToolResponse> {
        const filePath = toolUse.params.path || toolUse.params.absolutePath;
        const content = toolUse.params.content;

        if (!filePath) {
            return {
                success: false,
                message: 'Path parameter is required',
                error: { code: 'MISSING_PARAM', message: 'path is required' }
            };
        }

        if (!content) {
            return {
                success: false,
                message: 'Content parameter is required',
                error: { code: 'MISSING_PARAM', message: 'content is required' }
            };
        }

        // 기존 ActionManager의 executeCodeGeneration 사용
        const action = {
            id: `tool_${Date.now()}_${Math.random()}`,
            type: ActionType.CODE_GENERATION,
            params: {
                filePath,
                code: content
            },
            permissions: [],
            validation: []
        };

        const result = await context.actionManager.executeAction(action);

        return {
            success: result.success,
            message: result.message || `File ${filePath} created successfully`,
            data: { filePath, actionId: result.actionId },
            filePath: filePath,
            fileContent: content
        };
    }

    getDescription(toolUse: ToolUse): string {
        const path = toolUse.params.path || toolUse.params.absolutePath;
        return `[create_file for '${path}']`;
    }
}


