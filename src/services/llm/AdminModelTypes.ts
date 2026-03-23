/**
 * AdminModel 공유 타입 정의
 * 순환 import 방지를 위해 AdminModelApi.ts에서 분리
 */

export interface AdminModelMessagePart {
    text?: string;
}

export interface AdminModelConfig {
    key: string;
    provider: string;
    model: string;
    apiKey: string;
    endpoint: string;
    maxTokens?: number;
    maxOutputTokens?: number;
    contextWindow?: number;
    enabled?: boolean;
    authType?: 'bearer' | 'query_param' | 'custom_header' | 'none';
    authHeaderName?: string;
    defaultTemperature?: number;
    topP?: number;
    customHeaders?: Record<string, string>;
    streamingSupported?: boolean;
    nativeToolCallingSupported?: boolean;
}

export type SendOptions = { signal?: AbortSignal; disableThinking?: boolean; nativeTools?: any[]; onNativeToolComplete?: (toolName: string, args: Record<string, any>) => void };
export type ChunkCallback = (chunk: string, done: boolean) => void;
