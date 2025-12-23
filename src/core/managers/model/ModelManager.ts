/**
 * Model Manager
 * LLM 모델 선택 및 API 키 관리를 담당하는 메인 매니저
 */

import * as vscode from 'vscode';
import {
    Model,
    ModelProvider,
    ModelConfig,
    ApiKeyInfo,
    ModelCapabilities,
    ModelUsageStats
} from './types';
import { ILLMAdapter } from './llm/ILLMAdapter';
import { GptAdapter } from './llm/GptAdapter';

export class ModelManager {
    private static instance: ModelManager;
    private context: vscode.ExtensionContext;
    private models: Map<string, Model & { usage?: ModelUsageStats; modelName?: string; config?: ModelConfig }> = new Map();
    private currentModelId?: string;
    private apiKeys: Map<string, ApiKeyInfo> = new Map();
    private llmAdapter: ILLMAdapter;

    private constructor(context: vscode.ExtensionContext) {
        this.context = context;
        // LLM 어댑터 초기화 (현재는 GPT 고정, 프론트엔드에서 모델 선택)
        this.llmAdapter = new GptAdapter();
        this.initializeModels();
        this.loadApiKeys();
    }

    public static getInstance(context?: vscode.ExtensionContext): ModelManager {
        if (!ModelManager.instance && context) {
            ModelManager.instance = new ModelManager(context);
        }
        return ModelManager.instance!;
    }

    /**
     * 모델을 초기화합니다
     */
    private initializeModels(): void {
        // GPT 모델들
        this.registerModel({
            id: 'gpt-4',
            name: 'GPT-4',
            provider: ModelProvider.GPT,
            displayName: 'GPT-4',
            modelName: 'gpt-4',
            capabilities: {
                chat: true,
                codeGeneration: true,
                codeAnalysis: true,
                imageInput: false,
                audioInput: false,
                functionCalling: true,
                streaming: true,
                embeddings: false
            },
            limits: {
                maxInputTokens: 8192,
                maxOutputTokens: 8192,
                maxContextWindow: 8192
            },
            config: {
                modelId: 'gpt-4',
                maxTokens: 8192,
                temperature: 0.7,
                topP: 1.0,
                frequencyPenalty: 0,
                presencePenalty: 0
            }
        });

        this.registerModel({
            id: 'gpt-4-turbo',
            name: 'GPT-4 Turbo',
            provider: ModelProvider.GPT,
            displayName: 'GPT-4 Turbo',
            modelName: 'gpt-4-turbo-preview',
            capabilities: {
                chat: true,
                codeGeneration: true,
                codeAnalysis: true,
                imageInput: false,
                audioInput: false,
                functionCalling: true,
                streaming: true,
                embeddings: false
            },
            limits: {
                maxInputTokens: 128000,
                maxOutputTokens: 128000,
                maxContextWindow: 128000
            },
            config: {
                modelId: 'gpt-4-turbo',
                maxTokens: 128000,
                temperature: 0.7,
                topP: 1.0,
                frequencyPenalty: 0,
                presencePenalty: 0
            }
        });

        this.registerModel({
            id: 'gpt-3.5-turbo',
            name: 'GPT-3.5 Turbo',
            provider: ModelProvider.GPT,
            displayName: 'GPT-3.5 Turbo',
            modelName: 'gpt-3.5-turbo',
            capabilities: {
                chat: true,
                codeGeneration: true,
                codeAnalysis: true,
                imageInput: false,
                audioInput: false,
                functionCalling: true,
                streaming: true,
                embeddings: false
            },
            limits: {
                maxInputTokens: 4096,
                maxOutputTokens: 4096,
                maxContextWindow: 4096
            },
            config: {
                modelId: 'gpt-3.5-turbo',
                maxTokens: 4096,
                temperature: 0.7,
                topP: 1.0,
                frequencyPenalty: 0,
                presencePenalty: 0
            }
        });

        // Gemini 모델들
        this.registerModel({
            id: 'gemini-pro',
            name: 'Gemini Pro',
            provider: ModelProvider.GEMINI,
            displayName: 'Gemini Pro',
            modelName: 'gemini-pro',
            capabilities: {
                chat: true,
                codeGeneration: true,
                codeAnalysis: true,
                imageInput: true,
                audioInput: false,
                functionCalling: true,
                streaming: true,
                embeddings: false
            },
            limits: {
                maxInputTokens: 8192,
                maxOutputTokens: 8192,
                maxContextWindow: 8192
            },
            config: {
                modelId: 'gemini-pro',
                maxTokens: 8192,
                temperature: 0.7,
                topP: 0.95,
                frequencyPenalty: 0,
                presencePenalty: 0
            }
        });

        // Ollama 모델들 (로컬)
        this.registerModel({
            id: 'ollama-deepseek',
            name: 'DeepSeek Coder',
            provider: ModelProvider.OLLAMA,
            displayName: 'DeepSeek Coder',
            modelName: 'deepseek-coder',
            capabilities: {
                chat: true,
                codeGeneration: true,
                codeAnalysis: true,
                imageInput: false,
                audioInput: false,
                functionCalling: false,
                streaming: true,
                embeddings: false
            },
            limits: {
                maxInputTokens: 4096,
                maxOutputTokens: 4096,
                maxContextWindow: 4096
            },
            config: {
                modelId: 'ollama-deepseek',
                maxTokens: 4096,
                temperature: 0.2,
                topP: 0.95,
                frequencyPenalty: 0,
                presencePenalty: 0
            }
        });

        this.registerModel({
            id: 'ollama-codellama',
            name: 'CodeLlama',
            provider: ModelProvider.OLLAMA,
            displayName: 'CodeLlama',
            modelName: 'codellama',
            capabilities: {
                chat: true,
                codeGeneration: true,
                codeAnalysis: true,
                imageInput: false,
                audioInput: false,
                functionCalling: false,
                streaming: true,
                embeddings: false
            },
            limits: {
                maxInputTokens: 4096,
                maxOutputTokens: 4096,
                maxContextWindow: 4096
            },
            config: {
                modelId: 'ollama-codellama',
                maxTokens: 4096,
                temperature: 0.2,
                topP: 0.95,
                frequencyPenalty: 0,
                presencePenalty: 0
            }
        });

        console.log(`[ModelManager] Initialized ${this.models.size} models`);
    }

    /**
     * 모델을 등록합니다
     */
    public registerModel(model: Model & { modelName?: string; config?: ModelConfig }): void {
        this.models.set(model.id, model);
        console.log(`[ModelManager] Registered model: ${model.id} (${model.provider})`);
    }

    /**
     * 모든 모델을 가져옵니다
     */
    public getAllModels(): Model[] {
        return Array.from(this.models.values());
    }

    /**
     * 프로바이더별 모델을 가져옵니다
     */
    public getModelsByProvider(provider: ModelProvider): Model[] {
        return Array.from(this.models.values()).filter(m => m.provider === provider);
    }

    /**
     * 모델을 가져옵니다
     */
    public getModel(modelId: string): Model | undefined {
        return this.models.get(modelId);
    }

    /**
     * 현재 모델을 가져옵니다
     */
    public getCurrentModel(): Model | undefined {
        if (!this.currentModelId) {
            // 기본값: gpt-3.5-turbo
            this.currentModelId = 'gpt-3.5-turbo';
        }
        return this.models.get(this.currentModelId);
    }

    /**
     * 현재 모델을 설정합니다
     */
    public setCurrentModel(modelId: string): boolean {
        if (this.models.has(modelId)) {
            this.currentModelId = modelId;
            this.context.globalState.update('aidevIde.currentModel', modelId);
            console.log(`[ModelManager] Current model set to: ${modelId}`);
            return true;
        }
        return false;
    }

    /**
     * API 키를 저장합니다
     */
    public async saveApiKey(provider: ModelProvider, apiKey: string): Promise<void> {
        const keyInfo: ApiKeyInfo = {
            provider,
            key: apiKey,
            isValid: true,
            lastValidated: Date.now()
        };

        this.apiKeys.set(provider, keyInfo);
        await this.saveApiKeys();

        console.log(`[ModelManager] API key saved for: ${provider}`);
    }

    /**
     * API 키를 가져옵니다
     */
    public getApiKey(provider: ModelProvider): string | undefined {
        const keyInfo = this.apiKeys.get(provider);
        if (keyInfo) {
            return keyInfo.key;
        }

        // VS Code 설정에서 가져오기
        const config = vscode.workspace.getConfiguration('aidevIde');
        if (provider === ModelProvider.GEMINI) {
            return config.get<string>('geminiApiKey');
        }

        return undefined;
    }

    /**
     * API 키를 삭제합니다
     */
    public async deleteApiKey(provider: ModelProvider): Promise<void> {
        this.apiKeys.delete(provider);
        await this.saveApiKeys();
        console.log(`[ModelManager] API key deleted for: ${provider}`);
    }

    /**
     * 모델 사용량을 기록합니다
     */
    public recordUsage(modelId: string, tokensUsed: number, duration: number): void {
        const model = this.models.get(modelId);
        if (!model) {
            return;
        }

        if (!model.usage) {
            model.usage = {
                modelId: model.id,
                totalRequests: 0,
                totalInputTokens: 0,
                totalOutputTokens: tokensUsed,
                totalCost: 0,
                averageResponseTime: 0,
                successRate: 1.0,
                lastUsedAt: Date.now()
            };
        }

        model.usage.totalRequests++;
        model.usage.totalOutputTokens += tokensUsed;
        model.usage.averageResponseTime = (model.usage.averageResponseTime * (model.usage.totalRequests - 1) + duration) / model.usage.totalRequests;
        model.usage.lastUsedAt = Date.now();

        // 저장
        this.saveModels();
    }

    /**
     * 모델 설정을 업데이트합니다
     */
    public updateModelConfig(modelId: string, config: Partial<ModelConfig>): boolean {
        const model = this.models.get(modelId);
        if (!model) {
            return false;
        }

        model.config = {
            ...model.config,
            ...config,
            modelId: model.config?.modelId || modelId
        };

        this.saveModels();
        console.log(`[ModelManager] Updated config for: ${modelId}`);

        return true;
    }

    /**
     * 모델이 특정 기능을 지원하는지 확인합니다
     */
    public supportsCapability(modelId: string, capability: keyof ModelCapabilities): boolean {
        const model = this.models.get(modelId);
        if (!model) return false;
        return model.capabilities[capability] ?? false;
    }

    /**
     * LLM 어댑터를 가져옵니다
     */
    public getLLMAdapter(): ILLMAdapter {
        return this.llmAdapter;
    }

    /**
     * API 키를 로드합니다
     */
    private loadApiKeys(): void {
        try {
            const stored = this.context.globalState.get<Map<string, ApiKeyInfo>>('aidevIde.apiKeys');
            if (stored) {
                this.apiKeys = new Map(stored);
                console.log(`[ModelManager] Loaded ${this.apiKeys.size} API keys`);
            }

            // 현재 모델 로드
            const currentModel = this.context.globalState.get<string>('aidevIde.currentModel');
            if (currentModel && this.models.has(currentModel)) {
                this.currentModelId = currentModel;
            }
        } catch (error) {
            console.error('[ModelManager] Failed to load API keys:', error);
        }
    }

    /**
     * API 키를 저장합니다
     */
    private async saveApiKeys(): Promise<void> {
        try {
            await this.context.globalState.update('aidevIde.apiKeys', Array.from(this.apiKeys.entries()));
        } catch (error) {
            console.error('[ModelManager] Failed to save API keys:', error);
        }
    }

    /**
     * 모델을 저장합니다
     */
    private saveModels(): void {
        try {
            const modelsData = Array.from(this.models.entries()).map(([id, model]) => ({
                id,
                usage: model.usage
            }));
            this.context.globalState.update('aidevIde.models', modelsData);
        } catch (error) {
            console.error('[ModelManager] Failed to save models:', error);
        }
    }
}

