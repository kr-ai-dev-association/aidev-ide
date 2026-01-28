/**
 * Expand Around Line Tool Handler
 * 특정 라인 주변의 컨텍스트를 읽는 도구
 * - 지정된 라인 번호를 중심으로 위아래로 확장하여 읽기
 * - 코드 검색 결과 주변 컨텍스트 확인에 유용
 */

import { IToolHandler, ToolExecutionContext } from '../IToolHandler';
import { ToolUse, ToolResponse, Tool } from '../types';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ProjectContextCache } from '../../managers/context/ProjectContextCache';

export class ExpandAroundLineToolHandler implements IToolHandler {
    readonly name = Tool.EXPAND_AROUND_LINE;

    async execute(toolUse: ToolUse, context: ToolExecutionContext): Promise<ToolResponse> {
        const filePath = toolUse.params.path;
        const lineNumber = parseInt(String(toolUse.params.line), 10);
        const expandBefore = toolUse.params.before ? parseInt(String(toolUse.params.before), 10) : 20;
        const expandAfter = toolUse.params.after ? parseInt(String(toolUse.params.after), 10) : 20;

        if (!filePath) {
            return {
                success: false,
                message: 'Path parameter is required',
                error: { code: 'MISSING_PARAM', message: 'path is required' }
            };
        }

        if (isNaN(lineNumber) || lineNumber < 1) {
            return {
                success: false,
                message: 'Valid line number is required',
                error: { code: 'INVALID_PARAM', message: 'line must be a positive integer' }
            };
        }

        const absolutePath = path.isAbsolute(filePath)
            ? filePath
            : path.join(context.projectRoot, filePath);

        // 프로젝트 루트 외부 파일 접근 차단
        if (!absolutePath.startsWith(context.projectRoot) && absolutePath !== context.projectRoot) {
            console.warn(`[ExpandAroundLineToolHandler] External file access blocked: ${absolutePath}`);
            return {
                success: false,
                message: `Access denied: ${filePath} is outside of project root`,
                error: { code: 'ACCESS_DENIED', message: 'File is outside project root' }
            };
        }

        try {
            // 캐시 우선 사용
            const cache = ProjectContextCache.getInstance();
            let fullContent = await cache.getFile(absolutePath);
            if (fullContent) {
                console.log(`[ExpandAroundLineToolHandler] Using cached content: ${absolutePath}`);
            } else {
                fullContent = await fs.readFile(absolutePath, 'utf8');
                // 캐시에 저장 (백그라운드)
                cache.cacheFile(absolutePath).catch(() => {});
            }

            const lines = fullContent.split('\n');
            const totalLines = lines.length;

            // 라인 번호 유효성 검사
            if (lineNumber > totalLines) {
                return {
                    success: false,
                    message: `Line ${lineNumber} exceeds file length (${totalLines} lines)`,
                    error: { code: 'INVALID_LINE', message: `File has only ${totalLines} lines` }
                };
            }

            // 1-based to 0-based index
            const centerIndex = lineNumber - 1;
            const startIndex = Math.max(0, centerIndex - expandBefore);
            const endIndex = Math.min(totalLines - 1, centerIndex + expandAfter);

            // 선택된 라인들 추출 (라인 번호 포함)
            const selectedLines = lines.slice(startIndex, endIndex + 1);
            const numberedContent = selectedLines.map((line, idx) => {
                const lineNum = startIndex + idx + 1;
                const marker = lineNum === lineNumber ? '>>>' : '   ';
                return `${marker}${lineNum.toString().padStart(5)}: ${line}`;
            }).join('\n');

            console.log(`[ExpandAroundLineToolHandler] Read ${filePath} around line ${lineNumber} (${startIndex + 1}-${endIndex + 1})`);

            return {
                success: true,
                message: `Expanded around line ${lineNumber}: ${filePath}`,
                data: {
                    path: filePath,
                    content: numberedContent,
                    centerLine: lineNumber,
                    startLine: startIndex + 1,
                    endLine: endIndex + 1,
                    totalLines,
                    expandedRange: `Lines ${startIndex + 1}-${endIndex + 1} of ${totalLines}`
                }
            };
        } catch (error) {
            return {
                success: false,
                message: `Failed to read file: ${filePath}`,
                error: {
                    code: 'READ_ERROR',
                    message: error instanceof Error ? error.message : String(error)
                }
            };
        }
    }

    getDescription(toolUse: ToolUse): string {
        const before = toolUse.params.before || 20;
        const after = toolUse.params.after || 20;
        return `[expand_around_line: ${toolUse.params.path} line ${toolUse.params.line} ±${before}/${after}]`;
    }
}
