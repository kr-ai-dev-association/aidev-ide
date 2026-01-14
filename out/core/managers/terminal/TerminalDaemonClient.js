"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.TerminalDaemonClient = void 0;
const net = __importStar(require("net"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
class TerminalDaemonClient {
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
exports.TerminalDaemonClient = TerminalDaemonClient;
//# sourceMappingURL=TerminalDaemonClient.js.map