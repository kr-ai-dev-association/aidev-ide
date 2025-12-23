/**
 * Relevant Files Finder
 * 사용자 쿼리와 관련된 파일을 찾는 서비스
 */

import * as path from 'path';
import { glob } from 'glob';
import { ProjectManager } from '../../project/ProjectManager';
import { KeywordSelector } from '../KeywordSelector';
import { estimateTokens } from '../../../../utils';

export interface RelevantFilesResult {
    fileContentsContext: string;
    includedFilesForContext: { name: string; fullPath: string }[];
    extractedKeywords?: string[];
    selectedKeywords?: { keywords: string[]; reasoning: string; confidence: number };
}

export class RelevantFilesFinder {
    private projectManager: ProjectManager;
    private keywordService?: KeywordSelector;
    private readonly MAX_TOTAL_CONTENT_LENGTH = 1000000; // LLM 컨텍스트 최대 길이

    constructor(projectManager: ProjectManager) {
        this.projectManager = projectManager;
    }

    /**
     * 키워드 선택 서비스를 설정합니다
     */
    public setKeywordService(keywordService: KeywordSelector): void {
        this.keywordService = keywordService;
    }

    /**
     * 사용자 질의와 관련된 파일들을 자동으로 찾아서 컨텍스트에 추가합니다
     */
    public async getRelevantFilesContext(
        userQuery: string,
        projectRoot: string,
        abortSignal: AbortSignal,
        conversationHistory?: { userQuery: string; aiResponse?: string; timestamp: number }[]
    ): Promise<RelevantFilesResult> {
        const defaultResult: RelevantFilesResult = {
            fileContentsContext: '',
            includedFilesForContext: [],
            extractedKeywords: [],
            selectedKeywords: { keywords: [], reasoning: '', confidence: 0 }
        };

        let fileContentsContext = '';
        let currentTotalContentLength = 0;
        const includedFilesForContext: { name: string; fullPath: string }[] = [];
        const includedPathSet: Set<string> = new Set();

        try {
            // 1. 사용자 쿼리에서 명시적으로 언급된 파일 먼저 찾기 (최우선)
            const explicitFiles = await this.findExplicitFilesInQuery(userQuery, projectRoot, abortSignal);
            console.log(`[RelevantFilesFinder] 명시적으로 언급된 파일 찾기 완료: ${explicitFiles.length}개`);

            for (const filePath of explicitFiles) {
                if (abortSignal?.aborted) break;
                if (includedPathSet.has(filePath)) {
                    console.log(`[RelevantFilesFinder] 이미 포함된 파일 스킵: ${filePath}`);
                    continue; // 이미 포함된 파일은 스킵
                }
                if (currentTotalContentLength >= this.MAX_TOTAL_CONTENT_LENGTH) {
                    console.warn(`[RelevantFilesFinder] 컨텍스트 길이 제한으로 파일 읽기 중단: ${filePath}`);
                    break;
                }

                try {
                    const fs = await import('fs/promises');
                    console.log(`[RelevantFilesFinder] 파일 읽기 시도: ${filePath}`);
                    const content = await fs.readFile(filePath, 'utf8');
                    const relativePath = path.relative(projectRoot, filePath);
                    const fileExtension = path.extname(filePath).substring(1) || 'text';

                    console.log(`[RelevantFilesFinder] 파일 읽기 성공: ${relativePath} (${content.length} bytes)`);

                    if (currentTotalContentLength + content.length <= this.MAX_TOTAL_CONTENT_LENGTH) {
                        const fileContext = `파일명: ${relativePath}\n코드:\n\`\`\`${fileExtension}\n${content}\n\`\`\`\n\n`;
                        fileContentsContext += fileContext;
                        currentTotalContentLength += content.length;
                        includedFilesForContext.push({ name: relativePath, fullPath: filePath });
                        includedPathSet.add(filePath);
                        console.log(`[RelevantFilesFinder] 명시적으로 언급된 파일 컨텍스트에 추가: ${relativePath} (총 ${currentTotalContentLength} bytes)`);
                    } else {
                        fileContentsContext += `파일명: ${relativePath}\n코드:\n[INFO] 파일 내용이 너무 길어 생략되었습니다.\n\n`;
                        console.warn(`[RelevantFilesFinder] 파일이 너무 커서 생략: ${relativePath}`);
                    }
                } catch (error) {
                    console.error(`[RelevantFilesFinder] 명시적 파일 읽기 실패: ${filePath}`, error);
                }
            }

            console.log(`[RelevantFilesFinder] 명시적 파일 처리 완료. 현재 컨텍스트 길이: ${fileContentsContext.length} bytes`);

            // 키워드 추출
            const keywords = this.extractKeywordsFromQuery(userQuery);
            console.log(`[RelevantFilesFinder] 추출된 키워드: ${keywords.join(', ')}`);

            // 대화 히스토리에서 키워드 확장
            const expandedKeywords = this.expandKeywordsWithHistory(keywords, conversationHistory);

            // 관련 파일 찾기
            const relevantFiles = await this.findRelevantFiles(projectRoot, expandedKeywords, abortSignal);

            // 토큰 제한 기반 파일 선택
            const selectedFiles = this.selectFilesBasedOnTokenLimit(relevantFiles, userQuery, projectRoot);

            // 2. 키워드 기반으로 찾은 파일 내용 수집 (명시적 파일 제외)
            for (const filePath of selectedFiles) {
                if (abortSignal?.aborted) break;
                if (includedPathSet.has(filePath)) continue; // 이미 명시적 파일로 포함된 경우 스킵
                if (currentTotalContentLength >= this.MAX_TOTAL_CONTENT_LENGTH) {
                    fileContentsContext += '\n[INFO] 컨텍스트 길이 제한으로 일부 파일 내용이 생략되었습니다.\n';
                    break;
                }

                try {
                    const fs = await import('fs/promises');
                    const content = await fs.readFile(filePath, 'utf8');
                    const relativePath = path.relative(projectRoot, filePath);
                    const fileExtension = path.extname(filePath).substring(1) || 'text';

                    if (currentTotalContentLength + content.length <= this.MAX_TOTAL_CONTENT_LENGTH) {
                        fileContentsContext += `파일명: ${relativePath}\n코드:\n\`\`\`${fileExtension}\n${content}\n\`\`\`\n\n`;
                        currentTotalContentLength += content.length;
                        includedFilesForContext.push({ name: relativePath, fullPath: filePath });
                        includedPathSet.add(filePath);
                    } else {
                        fileContentsContext += `파일명: ${relativePath}\n코드:\n[INFO] 파일 내용이 너무 길어 생략되었습니다.\n\n`;
                    }
                } catch (error) {
                    console.warn(`[RelevantFilesFinder] 파일 읽기 실패: ${filePath}`, error);
                }
            }

            // LLM을 통한 키워드 선택 (선택적)
            let selectedKeywords: { keywords: string[]; reasoning: string; confidence: number } = { keywords: [], reasoning: '', confidence: 0 };
            if (this.keywordService && expandedKeywords.length > 0) {
                try {
                    selectedKeywords = await this.selectKeywordsWithLLM(userQuery, expandedKeywords, projectRoot);
                } catch (error) {
                    console.warn('[RelevantFilesFinder] LLM 키워드 선택 실패:', error);
                }
            }

            return {
                fileContentsContext,
                includedFilesForContext,
                extractedKeywords: expandedKeywords,
                selectedKeywords
            };
        } catch (error) {
            console.error('[RelevantFilesFinder] 관련 파일 컨텍스트 수집 중 오류:', error);
            return {
                fileContentsContext: fileContentsContext || '',
                includedFilesForContext: includedFilesForContext || [],
                extractedKeywords: [],
                selectedKeywords: { keywords: [], reasoning: '', confidence: 0 }
            };
        }
    }

    /**
     * 키워드를 추출합니다
     */
    private extractKeywordsFromQuery(userQuery: string): string[] {
        const cleanQuery = userQuery.toLowerCase()
            .replace(/[^\w\s가-힣]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        // 한국어 형태소 분석을 통한 키워드 추출
        const koreanStems = this.extractKoreanStems(cleanQuery);

        // 영어 단어들 추출
        const englishWords = cleanQuery.split(' ')
            .filter(word => word.length > 1)
            .filter(word => !this.isStopWord(word))
            .filter(word => !/^[가-힣]+$/.test(word));

        // 개발 관련 키워드 추가
        const developmentKeywords = this.getDevelopmentKeywords(userQuery);

        // 모든 키워드 결합
        const allKeywords = [...koreanStems, ...englishWords, ...developmentKeywords];

        // 키워드 우선순위 기반 필터링
        return this.prioritizeKeywords(allKeywords, userQuery);
    }

    /**
     * 한국어 형태소 분석을 통해 어간을 추출합니다
     */
    private extractKoreanStems(text: string): string[] {
        const koreanWords = text.split(' ')
            .filter(word => /^[가-힣]+$/.test(word))
            .filter(word => word.length > 1)
            .filter(word => !this.isKoreanStopWord(word));

        return koreanWords.map(word => this.extractKoreanStem(word));
    }

    /**
     * 한국어 어간 추출 (간단한 버전)
     */
    private extractKoreanStem(word: string): string {
        // 간단한 어간 추출 (실제로는 형태소 분석 라이브러리 사용 권장)
        if (word.length > 2) {
            return word.slice(0, -1); // 마지막 글자 제거
        }
        return word;
    }

    /**
     * 한국어 불용어 확인
     */
    private isKoreanStopWord(word: string): boolean {
        const stopWords = ['이', '가', '을', '를', '의', '에', '에서', '로', '으로', '와', '과', '도', '만', '은', '는', '이다', '다', '하다', '되다', '있다', '없다'];
        return stopWords.includes(word);
    }

    /**
     * 영어 불용어 확인
     */
    private isStopWord(word: string): boolean {
        const stopWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which', 'who', 'whom', 'whose', 'where', 'when', 'why', 'how'];
        return stopWords.includes(word.toLowerCase());
    }

    /**
     * 개발 관련 키워드를 추출합니다
     */
    private getDevelopmentKeywords(userQuery: string): string[] {
        const keywords: string[] = [];
        const queryLower = userQuery.toLowerCase();

        const techKeywords = [
            'react', 'vue', 'angular', 'node', 'express', 'typescript', 'javascript', 'python', 'java',
            'spring', 'springboot', 'boot', 'django', 'flask', 'vite', 'webpack', 'babel', 'eslint',
            'prettier', 'maven', 'gradle', 'npm', 'yarn', 'pnpm', 'bun'
        ];

        for (const keyword of techKeywords) {
            if (queryLower.includes(keyword)) {
                keywords.push(keyword);
            }
        }

        return keywords;
    }

    /**
     * 키워드 우선순위를 기반으로 필터링합니다
     */
    private prioritizeKeywords(keywords: string[], userQuery: string): string[] {
        const keywordScores = new Map<string, number>();

        for (const keyword of keywords) {
            let score = 0;

            if (userQuery.toLowerCase().includes(keyword.toLowerCase())) {
                score += 10;
            }

            const techKeywords = ['react', 'vue', 'angular', 'node', 'express', 'typescript', 'javascript', 'python', 'java', 'spring', 'springboot', 'boot', 'django', 'flask', 'vite', 'webpack', 'babel', 'eslint', 'prettier', 'maven', 'gradle'];
            if (techKeywords.includes(keyword.toLowerCase())) {
                score += 5;
            }

            const fileKeywords = ['src', 'package', 'config', 'main', 'index', 'app', 'component', 'service', 'util', 'helper', 'controller', 'repository', 'entity', 'application', 'resources'];
            if (fileKeywords.includes(keyword.toLowerCase())) {
                score += 2;
            }

            if (/^[가-힣]+$/.test(keyword)) {
                score += 3;
            }

            if (keyword.length < 2) {
                score -= 5;
            } else if (keyword.length > 20) {
                score -= 2;
            }

            keywordScores.set(keyword, score);
        }

        return Array.from(keywordScores.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([keyword]) => keyword);
    }

    /**
     * 대화 히스토리에서 키워드를 확장합니다
     */
    private expandKeywordsWithHistory(
        keywords: string[],
        conversationHistory?: { userQuery: string; aiResponse?: string; timestamp: number }[]
    ): string[] {
        if (!conversationHistory || conversationHistory.length === 0) {
            return keywords;
        }

        const expandedKeywords = new Set(keywords);

        // 최근 대화에서 키워드 추출
        for (const entry of conversationHistory.slice(-5)) {
            const historyKeywords = this.extractKeywordsFromQuery(entry.userQuery);
            historyKeywords.forEach(k => expandedKeywords.add(k));
        }

        return Array.from(expandedKeywords);
    }

    /**
     * 관련 파일을 찾습니다
     */
    private async findRelevantFiles(
        projectRoot: string,
        keywords: string[],
        abortSignal?: AbortSignal
    ): Promise<string[]> {
        const relevantFiles: string[] = [];
        const projectInfo = this.projectManager.getCurrentProject();

        // 프로젝트 타입에 따른 검색 패턴
        let searchPatterns: string[];

        if (projectInfo?.type === 'spring-boot' || projectInfo?.type === 'java') {
            searchPatterns = [
                'pom.xml', 'build.gradle', 'build.gradle.kts',
                'src/main/resources/application.properties',
                'src/main/resources/application.yml',
                'src/main/resources/application.yaml',
                'src/main/java/**/*.java',
                'src/test/java/**/*.java'
            ];
        } else if (projectInfo?.type === 'react' || projectInfo?.type === 'vue' || projectInfo?.type === 'angular') {
            searchPatterns = [
                'package.json',
                'src/**/*.ts', 'src/**/*.js', 'src/**/*.tsx', 'src/**/*.jsx', 'src/**/*.vue',
                'src/**/*.css', 'src/**/*.scss', 'src/**/*.html'
            ];
        } else {
            searchPatterns = [
                '**/*.ts', '**/*.js', '**/*.tsx', '**/*.jsx', '**/*.py', '**/*.java',
                '**/*.html', '**/*.css', '**/*.json', '**/*.yaml', '**/*.yml'
            ];
        }

        // 키워드 패턴 생성
        const keywordPatterns = this.generateKeywordPatterns(keywords);
        const allPatterns = [...searchPatterns, ...keywordPatterns];

        try {
            const indexer = (this.projectManager as any).indexer;
            if (!indexer) {
                return [];
            }

            for (const pattern of allPatterns) {
                if (abortSignal?.aborted) break;

                try {
                    const files = await glob(pattern, { cwd: projectRoot, nodir: true });
                    const fullPaths = files.map((file: string) => path.join(projectRoot, file));

                    for (const filePath of fullPaths) {
                        if (abortSignal?.aborted) break;

                        if (indexer.isLibraryPath && indexer.isLibraryPath(filePath, projectRoot)) {
                            continue;
                        }

                        const fileName = path.basename(filePath).toLowerCase();
                        const relativePath = path.relative(projectRoot, filePath).toLowerCase();

                        const isRelevant = keywords.some(keyword =>
                            fileName.includes(keyword.toLowerCase()) ||
                            relativePath.includes(keyword.toLowerCase())
                        );

                        if (isRelevant && !relevantFiles.includes(filePath)) {
                            relevantFiles.push(filePath);
                        }
                    }
                } catch (error) {
                    console.warn(`[RelevantFilesFinder] 패턴 검색 중 오류: ${pattern}`, error);
                }
            }
        } catch (error) {
            console.error('[RelevantFilesFinder] 파일 검색 중 오류:', error);
        }

        return relevantFiles;
    }

    /**
     * 키워드 기반 검색 패턴을 생성합니다
     */
    private generateKeywordPatterns(keywords: string[]): string[] {
        const patterns: string[] = [];
        const addedPatterns = new Set<string>();

        const topKeywords = keywords.slice(0, 5);

        for (const keyword of topKeywords) {
            const basicPatterns = [
                `**/*${keyword}*`,
                `**/${keyword}/**/*`
            ];

            for (const pattern of basicPatterns) {
                if (!addedPatterns.has(pattern)) {
                    patterns.push(pattern);
                    addedPatterns.add(pattern);
                }
            }
        }

        return patterns;
    }

    /**
     * 토큰 제한 기반 파일 선택
     */
    private selectFilesBasedOnTokenLimit(
        relevantFiles: string[],
        userQuery: string,
        projectRoot: string
    ): string[] {
        const fileScores = new Map<string, number>();
        const indexer = (this.projectManager as any).indexer;

        for (const filePath of relevantFiles) {
            if (indexer && indexer.isLibraryPath && indexer.isLibraryPath(filePath, projectRoot)) {
                continue;
            }

            let score = 0;
            const fileName = path.basename(filePath).toLowerCase();
            const relativePath = path.relative(projectRoot, filePath).toLowerCase();

            if (userQuery.toLowerCase().includes(fileName.split('.')[0])) {
                score += 20;
            }

            if (fileName === 'package.json' || fileName === 'tsconfig.json' || fileName === 'pom.xml' || fileName === 'build.gradle') {
                score += 15;
            }

            if (fileName.endsWith('.ts') || fileName.endsWith('.js') || fileName.endsWith('.tsx') || fileName.endsWith('.jsx') || fileName.endsWith('.java')) {
                score += 10;
            }

            if (relativePath.includes('src/main/java') || relativePath.includes('src/main/resources')) {
                score += 8;
            }

            fileScores.set(filePath, score);
        }

        return Array.from(fileScores.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 20)
            .map(([filePath]) => filePath);
    }

    /**
     * 사용자 쿼리에서 명시적으로 언급된 파일 경로를 추출하고 읽습니다.
     * 예: "design.md 파일 읽고", "App.tsx 수정", "package.json 확인" 등
     */
    private async findExplicitFilesInQuery(
        userQuery: string,
        projectRoot: string,
        abortSignal?: AbortSignal
    ): Promise<string[]> {
        const explicitFiles: string[] = [];

        // 파일명 패턴 추출 (예: design.md, App.tsx, package.json, 환급금조회_요구사항정의서.md 등)
        // 정규식: 파일명.확장자 형식 (공백, 따옴표, 백틱 등으로 구분)
        const filePatterns = [
            // 백틱으로 감싼 파일명: `design.md`, `App.tsx`
            /`([^\s`]+\.\w+)`/g,
            // 따옴표로 감싼 파일명: "design.md", 'App.tsx'
            /["']([^\s"']+\.\w+)["']/g,
            // 일반 파일명 패턴: design.md, App.tsx, 환급금조회_요구사항정의서.md (앞뒤에 공백이나 특수문자)
            // 언더스코어, 하이픈, 한글, 영문, 숫자 모두 포함
            /\b([a-zA-Z0-9가-힣_\-]+\.(md|ts|tsx|js|jsx|json|css|html|py|java|xml|yml|yaml|txt|sh|bat|ps1))\b/gi,
        ];

        console.log(`[RelevantFilesFinder] 명시적 파일 찾기 시작: "${userQuery}"`);

        const foundFileNames = new Set<string>();

        for (const pattern of filePatterns) {
            let match;
            // 정규식의 lastIndex를 초기화하기 위해 새로 생성
            const regex = new RegExp(pattern.source, pattern.flags);
            while ((match = regex.exec(userQuery)) !== null) {
                const fileName = match[1];
                console.log(`[RelevantFilesFinder] 파일명 패턴 매칭: ${fileName}`);
                if (fileName && !foundFileNames.has(fileName.toLowerCase())) {
                    foundFileNames.add(fileName.toLowerCase());
                    console.log(`[RelevantFilesFinder] 명시적으로 언급된 파일: ${fileName}`);

                    // 프로젝트 루트에서 파일 찾기
                    const possiblePaths = [
                        path.join(projectRoot, fileName), // 루트에 직접
                        path.join(projectRoot, 'src', fileName), // src/ 하위
                        path.join(projectRoot, 'src', '**', fileName), // src/ 하위 어디든
                    ];

                    for (const filePath of possiblePaths) {
                        if (abortSignal?.aborted) break;

                        try {
                            const fs = await import('fs/promises');
                            // glob 패턴이면 glob으로 검색
                            if (filePath.includes('**')) {
                                const glob = await import('glob');
                                const files = await glob.glob(filePath, { cwd: projectRoot, nodir: true });
                                if (files.length > 0) {
                                    const foundPath = path.join(projectRoot, files[0]);
                                    explicitFiles.push(foundPath);
                                    console.log(`[RelevantFilesFinder] 파일 찾기 성공 (glob): ${foundPath}`);
                                    break;
                                }
                            } else {
                                // 직접 경로 확인 - fs.existsSync 사용 (동기 방식이지만 파일 존재 확인에는 충분)
                                const fsSync = await import('fs');
                                if (fsSync.existsSync(filePath)) {
                                    explicitFiles.push(filePath);
                                    console.log(`[RelevantFilesFinder] 파일 찾기 성공: ${filePath}`);
                                    break;
                                }
                            }
                        } catch (error) {
                            // 파일이 없으면 다음 경로 시도
                            console.log(`[RelevantFilesFinder] 파일 찾기 실패 (다음 경로 시도): ${filePath}`);
                            continue;
                        }
                    }
                }
            }
        }

        console.log(`[RelevantFilesFinder] 명시적으로 언급된 파일: ${explicitFiles.map(f => path.relative(projectRoot, f)).join(', ')}`);
        return explicitFiles;
    }

    /**
     * LLM을 통한 키워드 선택
     */
    private async selectKeywordsWithLLM(
        userQuery: string,
        keywords: string[],
        projectRoot: string
    ): Promise<{ keywords: string[]; reasoning: string; confidence: number }> {
        if (!this.keywordService) {
            return {
                keywords: keywords.slice(0, 5),
                reasoning: 'LLM 서비스 미설정으로 기본 키워드 사용',
                confidence: 0.3
            };
        }

        try {
            // KeywordSelector를 사용하여 키워드 선택
            // 실제 구현은 KeywordSelector에 위임
            return {
                keywords: keywords.slice(0, 5),
                reasoning: 'LLM 키워드 선택 (구현 예정)',
                confidence: 0.7
            };
        } catch (error) {
            console.warn('[RelevantFilesFinder] LLM 키워드 선택 실패:', error);
            return {
                keywords: keywords.slice(0, 5),
                reasoning: 'LLM 키워드 선택 실패',
                confidence: 0.3
            };
        }
    }
}

