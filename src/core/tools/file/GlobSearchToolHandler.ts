/**
 * Glob Search Tool Handler
 * Searches file paths using glob patterns
 *
 * Difference from list_files:
 * - list_files: Lists directory contents (simple ls)
 * - glob_search: Searches entire project with pattern matching (**\/*.tsx etc.)
 *
 * Uses fast-glob (no vscode API -- works in CLI environment too)
 */

import { IToolHandler, ToolExecutionContext } from '../IToolHandler';
import { ToolUse, ToolResponse, Tool } from '../types';
import { PreToolUseValidator } from '../PreToolUseValidator';
import * as fg from 'fast-glob';
import * as path from 'path';

const DEFAULT_IGNORE = [
    '**/node_modules/**',
    '**/.git/**',
    '**/dist/**',
    '**/build/**',
    '**/out/**',
    '**/.next/**',
    '**/.nuxt/**',
    '**/.svelte-kit/**',
    '**/.cache/**',
    '**/coverage/**',
];

export class GlobSearchToolHandler implements IToolHandler {
    readonly name = Tool.GLOB_SEARCH;

    async execute(toolUse: ToolUse, context: ToolExecutionContext): Promise<ToolResponse> {
        const pattern = toolUse.params.pattern;
        const searchPath = toolUse.params.path || '';

        if (!pattern) {
            return {
                success: false,
                message: 'pattern parameter is required. Example: **/*.tsx, **/Dashboard*.tsx',
                error: { code: 'MISSING_PARAM', message: 'pattern is required' }
            };
        }

        try {
            // Prepend search path to pattern if specified
            const fullPattern = searchPath
                ? `${searchPath.replace(/\/$/, '')}/${pattern}`
                : pattern;

            const maxResults = toolUse.params.maxResults ? parseInt(toolUse.params.maxResults) : 200;

            // Search with fast-glob
            const entries = await fg(fullPattern, {
                cwd: context.projectRoot,
                ignore: DEFAULT_IGNORE,
                onlyFiles: true,
                dot: false,
                absolute: false,
                suppressErrors: true,
            });

            // Filter hidden files
            const filtered = entries.filter(filePath =>
                !PreToolUseValidator.isHiddenFile(
                    path.join(context.projectRoot, filePath),
                    context.projectRoot
                )
            );

            // Limit max results + sort
            const relativePaths = filtered.sort().slice(0, maxResults);
            const hiddenCount = entries.length - filtered.length;

            if (relativePaths.length === 0) {
                return {
                    success: true,
                    message: `No files matching pattern "${fullPattern}".`,
                    data: { pattern: fullPattern, files: [], count: 0 }
                };
            }

            const fileList = relativePaths.join('\n');
            return {
                success: true,
                message: `Found ${relativePaths.length} files matching pattern "${fullPattern}"${hiddenCount > 0 ? ` (${hiddenCount} hidden files excluded)` : ''}:\n${fileList}`,
                data: { pattern: fullPattern, files: relativePaths, count: relativePaths.length }
            };
        } catch (error) {
            return {
                success: false,
                message: `Glob search failed: ${error instanceof Error ? error.message : String(error)}`,
                error: { code: 'GLOB_ERROR', message: error instanceof Error ? error.message : String(error) }
            };
        }
    }

    getDescription(toolUse: ToolUse): string {
        return `[glob_search: ${toolUse.params.pattern}]`;
    }
}
