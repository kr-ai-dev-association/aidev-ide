/**
 * Task Scheduler
 * 작업 우선순위 스케줄링을 담당하는 클래스
 */

import {
    Task,
    TaskStatus,
    Priority,
    TaskExecutionContext,
    TaskHandler,
    TaskResult
} from './types';
import { TaskQueue } from './TaskQueue';

export class TaskScheduler {
    private queue: TaskQueue;
    private handlers: Map<string, TaskHandler> = new Map();
    private maxConcurrent: number = 3;
    private runningTasks: Set<string> = new Set();
    private isProcessing: boolean = false;

    constructor(queue: TaskQueue, maxConcurrent: number = 3) {
        this.queue = queue;
        this.maxConcurrent = maxConcurrent;
    }

    /**
     * 작업 핸들러를 등록합니다
     */
    public registerHandler(type: string, handler: TaskHandler): void {
        this.handlers.set(type, handler);
        console.log(`[TaskScheduler] Registered handler for type: ${type}`);
    }

    /**
     * 스케줄러를 시작합니다
     */
    public start(): void {
        if (this.isProcessing) {
            console.warn('[TaskScheduler] Already processing');
            return;
        }

        this.isProcessing = true;
        this.processQueue();
        console.log('[TaskScheduler] Started');
    }

    /**
     * 스케줄러를 중지합니다
     */
    public stop(): void {
        this.isProcessing = false;
        console.log('[TaskScheduler] Stopped');
    }

    /**
     * 큐를 처리합니다
     */
    private async processQueue(): Promise<void> {
        while (this.isProcessing) {
            // 동시 실행 가능한 작업 수 확인
            if (this.runningTasks.size >= this.maxConcurrent) {
                await this.sleep(100);
                continue;
            }

            // 다음 작업 가져오기
            const task = this.queue.dequeue();
            if (!task) {
                await this.sleep(500);
                continue;
            }

            // 의존성 확인
            if (task.dependencies && task.dependencies.length > 0) {
                const allDepsCompleted = task.dependencies.every(depId => {
                    const depTask = this.queue.get(depId);
                    return depTask && depTask.status === TaskStatus.COMPLETED;
                });

                if (!allDepsCompleted) {
                    // 의존성이 완료되지 않았으면 다시 큐에 추가 (나중에 재시도)
                    await this.sleep(1000);
                    continue;
                }
            }

            // 작업 실행
            this.executeTask(task);
        }
    }

    /**
     * 작업을 실행합니다
     */
    private async executeTask(task: Task): Promise<void> {
        this.runningTasks.add(task.id);
        this.updateTaskStatus(task.id, TaskStatus.IN_PROGRESS);

        const handler = this.handlers.get(task.type);
        if (!handler) {
            console.error(`[TaskScheduler] No handler for task type: ${task.type}`);
            this.updateTaskStatus(task.id, TaskStatus.FAILED, {
                code: 'NO_HANDLER',
                message: `No handler registered for type: ${task.type}`,
                recoverable: false
            });
            this.runningTasks.delete(task.id);
            return;
        }

        // AbortController 생성
        const abortController = new AbortController();
        const timeout = task.metadata?.timeout || 300000; // 기본 5분

        // 타임아웃 설정
        const timeoutHandle = setTimeout(() => {
            abortController.abort();
            console.warn(`[TaskScheduler] Task ${task.id} timed out after ${timeout}ms`);
        }, timeout);

        try {
            // 진행률 콜백
            const onProgress = (progress: any) => {
                const taskObj = this.queue.get(task.id);
                if (taskObj) {
                    taskObj.progress = progress;
                }
            };

            // 로그 콜백
            const onLog = (message: string) => {
                console.log(`[TaskScheduler] Task ${task.id}: ${message}`);
            };

            // 실행 컨텍스트 생성
            const context: TaskExecutionContext = {
                task,
                signal: abortController.signal,
                onProgress,
                onLog
            };

            // 작업 실행
            const startTime = Date.now();
            const result = await handler(context);
            const duration = Date.now() - startTime;

            clearTimeout(timeoutHandle);

            // 결과 저장
            task.result = {
                ...result,
                duration
            };
            task.completedAt = Date.now();

            // 상태 업데이트
            if (result.success) {
                this.updateTaskStatus(task.id, TaskStatus.COMPLETED);
            } else {
                // TaskResult에 error가 없으므로 기본 에러 생성
                this.updateTaskStatus(task.id, TaskStatus.FAILED, {
                    code: 'TASK_FAILED',
                    message: result.message || 'Task execution failed',
                    recoverable: true
                });
            }

            console.log(`[TaskScheduler] Task ${task.id} completed in ${duration}ms`);

        } catch (error) {
            clearTimeout(timeoutHandle);

            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`[TaskScheduler] Task ${task.id} failed:`, errorMessage);

            this.updateTaskStatus(task.id, TaskStatus.FAILED, {
                code: 'EXECUTION_ERROR',
                message: errorMessage,
                stack: error instanceof Error ? error.stack : undefined,
                recoverable: true
            });

        } finally {
            this.runningTasks.delete(task.id);
        }
    }

    /**
     * 작업 상태를 업데이트합니다
     */
    private updateTaskStatus(
        taskId: string,
        status: TaskStatus,
        error?: any
    ): void {
        const task = this.queue.get(taskId);
        if (task) {
            task.status = status;
            if (status === TaskStatus.IN_PROGRESS && !task.startedAt) {
                task.startedAt = Date.now();
            }
            if (error) {
                task.error = error;
            }
        }
    }

    /**
     * 작업을 일시정지합니다
     */
    public pauseTask(taskId: string): boolean {
        const task = this.queue.get(taskId);
        if (task && task.status === TaskStatus.IN_PROGRESS) {
            task.status = TaskStatus.PAUSED;
            this.runningTasks.delete(taskId);
            console.log(`[TaskScheduler] Paused task: ${taskId}`);
            return true;
        }
        return false;
    }

    /**
     * 작업을 재개합니다
     */
    public resumeTask(taskId: string): boolean {
        const task = this.queue.get(taskId);
        if (task && task.status === TaskStatus.PAUSED) {
            task.status = TaskStatus.PENDING;
            console.log(`[TaskScheduler] Resumed task: ${taskId}`);
            return true;
        }
        return false;
    }

    /**
     * 작업을 취소합니다
     */
    public cancelTask(taskId: string): boolean {
        const task = this.queue.get(taskId);
        if (task && (task.status === TaskStatus.PENDING || task.status === TaskStatus.PAUSED)) {
            task.status = TaskStatus.CANCELLED;
            this.runningTasks.delete(taskId);
            console.log(`[TaskScheduler] Cancelled task: ${taskId}`);
            return true;
        }
        return false;
    }

    /**
     * 최대 동시 실행 수를 설정합니다
     */
    public setMaxConcurrent(max: number): void {
        this.maxConcurrent = max;
        console.log(`[TaskScheduler] Max concurrent tasks set to ${max}`);
    }

    /**
     * 현재 실행 중인 작업 수를 가져옵니다
     */
    public getRunningCount(): number {
        return this.runningTasks.size;
    }

    /**
     * 대기
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

