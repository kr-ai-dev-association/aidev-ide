/**
 * State Manager
 * 전역 상태를 관리하는 클래스
 */

import * as vscode from 'vscode';
import {
    GlobalState,
    ExtensionMode,
    ModelSettings,
    ExtensionStats,
    RecentAction
} from './types';
import { DEFAULT_OLLAMA_URL } from '../../config/ApiDefaults';

export class StateManager {
    private static instance: StateManager;
    private state: GlobalState = {};
    private _context: vscode.ExtensionContext;

    private constructor(context: vscode.ExtensionContext) {
        this._context = context;
        this.loadState();
    }

    public static getInstance(context?: vscode.ExtensionContext): StateManager {
        if (!StateManager.instance) {
            if (!context) {
                throw new Error('StateManager requires ExtensionContext for first initialization');
            }
            StateManager.instance = new StateManager(context);
        }
        return StateManager.instance;
    }

    public get context(): vscode.ExtensionContext {
        return this._context;
    }

    /**
     * 상태를 가져옵니다
     */
    public getState<T>(key: keyof GlobalState): T | undefined {
        return this.state[key] as T | undefined;
    }

    /**
     * 상태를 설정합니다
     */
    public setState<T>(key: keyof GlobalState, value: T): void {
        this.state[key] = value as any;
        this.saveState();
        console.log(`[StateManager] State updated: ${String(key)}`);
    }

    /**
     * 워크스페이스 상태를 가져옵니다
     */
    public getWorkspaceState<T>(key: string): T | undefined {
        return this.context.workspaceState.get<T>(key);
    }

    /**
     * 워크스페이스 상태를 설정합니다
     */
    public async setWorkspaceState<T>(key: string, value: T): Promise<void> {
        await this.context.workspaceState.update(key, value);
        console.log(`[StateManager] Workspace state updated: ${key}`);
    }

    /**
     * 선택된 모델을 가져옵니다
     */
    public getSelectedModel(): string | undefined {
        return this.getState<string>('selectedModel');
    }

    /**
     * 선택된 모델을 설정합니다
     */
    public setSelectedModel(model: string): void {
        this.setState('selectedModel', model);
    }

    /**
     * Extension 모드를 가져옵니다
     */
    public getExtensionMode(): ExtensionMode | undefined {
        return this.getState<ExtensionMode>('extensionMode');
    }

    /**
     * Extension 모드를 설정합니다
     */
    public setExtensionMode(mode: ExtensionMode): void {
        this.setState('extensionMode', mode);
    }

    /**
     * 자동 명령어 실행 설정을 가져옵니다
     */
    public getAutoExecuteCommands(): boolean {
        return this.getState<boolean>('autoExecuteCommands') ?? false;
    }

    /**
     * 자동 명령어 실행 설정을 설정합니다
     */
    public setAutoExecuteCommands(enabled: boolean): void {
        this.setState('autoExecuteCommands', enabled);
    }

    /**
     * 자동 에러 수정 설정을 가져옵니다
     */
    public getAutoCorrectErrors(): boolean {
        return this.getState<boolean>('autoCorrectErrors') ?? false;
    }

    /**
     * 자동 에러 수정 설정을 설정합니다
     */
    public setAutoCorrectErrors(enabled: boolean): void {
        this.setState('autoCorrectErrors', enabled);
    }

    /**
     * 최근 액션을 추가합니다
     */
    public addRecentAction(action: RecentAction): void {
        const recentActions = this.getState<RecentAction[]>('recentActions') || [];
        recentActions.unshift(action);

        // 최대 50개만 유지
        if (recentActions.length > 50) {
            recentActions.pop();
        }

        this.setState('recentActions', recentActions);
    }

    /**
     * 통계를 업데이트합니다
     */
    public updateStats(updates: Partial<ExtensionStats>): void {
        const currentStats = this.getState<ExtensionStats>('stats') || {
            totalRequests: 0,
            totalTokensUsed: 0,
            totalCommandsExecuted: 0,
            totalFilesModified: 0,
            totalErrors: 0,
            errorsCorrected: 0,
            averageResponseTime: 0,
            lastResetAt: Date.now()
        };

        const newStats: ExtensionStats = {
            ...currentStats,
            ...updates
        };

        this.setState('stats', newStats);
    }

    /**
     * 통계를 가져옵니다
     */
    public getStats(): ExtensionStats | undefined {
        return this.getState<ExtensionStats>('stats');
    }

    /**
     * 통계를 리셋합니다
     */
    public resetStats(): void {
        const stats: ExtensionStats = {
            totalRequests: 0,
            totalTokensUsed: 0,
            totalCommandsExecuted: 0,
            totalFilesModified: 0,
            totalErrors: 0,
            errorsCorrected: 0,
            averageResponseTime: 0,
            lastResetAt: Date.now()
        };

        this.setState('stats', stats);
        console.log('[StateManager] Stats reset');
    }

    /**
     * 상태를 로드합니다
     */
    private loadState(): void {
        try {
            const stored = this.context.globalState.get<GlobalState>('codepilot.globalState');
            if (stored) {
                this.state = stored;
                console.log('[StateManager] State loaded');
            }
        } catch (error) {
            console.error('[StateManager] Failed to load state:', error);
        }
    }

    /**
     * 상태를 저장합니다
     */
    private saveState(): void {
        try {
            this.context.globalState.update('codepilot.globalState', this.state);
        } catch (error) {
            console.error('[StateManager] Failed to save state:', error);
        }
    }

    /**
     * 모든 상태를 가져옵니다
     */
    public getAllState(): GlobalState {
        return { ...this.state };
    }

    /**
     * 상태를 초기화합니다
     */
    public clearState(): void {
        this.state = {};
        this.saveState();
        console.log('[StateManager] State cleared');
    }

    // ===== SecretStorage 관련 메서드들 =====

    /**
     * SecretStorage에 값을 저장합니다
     */
    public async saveSecret(key: string, value: string): Promise<void> {
        await this.context.secrets.store(key, value);
        console.log(`[StateManager] Secret saved: ${key}`);
    }

    /**
     * SecretStorage에서 값을 가져옵니다
     */
    public async getSecret(key: string): Promise<string | undefined> {
        return await this.context.secrets.get(key);
    }

    /**
     * SecretStorage에서 값을 삭제합니다
     */
    public async deleteSecret(key: string): Promise<void> {
        await this.context.secrets.delete(key);
        console.log(`[StateManager] Secret deleted: ${key}`);
    }

    // API 키 및 모델 관련 키
    private readonly API_KEY_SECRET_KEY = 'codepilot.geminiApiKey';
    private readonly CURRENT_AI_MODEL_SECRET_KEY = 'codepilot.currentAiModel';
    private readonly OLLAMA_SERVER_TYPE_SECRET_KEY = 'codepilot.ollamaServerType';
    private readonly OLLAMA_API_URL_SECRET_KEY = 'codepilot.ollamaApiUrl';
    private readonly OLLAMA_ENDPOINT_SECRET_KEY = 'codepilot.ollamaEndpoint';
    private readonly OLLAMA_MODEL_SECRET_KEY = 'codepilot.ollamaModel';
    private readonly LOCAL_OLLAMA_API_URL_SECRET_KEY = 'codepilot.localOllamaApiUrl';
    private readonly LOCAL_OLLAMA_ENDPOINT_SECRET_KEY = 'codepilot.localOllamaEndpoint';
    private readonly REMOTE_OLLAMA_API_URL_SECRET_KEY = 'codepilot.remoteOllamaApiUrl';
    private readonly REMOTE_OLLAMA_ENDPOINT_SECRET_KEY = 'codepilot.remoteOllamaEndpoint';
    private readonly REMOTE_OLLAMA_MODEL_SECRET_KEY = 'codepilot.remoteOllamaModel';
    private readonly LANGUAGE_KEY = 'codepilot.language';
    private readonly AUTO_UPDATE_ENABLED_KEY = 'codepilot.autoUpdateEnabled';
    private readonly ERROR_RETRY_COUNT_KEY = 'codepilot.errorRetryCount';
    private readonly AUTO_CORRECTION_ENABLED_KEY = 'codepilot.autoCorrectionEnabled';

    // 모델 라우팅 관련 키
    private readonly COMPACTOR_MODEL_TYPE_KEY = 'codepilot.compactorModelType';
    private readonly COMPACTOR_MODEL_NAME_KEY = 'codepilot.compactorModelName';
    private readonly COMPACTOR_API_KEY_KEY = 'codepilot.compactorApiKey';
    private readonly COMMAND_MODEL_TYPE_KEY = 'codepilot.commandModelType';
    private readonly COMMAND_MODEL_NAME_KEY = 'codepilot.commandModelName';
    private readonly COMMAND_API_KEY_KEY = 'codepilot.commandApiKey';
    private readonly INTENT_MODEL_TYPE_KEY = 'codepilot.intentModelType';
    private readonly INTENT_MODEL_NAME_KEY = 'codepilot.intentModelName';
    private readonly INTENT_API_KEY_KEY = 'codepilot.intentApiKey';

    /**
     * API Key를 저장합니다
     */
    public async saveApiKey(apiKey: string): Promise<void> {
        await this.saveSecret(this.API_KEY_SECRET_KEY, apiKey);
    }

    /**
     * API Key를 가져옵니다
     */
    public async getApiKey(): Promise<string | undefined> {
        return await this.getSecret(this.API_KEY_SECRET_KEY);
    }

    /**
     * API Key를 삭제합니다
     */
    public async deleteApiKey(): Promise<void> {
        await this.deleteSecret(this.API_KEY_SECRET_KEY);
    }

    /**
     * 현재 AI 모델을 저장합니다
     */
    public async saveCurrentAiModel(model: string): Promise<void> {
        await this.saveSecret(this.CURRENT_AI_MODEL_SECRET_KEY, model);
    }

    /**
     * 현재 AI 모델을 가져옵니다
     */
    public async getCurrentAiModel(): Promise<string | undefined> {
        return await this.getSecret(this.CURRENT_AI_MODEL_SECRET_KEY);
    }

    /**
     * 현재 AI 모델을 삭제합니다
     */
    public async deleteCurrentAiModel(): Promise<void> {
        await this.deleteSecret(this.CURRENT_AI_MODEL_SECRET_KEY);
    }

    // Ollama 관련 메서드들
    public async saveOllamaServerType(serverType: string): Promise<void> {
        await this.saveSecret(this.OLLAMA_SERVER_TYPE_SECRET_KEY, serverType);
    }

    public async getOllamaServerType(): Promise<string> {
        return (await this.getSecret(this.OLLAMA_SERVER_TYPE_SECRET_KEY)) || 'local';
    }

    public async saveOllamaApiUrl(apiUrl: string): Promise<void> {
        await this.saveSecret(this.OLLAMA_API_URL_SECRET_KEY, apiUrl);
    }

    public async getOllamaApiUrl(): Promise<string | undefined> {
        return await this.getSecret(this.OLLAMA_API_URL_SECRET_KEY);
    }

    public async deleteOllamaApiUrl(): Promise<void> {
        await this.deleteSecret(this.OLLAMA_API_URL_SECRET_KEY);
    }

    public async saveOllamaEndpoint(endpoint: string): Promise<void> {
        await this.saveSecret(this.OLLAMA_ENDPOINT_SECRET_KEY, endpoint);
    }

    public async getOllamaEndpoint(): Promise<string> {
        return (await this.getSecret(this.OLLAMA_ENDPOINT_SECRET_KEY)) || '/api/generate';
    }

    public async deleteOllamaEndpoint(): Promise<void> {
        await this.deleteSecret(this.OLLAMA_ENDPOINT_SECRET_KEY);
    }

    public async saveOllamaModel(model: string): Promise<void> {
        await this.saveSecret(this.OLLAMA_MODEL_SECRET_KEY, model);
    }

    public async getOllamaModel(): Promise<string> {
        return (await this.getSecret(this.OLLAMA_MODEL_SECRET_KEY)) || 'gemma3:27b';
    }

    public async deleteOllamaModel(): Promise<void> {
        await this.deleteSecret(this.OLLAMA_MODEL_SECRET_KEY);
    }

    public async saveLocalOllamaApiUrl(apiUrl: string): Promise<void> {
        await this.saveSecret(this.LOCAL_OLLAMA_API_URL_SECRET_KEY, apiUrl);
    }

    public async getLocalOllamaApiUrl(): Promise<string> {
        return (await this.getSecret(this.LOCAL_OLLAMA_API_URL_SECRET_KEY)) || DEFAULT_OLLAMA_URL;
    }

    public async saveLocalOllamaEndpoint(endpoint: string): Promise<void> {
        await this.saveSecret(this.LOCAL_OLLAMA_ENDPOINT_SECRET_KEY, endpoint);
    }

    public async getLocalOllamaEndpoint(): Promise<string> {
        return (await this.getSecret(this.LOCAL_OLLAMA_ENDPOINT_SECRET_KEY)) || '/api/generate';
    }

    public async saveRemoteOllamaApiUrl(apiUrl: string): Promise<void> {
        await this.saveSecret(this.REMOTE_OLLAMA_API_URL_SECRET_KEY, apiUrl);
    }

    public async getRemoteOllamaApiUrl(): Promise<string | null> {
        return (await this.getSecret(this.REMOTE_OLLAMA_API_URL_SECRET_KEY)) || null;
    }

    public async saveRemoteOllamaEndpoint(endpoint: string): Promise<void> {
        await this.saveSecret(this.REMOTE_OLLAMA_ENDPOINT_SECRET_KEY, endpoint);
    }

    public async getRemoteOllamaEndpoint(): Promise<string> {
        return (await this.getSecret(this.REMOTE_OLLAMA_ENDPOINT_SECRET_KEY)) || '/api/generate';
    }

    public async saveRemoteOllamaModel(model: string): Promise<void> {
        await this.saveSecret(this.REMOTE_OLLAMA_MODEL_SECRET_KEY, model);
    }

    public async getRemoteOllamaModel(): Promise<string | null> {
        return (await this.getSecret(this.REMOTE_OLLAMA_MODEL_SECRET_KEY)) || null;
    }

    public async getAiModel(): Promise<string> {
        return (await this.getSecret('codepilot.aiModel')) || 'ollama';
    }

    public async saveAiModel(model: string): Promise<void> {
        await this.saveSecret('codepilot.aiModel', model);
    }

    public async getAdminModelConfig(): Promise<string | undefined> {
        return await this.getSecret('codepilot.adminModelConfig');
    }

    public async saveAdminModelConfig(configJson: string): Promise<void> {
        await this.saveSecret('codepilot.adminModelConfig', configJson);
    }

    // Language
    public async saveLanguage(language: string): Promise<void> {
        await this.context.workspaceState.update(this.LANGUAGE_KEY, language);
    }

    public async getLanguage(): Promise<string | undefined> {
        return this.context.workspaceState.get<string>(this.LANGUAGE_KEY);
    }

    // Auto update enabled
    public async saveAutoUpdateEnabled(enabled: boolean): Promise<void> {
        await this.context.workspaceState.update(this.AUTO_UPDATE_ENABLED_KEY, enabled);
    }

    public async getAutoUpdateEnabled(): Promise<boolean> {
        return this.context.workspaceState.get<boolean>(this.AUTO_UPDATE_ENABLED_KEY) ?? false;
    }

    // Error retry count
    public async saveErrorRetryCount(count: number): Promise<void> {
        await this.context.workspaceState.update(this.ERROR_RETRY_COUNT_KEY, count);
    }

    public async getErrorRetryCount(): Promise<number> {
        return this.context.workspaceState.get<number>(this.ERROR_RETRY_COUNT_KEY) ?? 5;
    }

    // Auto correction enabled
    public async saveAutoCorrectionEnabled(enabled: boolean): Promise<void> {
        await this.context.workspaceState.update(this.AUTO_CORRECTION_ENABLED_KEY, enabled);
    }

    public async getAutoCorrectionEnabled(): Promise<boolean> {
        return this.context.workspaceState.get<boolean>(this.AUTO_CORRECTION_ENABLED_KEY) ?? false;
    }

    // ===== AgentPolicy 관련 메서드들 =====
    private readonly AGENT_POLICY_STABLE_VERSION_KEY = 'codepilot.agentPolicy.stableVersion';
    private readonly AGENT_POLICY_CODING_STYLE_KEY = 'codepilot.agentPolicy.codingStyle';
    private readonly AGENT_POLICY_PROJECT_ARCHITECTURE_KEY = 'codepilot.agentPolicy.projectArchitecture';
    private readonly AGENT_POLICY_DEPENDENCY_POLICY_KEY = 'codepilot.agentPolicy.dependencyPolicy';
    private readonly AGENT_POLICY_DB_POLICY_KEY = 'codepilot.agentPolicy.dbPolicy';

    /**
     * Stable Version Markdown을 저장합니다
     */
    public async saveAgentPolicyStableVersion(mdContent: string): Promise<void> {
        await this.context.workspaceState.update(this.AGENT_POLICY_STABLE_VERSION_KEY, mdContent);
        console.log('[StateManager] AgentPolicy Stable Version saved.');
    }

    /**
     * Stable Version Markdown을 가져옵니다
     */
    public async getAgentPolicyStableVersion(): Promise<string | undefined> {
        return this.context.workspaceState.get<string>(this.AGENT_POLICY_STABLE_VERSION_KEY);
    }

    /**
     * Stable Version Markdown을 삭제합니다
     */
    public async deleteAgentPolicyStableVersion(): Promise<void> {
        await this.context.workspaceState.update(this.AGENT_POLICY_STABLE_VERSION_KEY, undefined);
    }

    /**
     * Coding Style Markdown을 저장합니다
     */
    public async saveAgentPolicyCodingStyle(mdContent: string): Promise<void> {
        await this.context.workspaceState.update(this.AGENT_POLICY_CODING_STYLE_KEY, mdContent);
        console.log('[StateManager] AgentPolicy Coding Style saved.');
    }

    /**
     * Coding Style Markdown을 가져옵니다
     */
    public async getAgentPolicyCodingStyle(): Promise<string | undefined> {
        return this.context.workspaceState.get<string>(this.AGENT_POLICY_CODING_STYLE_KEY);
    }

    /**
     * Coding Style Markdown을 삭제합니다
     */
    public async deleteAgentPolicyCodingStyle(): Promise<void> {
        await this.context.workspaceState.update(this.AGENT_POLICY_CODING_STYLE_KEY, undefined);
    }

    /**
     * Project Architecture Markdown을 저장합니다
     */
    public async saveAgentPolicyProjectArchitecture(mdContent: string): Promise<void> {
        await this.context.workspaceState.update(this.AGENT_POLICY_PROJECT_ARCHITECTURE_KEY, mdContent);
        console.log('[StateManager] AgentPolicy Project Architecture saved.');
    }

    /**
     * Project Architecture Markdown을 가져옵니다
     */
    public async getAgentPolicyProjectArchitecture(): Promise<string | undefined> {
        return this.context.workspaceState.get<string>(this.AGENT_POLICY_PROJECT_ARCHITECTURE_KEY);
    }

    /**
     * Project Architecture Markdown을 삭제합니다
     */
    public async deleteAgentPolicyProjectArchitecture(): Promise<void> {
        await this.context.workspaceState.update(this.AGENT_POLICY_PROJECT_ARCHITECTURE_KEY, undefined);
    }

    /**
     * Dependency Policy Markdown을 저장합니다
     */
    public async saveAgentPolicyDependencyPolicy(mdContent: string): Promise<void> {
        await this.context.workspaceState.update(this.AGENT_POLICY_DEPENDENCY_POLICY_KEY, mdContent);
        console.log('[StateManager] AgentPolicy Dependency Policy saved.');
    }

    /**
     * Dependency Policy Markdown을 가져옵니다
     */
    public async getAgentPolicyDependencyPolicy(): Promise<string | undefined> {
        return this.context.workspaceState.get<string>(this.AGENT_POLICY_DEPENDENCY_POLICY_KEY);
    }

    /**
     * Dependency Policy Markdown을 삭제합니다
     */
    public async deleteAgentPolicyDependencyPolicy(): Promise<void> {
        await this.context.workspaceState.update(this.AGENT_POLICY_DEPENDENCY_POLICY_KEY, undefined);
    }

    /**
     * DB Policy Markdown을 저장합니다
     */
    public async saveAgentPolicyDbPolicy(mdContent: string): Promise<void> {
        await this.context.workspaceState.update(this.AGENT_POLICY_DB_POLICY_KEY, mdContent);
        console.log('[StateManager] AgentPolicy DB Policy saved.');
    }

    /**
     * DB Policy Markdown을 가져옵니다
     */
    public async getAgentPolicyDbPolicy(): Promise<string | undefined> {
        return this.context.workspaceState.get<string>(this.AGENT_POLICY_DB_POLICY_KEY);
    }

    /**
     * DB Policy Markdown을 삭제합니다
     */
    public async deleteAgentPolicyDbPolicy(): Promise<void> {
        await this.context.workspaceState.update(this.AGENT_POLICY_DB_POLICY_KEY, undefined);
    }

    // ===== 모델 라우팅 관련 메서드들 =====

    /**
     * Compactor 모델 타입을 저장합니다 (ollama, admin 등)
     */
    public async saveCompactorModelType(modelType: string): Promise<void> {
        await this.saveSecret(this.COMPACTOR_MODEL_TYPE_KEY, modelType);
        console.log('[StateManager] Compactor model type saved:', modelType);
    }

    /**
     * Compactor 모델 타입을 가져옵니다 (설정되지 않으면 undefined 반환 - 메인 모델 사용)
     */
    public async getCompactorModelType(): Promise<string | undefined> {
        return await this.getSecret(this.COMPACTOR_MODEL_TYPE_KEY);
    }

    /**
     * Compactor 모델 타입을 삭제합니다
     */
    public async deleteCompactorModelType(): Promise<void> {
        await this.deleteSecret(this.COMPACTOR_MODEL_TYPE_KEY);
    }

    /**
     * Compactor 모델 이름을 저장합니다 (llama3 등)
     */
    public async saveCompactorModelName(modelName: string): Promise<void> {
        await this.saveSecret(this.COMPACTOR_MODEL_NAME_KEY, modelName);
        console.log('[StateManager] Compactor model name saved:', modelName);
    }

    /**
     * Compactor 모델 이름을 가져옵니다
     */
    public async getCompactorModelName(): Promise<string | undefined> {
        return await this.getSecret(this.COMPACTOR_MODEL_NAME_KEY);
    }

    /**
     * Compactor 모델 이름을 삭제합니다
     */
    public async deleteCompactorModelName(): Promise<void> {
        await this.deleteSecret(this.COMPACTOR_MODEL_NAME_KEY);
    }

    /**
     * Command 모델 타입을 저장합니다 (ollama, admin 등)
     */
    public async saveCommandModelType(modelType: string): Promise<void> {
        await this.saveSecret(this.COMMAND_MODEL_TYPE_KEY, modelType);
        console.log('[StateManager] Command model type saved:', modelType);
    }

    /**
     * Command 모델 타입을 가져옵니다 (설정되지 않으면 undefined 반환 - 메인 모델 사용)
     */
    public async getCommandModelType(): Promise<string | undefined> {
        return await this.getSecret(this.COMMAND_MODEL_TYPE_KEY);
    }

    /**
     * Command 모델 타입을 삭제합니다
     */
    public async deleteCommandModelType(): Promise<void> {
        await this.deleteSecret(this.COMMAND_MODEL_TYPE_KEY);
    }

    /**
     * Command 모델 이름을 저장합니다 (llama3 등)
     */
    public async saveCommandModelName(modelName: string): Promise<void> {
        await this.saveSecret(this.COMMAND_MODEL_NAME_KEY, modelName);
        console.log('[StateManager] Command model name saved:', modelName);
    }

    /**
     * Command 모델 이름을 가져옵니다
     */
    public async getCommandModelName(): Promise<string | undefined> {
        return await this.getSecret(this.COMMAND_MODEL_NAME_KEY);
    }

    /**
     * Command 모델 이름을 삭제합니다
     */
    public async deleteCommandModelName(): Promise<void> {
        await this.deleteSecret(this.COMMAND_MODEL_NAME_KEY);
    }

    /**
     * Compactor 모델 설정을 한 번에 가져옵니다
     * @returns { type: string | undefined, name: string | undefined }
     */
    public async getCompactorModelConfig(): Promise<{ type: string | undefined; name: string | undefined }> {
        const [type, name] = await Promise.all([
            this.getCompactorModelType(),
            this.getCompactorModelName()
        ]);
        return { type, name };
    }

    /**
     * Command 모델 설정을 한 번에 가져옵니다
     * @returns { type: string | undefined, name: string | undefined }
     */
    public async getCommandModelConfig(): Promise<{ type: string | undefined; name: string | undefined }> {
        const [type, name] = await Promise.all([
            this.getCommandModelType(),
            this.getCommandModelName()
        ]);
        return { type, name };
    }

    /**
     * Compactor 모델 설정을 한 번에 저장합니다
     */
    public async saveCompactorModelConfig(type: string, name: string): Promise<void> {
        await Promise.all([
            this.saveCompactorModelType(type),
            this.saveCompactorModelName(name)
        ]);
    }

    /**
     * Command 모델 설정을 한 번에 저장합니다
     */
    public async saveCommandModelConfig(type: string, name: string): Promise<void> {
        await Promise.all([
            this.saveCommandModelType(type),
            this.saveCommandModelName(name)
        ]);
    }

    /**
     * Compactor 모델 설정을 초기화합니다 (메인 모델 사용으로 되돌림)
     */
    public async clearCompactorModelConfig(): Promise<void> {
        await Promise.all([
            this.deleteCompactorModelType(),
            this.deleteCompactorModelName()
        ]);
        console.log('[StateManager] Compactor model config cleared (will use main model)');
    }

    /**
     * Command 모델 설정을 초기화합니다 (메인 모델 사용으로 되돌림)
     */
    public async clearCommandModelConfig(): Promise<void> {
        await Promise.all([
            this.deleteCommandModelType(),
            this.deleteCommandModelName()
        ]);
        console.log('[StateManager] Command model config cleared (will use main model)');
    }

    // ===== Compactor/Command API 키 관련 메서드들 =====

    /**
     * Compactor API 키를 저장합니다
     */
    public async saveCompactorApiKey(apiKey: string): Promise<void> {
        await this.saveSecret(this.COMPACTOR_API_KEY_KEY, apiKey);
        console.log('[StateManager] Compactor API key saved');
    }

    /**
     * Compactor API 키를 가져옵니다
     */
    public async getCompactorApiKey(): Promise<string | undefined> {
        return await this.getSecret(this.COMPACTOR_API_KEY_KEY);
    }

    /**
     * Compactor API 키를 삭제합니다
     */
    public async deleteCompactorApiKey(): Promise<void> {
        await this.deleteSecret(this.COMPACTOR_API_KEY_KEY);
        console.log('[StateManager] Compactor API key deleted');
    }

    /**
     * Command API 키를 저장합니다
     */
    public async saveCommandApiKey(apiKey: string): Promise<void> {
        await this.saveSecret(this.COMMAND_API_KEY_KEY, apiKey);
        console.log('[StateManager] Command API key saved');
    }

    /**
     * Command API 키를 가져옵니다
     */
    public async getCommandApiKey(): Promise<string | undefined> {
        return await this.getSecret(this.COMMAND_API_KEY_KEY);
    }

    /**
     * Command API 키를 삭제합니다
     */
    public async deleteCommandApiKey(): Promise<void> {
        await this.deleteSecret(this.COMMAND_API_KEY_KEY);
        console.log('[StateManager] Command API key deleted');
    }

    /**
     * Compactor API 키가 설정되어 있는지 확인합니다
     */
    public async hasCompactorApiKey(): Promise<boolean> {
        const key = await this.getCompactorApiKey();
        return !!key;
    }

    /**
     * Command API 키가 설정되어 있는지 확인합니다
     */
    public async hasCommandApiKey(): Promise<boolean> {
        const key = await this.getCommandApiKey();
        return !!key;
    }

    // ===== Intent 모델 관련 메서드들 =====

    /**
     * Intent 모델 타입을 저장합니다 (ollama, admin 등)
     */
    public async saveIntentModelType(modelType: string): Promise<void> {
        await this.saveSecret(this.INTENT_MODEL_TYPE_KEY, modelType);
        console.log('[StateManager] Intent model type saved:', modelType);
    }

    /**
     * Intent 모델 타입을 가져옵니다 (설정되지 않으면 undefined 반환 - 메인 모델 사용)
     */
    public async getIntentModelType(): Promise<string | undefined> {
        return await this.getSecret(this.INTENT_MODEL_TYPE_KEY);
    }

    /**
     * Intent 모델 타입을 삭제합니다
     */
    public async deleteIntentModelType(): Promise<void> {
        await this.deleteSecret(this.INTENT_MODEL_TYPE_KEY);
    }

    /**
     * Intent 모델 이름을 저장합니다
     */
    public async saveIntentModelName(modelName: string): Promise<void> {
        await this.saveSecret(this.INTENT_MODEL_NAME_KEY, modelName);
        console.log('[StateManager] Intent model name saved:', modelName);
    }

    /**
     * Intent 모델 이름을 가져옵니다
     */
    public async getIntentModelName(): Promise<string | undefined> {
        return await this.getSecret(this.INTENT_MODEL_NAME_KEY);
    }

    /**
     * Intent 모델 이름을 삭제합니다
     */
    public async deleteIntentModelName(): Promise<void> {
        await this.deleteSecret(this.INTENT_MODEL_NAME_KEY);
    }

    /**
     * Intent API 키를 저장합니다
     */
    public async saveIntentApiKey(apiKey: string): Promise<void> {
        await this.saveSecret(this.INTENT_API_KEY_KEY, apiKey);
        console.log('[StateManager] Intent API key saved');
    }

    /**
     * Intent API 키를 가져옵니다
     */
    public async getIntentApiKey(): Promise<string | undefined> {
        return await this.getSecret(this.INTENT_API_KEY_KEY);
    }

    /**
     * Intent API 키를 삭제합니다
     */
    public async deleteIntentApiKey(): Promise<void> {
        await this.deleteSecret(this.INTENT_API_KEY_KEY);
        console.log('[StateManager] Intent API key deleted');
    }

    /**
     * Intent API 키가 설정되어 있는지 확인합니다
     */
    public async hasIntentApiKey(): Promise<boolean> {
        const key = await this.getIntentApiKey();
        return !!key;
    }

    /**
     * Intent 모델 설정을 한 번에 가져옵니다
     */
    public async getIntentModelConfig(): Promise<{ type: string | undefined; name: string | undefined }> {
        const [type, name] = await Promise.all([
            this.getIntentModelType(),
            this.getIntentModelName()
        ]);
        return { type, name };
    }

    /**
     * Intent 모델 설정을 한 번에 저장합니다
     */
    public async saveIntentModelConfig(type: string, name: string): Promise<void> {
        await Promise.all([
            this.saveIntentModelType(type),
            this.saveIntentModelName(name)
        ]);
    }

    /**
     * Intent 모델 설정을 초기화합니다 (메인 모델 사용으로 되돌림)
     */
    public async clearIntentModelConfig(): Promise<void> {
        await Promise.all([
            this.deleteIntentModelType(),
            this.deleteIntentModelName(),
            this.deleteIntentApiKey()
        ]);
        console.log('[StateManager] Intent model config cleared (will use main model)');
    }

    // ===== MCP 서버 관련 메서드들 =====
    private readonly MCP_SERVERS_KEY = 'codepilot.mcpServers';
    private readonly MCP_APPROVED_TOOLS_KEY = 'codepilot.mcpApprovedTools';

    /**
     * MCP 서버 목록을 저장합니다
     */
    public async saveMcpServers(servers: any[]): Promise<void> {
        await this.context.workspaceState.update(this.MCP_SERVERS_KEY, servers);
        console.log('[StateManager] MCP servers saved:', servers.length);
    }

    /**
     * MCP 서버 목록을 가져옵니다
     */
    public async getMcpServers(): Promise<any[]> {
        return this.context.workspaceState.get<any[]>(this.MCP_SERVERS_KEY) ?? [];
    }

    /**
     * MCP 서버를 추가합니다
     */
    public async addMcpServer(server: any): Promise<void> {
        const servers = await this.getMcpServers();
        servers.push(server);
        await this.saveMcpServers(servers);
    }

    /**
     * MCP 서버를 삭제합니다
     */
    public async removeMcpServer(serverId: string): Promise<boolean> {
        const servers = await this.getMcpServers();
        const index = servers.findIndex(s => s.id === serverId);
        if (index !== -1) {
            servers.splice(index, 1);
            await this.saveMcpServers(servers);
            return true;
        }
        return false;
    }

    /**
     * MCP 서버를 업데이트합니다
     */
    public async updateMcpServer(serverId: string, updates: Partial<any>): Promise<boolean> {
        const servers = await this.getMcpServers();
        const index = servers.findIndex(s => s.id === serverId);
        if (index !== -1) {
            servers[index] = { ...servers[index], ...updates };
            await this.saveMcpServers(servers);
            return true;
        }
        return false;
    }

    /**
     * 승인된 MCP 도구 목록을 저장합니다
     */
    public async saveMcpApprovedTools(approvedTools: any[]): Promise<void> {
        await this.context.workspaceState.update(this.MCP_APPROVED_TOOLS_KEY, approvedTools);
        console.log('[StateManager] MCP approved tools saved:', approvedTools.length);
    }

    /**
     * 승인된 MCP 도구 목록을 가져옵니다
     */
    public async getMcpApprovedTools(): Promise<any[]> {
        return this.context.workspaceState.get<any[]>(this.MCP_APPROVED_TOOLS_KEY) ?? [];
    }

    /**
     * MCP 도구 승인 여부를 확인합니다
     */
    public async isMcpToolApproved(serverId: string, toolName: string): Promise<boolean> {
        const approvedTools = await this.getMcpApprovedTools();
        return approvedTools.some(t => t.serverId === serverId && t.toolName === toolName);
    }

    /**
     * MCP 도구를 승인 목록에 추가합니다
     */
    public async approveMcpTool(serverId: string, toolName: string): Promise<void> {
        const approvedTools = await this.getMcpApprovedTools();
        if (!approvedTools.some(t => t.serverId === serverId && t.toolName === toolName)) {
            approvedTools.push({
                serverId,
                toolName,
                approvedAt: Date.now()
            });
            await this.saveMcpApprovedTools(approvedTools);
            console.log('[StateManager] MCP tool approved:', serverId, toolName);
        }
    }

    /**
     * MCP 도구 승인을 취소합니다
     */
    public async revokeMcpToolApproval(serverId: string, toolName: string): Promise<void> {
        const approvedTools = await this.getMcpApprovedTools();
        const filtered = approvedTools.filter(t => !(t.serverId === serverId && t.toolName === toolName));
        await this.saveMcpApprovedTools(filtered);
    }

    /**
     * 특정 서버의 모든 도구 승인을 취소합니다
     */
    public async revokeAllMcpToolsForServer(serverId: string): Promise<void> {
        const approvedTools = await this.getMcpApprovedTools();
        const filtered = approvedTools.filter(t => t.serverId !== serverId);
        await this.saveMcpApprovedTools(filtered);
    }
}
