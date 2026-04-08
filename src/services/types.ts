export enum AiModelType {
    OLLAMA = 'ollama',
    ADMIN = 'admin'
}

export enum PromptType {
    CODE_GENERATION = 'code_generation',
    GENERAL_ASK = 'general_ask',
    PLAN = 'plan',
    AGENT = 'agent'
}

/** LLM 메시지 파트 (텍스트 또는 인라인 데이터) — 레거시, 점진적으로 ConversationMessage로 전환 */
export interface Part {
    text?: string;
    inlineData?: {
        mimeType: string;
        data: string;
    };
}

/** 도구 호출 정보 (assistant 응답에 포함) */
export interface ToolCallInfo {
    id: string;
    name: string;
    input: Record<string, any>;
}

/**
 * Role 기반 대화 메시지 (LLM API 공통 구조)
 *
 * 모든 LLM API가 role 기반 메시지를 지원하며,
 * API별 차이는 전송 시 변환 레이어에서 처리:
 * - OpenAI/Gemini: tool_result → { role: 'tool', tool_call_id }
 * - Anthropic: tool_result → user message 안 tool_result content block
 * - Ollama (native): OpenAI 호환
 * - Ollama (비지원): 전체 텍스트 폴백
 */
export interface ConversationMessage {
    role: 'user' | 'assistant' | 'system' | 'tool_result';
    content: string;
    /** assistant가 호출한 도구 목록 (role=assistant일 때) */
    toolCalls?: ToolCallInfo[];
    /** tool_result와 매칭되는 tool_call ID (role=tool_result일 때) */
    toolCallId?: string;
    /** 도구 이름 (role=tool_result일 때) */
    toolName?: string;
    /** tool_result 실패 여부 */
    isError?: boolean;
    /** 이미지 데이터 (role=user일 때) */
    inlineData?: { mimeType: string; data: string };
    /** 메시지 생성 시각 */
    timestamp?: number;
}

/**
 * ConversationMessage[] ↔ Part[] 변환 유틸리티
 */
export function conversationMessagesToParts(messages: ConversationMessage[]): Part[] {
    return messages.map(msg => {
        if (msg.inlineData) {
            return { inlineData: msg.inlineData };
        }
        let text = '';
        if (msg.role === 'user') {
            text = msg.content;
        } else if (msg.role === 'assistant') {
            text = `[Assistant]: ${msg.content}`;
            if (msg.toolCalls?.length) {
                text += '\n' + msg.toolCalls.map(tc => `[Tool Call: ${tc.name}(${JSON.stringify(tc.input)})]`).join('\n');
            }
        } else if (msg.role === 'tool_result') {
            const status = msg.isError ? 'Failed' : 'Success';
            text = `[Tool Result: ${msg.toolName || 'unknown'}] Status: ${status}\n${msg.content}`;
        } else if (msg.role === 'system') {
            text = `[System]: ${msg.content}`;
        }
        return { text };
    });
}

export function partsToConversationMessages(parts: Part[]): ConversationMessage[] {
    return parts.map(part => ({
        role: 'user' as const,
        content: part.text || '',
        ...(part.inlineData && { inlineData: part.inlineData }),
        timestamp: Date.now(),
    }));
}

