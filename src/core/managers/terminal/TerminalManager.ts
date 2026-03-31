/**
 * Terminal Manager
 * 터미널 세션들을 관리하는 메인 매니저
 */

import * as vscode from 'vscode';
import {
    TerminalSession as ITerminalSession,
    TerminalCreateOptions,
    TerminalStats,
    CaptureOptions
} from './types';
import { TerminalSession } from './TerminalSession';
import { TerminalHistory } from './TerminalHistory';
import { ExecutionManager } from '../execution/ExecutionManager';
import { TaskManager } from '../task/TaskManager';
import { ErrorManager } from '../error/ErrorManager';
import { AutoFix } from '../error/AutoFix';
import { ErrorSource } from '../error/types';
import { SettingsManager } from '../state/SettingsManager';
import { SafeSettingsHelper } from '../../utils/SafeSettingsHelper';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// CorrectedCommandResult 인터페이스
interface CorrectedCommandResult {
    correctedCommand: string | null;
    fileOperations: { type: 'create' | 'modify' | 'delete'; path: string; content?: string }[];
}

export class TerminalManager {
    private static instance: TerminalManager;
    private sessions: Map<string, TerminalSession> = new Map();
    private history: TerminalHistory;
    private executionManager: ExecutionManager;
    private sessionIdCounter = 0;
    private disposables: vscode.Disposable[] = [];

    // TerminalDaemonService 호환 기능
    private extensionContext?: vscode.ExtensionContext;
    private daemonProcessRef: any = null;
    private daemonSocketPath: string = path.join(os.tmpdir(), 'terminal-daemon.sock');
    private daemonOutputChannel?: vscode.OutputChannel;
    private daemonHealthCheckInterval: NodeJS.Timeout | null = null;
    private daemonStartTimeout: NodeJS.Timeout | null = null;
    private isDaemonStarting: boolean = false;

    // terminal/terminalManager.ts 큐 관리 기능
    private priorityQueue: string[] = [];
    private normalQueue: string[] = [];
    private isProcessingQueue = false;
    private queuePausedForLongRunning = false;
    private pendingCommands: string[] = [];
    private currentCommandIndex = 0;
    private currentWorkingDirectory: string | undefined = undefined;
    private isWaitingForInput = false;
    private errorRetryCount = 0;
    private sameErrorRetryCount = 0;
    private lastFailedCommand: string | undefined = undefined;
    private lastErrorOutput: string | undefined = undefined;
    private currentWebview: vscode.Webview | undefined = undefined;
    private llmApiClient: any = undefined; // LLMApiClient 타입
    private userOS = 'unknown';
    private summarySent = false;
    public static readonly FILE_OP_PREFIX = '__AIDEV_FILE_OP__::';
    private static readonly MAX_ERROR_RETRIES = 5;
    // 손상된 PowerShell 스크립트 저장용 맵
    private corruptedPowerShellScripts: Map<string, { decoded: string, originalCommand: string }> = new Map();

    // Shell Integration을 통해 수집된 명령어 히스토리 (터미널 이름 -> 명령어 배열)
    private shellIntegrationHistory: Map<string, Array<{
        command: string;
        output: string;
        exitCode?: number;
        timestamp: number;
    }>> = new Map();

    private constructor() {
        this.history = new TerminalHistory();
        this.executionManager = ExecutionManager.getInstance();
        this.registerVSCodeEventHandlers();
        this.registerShellIntegrationHandlers();
    }

    /**
     * Extension Context를 설정합니다 (TerminalDaemonService 호환)
     */
    public setExtensionContext(context: vscode.ExtensionContext): void {
        this.extensionContext = context;
        this.daemonOutputChannel = vscode.window.createOutputChannel('CODEPILOT Terminal Daemon');
    }

    public static getInstance(context?: vscode.ExtensionContext): TerminalManager {
        if (!TerminalManager.instance) {
            TerminalManager.instance = new TerminalManager();
        }
        if (context && !TerminalManager.instance.extensionContext) {
            TerminalManager.instance.setExtensionContext(context);
        }
        return TerminalManager.instance;
    }

    /**
     * 새로운 터미널을 생성합니다
     */
    public createTerminal(options?: TerminalCreateOptions): TerminalSession {
        const sessionId = this.generateSessionId();
        const name = options?.name || `Terminal ${sessionId}`;

        // VS Code 터미널 생성
        const vscodeTerminal = vscode.window.createTerminal({
            name,
            cwd: options?.cwd,
            env: options?.env,
            shellPath: options?.shellPath,
            shellArgs: options?.shellArgs,
            iconPath: options?.iconPath,
            color: options?.color,
            message: options?.message,
            location: options?.location,
            hideFromUser: options?.hideFromUser,
            strictEnv: options?.strictEnv
        });

        // TerminalSession 생성
        const session = new TerminalSession(sessionId, vscodeTerminal, options);
        this.sessions.set(sessionId, session);

        return session;
    }

    /**
     * 터미널을 가져옵니다
     */
    public getTerminal(sessionId: string): TerminalSession | null {
        return this.sessions.get(sessionId) || null;
    }

    /**
     * 모든 터미널을 가져옵니다
     */
    public getAllTerminals(): TerminalSession[] {
        return Array.from(this.sessions.values());
    }

    /**
     * 활성 터미널들을 가져옵니다
     */
    public getActiveTerminals(): TerminalSession[] {
        return this.getAllTerminals().filter(session => session.isActive());
    }

    /**
     * 사용 가능한 터미널을 가져옵니다 (READY 상태)
     */
    public getAvailableTerminal(): TerminalSession | null {
        const available = this.getAllTerminals().find(session => session.isAvailable());
        return available || null;
    }

    /**
     * 사용 가능한 터미널을 가져오거나 새로 생성합니다
     */
    public getOrCreateTerminal(options?: TerminalCreateOptions): TerminalSession {
        const available = this.getAvailableTerminal();
        if (available && !options?.name) {
            // 이름이 지정되지 않았으면 기존 터미널 재사용
            return available;
        }

        // 새 터미널 생성
        return this.createTerminal(options);
    }

    /**
     * 터미널을 닫습니다
     */
    public closeTerminal(sessionId: string): boolean {
        const session = this.sessions.get(sessionId);
        if (!session) {
            console.warn(`[TerminalManager] Terminal not found: ${sessionId}`);
            return false;
        }

        session.dispose();
        this.sessions.delete(sessionId);

        return true;
    }

    /**
     * 모든 터미널을 닫습니다
     */
    public closeAllTerminals(): void {
        const sessions = Array.from(this.sessions.values());
        for (const session of sessions) {
            session.dispose();
        }

        this.sessions.clear();
    }

    /**
     * 명령어를 실행합니다 (ExecutionManager 통합)
     */
    public async executeCommand(
        command: string,
        options?: {
            sessionId?: string;
            cwd?: string;
            createNew?: boolean;
            captureOutput?: boolean;
        }
    ): Promise<{ sessionId: string; commandId: string }> {
        console.log(`[TerminalManager] Executing command: ${command}`);

        // 터미널 선택 또는 생성
        let session: TerminalSession;

        if (options?.sessionId) {
            const existingSession = this.getTerminal(options.sessionId);
            if (!existingSession) {
                throw new Error(`Terminal session not found: ${options.sessionId}`);
            }
            session = existingSession;
        } else if (options?.createNew) {
            session = this.createTerminal({ cwd: options.cwd });
        } else {
            session = this.getOrCreateTerminal(options ? { cwd: options.cwd } : undefined);
        }

        // 명령어 전송
        const commandId = session.sendCommand(command, options?.cwd);

        // 히스토리에 추가
        const sessionInfo = session.getSession();
        const commandEntry = session.findCommand(commandId);
        if (commandEntry) {
            this.history.add(session.getId(), sessionInfo.name, commandEntry);
        }

        // ExecutionManager를 통한 출력 캡처 (옵션)
        if (options?.captureOutput) {
            try {
                // ExecutionManager에서 명령어 실행 및 출력 캡처
                const result = await this.executionManager.executeCommand(command, {
                    cwd: options.cwd || session.getCwd()
                });

                // 결과 업데이트
                session.updateCommandResult(
                    commandId,
                    result.exitCode ?? -1,
                    result.duration,
                    {
                        stdout: result.stdout,
                        stderr: result.stderr,
                        combined: result.stdout + result.stderr
                    }
                );
            } catch (error) {
                console.error('[TerminalManager] Failed to capture output:', error);
            }
        }

        return {
            sessionId: session.getId(),
            commandId
        };
    }

    /**
     * 히스토리를 가져옵니다
     */
    public getHistory(): TerminalHistory {
        return this.history;
    }

    /**
     * 특정 터미널을 찾습니다 (이름으로)
     */
    public findByName(name: string): TerminalSession | null {
        for (const session of this.sessions.values()) {
            if (session.getSession().name === name) {
                return session;
            }
        }
        return null;
    }

    /**
     * 터미널이 존재하는지 확인합니다
     */
    public hasTerminal(sessionId: string): boolean {
        return this.sessions.has(sessionId);
    }

    /**
     * 통계를 가져옵니다
     */
    public getStats(): TerminalStats {
        const allSessions = this.getAllTerminals();
        const activeSessions = this.getActiveTerminals();

        // 모든 세션의 통계 합산
        let totalCommands = 0;
        let totalDuration = 0;
        let commandCount = 0;

        const mostUsedMap = new Map<string, number>();

        for (const session of allSessions) {
            const stats = session.getStats();
            totalCommands += stats.totalCommands;

            if (stats.averageDuration > 0) {
                totalDuration += stats.averageDuration * stats.totalCommands;
                commandCount += stats.totalCommands;
            }

            // 가장 많이 사용된 명령어 집계
            for (const cmd of session.getHistory()) {
                const count = mostUsedMap.get(cmd.command) || 0;
                mostUsedMap.set(cmd.command, count + 1);
            }
        }

        const averageCommandDuration = commandCount > 0 ? totalDuration / commandCount : 0;

        const mostUsedCommands = Array.from(mostUsedMap.entries())
            .map(([command, count]) => ({ command, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        return {
            totalSessions: allSessions.length,
            activeSessions: activeSessions.length,
            totalCommands,
            averageCommandDuration,
            mostUsedCommands
        };
    }

    /**
     * VS Code 이벤트 핸들러를 등록합니다
     */
    private registerVSCodeEventHandlers(): void {
        // 터미널 닫힘 감지
        const closeDisposable = vscode.window.onDidCloseTerminal((terminal) => {
            // 해당 터미널 세션 찾기
            for (const [sessionId, session] of this.sessions.entries()) {
                if (session.getTerminal() === terminal) {
                    this.sessions.delete(sessionId);
                    break;
                }
            }
        });

        this.disposables.push(closeDisposable);

        const openDisposable = vscode.window.onDidOpenTerminal((_terminal) => {
            // terminal open event tracked
        });

        this.disposables.push(openDisposable);
    }

    /**
     * Shell Integration 이벤트 핸들러를 등록합니다 (VS Code 1.93+)
     * 사용자가 직접 실행한 터미널 명령어도 추적합니다.
     */
    private registerShellIntegrationHandlers(): void {
        // VS Code 1.93+에서 사용 가능한 Shell Integration API
        // 타입 정의가 없을 수 있으므로 any로 캐스팅
        const windowAny = vscode.window as any;
        const onDidStartExecution = windowAny.onDidStartTerminalShellExecution;
        const onDidEndExecution = windowAny.onDidEndTerminalShellExecution;

        if (onDidStartExecution && onDidEndExecution) {

            // 명령어 실행 시작 감지
            const startDisposable = onDidStartExecution.call(windowAny, (event: any) => {
                const terminal = event.terminal;
                const execution = event.execution;
                const commandLine = execution.commandLine?.value || '';
                const terminalName = terminal.name;

                // 명령어 시작 시 기록 (출력은 나중에 업데이트)
                if (!this.shellIntegrationHistory.has(terminalName)) {
                    this.shellIntegrationHistory.set(terminalName, []);
                }

                const history = this.shellIntegrationHistory.get(terminalName)!;
                history.push({
                    command: commandLine,
                    output: '', // 실행 종료 시 업데이트
                    timestamp: Date.now()
                });

                // 최근 50개만 유지
                if (history.length > 50) {
                    history.shift();
                }
            });

            this.disposables.push(startDisposable);

            // 명령어 실행 종료 감지
            const endDisposable = onDidEndExecution.call(windowAny, (event: any) => {
                const terminal = event.terminal;
                const execution = event.execution;
                const terminalName = terminal.name;
                const exitCode = event.exitCode;

                // 해당 터미널의 히스토리에서 마지막 항목 업데이트
                const history = this.shellIntegrationHistory.get(terminalName);
                if (history && history.length > 0) {
                    const lastEntry = history[history.length - 1];
                    lastEntry.exitCode = exitCode;

                    // 출력 수집 시도 (shellIntegration.read() 사용)
                    // 비동기 처리를 위해 즉시 실행 async 함수 사용
                    (async () => {
                        try {
                            if (execution.read) {
                                let output = '';
                                for await (const data of execution.read()) {
                                    output += data;
                                }
                                // 출력이 너무 길면 자르기 (마지막 2000자)
                                if (output.length > 2000) {
                                    output = '...(truncated)\n' + output.slice(-2000);
                                }
                                lastEntry.output = output;
                            }
                        } catch (error) {
                            console.warn('[TerminalManager] Failed to read shell execution output:', error);
                        }
                    })();
                }
            });

            this.disposables.push(endDisposable);
        } else {
            // Shell Integration API not available (requires VS Code 1.93+)
        }
    }

    /**
     * Shell Integration을 통해 수집된 특정 터미널의 명령어 히스토리를 반환합니다.
     */
    public getShellIntegrationHistory(terminalName: string): Array<{
        command: string;
        output: string;
        exitCode?: number;
        timestamp: number;
    }> {
        return this.shellIntegrationHistory.get(terminalName) || [];
    }

    /**
     * 모든 Shell Integration 히스토리를 반환합니다.
     */
    public getAllShellIntegrationHistory(): Map<string, Array<{
        command: string;
        output: string;
        exitCode?: number;
        timestamp: number;
    }>> {
        return this.shellIntegrationHistory;
    }

    /**
     * 세션 ID를 생성합니다
     */
    private generateSessionId(): string {
        return `terminal_${Date.now()}_${++this.sessionIdCounter}`;
    }

    /**
     * 정리 작업을 수행합니다
     */
    public dispose(): void {
        // 모든 터미널 닫기
        this.closeAllTerminals();

        // 이벤트 핸들러 정리
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
    }

    /**
     * Execution Manager를 가져옵니다
     */
    public getExecutionManager(): ExecutionManager {
        return this.executionManager;
    }

    // ===== TerminalDaemonService 호환 메서드들 =====

    /**
     * 데몬 소켓 경로를 가져옵니다 (TerminalDaemonService 호환)
     */
    public getSocketPath(): string {
        return this.daemonSocketPath;
    }

    /**
     * 데몬 경로를 가져옵니다 (TerminalDaemonService 호환)
     */
    private getDaemonPath(): string {
        if (!this.extensionContext) {
            throw new Error('Extension context not set');
        }
        const debugPath = path.join(this.extensionContext.extensionPath, '..', 'terminal-daemon', 'bin', 'terminal-daemon');
        const releasePath = path.join(this.extensionContext.extensionPath, 'assets', 'terminal-daemon', 'terminal-daemon');
        if (fs.existsSync(debugPath)) { return debugPath; }
        return releasePath;
    }

    /**
     * 데몬이 설치되어 있는지 확인합니다 (TerminalDaemonService 호환)
     */
    public async isDaemonInstalled(): Promise<boolean> {
        try {
            const p = this.getDaemonPath();
            return fs.existsSync(p);
        } catch {
            return false;
        }
    }

    /**
     * 데몬을 설치합니다 (TerminalDaemonService 호환)
     */
    public async installDaemon(): Promise<{ success: boolean; message: string }> {
        const p = this.getDaemonPath();
        if (!fs.existsSync(p)) {
            return { success: false, message: 'terminal-daemon 바이너리를 찾을 수 없습니다.' };
        }
        // Windows에서는 chmod 불필요 (.exe가 자동 실행 가능)
        if (process.platform !== 'win32') {
            await execAsync(`chmod +x "${p}"`);
        }
        return { success: true, message: 'terminal-daemon 설치 완료' };
    }

    /**
     * 데몬을 시작합니다 (TerminalDaemonService 호환)
     * Note: 현재는 VS Code 터미널 API를 직접 사용하므로 비활성화됨
     */
    public async startDaemon(): Promise<{ success: boolean; message: string }> {
        // 터미널 데몬을 사용하지 않고 VS Code 터미널 API를 직접 사용
        return { success: true, message: 'VS Code 터미널 API를 직접 사용합니다 (터미널 데몬 비활성화됨)' };
    }

    /**
     * 데몬을 중지합니다 (TerminalDaemonService 호환)
     */
    public async stopDaemon(): Promise<{ success: boolean; message: string }> {
        if (!this.daemonProcessRef && !this.isDaemonStarting) {
            return { success: false, message: 'terminal-daemon 실행 중이 아님' };
        }
        this.cleanupDaemon();
        if (this.daemonOutputChannel) {
            this.daemonOutputChannel.appendLine('[INFO] terminal-daemon stopped');
        }
        return { success: true, message: 'terminal-daemon 중지됨' };
    }

    /**
     * 데몬 상태를 가져옵니다 (TerminalDaemonService 호환)
     */
    public async getDaemonStatus(): Promise<{ running: boolean; message: string; socket: string }> {
        const running = !!this.daemonProcessRef;
        const exists = fs.existsSync(this.daemonSocketPath);
        return { running, message: exists ? 'socket ready' : 'socket not found', socket: this.daemonSocketPath };
    }

    /**
     * 데몬 로그를 표시합니다 (TerminalDaemonService 호환)
     */
    public showDaemonLogs(): void {
        if (this.daemonOutputChannel) {
            this.daemonOutputChannel.show(true);
        }
    }

    /**
     * 데몬 연결을 테스트합니다 (TerminalDaemonService 호환)
     */
    public async testDaemonConnection(): Promise<{ success: boolean; data?: any; error?: string }> {
        try {
            const daemonPath = this.getDaemonPath();

            if (!fs.existsSync(daemonPath)) {
                return { success: false, error: 'Terminal daemon binary not found' };
            }

            // 소켓 파일 존재 확인
            if (fs.existsSync(this.daemonSocketPath)) {
                return { success: true, data: { status: 'running' } };
            } else {
                return { success: false, error: 'Terminal daemon not running' };
            }
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    /**
     * 데몬을 정리합니다 (내부 메서드)
     */
    private cleanupDaemon(): void {
        this.isDaemonStarting = false;

        if (this.daemonStartTimeout) {
            clearTimeout(this.daemonStartTimeout);
            this.daemonStartTimeout = null;
        }

        if (this.daemonHealthCheckInterval) {
            clearInterval(this.daemonHealthCheckInterval);
            this.daemonHealthCheckInterval = null;
        }

        if (this.daemonProcessRef) {
            try {
                this.daemonProcessRef.kill(process.platform === 'win32' ? undefined : 'SIGTERM');
            } catch (error) {
                console.warn('[TerminalManager] Failed to kill daemon process:', error);
            }
            this.daemonProcessRef = null;
        }

        // 소켓 파일 정리
        try {
            if (fs.existsSync(this.daemonSocketPath)) {
                fs.unlinkSync(this.daemonSocketPath);
            }
        } catch (error) {
            console.warn('[TerminalManager] Failed to remove daemon socket:', error);
        }
    }

    // ===== terminal/terminalManager.ts 호환 메서드들 =====

    private static terminalSeq = 0;
    private static codePilotTerminal: vscode.Terminal | undefined;
    private static captureOutputChannel: vscode.OutputChannel | undefined;

    /**
     * CODEPILOT 터미널을 가져오거나 생성합니다 (terminal/terminalManager.ts 호환)
     */
    public static getCodepilotTerminal(projectRoot?: string, alwaysNew: boolean = true): vscode.Terminal {
        if (alwaysNew) {
            const name = `codepilot Terminal ${++TerminalManager.terminalSeq}`;
            console.log(`[TerminalManager] 새로운 터미널 생성: ${name}`);
            const terminalOptions: vscode.TerminalOptions = { name };
            if (projectRoot) {
                terminalOptions.cwd = projectRoot;
                console.log(`[TerminalManager] 터미널 작업 디렉토리 설정: ${projectRoot}`);
            }
            const term = vscode.window.createTerminal(terminalOptions);
            const instance = TerminalManager.getInstance();
            const disposable = vscode.window.onDidCloseTerminal(event => {
                if (event === term) {
                    disposable.dispose();
                    // disposables 배열에서도 제거
                    const idx = instance.disposables.indexOf(disposable);
                    if (idx !== -1) instance.disposables.splice(idx, 1);
                }
            });
            instance.disposables.push(disposable);
            return term;
        }

        // 기존 동작 (재사용) 경로
        const existing = vscode.window.terminals.filter(t => t.name === 'codepilot Terminal');
        if (existing.length > 0) {
            TerminalManager.codePilotTerminal = existing[0];
            // 나머지 중복 터미널 정리
            for (let i = 1; i < existing.length; i++) {
                try {
                    existing[i].dispose();
                } catch { }
            }
        }

        if (!TerminalManager.codePilotTerminal || TerminalManager.codePilotTerminal.exitStatus !== undefined) {
            const terminalOptions: vscode.TerminalOptions = { name: 'codepilot Terminal' };

            if (projectRoot) {
                terminalOptions.cwd = projectRoot;
            }

            TerminalManager.codePilotTerminal = vscode.window.createTerminal(terminalOptions);
            const instance = TerminalManager.getInstance();
            const disposable = vscode.window.onDidCloseTerminal(event => {
                if (event === TerminalManager.codePilotTerminal) {
                    TerminalManager.codePilotTerminal = undefined;
                    disposable.dispose();
                    // disposables 배열에서도 제거
                    const idx = instance.disposables.indexOf(disposable);
                    if (idx !== -1) instance.disposables.splice(idx, 1);
                }
            });
            instance.disposables.push(disposable);
        }

        return TerminalManager.codePilotTerminal;
    }

    /**
     * 파일 작업 토큰을 생성합니다 (terminal/terminalManager.ts 호환)
     */
    public static buildFileOpTokens(ops: { type: 'create' | 'modify' | 'delete'; path: string; content?: string }[]): string[] {
        const FILE_OP_PREFIX = '__AIDEV_FILE_OP__::';
        return ops.map(op => {
            const payload = JSON.stringify(op);
            const b64 = Buffer.from(payload, 'utf8').toString('base64');
            return FILE_OP_PREFIX + b64;
        });
    }

    /**
     * LLM 응답에서 bash 명령어를 추출합니다 (terminal/terminalManager.ts 호환)
     * Note: 복잡한 파싱 로직(heredoc, if 블록 등)은 terminal/terminalManager.ts에 있음
     */
    public static extractBashCommandsFromLlmResponse(llmResponse: string): string[] {
        // 폴백: 간단한 버전
        const commands: string[] = [];
        const bashBlockRegex = /```bash\s*\n([\s\S]*?)\n```/g;
        const pwshBlockRegex = /```(?:powershell|pwsh)\s*\n([\s\S]*?)\n```/g;
        const cmdBlockRegex = /```(?:cmd|batch|bat)\s*\n([\s\S]*?)\n```/g;
        let match;

        // Bash 블록 처리
        while ((match = bashBlockRegex.exec(llmResponse)) !== null) {
            const block = match[1].trim();
            if (!block) continue;
            const lines = block.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
            commands.push(...lines);
        }

        // PowerShell 블록 처리
        while ((match = pwshBlockRegex.exec(llmResponse)) !== null) {
            const block = (match[1] || '').trim();
            if (!block) continue;
            const lines = block.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
            if (lines.length > 0) {
                commands.push(`powershell -Command "${lines.join('; ')}"`);
            }
        }

        // CMD 블록 처리
        while ((match = cmdBlockRegex.exec(llmResponse)) !== null) {
            const block = (match[1] || '').trim();
            if (!block) continue;
            const lines = block.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('REM') && !l.startsWith('::'));
            if (lines.length > 0) {
                commands.push(`cmd.exe /d /c "${lines.join(' & ')}"`);
            }
        }

        return commands;
    }

    /**
     * LLM 응답에서 bash 명령어를 추출하고 정규화합니다 (terminal/terminalManager.ts 호환)
     * Note: 실제 실행은 terminal/terminalManager.ts의 enqueueCommandsBatch를 통해 처리
     * 복잡한 파싱 로직(heredoc, if 블록 등)은 terminal/terminalManager.ts에 있음
     */
    public static executeBashCommandsFromLlmResponse(llmResponse: string, projectRoot?: string): string[] {
        // 폴백: 간단한 버전 사용
        const extractedCommands = TerminalManager.extractBashCommandsFromLlmResponse(llmResponse);
        return extractedCommands;
    }

    /**
     * 단일 bash 명령어를 실행합니다 (terminal/terminalManager.ts 호환)
     */
    public static executeBashCommand(command: string, projectRoot?: string): void {
        const terminal = TerminalManager.getCodepilotTerminal(projectRoot, true);
        if (projectRoot) {
            terminal.sendText(`cd "${projectRoot}"`);
        }
        terminal.sendText(command);
        terminal.show(true);
    }

    /**
     * LLM 응답에 bash 명령어가 포함되어 있는지 확인합니다 (terminal/terminalManager.ts 호환)
     */
    public static hasBashCommands(llmResponse: string): boolean {
        return TerminalManager.extractBashCommandsFromLlmResponse(llmResponse).length > 0;
    }

    // ===== terminal/terminalManager.ts 큐 관리 및 명령어 실행 기능 =====

    /**
     * 명령어를 큐에 추가합니다 (terminal/terminalManager.ts 호환)
     */
    public enqueueCommandsBatch(commands: string[], priority = false, projectRoot?: string): void {
        if (!commands || commands.length === 0) {
            return;
        }
        if (projectRoot) {
            this.currentWorkingDirectory = projectRoot;
        }
        this.enqueueCommands(commands, priority);
    }

    /**
     * 단일 명령어를 큐에 추가합니다 (ActionManager 단일 명령 실행 호환)
     */
    public async enqueueCommand(command: string, options?: { cwd?: string; priority?: boolean }): Promise<void> {
        if (!command || typeof command !== 'string') {
            return;
        }
        if (options?.cwd) {
            this.currentWorkingDirectory = options.cwd;
        }
        this.enqueueCommands([command], options?.priority ?? false);
    }

    /**
     * 현재 실행 중인 명령어 시퀀스의 상태를 확인합니다 (terminal/terminalManager.ts 호환)
     */
    public getCommandSequenceStatus(): { isRunning: boolean; currentIndex: number; totalCommands: number } {
        return {
            isRunning: this.pendingCommands.length > 0,
            currentIndex: this.currentCommandIndex,
            totalCommands: this.pendingCommands.length
        };
    }

    /**
     * 현재 작업 디렉토리를 초기화합니다 (terminal/terminalManager.ts 호환)
     */
    public resetWorkingDirectory(): void {
        this.currentWorkingDirectory = undefined;
    }

    /**
     * 실행 중인 명령어 시퀀스를 중단합니다 (terminal/terminalManager.ts 호환)
     */
    public stopCommandSequence(): void {
        this.pendingCommands = [];
        this.currentCommandIndex = 0;
        this.isWaitingForInput = false;
        vscode.window.showInformationMessage('codepilot: 명령어 시퀀스가 중단되었습니다.');
    }

    /**
     * 오류 수정 카운터를 초기화합니다 (terminal/terminalManager.ts 호환)
     */
    public resetErrorRetryCount(): void {
        this.errorRetryCount = 0;
        this.sameErrorRetryCount = 0;
        this.lastFailedCommand = undefined;
        this.lastErrorOutput = undefined;
    }

    /**
     * 오류 수정 시스템을 위한 LLM API 클라이언트와 웹뷰를 설정합니다 (terminal/terminalManager.ts 호환)
     */
    public setErrorCorrectionServices(llmApiClient: any, webview: vscode.Webview): void {
        this.llmApiClient = llmApiClient;
        this.currentWebview = webview;
    }

    /**
     * 사용자 OS를 설정합니다 (terminal/terminalManager.ts 호환)
     */
    public setUserOS(os: string): void {
        this.userOS = os;
    }

    /**
     * OUTPUT 로그 채널을 가져옵니다
     */
    private getCaptureOutputChannel(): vscode.OutputChannel {
        if (!TerminalManager.captureOutputChannel) {
            TerminalManager.captureOutputChannel = vscode.window.createOutputChannel('CODEPILOT Terminal');
        }
        return TerminalManager.captureOutputChannel;
    }

    /**
     * 효과적인 작업 디렉토리를 가져옵니다
     */
    private async getEffectiveCwd(): Promise<string | undefined> {
        try {
            const settingsManager = SettingsManager.getInstance();
            const workspaceRoot = await settingsManager.getProjectRoot();
            if (workspaceRoot) {
                return workspaceRoot;
            }
        } catch (error) {
            console.warn('[TerminalManager] getProjectRoot 실패:', error);
        }
        // 워크스페이스 루트를 직접 가져오기
        const folder = vscode.workspace.workspaceFolders?.[0];
        return folder?.uri.fsPath;
    }

    /**
     * 파일 작업 토큰에서 파일 작업을 실행합니다 (terminal/terminalManager.ts 호환)
     */
    public async executeFileOpFromToken(token: string): Promise<boolean> {
        try {
            const b64 = token.substring(TerminalManager.FILE_OP_PREFIX.length);
            const decoded = Buffer.from(b64, 'base64').toString('utf8');
            const payload = JSON.parse(decoded) as { type: 'create' | 'modify' | 'delete'; path: string; content?: string };
            const uri = vscode.Uri.file(payload.path);
            const channel = this.getCaptureOutputChannel();

            if (payload.type === 'delete') {
                try {
                    await vscode.workspace.fs.delete(uri);
                    channel.appendLine(`[FILE-OP] deleted: ${payload.path}`);
                } catch (e: any) {
                    const msg = e?.message || '';
                    if (/ENOENT|not exist|FileNotFound/i.test(msg) || e?.code === 'FileNotFound') {
                        channel.appendLine(`[FILE-OP] delete skipped (not found): ${payload.path}`);
                    } else {
                        throw e;
                    }
                }
            } else {
                // ensure directory exists
                const dir = path.dirname(payload.path);
                await vscode.workspace.fs.createDirectory(vscode.Uri.file(dir));
                const bytes = (payload.content || '').length;
                if (payload.content === undefined) {
                    channel.appendLine(`[FILE-OP] skipped: ${payload.type} ${payload.path} (no content provided)`);
                    return false;
                }
                await vscode.workspace.fs.writeFile(uri, Buffer.from(payload.content, 'utf8'));
                channel.appendLine(`[FILE-OP] ${payload.type}: ${payload.path} (${bytes} bytes)`);
            }
            return true;
        } catch (e: any) {
            const channel = this.getCaptureOutputChannel();
            const message = `[FILE-OP] failed: ${e?.message || String(e)}`;
            channel.appendLine(message);

            // ErrorManager에 파일 작업 에러 전달
            try {
                const errorManager = ErrorManager.getInstance();
                let errorPath = 'unknown';
                try {
                    const b64 = token.substring(TerminalManager.FILE_OP_PREFIX.length);
                    const decoded = Buffer.from(b64, 'base64').toString('utf8');
                    const payload = JSON.parse(decoded) as { type: 'create' | 'modify' | 'delete'; path: string; content?: string };
                    errorPath = payload.path;
                } catch (parseErr) {
                    console.debug('[TerminalManager] File-op payload parse failed, using default path:', parseErr);
                }
                errorManager.captureError(
                    ErrorSource.TERMINAL,
                    message,
                    {
                        command: 'file-op',
                        cwd: errorPath
                    }
                ).catch(err => console.warn('[TerminalManager] ErrorManager capture failed:', err));
            } catch (errMgrErr) {
                console.debug('[TerminalManager] ErrorManager unavailable during file-op error capture:', errMgrErr);
            }
            return false;
        }
    }

    /**
     * 대화형 명령어를 실행합니다 (terminal/terminalManager.ts 호환)
     */
    public async handleInteractiveCommand(command: string, projectRoot?: string): Promise<boolean> {
        // 명령어 실행 중지 상태 확인
        if ((globalThis as any).terminalMonitorService && (globalThis as any).terminalMonitorService.isExecutionStopped()) {
            console.log('[TerminalManager] 명령어 실행이 중지되었습니다:', command);
            return false;
        }

        // OS별 명령어 전처리 및 정규화
        command = this.normalizeCommandForOS(command);

        const lower = command.toLowerCase();
        const isDevLong = this.isLongRunningDevCommand(lower);

        // npm install 실행 전 esbuild 사전 정리 (esbuild 바이너리 손상 방지)
        if (lower.match(/^(npm|pnpm|yarn|bun)\s+install/)) {
            try {
                const effectiveCwd = await this.getEffectiveCwd();
                const cwd = effectiveCwd || projectRoot;
                const osAdapter = this.executionManager.getOSAdapter();
                if (osAdapter.osType === 'win32') {
                    await this.executionManager.runCommandCapture(`if exist node_modules\\esbuild rmdir /s /q node_modules\\esbuild 2>nul`, { cwd });
                } else {
                    await this.executionManager.runCommandCapture(`rm -rf node_modules/esbuild 2>/dev/null || true`, { cwd });
                }
            } catch {
            }
        }

        // 장기 실행 명령어 실행 전 기존 프로세스 종료
        if (isDevLong) {
            try {
                console.log(`[TerminalManager] 장기 실행 명령어 감지, 기존 프로세스 종료 시도`);
                const effectiveCwd = await this.getEffectiveCwd();
                const cwd = effectiveCwd || projectRoot;

                // 1. VS Code 터미널에서 실행 중인 codepilot 터미널 찾아서 종료
                try {
                    const aidevTerminals = vscode.window.terminals.filter(t =>
                        t.name.startsWith('codepilot Terminal') && t.exitStatus === undefined
                    );
                    for (const terminal of aidevTerminals) {
                        try {
                            terminal.sendText('\x03'); // Ctrl+C
                            await new Promise(resolve => setTimeout(resolve, 300));
                            terminal.dispose();
                        } catch { }
                    }
                } catch { }

                // 3. 프로세스 이름 기반 종료 (OS 어댑터 활용)
                const osAdapter = this.executionManager.getOSAdapter();
                const isWin = osAdapter.osType === 'win32';
                const errSink = isWin ? '2>nul' : '2>/dev/null';

                if (isWin) {
                    const killCommand = `taskkill /F /FI "WINDOWTITLE eq *npm*dev*" /T ${errSink} || taskkill /F /FI "COMMANDLINE eq *npm*run*dev*" /T ${errSink} || echo "No process found"`;
                    try {
                        await this.executionManager.runCommandCapture(killCommand, { cwd });
                    } catch { }
                }

                try {
                    const absCwd = path.resolve(cwd || '.');

                    // CWD 기반 node 프로세스 검색 후 종료
                    const findProcessCmd = osAdapter.getFindNodeProcessByCwdCommand(absCwd);
                    const processResult = await this.executionManager.runCommandCapture(findProcessCmd, { cwd: absCwd });

                    if (processResult.stdout && processResult.stdout.trim()) {
                        const pids = processResult.stdout.trim().split(/\r?\n/).filter(pid => pid && /^\d+$/.test(pid));
                        for (const pid of pids) {
                            try {
                                const checkCwdCmd = osAdapter.getProcessCwdCommand(parseInt(pid));
                                const cwdResult = await this.executionManager.runCommandCapture(checkCwdCmd, { cwd: absCwd });
                                const processCwd = cwdResult.stdout.trim();

                                // Unix: CWD 일치 확인 후 종료 / Windows: CommandLine 기반이므로 바로 종료
                                if (isWin || processCwd === absCwd) {
                                    const killCmd = osAdapter.getKillProcessCommand(parseInt(pid));
                                    await this.executionManager.runCommandCapture(`${killCmd} ${errSink} || ${isWin ? 'echo ok' : 'true'}`, { cwd: absCwd });
                                }
                            } catch (e) {
                                console.debug(`[TerminalManager] Individual process check failed (non-critical):`, e);
                            }
                        }
                    }

                    // dev 서버 패턴 프로세스 검색 후 종료
                    const devServerCmd = osAdapter.getFindDevServerProcessCommand(absCwd);
                    const psResult = await this.executionManager.runCommandCapture(devServerCmd, { cwd: absCwd });

                    if (psResult.stdout && psResult.stdout.trim()) {
                        const matchingPids = psResult.stdout.trim().split(/\r?\n/).filter(pid => pid && /^\d+$/.test(pid));
                        for (const pid of matchingPids) {
                            const killCmd = osAdapter.getKillProcessCommand(parseInt(pid));
                            await this.executionManager.runCommandCapture(`${killCmd} ${errSink} || ${isWin ? 'echo ok' : 'true'}`, { cwd: absCwd });
                        }
                    }
                } catch { }

                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (error) {
                console.warn(`[TerminalManager] 기존 프로세스 종료 실패 (계속 진행): ${error}`);
            }
        }

        let shouldUseTerminal = this.isInteractiveCommand(lower);

        const selectShellForCapture = (cmd: string): string | undefined => {
            const c = cmd.trim();
            const osAdapter = this.executionManager.getOSAdapter();
            if (/^(powershell|pwsh)\b/i.test(c) || /-encodedcommand\b/i.test(c)) return osAdapter.osType === 'win32' ? 'powershell.exe' : undefined;
            if (/^cmd\.exe\b/i.test(c) || /^cmd\b/i.test(c)) return osAdapter.osType === 'win32' ? 'cmd.exe' : undefined;
            if (osAdapter.osType === 'win32') return 'powershell.exe';
            return undefined;
        };

        // 위험 명령어 방지
        if (this.isDangerousCommand(lower)) {
            const answer = await vscode.window.showWarningMessage(
                `매우 위험한 명령어가 감지되었습니다: "${command}"\n실행 시 현재 작업 디렉토리의 파일이 삭제될 수 있습니다. 계속하시겠습니까?`,
                { modal: true },
                '실행', '취소'
            );
            if (answer !== '실행') {
                vscode.window.showInformationMessage('codepilot: 위험 명령어 실행이 취소되었습니다.');
                return false;
            }
        }

        // cd 명령어 감지 및 작업 디렉토리 업데이트
        if (command.toLowerCase().trim().startsWith('cd ')) {
            const targetDir = command.substring(3).trim();
            if (targetDir) {
                this.currentWorkingDirectory = targetDir;
            }
        }

        // 현재 작업 디렉토리를 프로젝트 루트로 설정
        const effectiveCwd = await this.getEffectiveCwd();
        let cwd = this.currentWorkingDirectory && this.currentWorkingDirectory !== 'bank-app-front' ? this.currentWorkingDirectory : effectiveCwd;

        if (cwd === '$PROJECT_ROOT' || cwd === '"$PROJECT_ROOT"') {
            console.warn(`[TerminalManager] cwd가 "$PROJECT_ROOT" 문자열로 설정됨, 실제 경로로 변환: ${effectiveCwd}`);
            cwd = effectiveCwd;
        }

        if (cwd && (cwd.includes('$PROJECT_ROOT') || cwd.includes('PROJECT_ROOT'))) {
            console.warn(`[TerminalManager] cwd에 PROJECT_ROOT 변수 포함됨, 실제 경로로 변환: ${effectiveCwd}`);
            cwd = effectiveCwd;
        }

        // 명령어에서 cd 부분 제거
        let cleanCommand = command;
        if (command.toLowerCase().trim().startsWith('cd ')) {
            const andIndex = command.indexOf('&&');
            if (andIndex !== -1) {
                cleanCommand = command.substring(andIndex + 2).trim();
            } else {
                cleanCommand = '';
            }
        }

        if (cleanCommand === '') {
            console.log(`[TerminalManager] cd 명령어만 실행됨: ${command}`);
            return true;
        }

        if (shouldUseTerminal) {
            const channel = this.getCaptureOutputChannel();
            channel.appendLine(`\n===== Executing in VS Code Terminal: ${cleanCommand} (${new Date().toLocaleString()}) =====`);
            channel.appendLine(`CWD: ${cwd || '(not set)'}`);
            channel.appendLine(`Command: ${cleanCommand}`);
            channel.appendLine(`Working Directory: ${cwd || '(not set)'}`);

            const terminal = TerminalManager.getCodepilotTerminal(projectRoot, true);
            if (!terminal.state.isInteractedWith) {
                terminal.show();
            }
            terminal.sendText(cleanCommand);

            if (this.isInteractiveCommand(lower)) {
                const defaultResponse = this.getDefaultResponseForCommand(command);
                if (defaultResponse !== null) {
                    setTimeout(() => {
                        terminal.sendText(defaultResponse);
                    }, 2000);
                }
                vscode.window.showInformationMessage(
                    `codepilot: 대화형 명령어 실행됨 - ${command}\n기본 응답이 자동으로 제공됩니다.`,
                    { modal: false }
                );
            } else {
                vscode.window.showInformationMessage(`codepilot: Bash 명령어 실행됨 - ${command}`);
            }

            channel.appendLine(`----- Command Sent to VS Code Terminal -----`);
            channel.appendLine(`Command: ${cleanCommand}`);
            channel.appendLine(`Working Directory: ${cwd || '(not set)'}`);
            return true;
        }

        // 기본 경로: terminal-daemon 경유 실행 (비대화형)
        const channel = this.getCaptureOutputChannel();
        const normalizedCommand = this.normalizeCommandForOS(cleanCommand);

        channel.appendLine(`\n===== Executing: ${normalizedCommand} (${new Date().toLocaleString()}) =====`);
        channel.appendLine(`CWD: ${cwd || '(not set)'}`);
        channel.appendLine(`Command: ${normalizedCommand}`);
        channel.appendLine(`Working Directory: ${cwd || '(not set)'}`);

        const isErrorLike = (text: string) => {
            const basicErrorPattern = /(npm\s+err!|^error:|^fatal:|\berror\b|\bfail(ed)?\b|\bexception\b|ERROR in|Traceback|panic:|Exit status [1-9]|BUILD FAILED|Missing script:)/i;
            const compilationErrorPattern = /(package.*does not exist|cannot find symbol|Compilation failure|BUILD FAILURE|symbol:.*class|symbol:.*method|symbol:.*variable|package.*is missing|unmappable character.*encoding|File encoding has not been set|platform encoding|x-windows-949|package org\.springframework|package lombok|package jakarta\.persistence|symbol:.*class.*Page|symbol:.*class.*Pageable|symbol:.*class.*Getter|symbol:.*class.*Setter|symbol:.*class.*Entity|symbol:.*class.*Table|symbol:.*class.*JpaRepository|symbol:.*variable.*Customizer|POM file.*does not exist)/i;
            const batchErrorPattern = /(앰퍼샌드|&.*사용할 수 없습니다|&.*예약|%.*%.*ʾҽ|%[^%]*%.*오류|batch.*error|cmd.*error|syntax.*error)/i;
            const powershellParserPattern = /(ParserError|InvalidEndOfLine|토큰.*올바른.*문 구분 기호|CategoryInfo|FullyQualifiedErrorId|&&.*토큰|&&.*이 버전|CommandNotFoundException|cmdlet.*인식되지|용어가.*cmdlet|CLIXML)/i;
            const encodingErrorPattern = /([ʾҽϴ]+|\\?[?][가-힣]|[가-힣][?]|[?][가-힣][?]|파일 이름.*구문|디렉터리 이름.*구문|볼륨 레이블.*구문)/i;
            const fileSyntaxErrorPattern = /(파일 이름.*구문|디렉터리 이름.*구문|볼륨 레이블.*구문|The filename.*syntax|The directory name.*syntax)/i;

            return basicErrorPattern.test(text) ||
                batchErrorPattern.test(text) ||
                powershellParserPattern.test(text) ||
                encodingErrorPattern.test(text) ||
                fileSyntaxErrorPattern.test(text) ||
                compilationErrorPattern.test(text);
        };

        try {
            const id = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            cleanCommand = this.normalizeEncodedPowerShellCommand(cleanCommand);
            const finalCommand = this.normalizeCommandForOS(cleanCommand);

            console.log(`[TerminalManager] Starting via VS Code terminal. id=${id}, cwd=${cwd || '(not set)'}, cmd="${finalCommand}"`);
            channel.appendLine(`[DEBUG] Executing command in VS Code terminal: ${finalCommand}`);
            channel.appendLine(`[DEBUG] Working directory: ${cwd || '(not set)'}`);

            if (finalCommand !== cleanCommand) {
                console.log(`[TerminalManager] 명령 전처리됨: ${cleanCommand.substring(0, 100)}... → ${finalCommand.substring(0, 100)}...`);
                channel.appendLine(`[DEBUG] Command normalized: && removed or path normalized`);
            }

            const terminal = TerminalManager.getCodepilotTerminal(projectRoot, true);

            if (cwd) {
                terminal.sendText(`cd "${cwd}"`);
            }

            terminal.sendText(finalCommand);
            terminal.show(true);

            const runPromise = this.executionManager.runCommandCapture(
                finalCommand,
                { cwd, shell: selectShellForCapture(finalCommand) || true },
                (data: string) => {
                    const osAdapter = this.executionManager.getOSAdapter();
                    this.decodeTerminalOutput(data, { isWindows: osAdapter.osType === 'win32', isCmdExe: /cmd\.exe/i.test(finalCommand) });
                },
                (data: string) => {
                    const osAdapter = this.executionManager.getOSAdapter();
                    const decoded = this.decodeTerminalOutput(data, { isWindows: osAdapter.osType === 'win32', isCmdExe: /cmd\.exe/i.test(finalCommand) });
                    try {
                        const errorManager = ErrorManager.getInstance();
                        errorManager.captureError(
                            ErrorSource.TERMINAL,
                            decoded,
                            {
                                command: finalCommand,
                                cwd,
                                terminalName: terminal.name
                            }
                        ).catch(err => console.warn('[TerminalManager] ErrorManager capture failed:', err));
                    } catch {
                        // ErrorManager 초기화 실패 등은 무시
                    }
                }
            );

            if (isDevLong) {
                runPromise.then(async (res) => {
                    if (res.code !== 0) {
                        channel.appendLine(`----- Long-running Command Failed -----`);
                        channel.appendLine(`Command: ${cleanCommand}`);
                        channel.appendLine(`Exit code: ${res.code}`);
                        channel.appendLine(`Working Directory: ${cwd || '(not set)'}`);
                        if (res.stderr) {
                            const decodedStderr = this.decodeTerminalOutput(res.stderr);
                            channel.appendLine(`Stderr: ${decodedStderr}`);
                        }
                        channel.show(true);

                        const errorOutput = `Exit code: ${res.code}\nStderr: ${res.stderr || ''}\nStdout: ${res.stdout || ''}`;
                        const allowAutoCorrection = true;

                        const isAutoCorrectionEnabled = await SafeSettingsHelper.isAutoCorrectionEnabled();

                        let retrySuccess = false;

                        if (allowAutoCorrection && isAutoCorrectionEnabled) {
                            retrySuccess = await this.tryAutoFixWithCore(
                                cleanCommand,
                                errorOutput,
                                cwd || '',
                                terminal.name
                            );
                        }

                        if (!retrySuccess && (allowAutoCorrection && isAutoCorrectionEnabled)) {
                            retrySuccess = await this.handleCommandError(
                                cleanCommand,
                                errorOutput,
                                cwd || '',
                                async (correctedCommand: string) => {
                                    channel.appendLine(`\n===== Retrying with corrected command: ${correctedCommand} =====`);
                                    await this.handleInteractiveCommand(correctedCommand);
                                }
                            );
                        }

                        if (!retrySuccess) {
                            vscode.window.showErrorMessage(`codepilot: Long-running 명령 실패 (${cleanCommand})`);
                        }
                    } else {
                        channel.appendLine(`----- Long-running Command Completed -----`);
                        channel.appendLine(`Command: ${cleanCommand}`);
                        channel.appendLine(`Exit code: ${res.code}`);
                        channel.appendLine(`Working Directory: ${cwd || '(not set)'}`);
                        if (res.stdout) {
                            channel.appendLine(`Output: ${res.stdout}`);
                        }
                    }
                }).catch(async (err) => {
                    channel.appendLine(`----- Long-running Command Error -----`);
                    channel.appendLine(`Command: ${cleanCommand}`);
                    channel.appendLine(`Error: ${err?.message || String(err)}`);
                    channel.appendLine(`Working Directory: ${cwd || '(not set)'}`);

                    const errorOutput = `Process error: ${err?.message || String(err)}`;
                    const isAutoCorrectionEnabled = await SafeSettingsHelper.isAutoCorrectionEnabled();

                    let retrySuccess = false;
                    if (isAutoCorrectionEnabled) {
                        retrySuccess = await this.tryAutoFixWithCore(
                            cleanCommand,
                            errorOutput,
                            cwd || '',
                            terminal.name
                        );
                    }

                    if (!retrySuccess && isAutoCorrectionEnabled) {
                        retrySuccess = await this.handleCommandError(
                            cleanCommand,
                            errorOutput,
                            cwd || '',
                            async (correctedCommand: string) => {
                                channel.appendLine(`\n===== Retrying with corrected command: ${correctedCommand} =====`);
                                await this.handleInteractiveCommand(correctedCommand);
                            }
                        );
                    }

                    if (!retrySuccess) {
                        vscode.window.showErrorMessage(`codepilot: Long-running 명령 오류 (${cleanCommand})`);
                    }
                });
                channel.appendLine(`----- Long-running Command Started -----`);
                channel.appendLine(`Command: ${cleanCommand}`);
                channel.appendLine(`Working Directory: ${cwd || '(not set)'}`);
                console.log(`[TerminalManager] Started long-running via VS Code terminal: ${cleanCommand}`);
                try { channel.show(true); } catch { }
                return true;
            }

            const result = await runPromise;

            const hasErrorInStderr = isErrorLike(result.stderr || '');
            const hasErrorInStdout = isErrorLike(result.stdout || '');
            const hasError = result.code !== 0 || hasErrorInStderr || hasErrorInStdout;

            if (hasError) {
                channel.appendLine(`----- Command Failed -----`);
                channel.appendLine(`Command: ${finalCommand}`);
                channel.appendLine(`Exit code: ${result.code}`);
                channel.appendLine(`Working Directory: ${cwd || '(not set)'}`);
                if (result.stderr) {
                    const decodedStderr = this.decodeTerminalOutput(result.stderr);
                    channel.appendLine(`Stderr: ${decodedStderr}`);
                }
                if (result.stdout && hasErrorInStdout) {
                    const decodedStdout = this.decodeTerminalOutput(result.stdout);
                    channel.appendLine(`Stdout (contains errors): ${decodedStdout.substring(0, 500)}...`);
                }
                channel.show(true);

                const errorOutput = `Exit code: ${result.code}\nStderr: ${result.stderr || ''}\nStdout: ${result.stdout || ''}`;
                console.log(`[TerminalManager] 오류 감지: exitCode=${result.code}, hasErrorInStderr=${hasErrorInStderr}, hasErrorInStdout=${hasErrorInStdout}`);
                console.log(`[TerminalManager] 오류 출력 길이: stderr=${(result.stderr || '').length}, stdout=${(result.stdout || '').length}`);
                const isAutoCorrectionEnabled = await SafeSettingsHelper.isAutoCorrectionEnabled();

                let retrySuccess = false;
                if (isAutoCorrectionEnabled) {
                    retrySuccess = await this.tryAutoFixWithCore(
                        cleanCommand,
                        errorOutput,
                        cwd || ''
                    );
                }

                if (!retrySuccess && isAutoCorrectionEnabled) {
                    retrySuccess = await this.handleCommandError(
                        cleanCommand,
                        errorOutput,
                        cwd || '',
                        async (correctedCommand: string) => {
                            channel.appendLine(`\n===== Retrying with corrected command: ${correctedCommand} =====`);
                            await this.handleInteractiveCommand(correctedCommand);
                        }
                    );
                }

                if (!retrySuccess) {
                    vscode.window.showErrorMessage(`codepilot: 명령 실패 (${cleanCommand})`);
                    return false;
                }

                return true;
            }

            channel.appendLine(`----- Command Completed Successfully -----`);
            channel.appendLine(`Command: ${cleanCommand}`);
            channel.appendLine(`Exit code: ${result.code}`);
            channel.appendLine(`Working Directory: ${cwd || '(not set)'}`);
            if (result.stdout) {
                channel.appendLine(`Output: ${result.stdout}`);
            }
            console.log(`[TerminalManager] Executed via VS Code terminal: ${cleanCommand} (exit code: ${result.code})`);

            if (result.code === 0) {
                return true;
            }

            return false;
        } catch (e: any) {
            channel.appendLine(`[WARN] VS Code 터미널 실행 실패, 로컬 실행으로 폴백: ${e?.message || e}`);
            channel.appendLine(`[ERROR] Execution error details: ${JSON.stringify(e)}`);
            console.error(`[TerminalManager] VS Code terminal execution failed:`, e);
            const result = await this.executionManager.runCommandCapture(
                this.normalizeEncodedPowerShellCommand(cleanCommand),
                { cwd, shell: true },
                (chunk) => {
                    chunk.split(/\r?\n/).forEach(line => {
                        const cleaned = this.sanitizeOutput(line).trim();
                        if (!cleaned) return;
                        channel.appendLine(cleaned);
                    });
                },
                (chunk) => {
                    chunk.split(/\r?\n/).forEach(line => {
                        const cleaned = this.sanitizeOutput(line).trim();
                        if (!cleaned) return;
                        channel.appendLine(cleaned);
                        try {
                            const errorManager = ErrorManager.getInstance();
                            errorManager.captureError(
                                ErrorSource.TERMINAL,
                                cleaned,
                                {
                                    command: cleanCommand,
                                    cwd
                                }
                            ).catch(err => console.warn('[TerminalManager] ErrorManager capture failed:', err));
                        } catch (errMgrErr) {
                            console.debug('[TerminalManager] ErrorManager unavailable during command error capture:', errMgrErr);
                        }
                    });
                }
            );

            if (result.code !== 0 || isErrorLike(result.stderr)) {
                channel.appendLine(`----- Exit code: ${result.code} -----`);
                channel.show(true);
                vscode.window.showErrorMessage(`codepilot: 명력 실패 (${cleanCommand})`);
                return false;
            }
            console.log(`[TerminalManager] Executed locally (fallback): ${cleanCommand}`);
            return true;
        }
    }

    // ===== 오류 수정 관련 메서드들 (terminal/terminalManager.ts에서 이동) =====

    /**
     * Core AutoFix를 사용하여 오류를 자동으로 수정합니다.
     */
    private async tryAutoFixWithCore(
        failedCommand: string,
        errorOutput: string,
        cwd: string,
        terminalName?: string
    ): Promise<boolean> {
        try {
            const errorManager = ErrorManager.getInstance();
            const autoFixService = AutoFix.getInstance();

            const parsedError = await errorManager.captureError(
                ErrorSource.TERMINAL,
                errorOutput,
                {
                    command: failedCommand,
                    cwd,
                    terminalName
                }
            );

            const success = await autoFixService.tryAutoFix(parsedError, {
                lastCommand: failedCommand,
                cwd,
                terminalName
            });

            return !!success;
        } catch (e) {
            console.warn('[TerminalManager] tryAutoFixWithCore failed:', e);
            return false;
        }
    }

    /**
     * 명령어 실행 오류를 LLM에게 전송하여 수정된 명령어와 파일 작업을 받아옵니다.
     */
    private async getCorrectedCommand(failedCommand: string, errorOutput: string, cwd: string): Promise<CorrectedCommandResult | null> {
        if (!this.llmApiClient || !this.currentWebview) {
            console.log('[TerminalManager] LLM API 클라이언트 또는 웹뷰가 설정되지 않음');
            return null;
        }

        try {
            // Check if this failed command has a corrupted PowerShell script stored
            const cmdHash = Buffer.from(failedCommand).toString('base64').substring(0, 32);
            const corruptedScript = this.corruptedPowerShellScripts.get(cmdHash);
            if (corruptedScript) {
                console.log('[TerminalManager] 손상된 PowerShell 스크립트 감지, LLM에게 복구 요청');
                const repaired = await this.repairCorruptedPowerShellScript(corruptedScript.decoded, errorOutput);
                if (repaired) {
                    // Remove from map after successful repair
                    this.corruptedPowerShellScripts.delete(cmdHash);
                    console.log('[TerminalManager] LLM이 손상된 스크립트 복구 완료');
                    return {
                        correctedCommand: repaired,
                        fileOperations: []
                    };
                } else {
                    console.log('[TerminalManager] LLM 스크립트 복구 실패, 일반 오류 수정 시도');
                    // Continue with normal error correction
                }
            }

            // Sanitize noisy CLIXML and CRLF markers to keep the prompt compact and clear
            const sanitizeForPrompt = (text: string): string => {
                if (!text) return text;
                let t = text;
                // Remove CLIXML tags and attributes
                t = t.replace(/<Objs[\s\S]*?>/g, '')
                    .replace(/<\/Objs>/g, '')
                    .replace(/<Obj[\s\S]*?>/g, '')
                    .replace(/<\/Obj>/g, '')
                    .replace(/<S\s+S="Error">([\s\S]*?)<\/S>/g, '$1')
                    .replace(/<[^>]+>/g, '');
                // Decode common _x000D__x000A_ noise into newlines
                t = t.replace(/_x000D__x000A_/g, '\n');
                // Collapse whitespace
                t = t.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
                return t;
            };

            const cleanedErrorOutput = sanitizeForPrompt(errorOutput);

            // 항상 워크스페이스 루트를 가져옵니다.
            const projectRoot = await this.getEffectiveCwd();

            // 프로젝트 타입 감지 (프로젝트 타입별 설정 파일만 포함하기 위해)
            let detectedProjectType = 'unknown';
            try {
                if (projectRoot && fs.existsSync(projectRoot)) {
                    // 프로젝트 타입별 설정 파일 확인 (우선순위 순서)
                    if (fs.existsSync(path.join(projectRoot, 'package.json'))) {
                        detectedProjectType = 'nodejs';
                    } else if (fs.existsSync(path.join(projectRoot, 'pom.xml'))) {
                        detectedProjectType = 'java';
                    } else if (fs.existsSync(path.join(projectRoot, 'build.gradle')) || fs.existsSync(path.join(projectRoot, 'build.gradle.kts'))) {
                        detectedProjectType = 'java';
                    } else if (fs.existsSync(path.join(projectRoot, 'requirements.txt')) || fs.existsSync(path.join(projectRoot, 'pyproject.toml'))) {
                        detectedProjectType = 'python';
                    } else if (fs.existsSync(path.join(projectRoot, 'go.mod'))) {
                        detectedProjectType = 'go';
                    } else {
                        // .NET 프로젝트 확인
                        try {
                            const csprojFiles = fs.readdirSync(projectRoot, { recursive: false, withFileTypes: true })
                                .filter(f => f.isFile() && f.name.endsWith('.csproj'));
                            if (csprojFiles.length > 0) {
                                detectedProjectType = 'dotnet';
                            }
                        } catch {
                            // .NET 프로젝트가 아님
                        }

                        // .NET이 아니면 다른 프로젝트 타입 확인
                        if (detectedProjectType === 'unknown') {
                            if (fs.existsSync(path.join(projectRoot, 'Cargo.toml'))) {
                                detectedProjectType = 'rust';
                            } else if (fs.existsSync(path.join(projectRoot, 'composer.json'))) {
                                detectedProjectType = 'php';
                            } else if (fs.existsSync(path.join(projectRoot, 'Gemfile'))) {
                                detectedProjectType = 'ruby';
                            }
                        }
                    }
                }
            } catch (e) {
                console.warn('[TerminalManager] 프로젝트 타입 감지 실패:', e);
            }

            // 작업 디렉토리의 주요 파일 리스트 가져오기
            let projectFileList = '';
            let configFileContent = '';
            try {
                if (projectRoot && fs.existsSync(projectRoot)) {
                    const files = fs.readdirSync(projectRoot, { withFileTypes: true });
                    const importantFiles: string[] = [];
                    const importantDirs: string[] = [];

                    for (const file of files) {
                        const name = file.name;
                        if (name.startsWith('.')) continue;

                        if (file.isDirectory()) {
                            if (/^(src|target|build|lib|resources|config|test|tests|node_modules)$/i.test(name)) {
                                importantDirs.push(`${name}/`);
                            }
                        } else {
                            if (/\.(xml|gradle|properties|json|yml|yaml|java|kt|py|js|ts|tsx|jsx|md|txt|sh|bat|cmd|ps1|toml|mod)$/i.test(name)) {
                                importantFiles.push(name);
                            } else if (/^(pom|build|package|requirements|setup|Makefile|Dockerfile|Cargo|Gemfile|composer|go)$/i.test(name)) {
                                importantFiles.push(name);
                            }
                        }
                    }

                    const allItems = [...importantDirs.sort(), ...importantFiles.sort()].slice(0, 50);

                    const configFiles: { [key: string]: string[] } = {
                        'java': ['pom.xml', 'build.gradle', 'build.gradle.kts'],
                        'nodejs': ['package.json'],
                        'python': ['requirements.txt', 'pyproject.toml', 'setup.py'],
                        'go': ['go.mod'],
                        'dotnet': [],
                        'rust': ['Cargo.toml'],
                        'php': ['composer.json'],
                        'ruby': ['Gemfile']
                    };

                    const relevantConfigFiles = configFiles[detectedProjectType] || [];
                    for (const configFileName of relevantConfigFiles) {
                        try {
                            const configPath = path.join(projectRoot, configFileName);
                            if (fs.existsSync(configPath)) {
                                const configContent = fs.readFileSync(configPath, 'utf8');
                                const configPreview = configContent.length > 2000 ? configContent.substring(0, 2000) + '\n... (중간 생략) ...' : configContent;
                                const lang = configFileName === 'pom.xml' ? 'xml' :
                                    configFileName.includes('gradle') ? 'gradle' :
                                        configFileName === 'package.json' ? 'json' :
                                            configFileName === 'Cargo.toml' || configFileName === 'pyproject.toml' ? 'toml' : 'txt';
                                configFileContent += `\n\n**${configFileName} 내용 (일부):**\n\`\`\`${lang}\n${configPreview}\n\`\`\``;
                                break;
                            }
                        } catch (e) {
                            console.warn(`[TerminalManager] ${configFileName} 읽기 실패:`, e);
                        }
                    }

                    if (allItems.length > 0 || configFileContent) {
                        projectFileList = `\n\n**프로젝트 루트 디렉토리 파일 목록:**\n${allItems.join('\n')}${configFileContent}`;
                    }
                }
            } catch (e) {
                console.warn('[TerminalManager] 파일 리스트 가져오기 실패:', e);
            }

            // OS별 가이드라인 준비
            const osAdapter = this.executionManager.getOSAdapter();
            const isWindows = osAdapter.osType === 'win32' || this.userOS.toLowerCase().includes('windows') || this.userOS.toLowerCase() === 'win32';
            const isUnixLike = !isWindows;

            // 공통 가이드라인 (간소화)
            const commonGuidelines = `1. 기본 명령어(echo, ls, pwd 등)가 실패하는 경우, 셸 환경 문제일 수 있습니다
2. 경로 문제가 있는 경우 절대 경로나 상대 경로를 수정하세요
3. 권한 문제가 있는 경우 ${isWindows ? 'icacls 또는 takeown 명령어를 사용하세요' : 'chmod 명령어를 추가하세요'}
4. 환경 변수 문제가 있는 경우 ${isWindows ? 'set 명령어를 사용하세요' : 'export 명령어를 추가하세요'}
5. ${isUnixLike ? '셸 문제가 있는 경우 /bin/bash 또는 /bin/zsh를 명시적으로 사용하세요' : '셸 문제가 있는 경우 PowerShell 또는 cmd.exe를 명시적으로 사용하세요'}
6. "No such file or directory" 오류의 경우, 프로젝트 루트 경로를 재확인하고 올바른 디렉토리에서 명령어를 실행하세요
7. 프로젝트 타입에 맞는 빌드 도구를 사용하세요. 프로젝트 루트의 설정 파일(package.json, pom.xml, build.gradle, requirements.txt 등)을 확인하고 적절한 빌드 도구를 선택하세요
8. **컴파일/빌드 오류가 발생한 경우**: 명령어를 다시 실행하는 것이 아니라 소스 코드나 설정 파일을 수정해야 합니다. "correctedCommand"는 null로 설정하고, "fileOperations"에 필요한 파일 수정 작업을 포함하세요
9. 스크립트 파일(.cmd, .bat, .sh, .ps1)을 생성하여 우회하지 마세요. 오류의 근본 원인을 수정하세요`;

            // Windows 전용 가이드라인 (간소화)
            const windowsGuidelines = `
**Windows PowerShell 환경 특별 고려사항:**
11. PowerShell에서 배치 스크립트(cmd.exe)를 실행할 때는 특수 문자(&, |, ;, () 등)가 PowerShell에 의해 먼저 파싱됩니다. 배치 스크립트를 실행할 때는 전체 명령을 큰따옴표로 감싸거나, 내부 따옴표를 이스케이프(\\")하세요
12. **중요**: "앰퍼샌드(&) 문자를 사용할 수 없습니다" 또는 "&& 토큰은 이 버전에서 올바른 문 구분 기호가 아닙니다" 오류가 발생하면, **절대로 &&를 사용하지 마세요**. PowerShell 5.1은 &&를 지원하지 않습니다.
13. **복잡한 배치 스크립트 처리**: 다음 조건에 해당하는 배치 스크립트는 반드시 임시 .bat 파일로 생성하여 실행해야 합니다:
    - 스크립트 길이가 500자 이상
    - %변수% 패턴이 3개 이상 포함
    - if/for/goto/setlocal/endlocal 같은 제어 구조 포함
    - 여러 단계의 빌드/실행 프로세스를 포함하는 경우
14. 배치 스크립트에서 오류 메시지가 깨져서 나타나거나(예: "?echo", "?행", "?류"), "파일 이름 구문이 잘못되었습니다" 오류가 발생하면:
    - **경로에 공백이 없으면 따옴표 없이 실행**: \`cmd.exe /d /c 경로.bat\`
    - 경로에 공백이 있으면 따옴표로 감싸되, 이중화하지 마세요: \`cmd.exe /d /c "C:\\Program Files\\script.bat"\`
    - **PowerShell에서는 && 연산자를 절대 사용하지 마세요**`;

            // Unix 계열 가이드라인 (간소화)
            const unixGuidelines = `
**Unix 계열 환경 특별 고려사항:**
11. 경로는 항상 슬래시(/)를 사용하고, 공백이 있는 경로는 따옴표로 감싸세요
12. 실행 권한이 없는 스크립트의 경우 chmod +x를 사용하여 실행 권한을 부여하세요
13. 환경 변수는 export로 설정하고, 스크립트 내에서 $변수명 형식으로 참조하세요
14. 파이프(|)와 리다이렉션(>, >>) 사용 시 명령어 사이를 올바르게 구분하세요
15. **중요: 쉘 스크립트 생성 조건 및 오류 수정:**
    - 쉘 스크립트는 **프로젝트 빌드, 실행, 테스트, 배포**와 직접 관련된 작업일 때만 생성하세요.
    - 프로젝트 빌드/실행과 무관한 작업에는 절대 쉘 스크립트를 생성하지 마세요.
    - 함수 정의(\`func() { ... }\`), 여러 줄 변수 설정, if/for/while 루프가 포함된 스크립트에서 "syntax error: unexpected end of file" 같은 오류가 발생하면, 스크립트를 파일로 생성하도록 수정하세요`;

            const osSpecificGuidelines = isWindows ? windowsGuidelines : unixGuidelines;

            // 오류 출력이 너무 길면 중요한 부분만 추출
            let errorOutputForPrompt = cleanedErrorOutput;
            if (errorOutputForPrompt.length > 50000) {
                const startPart = errorOutputForPrompt.substring(0, 10000);
                const endPart = errorOutputForPrompt.substring(errorOutputForPrompt.length - 40000);
                errorOutputForPrompt = `[오류 출력이 길어 일부만 표시합니다]\n${startPart}\n... (중간 생략) ...\n${endPart}`;
            }

            // 컴파일/빌드 오류가 있는지 사전 확인 (범용)
            const hasCompilationError = /(Compilation failure|BUILD FAILURE|build failed|compile error|syntax error|cannot find symbol|cannot find module|Module not found|unmappable character|encoding error)/i.test(cleanedErrorOutput);

            // 빌드/컴파일 오류 가이드라인 (범용)
            let compilationGuidelines = '';
            if (hasCompilationError) {
                compilationGuidelines = `**⚠️ 빌드/컴파일 오류가 감지되었습니다 ⚠️**
이 오류는 명령어를 다시 실행하는 것으로 해결되지 않습니다. 소스 코드나 설정 파일을 수정해야 합니다.

**규칙:**
1. "correctedCommand"는 null로 설정하세요
2. "fileOperations"에 오류의 근본 원인을 수정하는 파일 작업을 포함하세요
3. 스크립트 파일(.cmd, .bat, .sh, .ps1)을 생성하여 우회하지 마세요
4. 오류 메시지를 분석하여 누락된 의존성, 잘못된 import, 문법 오류 등을 수정하세요`;
            }

            const errorCorrectionPrompt = `다음 명령어가 실행 중 오류가 발생했습니다. 오류를 분석하고 수정된 명령어를 제안해주세요.

실행된 명령어: ${failedCommand}
프로젝트 루트: ${projectRoot || '(unknown)'}
작업 디렉토리(CWD): ${cwd}${projectFileList}
오류 출력:
${errorOutputForPrompt}

${this.userOS} 환경에서 다음 사항을 고려하여 수정된 명령어를 제안해주세요:
${commonGuidelines}${osSpecificGuidelines}

**중요: 오직 하나의 JSON 객체만 응답해주세요. 다른 텍스트나 설명은 포함하지 마세요.**

${compilationGuidelines || ''}

수정된 명령어와 파일 작업을 JSON 형식으로 응답해주세요:
{
  "correctedCommand": "수정된 명령어",
  "reasoning": "수정 이유",
  "confidence": 0.8,
  "fileOperations": [
    {
      "type": "create",
      "path": "src/main/java/Example.java",
      "content": "파일 내용 전체"
    },
    {
      "type": "modify",
      "path": "src/main/java/Existing.java",
      "content": "수정된 파일 내용 전체"
    },
    {
      "type": "delete",
      "path": "src/main/java/DeleteMe.java"
    }
  ]
}

파일 작업이 필요 없는 경우 fileOperations는 빈 배열 []로 설정하세요.`;

            console.log('[TerminalManager] LLM에게 오류 수정 요청 전송');
            console.log(`[TerminalManager] 컴파일 오류 감지 여부: ${hasCompilationError}`);
            console.log(`[TerminalManager] 오류 출력 길이: ${cleanedErrorOutput.length} chars`);

            // ErrorManager를 통해 LLM 호출
            const errorManager = ErrorManager.getInstance();
            const response = await errorManager.sendMessageForErrorCorrection(errorCorrectionPrompt, this.llmApiClient);
            console.log(`[TerminalManager] LLM 응답 받음 (길이: ${response.length})`);
            console.log(`[TerminalManager] LLM 응답 길이: ${response.length} chars`);

            // Strip code fences and language headers if present
            const fenceStripped = response
                .replace(/```json[\s\S]*?\n([\s\S]*?)```/gi, '$1')
                .replace(/```[a-zA-Z0-9_-]*\s*\n([\s\S]*?)```/g, '$1')
                .trim();

            // JSON 응답 파싱 - 간소화된 버전
            const jsonMatches = fenceStripped.match(/\{[\s\S]*?\}/g);
            if (jsonMatches) {
                for (const jsonStr of jsonMatches) {
                    try {
                        let result = JSON.parse(jsonStr);

                        // correctedCommand가 null이거나 없어도 파일 작업이 있으면 반환
                        const hasValidCommand = result.correctedCommand && result.confidence && result.confidence > 0.5;
                        const hasFileOps = result.fileOperations && Array.isArray(result.fileOperations) && result.fileOperations.length > 0;

                        console.log(`[TerminalManager] JSON 파싱 결과: hasValidCommand=${hasValidCommand}, hasFileOps=${hasFileOps}, correctedCommand=${result.correctedCommand}, fileOperations.length=${result.fileOperations?.length || 0}`);

                        if (hasValidCommand || (hasFileOps && (!result.correctedCommand || result.correctedCommand === null))) {
                            if (hasValidCommand) {
                                console.log(`[TerminalManager] LLM 오류 수정 성공: ${result.correctedCommand} (신뢰도: ${result.confidence})`);
                            } else {
                                console.log(`[TerminalManager] LLM 파일 수정 제안: ${hasFileOps ? result.fileOperations.length : 0}개 파일 작업`);
                            }

                            // 파일 작업 추출 및 경로 정규화
                            const fileOperations: { type: 'create' | 'modify' | 'delete'; path: string; content?: string }[] = [];
                            if (result.fileOperations && Array.isArray(result.fileOperations)) {
                                for (const op of result.fileOperations) {
                                    const opType = op.type || op.operation;
                                    if (opType && op.path && (opType === 'create' || opType === 'modify' || opType === 'delete')) {
                                        const pathLower = op.path.toLowerCase();

                                        // 스크립트 파일(.cmd, .bat, .sh, .ps1) 생성/수정 거부
                                        if (/\.(cmd|bat|sh|ps1)$/i.test(pathLower)) {
                                            console.log(`[TerminalManager] 스크립트 파일 작업 거부: ${op.path}`);
                                            continue;
                                        }

                                        // 경로 정규화
                                        let normalizedPath = op.path.trim()
                                            .replace(/^`+|`+$/g, '')
                                            .replace(/^'+|'+$/g, '')
                                            .replace(/^"+|"+$/g, '')
                                            .replace(/^\*+|\*+$/g, '')
                                            .replace(/^_+|_+$/g, '')
                                            .replace(/^\[+|\]+$/g, '')
                                            .replace(/^\(+|\)+$/g, '')
                                            .replace(/^\{+|\}+$/g, '')
                                            .trim();

                                        const pathParts = normalizedPath.split(/[\/\\]/);
                                        const cleanedParts = pathParts.map((part: string) => {
                                            if (!part) return part;
                                            return part.replace(/^[`'"]+|[`'"]+$/g, '').trim();
                                        });
                                        normalizedPath = cleanedParts.join(path.sep);

                                        // 절대 경로가 아닌 경우 프로젝트 루트 기준으로 변환
                                        if (!path.isAbsolute(normalizedPath)) {
                                            normalizedPath = path.join(projectRoot || cwd, normalizedPath);
                                        }

                                        const finalOpType = opType as 'create' | 'modify' | 'delete';

                                        // 경로 검증
                                        const invalidChars = /[<>:"|?*]/;
                                        if (invalidChars.test(normalizedPath)) {
                                            console.log(`[TerminalManager] 경로에 허용되지 않는 문자가 포함되어 거부: ${normalizedPath}`);
                                            continue;
                                        }

                                        if (normalizedPath.length > 260) {
                                            console.log(`[TerminalManager] 경로가 너무 길어서 거부: ${normalizedPath.length}자`);
                                            continue;
                                        }

                                        // contentEncoding 또는 별도 base64 필드 지원
                                        let contentToUse: string | undefined = op.content || undefined;
                                        const enc = (op.contentEncoding || op.encoding || '').toLowerCase();
                                        const altB64 = op.contentBase64 || op.content_b64 || op.contentB64;
                                        try {
                                            if (enc === 'base64' && typeof contentToUse === 'string') {
                                                contentToUse = Buffer.from(contentToUse, 'base64').toString('utf8');
                                            } else if (typeof altB64 === 'string' && !contentToUse) {
                                                contentToUse = Buffer.from(altB64, 'base64').toString('utf8');
                                            }
                                        } catch { /* ignore decode errors */ }

                                        fileOperations.push({
                                            type: finalOpType,
                                            path: normalizedPath,
                                            content: contentToUse
                                        });

                                        console.log(`[TerminalManager] 파일 작업 추가: ${finalOpType} ${normalizedPath}`);
                                    }
                                }
                            }

                            return {
                                correctedCommand: result.correctedCommand || null,
                                fileOperations: fileOperations
                            };
                        }
                    } catch (parseError) {
                        console.warn('[TerminalManager] JSON 파싱 실패, 다음 JSON 시도:', parseError);
                        continue;
                    }
                }
            }

            // Fallback: 키-값만 추출 (정규식)
            const keyMatch = fenceStripped.match(/"correctedCommand"\s*:\s*"([^"]*(?:\\.[^"]*)*)"/i);
            if (keyMatch && keyMatch[1]) {
                let cmd = keyMatch[1];
                cmd = cmd.replace(/\\\\"/g, '"')
                    .replace(/\\\\/g, '\\')
                    .replace(/\\n/g, ' ')
                    .replace(/\\"/g, '"')
                    .replace(/\\r/g, '')
                    .replace(/\\t/g, ' ')
                    .trim();
                if (cmd && cmd.length >= 4 && !cmd.match(/^(\\|""|''|```)/)) {
                    console.log('[TerminalManager] Fallback correctedCommand extracted via regex');
                    return {
                        correctedCommand: cmd,
                        fileOperations: []
                    };
                }
            }

            // Fallback: pom.xml XML 본문 직접 추출
            try {
                const hasPomPath = /"path"\s*:\s*"pom\.xml"/i.test(fenceStripped);
                if (hasPomPath) {
                    let xmlContent = '';
                    const xmlDeclStart = fenceStripped.indexOf('<?xml');
                    const projectStart = fenceStripped.indexOf('<project');
                    const projectEnd = fenceStripped.indexOf('</project>');
                    if (projectEnd !== -1) {
                        if (xmlDeclStart !== -1 && xmlDeclStart < projectEnd) {
                            xmlContent = fenceStripped.substring(xmlDeclStart, projectEnd + '</project>'.length);
                        } else if (projectStart !== -1 && projectStart < projectEnd) {
                            xmlContent = fenceStripped.substring(projectStart, projectEnd + '</project>'.length);
                        }
                    }

                    if (xmlContent && xmlContent.length > 0) {
                        console.log('[TerminalManager] Fallback: Extracted pom.xml content via regex');
                        return {
                            correctedCommand: null,
                            fileOperations: [
                                { type: 'create', path: 'pom.xml', content: xmlContent }
                            ]
                        };
                    }
                }
            } catch (e) {
                console.warn('[TerminalManager] Fallback fileOperations extraction failed:', e);
            }

            // Fallback: 순수 명령문으로만 온 경우
            const singleLine = fenceStripped.split('\n').map(s => s.trim()).filter(Boolean).join(' ');
            if (singleLine && !singleLine.startsWith('{') && !singleLine.startsWith('"')) {
                if (singleLine.length >= 4) {
                    console.log('[TerminalManager] Fallback plain command used');
                    return {
                        correctedCommand: singleLine,
                        fileOperations: []
                    };
                }
            }

            console.log('[TerminalManager] LLM 오류 수정 실패 또는 신뢰도 부족');
            return null;
        } catch (error) {
            console.error('[TerminalManager] LLM 오류 수정 중 예외 발생:', error);
            return null;
        }
    }

    /**
     * 손상된 PowerShell 스크립트를 LLM을 통해 복구합니다.
     */
    private async repairCorruptedPowerShellScript(corruptedScript: string, errorOutput: string): Promise<string | null> {
        if (!this.llmApiClient) {
            console.log('[TerminalManager] LLM API 클라이언트가 없어 스크립트 복구 불가');
            return null;
        }

        try {
            const repairPrompt = `PowerShell 스크립트가 디코딩 과정에서 손상되었습니다. 손상된 스크립트와 실제 실행 오류를 분석하고, 복구된 완전하고 실행 가능한 PowerShell 명령어를 제공해주세요.

손상된 스크립트:
${corruptedScript.substring(0, 2000)}${corruptedScript.length > 2000 ? '... (truncated)' : ''}

실제 실행 오류:
${errorOutput.substring(0, 1000)}${errorOutput.length > 1000 ? '... (truncated)' : ''}

요구사항:
1. 복구된 명령어는 완전하고 실행 가능한 PowerShell 명령어여야 합니다
2. 모든 변수명이 올바르게 복구되어야 합니다 (예: foreach(\$name in @, if (-not \$var) 등)
3. 모든 따옴표가 올바르게 이스케이프되어야 합니다
4. 원본 스크립트의 기능을 유지해야 합니다
5. 실행 가능한 전체 PowerShell 명령어로 응답하세요 (powershell -Command "..." 형식)

JSON 형식으로 응답해주세요:
{
  "correctedCommand": "powershell -NoLogo -NonInteractive -NoProfile -ExecutionPolicy Bypass -Command \"...복구된 스크립트...\"",
  "reasoning": "복구 이유 설명",
  "confidence": 0.9}`;

            console.log('[TerminalManager] LLM에게 손상된 PowerShell 스크립트 복구 요청');
            // ErrorManager를 통해 LLM 호출
            const errorManager = ErrorManager.getInstance();
            const response = await errorManager.sendMessageForErrorCorrection(repairPrompt, this.llmApiClient);

            // Try to parse JSON response
            const fenceStripped = response
                .replace(/```json[\s\S]*?\n([\s\S]*?)```/gi, '$1')
                .replace(/```[a-zA-Z0-9_-]*\s*\n([\s\S]*?)```/g, '$1')
                .trim();

            const jsonMatches = fenceStripped.match(/\{[\s\S]*?\}/g);
            if (jsonMatches) {
                for (const jsonStr of jsonMatches) {
                    try {
                        const result = JSON.parse(jsonStr);
                        if (result.correctedCommand && result.confidence > 0.7) {
                            console.log(`[TerminalManager] LLM이 스크립트 복구 완료 (신뢰도: ${result.confidence})`);
                            return result.correctedCommand;
                        }
                    } catch (parseError) {
                        continue;
                    }
                }
            }

            // Fallback: extract command directly with better regex for multiline commands
            const cmdPatterns = [
                /"correctedCommand"\s*:\s*"((?:[^"\\]|\\.|\\\n)*)"/gi,
                /"correctedCommand"\s*:\s*"([^"]+)"/gi,
                /correctedCommand["\s:]+"([^"]+)"/gi,
            ];

            for (const pattern of cmdPatterns) {
                const cmdMatch = fenceStripped.match(pattern);
                if (cmdMatch && cmdMatch[1]) {
                    let cmd = cmdMatch[1];
                    // Unescape JSON escape sequences
                    cmd = cmd
                        .replace(/\\n/g, '\n')
                        .replace(/\\r/g, '\r')
                        .replace(/\\t/g, '\t')
                        .replace(/\\"/g, '"')
                        .replace(/\\\\/g, '\\')
                        .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
                        .trim();
                    if (cmd && cmd.length > 10 && cmd !== '\\' && cmd !== '\\\\') {
                        console.log(`[TerminalManager] LLM 스크립트 복구 완료 (fallback, 길이: ${cmd.length})`);
                        return cmd;
                    }
                }
            }

            console.log('[TerminalManager] LLM 스크립트 복구 실패 또는 응답 불충분');
            return null;
        } catch (error) {
            console.error('[TerminalManager] 스크립트 복구 중 오류:', error);
            return null;
        }
    }

    /**
     * 명령어를 큐에 추가합니다 (terminal/terminalManager.ts 호환)
     */
    private enqueueCommands(commands: string[], priority = false): void {
        if (priority) {
            this.priorityQueue = commands.concat(this.priorityQueue);
        } else {
            this.normalQueue = this.normalQueue.concat(commands);
        }
        // 큐 처리 시작
        this.processQueue();
    }

    /**
     * 큐를 처리합니다 (terminal/terminalManager.ts 호환)
     */
    private async processQueue(): Promise<void> {
        if (this.isProcessingQueue || this.queuePausedForLongRunning) {
            return;
        }

        this.isProcessingQueue = true;

        try {
            while (this.priorityQueue.length > 0 || this.normalQueue.length > 0) {
                let command: string | undefined;
                if (this.priorityQueue.length > 0) {
                    command = this.priorityQueue.shift();
                } else if (this.normalQueue.length > 0) {
                    command = this.normalQueue.shift();
                }

                if (command) {
                    const projectRoot = await this.getEffectiveCwd();
                    await this.handleInteractiveCommand(command, projectRoot);
                }
            }
        } finally {
            this.isProcessingQueue = false;
        }
    }

    /**
     * 명령어 실행 오류를 처리하고 수정된 명령어로 재시도합니다.
     */
    public async handleCommandError(
        failedCommand: string,
        errorOutput: string,
        cwd: string,
        onRetry: (correctedCommand: string) => Promise<void>
    ): Promise<boolean> {
        // 동일한 오류가 반복되는지 확인
        if (this.lastFailedCommand === failedCommand && this.lastErrorOutput === errorOutput) {
            this.sameErrorRetryCount++;
            console.log(`[TerminalManager] 동일한 오류 반복 감지: ${this.sameErrorRetryCount}회`);

            // 동일한 오류가 2회 이상 반복되면 재시도 중단
            if (this.sameErrorRetryCount >= 2) {
                console.log(`[TerminalManager] 동일한 오류가 ${this.sameErrorRetryCount}회 반복되어 재시도 중단`);

                if (this.currentWebview) {
                    const failureMessage = `❌ 오류 수정 실패: 동일한 오류가 반복되어 재시도를 중단했습니다. 수동 확인이 필요합니다.`;
                    this.currentWebview.postMessage({
                        command: 'showErrorCorrectionFailure',
                        message: failureMessage,
                        retryCount: this.errorRetryCount
                    });
                }

                // ProcessingSteps 숨김
                if (this.currentWebview) {
                    try { this.currentWebview.postMessage({ command: 'hideProcessingSteps', step: 'error_correction' }); } catch { }
                    try { this.currentWebview.postMessage({ command: 'hideLoading' }); } catch { }
                    try { this.currentWebview.postMessage({ command: 'hideAutoCorrecting' }); } catch { }
                }

                this.errorRetryCount = 0;
                this.sameErrorRetryCount = 0;
                this.lastFailedCommand = undefined;
                this.lastErrorOutput = undefined;
                return false;
            }
        } else {
            // 다른 오류가 발생하면 카운터 리셋
            this.sameErrorRetryCount = 0;
            this.lastFailedCommand = failedCommand;
            this.lastErrorOutput = errorOutput;
        }

        if (this.errorRetryCount >= TerminalManager.MAX_ERROR_RETRIES) {
            console.log(`[TerminalManager] 최대 재시도 횟수(${TerminalManager.MAX_ERROR_RETRIES}) 초과`);

            // 최대 재시도 횟수 초과 시 실패 메시지 전송
            if (this.currentWebview) {
                const failureMessage = `❌ 오류 수정 실패: 최대 재시도 횟수(${TerminalManager.MAX_ERROR_RETRIES}) 초과. 수동 확인이 필요합니다.`;
                this.currentWebview.postMessage({
                    command: 'showErrorCorrectionFailure',
                    message: failureMessage,
                    retryCount: this.errorRetryCount
                });
            }

            // 최대 재시도 횟수 초과 시에만 종합 설명 출력
            setTimeout(async () => {
                await this.sendErrorCorrectionSummary();
            }, 2000);

            // ProcessingSteps 숨김
            if (this.currentWebview) {
                console.log('[TerminalManager] hideLoading 메시지 전송 (최대 재시도 초과)');
                this.currentWebview.postMessage({ command: 'hideLoading' });
                this.currentWebview.postMessage({
                    command: 'updateProcessingStatus',
                    step: 'error_correction',
                    status: '자동 오류 수정 완료'
                });
                this.currentWebview.postMessage({ command: 'hideAutoCorrecting' });
                this.currentWebview.postMessage({
                    command: 'hideProcessingSteps',
                    step: 'error_correction'
                });
            }

            this.errorRetryCount = 0;
            this.sameErrorRetryCount = 0;
            this.lastFailedCommand = undefined;
            this.lastErrorOutput = undefined;
            return false;
        }

        this.errorRetryCount++;
        this.summarySent = false;
        console.log(`[TerminalManager] 오류 수정 시도 ${this.errorRetryCount}/${TerminalManager.MAX_ERROR_RETRIES}`);

        const correctionResult = await this.getCorrectedCommand(failedCommand, errorOutput, cwd);

        if (!correctionResult) {
            console.log('[TerminalManager] LLM에서 수정된 명령어를 받지 못함');
            if (this.currentWebview) {
                try { this.currentWebview.postMessage({ command: 'hideProcessingSteps', step: 'error_correction' }); } catch { }
                try { this.currentWebview.postMessage({ command: 'hideLoading' }); } catch { }
                try { this.currentWebview.postMessage({ command: 'hideAutoCorrecting' }); } catch { }
            }
            return false;
        }

        const { correctedCommand, fileOperations } = correctionResult;
        console.log(`[TerminalManager] getCorrectedCommand 결과: correctedCommand=${correctedCommand ? '있음' : 'null'}, fileOperations.length=${fileOperations.length}`);
        if (fileOperations.length > 0) {
            console.log(`[TerminalManager] 파일 작업 목록:`, fileOperations.map(op => `${op.type} ${op.path}`));
        }

        // 파일 작업이 있는 경우 먼저 처리
        if (fileOperations.length > 0) {
            console.log(`[TerminalManager] ${fileOperations.length}개의 파일 작업을 큐에 추가`);
            const fileOpTokens = TerminalManager.buildFileOpTokens(fileOperations);
            this.enqueueCommands(fileOpTokens, true);
        }

        // 컴파일 오류가 있고 correctedCommand가 null인 경우 파일 작업만 처리
        const hasCompilationError = /(package.*does not exist|cannot find symbol|Compilation failure|BUILD FAILURE|package org\.springframework|package lombok|package jakarta\.persistence|symbol:.*class.*Page|symbol:.*class.*Pageable|symbol:.*class.*Getter|symbol:.*class.*Setter|symbol:.*class.*Entity|symbol:.*class.*JpaRepository|symbol:.*variable.*Customizer)/i.test(errorOutput);
        if (!correctedCommand && fileOperations.length > 0) {
            console.log(`[TerminalManager] 컴파일 오류 감지: 파일 작업만 처리 (${fileOperations.length}개)`);

            if (this.currentWebview) {
                this.currentWebview.postMessage({
                    command: 'updateProcessingStatus',
                    step: 'error_correction',
                    status: `파일 수정 중 (${fileOperations.length}개 파일)`
                });
                this.currentWebview.postMessage({
                    command: 'showErrorCorrectionSuccess',
                    message: `파일 수정 작업이 큐에 추가되었습니다 (${fileOperations.length}개 파일)`,
                    retryCount: this.errorRetryCount
                });
                this.currentWebview.postMessage({
                    command: 'hideProcessingSteps',
                    step: 'error_correction'
                });
            }

            this.errorRetryCount = 0;
            return true;
        }

        const isValidCorrected = async (cmd: string | null | undefined): Promise<boolean> => {
            if (!cmd) return false;
            const t = cmd.trim();
            if (!t) return false;
            if (t === '\\') return false;
            if (t === '""' || t === "''") return false;

            const osAdapter = this.executionManager.getOSAdapter();
            if (osAdapter.osType === 'win32' && /cmd\.exe/i.test(t)) {
                const cmdMatch = t.match(/cmd\.exe\s*\/d\s*\/c\s*"([^"]*)"(?:\s*&&)/i);
                if (cmdMatch) {
                    console.log('[TerminalManager] 명령어 검증 실패: PowerShell 환경에서 && 사용 감지');
                    return false;
                }
                if (/^\s*&&/.test(t)) {
                    console.log('[TerminalManager] 명령어 검증 실패: 명령 시작에 && 사용');
                    return false;
                }
            }

            if (/[<>]/.test(t)) return false;
            if (/Your(Command|ActualCommand)(Here)?/i.test(t)) return false;

            if (/^```/.test(t)) return false;
            if (t.length < 2) return false;
            return true;
        };

        const isValid = await isValidCorrected(correctedCommand);
        if (isValid && correctedCommand) {
            console.log(`[TerminalManager] 수정된 명령어로 재시도: ${correctedCommand}`);

            if (this.currentWebview) {
                this.currentWebview.postMessage({
                    command: 'showErrorCorrection',
                    originalCommand: failedCommand,
                    correctedCommand: correctedCommand,
                    retryCount: this.errorRetryCount
                });
                const successMessage = `✅ 오류 수정 성공: ${correctedCommand} 명령어로 정상 실행됨`;
                console.log('[TerminalManager] showErrorCorrectionSuccess 메시지 전송:', successMessage);
                this.currentWebview.postMessage({
                    command: 'showErrorCorrectionSuccess',
                    message: successMessage,
                    correctedCommand: correctedCommand
                });
            }

            try {
                await onRetry(correctedCommand);
                console.log('[TerminalManager] 수정된 명령어 재시도 완료');
            } catch (error) {
                console.error('[TerminalManager] 수정된 명령어 재시도 실패:', error);
            }

            setTimeout(async () => {
                await this.sendErrorCorrectionSummary();
            }, 2000);

            if (this.currentWebview) {
                console.log('[TerminalManager] hideLoading 메시지 전송 (오류 수정 성공)');
                this.currentWebview.postMessage({ command: 'hideLoading' });
                this.currentWebview.postMessage({
                    command: 'updateProcessingStatus',
                    step: 'error_correction',
                    status: '자동 오류 수정 완료'
                });
                this.currentWebview.postMessage({ command: 'hideAutoCorrecting' });
                this.currentWebview.postMessage({
                    command: 'hideProcessingSteps',
                    step: 'error_correction'
                });
            }

            return true;
        } else {
            if (correctedCommand) {
                console.log(`[TerminalManager] 명령어 수정 불가능 (검증 실패): ${correctedCommand.substring(0, 100)}...`);
            } else {
                console.log('[TerminalManager] 명령어 수정 불가능 (LLM이 명령어를 반환하지 않음)');
            }
            if (this.currentWebview) {
                try { this.currentWebview.postMessage({ command: 'hideProcessingSteps', step: 'error_correction' }); } catch { }
                try { this.currentWebview.postMessage({ command: 'hideLoading' }); } catch { }
                try { this.currentWebview.postMessage({ command: 'hideAutoCorrecting' }); } catch { }
            }
            this.errorRetryCount = 0;
            return false;
        }
    }

    /**
     * 오류 수정 종합 설명을 웹뷰에 전송합니다.
     */
    private async sendErrorCorrectionSummary(): Promise<void> {
        if (!this.currentWebview) {
            console.log('[TerminalManager] 웹뷰가 설정되지 않음');
            return;
        }

        if (this.summarySent) {
            console.log('[TerminalManager] 종합 설명이 이미 전송됨');
            return;
        }

        try {
            const summary = `## 🔧 오류 수정 완료 보고서

### 📊 수정 요약
- **수정 시도 횟수:** ${this.errorRetryCount}회
- **수정 상태:** 완료
- **수정 시간:** ${new Date().toLocaleString()}

### 🎯 수정된 내용
1. **명령어 오류 분석:** 터미널 출력을 분석하여 오류 원인 파악
2. **LLM 기반 수정:** AI가 오류를 분석하고 수정된 명령어 제안
3. **자동 재시도:** 수정된 명령어로 자동 재실행

### 💡 개선 사항
- **오류 감지:** 터미널 출력에서 오류 패턴 자동 감지
- **지능형 수정:** LLM이 오류 원인을 분석하고 해결책 제시
- **자동화:** 수동 개입 없이 자동으로 오류 수정 및 재시도

### ⚠️ 주의사항
- 복잡한 오류의 경우 수동 확인이 필요할 수 있습니다
- 네트워크 오류나 권한 문제는 자동 수정이 어려울 수 있습니다
- 중요한 작업 전에는 백업을 권장합니다

---
*이 보고서는 codepilot의 자동 오류 수정 시스템에 의해 생성되었습니다.*`;

            this.currentWebview.postMessage({
                command: 'showErrorCorrectionSummary',
                summary: summary,
            });

            this.summarySent = true;
            console.log('[TerminalManager] 오류 수정 종합 설명을 채팅창에 전송했습니다.');
        } catch (error) {
            console.error('[TerminalManager] 오류 수정 종합 설명 전송 실패:', error);
        }
    }

    // ===== 헬퍼 함수들 (terminal/terminalManager.ts에서 이동) =====

    /**
     * 대화형 명령어인지 확인합니다.
     */
    private isInteractiveCommand(command: string): boolean {
        const interactiveCommands = [
            'npm init',
            'npm create',
            'npx create',
            'yarn create',
            'create-react-app',
            'vue create',
            'ng new',
            'dotnet new',
            'cargo new',
            'flutter create',
            'rails new',
            'django-admin startproject',
            'composer create-project',
            'git clone',
            'ssh',
            'mysql',
            'psql',
            'mongo',
            'redis-cli',
            'docker run -it',
            'docker exec -it'
        ];

        return interactiveCommands.some(interactiveCmd =>
            command.toLowerCase().includes(interactiveCmd.toLowerCase())
        );
    }

    /**
     * 장기 실행 개발 서버 명령어인지 확인합니다.
     */
    private isLongRunningDevCommand(command: string): boolean {
        const lower = command.toLowerCase();
        return (
            /^npm\s+start\b/.test(lower) ||
            /^npm\s+run\s+(dev|start)\b/.test(lower) ||
            /^yarn\s+(dev|serve|start)\b/.test(lower) ||
            /^pnpm\s+(dev|serve|start)\b/.test(lower) ||
            /^bun\s+(run\s+)?dev\b/.test(lower) ||
            /\bvite\b/.test(lower) ||
            /react-scripts\s+start/.test(lower) ||
            /next\s+dev/.test(lower) ||
            /nuxt\s+(dev|start)/.test(lower) ||
            /ng\s+serve/.test(lower) ||
            /svelte(-kit)?\s+dev/.test(lower)
        );
    }

    /**
     * 대화형 명령어에 대한 기본 응답을 제공합니다.
     */
    private getDefaultResponseForCommand(command: string): string | null {
        const lowerCommand = command.toLowerCase();

        if (lowerCommand.includes('npm create vite')) {
            return 'y';
        }
        if (lowerCommand.includes('npm create react-app') || lowerCommand.includes('npx create-react-app')) {
            return 'y';
        }
        if (lowerCommand.includes('npm create vue')) {
            return 'y';
        }
        if (lowerCommand.includes('npm create next')) {
            return 'y';
        }

        if (lowerCommand.includes('git clone')) {
            return '';
        }

        if (lowerCommand.includes('ssh')) {
            return 'yes';
        }

        if (lowerCommand.includes('docker run -it') || lowerCommand.includes('docker exec -it')) {
            return 'exit';
        }

        return null;
    }

    /**
     * 위험한 명령어인지 확인합니다.
     */
    private isDangerousCommand(command: string): boolean {
        const lower = command.toLowerCase().trim();
        return (
            /^rm\s+-rf\s+\.$/.test(lower) ||
            /^rm\s+-rf\s+\.\*$/.test(lower) ||
            /^rm\s+-rf\s+\.\/$/.test(lower) ||
            /\brm\s+-rf\s+\.\//.test(lower) ||
            /\brm\s+-rf\s+\*\b/.test(lower) ||
            /\brimraf\b/.test(lower) ||
            /\bdel\s+\/s\b/.test(lower)
        );
    }

    /**
     * OS별 명령어 전처리 및 정규화 함수
     */
    private normalizeCommandForOS(command: string): string {
        if (!command || !command.trim()) return command;

        let normalized = command.trim();
        const osAdapter = this.executionManager.getOSAdapter();
        const isWindows = osAdapter.osType === 'win32';
        const userOS = this.userOS.toLowerCase();
        const isPowerShellEnv = isWindows && (userOS.includes('windows') || userOS === 'win32');

        if (isPowerShellEnv) {
            if (/cmd\.exe\s*\/d\s*\/c/i.test(normalized)) {
                let inQuotes = false;
                let quoteChar = '';
                let result = '';
                let i = 0;

                while (i < normalized.length) {
                    const char = normalized[i];
                    const nextTwo = normalized.substring(i, i + 3);

                    if (!inQuotes && (char === '"' || char === "'")) {
                        inQuotes = true;
                        quoteChar = char;
                        result += char;
                        i++;
                        continue;
                    }

                    if (inQuotes && char === quoteChar) {
                        inQuotes = false;
                        quoteChar = '';
                        result += char;
                        i++;
                        continue;
                    }

                    if (!inQuotes && nextTwo === ' &&') {
                        i += 3;
                        while (i < normalized.length && normalized[i] === ' ') i++;
                        break;
                    }

                    result += char;
                    i++;
                }

                if (result !== normalized) {
                    normalized = result;
                    console.log('[TerminalManager] PowerShell && 제거: 명령 전처리됨');
                }
            }

            normalized = normalized.replace(/cmd\.exe\s*\/d\s*\/c\s*"([^"\s&]+)"/gi, (match, path) => {
                if (!/\s/.test(path) && !/&/.test(path)) {
                    return `cmd.exe /d /c ${path}`;
                }
                return match;
            });
        }

        if (!isWindows) {
            normalized = normalized.replace(/\\/g, '/');
        }

        return normalized;
    }

    /**
     * VS Code 터미널 출력 디코딩 함수
     */
    private decodeTerminalOutput(text: string, opts?: { isWindows?: boolean; isCmdExe?: boolean }): string {
        const osAdapter = this.executionManager.getOSAdapter();
        const isWindows = opts?.isWindows ?? (osAdapter.osType === 'win32');
        const isCmdExe = opts?.isCmdExe ?? false;
        if (!text || !isWindows) return text;

        if (!isCmdExe) {
            return text;
        }

        const brokenCharPattern = /[?][가-힣]|[가-힣][?]|[?][가-힣][?]|[ʾҽϴ]/;
        if (brokenCharPattern.test(text)) {
            try {
                const iconv = require('iconv-lite');
                const buffer = Buffer.from(text, 'binary');
                const decoded = iconv.decode(buffer, 'cp949');
                const originalBroken = (text.match(/[?]/g) || []).length;
                const decodedBroken = (decoded.match(/[?]/g) || []).length;
                if (decodedBroken < originalBroken) {
                    return decoded;
                }
            } catch (e) {
                console.warn('[TerminalManager] CP949 디코딩 실패:', e);
            }
        }

        return text;
    }

    /**
     * 터미널 출력을 정리합니다.
     */
    private sanitizeOutput(text: string): string {
        if (!text) return text;

        let decoded = this.decodeTerminalOutput(text);

        const ansiPattern = /[\u001B\u009B][[\]()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0-4})*)?[0-9A-ORZcf-nqry=><]/g;
        return decoded.replace(/\r/g, '\n').replace(ansiPattern, '').replace(/\u0007/g, '').replace(/\u0008/g, '').trimEnd();
    }

    /**
     * PowerShell -EncodedCommand를 -Command로 변환합니다.
     */
    private normalizeEncodedPowerShellCommand(cmd: string): string {
        try {
            const m = cmd.match(/^(\s*powershell(?:\.exe)?\b[\s\S]*?)\s-EncodedCommand\s+([A-Za-z0-9+/=]+)([\s\S]*)$/i);
            if (!m) return cmd;
            const prefix = m[1];
            const b64 = m[2];
            const suffix = (m[3] || '').trim();
            let decoded = '';
            let isValidDecode = false;
            let decodeMethod = 'utf16le';
            try {
                const buf = Buffer.from(b64, 'base64');
                decoded = buf.toString('utf16le');
                const highNulRatio = (decoded.match(/\u0000/g) || []).length / Math.max(1, decoded.length);
                if (highNulRatio > 0.3) {
                    decoded = buf.toString('utf8');
                    decodeMethod = 'utf8';
                }

                const corruptionPatterns = [
                    /foreach\s*\([^$]/i,
                    /\$[a-zA-Z]{1,2}['"]/,
                    /\[Console\]:[^:]/,
                    /\s=\s/,
                    /if\s*\([^$\)]/,
                    /foreach\s*\(\s*$/,
                    /Get-Command\s+\s/,
                    /\$[a-zA-Z]{1,2}\s*=/,
                ];

                const hasCorruption = corruptionPatterns.some(pattern => pattern.test(decoded));

                const requiredPatterns = [
                    /\$ProgressPreference/i,
                    /\[Console\]::(OutputEncoding|InputEncoding)/i,
                    /foreach\s*\(\s*\$[a-zA-Z]+/i,
                    /(Test-Path|Get-Command|Write-Output|Set-ExecutionPolicy)/i,
                ];

                const allPatternsPresent = requiredPatterns.every(pattern => {
                    const found = pattern.test(decoded);
                    if (!found) {
                        console.log(`[TerminalManager] Required pattern not found: ${pattern}`);
                    }
                    return found;
                });

                const hasShortVars = /\$[a-zA-Z]{1,2}(['";\s=]|$)/.test(decoded);
                const hasFullVars = /(\$ProgressPreference|\$ErrorActionPreference|\$OutputEncoding|\$WarningPreference|\$InformationPreference)/i.test(decoded);
                const variableNameCheck = !hasShortVars || hasFullVars;

                const cmdletIntegrityCheck = !/Test-Path\s*[^-\s]|Get-Command\s*[^-\s]|Write-Output\s*[^-\s]/.test(decoded);

                isValidDecode = !hasCorruption && allPatternsPresent && variableNameCheck && cmdletIntegrityCheck && decoded.length > 50;

                if (!isValidDecode) {
                    console.log(`[TerminalManager] Decode validation failed: hasCorruption=${hasCorruption}, allPatternsPresent=${allPatternsPresent}, variableNameCheck=${variableNameCheck}, cmdletIntegrityCheck=${cmdletIntegrityCheck}, length=${decoded.length}`);
                }
            } catch (e) {
                console.log(`[TerminalManager] Decode exception: ${e}`);
                return cmd;
            }

            const fixCorruptedScript = (script: string): string => {
                script = script.replace(/""+([^"]*)""+/g, '"$1"');
                script = script.replace(/foreach\s*\(\s*in\s*@/gi, 'foreach($name in @');
                script = script.replace(/if\s*\(\s*-not\s*\)/gi, 'if (-not $null)');
                script = script.replace(/\s+=\s+;/g, ' = $null;');
                script = script.replace(/=\s+(?![^=])/g, ' = ');
                return script;
            };

            if (!isValidDecode) {
                console.log('[TerminalManager] Decoded script validation failed, storing for LLM repair');
                const cmdHash = Buffer.from(cmd).toString('base64').substring(0, 32);
                this.corruptedPowerShellScripts.set(cmdHash, { decoded, originalCommand: cmd });
                console.log(`[TerminalManager] 손상된 스크립트 저장 (key: ${cmdHash})`);
                return cmd;
            }

            const fixed = fixCorruptedScript(decoded);
            return `${prefix} -Command "${fixed.replace(/"/g, '\\"')}"${suffix ? ' ' + suffix : ''}`;
        } catch (e) {
            console.warn('[TerminalManager] normalizeEncodedPowerShellCommand failed:', e);
            return cmd;
        }
    }
}

