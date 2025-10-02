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
    public async getRelevantFilesContext(userQuery: string, abortSignal: AbortSignal): Promise<{ fileContentsContext: string, includedFilesForContext: { name: string, fullPath: string }[] }> {
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

            // 프로젝트 루트에서 관련 파일들 검색
            const relevantFiles = await this.findRelevantFiles(projectRoot, keywords, abortSignal);
            console.log(`[CodebaseContextService] 관련 파일 ${relevantFiles.length}개 발견`);

            // 파일들을 우선순위에 따라 정렬
            const sortedFiles = this.prioritizeFiles(relevantFiles, keywords);

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

        // 단어들을 분리하고 의미있는 키워드만 추출
        const words = cleanQuery.split(' ')
            .filter(word => word.length > 1) // 1글자 이상으로 변경 (더 많은 키워드 포함)
            .filter(word => !this.isStopWord(word)); // 불용어 제거

        // 일반적인 개발 관련 키워드 추가
        const developmentKeywords = this.getDevelopmentKeywords(userQuery);
        
        // 중복 제거하고 모든 키워드 결합
        const allKeywords = [...new Set([...words, ...developmentKeywords])];
        
        console.log(`[CodebaseContextService] 원본 질의: "${userQuery}"`);
        console.log(`[CodebaseContextService] 추출된 단어: ${words.join(', ')}`);
        console.log(`[CodebaseContextService] 개발 키워드: ${developmentKeywords.join(', ')}`);
        console.log(`[CodebaseContextService] 최종 키워드: ${allKeywords.join(', ')}`);
        
        return allKeywords;
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
            'please', 'help', 'me', 'my', 'your', 'our', 'their',
            '코드', '파일', '함수', '클래스', '변수', '메서드', '프로그램', '개발', '작성', '만들', '생성'
        ];
        return stopWords.includes(word.toLowerCase());
    }

    /**
     * 질의에서 개발 관련 키워드를 추출합니다.
     * @param userQuery 사용자의 질의
     * @returns 개발 관련 키워드 배열
     */
    private getDevelopmentKeywords(userQuery: string): string[] {
        const keywords: string[] = [];
        const query = userQuery.toLowerCase();
        
        // 일반적인 개발 질문 패턴 감지
        if (query.includes('분석') || query.includes('analyze') || query.includes('analysis')) {
            keywords.push('src', 'main', 'index', 'app', 'component', 'service', 'util', 'helper');
        }
        
        if (query.includes('프로젝트') || query.includes('project')) {
            keywords.push('package', 'config', 'src', 'main', 'index', 'app', 'component');
        }
        
        if (query.includes('구조') || query.includes('structure') || query.includes('architecture')) {
            keywords.push('src', 'lib', 'utils', 'components', 'services', 'config', 'main');
        }
        
        if (query.includes('설정') || query.includes('config') || query.includes('setting')) {
            keywords.push('config', 'setting', 'env', 'json', 'yaml', 'toml');
        }
        
        if (query.includes('API') || query.includes('api')) {
            keywords.push('api', 'service', 'endpoint', 'route', 'controller');
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
        const searchPatterns = [
            '**/*.ts', '**/*.js', '**/*.tsx', '**/*.jsx', '**/*.py', '**/*.java', '**/*.cpp', '**/*.c',
            '**/*.cs', '**/*.php', '**/*.rb', '**/*.go', '**/*.rs', '**/*.swift', '**/*.kt', '**/*.scala',
            '**/*.html', '**/*.css', '**/*.scss', '**/*.sass', '**/*.json', '**/*.xml', '**/*.yaml', '**/*.yml',
            '**/*.md', '**/*.txt', '**/*.sql', '**/*.sh', '**/*.bat'
        ];

        try {
            for (const pattern of searchPatterns) {
                if (abortSignal.aborted) break;

                const files = await glob(pattern, { cwd: projectRoot, nodir: true });
                const fullPaths = files.map((file: string) => path.join(projectRoot, file));

                for (const filePath of fullPaths) {
                    if (abortSignal.aborted) break;

                    try {
                        // 파일명이나 경로에 키워드가 포함되어 있는지 확인
                        const fileName = path.basename(filePath).toLowerCase();
                        const relativePath = path.relative(projectRoot, filePath).toLowerCase();

                        const isRelevant = keywords.some(keyword =>
                            fileName.includes(keyword) || relativePath.includes(keyword)
                        );

                        if (isRelevant) {
                            relevantFiles.push(filePath);
                        }
                    } catch (error) {
                        console.warn(`[CodebaseContextService] 파일 검색 중 오류: ${filePath}`, error);
                    }
                }
            }
        } catch (error) {
            console.error('[CodebaseContextService] 파일 검색 중 오류:', error);
        }

        return relevantFiles;
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