/**
 * LLM Manager
 * LLM 서버(로컬/원격)와 통신을 담당하는 매니저
 * 요청 보내기 / 응답 받기 / 응답 포맷팅
 */

import { GeminiApi, OllamaApi, BanyaApi, AiModelType } from '../../../services';

export interface LLMMessagePart {
    text?: string;
    imageData?: string;
    imageMimeType?: string;
    inlineData?: {
        data: string;
        mimeType: string;
    };
}

export interface LLMRequestOptions {
    signal?: AbortSignal;
    temperature?: number;
    maxTokens?: number;
}

export interface LLMResponse {
    text: string;
    raw: string;
    model: string;
    timestamp: number;
}

export class LLMManager {
    private static instance: LLMManager;
    private geminiApi: GeminiApi;
    private ollamaApi: OllamaApi;
    private banyaApi: BanyaApi;
    private currentModelType: AiModelType;
    private currentCallController: AbortController | null = null;

    private constructor(
        geminiApi: GeminiApi,
        ollamaApi: OllamaApi,
        banyaApi: BanyaApi,
        initialModelType: AiModelType = AiModelType.GEMINI
    ) {
        this.geminiApi = geminiApi;
        this.ollamaApi = ollamaApi;
        this.banyaApi = banyaApi;
        this.currentModelType = initialModelType;
        console.log('[LLMManager] Initialized');
    }

    public static getInstance(
        geminiApi?: GeminiApi,
        ollamaApi?: OllamaApi,
        banyaApi?: BanyaApi,
        initialModelType?: AiModelType
    ): LLMManager {
        if (!LLMManager.instance) {
            if (!geminiApi || !ollamaApi || !banyaApi) {
                throw new Error('LLMManager requires GeminiApi, OllamaApi, and BanyaApi instances');
            }
            LLMManager.instance = new LLMManager(geminiApi, ollamaApi, banyaApi, initialModelType);
        }
        return LLMManager.instance;
    }

    /**
     * 현재 모델 타입을 설정합니다
     */
    public setCurrentModel(modelType: AiModelType): void {
        this.currentModelType = modelType;
        console.log(`[LLMManager] Model type set to: ${modelType}`);
    }

    /**
     * 현재 모델 타입을 가져옵니다
     */
    public getCurrentModel(): AiModelType {
        return this.currentModelType;
    }

    /**
     * 현재 모델명을 가져옵니다
     */
    public async getCurrentModelName(): Promise<string> {
        try {
            if (this.currentModelType === AiModelType.GEMINI) {
                return this.geminiApi.getModelName();
            } else if (this.currentModelType === AiModelType.BANYA) {
                return this.banyaApi.getModel?.() || this.banyaApi.getCurrentModelName?.() || 'Banya Model';
            } else if (this.ollamaApi) {
                return this.ollamaApi.getModel?.() || this.ollamaApi.getCurrentModelName?.() || 'Ollama Model';
            }
        } catch { }
        return 'Unknown Model';
    }

    /**
     * 현재 호출을 취소합니다
     */
    public cancelCurrentCall(): void {
        if (this.currentCallController) {
            this.currentCallController.abort();
            this.currentCallController = null;
            console.log('[LLMManager] Current call cancelled');
        }
    }

    /**
     * LLM에 메시지를 전송합니다 (시스템 프롬프트 없음)
     */
    public async sendMessage(
        prompt: string,
        options?: LLMRequestOptions
    ): Promise<string> {
        this.currentCallController = new AbortController();
        const signal = options?.signal || this.currentCallController.signal;

        try {
            let response: string;

            if (this.currentModelType === AiModelType.GEMINI) {
                response = await this.geminiApi.sendMessage(prompt, undefined, { signal });
            } else if (this.currentModelType === AiModelType.BANYA) {
                try {
                    await this.banyaApi.loadSettingsFromStorage();
                } catch { }
                response = await this.banyaApi.sendMessage(prompt, { signal });
            } else {
                try {
                    await this.ollamaApi.loadSettingsFromStorage();
                } catch { }
                response = await this.ollamaApi.sendMessage(prompt, { signal });
            }

            return response;
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                console.log('[LLMManager] Request cancelled');
                throw error;
            }
            console.error('[LLMManager] Failed to send message:', error);
            throw error;
        } finally {
            if (this.currentCallController && !options?.signal) {
                this.currentCallController = null;
            }
        }
    }

    /**
     * LLM에 메시지를 전송합니다 (시스템 프롬프트 포함)
     */
    public async sendMessageWithSystemPrompt(
        systemPrompt: string,
        userParts: LLMMessagePart[],
        options?: LLMRequestOptions
    ): Promise<string> {
        this.currentCallController = new AbortController();
        const signal = options?.signal || this.currentCallController.signal;

        try {
            let response: string;

            if (this.currentModelType === AiModelType.GEMINI) {
                // Gemini API 형식으로 변환 (Part 타입)
                const parts: any[] = userParts.map(part => {
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
                    } catch { }
                    // Ollama로 폴백
                    const ollamaParts = userParts.map(part => ({ text: part.text || '' }));
                    response = await this.ollamaApi.sendMessageWithSystemPrompt(systemPrompt, ollamaParts, { signal });
                }
            } else if (this.currentModelType === AiModelType.BANYA) {
                try {
                    await this.banyaApi.loadSettingsFromStorage();
                } catch { }

                // Banya API 형식으로 변환
                const parts = userParts.map(part => ({ text: part.text || '' }));

                response = await this.banyaApi.sendMessageWithSystemPrompt(systemPrompt, parts, { signal });
            } else {
                try {
                    await this.ollamaApi.loadSettingsFromStorage();
                } catch { }

                // Ollama API 형식으로 변환
                const parts = userParts.map(part => ({ text: part.text || '' }));

                response = await this.ollamaApi.sendMessageWithSystemPrompt(systemPrompt, parts, { signal });
            }

            return response;
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                console.log('[LLMManager] Request cancelled');
                throw error;
            }
            console.error('[LLMManager] Failed to send message with system prompt:', error);
            throw error;
        } finally {
            if (this.currentCallController && !options?.signal) {
                this.currentCallController = null;
            }
        }
    }

    /**
     * LLM 응답을 포맷팅합니다
     */
    public formatResponse(response: string, options?: {
        removeCodeBlocks?: boolean;
        removeFileDirectives?: boolean;
        removeBashCommands?: boolean;
        summarize?: boolean;
        maxLength?: number;
    }): string {
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
    public extractResponseText(llmResponse: string): string {
        let text = llmResponse;

        // 파일 작업 지시어 제거 (한국어 + 영어 범용)
        text = text.replace(/(?:##\s*)?(새 파일|수정 파일|삭제 파일|New file|Create file|Modified file|Update file|Modify file|Delete file|Remove file):\s*[^\r\n]+/gi, '');

        // 코드 블록 제거
        text = text.replace(/```[\s\S]*?```/g, '');

        // 작업 요약/설명 섹션 제거 (한국어 + 영어 범용)
        text = text.replace(/---\s*(?:작업 요약|Summary)\s*---[\s\S]*?---\s*(?:작업 수행 설명|Description)\s*---[\s\S]*/gi, '');
        text = text.replace(/---\s*(?:작업 요약|Summary)\s*---[\s\S]*/gi, '');
        text = text.replace(/---\s*(?:작업 수행 설명|Description)\s*---[\s\S]*/gi, '');

        // 연속된 빈 줄 정리
        text = text.replace(/\n{3,}/g, '\n\n');

        return text.trim();
    }

    /**
     * 코드 블록을 제거합니다
     */
    private removeCodeBlocks(response: string): string {
        return response.replace(/```[\s\S]*?```/g, '');
    }

    /**
     * 터미널 명령어를 제거합니다
     */
    private removeBashCommands(response: string): string {
        return response.replace(/```(?:bash|sh|shell|powershell|ps1|pwsh|cmd|batch|bat)[\s\S]*?```/gi, '');
    }

    /**
     * 파일 작업 지시어를 제거합니다 (한국어 + 영어 범용)
     */
    private removeFileDirectives(response: string): string {
        return response.replace(/(새 파일|수정 파일|삭제 파일|New file|Create file|Modified file|Update file|Modify file|Delete file|Remove file):[\s\S]*?(?=\n{2,}|$)/gi, '').trim();
    }

    /**
     * 응답을 요약합니다
     */
    private summarizeResponse(response: string, maxLength: number = 200): string {
        if (response.length <= maxLength) {
            return response;
        }
        return response.substring(0, maxLength) + '...';
    }

    /**
     * 에러 이벤트를 채팅용 포맷으로 변환합니다
     */
    public formatErrorForChat(evt: { time: number; source: string; message: string; recentLogs: any[] }): string {
        const header = `터미널 에러 감지 (${new Date(evt.time).toLocaleString()}):\n소스: ${evt.source}\n메시지: ${evt.message}`;
        const tail = evt.recentLogs && evt.recentLogs.length > 0
            ? '\n\n최근 로그 (최대 10줄):\n' + evt.recentLogs.slice(-10).map((l: any) => `- ${l.message || l.rawOutput || ''}`).join('\n')
            : '';
        return header + tail;
    }

    /**
     * 에러 이벤트를 채팅용 포맷으로 변환합니다 (static 메서드)
     */
    public static formatErrorForChat(evt: { time: number; source: string; message: string; recentLogs: any[] }): string {
        const header = `터미널 에러 감지 (${new Date(evt.time).toLocaleString()}):\n소스: ${evt.source}\n메시지: ${evt.message}`;
        const tail = evt.recentLogs && evt.recentLogs.length > 0
            ? '\n\n최근 로그 (최대 10줄):\n' + evt.recentLogs.slice(-10).map((l: any) => `- ${l.message || l.rawOutput || ''}`).join('\n')
            : '';
        return header + tail;
    }

    /**
     * GeminiApi 인스턴스를 가져옵니다
     */
    public getGeminiApi(): GeminiApi {
        return this.geminiApi;
    }

    /**
     * OllamaApi 인스턴스를 가져옵니다
     */
    public getOllamaApi(): OllamaApi {
        return this.ollamaApi;
    }

    /**
     * BanyaApi 인스턴스를 가져옵니다
     */
    public getBanyaApi(): BanyaApi {
        return this.banyaApi;
    }

    /**
     * LLM 응답 객체를 생성합니다
     */
    public createResponse(text: string, raw?: string): LLMResponse {
        return {
            text: this.extractResponseText(text),
            raw: raw || text,
            model: this.currentModelType,
            timestamp: Date.now()
        };
    }

    /**
     * LLM에 스트리밍 메시지를 전송합니다 (시스템 프롬프트 포함)
     * @param systemPrompt 시스템 프롬프트
     * @param userParts 사용자 메시지 파트
     * @param onChunk 청크 수신 콜백
     * @param options 요청 옵션
     */
    public async sendMessageWithSystemPromptStreaming(
        systemPrompt: string,
        userParts: LLMMessagePart[],
        onChunk: (chunk: string, done: boolean) => void,
        options?: LLMRequestOptions
    ): Promise<string> {
        this.currentCallController = new AbortController();
        const signal = options?.signal || this.currentCallController.signal;

        try {
            let response: string;

            if (this.currentModelType === AiModelType.GEMINI) {
                // Gemini API 형식으로 변환 (Part 타입)
                const parts: any[] = userParts.map(part => {
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

                response = await this.geminiApi.sendMessageWithSystemPromptStreaming(
                    systemPrompt,
                    parts,
                    onChunk,
                    { signal }
                );

                // Offline fallback trigger
                if (typeof response === 'string' && response.startsWith('OFFLINE:')) {
                    try {
                        await this.ollamaApi.loadSettingsFromStorage();
                    } catch { }
                    // Ollama로 폴백 (스트리밍)
                    const ollamaParts = userParts.map(part => ({ text: part.text || '' }));
                    response = await this.ollamaApi.sendMessageWithSystemPromptStreaming(
                        systemPrompt,
                        ollamaParts,
                        onChunk,
                        { signal }
                    );
                }
            } else if (this.currentModelType === AiModelType.BANYA) {
                try {
                    await this.banyaApi.loadSettingsFromStorage();
                } catch { }

                // Banya API 형식으로 변환
                const parts = userParts.map(part => ({ text: part.text || '' }));

                response = await this.banyaApi.sendMessageWithSystemPromptStreaming(
                    systemPrompt,
                    parts,
                    onChunk,
                    { signal }
                );
            } else {
                try {
                    await this.ollamaApi.loadSettingsFromStorage();
                } catch { }

                // Ollama API 형식으로 변환
                const parts = userParts.map(part => ({ text: part.text || '' }));

                response = await this.ollamaApi.sendMessageWithSystemPromptStreaming(
                    systemPrompt,
                    parts,
                    onChunk,
                    { signal }
                );
            }

            return response;
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                console.log('[LLMManager] Streaming request cancelled');
                throw error;
            }
            console.error('[LLMManager] Failed to send streaming message:', error);
            throw error;
        } finally {
            if (this.currentCallController && !options?.signal) {
                this.currentCallController = null;
            }
        }
    }
}

