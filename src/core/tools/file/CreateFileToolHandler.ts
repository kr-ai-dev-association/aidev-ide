/**
 * Create File Tool Handler
 * Creates files with content
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

        // Block placeholder/meaningless content (except cases where empty file is valid)
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

        // B-3: Warn on empty content (but allow — empty files are valid)
        if (!content || content.length === 0) {
            console.log(`[CreateFileToolHandler] Warning: creating file with empty content: ${filePath}`);
        }

        if (!allowEmpty && this.isPlaceholderContent(trimmedContent)) {
            console.warn(`[CreateFileToolHandler] Placeholder content rejected for ${filePath} (${trimmedContent.length} chars)`);
            return {
                success: false,
                message: `File content is a placeholder. Please write actual code: "${trimmedContent.substring(0, 30)}"`,
                error: { code: 'PLACEHOLDER_CONTENT', message: 'Content is a placeholder, not actual code' }
            };
        }

        // Fix HTML entities (correct incorrect escaping by AI models)
        let cleanedContent = fixModelHtmlEscaping(content);
        // Remove CDATA sections (handle cases where LLM wraps JSON etc. in CDATA)
        cleanedContent = removeCDataSections(cleanedContent);

        const absolutePath = path.isAbsolute(filePath) 
            ? filePath 
            : path.join(context.projectRoot, filePath);

        // Show diff via InlineDiffManager
        const diffModule = await import('../../managers/diff/InlineDiffManager');
        const inlineDiffManager = diffModule.InlineDiffManager.getInstance();

        // Original content (empty string since this is a new file)
        const originalContent = '';
        
        // Show diff
        await inlineDiffManager.showInlineDiff(absolutePath, originalContent, cleanedContent, context.conversationTurnId);

        // Debug: verify fileContent return
        console.log(`[CreateFileToolHandler] Returning response with fileContent: ${filePath} (${cleanedContent?.length || 0} chars)`);

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
     * Detect placeholder/meaningless content
     * Block cases where LLM outputs "...", "...code..." etc. instead of actual code
     */
    private isPlaceholderContent(content: string): boolean {
        if (content.length === 0) return true;
        // Extremely short content (allow approximately 1 line of comments)
        if (content.length <= 10) {
            return /^\.{2,}$|^(code|todo|implement|placeholder|content)/i.test(content);
        }
        // Typical LLM placeholder patterns
        const placeholderPatterns = [
            /^\.\.\.$/, /^\.\.\.code\.\.\.$/i, /^\.\.\.\s*code\s*\.\.\.$/i,
            /^#\s*(todo|implement|placeholder)/i,
            /^\/\/\s*(todo|implement|placeholder)/i,
        ];
        return placeholderPatterns.some(p => p.test(content));
    }
}


