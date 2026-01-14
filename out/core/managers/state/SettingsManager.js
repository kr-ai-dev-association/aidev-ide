"use strict";
/**
 * Settings Manager
 * 사용자 설정을 관리하는 클래스
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingsManager = void 0;
const vscode = __importStar(require("vscode"));
const BaseManager_1 = require("../base/BaseManager");
const ConfigurationService_1 = require("./ConfigurationService");
// @ts-ignore - BaseManager 상속 타입 호환성
class SettingsManager extends BaseManager_1.BaseManager {
    listeners = new Set();
    _context;
    constructor(context) {
        super(context);
        this._context = context;
        this.registerVSCodeSettingsWatcher();
    }
    static getInstance(context) {
        // BaseManager의 instances Map을 직접 확인하여 이미 인스턴스가 있는지 체크
        // BaseManager의 private static instances에 접근하기 위해 any로 캐스팅
        const BaseManagerClass = BaseManager_1.BaseManager;
        const instances = BaseManagerClass.instances;
        const key = SettingsManager.name;
        if (instances && instances.has(key)) {
            // 이미 인스턴스가 있으면 context 없이도 반환 가능
            const existing = instances.get(key);
            if (existing && existing._context) {
                return existing;
            }
        }
        // 인스턴스가 없고 context도 없으면 에러
        if (!context) {
            throw new Error('SettingsManager requires ExtensionContext for first initialization');
        }
        return BaseManager_1.BaseManager.getInstance.call(SettingsManager, context);
    }
    get context() {
        return this._context;
    }
    /**
     * 사용자 설정을 가져옵니다
     */
    getUserSettings() {
        return {
            // LLM 설정
            aiModel: ConfigurationService_1.ConfigurationService.get('aiModel', 'ollama') ?? 'ollama',
            geminiApiKey: ConfigurationService_1.ConfigurationService.get('geminiApiKey') ?? '',
            geminiModel: ConfigurationService_1.ConfigurationService.get('geminiModel', 'gemini-3-pro-preview') ?? 'gemini-3-pro-preview',
            ollamaUrl: ConfigurationService_1.ConfigurationService.get('ollamaUrl') ?? '',
            ollamaModel: ConfigurationService_1.ConfigurationService.get('ollamaModel') ?? '',
            useRemoteOllama: ConfigurationService_1.ConfigurationService.get('useRemoteOllama', false) ?? false,
            // 동작 설정
            autoExecuteCommands: ConfigurationService_1.ConfigurationService.get('autoExecuteCommands', false) ?? false,
            autoCorrectErrors: ConfigurationService_1.ConfigurationService.get('autoCorrectErrors', true) ?? true,
            maxErrorRetries: ConfigurationService_1.ConfigurationService.get('maxErrorRetries', 3) ?? 3,
            outputLogEnabled: ConfigurationService_1.ConfigurationService.get('outputLogEnabled', true) ?? true,
            // UI 설정
            theme: ConfigurationService_1.ConfigurationService.get('theme', 'auto') ?? 'auto',
            showNotifications: ConfigurationService_1.ConfigurationService.get('showNotifications', true) ?? true,
            showProcessingSteps: (ConfigurationService_1.ConfigurationService.get('showProcessingSteps', true) ?? true),
            // 고급 설정
            maxContextSize: (ConfigurationService_1.ConfigurationService.get('maxContextSize', 100000) ?? 100000),
            includeAllSrcFiles: (ConfigurationService_1.ConfigurationService.get('includeAllSrcFiles', true) ?? true),
            customSystemPrompt: ConfigurationService_1.ConfigurationService.get('customSystemPrompt')
        };
    }
    /**
     * 사용자 설정을 업데이트합니다
     */
    async updateUserSetting(key, value, target = vscode.ConfigurationTarget.Global) {
        const oldValue = ConfigurationService_1.ConfigurationService.get(key);
        await ConfigurationService_1.ConfigurationService.updateConfig(key, value, target);
        // 이벤트 발생
        this.emitSettingChange({
            key,
            oldValue,
            newValue: value,
            scope: target === vscode.ConfigurationTarget.Global ? 'global' : 'workspace',
            timestamp: Date.now()
        });
        console.log(`[SettingsManager] Updated setting: ${key}`);
    }
    /**
     * 워크스페이스 설정을 가져옵니다
     */
    getWorkspaceSettings(projectPath) {
        return {
            projectPath,
            excludePatterns: ConfigurationService_1.ConfigurationService.get('excludePatterns', []),
            includePatterns: ConfigurationService_1.ConfigurationService.get('includePatterns', []),
            customCommands: ConfigurationService_1.ConfigurationService.get('customCommands', []),
            environmentVariables: ConfigurationService_1.ConfigurationService.get('environmentVariables', {})
        };
    }
    /**
     * 워크스페이스 설정을 업데이트합니다
     */
    async updateWorkspaceSetting(key, value) {
        await ConfigurationService_1.ConfigurationService.updateConfig(key, value, vscode.ConfigurationTarget.Workspace);
        console.log(`[SettingsManager] Updated workspace setting: ${key}`);
    }
    /**
     * 설정 변경 리스너를 등록합니다
     */
    onSettingChange(listener) {
        this.listeners.add(listener);
    }
    /**
     * 설정 변경 리스너를 제거합니다
     */
    offSettingChange(listener) {
        this.listeners.delete(listener);
    }
    /**
     * 설정 변경 이벤트를 발생시킵니다
     */
    emitSettingChange(event) {
        this.listeners.forEach(listener => {
            try {
                listener(event);
            }
            catch (error) {
                console.error('[SettingsManager] Listener error:', error);
            }
        });
    }
    /**
     * VS Code 설정 변경 감지
     */
    registerVSCodeSettingsWatcher() {
        vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration('codepilot')) {
                // 설정 변경 시 캐시 무효화
                ConfigurationService_1.ConfigurationService.invalidateCache();
                // 모든 codepilot 설정이 변경되었음을 알림
                console.log('[SettingsManager] Configuration changed');
            }
        });
    }
    // ===== ConfigurationService 호환 메서드들 =====
    /**
     * 소스 경로를 가져옵니다
     */
    async getSourcePaths() {
        return ConfigurationService_1.ConfigurationService.get('sourcePaths') || [];
    }
    /**
     * 소스 경로를 업데이트합니다
     */
    async updateSourcePaths(paths) {
        await this.updateUserSetting('sourcePaths', paths, vscode.ConfigurationTarget.Global);
    }
    /**
     * 자동 업데이트 활성화 여부를 가져옵니다
     */
    async isAutoUpdateEnabled() {
        return ConfigurationService_1.ConfigurationService.get('autoUpdateFiles') || false;
    }
    /**
     * 자동 업데이트 활성화 여부를 업데이트합니다
     */
    async updateAutoUpdateEnabled(enabled) {
        await this.updateUserSetting('autoUpdateFiles', enabled, vscode.ConfigurationTarget.Global);
    }
    /**
     * 현재 워크스페이스 루트 경로를 반환합니다
     */
    async getProjectRoot() {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            const workspaceRoot = workspaceFolders[0].uri.fsPath;
            console.log(`[SettingsManager] 워크스페이스 루트 사용: ${workspaceRoot}`);
            return workspaceRoot;
        }
        console.warn(`[SettingsManager] 워크스페이스가 열려있지 않습니다.`);
        return undefined;
    }
    /**
     * 프로젝트 루트를 업데이트합니다
     */
    async updateProjectRoot(path) {
        const valueToSave = path ? path.replace(/\/$/, '') : '';
        console.log(`[SettingsManager] 프로젝트 Root 설정 시도: "${valueToSave}"`);
        await ConfigurationService_1.ConfigurationService.updateConfig('projectRoot', valueToSave, vscode.ConfigurationTarget.Global);
        await new Promise(resolve => setTimeout(resolve, 200));
        let savedValue = ConfigurationService_1.ConfigurationService.get('projectRoot');
        console.log(`[SettingsManager] 저장된 프로젝트 Root 값 (첫 번째 확인): "${savedValue}"`);
        if (savedValue !== valueToSave) {
            for (let i = 0; i < 3; i++) {
                await new Promise(resolve => setTimeout(resolve, 300));
                savedValue = ConfigurationService_1.ConfigurationService.get('projectRoot');
                console.log(`[SettingsManager] 저장된 프로젝트 Root 값 (${i + 2}번째 확인): "${savedValue}"`);
                if (savedValue === valueToSave) {
                    break;
                }
            }
        }
        const normalizedSaved = savedValue ? savedValue.replace(/\/$/, '') : '';
        const normalizedExpected = valueToSave ? valueToSave.replace(/\/$/, '') : '';
        if (normalizedSaved !== normalizedExpected) {
            console.warn(`[SettingsManager] 프로젝트 Root 설정 불일치: 예상값 "${normalizedExpected}", 실제값 "${normalizedSaved}"`);
            console.log(`[SettingsManager] 프로젝트 Root 설정을 계속 진행합니다: "${savedValue || 'undefined'}"`);
        }
        else {
            console.log(`[SettingsManager] 프로젝트 Root 설정 성공: "${savedValue}"`);
        }
    }
    /**
     * 언어 설정을 업데이트합니다
     */
    async updateLanguage(language) {
        await this.updateUserSetting('language', language, vscode.ConfigurationTarget.Global);
    }
    /**
     * 현재 언어 설정을 가져옵니다
     */
    async getLanguage() {
        return ConfigurationService_1.ConfigurationService.get('language', 'ko') || 'ko';
    }
    /**
     * 터미널 데몬 활성화 여부를 가져옵니다
     */
    async isTerminalDaemonEnabled() {
        return ConfigurationService_1.ConfigurationService.get('terminalDaemonEnabled') || false;
    }
    /**
     * 터미널 데몬 활성화 여부를 업데이트합니다
     */
    async updateTerminalDaemonEnabled(enabled) {
        await this.updateUserSetting('terminalDaemonEnabled', enabled, vscode.ConfigurationTarget.Global);
    }
    /**
     * OUTPUT 로그 활성화 상태를 가져옵니다
     */
    async isOutputLogEnabled() {
        return ConfigurationService_1.ConfigurationService.get('outputLogEnabled') ?? true;
    }
    /**
     * OUTPUT 로그 활성화 상태를 업데이트합니다
     */
    async updateOutputLogEnabled(enabled) {
        await this.updateUserSetting('outputLogEnabled', enabled, vscode.ConfigurationTarget.Global);
    }
    /**
     * 자동 오류 수정 횟수를 가져옵니다
     */
    async getErrorRetryCount() {
        const count = ConfigurationService_1.ConfigurationService.get('errorRetryCount') ?? 3;
        return Math.max(1, Math.min(10, count));
    }
    /**
     * 자동 오류 수정 횟수를 업데이트합니다
     */
    async updateErrorRetryCount(count) {
        const validCount = Math.max(1, Math.min(10, count));
        await this.updateUserSetting('errorRetryCount', validCount, vscode.ConfigurationTarget.Global);
    }
    /**
     * 자동 오류 수정 On/Off 상태를 가져옵니다
     */
    async isAutoCorrectionEnabled() {
        const value = ConfigurationService_1.ConfigurationService.get('autoCorrectionEnabled') ?? false;
        // console.log(`[SettingsManager] Read autoCorrectionEnabled: ${value}`);
        return value;
    }
    /**
     * 자동 오류 수정 On/Off 상태를 저장합니다
     */
    async updateAutoCorrectionEnabled(enabled) {
        console.log(`[SettingsManager] Update autoCorrectionEnabled -> ${enabled} (Workspace)`);
        await ConfigurationService_1.ConfigurationService.updateConfig('autoCorrectionEnabled', enabled, vscode.ConfigurationTarget.Workspace);
    }
    /**
     * 명령어 자동 실행 On/Off 상태를 읽습니다
     */
    async isAutoExecuteCommandsEnabled() {
        const value = ConfigurationService_1.ConfigurationService.get('autoExecuteCommands') ?? true;
        // console.log(`[SettingsManager] Read autoExecuteCommands: ${value}`);
        return value;
    }
    /**
     * 명령어 자동 실행 On/Off 상태를 저장합니다
     */
    async updateAutoExecuteCommandsEnabled(enabled) {
        console.log(`[SettingsManager] Update autoExecuteCommands -> ${enabled} (Global)`);
        await this.updateUserSetting('autoExecuteCommands', enabled, vscode.ConfigurationTarget.Global);
    }
    /**
     * 디버그 모드 On/Off 상태를 가져옵니다
     */
    async isDebugEnabled() {
        return ConfigurationService_1.ConfigurationService.get('debugEnabled') ?? false;
    }
    /**
     * 디버그 모드 On/Off 상태를 저장합니다
     */
    async updateDebugEnabled(enabled) {
        await this.updateUserSetting('debugEnabled', enabled, vscode.ConfigurationTarget.Global);
    }
    /**
     * 자동 테스트 실패 시 재시도 On/Off 상태를 가져옵니다
     */
    async isAutoTestRetryEnabled() {
        // 워크스페이스 설정을 명시적으로 읽기
        const config = vscode.workspace.getConfiguration('codepilot');
        const workspaceValue = config.inspect('autoTestRetryEnabled')?.workspaceValue;
        const workspaceFolderValue = config.inspect('autoTestRetryEnabled')?.workspaceFolderValue;
        const value = workspaceFolderValue ?? workspaceValue ?? config.get('autoTestRetryEnabled') ?? false;
        console.log(`[SettingsManager] Get autoTestRetryEnabled: ${value} (workspaceFolder: ${workspaceFolderValue}, workspace: ${workspaceValue})`);
        return value;
    }
    /**
     * 자동 테스트 실패 시 재시도 On/Off 상태를 저장합니다
     */
    async updateAutoTestRetryEnabled(enabled) {
        console.log(`[SettingsManager] Update autoTestRetryEnabled -> ${enabled} (Workspace)`);
        await this.updateUserSetting('autoTestRetryEnabled', enabled, vscode.ConfigurationTarget.Workspace);
    }
    /**
     * 자동 테스트 재시도 횟수를 가져옵니다
     */
    async getTestRetryCount() {
        // 워크스페이스 설정을 명시적으로 읽기
        const config = vscode.workspace.getConfiguration('codepilot');
        const workspaceValue = config.inspect('testRetryCount')?.workspaceValue;
        const workspaceFolderValue = config.inspect('testRetryCount')?.workspaceFolderValue;
        const count = workspaceFolderValue ?? workspaceValue ?? config.get('testRetryCount') ?? 3;
        const validCount = Math.max(1, Math.min(10, count));
        console.log(`[SettingsManager] Get testRetryCount: ${validCount} (workspaceFolder: ${workspaceFolderValue}, workspace: ${workspaceValue})`);
        return validCount;
    }
    /**
     * 자동 테스트 재시도 횟수를 업데이트합니다
     */
    async updateTestRetryCount(count) {
        const validCount = Math.max(1, Math.min(10, count));
        console.log(`[SettingsManager] Update testRetryCount -> ${validCount} (Workspace)`);
        await this.updateUserSetting('testRetryCount', validCount, vscode.ConfigurationTarget.Workspace);
    }
}
exports.SettingsManager = SettingsManager;
//# sourceMappingURL=SettingsManager.js.map