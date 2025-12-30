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
 * 대화 및 에이전트 루프를 관리하는 매니저
 */
export class ConversationManager {
    private static instance: ConversationManager;
    private promptBuilder: PromptBuilder;
    private contextManager: ContextManager;
    private llmManager: LLMManager;

    private constructor(userOS: string, geminiApi: GeminiApi, ollamaApi: OllamaApi) {
        this.promptBuilder = new PromptBuilder(userOS, AiModelType.OLLAMA_GPT_OSS);
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

            // 모델 설정 업데이트 및 Ollama 모델명 동기화
            if (options.currentModelType) {
                this.llmManager.setCurrentModel(options.currentModelType);
                this.promptBuilder.setModelType(options.currentModelType);

                // LLMManager 내부의 Ollama API 인스턴스 동기화 (가장 중요)
                const internalOllama = this.llmManager.getOllamaApi();
                if (internalOllama && options.currentModelType !== AiModelType.GEMINI) {
                    this.syncOllamaModel(internalOllama, options.currentModelType);
                }

                // options로 전달된 API가 있다면 함께 동기화 (호환성)
                if (options.ollamaApi && options.ollamaApi !== internalOllama) {
                    this.syncOllamaModel(options.ollamaApi, options.currentModelType);
                }

                console.log(`[ConversationManager] LLM model updated to: ${options.currentModelType}`);
            }

            // 2. 의도 파악 및 프로젝트 분석
            // 내부 Ollama 인스턴스와 현재 선택된 모델 타입을 사용하여 의도 파악 수행
            const intent = await this.detectIntent(userQuery, this.llmManager.getOllamaApi(), options.currentModelType);

            // 3. 컨텍스트 수집
            const context = await this.gatherContext(options, intent);

            // 4. 시스템 프롬프트 생성
            const promptOptions: PromptBuilderOptions = {
                userOS: options.userOS || process.platform,
                modelType: options.currentModelType || AiModelType.OLLAMA_GPT_OSS,
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
    }

    /**
     * 사용자 의도 및 작업 타입 감지
     */
    private async detectIntent(query: string, ollamaApi?: OllamaApi, modelType?: AiModelType): Promise<any> {
        const api = ollamaApi || this.llmManager.getOllamaApi();
        if (!api) {
            console.warn('[ConversationManager] OllamaApi is missing, using keyword-only detection');
            // IntentDetector는 OllamaApi가 필수이므로, 없는 경우 기본 의도 반환
            return { category: 'code', subtype: 'code_generate', taskType: 'code_work', confidence: 0.5, keywords: [], reasoning: 'Fallback' };
        }
        const detector = new IntentDetector(api);

        // 모델명이 있으면 IntentDetector에 전달
        const options = modelType ? { modelName: this.getActualModelName(modelType) } : undefined;
        const intent = await detector.detectIntent(query, options);

        console.log(`[ConversationManager] Intent detected: ${intent.category}/${intent.subtype} (confidence: ${intent.confidence})`);
        return intent;
    }

    /**
     * AiModelType을 실제 Ollama 모델명으로 변환합니다.
     */
    private getActualModelName(modelType: AiModelType): string {
        switch (modelType) {
            case AiModelType.OLLAMA_Gemma:
                return 'gemma2:9b';
            case AiModelType.OLLAMA_DeepSeek:
                return 'deepseek-r1:70b';
            case AiModelType.OLLAMA_CodeLlama:
                return 'codellama';
            case AiModelType.OLLAMA_GPT_OSS:
                return 'gpt-oss:120b-cloud';
            default:
                return '';
        }
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

    /**
     * 에이전트 루프 실행 (Agentic Loop)
     */
    private async executeAgentLoop(systemPrompt: string, userParts: any[], options: ConversationOptions, intent: any): Promise<void> {
        const { webviewToRespond, abortSignal } = options;
        const maxTurns = 15;
        let turnCount = 0;
        let accumulatedUserParts = [...userParts];

        const taskManager = TaskManager.getInstance();
        const actionManager = ActionManager.getInstance();
        const executionManager = ExecutionManager.getInstance();
        const terminalManager = TerminalManager.getInstance();
        const toolExecutor = new ToolExecutor();

        while (turnCount < maxTurns) {
            if (abortSignal?.aborted) break;

            // 현재 활성 계획 아이템 확인
            const currentPlanItem = taskManager.getNextPendingItem();
            const statusPrefix = currentPlanItem ? `[${currentPlanItem.title}] ` : '';

            WebviewBridge.sendProcessingStep(webviewToRespond, 'thinking');
            WebviewBridge.sendProcessingStatus(webviewToRespond, 'thinking', `${statusPrefix}[생각 ${turnCount + 1}] 분석 및 생각 중...`);

            const planContext = currentPlanItem ? `\n\nCURRENT TASK: ${currentPlanItem.title}` : '\n\n=== NO ACTIVE PLAN ===\nAnalyze the user query and proceed with necessary actions (e.g. create a plan using <plan> tag).';

            console.log(`[ConversationManager] Calling LLM for Turn ${turnCount + 1}`);
            // console.log(`[ConversationManager] Full Prompt: ${systemPrompt + planContext}`);

            const llmResponse = await this.llmManager.sendMessageWithSystemPrompt(
                systemPrompt + planContext,
                accumulatedUserParts,
                { signal: abortSignal }
            );

            console.log(`[ConversationManager] LLM Raw Response (Turn ${turnCount + 1}):`, llmResponse);

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
            let turnResultsSummary = `\n=== Tool Execution Results (Turn ${turnCount + 1}) ===\n`;

            for (const part of parts) {
                if (!part || !part.trim()) continue;

                // 태그인지 확인
                const isTag = tags.some(tag => part.toLowerCase().startsWith(`<${tag}`) && part.toLowerCase().includes(`</${tag}>`));

                if (isTag) {
                    // 2-1. 플랜 업데이트 처리
                    if (part.toLowerCase().includes('<plan>')) {
                        const planItems = ToolParser.parsePlanItems(part);
                        if (planItems.length > 0) {
                            console.log('[ConversationManager] Received Plan Items:', planItems.map(item => `- ${item.title}`));
                            WebviewBridge.sendProcessingStep(webviewToRespond, 'plan');
                            WebviewBridge.sendProcessingStatus(webviewToRespond, 'plan', '작업 계획 업데이트 중...');
                            taskManager.setPlanItems(planItems);
                        }
                    }
                    // 2-2. 진행 상황 업데이트 처리
                    else if (part.toLowerCase().includes('<task_progress>')) {
                        const progress = ToolParser.parseTaskProgress(part);
                        if (progress) {
                            console.log('[ConversationManager] Received Task Progress:', progress);
                            // task_progress는 더 이상 UI에 별도로 출력하지 않음 (작업큐 삭제됨)
                        }
                    }
                    // 2-3. 도구 실행 처리
                    else {
                        const toolCalls = ToolParser.parseToolCalls(part);
                        if (toolCalls.length > 0) {
                            console.log('[ConversationManager] Executing Tools:', toolCalls.map(call => call.name));
                            WebviewBridge.sendProcessingStep(webviewToRespond, 'executing');
                            const executingPrefix = currentPlanItem ? `[${currentPlanItem.title}] ` : '';
                            WebviewBridge.sendProcessingStatus(webviewToRespond, 'executing', `${executingPrefix}[단계 ${turnCount + 1}] ${toolCalls[0].name} 실행 중...`);

                            const currentProject = ProjectManager.getInstance().getCurrentProject();
                            const workspaceRoot = currentProject?.root || '';

                            const toolResults = await toolExecutor.executeTools(toolCalls, {
                                projectRoot: workspaceRoot,
                                workspaceRoot: workspaceRoot,
                                actionManager,
                                executionManager,
                                terminalManager,
                                contextManager: this.contextManager
                            });

                            // UI에 실행 결과 전송 (✅ [Created] ...)
                            this.sendToolExecutionResultsToUI(webviewToRespond, toolCalls, toolResults);

                            // 결과 요약 누적
                            const resultSummary = this.createToolResultSummary(turnCount, toolCalls, toolResults);
                            console.log(`[ConversationManager] Tool Results Summary (Turn ${turnCount + 1}):`, resultSummary);
                            turnResultsSummary += resultSummary;

                            if (this.hasSideEffects(toolCalls, toolResults)) {
                                turnHasSideEffects = true;
                            }
                        }
                    }
                } else {
                    // 2-4. 일반 텍스트 처리 (도구 호출이 있는 경우 텍스트 출력 지우기 - 사용자 요청 반영)
                    const responseText = this.extractResponseText(part);
                    if (responseText && responseText.trim()) {
                        // 도구 호출이 전혀 없는 턴이거나, 최종 답변인 경우에만 텍스트 출력
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

            if (totalToolCalls.length > 0) {
                accumulatedUserParts.push({ text: llmResponse });
                accumulatedUserParts.push({ text: turnResultsSummary });

                // 사이드 이펙트가 있는 경우에만 계획 상태 업데이트
                const updatedPlanItem = taskManager.getNextPendingItem();
                if (updatedPlanItem && turnHasSideEffects) {
                    taskManager.updatePlanItemStatus(updatedPlanItem.id, 'done');
                }

                turnCount++;
            } else {
                // 도구 호출이 없는 경우 종료 로직
                if (!totalResponseText || !totalResponseText.trim()) {
                    console.log('[ConversationManager] Empty response, ending loop');
                    break;
                }

                const currentPlanItems = taskManager.listPlanItems();
                const remaining = currentPlanItems.filter(i => i.status === 'pending' || i.status === 'in_progress');

                if (currentPlanItems.length === 0 || remaining.length === 0) {
                    // 계획이 없는 상태에서 도구 호출 없이 텍스트만 온 경우
                    // 도구 호출이나 계획 수립이 필요한 '작업' 의도일 때만 누징(Nudging) 수행
                    const isActionIntent = intent?.category === 'code' || intent?.taskType === 'code_work' || intent?.taskType === 'command';
                    const isConfident = intent?.confidence > 0.4;
                    const looksLikeActionNeeded = totalResponseText.includes('```') ||
                        totalResponseText.toLowerCase().includes('need to') ||
                        totalResponseText.includes('읽어야') ||
                        totalResponseText.includes('수정') ||
                        totalResponseText.includes('생성');

                    if (turnCount < 2 && totalResponseText.length > 5 && (isActionIntent || (isConfident && looksLikeActionNeeded))) {
                        console.log(`[ConversationManager] Missing tools/plan in Turn ${turnCount + 1}, nudging`);
                        accumulatedUserParts.push({ text: llmResponse });

                        let nudgeText = "\n[System] 작업을 진행하기 위해 필요한 XML 도구를 호출하거나 <plan> 태그를 사용하여 계획을 우선 수립해주세요. 생각만 하지 말고 즉시 행동하세요.";
                        if (totalResponseText.toLowerCase().includes('need to read') || totalResponseText.includes('읽어야')) {
                            nudgeText = "\n[System] 파일을 읽어야 한다면 즉시 <read_file><path>경로</path></read_file> 태그를 출력하여 실행하세요. 설명만 하는 것은 허용되지 않습니다.";
                        } else if (totalResponseText.includes('```')) {
                            nudgeText = "\n[System] 마크다운 코드 블록(```)을 사용하지 마세요. 파일을 생성하거나 수정하려면 반드시 <create_file> 또는 <update_file> XML 도구를 사용해야 합니다. 방금 제시한 코드를 XML 도구 호출로 다시 출력해주세요.";
                        }

                        accumulatedUserParts.push({ text: nudgeText });
                        turnCount++;
                        continue;
                    }

                    console.log(`[ConversationManager] No action nudge needed for Turn ${turnCount + 1}. Ending loop.`);
                    break;
                } else {
                    // 계획은 있는데 도구 호출이 없는 경우
                    console.log(`[ConversationManager] Tools missing but ${remaining.length} plan items remain. Turn: ${turnCount + 1}`);
                    if (turnCount < 5) { // 초반 5턴까지는 도구 호출을 강력히 재촉
                        accumulatedUserParts.push({ text: llmResponse });
                        accumulatedUserParts.push({ text: "\n[System] 현재 단계(CURRENT TASK)를 완료하기 위해 필요한 XML 도구를 호출해주세요. 설명만 하지 말고 도구 태그(예: <read_file>, <update_file> 등)를 직접 출력하세요." });
                        turnCount++;
                        continue;
                    }
                    break;
                }
            }
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

    private createToolResultSummary(turn: number, calls: any[], results: any[]): string {
        let summary = `\n=== Tool Execution Results (Turn ${turn + 1}) ===\n`;
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
                        displayMsg = `✔️ [Success] ${toolName}`;
                }
                WebviewBridge.receiveMessage(webview, 'System', displayMsg);
            } else {
                // 실패 시에는 항상 System 스타일로 에러 표시
                WebviewBridge.receiveMessage(webview, 'System', `❌ [Failed] ${toolName}: ${res.message || 'Unknown error'}`);
            }
        });
    }

    private hasSideEffects(calls: any[], results: any[]): boolean {
        const sideEffectTools = [Tool.CREATE_FILE, Tool.UPDATE_FILE, Tool.REMOVE_FILE, Tool.RUN_COMMAND];
        return results.some((res, i) => res.success && sideEffectTools.includes(calls[i].name as Tool));
    }

    /**
     * 선택된 AiModelType에 따라 Ollama API 인스턴스의 모델명을 동기화합니다.
     */
    private syncOllamaModel(ollamaApi: OllamaApi, modelType: AiModelType): void {
        const actualModelName = this.getActualModelName(modelType);

        if (actualModelName) {
            ollamaApi.setModel(actualModelName);
            console.log(`[ConversationManager] Synced Ollama model to: ${actualModelName} for type: ${modelType}`);
        }
    }
}
