/**
 * Tool Executor
 * 툴을 실행하는 실행기
 *
 * A2: PreToolUse 검증 포함
 * - 위험 명령어 차단
 * - 프로젝트 외부 경로 차단
 * - 민감 파일 보호
 */

import { ToolUse, ToolResponse, Tool } from './types';
import { ToolExecutionContext } from './IToolHandler';
import { ToolRegistry } from './ToolRegistry';
import { PreToolUseValidator } from './PreToolUseValidator';

export class ToolExecutor {
    private registry: ToolRegistry;

    constructor() {
        this.registry = ToolRegistry.getInstance();
    }

    /**
     * 툴 실행
     */
    async executeTool(
        toolUse: ToolUse,
        context: ToolExecutionContext
    ): Promise<ToolResponse> {
        // A2: PreToolUse 검증
        const validation = PreToolUseValidator.validate(toolUse, context.projectRoot);
        if (!validation.allowed) {
            console.warn(`[ToolExecutor] Tool blocked by PreToolUseValidator: ${toolUse.name} - ${validation.reason}`);
            return {
                success: false,
                message: validation.reason || 'Tool execution blocked',
                error: { code: 'BLOCKED_BY_VALIDATOR', message: validation.reason || 'Blocked' }
            };
        }

        if (validation.severity === 'warning') {
            console.warn(`[ToolExecutor] Tool warning: ${toolUse.name} - ${validation.reason}`);
        }

        const handler = this.registry.getHandler(toolUse.name);

        if (!handler) {
            return {
                success: false,
                message: `Unknown tool: ${toolUse.name}`,
                error: { code: 'UNKNOWN_TOOL', message: `Tool ${toolUse.name} is not registered` }
            };
        }

        try {
            console.log(`[ToolExecutor] Executing tool: ${toolUse.name}`);
            const result = await handler.execute(toolUse, context);
            console.log(`[ToolExecutor] Tool ${toolUse.name} completed: ${result.success ? 'success' : 'failed'}`);

            return result;
        } catch (error) {
            console.error(`[ToolExecutor] Tool execution failed: ${toolUse.name}`, error);

            return {
                success: false,
                message: `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`,
                error: { code: 'EXECUTION_ERROR', message: error instanceof Error ? error.message : String(error) }
            };
        }
    }
    
    /**
     * 여러 툴 순차 실행
     * @param onToolComplete 각 도구 실행 완료 시 호출되는 콜백 (실시간 UI 업데이트용)
     */
    async executeTools(
        toolUses: ToolUse[],
        context: ToolExecutionContext,
        onToolComplete?: (toolUse: ToolUse, result: ToolResponse, index: number) => void
    ): Promise<ToolResponse[]> {
        const results: ToolResponse[] = [];

        for (let i = 0; i < toolUses.length; i++) {
            const toolUse = toolUses[i];
            const result = await this.executeTool(toolUse, context);
            results.push(result);

            // 🔥 도구 실행 완료 시 콜백 호출 (실시간 UI 업데이트)
            if (onToolComplete) {
                onToolComplete(toolUse, result, i);
            }

            // 실패 시 중단 여부 결정 (필요에 따라)
            if (!result.success && toolUse.name === Tool.RUN_COMMAND) {
                // 명령어 실패 시 중단
                console.log(`[ToolExecutor] Command failed, stopping execution`);
                break;
            }
        }

        return results;
    }
}

