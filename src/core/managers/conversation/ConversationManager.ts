import * as vscode from 'vscode';
import { PromptBuilder, PromptType, PromptBuilderOptions } from '../context/PromptBuilder';
import { ContextManager } from '../context/ContextManager';
import { TaskManager } from '../task/TaskManager';
import { LLMManager } from '../model/LLMManager';
import { WebviewBridge } from '../../webview/WebviewBridge';
import { ToolParser } from '../../tools/ToolParser';
import { ToolExecutor } from '../../tools/ToolExecutor';
import { StreamingCodeApplier } from '../../tools/StreamingCodeApplier';
import { ActionManager } from '../action/ActionManager';
import { ExecutionManager } from '../execution/ExecutionManager';
import { TerminalManager } from '../terminal/TerminalManager';
import { Tool } from '../../tools/types';
import { IntentDetector } from '../action/IntentDetector';
import { ProjectManager } from '../project/ProjectManager';
import { ProjectDetector } from '../project/ProjectDetector';
import { ProjectType } from '../project/types';
import { InvestigationManager } from '../investigation/InvestigationManager';
import { SettingsManager } from '../state/SettingsManager';
import { StateManager } from '../state/StateManager';
import { AiModelType, OllamaApi, GeminiApi, BanyaApi } from '../../../services';
import { AgentStateManager, AgentPhase } from './AgentStateManager';
import { getSimpleSummaryPrompt } from '../context/prompts/task';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { TestRunner } from './handlers/TestRunner';
import { ResponseProcessor } from './handlers/ResponseProcessor';
import { ToolExecutionCoordinator } from './handlers/ToolExecutionCoordinator';
// OutputValidator는 handlers/OutputValidator.ts에서 독립적으로 사용 가능
import { AgentConfig } from '../../config/AgentConfig';
import { InlineDiffManager } from '../diff/InlineDiffManager';
import { StringUtils } from '../../utils/StringUtils';
import { getExecutionPhasePrompt } from '../context/prompts/phase';
import {
    getExecutionFirstRulePrompt,
    getTestRetryExceededMessage,
    getInvestigationNudgePrompt,
    getExecutionNudgePrompt,
    getInvestigationTextOnlyWarningPrompt,
    getExecutionOutputContractViolationPrompt,
    getFsmViolationInvestigationInExecutionPrompt,
    getCodeModifyRequiresFileToolPrompt,
    getPhaseToolRestrictionPrompt,
    getCreateFileContentMissingPrompt,
    getValidationCommandInferencePrompt,
    getSimpleTestFailurePrompt,
    getExecutionPhaseContextPrompt,
    getErrorRetryPrompt,
    getInvestigationToolResultFollowupPrompt,
    getExecutionNoToolCallWarningPrompt,
    getTestFailureFixPrompt,
    ModifiedFileContext
} from '../context/prompts/rules';
import { getGeneralAnalysisPrompt } from '../context/prompts/analysis/generalAnalysis';
import { ConversationCompactor } from './ConversationCompactor';
import { MODEL_TOKEN_LIMITS } from '../../../utils/tokenUtils';
import { estimateTokens } from '../../../utils';

export interface ConversationOptions {
    userQuery: string;
    webviewToRespond: vscode.Webview;
    promptType: PromptType;
    abortSignal?: AbortSignal;
    imageData?: string;
    imageMimeType?: string;
    selectedFiles?: string[];
    terminalContext?: string;
    diagnosticsContext?: string;
    extensionContext?: vscode.ExtensionContext;
    geminiApi?: any;
    ollamaApi?: any;
    currentModelType?: AiModelType;
    userOS?: string;
    notificationService?: any;
    gitRepositoryService?: any;
}

// AgentPhase는 AgentStateManager에서 import

/**
 * 대화 및 에이전트 루프를 관리하는 매니저
 */
export class ConversationManager {
    private static instance: ConversationManager;
    private promptBuilder: PromptBuilder;
    private contextManager: ContextManager;
    private llmManager: LLMManager;
    private responseProcessor: ResponseProcessor;
    private currentAbortController: AbortController | null = null;
    private stateManager: StateManager | null = null;

    private constructor(userOS: string, geminiApi: GeminiApi, ollamaApi: OllamaApi, banyaApi: BanyaApi) {
        this.promptBuilder = new PromptBuilder(userOS, AiModelType.OLLAMA);
        this.contextManager = ContextManager.getInstance();
        this.llmManager = LLMManager.getInstance(geminiApi, ollamaApi, banyaApi);
        this.responseProcessor = new ResponseProcessor(this.llmManager);
    }

    public static getInstance(userOS: string = process.platform, geminiApi?: GeminiApi, ollamaApi?: OllamaApi, banyaApi?: BanyaApi): ConversationManager {
        if (!ConversationManager.instance) {
            if (!geminiApi || !ollamaApi || !banyaApi) {
                // 이 처리는 extension.ts에서 초기화된 후 호출됨을 보장해야 함
                throw new Error('ConversationManager requires GeminiApi, OllamaApi, and BanyaApi for initial creation');
            }
            ConversationManager.instance = new ConversationManager(userOS, geminiApi, ollamaApi, banyaApi);
        }
        return ConversationManager.instance;
    }

    // extension.ts 호환성을 위한 Setter 메서드들
    public setLLMService(service: any): void {
        if (service && typeof service.getCurrentModel === 'function') {
            const model = service.getCurrentModel();
            this.llmManager.setCurrentModel(model);
            this.promptBuilder.setModelType(model);
        }
    }
    public setSessionManager(manager: any): void { }
    public setPromptBuilder(builder: any): void { this.promptBuilder = builder; }
    public setIntentDetector(detector: any): void { }
    public setStateManager(stateManager: StateManager): void {
        this.stateManager = stateManager;
        console.log("[ConversationManager] StateManager configured for model routing");
    }
    public setExternalApiService(service: any): void { }
    public configurePlanManager(client: any, model: any): void { }
    public setContextHistoryManager(manager: any): void { }

    /**
     * 현재 진행 중인 LLM 호출을 취소합니다
     */
    public cancelCurrentCall(): void {
        if (this.currentAbortController) {
            console.log('[ConversationManager] Cancelling current LLM call...');
            this.currentAbortController.abort();
            this.currentAbortController = null;
        }
    }

    /**
     * 사용자의 메시지를 처리하고 응답을 생성하는 메인 엔트리 포인트
     */
    public async handleUserMessageAndRespond(options: ConversationOptions): Promise<void> {
        const { webviewToRespond, extensionContext } = options;

        const userQuery = options.userQuery;

        // 새 AbortController 생성 (이전 요청이 있으면 취소)
        if (this.currentAbortController) {
            this.currentAbortController.abort();
        }
        this.currentAbortController = new AbortController();
        const abortSignal = options.abortSignal || this.currentAbortController.signal;

        // options에 abortSignal 추가 (내부 메서드들이 사용)
        const optionsWithAbort: ConversationOptions = {
            ...options,
            abortSignal
        };

        try {
            // 1. 초기화 및 준비
            this.prepareUI(webviewToRespond);

            // 세션 히스토리 정리 체크 (LLM 요약 없이 오래된 항목 제거)
            if (extensionContext) {
                const { SessionManager } = await import('../state/SessionManager');
                const sessionManager = SessionManager.getInstance(extensionContext);

                // SESSION_TRIM_THRESHOLD 초과 시 SESSION_TRIM_TARGET만 유지 (구조화된 메타데이터라 용량 적음)
                if (sessionManager.needsSessionTrim(AgentConfig.SESSION_TRIM_THRESHOLD)) {
                    sessionManager.trimSessionHistory(AgentConfig.SESSION_TRIM_TARGET);
                    console.log('[ConversationManager] Session history trimmed (no LLM cost)');
                }
            }

            // 모델 설정 업데이트
            if (options.currentModelType) {
                this.llmManager.setCurrentModel(options.currentModelType);
                this.promptBuilder.setModelType(options.currentModelType);

                console.log(`[ConversationManager] LLM model updated to: ${options.currentModelType}`);
            }

            // 2. 의도 파악 및 프로젝트 분석
            // 현재 선택된 모델 타입을 사용하여 의도 파악 수행
            const intent = await this.detectIntent(userQuery);

            // 3. 컨텍스트 수집
            const context = await this.gatherContext(optionsWithAbort, intent);

            // 4. 시스템 프롬프트 생성
            const promptOptions: PromptBuilderOptions = {
                userOS: optionsWithAbort.userOS || process.platform,
                modelType: optionsWithAbort.currentModelType || AiModelType.OLLAMA,
                promptType: optionsWithAbort.promptType,
                ...context
            };
            const systemPrompt = this.promptBuilder.generateSystemPrompt(promptOptions);

            // 5. 작업 타입에 따른 실행 분기
            if (optionsWithAbort.promptType === PromptType.CODE_GENERATION) {
                const userParts = [{ text: userQuery }];
                await this.executeAgentLoop(systemPrompt, userParts, optionsWithAbort, intent, context);
            } else {
                // ASK 모드: 이전 대화 컨텍스트 포함
                const userParts = await this.buildUserPartsWithHistory(userQuery, optionsWithAbort);
                await this.handleGeneralAsk(systemPrompt, userParts, optionsWithAbort);
            }

        } catch (error: any) {
            this.handleError(error, webviewToRespond);
        } finally {
            WebviewBridge.hideLoading(webviewToRespond);
        }
    }

    /**
     * ASK 모드에서 이전 대화 컨텍스트를 포함한 userParts 생성
     * 구조화된 메타데이터에서 컨텍스트 추출
     */
    private async buildUserPartsWithHistory(currentQuery: string, options: ConversationOptions): Promise<any[]> {
        const userParts: any[] = [];

        if (options.extensionContext) {
            try {
                const { SessionManager } = await import('../state/SessionManager');
                const sessionManager = SessionManager.getInstance(options.extensionContext);
                const currentSession = sessionManager.getCurrentSession();

                if (currentSession && currentSession.conversationHistory.length > 0) {
                    // 최근 대화 히스토리 (구조화된 메타데이터)
                    const history = currentSession.conversationHistory.slice(-AgentConfig.MAX_HISTORY_ENTRIES);

                    // 이전 대화를 간결한 컨텍스트로 추가
                    for (const entry of history) {
                        // 구조화된 형식에서 컨텍스트 추출
                        const actions = entry.actions && entry.actions.length > 0
                            ? ` [Actions: ${entry.actions.map((a: any) => `${a.type}${a.file ? ':' + a.file : ''}`).join(', ')}]`
                            : '';
                        // assistantResponse가 있으면 사용, 없으면 파일 변경 정보 또는 '작업 완료'
                        const response = entry.assistantResponse
                            ? entry.assistantResponse.slice(0, AgentConfig.MAX_HISTORY_ACTION_PREVIEW_LENGTH)
                            : (entry.filesCreated || entry.filesModified ? '파일 변경 완료' : '작업 완료');
                        userParts.push({
                            text: `[User]: ${entry.userRequest}${actions}\n[Assistant]: ${response}`
                        });
                    }
                }
            } catch (error) {
                console.warn('[ConversationManager] Failed to load conversation history:', error);
            }
        }

        // 현재 질문 추가
        userParts.push({ text: `[User]: ${currentQuery}` });

        return userParts;
    }

    /**
     * UI 초기 상태 설정
     */
    private prepareUI(webview: vscode.Webview): void {
        WebviewBridge.sendProcessingStep(webview, 'intent');
        WebviewBridge.sendProcessingStatus(webview, 'intent', '사용자 요청 분석 중...');

        // 새로운 요청이 시작되면 기존 작업 큐 초기화 및 UI 숨김
        const taskManager = TaskManager.getInstance();
        taskManager.clearPlanQueue();
        WebviewBridge.clearTaskQueue(webview);
    }

    /**
     * 사용자 의도 및 작업 타입 감지
     * Intent 모델이 설정된 경우 해당 모델 사용, 미설정 시 메인 모델 사용
     */
    private async detectIntent(query: string): Promise<any> {
        const detector = new IntentDetector(this.llmManager);

        // StateManager가 있으면 Intent 모델 라우팅 설정
        if (this.stateManager) {
            detector.setStateManager(this.stateManager);
        }

        const intent = await detector.detectIntent(query);

        console.log(`[ConversationManager] Intent detected: ${intent.category}/${intent.subtype} (confidence: ${intent.confidence})`);
        return intent;
    }

    /**
     * 필요한 컨텍스트 수집
     */
    private async gatherContext(options: ConversationOptions, intent: any): Promise<any> {
        WebviewBridge.sendProcessingStep(options.webviewToRespond, 'assembling');
        WebviewBridge.sendProcessingStatus(options.webviewToRespond, 'assembling', '컨텍스트 수집 중...');

        const contextData = await this.contextManager.collectContext({});

        // selectedFiles에서 파일 내용 읽기
        let selectedFilesContent = '';
        console.log('[ConversationManager] Selected files:', options.selectedFiles);
        if (options.selectedFiles && options.selectedFiles.length > 0) {
            console.log(`[ConversationManager] Reading ${options.selectedFiles.length} selected files...`);
            const fileContents: string[] = [];
            for (const filePath of options.selectedFiles) {
                try {
                    const uri = vscode.Uri.file(filePath);
                    const document = await vscode.workspace.openTextDocument(uri);
                    const content = document.getText();
                    const fileName = filePath.split(/[/\\]/).pop() || filePath;
                    fileContents.push(`=== ${fileName} (${filePath}) ===\n${content}\n`);
                } catch (error) {
                    console.warn(`[ConversationManager] Failed to read file ${filePath}:`, error);
                }
            }
            selectedFilesContent = fileContents.join('\n\n');
            console.log(`[ConversationManager] Selected files content length: ${selectedFilesContent.length} chars`);
        }

        // 터미널 컨텍스트 (사용자가 @terminal로 선택한 터미널 히스토리)
        const terminalContextContent = options.terminalContext || '';
        if (terminalContextContent) {
            console.log('[ConversationManager] Terminal context included in system prompt');
        }

        // Diagnostics 컨텍스트 (사용자가 @diagnostics로 선택한 에러/경고)
        const diagnosticsContextContent = options.diagnosticsContext || '';
        if (diagnosticsContextContent) {
            console.log('[ConversationManager] Diagnostics context included in system prompt');
        }

        // v9.2.1: 프레임워크 세부 스택 규칙 생성
        let frameworkRulesPrompt = '';
        try {
            frameworkRulesPrompt = await this.contextManager.getFrameworkRulesPrompt();
            if (frameworkRulesPrompt) {
                console.log('[ConversationManager] Framework rules prompt generated');
            }
        } catch (error) {
            console.warn('[ConversationManager] Failed to generate framework rules:', error);
        }

        // ContextData의 속성들을 PromptBuilderOptions 형식에 맞게 변환
        return {
            codebaseContext: contextData.file?.content,
            realTimeInfo: contextData.terminal?.lastOutput,
            profileContext: contextData.project?.structure,
            intentContext: JSON.stringify(intent),
            gitContext: '',
            languageInstruction: '반드시 한국어로 답변하세요.',
            selectedFilesContent: selectedFilesContent,
            terminalContextContent: terminalContextContent,
            diagnosticsContextContent: diagnosticsContextContent,
            frameworkRulesPrompt: frameworkRulesPrompt // v9.2.1: 동적 프레임워크 규칙
        };
    }

    private async executeAgentLoop(systemPrompt: string, userParts: any[], options: ConversationOptions, intent: any, gatheredContext?: any): Promise<void> {
        // 🔥 참고: executionIntent는 더 이상 INVESTIGATION→EXECUTION 전환에 사용되지 않음
        // 실행 도구 자체가 실행 의도의 증거이므로 조건 없이 전환됨
        const { webviewToRespond, abortSignal, userQuery } = options;
        const maxTurns = AgentConfig.MAX_TURNS;
        let turnCount = 0;
        let accumulatedUserParts = [...userParts];
        let testFixAttempts = 0; // 테스트 실패 시 자동 수정 시도 횟수
        const maxTestFixAttempts = await SettingsManager.getInstance().getTestRetryCount(); // 설정에서 최대 시도 횟수 가져오기
        const isAutoTestRetryEnabled = await SettingsManager.getInstance().isAutoTestRetryEnabled(); // 자동 테스트 재시도 설정 확인
        let executionNoToolRetryCount = 0; // EXECUTION phase에서 도구 호출 없이 응답 시 재시도 횟수
        const maxExecutionNoToolRetries = 2; // 최대 재시도 횟수
        let extractedFunctionName: string | null = null; // 사용자 쿼리에서 추출한 함수명 저장

        // 📝 구조화된 메타데이터 수집 (세션 히스토리용)
        const collectedActions: Array<{ type: string; file?: string; command?: string; result?: string }> = [];
        const collectedUIMessages: Array<{ sender: 'USER' | 'CODEPILOT' | 'System'; text: string; type?: 'action' | 'code' | 'summary' | 'message' }> = [];
        let lastAssistantResponse = '';

        // 🔥 문제 1 해결: npm install 등 명령어 중복 실행 방지 (전역 추적)
        const recentlyExecutedCommands = new Set<string>(); // 최근 실행된 명령어 추적
        const lastFailurePattern = { pattern: '', count: 0 }; // 실패 패턴 추적 (문제 3 해결용)

        // 🔥 자연어 응답 재시도 카운터 리셋
        (this as any).naturalLanguageRetry = 0;

        // 🔥 Solution 1: 이전 턴에서 도구가 성공적으로 실행됐는지 추적
        // 도구 성공 후 자연어 응답이 오면 "완료"로 처리 (retry 방지)
        let lastTurnHadSuccessfulToolExecution = false;

        const taskManager = TaskManager.getInstance();
        const actionManager = ActionManager.getInstance();
        const executionManager = ExecutionManager.getInstance();
        const terminalManager = TerminalManager.getInstance();
        const investigationManager = InvestigationManager.getInstance();
        const toolExecutor = new ToolExecutor();

        // ✅ Phase 기준 CODEPILOT 텍스트 송신 제어 함수
        // 🔥 v8.9.8: EXECUTION 단계에서도 스트리밍 (CODE 블록 → 마크다운 변환)
        const shouldSendCodePilotText = (phase: AgentPhase): boolean => {
            // EXECUTION, REVIEW, DONE phase에서 사용자에게 텍스트를 보여줌
            return phase === AgentPhase.EXECUTION || phase === AgentPhase.REVIEW || phase === AgentPhase.DONE;
        };
        // 과거 실행 의도가 있었는지 영속적으로 추적 (plan이 덮어써져도 유지)
        let hasExecutionIntentEver = taskManager.listPlanItems().some(item => item.kind === 'execution');
        // intent가 code/execution이면 초기 플래그 설정
        if (intent && (intent.category === 'execution' || intent.category === 'code')) {
            hasExecutionIntentEver = true;
        }
        // 자동 조사 완료 여부 (계획 반복 방지용)
        let autoInvestigationCompleted = false;

        // 1. 초기 페이즈 결정: Plan이 없으면 항상 INVESTIGATION으로 시작
        const currentPlanItems = taskManager.listPlanItems();
        const hasActivePlan = currentPlanItems.some(i => i.status === 'pending' || i.status === 'in_progress');

        // 의도가 없거나 단순 인사인 경우만 바로 응답하고 종료
        // 분석(analysis) 요청은 INVESTIGATION 단계로 들어가서 실제 코드베이스를 확인해야 함
        const hasNoIntent = !intent ||
            intent.confidence < AgentConfig.MIN_INTENT_CONFIDENCE ||
            (!intent.subtype && !intent.category) ||
            (intent.subtype === null && !intent.category) ||
            (intent.reasoning && intent.reasoning.includes('인사') && intent.confidence < AgentConfig.MIN_GREETING_CONFIDENCE);

        if (hasNoIntent && !hasActivePlan) {
            console.log('[ConversationManager] No clear intent detected or simple greeting. Responding directly without investigation.');

            // 스트리밍 설정 확인
            const isStreamingEnabledForGreeting = options.extensionContext
                ? await SettingsManager.getInstance(options.extensionContext).isStreamingEnabled()
                : false;

            // 인사/간단한 질문 응답용 시스템 프롬프트 (JSON function call 금지)
            const greetingSystemPrompt = `당신은 친절한 AI 코딩 어시스턴트입니다.
사용자의 인사나 간단한 질문에 자연스럽게 한국어로 답변해주세요.

**중요 규칙:**
- JSON 형식으로 응답하지 마세요
- 도구 호출을 하지 마세요
- 자연스러운 한국어 문장으로만 답변하세요
- 짧고 친근하게 응답하세요`;

            let greetingResponse: string;

            if (isStreamingEnabledForGreeting) {
                // 스트리밍 모드: 인사 응답 실시간 전송
                console.log('[ConversationManager] Streaming mode enabled for greeting response');
                WebviewBridge.startStreamingMessage(webviewToRespond, 'assistant');

                const onGreetingChunk = (chunk: string, done: boolean) => {
                    if (chunk) {
                        WebviewBridge.streamMessageChunk(webviewToRespond, chunk);
                    }
                    if (done) {
                        WebviewBridge.endStreamingMessage(webviewToRespond);
                    }
                };

                greetingResponse = await this.llmManager.sendMessageWithSystemPromptStreaming(
                    greetingSystemPrompt,
                    accumulatedUserParts,
                    onGreetingChunk,
                    { signal: abortSignal }
                );

                console.log(`[ConversationManager] Greeting streaming completed.`);
                return; // 스트리밍 완료 후 즉시 종료
            }

            // 비스트리밍 모드: 인사 응답용 시스템 프롬프트 사용
            greetingResponse = await this.llmManager.sendMessageWithSystemPrompt(
                greetingSystemPrompt,
                accumulatedUserParts,
                { signal: abortSignal }
            );

            // 응답 정제: extractResponseText 사용하여 일관된 정제
            let cleanGreetingResponse = this.responseProcessor.extractResponseText(greetingResponse);

            // JSON 래핑이 있는 경우 추가 파싱 (extractResponseText에서 처리되지 않은 경우)
            if (!cleanGreetingResponse || cleanGreetingResponse.trim().length < AgentConfig.MIN_RESPONSE_LENGTH) {
                try {
                    // JSON 형태로 래핑된 경우 파싱 시도
                    const jsonMatch = greetingResponse.match(/^\{[\s\S]*\}$/);
                    if (jsonMatch) {
                        const parsed = JSON.parse(greetingResponse);
                        cleanGreetingResponse = parsed.response || parsed.content || parsed.message || '';
                    }
                } catch (e) {
                    // JSON 파싱 실패 시 원본 사용
                }
            }

            // 응답이 비어있거나 너무 짧은 경우 기본 응답 사용
            if (!cleanGreetingResponse || cleanGreetingResponse.trim().length < AgentConfig.MIN_RESPONSE_LENGTH) {
                console.warn('[ConversationManager] Greeting response is empty or too short, using default response.');
                cleanGreetingResponse = AgentConfig.DEFAULT_GREETING_MESSAGE;
            }

            // 최종 정제: 앞뒤 공백 제거
            cleanGreetingResponse = cleanGreetingResponse.trim();

            console.log(`[ConversationManager] Sending greeting response to webview (length: ${cleanGreetingResponse.length}): ${cleanGreetingResponse.substring(0, 100)}...`);
            console.log(`[ConversationManager] Webview valid: ${!!webviewToRespond}`);

            // CODEPILOT 타입으로 전송 (🔥 스트리밍 효과)
            await WebviewBridge.streamText(webviewToRespond, 'CODEPILOT', cleanGreetingResponse);
            console.log(`[ConversationManager] Greeting message sent to webview.`);
            return; // 즉시 종료
        }

        // ⚠️ 핵심 수정: execution-first task 감지 및 바로 EXECUTION으로 전환
        // 공통 함수 사용으로 모든 곳에서 동일한 기준 적용
        const isExecutionFirstTask = this.isExecutionFirstTask(intent, hasExecutionIntentEver, hasActivePlan);

        // ⚠️ 안전 장치: 기존 프로젝트가 존재하면 execution-first라도 INVESTIGATION으로 시작
        // “기존 프로젝트” 판단: 루트에 실제 파일/디렉터리가 하나라도 있으면 true
        let hasExistingProject = false;
        const currentProjectForInitial = ProjectManager.getInstance().getCurrentProject();
        const workspaceRootForInitial = currentProjectForInitial?.root || '';
        if (workspaceRootForInitial) {
            try {
                const entries = fsSync.readdirSync(workspaceRootForInitial, { withFileTypes: true });
                hasExistingProject = entries.some(e => {
                    const name = e.name;
                    // 숨김/무시 대상
                    if (AgentConfig.IGNORED_DIRECTORIES.includes(name)) return false;
                    return true; // 하나라도 있으면 존재한다고 판단
                });
            } catch (e) {
                console.warn('[ConversationManager] Failed to check existing project contents:', e);
            }
        }

        // FSM 초기화
        // requiresPlan이 false인 경우:
        // - analysis/documentation 카테고리: INVESTIGATION (조사 후 바로 답변, plan 없이)
        // - execution 카테고리: EXECUTION (바로 명령어 실행)
        const isSimpleTask = intent?.requiresPlan === false;
        const isDirectResponseTask = isSimpleTask && (intent?.category === 'analysis' || intent?.category === 'documentation');
        const isDirectExecutionTask = isSimpleTask && intent?.category === 'execution';

        const initialState = hasActivePlan
            ? AgentPhase.EXECUTION
            : (isDirectExecutionTask || (isExecutionFirstTask && !hasExistingProject) ? AgentPhase.EXECUTION : AgentPhase.INVESTIGATION);
        const stateManager = new AgentStateManager(initialState);

        if (isDirectResponseTask) {
            console.log(`[ConversationManager] Direct response task detected (${intent.category}). Starting in INVESTIGATION for immediate response.`);
        } else if (isDirectExecutionTask) {
            console.log(`[ConversationManager] Simple execution task detected (requiresPlan: false). Starting directly in EXECUTION phase.`);
        } else if (isExecutionFirstTask) {
            if (hasExistingProject) {
                console.log(`[ConversationManager] Execution-first task detected (${intent.category}/${intent.subtype}) but existing project found. Starting in INVESTIGATION for safety.`);
            } else {
                console.log(`[ConversationManager] Execution-first task detected (${intent.category}/${intent.subtype}). Starting directly in EXECUTION phase.`);
            }
        }

        // 파일 목록은 시스템이 먼저 제공: 첫 LLM 호출 전에 프로젝트 파일 인벤토리 제공 ([D] [F] 형식)
        if (initialState === AgentPhase.INVESTIGATION && !hasActivePlan) {
            try {
                const projectManager = ProjectManager.getInstance();
                const inventory = await projectManager.buildProjectInventorySection(AgentConfig.MAX_PROJECT_INVENTORY_FILES);
                if (inventory) {
                    accumulatedUserParts.push({
                        text: `${inventory}\n\n**중요**: 위 프로젝트 파일 구조를 참고하여 필요한 파일만 선택적으로 읽으세요. 모든 파일을 읽을 필요는 없습니다.`
                    });
                    console.log(`[ConversationManager] Pre-loaded project file inventory for INVESTIGATION phase`);
                }
            } catch (error) {
                console.warn(`[ConversationManager] Failed to pre-load project inventory:`, error);
            }
        }

        // plan 생성 시 받은 도구 호출을 추적
        let toolCallsFromPlanCreation: any[] = [];
        let hasInvestigationHistory = false; // 조사 이력 추적
        const preloadedFiles = new Set<string>(); // Pre-load된 파일 목록 추적 (중복 읽기 방지)

        // 파일 변경 추적 (요약 검증용)
        const createdFiles: string[] = [];
        const modifiedFiles: string[] = [];

        // 🔥 대화 시작 시 reviewProcessed 플래그 초기화 (이전 대화에서 남은 값 제거)
        (this as any).reviewProcessed = null;

        let investigationTextOnlyCount = 0; // INVESTIGATION에서 텍스트만 출력한 횟수 추적

        while (turnCount < maxTurns) {
            if (abortSignal?.aborted) break;

            // 🔄 컨텍스트 자동 압축 체크 (토큰 임계값 초과 시 트리거)
            try {
                const compactor = ConversationCompactor.getInstance(this.llmManager);
                // StateManager 설정 (compactorModel 사용을 위해)
                if (options.extensionContext) {
                    compactor.setStateManager(StateManager.getInstance(options.extensionContext));
                }
                const currentModelType = options.currentModelType || AiModelType.OLLAMA;
                const modelLimits = MODEL_TOKEN_LIMITS[currentModelType] || MODEL_TOKEN_LIMITS[AiModelType.OLLAMA];
                const maxTokens = modelLimits?.maxInputTokens || 128000;

                if (compactor.needsCompaction(accumulatedUserParts, systemPrompt, maxTokens)) {
                    console.log(`[ConversationManager] Token threshold exceeded. Starting context compaction...`);
                    WebviewBridge.sendProcessingStatus(webviewToRespond, 'context', '컨텍스트 압축 중...');

                    const compactionResult = await compactor.compact(
                        accumulatedUserParts,
                        systemPrompt,
                        maxTokens,
                        abortSignal
                    );

                    if (compactionResult.compacted) {
                        accumulatedUserParts = compactionResult.recentMessages;
                        console.log(`[ConversationManager] Context compacted. Saved ${compactionResult.savedTokens} tokens (${compactionResult.originalTokens} → ${compactionResult.compactedTokens})`);

                        // UI에 압축 알림
                        WebviewBridge.receiveMessage(
                            webviewToRespond,
                            'SYSTEM_INFO',
                            `💡 컨텍스트가 자동 압축되었습니다. (${compactionResult.savedTokens.toLocaleString()} 토큰 절약)`
                        );
                    }
                }

                // 현재 대화 컨텍스트의 토큰만 계산 (세션 누적 제거 - 이중 계산 방지)
                const currentContextTokens = compactor.calculateTotalTokens(accumulatedUserParts, systemPrompt);
                const currentMessageCount = accumulatedUserParts.length;

                console.log(`[ConversationManager] 토큰 사용량: ${currentContextTokens.toLocaleString()} / ${maxTokens.toLocaleString()} (${((currentContextTokens / maxTokens) * 100).toFixed(1)}%)`);

                WebviewBridge.updateContextInfo(webviewToRespond, {
                    messageCount: currentMessageCount,
                    tokenUsage: {
                        current: currentContextTokens,
                        max: maxTokens,
                        percentage: (currentContextTokens / maxTokens) * 100
                    }
                });
            } catch (compactionError) {
                console.warn('[ConversationManager] Context compaction failed:', compactionError);
                // 압축 실패해도 계속 진행
            }

            // [수정] 루프 시작 시점에 현재 계획 상태를 UI에 즉시 동기화
            const allItems = taskManager.listPlanItems();
            if (allItems.length > 0) {
                WebviewBridge.updateTaskQueue(webviewToRespond, allItems);
            }

            // 현재 활성 계획 아이템 확인
            const currentPlanItem = taskManager.getNextPendingItem();

            // FSM에서 현재 상태 가져오기
            const currentPhase = stateManager.getCurrentState();
            const statusPrefix = currentPlanItem ? `[${currentPlanItem.title}] ` : '';
            console.log(`[ConversationManager] Turn ${turnCount + 1}: currentPhase=${currentPhase}, planItem=${currentPlanItem?.title || 'none'}`);

            // REVIEW 또는 DONE 단계는 LLM 호출 없이 시스템이 처리
            // ⚠️ 핵심 수정: REVIEW는 한 번만 처리되도록 플래그 추가
            if (currentPhase === AgentPhase.REVIEW) {
                // REVIEW가 이미 처리되었는지 확인 (중복 호출 방지)
                const reviewProcessedKey = `review_processed_${createdFiles.join(',')}_${modifiedFiles.join(',')}`;
                console.log(`[ConversationManager] REVIEW check - key: "${reviewProcessedKey}", previous: "${(this as any).reviewProcessed}"`);
                if ((this as any).reviewProcessed === reviewProcessedKey) {
                    console.log('[ConversationManager] REVIEW phase already processed. Skipping duplicate review.');
                    stateManager.transitionTo(AgentPhase.DONE);
                    break;
                }
                (this as any).reviewProcessed = reviewProcessedKey;

                console.log('[ConversationManager] REVIEW phase: Generating summary and transitioning to DONE.');
                console.log(`[ConversationManager] REVIEW phase files - created: [${createdFiles.join(', ')}], modified: [${modifiedFiles.join(', ')}]`);
                const currentProject = ProjectManager.getInstance().getCurrentProject();
                const workspaceRoot = currentProject?.root || '';

                // 페이즈별 프롬프트 보정 (REVIEW 단계용)
                let activeSystemPrompt = systemPrompt;

                // 요약 생성 (파일이 생성/수정된 경우)
                // 단, LLM 호출은 1회만 수행 (generateVerifiedSummary 내부에서 파일 검증 후 요약 생성)
                let finalResponse = '';

                if (createdFiles.length > 0 || modifiedFiles.length > 0) {
                    // 실제 파일 목록을 확인하여 검증된 요약 생성 (LLM 호출 1회)
                    const verifiedSummary = await this.responseProcessor.generateVerifiedSummary(
                        '', // 원본 요약 없음 (시스템이 직접 생성)
                        createdFiles,
                        modifiedFiles,
                        workspaceRoot,
                        activeSystemPrompt,
                        accumulatedUserParts,
                        abortSignal
                    );

                    // 요약이 생성되었으면 UI에 출력 (🔥 스트리밍 효과)
                    if (verifiedSummary && verifiedSummary.trim()) {
                        // 명령어를 copy/run 가능한 형식으로 파싱
                        finalResponse = this.parseCommandsInSummary(verifiedSummary);
                        await WebviewBridge.streamText(webviewToRespond, 'CODEPILOT', finalResponse);
                    } else {
                        // 요약 생성 실패 시 기본 메시지 출력
                        finalResponse = `작업이 완료되었습니다.\n\n` +
                            (createdFiles.length > 0 ? `생성된 파일: ${createdFiles.join(', ')}\n` : '') +
                            (modifiedFiles.length > 0 ? `수정된 파일: ${modifiedFiles.join(', ')}\n` : '');
                        await WebviewBridge.streamText(webviewToRespond, 'CODEPILOT', finalResponse);
                    }
                } else {
                    // 파일 변경이 없으면 기본 완료 메시지
                    finalResponse = '작업이 완료되었습니다.';
                    await WebviewBridge.streamText(webviewToRespond, 'CODEPILOT', finalResponse);
                }

                // 📝 구조화된 메타데이터로 세션에 저장 (LLM 요약 비용 없음)
                if (options.extensionContext) {
                    try {
                        const { SessionManager } = await import('../state/SessionManager');
                        const sessionManager = SessionManager.getInstance(options.extensionContext);
                        const currentSession = sessionManager.getCurrentSession();

                        if (currentSession) {
                            // 파일 변경 정보를 actions에 추가
                            createdFiles.forEach(file => {
                                if (!collectedActions.some(a => a.type === 'create' && a.file === file)) {
                                    collectedActions.push({ type: 'create', file, result: 'success' });
                                }
                            });
                            modifiedFiles.forEach(file => {
                                if (!collectedActions.some(a => a.type === 'modify' && a.file === file)) {
                                    collectedActions.push({ type: 'modify', file, result: 'success' });
                                }
                            });

                            // 요약 메시지도 UI 메시지에 추가
                            if (finalResponse) {
                                collectedUIMessages.push({ sender: 'CODEPILOT', text: finalResponse, type: 'summary' });
                            }

                            // 구조화된 대화 엔트리 저장 (CODE 모드)
                            sessionManager.addConversationEntry(currentSession.id, {
                                id: `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                                timestamp: Date.now(),
                                userRequest: userQuery || '',
                                assistantResponse: finalResponse || '작업 완료',
                                actions: collectedActions as any,
                                filesCreated: createdFiles,
                                filesModified: modifiedFiles,
                                uiMessages: collectedUIMessages,  // ✅ UI 메시지 저장
                                result: 'success',
                                model: options.currentModelType
                            });
                        }
                    } catch (e) {
                        console.warn('[ConversationManager] Failed to save CODE mode entry to session:', e);
                    }
                }

                // CODE 모드 사용 토큰을 세션에 설정 (누적이 아닌 현재 값으로 설정 - 재시작 후에도 정확한 게이지 표시)
                if (options.extensionContext) {
                    try {
                        const { SessionManager } = await import('../state/SessionManager');
                        const sessionManager = SessionManager.getInstance(options.extensionContext);
                        const compactor = ConversationCompactor.getInstance(this.llmManager);
                        const currentTokens = compactor.calculateTotalTokens(accumulatedUserParts, systemPrompt);
                        sessionManager.setTotalTokensUsed(currentTokens);
                    } catch (e) {
                        console.warn('[ConversationManager] Failed to set tokens in session:', e);
                    }
                }

                // 세션 히스토리 자동 압축 (LLM 요약 포함)
                if (options.extensionContext) {
                    try {
                        const { SessionManager } = await import('../state/SessionManager');
                        const sessionManager = SessionManager.getInstance(options.extensionContext);
                        const currentModelType = options.currentModelType || AiModelType.OLLAMA;
                        const modelLimits = MODEL_TOKEN_LIMITS[currentModelType] || MODEL_TOKEN_LIMITS[AiModelType.OLLAMA];
                        const maxTokens = modelLimits?.maxInputTokens || 128000;

                        // ConversationCompactor를 SessionManager에 주입 (lazy injection)
                        const compactor = ConversationCompactor.getInstance(this.llmManager);
                        // StateManager 설정 (compactorModel 사용을 위해)
                        compactor.setStateManager(StateManager.getInstance(options.extensionContext));
                        sessionManager.setCompactor(compactor);

                        // 토큰 임계값 확인 후 자동 압축
                        await sessionManager.compactSessionIfNeeded(maxTokens);
                    } catch (e) {
                        console.warn('[ConversationManager] Failed to compact session history:', e);
                    }
                }

                // REVIEW 완료 후 DONE으로 전환
                stateManager.transitionTo(AgentPhase.DONE);
                console.log('[ConversationManager] REVIEW completed, transitioning to DONE.');
                break; // DONE은 최종 상태이므로 루프 종료
            }

            if (currentPhase === AgentPhase.DONE) {
                console.log('[ConversationManager] DONE phase: All work completed.');
                break; // 이미 완료 상태이므로 루프 종료
            }

            const phaseLabel = currentPhase === AgentPhase.INVESTIGATION ? '[조사]' : '[실행]';
            const actionText = currentPhase === AgentPhase.INVESTIGATION ? '조사 및 분석' : '작업 진행';
            WebviewBridge.sendProcessingStep(webviewToRespond, 'thinking');
            WebviewBridge.sendProcessingStatus(webviewToRespond, 'thinking', `${phaseLabel}[생각 ${turnCount + 1}] ${statusPrefix}${actionText} 중...`);

            // 페이즈별 프롬프트 보정 및 도구 제한
            let activeSystemPrompt = systemPrompt;
            let allowedTools: Tool[] | undefined = undefined;

            if (currentPhase === AgentPhase.INVESTIGATION) {
                const investigationPrompt = investigationManager.getInvestigationPrompt(options.userQuery);
                activeSystemPrompt = investigationPrompt + '\n\n' + systemPrompt;
                allowedTools = investigationManager.getInvestigationTools();

                // 조사 단계에서는 PromptBuilder를 다시 사용하여 도구 설명 섹션만 교체
                // 🔥 핵심 수정: gatheredContext의 첨부 컨텍스트(selectedFilesContent 등)를 포함해야 함
                const promptOptions: PromptBuilderOptions = {
                    userOS: options.userOS || process.platform,
                    modelType: options.currentModelType || AiModelType.OLLAMA,
                    promptType: options.promptType,
                    allowedTools, // 도구 제한 전달
                    // 사용자가 첨부한 컨텍스트 포함 (gatheredContext에서 가져옴)
                    selectedFilesContent: gatheredContext?.selectedFilesContent,
                    terminalContextContent: gatheredContext?.terminalContextContent,
                    diagnosticsContextContent: gatheredContext?.diagnosticsContextContent,
                    codebaseContext: gatheredContext?.codebaseContext,
                    frameworkRulesPrompt: gatheredContext?.frameworkRulesPrompt // v9.2.1
                };
                activeSystemPrompt = investigationPrompt + '\n\n' + this.promptBuilder.generateSystemPrompt(promptOptions);

                // 🔥 핵심 수정: analysis/documentation 인텐트에서는 plan JSON 대신 자연어 응답 유도
                if (intent && (intent.category === 'analysis' || intent.category === 'documentation')) {
                    const intentTypeKr = intent.category === 'analysis' ? '분석/질문' : '문서/요약';
                    activeSystemPrompt += `\n\n⚠️ **${intentTypeKr} 요청 - 특별 규칙:**
이 요청은 ${intentTypeKr} 요청입니다. 코드 수정이나 실행이 필요하지 않습니다.

**필수 행동:**
1. 필요한 파일을 읽기 위해 조사 도구(read_file, ripgrep_search 등)를 호출하세요.
2. 충분한 정보를 수집한 후, **직접 한국어로 답변/요약을 작성하세요.**
3. plan JSON을 출력하지 마세요. 바로 자연어 답변을 출력하세요.

**절대 금지:**
- ❌ plan JSON 출력 (${intentTypeKr} 요청에는 plan이 필요하지 않습니다)
- ❌ 실행 도구 호출 (create_file, update_file, run_command 등)
- ❌ 코드 수정 제안 (${intentTypeKr}만 요청받았습니다)

**올바른 흐름:**
조사 도구로 정보 수집 → 자연어로 직접 답변/요약 출력
`;
                }

                // 🔥 문제 해결: execution-first 작업일 때 investigation item 금지
                // 공통 함수 사용으로 일관된 판단
                if (this.isExecutionFirstTask(intent, hasExecutionIntentEver, hasActivePlan)) {
                    activeSystemPrompt += getExecutionFirstRulePrompt();
                }
            } else if (currentPhase === AgentPhase.EXECUTION) {
                // ⚠️ EXECUTION 단계에서는 설명 금지, 도구 호출만 허용
                // 🔥 핵심: LLM을 "DSL 컴파일러"처럼 사용 - Planning/Reasoning 금지, Execution만 허용
                activeSystemPrompt += getExecutionPhasePrompt();
            }

            // 🔥 최적화: 도구 실행이 성공했고 남은 plan item이 없으면 LLM 호출 없이 바로 REVIEW로 전환
            // "완료 확인" 호출 제거 - 불필요한 LLM 호출 방지
            const currentPhaseForExecution = stateManager.getCurrentState();
            if (currentPhaseForExecution === AgentPhase.EXECUTION && lastTurnHadSuccessfulToolExecution) {
                const remainingPlanItems = taskManager.getNextPendingItem();
                const hasFileChanges = createdFiles.length > 0 || modifiedFiles.length > 0;

                if (!remainingPlanItems && hasFileChanges) {
                    console.log(`[ConversationManager] EXECUTION phase: Tool execution succeeded with file changes and no remaining plan items. Skipping LLM call and transitioning directly to REVIEW.`);
                    lastTurnHadSuccessfulToolExecution = false; // 리셋

                    // 🔥 UI 상태 업데이트: 테스트 실행 전
                    WebviewBridge.sendProcessingStep(webviewToRespond, 'executing');
                    WebviewBridge.sendProcessingStatus(webviewToRespond, 'executing', `[실행][단계 ${turnCount + 1}] 자동 테스트 실행 중...`);

                    // 자동 테스트 실행
                    const currentProject = ProjectManager.getInstance().getCurrentProject();
                    const workspaceRoot = currentProject?.root || '';
                    const testResult = await TestRunner.runAutomatedTests(webviewToRespond, workspaceRoot, createdFiles, modifiedFiles);

                    if (testResult.success) {
                        console.log('[ConversationManager] Tests passed. Transitioning to REVIEW phase.');
                        // 🔥 UI 상태 업데이트: 테스트 성공
                        WebviewBridge.sendProcessingStep(webviewToRespond, 'review');
                        WebviewBridge.sendProcessingStatus(webviewToRespond, 'review', `[검토] 테스트 통과 - 결과 검토 중...`);
                        stateManager.transitionTo(AgentPhase.REVIEW);
                        turnCount++;
                        continue; // 다음 루프에서 REVIEW 처리 (LLM 호출 없이)
                    } else {
                        // 테스트 실패 시: 자동 재시도가 켜져 있을 때만 수정 시도
                        if (isAutoTestRetryEnabled && testFixAttempts < maxTestFixAttempts) {
                            testFixAttempts++;
                            console.log(`[ConversationManager] 테스트 실패 (${testFixAttempts}/${maxTestFixAttempts}). LLM에게 수정 요청.`);

                            // 🔥 UI에 테스트 실패 및 수정 중 상태 표시
                            WebviewBridge.sendProcessingStep(webviewToRespond, 'executing');
                            WebviewBridge.sendProcessingStatus(webviewToRespond, 'executing', `테스트 실패 - 자동 수정 중 (${testFixAttempts}/${maxTestFixAttempts})...`);

                            // 🔥 v9.2.2: 수정된 파일들의 최신 내용을 읽어서 LLM에 전달 (코드 중복 방지)
                            const modifiedFilesContext: ModifiedFileContext[] = [];
                            const allModifiedPaths = [...new Set([...createdFiles, ...modifiedFiles])];

                            for (const filePath of allModifiedPaths) {
                                try {
                                    const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(workspaceRoot, filePath);
                                    const content = await fs.readFile(absolutePath, 'utf-8');
                                    modifiedFilesContext.push({ path: filePath, content });
                                    console.log(`[ConversationManager] 수정된 파일 컨텍스트 추가: ${filePath}`);
                                } catch (err) {
                                    console.warn(`[ConversationManager] 수정된 파일 읽기 실패 (무시): ${filePath}`, err);
                                }
                            }

                            accumulatedUserParts.push({
                                text: getErrorRetryPrompt(testResult.errorMessage || '알 수 없는 오류', modifiedFilesContext)
                            });
                            // 테스트 실패 시에는 LLM 호출 필요 (수정 요청)
                        } else {
                            // 재시도 초과 또는 비활성화 - REVIEW로 전환
                            console.log(`[ConversationManager] 테스트 실패, 재시도 ${isAutoTestRetryEnabled ? '초과' : '비활성화'}. REVIEW로 전환.`);
                            // 🔥 UI 상태 업데이트: 테스트 실패 후 검토로 전환
                            WebviewBridge.sendProcessingStep(webviewToRespond, 'review');
                            WebviewBridge.sendProcessingStatus(webviewToRespond, 'review', `[검토] 테스트 실패 - 결과 검토 중...`);
                            if (testResult.errorMessage) {
                                WebviewBridge.receiveMessage(webviewToRespond, 'System', `⚠️ 테스트 실패: ${testResult.errorMessage}`);
                            }
                            stateManager.transitionTo(AgentPhase.REVIEW);
                            turnCount++;
                            continue;
                        }
                    }
                } else if (!remainingPlanItems && !hasFileChanges) {
                    // 파일 변경 없이 도구만 실행된 경우 (예: read_file만 실행)
                    console.log(`[ConversationManager] EXECUTION phase: Tool execution succeeded but no file changes. Transitioning to REVIEW.`);
                    lastTurnHadSuccessfulToolExecution = false;
                    // 🔥 UI 상태 업데이트: 파일 변경 없이 검토로 전환
                    WebviewBridge.sendProcessingStep(webviewToRespond, 'review');
                    WebviewBridge.sendProcessingStatus(webviewToRespond, 'review', `[검토] 작업 완료 - 결과 검토 중...`);
                    stateManager.transitionTo(AgentPhase.REVIEW);
                    turnCount++;
                    continue;
                }
                // remainingPlanItems가 있으면 계속 진행 (다음 plan item 실행)
            }

            // [핵심 수정] EXECUTION phase에서 plan이 있으면 우선 plan 기반 도구를 직접 실행하고,
            // plan에 실행 도구가 없을 경우에만 한 번 LLM을 호출해 tool call을 생성
            if (currentPhaseForExecution === AgentPhase.EXECUTION && currentPlanItem) {
                // plan 생성 시 받은 도구 호출이 있으면 바로 실행
                if (toolCallsFromPlanCreation.length > 0) {
                    console.log(`[ConversationManager] EXECUTION phase: executing ${toolCallsFromPlanCreation.length} tool calls from plan creation, skipping LLM call.`);

                    const currentProject = ProjectManager.getInstance().getCurrentProject();
                    const workspaceRoot = currentProject?.root || '';

                    WebviewBridge.sendProcessingStep(webviewToRespond, 'executing');
                    WebviewBridge.sendProcessingStatus(webviewToRespond, 'executing', `${phaseLabel}도구 실행 중...`);

                    // 🔥 실시간 UI 업데이트를 위한 콜백
                    const uiMsgs1: Array<{ sender: 'USER' | 'CODEPILOT' | 'System'; text: string; type?: 'action' | 'code' | 'summary' | 'message' }> = [];
                    const toolResults = await toolExecutor.executeTools(toolCallsFromPlanCreation, {
                        projectRoot: workspaceRoot,
                        workspaceRoot: workspaceRoot,
                        actionManager,
                        executionManager,
                        terminalManager,
                        contextManager: this.contextManager
                    }, (_toolUse, result, index) => {
                        // 🔥 각 도구 실행 완료 시 즉시 UI에 전송
                        const msgs = ToolExecutionCoordinator.sendSingleToolResultToUI(
                            webviewToRespond,
                            toolCallsFromPlanCreation[index],
                            result
                        );
                        uiMsgs1.push(...msgs);
                    });

                    // 기존 sendToolExecutionResultsToUI 호출 제거 (이미 실시간으로 전송됨)
                    collectedUIMessages.push(...uiMsgs1);

                    // read_file 결과를 preloadedFiles에 추가 (중복 읽기 방지)
                    toolCallsFromPlanCreation.forEach((call, index) => {
                        if (call.name === Tool.READ_FILE && toolResults[index]?.success) {
                            const filePath = call.params.path || call.params.paths?.split(',')[0];
                            if (filePath) {
                                preloadedFiles.add(filePath);
                            }
                        }
                    });

                    // 파일 변경 추적 (요약 검증용)
                    ToolExecutionCoordinator.trackFileChanges(toolCallsFromPlanCreation, toolResults, createdFiles, modifiedFiles);

                    // 🔥 Solution 1: 도구 실행 성공 여부 추적 (중복 수정 방지)
                    const hasSuccessfulPlanExecution = toolResults.some(result => result.success === true);
                    if (hasSuccessfulPlanExecution) {
                        lastTurnHadSuccessfulToolExecution = true;
                        console.log(`[ConversationManager] Plan-based tool execution succeeded. Setting lastTurnHadSuccessfulToolExecution = true`);
                    }

                    // 파일 변경 후 formatter 및 validation 실행
                    if (createdFiles.length > 0 || modifiedFiles.length > 0) {
                        await this.afterFileChanges(webviewToRespond, workspaceRoot, createdFiles, modifiedFiles);
                    }

                    // 현재 Plan Item 완료 처리
                    if (ToolExecutionCoordinator.hasSideEffects(toolCallsFromPlanCreation, toolResults) && currentPlanItem) {
                        taskManager.updatePlanItemStatus(currentPlanItem.id, 'done');
                        WebviewBridge.updateTaskQueue(webviewToRespond, taskManager.listPlanItems());
                    }

                    // 다음 계획 항목이 있으면 계속, 없으면 EXECUTION 완료 → REVIEW로 전환
                    const nextItem = taskManager.getNextPendingItem();
                    if (nextItem) {
                        // 현재 plan item은 완료되었으므로 다음 item으로 이동
                        toolCallsFromPlanCreation = [];
                        turnCount++;
                        continue;
                    } else {
                        // ✅ 핵심 수정: 계획 완료 시 파일 변경이 있으면 무조건 검증 실행
                        // isAutoTestRetryEnabled는 재시도 여부만 결정 (첫 검증은 항상 실행)
                        const hasFileChanges = createdFiles.length > 0 || modifiedFiles.length > 0;

                        if (hasFileChanges) {
                            console.log('[ConversationManager] All plan items completed. Running automated tests before transitioning to REVIEW.');
                            const currentProject = ProjectManager.getInstance().getCurrentProject();
                            const workspaceRoot = currentProject?.root || '';
                            const testResult = await TestRunner.runAutomatedTests(webviewToRespond, workspaceRoot, createdFiles, modifiedFiles);

                            if (testResult.success) {
                                // 테스트 통과 → REVIEW로 전환
                                console.log('[ConversationManager] Tests passed. Transitioning to REVIEW phase.');
                                stateManager.transitionTo(AgentPhase.REVIEW);
                                turnCount++;
                                continue; // 다음 루프에서 REVIEW 처리
                            } else {
                                // 테스트 실패 시: 자동 재시도가 켜져 있을 때만 수정 시도
                                if (isAutoTestRetryEnabled && testFixAttempts < maxTestFixAttempts) {
                                    testFixAttempts++;
                                    console.log(`[ConversationManager] 테스트 실패 (${testFixAttempts}/${maxTestFixAttempts}). 에러 메시지를 컨텍스트에 추가하고 계속 진행합니다.`);
                                    // 테스트 실패 시 수정 강제 프롬프트 사용 (read_file 금지)
                                    accumulatedUserParts.push({
                                        text: getTestFailureFixPrompt(testResult.errorMessage || '알 수 없는 오류')
                                    });
                                    turnCount++;
                                    continue; // EXECUTION 단계 유지하여 수정 시도
                                } else {
                                    if (isAutoTestRetryEnabled) {
                                        console.log(`[ConversationManager] 테스트 수정 시도 횟수 초과 (${maxTestFixAttempts}회). REVIEW로 전환합니다.`);
                                        WebviewBridge.receiveMessage(webviewToRespond, 'System', `⚠️ 테스트 수정 시도 횟수 초과 (${maxTestFixAttempts}회). 최종 오류:\n${testResult.errorMessage || '알 수 없는 오류'}`);
                                    } else {
                                        console.log(`[ConversationManager] 자동 테스트 재시도가 비활성화되어 있습니다. REVIEW로 전환합니다.`);
                                        WebviewBridge.receiveMessage(webviewToRespond, 'System', `⚠️ 자동 테스트가 실패했습니다:\n${testResult.errorMessage || '알 수 없는 오류'}\n`);
                                    }
                                    // 실패해도 REVIEW로 전환하여 요약 생성
                                    stateManager.transitionTo(AgentPhase.REVIEW);
                                    turnCount++;
                                    continue;
                                }
                            }
                        } else {
                            // 파일 변경이 없으면 바로 REVIEW로 전환
                            console.log('[ConversationManager] All plan items completed. No file changes detected. Transitioning to REVIEW phase.');
                            stateManager.transitionTo(AgentPhase.REVIEW);
                            turnCount++;
                            continue;
                        }
                    }
                } else {
                    // plan에 실행 도구가 없을 때: plan item을 기반으로 LLM을 1회 호출하여 tool call 생성
                    // 단, 이미 파일이 생성된 경우는 제외 (설명용 호출 방지)
                    const hasAnyFileChange = createdFiles.length > 0 || modifiedFiles.length > 0;

                    // ⚠️ 핵심 수정: investigation item 체크를 LLM 호출 전에 먼저 수행
                    // Plan item이 조사 작업인지 확인 (kind 기반, 자동 완료 처리)
                    if (currentPlanItem) {
                        // kind 필드가 있으면 그것을 우선 사용, 없으면 기본값은 'execution'
                        const isInvestigationTask = currentPlanItem.kind === 'investigation';

                        if (isInvestigationTask) {
                            // ⚠️ 핵심 수정: investigation item은 INVESTIGATION phase에서만 처리
                            // EXECUTION phase에서는 investigation item을 완전히 스킵
                            console.log(`[ConversationManager] ⚠️ EXECUTION phase: plan item "${currentPlanItem.title}" is an investigation task. Investigation items must be processed in INVESTIGATION phase only. Skipping and moving to next item.`);

                            // investigation item을 스킵하고 다음 항목으로
                            taskManager.updatePlanItemStatus(currentPlanItem.id, 'skipped');
                            WebviewBridge.updateTaskQueue(webviewToRespond, taskManager.listPlanItems());

                            // 에러 메시지 추가: investigation item이 EXECUTION phase에 도달했다는 것은 FSM 위반
                            accumulatedUserParts.push({
                                text: getFsmViolationInvestigationInExecutionPrompt(currentPlanItem.title)
                            });

                            // 다음 계획 항목이 있으면 계속, 없으면 자동 테스트 후 REVIEW로 전환
                            const nextItem = taskManager.getNextPendingItem();
                            if (nextItem) {
                                turnCount++;
                                continue;
                            } else {
                                // ✅ 핵심 수정: 계획 완료 시 파일 변경이 있으면 무조건 검증 실행
                                const hasFileChanges = createdFiles.length > 0 || modifiedFiles.length > 0;

                                if (hasFileChanges) {
                                    console.log('[ConversationManager] All plan items completed. Running automated tests before transitioning to REVIEW.');
                                    const currentProject = ProjectManager.getInstance().getCurrentProject();
                                    const workspaceRoot = currentProject?.root || '';
                                    const testResult = await TestRunner.runAutomatedTests(webviewToRespond, workspaceRoot, createdFiles, modifiedFiles);

                                    if (testResult.success) {
                                        console.log('[ConversationManager] Tests passed. Transitioning to REVIEW phase.');
                                        stateManager.transitionTo(AgentPhase.REVIEW);
                                        turnCount++;
                                        continue;
                                    } else {
                                        // 테스트 실패 시: 자동 재시도가 켜져 있을 때만 수정 시도
                                        if (isAutoTestRetryEnabled && testFixAttempts < maxTestFixAttempts) {
                                            testFixAttempts++;
                                            console.log(`[ConversationManager] 테스트 실패 (${testFixAttempts}/${maxTestFixAttempts}). 에러 메시지를 컨텍스트에 추가하고 계속 진행합니다.`);
                                            // 테스트 실패 시 수정 강제 프롬프트 사용 (read_file 금지)
                                            accumulatedUserParts.push({
                                                text: getTestFailureFixPrompt(testResult.errorMessage || '알 수 없는 오류')
                                            });
                                            turnCount++;
                                            continue;
                                        } else {
                                            if (isAutoTestRetryEnabled) {
                                                console.log(`[ConversationManager] 테스트 수정 시도 횟수 초과 (${maxTestFixAttempts}회). REVIEW로 전환합니다.`);
                                                WebviewBridge.receiveMessage(webviewToRespond, 'System', getTestRetryExceededMessage(maxTestFixAttempts, testResult.errorMessage || '알 수 없는 오류'));
                                            } else {
                                                console.log(`[ConversationManager] 자동 테스트 재시도가 비활성화되어 있습니다. REVIEW로 전환합니다.`);
                                                WebviewBridge.receiveMessage(webviewToRespond, 'System', `⚠️ 자동 테스트가 실패했습니다:\n${testResult.errorMessage || '알 수 없는 오류'}\n`);
                                            }
                                            stateManager.transitionTo(AgentPhase.REVIEW);
                                            turnCount++;
                                            continue;
                                        }
                                    }
                                } else {
                                    // 파일 변경이 없으면 바로 REVIEW로 전환
                                    console.log('[ConversationManager] All plan items completed. No file changes detected. Transitioning to REVIEW phase.');
                                    stateManager.transitionTo(AgentPhase.REVIEW);
                                    turnCount++;
                                    continue;
                                }
                            }
                        }
                    }

                    // ⚠️ 핵심 수정: investigation item이 아닌 execution item에 대해서만 LLM 호출
                    // investigation item은 위에서 이미 처리되었으므로 여기서는 execution item만 처리
                    if (!hasAnyFileChange && currentPlanItem && currentPlanItem.kind !== 'investigation') {
                        // ⚠️ 자동 완료 로직 제거: 파일 존재만으로는 작업 완료를 보장할 수 없음
                        // LLM이 작업 상태를 가장 정확히 알고 있으므로, LLM이 항상 판단하도록 함
                        // 파일이 생성/수정되었다고 해서 Plan Item의 목표가 달성되었다고 보장할 수 없음
                        // 예: "user authentication 기능 추가" 계획에서 auth.ts 파일만 생성되고 실제 로직은 비어있을 수 있음

                        // LLM 호출하여 작업 상태 확인 및 계속 진행
                        // 아직 파일이 생성되지 않았고 plan item이 execution kind이면 LLM을 1회 호출하여 tool call 생성
                        console.log(`[ConversationManager] EXECUTION phase: no tool calls from plan creation, calling LLM once for execution plan item "${currentPlanItem.title}".`);

                        // 🚀 최적화: 프로젝트 파일 인벤토리 제공 (buildProjectInventorySection 활용)
                        let projectInventoryContext = '';
                        try {
                            const projectManager = ProjectManager.getInstance();
                            const inventory = await projectManager.buildProjectInventorySection(AgentConfig.MAX_PROJECT_INVENTORY_FILES);
                            if (inventory) {
                                projectInventoryContext = `\n\n${inventory}\n\n**중요**: 위 프로젝트 파일 구조를 참고하여 필요한 파일만 선택적으로 읽으세요. 모든 파일을 읽을 필요는 없습니다.\n`;
                            }
                        } catch (error) {
                            console.warn('[ConversationManager] Failed to build project inventory:', error);
                        }

                        // Pre-load된 파일 목록과 실제 내용을 EXECUTION 컨텍스트에 명확하게 포함
                        // ⚠️ 핵심 수정: Pre-load된 파일의 실제 내용을 accumulatedUserParts에서 추출하여 포함
                        let preloadedFilesContextForExecution = '';
                        const preloadedFilesContent: Array<{ path: string; content: string }> = [];
                        const processedPaths = new Set<string>(); // 중복 체크용

                        // accumulatedUserParts에서 Pre-load된 파일 내용 추출
                        for (const part of accumulatedUserParts) {
                            try {
                                if (part.text && part.text.includes('[System] ⚠️ **이미 읽은 파일')) {
                                    // 개선된 정규식: 파일 경로 추출 (언어 태그 지원)
                                    const fileMatch = part.text.match(/이미 읽은 파일[^:]*:\s*(.+?)(?:\n|$)/);
                                    const contentMatch = part.text.match(/```[\w]*\n([\s\S]*?)```/);

                                    if (fileMatch && contentMatch) {
                                        // 경로 정규화 및 중복 체크
                                        const filePath = path.normalize(fileMatch[1].trim());
                                        const content = contentMatch[1].trim();

                                        // 빈 내용 무시 및 중복 체크
                                        if (content && !processedPaths.has(filePath)) {
                                            processedPaths.add(filePath);
                                            preloadedFilesContent.push({
                                                path: filePath,
                                                content: content
                                            });
                                        }
                                    }
                                }
                            } catch (error) {
                                console.warn('[ConversationManager] Failed to extract preloaded file content:', error);
                                // 계속 진행
                            }
                        }

                        if (preloadedFiles.size > 0 || preloadedFilesContent.length > 0) {
                            const preloadedFilesArray = Array.from(preloadedFiles);
                            preloadedFilesContextForExecution = `\n\n**⚠️ 이미 읽은 파일 목록 (다시 읽지 마세요):**\n${preloadedFilesArray.map(f => `- ${f}`).join('\n')}\n\n`;

                            // Pre-load된 파일의 실제 내용 제공
                            if (preloadedFilesContent.length > 0) {
                                console.log(`[ConversationManager] Extracted ${preloadedFilesContent.length} preloaded file contents`);
                                preloadedFilesContextForExecution += `**이미 읽은 파일 내용 (위 대화 기록에서 확인 가능):**\n\n`;
                                preloadedFilesContent.forEach(({ path, content }) => {
                                    const lines = content.split('\n');
                                    const preview = StringUtils.truncateLines(content, AgentConfig.MAX_FILE_PREVIEW_LINES, '\n... (파일이 길어 일부만 표시)');
                                    preloadedFilesContextForExecution += `\n**파일: ${path}**\n\`\`\`\n${preview}\n\`\`\`\n`;
                                });
                                preloadedFilesContextForExecution += `\n**중요**: 위 파일들은 이미 읽었고 내용이 위에 제공되었습니다.\n` +
                                    `다시 read_file을 호출하지 마세요. 위 내용을 참고하여 작업을 진행하세요.\n`;
                            } else {
                                preloadedFilesContextForExecution += `**중요**: 위 파일들은 이미 읽었고, 위 대화 기록에서 파일 내용이 제공되었습니다.\n` +
                                    `다시 read_file을 호출하지 마세요. 위 대화 기록에서 파일 내용을 확인하세요.\n`;
                            }
                        }

                        const planContextForExecution = getExecutionPhaseContextPrompt({
                            currentTaskTitle: currentPlanItem.title,
                            currentTaskDetail: currentPlanItem.detail,
                            projectInventoryContext,
                            preloadedFilesContext: preloadedFilesContextForExecution
                        });

                        // execution 의도일 때 Command 모델 사용
                        let llmResponseForExecution: string;
                        if (intent && intent.category === 'execution' && this.stateManager) {
                            console.log('[ConversationManager] EXECUTION phase: Using Command model for execution intent');
                            llmResponseForExecution = await this.llmManager.sendMessageWithCommandModel(
                                activeSystemPrompt + planContextForExecution,
                                accumulatedUserParts,
                                this.stateManager,
                                { signal: abortSignal }
                            );
                        } else {
                            llmResponseForExecution = await this.llmManager.sendMessageWithSystemPrompt(
                                activeSystemPrompt + planContextForExecution,
                                accumulatedUserParts,
                                { signal: abortSignal }
                            );
                        }

                        const cleanExecutionResponse = llmResponseForExecution.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
                        const toolCallsFromExecution = ToolParser.parseToolCalls(cleanExecutionResponse);

                        if (toolCallsFromExecution.length > 0) {
                            // 도구 실행 로직
                            const currentProject = ProjectManager.getInstance().getCurrentProject();
                            const workspaceRoot = currentProject?.root || '';

                            WebviewBridge.sendProcessingStep(webviewToRespond, 'executing');
                            WebviewBridge.sendProcessingStatus(webviewToRespond, 'executing', `${phaseLabel}도구 실행 중...`);

                            // 🔥 실시간 UI 업데이트를 위한 콜백
                            const uiMsgs2: Array<{ sender: 'USER' | 'CODEPILOT' | 'System'; text: string; type?: 'action' | 'code' | 'summary' | 'message' }> = [];
                            const toolResults = await toolExecutor.executeTools(toolCallsFromExecution, {
                                projectRoot: workspaceRoot,
                                workspaceRoot: workspaceRoot,
                                actionManager,
                                executionManager,
                                terminalManager,
                                contextManager: this.contextManager
                            }, (_toolUse, result, index) => {
                                // 🔥 각 도구 실행 완료 시 즉시 UI에 전송
                                const msgs = ToolExecutionCoordinator.sendSingleToolResultToUI(
                                    webviewToRespond,
                                    toolCallsFromExecution[index],
                                    result
                                );
                                uiMsgs2.push(...msgs);
                            });

                            // 기존 sendToolExecutionResultsToUI 호출 제거 (이미 실시간으로 전송됨)
                            collectedUIMessages.push(...uiMsgs2);

                            // read_file 결과를 preloadedFiles에 추가 (중복 읽기 방지)
                            toolCallsFromExecution.forEach((call, index) => {
                                if (call.name === Tool.READ_FILE && toolResults[index]?.success) {
                                    const filePath = call.params.path || call.params.paths?.split(',')[0];
                                    if (filePath) {
                                        preloadedFiles.add(filePath);
                                    }
                                }
                            });

                            // 파일 변경 추적 (요약 검증용)
                            ToolExecutionCoordinator.trackFileChanges(toolCallsFromExecution, toolResults, createdFiles, modifiedFiles);

                            // 🔥 Solution 1: 도구 실행 성공 여부 추적 (중복 수정 방지)
                            const hasSuccessfulToolExecution = toolResults.some(result => result.success === true);
                            if (hasSuccessfulToolExecution) {
                                lastTurnHadSuccessfulToolExecution = true;
                                console.log(`[ConversationManager] Tool execution (from LLM) succeeded. Setting lastTurnHadSuccessfulToolExecution = true`);
                            }

                            // 파일 변경 후 formatter 및 validation 실행
                            if (createdFiles.length > 0 || modifiedFiles.length > 0) {
                                await this.afterFileChanges(webviewToRespond, workspaceRoot, createdFiles, modifiedFiles);
                            }

                            const resultSummary = ToolExecutionCoordinator.createToolResultSummary(turnCount, toolCallsFromExecution, toolResults);

                            if (ToolExecutionCoordinator.hasSideEffects(toolCallsFromExecution, toolResults) && currentPlanItem) {
                                taskManager.updatePlanItemStatus(currentPlanItem.id, 'done');
                                WebviewBridge.updateTaskQueue(webviewToRespond, taskManager.listPlanItems());
                            }

                            // 다음 계획 항목이 있으면 계속, 없으면 자동 테스트 후 REVIEW로 전환
                            const nextItem = taskManager.getNextPendingItem();
                            if (nextItem) {
                                accumulatedUserParts.push({ text: llmResponseForExecution });
                                accumulatedUserParts.push({ text: resultSummary });
                                turnCount++;
                                continue;
                            } else {
                                console.log('[ConversationManager] All plan items completed. Running automated tests before transitioning to REVIEW.');
                                const currentProject = ProjectManager.getInstance().getCurrentProject();
                                const workspaceRoot = currentProject?.root || '';
                                const testResult = await TestRunner.runAutomatedTests(webviewToRespond, workspaceRoot, createdFiles, modifiedFiles);

                                if (testResult.success) {
                                    // 테스트 통과 → REVIEW로 전환
                                    console.log('[ConversationManager] Tests passed. Transitioning to REVIEW phase.');
                                    stateManager.transitionTo(AgentPhase.REVIEW);
                                    turnCount++;
                                    continue; // 다음 루프에서 REVIEW 처리
                                } else {
                                    // 테스트 실패 시: 자동 재시도가 켜져 있을 때만 수정 시도
                                    if (isAutoTestRetryEnabled && testFixAttempts < maxTestFixAttempts) {
                                        testFixAttempts++;
                                        console.log(`[ConversationManager] 테스트 실패 (${testFixAttempts}/${maxTestFixAttempts}). 에러 메시지를 컨텍스트에 추가하고 계속 진행합니다.`);
                                        // 테스트 실패 시 수정 강제 프롬프트 사용 (read_file 금지)
                                        accumulatedUserParts.push({
                                            text: getTestFailureFixPrompt(testResult.errorMessage || '알 수 없는 오류')
                                        });
                                        turnCount++;
                                        continue; // EXECUTION 단계 유지하여 수정 시도
                                    } else {
                                        if (isAutoTestRetryEnabled) {
                                            console.log(`[ConversationManager] 테스트 수정 시도 횟수 초과 (${maxTestFixAttempts}회). REVIEW로 전환합니다.`);
                                            WebviewBridge.receiveMessage(webviewToRespond, 'System', getTestRetryExceededMessage(maxTestFixAttempts, testResult.errorMessage || '알 수 없는 오류'));
                                        } else {
                                            console.log(`[ConversationManager] 자동 테스트 재시도가 비활성화되어 있습니다. REVIEW로 전환합니다.`);
                                            WebviewBridge.receiveMessage(webviewToRespond, 'System', `⚠️ 자동 테스트가 실패했습니다:\n${testResult.errorMessage || '알 수 없는 오류'}\n`);
                                        }
                                        // 실패해도 REVIEW로 전환하여 요약 생성
                                        stateManager.transitionTo(AgentPhase.REVIEW);
                                        turnCount++;
                                        continue;
                                    }
                                }
                            }
                        } else {
                            // LLM을 호출했지만 도구 호출이 없음
                            const textResponse = this.responseProcessor.extractResponseText(cleanExecutionResponse);
                            const hasAttachedContext = options.terminalContext || (options.selectedFiles && options.selectedFiles.length > 0) || options.diagnosticsContext;

                            // 🔥 핵심 수정: 파일 변경이 없고 재시도 횟수가 남아있으면 도구 호출 강제
                            const hasFileChanges = createdFiles.length > 0 || modifiedFiles.length > 0;

                            if (!hasFileChanges && executionNoToolRetryCount < maxExecutionNoToolRetries) {
                                // 파일 변경 없이 도구 호출도 없음 → LLM에게 도구 호출 강제 프롬프트 추가 후 재시도
                                executionNoToolRetryCount++;
                                console.log(`[ConversationManager] EXECUTION phase: No tool calls and no file changes. Forcing tool call (retry ${executionNoToolRetryCount}/${maxExecutionNoToolRetries}).`);

                                const planItemTitle = currentPlanItem?.title || '현재 작업';
                                accumulatedUserParts.push({ text: llmResponseForExecution });
                                accumulatedUserParts.push({ text: getExecutionNoToolCallWarningPrompt(planItemTitle) });
                                turnCount++;
                                continue;
                            }

                            // 첨부 컨텍스트가 있을 때는 분석 응답이므로 사용자에게 표시
                            if (textResponse && textResponse.trim().length > 0) {
                                if (hasAttachedContext) {
                                    console.log(`[ConversationManager] EXECUTION phase: Text response with attached context (length: ${textResponse.length}). Displaying to user.`);
                                    await WebviewBridge.streamText(webviewToRespond, 'CODEPILOT', textResponse);
                                    stateManager.transitionTo(AgentPhase.REVIEW);
                                    break;
                                } else {
                                    console.log(`[ConversationManager] EXECUTION phase: Text response received (length: ${textResponse.length}). Skipping display (EXECUTION phase blocks CODEPILOT text).`);
                                    accumulatedUserParts.push({ text: llmResponseForExecution });
                                }
                            }

                            // 재시도 횟수 초과 또는 파일 변경이 있는 경우 → plan item 완료 처리
                            console.log('[ConversationManager] No tool calls returned for plan item execution. Marking current plan item as done and moving to next.');

                            if (currentPlanItem) {
                                taskManager.updatePlanItemStatus(currentPlanItem.id, 'done');
                                WebviewBridge.updateTaskQueue(webviewToRespond, taskManager.listPlanItems());
                            }

                            const nextItem = taskManager.getNextPendingItem();
                            if (nextItem) {
                                executionNoToolRetryCount = 0; // 다음 plan item으로 이동 시 카운터 리셋
                                turnCount++;
                                continue;
                            } else {
                                console.log('[ConversationManager] All plan items completed. Running automated tests before transitioning to REVIEW.');
                                const currentProject = ProjectManager.getInstance().getCurrentProject();
                                const workspaceRoot = currentProject?.root || '';
                                const testResult = await TestRunner.runAutomatedTests(webviewToRespond, workspaceRoot, createdFiles, modifiedFiles);

                                if (testResult.success) {
                                    console.log('[ConversationManager] Tests passed. Transitioning to REVIEW phase.');
                                    stateManager.transitionTo(AgentPhase.REVIEW);
                                    turnCount++;
                                    continue;
                                } else {
                                    if (isAutoTestRetryEnabled && testFixAttempts < maxTestFixAttempts) {
                                        testFixAttempts++;
                                        console.log(`[ConversationManager] 테스트 실패 (${testFixAttempts}/${maxTestFixAttempts}). 에러 메시지를 컨텍스트에 추가하고 계속 진행합니다.`);
                                        // 테스트 실패 시 수정 강제 프롬프트 사용 (read_file 금지)
                                        accumulatedUserParts.push({
                                            text: getTestFailureFixPrompt(testResult.errorMessage || '알 수 없는 오류')
                                        });
                                        turnCount++;
                                        continue;
                                    } else {
                                        if (isAutoTestRetryEnabled) {
                                            console.log(`[ConversationManager] 테스트 수정 시도 횟수 초과 (${maxTestFixAttempts}회). REVIEW로 전환합니다.`);
                                            WebviewBridge.receiveMessage(webviewToRespond, 'System', getTestRetryExceededMessage(maxTestFixAttempts, testResult.errorMessage || '알 수 없는 오류'));
                                        } else {
                                            console.log(`[ConversationManager] 자동 테스트 재시도가 비활성화되어 있습니다. REVIEW로 전환합니다.`);
                                            WebviewBridge.receiveMessage(webviewToRespond, 'System', `⚠️ 자동 테스트가 실패했습니다:\n${testResult.errorMessage || '알 수 없는 오류'}\n`);
                                        }
                                        stateManager.transitionTo(AgentPhase.REVIEW);
                                        turnCount++;
                                        continue;
                                    }
                                }
                            }
                        }
                    } else {
                        // 이미 파일이 생성된 경우: LLM 호출 없이 plan item 완료 처리
                        console.log('[ConversationManager] EXECUTION phase: plan item has no executable tool calls and files already exist. Marking as done without additional LLM call.');

                        if (currentPlanItem) {
                            taskManager.updatePlanItemStatus(currentPlanItem.id, 'done');
                            WebviewBridge.updateTaskQueue(webviewToRespond, taskManager.listPlanItems());
                        }

                        // 다음 계획 항목이 있으면 계속, 없으면 자동 테스트 후 REVIEW로 전환
                        const nextItem = taskManager.getNextPendingItem();
                        if (nextItem) {
                            turnCount++;
                            continue;
                        } else {
                            console.log('[ConversationManager] All plan items completed. Running automated tests before transitioning to REVIEW.');
                            const currentProject = ProjectManager.getInstance().getCurrentProject();
                            const workspaceRoot = currentProject?.root || '';
                            const testResult = await TestRunner.runAutomatedTests(webviewToRespond, workspaceRoot, createdFiles, modifiedFiles);

                            if (testResult.success) {
                                // 테스트 통과 → REVIEW로 전환
                                console.log('[ConversationManager] Tests passed. Transitioning to REVIEW phase.');
                                stateManager.transitionTo(AgentPhase.REVIEW);
                                turnCount++;
                                continue; // 다음 루프에서 REVIEW 처리
                            } else {
                                // 테스트 실패 시: 자동 재시도가 켜져 있을 때만 수정 시도
                                if (isAutoTestRetryEnabled && testFixAttempts < maxTestFixAttempts) {
                                    testFixAttempts++;
                                    console.log(`[ConversationManager] 테스트 실패 (${testFixAttempts}/${maxTestFixAttempts}). 에러 메시지를 컨텍스트에 추가하고 계속 진행합니다.`);
                                    // 테스트 실패 시 수정 강제 프롬프트 사용 (read_file 금지)
                                    accumulatedUserParts.push({
                                        text: getTestFailureFixPrompt(testResult.errorMessage || '알 수 없는 오류')
                                    });
                                    turnCount++;
                                    continue; // EXECUTION 단계 유지하여 수정 시도
                                } else {
                                    if (isAutoTestRetryEnabled) {
                                        console.log(`[ConversationManager] 테스트 수정 시도 횟수 초과 (${maxTestFixAttempts}회). REVIEW로 전환합니다.`);
                                        WebviewBridge.receiveMessage(webviewToRespond, 'System', `⚠️ 테스트 수정 시도 횟수 초과 (${maxTestFixAttempts}회). 최종 오류:\n${testResult.errorMessage || '알 수 없는 오류'}`);
                                    } else {
                                        console.log(`[ConversationManager] 자동 테스트 재시도가 비활성화되어 있습니다. REVIEW로 전환합니다.`);
                                        WebviewBridge.receiveMessage(webviewToRespond, 'System', `⚠️ 자동 테스트가 실패했습니다:\n${testResult.errorMessage || '알 수 없는 오류'}\n`);
                                    }
                                    // 실패해도 REVIEW로 전환하여 요약 생성
                                    stateManager.transitionTo(AgentPhase.REVIEW);
                                    turnCount++;
                                    continue;
                                }
                            }
                        }
                    }
                }
            }

            // Pre-load된 파일 목록을 컨텍스트에 포함
            const preloadedFilesList = preloadedFiles.size > 0
                ? `\n\n**⚠️ 이미 읽은 파일 목록 (다시 읽지 마세요):**\n${Array.from(preloadedFiles).map(f => `- ${f}`).join('\n')}\n\n이 파일들은 이미 읽었으므로 다시 read_file을 호출하지 마세요. 위 대화 기록에서 파일 내용을 확인하세요.`
                : '';

            const planContext = currentPlanItem
                ? `\n\nCURRENT TASK: ${currentPlanItem.title}${currentPlanItem.detail ? `\nDETAIL: ${currentPlanItem.detail}` : ''}${preloadedFilesList}\n\n**중요**: 필요한 파일이 여러 개라면 반드시 한 번의 응답에 모든 도구를 호출하세요. 여러 도구 호출을 연속해서 작성할 수 있습니다. 한 번에 최대한 많은 작업을 수행하세요.`
                : `\n\n=== NO ACTIVE PLAN ===\nAnalyze the user query and proceed with necessary actions (e.g. create a plan using JSON format).${preloadedFilesList}\n\n**중요**: 필요한 파일이 여러 개라면 반드시 한 번의 응답에 모든 도구를 호출하세요. 여러 도구 호출을 연속해서 작성할 수 있습니다.`;

            console.log(`[ConversationManager] Calling LLM for Turn ${turnCount + 1} (Phase: ${currentPhase})`);

            // 🔥 LLM 호출 전 UI 상태 업데이트
            WebviewBridge.sendProcessingStep(webviewToRespond, 'thinking');
            WebviewBridge.sendProcessingStatus(webviewToRespond, 'thinking', `LLM 응답 대기 중...`);

            // 스트리밍 설정 확인
            const isStreamingEnabled = options.extensionContext
                ? await SettingsManager.getInstance(options.extensionContext).isStreamingEnabled()
                : false;

            let llmResponse: string;

            if (isStreamingEnabled) {
                // 스트리밍 모드: 실시간으로 웹뷰에 청크 전송
                console.log(`[ConversationManager] Streaming mode enabled for Turn ${turnCount + 1}`);

                // REVIEW/DONE 단계에서만 실제 스트리밍 출력, 그 외에는 조용히 수집
                const shouldStreamToUI = shouldSendCodePilotText(currentPhase);

                // 🔥 채팅 패널 타이핑 효과 (자연어 텍스트만, 코드 블록은 ToolExecutor가 처리)
                let textStreamer: StreamingCodeApplier | null = null;

                if (shouldStreamToUI) {
                    textStreamer = new StreamingCodeApplier({
                        onTextChunk: (chunk) => {
                            WebviewBridge.streamMessageChunk(webviewToRespond, chunk);
                        }
                    });
                }

                if (shouldStreamToUI) {
                    // 스트리밍 시작 알림
                    WebviewBridge.startStreamingMessage(webviewToRespond, 'assistant');
                }

                let accumulatedResponse = '';
                // 🔥 onChunk는 SYNC여야 함 (LLM API가 await 안 함)
                const onChunk = (chunk: string, done: boolean) => {
                    accumulatedResponse += chunk;

                    // 🔥 채팅 타이핑 효과: textStreamer가 도구 호출 제외하고 텍스트만 출력
                    if (textStreamer) {
                        textStreamer.processChunk(chunk);
                    }

                    if (done) {
                        // 타이핑 완료 (fire-and-forget, async)
                        if (textStreamer) {
                            textStreamer.complete().catch((err: Error) => {
                                console.error('[ConversationManager] Text streaming error:', err);
                            });
                        }
                        if (shouldStreamToUI) {
                            WebviewBridge.endStreamingMessage(webviewToRespond);
                        }
                    }
                };

                // execution 의도일 때 Command 모델 사용 (스트리밍)
                if (intent && intent.category === 'execution' && this.stateManager) {
                    console.log('[ConversationManager] Execution intent detected, using Command model (streaming)');
                    llmResponse = await this.llmManager.sendMessageWithCommandModelStreaming(
                        activeSystemPrompt + planContext,
                        accumulatedUserParts,
                        onChunk,
                        this.stateManager,
                        { signal: abortSignal }
                    );
                } else {
                    llmResponse = await this.llmManager.sendMessageWithSystemPromptStreaming(
                        activeSystemPrompt + planContext,
                        accumulatedUserParts,
                        onChunk,
                        { signal: abortSignal }
                    );
                }
            } else {
                // 비스트리밍 모드: 기존 방식
                // execution 의도일 때 Command 모델 사용
                if (intent && intent.category === 'execution' && this.stateManager) {
                    console.log('[ConversationManager] Execution intent detected, using Command model');
                    llmResponse = await this.llmManager.sendMessageWithCommandModel(
                        activeSystemPrompt + planContext,
                        accumulatedUserParts,
                        this.stateManager,
                        { signal: abortSignal }
                    );
                } else {
                    llmResponse = await this.llmManager.sendMessageWithSystemPrompt(
                        activeSystemPrompt + planContext,
                        accumulatedUserParts,
                        { signal: abortSignal }
                    );
                }
            }

            console.log(`[ConversationManager] LLM Raw Response (Turn ${turnCount + 1}):`, llmResponse.length > AgentConfig.MAX_LOG_PREVIEW_LENGTH ? llmResponse.substring(0, AgentConfig.MAX_LOG_PREVIEW_LENGTH) + '...' : llmResponse);

            // 1. 응답 정제 (<think> 태그 및 JSON 래핑 처리)
            // ⚠️ 핵심 수정: LLM response에서 thinking 노출 차단 강화
            // StringUtils를 사용하여 모든 패턴 제거
            // 🔥 수정: INVESTIGATION 단계에서는 자연어 제거 안함 (텍스트 응답 감지 필요)
            let cleanResponse = StringUtils.cleanText(llmResponse, {
                removeThinking: true,
                removeNaturalLanguage: currentPhase !== AgentPhase.INVESTIGATION, // INVESTIGATION에서는 자연어 유지 (텍스트 응답 감지용)
                removeSystemMessages: false, // 이 컨텍스트에서는 시스템 메시지 제거하지 않음
                removeToolTags: false, // 도구 태그는 유지
                removeJsonThinking: true,
                extractJson: false
            });

            // 도구 호출만 남기고 자연어 텍스트 제거 (EXECUTION phase에서 특히 중요)
            // 🔥 핵심: EXECUTION phase에서는 "생각", "설명" → 전부 무시, tool call만 추출
            if (currentPhase === AgentPhase.EXECUTION) {
                // 새 형식: { "tool": "..." } 패턴 확인
                // ⚠️ llmResponse (원본)에서 체크 - cleanResponse는 자연어 필터링으로 JSON이 손상될 수 있음
                const hasToolCallPattern = /\{\s*["']tool["']\s*:\s*["']/.test(llmResponse);

                if (hasToolCallPattern) {
                    // 도구 호출 형식 감지됨 - 원본 유지 (ToolParser에서 처리)
                    console.log(`[ConversationManager] EXECUTION phase: Tool call detected`);
                } else {
                    // 도구 호출이 없으면 자연어 응답으로 간주
                    console.warn(`[ConversationManager] EXECUTION phase: No tool calls found. LLM provided natural language instead of tool calls.`);

                    // 🔥 최적화: 이전 턴에서 도구가 성공적으로 실행됐고 남은 plan item이 없으면
                    // "완료 확인" 호출 없이 바로 REVIEW로 전환 (불필요한 LLM 호출 제거)
                    const remainingPlanItems = taskManager.getNextPendingItem();
                    if (lastTurnHadSuccessfulToolExecution && !remainingPlanItems) {
                        console.log(`[ConversationManager] EXECUTION phase: Previous turn had successful tool execution and no remaining plan items. Skipping completion confirmation and transitioning to REVIEW.`);
                        // "완료 확인" 호출 없이 바로 REVIEW로 전환
                        stateManager.transitionTo(AgentPhase.REVIEW);
                        lastTurnHadSuccessfulToolExecution = false; // 리셋
                        (this as any).naturalLanguageRetry = 0; // 리셋
                        cleanResponse = ''; // 자연어 응답은 무시 (불필요한 "완료했습니다" 메시지)
                    } else if (lastTurnHadSuccessfulToolExecution && remainingPlanItems) {
                        // 남은 plan item이 있으면 계속 진행 (다음 plan item 실행)
                        console.log(`[ConversationManager] EXECUTION phase: Previous turn had successful tool execution but remaining plan items exist. Continuing to next item.`);
                        lastTurnHadSuccessfulToolExecution = false; // 리셋
                        (this as any).naturalLanguageRetry = 0; // 리셋
                        // cleanResponse는 유지하지 않음 (자연어 응답 무시하고 다음 plan item으로)
                        cleanResponse = '';
                    } else {
                        // 🔥 자연어 응답 시 즉시 재요청 (최대 3회)
                        const naturalLanguageRetryKey = 'naturalLanguageRetry';
                        const currentRetryCount = (this as any)[naturalLanguageRetryKey] || 0;
                        if (currentRetryCount < 3) {
                            (this as any)[naturalLanguageRetryKey] = currentRetryCount + 1;
                            console.log(`[ConversationManager] EXECUTION phase: Natural language response detected. Requesting tool call (attempt ${currentRetryCount + 1}/3)`);
                            accumulatedUserParts.push({ text: getExecutionNudgePrompt() });
                            turnCount++;
                            continue; // 즉시 재요청
                        } else {
                            console.warn(`[ConversationManager] EXECUTION phase: Max retries (3) reached for natural language responses. Proceeding with empty response.`);
                            (this as any)[naturalLanguageRetryKey] = 0; // 리셋
                        }
                        cleanResponse = '';
                    }
                }
            }

            // 1-1. INVESTIGATION 단계 Output Contract 검증: plan과 실행 도구가 함께 나오면
            // 🔥 개선: 재요청 대신 실행 도구만 처리하고 plan은 무시 (턴 낭비 방지)
            // ⚠️ ripgrep_search는 허용 (조사 행위, 부작용 없음)
            // ⚠️ JSON Function Calling도 지원
            if (currentPhase === AgentPhase.INVESTIGATION) {
                // JSON plan 확인
                // ⚠️ llmResponse (원본)에서 체크 - cleanResponse는 자연어 필터링으로 JSON이 손상될 수 있음
                const hasPlan = /\{\s*"plan"\s*:/.test(llmResponse) ||
                    /```json[\s\S]*?"plan"[\s\S]*?```/i.test(llmResponse);

                // 도구 호출에서 실행 도구 확인
                // ⚠️ llmResponse (원본)에서 파싱 - cleanResponse는 자연어 필터링으로 JSON이 손상될 수 있음
                const parsedToolCalls = ToolParser.parseToolCalls(llmResponse);
                const executionTools = [Tool.CREATE_FILE, Tool.UPDATE_FILE, Tool.REMOVE_FILE, Tool.RUN_COMMAND];
                const hasExecutionTool = parsedToolCalls.some(call => executionTools.includes(call.name as Tool));

                // 🔥 개선: plan과 실행 도구가 함께 있으면 plan을 무시하고 실행 도구만 처리
                // 이전: 즉시 재요청 → 불필요한 턴 발생, 429 에러 유발
                // 현재: 실행 도구 처리 후 EXECUTION 단계로 전환
                if (hasPlan && hasExecutionTool) {
                    console.log('[ConversationManager] INVESTIGATION: plan과 실행 도구가 함께 제공됨. plan을 무시하고 실행 도구만 처리합니다.');
                    // plan JSON 부분 제거 (실행 도구만 남김)
                    cleanResponse = cleanResponse
                        .replace(/```json[\s\S]*?\{\s*"plan"\s*:[\s\S]*?\}[\s\S]*?```/gi, '')
                        .replace(/\{\s*"plan"\s*:\s*\[[\s\S]*?\]\s*\}/g, '')
                        .trim();
                    // 실행 도구가 있으므로 EXECUTION 단계로 전환 (stateManager 사용)
                    stateManager.transitionTo(AgentPhase.EXECUTION);
                    console.log('[ConversationManager] Transitioning to EXECUTION phase (tool found with plan)');
                }
            }

            // 2. <investigation_done/> 토큰 파싱 (제거 전에 먼저 파싱)
            // ⚠️ 중요: llmResponse에서 직접 파싱 (cleanResponse는 이미 정제되었을 수 있음)
            const investigationDoneToken = ToolParser.parseInvestigationDone(llmResponse);
            if (investigationDoneToken) {
                console.log(`[ConversationManager] investigation_done token detected in raw response`);
            }

            // 3. 시스템 내부 토큰 제거 (사용자에게 표시되면 안 됨)
            // <investigation_done/> 토큰은 시스템 내부용이므로 제거
            cleanResponse = cleanResponse.replace(/<investigation_done\s*\/>/gi, '').trim();

            // 🔥 EXECUTION phase에서 텍스트만 나오면 즉시 재요청 (핵심 개선)
            if (currentPhase === AgentPhase.EXECUTION && llmResponse.trim()) {
                // 도구 호출이 있는지 확인 (새 형식: { "tool": "..." })
                // ⚠️ llmResponse (원본)에서 체크 - cleanResponse는 자연어 필터링으로 JSON이 손상될 수 있음
                const hasToolCallInExecution = /\{\s*["']tool["']\s*:\s*["']/.test(llmResponse);

                if (!hasToolCallInExecution) {
                    // 텍스트만 있고 도구 호출이 없으면 자연어 응답으로 간주
                    console.warn(`[ConversationManager] EXECUTION phase: LLM provided natural language text instead of tool calls. Rejecting and requesting again.`);
                    accumulatedUserParts.push({ text: getExecutionOutputContractViolationPrompt() });
                    turnCount++;
                    continue; // 즉시 재요청
                }
            }

            // 🔥 중복 실행 방지: 전체 llmResponse에서 모든 tool call을 한 번만 파싱
            // ⚠️ llmResponse (원본)에서 파싱 - cleanResponse는 자연어 필터링으로 JSON이 손상될 수 있음
            const allToolCallsFromResponse = ToolParser.parseToolCalls(llmResponse);
            const parsedToolCallsMap = new Map<string, any>();
            allToolCallsFromResponse.forEach(call => {
                const key = `${call.name}:${JSON.stringify(call.params)}`;
                parsedToolCallsMap.set(key, call);
            });

            let turnHasSideEffects = false;
            let turnResultsSummary = '';
            let hasPlanTag = false;
            let currentActiveItem = taskManager.getNextPendingItem();
            const executedInTurn = new Set<string>();

            // 툴 파싱 경고 수집 (예: create_file content 누락)
            const toolParseWarnings: string[] = [];

            // 🔥 도구 호출 처리 (새 형식: { "tool": "..." })
            // ⚠️ 핵심 수정: llmResponse (원본)에서 체크 - cleanResponse는 자연어 필터링으로 JSON이 손상될 수 있음
            const hasToolCall = /\{\s*["']tool["']\s*:\s*["']/.test(llmResponse);
            const hasJsonPlanInResponse = /\{\s*"plan"\s*:/.test(llmResponse) ||
                /```json[\s\S]*?\{[\s\S]*?"plan"[\s\S]*?\}[\s\S]*?```/i.test(llmResponse);

            // JSON Plan 처리 (도구 호출 없이 plan만 있는 경우)
            // 🔥 핵심 수정: analysis/documentation 인텐트에서는 JSON plan을 무시하고 자연어 응답으로 처리
            const isTextOnlyIntent = intent && (intent.category === 'analysis' || intent.category === 'documentation');
            if (hasJsonPlanInResponse && !isTextOnlyIntent) {
                console.log(`[ConversationManager] JSON plan detected`);
                // ⚠️ 핵심 수정: llmResponse (원본)에서 파싱 - cleanResponse는 자연어 필터링으로 JSON이 손상될 수 있음
                const planItems = ToolParser.parsePlanItems(llmResponse);
                if (planItems.length > 0) {
                    WebviewBridge.sendProcessingStep(webviewToRespond, 'plan');
                    WebviewBridge.sendProcessingStatus(webviewToRespond, 'plan', '작업 계획 분석 및 파싱 중...');

                    taskManager.setPlanItems(planItems);
                    hasPlanTag = true;
                    WebviewBridge.updateTaskQueue(webviewToRespond, taskManager.listPlanItems());

                    // 🔥 핵심 수정: Plan이 수립되면 INVESTIGATION → EXECUTION 전환
                    if (currentPhase === AgentPhase.INVESTIGATION) {
                        console.log('[ConversationManager] Plan received in INVESTIGATION phase. Transitioning to EXECUTION.');
                        stateManager.transitionTo(AgentPhase.EXECUTION, {
                            hasPlan: true,
                            toolCallsInTurn: [],
                            hasInvestigationHistory: true
                        });
                    }
                }
            } else if (hasJsonPlanInResponse && isTextOnlyIntent) {
                console.log(`[ConversationManager] JSON plan detected but ignored for ${intent?.category} intent - will use natural language response`);
            }

            // 도구 호출 처리 (새 형식: { "tool": "..." })
            if (hasToolCall) {
                console.log(`[ConversationManager] Tool call detected, processing tool calls`);

                // 도구 실행 처리
                // ⚠️ 핵심 수정: llmResponse (원본)에서 파싱 - cleanResponse는 자연어 필터링으로 JSON이 손상될 수 있음
                const toolCallsFromJson = ToolParser.parseToolCalls(llmResponse, toolParseWarnings);
                console.log(`[ConversationManager] Tool calls: parsed ${toolCallsFromJson.length} tool calls`);

                if (toolCallsFromJson.length > 0) {
                    // 중복 제거
                    const toolCallsMap = new Map<string, any>();
                    toolCallsFromJson.forEach(call => {
                        const key = `${call.name}:${JSON.stringify(call.params)}`;
                        if (!executedInTurn.has(key)) {
                            toolCallsMap.set(key, call);
                        } else {
                            console.log(`[ConversationManager] Skipping already executed tool call: ${call.name}`);
                        }
                    });

                    const toolCalls = Array.from(toolCallsMap.values());

                    if (toolCalls.length > 0) {
                        // FSM을 사용한 도구 허용 여부 검증
                        const blockedCalls = toolCalls.filter(call => !stateManager.isToolAllowed(call.name as Tool));

                        // INVESTIGATION 단계에서 EXECUTION 도구가 있으면 EXECUTION으로 전환
                        // 🔥 개선: 실행 도구 자체가 "실행 의도"의 명확한 증거이므로 조건 완화
                        // - 이전: hasExecutionIntentInHistory || executionIntent 조건 필요
                        // - 현재: 실행 도구가 나오면 무조건 EXECUTION으로 전환 (불필요한 재요청 방지)
                        if (blockedCalls.length > 0 && currentPhase === AgentPhase.INVESTIGATION) {
                            const existingPlanItems = taskManager.listPlanItems();

                            // 실행 도구가 나왔다는 것 자체가 실행 의도의 증거
                            // plan 없이도 전환 가능하게 하여 불필요한 턴 낭비 방지
                            console.log(`[ConversationManager] JSON: Execution tool detected in INVESTIGATION. Transitioning to EXECUTION phase.`);
                            const transitionContext = {
                                hasPlan: existingPlanItems.length > 0,
                                toolCallsInTurn: toolCalls,
                                hasInvestigationHistory: hasInvestigationHistory
                            };

                            const transitionResult = stateManager.transitionTo(AgentPhase.EXECUTION, transitionContext);
                            if (transitionResult.success) {
                                console.log('[ConversationManager] JSON: Successfully transitioned to EXECUTION phase.');
                                turnResultsSummary += `\n[System] 실행 도구가 감지되어 실행 단계로 전환합니다.\n`;
                                // 전환 성공 후 blockedCalls 재검증
                                blockedCalls.splice(0, blockedCalls.length); // 배열 비우기
                            }
                        }

                        // blockedCalls가 없거나 비워졌으면 도구 실행
                        if (blockedCalls.length === 0) {
                            // 🔥 EXECUTION 단계에서 조사 도구만 호출하는 경우 경고 및 수정 도구 강제
                            const investigationTools = [Tool.READ_FILE, Tool.LIST_FILES, Tool.SEARCH_FILES, Tool.RIPGREP_SEARCH];
                            const onlyInvestigationTools = toolCalls.every(call => investigationTools.includes(call.name as Tool));

                            if (currentPhase === AgentPhase.EXECUTION && onlyInvestigationTools) {
                                console.warn(`[ConversationManager] EXECUTION phase: Only investigation tools detected (${toolCalls.map(c => c.name).join(', ')}). LLM should use update_file/create_file instead.`);
                                // 테스트 실패 후 재시도 중인 경우, 조사 도구 실행 대신 수정 도구 사용 강제
                                if (testFixAttempts > 0) {
                                    console.log(`[ConversationManager] Test fix attempt ${testFixAttempts}: Blocking investigation tools, requesting modification tools.`);
                                    accumulatedUserParts.push({
                                        text: `\n[System] ⚠️ **조사 도구 사용 금지**\n\n` +
                                            `현재 EXECUTION 단계에서 테스트 오류를 수정 중입니다.\n` +
                                            `${toolCalls.map(c => c.name).join(', ')} 도구는 조사용이며, 이 단계에서는 사용할 수 없습니다.\n\n` +
                                            `**즉시 update_file 도구로 오류를 수정하세요.**\n` +
                                            `파일을 다시 읽지 마세요. 이미 충분한 정보가 있습니다.`
                                    });
                                    turnCount++;
                                    continue; // 도구 실행 건너뛰고 재요청
                                }
                            }

                            // 중복 방지를 위해 executedInTurn에 추가
                            toolCalls.forEach(call => {
                                const key = `${call.name}:${JSON.stringify(call.params)}`;
                                executedInTurn.add(key);
                            });

                            console.log(`[ConversationManager] JSON: Executing ${toolCalls.length} tool(s):`, toolCalls.map(c => c.name));

                            // 도구 실행
                            WebviewBridge.sendProcessingStep(webviewToRespond, 'executing');
                            const phaseLabelExec = currentPhase === AgentPhase.INVESTIGATION ? '[조사]' : '[실행]';
                            WebviewBridge.sendProcessingStatus(webviewToRespond, 'executing', `${phaseLabelExec}[단계 ${turnCount + 1}] ${ToolExecutionCoordinator.getToolLabel(toolCalls[0].name)} 실행 중...`);

                            const currentProject = ProjectManager.getInstance().getCurrentProject();
                            const workspaceRoot = currentProject?.root || '';

                            // 🔥 실시간 UI 업데이트를 위한 콜백
                            const uiMsgs: Array<{ sender: 'USER' | 'CODEPILOT' | 'System'; text: string; type?: 'action' | 'code' | 'summary' | 'message' }> = [];
                            const toolResults = await toolExecutor.executeTools(toolCalls, {
                                projectRoot: workspaceRoot,
                                workspaceRoot: workspaceRoot,
                                actionManager,
                                executionManager,
                                terminalManager,
                                contextManager: this.contextManager,
                                webview: webviewToRespond
                            }, (_toolUse, result, index) => {
                                // 🔥 각 도구 실행 완료 시 즉시 UI에 전송
                                const msgs = ToolExecutionCoordinator.sendSingleToolResultToUI(
                                    webviewToRespond,
                                    toolCalls[index],
                                    result
                                );
                                uiMsgs.push(...msgs);
                            });

                            // 기존 sendToolExecutionResultsToUI 호출 제거 (이미 실시간으로 전송됨)
                            collectedUIMessages.push(...uiMsgs);

                            // read_file 결과를 preloadedFiles에 추가
                            toolCalls.forEach((call, index) => {
                                if (call.name === Tool.READ_FILE && toolResults[index]?.success) {
                                    const filePath = call.params.path || call.params.paths?.split(',')[0];
                                    if (filePath) {
                                        preloadedFiles.add(filePath);
                                    }
                                }
                            });

                            // 파일 변경 추적
                            ToolExecutionCoordinator.trackFileChanges(toolCalls, toolResults, createdFiles, modifiedFiles);

                            // 🔥 Solution 1: 도구 실행 성공 여부 추적 (중복 수정 방지)
                            // 다음 턴에서 자연어만 오면 "완료 확인"으로 간주
                            const hasSuccessfulExecution = toolResults.some(result => result.success === true);
                            if (hasSuccessfulExecution) {
                                lastTurnHadSuccessfulToolExecution = true;
                                console.log(`[ConversationManager] Tool execution succeeded. Setting lastTurnHadSuccessfulToolExecution = true`);
                            }

                            // 결과 요약 누적
                            const resultSummary = ToolExecutionCoordinator.createToolResultSummary(turnCount, toolCalls, toolResults);
                            turnResultsSummary += resultSummary;
                            turnHasSideEffects = true;
                        } else {
                            console.log(`[ConversationManager] JSON: ${blockedCalls.length} tool(s) blocked in ${currentPhase} phase`);
                            turnResultsSummary += getPhaseToolRestrictionPrompt(currentPhase, blockedCalls.map(c => c.name));
                        }
                    }
                }
            }

            // 3. 루프 종료 조건 확인 및 턴 관리
            // ⚠️ 핵심 수정: llmResponse (원본)에서 파싱 - cleanResponse는 자연어 필터링으로 JSON이 손상될 수 있음
            const totalToolCalls = ToolParser.parseToolCalls(llmResponse, toolParseWarnings);
            const totalResponseText = this.responseProcessor.extractResponseText(llmResponse);

            // create_file content 누락 등 툴 파싱 경고를 사용자 컨텍스트에 추가
            if (toolParseWarnings.length > 0) {
                const warningText = toolParseWarnings.join('\n');
                accumulatedUserParts.push({ text: getCreateFileContentMissingPrompt(warningText) });
            }

            // 계획 수립 시에도 턴이 넘어간 것으로 간주 (단, 유효한 계획이어야 함)
            const validPlanReceived = hasPlanTag && TaskManager.getInstance().listPlanItems().length > 0;

            // [수정] 도구 호출이나 계획이 있고, 아직 남은 작업이 있다면 루프 지속
            const nextPendingItem = taskManager.getNextPendingItem();

            // 도구를 실행했다면 결과를 누적하고 다음 턴으로 진행
            if (totalToolCalls.length > 0 || validPlanReceived) {
                accumulatedUserParts.push({ text: llmResponse });
                accumulatedUserParts.push({ text: turnResultsSummary });

                // 남은 계획이 있으면 계속 진행
                if (nextPendingItem) {
                    turnCount++;
                    continue;
                } else {
                    // 조사 단계에서는 계획이 없어도 계속 진행 (조사 후 계획 수립 또는 작업 진행)
                    if (currentPhase === AgentPhase.INVESTIGATION) {
                        console.log('[ConversationManager] Investigation phase: continuing to allow plan creation or work execution.');
                        // 🔥 핵심 수정: 도구 실행 후 후속 지시 추가 (빈 응답 방지)
                        accumulatedUserParts.push({ text: getInvestigationToolResultFollowupPrompt() });
                        turnCount++;
                        continue;
                    }

                    // ⚠️ 핵심 수정: code_modify intent일 때 write tool이 없으면 완료로 판단하지 않음
                    const writeTools = [Tool.CREATE_FILE, Tool.UPDATE_FILE, Tool.REMOVE_FILE, Tool.RUN_COMMAND];
                    const hasWriteToolInHistory = createdFiles.length > 0 || modifiedFiles.length > 0 ||
                        totalToolCalls.some(call => writeTools.includes(call.name as Tool));
                    const isCodeModifyIntent = intent && intent.subtype === 'code_modify';

                    if (isCodeModifyIntent && !hasWriteToolInHistory) {
                        console.log(`[ConversationManager] EXECUTION phase: code_modify intent requires write tool, but no write tool was executed. Continuing to next turn.`);
                        accumulatedUserParts.push({ text: getCodeModifyRequiresFileToolPrompt() });
                        turnCount++;
                        continue;
                    }

                    // 실행 단계에서 도구를 실행했지만 남은 계획이 없다면 자동 테스트 후 REVIEW로 전환
                    // ✅ 핵심 수정: 계획 완료 시 파일 변경이 있으면 무조건 검증 실행
                    // isAutoTestRetryEnabled는 재시도 여부만 결정 (첫 검증은 항상 실행)
                    const hasFileChanges = createdFiles.length > 0 || modifiedFiles.length > 0;

                    if (hasFileChanges) {
                        console.log('[ConversationManager] All tasks completed after tool execution. Running automated tests before transitioning to REVIEW.');

                        // 🔥 UI 상태 업데이트: 테스트 실행 전
                        console.log(`[ConversationManager] 🔥 UI Update: webviewToRespond exists = ${!!webviewToRespond}`);
                        WebviewBridge.sendProcessingStep(webviewToRespond, 'executing');
                        WebviewBridge.sendProcessingStatus(webviewToRespond, 'executing', `[실행][단계 ${turnCount + 1}] 자동 테스트 실행 중...`);
                        console.log(`[ConversationManager] 🔥 UI Update sent: executing, 자동 테스트 실행 중`);

                        const currentProjectForTest = ProjectManager.getInstance().getCurrentProject();
                        const workspaceRootForTest = currentProjectForTest?.root || '';
                        const testResult = await TestRunner.runAutomatedTests(webviewToRespond, workspaceRootForTest, createdFiles, modifiedFiles);

                        if (testResult.success) {
                            // 테스트 통과 → REVIEW로 전환
                            console.log('[ConversationManager] Tests passed. Transitioning to REVIEW phase.');
                            // 🔥 UI 상태 업데이트: 테스트 성공
                            WebviewBridge.sendProcessingStep(webviewToRespond, 'review');
                            WebviewBridge.sendProcessingStatus(webviewToRespond, 'review', `[검토] 테스트 통과 - 결과 검토 중...`);
                            stateManager.transitionTo(AgentPhase.REVIEW);
                            turnCount++;
                            continue; // 다음 루프에서 REVIEW 처리
                        } else {
                            // 테스트 실패 시: 자동 재시도가 켜져 있을 때만 수정 시도
                            if (testFixAttempts < maxTestFixAttempts) {
                                // 🔥 문제 3 해결: 실패 패턴 추적
                                const errorMessage = testResult.errorMessage || '알 수 없는 오류';
                                const errorPattern = TestRunner.extractErrorPattern(errorMessage);
                                const isSamePattern = lastFailurePattern.pattern === errorPattern;

                                if (isSamePattern) {
                                    lastFailurePattern.count++;
                                    console.log(`[ConversationManager] 같은 실패 패턴 감지 (${lastFailurePattern.count}회): ${errorPattern}. retry 횟수 소모 안 함.`);
                                } else {
                                    lastFailurePattern.pattern = errorPattern;
                                    lastFailurePattern.count = 1;
                                }

                                // 같은 패턴이면 retry 횟수 소모 안 함
                                if (!isSamePattern || lastFailurePattern.count === 1) {
                                    // 첫 번째 실패 또는 새로운 패턴이면 retry 횟수 소모
                                    testFixAttempts++;
                                } else {
                                    // 같은 패턴이면 retry 횟수 소모 안 함 (증가시키지 않음)
                                    console.log(`[ConversationManager] 같은 실패 패턴이므로 retry 횟수 소모 안 함. 현재 횟수: ${testFixAttempts}/${maxTestFixAttempts}`);
                                }

                                console.log(`[ConversationManager] 테스트 실패 (${testFixAttempts}/${maxTestFixAttempts}). 에러 메시지를 컨텍스트에 추가하고 계속 진행합니다.`);
                                // 🔥 UI 상태 업데이트: 테스트 실패 후 재시도
                                WebviewBridge.sendProcessingStep(webviewToRespond, 'executing');
                                WebviewBridge.sendProcessingStatus(webviewToRespond, 'executing', `테스트 실패 - 자동 수정 중 (${testFixAttempts}/${maxTestFixAttempts})...`);
                                accumulatedUserParts.push({
                                    text: getErrorRetryPrompt(errorMessage)
                                });
                                turnCount++;
                                continue;
                            } else {
                                console.log(`[ConversationManager] 테스트 수정 시도 횟수 초과 (${maxTestFixAttempts}회). REVIEW로 전환합니다.`);
                                // 🔥 UI 상태 업데이트: 테스트 실패 후 검토로 전환
                                WebviewBridge.sendProcessingStep(webviewToRespond, 'review');
                                WebviewBridge.sendProcessingStatus(webviewToRespond, 'review', `[검토] 테스트 실패 - 결과 검토 중...`);
                                WebviewBridge.receiveMessage(webviewToRespond, 'System', `⚠️ 테스트 수정 시도 횟수 초과 (${maxTestFixAttempts}회). 최종 오류:\n${testResult.errorMessage || '알 수 없는 오류'}`);
                                // 실패해도 REVIEW로 전환하여 요약 생성
                                stateManager.transitionTo(AgentPhase.REVIEW);
                                turnCount++;
                                continue;
                            }
                        }
                    } else {
                        // 파일 변경이 없는 경우
                        // ⚠️ execution_run intent일 때는 run_command가 실행될 때까지 계속 진행
                        const isExecutionRunIntent = intent && intent.subtype === 'execution_run';
                        const hasRunCommandInHistory = totalToolCalls.some(call => call.name === Tool.RUN_COMMAND);

                        if (isExecutionRunIntent && !hasRunCommandInHistory) {
                            console.log('[ConversationManager] EXECUTION phase: execution_run intent requires run_command, but no run_command was executed. Continuing to next turn.');
                            // 🔥 UI 상태 업데이트: 명령 실행 대기 중
                            WebviewBridge.sendProcessingStep(webviewToRespond, 'executing');
                            WebviewBridge.sendProcessingStatus(webviewToRespond, 'executing', `[실행] 명령 실행 준비 중...`);
                            accumulatedUserParts.push({
                                text: `\n[System] ⚠️ 명령 실행이 필요합니다.\n\n` +
                                    `사용자가 명령 실행을 요청했습니다. run_command 도구를 사용하여 적절한 명령을 실행하세요.\n` +
                                    `프로젝트 구조를 파악했다면, 이제 실제 명령을 실행하세요.`
                            });
                            turnCount++;
                            continue;
                        }

                        // 그 외의 경우 바로 REVIEW로 전환
                        console.log('[ConversationManager] All tasks completed. No file changes detected. Transitioning to REVIEW phase.');
                        // 🔥 UI 상태 업데이트: 파일 변경 없이 검토로 전환
                        WebviewBridge.sendProcessingStep(webviewToRespond, 'review');
                        WebviewBridge.sendProcessingStatus(webviewToRespond, 'review', `[검토] 작업 완료 - 결과 검토 중...`);
                        stateManager.transitionTo(AgentPhase.REVIEW);
                        turnCount++;
                        continue;
                    }
                }
            }

            // INVESTIGATION 단계에서 도구 호출도 없고 plan도 없으면 텍스트 출력 차단
            // 단, 의도가 없거나 단순 인사인 경우는 허용
            // ⚠️ 핵심 수정: analysis intent이고 조사가 완료된 경우, 자연어 답변 허용
            // 🔥 최적화: investigation_done 토큰이 있고 ripgrep_search 결과가 있으면 텍스트 차단을 건너뛰고 바로 자동 답변 생성
            if (currentPhase === AgentPhase.INVESTIGATION && totalToolCalls.length === 0 && !validPlanReceived && totalResponseText.trim()) {
                // investigation_done 토큰이 있고 ripgrep_search 결과가 있으면 텍스트 차단을 건너뛰고 자동 답변 생성 로직으로 넘어감
                const isTextAllowedIntentForSkip = intent && (intent.category === 'analysis' || intent.category === 'documentation');
                if (investigationDoneToken && isTextAllowedIntentForSkip) {
                    let hasRipgrepResults = false;
                    for (const part of accumulatedUserParts) {
                        if (part.text && part.text.includes('**검색 결과 (이미 검색함)**')) {
                            hasRipgrepResults = true;
                            break;
                        }
                    }
                    if (hasRipgrepResults) {
                        console.log('[ConversationManager] INVESTIGATION phase: investigation_done + ripgrep_search results found. Skipping text blocking, will generate auto-answer.');
                        // 텍스트 차단을 건너뛰고 자동 답변 생성 로직으로 넘어감
                    } else {
                        // ripgrep_search 결과가 없으면 기존 로직 계속
                    }
                }

                // 의도가 없거나 단순 인사인 경우 텍스트 응답 허용하고 종료
                if (hasNoIntent) {
                    console.log('[ConversationManager] INVESTIGATION phase: No intent detected, allowing text-only response and terminating.');
                    // ✅ Phase gate: hasNoIntent인 경우는 DONE으로 전환 후 텍스트 전송 (🔥 스트리밍)
                    stateManager.transitionTo(AgentPhase.DONE);
                    if (shouldSendCodePilotText(AgentPhase.DONE)) {
                        await WebviewBridge.streamText(webviewToRespond, 'CODEPILOT', totalResponseText);
                    }
                    return; // 즉시 종료
                }

                // ⚠️ 핵심 수정: analysis/documentation intent이고 조사가 완료된 경우, 자연어 답변 허용
                // 🔥 중복 방지: investigation_done 토큰이 있으면 위의 블록에서 이미 처리되므로 여기서는 처리하지 않음
                // 🔥 추가 중복 방지: ripgrep_search 결과가 있으면 자동 답변 생성 로직에서 처리되므로 여기서는 처리하지 않음
                // 🔥 수정: JSON plan이 있는 경우는 텍스트 응답으로 처리하지 않음
                const isTextAllowedIntentForHistory = intent && (intent.category === 'analysis' || intent.category === 'documentation');
                if (isTextAllowedIntentForHistory && hasInvestigationHistory && !investigationDoneToken && !hasPlanTag && !hasJsonPlanInResponse) {
                    // ripgrep_search 결과가 있는지 확인
                    let hasRipgrepResults = false;
                    for (const part of accumulatedUserParts) {
                        if (part.text && part.text.includes('**검색 결과 (이미 검색함)**')) {
                            hasRipgrepResults = true;
                            break;
                        }
                    }

                    // ripgrep_search 결과가 있으면 자동 답변 생성 로직(2732 라인)에서 처리되므로 여기서는 처리하지 않음
                    if (hasRipgrepResults) {
                        console.log('[ConversationManager] INVESTIGATION phase: ripgrep_search results found. Will be handled by auto-answer generation logic.');
                        // 자동 답변 생성 로직으로 넘어가도록 continue하지 않고 계속 진행
                    } else {
                        // ripgrep_search 결과가 없고 LLM이 직접 답변을 생성한 경우만 처리
                        console.log('[ConversationManager] INVESTIGATION phase: Analysis intent with completed investigation. Allowing text-only response.');
                        // 응답 정제: thinking 태그 제거
                        let cleanResponse = StringUtils.cleanText(totalResponseText, {
                            removeThinking: true,
                            removeNaturalLanguage: true, // thinking 노출 방지
                            removeSystemMessages: false,
                            removeToolTags: false,
                            removeJsonThinking: true,
                            extractJson: false
                        });

                        if (cleanResponse && cleanResponse.length > AgentConfig.MIN_RESPONSE_LENGTH) {
                            // 🔥 스트리밍 효과로 전송 ('Assistant' → 'CODEPILOT')
                            await WebviewBridge.streamText(webviewToRespond, 'CODEPILOT', cleanResponse);
                            // DONE으로 전환
                            stateManager.transitionTo(AgentPhase.DONE, {});
                            console.log('[ConversationManager] Analysis response sent. Transitioning to DONE.');
                            break;
                        }
                    }
                }

                // 🔥 핵심 수정: 파일이 이미 생성/수정되었다면 완료로 간주하고 REVIEW 전환
                if (createdFiles.length > 0 || modifiedFiles.length > 0) {
                    console.log(`[ConversationManager] INVESTIGATION phase: Files already modified (created: ${createdFiles.length}, modified: ${modifiedFiles.length}). Transitioning to REVIEW.`);
                    stateManager.transitionTo(AgentPhase.REVIEW);
                    // 다음 턴에서 REVIEW 로직 실행
                    turnCount++;
                    continue;
                }

                // 🔥 핵심 수정: analysis/documentation 의도(질문, 설명, 요약 요청)일 때는 텍스트 응답 허용
                // 예: "터미널 내용 알려줘", "파일 내용 설명해줘", "@Terminal 뭐라고 나왔어?", "읽고 요약해줘"
                // 길이 체크 제거 - 응답 존재 여부만 확인 (다른 코드 어시스턴트처럼)
                // 🔥 수정: JSON plan이 있는 경우는 텍스트 응답으로 처리하지 않음
                const isTextAllowedIntent = intent && (intent.category === 'analysis' || intent.category === 'documentation');
                if (isTextAllowedIntent && totalResponseText && totalResponseText.trim() && !hasPlanTag && !hasJsonPlanInResponse) {
                    console.log(`[ConversationManager] INVESTIGATION phase: ${intent.category} intent detected, allowing text response.`);
                    // 응답 정제: thinking 태그 제거
                    let cleanResponse = StringUtils.cleanText(totalResponseText, {
                        removeThinking: true,
                        removeNaturalLanguage: false, // analysis 응답은 자연어 허용
                        removeSystemMessages: false,
                        removeToolTags: false,
                        removeJsonThinking: true,
                        extractJson: false
                    });

                    if (cleanResponse && cleanResponse.trim()) {
                        await WebviewBridge.streamText(webviewToRespond, 'CODEPILOT', cleanResponse);
                        stateManager.transitionTo(AgentPhase.DONE, {});
                        console.log('[ConversationManager] Analysis text response sent. Transitioning to DONE.');
                        break;
                    }
                }

                investigationTextOnlyCount++;
                console.log(`[ConversationManager] INVESTIGATION phase: No tools/plan but text received (count: ${investigationTextOnlyCount}). Blocking text-only output.`);

                // 텍스트만 출력하는 것을 차단하고 강력한 안내 메시지 제공
                accumulatedUserParts.push({ text: getInvestigationTextOnlyWarningPrompt() });
                turnCount++;
                continue;
            }

            // ⚠️ 핵심 수정: analysis intent이고 investigation_done 토큰이 있으면, 빈 응답이어도 analysis 답변 생성 후 종료
            // (analysis 답변 생성 로직은 INVESTIGATION phase 처리 블록에서 실행됨)
            // 🔥 디버깅: 조건 확인
            if (investigationDoneToken) {
                console.log(`[ConversationManager] Debug: investigationDoneToken=true, intent=${intent?.category}, currentPhase=${currentPhase}`);
            }
            const isTextAllowedIntentForDone = intent && (intent.category === 'analysis' || intent.category === 'documentation');
            if (investigationDoneToken && isTextAllowedIntentForDone && currentPhase === AgentPhase.INVESTIGATION) {
                console.log(`[ConversationManager] ${intent.category} intent with investigation_done token detected. Will generate answer in INVESTIGATION phase block.`);
                // 빈 응답 체크를 건너뛰고 계속 진행 (INVESTIGATION phase 블록에서 답변 생성)
            } else if (!totalResponseText || !totalResponseText.trim()) {
                // 도구 호출도 없고 유효한 계획도 없는 경우
                // 🔥 추가: investigation_done 토큰이 있으면 analysis/documentation 답변 생성 시도
                if (investigationDoneToken && isTextAllowedIntentForDone && currentPhase === AgentPhase.INVESTIGATION) {
                    console.log(`[ConversationManager] Empty response but investigation_done token found for ${intent.category} intent. Will generate answer in INVESTIGATION phase block.`);
                    // 빈 응답 체크를 건너뛰고 계속 진행
                } else if (currentPhase === AgentPhase.EXECUTION && currentPlanItem) {
                    // ✅ 핵심 수정: EXECUTION phase로 전환된 직후 루프에서는 빈 응답 체크를 건너뛰어야 함
                    // 이 시점에는 아직 LLM을 호출하지 않았기 때문에 totalResponseText가 비어있을 수 있음
                    console.log('[ConversationManager] EXECUTION phase with pending plan item. Skipping empty response check, will execute plan item.');
                    // 빈 응답 체크를 건너뛰고 계속 진행
                } else {
                    // 도구 호출도 없고 유효한 계획도 없는 경우 종료 로직
                    if (investigationDoneToken) {
                        console.log(`[ConversationManager] Debug: investigationDoneToken=true but conditions not met. intent=${intent?.category}, currentPhase=${currentPhase}`);
                    }
                    console.log('[ConversationManager] Empty response or invalid plan, ending loop');
                    break;
                }
            }

            const currentPlanItemsAll = taskManager.listPlanItems();
            const remaining = currentPlanItemsAll.filter(i => i.status === 'pending' || i.status === 'in_progress');

            // EXECUTION phase에서 도구 호출 없이 텍스트만 출력한 경우, plan item 완료 처리
            // (요약은 REVIEW 단계에서 시스템이 생성)
            if (currentPhase === AgentPhase.EXECUTION && totalToolCalls.length === 0 && totalResponseText.trim()) {
                console.log('[ConversationManager] EXECUTION phase: No tool calls but text received. Marking plan item as done.');

                // 현재 plan item이 있으면 완료 처리
                if (currentPlanItem) {
                    taskManager.updatePlanItemStatus(currentPlanItem.id, 'done');
                    WebviewBridge.updateTaskQueue(webviewToRespond, taskManager.listPlanItems());
                }

                // 다음 계획 항목이 있으면 계속, 없으면 EXECUTION 완료 → REVIEW로 전환
                const nextItem = taskManager.getNextPendingItem();
                if (nextItem) {
                    turnCount++;
                    continue;
                } else {
                    // ✅ 핵심 수정: 계획 완료 시 파일 변경이 있으면 무조건 검증 실행
                    // isAutoTestRetryEnabled는 재시도 여부만 결정 (첫 검증은 항상 실행)
                    const hasFileChanges = createdFiles.length > 0 || modifiedFiles.length > 0;

                    if (hasFileChanges) {
                        // 모든 plan item 완료 → 자동 테스트 실행
                        console.log('[ConversationManager] All plan items completed. Running automated tests before transitioning to REVIEW.');
                        const currentProject = ProjectManager.getInstance().getCurrentProject();
                        const workspaceRoot = currentProject?.root || '';
                        const testResult = await this.runAutomatedTests(webviewToRespond, workspaceRoot, createdFiles, modifiedFiles);

                        if (testResult.success) {
                            // 테스트 통과 → REVIEW로 전환
                            console.log('[ConversationManager] Tests passed. Transitioning to REVIEW phase.');
                            stateManager.transitionTo(AgentPhase.REVIEW);
                            turnCount++;
                            continue; // 다음 루프에서 REVIEW 처리
                        } else {
                            // 테스트 실패 시: 자동 재시도가 켜져 있을 때만 수정 시도
                            if (isAutoTestRetryEnabled && testFixAttempts < maxTestFixAttempts) {
                                // 오류 메시지를 LLM에 전달하여 LLM이 스스로 판단하도록 함
                                // 🔥 문제 2 해결: 에러 메시지 분석 프롬프트 강화
                                const errorMessage = testResult.errorMessage || '알 수 없는 오류';

                                // 🔥 문제 3 해결: 실패 패턴 추적 및 같은 패턴이면 retry 횟수 소모 안 함
                                const errorPattern = TestRunner.extractErrorPattern(errorMessage);
                                const isSamePattern = lastFailurePattern.pattern === errorPattern;

                                if (isSamePattern) {
                                    lastFailurePattern.count++;
                                    console.log(`[ConversationManager] 같은 실패 패턴 감지 (${lastFailurePattern.count}회): ${errorPattern}. retry 횟수 소모 안 함.`);
                                } else {
                                    lastFailurePattern.pattern = errorPattern;
                                    lastFailurePattern.count = 1;
                                }

                                // 같은 패턴이면 retry 횟수 소모 안 함 (문제 3 해결)
                                if (!isSamePattern || lastFailurePattern.count === 1) {
                                    // 첫 번째 실패 또는 새로운 패턴이면 retry 횟수 소모
                                    testFixAttempts++;
                                } else {
                                    // 같은 패턴이면 retry 횟수 소모 안 함 (증가시키지 않음)
                                    console.log(`[ConversationManager] 같은 실패 패턴이므로 retry 횟수 소모 안 함. 현재 횟수: ${testFixAttempts}/${maxTestFixAttempts}`);
                                }

                                console.log(`[ConversationManager] 테스트 실패 (${testFixAttempts}/${maxTestFixAttempts}). 에러 메시지를 컨텍스트에 추가하고 계속 진행합니다.`);

                                accumulatedUserParts.push({
                                    text: getErrorRetryPrompt(errorMessage)
                                });
                                turnCount++;
                                continue; // EXECUTION 단계 유지하여 수정 시도
                            } else {
                                console.log(`[ConversationManager] 테스트 수정 시도 횟수 초과 (${maxTestFixAttempts}회). REVIEW로 전환합니다.`);
                                WebviewBridge.receiveMessage(webviewToRespond, 'System', `⚠️ 테스트 수정 시도 횟수 초과 (${maxTestFixAttempts}회). 최종 오류:\n${testResult.errorMessage || '알 수 없는 오류'}`);
                                // 실패해도 REVIEW로 전환하여 요약 생성
                                stateManager.transitionTo(AgentPhase.REVIEW);
                                turnCount++;
                                continue;
                            }
                        }
                    } else {
                        // 파일 변경이 없으면 바로 REVIEW로 전환
                        console.log('[ConversationManager] All plan items completed. No file changes detected. Transitioning to REVIEW phase.');
                        stateManager.transitionTo(AgentPhase.REVIEW);
                        turnCount++;
                        continue;
                    }
                }
            }

            // [수정] 모델이 행동 없이 설명만 하는 경우, 재촉(Nudge) 수행
            // INVESTIGATION 단계에서는 더 관대하게 처리 (여러 번 nudge 가능)
            const isCodeIntent = intent?.category === 'code' || intent?.taskType === 'code_work' || intent?.taskType === 'command';
            const shouldNudge = totalResponseText.trim() && isCodeIntent && totalToolCalls.length === 0;

            if (shouldNudge) {
                // INVESTIGATION 단계에서는 최대 MAX_NUDGE_COUNT회까지 nudge 허용
                const maxNudges = currentPhase === AgentPhase.INVESTIGATION ? AgentConfig.MAX_NUDGE_COUNT : AgentConfig.MAX_NUDGE_COUNT_EXECUTION;
                const nudgeCount = turnCount; // 간단한 추적 (실제로는 별도 카운터가 필요할 수 있음)

                if (currentPhase === AgentPhase.INVESTIGATION || turnCount === 0) {
                    if (currentPhase === AgentPhase.INVESTIGATION || nudgeCount < maxNudges) {
                        console.log(`[ConversationManager] Action missing, providing nudge (turn ${turnCount + 1}).`);
                        accumulatedUserParts.push({ text: llmResponse });

                        const nudgeText = currentPhase === AgentPhase.INVESTIGATION
                            ? getInvestigationNudgePrompt()
                            : getExecutionNudgePrompt();

                        accumulatedUserParts.push({ text: nudgeText });
                        turnCount++;
                        continue;
                    }
                }
            }

            // 🔥 문제 해결: analysis intent이고 (investigation_done 토큰이 있거나 ripgrep_search 결과가 있으면) 여기서 바로 답변 생성
            // ripgrep_search 결과 확인
            let hasRipgrepResultsForAutoAnswer = false;
            for (const part of accumulatedUserParts) {
                if (part.text && part.text.includes('**검색 결과 (이미 검색함)**')) {
                    hasRipgrepResultsForAutoAnswer = true;
                    break;
                }
            }

            const isTextAllowedIntentForAutoAnswer = intent && (intent.category === 'analysis' || intent.category === 'documentation');
            if ((investigationDoneToken || hasRipgrepResultsForAutoAnswer) && isTextAllowedIntentForAutoAnswer && currentPhase === AgentPhase.INVESTIGATION) {
                if (investigationDoneToken) {
                    console.log(`[ConversationManager] ${intent.category} intent with investigation_done token detected. Checking for existing search results...`);
                } else {
                    console.log(`[ConversationManager] ${intent.category} intent with ripgrep_search results detected. Checking for existing search results...`);
                }

                // 🔥 최적화: ripgrep_search 결과가 이미 있으면 LLM 호출 없이 직접 답변 생성
                let hasRipgrepResults = false;
                let ripgrepResults: any = null;
                let ripgrepPattern = '';

                // accumulatedUserParts에서 ripgrep_search 결과 찾기
                for (const part of accumulatedUserParts) {
                    if (part.text && part.text.includes('**검색 결과 (이미 검색함)**')) {
                        // JSON 결과 추출
                        const jsonMatch = part.text.match(/```json\n([\s\S]*?)\n```/);
                        if (jsonMatch) {
                            try {
                                ripgrepResults = JSON.parse(jsonMatch[1]);
                                // 패턴 추출
                                const patternMatch = part.text.match(/\*\*검색 결과 \(이미 검색함\)\*\*: (.+?)\n/);
                                if (patternMatch) {
                                    ripgrepPattern = patternMatch[1];
                                }
                                hasRipgrepResults = true;
                                console.log(`[ConversationManager] Found existing ripgrep_search results for pattern: ${ripgrepPattern}`);
                                break;
                            } catch (e) {
                                console.warn('[ConversationManager] Failed to parse ripgrep_search results from accumulatedUserParts:', e);
                            }
                        }
                    }
                }

                let cleanAnalysisResponse: string;

                if (hasRipgrepResults && ripgrepResults) {
                    // 🔥 LLM 호출 없이 검색 결과를 직접 파싱하여 답변 생성
                    console.log('[ConversationManager] Using existing ripgrep_search results to generate answer without LLM call.');
                    console.log('[ConversationManager] Debug: ripgrepResults type:', Array.isArray(ripgrepResults) ? 'array' : typeof ripgrepResults);
                    console.log('[ConversationManager] Debug: ripgrepResults length:', Array.isArray(ripgrepResults) ? ripgrepResults.length : 'N/A');
                    if (Array.isArray(ripgrepResults) && ripgrepResults.length > 0) {
                        console.log('[ConversationManager] Debug: ripgrepResults[0]:', JSON.stringify(ripgrepResults[0], null, 2).substring(0, AgentConfig.MAX_LOG_PREVIEW_LENGTH));
                    }

                    // 검색 결과에서 함수 위치 추출 (SearchResult[] 형식)
                    const results: string[] = [];
                    if (Array.isArray(ripgrepResults)) {
                        for (const searchResult of ripgrepResults) {
                            if (searchResult && searchResult.file && searchResult.matches && Array.isArray(searchResult.matches)) {
                                const fileName = searchResult.file.split(/[/\\]/).pop() || searchResult.file;
                                // 첫 번째 매칭 결과의 라인 번호 사용
                                if (searchResult.matches.length > 0 && searchResult.matches[0] && searchResult.matches[0].line) {
                                    results.push(`${fileName} 파일의 ${searchResult.matches[0].line}번째 줄`);
                                }
                            }
                        }
                    }

                    if (results.length > 0) {
                        // 함수명 추출: 사용자 쿼리에서 추출한 함수명 우선, 없으면 패턴에서 추출
                        let functionName: string = extractedFunctionName || '';
                        if (!functionName) {
                            // 패턴에서 마지막 함수명 추출 (패턴 끝부분의 함수명)
                            // 예: (?:function|const|let|var|export\s+(?:function|const|let|var)|export\s+default\s+function)\s+handleSearch\b
                            // → handleSearch 추출
                            const functionNameMatch = ripgrepPattern.match(/\\(\w+)\\b$/);
                            if (functionNameMatch) {
                                functionName = functionNameMatch[1];
                            } else {
                                // 대안: 패턴에서 \s+ 다음의 단어 추출 (마지막 매칭)
                                const altMatch = ripgrepPattern.match(/\\s\+(\w+)\\b/);
                                if (altMatch) {
                                    functionName = altMatch[1];
                                } else {
                                    // 최후의 수단: 패턴에서 마지막 단어 추출
                                    const words = ripgrepPattern.split(/\\s\+/);
                                    if (words.length > 0) {
                                        const lastWord = words[words.length - 1].replace(/\\b$/, '');
                                        if (lastWord && lastWord.length > 0 && !lastWord.includes('\\')) {
                                            functionName = lastWord;
                                        }
                                    }
                                }
                            }
                        }
                        if (!functionName) {
                            functionName = '함수';
                        }

                        cleanAnalysisResponse = `${functionName} 함수는 ${results.join(', ')}에 정의되어 있습니다.`;
                        console.log(`[ConversationManager] Generated answer from ripgrep results: ${cleanAnalysisResponse}`);
                    } else {
                        console.warn('[ConversationManager] Failed to extract results from ripgrep_search data. ripgrepResults:', JSON.stringify(ripgrepResults, null, 2).substring(0, 1000));
                        cleanAnalysisResponse = '검색 결과를 찾을 수 없습니다.';
                    }
                } else {
                    // 기존 로직: LLM 호출하여 답변 생성
                    console.log('[ConversationManager] No existing ripgrep_search results found. Calling LLM to generate answer.');

                    const analysisPrompt = systemPrompt + getGeneralAnalysisPrompt();

                    // 스트리밍 설정 확인
                    const isStreamingEnabledForAnalysis = options.extensionContext
                        ? await SettingsManager.getInstance(options.extensionContext).isStreamingEnabled()
                        : false;

                    let analysisResponse: string;

                    if (isStreamingEnabledForAnalysis) {
                        // 스트리밍 모드: 분석 응답 실시간 전송
                        console.log('[ConversationManager] Streaming mode enabled for analysis response');
                        WebviewBridge.startStreamingMessage(webviewToRespond, 'assistant');

                        const onAnalysisChunk = (chunk: string, done: boolean) => {
                            if (chunk) {
                                WebviewBridge.streamMessageChunk(webviewToRespond, chunk);
                            }
                            if (done) {
                                WebviewBridge.endStreamingMessage(webviewToRespond);
                            }
                        };

                        analysisResponse = await this.llmManager.sendMessageWithSystemPromptStreaming(
                            analysisPrompt,
                            accumulatedUserParts,
                            onAnalysisChunk,
                            { signal: abortSignal }
                        );

                        // 스트리밍 완료 후 바로 종료 (정제 필요 없음 - 이미 출력됨)
                        stateManager.transitionTo(AgentPhase.DONE);
                        break;
                    }

                    // 비스트리밍 모드
                    analysisResponse = await this.llmManager.sendMessageWithSystemPrompt(
                        analysisPrompt,
                        accumulatedUserParts,
                        { signal: abortSignal }
                    );

                    // 응답 정제: thinking 태그 및 JSON 래핑 제거
                    cleanAnalysisResponse = StringUtils.cleanText(analysisResponse, {
                        removeThinking: true,
                        removeNaturalLanguage: false,
                        removeSystemMessages: false,
                        removeToolTags: true,
                        removeJsonThinking: true,
                        extractJson: true
                    });

                    // JSON 래핑이 있는 경우 파싱
                    try {
                        const jsonMatch = cleanAnalysisResponse.match(/^\{[\s\S]*\}$/);
                        if (jsonMatch) {
                            const parsed = JSON.parse(cleanAnalysisResponse);
                            if (parsed.response) {
                                cleanAnalysisResponse = parsed.response;
                            }
                        }
                    } catch (e) {
                        // JSON 파싱 실패 시 원본 사용
                    }

                    // 응답이 비어있거나 너무 짧은 경우 기본 메시지
                    if (!cleanAnalysisResponse || cleanAnalysisResponse.length < AgentConfig.MIN_RESPONSE_LENGTH) {
                        cleanAnalysisResponse = '조사 결과를 바탕으로 답변을 생성할 수 없습니다.';
                    }
                }

                console.log(`[ConversationManager] Sending analysis response to webview (length: ${cleanAnalysisResponse.length}): ${cleanAnalysisResponse.substring(0, AgentConfig.MIN_ANALYSIS_RESPONSE_LENGTH)}...`);
                // 🔥 스트리밍 효과로 전송
                await WebviewBridge.streamText(webviewToRespond, 'CODEPILOT', cleanAnalysisResponse);

                // DONE으로 전환
                stateManager.transitionTo(AgentPhase.DONE, {});
                console.log('[ConversationManager] Analysis response sent. Transitioning to DONE.');
                break;
            } else if (currentPlanItemsAll.length > 0 && remaining.length > 0) {
                console.log(`[ConversationManager] Tools missing while plan remains. Ending loop.`);
            } else {
                console.log(`[ConversationManager] No tools/plan in response. Ending loop.`);
                // [추가] 아무런 작업도 수행하지 않고 루프가 종료된 경우 사용자에게 안내
                if (turnCount === 0) {
                    WebviewBridge.receiveMessage(webviewToRespond, 'System', '⚠️ 에이전트가 생각만 하고 실제 도구를 호출하지 않았습니다. 모델을 바꾸거나 다시 시도해 보세요.');
                }

                // EXECUTION phase에서 파일이 생성/수정되었으면 REVIEW로 전환
                if (currentPhase === AgentPhase.EXECUTION && (createdFiles.length > 0 || modifiedFiles.length > 0)) {
                    console.log('[ConversationManager] EXECUTION phase completed with file changes. Transitioning to REVIEW.');
                    stateManager.transitionTo(AgentPhase.REVIEW);
                    turnCount++;
                    continue; // 다음 루프에서 REVIEW 처리
                }
            }

            // ✅ 핵심 수정: 루프 종료 전 자동 테스트 실행 (파일이 생성/수정된 경우)
            // 파일 변경이 있고, 아직 REVIEW로 전환되지 않았고, 계획이 완료되었으면 검증 실행
            // isAutoTestRetryEnabled는 재시도 여부만 결정 (첫 검증은 항상 실행)
            const hasFileChanges = createdFiles.length > 0 || modifiedFiles.length > 0;
            const allPlanItemsCompleted = taskManager.getNextPendingItem() === null;

            if (hasFileChanges && stateManager.getCurrentState() !== AgentPhase.REVIEW && allPlanItemsCompleted) {
                console.log('[ConversationManager] Plan completed with file changes. Running automated tests before transitioning to REVIEW.');
                const currentProject = ProjectManager.getInstance().getCurrentProject();
                const workspaceRoot = currentProject?.root || '';
                const testResult = await this.runAutomatedTests(webviewToRespond, workspaceRoot, createdFiles, modifiedFiles);

                if (testResult.success) {
                    // 테스트 통과 → REVIEW로 전환
                    console.log('[ConversationManager] Tests passed. Transitioning to REVIEW phase.');
                    stateManager.transitionTo(AgentPhase.REVIEW);
                    turnCount++;
                    continue; // 다음 루프에서 REVIEW 처리
                } else {
                    // 테스트 실패 시: 자동 재시도가 켜져 있을 때만 수정 시도
                    if (isAutoTestRetryEnabled && testFixAttempts < maxTestFixAttempts) {
                        testFixAttempts++;
                        console.log(`[ConversationManager] 테스트 실패 (${testFixAttempts}/${maxTestFixAttempts}). 에러 메시지를 컨텍스트에 추가하고 계속 진행합니다.`);

                        // 오류 메시지를 LLM에 전달하여 LLM이 스스로 판단하도록 함
                        const errorMessage = testResult.errorMessage || '알 수 없는 오류';
                        accumulatedUserParts.push({ text: getSimpleTestFailurePrompt(errorMessage) });
                        turnCount++;
                        continue; // break 대신 continue
                    } else {
                        if (isAutoTestRetryEnabled) {
                            console.log(`[ConversationManager] 테스트 수정 시도 횟수 초과 (${maxTestFixAttempts}회). REVIEW로 전환합니다.`);
                            WebviewBridge.receiveMessage(webviewToRespond, 'System', `⚠️ 테스트 수정 시도 횟수 초과 (${maxTestFixAttempts}회). 최종 오류:\n${testResult.errorMessage || '알 수 없는 오류'}`);
                        } else {
                            console.log(`[ConversationManager] 자동 테스트 재시도가 비활성화되어 있습니다. REVIEW로 전환합니다.`);
                            WebviewBridge.receiveMessage(webviewToRespond, 'System', `⚠️ 자동 테스트가 실패했습니다:\n${testResult.errorMessage || '알 수 없는 오류'}\n`);
                        }
                        // 실패해도 REVIEW로 전환하여 요약 생성
                        stateManager.transitionTo(AgentPhase.REVIEW);
                        turnCount++;
                        continue;
                    }
                }
            }

            break;
        }

        if (turnCount >= maxTurns) {
            WebviewBridge.updateProcessingStatus(webviewToRespond, '최대 턴 수 도달로 중단되었습니다.', 'error');
        } else {
            // [수정] 루프가 정상 종료되었는데 아직 'in_progress' 또는 'pending'인 항목이 있다면 'done'으로 처리 (에이전트가 완료했다고 판단한 경우)
            const allItems = taskManager.listPlanItems();
            const unfinishedItems = allItems.filter(item => item.status === 'in_progress' || item.status === 'pending');

            if (unfinishedItems.length > 0) {
                console.log(`[ConversationManager] Marking ${unfinishedItems.length} remaining items as done`);
                unfinishedItems.forEach(item => {
                    taskManager.updatePlanItemStatus(item.id, 'done');
                });
                WebviewBridge.updateTaskQueue(webviewToRespond, taskManager.listPlanItems());
            }
            WebviewBridge.sendProcessingStatus(webviewToRespond, 'done', '모든 작업이 완료되었습니다.');
        }
    }

    /**
     * 일반 질의응답 처리
     */
    private async handleGeneralAsk(systemPrompt: string, userParts: any[], options: ConversationOptions): Promise<void> {
        // 스트리밍 설정 확인
        const isStreamingEnabled = options.extensionContext
            ? await SettingsManager.getInstance(options.extensionContext).isStreamingEnabled()
            : false;

        let response: string;

        if (isStreamingEnabled) {
            // 스트리밍 모드: ASK 응답 실시간 전송
            console.log('[ConversationManager] Streaming mode enabled for ASK response');
            WebviewBridge.startStreamingMessage(options.webviewToRespond, 'assistant');

            const onAskChunk = (chunk: string, done: boolean) => {
                if (chunk) {
                    WebviewBridge.streamMessageChunk(options.webviewToRespond, chunk);
                }
                if (done) {
                    WebviewBridge.endStreamingMessage(options.webviewToRespond);
                }
            };

            response = await this.llmManager.sendMessageWithSystemPromptStreaming(
                systemPrompt,
                userParts,
                onAskChunk,
                { signal: options.abortSignal }
            );
        } else {
            // 비스트리밍 모드: 기존 방식 (🔥 스트리밍 효과 추가)
            response = await this.llmManager.sendMessageWithSystemPrompt(systemPrompt, userParts, { signal: options.abortSignal });
            await WebviewBridge.streamText(options.webviewToRespond, 'CODEPILOT', response);
        }

        // 📝 구조화된 메타데이터로 세션에 저장 (ASK 모드)
        if (options.extensionContext && response) {
            const { SessionManager } = await import('../state/SessionManager');
            const sessionManager = SessionManager.getInstance(options.extensionContext);
            const currentSession = sessionManager.getCurrentSession();

            if (currentSession) {
                // 원본 사용자 요청 추출 (userParts에서)
                const userRequest = userParts
                    .filter(p => p.text && p.text.startsWith('[User]:'))
                    .map(p => p.text.replace('[User]: ', ''))
                    .pop() || options.userQuery || '';

                sessionManager.addConversationEntry(currentSession.id, {
                    id: `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    timestamp: Date.now(),
                    userRequest: userRequest,
                    assistantResponse: response, // ASK 모드는 전체 응답 저장
                    actions: [], // ASK 모드는 도구 사용 안 함
                    result: 'success',
                    model: options.currentModelType
                });
            }

            // ASK 모드 사용 토큰 계산 및 누적
            let askTokens = estimateTokens(systemPrompt);
            userParts.forEach(part => {
                if (part.text) askTokens += estimateTokens(part.text);
            });
            if (response) askTokens += estimateTokens(response);
            sessionManager.addTokensUsed(askTokens);

            // 세션 누적 컨텍스트 정보 업데이트
            const currentModelType = options.currentModelType || AiModelType.OLLAMA;
            const modelLimits = MODEL_TOKEN_LIMITS[currentModelType] || MODEL_TOKEN_LIMITS[AiModelType.OLLAMA];
            const maxTokens = modelLimits?.maxInputTokens || 128000;

            const cumulativeStats = sessionManager.getCumulativeSessionStats();
            WebviewBridge.updateContextInfo(options.webviewToRespond, {
                messageCount: cumulativeStats.messageCount,
                tokenUsage: {
                    current: cumulativeStats.totalTokensUsed,
                    max: maxTokens,
                    percentage: (cumulativeStats.totalTokensUsed / maxTokens) * 100
                }
            });

            // 세션 히스토리 자동 압축 (LLM 요약 포함)
            try {
                // ConversationCompactor를 SessionManager에 주입 (lazy injection)
                const compactor = ConversationCompactor.getInstance(this.llmManager);
                // StateManager 설정 (compactorModel 사용을 위해)
                if (options.extensionContext) {
                    compactor.setStateManager(StateManager.getInstance(options.extensionContext));
                }
                sessionManager.setCompactor(compactor);

                // 토큰 임계값 확인 후 자동 압축
                await sessionManager.compactSessionIfNeeded(maxTokens);
            } catch (e) {
                console.warn('[ConversationManager] Failed to compact session history (ASK mode):', e);
            }
        }
    }

    /**
     * 텍스트에서 파일 경로 추출 (단순화된 정규식)
     * Smart Skip 로직 및 Investigation phase에서 사용
     * 
     * @param text 추출할 텍스트
     * @returns 추출된 파일 경로 배열 (중복 제거됨)
     */
    /**
     * 에러 메시지에서 실패 패턴을 추출합니다 (문제 3 해결: 같은 패턴이면 retry 횟수 소모 안 함)
     * @param errorMessage 에러 메시지
     * @returns 에러 패턴 (예: "typescript_compile_error", "dependency_missing", "build_failed")
     */
    private extractErrorPattern(errorMessage: string): string {
        if (!errorMessage) return 'unknown_error';

        const lowerMessage = errorMessage.toLowerCase();

        // TypeScript/컴파일 오류 패턴
        if (lowerMessage.includes('cannot find module') ||
            lowerMessage.includes('property') && lowerMessage.includes('does not exist') ||
            lowerMessage.includes('type') && lowerMessage.includes('is not assignable') ||
            lowerMessage.includes('ts') && (lowerMessage.includes('error') || lowerMessage.includes('failed'))) {
            return 'typescript_compile_error';
        }

        // 의존성 누락 오류 패턴
        if (lowerMessage.includes('module not found') ||
            lowerMessage.includes('cannot resolve') ||
            lowerMessage.includes('package') && lowerMessage.includes('not found')) {
            return 'dependency_missing';
        }

        // 빌드 오류 패턴
        if (lowerMessage.includes('build failed') ||
            lowerMessage.includes('command failed') ||
            lowerMessage.includes('exit code') && !lowerMessage.includes('exit code 0')) {
            return 'build_failed';
        }

        // 기타: 에러 메시지의 핵심 키워드 추출
        const keywords = lowerMessage
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(word => word.length > AgentConfig.MIN_KEYWORD_LENGTH)
            .slice(0, AgentConfig.MAX_FAILURE_KEYWORDS)
            .join('_');

        return keywords || 'unknown_error';
    }

    private extractFilePathsFromText(text: string): string[] {
        if (!text) return [];

        // 단순화된 정규식: 확장자가 있는 경로/파일명만 추출
        // 예: "src/App.tsx", "package.json", "./config.json" 등
        const fileRegex = /\b[\w\-\/\.]+\.[a-zA-Z0-9]+\b/g;
        const matches = text.match(fileRegex) || [];

        // 중복 제거 및 필터링
        const uniquePaths = Array.from(new Set(matches))
            .map(path => path.trim().replace(/^\.\//, '')) // 앞뒤 공백 제거, ./ 제거
            .filter(path => {
                // 최소 길이 체크 (예: "a.b" 같은 건 제외)
                if (path.length < AgentConfig.MIN_FILE_PATH_LENGTH) return false;
                // '...' 같은 패턴 제외
                if (path.includes('...')) return false;
                // 확장자만 있고 파일명이 없는 경우 제외 (예: ".tsx")
                if (path.startsWith('.')) return false;
                return true;
            });

        return uniquePaths;
    }

    /**
     * 에러 핸들링
     */
    private handleError(error: any, webview: vscode.Webview): void {
        // AbortError는 사용자가 의도적으로 취소한 것이므로 무시
        if (error.name === 'AbortError' || error.message?.includes('aborted')) {
            console.log('[ConversationManager] Request cancelled by user');
            return;
        }

        console.error('[ConversationManager] Error:', error);
        const errorMessage = error.message || '알 수 없는 오류가 발생했습니다.';
        WebviewBridge.receiveMessage(webview, 'System', `오류 발생: ${errorMessage}`);
        WebviewBridge.updateProcessingStatus(webview, '오류가 발생했습니다.', 'error');
    }

    // Output Contract 검증은 OutputValidator.validate() 사용
    // handlers/OutputValidator.ts로 분리됨

    /**
     * 텍스트 응답 추출
     */
    /**
     * execution-first 작업인지 판단하는 공통 함수
     * 모든 곳에서 동일한 기준으로 판단하여 FSM 일관성 보장
     * 
     * @param intent 의도 분석 결과
     * @param hasExecutionIntentEver 이미 execution plan item이 존재하는지 여부
     * @param hasActivePlan 기존 활성 plan이 있는지 여부 (초기 판단에만 사용, 기본값: false)
     * @param hasExecutionIntent 현재 plan에 execution item이 있는지 여부 (선택적, 기본값: false)
     * @returns execution-first 작업 여부
     */
    private isExecutionFirstTask(
        intent: any,
        hasExecutionIntentEver: boolean,
        hasActivePlan: boolean = false,
        hasExecutionIntent: boolean = false
    ): boolean {
        // 이미 execution plan이 있거나 현재 plan에 execution item이 있으면 execution-first로 간주
        if (hasExecutionIntentEver || hasExecutionIntent) {
            return true;
        }

        // intent가 없으면 execution-first 아님
        if (!intent) {
            return false;
        }

        // 초기 판단 시: hasActivePlan이 있으면 execution-first 아님
        if (hasActivePlan) {
            return false;
        }

        // execution 카테고리 또는 code 카테고리의 code_generate/code_run 서브타입
        const isExecutionCategory = intent.category === 'execution';
        const isCodeGenerateOrRun = intent.category === 'code' &&
            (intent.subtype === 'code_generate' || intent.subtype === 'code_run');

        // confidence >= MIN_EXECUTION_FIRST_CONFIDENCE 필수
        const hasHighConfidence = intent.confidence >= AgentConfig.MIN_EXECUTION_FIRST_CONFIDENCE;

        return (isExecutionCategory || isCodeGenerateOrRun) && hasHighConfidence;
    }

    // 참고: 이전 메서드들 (extractResponseText, getToolLabel, createToolResultSummary,
    // sendToolExecutionResultsToUI, hasSideEffects, trackFileChanges)은
    // ResponseProcessor 및 ToolExecutionCoordinator로 이동되었습니다.

    /**
     * 실제 파일 목록을 주입하여 검증된 요약 생성
     */
    private async generateVerifiedSummary(
        originalSummary: string,
        createdFiles: string[],
        modifiedFiles: string[],
        workspaceRoot: string,
        systemPrompt: string,
        accumulatedParts: any[],
        abortSignal?: AbortSignal
    ): Promise<string> {
        // 실제 디스크에서 파일 존재 여부 확인
        const verifiedCreated: string[] = [];
        const verifiedModified: string[] = [];

        for (const filePath of createdFiles) {
            try {
                const absPath = path.isAbsolute(filePath) ? filePath : path.join(workspaceRoot, filePath);
                await fs.access(absPath);
                verifiedCreated.push(filePath);
            } catch {
                // 파일이 존재하지 않으면 무시
            }
        }

        for (const filePath of modifiedFiles) {
            try {
                const absPath = path.isAbsolute(filePath) ? filePath : path.join(workspaceRoot, filePath);
                await fs.access(absPath);
                verifiedModified.push(filePath);
            } catch {
                // 파일이 존재하지 않으면 무시
            }
        }

        // 실제 파일 목록이 없으면 원본 요약 반환 (없으면 기본 메시지)
        if (verifiedCreated.length === 0 && verifiedModified.length === 0) {
            return originalSummary || '작업이 완료되었습니다.';
        }

        // 원본 요약이 있으면 검증만 수행, 없으면 새로 생성
        if (originalSummary && originalSummary.trim()) {
            // 원본 요약이 있는 경우: 파일 목록만 추가하여 반환 (LLM 호출 없음)
            return originalSummary +
                (verifiedCreated.length > 0 ? `\n\n[생성된 파일: ${verifiedCreated.join(', ')}]` : '') +
                (verifiedModified.length > 0 ? `\n[수정된 파일: ${verifiedModified.join(', ')}]` : '');
        } else {
            // 원본 요약이 없는 경우: LLM에게 요약 생성 요청 (1회만)
            // summarize.ts에서 프롬프트 가져오기
            const summaryPrompt = getSimpleSummaryPrompt(verifiedCreated, verifiedModified);

            try {
                const verifiedSummary = await this.llmManager.sendMessageWithSystemPrompt(
                    summaryPrompt,
                    accumulatedParts,
                    { signal: abortSignal }
                );

                // 🔥 문제 해결: REVIEW 단계에서 도구 호출 및 thinking 제거 강화
                let summaryText = this.responseProcessor.extractResponseText(verifiedSummary);

                // 도구 호출 및 JSON 패턴 제거
                // ```json ... ``` 블록 제거
                summaryText = summaryText.replace(/```json[\s\S]*?```/gi, '');
                // 직접 JSON 객체 제거 (tool/plan)
                summaryText = summaryText.replace(/\{\s*["']tool["'][\s\S]*?\}/gi, '');
                summaryText = summaryText.replace(/\{\s*"plan"[\s\S]*?\}/gi, '');
                // <file_content> ... </file_content> 블록 제거 (XML 스타일)
                summaryText = summaryText.replace(/<file_content>[\s\S]*?<\/file_content>/gi, '');

                // thinking/reasoning 패턴 추가 제거 (LLM의 내부 사고 과정)
                summaryText = summaryText.replace(/We need to[^.]*\./gi, '');
                summaryText = summaryText.replace(/But that's[^.]*\./gi, '');
                summaryText = summaryText.replace(/However[^.]*\./gi, '');
                summaryText = summaryText.replace(/Not sure[^.]*\./gi, '');
                summaryText = summaryText.replace(/Possibly[^.]*\./gi, '');
                summaryText = summaryText.replace(/The rule says[^.]*\./gi, '');
                summaryText = summaryText.replace(/Given[^.]*\./gi, '');
                summaryText = summaryText.replace(/Let's[^.]*\./gi, '');

                // 정제된 텍스트 반환
                summaryText = summaryText.trim();
                return summaryText || '작업이 완료되었습니다.';
            } catch (error) {
                console.warn('[ConversationManager] Failed to generate verified summary:', error);
                // 실패 시 기본 메시지 반환
                return '작업이 완료되었습니다.';
            }
        }
    }


    /**
     * 자동 테스트 검증 (Smoke Test & Lint Check) - 범용 버전
     * @returns {Promise<{success: boolean, errorMessage?: string}>} 성공 여부와 에러 메시지
     */
    private async runAutomatedTests(
        webview: vscode.Webview,
        workspaceRoot: string,
        createdFiles: string[],
        modifiedFiles: string[]
    ): Promise<{ success: boolean; errorMessage?: string }> {
        try {
            // 검증 시작
            WebviewBridge.sendProcessingStep(webview, 'executing');
            WebviewBridge.sendProcessingStatus(webview, 'executing', '코드 검증 시작...');

            // ProjectDetector를 사용하여 프로젝트 타입 감지
            WebviewBridge.sendProcessingStatus(webview, 'executing', '프로젝트 타입 감지 중...');
            const detector = new ProjectDetector();
            const projectInfo = await detector.detectProjectType(workspaceRoot);

            // Fallback: 규칙으로 찾지 못했을 때 LLM에게 판단 넘기기
            if (projectInfo.type === ProjectType.UNKNOWN) {
                console.log('[ConversationManager] Unknown project type, trying LLM fallback...');
                WebviewBridge.sendProcessingStatus(webview, 'executing', '프로젝트 타입 LLM 감지 중...');
                const currentProject = ProjectManager.getInstance().getCurrentProject();
                const llmManager = LLMManager.getInstance();
                const currentModelType = llmManager.getCurrentModel();
                const geminiApi = llmManager.getGeminiApi();
                const ollamaApi = llmManager.getOllamaApi();

                const llmResult = await detector.detectWithLLMFallback(
                    workspaceRoot,
                    currentModelType === AiModelType.GEMINI ? geminiApi : ollamaApi,
                    currentModelType
                );

                if (llmResult && llmResult.type !== ProjectType.UNKNOWN) {
                    console.log(`[ConversationManager] LLM fallback detected project type: ${llmResult.type}`);
                    // projectInfo를 LLM 결과로 업데이트
                    Object.assign(projectInfo, llmResult);
                } else {
                    console.log('[ConversationManager] Unknown project type, skipping automated tests.');
                    WebviewBridge.sendProcessingStatus(webview, 'executing', '프로젝트 타입 미확인 테스트 검증 완료');
                    return { success: true }; // 알 수 없는 프로젝트 타입은 성공으로 간주
                }
            }

            const testResults: string[] = [];

            // 1. Smoke Test: 프로젝트 타입별 필수 파일 존재 확인
            WebviewBridge.sendProcessingStatus(webview, 'executing', 'Smoke Test 실행 중 (필수 파일 확인)...');
            const criticalFiles = detector.getCriticalFiles(projectInfo.type, workspaceRoot);

            const missingFiles: string[] = [];
            for (const file of criticalFiles) {
                try {
                    const filePath = path.isAbsolute(file) ? file : path.join(workspaceRoot, file);
                    await fs.access(filePath);
                } catch {
                    // build.gradle와 build.gradle.kts는 둘 중 하나만 있으면 됨
                    if (projectInfo.type === ProjectType.SPRING_BOOT && projectInfo.buildTool.toString().includes('gradle') && (file === 'build.gradle' || file === 'build.gradle.kts')) {
                        const otherFile = file === 'build.gradle' ? 'build.gradle.kts' : 'build.gradle';
                        try {
                            await fs.access(path.join(workspaceRoot, otherFile));
                            continue; // 다른 파일이 있으면 통과
                        } catch { }
                    }
                    // requirements.txt와 pyproject.toml도 둘 중 하나만 있으면 됨
                    if ((projectInfo.type === ProjectType.PYTHON || projectInfo.type === ProjectType.DJANGO || projectInfo.type === ProjectType.FLASK || projectInfo.type === ProjectType.FASTAPI) && (file === 'requirements.txt' || file === 'pyproject.toml')) {
                        const otherFile = file === 'requirements.txt' ? 'pyproject.toml' : 'requirements.txt';
                        try {
                            await fs.access(path.join(workspaceRoot, otherFile));
                            continue; // 다른 파일이 있으면 통과
                        } catch { }
                    }
                    missingFiles.push(file);
                }
            }

            if (missingFiles.length > 0) {
                testResults.push(`Smoke Test 실패: 다음 파일이 누락되었습니다: ${missingFiles.join(', ')}`);
                WebviewBridge.sendProcessingStatus(webview, 'executing', 'Smoke Test 실패');
            } else {
                testResults.push(`Smoke Test 통과: 모든 필수 파일이 존재합니다.`);
                WebviewBridge.sendProcessingStatus(webview, 'executing', 'Smoke Test 통과');
            }

            // 2. Lint Check: 프로젝트 타입별 컴파일/빌드 검사
            let validationCmd = detector.getValidationCommand(projectInfo.type, workspaceRoot, createdFiles, modifiedFiles);

            // Fallback: getValidationCommand()가 null을 반환하면 LLM에게 질의
            // null은 규칙 기반으로 안전하게 결정 가능한 검증 명령이 존재하지 않음을 의미하며,
            // 이 경우에만 LLM을 보조적인 추론 수단(fallback)으로 사용
            if (!validationCmd) {
                console.log('[ConversationManager] getValidationCommand() returned null. Querying LLM for validation command...');
                WebviewBridge.sendProcessingStatus(webview, 'executing', '검증 명령어 LLM 추론 중...');

                const llmManager = LLMManager.getInstance();
                const currentModelType = llmManager.getCurrentModel();
                const geminiApi = llmManager.getGeminiApi();
                const ollamaApi = llmManager.getOllamaApi();
                const llmApi = currentModelType === AiModelType.GEMINI ? geminiApi : ollamaApi;

                if (llmApi) {
                    try {
                        // 프로젝트 정보 수집
                        const fileList = [...createdFiles, ...modifiedFiles].slice(0, AgentConfig.MAX_LINT_CHECK_FILES).join(', ');
                        const projectTypeStr = projectInfo.type.toString();

                        const prompt = getValidationCommandInferencePrompt(projectTypeStr, workspaceRoot, fileList);

                        const response = await llmApi.sendMessage(prompt);

                        // JSON 파싱
                        const jsonMatch = response.match(/\{[\s\S]*\}/);
                        if (jsonMatch) {
                            try {
                                const parsed = JSON.parse(jsonMatch[0]);
                                if (parsed.command && parsed.description) {
                                    validationCmd = {
                                        command: parsed.command,
                                        description: parsed.description
                                    };
                                    console.log(`[ConversationManager] LLM suggested validation command: ${validationCmd.command}`);
                                }
                            } catch (parseError) {
                                console.error('[ConversationManager] Failed to parse LLM response for validation command:', parseError);
                            }
                        }
                    } catch (llmError) {
                        console.error('[ConversationManager] Error querying LLM for validation command:', llmError);
                    }
                }
            }

            if (validationCmd) {
                WebviewBridge.sendProcessingStatus(webview, 'executing', `${validationCmd.description} 실행 중...`);
                try {
                    const executionManager = ExecutionManager.getInstance();
                    const result = await executionManager.executeCommand(
                        validationCmd.command,
                        { cwd: workspaceRoot, timeout: 15000 }
                    );

                    if (result.exitCode === 0) {
                        testResults.push(`${validationCmd.description} 통과: 문법 오류가 없습니다.`);
                        WebviewBridge.sendProcessingStatus(webview, 'executing', `${validationCmd.description} 통과`);
                    } else {
                        const errorOutput = result.stderr || result.stdout || '';
                        // 너무 긴 출력은 축약
                        const truncatedOutput = errorOutput.length > AgentConfig.MAX_ERROR_MESSAGE_LENGTH
                            ? errorOutput.substring(0, AgentConfig.MAX_ERROR_MESSAGE_LENGTH) + '...'
                            : errorOutput;
                        testResults.push(`${validationCmd.description} 실패: 오류가 발견되었습니다.\n${truncatedOutput}`);
                        WebviewBridge.sendProcessingStatus(webview, 'executing', `${validationCmd.description} 실패`);
                    }
                } catch (error) {
                    testResults.push(`${validationCmd.description} 실행 실패: ${error instanceof Error ? error.message : String(error)}`);
                    WebviewBridge.sendProcessingStatus(webview, 'executing', `${validationCmd.description} 실행 실패`);
                }
            } else {
                testResults.push(`컴파일 검사: 프로젝트 타입(${projectInfo.type})에 대한 검증 명령어를 결정할 수 없습니다. (규칙 기반 및 LLM fallback 모두 실패)`);
                WebviewBridge.sendProcessingStatus(webview, 'executing', '검증 명령어 없음 (건너뜀)');
            }

            // 실패한 테스트 확인
            const hasFailedTests = testResults.some(r => r.includes('실패') || r.includes('Failed'));

            if (hasFailedTests) {
                // 실패한 테스트의 에러 메시지 추출
                const failedTestMessages = testResults.filter(r => r.includes('실패') || r.includes('Failed'));
                const errorMessage = failedTestMessages.join('\n');
                WebviewBridge.sendProcessingStatus(webview, 'executing', '테스트 검증 실패');
                return { success: false, errorMessage };
            }

            // 모든 테스트 통과
            WebviewBridge.sendProcessingStatus(webview, 'executing', '테스트 검증 통과');
            return { success: true };

        } catch (error) {
            console.error('[ConversationManager] Error running automated tests:', error);
            const errorMsg = `자동 테스트 실행 중 오류 발생: ${error instanceof Error ? error.message : String(error)}`;
            return { success: false, errorMessage: errorMsg };
        }
    }

    /**
     * Formatter 실행 여부 결정 (조건부 호출)
     * ✅ 무조건 호출 ❌ → 조건부 호출 ✅
     */
    private shouldRunFormatter(
        createdFiles: string[],
        modifiedFiles: string[]
    ): boolean {
        // 🟢 1. 새 파일 추가 시 → YES (거의 무조건)
        if (createdFiles.length > 0) {
            console.log('[ConversationManager] New files detected, formatter will run');
            return true;
        }

        // 🟢 2. 10줄 이상 구조 변경 → YES
        const inlineDiffManager = InlineDiffManager.getInstance();
        let totalModifiedLines = 0;

        for (const filePath of modifiedFiles) {
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
            const absolutePath = path.isAbsolute(filePath)
                ? filePath
                : workspaceRoot
                    ? path.join(workspaceRoot, filePath)
                    : filePath;

            const changes = inlineDiffManager.getChanges(absolutePath);
            if (changes && changes.length > 0) {
                for (const change of changes) {
                    if (change.status === 'pending') {
                        // range 기반으로 영향받은 라인 수 계산
                        const affectedLines = Math.max(
                            1,
                            change.range.end.line - change.range.start.line + 1
                        );
                        totalModifiedLines += affectedLines;
                    }
                }
            }
        }

        if (totalModifiedLines >= AgentConfig.MIN_SIGNIFICANT_MODIFICATION_LINES) {
            console.log(`[ConversationManager] ${totalModifiedLines} lines modified, formatter will run`);
            return true;
        }

        // 🟡 3. 단순 문자열 / 한 줄 수정 → NO (기본)
        console.log(`[ConversationManager] Only ${totalModifiedLines} lines modified (threshold: ${AgentConfig.MIN_SIGNIFICANT_MODIFICATION_LINES}), skipping formatter`);
        return false;
    }

    /**
     * 파일 변경 후 formatter 및 validation 실행
     * 실행 순서: Formatter → Validation
     * ✅ 조건부 호출 + diff 보호
     */
    private async afterFileChanges(
        webview: vscode.Webview,
        workspaceRoot: string,
        createdFiles: string[],
        modifiedFiles: string[]
    ): Promise<void> {
        try {
            // ✅ 조건부 Formatter 실행 결정
            if (!this.shouldRunFormatter(createdFiles, modifiedFiles)) {
                console.log('[ConversationManager] Skipping formatter (small changes)');
                return;
            }

            const detector = new ProjectDetector();
            const projectInfo = await detector.detectProjectType(workspaceRoot);

            // Fallback: LLM으로 프로젝트 타입 감지
            if (projectInfo.type === ProjectType.UNKNOWN) {
                console.log('[ConversationManager] Unknown project type, trying LLM fallback...');
                const currentProject = ProjectManager.getInstance().getCurrentProject();
                const llmManager = LLMManager.getInstance();
                const currentModelType = llmManager.getCurrentModel();
                const geminiApi = llmManager.getGeminiApi();
                const ollamaApi = llmManager.getOllamaApi();

                const llmResult = await detector.detectWithLLMFallback(
                    workspaceRoot,
                    currentModelType === AiModelType.GEMINI ? geminiApi : ollamaApi,
                    currentModelType
                );

                if (llmResult && llmResult.type !== ProjectType.UNKNOWN) {
                    console.log(`[ConversationManager] LLM fallback detected project type: ${llmResult.type}`);
                    Object.assign(projectInfo, llmResult);
                } else {
                    console.log('[ConversationManager] Unknown project type, skipping formatter and validation.');
                    return;
                }
            }

            const executionManager = ExecutionManager.getInstance();
            const inlineDiffManager = InlineDiffManager.getInstance();

            // 1. Formatter 실행 (조건부)
            const formatterCmd = detector.getFormatterCommand(projectInfo.type, workspaceRoot, createdFiles, modifiedFiles);
            if (formatterCmd) {
                // ✅ Formatter 실행 전: diff 보호 시작
                const allAffectedFiles = [...createdFiles, ...modifiedFiles];
                for (const filePath of allAffectedFiles) {
                    const absolutePath = path.isAbsolute(filePath)
                        ? filePath
                        : workspaceRoot
                            ? path.join(workspaceRoot, filePath)
                            : filePath;
                    inlineDiffManager.markFormatterRunning(absolutePath);
                }

                WebviewBridge.sendProcessingStatus(webview, 'executing', `${formatterCmd.description} 실행 중...`);
                try {
                    const formatterResult = await executionManager.executeCommand(
                        formatterCmd.command,
                        { cwd: workspaceRoot, timeout: AgentConfig.VALIDATION_COMMAND_TIMEOUT }
                    );

                    // ✅ Formatter 실행 후: diff 보호 해제
                    for (const filePath of allAffectedFiles) {
                        const absolutePath = path.isAbsolute(filePath)
                            ? filePath
                            : workspaceRoot
                                ? path.join(workspaceRoot, filePath)
                                : filePath;
                        inlineDiffManager.markFormatterFinished(absolutePath);
                    }

                    if (formatterResult.exitCode === 0) {
                        console.log(`[ConversationManager] Formatter executed successfully: ${formatterCmd.description}`);
                        WebviewBridge.sendProcessingStatus(webview, 'executing', `${formatterCmd.description} 완료`);
                    } else {
                        // Formatter 실패는 경고로만 처리 (테스트 실패로 간주하지 않음)
                        console.warn(`[ConversationManager] Formatter failed (non-fatal): ${formatterResult.stderr || formatterResult.stdout || ''}`);
                        WebviewBridge.sendProcessingStatus(webview, 'executing', `${formatterCmd.description} 경고 (계속 진행)`);
                    }
                } catch (error) {
                    // ✅ 에러 발생 시에도 diff 보호 해제
                    for (const filePath of allAffectedFiles) {
                        const absolutePath = path.isAbsolute(filePath)
                            ? filePath
                            : workspaceRoot
                                ? path.join(workspaceRoot, filePath)
                                : filePath;
                        inlineDiffManager.markFormatterFinished(absolutePath);
                    }
                    // Formatter 오류는 경고로만 처리
                    console.warn(`[ConversationManager] Formatter error (non-fatal):`, error);
                    WebviewBridge.sendProcessingStatus(webview, 'executing', `${formatterCmd.description} 경고 (계속 진행)`);
                }
            } else {
                console.log(`[ConversationManager] No formatter command found for project type: ${projectInfo.type}`);
            }

            // 2. Validation 실행 (TestRunner에서 처리)
            // Validation은 TestRunner.runAutomatedTests()에서 실행되므로 여기서는 실행하지 않음
        } catch (error) {
            console.error('[ConversationManager] Error in afterFileChanges:', error);
            // 오류가 발생해도 계속 진행
        }
    }

    /**
     * 요약 결과를 그대로 반환 (변환 로직 제거)
     * 명령어는 프롬프트에서 코드 블록 형식으로 출력하도록 지시
     */
    private parseCommandsInSummary(summary: string): string {
        // 변환 없이 그대로 반환 (프롬프트에서 이미 코드 블록 형식으로 출력하도록 지시)
        return summary;
    }

    /**
     * 현재 세션의 대화를 강제로 압축 (슬래시 명령어용)
     * @param userParts - 압축할 대화 메시지 배열
     * @param extensionContext - ExtensionContext (compactorModel 사용을 위해 선택사항)
     * @returns 압축 결과
     */
    public async forceCompact(userParts: any[], extensionContext?: vscode.ExtensionContext): Promise<{
        compacted: boolean;
        originalTokens: number;
        compactedTokens: number;
        savedTokens: number;
        summary?: string;
    }> {
        try {
            const compactor = ConversationCompactor.getInstance(this.llmManager);
            // StateManager 설정 (compactorModel 사용을 위해)
            if (extensionContext) {
                compactor.setStateManager(StateManager.getInstance(extensionContext));
            }
            const currentModelType = this.llmManager.getCurrentModel();
            const maxTokens = MODEL_TOKEN_LIMITS[currentModelType]?.maxInputTokens || 128000;

            // 강제 압축 실행 (임계값 무시)
            const result = await compactor.forceCompact(userParts, maxTokens);

            console.log(`[ConversationManager] Force compact result: ${result.originalTokens} -> ${result.compactedTokens} tokens`);

            return {
                compacted: result.compacted,
                originalTokens: result.originalTokens,
                compactedTokens: result.compactedTokens,
                savedTokens: result.savedTokens,
                summary: result.summary
            };
        } catch (error) {
            console.error('[ConversationManager] Force compact failed:', error);
            return {
                compacted: false,
                originalTokens: 0,
                compactedTokens: 0,
                savedTokens: 0
            };
        }
    }

}

