import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { runCommandCapture } from '../utils/processRunner';
import { getTerminalMonitor } from '../ai/monitorBridge';
import { TerminalMonitorService } from '../ai/terminalMonitorService';
import { ConfigurationService } from '../services/configurationService';
import { LlmService } from '../ai/llmService';

let _codePilotTerminal: vscode.Terminal | undefined;
let _isWaitingForInput = false;
let _pendingCommands: string[] = [];
let _currentCommandIndex = 0;
let _captureOutputChannel: vscode.OutputChannel | undefined;
let _priorityQueue: string[] = [];
let _normalQueue: string[] = [];
let _isProcessingQueue = false;
let _queuePausedForLongRunning = false;
let _currentWorkingDirectory: string | undefined = undefined;
const FILE_OP_PREFIX = '__AIDEV_FILE_OP__::';

// 오류 수정 시스템 관련 변수들
let _llmService: LlmService | undefined = undefined;
let _errorRetryCount = 0;
const MAX_ERROR_RETRIES = 3;
let _currentWebview: vscode.Webview | undefined = undefined;
let _terminalMonitorService: TerminalMonitorService | undefined = undefined;

/**
 * 오류 수정 시스템을 위한 LLM 서비스와 웹뷰를 설정합니다.
 */
export function setErrorCorrectionServices(llmService: LlmService, webview: vscode.Webview): void {
    _llmService = llmService;
    _currentWebview = webview;
}

/**
 * 터미널 모니터링 서비스를 설정합니다.
 */
export function setTerminalMonitorService(terminalMonitorService: TerminalMonitorService): void {
    _terminalMonitorService = terminalMonitorService;
    console.log('[TerminalManager] 터미널 모니터링 서비스 설정 완료');
}

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
        _captureOutputChannel = vscode.window.createOutputChannel('AIDEV-IDE Terminal');
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

    // cd 명령어 감지 및 작업 디렉토리 업데이트
    if (command.toLowerCase().trim().startsWith('cd ')) {
        const targetDir = command.substring(3).trim();
        if (targetDir) {
            _currentWorkingDirectory = targetDir;
            // console.log(`[TerminalManager] Updated working directory to: ${_currentWorkingDirectory}`);
        }
    }

    // 현재 작업 디렉토리를 프로젝트 루트로 설정 (잘못된 cwd 방지)
    const effectiveCwd = await getEffectiveCwd();
    const cwd = _currentWorkingDirectory && _currentWorkingDirectory !== 'bank-app-front' ? _currentWorkingDirectory : effectiveCwd;

    if (shouldUseTerminal) {
        const channel = getCaptureOutputChannel();
        channel.appendLine(`\n===== Executing in VS Code Terminal: ${command} (${new Date().toLocaleString()}) =====`);
        channel.appendLine(`CWD: ${cwd || '(not set)'}`);
        channel.appendLine(`Command: ${command}`);
        channel.appendLine(`Working Directory: ${cwd || '(not set)'}`);

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
                    // console.log(`[TerminalManager] Sent default response for interactive command: ${defaultResponse}`);
                }, 2000);
            }
            vscode.window.showInformationMessage(
                `aidev-ide: 대화형 명령어 실행됨 - ${command}\n기본 응답이 자동으로 제공됩니다.`,
                { modal: false }
            );
        } else {
            vscode.window.showInformationMessage(`aidev-ide: Bash 명령어 실행됨 - ${command}`);
        }

        channel.appendLine(`----- Command Sent to VS Code Terminal -----`);
        channel.appendLine(`Command: ${command}`);
        channel.appendLine(`Working Directory: ${cwd || '(not set)'}`);
        // console.log(`[TerminalManager] Executed bash command: ${command}`);
        return true;
    }

    // 기본 경로: terminal-daemon 경유 실행 (비대화형)
    const channel = getCaptureOutputChannel();
    channel.appendLine(`\n===== Executing: ${command} (${new Date().toLocaleString()}) =====`);
    channel.appendLine(`CWD: ${cwd || '(not set)'}`);
    channel.appendLine(`Command: ${command}`);
    channel.appendLine(`Working Directory: ${cwd || '(not set)'}`);

    const isErrorLike = (text: string) => /(npm\s+err!|^error:|^fatal:|\berror\b|\bfail(ed)?\b|\bexception\b|ERROR in|Traceback|panic:|Exit status [1-9]|BUILD FAILED|Missing script:)/i.test(text);

    let stderrAgg = '';
    let stdoutAgg = '';

    try {
        const id = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        console.log(`[TerminalManager] Starting via VS Code terminal. id=${id}, cwd=${cwd || '(not set)'}, cmd="${command}"`);
        channel.appendLine(`[DEBUG] Executing command in VS Code terminal: ${command}`);
        channel.appendLine(`[DEBUG] Working directory: ${cwd || '(not set)'}`);

        // VS Code 터미널을 사용하여 명령어 실행
        const terminal = getAidevIdeTerminal();

        // 작업 디렉토리 설정
        if (cwd) {
            terminal.sendText(`cd "${cwd}"`);
        }

        // 명령어 실행
        terminal.sendText(command);

        // 터미널을 보여주고 포커스
        terminal.show(true);

        // VS Code 터미널에서는 직접적인 출력 캡처가 어려우므로
        // processRunner를 사용하여 출력을 캡처
        const runPromise = runCommandCapture(
            command, 
            { cwd },
            // stdout 콜백
            (data: string) => {
                if (_terminalMonitorService) {
                    _terminalMonitorService.ingestExternalOutput(`terminal:${terminal.name}:stdout`, data);
                }
            },
            // stderr 콜백
            (data: string) => {
                if (_terminalMonitorService) {
                    _terminalMonitorService.ingestExternalOutput(`terminal:${terminal.name}:stderr`, data);
                }
            }
        );

        if (isDevLong) {
            // 장기 실행은 즉시 반환하여 큐를 일시정지하도록 함 (processQueue에서 처리)
            runPromise.then(async (res) => {
                if (res.code !== 0) {
                    const msg = `Exit status ${res.code}: ${command}`;
                    channel.appendLine(`----- Long-running Command Failed -----`);
                    channel.appendLine(`Command: ${command}`);
                    channel.appendLine(`Exit code: ${res.code}`);
                    channel.appendLine(`Working Directory: ${cwd || '(not set)'}`);
                    if (res.stderr) {
                        channel.appendLine(`Stderr: ${res.stderr}`);
                    }
                    try { getTerminalMonitor()?.ingestExternalOutput('stderr', msg); } catch { }
                    channel.show(true);

                    // Long-running 명령어에서도 오류 수정 시도
                    const errorOutput = `Exit code: ${res.code}\nStderr: ${res.stderr || ''}\nStdout: ${res.stdout || ''}`;
                    const retrySuccess = await handleCommandError(
                        command,
                        errorOutput,
                        cwd || '',
                        async (correctedCommand: string) => {
                            // 수정된 명령어로 재시도
                            channel.appendLine(`\n===== Retrying with corrected command: ${correctedCommand} =====`);
                            await handleInteractiveCommand(correctedCommand);
                        }
                    );

                    if (!retrySuccess) {
                        vscode.window.showErrorMessage(`aidev-ide: Long-running 명령 실패 (${command})`);
                    }
                } else {
                    channel.appendLine(`----- Long-running Command Completed -----`);
                    channel.appendLine(`Command: ${command}`);
                    channel.appendLine(`Exit code: ${res.code}`);
                    channel.appendLine(`Working Directory: ${cwd || '(not set)'}`);
                    if (res.stdout) {
                        channel.appendLine(`Output: ${res.stdout}`);
                    }
                    try { getTerminalMonitor()?.ingestExternalOutput('stdout', `Process exited (code ${res.code}): ${command}`); } catch { }
                }
            }).catch(async (err) => {
                channel.appendLine(`----- Long-running Command Error -----`);
                channel.appendLine(`Command: ${command}`);
                channel.appendLine(`Error: ${err?.message || String(err)}`);
                channel.appendLine(`Working Directory: ${cwd || '(not set)'}`);
                try { getTerminalMonitor()?.ingestExternalOutput('stderr', `Process error: ${err?.message || String(err)}`); } catch { }

                // Long-running 명령어에서도 오류 수정 시도
                const errorOutput = `Process error: ${err?.message || String(err)}`;
                const retrySuccess = await handleCommandError(
                    command,
                    errorOutput,
                    cwd || '',
                    async (correctedCommand: string) => {
                        // 수정된 명령어로 재시도
                        channel.appendLine(`\n===== Retrying with corrected command: ${correctedCommand} =====`);
                        await handleInteractiveCommand(correctedCommand);
                    }
                );

                if (!retrySuccess) {
                    vscode.window.showErrorMessage(`aidev-ide: Long-running 명령 오류 (${command})`);
                }
            });
            channel.appendLine(`----- Long-running Command Started -----`);
            channel.appendLine(`Command: ${command}`);
            channel.appendLine(`Working Directory: ${cwd || '(not set)'}`);
            console.log(`[TerminalManager] Started long-running via VS Code terminal: ${command}`);
            try { channel.show(true); } catch { }
            return true;
        }

        const result = await runPromise;

        if (result.code !== 0 || isErrorLike(result.stderr || '')) {
            channel.appendLine(`----- Command Failed -----`);
            channel.appendLine(`Command: ${command}`);
            channel.appendLine(`Exit code: ${result.code}`);
            channel.appendLine(`Working Directory: ${cwd || '(not set)'}`);
            if (result.stderr) {
                channel.appendLine(`Stderr: ${result.stderr}`);
            }
            try {
                getTerminalMonitor()?.ingestExternalOutput('stderr', `Command failed (exit ${result.code}): ${command}`);
                getTerminalMonitor()?.ingestExternalOutput('stderr', `Exit status ${result.code}`);
            } catch { }
            channel.show(true);

            // 오류 수정 시도
            const errorOutput = `Exit code: ${result.code}\nStderr: ${result.stderr || ''}\nStdout: ${result.stdout || ''}`;
            const retrySuccess = await handleCommandError(
                command,
                errorOutput,
                cwd || '',
                async (correctedCommand: string) => {
                    // 수정된 명령어로 재시도
                    channel.appendLine(`\n===== Retrying with corrected command: ${correctedCommand} =====`);
                    await handleInteractiveCommand(correctedCommand);
                }
            );

            if (!retrySuccess) {
                vscode.window.showErrorMessage(`aidev-ide: 명령 실패 (${command})`);
                return false;
            }

            return true;
        }

        channel.appendLine(`----- Command Completed Successfully -----`);
        channel.appendLine(`Command: ${command}`);
        channel.appendLine(`Exit code: ${result.code}`);
        channel.appendLine(`Working Directory: ${cwd || '(not set)'}`);
        if (result.stdout) {
            channel.appendLine(`Output: ${result.stdout}`);
        }
        console.log(`[TerminalManager] Executed via VS Code terminal: ${command}`);
        return true;
    } catch (e: any) {
        // VS Code 터미널 실행 실패 시 캡처 기반으로 폴백
        channel.appendLine(`[WARN] VS Code 터미널 실행 실패, 로컬 실행으로 폴백: ${e?.message || e}`);
        channel.appendLine(`[ERROR] Execution error details: ${JSON.stringify(e)}`);
        console.error(`[TerminalManager] VS Code terminal execution failed:`, e);
        const result = await runCommandCapture(
            command,
            { cwd, shell: true },
            (chunk) => {
                chunk.split(/\r?\n/).forEach(line => {
                    const cleaned = sanitizeOutput(line).trim();
                    if (!cleaned) return;
                    channel.appendLine(cleaned);
                    try { getTerminalMonitor()?.ingestExternalOutput('stdout', cleaned); } catch { }
                    // 터미널 모니터링 서비스에도 전달
                    if (_terminalMonitorService) {
                        _terminalMonitorService.ingestExternalOutput('fallback:stdout', cleaned);
                    }
                });
            },
            (chunk) => {
                chunk.split(/\r?\n/).forEach(line => {
                    const cleaned = sanitizeOutput(line).trim();
                    if (!cleaned) return;
                    channel.appendLine(cleaned);
                    try { getTerminalMonitor()?.ingestExternalOutput('stderr', cleaned); } catch { }
                    // 터미널 모니터링 서비스에도 전달
                    if (_terminalMonitorService) {
                        _terminalMonitorService.ingestExternalOutput('fallback:stderr', cleaned);
                    }
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
            try {
                const channel = getCaptureOutputChannel();
                const ts = new Date().toLocaleTimeString();
                if (typeof command === 'string' && command.startsWith(FILE_OP_PREFIX)) {
                    try {
                        const b64 = command.substring(FILE_OP_PREFIX.length);
                        const decoded = Buffer.from(b64, 'base64').toString('utf8');
                        const payload = JSON.parse(decoded) as { type: string; path: string; content?: string };
                        channel.appendLine(`[QUEUE] (${ts}) Dequeue FILE-OP: ${payload.type} ${payload.path} ${payload.content !== undefined ? `(${payload.content.length} bytes)` : ''}`.trim());
                    } catch (e: any) {
                        channel.appendLine(`[QUEUE] (${ts}) Dequeue FILE-OP: parse error: ${e?.message || String(e)}`);
                    }
                } else {
                    channel.appendLine(`[QUEUE] (${ts}) Dequeue CMD: ${String(command)}`);
                }
            } catch { }
            _pendingCommands = [command];
            _currentCommandIndex = 0;

            // 파일 작업 토큰인지 확인
            if (typeof command === 'string' && command.startsWith(FILE_OP_PREFIX)) {
                const ok = await executeFileOpFromToken(command);
                if (!ok) {
                    try { getCaptureOutputChannel().appendLine(`[QUEUE] stop: file-op failed`); } catch { }
                    break;
                }
            } else {
                const ok = await handleInteractiveCommand(command);
                if (!ok) {
                    // 실패 시 즉시 중단 (대기열은 유지)
                    try { getCaptureOutputChannel().appendLine(`[QUEUE] stop: command failed or cancelled`); } catch { }
                    break;
                }
            }

            // 장기 실행(dev server 등) 명령이면 큐를 일시 정지 (사용자 종료 시 재개 가능)
            if (isLongRunningDevCommand(command)) {
                _queuePausedForLongRunning = true;
                // 장기 실행 중에는 즉시 루프를 종료하여 중복 실행 방지
                try { getCaptureOutputChannel().appendLine(`[QUEUE] paused for long-running command`); } catch { }
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
            const bytes = (payload.content || '').length;
            if (payload.content === undefined) {
                channel.appendLine(`[FILE-OP] skipped: ${payload.type} ${payload.path} (no content provided)`);
                return false;
            }
            await vscode.workspace.fs.writeFile(uri, Buffer.from(payload.content, 'utf8'));
            channel.appendLine(`[FILE-OP] ${payload.type}: ${payload.path} (${bytes} bytes)`);
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
    try {
        const channel = getCaptureOutputChannel();
        const timestamp = new Date().toLocaleString();
        let fileOps: { type: string; path: string; size?: number }[] = [];
        const bash: string[] = [];

        for (const c of commands) {
            if (typeof c === 'string' && c.startsWith(FILE_OP_PREFIX)) {
                try {
                    const b64 = c.substring(FILE_OP_PREFIX.length);
                    const decoded = Buffer.from(b64, 'base64').toString('utf8');
                    const payload = JSON.parse(decoded) as { type: string; path: string; content?: string };
                    fileOps.push({ type: payload.type, path: payload.path, size: (payload.content || '').length });
                } catch (e: any) {
                    channel.appendLine(`[QUEUE-ENQUEUE] failed to parse file-op token: ${e?.message || String(e)}`);
                }
            } else {
                bash.push(String(c));
            }
        }

        channel.appendLine(`\n===== Queue Enqueue (${timestamp}) =====`);
        channel.appendLine(`Priority: ${priority ? 'yes' : 'no'} | Items: ${commands.length} | fileOps: ${fileOps.length} | bash: ${bash.length}`);
        if (fileOps.length > 0) {
            channel.appendLine(`[QUEUE-ENQUEUE] FileOps:`);
            for (const f of fileOps) {
                channel.appendLine(`  - ${f.type}: ${f.path} ${typeof f.size === 'number' ? `(${f.size} bytes)` : ''}`.trim());
            }
        }
        if (bash.length > 0) {
            channel.appendLine(`[QUEUE-ENQUEUE] Bash:`);
            for (const b of bash.slice(0, 20)) {
                channel.appendLine(`  - ${b}`);
            }
            if (bash.length > 20) channel.appendLine(`  ... (+${bash.length - 20} more)`);
        }
    } catch { /* ignore logging errors */ }

    enqueueCommands(commands, priority);
}

/**
 * 명령어에서 인라인 주석을 제거합니다.
 * @param command 원본 명령어
 * @returns 주석이 제거된 명령어
 */
function removeInlineComment(command: string): string {
    // 따옴표 안의 #은 주석이 아니므로 보호
    let inQuotes = false;
    let quoteChar = '';
    let escaped = false;

    for (let i = 0; i < command.length; i++) {
        const char = command[i];

        if (escaped) {
            escaped = false;
            continue;
        }

        if (char === '\\') {
            escaped = true;
            continue;
        }

        if (!inQuotes && (char === '"' || char === "'")) {
            inQuotes = true;
            quoteChar = char;
            continue;
        }

        if (inQuotes && char === quoteChar) {
            inQuotes = false;
            quoteChar = '';
            continue;
        }

        if (!inQuotes && char === '#') {
            return command.substring(0, i).trim();
        }
    }

    return command.trim();
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
            // 주석 처리된 줄들(#으로 시작)과 빈 줄들을 제외
            if (c && !c.startsWith('#')) {
                // 인라인 주석 제거
                const cleanCommand = removeInlineComment(c);
                if (cleanCommand) {
                    commands.push(cleanCommand);
                }
            }
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
            // 여러 명령어를 개행으로 분리하고 주석 처리된 줄들 제외
            const commands = bashCommands.split('\n')
                .map(cmd => cmd.trim())
                .filter(cmd => cmd && !cmd.startsWith('#'))
                .map(cmd => removeInlineComment(cmd))
                .filter(cmd => cmd); // 빈 명령어 제거

            for (const command of commands) {
                executedCommands.push(command);
            }
        }
    }

    // 명령어들을 우선순위 큐에 추가하고 처리 시작
    if (executedCommands.length > 0) {
        // 작업 디렉토리를 초기화하여 잘못된 cwd 방지
        resetWorkingDirectory();
        enqueueCommandsBatch(executedCommands, true);
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
 * 현재 작업 디렉토리를 초기화합니다.
 */
export function resetWorkingDirectory(): void {
    _currentWorkingDirectory = undefined;
}

/**
 * 명령어 실행 오류를 LLM에게 전송하여 수정된 명령어를 받아옵니다.
 */
async function getCorrectedCommand(failedCommand: string, errorOutput: string, cwd: string): Promise<string | null> {
    if (!_llmService || !_currentWebview) {
        console.log('[TerminalManager] LLM 서비스 또는 웹뷰가 설정되지 않음');
        return null;
    }

    try {
        const errorCorrectionPrompt = `다음 명령어가 실행 중 오류가 발생했습니다. 오류를 분석하고 수정된 명령어를 제안해주세요.

실행된 명령어: ${failedCommand}
작업 디렉토리: ${cwd}
오류 출력:
${errorOutput}

수정된 명령어를 JSON 형식으로 응답해주세요:
{
  "correctedCommand": "수정된 명령어",
  "reasoning": "수정 이유",
  "confidence": 0.8
}

만약 명령어를 수정할 수 없다면:
{
  "correctedCommand": null,
  "reasoning": "수정 불가능한 이유",
  "confidence": 0.0
}`;

        console.log('[TerminalManager] LLM에게 오류 수정 요청 전송');

        // LLM 서비스를 통해 응답 받기
        const response = await _llmService.sendMessageForErrorCorrection(errorCorrectionPrompt);

        // JSON 응답 파싱
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const result = JSON.parse(jsonMatch[0]);
            if (result.correctedCommand && result.confidence > 0.5) {
                console.log(`[TerminalManager] LLM 오류 수정 성공: ${result.correctedCommand} (신뢰도: ${result.confidence})`);
                return result.correctedCommand;
            }
        }

        console.log('[TerminalManager] LLM 오류 수정 실패 또는 신뢰도 부족');
        return null;
    } catch (error) {
        console.error('[TerminalManager] LLM 오류 수정 중 예외 발생:', error);
        return null;
    }
}

/**
 * 명령어 실행 오류를 처리하고 수정된 명령어로 재시도합니다.
 */
export async function handleCommandError(
    failedCommand: string,
    errorOutput: string,
    cwd: string,
    onRetry: (correctedCommand: string) => Promise<void>
): Promise<boolean> {
    if (_errorRetryCount >= MAX_ERROR_RETRIES) {
        console.log(`[TerminalManager] 최대 재시도 횟수(${MAX_ERROR_RETRIES}) 초과`);
        _errorRetryCount = 0;
        return false;
    }

    _errorRetryCount++;
    console.log(`[TerminalManager] 오류 수정 시도 ${_errorRetryCount}/${MAX_ERROR_RETRIES}`);

    const correctedCommand = await getCorrectedCommand(failedCommand, errorOutput, cwd);

    if (correctedCommand) {
        console.log(`[TerminalManager] 수정된 명령어로 재시도: ${correctedCommand}`);

        // 웹뷰에 오류 수정 상태 전송
        if (_currentWebview) {
            _currentWebview.postMessage({
                command: 'showErrorCorrection',
                originalCommand: failedCommand,
                correctedCommand: correctedCommand,
                retryCount: _errorRetryCount
            });
        }

        // 수정된 명령어로 재시도
        await onRetry(correctedCommand);
        return true;
    } else {
        console.log('[TerminalManager] 명령어 수정 불가능');
        _errorRetryCount = 0;
        return false;
    }
}

/**
 * 오류 수정 카운터를 초기화합니다.
 */
export function resetErrorRetryCount(): void {
    _errorRetryCount = 0;
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