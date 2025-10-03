import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { runCommandCapture } from '../utils/processRunner';
import { getTerminalMonitor } from '../ai/monitorBridge';

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

/**
 * aidev-ide 전용 터미널 인스턴스를 가져오거나 새로 생성합니다.
 */
export function getAidevIdeTerminal(): vscode.Terminal {
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

function getCaptureOutputChannel(): vscode.OutputChannel {
    if (!_captureOutputChannel) {
        _captureOutputChannel = vscode.window.createOutputChannel('AIDEV-IDE Terminal Capture');
    }
    return _captureOutputChannel;
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

async function handleInteractiveCommand(command: string): Promise<boolean> {
    const lower = command.toLowerCase();
    const shouldUseTerminal = isInteractiveCommand(lower) || isLongRunningDevCommand(lower);

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

    // 캡처 기반 실행 경로 (표준 출력/에러 수집)
    const channel = getCaptureOutputChannel();
    const cwd = getProjectCwd();
    channel.appendLine(`\n===== Executing: ${command} (${new Date().toLocaleString()}) =====`);

    const isErrorLike = (text: string) => /(npm\s+err!|^error:|^fatal:|\berror\b|\bfail(ed)?\b|\bexception\b|ERROR in|Traceback|panic:|Exit status [1-9]|BUILD FAILED)/i.test(text);

    // npm 관련 선행 조건 체크
    if (/^npm\s+(install|ci)\b/.test(lower) || /^npm\s+run\b/.test(lower) || /^(yarn|pnpm)\b/.test(lower)) {
        if (!hasPackageJson(cwd)) {
            const msg = 'package.json이 존재하지 않아 npm 명령을 실행할 수 없습니다. 먼저 프로젝트 초기화 또는 파일 생성이 필요합니다.';
            channel.appendLine(msg);
            vscode.window.showErrorMessage(`aidev-ide: ${msg}`);
            try { getTerminalMonitor()?.ingestExternalOutput('stderr', msg); } catch { }
            return false;
        }
    }

    const result = await runCommandCapture(
        command,
        { cwd, shell: true },
        (chunk) => {
            chunk.split(/\r?\n/).forEach(line => {
                if (!line.trim()) return;
                channel.appendLine(line);
                try { getTerminalMonitor()?.ingestExternalOutput('stdout', line); } catch { }
            });
        },
        (chunk) => {
            chunk.split(/\r?\n/).forEach(line => {
                if (!line.trim()) return;
                channel.appendLine(line);
                try { getTerminalMonitor()?.ingestExternalOutput('stderr', line); } catch { }
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
    console.log(`[TerminalManager] Executed bash command: ${command}`);
    return true;
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

            // 대화형/장기 실행 명령이면 큐를 일시 정지 (사용자 종료 시 재개 가능)
            if (isInteractiveCommand(command) || isLongRunningDevCommand(command)) {
                _queuePausedForLongRunning = true;
                break;
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
    if (!_queuePausedForLongRunning) {
        processQueue();
    }
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