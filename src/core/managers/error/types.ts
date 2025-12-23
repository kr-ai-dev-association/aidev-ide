/**
 * Error Manager 타입 정의
 * 에러 감지, 파싱, 분석을 담당하는 매니저의 타입들
 */

/**
 * 에러 소스
 */
export enum ErrorSource {
    TERMINAL = 'terminal',
    DIAGNOSTIC = 'diagnostic',
    RUNTIME = 'runtime',
    COMPILE = 'compile',
    LINT = 'lint',
    SYSTEM = 'system'
}

/**
 * 에러 심각도
 */
export enum ErrorSeverity {
    LOW = 'low',
    MEDIUM = 'medium',
    HIGH = 'high',
    CRITICAL = 'critical'
}

/**
 * 에러 카테고리
 */
export enum ErrorCategory {
    SYNTAX = 'syntax',
    TYPE = 'type',
    RUNTIME = 'runtime',
    NETWORK = 'network',
    FILE_SYSTEM = 'file_system',
    PERMISSION = 'permission',
    DEPENDENCY = 'dependency',
    CONFIGURATION = 'configuration',
    UNKNOWN = 'unknown'
}

/**
 * 파싱된 에러
 */
export interface ParsedError {
    id: string;
    source: ErrorSource;
    category: ErrorCategory;
    severity: ErrorSeverity;
    message: string;
    rawOutput: string;
    timestamp: number;
    location?: ErrorLocation;
    stackTrace?: StackTrace;
    metadata?: ErrorMetadata;
    suggestions?: FixSuggestion[];
}

/**
 * 에러 위치
 */
export interface ErrorLocation {
    file?: string;
    line?: number;
    column?: number;
    function?: string;
    class?: string;
}

/**
 * 스택 트레이스
 */
export interface StackTrace {
    frames: StackFrame[];
    raw: string;
}

/**
 * 스택 프레임
 */
export interface StackFrame {
    file: string;
    line: number;
    column?: number;
    function?: string;
    code?: string;
}

/**
 * 에러 메타데이터
 */
export interface ErrorMetadata {
    command?: string;
    cwd?: string;
    exitCode?: number;
    signal?: string;
    port?: number;
    url?: string;
    package?: string;
    version?: string;
}

/**
 * 수정 제안
 */
export interface FixSuggestion {
    id: string;
    type: 'command' | 'code' | 'config' | 'install';
    title: string;
    description: string;
    confidence: number;
    fix?: Fix;
    automated: boolean;
}

/**
 * 수정
 */
export interface Fix {
    // 명령어 수정
    command?: string;
    cwd?: string;

    // 코드 수정
    file?: string;
    line?: number;
    oldCode?: string;
    newCode?: string;

    // 설정 수정
    configFile?: string;
    configChanges?: Record<string, any>;

    // 패키지 설치
    packages?: string[];
    packageManager?: 'npm' | 'yarn' | 'pnpm' | 'bun' | 'pip' | 'cargo';
}

/**
 * 에러 패턴
 */
export interface ErrorPattern {
    id: string;
    name: string;
    category: ErrorCategory;
    severity: ErrorSeverity;
    pattern: RegExp;
    extract: ErrorExtractor;
    suggest?: ErrorSuggester;
}

/**
 * 에러 추출 함수
 */
export type ErrorExtractor = (match: RegExpMatchArray, raw: string) => Partial<ParsedError>;

/**
 * 에러 제안 함수
 */
export type ErrorSuggester = (error: ParsedError) => FixSuggestion[];

/**
 * 에러 히스토리 엔트리
 */
export interface ErrorHistoryEntry {
    error: ParsedError;
    resolved: boolean;
    resolvedAt?: number;
    resolution?: ErrorResolution;
}

/**
 * 에러 해결 방법
 */
export interface ErrorResolution {
    type: 'manual' | 'automated' | 'ignored';
    suggestionId?: string;
    appliedFix?: Fix;
    notes?: string;
}

/**
 * 에러 필터
 */
export interface ErrorFilter {
    source?: ErrorSource[];
    category?: ErrorCategory[];
    severity?: ErrorSeverity[];
    startTime?: number;
    endTime?: number;
    resolved?: boolean;
    file?: string;
}

/**
 * 에러 통계
 */
export interface ErrorStats {
    total: number;
    bySource: Record<ErrorSource, number>;
    byCategory: Record<ErrorCategory, number>;
    bySeverity: Record<ErrorSeverity, number>;
    resolved: number;
    unresolved: number;
    averageResolutionTime: number;
    mostCommonErrors: Array<{ message: string; count: number }>;
}

/**
 * 에러 그룹
 */
export interface ErrorGroup {
    id: string;
    pattern: string;
    errors: ParsedError[];
    count: number;
    firstOccurrence: number;
    lastOccurrence: number;
    resolved: boolean;
}

