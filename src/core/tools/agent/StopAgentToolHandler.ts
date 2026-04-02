/**
 * StopAgent Tool Handler
 * Allows the AGENT mode LLM to stop a running background worker.
 * Claude Code reference: TaskStopTool.ts
 */

import { IToolHandler, ToolExecutionContext } from '../IToolHandler';
import { ToolUse, ToolResponse, Tool } from '../types';
import { getAgentTaskManager } from './SpawnAgentToolHandler';

export class StopAgentToolHandler implements IToolHandler {
    readonly name = Tool.STOP_AGENT;

    async execute(toolUse: ToolUse, context: ToolExecutionContext): Promise<ToolResponse> {
        const agentId = toolUse.params.agent_id;

        if (!agentId) {
            return {
                success: false,
                message: 'agent_id is required',
                error: { code: 'INVALID_PARAMS', message: 'agent_id must be provided' },
            };
        }

        const taskManager = getAgentTaskManager();
        const stopped = taskManager.stopTask(agentId);

        if (stopped) {
            return {
                success: true,
                message: `Worker ${agentId} has been stopped.`,
            };
        } else {
            return {
                success: false,
                message: `Worker ${agentId} not found or not running.`,
                error: { code: 'NOT_FOUND', message: `No running worker with id: ${agentId}` },
            };
        }
    }

    getDescription(toolUse: ToolUse): string {
        return `[stop_agent: ${toolUse.params.agent_id || ''}]`;
    }
}
