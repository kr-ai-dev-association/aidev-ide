/**
 * Search Files Tool Handler
 * 파일 내용 검색 툴 핸들러
 */

import { IToolHandler, ToolExecutionContext } from '../IToolHandler';
import { ToolUse, ToolResponse, Tool } from '../types';
import { FileSearcher } from '../../managers/context/file/FileSearcher';
import * as path from 'path';

export class SearchFilesToolHandler implements IToolHandler {
    readonly name = Tool.SEARCH_FILES;

    async execute(toolUse: ToolUse, context: ToolExecutionContext): Promise<ToolResponse> {
        let searchPath = toolUse.params.path || context.projectRoot;
        const pattern = toolUse.params.pattern || toolUse.params.regex;
        const filePattern = toolUse.params.filePattern;

        // 경로가 프로젝트 루트를 벗어나지 않도록 보정
        if (!path.isAbsolute(searchPath)) {
            searchPath = path.join(context.projectRoot, searchPath);
        } else if (!searchPath.startsWith(context.projectRoot) && searchPath !== context.projectRoot) {
            // 절대 경로인 경우 프로젝트 루트 외부 검색이면 프로젝트 루트로 강제 (보안 및 에러 방지)
            console.warn(`[SearchFilesToolHandler] External search path blocked: ${searchPath}. Using project root instead.`);
            searchPath = context.projectRoot;
        }

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


