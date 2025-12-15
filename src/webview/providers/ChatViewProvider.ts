import * as vscode from 'vscode';
import * as path from 'path';
import { getHtmlContentWithUris } from '../../utils';
import { PromptType, NotificationService, LicenseService, GitRepositoryService } from '../../services';
import { SettingsManager, TerminalManager, ConversationService, TaskManager, ExecutionManager, StateManager } from '../../core';
import { SupportedModelService } from '../services/SupportedModelService';
import { ModelConnectionService } from '../../core/model/ModelConnectionService';

export class ChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'aidevIde.chatView';
    private _view?: vscode.WebviewView;

    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly context: vscode.ExtensionContext,
        private readonly openSettingsPanel: (viewColumn: vscode.ViewColumn) => void,
        private readonly openLicensePanel: (viewColumn: vscode.ViewColumn) => void,
        private readonly configurationService: SettingsManager,
        private readonly notificationService: NotificationService,
        private readonly gitRepositoryService: GitRepositoryService
    ) { }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;
        try { webviewView.title = 'Codepilot'; } catch { }
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
        // LLMApiClient는 ConversationManager에서 관리되므로 여기서는 웹뷰만 설정
        // LLMApiClient는 필요시 ConversationManager를 통해 가져올 수 있음
        TerminalManager.getInstance().setErrorCorrectionServices(undefined, webviewView.webview);

        // 🆕 core TaskManager 사용
        // TaskManager를 초기화하여 실행 경로에서도 작업 큐가 생성되도록 함
        try {
            const taskManager = TaskManager.getInstance(this.context);
            console.log('[ChatViewProvider] TaskManager 초기화 완료');
        } catch (e) {
            console.warn('[ChatViewProvider] TaskManager 초기화 실패:', e);
        }

        // Git 리포지토리 정보 표시
        // this.showGitRepositoryInfo(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (data: any) => {
            switch (data.command) {
                case 'priorityErrorPrompt': {
                    try {
                        const text = typeof data.text === 'string' ? data.text : '';
                        if (text) {
                            await ConversationService.handleUserMessage({
                                userQuery: text,
                                webviewToRespond: webviewView.webview,
                                promptType: PromptType.CODE_GENERATION,
                                extensionContext: this.context,
                                notificationService: this.notificationService,
                                gitRepositoryService: this.gitRepositoryService
                            });
                        }
                    } catch (e) {
                        console.warn('[ChatViewProvider] priorityErrorPrompt failed:', e);
                    }
                    break;
                }
                case 'getOllamaModels': {
                    try {
                        const stateManager = StateManager.getInstance(this.context);
                        const apiUrl = await stateManager.getOllamaApiUrl();
                        // SettingsPanel과 동일하게 Ollama API(/api/tags) 호출
                        const rawModels = await ModelConnectionService.getOllamaModels(apiUrl);
                        // strings -> objects로 정규화
                        const models = (rawModels || []).map((m: any) => {
                            if (typeof m === 'string') {
                                return { name: m, displayName: m };
                            }
                            return {
                                name: m?.name || '',
                                displayName: m?.displayName || m?.name || ''
                            };
                        }).filter((m: any) => m.name);

                        const current = await stateManager.getOllamaModel();
                        webviewView.webview.postMessage({
                            command: 'ollamaModels',
                            models,
                            current
                        });
                    } catch (e) {
                        console.warn('[ChatViewProvider] getOllamaModels failed:', e);
                        webviewView.webview.postMessage({
                            command: 'ollamaModels',
                            models: [],
                            current: ''
                        });
                    }
                    break;
                }
                case 'setOllamaModel': {
                    try {
                        const modelName = typeof data.model === 'string' ? data.model : '';
                        if (!modelName) {
                            throw new Error('Invalid model name');
                        }
                        const stateManager = StateManager.getInstance(this.context);
                        await stateManager.saveOllamaModel(modelName);
                        webviewView.webview.postMessage({
                            command: 'ollamaModelChanged',
                            model: modelName
                        });
                    } catch (e) {
                        console.warn('[ChatViewProvider] setOllamaModel failed:', e);
                        webviewView.webview.postMessage({
                            command: 'ollamaModelChanged',
                            model: '',
                            error: '모델을 저장하지 못했습니다.'
                        });
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
                        // 🆕 ErrorManager를 사용하여 최근 오류 분석
                        const { ErrorManager } = await import('../../core/error/ErrorManager');
                        const { ErrorSource } = await import('../../core/error/types');
                        const errorManager = ErrorManager.getInstance();
                        const history = errorManager.getHistory();
                        const recentErrors = history.getAll()
                            .filter((entry: any) => entry.error.source === ErrorSource.TERMINAL)
                            .sort((a: any, b: any) => b.error.timestamp - a.error.timestamp)
                            .slice(0, 20); // 최근 20개 오류

                        if (recentErrors.length === 0) {
                            this.notificationService.showInfoMessage('분석할 오류가 없습니다.');
                            webviewView.webview.postMessage({
                                command: 'receiveMessage',
                                sender: 'AIDEV-IDE',
                                text: '최근 터미널 오류가 없습니다.'
                            });
                            break;
                        }

                        // 오류 분석을 위한 컨텍스트 구성
                        const errorContext = recentErrors.map((entry: any) => {
                            const e = entry.error;
                            return {
                                time: new Date(e.timestamp).toLocaleString(),
                                category: e.category,
                                severity: e.severity,
                                message: e.message,
                                rawOutput: e.rawOutput.substring(0, 500) // 처음 500자만
                            };
                        });

                        const analysisPrompt = `다음은 터미널에서 발생한 최근 오류들입니다. 분석하고 수정 방안을 제시해주세요:

${JSON.stringify(errorContext, null, 2)}

오류 분석 결과를 다음 형식으로 제공해주세요:
## 🔍 오류 분석 결과

### 📊 오류 요약
- 총 오류 수: ${recentErrors.length}
- 주요 오류 유형: [유형들]
- 심각도: [low/medium/high/critical]

### 🎯 근본 원인
[오류의 근본 원인 분석]

### 🛠️ 수정 방안
1. [수정 방안 1]
2. [수정 방안 2]
3. [수정 방안 3]

### 💡 권장 명령어
\`\`\`bash
[수정을 위한 명령어들]
\`\`\`

### ⚠️ 주의사항
[실행 시 주의할 점들]`;

                        // ConversationService를 통해 오류 분석 요청
                        await ConversationService.handleUserMessage({
                            userQuery: analysisPrompt,
                            webviewToRespond: webviewView.webview,
                            promptType: PromptType.CODE_GENERATION,
                            extensionContext: this.context,
                            notificationService: this.notificationService,
                            gitRepositoryService: this.gitRepositoryService
                        });

                        this.notificationService.showInfoMessage('오류 분석을 시작했습니다.');
                    } catch (e) {
                        console.warn('[ChatViewProvider] analyzeErrors failed:', e);
                        this.notificationService.showErrorMessage('오류 분석 중 문제가 발생했습니다.');
                    }
                    break;
                }
                case 'sendMessage':
                    // ollama-blocker 방식으로 시리얼 번호 검증
                    const stateManager = StateManager.getInstance(this.context);
                    const licenseSerial = await stateManager.getBanyaLicenseSerial();
                    if (!licenseSerial || licenseSerial.trim() === '') {
                        // 다국어 메시지 가져오기
                        const currentLanguage = await stateManager.getLanguage() || 'ko';
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
                    const licenseService = new LicenseService();
                    const verificationResult = await licenseService.verifyLicense(licenseSerial);
                    if (!verificationResult.success) {
                        webviewView.webview.postMessage({
                            command: 'receiveMessage',
                            sender: 'AIDEV-IDE',
                            text: `시리얼 번호 검증 실패: ${verificationResult.message}`
                        });
                        return;
                    }

                    // ConversationService를 통해 메시지 처리
                    const promptType = data.mode === 'ASK' ? PromptType.GENERAL_ASK : PromptType.CODE_GENERATION;

                    await ConversationService.handleUserMessage({
                        userQuery: data.text,
                        webviewToRespond: webviewView.webview,
                        promptType,
                        imageData: data.imageData,
                        imageMimeType: data.imageMimeType,
                        selectedFiles: data.selectedFiles,
                        extensionContext: this.context,
                        notificationService: this.notificationService,
                        gitRepositoryService: this.gitRepositoryService
                    });
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
                    ConversationService.cancelCurrentCall();
                    // 즉시 로딩/처리 상태를 종료하고 알림 표시
                    webviewView.webview.postMessage({ command: 'hideLoading' });
                    webviewView.webview.postMessage({ command: 'cancelProcessing' });
                    webviewView.webview.postMessage({ command: 'resetProcessingState' });
                    this.notificationService.showInfoMessage('전송을 취소하였습니다.');
                    break;
                case 'cancelAutoCorrection':
                    console.log('[Extension Host] Received cancelAutoCorrection command.');
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
                    console.log('[Extension Host] Received stopCommandExecution command.');
                    webviewView.webview.postMessage({
                        command: 'hideAutoCorrecting',
                        message: '명령어 실행이 중단되었습니다.'
                    });
                    break;
                case 'openFilePicker':
                    console.log('[Extension Host] Opening file picker...');
                    this.openFilePicker(webviewView.webview);
                    break;
                case 'executeBashCommands':
                    // console.log('[Extension Host] Executing bash commands:', data.commands);
                    this.executeBashCommands(data.commands);
                    break;
                case 'clearHistory':
                    console.log('[Extension Host] Clearing conversation history for Code tab');
                    try {
                        await ConversationService.clearHistory(PromptType.CODE_GENERATION, this.context);
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
                        console.error('[ChatViewProvider] Failed to clear history:', error);
                        webviewView.webview.postMessage({
                            command: 'receiveMessage',
                            sender: 'AIDEV-IDE',
                            text: '대화기록 삭제에 실패했습니다.'
                        });
                    }
                    break;
                case 'displayUserMessage': // 웹뷰 자체에서 사용자 메시지 표시를 요청할 때, 이미지도 포함
                    console.log('Received command to display user message from webview:', data.text, data.imageData);
                    if (data.text !== undefined || data.imageData !== undefined) {
                        webviewView.webview.postMessage({ command: 'displayUserMessage', text: data.text, imageData: data.imageData });
                    }
                    break;
                case 'projectTypeSelected': // 사용자가 프로젝트 타입을 선택한 경우
                    console.log('[ChatViewProvider] 프로젝트 타입 선택됨:', data.projectType);
                    try {
                        // 선택된 프로젝트 타입을 저장하고 현재 요청을 다시 처리
                        // 이는 임시로 전역 변수나 storage에 저장하고 재요청하는 방식으로 구현 가능
                        // 현재는 단순히 로그만 남기고, 향후 확장 가능하도록 구조화
                        this.notificationService.showInfoMessage(`프로젝트 타입이 선택되었습니다: ${data.projectType}`);
                        // TODO: 선택된 프로젝트 타입을 사용하여 요청 재처리
                    } catch (error) {
                        console.error('[ChatViewProvider] 프로젝트 타입 선택 처리 실패:', error);
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
            console.log('[ChatViewProvider] executeBashCommands called with:', commands);

            if (!commands || commands.length === 0) {
                console.log('[ChatViewProvider] No commands to execute');
                return;
            }

            // 실행 상태 표시
            this._view?.webview.postMessage({
                command: 'showRunExecution',
                status: 'Executing commands...'
            });

            // OS 정보 가져오기
            const platform = require('os').platform();
            const userOS = platform === 'darwin' ? 'macos' : platform === 'win32' ? 'windows' : platform === 'linux' ? 'linux' : 'unknown';
            console.log('[ChatViewProvider] Detected user OS:', userOS);

            // OS별 적절한 셸 선택
            let shellPath: string;
            let terminalName: string;

            if (userOS === 'windows') {
                shellPath = 'powershell.exe';
                terminalName = 'AIDEV-IDE PowerShell Commands';
            } else if (userOS === 'macos') {
                shellPath = '/bin/bash';
                terminalName = 'AIDEV-IDE Bash Commands';
            } else if (userOS === 'linux') {
                shellPath = '/bin/bash';
                terminalName = 'AIDEV-IDE Bash Commands';
            } else {
                const osAdapter = ExecutionManager.getInstance().getOSAdapter();
                shellPath = osAdapter.osType === 'win32' ? 'powershell.exe' : '/bin/bash';
                terminalName = osAdapter.osType === 'win32' ? 'AIDEV-IDE PowerShell Commands' : 'AIDEV-IDE Bash Commands';
            }

            // ConfigurationService.getProjectRoot()는 항상 워크스페이스 루트만 반환합니다.
            const terminalCwd = await this.configurationService.getProjectRoot();
            if (terminalCwd) {
                console.log('[ChatViewProvider] Using workspace root for terminal:', terminalCwd);
            } else {
                console.warn('[ChatViewProvider] 워크스페이스가 열려있지 않습니다.');
            }

            console.log('[ChatViewProvider] Creating new terminal with shell:', shellPath, 'cwd:', terminalCwd);
            const terminal = vscode.window.createTerminal({ name: terminalName, shellPath, cwd: terminalCwd });
            terminal.show();
            await new Promise(resolve => setTimeout(resolve, 500));

            // 스크립트를 단일 세션으로 실행: bash는 heredoc, PowerShell은 here-string 사용
            if (userOS === 'windows') {
                const script = commands.join('\n');
                const ps = `$script = @'\n${script}\n'@; powershell -NoLogo -NoProfile -NonInteractive -Command $script`;
                terminal.sendText(ps);
            } else {
                const script = commands.join('\n');
                const heredoc = `bash <<'AIDEV_EOF'\nset -e\n${script}\nAIDEV_EOF`;
                terminal.sendText(heredoc);
            }

            console.log(`[ChatViewProvider] Submitted script as single block (${commands.length} logical lines)`);

            setTimeout(() => {
                this._view?.webview.postMessage({ command: 'hideRunExecution' });
            }, 2000);

        } catch (error) {
            console.error('[ChatViewProvider] Error executing commands:', error);
            this._view?.webview.postMessage({ command: 'hideRunExecution' });
            this.notificationService.showErrorMessage('명령어 실행 중 오류가 발생했습니다.');
        }
    }

    /**
     * Git 리포지토리 정보를 웹뷰에 표시
     */
    //     private async showGitRepositoryInfo(webview: vscode.Webview): Promise<void> {
    //         try {
    //             const gitInfo = await this.gitRepositoryService.getRepositoryInfo();

    //             if (gitInfo) {
    //                 const message = `
    // 🔗 **Git 리포지토리 연결됨**
    // - 리포지토리: \`${gitInfo.owner}/${gitInfo.repo}\`
    // - 현재 브랜치: \`${gitInfo.branch}\`
    // - URL: ${gitInfo.url}

    // 이제 다음과 같은 Git 명령어를 자연어로 요청할 수 있습니다:
    // - "변경사항을 커밋해줘"
    // - "새 브랜치를 만들어줘"
    // - "PR을 생성해줘"
    // - "이슈를 만들어줘"
    // - "코드를 리뷰해줘"
    //                 `;

    //                 webview.postMessage({
    //                     command: 'showGitInfo',
    //                     content: message
    //                 });
    //             }
    //         } catch (error) {
    //             console.error('[ChatViewProvider] Git 리포지토리 정보 표시 실패:', error);
    //         }
    //     }
}