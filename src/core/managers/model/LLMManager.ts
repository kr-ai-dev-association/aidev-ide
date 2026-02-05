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
        initialModelType: AiModelType = AiModelType.OLLAMA
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
     * 특정 모델로 시스템 프롬프트와 함께 메시지를 전송합니다
     * Compactor나 Command 모델 등 메인 모델이 아닌 다른 모델을 사용할 때 호출
     * @param modelType 사용할 모델 타입 (gemini, ollama, banya)
     * @param modelName 사용할 모델 이름 (선택사항, 지정하지 않으면 해당 타입의 기본 모델 사용)
     * @param systemPrompt 시스템 프롬프트
     * @param userParts 사용자 메시지 파트
     * @param options 요청 옵션
     */
    public async sendMessageWithSpecificModel(
        modelType: AiModelType,
        modelName: string | undefined,
        systemPrompt: string,
        userParts: LLMMessagePart[],
        options?: LLMRequestOptions
    ): Promise<string> {
        this.currentCallController = new AbortController();
        const signal = options?.signal || this.currentCallController.signal;

        try {
            let response: string;

            if (modelType === AiModelType.GEMINI) {
                // Gemini API 형식으로 변환
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

                // 모델명이 지정된 경우 임시로 모델 변경 후 호출
                const originalModel = this.geminiApi.getModelName();
                if (modelName && modelName !== originalModel) {
                    this.geminiApi.updateModelName(modelName);
                }

                try {
                    response = await this.geminiApi.sendMessageWithSystemPrompt(systemPrompt, parts, { signal });
                } finally {
                    // 원래 모델로 복원
                    if (modelName && modelName !== originalModel) {
                        this.geminiApi.updateModelName(originalModel);
                    }
                }
            } else if (modelType === AiModelType.BANYA) {
                try {
                    await this.banyaApi.loadSettingsFromStorage();
                } catch { }

                const parts = userParts.map(part => ({ text: part.text || '' }));

                // 모델명이 지정된 경우 임시로 모델 변경 후 호출
                const originalModel = this.banyaApi.getModel?.() || '';
                if (modelName && this.banyaApi.setModel) {
                    this.banyaApi.setModel(modelName);
                }

                try {
                    response = await this.banyaApi.sendMessageWithSystemPrompt(systemPrompt, parts, { signal });
                } finally {
                    // 원래 모델로 복원
                    if (modelName && originalModel && this.banyaApi.setModel) {
                        this.banyaApi.setModel(originalModel);
                    }
                }
            } else {
                // Ollama
                try {
                    await this.ollamaApi.loadSettingsFromStorage();
                } catch { }

                const parts = userParts.map(part => ({ text: part.text || '' }));

                // 모델명이 지정된 경우 임시로 모델 변경 후 호출
                const originalModel = this.ollamaApi.getModel?.() || '';
                if (modelName && this.ollamaApi.setModel) {
                    this.ollamaApi.setModel(modelName);
                }

                try {
                    response = await this.ollamaApi.sendMessageWithSystemPrompt(systemPrompt, parts, { signal });
                } finally {
                    // 원래 모델로 복원
                    if (modelName && originalModel && this.ollamaApi.setModel) {
                        this.ollamaApi.setModel(originalModel);
                    }
                }
            }

            return response;
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                console.log('[LLMManager] Request cancelled (specific model)');
                throw error;
            }
            console.error('[LLMManager] Failed to send message with specific model:', error);
            throw error;
        } finally {
            if (this.currentCallController && !options?.signal) {
                this.currentCallController = null;
            }
        }
    }

    /**
     * Compactor 모델용 StateManager 인터페이스
     */
    private compactorStateInterface = {
        getCompactorModelType: () => Promise.resolve<string | undefined>(undefined),
        getCompactorModelName: () => Promise.resolve<string | undefined>(undefined),
        getCompactorApiKey: () => Promise.resolve<string | undefined>(undefined),
    };

    /**
     * Command 모델용 StateManager 인터페이스
     */
    private commandStateInterface = {
        getCommandModelType: () => Promise.resolve<string | undefined>(undefined),
        getCommandModelName: () => Promise.resolve<string | undefined>(undefined),
        getCommandApiKey: () => Promise.resolve<string | undefined>(undefined),
    };

    /**
     * Compactor 모델로 메시지를 전송합니다
     * StateManager에서 compactor 모델 타입, 모델명, API 키를 가져와 해당 모델로 호출
     * 설정되지 않은 경우 메인 모델 사용
     */
    public async sendMessageWithCompactorModel(
        systemPrompt: string,
        userParts: LLMMessagePart[],
        stateManager: {
            getCompactorModelType: () => Promise<string | undefined>;
            getCompactorModelName?: () => Promise<string | undefined>;
            getCompactorApiKey?: () => Promise<string | undefined>;
        },
        options?: LLMRequestOptions
    ): Promise<string> {
        const modelType = await stateManager.getCompactorModelType();

        // 설정되지 않은 경우 메인 모델 사용
        if (!modelType) {
            console.log('[LLMManager] Compactor model not configured, using main model');
            return this.sendMessageWithSystemPrompt(systemPrompt, userParts, options);
        }

        // 모델명과 API 키 가져오기
        const modelName = stateManager.getCompactorModelName
            ? await stateManager.getCompactorModelName()
            : undefined;
        const apiKey = stateManager.getCompactorApiKey
            ? await stateManager.getCompactorApiKey()
            : undefined;

        console.log(`[LLMManager] Using compactor model - type: ${modelType}, name: ${modelName || 'default'}, apiKey: ${apiKey ? 'set' : 'not set'}`);

        // API 키가 설정된 경우 해당 API로 직접 호출
        return this.sendMessageWithSpecificModelAndApiKey(
            modelType as AiModelType,
            modelName,
            apiKey,
            systemPrompt,
            userParts,
            options
        );
    }

    /**
     * Command 모델로 메시지를 전송합니다
     * StateManager에서 command 모델 타입, 모델명, API 키를 가져와 해당 모델로 호출
     * 설정되지 않은 경우 메인 모델 사용
     */
    public async sendMessageWithCommandModel(
        systemPrompt: string,
        userParts: LLMMessagePart[],
        stateManager: {
            getCommandModelType: () => Promise<string | undefined>;
            getCommandModelName?: () => Promise<string | undefined>;
            getCommandApiKey?: () => Promise<string | undefined>;
        },
        options?: LLMRequestOptions
    ): Promise<string> {
        const modelType = await stateManager.getCommandModelType();

        // 설정되지 않은 경우 메인 모델 사용
        if (!modelType) {
            console.log('[LLMManager] Command model not configured, using main model');
            return this.sendMessageWithSystemPrompt(systemPrompt, userParts, options);
        }

        // 모델명과 API 키 가져오기
        const modelName = stateManager.getCommandModelName
            ? await stateManager.getCommandModelName()
            : undefined;
        const apiKey = stateManager.getCommandApiKey
            ? await stateManager.getCommandApiKey()
            : undefined;

        console.log(`[LLMManager] Using command model - type: ${modelType}, name: ${modelName || 'default'}, apiKey: ${apiKey ? 'set' : 'not set'}`);

        // API 키가 설정된 경우 해당 API로 직접 호출
        return this.sendMessageWithSpecificModelAndApiKey(
            modelType as AiModelType,
            modelName,
            apiKey,
            systemPrompt,
            userParts,
            options
        );
    }

    /**
     * Command 모델로 스트리밍 메시지를 전송합니다
     * StateManager에서 command 모델 타입, 모델명, API 키를 가져와 해당 모델로 호출
     * 설정되지 않은 경우 메인 모델 사용
     */
    public async sendMessageWithCommandModelStreaming(
        systemPrompt: string,
        userParts: LLMMessagePart[],
        onChunk: (chunk: string, done: boolean) => void,
        stateManager: {
            getCommandModelType: () => Promise<string | undefined>;
            getCommandModelName?: () => Promise<string | undefined>;
            getCommandApiKey?: () => Promise<string | undefined>;
        },
        options?: LLMRequestOptions
    ): Promise<string> {
        const modelType = await stateManager.getCommandModelType();

        // 설정되지 않은 경우 메인 모델 사용 (스트리밍)
        if (!modelType) {
            console.log('[LLMManager] Command model not configured, using main model (streaming)');
            return this.sendMessageWithSystemPromptStreaming(systemPrompt, userParts, onChunk, options);
        }

        // 모델명과 API 키 가져오기
        const modelName = stateManager.getCommandModelName
            ? await stateManager.getCommandModelName()
            : undefined;
        const apiKey = stateManager.getCommandApiKey
            ? await stateManager.getCommandApiKey()
            : undefined;

        console.log(`[LLMManager] Using command model (streaming) - type: ${modelType}, name: ${modelName || 'default'}, apiKey: ${apiKey ? 'set' : 'not set'}`);

        // API 키가 설정된 경우 해당 API로 직접 호출 (스트리밍)
        return this.sendMessageWithSpecificModelAndApiKeyStreaming(
            modelType as AiModelType,
            modelName,
            apiKey,
            systemPrompt,
            userParts,
            onChunk,
            options
        );
    }

    /**
     * Intent 모델로 메시지를 전송합니다
     * StateManager에서 intent 모델 타입, 모델명, API 키를 가져와 해당 모델로 호출
     * 설정되지 않은 경우 메인 모델 사용
     */
    public async sendMessageWithIntentModel(
        systemPrompt: string,
        userParts: LLMMessagePart[],
        stateManager: {
            getIntentModelType: () => Promise<string | undefined>;
            getIntentModelName?: () => Promise<string | undefined>;
            getIntentApiKey?: () => Promise<string | undefined>;
        },
        options?: LLMRequestOptions
    ): Promise<string> {
        const modelType = await stateManager.getIntentModelType();

        // 설정되지 않은 경우 메인 모델 사용
        if (!modelType) {
            console.log('[LLMManager] Intent model not configured, using main model');
            return this.sendMessageWithSystemPrompt(systemPrompt, userParts, options);
        }

        // 모델명과 API 키 가져오기
        const modelName = stateManager.getIntentModelName
            ? await stateManager.getIntentModelName()
            : undefined;
        const apiKey = stateManager.getIntentApiKey
            ? await stateManager.getIntentApiKey()
            : undefined;

        console.log(`[LLMManager] Using intent model - type: ${modelType}, name: ${modelName || 'default'}, apiKey: ${apiKey ? 'set' : 'not set'}`);

        // API 키가 설정된 경우 해당 API로 직접 호출
        return this.sendMessageWithSpecificModelAndApiKey(
            modelType as AiModelType,
            modelName,
            apiKey,
            systemPrompt,
            userParts,
            options
        );
    }

    /**
     * 특정 모델 타입과 API 키로 메시지를 전송합니다
     * API 키가 제공되면 임시로 해당 키를 사용하고, 없으면 기존 설정 사용
     */
    private async sendMessageWithSpecificModelAndApiKey(
        modelType: AiModelType,
        modelName: string | undefined,
        apiKey: string | undefined,
        systemPrompt: string,
        userParts: LLMMessagePart[],
        options?: LLMRequestOptions
    ): Promise<string> {
        // Gemini의 경우 API 키와 모델명 임시 변경
        if (modelType === AiModelType.GEMINI && apiKey) {
            const originalApiKey = this.geminiApi.getApiKey();
            const originalModelName = this.geminiApi.getModelName();

            try {
                // 임시로 API 키와 모델명 변경
                this.geminiApi.updateApiKey(apiKey);
                if (modelName) {
                    this.geminiApi.updateModelName(modelName);
                }

                const response = await this.sendMessageWithSpecificModel(
                    modelType,
                    modelName,
                    systemPrompt,
                    userParts,
                    options
                );

                return response;
            } finally {
                // 원래 설정으로 복원
                this.geminiApi.updateApiKey(originalApiKey);
                this.geminiApi.updateModelName(originalModelName);
            }
        }

        // Banya의 경우도 API 키 임시 변경
        if (modelType === AiModelType.BANYA && apiKey) {
            const originalApiKey = this.banyaApi.getApiKey();
            const originalModelName = this.banyaApi.getModel?.() || '';

            try {
                // 임시로 API 키와 모델명 변경
                this.banyaApi.setApiKey(apiKey);
                if (modelName && this.banyaApi.setModel) {
                    this.banyaApi.setModel(modelName);
                }

                const response = await this.sendMessageWithSpecificModel(
                    modelType,
                    modelName,
                    systemPrompt,
                    userParts,
                    options
                );

                return response;
            } finally {
                // 원래 설정으로 복원
                this.banyaApi.setApiKey(originalApiKey);
                if (originalModelName && this.banyaApi.setModel) {
                    this.banyaApi.setModel(originalModelName);
                }
            }
        }

        // 기본: 기존 설정으로 호출
        return this.sendMessageWithSpecificModel(
            modelType,
            modelName,
            systemPrompt,
            userParts,
            options
        );
    }

    /**
     * 특정 모델 타입과 API 키로 스트리밍 메시지를 전송합니다
     * API 키가 제공되면 임시로 해당 키를 사용하고, 없으면 기존 설정 사용
     */
    private async sendMessageWithSpecificModelAndApiKeyStreaming(
        modelType: AiModelType,
        modelName: string | undefined,
        apiKey: string | undefined,
        systemPrompt: string,
        userParts: LLMMessagePart[],
        onChunk: (chunk: string, done: boolean) => void,
        options?: LLMRequestOptions
    ): Promise<string> {
        // Gemini의 경우 API 키와 모델명 임시 변경
        if (modelType === AiModelType.GEMINI && apiKey) {
            const originalApiKey = this.geminiApi.getApiKey();
            const originalModelName = this.geminiApi.getModelName();

            try {
                // 임시로 API 키와 모델명 변경
                this.geminiApi.updateApiKey(apiKey);
                if (modelName) {
                    this.geminiApi.updateModelName(modelName);
                }

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

                const response = await this.geminiApi.sendMessageWithSystemPromptStreaming(
                    systemPrompt,
                    parts,
                    onChunk,
                    { signal: options?.signal }
                );

                return response;
            } finally {
                // 원래 설정으로 복원
                this.geminiApi.updateApiKey(originalApiKey);
                this.geminiApi.updateModelName(originalModelName);
            }
        }

        // Banya의 경우도 API 키 임시 변경
        if (modelType === AiModelType.BANYA && apiKey) {
            const originalApiKey = this.banyaApi.getApiKey();
            const originalModelName = this.banyaApi.getModel?.() || '';

            try {
                // 임시로 API 키와 모델명 변경
                this.banyaApi.setApiKey(apiKey);
                if (modelName && this.banyaApi.setModel) {
                    this.banyaApi.setModel(modelName);
                }

                const parts = userParts.map(part => ({ text: part.text || '' }));

                const response = await this.banyaApi.sendMessageWithSystemPromptStreaming(
                    systemPrompt,
                    parts,
                    onChunk,
                    { signal: options?.signal }
                );

                return response;
            } finally {
                // 원래 설정으로 복원
                this.banyaApi.setApiKey(originalApiKey);
                if (originalModelName && this.banyaApi.setModel) {
                    this.banyaApi.setModel(originalModelName);
                }
            }
        }

        // Ollama의 경우 (기본)
        if (modelType === AiModelType.OLLAMA) {
            try {
                await this.ollamaApi.loadSettingsFromStorage();
            } catch { }

            const parts = userParts.map(part => ({ text: part.text || '' }));

            return this.ollamaApi.sendMessageWithSystemPromptStreaming(
                systemPrompt,
                parts,
                onChunk,
                { signal: options?.signal }
            );
        }

        // 기본: 메인 모델 스트리밍
        return this.sendMessageWithSystemPromptStreaming(systemPrompt, userParts, onChunk, options);
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

    /**
     * 간단한 프롬프트에 대한 빠른 LLM 응답 생성
     * HotLoad 키워드 매칭, 분류 등 짧은 응답이 필요한 경우 사용
     * @param prompt 프롬프트
     * @param options maxTokens, temperature 등
     */
    public async generateSimpleResponse(
        prompt: string,
        options?: { maxTokens?: number; temperature?: number }
    ): Promise<string> {
        // 간단한 시스템 프롬프트로 짧은 응답 유도
        const systemPrompt = '간결하게 응답하세요. 요청된 형식만 출력하고 추가 설명은 하지 마세요.';
        const userParts = [{ text: prompt }];

        try {
            const response = await this.sendMessageWithSystemPrompt(
                systemPrompt,
                userParts,
                { maxTokens: options?.maxTokens || 50 }
            );

            return response.trim();
        } catch (error) {
            console.error('[LLMManager] generateSimpleResponse failed:', error);
            throw error;
        }
    }
}

