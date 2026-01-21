"use strict";
/**
 * Process Manager
 * 프로세스 생명주기를 관리하는 클래스
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProcessManager = void 0;
const child_process_1 = require("child_process");
const types_1 = require("./types");
class ProcessManager {
    processes = new Map();
    childProcesses = new Map();
    constructor() {
    }
    /**
     * 프로세스를 시작합니다
     */
    async startProcess(command, options = {}, metadata) {
        console.log('[ProcessManager] Starting process:', command);
        // 명령어와 인자 분리
        const [cmd, ...args] = this.parseCommand(command);
        // 프로세스 생성
        const childProcess = (0, child_process_1.spawn)(cmd, args, {
            cwd: options.cwd,
            env: { ...process.env, ...options.env },
            shell: typeof options.shell === 'boolean' ? options.shell : true,
            ...(options.encoding && { encoding: options.encoding })
        });
        const pid = childProcess.pid;
        // Process 객체 생성
        const processInfo = {
            pid,
            command,
            cwd: options.cwd || process.cwd(),
            startTime: Date.now(),
            status: types_1.ProcessStatus.STARTING,
            metadata
        };
        // 저장
        this.processes.set(pid, processInfo);
        this.childProcesses.set(pid, childProcess);
        // 프로세스 이벤트 핸들러 등록
        this.registerProcessHandlers(pid, childProcess);
        // 시작 완료
        this.updateStatus(pid, types_1.ProcessStatus.RUNNING);
        console.log(`[ProcessManager] Process started: PID=${pid}, command="${command}"`);
        return processInfo;
    }
    /**
     * 프로세스를 중지합니다
     */
    async stopProcess(pid, signal = 'SIGTERM') {
        console.log(`[ProcessManager] Stopping process: PID=${pid}, signal=${signal}`);
        const childProcess = this.childProcesses.get(pid);
        const processInfo = this.processes.get(pid);
        if (!childProcess || !processInfo) {
            console.warn(`[ProcessManager] Process not found: PID=${pid}`);
            return false;
        }
        // 이미 중지 중이거나 중지된 경우
        if (processInfo.status === types_1.ProcessStatus.STOPPING ||
            processInfo.status === types_1.ProcessStatus.STOPPED ||
            processInfo.status === types_1.ProcessStatus.KILLED) {
            console.log(`[ProcessManager] Process already stopping/stopped: PID=${pid}`);
            return true;
        }
        try {
            this.updateStatus(pid, types_1.ProcessStatus.STOPPING);
            // SIGTERM으로 먼저 시도
            const killed = childProcess.kill(signal);
            if (!killed) {
                console.warn(`[ProcessManager] Failed to send ${signal} to PID=${pid}`);
                return false;
            }
            // Grace period 후 강제 종료
            const gracePeriod = processInfo.metadata?.type === 'dev-server' ? 5000 : 2000;
            await new Promise((resolve) => {
                const timeout = setTimeout(() => {
                    if (this.isProcessRunning(pid)) {
                        console.warn(`[ProcessManager] Force killing PID=${pid} after grace period`);
                        childProcess.kill('SIGKILL');
                    }
                    resolve();
                }, gracePeriod);
                childProcess.once('exit', () => {
                    clearTimeout(timeout);
                    resolve();
                });
            });
            console.log(`[ProcessManager] Process stopped: PID=${pid}`);
            return true;
        }
        catch (error) {
            console.error(`[ProcessManager] Error stopping process PID=${pid}:`, error);
            this.updateStatus(pid, types_1.ProcessStatus.FAILED);
            return false;
        }
    }
    /**
     * 프로세스 정보를 가져옵니다
     */
    getProcess(pid) {
        return this.processes.get(pid);
    }
    /**
     * 모든 프로세스를 가져옵니다
     */
    getAllProcesses() {
        return Array.from(this.processes.values());
    }
    /**
     * 실행 중인 프로세스를 가져옵니다
     */
    getRunningProcesses() {
        return this.getAllProcesses().filter(p => p.status === types_1.ProcessStatus.RUNNING || p.status === types_1.ProcessStatus.STARTING);
    }
    /**
     * 프로세스가 실행 중인지 확인합니다
     */
    isProcessRunning(pid) {
        const processInfo = this.processes.get(pid);
        if (!processInfo) {
            return false;
        }
        return processInfo.status === types_1.ProcessStatus.RUNNING ||
            processInfo.status === types_1.ProcessStatus.STARTING;
    }
    /**
     * ChildProcess를 가져옵니다 (스트림 접근용)
     */
    getChildProcess(pid) {
        return this.childProcesses.get(pid);
    }
    /**
     * 상태를 업데이트합니다
     */
    updateStatus(pid, status) {
        const processInfo = this.processes.get(pid);
        if (processInfo) {
            processInfo.status = status;
            console.log(`[ProcessManager] Process ${pid} status: ${status}`);
        }
    }
    /**
     * 프로세스 이벤트 핸들러를 등록합니다
     */
    registerProcessHandlers(pid, childProcess) {
        childProcess.on('error', (error) => {
            console.error(`[ProcessManager] Process ${pid} error:`, error);
            this.updateStatus(pid, types_1.ProcessStatus.FAILED);
        });
        childProcess.on('exit', (code, signal) => {
            console.log(`[ProcessManager] Process ${pid} exited: code=${code}, signal=${signal}`);
            if (signal === 'SIGKILL' || signal === 'SIGTERM') {
                this.updateStatus(pid, types_1.ProcessStatus.KILLED);
            }
            else if (code === 0) {
                this.updateStatus(pid, types_1.ProcessStatus.STOPPED);
            }
            else {
                this.updateStatus(pid, types_1.ProcessStatus.FAILED);
            }
            // 정리
            this.childProcesses.delete(pid);
        });
        childProcess.on('close', (code, signal) => {
            console.log(`[ProcessManager] Process ${pid} closed: code=${code}, signal=${signal}`);
        });
    }
    /**
     * 명령어를 파싱합니다
     */
    parseCommand(command) {
        // 간단한 파싱 (쉘이 처리하므로 복잡한 파싱 불필요)
        const trimmed = command.trim();
        // 쉘 명령어인 경우 그대로 반환
        if (process.platform === 'win32') {
            return ['cmd', '/c', trimmed];
        }
        else {
            return [trimmed]; // shell: true이므로 쉘이 파싱
        }
    }
    /**
     * 모든 프로세스를 정리합니다
     */
    async cleanup() {
        console.log('[ProcessManager] Cleaning up all processes');
        const runningProcesses = this.getRunningProcesses();
        const stopPromises = runningProcesses.map(p => this.stopProcess(p.pid));
        await Promise.all(stopPromises);
        this.processes.clear();
        this.childProcesses.clear();
        console.log('[ProcessManager] Cleanup complete');
    }
    /**
     * 프로세스 통계를 가져옵니다
     */
    getStats() {
        const all = this.getAllProcesses();
        return {
            total: all.length,
            running: all.filter(p => p.status === types_1.ProcessStatus.RUNNING).length,
            stopped: all.filter(p => p.status === types_1.ProcessStatus.STOPPED).length,
            failed: all.filter(p => p.status === types_1.ProcessStatus.FAILED).length
        };
    }
}
exports.ProcessManager = ProcessManager;
//# sourceMappingURL=ProcessManager.js.map