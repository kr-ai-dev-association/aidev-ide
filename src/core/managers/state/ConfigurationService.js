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
    static config = null;
    static configSection = 'codepilot';
    /**
     * Configuration 객체를 가져옵니다 (캐싱됨)
     */
    static getConfig() {
        if (!ConfigurationService.config) {
            ConfigurationService.config = vscode.workspace.getConfiguration(ConfigurationService.configSection);
        }
        return ConfigurationService.config;
    }
    /**
     * 설정값을 가져옵니다
     */
    static get(key, defaultValue) {
        const config = ConfigurationService.getConfig();
        const value = config.get(key);
        if (value !== undefined) {
            return value;
        }
        return defaultValue;
    }
    /**
     * 설정값을 업데이트합니다
     */
    static async updateConfig(key, value, target = vscode.ConfigurationTarget.Global) {
        const config = ConfigurationService.getConfig();
        await config.update(key, value, target);
        // 설정 변경 시 캐시 무효화
        ConfigurationService.invalidateCache();
    }
    /**
     * 설정 변경을 감지하기 위해 캐시를 무효화합니다
     */
    static invalidateCache() {
        ConfigurationService.config = null;
    }
    /**
     * 설정 섹션을 변경합니다 (테스트용)
     */
    static setConfigSection(section) {
        ConfigurationService.configSection = section;
        ConfigurationService.config = null;
    }
}
//# sourceMappingURL=ConfigurationService.js.map