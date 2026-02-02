/**
 * Tool Manager 타입 정의
 * codepilot의 툴 콜링 시스템을 위한 타입들
 */

/**
 * 툴 이름 상수
 * 
 * codepilot의 기존 ActionType과 매핑:
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
    CREATE_FILE = 'create_file',
    UPDATE_FILE = 'update_file',
    REMOVE_FILE = 'remove_file',
    READ_FILE = 'read_file',
    LIST_FILES = 'list_files',
    SEARCH_FILES = 'search_files',
    RUN_COMMAND = 'run_command',
    ANALYZE_CODE = 'analyze_code',
    VERIFY_CODE = 'verify_code',
    REFACTOR_CODE = 'refactor_code',
    RIPGREP_SEARCH = 'ripgrep_search',
    // 새로운 파일 읽기 도구들
    EXPAND_AROUND_LINE = 'expand_around_line',
    LIST_IMPORTS = 'list_imports',
    STAT_FILE = 'stat_file',
    // Git 및 IDE 연동 도구들
    GIT_DIFF = 'git_diff',
    READ_ACTIVE_FILE = 'read_active_file',
    FETCH_URL = 'fetch_url'
}

/**
 * MCP 도구를 포함하는 도구 이름 타입
 * 내장 도구(Tool enum)와 MCP 동적 도구(mcp_ prefix)를 모두 지원
 */
export type ToolName = Tool | `mcp_${string}`;

/**
 * 툴 사용 (LLM이 생성하는 툴 콜)
 */
export interface ToolUse {
    name: ToolName;
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
    name: ToolName;
    description: string;
    parameters: ToolParameter[];
}

export interface ToolParameter {
    name: string;
    required: boolean;
    description: string;
    type?: 'string' | 'number' | 'boolean';
}

