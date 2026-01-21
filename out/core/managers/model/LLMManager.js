"use strict";
/**
 * LLM Manager
 * LLM 서버(로컬/원격)와 통신을 담당하는 매니저
 * 요청 보내기 / 응답 받기 / 응답 포맷팅
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LLMManager = void 0;
const services_1 = require("../../../services");
class LLMManager {
    static instance;
    geminiApi;
    ollamaApi;
    currentModelType;
    currentCallController = null;
    constructor(geminiApi, ollamaApi, initialModelType = services_1.AiModelType.GEMINI) {
        this.geminiApi = geminiApi;
        this.ollamaApi = ollamaApi;
        this.currentModelType = initialModelType;
        console.log('[LLMManager] Initialized');
    }
    static getInstance(geminiApi, ollamaApi, initialModelType) {
        if (!LLMManager.instance) {
            if (!geminiApi || !ollamaApi) {
                throw new Error('LLMManager requires GeminiApi and OllamaApi instances');
            }
            LLMManager.instance = new LLMManager(geminiApi, ollamaApi, initialModelType);
        }
        return LLMManager.instance;
    }
    /**
     * 현재 모델 타입을 설정합니다
     */
    setCurrentModel(modelType) {
        this.currentModelType = modelType;
        console.log(`[LLMManager] Model type set to: ${modelType}`);
    }
    /**
     * 현재 모델 타입을 가져옵니다
     */
    getCurrentModel() {
        return this.currentModelType;
    }
    /**
     * 현재 모델명을 가져옵니다
     */
    async getCurrentModelName() {
        try {
            if (this.currentModelType === services_1.AiModelType.GEMINI) {
                return this.geminiApi.getModelName();
            }
            else if (this.ollamaApi) {
                return this.ollamaApi.getModel?.() || this.ollamaApi.getCurrentModelName?.() || 'Ollama Model';
            }
        }
        catch { }
        return 'Unknown Model';
    }
    /**
     * 현재 호출을 취소합니다
     */
    cancelCurrentCall() {
        if (this.currentCallController) {
            this.currentCallController.abort();
            this.currentCallController = null;
            console.log('[LLMManager] Current call cancelled');
        }
    }
    /**
     * LLM에 메시지를 전송합니다 (시스템 프롬프트 없음)
     */
    async sendMessage(prompt, options) {
        this.currentCallController = new AbortController();
        const signal = options?.signal || this.currentCallController.signal;
        try {
            let response;
            if (this.currentModelType === services_1.AiModelType.GEMINI) {
                response = await this.geminiApi.sendMessage(prompt, undefined, { signal });
            }
            else {
                try {
                    await this.ollamaApi.loadSettingsFromStorage();
                }
                catch { }
                response = await this.ollamaApi.sendMessage(prompt, { signal });
            }
            return response;
        }
        catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                console.log('[LLMManager] Request cancelled');
                throw error;
            }
            console.error('[LLMManager] Failed to send message:', error);
            throw error;
        }
        finally {
            if (this.currentCallController && !options?.signal) {
                this.currentCallController = null;
            }
        }
    }
    /**
     * LLM에 메시지를 전송합니다 (시스템 프롬프트 포함)
     */
    async sendMessageWithSystemPrompt(systemPrompt, userParts, options) {
        this.currentCallController = new AbortController();
        const signal = options?.signal || this.currentCallController.signal;
        try {
            let response;
            if (this.currentModelType === services_1.AiModelType.GEMINI) {
                // Gemini API 형식으로 변환 (Part 타입)
                const parts = userParts.map(part => {
                    if (part.inlineData) {
                        return { inlineData: part.inlineData };
                    }
                    if (part.imageData && part.imageMimeType) {
                        return {
                            inlineData: {
                                data: part.imageData,
                                mimeType: part.imageMimeType
                            }
                        };
                    }
                    return { text: part.text || '' };
                });
                response = await this.geminiApi.sendMessageWithSystemPrompt(systemPrompt, parts, { signal });
                // Offline fallback trigger
                if (typeof response === 'string' && response.startsWith('OFFLINE:')) {
                    try {
                        await this.ollamaApi.loadSettingsFromStorage();
                    }
                    catch { }
                    // Ollama로 폴백
                    const ollamaParts = userParts.map(part => ({ text: part.text || '' }));
                    response = await this.ollamaApi.sendMessageWithSystemPrompt(systemPrompt, ollamaParts, { signal });
                }
            }
            else {
                try {
                    await this.ollamaApi.loadSettingsFromStorage();
                }
                catch { }
                // Ollama API 형식으로 변환
                const parts = userParts.map(part => ({ text: part.text || '' }));
                response = await this.ollamaApi.sendMessageWithSystemPrompt(systemPrompt, parts, { signal });
            }
            return response;
        }
        catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                console.log('[LLMManager] Request cancelled');
                throw error;
            }
            console.error('[LLMManager] Failed to send message with system prompt:', error);
            throw error;
        }
        finally {
            if (this.currentCallController && !options?.signal) {
                this.currentCallController = null;
            }
        }
    }
    /**
     * LLM 응답을 포맷팅합니다
     */
    formatResponse(response, options) {
        let formatted = response;
        // 코드 블록 제거
        if (options?.removeCodeBlocks !== false) {
            formatted = this.removeCodeBlocks(formatted);
        }
        // 파일 작업 지시어 제거
        if (options?.removeFileDirectives !== false) {
            formatted = this.removeFileDirectives(formatted);
        }
        // Bash 명령어 제거
        if (options?.removeBashCommands === true) {
            formatted = this.removeBashCommands(formatted);
        }
        // 요약
        if (options?.summarize === true) {
            formatted = this.summarizeResponse(formatted, options.maxLength || 200);
        }
        return formatted.trim();
    }
    /**
     * LLM 응답에서 순수 텍스트만 추출합니다
     */
    extractResponseText(llmResponse) {
        let text = llmResponse;
        // 파일 작업 지시어 제거
        text = text.replace(/(?:##\s*)?(새 파일|수정 파일|삭제 파일):\s*[^\r\n]+/g, '');
        // 코드 블록 제거
        text = text.replace(/```[\s\S]*?```/g, '');
        // 작업 요약/설명 섹션 제거
        text = text.replace(/---\s*작업 요약\s*---[\s\S]*?---\s*작업 수행 설명\s*---[\s\S]*/g, '');
        text = text.replace(/---\s*작업 요약\s*---[\s\S]*/g, '');
        text = text.replace(/---\s*작업 수행 설명\s*---[\s\S]*/g, '');
        // 연속된 빈 줄 정리
        text = text.replace(/\n{3,}/g, '\n\n');
        return text.trim();
    }
    /**
     * 코드 블록을 제거합니다
     */
    removeCodeBlocks(response) {
        return response.replace(/```[\s\S]*?```/g, '');
    }
    /**
     * 터미널 명령어를 제거합니다
     */
    removeBashCommands(response) {
        return response.replace(/```(?:bash|sh|shell|powershell|ps1|pwsh|cmd|batch|bat)[\s\S]*?```/gi, '');
    }
    /**
     * 파일 작업 지시어를 제거합니다
     */
    removeFileDirectives(response) {
        return response.replace(/(새 파일|수정 파일|삭제 파일):[\s\S]*?(?=\n{2,}|$)/g, '').trim();
    }
    /**
     * 응답을 요약합니다
     */
    summarizeResponse(response, maxLength = 200) {
        if (response.length <= maxLength) {
            return response;
        }
        return response.substring(0, maxLength) + '...';
    }
    /**
     * 에러 이벤트를 채팅용 포맷으로 변환합니다
     */
    formatErrorForChat(evt) {
        const header = `터미널 에러 감지 (${new Date(evt.time).toLocaleString()}):\n소스: ${evt.source}\n메시지: ${evt.message}`;
        const tail = evt.recentLogs && evt.recentLogs.length > 0
            ? '\n\n최근 로그 (최대 10줄):\n' + evt.recentLogs.slice(-10).map((l) => `- ${l.message || l.rawOutput || ''}`).join('\n')
            : '';
        return header + tail;
    }
    /**
     * 에러 이벤트를 채팅용 포맷으로 변환합니다 (static 메서드)
     */
    static formatErrorForChat(evt) {
        const header = `터미널 에러 감지 (${new Date(evt.time).toLocaleString()}):\n소스: ${evt.source}\n메시지: ${evt.message}`;
        const tail = evt.recentLogs && evt.recentLogs.length > 0
            ? '\n\n최근 로그 (최대 10줄):\n' + evt.recentLogs.slice(-10).map((l) => `- ${l.message || l.rawOutput || ''}`).join('\n')
            : '';
        return header + tail;
    }
    /**
     * GeminiApi 인스턴스를 가져옵니다
     */
    getGeminiApi() {
        return this.geminiApi;
    }
    /**
     * OllamaApi 인스턴스를 가져옵니다
     */
    getOllamaApi() {
        return this.ollamaApi;
    }
    /**
     * LLM 응답 객체를 생성합니다
     */
    createResponse(text, raw) {
        return {
            text: this.extractResponseText(text),
            raw: raw || text,
            model: this.currentModelType,
            timestamp: Date.now()
        };
    }
}
exports.LLMManager = LLMManager;
//# sourceMappingURL=LLMManager.js.map