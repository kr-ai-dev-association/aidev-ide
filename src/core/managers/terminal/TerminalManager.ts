/**
 * Terminal Manager
 * 터미널 세션들을 관리하는 메인 매니저
 */

import * as vscode from "vscode";
import {
  TerminalSession as ITerminalSession,
  TerminalCreateOptions,
  TerminalStats,
  CaptureOptions,
} from "./types";
import { TerminalSession } from "./TerminalSession";
import { TerminalHistory } from "./TerminalHistory";
import { ExecutionManager } from "../execution/ExecutionManager";
import { TaskManager } from "../task/TaskManager";
import { ErrorManager } from "../error/ErrorManager";
import { ErrorSource } from "../error/types";
import { SettingsManager } from "../state/SettingsManager";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { exec } from "child_process";
import { promisify } from "util";
const execAsync = promisify(exec);

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
  private daemonSocketPath: string = path.join(
    os.tmpdir(),
    "terminal-daemon.sock",
  );
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
  private userOS = "unknown";
  public static readonly FILE_OP_PREFIX = "__AIDEV_FILE_OP__::";

  // Shell Integration을 통해 수집된 명령어 히스토리 (터미널 이름 -> 명령어 배열)
  private shellIntegrationHistory: Map<
    string,
    Array<{
      command: string;
      output: string;
      exitCode?: number;
      timestamp: number;
    }>
  > = new Map();

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
    this.daemonOutputChannel = vscode.window.createOutputChannel(
      "AgentGoCoder Terminal Daemon",
    );
  }

  public static getInstance(
    context?: vscode.ExtensionContext,
  ): TerminalManager {
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
      strictEnv: options?.strictEnv,
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
    return this.getAllTerminals().filter((session) => session.isActive());
  }

  /**
   * 사용 가능한 터미널을 가져옵니다 (READY 상태)
   */
  public getAvailableTerminal(): TerminalSession | null {
    const available = this.getAllTerminals().find((session) =>
      session.isAvailable(),
    );
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
    },
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
      session = this.getOrCreateTerminal(
        options ? { cwd: options.cwd } : undefined,
      );
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
          cwd: options.cwd || session.getCwd(),
        });

        // 결과 업데이트
        session.updateCommandResult(
          commandId,
          result.exitCode ?? -1,
          result.duration,
          {
            stdout: result.stdout,
            stderr: result.stderr,
            combined: result.stdout + result.stderr,
          },
        );
      } catch (error) {
        console.error("[TerminalManager] Failed to capture output:", error);
      }
    }

    return {
      sessionId: session.getId(),
      commandId,
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

    const averageCommandDuration =
      commandCount > 0 ? totalDuration / commandCount : 0;

    const mostUsedCommands = Array.from(mostUsedMap.entries())
      .map(([command, count]) => ({ command, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalSessions: allSessions.length,
      activeSessions: activeSessions.length,
      totalCommands,
      averageCommandDuration,
      mostUsedCommands,
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
      const startDisposable = onDidStartExecution.call(
        windowAny,
        (event: any) => {
          const terminal = event.terminal;
          const execution = event.execution;
          const commandLine = execution.commandLine?.value || "";
          const terminalName = terminal.name;

          // 명령어 시작 시 기록 (출력은 나중에 업데이트)
          if (!this.shellIntegrationHistory.has(terminalName)) {
            this.shellIntegrationHistory.set(terminalName, []);
          }

          const history = this.shellIntegrationHistory.get(terminalName)!;
          history.push({
            command: commandLine,
            output: "", // 실행 종료 시 업데이트
            timestamp: Date.now(),
          });

          // 최근 50개만 유지
          if (history.length > 50) {
            history.shift();
          }
        },
      );

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
                let output = "";
                for await (const data of execution.read()) {
                  output += data;
                }
                // 출력이 너무 길면 자르기 (마지막 2000자)
                if (output.length > 2000) {
                  output = "...(truncated)\n" + output.slice(-2000);
                }
                lastEntry.output = output;
              }
            } catch (error) {
              console.warn(
                "[TerminalManager] Failed to read shell execution output:",
                error,
              );
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
  public getAllShellIntegrationHistory(): Map<
    string,
    Array<{
      command: string;
      output: string;
      exitCode?: number;
      timestamp: number;
    }>
  > {
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
    this.disposables.forEach((d) => d.dispose());
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
      throw new Error("Extension context not set");
    }
    const debugPath = path.join(
      this.extensionContext.extensionPath,
      "..",
      "terminal-daemon",
      "bin",
      "terminal-daemon",
    );
    const releasePath = path.join(
      this.extensionContext.extensionPath,
      "assets",
      "terminal-daemon",
      "terminal-daemon",
    );
    if (fs.existsSync(debugPath)) {
      return debugPath;
    }
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
      return {
        success: false,
        message: "terminal-daemon 바이너리를 찾을 수 없습니다.",
      };
    }
    // Windows에서는 chmod 불필요 (.exe가 자동 실행 가능)
    if (process.platform !== "win32") {
      await execAsync(`chmod +x "${p}"`);
    }
    return { success: true, message: "terminal-daemon 설치 완료" };
  }

  /**
   * 데몬을 시작합니다 (TerminalDaemonService 호환)
   * Note: 현재는 VS Code 터미널 API를 직접 사용하므로 비활성화됨
   */
  public async startDaemon(): Promise<{ success: boolean; message: string }> {
    // 터미널 데몬을 사용하지 않고 VS Code 터미널 API를 직접 사용
    return {
      success: true,
      message: "VS Code 터미널 API를 직접 사용합니다 (터미널 데몬 비활성화됨)",
    };
  }

  /**
   * 데몬을 중지합니다 (TerminalDaemonService 호환)
   */
  public async stopDaemon(): Promise<{ success: boolean; message: string }> {
    if (!this.daemonProcessRef && !this.isDaemonStarting) {
      return { success: false, message: "terminal-daemon 실행 중이 아님" };
    }
    this.cleanupDaemon();
    if (this.daemonOutputChannel) {
      this.daemonOutputChannel.appendLine("[INFO] terminal-daemon stopped");
    }
    return { success: true, message: "terminal-daemon 중지됨" };
  }

  /**
   * 데몬 상태를 가져옵니다 (TerminalDaemonService 호환)
   */
  public async getDaemonStatus(): Promise<{
    running: boolean;
    message: string;
    socket: string;
  }> {
    const running = !!this.daemonProcessRef;
    const exists = fs.existsSync(this.daemonSocketPath);
    return {
      running,
      message: exists ? "socket ready" : "socket not found",
      socket: this.daemonSocketPath,
    };
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
  public async testDaemonConnection(): Promise<{
    success: boolean;
    data?: any;
    error?: string;
  }> {
    try {
      const daemonPath = this.getDaemonPath();

      if (!fs.existsSync(daemonPath)) {
        return { success: false, error: "Terminal daemon binary not found" };
      }

      // 소켓 파일 존재 확인
      if (fs.existsSync(this.daemonSocketPath)) {
        return { success: true, data: { status: "running" } };
      } else {
        return { success: false, error: "Terminal daemon not running" };
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
        this.daemonProcessRef.kill(
          process.platform === "win32" ? undefined : "SIGTERM",
        );
      } catch (error) {
        console.warn("[TerminalManager] Failed to kill daemon process:", error);
      }
      this.daemonProcessRef = null;
    }

    // 소켓 파일 정리
    try {
      if (fs.existsSync(this.daemonSocketPath)) {
        fs.unlinkSync(this.daemonSocketPath);
      }
    } catch (error) {
      console.warn("[TerminalManager] Failed to remove daemon socket:", error);
    }
  }

  // ===== terminal/terminalManager.ts 호환 메서드들 =====

  private static terminalSeq = 0;
  private static agentGoCoderTerminal: vscode.Terminal | undefined;
  private static captureOutputChannel: vscode.OutputChannel | undefined;

  /**
   * AgentGoCoder 터미널을 가져오거나 생성합니다 (terminal/terminalManager.ts 호환)
   */
  public static getAgentGoCoderTerminal(
    projectRoot?: string,
    alwaysNew: boolean = true,
  ): vscode.Terminal {
    if (alwaysNew) {
      const name = `agentgocoder Terminal ${++TerminalManager.terminalSeq}`;
      console.log(`[TerminalManager] 새로운 터미널 생성: ${name}`);
      const terminalOptions: vscode.TerminalOptions = { name };
      if (projectRoot) {
        terminalOptions.cwd = projectRoot;
        console.log(
          `[TerminalManager] 터미널 작업 디렉토리 설정: ${projectRoot}`,
        );
      }
      const term = vscode.window.createTerminal(terminalOptions);
      const instance = TerminalManager.getInstance();
      const disposable = vscode.window.onDidCloseTerminal((event) => {
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
    const existing = vscode.window.terminals.filter(
      (t) => t.name === "agentgocoder Terminal",
    );
    if (existing.length > 0) {
      TerminalManager.agentGoCoderTerminal = existing[0];
      // 나머지 중복 터미널 정리
      for (let i = 1; i < existing.length; i++) {
        try {
          existing[i].dispose();
        } catch {}
      }
    }

    if (
      !TerminalManager.agentGoCoderTerminal ||
      TerminalManager.agentGoCoderTerminal.exitStatus !== undefined
    ) {
      const terminalOptions: vscode.TerminalOptions = {
        name: "agentgocoder Terminal",
      };

      if (projectRoot) {
        terminalOptions.cwd = projectRoot;
      }

      TerminalManager.agentGoCoderTerminal =
        vscode.window.createTerminal(terminalOptions);
      const instance = TerminalManager.getInstance();
      const disposable = vscode.window.onDidCloseTerminal((event) => {
        if (event === TerminalManager.agentGoCoderTerminal) {
          TerminalManager.agentGoCoderTerminal = undefined;
          disposable.dispose();
          // disposables 배열에서도 제거
          const idx = instance.disposables.indexOf(disposable);
          if (idx !== -1) instance.disposables.splice(idx, 1);
        }
      });
      instance.disposables.push(disposable);
    }

    return TerminalManager.agentGoCoderTerminal;
  }

  /**
   * 파일 작업 토큰을 생성합니다 (terminal/terminalManager.ts 호환)
   */
  public static buildFileOpTokens(
    ops: {
      type: "create" | "modify" | "delete";
      path: string;
      content?: string;
    }[],
  ): string[] {
    const FILE_OP_PREFIX = "__AIDEV_FILE_OP__::";
    return ops.map((op) => {
      const payload = JSON.stringify(op);
      const b64 = Buffer.from(payload, "utf8").toString("base64");
      return FILE_OP_PREFIX + b64;
    });
  }

  /**
   * LLM 응답에서 bash 명령어를 추출합니다 (terminal/terminalManager.ts 호환)
   * Note: 복잡한 파싱 로직(heredoc, if 블록 등)은 terminal/terminalManager.ts에 있음
   */
  public static extractBashCommandsFromLlmResponse(
    llmResponse: string,
  ): string[] {
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
      const lines = block
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#"));
      commands.push(...lines);
    }

    // PowerShell 블록 처리
    while ((match = pwshBlockRegex.exec(llmResponse)) !== null) {
      const block = (match[1] || "").trim();
      if (!block) continue;
      const lines = block
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#"));
      if (lines.length > 0) {
        commands.push(`powershell -Command "${lines.join("; ")}"`);
      }
    }

    // CMD 블록 처리
    while ((match = cmdBlockRegex.exec(llmResponse)) !== null) {
      const block = (match[1] || "").trim();
      if (!block) continue;
      const lines = block
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("REM") && !l.startsWith("::"));
      if (lines.length > 0) {
        commands.push(`cmd.exe /d /c "${lines.join(" & ")}"`);
      }
    }

    return commands;
  }

  /**
   * LLM 응답에서 bash 명령어를 추출하고 정규화합니다 (terminal/terminalManager.ts 호환)
   * Note: 실제 실행은 terminal/terminalManager.ts의 enqueueCommandsBatch를 통해 처리
   * 복잡한 파싱 로직(heredoc, if 블록 등)은 terminal/terminalManager.ts에 있음
   */
  public static executeBashCommandsFromLlmResponse(
    llmResponse: string,
    projectRoot?: string,
  ): string[] {
    // 폴백: 간단한 버전 사용
    const extractedCommands =
      TerminalManager.extractBashCommandsFromLlmResponse(llmResponse);
    return extractedCommands;
  }

  /**
   * 단일 bash 명령어를 실행합니다 (terminal/terminalManager.ts 호환)
   */
  public static executeBashCommand(
    command: string,
    projectRoot?: string,
  ): void {
    const terminal = TerminalManager.getAgentGoCoderTerminal(projectRoot, true);
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
    return (
      TerminalManager.extractBashCommandsFromLlmResponse(llmResponse).length > 0
    );
  }

  // ===== terminal/terminalManager.ts 큐 관리 및 명령어 실행 기능 =====

  /**
   * 명령어를 큐에 추가합니다 (terminal/terminalManager.ts 호환)
   */
  public enqueueCommandsBatch(
    commands: string[],
    priority = false,
    projectRoot?: string,
  ): void {
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
  public async enqueueCommand(
    command: string,
    options?: { cwd?: string; priority?: boolean },
  ): Promise<void> {
    if (!command || typeof command !== "string") {
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
  public getCommandSequenceStatus(): {
    isRunning: boolean;
    currentIndex: number;
    totalCommands: number;
  } {
    return {
      isRunning: this.pendingCommands.length > 0,
      currentIndex: this.currentCommandIndex,
      totalCommands: this.pendingCommands.length,
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
    vscode.window.showInformationMessage(
      "agentgocoder: 명령어 시퀀스가 중단되었습니다.",
    );
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
      TerminalManager.captureOutputChannel = vscode.window.createOutputChannel(
        "AgentGoCoder Terminal",
      );
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
      console.warn("[TerminalManager] getProjectRoot 실패:", error);
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
      const decoded = Buffer.from(b64, "base64").toString("utf8");
      const payload = JSON.parse(decoded) as {
        type: "create" | "modify" | "delete";
        path: string;
        content?: string;
      };
      const uri = vscode.Uri.file(payload.path);
      const channel = this.getCaptureOutputChannel();

      if (payload.type === "delete") {
        try {
          await vscode.workspace.fs.delete(uri);
          channel.appendLine(`[FILE-OP] deleted: ${payload.path}`);
        } catch (e: any) {
          const msg = e?.message || "";
          if (
            /ENOENT|not exist|FileNotFound/i.test(msg) ||
            e?.code === "FileNotFound"
          ) {
            channel.appendLine(
              `[FILE-OP] delete skipped (not found): ${payload.path}`,
            );
          } else {
            throw e;
          }
        }
      } else {
        // ensure directory exists
        const dir = path.dirname(payload.path);
        await vscode.workspace.fs.createDirectory(vscode.Uri.file(dir));
        const bytes = (payload.content || "").length;
        if (payload.content === undefined) {
          channel.appendLine(
            `[FILE-OP] skipped: ${payload.type} ${payload.path} (no content provided)`,
          );
          return false;
        }
        await vscode.workspace.fs.writeFile(
          uri,
          Buffer.from(payload.content, "utf8"),
        );
        channel.appendLine(
          `[FILE-OP] ${payload.type}: ${payload.path} (${bytes} bytes)`,
        );
      }
      return true;
    } catch (e: any) {
      const channel = this.getCaptureOutputChannel();
      const message = `[FILE-OP] failed: ${e?.message || String(e)}`;
      channel.appendLine(message);

      // ErrorManager에 파일 작업 에러 전달
      try {
        const errorManager = ErrorManager.getInstance();
        let errorPath = "unknown";
        try {
          const b64 = token.substring(TerminalManager.FILE_OP_PREFIX.length);
          const decoded = Buffer.from(b64, "base64").toString("utf8");
          const payload = JSON.parse(decoded) as {
            type: "create" | "modify" | "delete";
            path: string;
            content?: string;
          };
          errorPath = payload.path;
        } catch (parseErr) {
          console.debug(
            "[TerminalManager] File-op payload parse failed, using default path:",
            parseErr,
          );
        }
        errorManager
          .captureError(ErrorSource.TERMINAL, message, {
            command: "file-op",
            cwd: errorPath,
          })
          .catch((err) =>
            console.warn("[TerminalManager] ErrorManager capture failed:", err),
          );
      } catch (errMgrErr) {
        console.debug(
          "[TerminalManager] ErrorManager unavailable during file-op error capture:",
          errMgrErr,
        );
      }
      return false;
    }
  }

  /**
   * 대화형 명령어를 실행합니다 (terminal/terminalManager.ts 호환)
   */
  public async handleInteractiveCommand(
    command: string,
    projectRoot?: string,
  ): Promise<boolean> {
    // 명령어 실행 중지 상태 확인
    if (
      (globalThis as any).terminalMonitorService &&
      (globalThis as any).terminalMonitorService.isExecutionStopped()
    ) {
      console.log("[TerminalManager] 명령어 실행이 중지되었습니다:", command);
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
        if (osAdapter.osType === "win32") {
          await this.executionManager.runCommandCapture(
            `if exist node_modules\\esbuild rmdir /s /q node_modules\\esbuild 2>nul`,
            { cwd },
          );
        } else {
          await this.executionManager.runCommandCapture(
            `rm -rf node_modules/esbuild 2>/dev/null || true`,
            { cwd },
          );
        }
      } catch {}
    }

    // 장기 실행 명령어 실행 전 기존 프로세스 종료
    if (isDevLong) {
      try {
        console.log(
          `[TerminalManager] 장기 실행 명령어 감지, 기존 프로세스 종료 시도`,
        );
        const effectiveCwd = await this.getEffectiveCwd();
        const cwd = effectiveCwd || projectRoot;

        // 1. VS Code 터미널에서 실행 중인 agentgocoder 터미널 찾아서 종료
        try {
          const aidevTerminals = vscode.window.terminals.filter(
            (t) =>
              t.name.startsWith("agentgocoder Terminal") &&
              t.exitStatus === undefined,
          );
          for (const terminal of aidevTerminals) {
            try {
              terminal.sendText("\x03"); // Ctrl+C
              await new Promise((resolve) => setTimeout(resolve, 300));
              terminal.dispose();
            } catch {}
          }
        } catch {}

        // 3. 프로세스 이름 기반 종료 (OS 어댑터 활용)
        const osAdapter = this.executionManager.getOSAdapter();
        const isWin = osAdapter.osType === "win32";
        const errSink = isWin ? "2>nul" : "2>/dev/null";

        if (isWin) {
          const killCommand = `taskkill /F /FI "WINDOWTITLE eq *npm*dev*" /T ${errSink} || taskkill /F /FI "COMMANDLINE eq *npm*run*dev*" /T ${errSink} || echo "No process found"`;
          try {
            await this.executionManager.runCommandCapture(killCommand, { cwd });
          } catch {}
        }

        try {
          const absCwd = path.resolve(cwd || ".");

          // CWD 기반 node 프로세스 검색 후 종료
          const findProcessCmd =
            osAdapter.getFindNodeProcessByCwdCommand(absCwd);
          const processResult = await this.executionManager.runCommandCapture(
            findProcessCmd,
            { cwd: absCwd },
          );

          if (processResult.stdout && processResult.stdout.trim()) {
            const pids = processResult.stdout
              .trim()
              .split(/\r?\n/)
              .filter((pid) => pid && /^\d+$/.test(pid));
            for (const pid of pids) {
              try {
                const checkCwdCmd = osAdapter.getProcessCwdCommand(
                  parseInt(pid),
                );
                const cwdResult = await this.executionManager.runCommandCapture(
                  checkCwdCmd,
                  { cwd: absCwd },
                );
                const processCwd = cwdResult.stdout.trim();

                // Unix: CWD 일치 확인 후 종료 / Windows: CommandLine 기반이므로 바로 종료
                if (isWin || processCwd === absCwd) {
                  const killCmd = osAdapter.getKillProcessCommand(
                    parseInt(pid),
                  );
                  await this.executionManager.runCommandCapture(
                    `${killCmd} ${errSink} || ${isWin ? "echo ok" : "true"}`,
                    { cwd: absCwd },
                  );
                }
              } catch (e) {
                console.debug(
                  `[TerminalManager] Individual process check failed (non-critical):`,
                  e,
                );
              }
            }
          }

          // dev 서버 패턴 프로세스 검색 후 종료
          const devServerCmd = osAdapter.getFindDevServerProcessCommand(absCwd);
          const psResult = await this.executionManager.runCommandCapture(
            devServerCmd,
            { cwd: absCwd },
          );

          if (psResult.stdout && psResult.stdout.trim()) {
            const matchingPids = psResult.stdout
              .trim()
              .split(/\r?\n/)
              .filter((pid) => pid && /^\d+$/.test(pid));
            for (const pid of matchingPids) {
              const killCmd = osAdapter.getKillProcessCommand(parseInt(pid));
              await this.executionManager.runCommandCapture(
                `${killCmd} ${errSink} || ${isWin ? "echo ok" : "true"}`,
                { cwd: absCwd },
              );
            }
          }
        } catch {}

        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        console.warn(
          `[TerminalManager] 기존 프로세스 종료 실패 (계속 진행): ${error}`,
        );
      }
    }

    let shouldUseTerminal = this.isInteractiveCommand(lower);

    const selectShellForCapture = (cmd: string): string | undefined => {
      const c = cmd.trim();
      const osAdapter = this.executionManager.getOSAdapter();
      if (/^(powershell|pwsh)\b/i.test(c) || /-encodedcommand\b/i.test(c))
        return osAdapter.osType === "win32" ? "powershell.exe" : undefined;
      if (/^cmd\.exe\b/i.test(c) || /^cmd\b/i.test(c))
        return osAdapter.osType === "win32" ? "cmd.exe" : undefined;
      if (osAdapter.osType === "win32") return "powershell.exe";
      return undefined;
    };

    // 위험 명령어 방지
    if (this.isDangerousCommand(lower)) {
      const answer = await vscode.window.showWarningMessage(
        `매우 위험한 명령어가 감지되었습니다: "${command}"\n실행 시 현재 작업 디렉토리의 파일이 삭제될 수 있습니다. 계속하시겠습니까?`,
        { modal: true },
        "실행",
        "취소",
      );
      if (answer !== "실행") {
        vscode.window.showInformationMessage(
          "agentgocoder: 위험 명령어 실행이 취소되었습니다.",
        );
        return false;
      }
    }

    // cd 명령어 감지 및 작업 디렉토리 업데이트
    if (command.toLowerCase().trim().startsWith("cd ")) {
      const targetDir = command.substring(3).trim();
      if (targetDir) {
        this.currentWorkingDirectory = targetDir;
      }
    }

    // 현재 작업 디렉토리를 프로젝트 루트로 설정
    const effectiveCwd = await this.getEffectiveCwd();
    let cwd =
      this.currentWorkingDirectory &&
      this.currentWorkingDirectory !== "bank-app-front"
        ? this.currentWorkingDirectory
        : effectiveCwd;

    if (cwd === "$PROJECT_ROOT" || cwd === '"$PROJECT_ROOT"') {
      console.warn(
        `[TerminalManager] cwd가 "$PROJECT_ROOT" 문자열로 설정됨, 실제 경로로 변환: ${effectiveCwd}`,
      );
      cwd = effectiveCwd;
    }

    if (
      cwd &&
      (cwd.includes("$PROJECT_ROOT") || cwd.includes("PROJECT_ROOT"))
    ) {
      console.warn(
        `[TerminalManager] cwd에 PROJECT_ROOT 변수 포함됨, 실제 경로로 변환: ${effectiveCwd}`,
      );
      cwd = effectiveCwd;
    }

    // 명령어에서 cd 부분 제거
    let cleanCommand = command;
    if (command.toLowerCase().trim().startsWith("cd ")) {
      const andIndex = command.indexOf("&&");
      if (andIndex !== -1) {
        cleanCommand = command.substring(andIndex + 2).trim();
      } else {
        cleanCommand = "";
      }
    }

    if (cleanCommand === "") {
      console.log(`[TerminalManager] cd 명령어만 실행됨: ${command}`);
      return true;
    }

    if (shouldUseTerminal) {
      const channel = this.getCaptureOutputChannel();
      channel.appendLine(
        `\n===== Executing in VS Code Terminal: ${cleanCommand} (${new Date().toLocaleString()}) =====`,
      );
      channel.appendLine(`CWD: ${cwd || "(not set)"}`);
      channel.appendLine(`Command: ${cleanCommand}`);
      channel.appendLine(`Working Directory: ${cwd || "(not set)"}`);

      const terminal = TerminalManager.getAgentGoCoderTerminal(
        projectRoot,
        true,
      );
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
          `agentgocoder: 대화형 명령어 실행됨 - ${command}\n기본 응답이 자동으로 제공됩니다.`,
          { modal: false },
        );
      } else {
        vscode.window.showInformationMessage(
          `agentgocoder: Bash 명령어 실행됨 - ${command}`,
        );
      }

      channel.appendLine(`----- Command Sent to VS Code Terminal -----`);
      channel.appendLine(`Command: ${cleanCommand}`);
      channel.appendLine(`Working Directory: ${cwd || "(not set)"}`);
      return true;
    }

    // 기본 경로: terminal-daemon 경유 실행 (비대화형)
    const channel = this.getCaptureOutputChannel();
    const normalizedCommand = this.normalizeCommandForOS(cleanCommand);

    channel.appendLine(
      `\n===== Executing: ${normalizedCommand} (${new Date().toLocaleString()}) =====`,
    );
    channel.appendLine(`CWD: ${cwd || "(not set)"}`);
    channel.appendLine(`Command: ${normalizedCommand}`);
    channel.appendLine(`Working Directory: ${cwd || "(not set)"}`);

    const isErrorLike = (text: string) => {
      const basicErrorPattern =
        /(npm\s+err!|^error:|^fatal:|\berror\b|\bfail(ed)?\b|\bexception\b|ERROR in|Traceback|panic:|Exit status [1-9]|BUILD FAILED|Missing script:)/i;
      const compilationErrorPattern =
        /(package.*does not exist|cannot find symbol|Compilation failure|BUILD FAILURE|symbol:.*class|symbol:.*method|symbol:.*variable|package.*is missing|unmappable character.*encoding|File encoding has not been set|platform encoding|x-windows-949|package org\.springframework|package lombok|package jakarta\.persistence|symbol:.*class.*Page|symbol:.*class.*Pageable|symbol:.*class.*Getter|symbol:.*class.*Setter|symbol:.*class.*Entity|symbol:.*class.*Table|symbol:.*class.*JpaRepository|symbol:.*variable.*Customizer|POM file.*does not exist)/i;
      const batchErrorPattern =
        /(앰퍼샌드|&.*사용할 수 없습니다|&.*예약|%.*%.*ʾҽ|%[^%]*%.*오류|batch.*error|cmd.*error|syntax.*error)/i;
      const powershellParserPattern =
        /(ParserError|InvalidEndOfLine|토큰.*올바른.*문 구분 기호|CategoryInfo|FullyQualifiedErrorId|&&.*토큰|&&.*이 버전|CommandNotFoundException|cmdlet.*인식되지|용어가.*cmdlet|CLIXML)/i;
      const encodingErrorPattern =
        /([ʾҽϴ]+|\\?[?][가-힣]|[가-힣][?]|[?][가-힣][?]|파일 이름.*구문|디렉터리 이름.*구문|볼륨 레이블.*구문)/i;
      const fileSyntaxErrorPattern =
        /(파일 이름.*구문|디렉터리 이름.*구문|볼륨 레이블.*구문|The filename.*syntax|The directory name.*syntax)/i;

      return (
        basicErrorPattern.test(text) ||
        batchErrorPattern.test(text) ||
        powershellParserPattern.test(text) ||
        encodingErrorPattern.test(text) ||
        fileSyntaxErrorPattern.test(text) ||
        compilationErrorPattern.test(text)
      );
    };

    try {
      const id = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      cleanCommand = this.normalizeEncodedPowerShellCommand(cleanCommand);
      const finalCommand = this.normalizeCommandForOS(cleanCommand);

      console.log(
        `[TerminalManager] Starting via VS Code terminal. id=${id}, cwd=${cwd || "(not set)"}, cmd="${finalCommand}"`,
      );
      channel.appendLine(
        `[DEBUG] Executing command in VS Code terminal: ${finalCommand}`,
      );
      channel.appendLine(`[DEBUG] Working directory: ${cwd || "(not set)"}`);

      if (finalCommand !== cleanCommand) {
        console.log(
          `[TerminalManager] 명령 전처리됨: ${cleanCommand.substring(0, 100)}... → ${finalCommand.substring(0, 100)}...`,
        );
        channel.appendLine(
          `[DEBUG] Command normalized: && removed or path normalized`,
        );
      }

      const terminal = TerminalManager.getAgentGoCoderTerminal(
        projectRoot,
        true,
      );

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
          this.decodeTerminalOutput(data, {
            isWindows: osAdapter.osType === "win32",
            isCmdExe: /cmd\.exe/i.test(finalCommand),
          });
        },
        (data: string) => {
          const osAdapter = this.executionManager.getOSAdapter();
          const decoded = this.decodeTerminalOutput(data, {
            isWindows: osAdapter.osType === "win32",
            isCmdExe: /cmd\.exe/i.test(finalCommand),
          });
          try {
            const errorManager = ErrorManager.getInstance();
            errorManager
              .captureError(ErrorSource.TERMINAL, decoded, {
                command: finalCommand,
                cwd,
                terminalName: terminal.name,
              })
              .catch((err) =>
                console.warn(
                  "[TerminalManager] ErrorManager capture failed:",
                  err,
                ),
              );
          } catch {
            // ErrorManager 초기화 실패 등은 무시
          }
        },
      );

      if (isDevLong) {
        runPromise
          .then(async (res) => {
            if (res.code !== 0) {
              channel.appendLine(`----- Long-running Command Failed -----`);
              channel.appendLine(`Command: ${cleanCommand}`);
              channel.appendLine(`Exit code: ${res.code}`);
              channel.appendLine(`Working Directory: ${cwd || "(not set)"}`);
              if (res.stderr) {
                const decodedStderr = this.decodeTerminalOutput(res.stderr);
                channel.appendLine(`Stderr: ${decodedStderr}`);
              }
              channel.show(true);

              vscode.window.showErrorMessage(
                `agentgocoder: Long-running 명령 실패 (${cleanCommand})`,
              );
            } else {
              channel.appendLine(`----- Long-running Command Completed -----`);
              channel.appendLine(`Command: ${cleanCommand}`);
              channel.appendLine(`Exit code: ${res.code}`);
              channel.appendLine(`Working Directory: ${cwd || "(not set)"}`);
              if (res.stdout) {
                channel.appendLine(`Output: ${res.stdout}`);
              }
            }
          })
          .catch(async (err) => {
            channel.appendLine(`----- Long-running Command Error -----`);
            channel.appendLine(`Command: ${cleanCommand}`);
            channel.appendLine(`Error: ${err?.message || String(err)}`);
            channel.appendLine(`Working Directory: ${cwd || "(not set)"}`);

            vscode.window.showErrorMessage(
              `agentgocoder: Long-running 명령 오류 (${cleanCommand})`,
            );
          });
        channel.appendLine(`----- Long-running Command Started -----`);
        channel.appendLine(`Command: ${cleanCommand}`);
        channel.appendLine(`Working Directory: ${cwd || "(not set)"}`);
        console.log(
          `[TerminalManager] Started long-running via VS Code terminal: ${cleanCommand}`,
        );
        try {
          channel.show(true);
        } catch {}
        return true;
      }

      const result = await runPromise;

      const hasErrorInStderr = isErrorLike(result.stderr || "");
      const hasErrorInStdout = isErrorLike(result.stdout || "");
      const hasError =
        result.code !== 0 || hasErrorInStderr || hasErrorInStdout;

      if (hasError) {
        channel.appendLine(`----- Command Failed -----`);
        channel.appendLine(`Command: ${finalCommand}`);
        channel.appendLine(`Exit code: ${result.code}`);
        channel.appendLine(`Working Directory: ${cwd || "(not set)"}`);
        if (result.stderr) {
          const decodedStderr = this.decodeTerminalOutput(result.stderr);
          channel.appendLine(`Stderr: ${decodedStderr}`);
        }
        if (result.stdout && hasErrorInStdout) {
          const decodedStdout = this.decodeTerminalOutput(result.stdout);
          channel.appendLine(
            `Stdout (contains errors): ${decodedStdout.substring(0, 500)}...`,
          );
        }
        channel.show(true);

        console.log(
          `[TerminalManager] 오류 감지: exitCode=${result.code}, hasErrorInStderr=${hasErrorInStderr}, hasErrorInStdout=${hasErrorInStdout}`,
        );
        console.log(
          `[TerminalManager] 오류 출력 길이: stderr=${(result.stderr || "").length}, stdout=${(result.stdout || "").length}`,
        );

        vscode.window.showErrorMessage(
          `agentgocoder: 명령 실패 (${cleanCommand})`,
        );
        return false;
      }

      channel.appendLine(`----- Command Completed Successfully -----`);
      channel.appendLine(`Command: ${cleanCommand}`);
      channel.appendLine(`Exit code: ${result.code}`);
      channel.appendLine(`Working Directory: ${cwd || "(not set)"}`);
      if (result.stdout) {
        channel.appendLine(`Output: ${result.stdout}`);
      }
      console.log(
        `[TerminalManager] Executed via VS Code terminal: ${cleanCommand} (exit code: ${result.code})`,
      );

      if (result.code === 0) {
        return true;
      }

      return false;
    } catch (e: any) {
      channel.appendLine(
        `[WARN] VS Code 터미널 실행 실패, 로컬 실행으로 폴백: ${e?.message || e}`,
      );
      channel.appendLine(
        `[ERROR] Execution error details: ${JSON.stringify(e)}`,
      );
      console.error(`[TerminalManager] VS Code terminal execution failed:`, e);
      const result = await this.executionManager.runCommandCapture(
        this.normalizeEncodedPowerShellCommand(cleanCommand),
        { cwd, shell: true },
        (chunk) => {
          chunk.split(/\r?\n/).forEach((line) => {
            const cleaned = this.sanitizeOutput(line).trim();
            if (!cleaned) return;
            channel.appendLine(cleaned);
          });
        },
        (chunk) => {
          chunk.split(/\r?\n/).forEach((line) => {
            const cleaned = this.sanitizeOutput(line).trim();
            if (!cleaned) return;
            channel.appendLine(cleaned);
            try {
              const errorManager = ErrorManager.getInstance();
              errorManager
                .captureError(ErrorSource.TERMINAL, cleaned, {
                  command: cleanCommand,
                  cwd,
                })
                .catch((err) =>
                  console.warn(
                    "[TerminalManager] ErrorManager capture failed:",
                    err,
                  ),
                );
            } catch (errMgrErr) {
              console.debug(
                "[TerminalManager] ErrorManager unavailable during command error capture:",
                errMgrErr,
              );
            }
          });
        },
      );

      if (result.code !== 0 || isErrorLike(result.stderr)) {
        channel.appendLine(`----- Exit code: ${result.code} -----`);
        channel.show(true);
        vscode.window.showErrorMessage(
          `agentgocoder: 명력 실패 (${cleanCommand})`,
        );
        return false;
      }
      console.log(
        `[TerminalManager] Executed locally (fallback): ${cleanCommand}`,
      );
      return true;
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

  // ===== 헬퍼 함수들 (terminal/terminalManager.ts에서 이동) =====

  /**
   * 대화형 명령어인지 확인합니다.
   */
  private isInteractiveCommand(command: string): boolean {
    const interactiveCommands = [
      "npm init",
      "npm create",
      "npx create",
      "yarn create",
      "create-react-app",
      "vue create",
      "ng new",
      "dotnet new",
      "cargo new",
      "flutter create",
      "rails new",
      "django-admin startproject",
      "composer create-project",
      "git clone",
      "ssh",
      "mysql",
      "psql",
      "mongo",
      "redis-cli",
      "docker run -it",
      "docker exec -it",
    ];

    return interactiveCommands.some((interactiveCmd) =>
      command.toLowerCase().includes(interactiveCmd.toLowerCase()),
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

    if (lowerCommand.includes("npm create vite")) {
      return "y";
    }
    if (
      lowerCommand.includes("npm create react-app") ||
      lowerCommand.includes("npx create-react-app")
    ) {
      return "y";
    }
    if (lowerCommand.includes("npm create vue")) {
      return "y";
    }
    if (lowerCommand.includes("npm create next")) {
      return "y";
    }

    if (lowerCommand.includes("git clone")) {
      return "";
    }

    if (lowerCommand.includes("ssh")) {
      return "yes";
    }

    if (
      lowerCommand.includes("docker run -it") ||
      lowerCommand.includes("docker exec -it")
    ) {
      return "exit";
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
    const isWindows = osAdapter.osType === "win32";
    const userOS = this.userOS.toLowerCase();
    const isPowerShellEnv =
      isWindows && (userOS.includes("windows") || userOS === "win32");

    if (isPowerShellEnv) {
      if (/cmd\.exe\s*\/d\s*\/c/i.test(normalized)) {
        let inQuotes = false;
        let quoteChar = "";
        let result = "";
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
            quoteChar = "";
            result += char;
            i++;
            continue;
          }

          if (!inQuotes && nextTwo === " &&") {
            i += 3;
            while (i < normalized.length && normalized[i] === " ") i++;
            break;
          }

          result += char;
          i++;
        }

        if (result !== normalized) {
          normalized = result;
          console.log("[TerminalManager] PowerShell && 제거: 명령 전처리됨");
        }
      }

      normalized = normalized.replace(
        /cmd\.exe\s*\/d\s*\/c\s*"([^"\s&]+)"/gi,
        (match, path) => {
          if (!/\s/.test(path) && !/&/.test(path)) {
            return `cmd.exe /d /c ${path}`;
          }
          return match;
        },
      );
    }

    if (!isWindows) {
      normalized = normalized.replace(/\\/g, "/");
    }

    return normalized;
  }

  /**
   * VS Code 터미널 출력 디코딩 함수
   */
  private decodeTerminalOutput(
    text: string,
    opts?: { isWindows?: boolean; isCmdExe?: boolean },
  ): string {
    const osAdapter = this.executionManager.getOSAdapter();
    const isWindows = opts?.isWindows ?? osAdapter.osType === "win32";
    const isCmdExe = opts?.isCmdExe ?? false;
    if (!text || !isWindows) return text;

    if (!isCmdExe) {
      return text;
    }

    const brokenCharPattern = /[?][가-힣]|[가-힣][?]|[?][가-힣][?]|[ʾҽϴ]/;
    if (brokenCharPattern.test(text)) {
      try {
        const iconv = require("iconv-lite");
        const buffer = Buffer.from(text, "binary");
        const decoded = iconv.decode(buffer, "cp949");
        const originalBroken = (text.match(/[?]/g) || []).length;
        const decodedBroken = (decoded.match(/[?]/g) || []).length;
        if (decodedBroken < originalBroken) {
          return decoded;
        }
      } catch (e) {
        console.warn("[TerminalManager] CP949 디코딩 실패:", e);
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

    const ansiPattern =
      /[\u001B\u009B][[\]()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0-4})*)?[0-9A-ORZcf-nqry=><]/g;
    return decoded
      .replace(/\r/g, "\n")
      .replace(ansiPattern, "")
      .replace(/\u0007/g, "")
      .replace(/\u0008/g, "")
      .trimEnd();
  }

  /**
   * PowerShell -EncodedCommand를 -Command로 변환합니다.
   */
  private normalizeEncodedPowerShellCommand(cmd: string): string {
    try {
      const m = cmd.match(
        /^(\s*powershell(?:\.exe)?\b[\s\S]*?)\s-EncodedCommand\s+([A-Za-z0-9+/=]+)([\s\S]*)$/i,
      );
      if (!m) return cmd;
      const prefix = m[1];
      const b64 = m[2];
      const suffix = (m[3] || "").trim();
      let decoded = "";
      let isValidDecode = false;
      let decodeMethod = "utf16le";
      try {
        const buf = Buffer.from(b64, "base64");
        decoded = buf.toString("utf16le");
        const highNulRatio =
          (decoded.match(/\u0000/g) || []).length / Math.max(1, decoded.length);
        if (highNulRatio > 0.3) {
          decoded = buf.toString("utf8");
          decodeMethod = "utf8";
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

        const hasCorruption = corruptionPatterns.some((pattern) =>
          pattern.test(decoded),
        );

        const requiredPatterns = [
          /\$ProgressPreference/i,
          /\[Console\]::(OutputEncoding|InputEncoding)/i,
          /foreach\s*\(\s*\$[a-zA-Z]+/i,
          /(Test-Path|Get-Command|Write-Output|Set-ExecutionPolicy)/i,
        ];

        const allPatternsPresent = requiredPatterns.every((pattern) => {
          const found = pattern.test(decoded);
          if (!found) {
            console.log(
              `[TerminalManager] Required pattern not found: ${pattern}`,
            );
          }
          return found;
        });

        const hasShortVars = /\$[a-zA-Z]{1,2}(['";\s=]|$)/.test(decoded);
        const hasFullVars =
          /(\$ProgressPreference|\$ErrorActionPreference|\$OutputEncoding|\$WarningPreference|\$InformationPreference)/i.test(
            decoded,
          );
        const variableNameCheck = !hasShortVars || hasFullVars;

        const cmdletIntegrityCheck =
          !/Test-Path\s*[^-\s]|Get-Command\s*[^-\s]|Write-Output\s*[^-\s]/.test(
            decoded,
          );

        isValidDecode =
          !hasCorruption &&
          allPatternsPresent &&
          variableNameCheck &&
          cmdletIntegrityCheck &&
          decoded.length > 50;

        if (!isValidDecode) {
          console.log(
            `[TerminalManager] Decode validation failed: hasCorruption=${hasCorruption}, allPatternsPresent=${allPatternsPresent}, variableNameCheck=${variableNameCheck}, cmdletIntegrityCheck=${cmdletIntegrityCheck}, length=${decoded.length}`,
          );
        }
      } catch (e) {
        console.log(`[TerminalManager] Decode exception: ${e}`);
        return cmd;
      }

      const fixCorruptedScript = (script: string): string => {
        script = script.replace(/""+([^"]*)""+/g, '"$1"');
        script = script.replace(
          /foreach\s*\(\s*in\s*@/gi,
          "foreach($name in @",
        );
        script = script.replace(/if\s*\(\s*-not\s*\)/gi, "if (-not $null)");
        script = script.replace(/\s+=\s+;/g, " = $null;");
        script = script.replace(/=\s+(?![^=])/g, " = ");
        return script;
      };

      if (!isValidDecode) {
        console.log(
          "[TerminalManager] Decoded script validation failed, leaving original command intact",
        );
        return cmd;
      }

      const fixed = fixCorruptedScript(decoded);
      return `${prefix} -Command "${fixed.replace(/"/g, '\\"')}"${suffix ? " " + suffix : ""}`;
    } catch (e) {
      console.warn(
        "[TerminalManager] normalizeEncodedPowerShellCommand failed:",
        e,
      );
      return cmd;
    }
  }
}
