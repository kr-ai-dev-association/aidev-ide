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
import { ExecutionManager } from '../execution';

export class TerminalManager {
    private static instance: TerminalManager;
    private sessions: Map<string, TerminalSession> = new Map();
    private history: TerminalHistory;
    private executionManager: ExecutionManager;
    private sessionIdCounter = 0;
    private disposables: vscode.Disposable[] = [];

    private constructor() {
        this.history = new TerminalHistory();
        this.executionManager = ExecutionManager.getInstance();
        this.registerVSCodeEventHandlers();
    }

    public static getInstance(): TerminalManager {
        if (!TerminalManager.instance) {
            TerminalManager.instance = new TerminalManager();
        }
        return TerminalManager.instance;
    }

    /**
     * 새로운 터미널을 생성합니다
     */
    public createTerminal(options?: TerminalCreateOptions): TerminalSession {
        console.log('[TerminalManager] Creating new terminal');

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

        console.log(`[TerminalManager] Terminal created: ${sessionId} (${name})`);

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

        console.log(`[TerminalManager] Terminal closed: ${sessionId}`);
        return true;
    }

    /**
     * 모든 터미널을 닫습니다
     */
    public closeAllTerminals(): void {
        console.log('[TerminalManager] Closing all terminals');

        const sessions = Array.from(this.sessions.values());
        for (const session of sessions) {
            session.dispose();
        }

        this.sessions.clear();
        console.log('[TerminalManager] All terminals closed');
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
                    result.exitCode,
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
            console.log(`[TerminalManager] VS Code terminal closed: ${terminal.name}`);

            // 해당 터미널 세션 찾기
            for (const [sessionId, session] of this.sessions.entries()) {
                if (session.getTerminal() === terminal) {
                    this.sessions.delete(sessionId);
                    console.log(`[TerminalManager] Removed session: ${sessionId}`);
                    break;
                }
            }
        });

        this.disposables.push(closeDisposable);

        // 터미널 열림 감지 (정보 로깅용)
        const openDisposable = vscode.window.onDidOpenTerminal((terminal) => {
            console.log(`[TerminalManager] VS Code terminal opened: ${terminal.name}`);
        });

        this.disposables.push(openDisposable);
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
        console.log('[TerminalManager] Disposing');

        // 모든 터미널 닫기
        this.closeAllTerminals();

        // 이벤트 핸들러 정리
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];

        console.log('[TerminalManager] Disposed');
    }

    /**
     * Execution Manager를 가져옵니다
     */
    public getExecutionManager(): ExecutionManager {
        return this.executionManager;
    }
}

