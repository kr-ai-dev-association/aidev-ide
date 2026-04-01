/**
 * Memory Save Tool Handler
 * Persistent memory save tool handler
 */

import { IToolHandler, ToolExecutionContext } from '../IToolHandler';
import { ToolUse, ToolResponse, Tool } from '../types';
import { MemoryManager, MemoryType } from '../../memory/MemoryManager';

const VALID_TYPES: MemoryType[] = ['user', 'feedback', 'project', 'reference'];

export class MemorySaveToolHandler implements IToolHandler {
    readonly name = Tool.MEMORY_SAVE;

    async execute(toolUse: ToolUse, _context: ToolExecutionContext): Promise<ToolResponse> {
        const { name, description, type, content } = toolUse.params;

        if (!name || !description || !type || !content) {
            return {
                success: false,
                message: 'All parameters (name, description, type, content) are required.',
                error: { code: 'INVALID_PARAMS', message: 'Missing required parameters' },
            };
        }

        const memType = type as MemoryType;
        if (!VALID_TYPES.includes(memType)) {
            return {
                success: false,
                message: `Invalid type: ${type}. Allowed values: ${VALID_TYPES.join(', ')}`,
                error: { code: 'INVALID_TYPE', message: `Invalid memory type: ${type}` },
            };
        }

        try {
            const manager = MemoryManager.getInstance();
            await manager.save({ name, description, type: memType, content });
            return {
                success: true,
                message: `Memory saved: ${name}`,
            };
        } catch (error) {
            return {
                success: false,
                message: `Memory save failed: ${error}`,
                error: { code: 'SAVE_FAILED', message: String(error) },
            };
        }
    }

    getDescription(_toolUse: ToolUse): string {
        return `Save memory: ${_toolUse.params.name || ''}`;
    }
}
