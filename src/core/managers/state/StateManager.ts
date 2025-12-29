/**
 * State Manager
 * 전역 상태를 관리하는 클래스
 */

import * as vscode from 'vscode';
console.log('[StateManager] Module loading...');
import {
    GlobalState,
    ExtensionMode,
    ModelSettings,
    ExtensionStats,
    RecentAction
} from './types';
import { CryptoUtils } from '../../../utils';
import { BaseManager } from '../base/BaseManager';

// @ts-ignore - BaseManager 상속 타입 호환성
export class StateManager extends BaseManager {
    // @ts-ignore - BaseManager 상속 타입 호환성
    private state: GlobalState = {};
    private _context: vscode.ExtensionContext;

    private constructor(context: vscode.ExtensionContext) {
        super(context);
        this._context = context;
        this.loadState();
    }

    public static getInstance(context?: vscode.ExtensionContext): StateManager {
        if (!context) {
            throw new Error('StateManager requires ExtensionContext');
        }
        return BaseManager.getInstance.call(StateManager as any, context) as unknown as StateManager;
    }

    public override get context(): vscode.ExtensionContext {
        return this._context!;
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
            const stored = this.context.globalState.get<GlobalState>('aidevIde.globalState');
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
            this.context.globalState.update('aidevIde.globalState', this.state);
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

    // ===== SecretStorage 관련 메서드들 (StorageService 호환) =====

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

    // StorageService 호환 메서드들 (API 키 관련)
    private readonly API_KEY_SECRET_KEY = 'aidev-ide.geminiApiKey';
    private readonly CURRENT_AI_MODEL_SECRET_KEY = 'aidev-ide.currentAiModel';
    private readonly BANYA_LICENSE_SERIAL_SECRET_KEY = 'aidev-ide.banyaLicenseSerial';
    private readonly OLLAMA_SERVER_TYPE_SECRET_KEY = 'aidev-ide.ollamaServerType';
    private readonly OLLAMA_API_URL_SECRET_KEY = 'aidev-ide.ollamaApiUrl';
    private readonly OLLAMA_ENDPOINT_SECRET_KEY = 'aidev-ide.ollamaEndpoint';
    private readonly OLLAMA_MODEL_SECRET_KEY = 'aidev-ide.ollamaModel';
    private readonly LOCAL_OLLAMA_API_URL_SECRET_KEY = 'aidev-ide.localOllamaApiUrl';
    private readonly LOCAL_OLLAMA_ENDPOINT_SECRET_KEY = 'aidev-ide.localOllamaEndpoint';
    private readonly REMOTE_OLLAMA_API_URL_SECRET_KEY = 'aidev-ide.remoteOllamaApiUrl';
    private readonly REMOTE_OLLAMA_ENDPOINT_SECRET_KEY = 'aidev-ide.remoteOllamaEndpoint';
    private readonly REMOTE_OLLAMA_MODEL_SECRET_KEY = 'aidev-ide.remoteOllamaModel';
    private readonly NEWS_API_KEY_SECRET_KEY = 'aidev-ide.newsApiKey';
    private readonly NEWS_API_SECRET_SECRET_KEY = 'aidev-ide.newsApiSecret';
    private readonly IS_LICENSE_VERIFIED_KEY = 'aidev-ide.isLicenseVerified';
    private readonly LANGUAGE_KEY = 'aidev-ide.language';
    private readonly AUTO_UPDATE_ENABLED_KEY = 'aidev-ide.autoUpdateEnabled';
    private readonly OUTPUT_LOG_ENABLED_KEY = 'aidev-ide.outputLogEnabled';
    private readonly ERROR_RETRY_COUNT_KEY = 'aidev-ide.errorRetryCount';
    private readonly AUTO_CORRECTION_ENABLED_KEY = 'aidev-ide.autoCorrectionEnabled';

    /**
     * API Key를 저장합니다 (StorageService 호환)
     */
    public async saveApiKey(apiKey: string): Promise<void> {
        await this.saveSecret(this.API_KEY_SECRET_KEY, apiKey);
    }

    /**
     * API Key를 가져옵니다 (StorageService 호환)
     */
    public async getApiKey(): Promise<string | undefined> {
        return await this.getSecret(this.API_KEY_SECRET_KEY);
    }

    /**
     * API Key를 삭제합니다 (StorageService 호환)
     */
    public async deleteApiKey(): Promise<void> {
        await this.deleteSecret(this.API_KEY_SECRET_KEY);
    }

    /**
     * 현재 AI 모델을 저장합니다 (StorageService 호환)
     */
    public async saveCurrentAiModel(model: string): Promise<void> {
        await this.saveSecret(this.CURRENT_AI_MODEL_SECRET_KEY, model);
    }

    /**
     * 현재 AI 모델을 가져옵니다 (StorageService 호환)
     */
    public async getCurrentAiModel(): Promise<string | undefined> {
        return await this.getSecret(this.CURRENT_AI_MODEL_SECRET_KEY);
    }

    /**
     * 현재 AI 모델을 삭제합니다 (StorageService 호환)
     */
    public async deleteCurrentAiModel(): Promise<void> {
        await this.deleteSecret(this.CURRENT_AI_MODEL_SECRET_KEY);
    }

    /**
     * Banya 라이센스 시리얼을 암호화하여 저장합니다 (StorageService 호환)
     */
    public async saveBanyaLicenseSerial(licenseSerial: string): Promise<void> {
        const encryptedSerial = CryptoUtils.encrypt(licenseSerial);
        await this.saveSecret(this.BANYA_LICENSE_SERIAL_SECRET_KEY, encryptedSerial);
        console.log('[StateManager] Banya license serial encrypted and saved to SecretStorage.');
    }

    /**
     * Banya 라이센스 시리얼을 복호화하여 가져옵니다 (StorageService 호환)
     */
    public async getBanyaLicenseSerial(): Promise<string | undefined> {
        const encryptedSerial = await this.getSecret(this.BANYA_LICENSE_SERIAL_SECRET_KEY);
        if (encryptedSerial) {
            try {
                // 암호화된 형식인지 확인
                if (CryptoUtils.isEncrypted(encryptedSerial)) {
                    const decryptedSerial = CryptoUtils.decrypt(encryptedSerial);
                    return decryptedSerial;
                } else {
                    // 기존 암호화되지 않은 형식인 경우 그대로 반환 (하위 호환성)
                    console.log('[StateManager] Banya license serial loaded from SecretStorage (legacy format).');
                    return encryptedSerial;
                }
            } catch (error) {
                console.error('[StateManager] 라이센스 시리얼 복호화 중 오류 발생:', error);
                return undefined;
            }
        } else {
            console.log('[StateManager] No Banya license serial found in SecretStorage.');
            return undefined;
        }
    }

    /**
     * Banya 라이센스 시리얼을 삭제합니다 (StorageService 호환)
     */
    public async deleteBanyaLicenseSerial(): Promise<void> {
        await this.deleteSecret(this.BANYA_LICENSE_SERIAL_SECRET_KEY);
    }

    // Ollama 관련 메서드들 (StorageService 호환)
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

    // 기타 StorageService 호환 메서드들
    public async getAiModel(): Promise<string> {
        return (await this.getSecret('aidev-ide.aiModel')) || 'gemini';
    }

    public async saveAiModel(model: string): Promise<void> {
        await this.saveSecret('aidev-ide.aiModel', model);
    }

    public async getPlanningModel(): Promise<string | undefined> {
        return await this.getSecret('aidev-ide.planningModel');
    }

    public async savePlanningModel(model: string): Promise<void> {
        await this.saveSecret('aidev-ide.planningModel', model);
    }

    // News API key
    public async saveNewsApiKey(apiKey: string): Promise<void> {
        await this.saveSecret(this.NEWS_API_KEY_SECRET_KEY, apiKey);
    }

    public async getNewsApiKey(): Promise<string | undefined> {
        return await this.getSecret(this.NEWS_API_KEY_SECRET_KEY);
    }

    // News API secret
    public async saveNewsApiSecret(secret: string): Promise<void> {
        await this.saveSecret(this.NEWS_API_SECRET_SECRET_KEY, secret);
    }

    public async getNewsApiSecret(): Promise<string | undefined> {
        return await this.getSecret(this.NEWS_API_SECRET_SECRET_KEY);
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
}

