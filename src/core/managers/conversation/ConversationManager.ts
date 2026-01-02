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
import { InvestigationManager } from '../investigation/InvestigationManager';
import { AiModelType, OllamaApi, GeminiApi } from '../../../services';

export interface ConversationOptions {
    userQuery: string;
    webviewToRespond: vscode.Webview;
    promptType: PromptType;
    abortSignal?: AbortSignal;
    imageData?: string;
    imageMimeType?: string;
    selectedFiles?: string[];
    extensionContext?: vscode.ExtensionContext;
    geminiApi?: any;
    ollamaApi?: any;
    currentModelType?: AiModelType;
    userOS?: string;
    notificationService?: any;
    gitRepositoryService?: any;
}

/**
 * 대화 진행 단계
 */
enum AgentPhase {
    INVESTIGATION = 'investigation',
    EXECUTION = 'execution'
}

/**
 * 대화 및 에이전트 루프를 관리하는 매니저
 */
export class ConversationManager {
    private static instance: ConversationManager;
    private promptBuilder: PromptBuilder;
    private contextManager: ContextManager;
    private llmManager: LLMManager;

    private constructor(userOS: string, geminiApi: GeminiApi, ollamaApi: OllamaApi) {
        this.promptBuilder = new PromptBuilder(userOS, AiModelType.OLLAMA);
        this.contextManager = ContextManager.getInstance();
        this.llmManager = LLMManager.getInstance(geminiApi, ollamaApi);
    }

    public static getInstance(userOS: string = process.platform, geminiApi?: GeminiApi, ollamaApi?: OllamaApi): ConversationManager {
        if (!ConversationManager.instance) {
            if (!geminiApi || !ollamaApi) {
                // 이 처리는 extension.ts에서 초기화된 후 호출됨을 보장해야 함
                throw new Error('ConversationManager requires GeminiApi and OllamaApi for initial creation');
            }
            ConversationManager.instance = new ConversationManager(userOS, geminiApi, ollamaApi);
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
    public setConversationSummarizer(summarizer: any): void { }

    /**
     * 사용자의 메시지를 처리하고 응답을 생성하는 메인 엔트리 포인트
     */
    public async handleUserMessageAndRespond(options: ConversationOptions): Promise<void> {
        const { userQuery, webviewToRespond } = options;

        try {
            // 1. 초기화 및 준비
            this.prepareUI(webviewToRespond);

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

            const userParts = [{ text: userQuery }];

            // 5. 작업 타입에 따른 실행 분기
            if (options.promptType === PromptType.CODE_GENERATION) {
                await this.executeAgentLoop(systemPrompt, userParts, options, intent);
            } else {
                await this.handleGeneralAsk(systemPrompt, userParts, options);
            }

        } catch (error: any) {
            this.handleError(error, webviewToRespond);
        } finally {
            WebviewBridge.hideLoading(webviewToRespond);
        }
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

        // ContextData의 속성들을 PromptBuilderOptions 형식에 맞게 변환
        return {
            codebaseContext: contextData.file?.content,
            realTimeInfo: contextData.terminal?.lastOutput,
            profileContext: contextData.project?.structure,
            intentContext: JSON.stringify(intent),
            gitContext: '',
            languageInstruction: '반드시 한국어로 답변하세요.'
        };
    }

    private async executeAgentLoop(systemPrompt: string, userParts: any[], options: ConversationOptions, intent: any): Promise<void> {
        const { webviewToRespond, abortSignal } = options;
        const maxTurns = 15;
        let turnCount = 0;
        let accumulatedUserParts = [...userParts];

        const taskManager = TaskManager.getInstance();
        const actionManager = ActionManager.getInstance();
        const executionManager = ExecutionManager.getInstance();
        const terminalManager = TerminalManager.getInstance();
        const investigationManager = InvestigationManager.getInstance();
        const toolExecutor = new ToolExecutor();

        // 1. 초기 페이즈 결정 (조사 vs 실행)
        // 활성 계획이 없고 '작업' 의도인 경우 조사 단계로 시작
        const currentPlanItems = taskManager.listPlanItems();
        const hasActivePlan = currentPlanItems.some(i => i.status === 'pending' || i.status === 'in_progress');
        const isActionIntent = intent?.category === 'code' || intent?.taskType === 'code_work' || intent?.taskType === 'command';

        let currentPhase = (isActionIntent && !hasActivePlan) ? AgentPhase.INVESTIGATION : AgentPhase.EXECUTION;

        while (turnCount < maxTurns) {
            if (abortSignal?.aborted) break;

            // [수정] 루프 시작 시점에 현재 계획 상태를 UI에 즉시 동기화
            const allItems = taskManager.listPlanItems();
            if (allItems.length > 0) {
                WebviewBridge.updateTaskQueue(webviewToRespond, allItems);
            }

            // 현재 활성 계획 아이템 확인
            const currentPlanItem = taskManager.getNextPendingItem();

            const statusPrefix = currentPlanItem ? `[${currentPlanItem.title}] ` : '';
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
            }

            const planContext = currentPlanItem ? `\n\nCURRENT TASK: ${currentPlanItem.title}` : '\n\n=== NO ACTIVE PLAN ===\nAnalyze the user query and proceed with necessary actions (e.g. create a plan using <plan> tag).';

            console.log(`[ConversationManager] Calling LLM for Turn ${turnCount + 1} (Phase: ${currentPhase})`);

            const llmResponse = await this.llmManager.sendMessageWithSystemPrompt(
                activeSystemPrompt + planContext,
                accumulatedUserParts,
                { signal: abortSignal }
            );

            console.log(`[ConversationManager] LLM Raw Response (Turn ${turnCount + 1}):`, llmResponse.length > 500 ? llmResponse.substring(0, 500) + '...' : llmResponse);

            // 1. 응답 정제 (<think> 태그 및 JSON 래핑 처리)
            let cleanResponse = llmResponse.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
            if (cleanResponse.startsWith('{') && cleanResponse.endsWith('}')) {
                try {
                    const parsed = JSON.parse(cleanResponse);
                    cleanResponse = parsed.response || parsed.content || parsed.message || cleanResponse;
                } catch { }
            }

            // 2. 텍스트와 도구 호출 인터리브 처리
            const toolNames = Object.values(Tool);
            const tags = [...toolNames, 'plan', 'task_progress'];
            const tagPattern = new RegExp(`(<(?:${tags.join('|')})[\\s\\S]*?<\\/(?:${tags.join('|')})>)`, 'gi');

            // 텍스트와 태그 분리 (capturing group을 사용하여 태그도 결과에 포함)
            const parts = cleanResponse.split(tagPattern);

            let turnHasSideEffects = false;
            let turnResultsSummary = '';
            let hasPlanTag = false;
            let currentActiveItem = taskManager.getNextPendingItem();
            const executedInTurn = new Set<string>();

            for (const part of parts) {
                if (!part || !part.trim()) continue;

                // 태그인지 확인
                const isTag = tags.some(tag => part.toLowerCase().startsWith(`<${tag}`) && part.toLowerCase().includes(`</${tag}>`));

                if (isTag) {
                    // 2-1. 플랜 업데이트 처리
                    if (part.toLowerCase().includes('<plan>')) {
                        // 수립 시작 알림 추가
                        WebviewBridge.sendProcessingStep(webviewToRespond, 'plan');
                        WebviewBridge.sendProcessingStatus(webviewToRespond, 'plan', '작업 계획 분석 및 파싱 중...');

                        const planItems = ToolParser.parsePlanItems(part);
                        if (planItems.length > 0) {
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
                            taskManager.setPlanItems(planItems);
                            WebviewBridge.updateTaskQueue(webviewToRespond, taskManager.listPlanItems());
                            hasPlanTag = true;
                            currentActiveItem = taskManager.getNextPendingItem();

                            // 계획이 수립되면 조사 단계 종료 후 실행 단계로 전환
                            if (currentPhase === AgentPhase.INVESTIGATION) {
                                console.log('[ConversationManager] Valid plan received, switching to EXECUTION phase');
                                currentPhase = AgentPhase.EXECUTION;

                                // 전환 시점에 시스템 피드백 추가하여 에이전트가 다음 작업을 즉시 수행하도록 유도
                                turnResultsSummary += `\n[System] 계획이 승인되었습니다. 이제 '실행(Execution)' 단계입니다. 수립한 계획의 첫 번째 항목부터 즉시 작업을 시작하세요.\n`;
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
                        const toolCalls = ToolParser.parseToolCalls(part);
                        if (toolCalls.length > 0) {
                            // 중복 도구 호출 방지 (동일 파라미터인 경우)
                            const deduplicatedCalls = toolCalls.filter(call => {
                                const key = `${call.name}:${JSON.stringify(call.params)}`;
                                if (executedInTurn.has(key)) {
                                    console.log(`[ConversationManager] Skipping duplicate tool call: ${call.name}`);
                                    return false;
                                }
                                executedInTurn.add(key);
                                return true;
                            });

                            if (deduplicatedCalls.length === 0) continue;

                            // v5.2.2: 조사 단계에서도 도구 실행을 막지 않고 자율성을 부여함 (Remind만 수행 가능)
                            console.log('[ConversationManager] Executing Tools:', deduplicatedCalls.map(call => call.name));

                            // 도구 실행 직전에 해당 계획 항목을 '진행 중'으로 변경
                            if (currentActiveItem && currentActiveItem.status === 'pending') {
                                taskManager.updatePlanItemStatus(currentActiveItem.id, 'in_progress');
                                WebviewBridge.updateTaskQueue(webviewToRespond, taskManager.listPlanItems());
                            }

                            WebviewBridge.sendProcessingStep(webviewToRespond, 'executing');
                            const executingPrefix = currentActiveItem ? `[${currentActiveItem.title}] ` : '';
                            const phaseLabelExec = currentPhase === AgentPhase.INVESTIGATION ? '[조사]' : '[실행]';
                            WebviewBridge.sendProcessingStatus(webviewToRespond, 'executing', `${phaseLabelExec}[단계 ${turnCount + 1}] ${executingPrefix}${this.getToolLabel(deduplicatedCalls[0].name)} 실행 중...`);

                            const currentProject = ProjectManager.getInstance().getCurrentProject();
                            const workspaceRoot = currentProject?.root || '';

                            const toolResults = await toolExecutor.executeTools(deduplicatedCalls, {
                                projectRoot: workspaceRoot,
                                workspaceRoot: workspaceRoot,
                                actionManager,
                                executionManager,
                                terminalManager,
                                contextManager: this.contextManager
                            });

                            // UI에 실행 결과 전송 (✅ [Created] ...)
                            this.sendToolExecutionResultsToUI(webviewToRespond, deduplicatedCalls, toolResults);

                            // 결과 요약 누적
                            const resultSummary = this.createToolResultSummary(turnCount, deduplicatedCalls, toolResults);
                            turnResultsSummary += resultSummary;

                            if (this.hasSideEffects(deduplicatedCalls, toolResults)) {
                                turnHasSideEffects = true;

                                // 사이드 이팩트가 발생한 경우 현재 항목을 완료 처리하고 다음 항목으로 이동
                                if (currentActiveItem) {
                                    console.log(`[ConversationManager] Marking current item as done: ${currentActiveItem.title}`);
                                    taskManager.updatePlanItemStatus(currentActiveItem.id, 'done');
                                    currentActiveItem = taskManager.getNextPendingItem();
                                    WebviewBridge.updateTaskQueue(webviewToRespond, taskManager.listPlanItems());
                                }
                            }
                        }
                    }
                } else {
                    // 2-4. 일반 텍스트 처리
                    const responseText = this.extractResponseText(part);
                    if (responseText && responseText.trim()) {
                        const hasToolsInThisTurn = ToolParser.parseToolCalls(cleanResponse).length > 0;
                        if (!hasToolsInThisTurn) {
                            WebviewBridge.receiveMessage(webviewToRespond, 'AIDEV-IDE', responseText);
                        }
                    }
                }
            }

            // 3. 루프 종료 조건 확인 및 턴 관리
            const totalToolCalls = ToolParser.parseToolCalls(cleanResponse);
            const totalResponseText = this.extractResponseText(cleanResponse);

            // 계획 수립 시에도 턴이 넘어간 것으로 간주 (단, 유효한 계획이어야 함)
            const validPlanReceived = hasPlanTag && TaskManager.getInstance().listPlanItems().length > 0;

            if (totalToolCalls.length > 0 || validPlanReceived) {
                accumulatedUserParts.push({ text: llmResponse });
                accumulatedUserParts.push({ text: turnResultsSummary });

                turnCount++;
            } else {
                // 도구 호출도 없고 유효한 계획도 없는 경우 종료 로직
                if (!totalResponseText || !totalResponseText.trim()) {
                    console.log('[ConversationManager] Empty response or invalid plan, ending loop');
                    break;
                }

                const currentPlanItemsAll = taskManager.listPlanItems();
                const remaining = currentPlanItemsAll.filter(i => i.status === 'pending' || i.status === 'in_progress');

                // [수정] 모델이 행동 없이 설명만 하는 경우, 1회에 한해 재촉(Nudge) 수행
                if (turnCount === 0 && totalResponseText.length > 5 && isActionIntent) {
                    console.log(`[ConversationManager] Action missing in Turn 1, providing a single nudge.`);
                    accumulatedUserParts.push({ text: llmResponse });

                    let nudgeText = "\n[System] 설명을 중단하고 즉시 XML 도구(예: <list_files>, <read_file>, <plan>)를 호출하여 작업을 시작하세요. 생각이나 설명만 하는 것은 허용되지 않습니다.";
                    if (currentPhase === AgentPhase.INVESTIGATION) {
                        nudgeText = "\n[System] 현재 '조사(Investigation)' 단계입니다. 프로젝트 구조 파악을 위해 즉시 <list_files> 또는 <read_file> 도구를 XML 태그로 호출하세요.";
                    }

                    accumulatedUserParts.push({ text: nudgeText });
                    turnCount++;
                    continue;
                }

                if (currentPlanItemsAll.length > 0 && remaining.length > 0) {
                    console.log(`[ConversationManager] Tools missing while plan remains. Ending loop.`);
                } else {
                    console.log(`[ConversationManager] No tools/plan in response. Ending loop.`);
                    // [추가] 아무런 작업도 수행하지 않고 루프가 종료된 경우 사용자에게 안내
                    if (turnCount === 0) {
                        WebviewBridge.receiveMessage(webviewToRespond, 'System', '⚠️ 에이전트가 생각만 하고 실제 도구를 호출하지 않았습니다. 모델을 바꾸거나 다시 시도해 보세요.');
                    }
                }
                break;
            }
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
        WebviewBridge.receiveMessage(options.webviewToRespond, 'AIDEV-IDE', response);
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
     * 텍스트 응답 추출
     */
    private extractResponseText(llmResponse: string): string {
        if (!llmResponse) return '';
        let text = llmResponse.trim();

        // 1. JSON 형태의 응답인 경우 (일부 모델의 실수 대응)
        if (text.startsWith('{') && text.endsWith('}')) {
            try {
                const parsed = JSON.parse(text);
                text = parsed.response || parsed.content || parsed.message || text;
            } catch { }
        }

        // 2. <think> 태그 제거 (DeepSeek R1 등 모델 대응)
        text = text.replace(/<think>[\s\S]*?<\/think>/gi, '');

        // 3. 모든 도구 호출 태그 제거
        const tags = ['create_file', 'update_file', 'remove_file', 'read_file', 'list_files', 'search_files', 'run_command', 'task_progress', 'plan'];
        for (const tag of tags) {
            text = text.replace(new RegExp(`<${tag}[\\s\\S]*?<\\/${tag}>`, 'gi'), '');
        }

        // 4. 마크다운 코드 블록 보존
        // 기존에는 중복 방지를 위해 제거했으나, 명령어 안내 등 필요한 정보가 누락되는 문제로 인해 보존하도록 수정
        // 중복 방지는 프롬프트 지침(rules.ts)을 통해 유도함

        // 5. 시스템 내부용 메시지(Tool Execution Results 등)가 에코되어 출력되는 경우 필터링
        // LLM이 시스템 가이드라인이나 이전 실행 결과를 답변에 포함시키는 경우를 정규식으로 제거
        text = text.replace(/=== Tool Execution Results [\s\S]*?===/gi, '');
        text = text.replace(/\[Tool: [\s\S]*?Status: (Success|Failed)/gi, '');
        text = text.replace(/Output Data: [\s\S]*?}/gi, '');
        text = text.replace(/Wait: We should produce an XML call now\./gi, '');
        text = text.replace(/We need result\./gi, '');
        text = text.replace(/We haven't read [\s\S]*?\./gi, '');

        return text.trim();
    }

    /**
     * 도구 이름을 사용자 친화적인 한글 이름으로 변환합니다.
     */
    private getToolLabel(toolName: string): string {
        const labels: Record<string, string> = {
            'create_file': '파일 생성',
            'update_file': '파일 수정',
            'remove_file': '파일 삭제',
            'read_file': '파일 읽기',
            'list_files': '파일 목록 확인',
            'search_files': '파일 검색',
            'run_command': '명령어 실행',
            'analyze_code': '코드 분석',
            'verify_code': '코드 검증',
            'refactor_code': '리팩토링',
            'ripgrep_search': '고성능 키워드 검색',
            'task_progress': '진행 상황 업데이트',
            'plan': '계획 수립'
        };
        return labels[toolName] || toolName;
    }

    private createToolResultSummary(turn: number, calls: any[], results: any[]): string {
        let summary = '';
        results.forEach((res, i) => {
            summary += `[Tool: ${calls[i].name}]\n`;
            summary += `Status: ${res.success ? 'Success' : 'Failed'}\n`;
            if (res.message && !res.success) {
                summary += `Error Message: ${res.message}\n`;
            } else if (res.message && res.success && !res.data && !res.fileContent) {
                // 데이터는 없지만 성공 메시지가 있는 경우 (예: 파일 생성 성공)
                summary += `Message: ${res.message}\n`;
            }

            // 도구 실행 결과 데이터 포함 (가장 중요)
            if (res.data) {
                const dataStr = typeof res.data === 'string' ? res.data : JSON.stringify(res.data, null, 2);
                summary += `Output Data:\n${dataStr}\n`;
            } else if (res.fileContent) {
                summary += `File Content:\n${res.fileContent}\n`;
            }

            summary += `-------------------\n`;
        });
        return summary;
    }

    /**
     * 툴 실행 결과를 UI에 표시합니다.
     */
    private sendToolExecutionResultsToUI(webview: vscode.Webview, calls: any[], results: any[]): void {
        results.forEach((res, i) => {
            const toolName = calls[i].name;
            const params = calls[i].params || {};
            const path = params.path || params.file_path || params.target_file || '';
            const command = params.command || '';

            if (res.success) {
                // 파일 생성/수정인 경우 헤더는 System 스타일로, 내용은 AIDEV-IDE 스타일로 분리하여 표시
                if (toolName === Tool.CREATE_FILE || toolName === Tool.UPDATE_FILE) {
                    const action = toolName === Tool.CREATE_FILE ? 'Created' : 'Updated';
                    const icon = toolName === Tool.CREATE_FILE ? '✅' : '📝';
                    const content = toolName === Tool.CREATE_FILE ? (params.content || '') : (res.fileContent || '');
                    const ext = path.split('.').pop() || '';

                    // 1. 헤더 전송 (테두리와 색상이 있는 시스템 스타일)
                    WebviewBridge.receiveMessage(webview, 'System', `${icon} [${action}] ${path}`);

                    // 2. 코드 내용 전송 (복사 버튼이 있는 마크다운 스타일)
                    if (content) {
                        const codeMarkdown = `\`\`\`${ext}\n${content}\n\`\`\``;
                        WebviewBridge.receiveMessage(webview, 'AIDEV-IDE', codeMarkdown);
                    }
                    return;
                }

                // 나머지 도구들은 기존처럼 System 스타일 메시지로 표시 (테두리/색상 적용)
                let displayMsg = '';
                switch (toolName) {
                    case 'remove_file':
                        displayMsg = `🗑️ [Deleted] ${path}`;
                        break;
                    case 'read_file':
                        displayMsg = `📖 [Read] ${path}`;
                        break;
                    case 'list_files':
                        displayMsg = `📂 [Listed] ${path || 'root'}`;
                        break;
                    case 'search_files':
                        displayMsg = `🔍 [Searched] ${params.pattern || params.query || ''}`;
                        break;
                    case 'ripgrep_search':
                        displayMsg = `🚀 [Ripgrep] ${params.pattern || ''}`;
                        break;
                    case 'run_command':
                        displayMsg = `🚀 [Executed] ${command}`;

                        // 터미널 실행 결과가 있으면 추가로 표시 (사용자 요청 반영)
                        const output = res.data?.output || '';
                        if (output) {
                            // 헤더 먼저 전송
                            WebviewBridge.receiveMessage(webview, 'System', displayMsg);
                            // 실행 결과(터미널 출력)를 마크다운 코드 블록으로 전송
                            const terminalMarkdown = `\`\`\`bash\n${output}\n\`\`\``;
                            WebviewBridge.receiveMessage(webview, 'AIDEV-IDE', terminalMarkdown);
                            return;
                        }
                        break;
                    case 'analyze_code':
                        displayMsg = `🔬 [Analyzed] ${path}`;
                        break;
                    default:
                        displayMsg = `✔️ [Success] ${this.getToolLabel(toolName)}`;
                }
                WebviewBridge.receiveMessage(webview, 'System', displayMsg);
            } else {
                // 실패 시에는 항상 System 스타일로 에러 표시
                WebviewBridge.receiveMessage(webview, 'System', `❌ [Failed] ${this.getToolLabel(toolName)}: ${res.message || 'Unknown error'}`);
            }
        });
    }

    private hasSideEffects(calls: any[], results: any[]): boolean {
        const sideEffectTools = [Tool.CREATE_FILE, Tool.UPDATE_FILE, Tool.REMOVE_FILE, Tool.RUN_COMMAND];
        return results.some((res, i) => res.success && sideEffectTools.includes(calls[i].name as Tool));
    }
}
