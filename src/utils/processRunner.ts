import { spawn } from 'child_process';
import * as os from 'os';

export interface RunCommandOptions {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    shell?: boolean;
    timeoutMs?: number;
}

export interface RunCommandResult {
    code: number | null;
    stdout: string;
    stderr: string;
}

export function runCommandCapture(command: string, options: RunCommandOptions = {}, onData?: (chunk: string) => void, onErrorData?: (chunk: string) => void): Promise<RunCommandResult> {
    const shell = options.shell ?? true;
    const child = spawn(command, { cwd: options.cwd, env: options.env, shell });

    let stdout = '';
    let stderr = '';

    const decoder = new TextDecoder();

    child.stdout?.on('data', (data: Buffer) => {
        const text = data.toString('utf8');
        stdout += text;
        onData?.(text);
    });

    child.stderr?.on('data', (data: Buffer) => {
        const text = data.toString('utf8');
        stderr += text;
        onErrorData?.(text);
    });

    let timeout: NodeJS.Timeout | undefined;
    if (options.timeoutMs && options.timeoutMs > 0) {
        timeout = setTimeout(() => {
            try { child.kill('SIGKILL'); } catch {}
        }, options.timeoutMs);
    }

    return new Promise<RunCommandResult>((resolve) => {
        child.on('close', (code) => {
            if (timeout) clearTimeout(timeout);
            resolve({ code, stdout, stderr });
        });
        child.on('error', () => {
            if (timeout) clearTimeout(timeout);
            resolve({ code: -1, stdout, stderr: stderr || 'Failed to start process' });
        });
    });
}


