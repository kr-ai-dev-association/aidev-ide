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
import { ErrorClassifier } from '../managers/conversation/handlers/ErrorClassifier';
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
import { PromptType, OllamaApi, AiModelType, NotificationService } from '../../services';
import { SettingsManager } from '../managers/state/SettingsManager';
import { ReferenceItem } from '../webview/types';
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
    abortSignal?: AbortSignal;
}

const MAX_CONCURRENT_AGENTS = AgentConfig.MAX_CONCURRENT_AGENTS;

/** TaskQueue 아이템 (webview 전달용) */
interface TaskQueueItem {
    id: string;
    title: string;
    detail?: string;
    status: 'pending' | 'in_progress' | 'done' | 'failed' | 'warning';
}

/** MCP 서버 최소 타입 (gatherRulesContext 내부용) */
interface McpServerInfo { enabled: boolean; customPrompt?: string; name: string; }
/** RAG 검색 결과 최소 타입 (gatherRulesContext 내부용) */
interface RagResult { source_name?: string; source?: string; document_name?: string; document?: string; similarity?: number; content: string; }

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
            const projectContext = await OrchestrationRouter.getProjectContext(options.userQuery);

            // Hot Load 키워드 수집 (있으면 TaskSplitter에 전달하여 분할 방지)
            let hotLoadKeywords: string[] = [];
            try {
                const { HotLoadManager } = await import('../managers/hotload/HotLoadManager');
                const hotLoadManager = HotLoadManager.getInstance();
                const items = await hotLoadManager.getAllHotLoads();
                hotLoadKeywords = items.map((item: any) => item.keywords);
            } catch { /* ignore */ }

            // 분할 중 상태 표시
            WebviewBridge.sendProcessingStep(webview, 'plan');
            WebviewBridge.sendProcessingStatus(webview, 'plan', '작업 분할 분석 중...');

            const splitResult = await splitter.split(options.userQuery, projectContext, hotLoadKeywords);

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
                `${splitResult.subtasks.length}개 에이전트로 분할 완료`
            );

            const toolContext = OrchestrationRouter.buildToolContext();
            const results: AgentLoopResult[] = [];

            // 규칙/설정 컨텍스트 수집 (서브 에이전트 공유용)
            let rulesContext = '';
            let collectedReferences: ReferenceItem[] = [];
            try {
                const gathered = await OrchestrationRouter.gatherRulesContext(options.userQuery);
                rulesContext = gathered.text;
                collectedReferences = gathered.references;
                if (rulesContext) {
                    console.log(`[OrchestrationRouter] Rules context gathered (${rulesContext.length} chars)`);
                }
                if (collectedReferences.length > 0) {
                    console.log(`[OrchestrationRouter] References collected: ${collectedReferences.length}개 (${collectedReferences.map(r => `${r.type}:${r.name}`).join(', ')})`);
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
                            deletedFiles: [],
                            errors: [`선행 작업 미완료: ${missing.map(d => d.replace(/^task-/, '에이전트 ')).join(', ')}`],
                            warnings: [],
                            completionSummary: '',
                            turnCount: 0,
                            tokenEstimate: 0,
                            executionTime: 0,
                        });
                        continue;
                    }

                    const enrichedSubtask = await OrchestrationRouter.enrichWithPriorResults(subtask, results, toolContext.workspaceRoot);
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

                        // 재시도용 서브태스크: 이전 에러 정보 + 이전 작업 결과 + 성공한 에이전트 컨텍스트 포함
                        const previousWorkSection = (failedResult.createdFiles.length > 0 || failedResult.modifiedFiles.length > 0)
                            ? `\n## 이전 시도에서 이미 완료된 작업\n` +
                              (failedResult.createdFiles.length > 0
                                  ? `생성된 파일:\n${failedResult.createdFiles.map(f => `- ${f}`).join('\n')}\n`
                                  : '') +
                              (failedResult.modifiedFiles.length > 0
                                  ? `수정된 파일:\n${failedResult.modifiedFiles.map(f => `- ${f}`).join('\n')}\n`
                                  : '') +
                              `**위 파일들은 이미 존재합니다. 프로젝트 초기화(create-vite, npm init 등)를 다시 실행하지 마세요.**\n` +
                              `이미 생성된 파일은 read_file로 확인한 후 필요하면 update_file로 수정하세요.\n`
                            : '';

                        const retryDescription = `${originalSubtask.description}\n\n` +
                            `## 이전 시도 실패 정보\n` +
                            `이전 시도에서 ${failedResult.turnCount}턴 동안 작업했으나 완료하지 못했습니다.\n` +
                            (failedResult.errors.length > 0
                                ? `에러: ${failedResult.errors.join(', ')}\n`
                                : '') +
                            previousWorkSection +
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

            // Phase D: 재시도 성공으로 의존성이 해소된 skipped 태스크 실행
            if (!options.abortSignal?.aborted) {
                const nowCompletedIds = new Set(results.filter(r => r.success).map(r => r.subtaskId));
                const skippedResults = results.filter(r => !r.success && r.turnCount === 0);

                for (const skipped of skippedResults) {
                    if (options.abortSignal?.aborted) { break; }

                    const originalSubtask = splitResult.subtasks.find(st => st.id === skipped.subtaskId);
                    if (!originalSubtask) { continue; }

                    const depsOk = originalSubtask.dependencies.every(dep => nowCompletedIds.has(dep));
                    if (!depsOk) { continue; }

                    console.log(`[OrchestrationRouter] Dependencies now met for ${skipped.subtaskId}, executing...`);

                    const enrichedSubtask = await OrchestrationRouter.enrichWithPriorResults(originalSubtask, results, toolContext.workspaceRoot);
                    const result = await OrchestrationRouter.runAgent(
                        enrichedSubtask, toolContext, options, projectContext, taskItems, collectedUIMessages, rulesContext,
                    );

                    // 기존 skipped 결과 교체
                    const skippedIdx = results.findIndex(r => r.subtaskId === skipped.subtaskId);
                    if (skippedIdx !== -1) {
                        results[skippedIdx] = { ...result, subtaskId: skipped.subtaskId };
                    }
                    if (result.success) {
                        nowCompletedIds.add(skipped.subtaskId);
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

            // 참조 정보 웹뷰 전송 (요약 메시지 이후에 전송해야 패널 위치가 정확함)
            if (collectedReferences.length > 0) {
                console.log(`[OrchestrationRouter] Sending ${collectedReferences.length}개 references to webview`);
                WebviewBridge.sendReferenceInfo(webview, { items: collectedReferences });
            }

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
        WebviewBridge.sendProcessingStep(webview, 'executing');
        WebviewBridge.sendProcessingStatus(webview, 'executing', `${subtask.title} 실행 중...`);

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
                WebviewBridge.sendProcessingStatus(webview, 'executing', 'LLM 응답 대기 중...');
            },
            onThinking: (thinkingText) => {
                WebviewBridge.sendThinkingContent(webview, thinkingText);
            },
            onStreamingStatus: (status) => {
                WebviewBridge.sendProcessingStatus(webview, 'executing', status);
            },
        };

        // 4. 에이전트 실행 (서브태스크별 conversationTurnId 생성)
        const agentTurnId = `sub_${subtask.id}_${Date.now().toString(36)}`;
        const agentToolContext: ToolExecutionContext = { ...toolContext, conversationTurnId: agentTurnId };
        const useStreaming = options.extensionContext
            ? await SettingsManager.getInstance(options.extensionContext).isStreamingEnabled()
            : false;
        const agent = new SubAgentLoop(subtask, agentToolContext, options.abortSignal, projectContext, callbacks, rulesContext, useStreaming);
        const result = await agent.run();

        // 5. TaskQueue 상태 → done/warning/failed
        if (taskItems) {
            let taskStatus: 'done' | 'warning' | 'failed' = 'failed';
            if (result.success && result.warnings?.length > 0) {
                taskStatus = 'warning';
            } else if (result.success) {
                taskStatus = 'done';
            }
            OrchestrationRouter.updateTaskItemStatus(
                webview, taskItems, subtask.id, taskStatus
            );
        }

        // 6. 완료 로그
        const statusLabel = result.success ? '완료' : '실패';
        WebviewBridge.sendProcessingStatus(
            webview, 'executing',
            `${subtask.title} ${statusLabel}`
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
        status: 'pending' | 'in_progress' | 'done' | 'failed' | 'warning',
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
                undefined, [], 'review',
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

            // 수리 에이전트 생성 (ENVIRONMENT_MISSING 포함 모든 에러는 LLM repair agent가 처리)
            repairAttempts++;
            WebviewBridge.sendProcessingStep(webview, 'executing');
            WebviewBridge.sendProcessingStatus(webview, 'executing',
                `자동 수정 에이전트 실행 중 (${repairAttempts}/${MAX_REPAIR_RETRIES})...`);

            // 서브프로젝트 감지 시 repair agent의 cwd를 서브프로젝트로 조정
            const detectedRoot = testResult.detectedSubProjectRoot;
            const effectiveWorkspaceRoot = detectedRoot || workspaceRoot;

            const modifiedFilesContext = await OrchestrationRouter.readFilesForRepair(
                allCreatedFiles, allModifiedFiles, workspaceRoot,
            );
            const repairPrompt = buildClassifiedRetryPrompt(
                classification, modifiedFilesContext, false, 1, detectedRoot,
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

            // repair agent에게 서브프로젝트 루트를 workspaceRoot로 전달
            const repairToolContext: ToolExecutionContext = detectedRoot
                ? { ...toolContext, workspaceRoot: effectiveWorkspaceRoot }
                : toolContext;

            const repairResult = await OrchestrationRouter.runAgent(
                repairSubtask, repairToolContext, options, projectContext, taskItems, collectedUIMessages, rulesContext,
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
     * 의존 태스크에 선행 태스크 결과(생성/수정 파일 내용)를 주입
     * 파일 내용을 미리 제공하여 의존 태스크가 read_file 없이 바로 작업 가능
     */
    private static async enrichWithPriorResults(subtask: SubTask, priorResults: AgentLoopResult[], workspaceRoot: string): Promise<SubTask> {
        const depResults = priorResults.filter(r => subtask.dependencies.includes(r.subtaskId));
        if (depResults.length === 0) { return subtask; }

        const context: string[] = ['\n\n## 선행 태스크 결과 (파일 내용 포함 — read_file 불필요)'];
        const MAX_FILE_LINES = 200; // 파일당 최대 줄 수
        const MAX_TOTAL_CHARS = 30000; // 전체 주입 최대 문자 수
        let totalChars = 0;

        const allAlreadyDone = depResults.every(r => r.doneStatus === 'already_done');

        for (const r of depResults) {
            context.push(`### ${r.subtaskId}`);

            // already_done 상태 명시
            if (r.doneStatus === 'already_done') {
                context.push(`**상태: 이미 구현되어 있음 (already_done)** — 이 태스크는 기존 코드가 이미 완전히 구현되어 있어 추가 작업 없이 완료되었습니다.`);
            }

            // completionSummary 우선 사용 (구조화된 요약), 없으면 response fallback
            if (r.completionSummary) {
                context.push(r.completionSummary);
            } else if (r.response) {
                const summary = r.response.replace(THINKING_TAG_REGEX, '').trim().substring(0, 1200);
                if (summary) {
                    context.push(`\n요약: ${summary}`);
                }
            }

            // 파일 내용 읽기 및 주입
            const allFiles = [...new Set([...r.createdFiles, ...r.modifiedFiles])];
            if (allFiles.length > 0) {
                context.push(`**생성/수정된 파일 (${allFiles.length}개):**`);
                for (const filePath of allFiles) {
                    if (totalChars >= MAX_TOTAL_CHARS) {
                        context.push(`\n(이하 파일은 크기 제한으로 생략 — 필요시 read_file로 확인하세요)`);
                        break;
                    }
                    try {
                        const absolutePath = path.isAbsolute(filePath)
                            ? filePath
                            : path.join(workspaceRoot, filePath);
                        const content = await fs.readFile(absolutePath, 'utf-8');
                        const lines = content.split('\n');
                        const preview = lines.slice(0, MAX_FILE_LINES).join('\n');
                        const isTruncated = lines.length > MAX_FILE_LINES;
                        const ext = path.extname(filePath).slice(1) || 'text';

                        context.push(`\n**[${filePath}]:**`);
                        context.push('```' + ext);
                        context.push(preview);
                        if (isTruncated) {
                            context.push(`// ... (${lines.length - MAX_FILE_LINES}줄 생략)`);
                        }
                        context.push('```');
                        totalChars += preview.length;
                    } catch {
                        context.push(`- ${filePath} (읽기 실패 — read_file로 확인 필요)`);
                    }
                }
            }

            // 삭제된 파일 표시
            if (r.deletedFiles.length > 0) {
                context.push(`**삭제된 파일 (${r.deletedFiles.length}개):** ${r.deletedFiles.join(', ')}`);
            }
        }

        if (allAlreadyDone) {
            context.push(`\n**⚠️ 모든 선행 태스크가 already_done 상태입니다. 요청된 기능이 이미 완전히 구현되어 있습니다.**`);
            context.push(`**필요한 파일을 간단히 확인한 후 추가 작업이 불필요하면 __done__(already_done)으로 완료하세요.**`);
        } else {
            context.push(`\n**⚠️ 위 파일 내용은 이미 제공되었습니다. read_file로 다시 읽지 마세요.**`);
            context.push(`**⚠️ 위에 나열된 파일은 이미 디스크에 존재합니다. 수정이 필요하면 반드시 update_file을 사용하세요. create_file로 덮어쓰지 마세요.**`);
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

    private static async getProjectContext(userQuery?: string): Promise<string> {
        try {
            const pm = ProjectManager.getInstance();
            const project = pm.getCurrentProject();
            if (!project) { return ''; }

            const lines: string[] = [];
            lines.push(`프로젝트: ${project.name || 'unknown'}`);
            lines.push(`타입: ${project.type || 'unknown'}`);
            lines.push(`언어: ${project.language || 'unknown'}`);
            if (project.framework) { lines.push(`프레임워크: ${project.framework}`); }

            const workspaceRoot = project.root || '';

            // 워크스페이스 루트 디렉토리 스캔 (서브 에이전트에 실제 디렉토리 구조 전달)
            if (workspaceRoot) {
                try {
                    const entries = await fs.readdir(workspaceRoot, { withFileTypes: true });
                    const dirs = entries
                        .filter(e => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== 'dist' && e.name !== 'build')
                        .map(e => e.name);
                    if (dirs.length > 0) {
                        lines.push(`\n워크스페이스 루트 디렉토리: ${dirs.join(', ')}`);
                    }
                } catch {
                    // 디렉토리 스캔 실패 무시
                }
            }

            // 사용자 쿼리에서 언급된 경로 추출 → 서브 에이전트에 명시적 경로 컨텍스트 전달
            if (userQuery) {
                const mentionedPaths = OrchestrationRouter.extractPathsFromQuery(userQuery);
                if (mentionedPaths.length > 0) {
                    lines.push(`\n사용자가 언급한 대상 경로: ${mentionedPaths.join(', ')}`);
                    lines.push(`⚠️ 모든 파일 생성/수정은 반드시 위 경로 기준으로 수행해야 합니다.`);
                }
            }

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

    /**
     * 사용자 쿼리에서 디렉토리/파일 경로 패턴을 추출
     * e.g. "server/ 에 API 만들어줘" → ["server/"]
     * e.g. "client/src/pages/ 에 페이지 추가" → ["client/src/pages/"]
     */
    private static extractPathsFromQuery(query: string): string[] {
        const paths: string[] = [];

        // 패턴 1: "server/", "client/", "src/pages/" 등 슬래시로 끝나는 경로
        const slashPaths = query.match(/(?:^|\s)([\w\-.]+(?:\/[\w\-.]*)*\/)/g);
        if (slashPaths) {
            for (const p of slashPaths) {
                const trimmed = p.trim();
                if (trimmed.length > 1) { paths.push(trimmed); }
            }
        }

        // 패턴 2: "server/src/index.ts" 등 확장자가 있는 파일 경로
        const filePaths = query.match(/(?:^|\s)([\w\-.]+(?:\/[\w\-.]+)+\.\w+)/g);
        if (filePaths) {
            for (const p of filePaths) {
                const trimmed = p.trim();
                if (!paths.includes(trimmed)) { paths.push(trimmed); }
            }
        }

        return paths;
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
    private static async gatherRulesContext(userQuery: string): Promise<{ text: string; references: ReferenceItem[] }> {
        const parts: string[] = [];
        const references: ReferenceItem[] = [];

        // 서버 설정 동기화 완료 대기 (시작 직후 sync 미완료 방지)
        await PromptComposer.ensureServerSettingsSynced();

        // 1. Skills: 로컬(.agent/rules) + 서버(dev_rules)
        try {
            const { text: localRules, ruleKeys } = PromptComposer.loadAgentRulesWithKeys();
            const { text: serverRules } = PromptComposer.loadServerPromptTemplates(ruleKeys);
            if (localRules) { parts.push(localRules); }
            if (serverRules) { parts.push(serverRules); }
            // 참조 추적: 로컬 규칙
            for (const key of ruleKeys) {
                references.push({ type: 'local_rule', name: key, source: 'local' });
            }
            // 참조 추적: 서버 규칙
            for (const rule of PromptComposer.getLastIncludedServerRuleKeys()) {
                references.push({ type: 'server_rule', name: rule.title, source: 'server' });
            }
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

        // 5. RAG 컨텍스트
        try {
            const { AuthService } = await import('../../services/auth/AuthService');
            const auth = AuthService.getInstance();
            if (auth.isLoggedIn() && userQuery) {
                const userInfo = auth.getUserInfo();
                const orgId = userInfo?.organization_id;
                console.log(`[OrchestrationRouter] RAG: 검색 시작 (query: "${userQuery.substring(0, 50)}...", orgId: ${orgId})`);
                const { CodePilotApiClient } = await import('../../services/api/CodePilotApiClient');
                const ragRaw = await CodePilotApiClient.getInstance().searchRag(
                    userQuery, orgId || undefined, undefined, 5,
                ) as RagResult[] | { data?: RagResult[]; results?: RagResult[] };
                const ragResults: RagResult[] = Array.isArray(ragRaw)
                    ? ragRaw
                    : ((ragRaw as { data?: RagResult[]; results?: RagResult[] }).data || (ragRaw as { data?: RagResult[]; results?: RagResult[] }).results || []);
                if (ragResults.length > 0) {
                    console.log(`[OrchestrationRouter] RAG: ${ragResults.length}개 문서 청크 검색됨`);
                    const ragText = ragResults
                        .map((r, i) => {
                            const source = r.source_name || r.source || '';
                            const doc = r.document_name || r.document || '';
                            const sim = r.similarity != null ? ` (유사도: ${(r.similarity * 100).toFixed(0)}%)` : '';
                            return `[문서 ${i + 1}] ${source} > ${doc}${sim}\n${r.content}`;
                        })
                        .join('\n\n---\n\n');
                    parts.push(`## 참고 문서 (RAG) — 반드시 우선 활용\n${ragText}`);
                    // RAG 참조 추적
                    for (const r of ragResults) {
                        references.push({
                            type: 'rag',
                            name: r.document_name || r.document || 'unknown',
                            source: r.source_name || r.source || '',
                            similarity: r.similarity != null ? r.similarity : undefined,
                        });
                    }
                } else {
                    console.log('[OrchestrationRouter] RAG: 검색 결과 없음 (0건)');
                }
            } else {
                console.log(`[OrchestrationRouter] RAG: 스킵 (isLoggedIn=${auth.isLoggedIn()}, hasQuery=${!!userQuery})`);
            }
        } catch (e) {
            console.warn('[OrchestrationRouter] RAG: 검색 실패:', e);
        }

        return { text: parts.filter(p => p.trim()).join('\n\n'), references };
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
            ...merged.deletedFiles.map(f => `삭제: ${f}`),
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
