/**
 * Create File Tool Handler
 * 파일 생성 툴 핸들러
 */

import { IToolHandler, ToolExecutionContext } from '../IToolHandler';
import { ToolUse, ToolResponse, Tool } from '../types';
import { ActionType } from '../../managers/action/types';
import { fixModelHtmlEscaping, removeCDataSections } from '../../../utils/string';
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

        // HTML 엔티티 처리 (AI 모델이 잘못 이스케이프한 경우 수정)
        let cleanedContent = fixModelHtmlEscaping(content);
        // CDATA 섹션 제거 (LLM이 JSON 등을 CDATA로 감싸는 경우 처리)
        cleanedContent = removeCDataSections(cleanedContent);

        const absolutePath = path.isAbsolute(filePath) 
            ? filePath 
            : path.join(context.projectRoot, filePath);

        // InlineDiffManager를 통해 diff 표시
        const diffModule = await import('../../managers/diff/InlineDiffManager');
        const inlineDiffManager = diffModule.InlineDiffManager.getInstance();

        // 원본 내용 (새 파일이므로 빈 문자열)
        const originalContent = '';
        
        // diff 표시
        await inlineDiffManager.showInlineDiff(absolutePath, originalContent, cleanedContent);

        // ✅ 디버깅: fileContent 반환 확인
        console.log(`[CreateFileToolHandler] Returning response with fileContent:`, {
            filePath,
            cleanedContentLength: cleanedContent?.length || 0,
            cleanedContentPreview: cleanedContent?.substring(0, 100) || 'empty'
        });

        return {
            success: true,
            message: `File ${filePath} ready for review in diff editor. Please approve or reject the changes.`,
            data: { filePath, pending: true },
            filePath: filePath,
            fileContent: cleanedContent
        };
    }

    getDescription(toolUse: ToolUse): string {
        const path = toolUse.params.path || toolUse.params.absolutePath;
        return `[create_file for '${path}']`;
    }
}


