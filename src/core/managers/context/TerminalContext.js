/**
 * Terminal Context
 * 터미널 컨텍스트를 수집하는 클래스
 */
export class TerminalContextCollector {
    terminalManager;
    constructor(terminalManager) {
        this.terminalManager = terminalManager;
    }
    /**
     * 터미널 컨텍스트를 수집합니다
     */
    async collect() {
        const history = this.terminalManager.getHistory();
        // 최근 명령어 (최근 10개)
        const recentCommands = history.getRecent(10).map(entry => entry.command.command);
        // 최근 출력 (최근 5개 명령어의 출력)
        const recentEntries = history.getRecent(5);
        const lastOutput = recentEntries.length > 0
            ? recentEntries[recentEntries.length - 1].command.output?.combined || ''
            : '';
        // 최근 에러 (실패한 명령어)
        const failedCommands = history.getFailed();
        const lastErrors = failedCommands
            .slice(0, 5)
            .map(entry => entry.command.output?.stderr || entry.command.output?.combined || '')
            .filter(err => err.length > 0);
        // 현재 작업 디렉토리 (활성 터미널에서)
        const activeTerminals = this.terminalManager.getActiveTerminals();
        const currentWorkingDirectory = activeTerminals.length > 0
            ? activeTerminals[0].getCwd() || process.cwd()
            : process.cwd();
        const terminalContext = {
            lastCommands: recentCommands,
            lastOutput,
            lastErrors,
            currentWorkingDirectory
        };
        console.log(`[TerminalContext] Collected context: ${recentCommands.length} commands, ${lastErrors.length} errors`);
        return terminalContext;
    }
}
//# sourceMappingURL=TerminalContext.js.map