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
import { OllamaApi } from './ai/ollamaService';
import { ChatViewProvider } from './webview/chatViewProvider';
import { AskViewProvider } from './webview/askViewProvider'; // 새로 추가된 AskViewProvider 임포트
import { getAidevIdeTerminal, setTerminalMonitorService } from './terminal/terminalManager';
import { openSettingsPanel, openLicensePanel } from './webview/panelManager';
import { LicenseService } from './services/licenseService';
import { OllamaBlockerService } from './services/ollamaBlockerService';
import { TerminalDaemonService } from './services/terminalDaemonService';
import { TerminalMonitorService } from './ai/terminalMonitorService';

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

export async function activate(context: vscode.ExtensionContext) {
    // console.log('Congratulations, aidev-ide is now active!');

    // 서비스 초기화 (순서 중요: 의존성 주입)
    storageService = new StorageService(context.secrets);
    notificationService = new NotificationService();
    configurationService = new ConfigurationService();
    licenseService = new LicenseService();
    ollamaBlockerService = OllamaBlockerService.getInstance(context);
    terminalDaemonService = TerminalDaemonService.getInstance(context);

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

    const initialApiKey = await storageService.getApiKey();
    if (!initialApiKey || initialApiKey.trim() === '') {
        notificationService.showWarningMessage('aidev-ide: Gemini API Key is not set. Please set it in the License panel for AI features.');
        geminiApi = new GeminiApi();
    } else {
        geminiApi = new GeminiApi(initialApiKey);
    }

    // Ollama API 초기화
    const initialOllamaUrl = await storageService.getOllamaApiUrl();
    const initialOllamaEndpoint = await storageService.getOllamaEndpoint();
    const initialOllamaModel = await storageService.getOllamaModel();
    ollamaApi = new OllamaApi(initialOllamaUrl || 'http://localhost:11434', initialOllamaEndpoint);
    ollamaApi.setModel(initialOllamaModel);

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

    // 현재 AI 모델 설정 로드
    let currentAiModel = await storageService.getCurrentAiModel();
    // 마이그레이션: 과거 'ollama' 값이 저장된 경우, 현재 Ollama 모델을 확인하여 구체적인 타입으로 변환
    if (currentAiModel === 'ollama') {
        const storedOllamaModel = await storageService.getOllamaModel();
        if (storedOllamaModel === 'deepseek-r1:70b') {
            currentAiModel = 'ollama-deepseek';
        } else if (storedOllamaModel && storedOllamaModel.startsWith('codellama')) {
            currentAiModel = 'ollama-codellama';
        } else if (storedOllamaModel === 'gpt-oss:120b-cloud' || storedOllamaModel === 'gpt-oss-120b:cloud') {
            currentAiModel = 'ollama-gpt-oss';
        } else {
            currentAiModel = 'ollama-gemma';
        }
        await storageService.saveCurrentAiModel(currentAiModel as any);
    }
    if (currentAiModel) {
        llmService.setCurrentModel(currentAiModel as AiModelType);
    }

    // 터미널 매니저에 오류 수정 서비스 설정은 각 웹뷰 프로바이더에서 수행됨

    // 터미널 모니터링 서비스 초기화 및 LLM 서비스 설정
    const terminalMonitorService = new TerminalMonitorService(notificationService);
    terminalMonitorService.setLlmService(llmService);
    terminalMonitorService.startMonitoring();

    // 터미널 매니저에 모니터링 서비스 설정
    setTerminalMonitorService(terminalMonitorService);

    // ChatViewProvider 인스턴스 생성 및 등록 (CODE 탭)
    const chatViewProvider = new ChatViewProvider(
        context.extensionUri,
        context,
        llmService,
        (viewColumn: vscode.ViewColumn) => openSettingsPanel(context.extensionUri, context, viewColumn, configurationService, notificationService, storageService, geminiApi, licenseService, ollamaApi, llmService),
        (viewColumn: vscode.ViewColumn) => openLicensePanel(context.extensionUri, context, viewColumn, storageService, geminiApi, notificationService, configurationService),
        configurationService,
        notificationService,
        storageService
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
        openSettingsPanel(context.extensionUri, context, vscode.ViewColumn.One, configurationService, notificationService, storageService, geminiApi, licenseService, ollamaApi, llmService, ollamaBlockerService);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('aidevIdeCode.openLicensePanel', () => {
        openLicensePanel(context.extensionUri, context, vscode.ViewColumn.One, storageService, geminiApi, notificationService, configurationService);
    }));

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

    // console.log('aidev-ide activated and commands registered.');
}

export function deactivate() {
    // 터미널 정리
    const terminal = getAidevIdeTerminal();
    if (terminal) {
        terminal.dispose();
    }
}