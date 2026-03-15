/**
 * Tool Executor
 * 툴을 실행하는 실행기
 *
 * A2: PreToolUse 검증 포함
 * - 위험 명령어 차단
 * - 프로젝트 외부 경로 차단
 * - 민감 파일 보호
 *
 * v10.1: 오케스트레이션 지원
 * - orchestration ON 시 읽기 도구 병렬 실행
 * - 쓰기 도구는 항상 순차 실행
 */

import { ToolUse, ToolResponse, Tool, READ_ONLY_TOOLS } from './types';
import { ToolExecutionContext } from './IToolHandler';
import { ToolRegistry } from './ToolRegistry';
import { PreToolUseValidator } from './PreToolUseValidator';
import { UsageMetricsManager } from '../managers/state/UsageMetricsManager';

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

        const usageMetrics = UsageMetricsManager.getInstance();
        const startTime = Date.now();

        try {
            console.log(`[ToolExecutor] Executing tool: ${toolUse.name}`);
            const result = await handler.execute(toolUse, context);
            const executionTime = Date.now() - startTime;

            // 도구 실행 메트릭 기록
            usageMetrics.recordToolExecution(toolUse.name, executionTime, result.success);
            console.log(`[ToolExecutor] Tool ${toolUse.name} completed: ${result.success ? 'success' : 'failed'} (${executionTime}ms)`);

            return result;
        } catch (error) {
            const executionTime = Date.now() - startTime;

            // 실패 메트릭 기록
            usageMetrics.recordToolExecution(toolUse.name, executionTime, false);
            console.error(`[ToolExecutor] Tool execution failed: ${toolUse.name} (${executionTime}ms)`, error);

            return {
                success: false,
                message: `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`,
                error: { code: 'EXECUTION_ERROR', message: error instanceof Error ? error.message : String(error) }
            };
        }
    }
    
    /**
     * 여러 툴 실행 (순차 또는 병렬)
     * orchestration ON 시 읽기 도구를 병렬 실행
     * @param onToolComplete 각 도구 실행 완료 시 호출되는 콜백 (실시간 UI 업데이트용)
     * @param onToolStart 각 도구 실행 시작 시 호출되는 콜백 (진행 상태 표시용)
     */
    async executeTools(
        toolUses: ToolUse[],
        context: ToolExecutionContext,
        onToolComplete?: (toolUse: ToolUse, result: ToolResponse, index: number) => void,
        onToolStart?: (toolUse: ToolUse, index: number) => void
    ): Promise<ToolResponse[]> {
        // 읽기 도구는 항상 병렬, 쓰기 도구는 순차 실행
        return this.executeToolsParallel(toolUses, context, onToolComplete, onToolStart);
    }

    /**
     * 순차 실행 (기존 동작 100% 보존)
     */
    private async executeToolsSequential(
        toolUses: ToolUse[],
        context: ToolExecutionContext,
        onToolComplete?: (toolUse: ToolUse, result: ToolResponse, index: number) => void,
        onToolStart?: (toolUse: ToolUse, index: number) => void
    ): Promise<ToolResponse[]> {
        const results: ToolResponse[] = [];

        for (let i = 0; i < toolUses.length; i++) {
            const toolUse = toolUses[i];

            if (onToolStart) {
                onToolStart(toolUse, i);
            }

            const result = await this.executeTool(toolUse, context);
            results.push(result);

            if (onToolComplete) {
                onToolComplete(toolUse, result, i);
            }

            if (!result.success && toolUse.name === Tool.RUN_COMMAND) {
                console.log(`[ToolExecutor] Command failed, stopping execution`);
                break;
            }
        }

        return results;
    }

    /**
     * 병렬 실행: 읽기 도구는 Promise.all, 쓰기 도구는 순차
     * 결과 배열은 원래 입력 순서를 유지
     */
    private async executeToolsParallel(
        toolUses: ToolUse[],
        context: ToolExecutionContext,
        onToolComplete?: (toolUse: ToolUse, result: ToolResponse, index: number) => void,
        onToolStart?: (toolUse: ToolUse, index: number) => void
    ): Promise<ToolResponse[]> {
        const results: (ToolResponse | undefined)[] = new Array(toolUses.length);

        // 도구를 읽기/쓰기로 분류 (원래 인덱스 보존)
        const readBatch: { toolUse: ToolUse; idx: number }[] = [];
        const writeBatch: { toolUse: ToolUse; idx: number }[] = [];

        for (let i = 0; i < toolUses.length; i++) {
            if (READ_ONLY_TOOLS.has(toolUses[i].name)) {
                readBatch.push({ toolUse: toolUses[i], idx: i });
            } else {
                writeBatch.push({ toolUse: toolUses[i], idx: i });
            }
        }

        console.log(`[ToolExecutor] Parallel mode: ${readBatch.length} read-only, ${writeBatch.length} write tools`);

        // Phase 1: 읽기 도구 병렬 실행 (부분 실패 허용 — Promise.allSettled)
        if (readBatch.length > 0) {
            const settled = await Promise.allSettled(readBatch.map(async ({ toolUse, idx }) => {
                if (onToolStart) {
                    onToolStart(toolUse, idx);
                }

                const result = await this.executeTool(toolUse, context);
                results[idx] = result;

                if (onToolComplete) {
                    onToolComplete(toolUse, result, idx);
                }
            }));
            settled.forEach((s) => {
                if (s.status === 'rejected') {
                    console.warn(`[ToolExecutor] Parallel read tool failed:`, s.reason);
                }
            });
        }

        // Phase 2: 쓰기 도구 순차 실행
        for (const { toolUse, idx } of writeBatch) {
            if (onToolStart) {
                onToolStart(toolUse, idx);
            }

            const result = await this.executeTool(toolUse, context);
            results[idx] = result;

            if (onToolComplete) {
                onToolComplete(toolUse, result, idx);
            }

            if (!result.success && toolUse.name === Tool.RUN_COMMAND) {
                console.log(`[ToolExecutor] Command failed in parallel mode, stopping write execution`);
                break;
            }
        }

        // undefined 슬롯을 에러 응답으로 채워 인덱스 매핑 보존
        return results.map((r, i) => r ?? {
            success: false,
            message: `Tool ${toolUses[i]?.name || 'unknown'} was skipped (previous command failure)`,
            error: { code: 'SKIPPED', message: 'Skipped due to prior failure in write batch' }
        });
    }
}

