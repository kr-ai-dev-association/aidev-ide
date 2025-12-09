/**
 * 코드 파서 추상화 인터페이스
 * Tree-sitter 기반 코드 분석 및 정의 추출
 */

/**
 * 정의 타입
 */
export enum DefinitionType {
    CLASS = 'class',
    FUNCTION = 'function',
    METHOD = 'method',
    INTERFACE = 'interface',
    TYPE = 'type',
    ENUM = 'enum',
    MODULE = 'module',
    VARIABLE = 'variable',
    CONSTANT = 'constant',
}

/**
 * 코드 정의
 */
export interface Definition {
    type: DefinitionType;
    name: string;
    startLine: number;
    endLine: number;
    content: string;
    filePath: string;
}

/**
 * 파일별 정의
 */
export interface FileDefinitions {
    filePath: string;
    relativePath: string;
    language: string;
    definitions: Definition[];
    formattedOutput: string;  // tree-sitter 형식의 출력 (|---- 포함)
}

/**
 * 프로젝트 전체 정의
 */
export interface CodeDefinitions {
    projectPath: string;
    files: FileDefinitions[];
    summary: {
        totalFiles: number;
        totalDefinitions: number;
        byType: Record<string, number>;
        byLanguage: Record<string, number>;
    };
}

/**
 * 파싱 옵션
 */
export interface ParseOptions {
    maxFiles?: number;          // 최대 파일 수 (기본: 50)
    includeTests?: boolean;     // 테스트 파일 포함 여부 (기본: false)
    excludePatterns?: string[]; // 제외할 패턴
    languages?: string[];       // 파싱할 언어 제한
    depth?: number;             // 디렉토리 탐색 깊이 (기본: 무제한)
}

/**
 * 메서드 정의
 */
export interface MethodDefinition extends Definition {
    className: string;
    isStatic?: boolean;
    isAsync?: boolean;
    visibility?: 'public' | 'private' | 'protected';
}

/**
 * 클래스 정의
 */
export interface ClassDefinition extends Definition {
    methods: MethodDefinition[];
    properties: Definition[];
    extends?: string;
    implements?: string[];
}

/**
 * 코드 파서 어댑터 인터페이스
 */
export interface ICodeParserAdapter {
    /**
     * 어댑터 식별자
     */
    readonly parserId: string;

    /**
     * 어댑터 이름
     */
    readonly parserName: string;

    /**
     * 지원하는 언어 목록
     */
    getSupportedLanguages(): string[];

    /**
     * 디렉토리 내 모든 파일의 정의 추출
     */
    parseDirectory(dirPath: string, options?: ParseOptions): Promise<CodeDefinitions>;

    /**
     * 특정 파일의 정의 추출
     */
    parseFile(filePath: string): Promise<FileDefinitions | null>;

    /**
     * 특정 정의 찾기
     */
    findDefinition(
        name: string,
        type: DefinitionType,
        searchPath: string
    ): Promise<Definition | null>;

    /**
     * 클래스의 모든 메서드 가져오기
     */
    getClassMethods(className: string, searchPath: string): Promise<MethodDefinition[]>;

    /**
     * 클래스 정의 전체 가져오기
     */
    getClassDefinition(className: string, searchPath: string): Promise<ClassDefinition | null>;

    /**
     * 파일의 주요 정의만 간단히 가져오기 (LLM 컨텍스트용)
     */
    getFileSummary(filePath: string): Promise<string>;

    /**
     * 프로젝트 전체 구조 요약 (LLM 컨텍스트용)
     */
    getProjectSummary(projectPath: string, options?: ParseOptions): Promise<string>;
}

/**
 * 지원 언어 확장자 매핑
 */
export const SUPPORTED_EXTENSIONS: Record<string, string[]> = {
    javascript: ['.js', '.jsx'],
    typescript: ['.ts', '.tsx'],
    python: ['.py'],
    rust: ['.rs'],
    go: ['.go'],
    c: ['.c', '.h'],
    cpp: ['.cpp', '.hpp', '.cc', '.hh'],
    csharp: ['.cs'],
    ruby: ['.rb'],
    java: ['.java'],
    php: ['.php'],
    swift: ['.swift'],
    kotlin: ['.kt', '.kts'],
};

/**
 * 언어별 확장자 가져오기
 */
export function getLanguageFromExtension(ext: string): string | null {
    for (const [language, extensions] of Object.entries(SUPPORTED_EXTENSIONS)) {
        if (extensions.includes(ext.toLowerCase())) {
            return language;
        }
    }
    return null;
}

/**
 * 파싱 가능한 파일인지 확인
 */
export function isParsableFile(filePath: string): boolean {
    const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase();
    return getLanguageFromExtension(ext) !== null;
}

