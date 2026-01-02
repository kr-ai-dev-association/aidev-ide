/**
 * Tool Manager 타입 정의
 * aidev-ide의 툴 콜링 시스템을 위한 타입들
 */

/**
 * 툴 이름 상수
 * 
 * aidev-ide의 기존 ActionType과 매핑:
 * - CREATE_FILE → CODE_GENERATION (파일 생성)
 * - UPDATE_FILE → FILE_OPERATION UPDATE (파일 수정)
 * - REMOVE_FILE → FILE_OPERATION DELETE (파일 삭제)
 * - READ_FILE → FILE_READ (파일 읽기)
 * - LIST_FILES → FILE_LIST (파일 목록)
 * - SEARCH_FILES → FILE_SEARCH (파일 검색)
 * - RUN_COMMAND → TERMINAL_COMMAND (명령어 실행)
 * - ANALYZE_CODE → ANALYSIS (코드 분석)
 * - VERIFY_CODE → VERIFICATION (코드 검증)
 * - REFACTOR_CODE → REFACTOR (리팩토링)
 */
export enum Tool {
    CREATE_FILE = 'create_file',           // 기존 CODE_GENERATION과 매핑
    UPDATE_FILE = 'update_file',           // 기존 FILE_OPERATION UPDATE와 매핑
    REMOVE_FILE = 'remove_file',           // 기존 FILE_OPERATION DELETE와 매핑
    READ_FILE = 'read_file',               // 기존 FILE_READ와 매핑
    LIST_FILES = 'list_files',             // 기존 FILE_LIST와 매핑
    SEARCH_FILES = 'search_files',          // 기존 FILE_SEARCH와 매핑
    RUN_COMMAND = 'run_command',           // 기존 TERMINAL_COMMAND와 매핑
    ANALYZE_CODE = 'analyze_code',          // 기존 ANALYSIS와 매핑
    VERIFY_CODE = 'verify_code',            // 기존 VERIFICATION과 매핑
    REFACTOR_CODE = 'refactor_code',        // 기존 REFACTOR와 매핑
    RIPGREP_SEARCH = 'ripgrep_search'       // Ripgrep 기반 빠른 검색
}

/**
 * 툴 사용 (LLM이 생성하는 툴 콜)
 */
export interface ToolUse {
    name: Tool;
    params: Record<string, string>;
    partial?: boolean;  // 스트리밍 중 부분 블록
    isNativeToolCall?: boolean;  // 네이티브 툴 콜 여부
}

/**
 * 툴 응답
 */
export interface ToolResponse {
    success: boolean;
    message: string;
    data?: any;
    error?: {
        code: string;
        message: string;
    };
    // 파일 생성/수정 시 표시용
    filePath?: string;
    fileContent?: string;
}

/**
 * 툴 스펙 (프롬프트에 포함될 툴 정의)
 */
export interface ToolSpec {
    name: Tool;
    description: string;
    parameters: ToolParameter[];
}

export interface ToolParameter {
    name: string;
    required: boolean;
    description: string;
    type?: 'string' | 'number' | 'boolean';
}

