/**
 * Read File Tool Handler
 * 파일 읽기 툴 핸들러
 * - 전체 파일 읽기
 * - 부분 읽기 (startLine, endLine 지원)
 */

import { IToolHandler, ToolExecutionContext } from '../IToolHandler';
import { ToolUse, ToolResponse, Tool } from '../types';
import * as fs from 'fs/promises';
import * as path from 'path';

export class ReadFileToolHandler implements IToolHandler {
    readonly name = Tool.READ_FILE;

    async execute(toolUse: ToolUse, context: ToolExecutionContext): Promise<ToolResponse> {
        const filePath = toolUse.params.path;
        const paths = toolUse.params.paths; // 여러 파일 경로 지원
        const startLine = toolUse.params.startLine ? parseInt(String(toolUse.params.startLine), 10) : undefined;
        const endLine = toolUse.params.endLine ? parseInt(String(toolUse.params.endLine), 10) : undefined;

        // 단일 경로 또는 여러 경로 처리
        const pathsToRead: string[] = [];
        if (paths) {
            // paths가 문자열인 경우 (쉼표로 구분된 경로 또는 JSON 배열)
            try {
                const parsed = typeof paths === 'string' ? JSON.parse(paths) : paths;
                if (Array.isArray(parsed)) {
                    pathsToRead.push(...parsed);
                } else {
                    pathsToRead.push(paths);
                }
            } catch {
                // JSON 파싱 실패 시 쉼표로 구분된 문자열로 처리
                if (typeof paths === 'string') {
                    pathsToRead.push(...paths.split(',').map(p => p.trim()).filter(p => p));
                }
            }
        } else if (filePath) {
            pathsToRead.push(filePath);
        }

        if (pathsToRead.length === 0) {
            return {
                success: false,
                message: 'Path or paths parameter is required',
                error: { code: 'MISSING_PARAM', message: 'path or paths is required' }
            };
        }

        // 여러 파일 읽기
        const results: Array<{ path: string; content: string; error?: string; totalLines?: number; readLines?: string }> = [];
        let hasError = false;

        for (const filePath of pathsToRead) {
            const absolutePath = path.isAbsolute(filePath)
                ? filePath
                : path.join(context.projectRoot, filePath);

            // 프로젝트 루트 외부 파일 접근 차단
            if (!absolutePath.startsWith(context.projectRoot) && absolutePath !== context.projectRoot) {
                console.warn(`[ReadFileToolHandler] External file access blocked: ${absolutePath}`);
                results.push({
                    path: filePath,
                    content: '',
                    error: `Access denied: ${filePath} is outside of project root`
                });
                hasError = true;
                continue;
            }

            try {
                const fullContent = await fs.readFile(absolutePath, 'utf8');
                const lines = fullContent.split('\n');
                const totalLines = lines.length;

                // 부분 읽기 지원
                let content: string;
                let readLinesInfo: string | undefined;

                if (startLine !== undefined || endLine !== undefined) {
                    // 1-based line numbers (사용자 친화적)
                    const start = Math.max(1, startLine || 1) - 1; // 0-based index
                    const end = Math.min(totalLines, endLine || totalLines); // endLine은 포함

                    const selectedLines = lines.slice(start, end);
                    content = selectedLines.map((line, idx) => `${start + idx + 1}: ${line}`).join('\n');
                    readLinesInfo = `Lines ${start + 1}-${end} of ${totalLines}`;

                    console.log(`[ReadFileToolHandler] Partial read: ${filePath} (${readLinesInfo})`);
                } else {
                    content = fullContent;
                }

                results.push({
                    path: filePath,
                    content,
                    totalLines,
                    readLines: readLinesInfo
                });
            } catch (error) {
                results.push({
                    path: filePath,
                    content: '',
                    error: error instanceof Error ? error.message : String(error)
                });
                hasError = true;
            }
        }

        // 단일 파일인 경우 기존 형식 유지 (하위 호환성)
        if (results.length === 1) {
            const result = results[0];
            if (result.error) {
                return {
                    success: false,
                    message: `Failed to read file: ${result.path}`,
                    error: {
                        code: 'READ_ERROR',
                        message: result.error
                    }
                };
            }
            const message = result.readLines
                ? `File read: ${result.path} (${result.readLines})`
                : `File read: ${result.path}`;
            return {
                success: true,
                message,
                data: {
                    path: result.path,
                    content: result.content,
                    totalLines: result.totalLines,
                    readLines: result.readLines
                }
            };
        }

        // 여러 파일인 경우 배열 형식 반환
        return {
            success: !hasError,
            message: `Read ${results.length} file(s)`,
            data: {
                files: results.map(r => ({
                    path: r.path,
                    content: r.content,
                    totalLines: r.totalLines,
                    readLines: r.readLines,
                    error: r.error
                }))
            }
        };
    }

    getDescription(toolUse: ToolUse): string {
        const startLine = toolUse.params.startLine;
        const endLine = toolUse.params.endLine;
        if (startLine || endLine) {
            return `[read_file: ${toolUse.params.path} (lines ${startLine || 1}-${endLine || 'end'})]`;
        }
        return `[read_file: ${toolUse.params.path}]`;
    }
}


