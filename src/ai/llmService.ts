import * as vscode from 'vscode';
import { StorageService } from '../services/storage';
import { CodebaseContextService } from './codebaseContextService';
import { LlmKeywordSelectionService } from './llmKeywordSelectionService';
import { LlmResponseProcessor } from './llmResponseProcessor';
import { NotificationService } from '../services/notificationService';
import { ConfigurationService } from '../services/configurationService';
import { ExternalApiService } from './externalApiService';
import { safePostMessage } from '../webview/panelUtils';
import { GeminiApi } from './gemini';
import { OllamaApi } from './ollama';
import { checkTokenLimit, logTokenUsage, estimateTokens } from '../utils/tokenUtils';
import { AiModelType, PromptType } from './types';
import { ActionPlannerService, ActionPlan } from './actionPlannerService';
import { TerminalMonitorService } from './terminalMonitorService';
import { ActionExecutionEngine } from './actionExecutionEngine';
import { ProjectProfileService, ProjectProfile } from './projectProfileService';
import { IntentDetectionService, IntentDetectionResult } from './intentDetectionService';

export class LlmService {
    private storageService: StorageService;
    private geminiApi: GeminiApi;
    private ollamaApi: OllamaApi;
    private codebaseContextService: CodebaseContextService;
    private llmKeywordSelectionService: LlmKeywordSelectionService;
    private llmResponseProcessor: LlmResponseProcessor;
    private notificationService: NotificationService;
    private configurationService: ConfigurationService;
    private externalApiService: ExternalApiService;
    private currentCallController: AbortController | null = null;
    private currentModelType: AiModelType = AiModelType.GEMINI; // 기본값
    private currentPanel: vscode.WebviewPanel | null = null;

    // 액션 플래너 관련 서비스들
    private actionPlannerService: ActionPlannerService;
    private terminalMonitorService: TerminalMonitorService;
    private actionExecutionEngine: ActionExecutionEngine;

    // 처리 단계 전송 함수
    private sendProcessingStep(step: string) {
        if (this.currentPanel) {
            safePostMessage(this.currentPanel.webview, { command: 'setProcessingStep', step });
        }
    }

    // 처리 상태 업데이트 함수
    private sendProcessingStatus(step: string, status: string) {
        if (this.currentPanel) {
            safePostMessage(this.currentPanel.webview, { command: 'updateProcessingStatus', step, status });
        }
    }
    private activePlans: Map<string, ActionPlan> = new Map();
    private projectProfileService?: ProjectProfileService;
    private projectProfile?: ProjectProfile;
    private intentDetectionService?: IntentDetectionService;
    private chatWebview?: vscode.Webview;
    private askWebview?: vscode.Webview;
    private lastErrorHandledAt: number = 0;
    private suppressCancelNoticeOnce: boolean = false;
    private userOS: string = 'unknown';

    constructor(
        storageService: StorageService,
        geminiApi: GeminiApi,
        ollamaApi: OllamaApi,
        codebaseContextService: CodebaseContextService,
        llmResponseProcessor: LlmResponseProcessor,
        notificationService: NotificationService,
        configurationService: ConfigurationService,
        private readonly extensionContext?: vscode.ExtensionContext
    ) {
        this.storageService = storageService;
        this.geminiApi = geminiApi;
        this.ollamaApi = ollamaApi;
        this.codebaseContextService = codebaseContextService;
        this.llmResponseProcessor = llmResponseProcessor;
        this.notificationService = notificationService;
        this.configurationService = configurationService;
        this.externalApiService = new ExternalApiService(configurationService);

        // LLM 키워드 선택 서비스 초기화
        this.llmKeywordSelectionService = new LlmKeywordSelectionService(this);
        this.codebaseContextService.setLlmKeywordSelectionService(this.llmKeywordSelectionService);

        // 액션 플래너 서비스들 초기화
        this.actionPlannerService = new ActionPlannerService(notificationService, configurationService);
        this.terminalMonitorService = new TerminalMonitorService(notificationService);
        this.actionExecutionEngine = new ActionExecutionEngine(notificationService, this.terminalMonitorService);

        if (extensionContext) {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (workspaceFolder) {
                this.projectProfileService = new ProjectProfileService(workspaceFolder.uri.fsPath, extensionContext.globalState);
            }
        }

        this.intentDetectionService = new IntentDetectionService(ollamaApi);

        // Start terminal monitoring and subscribe for errors
        try {
            this.terminalMonitorService.startMonitoring();
            this.terminalMonitorService.onError(async (evt) => {
                try {
                    const now = Date.now();
                    if (now - this.lastErrorHandledAt < 8000) {
                        console.log('[LlmService] Skipping terminal error due to cooldown');
                        return;
                    }
                    this.lastErrorHandledAt = now;

                    const target = this.chatWebview || this.askWebview;
                    if (!target) {
                        console.log('[LlmService] No webview available to post terminal error');
                        return;
                    }

                    // 에러 처리를 최우선으로 하기 위해, 진행 중인 호출이 있다면 조용히 취소
                    try {
                        if (this.currentCallController) {
                            this.suppressCancelNoticeOnce = true;
                            this.cancelCurrentCall();
                        }
                    } catch { /* noop */ }

                    const pretty = this.formatErrorForChat(evt);
                    safePostMessage(target, { command: 'receiveMessage', sender: 'AIDEV-IDE', text: pretty });

                    const shortPrompt = `터미널 에러 해결: ${evt.message}`;
                    console.log('[LlmService] Auto error fix prompt:', shortPrompt);
                    await this.handleUserMessageAndRespond(shortPrompt, target, PromptType.CODE_GENERATION);
                } catch (autoErr) {
                    console.warn('[LlmService] Auto error handling failed:', autoErr);
                }
            });
        } catch (e) {
            console.warn('[LlmService] Terminal monitor setup failed:', e);
        }
    }

    public setChatWebview(webview: vscode.Webview | undefined): void {
        this.chatWebview = webview;
        // 터미널 모니터링 서비스에도 웹뷰 설정
        if (webview) {
            this.terminalMonitorService.setWebview(webview);
        }
    }
    public setAskWebview(webview: vscode.Webview | undefined): void {
        this.askWebview = webview;
        // 터미널 모니터링 서비스에도 웹뷰 설정
        if (webview) {
            this.terminalMonitorService.setWebview(webview);
        }
    }
    public getTerminalMonitorService(): TerminalMonitorService { return this.terminalMonitorService; }

    /**
     * 사용자의 OS 정보를 설정합니다.
     */
    public setUserOS(os: string): void {
        this.userOS = os;
        // console.log(`[LlmService] 사용자 OS 설정: ${os}`);
    }

    /**
     * 현재 사용자의 OS 정보를 반환합니다.
     */
    public getUserOS(): string {
        return this.userOS;
    }

    /**
     * OS별 시스템 프롬프트를 생성합니다.
     */
    private generateOSSpecificSystemPrompt(): string {
        const basePrompt = `당신은 전문적인 소프트웨어 개발자입니다. 사용자의 요청에 따라 코드를 생성하고 수정하는 작업을 수행합니다.

주요 지침:
1. 코드 생성 시 항상 완전하고 실행 가능한 코드를 제공하세요.
2. 코드 수정 시 기존 코드의 구조와 스타일을 유지하세요.
3. 파일 경로를 포함한 구체적인 수정 사항을 명시하세요.
4. 한글로 설명을 제공하세요.
5. 새 파일을 생성할 때는 반드시 "새 파일: [파일경로]" 형식으로 시작하고, 그 다음에 코드 블록을 포함하세요.
6. 기존 파일을 수정할 때는 반드시 "수정 파일: [파일경로]" 형식으로 시작하고, 그 다음에 수정된 코드 블록을 포함하세요.
7. 파일을 삭제할 때는 "삭제 파일: [파일경로]" 형식으로 명시하세요.
8. 마크다운 파일(.md)을 생성할 때는 코드 블록 없이 마크다운 내용을 직접 포함하세요.
9. 터미널 명령어가 필요한 경우 OS에 맞는 코드 블록으로 제공하세요. 이 명령어들은 자동으로 실행됩니다.
10. Vite 프로젝트의 package.json 스크립트는 "vite" 대신 "npx vite"를 사용하세요.
11. Spring Boot 프로젝트를 생성할 때는 반드시 Spring Boot 3.4.0 이상을 사용하세요.

현재 사용자 환경: ${this.userOS.toUpperCase()}`;

        const osSpecificGuidelines = this.getOSSpecificGuidelines();

        return `${basePrompt}

${osSpecificGuidelines}`;
    }

    /**
     * OS별 특화 가이드라인을 반환합니다.
     */
    private getOSSpecificGuidelines(): string {
        switch (this.userOS.toLowerCase()) {
            case 'windows':
                return `**Windows 환경 특화 가이드라인:**
- PowerShell 또는 Command Prompt 명령어를 사용하세요.
- 파일 경로는 백슬래시(\\) 또는 슬래시(/) 모두 사용 가능합니다.
- 환경변수는 %VARIABLE_NAME% 형식을 사용하세요.
- 터미널 명령어는 \`\`\`cmd 또는 \`\`\`powershell 코드 블록을 사용하세요.
- 포트 해제: netstat -ano | findstr :포트번호, taskkill /PID 프로세스ID /F
- 프로세스 종료: taskkill /IM 프로세스명 /F
- 서비스 관리: net start/stop 서비스명
- 권한 문제 시 관리자 권한으로 실행하도록 안내하세요.`;

            case 'macos':
                return `**macOS 환경 특화 가이드라인:**
- Bash/Zsh 쉘 명령어를 사용하세요.
- 파일 경로는 슬래시(/)를 사용하세요.
- 환경변수는 $VARIABLE_NAME 형식을 사용하세요.
- 터미널 명령어는 \`\`\`bash 코드 블록을 사용하세요.
- 포트 해제: lsof -ti:포트번호 | xargs kill -9
- 프로세스 종료: pkill -f "프로세스명"
- Homebrew 패키지 관리자 사용을 권장하세요.
- 권한 문제 시 sudo 명령어 사용을 안내하세요.`;

            case 'linux':
                return `**Linux 환경 특화 가이드라인:**
- Bash 쉘 명령어를 사용하세요.
- 파일 경로는 슬래시(/)를 사용하세요.
- 환경변수는 $VARIABLE_NAME 형식을 사용하세요.
- 터미널 명령어는 \`\`\`bash 코드 블록을 사용하세요.
- 포트 해제: lsof -ti:포트번호 | xargs kill -9 또는 fuser -k 포트번호/tcp
- 프로세스 종료: pkill -f "프로세스명" 또는 killall 프로세스명
- 패키지 관리자: apt (Ubuntu/Debian), yum/dnf (RHEL/CentOS), pacman (Arch)
- 권한 문제 시 sudo 명령어 사용을 안내하세요.`;

            default:
                return `**일반 환경 가이드라인:**
- 플랫폼에 독립적인 명령어를 사용하세요.
- 파일 경로는 슬래시(/)를 사용하세요.
- 환경변수는 $VARIABLE_NAME 형식을 사용하세요.
- 터미널 명령어는 \`\`\`bash 코드 블록을 사용하세요.
- 포트 해제 및 프로세스 종료 명령어는 OS별로 다를 수 있으니 주의하세요.`;
        }
    }

    public setCurrentModel(modelType: AiModelType): void {
        this.currentModelType = modelType;
        // console.log(`[LlmService] Current model set to: ${modelType}`);
    }

    private formatErrorForChat(evt: { time: number; source: string; message: string; recentLogs: any[] }): string {
        const header = `터미널 에러 감지 (${new Date(evt.time).toLocaleString()}):\n소스: ${evt.source}\n메시지: ${evt.message}`;
        const tail = evt.recentLogs && evt.recentLogs.length > 0
            ? '\n\n최근 로그 (최대 10줄):\n' + evt.recentLogs.slice(-10).map((l: any) => `- ${l.message || l.rawOutput || ''}`).join('\n')
            : '';
        return header + tail;
    }

    /**
     * 현재 설정된 모델의 실제 이름을 가져옵니다.
     * @returns 현재 모델명
     */
    private async getCurrentModelName(): Promise<string> {
        try {
            if (this.currentModelType === AiModelType.GEMINI) {
                return 'Gemini 2.5 Flash';
            }
            // Ollama 계열은 저장된 실제 모델명을 사용
            return await this.ollamaApi.getCurrentModelName();
        } catch (error) {
            console.warn(`[LlmService] 모델명 가져오기 실패: ${error}`);
            return this.currentModelType === AiModelType.GEMINI ? 'Gemini 2.5 Flash' : 'Unknown Model';
        }
    }

    public getCurrentModel(): AiModelType {
        return this.currentModelType;
    }

    public cancelCurrentCall(): void {
        console.log(`[ AIDEV-IDE ] Attempting to cancel current ${this.currentModelType} call.`);
        if (this.currentCallController) {
            this.currentCallController.abort();
            this.currentCallController = null;
        }
    }

    public async handleUserMessageAndRespond(
        userQuery: string,
        webviewToRespond: vscode.Webview,
        promptType: PromptType,
        imageData?: string,
        imageMimeType?: string,
        selectedFiles?: string[]
    ): Promise<void> {
        this.currentCallController = new AbortController();
        const abortSignal = this.currentCallController.signal;

        try {
            // webviewToRespond를 currentPanel로 설정 (sendProcessingStep에서 사용)
            // webviewToRespond는 Webview이므로, 이를 WebviewPanel로 래핑
            this.currentPanel = { webview: webviewToRespond } as vscode.WebviewPanel;
            safePostMessage(webviewToRespond, { command: 'showLoading' });
            const currentModelNameForLog = await this.getCurrentModelName();
            console.log(`[LlmService] Using model: type=${this.currentModelType}, name=${currentModelNameForLog}`);

            if (this.projectProfileService) {
                this.projectProfile = await this.projectProfileService.loadProfile();
            }

            let intentResult: IntentDetectionResult | undefined;
            if (this.intentDetectionService) {
                try {
                    this.sendProcessingStep('intent');
                    this.sendProcessingStatus('intent', `Analyzing user query: "${userQuery.substring(0, 50)}${userQuery.length > 50 ? '...' : ''}"`);

                    // 프로젝트 타입 감지 및 출력 (파일 기반 + LLM 기반)
                    let projectTypeInfo = '';
                    let detectedProjectType = 'unknown';

                    if (this.codebaseContextService) {
                        try {
                            const projectRoot = await this.configurationService.getProjectRoot();
                            if (projectRoot) {
                                // 1. LLM 기반 프로젝트 타입 감지 (질의어 분석)
                                const llmBasedProjectType = await this.detectProjectTypeFromQuery(userQuery);
                                console.log(`[LlmService] LLM 기반 프로젝트 타입: ${llmBasedProjectType}`);

                                // 2. 파일 기반 프로젝트 타입 감지 (LLM 결과를 전달)
                                const finalProjectType = await this.codebaseContextService.detectProjectType([projectRoot], llmBasedProjectType);
                                console.log(`[LlmService] 최종 프로젝트 타입: ${finalProjectType}`);

                                detectedProjectType = finalProjectType;

                                projectTypeInfo = ` | Project Type: ${detectedProjectType}`;
                                this.sendProcessingStatus('intent', `Detected project type: ${detectedProjectType} (LLM: ${llmBasedProjectType}) | OS: ${this.userOS}`);
                            }
                        } catch (error) {
                            console.warn('[LlmService] Failed to detect project type during intent analysis:', error);
                        }
                    }

                    intentResult = await this.intentDetectionService.detectIntent(userQuery);
                    console.log('[LlmService] Detected intent:', intentResult);
                    if (intentResult) {
                        const confidence = Math.round(intentResult.confidence * 100);
                        const reasoning = intentResult.reasoning || 'No reasoning provided';
                        this.sendProcessingStatus('intent', `Intent: ${intentResult.category}/${intentResult.subtype} (${confidence}%)${projectTypeInfo} | OS: ${this.userOS} - ${reasoning.substring(0, 100)}${reasoning.length > 100 ? '...' : ''}`);
                        // Debug Console 로그를 활용한 추가 정보
                        console.log(`[LlmService] Intent analysis result: ${intentResult.category}/${intentResult.subtype} with ${confidence}% confidence${projectTypeInfo} | OS: ${this.userOS}`);
                    } else {
                        this.sendProcessingStatus('intent', `Intent analysis completed - No specific intent detected${projectTypeInfo}`);
                        console.log('[LlmService] No specific intent detected from user query');
                    }
                } catch (error) {
                    console.warn('[LlmService] Intent detection failed:', error);
                    this.sendProcessingStatus('intent', 'Intent analysis failed, using default behavior');
                }
            }

            // --- 대화 기록 관리 ---
            const historyKey = promptType === PromptType.CODE_GENERATION ? 'codeTabHistory' : 'askTabHistory';
            let history: { userQuery: string, aiResponse?: string, timestamp: number }[] = [];
            if (this.extensionContext) {
                history = this.extensionContext.globalState.get(historyKey, []);
            }

            // --- 최근 5개 대화 context 생성 ---
            let historyContext = '';
            if (history.length > 0) {
                const recentConversations = history.slice(-5); // 최근 5개 대화
                if (recentConversations.length > 0) {
                    historyContext = '--- 최근 대화 내역 ---\n' +
                        recentConversations.map((conv, i) => {
                            let conversationText = `${i + 1}. 사용자: ${conv.userQuery}`;
                            if (conv.aiResponse) {
                                conversationText += `\n   AI: ${conv.aiResponse}`;
                            }
                            return conversationText;
                        }).join('\n\n') + '\n\n';
                }
            }

            // 실시간 정보 요청 처리
            const realTimeInfo = await this.processRealTimeInfoRequest(userQuery);

            // 터미널 관련 의도인 경우 터미널 로그를 context에 추가
            let terminalLogsContext = '';
            if (intentResult && intentResult.category === 'terminal' && intentResult.subtype === 'terminal_error_fix') {
                console.log('[LlmService] 터미널 오류 수정 의도 감지, 터미널 로그 수집 중...');
                const terminalLogs = this.terminalMonitorService.getTerminalLogsAsText(30); // 최근 30개 로그
                if (terminalLogs.trim()) {
                    terminalLogsContext = `--- 최근 터미널 로그 ---\n${terminalLogs}\n\n`;
                    console.log(`[LlmService] 터미널 로그 ${terminalLogs.split('\n').length}개를 context에 추가`);
                } else {
                    console.log('[LlmService] 터미널 로그가 없음');
                }
            }

            // 코드베이스 컨텍스트 수집
            let fileContentsContext = '';
            let includedFilesForContext: { name: string, fullPath: string }[] = [];

            // 의도 분석 결과 확인 - 코드 관련 질문일 때만 파일 컨텍스트 수집
            const isCodeRelated = intentResult && this.isCodeRelatedIntent(intentResult);

            if (isCodeRelated) {
                if (promptType === PromptType.CODE_GENERATION) {
                    // CODE 탭: 코드 관련 질문인 경우에만 파일 컨텍스트 수집
                    this.sendProcessingStep('keywords');
                    this.sendProcessingStatus('keywords', `Extracting keywords from query: "${userQuery.substring(0, 30)}${userQuery.length > 30 ? '...' : ''}"`);
                    const relevantContextResult = await this.codebaseContextService.getRelevantFilesContext(userQuery, abortSignal, history, intentResult);
                    fileContentsContext = relevantContextResult.fileContentsContext;
                    includedFilesForContext = relevantContextResult.includedFilesForContext;

                    if (relevantContextResult.selectedKeywords) {
                        const keywordsStr = relevantContextResult.selectedKeywords.keywords.join(', ');
                        const confidence = (relevantContextResult.selectedKeywords.confidence * 100).toFixed(1);
                        const fileNames = includedFilesForContext.slice(0, 3).map(f => f.name).join(', ');
                        const moreFiles = includedFilesForContext.length > 3 ? ` (+${includedFilesForContext.length - 3} more)` : '';

                        this.sendProcessingStatus('keywords', `LLM 선택: ${keywordsStr} (${confidence}%) → ${includedFilesForContext.length} files: ${fileNames}${moreFiles}`);
                        console.log(`[LlmService] LLM selected keywords: ${keywordsStr} (confidence: ${confidence}%, reasoning: ${relevantContextResult.selectedKeywords.reasoning})`);
                        console.log(`[LlmService] Found ${includedFilesForContext.length} relevant files: ${includedFilesForContext.map(f => f.name).join(', ')}`);
                    } else if (relevantContextResult.extractedKeywords && relevantContextResult.extractedKeywords.length > 0) {
                        const keywordsStr = relevantContextResult.extractedKeywords.slice(0, 5).join(', ');
                        const moreKeywords = relevantContextResult.extractedKeywords.length > 5 ? ` (+${relevantContextResult.extractedKeywords.length - 5} more)` : '';
                        this.sendProcessingStatus('keywords', `Keywords: ${keywordsStr}${moreKeywords} → Found ${includedFilesForContext.length} files (${fileContentsContext.length.toLocaleString()} chars)`);
                        console.log(`[LlmService] Extracted ${relevantContextResult.extractedKeywords.length} keywords: ${relevantContextResult.extractedKeywords.join(', ')}`);
                        console.log(`[LlmService] Found ${includedFilesForContext.length} relevant files with ${fileContentsContext.length.toLocaleString()} characters of context`);
                    } else {
                        this.sendProcessingStatus('keywords', `No specific keywords found → Found ${includedFilesForContext.length} files (${fileContentsContext.length.toLocaleString()} chars)`);
                        console.log(`[LlmService] No keywords extracted, but found ${includedFilesForContext.length} files with ${fileContentsContext.length.toLocaleString()} characters of context`);
                    }
                } else if (promptType === PromptType.GENERAL_ASK) {
                    // ASK 탭: 코드 관련 질문인 경우에만 파일 컨텍스트 수집
                    this.sendProcessingStep('keywords');
                    this.sendProcessingStatus('keywords', 'Extracting keywords from query...');
                    const relevantContextResult = await this.codebaseContextService.getRelevantFilesContext(userQuery, abortSignal, history, intentResult);
                    fileContentsContext = relevantContextResult.fileContentsContext;
                    includedFilesForContext = relevantContextResult.includedFilesForContext;

                    if (relevantContextResult.extractedKeywords && relevantContextResult.extractedKeywords.length > 0) {
                        const keywordsStr = relevantContextResult.extractedKeywords.slice(0, 5).join(', ');
                        const moreKeywords = relevantContextResult.extractedKeywords.length > 5 ? ` (+${relevantContextResult.extractedKeywords.length - 5} more)` : '';
                        this.sendProcessingStatus('keywords', `Keywords: ${keywordsStr}${moreKeywords} → Found ${includedFilesForContext.length} files`);
                    } else {
                        this.sendProcessingStatus('keywords', `No specific keywords found → Found ${includedFilesForContext.length} files`);
                    }
                }
            } else {
                // 코드 관련 질문이 아닌 경우 파일 컨텍스트 수집하지 않음
                console.log(`[LlmService] 코드 관련 질문이 아니므로 파일 컨텍스트 제외. 의도: ${intentResult?.category}/${intentResult?.subtype}`);
                this.sendProcessingStatus('keywords', 'Non-code related question - skipping file context collection');
            }

            // 선택된 파일들의 내용을 읽어서 컨텍스트에 추가
            let selectedFilesContext = "";
            if (selectedFiles && selectedFiles.length > 0) {
                this.sendProcessingStep('analyzing');
                this.sendProcessingStatus('analyzing', `Reading ${selectedFiles.length} selected files...`);
                for (let i = 0; i < selectedFiles.length; i++) {
                    const filePath = selectedFiles[i];
                    try {
                        const fileUri = vscode.Uri.file(filePath);
                        const contentBytes = await vscode.workspace.fs.readFile(fileUri);
                        const content = Buffer.from(contentBytes).toString('utf8');
                        const fileName = filePath.split(/[/\\]/).pop() || 'Unknown';

                        // 선택된 파일을 includedFilesForContext 배열에 추가
                        includedFilesForContext.push({
                            name: fileName,
                            fullPath: filePath
                        });

                        selectedFilesContext += `파일명: ${fileName}\n경로: ${filePath}\n코드:\n\`\`\`\n${content}\n\`\`\`\n\n`;

                        // 진행 상황 업데이트
                        this.sendProcessingStatus('analyzing', `Reading file ${i + 1}/${selectedFiles.length}: ${fileName} (${content.length.toLocaleString()} chars)`);
                        // Debug Console 로그를 활용한 추가 정보
                        console.log(`[LlmService] Reading selected file ${i + 1}/${selectedFiles.length}: ${fileName} (${content.length.toLocaleString()} characters)`);
                    } catch (error) {
                        console.error(`Error reading selected file ${filePath}:`, error);
                        selectedFilesContext += `파일명: ${filePath.split(/[/\\]/).pop() || 'Unknown'}\n경로: ${filePath}\n오류: 파일을 읽을 수 없습니다.\n\n`;
                    }
                }
            } else if (includedFilesForContext.length > 0) {
                // 자동으로 찾은 파일들 표시
                this.sendProcessingStep('analyzing');
                const fileNames = includedFilesForContext.slice(0, 5).map(f => f.name).join(', ');
                const moreFiles = includedFilesForContext.length > 5 ? ` (+${includedFilesForContext.length - 5} more)` : '';
                this.sendProcessingStatus('analyzing', `Analyzing ${includedFilesForContext.length} files: ${fileNames}${moreFiles}`);
                // Debug Console 로그를 활용한 추가 정보
                console.log(`[LlmService] Analyzing ${includedFilesForContext.length} automatically found files: ${includedFilesForContext.map(f => f.name).join(', ')}`);
            }

            // 선택된 파일 컨텍스트와 터미널 로그를 기존 컨텍스트에 추가
            let fullFileContentsContext = fileContentsContext;

            if (selectedFilesContext) {
                fullFileContentsContext += `\n--- 사용자가 선택한 추가 파일들 ---\n${selectedFilesContext}`;
            }

            if (terminalLogsContext) {
                fullFileContentsContext += `\n${terminalLogsContext}`;
            }



            // 시스템 프롬프트 생성
            const profileContext = this.projectProfile ? this.buildProfileContext(this.projectProfile) : '';
            const intentContext = intentResult ? this.buildIntentContext(intentResult) : '';

            // 프로젝트 타입 정보 추가
            let projectTypeContext = '';
            if (this.codebaseContextService) {
                try {
                    const projectRoot = await this.configurationService.getProjectRoot();
                    if (projectRoot) {
                        const projectType = await this.codebaseContextService.detectProjectType([projectRoot]);
                        projectTypeContext = `\n프로젝트 타입: ${projectType}`;
                    }
                } catch (error) {
                    console.warn('[LlmService] Failed to detect project type:', error);
                }
            }

            const systemPrompt = this.generateSystemPrompt(promptType, fullFileContentsContext, realTimeInfo, profileContext + projectTypeContext, intentContext);

            // 사용자 메시지 파트 구성
            const userParts: any[] = [];

            // 대화 기록이 있으면 먼저 추가
            if (historyContext) {
                userParts.push({ text: historyContext });
            }

            // 현재 질문 추가
            userParts.push({ text: userQuery });

            // 이미지가 있는 경우 추가
            if (imageData && imageMimeType) {
                // Gemini와 Ollama 모두 이미지 데이터 전달 (Ollama는 멀티모달 모델에서 지원)
                userParts.push({
                    inlineData: {
                        data: imageData,
                        mimeType: imageMimeType
                    }
                });
            }



            // 토큰 제한 확인
            const tokenCheck = checkTokenLimit(systemPrompt, userParts, this.currentModelType, currentModelNameForLog);
            logTokenUsage(systemPrompt, userParts, this.currentModelType, currentModelNameForLog);

            if (tokenCheck.isExceeded) {
                const errorMessage = tokenCheck.message;
                console.error(`[LlmService] ${errorMessage}`);
                this.notificationService.showErrorMessage(`AIDEV-IDE: ${errorMessage}`);
                safePostMessage(webviewToRespond, {
                    command: 'receiveMessage',
                    sender: 'AIDEV-IDE',
                    text: errorMessage
                });
                return;
            }

            // ===== 전송 시작 배너 및 타임스탬프 로그 =====
            const sendStartedAt = Date.now();
            console.log('\n********************************************** 전송시작 ************************************************');
            console.log(`[LlmService] Send Time: ${new Date(sendStartedAt).toISOString()}`);
            console.log(`[LlmService] Model: type=${this.currentModelType}, name=${currentModelNameForLog}`);
            console.log('[LlmService] Full System Prompt:\n', systemPrompt);
            console.log('[LlmService] Full User Parts:\n', userParts.map(p => p.text || '[Image Data]').join('\n'));
            // end of send banner

            let llmResponse: string;

            this.sendProcessingStep('assembling');
            const totalContextLength = systemPrompt.length + userParts.reduce((sum, part) => sum + (part.text?.length || 0), 0);
            const estimatedTokens = estimateTokens(systemPrompt + userParts.map(part => part.text || '').join(''));
            this.sendProcessingStatus('assembling', `Generating with ${currentModelNameForLog} (${totalContextLength.toLocaleString()} chars, ~${estimatedTokens.toLocaleString()} tokens)...`);
            // Debug Console 로그를 활용한 추가 정보
            console.log(`[LlmService] Assembling response with ${currentModelNameForLog}: ${totalContextLength.toLocaleString()} characters (~${estimatedTokens.toLocaleString()} tokens)`);
            console.log(`[LlmService] System prompt length: ${systemPrompt.length.toLocaleString()} chars, User parts: ${userParts.length} parts`);
            if (this.currentModelType === AiModelType.GEMINI) {
                const requestOptions = { signal: abortSignal };
                llmResponse = await this.geminiApi.sendMessageWithSystemPrompt(
                    systemPrompt,
                    userParts,
                    requestOptions
                );
            } else if (
                this.currentModelType === AiModelType.OLLAMA_Gemma ||
                this.currentModelType === AiModelType.OLLAMA_DeepSeek ||
                this.currentModelType === AiModelType.OLLAMA_CodeLlama ||
                this.currentModelType === AiModelType.OLLAMA_GPT_OSS
            ) {
                // Ollama 호출 전에 최신 설정을 스토리지에서 로드하여 원격 설정이 즉시 반영되도록 함
                try { await this.ollamaApi.loadSettingsFromStorage(); } catch { }
                // Ollama API에 직접 호출 (selectedFiles는 이미 시스템 프롬프트에 포함됨)
                const requestOptions = { signal: abortSignal };
                llmResponse = await this.ollamaApi.sendMessageWithSystemPrompt(
                    systemPrompt,
                    userParts,
                    requestOptions
                );
            } else {
                throw new Error(`Unsupported model type: ${this.currentModelType}`);
            }
            // 필요 시 명령어만 재구성 단계 실행 (간단한 정규식으로 감지)
            try {
                if (llmResponse && (/```\s*(bash|sh)\s*[\s\S]*?```/i.test(llmResponse) || /```\s*(powershell|ps1|pwsh)\s*[\s\S]*?```/i.test(llmResponse))) {
                    this.sendProcessingStep('executing');
                    this.sendProcessingStatus('executing', 'Generating OS-specific runnable commands...');
                    const sys = `당신은 전문적인 셸 명령어 변환기입니다.\n\n현재 사용자 OS: ${this.userOS}\n\n출력 규칙(아주 엄격):\n1) 오직 하나의 코드블록만 출력하세요. 설명/주석/말머리/말미 금지.\n2) OS별로 정확한 셸을 사용하세요:\n   - Windows: \`\`\`powershell ...\`\`\` (cmd 아님, bash 아님)\n   - macOS/Linux: \`\`\`bash ...\`\`\` (powershell 아님)\n3) 서로 다른 OS의 명령을 혼합 금지. 현재 OS에 부적합한 명령은 동등한 대안으로 변환하세요.\n   - 패키지 관리자 예: Windows(choco/winget), macOS(brew), Linux(apt/yum 등 프로젝트 맥락에 맞는 것 하나만)\n   - 경로 구분자/환경변수 표기: Windows(\\, $Env:VAR), macOS/Linux(/, $VAR)\n4) 실행 순서를 고려하여 의존 명령은 올바른 순서로 배치하세요.\n5) 파일은 이미 생성/수정되었다고 가정하고, 필요한 설치/빌드/실행 명령만 남기세요.\n6) 프롬프트나 친절한 문장, 출력 캡쳐 명령(예: cat/type) 금지.\n7) 반드시 해당 OS용 코드블록 언어 태그만 사용하세요.`;
                    const parts = [{ text: llmResponse }];
                    let refined: string | null = null;
                    if (this.currentModelType === AiModelType.GEMINI) {
                        refined = await this.geminiApi.sendMessageWithSystemPrompt(sys, parts, { signal: abortSignal });
                    } else {
                        try { await this.ollamaApi.loadSettingsFromStorage(); } catch { }
                        refined = await this.ollamaApi.sendMessageWithSystemPrompt(sys, parts, { signal: abortSignal });
                    }
                    if (refined && refined.trim()) {
                        safePostMessage(webviewToRespond, { command: 'receiveMessage', sender: 'AIDEV-IDE', text: refined });
                    }
                }
            } catch (e) {
                console.warn('[LlmService] command refinement step failed:', e);
            }

            const outputTokens = estimateTokens(llmResponse);
            this.sendProcessingStatus('assembling', `Generated ${llmResponse.length.toLocaleString()} chars (~${outputTokens.toLocaleString()} tokens) response`);
            // Debug Console 로그를 활용한 추가 정보
            console.log(`[LlmService] Response generated: ${llmResponse.length.toLocaleString()} characters (~${outputTokens.toLocaleString()} tokens)`);
            console.log(`[LlmService] Response preview: ${llmResponse.substring(0, 100)}${llmResponse.length > 100 ? '...' : ''}`);

            // ===== 전송 완료 배너 및 타임스탬프/소요시간 로그 =====
            const sendFinishedAt = Date.now();
            const durationMs = sendFinishedAt - sendStartedAt;
            console.log('\n********************************************** 전송 완료 ************************************************');
            console.log(`[LlmService] Receive Time: ${new Date(sendFinishedAt).toISOString()} (Duration: ${durationMs} ms)`);
            console.log(`[LlmService] Response length: ${llmResponse?.length ?? 0}`);
            const preview = (llmResponse || '').slice(0, 500);
            console.log('[LlmService] Response preview:\n', preview, llmResponse && llmResponse.length > 500 ? '\n... (truncated)' : '');
            // end of receive banner

            // 컨텍스트 파일 목록에 선택된 파일들도 포함
            const allContextFiles = [...includedFilesForContext];
            if (selectedFiles && selectedFiles.length > 0) {
                for (const filePath of selectedFiles) {
                    const fileName = filePath.split(/[/\\]/).pop() || 'Unknown';
                    allContextFiles.push({ name: fileName, fullPath: filePath });
                }
            }

            // 중복 파일 제거 (파일명 기준)
            const deduplicatedFiles = this.removeDuplicateFiles(allContextFiles);
            console.log(`[LlmService] Original files: ${allContextFiles.length}, After deduplication: ${deduplicatedFiles.length}`);

            // GENERAL_ASK 타입일 때는 파일 업데이트를 위한 컨텍스트 파일을 넘기지 않음
            this.sendProcessingStep('parsing');
            this.sendProcessingStatus('parsing', 'Processing response format...');
            await this.llmResponseProcessor.processLlmResponseAndApplyUpdates(
                llmResponse,
                promptType === PromptType.CODE_GENERATION ? deduplicatedFiles : [],
                webviewToRespond,
                promptType,
                (status: string) => this.sendProcessingStatus('parsing', status),
                this // LLM 서비스 전달
            );
            this.sendProcessingStatus('parsing', 'Response processed successfully');
            this.sendProcessingStep('printing');
            this.sendProcessingStatus('printing', 'Preparing final output...');

            // --- AI 응답을 대화 기록에 저장 ---
            if (this.extensionContext && userQuery) {
                const summarizedResponse = this.summarizeAiResponse(llmResponse);
                history.push({
                    userQuery: userQuery,
                    aiResponse: summarizedResponse,
                    timestamp: Date.now()
                });

                // 최대 5개 대화만 유지
                if (history.length > 5) {
                    history = history.slice(-5);
                }

                await this.extensionContext.globalState.update(historyKey, history);
            }

        } catch (error: any) {
            if (error.name === 'AbortError') {
                console.warn(`[AIDEV-IDE] ${this.currentModelType.toUpperCase()} API call was explicitly aborted.`);
                if (!this.suppressCancelNoticeOnce) {
                    safePostMessage(webviewToRespond, { command: 'receiveMessage', sender: 'AIDEV-IDE', text: 'AI 호출이 취소되었습니다.' });
                }
                this.suppressCancelNoticeOnce = false;
            } else {
                console.error(`Error in handleUserMessageAndRespond (${this.currentModelType}):`, error);
                this.notificationService.showErrorMessage(`Error: Failed to process request. ${error.message}`);
                safePostMessage(webviewToRespond, { command: 'receiveMessage', sender: 'AIDEV-IDE', text: `Failed to process request. ${error.message}` });
            }
        } finally {
            this.currentCallController = null;
            safePostMessage(webviewToRespond, { command: 'hideLoading' });
        }
    }

    /**
     * AI 응답을 요약하여 대화 기록에 저장합니다.
     * 코드 블록과 긴 설명을 간단히 요약하여 토큰 사용량을 줄입니다.
     */
    private summarizeAiResponse(response: string): string {
        // 응답이 너무 짧으면 그대로 반환
        if (response.length <= 200) {
            return response;
        }

        // 코드 블록 추출
        const codeBlocks = response.match(/```[\s\S]*?```/g) || [];
        const hasCodeBlocks = codeBlocks.length > 0;

        // 파일 작업 지시어 추출
        const fileOperations = response.match(/(새 파일|수정 파일|삭제 파일):\s*[^\n]+/g) || [];
        const hasFileOperations = fileOperations.length > 0;

        // 요약 생성
        let summary = '';

        if (hasFileOperations) {
            summary += `파일 작업: ${fileOperations.join(', ')}. `;
        }

        if (hasCodeBlocks) {
            summary += `코드 블록 ${codeBlocks.length}개 포함. `;
        }

        // 코드 블록과 파일 작업 지시어를 제거한 텍스트에서 첫 2-3문장 추출
        let textContent = response;
        textContent = textContent.replace(/```[\s\S]*?```/g, ''); // 코드 블록 제거
        textContent = textContent.replace(/(새 파일|수정 파일|삭제 파일):\s*[^\n]+/g, ''); // 파일 작업 지시어 제거
        textContent = textContent.replace(/\n+/g, ' ').trim(); // 줄바꿈 정리

        // 첫 2-3문장 추출 (마침표 기준)
        const sentences = textContent.split(/[.!?]+/).filter(s => s.trim().length > 10);
        const firstSentences = sentences.slice(0, 2).join('. ').trim();

        if (firstSentences) {
            summary += firstSentences + '.';
        }

        // 요약이 너무 길면 더 줄임
        if (summary.length > 300) {
            summary = summary.substring(0, 297) + '...';
        }

        return summary || 'AI가 응답을 제공했습니다.';
    }

    private buildProfileContext(profile: ProjectProfile): string {
        const lines: string[] = [];
        lines.push(`언어: ${profile.language}`);
        if (profile.frameworks.length > 0) {
            const formatted = profile.frameworks
                .map(f => `${f.framework} (신뢰도 ${(f.confidence * 100).toFixed(0)}%)`)
                .join(', ');
            lines.push(`프레임워크: ${formatted}`);
        }
        if (profile.packageManager) {
            lines.push(`패키지 매니저: ${profile.packageManager}`);
        }
        if (profile.entryPoints.length > 0) {
            lines.push(`실행 엔트리포인트: ${profile.entryPoints.slice(0, 5).join(', ')}`);
        }
        if (Object.keys(profile.scripts || {}).length > 0) {
            const highlightedScripts = ['start', 'dev', 'serve', 'build', 'test'];
            const selected = highlightedScripts
                .filter(name => profile.scripts[name])
                .map(name => `${name}: ${profile.scripts[name]}`);
            if (selected.length > 0) {
                lines.push('주요 npm 스크립트:');
                lines.push(...selected.map(script => `- ${script}`));
            }
        }
        return lines.join('\n');
    }

    private buildIntentContext(intent: IntentDetectionResult): string {
        const lines: string[] = [];
        lines.push(`카테고리: ${intent.category}`);
        lines.push(`세부 유형: ${intent.subtype}`);
        lines.push(`신뢰도: ${(intent.confidence * 100).toFixed(0)}%`);
        if (intent.keywords && intent.keywords.length > 0) {
            lines.push(`매칭 키워드: ${intent.keywords.join(', ')}`);
        }
        if (intent.reasoning) {
            lines.push(`근거: ${intent.reasoning}`);
        }
        return lines.join('\n');
    }

    /**
     * 실시간 정보 요청을 처리합니다
     */
    private async processRealTimeInfoRequest(userQuery: string): Promise<string> {
        try {
            // ExternalApiService를 통해 실시간 정보 요청 처리
            // 기본적으로 서울 날씨 정보만 포함
            return await this.externalApiService.getRealTimeSummary('서울');
        } catch (error) {
            console.warn('Failed to process real-time info request:', error);
            return '';
        }
    }

    /**
     * 시스템 프롬프트를 생성합니다
     */
    private generateSystemPrompt(promptType: PromptType, codebaseContext: string, realTimeInfo: string, profileContext: string, intentContext: string): string {
        let systemPrompt = '';

        // DeepSeek 모델에 대한 특별한 언어 지시사항 추가
        const isDeepSeek = this.currentModelType !== AiModelType.GEMINI && (this.ollamaApi.getModel?.() || '').includes('deepseek');
        const languageInstruction = isDeepSeek ?
            '\n\n️중요: 반드시 한국어로만 답변하세요. 중국어, 영어, 일본어 등 다른 언어는 사용하지 마세요. 모든 설명과 응답은 한국어로 작성해주세요.' : '';

        if (promptType === PromptType.CODE_GENERATION) {
            systemPrompt = `${this.generateOSSpecificSystemPrompt()}

코드베이스 컨텍스트:
${codebaseContext}

프로젝트 프로필:
${profileContext}

사용자 의도:
${intentContext}

실시간 정보:
${realTimeInfo}

사용자의 요청에 따라 적절한 코드를 생성하거나 수정해주세요.${languageInstruction}`;
        } else {
            systemPrompt = `당신은 전문적인 소프트웨어 개발자이자 기술 전문가입니다. 사용자의 질문에 대해 정확하고 유용한 답변을 제공합니다.

주요 지침:
1. 기술적 질문에 대해 명확하고 이해하기 쉬운 답변을 제공하세요.
2. 코드 예제가 필요한 경우 완전하고 실행 가능한 코드를 제공하세요.
3. 한글로 답변하되, 필요한 경우 영어 용어나 코드는 그대로 사용하세요.
4. 실시간 정보가 있는 경우 이를 활용하여 답변하세요.
5. 파일 생성, 수정, 삭제 또는 터미널 명령어 실행은 하지 마세요. 이는 단순 질의 응답 모드입니다.
6. 첨부된 파일이 있는 경우 해당 파일의 내용을 분석하여 답변하세요.

코드베이스 컨텍스트:
${codebaseContext}

프로젝트 프로필:
${profileContext}

사용자 의도:
${intentContext}

실시간 정보:
${realTimeInfo}

사용자의 질문에 대해 전문적이고 유용한 답변을 제공해주세요.${languageInstruction}`;
        }



        return systemPrompt;
    }

    /**
     * 사용자 질의어에서 프로젝트 타입을 LLM으로 감지합니다.
     */
    private async detectProjectTypeFromQuery(userQuery: string): Promise<string> {
        try {
            const projectTypePrompt = `다음 사용자 요청을 분석하여 프로젝트 타입을 감지하세요.

지원하는 프로젝트 타입:
- react: React 프로젝트
- react-vite: React + Vite 프로젝트
- vue: Vue.js 프로젝트
- angular: Angular 프로젝트
- next: Next.js 프로젝트
- nuxt: Nuxt.js 프로젝트
- svelte: Svelte 프로젝트
- nodejs: 일반 Node.js 프로젝트
- django: Django (Python) 프로젝트
- flask: Flask (Python) 프로젝트
- fastapi: FastAPI (Python) 프로젝트
- python: 일반 Python 프로젝트
- java: Java/Spring 프로젝트
- dotnet: .NET 프로젝트
- go: Go 프로젝트
- rust: Rust 프로젝트
- php: PHP 프로젝트
- ruby: Ruby 프로젝트
- ios: iOS 프로젝트
- android: Android 프로젝트
- flutter: Flutter 프로젝트
- react-native: React Native 프로젝트
- unknown: 감지할 수 없음

출력 형식 (JSON):
{
  "projectType": "react-vite",
  "confidence": 0.9,
  "reasoning": "사용자가 'react javascript 템플릿으로 vite 프로젝트 생성'이라고 요청했으므로 React + Vite 프로젝트입니다."
}

사용자 요청: "${userQuery}"`;

            let response: string;

            if (this.currentModelType === AiModelType.GEMINI) {
                response = await this.geminiApi.sendMessage(projectTypePrompt, undefined, { signal: this.currentCallController?.signal });
            } else if (this.currentModelType === AiModelType.OLLAMA_Gemma || this.currentModelType === AiModelType.OLLAMA_DeepSeek || this.currentModelType === AiModelType.OLLAMA_CodeLlama || this.currentModelType === AiModelType.OLLAMA_GPT_OSS) {
                response = await this.ollamaApi.sendMessage(projectTypePrompt, { signal: this.currentCallController?.signal });
            } else {
                return 'unknown';
            }

            console.log(`[LlmService] LLM 프로젝트 타입 감지 응답: ${response}`);

            // JSON 응답 파싱
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const result = JSON.parse(jsonMatch[0]);
                if (result.projectType && result.confidence > 0.5) {
                    console.log(`[LlmService] LLM 프로젝트 타입 감지 성공: ${result.projectType} (신뢰도: ${result.confidence})`);
                    return result.projectType;
                }
            }

            // JSON 파싱 실패 시 키워드 기반 감지
            const lowerQuery = userQuery.toLowerCase();
            if (lowerQuery.includes('react') && lowerQuery.includes('vite')) return 'react-vite';
            if (lowerQuery.includes('react')) return 'react';
            if (lowerQuery.includes('vue')) return 'vue';
            if (lowerQuery.includes('angular')) return 'angular';
            if (lowerQuery.includes('next')) return 'next';
            if (lowerQuery.includes('nuxt')) return 'nuxt';
            if (lowerQuery.includes('svelte')) return 'svelte';
            if (lowerQuery.includes('django')) return 'django';
            if (lowerQuery.includes('flask')) return 'flask';
            if (lowerQuery.includes('fastapi')) return 'fastapi';
            if (lowerQuery.includes('python')) return 'python';
            if (lowerQuery.includes('spring') || lowerQuery.includes('java')) return 'java';
            if (lowerQuery.includes('.net') || lowerQuery.includes('c#')) return 'dotnet';
            if (lowerQuery.includes('go ') || lowerQuery.includes('golang')) return 'go';
            if (lowerQuery.includes('rust')) return 'rust';
            if (lowerQuery.includes('php')) return 'php';
            if (lowerQuery.includes('ruby')) return 'ruby';
            if (lowerQuery.includes('ios')) return 'ios';
            if (lowerQuery.includes('android')) return 'android';
            if (lowerQuery.includes('flutter')) return 'flutter';
            if (lowerQuery.includes('react-native')) return 'react-native';
            if (lowerQuery.includes('node') || lowerQuery.includes('javascript') || lowerQuery.includes('typescript')) return 'nodejs';

            return 'unknown';
        } catch (error) {
            console.warn('[LlmService] LLM 프로젝트 타입 감지 실패:', error);
            return 'unknown';
        }
    }

    /**
     * 명령어 오류 수정을 위한 LLM 메시지 전송
     */
    public async sendMessageForErrorCorrection(prompt: string): Promise<string> {
        try {
            let response: string;

            if (this.currentModelType === AiModelType.GEMINI) {
                response = await this.geminiApi.sendMessage(prompt, undefined, { signal: this.currentCallController?.signal });
            } else if (this.currentModelType === AiModelType.OLLAMA_Gemma || this.currentModelType === AiModelType.OLLAMA_DeepSeek || this.currentModelType === AiModelType.OLLAMA_CodeLlama || this.currentModelType === AiModelType.OLLAMA_GPT_OSS) {
                response = await this.ollamaApi.sendMessage(prompt, { signal: this.currentCallController?.signal });
            } else {
                throw new Error('지원하지 않는 모델 타입');
            }

            console.log(`[LlmService] 오류 수정 응답: ${response}`);
            return response;
        } catch (error) {
            console.error('[LlmService] 오류 수정 메시지 전송 실패:', error);
            throw error;
        }
    }

    /**
     * 의도 분석 결과가 코드 관련 질문인지 확인합니다.
     * @param intentResult 의도 분석 결과
     * @returns 코드 관련 의도인지 여부
     */
    private isCodeRelatedIntent(intentResult: { category: string; subtype: string; confidence: number }): boolean {
        // 코드, 실행, 분석 카테고리는 파일 컨텍스트가 필요
        const codeRelatedCategories = ['code', 'execution', 'analysis'];
        return codeRelatedCategories.includes(intentResult.category);
    }

    /**
     * 중복된 파일을 제거합니다. 파일명이 동일한 경우 가장 최근에 추가된 파일을 유지합니다.
     * @param files 파일 목록
     * @returns 중복이 제거된 파일 목록
     */
    private removeDuplicateFiles(files: { name: string, fullPath: string }[]): { name: string, fullPath: string }[] {
        const fileMap = new Map<string, { name: string, fullPath: string }>();

        // 파일명을 키로 하여 Map에 저장 (동일한 파일명이 있으면 덮어쓰기)
        for (const file of files) {
            fileMap.set(file.name, file);
        }

        const deduplicatedFiles = Array.from(fileMap.values());

        if (files.length !== deduplicatedFiles.length) {
            const removedFiles = files.length - deduplicatedFiles.length;
            console.log(`[LlmService] Removed ${removedFiles} duplicate files. Remaining files: ${deduplicatedFiles.map(f => f.name).join(', ')}`);
        }

        return deduplicatedFiles;
    }

    /**
     * 대화기록을 삭제합니다.
     * @param promptType 프롬프트 타입 (CODE_GENERATION 또는 GENERAL_ASK)
     */
    public async clearHistory(promptType: PromptType): Promise<void> {
        if (!this.extensionContext) {
            console.warn('[LlmService] Extension context not available for clearing history');
            return;
        }

        try {
            const historyKey = promptType === PromptType.CODE_GENERATION ? 'codeTabHistory' : 'askTabHistory';
            await this.extensionContext.globalState.update(historyKey, []);
            console.log(`[LlmService] Cleared history for ${promptType === PromptType.CODE_GENERATION ? 'Code' : 'Ask'} tab`);
        } catch (error) {
            console.error('[LlmService] Failed to clear history:', error);
            throw error;
        }
    }
}
