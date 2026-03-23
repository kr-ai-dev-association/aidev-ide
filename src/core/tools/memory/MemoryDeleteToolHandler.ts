/**
 * Memory Delete Tool Handler
 * 영속적 메모리 삭제 도구 핸들러
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
                message: 'name 파라미터가 필요합니다.',
                error: { code: 'INVALID_PARAMS', message: 'Missing name parameter' },
            };
        }

        try {
            const manager = MemoryManager.getInstance();
            await manager.remove(name);
            return {
                success: true,
                message: `메모리 삭제 완료: ${name}`,
            };
        } catch (error) {
            return {
                success: false,
                message: `메모리 삭제 실패: ${error}`,
                error: { code: 'DELETE_FAILED', message: String(error) },
            };
        }
    }

    getDescription(_toolUse: ToolUse): string {
        return `메모리 삭제: ${_toolUse.params.name || ''}`;
    }
}
