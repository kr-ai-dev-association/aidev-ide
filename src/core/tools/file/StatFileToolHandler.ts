/**
 * Stat File Tool Handler
 * 파일 메타데이터 조회 도구 (내용 없이)
 * - 파일 크기, 수정 시간, 라인 수 등
 * - 파일 구조 요약 (클래스, 함수 목록)
 */

import { IToolHandler, ToolExecutionContext } from '../IToolHandler';
import { ToolUse, ToolResponse, Tool } from '../types';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ProjectContextCache } from '../../managers/context/ProjectContextCache';

interface SymbolInfo {
    name: string;
    type: 'class' | 'function' | 'method' | 'interface' | 'type' | 'const' | 'variable' | 'enum';
    line: number;
    exported: boolean;
}

export class StatFileToolHandler implements IToolHandler {
    readonly name = Tool.STAT_FILE;

    async execute(toolUse: ToolUse, context: ToolExecutionContext): Promise<ToolResponse> {
        const filePath = toolUse.params.path;
        const includeSymbols = toolUse.params.symbols !== 'false'; // 기본값: true

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
            console.warn(`[StatFileToolHandler] External file access blocked: ${absolutePath}`);
            return {
                success: false,
                message: `Access denied: ${filePath} is outside of project root`,
                error: { code: 'ACCESS_DENIED', message: 'File is outside project root' }
            };
        }

        try {
            // 파일 stat 정보
            const stat = await fs.stat(absolutePath);

            if (!stat.isFile()) {
                return {
                    success: false,
                    message: `Path is not a file: ${filePath}`,
                    error: { code: 'NOT_FILE', message: 'Path is a directory or other type' }
                };
            }

            // 파일 내용 읽기 (라인 수 및 심볼 분석용)
            const cache = ProjectContextCache.getInstance();
            let fullContent = await cache.getFile(absolutePath);
            if (!fullContent) {
                fullContent = await fs.readFile(absolutePath, 'utf8');
                cache.cacheFile(absolutePath).catch(() => {});
            }

            const lines = fullContent.split('\n');
            const ext = path.extname(absolutePath).toLowerCase();

            // 심볼 추출
            let symbols: SymbolInfo[] = [];
            if (includeSymbols) {
                symbols = this.extractSymbols(lines, ext);
            }

            // 파일 구조 요약 생성
            const symbolSummary = this.generateSymbolSummary(symbols);

            // 포맷된 출력
            let formattedOutput = `=== File Info: ${path.basename(absolutePath)} ===\n`;
            formattedOutput += `Path: ${filePath}\n`;
            formattedOutput += `Size: ${this.formatFileSize(stat.size)}\n`;
            formattedOutput += `Lines: ${lines.length}\n`;
            formattedOutput += `Modified: ${stat.mtime.toISOString()}\n`;
            formattedOutput += `Extension: ${ext || '(none)'}\n`;

            if (symbols.length > 0) {
                formattedOutput += `\n=== Symbols (${symbols.length}) ===\n`;
                symbols.forEach(sym => {
                    const exportMarker = sym.exported ? '[E]' : '   ';
                    formattedOutput += `${exportMarker} ${sym.type.padEnd(10)} ${sym.name} (line ${sym.line})\n`;
                });
            }

            console.log(`[StatFileToolHandler] Stat ${filePath}: ${lines.length} lines, ${symbols.length} symbols`);

            return {
                success: true,
                message: `File stat: ${filePath}`,
                data: {
                    path: filePath,
                    absolutePath,
                    size: stat.size,
                    sizeFormatted: this.formatFileSize(stat.size),
                    lines: lines.length,
                    modified: stat.mtime.toISOString(),
                    created: stat.birthtime.toISOString(),
                    extension: ext,
                    symbols,
                    symbolSummary,
                    formatted: formattedOutput
                }
            };
        } catch (error) {
            return {
                success: false,
                message: `Failed to stat file: ${filePath}`,
                error: {
                    code: 'STAT_ERROR',
                    message: error instanceof Error ? error.message : String(error)
                }
            };
        }
    }

    private extractSymbols(lines: string[], ext: string): SymbolInfo[] {
        const symbols: SymbolInfo[] = [];

        // 지원하는 확장자 확인
        const supportedExts = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.java', '.kt', '.go', '.rs'];
        if (!supportedExts.includes(ext)) {
            return symbols;
        }

        lines.forEach((line, idx) => {
            const trimmedLine = line.trim();
            if (!trimmedLine || trimmedLine.startsWith('//') || trimmedLine.startsWith('*') || trimmedLine.startsWith('#')) {
                return;
            }

            // TypeScript/JavaScript 패턴
            if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].includes(ext)) {
                // 클래스
                let match = trimmedLine.match(/^(export\s+)?(abstract\s+)?class\s+(\w+)/);
                if (match) {
                    symbols.push({ name: match[3], type: 'class', line: idx + 1, exported: !!match[1] });
                    return;
                }

                // 인터페이스
                match = trimmedLine.match(/^(export\s+)?interface\s+(\w+)/);
                if (match) {
                    symbols.push({ name: match[2], type: 'interface', line: idx + 1, exported: !!match[1] });
                    return;
                }

                // 타입
                match = trimmedLine.match(/^(export\s+)?type\s+(\w+)/);
                if (match) {
                    symbols.push({ name: match[2], type: 'type', line: idx + 1, exported: !!match[1] });
                    return;
                }

                // enum
                match = trimmedLine.match(/^(export\s+)?(const\s+)?enum\s+(\w+)/);
                if (match) {
                    symbols.push({ name: match[3], type: 'enum', line: idx + 1, exported: !!match[1] });
                    return;
                }

                // 함수 (function 키워드)
                match = trimmedLine.match(/^(export\s+)?(async\s+)?function\s+(\w+)/);
                if (match) {
                    symbols.push({ name: match[3], type: 'function', line: idx + 1, exported: !!match[1] });
                    return;
                }

                // 화살표 함수 또는 const/let 함수
                match = trimmedLine.match(/^(export\s+)?(const|let|var)\s+(\w+)\s*[=:]/);
                if (match) {
                    // 함수인지 변수인지 판별 (다음에 =>나 function이 있으면 함수)
                    if (line.includes('=>') || line.includes('function')) {
                        symbols.push({ name: match[3], type: 'function', line: idx + 1, exported: !!match[1] });
                    } else {
                        symbols.push({ name: match[3], type: 'const', line: idx + 1, exported: !!match[1] });
                    }
                    return;
                }
            }

            // Python 패턴
            if (ext === '.py') {
                let match = trimmedLine.match(/^class\s+(\w+)/);
                if (match) {
                    symbols.push({ name: match[1], type: 'class', line: idx + 1, exported: !match[1].startsWith('_') });
                    return;
                }

                match = trimmedLine.match(/^(async\s+)?def\s+(\w+)/);
                if (match) {
                    symbols.push({ name: match[2], type: 'function', line: idx + 1, exported: !match[2].startsWith('_') });
                    return;
                }
            }

            // Java/Kotlin 패턴
            if (['.java', '.kt'].includes(ext)) {
                let match = trimmedLine.match(/^(public|private|protected)?\s*(static\s+)?(abstract\s+)?(class|interface|enum)\s+(\w+)/);
                if (match) {
                    const symType = match[4] === 'interface' ? 'interface' : match[4] === 'enum' ? 'enum' : 'class';
                    symbols.push({ name: match[5], type: symType, line: idx + 1, exported: match[1] === 'public' });
                    return;
                }

                match = trimmedLine.match(/^(public|private|protected)?\s*(static\s+)?(abstract\s+)?(\w+)\s+(\w+)\s*\(/);
                if (match && !['if', 'for', 'while', 'switch', 'catch'].includes(match[4])) {
                    symbols.push({ name: match[5], type: 'method', line: idx + 1, exported: match[1] === 'public' });
                    return;
                }
            }

            // Go 패턴
            if (ext === '.go') {
                let match = trimmedLine.match(/^type\s+(\w+)\s+(struct|interface)/);
                if (match) {
                    const symType = match[2] === 'interface' ? 'interface' : 'class';
                    symbols.push({ name: match[1], type: symType, line: idx + 1, exported: match[1][0] === match[1][0].toUpperCase() });
                    return;
                }

                match = trimmedLine.match(/^func\s+(\([^)]+\)\s+)?(\w+)\s*\(/);
                if (match) {
                    const funcName = match[2];
                    const type = match[1] ? 'method' : 'function';
                    symbols.push({ name: funcName, type, line: idx + 1, exported: funcName[0] === funcName[0].toUpperCase() });
                    return;
                }
            }

            // Rust 패턴
            if (ext === '.rs') {
                let match = trimmedLine.match(/^(pub\s+)?struct\s+(\w+)/);
                if (match) {
                    symbols.push({ name: match[2], type: 'class', line: idx + 1, exported: !!match[1] });
                    return;
                }

                match = trimmedLine.match(/^(pub\s+)?trait\s+(\w+)/);
                if (match) {
                    symbols.push({ name: match[2], type: 'interface', line: idx + 1, exported: !!match[1] });
                    return;
                }

                match = trimmedLine.match(/^(pub\s+)?enum\s+(\w+)/);
                if (match) {
                    symbols.push({ name: match[2], type: 'enum', line: idx + 1, exported: !!match[1] });
                    return;
                }

                match = trimmedLine.match(/^(pub\s+)?(async\s+)?fn\s+(\w+)/);
                if (match) {
                    symbols.push({ name: match[3], type: 'function', line: idx + 1, exported: !!match[1] });
                    return;
                }
            }
        });

        return symbols;
    }

    private generateSymbolSummary(symbols: SymbolInfo[]): Record<string, number> {
        const summary: Record<string, number> = {};
        symbols.forEach(sym => {
            summary[sym.type] = (summary[sym.type] || 0) + 1;
        });
        return summary;
    }

    private formatFileSize(bytes: number): string {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }

    getDescription(toolUse: ToolUse): string {
        return `[stat_file: ${toolUse.params.path}]`;
    }
}
