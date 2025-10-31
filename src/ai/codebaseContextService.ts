import * as vscode from 'vscode';
import * as path from 'path';
import { glob } from 'glob';
import { getFileType } from '../utils/fileUtils';
import { ConfigurationService } from '../services/configurationService';
import { NotificationService } from '../services/notificationService';
import { LlmKeywordSelectionService, ProjectContext } from './llmKeywordSelectionService';

export class CodebaseContextService {
    private configurationService: ConfigurationService;
    private notificationService: NotificationService;
    private llmKeywordSelectionService: LlmKeywordSelectionService | null = null;
    private llmService: any; // LlmService 인스턴스
    private readonly MAX_TOTAL_CONTENT_LENGTH = 1000000; // LLM 컨텍스트 최대 길이
    private readonly EXCLUDED_EXTENSIONS = [
        '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp', '.ico', // Images
        '.pdf', '.zip', '.tar', '.gz', '.rar', '.7z',                     // Archives/Binary documents
        '.exe', '.dll', '.bin',                                           // Executables/Binaries
        '.sqlite', '.db',                                                 // Databases
        '.lock', '.log', '.tmp', '.temp'                                  // Lock/Log/Temp files
    ];

    private readonly EXCLUDED_LIBRARY_PATHS = [
        // Node.js 관련 라이브러리 디렉토리
        'node_modules',
        '.npm',
        'npm-cache',

        // Java/Maven 관련 라이브러리 디렉토리
        '.m2',
        'target',
        'build',
        '.gradle',
        'gradle',

        // Python 관련 라이브러리 디렉토리
        '__pycache__',
        '.pytest_cache',
        'venv',
        'env',
        '.venv',
        '.env',
        'site-packages',
        '.pip',

        // .NET 관련 라이브러리 디렉토리
        'bin',
        'obj',
        'packages',
        '.nuget',

        // Go 관련 라이브러리 디렉토리
        'vendor',
        'pkg',

        // Rust 관련 라이브러리 디렉토리
        'target',
        'Cargo.lock',

        // PHP 관련 라이브러리 디렉토리
        'vendor',
        'composer',

        // Ruby 관련 라이브러리 디렉토리
        'vendor',
        'bundle',
        '.bundle',

        // 일반적인 빌드/캐시 디렉토리
        'dist',
        'out',
        'build',
        '.build',
        'coverage',
        '.coverage',
        'logs',
        '.logs',
        'tmp',
        '.tmp',
        'temp',
        '.temp',
        'cache',
        '.cache',

        // IDE/에디터 관련 디렉토리
        '.vscode',
        '.idea',
        '.eclipse',
        '.settings',
        '.project',
        '.classpath',

        // 버전 관리 관련
        '.git',
        '.svn',
        '.hg',
        '.bzr',

        // OS 관련 디렉토리
        '.DS_Store',
        'Thumbs.db',
        '.Spotlight-V100',
        '.Trashes',
        '.fseventsd',
        '.TemporaryItems'
    ];

    constructor(configurationService: ConfigurationService, notificationService: NotificationService, llmService?: any) {
        this.configurationService = configurationService;
        this.notificationService = notificationService;
        this.llmService = llmService;
    }

    /**
     * LlmService를 설정합니다.
     * @param llmService LlmService 인스턴스
     */
    public setLlmService(llmService: any): void {
        this.llmService = llmService;
    }

    /**
     * LLM 키워드 선택 서비스를 설정합니다.
     */
    public setLlmKeywordSelectionService(llmKeywordSelectionService: LlmKeywordSelectionService) {
        this.llmKeywordSelectionService = llmKeywordSelectionService;
    }

    /**
     * 파일 경로가 라이브러리 디렉토리에 속하는지 확인합니다.
     * @param filePath 파일 경로
     * @param projectRoot 프로젝트 루트 경로
     * @returns 라이브러리 디렉토리 여부
     */
    private isLibraryPath(filePath: string, projectRoot: string): boolean {
        const relativePath = path.relative(projectRoot, filePath);
        const pathParts = relativePath.split(path.sep);

        // 경로의 각 부분을 확인하여 라이브러리 디렉토리인지 검사
        for (const part of pathParts) {
            if (this.EXCLUDED_LIBRARY_PATHS.includes(part.toLowerCase())) {
                return true;
            }
        }

        // 경로 자체에 라이브러리 디렉토리가 포함되어 있는지 확인
        const normalizedPath = relativePath.toLowerCase().replace(/\\/g, '/');
        for (const excludedPath of this.EXCLUDED_LIBRARY_PATHS) {
            if (normalizedPath.includes(`/${excludedPath}/`) ||
                normalizedPath.startsWith(`${excludedPath}/`) ||
                normalizedPath.endsWith(`/${excludedPath}`) ||
                normalizedPath === excludedPath) {
                return true;
            }
        }

        return false;
    }

    /**
     * 전체 파일 리스트를 수집하여 LLM이 프로젝트를 분석하고 플래닝할 수 있도록 합니다.
     * @param userQuery 사용자의 질의
     * @param abortSignal 취소 신호
     * @returns 파일 리스트와 LLM 분석 결과
     */
    public async getProjectFileListForAnalysis(userQuery: string, abortSignal: AbortSignal): Promise<{ fileList: string[], analysisResult?: any }> {
        // ConfigurationService.getProjectRoot()는 항상 워크스페이스 루트만 반환합니다.
        const projectRoot = await this.configurationService.getProjectRoot();

        if (!projectRoot) {
            this.notificationService.showWarningMessage('워크스페이스가 열려있지 않습니다. VS Code에서 프로젝트 폴더를 열어주세요.');
            return { fileList: [] };
        }

        console.log(`[CodebaseContextService] 워크스페이스 루트 사용: ${projectRoot}`);

        try {
            // 전체 파일 리스트 수집 (라이브러리 파일 제외)
            const allFiles = await this.getAllProjectFiles(projectRoot, abortSignal);
            console.log(`[CodebaseContextService] 전체 파일 ${allFiles.length}개 수집 완료`);

            // LLM을 통한 프로젝트 분석
            const analysisResult = await this.analyzeProjectWithLLM(userQuery, allFiles, projectRoot);

            return { fileList: allFiles, analysisResult };
        } catch (error) {
            console.error('[CodebaseContextService] 프로젝트 파일 리스트 분석 중 오류:', error);
            return { fileList: [] };
        }
    }

    /**
     * 사용자 질의와 관련된 파일들을 자동으로 찾아서 컨텍스트에 추가합니다.
     * @param userQuery 사용자의 질의
     * @param abortSignal 취소 신호
     * @returns 파일 컨텍스트와 포함된 파일 목록
     */
    public async getRelevantFilesContext(userQuery: string, abortSignal: AbortSignal, conversationHistory?: { userQuery: string, aiResponse?: string, timestamp: number }[], intentResult?: { category: string; subtype: string; confidence: number }): Promise<{ fileContentsContext: string, includedFilesForContext: { name: string, fullPath: string }[], extractedKeywords?: string[], selectedKeywords?: { keywords: string[]; reasoning: string; confidence: number } }> {
        const defaultResult = { fileContentsContext: '', includedFilesForContext: [], extractedKeywords: [], selectedKeywords: { keywords: [], reasoning: '', confidence: 0 } };
        // 의도 분석 결과 확인 - 코드 관련 질문이 아닌 경우 파일 컨텍스트 제외
        if (intentResult && !this.isCodeRelatedIntent(intentResult)) {
            // console.log(`[CodebaseContextService] 코드 관련 질문이 아니므로 파일 컨텍스트 제외. 의도: ${intentResult.category}/${intentResult.subtype}`);
            return defaultResult;
        }

        // ConfigurationService.getProjectRoot()는 항상 워크스페이스 루트만 반환합니다.
        const projectRoot = await this.configurationService.getProjectRoot();

        if (!projectRoot) {
            this.notificationService.showWarningMessage('워크스페이스가 열려있지 않습니다. VS Code에서 프로젝트 폴더를 열어주세요.');
            return defaultResult;
        }

        let fileContentsContext = "";
        let currentTotalContentLength = 0;
        const includedFilesForContext: { name: string, fullPath: string }[] = [];
        const includedPathSet: Set<string> = new Set();

        try {
            // 프로젝트 타입별 최우선 파일 포함
            try {
                const isNode = await this.isNodeProject(projectRoot);
                const isSpring = await this.isSpringProject(projectRoot);
            } catch { }

            // ... rest of existing logic remains ...

            return { fileContentsContext, includedFilesForContext, extractedKeywords: [], selectedKeywords: { keywords: [], reasoning: '', confidence: 0 } };
        } catch (error) {
            console.error('[CodebaseContextService] 관련 파일 컨텍스트 수집 중 오류:', error);
            return { fileContentsContext: fileContentsContext || '', includedFilesForContext: includedFilesForContext || [], extractedKeywords: [], selectedKeywords: { keywords: [], reasoning: '', confidence: 0 } };
        }
    }

    /**
     * LLM을 통한 키워드 선택
     * @param userQuery 사용자 질의
     * @param keywords 키워드 목록
     * @param projectRoot 프로젝트 루트
     * @returns 선택된 키워드와 추론 과정
     */
    private async selectKeywordsWithLLM(
        userQuery: string,
        keywords: string[],
        projectRoot: string
    ): Promise<{ keywords: string[]; reasoning: string; confidence: number }> {
        try {
            if (!this.llmKeywordSelectionService) {
                console.warn('[CodebaseContextService] LLM 키워드 선택 서비스가 설정되지 않음, 기본 키워드 사용');
                return {
                    keywords: keywords.slice(0, 5),
                    reasoning: 'LLM 서비스 미설정으로 기본 키워드 사용',
                    confidence: 0.3
                };
            }

            // 프로젝트 컨텍스트 수집
            const projectContext = await this.collectProjectContext(projectRoot);

            // LLM을 통한 키워드 선택
            const result = await this.llmKeywordSelectionService.selectKeywordsWithLLM(
                userQuery,
                projectContext,
                keywords
            );

            return result;

        } catch (error) {
            console.warn('[CodebaseContextService] LLM 키워드 선택 실패, 기본 키워드 사용:', error);
            // 실패 시 기본 키워드 반환
            return {
                keywords: keywords.slice(0, 5),
                reasoning: 'LLM 키워드 선택 실패로 기본 키워드 사용',
                confidence: 0.3
            };
        }
    }

    /**
     * 프로젝트 컨텍스트를 수집합니다.
     * @param projectRoot 프로젝트 루트
     * @returns 프로젝트 컨텍스트
     */
    private async collectProjectContext(projectRoot: string): Promise<ProjectContext> {
        const fileNames: string[] = [];
        const directoryNames: string[] = [];

        try {
            // 프로젝트 타입 감지
            const projectType = await this.detectProjectType([projectRoot]);

            // 파일명과 디렉토리명 수집
            const files = await glob('**/*', {
                cwd: projectRoot,
                ignore: ['node_modules/**', '.git/**', 'dist/**', 'build/**']
            }) as string[];

            for (const file of files.slice(0, 100)) { // 최대 100개 파일만
                const fileName = path.basename(file);
                const dirName = path.dirname(file);

                if (fileName && fileName !== '.') {
                    fileNames.push(fileName);
                }

                if (dirName && dirName !== '.' && !directoryNames.includes(dirName)) {
                    directoryNames.push(dirName);
                }
            }

            return {
                framework: projectType,
                projectType: this.getProjectTypeFromFramework(projectType),
                fileNames: [...new Set(fileNames)],
                directoryNames: [...new Set(directoryNames)]
            };

        } catch (error) {
            console.warn('[CodebaseContextService] 프로젝트 컨텍스트 수집 실패:', error);
            return {
                framework: 'unknown',
                projectType: 'unknown',
                fileNames: [],
                directoryNames: []
            };
        }
    }

    /**
     * 프레임워크에서 프로젝트 타입을 추론합니다.
     */
    private getProjectTypeFromFramework(framework: string): string {
        const typeMap: { [key: string]: string } = {
            'react': 'web',
            'vue': 'web',
            'angular': 'web',
            'next': 'web',
            'spring': 'api',
            'django': 'web',
            'flask': 'web',
            'fastapi': 'api',
            'express': 'api',
            'node': 'api'
        };

        return typeMap[framework.toLowerCase()] || 'unknown';
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

        // console.log(`[CodebaseContextService] 원본 질의: "${userQuery}"`);
        // console.log(`[CodebaseContextService] 한국어 어간: ${koreanStems.join(', ')}`);
        // console.log(`[CodebaseContextService] 영어 단어: ${englishWords.join(', ')}`);
        // console.log(`[CodebaseContextService] 개발 키워드: ${developmentKeywords.join(', ')}`);
        // console.log(`[CodebaseContextService] 최종 키워드: ${prioritizedKeywords.join(', ')}`);

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
            const techKeywords = ['react', 'vue', 'angular', 'node', 'express', 'typescript', 'javascript', 'python', 'java', 'spring', 'springboot', 'boot', 'django', 'flask', 'vite', 'webpack', 'babel', 'eslint', 'prettier', 'maven', 'gradle'];
            if (techKeywords.includes(keyword.toLowerCase())) {
                score += 5;
            }

            // 3. 파일/폴더 관련 키워드 (낮은 점수)
            const fileKeywords = ['src', 'package', 'config', 'main', 'index', 'app', 'component', 'service', 'util', 'helper', 'controller', 'repository', 'entity', 'application', 'resources'];
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

        // console.log(`[CodebaseContextService] 키워드 우선순위 점수:`, Array.from(keywordScores.entries()).sort((a, b) => b[1] - a[1]));

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

        if (query.includes('spring') || query.includes('boot')) {
            keywords.push('spring', 'boot', 'controller', 'service', 'repository', 'entity', 'config', 'application');
        }

        if (query.includes('maven')) {
            keywords.push('maven', 'pom', 'dependency', 'plugin');
        }

        if (query.includes('gradle')) {
            keywords.push('gradle', 'build', 'dependency', 'plugin');
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
        const isSpringProject = await this.isSpringProject(projectRoot);

        let searchPatterns: string[];

        if (isSpringProject) {
            // Spring Boot 프로젝트의 경우 Java 중심 검색
            // console.log('[CodebaseContextService] Spring Boot 프로젝트 감지 - Java 중심 검색 수행');
            searchPatterns = [
                'pom.xml', 'build.gradle', 'build.gradle.kts',
                'src/main/resources/application.properties',
                'src/main/resources/application.yml',
                'src/main/resources/application.yaml',
                'src/main/java/**/*.java',
                'src/test/java/**/*.java',
                'src/main/resources/**/*.xml',
                'src/main/resources/**/*.yml',
                'src/main/resources/**/*.yaml',
                'src/main/resources/**/*.properties',
                'src/main/resources/**/*.json',
                'src/main/resources/**/*.sql',
                'src/main/resources/**/*.md',
                'src/main/resources/**/*.txt'
            ];
        } else if (isNodeProject && isFrontendFramework) {
            // Node.js 기반 프론트엔드 프레임워크 프로젝트의 경우 제한된 검색
            // console.log('[CodebaseContextService] Node.js 기반 프론트엔드 프레임워크 프로젝트 감지 - 제한된 검색 수행');
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
            // console.log(`[CodebaseContextService] 생성된 키워드 패턴: ${keywordPatterns.join(', ')}`);

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
                            // 라이브러리 디렉토리 파일 제외
                            if (this.isLibraryPath(filePath, projectRoot)) {
                                // console.log(`[CodebaseContextService] 라이브러리 디렉토리 파일 제외: ${filePath}`);
                                continue;
                            }

                            // 파일명이나 경로에 키워드가 포함되어 있는지 확인
                            const fileName = path.basename(filePath).toLowerCase();
                            const relativePath = path.relative(projectRoot, filePath);
                            const relativePathLower = relativePath.toLowerCase();

                            const isRelevant = keywords.some(keyword =>
                                fileName.includes(keyword) ||
                                relativePathLower.includes(keyword) ||
                                this.isKeywordRelated(filePath, keyword, projectRoot)
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

        // console.log(`[CodebaseContextService] 총 ${relevantFiles.length}개 파일 발견`);

        // 검색된 파일들의 리스트를 디버그 콘솔에 출력
        // if (relevantFiles.length > 0) {
        //     console.log('[CodebaseContextService] 검색된 파일 목록:');
        //     relevantFiles.forEach((filePath, index) => {
        //         const relativePath = path.relative(projectRoot, filePath);
        //         console.log(`  ${index + 1}. ${relativePath}`);
        //     });
        // }

        return relevantFiles;
    }

    /**
     * 프로젝트의 모든 파일 리스트를 수집합니다 (라이브러리 파일 제외).
     * @param projectRoot 프로젝트 루트 경로
     * @param abortSignal 취소 신호
     * @returns 파일 경로 리스트
     */
    private async getAllProjectFiles(projectRoot: string, abortSignal: AbortSignal): Promise<string[]> {
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
                            console.warn(`[CodebaseContextService] 파일 처리 중 오류: ${filePath}`, error);
                        }
                    }
                } catch (error) {
                    console.warn(`[CodebaseContextService] 패턴 검색 중 오류: ${pattern}`, error);
                }
            }
        } catch (error) {
            console.error('[CodebaseContextService] 전체 파일 수집 중 오류:', error);
        }

        console.log(`[CodebaseContextService] 총 ${allFiles.length}개 파일 수집 완료`);
        return allFiles;
    }

    /**
     * LLM을 사용하여 프로젝트를 분석합니다.
     * @param userQuery 사용자 질의
     * @param fileList 파일 리스트
     * @param projectRoot 프로젝트 루트
     * @returns 분석 결과
     */
    private async analyzeProjectWithLLM(userQuery: string, fileList: string[], projectRoot: string): Promise<any> {
        try {
            // 파일 리스트를 상대 경로로 변환
            const relativeFileList = fileList.map(filePath => path.relative(projectRoot, filePath));

            const analysisPrompt = `다음은 프로젝트의 파일 리스트입니다. 이 파일들을 분석하여 다음을 수행해주세요:

파일 리스트:
${relativeFileList.slice(0, 100).join('\n')}${relativeFileList.length > 100 ? `\n... (총 ${relativeFileList.length}개 파일)` : ''}

사용자 질의: "${userQuery}"

다음 3가지 분석을 수행해주세요:

1. 프로그래밍 관련 여부 분석:
   - 파일명들을 보고 이 프로젝트가 프로그래밍 관련인지 판단
   - 프로그래밍 관련이면 "CODE", 그렇지 않으면 "GENERAL" 반환

2. 프로젝트 타입 분석:
   - 파일명들을 보고 프로젝트 타입을 분석
   - 가능한 타입: react, react-vite, vue, angular, next, nuxt, svelte, nodejs, django, flask, fastapi, python, java, spring, spring-boot, dotnet, go, rust, php, ruby, ios, android, flutter, react-native, unknown

3. 추천 플랜:
   - 1, 2번 분석 결과를 바탕으로 사용자에게 추천할 다음 단계 플랜을 제안

응답 형식 (JSON):
{
  "programmingRelated": "CODE" | "GENERAL",
  "projectType": "프로젝트 타입",
  "reasoning": "분석 근거",
  "recommendedPlan": "추천 플랜",
  "confidence": 0.8
}`;

            // LLM 서비스 호출
            const llmService = this.getLLMService();
            if (!llmService) {
                console.warn('[CodebaseContextService] LLM 서비스를 사용할 수 없습니다.');
                return null;
            }

            const response = await llmService.analyzeProject(analysisPrompt);

            // JSON 응답 파싱
            try {
                // ```json 코드 블록 제거
                let cleanResponse = response.trim();
                if (cleanResponse.startsWith('```json')) {
                    cleanResponse = cleanResponse.replace(/^```json\s*/, '');
                }
                if (cleanResponse.endsWith('```')) {
                    cleanResponse = cleanResponse.replace(/\s*```$/, '');
                }

                const analysisResult = JSON.parse(cleanResponse);
                console.log(`[CodebaseContextService] LLM 프로젝트 분석 완료:`, analysisResult);
                return analysisResult;
            } catch (parseError) {
                console.warn('[CodebaseContextService] LLM 응답 파싱 실패:', parseError);
                console.warn('[CodebaseContextService] 원본 응답:', response);
                return null;
            }
        } catch (error) {
            console.error('[CodebaseContextService] LLM 프로젝트 분석 중 오류:', error);
            return null;
        }
    }

    /**
     * LLM 서비스를 가져옵니다.
     * @returns LLM 서비스 인스턴스
     */
    private getLLMService(): any {
        return this.llmService;
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
     * Spring 프로젝트인지 확인합니다.
     * Maven, Gradle 기반 Spring Boot 프로젝트를 감지합니다.
     */
    private async isSpringProject(projectRoot: string): Promise<boolean> {
        try {
            const fs = await import('fs/promises');

            // 1. Maven 기반 Spring 프로젝트 감지
            const pomXmlPath = path.join(projectRoot, 'pom.xml');
            try {
                const pomContent = await fs.readFile(pomXmlPath, 'utf-8');
                const isSpringBoot = pomContent.includes('spring-boot-starter') ||
                    pomContent.includes('spring-boot-parent') ||
                    pomContent.includes('org.springframework.boot');
                if (isSpringBoot) {
                    // console.log('[CodebaseContextService] Maven 기반 Spring Boot 프로젝트 감지');
                    return true;
                }
            } catch {
                // pom.xml이 없거나 읽을 수 없는 경우
            }

            // 2. Gradle 기반 Spring 프로젝트 감지
            const buildGradlePath = path.join(projectRoot, 'build.gradle');
            const buildGradleKtsPath = path.join(projectRoot, 'build.gradle.kts');

            try {
                const buildGradleContent = await fs.readFile(buildGradlePath, 'utf-8');
                const isSpringBoot = buildGradleContent.includes('spring-boot-starter') ||
                    buildGradleContent.includes('org.springframework.boot') ||
                    buildGradleContent.includes('spring-boot-gradle-plugin');
                if (isSpringBoot) {
                    // console.log('[CodebaseContextService] Gradle 기반 Spring Boot 프로젝트 감지');
                    return true;
                }
            } catch {
                // build.gradle이 없거나 읽을 수 없는 경우
            }

            try {
                const buildGradleKtsContent = await fs.readFile(buildGradleKtsPath, 'utf-8');
                const isSpringBoot = buildGradleKtsContent.includes('spring-boot-starter') ||
                    buildGradleKtsContent.includes('org.springframework.boot') ||
                    buildGradleKtsContent.includes('spring-boot-gradle-plugin');
                if (isSpringBoot) {
                    // console.log('[CodebaseContextService] Gradle Kotlin DSL 기반 Spring Boot 프로젝트 감지');
                    return true;
                }
            } catch {
                // build.gradle.kts가 없거나 읽을 수 없는 경우
            }

            // 3. application.properties 또는 application.yml 파일 존재 확인
            const applicationPropertiesPath = path.join(projectRoot, 'src', 'main', 'resources', 'application.properties');
            const applicationYmlPath = path.join(projectRoot, 'src', 'main', 'resources', 'application.yml');
            const applicationYamlPath = path.join(projectRoot, 'src', 'main', 'resources', 'application.yaml');

            try {
                await fs.access(applicationPropertiesPath);
                // console.log('[CodebaseContextService] application.properties 파일로 Spring 프로젝트 감지');
                return true;
            } catch {
                // application.properties가 없는 경우
            }

            try {
                await fs.access(applicationYmlPath);
                // console.log('[CodebaseContextService] application.yml 파일로 Spring 프로젝트 감지');
                return true;
            } catch {
                // application.yml이 없는 경우
            }

            try {
                await fs.access(applicationYamlPath);
                // console.log('[CodebaseContextService] application.yaml 파일로 Spring 프로젝트 감지');
                return true;
            } catch {
                // application.yaml이 없는 경우
            }

            // 4. @SpringBootApplication 어노테이션이 있는 Java 파일 확인
            const javaFiles = await glob('**/*.java', { cwd: projectRoot, nodir: true });
            for (const javaFile of javaFiles.slice(0, 10)) { // 최대 10개 파일만 확인
                try {
                    const javaFilePath = path.join(projectRoot, javaFile);
                    const javaContent = await fs.readFile(javaFilePath, 'utf-8');
                    if (javaContent.includes('@SpringBootApplication') ||
                        javaContent.includes('@SpringBootTest') ||
                        javaContent.includes('org.springframework.boot')) {
                        console.log('[CodebaseContextService] @SpringBootApplication 어노테이션으로 Spring 프로젝트 감지');
                        return true;
                    }
                } catch {
                    // 파일 읽기 실패 시 계속 진행
                }
            }

            return false;
        } catch (error) {
            console.warn('[CodebaseContextService] Spring 프로젝트 감지 중 오류:', error);
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

            if (keyword === 'controller' && !addedPatterns.has('**/controller/**/*')) {
                patterns.push('**/controller/**/*');
                addedPatterns.add('**/controller/**/*');
            }

            if (keyword === 'service' && !addedPatterns.has('**/service/**/*')) {
                patterns.push('**/service/**/*');
                addedPatterns.add('**/service/**/*');
            }

            if (keyword === 'repository' && !addedPatterns.has('**/repository/**/*')) {
                patterns.push('**/repository/**/*');
                addedPatterns.add('**/repository/**/*');
            }

            if (keyword === 'entity' && !addedPatterns.has('**/entity/**/*')) {
                patterns.push('**/entity/**/*');
                addedPatterns.add('**/entity/**/*');
            }

            if (keyword === 'application' && !addedPatterns.has('**/application.*')) {
                patterns.push('**/application.*');
                addedPatterns.add('**/application.*');
            }

            // 최대 15개 패턴으로 제한
            if (patterns.length >= 15) {
                break;
            }
        }

        // console.log(`[CodebaseContextService] 생성된 키워드 패턴 (${patterns.length}개): ${patterns.join(', ')}`);
        return patterns;
    }

    /**
     * 토큰 사용량을 고려하여 파일을 선별합니다.
     * @param relevantFiles 관련 파일 배열
     * @param userQuery 사용자 질의
     * @returns 선별된 파일 배열
     */
    private selectFilesBasedOnTokenLimit(relevantFiles: string[], userQuery: string, projectRoot?: string): string[] {
        // 파일 우선순위 계산
        const fileScores = new Map<string, number>();

        for (const filePath of relevantFiles) {
            // 라이브러리 디렉토리 파일 제외
            if (projectRoot && this.isLibraryPath(filePath, projectRoot)) {
                // console.log(`[CodebaseContextService] 라이브러리 디렉토리 파일 제외 (선별 단계): ${filePath}`);
                continue;
            }

            let score = 0;
            const fileName = path.basename(filePath).toLowerCase();
            const relativePath = path.relative(process.cwd(), filePath).toLowerCase();

            // 1. 파일명이 질의와 직접 관련된 경우 (높은 점수)
            if (userQuery.toLowerCase().includes(fileName.split('.')[0])) {
                score += 20;
            }

            // 2. 중요한 파일들 (높은 점수)
            if (fileName === 'package.json' || fileName === 'tsconfig.json' || fileName === 'webpack.config.js' ||
                fileName === 'pom.xml' || fileName === 'build.gradle' || fileName === 'build.gradle.kts') {
                score += 15;
            }

            // 3. 소스 코드 파일들 (중간 점수)
            if (fileName.endsWith('.ts') || fileName.endsWith('.js') || fileName.endsWith('.tsx') || fileName.endsWith('.jsx') ||
                fileName.endsWith('.java')) {
                score += 10;
            }

            // 4. 설정 파일들 (중간 점수)
            if (fileName.endsWith('.json') || fileName.endsWith('.yaml') || fileName.endsWith('.yml') ||
                fileName.endsWith('.properties') || fileName.endsWith('.xml')) {
                score += 8;
            }

            // 5. 문서 파일들 (낮은 점수)
            if (fileName.endsWith('.md') || fileName.endsWith('.txt')) {
                score += 5;
            }

            // 6. Spring 프로젝트 특별 경로 우선순위
            if (relativePath.includes('src/main/java') || relativePath.includes('src/main/resources')) {
                score += 8;
            }
            if (relativePath.includes('src/test/java')) {
                score += 5;
            }
            if (fileName === 'application.properties' || fileName === 'application.yml' || fileName === 'application.yaml') {
                score += 12;
            }

            // 7. 파일 크기 고려 (작은 파일 우선)
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

        // console.log(`[CodebaseContextService] 파일 우선순위 점수:`, Array.from(fileScores.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10));

        return sortedFiles;
    }

    /**
     * 파일이 키워드와 관련이 있는지 확인합니다.
     * @param filePath 파일 경로
     * @param keyword 키워드
     * @param projectRoot 프로젝트 루트 경로 (선택사항)
     * @returns 관련성 여부
     */
    private isKeywordRelated(filePath: string, keyword: string, projectRoot?: string): boolean {
        // 라이브러리 디렉토리 파일은 관련성이 없다고 판단
        if (projectRoot && this.isLibraryPath(filePath, projectRoot)) {
            return false;
        }

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
     * 파일의 전체 경로를 프로젝트 루트 기준 상대 경로로 변환합니다.
     * @param fullPath 파일의 전체 경로
     * @returns 프로젝트 루트 기준 상대 경로 (슬래시 구분) 또는 null
     */
    private async getPathRelativeToProjectRoot(fullPath: string): Promise<string | null> {
        try {
            // ConfigurationService.getProjectRoot()는 항상 워크스페이스 루트만 반환합니다.
            const projectRoot = await this.configurationService.getProjectRoot();
            if (!projectRoot) {
                return null;
            }

            // 프로젝트 루트 기준으로 상대 경로 계산
            const normalizedProjectRoot = path.resolve(projectRoot);
            const normalizedFullPath = path.resolve(fullPath);

            // 파일이 프로젝트 루트 내에 있는지 확인
            if (normalizedFullPath.startsWith(normalizedProjectRoot)) {
                return path.relative(normalizedProjectRoot, normalizedFullPath).replace(/\\/g, '/');
            }

            return null; // 프로젝트 루트 외부 파일
        } catch (error) {
            console.warn(`[CodebaseContextService] 경로 변환 실패: ${fullPath}`, error);
            return null;
        }
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
     * 의도가 코드 관련인지 확인합니다.
     * @param intentResult 의도 분석 결과
     * @returns 코드 관련 의도인지 여부
     */
    private isCodeRelatedIntent(intentResult: { category: string; subtype: string; confidence: number }): boolean {
        // 코드, 실행, 분석 카테고리는 파일 컨텍스트가 필요
        const codeRelatedCategories = ['code', 'execution', 'analysis'];
        return codeRelatedCategories.includes(intentResult.category);
    }

    /**
     * 프로젝트 코드베이스에서 LLM에 전달할 컨텍스트를 수집합니다.
     * src 디렉토리는 전체 포함하고, 나머지 파일들은 키워드 기반으로 필터링합니다.
     * @param abortSignal AbortController의 Signal (취소 요청 시 사용)
     * @param userQuery 사용자 쿼리 (키워드 추출용)
     * @param intentResult 의도 분석 결과 (파일 컨텍스트 포함 여부 결정용)
     * @returns { fileContentsContext: string, includedFilesForContext: { name: string, fullPath: string }[] }
     */
    public async getProjectCodebaseContext(abortSignal: AbortSignal, userQuery?: string, intentResult?: { category: string; subtype: string; confidence: number }): Promise<{ fileContentsContext: string, includedFilesForContext: { name: string, fullPath: string }[] }> {
        const sourcePathsSetting = await this.configurationService.getSourcePaths();
        let fileContentsContext = "";
        let currentTotalContentLength = 0;
        const includedFilesForContext: { name: string, fullPath: string }[] = [];

        // 의도 분석 결과 확인 - 코드 관련 질문이 아닌 경우 파일 컨텍스트 제외
        if (intentResult && !this.isCodeRelatedIntent(intentResult)) {
            console.log(`[CodebaseContextService] 코드 관련 질문이 아니므로 파일 컨텍스트 제외. 의도: ${intentResult.category}/${intentResult.subtype}`);
            return { fileContentsContext: "", includedFilesForContext: [] };
        }

        // 프로젝트 타입 감지
        const projectType = await this.detectProjectType(sourcePathsSetting);
        console.log(`[CodebaseContextService] 감지된 프로젝트 타입: ${projectType}`);

        // 키워드 추출 (사용자 쿼리에서)
        const keywords = this.extractKeywords(userQuery || '');
        console.log(`[CodebaseContextService] 추출된 키워드: ${keywords.join(', ')}`);

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

                    // src 디렉토리가 아닌 파일은 키워드 기반으로 필터링
                    if (!this.isSrcFile(sourcePath) && !this.shouldIncludeFile(sourcePath, keywords, projectType)) {
                        console.log(`[CodebaseContextService] 키워드 필터링으로 제외: ${sourcePath}`);
                        continue;
                    }

                    const contentBytes = await vscode.workspace.fs.readFile(uri);
                    const content = Buffer.from(contentBytes).toString('utf8');

                    // 워크스페이스 기준 상대 경로를 얻거나, 없으면 기본 파일명 사용
                    const nameForContext = await this.getPathRelativeToProjectRoot(sourcePath) || path.basename(sourcePath);

                    if (currentTotalContentLength + content.length <= this.MAX_TOTAL_CONTENT_LENGTH) {
                        fileContentsContext += `파일명: ${nameForContext}\n코드:\n\`\`\`${getFileType(sourcePath)}\n${content}\n\`\`\`\n\n`;
                        currentTotalContentLength += content.length;
                        includedFilesForContext.push({ name: nameForContext, fullPath: sourcePath });
                    } else {
                        fileContentsContext += `파일명: ${nameForContext}\n코드:\n[INFO] 파일 내용이 너무 길어 생략되었습니다.\n\n`;
                    }
                } else if (stats.type === vscode.FileType.Directory) {
                    const pattern = path.join(uri.fsPath, '**', '*');
                    // 라이브러리 디렉토리들을 glob ignore 패턴으로 추가
                    const ignorePatterns = [
                        path.join(uri.fsPath, '**/node_modules/**'),
                        path.join(uri.fsPath, '**/.git/**'),
                        path.join(uri.fsPath, '**/dist/**'),
                        path.join(uri.fsPath, '**/out/**'),
                        path.join(uri.fsPath, '**/target/**'),
                        path.join(uri.fsPath, '**/build/**'),
                        path.join(uri.fsPath, '**/.gradle/**'),
                        path.join(uri.fsPath, '**/gradle/**'),
                        path.join(uri.fsPath, '**/__pycache__/**'),
                        path.join(uri.fsPath, '**/venv/**'),
                        path.join(uri.fsPath, '**/.venv/**'),
                        path.join(uri.fsPath, '**/vendor/**'),
                        path.join(uri.fsPath, '**/bin/**'),
                        path.join(uri.fsPath, '**/obj/**'),
                        path.join(uri.fsPath, '**/packages/**'),
                        path.join(uri.fsPath, '**/.nuget/**'),
                        path.join(uri.fsPath, '**/pkg/**'),
                        path.join(uri.fsPath, '**/coverage/**'),
                        path.join(uri.fsPath, '**/.coverage/**'),
                        path.join(uri.fsPath, '**/logs/**'),
                        path.join(uri.fsPath, '**/.logs/**'),
                        path.join(uri.fsPath, '**/tmp/**'),
                        path.join(uri.fsPath, '**/.tmp/**'),
                        path.join(uri.fsPath, '**/temp/**'),
                        path.join(uri.fsPath, '**/.temp/**'),
                        path.join(uri.fsPath, '**/cache/**'),
                        path.join(uri.fsPath, '**/.cache/**'),
                        path.join(uri.fsPath, '**/.vscode/**'),
                        path.join(uri.fsPath, '**/.idea/**'),
                        path.join(uri.fsPath, '**/.eclipse/**'),
                        path.join(uri.fsPath, '**/.settings/**'),
                        path.join(uri.fsPath, '**/.project'),
                        path.join(uri.fsPath, '**/.classpath')
                    ];

                    const files = glob.sync(pattern, {
                        nodir: true,
                        dot: false,
                        ignore: ignorePatterns.map(p => p.replace(/\\/g, '/'))
                    });

                    for (const file of files) {
                        if (abortSignal.aborted) {
                            this.notificationService.showWarningMessage('컨텍스트 수집이 취소되었습니다.');
                            break;
                        }

                        // 라이브러리 디렉토리 파일 제외
                        if (this.isLibraryPath(file, uri.fsPath)) {
                            // console.log(`[CodebaseContextService] 라이브러리 디렉토리 파일 제외: ${file}`);
                            continue;
                        }

                        // Check if file is excluded
                        if (this.EXCLUDED_EXTENSIONS.includes(path.extname(file).toLowerCase())) {
                            console.log(`[CodebaseContextService] Skipping excluded file: ${file}`);
                            continue;
                        }

                        // src 디렉토리가 아닌 파일은 키워드 기반으로 필터링
                        if (!this.isSrcFile(file) && !this.shouldIncludeFile(file, keywords, projectType)) {
                            console.log(`[CodebaseContextService] 키워드 필터링으로 제외: ${file}`);
                            continue;
                        }

                        if (currentTotalContentLength >= this.MAX_TOTAL_CONTENT_LENGTH) break;
                        const fileUri = vscode.Uri.file(file);
                        const contentBytes = await vscode.workspace.fs.readFile(fileUri);
                        const content = Buffer.from(contentBytes).toString('utf8');

                        // 워크스페이스 기준 상대 경로를 얻거나, 없으면 기본 파일명 사용
                        const nameForContext = await this.getPathRelativeToProjectRoot(file) || path.basename(file);

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
            fileContentsContext += "[정보] 참조할 소스 경로가 설정되지 않았습니다. AIDEV-IDE 설정에서 경로를 추가해주세요.\n";
        }

        // 중복 파일 제거 (파일명 기준)
        const deduplicatedFiles = this.removeDuplicateFiles(includedFilesForContext);
        if (includedFilesForContext.length !== deduplicatedFiles.length) {
            const removedFiles = includedFilesForContext.length - deduplicatedFiles.length;
            console.log(`[CodebaseContextService] Removed ${removedFiles} duplicate files. Remaining files: ${deduplicatedFiles.map(f => f.name).join(', ')}`);
        }

        return { fileContentsContext, includedFilesForContext: deduplicatedFiles };
    }

    /**
     * 사용자 쿼리에서 키워드를 추출합니다.
     * @param userQuery 사용자 쿼리
     * @returns 추출된 키워드 배열
     */
    private extractKeywords(userQuery: string): string[] {
        if (!userQuery || userQuery.trim() === '') {
            return [];
        }

        // 일반적인 불용어 제거
        const stopWords = new Set([
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
            'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
            'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those',
            'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
            'my', 'your', 'his', 'her', 'its', 'our', 'their', 'mine', 'yours', 'hers', 'ours', 'theirs',
            'how', 'what', 'when', 'where', 'why', 'who', 'which', 'whose', 'whom',
            'please', 'help', 'create', 'make', 'add', 'remove', 'delete', 'update', 'modify', 'change',
            'file', 'files', 'code', 'function', 'class', 'method', 'variable', 'import', 'export',
            '한국어', '영어', '코드', '파일', '함수', '클래스', '메서드', '변수', '생성', '추가', '삭제', '수정', '변경'
        ]);

        // 단어 추출 및 정규화
        const words = userQuery
            .toLowerCase()
            .replace(/[^\w\s가-힣]/g, ' ') // 특수문자 제거, 한글 유지
            .split(/\s+/)
            .filter(word => word.length > 2 && !stopWords.has(word))
            .filter((word, index, array) => array.indexOf(word) === index); // 중복 제거

        return words;
    }

    /**
     * 파일이 src 디렉토리에 속하는지 확인합니다.
     * @param filePath 파일 경로
     * @returns src 디렉토리 파일 여부
     */
    private isSrcFile(filePath: string): boolean {
        const normalizedPath = filePath.replace(/\\/g, '/');
        return normalizedPath.includes('/src/') || normalizedPath.endsWith('/src');
    }

    /**
     * 파일이 존재하는지 확인합니다.
     * @param filePath 파일 경로
     * @returns 파일 존재 여부
     */
    private async fileExists(filePath: string): Promise<boolean> {
        try {
            const uri = vscode.Uri.file(filePath);
            const stats = await vscode.workspace.fs.stat(uri);
            return stats.type === vscode.FileType.File;
        } catch {
            return false;
        }
    }

    /**
     * 프로젝트 타입별 기본 파일들을 컨텍스트에 포함합니다.
     * @param fileNames 포함할 파일명 배열
     * @param projectRoot 프로젝트 루트 경로
     * @param fileContentsContext 파일 컨텍스트 문자열 (참조로 전달)
     * @param includedFilesForContext 포함된 파일 목록 (참조로 전달)
     * @param includedPathSet 포함된 경로 집합 (참조로 전달)
     * @param currentTotalContentLength 현재 총 컨텐츠 길이 (참조로 전달)
     */
    private async includeProjectFiles(
        fileNames: string[],
        projectRoot: string,
        fileContentsContext: string,
        includedFilesForContext: { name: string, fullPath: string }[],
        includedPathSet: Set<string>,
        currentTotalContentLength: number
    ): Promise<void> {
        for (const fileName of fileNames) {
            const filePath = path.join(projectRoot, fileName);
            try {
                const fileUri = vscode.Uri.file(filePath);
                const fileStats = await vscode.workspace.fs.stat(fileUri);
                if (fileStats.type === vscode.FileType.File && !includedPathSet.has(filePath)) {
                    const fileContentBytes = await vscode.workspace.fs.readFile(fileUri);
                    const fileContent = Buffer.from(fileContentBytes).toString('utf8');
                    const relativeName = await this.getPathRelativeToProjectRoot(filePath) || fileName;
                    const fileType = getFileType(filePath);

                    fileContentsContext += `\n--- 파일: ${relativeName} (${fileType}) ---\n${fileContent}\n`;
                    includedFilesForContext.push({ name: fileName, fullPath: filePath });
                    includedPathSet.add(filePath);
                    currentTotalContentLength += fileContent.length;

                    // 토큰 제한 확인
                    if (currentTotalContentLength > this.MAX_TOTAL_CONTENT_LENGTH) {
                        console.log(`[CodebaseContextService] 프로젝트 기본 파일 포함 중 토큰 제한 도달: ${currentTotalContentLength}`);
                        break;
                    }
                }
            } catch {
                // 파일이 존재하지 않음
            }
        }
    }

    /**
     * 프로젝트 타입을 감지합니다.
     * @param sourcePaths 설정된 소스 경로들
     * @param llmDetectedType LLM이 감지한 프로젝트 타입 (선택사항)
     * @returns 프로젝트 타입
     */
    public async detectProjectType(sourcePaths: string[], llmDetectedType?: string): Promise<string> {
        // LLM이 감지한 프로젝트 타입이 있으면 우선 사용
        if (llmDetectedType && llmDetectedType !== 'unknown') {
            console.log(`[CodebaseContextService] LLM 감지 프로젝트 타입 사용: ${llmDetectedType}`);
            return llmDetectedType;
        }
        // console.log(`[CodebaseContextService] 프로젝트 타입 감지 시작: ${sourcePaths.join(', ')}`);

        for (const sourcePath of sourcePaths) {
            try {
                const uri = vscode.Uri.file(sourcePath);
                const stats = await vscode.workspace.fs.stat(uri);

                if (stats.type === vscode.FileType.Directory) {
                    // console.log(`[CodebaseContextService] 디렉토리 확인: ${sourcePath}`);
                    // Node.js 프로젝트 확인
                    const packageJsonPath = path.join(sourcePath, 'package.json');
                    try {
                        await vscode.workspace.fs.stat(vscode.Uri.file(packageJsonPath));
                        console.log(`[CodebaseContextService] package.json 발견: ${packageJsonPath}`);

                        // package.json 내용을 읽어서 React 프로젝트인지 확인
                        try {
                            const packageJsonContent = await vscode.workspace.fs.readFile(vscode.Uri.file(packageJsonPath));
                            const packageJson = JSON.parse(packageJsonContent.toString());

                            // React 관련 의존성 확인
                            const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
                            console.log(`[CodebaseContextService] 의존성 확인:`, Object.keys(dependencies));

                            if (dependencies.react || dependencies['@vitejs/plugin-react'] || dependencies['react-scripts']) {
                                // Vite + React 조합인지 확인
                                if (dependencies.vite || dependencies['@vitejs/plugin-react']) {
                                    console.log(`[CodebaseContextService] React + Vite 프로젝트 감지`);
                                    return 'react-vite';
                                }
                                console.log(`[CodebaseContextService] React 프로젝트 감지`);
                                return 'react';
                            }

                            // Vite 프로젝트 확인 (React가 아닌 경우)
                            if (dependencies.vite || packageJson.devDependencies?.vite) {
                                console.log(`[CodebaseContextService] Vite 프로젝트 감지`);
                                return 'vite';
                            }

                            console.log(`[CodebaseContextService] 일반 Node.js 프로젝트 감지`);
                            return 'nodejs';
                        } catch (e) {
                            console.log(`[CodebaseContextService] package.json 파싱 실패:`, e);
                            return 'nodejs';
                        }
                    } catch {
                        // console.log(`[CodebaseContextService] package.json 없음: ${packageJsonPath}`);
                        // package.json이 없음
                    }

                    // Java/Spring 프로젝트 확인
                    const pomXmlPath = path.join(sourcePath, 'pom.xml');
                    try {
                        await vscode.workspace.fs.stat(vscode.Uri.file(pomXmlPath));
                        console.log(`[CodebaseContextService] pom.xml 발견: ${pomXmlPath}`);

                        // pom.xml 내용을 읽어서 Spring Boot 프로젝트인지 확인
                        try {
                            const pomContent = await vscode.workspace.fs.readFile(vscode.Uri.file(pomXmlPath));
                            const pomText = pomContent.toString();

                            if (pomText.includes('spring-boot-starter') || pomText.includes('spring-boot-parent') || pomText.includes('org.springframework.boot')) {
                                console.log(`[CodebaseContextService] Spring Boot 프로젝트 감지 (Maven)`);
                                return 'spring';
                            }
                            console.log(`[CodebaseContextService] 일반 Java 프로젝트 감지 (Maven)`);
                            return 'java';
                        } catch (e) {
                            console.log(`[CodebaseContextService] pom.xml 파싱 실패:`, e);
                            return 'java';
                        }
                    } catch {
                        // pom.xml이 없음
                    }

                    // Gradle 기반 Spring 프로젝트 확인
                    const buildGradlePath = path.join(sourcePath, 'build.gradle');
                    const buildGradleKtsPath = path.join(sourcePath, 'build.gradle.kts');

                    try {
                        const buildGradleContent = await vscode.workspace.fs.readFile(vscode.Uri.file(buildGradlePath));
                        const buildGradleText = buildGradleContent.toString();

                        if (buildGradleText.includes('spring-boot-starter') || buildGradleText.includes('org.springframework.boot') || buildGradleText.includes('spring-boot-gradle-plugin')) {
                            console.log(`[CodebaseContextService] Spring Boot 프로젝트 감지 (Gradle)`);
                            return 'spring';
                        }
                    } catch {
                        // build.gradle이 없거나 읽을 수 없는 경우
                    }

                    try {
                        const buildGradleKtsContent = await vscode.workspace.fs.readFile(vscode.Uri.file(buildGradleKtsPath));
                        const buildGradleKtsText = buildGradleKtsContent.toString();

                        if (buildGradleKtsText.includes('spring-boot-starter') || buildGradleKtsText.includes('org.springframework.boot') || buildGradleKtsText.includes('spring-boot-gradle-plugin')) {
                            console.log(`[CodebaseContextService] Spring Boot 프로젝트 감지 (Gradle Kotlin DSL)`);
                            return 'spring';
                        }
                    } catch {
                        // build.gradle.kts가 없거나 읽을 수 없는 경우
                    }

                    // Python 프로젝트 확인 (requirements.txt 또는 pyproject.toml 존재)
                    const requirementsPath = path.join(sourcePath, 'requirements.txt');
                    const pyprojectPath = path.join(sourcePath, 'pyproject.toml');
                    const hasPythonProject = await this.fileExists(requirementsPath) || await this.fileExists(pyprojectPath);

                    if (hasPythonProject) {
                        // Python Django 프로젝트 확인
                        const managePyPath = path.join(sourcePath, 'manage.py');
                        if (await this.fileExists(managePyPath)) {
                            return 'django';
                        }

                        // Python Flask 프로젝트 확인
                        const appPyPath = path.join(sourcePath, 'app.py');
                        const flaskAppPath = path.join(sourcePath, 'flask_app.py');
                        if (await this.fileExists(appPyPath) || await this.fileExists(flaskAppPath)) {
                            return 'flask';
                        }

                        // Python FastAPI 프로젝트 확인
                        const mainPyPath = path.join(sourcePath, 'main.py');
                        if (await this.fileExists(mainPyPath)) {
                            try {
                                const mainPyUri = vscode.Uri.file(mainPyPath);
                                const content = await vscode.workspace.fs.readFile(mainPyUri);
                                const contentStr = Buffer.from(content).toString('utf8');
                                if (contentStr.includes('FastAPI') || contentStr.includes('from fastapi')) {
                                    return 'fastapi';
                                }
                            } catch {
                                // 파일 읽기 실패
                            }
                        }

                        // 일반 Python 프로젝트
                        return 'python';
                    }

                    // .NET 프로젝트 확인
                    const csprojFiles = glob.sync(path.join(sourcePath, '**/*.csproj'), { nodir: true });
                    if (csprojFiles.length > 0) {
                        return 'dotnet';
                    }

                    // Go 프로젝트 확인
                    const goModPath = path.join(sourcePath, 'go.mod');
                    try {
                        await vscode.workspace.fs.stat(vscode.Uri.file(goModPath));
                        return 'go';
                    } catch {
                        // go.mod가 없음
                    }

                    // Rust 프로젝트 확인
                    const cargoTomlPath = path.join(sourcePath, 'Cargo.toml');
                    try {
                        await vscode.workspace.fs.stat(vscode.Uri.file(cargoTomlPath));
                        return 'rust';
                    } catch {
                        // Cargo.toml이 없음
                    }

                    // PHP 프로젝트 확인
                    const composerJsonPath = path.join(sourcePath, 'composer.json');
                    try {
                        await vscode.workspace.fs.stat(vscode.Uri.file(composerJsonPath));
                        return 'php';
                    } catch {
                        // composer.json이 없음
                    }

                    // Ruby 프로젝트 확인
                    const gemfilePath = path.join(sourcePath, 'Gemfile');
                    try {
                        await vscode.workspace.fs.stat(vscode.Uri.file(gemfilePath));
                        return 'ruby';
                    } catch {
                        // Gemfile이 없음
                    }

                    // iOS 프로젝트 확인
                    const xcodeprojFiles = glob.sync(path.join(sourcePath, '**/*.xcodeproj'), { nodir: true });
                    const xcworkspaceFiles = glob.sync(path.join(sourcePath, '**/*.xcworkspace'), { nodir: true });
                    if (xcodeprojFiles.length > 0 || xcworkspaceFiles.length > 0) {
                        return 'ios';
                    }

                    // Android 프로젝트 확인
                    const buildGradleFiles = glob.sync(path.join(sourcePath, '**/build.gradle'), { nodir: true });
                    const androidManifestFiles = glob.sync(path.join(sourcePath, '**/AndroidManifest.xml'), { nodir: true });
                    if (buildGradleFiles.length > 0 || androidManifestFiles.length > 0) {
                        return 'android';
                    }

                    // Flutter 프로젝트 확인
                    const pubspecPath = path.join(sourcePath, 'pubspec.yaml');
                    try {
                        await vscode.workspace.fs.stat(vscode.Uri.file(pubspecPath));
                        return 'flutter';
                    } catch {
                        // pubspec.yaml이 없음
                    }

                    // React Native 프로젝트 확인
                    const reactNativePackageJsonPath = path.join(sourcePath, 'package.json');
                    try {
                        const reactNativePackageJsonUri = vscode.Uri.file(reactNativePackageJsonPath);
                        await vscode.workspace.fs.stat(reactNativePackageJsonUri);
                        const content = await vscode.workspace.fs.readFile(reactNativePackageJsonUri);
                        const contentStr = Buffer.from(content).toString('utf8');
                        const packageJson = JSON.parse(contentStr);
                        const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
                        if (dependencies['react-native'] || dependencies['@react-native-community/cli']) {
                            return 'react-native';
                        }
                    } catch {
                        // package.json이 없거나 React Native가 아님
                    }
                }
            } catch (err: any) {
                console.error(`Error detecting project type for ${sourcePath}:`, err);
            }
        }
        return 'unknown';
    }

    /**
     * 파일이 키워드 기반으로 포함되어야 하는지 확인합니다.
     * @param filePath 파일 경로
     * @param keywords 키워드 배열
     * @param projectType 프로젝트 타입
     * @returns 포함 여부
     */
    private shouldIncludeFile(filePath: string, keywords: string[], projectType: string): boolean {
        const fileName = path.basename(filePath).toLowerCase();
        const filePathLower = filePath.toLowerCase();

        // 프레임워크별 주요 설정 파일들은 항상 포함
        if (this.isFrameworkConfigFile(fileName, projectType)) {
            return true;
        }

        if (keywords.length === 0) {
            return false; // 키워드가 없으면 src가 아닌 파일은 제외
        }

        // 파일명이나 경로에 키워드가 포함되어 있는지 확인
        for (const keyword of keywords) {
            if (fileName.includes(keyword) || filePathLower.includes(keyword)) {
                return true;
            }
        }

        // 특정 확장자나 파일명 패턴에 대한 키워드 매칭
        const extension = path.extname(filePath).toLowerCase();
        const baseName = path.basename(filePath, extension).toLowerCase();

        // 설정 파일들
        if (['package.json', 'tsconfig.json', 'webpack.config.js', 'vite.config.js', 'next.config.js'].includes(fileName)) {
            for (const keyword of keywords) {
                if (['config', 'package', 'webpack', 'vite', 'next', 'typescript', 'ts'].includes(keyword)) {
                    return true;
                }
            }
        }

        // README나 문서 파일들
        if (fileName.includes('readme') || fileName.includes('changelog') || fileName.includes('license')) {
            for (const keyword of keywords) {
                if (['readme', 'doc', 'documentation', 'changelog', 'license', '설명', '문서'].includes(keyword)) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * 프레임워크별 주요 설정 파일인지 확인합니다.
     * @param fileName 파일명
     * @param projectType 프로젝트 타입
     * @returns 프레임워크 설정 파일 여부
     */
    private isFrameworkConfigFile(fileName: string, projectType: string): boolean {
        const frameworkConfigFiles: { [key: string]: string[] } = {
            'nodejs': [
                'package.json',
                'package-lock.json',
                'yarn.lock',
                'tsconfig.json',
                'webpack.config.js',
                'webpack.config.ts',
                'vite.config.js',
                'vite.config.ts',
                'next.config.js',
                'next.config.ts',
                'nuxt.config.js',
                'nuxt.config.ts',
                'rollup.config.js',
                'rollup.config.ts',
                'babel.config.js',
                'babel.config.json',
                '.babelrc',
                '.babelrc.js',
                '.babelrc.json',
                'jest.config.js',
                'jest.config.ts',
                'vitest.config.js',
                'vitest.config.ts'
            ],
            'react': [
                'package.json',
                'package-lock.json',
                'yarn.lock',
                'tsconfig.json',
                'webpack.config.js',
                'webpack.config.ts',
                'vite.config.js',
                'vite.config.ts',
                'next.config.js',
                'next.config.ts',
                'babel.config.js',
                'babel.config.json',
                '.babelrc',
                '.babelrc.js',
                '.babelrc.json',
                'jest.config.js',
                'jest.config.ts',
                'vitest.config.js',
                'vitest.config.ts',
                // React 기본 파일들
                'src/App.js',
                'src/App.jsx',
                'src/App.ts',
                'src/App.tsx',
                'src/App.css',
                'src/App.scss',
                'src/index.js',
                'src/index.jsx',
                'src/index.ts',
                'src/index.tsx',
                'src/index.css',
                'src/index.scss',
                'src/main.js',
                'src/main.jsx',
                'src/main.ts',
                'src/main.tsx',
                'public/index.html',
                'index.html'
            ],
            'vite': [
                'package.json',
                'package-lock.json',
                'yarn.lock',
                'tsconfig.json',
                'vite.config.js',
                'vite.config.ts',
                'vitest.config.js',
                'vitest.config.ts',
                // Vite 기본 파일들
                'src/App.js',
                'src/App.jsx',
                'src/App.ts',
                'src/App.tsx',
                'src/App.css',
                'src/App.scss',
                'src/index.js',
                'src/index.jsx',
                'src/index.ts',
                'src/index.tsx',
                'src/index.css',
                'src/index.scss',
                'src/main.js',
                'src/main.jsx',
                'src/main.ts',
                'src/main.tsx',
                'public/index.html',
                'index.html'
            ],
            'react-vite': [
                'package.json',
                'package-lock.json',
                'yarn.lock',
                'tsconfig.json',
                'vite.config.js',
                'vite.config.ts',
                'vitest.config.js',
                'vitest.config.ts',
                // React + Vite 기본 파일들
                'src/App.js',
                'src/App.jsx',
                'src/App.ts',
                'src/App.tsx',
                'src/App.css',
                'src/App.scss',
                'src/index.js',
                'src/index.jsx',
                'src/index.ts',
                'src/index.tsx',
                'src/index.css',
                'src/index.scss',
                'src/main.js',
                'src/main.jsx',
                'src/main.ts',
                'src/main.tsx',
                'public/index.html',
                'index.html'
            ],
            'vue': [
                'package.json',
                'package-lock.json',
                'yarn.lock',
                'tsconfig.json',
                'vue.config.js',
                'vue.config.ts',
                'vite.config.js',
                'vite.config.ts',
                // Vue 기본 파일들
                'src/App.vue',
                'src/main.js',
                'src/main.ts',
                'src/components/HelloWorld.vue',
                'public/index.html'
            ],
            'angular': [
                'package.json',
                'package-lock.json',
                'yarn.lock',
                'tsconfig.json',
                'angular.json',
                // Angular 기본 파일들
                'src/app/app.component.ts',
                'src/app/app.component.html',
                'src/app/app.component.css',
                'src/app/app.module.ts',
                'src/main.ts',
                'src/index.html'
            ],
            'next': [
                'package.json',
                'package-lock.json',
                'yarn.lock',
                'tsconfig.json',
                'next.config.js',
                'next.config.ts',
                // Next.js 기본 파일들
                'pages/index.js',
                'pages/index.tsx',
                'pages/_app.js',
                'pages/_app.tsx',
                'app/page.js',
                'app/page.tsx',
                'app/layout.js',
                'app/layout.tsx'
            ],
            'nuxt': [
                'package.json',
                'package-lock.json',
                'yarn.lock',
                'tsconfig.json',
                'nuxt.config.js',
                'nuxt.config.ts',
                // Nuxt.js 기본 파일들
                'pages/index.vue',
                'layouts/default.vue',
                'components/HelloWorld.vue'
            ],
            'svelte': [
                'package.json',
                'package-lock.json',
                'yarn.lock',
                'tsconfig.json',
                'vite.config.js',
                'vite.config.ts',
                // Svelte 기본 파일들
                'src/App.svelte',
                'src/main.js',
                'src/main.ts',
                'public/index.html'
            ],
            'java': [
                'pom.xml',
                'build.gradle',
                'build.gradle.kts',
                'gradle.properties',
                'settings.gradle',
                'settings.gradle.kts',
                'application.properties',
                'application.yml',
                'application.yaml',
                'bootstrap.properties',
                'bootstrap.yml',
                'bootstrap.yaml'
            ],
            'django': [
                'manage.py',
                'requirements.txt',
                'requirements-dev.txt',
                'pyproject.toml',
                'setup.py',
                'settings.py',
                'urls.py',
                'wsgi.py',
                'asgi.py',
                'Dockerfile',
                'docker-compose.yml',
                'docker-compose.yaml'
            ],
            'flask': [
                'app.py',
                'flask_app.py',
                'requirements.txt',
                'requirements-dev.txt',
                'pyproject.toml',
                'setup.py',
                'config.py',
                'Dockerfile',
                'docker-compose.yml',
                'docker-compose.yaml'
            ],
            'fastapi': [
                'main.py',
                'requirements.txt',
                'requirements-dev.txt',
                'pyproject.toml',
                'setup.py',
                'Dockerfile',
                'docker-compose.yml',
                'docker-compose.yaml'
            ],
            'dotnet': [
                '*.csproj',
                '*.sln',
                '*.csproj.user',
                'appsettings.json',
                'appsettings.Development.json',
                'appsettings.Production.json',
                'web.config',
                'app.config'
            ],
            'go': [
                'go.mod',
                'go.sum',
                'main.go',
                'Dockerfile',
                'docker-compose.yml',
                'docker-compose.yaml'
            ],
            'rust': [
                'Cargo.toml',
                'Cargo.lock',
                'main.rs',
                'lib.rs',
                'Dockerfile',
                'docker-compose.yml',
                'docker-compose.yaml'
            ],
            'php': [
                'composer.json',
                'composer.lock',
                'index.php',
                'config.php',
                'Dockerfile',
                'docker-compose.yml',
                'docker-compose.yaml'
            ],
            'ruby': [
                'Gemfile',
                'Gemfile.lock',
                'Rakefile',
                'config.ru',
                'Dockerfile',
                'docker-compose.yml',
                'docker-compose.yaml'
            ]
        };

        const configFiles = frameworkConfigFiles[projectType] || [];

        // 정확한 파일명 매칭
        if (configFiles.includes(fileName)) {
            return true;
        }

        // 와일드카드 패턴 매칭 (*.csproj 등)
        for (const pattern of configFiles) {
            if (pattern.includes('*')) {
                const regex = new RegExp(pattern.replace(/\*/g, '.*'));
                if (regex.test(fileName)) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * src 디렉토리의 파일들이 업데이트되었는지 확인합니다.
     * @returns 업데이트된 파일 목록
     */
    public async checkSrcFilesUpdate(): Promise<string[]> {
        const updatedFiles: string[] = [];
        const sourcePathsSetting = await this.configurationService.getSourcePaths();

        for (const sourcePath of sourcePathsSetting) {
            try {
                const uri = vscode.Uri.file(sourcePath);
                const stats = await vscode.workspace.fs.stat(uri);

                if (stats.type === vscode.FileType.Directory) {
                    const pattern = path.join(uri.fsPath, '**', '*');
                    const ignorePatterns = [
                        path.join(uri.fsPath, '**/node_modules/**'),
                        path.join(uri.fsPath, '**/.git/**'),
                        path.join(uri.fsPath, '**/dist/**'),
                        path.join(uri.fsPath, '**/out/**'),
                        path.join(uri.fsPath, '**/target/**'),
                        path.join(uri.fsPath, '**/build/**')
                    ];

                    const files = glob.sync(pattern, {
                        nodir: true,
                        dot: false,
                        ignore: ignorePatterns.map(p => p.replace(/\\/g, '/'))
                    });

                    for (const file of files) {
                        if (this.isSrcFile(file)) {
                            // 파일이 수정되었는지 확인 (간단한 방법으로 현재 시간과 비교)
                            const fileStats = await vscode.workspace.fs.stat(vscode.Uri.file(file));
                            const now = Date.now();
                            const fileTime = fileStats.mtime;

                            // 최근 5분 이내에 수정된 파일만 체크
                            if (now - fileTime < 5 * 60 * 1000) {
                                updatedFiles.push(file);
                            }
                        }
                    }
                }
            } catch (err: any) {
                console.error(`Error checking src files update for ${sourcePath}:`, err);
            }
        }

        return updatedFiles;
    }

    /**
     * 중복된 파일을 제거합니다. 파일명이 동일한 경우 가장 최근에 추가된 파일을 유지합니다.
     * @param files 파일 목록
     * @returns 중복이 제거된 파일 목록
     */
    private removeDuplicateFiles(files: { name: string, fullPath: string }[]): { name: string, fullPath: string }[] {
        const fileMap = new Map<string, { name: string, fullPath: string }>();

        // 파일명을 키로 하여 Map에 저장 (동일한 파일명이 있으면 덮어쓰기)
        for (const file of files) {
            fileMap.set(file.name, file);
        }

        const deduplicatedFiles = Array.from(fileMap.values());

        if (files.length !== deduplicatedFiles.length) {
            const removedFiles = files.length - deduplicatedFiles.length;
            console.log(`[CodebaseContextService] Removed ${removedFiles} duplicate files. Remaining files: ${deduplicatedFiles.map(f => f.name).join(', ')}`);
        }

        return deduplicatedFiles;
    }

    /**
     * 프로젝트 컨텍스트를 초기화합니다.
     * 대화 기록 삭제 시 호출되어 이전 프로젝트의 파일 컨텍스트를 정리합니다.
     */
    public clearProjectContext(): void {
        // 프로젝트 컨텍스트 관련 캐시나 상태를 초기화
        console.log('[CodebaseContextService] 프로젝트 컨텍스트 초기화됨');

        // LLM 키워드 선택 서비스 초기화
        if (this.llmKeywordSelectionService) {
            this.llmKeywordSelectionService = null;
        }

        // 강제로 새로운 LLM 키워드 선택 서비스 인스턴스 생성
        if (this.llmService) {
            this.llmKeywordSelectionService = new LlmKeywordSelectionService(this.llmService);
        }

        console.log('[CodebaseContextService] LLM 키워드 선택 서비스 재초기화 완료');

        // 프로젝트 루트 경로 강제 재설정을 위한 로그
        console.log('[CodebaseContextService] 다음 요청 시 프로젝트 루트 경로가 재확인됩니다');
    }
}