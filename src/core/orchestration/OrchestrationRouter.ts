/**
 * OrchestrationRouter
 * 오케스트레이션 ON/OFF에 따라 실행 경로를 분기하는 라우터
 *
 * OFF (기본): ConversationManager 단일 루프 (기존 100% 보존)
 * ON + 단순 작업: ConversationManager 단일 루프
 * ON + 복합 작업: TaskSplitter → SubAgentLoop[] 병렬 → ResultMerger
 */

import * as vscode from 'vscode';
import { ConversationManager } from '../managers/conversation/ConversationManager';
import { ConfigurationService } from '../managers/state/ConfigurationService';
import { ProjectManager } from '../managers/project/ProjectManager';
import { ActionManager } from '../managers/action/ActionManager';
import { ExecutionManager } from '../managers/execution/ExecutionManager';
import { TerminalManager } from '../managers/terminal/TerminalManager';
import { ContextManager } from '../managers/context/ContextManager';
import { SessionManager } from '../managers/state/SessionManager';
import { WebviewBridge } from '../webview/WebviewBridge';
import { ToolExecutionCoordinator } from '../managers/conversation/handlers/ToolExecutionCoordinator';
import { TestRunner, TestResult } from '../managers/conversation/handlers/TestRunner';
import { ErrorClassifier, ErrorCategory } from '../managers/conversation/handlers/ErrorClassifier';
import { AutoRemediator } from '../managers/conversation/handlers/AutoRemediator';
import { buildClassifiedRetryPrompt, ModifiedFileContext } from '../managers/context/prompts/rules';
import { ToolExecutionContext } from '../tools/IToolHandler';
import { UIMessageEntry } from '../managers/state/types';
import { TaskSplitter } from './TaskSplitter';
import { SubAgentLoop } from './SubAgentLoop';
import { ResultMerger } from './ResultMerger';
import { PromisePool } from './PromisePool';
import { SubTask, AggregatedResult, AgentLoopResult, AgentLoopCallbacks, THINKING_TAG_REGEX } from './types';
import { LLMManager } from '../managers/model/LLMManager';
import { PromptComposer } from '../managers/context/prompts/PromptComposer';
import { AgentConfig } from '../config/AgentConfig';
import { PromptType, OllamaApi, AiModelType, NotificationService, GitRepositoryService } from '../../services';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface RouteOptions {
    userQuery: string;
    webviewToRespond: vscode.Webview;
    promptType: PromptType;
    imageData?: string;
    imageMimeType?: string;
    selectedFiles?: string[];
    selectedCode?: string;
    terminalContext?: string;
    diagnosticsContext?: string;
    extensionContext?: vscode.ExtensionContext;
    ollamaApi?: OllamaApi;
    currentModelType?: AiModelType;
    userOS?: string;
    notificationService?: NotificationService;
    gitRepositoryService?: GitRepositoryService;
    abortSignal?: AbortSignal;
}

const MAX_CONCURRENT_AGENTS = AgentConfig.MAX_CONCURRENT_AGENTS;

/** TaskQueue 아이템 (webview 전달용) */
interface TaskQueueItem {
    id: string;
    title: string;
    detail?: string;
    status: 'pending' | 'in_progress' | 'done' | 'failed';
}

/** MCP 서버 최소 타입 (gatherRulesContext 내부용) */
interface McpServerInfo { enabled: boolean; customPrompt?: string; name: string; }

export class OrchestrationRouter {
    /**
     * 오케스트레이션 설정에 따라 분기
     */
    static async route(options: RouteOptions): Promise<void> {
        const orchestrationEnabled = ConfigurationService.get<boolean>('orchestration', false) ?? false;

        if (!orchestrationEnabled) {
            return OrchestrationRouter.routeToSingleLoop(options);
        }

        const webview = options.webviewToRespond;
        const startTime = Date.now();

        // UI 메시지 수집 (히스토리 저장용)
        const collectedUIMessages: UIMessageEntry[] = [];

        // ON: TaskSplitter로 분기 판단
        try {
            const splitter = new TaskSplitter();
            const projectContext = await OrchestrationRouter.getProjectContext();

            // 분할 중 상태 표시
            WebviewBridge.sendProcessingStep(webview, 'plan');
            WebviewBridge.sendProcessingStatus(webview, 'plan', '작업 분할 분석 중...');

            const splitResult = await splitter.split(options.userQuery, projectContext);

            if (!splitResult.shouldSplit) {
                console.log('[OrchestrationRouter] Simple task, using single loop');
                return OrchestrationRouter.routeToSingleLoop(options);
            }

            // 복합 작업 → 병렬 에이전트
            console.log(`[OrchestrationRouter] Splitting into ${splitResult.subtasks.length} subtasks: ${splitResult.reasoning}`);

            // 독립/의존 태스크 분리
            const independentTasks = splitResult.subtasks.filter(st => st.dependencies.length === 0);
            const dependentTasks = splitResult.subtasks.filter(st => st.dependencies.length > 0);

            // TaskQueue에 모든 서브태스크 등록
            const taskItems: TaskQueueItem[] = splitResult.subtasks.map(st => ({
                id: st.id,
                title: st.title,
                detail: st.description.split('\n')[0].substring(0, 100) || undefined,
                status: 'pending' as const,
            }));
            WebviewBridge.updateTaskQueue(webview, taskItems);

            WebviewBridge.sendProcessingStatus(
                webview, 'plan',
                `${splitResult.subtasks.length}개 에이전트로 분할 완료 (병렬: ${independentTasks.length}, 순차: ${dependentTasks.length})`
            );

            const toolContext = OrchestrationRouter.buildToolContext();
            const results: AgentLoopResult[] = [];

            // 규칙/설정 컨텍스트 수집 (서브 에이전트 공유용)
            let rulesContext = '';
            try {
                rulesContext = await OrchestrationRouter.gatherRulesContext(options.userQuery);
                if (rulesContext) {
                    console.log(`[OrchestrationRouter] Rules context gathered (${rulesContext.length} chars)`);
                }
            } catch (e) {
                console.warn('[OrchestrationRouter] Failed to gather rules context:', e);
            }

            // Phase A: 독립 태스크 병렬 실행
            WebviewBridge.sendProcessingStep(webview, 'executing');

            const pool = new PromisePool(MAX_CONCURRENT_AGENTS);
            for (const subtask of independentTasks) {
                pool.add(async () => {
                    const result = await OrchestrationRouter.runAgent(
                        subtask, toolContext, options, projectContext, taskItems, collectedUIMessages, rulesContext
                    );
                    results.push(result);
                });
            }
            const poolErrors = await pool.drain();
            if (poolErrors.length > 0) {
                console.warn(`[OrchestrationRouter] ${poolErrors.length} agent(s) failed during parallel execution`);
                for (const err of poolErrors) {
                    console.warn(`  - ${err.message}`);
                }
            }

            // Phase B: 의존 태스크 순차 실행
            if (dependentTasks.length > 0 && !options.abortSignal?.aborted) {
                const completedIds = new Set(results.filter(r => r.success).map(r => r.subtaskId));

                for (const subtask of dependentTasks) {
                    if (options.abortSignal?.aborted) { break; }

                    const depsOk = subtask.dependencies.every(dep => completedIds.has(dep));
                    if (!depsOk) {
                        const missing = subtask.dependencies.filter(d => !completedIds.has(d));
                        console.warn(`[OrchestrationRouter] Skipping ${subtask.id}: dependencies not met (${missing.join(', ')})`);

                        OrchestrationRouter.updateTaskItemStatus(webview, taskItems, subtask.id, 'failed');

                        results.push({
                            subtaskId: subtask.id,
                            success: false,
                            response: '',
                            createdFiles: [],
                            modifiedFiles: [],
                            errors: [`선행 작업 미완료: ${missing.map(d => d.replace(/^task-/, '에이전트 ')).join(', ')}`],
                            turnCount: 0,
                            tokenEstimate: 0,
                            executionTime: 0,
                        });
                        continue;
                    }

                    const enrichedSubtask = OrchestrationRouter.enrichWithPriorResults(subtask, results);
                    const result = await OrchestrationRouter.runAgent(
                        enrichedSubtask, toolContext, options, projectContext, taskItems, collectedUIMessages, rulesContext
                    );
                    results.push(result);
                    if (result.success) {
                        completedIds.add(result.subtaskId);
                    }
                }
            }

            // Phase C: 실패한 서브태스크 1회 재시도
            if (!options.abortSignal?.aborted) {
                const failedResults = results.filter(r => !r.success && r.turnCount > 0);
                if (failedResults.length > 0) {
                    console.log(`[OrchestrationRouter] ${failedResults.length} subtask(s) failed, retrying...`);
                    WebviewBridge.sendProcessingStep(webview, 'review');
                    WebviewBridge.sendProcessingStatus(webview, 'review',
                        `실패한 ${failedResults.length}개 태스크 재시도 중...`);

                    // 성공한 에이전트들의 결과를 컨텍스트로 활용
                    const successResults = results.filter(r => r.success);

                    for (const failedResult of failedResults) {
                        if (options.abortSignal?.aborted) { break; }

                        const originalSubtask = splitResult.subtasks.find(st => st.id === failedResult.subtaskId);
                        if (!originalSubtask) { continue; }

                        // 재시도용 서브태스크: 이전 에러 정보 + 성공한 에이전트 컨텍스트 포함
                        const retryDescription = `${originalSubtask.description}\n\n` +
                            `## 이전 시도 실패 정보\n` +
                            `이전 시도에서 ${failedResult.turnCount}턴 동안 작업했으나 완료하지 못했습니다.\n` +
                            (failedResult.errors.length > 0
                                ? `에러: ${failedResult.errors.join(', ')}\n`
                                : '') +
                            (successResults.length > 0
                                ? `\n## 다른 에이전트 완료 내역\n${successResults.map(r => {
                                    const cleaned = r.response.replace(THINKING_TAG_REGEX, '').trim();
                                    return cleaned ? `- ${r.subtaskId}: ${cleaned.substring(0, 200)}` : '';
                                }).filter(Boolean).join('\n')}\n`
                                : '') +
                            `\n도구 호출 형식을 정확히 따라주세요. 반드시 \`\`\`json 코드블록 안에 도구 호출을 작성하세요.`;

                        const retrySubtask: SubTask = {
                            ...originalSubtask,
                            id: `${originalSubtask.id}-retry`,
                            title: `${originalSubtask.title} (재시도)`,
                            description: retryDescription,
                        };

                        const retryTaskItem: TaskQueueItem = {
                            id: retrySubtask.id,
                            title: retrySubtask.title,
                            status: 'pending' as const,
                        };
                        taskItems.push(retryTaskItem);
                        WebviewBridge.updateTaskQueue(webview, taskItems);

                        const retryResult = await OrchestrationRouter.runAgent(
                            retrySubtask, toolContext, options, projectContext, taskItems, collectedUIMessages, rulesContext,
                        );

                        // 재시도 결과로 기존 실패 결과 교체
                        const failedIdx = results.findIndex(r => r.subtaskId === failedResult.subtaskId);
                        if (failedIdx !== -1 && retryResult.success) {
                            results[failedIdx] = { ...retryResult, subtaskId: failedResult.subtaskId };
                            console.log(`[OrchestrationRouter] Retry succeeded for ${failedResult.subtaskId}`);
                        } else if (failedIdx !== -1) {
                            // 재시도도 실패: 에러 병합
                            results[failedIdx].errors.push(
                                ...retryResult.errors.map(e => `[재시도] ${e}`)
                            );
                            console.warn(`[OrchestrationRouter] Retry also failed for ${failedResult.subtaskId}`);
                        }
                    }
                }
            }

            // 결과 병합
            const merged = ResultMerger.merge(results);

            // 빌드/테스트 검증 (실패해도 요약은 표시)
            let validationResult = { validated: false, testPassed: true, repairAttempts: 0 };
            try {
                validationResult = await OrchestrationRouter.runPostMergeValidation(
                    merged, webview, toolContext, options, projectContext, taskItems, collectedUIMessages, rulesContext,
                );
            } catch (validationError) {
                console.error('[OrchestrationRouter] Post-merge validation threw:', validationError);
            }

            // 통합 요약 생성 (LLM으로 자연어 요약)
            let unifiedSummary = '';
            try {
                unifiedSummary = await OrchestrationRouter.generateUnifiedSummary(
                    merged, options.userQuery, validationResult,
                );
            } catch (e) {
                console.warn('[OrchestrationRouter] Failed to generate unified summary:', e);
            }

            // 요약 표시
            const summaryMessage = OrchestrationRouter.formatMergedResult(merged, validationResult, unifiedSummary);
            WebviewBridge.receiveMessage(webview, 'CODEPILOT', summaryMessage);
            collectedUIMessages.push({ sender: 'CODEPILOT', text: summaryMessage, type: 'summary' });

            // 턴 액션 표시 (모든 출력 완료 후)
            try {
                const { InlineDiffManager } = await import('../managers/diff/InlineDiffManager');
                const turnStats = InlineDiffManager.getInstance().getPendingChangesByTurn();
                if (turnStats.length > 0) {
                    webview.postMessage({ command: 'showTurnActions', turns: turnStats });
                }
            } catch (e) {
                console.warn('[OrchestrationRouter] showTurnActions failed:', e);
            }

            // UI 정리
            WebviewBridge.sendProcessingStep(webview, 'done');
            WebviewBridge.hideLoading(webview);

            // 대화 히스토리에 저장
            await OrchestrationRouter.saveToHistory(options, merged, collectedUIMessages, startTime);

        } catch (error) {
            console.error('[OrchestrationRouter] Orchestration failed, falling back to single loop:', error);
            WebviewBridge.hideLoading(webview);
            WebviewBridge.clearTaskQueue(webview);
            WebviewBridge.receiveMessage(
                webview,
                'System',
                '멀티 에이전트 실패, 단일 에이전트로 전환합니다.'
            );
            return OrchestrationRouter.routeToSingleLoop(options);
        }
    }

    private static async runAgent(
        subtask: SubTask,
        toolContext: ToolExecutionContext,
        options: RouteOptions,
        projectContext?: string,
        taskItems?: TaskQueueItem[],
        collectedUIMessages?: UIMessageEntry[],
        rulesContext?: string,
    ): Promise<AgentLoopResult> {
        const webview = options.webviewToRespond;

        // 1. TaskQueue 상태 → in_progress
        if (taskItems) {
            OrchestrationRouter.updateTaskItemStatus(webview, taskItems, subtask.id, 'in_progress');
        }

        // 2. ProcessStep 상태 업데이트 (진행률 포함)
        const totalCount = taskItems?.length || 0;
        const currentIndex = taskItems?.findIndex(t => t.id === subtask.id) ?? -1;
        const progressLabel = totalCount > 0 && currentIndex >= 0
            ? `(${currentIndex + 1}/${totalCount}) `
            : '';
        WebviewBridge.sendProcessingStep(webview, 'executing');
        WebviewBridge.sendProcessingStatus(webview, 'executing', `${progressLabel}${subtask.title} 실행 중...`);

        // 3. 콜백 생성 — ToolExecutionCoordinator 재사용 + UI 메시지 수집
        const callbacks: AgentLoopCallbacks = {
            onToolStart: (toolUse) => {
                ToolExecutionCoordinator.sendToolStartStatus(webview, toolUse);
            },
            onToolComplete: (toolUse, result) => {
                const msgs = ToolExecutionCoordinator.sendSingleToolResultToUI(webview, toolUse, result);
                if (collectedUIMessages && msgs) {
                    collectedUIMessages.push(...msgs);
                }
            },
            onThinking: (thinkingText) => {
                WebviewBridge.sendThinkingContent(webview, thinkingText);
            },
        };

        // 4. 에이전트 실행 (서브태스크별 conversationTurnId 생성)
        const agentTurnId = `sub_${subtask.id}_${Date.now().toString(36)}`;
        const agentToolContext: ToolExecutionContext = { ...toolContext, conversationTurnId: agentTurnId };
        const agent = new SubAgentLoop(subtask, agentToolContext, options.abortSignal, projectContext, callbacks, rulesContext);
        const result = await agent.run();

        // 5. TaskQueue 상태 → done/failed
        if (taskItems) {
            OrchestrationRouter.updateTaskItemStatus(
                webview, taskItems, subtask.id,
                result.success ? 'done' : 'failed'
            );
        }

        // 6. 완료 로그
        WebviewBridge.sendProcessingStatus(
            webview, 'executing',
            `${progressLabel}${subtask.title} ${result.success ? '완료' : '실패'} (${result.turnCount}턴, ${Math.round(result.executionTime / 1000)}초)`
        );

        return result;
    }

    /**
     * TaskQueue 아이템 상태 업데이트 및 웹뷰 전송
     */
    private static updateTaskItemStatus(
        webview: vscode.Webview,
        taskItems: TaskQueueItem[],
        subtaskId: string,
        status: 'pending' | 'in_progress' | 'done' | 'failed',
    ): void {
        const item = taskItems.find(t => t.id === subtaskId);
        if (item) { item.status = status; }
        WebviewBridge.updateTaskQueue(webview, taskItems);
    }

    /**
     * 오케스트레이션 결과를 세션 히스토리에 저장
     */
    private static async saveToHistory(
        options: RouteOptions,
        merged: AggregatedResult,
        uiMessages: UIMessageEntry[],
        startTime: number,
    ): Promise<void> {
        if (!options.extensionContext) { return; }

        try {
            const sessionManager = SessionManager.getInstance(options.extensionContext);
            const currentSession = sessionManager.getCurrentSession();
            if (!currentSession) { return; }

            await sessionManager.addConversationEntry(currentSession.id, {
                id: `conv_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
                timestamp: Date.now(),
                userRequest: options.userQuery || '',
                assistantResponse: merged.summary,
                actions: [],
                filesCreated: merged.createdFiles,
                filesModified: merged.modifiedFiles,
                uiMessages,
                result: merged.errors.length === 0 ? 'success' : 'error',
                model: options.currentModelType,
                tokensUsed: merged.totalTokens,
                durationMs: Date.now() - startTime,
            });

            console.log(`[OrchestrationRouter] Saved orchestration result to session history`);
        } catch (e) {
            console.warn('[OrchestrationRouter] Failed to save to session history:', e);
        }
    }

    /**
     * 결과 병합 후 빌드/테스트 검증 + 자동 수정
     */
    private static async runPostMergeValidation(
        merged: AggregatedResult,
        webview: vscode.Webview,
        toolContext: ToolExecutionContext,
        options: RouteOptions,
        projectContext: string,
        taskItems: TaskQueueItem[],
        collectedUIMessages: UIMessageEntry[],
        rulesContext?: string,
    ): Promise<{ validated: boolean; testPassed: boolean; repairAttempts: number }> {
        // 파일 변경 없으면 검증 불필요
        if (merged.createdFiles.length === 0 && merged.modifiedFiles.length === 0) {
            return { validated: true, testPassed: true, repairAttempts: 0 };
        }

        const workspaceRoot = toolContext.workspaceRoot;
        if (!workspaceRoot) {
            return { validated: false, testPassed: true, repairAttempts: 0 };
        }

        const MAX_REPAIR_RETRIES = 2;
        let allCreatedFiles = [...merged.createdFiles];
        let allModifiedFiles = [...merged.modifiedFiles];
        let repairAttempts = 0;
        let lastFingerprint = '';

        for (let attempt = 0; attempt <= MAX_REPAIR_RETRIES; attempt++) {
            if (options.abortSignal?.aborted) { break; }

            const label = attempt === 0
                ? '빌드/테스트 검증 중...'
                : `자동 수정 검증 중 (${attempt}/${MAX_REPAIR_RETRIES})...`;

            WebviewBridge.sendProcessingStep(webview, 'review');
            WebviewBridge.sendProcessingStatus(webview, 'review', label);

            const testResult: TestResult = await TestRunner.runAutomatedTests(
                webview, workspaceRoot, allCreatedFiles, allModifiedFiles,
            );

            if (testResult.success) {
                WebviewBridge.sendProcessingStatus(webview, 'review', '빌드/테스트 검증 통과');
                console.log(`[OrchestrationRouter] Validation passed (attempt ${attempt})`);
                return { validated: true, testPassed: true, repairAttempts };
            }

            // 검증 실패
            console.log(`[OrchestrationRouter] Validation failed (attempt ${attempt}): ${testResult.errorMessage?.substring(0, 100).replace(/\n/g, ' ')}`);

            if (attempt >= MAX_REPAIR_RETRIES) {
                WebviewBridge.sendProcessingStatus(webview, 'review',
                    `빌드/테스트 검증 실패 (${MAX_REPAIR_RETRIES}회 수정 시도 후에도 미해결)`);
                return { validated: true, testPassed: false, repairAttempts };
            }

            // 분류
            const classification = testResult.classification
                || ErrorClassifier.classifyFromMessage(testResult.errorMessage || '');

            // 비재시도 카테고리 → 즉시 포기
            if (!ErrorClassifier.isRetryable(classification.dominantCategory)) {
                const strategy = ErrorClassifier.getResolutionStrategy(classification.dominantCategory);
                WebviewBridge.sendProcessingStatus(webview, 'review',
                    `${strategy.userMessage} (자동 수정 불가)`);
                return { validated: true, testPassed: false, repairAttempts };
            }

            // 동일 에러 반복 → 포기
            const currentFingerprint = classification.retryFingerprint;
            if (currentFingerprint && currentFingerprint === lastFingerprint) {
                WebviewBridge.sendProcessingStatus(webview, 'review', '동일 에러 반복 — 자동 수정 중단');
                return { validated: true, testPassed: false, repairAttempts };
            }
            lastFingerprint = currentFingerprint;

            // ENVIRONMENT_MISSING → AutoRemediator 시도
            if (classification.dominantCategory === ErrorCategory.ENVIRONMENT_MISSING) {
                WebviewBridge.sendProcessingStatus(webview, 'review', '환경 문제 자동 수정 중...');
                const remediation = await AutoRemediator.attemptFix(classification, workspaceRoot, webview);
                if (remediation.attempted && remediation.success) {
                    console.log('[OrchestrationRouter] AutoRemediation succeeded, re-validating...');
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    repairAttempts++;
                    continue;
                }
            }

            // 수리 에이전트 생성
            repairAttempts++;
            WebviewBridge.sendProcessingStep(webview, 'executing');
            WebviewBridge.sendProcessingStatus(webview, 'executing',
                `자동 수정 에이전트 실행 중 (${repairAttempts}/${MAX_REPAIR_RETRIES})...`);

            const modifiedFilesContext = await OrchestrationRouter.readFilesForRepair(
                allCreatedFiles, allModifiedFiles, workspaceRoot,
            );
            const repairPrompt = buildClassifiedRetryPrompt(
                classification, modifiedFilesContext, false, 1,
            );

            const repairSubtask: SubTask = {
                id: `repair-${attempt + 1}`,
                title: `빌드/테스트 에러 수정 (시도 ${attempt + 1})`,
                description: repairPrompt,
                dependencies: [],
                toolPermission: 'full',
            };

            const repairTaskItem: TaskQueueItem = {
                id: repairSubtask.id,
                title: repairSubtask.title,
                status: 'pending' as const,
            };
            taskItems.push(repairTaskItem);
            WebviewBridge.updateTaskQueue(webview, taskItems);

            const repairResult = await OrchestrationRouter.runAgent(
                repairSubtask, toolContext, options, projectContext, taskItems, collectedUIMessages, rulesContext,
            );

            // 수리 에이전트의 파일 변경 추적
            for (const f of repairResult.createdFiles) {
                if (!allCreatedFiles.includes(f)) { allCreatedFiles.push(f); }
            }
            for (const f of repairResult.modifiedFiles) {
                if (!allModifiedFiles.includes(f)) { allModifiedFiles.push(f); }
            }
        }

        return { validated: true, testPassed: false, repairAttempts };
    }

    /**
     * 수리 에이전트 프롬프트용 파일 내용 읽기
     */
    private static async readFilesForRepair(
        createdFiles: string[],
        modifiedFiles: string[],
        workspaceRoot: string,
    ): Promise<ModifiedFileContext[]> {
        const result: ModifiedFileContext[] = [];
        const allPaths = [...new Set([...createdFiles, ...modifiedFiles])];

        for (const filePath of allPaths) {
            try {
                const absolutePath = path.isAbsolute(filePath)
                    ? filePath
                    : path.join(workspaceRoot, filePath);
                const content = await fs.readFile(absolutePath, 'utf-8');
                result.push({ path: filePath, content });
            } catch {
                // 읽기 실패 파일은 건너뜀
            }
        }

        return result;
    }

    /**
     * 의존 태스크에 선행 태스크 결과(생성/수정 파일 목록)를 주입
     */
    private static enrichWithPriorResults(subtask: SubTask, priorResults: AgentLoopResult[]): SubTask {
        const depResults = priorResults.filter(r => subtask.dependencies.includes(r.subtaskId));
        if (depResults.length === 0) { return subtask; }

        const context: string[] = ['\n\n## 선행 태스크 결과'];
        for (const r of depResults) {
            context.push(`### ${r.subtaskId}`);
            if (r.createdFiles.length > 0) {
                context.push(`생성된 파일: ${r.createdFiles.join(', ')}`);
            }
            if (r.modifiedFiles.length > 0) {
                context.push(`수정된 파일: ${r.modifiedFiles.join(', ')}`);
            }
            if (r.response) {
                const summary = r.response.replace(THINKING_TAG_REGEX, '').trim().substring(0, 300);
                if (summary) {
                    context.push(`요약: ${summary}`);
                }
            }
        }

        return {
            ...subtask,
            description: subtask.description + context.join('\n'),
        };
    }

    private static async routeToSingleLoop(options: RouteOptions): Promise<void> {
        const conversationManager = ConversationManager.getInstance();
        await conversationManager.handleUserMessageAndRespond(options as any);
    }

    private static async getProjectContext(): Promise<string> {
        try {
            const pm = ProjectManager.getInstance();
            const project = pm.getCurrentProject();
            if (!project) { return ''; }

            const lines: string[] = [];
            lines.push(`프로젝트: ${project.name || 'unknown'}`);
            lines.push(`타입: ${project.type || 'unknown'}`);
            lines.push(`언어: ${project.language || 'unknown'}`);
            if (project.framework) { lines.push(`프레임워크: ${project.framework}`); }

            try {
                const inventory = await pm.buildProjectInventorySection(100);
                if (inventory) {
                    lines.push(`\n파일 구조:\n${inventory}`);
                }
            } catch {
                // 파일 구조 조회 실패해도 기본 정보만으로 진행
            }

            return lines.join('\n');
        } catch {
            return '';
        }
    }

    private static buildToolContext(): ToolExecutionContext {
        const project = ProjectManager.getInstance().getCurrentProject();
        const workspaceRoot = project?.root || '';

        return {
            projectRoot: workspaceRoot,
            workspaceRoot,
            actionManager: ActionManager.getInstance(),
            executionManager: ExecutionManager.getInstance(),
            terminalManager: TerminalManager.getInstance(),
            contextManager: ContextManager.getInstance(),
        };
    }

    /**
     * 서브 에이전트에 전달할 규칙/설정 컨텍스트를 수집
     * - Skills (로컬 .agent/rules + 서버 dev_rules)
     * - Hot Load 프롬프트
     * - MCP 커스텀 프롬프트
     * - 프레임워크 규칙
     * - RAG 컨텍스트
     *
     * 보안 규칙(차단 명령어, 보호 파일 등)은 PreToolUseValidator에서
     * 도구 실행 시 자동으로 적용되므로 여기서 별도로 수집하지 않음
     */
    private static async gatherRulesContext(userQuery: string): Promise<string> {
        const parts: string[] = [];

        // 1. Skills: 로컬(.agent/rules) + 서버(dev_rules)
        try {
            const { text: localRules, ruleKeys } = PromptComposer.loadAgentRulesWithKeys();
            const { text: serverRules } = PromptComposer.loadServerPromptTemplates(ruleKeys);
            if (localRules) { parts.push(localRules); }
            if (serverRules) { parts.push(serverRules); }
        } catch (e) {
            console.warn('[OrchestrationRouter] Failed to load Skills:', e);
        }

        // 2. Hot Load 프롬프트
        try {
            const { HotLoadManager } = await import('../managers/hotload/HotLoadManager');
            const hotLoadPrompt = await HotLoadManager.getInstance().getPromptSection();
            if (hotLoadPrompt) { parts.push(hotLoadPrompt); }
        } catch (e) {
            console.warn('[OrchestrationRouter] Failed to load Hot Load prompt:', e);
        }

        // 3. MCP 커스텀 프롬프트
        try {
            const { MCPManager } = await import('../mcp/MCPManager');
            const mcpServers = MCPManager.getInstance().getServers() as McpServerInfo[];
            const mcpParts = mcpServers
                .filter(s => s.enabled && s.customPrompt?.trim())
                .map(s => `**[MCP: ${s.name}]**\n${s.customPrompt!.trim()}`);
            if (mcpParts.length > 0) {
                parts.push(`## MCP 도구 사용 지침\n\n${mcpParts.join('\n\n')}`);
            }
        } catch (e) {
            console.warn('[OrchestrationRouter] Failed to load MCP prompts:', e);
        }

        // 4. 프레임워크 규칙
        try {
            const cm = ContextManager.getInstance();
            const frameworkRules = await cm.getFrameworkRulesPrompt();
            if (frameworkRules) { parts.push(frameworkRules); }
        } catch (e) {
            console.warn('[OrchestrationRouter] Failed to load framework rules:', e);
        }

        // 5. RAG 컨텍스트 — standalone 모드에서는 비활성화

        return parts.filter(p => p.trim()).join('\n\n');
    }

    /**
     * LLM을 사용하여 여러 에이전트 결과를 하나의 자연어 요약으로 통합
     * 싱글 에이전트의 최종 응답처럼 사용자 친화적인 형태로 생성
     */
    private static async generateUnifiedSummary(
        merged: AggregatedResult,
        userQuery: string,
        validation?: { validated: boolean; testPassed: boolean; repairAttempts: number },
    ): Promise<string> {
        const llm = LLMManager.getInstance();

        const systemPrompt = `당신은 코딩 어시스턴트입니다. 여러 에이전트가 수행한 작업 결과를 하나의 통합 응답으로 작성하세요.

규칙:
- 사용자의 원래 요청에 대한 완료 응답을 작성
- 무엇을 했는지 간결하게 요약 (1-3문단)
- 사용 방법을 안내할 때 아래 프로젝트 실행 명령어를 \`\`\`bash 코드블록으로 포함하세요 (Run 버튼이 자동 생성됩니다)
- 마크다운 형식 사용
- 한국어로 작성
- "에이전트"라는 단어를 사용하지 마세요 — 마치 하나의 어시스턴트가 모든 작업을 수행한 것처럼 작성
- 빌드/테스트 결과: ${validation?.validated ? (validation.testPassed ? '통과' : '실패') : '미검증'}

파일 내용 규칙 (매우 중요):
- **소스 코드 전체를 절대 포함하지 마세요** — 파일 변경 내역은 IDE 패널에 이미 표시됩니다
- 파일명과 무엇을 변경했는지만 간단히 언급하세요
- 코드 스니펫이 반드시 필요한 경우에만 핵심 부분 3-5줄 이내로 짧게 인용하세요

코드블록 규칙:
- \`\`\`bash 또는 \`\`\`sh 코드블록은 **터미널에서 직접 실행 가능한 명령어만** 사용 (예: npm install, npm run dev, git clone 등)
- JSX, TSX, TypeScript, JavaScript 등 소스 코드 스니펫은 반드시 해당 언어 태그 사용 (예: \`\`\`tsx, \`\`\`typescript, \`\`\`jsx)
- 짧은 코드 참조는 인라인 코드(\`)로 표시
- 실행 불가능한 코드를 절대 \`\`\`bash 블록에 넣지 마세요`;

        const agentSummaries = merged.summary || '(요약 없음)';
        const fileList = [
            ...merged.createdFiles.map(f => `생성: ${f}`),
            ...merged.modifiedFiles.map(f => `수정: ${f}`),
        ].join('\n');

        // 프로젝트 실행 명령어 수집
        let buildCommandsInfo = '';
        try {
            const projectManager = ProjectManager.getInstance();
            const buildCommands = projectManager.getCurrentProject()?.buildCommands;
            if (buildCommands) {
                const cmds = Object.entries(buildCommands)
                    .filter(([_, v]) => v)
                    .map(([k, v]) => `  ${k}: ${v}`)
                    .join('\n');
                if (cmds) {
                    buildCommandsInfo = `\n\n프로젝트 실행 명령어:\n${cmds}`;
                }
            }
        } catch { }

        const userMessage = `사용자 요청: ${userQuery}

수행된 파일 변경:
${fileList || '(없음)'}

각 작업의 상세 내용:
${agentSummaries}${buildCommandsInfo}

위 내용을 바탕으로 사용자에게 전달할 통합 완료 응답을 작성하세요.`;

        const response = await llm.sendMessageWithSystemPrompt(
            systemPrompt,
            [{ text: userMessage }],
        );

        // thinking 태그 제거
        return response.replace(THINKING_TAG_REGEX, '').trim();
    }

    private static formatMergedResult(
        result: AggregatedResult,
        validation?: { validated: boolean; testPassed: boolean; repairAttempts: number },
        unifiedSummary?: string,
    ): string {
        const lines: string[] = [];

        // 통합 요약이 있으면 싱글 에이전트 스타일로 표시
        if (unifiedSummary) {
            lines.push(unifiedSummary);
        } else {
            // 폴백: 통합 요약 생성 실패 시 기존 형식 사용
            lines.push(`## 작업 완료`);
            if (result.createdFiles.length > 0) {
                lines.push(`\n**생성된 파일:** ${result.createdFiles.map(f => `\`${f}\``).join(', ')}`);
            }
            if (result.modifiedFiles.length > 0) {
                lines.push(`\n**수정된 파일:** ${result.modifiedFiles.map(f => `\`${f}\``).join(', ')}`);
            }
        }

        // 빌드/테스트 검증 결과
        if (validation?.validated && !validation.testPassed) {
            lines.push(`\n> ⚠️ 빌드/테스트 검증 실패`);
            if (validation.repairAttempts > 0) {
                lines.push(`> 자동 수정 ${validation.repairAttempts}회 시도 후에도 해결되지 않았습니다.`);
            }
        }

        if (result.errors.length > 0) {
            lines.push(`\n### 오류`);
            result.errors.forEach(e => lines.push(`- ${e.replace(/\[task-(\d+)\]/g, '[에이전트 $1]')}`));
        }

        // 에이전트별 작업 상세 (접기)
        if (result.summary) {
            lines.push(`\n### 작업 상세`);
            lines.push(result.summary);
        }

        return lines.join('\n');
    }
}
