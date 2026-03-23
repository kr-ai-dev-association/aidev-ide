import * as vscode from 'vscode';
import * as path from 'path';
import { getHtmlContentWithUris } from '../../utils';
import { PromptType, NotificationService, AiModelType } from '../../services';
import { SettingsManager, TerminalManager, ConversationService, TaskManager, ExecutionManager, StateManager, SessionManager } from '../../core';
import { AgentConfig } from '../../core/config/AgentConfig';
import { ModelConnectionService } from '../../core/managers/model/ModelConnectionService';
import { InlineDiffManager } from '../../core/managers/diff/InlineDiffManager';
import { getAllExclusionPaths } from '../../core/utils/FileExclusionConstants';
import { WebviewBridge } from '../../core/webview/WebviewBridge';
// AuthService removed (standalone mode)

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
    private runTerminal: vscode.Terminal | null = null;

    // 히스토리 lazy loading
    private static readonly HISTORY_PAGE_SIZE = 20;
    private _fullConversationHistory: any[] = [];
    private _historyLoadedCount = 0;

    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly context: vscode.ExtensionContext,
        private readonly openSettingsPanel: (viewColumn: vscode.ViewColumn) => void,
        private readonly configurationService: SettingsManager,
        private readonly notificationService: NotificationService,
        private readonly ollamaApi: any
    ) { }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        try {
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

            const htmlContent = getHtmlContentWithUris(this.extensionUri, 'chat', webviewView.webview);
            if (htmlContent && !htmlContent.includes('Error loading')) {
                webviewView.webview.html = htmlContent;
            } else {
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

        // 🆕 에디터 텍스트 선택 감지 → WebView에 chip 표시용으로 전달
        const selectionDisposable = vscode.window.onDidChangeTextEditorSelection((e) => {
            if (!webviewView.visible) return;
            const editor = e.textEditor;
            const selection = editor.selection;
            if (selection.isEmpty) {
                // 선택 해제 시 WebView에 알림
                webviewView.webview.postMessage({ command: 'editorSelectionCleared' });
            } else {
                const selectedText = editor.document.getText(selection);
                // 너무 짧거나 너무 길면 무시
                if (selectedText.trim().length < AgentConfig.EDITOR_SELECTION_MIN_LENGTH || selectedText.length > AgentConfig.EDITOR_SELECTION_MAX_LENGTH) return;
                const fileName = path.basename(editor.document.fileName);
                webviewView.webview.postMessage({
                    command: 'editorSelectionChanged',
                    text: selectedText,
                    fileName,
                    lineStart: selection.start.line + 1,
                    lineEnd: selection.end.line + 1,
                });
            }
        });
        webviewView.onDidDispose(() => selectionDisposable.dispose());

        // 🆕 Turn-level pending changes 이벤트 구독
        const pendingChangedDisposable = InlineDiffManager.getInstance().onPendingChanged(() => {
            const diffManager = InlineDiffManager.getInstance();
            const stats = diffManager.getPendingChangesStats();
            const turnStats = diffManager.getPendingChangesByTurn();
            webviewView.webview.postMessage({ command: 'updatePendingChanges', files: stats });
            webviewView.webview.postMessage({ command: 'updatePendingChangesByTurn', turns: turnStats });
        });
        webviewView.onDidDispose(() => pendingChangedDisposable.dispose());

        // 🆕 VSCode 설정 변경 감지 (테마 등)
        const configChangeDisposable = vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('codepilot.chatTheme')) {
                const config = vscode.workspace.getConfiguration('codepilot');
                const theme = config.get<string>('chatTheme') || 'dark';
                webviewView.webview.postMessage({
                    command: 'chatTheme',
                    theme: theme
                });
            }
        });
        this.context.subscriptions.push(configChangeDisposable);

        // 🆕 웹뷰 초기화 후 모델 정보 proactive push (SecretStorage 지연 대응)
        this.pushCurrentModelToWebview(webviewView.webview, 1500);
        this.pushCurrentModelToWebview(webviewView.webview, 4000);

        // Standalone: 인증 불필요 — 항상 로그인 상태로 처리

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
                // ═══════════ 히스토리 lazy loading ═══════════
                case 'loadMoreHistory': {
                    this.loadMoreHistory();
                    break;
                }

                case 'priorityErrorPrompt': {
                    const text = typeof data.text === 'string' ? data.text : '';
                    if (text) {
                        try {
                            // 로딩 상태 표시
                            WebviewBridge.showLoading(webviewView.webview);
                            await ConversationService.handleUserMessage({
                                userQuery: text,
                                webviewToRespond: webviewView.webview,
                                promptType: PromptType.CODE_GENERATION,
                                extensionContext: this.context,
                                notificationService: this.notificationService,
                            });
                        } catch (e) {
                            // 에러 발생 시 사용자에게 피드백
                            console.error('[ChatViewProvider] priorityErrorPrompt error:', e);
                            WebviewBridge.receiveMessage(
                                webviewView.webview,
                                'System',
                                `❌ 오류 처리 중 문제가 발생했습니다: ${e instanceof Error ? e.message : String(e)}`
                            );
                        } finally {
                            // 로딩 상태 숨기기
                            WebviewBridge.hideLoading(webviewView.webview);
                        }
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
                        if (aiModelEngine?.startsWith('admin:') || aiModelEngine?.startsWith('supported:')) {
                            currentModel = aiModelEngine;
                        } else if (aiModelEngine === 'ollama' || !aiModelEngine) {
                            currentModel = await stateManager.getOllamaModel();
                        } else {
                            currentModel = await stateManager.getOllamaModel();
                        }

                        // 빌트인 프리셋 모델 목록
                        let adminModels: { key: string; name: string; displayName: string }[] = [];
                        let supportedModels: { key: string; name: string; displayName: string; group: string }[] = [];
                        try {
                            const aiModelSettings = this.configurationService.getServerSettings('ai_model');
                            supportedModels = (aiModelSettings || [])
                                .filter((s: any) => s.source === 'preset' && s.value && s.value.enabled !== false)
                                .map((s: any) => ({
                                    key: s.key,
                                    name: `supported:${s.key}`,
                                    displayName: s.value?.name || s.key,
                                    group: s.group || 'default',
                                }));
                            adminModels = (aiModelSettings || [])
                                .filter((s: any) => s.source === 'admin' && s.value && s.value.enabled !== false)
                                .map((s: any) => ({
                                    key: s.key,
                                    name: `admin:${s.key}`,
                                    displayName: s.value?.model || s.value?.model_name || s.key,
                                }));
                        } catch { }

                        webviewView.webview.postMessage({
                            command: 'ollamaModels',
                            models,
                            current: currentModel,
                            adminModels,
                            supportedModels,
                        });
                    } catch (e) {
                        // Ollama 실패해도 admin/supported 모델은 표시
                        let adminModels: { key: string; name: string; displayName: string }[] = [];
                        let supportedModels: { key: string; name: string; displayName: string; group: string }[] = [];
                        try {
                            const aiModelSettings = this.configurationService.getServerSettings('ai_model');
                            supportedModels = (aiModelSettings || [])
                                .filter((s: any) => s.source === 'preset' && s.value && s.value.enabled !== false)
                                .map((s: any) => ({
                                    key: s.key,
                                    name: `supported:${s.key}`,
                                    displayName: s.value?.name || s.key,
                                    group: s.group || 'default',
                                }));
                            adminModels = (aiModelSettings || [])
                                .filter((s: any) => s.source === 'admin' && s.value && s.value.enabled !== false)
                                .map((s: any) => ({
                                    key: s.key,
                                    name: `admin:${s.key}`,
                                    displayName: s.value?.model || s.value?.model_name || s.key,
                                }));
                        } catch { }
                        webviewView.webview.postMessage({
                            command: 'ollamaModels',
                            models: [],
                            current: '',
                            adminModels,
                            supportedModels,
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

                        // Ollama 모델의 context length 조회 및 토큰 제한 업데이트
                        ModelConnectionService.getOllamaModelContextLength(modelName, this.ollamaApi?.getApiUrl?.())
                            .then((ctxLen: number | null) => {
                                if (ctxLen) {
                                    const { updateOllamaTokenLimits } = require('../../utils/tokenUtils');
                                    updateOllamaTokenLimits(ctxLen);
                                }
                            })
                            .catch(() => { /* non-critical */ });

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
                case 'setAdminModel': {
                    try {
                        const adminKey = typeof data.key === 'string' ? data.key : '';
                        if (!adminKey) break;
                        const stateManager = StateManager.getInstance(this.context);
                        const adminModelValue = `admin:${adminKey}`;

                        await stateManager.saveAiModel(adminModelValue);
                        await stateManager.saveCurrentAiModel('admin');

                        // 서버 설정에서 관리자 모델 config 추출 및 적용
                        const aiModelSettings = this.configurationService.getServerSettings('ai_model');
                        const adminSetting = aiModelSettings.find((s: any) => s.key === adminKey);
                        if (adminSetting?.value) {
                            const v = adminSetting.value;
                            // 프로바이더별 API 키 조회
                            const adminPresetGroup = (adminSetting as any).group || '';
                            const chatAdminUserApiKey = adminPresetGroup
                                ? (this.context.globalState.get<string>(`codepilot.apiKey.${adminPresetGroup}`) || '')
                                : (this.context.globalState.get<string>("codepilot.adminApiKey") || '');
                            const adminConfig = {
                                key: adminKey,
                                provider: v.provider || '',
                                model: v.model || v.model_name || '',
                                apiKey: chatAdminUserApiKey || v.api_key || v.apiKey || '',
                                endpoint: v.baseUrl || v.base_url || v.endpoint || '',
                                maxTokens: v.max_tokens || v.maxTokens || undefined,
                                contextWindow: v.context_window || v.contextWindow || undefined,
                                enabled: v.enabled !== false,
                                streamingSupported: v.streamingSupported ?? v.streaming_supported ?? true,
                                nativeToolCallingSupported: (v.nativeToolCallingSupported ?? v.native_tool_calling_supported) === true || String(v.nativeToolCallingSupported ?? v.native_tool_calling_supported) === 'true',
                            };
                            await stateManager.saveAdminModelConfig(JSON.stringify(adminConfig));
                            // LLMManager에 즉시 적용
                            const { LLMManager } = await import('../../core/managers/model/LLMManager');
                            const llmManager = LLMManager.getInstance();
                            llmManager.setAdminModelConfig(adminConfig as any);
                            llmManager.setCurrentModel(AiModelType.ADMIN);
                            // 토큰 제한 업데이트
                            const { updateAdminTokenLimits } = await import('../../utils/tokenUtils');
                            updateAdminTokenLimits(adminConfig.contextWindow, adminConfig.maxTokens);
                        }

                        webviewView.webview.postMessage({
                            command: 'ollamaModelChanged',
                            model: adminModelValue
                        });
                    } catch (e) {
                        console.warn('[ChatViewProvider] setAdminModel error:', e);
                    }
                    break;
                }
                case 'setSupportedModel': {
                    try {
                        const presetKey = typeof data.key === 'string' ? data.key : '';
                        if (!presetKey) break;
                        const stateManager = StateManager.getInstance(this.context);
                        const supportedModelValue = `supported:${presetKey}`;

                        await stateManager.saveAiModel(supportedModelValue);
                        await stateManager.saveCurrentAiModel('admin');

                        // 서버 설정에서 지원 모델 config 추출 및 적용
                        const aiModelSettings = this.configurationService.getServerSettings('ai_model');
                        const presetSetting = aiModelSettings.find((s: any) => s.key === presetKey);
                        if (presetSetting?.value) {
                            const v = presetSetting.value;
                            const customHeaders = v.customHeaders || v.custom_headers || {};
                            // 프로바이더별 API 키 조회 (group 기반)
                            const presetGroup = (presetSetting as any).group || '';
                            const chatUserApiKey = presetGroup
                                ? (this.context.globalState.get<string>(`codepilot.apiKey.${presetGroup}`) || '')
                                : (this.context.globalState.get<string>("codepilot.adminApiKey") || '');
                            const adminConfig = {
                                key: presetKey,
                                provider: v.provider || 'chat_completions',
                                model: v.model || v.model_name || '',
                                apiKey: chatUserApiKey || v.api_key || v.apiKey || '',
                                endpoint: v.baseUrl || v.base_url || v.endpoint || '',
                                maxTokens: v.max_tokens || v.maxTokens || undefined,
                                maxOutputTokens: v.maxOutputTokens || v.max_output_tokens || undefined,
                                contextWindow: v.context_window || v.contextWindow || undefined,
                                enabled: v.enabled !== false,
                                authType: v.authType || v.auth_type || 'bearer',
                                authHeaderName: v.authHeaderName || v.auth_header_name || undefined,
                                customHeaders: typeof customHeaders === 'string' ? JSON.parse(customHeaders || '{}') : customHeaders,
                                defaultTemperature: v.defaultTemperature ?? v.default_temperature ?? 0.7,
                                topP: v.topP ?? v.top_p ?? 0.9,
                                streamingSupported: v.streamingSupported ?? v.streaming_supported ?? true,
                                nativeToolCallingSupported: (v.nativeToolCallingSupported ?? v.native_tool_calling_supported) === true || String(v.nativeToolCallingSupported ?? v.native_tool_calling_supported) === 'true',
                            };
                            await stateManager.saveAdminModelConfig(JSON.stringify(adminConfig));
                            // LLMManager에 즉시 적용
                            const { LLMManager } = await import('../../core/managers/model/LLMManager');
                            const llmManager = LLMManager.getInstance();
                            llmManager.setAdminModelConfig(adminConfig as any);
                            llmManager.setCurrentModel(AiModelType.ADMIN);

                            // 토큰 제한 동적 업데이트
                            try {
                                const { updateAdminTokenLimits } = await import('../../utils/tokenUtils');
                                updateAdminTokenLimits(adminConfig.contextWindow, adminConfig.maxOutputTokens || adminConfig.maxTokens);
                            } catch { }
                        }
                    } catch (e) {
                        console.error('Failed to set supported model:', e);
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
                            notificationService: this.notificationService
                        });

                        this.notificationService.showInfoMessage('오류 분석을 시작했습니다.');
                    } catch (e) {
                        this.notificationService.showErrorMessage('오류 분석 중 문제가 발생했습니다.');
                    }
                    break;
                }
                case 'sendMessage':
                    // Standalone: 로그인 체크 불필요

                    // ConversationService를 통해 메시지 처리
                    const promptType = data.mode === 'ASK' ? PromptType.GENERAL_ASK : PromptType.CODE_GENERATION;

                    await ConversationService.handleUserMessage({
                        userQuery: data.text,
                        webviewToRespond: webviewView.webview,
                        promptType,
                        imageData: data.imageData,
                        imageMimeType: data.imageMimeType,
                        selectedFiles: data.selectedFiles,
                        selectedCode: data.selectedCode,
                        terminalContext: data.terminalContext,
                        diagnosticsContext: data.diagnosticsContext,
                        extensionContext: this.context,
                        notificationService: this.notificationService
                    });
                    break;
                case 'openPanel':
                    let panelViewColumn = vscode.ViewColumn.Beside;
                    if (vscode.window.activeTextEditor?.viewColumn) {
                        panelViewColumn = vscode.window.activeTextEditor.viewColumn;
                    }
                    if (data.panel === 'settings') this.openSettingsPanel(panelViewColumn);
                    break;
                case 'webviewLoaded': {
                    // 웹뷰 초기화 시 pending changes 복원
                    const sendPendingState = () => {
                        const diffMgr = InlineDiffManager.getInstance();
                        const stats = diffMgr.getPendingChangesStats();
                        const turnStats = diffMgr.getPendingChangesByTurn();
                        if (stats.length > 0) {
                            webviewView.webview.postMessage({ command: 'updatePendingChanges', files: stats });
                        }
                        if (turnStats.length > 0) {
                            webviewView.webview.postMessage({ command: 'updatePendingChangesByTurn', turns: turnStats });
                            webviewView.webview.postMessage({ command: 'showTurnActions', turns: turnStats });
                        }
                    };
                    // 즉시 시도 + loadPersistedState(async)가 아직 안 끝났을 경우 대비 지연 재시도
                    sendPendingState();
                    setTimeout(sendPendingState, AgentConfig.WEBVIEW_RESTORE_DELAY_MS);
                    break;
                }
                case 'cancelGeminiCall':
                    ConversationService.cancelCurrentCall();
                    // 즉시 로딩/처리 상태를 종료
                    webviewView.webview.postMessage({ command: 'hideLoading' });
                    webviewView.webview.postMessage({ command: 'cancelProcessing' });
                    webviewView.webview.postMessage({ command: 'resetProcessingState' });
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
                            case 'gitStatus':
                                await vscode.commands.executeCommand('codepilot.gitStatus');
                                break;
                            case 'gitDiff':
                                await vscode.commands.executeCommand('codepilot.gitDiff');
                                break;
                            case 'gitLog':
                                await vscode.commands.executeCommand('codepilot.gitLog');
                                break;
                            case 'gitBranch':
                                await vscode.commands.executeCommand('codepilot.gitBranch');
                                break;
                            case 'gitInfo':
                                await vscode.commands.executeCommand('codepilot.gitInfo');
                                break;
                            case 'gitStaged':
                                await vscode.commands.executeCommand('codepilot.gitStaged');
                                break;
                            case 'gitStash':
                                await vscode.commands.executeCommand('codepilot.gitStash');
                                break;
                            case 'viewMcpServers':
                                await vscode.commands.executeCommand('codepilot.viewMcpServers');
                                break;
                            case 'connectMcpServer':
                                await vscode.commands.executeCommand('codepilot.connectMcpServer');
                                break;
                            case 'disconnectMcpServer':
                                await vscode.commands.executeCommand('codepilot.disconnectMcpServer');
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
                        const diffModule = await import('../../core/managers/diff/InlineDiffManager');
                        const inlineDiffManager = diffModule.InlineDiffManager.getInstance();
                        await inlineDiffManager.acceptAllChangesForAllFiles();
                    } catch (e) {
                        this.notificationService.showErrorMessage('변경사항 승인에 실패했습니다.');
                    }
                    break;
                }
                case 'rejectAllChanges': {
                    try {
                        const diffModule = await import('../../core/managers/diff/InlineDiffManager');
                        const inlineDiffManager = diffModule.InlineDiffManager.getInstance();
                        await inlineDiffManager.rejectAllChangesForAllFiles();
                    } catch (e) {
                        this.notificationService.showErrorMessage('변경사항 거부에 실패했습니다.');
                    }
                    break;
                }
                case 'acceptAllChangesForFile': {
                    try {
                        const filePath = data.filePath;
                        if (!filePath) { break; }
                        const diffModule = await import('../../core/managers/diff/InlineDiffManager');
                        const inlineDiffManager = diffModule.InlineDiffManager.getInstance();
                        await inlineDiffManager.acceptAllChanges(filePath);

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
                    try {
                        const filePath = data.filePath;
                        if (!filePath) { break; }
                        const diffModule = await import('../../core/managers/diff/InlineDiffManager');
                        const inlineDiffManager = diffModule.InlineDiffManager.getInstance();
                        await inlineDiffManager.rejectAllChanges(filePath);

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
                    webviewView.webview.postMessage({
                        command: 'hideAutoCorrecting',
                        message: '명령어 실행이 중단되었습니다.'
                    });
                    break;
                case 'openFilePicker':
                    this.openFilePicker(webviewView.webview);
                    break;
                case 'executeBashCommands':
                    this.executeBashCommands(data.commands);
                    break;
                case 'stopBashCommand':
                    if (this.runTerminal) {
                        this.runTerminal.dispose();
                        this.runTerminal = null;
                        console.log('[ChatViewProvider] Run terminal stopped');
                    }
                    break;
                case 'clearHistory':
                    try {
                        await ConversationService.clearHistory(PromptType.CODE_GENERATION, this.context);
                        webviewView.webview.postMessage({
                            command: 'clearHistory'
                        });
                        // 턴 액션(undo/keep) 버튼 및 pending changes 초기화
                        webviewView.webview.postMessage({ command: 'updatePendingChangesByTurn', turns: [] });
                        webviewView.webview.postMessage({ command: 'updatePendingChanges', files: [] });
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
                        webviewView.webview.postMessage({
                            command: 'receiveMessage',
                            sender: 'CODEPILOT',
                            text: '대화기록 삭제에 실패했습니다.'
                        });
                    }
                    break;
                case 'displayUserMessage': // 웹뷰 자체에서 사용자 메시지 표시를 요청할 때, 이미지도 포함
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

                case 'acceptChangesByTurn': {
                    try {
                        const diffManager = InlineDiffManager.getInstance();
                        await diffManager.acceptChangesByTurn(data.conversationTurnId);
                    } catch (error: any) {
                        this.notificationService.showErrorMessage(`턴 승인 실패: ${error.message || error}`);
                    }
                    break;
                }

                case 'rejectChangesByTurn': {
                    try {
                        const diffManager = InlineDiffManager.getInstance();
                        await diffManager.rejectChangesByTurn(data.conversationTurnId);
                    } catch (error: any) {
                        this.notificationService.showErrorMessage(`턴 거부 실패: ${error.message || error}`);
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
                        // Continue IDE 방식: 활성 터미널의 내용을 직접 읽음
                        await this.sendActiveTerminalContext(webviewView.webview);
                    } catch (error: any) {
                        console.error('[ChatViewProvider] Failed to get terminal context:', error);
                    }
                    break;
                }

                case 'requestDiagnosticsContext': {
                    try {
                        await this.sendDiagnosticsContext(webviewView.webview);
                    } catch (error: any) {
                        console.error('[ChatViewProvider] Failed to get diagnostics context:', error);
                    }
                    break;
                }

                case 'saveChatTheme': {
                    try {
                        const theme = data.theme;
                        if (theme && ['dark', 'light', 'auto'].includes(theme)) {
                            const config = vscode.workspace.getConfiguration('codepilot');
                            await config.update('chatTheme', theme, vscode.ConfigurationTarget.Global);
                            webviewView.webview.postMessage({
                                command: 'chatThemeSaved',
                                theme: theme
                            });
                        }
                    } catch (error) {
                        console.error('[ChatViewProvider] Failed to save chat theme:', error);
                    }
                    break;
                }

                case 'getChatTheme': {
                    try {
                        const config = vscode.workspace.getConfiguration('codepilot');
                        const theme = config.get<string>('chatTheme') || 'dark';
                        webviewView.webview.postMessage({
                            command: 'chatTheme',
                            theme: theme
                        });
                    } catch (error) {
                        console.error('[ChatViewProvider] Failed to get chat theme:', error);
                        webviewView.webview.postMessage({
                            command: 'chatTheme',
                            theme: 'dark'
                        });
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

            // 제외할 디렉토리 패턴 (공용 상수 + 커스텀 패턴)
            // glob 패턴에서 사용할 수 있도록 중괄호 안에 쉼표로 구분된 리스트 생성
            // 점(.)으로 시작하는 디렉토리와 일반 디렉토리를 모두 포함
            const excludeDirs = getAllExclusionPaths()
                .filter((excludedPath: string) => !excludedPath.includes('*') && !excludedPath.includes('/') && !excludedPath.includes('\\')) // 와일드카드와 경로 구분자 제외
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
        // 더 이상 터미널 목록을 보내지 않음 - 활성 터미널만 사용
        // 이 메서드는 호환성을 위해 유지하되 빈 목록 반환
        webview.postMessage({
            command: 'terminalListReceived',
            terminals: []
        });
    }

    /**
     * 활성 터미널의 내용을 직접 읽어서 컨텍스트로 전송합니다.
     * Continue IDE 방식: 터미널 버퍼 내용을 직접 읽어옴
     */
    private async sendActiveTerminalContext(webview: vscode.Webview) {
        try {
            const activeTerminal = vscode.window.activeTerminal;

            if (!activeTerminal) {
                console.log('[ChatViewProvider] No active terminal found');
                webview.postMessage({
                    command: 'terminalContextReceived',
                    terminalContext: null,
                    error: '활성화된 터미널이 없습니다. 터미널을 열고 다시 시도해주세요.'
                });
                return;
            }

            const terminalName = activeTerminal.name;
            console.log(`[ChatViewProvider] Reading active terminal content: "${terminalName}"`);

            // 터미널 내용 읽기 시도
            let terminalContent = '';

            // 방법 1: 클립보드를 통해 터미널 전체 내용 복사 (가장 신뢰성 높음)
            try {
                // 기존 클립보드 내용 저장
                const originalClipboard = await vscode.env.clipboard.readText();

                // 터미널 포커스 및 전체 선택 + 복사
                activeTerminal.show(); // 터미널 포커스
                await new Promise(resolve => setTimeout(resolve, 100)); // 포커스 대기

                // 터미널 전체 선택 및 복사
                await vscode.commands.executeCommand('workbench.action.terminal.selectAll');
                await new Promise(resolve => setTimeout(resolve, 50));
                await vscode.commands.executeCommand('workbench.action.terminal.copySelection');
                await new Promise(resolve => setTimeout(resolve, 50));

                // 복사된 내용 읽기
                const copiedContent = await vscode.env.clipboard.readText();

                // 선택 해제
                await vscode.commands.executeCommand('workbench.action.terminal.clearSelection');

                // 클립보드 복원
                await vscode.env.clipboard.writeText(originalClipboard);

                if (copiedContent && copiedContent.trim()) {
                    console.log(`[ChatViewProvider] Got terminal content via clipboard: ${copiedContent.length} chars`);
                    // 내용이 너무 길면 마지막 5000자만
                    if (copiedContent.length > 5000) {
                        terminalContent = '...(earlier content truncated)\n\n' + copiedContent.slice(-5000);
                    } else {
                        terminalContent = copiedContent;
                    }
                }
            } catch (clipboardError) {
                console.warn('[ChatViewProvider] Clipboard method failed:', clipboardError);
            }

            // 방법 2: Shell Integration 히스토리 (클립보드 실패 시 fallback)
            if (!terminalContent) {
                const terminalManager = TerminalManager.getInstance();
                const shellHistory = terminalManager.getShellIntegrationHistory(terminalName);

                if (shellHistory.length > 0) {
                    console.log(`[ChatViewProvider] Using Shell Integration history: ${shellHistory.length} commands`);
                    const recentHistory = shellHistory.slice(-10);
                    for (const entry of recentHistory) {
                        const status = entry.exitCode === 0 ? '✓' : entry.exitCode !== undefined ? `✗(${entry.exitCode})` : '';
                        terminalContent += `$ ${entry.command} ${status}\n`;
                        if (entry.output && entry.output.trim()) {
                            const output = entry.output.trim();
                            if (output.length > 1000) {
                                terminalContent += '...(truncated)\n' + output.slice(-1000) + '\n';
                            } else {
                                terminalContent += output + '\n';
                            }
                        }
                        terminalContent += '\n';
                    }
                } else {
                    // 기존 TerminalHistory 사용
                    const history = terminalManager.getHistory();
                    const terminalHistory = history.getAll().filter((entry: any) =>
                        entry.sessionName === terminalName
                    ).slice(-10);

                    if (terminalHistory.length > 0) {
                        console.log(`[ChatViewProvider] Using TerminalHistory: ${terminalHistory.length} commands`);
                        for (const entry of terminalHistory) {
                            const cmd = entry.command;
                            const status = cmd.exitCode === 0 ? '✓' : cmd.exitCode !== undefined ? `✗(${cmd.exitCode})` : '';
                            terminalContent += `$ ${cmd.command} ${status}\n`;
                            const output = cmd.output?.combined || cmd.output?.stdout || '';
                            if (output && output.trim()) {
                                const trimmedOutput = output.trim();
                                if (trimmedOutput.length > 1000) {
                                    terminalContent += '...(truncated)\n' + trimmedOutput.slice(-1000) + '\n';
                                } else {
                                    terminalContent += trimmedOutput + '\n';
                                }
                            }
                            terminalContent += '\n';
                        }
                    } else {
                        terminalContent = '(No terminal content available)\n';
                        terminalContent += 'Tip: 터미널에서 명령어를 실행한 후 다시 시도해주세요.\n';
                    }
                }
            }

            const terminalContext = {
                name: terminalName,
                contextString: `[Terminal: ${terminalName}]\n\n${terminalContent}`
            };

            console.log(`[ChatViewProvider] Terminal context ready: ${terminalContext.contextString.length} chars`);

            webview.postMessage({
                command: 'terminalContextReceived',
                terminalContext: terminalContext
            });
        } catch (error) {
            console.error('Error getting active terminal context:', error);
            webview.postMessage({
                command: 'terminalContextReceived',
                terminalContext: null,
                error: '터미널 내용을 읽는 중 오류가 발생했습니다.'
            });
        }
    }


    /**
     * Diagnostics (에러/경고) 컨텍스트를 webview에 전송
     */
    private async sendDiagnosticsContext(webview: vscode.Webview) {
        try {
            // 모든 진단 정보 가져오기
            const allDiagnostics = vscode.languages.getDiagnostics();

            let errorCount = 0;
            let warningCount = 0;
            const diagnosticItems: Array<{
                file: string;
                line: number;
                column: number;
                severity: string;
                message: string;
                code?: string;
            }> = [];

            for (const [uri, diagnostics] of allDiagnostics) {
                // 워크스페이스 내 파일만 처리
                const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
                if (!workspaceFolder) continue;

                for (const diag of diagnostics) {
                    const severity = diag.severity === vscode.DiagnosticSeverity.Error ? 'error'
                        : diag.severity === vscode.DiagnosticSeverity.Warning ? 'warning'
                            : diag.severity === vscode.DiagnosticSeverity.Information ? 'info'
                                : 'hint';

                    if (severity === 'error') errorCount++;
                    else if (severity === 'warning') warningCount++;

                    // Error와 Warning만 포함 (info, hint 제외)
                    if (severity === 'error' || severity === 'warning') {
                        const relativePath = vscode.workspace.asRelativePath(uri);
                        diagnosticItems.push({
                            file: relativePath,
                            line: diag.range.start.line + 1,
                            column: diag.range.start.character + 1,
                            severity: severity,
                            message: diag.message,
                            code: typeof diag.code === 'object' ? String(diag.code.value) : String(diag.code || '')
                        });
                    }
                }
            }

            // 컨텍스트 문자열 생성
            const contextString = this.formatDiagnosticsContext(diagnosticItems, errorCount, warningCount);

            const diagnosticsContext = {
                errorCount,
                warningCount,
                items: diagnosticItems,
                contextString
            };

            webview.postMessage({
                command: 'diagnosticsContextReceived',
                diagnosticsContext: diagnosticsContext
            });
        } catch (error) {
            console.error('Error getting diagnostics context:', error);
            webview.postMessage({
                command: 'diagnosticsContextReceived',
                diagnosticsContext: null
            });
        }
    }

    /**
     * Diagnostics 컨텍스트를 문자열로 포맷팅
     */
    private formatDiagnosticsContext(
        items: Array<{ file: string; line: number; column: number; severity: string; message: string; code?: string }>,
        errorCount: number,
        warningCount: number
    ): string {
        if (items.length === 0) {
            return '[Diagnostics]\nNo errors or warnings found.';
        }

        let context = `[Diagnostics]\n`;
        context += `Summary: ${errorCount} error(s), ${warningCount} warning(s)\n\n`;

        // 파일별로 그룹화
        const byFile = new Map<string, typeof items>();
        for (const item of items) {
            if (!byFile.has(item.file)) {
                byFile.set(item.file, []);
            }
            byFile.get(item.file)!.push(item);
        }

        for (const [file, fileItems] of byFile) {
            context += `📄 ${file}\n`;
            for (const item of fileItems) {
                const icon = item.severity === 'error' ? '❌' : '⚠️';
                const codeStr = item.code ? ` [${item.code}]` : '';
                context += `  ${icon} Line ${item.line}:${item.column}${codeStr}: ${item.message}\n`;
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

            const osAdapter = ExecutionManager.getInstance().getOSAdapter();
            shellPath = osAdapter.getDefaultShell();
            terminalName = osAdapter.osType === 'win32' ? 'CODEPILOT PowerShell Commands' : 'CODEPILOT Shell Commands';

            // ConfigurationService.getProjectRoot()는 항상 워크스페이스 루트만 반환합니다.
            const terminalCwd = await this.configurationService.getProjectRoot();
            if (terminalCwd) {
            } else {
            }

            const terminal = vscode.window.createTerminal({ name: terminalName, shellPath, cwd: terminalCwd });
            this.runTerminal = terminal;
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
     * 세션의 대화 히스토리를 복원 (lazy loading)
     * 최근 N개만 먼저 로드하고, 스크롤 업 시 이전 히스토리를 추가 로드
     */
    public restoreConversationHistory(conversationHistory: any[]): void {
        if (!this._view) {
            console.warn('[ChatViewProvider] Cannot restore conversation history: view not initialized');
            return;
        }

        // 전체 히스토리 저장
        this._fullConversationHistory = conversationHistory;
        const total = conversationHistory.length;
        const pageSize = ChatViewProvider.HISTORY_PAGE_SIZE;

        // 최근 N개만 추출
        const startIdx = Math.max(0, total - pageSize);
        const recentEntries = conversationHistory.slice(startIdx);
        this._historyLoadedCount = recentEntries.length;

        console.log(`[ChatViewProvider] Lazy loading: showing ${recentEntries.length}/${total} entries (from index ${startIdx})`);

        // 먼저 채팅 패널 초기화
        this._view.webview.postMessage({
            command: 'clearChat'
        });

        // 더 로드할 히스토리가 있는지 webview에 알림
        const hasMore = startIdx > 0;
        this._view.webview.postMessage({
            command: 'historyMeta',
            hasMore,
            totalCount: total,
            loadedCount: recentEntries.length
        });

        // 최근 항목만 표시
        this.sendEntriesToWebview(recentEntries);
    }

    /**
     * 이전 히스토리 추가 로드 (스크롤 업 시 호출)
     */
    private loadMoreHistory(): void {
        if (!this._view || this._fullConversationHistory.length === 0) return;

        const total = this._fullConversationHistory.length;
        const alreadyLoaded = this._historyLoadedCount;
        const remaining = total - alreadyLoaded;

        if (remaining <= 0) {
            this._view.webview.postMessage({
                command: 'historyMeta',
                hasMore: false,
                totalCount: total,
                loadedCount: alreadyLoaded
            });
            return;
        }

        const pageSize = ChatViewProvider.HISTORY_PAGE_SIZE;
        const loadCount = Math.min(pageSize, remaining);
        const startIdx = remaining - loadCount;
        const olderEntries = this._fullConversationHistory.slice(startIdx, startIdx + loadCount);

        this._historyLoadedCount += loadCount;

        console.log(`[ChatViewProvider] Loading ${loadCount} more entries (index ${startIdx}-${startIdx + loadCount - 1}), total loaded: ${this._historyLoadedCount}/${total}`);

        const hasMore = startIdx > 0;
        this._view.webview.postMessage({
            command: 'historyMeta',
            hasMore,
            totalCount: total,
            loadedCount: this._historyLoadedCount
        });

        // prepend 방식으로 이전 메시지 전송
        this._view.webview.postMessage({
            command: 'prependHistoryStart'
        });

        this.sendEntriesToWebview(olderEntries, true);

        this._view.webview.postMessage({
            command: 'prependHistoryEnd'
        });
    }

    /**
     * 대화 항목들을 webview에 전송
     */
    private sendEntriesToWebview(entries: any[], isPrepend = false): void {
        entries.forEach((entry, index) => {
            // 사용자 요청 표시
            if (entry.userRequest) {
                this._view?.webview.postMessage({
                    command: isPrepend ? 'prependUserMessage' : 'displayUserMessage',
                    text: entry.userRequest
                });
            }

            // uiMessages가 있으면 전체 UI 메시지 복원 (코드블록, 액션 포함)
            if (entry.uiMessages && entry.uiMessages.length > 0) {
                entry.uiMessages.forEach((msg: { sender: string; text: string; type?: string }) => {
                    this._view?.webview.postMessage({
                        command: isPrepend ? 'prependMessage' : 'receiveMessage',
                        sender: msg.sender,
                        text: msg.text
                    });
                });
            } else if (entry.assistantResponse) {
                this._view?.webview.postMessage({
                    command: isPrepend ? 'prependMessage' : 'receiveMessage',
                    sender: 'CODEPILOT',
                    text: entry.assistantResponse
                });
            } else if (entry.actions && entry.actions.length > 0) {
                const actionSummary = this.generateActionSummary(entry);
                if (actionSummary) {
                    this._view?.webview.postMessage({
                        command: isPrepend ? 'prependMessage' : 'receiveMessage',
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
     * 웹뷰 초기화 후 현재 모델 정보를 proactive하게 push
     * SecretStorage(Windows Credential Manager) 지연 대응용 재시도 포함
     */
    private pushCurrentModelToWebview(webview: vscode.Webview, delayMs: number): void {
        setTimeout(async () => {
            try {
                const stateManager = StateManager.getInstance(this.context);
                const aiModelEngine = await stateManager.getAiModel();
                let currentModel = '';
                if (aiModelEngine?.startsWith('admin:') || aiModelEngine?.startsWith('supported:')) {
                    currentModel = aiModelEngine;
                } else if (aiModelEngine === 'ollama' || !aiModelEngine) {
                    currentModel = await stateManager.getOllamaModel();
                } else {
                    currentModel = await stateManager.getOllamaModel();
                }

                if (!currentModel) { return; }

                // 프리셋 모델 목록도 함께 전송
                let supportedModels: { key: string; name: string; displayName: string; group: string }[] = [];
                try {
                    const aiModelSettings = this.configurationService.getServerSettings('ai_model');
                    supportedModels = (aiModelSettings || [])
                        .filter((s: any) => s.source === 'preset' && s.value && s.value.enabled !== false)
                        .map((s: any) => ({
                            key: s.key,
                            name: `supported:${s.key}`,
                            displayName: s.value?.name || s.key,
                            group: s.group || 'default',
                        }));
                } catch { }

                webview.postMessage({
                    command: 'ollamaModels',
                    models: [],
                    current: currentModel,
                    adminModels: [],
                    supportedModels,
                });
            } catch (e) {
                console.warn('[ChatViewProvider] pushCurrentModelToWebview error:', e);
            }
        }, delayMs);
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

                    // 히스토리 복원 후 스크롤을 최하단으로 이동
                    setTimeout(() => {
                        webview.postMessage({ command: 'scrollToBottom' });
                    }, 300);
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