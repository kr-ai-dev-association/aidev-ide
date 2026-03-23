/**
 * Memory Save Tool Handler
 * 영속적 메모리 저장 도구 핸들러
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
                message: 'name, description, type, content 파라미터가 모두 필요합니다.',
                error: { code: 'INVALID_PARAMS', message: 'Missing required parameters' },
            };
        }

        const memType = type as MemoryType;
        if (!VALID_TYPES.includes(memType)) {
            return {
                success: false,
                message: `유효하지 않은 type: ${type}. 허용값: ${VALID_TYPES.join(', ')}`,
                error: { code: 'INVALID_TYPE', message: `Invalid memory type: ${type}` },
            };
        }

        try {
            const manager = MemoryManager.getInstance();
            await manager.save({ name, description, type: memType, content });
            return {
                success: true,
                message: `메모리 저장 완료: ${name}`,
            };
        } catch (error) {
            return {
                success: false,
                message: `메모리 저장 실패: ${error}`,
                error: { code: 'SAVE_FAILED', message: String(error) },
            };
        }
    }

    getDescription(_toolUse: ToolUse): string {
        return `메모리 저장: ${_toolUse.params.name || ''}`;
    }
}
