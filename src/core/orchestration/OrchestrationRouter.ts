/**
 * OrchestrationRouter
 * Router that branches execution paths based on orchestration ON/OFF setting
 *
 * OFF (default): ConversationManager single loop (100% preserved)
 * ON + simple task: ConversationManager single loop
 * ON + complex task: TaskSplitter -> SubAgentLoop[] parallel -> ResultMerger
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
import { ToolUse, Tool } from '../tools/types';
import { UIMessageEntry } from '../managers/state/types';
import { TaskSplitter } from './TaskSplitter';
import { SubAgentLoop } from './SubAgentLoop';
import { ResultMerger } from './ResultMerger';
import { PromisePool } from './PromisePool';
import { SubTask, AggregatedResult, AgentLoopResult, AgentLoopCallbacks, THINKING_TAG_REGEX } from './types';
import { LLMManager } from '../managers/model/LLMManager';
import { PromptComposer } from '../managers/context/prompts/PromptComposer';
import { AgentConfig } from '../config/AgentConfig';
import { StateManager } from '../managers/state/StateManager';
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
    candidateSkillKeys?: string[];
}

const MAX_CONCURRENT_AGENTS = AgentConfig.MAX_CONCURRENT_AGENTS;

/** TaskQueue item (for webview delivery) */
interface TaskQueueItem {
    id: string;
    title: string;
    detail?: string;
    status: 'pending' | 'in_progress' | 'done' | 'failed' | 'warning';
}

/** MCP server minimal type (internal to gatherRulesContext) */
interface McpServerInfo { enabled: boolean; customPrompt?: string; name: string; }
/** RAG search result minimal type (internal to gatherRulesContext) */
interface RagResult { source_name?: string; source?: string; document_name?: string; document?: string; similarity?: number; content: string; }

export class OrchestrationRouter {
    /**
     * Branch based on orchestration settings
     */
    static async route(options: RouteOptions): Promise<void> {
        const orchestrationEnabled = ConfigurationService.get<boolean>('orchestration', false) ?? false;

        // PLAN/ASK mode does not need multi-agent -- always use single agent
        // AGENT mode: LLM-driven orchestration via spawn_agent tool (not system-level TaskSplitter)
        if (!orchestrationEnabled || options.promptType === PromptType.PLAN || options.promptType === PromptType.GENERAL_ASK || options.promptType === PromptType.AGENT) {
            return OrchestrationRouter.routeToSingleLoop(options);
        }

        const webview = options.webviewToRespond;
        const startTime = Date.now();

        // Collect UI messages (for history storage)
        const collectedUIMessages: UIMessageEntry[] = [];

        // ON: Determine branching via TaskSplitter
        try {
            const splitter = new TaskSplitter();
            const projectContext = await OrchestrationRouter.getProjectContext(options.userQuery);

            // Collect Hot Load keywords (pass to TaskSplitter to prevent splitting if present)
            let hotLoadKeywords: string[] = [];
            try {
                const { HotLoadManager } = await import('../managers/hotload/HotLoadManager');
                const hotLoadManager = HotLoadManager.getInstance();
                const items = await hotLoadManager.getAllHotLoads();
                hotLoadKeywords = items.map((item: any) => item.keywords);
            } catch { /* ignore */ }

            // Show status during splitting
            WebviewBridge.sendProcessingStep(webview, 'plan');
            WebviewBridge.sendProcessingStatus(webview, 'plan', '작업 분할 분석 중...');

            const splitResult = await splitter.split(options.userQuery, projectContext, hotLoadKeywords);

            if (!splitResult.shouldSplit) {
                console.log('[OrchestrationRouter] Simple task, using single loop');
                return OrchestrationRouter.routeToSingleLoop(options);
            }

            // Complex task -> parallel agents
            console.log(`[OrchestrationRouter] Splitting into ${splitResult.subtasks.length} subtasks: ${splitResult.reasoning}`);

            // Separate independent/dependent tasks
            const independentTasks = splitResult.subtasks.filter(st => st.dependencies.length === 0);
            const dependentTasks = splitResult.subtasks.filter(st => st.dependencies.length > 0);

            // Register all subtasks in TaskQueue
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

            // Pre-load skill registry (registry must be populated before IntentDetector)
            PromptComposer.loadAgentRulesWithKeys();
            await PromptComposer.ensureServerSettingsSynced();
            PromptComposer.loadServerPromptTemplates(new Set());

            // If skills are registered, collect candidateSkillKeys via IntentDetector
            let candidateSkillKeys: string[] = [];
            const skillDescriptions = PromptComposer.getSkillDescriptions();
            if (skillDescriptions.length > 0) {
                try {
                    const { IntentDetector } = await import('../managers/action/IntentDetector');
                    const intentDetector = new IntentDetector(LLMManager.getInstance());
                    if (options.extensionContext) {
                        intentDetector.setStateManager(StateManager.getInstance(options.extensionContext));
                    }
                    const intent = await intentDetector.detectIntent(options.userQuery);
                    candidateSkillKeys = intent.requiredSkillKeys || [];
                    if (candidateSkillKeys.length > 0) {
                        console.log(`[OrchestrationRouter] candidateSkillKeys from IntentDetector: ${candidateSkillKeys.join(', ')}`);
                    }
                } catch (e) {
                    console.warn('[OrchestrationRouter] Failed to detect candidateSkillKeys:', e);
                }
            }

            // Collect rules/settings context (shared across sub-agents)
            let rulesContext = '';
            let collectedReferences: ReferenceItem[] = [];
            try {
                const gathered = await OrchestrationRouter.gatherRulesContext(options.userQuery, candidateSkillKeys);
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

            // Phase A: Execute independent tasks in parallel
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

            // Phase B: Execute dependent tasks sequentially
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
                            errors: [`Prerequisite tasks incomplete: ${missing.map(d => d.replace(/^task-/, 'agent ')).join(', ')}`],
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

            // Phase C: Retry failed subtasks once
            if (!options.abortSignal?.aborted) {
                const failedResults = results.filter(r => !r.success && r.turnCount > 0);
                if (failedResults.length > 0) {
                    console.log(`[OrchestrationRouter] ${failedResults.length} subtask(s) failed, retrying...`);
                    WebviewBridge.sendProcessingStep(webview, 'review');
                    WebviewBridge.sendProcessingStatus(webview, 'review',
                        `실패한 ${failedResults.length}개 작업 재시도 중...`);

                    // Use successful agent results as context
                    const successResults = results.filter(r => r.success);

                    for (const failedResult of failedResults) {
                        if (options.abortSignal?.aborted) { break; }

                        const originalSubtask = splitResult.subtasks.find(st => st.id === failedResult.subtaskId);
                        if (!originalSubtask) { continue; }

                        // Retry subtask: includes previous error info + previous work results + successful agent context
                        const previousWorkSection = (failedResult.createdFiles.length > 0 || failedResult.modifiedFiles.length > 0)
                            ? `\n## Work already completed in previous attempt\n` +
                              (failedResult.createdFiles.length > 0
                                  ? `Created files:\n${failedResult.createdFiles.map(f => `- ${f}`).join('\n')}\n`
                                  : '') +
                              (failedResult.modifiedFiles.length > 0
                                  ? `Modified files:\n${failedResult.modifiedFiles.map(f => `- ${f}`).join('\n')}\n`
                                  : '') +
                              `**These files already exist. Do not re-run project initialization (create-vite, npm init, etc.).**\n` +
                              `Check already created files with read_file first, then use update_file to modify if needed.\n`
                            : '';

                        const retryDescription = `${originalSubtask.description}\n\n` +
                            `## Previous attempt failure info\n` +
                            `The previous attempt worked for ${failedResult.turnCount} turns but did not complete.\n` +
                            (failedResult.errors.length > 0
                                ? `Errors: ${failedResult.errors.join(', ')}\n`
                                : '') +
                            previousWorkSection +
                            (successResults.length > 0
                                ? `\n## Other agents' completed work\n${successResults.map(r => {
                                    const cleaned = r.response.replace(THINKING_TAG_REGEX, '').trim();
                                    return cleaned ? `- ${r.subtaskId}: ${cleaned.substring(0, 200)}` : '';
                                }).filter(Boolean).join('\n')}\n`
                                : '') +
                            `\nPlease follow the tool call format exactly. You must write tool calls inside \`\`\`json code blocks.`;

                        const retrySubtask: SubTask = {
                            ...originalSubtask,
                            id: `${originalSubtask.id}-retry`,
                            title: `${originalSubtask.title} (retry)`,
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

                        // Replace existing failed result with retry result
                        const failedIdx = results.findIndex(r => r.subtaskId === failedResult.subtaskId);
                        if (failedIdx !== -1 && retryResult.success) {
                            results[failedIdx] = { ...retryResult, subtaskId: failedResult.subtaskId };
                            console.log(`[OrchestrationRouter] Retry succeeded for ${failedResult.subtaskId}`);
                        } else if (failedIdx !== -1) {
                            // Retry also failed: merge errors
                            results[failedIdx].errors.push(
                                ...retryResult.errors.map(e => `[retry] ${e}`)
                            );
                            console.warn(`[OrchestrationRouter] Retry also failed for ${failedResult.subtaskId}`);
                        }
                    }
                }
            }

            // Phase D: Execute skipped tasks whose dependencies are now resolved after successful retries
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

                    // Replace existing skipped result
                    const skippedIdx = results.findIndex(r => r.subtaskId === skipped.subtaskId);
                    if (skippedIdx !== -1) {
                        results[skippedIdx] = { ...result, subtaskId: skipped.subtaskId };
                    }
                    if (result.success) {
                        nowCompletedIds.add(skipped.subtaskId);
                    }
                }
            }

            // Merge results
            const merged = ResultMerger.merge(results);

            // Build/test validation (summary is shown even if validation fails)
            let validationResult = { validated: false, testPassed: true, repairAttempts: 0 };
            try {
                validationResult = await OrchestrationRouter.runPostMergeValidation(
                    merged, webview, toolContext, options, projectContext, taskItems, collectedUIMessages, rulesContext,
                );
            } catch (validationError) {
                console.error('[OrchestrationRouter] Post-merge validation threw:', validationError);
            }

            // Skip summary/display on user cancellation
            if (options.abortSignal?.aborted) { return; }

            // Generate unified summary (natural language summary via LLM)
            let unifiedSummary = '';
            try {
                unifiedSummary = await OrchestrationRouter.generateUnifiedSummary(
                    merged, options.userQuery, validationResult,
                );
            } catch (e) {
                console.warn('[OrchestrationRouter] Failed to generate unified summary:', e);
            }

            // Display summary
            if (options.abortSignal?.aborted) { return; }
            const summaryMessage = OrchestrationRouter.formatMergedResult(merged, validationResult, unifiedSummary);
            WebviewBridge.receiveMessage(webview, 'CODEPILOT', summaryMessage);
            collectedUIMessages.push({ sender: 'CODEPILOT', text: summaryMessage, type: 'summary' });

            // Send reference info to webview (must be sent after summary message for correct panel position)
            if (collectedReferences.length > 0) {
                console.log(`[OrchestrationRouter] Sending ${collectedReferences.length}개 references to webview`);
                WebviewBridge.sendReferenceInfo(webview, { items: collectedReferences });
            }

            // Show turn actions (after all output is complete)
            try {
                const { InlineDiffManager } = await import('../managers/diff/InlineDiffManager');
                const turnStats = InlineDiffManager.getInstance().getPendingChangesByTurn();
                if (turnStats.length > 0) {
                    webview.postMessage({ command: 'showTurnActions', turns: turnStats });
                }
            } catch (e) {
                console.warn('[OrchestrationRouter] showTurnActions failed:', e);
            }

            // UI cleanup
            WebviewBridge.sendProcessingStep(webview, 'done');
            WebviewBridge.hideLoading(webview);

            // Save to conversation history
            await OrchestrationRouter.saveToHistory(options, merged, collectedUIMessages, startTime);

        } catch (error) {
            console.error('[OrchestrationRouter] Orchestration failed, falling back to single loop:', error);
            WebviewBridge.hideLoading(webview);
            WebviewBridge.clearTaskQueue(webview);
            WebviewBridge.receiveMessage(
                webview,
                'System',
                'Multi-agent failed, switching to single agent.'
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
        agentOptions?: { disableReadDedup?: boolean; isRepairAgent?: boolean; isAgentMode?: boolean },
    ): Promise<AgentLoopResult> {
        const webview = options.webviewToRespond;

        // 1. TaskQueue status -> in_progress
        if (taskItems) {
            OrchestrationRouter.updateTaskItemStatus(webview, taskItems, subtask.id, 'in_progress');
        }

        // 2. Update ProcessStep status (including progress)
        WebviewBridge.sendProcessingStep(webview, 'executing');
        WebviewBridge.sendProcessingStatus(webview, 'executing', `${subtask.title} 실행 중...`);

        // 3. Create callbacks -- reuse ToolExecutionCoordinator + collect UI messages
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

        // 4. Run agent (generate conversationTurnId per subtask)
        const agentTurnId = `sub_${subtask.id}_${Date.now().toString(36)}`;
        const agentToolContext: ToolExecutionContext = { ...toolContext, conversationTurnId: agentTurnId };
        const settingsMgr = options.extensionContext ? SettingsManager.getInstance(options.extensionContext) : null;
        const useStreaming = settingsMgr ? await settingsMgr.isStreamingEnabled() : false;
        const thinkingEnabled = settingsMgr ? await settingsMgr.isThinkingEnabled() : true;

        // Tool approval settings (same pending behavior as single agent)
        const isAutoToolEnabled = settingsMgr ? await settingsMgr.isAutoToolExecutionEnabled() : true;
        const isAutoCommandEnabled = settingsMgr ? await settingsMgr.isAutoExecuteCommandsEnabled() : true;
        const isAutoUpdateEnabled = settingsMgr ? await settingsMgr.isAutoUpdateEnabled() : true;
        const isAutoDeleteEnabled = settingsMgr ? await settingsMgr.isAutoDeleteFilesEnabled() : true;

        callbacks.onToolApprovalRequired = async (call: ToolUse): Promise<boolean> => {
            const toolName = call.name as string;
            // Determine if approval is needed (same logic as ConversationManager.checkToolNeedsConfirmation)
            let needsConfirmation = false;
            if (!isAutoToolEnabled) {
                needsConfirmation = true;
            } else if (!isAutoCommandEnabled && toolName === Tool.RUN_COMMAND) {
                needsConfirmation = true;
            } else if (!isAutoUpdateEnabled && (toolName === Tool.CREATE_FILE || toolName === Tool.UPDATE_FILE)) {
                needsConfirmation = true;
            } else if (!isAutoDeleteEnabled && toolName === Tool.REMOVE_FILE) {
                needsConfirmation = true;
            }
            if (!needsConfirmation) { return true; }

            // Show pending message in webview
            const detail = call.params.path || call.params.command || '';
            const detailDisplay = detail ? `: ${detail.substring(0, 50)}${detail.length > 50 ? '...' : ''}` : '';
            const toolLabel = ToolExecutionCoordinator.getToolLabel(toolName);
            WebviewBridge.receiveMessage(webview, 'System', `[Pending] ${toolLabel}${detailDisplay} - User approval required`);

            // VS Code native modal (same as single agent)
            const dialogDetail = detail ? `\n${detail}` : '';
            const result = await vscode.window.showInformationMessage(
                `Execute tool: ${toolLabel}${dialogDetail}`,
                { modal: true },
                'Execute',
                'Skip',
            );
            return result === 'Execute';
        };
        const stateManager = options.extensionContext ? StateManager.getInstance(options.extensionContext) : undefined;
        // AGENT 모드 전달: agentOptions에 명시적으로 없으면 promptType에서 판단
        const mergedAgentOptions = {
            ...agentOptions,
            isAgentMode: agentOptions?.isAgentMode ?? (options.promptType === PromptType.AGENT),
        };
        const agent = new SubAgentLoop(subtask, agentToolContext, options.abortSignal, projectContext, callbacks, rulesContext, useStreaming, thinkingEnabled, mergedAgentOptions, stateManager);
        const result = await agent.run();

        // 5. TaskQueue status -> done/warning/failed
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

        // 6. Completion log
        const statusLabel = result.success ? 'completed' : 'failed';
        WebviewBridge.sendProcessingStatus(
            webview, 'executing',
            `${subtask.title} ${statusLabel === 'completed' ? '완료' : '실패'}`
        );

        return result;
    }

    /**
     * Update TaskQueue item status and send to webview
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
     * Save orchestration results to session history
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
     * Build/test validation after result merging + auto-repair
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
        // No validation needed if no files were changed
        if (merged.createdFiles.length === 0 && merged.modifiedFiles.length === 0) {
            return { validated: true, testPassed: true, repairAttempts: 0 };
        }

        const workspaceRoot = toolContext.workspaceRoot;
        if (!workspaceRoot) {
            return { validated: false, testPassed: true, repairAttempts: 0 };
        }

        const isAgentMode = options.promptType === PromptType.AGENT;
        const MAX_REPAIR_RETRIES = isAgentMode ? 10 : 2;
        let allCreatedFiles = [...merged.createdFiles];
        let allModifiedFiles = [...merged.modifiedFiles];
        let repairAttempts = 0;
        let lastFingerprint = '';
        let consecutiveSameError = 0; // AGENT 모드: 동일 에러 연속 횟수 추적

        for (let attempt = 0; attempt <= MAX_REPAIR_RETRIES; attempt++) {
            if (options.abortSignal?.aborted) { break; }

            const label = attempt === 0
                ? '빌드/테스트 검증 실행 중...'
                : `자동 수정 검증 진행 중 (${attempt}/${MAX_REPAIR_RETRIES})...`;

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

            // Validation failed
            console.log(`[OrchestrationRouter] Validation failed (attempt ${attempt}): ${testResult.errorMessage?.substring(0, 100).replace(/\n/g, ' ')}`);

            if (attempt >= MAX_REPAIR_RETRIES) {
                WebviewBridge.sendProcessingStatus(webview, 'review',
                    `빌드/테스트 검증 실패 (${MAX_REPAIR_RETRIES}회 수정 시도 후 미해결)`);
                return { validated: true, testPassed: false, repairAttempts };
            }

            // Classification
            const classification = testResult.classification
                || ErrorClassifier.classifyFromMessage(testResult.errorMessage || '');

            // Non-retryable category -> give up immediately (AGENT 모드: 한 번은 시도)
            if (!ErrorClassifier.isRetryable(classification.dominantCategory) && !isAgentMode) {
                const strategy = ErrorClassifier.getResolutionStrategy(classification.dominantCategory);
                WebviewBridge.sendProcessingStatus(webview, 'review',
                    `${strategy.userMessage} (자동 수정 불가)`);
                return { validated: true, testPassed: false, repairAttempts };
            }

            // Same error repeated -> give up (AGENT 모드: 3회까지 재시도)
            const currentFingerprint = classification.retryFingerprint;
            if (currentFingerprint && currentFingerprint === lastFingerprint) {
                consecutiveSameError++;
                const sameErrorLimit = isAgentMode ? 3 : 1;
                if (consecutiveSameError >= sameErrorLimit) {
                    WebviewBridge.sendProcessingStatus(webview, 'review', '동일 에러 반복 — 자동 수정 중단');
                    return { validated: true, testPassed: false, repairAttempts };
                }
            } else {
                consecutiveSameError = 0;
            }
            lastFingerprint = currentFingerprint;

            // Create repair agent (all errors including ENVIRONMENT_MISSING are handled by LLM repair agent)
            repairAttempts++;
            WebviewBridge.sendProcessingStep(webview, 'executing');
            WebviewBridge.sendProcessingStatus(webview, 'executing',
                isAgentMode
                    ? `에이전트 자동 수정 중 (${repairAttempts}차 시도)...`
                    : `자동 수정 에이전트 실행 중 (${repairAttempts}/${MAX_REPAIR_RETRIES})...`);

            // Adjust repair agent's cwd to subproject when subproject is detected
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
                title: `빌드/테스트 에러 수정 (${attempt + 1}차 시도)`,
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

            // Pass subproject root as workspaceRoot to repair agent
            const repairToolContext: ToolExecutionContext = detectedRoot
                ? { ...toolContext, workspaceRoot: effectiveWorkspaceRoot }
                : toolContext;

            const repairResult = await OrchestrationRouter.runAgent(
                repairSubtask, repairToolContext, options, projectContext, taskItems, collectedUIMessages, rulesContext,
                { disableReadDedup: true, isRepairAgent: true },
            );

            // Track file changes from repair agent
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
     * Read file contents for repair agent prompt
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
                // Skip files that fail to read
            }
        }

        return result;
    }

    /**
     * Inject prior task results (created/modified file contents) into dependent tasks
     * Provide file contents upfront so dependent tasks can work without read_file
     */
    private static async enrichWithPriorResults(subtask: SubTask, priorResults: AgentLoopResult[], workspaceRoot: string): Promise<SubTask> {
        const depResults = priorResults.filter(r => subtask.dependencies.includes(r.subtaskId));
        if (depResults.length === 0) { return subtask; }

        const context: string[] = ['\n\n## Prior task results (file contents included -- read_file not needed)'];
        const MAX_FILE_LINES = 200; // Max lines per file
        const MAX_TOTAL_CHARS = 30000; // Max total injected characters
        let totalChars = 0;

        const allAlreadyDone = depResults.every(r => r.doneStatus === 'already_done');

        for (const r of depResults) {
            context.push(`### ${r.subtaskId}`);

            // Indicate already_done status
            if (r.doneStatus === 'already_done') {
                context.push(`**Status: already implemented (already_done)** -- This task was completed without additional work because the existing code already fully implements it.`);
            }

            // Use completionSummary first (structured summary), fallback to response
            if (r.completionSummary) {
                context.push(r.completionSummary);
            } else if (r.response) {
                const summary = r.response.replace(THINKING_TAG_REGEX, '').trim().substring(0, 1200);
                if (summary) {
                    context.push(`\nSummary: ${summary}`);
                }
            }

            // Read and inject file contents
            const allFiles = [...new Set([...r.createdFiles, ...r.modifiedFiles])];
            if (allFiles.length > 0) {
                context.push(`**Created/modified files (${allFiles.length}):**`);
                for (const filePath of allFiles) {
                    if (totalChars >= MAX_TOTAL_CHARS) {
                        context.push(`\n(Remaining files omitted due to size limit -- use read_file to check if needed)`);
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
                            context.push(`// ... (${lines.length - MAX_FILE_LINES} lines omitted)`);
                        }
                        context.push('```');
                        totalChars += preview.length;
                    } catch {
                        context.push(`- ${filePath} (read failed -- needs verification via read_file)`);
                    }
                }
            }

            // Show deleted files
            if (r.deletedFiles.length > 0) {
                context.push(`**Deleted files (${r.deletedFiles.length}):** ${r.deletedFiles.join(', ')}`);
            }
        }

        if (allAlreadyDone) {
            context.push(`\n**WARNING: All prior tasks are in already_done status. The requested functionality is already fully implemented.**`);
            context.push(`**Briefly check the required files and if no additional work is needed, complete with __done__(already_done).**`);
        } else {
            context.push(`\n**WARNING: The file contents above have already been provided. Do not read them again with read_file.**`);
            context.push(`**WARNING: The files listed above already exist on disk. If modifications are needed, you must use update_file. Do not overwrite with create_file.**`);
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
            lines.push(`Project: ${project.name || 'unknown'}`);
            lines.push(`Type: ${project.type || 'unknown'}`);
            lines.push(`Language: ${project.language || 'unknown'}`);
            if (project.framework) { lines.push(`Framework: ${project.framework}`); }

            const workspaceRoot = project.root || '';

            // Scan workspace root directory (provide actual directory structure to sub-agents)
            if (workspaceRoot) {
                try {
                    const entries = await fs.readdir(workspaceRoot, { withFileTypes: true });
                    const dirs = entries
                        .filter(e => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== 'dist' && e.name !== 'build')
                        .map(e => e.name);
                    if (dirs.length > 0) {
                        lines.push(`\nWorkspace root directories: ${dirs.join(', ')}`);
                    }
                } catch {
                    // Ignore directory scan failure
                }
            }

            // Extract paths mentioned in user query -> pass explicit path context to sub-agents
            if (userQuery) {
                const mentionedPaths = OrchestrationRouter.extractPathsFromQuery(userQuery);
                if (mentionedPaths.length > 0) {
                    lines.push(`\nTarget paths mentioned by user: ${mentionedPaths.join(', ')}`);
                    lines.push(`WARNING: All file creation/modification must be performed relative to the paths above.`);
                }
            }

            try {
                const inventory = await pm.buildProjectInventorySection(100);
                if (inventory) {
                    lines.push(`\nFile structure:\n${inventory}`);
                }
            } catch {
                // Proceed with basic info even if file structure retrieval fails
            }

            return lines.join('\n');
        } catch {
            return '';
        }
    }

    /**
     * Extract directory/file path patterns from user query
     * e.g. "create API in server/" -> ["server/"]
     * e.g. "add page to client/src/pages/" -> ["client/src/pages/"]
     */
    private static extractPathsFromQuery(query: string): string[] {
        const paths: string[] = [];

        // Pattern 1: Paths ending with slash like "server/", "client/", "src/pages/"
        const slashPaths = query.match(/(?:^|\s)([\w\-.]+(?:\/[\w\-.]*)*\/)/g);
        if (slashPaths) {
            for (const p of slashPaths) {
                const trimmed = p.trim();
                if (trimmed.length > 1) { paths.push(trimmed); }
            }
        }

        // Pattern 2: File paths with extensions like "server/src/index.ts"
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
     * Collect rules/settings context to pass to sub-agents
     * - Skills (local .agent/rules + server dev_rules)
     * - Hot Load prompts
     * - MCP custom prompts
     * - Framework rules
     * - RAG context
     *
     * Security rules (blocked commands, protected files, etc.) are automatically
     * applied by PreToolUseValidator during tool execution, so they are not collected here
     */
    private static async gatherRulesContext(userQuery: string, candidateSkillKeys?: string[]): Promise<{ text: string; references: ReferenceItem[] }> {
        const parts: string[] = [];
        const references: ReferenceItem[] = [];

        // Wait for server settings sync to complete (prevent incomplete sync right after start)
        await PromptComposer.ensureServerSettingsSynced();

        // 1. Skills: local (.agent/rules) + server (dev_rules)
        try {
            const { text: localRules, ruleKeys } = PromptComposer.loadAgentRulesWithKeys();
            const { text: serverRules } = PromptComposer.loadServerPromptTemplates(ruleKeys);
            if (localRules) { parts.push(localRules); }
            if (serverRules) { parts.push(serverRules); }
            // Reference tracking: local rules
            for (const key of ruleKeys) {
                references.push({ type: 'local_rule', name: key, source: 'local' });
            }
            // Reference tracking: server rules
            for (const rule of PromptComposer.getLastIncludedServerRuleKeys()) {
                references.push({ type: 'server_rule', name: rule.title, source: 'server' });
            }
            // Reference tracking: recommended skills only (when candidateSkillKeys exist)
            if (candidateSkillKeys && candidateSkillKeys.length > 0) {
                for (const skillKey of candidateSkillKeys) {
                    const skill = PromptComposer.getSkillDescriptions().find(s => s.key === skillKey);
                    if (skill) {
                        const refType = skill.source === 'server' ? 'server_skill' : 'local_skill';
                        references.push({ type: refType, name: skill.key, source: skill.source || 'server' });
                    }
                }
            }

            // Skill description list + candidate hints recommended by main agent
            const skillDescriptions = PromptComposer.getSkillDescriptions();
            if (skillDescriptions.length > 0) {
                const candidateHint = candidateSkillKeys && candidateSkillKeys.length > 0
                    ? `\n\n**Recommended skills (determined as needed for this task by the main agent):** ${candidateSkillKeys.join(', ')}\nLoad recommended skills first using load_skill. Other skills can also be loaded if needed.`
                    : '';
                parts.push(`## Available Skills\nLoad the skills below using the load_skill tool if needed.\n${skillDescriptions.map(s => `- ${s.key}: ${s.description}`).join('\n')}${candidateHint}`);
            }
        } catch (e) {
            console.warn('[OrchestrationRouter] Failed to load Skills:', e);
        }

        // 2. Hot Load -- excluded from sub-agents (main agent only keyword->command mapping)

        // 2.5. Error correction guide (also applies to sub-agents/repair agents)
        try {
            const { getErrorCorrectionGuide } = await import('../managers/context/prompts/base');
            parts.push(getErrorCorrectionGuide());
        } catch (e) {
            console.warn('[OrchestrationRouter] Failed to load error correction guide:', e);
        }

        // 3. MCP custom prompts
        try {
            const { MCPManager } = await import('../mcp/MCPManager');
            const mcpServers = MCPManager.getInstance().getServers() as McpServerInfo[];
            const mcpParts = mcpServers
                .filter(s => s.enabled && s.customPrompt?.trim())
                .map(s => `**[MCP: ${s.name}]**\n${s.customPrompt!.trim()}`);
            if (mcpParts.length > 0) {
                parts.push(`## MCP Tool Usage Guidelines\n\n${mcpParts.join('\n\n')}`);
            }
        } catch (e) {
            console.warn('[OrchestrationRouter] Failed to load MCP prompts:', e);
        }

        // 4. Framework rules
        try {
            const cm = ContextManager.getInstance();
            const frameworkRules = await cm.getFrameworkRulesPrompt();
            if (frameworkRules) { parts.push(frameworkRules); }
        } catch (e) {
            console.warn('[OrchestrationRouter] Failed to load framework rules:', e);
        }

        // 5. RAG context -- for sub-agents: search by each subtask description to include only relevant docs
        // (Using subtask title instead of original userQuery would be more accurate, but currently searches with original query)
        try {
            const { AuthService } = await import('../../services/auth/AuthService');
            const auth = AuthService.getInstance();
            if (auth.isLoggedIn() && userQuery) {
                const userInfo = auth.getUserInfo();
                const orgId = userInfo?.organization_id;
                const { CodePilotApiClient } = await import('../../services/api/CodePilotApiClient');
                let ragProjectId: string | undefined;
                try {
                    const { SettingsManager: RagSettingsMgr } = await import('../managers/state/SettingsManager');
                    ragProjectId = RagSettingsMgr.getInstance()?.context?.globalState?.get<string>('codepilot.projectId') || undefined;
                } catch { }
                console.log(`[OrchestrationRouter] RAG: 검색 시작 (query: "${userQuery.substring(0, 50)}...", orgId: ${orgId}, projectId: ${ragProjectId || 'none'})`);
                const ragRaw = await CodePilotApiClient.getInstance().searchRag(
                    userQuery, orgId || undefined, undefined, 3, ragProjectId || undefined,
                ) as RagResult[] | { data?: RagResult[]; results?: RagResult[] };
                const ragResults: RagResult[] = Array.isArray(ragRaw)
                    ? ragRaw
                    : ((ragRaw as { data?: RagResult[]; results?: RagResult[] }).data || (ragRaw as { data?: RagResult[]; results?: RagResult[] }).results || []);
                // Include only results with similarity >= 75% (filter out irrelevant documents)
                const filteredRag = ragResults.filter(r => !r.similarity || r.similarity >= 0.75);
                if (filteredRag.length > 0) {
                    console.log(`[OrchestrationRouter] RAG: ${filteredRag.length}/${ragResults.length}개 문서 청크 포함 (유사도 75%+)`);
                    const ragText = filteredRag
                        .map((r, i) => {
                            const source = r.source_name || r.source || '';
                            const doc = r.document_name || r.document || '';
                            const sim = r.similarity != null ? ` (similarity: ${(r.similarity * 100).toFixed(0)}%)` : '';
                            return `[Document ${i + 1}] ${source} > ${doc}${sim}\n${r.content}`;
                        })
                        .join('\n\n---\n\n');
                    parts.push(`## Reference Documents (RAG) -- Must be used with priority\n${ragText}`);
                    // RAG reference tracking
                    for (const r of filteredRag) {
                        references.push({
                            type: 'rag',
                            name: r.document_name || r.document || 'unknown',
                            source: r.source_name || r.source || '',
                            similarity: r.similarity != null ? r.similarity : undefined,
                        });
                    }
                } else {
                    console.log(`[OrchestrationRouter] RAG: 검색 결과 없음 (0건, raw type=${typeof ragRaw}, isArray=${Array.isArray(ragRaw)}, keys=${ragRaw && typeof ragRaw === 'object' ? Object.keys(ragRaw).join(',') : 'N/A'}, ragResults=${ragResults.length})`);
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
     * Use LLM to consolidate multiple agent results into a single natural language summary
     * Generate in a user-friendly format similar to a single agent's final response
     */
    private static async generateUnifiedSummary(
        merged: AggregatedResult,
        userQuery: string,
        validation?: { validated: boolean; testPassed: boolean; repairAttempts: number },
    ): Promise<string> {
        const llm = LLMManager.getInstance();

        const systemPrompt = `You are a coding assistant. Write a single unified response from the results of multiple agents' work.

Rules:
- Write a completion response to the user's original request
- Summarize what was done concisely (1-3 paragraphs)
- When providing usage instructions, include the project run commands below in \`\`\`bash code blocks (a Run button will be auto-generated)
- Use markdown format
- **CRITICAL: ALL text MUST be written in Korean (한국어). Headings, explanations, summaries — everything in Korean. Code, file paths, CLI commands are the only exceptions.**
- Do not use the word "agent" -- write as if a single assistant performed all the work
- Build/test result: ${validation?.validated ? (validation.testPassed ? 'passed' : 'failed') : 'not verified'}
- **File paths, line numbers, symbol lists, etc. specified in each task's details are already verified results. Trust and use them as-is. Never re-query or re-search them.**

File content rules (very important):
- **Never include entire source code** -- file change history is already displayed in the IDE panel
- Only briefly mention file names and what was changed
- Only quote essential parts (3-5 lines max) when code snippets are absolutely necessary

Code block rules:
- \`\`\`bash or \`\`\`sh code blocks should only contain **commands directly executable in terminal** (e.g., npm install, npm run dev, git clone, etc.)
- Source code snippets in JSX, TSX, TypeScript, JavaScript, etc. must use the appropriate language tag (e.g., \`\`\`tsx, \`\`\`typescript, \`\`\`jsx)
- Short code references should use inline code (\`)
- Never put non-executable code in \`\`\`bash blocks`;

        const agentSummaries = merged.summary || '(no summary)';
        const fileList = [
            ...merged.createdFiles.map(f => `Created: ${f}`),
            ...merged.modifiedFiles.map(f => `Modified: ${f}`),
            ...merged.deletedFiles.map(f => `Deleted: ${f}`),
        ].join('\n');

        // Collect project run commands
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
                    buildCommandsInfo = `\n\nProject run commands:\n${cmds}`;
                }
            }
        } catch { }

        const userMessage = `User request: ${userQuery}

File changes performed:
${fileList || '(none)'}

Details of each task:
${agentSummaries}${buildCommandsInfo}

Based on the above, write a unified completion response to deliver to the user.`;

        const response = await llm.sendMessageWithSystemPrompt(
            systemPrompt,
            [{ text: userMessage }],
        );

        // Remove thinking tags
        return response.replace(THINKING_TAG_REGEX, '').trim();
    }

    private static formatMergedResult(
        result: AggregatedResult,
        validation?: { validated: boolean; testPassed: boolean; repairAttempts: number },
        unifiedSummary?: string,
    ): string {
        const lines: string[] = [];

        // Display in single agent style if unified summary is available
        if (unifiedSummary) {
            lines.push(unifiedSummary);
        } else {
            // Fallback: use existing format when unified summary generation fails
            lines.push(`## Task Complete`);
            if (result.createdFiles.length > 0) {
                lines.push(`\n**Created files:** ${result.createdFiles.map(f => `\`${f}\``).join(', ')}`);
            }
            if (result.modifiedFiles.length > 0) {
                lines.push(`\n**Modified files:** ${result.modifiedFiles.map(f => `\`${f}\``).join(', ')}`);
            }
        }

        // Build/test validation results
        if (validation?.validated && !validation.testPassed) {
            lines.push(`\n> WARNING: Build/test validation failed`);
            if (validation.repairAttempts > 0) {
                lines.push(`> Unresolved after ${validation.repairAttempts} auto-repair attempt(s).`);
            }
        }

        if (result.errors.length > 0) {
            lines.push(`\n### Errors`);
            result.errors.forEach(e => lines.push(`- ${e.replace(/\[task-(\d+)\]/g, '[agent $1]')}`));
        }

        // Per-agent task details (collapsible)
        if (result.summary) {
            lines.push(`\n### 작업 상세`);
            lines.push(result.summary);
        }

        return lines.join('\n');
    }
}
