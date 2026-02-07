/**
 * Settings Manager
 * 사용자 설정을 관리하는 클래스
 */
import * as vscode from 'vscode';
import { BaseManager } from '../base/BaseManager';
import { ConfigurationService } from './ConfigurationService';
// @ts-ignore - BaseManager 상속 타입 호환성
export class SettingsManager extends BaseManager {
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
        const BaseManagerClass = BaseManager;
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
        return BaseManager.getInstance.call(SettingsManager, context);
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
            aiModel: ConfigurationService.get('aiModel', 'ollama') ?? 'ollama',
            geminiApiKey: ConfigurationService.get('geminiApiKey') ?? '',
            geminiModel: ConfigurationService.get('geminiModel', 'gemini-3-pro-preview') ?? 'gemini-3-pro-preview',
            ollamaUrl: ConfigurationService.get('ollamaUrl') ?? '',
            ollamaModel: ConfigurationService.get('ollamaModel') ?? '',
            useRemoteOllama: ConfigurationService.get('useRemoteOllama', false) ?? false,
            // 동작 설정
            autoExecuteCommands: ConfigurationService.get('autoExecuteCommands', false) ?? false,
            autoCorrectErrors: ConfigurationService.get('autoCorrectErrors', true) ?? true,
            maxErrorRetries: ConfigurationService.get('maxErrorRetries', 3) ?? 3,
            // UI 설정
            theme: ConfigurationService.get('theme', 'auto') ?? 'auto',
            showNotifications: ConfigurationService.get('showNotifications', true) ?? true,
            showProcessingSteps: (ConfigurationService.get('showProcessingSteps', true) ?? true),
            // 고급 설정
            maxContextSize: (ConfigurationService.get('maxContextSize', 100000) ?? 100000),
            includeAllSrcFiles: (ConfigurationService.get('includeAllSrcFiles', true) ?? true),
            customSystemPrompt: ConfigurationService.get('customSystemPrompt')
        };
    }
    /**
     * 사용자 설정을 업데이트합니다
     */
    async updateUserSetting(key, value, target = vscode.ConfigurationTarget.Global) {
        const oldValue = ConfigurationService.get(key);
        await ConfigurationService.updateConfig(key, value, target);
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
            excludePatterns: ConfigurationService.get('excludePatterns', []),
            includePatterns: ConfigurationService.get('includePatterns', []),
            customCommands: ConfigurationService.get('customCommands', []),
            environmentVariables: ConfigurationService.get('environmentVariables', {})
        };
    }
    /**
     * 워크스페이스 설정을 업데이트합니다
     */
    async updateWorkspaceSetting(key, value) {
        await ConfigurationService.updateConfig(key, value, vscode.ConfigurationTarget.Workspace);
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
                ConfigurationService.invalidateCache();
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
        return ConfigurationService.get('sourcePaths') || [];
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
        // Global 설정을 우선으로 읽기
        const config = vscode.workspace.getConfiguration('codepilot');
        const globalValue = config.inspect('autoUpdateFiles')?.globalValue;
        const value = globalValue ?? config.get('autoUpdateFiles') ?? false;
        console.log(`[SettingsManager] Get autoUpdateFiles: ${value} (global: ${globalValue})`);
        return value;
    }
    /**
     * 자동 업데이트 활성화 여부를 업데이트합니다
     */
    async updateAutoUpdateEnabled(enabled) {
        await this.updateUserSetting('autoUpdateFiles', enabled, vscode.ConfigurationTarget.Global);
    }
    /**
     * 자동 파일 삭제 On/Off 상태를 읽습니다
     */
    async isAutoDeleteFilesEnabled() {
        // Global 설정을 우선으로 읽기
        const config = vscode.workspace.getConfiguration('codepilot');
        const globalValue = config.inspect('autoDeleteFiles')?.globalValue;
        const value = globalValue ?? config.get('autoDeleteFiles') ?? false;
        console.log(`[SettingsManager] Get autoDeleteFiles: ${value} (global: ${globalValue})`);
        return value;
    }
    /**
     * 자동 파일 삭제 On/Off 상태를 저장합니다
     */
    async updateAutoDeleteFilesEnabled(enabled) {
        console.log(`[SettingsManager] Update autoDeleteFiles -> ${enabled} (Global)`);
        await this.updateUserSetting('autoDeleteFiles', enabled, vscode.ConfigurationTarget.Global);
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
        await ConfigurationService.updateConfig('projectRoot', valueToSave, vscode.ConfigurationTarget.Global);
        await new Promise(resolve => setTimeout(resolve, 200));
        let savedValue = ConfigurationService.get('projectRoot');
        console.log(`[SettingsManager] 저장된 프로젝트 Root 값 (첫 번째 확인): "${savedValue}"`);
        if (savedValue !== valueToSave) {
            for (let i = 0; i < 3; i++) {
                await new Promise(resolve => setTimeout(resolve, 300));
                savedValue = ConfigurationService.get('projectRoot');
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
        return ConfigurationService.get('language', 'ko') || 'ko';
    }
    /**
     * 터미널 데몬 활성화 여부를 가져옵니다
     */
    async isTerminalDaemonEnabled() {
        return ConfigurationService.get('terminalDaemonEnabled') || false;
    }
    /**
     * 터미널 데몬 활성화 여부를 업데이트합니다
     */
    async updateTerminalDaemonEnabled(enabled) {
        await this.updateUserSetting('terminalDaemonEnabled', enabled, vscode.ConfigurationTarget.Global);
    }
    /**
     * 자동 오류 수정 횟수를 가져옵니다
     */
    async getErrorRetryCount() {
        const count = ConfigurationService.get('errorRetryCount') ?? 5;
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
        // Global 설정을 우선으로 읽기
        const config = vscode.workspace.getConfiguration('codepilot');
        const globalValue = config.inspect('autoCorrectionEnabled')?.globalValue;
        const value = globalValue ?? config.get('autoCorrectionEnabled') ?? false;
        console.log(`[SettingsManager] Get autoCorrectionEnabled: ${value} (global: ${globalValue})`);
        return value;
    }
    /**
     * 자동 오류 수정 On/Off 상태를 저장합니다
     */
    async updateAutoCorrectionEnabled(enabled) {
        console.log(`[SettingsManager] Update autoCorrectionEnabled -> ${enabled} (Global)`);
        await ConfigurationService.updateConfig('autoCorrectionEnabled', enabled, vscode.ConfigurationTarget.Global);
    }
    /**
     * 명령어 자동 실행 On/Off 상태를 읽습니다
     */
    async isAutoExecuteCommandsEnabled() {
        // Global 설정을 우선으로 읽기
        const config = vscode.workspace.getConfiguration('codepilot');
        const globalValue = config.inspect('autoExecuteCommands')?.globalValue;
        const value = globalValue ?? config.get('autoExecuteCommands') ?? true;
        console.log(`[SettingsManager] Get autoExecuteCommands: ${value} (global: ${globalValue})`);
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
     * 도구 자동 실행 On/Off 상태를 읽습니다
     */
    async isAutoToolExecutionEnabled() {
        // Global 설정을 우선으로 읽기
        const config = vscode.workspace.getConfiguration('codepilot');
        const globalValue = config.inspect('autoToolExecution')?.globalValue;
        const value = globalValue ?? config.get('autoToolExecution') ?? true;
        console.log(`[SettingsManager] Get autoToolExecution: ${value} (global: ${globalValue})`);
        return value;
    }
    /**
     * 도구 자동 실행 On/Off 상태를 저장합니다
     */
    async updateAutoToolExecutionEnabled(enabled) {
        console.log(`[SettingsManager] Update autoToolExecution -> ${enabled} (Global)`);
        await this.updateUserSetting('autoToolExecution', enabled, vscode.ConfigurationTarget.Global);
    }
    /**
     * 스트리밍 On/Off 상태를 읽습니다
     */
    async isStreamingEnabled() {
        // Global 설정을 우선으로 읽기
        const config = vscode.workspace.getConfiguration('codepilot');
        const globalValue = config.inspect('streamingEnabled')?.globalValue;
        const value = globalValue ?? config.get('streamingEnabled') ?? false;
        console.log(`[SettingsManager] Get streamingEnabled: ${value} (global: ${globalValue})`);
        return value;
    }
    /**
     * 스트리밍 On/Off 상태를 저장합니다
     */
    async updateStreamingEnabled(enabled) {
        console.log(`[SettingsManager] Update streamingEnabled -> ${enabled} (Global)`);
        await ConfigurationService.updateConfig('streamingEnabled', enabled, vscode.ConfigurationTarget.Global);
    }
    /**
     * 디버그 모드 On/Off 상태를 가져옵니다
     */
    async isDebugEnabled() {
        return ConfigurationService.get('debugEnabled') ?? false;
    }
    /**
     * 디버그 모드 On/Off 상태를 저장합니다
     */
    async updateDebugEnabled(enabled) {
        await this.updateUserSetting('debugEnabled', enabled, vscode.ConfigurationTarget.Global);
    }
    /**
     * 자동 코드 검증 On/Off 상태를 가져옵니다
     */
    async isAutoTestRetryEnabled() {
        // Global 설정을 우선으로 읽기
        const config = vscode.workspace.getConfiguration('codepilot');
        const globalValue = config.inspect('autoTestRetryEnabled')?.globalValue;
        const value = globalValue ?? config.get('autoTestRetryEnabled') ?? false;
        console.log(`[SettingsManager] Get autoTestRetryEnabled: ${value} (global: ${globalValue})`);
        return value;
    }
    /**
     * 자동 코드 검증 On/Off 상태를 저장합니다
     */
    async updateAutoTestRetryEnabled(enabled) {
        console.log(`[SettingsManager] Update autoTestRetryEnabled -> ${enabled} (Global)`);
        await this.updateUserSetting('autoTestRetryEnabled', enabled, vscode.ConfigurationTarget.Global);
    }
    /**
     * 자동 테스트 재시도 횟수를 가져옵니다
     */
    async getTestRetryCount() {
        // Global 설정을 우선으로 읽기
        const config = vscode.workspace.getConfiguration('codepilot');
        const globalValue = config.inspect('testRetryCount')?.globalValue;
        const count = globalValue ?? config.get('testRetryCount') ?? 5;
        const validCount = Math.max(1, Math.min(10, count));
        console.log(`[SettingsManager] Get testRetryCount: ${validCount} (global: ${globalValue})`);
        return validCount;
    }
    /**
     * 자동 테스트 재시도 횟수를 업데이트합니다
     */
    async updateTestRetryCount(count) {
        const validCount = Math.max(1, Math.min(10, count));
        console.log(`[SettingsManager] Update testRetryCount -> ${validCount} (Global)`);
        await this.updateUserSetting('testRetryCount', validCount, vscode.ConfigurationTarget.Global);
    }
}
//# sourceMappingURL=SettingsManager.js.map