import * as fs from 'fs';
import * as path from 'path';

class DebugLoggerImpl {
    private enabled: boolean = false;
    private workspaceRoot: string | undefined;
    private logFilePath: string | undefined;

    public setContext(enabled: boolean, workspaceRoot?: string): void {
        this.enabled = !!enabled;
        this.workspaceRoot = workspaceRoot;
    }

    public startIfEnabled(): void {
        if (!this.enabled || !this.workspaceRoot) return;
        try {
            const dir = path.join(this.workspaceRoot, 'debug_log');
            fs.mkdirSync(dir, { recursive: true });
            this.logFilePath = path.join(dir, 'log.txt');
            // overwrite when turning on debug mode
            const header = `[${new Date().toISOString()}] Debug session started\n`;
            fs.writeFileSync(this.logFilePath, header, 'utf8');
        } catch {
            // ignore file system errors in debug logger
        }
    }

    public log(message: string): void {
        if (!this.enabled || !this.logFilePath) return;
        try {
            const line = `[${new Date().toISOString()}] ${message}\n`;
            fs.appendFileSync(this.logFilePath, line, 'utf8');
        } catch {
            // ignore
        }
    }
}

export const DebugLogger = new DebugLoggerImpl();
export const debugLog = (msg: string) => DebugLogger.log(msg);


