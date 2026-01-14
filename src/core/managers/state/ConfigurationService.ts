/**
 * Configuration Service
 * vscode.workspace.getConfiguration의 반복 호출을 추상화하고 캐싱을 제공
 */

import * as vscode from 'vscode';

/**
 * ConfigurationService
 * VS Code 설정을 효율적으로 관리하는 서비스
 */
export class ConfigurationService {
    private static config: vscode.WorkspaceConfiguration | null = null;
    private static configSection = 'codepilot';

    /**
     * Configuration 객체를 가져옵니다 (캐싱됨)
     */
    public static getConfig(): vscode.WorkspaceConfiguration {
        if (!ConfigurationService.config) {
            ConfigurationService.config = vscode.workspace.getConfiguration(ConfigurationService.configSection);
        }
        return ConfigurationService.config;
    }

    /**
     * 설정값을 가져옵니다
     */
    public static get<T>(key: string, defaultValue?: T): T | undefined {
        const config = ConfigurationService.getConfig();
        const value = config.get<T>(key);
        if (value !== undefined) {
            return value;
        }
        return defaultValue;
    }

    /**
     * 설정값을 업데이트합니다
     */
    public static async updateConfig<K extends string>(
        key: K,
        value: any,
        target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Global
    ): Promise<void> {
        const config = ConfigurationService.getConfig();
        await config.update(key, value, target);
        // 설정 변경 시 캐시 무효화
        ConfigurationService.invalidateCache();
    }

    /**
     * 설정 변경을 감지하기 위해 캐시를 무효화합니다
     */
    public static invalidateCache(): void {
        ConfigurationService.config = null;
    }

    /**
     * 설정 섹션을 변경합니다 (테스트용)
     */
    public static setConfigSection(section: string): void {
        ConfigurationService.configSection = section;
        ConfigurationService.config = null;
    }
}

