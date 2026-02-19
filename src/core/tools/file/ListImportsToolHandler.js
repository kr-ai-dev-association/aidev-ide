/**
 * List Imports Tool Handler
 * 파일의 import/export 문을 추출하는 도구
 * - JavaScript/TypeScript import/export
 * - Python import/from...import
 * - Java/Kotlin import
 * - Go import
 * - Rust use
 * - C/C++ #include
 */
import { Tool } from '../types';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ProjectContextCache } from '../../managers/context/ProjectContextCache';
export class ListImportsToolHandler {
    name = Tool.LIST_IMPORTS;
    async execute(toolUse, context) {
        const filePath = toolUse.params.path;
        if (!filePath) {
            return {
                success: false,
                message: 'Path parameter is required',
                error: { code: 'MISSING_PARAM', message: 'path is required' }
            };
        }
        const absolutePath = path.isAbsolute(filePath)
            ? filePath
            : path.join(context.projectRoot, filePath);
        // 프로젝트 루트 외부 파일 접근 차단
        if (!absolutePath.startsWith(context.projectRoot) && absolutePath !== context.projectRoot) {
            console.warn(`[ListImportsToolHandler] External file access blocked: ${absolutePath}`);
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
                console.log(`[ListImportsToolHandler] Using cached content: ${absolutePath}`);
            }
            else {
                fullContent = await fs.readFile(absolutePath, 'utf8');
                cache.cacheFile(absolutePath).catch(() => { });
            }
            const lines = fullContent.split('\n');
            const ext = path.extname(absolutePath).toLowerCase();
            const imports = [];
            const exports = [];
            // 언어별 패턴 정의
            const patterns = this.getPatternsByExtension(ext);
            lines.forEach((line, idx) => {
                const trimmedLine = line.trim();
                if (!trimmedLine || trimmedLine.startsWith('//') || trimmedLine.startsWith('*')) {
                    return;
                }
                for (const pattern of patterns) {
                    const match = trimmedLine.match(pattern.regex);
                    if (match) {
                        const info = {
                            line: idx + 1,
                            type: pattern.type,
                            statement: trimmedLine,
                            module: match[1] || undefined
                        };
                        if (pattern.type === 'export') {
                            exports.push(info);
                        }
                        else {
                            imports.push(info);
                        }
                        break;
                    }
                }
            });
            // 포맷된 출력 생성
            let formattedOutput = '';
            if (imports.length > 0) {
                formattedOutput += '=== Imports ===\n';
                imports.forEach(imp => {
                    formattedOutput += `${imp.line.toString().padStart(4)}: ${imp.statement}\n`;
                });
            }
            if (exports.length > 0) {
                if (formattedOutput)
                    formattedOutput += '\n';
                formattedOutput += '=== Exports ===\n';
                exports.forEach(exp => {
                    formattedOutput += `${exp.line.toString().padStart(4)}: ${exp.statement}\n`;
                });
            }
            if (!formattedOutput) {
                formattedOutput = 'No imports or exports found';
            }
            console.log(`[ListImportsToolHandler] Found ${imports.length} imports, ${exports.length} exports in ${filePath}`);
            return {
                success: true,
                message: `Found ${imports.length} imports, ${exports.length} exports`,
                data: {
                    path: filePath,
                    imports,
                    exports,
                    formatted: formattedOutput,
                    totalLines: lines.length
                }
            };
        }
        catch (error) {
            return {
                success: false,
                message: `Failed to analyze file: ${filePath}`,
                error: {
                    code: 'READ_ERROR',
                    message: error instanceof Error ? error.message : String(error)
                }
            };
        }
    }
    getPatternsByExtension(ext) {
        switch (ext) {
            case '.ts':
            case '.tsx':
            case '.js':
            case '.jsx':
            case '.mjs':
            case '.cjs':
                return [
                    { regex: /^import\s+.*\s+from\s+['"]([^'"]+)['"]/, type: 'import' },
                    { regex: /^import\s+['"]([^'"]+)['"]/, type: 'import' },
                    { regex: /^import\s*\(/, type: 'import' },
                    { regex: /^export\s+\*\s+from\s+['"]([^'"]+)['"]/, type: 'export' },
                    { regex: /^export\s+\{[^}]*\}\s+from\s+['"]([^'"]+)['"]/, type: 'export' },
                    { regex: /^export\s+(default\s+)?(class|function|const|let|var|interface|type|enum)/, type: 'export' },
                    { regex: /^const\s+\w+\s*=\s*require\s*\(\s*['"]([^'"]+)['"]/, type: 'import' },
                    { regex: /^module\.exports/, type: 'export' },
                ];
            case '.py':
                return [
                    { regex: /^import\s+(\S+)/, type: 'import' },
                    { regex: /^from\s+(\S+)\s+import/, type: 'from' },
                ];
            case '.java':
            case '.kt':
            case '.kts':
                return [
                    { regex: /^import\s+(static\s+)?([a-zA-Z0-9_.]+)/, type: 'import' },
                    { regex: /^package\s+([a-zA-Z0-9_.]+)/, type: 'export' },
                ];
            case '.go':
                return [
                    { regex: /^import\s+\(/, type: 'import' },
                    { regex: /^import\s+"([^"]+)"/, type: 'import' },
                    { regex: /^\s+"([^"]+)"/, type: 'import' }, // multi-line import
                    { regex: /^package\s+(\w+)/, type: 'export' },
                ];
            case '.rs':
                return [
                    { regex: /^use\s+([a-zA-Z0-9_:]+)/, type: 'use' },
                    { regex: /^pub\s+use\s+([a-zA-Z0-9_:]+)/, type: 'export' },
                    { regex: /^mod\s+(\w+)/, type: 'import' },
                    { regex: /^pub\s+mod\s+(\w+)/, type: 'export' },
                ];
            case '.c':
            case '.cpp':
            case '.cc':
            case '.cxx':
            case '.h':
            case '.hpp':
            case '.hxx':
                return [
                    { regex: /^#include\s*[<"]([^>"]+)[>"]/, type: 'include' },
                ];
            case '.swift':
                return [
                    { regex: /^import\s+(\w+)/, type: 'import' },
                ];
            case '.rb':
                return [
                    { regex: /^require\s+['"]([^'"]+)['"]/, type: 'import' },
                    { regex: /^require_relative\s+['"]([^'"]+)['"]/, type: 'import' },
                    { regex: /^load\s+['"]([^'"]+)['"]/, type: 'import' },
                ];
            case '.php':
                return [
                    { regex: /^use\s+([a-zA-Z0-9_\\]+)/, type: 'use' },
                    { regex: /^require(_once)?\s+['"]([^'"]+)['"]/, type: 'import' },
                    { regex: /^include(_once)?\s+['"]([^'"]+)['"]/, type: 'include' },
                    { regex: /^namespace\s+([a-zA-Z0-9_\\]+)/, type: 'export' },
                ];
            default:
                // 기본: JS/TS 패턴 사용
                return [
                    { regex: /^import\s+.*\s+from\s+['"]([^'"]+)['"]/, type: 'import' },
                    { regex: /^export\s+/, type: 'export' },
                ];
        }
    }
    getDescription(toolUse) {
        return `[list_imports: ${toolUse.params.path}]`;
    }
}
//# sourceMappingURL=ListImportsToolHandler.js.map