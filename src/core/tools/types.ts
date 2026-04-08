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
 * - RUN_COMMAND → TERMINAL_COMMAND (명령어 실행)
 */
export enum Tool {
    CREATE_FILE = 'create_file',
    UPDATE_FILE = 'update_file',
    REMOVE_FILE = 'remove_file',
    READ_FILE = 'read_file',
    LIST_FILES = 'list_files',
    RUN_COMMAND = 'run_command',
    RIPGREP_SEARCH = 'ripgrep_search',
    // 새로운 파일 읽기 도구들
    LIST_IMPORTS = 'list_imports',
    STAT_FILE = 'stat_file',
    // IDE 연동 도구들
    READ_ACTIVE_FILE = 'read_active_file',
    FETCH_URL = 'fetch_url',
    // 코드 인텔리전스 도구들
    LSP = 'lsp',
    LIST_CODE_DEFINITIONS = 'list_code_definitions',
    // 파일 경로 패턴 검색
    GLOB_SEARCH = 'glob_search',
    // 영속적 메모리 관리
    MEMORY_SAVE = 'memory_save',
    MEMORY_DELETE = 'memory_delete',
    // 스킬 로더 (서브에이전트용)
    LOAD_SKILL = 'load_skill',
    // 사용자에게 선택지 질문
    ASK_QUESTION = 'ask_question',
    // AGENT 모드: 작업 계획
    WORK_PLAN = 'work_plan',
    // AGENT 모드: worker 에이전트 스폰
    SPAWN_AGENT = 'spawn_agent',
    // AGENT 모드: worker 에이전트 중단
    STOP_AGENT = 'stop_agent',
}

/**
 * 읽기 전용 도구 집합 (병렬 실행 안전)
 * 파일 시스템이나 프로젝트 상태를 변경하지 않는 도구들
 */
export const READ_ONLY_TOOLS: ReadonlySet<string> = new Set([
    Tool.READ_FILE,
    Tool.LIST_FILES,
    Tool.RIPGREP_SEARCH,
    Tool.STAT_FILE,
    Tool.LIST_IMPORTS,
    Tool.READ_ACTIVE_FILE,
    Tool.FETCH_URL,
    Tool.LSP,
    Tool.LIST_CODE_DEFINITIONS,
    Tool.GLOB_SEARCH,
    // 메모리 도구는 프로젝트 파일을 수정하지 않으므로 read-only로 취급 (investigation→execution 전환 방지)
    Tool.MEMORY_SAVE,
    Tool.MEMORY_DELETE,
    Tool.ASK_QUESTION,
    Tool.WORK_PLAN,
]);

/**
 * AGENT 모드 전용 도구 — CODE 모드에서는 제외해야 함
 */
export const AGENT_ONLY_TOOLS: ReadonlySet<string> = new Set([
    Tool.WORK_PLAN,
    Tool.SPAWN_AGENT,
    Tool.STOP_AGENT,
]);

/**
 * MCP 도구를 포함하는 도구 이름 타입
 * 내장 도구(Tool enum)와 MCP 동적 도구를 모두 지원
 * MCP 도구는 원래 이름 그대로 등록됨 (프리픽스 없음, 충돌 시에만 서버명 접두사)
 */
export type ToolName = Tool | string;

/**
 * 툴 사용 (LLM이 생성하는 툴 콜)
 */
export interface ToolUse {
    name: ToolName;
    params: Record<string, string>;
    partial?: boolean;  // 스트리밍 중 부분 블록
    isNativeToolCall?: boolean;  // 네이티브 툴 콜 여부
    toolCallId?: string;
}

/**
 * 툴 파싱 결과 (구조화된 실패 정보 포함)
 */
export interface ToolParseResult {
    tools: ToolUse[];
    warnings: string[];
    hasErrors: boolean;
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

