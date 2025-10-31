import * as vscode from 'vscode';
import * as path from 'path';
import { getHtmlContentWithUris } from './panelUtils';
import { LlmService } from '../ai/llmService'; // LlmService 임포트
import { PromptType } from '../ai/types'; // PromptType 임포트
import { ConfigurationService } from '../services/configurationService';
import { NotificationService } from '../services/notificationService';
import { StorageService } from '../services/storage';
import { executeBashCommandsFromLlmResponse, setErrorCorrectionServices, getTerminalMonitorService } from '../terminal/terminalManager';

export class AskViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'aidevIde.askView'; // 새로운 뷰 타입
    private _view?: vscode.WebviewView;

    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly context: vscode.ExtensionContext,
        private readonly llmService: LlmService, // LlmService 인스턴스 주입
        private readonly configurationService: ConfigurationService,
        private readonly notificationService: NotificationService,
        private readonly storageService: StorageService
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
        setErrorCorrectionServices(this.llmService, webviewView.webview);

        // 터미널 모니터링 서비스에 웹뷰 설정
        const terminalMonitorService = getTerminalMonitorService();
        if (terminalMonitorService) {
            terminalMonitorService.setWebview(webviewView.webview);
        }

        webviewView.webview.onDidReceiveMessage(async (data: any) => {
            switch (data.command) {
                case 'sendMessage':
                    // ollama-blocker 방식으로 시리얼 번호 검증
                    const licenseSerial = await this.storageService.getBanyaLicenseSerial();
                    if (!licenseSerial || licenseSerial.trim() === '') {
                        // 다국어 메시지 가져오기
                        const currentLanguage = await this.configurationService.getLanguage();
                        const languageFilePath = vscode.Uri.joinPath(this.extensionUri, 'webview', 'locales', `lang_${currentLanguage}.json`);
                        let licenseNotSetMessage = '시리얼 번호가 설정되지 않았습니다. 설정에서 AIDEV 시리얼 번호를 입력하고 검증해주세요.';

                        try {
                            const fileContent = await vscode.workspace.fs.readFile(languageFilePath);
                            const languageData = JSON.parse(Buffer.from(fileContent).toString('utf8'));
                            licenseNotSetMessage = languageData.licenseNotSetMessage || licenseNotSetMessage;
                        } catch (error) {
                            console.error('Error loading language data for license message:', error);
                        }

                        webviewView.webview.postMessage({
                            command: 'receiveMessage',
                            sender: 'AIDEV-IDE',
                            text: licenseNotSetMessage
                        });
                        return;
                    }

                    // 시리얼 번호 검증 (ollama-blocker 방식)
                    const licenseService = new (await import('../services/licenseService')).LicenseService();
                    const verificationResult = await licenseService.verifyLicense(licenseSerial);
                    if (!verificationResult.success) {
                        webviewView.webview.postMessage({
                            command: 'receiveMessage',
                            sender: 'AIDEV-IDE',
                            text: `시리얼 번호 검증 실패: ${verificationResult.message}`
                        });
                        return;
                    }

                    // ASK 탭에서는 GENERAL_ASK 프롬프트 타입을 사용
                    await this.llmService.handleUserMessageAndRespond(
                        data.text,
                        webviewView.webview,
                        PromptType.GENERAL_ASK,
                        data.imageData,
                        data.imageMimeType,
                        data.selectedFiles // 선택된 파일들 전달
                    );
                    break;
                case 'webviewLoaded':
                    console.log('[AskViewProvider] Ask webview loaded.');
                    break;
                case 'cancelGeminiCall':
                    console.log('[Extension Host] Received cancelGeminiCall command from Ask tab.');
                    this.llmService.cancelCurrentCall();
                    // 즉시 로딩/처리 상태를 종료하고 알림 표시
                    webviewView.webview.postMessage({ command: 'hideLoading' });
                    webviewView.webview.postMessage({ command: 'cancelProcessing' });
                    webviewView.webview.postMessage({ command: 'resetProcessingState' });
                    this.notificationService.showInfoMessage('전송을 취소하였습니다.');
                    break;
                case 'cancelAutoCorrection':
                    console.log('[Extension Host] Received cancelAutoCorrection command from Ask tab.');
                    // 터미널 모니터링 서비스에서 자동 오류 수정 중지
                    const { TerminalMonitorService } = await import('../ai/terminalMonitorService');
                    // 전역 터미널 모니터링 서비스 인스턴스를 통해 중지
                    if ((globalThis as any).terminalMonitorService) {
                        (globalThis as any).terminalMonitorService.stopErrorCorrection();
                    }
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
                    // 명령어 실행 중지
                    if ((globalThis as any).terminalMonitorService) {
                        (globalThis as any).terminalMonitorService.stopCommandExecution();
                    }
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
                        await this.llmService.clearHistory(PromptType.GENERAL_ASK);
                        webviewView.webview.postMessage({
                            command: 'receiveMessage',
                            sender: 'AIDEV-IDE',
                            text: '대화기록이 삭제되었습니다.'
                        });
                        // React 컴포넌트에도 메시지 초기화 신호 전송
                        webviewView.webview.postMessage({
                            command: 'clearHistory'
                        });
                    } catch (error) {
                        console.error('[AskViewProvider] Failed to clear history:', error);
                        webviewView.webview.postMessage({
                            command: 'receiveMessage',
                            sender: 'AIDEV-IDE',
                            text: '대화기록 삭제에 실패했습니다.'
                        });
                    }
                    break;
            }
        });
        webviewView.onDidDispose(() => {
            console.log('[AskViewProvider] Ask view disposed');
            this._view = undefined;
            try { this.llmService.setAskWebview(undefined); } catch { }
        }, null, this.context.subscriptions);

        try { this.llmService.setAskWebview(webviewView.webview); } catch { }
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

            // LlmService에서 OS 정보 가져오기
            const userOS = this.llmService.getUserOS().toLowerCase();
            console.log('[AskViewProvider] Detected user OS:', userOS);

            // OS별 적절한 셸 선택
            let shellPath: string;
            let terminalName: string;

            if (userOS === 'windows') {
                shellPath = 'powershell.exe';
                terminalName = '🚀 AIDEV-IDE PowerShell Commands';
            } else if (userOS === 'macos') {
                shellPath = '/bin/bash';
                terminalName = '🚀 AIDEV-IDE Bash Commands';
            } else if (userOS === 'linux') {
                shellPath = '/bin/bash';
                terminalName = '🚀 AIDEV-IDE Bash Commands';
            } else {
                // 기본값 (unknown OS)
                shellPath = process.platform === 'win32' ? 'powershell.exe' : '/bin/bash';
                terminalName = process.platform === 'win32' ? '🚀 AIDEV-IDE PowerShell Commands' : '🚀 AIDEV-IDE Bash Commands';
            }

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
}