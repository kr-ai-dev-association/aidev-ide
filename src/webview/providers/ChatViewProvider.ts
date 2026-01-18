import * as vscode from 'vscode';
import * as path from 'path';
import { getHtmlContentWithUris } from '../../utils';
import { PromptType, NotificationService, LicenseService, GitRepositoryService, GeminiApi } from '../../services';
import { SettingsManager, TerminalManager, ConversationService, TaskManager, ExecutionManager, StateManager, SessionManager } from '../../core';
import { ModelConnectionService } from '../../core/managers/model/ModelConnectionService';
import { InlineDiffManager } from '../../core/managers/diff/InlineDiffManager';
import { EXCLUDED_LIBRARY_PATHS } from '../../core/utils/FileExclusionConstants';

/**
 * Diff 가상 문서 프로바이더
 * codepilot-diff: 스킴으로 등록하여 before 내용을 제공
 */
class DiffDocumentProvider implements vscode.TextDocumentContentProvider {
    constructor(private diffManager: InlineDiffManager) { }

    provideTextDocumentContent(uri: vscode.Uri): string {
        // URI에서 실제 파일 경로 추출 (codepilot-diff:/path/to/file.ts.before)
        const filePath = uri.path.replace(/\.before$/, '');
        const beforeContent = this.diffManager.getCheckpointBeforeContent(filePath);
        return beforeContent || '';
    }
}

export class ChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'codepilot.chatView';
    private _view?: vscode.WebviewView;
    private diffDocumentProvider?: DiffDocumentProvider;

    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly context: vscode.ExtensionContext,
        private readonly openSettingsPanel: (viewColumn: vscode.ViewColumn) => void,
        private readonly configurationService: SettingsManager,
        private readonly notificationService: NotificationService,
        private readonly gitRepositoryService: GitRepositoryService,
        private readonly geminiApi: GeminiApi,
        private readonly ollamaApi: any,
        private readonly banyaApi: any
    ) { }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        console.log('[ChatViewProvider] resolveWebviewView called');
        try {
            this._view = webviewView;
            try { webviewView.title = 'Codepilot'; } catch (e) {
                console.warn('[ChatViewProvider] Failed to set title:', e);
            }

            console.log('[ChatViewProvider] Setting webview options...');
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

            console.log('[ChatViewProvider] Loading HTML content...');
            const htmlContent = getHtmlContentWithUris(this.extensionUri, 'chat', webviewView.webview);
            if (htmlContent && !htmlContent.includes('Error loading')) {
                webviewView.webview.html = htmlContent;
                console.log('[ChatViewProvider] HTML content loaded successfully');
            } else {
                console.error('[ChatViewProvider] Failed to load HTML content:', htmlContent);
                webviewView.webview.html = `<html><body><h1>Error loading chat view</h1><p>${htmlContent || 'Unknown error'}</p></body></html>`;
            }
        } catch (error) {
            console.error('[ChatViewProvider] Error in resolveWebviewView:', error);
            webviewView.webview.html = `<html><body><h1>Error initializing chat view</h1><p>${error instanceof Error ? error.message : String(error)}</p></body></html>`;
        }

        // 터미널 매니저에 웹뷰 설정 (오류 수정 시스템용)
        // LLMApiClient는 ConversationManager에서 관리되므로 여기서는 웹뷰만 설정
        // LLMApiClient는 필요시 ConversationManager를 통해 가져올 수 있음
        TerminalManager.getInstance().setErrorCorrectionServices(undefined, webviewView.webview);

        // 🆕 core TaskManager 사용
        // TaskManager를 초기화하여 실행 경로에서도 작업 큐가 생성되도록 함
        try {
            const taskManager = TaskManager.getInstance(this.context);
        } catch (e) {
        }

        // Git 리포지토리 정보 표시
        // this.showGitRepositoryInfo(webviewView.webview);

        // 🆕 VSCode 시작 시 세션 자동 복원
        this.restoreSessionOnStartup(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (data: any) => {

            // ✅ __BOOT_PING__ 테스트 메시지 확인
            if (data.command === '__BOOT_PING__') {
                return;
            }


            // ✅ 테스트 메시지 처리
            if (data.command === '__PING__') {
                return;
            }

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

                        const aiModelEngine = await stateManager.getAiModel();
                        let currentModel = '';
                        if (aiModelEngine === 'gemini') {
                            currentModel = await stateManager.getGeminiModel();
                        } else {
                            currentModel = await stateManager.getOllamaModel();
                        }

                        webviewView.webview.postMessage({
                            command: 'ollamaModels',
                            models,
                            current: currentModel
                        });
                    } catch (e) {
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

                        // Ollama 모델인 경우 엔진을 ollama로 설정하고 모델명 저장
                        await stateManager.saveAiModel('ollama');
                        await stateManager.saveCurrentAiModel('ollama');
                        await stateManager.saveOllamaModel(modelName);

                        // 원격 서버를 사용하는 경우에도 모델명이 적용되도록 저장
                        const serverType = await stateManager.getOllamaServerType();
                        if (serverType === 'remote') {
                            await stateManager.saveRemoteOllamaModel(modelName);
                        }

                        // OllamaApi 인스턴스 업데이트
                        if (this.ollamaApi) {
                            this.ollamaApi.setModel(modelName);
                        }

                        webviewView.webview.postMessage({
                            command: 'ollamaModelChanged',
                            model: modelName
                        });
                    } catch (e) {
                        webviewView.webview.postMessage({
                            command: 'ollamaModelChanged',
                            model: '',
                            error: '모델을 저장하지 못했습니다.'
                        });
                    }
                    break;
                }
                case 'setGeminiModel': {
                    try {
                        const modelName = typeof data.model === 'string' ? data.model : '';
                        if (!modelName) {
                            throw new Error('Invalid model name');
                        }
                        const stateManager = StateManager.getInstance(this.context);

                        // Gemini 모델인 경우 엔진을 gemini로 설정하고 모델명 저장
                        await stateManager.saveAiModel('gemini');
                        await stateManager.saveCurrentAiModel('gemini');
                        await stateManager.saveGeminiModel(modelName);

                        // GeminiApi 인스턴스 업데이트
                        if (this.geminiApi) {
                            this.geminiApi.updateModelName(modelName);
                        }

                        webviewView.webview.postMessage({
                            command: 'ollamaModelChanged', // 기존 UI 호환성을 위해 동일한 명령 사용 가능 또는 새 명령 정의
                            model: modelName
                        });
                    } catch (e) {
                    }
                    break;
                }
                case 'setBanyaModel': {
                    try {
                        const modelName = typeof data.model === 'string' ? data.model : '';
                        if (!modelName) {
                            throw new Error('Invalid model name');
                        }
                        const stateManager = StateManager.getInstance(this.context);
                        const config = vscode.workspace.getConfiguration('codepilot');

                        // Banya 모델인 경우 엔진을 banya로 설정하고 모델명 저장
                        await stateManager.saveAiModel('banya');
                        await stateManager.saveCurrentAiModel('banya');
                        await config.update('banyaModel', modelName, vscode.ConfigurationTarget.Global);

                        // BanyaApi 인스턴스 업데이트
                        if (this.banyaApi) {
                            this.banyaApi.setModel(modelName);
                        }

                        webviewView.webview.postMessage({
                            command: 'ollamaModelChanged',
                            model: modelName
                        });
                    } catch (e) {
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
                        this.notificationService.showErrorMessage('파일을 열 수 없습니다.');
                    }
                    break;
                }
                case 'analyzeErrors': {
                    try {
                        // 🆕 ErrorManager를 사용하여 최근 오류 분석
                        const { ErrorManager } = await import('../../core/managers/error/ErrorManager');
                        const { ErrorSource } = await import('../../core/managers/error/types');
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
                                sender: 'CODEPILOT',
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
                        this.notificationService.showErrorMessage('오류 분석 중 문제가 발생했습니다.');
                    }
                    break;
                }
                case 'sendMessage':
                    // 시리얼 번호 검증
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
                            sender: 'CODEPILOT',
                            text: licenseNotSetMessage
                        });
                        return;
                    }

                    // 시리얼 번호 검증
                    const licenseService = new LicenseService();
                    const verificationResult = await licenseService.verifyLicense(licenseSerial);
                    if (!verificationResult.success) {
                        webviewView.webview.postMessage({
                            command: 'receiveMessage',
                            sender: 'CODEPILOT',
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
                        terminalContext: data.terminalContext,
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
                    break;
                case 'webviewLoaded':
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
                case 'executeSlashCommand': {
                    const action = data.action;
                    console.log(`[ChatViewProvider] Executing slash command: ${action}`);
                    try {
                        switch (action) {
                            case 'viewCacheStats':
                                await vscode.commands.executeCommand('codepilot.viewCacheStats');
                                break;
                            case 'clearCache':
                                await vscode.commands.executeCommand('codepilot.clearCache');
                                break;
                            case 'listSavedSessions':
                                await vscode.commands.executeCommand('codepilot.listSavedSessions');
                                break;
                            case 'restoreSavedSession':
                                await vscode.commands.executeCommand('codepilot.restoreSavedSession');
                                break;
                            case 'compactConversation':
                                await vscode.commands.executeCommand('codepilot.compactConversation');
                                break;
                            default:
                                console.warn(`[ChatViewProvider] Unknown slash command: ${action}`);
                        }
                    } catch (error) {
                        console.error(`[ChatViewProvider] Slash command execution failed:`, error);
                    }
                    break;
                }
                case 'approveAllChanges': {
                    try {
                        const { InlineDiffManager } = await import('../../core/managers/diff/InlineDiffManager');
                        const inlineDiffManager = InlineDiffManager.getInstance();
                        await inlineDiffManager.acceptAllChangesForAllFiles();
                    } catch (e) {
                        this.notificationService.showErrorMessage('변경사항 승인에 실패했습니다.');
                    }
                    break;
                }
                case 'rejectAllChanges': {
                    try {
                        const { InlineDiffManager } = await import('../../core/managers/diff/InlineDiffManager');
                        const inlineDiffManager = InlineDiffManager.getInstance();
                        await inlineDiffManager.rejectAllChangesForAllFiles();
                    } catch (e) {
                        this.notificationService.showErrorMessage('변경사항 거부에 실패했습니다.');
                    }
                    break;
                }
                case 'acceptAllChangesForFile': {
                    console.log('[ChatViewProvider] Received acceptAllChangesForFile command');
                    try {
                        const filePath = data.filePath;
                        console.log('[ChatViewProvider] File path:', filePath);
                        if (!filePath) {
                            console.warn('[ChatViewProvider] No file path provided');
                            break;
                        }
                        console.log('[ChatViewProvider] Importing InlineDiffManager...');
                        const { InlineDiffManager } = await import('../../core/managers/diff/InlineDiffManager');
                        const inlineDiffManager = InlineDiffManager.getInstance();
                        console.log('[ChatViewProvider] Calling acceptAllChanges for:', filePath);
                        await inlineDiffManager.acceptAllChanges(filePath);
                        console.log('[ChatViewProvider] acceptAllChanges completed for:', filePath);

                        // ✅ Pending Changes 드롭다운 업데이트
                        const stats = inlineDiffManager.getPendingChangesStats();
                        webviewView.webview.postMessage({
                            command: 'updatePendingChanges',
                            files: stats
                        });
                    } catch (e) {
                        console.error('[ChatViewProvider] acceptAllChangesForFile failed:', e);
                    }
                    break;
                }
                case 'rejectAllChangesForFile': {
                    console.log('[ChatViewProvider] Received rejectAllChangesForFile command');
                    try {
                        const filePath = data.filePath;
                        console.log('[ChatViewProvider] File path:', filePath);
                        if (!filePath) {
                            console.warn('[ChatViewProvider] No file path provided');
                            break;
                        }
                        console.log('[ChatViewProvider] Importing InlineDiffManager...');
                        const { InlineDiffManager } = await import('../../core/managers/diff/InlineDiffManager');
                        const inlineDiffManager = InlineDiffManager.getInstance();
                        console.log('[ChatViewProvider] Calling rejectAllChanges for:', filePath);
                        await inlineDiffManager.rejectAllChanges(filePath);
                        console.log('[ChatViewProvider] rejectAllChanges completed for:', filePath);

                        // ✅ Pending Changes 드롭다운 업데이트
                        const stats = inlineDiffManager.getPendingChangesStats();
                        webviewView.webview.postMessage({
                            command: 'updatePendingChanges',
                            files: stats
                        });
                    } catch (e) {
                        console.error('[ChatViewProvider] rejectAllChangesForFile failed:', e);
                    }
                    break;
                }
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
                            command: 'clearHistory'
                        });
                    } catch (error) {
                        webviewView.webview.postMessage({
                            command: 'receiveMessage',
                            sender: 'CODEPILOT',
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
                    try {
                        // 선택된 프로젝트 타입을 저장하고 현재 요청을 다시 처리
                        // 이는 임시로 전역 변수나 storage에 저장하고 재요청하는 방식으로 구현 가능
                        // 현재는 단순히 로그만 남기고, 향후 확장 가능하도록 구조화
                        this.notificationService.showInfoMessage(`프로젝트 타입이 선택되었습니다: ${data.projectType}`);
                        // TODO: 선택된 프로젝트 타입을 사용하여 요청 재처리
                    } catch (error) {
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
                case 'openFile':
                    try {
                        const filePath = data.filePath;
                        if (!filePath) {
                            break;
                        }

                        // 워크스페이스 루트 확인
                        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                        if (!workspaceRoot) {
                            break;
                        }

                        // 상대 경로를 절대 경로로 변환
                        const absolutePath = path.isAbsolute(filePath)
                            ? filePath
                            : path.join(workspaceRoot, filePath);

                        const fileUri = vscode.Uri.file(absolutePath);

                        // 파일 열기
                        const document = await vscode.workspace.openTextDocument(fileUri);

                        // ✅ 파일을 열고 포커스를 이동시킴
                        const editor = await vscode.window.showTextDocument(document, {
                            preview: false,
                            preserveFocus: false,
                            viewColumn: vscode.ViewColumn.Active
                        });

                        // ✅ 수정된 위치로 이동 (있으면)
                        if (editor) {
                            const diffManager = InlineDiffManager.getInstance();
                            const firstModifiedLine = diffManager.getFirstModifiedLine(absolutePath);

                            if (firstModifiedLine !== null && firstModifiedLine >= 0) {
                                // 수정된 첫 번째 라인으로 이동
                                const targetLine = Math.min(firstModifiedLine, document.lineCount - 1);
                                const position = new vscode.Position(targetLine, 0);
                                editor.selection = new vscode.Selection(position, position);
                                editor.revealRange(
                                    new vscode.Range(position, position),
                                    vscode.TextEditorRevealType.InCenter
                                );
                            } else {
                                // 수정된 위치가 없으면 첫 번째 줄로 이동
                                const firstLine = new vscode.Position(0, 0);
                                editor.selection = new vscode.Selection(firstLine, firstLine);
                                editor.revealRange(
                                    new vscode.Range(firstLine, firstLine),
                                    vscode.TextEditorRevealType.InCenter
                                );
                            }
                        }
                    } catch (error: any) {
                        this.notificationService.showErrorMessage(`파일을 열 수 없습니다: ${error.message || error}`);
                    }
                    break;
                case 'openDiff':
                    try {
                        const filePath = data.filePath;
                        if (!filePath) {
                            break;
                        }

                        // 워크스페이스 루트 확인
                        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                        if (!workspaceRoot) {
                            break;
                        }

                        // 상대 경로를 절대 경로로 변환
                        const absolutePath = path.isAbsolute(filePath)
                            ? filePath
                            : path.join(workspaceRoot, filePath);

                        const fileUri = vscode.Uri.file(absolutePath);

                        // InlineDiffManager에서 beforeContent 가져오기
                        const diffManager = InlineDiffManager.getInstance();
                        const beforeContent = diffManager.getCheckpointBeforeContent(absolutePath);

                        if (!beforeContent) {
                            this.notificationService.showErrorMessage('Diff를 표시할 이전 버전이 없습니다.');
                            break;
                        }

                        // VSCode diff 에디터 제목
                        const title = `${path.basename(absolutePath)} (Before ↔ After)`;

                        // Before 내용을 가상 문서로 생성
                        const beforeUri = vscode.Uri.parse(`codepilot-diff:${absolutePath}.before`);

                        // 가상 문서 프로바이더 등록 (한번만)
                        if (!this.diffDocumentProvider) {
                            this.diffDocumentProvider = new DiffDocumentProvider(diffManager);
                            this.context.subscriptions.push(
                                vscode.workspace.registerTextDocumentContentProvider('codepilot-diff', this.diffDocumentProvider)
                            );
                        }

                        // Diff 에디터 열기
                        await vscode.commands.executeCommand(
                            'vscode.diff',
                            beforeUri,
                            fileUri,
                            title
                        );

                    } catch (error: any) {
                        this.notificationService.showErrorMessage(`Diff를 열 수 없습니다: ${error.message || error}`);
                    }
                    break;

                // Pending Changes 관련 명령들
                case 'requestPendingChanges': {
                    try {
                        const diffManager = InlineDiffManager.getInstance();
                        const stats = diffManager.getPendingChangesStats();
                        webviewView.webview.postMessage({
                            command: 'updatePendingChanges',
                            files: stats
                        });
                    } catch (error) {
                        console.error('[ChatViewProvider] Failed to get pending changes:', error);
                    }
                    break;
                }

                case 'viewPendingDiff': {
                    try {
                        const filePath = data.filePath;
                        if (!filePath) break;

                        // 워크스페이스 루트 확인
                        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                        if (!workspaceRoot) break;

                        const absolutePath = path.isAbsolute(filePath)
                            ? filePath
                            : path.join(workspaceRoot, filePath);

                        const fileUri = vscode.Uri.file(absolutePath);
                        const diffManager = InlineDiffManager.getInstance();
                        const beforeContent = diffManager.getCheckpointBeforeContent(absolutePath);

                        if (!beforeContent) {
                            // beforeContent가 없으면 그냥 파일 열기
                            await vscode.window.showTextDocument(fileUri);
                            break;
                        }

                        const title = `${path.basename(absolutePath)} (Before ↔ After)`;
                        const beforeUri = vscode.Uri.parse(`codepilot-diff:${absolutePath}.before`);

                        if (!this.diffDocumentProvider) {
                            this.diffDocumentProvider = new DiffDocumentProvider(diffManager);
                            this.context.subscriptions.push(
                                vscode.workspace.registerTextDocumentContentProvider('codepilot-diff', this.diffDocumentProvider)
                            );
                        }

                        await vscode.commands.executeCommand('vscode.diff', beforeUri, fileUri, title);
                    } catch (error: any) {
                        this.notificationService.showErrorMessage(`Diff를 열 수 없습니다: ${error.message || error}`);
                    }
                    break;
                }

                case 'acceptPendingFile': {
                    try {
                        const filePath = data.filePath;
                        if (!filePath) break;

                        const diffManager = InlineDiffManager.getInstance();
                        await diffManager.acceptAllChanges(filePath);

                        // 업데이트된 pending changes 전송
                        const stats = diffManager.getPendingChangesStats();
                        webviewView.webview.postMessage({
                            command: 'updatePendingChanges',
                            files: stats
                        });

                        // 알림 메시지 제거됨
                        // this.notificationService.showInfoMessage(`${path.basename(filePath)} 변경사항이 승인되었습니다.`);
                    } catch (error: any) {
                        this.notificationService.showErrorMessage(`승인 실패: ${error.message || error}`);
                    }
                    break;
                }

                case 'rejectPendingFile': {
                    try {
                        const filePath = data.filePath;
                        if (!filePath) break;

                        const diffManager = InlineDiffManager.getInstance();
                        await diffManager.rejectAllChanges(filePath);

                        // 업데이트된 pending changes 전송
                        const stats = diffManager.getPendingChangesStats();
                        webviewView.webview.postMessage({
                            command: 'updatePendingChanges',
                            files: stats
                        });

                        this.notificationService.showInfoMessage(`${path.basename(filePath)} 변경사항이 거부되었습니다.`);
                    } catch (error: any) {
                        this.notificationService.showErrorMessage(`거부 실패: ${error.message || error}`);
                    }
                    break;
                }

                case 'acceptAllPendingFiles': {
                    try {
                        const diffManager = InlineDiffManager.getInstance();
                        await diffManager.acceptAllChangesForAllFiles();

                        webviewView.webview.postMessage({
                            command: 'updatePendingChanges',
                            files: []
                        });
                    } catch (error: any) {
                        this.notificationService.showErrorMessage(`전체 승인 실패: ${error.message || error}`);
                    }
                    break;
                }

                case 'rejectAllPendingFiles': {
                    try {
                        const diffManager = InlineDiffManager.getInstance();
                        await diffManager.rejectAllChangesForAllFiles();

                        webviewView.webview.postMessage({
                            command: 'updatePendingChanges',
                            files: []
                        });
                    } catch (error: any) {
                        this.notificationService.showErrorMessage(`전체 거부 실패: ${error.message || error}`);
                    }
                    break;
                }

                case 'requestFileList': {
                    try {
                        await this.sendFileList(webviewView.webview);
                    } catch (error: any) {
                        console.error('[ChatViewProvider] Failed to get file list:', error);
                    }
                    break;
                }

                case 'requestTerminalList': {
                    try {
                        await this.sendTerminalList(webviewView.webview);
                    } catch (error: any) {
                        console.error('[ChatViewProvider] Failed to get terminal list:', error);
                    }
                    break;
                }

                case 'requestTerminalContext': {
                    try {
                        const terminalName = data.terminalName;
                        await this.sendTerminalContext(webviewView.webview, terminalName);
                    } catch (error: any) {
                        console.error('[ChatViewProvider] Failed to get terminal context:', error);
                    }
                    break;
                }
            }
        });
        webviewView.onDidDispose(() => {
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

    private async sendFileList(webview: vscode.Webview) {
        try {
            // 프로젝트 루트 경로 가져오기
            const projectRoot = await this.configurationService.getProjectRoot();
            let searchRoot: vscode.Uri | undefined;

            if (projectRoot) {
                try {
                    searchRoot = vscode.Uri.file(projectRoot);
                    await vscode.workspace.fs.stat(searchRoot);
                } catch (error) {
                    console.warn('설정된 프로젝트 루트 경로에 접근할 수 없습니다:', error);
                    searchRoot = undefined;
                }
            }

            if (!searchRoot && vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
                searchRoot = vscode.workspace.workspaceFolders[0].uri;
            }

            if (!searchRoot) {
                webview.postMessage({
                    command: 'fileListReceived',
                    files: []
                });
                return;
            }

            // 제외할 디렉토리 패턴 (공용 상수 사용)
            // glob 패턴에서 사용할 수 있도록 중괄호 안에 쉼표로 구분된 리스트 생성
            // 점(.)으로 시작하는 디렉토리와 일반 디렉토리를 모두 포함
            const excludeDirs = EXCLUDED_LIBRARY_PATHS
                .filter((excludedPath: string) => !excludedPath.includes('*') && !excludedPath.includes('/')) // 와일드카드와 경로 구분자 제외
                .join(',');
            const excludePattern = `**/{${excludeDirs}}/**`;

            // 파일 검색 (최대 500개로 제한)
            const files = await vscode.workspace.findFiles(
                new vscode.RelativePattern(searchRoot, '**/*'),
                excludePattern,
                500
            );

            const fileList = files.map(uri => {
                const fsPath = uri.fsPath;
                const relativePath = path.relative(searchRoot!.fsPath, fsPath);
                const fileName = path.basename(fsPath);
                return {
                    path: fsPath,
                    name: fileName,
                    relativePath: relativePath
                };
            }).sort((a, b) => {
                // 파일명으로 정렬
                return a.name.localeCompare(b.name);
            });

            webview.postMessage({
                command: 'fileListReceived',
                files: fileList
            });
        } catch (error) {
            console.error('Error getting file list:', error);
            webview.postMessage({
                command: 'fileListReceived',
                files: []
            });
        }
    }

    private async sendTerminalList(webview: vscode.Webview) {
        try {
            const terminalManager = TerminalManager.getInstance();

            // VS Code의 모든 터미널 가져오기
            const vscodeTerminals = vscode.window.terminals;

            // TerminalManager의 히스토리와 매칭
            const history = terminalManager.getHistory();

            const terminalList = vscodeTerminals.map(terminal => {
                // 해당 터미널의 히스토리 명령어 수 계산
                const terminalHistory = history.getAll().filter((entry: any) =>
                    entry.sessionName === terminal.name
                );

                return {
                    name: terminal.name,
                    commandCount: terminalHistory.length
                };
            });

            webview.postMessage({
                command: 'terminalListReceived',
                terminals: terminalList
            });
        } catch (error) {
            console.error('Error getting terminal list:', error);
            webview.postMessage({
                command: 'terminalListReceived',
                terminals: []
            });
        }
    }

    private async sendTerminalContext(webview: vscode.Webview, terminalName: string) {
        try {
            const terminalManager = TerminalManager.getInstance();

            // 해당 터미널의 히스토리 가져오기
            const history = terminalManager.getHistory();
            const terminalHistory = history.getAll().filter((entry: any) =>
                entry.sessionName === terminalName
            );

            // 최근 20개의 명령어와 출력 가져오기
            const recentEntries = terminalHistory.slice(-20);

            // 컨텍스트 구성
            const commands = recentEntries.map((entry: any) => ({
                command: entry.command.command,
                output: entry.command.output?.combined || entry.command.output?.stdout || '',
                exitCode: entry.command.exitCode,
                timestamp: entry.command.timestamp
            }));

            const terminalContext = {
                name: terminalName,
                commands: commands,
                // 요약된 컨텍스트 문자열 생성
                contextString: this.formatTerminalContext(terminalName, commands)
            };

            webview.postMessage({
                command: 'terminalContextReceived',
                terminalContext: terminalContext
            });
        } catch (error) {
            console.error('Error getting terminal context:', error);
            webview.postMessage({
                command: 'terminalContextReceived',
                terminalContext: null
            });
        }
    }

    private formatTerminalContext(terminalName: string, commands: Array<{command: string; output: string; exitCode?: number; timestamp: number}>): string {
        if (commands.length === 0) {
            return `[Terminal: ${terminalName}]\n(No command history)`;
        }

        let context = `[Terminal: ${terminalName}]\n`;
        context += `Recent ${commands.length} commands:\n\n`;

        for (const cmd of commands) {
            const status = cmd.exitCode === 0 ? '✓' : cmd.exitCode !== undefined ? `✗(${cmd.exitCode})` : '?';
            context += `$ ${cmd.command} ${status}\n`;
            if (cmd.output && cmd.output.trim()) {
                // 출력이 너무 길면 자르기
                const output = cmd.output.trim();
                const maxOutputLength = 500;
                if (output.length > maxOutputLength) {
                    context += output.substring(0, maxOutputLength) + '...(truncated)\n';
                } else {
                    context += output + '\n';
                }
            }
            context += '\n';
        }

        return context;
    }

    private async executeBashCommands(commands: string[]): Promise<void> {
        try {

            if (!commands || commands.length === 0) {
                return;
            }

            // OS 정보 가져오기
            const platform = require('os').platform();
            const userOS = platform === 'darwin' ? 'macos' : platform === 'win32' ? 'windows' : platform === 'linux' ? 'linux' : 'unknown';

            // OS별 적절한 셸 선택
            let shellPath: string;
            let terminalName: string;

            if (userOS === 'windows') {
                shellPath = 'powershell.exe';
                terminalName = 'CODEPILOT PowerShell Commands';
            } else if (userOS === 'macos') {
                shellPath = '/bin/bash';
                terminalName = 'CODEPILOT Bash Commands';
            } else if (userOS === 'linux') {
                shellPath = '/bin/bash';
                terminalName = 'CODEPILOT Bash Commands';
            } else {
                const osAdapter = ExecutionManager.getInstance().getOSAdapter();
                shellPath = osAdapter.osType === 'win32' ? 'powershell.exe' : '/bin/bash';
                terminalName = osAdapter.osType === 'win32' ? 'CODEPILOT PowerShell Commands' : 'CODEPILOT Bash Commands';
            }

            // ConfigurationService.getProjectRoot()는 항상 워크스페이스 루트만 반환합니다.
            const terminalCwd = await this.configurationService.getProjectRoot();
            if (terminalCwd) {
            } else {
            }

            const terminal = vscode.window.createTerminal({ name: terminalName, shellPath, cwd: terminalCwd });
            terminal.show();
            await new Promise(resolve => setTimeout(resolve, 500));

            // 터미널에 명령어를 직접 전송 (heredoc/here-string 없이)
            for (const command of commands) {
                if (command.trim()) {
                    terminal.sendText(command.trim());
                }
            }


            setTimeout(() => {
                this._view?.webview.postMessage({ command: 'hideRunExecution' });
            }, 2000);

        } catch (error) {
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
    //         }
    //     }

    /**
     * 세션의 대화 히스토리를 복원
     * ✅ 개선: uiMessages가 있으면 코드블록, 액션 영역 포함하여 복원
     */
    public restoreConversationHistory(conversationHistory: any[]): void {
        if (!this._view) {
            console.warn('[ChatViewProvider] Cannot restore conversation history: view not initialized');
            return;
        }

        console.log(`[ChatViewProvider] Restoring ${conversationHistory.length} conversation entries`);

        // 먼저 채팅 패널 초기화
        this._view.webview.postMessage({
            command: 'clearChat'
        });

        // 각 대화 항목을 순차적으로 표시
        // ConversationEntry 형식: { userRequest, assistantResponse, uiMessages, ... }
        conversationHistory.forEach(entry => {
            // 사용자 요청 표시
            if (entry.userRequest) {
                this._view?.webview.postMessage({
                    command: 'displayUserMessage',
                    text: entry.userRequest
                });
            }

            // ✅ uiMessages가 있으면 전체 UI 메시지 복원 (코드블록, 액션 포함)
            if (entry.uiMessages && entry.uiMessages.length > 0) {
                entry.uiMessages.forEach((msg: { sender: string; text: string; type?: string }) => {
                    this._view?.webview.postMessage({
                        command: 'receiveMessage',
                        sender: msg.sender,
                        text: msg.text
                    });
                });
            } else if (entry.assistantResponse) {
                // uiMessages가 없으면 기존 방식 (ASK 모드 또는 구버전 데이터)
                this._view?.webview.postMessage({
                    command: 'receiveMessage',
                    sender: 'CODEPILOT',
                    text: entry.assistantResponse
                });
            } else if (entry.actions && entry.actions.length > 0) {
                // CODE 모드: 파일 변경 요약 표시 (구버전 호환)
                const actionSummary = this.generateActionSummary(entry);
                if (actionSummary) {
                    this._view?.webview.postMessage({
                        command: 'receiveMessage',
                        sender: 'CODEPILOT',
                        text: actionSummary
                    });
                }
            }
        });
    }

    /**
     * CODE 모드 액션 요약 생성
     */
    private generateActionSummary(entry: any): string {
        const parts: string[] = [];

        if (entry.filesCreated && entry.filesCreated.length > 0) {
            parts.push(`📁 생성된 파일: ${entry.filesCreated.join(', ')}`);
        }

        if (entry.filesModified && entry.filesModified.length > 0) {
            parts.push(`✏️ 수정된 파일: ${entry.filesModified.join(', ')}`);
        }

        if (entry.commandsExecuted && entry.commandsExecuted.length > 0) {
            parts.push(`💻 실행된 명령어: ${entry.commandsExecuted.length}개`);
        }

        if (parts.length === 0) {
            return '';
        }

        return `**작업 완료** (${entry.result})\n\n${parts.join('\n')}`;
    }

    /**
     * 외부에서 채팅 패널에 메시지를 보낼 수 있는 public 메서드
     */
    public postMessageToWebview(message: any): void {
        console.log('[ChatViewProvider] Sending message to webview:', message);
        this._view?.webview.postMessage(message);
    }

    /**
     * VSCode 시작 시 세션 자동 복원
     * - 대화 히스토리 복원
     * - 토큰 사용량 및 컨텍스트 수 복원
     */
    private restoreSessionOnStartup(webview: vscode.Webview): void {
        // 약간의 지연 후 복원 (웹뷰 초기화 완료 대기)
        setTimeout(async () => {
            try {
                const sessionManager = SessionManager.getInstance(this.context);
                const currentSession = sessionManager.getCurrentSession();

                if (!currentSession) {
                    console.log('[ChatViewProvider] No session to restore');
                    return;
                }

                console.log(`[ChatViewProvider] Restoring session: ${currentSession.id}`);

                // 1. 대화 히스토리 복원
                if (currentSession.conversationHistory && currentSession.conversationHistory.length > 0) {
                    this.restoreConversationHistory(currentSession.conversationHistory);
                    console.log(`[ChatViewProvider] Restored ${currentSession.conversationHistory.length} conversation entries`);
                }

                // 2. 토큰 사용량 및 컨텍스트 수 복원
                const stats = sessionManager.getCumulativeSessionStats();
                const config = vscode.workspace.getConfiguration('codepilot');
                const maxTokens = config.get<number>('maxInputTokens') || 128000;

                webview.postMessage({
                    command: 'updateContextInfo',
                    contextInfo: {
                        messageCount: stats.messageCount,
                        tokenUsage: {
                            current: stats.totalTokensUsed,
                            max: maxTokens,
                            percentage: (stats.totalTokensUsed / maxTokens) * 100
                        }
                    }
                });

                console.log(`[ChatViewProvider] Restored context info: ${stats.messageCount} messages, ${stats.totalTokensUsed} tokens`);
            } catch (error) {
                console.error('[ChatViewProvider] Failed to restore session:', error);
            }
        }, 1000); // 1초 지연
    }
}