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
import { CryptoUtils } from '../../../utils';

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
    private readonly BANYA_LICENSE_SERIAL_SECRET_KEY = 'codepilot.banyaLicenseSerial';
    private readonly BANYA_API_KEY_SECRET_KEY = 'codepilot.banyaApiKey';
    private readonly OLLAMA_SERVER_TYPE_SECRET_KEY = 'codepilot.ollamaServerType';
    private readonly OLLAMA_API_URL_SECRET_KEY = 'codepilot.ollamaApiUrl';
    private readonly OLLAMA_ENDPOINT_SECRET_KEY = 'codepilot.ollamaEndpoint';
    private readonly OLLAMA_MODEL_SECRET_KEY = 'codepilot.ollamaModel';
    private readonly LOCAL_OLLAMA_API_URL_SECRET_KEY = 'codepilot.localOllamaApiUrl';
    private readonly LOCAL_OLLAMA_ENDPOINT_SECRET_KEY = 'codepilot.localOllamaEndpoint';
    private readonly REMOTE_OLLAMA_API_URL_SECRET_KEY = 'codepilot.remoteOllamaApiUrl';
    private readonly REMOTE_OLLAMA_ENDPOINT_SECRET_KEY = 'codepilot.remoteOllamaEndpoint';
    private readonly REMOTE_OLLAMA_MODEL_SECRET_KEY = 'codepilot.remoteOllamaModel';
    private readonly IS_LICENSE_VERIFIED_KEY = 'codepilot.isLicenseVerified';
    private readonly LANGUAGE_KEY = 'codepilot.language';
    private readonly AUTO_UPDATE_ENABLED_KEY = 'codepilot.autoUpdateEnabled';
    private readonly OUTPUT_LOG_ENABLED_KEY = 'codepilot.outputLogEnabled';
    private readonly ERROR_RETRY_COUNT_KEY = 'codepilot.errorRetryCount';
    private readonly AUTO_CORRECTION_ENABLED_KEY = 'codepilot.autoCorrectionEnabled';

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

    /**
     * Banya 라이센스 시리얼을 암호화하여 저장합니다
     */
    public async saveBanyaLicenseSerial(licenseSerial: string): Promise<void> {
        const encryptedSerial = CryptoUtils.encrypt(licenseSerial);
        await this.saveSecret(this.BANYA_LICENSE_SERIAL_SECRET_KEY, encryptedSerial);
        console.log('[StateManager] Banya license serial encrypted and saved.');
    }

    /**
     * Banya 라이센스 시리얼을 복호화하여 가져옵니다
     */
    public async getBanyaLicenseSerial(): Promise<string | undefined> {
        const encryptedSerial = await this.getSecret(this.BANYA_LICENSE_SERIAL_SECRET_KEY);
        if (encryptedSerial) {
            try {
                if (CryptoUtils.isEncrypted(encryptedSerial)) {
                    return CryptoUtils.decrypt(encryptedSerial);
                }
                return encryptedSerial;
            } catch (error) {
                console.error('[StateManager] Decrypt error:', error);
                return undefined;
            }
        }
        return undefined;
    }

    /**
     * Banya 라이센스 시리얼을 삭제합니다
     */
    public async deleteBanyaLicenseSerial(): Promise<void> {
        await this.deleteSecret(this.BANYA_LICENSE_SERIAL_SECRET_KEY);
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
        return (await this.getSecret(this.LOCAL_OLLAMA_API_URL_SECRET_KEY)) || 'http://localhost:11434';
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

    public async getGeminiModel(): Promise<string> {
        return (await this.getSecret('codepilot.geminiModel')) || 'gemini-3-pro-preview';
    }

    public async saveGeminiModel(model: string): Promise<void> {
        await this.saveSecret('codepilot.geminiModel', model);
    }

    public async getBanyaApiKey(): Promise<string | undefined> {
        return await this.getSecret(this.BANYA_API_KEY_SECRET_KEY);
    }

    public async saveBanyaApiKey(apiKey: string): Promise<void> {
        await this.saveSecret(this.BANYA_API_KEY_SECRET_KEY, apiKey);
    }

    public async deleteBanyaApiKey(): Promise<void> {
        await this.deleteSecret(this.BANYA_API_KEY_SECRET_KEY);
    }

    public async getBanyaModel(): Promise<string> {
        return (await this.getSecret('codepilot.banyaModel')) || 'Banya-Solar:100b';
    }

    public async saveBanyaModel(model: string): Promise<void> {
        await this.saveSecret('codepilot.banyaModel', model);
    }

    // License verified flag
    public async saveIsLicenseVerified(value: boolean): Promise<void> {
        await this.context.workspaceState.update(this.IS_LICENSE_VERIFIED_KEY, value);
    }

    public async getIsLicenseVerified(): Promise<boolean> {
        return this.context.workspaceState.get<boolean>(this.IS_LICENSE_VERIFIED_KEY) ?? false;
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

    // Output log enabled
    public async saveOutputLogEnabled(enabled: boolean): Promise<void> {
        await this.context.workspaceState.update(this.OUTPUT_LOG_ENABLED_KEY, enabled);
    }

    public async getOutputLogEnabled(): Promise<boolean> {
        return this.context.workspaceState.get<boolean>(this.OUTPUT_LOG_ENABLED_KEY) ?? false;
    }

    // Error retry count
    public async saveErrorRetryCount(count: number): Promise<void> {
        await this.context.workspaceState.update(this.ERROR_RETRY_COUNT_KEY, count);
    }

    public async getErrorRetryCount(): Promise<number> {
        return this.context.workspaceState.get<number>(this.ERROR_RETRY_COUNT_KEY) ?? 3;
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
}
