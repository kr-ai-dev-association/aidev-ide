/**
 * Settings Manager
 * 사용자 설정을 관리하는 클래스
 */

import * as vscode from 'vscode';
import {
    UserSettings,
    WorkspaceSettings,
    SettingChangeEvent,
    SettingChangeListener
} from './types';
import { BaseManager } from '../base/BaseManager';
import { ConfigurationService } from './ConfigurationService';

// @ts-ignore - BaseManager 상속 타입 호환성
export class SettingsManager extends BaseManager {
    private listeners: Set<SettingChangeListener> = new Set();
    private _context: vscode.ExtensionContext;

    private constructor(context: vscode.ExtensionContext) {
        super(context);
        this._context = context;
        this.registerVSCodeSettingsWatcher();
    }

    public static getInstance(context?: vscode.ExtensionContext): SettingsManager {
        // BaseManager의 instances Map을 직접 확인하여 이미 인스턴스가 있는지 체크
        // BaseManager의 private static instances에 접근하기 위해 any로 캐스팅
        const BaseManagerClass = BaseManager as any;
        const instances = BaseManagerClass.instances;
        const key = SettingsManager.name;

        if (instances && instances.has(key)) {
            // 이미 인스턴스가 있으면 context 없이도 반환 가능
            const existing = instances.get(key) as SettingsManager;
            if (existing && existing._context) {
                return existing;
            }
        }

        // 인스턴스가 없고 context도 없으면 에러
        if (!context) {
            throw new Error('SettingsManager requires ExtensionContext for first initialization');
        }

        return BaseManager.getInstance.call(SettingsManager as any, context) as unknown as SettingsManager;
    }

    public override get context(): vscode.ExtensionContext {
        return this._context!;
    }

    /**
     * 사용자 설정을 가져옵니다
     */
    public getUserSettings(): UserSettings {

        return {
            // LLM 설정
            aiModel: ConfigurationService.get<'gemini' | 'ollama'>('aiModel', 'ollama') ?? 'ollama',
            geminiApiKey: ConfigurationService.get<string>('geminiApiKey') ?? '',
            geminiModel: ConfigurationService.get<string>('geminiModel', 'gemini-3-pro-preview') ?? 'gemini-3-pro-preview',
            ollamaUrl: ConfigurationService.get<string>('ollamaUrl') ?? '',
            ollamaModel: ConfigurationService.get<string>('ollamaModel') ?? '',
            useRemoteOllama: ConfigurationService.get<boolean>('useRemoteOllama', false) ?? false,

            // 동작 설정
            autoExecuteCommands: ConfigurationService.get<boolean>('autoExecuteCommands', false) ?? false,
            autoCorrectErrors: ConfigurationService.get<boolean>('autoCorrectErrors', true) ?? true,
            maxErrorRetries: ConfigurationService.get<number>('maxErrorRetries', 3) ?? 3,
            outputLogEnabled: ConfigurationService.get<boolean>('outputLogEnabled', true) ?? true,

            // UI 설정
            theme: ConfigurationService.get<'light' | 'dark' | 'auto'>('theme', 'auto') ?? 'auto',
            showNotifications: ConfigurationService.get<boolean>('showNotifications', true) ?? true,
            showProcessingSteps: (ConfigurationService.get<boolean>('showProcessingSteps', true) ?? true) as boolean,

            // 고급 설정
            maxContextSize: (ConfigurationService.get<number>('maxContextSize', 100000) ?? 100000) as number,
            includeAllSrcFiles: (ConfigurationService.get<boolean>('includeAllSrcFiles', true) ?? true) as boolean,
            customSystemPrompt: ConfigurationService.get<string>('customSystemPrompt')
        };
    }

    /**
     * 사용자 설정을 업데이트합니다
     */
    public async updateUserSetting<K extends keyof UserSettings>(
        key: K,
        value: UserSettings[K],
        target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Global
    ): Promise<void> {
        const oldValue = ConfigurationService.get(key as string);
        await ConfigurationService.updateConfig(key as string, value, target);

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
    public getWorkspaceSettings(projectPath: string): WorkspaceSettings {
        return {
            projectPath,
            excludePatterns: ConfigurationService.get<string[]>('excludePatterns', []),
            includePatterns: ConfigurationService.get<string[]>('includePatterns', []),
            customCommands: ConfigurationService.get<any[]>('customCommands', []),
            environmentVariables: ConfigurationService.get<Record<string, string>>('environmentVariables', {})
        };
    }

    /**
     * 워크스페이스 설정을 업데이트합니다
     */
    public async updateWorkspaceSetting<K extends keyof WorkspaceSettings>(
        key: K,
        value: WorkspaceSettings[K]
    ): Promise<void> {
        await ConfigurationService.updateConfig(key, value, vscode.ConfigurationTarget.Workspace);

        console.log(`[SettingsManager] Updated workspace setting: ${key}`);
    }

    /**
     * 설정 변경 리스너를 등록합니다
     */
    public onSettingChange(listener: SettingChangeListener): void {
        this.listeners.add(listener);
    }

    /**
     * 설정 변경 리스너를 제거합니다
     */
    public offSettingChange(listener: SettingChangeListener): void {
        this.listeners.delete(listener);
    }

    /**
     * 설정 변경 이벤트를 발생시킵니다
     */
    private emitSettingChange(event: SettingChangeEvent): void {
        this.listeners.forEach(listener => {
            try {
                listener(event);
            } catch (error) {
                console.error('[SettingsManager] Listener error:', error);
            }
        });
    }

    /**
     * VS Code 설정 변경 감지
     */
    private registerVSCodeSettingsWatcher(): void {
        vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration('aidevIde')) {
                // 설정 변경 시 캐시 무효화
                ConfigurationService.invalidateCache();
                // 모든 aidevIde 설정이 변경되었음을 알림
                console.log('[SettingsManager] Configuration changed');
            }
        });
    }

    // ===== ConfigurationService 호환 메서드들 =====

    /**
     * 소스 경로를 가져옵니다
     */
    public async getSourcePaths(): Promise<string[]> {
        return ConfigurationService.get<string[]>('sourcePaths') || [];
    }

    /**
     * 소스 경로를 업데이트합니다
     */
    public async updateSourcePaths(paths: string[]): Promise<void> {
        await this.updateUserSetting('sourcePaths' as any, paths, vscode.ConfigurationTarget.Global);
    }

    /**
     * 자동 업데이트 활성화 여부를 가져옵니다
     */
    public async isAutoUpdateEnabled(): Promise<boolean> {
        return ConfigurationService.get<boolean>('autoUpdateFiles') || false;
    }

    /**
     * 자동 업데이트 활성화 여부를 업데이트합니다
     */
    public async updateAutoUpdateEnabled(enabled: boolean): Promise<void> {
        await this.updateUserSetting('autoUpdateFiles' as any, enabled, vscode.ConfigurationTarget.Global);
    }


    /**
     * 현재 워크스페이스 루트 경로를 반환합니다
     */
    public async getProjectRoot(): Promise<string | undefined> {
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
    public async updateProjectRoot(path: string | undefined): Promise<void> {
        const valueToSave = path ? path.replace(/\/$/, '') : '';
        console.log(`[SettingsManager] 프로젝트 Root 설정 시도: "${valueToSave}"`);

        await ConfigurationService.updateConfig('projectRoot', valueToSave, vscode.ConfigurationTarget.Global);
        await new Promise(resolve => setTimeout(resolve, 200));

        let savedValue = ConfigurationService.get<string>('projectRoot');
        console.log(`[SettingsManager] 저장된 프로젝트 Root 값 (첫 번째 확인): "${savedValue}"`);

        if (savedValue !== valueToSave) {
            for (let i = 0; i < 3; i++) {
                await new Promise(resolve => setTimeout(resolve, 300));
                savedValue = ConfigurationService.get<string>('projectRoot');
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
        } else {
            console.log(`[SettingsManager] 프로젝트 Root 설정 성공: "${savedValue}"`);
        }
    }

    /**
     * 언어 설정을 업데이트합니다
     */
    public async updateLanguage(language: string): Promise<void> {
        await this.updateUserSetting('language' as any, language, vscode.ConfigurationTarget.Global);
    }

    /**
     * 현재 언어 설정을 가져옵니다
     */
    public async getLanguage(): Promise<string> {
        return ConfigurationService.get<string>('language', 'ko') || 'ko';
    }

    /**
     * 터미널 데몬 활성화 여부를 가져옵니다
     */
    public async isTerminalDaemonEnabled(): Promise<boolean> {
        return ConfigurationService.get<boolean>('terminalDaemonEnabled') || false;
    }

    /**
     * 터미널 데몬 활성화 여부를 업데이트합니다
     */
    public async updateTerminalDaemonEnabled(enabled: boolean): Promise<void> {
        await this.updateUserSetting('terminalDaemonEnabled' as any, enabled, vscode.ConfigurationTarget.Global);
    }

    /**
     * OUTPUT 로그 활성화 상태를 가져옵니다
     */
    public async isOutputLogEnabled(): Promise<boolean> {
        return ConfigurationService.get<boolean>('outputLogEnabled') ?? true;
    }

    /**
     * OUTPUT 로그 활성화 상태를 업데이트합니다
     */
    public async updateOutputLogEnabled(enabled: boolean): Promise<void> {
        await this.updateUserSetting('outputLogEnabled' as any, enabled, vscode.ConfigurationTarget.Global);
    }

    /**
     * 자동 오류 수정 횟수를 가져옵니다
     */
    public async getErrorRetryCount(): Promise<number> {
        const count = ConfigurationService.get<number>('errorRetryCount') ?? 3;
        return Math.max(1, Math.min(10, count));
    }

    /**
     * 자동 오류 수정 횟수를 업데이트합니다
     */
    public async updateErrorRetryCount(count: number): Promise<void> {
        const validCount = Math.max(1, Math.min(10, count));
        await this.updateUserSetting('errorRetryCount' as any, validCount, vscode.ConfigurationTarget.Global);
    }

    /**
     * 자동 오류 수정 On/Off 상태를 가져옵니다
     */
    public async isAutoCorrectionEnabled(): Promise<boolean> {
        const value = ConfigurationService.get<boolean>('autoCorrectionEnabled') ?? false;
        // console.log(`[SettingsManager] Read autoCorrectionEnabled: ${value}`);
        return value;
    }

    /**
     * 자동 오류 수정 On/Off 상태를 저장합니다
     */
    public async updateAutoCorrectionEnabled(enabled: boolean): Promise<void> {
        console.log(`[SettingsManager] Update autoCorrectionEnabled -> ${enabled} (Workspace)`);
        await ConfigurationService.updateConfig('autoCorrectionEnabled', enabled, vscode.ConfigurationTarget.Workspace);
    }

    /**
     * 명령어 자동 실행 On/Off 상태를 읽습니다
     */
    public async isAutoExecuteCommandsEnabled(): Promise<boolean> {
        const value = ConfigurationService.get<boolean>('autoExecuteCommands') ?? true;
        // console.log(`[SettingsManager] Read autoExecuteCommands: ${value}`);
        return value;
    }

    /**
     * 명령어 자동 실행 On/Off 상태를 저장합니다
     */
    public async updateAutoExecuteCommandsEnabled(enabled: boolean): Promise<void> {
        console.log(`[SettingsManager] Update autoExecuteCommands -> ${enabled} (Global)`);
        await this.updateUserSetting('autoExecuteCommands' as any, enabled, vscode.ConfigurationTarget.Global);
    }

    /**
     * 디버그 모드 On/Off 상태를 가져옵니다
     */
    public async isDebugEnabled(): Promise<boolean> {
        return ConfigurationService.get<boolean>('debugEnabled') ?? false;
    }

    /**
     * 디버그 모드 On/Off 상태를 저장합니다
     */
    public async updateDebugEnabled(enabled: boolean): Promise<void> {
        await this.updateUserSetting('debugEnabled' as any, enabled, vscode.ConfigurationTarget.Global);
    }

    /**
     * 자동 테스트 실패 시 재시도 On/Off 상태를 가져옵니다
     */
    public async isAutoTestRetryEnabled(): Promise<boolean> {
        // 워크스페이스 설정을 명시적으로 읽기
        const config = vscode.workspace.getConfiguration('aidevIde');
        const workspaceValue = config.inspect<boolean>('autoTestRetryEnabled')?.workspaceValue;
        const workspaceFolderValue = config.inspect<boolean>('autoTestRetryEnabled')?.workspaceFolderValue;
        const value = workspaceFolderValue ?? workspaceValue ?? config.get<boolean>('autoTestRetryEnabled') ?? false;
        console.log(`[SettingsManager] Get autoTestRetryEnabled: ${value} (workspaceFolder: ${workspaceFolderValue}, workspace: ${workspaceValue})`);
        return value;
    }

    /**
     * 자동 테스트 실패 시 재시도 On/Off 상태를 저장합니다
     */
    public async updateAutoTestRetryEnabled(enabled: boolean): Promise<void> {
        console.log(`[SettingsManager] Update autoTestRetryEnabled -> ${enabled} (Workspace)`);
        await this.updateUserSetting('autoTestRetryEnabled' as any, enabled, vscode.ConfigurationTarget.Workspace);
    }

    /**
     * 자동 테스트 재시도 횟수를 가져옵니다
     */
    public async getTestRetryCount(): Promise<number> {
        // 워크스페이스 설정을 명시적으로 읽기
        const config = vscode.workspace.getConfiguration('aidevIde');
        const workspaceValue = config.inspect<number>('testRetryCount')?.workspaceValue;
        const workspaceFolderValue = config.inspect<number>('testRetryCount')?.workspaceFolderValue;
        const count = workspaceFolderValue ?? workspaceValue ?? config.get<number>('testRetryCount') ?? 3;
        const validCount = Math.max(1, Math.min(10, count));
        console.log(`[SettingsManager] Get testRetryCount: ${validCount} (workspaceFolder: ${workspaceFolderValue}, workspace: ${workspaceValue})`);
        return validCount;
    }

    /**
     * 자동 테스트 재시도 횟수를 업데이트합니다
     */
    public async updateTestRetryCount(count: number): Promise<void> {
        const validCount = Math.max(1, Math.min(10, count));
        console.log(`[SettingsManager] Update testRetryCount -> ${validCount} (Workspace)`);
        await this.updateUserSetting('testRetryCount' as any, validCount, vscode.ConfigurationTarget.Workspace);
    }
}

