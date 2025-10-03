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
    private processRef: ChildProcessWithoutNullStreams | null = null;
    private socketPath: string = path.join(os.tmpdir(), 'terminal-daemon.sock');
    private outputChannel: vscode.OutputChannel;

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
        if (this.processRef) {
            return { success: false, message: 'terminal-daemon 이미 실행 중' };
        }
        const p = this.getDaemonPath();
        if (!fs.existsSync(p)) {
            return { success: false, message: `바이너리를 찾을 수 없음: ${p}` };
        }
        // 기존 소켓 제거
        try { fs.unlinkSync(this.socketPath); } catch { }
        this.outputChannel.appendLine(`[INFO] Starting terminal-daemon: ${p} --socket ${this.socketPath}`);
        const child = spawn(p, ['--socket', this.socketPath], { cwd: os.tmpdir() });
        this.processRef = child;

        child.stdout.on('data', (data: Buffer) => {
            const text = data.toString();
            this.outputChannel.appendLine(`[STDOUT] ${text.trimEnd()}`);
            console.log('[TerminalDaemonService] daemon stdout:', text);
        });

        child.stderr.on('data', (data: Buffer) => {
            const text = data.toString();
            this.outputChannel.appendLine(`[STDERR] ${text.trimEnd()}`);
            console.error('[TerminalDaemonService] daemon stderr:', text);
            this.outputChannel.show(true);
        });

        child.on('close', (code: number) => {
            this.outputChannel.appendLine(`[INFO] terminal-daemon exited with code ${code}`);
            this.processRef = null;
        });

        child.on('error', (err: Error) => {
            this.outputChannel.appendLine(`[ERROR] Failed to start terminal-daemon: ${err.message}`);
            console.error('[TerminalDaemonService] daemon error:', err);
            this.outputChannel.show(true);
        });

        return { success: true, message: 'terminal-daemon 시작됨' };
    }

    public async stop(): Promise<{ success: boolean; message: string }> {
        if (!this.processRef) {
            return { success: false, message: 'terminal-daemon 실행 중이 아님' };
        }
        this.processRef.kill();
        this.processRef = null;
        try { fs.unlinkSync(this.socketPath); } catch { }
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
}


