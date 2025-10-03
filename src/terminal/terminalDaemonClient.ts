import * as net from 'net';
import * as os from 'os';
import * as path from 'path';

export interface DaemonRunOptions {
    id: string;
    command: string;
    cwd?: string;
    env?: Record<string, string>;
}

export interface DaemonResponse {
    type: 'ack' | 'error' | 'log' | 'exit' | 'notify' | 'logs';
    id?: string;
    stream?: 'stdout' | 'stderr';
    chunk?: string;
    code?: number;
    error?: string;
}

export class TerminalDaemonClient {
    private socketPath: string;

    constructor(socketPath?: string) {
        this.socketPath = socketPath || path.join(os.tmpdir(), 'terminal-daemon.sock');
    }

    public async run(options: DaemonRunOptions, onLog: (stream: 'stdout' | 'stderr', line: string) => void): Promise<{ exitCode: number }> {
        return new Promise((resolve, reject) => {
            const socket = net.createConnection(this.socketPath);
            let exitResolved = false;

            const send = (obj: any) => {
                try {
                    socket.write(JSON.stringify(obj) + '\n');
                } catch (e) {
                    // ignore
                }
            };

            socket.on('connect', () => {
                send({
                    type: 'run',
                    id: options.id,
                    command: options.command,
                    cwd: options.cwd,
                    env: options.env
                });
            });

            let buffer = '';
            socket.on('data', (chunk: Buffer) => {
                buffer += chunk.toString('utf8');
                let idx;
                while ((idx = buffer.indexOf('\n')) >= 0) {
                    const line = buffer.slice(0, idx);
                    buffer = buffer.slice(idx + 1);
                    if (!line.trim()) continue;
                    try {
                        const msg = JSON.parse(line) as DaemonResponse;
                        if (msg.type === 'log' && msg.stream && msg.chunk !== undefined) {
                            onLog(msg.stream, msg.chunk);
                        } else if (msg.type === 'exit') {
                            if (!exitResolved) {
                                exitResolved = true;
                                socket.end();
                                resolve({ exitCode: msg.code ?? 0 });
                            }
                        } else if (msg.type === 'error') {
                            onLog('stderr', msg.error || 'daemon error');
                        }
                    } catch {
                        onLog('stderr', line);
                    }
                }
            });

            socket.on('error', (err) => {
                if (!exitResolved) {
                    exitResolved = true;
                    reject(err);
                }
            });

            socket.on('close', () => {
                if (!exitResolved) {
                    exitResolved = true;
                    resolve({ exitCode: -1 });
                }
            });
        });
    }
}


