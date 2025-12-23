/**
 * Project Manager 타입 정의
 * 프로젝트 구조 및 메타데이터를 관리하는 매니저의 타입들
 */

/**
 * 프로젝트 프로필 (ProjectProfileService 호환)
 */
export interface ProjectProfile {
    language: string;
    frameworks: FrameworkMatch[];
    packageManager?: 'npm' | 'yarn' | 'pnpm' | 'bun';
    entryPoints: string[];
    scripts: Record<string, string>;
    lastScannedAt: number;
}

/**
 * 프레임워크 매칭 정보
 */
export interface FrameworkMatch {
    framework: string;
    confidence: number;
    evidence: string[];
}

/**
 * 프로젝트 타입
 */
export enum ProjectType {
    TYPESCRIPT = 'typescript',
    JAVASCRIPT = 'javascript',
    REACT = 'react',
    REACT_NATIVE = 'react-native',
    VUE = 'vue',
    ANGULAR = 'angular',
    NODE = 'node',
    SPRING_BOOT = 'spring-boot',
    JAVA = 'java',
    PYTHON = 'python',
    DJANGO = 'django',
    FLASK = 'flask',
    FASTAPI = 'fastapi',
    GO = 'go',
    RUST = 'rust',
    FLUTTER = 'flutter',
    UNKNOWN = 'unknown'
}

/**
 * 빌드 도구
 */
export enum BuildTool {
    NPM = 'npm',
    YARN = 'yarn',
    PNPM = 'pnpm',
    BUN = 'bun',
    MAVEN = 'maven',
    GRADLE = 'gradle',
    CARGO = 'cargo',
    GO_MOD = 'go-mod',
    PIP = 'pip',
    POETRY = 'poetry',
    PUB = 'pub',
    UNKNOWN = 'unknown'
}

/**
 * 프로젝트 정보
 */
export interface ProjectInfo {
    type: ProjectType;
    name: string;
    version?: string;
    root: string;
    buildTool: BuildTool;
    framework?: string;
    language: string;
    configFiles: ConfigFile[];
    buildCommands: BuildCommands;
    dependencies?: Dependency[];
    metadata?: ProjectMetadata;
}

/**
 * 설정 파일
 */
export interface ConfigFile {
    name: string;
    path: string;
    type: 'package' | 'build' | 'config' | 'env';
    parsed: any;
}

/**
 * 빌드 명령어
 */
export interface BuildCommands {
    install?: string;
    build?: string;
    dev?: string;
    test?: string;
    lint?: string;
    start?: string;
    clean?: string;
}

/**
 * 의존성
 */
export interface Dependency {
    name: string;
    version: string;
    type: 'runtime' | 'dev' | 'peer' | 'optional';
}

/**
 * 프로젝트 메타데이터
 */
export interface ProjectMetadata {
    description?: string;
    author?: string;
    license?: string;
    repository?: string;
    homepage?: string;
    keywords?: string[];
}

/**
 * 파일 트리 노드
 */
export interface FileTreeNode {
    name: string;
    path: string;
    type: 'file' | 'directory';
    size?: number;
    extension?: string;
    children?: FileTreeNode[];
    metadata?: FileMetadata;
}

/**
 * 파일 메타데이터
 */
export interface FileMetadata {
    language?: string;
    framework?: string;
    exported?: string[];
    imported?: string[];
    definitions?: string[];
}

/**
 * 파일 인덱스
 */
export interface FileIndex {
    files: Map<string, IndexedFile>;
    lastIndexedAt: number;
    totalFiles: number;
}

/**
 * 인덱싱된 파일
 */
export interface IndexedFile {
    path: string;
    language: string;
    size: number;
    modifiedAt: number;
    checksum: string;
    definitions: Definition[];
    imports: Import[];
    exports: Export[];
}

/**
 * 정의 (클래스, 함수, 변수 등)
 */
export interface Definition {
    name: string;
    type: 'class' | 'function' | 'variable' | 'interface' | 'type' | 'enum' | 'constant';
    line: number;
    column: number;
    signature?: string;
}

/**
 * Import 문
 */
export interface Import {
    source: string;
    imported: string[];
    line: number;
}

/**
 * Export 문
 */
export interface Export {
    name: string;
    type: 'default' | 'named';
    line: number;
}

/**
 * 프로젝트 통계
 */
export interface ProjectStats {
    totalFiles: number;
    totalLines: number;
    filesByLanguage: Record<string, number>;
    largestFiles: Array<{ path: string; size: number }>;
}

