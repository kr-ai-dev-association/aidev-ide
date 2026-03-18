/**
 * Glob Search Tool Handler
 * glob 패턴으로 파일 경로를 검색하는 툴 핸들러
 *
 * list_files와 차이점:
 * - list_files: 디렉토리 내용을 나열 (단순 ls)
 * - glob_search: 패턴 매칭으로 프로젝트 전체에서 파일 검색 (**\/*.tsx 등)
 *
 * fast-glob 사용 (vscode API 미사용 — CLI 환경에서도 동작)
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
                message: 'pattern 파라미터가 필요합니다. 예: **/*.tsx, **/Dashboard*.tsx',
                error: { code: 'MISSING_PARAM', message: 'pattern is required' }
            };
        }

        try {
            // 검색 경로가 지정된 경우 패턴 앞에 붙임
            const fullPattern = searchPath
                ? `${searchPath.replace(/\/$/, '')}/${pattern}`
                : pattern;

            const maxResults = toolUse.params.maxResults ? parseInt(toolUse.params.maxResults) : 200;

            // fast-glob으로 검색
            const entries = await fg(fullPattern, {
                cwd: context.projectRoot,
                ignore: DEFAULT_IGNORE,
                onlyFiles: true,
                dot: false,
                absolute: false,
                suppressErrors: true,
            });

            // 은닉 파일 필터링
            const filtered = entries.filter(filePath =>
                !PreToolUseValidator.isHiddenFile(
                    path.join(context.projectRoot, filePath),
                    context.projectRoot
                )
            );

            // 최대 결과 수 제한 + 정렬
            const relativePaths = filtered.sort().slice(0, maxResults);
            const hiddenCount = entries.length - filtered.length;

            if (relativePaths.length === 0) {
                return {
                    success: true,
                    message: `패턴 "${fullPattern}"에 일치하는 파일이 없습니다.`,
                    data: { pattern: fullPattern, files: [], count: 0 }
                };
            }

            const fileList = relativePaths.join('\n');
            return {
                success: true,
                message: `패턴 "${fullPattern}"에 일치하는 파일 ${relativePaths.length}개 발견${hiddenCount > 0 ? ` (${hiddenCount}개 은닉 파일 제외)` : ''}:\n${fileList}`,
                data: { pattern: fullPattern, files: relativePaths, count: relativePaths.length }
            };
        } catch (error) {
            return {
                success: false,
                message: `Glob 검색 실패: ${error instanceof Error ? error.message : String(error)}`,
                error: { code: 'GLOB_ERROR', message: error instanceof Error ? error.message : String(error) }
            };
        }
    }

    getDescription(toolUse: ToolUse): string {
        return `[glob_search: ${toolUse.params.pattern}]`;
    }
}
