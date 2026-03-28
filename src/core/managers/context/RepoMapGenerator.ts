/**
 * RepoMapGenerator
 * Aider 스타일의 프로젝트 맵 생성기
 *
 * 파일 경로 + 주요 심볼(함수/클래스/인터페이스 등)을 추출하여
 * LLM 시스템 프롬프트에 포함할 수 있는 형태로 반환
 *
 * - fast-glob 기반 (vscode API 미사용 — CLI 환경에서도 동작)
 * - 파일 수에 따라 depth/심볼 전략 자동 조정
 * - ListCodeDefinitionsToolHandler의 심볼 추출 로직 재사용
 */

import * as fg from 'fast-glob';
import * as fs from 'fs/promises';
import * as path from 'path';

// ── 설정 ──────────────────────────────────────────────

/** 파일 수 임계값 */
const THRESHOLD_FULL = 500;         // 이하: 전체 파일 + 심볼
const THRESHOLD_MEDIUM = 2000;      // 이하: src/ 중심 + 심볼
// 초과: depth 1 + 주요 디렉토리만 depth 2

/** 심볼 추출 대상 확장자 */
const SYMBOL_EXTENSIONS = new Set([
    '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
    '.py', '.java', '.kt', '.go', '.rs',
]);

/** fast-glob 무시 패턴 */
const IGNORE_PATTERNS = [
    // JavaScript/TypeScript
    '**/node_modules/**',
    '**/.next/**',
    '**/.nuxt/**',
    '**/.svelte-kit/**',
    '**/.turbo/**',
    '**/.vercel/**',
    '**/.netlify/**',
    '**/.parcel-cache/**',
    '**/bower_components/**',
    // Python
    '**/.venv/**',
    '**/venv/**',
    '**/.env/**',
    '**/env/**',
    '**/__pycache__/**',
    '**/.tox/**',
    '**/.mypy_cache/**',
    '**/.pytest_cache/**',
    '**/.ruff_cache/**',
    '**/.pyenv/**',
    '**/.eggs/**',
    '**/*.egg-info/**',
    '**/site-packages/**',
    // Java/Kotlin/Gradle/Maven
    '**/.gradle/**',
    '**/target/**',
    '**/.m2/**',
    '**/.idea/**',
    // Rust
    '**/target/debug/**',
    '**/target/release/**',
    // Go
    '**/vendor/**',
    // C/C++
    '**/cmake-build-*/**',
    // .NET
    '**/bin/**',
    '**/obj/**',
    // 공통 빌드/캐시/출력
    '**/dist/**',
    '**/build/**',
    '**/out/**',
    '**/.cache/**',
    '**/coverage/**',
    '**/.git/**',
    '**/.DS_Store',
    '**/.hg/**',
    '**/.svn/**',
    '**/tmp/**',
    '**/temp/**',
    '**/logs/**',
];

/** 바이너리/불필요 파일 확장자 */
const SKIP_EXTENSIONS = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.bmp',
    '.woff', '.woff2', '.ttf', '.eot', '.otf',
    '.mp3', '.mp4', '.wav', '.avi', '.mov',
    '.zip', '.tar', '.gz', '.rar', '.7z',
    '.pdf', '.doc', '.docx', '.xls', '.xlsx',
    '.lock', '.map',
]);

/** 락 파일 (정확한 파일명) */
const SKIP_FILES = new Set([
    'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
    '.DS_Store', 'Thumbs.db',
]);

/** 심볼 추출 시 최대 파일 라인 수 */
const MAX_SYMBOL_FILE_LINES = 5000;

/** 최대 토큰 예산 (대략적 문자 수 기준, 1 토큰 ≈ 4 chars) */
const MAX_MAP_CHARS = 8000; // ~2000 토큰

// ── 타입 ──────────────────────────────────────────────

interface SymbolInfo {
    name: string;
    type: 'class' | 'function' | 'method' | 'interface' | 'type' | 'const' | 'variable' | 'enum';
    line: number;
    exported: boolean;
}

interface FileEntry {
    relativePath: string;
    symbols: SymbolInfo[];
}

interface RepoMapResult {
    map: string;
    fileCount: number;
    symbolCount: number;
    strategy: 'full' | 'medium' | 'compact';
}

// ── 캐시 ──────────────────────────────────────────────

let cachedResult: RepoMapResult | null = null;
let cachedProjectRoot: string = '';
let cachedTimestamp: number = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5분

// ── 메인 클래스 ───────────────────────────────────────

export class RepoMapGenerator {

    /**
     * 프로젝트 맵 생성 (캐시 적용)
     */
    static async generate(projectRoot: string, forceRefresh = false): Promise<RepoMapResult> {
        const now = Date.now();

        // 캐시 유효하면 반환
        if (
            !forceRefresh
            && cachedResult
            && cachedProjectRoot === projectRoot
            && (now - cachedTimestamp) < CACHE_TTL
        ) {
            return cachedResult;
        }

        const startTime = Date.now();

        // 1. 전체 파일 목록 수집
        const allFiles = await this.collectFiles(projectRoot);
        const totalFileCount = allFiles.length;

        console.log(`[RepoMapGenerator] Found ${totalFileCount} files in ${Date.now() - startTime}ms`);

        // 2. 전략 결정
        let result: RepoMapResult;

        if (totalFileCount <= THRESHOLD_FULL) {
            result = await this.buildFullMap(projectRoot, allFiles);
        } else if (totalFileCount <= THRESHOLD_MEDIUM) {
            result = await this.buildMediumMap(projectRoot, allFiles);
        } else {
            result = await this.buildCompactMap(projectRoot, allFiles);
        }

        // 3. 캐시 저장
        cachedResult = result;
        cachedProjectRoot = projectRoot;
        cachedTimestamp = now;

        console.log(`[RepoMapGenerator] Generated ${result.strategy} map: ${result.fileCount} files, ${result.symbolCount} symbols, ${result.map.length} chars (${Date.now() - startTime}ms)`);

        return result;
    }

    /**
     * 캐시 무효화
     */
    static invalidateCache(): void {
        cachedResult = null;
        cachedTimestamp = 0;
    }

    // ── 파일 수집 ─────────────────────────────────────

    private static async collectFiles(projectRoot: string): Promise<string[]> {
        const entries = await fg('**/*', {
            cwd: projectRoot,
            ignore: IGNORE_PATTERNS,
            onlyFiles: true,
            dot: false,
            absolute: false,
            suppressErrors: true,
        });

        // 바이너리, 락 파일 등 필터링
        return entries.filter(filePath => {
            const ext = path.extname(filePath).toLowerCase();
            const basename = path.basename(filePath);
            return !SKIP_EXTENSIONS.has(ext) && !SKIP_FILES.has(basename);
        }).sort();
    }

    // ── 전략별 맵 생성 ───────────────────────────────

    /**
     * FULL: 모든 파일 + 심볼 (≤500 파일)
     */
    private static async buildFullMap(projectRoot: string, files: string[]): Promise<RepoMapResult> {
        const entries = await this.extractSymbolsForFiles(projectRoot, files);
        const map = this.formatMap(entries, files.length, 'full');

        return {
            map: this.truncateToLimit(map),
            fileCount: files.length,
            symbolCount: entries.reduce((sum, e) => sum + e.symbols.length, 0),
            strategy: 'full',
        };
    }

    /**
     * MEDIUM: src/ 중심 파일에 심볼, 나머지는 경로만 (≤2000 파일)
     */
    private static async buildMediumMap(projectRoot: string, files: string[]): Promise<RepoMapResult> {
        // src/ 하위 또는 주요 소스 디렉토리 파일만 심볼 추출
        const SOURCE_DIRS = ['src/', 'lib/', 'app/', 'pages/', 'components/', 'server/', 'api/'];
        const sourceFiles = files.filter(f => SOURCE_DIRS.some(d => f.startsWith(d)));
        const otherFiles = files.filter(f => !SOURCE_DIRS.some(d => f.startsWith(d)));

        const entries = await this.extractSymbolsForFiles(projectRoot, sourceFiles);

        // 나머지 파일은 디렉토리 트리로 요약
        const otherTree = this.buildDirectoryTree(otherFiles, 2);

        let map = this.formatMap(entries, files.length, 'medium');
        if (otherTree) {
            map += `\n--- 기타 파일 (${otherFiles.length}개) ---\n${otherTree}`;
        }

        return {
            map: this.truncateToLimit(map),
            fileCount: files.length,
            symbolCount: entries.reduce((sum, e) => sum + e.symbols.length, 0),
            strategy: 'medium',
        };
    }

    /**
     * COMPACT: depth 제한 트리 + 주요 디렉토리만 심볼 (>2000 파일)
     */
    private static async buildCompactMap(projectRoot: string, files: string[]): Promise<RepoMapResult> {
        // depth 1 트리
        const tree = this.buildDirectoryTree(files, 2);

        // 주요 소스 디렉토리에서 상위 50개 파일만 심볼 추출
        const SOURCE_DIRS = ['src/', 'lib/', 'app/'];
        const sourceFiles = files
            .filter(f => SOURCE_DIRS.some(d => f.startsWith(d)))
            .slice(0, 50);

        const entries = await this.extractSymbolsForFiles(projectRoot, sourceFiles);

        let map = `=== PROJECT MAP (compact) ===\n총 ${files.length}개 파일\n\n`;
        map += `--- 디렉토리 구조 ---\n${tree}\n`;

        if (entries.length > 0) {
            map += `\n--- 주요 심볼 ---\n`;
            map += this.formatEntries(entries);
        }

        return {
            map: this.truncateToLimit(map),
            fileCount: files.length,
            symbolCount: entries.reduce((sum, e) => sum + e.symbols.length, 0),
            strategy: 'compact',
        };
    }

    // ── 심볼 추출 ─────────────────────────────────────

    private static async extractSymbolsForFiles(
        projectRoot: string,
        files: string[],
    ): Promise<FileEntry[]> {
        const entries: FileEntry[] = [];

        for (const relPath of files) {
            const ext = path.extname(relPath).toLowerCase();

            // 심볼 추출 대상이 아니면 심볼 없이 추가
            if (!SYMBOL_EXTENSIONS.has(ext)) {
                entries.push({ relativePath: relPath, symbols: [] });
                continue;
            }

            try {
                const absPath = path.join(projectRoot, relPath);
                const content = await fs.readFile(absPath, 'utf8');
                const lines = content.split('\n');

                if (lines.length > MAX_SYMBOL_FILE_LINES) {
                    entries.push({ relativePath: relPath, symbols: [] });
                    continue;
                }

                const symbols = this.extractSymbols(lines, ext);
                entries.push({ relativePath: relPath, symbols });
            } catch {
                entries.push({ relativePath: relPath, symbols: [] });
            }
        }

        return entries;
    }

    /**
     * 심볼 추출 (ListCodeDefinitionsToolHandler.extractSymbols와 동일 로직)
     */
    private static extractSymbols(lines: string[], ext: string): SymbolInfo[] {
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

                // top-level const/let
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

    // ── 포맷팅 ────────────────────────────────────────

    private static formatMap(entries: FileEntry[], totalFiles: number, strategy: string): string {
        let map = `=== PROJECT MAP (${strategy}) ===\n총 ${totalFiles}개 파일\n\n`;
        map += this.formatEntries(entries);
        return map;
    }

    private static formatEntries(entries: FileEntry[]): string {
        const lines: string[] = [];

        for (const entry of entries) {
            // exported 심볼만 필터링
            const exportedSymbols = entry.symbols.filter(s => s.exported);
            const roleTag = this.inferRoleTag(entry.relativePath);
            const pathLine = roleTag
                ? `${entry.relativePath}  [${roleTag}]`
                : entry.relativePath;

            if (exportedSymbols.length > 0) {
                lines.push(pathLine);
                for (const sym of exportedSymbols) {
                    lines.push(`  ${sym.type.padEnd(10)} ${sym.name}`);
                }
            } else {
                lines.push(pathLine);
            }
        }

        return lines.join('\n');
    }

    /**
     * 파일 경로에서 역할 태그를 추론 (heuristic)
     */
    private static inferRoleTag(relativePath: string): string | null {
        const lower = relativePath.toLowerCase();
        const basename = path.basename(lower, path.extname(lower));

        // 경로 기반 역할 추론
        if (lower.includes('/controller') || lower.includes('/controllers/') || basename.endsWith('controller')) return 'controller';
        if (lower.includes('/route') || lower.includes('/routes/') || lower.includes('/router') || basename.endsWith('router')) return 'route';
        if (lower.includes('/service') || lower.includes('/services/') || basename.endsWith('service')) return 'service';
        if (lower.includes('/repositor') || lower.includes('/repositories/') || basename.endsWith('repository') || basename.endsWith('repo')) return 'repo';
        if (lower.includes('/model') || lower.includes('/models/') || lower.includes('/entities/') || basename.endsWith('model') || basename.endsWith('entity')) return 'model';
        if (lower.includes('/schema') || lower.includes('/schemas/') || lower.includes('/dto/') || basename.endsWith('schema') || basename.endsWith('dto')) return 'schema';
        if (lower.includes('/middleware') || basename.endsWith('middleware')) return 'middleware';
        if (lower.includes('/util') || lower.includes('/utils/') || lower.includes('/helper') || lower.includes('/helpers/')) return 'util';
        if (lower.includes('/config') || basename === 'config' || basename.endsWith('config')) return 'config';
        if (lower.includes('/test') || lower.includes('/__tests__/') || lower.includes('.test.') || lower.includes('.spec.')) return 'test';
        if (lower.includes('/hook') || lower.includes('/hooks/') || basename.startsWith('use')) return 'hook';
        if (lower.includes('/component') || lower.includes('/components/') || lower.includes('/pages/') || lower.includes('/views/')) return 'ui';
        if (lower.includes('/api/') || lower.includes('/endpoints/')) return 'api';
        if (lower.includes('/store') || lower.includes('/stores/') || lower.includes('/state/') || lower.includes('/redux/') || lower.includes('/zustand/')) return 'store';
        if (lower.includes('/type') || lower.includes('/types/') || basename.endsWith('.d')) return 'type';

        return null;
    }

    /**
     * 디렉토리 트리 생성 (지정된 depth까지)
     */
    private static buildDirectoryTree(files: string[], maxDepth: number): string {
        const tree: Map<string, number> = new Map(); // dir → fileCount

        for (const filePath of files) {
            const parts = filePath.split('/');
            // depth 제한까지만 집계
            for (let d = 1; d <= Math.min(parts.length - 1, maxDepth); d++) {
                const dir = parts.slice(0, d).join('/') + '/';
                tree.set(dir, (tree.get(dir) || 0) + 1);
            }
        }

        // 정렬 후 출력
        const sortedDirs = [...tree.entries()].sort((a, b) => a[0].localeCompare(b[0]));
        const lines: string[] = [];

        for (const [dir, count] of sortedDirs) {
            const depth = dir.split('/').length - 2; // depth 0부터 시작
            const indent = '  '.repeat(depth);
            const dirName = dir.split('/').filter(Boolean).pop() || dir;
            lines.push(`${indent}${dirName}/  (${count} files)`);
        }

        return lines.join('\n');
    }

    /**
     * 최대 문자 수 제한 (토큰 예산)
     */
    private static truncateToLimit(map: string): string {
        if (map.length <= MAX_MAP_CHARS) {
            return map;
        }

        // 뒤에서부터 자르고 truncation 안내 추가
        const truncated = map.substring(0, MAX_MAP_CHARS - 100);
        const lastNewline = truncated.lastIndexOf('\n');
        return truncated.substring(0, lastNewline) + '\n\n... (truncated — glob_search로 추가 파일 검색 가능)';
    }
}
