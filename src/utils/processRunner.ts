import { spawn } from 'child_process';
import * as os from 'os';

export interface RunCommandOptions {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    shell?: boolean | string;
    timeoutMs?: number;
}

export interface RunCommandResult {
    code: number | null;
    stdout: string;
    stderr: string;
}

export function runCommandCapture(command: string, options: RunCommandOptions = {}, onData?: (chunk: string) => void, onErrorData?: (chunk: string) => void): Promise<RunCommandResult> {
    const shell = options.shell ?? true;
    // Windows에서 cmd.exe를 사용하는 경우 코드 페이지를 UTF-8로 설정
    const env = process.platform === 'win32' && /cmd\.exe/i.test(command)
        ? { ...process.env, ...options.env, 'CHCP': '65001' } // UTF-8 코드 페이지
        : { ...process.env, ...options.env };
    const child = spawn(command, { cwd: options.cwd, env, shell });

    let stdout = '';
    let stderr = '';

    // Windows에서 cmd.exe 출력은 CP949일 수 있으므로 처리
    const decodeOutput = (data: Buffer): string => {
        if (process.platform === 'win32' && /cmd\.exe/i.test(command)) {
            try {
                // CP949로 디코딩 시도
                const iconv = require('iconv-lite');
                return iconv.decode(data, 'cp949');
            } catch (e) {
                // iconv-lite가 없으면 UTF-8로 폴백
                return data.toString('utf8');
            }
        }
        return data.toString('utf8');
    };

    child.stdout?.on('data', (data: Buffer) => {
        const text = decodeOutput(data);
        stdout += text;
        onData?.(text);
    });

    child.stderr?.on('data', (data: Buffer) => {
        const text = decodeOutput(data);
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


