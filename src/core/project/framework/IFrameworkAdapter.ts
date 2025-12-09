/**
 * 기술 스택별 추상화 인터페이스
 * 프로젝트의 언어, 프레임워크, 빌드 시스템에 따라
 * AI가 생성/실행해야 할 작업을 정의
 */

export interface IFrameworkAdapter {
    /**
     * 기술 스택 식별자
     */
    readonly frameworkId: string;

    /**
     * 기술 스택 이름
     */
    readonly frameworkName: string;

    /**
     * 언어
     */
    readonly language: string;

    /**
     * 프레임워크 (선택적)
     */
    readonly framework?: string;

    // ==================== 프로젝트 구조 ====================

    /**
     * 필수 설정 파일 목록
     */
    getRequiredConfigFiles(): string[];

    /**
     * 소스 코드 디렉토리
     */
    getSourceDirectories(): string[];

    /**
     * 테스트 디렉토리
     */
    getTestDirectories(): string[];

    /**
     * 빌드 출력 디렉토리
     */
    getBuildOutputDirectories(): string[];

    /**
     * 제외할 디렉토리 (node_modules, target 등)
     */
    getExcludedDirectories(): string[];

    // ==================== 의존성 관리 ====================

    /**
     * 의존성 설치 명령어
     */
    getInstallCommand(): string;

    /**
     * 의존성 파일 경로 (package.json, pom.xml 등)
     */
    getDependencyFile(): string;

    /**
     * 의존성 추가 명령어
     */
    getAddDependencyCommand(packageName: string, isDev?: boolean): string;

    /**
     * 의존성 제거 명령어
     */
    getRemoveDependencyCommand(packageName: string): string;

    // ==================== 빌드 & 실행 ====================

    /**
     * 빌드 명령어
     */
    getBuildCommand(): string;

    /**
     * 개발 서버 실행 명령어
     */
    getDevCommand(): string;

    /**
     * 프로덕션 실행 명령어
     */
    getStartCommand(): string;

    /**
     * 테스트 실행 명령어
     */
    getTestCommand(): string;

    /**
     * 린트 명령어
     */
    getLintCommand(): string | null;

    /**
     * 포맷 명령어
     */
    getFormatCommand(): string | null;

    // ==================== 코드 생성 ====================

    /**
     * 새 파일 생성 시 템플릿
     */
    getFileTemplate(fileType: string, fileName: string): string;

    /**
     * 컴포넌트/클래스 생성 템플릿
     */
    getComponentTemplate(componentName: string, options?: ComponentOptions): string;

    /**
     * 설정 파일 생성 템플릿
     */
    getConfigFileTemplate(configType: string): string;

    /**
     * import/require 문 생성
     */
    getImportStatement(moduleName: string, items?: string[]): string;

    // ==================== 에러 처리 ====================

    /**
     * 기술 스택 특화 에러 패턴
     */
    getErrorPatterns(): ErrorPattern[];

    /**
     * 에러 자동 수정 제안
     */
    suggestErrorFix(error: FrameworkError): ErrorFixSuggestion | null;

    // ==================== 프로젝트 타입 감지 ====================

    /**
     * 프로젝트 메타데이터 추출
     */
    extractProjectMetadata(projectPath: string): Promise<ProjectMetadata>;
}

/**
 * 컴포넌트 생성 옵션
 */
export interface ComponentOptions {
    withTest?: boolean;
    withStyles?: boolean;
    exportDefault?: boolean;
    [key: string]: any;
}

/**
 * 에러 패턴
 */
export interface ErrorPattern {
    pattern: RegExp;
    errorType: string;
    description: string;
    commonCauses: string[];
}

/**
 * 기술 스택 에러
 */
export interface FrameworkError {
    message: string;
    type: string;
    stackTrace?: string;
    context?: string;
}

/**
 * 에러 수정 제안
 */
export interface ErrorFixSuggestion {
    diagnosis: string;
    suggestedFix: string;
    commands?: string[];
    filestoModify?: Array<{ path: string; changes: string }>;
}

/**
 * 프로젝트 메타데이터
 */
export interface ProjectMetadata {
    name: string;
    version: string;
    description?: string;
    dependencies: Record<string, string>;
    devDependencies?: Record<string, string>;
    scripts?: Record<string, string>;
    mainEntryPoint?: string;
    [key: string]: any;
}

/**
 * 기술 스택 카테고리
 */
export enum FrameworkCategory {
    FRONTEND = 'frontend',
    BACKEND = 'backend',
    MOBILE = 'mobile',
    DESKTOP = 'desktop',
    FULL_STACK = 'full_stack',
}

/**
 * 기본 파일 타입
 */
export enum FileType {
    COMPONENT = 'component',
    SERVICE = 'service',
    CONTROLLER = 'controller',
    MODEL = 'model',
    REPOSITORY = 'repository',
    UTIL = 'util',
    CONFIG = 'config',
    TEST = 'test',
}

