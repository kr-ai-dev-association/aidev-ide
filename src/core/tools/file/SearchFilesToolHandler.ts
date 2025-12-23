/**
 * Search Files Tool Handler
 * 파일 내용 검색 툴 핸들러
 */

import { IToolHandler, ToolExecutionContext } from '../IToolHandler';
import { ToolUse, ToolResponse, Tool } from '../types';
import { FileSearcher } from '../../managers/context/file/FileSearcher';

export class SearchFilesToolHandler implements IToolHandler {
    readonly name = Tool.SEARCH_FILES;

    async execute(toolUse: ToolUse, context: ToolExecutionContext): Promise<ToolResponse> {
        const searchPath = toolUse.params.path || context.projectRoot;
        const pattern = toolUse.params.pattern || toolUse.params.regex;
        const filePattern = toolUse.params.filePattern;

        if (!pattern) {
            return {
                success: false,
                message: 'Pattern parameter is required',
                error: { code: 'MISSING_PARAM', message: 'pattern is required' }
            };
        }

        // 기존 FileSearcher 사용 (싱글톤 패턴)
        const searcher = FileSearcher.getInstance();
        const results = await searcher.searchFiles(pattern, searchPath, {
            include: filePattern ? [filePattern] : undefined,
            maxResults: toolUse.params.maxResults ? parseInt(toolUse.params.maxResults) : 100
        });

        return {
            success: true,
            message: `Found ${results.length} matches`,
            data: { results }
        };
    }

    getDescription(toolUse: ToolUse): string {
        return `[search_files: ${toolUse.params.pattern}]`;
    }
}


