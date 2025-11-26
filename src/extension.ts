import * as vscode from 'vscode';

// 사용자 정의 모듈 임포트
import { StorageService } from './services/storage';
import { GeminiApi } from './ai/gemini';
import { ConfigurationService } from './services/configurationService';
import { NotificationService } from './services/notificationService';
import { CodebaseContextService } from './ai/codebaseContextService';
import { LlmResponseProcessor } from './ai/llmResponseProcessor';
import { LlmService } from './ai/llmService';
import { AiModelType } from './ai/types';
import { OllamaApi } from './ai/ollama';
import { ChatViewProvider } from './webview/chatViewProvider';
import { AskViewProvider } from './webview/askViewProvider'; // 새로 추가된 AskViewProvider 임포트
import { getAidevIdeTerminal, setTerminalMonitorService, setOutputLogEnabled } from './terminal/terminalManager';
import { openSettingsPanel } from './webview/panelManager';
import { LicenseService } from './services/licenseService';
import { OllamaBlockerService } from './services/ollamaBlockerService';
import { TerminalDaemonService } from './services/terminalDaemonService';
import { TerminalMonitorService } from './ai/terminalMonitorService';
import { GitRepositoryService } from './services/gitRepositoryService';
import { DebugLogger } from './utils/debugLogger';
import { getAbstractionService } from './abstractions';

// 전역 변수
let storageService: StorageService;
let geminiApi: GeminiApi;
let ollamaApi: OllamaApi;
let configurationService: ConfigurationService;
let notificationService: NotificationService;
let codebaseContextService: CodebaseContextService;
let llmResponseProcessor: LlmResponseProcessor;
let llmService: LlmService;
let licenseService: LicenseService;
let ollamaBlockerService: OllamaBlockerService;
let terminalDaemonService: TerminalDaemonService;
let gitRepositoryService: GitRepositoryService;

export async function activate(context: vscode.ExtensionContext) {
    // console.log('Congratulations, aidev-ide is now active!');

    // 서비스 초기화 (순서 중요: 의존성 주입)
    storageService = new StorageService(context.secrets);
    notificationService = new NotificationService();
    configurationService = new ConfigurationService();
    licenseService = new LicenseService();
    ollamaBlockerService = OllamaBlockerService.getInstance(context);
    terminalDaemonService = TerminalDaemonService.getInstance(context);
    gitRepositoryService = new GitRepositoryService(context);

    // 추상화 레이어 초기화
    const abstractionService = getAbstractionService();
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    if (workspacePath) {
        try {
            await abstractionService.setProjectPath(workspacePath);
            const context = abstractionService.getFullContext();
            console.log('[Extension] Abstraction Service initialized:', {
                os: context.os.name,
                shell: context.os.shell,
                framework: context.framework?.name || 'Not detected',
                llm: context.llm.name
            });
        } catch (error) {
            console.error('[Extension] Failed to initialize abstraction service:', error);
        }
    } else {
        console.warn('[Extension] No workspace folder found, abstraction service initialized without project path');
    }

    // ollama-blocker 자동 설치 확인 및 설치
    try {
        const isInstalled = await ollamaBlockerService.isInstalled();
        if (!isInstalled) {
            console.log('ollama-blocker 설치 중...');
            const installResult = await ollamaBlockerService.install();
            if (installResult.success) {
                console.log('ollama-blocker 설치 완료:', installResult.message);
            } else {
                console.error('ollama-blocker 설치 실패:', installResult.message);
            }
        }
    } catch (error) {
        console.error('ollama-blocker 설치 확인 중 오류:', error);
    }

    // ollama-blocker 자동 시작 (시리얼 번호가 없는 경우에만)
    try {
        // 시리얼 번호 확인
        const licenseSerial = await storageService.getBanyaLicenseSerial();
        if (licenseSerial && licenseSerial.trim() !== '') {
            // console.log('시리얼 번호가 저장되어 있습니다. ollama-blocker를 시작하지 않습니다.');
        } else {
            console.log('ollama-blocker 자동 시작 중...');

            // 먼저 현재 상태 확인
            const statusResult = await ollamaBlockerService.getStatus();
            if (statusResult.running) {
                console.log('ollama-blocker가 이미 실행 중입니다.');
            } else {
                // ollama-blocker 시작
                const startResult = await ollamaBlockerService.start();
                if (startResult.success) {
                    console.log('ollama-blocker 자동 시작 완료:', startResult.message);
                } else {
                    console.error('ollama-blocker 자동 시작 실패:', startResult.message);
                    // 재시도 로직
                    console.log('ollama-blocker 재시도 중...');
                    const retryResult = await ollamaBlockerService.start();
                    if (retryResult.success) {
                        console.log('ollama-blocker 재시도 성공:', retryResult.message);
                    } else {
                        console.error('ollama-blocker 재시도 실패:', retryResult.message);
                    }
                }
            }
        }
    } catch (error) {
        console.error('ollama-blocker 자동 시작 중 오류:', error);
    }

    // terminal-daemon 자동 시작 (설정이 활성화된 경우)
    // 현재 VS Code 터미널 API를 직접 사용하므로 터미널 데몬은 비활성화됨
    try {
        const enabled = await configurationService.isTerminalDaemonEnabled();
        if (enabled) {
            // 터미널 데몬 관련 로직은 현재 비활성화됨 (VS Code 터미널 API 직접 사용)
            // console.log('[Extension] Terminal-daemon disabled - using VS Code terminal API directly');
        }
    } catch (error) {
        console.error('terminal-daemon 설정 확인 중 오류:', error);
    }

    let currentAiModelInit = await storageService.getCurrentAiModel();
    console.log('[Extension] Current AI model from storage:', currentAiModelInit);

    // fallback: 설정에서 모델 타입을 유추하거나 기본값 처리 가능 (여기서는 문자열 비교만)
    const isGeminiSelected = (currentAiModelInit || '').toLowerCase() === 'gemini';
    console.log('[Extension] Is Gemini selected:', isGeminiSelected);

    const initialApiKey = await storageService.getApiKey();
    console.log('[Extension] Initial API key from storage:', {
        hasApiKey: !!initialApiKey,
        apiKeyLength: initialApiKey?.length || 0,
        apiKeyPrefix: initialApiKey ? `${initialApiKey.substring(0, 10)}...` : 'N/A',
        apiKeyTrimmed: initialApiKey ? initialApiKey.trim() : 'N/A'
    });

    if (isGeminiSelected) {
        if (!initialApiKey || initialApiKey.trim() === '') {
            console.warn('[Extension] Gemini selected but API key is empty');
            notificationService.showWarningMessage('aidev-ide: Gemini API Key is not set. Please set it in the Settings.');
            geminiApi = new GeminiApi();
        } else {
            console.log('[Extension] Creating GeminiApi with API key...');
            geminiApi = new GeminiApi(initialApiKey);

            // 초기화 상태 확인
            const isInitialized = geminiApi.isInitialized();
            console.log('[Extension] GeminiApi initialization check after construction:', {
                isInitialized: isInitialized,
                hasApiKey: !!initialApiKey,
                apiKeyLength: initialApiKey?.length || 0
            });

            if (!isInitialized) {
                console.error('[Extension] API initialization failed on extension activation. API Key status:', {
                    hasApiKey: !!initialApiKey,
                    apiKeyLength: initialApiKey?.length || 0,
                    apiKeyPrefix: initialApiKey ? `${initialApiKey.substring(0, 10)}...` : 'N/A',
                    apiKeyTrimmed: initialApiKey ? initialApiKey.trim() : 'N/A'
                });

                // 재시도
                console.log('[Extension] Attempting to reinitialize with updateApiKey...');
                const reinitialized = geminiApi.updateApiKey(initialApiKey);
                console.log('[Extension] Reinitialization result:', {
                    success: reinitialized,
                    isInitialized: geminiApi.isInitialized()
                });

                if (!reinitialized) {
                    console.error('[Extension] API reinitialization also failed on extension activation. Full status:', {
                        hasApiKey: !!initialApiKey,
                        apiKeyLength: initialApiKey?.length || 0,
                        apiKeyPrefix: initialApiKey ? `${initialApiKey.substring(0, 10)}...` : 'N/A',
                        geminiApiHasApiKey: !!geminiApi.apiKey,
                        geminiApiKeyLength: geminiApi.apiKey?.length || 0
                    });
                } else {
                    console.log('[Extension] API reinitialized successfully on extension activation.');
                }
            } else {
                console.log('[Extension] API initialized successfully on extension activation.');
            }
        }
    } else {
        // Gemini가 선택되지 않은 경우 키 유무와 상관없이 조용히 초기화 (경고 출력 안 함)
        console.log('[Extension] Gemini not selected, creating GeminiApi without warning...', {
            hasApiKey: !!initialApiKey,
            apiKeyLength: initialApiKey?.length || 0
        });
        geminiApi = new GeminiApi(initialApiKey);
        console.log('[Extension] GeminiApi created (non-Gemini mode):', {
            isInitialized: geminiApi.isInitialized(),
            hasApiKey: !!geminiApi.apiKey
        });
    }

    // Ollama API 초기화
    const initialOllamaUrl = await storageService.getOllamaApiUrl();
    const initialOllamaEndpoint = await storageService.getOllamaEndpoint();
    const initialOllamaModel = await storageService.getOllamaModel();
    ollamaApi = new OllamaApi(initialOllamaUrl || 'http://localhost:11434', initialOllamaEndpoint, storageService);
    ollamaApi.setModel(initialOllamaModel);
    try {
        await ollamaApi.loadSettingsFromStorage();
    } catch (e) {
        console.warn('[Extension] Failed to load Ollama settings at startup:', e);
    }

    // AI 관련 서비스 초기화
    codebaseContextService = new CodebaseContextService(configurationService, notificationService);
    llmResponseProcessor = new LlmResponseProcessor(context, configurationService, notificationService);
    llmService = new LlmService(
        storageService,
        geminiApi,
        ollamaApi,
        codebaseContextService,
        llmResponseProcessor,
        notificationService,
        configurationService,
        context // extension context 전달
    );

    // CodebaseContextService에 LlmService 주입
    codebaseContextService.setLlmService(llmService);

    // 사용자 OS 정보를 LlmService에 설정
    const userOS = require('os').platform() === 'darwin' ? 'macOS' :
        require('os').platform() === 'win32' ? 'Windows' :
            require('os').platform() === 'linux' ? 'Linux' : 'Unknown';
    llmService.setUserOS(userOS);
    console.log(`[Extension] 사용자 OS 감지 및 설정: ${userOS}`);

    // Git 리포지토리 정보 자동 감지
    try {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
            const gitInfo = await gitRepositoryService.detectAndSaveRepositoryInfo(workspaceFolder.uri.fsPath);
            if (gitInfo) {
                console.log(`[Extension] Git 리포지토리 감지됨: ${gitInfo.owner}/${gitInfo.repo}`);
            } else {
                console.log('[Extension] Git 리포지토리가 감지되지 않았습니다.');
            }
        }
    } catch (error) {
        console.error('[Extension] Git 리포지토리 감지 중 오류:', error);
    }

    // 터미널 매니저에도 사용자 OS 설정
    const { setUserOS } = await import('./terminal/terminalManager');
    setUserOS(userOS);

    // 현재 AI 모델 설정 로드 (runtime 키와 UI 키를 모두 읽어 정합성 맞춤)
    let currentAiModel = await storageService.getCurrentAiModel();
    const uiAiModel = await storageService.getAiModel();
    // 마이그레이션: 과거 'ollama' 값이 저장된 경우, 현재 Ollama 모델을 확인하여 구체적인 타입으로 변환
    if (currentAiModel === 'ollama') {
        const storedOllamaModel = await storageService.getOllamaModel();
        if (storedOllamaModel === 'deepseek-r1:70b') {
            currentAiModel = 'ollama-deepseek';
        } else if (storedOllamaModel && storedOllamaModel.startsWith('codellama')) {
            currentAiModel = 'ollama-codellama';
        } else if (storedOllamaModel === 'gpt-oss:120b-cloud' || storedOllamaModel === 'gpt-oss-120b:cloud') {
            currentAiModel = 'ollama-gpt-oss';
        } else if (storedOllamaModel && storedOllamaModel.startsWith('qwen')) {
            currentAiModel = 'ollama-gpt-oss';
        } else {
            currentAiModel = 'ollama-gemma';
        }
        await storageService.saveCurrentAiModel(currentAiModel as any);
    }
    // UI에서 저장된 모델이 우선 (과거 버전 잔존값 교정)
    try {
        if (uiAiModel && uiAiModel !== currentAiModel) {
            let mappedUiModel: string = uiAiModel;
            // 'ollama' 일반 문자열이 들어온 경우, 저장된 Ollama 실제 모델을 기준으로 구체 타입으로 변환
            if (uiAiModel === 'ollama') {
                try {
                    const storedOllamaModel = await storageService.getOllamaModel();
                    if (storedOllamaModel === 'deepseek-r1:70b') mappedUiModel = 'ollama-deepseek';
                    else if (storedOllamaModel && storedOllamaModel.startsWith('codellama')) mappedUiModel = 'ollama-codellama';
                    else if (storedOllamaModel === 'gpt-oss:120b-cloud' || storedOllamaModel === 'gpt-oss-120b:cloud' || (storedOllamaModel && storedOllamaModel.startsWith('qwen'))) mappedUiModel = 'ollama-gpt-oss';
                    else mappedUiModel = 'ollama-gemma';
                } catch { mappedUiModel = 'ollama-gemma'; }
            }
            currentAiModel = mappedUiModel as any;
            await storageService.saveCurrentAiModel(mappedUiModel);
        }
    } catch { /* noop */ }

    if (currentAiModel) {
        llmService.setCurrentModel(currentAiModel as AiModelType);
    }

    // 터미널 매니저에 오류 수정 서비스 설정은 각 웹뷰 프로바이더에서 수행됨

    // 터미널 모니터링 서비스 초기화 및 LLM 서비스 설정
    const terminalMonitorService = new TerminalMonitorService(notificationService);
    terminalMonitorService.setLlmService(llmService);

    // OUTPUT 로그 설정 로드 및 적용
    const outputLogEnabled = await configurationService.isOutputLogEnabled();
    terminalMonitorService.setOutputLogEnabled(outputLogEnabled);
    // console.log(`[Extension] OUTPUT 로그 설정: ${outputLogEnabled ? '활성화' : '비활성화'}`);

    // 디버그 로그: VS Code Run/Debug 이벤트에만 연동 (설정 플래그 사용 중단)
    const projectRootForDebug = await configurationService.getProjectRoot();
    DebugLogger.setContext(false, projectRootForDebug);

    // VS Code Run and Debug 연동: 디버그 세션 시작 시 자동으로 로그 파일 생성(덮어쓰기) 및 기록 시작
    context.subscriptions.push(vscode.debug.onDidStartDebugSession(async (session) => {
        try {
            const root = await configurationService.getProjectRoot();
            DebugLogger.setContext(true, root);
            DebugLogger.startIfEnabled();
            DebugLogger.log(`VS Code debug session started: ${session.name}`);
        } catch { /* ignore */ }
    }));

    // 디버그 세션 종료 시: 자동 기록 중단
    context.subscriptions.push(vscode.debug.onDidTerminateDebugSession(async (session) => {
        try {
            const root = await configurationService.getProjectRoot();
            DebugLogger.log(`VS Code debug session ended: ${session.name}`);
            DebugLogger.setContext(false, root);
        } catch { /* ignore */ }
    }));

    // 자동 오류 수정 설정 로드 및 적용 (StorageService에서 읽기 - 설정 패널과 동일한 소스 사용)
    const autoCorrectionEnabled = await storageService.getAutoCorrectionEnabled();
    console.log(`[Extension] getAutoCorrectionEnabled() from StorageService -> ${autoCorrectionEnabled}`);
    terminalMonitorService.setAutoCorrectionEnabled(autoCorrectionEnabled);
    console.log(`[Extension] 자동 오류 수정 적용 완료: ${autoCorrectionEnabled ? '활성화' : '비활성화'}`);
    const errorRetryCount = await configurationService.getErrorRetryCount();
    terminalMonitorService.setMaxErrorRetries(errorRetryCount);
    console.log(`[Extension] 오류 수정 횟수 설정: ${errorRetryCount}`);
    terminalMonitorService.startMonitoring();

    // 터미널 매니저에 모니터링 서비스 설정
    setTerminalMonitorService(terminalMonitorService);

    // OUTPUT 로그 설정 초기화
    const initialOutputLogEnabled = await configurationService.isOutputLogEnabled();
    setOutputLogEnabled(initialOutputLogEnabled);

    // ChatViewProvider 인스턴스 생성 및 등록 (CODE 탭)
    const chatViewProvider = new ChatViewProvider(
        context.extensionUri,
        context,
        llmService,
        (viewColumn: vscode.ViewColumn) => openSettingsPanel(context.extensionUri, context, viewColumn, configurationService, notificationService, storageService, geminiApi, licenseService, ollamaApi, llmService, undefined, terminalMonitorService),
        (viewColumn: vscode.ViewColumn) => openSettingsPanel(context.extensionUri, context, viewColumn, configurationService, notificationService, storageService, geminiApi, licenseService, ollamaApi, llmService, ollamaBlockerService, terminalMonitorService),
        configurationService,
        notificationService,
        storageService,
        gitRepositoryService
    );

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, chatViewProvider, {
            webviewOptions: { retainContextWhenHidden: true }
        })
    );

    // AskViewProvider 인스턴스 생성 및 등록 (ASK 탭)
    const askViewProvider = new AskViewProvider(
        context.extensionUri,
        context,
        llmService,
        configurationService,
        notificationService,
        storageService
    );

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(AskViewProvider.viewType, askViewProvider, {
            webviewOptions: { retainContextWhenHidden: true }
        })
    );

    // Command 등록
    context.subscriptions.push(vscode.commands.registerCommand('aidevIdeCode.openChatView', () => {
        vscode.commands.executeCommand('workbench.view.extension.aidevIdeCode');
        vscode.commands.executeCommand(`${ChatViewProvider.viewType}.focus`); // CODE 탭으로 포커스
    }));
    context.subscriptions.push(vscode.commands.registerCommand('aidevIdeAsk.openAskView', () => {
        vscode.commands.executeCommand('workbench.view.extension.aidevIdeAsk');
        vscode.commands.executeCommand(`${AskViewProvider.viewType}.focus`); // ASK 탭으로 포커스
    }));
    context.subscriptions.push(vscode.commands.registerCommand('aidevIdeCode.openSettingsPanel', () => {
        openSettingsPanel(context.extensionUri, context, vscode.ViewColumn.One, configurationService, notificationService, storageService, geminiApi, licenseService, ollamaApi, llmService, ollamaBlockerService, terminalMonitorService);
    }));
    // context.subscriptions.push(vscode.commands.registerCommand('aidevIdeCode.openLicensePanel', () => {
    //     openLicensePanel(context.extensionUri, context, vscode.ViewColumn.One, storageService, geminiApi, notificationService, configurationService);
    // }));

    // 언어 변경 브로드캐스트 명령어 등록
    context.subscriptions.push(vscode.commands.registerCommand('aidevIdeCode.broadcastLanguageChange', (language: string) => {
        // 모든 활성 webview에 언어 변경 메시지 브로드캐스트
        vscode.window.terminals.forEach(terminal => {
            if (terminal.name.includes('aidev-ide')) {
                terminal.sendText(`echo "Language changed to: ${language}"`);
            }
        });

        // 모든 활성 webview 패널에 언어 변경 메시지 전송
        vscode.window.terminals.forEach(terminal => {
            if (terminal.name.includes('aidev-ide')) {
                terminal.sendText(`echo "Language changed to: ${language}"`);
            }
        });
    }));

    // Status Bar에 자동 오류 수정 중단 버튼 추가
    const stopErrorCorrectionButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    stopErrorCorrectionButton.text = "$(stop-circle)";
    stopErrorCorrectionButton.tooltip = "자동 오류 수정 중단";
    stopErrorCorrectionButton.command = 'aidevIdeCode.stopErrorCorrection';
    stopErrorCorrectionButton.show();
    context.subscriptions.push(stopErrorCorrectionButton);

    // 자동 오류 수정 중단 명령어 등록
    context.subscriptions.push(vscode.commands.registerCommand('aidevIdeCode.stopErrorCorrection', () => {
        terminalMonitorService.stopErrorCorrection();
        vscode.window.showInformationMessage('자동 오류 수정이 중단되었습니다.');
    }));

    // 설정 변경 시 TerminalMonitorService와 TerminalManager에 반영
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(async (event) => {
        if (event.affectsConfiguration('aidevIde.outputLogEnabled')) {
            const outputLogEnabled = await configurationService.isOutputLogEnabled();
            terminalMonitorService.setOutputLogEnabled(outputLogEnabled);
            setOutputLogEnabled(outputLogEnabled);
            // console.log(`[Extension] OUTPUT 로그 설정 변경: ${outputLogEnabled ? '활성화' : '비활성화'}`);
        }
        if (event.affectsConfiguration('aidevIde.errorRetryCount')) {
            const errorRetryCount = await configurationService.getErrorRetryCount();
            terminalMonitorService.setMaxErrorRetries(errorRetryCount);
            // console.log(`[Extension] 오류 수정 횟수 설정 변경: ${errorRetryCount}`);
        }
        if (event.affectsConfiguration('aidevIde.autoCorrectionEnabled')) {
            // StorageService에서 읽기 (설정 패널과 동일한 소스)
            const enabled = await storageService.getAutoCorrectionEnabled();
            console.log(`[Extension] onDidChangeConfiguration: autoCorrectionEnabled -> ${enabled}`);
            terminalMonitorService.setAutoCorrectionEnabled(enabled);
        }
        // debugEnabled 설정은 더 이상 사용하지 않음 (Run/Debug 이벤트로만 제어)
    }));

    // ollama-blocker 관리 명령어들
    context.subscriptions.push(vscode.commands.registerCommand('aidevIdeCode.startOllamaBlocker', async () => {
        const result = await ollamaBlockerService.start();
        if (result.success) {
            vscode.window.showInformationMessage(`ollama-blocker: ${result.message}`);
        } else {
            vscode.window.showErrorMessage(`ollama-blocker: ${result.message}`);
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('aidevIdeCode.stopOllamaBlocker', async () => {
        const result = await ollamaBlockerService.stop();
        if (result.success) {
            vscode.window.showInformationMessage(`ollama-blocker: ${result.message}`);
        } else {
            vscode.window.showErrorMessage(`ollama-blocker: ${result.message}`);
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('aidevIdeCode.ollamaBlockerStatus', async () => {
        const status = await ollamaBlockerService.getStatus();
        vscode.window.showInformationMessage(`ollama-blocker Status: ${status.message}`);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('aidevIdeCode.killOllamaProcesses', async () => {
        const result = await ollamaBlockerService.killOllamaProcesses();
        if (result.success) {
            vscode.window.showInformationMessage(`ollama-blocker: ${result.message}`);
        } else {
            vscode.window.showErrorMessage(`ollama-blocker: ${result.message}`);
        }
    }));

    // 디버그용 ollama-blocker 테스트 명령어
    context.subscriptions.push(vscode.commands.registerCommand('aidevIdeCode.testOllamaBlocker', async () => {
        try {
            const isInstalled = await ollamaBlockerService.isInstalled();
            vscode.window.showInformationMessage(`ollama-blocker 설치 상태: ${isInstalled ? '설치됨' : '설치되지 않음'}`);

            if (isInstalled) {
                const status = await ollamaBlockerService.getStatus();
                vscode.window.showInformationMessage(`ollama-blocker 상태: ${status.message}`);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`ollama-blocker 테스트 오류: ${error}`);
        }
    }));

    // Firebase 연결 테스트 명령어
    context.subscriptions.push(vscode.commands.registerCommand('aidevIdeCode.testFirebaseConnection', async () => {
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
    context.subscriptions.push(vscode.commands.registerCommand('aidevIdeCode.testTerminalMonitoring', async () => {
        try {
            if (llmService) {
                // LlmService의 terminalMonitorService를 통해 테스트 실행
                const terminalMonitorService = (llmService as any).terminalMonitorService;
                if (terminalMonitorService) {
                    terminalMonitorService.testTerminalMonitoring();
                    const status = terminalMonitorService.getMonitoringStatus();
                    vscode.window.showInformationMessage(`터미널 모니터링 상태: 모니터링=${status.isMonitoring}, 활성 터미널=${status.activeTerminals}, 로그=${status.totalLogs}`);
                } else {
                    vscode.window.showErrorMessage('터미널 모니터링 서비스를 찾을 수 없습니다.');
                }
            } else {
                vscode.window.showErrorMessage('LlmService가 초기화되지 않았습니다.');
            }
        } catch (error) {
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
                    console.log(`[Extension] 워크스페이스 변경 - Git 리포지토리 감지됨: ${gitInfo.owner}/${gitInfo.repo}`);
                } else {
                    console.log('[Extension] 워크스페이스 변경 - Git 리포지토리가 감지되지 않았습니다.');
                }
            }
        } catch (error) {
            console.error('[Extension] 워크스페이스 변경 시 Git 리포지토리 감지 중 오류:', error);
        }
    }));

    // console.log('aidev-ide activated and commands registered.');
}

export function deactivate() {
    // 터미널 정리
    const terminal = getAidevIdeTerminal();
    if (terminal) {
        terminal.dispose();
    }
}