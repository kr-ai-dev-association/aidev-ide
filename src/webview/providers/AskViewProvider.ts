import * as vscode from 'vscode';
import * as path from 'path';
import { getHtmlContentWithUris, safePostMessage } from '../../utils';
import { PromptType, NotificationService } from '../../services'; // PromptType 임포트
import { SettingsManager, StateManager, TerminalManager, ConversationService, ExecutionManager } from '../../core';

export class AskViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'codepilot.askView'; // 새로운 뷰 타입
    private _view?: vscode.WebviewView;

    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly context: vscode.ExtensionContext,
        private readonly configurationService: SettingsManager,
        private readonly notificationService: NotificationService
    ) { }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;
        try { webviewView.title = 'ASK'; } catch { }
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this.extensionUri,
                vscode.Uri.joinPath(this.extensionUri, 'webview'),
                vscode.Uri.joinPath(this.extensionUri, 'media'),
                vscode.Uri.joinPath(this.extensionUri, 'dist'),
                vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview')
            ]
        };
        // ASK 탭은 ask.html을 사용
        webviewView.webview.html = getHtmlContentWithUris(this.extensionUri, 'ask', webviewView.webview);

        // 터미널 매니저에 웹뷰 설정 (오류 수정 시스템용)
        // LLMApiClient는 ConversationManager에서 관리되므로 여기서는 웹뷰만 설정
        TerminalManager.getInstance().setErrorCorrectionServices(undefined, webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (data: any) => {
            switch (data.command) {
                case 'sendMessage':
                    // ConversationService를 통해 메시지 처리
                    await ConversationService.handleUserMessage({
                        userQuery: data.text,
                        webviewToRespond: webviewView.webview,
                        promptType: PromptType.GENERAL_ASK,
                        imageData: data.imageData,
                        imageMimeType: data.imageMimeType,
                        selectedFiles: data.selectedFiles,
                        extensionContext: this.context,
                        notificationService: this.notificationService
                    });
                    break;
                case 'webviewLoaded':
                    console.log('[AskViewProvider] Ask webview loaded.');
                    break;
                case 'cancelGeminiCall':
                    console.log('[Extension Host] Received cancelGeminiCall command from Ask tab.');
                    ConversationService.cancelCurrentCall();
                    // 즉시 로딩/처리 상태를 종료하고 알림 표시
                    webviewView.webview.postMessage({ command: 'hideLoading' });
                    webviewView.webview.postMessage({ command: 'cancelProcessing' });
                    webviewView.webview.postMessage({ command: 'resetProcessingState' });
                    this.notificationService.showInfoMessage('전송을 취소하였습니다.');
                    break;
                case 'cancelAutoCorrection':
                    console.log('[Extension Host] Received cancelAutoCorrection command from Ask tab.');
                    webviewView.webview.postMessage({
                        command: 'hideAutoCorrecting',
                        message: '자동 오류 수정이 중단되었습니다.'
                    });
                    // cancel 후 상태 초기화
                    webviewView.webview.postMessage({
                        command: 'cancelProcessing'
                    });
                    webviewView.webview.postMessage({
                        command: 'resetProcessingState'
                    });
                    break;
                case 'stopCommandExecution':
                    console.log('[Extension Host] Received stopCommandExecution command from Ask tab.');
                    webviewView.webview.postMessage({
                        command: 'hideAutoCorrecting',
                        message: '명령어 실행이 중단되었습니다.'
                    });
                    break;
                case 'openFilePicker':
                    console.log('[Extension Host] Opening file picker from Ask tab...');
                    this.openFilePicker(webviewView.webview);
                    break;
                case 'executeBashCommands':
                    // console.log('[Extension Host] Executing bash commands from Ask tab:', data.commands);
                    this.executeBashCommands(data.commands);
                    break;
                case 'clearHistory':
                    console.log('[Extension Host] Clearing conversation history for Ask tab');
                    try {
                        await ConversationService.clearHistory(PromptType.GENERAL_ASK, this.context);
                        // React 컴포넌트에도 메시지 초기화 신호 전송
                        webviewView.webview.postMessage({
                            command: 'clearHistory'
                        });
                        // 토큰 사용량 및 컨텍스트 수 초기화 UI 업데이트
                        webviewView.webview.postMessage({
                            command: 'updateContextInfo',
                            contextInfo: {
                                messageCount: 0,
                                tokenUsage: {
                                    current: 0,
                                    max: 128000, // 기본 최대 토큰 값
                                    percentage: 0
                                }
                            }
                        });
                    } catch (error) {
                        console.error('[AskViewProvider] Failed to clear history:', error);
                        webviewView.webview.postMessage({
                            command: 'receiveMessage',
                            sender: 'CODEPILOT',
                            text: '대화기록 삭제에 실패했습니다.'
                        });
                    }
                    break;
            }
        });
        webviewView.onDidDispose(() => {
            console.log('[AskViewProvider] Ask view disposed');
            this._view = undefined;
            // webview는 직접 관리하므로 별도 설정 불필요
        }, null, this.context.subscriptions);

        // webview는 직접 관리하므로 별도 설정 불필요
    }

    private async openFilePicker(webview: vscode.Webview) {
        try {
            // 설정에서 프로젝트 루트 경로 가져오기
            const projectRoot = await this.configurationService.getProjectRoot();
            let defaultUri: vscode.Uri | undefined;

            if (projectRoot) {
                // Remote SSH 환경을 고려한 경로 처리
                try {
                    defaultUri = vscode.Uri.file(projectRoot);
                    // 경로가 유효한지 확인
                    await vscode.workspace.fs.stat(defaultUri);
                } catch (error) {
                    console.warn('설정된 프로젝트 루트 경로에 접근할 수 없습니다:', error);
                    defaultUri = undefined;
                }
            }

            if (!defaultUri && vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
                defaultUri = vscode.workspace.workspaceFolders[0].uri;
            }

            const uris = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: true,
                openLabel: 'Select Files for Context',
                defaultUri: defaultUri,
                filters: {
                    'All Files': ['*'],
                    'Source Files': ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'cs', 'php', 'rb', 'go', 'rs', 'swift', 'kt', 'scala', 'html', 'css', 'scss', 'sass', 'json', 'xml', 'yaml', 'yml', 'md', 'txt'],
                    'Code Files': ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'cs', 'php', 'rb', 'go', 'rs', 'swift', 'kt', 'scala'],
                    'Web Files': ['html', 'css', 'scss', 'sass', 'js', 'ts', 'jsx', 'tsx'],
                    'Config Files': ['json', 'xml', 'yaml', 'yml', 'md', 'txt']
                }
            });

            if (uris && uris.length > 0) {
                for (const uri of uris) {
                    const fileName = uri.fsPath.split(/[/\\]/).pop() || 'Unknown';
                    // Remote SSH 환경에서 경로 정규화
                    const normalizedPath = path.resolve(uri.fsPath);
                    webview.postMessage({
                        command: 'fileSelected',
                        filePath: normalizedPath,
                        fileName: fileName
                    });
                }
            }
        } catch (error) {
            console.error('Error opening file picker:', error);
            this.notificationService.showErrorMessage('파일 선택 중 오류가 발생했습니다.');
        }
    }

    private async executeBashCommands(commands: string[]): Promise<void> {
        try {
            console.log('[AskViewProvider] executeBashCommands called with:', commands);

            if (!commands || commands.length === 0) {
                console.log('[AskViewProvider] No commands to execute');
                return;
            }

            // OS 정보 가져오기
            const platform = require('os').platform();
            const userOS = platform === 'darwin' ? 'macos' : platform === 'win32' ? 'windows' : platform === 'linux' ? 'linux' : 'unknown';
            console.log('[AskViewProvider] Detected user OS:', userOS);

            // OS별 적절한 셸 선택
            let shellPath: string;
            let terminalName: string;

            const osAdapter = ExecutionManager.getInstance().getOSAdapter();
            shellPath = osAdapter.getDefaultShell();
            terminalName = osAdapter.osType === 'win32' ? 'CODEPILOT PowerShell Commands' : 'CODEPILOT Shell Commands';

            // ConfigurationService.getProjectRoot()는 항상 워크스페이스 루트만 반환합니다.
            const terminalCwd = await this.configurationService.getProjectRoot();
            if (terminalCwd) {
                console.log('[AskViewProvider] Using workspace root for terminal:', terminalCwd);
            } else {
                console.warn('[AskViewProvider] 워크스페이스가 열려있지 않습니다.');
            }

            console.log('[AskViewProvider] Creating new terminal with shell:', shellPath, 'cwd:', terminalCwd);
            // 새로운 터미널 생성
            const terminal = vscode.window.createTerminal({ name: terminalName, shellPath: shellPath, cwd: terminalCwd });

            console.log('[AskViewProvider] Terminal created, showing...');
            terminal.show();

            // 터미널이 준비될 시간을 주기 위해 약간의 지연
            await new Promise(resolve => setTimeout(resolve, 500));

            // 단일 세션으로 실행되도록 전체 스크립트를 한 번에 제출
            if (userOS === 'windows') {
                const script = commands.join('\n');
                const ps = `$script = @'\n${script}\n'@; powershell -NoLogo -NoProfile -NonInteractive -Command $script`;
                terminal.sendText(ps);
            } else {
                const script = commands.join('\n');
                const heredoc = `bash <<'AIDEV_EOF'\nset -e\n${script}\nAIDEV_EOF`;
                terminal.sendText(heredoc);
            }

            console.log(`[AskViewProvider] Submitted script as single block (${commands.length} logical lines)`);

        } catch (error) {
            console.error('[AskViewProvider] Error executing commands:', error);
            this.notificationService.showErrorMessage('명령어 실행 중 오류가 발생했습니다.');
        }
    }

    /**
     * GENERAL_ASK 타입의 LLM 응답을 처리합니다.
     * ASK 탭에서는 파일 작업 및 터미널 명령 실행이 제한됩니다.
     */
    public processGeneralAskResponse(llmResponse: string, webview: vscode.Webview): void {
        let cleanedResponse = llmResponse;
        let hasWarnings = false;

        // 터미널 명령어 체크
        if (this.hasBashCommands(cleanedResponse)) {
            const warningMsg = "ASK 탭에서는 터미널 명령어를 실행할 수 없습니다. CODE 탭을 사용해주세요.";
            safePostMessage(webview, { command: 'receiveMessage', sender: 'CODEPILOT', text: warningMsg });
            this.notificationService.showWarningMessage(`CODEPILOT: ${warningMsg}`);
            hasWarnings = true;
            cleanedResponse = this.removeBashCommands(cleanedResponse);
        }

        // 파일 작업 지시어 체크 (한국어 + 영어 범용)
        if (this.hasFileDirectives(cleanedResponse)) {
            const warningMsg = "ASK 탭에서는 파일 생성, 수정, 삭제를 할 수 없습니다. CODE 탭을 사용해주세요.";
            safePostMessage(webview, { command: 'receiveMessage', sender: 'CODEPILOT', text: warningMsg });
            this.notificationService.showWarningMessage(`CODEPILOT: ${warningMsg}`);
            hasWarnings = true;
            cleanedResponse = this.removeFileDirectives(cleanedResponse);
        }

        // 정리된 응답 전송
        if (cleanedResponse.trim()) {
            safePostMessage(webview, { command: 'receiveMessage', sender: 'CODEPILOT', text: cleanedResponse });
        }
    }

    /**
     * 터미널 명령어를 제거합니다.
     */
    private removeBashCommands(response: string): string {
        // ```bash로 시작하고 ```로 끝나는 코드 블록 제거
        return response.replace(/```(?:bash|sh|shell|powershell|pwsh|cmd|batch|bat)[\s\S]*?```/g, '');
    }

    /**
     * 터미널 명령어가 포함되어 있는지 확인합니다.
     */
    private hasBashCommands(response: string): boolean {
        return /```(?:bash|sh|shell|powershell|pwsh|cmd|batch|bat)[\s\S]*?```/i.test(response);
    }

    /**
     * 파일 작업 지시어가 포함되어 있는지 확인합니다 (한국어 + 영어 범용).
     */
    private hasFileDirectives(response: string): boolean {
        return /(?:새 파일|수정 파일|삭제 파일|New file|Create file|Modified file|Update file|Modify file|Delete file|Remove file):/i.test(response);
    }

    /**
     * 파일 작업 지시어를 제거합니다 (한국어 + 영어 범용).
     */
    private removeFileDirectives(response: string): string {
        return response.replace(/(새 파일|수정 파일|삭제 파일|New file|Create file|Modified file|Update file|Modify file|Delete file|Remove file):[\s\S]*?(?=\n{2,}|$)/gi, '').trim();
    }
}