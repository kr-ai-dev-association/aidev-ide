import * as vscode from 'vscode';
import { runCommandCapture } from '../utils/processRunner';
import { getTerminalMonitor } from '../ai/monitorBridge';

let _codePilotTerminal: vscode.Terminal | undefined;
let _isWaitingForInput = false;
let _pendingCommands: string[] = [];
let _currentCommandIndex = 0;
let _captureOutputChannel: vscode.OutputChannel | undefined;

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
        /^yarn\s+start\b/.test(lower) ||
        /^pnpm\s+start\b/.test(lower) ||
        /\bvite\b/.test(lower) ||
        /react-scripts\s+start/.test(lower) ||
        /next\s+dev/.test(lower)
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
async function handleInteractiveCommand(command: string): Promise<void> {
    const lower = command.toLowerCase();
    const shouldUseTerminal = isInteractiveCommand(lower);

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
        return;
    }

    // 캡처 기반 실행 경로 (표준 출력/에러 수집)
    const channel = getCaptureOutputChannel();
    const cwd = getProjectCwd();
    channel.appendLine(`\n===== Executing: ${command} (${new Date().toLocaleString()}) =====`);

    const isErrorLike = (text: string) => /(npm\s+err!|^error:|^fatal:|\berror\b|\bfail(ed)?\b|\bexception\b|ERROR in|Traceback|panic:|Exit status [1-9]|BUILD FAILED)/i.test(text);

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
    }
    console.log(`[TerminalManager] Executed bash command: ${command}`);
}

/**
 * 명령어 시퀀스를 순차적으로 실행합니다.
 */
async function executeCommandSequence(commands: string[]): Promise<void> {
    _pendingCommands = [...commands];
    _currentCommandIndex = 0;

    while (_currentCommandIndex < _pendingCommands.length) {
        const command = _pendingCommands[_currentCommandIndex];
        await handleInteractiveCommand(command);

        // 대화형 명령어인 경우 더 긴 대기 시간
        if (isInteractiveCommand(command)) {
            await new Promise(resolve => setTimeout(resolve, 5000)); // 5초 대기
        } else {
            await new Promise(resolve => setTimeout(resolve, 2000)); // 2초 대기
        }

        _currentCommandIndex++;
    }

    // 시퀀스 완료 후 상태 초기화
    _pendingCommands = [];
    _currentCommandIndex = 0;
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

    // 명령어들을 순차적으로 실행
    if (executedCommands.length > 0) {
        executeCommandSequence(executedCommands);
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