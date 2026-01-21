"use strict";
/**
 * LLM API Client
 * LLM API 호출을 담당하는 클라이언트
 * GeminiApi, OllamaApi를 래핑하여 통합 인터페이스 제공
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LLMApiClient = void 0;
const services_1 = require("../../../services");
class LLMApiClient {
    geminiApi;
    ollamaApi;
    currentModelType;
    currentCallController = null;
    constructor(geminiApi, ollamaApi, initialModelType = services_1.AiModelType.OLLAMA) {
        this.geminiApi = geminiApi;
        this.ollamaApi = ollamaApi;
        this.currentModelType = initialModelType;
    }
    /**
     * 현재 모델 타입을 설정합니다
     */
    setCurrentModel(modelType) {
        this.currentModelType = modelType;
    }
    /**
     * 현재 모델 타입을 가져옵니다
     */
    getCurrentModel() {
        return this.currentModelType;
    }
    /**
     * 현재 호출을 취소합니다
     */
    cancelCurrentCall() {
        if (this.currentCallController) {
            this.currentCallController.abort();
            this.currentCallController = null;
        }
    }
    /**
     * 단순 메시지를 전송합니다
     */
    async sendMessage(message, options) {
        this.currentCallController = options?.signal ? null : new AbortController();
        const abortSignal = options?.signal || this.currentCallController?.signal;
        try {
            if (this.currentModelType === services_1.AiModelType.GEMINI) {
                return await this.geminiApi.sendMessage(message, undefined, { signal: abortSignal });
            }
            else {
                // 모델 설정 동기화 및 로드 (Ollama)
                await this.ollamaApi.loadSettingsFromStorage();
                return await this.ollamaApi.sendMessage(message, { signal: abortSignal });
            }
        }
        catch (error) {
            console.error('[LLMApiClient] sendMessage failed:', error);
            throw error;
        }
    }
    /**
     * 시스템 프롬프트와 함께 메시지를 전송합니다
     */
    async sendMessageWithSystemPrompt(systemPrompt, userParts, options) {
        this.currentCallController = options?.signal ? null : new AbortController();
        const abortSignal = options?.signal || this.currentCallController?.signal;
        try {
            if (this.currentModelType === services_1.AiModelType.GEMINI) {
                const response = await this.geminiApi.sendMessageWithSystemPrompt(systemPrompt, userParts, { signal: abortSignal });
                // Offline fallback trigger
                if (typeof response === 'string' && response.startsWith('OFFLINE:')) {
                    try {
                        await this.ollamaApi.loadSettingsFromStorage();
                    }
                    catch { }
                    return await this.ollamaApi.sendMessageWithSystemPrompt(systemPrompt, userParts, { signal: abortSignal });
                }
                return response;
            }
            else if (this.currentModelType === services_1.AiModelType.OLLAMA) {
                // 모델 설정 로드 (Ollama)
                await this.ollamaApi.loadSettingsFromStorage();
                return await this.ollamaApi.sendMessageWithSystemPrompt(systemPrompt, userParts, { signal: abortSignal });
            }
            else {
                throw new Error(`Unsupported model type: ${this.currentModelType}`);
            }
        }
        catch (error) {
            console.error('[LLMApiClient] sendMessageWithSystemPrompt failed:', error);
            throw error;
        }
    }
    /**
     * 현재 모델 이름을 가져옵니다
     */
    async getCurrentModelName() {
        if (this.currentModelType === services_1.AiModelType.GEMINI) {
            return this.geminiApi.getModelName();
        }
        else {
            await this.ollamaApi.loadSettingsFromStorage();
            return this.ollamaApi.getModel() || 'unknown';
        }
    }
}
exports.LLMApiClient = LLMApiClient;
//# sourceMappingURL=LLMApiClient.js.map