"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function (o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function () { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function (o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function (o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function (o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function (o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const services_1 = require("./services");
const types_1 = require("./services/types");
const providers_1 = require("./webview/providers");
const SettingsPanelProvider_1 = require("./core/webview/SettingsPanelProvider");
const utils_1 = require("./utils");
const core_1 = require("./core");
const PromptBuilder_1 = require("./core/managers/context/PromptBuilder");
const ConversationManager_1 = require("./core/managers/conversation/ConversationManager");
const LLMApiClient_1 = require("./core/managers/model/LLMApiClient");
const IntentDetector_1 = require("./core/managers/action/IntentDetector");
const ExternalApiService_1 = require("./services/external/ExternalApiService");
const ContextHistoryManager_1 = require("./core/managers/context/ContextHistoryManager");
const FileChangeTracker_1 = require("./core/managers/action/file/FileChangeTracker");
const FileContextTracker_1 = require("./core/managers/context/file/FileContextTracker");
const ToolRegistry_1 = require("./core/tools/ToolRegistry");
const DiffContentProvider_1 = require("./core/managers/diff/DiffContentProvider");
const DiffManager_1 = require("./core/managers/diff/DiffManager");
const DiffCodeLensProvider_1 = require("./core/managers/diff/DiffCodeLensProvider");
const InlineDiffManager_1 = require("./core/managers/diff/InlineDiffManager");
const file_1 = require("./core/tools/file");
const terminal_1 = require("./core/tools/terminal");
// 전역 변수
let geminiApi;
let ollamaApi;
let notificationService;
let licenseService;
let ollamaBlockerService;
let gitRepositoryService;
async function activate(context) {
    // punycode deprecation 경고 억제 (간접 의존성에서 발생, 기능에는 영향 없음)
    const originalEmitWarning = process.emitWarning;
    process.emitWarning = (warning, ...args) => {
        if (typeof warning === 'string' && warning.includes('punycode')) {
            return; // punycode deprecation 경고 무시
        }
        return originalEmitWarning.call(process, warning, ...args);
    };
    // 서비스 초기화 (순서 중요: 의존성 주입)
    notificationService = new services_1.NotificationService();
    licenseService = new services_1.LicenseService();
    ollamaBlockerService = services_1.OllamaBlockerService.getInstance(context);
    gitRepositoryService = new services_1.GitRepositoryService(context);
    // Core Manager 시스템 초기화
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const execManager = core_1.ExecutionManager.getInstance();
    const projManager = core_1.ProjectManager.getInstance();
    if (workspacePath) {
        try {
            await projManager.initialize(workspacePath);
            // Core Manager System initialized
            // (추가 로그가 필요하면 DebugLogger로 출력하세요)
        }
        catch (error) {
            console.error('[Extension] Failed to initialize core managers:', error);
        }
    }
    else {
        console.warn('[Extension] No workspace folder found, core managers initialized without project path');
    }
    // ollama-blocker 자동 설치 확인 및 설치
    try {
        const isInstalled = await ollamaBlockerService.isInstalled();
        if (!isInstalled) {
            console.log('ollama-blocker 설치 중...');
            const installResult = await ollamaBlockerService.install();
            if (installResult.success) {
                console.log('ollama-blocker 설치 완료:', installResult.message);
            }
            else {
                console.error('ollama-blocker 설치 실패:', installResult.message);
            }
        }
    }
    catch (error) {
        console.error('ollama-blocker 설치 확인 중 오류:', error);
    }
    // ollama-blocker 자동 시작 (시리얼 번호가 없는 경우에만)
    try {
        const stateManager = core_1.StateManager.getInstance(context);
        const licenseSerial = await stateManager.getBanyaLicenseSerial();
        if (!licenseSerial || licenseSerial.trim() === '') {
            console.log('ollama-blocker 자동 시작 중...');
            const statusResult = await ollamaBlockerService.getStatus();
            if (!statusResult.running) {
                const startResult = await ollamaBlockerService.start();
                if (!startResult.success) {
                    console.error('ollama-blocker 자동 시작 실패:', startResult.message);
                    console.log('ollama-blocker 재시도 중...');
                    const retryResult = await ollamaBlockerService.start();
                    if (!retryResult.success) {
                        console.error('ollama-blocker 재시도 실패:', retryResult.message);
                    }
                }
                else {
                    console.log('ollama-blocker 자동 시작 완료:', startResult.message);
                }
            }
            else {
                console.log('ollama-blocker가 이미 실행 중입니다.');
            }
        }
    }
    catch (error) {
        console.error('ollama-blocker 자동 시작 중 오류:', error);
    }
    const stateManager = core_1.StateManager.getInstance(context);
    const settingsManager = core_1.SettingsManager.getInstance(context);
    let currentAiModel = await stateManager.getCurrentAiModel();
    const currentAiModelInit = currentAiModel;
    // fallback: 설정에서 모델 타입을 유추하거나 기본값 처리 가능 (여기서는 문자열 비교만)
    const isGeminiSelected = (currentAiModelInit || '').toLowerCase() === 'gemini';
    const initialApiKey = await stateManager.getApiKey();
    const initialGeminiModel = await stateManager.getGeminiModel();
    if (isGeminiSelected) {
        if (!initialApiKey || initialApiKey.trim() === '') {
            console.warn('[Extension] Gemini selected but API key is empty');
            notificationService.showWarningMessage('codepilot: Gemini API Key is not set. Please set it in the Settings.');
            geminiApi = new services_1.GeminiApi();
        }
        else {
            geminiApi = new services_1.GeminiApi(initialApiKey);
            geminiApi.updateModelName(initialGeminiModel || 'gemini-3-pro-preview');
            const isInitialized = geminiApi.isInitialized();
            if (!isInitialized) {
                console.error('[Extension] API initialization failed on extension activation. API Key status:', {
                    hasApiKey: !!initialApiKey,
                    apiKeyLength: initialApiKey?.length || 0,
                    apiKeyPrefix: initialApiKey ? `${initialApiKey.substring(0, 10)}...` : 'N/A',
                    apiKeyTrimmed: initialApiKey ? initialApiKey.trim() : 'N/A'
                });
                const reinitialized = geminiApi.updateApiKey(initialApiKey);
                if (!reinitialized) {
                    console.error('[Extension] API reinitialization also failed on extension activation. Full status:', {
                        hasApiKey: !!initialApiKey,
                        apiKeyLength: initialApiKey?.length || 0,
                        apiKeyPrefix: initialApiKey ? `${initialApiKey.substring(0, 10)}...` : 'N/A',
                        geminiApiHasApiKey: !!geminiApi.apiKey,
                        geminiApiKeyLength: geminiApi.apiKey?.length || 0
                    });
                }
            }
        }
    }
    else {
        // Gemini가 선택되지 않은 경우 키 유무와 상관없이 조용히 초기화 (경고 출력 안 함)
        geminiApi = new services_1.GeminiApi(initialApiKey);
        geminiApi.updateModelName(initialGeminiModel || 'gemini-3-pro-preview');
    }
    // Ollama API 초기화
    const initialOllamaUrl = await stateManager.getOllamaApiUrl();
    const initialOllamaEndpoint = await stateManager.getOllamaEndpoint();
    const initialOllamaModel = await stateManager.getOllamaModel();
    ollamaApi = new services_1.OllamaApi(initialOllamaUrl || 'http://localhost:11434', initialOllamaEndpoint, context);
    ollamaApi.setModel(initialOllamaModel);
    try {
        await ollamaApi.loadSettingsFromStorage();
    }
    catch (e) {
        console.warn('[Extension] Failed to load Ollama settings at startup:', e);
    }
    // 사용자 OS 정보를 PromptBuilder에 설정
    const userOS = require('os').platform() === 'darwin' ? 'macOS' :
        require('os').platform() === 'win32' ? 'Windows' :
            require('os').platform() === 'linux' ? 'Linux' : 'Unknown';
    // AiModelType이 제대로 로드되었는지 확인
    let defaultModelForPrompt = 'ollama';
    if (types_1.AiModelType && types_1.AiModelType.OLLAMA) {
        defaultModelForPrompt = types_1.AiModelType.OLLAMA;
    }
    const promptBuilder = new PromptBuilder_1.PromptBuilder(userOS, currentAiModel || defaultModelForPrompt);
    promptBuilder.setUserOS(userOS);
    // AutoFixService에 LLM 클라이언트 주입
    try {
        const autoFixService = core_1.AutoFix.getInstance();
        const autoFixLlmClient = async ({ error, context }) => {
            const commandPart = context.lastCommand
                ? `실패한 명령어:\n${context.lastCommand}\n\n`
                : '';
            const cwdPart = context.cwd
                ? `작업 디렉터리: ${context.cwd}\n\n`
                : '';
            const terminalPart = context.terminalName
                ? `터미널 이름: ${context.terminalName}\n\n`
                : '';
            const prompt = '당신은 터미널 명령 오류를 빠르고 안전하게 수정하는 시니어 개발자입니다.\n' +
                '주어진 정보(실패한 명령어, 작업 디렉터리, 오류 메시지)를 바탕으로, ' +
                '**수정된 단일 명령어 한 줄만** 제시하세요.\n\n' +
                '규칙:\n' +
                '- 설명 문장, 마크다운, 코드블록, 주석을 포함하지 마세요.\n' +
                '- 오직 실제로 실행할 하나의 명령어만 출력하세요.\n' +
                '- 필요하다면 && 로 여러 하위 명령을 연결할 수 있지만, 너무 복잡한 스크립트는 피하세요.\n' +
                '- 사용자의 OS는 대소문자와 상관없이 감지되며, 현재 환경에 맞는 명령을 사용하세요.\n\n' +
                commandPart +
                cwdPart +
                terminalPart +
                `오류 요약 (카테고리: ${error.category}, 심각도: ${error.severity}):\n${error.message}\n\n` +
                `전체 오류 출력:\n${error.rawOutput}\n`;
            // ErrorManager를 통해 오류 수정 메시지 전송
            const errorManager = core_1.ErrorManager.getInstance();
            // AiModelType이 제대로 로드되었는지 확인
            let defaultModelForError = 'ollama';
            if (types_1.AiModelType && types_1.AiModelType.OLLAMA) {
                defaultModelForError = types_1.AiModelType.OLLAMA;
            }
            else {
                // 동적 import도 정적 import와 동일한 모듈 경로를 사용합니다.
                const typesModule = await import('./services/types');
                if (typesModule.AiModelType) {
                    const ollamaValue = typesModule.AiModelType.OLLAMA;
                    if (ollamaValue) {
                        defaultModelForError = ollamaValue;
                    }
                }
            }
            const raw = await errorManager.sendMessageForErrorCorrection(prompt, new LLMApiClient_1.LLMApiClient(geminiApi, ollamaApi, currentAiModel || defaultModelForError), undefined);
            if (!raw) {
                return { correctedCommand: null };
            }
            // 첫 번째 유효한 한 줄을 명령어로 사용
            const line = raw
                .split('\n')
                .map((l) => l.trim())
                .filter((l) => !!l && !l.startsWith('#') && !l.startsWith('//'))[0] || raw.trim();
            return {
                correctedCommand: line || null
            };
        };
        autoFixService.configure({ llmClient: autoFixLlmClient });
        // AutoFixService LLM client configured
    }
    catch (e) {
        console.warn('[Extension] Failed to configure AutoFixService LLM client:', e);
    }
    // Git 리포지토리 정보 자동 감지
    try {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
            const gitInfo = await gitRepositoryService.detectAndSaveRepositoryInfo(workspaceFolder.uri.fsPath);
            if (gitInfo) {
                // Git 리포지토리 감지됨
            }
            else {
                // Git 리포지토리가 감지되지 않았습니다
            }
        }
    }
    catch (error) {
        console.error('[Extension] Git 리포지토리 감지 중 오류:', error);
    }
    // ============================================
    // Manager 시스템 초기화
    // ============================================
    // Initializing Manager System
    // State/Session Manager 초기화 (Extension Context 필요)
    // stateManager와 settingsManager는 이미 위에서 초기화됨
    const sessionManager = core_1.SessionManager.getInstance(context);
    // Project Manager는 이미 위에서 초기화됨
    if (workspacePath) {
        try {
            await projManager.initialize(workspacePath);
            // Project Manager initialized
        }
        catch (error) {
            console.error('[Extension] Failed to initialize Project Manager:', error);
        }
    }
    // Context Manager 초기화
    const contextManager = core_1.ContextManager.getInstance();
    const terminalManager = core_1.TerminalManager.getInstance();
    contextManager.setProjectManager(projManager);
    contextManager.setTerminalManager(terminalManager);
    // Error Manager 초기화
    const errorManager = core_1.ErrorManager.getInstance();
    errorManager.setExecutionManager(execManager);
    // Task Manager 초기화 및 시작
    const taskManager = core_1.TaskManager.getInstance(context);
    taskManager.start();
    // Manager 간 연결 설정
    contextManager.setErrorManager(errorManager);
    // LLM Manager를 ContextManager에 설정 (내용 기반 relevance scoring용)
    // llmManager는 아래에서 초기화되므로 나중에 설정
    // Manager System initialized successfully
    // 현재 AI 모델 설정 로드
    currentAiModel = await stateManager.getCurrentAiModel();
    const uiAiModel = await stateManager.getAiModel();
    // 마이그레이션: 과거 구체적인 'ollama-*' 타입이 저장된 경우 'ollama'로 통일
    if (currentAiModel && currentAiModel.toString().startsWith('ollama')) {
        currentAiModel = 'ollama';
        await stateManager.saveCurrentAiModel('ollama');
    }
    // UI에서 저장된 모델이 우선
    if (uiAiModel && uiAiModel !== currentAiModel) {
        let mappedUiModel = uiAiModel;
        if (uiAiModel.startsWith('ollama')) {
            mappedUiModel = 'ollama';
        }
        currentAiModel = mappedUiModel;
        await stateManager.saveCurrentAiModel(mappedUiModel);
    }
    // ConversationManager 초기화 및 설정
    const conversationManager = ConversationManager_1.ConversationManager.getInstance(userOS, geminiApi, ollamaApi);
    const llmApiClient = new LLMApiClient_1.LLMApiClient(geminiApi, ollamaApi, currentAiModel);
    const llmManager = core_1.LLMManager.getInstance(geminiApi, ollamaApi, currentAiModel);
    // promptBuilder는 이미 위에서 선언됨
    const intentDetector = new IntentDetector_1.IntentDetector(llmManager);
    const externalApiService = new ExternalApiService_1.ExternalApiService(context);
    conversationManager.setLLMService(llmApiClient);
    conversationManager.setSessionManager(sessionManager);
    conversationManager.setPromptBuilder(promptBuilder);
    conversationManager.setIntentDetector(intentDetector);
    conversationManager.setExternalApiService(externalApiService);
    conversationManager.configurePlanManager(llmApiClient, currentAiModel);
    // ContextHistoryManager 초기화 및 설정 (Phase 2.1, 4.4)
    const contextHistoryManager = ContextHistoryManager_1.ContextHistoryManager.getInstance(context);
    conversationManager.setContextHistoryManager(contextHistoryManager);
    // LLM Manager를 ContextManager에 설정 (내용 기반 relevance scoring용)
    contextManager.setLLMManager(llmManager);
    // FileChangeTracker / FileContextTracker 초기화 및 ActionManager에 설정
    const fileChangeTracker = FileChangeTracker_1.FileChangeTracker.getInstance(context);
    const fileContextTracker = FileContextTracker_1.FileContextTracker.getInstance(context);
    const actionManager = core_1.ActionManager.getInstance();
    actionManager.setFileChangeTracker(fileChangeTracker);
    actionManager.setFileContextTracker(fileContextTracker);
    // Diff Content Provider 등록 (커스텀 URI 스킴 처리)
    const diffContentProvider = DiffContentProvider_1.DiffContentProvider.getInstance();
    context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(DiffContentProvider_1.DIFF_VIEW_URI_SCHEME, diffContentProvider));
    console.log('[Extension] Diff Content Provider registered');
    // 커서 IDE 방식: 인라인 Diff CodeLens Provider 등록
    const diffCodeLensProvider = DiffCodeLensProvider_1.DiffCodeLensProvider.getInstance();
    context.subscriptions.push(vscode.languages.registerCodeLensProvider({ scheme: 'file' }, diffCodeLensProvider));
    console.log('[Extension] Diff CodeLens Provider registered');
    // 커서 IDE 방식: 인라인 Diff 명령어 등록
    context.subscriptions.push(vscode.commands.registerCommand('codepilot.acceptChange', async (filePath, changeId) => {
        const inlineDiffManager = InlineDiffManager_1.InlineDiffManager.getInstance();
        await inlineDiffManager.acceptChange(filePath, changeId);
        diffCodeLensProvider.refresh();
    }));
    context.subscriptions.push(vscode.commands.registerCommand('codepilot.rejectChange', async (filePath, changeId) => {
        const inlineDiffManager = InlineDiffManager_1.InlineDiffManager.getInstance();
        await inlineDiffManager.rejectChange(filePath, changeId);
        diffCodeLensProvider.refresh();
    }));
    // 커서 IDE 방식: 키보드 단축키 (Cmd+Enter: 모든 변경사항 수락, Cmd+Backspace: 모든 변경사항 거부)
    context.subscriptions.push(vscode.commands.registerCommand('codepilot.acceptAllChanges', async () => {
        const inlineDiffManager = InlineDiffManager_1.InlineDiffManager.getInstance();
        const pendingFiles = inlineDiffManager.getAllPendingFiles();
        for (const filePath of pendingFiles) {
            await inlineDiffManager.acceptAllChanges(filePath);
        }
        diffCodeLensProvider.refresh();
        vscode.window.showInformationMessage(`모든 변경사항이 승인되었습니다. (${pendingFiles.length}개 파일)`);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('codepilot.rejectAllChanges', async () => {
        const inlineDiffManager = InlineDiffManager_1.InlineDiffManager.getInstance();
        const pendingFiles = inlineDiffManager.getAllPendingFiles();
        for (const filePath of pendingFiles) {
            await inlineDiffManager.rejectAllChanges(filePath);
        }
        diffCodeLensProvider.refresh();
        vscode.window.showInformationMessage(`모든 변경사항이 거부되었습니다. (${pendingFiles.length}개 파일)`);
    }));
    // Diff 명령어 등록
    context.subscriptions.push(vscode.commands.registerCommand('codepilot.showDiff', async () => {
        const diffManager = DiffManager_1.DiffManager.getInstance();
        await diffManager.showWorkingDirectoryChanges();
    }));
    context.subscriptions.push(vscode.commands.registerCommand('codepilot.showDiffForFile', async (filePath) => {
        const diffManager = DiffManager_1.DiffManager.getInstance();
        if (!filePath) {
            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor) {
                filePath = activeEditor.document.uri.fsPath;
            }
            else {
                vscode.window.showWarningMessage('No file selected. Please open a file first.');
                return;
            }
        }
        await diffManager.showFileDiff(filePath);
    }));
    // Tool 핸들러 등록
    const toolRegistry = ToolRegistry_1.ToolRegistry.getInstance();
    toolRegistry.register(new file_1.CreateFileToolHandler());
    toolRegistry.register(new file_1.UpdateFileToolHandler());
    toolRegistry.register(new file_1.RemoveFileToolHandler());
    toolRegistry.register(new file_1.ReadFileToolHandler());
    toolRegistry.register(new file_1.ListFilesToolHandler());
    toolRegistry.register(new file_1.SearchFilesToolHandler());
    toolRegistry.register(new file_1.RipgrepSearchToolHandler());
    toolRegistry.register(new terminal_1.RunCommandToolHandler());
    console.log('[Extension] Tool handlers registered:', toolRegistry.getRegisteredTools());
    // 터미널 매니저에 오류 수정 서비스 설정은 각 웹뷰 프로바이더에서 수행됨
    // OUTPUT 로그 설정 로드 및 적용
    const outputLogEnabled = await settingsManager.isOutputLogEnabled();
    // 디버그 로그: VS Code Run/Debug 이벤트에만 연동 (설정 플래그 사용 중단)
    const projectRootForDebug = await settingsManager.getProjectRoot();
    utils_1.DebugLogger.setContext(false, projectRootForDebug);
    // VS Code Run and Debug 연동: 디버그 세션 시작 시 자동으로 로그 파일 생성(덮어쓰기) 및 기록 시작
    context.subscriptions.push(vscode.debug.onDidStartDebugSession(async (session) => {
        try {
            const root = await settingsManager.getProjectRoot();
            utils_1.DebugLogger.setContext(true, root);
            utils_1.DebugLogger.startIfEnabled();
            utils_1.DebugLogger.log(`VS Code debug session started: ${session.name}`);
        }
        catch { /* ignore */ }
    }));
    // 디버그 세션 종료 시: 자동 기록 중단
    context.subscriptions.push(vscode.debug.onDidTerminateDebugSession(async (session) => {
        try {
            const root = await settingsManager.getProjectRoot();
            utils_1.DebugLogger.log(`VS Code debug session ended: ${session.name}`);
            utils_1.DebugLogger.setContext(false, root);
        }
        catch { /* ignore */ }
    }));
    const autoCorrectionEnabled = await stateManager.getAutoCorrectionEnabled();
    const errorRetryCount = await settingsManager.getErrorRetryCount();
    // ChatViewProvider 인스턴스 생성 및 등록 (CODE 탭)
    const chatViewProvider = new providers_1.ChatViewProvider(context.extensionUri, context, (viewColumn) => (0, SettingsPanelProvider_1.openSettingsPanel)(context.extensionUri, context, viewColumn, settingsManager, notificationService, geminiApi, licenseService, ollamaApi, undefined, undefined, undefined), settingsManager, notificationService, gitRepositoryService, geminiApi, ollamaApi);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(providers_1.ChatViewProvider.viewType, chatViewProvider, {
        webviewOptions: { retainContextWhenHidden: true }
    }));
    // Command 등록
    context.subscriptions.push(vscode.commands.registerCommand('codepilot.openChatView', () => {
        vscode.commands.executeCommand('workbench.view.extension.codepilot');
        vscode.commands.executeCommand(`${providers_1.ChatViewProvider.viewType}.focus`); // CODE 탭으로 포커스
    }));
    // Registering commands
    context.subscriptions.push(vscode.commands.registerCommand('codepilot.openSettingsPanel', () => {
        // openSettingsPanel command called
        if (!SettingsPanelProvider_1.openSettingsPanel) {
            console.error('[Extension] ERROR: openSettingsPanel is undefined when command is called!');
            vscode.window.showErrorMessage('Settings panel could not be opened. Please reload the extension.');
            return;
        }
        (0, SettingsPanelProvider_1.openSettingsPanel)(context.extensionUri, context, vscode.ViewColumn.One, settingsManager, notificationService, geminiApi, licenseService, ollamaApi, undefined, ollamaBlockerService, undefined);
    }));
    // Command registered: codepilot.openSettingsPanel
    // 언어 변경 브로드캐스트 명령어 등록
    context.subscriptions.push(vscode.commands.registerCommand('codepilot.broadcastLanguageChange', (language) => {
        // 모든 활성 webview에 언어 변경 메시지 브로드캐스트
        vscode.window.terminals.forEach(terminal => {
            if (terminal.name.includes('codepilot')) {
                terminal.sendText(`echo "Language changed to: ${language}"`);
            }
        });
        // 모든 활성 webview 패널에 언어 변경 메시지 전송
        vscode.window.terminals.forEach(terminal => {
            if (terminal.name.includes('codepilot')) {
                terminal.sendText(`echo "Language changed to: ${language}"`);
            }
        });
    }));
    // Status Bar에 자동 오류 수정 중단 버튼 추가
    const stopErrorCorrectionButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    stopErrorCorrectionButton.text = "$(stop-circle)";
    stopErrorCorrectionButton.tooltip = "자동 오류 수정 중단";
    stopErrorCorrectionButton.command = 'codepilot.stopErrorCorrection';
    stopErrorCorrectionButton.show();
    context.subscriptions.push(stopErrorCorrectionButton);
    // 자동 오류 수정 중단 명령어 등록
    context.subscriptions.push(vscode.commands.registerCommand('codepilot.stopErrorCorrection', () => {
        vscode.window.showInformationMessage('자동 오류 수정 중단 기능은 AutoFixService로 이동되었습니다.');
    }));
    // 설정 변경 시 TerminalManager에 반영
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(async (event) => {
        if (event.affectsConfiguration('codepilot.outputLogEnabled')) {
            const outputLogEnabled = await settingsManager.isOutputLogEnabled();
        }
        if (event.affectsConfiguration('codepilot.errorRetryCount')) {
            const errorRetryCount = await settingsManager.getErrorRetryCount();
        }
        if (event.affectsConfiguration('codepilot.autoCorrectionEnabled')) {
            const enabled = await stateManager.getAutoCorrectionEnabled();
            // onDidChangeConfiguration: autoCorrectionEnabled
        }
        // debugEnabled 설정은 더 이상 사용하지 않음 (Run/Debug 이벤트로만 제어)
    }));
    // ollama-blocker 관리 명령어들
    context.subscriptions.push(vscode.commands.registerCommand('codepilot.startOllamaBlocker', async () => {
        const result = await ollamaBlockerService.start();
        if (result.success) {
            vscode.window.showInformationMessage(`ollama-blocker: ${result.message}`);
        }
        else {
            vscode.window.showErrorMessage(`ollama-blocker: ${result.message}`);
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('codepilot.stopOllamaBlocker', async () => {
        const result = await ollamaBlockerService.stop();
        if (result.success) {
            vscode.window.showInformationMessage(`ollama-blocker: ${result.message}`);
        }
        else {
            vscode.window.showErrorMessage(`ollama-blocker: ${result.message}`);
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('codepilot.ollamaBlockerStatus', async () => {
        const status = await ollamaBlockerService.getStatus();
        vscode.window.showInformationMessage(`ollama-blocker Status: ${status.message}`);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('codepilot.killOllamaProcesses', async () => {
        const result = await ollamaBlockerService.killOllamaProcesses();
        if (result.success) {
            vscode.window.showInformationMessage(`ollama-blocker: ${result.message}`);
        }
        else {
            vscode.window.showErrorMessage(`ollama-blocker: ${result.message}`);
        }
    }));
    // 디버그용 ollama-blocker 테스트 명령어
    context.subscriptions.push(vscode.commands.registerCommand('codepilot.testOllamaBlocker', async () => {
        try {
            const isInstalled = await ollamaBlockerService.isInstalled();
            vscode.window.showInformationMessage(`ollama-blocker 설치 상태: ${isInstalled ? '설치됨' : '설치되지 않음'}`);
            if (isInstalled) {
                const status = await ollamaBlockerService.getStatus();
                vscode.window.showInformationMessage(`ollama-blocker 상태: ${status.message}`);
            }
        }
        catch (error) {
            vscode.window.showErrorMessage(`ollama-blocker 테스트 오류: ${error}`);
        }
    }));
    // Firebase 연결 테스트 명령어
    context.subscriptions.push(vscode.commands.registerCommand('codepilot.testFirebaseConnection', async () => {
        try {
            const result = await licenseService.testFirebaseConnection();
            if (result.success) {
                vscode.window.showInformationMessage(`Firebase 연결: ${result.message}`);
            }
            else {
                vscode.window.showErrorMessage(`Firebase 연결 실패: ${result.message}`);
            }
        }
        catch (error) {
            vscode.window.showErrorMessage(`Firebase 테스트 오류: ${error}`);
        }
    }));
    // 터미널 모니터링 테스트 명령어
    context.subscriptions.push(vscode.commands.registerCommand('codepilot.testTerminalMonitoring', async () => {
        try {
            const { ErrorManager } = await import('./core/managers/error/ErrorManager');
            const errorManager = ErrorManager.getInstance();
            if (errorManager) {
                const stats = errorManager.getStats();
                vscode.window.showInformationMessage(`에러 관리 상태: 총 에러=${stats.total}, 해결됨=${stats.resolved}, 미해결=${stats.unresolved}`);
            }
            else {
                vscode.window.showErrorMessage('ErrorManager를 찾을 수 없습니다.');
            }
        }
        catch (error) {
            vscode.window.showErrorMessage(`터미널 모니터링 테스트 오류: ${error}`);
        }
    }));
    // 워크스페이스 변경 시 Git 리포지토리 정보 업데이트
    context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(async (event) => {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (workspaceFolder) {
                const gitInfo = await gitRepositoryService.detectAndSaveRepositoryInfo(workspaceFolder.uri.fsPath);
                if (gitInfo) {
                    // 워크스페이스 변경 - Git 리포지토리 감지됨
                }
                else {
                    // 워크스페이스 변경 - Git 리포지토리가 감지되지 않았습니다
                }
            }
        }
        catch (error) {
            console.error('[Extension] 워크스페이스 변경 시 Git 리포지토리 감지 중 오류:', error);
        }
    }));
}
function deactivate() {
    // 터미널 정리는 TerminalManager에서 처리됨
}
//# sourceMappingURL=extension.js.map