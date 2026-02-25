/**
 * MCP (Model Context Protocol) 관련 타입 정의
 */

/**
 * MCP 서버 연결 타입
 */
export type MCPTransportType = 'stdio' | 'http';

/**
 * MCP 서버 설정
 */
export interface MCPServerConfig {
    /** 고유 식별자 */
    id: string;
    /** 표시 이름 */
    name: string;
    /** 연결 타입 */
    type: MCPTransportType;
    /** stdio: 실행 명령어 (예: 'npx', 'node') */
    command?: string;
    /** stdio: 명령어 인자 (예: ['-y', '@anthropic/mcp-server-weather']) */
    args?: string[];
    /** http: 서버 URL */
    url?: string;
    /** 인증 키 (선택) */
    apiKey?: string;
    /** 활성화 상태 */
    enabled: boolean;
    /** 캐시된 도구 목록 */
    tools?: MCPToolInfo[];
    /** 마지막 연결 시간 */
    lastConnected?: number;
    /** 연결 상태 */
    status?: MCPServerStatus;
    /** 사용자 정의 프롬프트 (LLM에 전달되는 MCP 도구 사용 지침) */
    customPrompt?: string;
}

/**
 * MCP 서버 연결 상태
 */
export type MCPServerStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

/**
 * MCP 도구 정보
 */
export interface MCPToolInfo {
    /** 도구 이름 */
    name: string;
    /** 도구 설명 */
    description: string;
    /** 입력 스키마 (JSON Schema) */
    inputSchema: MCPToolInputSchema;
}

/**
 * MCP 도구 입력 스키마 (JSON Schema)
 */
export interface MCPToolInputSchema {
    type: 'object';
    properties?: Record<string, MCPToolProperty>;
    required?: string[];
}

/**
 * MCP 도구 속성
 */
export interface MCPToolProperty {
    type: string;
    description?: string;
    enum?: string[];
    default?: any;
}

/**
 * MCP 도구 호출 결과
 */
export interface MCPToolResult {
    /** 성공 여부 */
    success: boolean;
    /** 결과 내용 (텍스트 또는 JSON) */
    content: MCPToolContent[];
    /** 에러 메시지 */
    error?: string;
}

/**
 * MCP 도구 결과 내용
 */
export interface MCPToolContent {
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
}

/**
 * 승인된 MCP 도구 정보
 */
export interface ApprovedMCPTool {
    /** 서버 ID */
    serverId: string;
    /** 도구 이름 */
    toolName: string;
    /** 승인 시간 */
    approvedAt: number;
}

/**
 * MCP 설정 (StateManager에 저장)
 */
export interface MCPSettings {
    /** MCP 서버 목록 */
    servers: MCPServerConfig[];
    /** 승인된 도구 목록 */
    approvedTools: ApprovedMCPTool[];
    /** MCP 기능 활성화 여부 */
    enabled: boolean;
}

/**
 * MCP 연결 이벤트
 */
export interface MCPConnectionEvent {
    type: 'connected' | 'disconnected' | 'error' | 'tools_updated';
    serverId: string;
    serverName: string;
    tools?: MCPToolInfo[];
    error?: string;
}

/**
 * MCP 도구 호출 요청
 */
export interface MCPToolCallRequest {
    serverId: string;
    toolName: string;
    arguments: Record<string, any>;
}

/**
 * 관리자(서버)에서 푸시된 MCP 서버 설정
 */
export interface AdminMCPServer extends MCPServerConfig {
    /** 적용 방식: required=필수, recommended=권장 */
    enforcement: 'required' | 'recommended';
}

/**
 * MCP 기본 설정값
 */
export const DEFAULT_MCP_SETTINGS: MCPSettings = {
    servers: [],
    approvedTools: [],
    enabled: true
};
