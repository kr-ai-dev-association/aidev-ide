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

export interface ConversationMessage {
    role: 'user' | 'assistant' | 'system' | 'tool_result';
    content: string;
    toolCalls?: ToolCallInfo[];
    toolCallId?: string;
    toolName?: string;
    isError?: boolean;
    inlineData?: { mimeType: string; data: string };
    timestamp?: number;
}

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

