/**
 * Admin Model API Client
 * 관리자가 설정한 AI 모델과 통신하는 얇은 디스패처
 * 실제 전송 로직은 src/services/llm/providers/ 의 각 Provider에서 담당
 */

export { AdminModelMessagePart, AdminModelConfig, SendOptions } from './AdminModelTypes';
import { AdminModelMessagePart, AdminModelConfig, SendOptions, ChunkCallback } from './AdminModelTypes';
import { ILLMProvider } from './providers/ILLMProvider';
import { OpenAICompatProvider } from './providers/OpenAICompatProvider';
import { AnthropicProvider } from './providers/AnthropicProvider';
import { GeminiProvider } from './providers/GeminiProvider';

export class AdminModelApi {
    private config: AdminModelConfig | null = null;
    private provider: ILLMProvider | null = null;

    constructor() {}

    /**
     * 관리자 모델 설정 적용
     */
    public setConfig(config: AdminModelConfig): void {
        this.config = config;
        this.provider = AdminModelApi.createProvider(config);
        console.log('[AdminModelApi] Config set:', {
            key: config.key,
            provider: config.provider,
            model: config.model,
            endpoint: config.endpoint,
            maxOutputTokens: config.maxOutputTokens,
            contextWindow: config.contextWindow,
        });
    }

    public getConfig(): AdminModelConfig | null {
        return this.config;
    }

    public getModel(): string {
        return this.config?.model || 'unknown';
    }

    public getModelName(): string {
        return this.config?.model || 'unknown';
    }

    public isConfigured(): boolean {
        return !!(this.config?.endpoint && this.config?.model);
    }

    /**
     * 단순 메시지 전송
     */
    public async sendMessage(message: string, options?: SendOptions): Promise<string> {
        return this.sendMessageInternal(message, undefined, options);
    }

    /**
     * 시스템 프롬프트와 함께 메시지 전송
     */
    public async sendMessageWithSystemPrompt(
        systemPrompt: string,
        userParts: AdminModelMessagePart[],
        options?: SendOptions
    ): Promise<string> {
        return this.sendMessageInternal(userParts, systemPrompt, options);
    }

    /**
     * 스트리밍 응답
     */
    public async sendMessageWithSystemPromptStreaming(
        systemPrompt: string,
        userParts: AdminModelMessagePart[],
        onChunk: ChunkCallback,
        options?: SendOptions
    ): Promise<string> {
        if (!this.config || !this.provider) {
            throw new Error('Admin model is not configured.');
        }
        return this.provider.stream(systemPrompt, userParts, onChunk, options);
    }

    /**
     * 내부 전송 (provider 선택 후 send 호출)
     */
    private async sendMessageInternal(
        messageOrParts: string | AdminModelMessagePart[],
        systemPrompt?: string,
        options?: SendOptions
    ): Promise<string> {
        if (!this.config || !this.provider) {
            throw new Error('Admin model is not configured.');
        }
        const providerType = AdminModelApi.detectProvider(this.config);
        console.log(`[AdminModelApi] detectProvider=${providerType} endpoint=${this.config.endpoint}`);
        return this.provider.send(messageOrParts, systemPrompt, options);
    }

    /**
     * URL + provider 필드 기반 provider 자동 감지
     */
    private static detectProvider(config: AdminModelConfig): 'gemini_native' | 'anthropic_native' | 'openai_compat' {
        const endpoint = (config.endpoint || '').toLowerCase();
        const explicit = (config.provider || '').toLowerCase();

        if (explicit === 'gemini') return 'gemini_native';
        if (explicit === 'vertex' || explicit === 'vertex_ai') return 'gemini_native';
        if (explicit === 'anthropic' || explicit === 'claude') return 'anthropic_native';
        if (explicit && explicit !== '') return 'openai_compat';

        if (endpoint.includes('generativelanguage.googleapis.com') && endpoint.includes('/openai/')) {
            return 'openai_compat';
        }
        if (endpoint.includes('generativelanguage.googleapis.com')) return 'gemini_native';
        if (endpoint.includes('aiplatform.googleapis.com') && !endpoint.includes('openapi')) return 'gemini_native';
        if (endpoint.includes('anthropic.com')) return 'anthropic_native';
        return 'openai_compat';
    }

    /**
     * Provider 인스턴스 생성
     */
    private static createProvider(config: AdminModelConfig): ILLMProvider {
        const type = AdminModelApi.detectProvider(config);
        if (type === 'anthropic_native') return new AnthropicProvider(config);
        if (type === 'gemini_native') return new GeminiProvider(config);
        return new OpenAICompatProvider(config);
    }
}
