/**
 * SpawnAgent Tool Handler
 * Allows the AGENT mode LLM to spawn worker sub-agents for parallel task execution.
 * Claude Code reference: AgentTool.tsx, runAgent.ts
 *
 * Workers run SubAgentLoop independently and report results via AgentTaskManager.
 * Supports both sync (blocking) and async (background) execution.
 */

import { IToolHandler, ToolExecutionContext } from '../IToolHandler';
import { ToolUse, ToolResponse, Tool } from '../types';
import { SubAgentLoop } from '../../orchestration/SubAgentLoop';
import { AgentTaskManager } from '../../orchestration/AgentTaskManager';
import { SubTask, AgentLoopCallbacks } from '../../orchestration/types';
import { SettingsManager } from '../../managers/state/SettingsManager';
import { ToolExecutionCoordinator } from '../../managers/conversation/handlers/ToolExecutionCoordinator';
import { WebviewBridge } from '../../webview/WebviewBridge';

// Singleton task manager shared across spawn_agent calls within a session
let _taskManager: AgentTaskManager | null = null;

export function getAgentTaskManager(): AgentTaskManager {
    if (!_taskManager) {
        _taskManager = new AgentTaskManager();
    }
    return _taskManager;
}

export function resetAgentTaskManager(): void {
    _taskManager = null;
}

export class SpawnAgentToolHandler implements IToolHandler {
    readonly name = Tool.SPAWN_AGENT;

    async execute(toolUse: ToolUse, context: ToolExecutionContext): Promise<ToolResponse> {
        const description = toolUse.params.description || '(no description)';
        const prompt = toolUse.params.prompt || '';
        const runInBackground = String(toolUse.params.run_in_background) === 'true';

        if (!prompt.trim()) {
            return {
                success: false,
                message: 'prompt is required',
                error: { code: 'INVALID_PARAMS', message: 'prompt must not be empty' },
            };
        }

        const taskManager = getAgentTaskManager();
        const agentId = taskManager.generateId();

        // Build subtask for SubAgentLoop
        const subtask: SubTask = {
            id: agentId,
            title: description,
            description: prompt,
            dependencies: [],
            toolPermission: 'full', // AGENT mode workers always have full access
        };

        // Load settings
        let useStreaming = false;
        let thinkingEnabled = true;
        let stateManager: any;
        try {
            const settingsMgr = SettingsManager.getInstance();
            useStreaming = await settingsMgr.isStreamingEnabled();
            thinkingEnabled = await settingsMgr.isThinkingEnabled();
        } catch { /* defaults */ }

        // Build callbacks for UI feedback
        const callbacks: AgentLoopCallbacks = {
            onToolStart: (toolUseItem: any) => {
                if (context.webview) {
                    ToolExecutionCoordinator.sendToolStartStatus(context.webview, toolUseItem);
                }
            },
            onToolComplete: (toolUseItem: any, toolResult: any) => {
                if (context.webview) {
                    ToolExecutionCoordinator.sendSingleToolResultToUI(context.webview, toolUseItem, toolResult);
                }
            },
            onStreamingStatus: (statusMsg: string) => {
                if (context.webview) {
                    WebviewBridge.sendProcessingStatus(context.webview, 'executing', statusMsg);
                }
            },
        };

        // SubAgentLoop expects full ToolExecutionContext
        const workerToolContext = {
            ...context,
            conversationTurnId: `spawn_${agentId}`,
        };

        const agentOptions = {
            disableReadDedup: false,
            isRepairAgent: false,
            isAgentMode: true,
        };

        console.log(`[SpawnAgentToolHandler] Spawning worker: ${agentId} — "${description}" (background=${runInBackground})`);

        if (runInBackground) {
            // Async execution: register and return immediately
            const abortController = taskManager.registerTask(agentId, description);

            // Fire-and-forget worker execution
            const agent = new SubAgentLoop(
                subtask,
                workerToolContext,
                abortController.signal as any, // AbortSignal
                '', // projectContext
                callbacks,
                '', // rulesContext
                useStreaming,
                thinkingEnabled,
                agentOptions,
                stateManager,
            );

            agent.run().then(result => {
                taskManager.completeTask(agentId, result);
            }).catch(error => {
                if (error?.name === 'AbortError') {
                    // Already handled by stopTask
                } else {
                    taskManager.failTask(agentId, String(error));
                }
            });

            return {
                success: true,
                message: `Worker "${description}" launched in background (id: ${agentId}). You will receive a <task-notification> when it completes.`,
                data: { agentId, status: 'async_launched' },
            };
        } else {
            // Sync execution: run and wait for result
            if (context.webview) {
                WebviewBridge.sendProcessingStep(context.webview, 'executing');
                WebviewBridge.sendProcessingStatus(context.webview, 'executing', `에이전트 "${description}" 실행 중...`);
            }

            const agent = new SubAgentLoop(
                subtask,
                workerToolContext,
                undefined, // no abort for sync
                '', // projectContext
                callbacks,
                '', // rulesContext
                useStreaming,
                thinkingEnabled,
                agentOptions,
                stateManager,
            );

            try {
                const result = await agent.run();

                const filesSummary = [
                    ...result.createdFiles.map(f => `Created: ${f}`),
                    ...result.modifiedFiles.map(f => `Modified: ${f}`),
                ].join('\n');

                const summary = result.completionSummary || result.response?.substring(0, 1000) || '(no summary)';

                return {
                    success: result.success,
                    message: `Worker "${description}" completed.\n\nSummary:\n${summary}\n\nFiles:\n${filesSummary || '(none)'}`,
                    data: {
                        agentId,
                        status: 'completed',
                        summary,
                        createdFiles: result.createdFiles,
                        modifiedFiles: result.modifiedFiles,
                        errors: result.errors,
                        turnCount: result.turnCount,
                    },
                };
            } catch (error) {
                return {
                    success: false,
                    message: `Worker "${description}" failed: ${error}`,
                    error: { code: 'AGENT_FAILED', message: String(error) },
                };
            }
        }
    }

    getDescription(toolUse: ToolUse): string {
        return `[spawn_agent: ${toolUse.params.description || ''}]`;
    }
}
