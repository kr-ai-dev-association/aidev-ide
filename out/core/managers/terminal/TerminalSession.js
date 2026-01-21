"use strict";
/**
 * Terminal Session
 * 개별 터미널 세션을 관리하는 클래스
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TerminalSession = void 0;
const types_1 = require("./types");
class TerminalSession {
    session;
    commandIdCounter = 0;
    constructor(id, terminal, options) {
        this.session = {
            id,
            name: terminal.name,
            terminal,
            status: types_1.TerminalStatus.CREATING,
            createdAt: Date.now(),
            lastUsedAt: Date.now(),
            history: [],
            cwd: options?.cwd,
            metadata: options?.metadata
        };
        this.registerEventHandlers();
        // 초기화 완료
        setTimeout(() => {
            this.updateStatus(types_1.TerminalStatus.READY);
        }, 100);
    }
    /**
     * 세션 ID를 가져옵니다
     */
    getId() {
        return this.session.id;
    }
    /**
     * 세션 정보를 가져옵니다
     */
    getSession() {
        return { ...this.session };
    }
    /**
     * VS Code 터미널을 가져옵니다
     */
    getTerminal() {
        return this.session.terminal;
    }
    /**
     * 상태를 가져옵니다
     */
    getStatus() {
        return this.session.status;
    }
    /**
     * 명령어를 전송합니다
     */
    sendCommand(command, cwd) {
        console.log(`[TerminalSession] Sending command: ${command}`);
        this.updateStatus(types_1.TerminalStatus.BUSY);
        this.session.lastUsedAt = Date.now();
        // 명령어 히스토리에 추가
        const commandId = this.generateCommandId();
        const commandEntry = {
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
    sendText(text) {
        this.session.terminal.sendText(text);
        this.session.lastUsedAt = Date.now();
    }
    /**
     * 터미널을 표시합니다
     */
    show(preserveFocus) {
        this.session.terminal.show(preserveFocus);
    }
    /**
     * 터미널을 숨깁니다
     */
    hide() {
        this.session.terminal.hide();
    }
    /**
     * 터미널을 닫습니다
     */
    dispose() {
        console.log(`[TerminalSession] Disposing session: ${this.session.id}`);
        this.updateStatus(types_1.TerminalStatus.CLOSED);
        this.session.terminal.dispose();
    }
    /**
     * 히스토리를 가져옵니다
     */
    getHistory() {
        return [...this.session.history];
    }
    /**
     * 마지막 N개의 명령어를 가져옵니다
     */
    getRecentCommands(count = 10) {
        return this.session.history.slice(-count);
    }
    /**
     * 특정 명령어를 찾습니다
     */
    findCommand(commandId) {
        return this.session.history.find(cmd => cmd.id === commandId);
    }
    /**
     * 명령어 결과를 업데이트합니다
     */
    updateCommandResult(commandId, exitCode, duration, output) {
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
    getCwd() {
        return this.session.cwd;
    }
    /**
     * 현재 작업 디렉토리를 설정합니다
     */
    setCwd(cwd) {
        this.session.cwd = cwd;
    }
    /**
     * 메타데이터를 가져옵니다
     */
    getMetadata() {
        return this.session.metadata;
    }
    /**
     * 메타데이터를 설정합니다
     */
    setMetadata(metadata) {
        this.session.metadata = metadata;
    }
    /**
     * 마지막 사용 시간을 업데이트합니다
     */
    updateLastUsed() {
        this.session.lastUsedAt = Date.now();
    }
    /**
     * 터미널이 활성 상태인지 확인합니다
     */
    isActive() {
        return this.session.status === types_1.TerminalStatus.READY ||
            this.session.status === types_1.TerminalStatus.BUSY;
    }
    /**
     * 터미널이 사용 가능한지 확인합니다
     */
    isAvailable() {
        return this.session.status === types_1.TerminalStatus.READY;
    }
    /**
     * 상태를 업데이트합니다
     */
    updateStatus(status) {
        const oldStatus = this.session.status;
        this.session.status = status;
        if (oldStatus !== status) {
            console.log(`[TerminalSession] Status changed: ${this.session.id} ${oldStatus} -> ${status}`);
        }
        // BUSY 상태가 아니면 READY로 전환 (에러 상태 제외)
        if (status === types_1.TerminalStatus.BUSY) {
            setTimeout(() => {
                if (this.session.status === types_1.TerminalStatus.BUSY) {
                    this.updateStatus(types_1.TerminalStatus.READY);
                }
            }, 2000); // 2초 후 자동으로 READY로 전환
        }
    }
    /**
     * 이벤트 핸들러를 등록합니다
     */
    registerEventHandlers() {
        // VS Code 터미널은 직접적인 close 이벤트를 제공하지 않음
        // 대신 window.onDidCloseTerminal을 통해 감지해야 함
        // 이는 TerminalManager에서 처리됨
    }
    /**
     * 명령어 ID를 생성합니다
     */
    generateCommandId() {
        return `cmd_${this.session.id}_${Date.now()}_${++this.commandIdCounter}`;
    }
    /**
     * 히스토리를 초기화합니다
     */
    clearHistory() {
        this.session.history = [];
        console.log(`[TerminalSession] History cleared: ${this.session.id}`);
    }
    /**
     * 통계를 가져옵니다
     */
    getStats() {
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
exports.TerminalSession = TerminalSession;
//# sourceMappingURL=TerminalSession.js.map