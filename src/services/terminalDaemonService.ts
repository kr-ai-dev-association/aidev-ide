import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { exec, spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class TerminalDaemonService {
    private static instance: TerminalDaemonService;
    private extensionContext: vscode.ExtensionContext;
    private processRef: any = null;
    private socketPath: string = path.join(os.tmpdir(), 'terminal-daemon.sock');
    private outputChannel: vscode.OutputChannel;
    private healthCheckInterval: NodeJS.Timeout | null = null;
    private startTimeout: NodeJS.Timeout | null = null;
    private isStarting: boolean = false;

    private constructor(context: vscode.ExtensionContext) {
        this.extensionContext = context;
        this.outputChannel = vscode.window.createOutputChannel('AIDEV-IDE Terminal Daemon');
    }

    public static getInstance(context: vscode.ExtensionContext): TerminalDaemonService {
        if (!TerminalDaemonService.instance) {
            TerminalDaemonService.instance = new TerminalDaemonService(context);
        }
        return TerminalDaemonService.instance;
    }

    public getSocketPath(): string {
        return this.socketPath;
    }

    private getDaemonPath(): string {
        const debugPath = path.join(this.extensionContext.extensionPath, '..', 'terminal-daemon', 'bin', 'terminal-daemon');
        const releasePath = path.join(this.extensionContext.extensionPath, 'assets', 'terminal-daemon', 'terminal-daemon');
        if (fs.existsSync(debugPath)) { return debugPath; }
        return releasePath;
    }

    public async isInstalled(): Promise<boolean> {
        try {
            const p = this.getDaemonPath();
            return fs.existsSync(p);
        } catch {
            return false;
        }
    }

    public async install(): Promise<{ success: boolean; message: string }> {
        const p = this.getDaemonPath();
        if (!fs.existsSync(p)) {
            return { success: false, message: 'terminal-daemon 바이너리를 찾을 수 없습니다.' };
        }
        await execAsync(`chmod +x "${p}"`);
        return { success: true, message: 'terminal-daemon 설치 완료' };
    }

    public async start(): Promise<{ success: boolean; message: string }> {
        // 터미널 데몬을 사용하지 않고 VS Code 터미널 API를 직접 사용
        return { success: true, message: 'VS Code 터미널 API를 직접 사용합니다 (터미널 데몬 비활성화됨)' };
    }


    private cleanup(): void {
        this.isStarting = false;

        if (this.startTimeout) {
            clearTimeout(this.startTimeout);
            this.startTimeout = null;
        }

        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }

        if (this.processRef) {
            try {
                this.processRef.kill('SIGTERM');
            } catch (error) {
                console.warn('[TerminalDaemonService] Failed to kill process:', error);
            }
            this.processRef = null;
        }

        // 소켓 파일 정리
        try {
            if (fs.existsSync(this.socketPath)) {
                fs.unlinkSync(this.socketPath);
            }
        } catch (error) {
            console.warn('[TerminalDaemonService] Failed to remove socket:', error);
        }
    }

    private startHealthCheck(): void {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }

        this.healthCheckInterval = setInterval(() => {
            if (!this.processRef || this.processRef.killed) {
                this.outputChannel.appendLine(`[WARN] terminal-daemon process not running, attempting restart`);
                console.warn('[TerminalDaemonService] Process not running, attempting restart');
                this.cleanup();
                this.start().catch(error => {
                    console.error('[TerminalDaemonService] Auto-restart failed:', error);
                });
                return;
            }

            // 소켓 파일 존재 확인
            if (!fs.existsSync(this.socketPath)) {
                this.outputChannel.appendLine(`[WARN] terminal-daemon socket missing, attempting restart`);
                console.warn('[TerminalDaemonService] Socket missing, attempting restart');
                this.cleanup();
                this.start().catch(error => {
                    console.error('[TerminalDaemonService] Auto-restart failed:', error);
                });
            }
        }, 30000); // 30초마다 체크
    }

    public async stop(): Promise<{ success: boolean; message: string }> {
        if (!this.processRef && !this.isStarting) {
            return { success: false, message: 'terminal-daemon 실행 중이 아님' };
        }
        this.cleanup();
        this.outputChannel.appendLine('[INFO] terminal-daemon stopped');
        return { success: true, message: 'terminal-daemon 중지됨' };
    }

    public async getStatus(): Promise<{ running: boolean; message: string; socket: string }> {
        const running = !!this.processRef;
        const exists = fs.existsSync(this.socketPath);
        return { running, message: exists ? 'socket ready' : 'socket not found', socket: this.socketPath };
    }

    public showLogs(): void {
        this.outputChannel.show(true);
    }

    /**
     * Terminal Daemon 서비스 연결을 테스트합니다.
     */
    async testConnection(): Promise<{ success: boolean; data?: any; error?: string }> {
        try {
            const daemonPath = this.getDaemonPath();

            if (!fs.existsSync(daemonPath)) {
                return { success: false, error: 'Terminal daemon binary not found' };
            }

            // 소켓 파일 존재 확인
            if (fs.existsSync(this.socketPath)) {
                return { success: true, data: { status: 'running' } };
            } else {
                return { success: false, error: 'Terminal daemon not running' };
            }
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }
}


