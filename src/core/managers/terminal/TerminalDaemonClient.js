import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
export class TerminalDaemonClient {
    socketPath;
    constructor(socketPath) {
        this.socketPath = socketPath || path.join(os.tmpdir(), 'terminal-daemon.sock');
    }
    async run(options, onLog) {
        return new Promise((resolve, reject) => {
            const socket = net.createConnection(this.socketPath);
            let exitResolved = false;
            const send = (obj) => {
                try {
                    socket.write(JSON.stringify(obj) + '\n');
                }
                catch (e) {
                    // ignore
                }
            };
            socket.on('connect', () => {
                console.log(`[TerminalDaemonClient] Connected to daemon, sending command: ${options.command}`);
                send({
                    type: 'run',
                    id: options.id,
                    command: options.command,
                    cwd: options.cwd,
                    env: options.env
                });
            });
            let buffer = '';
            socket.on('data', (chunk) => {
                buffer += chunk.toString('utf8');
                let idx;
                while ((idx = buffer.indexOf('\n')) >= 0) {
                    const line = buffer.slice(0, idx);
                    buffer = buffer.slice(idx + 1);
                    if (!line.trim())
                        continue;
                    try {
                        const msg = JSON.parse(line);
                        console.log(`[TerminalDaemonClient] Received message:`, msg);
                        if (msg.type === 'log' && msg.stream && msg.chunk !== undefined) {
                            onLog(msg.stream, msg.chunk);
                        }
                        else if (msg.type === 'exit') {
                            console.log(`[TerminalDaemonClient] Command exited with code: ${msg.code}`);
                            if (!exitResolved) {
                                exitResolved = true;
                                socket.end();
                                resolve({ exitCode: msg.code ?? 0 });
                            }
                        }
                        else if (msg.type === 'error') {
                            console.log(`[TerminalDaemonClient] Daemon error: ${msg.error}`);
                            onLog('stderr', msg.error || 'daemon error');
                        }
                    }
                    catch (e) {
                        console.log(`[TerminalDaemonClient] Failed to parse message: ${line}`, e);
                        onLog('stderr', line);
                    }
                }
            });
            socket.on('error', (err) => {
                console.log(`[TerminalDaemonClient] Socket error:`, err);
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
//# sourceMappingURL=TerminalDaemonClient.js.map