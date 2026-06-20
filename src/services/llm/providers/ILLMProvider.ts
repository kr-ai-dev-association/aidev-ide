/**
 * LLM Provider 인터페이스
 * AdminModelApi가 지원하는 각 provider(OpenAI-compat, Anthropic, Gemini)의 공통 계약
 */

import { AdminModelMessagePart, SendOptions, ChunkCallback } from '../AdminModelTypes';

export interface ILLMProvider {
    /** 비스트리밍 메시지 전송 */
    send(
        messageOrParts: string | AdminModelMessagePart[],
        systemPrompt?: string,
        options?: SendOptions
    ): Promise<string>;

    /** 스트리밍 메시지 전송 */
    stream(
        systemPrompt: string,
        userParts: AdminModelMessagePart[],
        onChunk: ChunkCallback,
        options?: SendOptions
    ): Promise<string>;
}
