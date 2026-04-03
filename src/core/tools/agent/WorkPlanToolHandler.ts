/**
 * WorkPlan Tool Handler
 * AGENT 모드 전용 — LLM이 자율적으로 작업 계획을 생성/업데이트합니다.
 * 기존 작업큐 UI (updateTaskQueue)를 재사용합니다.
 *
 * Claude Code TodoWrite 참조:
 * - LLM이 복잡한 작업 시 자발적으로 계획 수립
 * - 매 턴 시스템 메시지에 현재 상태 주입 → 압축 후에도 계획 유지
 */

import { IToolHandler, ToolExecutionContext } from '../IToolHandler';
import { ToolUse, ToolResponse, Tool } from '../types';
import { WebviewBridge } from '../../webview/WebviewBridge';

export interface WorkPlanTask {
    id: string;
    title: string;
    status: 'pending' | 'in_progress' | 'done';
}

// 현재 세션의 work_plan 상태 (AGENT 모드 루프 내에서 유지)
let currentTasks: WorkPlanTask[] = [];

export class WorkPlanToolHandler implements IToolHandler {
    readonly name = Tool.WORK_PLAN;

    async execute(toolUse: ToolUse, context: ToolExecutionContext): Promise<ToolResponse> {
        const tasksRaw = toolUse.params.tasks || '[]';

        let tasks: Array<{ id: string; title: string; status?: string }>;
        try {
            tasks = typeof tasksRaw === 'string' ? JSON.parse(tasksRaw) : tasksRaw;
            if (!Array.isArray(tasks) || tasks.length === 0) {
                return {
                    success: false,
                    message: 'No tasks provided',
                    error: { code: 'INVALID_PARAMS', message: 'tasks must be a non-empty JSON array' }
                };
            }
        } catch (e) {
            return {
                success: false,
                message: 'Failed to parse tasks JSON',
                error: { code: 'PARSE_ERROR', message: String(e) }
            };
        }

        // Validate each task
        for (const task of tasks) {
            if (!task.id || !task.title) {
                return {
                    success: false,
                    message: `Invalid task: missing id or title`,
                    error: { code: 'INVALID_TASK', message: 'Each task must have id and title' }
                };
            }
        }

        // Update current tasks
        currentTasks = tasks.map(t => ({
            id: t.id,
            title: t.title,
            status: (t.status as WorkPlanTask['status']) || 'pending',
        }));

        // Convert to plan item format for existing task queue UI
        const planItems = currentTasks.map(t => ({
            id: t.id,
            title: t.title,
            status: t.status,
            kind: 'execution' as const,
        }));

        // Send to webview using existing updateTaskQueue
        const webview = context.webview;
        if (webview) {
            WebviewBridge.updateTaskQueue(webview, planItems);
        }

        const pendingCount = currentTasks.filter(t => t.status === 'pending').length;
        const inProgressCount = currentTasks.filter(t => t.status === 'in_progress').length;
        const doneCount = currentTasks.filter(t => t.status === 'done').length;

        const statusSummary = `작업 계획 업데이트: ${currentTasks.length}개 항목 (대기: ${pendingCount}, 진행: ${inProgressCount}, 완료: ${doneCount})`;

        console.log(`[WorkPlanToolHandler] ${statusSummary}`);

        return {
            success: true,
            message: statusSummary,
        };
    }

    getDescription(toolUse: ToolUse): string {
        return `[work_plan: 작업 계획 관리]`;
    }
}

/**
 * 현재 work_plan 상태를 텍스트로 반환 (시스템 메시지 주입용)
 */
export function getWorkPlanStatus(): string {
    if (currentTasks.length === 0) return '';

    const lines = currentTasks.map(t => {
        const marker = t.status === 'done' ? '[x]' : t.status === 'in_progress' ? '[>]' : '[ ]';
        return `${marker} ${t.title}`;
    });

    return `<work-plan>\n${lines.join('\n')}\n</work-plan>`;
}

/**
 * work_plan 상태 초기화 (새 세션/대화 시작 시)
 */
export function resetWorkPlan(): void {
    currentTasks = [];
}
