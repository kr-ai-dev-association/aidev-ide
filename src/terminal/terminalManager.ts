import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
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
const MAX_ERROR_RETRIES = 5;
let _currentWebview: vscode.Webview | undefined = undefined;
let _terminalMonitorService: TerminalMonitorService | undefined = undefined;
let _summarySent = false; // 종합 설명 출력 플래그
let _outputLogEnabled = true; // OUTPUT 로그 활성화 상태
let _userOS = 'unknown'; // 사용자 OS
// 프로젝트 루트는 항상 워크스페이스 루트를 사용하므로 변수로 저장하지 않고 필요할 때마다 가져옵니다.
let _terminalSeq = 0;

/**
 * 사용자 OS를 설정합니다.
 */
export function setUserOS(os: string): void {
    _userOS = os;
    // console.log('[TerminalManager] 사용자 OS 설정:', os);
}

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
    // console.log('[TerminalManager] 터미널 모니터링 서비스 설정 완료');
}

/**
 * 터미널 모니터링 서비스를 가져옵니다.
 */
export function getTerminalMonitorService(): TerminalMonitorService | undefined {
    return _terminalMonitorService;
}

/**
 * OUTPUT 로그 활성화 상태를 설정합니다.
 */
export function setOutputLogEnabled(enabled: boolean): void {
    _outputLogEnabled = enabled;
    if (!enabled && _captureOutputChannel) {
        try {
            _captureOutputChannel.hide();
            _captureOutputChannel.clear();
        } catch (error) {
            // ignore
        }
    }
}



/**
 * aidev-ide 전용 터미널 인스턴스를 가져오거나 새로 생성합니다.
 * @param projectRoot 프로젝트 루트 경로 (선택사항)
 * @param alwaysNew 항상 새로운 터미널을 생성할지 여부 (기본값: true)
 */
export function getAidevIdeTerminal(projectRoot?: string, alwaysNew: boolean = true): vscode.Terminal {
    if (alwaysNew) {
        const name = `aidev-ide Terminal ${++_terminalSeq}`;
        console.log(`[TerminalManager] 새로운 터미널 생성: ${name}`);
        const terminalOptions: vscode.TerminalOptions = { name };
        if (projectRoot) {
            terminalOptions.cwd = projectRoot;
            console.log(`[TerminalManager] 터미널 작업 디렉토리 설정: ${projectRoot}`);
        }
        const term = vscode.window.createTerminal(terminalOptions);
        const disposable = vscode.window.onDidCloseTerminal(event => {
            if (event === term) {
                console.log(`[TerminalManager] 터미널 종료 감지: ${name}`);
                disposable.dispose();
            }
        });
        return term;
    }

    // 기존 동작 (재사용) 경로
    // 기존 동일 이름 터미널 재사용 및 중복 정리
    const existing = vscode.window.terminals.filter(t => t.name === 'aidev-ide Terminal');
    if (existing.length > 0) {
        console.log(`[TerminalManager] 기존 터미널 재사용: ${existing.length}개 발견, 첫 번째 터미널 사용`);
        _codePilotTerminal = existing[0];
        // 나머지 중복 터미널 정리
        for (let i = 1; i < existing.length; i++) {
            try {
                console.log(`[TerminalManager] 중복 터미널 정리: ${existing[i].name} dispose`);
                existing[i].dispose();
            } catch { }
        }
    }

    if (!_codePilotTerminal || _codePilotTerminal.exitStatus !== undefined) {
        console.log(`[TerminalManager] 새로운 터미널 생성: aidev-ide Terminal`);
        const terminalOptions: vscode.TerminalOptions = { name: 'aidev-ide Terminal' };

        // 프로젝트 루트 경로가 제공된 경우 설정
        if (projectRoot) {
            terminalOptions.cwd = projectRoot;
            console.log(`[TerminalManager] 터미널 작업 디렉토리 설정: ${projectRoot}`);
        }

        _codePilotTerminal = vscode.window.createTerminal(terminalOptions);
        const disposable = vscode.window.onDidCloseTerminal(event => {
            if (event === _codePilotTerminal) {
                console.log(`[TerminalManager] 터미널 종료 감지: aidev-ide Terminal`);
                _codePilotTerminal = undefined;
                disposable.dispose();
            }
        });
    } else {
        console.log(`[TerminalManager] 기존 터미널 사용: aidev-ide Terminal (exitStatus: ${_codePilotTerminal.exitStatus})`);
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
    // ConfigurationService.getProjectRoot()는 항상 워크스페이스 루트만 반환합니다.
    try {
        const workspaceRoot = await _configService.getProjectRoot();
        if (workspaceRoot) {
            return workspaceRoot;
        }
    } catch (error) {
        console.warn('[TerminalManager] getProjectRoot 실패:', error);
    }
    // 워크스페이스 루트를 직접 가져오기
    return getProjectCwd();
}

function getCaptureOutputChannel(): vscode.OutputChannel {
    if (!_outputLogEnabled) {
        // OUTPUT 로그가 비활성화된 경우 더미 채널 반환
        return {
            name: 'AIDEV-IDE Terminal (Disabled)',
            append: () => { },
            appendLine: () => { },
            clear: () => { },
            show: () => { },
            hide: () => { },
            dispose: () => { },
            replace: () => { }
        } as unknown as vscode.OutputChannel;
    }

    if (!_captureOutputChannel) {
        _captureOutputChannel = vscode.window.createOutputChannel('AIDEV-IDE Terminal');
    }
    return _captureOutputChannel;
}



function sanitizeOutput(text: string): string {
    if (!text) return text;

    // VS Code 터미널 출력 디코딩 (Windows에서 CP949 처리)
    let decoded = decodeTerminalOutput(text);

    // Strip ANSI escape sequences and control codes
    const ansiPattern = /[\u001B\u009B][[\]()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0-4})*)?[0-9A-ORZcf-nqry=><]/g;
    return decoded.replace(/\r/g, '\n').replace(ansiPattern, '').replace(/\u0007/g, '').replace(/\u0008/g, '').trimEnd();
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

/**
 * OS별 명령어 전처리 및 정규화 함수
 * - Windows/PowerShell: && 같은 특수 문자 자동 제거
 * - 인코딩 문제 예방
 * - 경로 정규화
 */
function normalizeCommandForOS(command: string): string {
    if (!command || !command.trim()) return command;

    let normalized = command.trim();
    const isWindows = process.platform === 'win32';
    const userOS = _userOS.toLowerCase();
    const isPowerShellEnv = isWindows && (userOS.includes('windows') || userOS === 'win32');

    // Windows/PowerShell 환경 전처리
    if (isPowerShellEnv) {
        // 1. cmd.exe 호출 외부의 && 제거
        if (/cmd\.exe\s*\/d\s*\/c/i.test(normalized)) {
            // 따옴표 안의 &&는 보존, 밖의 &&만 제거
            // 복잡한 경우를 처리하기 위해 따옴표 상태 추적
            let inQuotes = false;
            let quoteChar = '';
            let result = '';
            let i = 0;

            while (i < normalized.length) {
                const char = normalized[i];
                const nextTwo = normalized.substring(i, i + 3);

                // 따옴표 상태 변경 감지
                if (!inQuotes && (char === '"' || char === "'")) {
                    inQuotes = true;
                    quoteChar = char;
                    result += char;
                    i++;
                    continue;
                }

                if (inQuotes && char === quoteChar) {
                    inQuotes = false;
                    quoteChar = '';
                    result += char;
                    i++;
                    continue;
                }

                // 따옴표 밖에서 && 패턴 발견 시 제거
                if (!inQuotes && nextTwo === ' &&') {
                    // 뒤의 공백까지 건너뛰기
                    i += 3;
                    // 다음 명령 시작까지 건너뛰기 (공백 제거)
                    while (i < normalized.length && normalized[i] === ' ') i++;
                    // && 이후 모든 내용 제거
                    break;
                }

                result += char;
                i++;
            }

            if (result !== normalized) {
                normalized = result;
                console.log('[TerminalManager] PowerShell && 제거: 명령 전처리됨');
            }
        }

        // 2. 경로 정규화 (공백이 없으면 따옴표 제거)
        // cmd.exe /d /c "경로" 형식에서 경로에 공백이 없으면 따옴표 제거
        normalized = normalized.replace(/cmd\.exe\s*\/d\s*\/c\s*"([^"\s&]+)"/gi, (match, path) => {
            // 경로에 공백이나 &가 없으면 따옴표 제거
            if (!/\s/.test(path) && !/&/.test(path)) {
                return `cmd.exe /d /c ${path}`;
            }
            return match;
        });
    }

    // Unix 계열 환경 전처리
    if (!isWindows) {
        // 경로 슬래시 정규화 (이미 슬래시 사용)
        // 백슬래시를 슬래시로 변환 (Windows 경로 혼용 방지)
        normalized = normalized.replace(/\\/g, '/');
    }

    return normalized;
}

/**
 * VS Code 터미널 출력 디코딩 함수
 * Windows에서 cmd.exe 출력은 CP949일 수 있으므로 올바르게 디코딩
 */
function decodeTerminalOutput(text: string, isWindows: boolean = process.platform === 'win32'): string {
    if (!text || !isWindows) return text;

    // 깨진 문자 패턴 감지
    const brokenCharPattern = /[?][가-힣]|[가-힣][?]|[?][가-힣][?]|[ʾҽϴ]/;
    if (brokenCharPattern.test(text)) {
        try {
            // CP949로 재디코딩 시도
            const iconv = require('iconv-lite');
            // 현재 텍스트를 바이너리 버퍼로 변환 후 CP949로 디코딩
            const buffer = Buffer.from(text, 'binary');
            const decoded = iconv.decode(buffer, 'cp949');
            // 디코딩 결과가 더 나은지 확인 (깨진 문자 수 비교)
            const originalBroken = (text.match(/[?]/g) || []).length;
            const decodedBroken = (decoded.match(/[?]/g) || []).length;
            if (decodedBroken < originalBroken) {
                return decoded;
            }
        } catch (e) {
            // iconv-lite가 없거나 변환 실패 시 원본 유지
            console.warn('[TerminalManager] CP949 디코딩 실패:', e);
        }
    }

    return text;
}

async function handleInteractiveCommand(command: string, projectRoot?: string): Promise<boolean> {
    // 명령어 실행 중지 상태 확인
    if ((globalThis as any).terminalMonitorService && (globalThis as any).terminalMonitorService.isExecutionStopped()) {
        console.log('[TerminalManager] 명령어 실행이 중지되었습니다:', command);
        return false;
    }

    // OS별 명령어 전처리 및 정규화
    command = normalizeCommandForOS(command);

    const lower = command.toLowerCase();
    const isDevLong = isLongRunningDevCommand(lower);
    let shouldUseTerminal = isInteractiveCommand(lower); // dev 서버 등 비대화형 장기 실행은 데몬 사용

    const selectShellForCapture = (cmd: string): string | undefined => {
        const c = cmd.trim();
        // Force PowerShell for PowerShell-style invocations
        if (/^(powershell|pwsh)\b/i.test(c) || /-encodedcommand\b/i.test(c)) return process.platform === 'win32' ? 'powershell.exe' : undefined;
        // Force CMD for explicit cmd.exe invocations
        if (/^cmd\.exe\b/i.test(c) || /^cmd\b/i.test(c)) return process.platform === 'win32' ? 'cmd.exe' : undefined;
        // Default: on Windows prefer PowerShell for better Unicode handling
        if (process.platform === 'win32') return 'powershell.exe';
        return undefined;
    };

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

    // 명령어에서 cd 부분 제거 (이미 처리됨)
    let cleanCommand = command;
    if (command.toLowerCase().trim().startsWith('cd ')) {
        const andIndex = command.indexOf('&&');
        if (andIndex !== -1) {
            cleanCommand = command.substring(andIndex + 2).trim();
        } else {
            // cd 명령어만 있는 경우
            cleanCommand = '';
        }
    }

    // cd 명령어만 있는 경우 처리
    if (cleanCommand === '') {
        console.log(`[TerminalManager] cd 명령어만 실행됨: ${command}`);
        return true;
    }

    if (shouldUseTerminal) {
        const channel = getCaptureOutputChannel();
        channel.appendLine(`\n===== Executing in VS Code Terminal: ${cleanCommand} (${new Date().toLocaleString()}) =====`);
        channel.appendLine(`CWD: ${cwd || '(not set)'}`);
        channel.appendLine(`Command: ${cleanCommand}`);
        channel.appendLine(`Working Directory: ${cwd || '(not set)'}`);

        const terminal = getAidevIdeTerminal(projectRoot, true);
        if (!terminal.state.isInteractedWith) {
            terminal.show();
        }
        terminal.sendText(cleanCommand);

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
        channel.appendLine(`Command: ${cleanCommand}`);
        channel.appendLine(`Working Directory: ${cwd || '(not set)'}`);
        // console.log(`[TerminalManager] Executed bash command: ${command}`);
        return true;
    }

    // 기본 경로: terminal-daemon 경유 실행 (비대화형)
    const channel = getCaptureOutputChannel();

    // OS별 명령어 전처리
    const normalizedCommand = normalizeCommandForOS(cleanCommand);

    channel.appendLine(`\n===== Executing: ${normalizedCommand} (${new Date().toLocaleString()}) =====`);
    channel.appendLine(`CWD: ${cwd || '(not set)'}`);
    channel.appendLine(`Command: ${normalizedCommand}`);
    channel.appendLine(`Working Directory: ${cwd || '(not set)'}`);

    const isErrorLike = (text: string) => {
        // 기본 오류 패턴
        const basicErrorPattern = /(npm\s+err!|^error:|^fatal:|\berror\b|\bfail(ed)?\b|\bexception\b|ERROR in|Traceback|panic:|Exit status [1-9]|BUILD FAILED|Missing script:)/i;

        // 배치 스크립트 특화 오류 패턴
        // - 깨진 문자나 인코딩 오류 (일반적으로 한글이 깨져서 나타남)
        // - '앰퍼샌드' 또는 '&' 관련 오류
        // - 배치 변수 관련 오류
        const batchErrorPattern = /(앰퍼샌드|&.*사용할 수 없습니다|&.*예약|%.*%.*ʾҽ|%[^%]*%.*오류|batch.*error|cmd.*error|syntax.*error)/i;

        // PowerShell 파서 오류 패턴
        // - "토큰은 이 버전에서 올바른 문 구분 기호가 아닙니다"
        // - "InvalidEndOfLine", "ParserError"
        // - "CategoryInfo", "FullyQualifiedErrorId"
        // - "&&" 같은 PowerShell 5.1에서 지원하지 않는 연산자
        const powershellParserPattern = /(ParserError|InvalidEndOfLine|토큰.*올바른.*문 구분 기호|CategoryInfo|FullyQualifiedErrorId|&&.*토큰|&&.*이 버전)/i;

        // 인코딩 오류 감지 (깨진 한글 문자 패턴)
        // - ?가 포함된 명령어 (예: ?echo, ?행, ?류 등)
        // - 특수 문자 패턴으로 깨진 문자
        const encodingErrorPattern = /([ʾҽϴ]+|\\?[?][가-힣]|[가-힣][?]|[?][가-힣][?]|파일 이름.*구문|디렉터리 이름.*구문|볼륨 레이블.*구문)/i;

        // 파일 이름 구문 오류 감지
        const fileSyntaxErrorPattern = /(파일 이름.*구문|디렉터리 이름.*구문|볼륨 레이블.*구문|The filename.*syntax|The directory name.*syntax)/i;

        return basicErrorPattern.test(text) ||
            batchErrorPattern.test(text) ||
            powershellParserPattern.test(text) ||
            encodingErrorPattern.test(text) ||
            fileSyntaxErrorPattern.test(text);
    };

    let stderrAgg = '';
    let stdoutAgg = '';

    try {
        const id = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        // Normalize PowerShell -EncodedCommand into -Command with decoded script to avoid CLIXML and cmdlet-not-found
        cleanCommand = normalizeEncodedPowerShellCommand(cleanCommand);

        // OS별 명령어 전처리 및 정규화 (&& 제거, 경로 정규화 등)
        const finalCommand = normalizeCommandForOS(cleanCommand);

        console.log(`[TerminalManager] Starting via VS Code terminal. id=${id}, cwd=${cwd || '(not set)'}, cmd="${finalCommand}"`);
        channel.appendLine(`[DEBUG] Executing command in VS Code terminal: ${finalCommand}`);
        channel.appendLine(`[DEBUG] Working directory: ${cwd || '(not set)'}`);

        // 원본 명령과 다르면 로그 출력
        if (finalCommand !== cleanCommand) {
            console.log(`[TerminalManager] 명령 전처리됨: ${cleanCommand.substring(0, 100)}... → ${finalCommand.substring(0, 100)}...`);
            channel.appendLine(`[DEBUG] Command normalized: && removed or path normalized`);
        }

        // VS Code 터미널을 사용하여 명령어 실행
        const terminal = getAidevIdeTerminal(projectRoot, true);

        // 터미널 모니터링 서비스에 명령어 저장 (전처리된 명령 저장)
        if (_terminalMonitorService) {
            console.log(`[TerminalManager] 명령어 저장: ${terminal.name} - ${finalCommand}`);
            _terminalMonitorService.storeRecentCommand(terminal.name, finalCommand);
            console.log(`[TerminalManager] 명령어 저장 완료`);
        } else {
            console.log(`[TerminalManager] 터미널 모니터링 서비스가 설정되지 않음`);
        }

        // 작업 디렉토리 설정
        if (cwd) {
            terminal.sendText(`cd "${cwd}"`);
        }

        // 명령어 실행 (전처리된 명령 사용)
        terminal.sendText(finalCommand);

        // 터미널을 보여주고 포커스
        terminal.show(true);

        // VS Code 터미널에서는 직접적인 출력 캡처가 어려우므로
        // processRunner를 사용하여 출력을 캡처
        // 전처리된 명령 사용
        const runPromise = runCommandCapture(
            finalCommand, // 전처리된 명령 사용
            { cwd, shell: selectShellForCapture(finalCommand) || true },
            // stdout 콜백 (디코딩 적용)
            (data: string) => {
                const decoded = decodeTerminalOutput(data);
                if (_terminalMonitorService) {
                    _terminalMonitorService.ingestExternalOutput(`terminal:${terminal.name}:stdout`, decoded);
                }
            },
            // stderr 콜백 (디코딩 적용)
            (data: string) => {
                const decoded = decodeTerminalOutput(data);
                if (_terminalMonitorService) {
                    _terminalMonitorService.ingestExternalOutput(`terminal:${terminal.name}:stderr`, decoded);
                }
            }
        );

        if (isDevLong) {
            // 장기 실행은 즉시 반환하여 큐를 일시정지하도록 함 (processQueue에서 처리)
            runPromise.then(async (res) => {
                if (res.code !== 0) {
                    const msg = `Exit status ${res.code}: ${cleanCommand}`;
                    channel.appendLine(`----- Long-running Command Failed -----`);
                    channel.appendLine(`Command: ${cleanCommand}`);
                    channel.appendLine(`Exit code: ${res.code}`);
                    channel.appendLine(`Working Directory: ${cwd || '(not set)'}`);
                    if (res.stderr) {
                        // stderr 디코딩 적용
                        const decodedStderr = decodeTerminalOutput(res.stderr);
                        channel.appendLine(`Stderr: ${decodedStderr}`);
                    }
                    try { getTerminalMonitor()?.ingestExternalOutput('stderr', msg); } catch { }
                    channel.show(true);

                    // Long-running 명령어에서도 오류 수정 시도
                    const errorOutput = `Exit code: ${res.code}\nStderr: ${res.stderr || ''}\nStdout: ${res.stdout || ''}`;
                    const retrySuccess = await handleCommandError(
                        cleanCommand,
                        errorOutput,
                        cwd || '',
                        async (correctedCommand: string) => {
                            // 수정된 명령어로 재시도
                            channel.appendLine(`\n===== Retrying with corrected command: ${correctedCommand} =====`);
                            await handleInteractiveCommand(correctedCommand);
                        }
                    );

                    if (!retrySuccess) {
                        vscode.window.showErrorMessage(`aidev-ide: Long-running 명령 실패 (${cleanCommand})`);
                    }
                } else {
                    channel.appendLine(`----- Long-running Command Completed -----`);
                    channel.appendLine(`Command: ${cleanCommand}`);
                    channel.appendLine(`Exit code: ${res.code}`);
                    channel.appendLine(`Working Directory: ${cwd || '(not set)'}`);
                    if (res.stdout) {
                        channel.appendLine(`Output: ${res.stdout}`);
                    }
                    try { getTerminalMonitor()?.ingestExternalOutput('stdout', `Process exited (code ${res.code}): ${cleanCommand}`); } catch { }
                }
            }).catch(async (err) => {
                channel.appendLine(`----- Long-running Command Error -----`);
                channel.appendLine(`Command: ${cleanCommand}`);
                channel.appendLine(`Error: ${err?.message || String(err)}`);
                channel.appendLine(`Working Directory: ${cwd || '(not set)'}`);
                try { getTerminalMonitor()?.ingestExternalOutput('stderr', `Process error: ${err?.message || String(err)}`); } catch { }

                // Long-running 명령어에서도 오류 수정 시도
                const errorOutput = `Process error: ${err?.message || String(err)}`;
                const retrySuccess = await handleCommandError(
                    cleanCommand,
                    errorOutput,
                    cwd || '',
                    async (correctedCommand: string) => {
                        // 수정된 명령어로 재시도
                        channel.appendLine(`\n===== Retrying with corrected command: ${correctedCommand} =====`);
                        await handleInteractiveCommand(correctedCommand);
                    }
                );

                if (!retrySuccess) {
                    vscode.window.showErrorMessage(`aidev-ide: Long-running 명령 오류 (${cleanCommand})`);
                }
            });
            channel.appendLine(`----- Long-running Command Started -----`);
            channel.appendLine(`Command: ${cleanCommand}`);
            channel.appendLine(`Working Directory: ${cwd || '(not set)'}`);
            console.log(`[TerminalManager] Started long-running via VS Code terminal: ${cleanCommand}`);
            try { channel.show(true); } catch { }
            return true;
        }

        const result = await runPromise;

        if (result.code !== 0 || isErrorLike(result.stderr || '')) {
            channel.appendLine(`----- Command Failed -----`);
            channel.appendLine(`Command: ${finalCommand}`);
            channel.appendLine(`Exit code: ${result.code}`);
            channel.appendLine(`Working Directory: ${cwd || '(not set)'}`);
            if (result.stderr) {
                // stderr 디코딩 적용
                const decodedStderr = decodeTerminalOutput(result.stderr);
                channel.appendLine(`Stderr: ${decodedStderr}`);
            }
            try {
                getTerminalMonitor()?.ingestExternalOutput('stderr', `Command failed (exit ${result.code}): ${cleanCommand}`);
                getTerminalMonitor()?.ingestExternalOutput('stderr', `Exit status ${result.code}`);
            } catch { }
            channel.show(true);

            // 오류 수정 시도
            const errorOutput = `Exit code: ${result.code}\nStderr: ${result.stderr || ''}\nStdout: ${result.stdout || ''}`;
            const retrySuccess = await handleCommandError(
                cleanCommand,
                errorOutput,
                cwd || '',
                async (correctedCommand: string) => {
                    // 수정된 명령어로 재시도
                    channel.appendLine(`\n===== Retrying with corrected command: ${correctedCommand} =====`);
                    await handleInteractiveCommand(correctedCommand);
                }
            );

            if (!retrySuccess) {
                vscode.window.showErrorMessage(`aidev-ide: 명령 실패 (${cleanCommand})`);
                return false;
            }

            return true;
        }

        channel.appendLine(`----- Command Completed Successfully -----`);
        channel.appendLine(`Command: ${cleanCommand}`);
        channel.appendLine(`Exit code: ${result.code}`);
        channel.appendLine(`Working Directory: ${cwd || '(not set)'}`);
        if (result.stdout) {
            channel.appendLine(`Output: ${result.stdout}`);
        }
        console.log(`[TerminalManager] Executed via VS Code terminal: ${cleanCommand}`);
        return true;
    } catch (e: any) {
        // VS Code 터미널 실행 실패 시 캡처 기반으로 폴백
        channel.appendLine(`[WARN] VS Code 터미널 실행 실패, 로컬 실행으로 폴백: ${e?.message || e}`);
        channel.appendLine(`[ERROR] Execution error details: ${JSON.stringify(e)}`);
        console.error(`[TerminalManager] VS Code terminal execution failed:`, e);
        const result = await runCommandCapture(
            normalizeEncodedPowerShellCommand(cleanCommand),
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
            vscode.window.showErrorMessage(`aidev-ide: 명력 실패 (${cleanCommand})`);
            try { getTerminalMonitor()?.ingestExternalOutput('stderr', `Command failed (exit ${result.code}): ${cleanCommand}`); } catch { }
            return false;
        }
        console.log(`[TerminalManager] Executed locally (fallback): ${cleanCommand}`);
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
                    try {
                        getCaptureOutputChannel().appendLine(`[QUEUE] stop: file-op failed`);
                    } catch { }
                    break;
                }
            } else {
                // 항상 워크스페이스 루트를 사용
                const projectRoot = await getEffectiveCwd();
                const ok = await handleInteractiveCommand(command, projectRoot);
                if (!ok) {
                    // 실패 시 즉시 중단 (대기열은 유지)
                    try {
                        getCaptureOutputChannel().appendLine(`[QUEUE] stop: command failed or cancelled`);
                    } catch { }
                    break;
                }
            }

            // 장기 실행(dev server 등) 명령이면 큐를 일시 정지 (사용자 종료 시 재개 가능)
            if (isLongRunningDevCommand(command)) {
                _queuePausedForLongRunning = true;
                // 장기 실행 중에는 즉시 루프를 종료하여 중복 실행 방지
                try {
                    getCaptureOutputChannel().appendLine(`[QUEUE] paused for long-running command`);
                } catch { }
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

export function enqueueCommandsBatch(commands: string[], priority = false, projectRoot?: string): void {
    // projectRoot 파라미터는 이전 버전 호환성을 위해 유지하지만 실제로는 사용하지 않습니다.
    // 항상 워크스페이스 루트를 사용합니다.

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
            if (bash.length > 20) {
                channel.appendLine(`  ... (+${bash.length - 20} more)`);
            }
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

function mergeBashBlockToSingleCommand(bashCode: string): string {
    const lines = bashCode.split('\n');
    let buffer: string[] = [];
    let ifDepth = 0;

    const pushLine = (l: string) => {
        const clean = removeInlineComment(l.trim());
        if (!clean || clean.startsWith('#')) return;
        if (/^exit(\s+\d+)?$/i.test(clean)) return;
        if (/^echo\s*"?"?$/i.test(clean)) return;
        buffer.push(clean);
    };

    for (let raw of lines) {
        const line = removeInlineComment(raw.trim());
        if (!line || line.startsWith('#')) continue;
        if (/^(then|fi|else|elif\b)/.test(line) && ifDepth === 0) {
            continue;
        }
        const startsIf = /^(if\b|if\s*\[|if\s*\[\[|if\s+test\b)/.test(line);
        const endsWithThen = /;\s*then\s*$/.test(line) || /\bthen\b\s*$/.test(line);
        if (startsIf) {
            ifDepth += 1;
            let normalized = line;
            if (!endsWithThen) normalized = line.replace(/;?\s*$/, ' ; then');
            pushLine(normalized);
            continue;
        }
        if (ifDepth > 0 && /^(elif\b|else\b)/.test(line)) {
            pushLine(line);
            continue;
        }
        if (/^fi\b/.test(line)) {
            ifDepth = Math.max(0, ifDepth - 1);
            pushLine('fi');
            continue;
        }
        pushLine(line);
    }

    return buffer.join('; ');
}

export function extractBashCommandsFromLlmResponse(llmResponse: string): string[] {
    const commands: string[] = [];
    const bashBlockRegex = /```bash\s*\n([\s\S]*?)\n```/g;
    const pwshBlockRegex = /```(?:powershell|pwsh)\s*\n([\s\S]*?)\n```/g;
    const cmdBlockRegex = /```(?:cmd|batch|bat)\s*\n([\s\S]*?)\n```/g;
    let match;
    while ((match = bashBlockRegex.exec(llmResponse)) !== null) {
        const block = match[1].trim();
        if (!block) continue;
        const lines = block.split('\n');
        let buffer: string[] = [];
        let ifDepth = 0;
        const flushBufferIfDone = () => {
            if (ifDepth === 0 && buffer.length > 0) {
                // join with '; ' and push as single command
                const joined = buffer
                    .map(l => removeInlineComment(l.trim()))
                    .filter(l => !!l && !/^exit(\s+\d+)?$/i.test(l) && !/^echo\s*"?"?$/i.test(l))
                    .join('; ')
                    .trim();
                if (joined) {
                    commands.push(joined);
                }
                buffer = [];
            }
        };

        for (let raw of lines) {
            const line = removeInlineComment(raw.trim());
            if (!line || line.startsWith('#')) continue;

            // Skip standalone control tokens that break shells when isolated
            if (/^(then|fi|else|elif\b)/.test(line) && ifDepth === 0) {
                // ignore stray control tokens
                continue;
            }

            // Detect start of if-block (common forms)
            const startsIf = /^(if\b|if\s*\[|if\s+test\b)/.test(line);
            const endsWithThen = /;\s*then\s*$/.test(line) || /\bthen\b\s*$/.test(line);

            if (startsIf) {
                ifDepth += 1;
                // ensure 'then' present in same line for one-liner semantics; if not, add ' then'
                let normalized = line;
                if (!endsWithThen) {
                    normalized = line.replace(/;?\s*$/, ' ; then');
                }
                buffer.push(normalized);
                continue;
            }

            // elif/else within if-block
            if (ifDepth > 0 && /^(elif\b|else\b)/.test(line)) {
                buffer.push(line);
                continue;
            }

            // fi closes one level
            if (/^fi\b/.test(line)) {
                ifDepth = Math.max(0, ifDepth - 1);
                buffer.push('fi');
                flushBufferIfDone();
                continue;
            }

            // Inside if-block: collect lines
            if (ifDepth > 0) {
                // Drop hard exits inside the block
                if (/^exit(\s+\d+)?$/i.test(line)) {
                    continue;
                }
                buffer.push(line);
                continue;
            }

            // Outside if-block: standalone command
            if (line && !/^exit(\s+\d+)?$/i.test(line) && !/^echo\s*"?"?$/i.test(line)) {
                commands.push(line);
            }
        }

        // Flush any dangling buffer (defensive)
        flushBufferIfDone();
    }

    // Powershell: join lines then execute via -EncodedCommand (UTF-16LE Base64) to avoid parsing issues
    while ((match = pwshBlockRegex.exec(llmResponse)) !== null) {
        const block = (match[1] || '').trim();
        if (!block) continue;
        // Prepend encoding and formatting prologue to avoid mojibake and CLIXML/progress artifacts
        const prologue = [
            "$ProgressPreference='SilentlyContinue'",
            "$WarningPreference='Continue'",
            "$InformationPreference='Continue'",
            "$ErrorActionPreference='Continue'",
            "$ErrorView='NormalView'",
            "$PSModuleAutoLoadingPreference='None'",
            "try{ $PSStyle.OutputRendering='PlainText' } catch { }",
            "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8",
            "[Console]::InputEncoding=[System.Text.Encoding]::UTF8",
            "$OutputEncoding=[System.Text.Encoding]::UTF8",
        ].join('; ');

        // Virtualenv helper: set VENV_DIR to existing '.venv' or 'venv' in CWD
        const venvHelper = [
            "$Env:VENV_DIR = $null",
            "foreach($name in @('.venv','venv')) { if (Test-Path -Path ('.\\' + $name)) { $Env:VENV_DIR = ('.\\' + $name); break } }"
        ].join('; ');

        // Normalize activation script paths to use $Env:VENV_DIR when block references a hard-coded venv path
        let normalizedPs = block
            .replace(/\.\\(?:\.venv|venv)\\Scripts\\Activate\.ps1/g, '$Env:VENV_DIR\\Scripts\\Activate.ps1')
            .replace(/"\.\\(?:\.venv|venv)\\Scripts\\Activate\.ps1"/g, '"$Env:VENV_DIR\\Scripts\\Activate.ps1"')
            .replace(/'\.\\(?:\.venv|venv)\\Scripts\\Activate\.ps1'/g, "'$Env:VENV_DIR\\Scripts\\Activate.ps1'");

        const joined = [prologue, venvHelper, normalizedPs.split('\n').map(l => l.trim()).filter(Boolean).join('; ')].join('; ');
        if (joined) {
            try {
                const utf16le = Buffer.from(joined, 'utf16le');
                const b64 = utf16le.toString('base64');
                commands.push(`powershell -NoLogo -NonInteractive -NoProfile -ExecutionPolicy Bypass -OutputFormat Text -EncodedCommand ${b64}`);
            } catch {
                // fallback to direct execution if encoding fails
                commands.push(`powershell -NoLogo -NonInteractive -NoProfile -ExecutionPolicy Bypass -OutputFormat Text -Command \"${joined.replace(/\"/g, '\\\"')}\"`);
            }
        }
    }

    // CMD: join lines with ' & '
    while ((match = cmdBlockRegex.exec(llmResponse)) !== null) {
        const block = (match[1] || '').trim();
        if (!block) continue;

        // 복잡한 배치 스크립트 감지
        // 다음 조건 중 하나라도 만족하면 복잡한 스크립트로 간주:
        // 1. 길이가 500자 이상
        // 2. %변수% 패턴이 3개 이상 포함
        // 3. if/for/goto 같은 제어 구조가 포함
        // 4. setlocal/endlocal 같은 환경 설정 명령 포함
        const isComplexScript = block.length > 500 ||
            (block.match(/%[^%]+%/g) || []).length >= 3 ||
            /\b(if|for|goto|setlocal|endlocal|call)\b/i.test(block);

        if (isComplexScript && process.platform === 'win32') {
            // 복잡한 배치 스크립트는 임시 파일로 저장하여 실행
            // 이렇게 하면 PowerShell 파싱 문제를 완전히 회피할 수 있음
            try {
                const tempDir = os.tmpdir();
                const tempBatPath = path.join(tempDir, `aidev-ide-${Date.now()}-${Math.random().toString(36).slice(2, 9)}.bat`);

                // 배치 파일 작성 (UTF-8 without BOM 사용)
                // Windows 배치 파일은 기본적으로 CP949를 사용하지만, UTF-8도 지원됨
                // 하지만 BOM은 cmd.exe에서 문제를 일으킬 수 있으므로 BOM 없이 UTF-8 사용
                // 한글이 포함된 경우에도 대부분의 경우 정상 작동
                fs.writeFileSync(tempBatPath, block, 'utf8');

                // 임시 파일 실행 후 자동 정리 명령
                // PowerShell에서 && 사용 불가하므로 배치 파일 내부에서 삭제 처리
                // 경로에 공백이 없으면 따옴표 없이 사용 (더 안전함)
                // 삭제 명령은 배치 파일 실행 후 별도로 처리하거나 배치 파일 끝에 추가

                // 경로에 공백이 있는지 확인
                const hasSpaces = tempBatPath.includes(' ');

                // 배치 파일 끝에 자동 삭제 명령 추가
                // 배치 파일 내에서 자신을 삭제하려면 배치 파일 경로를 변수로 저장해야 함
                // 하지만 더 간단하게는 배치 파일 실행 후 PowerShell에서 삭제하거나
                // 배치 파일이 끝나면 자동으로 정리되도록 별도 프로세스로 처리
                // 여기서는 일단 배치 파일만 저장하고, 삭제는 나중에 처리
                fs.writeFileSync(tempBatPath, block, 'utf8');

                // 경로만 사용 (공백이 없으면 따옴표 불필요)
                // PowerShell에서 && 사용 불가하므로 별도 명령으로 삭제 처리
                if (hasSpaces) {
                    const escapedPath = tempBatPath.replace(/"/g, '""');
                    commands.push(`cmd.exe /d /c "${escapedPath}"`);
                } else {
                    commands.push(`cmd.exe /d /c ${tempBatPath}`);
                }

                // 실행 후 별도 명령으로 임시 파일 삭제 (PowerShell의 ; 사용)
                // 배치 파일 실행이 완료된 후에만 삭제되도록 지연
                setTimeout(() => {
                    try {
                        if (fs.existsSync(tempBatPath)) {
                            fs.unlinkSync(tempBatPath);
                            console.log(`[TerminalManager] 임시 배치 파일 삭제 완료: ${tempBatPath}`);
                        }
                    } catch (cleanupError) {
                        console.warn(`[TerminalManager] 임시 파일 삭제 실패: ${tempBatPath}`, cleanupError);
                    }
                }, 5000); // 5초 후 삭제

                console.log(`[TerminalManager] 복잡한 배치 스크립트를 임시 파일로 저장: ${tempBatPath}`);
            } catch (error) {
                console.warn('[TerminalManager] 임시 배치 파일 생성 실패, 인라인 실행으로 폴백:', error);
                // 폴백: 기존 방식으로 실행
                const joined = block
                    .split('\n')
                    .map(l => l.trim())
                    .filter(l => !!l && !/^::/.test(l) && !/^REM\b/i.test(l))
                    .join(' & ');
                if (joined) {
                    const escaped = joined.replace(/"/g, '""');
                    commands.push(`cmd.exe /d /c "${escaped}"`);
                }
            }
        } else {
            // 간단한 배치 스크립트는 인라인으로 실행
            const joined = block
                .split('\n')
                .map(l => l.trim())
                // drop CMD comments like ':: ...' or 'REM ...'
                .filter(l => !!l && !/^::/.test(l) && !/^REM\b/i.test(l))
                .join(' & ');
            if (joined) {
                // Escape double quotes using cmd.exe style ("" for each ") to prevent PowerShell from parsing '&' and '()'
                // This ensures cmd.exe receives the entire command string without PowerShell interference
                // PowerShell will remove the outer quotes and pass the inner content to cmd.exe
                // cmd.exe interprets "" as a single " in quoted strings
                const escaped = joined.replace(/"/g, '""');
                // Wrap entire command in quotes when running from PowerShell to prevent special character parsing
                commands.push(`cmd.exe /d /c "${escaped}"`);
            }
        }
    }
    return commands;
}

/**
 * LLM 응답에서 bash 명령어를 추출하고 터미널에서 실행합니다.
 * projectRoot 파라미터는 이전 버전 호환성을 위해 유지하지만 실제로는 사용하지 않습니다.
 * 항상 워크스페이스 루트를 사용합니다.
 */
export function executeBashCommandsFromLlmResponse(llmResponse: string, projectRoot?: string): string[] {
    const executedCommands: string[] = extractBashCommandsFromLlmResponse(llmResponse);
    if (executedCommands.length > 0) {
        resetWorkingDirectory();
        // 항상 워크스페이스 루트를 사용하므로 projectRoot 파라미터는 무시됩니다.
        enqueueCommandsBatch(executedCommands, true);
    }
    return executedCommands;
}

/**
 * 단일 bash 명령어를 터미널에서 실행합니다.
 * @param command 실행할 명령어
 * @param projectRoot 프로젝트 루트 경로 (선택사항)
 */
export function executeBashCommand(command: string, projectRoot?: string): void {
    handleInteractiveCommand(command, projectRoot);
}

/**
 * LLM 응답에서 bash 명령어가 포함되어 있는지 확인합니다.
 */
export function hasBashCommands(llmResponse: string): boolean {
    const anyShellRegex = /```(?:bash|sh|shell|powershell|pwsh|cmd|batch|bat)\s*\n([\s\S]*?)\n```/g;
    return anyShellRegex.test(llmResponse);
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
        // Check if this failed command has a corrupted PowerShell script stored
        const cmdHash = Buffer.from(failedCommand).toString('base64').substring(0, 32);
        const corruptedScript = _corruptedPowerShellScripts.get(cmdHash);
        if (corruptedScript) {
            console.log('[TerminalManager] 손상된 PowerShell 스크립트 감지, LLM에게 복구 요청');
            const repaired = await repairCorruptedPowerShellScript(corruptedScript.decoded, errorOutput);
            if (repaired) {
                // Remove from map after successful repair
                _corruptedPowerShellScripts.delete(cmdHash);
                console.log('[TerminalManager] LLM이 손상된 스크립트 복구 완료');
                return repaired;
            } else {
                console.log('[TerminalManager] LLM 스크립트 복구 실패, 일반 오류 수정 시도');
                // Continue with normal error correction
            }
        }

        // Sanitize noisy CLIXML and CRLF markers to keep the prompt compact and clear
        const sanitizeForPrompt = (text: string): string => {
            if (!text) return text;
            let t = text;
            // Remove CLIXML tags and attributes
            t = t.replace(/<Objs[\s\S]*?>/g, '')
                .replace(/<\/Objs>/g, '')
                .replace(/<Obj[\s\S]*?>/g, '')
                .replace(/<\/Obj>/g, '')
                .replace(/<S\s+S="Error">([\s\S]*?)<\/S>/g, '$1')
                .replace(/<[^>]+>/g, '');
            // Decode common _x000D__x000A_ noise into newlines
            t = t.replace(/_x000D__x000A_/g, '\n');
            // Collapse whitespace
            t = t.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
            return t;
        };

        const cleanedErrorOutput = sanitizeForPrompt(errorOutput);

        // 항상 워크스페이스 루트를 가져옵니다.
        const projectRoot = await getEffectiveCwd();

        // OS별 가이드라인 준비
        const isWindows = _userOS.toLowerCase().includes('windows') || _userOS.toLowerCase() === 'win32';
        const isUnixLike = !isWindows; // Linux, macOS, Unix 계열

        // 공통 가이드라인
        const commonGuidelines = `1. 기본 명령어(echo, ls, pwd 등)가 실패하는 경우, 셸 환경 문제일 수 있습니다
2. 경로 문제가 있는 경우 절대 경로나 상대 경로를 수정하세요
3. 권한 문제가 있는 경우 ${isWindows ? 'icacls 또는 takeown 명령어를 사용하세요' : 'chmod 명령어를 추가하세요'}
4. 환경 변수 문제가 있는 경우 ${isWindows ? 'set 명령어를 사용하세요' : 'export 명령어를 추가하세요'}
5. ${isUnixLike ? '셸 문제가 있는 경우 /bin/bash 또는 /bin/zsh를 명시적으로 사용하세요' : '셸 문제가 있는 경우 PowerShell 또는 cmd.exe를 명시적으로 사용하세요'}
6. "No such file or directory" 오류의 경우, 프로젝트 루트 경로를 재확인하고 올바른 디렉토리에서 명령어를 실행하세요
7. Spring Boot 프로젝트의 경우 Maven(mvn) 또는 Gradle(./gradlew) 명령어를 사용하고, npm/node.js 명령어는 사용하지 마세요
8. 프로젝트 타입에 맞는 빌드 도구를 사용하세요 (Spring Boot: Maven/Gradle, React: npm/yarn, Python: pip)
9. "앱 빌드하고 실행해" 요청의 경우 Spring Boot 프로젝트일 가능성이 높으므로 Maven(mvn clean package) 또는 Gradle(./gradlew build) 명령어를 사용하세요
10. npm 오류가 발생하면 Spring Boot 프로젝트일 가능성이 높으므로 Maven/Gradle 명령어로 변경하세요`;

        // Windows 전용 가이드라인
        const windowsGuidelines = `

**Windows PowerShell 환경 특별 고려사항:**
11. PowerShell에서 배치 스크립트(cmd.exe)를 실행할 때는 특수 문자(&, |, ;, () 등)가 PowerShell에 의해 먼저 파싱됩니다. 배치 스크립트를 실행할 때는 전체 명령을 큰따옴표로 감싸거나, 내부 따옴표를 이스케이프(\\")하세요
12. **중요**: "앰퍼샌드(&) 문자를 사용할 수 없습니다" 또는 "&& 토큰은 이 버전에서 올바른 문 구분 기호가 아닙니다" 오류가 발생하면, **절대로 &&를 사용하지 마세요**. PowerShell 5.1은 &&를 지원하지 않습니다. 해결 방법:
    - 배치 파일을 실행할 때는 경로만 사용: \`cmd.exe /d /c 경로.bat\` (경로에 공백이 없으면 따옴표 불필요)
    - 여러 명령을 실행해야 하면 별도 명령으로 분리하거나, 배치 파일 내부에서 처리하세요
    - 임시 파일 삭제는 배치 파일 끝에 추가하거나 별도로 처리하세요
    - **절대 사용 금지**: \`cmd.exe /d /c "경로 && del ..."\` 같은 형식은 PowerShell에서 항상 실패합니다
13. **복잡한 배치 스크립트 처리**: 다음 조건에 해당하는 배치 스크립트는 반드시 임시 .bat 파일로 생성하여 실행해야 합니다:
    - 스크립트 길이가 500자 이상
    - %변수% 패턴이 3개 이상 포함 (%errorlevel%, %JAR_FILE% 등)
    - if/for/goto/setlocal/endlocal 같은 제어 구조 포함
    - 여러 단계의 빌드/실행 프로세스를 포함하는 경우
    복잡한 스크립트는 인라인으로 실행하지 말고 임시 .bat 파일을 생성하고 실행하세요. 예: 스크립트를 temp.bat 파일로 저장 후 \`cmd.exe /d /c "temp.bat"\`로 실행
14. 배치 스크립트에서 오류 메시지가 깨져서 나타나거나(예: "?echo", "?행", "?류"), "파일 이름 구문이 잘못되었습니다" 오류가 발생하면:
    - **경로에 공백이 없으면 따옴표 없이 실행**: \`cmd.exe /d /c 경로.bat\` (예: \`cmd.exe /d /c C:\\Temp\\script.bat\`)
    - 경로에 공백이 있으면 따옴표로 감싸되, 이중화하지 마세요: \`cmd.exe /d /c "C:\\Program Files\\script.bat"\`
    - **PowerShell에서는 && 연산자를 절대 사용하지 마세요**. 배치 파일 실행과 삭제는 별도 명령으로 처리하거나 배치 파일 끝에 추가하세요
    - 복잡한 배치 스크립트는 임시 .bat 파일로 저장하고, 삭제는 시스템이 자동으로 처리합니다
15. PowerShell 경로 구분자는 백슬래시(\\) 또는 슬래시(/) 모두 사용 가능하지만, 일관성을 위해 백슬래시를 권장합니다`;

        // Unix 계열(Linux/macOS) 전용 가이드라인
        const unixGuidelines = `

**Unix 계열 환경 특별 고려사항:**
11. 경로는 항상 슬래시(/)를 사용하고, 공백이 있는 경로는 따옴표로 감싸세요
12. 실행 권한이 없는 스크립트의 경우 chmod +x를 사용하여 실행 권한을 부여하세요
13. 환경 변수는 export로 설정하고, 스크립트 내에서 $변수명 형식으로 참조하세요
14. 파이프(|)와 리다이렉션(>, >>) 사용 시 명령어 사이를 올바르게 구분하세요`;

        const osSpecificGuidelines = isWindows ? windowsGuidelines : unixGuidelines;

        const errorCorrectionPrompt = `다음 명령어가 실행 중 오류가 발생했습니다. 오류를 분석하고 수정된 명령어를 제안해주세요.

실행된 명령어: ${failedCommand}
프로젝트 루트: ${projectRoot || '(unknown)'}
작업 디렉토리(CWD): ${cwd}
오류 출력:
${cleanedErrorOutput}

${_userOS} 환경에서 다음 사항을 고려하여 수정된 명령어를 제안해주세요:
${commonGuidelines}${osSpecificGuidelines}

**중요: 오직 하나의 JSON 객체만 응답해주세요. 다른 텍스트나 설명은 포함하지 마세요.**

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

        // Strip code fences and language headers if present
        const fenceStripped = response
            .replace(/```json[\s\S]*?\n([\s\S]*?)```/gi, '$1')
            .replace(/```[a-zA-Z0-9_-]*\s*\n([\s\S]*?)```/g, '$1')
            .trim();

        // JSON 응답 파싱 - 느슨한 매칭(중첩 최소)으로 여러 JSON 객체 처리
        const jsonMatches = fenceStripped.match(/\{[\s\S]*?\}/g);
        if (jsonMatches) {
            for (const jsonStr of jsonMatches) {
                try {
                    // Try parsing as-is first
                    let result;
                    try {
                        result = JSON.parse(jsonStr);
                    } catch (firstError) {
                        // If parsing fails, try to fix common JSON escape issues
                        // Fix invalid escape sequences (e.g., \' -> ', invalid \X -> X)
                        let fixedJson = jsonStr.replace(/\\(?![\\/"bfnrtu])/g, (match, offset, str) => {
                            // Check if it's inside a string (between quotes)
                            const before = str.substring(0, offset);
                            const after = str.substring(offset);
                            // Count unescaped quotes before this position
                            const quoteCount = (before.match(/(?:^|[^\\])(?:\\\\)*"/g) || []).length;
                            // If odd number of quotes, we're inside a string
                            if (quoteCount % 2 === 1) {
                                // Remove invalid backslash (keep the following char)
                                return '';
                            }
                            return match; // Keep backslash outside strings
                        });

                        try {
                            result = JSON.parse(fixedJson);
                        } catch (secondError) {
                            // Last resort: try removing all backslashes followed by invalid escapes
                            fixedJson = jsonStr.replace(/\\(?![\\/"bfnrtu\d])/g, '');
                            try {
                                result = JSON.parse(fixedJson);
                            } catch (thirdError) {
                                console.warn('[TerminalManager] JSON 파싱 실패, 다음 JSON 시도:', thirdError);
                                continue;
                            }
                        }
                    }

                    if (result.correctedCommand && result.confidence > 0.5) {
                        console.log(`[TerminalManager] LLM 오류 수정 성공: ${result.correctedCommand} (신뢰도: ${result.confidence})`);
                        return result.correctedCommand;
                    }
                } catch (parseError) {
                    console.warn('[TerminalManager] JSON 파싱 실패, 다음 JSON 시도:', parseError);
                    continue;
                }
            }
        }

        // Fallback 1: 키-값만 추출 (정규식) - 개선된 멀티라인/이스케이프 처리
        // Try to extract correctedCommand from JSON string
        // Handle both escaped and unescaped quotes
        const keyMatch = fenceStripped.match(/"correctedCommand"\s*:\s*"([^"]*(?:\\.[^"]*)*)"/i);
        if (keyMatch && keyMatch[1]) {
            let cmd = keyMatch[1];
            // Unescape JSON escapes: handle \\\" -> ", \\\\ -> \, etc.
            // Process in order: longest matches first
            cmd = cmd.replace(/\\\\"/g, '"');  // \\\" -> "
            cmd = cmd.replace(/\\\\/g, '\\');  // \\\\ -> \
            cmd = cmd.replace(/\\n/g, ' ');    // \n -> space
            cmd = cmd.replace(/\\"/g, '"');    // \" -> "
            cmd = cmd.replace(/\\r/g, '');     // \r -> empty
            cmd = cmd.replace(/\\t/g, ' ');    // \t -> space
            cmd = cmd.trim();
            if (cmd && cmd.length >= 4 && !cmd.match(/^(\\|""|''|```)/)) {
                console.log('[TerminalManager] Fallback correctedCommand extracted via regex');
                return cmd;
            }
        }
        // Fallback 1b: 단일 따옴표 문자열 또는 이스케이프 없는 문자열
        const singleQuoteMatch = fenceStripped.match(/"correctedCommand"\s*:\s*'([^']*)'/i);
        if (singleQuoteMatch && singleQuoteMatch[1]) {
            const cmd = singleQuoteMatch[1].trim();
            if (cmd && cmd.length >= 4 && !cmd.match(/^(\\|""|''|```)/)) {
                console.log('[TerminalManager] Fallback correctedCommand extracted from single-quoted value');
                return cmd;
            }
        }

        // Fallback 2: 응답이 순수 명령문으로만 온 경우(따옴표 없이 한 줄)
        const singleLine = fenceStripped.split('\n').map(s => s.trim()).filter(Boolean).join(' ');
        if (singleLine && !singleLine.startsWith('{') && !singleLine.startsWith('"')) {
            // 보수적으로 길이 체크
            if (singleLine.length >= 4) {
                console.log('[TerminalManager] Fallback plain command used');
                return singleLine;
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

        // 최대 재시도 횟수 초과 시 실패 메시지 전송
        if (_currentWebview) {
            const failureMessage = `❌ 오류 수정 실패: 최대 재시도 횟수(${MAX_ERROR_RETRIES}) 초과. 수동 확인이 필요합니다.`;
            _currentWebview.postMessage({
                command: 'showErrorCorrectionFailure',
                message: failureMessage,
                retryCount: _errorRetryCount
            });
        }

        // 최대 재시도 횟수 초과 시에만 종합 설명 출력
        setTimeout(async () => {
            await sendErrorCorrectionSummary();
        }, 2000); // 2초 후 종합 설명 출력

        // ProcessingSteps 숨김
        if (_currentWebview) {
            console.log('[TerminalManager] hideLoading 메시지 전송 (최대 재시도 초과)');
            _currentWebview.postMessage({ command: 'hideLoading' });
            // Auto Correcting 애니메이션도 숨김
            _currentWebview.postMessage({
                command: 'updateProcessingStatus',
                step: 'error_correction',
                status: '자동 오류 수정 완료'
            });
            // 명시적으로 Auto Correcting 애니메이션 숨김
            _currentWebview.postMessage({
                command: 'hideAutoCorrecting'
            });
        } else {
            console.log('[TerminalManager] _currentWebview가 설정되지 않음');
        }

        _errorRetryCount = 0;
        return false;
    }

    _errorRetryCount++;
    _summarySent = false; // 새로운 오류 수정 세션 시작 시 플래그 리셋
    console.log(`[TerminalManager] 오류 수정 시도 ${_errorRetryCount}/${MAX_ERROR_RETRIES}`);

    const correctedCommand = await getCorrectedCommand(failedCommand, errorOutput, cwd);

    const isValidCorrected = async (cmd: string | null | undefined): Promise<boolean> => {
        if (!cmd) return false;
        const t = cmd.trim();
        if (!t) return false;
        if (t === '\\') return false;
        if (t === '""' || t === "''") return false;

        // PowerShell 환경에서 && 사용 금지 (cmd.exe 호출 외부에서)
        // cmd.exe /d /c "..." 내부의 &&는 허용되지만, 외부의 &&는 PowerShell에서 파싱 오류 발생
        if (process.platform === 'win32' && /cmd\.exe/i.test(t)) {
            // cmd.exe 호출 외부에 &&가 있으면 거부
            // 예: cmd.exe /d /c "..." && del ... (거부)
            // 예: cmd.exe /d /c "명령1 && 명령2" (허용 - cmd.exe 내부)
            const cmdMatch = t.match(/cmd\.exe\s*\/d\s*\/c\s*"([^"]*)"(?:\s*&&)/i);
            if (cmdMatch) {
                // cmd.exe /d /c "..." 뒤에 &&가 있으면 거부
                console.log('[TerminalManager] 명령어 검증 실패: PowerShell 환경에서 && 사용 감지');
                return false;
            }
            // 명령 시작 부분에 &&가 있으면 거부
            if (/^\s*&&/.test(t)) {
                console.log('[TerminalManager] 명령어 검증 실패: 명령 시작에 && 사용');
                return false;
            }
        }

        // Reject placeholders or angle-bracket templates often produced by LLM
        if (/[<>]/.test(t)) return false;
        if (/Your(Command|ActualCommand)(Here)?/i.test(t)) return false;

        // Check if this is a Spring Boot/Java project by looking for build files
        let isSpringBootProject = false;
        try {
            isSpringBootProject =
                fs.existsSync(path.join(cwd, 'pom.xml')) ||
                fs.existsSync(path.join(cwd, 'build.gradle')) ||
                fs.existsSync(path.join(cwd, 'build.gradle.kts')) ||
                fs.existsSync(path.join(cwd, 'mvnw.cmd')) ||
                fs.existsSync(path.join(cwd, 'mvnw')) ||
                fs.existsSync(path.join(cwd, 'gradlew')) ||
                fs.existsSync(path.join(cwd, 'gradlew.bat'));
        } catch (e) {
            console.warn('[TerminalManager] 프로젝트 타입 확인 중 오류:', e);
            // If we can't check, assume it might be a Spring Boot project to be safe
            isSpringBootProject = true;
        }

        // Only ban mvn/gradle if it's NOT a Spring Boot/Java project
        if (!isSpringBootProject) {
            if (/\bmvn(\.cmd)?\b/i.test(t)) {
                console.log('[TerminalManager] Maven 명령어 차단: Spring Boot 프로젝트 아님');
                return false;
            }
            if (/\bgradle(w)?\b/i.test(t)) {
                console.log('[TerminalManager] Gradle 명령어 차단: Spring Boot 프로젝트 아님');
                return false;
            }
        } else {
            console.log('[TerminalManager] Spring Boot 프로젝트 확인됨, Maven/Gradle 명령어 허용');
        }

        if (/^```/.test(t)) return false;
        if (t.length < 2) return false;
        return true;
    };

    const isValid = await isValidCorrected(correctedCommand);
    if (isValid && correctedCommand) {
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

        // 오류 수정 성공 시 ProcessingSteps에 성공 메시지 표시
        if (_currentWebview) {
            const successMessage = `✅ 오류 수정 성공: ${correctedCommand} 명령어로 정상 실행됨`;
            console.log('[TerminalManager] showErrorCorrectionSuccess 메시지 전송:', successMessage);
            _currentWebview.postMessage({
                command: 'showErrorCorrectionSuccess',
                message: successMessage,
                correctedCommand: correctedCommand
            });
        } else {
            console.log('[TerminalManager] _currentWebview가 설정되지 않음 (성공 메시지)');
        }

        // 수정된 명령어로 재시도
        try {
            await onRetry(correctedCommand);
            console.log('[TerminalManager] 수정된 명령어 재시도 완료');
        } catch (error) {
            console.error('[TerminalManager] 수정된 명령어 재시도 실패:', error);
        }

        // 오류 수정 성공 시 종합 설명 출력
        setTimeout(async () => {
            await sendErrorCorrectionSummary();
        }, 2000); // 2초 후 종합 설명 출력

        // ProcessingSteps 숨김
        if (_currentWebview) {
            console.log('[TerminalManager] hideLoading 메시지 전송 (오류 수정 성공)');
            _currentWebview.postMessage({ command: 'hideLoading' });
            // Auto Correcting 애니메이션도 숨김
            _currentWebview.postMessage({
                command: 'updateProcessingStatus',
                step: 'error_correction',
                status: '자동 오류 수정 완료'
            });
            // 명시적으로 Auto Correcting 애니메이션 숨김
            _currentWebview.postMessage({
                command: 'hideAutoCorrecting'
            });
        } else {
            console.log('[TerminalManager] _currentWebview가 설정되지 않음');
        }

        return true;
    } else {
        if (correctedCommand) {
            console.log(`[TerminalManager] 명령어 수정 불가능 (검증 실패): ${correctedCommand.substring(0, 100)}...`);
        } else {
            console.log('[TerminalManager] 명령어 수정 불가능 (LLM이 명령어를 반환하지 않음)');
        }
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

/**
 * 오류 수정 완료 후 종합 설명을 출력합니다.
 */
async function sendErrorCorrectionSummary(): Promise<void> {
    if (!_currentWebview) {
        console.log('[TerminalManager] 웹뷰가 설정되지 않음');
        return;
    }

    // 중복 출력 방지
    if (_summarySent) {
        console.log('[TerminalManager] 종합 설명이 이미 전송됨');
        return;
    }

    try {
        const summary = `## 🔧 오류 수정 완료 보고서

### 📊 수정 요약
- **수정 시도 횟수:** ${_errorRetryCount}회
- **수정 상태:** 완료
- **수정 시간:** ${new Date().toLocaleString()}

### 🎯 수정된 내용
1. **명령어 오류 분석:** 터미널 출력을 분석하여 오류 원인 파악
2. **LLM 기반 수정:** AI가 오류를 분석하고 수정된 명령어 제안
3. **자동 재시도:** 수정된 명령어로 자동 재실행

### 💡 개선 사항
- **오류 감지:** 터미널 출력에서 오류 패턴 자동 감지
- **지능형 수정:** LLM이 오류 원인을 분석하고 해결책 제시
- **자동화:** 수동 개입 없이 자동으로 오류 수정 및 재시도

### ⚠️ 주의사항
- 복잡한 오류의 경우 수동 확인이 필요할 수 있습니다
- 네트워크 오류나 권한 문제는 자동 수정이 어려울 수 있습니다
- 중요한 작업 전에는 백업을 권장합니다

---
*이 보고서는 aidev-ide의 자동 오류 수정 시스템에 의해 생성되었습니다.*`;

        _currentWebview.postMessage({
            command: 'showErrorCorrectionSummary',
            summary: summary,
        });

        _summarySent = true; // 플래그 설정
        console.log('[TerminalManager] 오류 수정 종합 설명을 채팅창에 전송했습니다.');
    } catch (error) {
        console.error('[TerminalManager] 오류 수정 종합 설명 전송 실패:', error);
    }
}

// Global variable to store corrupted PowerShell scripts for LLM repair
const _corruptedPowerShellScripts = new Map<string, { decoded: string, originalCommand: string }>();

async function repairCorruptedPowerShellScript(corruptedScript: string, errorOutput: string): Promise<string | null> {
    if (!_llmService) {
        console.log('[TerminalManager] LLM 서비스가 없어 스크립트 복구 불가');
        return null;
    }

    try {
        const repairPrompt = `PowerShell 스크립트가 디코딩 과정에서 손상되었습니다. 손상된 스크립트와 실제 실행 오류를 분석하고, 복구된 완전하고 실행 가능한 PowerShell 명령어를 제공해주세요.

손상된 스크립트:
${corruptedScript.substring(0, 2000)}${corruptedScript.length > 2000 ? '... (truncated)' : ''}

실제 실행 오류:
${errorOutput.substring(0, 1000)}${errorOutput.length > 1000 ? '... (truncated)' : ''}

요구사항:
1. 복구된 명령어는 완전하고 실행 가능한 PowerShell 명령어여야 합니다
2. 모든 변수명이 올바르게 복구되어야 합니다 (예: foreach(\$name in @, if (-not \$var) 등)
3. 모든 따옴표가 올바르게 이스케이프되어야 합니다
4. 원본 스크립트의 기능을 유지해야 합니다
5. 실행 가능한 전체 PowerShell 명령어로 응답하세요 (powershell -Command "..." 형식)

JSON 형식으로 응답해주세요:
{
  "correctedCommand": "powershell -NoLogo -NonInteractive -NoProfile -ExecutionPolicy Bypass -Command \"...복구된 스크립트...\"",
  "reasoning": "복구 이유 설명",
  "confidence": 0.9
}`;

        console.log('[TerminalManager] LLM에게 손상된 PowerShell 스크립트 복구 요청');
        const response = await _llmService.sendMessageForErrorCorrection(repairPrompt);

        // Try to parse JSON response
        const fenceStripped = response
            .replace(/```json[\s\S]*?\n([\s\S]*?)```/gi, '$1')
            .replace(/```[a-zA-Z0-9_-]*\s*\n([\s\S]*?)```/g, '$1')
            .trim();

        const jsonMatches = fenceStripped.match(/\{[\s\S]*?\}/g);
        if (jsonMatches) {
            for (const jsonStr of jsonMatches) {
                try {
                    const result = JSON.parse(jsonStr);
                    if (result.correctedCommand && result.confidence > 0.7) {
                        console.log(`[TerminalManager] LLM이 스크립트 복구 완료 (신뢰도: ${result.confidence})`);
                        return result.correctedCommand;
                    }
                } catch (parseError) {
                    continue;
                }
            }
        }

        // Fallback: extract command directly with better regex for multiline commands
        // Try multiple patterns to handle different JSON formats
        const cmdPatterns = [
            /"correctedCommand"\s*:\s*"((?:[^"\\]|\\.|\\\n)*)"/gi,  // Handle escaped quotes and newlines
            /"correctedCommand"\s*:\s*"([^"]+)"/gi,  // Simple pattern
            /correctedCommand["\s:]+"([^"]+)"/gi,  // Flexible pattern
        ];

        for (const pattern of cmdPatterns) {
            const cmdMatch = fenceStripped.match(pattern);
            if (cmdMatch && cmdMatch[1]) {
                let cmd = cmdMatch[1];
                // Unescape JSON escape sequences
                cmd = cmd
                    .replace(/\\n/g, '\n')
                    .replace(/\\r/g, '\r')
                    .replace(/\\t/g, '\t')
                    .replace(/\\"/g, '"')
                    .replace(/\\\\/g, '\\')
                    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
                    .trim();
                if (cmd && cmd.length > 10 && cmd !== '\\' && cmd !== '\\\\') {
                    console.log(`[TerminalManager] LLM 스크립트 복구 완료 (fallback, 길이: ${cmd.length})`);
                    return cmd;
                }
            }
        }

        console.log('[TerminalManager] LLM 스크립트 복구 실패 또는 응답 불충분');
        return null;
    } catch (error) {
        console.error('[TerminalManager] 스크립트 복구 중 오류:', error);
        return null;
    }
}

function normalizeEncodedPowerShellCommand(cmd: string): string {
    try {
        const m = cmd.match(/^(\s*powershell(?:\.exe)?\b[\s\S]*?)\s-EncodedCommand\s+([A-Za-z0-9+/=]+)([\s\S]*)$/i);
        if (!m) return cmd;
        const prefix = m[1];
        const b64 = m[2];
        const suffix = (m[3] || '').trim();
        let decoded = '';
        let isValidDecode = false;
        let decodeMethod = 'utf16le';
        try {
            const buf = Buffer.from(b64, 'base64');
            // Try UTF-16LE first as PowerShell expects
            decoded = buf.toString('utf16le');
            // Heuristic: if most chars are NULs or unreadable, fallback to utf8
            const highNulRatio = (decoded.match(/\u0000/g) || []).length / Math.max(1, decoded.length);
            if (highNulRatio > 0.3) {
                decoded = buf.toString('utf8');
                decodeMethod = 'utf8';
            }

            // Strict validation: check for specific corruption patterns from logs
            const corruptionPatterns = [
                /foreach\s*\([^$]/i,  // foreach( without variable: foreach( in @
                /\$[a-zA-Z]{1,2}['"]/,  // Short variable names with quotes: $Pe', $OutputEncoding
                /\[Console\]:[^:]/,  // Broken Console method calls: [Console]:
                /\s=\s/,  // Lone = operator: " = " without LHS
                /if\s*\([^$\)]/,  // if( without condition
                /foreach\s*\(\s*$/,  // foreach( at end of string
                /Get-Command\s+\s/,  // Double spaces (corruption indicator)
                /\$[a-zA-Z]{1,2}\s*=/,  // Very short variable names followed by =
            ];

            const hasCorruption = corruptionPatterns.some(pattern => pattern.test(decoded));

            // Check for complete PowerShell patterns (must have full variable/command names)
            // These patterns MUST exist in the decoded script for it to be valid
            const requiredPatterns = [
                /\$ProgressPreference/i,  // Full variable name, not $Pe
                /\[Console\]::(OutputEncoding|InputEncoding)/i,  // Complete method call (not [Console]:)
                /foreach\s*\(\s*\$[a-zA-Z]+/i,  // foreach($name with actual variable name
                /(Test-Path|Get-Command|Write-Output|Set-ExecutionPolicy)/i,  // Complete cmdlet names
            ];

            // All required patterns must be present
            const allPatternsPresent = requiredPatterns.every(pattern => {
                const found = pattern.test(decoded);
                if (!found) {
                    console.log(`[TerminalManager] Required pattern not found: ${pattern}`);
                }
                return found;
            });

            // Additional check: ensure variable names are reasonable length (not truncated)
            // Allow short vars only if full vars are also present
            const hasShortVars = /\$[a-zA-Z]{1,2}(['";\s=]|$)/.test(decoded);
            const hasFullVars = /(\$ProgressPreference|\$ErrorActionPreference|\$OutputEncoding|\$WarningPreference|\$InformationPreference|\$PSModuleAutoLoadingPreference)/i.test(decoded);
            const variableNameCheck = !hasShortVars || hasFullVars;

            // Additional integrity check: ensure cmdlet calls are properly formatted
            // Check that cmdlets are followed by proper syntax (parameters or spaces)
            const cmdletIntegrityCheck = !/Test-Path\s*[^-\s]|Get-Command\s*[^-\s]|Write-Output\s*[^-\s]/.test(decoded);

            isValidDecode = !hasCorruption && allPatternsPresent && variableNameCheck && cmdletIntegrityCheck && decoded.length > 50;

            if (!isValidDecode) {
                console.log(`[TerminalManager] Decode validation failed: hasCorruption=${hasCorruption}, allPatternsPresent=${allPatternsPresent}, variableNameCheck=${variableNameCheck}, cmdletIntegrityCheck=${cmdletIntegrityCheck}, length=${decoded.length}`);
            }
        } catch (e) {
            // Decode failed, keep original
            console.log(`[TerminalManager] Decode exception: ${e}`);
            return cmd;
        }

        // Helper function to fix corrupted PowerShell script
        const fixCorruptedScript = (script: string): string => {
            // Fix double-quoted strings that got corrupted (e.g., "".venv"" -> ".venv")
            script = script.replace(/""+([^"]*)""+/g, '"$1"');
            // Fix missing variable names in foreach (e.g., foreach( in @ -> foreach($name in @
            script = script.replace(/foreach\s*\(\s*in\s*@/gi, 'foreach($name in @');
            // Fix missing variable names in if conditions (e.g., if (-not ) -> if (-not $var)
            // This is tricky, so we'll use a more general fix
            script = script.replace(/if\s*\(\s*-not\s*\)/gi, 'if (-not $null)');
            // Fix empty variable assignments (e.g.,  = ; -> $var = $null;)
            script = script.replace(/\s+=\s+;/g, ' = $null;');
            // Fix lone = operators
            script = script.replace(/=\s+(?![^=])/g, ' = ');
            return script;
        };

        // If decode validation failed, store corrupted script for LLM repair
        // Keep original -EncodedCommand but mark it as corrupted
        if (!isValidDecode) {
            console.log('[TerminalManager] Decoded script validation failed, storing for LLM repair');
            // Store corrupted script with command hash as key
            const cmdHash = Buffer.from(cmd).toString('base64').substring(0, 32);
            _corruptedPowerShellScripts.set(cmdHash, { decoded, originalCommand: cmd });
            console.log(`[TerminalManager] 손상된 스크립트 저장 (key: ${cmdHash})`);
            // Keep original -EncodedCommand - LLM will repair it when error occurs
            return cmd;
        }

        // If validation passed, we can safely convert to -Command
        // This avoids potential encoding issues with -EncodedCommand
        console.log('[TerminalManager] Decoded script passed validation, converting to -Command');
        let script = decoded.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
        // Escape double quotes for PowerShell -Command (use \" for escaping)
        script = script.replace(/"/g, '\\"');
        const rebuilt = `${prefix.replace(/\s-OutputFormat\s+Text/i, '').replace(/\s-EncodedCommand\s+[^\s]+/i, '')} -Command "& { ${script} }"`;
        return rebuilt + (suffix ? ` ${suffix}` : '');
    } catch (e) {
        console.log(`[TerminalManager] normalizeEncodedPowerShellCommand exception: ${e}`);
        return cmd;
    }
}