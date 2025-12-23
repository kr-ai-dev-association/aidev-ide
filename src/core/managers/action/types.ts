/**
 * Action Manager 타입 정의
 * LLM 요청을 실행 가능한 액션으로 변환하는 매니저의 타입들
 */

/**
 * 액션 타입
 */
export enum ActionType {
    CODE_GENERATION = 'code_generation',
    FILE_OPERATION = 'file_operation',
    TERMINAL_COMMAND = 'terminal_command',
    ANALYSIS = 'analysis',
    VERIFICATION = 'verification',
    SEARCH = 'search',           // 일반 검색/코드 검색
    FILE_READ = 'file_read',     // 단일/복수 파일 읽기
    FILE_LIST = 'file_list',     // 디렉터리/글롭 기반 파일 목록 조회
    FILE_SEARCH = 'file_search', // 파일 내용 검색 (정규식/키워드)
    REFACTOR = 'refactor'
}

/**
 * 파일 작업 종류
 */
export enum FileOperationType {
    CREATE = 'create',
    UPDATE = 'update',
    DELETE = 'delete',
    RENAME = 'rename',
    MOVE = 'move'
}

/**
 * 권한 타입
 */
export enum Permission {
    READ_FILE = 'read_file',
    WRITE_FILE = 'write_file',
    DELETE_FILE = 'delete_file',
    EXECUTE_COMMAND = 'execute_command',
    NETWORK_ACCESS = 'network_access',
    MODIFY_SETTINGS = 'modify_settings'
}

/**
 * 액션 파라미터 (액션 타입별 파라미터)
 */
export interface ActionParams {
    // 공통 파라미터
    description?: string;
    priority?: number;

    // CODE_GENERATION 파라미터
    filePath?: string;
    code?: string;
    language?: string;

    // FILE_OPERATION 파라미터
    operation?: FileOperationType;
    sourcePath?: string;
    targetPath?: string;
    content?: string;

    // TERMINAL_COMMAND 파라미터
    command?: string;
    cwd?: string;
    shell?: string;
    timeout?: number;

    // ANALYSIS 파라미터
    analysisType?: 'code' | 'error' | 'performance' | 'security';
    targetFiles?: string[];

    // VERIFICATION 파라미터
    expectedOutput?: string;
    errorPatterns?: string[];

    // SEARCH 파라미터
    query?: string;
    scope?: 'file' | 'project' | 'workspace';
    // FILE_READ / FILE_LIST / FILE_SEARCH 파라미터
    paths?: string[];                // 읽거나 나열할 파일/디렉터리 경로 목록
    path?: string;                   // 단일 경로 (파일 또는 디렉터리)
    includeGlobs?: string[];         // 포함할 글롭 패턴
    excludeGlobs?: string[];         // 제외할 글롭 패턴
    pattern?: string;                // 내용 검색용 정규식/키워드
    maxResults?: number;             // 검색/목록 결과 최대 개수

    // REFACTOR 파라미터
    refactorType?: 'rename' | 'extract' | 'inline' | 'move';
    oldName?: string;
    newName?: string;
}

/**
 * 검증 규칙
 */
export interface ValidationRule {
    field: string;
    type: 'required' | 'pattern' | 'custom';
    value?: any;
    message: string;
}

/**
 * 액션 정의
 */
export interface Action {
    id: string;
    type: ActionType;
    params: ActionParams;
    permissions: Permission[];
    validation: ValidationRule[];
    dependencies?: string[];  // 의존하는 다른 액션 ID들
    metadata?: {
        source: 'llm' | 'user' | 'system';
        timestamp: number;
        confidence?: number;
        /**
         * (optional) 이 액션이 속한 TaskManager의 taskId
         * - 일부 파일 변경 추적(FileChangeTracker) 메타데이터에 전달됨
         */
        taskId?: string;
    };
}

/**
 * 검증 결과
 */
export interface ValidationResult {
    valid: boolean;
    errors: ValidationError[];
    warnings?: string[];
}

/**
 * 검증 에러
 */
export interface ValidationError {
    field: string;
    message: string;
    code: string;
}

/**
 * 액션 실행 결과
 */
export interface ActionResult {
    success: boolean;
    actionId: string;
    message: string;
    data?: any;
    error?: ActionError;
    duration?: number;
}

/**
 * 액션 에러
 */
export interface ActionError {
    code: string;
    message: string;
    stack?: string;
    details?: any;
}

/**
 * LLM 요청
 */
export interface LLMRequest {
    query: string;
    context: {
        files: Array<{ name: string; path: string; content?: string }>;
        cursorPosition?: { line: number; column: number };
        selectedText?: string;
        recentErrors?: string[];
        projectType?: string;
    };
    options?: {
        model?: string;
        temperature?: number;
        maxTokens?: number;
    };
}

/**
 * LLM 응답
 */
export interface LLMResponse {
    content: string;
    actions?: Action[];
    explanation?: string;
    metadata?: {
        model: string;
        tokensUsed: number;
        duration: number;
    };
}

/**
 * 액션 정의 (등록용)
 */
export interface ActionDefinition {
    type: ActionType;
    name: string;
    description: string;
    permissions: Permission[];
    validation: ValidationRule[];
    handler: ActionHandler;
}

/**
 * 액션 핸들러
 */
export type ActionHandler = (action: Action) => Promise<ActionResult>;

/**
 * 액션 매핑 결과
 */
export interface ActionMappingResult {
    actions: Action[];
    explanation?: string;
    confidence: number;
}

/**
 * 액션 컨텍스트 (실행 시 주입되는 컨텍스트)
 */
export interface ActionContext {
    projectRoot: string;
    workspaceRoot: string;
    currentFile?: string;
    selectedText?: string;
    cursorPosition?: { line: number; column: number };
    recentErrors?: string[];
    environmentVariables?: Record<string, string>;
}

