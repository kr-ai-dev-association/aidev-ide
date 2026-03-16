/**
 * Read File Tool Handler
 * 파일 읽기 툴 핸들러
 * - 전체 파일 읽기 (작은 파일)
 * - 자동 truncate (큰 파일) - 시스템 강제
 * - 부분 읽기 (startLine, endLine 지원)
 */

import { IToolHandler, ToolExecutionContext } from '../IToolHandler';
import { ToolUse, ToolResponse, Tool } from '../types';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { ProjectContextCache } from '../../managers/context/ProjectContextCache';
import { UsageMetricsManager } from '../../managers/state/UsageMetricsManager';
import { SubProjectDetector } from '../../managers/project/SubProjectDetector';

// 파일 크기 임계값 (라인 수)
// v9.6.0: 300 → 2000으로 증가 (대부분의 일반 파일 전체 읽기 지원)
const MAX_FULL_READ_LINES = 2000;  // 이 이하면 전체 읽기
const PREVIEW_HEAD_LINES = 100;    // 큰 파일의 처음 N줄 (50 → 100)
const PREVIEW_TAIL_LINES = 50;     // 큰 파일의 마지막 N줄 (30 → 50)

interface FileReadResult {
    path: string;
    content: string;
    error?: string;
    totalLines?: number;
    readLines?: string;
    status?: 'full' | 'partial';
    isTruncated?: boolean;
    structure?: SymbolInfo[];
}

interface SymbolInfo {
    name: string;
    type: 'class' | 'function' | 'method' | 'interface' | 'type' | 'const' | 'variable' | 'enum';
    line: number;
    exported: boolean;
}

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
        const results: FileReadResult[] = [];
        let hasError = false;

        for (const filePath of pathsToRead) {
            let absolutePath = path.isAbsolute(filePath)
                ? filePath
                : path.join(context.projectRoot, filePath);

            // 서브프로젝트 경로 fallback: 파일이 없으면 서브프로젝트 루트에서 재탐색
            if (!path.isAbsolute(filePath) && !fsSync.existsSync(absolutePath)) {
                const fallback = SubProjectDetector.resolveWithFallback(context.projectRoot, filePath);
                if (fallback) {
                    console.log(`[ReadFileToolHandler] SubProject fallback: ${filePath} → ${path.relative(context.projectRoot, fallback)}`);
                    absolutePath = fallback;
                }
            }

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
                // ✅ 캐시 우선 사용
                const cache = ProjectContextCache.getInstance();
                let fullContent = await cache.getFile(absolutePath);
                if (fullContent) {
                    console.log(`[ReadFileToolHandler] Using cached content: ${absolutePath}`);
                } else {
                    fullContent = await fs.readFile(absolutePath, 'utf8');
                    // 캐시에 저장 (백그라운드)
                    cache.cacheFile(absolutePath).catch(() => {});
                }
                const lines = fullContent.split('\n');
                const totalLines = lines.length;
                const ext = path.extname(absolutePath).toLowerCase();

                // 파일 읽기 메트릭 기록
                UsageMetricsManager.getInstance().recordFileRead();

                // 부분 읽기 (명시적 범위 지정)
                if (startLine !== undefined || endLine !== undefined) {
                    // 1-based line numbers (사용자 친화적)
                    const start = Math.max(1, startLine || 1) - 1; // 0-based index
                    const end = Math.min(totalLines, endLine || totalLines); // endLine은 포함

                    const selectedLines = lines.slice(start, end);
                    const content = selectedLines.map((line, idx) => `${start + idx + 1}: ${line}`).join('\n');
                    const readLinesInfo = `Lines ${start + 1}-${end} of ${totalLines}`;

                    console.log(`[ReadFileToolHandler] Partial read: ${filePath} (${readLinesInfo})`);

                    results.push({
                        path: filePath,
                        content,
                        totalLines,
                        readLines: readLinesInfo,
                        status: 'partial',
                        isTruncated: false
                    });
                }
                // 작은 파일: 전체 읽기
                else if (totalLines <= MAX_FULL_READ_LINES) {
                    console.log(`[ReadFileToolHandler] Full read: ${filePath} (${totalLines} lines)`);

                    results.push({
                        path: filePath,
                        content: fullContent,
                        totalLines,
                        status: 'full',
                        isTruncated: false
                    });
                }
                // 큰 파일: 자동 truncate + 구조 정보
                else {
                    console.log(`[ReadFileToolHandler] Auto-truncate: ${filePath} (${totalLines} lines > ${MAX_FULL_READ_LINES})`);

                    // head + tail 미리보기
                    const headLines = lines.slice(0, PREVIEW_HEAD_LINES);
                    const tailLines = lines.slice(-PREVIEW_TAIL_LINES);

                    let previewContent = `=== FILE INFO ===\n`;
                    previewContent += `Path: ${filePath}\n`;
                    previewContent += `Total Lines: ${totalLines}\n`;
                    previewContent += `Status: TRUNCATED (file too large for full read)\n`;
                    previewContent += `Showing: first ${PREVIEW_HEAD_LINES} + last ${PREVIEW_TAIL_LINES} lines\n`;
                    previewContent += `\nTo read specific range, use: { "tool": "read_file", "path": "${filePath}", "startLine": "X", "endLine": "Y" }\n`;
                    previewContent += `\n=== HEAD (lines 1-${PREVIEW_HEAD_LINES}) ===\n`;
                    previewContent += headLines.map((line, idx) => `${idx + 1}: ${line}`).join('\n');
                    previewContent += `\n\n... [${totalLines - PREVIEW_HEAD_LINES - PREVIEW_TAIL_LINES} lines omitted] ...\n\n`;
                    previewContent += `=== TAIL (lines ${totalLines - PREVIEW_TAIL_LINES + 1}-${totalLines}) ===\n`;
                    previewContent += tailLines.map((line, idx) => `${totalLines - PREVIEW_TAIL_LINES + idx + 1}: ${line}`).join('\n');

                    // 심볼 추출 (구조 파악용)
                    const symbols = this.extractSymbols(lines, ext);
                    if (symbols.length > 0) {
                        previewContent += `\n\n=== STRUCTURE (${symbols.length} symbols) ===\n`;
                        symbols.forEach(sym => {
                            const exportMarker = sym.exported ? '[E]' : '   ';
                            previewContent += `${exportMarker} ${sym.type.padEnd(10)} ${sym.name} (line ${sym.line})\n`;
                        });
                    }

                    results.push({
                        path: filePath,
                        content: previewContent,
                        totalLines,
                        readLines: `Lines 1-${PREVIEW_HEAD_LINES}, ${totalLines - PREVIEW_TAIL_LINES + 1}-${totalLines} of ${totalLines}`,
                        status: 'partial',
                        isTruncated: true,
                        structure: symbols
                    });
                }
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
                const isNotFound = result.error.includes('ENOENT') || result.error.includes('no such file');
                return {
                    success: false,
                    message: isNotFound
                        ? `파일이 존재하지 않습니다: ${result.path}. 이 파일이 필요하면 create_file 도구로 직접 생성하세요.`
                        : `Failed to read file: ${result.path}`,
                    error: {
                        code: isNotFound ? 'FILE_NOT_FOUND' : 'READ_ERROR',
                        message: result.error
                    }
                };
            }

            let message = result.isTruncated
                ? `File truncated: ${result.path} (${result.totalLines} lines - too large)`
                : result.readLines
                    ? `File read: ${result.path} (${result.readLines})`
                    : `File read: ${result.path}`;

            return {
                success: true,
                message,
                data: {
                    path: result.path,
                    content: result.content,
                    totalLines: result.totalLines,
                    readLines: result.readLines,
                    status: result.status,
                    isTruncated: result.isTruncated,
                    structure: result.structure
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
                    status: r.status,
                    isTruncated: r.isTruncated,
                    structure: r.structure,
                    error: r.error
                }))
            }
        };
    }

    /**
     * 파일에서 심볼(클래스, 함수 등) 추출
     */
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
                    // 함수인지 변수인지 판별
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

    getDescription(toolUse: ToolUse): string {
        const startLine = toolUse.params.startLine;
        const endLine = toolUse.params.endLine;
        if (startLine || endLine) {
            return `[read_file: ${toolUse.params.path} (lines ${startLine || 1}-${endLine || 'end'})]`;
        }
        return `[read_file: ${toolUse.params.path}]`;
    }
}
