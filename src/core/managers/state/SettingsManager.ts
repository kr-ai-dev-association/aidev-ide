/**
 * Settings Manager
 * 사용자 설정을 관리하는 클래스
 * v10.0: 백엔드 설정 동기화 (effective settings)
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

/**
 * 백엔드에서 받은 effective setting 항목
 */
interface EffectiveSetting {
    key: string;
    value: any;
    enforcement: 'required' | 'recommended';
    source: 'admin' | 'user' | 'preset';
    group?: string;
    skill_type?: string;
    skill_description?: string;
}

/**
 * 카테고리별 캐시된 서버 설정
 */
interface ServerSettingsCache {
    settings: Record<string, EffectiveSetting[]>;
    fetchedAt: number;
}

// @ts-ignore - BaseManager 상속 타입 호환성
export class SettingsManager extends BaseManager {
    private listeners: Set<SettingChangeListener> = new Set();
    private _context: vscode.ExtensionContext;
    private serverSettingsCache: ServerSettingsCache | null = null;
    private readonly OFFLINE_CACHE_KEY = 'codepilot.serverSettingsCache';
    private readonly DISABLED_SETTINGS_KEY = 'codepilot.disabledRecommendedSettings';
    private constructor(context: vscode.ExtensionContext) {
        super(context);
        this._context = context;
        this.registerVSCodeSettingsWatcher();
        this.loadOfflineCache();
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

    // ===== 백엔드 설정 동기화 =====

    /**
     * 오프라인 캐시 로드 (초기화 시)
     */
    private loadOfflineCache(): void {
        // standalone: 서버 캐시 무시, 빌트인 AI 모델 프리셋만 사용
        this.serverSettingsCache = {
            fetchedAt: Date.now(),
            settings: {
                ai_model: [
                    // Google (Gemini) - OpenAI 호환 엔드포인트
                    { key: 'gemini-3.1-pro-preview', source: 'preset', group: 'gemini', enforcement: 'recommended', value: { name: 'Gemini 3.1 Pro', provider: 'openai', model: 'gemini-3.1-pro-preview', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', authType: 'bearer', streamingSupported: true, contextWindow: 1048576 } },
                    { key: 'gemini-3-flash-preview', source: 'preset', group: 'gemini', enforcement: 'recommended', value: { name: 'Gemini 3 Flash', provider: 'openai', model: 'gemini-3-flash-preview', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', authType: 'bearer', streamingSupported: true, contextWindow: 1048576 } },
                    { key: 'gemini-2.5-pro', source: 'preset', group: 'gemini', enforcement: 'recommended', value: { name: 'Gemini 2.5 Pro', provider: 'openai', model: 'gemini-2.5-pro', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', authType: 'bearer', streamingSupported: true, contextWindow: 1048576 } },
                    { key: 'gemini-2.5-flash', source: 'preset', group: 'gemini', enforcement: 'recommended', value: { name: 'Gemini 2.5 Flash', provider: 'openai', model: 'gemini-2.5-flash', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', authType: 'bearer', streamingSupported: true, contextWindow: 1048576 } },
                    // OpenAI
                    { key: 'gpt-5.4', source: 'preset', group: 'openai', enforcement: 'recommended', value: { name: 'GPT-5.4', provider: 'openai', model: 'gpt-5.4', baseUrl: 'https://api.openai.com/v1/chat/completions', authType: 'bearer', streamingSupported: true, contextWindow: 1047576 } },
                    { key: 'gpt-5.4-pro', source: 'preset', group: 'openai', enforcement: 'recommended', value: { name: 'GPT-5.4 Pro', provider: 'openai', model: 'gpt-5.4-pro', baseUrl: 'https://api.openai.com/v1/chat/completions', authType: 'bearer', streamingSupported: true, contextWindow: 1047576 } },
                    { key: 'gpt-5.3-codex', source: 'preset', group: 'openai', enforcement: 'recommended', value: { name: 'GPT-5.3 Codex', provider: 'openai', model: 'gpt-5.3-codex', baseUrl: 'https://api.openai.com/v1/chat/completions', authType: 'bearer', streamingSupported: true, contextWindow: 1047576 } },
                    { key: 'gpt-5-mini', source: 'preset', group: 'openai', enforcement: 'recommended', value: { name: 'GPT-5 Mini', provider: 'openai', model: 'gpt-5-mini', baseUrl: 'https://api.openai.com/v1/chat/completions', authType: 'bearer', streamingSupported: true, contextWindow: 1047576 } },
                    { key: 'gpt-4.1', source: 'preset', group: 'openai', enforcement: 'recommended', value: { name: 'GPT-4.1', provider: 'openai', model: 'gpt-4.1', baseUrl: 'https://api.openai.com/v1/chat/completions', authType: 'bearer', streamingSupported: true, contextWindow: 1047576 } },
                    // Anthropic (Claude)
                    { key: 'claude-opus-4-6', source: 'preset', group: 'claude', enforcement: 'recommended', value: { name: 'Claude Opus 4.6', provider: 'anthropic', model: 'claude-opus-4-6', baseUrl: 'https://api.anthropic.com', authType: 'x-api-key', streamingSupported: true, contextWindow: 200000 } },
                    { key: 'claude-sonnet-4-6', source: 'preset', group: 'claude', enforcement: 'recommended', value: { name: 'Claude Sonnet 4.6', provider: 'anthropic', model: 'claude-sonnet-4-6', baseUrl: 'https://api.anthropic.com', authType: 'x-api-key', streamingSupported: true, contextWindow: 200000 } },
                    { key: 'claude-haiku-4-5', source: 'preset', group: 'claude', enforcement: 'recommended', value: { name: 'Claude Haiku 4.5', provider: 'anthropic', model: 'claude-haiku-4-5-20251001', baseUrl: 'https://api.anthropic.com', authType: 'x-api-key', streamingSupported: true, contextWindow: 200000 } },
                ],
            },
        };
    }

    /**
     * 특정 카테고리의 서버 설정 가져오기
     */
    public getServerSettings(category: string): EffectiveSetting[] {
        if (!this.serverSettingsCache?.settings) return [];
        const data = this.serverSettingsCache.settings[category];
        return Array.isArray(data) ? data : [];
    }

    /**
     * 특정 키의 서버 설정값 가져오기
     * required 설정은 로컬 설정보다 우선
     */
    public getServerSettingValue(category: string, key: string): { value: any; enforcement: string } | null {
        const settings = this.getServerSettings(category);
        const setting = settings.find(s => s.key === key);
        if (!setting) return null;
        return { value: setting.value, enforcement: setting.enforcement };
    }

    /**
     * required 설정을 로컬 VS Code 설정에 강제 적용
     */
    private applyRequiredSettings(): void {
        if (!this.serverSettingsCache?.settings) return;

        const settingKeyMap: Record<string, string> = {
            // ai_model 카테고리
            'default_model': 'aiModel',
            'ollama_model': 'ollamaModel',
            'ollama_url': 'ollamaUrl',
            // dev_rules 카테고리
            'auto_execute_commands': 'autoExecuteCommands',
            'auto_correction_enabled': 'autoCorrectionEnabled',
            'error_retry_count': 'errorRetryCount',
            'auto_tool_execution': 'autoToolExecution',
            'auto_mcp_tool_execution': 'autoMcpToolExecution',
            'streaming_enabled': 'streamingEnabled',
            // build_test 카테고리
            'validation_command': 'validationCommand',
            'formatter_command': 'formatterCommand',
            // exclude_patterns 카테고리
            'exclude_patterns': 'excludePatterns',
            // security_rules 카테고리
            'max_context_size': 'maxContextSize',
        };

        for (const [_category, settings] of Object.entries(this.serverSettingsCache.settings)) {
            if (!Array.isArray(settings)) continue;
            const requiredSettings = settings.filter((s: any) => s.enforcement === 'required');
            for (const setting of requiredSettings) {
                const localKey = settingKeyMap[setting.key];
                if (localKey) {
                    const currentValue = ConfigurationService.get(localKey);
                    if (currentValue !== setting.value) {
                        ConfigurationService.updateConfig(localKey, setting.value, vscode.ConfigurationTarget.Global)
                            .catch(err => console.warn(`[SettingsManager] Failed to apply required setting ${setting.key}:`, err));
                        console.log(`[SettingsManager] Applied required setting: ${setting.key} = ${JSON.stringify(setting.value)}`);
                    }
                }
            }
        }
    }

    /**
     * 설정값을 읽을 때 서버 required 값 우선 반환
     */
    private getEffectiveValue<T>(localKey: string, serverCategory: string, serverKey: string, localValue: T): T {
        const serverSetting = this.getServerSettingValue(serverCategory, serverKey);
        if (serverSetting && serverSetting.enforcement === 'required') {
            return serverSetting.value as T;
        }
        return localValue;
    }

    /**
     * 설정이 관리자에 의해 잠겨있는지 확인
     */
    public isSettingLocked(category: string, key: string): boolean {
        const setting = this.getServerSettingValue(category, key);
        return setting?.enforcement === 'required';
    }

    // ===== 서버 설정 통합 API (설정 패널용) =====

    /**
     * 전체 서버 설정 반환 (설정 패널에서 조직 설정 표시용)
     * is_disabled는 로컬 globalState에서 조회
     */
    public getAllServerSettings(): Record<string, Array<EffectiveSetting & { is_disabled: boolean }>> {
        if (!this.serverSettingsCache?.settings) return {};
        const disabled = this.getDisabledSettingsSet();
        const result: Record<string, Array<EffectiveSetting & { is_disabled: boolean }>> = {};
        for (const [category, settings] of Object.entries(this.serverSettingsCache.settings)) {
            // 배열이 아닌 경우 안전하게 건너뜀
            if (!Array.isArray(settings)) {
                console.warn(`[SettingsManager] Skipping non-array settings for category: ${category}`);
                continue;
            }
            result[category] = settings.map((s: any) => ({
                ...s,
                is_disabled: s.enforcement === 'required' ? false : disabled.has(`${category}:${s.key}`),
            }));
        }
        return result;
    }

    /**
     * 로컬에 저장된 비활성화 설정 Set 반환
     */
    private getDisabledSettingsSet(): Set<string> {
        const list = this._context.globalState.get<string[]>(this.DISABLED_SETTINGS_KEY, []);
        return new Set(list);
    }

    /**
     * 권장 설정 로컬 비활성화/활성화 토글
     * required 설정은 토글 불가
     */
    public async toggleRecommendedSetting(category: string, key: string, disabled: boolean): Promise<void> {
        // required 설정은 비활성화 불가
        if (this.isSettingLocked(category, key)) {
            console.warn(`[SettingsManager] Cannot disable required setting: ${category}/${key}`);
            return;
        }

        const disabledList = this._context.globalState.get<string[]>(this.DISABLED_SETTINGS_KEY, []);
        const settingId = `${category}:${key}`;
        const set = new Set(disabledList);

        if (disabled) {
            set.add(settingId);
        } else {
            set.delete(settingId);
        }

        await this._context.globalState.update(this.DISABLED_SETTINGS_KEY, Array.from(set));
        console.log(`[SettingsManager] Setting ${settingId} ${disabled ? 'disabled' : 'enabled'} locally`);
    }

    /**
     * 특정 설정이 로컬에서 비활성화되었는지 확인
     */
    public isSettingDisabled(category: string, key: string): boolean {
        const disabled = this.getDisabledSettingsSet();
        return disabled.has(`${category}:${key}`);
    }

    // ===== 카테고리별 서버 설정 접근 API =====

    /**
     * 서버 Skills(dev_rules) 목록
     * 로컬에서 비활성화한 권장 설정은 제외
     */
    public getServerDevRules(): { key: string; content: string; enforcement: string; title?: string; skill_type?: string; skill_description?: string }[] {
        const disabled = this.getDisabledSettingsSet();
        return this.getServerSettings('dev_rules')
            .filter(s => s.enforcement === 'required' || !disabled.has(`dev_rules:${s.key}`))
            .map(s => ({
                key: s.key,
                content: typeof s.value === 'string' ? s.value : (s.value?.content || JSON.stringify(s.value)),
                enforcement: s.enforcement,
                title: s.value?.title,
                skill_type: s.skill_type || 'rule',
                skill_description: s.skill_description || '',
            }));
    }

    /**
     * 서버 빌드/테스트 설정
     */
    public getServerBuildTestConfigs(): { key: string; value: any; enforcement: string }[] {
        return this.getServerSettings('build_test').map(s => ({
            key: s.key,
            value: s.value,
            enforcement: s.enforcement,
        }));
    }

    /**
     * 개인 빌드/테스트 설정 (로컬 globalState)
     */
    public getPersonalBuildTestConfigs(): { key: string; value: any; description: string }[] {
        return this._context.globalState.get<any[]>('personalBuildTestSettings', []);
    }

    /**
     * 서버 핫로드 설정 목록
     */
    public getServerHotLoadConfigs(): { key: string; value: any; enforcement: string }[] {
        return this.getServerSettings('hotload').map(s => ({
            key: s.key,
            value: s.value,
            enforcement: s.enforcement,
        }));
    }

    /**
     * 서버 보안 규칙 목록 (차단 명령어 + 보호 파일)
     */
    public getServerSecurityRules(): { key: string; pattern: string; enforcement: string; description: string; type: string }[] {
        return this.getServerSettings('security_rules').map(s => ({
            key: s.key,
            pattern: typeof s.value === 'string' ? s.value : (s.value?.pattern || ''),
            enforcement: s.enforcement,
            description: typeof s.value === 'object' ? (s.value?.description || s.key) : s.key,
            type: (s.value?.type as string) || 'blocked_command',
        }));
    }

    /**
     * 서버 제외 패턴 목록
     */
    public getServerExcludePatterns(): { key: string; pattern: string; enforcement: string }[] {
        return this.getServerSettings('exclude_patterns').map(s => ({
            key: s.key,
            pattern: typeof s.value === 'string' ? s.value : (s.value?.pattern || ''),
            enforcement: s.enforcement,
        }));
    }

    // ===== 기존 설정 관리 =====

    /**
     * 사용자 설정을 가져옵니다
     */
    public getUserSettings(): UserSettings {
        const localSettings: UserSettings = {
            // LLM 설정
            aiModel: ConfigurationService.get<'ollama' | 'admin'>('aiModel', 'ollama') ?? 'ollama',
            ollamaUrl: ConfigurationService.get<string>('ollamaUrl') ?? '',
            ollamaModel: ConfigurationService.get<string>('ollamaModel') ?? '',
            useRemoteOllama: ConfigurationService.get<boolean>('useRemoteOllama', false) ?? false,

            // 동작 설정
            autoExecuteCommands: ConfigurationService.get<boolean>('autoExecuteCommands', false) ?? false,
            autoCorrectErrors: ConfigurationService.get<boolean>('autoCorrectErrors', true) ?? true,
            maxErrorRetries: ConfigurationService.get<number>('maxErrorRetries', 3) ?? 3,

            // UI 설정
            theme: ConfigurationService.get<'light' | 'dark' | 'auto'>('theme', 'auto') ?? 'auto',
            showNotifications: ConfigurationService.get<boolean>('showNotifications', true) ?? true,
            showProcessingSteps: (ConfigurationService.get<boolean>('showProcessingSteps', true) ?? true) as boolean,

            // 고급 설정
            maxContextSize: (ConfigurationService.get<number>('maxContextSize', 100000) ?? 100000) as number,
            includeAllSrcFiles: (ConfigurationService.get<boolean>('includeAllSrcFiles', true) ?? true) as boolean,
            customSystemPrompt: ConfigurationService.get<string>('customSystemPrompt')
        };

        // 서버 required 설정 오버라이드
        if (this.serverSettingsCache?.settings) {
            // ai_model
            localSettings.aiModel = this.getEffectiveValue(
                'aiModel', 'ai_model', 'default_model', localSettings.aiModel
            );
            localSettings.ollamaModel = this.getEffectiveValue(
                'ollamaModel', 'ai_model', 'ollama_model', localSettings.ollamaModel
            );
            localSettings.ollamaUrl = this.getEffectiveValue(
                'ollamaUrl', 'ai_model', 'ollama_url', localSettings.ollamaUrl
            );
            // dev_rules
            localSettings.autoExecuteCommands = this.getEffectiveValue(
                'autoExecuteCommands', 'dev_rules', 'auto_execute_commands', localSettings.autoExecuteCommands
            );
            localSettings.autoCorrectErrors = this.getEffectiveValue(
                'autoCorrectErrors', 'dev_rules', 'auto_correction_enabled', localSettings.autoCorrectErrors
            );
            localSettings.maxErrorRetries = this.getEffectiveValue(
                'maxErrorRetries', 'dev_rules', 'error_retry_count', localSettings.maxErrorRetries
            );
            // security_rules
            localSettings.maxContextSize = this.getEffectiveValue(
                'maxContextSize', 'security_rules', 'max_context_size', localSettings.maxContextSize
            );
        }

        return localSettings;
    }

    /**
     * 사용자 설정을 업데이트합니다
     * required로 잠긴 설정은 업데이트 차단
     */
    public async updateUserSetting<K extends keyof UserSettings>(
        key: K,
        value: UserSettings[K],
        target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Global
    ): Promise<void> {
        // required 설정 잠금 체크 (카테고리-키 매핑)
        const lockCheckMap: Record<string, [string, string]> = {
            'aiModel': ['ai_model', 'default_model'],
            'ollamaModel': ['ai_model', 'ollama_model'],
            'ollamaUrl': ['ai_model', 'ollama_url'],
            'autoExecuteCommands': ['dev_rules', 'auto_execute_commands'],
            'autoCorrectionEnabled': ['dev_rules', 'auto_correction_enabled'],
            'errorRetryCount': ['dev_rules', 'error_retry_count'],
            'autoToolExecution': ['dev_rules', 'auto_tool_execution'],
            'autoMcpToolExecution': ['dev_rules', 'auto_mcp_tool_execution'],
            'streamingEnabled': ['dev_rules', 'streaming_enabled'],
            'maxContextSize': ['security_rules', 'max_context_size'],
            'excludePatterns': ['exclude_patterns', 'exclude_patterns'],
        };

        const lockInfo = lockCheckMap[key as string];
        if (lockInfo && this.isSettingLocked(lockInfo[0], lockInfo[1])) {
            console.warn(`[SettingsManager] Setting "${String(key)}" is locked by admin (required)`);
            vscode.window.showWarningMessage(`이 설정은 관리자에 의해 잠겨있습니다: ${String(key)}`);
            return;
        }

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

        // 서버에 사용자 설정 동기화 (비동기, 실패 무시)
        this.syncUserSettingToServer(key as string, value).catch(() => {});

        console.log(`[SettingsManager] Updated setting: ${key}`);
    }

    /**
     * 사용자 설정 변경을 백엔드에 동기화
     */
    private async syncUserSettingToServer(_key: string, _value: any): Promise<void> {
        // No-op in standalone mode (no backend server)
        return;
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
        // Global 설정을 우선으로 읽기
        const config = vscode.workspace.getConfiguration('codepilot');
        const globalValue = config.inspect<boolean>('autoUpdateFiles')?.globalValue;
        const value = globalValue ?? config.get<boolean>('autoUpdateFiles') ?? false;
        return value;
    }

    /**
     * 자동 업데이트 활성화 여부를 업데이트합니다
     */
    public async updateAutoUpdateEnabled(enabled: boolean): Promise<void> {
        await this.updateUserSetting('autoUpdateFiles' as any, enabled, vscode.ConfigurationTarget.Global);
    }

    /**
     * 자동 파일 삭제 On/Off 상태를 읽습니다
     */
    public async isAutoDeleteFilesEnabled(): Promise<boolean> {
        // Global 설정을 우선으로 읽기
        const config = vscode.workspace.getConfiguration('codepilot');
        const globalValue = config.inspect<boolean>('autoDeleteFiles')?.globalValue;
        const value = globalValue ?? config.get<boolean>('autoDeleteFiles') ?? false;
        return value;
    }

    /**
     * 자동 파일 삭제 On/Off 상태를 저장합니다
     */
    public async updateAutoDeleteFilesEnabled(enabled: boolean): Promise<void> {
        await this.updateUserSetting('autoDeleteFiles' as any, enabled, vscode.ConfigurationTarget.Global);
    }

    /**
     * 현재 워크스페이스 루트 경로를 반환합니다
     */
    public async getProjectRoot(): Promise<string | undefined> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            const workspaceRoot = workspaceFolders[0].uri.fsPath;
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
        await ConfigurationService.updateConfig('projectRoot', valueToSave, vscode.ConfigurationTarget.Global);
        await new Promise(resolve => setTimeout(resolve, 200));

        let savedValue = ConfigurationService.get<string>('projectRoot');

        if (savedValue !== valueToSave) {
            for (let i = 0; i < 3; i++) {
                await new Promise(resolve => setTimeout(resolve, 300));
                savedValue = ConfigurationService.get<string>('projectRoot');
                if (savedValue === valueToSave) {
                    break;
                }
            }
        }

        const normalizedSaved = savedValue ? savedValue.replace(/[\\/]$/, '') : '';
        const normalizedExpected = valueToSave ? valueToSave.replace(/[\\/]$/, '') : '';

        if (normalizedSaved !== normalizedExpected) {
            console.warn(`[SettingsManager] 프로젝트 Root 설정 불일치: 예상값 "${normalizedExpected}", 실제값 "${normalizedSaved}"`);
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
     * 자동 오류 수정 횟수를 가져옵니다
     */
    public async getErrorRetryCount(): Promise<number> {
        const count = ConfigurationService.get<number>('errorRetryCount') ?? 5;
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
        // Global 설정을 우선으로 읽기
        const config = vscode.workspace.getConfiguration('codepilot');
        const globalValue = config.inspect<boolean>('autoCorrectionEnabled')?.globalValue;
        const value = globalValue ?? config.get<boolean>('autoCorrectionEnabled') ?? false;
        return value;
    }

    /**
     * 자동 오류 수정 On/Off 상태를 저장합니다
     */
    public async updateAutoCorrectionEnabled(enabled: boolean): Promise<void> {
        await ConfigurationService.updateConfig('autoCorrectionEnabled', enabled, vscode.ConfigurationTarget.Global);
    }

    /**
     * 명령어 자동 실행 On/Off 상태를 읽습니다
     */
    public async isAutoExecuteCommandsEnabled(): Promise<boolean> {
        // Global 설정을 우선으로 읽기
        const config = vscode.workspace.getConfiguration('codepilot');
        const globalValue = config.inspect<boolean>('autoExecuteCommands')?.globalValue;
        const value = globalValue ?? config.get<boolean>('autoExecuteCommands') ?? true;
        return value;
    }

    /**
     * 명령어 자동 실행 On/Off 상태를 저장합니다
     */
    public async updateAutoExecuteCommandsEnabled(enabled: boolean): Promise<void> {
        await this.updateUserSetting('autoExecuteCommands' as any, enabled, vscode.ConfigurationTarget.Global);
    }

    /**
     * 도구 자동 실행 On/Off 상태를 읽습니다
     */
    public async isAutoToolExecutionEnabled(): Promise<boolean> {
        // Global 설정을 우선으로 읽기
        const config = vscode.workspace.getConfiguration('codepilot');
        const globalValue = config.inspect<boolean>('autoToolExecution')?.globalValue;
        const value = globalValue ?? config.get<boolean>('autoToolExecution') ?? true;
        return value;
    }

    /**
     * 도구 자동 실행 On/Off 상태를 저장합니다
     */
    public async updateAutoToolExecutionEnabled(enabled: boolean): Promise<void> {
        await this.updateUserSetting('autoToolExecution' as any, enabled, vscode.ConfigurationTarget.Global);
    }

    /**
     * MCP 도구 자동 실행 On/Off 상태를 읽습니다
     */
    public async isAutoMcpToolExecutionEnabled(): Promise<boolean> {
        const config = vscode.workspace.getConfiguration('codepilot');
        const globalValue = config.inspect<boolean>('autoMcpToolExecution')?.globalValue;
        const value = globalValue ?? config.get<boolean>('autoMcpToolExecution') ?? false;
        return value;
    }

    /**
     * MCP 도구 자동 실행 On/Off 상태를 저장합니다
     */
    public async updateAutoMcpToolExecutionEnabled(enabled: boolean): Promise<void> {
        await this.updateUserSetting('autoMcpToolExecution' as any, enabled, vscode.ConfigurationTarget.Global);
    }

    /**
     * 오케스트레이션 On/Off 상태를 읽습니다
     */
    public async isOrchestrationEnabled(): Promise<boolean> {
        const config = vscode.workspace.getConfiguration('codepilot');
        const globalValue = config.inspect<boolean>('orchestration')?.globalValue;
        const value = globalValue ?? config.get<boolean>('orchestration') ?? false;
        return value;
    }

    /**
     * 오케스트레이션 On/Off 상태를 저장합니다
     */
    public async updateOrchestrationEnabled(enabled: boolean): Promise<void> {
        await this.updateUserSetting('orchestration' as any, enabled, vscode.ConfigurationTarget.Global);
    }

    /**
     * 스트리밍 On/Off 상태를 읽습니다
     */
    public async isStreamingEnabled(): Promise<boolean> {
        // Global 설정을 우선으로 읽기
        const config = vscode.workspace.getConfiguration('codepilot');
        const globalValue = config.inspect<boolean>('streamingEnabled')?.globalValue;
        const value = globalValue ?? config.get<boolean>('streamingEnabled') ?? false;
        return value;
    }

    /**
     * 스트리밍 On/Off 상태를 저장합니다
     */
    public async updateStreamingEnabled(enabled: boolean): Promise<void> {
        await ConfigurationService.updateConfig('streamingEnabled', enabled, vscode.ConfigurationTarget.Global);
    }

    /**
     * 네이티브 툴 콜링 On/Off 상태를 읽습니다
     */
    public async isNativeToolCallingEnabled(): Promise<boolean> {
        const config = vscode.workspace.getConfiguration('codepilot');
        const globalValue = config.inspect<boolean>('nativeToolCallingEnabled')?.globalValue;
        return globalValue ?? (config.get('nativeToolCallingEnabled') as boolean) ?? true;
    }

    /**
     * 네이티브 툴 콜링 On/Off 상태를 저장합니다
     */
    public async updateNativeToolCallingEnabled(enabled: boolean): Promise<void> {
        await ConfigurationService.updateConfig('nativeToolCallingEnabled', enabled, vscode.ConfigurationTarget.Global);
    }

    public async isThinkingEnabled(): Promise<boolean> {
        const config = vscode.workspace.getConfiguration('codepilot');
        const globalValue = config.inspect<boolean>('thinkingEnabled')?.globalValue;
        return globalValue ?? (config.get('thinkingEnabled') as boolean) ?? true;
    }

    public async updateThinkingEnabled(enabled: boolean): Promise<void> {
        await ConfigurationService.updateConfig('thinkingEnabled', enabled, vscode.ConfigurationTarget.Global);
    }

    /**
     * Thinking 레벨을 읽습니다 (low/medium/high)
     */
    public async getThinkingLevel(): Promise<string> {
        const config = vscode.workspace.getConfiguration('codepilot');
        const globalValue = config.inspect<string>('thinkingLevel')?.globalValue;
        return globalValue ?? (config.get('thinkingLevel') as string) ?? 'medium';
    }

    /**
     * Thinking 레벨을 저장합니다
     */
    public async updateThinkingLevel(level: string): Promise<void> {
        await ConfigurationService.updateConfig('thinkingLevel', level, vscode.ConfigurationTarget.Global);
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
     * 자동 코드 검증 On/Off 상태를 가져옵니다
     */
    public async isAutoTestRetryEnabled(): Promise<boolean> {
        // Global 설정을 우선으로 읽기
        const config = vscode.workspace.getConfiguration('codepilot');
        const globalValue = config.inspect<boolean>('autoTestRetryEnabled')?.globalValue;
        const value = globalValue ?? config.get<boolean>('autoTestRetryEnabled') ?? false;
        return value;
    }

    /**
     * 자동 코드 검증 On/Off 상태를 저장합니다
     */
    public async updateAutoTestRetryEnabled(enabled: boolean): Promise<void> {
        await this.updateUserSetting('autoTestRetryEnabled' as any, enabled, vscode.ConfigurationTarget.Global);
    }

    /**
     * 자동 테스트 재시도 횟수를 가져옵니다
     */
    public async getTestRetryCount(): Promise<number> {
        // Global 설정을 우선으로 읽기
        const config = vscode.workspace.getConfiguration('codepilot');
        const globalValue = config.inspect<number>('testRetryCount')?.globalValue;
        const count = globalValue ?? config.get<number>('testRetryCount') ?? 5;
        const validCount = Math.max(1, Math.min(10, count));
        return validCount;
    }

    /**
     * 자동 테스트 재시도 횟수를 업데이트합니다
     */
    public async updateTestRetryCount(count: number): Promise<void> {
        const validCount = Math.max(1, Math.min(10, count));
        await this.updateUserSetting('testRetryCount' as any, validCount, vscode.ConfigurationTarget.Global);
    }
}

