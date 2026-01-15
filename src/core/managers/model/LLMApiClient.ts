/**
 * LLM API Client
 * LLM API 호출을 담당하는 클라이언트
 * GeminiApi, OllamaApi, BanyaApi를 래핑하여 통합 인터페이스 제공
 */

import { GeminiApi, OllamaApi, BanyaApi, AiModelType } from '../../../services';

export interface LLMMessagePart {
    text?: string;
    imageData?: string;
    imageMimeType?: string;
}

export interface LLMRequestOptions {
    signal?: AbortSignal;
    temperature?: number;
    maxTokens?: number;
}

export class LLMApiClient {
    private geminiApi: GeminiApi;
    private ollamaApi: OllamaApi;
    private banyaApi: BanyaApi;
    private currentModelType: AiModelType;
    private currentCallController: AbortController | null = null;

    constructor(
        geminiApi: GeminiApi,
        ollamaApi: OllamaApi,
        banyaApi: BanyaApi,
        initialModelType: AiModelType = AiModelType.OLLAMA
    ) {
        this.geminiApi = geminiApi;
        this.ollamaApi = ollamaApi;
        this.banyaApi = banyaApi;
        this.currentModelType = initialModelType;
    }

    /**
     * 현재 모델 타입을 설정합니다
     */
    public setCurrentModel(modelType: AiModelType): void {
        this.currentModelType = modelType;
    }

    /**
     * 현재 모델 타입을 가져옵니다
     */
    public getCurrentModel(): AiModelType {
        return this.currentModelType;
    }

    /**
     * 현재 호출을 취소합니다
     */
    public cancelCurrentCall(): void {
        if (this.currentCallController) {
            this.currentCallController.abort();
            this.currentCallController = null;
        }
    }

    /**
     * 단순 메시지를 전송합니다
     */
    public async sendMessage(
        message: string,
        options?: LLMRequestOptions
    ): Promise<string> {
        this.currentCallController = options?.signal ? null : new AbortController();
        const abortSignal = options?.signal || this.currentCallController?.signal;

        try {
            if (this.currentModelType === AiModelType.GEMINI) {
                return await this.geminiApi.sendMessage(message, undefined, { signal: abortSignal });
            } else if (this.currentModelType === AiModelType.BANYA) {
                // Banya API 호출
                await this.banyaApi.loadSettingsFromStorage();
                return await this.banyaApi.sendMessage(message, { signal: abortSignal });
            } else {
                // 모델 설정 동기화 및 로드 (Ollama)
                await this.ollamaApi.loadSettingsFromStorage();
                return await this.ollamaApi.sendMessage(message, { signal: abortSignal });
            }
        } catch (error) {
            console.error('[LLMApiClient] sendMessage failed:', error);
            throw error;
        }
    }

    /**
     * 시스템 프롬프트와 함께 메시지를 전송합니다
     */
    public async sendMessageWithSystemPrompt(
        systemPrompt: string,
        userParts: LLMMessagePart[],
        options?: LLMRequestOptions
    ): Promise<string> {
        this.currentCallController = options?.signal ? null : new AbortController();
        const abortSignal = options?.signal || this.currentCallController?.signal;

        try {
            if (this.currentModelType === AiModelType.GEMINI) {
                const response = await this.geminiApi.sendMessageWithSystemPrompt(
                    systemPrompt,
                    userParts as any,
                    { signal: abortSignal }
                );

                // Offline fallback trigger
                if (typeof response === 'string' && response.startsWith('OFFLINE:')) {
                    try {
                        await this.ollamaApi.loadSettingsFromStorage();
                    } catch { }
                    return await this.ollamaApi.sendMessageWithSystemPrompt(
                        systemPrompt,
                        userParts,
                        { signal: abortSignal }
                    );
                }

                return response;
            } else if (this.currentModelType === AiModelType.BANYA) {
                // Banya API 호출
                await this.banyaApi.loadSettingsFromStorage();
                return await this.banyaApi.sendMessageWithSystemPrompt(
                    systemPrompt,
                    userParts as any,
                    { signal: abortSignal }
                );
            } else if (this.currentModelType === AiModelType.OLLAMA) {
                // 모델 설정 로드 (Ollama)
                await this.ollamaApi.loadSettingsFromStorage();
                return await this.ollamaApi.sendMessageWithSystemPrompt(
                    systemPrompt,
                    userParts,
                    { signal: abortSignal }
                );
            } else {
                throw new Error(`Unsupported model type: ${this.currentModelType}`);
            }
        } catch (error) {
            console.error('[LLMApiClient] sendMessageWithSystemPrompt failed:', error);
            throw error;
        }
    }

    /**
     * 현재 모델 이름을 가져옵니다
     */
    public async getCurrentModelName(): Promise<string> {
        if (this.currentModelType === AiModelType.GEMINI) {
            return this.geminiApi.getModelName();
        } else if (this.currentModelType === AiModelType.BANYA) {
            await this.banyaApi.loadSettingsFromStorage();
            return this.banyaApi.getModel() || 'unknown';
        } else {
            await this.ollamaApi.loadSettingsFromStorage();
            return this.ollamaApi.getModel() || 'unknown';
        }
    }
}

