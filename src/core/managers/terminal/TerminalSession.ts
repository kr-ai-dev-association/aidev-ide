/**
 * Terminal Session
 * 개별 터미널 세션을 관리하는 클래스
 */

import * as vscode from 'vscode';
import {
    TerminalSession as ITerminalSession,
    TerminalStatus,
    TerminalCommand,
    TerminalCreateOptions,
    TerminalMetadata,
    TerminalOutput
} from './types';

export class TerminalSession {
    private session: ITerminalSession;
    private commandIdCounter = 0;

    constructor(
        id: string,
        terminal: vscode.Terminal,
        options?: TerminalCreateOptions
    ) {
        this.session = {
            id,
            name: terminal.name,
            terminal,
            status: TerminalStatus.CREATING,
            createdAt: Date.now(),
            lastUsedAt: Date.now(),
            history: [],
            cwd: options?.cwd,
            metadata: options?.metadata
        };

        this.registerEventHandlers();
        
        // 초기화 완료
        setTimeout(() => {
            this.updateStatus(TerminalStatus.READY);
        }, 100);
    }

    /**
     * 세션 ID를 가져옵니다
     */
    public getId(): string {
        return this.session.id;
    }

    /**
     * 세션 정보를 가져옵니다
     */
    public getSession(): ITerminalSession {
        return { ...this.session };
    }

    /**
     * VS Code 터미널을 가져옵니다
     */
    public getTerminal(): vscode.Terminal {
        return this.session.terminal;
    }

    /**
     * 상태를 가져옵니다
     */
    public getStatus(): TerminalStatus {
        return this.session.status;
    }

    /**
     * 명령어를 전송합니다
     */
    public sendCommand(command: string, cwd?: string): string {
        console.log(`[TerminalSession] Sending command: ${command}`);

        this.updateStatus(TerminalStatus.BUSY);
        this.session.lastUsedAt = Date.now();

        // 명령어 히스토리에 추가
        const commandId = this.generateCommandId();
        const commandEntry: TerminalCommand = {
            id: commandId,
            command,
            cwd: cwd || this.session.cwd,
            timestamp: Date.now()
        };

        this.session.history.push(commandEntry);

        // CWD 변경이 필요한 경우
        if (cwd && cwd !== this.session.cwd) {
            this.session.terminal.sendText(`cd "${cwd}"`);
            this.session.cwd = cwd;
        }

        // 명령어 전송
        this.session.terminal.sendText(command);

        // 터미널 표시
        this.session.terminal.show(true);

        return commandId;
    }

    /**
     * 텍스트를 전송합니다 (히스토리에 기록하지 않음)
     */
    public sendText(text: string): void {
        this.session.terminal.sendText(text);
        this.session.lastUsedAt = Date.now();
    }

    /**
     * 터미널을 표시합니다
     */
    public show(preserveFocus?: boolean): void {
        this.session.terminal.show(preserveFocus);
    }

    /**
     * 터미널을 숨깁니다
     */
    public hide(): void {
        this.session.terminal.hide();
    }

    /**
     * 터미널을 닫습니다
     */
    public dispose(): void {
        console.log(`[TerminalSession] Disposing session: ${this.session.id}`);
        this.updateStatus(TerminalStatus.CLOSED);
        this.session.terminal.dispose();
    }

    /**
     * 히스토리를 가져옵니다
     */
    public getHistory(): TerminalCommand[] {
        return [...this.session.history];
    }

    /**
     * 마지막 N개의 명령어를 가져옵니다
     */
    public getRecentCommands(count: number = 10): TerminalCommand[] {
        return this.session.history.slice(-count);
    }

    /**
     * 특정 명령어를 찾습니다
     */
    public findCommand(commandId: string): TerminalCommand | undefined {
        return this.session.history.find(cmd => cmd.id === commandId);
    }

    /**
     * 명령어 결과를 업데이트합니다
     */
    public updateCommandResult(
        commandId: string,
        exitCode: number,
        duration: number,
        output?: TerminalOutput
    ): void {
        const command = this.findCommand(commandId);
        if (command) {
            command.exitCode = exitCode;
            command.duration = duration;
            command.output = output;
            console.log(`[TerminalSession] Updated command result: ${commandId}, exit=${exitCode}`);
        }
    }

    /**
     * 현재 작업 디렉토리를 가져옵니다
     */
    public getCwd(): string | undefined {
        return this.session.cwd;
    }

    /**
     * 현재 작업 디렉토리를 설정합니다
     */
    public setCwd(cwd: string): void {
        this.session.cwd = cwd;
    }

    /**
     * 메타데이터를 가져옵니다
     */
    public getMetadata(): TerminalMetadata | undefined {
        return this.session.metadata;
    }

    /**
     * 메타데이터를 설정합니다
     */
    public setMetadata(metadata: TerminalMetadata): void {
        this.session.metadata = metadata;
    }

    /**
     * 마지막 사용 시간을 업데이트합니다
     */
    public updateLastUsed(): void {
        this.session.lastUsedAt = Date.now();
    }

    /**
     * 터미널이 활성 상태인지 확인합니다
     */
    public isActive(): boolean {
        return this.session.status === TerminalStatus.READY || 
               this.session.status === TerminalStatus.BUSY;
    }

    /**
     * 터미널이 사용 가능한지 확인합니다
     */
    public isAvailable(): boolean {
        return this.session.status === TerminalStatus.READY;
    }

    /**
     * 상태를 업데이트합니다
     */
    private updateStatus(status: TerminalStatus): void {
        const oldStatus = this.session.status;
        this.session.status = status;
        
        if (oldStatus !== status) {
            console.log(`[TerminalSession] Status changed: ${this.session.id} ${oldStatus} -> ${status}`);
        }

        // BUSY 상태가 아니면 READY로 전환 (에러 상태 제외)
        if (status === TerminalStatus.BUSY) {
            setTimeout(() => {
                if (this.session.status === TerminalStatus.BUSY) {
                    this.updateStatus(TerminalStatus.READY);
                }
            }, 2000); // 2초 후 자동으로 READY로 전환
        }
    }

    /**
     * 이벤트 핸들러를 등록합니다
     */
    private registerEventHandlers(): void {
        // VS Code 터미널은 직접적인 close 이벤트를 제공하지 않음
        // 대신 window.onDidCloseTerminal을 통해 감지해야 함
        // 이는 TerminalManager에서 처리됨
    }

    /**
     * 명령어 ID를 생성합니다
     */
    private generateCommandId(): string {
        return `cmd_${this.session.id}_${Date.now()}_${++this.commandIdCounter}`;
    }

    /**
     * 히스토리를 초기화합니다
     */
    public clearHistory(): void {
        this.session.history = [];
        console.log(`[TerminalSession] History cleared: ${this.session.id}`);
    }

    /**
     * 통계를 가져옵니다
     */
    public getStats(): {
        totalCommands: number;
        successfulCommands: number;
        failedCommands: number;
        averageDuration: number;
    } {
        const commands = this.session.history.filter(cmd => cmd.exitCode !== undefined);
        const successful = commands.filter(cmd => cmd.exitCode === 0);
        const failed = commands.filter(cmd => cmd.exitCode !== 0);

        const totalDuration = commands.reduce((sum, cmd) => sum + (cmd.duration || 0), 0);
        const averageDuration = commands.length > 0 ? totalDuration / commands.length : 0;

        return {
            totalCommands: this.session.history.length,
            successfulCommands: successful.length,
            failedCommands: failed.length,
            averageDuration
        };
    }
}

