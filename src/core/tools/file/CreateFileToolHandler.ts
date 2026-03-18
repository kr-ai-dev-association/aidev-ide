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
import { z } from 'zod';

const CreateFileParamsSchema = z.object({
    path: z.string().min(1).optional(),
    absolutePath: z.string().min(1).optional(),
    content: z.string(),
});

export class CreateFileToolHandler implements IToolHandler {
    readonly name = Tool.CREATE_FILE;

    async execute(toolUse: ToolUse, context: ToolExecutionContext): Promise<ToolResponse> {
        const parseResult = CreateFileParamsSchema.safeParse(toolUse.params);
        if (!parseResult.success) {
            const msg = parseResult.error.errors[0]?.message ?? 'Invalid params';
            return { success: false, message: msg, error: { code: 'INVALID_PARAMS', message: msg } };
        }
        const filePath = parseResult.data.path || parseResult.data.absolutePath;
        const content = parseResult.data.content;

        if (!filePath) {
            return {
                success: false,
                message: 'Path parameter is required',
                error: { code: 'MISSING_PARAM', message: 'path is required' }
            };
        }

        // 플레이스홀더/의미 없는 콘텐츠 차단 (빈 파일이 정상인 케이스 예외)
        const trimmedContent = (content || '').trim();
        const fileName = path.basename(filePath);
        const allowEmpty = fileName === '__init__.py' || fileName === '.gitkeep' || fileName === '.keep';

        if (!content && !allowEmpty) {
            return {
                success: false,
                message: 'Content parameter is required',
                error: { code: 'MISSING_PARAM', message: 'content is required' }
            };
        }

        if (!allowEmpty && this.isPlaceholderContent(trimmedContent)) {
            console.warn(`[CreateFileToolHandler] Placeholder content rejected for ${filePath}: "${trimmedContent.substring(0, 50)}"`);
            return {
                success: false,
                message: `파일 내용이 플레이스홀더입니다. 실제 코드를 작성해주세요: "${trimmedContent.substring(0, 30)}"`,
                error: { code: 'PLACEHOLDER_CONTENT', message: 'Content is a placeholder, not actual code' }
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
        await inlineDiffManager.showInlineDiff(absolutePath, originalContent, cleanedContent, context.conversationTurnId);

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

    /**
     * 플레이스홀더/의미 없는 콘텐츠 감지
     * LLM이 실제 코드 대신 "...", "...code..." 등을 출력하는 케이스 차단
     */
    private isPlaceholderContent(content: string): boolean {
        if (content.length === 0) return true;
        // 극단적으로 짧은 콘텐츠 (주석 1줄 정도는 허용)
        if (content.length <= 10) {
            return /^\.{2,}$|^(code|todo|implement|placeholder|content)/i.test(content);
        }
        // 전형적인 LLM 플레이스홀더 패턴
        const placeholderPatterns = [
            /^\.\.\.$/, /^\.\.\.code\.\.\.$/i, /^\.\.\.\s*code\s*\.\.\.$/i,
            /^#\s*(todo|implement|placeholder)/i,
            /^\/\/\s*(todo|implement|placeholder)/i,
        ];
        return placeholderPatterns.some(p => p.test(content));
    }
}


