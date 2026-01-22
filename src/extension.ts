import * as vscode from 'vscode';

import { GeminiApi, BanyaApi, NotificationService, OllamaApi, LicenseService, GitRepositoryService } from './services';
import { AiModelType } from './services/types';
import { ChatViewProvider } from './webview/providers';
import { openSettingsPanel } from './core/webview/SettingsPanelProvider';
import { DebugLogger } from './utils';

import {
    ActionManager,
    ExecutionManager,
    TerminalManager,
    TaskManager,
    ErrorManager,
    ContextManager,
    StateManager,
    SessionManager,
    SettingsManager,
    ProjectManager,
    AutoFix,
    AutoFixLlmClient,
    LLMManager
} from './core';
import { PromptBuilder } from './core/managers/context/PromptBuilder';
import { ConversationManager } from './core/managers/conversation/ConversationManager';
import { LLMApiClient } from './core/managers/model/LLMApiClient';
import { IntentDetector } from './core/managers/action/IntentDetector';
import { ExternalApiService } from './services/external/ExternalApiService';
import { ContextHistoryManager } from './core/managers/context/ContextHistoryManager';
import { FileChangeTracker } from './core/managers/action/file/FileChangeTracker';
import { FileContextTracker } from './core/managers/context/file/FileContextTracker';
import { ToolRegistry } from './core/tools/ToolRegistry';
import { DiffContentProvider, DIFF_VIEW_URI_SCHEME } from './core/managers/diff/DiffContentProvider';
import { DiffManager } from './core/managers/diff/DiffManager';
import { DiffCodeLensProvider } from './core/managers/diff/DiffCodeLensProvider';
import { InlineDiffManager } from './core/managers/diff/InlineDiffManager';
import {
    CreateFileToolHandler,
    UpdateFileToolHandler,
    RemoveFileToolHandler,
    ReadFileToolHandler,
    ListFilesToolHandler,
    SearchFilesToolHandler,
    RipgrepSearchToolHandler,
} from './core/tools/file';
import { RunCommandToolHandler } from './core/tools/terminal';


// 전역 변수
let geminiApi: GeminiApi;
let ollamaApi: OllamaApi;
let banyaApi: BanyaApi;
let notificationService: NotificationService;
let licenseService: LicenseService;
let gitRepositoryService: GitRepositoryService;

export async function activate(context: vscode.ExtensionContext) {
    // punycode deprecation 경고 억제 (간접 의존성에서 발생, 기능에는 영향 없음)
    const originalEmitWarning = process.emitWarning;
    process.emitWarning = (warning: string | Error, ...args: any[]) => {
        if (typeof warning === 'string' && warning.includes('punycode')) {
            return; // punycode deprecation 경고 무시
        }
        return originalEmitWarning.call(process, warning, ...args);
    };

    // 서비스 초기화 (순서 중요: 의존성 주입)
    notificationService = new NotificationService();

    licenseService = new LicenseService();
    gitRepositoryService = new GitRepositoryService(context);

    // Core Manager 시스템 초기화
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const execManager = ExecutionManager.getInstance();
    const projManager = ProjectManager.getInstance();

    if (workspacePath) {
        try {
            await projManager.initialize(workspacePath);
            // Core Manager System initialized
            // (추가 로그가 필요하면 DebugLogger로 출력하세요)
        } catch (error) {
            console.error('[Extension] Failed to initialize core managers:', error);
        }
    } else {
        console.warn('[Extension] No workspace folder found, core managers initialized without project path');
    }


    const stateManager = StateManager.getInstance(context);
    const settingsManager = SettingsManager.getInstance(context);
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
            geminiApi = new GeminiApi();
        } else {
            geminiApi = new GeminiApi(initialApiKey);
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
    } else {
        // Gemini가 선택되지 않은 경우 키 유무와 상관없이 조용히 초기화 (경고 출력 안 함)
        geminiApi = new GeminiApi(initialApiKey);
        geminiApi.updateModelName(initialGeminiModel || 'gemini-3-pro-preview');
    }

    // Ollama API 초기화
    const initialOllamaUrl = await stateManager.getOllamaApiUrl();
    const initialOllamaEndpoint = await stateManager.getOllamaEndpoint();
    const initialOllamaModel = await stateManager.getOllamaModel();
    ollamaApi = new OllamaApi(initialOllamaUrl || 'http://localhost:11434', initialOllamaEndpoint, context);
    ollamaApi.setModel(initialOllamaModel);
    try {
        await ollamaApi.loadSettingsFromStorage();
    } catch (e) {
        console.warn('[Extension] Failed to load Ollama settings at startup:', e);
    }

    // Banya API 초기화
    const config = vscode.workspace.getConfiguration('codepilot');
    const initialBanyaApiUrl = config.get<string>('banyaApiUrl') || 'http://210.109.53.87:8083/v1/chat/completions';
    const initialBanyaApiKey = await context.secrets.get('codepilot.banyaApiKey') || '';
    banyaApi = new BanyaApi(initialBanyaApiUrl, initialBanyaApiKey, context);
    try {
        await banyaApi.loadSettingsFromStorage();
    } catch (e) {
        console.warn('[Extension] Failed to load Banya settings at startup:', e);
    }

    // 사용자 OS 정보를 PromptBuilder에 설정
    const userOS = require('os').platform() === 'darwin' ? 'macOS' :
        require('os').platform() === 'win32' ? 'Windows' :
            require('os').platform() === 'linux' ? 'Linux' : 'Unknown';

    // AiModelType이 제대로 로드되었는지 확인
    let defaultModelForPrompt: AiModelType = 'ollama' as AiModelType;
    if (AiModelType && AiModelType.OLLAMA) {
        defaultModelForPrompt = AiModelType.OLLAMA;
    }
    const promptBuilder = new PromptBuilder(userOS, (currentAiModel as AiModelType) || defaultModelForPrompt);
    promptBuilder.setUserOS(userOS);

    // AutoFixService에 LLM 클라이언트 주입
    try {
        const autoFixService = AutoFix.getInstance();
        const autoFixLlmClient: AutoFixLlmClient = async ({ error, context }) => {
            const commandPart = context.lastCommand
                ? `실패한 명령어:\n${context.lastCommand}\n\n`
                : '';
            const cwdPart = context.cwd
                ? `작업 디렉터리: ${context.cwd}\n\n`
                : '';
            const terminalPart = context.terminalName
                ? `터미널 이름: ${context.terminalName}\n\n`
                : '';

            const prompt =
                '당신은 터미널 명령 오류를 빠르고 안전하게 수정하는 시니어 개발자입니다.\n' +
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
            const errorManager = ErrorManager.getInstance();
            // AiModelType이 제대로 로드되었는지 확인
            let defaultModelForError: AiModelType = 'ollama' as AiModelType;
            if (AiModelType && AiModelType.OLLAMA) {
                defaultModelForError = AiModelType.OLLAMA;
            } else {
                // 동적 import도 정적 import와 동일한 모듈 경로를 사용합니다.
                const typesModule = await import('./services/types');
                if (typesModule.AiModelType) {
                    const ollamaValue = typesModule.AiModelType.OLLAMA;
                    if (ollamaValue) {
                        defaultModelForError = ollamaValue;
                    }
                }
            }
            const raw = await errorManager.sendMessageForErrorCorrection(
                prompt,
                new LLMApiClient(geminiApi, ollamaApi, banyaApi, (currentAiModel as AiModelType) || defaultModelForError),
                undefined
            );
            if (!raw) {
                return { correctedCommand: null };
            }

            // 첫 번째 유효한 한 줄을 명령어로 사용
            const line =
                raw
                    .split('\n')
                    .map((l: string) => l.trim())
                    .filter((l: string) => !!l && !l.startsWith('#') && !l.startsWith('//'))[0] || raw.trim();

            return {
                correctedCommand: line || null
            };
        };

        autoFixService.configure({ llmClient: autoFixLlmClient });
        // AutoFixService LLM client configured
    } catch (e) {
        console.warn('[Extension] Failed to configure AutoFixService LLM client:', e);
    }

    // Git 리포지토리 정보 자동 감지
    try {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
            const gitInfo = await gitRepositoryService.detectAndSaveRepositoryInfo(workspaceFolder.uri.fsPath);
            if (gitInfo) {
                // Git 리포지토리 감지됨
            } else {
                // Git 리포지토리가 감지되지 않았습니다
            }
        }
    } catch (error) {
        console.error('[Extension] Git 리포지토리 감지 중 오류:', error);
    }

    // ============================================
    // Manager 시스템 초기화
    // ============================================
    // Initializing Manager System

    // State/Session Manager 초기화 (Extension Context 필요)
    // stateManager와 settingsManager는 이미 위에서 초기화됨
    const sessionManager = SessionManager.getInstance(context);

    // Project Manager는 이미 위에서 초기화됨
    if (workspacePath) {
        try {
            await projManager.initialize(workspacePath);
            // Project Manager initialized

            // 워크스페이스가 열릴 때 자동으로 세션 생성 및 캐시 미리 로드
            const existingSession = sessionManager.findSessionByProject(workspacePath);
            if (!existingSession) {
                // 새 세션 생성
                const newSession = sessionManager.createSession(workspacePath);
                console.log(`[Extension] Auto-created session for workspace: ${workspacePath}`);
            } else {
                // 기존 세션을 현재 세션으로 설정
                sessionManager.setCurrentSession(existingSession.id);
                console.log(`[Extension] Restored existing session: ${existingSession.id}`);
            }

            // 프로젝트 컨텍스트 캐시 미리 로드 (비동기, 백그라운드)
            sessionManager.preloadProjectContext(workspacePath).catch(err => {
                console.warn('[Extension] Failed to preload project context:', err);
            });
        } catch (error) {
            console.error('[Extension] Failed to initialize Project Manager:', error);
        }
    }

    // Context Manager 초기화
    const contextManager = ContextManager.getInstance();
    const terminalManager = TerminalManager.getInstance();
    contextManager.setProjectManager(projManager);
    contextManager.setTerminalManager(terminalManager);

    // Error Manager 초기화
    const errorManager = ErrorManager.getInstance();
    errorManager.setExecutionManager(execManager);

    // Task Manager 초기화 및 시작
    const taskManager = TaskManager.getInstance(context);
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
        currentAiModel = 'ollama' as any;
        await stateManager.saveCurrentAiModel('ollama' as any);
    }

    // UI에서 저장된 모델이 우선
    if (uiAiModel && uiAiModel !== currentAiModel) {
        let mappedUiModel: string = uiAiModel;
        if (uiAiModel.startsWith('ollama')) {
            mappedUiModel = 'ollama';
        }
        currentAiModel = mappedUiModel as any;
        await stateManager.saveCurrentAiModel(mappedUiModel as any);
    }

    // ConversationManager 초기화 및 설정

    const conversationManager = ConversationManager.getInstance(userOS, geminiApi, ollamaApi, banyaApi);
    const llmApiClient = new LLMApiClient(geminiApi, ollamaApi, banyaApi, currentAiModel as any);
    const llmManager = LLMManager.getInstance(geminiApi, ollamaApi, banyaApi, currentAiModel as any);
    // promptBuilder는 이미 위에서 선언됨
    const intentDetector = new IntentDetector(llmManager);
    const externalApiService = new ExternalApiService(context);

    conversationManager.setLLMService(llmApiClient);
    conversationManager.setSessionManager(sessionManager);
    conversationManager.setPromptBuilder(promptBuilder);
    conversationManager.setIntentDetector(intentDetector);
    conversationManager.setExternalApiService(externalApiService);
    conversationManager.configurePlanManager(llmApiClient, currentAiModel);
    conversationManager.setStateManager(stateManager);

    // ContextHistoryManager 초기화 및 설정 (Phase 2.1, 4.4)
    const contextHistoryManager = ContextHistoryManager.getInstance(context);
    conversationManager.setContextHistoryManager(contextHistoryManager);

    // LLM Manager를 ContextManager에 설정 (내용 기반 relevance scoring용)
    contextManager.setLLMManager(llmManager);

    // FileChangeTracker / FileContextTracker 초기화 및 ActionManager에 설정
    const fileChangeTracker = FileChangeTracker.getInstance(context);
    const fileContextTracker = FileContextTracker.getInstance(context);
    const actionManager = ActionManager.getInstance();
    actionManager.setFileChangeTracker(fileChangeTracker);
    actionManager.setFileContextTracker(fileContextTracker);

    // Diff Content Provider 등록 (커스텀 URI 스킴 처리)
    const diffContentProvider = DiffContentProvider.getInstance();
    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider(
            DIFF_VIEW_URI_SCHEME,
            diffContentProvider
        )
    );
    console.log('[Extension] Diff Content Provider registered');

    // 커서 IDE 방식: 인라인 Diff CodeLens Provider 등록
    const diffCodeLensProvider = DiffCodeLensProvider.getInstance();
    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider(
            { scheme: 'file' },
            diffCodeLensProvider
        )
    );
    console.log('[Extension] Diff CodeLens Provider registered');

    // 커서 IDE 방식: 인라인 Diff 명령어 등록
    context.subscriptions.push(
        vscode.commands.registerCommand('codepilot.acceptChange', async (filePath: string, changeId: string) => {
            const inlineDiffManager = InlineDiffManager.getInstance();
            await inlineDiffManager.acceptChange(filePath, changeId);
            diffCodeLensProvider.refresh();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('codepilot.rejectChange', async (filePath: string, changeId: string) => {
            const inlineDiffManager = InlineDiffManager.getInstance();
            await inlineDiffManager.rejectChange(filePath, changeId);
            diffCodeLensProvider.refresh();
        })
    );

    // 커서 IDE 방식: 키보드 단축키 (Cmd+Enter: 모든 변경사항 수락, Cmd+Backspace: 모든 변경사항 거부)
    context.subscriptions.push(
        vscode.commands.registerCommand('codepilot.acceptAllChanges', async () => {
            const inlineDiffManager = InlineDiffManager.getInstance();
            const pendingFiles = inlineDiffManager.getAllPendingFiles();

            for (const filePath of pendingFiles) {
                await inlineDiffManager.acceptAllChanges(filePath);
            }
            diffCodeLensProvider.refresh();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('codepilot.rejectAllChanges', async () => {
            const inlineDiffManager = InlineDiffManager.getInstance();
            const pendingFiles = inlineDiffManager.getAllPendingFiles();

            for (const filePath of pendingFiles) {
                await inlineDiffManager.rejectAllChanges(filePath);
            }
            diffCodeLensProvider.refresh();
        })
    );

    // Diff 명령어 등록
    context.subscriptions.push(
        vscode.commands.registerCommand('codepilot.showDiff', async () => {
            const diffManager = DiffManager.getInstance();
            await diffManager.showWorkingDirectoryChanges();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('codepilot.showDiffForFile', async (filePath?: string) => {
            const diffManager = DiffManager.getInstance();
            if (!filePath) {
                const activeEditor = vscode.window.activeTextEditor;
                if (activeEditor) {
                    filePath = activeEditor.document.uri.fsPath;
                } else {
                    vscode.window.showWarningMessage('No file selected. Please open a file first.');
                    return;
                }
            }
            await diffManager.showFileDiff(filePath);
        })
    );

    // Tool 핸들러 등록
    const toolRegistry = ToolRegistry.getInstance();
    toolRegistry.register(new CreateFileToolHandler());
    toolRegistry.register(new UpdateFileToolHandler());
    toolRegistry.register(new RemoveFileToolHandler());
    toolRegistry.register(new ReadFileToolHandler());
    toolRegistry.register(new ListFilesToolHandler());
    toolRegistry.register(new SearchFilesToolHandler());
    toolRegistry.register(new RipgrepSearchToolHandler());
    toolRegistry.register(new RunCommandToolHandler());
    console.log('[Extension] Tool handlers registered:', toolRegistry.getRegisteredTools());


    // 터미널 매니저에 오류 수정 서비스 설정은 각 웹뷰 프로바이더에서 수행됨

    // OUTPUT 로그 설정 로드 및 적용
    const outputLogEnabled = await settingsManager.isOutputLogEnabled();

    // 디버그 로그: VS Code Run/Debug 이벤트에만 연동 (설정 플래그 사용 중단)
    const projectRootForDebug = await settingsManager.getProjectRoot();
    DebugLogger.setContext(false, projectRootForDebug);

    // VS Code Run and Debug 연동: 디버그 세션 시작 시 자동으로 로그 파일 생성(덮어쓰기) 및 기록 시작
    context.subscriptions.push(vscode.debug.onDidStartDebugSession(async (session) => {
        try {
            const root = await settingsManager.getProjectRoot();
            DebugLogger.setContext(true, root);
            DebugLogger.startIfEnabled();
            DebugLogger.log(`VS Code debug session started: ${session.name}`);
        } catch { /* ignore */ }
    }));

    // 디버그 세션 종료 시: 자동 기록 중단
    context.subscriptions.push(vscode.debug.onDidTerminateDebugSession(async (session) => {
        try {
            const root = await settingsManager.getProjectRoot();
            DebugLogger.log(`VS Code debug session ended: ${session.name}`);
            DebugLogger.setContext(false, root);
        } catch { /* ignore */ }
    }));

    const autoCorrectionEnabled = await stateManager.getAutoCorrectionEnabled();
    const errorRetryCount = await settingsManager.getErrorRetryCount();

    // ChatViewProvider 인스턴스 생성 및 등록 (CODE 탭)
    const chatViewProvider = new ChatViewProvider(
        context.extensionUri,
        context,
        (viewColumn: vscode.ViewColumn) => openSettingsPanel(context.extensionUri, context, viewColumn, settingsManager, notificationService, geminiApi, licenseService, ollamaApi, undefined, undefined, chatViewProvider),
        settingsManager,
        notificationService,
        gitRepositoryService,
        geminiApi,
        ollamaApi,
        banyaApi
    );

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, chatViewProvider, {
            webviewOptions: { retainContextWhenHidden: true }
        })
    );

    // 웹뷰 자동 열기 (약간의 지연 후)
    setTimeout(async () => {
        try {
            await vscode.commands.executeCommand('workbench.view.extension.codepilot');
            // 뷰가 열릴 때까지 약간 대기
            await new Promise(resolve => setTimeout(resolve, 500));
            await vscode.commands.executeCommand(`${ChatViewProvider.viewType}.focus`);
        } catch (error: any) {
            // 사용자가 수동으로 열 수도 있으므로 에러는 무시
        }
    }, 1000);

    // Command 등록
    context.subscriptions.push(vscode.commands.registerCommand('codepilot.openChatView', async () => {
        try {
            await vscode.commands.executeCommand('workbench.view.extension.codepilot');
            await vscode.commands.executeCommand(`${ChatViewProvider.viewType}.focus`);
        } catch (error: any) {
            console.error('[Extension] Error opening chat view:', error);
        }
    }));
    // Registering commands

    context.subscriptions.push(vscode.commands.registerCommand('codepilot.openSettingsPanel', () => {
        // openSettingsPanel command called
        if (!openSettingsPanel) {
            console.error('[Extension] ERROR: openSettingsPanel is undefined when command is called!');
            vscode.window.showErrorMessage('Settings panel could not be opened. Please reload the extension.');
            return;
        }
        openSettingsPanel(context.extensionUri, context, vscode.ViewColumn.One, settingsManager, notificationService, geminiApi, licenseService, ollamaApi, undefined, undefined, chatViewProvider);
    }));
    // Command registered: codepilot.openSettingsPanel

    // 언어 변경 브로드캐스트 명령어 등록
    context.subscriptions.push(vscode.commands.registerCommand('codepilot.broadcastLanguageChange', (language: string) => {
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


    // Firebase 연결 테스트 명령어
    context.subscriptions.push(vscode.commands.registerCommand('codepilot.testFirebaseConnection', async () => {
        try {
            const result = await licenseService.testFirebaseConnection();
            if (result.success) {
                vscode.window.showInformationMessage(`Firebase 연결: ${result.message}`);
            } else {
                vscode.window.showErrorMessage(`Firebase 연결 실패: ${result.message}`);
            }
        } catch (error) {
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
            } else {
                vscode.window.showErrorMessage('ErrorManager를 찾을 수 없습니다.');
            }
        } catch (error) {
            vscode.window.showErrorMessage(`터미널 모니터링 테스트 오류: ${error}`);
        }
    }));

    // 캐시 통계 보기 명령어 (패널에 출력)
    context.subscriptions.push(vscode.commands.registerCommand('codepilot.viewCacheStats', async () => {
        try {
            const sessionManager = (await import('./core/managers/state/SessionManager')).SessionManager.getInstance(context);
            const stats = sessionManager.getCacheStats();

            if (!stats) {
                chatViewProvider.postMessageToWebview({
                    command: 'receiveMessage',
                    sender: 'System',
                    text: '⚠️ 캐시 통계를 가져올 수 없습니다.'
                });
                return;
            }

            chatViewProvider.postMessageToWebview({
                command: 'receiveMessage',
                sender: 'System',
                text: `### 캐시 통계\n\n` +
                    `- **총 캐시 엔트리**: ${stats.totalEntries}개\n` +
                    `- **총 캐시 크기**: ${(stats.totalSize / 1024 / 1024).toFixed(2)} MB\n` +
                    `- **캐시 히트**: ${stats.hitCount}회\n` +
                    `- **캐시 미스**: ${stats.missCount}회\n` +
                    `- **캐시 히트율**: ${(stats.hitRate * 100).toFixed(1)}%`
            });

        } catch (error) {
            chatViewProvider.postMessageToWebview({
                command: 'receiveMessage',
                sender: 'System',
                text: `❌ 캐시 통계 조회 실패: ${error}`
            });
        }
    }));

    // 캐시 초기화 명령어 (QuickPick 확인 + 패널에 결과 출력)
    context.subscriptions.push(vscode.commands.registerCommand('codepilot.clearCache', async () => {
        try {
            const confirm = await vscode.window.showQuickPick(['예', '아니오'], {
                title: '캐시 초기화',
                placeHolder: '모든 컨텍스트 캐시를 초기화하시겠습니까?'
            });

            if (confirm === '예') {
                const sessionManager = (await import('./core/managers/state/SessionManager')).SessionManager.getInstance(context);
                sessionManager.clearAllCache();
                chatViewProvider.postMessageToWebview({
                    command: 'receiveMessage',
                    sender: 'System',
                    text: '### 캐시 초기화 완료\n\n모든 컨텍스트 캐시가 초기화되었습니다.'
                });
            }
        } catch (error) {
            chatViewProvider.postMessageToWebview({
                command: 'receiveMessage',
                sender: 'System',
                text: `❌ 캐시 초기화 실패: ${error}`
            });
        }
    }));

    // 저장된 세션 목록 보기 명령어 (QuickPick)
    context.subscriptions.push(vscode.commands.registerCommand('codepilot.listSavedSessions', async () => {
        try {
            const sessionManager = (await import('./core/managers/state/SessionManager')).SessionManager.getInstance(context);
            const sessions = sessionManager.getAllSessions();

            if (sessions.length === 0) {
                vscode.window.showInformationMessage('저장된 세션이 없습니다.');
                return;
            }

            const items = sessions.map((session: any) => ({
                label: session.projectPath.split('/').pop() || session.projectPath,
                description: `메시지 ${session.conversationHistory.length}개`,
                detail: `마지막 활성: ${new Date(session.lastActiveAt).toLocaleString()}`,
                sessionId: session.id
            }));

            const selected = await vscode.window.showQuickPick(items, {
                title: '저장된 세션 목록',
                placeHolder: '세션을 선택하세요'
            });

            // 선택만 하고 알림 표시하지 않음
        } catch (error) {
            vscode.window.showErrorMessage(`세션 목록 조회 실패: ${error}`);
        }
    }));

    // 저장된 세션 복원 명령어 (QuickPick)
    context.subscriptions.push(vscode.commands.registerCommand('codepilot.restoreSavedSession', async () => {
        try {
            const sessionManager = (await import('./core/managers/state/SessionManager')).SessionManager.getInstance(context);
            const sessions = sessionManager.getAllSessions();

            if (sessions.length === 0) {
                vscode.window.showInformationMessage('복원할 세션이 없습니다.');
                return;
            }

            const items = sessions.map((session: any) => ({
                label: session.projectPath.split('/').pop() || session.projectPath,
                description: `메시지 ${session.conversationHistory.length}개`,
                detail: `생성: ${new Date(session.createdAt).toLocaleString()}`,
                sessionId: session.id
            }));

            const selected = await vscode.window.showQuickPick(items, {
                title: '세션 복원',
                placeHolder: '복원할 세션을 선택하세요'
            });

            if (selected && (selected as any).sessionId) {
                const success = sessionManager.setCurrentSession((selected as any).sessionId);
                if (success) {
                    const session = sessionManager.getSession((selected as any).sessionId);
                    if (session && chatViewProvider) {
                        // 채팅 패널에 대화 히스토리 복원
                        chatViewProvider.restoreConversationHistory(session.conversationHistory);
                    }
                } else {
                    vscode.window.showErrorMessage('세션 복원에 실패했습니다.');
                }
            }
        } catch (error) {
            vscode.window.showErrorMessage(`세션 복원 실패: ${error}`);
        }
    }));

    // 대화 압축 명령어 (QuickPick 확인 추가)
    context.subscriptions.push(vscode.commands.registerCommand('codepilot.compactConversation', async () => {
        try {
            const sessionManager = (await import('./core/managers/state/SessionManager')).SessionManager.getInstance(context);
            const currentSession = sessionManager.getCurrentSession();

            if (!currentSession || currentSession.conversationHistory.length < 3) {
                chatViewProvider.postMessageToWebview({
                    command: 'receiveMessage',
                    sender: 'System',
                    text: '⚠️ 압축할 대화가 충분하지 않습니다. (최소 3개 이상의 대화 필요)'
                });
                return;
            }

            // 확인 다이얼로그
            const confirm = await vscode.window.showQuickPick(['예', '아니오'], {
                title: '대화 압축',
                placeHolder: `현재 대화(${currentSession.conversationHistory.length}개)를 압축하시겠습니까?`
            });

            if (confirm !== '예') {
                return;
            }

            // 로딩 표시 및 Processing Steps 업데이트
            chatViewProvider.postMessageToWebview({ command: 'showLoading' });
            chatViewProvider.postMessageToWebview({
                command: 'updateProcessingStatus',
                status: '> 대화 압축 준비 중...'
            });

            // LLMManager와 ConversationCompactor 가져오기
            const { ConversationCompactor } = await import('./core/managers/conversation/ConversationCompactor');
            const { LLMManager } = await import('./core/managers/model/LLMManager');
            const { StateManager } = await import('./core/managers/state/StateManager');
            const llmManager = LLMManager.getInstance(geminiApi, ollamaApi, banyaApi);
            const compactor = ConversationCompactor.getInstance(llmManager);
            // StateManager 설정 (compactorModel 사용을 위해)
            compactor.setStateManager(StateManager.getInstance(context));

            // 현재 세션의 대화 히스토리를 userParts 형식으로 변환
            const userParts = currentSession.conversationHistory.map((entry: any) => ({
                text: `[User]: ${entry.userRequest}\n[Assistant]: ${entry.assistantResponse || '(응답 없음)'}`
            }));

            // 모델의 최대 토큰 가져오기
            const currentModelType = llmManager.getCurrentModel();
            const { MODEL_TOKEN_LIMITS } = await import('./utils/tokenUtils');
            const maxTokens = MODEL_TOKEN_LIMITS[currentModelType]?.maxInputTokens || 128000;

            chatViewProvider.postMessageToWebview({
                command: 'updateProcessingStatus',
                status: `> 대화 압축 중... (${currentSession.conversationHistory.length}개 대화)`
            });

            // 강제 압축 실행
            const result = await compactor.forceCompact(userParts, maxTokens);

            // 로딩 숨기기
            chatViewProvider.postMessageToWebview({ command: 'hideLoading' });

            if (result.compacted && result.summary) {
                // 세션에 압축 요약 저장
                sessionManager.addCompactedSummary(currentSession.id, result.summary);

                // 오래된 대화 히스토리 정리 (최근 N개만 유지)
                const keepCount = Math.min(6, currentSession.conversationHistory.length);
                sessionManager.trimSessionHistory(keepCount);

                const savedPercent = ((result.savedTokens / result.originalTokens) * 100).toFixed(1);

                // 패널에 결과 메시지 표시
                chatViewProvider.postMessageToWebview({
                    command: 'receiveMessage',
                    sender: 'System',
                    text: `### 대화 압축 완료\n\n` +
                        `- **원본 토큰**: ${result.originalTokens.toLocaleString()}\n` +
                        `- **압축 후 토큰**: ${result.compactedTokens.toLocaleString()}\n` +
                        `- **절감률**: ${savedPercent}%\n\n` +
                        `최근 ${keepCount}개의 대화만 유지됩니다.`
                });

                // 토큰 게이지 업데이트
                chatViewProvider.postMessageToWebview({
                    command: 'updateContextInfo',
                    contextInfo: {
                        messageCount: keepCount,
                        tokenUsage: {
                            current: result.compactedTokens,
                            max: maxTokens,
                            percentage: (result.compactedTokens / maxTokens) * 100
                        }
                    }
                });
            } else {
                chatViewProvider.postMessageToWebview({
                    command: 'receiveMessage',
                    sender: 'System',
                    text: '⚠️ 압축할 대화가 충분하지 않습니다.'
                });
            }
        } catch (error) {
            console.error('[Extension] 대화 압축 실패:', error);
            chatViewProvider.postMessageToWebview({ command: 'hideLoading' });
            chatViewProvider.postMessageToWebview({
                command: 'receiveMessage',
                sender: 'System',
                text: `❌ 대화 압축 실패: ${error}`
            });
        }
    }));

    // Git 상태 보기 명령어
    context.subscriptions.push(vscode.commands.registerCommand('codepilot.gitStatus', async () => {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                chatViewProvider.postMessageToWebview({
                    command: 'receiveMessage',
                    sender: 'System',
                    text: '⚠️ 워크스페이스가 열려있지 않습니다.'
                });
                return;
            }

            const { exec } = require('child_process');
            const { promisify } = require('util');
            const execAsync = promisify(exec);

            const { stdout } = await execAsync('git status', { cwd: workspaceFolder.uri.fsPath });

            chatViewProvider.postMessageToWebview({
                command: 'receiveMessage',
                sender: 'System',
                text: `### 📊 Git 상태\n\n\`\`\`\n${stdout}\n\`\`\``
            });
        } catch (error: any) {
            chatViewProvider.postMessageToWebview({
                command: 'receiveMessage',
                sender: 'System',
                text: `❌ Git 상태 확인 실패: ${error.message || error}`
            });
        }
    }));

    // Git 변경사항 보기 명령어
    context.subscriptions.push(vscode.commands.registerCommand('codepilot.gitDiff', async () => {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                chatViewProvider.postMessageToWebview({
                    command: 'receiveMessage',
                    sender: 'System',
                    text: '⚠️ 워크스페이스가 열려있지 않습니다.'
                });
                return;
            }

            const { exec } = require('child_process');
            const { promisify } = require('util');
            const execAsync = promisify(exec);

            const { stdout } = await execAsync('git diff --stat', { cwd: workspaceFolder.uri.fsPath });

            if (!stdout.trim()) {
                chatViewProvider.postMessageToWebview({
                    command: 'receiveMessage',
                    sender: 'System',
                    text: '### 📝 Git 변경사항\n\n변경된 파일이 없습니다.'
                });
                return;
            }

            chatViewProvider.postMessageToWebview({
                command: 'receiveMessage',
                sender: 'System',
                text: `### 📝 Git 변경사항\n\n\`\`\`\n${stdout}\n\`\`\``
            });
        } catch (error: any) {
            chatViewProvider.postMessageToWebview({
                command: 'receiveMessage',
                sender: 'System',
                text: `❌ Git 변경사항 확인 실패: ${error.message || error}`
            });
        }
    }));

    // Git 히스토리 보기 명령어
    context.subscriptions.push(vscode.commands.registerCommand('codepilot.gitLog', async () => {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                chatViewProvider.postMessageToWebview({
                    command: 'receiveMessage',
                    sender: 'System',
                    text: '⚠️ 워크스페이스가 열려있지 않습니다.'
                });
                return;
            }

            const { exec } = require('child_process');
            const { promisify } = require('util');
            const execAsync = promisify(exec);

            const { stdout } = await execAsync('git log --oneline -15', { cwd: workspaceFolder.uri.fsPath });

            chatViewProvider.postMessageToWebview({
                command: 'receiveMessage',
                sender: 'System',
                text: `### 📜 Git 커밋 히스토리 (최근 15개)\n\n\`\`\`\n${stdout}\n\`\`\``
            });
        } catch (error: any) {
            chatViewProvider.postMessageToWebview({
                command: 'receiveMessage',
                sender: 'System',
                text: `❌ Git 히스토리 확인 실패: ${error.message || error}`
            });
        }
    }));

    // Git 브랜치 목록 명령어
    context.subscriptions.push(vscode.commands.registerCommand('codepilot.gitBranch', async () => {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                chatViewProvider.postMessageToWebview({
                    command: 'receiveMessage',
                    sender: 'System',
                    text: '⚠️ 워크스페이스가 열려있지 않습니다.'
                });
                return;
            }

            const { exec } = require('child_process');
            const { promisify } = require('util');
            const execAsync = promisify(exec);

            const { stdout: localBranches } = await execAsync('git branch', { cwd: workspaceFolder.uri.fsPath });
            const { stdout: remoteBranches } = await execAsync('git branch -r', { cwd: workspaceFolder.uri.fsPath });

            chatViewProvider.postMessageToWebview({
                command: 'receiveMessage',
                sender: 'System',
                text: `### 🌿 Git 브랜치 목록\n\n**로컬 브랜치:**\n\`\`\`\n${localBranches}\n\`\`\`\n\n**원격 브랜치:**\n\`\`\`\n${remoteBranches}\n\`\`\``
            });
        } catch (error: any) {
            chatViewProvider.postMessageToWebview({
                command: 'receiveMessage',
                sender: 'System',
                text: `❌ Git 브랜치 확인 실패: ${error.message || error}`
            });
        }
    }));

    // Git 리포지토리 정보 명령어
    context.subscriptions.push(vscode.commands.registerCommand('codepilot.gitInfo', async () => {
        try {
            const gitInfo = await gitRepositoryService.getRepositoryInfo();

            if (!gitInfo) {
                chatViewProvider.postMessageToWebview({
                    command: 'receiveMessage',
                    sender: 'System',
                    text: '### ℹ️ Git 리포지토리 정보\n\nGit 리포지토리가 감지되지 않았습니다.'
                });
                return;
            }

            chatViewProvider.postMessageToWebview({
                command: 'receiveMessage',
                sender: 'System',
                text: `### ℹ️ Git 리포지토리 정보\n\n` +
                    `- **소유자**: ${gitInfo.owner}\n` +
                    `- **리포지토리**: ${gitInfo.repo}\n` +
                    `- **현재 브랜치**: ${gitInfo.branch}\n` +
                    `- **원격 저장소**: ${gitInfo.remoteName}\n` +
                    `- **URL**: ${gitInfo.url}\n` +
                    `- **GitHub**: ${gitInfo.isGitHub ? '✅' : '❌'}`
            });
        } catch (error: any) {
            chatViewProvider.postMessageToWebview({
                command: 'receiveMessage',
                sender: 'System',
                text: `❌ Git 정보 확인 실패: ${error.message || error}`
            });
        }
    }));

    // Git 스테이징된 변경사항 보기 명령어
    context.subscriptions.push(vscode.commands.registerCommand('codepilot.gitStaged', async () => {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                chatViewProvider.postMessageToWebview({
                    command: 'receiveMessage',
                    sender: 'System',
                    text: '⚠️ 워크스페이스가 열려있지 않습니다.'
                });
                return;
            }

            const { exec } = require('child_process');
            const { promisify } = require('util');
            const execAsync = promisify(exec);

            const { stdout } = await execAsync('git diff --staged --stat', { cwd: workspaceFolder.uri.fsPath });

            if (!stdout.trim()) {
                chatViewProvider.postMessageToWebview({
                    command: 'receiveMessage',
                    sender: 'System',
                    text: '### 📋 스테이징된 변경사항\n\n스테이징된 파일이 없습니다.'
                });
                return;
            }

            chatViewProvider.postMessageToWebview({
                command: 'receiveMessage',
                sender: 'System',
                text: `### 📋 스테이징된 변경사항\n\n\`\`\`\n${stdout}\n\`\`\``
            });
        } catch (error: any) {
            chatViewProvider.postMessageToWebview({
                command: 'receiveMessage',
                sender: 'System',
                text: `❌ 스테이징 변경사항 확인 실패: ${error.message || error}`
            });
        }
    }));

    // Git Stash 목록 보기 명령어
    context.subscriptions.push(vscode.commands.registerCommand('codepilot.gitStash', async () => {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                chatViewProvider.postMessageToWebview({
                    command: 'receiveMessage',
                    sender: 'System',
                    text: '⚠️ 워크스페이스가 열려있지 않습니다.'
                });
                return;
            }

            const { exec } = require('child_process');
            const { promisify } = require('util');
            const execAsync = promisify(exec);

            const { stdout } = await execAsync('git stash list', { cwd: workspaceFolder.uri.fsPath });

            if (!stdout.trim()) {
                chatViewProvider.postMessageToWebview({
                    command: 'receiveMessage',
                    sender: 'System',
                    text: '### 📦 Git Stash 목록\n\n저장된 stash가 없습니다.'
                });
                return;
            }

            chatViewProvider.postMessageToWebview({
                command: 'receiveMessage',
                sender: 'System',
                text: `### 📦 Git Stash 목록\n\n\`\`\`\n${stdout}\n\`\`\``
            });
        } catch (error: any) {
            chatViewProvider.postMessageToWebview({
                command: 'receiveMessage',
                sender: 'System',
                text: `❌ Stash 목록 확인 실패: ${error.message || error}`
            });
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
                } else {
                    // 워크스페이스 변경 - Git 리포지토리가 감지되지 않았습니다
                }
            }
        } catch (error) {
            console.error('[Extension] 워크스페이스 변경 시 Git 리포지토리 감지 중 오류:', error);
        }
    }));

}

export function deactivate() {
    // 터미널 정리는 TerminalManager에서 처리됨
}