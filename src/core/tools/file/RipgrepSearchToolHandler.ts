/**
 * Ripgrep Search Tool Handler
 * ripgrep을 사용한 고성능 파일 검색 툴 핸들러
 */

import { IToolHandler, ToolExecutionContext } from '../IToolHandler';
import { ToolUse, ToolResponse, Tool } from '../types';
import { FileSearcher } from '../../managers/context/file/FileSearcher';
import * as path from 'path';

export class RipgrepSearchToolHandler implements IToolHandler {
    readonly name = Tool.RIPGREP_SEARCH;

    async execute(toolUse: ToolUse, context: ToolExecutionContext): Promise<ToolResponse> {
        let searchPath = toolUse.params.path || context.projectRoot;
        const pattern = toolUse.params.pattern || toolUse.params.regex;
        const filePattern = toolUse.params.filePattern;
        const include = toolUse.params.include;
        const exclude = toolUse.params.exclude;
        const caseSensitive = toolUse.params.caseSensitive === 'true';

        // 경로 보정
        if (!path.isAbsolute(searchPath)) {
            searchPath = path.join(context.projectRoot, searchPath);
        } else if (!searchPath.startsWith(context.projectRoot) && searchPath !== context.projectRoot) {
            searchPath = context.projectRoot;
        }

        if (!pattern) {
            return {
                success: false,
                message: 'Pattern parameter is required',
                error: { code: 'MISSING_PARAM', message: 'pattern is required' }
            };
        }

        const searcher = FileSearcher.getInstance();
        const results = await searcher.searchFiles(pattern, searchPath, {
            include: include ? include.split(',').map(s => s.trim()) : (filePattern ? [filePattern] : undefined),
            exclude: exclude ? exclude.split(',').map(s => s.trim()) : undefined,
            caseSensitive,
            maxResults: toolUse.params.maxResults ? parseInt(toolUse.params.maxResults) : 100,
            contextLines: toolUse.params.contextLines ? parseInt(toolUse.params.contextLines) : 2
        });

        const formattedResults = searcher.formatResults(results, context.projectRoot);

        return {
            success: true,
            message: `ripgrep found ${results.length} files with matches`,
            data: { 
                results: formattedResults,  // 포맷된 문자열 (LLM용)
                rawResults: results  // 원본 SearchResult[] 배열 (파싱용)
            }
        };
    }

    getDescription(toolUse: ToolUse): string {
        return `[ripgrep_search: ${toolUse.params.pattern}]`;
    }
}

