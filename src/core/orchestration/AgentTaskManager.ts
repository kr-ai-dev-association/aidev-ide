/**
 * AgentTaskManager
 * Manages async worker agents spawned by the main AGENT mode loop.
 * Claude Code reference: LocalAgentTask.tsx, Task.ts
 *
 * - Tracks running/completed/failed/killed workers
 * - Collects task-notification XML for injection into LLM context
 * - Provides waitForAnyTaskCompletion() for the main loop to await worker results
 */

import { AgentLoopResult } from './types';

export interface AgentTask {
    id: string;
    description: string;
    status: 'running' | 'completed' | 'failed' | 'killed';
    startTime: number;
    endTime?: number;
    result?: AgentLoopResult;
    error?: string;
    abortController: AbortController;
}

interface TaskNotification {
    taskId: string;
    description: string;
    status: 'completed' | 'failed' | 'killed';
    summary: string;
    createdFiles: string[];
    modifiedFiles: string[];
    error?: string;
    durationMs: number;
    turnCount: number;
}

export class AgentTaskManager {
    private tasks = new Map<string, AgentTask>();
    private pendingNotifications: TaskNotification[] = [];
    private completionResolvers: Array<() => void> = [];
    private idCounter = 0;

    /**
     * Generate unique agent ID
     */
    generateId(): string {
        return `agent_${Date.now().toString(36)}_${++this.idCounter}`;
    }

    /**
     * Register a new async worker task
     */
    registerTask(id: string, description: string): AbortController {
        const abortController = new AbortController();
        this.tasks.set(id, {
            id,
            description,
            status: 'running',
            startTime: Date.now(),
            abortController,
        });
        console.log(`[AgentTaskManager] Task registered: ${id} — "${description}"`);
        return abortController;
    }

    /**
     * Mark task as completed and generate notification
     */
    completeTask(id: string, result: AgentLoopResult): void {
        const task = this.tasks.get(id);
        if (!task) return;

        task.status = 'completed';
        task.endTime = Date.now();
        task.result = result;

        this.pendingNotifications.push({
            taskId: id,
            description: task.description,
            status: 'completed',
            summary: result.completionSummary || result.response?.substring(0, 500) || '(no summary)',
            createdFiles: result.createdFiles,
            modifiedFiles: result.modifiedFiles,
            durationMs: task.endTime - task.startTime,
            turnCount: result.turnCount,
        });

        console.log(`[AgentTaskManager] Task completed: ${id} (${task.endTime - task.startTime}ms)`);
        this.notifyCompletionWaiters();
    }

    /**
     * Mark task as failed and generate notification
     */
    failTask(id: string, error: string): void {
        const task = this.tasks.get(id);
        if (!task) return;

        task.status = 'failed';
        task.endTime = Date.now();
        task.error = error;

        this.pendingNotifications.push({
            taskId: id,
            description: task.description,
            status: 'failed',
            summary: error,
            createdFiles: [],
            modifiedFiles: [],
            error,
            durationMs: task.endTime - task.startTime,
            turnCount: 0,
        });

        console.log(`[AgentTaskManager] Task failed: ${id} — ${error}`);
        this.notifyCompletionWaiters();
    }

    /**
     * Stop (kill) a running task
     */
    stopTask(id: string): boolean {
        const task = this.tasks.get(id);
        if (!task || task.status !== 'running') return false;

        task.abortController.abort();
        task.status = 'killed';
        task.endTime = Date.now();

        this.pendingNotifications.push({
            taskId: id,
            description: task.description,
            status: 'killed',
            summary: '사용자 또는 코디네이터에 의해 중단됨',
            createdFiles: [],
            modifiedFiles: [],
            durationMs: task.endTime - task.startTime,
            turnCount: 0,
        });

        console.log(`[AgentTaskManager] Task killed: ${id}`);
        this.notifyCompletionWaiters();
        return true;
    }

    /**
     * Get all pending notifications as XML and clear the queue
     * Claude Code reference: <task-notification> XML format
     */
    consumePendingNotifications(): string[] {
        const notifications = this.pendingNotifications.map(n => {
            const filesSection = (n.createdFiles.length > 0 || n.modifiedFiles.length > 0)
                ? `\n<files>${n.createdFiles.map(f => `\n  <created>${f}</created>`).join('')}${n.modifiedFiles.map(f => `\n  <modified>${f}</modified>`).join('')}\n</files>`
                : '';
            const errorSection = n.error ? `\n<error>${n.error}</error>` : '';

            return `<task-notification>
<task-id>${n.taskId}</task-id>
<description>${n.description}</description>
<status>${n.status}</status>
<summary>${n.summary}</summary>${filesSection}${errorSection}
<duration_ms>${n.durationMs}</duration_ms>
<turn_count>${n.turnCount}</turn_count>
</task-notification>`;
        });

        this.pendingNotifications = [];
        return notifications;
    }

    /**
     * Check if there are running tasks
     */
    hasRunningTasks(): boolean {
        for (const task of this.tasks.values()) {
            if (task.status === 'running') return true;
        }
        return false;
    }

    /**
     * Get running task count
     */
    getRunningTaskCount(): number {
        let count = 0;
        for (const task of this.tasks.values()) {
            if (task.status === 'running') count++;
        }
        return count;
    }

    /**
     * Get all tasks info (for UI display)
     */
    getTasksSummary(): Array<{ id: string; description: string; status: string; durationMs?: number }> {
        return Array.from(this.tasks.values()).map(t => ({
            id: t.id,
            description: t.description,
            status: t.status,
            durationMs: t.endTime ? t.endTime - t.startTime : Date.now() - t.startTime,
        }));
    }

    /**
     * Wait for any task to complete (used by main loop when no tools but workers running)
     */
    waitForAnyTaskCompletion(timeoutMs: number = 60000): Promise<void> {
        if (this.pendingNotifications.length > 0) {
            return Promise.resolve();
        }
        if (!this.hasRunningTasks()) {
            return Promise.resolve();
        }

        return new Promise<void>((resolve) => {
            const timer = setTimeout(() => {
                const idx = this.completionResolvers.indexOf(resolve);
                if (idx >= 0) this.completionResolvers.splice(idx, 1);
                resolve();
            }, timeoutMs);

            this.completionResolvers.push(() => {
                clearTimeout(timer);
                resolve();
            });
        });
    }

    /**
     * Notify all waiters that a task completed
     */
    private notifyCompletionWaiters(): void {
        const resolvers = [...this.completionResolvers];
        this.completionResolvers = [];
        resolvers.forEach(r => r());
    }

    /**
     * Get all created/modified files from all completed tasks
     */
    getAllFileChanges(): { createdFiles: string[]; modifiedFiles: string[] } {
        const created = new Set<string>();
        const modified = new Set<string>();
        for (const task of this.tasks.values()) {
            if (task.result) {
                task.result.createdFiles.forEach(f => created.add(f));
                task.result.modifiedFiles.forEach(f => modified.add(f));
            }
        }
        return { createdFiles: [...created], modifiedFiles: [...modified] };
    }
}
