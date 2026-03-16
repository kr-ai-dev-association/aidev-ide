/**
 * Process Manager
 * 프로세스 생명주기를 관리하는 클래스
 */

import { ChildProcess, spawn } from 'child_process';
import * as fs from 'fs';
import {
    Process,
    ProcessStatus,
    ProcessMetadata,
    ExecutionOptions
} from './types';

// Git Bash 후보 경로 (Windows)
const GIT_BASH_CANDIDATES = [
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
    'C:\\Users\\' + (process.env.USERNAME || '') + '\\AppData\\Local\\Programs\\Git\\bin\\bash.exe',
];

// PowerShell 후보 경로 (Windows): pwsh (7+) > powershell (5.1)
const POWERSHELL_CANDIDATES = [
    'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
    process.env.SystemRoot ? `${process.env.SystemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe` : 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
];

function findExecutable(candidates: string[]): string | null {
    for (const p of candidates) {
        try {
            if (fs.existsSync(p)) {
                return p;
            }
        } catch { /* ignore */ }
    }
    return null;
}

// 프로세스 시작 시 한 번만 탐색
const GIT_BASH_PATH = process.platform === 'win32' ? findExecutable(GIT_BASH_CANDIDATES) : null;
const POWERSHELL_PATH = process.platform === 'win32' ? findExecutable(POWERSHELL_CANDIDATES) : null;

/** Windows 쉘 선택 결과 */
type WindowsShellType = 'gitbash' | 'powershell' | 'cmd';
const WINDOWS_SHELL_TYPE: WindowsShellType | null = process.platform === 'win32'
    ? (GIT_BASH_PATH ? 'gitbash' : POWERSHELL_PATH ? 'powershell' : 'cmd')
    : null;

if (process.platform === 'win32') {
    const shellLabel = WINDOWS_SHELL_TYPE === 'gitbash'
        ? `Git Bash (${GIT_BASH_PATH})`
        : WINDOWS_SHELL_TYPE === 'powershell'
            ? `PowerShell + ExecutionPolicy Bypass (${POWERSHELL_PATH})`
            : 'cmd.exe (fallback)';
    console.log(`[ProcessManager] Shell: ${shellLabel}`);
} else {
    console.log(`[ProcessManager] Shell: ${process.env.SHELL || '/bin/zsh'} (login mode)`);
}

export class ProcessManager {
    private processes: Map<number, Process> = new Map();
    private childProcesses: Map<number, ChildProcess> = new Map();

    constructor() {
    }

    /**
     * 프로세스를 시작합니다
     */
    public async startProcess(
        command: string,
        options: ExecutionOptions = {},
        metadata?: ProcessMetadata
    ): Promise<Process> {
        console.log('[ProcessManager] Starting process:', command);

        // 명령어와 인자 분리
        const [cmd, ...args] = this.parseCommand(command);

        // 프로세스 생성
        // Windows: Git Bash → PowerShell (-ExecutionPolicy Bypass) → cmd.exe 순으로 fallback
        // Mac/Linux: 사용자 기본 shell (login mode — .zshrc/.bashrc 로드하여 nvm 등 PATH 포함)
        let childProcess: ChildProcess;
        if (typeof options.shell === 'boolean') {
            childProcess = spawn(cmd, args, {
                cwd: options.cwd,
                env: { ...process.env, ...options.env },
                shell: options.shell,
                ...(options.encoding && { encoding: options.encoding })
            });
        } else if (process.platform === 'win32') {
            const fullCommand = [cmd, ...args].join(' ');
            if (WINDOWS_SHELL_TYPE === 'gitbash') {
                // Git Bash: shell 옵션으로 직접 사용
                childProcess = spawn(cmd, args, {
                    cwd: options.cwd,
                    env: { ...process.env, ...options.env },
                    shell: GIT_BASH_PATH!,
                    ...(options.encoding && { encoding: options.encoding })
                });
            } else if (WINDOWS_SHELL_TYPE === 'powershell') {
                // PowerShell: -ExecutionPolicy Bypass로 권한 문제 우회
                childProcess = spawn(POWERSHELL_PATH!, ['-ExecutionPolicy', 'Bypass', '-Command', fullCommand], {
                    cwd: options.cwd,
                    env: { ...process.env, ...options.env },
                    ...(options.encoding && { encoding: options.encoding })
                });
            } else {
                // cmd.exe: 최종 fallback
                childProcess = spawn(cmd, args, {
                    cwd: options.cwd,
                    env: { ...process.env, ...options.env },
                    shell: 'cmd.exe',
                    ...(options.encoding && { encoding: options.encoding })
                });
            }
        } else {
            // Mac/Linux: login shell로 실행하여 사용자 환경(nvm, fnm, volta 등) PATH 로드
            const userShell = process.env.SHELL || '/bin/zsh';
            const fullCommand = [cmd, ...args].join(' ');
            childProcess = spawn(userShell, ['-l', '-c', fullCommand], {
                cwd: options.cwd,
                env: { ...process.env, ...options.env },
                ...(options.encoding && { encoding: options.encoding })
            });
        }

        const pid = childProcess.pid!;

        // Process 객체 생성
        const processInfo: Process = {
            pid,
            command,
            cwd: options.cwd || process.cwd(),
            startTime: Date.now(),
            status: ProcessStatus.STARTING,
            metadata
        };

        // 저장
        this.processes.set(pid, processInfo);
        this.childProcesses.set(pid, childProcess);

        // 프로세스 이벤트 핸들러 등록
        this.registerProcessHandlers(pid, childProcess);

        // 시작 완료
        this.updateStatus(pid, ProcessStatus.RUNNING);

        console.log(`[ProcessManager] Process started: PID=${pid}, command="${command}"`);

        return processInfo;
    }

    /**
     * 프로세스를 중지합니다
     */
    public async stopProcess(pid: number, signal: NodeJS.Signals = 'SIGTERM'): Promise<boolean> {
        console.log(`[ProcessManager] Stopping process: PID=${pid}, signal=${signal}`);

        const childProcess = this.childProcesses.get(pid);
        const processInfo = this.processes.get(pid);

        if (!childProcess || !processInfo) {
            console.warn(`[ProcessManager] Process not found: PID=${pid}`);
            return false;
        }

        // 이미 중지 중이거나 중지된 경우
        if (processInfo.status === ProcessStatus.STOPPING ||
            processInfo.status === ProcessStatus.STOPPED ||
            processInfo.status === ProcessStatus.KILLED) {
            console.log(`[ProcessManager] Process already stopping/stopped: PID=${pid}`);
            return true;
        }

        try {
            this.updateStatus(pid, ProcessStatus.STOPPING);

            // 프로세스 종료 시도 (Windows는 SIGTERM을 즉시 종료로 처리)
            const killed = childProcess.kill(process.platform === 'win32' ? undefined : signal);

            if (!killed) {
                console.warn(`[ProcessManager] Failed to send ${signal} to PID=${pid}`);
                return false;
            }

            // Grace period 후 강제 종료
            const gracePeriod = processInfo.metadata?.type === 'dev-server' ? 5000 : 2000;

            await new Promise<void>((resolve) => {
                const timeout = setTimeout(() => {
                    if (this.isProcessRunning(pid)) {
                        console.warn(`[ProcessManager] Force killing PID=${pid} after grace period`);
                        childProcess.kill(process.platform === 'win32' ? undefined : 'SIGKILL');
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

        } catch (error) {
            console.error(`[ProcessManager] Error stopping process PID=${pid}:`, error);
            this.updateStatus(pid, ProcessStatus.FAILED);
            return false;
        }
    }

    /**
     * 프로세스 정보를 가져옵니다
     */
    public getProcess(pid: number): Process | undefined {
        return this.processes.get(pid);
    }

    /**
     * 모든 프로세스를 가져옵니다
     */
    public getAllProcesses(): Process[] {
        return Array.from(this.processes.values());
    }

    /**
     * 실행 중인 프로세스를 가져옵니다
     */
    public getRunningProcesses(): Process[] {
        return this.getAllProcesses().filter(p =>
            p.status === ProcessStatus.RUNNING || p.status === ProcessStatus.STARTING
        );
    }

    /**
     * 프로세스가 실행 중인지 확인합니다
     */
    public isProcessRunning(pid: number): boolean {
        const processInfo = this.processes.get(pid);
        if (!processInfo) {
            return false;
        }

        return processInfo.status === ProcessStatus.RUNNING ||
            processInfo.status === ProcessStatus.STARTING;
    }

    /**
     * ChildProcess를 가져옵니다 (스트림 접근용)
     */
    public getChildProcess(pid: number): ChildProcess | undefined {
        return this.childProcesses.get(pid);
    }


    /**
     * 상태를 업데이트합니다
     */
    private updateStatus(pid: number, status: ProcessStatus): void {
        const processInfo = this.processes.get(pid);
        if (processInfo) {
            processInfo.status = status;
            console.log(`[ProcessManager] Process ${pid} status: ${status}`);
        }
    }

    /**
     * 프로세스 이벤트 핸들러를 등록합니다
     */
    private registerProcessHandlers(pid: number, childProcess: ChildProcess): void {
        childProcess.on('error', (error) => {
            console.error(`[ProcessManager] Process ${pid} error:`, error);
            this.updateStatus(pid, ProcessStatus.FAILED);
        });

        childProcess.on('exit', (code, signal) => {
            console.log(`[ProcessManager] Process ${pid} exited: code=${code}, signal=${signal}`);

            if (signal === 'SIGKILL' || signal === 'SIGTERM') {
                this.updateStatus(pid, ProcessStatus.KILLED);
            } else if (code === 0) {
                this.updateStatus(pid, ProcessStatus.STOPPED);
            } else {
                this.updateStatus(pid, ProcessStatus.FAILED);
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
    private parseCommand(command: string): string[] {
        // 간단한 파싱 (쉘이 처리하므로 복잡한 파싱 불필요)
        const trimmed = command.trim();

        // shell: true 옵션과 함께 사용하므로 명령어를 그대로 반환
        // (Node.js spawn이 shell: true일 때 자동으로 cmd.exe /c 또는 /bin/sh -c로 래핑)
        return [trimmed];
    }


    /**
     * 모든 프로세스를 정리합니다
     */
    public async cleanup(): Promise<void> {
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
    public getStats(): {
        total: number;
        running: number;
        stopped: number;
        failed: number;
    } {
        const all = this.getAllProcesses();

        return {
            total: all.length,
            running: all.filter(p => p.status === ProcessStatus.RUNNING).length,
            stopped: all.filter(p => p.status === ProcessStatus.STOPPED).length,
            failed: all.filter(p => p.status === ProcessStatus.FAILED).length
        };
    }
}

