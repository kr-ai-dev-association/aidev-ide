import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { runCommandCapture } from '../utils/processRunner';
import { getTerminalMonitor } from '../ai/monitorBridge';
import { TerminalDaemonClient } from './terminalDaemonClient';
import { ConfigurationService } from '../services/configurationService';

let _codePilotTerminal: vscode.Terminal | undefined;
let _isWaitingForInput = false;
let _pendingCommands: string[] = [];
let _currentCommandIndex = 0;
let _captureOutputChannel: vscode.OutputChannel | undefined;
let _priorityQueue: string[] = [];
let _normalQueue: string[] = [];
let _isProcessingQueue = false;
let _queuePausedForLongRunning = false;
const FILE_OP_PREFIX = '__AIDEV_FILE_OP__::';
const _daemonClient = new TerminalDaemonClient();

/**
 * aidev-ide 전용 터미널 인스턴스를 가져오거나 새로 생성합니다.
 */
export function getAidevIdeTerminal(): vscode.Terminal {
    // 기존 동일 이름 터미널 재사용 및 중복 정리
    const existing = vscode.window.terminals.filter(t => t.name === 'aidev-ide Terminal');
    if (existing.length > 0) {
        _codePilotTerminal = existing[0];
        // 나머지 중복 터미널 정리
        for (let i = 1; i < existing.length; i++) {
            try { existing[i].dispose(); } catch { }
        }
    }

    if (!_codePilotTerminal || _codePilotTerminal.exitStatus !== undefined) {
        _codePilotTerminal = vscode.window.createTerminal({ name: "aidev-ide Terminal" });
        const disposable = vscode.window.onDidCloseTerminal(event => {
            if (event === _codePilotTerminal) {
                _codePilotTerminal = undefined;
                disposable.dispose();
            }
        });
    }
    return _codePilotTerminal;
}

/**
 * 대화형 명령어인지 확인합니다.
 */
function isInteractiveCommand(command: string): boolean {
    const interactiveCommands = [
        'npm create',
        'npx create',
        'yarn create',
        'create-react-app',
        'vue create',
        'ng new',
        'dotnet new',
        'cargo new',
        'flutter create',
        'rails new',
        'django-admin startproject',
        'composer create-project',
        'git clone',
        'ssh',
        'mysql',
        'psql',
        'mongo',
        'redis-cli',
        'docker run -it',
        'docker exec -it'
    ];

    return interactiveCommands.some(interactiveCmd =>
        command.toLowerCase().includes(interactiveCmd.toLowerCase())
    );
}

function isLongRunningDevCommand(command: string): boolean {
    const lower = command.toLowerCase();
    return (
        /^npm\s+start\b/.test(lower) ||
        /^npm\s+run\s+(dev|start)\b/.test(lower) ||
        /^yarn\s+(dev|serve|start)\b/.test(lower) ||
        /^pnpm\s+(dev|serve|start)\b/.test(lower) ||
        /^bun\s+(run\s+)?dev\b/.test(lower) ||
        /\bvite\b/.test(lower) ||
        /react-scripts\s+start/.test(lower) ||
        /next\s+dev/.test(lower) ||
        /nuxt\s+(dev|start)/.test(lower) ||
        /ng\s+serve/.test(lower) ||
        /svelte(-kit)?\s+dev/.test(lower)
    );
}

function getProjectCwd(): string | undefined {
    const folder = vscode.workspace.workspaceFolders?.[0];
    return folder?.uri.fsPath;
}

const _configService = new ConfigurationService();
async function getEffectiveCwd(): Promise<string | undefined> {
    try {
        const configured = await _configService.getProjectRoot();
        if (configured && configured.trim().length > 0) {
            return configured;
        }
    } catch { }
    return getProjectCwd();
}

function getCaptureOutputChannel(): vscode.OutputChannel {
    if (!_captureOutputChannel) {
        _captureOutputChannel = vscode.window.createOutputChannel('AIDEV-IDE Terminal Capture');
    }
    return _captureOutputChannel;
}

function sanitizeOutput(text: string): string {
    // Strip ANSI escape sequences and control codes
    const ansiPattern = /[\u001B\u009B][[\]()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
    return text.replace(/\r/g, '\n').replace(ansiPattern, '').replace(/\u0007/g, '').replace(/\u0008/g, '').trimEnd();
}

/**
 * 대화형 명령어에 대한 기본 응답을 제공합니다.
 */
function getDefaultResponseForCommand(command: string): string | null {
    const lowerCommand = command.toLowerCase();

    // npm create 명령어들
    if (lowerCommand.includes('npm create vite')) {
        return 'y'; // 기본값으로 yes
    }
    if (lowerCommand.includes('npm create react-app') || lowerCommand.includes('npx create-react-app')) {
        return 'y';
    }
    if (lowerCommand.includes('npm create vue')) {
        return 'y';
    }
    if (lowerCommand.includes('npm create next')) {
        return 'y';
    }

    // git clone
    if (lowerCommand.includes('git clone')) {
        return ''; // Enter 키만 누름
    }

    // SSH 연결
    if (lowerCommand.includes('ssh')) {
        return 'yes'; // 호스트 키 확인
    }

    // Docker 대화형 명령어
    if (lowerCommand.includes('docker run -it') || lowerCommand.includes('docker exec -it')) {
        return 'exit'; // 컨테이너에서 빠져나옴
    }

    return null;
}

/**
 * 대화형 명령어를 처리합니다.
 */
function isDangerousCommand(command: string): boolean {
    const lower = command.toLowerCase().trim();
    return (
        /^rm\s+-rf\s+\.$/.test(lower) ||
        /^rm\s+-rf\s+\.\*$/.test(lower) ||
        /^rm\s+-rf\s+\.\/$/.test(lower) ||
        /\brm\s+-rf\s+\.\//.test(lower) ||
        /\brm\s+-rf\s+\*\b/.test(lower) ||
        /\brimraf\b/.test(lower) ||
        /\bdel\s+\/s\b/.test(lower)
    );
}

function hasPackageJson(cwd: string | undefined): boolean {
    if (!cwd) return false;
    try { return fs.existsSync(path.join(cwd, 'package.json')); } catch { return false; }
}

async function readPackageJson(cwd: string | undefined): Promise<any | null> {
    if (!cwd) return null;
    const p = path.join(cwd, 'package.json');
    try {
        const raw = await fs.promises.readFile(p, 'utf8');
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

// Note: We intentionally do not pre-validate npm scripts.

async function handleInteractiveCommand(command: string): Promise<boolean> {
    const lower = command.toLowerCase();
    const isDevLong = isLongRunningDevCommand(lower);
    let shouldUseTerminal = isInteractiveCommand(lower); // dev 서버 등 비대화형 장기 실행은 데몬 사용

    // 위험 명령어 방지
    if (isDangerousCommand(lower)) {
        const answer = await vscode.window.showWarningMessage(
            `매우 위험한 명령어가 감지되었습니다: "${command}"\n실행 시 현재 작업 디렉토리의 파일이 삭제될 수 있습니다. 계속하시겠습니까?`,
            { modal: true },
            '실행', '취소'
        );
        if (answer !== '실행') {
            vscode.window.showInformationMessage('aidev-ide: 위험 명령어 실행이 취소되었습니다.');
            return false;
        }
    }

    const cwd = await getEffectiveCwd();

    if (shouldUseTerminal) {
        const terminal = getAidevIdeTerminal();
        if (!terminal.state.isInteractedWith) {
            terminal.show();
        }
        terminal.sendText(command);

        if (isInteractiveCommand(lower)) {
            const defaultResponse = getDefaultResponseForCommand(command);
            if (defaultResponse !== null) {
                setTimeout(() => {
                    terminal.sendText(defaultResponse);
                    console.log(`[TerminalManager] Sent default response for interactive command: ${defaultResponse}`);
                }, 2000);
            }
            vscode.window.showInformationMessage(
                `aidev-ide: 대화형 명령어 실행됨 - ${command}\n기본 응답이 자동으로 제공됩니다.`,
                { modal: false }
            );
        } else {
            vscode.window.showInformationMessage(`aidev-ide: Bash 명령어 실행됨 - ${command}`);
        }
        console.log(`[TerminalManager] Executed bash command: ${command}`);
        return true;
    }

    // 기본 경로: terminal-daemon 경유 실행 (비대화형)
    const channel = getCaptureOutputChannel();
    channel.appendLine(`\n===== Executing: ${command} (${new Date().toLocaleString()}) =====`);
    channel.appendLine(`CWD: ${cwd || '(not set)'}`);

    const isErrorLike = (text: string) => /(npm\s+err!|^error:|^fatal:|\berror\b|\bfail(ed)?\b|\bexception\b|ERROR in|Traceback|panic:|Exit status [1-9]|BUILD FAILED|Missing script:)/i.test(text);

    let stderrAgg = '';
    let stdoutAgg = '';

    try {
        const id = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        console.log(`[TerminalManager] Starting via daemon. id=${id}, cwd=${cwd || '(not set)'}, cmd="${command}"`);
        const runPromise = _daemonClient.run(
            { id, command, cwd },
            (stream, chunk) => {
                const lines = chunk.replace(/\r\n/g, '\n').split('\n');
                for (const line of lines) {
                    const cleaned = sanitizeOutput(line).trim();
                    if (!cleaned) continue;
                    channel.appendLine(cleaned);
                    try { getTerminalMonitor()?.ingestExternalOutput(stream, cleaned); } catch { }
                }
                if (stream === 'stderr') { stderrAgg += chunk + '\n'; }
                else { stdoutAgg += chunk + '\n'; }
            }
        );

        if (isDevLong) {
            // 장기 실행은 즉시 반환하여 큐를 일시정지하도록 함 (processQueue에서 처리)
            runPromise.then((res) => {
                if (res.exitCode !== 0) {
                    const msg = `Exit status ${res.exitCode}: ${command}`;
                    try { getTerminalMonitor()?.ingestExternalOutput('stderr', msg); } catch { }
                    channel.appendLine(msg);
                    channel.show(true);
                } else {
                    try { getTerminalMonitor()?.ingestExternalOutput('stdout', `Process exited (code ${res.exitCode}): ${command}`); } catch { }
                }
            }).catch((err) => {
                try { getTerminalMonitor()?.ingestExternalOutput('stderr', `Process error: ${err?.message || String(err)}`); } catch { }
            });
            console.log(`[TerminalManager] Started long-running via daemon: ${command}`);
            try { channel.show(true); } catch { }
            return true;
        }

        const result = await runPromise;

        if (result.exitCode !== 0 || isErrorLike(stderrAgg)) {
            channel.appendLine(`----- Exit code: ${result.exitCode} -----`);
            try {
                getTerminalMonitor()?.ingestExternalOutput('stderr', `Command failed (exit ${result.exitCode}): ${command}`);
                getTerminalMonitor()?.ingestExternalOutput('stderr', `Exit status ${result.exitCode}`);
            } catch { }
            channel.show(true);
            vscode.window.showErrorMessage(`aidev-ide: 명령 실패 (${command})`);
            return false;
        }
        console.log(`[TerminalManager] Executed via daemon: ${command}`);
        return true;
    } catch (e: any) {
        // 데몬 실패 시 캡처 기반으로 폴백
        channel.appendLine(`[WARN] terminal-daemon 사용 실패, 로컬 실행으로 폴백: ${e?.message || e}`);
        const result = await runCommandCapture(
            command,
            { cwd, shell: true },
            (chunk) => {
                chunk.split(/\r?\n/).forEach(line => {
                    const cleaned = sanitizeOutput(line).trim();
                    if (!cleaned) return;
                    channel.appendLine(cleaned);
                    try { getTerminalMonitor()?.ingestExternalOutput('stdout', cleaned); } catch { }
                });
            },
            (chunk) => {
                chunk.split(/\r?\n/).forEach(line => {
                    const cleaned = sanitizeOutput(line).trim();
                    if (!cleaned) return;
                    channel.appendLine(cleaned);
                    try { getTerminalMonitor()?.ingestExternalOutput('stderr', cleaned); } catch { }
                });
            }
        );

        if (result.code !== 0 || isErrorLike(result.stderr)) {
            channel.appendLine(`----- Exit code: ${result.code} -----`);
            channel.show(true);
            vscode.window.showErrorMessage(`aidev-ide: 명령 실패 (${command})`);
            try { getTerminalMonitor()?.ingestExternalOutput('stderr', `Command failed (exit ${result.code}): ${command}`); } catch { }
            return false;
        }
        console.log(`[TerminalManager] Executed locally (fallback): ${command}`);
        return true;
    }
}

/**
 * 명령어 시퀀스를 순차적으로 실행합니다.
 */
async function processQueue(): Promise<void> {
    if (_isProcessingQueue) return;
    _isProcessingQueue = true;
    try {
        while (_priorityQueue.length > 0 || _normalQueue.length > 0) {
            const command = _priorityQueue.length > 0 ? _priorityQueue.shift()! : _normalQueue.shift()!;
            _pendingCommands = [command];
            _currentCommandIndex = 0;

            // 파일 작업 토큰인지 확인
            if (typeof command === 'string' && command.startsWith(FILE_OP_PREFIX)) {
                const ok = await executeFileOpFromToken(command);
                if (!ok) {
                    break;
                }
            } else {
                const ok = await handleInteractiveCommand(command);
                if (!ok) {
                    // 실패 시 즉시 중단 (대기열은 유지)
                    break;
                }
            }

            // 장기 실행(dev server 등) 명령이면 큐를 일시 정지 (사용자 종료 시 재개 가능)
            if (isLongRunningDevCommand(command)) {
                _queuePausedForLongRunning = true;
                // 장기 실행 중에는 즉시 루프를 종료하여 중복 실행 방지
                return;
            }

            // 다음 항목 처리 (완료 후에만 진행) — 불필요한 대기 제거
        }
    } finally {
        _isProcessingQueue = false;
    }
}

function enqueueCommands(commands: string[], priority = false): void {
    if (priority) {
        _priorityQueue = commands.concat(_priorityQueue);
    } else {
        _normalQueue = _normalQueue.concat(commands);
    }
    // 항상 처리 시도: 장기 실행 중이라도 파일 작업 등은 재호출 시 처리될 수 있음
    processQueue();
}

async function executeFileOpFromToken(token: string): Promise<boolean> {
    try {
        const b64 = token.substring(FILE_OP_PREFIX.length);
        const decoded = Buffer.from(b64, 'base64').toString('utf8');
        const payload = JSON.parse(decoded) as { type: 'create' | 'modify' | 'delete'; path: string; content?: string };
        const uri = vscode.Uri.file(payload.path);
        const channel = getCaptureOutputChannel();
        if (payload.type === 'delete') {
            try {
                await vscode.workspace.fs.delete(uri);
                channel.appendLine(`[FILE-OP] deleted: ${payload.path}`);
            } catch (e: any) {
                const msg = e?.message || '';
                if (/ENOENT|not exist|FileNotFound/i.test(msg) || e?.code === 'FileNotFound') {
                    channel.appendLine(`[FILE-OP] delete skipped (not found): ${payload.path}`);
                } else {
                    throw e;
                }
            }
        } else {
            // ensure directory exists
            const dir = path.dirname(payload.path);
            await vscode.workspace.fs.createDirectory(vscode.Uri.file(dir));
            await vscode.workspace.fs.writeFile(uri, Buffer.from(payload.content || '', 'utf8'));
            channel.appendLine(`[FILE-OP] ${payload.type}: ${payload.path} (${(payload.content || '').length} bytes)`);
        }
        return true;
    } catch (e: any) {
        const channel = getCaptureOutputChannel();
        channel.appendLine(`[FILE-OP] failed: ${e?.message || String(e)}`);
        try { getTerminalMonitor()?.ingestExternalOutput('stderr', `[FILE-OP] failed: ${e?.message || String(e)}`); } catch { }
        return false;
    }
}

export function buildFileOpTokens(ops: { type: 'create' | 'modify' | 'delete'; path: string; content?: string }[]): string[] {
    return ops.map(op => FILE_OP_PREFIX + Buffer.from(JSON.stringify(op), 'utf8').toString('base64'));
}

export function enqueueCommandsBatch(commands: string[], priority = false): void {
    enqueueCommands(commands, priority);
}

export function extractBashCommandsFromLlmResponse(llmResponse: string): string[] {
    const commands: string[] = [];
    const bashBlockRegex = /```bash\s*\n([\s\S]*?)\n```/g;
    let match;
    while ((match = bashBlockRegex.exec(llmResponse)) !== null) {
        const block = match[1].trim();
        if (!block) continue;
        block.split('\n').forEach(cmd => {
            const c = cmd.trim();
            if (c) commands.push(c);
        });
    }
    return commands;
}

/**
 * LLM 응답에서 bash 명령어를 추출하고 터미널에서 실행합니다.
 */
export function executeBashCommandsFromLlmResponse(llmResponse: string): string[] {
    const executedCommands: string[] = [];

    // bash로 시작하는 코드 블록을 찾는 정규식
    const bashBlockRegex = /```bash\s*\n([\s\S]*?)\n```/g;

    let match;
    while ((match = bashBlockRegex.exec(llmResponse)) !== null) {
        const bashCommands = match[1].trim();
        if (bashCommands) {
            // 여러 명령어를 개행으로 분리
            const commands = bashCommands.split('\n').filter(cmd => cmd.trim());

            for (const command of commands) {
                if (command.trim()) {
                    executedCommands.push(command.trim());
                }
            }
        }
    }

    // 명령어들을 우선순위 큐에 추가하고 처리 시작
    if (executedCommands.length > 0) {
        enqueueCommands(executedCommands, true);
    }

    return executedCommands;
}

/**
 * 단일 bash 명령어를 터미널에서 실행합니다.
 */
export function executeBashCommand(command: string): void {
    handleInteractiveCommand(command);
}

/**
 * LLM 응답에서 bash 명령어가 포함되어 있는지 확인합니다.
 */
export function hasBashCommands(llmResponse: string): boolean {
    const bashBlockRegex = /```bash\s*\n([\s\S]*?)\n```/g;
    return bashBlockRegex.test(llmResponse);
}

/**
 * 현재 실행 중인 명령어 시퀀스의 상태를 확인합니다.
 */
export function getCommandSequenceStatus(): { isRunning: boolean; currentIndex: number; totalCommands: number } {
    return {
        isRunning: _pendingCommands.length > 0,
        currentIndex: _currentCommandIndex,
        totalCommands: _pendingCommands.length
    };
}

/**
 * 실행 중인 명령어 시퀀스를 중단합니다.
 */
export function stopCommandSequence(): void {
    _pendingCommands = [];
    _currentCommandIndex = 0;
    _isWaitingForInput = false;

    vscode.window.showInformationMessage('aidev-ide: 명령어 시퀀스가 중단되었습니다.');
}