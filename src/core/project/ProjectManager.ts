/**
 * Project Manager
 * 프로젝트 구조 및 메타데이터를 관리하는 메인 매니저
 */

import * as fs from 'fs';
import * as path from 'path';
import {
    ProjectInfo,
    ProjectType,
    BuildTool,
    FileTreeNode,
    BuildCommands,
    Dependency,
    ProjectMetadata,
    ConfigFile,
    ProjectStats,
    ProjectProfile,
    FrameworkMatch
} from './types';
import { ProjectDetector } from './ProjectDetector';
import { ProjectIndexer } from './ProjectIndexer';
import { ConfigParser } from './ConfigParser';
import { ICodeParserAdapter } from './codeParser/ICodeParserAdapter';
import { TreeSitterAdapter } from './codeParser/TreeSitterAdapter';
import * as vscode from 'vscode';
import { GeminiApi, OllamaApi, AiModelType } from '../../services';

export class ProjectManager {
    private static instance: ProjectManager;
    private detector: ProjectDetector;
    private indexer: ProjectIndexer;
    private parser: ConfigParser;
    private currentProject?: ProjectInfo;
    private projectRoot?: string;
    private codeParserAdapter: ICodeParserAdapter;

    private constructor() {
        this.detector = new ProjectDetector();
        this.indexer = new ProjectIndexer();
        this.parser = new ConfigParser();
        // 코드 파서 초기화
        this.codeParserAdapter = new TreeSitterAdapter();
    }

    public static getInstance(): ProjectManager {
        if (!ProjectManager.instance) {
            ProjectManager.instance = new ProjectManager();
        }
        return ProjectManager.instance;
    }

    /**
     * 프로젝트를 초기화합니다
     */
    public async initialize(projectRoot: string): Promise<ProjectInfo> {
        console.log(`[ProjectManager] Initializing project: ${projectRoot}`);

        this.projectRoot = projectRoot;

        // 프로젝트 타입 감지
        const detection = await this.detector.detectProjectType(projectRoot);

        // 설정 파일 파싱
        const configFiles = await this.parseConfigFiles(projectRoot, detection.type);

        // 빌드 명령어 추출
        const buildCommands = await this.extractBuildCommands(projectRoot, detection.type);

        // 의존성 추출
        const dependencies = await this.extractDependencies(projectRoot, detection.type);

        // 메타데이터 추출
        const metadata = await this.extractMetadata(projectRoot, detection.type);

        const projectInfo: ProjectInfo = {
            type: detection.type,
            name: path.basename(projectRoot),
            root: projectRoot,
            buildTool: detection.buildTool,
            framework: this.detectFramework(projectRoot, detection.type),
            language: this.mapTypeToLanguage(detection.type),
            configFiles,
            buildCommands,
            dependencies,
            metadata
        };

        this.currentProject = projectInfo;

        console.log(`[ProjectManager] Project initialized: ${projectInfo.type} (${projectInfo.framework || 'none'})`);

        return projectInfo;
    }

    /**
     * 프로젝트 타입을 감지합니다
     */
    public async detectProjectType(projectRoot?: string): Promise<{
        type: ProjectType;
        confidence: number;
        buildTool: BuildTool;
    }> {
        const root = projectRoot || this.projectRoot;
        if (!root) {
            throw new Error('Project root not set');
        }

        return await this.detector.detectProjectType(root);
    }

    /**
     * 사용자 질의어에서 프로젝트 타입을 LLM으로 감지합니다.
     * 하나의 프로젝트 타입만 선택하도록 강제합니다.
     */
    public async detectProjectTypeFromQuery(
        userQuery: string,
        projectRoot?: string,
        geminiApi?: GeminiApi,
        ollamaApi?: OllamaApi,
        currentModelType?: AiModelType,
        abortSignal?: AbortSignal
    ): Promise<{ projectType: string, confidence: number, needsUserSelection: boolean }> {
        try {
            // 로컬 파일 시스템 기반 감지 먼저 시도
            let localProjectType = 'unknown';
            const root = projectRoot || this.projectRoot;
            if (root) {
                try {
                    if (fs.existsSync(path.join(root, 'package.json'))) {
                        localProjectType = 'nodejs-npm';
                    } else if (fs.existsSync(path.join(root, 'requirements.txt')) || fs.existsSync(path.join(root, 'pyproject.toml'))) {
                        localProjectType = 'python';
                    } else if (fs.existsSync(path.join(root, 'pom.xml'))) {
                        localProjectType = 'java-maven';
                    } else if (fs.existsSync(path.join(root, 'build.gradle'))) {
                        localProjectType = 'java-gradle';
                    } else if (fs.existsSync(path.join(root, 'go.mod'))) {
                        localProjectType = 'go';
                    } else if (fs.existsSync(path.join(root, 'build.gradle')) && fs.existsSync(path.join(root, 'app'))) {
                        // Android 프로젝트 확인
                        const androidManifest = fs.existsSync(path.join(root, 'app', 'src', 'main', 'AndroidManifest.xml'));
                        if (androidManifest) {
                            localProjectType = 'android';
                        }
                    } else if (fs.existsSync(path.join(root, 'Podfile')) || fs.existsSync(path.join(root, '*.xcodeproj'))) {
                        localProjectType = 'ios';
                    }
                } catch (e) {
                    console.warn('[ProjectManager] 로컬 프로젝트 타입 감지 실패:', e);
                }
            }

            const supportedTypes = [
                'nodejs-npm',
                'python',
                'java-maven',
                'java-gradle',
                'go',
                'android',
                'ios'
            ];

            // 1차: 키워드 기반 프로젝트 타입 추론 (프로젝트 생성 요청 등, 아직 파일이 거의 없을 때 사용)
            // 로컬 타입이 unknown 이고, 사용자 질의에 "Node.js 타입스크립트 백엔드" 등 명확한 힌트가 있는 경우
            if (localProjectType === 'unknown') {
                const keywordType = this.detectProjectTypeFromKeywords(userQuery);
                if (keywordType && supportedTypes.includes(keywordType)) {
                    console.log(`[ProjectManager] Keyword-based project type detection: ${keywordType}`);
                    return {
                        projectType: keywordType,
                        confidence: 0.8,
                        needsUserSelection: false
                    };
                }
            }

            const projectTypePrompt = `다음 사용자 요청과 로컬 프로젝트 구성을 분석하여 프로젝트 타입을 정확히 하나만 선택하세요.

지원하는 프로젝트 타입 (반드시 이 중 하나만 선택):
1. nodejs-npm: Node.js 프로젝트 (package.json 존재)
2. python: Python 프로젝트 (requirements.txt, pyproject.toml 등)
3. java-maven: Java Maven 프로젝트 (pom.xml 존재)
4. java-gradle: Java Gradle 프로젝트 (build.gradle 존재)
5. go: Go 프로젝트 (go.mod 존재)
6. android: Android 프로젝트 (AndroidManifest.xml, build.gradle 존재)
7. ios: iOS 프로젝트 (Podfile, .xcodeproj 존재)

로컬 프로젝트 구성: ${localProjectType !== 'unknown' ? localProjectType : '감지되지 않음'}

**중요 규칙:**
- 반드시 위 7개 타입 중 하나만 선택해야 합니다.
- 여러 타입이 가능해 보이면 가장 확실한 하나만 선택하세요.
- 확신이 없으면 (confidence < 0.7) needsUserSelection을 true로 설정하세요.
- 로컬 파일 시스템에서 감지된 타입이 있으면 그것을 우선 고려하세요.

출력 형식 (JSON):
{
  "projectType": "nodejs-npm",
  "confidence": 0.9,
  "reasoning": "package.json 파일이 존재하고 사용자 요청에 npm 키워드가 포함되어 있습니다.",
  "needsUserSelection": false
}

사용자 요청: "${userQuery}"`;

            // LLM이 없으면 로컬 감지 결과 반환
            if (!geminiApi && !ollamaApi) {
                if (localProjectType !== 'unknown') {
                    return {
                        projectType: localProjectType,
                        confidence: 0.8,
                        needsUserSelection: false
                    };
                }
                return {
                    projectType: 'unknown',
                    confidence: 0,
                    needsUserSelection: true
                };
            }

            let response: string;

            if (currentModelType === AiModelType.GEMINI && geminiApi) {
                response = await geminiApi.sendMessage(projectTypePrompt, undefined, { signal: abortSignal });
            } else if ((currentModelType === AiModelType.OLLAMA_Gemma || currentModelType === AiModelType.OLLAMA_DeepSeek || currentModelType === AiModelType.OLLAMA_CodeLlama || currentModelType === AiModelType.OLLAMA_GPT_OSS) && ollamaApi) {
                response = await ollamaApi.sendMessage(projectTypePrompt, { signal: abortSignal });
            } else {
                // LLM을 사용할 수 없으면 로컬 감지 결과 반환
                if (localProjectType !== 'unknown') {
                    return {
                        projectType: localProjectType,
                        confidence: 0.8,
                        needsUserSelection: false
                    };
                }
                return {
                    projectType: 'unknown',
                    confidence: 0,
                    needsUserSelection: true
                };
            }

            console.log(`[ProjectManager] LLM 프로젝트 타입 감지 응답: ${response}`);

            // JSON 응답 파싱 (LLM 응답만 사용)
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                try {
                    const result = JSON.parse(jsonMatch[0]);
                    if (result.projectType && supportedTypes.includes(result.projectType)) {
                        const confidence = result.confidence || 0.5;
                        // confidence가 0.5 미만이면 사용자 선택 필요
                        const needsUserSelection = confidence < 0.5 || (result.needsUserSelection === true);
                        console.log(`[ProjectManager] LLM 프로젝트 타입 감지 성공: ${result.projectType} (신뢰도: ${confidence}, 사용자 선택 필요: ${needsUserSelection})`);
                        return {
                            projectType: result.projectType,
                            confidence: confidence,
                            needsUserSelection: needsUserSelection
                        };
                    }
                } catch (parseError) {
                    console.warn('[ProjectManager] LLM 응답 JSON 파싱 실패:', parseError);
                }
            }

            // LLM 응답 파싱 실패 시 로컬 감지 결과 반환
            if (localProjectType !== 'unknown') {
                console.warn('[ProjectManager] LLM 프로젝트 타입 감지 실패 - 로컬 감지 결과 사용');
                return {
                    projectType: localProjectType,
                    confidence: 0.7,
                    needsUserSelection: false
                };
            }

            console.warn('[ProjectManager] LLM 프로젝트 타입 감지 실패 - LLM 응답을 파싱할 수 없음');
            return {
                projectType: 'unknown',
                confidence: 0,
                needsUserSelection: true
            };
        } catch (error) {
            console.warn('[ProjectManager] LLM 프로젝트 타입 감지 실패:', error);
            // 에러 발생 시 로컬 감지 결과 반환
            const root = projectRoot || this.projectRoot;
            if (root) {
                try {
                    if (fs.existsSync(path.join(root, 'package.json'))) {
                        return { projectType: 'nodejs-npm', confidence: 0.7, needsUserSelection: false };
                    } else if (fs.existsSync(path.join(root, 'pom.xml'))) {
                        return { projectType: 'java-maven', confidence: 0.7, needsUserSelection: false };
                    } else if (fs.existsSync(path.join(root, 'build.gradle'))) {
                        return { projectType: 'java-gradle', confidence: 0.7, needsUserSelection: false };
                    }
                } catch (e) {
                    // ignore
                }
            }
            return {
                projectType: 'unknown',
                confidence: 0,
                needsUserSelection: true
            };
        }
    }

    /**
     * 사용자 질의어에서 키워드 기반으로 대략적인 프로젝트 타입을 추론합니다.
     * 새 프로젝트 생성 요청처럼 로컬 파일이 거의 없을 때 사용됩니다.
     */
    private detectProjectTypeFromKeywords(userQuery: string): string | undefined {
        const lower = userQuery.toLowerCase();

        // Node.js / TypeScript 백엔드
        const hasNode =
            lower.includes('node.js') ||
            lower.includes('nodejs') ||
            lower.includes('node ') ||
            lower.includes(' node') ||
            userQuery.includes('노드');
        const hasTypeScript =
            lower.includes('typescript') ||
            lower.includes('type script') ||
            userQuery.includes('타입스크립트');

        if (hasNode && hasTypeScript) {
            return 'nodejs-npm';
        }

        // 일반 Node.js
        if (hasNode) {
            return 'nodejs-npm';
        }

        // Python
        if (lower.includes('python') || userQuery.includes('파이썬')) {
            return 'python';
        }

        // Spring / Java 백엔드
        const hasSpring =
            lower.includes('spring boot') ||
            lower.includes('springboot') ||
            lower.includes('spring ') ||
            userQuery.includes('스프링');
        const hasJava =
            lower.includes('java') ||
            userQuery.includes('자바');

        if (hasSpring || (hasJava && (lower.includes('backend') || userQuery.includes('백엔드')))) {
            // 빌드 도구는 아직 모르므로 일단 maven으로 기본 설정
            return 'java-maven';
        }

        // Go
        if (lower.includes('golang') || lower.includes(' go ') || lower.startsWith('go ')) {
            return 'go';
        }

        // Android
        if (lower.includes('android') || userQuery.includes('안드로이드')) {
            return 'android';
        }

        // iOS
        if (lower.includes('ios') || userQuery.includes('아이폰') || userQuery.includes('iOS')) {
            return 'ios';
        }

        return undefined;
    }

    /**
     * 프로젝트 구조를 가져옵니다
     */
    public async getProjectStructure(projectRoot?: string): Promise<FileTreeNode> {
        const root = projectRoot || this.projectRoot;
        if (!root) {
            throw new Error('Project root not set');
        }

        return await this.buildFileTree(root, root);
    }

    /**
     * 빌드 명령어를 찾습니다
     */
    public async findBuildCommands(projectRoot?: string): Promise<BuildCommands> {
        const root = projectRoot || this.projectRoot;
        if (!root) {
            throw new Error('Project root not set');
        }

        const detection = await this.detector.detectProjectType(root);
        return await this.extractBuildCommands(root, detection.type);
    }

    /**
     * 설정 파일을 파싱합니다
     */
    public async parseConfig(configFile: string): Promise<ConfigFile | null> {
        return await this.parser.parseConfig(configFile);
    }

    /**
     * 파일을 인덱싱합니다
     */
    public async indexFiles(
        pattern: string,
        options?: {
            excludePatterns?: string[];
            maxFileSize?: number;
        }
    ): Promise<any> {
        const root = this.projectRoot;
        if (!root) {
            throw new Error('Project root not set');
        }

        return await this.indexer.indexProject(root, {
            includePatterns: [pattern],
            excludePatterns: options?.excludePatterns,
            maxFileSize: options?.maxFileSize
        });
    }

    /**
     * 현재 프로젝트 정보를 가져옵니다
     */
    public getCurrentProject(): ProjectInfo | undefined {
        return this.currentProject;
    }

    /**
     * 프로젝트의 모든 파일 리스트를 수집합니다 (라이브러리 파일 제외)
     * @param abortSignal 취소 신호
     * @returns 파일 경로 리스트
     */
    public async getAllProjectFiles(abortSignal: AbortSignal): Promise<string[]> {
        const root = this.projectRoot;
        if (!root) {
            throw new Error('Project root not set');
        }

        return await this.indexer.getAllProjectFiles(root, abortSignal);
    }

    /**
     * 프로젝트 통계를 가져옵니다
     */
    public async getProjectStats(): Promise<ProjectStats> {
        const index = this.indexer.getIndex();
        const files = Array.from(index.files.values());

        const filesByLanguage: Record<string, number> = {};
        let totalLines = 0;

        for (const file of files) {
            filesByLanguage[file.language] = (filesByLanguage[file.language] || 0) + 1;
            // 라인 수는 대략적으로 계산 (파일 크기 기반)
            totalLines += Math.floor(file.size / 50); // 평균 라인 길이 50자 가정
        }

        const largestFiles = files
            .sort((a, b) => b.size - a.size)
            .slice(0, 10)
            .map(f => ({ path: f.path, size: f.size }));

        return {
            totalFiles: files.length,
            totalLines,
            filesByLanguage,
            largestFiles
        };
    }

    /**
     * 설정 파일들을 파싱합니다
     */
    private async parseConfigFiles(
        projectRoot: string,
        projectType: ProjectType
    ): Promise<ConfigFile[]> {
        const configFiles: ConfigFile[] = [];
        const configPaths: string[] = [];

        // 프로젝트 타입별 설정 파일
        switch (projectType) {
            case ProjectType.TYPESCRIPT:
            case ProjectType.JAVASCRIPT:
            case ProjectType.REACT:
            case ProjectType.VUE:
            case ProjectType.ANGULAR:
            case ProjectType.NODE:
                configPaths.push('package.json', 'tsconfig.json', 'jsconfig.json', '.env');
                break;
            case ProjectType.SPRING_BOOT:
                configPaths.push('pom.xml', 'build.gradle', 'application.properties', 'application.yml');
                break;
            case ProjectType.PYTHON:
            case ProjectType.DJANGO:
            case ProjectType.FLASK:
            case ProjectType.FASTAPI:
                configPaths.push('requirements.txt', 'pyproject.toml', 'setup.py', '.env');
                break;
            case ProjectType.GO:
                configPaths.push('go.mod', 'go.sum');
                break;
            case ProjectType.RUST:
                configPaths.push('Cargo.toml');
                break;
            case ProjectType.FLUTTER:
                configPaths.push('pubspec.yaml');
                break;
        }

        for (const configPath of configPaths) {
            const fullPath = path.join(projectRoot, configPath);
            if (fs.existsSync(fullPath)) {
                const config = await this.parser.parseConfig(fullPath);
                if (config) {
                    configFiles.push(config);
                }
            }
        }

        return configFiles;
    }

    /**
     * 빌드 명령어를 추출합니다
     */
    private async extractBuildCommands(
        projectRoot: string,
        projectType: ProjectType
    ): Promise<BuildCommands> {
        const commands: BuildCommands = {};

        switch (projectType) {
            case ProjectType.TYPESCRIPT:
            case ProjectType.JAVASCRIPT:
            case ProjectType.REACT:
            case ProjectType.VUE:
            case ProjectType.ANGULAR:
            case ProjectType.NODE:
                const packageJsonPath = path.join(projectRoot, 'package.json');
                if (fs.existsSync(packageJsonPath)) {
                    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
                    return this.parser.extractBuildCommands(packageJson);
                }
                break;
            case ProjectType.SPRING_BOOT:
                commands.install = './mvnw install';
                commands.build = './mvnw package';
                commands.test = './mvnw test';
                commands.start = './mvnw spring-boot:run';
                break;
            case ProjectType.PYTHON:
            case ProjectType.DJANGO:
            case ProjectType.FLASK:
            case ProjectType.FASTAPI:
                commands.install = 'pip install -r requirements.txt';
                commands.test = 'pytest';
                break;
        }

        return commands;
    }

    /**
     * 의존성을 추출합니다
     */
    private async extractDependencies(
        projectRoot: string,
        projectType: ProjectType
    ): Promise<Dependency[]> {
        switch (projectType) {
            case ProjectType.TYPESCRIPT:
            case ProjectType.JAVASCRIPT:
            case ProjectType.REACT:
            case ProjectType.VUE:
            case ProjectType.ANGULAR:
            case ProjectType.NODE:
                const packageJsonPath = path.join(projectRoot, 'package.json');
                if (fs.existsSync(packageJsonPath)) {
                    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
                    return this.parser.extractDependencies(packageJson);
                }
                break;
        }

        return [];
    }

    /**
     * 메타데이터를 추출합니다
     */
    private async extractMetadata(
        projectRoot: string,
        projectType: ProjectType
    ): Promise<ProjectMetadata | undefined> {
        switch (projectType) {
            case ProjectType.TYPESCRIPT:
            case ProjectType.JAVASCRIPT:
            case ProjectType.REACT:
            case ProjectType.VUE:
            case ProjectType.ANGULAR:
            case ProjectType.NODE:
                const packageJsonPath = path.join(projectRoot, 'package.json');
                if (fs.existsSync(packageJsonPath)) {
                    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
                    return this.parser.extractMetadata(packageJson);
                }
                break;
        }

        return undefined;
    }

    /**
     * 프레임워크를 감지합니다
     */
    private detectFramework(projectRoot: string, projectType: ProjectType): string | undefined {
        // LLM이 파일을 읽어 판단하도록 하기 위해, 여기서는 간단한 추론만 수행
        if (projectType === ProjectType.NODE) {
            // package.json을 읽어 React, Vue, Angular 등 프레임워크를 추론
            // 이 부분은 LLM이 직접 파일을 읽어 판단하도록 위임
            return 'Node.js';
        }
        if (projectType === ProjectType.JAVA) {
            // pom.xml 또는 build.gradle을 읽어 Spring Boot 등 추론
            return 'Spring Boot';
        }
        return undefined;
    }

    /**
     * Code Parser 어댑터를 가져옵니다
     */
    public getCodeParserAdapter(): ICodeParserAdapter {
        return this.codeParserAdapter;
    }

    /**
     * 프로젝트 타입을 언어로 매핑합니다
     */
    private mapTypeToLanguage(type: ProjectType): string {
        const mapping: Record<ProjectType, string> = {
            [ProjectType.TYPESCRIPT]: 'TypeScript',
            [ProjectType.JAVASCRIPT]: 'JavaScript',
            [ProjectType.REACT]: 'TypeScript/JavaScript',
            [ProjectType.REACT_NATIVE]: 'TypeScript/JavaScript',
            [ProjectType.VUE]: 'TypeScript/JavaScript',
            [ProjectType.ANGULAR]: 'TypeScript',
            [ProjectType.NODE]: 'JavaScript',
            [ProjectType.SPRING_BOOT]: 'Java',
            [ProjectType.JAVA]: 'Java',
            [ProjectType.PYTHON]: 'Python',
            [ProjectType.DJANGO]: 'Python',
            [ProjectType.FLASK]: 'Python',
            [ProjectType.FASTAPI]: 'Python',
            [ProjectType.GO]: 'Go',
            [ProjectType.RUST]: 'Rust',
            [ProjectType.FLUTTER]: 'Dart',
            [ProjectType.UNKNOWN]: 'Unknown'
        };

        return mapping[type] || 'Unknown';
    }

    /**
     * 파일 트리를 빌드합니다
     */
    private async buildFileTree(
        dir: string,
        projectRoot: string,
        maxDepth: number = 5,
        currentDepth: number = 0
    ): Promise<FileTreeNode> {
        const name = path.basename(dir);
        const stats = fs.statSync(dir);

        const node: FileTreeNode = {
            name,
            path: dir,
            type: 'directory',
            size: stats.size,
            children: []
        };

        if (currentDepth >= maxDepth) {
            return node;
        }

        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });

            for (const entry of entries) {
                // 숨김 파일/디렉토리 제외
                if (entry.name.startsWith('.')) {
                    continue;
                }

                // node_modules, dist 등 제외
                if (['node_modules', 'dist', 'build', 'target', '.git'].includes(entry.name)) {
                    continue;
                }

                const fullPath = path.join(dir, entry.name);

                if (entry.isDirectory()) {
                    const childNode = await this.buildFileTree(fullPath, projectRoot, maxDepth, currentDepth + 1);
                    node.children!.push(childNode);
                } else if (entry.isFile()) {
                    const fileStats = fs.statSync(fullPath);
                    node.children!.push({
                        name: entry.name,
                        path: fullPath,
                        type: 'file',
                        size: fileStats.size,
                        extension: path.extname(entry.name)
                    });
                }
            }
        } catch (error) {
            console.warn(`[ProjectManager] Failed to build file tree for ${dir}:`, error);
        }

        return node;
    }

    /**
     * 프로젝트를 LLM을 사용하여 분석합니다
     * @param analysisPrompt 분석 프롬프트
     * @param llmService LLM 서비스 (LLMApiClient 인스턴스)
     * @returns 분석 결과
     */
    public async analyzeProject(analysisPrompt: string, llmApiClient: any): Promise<string> {
        try {
            console.log('[ProjectManager] 프로젝트 분석 시작');
            // LLMApiClient의 sendMessage 메서드 사용
            return await llmApiClient.sendMessage(analysisPrompt);
        } catch (error) {
            console.error('[ProjectManager] 프로젝트 분석 중 오류:', error);
            throw error;
        }
    }

    /**
     * 프로젝트 프로필을 가져옵니다 (ProjectProfileService 호환)
     * @param storage VS Code Memento 스토리지
     * @returns 프로젝트 프로필
     */
    public async getProjectProfile(storage?: vscode.Memento): Promise<ProjectProfile | undefined> {
        if (!this.projectRoot) {
            return undefined;
        }

        const PROFILE_KEY = 'aidevIde.projectProfile';

        // 스토리지에서 기존 프로필 로드
        if (storage) {
            const existing = storage.get<ProjectProfile>(PROFILE_KEY);
            if (existing) {
                return existing;
            }
        }

        // 새로 스캔
        return await this.scanProjectProfile(storage);
    }

    /**
     * 프로젝트 프로필을 스캔합니다
     */
    public async scanProjectProfile(storage?: vscode.Memento): Promise<ProjectProfile> {
        if (!this.projectRoot) {
            throw new Error('Project root not set');
        }

        const profile = await this.scanWorkspaceForProfile(this.projectRoot);

        if (storage) {
            const PROFILE_KEY = 'aidevIde.projectProfile';
            await storage.update(PROFILE_KEY, profile);
        }

        return profile;
    }

    /**
     * 워크스페이스를 스캔하여 프로필을 생성합니다
     */
    private async scanWorkspaceForProfile(rootPath: string): Promise<ProjectProfile> {
        const packageJson = await this.tryReadJson(path.join(rootPath, 'package.json'));
        const pyProject = await this.tryReadToml(path.join(rootPath, 'pyproject.toml'));
        const goMod = await this.tryReadFile(path.join(rootPath, 'go.mod'));
        const pomXml = await this.tryReadFile(path.join(rootPath, 'pom.xml'));
        const buildGradle = await this.tryReadFile(path.join(rootPath, 'build.gradle'));
        const buildGradleKts = await this.tryReadFile(path.join(rootPath, 'build.gradle.kts'));
        const requirementsTxt = await this.tryReadFile(path.join(rootPath, 'requirements.txt'));
        const setupPy = await this.tryReadFile(path.join(rootPath, 'setup.py'));

        const scripts = (packageJson?.scripts as Record<string, string>) || {};
        const entryPoints = this.detectEntryPoints(packageJson, scripts);
        const packageManager = await this.detectPackageManager(rootPath);

        const frameworks: FrameworkMatch[] = [];
        const language = this.detectLanguageForProfile({ packageJson, pyProject, goMod, pomXml, buildGradle, buildGradleKts, requirementsTxt, setupPy, frameworks });

        const profile: ProjectProfile = {
            language,
            frameworks,
            packageManager,
            entryPoints,
            scripts,
            lastScannedAt: Date.now()
        };

        return profile;
    }

    /**
     * 언어를 감지합니다 (프로필용)
     */
    private detectLanguageForProfile(inputs: { packageJson?: any; pyProject?: any; goMod?: string | undefined; pomXml?: string | undefined; buildGradle?: string | undefined; buildGradleKts?: string | undefined; requirementsTxt?: string | undefined; setupPy?: string | undefined; frameworks: FrameworkMatch[] }): string {
        if (inputs.packageJson) {
            this.populateNodeFrameworks(inputs.packageJson, inputs.frameworks);
            return 'JavaScript/TypeScript';
        }
        if (inputs.pyProject || inputs.requirementsTxt || inputs.setupPy) {
            this.populatePythonFrameworks(inputs, inputs.frameworks);
            return 'Python';
        }
        if (inputs.goMod) {
            inputs.frameworks.push({ framework: 'Go', confidence: 0.6, evidence: ['Detected go.mod'] });
            return 'Go';
        }
        if (inputs.pomXml || inputs.buildGradle || inputs.buildGradleKts) {
            this.populateJavaFrameworks(inputs, inputs.frameworks);
            if (inputs.frameworks.length === 0) {
                inputs.frameworks.push({ framework: 'Java (Unknown Framework)', confidence: 0.5, evidence: ['Detected Java build file'] });
            }
            return 'Java';
        }
        return 'Unknown';
    }

    /**
     * Node.js 프레임워크를 감지합니다
     */
    private populateNodeFrameworks(pkg: any, frameworks: FrameworkMatch[]): void {
        const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
        const addFramework = (name: string, confidence: number, evidence: string) => {
            frameworks.push({ framework: name, confidence, evidence: [evidence] });
        };

        const has = (library: string) => deps[library] !== undefined;

        if (has('react') || has('react-dom')) {
            addFramework('React', 0.9, 'Found react dependency');
        }
        if (has('vue')) {
            addFramework('Vue', 0.9, 'Found vue dependency');
        }
        if (has('@angular/core')) {
            addFramework('Angular', 0.9, 'Found @angular/core dependency');
        }
        if (has('vite')) {
            addFramework('Vite', 0.8, 'Found vite dependency');
        }
        if (has('next')) {
            addFramework('Next.js', 0.8, 'Found next dependency');
        }
        if (has('@nestjs/core')) {
            addFramework('NestJS', 0.8, 'Found @nestjs/core dependency');
        }
        if (has('express')) {
            addFramework('Express', 0.7, 'Found express dependency');
        }
    }

    /**
     * Python 프레임워크를 감지합니다
     */
    private populatePythonFrameworks(inputs: { pyProject?: any; requirementsTxt?: string; setupPy?: string }, frameworks: FrameworkMatch[]): void {
        const dependencies: string[] = [];

        if (inputs.pyProject) {
            const tool = inputs.pyProject.tool || {};
            for (const key of Object.keys(tool)) {
                const cfg = tool[key];
                if (cfg?.dependencies && Array.isArray(cfg.dependencies)) {
                    dependencies.push(...cfg.dependencies.map((dep: any) => String(dep)));
                }
            }
        }

        if (inputs.requirementsTxt) {
            dependencies.push(...inputs.requirementsTxt.split(/\r?\n/).map(line => line.trim()).filter(Boolean));
        }

        if (inputs.setupPy) {
            const match = inputs.setupPy.match(/install_requires\s*=\s*\[(.*?)\]/s);
            if (match) {
                const entries = match[1]
                    .split(',')
                    .map(item => item.replace(/['"\s]/g, ''))
                    .filter(Boolean);
                dependencies.push(...entries);
            }
        }

        const add = (framework: string, evidence: string) => {
            frameworks.push({ framework, confidence: 0.8, evidence: [evidence] });
        };

        const matched = (needle: string) => dependencies.some(dep => dep.toLowerCase().includes(needle));
        if (matched('fastapi')) add('FastAPI', 'Python dependency includes fastapi');
        if (matched('flask')) add('Flask', 'Python dependency includes flask');
        if (matched('django')) add('Django', 'Python dependency includes django');
    }

    /**
     * Java 프레임워크를 감지합니다
     */
    private populateJavaFrameworks(inputs: { pomXml?: string; buildGradle?: string; buildGradleKts?: string }, frameworks: FrameworkMatch[]): void {
        const add = (framework: string, evidence: string) => frameworks.push({ framework, confidence: 0.8, evidence: [evidence] });

        const detect = (content: string | undefined, needle: string) => content && content.includes(needle);

        if (detect(inputs.pomXml, 'spring-boot-starter')) add('Spring Boot', 'pom.xml contains spring-boot-starter');
        if (detect(inputs.pomXml, 'spring-framework')) add('Spring', 'pom.xml references spring-framework');
        if (detect(inputs.buildGradle, 'spring-boot-starter')) add('Spring Boot', 'build.gradle contains spring-boot-starter');
        if (detect(inputs.buildGradleKts, 'spring-boot-starter')) add('Spring Boot', 'build.gradle.kts contains spring-boot-starter');
    }

    /**
     * 엔트리 포인트를 감지합니다
     */
    private detectEntryPoints(pkg?: any, scripts?: Record<string, string>): string[] {
        const entryPoints: string[] = [];
        if (!pkg) return entryPoints;

        if (pkg.module) entryPoints.push(pkg.module);
        if (pkg.main) entryPoints.push(pkg.main);
        if (pkg.bin && typeof pkg.bin === 'string') entryPoints.push(pkg.bin);
        if (pkg.bin && typeof pkg.bin === 'object') {
            const binValues = Object.values(pkg.bin).filter((value): value is string => typeof value === 'string');
            entryPoints.push(...binValues);
        }

        const runScripts = ['start', 'dev', 'serve', 'preview'];
        for (const script of runScripts) {
            if (scripts?.[script]) {
                entryPoints.push(`npm run ${script}`);
            }
        }

        return [...new Set(entryPoints)].filter(Boolean);
    }

    /**
     * 패키지 매니저를 감지합니다
     */
    private async detectPackageManager(rootPath: string): Promise<'npm' | 'yarn' | 'pnpm' | 'bun' | undefined> {
        const lockFiles: Record<string, 'npm' | 'yarn' | 'pnpm' | 'bun'> = {
            'package-lock.json': 'npm',
            'yarn.lock': 'yarn',
            'pnpm-lock.yaml': 'pnpm',
            'bun.lockb': 'bun'
        };

        for (const [file, manager] of Object.entries(lockFiles)) {
            const uri = vscode.Uri.file(path.join(rootPath, file));
            try {
                await vscode.workspace.fs.stat(uri);
                return manager;
            } catch {
                continue;
            }
        }
        return undefined;
    }

    /**
     * JSON 파일을 읽습니다
     */
    private async tryReadJson(filePath: string): Promise<any | undefined> {
        try {
            const uri = vscode.Uri.file(filePath);
            const data = await vscode.workspace.fs.readFile(uri);
            return JSON.parse(Buffer.from(data).toString('utf8'));
        } catch {
            return undefined;
        }
    }

    /**
     * TOML 파일을 읽습니다
     */
    private async tryReadToml(filePath: string): Promise<any | undefined> {
        try {
            const uri = vscode.Uri.file(filePath);
            const data = await vscode.workspace.fs.readFile(uri);
            return this.parseToml(Buffer.from(data).toString('utf8'));
        } catch {
            return undefined;
        }
    }

    /**
     * 파일을 읽습니다
     */
    private async tryReadFile(filePath: string): Promise<string | undefined> {
        try {
            const uri = vscode.Uri.file(filePath);
            const data = await vscode.workspace.fs.readFile(uri);
            return Buffer.from(data).toString('utf8');
        } catch {
            return undefined;
        }
    }

    /**
     * TOML을 파싱합니다
     */
    private parseToml(content: string): any {
        const result: any = {};
        let currentSection: any = result;

        const lines = content.split(/\r?\n/);
        for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line || line.startsWith('#')) continue;

            if (line.startsWith('[') && line.endsWith(']')) {
                const sectionPath = line.slice(1, -1).split('.');
                currentSection = result;
                for (const part of sectionPath) {
                    currentSection[part] = currentSection[part] || {};
                    currentSection = currentSection[part];
                }
                continue;
            }

            const [key, value] = line.split('=').map(part => part.trim());
            if (!key || value === undefined) continue;

            currentSection[key] = value.replace(/^"|"$/g, '');
        }

        return result;
    }

    /**
     * 프로젝트 프로필 컨텍스트를 빌드합니다
     */
    public buildProfileContext(profile: ProjectProfile, projectType?: string): string {
        const lines: string[] = [];
        if (profile.language) {
            lines.push(`프로젝트 언어: ${profile.language}`);
        }
        if (projectType && projectType !== 'unknown') {
            lines.push(`프로젝트 타입: ${projectType}`);
        } else if (projectType === 'unknown') {
            lines.push(`프로젝트 타입: 감지되지 않음 (새 프로젝트 생성 중)`);
        }
        if (profile.frameworks.length > 0) {
            const formatted = profile.frameworks
                .map(f => `${f.framework} (신뢰도 ${(f.confidence * 100).toFixed(0)}%)`)
                .join(', ');
            lines.push(`프레임워크: ${formatted}`);
        }
        if (profile.packageManager) {
            lines.push(`패키지 매니저: ${profile.packageManager}`);
        }
        if (profile.entryPoints.length > 0) {
            lines.push(`실행 엔트리포인트: ${profile.entryPoints.slice(0, 5).join(', ')}`);
        }
        if (Object.keys(profile.scripts || {}).length > 0) {
            const highlightedScripts = ['start', 'dev', 'serve', 'build', 'test'];
            const selected = highlightedScripts
                .filter(name => profile.scripts[name])
                .map(name => `${name}: ${profile.scripts[name]}`);
            if (selected.length > 0) {
                lines.push('주요 npm 스크립트:');
                lines.push(...selected.map(script => `- ${script}`));
            }
        }
        return lines.join('\n');
    }

    /**
     * 프로젝트 파일 인벤토리를 빌드합니다
     */
    public async buildProjectInventorySection(maxEntries: number = 400): Promise<string> {
        try {
            const projectRoot = this.projectRoot;
            if (!projectRoot) return '';
            const rootUri = vscode.Uri.file(projectRoot);
            const items: string[] = [];

            const rel = (p: string) => {
                const norm = p.replace(/\\/g, '/');
                const rootNorm = projectRoot.replace(/\\/g, '/');
                return norm.startsWith(rootNorm) ? norm.substring(rootNorm.length + (rootNorm.endsWith('/') ? 0 : 1)) : norm;
            };

            // 제외할 디렉토리 목록
            const excludeDirs = new Set([
                'node_modules', '.git', 'dist', 'out', 'target', 'build', '.gradle', 'gradle',
                '__pycache__', 'venv', '.venv', 'vendor', 'bin', 'obj', 'packages', '.nuget',
                'pkg', 'coverage', '.next', '.nuxt', '.output', '.cache', '.turbo',
                '.idea', '.vscode', '.vs', '.sass-cache', '.parcel-cache', '.yarn',
                'bower_components', '.pnp', '.pnp.js', '.yarn-integrity'
            ]);

            const walk = async (dir: vscode.Uri, depth: number) => {
                if (items.length >= maxEntries) return;
                let entries: [string, vscode.FileType][] = [];
                try {
                    entries = await vscode.workspace.fs.readDirectory(dir);
                } catch { return; }
                for (const [name, type] of entries) {
                    if (items.length >= maxEntries) break;

                    // 제외할 디렉토리 스킵
                    if (type === vscode.FileType.Directory && excludeDirs.has(name)) {
                        continue;
                    }

                    const child = vscode.Uri.joinPath(dir, name);
                    if (type === vscode.FileType.Directory) {
                        items.push(`[D] ${rel(child.fsPath)}`);
                        if (depth < 6) {
                            await walk(child, depth + 1);
                        }
                    } else if (type === vscode.FileType.File) {
                        items.push(`[F] ${rel(child.fsPath)}`);
                    }
                }
            };

            await walk(rootUri, 0);
            if (items.length === 0) return '';
            const header = `\n--- 프로젝트 파일 인벤토리 (최대 ${maxEntries}개, 최신 루트 스냅샷) ---\n`;
            return header + items.join('\n');
        } catch {
            return '';
        }
    }
}

