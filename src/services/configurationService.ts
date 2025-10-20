import * as vscode from 'vscode';

export class ConfigurationService {
    private readonly CONFIG_SECTION = 'aidevIde';
    private readonly SOURCE_PATHS_KEY = 'sourcePaths';
    private readonly AUTO_UPDATE_KEY = 'autoUpdateFiles';
    private readonly PROJECT_ROOT_KEY = 'projectRoot';
    private readonly WEATHER_API_KEY = 'weatherApiKey';
    private readonly NEWS_API_KEY = 'newsApiKey';
    private readonly NEWS_API_SECRET = 'newsApiSecret';
    private readonly STOCK_API_KEY = 'stockApiKey';
    private readonly TERMINAL_DAEMON_ENABLED = 'terminalDaemonEnabled';
    private readonly OUTPUT_LOG_ENABLED = 'outputLogEnabled';
    private readonly ERROR_RETRY_COUNT = 'errorRetryCount';
    private readonly AUTO_CORRECTION_ENABLED = 'autoCorrectionEnabled';

    constructor() { }

    public async getSourcePaths(): Promise<string[]> {
        const config = vscode.workspace.getConfiguration(this.CONFIG_SECTION);
        return config.get<string[]>(this.SOURCE_PATHS_KEY) || [];
    }

    public async updateSourcePaths(paths: string[]): Promise<void> {
        const config = vscode.workspace.getConfiguration(this.CONFIG_SECTION);
        await config.update(this.SOURCE_PATHS_KEY, paths, vscode.ConfigurationTarget.Global);
    }

    public async isAutoUpdateEnabled(): Promise<boolean> {
        const config = vscode.workspace.getConfiguration(this.CONFIG_SECTION);
        return config.get<boolean>(this.AUTO_UPDATE_KEY) || false;
    }

    public async updateAutoUpdateEnabled(enabled: boolean): Promise<void> {
        const config = vscode.workspace.getConfiguration(this.CONFIG_SECTION);
        await config.update(this.AUTO_UPDATE_KEY, enabled, vscode.ConfigurationTarget.Global);
    }

    public async getProjectRoot(): Promise<string | undefined> {
        const config = vscode.workspace.getConfiguration(this.CONFIG_SECTION);
        const root = config.get<string>(this.PROJECT_ROOT_KEY);
        // VS Code settings default to empty string if not set for string types,
        // but we treat empty string as "not set" for project root.
        return root === '' ? undefined : root;
    }

    public async updateProjectRoot(path: string | undefined): Promise<void> {
        const config = vscode.workspace.getConfiguration(this.CONFIG_SECTION);
        // If path is undefined, save an empty string to clear the setting.
        // VS Code stores empty strings, not `undefined` for string settings.
        const valueToSave = path ? path.replace(/\/$/, '') : ''; // 끝의 슬래시 제거
        console.log(`[ConfigurationService] 프로젝트 Root 설정 시도: "${valueToSave}"`);

        await config.update(this.PROJECT_ROOT_KEY, valueToSave, vscode.ConfigurationTarget.Global);

        // VSCode 설정 저장이 비동기적으로 처리되므로 잠시 대기
        await new Promise(resolve => setTimeout(resolve, 200));

        // 설정이 제대로 저장되었는지 확인 (여러 번 시도)
        let savedValue = config.get<string>(this.PROJECT_ROOT_KEY);
        console.log(`[ConfigurationService] 저장된 프로젝트 Root 값 (첫 번째 확인): "${savedValue}"`);

        // 첫 번째 확인에서 실패하면 추가로 3번 더 시도
        if (savedValue !== valueToSave) {
            for (let i = 0; i < 3; i++) {
                await new Promise(resolve => setTimeout(resolve, 300));
                savedValue = config.get<string>(this.PROJECT_ROOT_KEY);
                console.log(`[ConfigurationService] 저장된 프로젝트 Root 값 (${i + 2}번째 확인): "${savedValue}"`);
                if (savedValue === valueToSave) {
                    break;
                }
            }
        }

        // 경로 정규화 후 비교 (슬래시 정규화)
        const normalizedSaved = savedValue ? savedValue.replace(/\/$/, '') : '';
        const normalizedExpected = valueToSave ? valueToSave.replace(/\/$/, '') : '';

        if (normalizedSaved !== normalizedExpected) {
            console.warn(`[ConfigurationService] 프로젝트 Root 설정 불일치: 예상값 "${normalizedExpected}", 실제값 "${normalizedSaved}"`);
            // 오류를 던지지 않고 경고만 출력하고 계속 진행
            console.log(`[ConfigurationService] 프로젝트 Root 설정을 계속 진행합니다: "${savedValue || 'undefined'}"`);
        } else {
            console.log(`[ConfigurationService] 프로젝트 Root 설정 성공: "${savedValue}"`);
        }
    }

    // 외부 API 키 관리 메서드들
    public async getWeatherApiKey(): Promise<string | undefined> {
        const config = vscode.workspace.getConfiguration(this.CONFIG_SECTION);
        const key = config.get<string>(this.WEATHER_API_KEY);
        return key === '' ? undefined : key;
    }

    public async updateWeatherApiKey(key: string | undefined): Promise<void> {
        const config = vscode.workspace.getConfiguration(this.CONFIG_SECTION);
        await config.update(this.WEATHER_API_KEY, key || '', vscode.ConfigurationTarget.Global);
    }

    public async getNewsApiKey(): Promise<string | undefined> {
        const config = vscode.workspace.getConfiguration(this.CONFIG_SECTION);
        const key = config.get<string>(this.NEWS_API_KEY);
        return key === '' ? undefined : key;
    }

    public async updateNewsApiKey(key: string | undefined): Promise<void> {
        const config = vscode.workspace.getConfiguration(this.CONFIG_SECTION);
        await config.update(this.NEWS_API_KEY, key || '', vscode.ConfigurationTarget.Global);
    }

    public async getNewsApiSecret(): Promise<string | undefined> {
        const config = vscode.workspace.getConfiguration(this.CONFIG_SECTION);
        const secret = config.get<string>(this.NEWS_API_SECRET);
        return secret === '' ? undefined : secret;
    }

    public async updateNewsApiSecret(secret: string | undefined): Promise<void> {
        const config = vscode.workspace.getConfiguration(this.CONFIG_SECTION);
        await config.update(this.NEWS_API_SECRET, secret || '', vscode.ConfigurationTarget.Global);
    }

    public async getStockApiKey(): Promise<string | undefined> {
        const config = vscode.workspace.getConfiguration(this.CONFIG_SECTION);
        const key = config.get<string>(this.STOCK_API_KEY);
        return key === '' ? undefined : key;
    }

    public async updateStockApiKey(key: string | undefined): Promise<void> {
        const config = vscode.workspace.getConfiguration(this.CONFIG_SECTION);
        await config.update(this.STOCK_API_KEY, key || '', vscode.ConfigurationTarget.Global);
    }

    /**
     * 언어 설정을 업데이트합니다.
     */
    async updateLanguage(language: string): Promise<void> {
        await vscode.workspace.getConfiguration(this.CONFIG_SECTION).update('language', language, vscode.ConfigurationTarget.Global);
    }

    /**
     * 현재 언어 설정을 가져옵니다.
     */
    async getLanguage(): Promise<string> {
        const config = vscode.workspace.getConfiguration(this.CONFIG_SECTION);
        return config.get<string>('language', 'ko');
    }

    public async isTerminalDaemonEnabled(): Promise<boolean> {
        const config = vscode.workspace.getConfiguration(this.CONFIG_SECTION);
        return config.get<boolean>(this.TERMINAL_DAEMON_ENABLED) || false;
    }

    public async updateTerminalDaemonEnabled(enabled: boolean): Promise<void> {
        const config = vscode.workspace.getConfiguration(this.CONFIG_SECTION);
        await config.update(this.TERMINAL_DAEMON_ENABLED, enabled, vscode.ConfigurationTarget.Global);
    }

    /**
     * OUTPUT 로그 활성화 상태를 가져옵니다.
     */
    public async isOutputLogEnabled(): Promise<boolean> {
        const config = vscode.workspace.getConfiguration(this.CONFIG_SECTION);
        return config.get<boolean>(this.OUTPUT_LOG_ENABLED) ?? true; // 기본값: true (활성화)
    }

    /**
     * OUTPUT 로그 활성화 상태를 업데이트합니다.
     */
    public async updateOutputLogEnabled(enabled: boolean): Promise<void> {
        const config = vscode.workspace.getConfiguration(this.CONFIG_SECTION);
        await config.update(this.OUTPUT_LOG_ENABLED, enabled, vscode.ConfigurationTarget.Global);
    }

    /**
     * 자동 오류 수정 횟수를 가져옵니다.
     */
    public async getErrorRetryCount(): Promise<number> {
        const config = vscode.workspace.getConfiguration(this.CONFIG_SECTION);
        const count = config.get<number>(this.ERROR_RETRY_COUNT) ?? 3; // 기본값: 3
        // 1-10 범위로 제한
        return Math.max(1, Math.min(10, count));
    }

    /**
     * 자동 오류 수정 횟수를 업데이트합니다.
     */
    public async updateErrorRetryCount(count: number): Promise<void> {
        // 1-10 범위로 제한
        const validCount = Math.max(1, Math.min(10, count));
        const config = vscode.workspace.getConfiguration(this.CONFIG_SECTION);
        await config.update(this.ERROR_RETRY_COUNT, validCount, vscode.ConfigurationTarget.Global);
    }

    /**
     * 자동 오류 수정 On/Off 상태를 가져옵니다.
     */
    public async isAutoCorrectionEnabled(): Promise<boolean> {
        const config = vscode.workspace.getConfiguration(this.CONFIG_SECTION);
        const value = config.get<boolean>(this.AUTO_CORRECTION_ENABLED) ?? true;
        console.log(`[ConfigurationService] Read autoCorrectionEnabled: ${value}`);
        return value;
    }

    /**
     * 자동 오류 수정 On/Off 상태를 저장합니다.
     */
    public async updateAutoCorrectionEnabled(enabled: boolean): Promise<void> {
        const config = vscode.workspace.getConfiguration(this.CONFIG_SECTION);
        // 리소스 범위 설정은 워크스페이스에 저장하여 재로드 시 즉시 반영되도록 함
        console.log(`[ConfigurationService] Update autoCorrectionEnabled -> ${enabled} (Workspace)`);
        await config.update(this.AUTO_CORRECTION_ENABLED, enabled, vscode.ConfigurationTarget.Workspace);
    }
}
