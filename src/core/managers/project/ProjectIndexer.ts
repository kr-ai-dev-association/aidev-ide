/**
 * Project Indexer
 * 파일 인덱싱을 담당하는 클래스
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { glob } from 'glob';
import {
    FileIndex,
    IndexedFile,
    Definition,
    Import,
    Export
} from './types';
import { ICodeParserAdapter } from './codeParser/ICodeParserAdapter';
import { TreeSitterAdapter } from './codeParser/TreeSitterAdapter';
import { EXCLUDED_LIBRARY_PATHS, getAllExclusionPaths } from '../../utils/FileExclusionConstants';

export class ProjectIndexer {
    private index: FileIndex = {
        files: new Map(),
        lastIndexedAt: 0,
        totalFiles: 0
    };
    private codeParserAdapter: ICodeParserAdapter;

    constructor() {
        this.codeParserAdapter = new TreeSitterAdapter();
    }

    /**
     * 프로젝트를 인덱싱합니다
     */
    public async indexProject(
        projectRoot: string,
        options?: {
            includePatterns?: string[];
            excludePatterns?: string[];
            maxFileSize?: number;
        }
    ): Promise<FileIndex> {
        console.log(`[ProjectIndexer] Indexing project: ${projectRoot}`);

        this.index.files.clear();
        this.index.totalFiles = 0;

        const includePatterns = options?.includePatterns || ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.py', '**/*.java'];
        const excludePatterns = options?.excludePatterns || [
            '**/node_modules/**',
            '**/dist/**',
            '**/build/**',
            '**/target/**',
            '**/.git/**'
        ];

        await this.indexDirectory(projectRoot, projectRoot, includePatterns, excludePatterns, options?.maxFileSize);

        this.index.lastIndexedAt = Date.now();
        this.index.totalFiles = this.index.files.size;

        console.log(`[ProjectIndexer] Indexed ${this.index.totalFiles} files`);

        return this.index;
    }

    /**
     * 디렉토리를 재귀적으로 인덱싱합니다
     */
    private async indexDirectory(
        dir: string,
        projectRoot: string,
        includePatterns: string[],
        excludePatterns: string[],
        maxFileSize?: number
    ): Promise<void> {
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);

                // 제외 패턴 확인
                const relativePath = path.relative(projectRoot, fullPath);
                if (this.matchesPattern(relativePath, excludePatterns)) {
                    continue;
                }

                if (entry.isDirectory()) {
                    await this.indexDirectory(fullPath, projectRoot, includePatterns, excludePatterns, maxFileSize);
                } else if (entry.isFile()) {
                    // 포함 패턴 확인
                    if (this.matchesPattern(relativePath, includePatterns)) {
                        await this.indexFile(fullPath, projectRoot, maxFileSize);
                    }
                }
            }
        } catch (error) {
            console.warn(`[ProjectIndexer] Failed to index directory ${dir}:`, error);
        }
    }

    /**
     * 파일을 인덱싱합니다
     */
    private async indexFile(
        filePath: string,
        projectRoot: string,
        maxFileSize?: number
    ): Promise<void> {
        try {
            const stats = fs.statSync(filePath);

            // 파일 크기 확인
            if (maxFileSize && stats.size > maxFileSize) {
                return;
            }

            const content = fs.readFileSync(filePath, 'utf8');
            const language = this.detectLanguage(filePath);
            const checksum = this.calculateChecksum(content);

            // Tree-sitter를 사용하여 정의 추출 (있는 경우)
            const definitions = await this.extractDefinitions(filePath, content, language);
            const imports = this.extractImports(content, language);
            const exports = this.extractExports(content, language);

            const indexedFile: IndexedFile = {
                path: filePath,
                language,
                size: stats.size,
                modifiedAt: stats.mtimeMs,
                checksum,
                definitions,
                imports,
                exports
            };

            this.index.files.set(filePath, indexedFile);

        } catch (error) {
            console.warn(`[ProjectIndexer] Failed to index file ${filePath}:`, error);
        }
    }

    /**
     * 정의를 추출합니다 (Tree-sitter 사용)
     */
    private async extractDefinitions(
        filePath: string,
        content: string,
        language: string
    ): Promise<Definition[]> {
        try {
            const fileSummary = await this.codeParserAdapter.parseFile(filePath);
            // FileDefinitions를 Definition[]로 변환
            if (fileSummary && fileSummary.definitions) {
                return fileSummary.definitions.map(def => ({
                    name: def.name,
                    type: def.type as any,
                    line: (def as any).line || 0,
                    column: (def as any).column || 0,
                    signature: (def as any).signature || ''
                }));
            }
        } catch (error) {
            console.warn(`[ProjectIndexer] Failed to extract definitions:`, error);
        }

        return [];
    }

    /**
     * Import 문을 추출합니다
     */
    private extractImports(content: string, language: string): Import[] {
        const imports: Import[] = [];

        if (language === 'typescript' || language === 'javascript') {
            const importPatterns = [
                /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g,
                /import\s+['"]([^'"]+)['"]/g,
                /require\(['"]([^'"]+)['"]\)/g
            ];

            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
                for (const pattern of importPatterns) {
                    let match;
                    while ((match = pattern.exec(lines[i])) !== null) {
                        imports.push({
                            source: match[1],
                            imported: [],
                            line: i
                        });
                    }
                }
            }
        } else if (language === 'python') {
            const importPattern = /^(?:from\s+(\S+)\s+)?import\s+(.+)/gm;
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
                const match = importPattern.exec(lines[i]);
                if (match) {
                    imports.push({
                        source: match[1] || match[2],
                        imported: [],
                        line: i
                    });
                }
            }
        }

        return imports;
    }

    /**
     * Export 문을 추출합니다
     */
    private extractExports(content: string, language: string): Export[] {
        const exports: Export[] = [];

        if (language === 'typescript' || language === 'javascript') {
            const exportPatterns = [
                /export\s+(?:default\s+)?(?:const|let|var|function|class|interface|type)\s+(\w+)/g,
                /export\s+default\s+/g
            ];

            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
                for (const pattern of exportPatterns) {
                    let match;
                    while ((match = pattern.exec(lines[i])) !== null) {
                        exports.push({
                            name: match[1] || 'default',
                            type: match[0].includes('default') ? 'default' : 'named',
                            line: i
                        });
                    }
                }
            }
        }

        return exports;
    }

    /**
     * 언어를 감지합니다
     */
    private detectLanguage(filePath: string): string {
        const ext = path.extname(filePath).toLowerCase().substring(1);
        
        const languageMap: Record<string, string> = {
            'ts': 'typescript',
            'tsx': 'typescript',
            'js': 'javascript',
            'jsx': 'javascript',
            'py': 'python',
            'java': 'java',
            'go': 'go',
            'rs': 'rust'
        };

        return languageMap[ext] || ext || 'text';
    }

    /**
     * 체크섬을 계산합니다
     */
    private calculateChecksum(content: string): string {
        return crypto.createHash('md5').update(content).digest('hex');
    }

    /**
     * 패턴 매칭 확인
     */
    private matchesPattern(filePath: string, patterns: string[]): boolean {
        for (const pattern of patterns) {
            // 간단한 glob 패턴 매칭
            const regex = new RegExp(
                '^' + pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*').replace(/\//g, '\\/') + '$'
            );
            if (regex.test(filePath)) {
                return true;
            }
        }
        return false;
    }

    /**
     * 인덱스를 가져옵니다
     */
    public getIndex(): FileIndex {
        return this.index;
    }

    /**
     * 파일을 찾습니다
     */
    public findFile(filePath: string): IndexedFile | undefined {
        return this.index.files.get(filePath);
    }

    /**
     * 인덱스를 초기화합니다
     */
    public clearIndex(): void {
        this.index.files.clear();
        this.index.lastIndexedAt = 0;
        this.index.totalFiles = 0;
        console.log('[ProjectIndexer] Index cleared');
    }

    /**
     * 프로젝트의 모든 파일 리스트를 수집합니다 (라이브러리 파일 제외)
     * @param projectRoot 프로젝트 루트 경로
     * @param abortSignal 취소 신호
     * @returns 파일 경로 리스트
     */
    public async getAllProjectFiles(projectRoot: string, abortSignal: AbortSignal): Promise<string[]> {
        const allFiles: string[] = [];

        try {
            // 모든 파일 타입을 검색 (라이브러리 디렉토리 제외)
            const searchPatterns = [
                '**/*.ts', '**/*.js', '**/*.tsx', '**/*.jsx', '**/*.py', '**/*.java', '**/*.cpp', '**/*.c',
                '**/*.cs', '**/*.php', '**/*.rb', '**/*.go', '**/*.rs', '**/*.swift', '**/*.kt', '**/*.scala',
                '**/*.html', '**/*.css', '**/*.scss', '**/*.sass', '**/*.json', '**/*.xml', '**/*.yaml', '**/*.yml',
                '**/*.md', '**/*.txt', '**/*.sql', '**/*.sh', '**/*.bat', '**/*.gradle', '**/*.kts',
                '**/*.properties', '**/*.conf', '**/*.config', '**/*.ini', '**/*.toml'
            ];

            for (const pattern of searchPatterns) {
                if (abortSignal.aborted) break;

                try {
                    const files = await glob(pattern, { cwd: projectRoot, nodir: true });
                    const fullPaths = files.map((file: string) => path.join(projectRoot, file));

                    for (const filePath of fullPaths) {
                        if (abortSignal.aborted) break;

                        try {
                            // 라이브러리 디렉토리 파일 제외
                            if (this.isLibraryPath(filePath, projectRoot)) {
                                continue;
                            }

                            // 중복 제거
                            if (!allFiles.includes(filePath)) {
                                allFiles.push(filePath);
                            }
                        } catch (error) {
                            console.warn(`[ProjectIndexer] 파일 처리 중 오류: ${filePath}`, error);
                        }
                    }
                } catch (error) {
                    console.warn(`[ProjectIndexer] 패턴 검색 중 오류: ${pattern}`, error);
                }
            }
        } catch (error) {
            console.error('[ProjectIndexer] 전체 파일 수집 중 오류:', error);
        }

        console.log(`[ProjectIndexer] 총 ${allFiles.length}개 파일 수집 완료`);
        return allFiles;
    }

    /**
     * 라이브러리 경로인지 확인합니다
     * @param filePath 파일 경로
     * @param projectRoot 프로젝트 루트 경로
     * @returns 라이브러리 경로인지 여부
     */
    public isLibraryPath(filePath: string, projectRoot: string): boolean {
        const relativePath = path.relative(projectRoot, filePath);
        const pathParts = relativePath.split(path.sep);

        // 경로의 각 부분을 확인하여 라이브러리 디렉토리인지 검사
        const allExclusions = getAllExclusionPaths();
        for (const part of pathParts) {
            if (allExclusions.includes(part.toLowerCase())) {
                return true;
            }
        }

        // 경로 자체에 라이브러리 디렉토리가 포함되어 있는지 확인
        const normalizedPath = relativePath.toLowerCase().replace(/\\/g, '/');
        for (const excludedPath of allExclusions) {
            if (normalizedPath.includes(`/${excludedPath}/`) ||
                normalizedPath.startsWith(`${excludedPath}/`) ||
                normalizedPath.endsWith(`/${excludedPath}`) ||
                normalizedPath === excludedPath) {
                return true;
            }
        }

        return false;
    }
}

