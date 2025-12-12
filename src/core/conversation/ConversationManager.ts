/**
 * Conversation Manager
 * 사용자 메시지 처리 및 응답 생성을 담당하는 오케스트레이션 매니저
 * LLM 호출, 컨텍스트 수집, 액션 실행을 조율
 */

import * as vscode from 'vscode';
import { PromptType, ExternalApiService, GitRepositoryService } from '../../services';
import { LLMApiClient } from '../model/LLMApiClient';
import { ContextManager } from '../context/ContextManager';
import { ActionManager } from '../action/ActionManager';
import { ProjectManager } from '../project/ProjectManager';
import { SessionManager } from '../state/SessionManager';
import { SettingsManager } from '../state/SettingsManager';
import { ErrorManager } from '../error/ErrorManager';
import { ErrorSource } from '../error/types';
import { WebviewBridge } from '../webview/WebviewBridge';
import { PromptBuilder } from '../context/PromptBuilder';
import { IntentDetector, IntentDetectionResult } from '../action/IntentDetector';
import { TaskManager } from '../task/TaskManager';
import { PlanManager } from '../task/PlanManager';
import { checkTokenLimit, logTokenUsage, estimateTokens, safePostMessage } from '../../utils';
import { TerminalManager } from '../terminal/TerminalManager';

export interface ConversationOptions {
    userQuery: string;
    webviewToRespond: vscode.Webview;
    promptType: PromptType;
    imageData?: string;
    imageMimeType?: string;
    selectedFiles?: string[];
    extensionContext?: vscode.ExtensionContext;
    geminiApi?: any;
    ollamaApi?: any;
    currentModelType?: any;
    userOS?: string;
    notificationService?: any;
    gitRepositoryService?: GitRepositoryService;
    abortSignal?: AbortSignal;
}

export class ConversationManager {
    private static instance: ConversationManager;
    private llmService?: LLMApiClient;
    private contextManager: ContextManager;
    private projectManager: ProjectManager;
    private sessionManager?: SessionManager;
    private settingsManager: SettingsManager;
    private errorManager: ErrorManager;
    private promptBuilder?: PromptBuilder;
    private intentDetector?: IntentDetector;
    private planManager: PlanManager;
    private externalApiService?: ExternalApiService;

    private constructor() {
        this.contextManager = ContextManager.getInstance();
        this.projectManager = ProjectManager.getInstance();
        this.settingsManager = SettingsManager.getInstance();
        this.errorManager = ErrorManager.getInstance();
        this.planManager = PlanManager.getInstance();
        console.log('[ConversationManager] Initialized');
    }

    public static getInstance(): ConversationManager {
        if (!ConversationManager.instance) {
            ConversationManager.instance = new ConversationManager();
        }
        return ConversationManager.instance;
    }

    /**
     * LLM Service를 설정합니다
     */
    public setLLMService(llmService: LLMApiClient): void {
        this.llmService = llmService;
    }

    /**
     * Session Manager를 설정합니다
     */
    public setSessionManager(sessionManager: SessionManager): void {
        this.sessionManager = sessionManager;
    }

    /**
     * Prompt Builder를 설정합니다
     */
    public setPromptBuilder(promptBuilder: PromptBuilder): void {
        this.promptBuilder = promptBuilder;
    }

    /**
     * Intent Detector를 설정합니다
     */
    public setIntentDetector(intentDetector: IntentDetector): void {
        this.intentDetector = intentDetector;
    }

    /**
     * External API Service를 설정합니다
     */
    public setExternalApiService(externalApiService: ExternalApiService): void {
        this.externalApiService = externalApiService;
    }

    /**
     * Plan Manager에 LLM Service를 설정합니다
     */
    public configurePlanManager(llmService: LLMApiClient, modelType: any): void {
        this.planManager.setLLMService(llmService, modelType);
    }

    /**
     * 사용자 메시지를 처리하고 응답을 생성합니다
     */
    public async handleUserMessageAndRespond(options: ConversationOptions): Promise<void> {
        const {
            userQuery,
            webviewToRespond,
            promptType,
            imageData,
            imageMimeType,
            selectedFiles,
            extensionContext,
            geminiApi,
            ollamaApi,
            currentModelType,
            userOS = 'unknown',
            notificationService,
            gitRepositoryService,
            abortSignal
        } = options;

        if (!this.llmService) {
            throw new Error('LLM Service not set');
        }

        try {
            // 새로운 질문 시작 시 작업 큐 리셋
            try {
                const taskManager = TaskManager.getInstance(extensionContext);
                if (taskManager) {
                    console.log('[ConversationManager] 새로운 질문 시작 - 작업 큐 리셋');
                    taskManager.clearPlanQueue();
                    safePostMessage(webviewToRespond, {
                        command: 'updateTaskQueue',
                        items: []
                    });
                }
            } catch (e) {
                console.warn('[ConversationManager] 작업 큐 리셋 실패:', e);
            }

            safePostMessage(webviewToRespond, { command: 'showLoading' });

            // 프로젝트 프로필 로드
            let projectProfile: any;
            try {
                const projectRoot = await this.settingsManager.getProjectRoot();
                if (projectRoot && extensionContext) {
                    await this.projectManager.initialize(projectRoot);
                    projectProfile = await this.projectManager.getProjectProfile(extensionContext.globalState);
                }
            } catch (e) {
                console.warn('[ConversationManager] ProjectManager 프로필 로드 실패:', e);
            }

            // 의도 감지
            let intentResult: IntentDetectionResult | undefined;
            if (this.intentDetector) {
                try {
                    WebviewBridge.sendProcessingStep(webviewToRespond, 'intent');
                    WebviewBridge.sendProcessingStatus(webviewToRespond, 'intent', `Analyzing user query: "${userQuery.substring(0, 50)}${userQuery.length > 50 ? '...' : ''}"`);

                    // 프로젝트 타입 감지
                    let projectTypeInfo = '';
                    let detectedProjectType = 'unknown';

                    try {
                        const projectRoot = await this.settingsManager.getProjectRoot();
                        if (projectRoot) {
                            const projectTypeResult = await this.projectManager.detectProjectTypeFromQuery(
                                userQuery,
                                projectRoot,
                                geminiApi,
                                ollamaApi,
                                currentModelType,
                                abortSignal
                            );
                            console.log(`[ConversationManager] LLM 기반 프로젝트 타입: ${projectTypeResult.projectType}, confidence: ${projectTypeResult.confidence}, needsUserSelection: ${projectTypeResult.needsUserSelection}`);

                            if (projectTypeResult.projectType !== 'unknown') {
                                detectedProjectType = projectTypeResult.projectType;
                                console.log(`[ConversationManager] 프로젝트 타입 자동 선택: ${detectedProjectType} (confidence: ${projectTypeResult.confidence})`);
                            } else {
                                detectedProjectType = 'unknown';
                                console.log(`[ConversationManager] 프로젝트 타입 감지 실패: unknown`);
                            }

                            projectTypeInfo = ` | Project Type: ${detectedProjectType}`;
                            WebviewBridge.sendProcessingStatus(webviewToRespond, 'intent', `Detected project type: ${detectedProjectType} (confidence: ${projectTypeResult.confidence}) | OS: ${userOS}`);
                        }
                    } catch (e) {
                        console.warn('[ConversationManager] 프로젝트 타입 감지 실패:', e);
                    }

                    intentResult = await this.intentDetector.detectIntent(userQuery, {
                        modelName: currentModelType
                    });
                    console.log(`[ConversationManager] Intent detected: ${intentResult.category}/${intentResult.subtype} (confidence: ${intentResult.confidence})`);
                    WebviewBridge.sendProcessingStatus(webviewToRespond, 'intent', `Intent: ${intentResult.category}/${intentResult.subtype} (${(intentResult.confidence * 100).toFixed(0)}%)${projectTypeInfo}`);
                } catch (e) {
                    console.warn('[ConversationManager] Intent detection failed:', e);
                }
            }

            // 실행 의도 처리
            if (intentResult && intentResult.category === 'execution' && (intentResult.subtype === 'execution_build' || intentResult.subtype === 'execution_run' || intentResult.subtype === 'execution_install' || intentResult.subtype === 'execution_deploy')) {
                const autoExecuteCommands = await this.settingsManager.isAutoExecuteCommandsEnabled();
                if (autoExecuteCommands) {
                    try {
                        await this.handleExecutionIntentWithActionPlan({
                            userQuery,
                            webviewToRespond,
                            intentResult,
                            extensionContext,
                            geminiApi,
                            ollamaApi,
                            currentModelType,
                            abortSignal
                        });
                        return;
                    } catch (e) {
                        console.warn('[ConversationManager] 실행 의도 처리 중 오류 - 일반 경로로 폴백합니다:', e);
                    }
                }
            }

            // 대화 기록 관리
            let historyContext = '';
            let history: { userQuery: string, aiResponse?: string, timestamp: number }[] = [];
            if (this.sessionManager && extensionContext) {
                const tabType = promptType === PromptType.CODE_GENERATION ? 'code' : 'ask';
                historyContext = this.sessionManager.getTabHistoryContext(tabType, 5);
                history = this.sessionManager.getTabHistory(tabType, 5);
            }

            // 실시간 정보 요청 처리
            const realTimeInfo = this.externalApiService
                ? await this.externalApiService.getRealTimeSummary('서울').catch(() => '')
                : '';

            // 컨텍스트 수집
            let fileContentsContext = '';
            let includedFilesForContext: { name: string, fullPath: string }[] = [];

            const isCodeRelated = intentResult && this.isCodeRelatedIntent(intentResult);

            if (isCodeRelated && promptType === PromptType.CODE_GENERATION) {
                WebviewBridge.sendProcessingStep(webviewToRespond, 'keywords');
                WebviewBridge.sendProcessingStatus(webviewToRespond, 'keywords', 'Extracting keywords from query...');
                let relevantContextResult: any;
                try {
                    relevantContextResult = await this.contextManager.getRelevantFilesContext(userQuery, abortSignal!, history);
                } catch (error) {
                    console.warn('[ConversationManager] ContextManager.getRelevantFilesContext 실패:', error);
                    relevantContextResult = { fileContentsContext: '', includedFilesForContext: [], extractedKeywords: [], selectedKeywords: { keywords: [], reasoning: '', confidence: 0 } };
                }
                fileContentsContext = relevantContextResult.fileContentsContext || '';
                includedFilesForContext = Array.isArray(relevantContextResult.includedFilesForContext) ? relevantContextResult.includedFilesForContext : [];

                // Plan 생성 (코드 생성 의도인 경우)
                if (intentResult && intentResult.taskType === 'code_work') {
                    try {
                        WebviewBridge.sendProcessingStep(webviewToRespond, 'plan');
                        const planPrompt = await this.planManager.buildPlanPrompt(
                            userQuery,
                            relevantContextResult.selectedKeywords?.keywords || [],
                            userOS,
                            await this.getCurrentModelName(geminiApi, ollamaApi, currentModelType),
                            includedFilesForContext
                        );

                        const lang = (await this.settingsManager.getLanguage?.()) || 'ko';
                        const forceKorean = lang.toLowerCase().startsWith('ko');
                        const systemPromptForPlan = forceKorean
                            ? '**매우 중요: 반드시 체크박스 형식으로 출력하세요.**\n\n계획을 작성할 때는 반드시 마크다운 체크박스 형식 "- [ ] 작업 내용"을 사용하세요.'
                            : '**CRITICAL: You MUST output in checkbox format.**\n\nWhen writing a plan, you MUST use markdown checkbox format "- [ ] task description".';

                        const parts = [{ text: planPrompt }];
                        let planText: string | null = null;
                        if (currentModelType === 'gemini' && geminiApi) {
                            planText = await geminiApi.sendMessageWithSystemPrompt(systemPromptForPlan, parts, { signal: abortSignal });
                        } else if (ollamaApi) {
                            try { await ollamaApi.loadSettingsFromStorage(); } catch { }
                            planText = await ollamaApi.sendMessageWithSystemPrompt(systemPromptForPlan, parts, { signal: abortSignal });
                        }

                        if (planText && planText.trim()) {
                            const itemsToEnqueue = this.planManager.parseCheckboxItemsFromPlan(planText);
                            WebviewBridge.sendProcessingStatus(webviewToRespond, 'plan', `Plan 생성 완료: ${itemsToEnqueue.length}개 확인 사항`);
                        }
                    } catch (planErr) {
                        console.warn('[ConversationManager] Plan generation failed:', planErr);
                    }
                }
            } else if (promptType === PromptType.GENERAL_ASK) {
                // ASK 탭: 코드 관련 질문인 경우에만 파일 컨텍스트 수집
                WebviewBridge.sendProcessingStep(webviewToRespond, 'keywords');
                WebviewBridge.sendProcessingStatus(webviewToRespond, 'keywords', 'Extracting keywords from query...');
                let relevantContextResult: any;
                try {
                    relevantContextResult = await this.contextManager.getRelevantFilesContext(userQuery, abortSignal!, history);
                } catch (error) {
                    console.warn('[ConversationManager] ContextManager.getRelevantFilesContext (ASK) 실패:', error);
                    relevantContextResult = { fileContentsContext: '', includedFilesForContext: [], extractedKeywords: [], selectedKeywords: { keywords: [], reasoning: '', confidence: 0 } };
                }
                fileContentsContext = relevantContextResult.fileContentsContext || '';
                includedFilesForContext = Array.isArray(relevantContextResult.includedFilesForContext) ? relevantContextResult.includedFilesForContext : [];
            }

            // 선택된 파일들의 내용을 읽어서 컨텍스트에 추가
            let selectedFilesContext = "";
            if (selectedFiles && selectedFiles.length > 0) {
                WebviewBridge.sendProcessingStep(webviewToRespond, 'analyzing');
                WebviewBridge.sendProcessingStatus(webviewToRespond, 'analyzing', `Reading ${selectedFiles.length} selected files...`);
                for (let i = 0; i < selectedFiles.length; i++) {
                    const filePath = selectedFiles[i];
                    try {
                        const fileUri = vscode.Uri.file(filePath);
                        const contentBytes = await vscode.workspace.fs.readFile(fileUri);
                        const content = Buffer.from(contentBytes).toString('utf8');
                        const fileName = filePath.split(/[/\\]/).pop() || 'Unknown';

                        includedFilesForContext.push({
                            name: fileName,
                            fullPath: filePath
                        });

                        selectedFilesContext += `파일명: ${fileName}\n경로: ${filePath}\n코드:\n\`\`\`\n${content}\n\`\`\`\n\n`;

                        WebviewBridge.sendProcessingStatus(webviewToRespond, 'analyzing', `Reading file ${i + 1}/${selectedFiles.length}: ${fileName} (${content.length.toLocaleString()} chars)`);
                    } catch (error) {
                        console.error(`Error reading selected file ${filePath}:`, error);
                        selectedFilesContext += `파일명: ${filePath.split(/[/\\]/).pop() || 'Unknown'}\n경로: ${filePath}\n오류: 파일을 읽을 수 없습니다.\n\n`;
                    }
                }
            }

            // 전체 파일 컨텍스트 구성
            let fullFileContentsContext = fileContentsContext;
            if (selectedFilesContext) {
                fullFileContentsContext += `\n--- 사용자가 선택한 추가 파일들 ---\n${selectedFilesContext}`;
            }

            // 프로젝트 타입 감지
            let detectedProjectType = 'unknown';
            try {
                const currentProject = this.projectManager.getCurrentProject();
                if (currentProject) {
                    detectedProjectType = currentProject.framework || currentProject.type || 'unknown';
                }
            } catch (error) {
                console.warn('[ConversationManager] Failed to detect project type:', error);
            }

            // 시스템 프롬프트 생성
            const profileContext = projectProfile && this.contextManager
                ? this.contextManager.buildProfileContext(projectProfile, detectedProjectType)
                : '';
            const intentContext = intentResult && this.contextManager
                ? this.contextManager.buildIntentContext(intentResult)
                : '';

            if (!this.promptBuilder) {
                throw new Error('Prompt Builder not set');
            }

            const systemPrompt = await this.promptBuilder.generateSystemPrompt({
                userOS,
                modelType: currentModelType,
                promptType,
                codebaseContext: fullFileContentsContext,
                realTimeInfo,
                profileContext,
                intentContext,
                gitContext: gitRepositoryService ? await gitRepositoryService.getGitContextForLlm() : ''
            });

            // 사용자 메시지 파트 구성
            const userParts: any[] = [];
            if (historyContext) {
                userParts.push({ text: historyContext });
            }
            userParts.push({ text: userQuery });

            if (imageData && imageMimeType) {
                userParts.push({
                    inlineData: {
                        data: imageData,
                        mimeType: imageMimeType
                    }
                });
            }

            // 토큰 제한 확인
            const currentModelName = await this.getCurrentModelName(geminiApi, ollamaApi, currentModelType);
            const tokenCheck = checkTokenLimit(systemPrompt, userParts, currentModelType, currentModelName);
            logTokenUsage(systemPrompt, userParts, currentModelType, currentModelName);

            if (tokenCheck.isExceeded) {
                const errorMessage = tokenCheck.message;
                console.error(`[ConversationManager] ${errorMessage}`);
                if (notificationService) {
                    notificationService.showErrorMessage(`AIDEV-IDE: ${errorMessage}`);
                }
                safePostMessage(webviewToRespond, {
                    command: 'receiveMessage',
                    sender: 'AIDEV-IDE',
                    text: errorMessage
                });
                return;
            }

            // LLM 호출
            WebviewBridge.sendProcessingStep(webviewToRespond, 'assembling');
            const totalContextLength = systemPrompt.length + userParts.reduce((sum, part) => sum + (part.text?.length || 0), 0);
            const estimatedTokens = estimateTokens(systemPrompt + userParts.map(part => part.text || '').join(''));
            WebviewBridge.sendProcessingStatus(webviewToRespond, 'assembling', `Generating with ${currentModelName} (${totalContextLength.toLocaleString()} chars, ~${estimatedTokens.toLocaleString()} tokens)...`);

            const llmResponse = await this.llmService.sendMessageWithSystemPrompt(
                systemPrompt,
                userParts,
                { signal: abortSignal }
            );

            const outputTokens = estimateTokens(llmResponse);
            WebviewBridge.sendProcessingStatus(webviewToRespond, 'assembling', `Generated ${llmResponse.length.toLocaleString()} chars (~${outputTokens.toLocaleString()} tokens) response`);

            // 응답 처리
            WebviewBridge.sendProcessingStep(webviewToRespond, 'parsing');
            WebviewBridge.sendProcessingStatus(webviewToRespond, 'parsing', 'Processing response format...');

            // 코드 생성 의도인 경우 액션 처리
            if (promptType === PromptType.CODE_GENERATION) {
                try {
                    const actionManager = ActionManager.getInstance();
                    const context = {
                        projectRoot: vscode.workspace.workspaceFolders?.[0].uri.fsPath || '',
                        workspaceRoot: vscode.workspace.workspaceFolders?.[0].uri.fsPath || '',
                        currentFile: vscode.window.activeTextEditor?.document.uri.fsPath
                    };
                    
                    // 컨텍스트 설정
                    actionManager.setContext(context);
                    
                    // LLM 응답을 액션으로 매핑
                    const actionResult = await actionManager.mapResponse({
                        content: llmResponse,
                        actions: undefined,
                        explanation: undefined
                    });

                    if (actionResult.actions.length > 0) {
                        WebviewBridge.sendProcessingStatus(webviewToRespond, 'parsing', `Found ${actionResult.actions.length} actions to execute`);

                        // Plan 내용을 TaskManager와 Webview에 투영
                        try {
                            const taskManager = TaskManager.getInstance(extensionContext);
                            if (taskManager) {
                                taskManager.clearPlanQueue();
                                const items = actionResult.actions.map(action => ({
                                    title: this.formatActionTitle(action),
                                    detail: `${action.id}|${action.params?.command || action.params?.filePath || action.params?.content?.substring(0, 100) || 'N/A'}`
                                }));
                                taskManager.enqueuePlanItems(items);
                                // detail에서 액션 ID 제거하여 표시
                                const displayItems = taskManager.listPlanItems().map(item => ({
                                    ...item,
                                    detail: item.detail?.includes('|') ? item.detail.split('|').slice(1).join('|') : item.detail
                                }));
                                safePostMessage(webviewToRespond, {
                                    command: 'updateTaskQueue',
                                    items: displayItems
                                });
                            }
                        } catch (e) {
                            console.warn('[ConversationManager] 실행 플랜을 작업 큐에 반영하는 중 오류:', e);
                        }

                        let successCount = 0;
                        let failCount = 0;

                        for (const action of actionResult.actions) {
                            const validation = await actionManager.validateAction(action);
                            if (!validation.valid) {
                                const errorMsg = validation.errors.map(e => e.message).join(', ');
                                safePostMessage(webviewToRespond, {
                                    command: 'receiveMessage',
                                    sender: 'AIDEV-IDE',
                                    text: `⚠️ Action validation failed: ${errorMsg}`
                                });
                                failCount++;
                                continue;
                            }

                            const result = await actionManager.executeAction(action);

                            // 작업 큐 상태 업데이트
                            try {
                                const taskManager = TaskManager.getInstance(extensionContext);
                                if (taskManager) {
                                    const items = taskManager.listPlanItems();
                                    const actionDetail = `${action.id}|${action.params?.command || action.params?.filePath || 'N/A'}`;
                                    const item = items.find(item => item.detail?.startsWith(`${action.id}|`));
                                    if (item) {
                                        taskManager.updatePlanItemStatus(item.id, result.success ? 'done' : 'failed');
                                        // detail에서 액션 ID 제거하여 표시
                                        const displayItems = taskManager.listPlanItems().map(i => ({
                                            ...i,
                                            detail: i.detail?.includes('|') ? i.detail.split('|').slice(1).join('|') : i.detail
                                        }));
                                        safePostMessage(webviewToRespond, {
                                            command: 'updateTaskQueue',
                                            items: displayItems
                                        });
                                    }
                                }
                            } catch (e) {
                                console.warn('[ConversationManager] 작업 큐 상태 업데이트 실패:', e);
                            }

                            if (result.success) {
                                successCount++;
                                // 파일 생성/수정 성공 메시지
                                if (action.type === 'code_generation' && action.params.filePath) {
                                    safePostMessage(webviewToRespond, {
                                        command: 'receiveMessage',
                                        sender: 'AIDEV-IDE',
                                        text: `✅ 파일 생성/수정 완료: ${action.params.filePath}`
                                    });
                                }
                            } else {
                                failCount++;
                                safePostMessage(webviewToRespond, {
                                    command: 'receiveMessage',
                                    sender: 'AIDEV-IDE',
                                    text: `❌ Action failed: ${result.message}`
                                });
                            }
                        }

                        // 실행 결과 요약 메시지
                        if (successCount > 0 || failCount > 0) {
                            const summaryMsg = `\n📊 실행 완료: 성공 ${successCount}개${failCount > 0 ? `, 실패 ${failCount}개` : ''}`;
                            safePostMessage(webviewToRespond, {
                                command: 'receiveMessage',
                                sender: 'AIDEV-IDE',
                                text: summaryMsg
                            });
                        }

                        WebviewBridge.sendProcessingStatus(webviewToRespond, 'parsing', `Executed ${actionResult.actions.length} actions`);
                    }
                } catch (error) {
                    console.error('[ConversationManager] Manager system error:', error);
                }
            }

            // GENERAL_ASK 타입 처리
            if (promptType === PromptType.GENERAL_ASK) {
                let cleanedResponse = llmResponse;
                let hasWarnings = false;

                // 터미널 명령어 체크
                if (TerminalManager.hasBashCommands(cleanedResponse)) {
                    const warningMsg = "ASK 탭에서는 터미널 명령어를 실행할 수 없습니다. CODE 탭을 사용해주세요.";
                    safePostMessage(webviewToRespond, { command: 'receiveMessage', sender: 'AIDEV-IDE', text: warningMsg });
                    if (notificationService) {
                        notificationService.showWarningMessage(`AIDEV-IDE: ${warningMsg}`);
                    }
                    hasWarnings = true;
                    cleanedResponse = this.removeBashCommands(cleanedResponse);
                }

                // 파일 작업 지시어 체크
                if (cleanedResponse.includes("새 파일:") || cleanedResponse.includes("수정 파일:") || cleanedResponse.includes("삭제 파일:")) {
                    const warningMsg = "ASK 탭에서는 파일 생성, 수정, 삭제를 할 수 없습니다. CODE 탭을 사용해주세요.";
                    safePostMessage(webviewToRespond, { command: 'receiveMessage', sender: 'AIDEV-IDE', text: warningMsg });
                    if (notificationService) {
                        notificationService.showWarningMessage(`AIDEV-IDE: ${warningMsg}`);
                    }
                    hasWarnings = true;
                    cleanedResponse = this.removeFileDirectives(cleanedResponse);
                }

                // 정리된 응답 전송
                if (cleanedResponse.trim()) {
                    safePostMessage(webviewToRespond, { command: 'receiveMessage', sender: 'AIDEV-IDE', text: cleanedResponse });
                }
            } else {
                // 코드 생성 응답 전송 (CODE 탭)
                const responseText = this.extractResponseText(llmResponse);
                if (responseText) {
                    safePostMessage(webviewToRespond, {
                        command: 'receiveMessage',
                        sender: 'AIDEV-IDE',
                        text: responseText
                    });
                }

                // 액션(코드/터미널/파일)이 없거나 모두 성공한 경우 완료 신호 전송
                try {
                    const { ActionManager } = await import('../action/ActionManager');
                    const actionManager = ActionManager.getInstance();
                    const active = actionManager.getActiveActions();
                    if (!active || active.length === 0) {
                        this.finishProcessing(webviewToRespond);
                    }
                } catch {
                    // 실패 시에도 완료 신호는 아래 공통 경로에서 처리
                }
            }

            // 히스토리 저장
            if (this.sessionManager && extensionContext) {
                const tabType = promptType === PromptType.CODE_GENERATION ? 'code' : 'ask';
                const summarizedResponse = this.summarizeAiResponse(llmResponse);
                this.sessionManager.addTabHistoryEntry(tabType, userQuery, summarizedResponse);
            }

            // 로딩 및 처리 단계 종료
            this.finishProcessing(webviewToRespond);
        } catch (error) {
            console.error('[ConversationManager] Error in handleUserMessageAndRespond:', error);
            const msg = error instanceof Error ? error.message : String(error);
            safePostMessage(webviewToRespond, {
                command: 'receiveMessage',
                sender: 'AIDEV-IDE',
                text: `❌ 오류 발생: ${msg}`
            });
            // 에러 발생 시에도 로딩 종료
            this.finishProcessing(webviewToRespond);
        }
    }

    /**
     * 처리 완료 시 웹뷰에 완료 신호를 전송합니다.
     */
    private finishProcessing(webview: vscode.Webview) {
        safePostMessage(webview, { command: 'hideLoading' });
        safePostMessage(webview, { command: 'hideProcessingSteps' });
        WebviewBridge.sendProcessingStep(webview, 'completed');
    }

    /**
     * 실행 의도 처리 및 액션 플랜 생성
     */
    private async handleExecutionIntentWithActionPlan(options: {
        userQuery: string;
        webviewToRespond: vscode.Webview;
        intentResult: IntentDetectionResult;
        extensionContext?: vscode.ExtensionContext;
        geminiApi?: any;
        ollamaApi?: any;
        currentModelType?: any;
        abortSignal?: AbortSignal;
    }): Promise<void> {
        const { userQuery, webviewToRespond, intentResult, extensionContext, geminiApi, ollamaApi, currentModelType, abortSignal } = options;

        try {
            WebviewBridge.sendProcessingStep(webviewToRespond, 'plan');
            WebviewBridge.sendProcessingStatus(webviewToRespond, 'plan', `실행 플랜 생성 중... (${intentResult.category}/${intentResult.subtype})`);

            // LLM에 실행 계획 요청
            const executionPrompt = `사용자 요청: ${userQuery}\n\n이 요청을 단계별 실행 계획으로 변환해주세요. 각 단계는 실행 가능한 명령어나 파일 작업이어야 합니다.`;

            // LLM 응답 받기
            let llmResponse: string;
            if (this.llmService) {
                try {
                    llmResponse = await this.llmService.sendMessage(executionPrompt, { signal: abortSignal });
                } catch (e) {
                    console.warn('[ConversationManager] llmService sendMessage 실패, 개별 API로 폴백:', e);
                    // fallback to direct APIs below
                    llmResponse = '';
                }
            } else if (currentModelType === 'gemini' && geminiApi) {
                llmResponse = await geminiApi.sendMessage(executionPrompt, undefined, { signal: abortSignal });
            } else if (ollamaApi) {
                await ollamaApi.loadSettingsFromStorage();
                llmResponse = await ollamaApi.sendMessage(executionPrompt, { signal: abortSignal });
            } else {
                throw new Error('No LLM API available');
            }

            // llmService 경로 실패 후 빈 문자열이면 개별 API로 폴백 시도
            if (!llmResponse) {
                if (currentModelType === 'gemini' && geminiApi) {
                    llmResponse = await geminiApi.sendMessage(executionPrompt, undefined, { signal: abortSignal });
                } else if (ollamaApi) {
                    await ollamaApi.loadSettingsFromStorage();
                    llmResponse = await ollamaApi.sendMessage(executionPrompt, { signal: abortSignal });
                } else {
                    throw new Error('No LLM API available');
                }
            }

            // ActionManager로 액션 추출
            const actionManager = ActionManager.getInstance();
            const context = {
                projectRoot: vscode.workspace.workspaceFolders?.[0].uri.fsPath || '',
                workspaceRoot: vscode.workspace.workspaceFolders?.[0].uri.fsPath || '',
                currentFile: vscode.window.activeTextEditor?.document.uri.fsPath
            };
            
            // 컨텍스트 설정
            actionManager.setContext(context);
            
            // LLM 응답을 액션으로 매핑
            const actionResult = await actionManager.mapResponse({
                content: llmResponse,
                actions: undefined,
                explanation: undefined
            });

            if (actionResult.actions.length === 0) {
                safePostMessage(webviewToRespond, {
                    command: 'receiveMessage',
                    sender: 'AIDEV-IDE',
                    text: '⚠️ 실행 가능한 액션을 찾을 수 없습니다.'
                });
                return;
            }

            // Plan 내용을 TaskManager와 Webview에 투영
            try {
                const taskManager = TaskManager.getInstance(extensionContext);
                if (taskManager) {
                    taskManager.clearPlanQueue();
                    const items = actionResult.actions.map(action => ({
                        title: this.formatActionTitle(action),
                        detail: `${action.id}|${action.params?.command || action.params?.filePath || 'N/A'}`
                    }));
                    taskManager.enqueuePlanItems(items);
                    // detail에서 액션 ID 제거하여 표시
                    const displayItems = taskManager.listPlanItems().map(item => ({
                        ...item,
                        detail: item.detail?.includes('|') ? item.detail.split('|').slice(1).join('|') : item.detail
                    }));
                    safePostMessage(webviewToRespond, {
                        command: 'updateTaskQueue',
                        items: displayItems
                    });
                }
            } catch (e) {
                console.warn('[ConversationManager] 실행 플랜을 작업 큐에 반영하는 중 오류:', e);
            }

            WebviewBridge.sendProcessingStatus(webviewToRespond, 'plan', `실행 플랜 생성 완료: ${actionResult.actions.length}개 액션`);

            // 실제 실행 단계
            WebviewBridge.sendProcessingStep(webviewToRespond, 'executing');
            WebviewBridge.sendProcessingStatus(webviewToRespond, 'executing', '액션을 순차적으로 실행합니다...');

            const results: string[] = [];
            let successCount = 0;
            let failCount = 0;

            for (const action of actionResult.actions) {
                const validation = await actionManager.validateAction(action);
                if (!validation.valid) {
                    const errorMsg = validation.errors.map(e => e.message).join(', ');
                    results.push(`❌ ${action.type}: 검증 실패 - ${errorMsg}`);
                    failCount++;
                    continue;
                }

                const result = await actionManager.executeAction(action);

                // 작업 큐 상태 업데이트
                try {
                    const taskManager = TaskManager.getInstance(extensionContext);
                    if (taskManager) {
                        const items = taskManager.listPlanItems();
                        const item = items.find(item => item.detail?.startsWith(`${action.id}|`));
                        if (item) {
                            taskManager.updatePlanItemStatus(item.id, result.success ? 'done' : 'failed');
                            // detail에서 액션 ID 제거하여 표시
                            const displayItems = taskManager.listPlanItems().map(i => ({
                                ...i,
                                detail: i.detail?.includes('|') ? i.detail.split('|').slice(1).join('|') : i.detail
                            }));
                            safePostMessage(webviewToRespond, {
                                command: 'updateTaskQueue',
                                items: displayItems
                            });
                        }
                    }
                } catch (e) {
                    console.warn('[ConversationManager] 작업 큐 상태 업데이트 실패:', e);
                }

                const detail = this.formatActionDetail(action);

                if (result.success) {
                    results.push(`✅ 명령어 실행 완료 : ${detail}`);
                    successCount++;
                } else {
                    results.push(`❌ 명령어 실행 실패 : ${detail} - ${result.message}`);
                    failCount++;
                }
            }

            // 실행 결과를 사용자에게 요약해서 전달
            const summaryLines: string[] = [];
            summaryLines.push(`### 실행 플랜 결과`);
            summaryLines.push(`- 총 액션 수: ${actionResult.actions.length}`);
            summaryLines.push(`- 성공: ${successCount}개`);
            summaryLines.push(`- 실패: ${failCount}개`);
            summaryLines.push('');
            summaryLines.push('### 상세 결과');
            results.forEach(r => summaryLines.push(r));

            safePostMessage(webviewToRespond, {
                command: 'receiveMessage',
                sender: 'AIDEV-IDE',
                text: summaryLines.join('\n')
            });

            // 작업 큐 비우기
            try {
                const taskManager = TaskManager.getInstance(extensionContext);
                if (taskManager) {
                    taskManager.clearPlanQueue();
                    safePostMessage(webviewToRespond, {
                        command: 'updateTaskQueue',
                        items: []
                    });
                }
            } catch (e) {
                console.warn('[ConversationManager] 작업 큐 비우기 실패:', e);
            }

            WebviewBridge.sendProcessingStatus(webviewToRespond, 'executing', '실행 플랜 처리가 완료되었습니다.');
            this.finishProcessing(webviewToRespond);
        } catch (error) {
            console.error('[ConversationManager] 실행 의도 처리 중 오류:', error);
            const msg = error instanceof Error ? error.message : String(error);
            safePostMessage(webviewToRespond, {
                command: 'receiveMessage',
                sender: 'AIDEV-IDE',
                text: `❌ 실행 플랜 처리 실패: ${msg}`
            });
            WebviewBridge.sendProcessingStatus(webviewToRespond, 'executing', '실행 플랜 처리 실패');
            this.finishProcessing(webviewToRespond);
        }
    }

    /**
     * 코드 관련 의도인지 확인
     */
    private isCodeRelatedIntent(intentResult: { category: string; subtype: string; confidence: number }): boolean {
        return intentResult.category === 'code' || intentResult.subtype === 'code_generate' || intentResult.subtype === 'code_modify';
    }

    /**
     * 액션별 요약 정보를 만듭니다.
     */
    private formatActionTitle(action: any): string {
        switch (action.type) {
            case 'code_generation':
                return `코드 생성: ${action.params?.filePath || 'N/A'}`;
            case 'file_operation':
                return `파일 작업: ${action.params?.filePath || 'N/A'}`;
            case 'terminal_command':
                return `터미널 명령: ${action.params?.command || 'N/A'}`;
            default:
                return `${action.type}: ${action.params?.filePath || action.params?.command || 'N/A'}`;
        }
    }

    private formatActionDetail(action: any): string {
        if (action.type === 'terminal_command') {
            return this.sanitizeCommandText(action.params?.command || 'command');
        }
        if (action.type === 'code_generation') {
            return action.params?.filePath || 'file';
        }
        if (action.type === 'file_operation') {
            const op = action.params?.operation || 'op';
            const src = action.params?.sourcePath || action.params?.filePath || 'path';
            const dst = action.params?.targetPath ? ` → ${action.params.targetPath}` : '';
            return `${op} ${src}${dst}`;
        }
        return action.type;
    }

    /**
     * 명령 문자열에서 주석/특수 따옴표를 정리합니다.
     */
    private sanitizeCommandText(cmd: string): string {
        if (!cmd || typeof cmd !== 'string') return cmd;
        let cleaned = cmd.replace(/[“”]/g, '"');
        // 첫 번째 # 이후는 주석으로 간주하고 제거
        cleaned = cleaned.split('#')[0].trim();
        // 공백 정리
        cleaned = cleaned.replace(/\s+/g, ' ').trim();
        return cleaned || cmd.trim();
    }

    /**
     * 현재 모델명 가져오기
     */
    private async getCurrentModelName(geminiApi?: any, ollamaApi?: any, currentModelType?: any): Promise<string> {
        try {
            if (currentModelType === 'gemini' && geminiApi) {
                return 'Gemini 2.5 Flash';
            } else if (ollamaApi) {
                return ollamaApi.getModel?.() || ollamaApi.getCurrentModelName?.() || 'Ollama Model';
            }
        } catch { }
        return 'Unknown Model';
    }

    /**
     * 응답 텍스트 추출
     */
    private extractResponseText(llmResponse: string): string {
        if (!llmResponse) {
            return '';
        }
        // 프론트 패널에 기존 출력 그대로 보여주기 위해 최대한 원본을 유지
        // (aidev-ide-old 동작과 동일하게 코드블록/마크다운을 포함한 전체 텍스트 전달)
        return llmResponse.trim();
    }

    /**
     * Bash 명령어 제거
     */
    private removeBashCommands(response: string): string {
        return response.replace(/```\s*(bash|sh|powershell|ps1|pwsh|cmd)\s*[\s\S]*?```/gi, '');
    }

    /**
     * 파일 지시어 제거
     */
    private removeFileDirectives(response: string): string {
        return response.replace(/(새 파일:|수정 파일:|삭제 파일:)\s*[^\n]+/g, '');
    }

    /**
     * AI 응답 요약
     */
    private summarizeAiResponse(response: string): string {
        const maxLength = 200;
        if (response.length <= maxLength) {
            return response;
        }
        return response.substring(0, maxLength) + '...';
    }
}

