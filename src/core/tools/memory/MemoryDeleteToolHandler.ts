/**
 * Memory Delete Tool Handler
 * Persistent memory delete tool handler
 */

import { IToolHandler, ToolExecutionContext } from '../IToolHandler';
import { ToolUse, ToolResponse, Tool } from '../types';
import { MemoryManager } from '../../memory/MemoryManager';

export class MemoryDeleteToolHandler implements IToolHandler {
    readonly name = Tool.MEMORY_DELETE;

    async execute(toolUse: ToolUse, _context: ToolExecutionContext): Promise<ToolResponse> {
        const { name } = toolUse.params;

        if (!name) {
            return {
                success: false,
                message: 'name parameter is required.',
                error: { code: 'INVALID_PARAMS', message: 'Missing name parameter' },
            };
        }

        try {
            const manager = MemoryManager.getInstance();
            await manager.remove(name);
            return {
                success: true,
                message: `Memory deleted: ${name}`,
            };
        } catch (error) {
            return {
                success: false,
                message: `Memory delete failed: ${error}`,
                error: { code: 'DELETE_FAILED', message: String(error) },
            };
        }
    }

    getDescription(_toolUse: ToolUse): string {
        return `Delete memory: ${_toolUse.params.name || ''}`;
    }
}
