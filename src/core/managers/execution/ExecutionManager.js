/**
 * Execution Manager
 * 액션을 실제 실행으로 변환하는 메인 매니저
 */
import { ProcessManager } from './ProcessManager';
import { StreamManager } from './StreamManager';
import { ErrorDetector } from './ErrorDetector';
import { OSAdapterFactory } from './os/OSAdapterFactory';
import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
export class ExecutionManager {
    static instance;
    processManager;
    streamManager;
    errorDetector;
    osAdapter;
    stats = {
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        averageDuration: 0,
        lastExecutionTime: 0
    };
    // continue() 패턴을 위한 pending promises
    pendingCompletions = new Map();
    constructor() {
        this.processManager = new ProcessManager();
        this.streamManager = new StreamManager();
        this.errorDetector = new ErrorDetector();
        this.osAdapter = OSAdapterFactory.getInstance();
    }
    static getInstance() {
        if (!ExecutionManager.instance) {
            ExecutionManager.instance = new ExecutionManager();
        }
        return ExecutionManager.instance;
    }
    /**
     * OS 어댑터를 가져옵니다
     */
    getOSAdapter() {
        return this.osAdapter;
    }
    /**
     * 명령어를 OS에 맞게 정규화합니다
     */
    normalizeCommand(command) {
        return this.osAdapter.normalizeCommand(command);
    }
    /**
     * 명령어를 실행합니다 (동기식 - 완료 대기)
     */
    async executeCommand(command, options = {}) {
        // OS에 맞게 명령어 정규화
        const normalizedCommand = this.normalizeCommand(command);
        console.log('[ExecutionManager] Executing command:', normalizedCommand);
        const startTime = Date.now();
        this.stats.totalExecutions++;
        try {
            // 프로세스 시작
            const process = await this.processManager.startProcess(normalizedCommand, options);
            const pid = process.pid;
            // 스트림 캡처
            const childProcess = this.processManager.getChildProcess(pid);
            if (!childProcess) {
                throw new Error('Failed to get child process');
            }
            this.streamManager.captureStream(pid, childProcess);
            // 완료 대기
            const result = await this.waitForCompletion(pid, options.timeout, options.killOnTimeout);
            // 통계 업데이트
            const duration = Date.now() - startTime;
            this.updateStats(result.success, duration);
            console.log(`[ExecutionManager] Command completed: ${command} (${duration}ms)`);
            return result;
        }
        catch (error) {
            const duration = Date.now() - startTime;
            this.updateStats(false, duration);
            console.error('[ExecutionManager] Command execution failed:', error);
            return {
                success: false,
                exitCode: -1,
                stdout: '',
                stderr: error instanceof Error ? error.message : String(error),
                duration,
                error: {
                    code: 'EXECUTION_FAILED',
                    message: error instanceof Error ? error.message : String(error),
                    killed: false
                }
            };
        }
    }
    /**
     * 장기 실행 프로세스를 시작합니다 (비동기식 - 즉시 반환)
     */
    async startProcess(command, options = {}) {
        // OS에 맞게 명령어 정규화
        const normalizedCommand = this.normalizeCommand(command);
        console.log('[ExecutionManager] Starting long-running process:', normalizedCommand);
        try {
            const process = await this.processManager.startProcess(normalizedCommand, options, {
                type: 'dev-server'
            });
            // 스트림 캡처
            const childProcess = this.processManager.getChildProcess(process.pid);
            if (childProcess) {
                this.streamManager.captureStream(process.pid, childProcess);
            }
            console.log(`[ExecutionManager] Process started: PID=${process.pid}`);
            return process;
        }
        catch (error) {
            console.error('[ExecutionManager] Failed to start process:', error);
            throw error;
        }
    }
    /**
     * 프로세스를 중지합니다
     */
    async stopProcess(pid) {
        console.log(`[ExecutionManager] Stopping process: PID=${pid}`);
        await this.processManager.stopProcess(pid);
        this.streamManager.unregisterAllHandlers(pid);
        // pending completion 정리
        this.pendingCompletions.delete(pid);
        console.log(`[ExecutionManager] Process stopped: PID=${pid}`);
    }
    /**
     * 프로세스를 백그라운드에서 계속 실행하도록 합니다
     * Promise를 즉시 resolve하여 실행 흐름이 계속되도록 합니다
     */
    continueProcess(pid) {
        console.log(`[ExecutionManager] Continuing process in background: PID=${pid}`);
        const pending = this.pendingCompletions.get(pid);
        if (pending) {
            const buffer = this.streamManager.getBuffer(pid);
            const process = this.processManager.getProcess(pid);
            const duration = process ? Date.now() - process.startTime : 0;
            // 즉시 성공으로 반환 (프로세스는 백그라운드에서 계속 실행)
            pending.resolve({
                success: true,
                exitCode: undefined, // 백그라운드 실행 중이므로 exitCode 없음
                stdout: buffer?.stdout || '',
                stderr: buffer?.stderr || '',
                duration,
                pid
            });
            this.pendingCompletions.delete(pid);
        }
    }
    /**
     * 프로세스를 모니터링합니다
     */
    monitorProcess(pid) {
        const process = this.processManager.getProcess(pid);
        if (!process) {
            throw new Error(`Process not found: PID=${pid}`);
        }
        const monitor = {
            process,
            onOutput: (callback) => {
                this.streamManager.registerHandler(pid, (streamData) => {
                    if (streamData.type === 'stdout') {
                        callback(streamData.data);
                    }
                });
            },
            onError: (callback) => {
                this.streamManager.registerHandler(pid, (streamData) => {
                    if (streamData.type === 'stderr') {
                        callback(streamData.data);
                    }
                });
            },
            onExit: (callback) => {
                const childProcess = this.processManager.getChildProcess(pid);
                if (childProcess) {
                    childProcess.on('exit', (code, signal) => {
                        callback(code || 0, signal || undefined);
                    });
                }
            },
            stop: async () => {
                await this.stopProcess(pid);
            }
        };
        return monitor;
    }
    /**
     * 출력에서 에러를 감지합니다
     */
    detectError(output) {
        return this.errorDetector.detectError(output, 'terminal');
    }
    /**
     * 포트 충돌을 감지합니다
     */
    detectPortConflict(output) {
        return this.errorDetector.detectPortConflict(output);
    }
    /**
     * 명령어가 장기 실행 명령어인지 확인합니다
     * @param pid 프로세스 ID (출력 기반 분석용)
     */
    isLongRunningCommand(pid) {
        if (pid === undefined) {
            return false;
        }
        // 출력 기반 분석 
        return this.streamManager.isLongRunningOutput(pid);
    }
    /**
     * 실행 중인 프로세스 목록을 가져옵니다
     */
    getRunningProcesses() {
        return this.processManager.getRunningProcesses();
    }
    /**
     * 프로세스 정보를 가져옵니다
     */
    getProcess(pid) {
        return this.processManager.getProcess(pid);
    }
    /**
     * 프로세스의 출력을 가져옵니다
     */
    getProcessOutput(pid) {
        return this.streamManager.getBuffer(pid);
    }
    /**
     * 최근 출력 라인을 가져옵니다
     */
    getRecentLines(pid, lineCount = 50) {
        return this.streamManager.getRecentLines(pid, 'combined', lineCount);
    }
    /**
     * 통계를 가져옵니다
     */
    getStats() {
        return { ...this.stats };
    }
    /**
     * 프로세스 관리자를 가져옵니다
     */
    getProcessManager() {
        return this.processManager;
    }
    /**
     * 스트림 관리자를 가져옵니다
     */
    getStreamManager() {
        return this.streamManager;
    }
    /**
     * 에러 감지기를 가져옵니다
     */
    getErrorDetector() {
        return this.errorDetector;
    }
    /**
     * 프로세스 완료를 대기합니다
     */
    async waitForCompletion(pid, timeout, killOnTimeout = true) {
        const childProcess = this.processManager.getChildProcess(pid);
        if (!childProcess) {
            throw new Error('Child process not found');
        }
        const startTime = Date.now();
        return new Promise((resolve, reject) => {
            let timeoutHandle;
            let resolved = false;
            // pending completion 저장 (continue()를 위해)
            this.pendingCompletions.set(pid, { resolve, reject });
            const cleanup = () => {
                if (timeoutHandle) {
                    clearTimeout(timeoutHandle);
                }
                this.pendingCompletions.delete(pid);
            };
            const doResolve = (result) => {
                if (!resolved) {
                    resolved = true;
                    cleanup();
                    resolve(result);
                }
            };
            const doReject = (error) => {
                if (!resolved) {
                    resolved = true;
                    cleanup();
                    reject(error);
                }
            };
            // 타임아웃 설정
            if (timeout && timeout > 0) {
                timeoutHandle = setTimeout(() => {
                    console.warn(`[ExecutionManager] Timeout after ${timeout}ms for PID=${pid}`);
                    if (killOnTimeout) {
                        childProcess.kill('SIGTERM');
                    }
                    doResolve({
                        success: !killOnTimeout, // 죽이지 않는 경우 일단 성공(진행중)으로 간주
                        exitCode: killOnTimeout ? -1 : undefined,
                        stdout: '',
                        stderr: killOnTimeout ? 'Command timeout' : '',
                        duration: Date.now() - startTime,
                        pid,
                        error: killOnTimeout ? {
                            code: 'TIMEOUT',
                            message: `Command timed out after ${timeout}ms`,
                            killed: true,
                            signal: 'SIGTERM'
                        } : {
                            code: 'TIMEOUT_CONTINUE',
                            message: `Command timed out after ${timeout}ms, continuing in background`,
                            killed: false
                        }
                    });
                }, timeout);
            }
            // 프로세스 종료 대기
            childProcess.on('exit', (code, signal) => {
                const buffer = this.streamManager.getBuffer(pid);
                const duration = Date.now() - startTime;
                doResolve({
                    success: code === 0,
                    exitCode: code || 0,
                    stdout: buffer?.stdout || '',
                    stderr: buffer?.stderr || '',
                    duration,
                    pid,
                    error: code !== 0 ? {
                        code: 'NON_ZERO_EXIT',
                        message: `Process exited with code ${code}`,
                        killed: signal !== null,
                        signal: signal || undefined
                    } : undefined
                });
            });
            childProcess.on('error', (error) => {
                doReject(error);
            });
        });
    }
    /**
     * 통계를 업데이트합니다
     */
    updateStats(success, duration) {
        if (success) {
            this.stats.successfulExecutions++;
        }
        else {
            this.stats.failedExecutions++;
        }
        // 평균 duration 계산
        const totalDuration = this.stats.averageDuration * (this.stats.totalExecutions - 1) + duration;
        this.stats.averageDuration = totalDuration / this.stats.totalExecutions;
        this.stats.lastExecutionTime = Date.now();
    }
    /**
     * 모든 프로세스를 정리합니다
     */
    async cleanup() {
        console.log('[ExecutionManager] Cleaning up all resources');
        await this.processManager.cleanup();
        this.streamManager.cleanupAll();
        console.log('[ExecutionManager] Cleanup complete');
    }
    // ===== processRunner.runCommandCapture 호환 메서드 =====
    /**
     * 명령어를 실행하고 출력을 캡처합니다 (processRunner.runCommandCapture 호환)
     * @param command 실행할 명령어
     * @param options 실행 옵션
     * @param onData stdout 데이터 콜백
     * @param onErrorData stderr 데이터 콜백
     * @returns 실행 결과
     */
    async runCommandCapture(command, options = {}, onData, onErrorData) {
        const executionOptions = {
            cwd: this.ensureValidCwd(options.cwd),
            env: options.env,
            shell: options.shell,
            timeout: options.timeoutMs,
            killOnTimeout: options.killOnTimeout
        };
        // 스트림 핸들러 등록
        let stdout = '';
        let stderr = '';
        try {
            // 프로세스 시작
            const process = await this.processManager.startProcess(command, executionOptions);
            const pid = process.pid;
            // 스트림 캡처
            const childProcess = this.processManager.getChildProcess(pid);
            if (!childProcess) {
                throw new Error('Failed to get child process');
            }
            // 스트림 핸들러 등록
            this.streamManager.registerHandler(pid, (streamData) => {
                if (streamData.type === 'stdout') {
                    stdout += streamData.data;
                    onData?.(streamData.data);
                }
                else if (streamData.type === 'stderr') {
                    stderr += streamData.data;
                    onErrorData?.(streamData.data);
                }
            });
            this.streamManager.captureStream(pid, childProcess);
            // 완료 대기
            const result = await this.waitForCompletion(pid, options.timeoutMs, options.killOnTimeout);
            return {
                code: result.exitCode ?? null,
                stdout: result.stdout || stdout,
                stderr: result.stderr || stderr
            };
        }
        catch (error) {
            console.error('[ExecutionManager] runCommandCapture failed:', error);
            return {
                code: -1,
                stdout,
                stderr: stderr || (error instanceof Error ? error.message : String(error))
            };
        }
    }
    /**
     * 존재하지 않는 cwd가 전달되면 워크스페이스 루트나 현재 작업 디렉터리로 폴백합니다.
     */
    ensureValidCwd(cwd) {
        let normalized = cwd;
        // ~ 확장
        if (normalized && normalized.startsWith('~')) {
            const home = os.homedir();
            normalized = path.join(home, normalized.slice(1));
        }
        if (normalized && fs.existsSync(normalized)) {
            return normalized;
        }
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (workspaceRoot && fs.existsSync(workspaceRoot)) {
            console.warn(`[ExecutionManager] Invalid cwd "${cwd}", falling back to workspace root: ${workspaceRoot}`);
            return workspaceRoot;
        }
        console.warn(`[ExecutionManager] Invalid cwd "${cwd}", falling back to process.cwd(): ${process.cwd()}`);
        return process.cwd();
    }
}
//# sourceMappingURL=ExecutionManager.js.map