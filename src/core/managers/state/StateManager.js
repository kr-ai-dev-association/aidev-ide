/**
 * State Manager
 * 전역 상태를 관리하는 클래스
 */
import { CryptoUtils } from '../../../utils';
export class StateManager {
    static instance;
    state = {};
    _context;
    constructor(context) {
        this._context = context;
        this.loadState();
    }
    static getInstance(context) {
        if (!StateManager.instance) {
            if (!context) {
                throw new Error('StateManager requires ExtensionContext for first initialization');
            }
            StateManager.instance = new StateManager(context);
        }
        return StateManager.instance;
    }
    get context() {
        return this._context;
    }
    /**
     * 상태를 가져옵니다
     */
    getState(key) {
        return this.state[key];
    }
    /**
     * 상태를 설정합니다
     */
    setState(key, value) {
        this.state[key] = value;
        this.saveState();
        console.log(`[StateManager] State updated: ${String(key)}`);
    }
    /**
     * 워크스페이스 상태를 가져옵니다
     */
    getWorkspaceState(key) {
        return this.context.workspaceState.get(key);
    }
    /**
     * 워크스페이스 상태를 설정합니다
     */
    async setWorkspaceState(key, value) {
        await this.context.workspaceState.update(key, value);
        console.log(`[StateManager] Workspace state updated: ${key}`);
    }
    /**
     * 선택된 모델을 가져옵니다
     */
    getSelectedModel() {
        return this.getState('selectedModel');
    }
    /**
     * 선택된 모델을 설정합니다
     */
    setSelectedModel(model) {
        this.setState('selectedModel', model);
    }
    /**
     * Extension 모드를 가져옵니다
     */
    getExtensionMode() {
        return this.getState('extensionMode');
    }
    /**
     * Extension 모드를 설정합니다
     */
    setExtensionMode(mode) {
        this.setState('extensionMode', mode);
    }
    /**
     * 자동 명령어 실행 설정을 가져옵니다
     */
    getAutoExecuteCommands() {
        return this.getState('autoExecuteCommands') ?? false;
    }
    /**
     * 자동 명령어 실행 설정을 설정합니다
     */
    setAutoExecuteCommands(enabled) {
        this.setState('autoExecuteCommands', enabled);
    }
    /**
     * 자동 에러 수정 설정을 가져옵니다
     */
    getAutoCorrectErrors() {
        return this.getState('autoCorrectErrors') ?? false;
    }
    /**
     * 자동 에러 수정 설정을 설정합니다
     */
    setAutoCorrectErrors(enabled) {
        this.setState('autoCorrectErrors', enabled);
    }
    /**
     * 최근 액션을 추가합니다
     */
    addRecentAction(action) {
        const recentActions = this.getState('recentActions') || [];
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
    updateStats(updates) {
        const currentStats = this.getState('stats') || {
            totalRequests: 0,
            totalTokensUsed: 0,
            totalCommandsExecuted: 0,
            totalFilesModified: 0,
            totalErrors: 0,
            errorsCorrected: 0,
            averageResponseTime: 0,
            lastResetAt: Date.now()
        };
        const newStats = {
            ...currentStats,
            ...updates
        };
        this.setState('stats', newStats);
    }
    /**
     * 통계를 가져옵니다
     */
    getStats() {
        return this.getState('stats');
    }
    /**
     * 통계를 리셋합니다
     */
    resetStats() {
        const stats = {
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
    loadState() {
        try {
            const stored = this.context.globalState.get('codepilot.globalState');
            if (stored) {
                this.state = stored;
                console.log('[StateManager] State loaded');
            }
        }
        catch (error) {
            console.error('[StateManager] Failed to load state:', error);
        }
    }
    /**
     * 상태를 저장합니다
     */
    saveState() {
        try {
            this.context.globalState.update('codepilot.globalState', this.state);
        }
        catch (error) {
            console.error('[StateManager] Failed to save state:', error);
        }
    }
    /**
     * 모든 상태를 가져옵니다
     */
    getAllState() {
        return { ...this.state };
    }
    /**
     * 상태를 초기화합니다
     */
    clearState() {
        this.state = {};
        this.saveState();
        console.log('[StateManager] State cleared');
    }
    // ===== SecretStorage 관련 메서드들 =====
    /**
     * SecretStorage에 값을 저장합니다
     */
    async saveSecret(key, value) {
        await this.context.secrets.store(key, value);
        console.log(`[StateManager] Secret saved: ${key}`);
    }
    /**
     * SecretStorage에서 값을 가져옵니다
     */
    async getSecret(key) {
        return await this.context.secrets.get(key);
    }
    /**
     * SecretStorage에서 값을 삭제합니다
     */
    async deleteSecret(key) {
        await this.context.secrets.delete(key);
        console.log(`[StateManager] Secret deleted: ${key}`);
    }
    // API 키 및 모델 관련 키
    API_KEY_SECRET_KEY = 'codepilot.geminiApiKey';
    CURRENT_AI_MODEL_SECRET_KEY = 'codepilot.currentAiModel';
    BANYA_LICENSE_SERIAL_SECRET_KEY = 'codepilot.banyaLicenseSerial';
    BANYA_API_KEY_SECRET_KEY = 'codepilot.banyaApiKey';
    OLLAMA_SERVER_TYPE_SECRET_KEY = 'codepilot.ollamaServerType';
    OLLAMA_API_URL_SECRET_KEY = 'codepilot.ollamaApiUrl';
    OLLAMA_ENDPOINT_SECRET_KEY = 'codepilot.ollamaEndpoint';
    OLLAMA_MODEL_SECRET_KEY = 'codepilot.ollamaModel';
    LOCAL_OLLAMA_API_URL_SECRET_KEY = 'codepilot.localOllamaApiUrl';
    LOCAL_OLLAMA_ENDPOINT_SECRET_KEY = 'codepilot.localOllamaEndpoint';
    REMOTE_OLLAMA_API_URL_SECRET_KEY = 'codepilot.remoteOllamaApiUrl';
    REMOTE_OLLAMA_ENDPOINT_SECRET_KEY = 'codepilot.remoteOllamaEndpoint';
    REMOTE_OLLAMA_MODEL_SECRET_KEY = 'codepilot.remoteOllamaModel';
    IS_LICENSE_VERIFIED_KEY = 'codepilot.isLicenseVerified';
    LANGUAGE_KEY = 'codepilot.language';
    AUTO_UPDATE_ENABLED_KEY = 'codepilot.autoUpdateEnabled';
    ERROR_RETRY_COUNT_KEY = 'codepilot.errorRetryCount';
    AUTO_CORRECTION_ENABLED_KEY = 'codepilot.autoCorrectionEnabled';
    // 모델 라우팅 관련 키
    COMPACTOR_MODEL_TYPE_KEY = 'codepilot.compactorModelType';
    COMPACTOR_MODEL_NAME_KEY = 'codepilot.compactorModelName';
    COMPACTOR_API_KEY_KEY = 'codepilot.compactorApiKey';
    COMMAND_MODEL_TYPE_KEY = 'codepilot.commandModelType';
    COMMAND_MODEL_NAME_KEY = 'codepilot.commandModelName';
    COMMAND_API_KEY_KEY = 'codepilot.commandApiKey';
    INTENT_MODEL_TYPE_KEY = 'codepilot.intentModelType';
    INTENT_MODEL_NAME_KEY = 'codepilot.intentModelName';
    INTENT_API_KEY_KEY = 'codepilot.intentApiKey';
    /**
     * API Key를 저장합니다
     */
    async saveApiKey(apiKey) {
        await this.saveSecret(this.API_KEY_SECRET_KEY, apiKey);
    }
    /**
     * API Key를 가져옵니다
     */
    async getApiKey() {
        return await this.getSecret(this.API_KEY_SECRET_KEY);
    }
    /**
     * API Key를 삭제합니다
     */
    async deleteApiKey() {
        await this.deleteSecret(this.API_KEY_SECRET_KEY);
    }
    /**
     * 현재 AI 모델을 저장합니다
     */
    async saveCurrentAiModel(model) {
        await this.saveSecret(this.CURRENT_AI_MODEL_SECRET_KEY, model);
    }
    /**
     * 현재 AI 모델을 가져옵니다
     */
    async getCurrentAiModel() {
        return await this.getSecret(this.CURRENT_AI_MODEL_SECRET_KEY);
    }
    /**
     * 현재 AI 모델을 삭제합니다
     */
    async deleteCurrentAiModel() {
        await this.deleteSecret(this.CURRENT_AI_MODEL_SECRET_KEY);
    }
    /**
     * Banya 라이센스 시리얼을 암호화하여 저장합니다
     */
    async saveBanyaLicenseSerial(licenseSerial) {
        const encryptedSerial = CryptoUtils.encrypt(licenseSerial);
        await this.saveSecret(this.BANYA_LICENSE_SERIAL_SECRET_KEY, encryptedSerial);
        console.log('[StateManager] Banya license serial encrypted and saved.');
    }
    /**
     * Banya 라이센스 시리얼을 복호화하여 가져옵니다
     */
    async getBanyaLicenseSerial() {
        const encryptedSerial = await this.getSecret(this.BANYA_LICENSE_SERIAL_SECRET_KEY);
        if (encryptedSerial) {
            try {
                if (CryptoUtils.isEncrypted(encryptedSerial)) {
                    return CryptoUtils.decrypt(encryptedSerial);
                }
                return encryptedSerial;
            }
            catch (error) {
                console.error('[StateManager] Decrypt error:', error);
                return undefined;
            }
        }
        return undefined;
    }
    /**
     * Banya 라이센스 시리얼을 삭제합니다
     */
    async deleteBanyaLicenseSerial() {
        await this.deleteSecret(this.BANYA_LICENSE_SERIAL_SECRET_KEY);
    }
    // Ollama 관련 메서드들
    async saveOllamaServerType(serverType) {
        await this.saveSecret(this.OLLAMA_SERVER_TYPE_SECRET_KEY, serverType);
    }
    async getOllamaServerType() {
        return (await this.getSecret(this.OLLAMA_SERVER_TYPE_SECRET_KEY)) || 'local';
    }
    async saveOllamaApiUrl(apiUrl) {
        await this.saveSecret(this.OLLAMA_API_URL_SECRET_KEY, apiUrl);
    }
    async getOllamaApiUrl() {
        return await this.getSecret(this.OLLAMA_API_URL_SECRET_KEY);
    }
    async deleteOllamaApiUrl() {
        await this.deleteSecret(this.OLLAMA_API_URL_SECRET_KEY);
    }
    async saveOllamaEndpoint(endpoint) {
        await this.saveSecret(this.OLLAMA_ENDPOINT_SECRET_KEY, endpoint);
    }
    async getOllamaEndpoint() {
        return (await this.getSecret(this.OLLAMA_ENDPOINT_SECRET_KEY)) || '/api/generate';
    }
    async deleteOllamaEndpoint() {
        await this.deleteSecret(this.OLLAMA_ENDPOINT_SECRET_KEY);
    }
    async saveOllamaModel(model) {
        await this.saveSecret(this.OLLAMA_MODEL_SECRET_KEY, model);
    }
    async getOllamaModel() {
        return (await this.getSecret(this.OLLAMA_MODEL_SECRET_KEY)) || 'gemma3:27b';
    }
    async deleteOllamaModel() {
        await this.deleteSecret(this.OLLAMA_MODEL_SECRET_KEY);
    }
    async saveLocalOllamaApiUrl(apiUrl) {
        await this.saveSecret(this.LOCAL_OLLAMA_API_URL_SECRET_KEY, apiUrl);
    }
    async getLocalOllamaApiUrl() {
        return (await this.getSecret(this.LOCAL_OLLAMA_API_URL_SECRET_KEY)) || 'http://localhost:11434';
    }
    async saveLocalOllamaEndpoint(endpoint) {
        await this.saveSecret(this.LOCAL_OLLAMA_ENDPOINT_SECRET_KEY, endpoint);
    }
    async getLocalOllamaEndpoint() {
        return (await this.getSecret(this.LOCAL_OLLAMA_ENDPOINT_SECRET_KEY)) || '/api/generate';
    }
    async saveRemoteOllamaApiUrl(apiUrl) {
        await this.saveSecret(this.REMOTE_OLLAMA_API_URL_SECRET_KEY, apiUrl);
    }
    async getRemoteOllamaApiUrl() {
        return (await this.getSecret(this.REMOTE_OLLAMA_API_URL_SECRET_KEY)) || null;
    }
    async saveRemoteOllamaEndpoint(endpoint) {
        await this.saveSecret(this.REMOTE_OLLAMA_ENDPOINT_SECRET_KEY, endpoint);
    }
    async getRemoteOllamaEndpoint() {
        return (await this.getSecret(this.REMOTE_OLLAMA_ENDPOINT_SECRET_KEY)) || '/api/generate';
    }
    async saveRemoteOllamaModel(model) {
        await this.saveSecret(this.REMOTE_OLLAMA_MODEL_SECRET_KEY, model);
    }
    async getRemoteOllamaModel() {
        return (await this.getSecret(this.REMOTE_OLLAMA_MODEL_SECRET_KEY)) || null;
    }
    async getAiModel() {
        return (await this.getSecret('codepilot.aiModel')) || 'gemini';
    }
    async saveAiModel(model) {
        await this.saveSecret('codepilot.aiModel', model);
    }
    async getGeminiModel() {
        return (await this.getSecret('codepilot.geminiModel')) || 'gemini-3-flash-preview';
    }
    async saveGeminiModel(model) {
        await this.saveSecret('codepilot.geminiModel', model);
    }
    async getBanyaApiKey() {
        return await this.getSecret(this.BANYA_API_KEY_SECRET_KEY);
    }
    async saveBanyaApiKey(apiKey) {
        await this.saveSecret(this.BANYA_API_KEY_SECRET_KEY, apiKey);
    }
    async deleteBanyaApiKey() {
        await this.deleteSecret(this.BANYA_API_KEY_SECRET_KEY);
    }
    async getBanyaModel() {
        return (await this.getSecret('codepilot.banyaModel')) || 'Banya-Solar:100b';
    }
    async saveBanyaModel(model) {
        await this.saveSecret('codepilot.banyaModel', model);
    }
    // License verified flag
    async saveIsLicenseVerified(value) {
        await this.context.workspaceState.update(this.IS_LICENSE_VERIFIED_KEY, value);
    }
    async getIsLicenseVerified() {
        return this.context.workspaceState.get(this.IS_LICENSE_VERIFIED_KEY) ?? false;
    }
    // Language
    async saveLanguage(language) {
        await this.context.workspaceState.update(this.LANGUAGE_KEY, language);
    }
    async getLanguage() {
        return this.context.workspaceState.get(this.LANGUAGE_KEY);
    }
    // Auto update enabled
    async saveAutoUpdateEnabled(enabled) {
        await this.context.workspaceState.update(this.AUTO_UPDATE_ENABLED_KEY, enabled);
    }
    async getAutoUpdateEnabled() {
        return this.context.workspaceState.get(this.AUTO_UPDATE_ENABLED_KEY) ?? false;
    }
    // Error retry count
    async saveErrorRetryCount(count) {
        await this.context.workspaceState.update(this.ERROR_RETRY_COUNT_KEY, count);
    }
    async getErrorRetryCount() {
        return this.context.workspaceState.get(this.ERROR_RETRY_COUNT_KEY) ?? 5;
    }
    // Auto correction enabled
    async saveAutoCorrectionEnabled(enabled) {
        await this.context.workspaceState.update(this.AUTO_CORRECTION_ENABLED_KEY, enabled);
    }
    async getAutoCorrectionEnabled() {
        return this.context.workspaceState.get(this.AUTO_CORRECTION_ENABLED_KEY) ?? false;
    }
    // ===== AgentPolicy 관련 메서드들 =====
    AGENT_POLICY_STABLE_VERSION_KEY = 'codepilot.agentPolicy.stableVersion';
    AGENT_POLICY_CODING_STYLE_KEY = 'codepilot.agentPolicy.codingStyle';
    AGENT_POLICY_PROJECT_ARCHITECTURE_KEY = 'codepilot.agentPolicy.projectArchitecture';
    AGENT_POLICY_DEPENDENCY_POLICY_KEY = 'codepilot.agentPolicy.dependencyPolicy';
    AGENT_POLICY_DB_POLICY_KEY = 'codepilot.agentPolicy.dbPolicy';
    /**
     * Stable Version Markdown을 저장합니다
     */
    async saveAgentPolicyStableVersion(mdContent) {
        await this.context.workspaceState.update(this.AGENT_POLICY_STABLE_VERSION_KEY, mdContent);
        console.log('[StateManager] AgentPolicy Stable Version saved.');
    }
    /**
     * Stable Version Markdown을 가져옵니다
     */
    async getAgentPolicyStableVersion() {
        return this.context.workspaceState.get(this.AGENT_POLICY_STABLE_VERSION_KEY);
    }
    /**
     * Stable Version Markdown을 삭제합니다
     */
    async deleteAgentPolicyStableVersion() {
        await this.context.workspaceState.update(this.AGENT_POLICY_STABLE_VERSION_KEY, undefined);
    }
    /**
     * Coding Style Markdown을 저장합니다
     */
    async saveAgentPolicyCodingStyle(mdContent) {
        await this.context.workspaceState.update(this.AGENT_POLICY_CODING_STYLE_KEY, mdContent);
        console.log('[StateManager] AgentPolicy Coding Style saved.');
    }
    /**
     * Coding Style Markdown을 가져옵니다
     */
    async getAgentPolicyCodingStyle() {
        return this.context.workspaceState.get(this.AGENT_POLICY_CODING_STYLE_KEY);
    }
    /**
     * Coding Style Markdown을 삭제합니다
     */
    async deleteAgentPolicyCodingStyle() {
        await this.context.workspaceState.update(this.AGENT_POLICY_CODING_STYLE_KEY, undefined);
    }
    /**
     * Project Architecture Markdown을 저장합니다
     */
    async saveAgentPolicyProjectArchitecture(mdContent) {
        await this.context.workspaceState.update(this.AGENT_POLICY_PROJECT_ARCHITECTURE_KEY, mdContent);
        console.log('[StateManager] AgentPolicy Project Architecture saved.');
    }
    /**
     * Project Architecture Markdown을 가져옵니다
     */
    async getAgentPolicyProjectArchitecture() {
        return this.context.workspaceState.get(this.AGENT_POLICY_PROJECT_ARCHITECTURE_KEY);
    }
    /**
     * Project Architecture Markdown을 삭제합니다
     */
    async deleteAgentPolicyProjectArchitecture() {
        await this.context.workspaceState.update(this.AGENT_POLICY_PROJECT_ARCHITECTURE_KEY, undefined);
    }
    /**
     * Dependency Policy Markdown을 저장합니다
     */
    async saveAgentPolicyDependencyPolicy(mdContent) {
        await this.context.workspaceState.update(this.AGENT_POLICY_DEPENDENCY_POLICY_KEY, mdContent);
        console.log('[StateManager] AgentPolicy Dependency Policy saved.');
    }
    /**
     * Dependency Policy Markdown을 가져옵니다
     */
    async getAgentPolicyDependencyPolicy() {
        return this.context.workspaceState.get(this.AGENT_POLICY_DEPENDENCY_POLICY_KEY);
    }
    /**
     * Dependency Policy Markdown을 삭제합니다
     */
    async deleteAgentPolicyDependencyPolicy() {
        await this.context.workspaceState.update(this.AGENT_POLICY_DEPENDENCY_POLICY_KEY, undefined);
    }
    /**
     * DB Policy Markdown을 저장합니다
     */
    async saveAgentPolicyDbPolicy(mdContent) {
        await this.context.workspaceState.update(this.AGENT_POLICY_DB_POLICY_KEY, mdContent);
        console.log('[StateManager] AgentPolicy DB Policy saved.');
    }
    /**
     * DB Policy Markdown을 가져옵니다
     */
    async getAgentPolicyDbPolicy() {
        return this.context.workspaceState.get(this.AGENT_POLICY_DB_POLICY_KEY);
    }
    /**
     * DB Policy Markdown을 삭제합니다
     */
    async deleteAgentPolicyDbPolicy() {
        await this.context.workspaceState.update(this.AGENT_POLICY_DB_POLICY_KEY, undefined);
    }
    // ===== 모델 라우팅 관련 메서드들 =====
    /**
     * Compactor 모델 타입을 저장합니다 (gemini, ollama, banya 등)
     */
    async saveCompactorModelType(modelType) {
        await this.saveSecret(this.COMPACTOR_MODEL_TYPE_KEY, modelType);
        console.log('[StateManager] Compactor model type saved:', modelType);
    }
    /**
     * Compactor 모델 타입을 가져옵니다 (설정되지 않으면 undefined 반환 - 메인 모델 사용)
     */
    async getCompactorModelType() {
        return await this.getSecret(this.COMPACTOR_MODEL_TYPE_KEY);
    }
    /**
     * Compactor 모델 타입을 삭제합니다
     */
    async deleteCompactorModelType() {
        await this.deleteSecret(this.COMPACTOR_MODEL_TYPE_KEY);
    }
    /**
     * Compactor 모델 이름을 저장합니다 (gemini-2.0-flash, llama3 등)
     */
    async saveCompactorModelName(modelName) {
        await this.saveSecret(this.COMPACTOR_MODEL_NAME_KEY, modelName);
        console.log('[StateManager] Compactor model name saved:', modelName);
    }
    /**
     * Compactor 모델 이름을 가져옵니다
     */
    async getCompactorModelName() {
        return await this.getSecret(this.COMPACTOR_MODEL_NAME_KEY);
    }
    /**
     * Compactor 모델 이름을 삭제합니다
     */
    async deleteCompactorModelName() {
        await this.deleteSecret(this.COMPACTOR_MODEL_NAME_KEY);
    }
    /**
     * Command 모델 타입을 저장합니다 (gemini, ollama, banya 등)
     */
    async saveCommandModelType(modelType) {
        await this.saveSecret(this.COMMAND_MODEL_TYPE_KEY, modelType);
        console.log('[StateManager] Command model type saved:', modelType);
    }
    /**
     * Command 모델 타입을 가져옵니다 (설정되지 않으면 undefined 반환 - 메인 모델 사용)
     */
    async getCommandModelType() {
        return await this.getSecret(this.COMMAND_MODEL_TYPE_KEY);
    }
    /**
     * Command 모델 타입을 삭제합니다
     */
    async deleteCommandModelType() {
        await this.deleteSecret(this.COMMAND_MODEL_TYPE_KEY);
    }
    /**
     * Command 모델 이름을 저장합니다 (gemini-2.0-flash, llama3 등)
     */
    async saveCommandModelName(modelName) {
        await this.saveSecret(this.COMMAND_MODEL_NAME_KEY, modelName);
        console.log('[StateManager] Command model name saved:', modelName);
    }
    /**
     * Command 모델 이름을 가져옵니다
     */
    async getCommandModelName() {
        return await this.getSecret(this.COMMAND_MODEL_NAME_KEY);
    }
    /**
     * Command 모델 이름을 삭제합니다
     */
    async deleteCommandModelName() {
        await this.deleteSecret(this.COMMAND_MODEL_NAME_KEY);
    }
    /**
     * Compactor 모델 설정을 한 번에 가져옵니다
     * @returns { type: string | undefined, name: string | undefined }
     */
    async getCompactorModelConfig() {
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
    async getCommandModelConfig() {
        const [type, name] = await Promise.all([
            this.getCommandModelType(),
            this.getCommandModelName()
        ]);
        return { type, name };
    }
    /**
     * Compactor 모델 설정을 한 번에 저장합니다
     */
    async saveCompactorModelConfig(type, name) {
        await Promise.all([
            this.saveCompactorModelType(type),
            this.saveCompactorModelName(name)
        ]);
    }
    /**
     * Command 모델 설정을 한 번에 저장합니다
     */
    async saveCommandModelConfig(type, name) {
        await Promise.all([
            this.saveCommandModelType(type),
            this.saveCommandModelName(name)
        ]);
    }
    /**
     * Compactor 모델 설정을 초기화합니다 (메인 모델 사용으로 되돌림)
     */
    async clearCompactorModelConfig() {
        await Promise.all([
            this.deleteCompactorModelType(),
            this.deleteCompactorModelName()
        ]);
        console.log('[StateManager] Compactor model config cleared (will use main model)');
    }
    /**
     * Command 모델 설정을 초기화합니다 (메인 모델 사용으로 되돌림)
     */
    async clearCommandModelConfig() {
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
    async saveCompactorApiKey(apiKey) {
        await this.saveSecret(this.COMPACTOR_API_KEY_KEY, apiKey);
        console.log('[StateManager] Compactor API key saved');
    }
    /**
     * Compactor API 키를 가져옵니다
     */
    async getCompactorApiKey() {
        return await this.getSecret(this.COMPACTOR_API_KEY_KEY);
    }
    /**
     * Compactor API 키를 삭제합니다
     */
    async deleteCompactorApiKey() {
        await this.deleteSecret(this.COMPACTOR_API_KEY_KEY);
        console.log('[StateManager] Compactor API key deleted');
    }
    /**
     * Command API 키를 저장합니다
     */
    async saveCommandApiKey(apiKey) {
        await this.saveSecret(this.COMMAND_API_KEY_KEY, apiKey);
        console.log('[StateManager] Command API key saved');
    }
    /**
     * Command API 키를 가져옵니다
     */
    async getCommandApiKey() {
        return await this.getSecret(this.COMMAND_API_KEY_KEY);
    }
    /**
     * Command API 키를 삭제합니다
     */
    async deleteCommandApiKey() {
        await this.deleteSecret(this.COMMAND_API_KEY_KEY);
        console.log('[StateManager] Command API key deleted');
    }
    /**
     * Compactor API 키가 설정되어 있는지 확인합니다
     */
    async hasCompactorApiKey() {
        const key = await this.getCompactorApiKey();
        return !!key;
    }
    /**
     * Command API 키가 설정되어 있는지 확인합니다
     */
    async hasCommandApiKey() {
        const key = await this.getCommandApiKey();
        return !!key;
    }
    // ===== Intent 모델 관련 메서드들 =====
    /**
     * Intent 모델 타입을 저장합니다 (gemini, ollama, banya 등)
     */
    async saveIntentModelType(modelType) {
        await this.saveSecret(this.INTENT_MODEL_TYPE_KEY, modelType);
        console.log('[StateManager] Intent model type saved:', modelType);
    }
    /**
     * Intent 모델 타입을 가져옵니다 (설정되지 않으면 undefined 반환 - 메인 모델 사용)
     */
    async getIntentModelType() {
        return await this.getSecret(this.INTENT_MODEL_TYPE_KEY);
    }
    /**
     * Intent 모델 타입을 삭제합니다
     */
    async deleteIntentModelType() {
        await this.deleteSecret(this.INTENT_MODEL_TYPE_KEY);
    }
    /**
     * Intent 모델 이름을 저장합니다
     */
    async saveIntentModelName(modelName) {
        await this.saveSecret(this.INTENT_MODEL_NAME_KEY, modelName);
        console.log('[StateManager] Intent model name saved:', modelName);
    }
    /**
     * Intent 모델 이름을 가져옵니다
     */
    async getIntentModelName() {
        return await this.getSecret(this.INTENT_MODEL_NAME_KEY);
    }
    /**
     * Intent 모델 이름을 삭제합니다
     */
    async deleteIntentModelName() {
        await this.deleteSecret(this.INTENT_MODEL_NAME_KEY);
    }
    /**
     * Intent API 키를 저장합니다
     */
    async saveIntentApiKey(apiKey) {
        await this.saveSecret(this.INTENT_API_KEY_KEY, apiKey);
        console.log('[StateManager] Intent API key saved');
    }
    /**
     * Intent API 키를 가져옵니다
     */
    async getIntentApiKey() {
        return await this.getSecret(this.INTENT_API_KEY_KEY);
    }
    /**
     * Intent API 키를 삭제합니다
     */
    async deleteIntentApiKey() {
        await this.deleteSecret(this.INTENT_API_KEY_KEY);
        console.log('[StateManager] Intent API key deleted');
    }
    /**
     * Intent API 키가 설정되어 있는지 확인합니다
     */
    async hasIntentApiKey() {
        const key = await this.getIntentApiKey();
        return !!key;
    }
    /**
     * Intent 모델 설정을 한 번에 가져옵니다
     */
    async getIntentModelConfig() {
        const [type, name] = await Promise.all([
            this.getIntentModelType(),
            this.getIntentModelName()
        ]);
        return { type, name };
    }
    /**
     * Intent 모델 설정을 한 번에 저장합니다
     */
    async saveIntentModelConfig(type, name) {
        await Promise.all([
            this.saveIntentModelType(type),
            this.saveIntentModelName(name)
        ]);
    }
    /**
     * Intent 모델 설정을 초기화합니다 (메인 모델 사용으로 되돌림)
     */
    async clearIntentModelConfig() {
        await Promise.all([
            this.deleteIntentModelType(),
            this.deleteIntentModelName(),
            this.deleteIntentApiKey()
        ]);
        console.log('[StateManager] Intent model config cleared (will use main model)');
    }
    // ===== MCP 서버 관련 메서드들 =====
    MCP_SERVERS_KEY = 'codepilot.mcpServers';
    MCP_APPROVED_TOOLS_KEY = 'codepilot.mcpApprovedTools';
    /**
     * MCP 서버 목록을 저장합니다
     */
    async saveMcpServers(servers) {
        await this.context.workspaceState.update(this.MCP_SERVERS_KEY, servers);
        console.log('[StateManager] MCP servers saved:', servers.length);
    }
    /**
     * MCP 서버 목록을 가져옵니다
     */
    async getMcpServers() {
        return this.context.workspaceState.get(this.MCP_SERVERS_KEY) ?? [];
    }
    /**
     * MCP 서버를 추가합니다
     */
    async addMcpServer(server) {
        const servers = await this.getMcpServers();
        servers.push(server);
        await this.saveMcpServers(servers);
    }
    /**
     * MCP 서버를 삭제합니다
     */
    async removeMcpServer(serverId) {
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
    async updateMcpServer(serverId, updates) {
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
    async saveMcpApprovedTools(approvedTools) {
        await this.context.workspaceState.update(this.MCP_APPROVED_TOOLS_KEY, approvedTools);
        console.log('[StateManager] MCP approved tools saved:', approvedTools.length);
    }
    /**
     * 승인된 MCP 도구 목록을 가져옵니다
     */
    async getMcpApprovedTools() {
        return this.context.workspaceState.get(this.MCP_APPROVED_TOOLS_KEY) ?? [];
    }
    /**
     * MCP 도구 승인 여부를 확인합니다
     */
    async isMcpToolApproved(serverId, toolName) {
        const approvedTools = await this.getMcpApprovedTools();
        return approvedTools.some(t => t.serverId === serverId && t.toolName === toolName);
    }
    /**
     * MCP 도구를 승인 목록에 추가합니다
     */
    async approveMcpTool(serverId, toolName) {
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
    async revokeMcpToolApproval(serverId, toolName) {
        const approvedTools = await this.getMcpApprovedTools();
        const filtered = approvedTools.filter(t => !(t.serverId === serverId && t.toolName === toolName));
        await this.saveMcpApprovedTools(filtered);
    }
    /**
     * 특정 서버의 모든 도구 승인을 취소합니다
     */
    async revokeAllMcpToolsForServer(serverId) {
        const approvedTools = await this.getMcpApprovedTools();
        const filtered = approvedTools.filter(t => t.serverId !== serverId);
        await this.saveMcpApprovedTools(filtered);
    }
}
//# sourceMappingURL=StateManager.js.map