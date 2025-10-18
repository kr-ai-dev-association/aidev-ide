import * as vscode from 'vscode';
import * as path from 'path';
import { getHtmlContentWithUris } from './panelUtils';
import { LlmService } from '../ai/llmService';
import { PromptType } from '../ai/types'; // LlmService 및 PromptType 임포트
import { ConfigurationService } from '../services/configurationService';
import { NotificationService } from '../services/notificationService';
import { StorageService } from '../services/storage';
import { executeBashCommandsFromLlmResponse, setErrorCorrectionServices, getTerminalMonitorService } from '../terminal/terminalManager';

export class ChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'aidevIde.chatView';
    private _view?: vscode.WebviewView;

    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly context: vscode.ExtensionContext,
        private readonly llmService: LlmService,
        private readonly openSettingsPanel: (viewColumn: vscode.ViewColumn) => void,
        private readonly openLicensePanel: (viewColumn: vscode.ViewColumn) => void,
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
        try { webviewView.title = 'CODE'; } catch { }
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
        webviewView.webview.html = getHtmlContentWithUris(this.extensionUri, 'chat', webviewView.webview);

        // 터미널 매니저에 웹뷰 설정 (오류 수정 시스템용)
        setErrorCorrectionServices(this.llmService, webviewView.webview);

        // 터미널 모니터링 서비스에 웹뷰 설정
        const terminalMonitorService = getTerminalMonitorService();
        if (terminalMonitorService) {
            terminalMonitorService.setWebview(webviewView.webview);
        }

        webviewView.webview.onDidReceiveMessage(async (data: any) => {
            switch (data.command) {
                case 'priorityErrorPrompt': {
                    try {
                        const text = typeof data.text === 'string' ? data.text : '';
                        if (text) {
                            await this.llmService.handleUserMessageAndRespond(
                                text,
                                webviewView.webview,
                                PromptType.CODE_GENERATION
                            );
                        }
                    } catch (e) {
                        console.warn('[ChatViewProvider] priorityErrorPrompt failed:', e);
                    }
                    break;
                }
                case 'openFileInEditor': {
                    try {
                        const fsPath = typeof data.path === 'string' ? data.path : '';
                        if (fsPath) {
                            const uri = vscode.Uri.file(fsPath);
                            const doc = await vscode.workspace.openTextDocument(uri);
                            await vscode.window.showTextDocument(doc, { preview: false, preserveFocus: false });
                        }
                    } catch (e) {
                        console.warn('[ChatViewProvider] openFileInEditor failed:', e);
                        this.notificationService.showErrorMessage('파일을 열 수 없습니다.');
                    }
                    break;
                }
                case 'analyzeErrors': {
                    try {
                        console.log('[ChatViewProvider] 오류 분석 요청');
                        const terminalMonitorService = getTerminalMonitorService();
                        if (terminalMonitorService) {
                            await terminalMonitorService.triggerErrorAnalysis();
                            this.notificationService.showInfoMessage('오류 분석을 시작했습니다.');
                        } else {
                            this.notificationService.showErrorMessage('터미널 모니터링 서비스를 찾을 수 없습니다.');
                        }
                    } catch (e) {
                        console.warn('[ChatViewProvider] analyzeErrors failed:', e);
                        this.notificationService.showErrorMessage('오류 분석 중 문제가 발생했습니다.');
                    }
                    break;
                }
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

                    // 이미지 데이터와 MIME 타입도 함께 전달
                    await this.llmService.handleUserMessageAndRespond(
                        data.text,
                        webviewView.webview,
                        PromptType.CODE_GENERATION,
                        data.imageData,
                        data.imageMimeType,
                        data.selectedFiles // 선택된 파일들 전달
                    );
                    break;
                case 'openPanel':
                    let panelViewColumn = vscode.ViewColumn.Beside;
                    if (vscode.window.activeTextEditor?.viewColumn) {
                        panelViewColumn = vscode.window.activeTextEditor.viewColumn;
                    }
                    if (data.panel === 'settings') this.openSettingsPanel(panelViewColumn);
                    else if (data.panel === 'license') this.openLicensePanel(panelViewColumn);
                    break;
                case 'webviewLoaded':
                    console.log('[ChatViewProvider] Chat webview loaded.');
                    break;
                case 'cancelGeminiCall':
                    console.log('[Extension Host] Received cancelGeminiCall command.');
                    this.llmService.cancelCurrentCall();
                    webviewView.webview.postMessage({ command: 'receiveMessage', sender: 'AIDEV-IDE', text: 'AI 호출이 취소되었습니다.' });
                    break;
                case 'openFilePicker':
                    console.log('[Extension Host] Opening file picker...');
                    this.openFilePicker(webviewView.webview);
                    break;
                case 'executeBashCommands':
                    // console.log('[Extension Host] Executing bash commands:', data.commands);
                    this.executeBashCommands(data.commands);
                    break;
                case 'displayUserMessage': // 웹뷰 자체에서 사용자 메시지 표시를 요청할 때, 이미지도 포함
                    console.log('Received command to display user message from webview:', data.text, data.imageData);
                    if (data.text !== undefined || data.imageData !== undefined) {
                        webviewView.webview.postMessage({ command: 'displayUserMessage', text: data.text, imageData: data.imageData });
                    }
                    break;
                case 'getLanguage':
                    try {
                        const language = await this.configurationService.getLanguage();
                        webviewView.webview.postMessage({ command: 'currentLanguage', language: language });
                    } catch (error: any) {
                        // 오류 시 기본값 반환
                        webviewView.webview.postMessage({ command: 'currentLanguage', language: 'ko' });
                    }
                    break;
                case 'languageChanged':
                    console.log('[ChatViewProvider] Language changed to:', data.language);
                    // 언어 변경 시 언어 데이터를 다시 요청
                    try {
                        const language = data.language;
                        if (language && typeof language === 'string') {
                            // 언어 파일 경로
                            const languageFilePath = vscode.Uri.joinPath(this.extensionUri, 'webview', 'locales', `lang_${language}.json`);

                            // 파일 읽기
                            const fileContent = await vscode.workspace.fs.readFile(languageFilePath);
                            const languageData = JSON.parse(Buffer.from(fileContent).toString('utf8'));

                            // 웹뷰에 언어 데이터 전송
                            webviewView.webview.postMessage({
                                command: 'languageDataReceived',
                                language: language,
                                data: languageData
                            });
                        }
                    } catch (error: any) {
                        console.error('Error loading language data in ChatViewProvider:', error);
                        // 오류 시 기본 한국어 데이터 반환
                        try {
                            const defaultLanguagePath = vscode.Uri.joinPath(this.extensionUri, 'webview', 'locales', 'lang_ko.json');
                            const defaultContent = await vscode.workspace.fs.readFile(defaultLanguagePath);
                            const defaultData = JSON.parse(Buffer.from(defaultContent).toString('utf8'));
                            webviewView.webview.postMessage({
                                command: 'languageDataReceived',
                                language: 'ko',
                                data: defaultData
                            });
                        } catch (fallbackError) {
                            console.error('Error loading fallback language data in ChatViewProvider:', fallbackError);
                        }
                    }
                    break;
            }
        });
        webviewView.onDidDispose(() => {
            console.log('[ChatViewProvider] Chat view disposed');
            this._view = undefined;
            try { this.llmService.setChatWebview(undefined); } catch { }
        }, null, this.context.subscriptions);

        try { this.llmService.setChatWebview(webviewView.webview); } catch { }
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
            // console.log('[ChatViewProvider] executeBashCommands called with:', commands);
            
            if (!commands || commands.length === 0) {
                // console.log('[ChatViewProvider] No commands to execute');
                return;
            }

            // console.log('[ChatViewProvider] Creating new terminal...');
            // 새로운 터미널 생성
            const terminal = vscode.window.createTerminal({
                name: 'AIDEV-IDE Bash Commands',
                shellPath: '/bin/bash'
            });

            // console.log('[ChatViewProvider] Terminal created, showing...');
            // 터미널을 활성화하고 명령어들을 순차적으로 실행
            terminal.show();
            
            // 터미널이 준비될 시간을 주기 위해 약간의 지연
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // 각 명령어를 실행
            for (let i = 0; i < commands.length; i++) {
                const command = commands[i];
                // console.log(`[ChatViewProvider] Executing command ${i + 1}/${commands.length}: ${command}`);
                
                // 첫 번째 명령어는 즉시 실행, 나머지는 약간의 지연 후 실행
                if (i === 0) {
                    terminal.sendText(command);
                    // console.log(`[ChatViewProvider] Sent first command: ${command}`);
                } else {
                    setTimeout(() => {
                        terminal.sendText(command);
                        // console.log(`[ChatViewProvider] Sent delayed command: ${command}`);
                    }, i * 500); // 500ms 간격으로 실행
                }
            }

            // console.log(`[ChatViewProvider] Successfully executed ${commands.length} bash commands`);
            
        } catch (error) {
            console.error('[ChatViewProvider] Error executing bash commands:', error);
            this.notificationService.showErrorMessage('Bash 명령어 실행 중 오류가 발생했습니다.');
        }
    }
}