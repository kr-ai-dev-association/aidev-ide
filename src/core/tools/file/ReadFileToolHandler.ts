/**
 * Read File Tool Handler
 * 파일 읽기 툴 핸들러
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
        const results: Array<{ path: string; content: string; error?: string }> = [];
        let hasError = false;
        
        for (const filePath of pathsToRead) {
            let absolutePath = path.isAbsolute(filePath)
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
                const content = await fs.readFile(absolutePath, 'utf8');
                results.push({
                    path: filePath,
                    content
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
            return {
                success: true,
                message: `File read: ${result.path}`,
                data: { path: result.path, content: result.content }
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
                    error: r.error
                }))
            }
        };
    }
    
    getDescription(toolUse: ToolUse): string {
        return `[read_file: ${toolUse.params.path}]`;
    }
}


