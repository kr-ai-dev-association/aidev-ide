import * as vscode from 'vscode';
import { PromptBuilder, PromptType, PromptBuilderOptions } from '../context/PromptBuilder';
import { ContextManager } from '../context/ContextManager';
import { TaskManager } from '../task/TaskManager';
import { LLMManager } from '../model/LLMManager';
import { WebviewBridge } from '../../webview/WebviewBridge';
import { ToolParser } from '../../tools/ToolParser';
import { ToolExecutor } from '../../tools/ToolExecutor';
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
import { AiModelType, OllamaApi, GeminiApi, BanyaApi } from '../../../services';
import { AgentStateManager, AgentPhase } from './AgentStateManager';
import { getSimpleSummaryPrompt } from '../context/prompts/task';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { TestRunner } from './handlers/TestRunner';
import { ResponseProcessor } from './handlers/ResponseProcessor';
import { ToolExecutionCoordinator } from './handlers/ToolExecutionCoordinator';
import { AgentConfig } from '../../config/AgentConfig';
import { InlineDiffManager } from '../diff/InlineDiffManager';
import { StringUtils } from '../../utils/StringUtils';
import { getExecutionPhasePrompt } from '../context/prompts/phase';
import { getExecutionFirstRulePrompt, getErrorRetryPrompt, getSimpleErrorRetryPrompt, getTestRetryExceededMessage } from '../context/prompts/rules';
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
    public setExternalApiService(service: any): void { }
    public configurePlanManager(client: any, model: any): void { }
    public setContextHistoryManager(manager: any): void { }

    /**
     * 사용자의 메시지를 처리하고 응답을 생성하는 메인 엔트리 포인트
     */
    public async handleUserMessageAndRespond(options: ConversationOptions): Promise<void> {
        const { webviewToRespond, extensionContext } = options;

        const userQuery = options.userQuery;

        try {
            // 1. 초기화 및 준비
            this.prepareUI(webviewToRespond);

            // 세션 히스토리 정리 체크 (LLM 요약 없이 오래된 항목 제거)
            if (extensionContext) {
                const { SessionManager } = await import('../state/SessionManager');
                const sessionManager = SessionManager.getInstance(extensionContext);

                // 50개 초과 시 최근 30개만 유지 (구조화된 메타데이터라 용량 적음)
                if (sessionManager.needsSessionTrim(50)) {
                    sessionManager.trimSessionHistory(30);
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
            const context = await this.gatherContext(options, intent);

            // 4. 시스템 프롬프트 생성
            const promptOptions: PromptBuilderOptions = {
                userOS: options.userOS || process.platform,
                modelType: options.currentModelType || AiModelType.OLLAMA,
                promptType: options.promptType,
                ...context
            };
            const systemPrompt = this.promptBuilder.generateSystemPrompt(promptOptions);

            // 5. 작업 타입에 따른 실행 분기
            if (options.promptType === PromptType.CODE_GENERATION) {
                const userParts = [{ text: userQuery }];
                await this.executeAgentLoop(systemPrompt, userParts, options, intent);
            } else {
                // ASK 모드: 이전 대화 컨텍스트 포함
                const userParts = await this.buildUserPartsWithHistory(userQuery, options);
                await this.handleGeneralAsk(systemPrompt, userParts, options);
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
        const MAX_HISTORY_ENTRIES = 10; // 최근 10개 대화까지만 포함

        if (options.extensionContext) {
            try {
                const { SessionManager } = await import('../state/SessionManager');
                const sessionManager = SessionManager.getInstance(options.extensionContext);
                const currentSession = sessionManager.getCurrentSession();

                if (currentSession && currentSession.conversationHistory.length > 0) {
                    // 최근 대화 히스토리 (구조화된 메타데이터)
                    const history = currentSession.conversationHistory.slice(-MAX_HISTORY_ENTRIES);

                    // 이전 대화를 간결한 컨텍스트로 추가
                    for (const entry of history) {
                        // 구조화된 형식에서 컨텍스트 추출
                        const actions = entry.actions && entry.actions.length > 0
                            ? ` [Actions: ${entry.actions.map((a: any) => `${a.type}${a.file ? ':' + a.file : ''}`).join(', ')}]`
                            : '';
                        // assistantResponse가 있으면 사용, 없으면 파일 변경 정보 또는 '작업 완료'
                        const response = entry.assistantResponse
                            ? entry.assistantResponse.slice(0, 200)
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
     */
    private async detectIntent(query: string): Promise<any> {
        const detector = new IntentDetector(this.llmManager);

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
        if (options.selectedFiles && options.selectedFiles.length > 0) {
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
        }

        // 터미널 컨텍스트 (사용자가 @terminal로 선택한 터미널 히스토리)
        const terminalContextContent = options.terminalContext || '';
        if (terminalContextContent) {
            console.log('[ConversationManager] Terminal context included in system prompt');
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
            terminalContextContent: terminalContextContent
        };
    }

    private async executeAgentLoop(systemPrompt: string, userParts: any[], options: ConversationOptions, intent: any): Promise<void> {
        // intent를 클로저에 저장하여 도구 차단 로직에서 사용 가능하도록 함
        const executionIntent = intent && (intent.category === 'execution' || intent.category === 'code');
        const { webviewToRespond, abortSignal, userQuery } = options;
        const maxTurns = AgentConfig.MAX_TURNS;
        let turnCount = 0;
        let accumulatedUserParts = [...userParts];
        let testFixAttempts = 0; // 테스트 실패 시 자동 수정 시도 횟수
        const maxTestFixAttempts = await SettingsManager.getInstance().getTestRetryCount(); // 설정에서 최대 시도 횟수 가져오기
        const isAutoTestRetryEnabled = await SettingsManager.getInstance().isAutoTestRetryEnabled(); // 자동 테스트 재시도 설정 확인
        let extractedFunctionName: string | null = null; // 사용자 쿼리에서 추출한 함수명 저장

        // 📝 구조화된 메타데이터 수집 (세션 히스토리용)
        const collectedActions: Array<{ type: string; file?: string; command?: string; result?: string }> = [];
        const collectedUIMessages: Array<{ sender: 'USER' | 'CODEPILOT' | 'System'; text: string; type?: 'action' | 'code' | 'summary' | 'message' }> = [];
        let lastAssistantResponse = '';

        // 🔥 문제 1 해결: npm install 등 명령어 중복 실행 방지 (전역 추적)
        const recentlyExecutedCommands = new Set<string>(); // 최근 실행된 명령어 추적
        const lastFailurePattern = { pattern: '', count: 0 }; // 실패 패턴 추적 (문제 3 해결용)

        const taskManager = TaskManager.getInstance();
        const actionManager = ActionManager.getInstance();
        const executionManager = ExecutionManager.getInstance();
        const terminalManager = TerminalManager.getInstance();
        const investigationManager = InvestigationManager.getInstance();
        const toolExecutor = new ToolExecutor();

        // ✅ Phase 기준 CODEPILOT 텍스트 송신 제어 함수
        const shouldSendCodePilotText = (phase: AgentPhase): boolean => {
            // REVIEW와 DONE phase에서만 사용자에게 텍스트를 보여줌
            return phase === AgentPhase.REVIEW || phase === AgentPhase.DONE;
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
            // LLM을 한 번 호출하여 인사에 응답
            const greetingResponse = await this.llmManager.sendMessageWithSystemPrompt(
                systemPrompt,
                accumulatedUserParts,
                { signal: abortSignal }
            );

            // 응답 정제: extractResponseText 사용하여 일관된 정제
            let cleanGreetingResponse = this.responseProcessor.extractResponseText(greetingResponse);

            // JSON 래핑이 있는 경우 추가 파싱 (extractResponseText에서 처리되지 않은 경우)
            if (!cleanGreetingResponse || cleanGreetingResponse.trim().length < 2) {
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

            // CODEPILOT 타입으로 전송 (다른 일반 질의응답과 동일한 타입 사용)
            WebviewBridge.receiveMessage(webviewToRespond, 'CODEPILOT', cleanGreetingResponse);
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
        const initialState = hasActivePlan
            ? AgentPhase.EXECUTION
            : (isExecutionFirstTask && !hasExistingProject ? AgentPhase.EXECUTION : AgentPhase.INVESTIGATION);
        const stateManager = new AgentStateManager(initialState);

        if (isExecutionFirstTask) {
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

        let investigationTextOnlyCount = 0; // INVESTIGATION에서 텍스트만 출력한 횟수 추적

        while (turnCount < maxTurns) {
            if (abortSignal?.aborted) break;

            // 🔄 컨텍스트 자동 압축 체크 (토큰 임계값 초과 시 트리거)
            try {
                const compactor = ConversationCompactor.getInstance(this.llmManager);
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

                    // 요약이 생성되었으면 UI에 출력
                    if (verifiedSummary && verifiedSummary.trim()) {
                        // 명령어를 copy/run 가능한 형식으로 파싱
                        finalResponse = this.parseCommandsInSummary(verifiedSummary);
                        WebviewBridge.receiveMessage(webviewToRespond, 'CODEPILOT', finalResponse);
                    } else {
                        // 요약 생성 실패 시 기본 메시지 출력
                        finalResponse = `작업이 완료되었습니다.\n\n` +
                            (createdFiles.length > 0 ? `생성된 파일: ${createdFiles.join(', ')}\n` : '') +
                            (modifiedFiles.length > 0 ? `수정된 파일: ${modifiedFiles.join(', ')}\n` : '');
                        WebviewBridge.receiveMessage(webviewToRespond, 'CODEPILOT', finalResponse);
                    }
                } else {
                    // 파일 변경이 없으면 기본 완료 메시지
                    finalResponse = '작업이 완료되었습니다.';
                    WebviewBridge.receiveMessage(webviewToRespond, 'CODEPILOT', finalResponse);
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

                // CODE 모드 사용 토큰을 세션에 누적
                if (options.extensionContext) {
                    try {
                        const { SessionManager } = await import('../state/SessionManager');
                        const sessionManager = SessionManager.getInstance(options.extensionContext);
                        const compactor = ConversationCompactor.getInstance(this.llmManager);
                        const loopTokens = compactor.calculateTotalTokens(accumulatedUserParts, systemPrompt);
                        sessionManager.addTokensUsed(loopTokens);
                    } catch (e) {
                        console.warn('[ConversationManager] Failed to add tokens to session:', e);
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
                const promptOptions: PromptBuilderOptions = {
                    userOS: options.userOS || process.platform,
                    modelType: options.currentModelType || AiModelType.OLLAMA,
                    promptType: options.promptType,
                    allowedTools // 도구 제한 전달
                };
                activeSystemPrompt = investigationPrompt + '\n\n' + this.promptBuilder.generateSystemPrompt(promptOptions);

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

            // [핵심 수정] EXECUTION phase에서 plan이 있으면 우선 plan 기반 도구를 직접 실행하고,
            // plan에 실행 도구가 없을 경우에만 한 번 LLM을 호출해 tool call을 생성
            const currentPhaseForExecution = stateManager.getCurrentState();
            if (currentPhaseForExecution === AgentPhase.EXECUTION && currentPlanItem) {
                // plan 생성 시 받은 도구 호출이 있으면 바로 실행
                if (toolCallsFromPlanCreation.length > 0) {
                    console.log(`[ConversationManager] EXECUTION phase: executing ${toolCallsFromPlanCreation.length} tool calls from plan creation, skipping LLM call.`);

                    const currentProject = ProjectManager.getInstance().getCurrentProject();
                    const workspaceRoot = currentProject?.root || '';

                    WebviewBridge.sendProcessingStep(webviewToRespond, 'executing');
                    WebviewBridge.sendProcessingStatus(webviewToRespond, 'executing', `${phaseLabel}도구 실행 중...`);

                    const toolResults = await toolExecutor.executeTools(toolCallsFromPlanCreation, {
                        projectRoot: workspaceRoot,
                        workspaceRoot: workspaceRoot,
                        actionManager,
                        executionManager,
                        terminalManager,
                        contextManager: this.contextManager
                    });

                    const uiMsgs1 = ToolExecutionCoordinator.sendToolExecutionResultsToUI(webviewToRespond, toolCallsFromPlanCreation, toolResults);
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
                                    accumulatedUserParts.push({
                                        text: `\n[System] 자동 테스트가 실패했습니다. 다음 오류를 수정하세요:\n${testResult.errorMessage || '알 수 없는 오류'}\n\n필요하다면 run_command 도구를 사용하여 의존성을 설치하세요 (예: npm install, pip install -r requirements.txt, mvn install 등).\n\n**중요:** 이미 존재하는 파일은 생성하지 마세요. 파일이 이미 존재하는 경우 <update_file> 도구를 사용하여 수정하세요.\n`
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
                                text: `\n[System] ⚠️ **FSM 위반 감지**: 조사(Investigation) 항목 "${currentPlanItem.title}"이 실행(Execution) 단계에 도달했습니다.\n` +
                                    `조사 항목은 반드시 조사(Investigation) 단계에서만 처리되어야 합니다.\n` +
                                    `이 항목은 건너뛰고 다음 실행 항목으로 진행합니다.\n`
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
                                            accumulatedUserParts.push({
                                                text: `\n[System] 자동 테스트가 실패했습니다. 다음 오류를 수정하세요:\n${testResult.errorMessage || '알 수 없는 오류'}\n\n⚠️ **중요 컨텍스트:**\n- 이미 대부분의 파일은 생성되어 있습니다.\n- 실패 원인만 최소 수정(<update_file>)으로 해결하세요.\n- <create_file>을 사용하여 파일을 다시 만들지 마세요.\n- 파일이 이미 존재하는 경우 반드시 <update_file> 도구를 사용하여 수정하세요.\n\n필요하다면 run_command 도구를 사용하여 의존성을 설치하세요 (예: npm install, pip install -r requirements.txt, mvn install 등).\n`
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
                                    `다시 <read_file>을 호출하지 마세요. 위 내용을 참고하여 작업을 진행하세요.\n`;
                            } else {
                                preloadedFilesContextForExecution += `**중요**: 위 파일들은 이미 읽었고, 위 대화 기록에서 파일 내용이 제공되었습니다.\n` +
                                    `다시 <read_file>을 호출하지 마세요. 위 대화 기록에서 파일 내용을 확인하세요.\n`;
                            }
                        }

                        const planContextForExecution =
                            `\n\n[EXECUTION PHASE - ABSOLUTE RULES (NO EXCEPTIONS)]\n` +
                            `CURRENT TASK: ${currentPlanItem.title}` +
                            (currentPlanItem.detail ? `\nDETAIL: ${currentPlanItem.detail}` : '') +
                            projectInventoryContext +
                            preloadedFilesContextForExecution +
                            `\n\n**🔥 ABSOLUTELY FORBIDDEN (시스템이 자동으로 무시함):**\n` +
                            `- NO thinking, reasoning, explanation, or meta-analysis\n` +
                            `- NO "We need to...", "According to...", "Let's call...", "I should..."\n` +
                            `- NO natural language text (except inside tool parameters)\n` +
                            `- NO project exploration (investigation is already complete)\n` +
                            `- NO re-reading files already provided above\n` +
                            `- NO plan creation (planning phase is over)\n\n` +
                            `**✅ REQUIRED OUTPUT (ONLY THIS):**\n` +
                            `- ONLY executable XML tool calls (<create_file>, <update_file>, <run_command>, etc.)\n` +
                            `- NO text before or after tool calls\n` +
                            `- If no tool call is required, output NOTHING (empty response)\n\n` +
                            `**CRITICAL:** You are a DSL compiler, NOT a human assistant.\n` +
                            `Any natural language text will be IGNORED by the system.\n` +
                            `Only XML tool calls will be executed.\n\n` +
                            `**파일 읽기 전략 (시스템이 자동 관리):**\n` +
                            `- 위에 이미 제공된 파일 내용을 참고하세요 (다시 읽지 마세요)\n` +
                            `- 새로 생성/수정할 파일만 필요시 읽으세요\n` +
                            `- **다중 도구 호출 필수**: 필요한 모든 파일을 한 번에 처리하세요\n` +
                            `  - 여러 <read_file>, <update_file>, <create_file> 태그를 동시에 출력 가능\n` +
                            `  - 한 번에 최대한 많은 작업 수행\n` +
                            `- **Read A + Update A 규칙**: 같은 파일을 읽고 수정하는 것은 시스템이 자동으로 턴을 나눕니다. LLM은 신경 쓰지 마세요.\n\n` +
                            `이 계획 항목을 실행하기 위해 필요한 모든 XML 도구 호출을 한 번에 즉시 제공하세요.\n` +
                            `설명 없이 도구만 호출하세요.`;

                        const llmResponseForExecution = await this.llmManager.sendMessageWithSystemPrompt(
                            activeSystemPrompt + planContextForExecution,
                            accumulatedUserParts,
                            { signal: abortSignal }
                        );

                        const cleanExecutionResponse = llmResponseForExecution.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
                        const toolCallsFromExecution = ToolParser.parseToolCalls(cleanExecutionResponse);

                        if (toolCallsFromExecution.length > 0) {
                            // 도구 실행 로직
                            const currentProject = ProjectManager.getInstance().getCurrentProject();
                            const workspaceRoot = currentProject?.root || '';

                            WebviewBridge.sendProcessingStep(webviewToRespond, 'executing');
                            WebviewBridge.sendProcessingStatus(webviewToRespond, 'executing', `${phaseLabel}도구 실행 중...`);

                            const toolResults = await toolExecutor.executeTools(toolCallsFromExecution, {
                                projectRoot: workspaceRoot,
                                workspaceRoot: workspaceRoot,
                                actionManager,
                                executionManager,
                                terminalManager,
                                contextManager: this.contextManager
                            });

                            const uiMsgs2 = ToolExecutionCoordinator.sendToolExecutionResultsToUI(webviewToRespond, toolCallsFromExecution, toolResults);
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
                                        accumulatedUserParts.push({
                                            text: `\n[System] 자동 테스트가 실패했습니다. 다음 오류를 수정하세요:\n${testResult.errorMessage || '알 수 없는 오류'}\n\n⚠️ **중요 컨텍스트:**\n- 이미 대부분의 파일은 생성되어 있습니다.\n- 실패 원인만 최소 수정(<update_file>)으로 해결하세요.\n- <create_file>을 사용하여 파일을 다시 만들지 마세요.\n- 파일이 이미 존재하는 경우 반드시 <update_file> 도구를 사용하여 수정하세요.\n\n필요하다면 run_command 도구를 사용하여 의존성을 설치하세요 (예: npm install, pip install -r requirements.txt, mvn install 등).\n`
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
                            // LLM을 호출했지만 여전히 도구 호출이 없다면, 해당 plan item을 완료로 간주하고 다음으로 이동
                            console.log('[ConversationManager] No tool calls returned for plan item execution. Marking current plan item as done and moving to next.');

                            // ⚠️ 핵심 수정: 텍스트 응답이 있으면 패널에 표시 (EXECUTION phase에서는 제외)
                            const textResponse = this.responseProcessor.extractResponseText(cleanExecutionResponse);
                            if (textResponse && textResponse.trim().length > 0) {
                                console.log(`[ConversationManager] EXECUTION phase: Text response received (length: ${textResponse.length}). Skipping display (EXECUTION phase blocks CODEPILOT text).`);
                                // ✅ EXECUTION phase에서는 CODEPILOT 텍스트를 보내지 않음 (내부 사고로 간주)
                                // 텍스트 응답을 accumulatedUserParts에 추가하여 다음 턴에서 참조 가능하도록 함
                                accumulatedUserParts.push({ text: llmResponseForExecution });
                            }

                            if (currentPlanItem) {
                                taskManager.updatePlanItemStatus(currentPlanItem.id, 'done');
                                WebviewBridge.updateTaskQueue(webviewToRespond, taskManager.listPlanItems());
                            }

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
                                    console.log('[ConversationManager] Tests passed. Transitioning to REVIEW phase.');
                                    stateManager.transitionTo(AgentPhase.REVIEW);
                                    turnCount++;
                                    continue;
                                } else {
                                    if (isAutoTestRetryEnabled && testFixAttempts < maxTestFixAttempts) {
                                        testFixAttempts++;
                                        console.log(`[ConversationManager] 테스트 실패 (${testFixAttempts}/${maxTestFixAttempts}). 에러 메시지를 컨텍스트에 추가하고 계속 진행합니다.`);
                                        accumulatedUserParts.push({
                                            text: `\n[System] 자동 테스트가 실패했습니다. 다음 오류를 수정하세요:\n${testResult.errorMessage || '알 수 없는 오류'}\n\n⚠️ **중요 컨텍스트:**\n- 이미 대부분의 파일은 생성되어 있습니다.\n- 실패 원인만 최소 수정(<update_file>)으로 해결하세요.\n- <create_file>을 사용하여 파일을 다시 만들지 마세요.\n- 파일이 이미 존재하는 경우 반드시 <update_file> 도구를 사용하여 수정하세요.\n\n필요하다면 run_command 도구를 사용하여 의존성을 설치하세요 (예: npm install, pip install -r requirements.txt, mvn install 등).\n`
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
                                    accumulatedUserParts.push({
                                        text: `\n[System] 자동 테스트가 실패했습니다. 다음 오류를 수정하세요:\n${testResult.errorMessage || '알 수 없는 오류'}\n\n⚠️ **중요 컨텍스트:**\n- 이미 대부분의 파일은 생성되어 있습니다.\n- 실패 원인만 최소 수정(<update_file>)으로 해결하세요.\n- <create_file>을 사용하여 파일을 다시 만들지 마세요.\n- 파일이 이미 존재하는 경우 반드시 <update_file> 도구를 사용하여 수정하세요.\n\n필요하다면 run_command 도구를 사용하여 의존성을 설치하세요 (예: npm install, pip install -r requirements.txt, mvn install 등).\n`
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
                ? `\n\n**⚠️ 이미 읽은 파일 목록 (다시 읽지 마세요):**\n${Array.from(preloadedFiles).map(f => `- ${f}`).join('\n')}\n\n이 파일들은 이미 읽었으므로 다시 <read_file>을 호출하지 마세요. 위 대화 기록에서 파일 내용을 확인하세요.`
                : '';

            const planContext = currentPlanItem
                ? `\n\nCURRENT TASK: ${currentPlanItem.title}${currentPlanItem.detail ? `\nDETAIL: ${currentPlanItem.detail}` : ''}${preloadedFilesList}\n\n**중요**: 필요한 파일이 여러 개라면 반드시 한 번의 응답에 모든 도구를 호출하세요. 여러 <read_file>, <list_files>, <update_file>, <create_file> 태그를 동시에 출력하는 것이 허용됩니다. 한 번에 최대한 많은 작업을 수행하세요.`
                : `\n\n=== NO ACTIVE PLAN ===\nAnalyze the user query and proceed with necessary actions (e.g. create a plan using <plan> tag).${preloadedFilesList}\n\n**중요**: 필요한 파일이 여러 개라면 반드시 한 번의 응답에 모든 도구를 호출하세요. 여러 <read_file>, <list_files> 태그를 동시에 출력하는 것이 허용됩니다.`;

            console.log(`[ConversationManager] Calling LLM for Turn ${turnCount + 1} (Phase: ${currentPhase})`);

            const llmResponse = await this.llmManager.sendMessageWithSystemPrompt(
                activeSystemPrompt + planContext,
                accumulatedUserParts,
                { signal: abortSignal }
            );

            console.log(`[ConversationManager] LLM Raw Response (Turn ${turnCount + 1}):`, llmResponse.length > 500 ? llmResponse.substring(0, 500) + '...' : llmResponse);

            // 1. 응답 정제 (<think> 태그 및 JSON 래핑 처리)
            // ⚠️ 핵심 수정: LLM response에서 thinking 노출 차단 강화
            // StringUtils를 사용하여 모든 패턴 제거
            let cleanResponse = StringUtils.cleanText(llmResponse, {
                removeThinking: true,
                removeNaturalLanguage: true, // INVESTIGATION phase에서도 자연어 추론 패턴 제거 (thinking 노출 방지)
                removeSystemMessages: false, // 이 컨텍스트에서는 시스템 메시지 제거하지 않음
                removeToolTags: false, // 도구 태그는 유지
                removeJsonThinking: true,
                extractJson: false
            });

            // XML 태그만 남기고 자연어 텍스트 제거 (EXECUTION phase에서 특히 중요)
            // 🔥 핵심: EXECUTION phase에서는 "생각", "설명" → 전부 무시, XML tool call만 추출
            if (currentPhase === AgentPhase.EXECUTION) {
                // ⚠️ 수정: 중첩된 태그를 제대로 처리하기 위해 Tool enum의 모든 태그를 사용
                const toolNames = Object.values(Tool);
                const allTags = [...toolNames, 'plan', 'task_progress'];

                // 각 태그에 대해 중첩된 구조를 포함하여 매칭
                const matchedTags: string[] = [];
                for (const tag of allTags) {
                    // 중첩된 태그를 포함한 전체 태그 블록 매칭
                    const tagPattern = new RegExp(`<${tag}>[\\s\\S]*?<\\/${tag}>`, 'gi');
                    let match;
                    while ((match = tagPattern.exec(cleanResponse)) !== null) {
                        matchedTags.push(match[0]);
                    }
                }

                if (matchedTags.length > 0) {
                    // XML 태그만 남기고 나머지 자연어 텍스트 완전 제거
                    // 줄바꿈을 유지하여 중첩된 태그 구조 보존
                    cleanResponse = matchedTags.join('\n');
                    console.log(`[ConversationManager] EXECUTION phase: Extracted ${matchedTags.length} XML tag(s), removed all natural language text`);
                } else {
                    // XML 태그가 없으면 자연어 응답으로 간주하고 경고
                    console.warn(`[ConversationManager] EXECUTION phase: No XML tags found. LLM provided natural language instead of tool calls.`);
                    // 자연어 텍스트를 완전히 제거하고 빈 응답으로 처리
                    cleanResponse = '';
                }
            }
            // JSON 래핑 처리는 위의 재시도 루프에서 이미 처리됨

            // 1-1. INVESTIGATION 단계 Output Contract 검증: <plan>과 실행 도구가 함께 나오면 즉시 재요청
            // ⚠️ ripgrep_search는 허용 (조사 행위, 부작용 없음)
            if (currentPhase === AgentPhase.INVESTIGATION) {
                const hasPlanTag = /<plan>[\s\S]*?<\/plan>/i.test(cleanResponse);
                // 실행 도구 태그 패턴 (정규식으로 직접 확인)
                const executionToolPatterns = [
                    /<create_file>/i,
                    /<update_file>/i,
                    /<remove_file>/i,
                    /<run_command>/i
                ];
                const hasExecutionTool = executionToolPatterns.some(pattern => pattern.test(cleanResponse));

                // <plan>과 실행 도구가 함께 있으면 즉시 재요청 (ripgrep_search는 허용)
                if (hasPlanTag && hasExecutionTool) {
                    console.log('[ConversationManager] INVESTIGATION Output Contract Violation: <plan>과 실행 도구가 함께 제공됨. 즉시 재요청합니다.');
                    accumulatedUserParts.push({
                        text: `\n[System] **조사(Investigation) 단계 Output Contract 위반**\n\n` +
                            `조사 단계에서는 다음이 허용됩니다:\n` +
                            `1. 조사 도구 사용: <read_file>, <list_files>, <search_files>, <ripgrep_search> (파일 수정 없이 조사만)\n` +
                            `2. 계획 제출: <plan>...</plan> (실행 도구 없이)\n` +
                            `3. 조사 도구와 <plan> 함께 사용 가능\n\n` +
                            `**절대 금지:** <plan> 태그와 실행 도구(<create_file>, <update_file>, <remove_file>, <run_command>)를 같은 응답에 포함하는 것\n\n` +
                            `올바른 순서:\n` +
                            `1. 먼저 조사 도구로 정보를 수집하세요 (선택사항)\n` +
                            `2. 충분한 정보를 수집한 후 <plan> 태그만 제출하세요 (실행 도구 없이)\n` +
                            `3. 계획이 승인되면 실행 단계로 전환되어 실행 도구를 사용할 수 있습니다.\n\n` +
                            `지금은 조사 도구만 사용하거나, <plan> 태그만 제출하세요.\n`
                    });
                    turnCount++;
                    continue; // 즉시 재요청 (LLM 호출 없이 다음 턴으로)
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
            if (currentPhase === AgentPhase.EXECUTION && cleanResponse.trim()) {
                // XML 태그가 있는지 확인
                const hasXmlTag = /<[a-z_]+>[\s\S]*?<\/[a-z_]+>/i.test(cleanResponse);
                if (!hasXmlTag) {
                    // 텍스트만 있고 XML 태그가 없으면 자연어 응답으로 간주
                    console.warn(`[ConversationManager] EXECUTION phase: LLM provided natural language text instead of tool calls. Rejecting and requesting again.`);
                    accumulatedUserParts.push({
                        text: `\n[System] ⚠️ **EXECUTION 단계 Output Contract 위반**\n\n` +
                            `EXECUTION 단계에서는 자연어 텍스트(생각, 설명, 메타 분석)가 금지되어 있습니다.\n` +
                            `시스템이 자동으로 모든 자연어 텍스트를 무시합니다.\n\n` +
                            `**필수 사항:**\n` +
                            `- 실행 가능한 XML 도구 호출만 출력하세요 (<create_file>, <update_file>, <run_command> 등)\n` +
                            `- 설명 없이 도구만 호출하세요\n` +
                            `- "We need to...", "According to...", "Let's call..." 같은 텍스트는 출력하지 마세요\n` +
                            `- 도구 호출이 필요 없으면 아무것도 출력하지 마세요\n\n` +
                            `**중요:** 당신은 DSL 컴파일러입니다. Planning/Reasoning은 이미 완료되었습니다.\n` +
                            `이제 실행만 하세요. 설명 없이 XML 도구 호출만 제공하세요.\n`
                    });
                    turnCount++;
                    continue; // 즉시 재요청
                }
            }

            // 3. 텍스트와 도구 호출 인터리브 처리
            const toolNames = Object.values(Tool);
            const tags = [...toolNames, 'plan', 'task_progress'];
            const tagPattern = new RegExp(`(<(?:${tags.join('|')})[\\s\\S]*?<\\/(?:${tags.join('|')})>)`, 'gi');

            // 텍스트와 태그 분리 (capturing group을 사용하여 태그도 결과에 포함)
            const parts = cleanResponse.split(tagPattern);

            // 🔥 중복 실행 방지: 전체 cleanResponse에서 모든 tool call을 한 번만 파싱
            const allToolCallsFromResponse = ToolParser.parseToolCalls(cleanResponse);
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

            for (const part of parts) {
                if (!part || !part.trim()) continue;

                // 태그인지 확인
                const isTag = tags.some(tag => part.toLowerCase().startsWith(`<${tag}`) && part.toLowerCase().includes(`</${tag}>`));

                if (isTag) {
                    // 2-1. 플랜 업데이트 처리
                    if (part.toLowerCase().includes('<plan>')) {
                        // 이미 계획이 있고 실행 단계라면 새로운 계획을 무시하고 기존 계획을 계속 진행하도록 안내
                        const existingPlanItems = taskManager.listPlanItems();
                        if (existingPlanItems.length > 0 && currentPhase === AgentPhase.EXECUTION) {
                            console.log('[ConversationManager] Plan already exists, ignoring new plan. Continuing with existing plan.');
                            turnResultsSummary += `\n[System] 이미 작업 계획이 수립되어 있습니다. 새로운 계획을 제출하지 말고 기존 계획의 다음 항목을 계속 진행하세요.\n`;
                            hasPlanTag = true; // 기존 계획이 있음을 표시
                            continue;
                        }

                        // 수립 시작 알림 추가
                        WebviewBridge.sendProcessingStep(webviewToRespond, 'plan');
                        WebviewBridge.sendProcessingStatus(webviewToRespond, 'plan', '작업 계획 분석 및 파싱 중...');

                        const planItems = ToolParser.parsePlanItems(part);
                        if (planItems.length > 0) {
                            // 🔥 문제 해결: execution-first 작업일 때 investigation item 자동 필터링
                            // 공통 함수 사용으로 일관된 판단
                            const isExecutionFirst = this.isExecutionFirstTask(intent, hasExecutionIntentEver, hasActivePlan);
                            let filteredPlanItems = planItems;

                            if (isExecutionFirst) {
                                const investigationItems = planItems.filter(item => item.kind === 'investigation');
                                const executionItems = planItems.filter(item => item.kind === 'execution');

                                if (investigationItems.length > 0 && executionItems.length > 0) {
                                    console.log(`[ConversationManager] ⚠️ Execution-first task detected but plan contains investigation items. Filtering out ${investigationItems.length} investigation item(s).`);
                                    filteredPlanItems = executionItems; // investigation item 제거, execution item만 유지
                                    turnResultsSummary += `\n[System] ⚠️ 실행 작업(execution-first)이므로 조사 항목은 제외하고 실행 항목만 진행합니다.\n`;
                                }
                            }

                            // Plan이 "할 일 없음"을 의미하는지 확인: kind 기반 판별
                            // 모든 plan item이 investigation kind만 있고 execution kind가 없으면 "할 일 없음"
                            const hasExecutionAction = filteredPlanItems.some(item => item.kind === 'execution');
                            const allInvestigationOnly = filteredPlanItems.every(item => item.kind === 'investigation' || !item.kind);

                            // kind가 명시되지 않은 경우, 기본값은 'execution'으로 간주 (하위 호환성)
                            // 따라서 kind가 없으면 실행 작업으로 간주
                            // 🔥 문제 해결: filteredPlanItems 사용 (execution-first에서 investigation item 제거됨)
                            const hasAnyExplicitExecution = filteredPlanItems.some(item => item.kind === 'execution');
                            const allExplicitInvestigation = filteredPlanItems.length > 0 && filteredPlanItems.every(item => item.kind === 'investigation');

                            // ⚠️ 핵심 수정: Investigation 단계에서는 조사 도구가 호출되었다면 "할 일 없음"으로 판단하지 않음
                            // 조사 도구가 없고 investigation kind만 있는 경우, plan의 detail에서 파일 경로를 추출하여 자동으로 조사 도구 실행
                            const allToolCallsInResponse = ToolParser.parseToolCalls(cleanResponse, toolParseWarnings);
                            const investigationTools = [Tool.READ_FILE, Tool.LIST_FILES, Tool.SEARCH_FILES, Tool.RIPGREP_SEARCH];
                            const hasInvestigationToolCalls = allToolCallsInResponse.some(call => investigationTools.includes(call.name as Tool));

                            // ⚠️ 핵심 수정: INVESTIGATION 단계에서 LLM이 직접 조사 도구를 호출하면 실행
                            // LLM이 조사를 완료했다고 판단할 때까지 INVESTIGATION 단계를 유지
                            // 시스템은 중복 읽기만 방지하고, 조사 도구 실행은 LLM이 제어
                            if (currentPhase === AgentPhase.INVESTIGATION && hasInvestigationToolCalls) {
                                // 조사 도구만 필터링
                                const investigationToolCalls = allToolCallsInResponse.filter((call: any) => investigationTools.includes(call.name as Tool));
                                console.log(`[ConversationManager] Investigation phase: LLM called ${investigationToolCalls.length} investigation tool(s). Executing investigation tools.`);

                                // ⚠️ 중복 호출 방지: 이미 읽은 파일은 제외
                                const filteredToolCalls = investigationToolCalls.filter((call: any) => {
                                    if (call.name === Tool.READ_FILE) {
                                        const filePath = call.params.path;
                                        // 이미 읽은 파일인지 확인
                                        if (preloadedFiles.has(filePath)) {
                                            console.log(`[ConversationManager] Skipping already read file from LLM tool call: ${filePath}`);
                                            return false;
                                        }
                                        // accumulatedUserParts에서도 확인
                                        const alreadyRead = accumulatedUserParts.some(part =>
                                            part.text &&
                                            part.text.includes(`[System] ⚠️ **이미 읽은 파일`) &&
                                            part.text.includes(filePath)
                                        );
                                        if (alreadyRead) {
                                            console.log(`[ConversationManager] Skipping already read file from context: ${filePath}`);
                                            preloadedFiles.add(filePath);
                                            return false;
                                        }
                                    }
                                    return true;
                                });

                                if (filteredToolCalls.length > 0) {
                                    console.log(`[ConversationManager] Investigation phase: Executing ${filteredToolCalls.length} investigation tool(s) from LLM (${investigationToolCalls.length - filteredToolCalls.length} skipped as already read).`);

                                    // 조사 도구 실행
                                    const currentProject = ProjectManager.getInstance().getCurrentProject();
                                    const workspaceRoot = currentProject?.root || '';

                                    const toolResults = await toolExecutor.executeTools(filteredToolCalls, {
                                        projectRoot: workspaceRoot,
                                        workspaceRoot: workspaceRoot,
                                        actionManager,
                                        executionManager,
                                        terminalManager,
                                        contextManager: this.contextManager
                                    });

                                    // 조사 도구 실행 결과를 accumulatedUserParts에 추가
                                    let hasListFiles = false;
                                    for (let index = 0; index < toolResults.length; index++) {
                                        const result = toolResults[index];
                                        if (result.success) {
                                            const toolCall = filteredToolCalls[index];
                                            if (toolCall.name === Tool.READ_FILE) {
                                                const filePath = toolCall.params.path;
                                                preloadedFiles.add(filePath);
                                                if (result.data?.content) {
                                                    accumulatedUserParts.push({
                                                        text: `[System] ⚠️ **이미 읽은 파일 (다시 읽지 마세요)**: ${filePath}\n\`\`\`\n${result.data.content}\n\`\`\`\n\n**중요**: 이 파일은 이미 읽었으므로 다시 <read_file>을 호출하지 마세요. 위 내용을 참고하여 작업을 진행하세요.`
                                                    });
                                                }
                                            } else if (toolCall.name === Tool.LIST_FILES) {
                                                hasListFiles = true;
                                            }
                                            hasInvestigationHistory = true;
                                        }
                                    }

                                    // list_files가 호출된 경우 프로젝트 인벤토리 제공
                                    if (hasListFiles) {
                                        try {
                                            const projectManager = ProjectManager.getInstance();
                                            const inventory = await projectManager.buildProjectInventorySection(200);
                                            if (inventory) {
                                                accumulatedUserParts.push({
                                                    text: `${inventory}\n\n**중요**: 위 프로젝트 파일 구조를 참고하여 필요한 파일만 선택적으로 읽으세요.`
                                                });
                                            }
                                        } catch (error) {
                                            console.warn('[ConversationManager] Failed to build project inventory from list_files result:', error);
                                        }
                                    }

                                    // 조사 도구 실행 후 INVESTIGATION 단계 유지 (LLM이 조사 완료 판단할 때까지)
                                    console.log(`[ConversationManager] Investigation tools executed. Remaining in INVESTIGATION phase for LLM to continue investigation or declare completion.`);
                                } else {
                                    console.log(`[ConversationManager] All investigation tool calls were skipped (already read). Remaining in INVESTIGATION phase.`);
                                }
                            }

                            // 실행 작업이 없고 모든 item이 조사 작업만 있고, 조사 도구도 호출되지 않았을 때
                            // ⚠️ 핵심 수정: investigation item이 있으면 시스템이 자동으로 조사 도구를 실행
                            // "LLM should call investigation tools" 규칙 제거 - 시스템이 plan 기반으로 자동 실행
                            // execution item이 함께 있어도 investigation part는 자동 조사 수행
                            // 🔥 문제 해결: filteredPlanItems 사용 (execution-first에서 investigation item 제거됨)
                            const investigationItems = filteredPlanItems.filter(item => item.kind === 'investigation');
                            if (investigationItems.length > 0 && !hasInvestigationToolCalls) {
                                console.log('[ConversationManager] Plan contains investigation tasks. Auto-executing investigation tools based on plan detail.');

                                // plan의 detail에서 파일 경로 추출하여 자동으로 조사 도구 실행
                                const filePathsToRead: string[] = [];
                                const needsListFiles: boolean[] = [];
                                const currentProject = ProjectManager.getInstance().getCurrentProject();
                                const workspaceRoot = currentProject?.root || '';

                                // plan.detail에서 도구 호출 XML 태그 파싱 (ripgrep_search, ast_search 등)
                                const toolCallsFromPlanDetail: any[] = [];

                                investigationItems.forEach(item => {
                                    if (item.detail) {
                                        // ⚠️ 핵심 수정: plan.detail에서 도구 호출 XML 태그 파싱
                                        // 예: "<ripgrep_search><pattern>handleSearch</pattern></ripgrep_search>"
                                        const detailToolCalls = ToolParser.parseToolCalls(item.detail);
                                        detailToolCalls.forEach(toolCall => {
                                            // 조사 도구만 허용 (ripgrep_search, search_files 등)
                                            const investigationTools = [Tool.RIPGREP_SEARCH, Tool.SEARCH_FILES, Tool.LIST_FILES, Tool.READ_FILE];
                                            if (investigationTools.includes(toolCall.name as Tool)) {
                                                toolCallsFromPlanDetail.push({
                                                    name: toolCall.name,
                                                    params: toolCall.params,
                                                    partial: false
                                                });
                                                console.log(`[ConversationManager] Extracted tool call from plan detail: ${toolCall.name} (${JSON.stringify(toolCall.params)})`);
                                            }
                                        });

                                        // ⚠️ 핵심 추가: 함수 검색 키워드 감지 및 자동 ripgrep_search 생성
                                        // "함수 위치", "함수 찾기", "함수 정의", "함수 검색" 등이 있으면 자동으로 ripgrep_search 실행
                                        const functionSearchKeywords = /(?:함수|function).*?(?:위치|찾기|검색|탐색|정의|define|location|find|search)/i;
                                        const hasFunctionSearchIntent = functionSearchKeywords.test(item.detail) ||
                                            /(?:어디|where).*?(?:함수|function)/i.test(item.detail);

                                        if (hasFunctionSearchIntent) {
                                            // 함수명 추출 시도 (사용자 쿼리 → title → detail 순서)
                                            const functionNamePatterns = [
                                                // "test 함수" 또는 "test function" 패턴 (가장 우선)
                                                /([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?:함수|function)/i,
                                                // "함수 test" 또는 "function test" 패턴
                                                /(?:함수|function)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/i,
                                                // "test가 어디" 또는 "test is where" 패턴
                                                /([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?:가|는|이|을|를|어디|where)/i,
                                                // "test 함수가 어디" 같은 복합 패턴
                                                /([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?:함수|function).*?(?:가|는|이|어디|where)/i
                                            ];

                                            let functionName: string | null = null;
                                            const excludedWords = ['src', 'app', 'main', 'index', 'component', 'page', 'file', 'dir', 'directory', 'folder', '디렉터리', '디렉토리'];

                                            // 1. 사용자 쿼리에서 먼저 시도 (가장 정확)
                                            const userQuery = options.userQuery || '';
                                            if (userQuery) {
                                                for (const pattern of functionNamePatterns) {
                                                    const match = userQuery.match(pattern);
                                                    if (match && match[1]) {
                                                        const candidate = match[1].toLowerCase();
                                                        // 일반적인 단어는 제외하되, 실제 함수명일 가능성이 높은 것만 허용
                                                        if (!excludedWords.includes(candidate) && candidate.length >= 2) {
                                                            functionName = match[1];
                                                            extractedFunctionName = functionName; // 전역 변수에 저장
                                                            console.log(`[ConversationManager] Extracted function name from user query: ${functionName}`);
                                                            break;
                                                        }
                                                    }
                                                }
                                            }

                                            // 2. title에서 시도
                                            if (!functionName) {
                                                for (const pattern of functionNamePatterns) {
                                                    const match = item.title.match(pattern);
                                                    if (match && match[1]) {
                                                        const candidate = match[1].toLowerCase();
                                                        if (!excludedWords.includes(candidate) && candidate.length >= 2) {
                                                            functionName = match[1];
                                                            console.log(`[ConversationManager] Extracted function name from title: ${functionName}`);
                                                            break;
                                                        }
                                                    }
                                                }
                                            }

                                            // 3. detail에서 시도 (마지막, 하지만 일반 단어 제외를 더 엄격하게)
                                            if (!functionName) {
                                                for (const pattern of functionNamePatterns) {
                                                    const match = item.detail.match(pattern);
                                                    if (match && match[1]) {
                                                        const candidate = match[1].toLowerCase();
                                                        // detail에서는 더 엄격하게 필터링 (파일 경로나 디렉터리 이름 제외)
                                                        if (!excludedWords.includes(candidate) && candidate.length >= 3 &&
                                                            !candidate.includes('/') && !candidate.includes('\\')) {
                                                            functionName = match[1];
                                                            console.log(`[ConversationManager] Extracted function name from detail: ${functionName}`);
                                                            break;
                                                        }
                                                    }
                                                }
                                            }

                                            if (functionName) {
                                                // ripgrep_search 자동 생성
                                                const searchPattern = `(?:function|const|let|var|export\\s+(?:function|const|let|var)|export\\s+default\\s+function)\\s+${functionName}\\b`;
                                                toolCallsFromPlanDetail.push({
                                                    name: Tool.RIPGREP_SEARCH,
                                                    params: {
                                                        pattern: searchPattern,
                                                        path: '.',
                                                        caseSensitive: 'false'
                                                    },
                                                    partial: false
                                                });
                                                console.log(`[ConversationManager] Auto-generated ripgrep_search for function: ${functionName} (detected from plan detail keywords)`);
                                            }
                                        }

                                        // detail에서 파일 경로 추출 (단순화된 메서드 사용)
                                        const extractedPaths = this.extractFilePathsFromText(item.detail);
                                        let hasFilePaths = false;

                                        extractedPaths.forEach(filePath => {
                                            if (!filePathsToRead.includes(filePath)) {
                                                // 실제로 존재하는 파일만 추가
                                                const fullPath = path.isAbsolute(filePath)
                                                    ? filePath
                                                    : path.join(workspaceRoot, filePath);

                                                try {
                                                    if (fsSync.existsSync(fullPath) && fsSync.statSync(fullPath).isFile()) {
                                                        filePathsToRead.push(filePath);
                                                        hasFilePaths = true;
                                                        console.log(`[ConversationManager] Extracted file path from plan detail: ${filePath}`);
                                                    }
                                                } catch (e) {
                                                    // 파일 접근 실패 시 스킵
                                                }
                                            }
                                        });

                                        // 파일 경로를 찾지 못했지만 detail에 파일명이 명시되어 있는 경우 로그 출력
                                        if (!hasFilePaths && item.detail) {
                                            console.log(`[ConversationManager] Could not extract file paths from plan detail: "${item.detail.substring(0, 100)}..."`);
                                        }

                                        // 파일 경로가 없고, "프로젝트 구조", "파일 목록" 같은 키워드가 있으면 list_files 필요
                                        if (!hasFilePaths) {
                                            const listFilesKeywords = /(프로젝트 구조|파일 목록|파일 리스트|디렉터리|디렉토리|list_files|파일.*목록|구조.*확인|현재.*파일)/i;
                                            if (listFilesKeywords.test(item.detail)) {
                                                needsListFiles.push(true);
                                            }
                                        }
                                    } else {
                                        // detail이 없으면 기본적으로 list_files 필요
                                        needsListFiles.push(true);
                                    }
                                });

                                // 추출된 파일 경로가 있으면 자동으로 조사 도구 실행
                                // ⚠️ 핵심 최적화: 이미 읽은 파일은 제외 (Pre-load/File Context 체크)
                                const filesToRead = filePathsToRead.filter(filePath => {
                                    // 1. preloadedFiles Set에 이미 있는지 확인
                                    if (preloadedFiles.has(filePath)) {
                                        console.log(`[ConversationManager] Skipping already read file (preloadedFiles): ${filePath}`);
                                        return false;
                                    }

                                    // 2. accumulatedUserParts에서 이미 읽은 파일인지 확인
                                    const alreadyReadInContext = accumulatedUserParts.some(part => {
                                        if (!part.text) return false;
                                        // "[System] ⚠️ **이미 읽은 파일" 패턴으로 이미 읽은 파일 표시 확인
                                        if (part.text.includes(`[System] ⚠️ **이미 읽은 파일`)) {
                                            // 파일 경로가 포함되어 있는지 확인
                                            const filePathPattern = new RegExp(`(?:이미 읽은 파일.*?:|파일:)\\s*${filePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
                                            if (filePathPattern.test(part.text)) {
                                                return true;
                                            }
                                        }
                                        return false;
                                    });

                                    if (alreadyReadInContext) {
                                        console.log(`[ConversationManager] Skipping already read file (from accumulatedUserParts): ${filePath}`);
                                        preloadedFiles.add(filePath); // 추적에 추가하여 중복 방지
                                        return false;
                                    }

                                    return true;
                                });

                                // 자동 조사 도구 실행 목록
                                const autoInvestigationToolCalls: any[] = [];

                                // 0. plan.detail에서 파싱된 도구 호출 추가 (최우선)
                                if (toolCallsFromPlanDetail.length > 0) {
                                    console.log(`[ConversationManager] Investigation phase: Auto-executing ${toolCallsFromPlanDetail.length} tool call(s) extracted from plan detail.`);
                                    autoInvestigationToolCalls.push(...toolCallsFromPlanDetail);
                                }

                                // 1. 파일 읽기 도구 추가
                                if (filesToRead.length > 0) {
                                    console.log(`[ConversationManager] Investigation phase: Auto-executing read_file for ${filesToRead.length} files from plan detail: ${filesToRead.join(', ')}`);
                                    if (filePathsToRead.length > filesToRead.length) {
                                        console.log(`[ConversationManager] Skipped ${filePathsToRead.length - filesToRead.length} already read files (Pre-load/Context check)`);
                                    }

                                    filesToRead.forEach(filePath => {
                                        autoInvestigationToolCalls.push({
                                            name: Tool.READ_FILE,
                                            params: { path: filePath },
                                            partial: false
                                        });
                                    });
                                }

                                // 2. list_files 도구 추가 (프로젝트 구조 조사가 필요한 경우)
                                if (needsListFiles.length > 0 && filesToRead.length === 0) {
                                    // 파일 경로가 없고 프로젝트 구조 조사가 필요한 경우 list_files 실행
                                    console.log(`[ConversationManager] Investigation phase: Auto-executing list_files for project structure investigation.`);
                                    autoInvestigationToolCalls.push({
                                        name: Tool.LIST_FILES,
                                        params: { path: '.', recursive: 'true' },
                                        partial: false
                                    });
                                }

                                if (autoInvestigationToolCalls.length > 0) {
                                    // 조사 도구 실행
                                    const toolResults = await toolExecutor.executeTools(autoInvestigationToolCalls, {
                                        projectRoot: workspaceRoot,
                                        workspaceRoot: workspaceRoot,
                                        actionManager,
                                        executionManager,
                                        terminalManager,
                                        contextManager: this.contextManager
                                    });

                                    // UI에 조사 도구 실행 결과 전송 (🧩 [Ripgrep], 📖 [Read] 등)
                                    const uiMsgs3 = ToolExecutionCoordinator.sendToolExecutionResultsToUI(webviewToRespond, autoInvestigationToolCalls, toolResults);
                                    collectedUIMessages.push(...uiMsgs3);

                                    // 조사 도구 실행 결과를 accumulatedUserParts에 추가
                                    let hasListFilesAuto = false;
                                    for (let index = 0; index < toolResults.length; index++) {
                                        const result = toolResults[index];
                                        if (result.success) {
                                            const toolCall = autoInvestigationToolCalls[index];
                                            if (toolCall.name === Tool.RIPGREP_SEARCH) {
                                                // ripgrep_search 결과 처리
                                                if (result.data) {
                                                    // rawResults가 있으면 사용, 없으면 기존 data 사용 (하위 호환성)
                                                    const searchResults = result.data.rawResults || result.data.results || result.data;
                                                    const pattern = toolCall.params.pattern || toolCall.params.query || 'unknown';
                                                    accumulatedUserParts.push({
                                                        text: `[System] ⚠️ **검색 결과 (이미 검색함)**: ${pattern}\n\`\`\`json\n${JSON.stringify(searchResults, null, 2)}\n\`\`\`\n\n**중요**: 이 검색 결과는 이미 확인했으므로 다시 <ripgrep_search>를 호출하지 마세요. 위 검색 결과를 참고하여 작업을 진행하세요.`
                                                    });
                                                    console.log(`[ConversationManager] Added ripgrep_search results for pattern: ${pattern}`);
                                                }
                                            } else if (toolCall.name === Tool.READ_FILE) {
                                                const filePath = toolCall.params.path;
                                                preloadedFiles.add(filePath);
                                                if (result.data?.content) {
                                                    accumulatedUserParts.push({
                                                        text: `[System] ⚠️ **이미 읽은 파일 (다시 읽지 마세요)**: ${filePath}\n\`\`\`\n${result.data.content}\n\`\`\`\n\n**중요**: 이 파일은 이미 읽었으므로 다시 <read_file>을 호출하지 마세요. 위 내용을 참고하여 작업을 진행하세요.`
                                                    });
                                                }
                                            } else if (toolCall.name === Tool.LIST_FILES) {
                                                hasListFilesAuto = true;
                                            }
                                            hasInvestigationHistory = true;
                                        }
                                    }

                                    // list_files가 호출된 경우 프로젝트 인벤토리 제공
                                    if (hasListFilesAuto) {
                                        try {
                                            const projectManager = ProjectManager.getInstance();
                                            const inventory = await projectManager.buildProjectInventorySection(200);
                                            if (inventory) {
                                                accumulatedUserParts.push({
                                                    text: `${inventory}\n\n**중요**: 위 프로젝트 파일 구조를 참고하여 필요한 파일만 선택적으로 읽으세요.`
                                                });
                                            }
                                        } catch (error) {
                                            console.warn('[ConversationManager] Failed to build project inventory from list_files result:', error);
                                        }
                                    }

                                    // 자동 조사가 실제로 수행되었음을 표시 (조사 완료 판정에 사용)
                                    autoInvestigationCompleted = true;

                                    // 🔥 문제 해결: 자동 조사 완료 후 LLM에게 명확한 지시 추가
                                    // execution item이 있으면 자동으로 EXECUTION으로 전환, 없으면 LLM에게 조사 완료 선언 요청
                                    // 🔥 문제 해결: filteredPlanItems 사용 (execution-first에서 investigation item 제거됨)
                                    const hasExecutionItem = filteredPlanItems.some(item => item.kind === 'execution');

                                    if (hasExecutionItem) {
                                        // execution item이 있으면 자동으로 EXECUTION으로 전환
                                        console.log(`[ConversationManager] Auto-investigation completed. Execution items found. Auto-transitioning to EXECUTION phase.`);
                                        const transitionContext = {
                                            hasPlan: true,
                                            toolCallsInTurn: [],
                                            hasInvestigationHistory: true
                                        };
                                        const transitionResult = stateManager.transitionTo(AgentPhase.EXECUTION, transitionContext);
                                        if (transitionResult.success) {
                                            console.log('[ConversationManager] Successfully transitioned to EXECUTION phase after auto-investigation.');
                                            turnResultsSummary += `\n[System] 자동 조사가 완료되었습니다. 이제 '실행(Execution)' 단계입니다.\n`;
                                            // EXECUTION으로 전환했으므로 다음 루프에서 EXECUTION 처리
                                            turnCount++;
                                            continue;
                                        }
                                    } else {
                                        // execution item이 없으면 LLM에게 조사 완료 선언 요청
                                        console.log(`[ConversationManager] Auto-investigation completed. No execution items found. Requesting LLM to declare investigation completion.`);
                                        accumulatedUserParts.push({
                                            text: `\n[System] ⚠️ **자동 조사가 완료되었습니다.**\n\n` +
                                                `다음 파일들이 자동으로 읽혔습니다:\n` +
                                                filePathsToRead.map(path => `- ${path}`).join('\n') + `\n\n` +
                                                `**다음 단계를 선택하세요:**\n` +
                                                `1. **추가 조사가 필요하면**: 조사 도구(<read_file>, <list_files>, <ripgrep_search>)를 사용하여 계속 조사하세요.\n` +
                                                `2. **조사가 완료되었으면**: <investigation_done/> 토큰을 출력하여 조사 완료를 선언하세요.\n` +
                                                `3. **실행 계획이 있으면**: <plan> 태그에 <kind>execution</kind> 항목을 추가하세요.\n\n` +
                                                `**중요**: 조사가 완료되었다고 판단되면 반드시 <investigation_done/> 토큰을 출력하거나 실행 계획을 제시하세요.\n`
                                        });
                                    }
                                } else {
                                    // 파일 경로를 추출할 수 없거나 모든 파일이 이미 읽혔으면 조사 완료로 간주
                                    // investigation item을 자동으로 완료 처리하고 다음 단계로 진행
                                    if (filePathsToRead.length > 0) {
                                        // 파일 경로는 추출되었지만 모두 이미 읽은 경우
                                        console.log(`[ConversationManager] All ${filePathsToRead.length} file(s) mentioned in plan detail are already read. Investigation item is complete. Auto-completing investigation item.`);

                                        // investigation item을 완료 처리
                                        // 🔥 문제 해결: filteredPlanItems 사용 (execution-first에서 investigation item 제거됨)
                                        investigationItems.forEach(item => {
                                            const planItem = filteredPlanItems.find(p => p.title === item.title && p.kind === 'investigation');
                                            if (planItem) {
                                                const taskItem = taskManager.listPlanItems().find(t => t.title === planItem.title);
                                                if (taskItem) {
                                                    taskManager.updatePlanItemStatus(taskItem.id, 'done');
                                                    console.log(`[ConversationManager] Auto-completed investigation item: "${item.title}"`);
                                                }
                                            }
                                        });

                                        WebviewBridge.updateTaskQueue(webviewToRespond, taskManager.listPlanItems());

                                        // 조사가 완료되었으므로 execution item이 있으면 EXECUTION으로 전환, 없으면 LLM에게 안내
                                        // 🔥 문제 해결: filteredPlanItems 사용 (execution-first에서 investigation item 제거됨)
                                        const hasExecutionItem = filteredPlanItems.some(item => item.kind === 'execution');
                                        if (hasExecutionItem) {
                                            // execution item이 있으면 EXECUTION으로 전환
                                            const transitionContext = {
                                                hasPlan: true,
                                                toolCallsInTurn: [],
                                                hasInvestigationHistory: true
                                            };
                                            const transitionResult = stateManager.transitionTo(AgentPhase.EXECUTION, transitionContext);
                                            if (transitionResult.success) {
                                                console.log('[ConversationManager] Investigation complete. Transitioning to EXECUTION phase.');
                                                turnResultsSummary += `\n[System] 조사가 완료되었습니다. 이제 '실행(Execution)' 단계입니다.\n`;
                                            }
                                        } else {
                                            // execution item이 없으면 LLM에게 안내
                                            accumulatedUserParts.push({
                                                text: `\n[System] 조사(Investigation) 항목의 모든 파일이 이미 읽혔습니다. 조사가 완료되었으므로 다음 단계로 진행하세요:\n` +
                                                    `- plan에 <kind>execution</kind> 항목을 추가하거나\n` +
                                                    `- <investigation_done/> 토큰을 사용하여 조사 완료를 선언하세요.\n`
                                            });
                                        }
                                    } else {
                                        // 파일 경로를 추출할 수 없고 list_files도 필요 없고 도구 호출도 없으면 조사 완료로 간주
                                        // ⚠️ 핵심 수정: plan.detail에서 도구 호출이 파싱되었으면 완료 처리하지 않음
                                        if (toolCallsFromPlanDetail.length === 0) {
                                            console.log('[ConversationManager] No files to investigate found in plan detail and no tool calls extracted. Investigation item has no actionable investigation tasks. Auto-completing investigation item.');

                                            // investigation item을 완료 처리
                                            investigationItems.forEach(item => {
                                                const planItem = planItems.find(p => p.title === item.title && p.kind === 'investigation');
                                                if (planItem) {
                                                    const taskItem = taskManager.listPlanItems().find(t => t.title === planItem.title);
                                                    if (taskItem) {
                                                        taskManager.updatePlanItemStatus(taskItem.id, 'done');
                                                        console.log(`[ConversationManager] Auto-completed investigation item: "${item.title}"`);
                                                    }
                                                }
                                            });

                                            WebviewBridge.updateTaskQueue(webviewToRespond, taskManager.listPlanItems());

                                            // 조사가 완료되었으므로 execution item이 있으면 EXECUTION으로 전환, 없으면 LLM에게 안내
                                            const hasExecutionItem = planItems.some(item => item.kind === 'execution');
                                            if (hasExecutionItem) {
                                                // execution item이 있으면 EXECUTION으로 전환
                                                const transitionContext = {
                                                    hasPlan: true,
                                                    toolCallsInTurn: [],
                                                    hasInvestigationHistory: true
                                                };
                                                const transitionResult = stateManager.transitionTo(AgentPhase.EXECUTION, transitionContext);
                                                if (transitionResult.success) {
                                                    console.log('[ConversationManager] Investigation complete. Transitioning to EXECUTION phase.');
                                                    turnResultsSummary += `\n[System] 조사가 완료되었습니다. 이제 '실행(Execution)' 단계입니다.\n`;
                                                }
                                            } else {
                                                // execution item이 없으면 LLM에게 안내
                                                accumulatedUserParts.push({
                                                    text: `\n[System] 조사(Investigation) 항목에서 조사할 파일을 찾을 수 없습니다. 조사가 완료되었으므로 다음 단계로 진행하세요:\n` +
                                                        `- plan에 <kind>execution</kind> 항목을 추가하거나\n` +
                                                        `- <investigation_done/> 토큰을 사용하여 조사 완료를 선언하세요.\n`
                                                });
                                            }
                                        } else {
                                            // 도구 호출이 파싱되었으면 자동 실행을 위해 계속 진행 (위의 autoInvestigationToolCalls에 이미 추가됨)
                                            console.log(`[ConversationManager] Tool calls extracted from plan detail (${toolCallsFromPlanDetail.length}). Will auto-execute them.`);
                                        }
                                    }
                                }
                            }

                            console.log('\n┌──────────────────────────────────────────────────┐');
                            console.log('│ 새로운 작업 계획 수립                      │');
                            planItems.forEach((item, index) => {
                                const title = item.title.length > 40 ? item.title.substring(0, 37) + '...' : item.title;
                                console.log(`│ ${index + 1}. ${title.padEnd(42)} │`);
                                if (item.detail) {
                                    const detail = item.detail.length > 40 ? item.detail.substring(0, 37) + '...' : item.detail;
                                    console.log(`│    - 상세: ${detail.padEnd(38)} │`);
                                }
                            });
                            console.log('└──────────────────────────────────────────────────┘\n');

                            WebviewBridge.sendProcessingStatus(webviewToRespond, 'plan', `작업 계획 수립 완료`);

                            // ⚠️ 핵심 수정: execution plan이 이미 존재하는 경우, investigation-only plan으로 덮어쓰지 않음
                            const existingPlanItemsForQueue = taskManager.listPlanItems();
                            const existingHasExecutionForQueue = existingPlanItemsForQueue.some(item => item.kind === 'execution');
                            // 🔥 문제 해결: filteredPlanItems 사용 (execution-first에서 investigation item 제거됨)
                            const newHasExecutionForQueue = filteredPlanItems.some(item => item.kind === 'execution');

                            if (existingHasExecutionForQueue && !newHasExecutionForQueue && existingPlanItemsForQueue.length > 0) {
                                // 기존 execution plan이 있는데 새로운 plan에 execution이 없다면, 조사 보조 plan으로 간주하고 큐는 유지
                                console.log('[ConversationManager] Existing execution plan items detected. Ignoring new investigation-only plan to preserve execution plan queue.');
                            } else {
                                // 🔥 문제 해결: filteredPlanItems 사용 (execution-first에서 investigation item 제거됨)
                                taskManager.setPlanItems(filteredPlanItems);
                                WebviewBridge.updateTaskQueue(webviewToRespond, taskManager.listPlanItems());
                            }
                            hasPlanTag = true;
                            currentActiveItem = taskManager.getNextPendingItem();

                            // ⚠️ 중복 방지: Pre-load 로직 제거 (Auto-execution에서 이미 처리됨)
                            // Auto-execution에서 plan의 detail을 기반으로 파일을 읽으므로, Pre-load는 불필요
                            // Pre-load는 제거하고 Auto-execution만 사용

                            // 계획이 수립되면 조사 단계 종료 후 실행 단계로 전환
                            if (currentPhase === AgentPhase.INVESTIGATION) {
                                // Investigation에서는 조사 도구만 허용, plan과 함께 실행 도구가 나오면 차단
                                const allToolCallsInThisTurn = ToolParser.parseToolCalls(cleanResponse);
                                // 조사 도구 목록
                                const investigationTools = [Tool.READ_FILE, Tool.LIST_FILES, Tool.SEARCH_FILES, Tool.RIPGREP_SEARCH];
                                // 실행 도구가 있는지 확인
                                const hasExecutionTool = allToolCallsInThisTurn.some(call => !investigationTools.includes(call.name as Tool));

                                if (hasExecutionTool && allToolCallsInThisTurn.length > 0) {
                                    // Investigation에서 실행 도구가 나오면 Output Contract 위반
                                    console.log(`[ConversationManager] ⚠️ INVESTIGATION Output Contract Violation: <plan>과 함께 ${allToolCallsInThisTurn.length}개의 도구 호출이 제공됨 (실행 도구 포함). 즉시 재요청합니다.`);
                                    accumulatedUserParts.push({
                                        text: `\n[System] ⚠️ **조사(Investigation) 단계 Output Contract 위반**\n\n` +
                                            `Investigation 단계에서는 다음이 허용됩니다:\n` +
                                            `- **<plan> 태그**: <plan>...</plan> (실행 도구 없이)\n` +
                                            `- **조사 도구**: <read_file>, <list_files>, <search_files>, <ripgrep_search> (파일 수정 없이 조사만)\n` +
                                            `- **조사 도구와 <plan> 함께 사용 가능**\n` +
                                            `- **다중 파일 읽기**: 필요한 파일이 여러 개라면 반드시 한 번의 응답에 모든 <read_file>을 호출하세요\n` +
                                            `  - 예: <read_file><path>design.md</path></read_file><read_file><path>src/App.tsx</path></read_file><read_file><path>src/main.tsx</path></read_file>\n\n` +
                                            `**절대 금지:** 실행 도구 호출 (<create_file>, <update_file>, <remove_file>, <run_command>)\n\n` +
                                            `**파일 리스트 활용**: 위 대화 기록의 "프로젝트 파일 구조"를 참고하여 필요한 파일만 선택적으로 읽으세요.\n` +
                                            `파일 리스트에 포함된 파일은 존재하는 파일입니다. 파일 리스트에 없는 파일은 생성할 파일이거나 존재하지 않는 파일일 수 있습니다.\n\n` +
                                            `**올바른 형식:**\n` +
                                            `<plan>\n` +
                                            `  <item>\n` +
                                            `    <kind>investigation</kind>\n` +
                                            `    <title>프로젝트 요구사항 파악</title>\n` +
                                            `    <detail>design.md 파일을 읽어 환급금 조회 UI 기능에 대한 요구사항을 파악합니다.</detail>\n` +
                                            `  </item>\n` +
                                            `</plan>\n` +
                                            `<read_file><path>design.md</path></read_file>\n` +
                                            `<read_file><path>src/App.tsx</path></read_file>\n\n` +
                                            `또는\n\n` +
                                            `<read_file><path>design.md</path></read_file>\n` +
                                            `<read_file><path>src/App.tsx</path></read_file>\n` +
                                            `<read_file><path>src/main.tsx</path></read_file>\n\n` +
                                            `지금은 조사 도구만 사용하거나, <plan> 태그만 제출하세요.\n`
                                    });
                                    turnCount++;
                                    continue; // 즉시 재요청
                                }

                                // ⚠️ 핵심 수정: INVESTIGATION 단계에서는 모든 investigation item이 완료될 때까지 유지
                                // <investigation_done/> 토큰이 있거나, 모든 investigation item이 완료되어야만 EXECUTION으로 전환

                                // <investigation_done/> 토큰 확인 (이미 위에서 파싱됨)
                                const investigationDone = investigationDoneToken;

                                // execution kind가 있는 plan item이 있는지 확인 (현재 응답 기준)
                                const hasExecutionPlanItem = planItems.some(item => item.kind === 'execution');

                                // ⚠️ 핵심: 과거 계획까지 포함해 execution intent가 한 번이라도 있었는지 확인
                                const existingPlanItemsForTransition = taskManager.listPlanItems();
                                const hasExecutionIntent = hasExecutionPlanItem ||
                                    existingPlanItemsForTransition.some(item => item.kind === 'execution');
                                // 과거 실행 의도 플래그 유지 (plan이 조사-only로 덮여도 유지)
                                if (hasExecutionIntent) {
                                    hasExecutionIntentEver = true;
                                }

                                // INVESTIGATION phase에서 investigation item 처리
                                const investigationItems = planItems.filter(item => item.kind === 'investigation');

                                // ⚠️ 핵심: investigation item이 완료되었는지 확인
                                // investigation item이 완료되었다는 조건:
                                // 1. investigation 도구가 호출되어 실행되었거나 (hasInvestigationHistory)
                                // 2. <investigation_done/> 토큰이 있거나
                                // 3. investigation item이 자동 완료 처리되었거나 (auto-execution 완료)
                                // 4. autoInvestigationCompleted 플래그 (자동 조사 수행 시)
                                const allInvestigationItemsCompleted = investigationItems.length === 0 ||
                                    investigationDone ||
                                    hasInvestigationHistory ||
                                    autoInvestigationCompleted ||
                                    investigationItems.every(item => {
                                        // TaskManager에서 해당 item이 완료되었는지 확인
                                        const taskItem = taskManager.listPlanItems().find(t => t.title === item.title && t.kind === 'investigation');
                                        return taskItem?.status === 'done' || taskItem?.status === 'skipped';
                                    });

                                if (investigationItems.length > 0 && currentPhase === AgentPhase.INVESTIGATION) {
                                    console.log(`[ConversationManager] Investigation phase: Processing ${investigationItems.length} investigation item(s) in INVESTIGATION phase.`);
                                    console.log(`[ConversationManager] Investigation items completed: ${allInvestigationItemsCompleted} (hasInvestigationHistory: ${hasInvestigationHistory}, investigationDone: ${investigationDone})`);
                                    // investigation item은 INVESTIGATION phase에서 처리 (EXECUTION으로 넘기지 않음)
                                    // LLM이 조사 도구를 호출하여 처리하거나, 이미 처리되었다고 판단하면 <investigation_done/> 토큰 사용
                                }

                                // ⚠️ 핵심 수정: 조사 완료 조건
                                // 1. <investigation_done/> 토큰이 있거나
                                // 2. 모든 investigation item이 완료되었고 과거 어느 시점에서든 execution intent가 있으면 EXECUTION으로 전환
                                // 단, investigation item이 있으면 반드시 완료되어야 함
                                // ⚠️ 핵심 수정: execution-first task 지원
                                // investigation item이 없고 execution intent가 있으면 바로 전환 (조사 불필요)
                                // ⚠️ 핵심 수정: execution item이 없으면 EXECUTION으로 전환하지 않음
                                const hasExecutionItems = planItems.some(item => item.kind === 'execution');
                                // 🔥 문제 해결: 공통 함수 사용으로 execution-first 판단 일관성 보장
                                const isExecutionFirst = this.isExecutionFirstTask(intent, hasExecutionIntentEver, hasActivePlan, hasExecutionIntent);
                                // 🔥 문제 해결: 자동 조사 완료 후 execution item이 있으면 자동 전환
                                // 🔥 논리 연산자 우선순위 명확화: 괄호 추가
                                const canTransitionToExecution = (investigationDone || allInvestigationItemsCompleted) && (
                                    (hasExecutionItems && isExecutionFirst) || // execution item이 있고 execution-first면 전환
                                    (investigationItems.length === 0 && isExecutionFirst) || // investigation item이 없고 execution-first면 바로 전환 가능
                                    (!hasInvestigationHistory && isExecutionFirst && investigationItems.length === 0) || // execution-first task: 조사 없이 바로 실행
                                    (autoInvestigationCompleted && hasExecutionItems && isExecutionFirst) // 🔥 자동 조사 완료 + execution item 있으면 전환
                                );

                                // ⚠️ 핵심 수정: analysis intent이고 investigation-only인 경우, <investigation_done/> 후 바로 답변 생성
                                // 🔥 문제 해결: 공통 함수 사용으로 execution-first 판단 일관성 보장
                                const isExecutionFirstForAnalysis = this.isExecutionFirstTask(intent, hasExecutionIntentEver, hasActivePlan, hasExecutionIntent);
                                if (investigationDone && intent && intent.category === 'analysis' && !isExecutionFirstForAnalysis) {
                                    console.log('[ConversationManager] Analysis intent with investigation_done. Calling LLM to generate answer.');
                                    const analysisPrompt = systemPrompt + getGeneralAnalysisPrompt();

                                    const analysisResponse = await this.llmManager.sendMessageWithSystemPrompt(
                                        analysisPrompt,
                                        accumulatedUserParts,
                                        { signal: abortSignal }
                                    );

                                    // 응답 정제: StringUtils 사용
                                    let cleanAnalysisResponse = StringUtils.cleanText(analysisResponse, {
                                        removeThinking: true,
                                        removeNaturalLanguage: false, // 분석 응답은 자연어 포함 가능
                                        removeSystemMessages: false,
                                        removeToolTags: true,
                                        removeJsonThinking: true,
                                        extractJson: true
                                    });

                                    // 응답이 비어있거나 너무 짧은 경우 기본 메시지
                                    if (!cleanAnalysisResponse || cleanAnalysisResponse.length < 2) {
                                        cleanAnalysisResponse = '조사 결과를 바탕으로 답변을 생성할 수 없습니다.';
                                    }

                                    console.log(`[ConversationManager] Sending analysis response to webview (length: ${cleanAnalysisResponse.length}): ${cleanAnalysisResponse.substring(0, 100)}...`);
                                    // 🔥 문제 해결: 'Assistant' sender는 webview에서 처리되지 않으므로 'CODEPILOT'으로 변경
                                    WebviewBridge.receiveMessage(webviewToRespond, 'CODEPILOT', cleanAnalysisResponse);

                                    // DONE으로 전환
                                    stateManager.transitionTo(AgentPhase.DONE, {});
                                    console.log('[ConversationManager] Analysis response sent. Transitioning to DONE.');
                                    break;
                                }

                                if (canTransitionToExecution) {
                                    // EXECUTION으로 전환
                                    const toolCallsInThisTurn: any[] = []; // Investigation에서는 조사 도구만 실행, 실행 도구는 EXECUTION에서 처리

                                    // 전환 컨텍스트 준비
                                    const transitionContext = {
                                        hasPlan: true,
                                        toolCallsInTurn: toolCallsInThisTurn,
                                        hasInvestigationHistory: hasInvestigationHistory
                                    };

                                    // FSM을 통한 상태 전환 시도
                                    const transitionResult = stateManager.transitionTo(AgentPhase.EXECUTION, transitionContext);

                                    if (transitionResult.success) {
                                        if (investigationDone) {
                                            console.log('[ConversationManager] Investigation phase: <investigation_done/> token received. Transitioning to EXECUTION phase.');
                                            turnResultsSummary += `\n[System] 조사가 완료되었습니다. 이제 '실행(Execution)' 단계입니다. 수립한 계획의 첫 번째 항목부터 즉시 작업을 시작하세요.\n`;
                                        } else {
                                            console.log('[ConversationManager] Valid plan received with execution items, transitioning to EXECUTION phase via FSM');
                                            turnResultsSummary += `\n[System] 계획이 승인되었습니다. 이제 '실행(Execution)' 단계입니다. 수립한 계획의 첫 번째 항목부터 즉시 작업을 시작하세요.\n`;
                                        }
                                    } else {
                                        // 전환 실패
                                        console.log(`[ConversationManager] Plan received but transition blocked: ${transitionResult.reason}`);
                                        turnResultsSummary += `\n[System] 경고: 계획 수립 중 오류가 발생했습니다. 다시 시도해 주세요.\n`;
                                    }
                                } else {
                                    // ⚠️ 조사가 완료되었지만 execution item이 없는 경우
                                    // 🔥 문제 해결: 자동 조사 완료 후 LLM에게 명확한 지시 추가
                                    const hasExecutionItems = planItems.some(item => item.kind === 'execution');

                                    // 자동 조사가 완료되었고 execution item이 없으면 LLM에게 조사 완료 선언 요청
                                    if (autoInvestigationCompleted && !hasExecutionItems && !hasExecutionIntentEver && !hasExecutionIntent) {
                                        console.log('[ConversationManager] Auto-investigation completed but no execution items. Requesting LLM to declare completion or create execution plan.');

                                        // 조사 결과를 바탕으로 다음 단계 계획을 요청
                                        accumulatedUserParts.push({
                                            text: `\n[System] ⚠️ **자동 조사가 완료되었습니다.**\n\n` +
                                                `**다음 단계를 선택하세요:**\n` +
                                                `1. **조사가 완료되었으면**: <investigation_done/> 토큰을 출력하여 조사 완료를 선언하세요.\n` +
                                                `2. **실행 계획이 있으면**: <plan> 태그에 <kind>execution</kind> 항목을 추가하세요.\n` +
                                                `3. **추가 조사가 필요하면**: 조사 도구(<read_file>, <list_files>, <ripgrep_search>)를 사용하여 계속 조사하세요.\n\n` +
                                                `**중요**: 조사가 완료되었다고 판단되면 반드시 <investigation_done/> 토큰을 출력하거나 실행 계획을 제시하세요.\n`
                                        });

                                        // INVESTIGATION phase에서 계속 진행 (다음 턴에서 LLM이 execution plan을 제시할 것)
                                        console.log('[ConversationManager] Remaining in INVESTIGATION phase for LLM to declare completion or create execution plan.');
                                        turnCount++;
                                        continue;
                                    }

                                    if (allInvestigationItemsCompleted && !hasExecutionItems && !hasExecutionIntentEver && !hasExecutionIntent) {
                                        console.log('[ConversationManager] Investigation completed but no execution items. Requesting next step plan from LLM.');

                                        // 조사 결과를 바탕으로 다음 단계 계획을 요청
                                        accumulatedUserParts.push({
                                            text: `\n[System] ⚠️ 조사(Investigation)가 완료되었습니다. 조사 결과를 바탕으로 다음 단계 계획을 세우세요:\n` +
                                                `- 조사한 내용(design.md, src/App.tsx 등)을 바탕으로 실행(execution) 계획을 수립하세요.\n` +
                                                `- <plan> 태그를 사용하여 <kind>execution</kind> 항목을 포함한 계획을 제시하세요.\n` +
                                                `- 예: "RefundLookup 컴포넌트 생성", "App.tsx 수정" 등 실제 파일 생성/수정 작업을 계획하세요.\n` +
                                                `- 또는 <investigation_done/> 토큰을 출력하여 조사 완료를 선언하세요.\n`
                                        });

                                        // INVESTIGATION phase에서 계속 진행 (다음 턴에서 LLM이 execution plan을 제시할 것)
                                        console.log('[ConversationManager] Remaining in INVESTIGATION phase for LLM to create execution plan.');
                                        turnCount++;
                                        continue;
                                    }

                                    // ⚠️ 조사 도구는 모두 실행되었고, execution intent도 없고 <investigation_done/> 토큰도 없는 경우
                                    if (!hasExecutionIntentEver && !hasExecutionIntent && allInvestigationItemsCompleted) {
                                        // 조사만 필요한 작업이 모두 완료된 상태
                                        console.log('[ConversationManager] Investigation phase: Only investigation tasks were requested and all investigations are completed.');

                                        // 분석(analysis) 의도인 경우: 조사 결과를 바탕으로 한 번 더 LLM을 호출해 직접 답변하도록 함
                                        if (intent && intent.category === 'analysis') {
                                            console.log('[ConversationManager] Analysis intent detected. Calling LLM once to answer analysis question from investigated context.');
                                            const analysisPrompt = systemPrompt + getGeneralAnalysisPrompt();

                                            const analysisResponse = await this.llmManager.sendMessageWithSystemPrompt(
                                                analysisPrompt,
                                                accumulatedUserParts,
                                                { signal: abortSignal }
                                            );

                                            // 응답 정제: StringUtils 사용
                                            let cleanAnalysisResponse = StringUtils.cleanText(analysisResponse, {
                                                removeThinking: true,
                                                removeNaturalLanguage: false, // 분석 응답은 자연어 포함 가능
                                                removeSystemMessages: false,
                                                removeToolTags: true,
                                                removeJsonThinking: true,
                                                extractJson: true
                                            });

                                            // 응답이 비어있거나 너무 짧은 경우 기본 메시지
                                            if (!cleanAnalysisResponse || cleanAnalysisResponse.length < 2) {
                                                cleanAnalysisResponse = '조사 결과를 바탕으로 답변을 생성할 수 없습니다.';
                                            }

                                            console.log(`[ConversationManager] Sending analysis response to webview (length: ${cleanAnalysisResponse.length}): ${cleanAnalysisResponse.substring(0, 100)}...`);
                                            // 🔥 문제 해결: 'Assistant' sender는 webview에서 처리되지 않으므로 'CODEPILOT'으로 변경
                                            WebviewBridge.receiveMessage(webviewToRespond, 'CODEPILOT', cleanAnalysisResponse);
                                        } else {
                                            // 그 외 순수 조사-only 작업: 기존 시스템 메시지로 종료
                                            WebviewBridge.receiveMessage(
                                                webviewToRespond,
                                                'System',
                                                '조사(Investigation)만 필요한 작업이 모두 완료되었습니다. 추가 실행(execution) 작업이 계획에 없으므로 에이전트를 종료합니다.'
                                            );
                                        }

                                        WebviewBridge.sendProcessingStatus(
                                            webviewToRespond,
                                            'done',
                                            '조사만 필요한 작업이 완료되었습니다.'
                                        );
                                        stateManager.transitionTo(AgentPhase.DONE);
                                        return;
                                    } else {
                                        // 조사 도구가 호출되었지만 execution plan item도 없고 <investigation_done/> 토큰도 없으면 INVESTIGATION 유지
                                        console.log('[ConversationManager] Investigation phase: Investigation tools executed but no execution plan items or <investigation_done/> token. Remaining in INVESTIGATION phase for LLM to continue investigation or declare completion.');
                                        // INVESTIGATION 단계 유지 - LLM이 조사를 계속하거나 <investigation_done/> 토큰을 사용하여 완료 선언할 때까지 대기
                                    }
                                }
                            }
                        } else {
                            console.warn('[ConversationManager] Plan tag found but items are invalid/missing');
                            if (currentPhase === AgentPhase.INVESTIGATION) {
                                turnResultsSummary += `\n[Error] 제출된 계획의 형식이 올바르지 않습니다. 반드시 <item><title>...</title><detail>...</detail></item> 구조를 사용해 주세요. 조사를 계속하거나 올바른 형식으로 계획을 다시 제출하세요.\n`;
                            }
                        }
                    }
                    // 2-2. 진행 상황 업데이트 처리
                    else if (part.toLowerCase().includes('<task_progress>')) {
                        const progress = ToolParser.parseTaskProgress(part);
                        if (progress) {
                            console.log('[ConversationManager] Received Task Progress:', progress);
                        }
                    }
                    // 2-3. 도구 실행 처리
                    else {
                        // 🔥 중복 실행 방지: 이미 파싱된 tool calls를 재사용 (전체 cleanResponse는 위에서 한 번만 파싱)
                        // part에서 파싱된 tool call과 이미 파싱된 전체 응답의 tool call을 병합 (중복 제거)
                        const toolCallsFromPart = ToolParser.parseToolCalls(part);
                        const toolCallsMap = new Map<string, any>();

                        // part에서 파싱된 tool calls만 사용 (이미 파싱된 전체 응답은 재사용하지 않음 - 중복 방지)
                        // 전체 응답은 이미 위에서 파싱했으므로, part에서만 파싱한 결과를 사용
                        toolCallsFromPart.forEach(call => {
                            const key = `${call.name}:${JSON.stringify(call.params)}`;
                            // 이미 실행된 tool call은 제외
                            if (!executedInTurn.has(key)) {
                                toolCallsMap.set(key, call);
                            } else {
                                console.log(`[ConversationManager] Skipping already executed tool call from part: ${call.name} (key: ${key})`);
                            }
                        });

                        const toolCalls = Array.from(toolCallsMap.values());

                        if (toolCalls.length === 0) {
                            console.log(`[ConversationManager] All tool calls from this part were already executed. Skipping.`);
                            continue;
                        }

                        if (toolCalls.length > 0) {
                            // FSM을 사용한 도구 허용 여부 검증
                            const blockedCalls = toolCalls.filter(call => !stateManager.isToolAllowed(call.name as Tool));

                            if (blockedCalls.length > 0) {
                                console.log(`[ConversationManager] Blocking forbidden tools in ${currentPhase} phase: ${blockedCalls.map(c => c.name).join(', ')}`);
                                const forbiddenTools = stateManager.getForbiddenTools();

                                // INVESTIGATION 단계에서 EXECUTION 도구 차단 시 처리
                                if (currentPhase === AgentPhase.INVESTIGATION) {
                                    // ⚠️ 핵심 수정: execution intent가 있으면 INVESTIGATION을 건너뛰고 EXECUTION으로 전환
                                    const existingPlanItems = taskManager.listPlanItems();
                                    const hasExecutionIntentInHistory = existingPlanItems.some(item => item.kind === 'execution');

                                    // execution intent가 있으면 INVESTIGATION을 건너뛰고 EXECUTION으로 전환
                                    if (hasExecutionIntentInHistory || executionIntent) {
                                        console.log(`[ConversationManager] Execution intent detected. Transitioning from INVESTIGATION to EXECUTION to allow execution tools.`);
                                        console.log(`[ConversationManager] Original tool calls: ${toolCalls.map(c => c.name).join(', ')}`);
                                        console.log(`[ConversationManager] Blocked calls: ${blockedCalls.map(c => c.name).join(', ')}`);

                                        const transitionContext = {
                                            hasPlan: existingPlanItems.length > 0,
                                            toolCallsInTurn: toolCalls,
                                            hasInvestigationHistory: hasInvestigationHistory
                                        };

                                        const transitionResult = stateManager.transitionTo(AgentPhase.EXECUTION, transitionContext);
                                        if (transitionResult.success) {
                                            console.log('[ConversationManager] Successfully transitioned to EXECUTION phase for execution-first task.');
                                            turnResultsSummary += `\n[System] 실행(Execution) 의도가 감지되어 조사(Investigation) 단계를 건너뛰고 실행 단계로 전환합니다.\n`;

                                            // ⚠️ 핵심 수정: EXECUTION phase로 전환되었으므로 모든 execution tool을 허용
                                            // INVESTIGATION에서 차단되었던 도구들도 이제 허용됨
                                            // 전환 후에는 blockedCalls를 무시하고 모든 tool calls를 실행
                                            const executionToolCalls = toolCalls.filter(call => {
                                                // EXECUTION phase에서는 모든 execution tool 허용
                                                const executionTools = [Tool.CREATE_FILE, Tool.UPDATE_FILE, Tool.REMOVE_FILE, Tool.RUN_COMMAND];
                                                const isExecutionTool = executionTools.includes(call.name as Tool);
                                                if (isExecutionTool) {
                                                    console.log(`[ConversationManager] Allowing execution tool after transition: ${call.name}`);
                                                }
                                                return isExecutionTool;
                                            });

                                            console.log(`[ConversationManager] Filtered ${executionToolCalls.length} execution tool call(s) after transition (from ${toolCalls.length} total).`);

                                            if (executionToolCalls.length > 0) {
                                                // 전환 후 바로 도구 실행을 위해 toolCalls를 교체
                                                // toolCalls 배열을 executionToolCalls로 교체
                                                toolCalls.length = 0;
                                                toolCalls.push(...executionToolCalls);
                                                // blockedCalls를 비워서 아래 도구 실행 로직으로 진행하도록 함
                                                blockedCalls.length = 0;
                                                console.log(`[ConversationManager] Will execute ${executionToolCalls.length} tool call(s): ${executionToolCalls.map(c => c.name).join(', ')}`);
                                                // 아래 도구 실행 로직으로 계속 진행 (blockedCalls가 비어있으므로 if 블록을 통과)
                                            } else {
                                                // 모든 tool call이 blocked이면 다음 턴으로
                                                console.log(`[ConversationManager] All tool calls were blocked. Continuing to next turn.`);
                                                accumulatedUserParts.push({ text: llmResponse });
                                                accumulatedUserParts.push({ text: turnResultsSummary });
                                                turnCount++;
                                                continue;
                                            }
                                        } else {
                                            // 전환 실패 시 기존 메시지 표시
                                            turnResultsSummary += `\n[System] ⚠️ 조사(Investigation) 단계에서는 실행 도구(${blockedCalls.map(c => c.name).join(', ')})를 사용할 수 없습니다.\n`;
                                            turnResultsSummary += `**필수 순서:**\n`;
                                            turnResultsSummary += `1. 먼저 조사 도구(<read_file>, <list_files>, <ripgrep_search>)를 사용하여 정보를 수집하세요.\n`;
                                            turnResultsSummary += `2. 충분한 정보를 수집한 후 <plan> 태그를 사용하여 작업 계획을 수립하세요.\n`;
                                            turnResultsSummary += `3. 계획이 승인되면 실행 단계로 전환되어 실행 도구를 사용할 수 있습니다.\n\n`;
                                            turnResultsSummary += `지금은 조사 도구만 사용하거나 계획을 수립하세요.\n`;

                                            accumulatedUserParts.push({ text: llmResponse });
                                            accumulatedUserParts.push({ text: turnResultsSummary });
                                            turnCount++;
                                            continue;
                                        }
                                    } else {
                                        // execution intent가 없으면 기존 메시지 표시
                                        turnResultsSummary += `\n[System] ⚠️ 조사(Investigation) 단계에서는 실행 도구(${blockedCalls.map(c => c.name).join(', ')})를 사용할 수 없습니다.\n`;
                                        turnResultsSummary += `**필수 순서:**\n`;
                                        turnResultsSummary += `1. 먼저 조사 도구(<read_file>, <list_files>, <ripgrep_search>)를 사용하여 정보를 수집하세요.\n`;
                                        turnResultsSummary += `2. 충분한 정보를 수집한 후 <plan> 태그를 사용하여 작업 계획을 수립하세요.\n`;
                                        turnResultsSummary += `3. 계획이 승인되면 실행 단계로 전환되어 실행 도구를 사용할 수 있습니다.\n\n`;
                                        turnResultsSummary += `지금은 조사 도구만 사용하거나 계획을 수립하세요.\n`;

                                        accumulatedUserParts.push({ text: llmResponse });
                                        accumulatedUserParts.push({ text: turnResultsSummary });
                                        turnCount++;
                                        continue;
                                    }
                                } else {
                                    // EXECUTION phase에서는 blockedCalls를 무시하고 실행
                                    // (AgentStateManager에서 EXECUTION phase는 모든 도구 허용이지만, 
                                    //  혹시 모를 차단을 방지하기 위해 명시적으로 허용)
                                    if (currentPhase === AgentPhase.EXECUTION) {
                                        console.log(`[ConversationManager] EXECUTION phase: blockedCalls detected but allowing execution. Filtering out blocked calls.`);
                                        // blockedCalls를 제외한 나머지 tool calls만 실행
                                        const allowedCalls = toolCalls.filter(call => !blockedCalls.some(blocked =>
                                            blocked.name === call.name && JSON.stringify(blocked.params) === JSON.stringify(call.params)
                                        ));

                                        if (allowedCalls.length > 0) {
                                            // toolCalls를 allowedCalls로 교체하고 blockedCalls를 비움
                                            toolCalls.length = 0;
                                            toolCalls.push(...allowedCalls);
                                            blockedCalls.length = 0;
                                            console.log(`[ConversationManager] EXECUTION phase: Will execute ${allowedCalls.length} allowed tool call(s): ${allowedCalls.map(c => c.name).join(', ')}`);
                                            // 아래 도구 실행 로직으로 계속 진행
                                        } else {
                                            // 모든 tool call이 blocked이면 REVIEW로 전환
                                            // (테스트가 이미 성공했거나, 더 이상 실행할 작업이 없는 경우)
                                            console.log(`[ConversationManager] EXECUTION phase: All tool calls were blocked. Checking if should transition to REVIEW.`);

                                            // 테스트가 이미 성공했는지 확인 (testFixAttempts가 0이고 테스트가 통과한 경우)
                                            // 또는 더 이상 실행할 plan item이 없는 경우
                                            const hasRemainingPlanItems = taskManager.getNextPendingItem() !== null;

                                            if (!hasRemainingPlanItems) {
                                                // 더 이상 실행할 작업이 없으면 REVIEW로 전환
                                                console.log(`[ConversationManager] No remaining plan items. Transitioning to REVIEW phase.`);
                                                stateManager.transitionTo(AgentPhase.REVIEW);
                                                turnCount++;
                                                continue; // 다음 루프에서 REVIEW 처리
                                            } else {
                                                // 아직 실행할 작업이 있으면 다음 턴으로
                                                console.log(`[ConversationManager] EXECUTION phase: All tool calls were blocked but plan items remain. Continuing to next turn.`);
                                                turnResultsSummary += `\n[System] ⚠️ 모든 도구 호출이 차단되었습니다. 다시 시도하세요.\n`;
                                                accumulatedUserParts.push({ text: llmResponse });
                                                accumulatedUserParts.push({ text: turnResultsSummary });
                                                turnCount++;
                                                continue;
                                            }
                                        }
                                    } else {
                                        // INVESTIGATION이 아닌 다른 phase에서 blockedCalls가 있으면 차단
                                        turnResultsSummary += `\n[System] ${stateManager.getStateDescription()}\n`;
                                        turnResultsSummary += `다음 도구는 현재 단계에서 사용할 수 없습니다: ${forbiddenTools.join(', ')}\n`;

                                        accumulatedUserParts.push({ text: llmResponse });
                                        accumulatedUserParts.push({ text: turnResultsSummary });
                                        turnCount++;
                                        continue;
                                    }
                                }
                            }

                            // 조사 도구 사용 시 이력 기록
                            if (currentPhase === AgentPhase.INVESTIGATION) {
                                const investigationTools = [Tool.READ_FILE, Tool.LIST_FILES, Tool.SEARCH_FILES, Tool.RIPGREP_SEARCH];
                                if (toolCalls.some(call => investigationTools.includes(call.name as Tool))) {
                                    hasInvestigationHistory = true;
                                }
                            }

                            // 중복 도구 호출 방지 (동일 파라미터인 경우)
                            // 🔥 문제 1 해결: run_command 중복 실행 방지 강화 (전역 추적 + 실행 직전 최종 확인)
                            const deduplicatedCalls = toolCalls.filter(call => {
                                const key = `${call.name}:${JSON.stringify(call.params)}`;

                                // 현재 턴에서 이미 실행된 경우
                                if (executedInTurn.has(key)) {
                                    console.log(`[ConversationManager] Skipping duplicate tool call in same turn: ${call.name} (key: ${key})`);
                                    return false;
                                }

                                // run_command의 경우, 동일 명령어가 최근에 실행되었는지 확인 (전역 추적)
                                if (call.name === Tool.RUN_COMMAND && call.params.command) {
                                    const command = call.params.command.trim();
                                    // 최근 실행된 명령어와 비교 (npm install, pip install 등)
                                    if (recentlyExecutedCommands.has(command)) {
                                        console.log(`[ConversationManager] Skipping duplicate command execution (recently executed): ${command}`);
                                        return false;
                                    }
                                    // 실행 예정 명령어로 추가 (실행 전에 미리 추가하여 중복 방지)
                                    recentlyExecutedCommands.add(command);
                                }

                                // 실행 예정으로 표시 (실제 실행 전에 미리 추가)
                                executedInTurn.add(key);
                                return true;
                            });

                            // 🔥 최종 안전장치: 실행 직전에 한 번 더 중복 확인
                            const finalDeduplicatedCalls = deduplicatedCalls.filter(call => {
                                const key = `${call.name}:${JSON.stringify(call.params)}`;
                                if (executedInTurn.has(key) && !deduplicatedCalls.includes(call)) {
                                    console.log(`[ConversationManager] Final check: Skipping duplicate tool call: ${call.name} (key: ${key})`);
                                    return false;
                                }
                                return true;
                            });

                            if (finalDeduplicatedCalls.length === 0) {
                                console.log(`[ConversationManager] All tool calls were filtered out as duplicates. Skipping execution.`);
                                continue;
                            }

                            console.log(`[ConversationManager] Executing Tools (${finalDeduplicatedCalls.length} after deduplication):`, finalDeduplicatedCalls.map(call => call.name));

                            // 도구 실행 직전에 해당 계획 항목을 '진행 중'으로 변경
                            if (currentActiveItem && currentActiveItem.status === 'pending') {
                                taskManager.updatePlanItemStatus(currentActiveItem.id, 'in_progress');
                                WebviewBridge.updateTaskQueue(webviewToRespond, taskManager.listPlanItems());
                            }

                            WebviewBridge.sendProcessingStep(webviewToRespond, 'executing');
                            const executingPrefix = currentActiveItem ? `[${currentActiveItem.title}] ` : '';
                            const phaseLabelExec = currentPhase === AgentPhase.INVESTIGATION ? '[조사]' : '[실행]';
                            WebviewBridge.sendProcessingStatus(webviewToRespond, 'executing', `${phaseLabelExec}[단계 ${turnCount + 1}] ${executingPrefix}${ToolExecutionCoordinator.getToolLabel(finalDeduplicatedCalls[0].name)} 실행 중...`);

                            const currentProject = ProjectManager.getInstance().getCurrentProject();
                            const workspaceRoot = currentProject?.root || '';

                            const toolResults = await toolExecutor.executeTools(finalDeduplicatedCalls, {
                                projectRoot: workspaceRoot,
                                workspaceRoot: workspaceRoot,
                                actionManager,
                                executionManager,
                                terminalManager,
                                contextManager: this.contextManager,
                                webview: webviewToRespond // diff 승인을 위한 webview 전달
                            });

                            // UI에 실행 결과 전송 (✅ [Created] ...)
                            const uiMsgs4 = ToolExecutionCoordinator.sendToolExecutionResultsToUI(webviewToRespond, finalDeduplicatedCalls, toolResults);
                            collectedUIMessages.push(...uiMsgs4);

                            // read_file 결과를 preloadedFiles에 추가 (중복 읽기 방지)
                            finalDeduplicatedCalls.forEach((call, index) => {
                                if (call.name === Tool.READ_FILE && toolResults[index]?.success) {
                                    const filePath = call.params.path || call.params.paths?.split(',')[0];
                                    if (filePath) {
                                        preloadedFiles.add(filePath);
                                    }
                                }
                            });

                            // 파일 변경 추적 (요약 검증용)
                            ToolExecutionCoordinator.trackFileChanges(finalDeduplicatedCalls, toolResults, createdFiles, modifiedFiles);

                            // 결과 요약 누적
                            const resultSummary = ToolExecutionCoordinator.createToolResultSummary(turnCount, finalDeduplicatedCalls, toolResults);
                            turnResultsSummary += resultSummary;

                            // ⚠️ 핵심 수정: 테스트 실패 후 수정 시도한 경우, 도구 실행 후 자동으로 테스트 재실행
                            const hasRunCommand = finalDeduplicatedCalls.some(call => call.name === Tool.RUN_COMMAND);
                            const hasWriteTool = finalDeduplicatedCalls.some(call =>
                                [Tool.CREATE_FILE, Tool.UPDATE_FILE, Tool.REMOVE_FILE, Tool.RUN_COMMAND].includes(call.name as Tool)
                            );

                            // 🔥 문제 1 해결: 중복 테스트 실행 방지
                            // "All tasks completed" 경로에서만 테스트 실행하므로, 여기서는 테스트를 실행하지 않음

                            if (ToolExecutionCoordinator.hasSideEffects(finalDeduplicatedCalls, toolResults)) {
                                turnHasSideEffects = true;

                                // ⚠️ 핵심 수정: plan.detail에 언급된 모든 파일이 처리되었을 때만 plan item을 완료
                                const activeItemForDoneCheck = currentActiveItem;
                                if (activeItemForDoneCheck && activeItemForDoneCheck.detail && activeItemForDoneCheck.kind !== 'investigation') {
                                    // 단순화된 파일 경로 추출 메서드 사용
                                    const mentionedInCurrentItem = activeItemForDoneCheck.detail
                                        ? this.extractFilePathsFromText(activeItemForDoneCheck.detail)
                                        : [];

                                    if (mentionedInCurrentItem.length > 0 && currentActiveItem) {
                                        const allCompletedFilesForDone = [...createdFiles, ...modifiedFiles];
                                        const completedForItem = mentionedInCurrentItem.filter(file =>
                                            allCompletedFilesForDone.some(completed =>
                                                completed === file || completed.endsWith(file) || file.endsWith(completed)
                                            )
                                        ).length;

                                        // 이 plan item에서 언급된 파일을 모두 처리했을 때만 done
                                        if (completedForItem === mentionedInCurrentItem.length && activeItemForDoneCheck) {
                                            console.log(`[ConversationManager] Marking current item as done (all mentioned files processed): ${activeItemForDoneCheck.title}`);
                                            taskManager.updatePlanItemStatus(activeItemForDoneCheck.id, 'done');
                                            currentActiveItem = taskManager.getNextPendingItem();
                                            WebviewBridge.updateTaskQueue(webviewToRespond, taskManager.listPlanItems());
                                        } else {
                                            console.log(`[ConversationManager] Current item not fully completed yet (${completedForItem}/${mentionedInCurrentItem.length} files). Keeping item in progress.`);
                                        }
                                    } else if (currentActiveItem) {
                                        // detail에 파일이 명시되지 않은 경우에는 기존 로직대로 한 번의 사이드 이팩트로 완료 처리
                                        console.log(`[ConversationManager] Marking current item as done (no explicit file list in detail): ${currentActiveItem.title}`);
                                        taskManager.updatePlanItemStatus(currentActiveItem.id, 'done');
                                        currentActiveItem = taskManager.getNextPendingItem();
                                        WebviewBridge.updateTaskQueue(webviewToRespond, taskManager.listPlanItems());
                                    }
                                }
                            } else {
                                // ⚠️ 핵심 수정: EXECUTION phase에서 read-only 도구만 실행된 경우
                                // code_modify intent일 때는 반드시 write tool이 필요함
                                const writeTools = [Tool.CREATE_FILE, Tool.UPDATE_FILE, Tool.REMOVE_FILE, Tool.RUN_COMMAND];
                                const hasWriteTool = deduplicatedCalls.some(call => writeTools.includes(call.name as Tool));
                                const isCodeModifyIntent = intent && intent.subtype === 'code_modify';

                                if (currentPhase === AgentPhase.EXECUTION && !hasWriteTool && isCodeModifyIntent) {
                                    console.log(`[ConversationManager] EXECUTION phase: code_modify intent requires write tool, but only read tools were executed. Continuing to next turn.`);
                                    // read-only로 끝나면 안 되므로 다음 턴으로 계속 진행
                                    accumulatedUserParts.push({ text: llmResponse });
                                    accumulatedUserParts.push({ text: turnResultsSummary });
                                    accumulatedUserParts.push({
                                        text: `\n[System] ⚠️ 코드 수정 작업(code_modify)은 반드시 파일 생성/수정 도구(<create_file>, <update_file>)가 필요합니다. 조사(read_file)만으로는 작업이 완료되지 않습니다. 계획에 따라 파일을 생성하거나 수정하세요.\n`
                                    });
                                    turnCount++;
                                    continue;
                                }
                            }
                        }
                    }
                } else {
                    // 2-4. 일반 텍스트 처리
                    const responseText = this.responseProcessor.extractResponseText(part);
                    if (responseText && responseText.trim() && shouldSendCodePilotText(currentPhase)) {
                        // ✅ Phase gate: REVIEW/DONE에서만 CODEPILOT 텍스트 전송
                        WebviewBridge.receiveMessage(webviewToRespond, 'CODEPILOT', responseText);
                    }
                }
            }

            // 3. 루프 종료 조건 확인 및 턴 관리
            const totalToolCalls = ToolParser.parseToolCalls(cleanResponse, toolParseWarnings);
            const totalResponseText = this.responseProcessor.extractResponseText(cleanResponse);

            // 디버깅: run_command 파싱 확인
            if (cleanResponse.includes('<run_command>')) {

                // run_command가 파싱되지 않은 경우 상세 로그
                const runCommandMatches = cleanResponse.match(/<run_command>([\s\S]*?)<\/run_command>/gi);
                if (runCommandMatches) {
                    runCommandMatches.forEach((match, idx) => {
                        console.log(`[ConversationManager] Debug: run_command[${idx}]:`, match.substring(0, 200));
                    });
                }

                const hasRunCommand = totalToolCalls.some(c => c.name === Tool.RUN_COMMAND);
                if (!hasRunCommand) {
                    console.log(`[ConversationManager] Debug: ⚠️ run_command가 파싱되지 않았습니다!`);
                }
            }

            // create_file content 누락 등 툴 파싱 경고를 사용자 컨텍스트에 추가
            if (toolParseWarnings.length > 0) {
                const warningText = toolParseWarnings.join('\n');
                accumulatedUserParts.push({
                    text: `\n[System] ⚠️ create_file 사용 시 <content>가 필수입니다. 다음 호출은 무시되었습니다:\n${warningText}\n\n<create_file>에는 반드시 <content>...</content>를 포함하세요.\n`
                });
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
                        accumulatedUserParts.push({
                            text: `\n[System] ⚠️ 코드 수정 작업(code_modify)은 반드시 파일 생성/수정 도구(<create_file>, <update_file>)가 필요합니다. 조사(read_file)만으로는 작업이 완료되지 않습니다. 계획에 따라 파일을 생성하거나 수정하세요.\n`
                        });
                        turnCount++;
                        continue;
                    }

                    // 실행 단계에서 도구를 실행했지만 남은 계획이 없다면 자동 테스트 후 REVIEW로 전환
                    // ✅ 핵심 수정: 계획 완료 시 파일 변경이 있으면 무조건 검증 실행
                    // isAutoTestRetryEnabled는 재시도 여부만 결정 (첫 검증은 항상 실행)
                    const hasFileChanges = createdFiles.length > 0 || modifiedFiles.length > 0;

                    if (hasFileChanges) {
                        console.log('[ConversationManager] All tasks completed after tool execution. Running automated tests before transitioning to REVIEW.');
                        const currentProjectForTest = ProjectManager.getInstance().getCurrentProject();
                        const workspaceRootForTest = currentProjectForTest?.root || '';
                        const testResult = await this.runAutomatedTests(webviewToRespond, workspaceRootForTest, createdFiles, modifiedFiles);

                        if (testResult.success) {
                            // 테스트 통과 → REVIEW로 전환
                            console.log('[ConversationManager] Tests passed. Transitioning to REVIEW phase.');
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
                                accumulatedUserParts.push({
                                    text: `\n[System] ⚠️ **자동 테스트가 실패했습니다.**\n\n**오류 내용:**\n${errorMessage}\n\n**🔥 중요: 오류를 먼저 분석하세요**\n` +
                                        `1. **오류 유형 파악**: TypeScript 컴파일 오류인가? 의존성 누락인가? 런타임 오류인가?\n` +
                                        `2. **오류 원인 분석**:\n` +
                                        `   - TypeScript 오류 (예: "Cannot find module", "Property does not exist") → 파일 수정 필요, npm install로 해결 안 됨\n` +
                                        `   - 의존성 오류 (예: "Cannot find module 'xxx'", "Module not found") → npm install 필요\n` +
                                        `   - 빌드 오류 (예: "Command failed", "Build failed") → 빌드 설정 또는 코드 오류 확인\n` +
                                        `3. **적절한 조치 선택**:\n` +
                                        `   - TypeScript/컴파일 오류 → <update_file>로 파일 수정\n` +
                                        `   - 의존성 누락 → <run_command>로 npm install (단, 이미 실행했다면 다른 원인 확인)\n` +
                                        `   - 빌드 설정 오류 → 설정 파일 수정\n\n` +
                                        `**절대 하지 말 것**:\n` +
                                        `- 오류 분석 없이 무작정 npm install 실행 (이미 실행했다면 효과 없음)\n` +
                                        `- 같은 명령어 반복 실행 (중복 실행 방지됨)\n\n` +
                                        `오류를 분석한 후 적절한 수정을 수행하세요.\n`
                                });
                                turnCount++;
                                continue;
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
                        console.log('[ConversationManager] All tasks completed. No file changes detected. Transitioning to REVIEW phase.');
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
            if (currentPhase === AgentPhase.INVESTIGATION && totalToolCalls.length === 0 && !validPlanReceived && totalResponseText.length > 5) {
                // investigation_done 토큰이 있고 ripgrep_search 결과가 있으면 텍스트 차단을 건너뛰고 자동 답변 생성 로직으로 넘어감
                if (investigationDoneToken && intent && intent.category === 'analysis') {
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
                    // ✅ Phase gate: hasNoIntent인 경우는 DONE으로 전환 후 텍스트 전송
                    stateManager.transitionTo(AgentPhase.DONE);
                    if (shouldSendCodePilotText(AgentPhase.DONE)) {
                        WebviewBridge.receiveMessage(webviewToRespond, 'CODEPILOT', totalResponseText);
                    }
                    return; // 즉시 종료
                }

                // ⚠️ 핵심 수정: analysis intent이고 조사가 완료된 경우, 자연어 답변 허용
                // 🔥 중복 방지: investigation_done 토큰이 있으면 위의 블록(2732 라인)에서 이미 처리되므로 여기서는 처리하지 않음
                // 🔥 추가 중복 방지: ripgrep_search 결과가 있으면 자동 답변 생성 로직(2732 라인)에서 처리되므로 여기서는 처리하지 않음
                if (intent && intent.category === 'analysis' && hasInvestigationHistory && !investigationDoneToken) {
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

                        if (cleanResponse && cleanResponse.length > 2) {
                            // 🔥 문제 해결: 'Assistant' sender는 webview에서 처리되지 않으므로 'CODEPILOT'으로 변경
                            WebviewBridge.receiveMessage(webviewToRespond, 'CODEPILOT', cleanResponse);
                            // DONE으로 전환
                            stateManager.transitionTo(AgentPhase.DONE, {});
                            console.log('[ConversationManager] Analysis response sent. Transitioning to DONE.');
                            break;
                        }
                    }
                }

                investigationTextOnlyCount++;
                console.log(`[ConversationManager] INVESTIGATION phase: No tools/plan but text received (count: ${investigationTextOnlyCount}). Blocking text-only output.`);

                // 텍스트만 출력하는 것을 차단하고 강력한 안내 메시지 제공
                const nudgeText = `\n[System] ⚠️ 조사(Investigation) 단계에서는 텍스트 설명만 출력하는 것이 금지됩니다.\n` +
                    `**반드시 다음 중 하나를 수행해야 합니다:**\n` +
                    `1. 조사 도구 호출: <read_file>, <list_files>, <ripgrep_search>를 사용하여 정보를 수집하세요.\n` +
                    `2. 계획 수립: 충분한 정보를 수집했다면 <plan> 태그를 사용하여 작업 계획을 수립하세요.\n\n` +
                    `**금지 사항:**\n` +
                    `- "We need to read..." 같은 설명만 하는 것\n` +
                    `- 계획 없이 <create_file>, <update_file> 같은 실행 도구를 호출하는 것\n\n` +
                    `즉시 XML 도구 태그를 호출하거나 <plan> 태그를 제출하세요.`;

                accumulatedUserParts.push({ text: nudgeText });
                turnCount++;
                continue;
            }

            // ⚠️ 핵심 수정: analysis intent이고 investigation_done 토큰이 있으면, 빈 응답이어도 analysis 답변 생성 후 종료
            // (analysis 답변 생성 로직은 INVESTIGATION phase 처리 블록에서 실행됨)
            // 🔥 디버깅: 조건 확인
            if (investigationDoneToken) {
                console.log(`[ConversationManager] Debug: investigationDoneToken=true, intent=${intent?.category}, currentPhase=${currentPhase}`);
            }
            if (investigationDoneToken && intent && intent.category === 'analysis' && currentPhase === AgentPhase.INVESTIGATION) {
                console.log('[ConversationManager] Analysis intent with investigation_done token detected. Will generate answer in INVESTIGATION phase block.');
                // 빈 응답 체크를 건너뛰고 계속 진행 (INVESTIGATION phase 블록에서 analysis 답변 생성)
            } else if (!totalResponseText || !totalResponseText.trim()) {
                // 도구 호출도 없고 유효한 계획도 없는 경우
                // 🔥 추가: investigation_done 토큰이 있으면 analysis 답변 생성 시도
                if (investigationDoneToken && intent && intent.category === 'analysis' && currentPhase === AgentPhase.INVESTIGATION) {
                    console.log('[ConversationManager] Empty response but investigation_done token found. Will generate answer in INVESTIGATION phase block.');
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
            if (currentPhase === AgentPhase.EXECUTION && totalToolCalls.length === 0 && totalResponseText.length > 10) {
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
                                    text: `\n[System] ⚠️ **자동 테스트가 실패했습니다.**\n\n**오류 내용:**\n${errorMessage}\n\n**🔥 중요: 오류를 먼저 분석하세요**\n` +
                                        `1. **오류 유형 파악**: TypeScript 컴파일 오류인가? 의존성 누락인가? 런타임 오류인가?\n` +
                                        `2. **오류 원인 분석**:\n` +
                                        `   - TypeScript 오류 (예: "Cannot find module", "Property does not exist") → 파일 수정 필요, npm install로 해결 안 됨\n` +
                                        `   - 의존성 오류 (예: "Cannot find module 'xxx'", "Module not found") → npm install 필요\n` +
                                        `   - 빌드 오류 (예: "Command failed", "Build failed") → 빌드 설정 또는 코드 오류 확인\n` +
                                        `3. **적절한 조치 선택**:\n` +
                                        `   - TypeScript/컴파일 오류 → <update_file>로 파일 수정\n` +
                                        `   - 의존성 누락 → <run_command>로 npm install (단, 이미 실행했다면 다른 원인 확인)\n` +
                                        `   - 빌드 설정 오류 → 설정 파일 수정\n\n` +
                                        `**절대 하지 말 것**:\n` +
                                        `- 오류 분석 없이 무작정 npm install 실행 (이미 실행했다면 효과 없음)\n` +
                                        `- 같은 명령어 반복 실행 (중복 실행 방지됨)\n\n` +
                                        `오류를 분석한 후 적절한 수정을 수행하세요.\n`
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
            const shouldNudge = totalResponseText.length > 5 && isCodeIntent && totalToolCalls.length === 0;

            if (shouldNudge) {
                // INVESTIGATION 단계에서는 최대 3회까지 nudge 허용
                const maxNudges = currentPhase === AgentPhase.INVESTIGATION ? 3 : 1;
                const nudgeCount = turnCount; // 간단한 추적 (실제로는 별도 카운터가 필요할 수 있음)

                if (currentPhase === AgentPhase.INVESTIGATION || turnCount === 0) {
                    if (currentPhase === AgentPhase.INVESTIGATION || nudgeCount < maxNudges) {
                        console.log(`[ConversationManager] Action missing, providing nudge (turn ${turnCount + 1}).`);
                        accumulatedUserParts.push({ text: llmResponse });

                        let nudgeText = "\n[System] 설명을 중단하고 즉시 XML 도구를 호출하세요.\n";
                        if (currentPhase === AgentPhase.INVESTIGATION) {
                            nudgeText += "- 조사 도구: <read_file>, <list_files>, <ripgrep_search>를 사용하여 정보를 수집하세요.\n";
                            nudgeText += "- 충분한 정보를 수집했다면 <plan> 태그를 사용하여 작업 계획을 수립하세요.\n";
                            nudgeText += "- 설명만 하지 말고 반드시 도구를 호출하거나 계획을 제출하세요.";
                        } else {
                            nudgeText += "즉시 XML 도구(예: <list_files>, <read_file>, <plan>)를 호출하여 작업을 시작하세요. 생각이나 설명만 하는 것은 허용되지 않습니다.";
                        }

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

            if ((investigationDoneToken || hasRipgrepResultsForAutoAnswer) && intent && intent.category === 'analysis' && currentPhase === AgentPhase.INVESTIGATION) {
                if (investigationDoneToken) {
                    console.log('[ConversationManager] Analysis intent with investigation_done token detected. Checking for existing search results...');
                } else {
                    console.log('[ConversationManager] Analysis intent with ripgrep_search results detected. Checking for existing search results...');
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
                        console.log('[ConversationManager] Debug: ripgrepResults[0]:', JSON.stringify(ripgrepResults[0], null, 2).substring(0, 500));
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

                    const analysisResponse = await this.llmManager.sendMessageWithSystemPrompt(
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
                    if (!cleanAnalysisResponse || cleanAnalysisResponse.length < 2) {
                        cleanAnalysisResponse = '조사 결과를 바탕으로 답변을 생성할 수 없습니다.';
                    }
                }

                console.log(`[ConversationManager] Sending analysis response to webview (length: ${cleanAnalysisResponse.length}): ${cleanAnalysisResponse.substring(0, 100)}...`);
                // 🔥 문제 해결: 'Assistant' sender는 webview에서 처리되지 않으므로 'CODEPILOT'으로 변경
                WebviewBridge.receiveMessage(webviewToRespond, 'CODEPILOT', cleanAnalysisResponse);

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
                        accumulatedUserParts.push({
                            text: `\n[System] ⚠️ **자동 테스트가 실패했습니다.**\n\n**오류 내용:**\n${errorMessage}\n\n오류를 분석하고 필요한 수정을 수행하세요. 필요하다면 <run_command> 도구를 사용하여 명령어를 실행하세요.\n\n**중요:** 이미 존재하는 파일은 생성하지 마세요. 파일이 이미 존재하는 경우 <update_file> 도구를 사용하여 수정하세요.\n`
                        });
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
        const response = await this.llmManager.sendMessageWithSystemPrompt(systemPrompt, userParts, { signal: options.abortSignal });
        WebviewBridge.receiveMessage(options.webviewToRespond, 'CODEPILOT', response);

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

        // 기타: 에러 메시지의 핵심 키워드 추출 (최대 50자)
        const keywords = lowerMessage
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(word => word.length > 3)
            .slice(0, 5)
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
                if (path.length < 3) return false;
                // '...' 같은 패턴 제외
                if (path.includes('...')) return false;
                // 확장자만 있고 파일명이 없는 경우 제외 (예: ".tsx")
                if (path.startsWith('.')) return false;
                return true;
            });

        return uniquePaths;
    }

    /**
     * 에어 핸들링
     */
    private handleError(error: any, webview: vscode.Webview): void {
        console.error('[ConversationManager] Error:', error);
        const errorMessage = error.message || '알 수 없는 오류가 발생했습니다.';
        WebviewBridge.receiveMessage(webview, 'System', `오류 발생: ${errorMessage}`);
        WebviewBridge.updateProcessingStatus(webview, '오류가 발생했습니다.', 'error');
    }

    /**
     * Output Contract 검증: LLM 응답이 허용된 형식인지 확인
     * @param response LLM 원본 응답
     * @param phase 현재 에이전트 단계
     * @returns 검증 결과
     */
    private validateOutputFormat(response: string, phase: AgentPhase): {
        valid: boolean;
        reason?: string;
        isThinkingLeak?: boolean;
        hasAllowedFormat?: boolean;
    } {
        // 1. thinking/reasoning 누출 검사 (가장 치명적)
        const thinkingPatterns = [
            /We should produce/i,
            /We need to/i,
            /Let's call/i,
            /Now we need/i,
            /Probably need/i,
            /We must/i,
            /I should/i,
            /I will/i,
            /Let me/i,
            /First, let/i,
            /To do this/i,
            /I'll/i
        ];

        const isThinkingLeak = thinkingPatterns.some(pattern => pattern.test(response));
        if (isThinkingLeak && !response.includes('<plan>') && !response.includes('<read_file>') && !response.includes('<create_file>') && !response.includes('<update_file>') && !response.includes('<list_files>') && !response.includes('<search_files>') && !response.includes('<ripgrep_search>') && !response.includes('<investigation_done/>')) {
            return {
                valid: false,
                reason: 'THINKING_LEAK',
                isThinkingLeak: true,
                hasAllowedFormat: false
            };
        }

        // 2. 허용된 형식 확인 (XML 태그 또는 JSON)
        const allowedTags = [
            '<plan>',
            '<read_file>',
            '<list_files>',
            '<search_files>',
            '<ripgrep_search>',
            '<create_file>',
            '<update_file>',
            '<remove_file>',
            '<run_command>',
            '<investigation_done/>'
        ];

        const hasAllowedFormat = allowedTags.some(tag => response.includes(tag));

        // 2-1. create_file 필수 파라미터(content) 누락 검증
        const validationWarnings: string[] = [];
        ToolParser.parseToolCalls(response, validationWarnings);
        const hasMissingCreateFileContent = validationWarnings.some(w => w.includes('create_file에 content가 없습니다'));
        if (hasMissingCreateFileContent) {
            return {
                valid: false,
                reason: 'CREATE_FILE_CONTENT_MISSING',
                isThinkingLeak: false,
                hasAllowedFormat: hasAllowedFormat
            };
        }

        // 3. Phase별 허용 형식 검증
        if (phase === AgentPhase.INVESTIGATION) {
            // INVESTIGATION: <plan>, 조사 도구, <investigation_done/>만 허용
            const forbiddenInInvestigation = [
                /<create_file>/i,
                /<update_file>/i,
                /<remove_file>/i,
                /<run_command>/i
            ];

            const hasForbidden = forbiddenInInvestigation.some(pattern => pattern.test(response));
            if (hasForbidden) {
                return {
                    valid: false,
                    reason: 'EXECUTION_TOOL_IN_INVESTIGATION',
                    isThinkingLeak: false,
                    hasAllowedFormat: hasAllowedFormat
                };
            }

            // INVESTIGATION에서 허용된 형식이 없고 텍스트만 있으면 위반
            if (!hasAllowedFormat && response.trim().length > 0 && !response.trim().match(/^[\s\S]*?$/)) {
                // 단순 인사나 "할 일 없음"은 허용 (이미 처리됨)
                if (response.length < 100 && !thinkingPatterns.some(p => p.test(response))) {
                    return { valid: true, hasAllowedFormat: false };
                }
                return {
                    valid: false,
                    reason: 'NO_ALLOWED_FORMAT_IN_INVESTIGATION',
                    isThinkingLeak: isThinkingLeak,
                    hasAllowedFormat: false
                };
            }
        } else if (phase === AgentPhase.EXECUTION) {
            // EXECUTION: 도구 호출만 허용, 설명 금지
            if (!hasAllowedFormat && response.trim().length > 50) {
                // thinking/reasoning이 포함된 긴 텍스트는 위반
                if (isThinkingLeak) {
                    return {
                        valid: false,
                        reason: 'THINKING_LEAK_IN_EXECUTION',
                        isThinkingLeak: true,
                        hasAllowedFormat: false
                    };
                }
            }
        }

        return { valid: true, hasAllowedFormat };
    }

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

        // confidence >= 0.7 필수
        const hasHighConfidence = intent.confidence >= 0.7;

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

                // 도구 호출이 포함된 경우 추가 필터링
                const toolCallPatterns = [
                    /<create_file>[\s\S]*?<\/create_file>/gi,
                    /<update_file>[\s\S]*?<\/update_file>/gi,
                    /<read_file>[\s\S]*?<\/read_file>/gi,
                    /<run_command>[\s\S]*?<\/run_command>/gi,
                    /<plan>[\s\S]*?<\/plan>/gi
                ];
                for (const pattern of toolCallPatterns) {
                    summaryText = summaryText.replace(pattern, '');
                }

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
                        const fileList = [...createdFiles, ...modifiedFiles].slice(0, 10).join(', ');
                        const projectTypeStr = projectInfo.type.toString();

                        const prompt = `다음 프로젝트에 대한 검증 명령어를 추론하세요.

프로젝트 타입: ${projectTypeStr}
프로젝트 루트: ${workspaceRoot}
생성/수정된 파일: ${fileList || '없음'}

규칙 기반으로 결정할 수 없는 검증 명령어를 추론해야 합니다.
프로젝트 타입과 파일 정보를 바탕으로 적절한 검증 명령어(컴파일, 빌드, 린트 등)를 제안하세요.

JSON 형식으로 응답하세요:
{
  "command": "실행할 명령어 (예: npm run build, mvn compile, python -m pytest 등)",
  "description": "검증 설명 (예: Node.js 빌드 검사, Python 테스트 실행 등)"
}

중요: 명령어는 실제로 실행 가능해야 하며, 프로젝트 타입에 맞는 검증 도구를 사용해야 합니다.`;

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
                        const truncatedOutput = errorOutput.length > 500
                            ? errorOutput.substring(0, 500) + '...'
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

        if (totalModifiedLines >= 10) {
            console.log(`[ConversationManager] ${totalModifiedLines} lines modified, formatter will run`);
            return true;
        }

        // 🟡 3. 단순 문자열 / 한 줄 수정 → NO (기본)
        console.log(`[ConversationManager] Only ${totalModifiedLines} lines modified, skipping formatter`);
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
     * @returns 압축 결과
     */
    public async forceCompact(userParts: any[]): Promise<{
        compacted: boolean;
        originalTokens: number;
        compactedTokens: number;
        savedTokens: number;
        summary?: string;
    }> {
        try {
            const compactor = ConversationCompactor.getInstance(this.llmManager);
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

