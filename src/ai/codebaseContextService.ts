import * as vscode from 'vscode';
import * as path from 'path';
import { glob } from 'glob';
import { getFileType } from '../utils/fileUtils';
import { ConfigurationService } from '../services/configurationService';
import { NotificationService } from '../services/notificationService';

export class CodebaseContextService {
    private configurationService: ConfigurationService;
    private notificationService: NotificationService;
    private readonly MAX_TOTAL_CONTENT_LENGTH = 1000000; // LLM 컨텍스트 최대 길이
    private readonly EXCLUDED_EXTENSIONS = [
        '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp', '.ico', // Images
        '.pdf', '.zip', '.tar', '.gz', '.rar', '.7z',                     // Archives/Binary documents
        '.exe', '.dll', '.bin',                                           // Executables/Binaries
        '.sqlite', '.db',                                                 // Databases
        '.lock', '.log', '.tmp', '.temp'                                  // Lock/Log/Temp files
    ];

    constructor(configurationService: ConfigurationService, notificationService: NotificationService) {
        this.configurationService = configurationService;
        this.notificationService = notificationService;
    }

    /**
     * 사용자 질의와 관련된 파일들을 자동으로 찾아서 컨텍스트에 추가합니다.
     * @param userQuery 사용자의 질의
     * @param abortSignal 취소 신호
     * @returns 파일 컨텍스트와 포함된 파일 목록
     */
    public async getRelevantFilesContext(userQuery: string, abortSignal: AbortSignal, conversationHistory?: { userQuery: string, aiResponse?: string, timestamp: number }[]): Promise<{ fileContentsContext: string, includedFilesForContext: { name: string, fullPath: string }[] }> {
        const projectRoot = await this.configurationService.getProjectRoot();
        if (!projectRoot) {
            this.notificationService.showWarningMessage('프로젝트 루트가 설정되지 않았습니다. 설정에서 프로젝트 루트를 지정해주세요.');
            return { fileContentsContext: '', includedFilesForContext: [] };
        }

        let fileContentsContext = "";
        let currentTotalContentLength = 0;
        const includedFilesForContext: { name: string, fullPath: string }[] = [];

        try {
            // 질의에서 키워드 추출
            const keywords = this.extractKeywordsFromQuery(userQuery);
            console.log(`[CodebaseContextService] 추출된 키워드: ${keywords.join(', ')}`);

            // 대화 기록을 활용한 키워드 확장
            const expandedKeywords = this.expandKeywordsWithHistory(keywords, conversationHistory);
            console.log(`[CodebaseContextService] 대화 기록 기반 확장 키워드: ${expandedKeywords.join(', ')}`);

            // 프로젝트 루트에서 관련 파일들 검색
            const relevantFiles = await this.findRelevantFiles(projectRoot, expandedKeywords, abortSignal);
            console.log(`[CodebaseContextService] 관련 파일 ${relevantFiles.length}개 발견`);

            // 토큰 사용량을 고려한 파일 선별
            const selectedFiles = this.selectFilesBasedOnTokenLimit(relevantFiles, userQuery);
            console.log(`[CodebaseContextService] 토큰 제한 고려하여 ${selectedFiles.length}개 파일 선별`);

            // 파일들을 우선순위에 따라 정렬
            const sortedFiles = this.prioritizeFiles(selectedFiles, expandedKeywords);

            // 파일 내용을 컨텍스트에 추가
            for (const filePath of sortedFiles) {
                if (abortSignal.aborted) {
                    this.notificationService.showWarningMessage('컨텍스트 수집이 취소되었습니다.');
                    break;
                }
                if (currentTotalContentLength >= this.MAX_TOTAL_CONTENT_LENGTH) {
                    fileContentsContext += "\n[INFO] 컨텍스트 길이 제한으로 일부 파일 내용이 생략되었습니다.\n";
                    break;
                }

                try {
                    const uri = vscode.Uri.file(filePath);
                    const stats = await vscode.workspace.fs.stat(uri);

                    if (stats.type === vscode.FileType.File) {
                        // 제외된 확장자 확인
                        if (this.EXCLUDED_EXTENSIONS.includes(path.extname(filePath).toLowerCase())) {
                            continue;
                        }

                        const contentBytes = await vscode.workspace.fs.readFile(uri);
                        const content = Buffer.from(contentBytes).toString('utf8');

                        // 워크스페이스 기준 상대 경로를 얻거나, 없으면 기본 파일명 사용
                        const nameForContext = this.getPathRelativeToWorkspace(filePath) || path.basename(filePath);
                        const fileType = getFileType(filePath);

                        // 파일 내용을 컨텍스트에 추가
                        fileContentsContext += `\n--- 파일: ${nameForContext} (${fileType}) ---\n${content}\n`;
                        includedFilesForContext.push({
                            name: path.basename(filePath),
                            fullPath: filePath
                        });

                        currentTotalContentLength += content.length;
                    }
                } catch (error) {
                    console.warn(`[CodebaseContextService] 파일 읽기 실패: ${filePath}`, error);
                }
            }

            console.log(`[CodebaseContextService] 총 ${includedFilesForContext.length}개 파일이 컨텍스트에 포함됨`);
            return { fileContentsContext, includedFilesForContext };

        } catch (error) {
            console.error('[CodebaseContextService] 관련 파일 검색 중 오류:', error);
            this.notificationService.showErrorMessage('관련 파일 검색 중 오류가 발생했습니다.');
            return { fileContentsContext: '', includedFilesForContext: [] };
        }
    }

    /**
     * 사용자 질의에서 키워드를 추출합니다.
     * @param userQuery 사용자의 질의
     * @returns 추출된 키워드 배열
     */
    private extractKeywordsFromQuery(userQuery: string): string[] {
        // 질의를 소문자로 변환하고 특수문자 제거
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
            .filter(word => !/^[가-힣]+$/.test(word)); // 한국어가 아닌 것만

        // 일반적인 개발 관련 키워드 추가 (제한적으로)
        const developmentKeywords = this.getDevelopmentKeywords(userQuery);

        // 모든 키워드 결합
        const allKeywords = [...koreanStems, ...englishWords, ...developmentKeywords];

        // 키워드 우선순위 기반 필터링 및 중복 제거
        const prioritizedKeywords = this.prioritizeKeywords(allKeywords, userQuery);

        console.log(`[CodebaseContextService] 원본 질의: "${userQuery}"`);
        console.log(`[CodebaseContextService] 한국어 어간: ${koreanStems.join(', ')}`);
        console.log(`[CodebaseContextService] 영어 단어: ${englishWords.join(', ')}`);
        console.log(`[CodebaseContextService] 개발 키워드: ${developmentKeywords.join(', ')}`);
        console.log(`[CodebaseContextService] 최종 키워드: ${prioritizedKeywords.join(', ')}`);

        return prioritizedKeywords;
    }

    /**
     * 키워드 우선순위를 기반으로 필터링하고 중복을 제거합니다.
     * @param keywords 키워드 배열
     * @param userQuery 사용자 질의
     * @returns 우선순위가 높은 키워드 배열 (최대 10개)
     */
    private prioritizeKeywords(keywords: string[], userQuery: string): string[] {
        // 키워드 점수 계산
        const keywordScores = new Map<string, number>();

        for (const keyword of keywords) {
            let score = 0;

            // 1. 질의에서 직접 언급된 키워드 (높은 점수)
            if (userQuery.toLowerCase().includes(keyword.toLowerCase())) {
                score += 10;
            }

            // 2. 기술적 키워드 (중간 점수)
            const techKeywords = ['react', 'vue', 'angular', 'node', 'express', 'typescript', 'javascript', 'python', 'java', 'spring', 'django', 'flask', 'vite', 'webpack', 'babel', 'eslint', 'prettier'];
            if (techKeywords.includes(keyword.toLowerCase())) {
                score += 5;
            }

            // 3. 파일/폴더 관련 키워드 (낮은 점수)
            const fileKeywords = ['src', 'package', 'config', 'main', 'index', 'app', 'component', 'service', 'util', 'helper'];
            if (fileKeywords.includes(keyword.toLowerCase())) {
                score += 2;
            }

            // 4. 한국어 키워드 (중간 점수)
            if (/^[가-힣]+$/.test(keyword)) {
                score += 3;
            }

            // 5. 길이 기반 점수 (너무 짧거나 긴 키워드 감점)
            if (keyword.length < 2) {
                score -= 5;
            } else if (keyword.length > 20) {
                score -= 2;
            }

            keywordScores.set(keyword, score);
        }

        // 점수 순으로 정렬하고 상위 10개만 선택
        const sortedKeywords = Array.from(keywordScores.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([keyword]) => keyword);

        console.log(`[CodebaseContextService] 키워드 우선순위 점수:`, Array.from(keywordScores.entries()).sort((a, b) => b[1] - a[1]));

        return sortedKeywords;
    }

    /**
     * 한국어 형태소 분석을 통해 어간을 추출합니다.
     * @param text 분석할 텍스트
     * @returns 추출된 어간 배열
     */
    private extractKoreanStems(text: string): string[] {
        const koreanWords = text.split(' ')
            .filter(word => /^[가-힣]+$/.test(word)) // 한국어만
            .filter(word => word.length > 1)
            .filter(word => !this.isKoreanStopWord(word));

        const stems: string[] = [];

        for (const word of koreanWords) {
            const stem = this.extractKoreanStem(word);
            if (stem && stem.length > 1) {
                stems.push(stem);
            }
        }

        return [...new Set(stems)]; // 중복 제거
    }

    /**
     * 한국어 단어에서 어간을 추출합니다.
     * @param word 한국어 단어
     * @returns 추출된 어간
     */
    private extractKoreanStem(word: string): string {
        // 간단한 한국어 어간 추출 (조사/어미 제거)
        const endings = [
            // 조사
            '을', '를', '이', '가', '은', '는', '에', '에서', '로', '으로', '와', '과', '의', '도', '만', '부터', '까지', '처럼', '같이',
            // 어미
            '다', '요', '어요', '아요', '해요', '세요', '세요', '습니다', '습니다', '어', '아', '해', '지', '고', '면', '는데', '지만', '면서',
            // 동사/형용사 어미
            '하다', '되다', '있다', '없다', '이다', '아니다', '같다', '다르다', '크다', '작다', '좋다', '나쁘다',
            // 활용 어미
            '하는', '한', '될', '된', '있는', '없는', '같은', '다른', '큰', '작은', '좋은', '나쁜'
        ];

        let stem = word;

        // 가장 긴 어미부터 제거
        const sortedEndings = endings.sort((a, b) => b.length - a.length);

        for (const ending of sortedEndings) {
            if (stem.endsWith(ending) && stem.length > ending.length) {
                stem = stem.slice(0, -ending.length);
                break; // 하나의 어미만 제거
            }
        }

        return stem;
    }

    /**
     * 한국어 불용어인지 확인합니다.
     * @param word 확인할 단어
     * @returns 한국어 불용어 여부
     */
    private isKoreanStopWord(word: string): boolean {
        const koreanStopWords = [
            '이', '가', '을', '를', '은', '는', '에', '에서', '로', '으로', '와', '과', '의', '도', '만', '부터', '까지',
            '하다', '되다', '있다', '없다', '이다', '아니다', '같다', '다르다', '크다', '작다', '좋다', '나쁘다',
            '코드', '파일', '함수', '클래스', '변수', '메서드', '프로그램', '개발', '작성', '만들', '생성', '분석', '설명'
        ];
        return koreanStopWords.includes(word);
    }

    /**
     * 불용어인지 확인합니다.
     * @param word 확인할 단어
     * @returns 불용어 여부
     */
    private isStopWord(word: string): boolean {
        const stopWords = [
            'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
            'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did',
            'will', 'would', 'could', 'should', 'may', 'might', 'can', 'must', 'shall',
            'this', 'that', 'these', 'those', 'a', 'an', 'the',
            'how', 'what', 'when', 'where', 'why', 'who', 'which',
            'please', 'help', 'me', 'my', 'your', 'our', 'their'
        ];
        return stopWords.includes(word.toLowerCase());
    }

    /**
     * 대화 기록을 활용하여 키워드를 확장합니다.
     * @param keywords 기본 키워드 배열
     * @param conversationHistory 대화 기록
     * @returns 확장된 키워드 배열
     */
    private expandKeywordsWithHistory(keywords: string[], conversationHistory?: { userQuery: string, aiResponse?: string, timestamp: number }[]): string[] {
        if (!conversationHistory || conversationHistory.length === 0) {
            return keywords;
        }

        const expandedKeywords = [...keywords];

        // 최근 3개 대화에서 키워드 추출
        const recentConversations = conversationHistory.slice(-3);

        for (const conversation of recentConversations) {
            // 사용자 질의에서 키워드 추출
            const userKeywords = this.extractKeywordsFromQuery(conversation.userQuery);
            expandedKeywords.push(...userKeywords);

            // AI 응답에서도 키워드 추출 (요약된 응답이므로 간단히)
            if (conversation.aiResponse) {
                const responseKeywords = this.extractKeywordsFromResponse(conversation.aiResponse);
                expandedKeywords.push(...responseKeywords);
            }
        }

        // 중복 제거
        return [...new Set(expandedKeywords)];
    }

    /**
     * AI 응답에서 키워드를 추출합니다.
     * @param response AI 응답 텍스트
     * @returns 추출된 키워드 배열
     */
    private extractKeywordsFromResponse(response: string): string[] {
        // AI 응답에서 파일명, 함수명, 클래스명 등을 추출
        const keywords: string[] = [];

        // 파일명 패턴 추출 (예: "src/main.js", "package.json")
        const filePattern = /([a-zA-Z0-9_\-\.\/]+\.(js|ts|tsx|jsx|py|java|cpp|c|cs|php|rb|go|rs|swift|kt|scala|html|css|scss|sass|json|xml|yaml|yml|md|txt|sql|sh|bat))/g;
        const fileMatches = response.match(filePattern);
        if (fileMatches) {
            keywords.push(...fileMatches.map(match => match.split('/').pop()?.split('.')[0]).filter(Boolean) as string[]);
        }

        // 함수명/클래스명 패턴 추출 (예: "getUserData", "UserService")
        const namePattern = /([A-Z][a-zA-Z0-9]*|[a-z][a-zA-Z0-9]*)/g;
        const nameMatches = response.match(namePattern);
        if (nameMatches) {
            keywords.push(...nameMatches.filter(name => name.length > 2));
        }

        // 한국어 키워드 추출
        const koreanStems = this.extractKoreanStems(response);
        keywords.push(...koreanStems);

        return [...new Set(keywords)];
    }

    /**
     * 질의에서 개발 관련 키워드를 추출합니다.
     * @param userQuery 사용자의 질의
     * @returns 개발 관련 키워드 배열 (최대 5개)
     */
    private getDevelopmentKeywords(userQuery: string): string[] {
        const keywords: string[] = [];
        const query = userQuery.toLowerCase();

        // 질의에 따라 최소한의 관련 키워드만 추가
        if (query.includes('분석') || query.includes('analyze') || query.includes('analysis')) {
            keywords.push('src', 'main', 'index');
        }

        if (query.includes('프로젝트') || query.includes('project')) {
            keywords.push('package', 'src');
        }

        if (query.includes('구조') || query.includes('structure') || query.includes('architecture')) {
            keywords.push('src', 'lib');
        }

        if (query.includes('설정') || query.includes('config') || query.includes('setting')) {
            keywords.push('config', 'package');
        }

        if (query.includes('API') || query.includes('api')) {
            keywords.push('api', 'service');
        }

        if (query.includes('데이터베이스') || query.includes('database') || query.includes('db')) {
            keywords.push('database', 'db', 'model', 'schema', 'migration', 'seed');
        }

        if (query.includes('테스트') || query.includes('test')) {
            keywords.push('test', 'spec', 'mock', 'stub', 'fixture');
        }

        if (query.includes('스타일') || query.includes('style') || query.includes('CSS')) {
            keywords.push('css', 'style', 'scss', 'sass', 'less', 'styl');
        }

        if (query.includes('컴포넌트') || query.includes('component')) {
            keywords.push('component', 'view', 'template', 'ui');
        }

        if (query.includes('유틸리티') || query.includes('utility') || query.includes('util')) {
            keywords.push('util', 'helper', 'tool', 'common', 'shared');
        }

        // 파일 확장자 기반 키워드
        if (query.includes('javascript') || query.includes('js')) {
            keywords.push('js', 'javascript', 'node');
        }

        if (query.includes('typescript') || query.includes('ts')) {
            keywords.push('ts', 'typescript', 'interface', 'type');
        }

        if (query.includes('react')) {
            keywords.push('react', 'jsx', 'tsx', 'component', 'hook');
        }

        if (query.includes('vue')) {
            keywords.push('vue', 'template', 'component');
        }

        if (query.includes('angular')) {
            keywords.push('angular', 'component', 'service', 'module');
        }

        if (query.includes('python') || query.includes('py')) {
            keywords.push('py', 'python', 'django', 'flask', 'fastapi');
        }

        if (query.includes('java')) {
            keywords.push('java', 'class', 'spring', 'maven', 'gradle');
        }

        // 일반적인 개발 파일명
        keywords.push('index', 'main', 'app', 'server', 'client', 'router', 'controller', 'model', 'view');

        return [...new Set(keywords)]; // 중복 제거
    }

    /**
     * 프로젝트 루트에서 관련 파일들을 검색합니다.
     * @param projectRoot 프로젝트 루트 경로
     * @param keywords 검색 키워드
     * @param abortSignal 취소 신호
     * @returns 관련 파일 경로 배열
     */
    private async findRelevantFiles(projectRoot: string, keywords: string[], abortSignal: AbortSignal): Promise<string[]> {
        const relevantFiles: string[] = [];

        // 프로젝트 타입 감지
        const isNodeProject = await this.isNodeProject(projectRoot);
        const isFrontendFramework = await this.isFrontendFramework(projectRoot);

        let searchPatterns: string[];

        if (isNodeProject && isFrontendFramework) {
            // Node.js 기반 프론트엔드 프레임워크 프로젝트의 경우 제한된 검색
            console.log('[CodebaseContextService] Node.js 기반 프론트엔드 프레임워크 프로젝트 감지 - 제한된 검색 수행');
            searchPatterns = [
                'package.json',
                'src/**/*.ts', 'src/**/*.js', 'src/**/*.tsx', 'src/**/*.jsx', 'src/**/*.vue',
                'src/**/*.css', 'src/**/*.scss', 'src/**/*.sass', 'src/**/*.less', 'src/**/*.html',
                'src/**/*.json', 'src/**/*.md', 'src/**/*.svelte'
            ];
        } else {
            // 일반적인 검색 패턴
            searchPatterns = [
                '**/*.ts', '**/*.js', '**/*.tsx', '**/*.jsx', '**/*.py', '**/*.java', '**/*.cpp', '**/*.c',
                '**/*.cs', '**/*.php', '**/*.rb', '**/*.go', '**/*.rs', '**/*.swift', '**/*.kt', '**/*.scala',
                '**/*.html', '**/*.css', '**/*.scss', '**/*.sass', '**/*.json', '**/*.xml', '**/*.yaml', '**/*.yml',
                '**/*.md', '**/*.txt', '**/*.sql', '**/*.sh', '**/*.bat'
            ];
        }

        try {
            // 키워드별로 관련 디렉토리와 파일 패턴 생성
            const keywordPatterns = this.generateKeywordPatterns(keywords);
            console.log(`[CodebaseContextService] 생성된 키워드 패턴: ${keywordPatterns.join(', ')}`);

            // 모든 검색 패턴과 키워드 패턴을 결합
            const allPatterns = [...searchPatterns, ...keywordPatterns];

            for (const pattern of allPatterns) {
                if (abortSignal.aborted) break;

                try {
                    const files = await glob(pattern, { cwd: projectRoot, nodir: true });
                    const fullPaths = files.map((file: string) => path.join(projectRoot, file));

                    for (const filePath of fullPaths) {
                        if (abortSignal.aborted) break;

                        try {
                            // node_modules 하위 파일 제외
                            const relativePath = path.relative(projectRoot, filePath);
                            if (relativePath.includes('node_modules/') || relativePath.startsWith('node_modules/')) {
                                continue;
                            }

                            // 파일명이나 경로에 키워드가 포함되어 있는지 확인
                            const fileName = path.basename(filePath).toLowerCase();
                            const relativePathLower = relativePath.toLowerCase();

                            const isRelevant = keywords.some(keyword =>
                                fileName.includes(keyword) ||
                                relativePathLower.includes(keyword) ||
                                this.isKeywordRelated(filePath, keyword)
                            );

                            if (isRelevant && !relevantFiles.includes(filePath)) {
                                relevantFiles.push(filePath);
                            }
                        } catch (error) {
                            console.warn(`[CodebaseContextService] 파일 검색 중 오류: ${filePath}`, error);
                        }
                    }
                } catch (error) {
                    console.warn(`[CodebaseContextService] 패턴 검색 중 오류: ${pattern}`, error);
                }
            }
        } catch (error) {
            console.error('[CodebaseContextService] 파일 검색 중 오류:', error);
        }

        console.log(`[CodebaseContextService] 총 ${relevantFiles.length}개 파일 발견`);

        // 검색된 파일들의 리스트를 디버그 콘솔에 출력
        if (relevantFiles.length > 0) {
            console.log('[CodebaseContextService] 검색된 파일 목록:');
            relevantFiles.forEach((filePath, index) => {
                const relativePath = path.relative(projectRoot, filePath);
                console.log(`  ${index + 1}. ${relativePath}`);
            });
        }

        return relevantFiles;
    }

    /**
     * Node.js 프로젝트인지 확인합니다.
     */
    private async isNodeProject(projectRoot: string): Promise<boolean> {
        try {
            const packageJsonPath = path.join(projectRoot, 'package.json');
            const fs = await import('fs/promises');
            await fs.access(packageJsonPath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * 프론트엔드 프레임워크 프로젝트인지 확인합니다.
     * React, Vue, Angular, Svelte, Next.js, Nuxt.js 등을 감지합니다.
     */
    private async isFrontendFramework(projectRoot: string): Promise<boolean> {
        try {
            const packageJsonPath = path.join(projectRoot, 'package.json');
            const fs = await import('fs/promises');
            const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
            const packageJson = JSON.parse(packageJsonContent);

            const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };

            // React 관련
            const isReact = !!(dependencies.react || dependencies['@vitejs/plugin-react'] || dependencies['react-scripts']);

            // Vue 관련
            const isVue = !!(dependencies.vue || dependencies['@vitejs/plugin-vue'] || dependencies['vue-cli-service']);

            // Angular 관련
            const isAngular = !!(dependencies['@angular/core'] || dependencies['@angular/cli']);

            // Svelte 관련
            const isSvelte = !!(dependencies.svelte || dependencies['@sveltejs/kit'] || dependencies['vite-plugin-svelte']);

            // Next.js 관련
            const isNext = !!(dependencies.next || dependencies['@next/babel-plugin-react-require']);

            // Nuxt.js 관련
            const isNuxt = !!(dependencies.nuxt || dependencies['@nuxt/core']);

            // Vite 관련 (다양한 프레임워크와 함께 사용)
            const isVite = !!(dependencies.vite || dependencies['@vitejs/plugin-react'] || dependencies['@vitejs/plugin-vue']);

            // Webpack 관련 (다양한 프레임워크와 함께 사용)
            const isWebpack = !!(dependencies.webpack || dependencies['webpack-cli']);

            return isReact || isVue || isAngular || isSvelte || isNext || isNuxt || isVite || isWebpack;
        } catch {
            return false;
        }
    }

    /**
     * 키워드 기반 검색 패턴을 생성합니다.
     * @param keywords 키워드 배열
     * @returns 생성된 패턴 배열
     */
    private generateKeywordPatterns(keywords: string[]): string[] {
        const patterns: string[] = [];
        const addedPatterns = new Set<string>();

        // 상위 5개 키워드만 사용하여 패턴 생성
        const topKeywords = keywords.slice(0, 5);

        for (const keyword of topKeywords) {
            // 기본 패턴만 추가 (중복 방지)
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

            // 특정 키워드에 대한 최소한의 패턴만 추가
            if (keyword === 'src' && !addedPatterns.has('**/src/**/*')) {
                patterns.push('**/src/**/*');
                addedPatterns.add('**/src/**/*');
            }

            if (keyword === 'package' && !addedPatterns.has('**/package.json')) {
                patterns.push('**/package.json');
                addedPatterns.add('**/package.json');
            }

            if (keyword === 'config' && !addedPatterns.has('**/config/**/*')) {
                patterns.push('**/config/**/*');
                addedPatterns.add('**/config/**/*');
            }

            // 최대 15개 패턴으로 제한
            if (patterns.length >= 15) {
                break;
            }
        }

        console.log(`[CodebaseContextService] 생성된 키워드 패턴 (${patterns.length}개): ${patterns.join(', ')}`);
        return patterns;
    }

    /**
     * 토큰 사용량을 고려하여 파일을 선별합니다.
     * @param relevantFiles 관련 파일 배열
     * @param userQuery 사용자 질의
     * @returns 선별된 파일 배열
     */
    private selectFilesBasedOnTokenLimit(relevantFiles: string[], userQuery: string): string[] {
        // 파일 우선순위 계산
        const fileScores = new Map<string, number>();

        for (const filePath of relevantFiles) {
            let score = 0;
            const fileName = path.basename(filePath).toLowerCase();
            const relativePath = path.relative(process.cwd(), filePath).toLowerCase();

            // 1. 파일명이 질의와 직접 관련된 경우 (높은 점수)
            if (userQuery.toLowerCase().includes(fileName.split('.')[0])) {
                score += 20;
            }

            // 2. 중요한 파일들 (높은 점수)
            if (fileName === 'package.json' || fileName === 'tsconfig.json' || fileName === 'webpack.config.js') {
                score += 15;
            }

            // 3. 소스 코드 파일들 (중간 점수)
            if (fileName.endsWith('.ts') || fileName.endsWith('.js') || fileName.endsWith('.tsx') || fileName.endsWith('.jsx')) {
                score += 10;
            }

            // 4. 설정 파일들 (중간 점수)
            if (fileName.endsWith('.json') || fileName.endsWith('.yaml') || fileName.endsWith('.yml')) {
                score += 8;
            }

            // 5. 문서 파일들 (낮은 점수)
            if (fileName.endsWith('.md') || fileName.endsWith('.txt')) {
                score += 5;
            }

            // 6. 파일 크기 고려 (작은 파일 우선)
            try {
                const stats = require('fs').statSync(filePath);
                if (stats.size < 10000) { // 10KB 미만
                    score += 5;
                } else if (stats.size > 100000) { // 100KB 초과
                    score -= 5;
                }
            } catch (error) {
                // 파일 크기 확인 실패 시 기본 점수 유지
            }

            fileScores.set(filePath, score);
        }

        // 점수 순으로 정렬하고 상위 20개만 선택
        const sortedFiles = Array.from(fileScores.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 20)
            .map(([filePath]) => filePath);

        console.log(`[CodebaseContextService] 파일 우선순위 점수:`, Array.from(fileScores.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10));

        return sortedFiles;
    }

    /**
     * 파일이 키워드와 관련이 있는지 확인합니다.
     * @param filePath 파일 경로
     * @param keyword 키워드
     * @returns 관련성 여부
     */
    private isKeywordRelated(filePath: string, keyword: string): boolean {
        const fileName = path.basename(filePath).toLowerCase();
        const relativePath = path.relative(process.cwd(), filePath).toLowerCase();
        const keywordLower = keyword.toLowerCase();

        // 파일명이나 경로에 키워드가 포함되어 있는지 확인
        if (fileName.includes(keywordLower) || relativePath.includes(keywordLower)) {
            return true;
        }

        // 디렉토리 구조 기반 관련성 확인
        const pathParts = relativePath.split('/');
        for (const part of pathParts) {
            if (part.includes(keywordLower)) {
                return true;
            }
        }

        // 특정 키워드에 대한 추가 관련성 확인
        if (keywordLower === 'src' && (relativePath.includes('/src/') || relativePath.startsWith('src/'))) {
            return true;
        }

        if (keywordLower === 'test' && (relativePath.includes('/test/') || relativePath.includes('/tests/') ||
            fileName.includes('test') || fileName.includes('spec'))) {
            return true;
        }

        if (keywordLower === 'config' && (relativePath.includes('/config/') || relativePath.includes('/settings/') ||
            fileName.includes('config') || fileName.includes('setting'))) {
            return true;
        }

        return false;
    }

    /**
     * 파일들을 우선순위에 따라 정렬합니다.
     * @param files 파일 경로 배열
     * @param keywords 키워드 배열
     * @returns 정렬된 파일 경로 배열
     */
    private prioritizeFiles(files: string[], keywords: string[]): string[] {
        return files.sort((a, b) => {
            const aScore = this.calculateRelevanceScore(a, keywords);
            const bScore = this.calculateRelevanceScore(b, keywords);
            return bScore - aScore; // 높은 점수부터
        });
    }

    /**
     * 파일의 관련성 점수를 계산합니다.
     * @param filePath 파일 경로
     * @param keywords 키워드 배열
     * @returns 관련성 점수
     */
    private calculateRelevanceScore(filePath: string, keywords: string[]): number {
        const fileName = path.basename(filePath).toLowerCase();
        const relativePath = path.relative(process.cwd(), filePath).toLowerCase();
        let score = 0;

        // 파일명에 키워드가 포함된 경우 높은 점수
        keywords.forEach(keyword => {
            if (fileName.includes(keyword)) score += 10;
            if (relativePath.includes(keyword)) score += 5;
        });

        // 특정 디렉토리에 있는 파일들에 가중치 부여
        if (relativePath.includes('src/') || relativePath.includes('source/')) score += 3;
        if (relativePath.includes('lib/') || relativePath.includes('libs/')) score += 2;
        if (relativePath.includes('utils/') || relativePath.includes('helpers/')) score += 2;
        if (relativePath.includes('config/') || relativePath.includes('settings/')) score += 1;

        // 특정 파일 확장자에 가중치 부여
        const ext = path.extname(filePath).toLowerCase();
        if (['.ts', '.js', '.tsx', '.jsx'].includes(ext)) score += 2;
        if (['.py', '.java', '.cpp', '.c'].includes(ext)) score += 2;
        if (['.json', '.yaml', '.yml'].includes(ext)) score += 1;

        return score;
    }

    /**
     * 파일의 전체 경로를 VS Code 워크스페이스 루트를 기준으로 한 상대 경로로 변환합니다.
     * 워크스페이스가 열려있지 않거나 파일이 워크스페이스 외부에 있으면 null을 반환합니다.
     * Remote SSH 환경을 고려하여 경로 처리를 개선합니다.
     * @param fullPath 파일의 전체 경로
     * @returns 워크스페이스 기준 상대 경로 (슬래시 구분) 또는 null
     */
    private getPathRelativeToWorkspace(fullPath: string): string | null {
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            return null; // 워크스페이스가 열려있지 않음
        }

        try {
            const workspaceRootUri = vscode.workspace.workspaceFolders[0].uri;
            const fullUri = vscode.Uri.file(fullPath);

            // Remote SSH 환경에서 경로 정규화
            const normalizedWorkspacePath = path.resolve(workspaceRootUri.fsPath);
            const normalizedFullPath = path.resolve(fullUri.fsPath);

            // 파일이 워크스페이스 폴더 내에 있는지 확인
            if (normalizedFullPath.startsWith(normalizedWorkspacePath)) {
                // path.relative는 OS에 맞는 구분자를 반환하므로, 일관성을 위해 슬래시로 변환
                return path.relative(normalizedWorkspacePath, normalizedFullPath).replace(/\\/g, '/');
            }

            // Remote SSH 환경에서 상대 경로 처리
            if (!path.isAbsolute(fullPath)) {
                const relativePath = path.relative(normalizedWorkspacePath, path.join(normalizedWorkspacePath, fullPath));
                return relativePath.replace(/\\/g, '/');
            }

            return null;
        } catch (error) {
            console.error('경로 변환 중 오류 발생:', error);
            return null;
        }
    }

    /**
     * 프로젝트 코드베이스에서 LLM에 전달할 컨텍스트를 수집합니다.
     * @param abortSignal AbortController의 Signal (취소 요청 시 사용)
     * @returns { fileContentsContext: string, includedFilesForContext: { name: string, fullPath: string }[] }
     */
    public async getProjectCodebaseContext(abortSignal: AbortSignal): Promise<{ fileContentsContext: string, includedFilesForContext: { name: string, fullPath: string }[] }> {
        const sourcePathsSetting = await this.configurationService.getSourcePaths();
        let fileContentsContext = "";
        let currentTotalContentLength = 0;
        const includedFilesForContext: { name: string, fullPath: string }[] = [];

        for (const sourcePath of sourcePathsSetting) {
            if (abortSignal.aborted) {
                this.notificationService.showWarningMessage('컨텍스트 수집이 취소되었습니다.');
                break;
            }
            if (currentTotalContentLength >= this.MAX_TOTAL_CONTENT_LENGTH) {
                fileContentsContext += "\n[INFO] 컨텍스트 길이 제한으로 일부 파일 내용이 생략되었습니다.\n";
                break;
            }
            try {
                const uri = vscode.Uri.file(sourcePath);
                const stats = await vscode.workspace.fs.stat(uri);

                if (stats.type === vscode.FileType.File) {
                    // Check if file is excluded
                    if (this.EXCLUDED_EXTENSIONS.includes(path.extname(sourcePath).toLowerCase())) {
                        console.log(`[CodebaseContextService] Skipping excluded file: ${sourcePath}`);
                        continue;
                    }

                    const contentBytes = await vscode.workspace.fs.readFile(uri);
                    const content = Buffer.from(contentBytes).toString('utf8');

                    // 워크스페이스 기준 상대 경로를 얻거나, 없으면 기본 파일명 사용
                    const nameForContext = this.getPathRelativeToWorkspace(sourcePath) || path.basename(sourcePath);

                    if (currentTotalContentLength + content.length <= this.MAX_TOTAL_CONTENT_LENGTH) {
                        fileContentsContext += `파일명: ${nameForContext}\n코드:\n\`\`\`${getFileType(sourcePath)}\n${content}\n\`\`\`\n\n`;
                        currentTotalContentLength += content.length;
                        includedFilesForContext.push({ name: nameForContext, fullPath: sourcePath });
                    } else {
                        fileContentsContext += `파일명: ${nameForContext}\n코드:\n[INFO] 파일 내용이 너무 길어 생략되었습니다.\n\n`;
                    }
                } else if (stats.type === vscode.FileType.Directory) {
                    const pattern = path.join(uri.fsPath, '**', '*');
                    const files = glob.sync(pattern, {
                        nodir: true,
                        dot: false,
                        ignore: [
                            path.join(uri.fsPath, '**/node_modules/**'),
                            path.join(uri.fsPath, '**/.git/**', '**/dist/**', '**/out/**')
                        ].map(p => p.replace(/\\/g, '/'))
                    });

                    for (const file of files) {
                        if (abortSignal.aborted) {
                            this.notificationService.showWarningMessage('컨텍스트 수집이 취소되었습니다.');
                            break;
                        }
                        // Check if file is excluded
                        if (this.EXCLUDED_EXTENSIONS.includes(path.extname(file).toLowerCase())) {
                            console.log(`[CodebaseContextService] Skipping excluded file: ${file}`);
                            continue;
                        }

                        if (currentTotalContentLength >= this.MAX_TOTAL_CONTENT_LENGTH) break;
                        const fileUri = vscode.Uri.file(file);
                        const contentBytes = await vscode.workspace.fs.readFile(fileUri);
                        const content = Buffer.from(contentBytes).toString('utf8');

                        // 워크스페이스 기준 상대 경로를 얻거나, 없으면 기본 파일명 사용
                        const nameForContext = this.getPathRelativeToWorkspace(file) || path.basename(file);

                        if (currentTotalContentLength + content.length <= this.MAX_TOTAL_CONTENT_LENGTH) {
                            fileContentsContext += `파일명: ${nameForContext}\n코드:\n\`\`\`${getFileType(file)}\n${content}\n\`\`\`\n\n`;
                            currentTotalContentLength += content.length;
                            includedFilesForContext.push({ name: nameForContext, fullPath: file });
                        } else {
                            fileContentsContext += `파일명: ${nameForContext}\n코드:\n[INFO] 파일 내용이 너무 길어 생략되었습니다.\n\n`;
                        }
                    }
                }
            } catch (err: any) {
                console.error(`Error processing source path ${sourcePath}:`, err);
                fileContentsContext += `[오류] 경로 '${sourcePath}' 처리 중 문제 발생: ${err.message}\n\n`;
            }
        }

        if (includedFilesForContext.length === 0 && sourcePathsSetting.length > 0) {
            fileContentsContext += "[정보] 설정된 경로에서 컨텍스트에 포함할 파일을 찾지 못했습니다. 파일 확장자나 경로 설정을 확인해주세요.\n";
        } else if (sourcePathsSetting.length === 0) {
            fileContentsContext += "[정보] 참조할 소스 경로가 설정되지 않았습니다. CodePilot 설정에서 경로를 추가해주세요.\n";
        }
        return { fileContentsContext, includedFilesForContext };
    }
}