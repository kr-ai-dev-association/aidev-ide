/**
 * Conversation Manager
 * 사용자 메시지 처리 및 응답 생성을 담당하는 오케스트레이션 매니저
 * LLM 호출, 컨텍스트 수집, 액션 실행을 조율
 */

import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { PromptType, ExternalApiService, GitRepositoryService } from '../../../services';
import { LLMApiClient } from '../model/LLMApiClient';
import { ContextManager } from '../context/ContextManager';
import { ActionManager } from '../action/ActionManager';
import { ExecutionManager } from '../execution/ExecutionManager';
import { ProjectManager } from '../project/ProjectManager';
import { SessionManager } from '../state/SessionManager';
import { SettingsManager } from '../state/SettingsManager';
import { ErrorManager } from '../error/ErrorManager';
import { ErrorSource } from '../error/types';
import { WebviewBridge } from '../../webview/WebviewBridge';
import { PromptBuilder } from '../context/PromptBuilder';
import { IntentDetector, IntentDetectionResult } from '../action/IntentDetector';
import { TaskManager } from '../task/TaskManager';
import { PlanManager } from '../task/PlanManager';
import type { ToolUse, ToolResponse } from '../../tools/types';
import { checkTokenLimit, logTokenUsage, estimateTokens, safePostMessage } from '../../../utils';
import { TerminalManager } from '../terminal/TerminalManager';
import { ContextHistoryManager } from '../context/ContextHistoryManager';
import { ConversationSummarizer } from '../context/ConversationSummarizer';
import { ContextType } from '../context/types';
import { ConversationEntry } from '../state/types';
import { TreeSitterAdapter } from '../project/codeParser/TreeSitterAdapter';

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
    private currentToolEnum: any; // Tool enum을 저장하기 위한 필드
    private contextManager: ContextManager;
    private projectManager: ProjectManager;
    private sessionManager?: SessionManager;
    private settingsManager: SettingsManager;
    private errorManager: ErrorManager;
    private promptBuilder?: PromptBuilder;
    private intentDetector?: IntentDetector;
    private planManager: PlanManager;
    private externalApiService?: ExternalApiService;
    private contextHistoryManager?: ContextHistoryManager;
    private conversationSummarizer?: ConversationSummarizer;

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
        // Conversation Summarizer에도 LLM 클라이언트 설정
        if (this.conversationSummarizer) {
            this.conversationSummarizer.setLLMClient(llmService);
        }
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
     * Context History Manager를 설정합니다
     */
    public setContextHistoryManager(contextHistoryManager: ContextHistoryManager): void {
        this.contextHistoryManager = contextHistoryManager;
    }

    /**
     * Conversation Summarizer를 설정합니다
     */
    public setConversationSummarizer(conversationSummarizer: ConversationSummarizer): void {
        this.conversationSummarizer = conversationSummarizer;
        if (this.contextHistoryManager) {
            this.contextHistoryManager.setSummarizer(conversationSummarizer);
        }
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

            // 프로젝트 파일 인벤토리 추가 (최대 400개, 최신 루트 스냅샷)
            try {
                const inventory = await this.projectManager.buildProjectInventorySection(400);
                if (inventory) {
                    fullFileContentsContext += `\n${inventory}`;
                }
            } catch (error) {
                console.warn('[ConversationManager] 프로젝트 파일 인벤토리 생성 실패:', error);
            }

            // 컨텍스트 수집 및 히스토리 기록 (Phase 2.1)
            let contextData: any = null;
            let conversationHistory: ConversationEntry[] = [];

            // ContextHistoryManager 초기화 (필요시)
            if (extensionContext && !this.contextHistoryManager) {
                this.contextHistoryManager = ContextHistoryManager.getInstance(extensionContext);
            }

            if (extensionContext && this.contextHistoryManager) {
                try {

                    // 컨텍스트 데이터 수집
                    contextData = await this.contextManager.collectContext({
                        types: [ContextType.FILE, ContextType.SELECTION, ContextType.CURSOR, ContextType.ERROR, ContextType.TERMINAL],
                        includeContent: true,
                        maxTokens: 50000
                    });

                    // 대화 히스토리 가져오기
                    if (this.sessionManager) {
                        const session = this.sessionManager.getCurrentSession();
                        if (session) {
                            conversationHistory = session.conversationHistory || [];
                        }
                    }

                    // 컨텍스트 업데이트 기록
                    const messageIndex = conversationHistory.length;
                    if (contextData.file) {
                        this.contextHistoryManager.recordContextUpdate(
                            messageIndex,
                            'add',
                            'file',
                            contextData.file.content || '',
                            { path: contextData.file.path }
                        );
                    }
                    if (contextData.selection) {
                        this.contextHistoryManager.recordContextUpdate(
                            messageIndex,
                            'add',
                            'selection',
                            contextData.selection.text || '',
                            { file: contextData.selection.file }
                        );
                    }
                    if (contextData.cursor) {
                        this.contextHistoryManager.recordContextUpdate(
                            messageIndex,
                            'add',
                            'cursor',
                            contextData.cursor.surroundingLines?.join('\n') || '',
                            { file: contextData.cursor.file, line: contextData.cursor.line }
                        );
                    }
                    if (contextData.terminal) {
                        this.contextHistoryManager.recordContextUpdate(
                            messageIndex,
                            'add',
                            'terminal',
                            contextData.terminal.lastOutput || '',
                            { cwd: contextData.terminal.currentWorkingDirectory }
                        );
                    }
                    if (contextData.errors && contextData.errors.length > 0) {
                        for (const error of contextData.errors) {
                            this.contextHistoryManager.recordContextUpdate(
                                messageIndex,
                                'add',
                                'error',
                                error.message || '',
                                {
                                    type: error.type,
                                    source: error.source,
                                    file: error.file,
                                    line: error.line
                                }
                            );
                        }
                    }

                    // 컨텍스트 크기 확인 및 압축 (Phase 2.2)
                    const sizeInfo = this.contextHistoryManager.checkContextSize(contextData, conversationHistory);
                    if (sizeInfo.isExceeded) {
                        const maxTokenSize = this.contextHistoryManager.getMaxTokenSize();
                        console.log(`[ConversationManager] Context size exceeded (${sizeInfo.characterCount}/${sizeInfo.maxSize} chars, ${sizeInfo.tokenCount}/${maxTokenSize} tokens)`);

                        // 압축 전략 결정
                        const apiHistory = this.contextHistoryManager.getApiConversationHistory();
                        const currentDeletedRange = this.contextHistoryManager.getConversationHistoryDeletedRange();

                        // 토큰 사용량에 따라 압축 전략 선택
                        const tokenUsageRatio = sizeInfo.tokenCount! / maxTokenSize;
                        let keepStrategy: 'none' | 'lastTwo' | 'half' | 'quarter' = 'half';
                        if (tokenUsageRatio > 0.9) {
                            keepStrategy = 'quarter'; // 90% 이상이면 1/4만 유지
                        } else if (tokenUsageRatio > 0.75) {
                            keepStrategy = 'half'; // 75% 이상이면 절반 유지
                        } else {
                            keepStrategy = 'lastTwo'; // 그 외는 마지막 2개만 유지
                        }

                        const newDeletedRange = this.contextHistoryManager.getNextTruncationRange(
                            apiHistory,
                            currentDeletedRange,
                            keepStrategy
                        );

                        this.contextHistoryManager.setConversationHistoryDeletedRange(newDeletedRange);
                        console.log(`[ConversationManager] Context compressed with strategy: ${keepStrategy}, deleted range: [${newDeletedRange[0]}, ${newDeletedRange[1]}]`);

                        // 압축으로도 부족하면 요약 트리거 (Phase 3.3)
                        if (tokenUsageRatio > 0.95 && this.conversationSummarizer) {
                            console.log('[ConversationManager] Token usage very high (>95%), triggering summarization...');
                            WebviewBridge.sendProcessingStep(webviewToRespond, 'summarizing');
                            WebviewBridge.sendProcessingStatus(webviewToRespond, 'summarizing', 'Summarizing conversation history...');

                            const summary = await this.contextHistoryManager.triggerAutoSummarization(
                                conversationHistory,
                                contextData
                            );

                            if (summary) {
                                // 요약된 세션 재개 프롬프트 생성
                                const continuationPrompt = this.contextHistoryManager.createContinuationPrompt(summary);

                                // 히스토리 컨텍스트에 요약 추가
                                historyContext = continuationPrompt + '\n\n--- 최근 대화 ---\n' + historyContext;

                                WebviewBridge.sendProcessingStatus(webviewToRespond, 'summarizing', `Summarized ${conversationHistory.length} messages`);
                            }
                        }
                    }
                } catch (error) {
                    console.warn('[ConversationManager] Context history management failed:', error);
                }
            }

            // 현재 활성 파일의 내용을 fullFileContentsContext에 추가
            if (contextData && contextData.file && contextData.file.content) {
                const currentFileContext = `\n--- 현재 활성 파일: ${contextData.file.name} ---\n경로: ${contextData.file.path}\n\n${contextData.file.content}\n`;
                fullFileContentsContext = currentFileContext + fullFileContentsContext;
                console.log(`[ConversationManager] Added current file context to prompt: ${contextData.file.name} (${contextData.file.lines} lines)`);
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
                gitContext: gitRepositoryService ? await gitRepositoryService.getGitContextForLlm() : '',
                userQuery: userQuery // 프레임워크 추출용
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

            // 코드 생성 의도 또는 실행 의도인 경우 액션 처리 (tool calling 사용)
            if (promptType === PromptType.CODE_GENERATION || intentResult?.taskType === 'execution_work') {
                try {
                    const actionManager = ActionManager.getInstance();
                    const executionManager = ExecutionManager.getInstance();
                    const terminalManager = TerminalManager.getInstance();
                    const contextManager = ContextManager.getInstance();

                    const context = {
                        projectRoot: vscode.workspace.workspaceFolders?.[0].uri.fsPath || '',
                        workspaceRoot: vscode.workspace.workspaceFolders?.[0].uri.fsPath || '',
                        currentFile: vscode.window.activeTextEditor?.document.uri.fsPath
                    };

                    // 컨텍스트 설정
                    actionManager.setContext(context);

                    // 툴 콜 파싱 시도
                    // webpack이 자동으로 .ts와 .js를 처리하므로 확장자 없이 import
                    const { ToolParser } = await import('../../tools/ToolParser');
                    const { ToolExecutor } = await import('../../tools/ToolExecutor');
                    const { Tool } = await import('../../tools/types');

                    // Tool import를 전역으로 사용하기 위해 저장
                    this.currentToolEnum = Tool;

                    // "We will issue tool calls." 같은 메시지 필터링
                    const trimmedResponse = llmResponse.trim();
                    const isPlaceholderMessage = /^(we will issue tool calls?|tool calls? will be issued|i will use tool calls?|tool calls? incoming)\.?$/i.test(trimmedResponse);

                    if (isPlaceholderMessage) {
                        console.log('[ConversationManager] Detected placeholder message, filtering out');
                        // 플레이스홀더 메시지는 표시하지 않고 재시도 안내
                        safePostMessage(webviewToRespond, {
                            command: 'receiveMessage',
                            sender: 'AIDEV-IDE',
                            text: '⚠️ LLM이 tool call을 생성하지 못했습니다. 다시 시도해주세요.'
                        });
                        WebviewBridge.sendProcessingStatus(webviewToRespond, 'completed', 'No tool calls generated');
                        this.finishProcessing(webviewToRespond);
                        return;
                    }

                    const toolCalls: ToolUse[] = ToolParser.parseToolCalls(llmResponse);

                    if (toolCalls.length > 0) {
                        // 툴 콜링 모드
                        console.log(`[ConversationManager] Found ${toolCalls.length} tool calls, using tool calling mode`);
                        WebviewBridge.sendProcessingStatus(webviewToRespond, 'parsing', `Found ${toolCalls.length} tool calls`);

                        // 작업 큐에 tool call 추가
                        try {
                            const taskManager = TaskManager.getInstance(extensionContext);
                            if (taskManager) {
                                taskManager.clearPlanQueue();
                                const items = toolCalls
                                    .map((toolUse, index) => ({ toolUse, index }))
                                    .filter(({ toolUse }) => toolUse.name !== Tool.LIST_FILES) // list_files는 작업 큐에서 제외
                                    .map(({ toolUse, index }) => ({
                                        title: this.formatToolTitle(toolUse),
                                        detail: `tool_${index}|${this.formatToolDetail(toolUse)}`
                                    }));
                                if (items.length > 0) {
                                    taskManager.enqueuePlanItems(items);
                                    // detail에서 tool ID 제거하여 표시
                                    const displayItems = taskManager.listPlanItems().map(item => ({
                                        ...item,
                                        detail: item.detail?.includes('|') ? item.detail.split('|').slice(1).join('|') : item.detail
                                    }));
                                    safePostMessage(webviewToRespond, {
                                        command: 'updateTaskQueue',
                                        items: displayItems
                                    });
                                }
                            }
                        } catch (e) {
                            console.warn('[ConversationManager] 작업 큐에 tool calls 추가 실패:', e);
                        }

                        const toolExecutor = new ToolExecutor();
                        const toolContext = {
                            projectRoot: context.projectRoot,
                            workspaceRoot: context.workspaceRoot,
                            currentFile: context.currentFile,
                            actionManager,
                            executionManager,
                            terminalManager,
                            contextManager
                        };

                        let allToolResults: Array<{ result: ToolResponse; toolUse: ToolUse }> = [];

                        // 초기 tool call 실행
                        let currentToolCalls = toolCalls;
                        let currentToolResults = await toolExecutor.executeTools(currentToolCalls, toolContext);

                        // 결과 저장
                        for (let i = 0; i < currentToolResults.length; i++) {
                            allToolResults.push({
                                result: currentToolResults[i],
                                toolUse: currentToolCalls[i]
                            });
                        }

                        // 툴 실행 결과 처리
                        let successCount = 0;
                        let failCount = 0;
                        const createdFiles: Array<{ path: string; content: string }> = [];
                        const updatedFiles: Array<{ path: string; content: string }> = [];
                        const removedFiles: Array<{ path: string }> = [];
                        const executedCommands: Array<{ command: string; output: string; error?: string; exitCode?: number }> = [];
                        let readFileResults: Array<{ path: string; content: string }> = [];
                        const listFilesResults: Array<{ path: string; files: string }> = []; // list_files 결과 추적
                        const failedUpdateFiles: Array<{ path: string }> = []; // update_file 실패한 파일 추적

                        // 모든 tool 결과 처리
                        for (let idx = 0; idx < allToolResults.length; idx++) {
                            const { result, toolUse } = allToolResults[idx];

                            // 작업 큐 상태 업데이트
                            try {
                                const taskManager = TaskManager.getInstance(extensionContext);
                                if (taskManager) {
                                    const items = taskManager.listPlanItems();
                                    // tool_${idx}| 형식으로 찾기
                                    const item = items.find(item => {
                                        if (!item.detail) return false;
                                        const parts = item.detail.split('|');
                                        if (parts.length < 2) return false;
                                        const toolIndex = parts[0].replace('tool_', '');
                                        return toolIndex === String(idx);
                                    });
                                    if (item) {
                                        const newStatus = result.success ? 'done' : 'failed';
                                        console.log(`[ConversationManager] 작업 큐 상태 업데이트: ${item.title} -> ${newStatus} (idx: ${idx})`);
                                        taskManager.updatePlanItemStatus(item.id, newStatus);
                                        // detail에서 tool ID 제거하여 표시
                                        const displayItems = taskManager.listPlanItems().map(i => ({
                                            ...i,
                                            detail: i.detail?.includes('|') ? i.detail.split('|').slice(1).join('|') : i.detail
                                        }));
                                        safePostMessage(webviewToRespond, {
                                            command: 'updateTaskQueue',
                                            items: displayItems
                                        });
                                    } else {
                                        console.warn(`[ConversationManager] 작업 큐에서 항목을 찾을 수 없음: tool_${idx}|${this.formatToolDetail(toolUse)}`);
                                    }
                                }
                            } catch (e) {
                                console.warn('[ConversationManager] 작업 큐 상태 업데이트 실패:', e);
                            }

                            if (result.success) {
                                // list_files는 작업 큐에서 제외되므로 successCount에도 제외
                                if (toolUse.name !== Tool.LIST_FILES) {
                                    successCount++;
                                }
                                console.log(`[ConversationManager] Tool ${toolUse.name} executed successfully`);

                                // 파일 생성/수정/삭제 정보 수집
                                if (toolUse.name === Tool.CREATE_FILE && result.filePath && result.fileContent) {
                                    createdFiles.push({
                                        path: result.filePath,
                                        content: result.fileContent
                                    });
                                } else if (toolUse.name === Tool.UPDATE_FILE && result.data?.filePath) {
                                    // 이미 수정된 파일인지 확인 (중복 수정 방지)
                                    const alreadyUpdated = updatedFiles.some(f => f.path === result.data.filePath);
                                    if (alreadyUpdated) {
                                        console.warn(`[ConversationManager] File ${result.data.filePath} was already updated in initial tool calls, skipping duplicate`);
                                        // 중복이므로 successCount 감소
                                        successCount--;
                                    } else {
                                        // 수정된 파일 내용도 수집 (fileContent가 있으면 사용, 없으면 data에서 읽기)
                                        const fileContent = result.fileContent || result.data?.content;
                                        if (fileContent) {
                                            updatedFiles.push({
                                                path: result.data.filePath,
                                                content: fileContent
                                            });
                                        } else {
                                            // fileContent가 없으면 파일을 읽어서 추가
                                            try {
                                                const fs = await import('fs/promises');
                                                const path = await import('path');
                                                const absolutePath = path.default.isAbsolute(result.data.filePath)
                                                    ? result.data.filePath
                                                    : path.default.join(toolContext.projectRoot, result.data.filePath);
                                                const content = await fs.readFile(absolutePath, 'utf8');
                                                updatedFiles.push({
                                                    path: result.data.filePath,
                                                    content: content
                                                });
                                            } catch (error) {
                                                console.error(`[ConversationManager] Failed to read updated file ${result.data.filePath}:`, error);
                                                // 읽기 실패해도 경로만이라도 추가
                                                updatedFiles.push({
                                                    path: result.data.filePath,
                                                    content: ''
                                                });
                                            }
                                        }
                                    }
                                } else if (toolUse.name === Tool.REMOVE_FILE && result.data?.filePath) {
                                    removedFiles.push({
                                        path: result.data.filePath
                                    });
                                } else if (toolUse.name === Tool.READ_FILE && result.data?.content) {
                                    // read_file 결과 수집 (다음 tool call 생성을 위해)
                                    readFileResults.push({
                                        path: toolUse.params.path || result.data.path || '',
                                        content: result.data.content
                                    });

                                    // read_file 결과도 패널에 표시 (초기 tool call만 표시, follow-up은 제외)
                                    const fileName = (toolUse.params.path || result.data.path || '').split(/[/\\]/).pop() || 'unknown';
                                    const fileExt = fileName.split('.').pop()?.toLowerCase() || 'text';
                                    const lines = result.data.content.split('\n');
                                    const lineCount = lines.length;

                                    // Tree-sitter를 사용하여 함수/클래스 위치 찾기
                                    let targetLine = 1;

                                    // 사용자 요청에서 라인 번호가 명시적으로 있는지 확인
                                    const explicitLineMatch = options.userQuery.match(/(?:라인|line|줄)\s*(\d+)|(\d+)\s*(?:번째|번|라인|줄)/i);
                                    if (explicitLineMatch) {
                                        targetLine = parseInt(explicitLineMatch[1] || explicitLineMatch[2] || '1', 10);
                                        if (targetLine < 1) targetLine = 1;
                                        if (targetLine > lineCount) targetLine = lineCount;
                                    } else {
                                        // Tree-sitter를 사용하여 정의 찾기
                                        try {
                                            const parser = new TreeSitterAdapter();

                                            // 파일 경로 구성
                                            const filePath = toolUse.params.path || result.data.path || '';
                                            const absolutePath = path.isAbsolute(filePath)
                                                ? filePath
                                                : path.join(context.projectRoot, filePath);

                                            // 파일 파싱
                                            const fileDefinitions = await parser.parseFile(absolutePath);

                                            if (fileDefinitions && fileDefinitions.definitions.length > 0) {
                                                // 사용자 질의에서 함수/클래스명 추출 (간단한 추출)
                                                const queryLower = options.userQuery.toLowerCase();
                                                const nameMatch = queryLower.match(/(\w+)\s*(?:함수|function|클래스|class|메서드|method)/);
                                                const nameToFind = nameMatch ? nameMatch[1] : null;

                                                if (nameToFind) {
                                                    // 정의들 중에서 이름이 일치하는 것 찾기
                                                    const matchedDef = fileDefinitions.definitions.find((def: { name: string; startLine: number }) =>
                                                        def.name.toLowerCase() === nameToFind.toLowerCase()
                                                    );

                                                    if (matchedDef && matchedDef.startLine !== undefined) {
                                                        targetLine = matchedDef.startLine + 1; // 0-based to 1-based
                                                    }
                                                } else {
                                                    // 이름이 없으면 첫 번째 정의 사용
                                                    const firstDef = fileDefinitions.definitions[0];
                                                    if (firstDef && firstDef.startLine !== undefined) {
                                                        targetLine = firstDef.startLine + 1; // 0-based to 1-based
                                                    }
                                                }
                                            }
                                        } catch (error) {
                                            console.warn('[ConversationManager] Failed to find location using tree-sitter, using default:', error);
                                            // Tree-sitter 실패 시 기본값 1 사용
                                        }
                                    }

                                    // 위아래 5줄씩 추출
                                    const startLine = Math.max(1, targetLine - 5);
                                    const endLine = Math.min(lineCount, targetLine + 5);
                                    const contextLines = lines.slice(startLine - 1, endLine);
                                    const contextContent = contextLines.join('\n');

                                    const readFileSummary = `### 파일 읽기: ${fileName}\n`;
                                    const readFileSummary2 = `**경로:** \`${toolUse.params.path || result.data.path || ''}\`\n`;
                                    const readFileSummary3 = `**라인:** ${targetLine}번째 라인 (${startLine}-${endLine} / 총 ${lineCount} lines)\n\n`;
                                    const readFileSummary4 = `\`\`\`${fileExt}\n${contextContent}\n\`\`\`\n\n`;

                                    safePostMessage(webviewToRespond, {
                                        command: 'receiveMessage',
                                        sender: 'AIDEV-IDE',
                                        text: readFileSummary + readFileSummary2 + readFileSummary3 + readFileSummary4
                                    });
                                } else if (toolUse.name === Tool.LIST_FILES && result.data?.files) {
                                    // list_files 결과 수집 (표시용)
                                    listFilesResults.push({
                                        path: toolUse.params.path || '',
                                        files: Array.isArray(result.data.files)
                                            ? result.data.files.join('\n')
                                            : String(result.data.files)
                                    });
                                } else if (toolUse.name === Tool.RUN_COMMAND) {
                                    // run_command 결과 수집
                                    const command = toolUse.params.command || '';
                                    executedCommands.push({
                                        command: command,
                                        output: result.data?.output || '',
                                        error: result.data?.error,
                                        exitCode: result.data?.exitCode
                                    });
                                }
                            } else {
                                // list_files는 작업 큐에서 제외되므로 failCount에도 제외
                                if (toolUse.name !== Tool.LIST_FILES) {
                                    failCount++;
                                }

                                // update_file 실패 처리: 이미 성공적으로 수정된 파일인지 확인
                                if (toolUse.name === Tool.UPDATE_FILE && toolUse.params.path) {
                                    // 같은 파일이 이미 updatedFiles에 있는지 확인 (이미 성공적으로 수정됨)
                                    const alreadyUpdated = updatedFiles.some(f => f.path === toolUse.params.path);
                                    if (alreadyUpdated) {
                                        console.warn(`[ConversationManager] update_file failed for ${toolUse.params.path}, but file was already successfully updated. Ignoring duplicate failure.`);
                                        // 이미 수정된 파일에 대한 중복 실패는 무시 (failCount 감소)
                                        failCount--;
                                        // 경고 메시지만 표시 (에러 아님)
                                        safePostMessage(webviewToRespond, {
                                            command: 'receiveMessage',
                                            sender: 'AIDEV-IDE',
                                            text: `ℹ️ 파일 \`${toolUse.params.path}\`에 대한 추가 수정 시도가 실패했지만, 파일은 이미 성공적으로 수정되었습니다.`
                                        });
                                    } else {
                                        // 실제로 실패한 경우
                                        console.error(`[ConversationManager] Tool ${toolUse.name} failed:`, result.message);
                                        safePostMessage(webviewToRespond, {
                                            command: 'receiveMessage',
                                            sender: 'AIDEV-IDE',
                                            text: `⚠️ Tool ${toolUse.name} failed: ${result.message}`
                                        });
                                        // update_file 실패 시 파일 경로 추적 (follow-up에서 최신 내용 제공)
                                        failedUpdateFiles.push({ path: toolUse.params.path });
                                    }
                                } else {
                                    // update_file이 아닌 다른 tool 실패
                                    console.error(`[ConversationManager] Tool ${toolUse.name} failed:`, result.message);
                                    safePostMessage(webviewToRespond, {
                                        command: 'receiveMessage',
                                        sender: 'AIDEV-IDE',
                                        text: `⚠️ Tool ${toolUse.name} failed: ${result.message}`
                                    });
                                }
                            }
                        }


                        // 생성된 파일들을 마크다운 형식으로 표시
                        if (createdFiles.length > 0) {
                            let fileSummary = '## 생성된 파일\n\n';
                            for (const file of createdFiles) {
                                const fileName = file.path.split(/[/\\]/).pop() || file.path;
                                const fileExt = fileName.split('.').pop()?.toLowerCase() || 'text';
                                const lineCount = file.content.split('\n').length;

                                fileSummary += `### ${fileName}\n`;
                                fileSummary += `**경로:** \`${file.path}\`\n`;
                                fileSummary += `**라인 수:** ${lineCount} lines\n\n`;
                                fileSummary += `\`\`\`${fileExt}\n${file.content}\n\`\`\`\n\n`;
                            }

                            safePostMessage(webviewToRespond, {
                                command: 'receiveMessage',
                                sender: 'AIDEV-IDE',
                                text: fileSummary
                            });
                        }

                        // 수정된 파일 표시 (생성된 파일과 동일한 형식)
                        if (updatedFiles.length > 0) {
                            let updateSummary = '## 수정된 파일\n\n';
                            for (const file of updatedFiles) {
                                const fileName = file.path.split(/[/\\]/).pop() || file.path;
                                const fileExt = fileName.split('.').pop()?.toLowerCase() || 'text';

                                if (file.content) {
                                    const lineCount = file.content.split('\n').length;
                                    updateSummary += `### ${fileName}\n`;
                                    updateSummary += `**경로:** \`${file.path}\`\n`;
                                    updateSummary += `**라인 수:** ${lineCount} lines\n\n`;
                                    updateSummary += `\`\`\`${fileExt}\n${file.content}\n\`\`\`\n\n`;
                                } else {
                                    // 내용이 없는 경우 (읽기 실패 등)
                                    updateSummary += `### ${fileName}\n`;
                                    updateSummary += `**경로:** \`${file.path}\`\n\n`;
                                }
                            }
                            safePostMessage(webviewToRespond, {
                                command: 'receiveMessage',
                                sender: 'AIDEV-IDE',
                                text: updateSummary
                            });
                        }

                        // 삭제된 파일 표시
                        if (removedFiles.length > 0) {
                            let removeSummary = '## 삭제된 파일\n\n';
                            for (const file of removedFiles) {
                                removeSummary += `- \`${file.path}\`\n`;
                            }
                            safePostMessage(webviewToRespond, {
                                command: 'receiveMessage',
                                sender: 'AIDEV-IDE',
                                text: removeSummary
                            });
                        }

                        // 실행된 명령어 표시
                        if (executedCommands.length > 0) {
                            let commandSummary = '## 실행된 명령어\n\n';
                            for (const cmd of executedCommands) {
                                commandSummary += `### 명령어 실행\n`;
                                commandSummary += `**명령어:**\n`;
                                commandSummary += `\`\`\`bash\n${cmd.command}\n\`\`\`\n\n`;

                                if (cmd.output) {
                                    commandSummary += `**출력:**\n`;
                                    commandSummary += `\`\`\`\n${cmd.output}\n\`\`\`\n\n`;
                                }

                                if (cmd.error) {
                                    commandSummary += `**오류:**\n`;
                                    commandSummary += `\`\`\`\n${cmd.error}\n\`\`\`\n\n`;
                                }

                                if (cmd.exitCode !== undefined && cmd.exitCode !== 0) {
                                    commandSummary += `**종료 코드:** ${cmd.exitCode}\n\n`;
                                }

                                commandSummary += '---\n\n';
                            }
                            safePostMessage(webviewToRespond, {
                                command: 'receiveMessage',
                                sender: 'AIDEV-IDE',
                                text: commandSummary
                            });
                        }

                        // 실행 결과 요약
                        if (successCount > 0 || failCount > 0) {
                            const summaryMsg = `\n📊 실행 완료: 성공 ${successCount}개${failCount > 0 ? `, 실패 ${failCount}개` : ''}`;
                            safePostMessage(webviewToRespond, {
                                command: 'receiveMessage',
                                sender: 'AIDEV-IDE',
                                text: summaryMsg
                            });
                        }

                        // 작업 요약 및 설명 생성 (파일이 생성/수정/삭제된 경우에만)
                        if ((createdFiles.length > 0 || updatedFiles.length > 0 || removedFiles.length > 0) && successCount > 0) {
                            try {
                                console.log('[ConversationManager] Generating work summary and explanation...');
                                console.log(`[ConversationManager] Summary condition: createdFiles=${createdFiles.length}, updatedFiles=${updatedFiles.length}, removedFiles=${removedFiles.length}, successCount=${successCount}`);
                                WebviewBridge.sendProcessingStatus(webviewToRespond, 'parsing', 'Generating work summary...');

                                // 실행된 작업 정보 수집
                                let workSummary = `다음 작업이 완료되었습니다:\n\n`;

                                if (createdFiles.length > 0) {
                                    workSummary += `**생성된 파일 (${createdFiles.length}개):**\n`;
                                    createdFiles.forEach(file => {
                                        workSummary += `- \`${file.path}\`\n`;
                                    });
                                    workSummary += '\n';
                                }

                                if (updatedFiles.length > 0) {
                                    workSummary += `**수정된 파일 (${updatedFiles.length}개):**\n`;
                                    updatedFiles.forEach(file => {
                                        workSummary += `- \`${file.path}\`\n`;
                                    });
                                    workSummary += '\n';
                                }

                                if (removedFiles.length > 0) {
                                    workSummary += `**삭제된 파일 (${removedFiles.length}개):**\n`;
                                    removedFiles.forEach(file => {
                                        workSummary += `- \`${file.path}\`\n`;
                                    });
                                    workSummary += '\n';
                                }

                                workSummary += `\n**사용자 요청:** ${options.userQuery}\n\n`;
                                workSummary += `위 작업에 대한 다음 정보를 한글로 제공해주세요:\n`;
                                workSummary += `1. **작업 요약**: 수행한 작업의 개요\n`;
                                workSummary += `2. **변경사항 설명**: 각 파일에 대한 변경 내용과 이유에 대한 상세 설명\n`;
                                workSummary += `3. **테스트 방법**: 동작 확인 방법 및 테스트 절차\n`;
                                workSummary += `\n마크다운 형식으로 작성해주세요. XML 태그나 tool call은 포함하지 마세요. 순수한 마크다운 텍스트만 제공하세요.`;

                                console.log('[ConversationManager] Requesting summary from LLM...');
                                // LLM에게 요약 요청
                                const summaryResponse = await this.llmService.sendMessageWithSystemPrompt(
                                    systemPrompt,
                                    [{ text: workSummary }],
                                    { signal: abortSignal }
                                );

                                console.log(`[ConversationManager] Summary response received, length: ${summaryResponse?.length || 0}`);

                                if (summaryResponse && summaryResponse.trim().length > 0) {
                                    // XML 태그 제거 (tool call이 포함될 수 있음)
                                    let cleanSummary = summaryResponse;
                                    const toolCallPattern = /<(create_file|update_file|remove_file|read_file|list_files|search_files|run_command)>[\s\S]*?<\/\1>/gi;
                                    cleanSummary = cleanSummary.replace(toolCallPattern, '');

                                    // 추가 정리: XML 태그가 남아있을 수 있음
                                    cleanSummary = cleanSummary.replace(/<[^>]+>/g, '');

                                    console.log(`[ConversationManager] Clean summary length: ${cleanSummary.trim().length}`);

                                    if (cleanSummary.trim().length > 0) {
                                        console.log('[ConversationManager] Sending summary to panel');
                                        safePostMessage(webviewToRespond, {
                                            command: 'receiveMessage',
                                            sender: 'AIDEV-IDE',
                                            text: `## 작업 요약 및 설명\n\n${cleanSummary}`
                                        });
                                    } else {
                                        console.warn('[ConversationManager] Clean summary is empty after removing XML tags');
                                    }
                                } else {
                                    console.warn('[ConversationManager] Summary response is empty or null');
                                }
                            } catch (error) {
                                console.error('[ConversationManager] Failed to generate work summary:', error);
                                // 요약 생성 실패해도 계속 진행
                            }
                        } else {
                            console.log(`[ConversationManager] Skipping summary generation: createdFiles=${createdFiles.length}, updatedFiles=${updatedFiles.length}, removedFiles=${removedFiles.length}, successCount=${successCount}`);
                        }

                        // ProcessingSteps 완료 처리
                        WebviewBridge.sendProcessingStatus(webviewToRespond, 'completed', `Executed ${successCount} tools successfully${failCount > 0 ? `, ${failCount} failed` : ''}`);
                        this.finishProcessing(webviewToRespond);

                        // 툴 콜링 모드 완료
                        return;
                    }

                    // Tool calls가 없는 경우 에러 메시지 표시
                    console.log('[ConversationManager] No tool calls found in LLM response');
                    safePostMessage(webviewToRespond, {
                        command: 'receiveMessage',
                        sender: 'AIDEV-IDE',
                        text: '⚠️ LLM이 tool call을 생성하지 못했습니다. XML 형식의 tool call을 생성하도록 프롬프트를 확인해주세요.'
                    });
                    WebviewBridge.sendProcessingStatus(webviewToRespond, 'completed', 'No tool calls generated');
                    this.finishProcessing(webviewToRespond);
                    return;
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
     * 코드 관련 의도인지 확인
     */
    private isCodeRelatedIntent(intentResult: { category: string; subtype: string; confidence: number }): boolean {
        return intentResult.category === 'code' || intentResult.subtype === 'code_generate' || intentResult.subtype === 'code_modify';
    }

    /**
     * Tool 제목 포맷팅
     */
    private formatToolTitle(toolUse: any): string {
        const Tool = this.currentToolEnum;
        if (!Tool) {
            // Tool enum이 없으면 기본값 반환
            return `${toolUse.name}: ${toolUse.params?.path || toolUse.params?.command || 'N/A'}`;
        }
        switch (toolUse.name) {
            case Tool.CREATE_FILE:
                return `파일 생성: ${toolUse.params?.path || 'N/A'}`;
            case Tool.UPDATE_FILE:
                return `파일 수정: ${toolUse.params?.path || 'N/A'}`;
            case Tool.REMOVE_FILE:
                return `파일 삭제: ${toolUse.params?.path || 'N/A'}`;
            case Tool.READ_FILE:
                return `파일 읽기: ${toolUse.params?.path || 'N/A'}`;
            case Tool.LIST_FILES:
                return `파일 목록: ${toolUse.params?.path || '(프로젝트 루트)'}`;
            case Tool.SEARCH_FILES:
                return `파일 검색: ${toolUse.params?.pattern || 'N/A'}`;
            case Tool.RUN_COMMAND:
                return `명령 실행: ${this.sanitizeCommandText(toolUse.params?.command || 'N/A')}`;
            default:
                return `${toolUse.name}: ${toolUse.params?.path || toolUse.params?.command || 'N/A'}`;
        }
    }

    /**
     * Tool 상세 정보 포맷팅
     */
    private formatToolDetail(toolUse: any): string {
        const Tool = this.currentToolEnum;
        if (!Tool) {
            return toolUse.name;
        }
        if (toolUse.name === Tool.RUN_COMMAND) {
            return this.sanitizeCommandText(toolUse.params?.command || 'command');
        }
        if (toolUse.name === Tool.CREATE_FILE || toolUse.name === Tool.UPDATE_FILE || toolUse.name === Tool.REMOVE_FILE || toolUse.name === Tool.READ_FILE) {
            return toolUse.params?.path || 'file';
        }
        if (toolUse.name === Tool.LIST_FILES) {
            return toolUse.params?.path || '(프로젝트 루트)';
        }
        if (toolUse.name === Tool.SEARCH_FILES) {
            return toolUse.params?.pattern || 'pattern';
        }
        return toolUse.name;
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
                return ollamaApi.getModel?.() || ollamaApi.getCurrentModelName?.() || currentModelType || 'Ollama Model';
            }
        } catch { }
        // 모델 타입 문자열이라도 반환해 Unknown 회피
        if (typeof currentModelType === 'string' && currentModelType.trim().length > 0) {
            return currentModelType;
        }
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

