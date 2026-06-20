/**
 * LLM API Client
 * LLM API 호출을 담당하는 클라이언트
 * OllamaApi, AdminModelApi를 래핑하여 통합 인터페이스 제공
 * v10.0: 백엔드 관리자 강제 모델 설정 적용
 * v10.1: 관리자 AI 모델 선택 및 호출 지원
 */

import { OllamaApi, AdminModelApi, AiModelType } from '../../../services';
import type { AdminModelConfig } from '../../../services/llm/AdminModelApi';

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
    private ollamaApi: OllamaApi;
    private adminModelApi: AdminModelApi;
    private currentModelType: AiModelType;
    private currentCallController: AbortController | null = null;
    private adminForcedModel: AiModelType | null = null;

    constructor(
        ollamaApi: OllamaApi,
        initialModelType: AiModelType = AiModelType.OLLAMA
    ) {
        this.ollamaApi = ollamaApi;
        this.adminModelApi = new AdminModelApi();
        this.currentModelType = initialModelType;
    }

    /**
     * 관리자 강제 모델 설정 적용
     * SettingsManager에서 서버 동기화 후 호출
     */
    public applyAdminModelSettings(forcedModel: AiModelType | null): void {
        this.adminForcedModel = forcedModel;
        if (forcedModel) {
            this.currentModelType = forcedModel;
            console.log(`[LLMApiClient] Admin forced model applied: ${forcedModel}`);
        }
    }

    /**
     * 관리자 모델 설정 적용
     */
    public setAdminModelConfig(config: AdminModelConfig): void {
        this.adminModelApi.setConfig(config);
    }

    /**
     * 현재 모델 타입을 설정합니다
     * 관리자 강제 모델이 설정된 경우 변경 불가
     */
    public setCurrentModel(modelType: AiModelType): void {
        if (this.adminForcedModel) {
            console.warn(`[LLMApiClient] Model change blocked: admin forced model is ${this.adminForcedModel}`);
            return;
        }
        this.currentModelType = modelType;
    }

    /**
     * 현재 모델 타입을 가져옵니다
     */
    public getCurrentModel(): AiModelType {
        return this.currentModelType;
    }

    /**
     * 관리자에 의해 모델이 잠겨있는지 확인
     */
    public isModelLocked(): boolean {
        return this.adminForcedModel !== null;
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
            if (this.currentModelType === AiModelType.ADMIN) {
                return await this.adminModelApi.sendMessage(message, { signal: abortSignal });
            } else {
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
            if (this.currentModelType === AiModelType.ADMIN) {
                const parts = userParts.map(part => ({ text: part.text || '' }));
                return await this.adminModelApi.sendMessageWithSystemPrompt(
                    systemPrompt,
                    parts,
                    { signal: abortSignal }
                );
            } else {
                await this.ollamaApi.loadSettingsFromStorage();
                return await this.ollamaApi.sendMessageWithSystemPrompt(
                    systemPrompt,
                    userParts,
                    { signal: abortSignal }
                );
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
        if (this.currentModelType === AiModelType.ADMIN) {
            return this.adminModelApi.getModel() || 'admin-model';
        } else {
            await this.ollamaApi.loadSettingsFromStorage();
            return this.ollamaApi.getModel() || 'unknown';
        }
    }
}
