/**
 * Regex 기반 파일 검색 시스템
 * ripgrep을 통한 빠른 정규식 검색
 */

import * as childProcess from 'child_process';
import * as path from 'path';
import * as readline from 'readline';
import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as util from 'util';

const exec = util.promisify(childProcess.exec);

/**
 * 검색 결과
 */
export interface SearchResult {
    file: string;
    matches: Match[];
    totalMatches: number;
}

/**
 * 매칭 정보
 */
export interface Match {
    line: number;
    column: number;
    content: string;
    context?: {
        before: string[];
        after: string[];
    };
}

/**
 * 검색 옵션
 */
export interface SearchOptions {
    include?: string[];        // 포함할 파일 패턴 (glob)
    exclude?: string[];       // 제외할 파일 패턴 (glob)
    caseSensitive?: boolean;   // 대소문자 구분
    contextLines?: number;     // 주변 라인 수 (기본: 2)
    maxResults?: number;       // 최대 결과 수 (기본: 300)
}

/**
 * Regex 기반 파일 검색기
 */
export class FileSearcher {
    private static instance: FileSearcher;
    private ripgrepPath: string | null = null;

    private constructor() {
        this.findRipgrep();
    }

    public static getInstance(): FileSearcher {
        if (!FileSearcher.instance) {
            FileSearcher.instance = new FileSearcher();
        }
        return FileSearcher.instance;
    }

    /**
     * ripgrep 경로 찾기
     */
    private async findRipgrep(): Promise<void> {
        try {
            // VS Code의 ripgrep 사용 시도
            const vscodeRipgrep = path.join(
                vscode.env.appRoot,
                'resources',
                'app',
                'node_modules',
                'vscode-ripgrep',
                'bin',
                process.platform === 'win32' ? 'rg.exe' : 'rg'
            );

            try {
                await fs.access(vscodeRipgrep);
                this.ripgrepPath = vscodeRipgrep;
                return;
            } catch {
                // VS Code ripgrep 없음
            }

            // 시스템 PATH에서 찾기 (Windows: where, Unix: which)
            const whichCmd = process.platform === 'win32' ? 'where rg' : 'which rg';
            const { stdout } = await exec(whichCmd);
            if (stdout.trim()) {
                this.ripgrepPath = stdout.trim().split(/\r?\n/)[0]; // Windows where는 여러 줄 반환 가능
                return;
            }
        } catch (error) {
            console.warn('[FileSearcher] ripgrep not found, falling back to native search');
        }
    }

    /**
     * 정규식으로 파일 검색
     */
    public async searchFiles(
        pattern: string,
        searchPath: string,
        options?: SearchOptions
    ): Promise<SearchResult[]> {
        // ripgrep이 없으면 네이티브 검색 사용
        if (!this.ripgrepPath) {
            return this.searchFilesNative(pattern, searchPath, options);
        }

        return this.searchFilesWithRipgrep(pattern, searchPath, options);
    }

    /**
     * ripgrep을 사용한 검색
     */
    private async searchFilesWithRipgrep(
        pattern: string,
        searchPath: string,
        options?: SearchOptions
    ): Promise<SearchResult[]> {
        const contextLines = options?.contextLines ?? 2;
        const maxResults = options?.maxResults ?? 300;
        const caseSensitive = options?.caseSensitive ?? false;

        const args: string[] = [
            '--json',
            '-e', pattern,
            '--context', contextLines.toString(),
        ];

        if (!caseSensitive) {
            args.push('-i');
        }

        // Include 패턴
        if (options?.include && options.include.length > 0) {
            for (const include of options.include) {
                args.push('--glob', include);
            }
        } else {
            args.push('--glob', '*');
        }

        // Exclude 패턴
        if (options?.exclude && options.exclude.length > 0) {
            for (const exclude of options.exclude) {
                args.push('--glob', `!${exclude}`);
            }
        }

        // 기본 제외 패턴
        args.push('--glob', '!**/node_modules/**');
        args.push('--glob', '!**/.git/**');
        args.push('--glob', '!**/dist/**');
        args.push('--glob', '!**/build/**');

        args.push(searchPath);

        return new Promise((resolve, reject) => {
            const rgProcess = childProcess.spawn(this.ripgrepPath!, args);
            const rl = readline.createInterface({
                input: rgProcess.stdout,
                crlfDelay: Infinity,
            });

            const results: SearchResult[] = [];
            const fileMap = new Map<string, Match[]>();
            let lineCount = 0;
            const maxLines = maxResults * 10; // 각 결과당 최대 10줄 가정

            let currentResult: Partial<Match> | null = null;
            let currentFile: string | null = null;

            rl.on('line', (line) => {
                if (lineCount >= maxLines) {
                    rl.close();
                    rgProcess.kill();
                    return;
                }

                if (!line.trim()) {
                    lineCount++;
                    return;
                }

                try {
                    const parsed = JSON.parse(line);

                    if (parsed.type === 'match') {
                        if (currentResult && currentFile) {
                            if (!fileMap.has(currentFile)) {
                                fileMap.set(currentFile, []);
                            }
                            fileMap.get(currentFile)!.push(currentResult as Match);
                        }

                        currentFile = parsed.data.path.text;
                        currentResult = {
                            line: parsed.data.line_number,
                            column: parsed.data.submatches[0]?.start || 0,
                            content: parsed.data.lines.text.trim(),
                            context: {
                                before: [],
                                after: [],
                            },
                        };
                    } else if (parsed.type === 'context' && currentResult) {
                        if (parsed.data.line_number < currentResult.line!) {
                            currentResult.context!.before.push(parsed.data.lines.text.trim());
                        } else if (parsed.data.line_number > currentResult.line!) {
                            currentResult.context!.after.push(parsed.data.lines.text.trim());
                        }
                    }
                } catch (error) {
                    // JSON 파싱 실패는 무시 (ripgrep의 다른 출력일 수 있음)
                }

                lineCount++;
            });

            let errorOutput = '';
            rgProcess.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });

            rl.on('close', () => {
                // 마지막 결과 추가
                if (currentResult && currentFile) {
                    if (!fileMap.has(currentFile)) {
                        fileMap.set(currentFile, []);
                    }
                    fileMap.get(currentFile)!.push(currentResult as Match);
                }

                // SearchResult 배열로 변환
                for (const [file, matches] of fileMap.entries()) {
                    results.push({
                        file,
                        matches: matches.slice(0, maxResults),
                        totalMatches: matches.length,
                    });
                }

                if (errorOutput && !results.length) {
                    reject(new Error(`ripgrep error: ${errorOutput}`));
                } else {
                    resolve(results);
                }
            });

            rgProcess.on('error', (error) => {
                reject(new Error(`Failed to spawn ripgrep: ${error.message}`));
            });
        });
    }

    /**
     * 네이티브 검색 (ripgrep 없을 때)
     */
    private async searchFilesNative(
        pattern: string,
        searchPath: string,
        options?: SearchOptions
    ): Promise<SearchResult[]> {
        const results: SearchResult[] = [];
        const regex = new RegExp(pattern, options?.caseSensitive ? 'g' : 'gi');
        const contextLines = options?.contextLines ?? 2;
        const maxResults = options?.maxResults ?? 300;

        try {
            const files = await this.getFilesToSearch(searchPath, options);

            for (const file of files.slice(0, maxResults)) {
                try {
                    const content = await fs.readFile(file, 'utf-8');
                    const lines = content.split(/\r?\n/);
                    const matches: Match[] = [];

                    lines.forEach((line: string, index: number) => {
                        if (regex.test(line)) {
                            const before: string[] = [];
                            const after: string[] = [];

                            // 주변 라인 수집
                            for (let i = Math.max(0, index - contextLines); i < index; i++) {
                                before.push(lines[i]);
                            }
                            for (let i = index + 1; i < Math.min(lines.length, index + 1 + contextLines); i++) {
                                after.push(lines[i]);
                            }

                            matches.push({
                                line: index + 1,
                                column: line.search(regex),
                                content: line.trim(),
                                context: {
                                    before,
                                    after,
                                },
                            });
                        }
                    });

                    if (matches.length > 0) {
                        results.push({
                            file,
                            matches: matches.slice(0, maxResults),
                            totalMatches: matches.length,
                        });
                    }
                } catch (error) {
                    console.error(`[FileSearcher] Error reading file ${file}:`, error);
                }
            }
        } catch (error) {
            console.error('[FileSearcher] Error in native search:', error);
        }

        return results;
    }

    /**
     * 검색할 파일 목록 가져오기
     */
    private async getFilesToSearch(
        searchPath: string,
        options?: SearchOptions
    ): Promise<string[]> {
        const files: string[] = [];
        const includePatterns = options?.include || ['*'];
        const excludePatterns = options?.exclude || [];

        try {
            const uri = vscode.Uri.file(searchPath);
            const entries = await vscode.workspace.fs.readDirectory(uri);

            for (const [name, type] of entries) {
                const fullPath = path.join(searchPath, name);

                if (type === vscode.FileType.Directory) {
                    // 제외 패턴 체크
                    if (excludePatterns.some(pattern => this.matchesGlob(name, pattern))) {
                        continue;
                    }

                    // 시스템 내부 디렉토리 명시적 제외 (macOS/Windows 공통)
                    const lowerName = name.toLowerCase();
                    if (lowerName === 'node_modules' || lowerName === '.git' ||
                        lowerName === 'library' || lowerName === 'application support' ||
                        lowerName === 'windows' || lowerName === 'program files') {
                        continue;
                    }

                    const subFiles = await this.getFilesToSearch(fullPath, options);
                    files.push(...subFiles);
                } else if (type === vscode.FileType.File) {
                    // Include 패턴 체크
                    const matchesInclude = includePatterns.some(pattern => this.matchesGlob(name, pattern));
                    const matchesExclude = excludePatterns.some(pattern => this.matchesGlob(name, pattern));

                    if (matchesInclude && !matchesExclude) {
                        files.push(fullPath);
                    }
                }
            }
        } catch (error: any) {
            // 권한 에러(EACCES) 등은 로그 스팸을 피하기 위해 무시하거나 경고만 표시
            if (error.code === 'NoPermissions' || error.message?.includes('EACCES')) {
                // 권한 없는 디렉토리는 조용히 건너뜀
                return [];
            }
            console.warn(`[FileSearcher] Skipping directory ${searchPath}: ${error.message || error}`);
        }

        return files;
    }

    /**
     * Glob 패턴 매칭 (간단한 구현)
     */
    private matchesGlob(fileName: string, pattern: string): boolean {
        // 간단한 glob 매칭 (*, **, ?)
        const regex = new RegExp(
            '^' + pattern
                .replace(/\*\*/g, '.*')
                .replace(/\*/g, '[^\\\\/]*')
                .replace(/\?/g, '.')
            + '$'
        );
        return regex.test(fileName);
    }

    /**
     * 특정 파일에서 검색
     */
    public async searchInFile(
        filePath: string,
        pattern: string,
        contextLines?: number
    ): Promise<Match[]> {
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            const lines = content.split(/\r?\n/);
            const regex = new RegExp(pattern, 'gi');
            const context = contextLines ?? 2;
            const matches: Match[] = [];

            lines.forEach((line: string, index: number) => {
                if (regex.test(line)) {
                    const before: string[] = [];
                    const after: string[] = [];

                    for (let i = Math.max(0, index - context); i < index; i++) {
                        before.push(lines[i]);
                    }
                    for (let i = index + 1; i < Math.min(lines.length, index + 1 + context); i++) {
                        after.push(lines[i]);
                    }

                    matches.push({
                        line: index + 1,
                        column: line.search(regex),
                        content: line.trim(),
                        context: {
                            before,
                            after,
                        },
                    });
                }
            });

            return matches;
        } catch (error) {
            console.error(`[FileSearcher] Error searching in file ${filePath}:`, error);
            return [];
        }
    }

    /**
     * 검색 결과 하이라이트
     */
    public formatResults(results: SearchResult[], projectRoot: string): string {
        if (results.length === 0) {
            return "No matches found.";
        }

        let output = `Found ${results.length} files with matches.\n\n`;
        const MAX_RESULTS_DISPLAY = 50; // 너무 많은 결과는 LLM 컨텍스트를 과도하게 소모하므로 제한

        results.slice(0, MAX_RESULTS_DISPLAY).forEach((result) => {
            const relativePath = path.relative(projectRoot, result.file);
            output += `${relativePath}\n`;
            output += `│----\n`;

            result.matches.forEach((match, index) => {
                // 이전 컨텍스트
                if (match.context?.before) {
                    match.context.before.forEach(line => {
                        output += `│${line}\n`;
                    });
                }

                // 매치된 라인
                output += `│${match.content} (Line ${match.line})\n`;

                // 이후 컨텍스트
                if (match.context?.after) {
                    match.context.after.forEach(line => {
                        output += `│${line}\n`;
                    });
                }

                if (index < result.matches.length - 1) {
                    output += `│----\n`;
                }
            });

            output += `│----\n\n`;
        });

        if (results.length > MAX_RESULTS_DISPLAY) {
            output += `... and ${results.length - MAX_RESULTS_DISPLAY} more files. Use a more specific pattern if needed.`;
        }

        return output;
    }
}

