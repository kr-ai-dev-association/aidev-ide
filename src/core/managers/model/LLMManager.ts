/**
 * LLM Manager
 * LLM 서버(로컬/원격)와 통신을 담당하는 매니저
 * 요청 보내기 / 응답 받기 / 응답 포맷팅
 */

import { OllamaApi, AdminModelApi, AiModelType } from '../../../services';
import type { AdminModelConfig } from '../../../services/llm/AdminModelApi';
import { withRetry, isRetryableError, LLMRetryConfig, LLMRetryResult } from './LLMRetryHelper';

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
    /** 재시도 설정 (기본: maxRetries=3) */
    retry?: Partial<LLMRetryConfig>;
    /** 재시도 비활성화 (기본: false) */
    disableRetry?: boolean;
    /** thinking 비활성화 — tool calling과 충돌 방지 (Qwen3, DeepSeek 등) */
    disableThinking?: boolean;
    /** 네이티브 툴 콜링용 tools 배열 (OpenAI/Ollama 포맷) */
    nativeTools?: any[];
}

export interface LLMResponse {
    text: string;
    raw: string;
    model: string;
    timestamp: number;
}

export class LLMManager {
    private static instance: LLMManager;
    private ollamaApi: OllamaApi;
    private adminModelApi: AdminModelApi;
    private currentModelType: AiModelType;
    private currentCallController: AbortController | null = null;

    /** 시스템 프롬프트에 도구 스펙이 포함되어 있는지 감지 */
    private static hasToolSpecs(systemPrompt: string): boolean {
        return systemPrompt.includes('사용 가능한 도구');
    }

    /** thinking 비활성화 여부 결정 */
    private static resolveDisableThinking(systemPrompt: string, explicit?: boolean, hasNativeTools?: boolean): boolean {
        if (explicit !== undefined) return explicit;
        // 네이티브 툴 콜링 시 thinking 비활성화 불필요 (툴이 API params으로 전달되므로)
        if (hasNativeTools) return false;
        // 도구 스펙이 포함된 시스템 프롬프트 → thinking 자동 비활성화
        // thinking 모드에서는 모델이 tool call을 thinking 블록 안에 넣어 content가 비어버리는 문제 방지
        return LLMManager.hasToolSpecs(systemPrompt);
    }

    /** LLMMessagePart 배열을 API 전송 형식으로 변환 */
    private static normalizeParts(userParts: LLMMessagePart[]): Array<{ text: string }> {
        return userParts.map(part => ({ text: part.text || '' }));
    }

    /** Ollama 설정 로드 (실패해도 무시) */
    private async loadOllamaSettingsSafe(): Promise<void> {
        try {
            await this.ollamaApi.loadSettingsFromStorage();
        } catch { }
    }

    private constructor(
        ollamaApi: OllamaApi,
        initialModelType: AiModelType = AiModelType.OLLAMA
    ) {
        this.ollamaApi = ollamaApi;
        this.adminModelApi = new AdminModelApi();
        this.currentModelType = initialModelType;
    }

    public static getInstance(
        ollamaApi?: OllamaApi,
        initialModelType?: AiModelType
    ): LLMManager {
        if (!LLMManager.instance) {
            if (!ollamaApi) {
                throw new Error('LLMManager requires OllamaApi instance');
            }
            LLMManager.instance = new LLMManager(ollamaApi, initialModelType);
        }
        return LLMManager.instance;
    }

    /**
     * 관리자 모델 설정 적용
     */
    public setAdminModelConfig(config: AdminModelConfig): void {
        this.adminModelApi.setConfig(config);
    }

    /**
     * 현재 관리자 모델 설정을 가져옵니다
     */
    public getAdminModelConfig(): AdminModelConfig | null {
        return this.adminModelApi.getConfig();
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
     * 현재 모델명을 가져옵니다
     */
    public async getCurrentModelName(): Promise<string> {
        try {
            if (this.currentModelType === AiModelType.ADMIN) {
                return this.adminModelApi.getModel() || 'Admin Model';
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
     * v9.4.0: 재시도 로직 추가
     */
    public async sendMessage(
        prompt: string,
        options?: LLMRequestOptions
    ): Promise<string> {
        this.currentCallController = new AbortController();
        const signal = options?.signal || this.currentCallController.signal;

        const apiCall = async (): Promise<string> => {
            let response: string;

            if (this.currentModelType === AiModelType.ADMIN) {
                response = await this.adminModelApi.sendMessage(prompt, { signal });
            } else {
                await this.loadOllamaSettingsSafe();
                response = await this.ollamaApi.sendMessage(prompt, { signal });
            }

            return response;
        };

        try {
            // 재시도 비활성화된 경우 직접 호출
            if (options?.disableRetry) {
                return await apiCall();
            }

            // 재시도 로직으로 감싸서 호출
            const result = await withRetry(
                apiCall,
                options?.retry,
                signal,
                (attempt, error, delayMs) => {
                    console.log(`[LLMManager] sendMessage retry ${attempt + 1}: ${error.message.substring(0, 100)} (waiting ${delayMs}ms)`);
                }
            );

            if (result.success && result.result !== undefined) {
                if (result.attempts > 1) {
                    console.log(`[LLMManager] sendMessage succeeded after ${result.attempts} attempts (total delay: ${result.totalDelayMs}ms)`);
                }
                return result.result;
            }

            // 실패한 경우 에러 throw
            throw result.error || new Error('Unknown LLM error');
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                console.log('[LLMManager] Request cancelled');
                throw error;
            }
            console.error('[LLMManager] Failed to send message:', error);
            this.reportLLMErrorAsync(error, 'sendMessage');
            throw error;
        } finally {
            if (this.currentCallController && !options?.signal) {
                this.currentCallController = null;
            }
        }
    }

    /**
     * LLM에 메시지를 전송합니다 (시스템 프롬프트 포함)
     * v9.4.0: 재시도 로직 추가
     */
    public async sendMessageWithSystemPrompt(
        systemPrompt: string,
        userParts: LLMMessagePart[],
        options?: LLMRequestOptions
    ): Promise<string> {
        this.currentCallController = new AbortController();
        const signal = options?.signal || this.currentCallController.signal;
        // 도구 스펙 포함 시 자동으로 thinking 비활성화 (네이티브 툴 콜링 시 제외)
        const disableThinking = LLMManager.resolveDisableThinking(systemPrompt, options?.disableThinking, !!(options?.nativeTools?.length));

        const apiCall = async (): Promise<string> => {
            let response: string;

            if (this.currentModelType === AiModelType.ADMIN) {
                response = await this.adminModelApi.sendMessageWithSystemPrompt(
                    systemPrompt, LLMManager.normalizeParts(userParts), { signal, disableThinking, nativeTools: options?.nativeTools }
                );
            } else {
                await this.loadOllamaSettingsSafe();
                response = await this.ollamaApi.sendMessageWithSystemPrompt(
                    systemPrompt, LLMManager.normalizeParts(userParts),
                    { signal, disableThinking, nativeTools: options?.nativeTools }
                );
            }

            return response;
        };

        try {
            // 재시도 비활성화된 경우 직접 호출
            if (options?.disableRetry) {
                return await apiCall();
            }

            // 재시도 로직으로 감싸서 호출
            const result = await withRetry(
                apiCall,
                options?.retry,
                signal,
                (attempt, error, delayMs) => {
                    console.log(`[LLMManager] sendMessageWithSystemPrompt retry ${attempt + 1}: ${error.message.substring(0, 100)} (waiting ${delayMs}ms)`);
                }
            );

            if (result.success && result.result !== undefined) {
                if (result.attempts > 1) {
                    console.log(`[LLMManager] sendMessageWithSystemPrompt succeeded after ${result.attempts} attempts (total delay: ${result.totalDelayMs}ms)`);
                }
                return result.result;
            }

            // 실패한 경우 에러 throw
            throw result.error || new Error('Unknown LLM error');
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                console.log('[LLMManager] Request cancelled');
                throw error;
            }
            console.error('[LLMManager] Failed to send message with system prompt:', error);
            this.reportLLMErrorAsync(error, 'sendMessageWithSystemPrompt');
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
     * @param modelType 사용할 모델 타입 (ollama, admin)
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
        const disableThinking = LLMManager.resolveDisableThinking(systemPrompt, options?.disableThinking);

        try {
            let response: string;

            const isAdminRouting = modelType === AiModelType.ADMIN
                || (modelType as string).startsWith('group:');

            if (isAdminRouting) {
                response = await this.adminModelApi.sendMessageWithSystemPrompt(
                    systemPrompt, LLMManager.normalizeParts(userParts), { signal, disableThinking }
                );
            } else {
                // Ollama
                await this.loadOllamaSettingsSafe();
                const parts = LLMManager.normalizeParts(userParts);

                // 모델명이 지정된 경우 임시로 모델 변경 후 호출
                const originalModel = this.ollamaApi.getModel?.() || '';
                if (modelName && this.ollamaApi.setModel) {
                    this.ollamaApi.setModel(modelName);
                }

                try {
                    response = await this.ollamaApi.sendMessageWithSystemPrompt(
                        systemPrompt, parts, { signal, disableThinking }
                    );
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
            this.reportLLMErrorAsync(error, 'sendWithSpecificModel');
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
            getCompactorAdminConfig?: () => Promise<string | undefined>;
        },
        options?: LLMRequestOptions
    ): Promise<string> {
        const modelType = await stateManager.getCompactorModelType();

        // 설정되지 않은 경우 메인 모델 사용
        if (!modelType) {
            return this.sendMessageWithSystemPrompt(systemPrompt, userParts, options);
        }

        // group:/admin 타입 → 저장된 AdminModelConfig 사용
        if (modelType !== AiModelType.OLLAMA) {
            const adminConfigJson = stateManager.getCompactorAdminConfig
                ? await stateManager.getCompactorAdminConfig()
                : undefined;
            if (adminConfigJson) {
                try {
                    const adminConfig = JSON.parse(adminConfigJson);
                    // 라우팅 전용 API 키가 있으면 덮어쓰기
                    const routingApiKey = stateManager.getCompactorApiKey
                        ? await stateManager.getCompactorApiKey()
                        : undefined;
                    if (routingApiKey) adminConfig.apiKey = routingApiKey;
                    return await this.sendMessageWithAdminConfigSwap(adminConfig, systemPrompt, userParts, options);
                } catch { }
            }
        }

        // 폴백: 기존 방식
        const modelName = stateManager.getCompactorModelName
            ? await stateManager.getCompactorModelName()
            : undefined;
        const apiKey = stateManager.getCompactorApiKey
            ? await stateManager.getCompactorApiKey()
            : undefined;
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
            getCommandAdminConfig?: () => Promise<string | undefined>;
        },
        options?: LLMRequestOptions
    ): Promise<string> {
        const modelType = await stateManager.getCommandModelType();

        // 설정되지 않은 경우 메인 모델 사용
        if (!modelType) {
            return this.sendMessageWithSystemPrompt(systemPrompt, userParts, options);
        }

        // group:/admin 타입 → 저장된 AdminModelConfig 사용
        if (modelType !== AiModelType.OLLAMA) {
            const adminConfigJson = stateManager.getCommandAdminConfig
                ? await stateManager.getCommandAdminConfig()
                : undefined;
            if (adminConfigJson) {
                try {
                    const adminConfig = JSON.parse(adminConfigJson);
                    const routingApiKey = stateManager.getCommandApiKey
                        ? await stateManager.getCommandApiKey()
                        : undefined;
                    if (routingApiKey) adminConfig.apiKey = routingApiKey;
                    return await this.sendMessageWithAdminConfigSwap(adminConfig, systemPrompt, userParts, options);
                } catch { }
            }
        }

        // 폴백: 기존 방식
        const modelName = stateManager.getCommandModelName
            ? await stateManager.getCommandModelName()
            : undefined;
        const apiKey = stateManager.getCommandApiKey
            ? await stateManager.getCommandApiKey()
            : undefined;
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
            getCommandAdminConfig?: () => Promise<string | undefined>;
        },
        options?: LLMRequestOptions
    ): Promise<string> {
        const modelType = await stateManager.getCommandModelType();

        // 설정되지 않은 경우 메인 모델 사용 (스트리밍)
        if (!modelType) {
            return this.sendMessageWithSystemPromptStreaming(systemPrompt, userParts, onChunk, options);
        }

        // group:/admin 타입 → 저장된 AdminModelConfig 사용 (스트리밍)
        if (modelType !== AiModelType.OLLAMA) {
            const adminConfigJson = stateManager.getCommandAdminConfig
                ? await stateManager.getCommandAdminConfig()
                : undefined;
            if (adminConfigJson) {
                try {
                    const adminConfig = JSON.parse(adminConfigJson);
                    const routingApiKey = stateManager.getCommandApiKey
                        ? await stateManager.getCommandApiKey()
                        : undefined;
                    if (routingApiKey) adminConfig.apiKey = routingApiKey;
                    return await this.sendMessageWithAdminConfigSwapStreaming(adminConfig, systemPrompt, userParts, onChunk, options);
                } catch { }
            }
        }

        // 폴백: 기존 방식
        const modelName = stateManager.getCommandModelName
            ? await stateManager.getCommandModelName()
            : undefined;
        const apiKey = stateManager.getCommandApiKey
            ? await stateManager.getCommandApiKey()
            : undefined;
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
            getIntentAdminConfig?: () => Promise<string | undefined>;
        },
        options?: LLMRequestOptions
    ): Promise<string> {
        const modelType = await stateManager.getIntentModelType();

        // 설정되지 않은 경우 메인 모델 사용
        if (!modelType) {
            return this.sendMessageWithSystemPrompt(systemPrompt, userParts, options);
        }

        // group:/admin 타입 → 저장된 AdminModelConfig 사용
        if (modelType !== AiModelType.OLLAMA) {
            const adminConfigJson = stateManager.getIntentAdminConfig
                ? await stateManager.getIntentAdminConfig()
                : undefined;
            if (adminConfigJson) {
                try {
                    const adminConfig = JSON.parse(adminConfigJson);
                    const routingApiKey = stateManager.getIntentApiKey
                        ? await stateManager.getIntentApiKey()
                        : undefined;
                    if (routingApiKey) adminConfig.apiKey = routingApiKey;
                    return await this.sendMessageWithAdminConfigSwap(adminConfig, systemPrompt, userParts, options);
                } catch { }
            }
        }

        // 폴백: 기존 방식
        const modelName = stateManager.getIntentModelName
            ? await stateManager.getIntentModelName()
            : undefined;
        const apiKey = stateManager.getIntentApiKey
            ? await stateManager.getIntentApiKey()
            : undefined;
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
     * 에러 폴백 모델로 메시지를 전송합니다
     * 동일 에러 패턴 3회 반복 시 마지막 재시도에 사용
     */
    public async sendMessageWithErrorFallbackModel(
        systemPrompt: string,
        userParts: LLMMessagePart[],
        stateManager: {
            getErrorFallbackModelType: () => Promise<string | undefined>;
            getErrorFallbackModelName?: () => Promise<string | undefined>;
            getErrorFallbackApiKey?: () => Promise<string | undefined>;
            getErrorFallbackAdminConfig?: () => Promise<string | undefined>;
        },
        options?: LLMRequestOptions
    ): Promise<string> {
        const modelType = await stateManager.getErrorFallbackModelType();

        // 설정되지 않은 경우 메인 모델 사용
        if (!modelType) {
            return this.sendMessageWithSystemPrompt(systemPrompt, userParts, options);
        }

        // group:/admin 타입 → 저장된 AdminModelConfig 사용
        if (modelType !== AiModelType.OLLAMA) {
            const adminConfigJson = stateManager.getErrorFallbackAdminConfig
                ? await stateManager.getErrorFallbackAdminConfig()
                : undefined;
            if (adminConfigJson) {
                try {
                    const adminConfig = JSON.parse(adminConfigJson);
                    const routingApiKey = stateManager.getErrorFallbackApiKey
                        ? await stateManager.getErrorFallbackApiKey()
                        : undefined;
                    if (routingApiKey) adminConfig.apiKey = routingApiKey;
                    return await this.sendMessageWithAdminConfigSwap(adminConfig, systemPrompt, userParts, options);
                } catch { }
            }
        }

        // 폴백: 기존 방식
        const modelName = stateManager.getErrorFallbackModelName
            ? await stateManager.getErrorFallbackModelName()
            : undefined;
        const apiKey = stateManager.getErrorFallbackApiKey
            ? await stateManager.getErrorFallbackApiKey()
            : undefined;
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
     * 소스코드 자동완성 모델로 메시지를 전송합니다
     * 설정되지 않은 경우 메인 모델 사용
     */
    /**
     * FIM 기반 인라인 코드 완성 (Continue/Copilot 방식)
     * - Ollama: /api/generate + FIM 토큰 (qwen2.5-coder, starcoder2, deepseek-coder, codellama 지원)
     * - 클라우드/admin: chat 방식 fallback
     */
    public async sendInlineCompletion(
        prefix: string,
        suffix: string,
        stateManager: {
            getCompletionModelType: () => Promise<string | undefined>;
            getCompletionModelName?: () => Promise<string | undefined>;
            getCompletionApiKey?: () => Promise<string | undefined>;
            getCompletionAdminConfig?: () => Promise<string | undefined>;
        },
        options?: LLMRequestOptions
    ): Promise<string> {
        const modelType = await stateManager.getCompletionModelType();
        const signal = options?.signal;

        if (!modelType || modelType === AiModelType.OLLAMA) {
            // Ollama FIM 경로
            await this.loadOllamaSettingsSafe();
            const modelName = stateManager.getCompletionModelName
                ? await stateManager.getCompletionModelName()
                : undefined;

            const originalModel = this.ollamaApi.getModel?.() || '';
            if (modelName && this.ollamaApi.setModel) {
                this.ollamaApi.setModel(modelName);
            }
            try {
                return await this.ollamaApi.sendFimCompletion(prefix, suffix, { signal, retries: 1 });
            } finally {
                if (modelName && originalModel && this.ollamaApi.setModel) {
                    this.ollamaApi.setModel(originalModel);
                }
            }
        }

        // 클라우드/admin 모델 → chat fallback
        const CHAT_SYSTEM = `You are a code completion assistant. Return ONLY the raw code to insert at the cursor. No markdown, no explanations.`;
        const userMsg = `[Code before cursor]\n${prefix}\n[Code after cursor]\n${suffix}\nComplete at cursor:`;
        return this.sendMessageWithCompletionModel(
            CHAT_SYSTEM,
            [{ text: userMsg }],
            stateManager,
            { ...options, disableThinking: true, disableRetry: true }
        );
    }

    public async sendMessageWithCompletionModel(
        systemPrompt: string,
        userParts: LLMMessagePart[],
        stateManager: {
            getCompletionModelType: () => Promise<string | undefined>;
            getCompletionModelName?: () => Promise<string | undefined>;
            getCompletionApiKey?: () => Promise<string | undefined>;
            getCompletionAdminConfig?: () => Promise<string | undefined>;
        },
        options?: LLMRequestOptions
    ): Promise<string> {
        const modelType = await stateManager.getCompletionModelType();

        // 설정되지 않은 경우 메인 모델 사용
        if (!modelType) {
            return this.sendMessageWithSystemPrompt(systemPrompt, userParts, options);
        }

        // group:/admin 타입 → 저장된 AdminModelConfig 사용
        if (modelType !== AiModelType.OLLAMA) {
            const adminConfigJson = stateManager.getCompletionAdminConfig
                ? await stateManager.getCompletionAdminConfig()
                : undefined;
            if (adminConfigJson) {
                try {
                    const adminConfig = JSON.parse(adminConfigJson);
                    const routingApiKey = stateManager.getCompletionApiKey
                        ? await stateManager.getCompletionApiKey()
                        : undefined;
                    if (routingApiKey) adminConfig.apiKey = routingApiKey;
                    return await this.sendMessageWithAdminConfigSwap(adminConfig, systemPrompt, userParts, options);
                } catch { }
            }
        }

        // 폴백: 기존 방식
        const modelName = stateManager.getCompletionModelName
            ? await stateManager.getCompletionModelName()
            : undefined;
        const apiKey = stateManager.getCompletionApiKey
            ? await stateManager.getCompletionApiKey()
            : undefined;
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
        const disableThinking = LLMManager.resolveDisableThinking(systemPrompt, options?.disableThinking);

        // Ollama의 경우
        if (modelType === AiModelType.OLLAMA) {
            await this.loadOllamaSettingsSafe();
            return this.ollamaApi.sendMessageWithSystemPromptStreaming(
                systemPrompt,
                LLMManager.normalizeParts(userParts),
                onChunk,
                { signal: options?.signal, disableThinking }
            );
        }

        // 기본: 메인 모델 스트리밍
        return this.sendMessageWithSystemPromptStreaming(systemPrompt, userParts, onChunk, options);
    }

    /**
     * OllamaApi 인스턴스를 가져옵니다
     */
    public getOllamaApi(): OllamaApi {
        return this.ollamaApi;
    }

    /**
     * AdminModelConfig를 임시로 교체하여 메시지를 전송합니다
     * group:/admin 라우팅 모델 사용 시 해당 모델의 설정을 적용
     */
    private async sendMessageWithAdminConfigSwap(
        adminConfig: AdminModelConfig,
        systemPrompt: string,
        userParts: LLMMessagePart[],
        options?: LLMRequestOptions
    ): Promise<string> {
        const originalConfig = this.adminModelApi.getConfig();
        try {
            this.adminModelApi.setConfig(adminConfig);
            const signal = options?.signal || new AbortController().signal;
            const disableThinking = LLMManager.resolveDisableThinking(systemPrompt, options?.disableThinking);
            return await this.adminModelApi.sendMessageWithSystemPrompt(
                systemPrompt, LLMManager.normalizeParts(userParts), { signal, disableThinking }
            );
        } finally {
            if (originalConfig) {
                this.adminModelApi.setConfig(originalConfig);
            }
        }
    }

    /**
     * AdminModelConfig를 임시로 교체하여 스트리밍 메시지를 전송합니다
     */
    private async sendMessageWithAdminConfigSwapStreaming(
        adminConfig: AdminModelConfig,
        systemPrompt: string,
        userParts: LLMMessagePart[],
        onChunk: (chunk: string, done: boolean) => void,
        options?: LLMRequestOptions
    ): Promise<string> {
        const originalConfig = this.adminModelApi.getConfig();
        try {
            this.adminModelApi.setConfig(adminConfig);
            const signal = options?.signal || new AbortController().signal;
            const disableThinking = LLMManager.resolveDisableThinking(systemPrompt, options?.disableThinking);
            return await this.adminModelApi.sendMessageWithSystemPromptStreaming(
                systemPrompt, LLMManager.normalizeParts(userParts), onChunk, { signal, disableThinking }
            );
        } finally {
            if (originalConfig) {
                this.adminModelApi.setConfig(originalConfig);
            }
        }
    }

    /**
     * AdminModelApi 인스턴스를 가져옵니다
     */
    public getAdminModelApi(): AdminModelApi {
        return this.adminModelApi;
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
     * v9.4.0: 재시도 로직 추가 (스트리밍은 연결 시작 전 에러에 대해서만 재시도)
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
        // 도구 스펙 포함 시 자동으로 thinking 비활성화 (네이티브 툴 콜링 시 제외)
        const disableThinking = LLMManager.resolveDisableThinking(systemPrompt, options?.disableThinking, !!(options?.nativeTools?.length));

        const apiCall = async (): Promise<string> => {
            let response: string;

            if (this.currentModelType === AiModelType.ADMIN) {
                response = await this.adminModelApi.sendMessageWithSystemPromptStreaming(
                    systemPrompt,
                    LLMManager.normalizeParts(userParts),
                    onChunk,
                    { signal, disableThinking, nativeTools: options?.nativeTools }
                );
            } else {
                await this.loadOllamaSettingsSafe();
                response = await this.ollamaApi.sendMessageWithSystemPromptStreaming(
                    systemPrompt,
                    LLMManager.normalizeParts(userParts),
                    onChunk,
                    { signal, disableThinking, nativeTools: options?.nativeTools }
                );
            }

            return response;
        };

        try {
            // 재시도 비활성화된 경우 직접 호출
            if (options?.disableRetry) {
                return await apiCall();
            }

            // 스트리밍은 연결 에러에 대해서만 재시도 (청크 수신 중 에러는 재시도하지 않음)
            const result = await withRetry(
                apiCall,
                options?.retry,
                signal,
                (attempt, error, delayMs) => {
                    console.log(`[LLMManager] streaming retry ${attempt + 1}: ${error.message.substring(0, 100)} (waiting ${delayMs}ms)`);
                }
            );

            if (result.success && result.result !== undefined) {
                if (result.attempts > 1) {
                    console.log(`[LLMManager] streaming succeeded after ${result.attempts} attempts (total delay: ${result.totalDelayMs}ms)`);
                }
                return result.result;
            }

            // 실패한 경우 에러 throw
            throw result.error || new Error('Unknown LLM streaming error');
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                console.log('[LLMManager] Streaming request cancelled');
                throw error;
            }
            console.error('[LLMManager] Failed to send streaming message:', error);
            this.reportLLMErrorAsync(error, 'streaming');
            throw error;
        } finally {
            if (this.currentCallController && !options?.signal) {
                this.currentCallController = null;
            }
        }
    }

    /**
     * LLM API 에러를 ErrorReportingService로 비동기 전송 (fire-and-forget)
     */
    private reportLLMErrorAsync(error: unknown, method: string): void {
        try {
            const errorMessage = error instanceof Error ? error.message : String(error);
            // 에러 메시지에서 HTTP 상태 코드 추출
            const statusMatch = errorMessage.match(/(\d{3})\s/);
            const statusCode = statusMatch ? parseInt(statusMatch[1]) : undefined;

            import('../../../services/error/ErrorReportingService').then(({ ErrorReportingService }) => {
                const reporter = ErrorReportingService.getInstance();
                const modelName = this.currentModelType === AiModelType.ADMIN
                    ? this.adminModelApi.getModelName()
                    : this.ollamaApi?.getModel?.() || 'unknown';

                reporter.reportLLMError(
                    errorMessage.substring(0, 500),
                    modelName,
                    {
                        method,
                        modelType: this.currentModelType,
                        statusCode,
                        endpoint: this.currentModelType === AiModelType.ADMIN
                            ? this.adminModelApi.getConfig()?.endpoint
                            : undefined,
                    }
                );
            }).catch(() => { /* 에러 리포팅 실패는 무시 */ });
        } catch {
            // 에러 리포팅 자체가 실패해도 원래 에러 흐름을 방해하지 않음
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

