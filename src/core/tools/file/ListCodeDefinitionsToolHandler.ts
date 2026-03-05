/**
 * List Code Definitions Tool Handler
 * 디렉토리 내 모든 파일의 최상위 코드 정의(함수/클래스/인터페이스 등)를 추출
 *
 * Cline의 list_code_definition_names와 동일한 목적 — tree-sitter 대신 regex 기반 (외부 의존성 없음)
 * ReadFileToolHandler.extractSymbols 로직 재활용
 */

import * as fs from 'fs/promises';
import { Dirent } from 'fs';
import * as path from 'path';
import { IToolHandler, ToolExecutionContext } from '../IToolHandler';
import { ToolUse, ToolResponse, Tool } from '../types';

interface SymbolInfo {
    name: string;
    type: 'class' | 'function' | 'method' | 'interface' | 'type' | 'const' | 'variable' | 'enum';
    line: number;
    exported: boolean;
}

const SUPPORTED_EXTENSIONS = new Set([
    '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
    '.py', '.java', '.kt', '.go', '.rs'
]);

const MAX_FILES = 100;       // 너무 많은 파일 방지
const MAX_FILE_LINES = 5000; // 너무 큰 파일 방지 (심볼만 추출하므로 충분)

export class ListCodeDefinitionsToolHandler implements IToolHandler {
    readonly name = Tool.LIST_CODE_DEFINITIONS;

    async execute(toolUse: ToolUse, context: ToolExecutionContext): Promise<ToolResponse> {
        const dirPath = toolUse.params.path;
        const recursive = toolUse.params.recursive === 'true';
        const extFilter = toolUse.params.extensions
            ? new Set(toolUse.params.extensions.split(',').map(e => '.' + e.trim().replace(/^\./, '')))
            : null;

        if (!dirPath) {
            return {
                success: false,
                message: 'path 파라미터가 필요합니다.',
                error: { code: 'MISSING_PARAM', message: 'path is required' }
            };
        }

        const absoluteDir = path.isAbsolute(dirPath)
            ? dirPath
            : path.join(context.projectRoot, dirPath);

        // 프로젝트 루트 외부 접근 차단
        if (!absoluteDir.startsWith(context.projectRoot)) {
            return {
                success: false,
                message: `Access denied: ${dirPath} is outside of project root`,
                error: { code: 'ACCESS_DENIED', message: 'Outside project root' }
            };
        }

        // 디렉토리 존재 확인
        try {
            const stat = await fs.stat(absoluteDir);
            if (!stat.isDirectory()) {
                return {
                    success: false,
                    message: `${dirPath}는 디렉토리가 아닙니다.`,
                    error: { code: 'NOT_A_DIRECTORY', message: 'Path is not a directory' }
                };
            }
        } catch {
            return {
                success: false,
                message: `디렉토리를 찾을 수 없습니다: ${dirPath}`,
                error: { code: 'DIR_NOT_FOUND', message: 'Directory not found' }
            };
        }

        // 파일 목록 수집
        const files = await this.collectFiles(absoluteDir, recursive, extFilter);

        if (files.length === 0) {
            return {
                success: true,
                message: `${dirPath}: 지원하는 파일 없음`
            };
        }

        const truncated = files.length > MAX_FILES;
        const filesToProcess = files.slice(0, MAX_FILES);

        // 각 파일 심볼 추출
        const results: Array<{ relPath: string; symbols: SymbolInfo[] }> = [];
        let totalSymbols = 0;

        for (const absPath of filesToProcess) {
            try {
                const content = await fs.readFile(absPath, 'utf8');
                const lines = content.split('\n');
                if (lines.length > MAX_FILE_LINES) { continue; } // 너무 큰 파일 스킵

                const ext = path.extname(absPath).toLowerCase();
                const symbols = this.extractSymbols(lines, ext);

                if (symbols.length > 0) {
                    const relPath = path.relative(context.projectRoot, absPath);
                    results.push({ relPath, symbols });
                    totalSymbols += symbols.length;
                }
            } catch {
                // 읽기 실패 시 스킵
            }
        }

        if (results.length === 0) {
            return {
                success: true,
                message: `${dirPath}: 추출된 심볼 없음`
            };
        }

        // 포맷팅
        const lines: string[] = [];
        for (const { relPath, symbols } of results) {
            lines.push(relPath);
            for (const sym of symbols) {
                const exportMark = sym.exported ? '[E]' : '   ';
                lines.push(`  ${exportMark} ${sym.type.padEnd(10)} ${sym.name} (line ${sym.line})`);
            }
            lines.push('');
        }

        const header = `코드 정의 목록: ${dirPath} (${results.length}개 파일, ${totalSymbols}개 심볼)${truncated ? ` — ${files.length}개 중 ${MAX_FILES}개만 표시` : ''}\n`;

        return {
            success: true,
            message: header + lines.join('\n')
        };
    }

    private async collectFiles(
        dir: string,
        recursive: boolean,
        extFilter: Set<string> | null
    ): Promise<string[]> {
        const results: string[] = [];

        const scan = async (currentDir: string) => {
            let entries: Dirent[];
            try {
                entries = await fs.readdir(currentDir, { withFileTypes: true });
            } catch {
                return;
            }

            for (const entry of entries) {
                // node_modules, .git, dist 등 제외
                if (entry.isDirectory()) {
                    const skip = ['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', 'vendor'];
                    if (skip.includes(entry.name)) { continue; }
                    if (recursive) {
                        await scan(path.join(currentDir, entry.name));
                    }
                } else if (entry.isFile()) {
                    const ext = path.extname(entry.name).toLowerCase();
                    if (!SUPPORTED_EXTENSIONS.has(ext)) { continue; }
                    if (extFilter && !extFilter.has(ext)) { continue; }
                    results.push(path.join(currentDir, entry.name));
                }
            }
        };

        await scan(dir);
        return results.sort(); // 알파벳순 정렬
    }

    private extractSymbols(lines: string[], ext: string): SymbolInfo[] {
        const symbols: SymbolInfo[] = [];

        lines.forEach((line, idx) => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('#')) {
                return;
            }

            // TypeScript / JavaScript
            if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].includes(ext)) {
                let m: RegExpMatchArray | null;

                m = trimmed.match(/^(export\s+)?(abstract\s+)?class\s+(\w+)/);
                if (m) { symbols.push({ name: m[3], type: 'class', line: idx + 1, exported: !!m[1] }); return; }

                m = trimmed.match(/^(export\s+)?interface\s+(\w+)/);
                if (m) { symbols.push({ name: m[2], type: 'interface', line: idx + 1, exported: !!m[1] }); return; }

                m = trimmed.match(/^(export\s+)?type\s+(\w+)\s*[=<]/);
                if (m) { symbols.push({ name: m[2], type: 'type', line: idx + 1, exported: !!m[1] }); return; }

                m = trimmed.match(/^(export\s+)?(const\s+)?enum\s+(\w+)/);
                if (m) { symbols.push({ name: m[3], type: 'enum', line: idx + 1, exported: !!m[1] }); return; }

                m = trimmed.match(/^(export\s+)?(async\s+)?function\s+(\w+)/);
                if (m) { symbols.push({ name: m[3], type: 'function', line: idx + 1, exported: !!m[1] }); return; }

                // const/let arrow function or variable (top-level only: no leading spaces)
                if (!line.startsWith(' ') && !line.startsWith('\t')) {
                    m = trimmed.match(/^(export\s+)?(const|let|var)\s+(\w+)\s*[=:]/);
                    if (m) {
                        const type = (line.includes('=>') || line.includes('function')) ? 'function' : 'const';
                        symbols.push({ name: m[3], type, line: idx + 1, exported: !!m[1] });
                    }
                }
            }

            // Python
            else if (ext === '.py') {
                let m: RegExpMatchArray | null;
                m = trimmed.match(/^class\s+(\w+)/);
                if (m) { symbols.push({ name: m[1], type: 'class', line: idx + 1, exported: !m[1].startsWith('_') }); return; }
                m = trimmed.match(/^(async\s+)?def\s+(\w+)/);
                if (m) { symbols.push({ name: m[2], type: 'function', line: idx + 1, exported: !m[2].startsWith('_') }); return; }
            }

            // Java / Kotlin
            else if (['.java', '.kt'].includes(ext)) {
                let m: RegExpMatchArray | null;
                m = trimmed.match(/^(public|private|protected)?\s*(static\s+)?(abstract\s+)?(class|interface|enum)\s+(\w+)/);
                if (m) {
                    const t = m[4] === 'interface' ? 'interface' : m[4] === 'enum' ? 'enum' : 'class';
                    symbols.push({ name: m[5], type: t, line: idx + 1, exported: m[1] === 'public' });
                    return;
                }
                m = trimmed.match(/^(public|private|protected)?\s*(static\s+)?(?:fun\s+|[\w<>\[\]]+\s+)(\w+)\s*\(/);
                if (m && !['if', 'for', 'while', 'switch', 'catch', 'try'].includes(m[3])) {
                    symbols.push({ name: m[3], type: 'function', line: idx + 1, exported: m[1] === 'public' });
                }
            }

            // Go
            else if (ext === '.go') {
                let m: RegExpMatchArray | null;
                m = trimmed.match(/^type\s+(\w+)\s+(struct|interface)/);
                if (m) {
                    const t = m[2] === 'interface' ? 'interface' : 'class';
                    symbols.push({ name: m[1], type: t, line: idx + 1, exported: m[1][0] === m[1][0].toUpperCase() && m[1][0] !== m[1][0].toLowerCase() });
                    return;
                }
                m = trimmed.match(/^func\s+(\([^)]+\)\s+)?(\w+)\s*\(/);
                if (m) {
                    const name = m[2];
                    const t = m[1] ? 'method' : 'function';
                    symbols.push({ name, type: t, line: idx + 1, exported: name[0] === name[0].toUpperCase() && name[0] !== name[0].toLowerCase() });
                }
            }

            // Rust
            else if (ext === '.rs') {
                let m: RegExpMatchArray | null;
                m = trimmed.match(/^(pub\s+)?struct\s+(\w+)/);
                if (m) { symbols.push({ name: m[2], type: 'class', line: idx + 1, exported: !!m[1] }); return; }
                m = trimmed.match(/^(pub\s+)?trait\s+(\w+)/);
                if (m) { symbols.push({ name: m[2], type: 'interface', line: idx + 1, exported: !!m[1] }); return; }
                m = trimmed.match(/^(pub\s+)?enum\s+(\w+)/);
                if (m) { symbols.push({ name: m[2], type: 'enum', line: idx + 1, exported: !!m[1] }); return; }
                m = trimmed.match(/^(pub\s+)?(async\s+)?fn\s+(\w+)/);
                if (m) { symbols.push({ name: m[3], type: 'function', line: idx + 1, exported: !!m[1] }); }
            }
        });

        return symbols;
    }

    getDescription(toolUse: ToolUse): string {
        const recursive = toolUse.params.recursive === 'true' ? ' (recursive)' : '';
        return `[list_code_definitions: ${toolUse.params.path}${recursive}]`;
    }
}
