/**
 * Task Manager
 * 비동기 작업 큐를 관리하는 메인 매니저
 */

import {
    Task,
    TaskType,
    TaskStatus,
    Priority,
    TaskResult,
    TaskFilter,
    TaskStats,
    TaskEvent,
    TaskEventData,
    TaskEventListener,
    RetryStrategy,
    TaskQueueConfig
} from './types';
import { TaskQueue } from './TaskQueue';
import { TaskScheduler } from './TaskScheduler';
import { TaskRetry } from './TaskRetry';
import * as vscode from 'vscode';

// PlanQueueService 호환 타입
export type PlanItemStatus = 'pending' | 'in_progress' | 'done' | 'failed' | 'skipped';

export interface PlanItem {
    id: string;
    title: string;
    detail?: string;
    status: PlanItemStatus;
    createdAt: number;
}

export interface PlanQueue {
    id: string;
    title: string;
    createdAt: number;
    items: PlanItem[];
}

export class TaskManager {
    private static instance: TaskManager;
    private queue: TaskQueue;
    private scheduler: TaskScheduler;
    private retry: TaskRetry;
    private config: TaskQueueConfig;
    private eventListeners: Map<TaskEvent, Set<TaskEventListener>> = new Map();
    private taskIdCounter = 0;
    
    // PlanQueueService 호환 기능
    private context?: vscode.ExtensionContext;
    private planQueues: PlanQueue[] = [];
    private currentPlanQueueId: string | undefined;
    private static PLAN_QUEUES_STORAGE_KEY = 'aidev-ide.planQueues.v2';

    private constructor() {
        this.queue = new TaskQueue();
        
        this.config = {
            maxConcurrent: 3,
            defaultPriority: Priority.NORMAL,
            defaultTimeout: 300000, // 5분
            retryStrategy: {
                maxRetries: 3,
                initialDelay: 1000,
                maxDelay: 30000,
                backoffMultiplier: 2,
                retryableErrors: []
            },
            persistTasks: false
        };

        this.scheduler = new TaskScheduler(this.queue, this.config.maxConcurrent);
        this.retry = new TaskRetry();
        this.retry.setDefaultStrategy(this.config.retryStrategy);

        // 이벤트 리스너 초기화
        Object.values(TaskEvent).forEach(event => {
            this.eventListeners.set(event, new Set());
        });

        console.log('[TaskManager] Initialized');
    }

    public static getInstance(context?: vscode.ExtensionContext): TaskManager {
        if (!TaskManager.instance) {
            TaskManager.instance = new TaskManager();
        }
        if (context && !TaskManager.instance.context) {
            TaskManager.instance.context = context;
            TaskManager.instance.loadPlanQueues();
        }
        return TaskManager.instance;
    }

    /**
     * 작업을 큐에 추가합니다
     */
    public enqueue(
        type: TaskType,
        title: string,
        options?: {
            description?: string;
            priority?: Priority;
            dependencies?: string[];
            metadata?: any;
            timeout?: number;
            maxRetries?: number;
        }
    ): string {
        const taskId = this.generateTaskId();
        const task: Task = {
            id: taskId,
            type,
            title,
            description: options?.description,
            priority: options?.priority || this.config.defaultPriority,
            status: TaskStatus.PENDING,
            dependencies: options?.dependencies,
            metadata: {
                ...options?.metadata,
                timeout: options?.timeout || this.config.defaultTimeout,
                maxRetries: options?.maxRetries || this.config.retryStrategy.maxRetries
            },
            createdAt: Date.now()
        };

        this.queue.enqueue(task);
        this.emitEvent(TaskEvent.ENQUEUED, task);

        console.log(`[TaskManager] Enqueued task: ${taskId} (${type}, priority: ${task.priority})`);

        return taskId;
    }

    /**
     * 작업 핸들러를 등록합니다
     */
    public registerHandler(type: TaskType, handler: any): void {
        this.scheduler.registerHandler(type, handler);
        console.log(`[TaskManager] Registered handler for: ${type}`);
    }

    /**
     * 스케줄러를 시작합니다
     */
    public start(): void {
        this.scheduler.start();
        console.log('[TaskManager] Scheduler started');
    }

    /**
     * 스케줄러를 중지합니다
     */
    public stop(): void {
        this.scheduler.stop();
        console.log('[TaskManager] Scheduler stopped');
    }

    /**
     * 작업 상태를 업데이트합니다
     */
    public updateStatus(taskId: string, status: TaskStatus): void {
        const task = this.queue.get(taskId);
        if (!task) {
            console.warn(`[TaskManager] Task not found: ${taskId}`);
            return;
        }

        const oldStatus = task.status;
        task.status = status;

        if (status === TaskStatus.IN_PROGRESS && !task.startedAt) {
            task.startedAt = Date.now();
            this.emitEvent(TaskEvent.STARTED, task);
        } else if (status === TaskStatus.COMPLETED) {
            task.completedAt = Date.now();
            this.emitEvent(TaskEvent.COMPLETED, task);
        } else if (status === TaskStatus.FAILED) {
            task.completedAt = Date.now();
            this.emitEvent(TaskEvent.FAILED, task);

            // 재시도 가능하면 재시도
            if (this.retry.canRetry(task)) {
                this.emitEvent(TaskEvent.RETRYING, task);
                this.scheduleRetry(task);
            }
        } else if (status === TaskStatus.CANCELLED) {
            this.emitEvent(TaskEvent.CANCELLED, task);
        }

        console.log(`[TaskManager] Task ${taskId} status: ${oldStatus} -> ${status}`);
    }

    /**
     * 작업 결과를 설정합니다
     */
    public setResult(taskId: string, result: TaskResult): void {
        const task = this.queue.get(taskId);
        if (task) {
            task.result = result;
            if (result.success) {
                this.updateStatus(taskId, TaskStatus.COMPLETED);
            } else {
                this.updateStatus(taskId, TaskStatus.FAILED);
            }
        }
    }

    /**
     * 작업을 취소합니다
     */
    public cancel(taskId: string): boolean {
        const cancelled = this.scheduler.cancelTask(taskId);
        if (cancelled) {
            this.updateStatus(taskId, TaskStatus.CANCELLED);
        }
        return cancelled;
    }

    /**
     * 작업을 일시정지합니다
     */
    public pause(taskId: string): boolean {
        return this.scheduler.pauseTask(taskId);
    }

    /**
     * 작업을 재개합니다
     */
    public resume(taskId: string): boolean {
        return this.scheduler.resumeTask(taskId);
    }

    /**
     * 작업을 재시도합니다
     */
    public async retryTask(taskId: string): Promise<boolean> {
        const task = this.queue.get(taskId);
        if (!task) {
            return false;
        }

        if (!this.retry.canRetry(task)) {
            console.warn(`[TaskManager] Cannot retry task: ${taskId}`);
            return false;
        }

        const { shouldRetry, delay } = this.retry.prepareForRetry(task);

        if (!shouldRetry) {
            return false;
        }

        // 지연 후 재시도
        if (delay > 0) {
            await this.sleep(delay);
        }

        this.emitEvent(TaskEvent.RETRYING, task);
        this.updateStatus(taskId, TaskStatus.PENDING);

        return true;
    }

    /**
     * 작업을 가져옵니다
     */
    public get(taskId: string): Task | undefined {
        return this.queue.get(taskId);
    }

    /**
     * 모든 작업을 가져옵니다
     */
    public getAll(): Task[] {
        return this.queue.getAll();
    }

    /**
     * 필터링된 작업을 가져옵니다
     */
    public getFiltered(filter: TaskFilter): Task[] {
        return this.queue.getFiltered(filter);
    }

    /**
     * 통계를 가져옵니다
     */
    public getStats(): TaskStats {
        const queueStats = this.queue.getStats();
        const allTasks = this.queue.getAll();

        // 성공률 계산
        const completed = allTasks.filter(t => t.status === TaskStatus.COMPLETED);
        const failed = allTasks.filter(t => t.status === TaskStatus.FAILED);
        const totalFinished = completed.length + failed.length;
        const successRate = totalFinished > 0 ? completed.length / totalFinished : 0;

        // 평균 duration 계산
        const tasksWithDuration = allTasks.filter(t => t.result?.duration !== undefined);
        const totalDuration = tasksWithDuration.reduce((sum, t) => sum + (t.result?.duration || 0), 0);
        const averageDuration = tasksWithDuration.length > 0 ? totalDuration / tasksWithDuration.length : 0;

        return {
            ...queueStats,
            averageDuration,
            successRate
        };
    }

    /**
     * 이벤트 리스너를 등록합니다
     */
    public on(event: TaskEvent, listener: TaskEventListener): void {
        const listeners = this.eventListeners.get(event);
        if (listeners) {
            listeners.add(listener);
            console.log(`[TaskManager] Registered listener for: ${event}`);
        }
    }

    /**
     * 이벤트 리스너를 제거합니다
     */
    public off(event: TaskEvent, listener: TaskEventListener): void {
        const listeners = this.eventListeners.get(event);
        if (listeners) {
            listeners.delete(listener);
        }
    }

    /**
     * 이벤트를 발생시킵니다
     */
    private emitEvent(event: TaskEvent, task: Task, data?: any): void {
        const listeners = this.eventListeners.get(event);
        if (listeners && listeners.size > 0) {
            const eventData: TaskEventData = {
                event,
                task,
                timestamp: Date.now(),
                data
            };

            listeners.forEach(listener => {
                try {
                    listener(eventData);
                } catch (error) {
                    console.error(`[TaskManager] Listener error for ${event}:`, error);
                }
            });
        }
    }

    /**
     * 재시도를 스케줄링합니다
     */
    private scheduleRetry(task: Task): void {
        const { shouldRetry, delay } = this.retry.prepareForRetry(task);

        if (shouldRetry) {
            setTimeout(() => {
                this.updateStatus(task.id, TaskStatus.PENDING);
            }, delay);
        }
    }

    /**
     * 작업 ID를 생성합니다
     */
    private generateTaskId(): string {
        return `task_${Date.now()}_${++this.taskIdCounter}`;
    }

    /**
     * 설정을 업데이트합니다
     */
    public updateConfig(config: Partial<TaskQueueConfig>): void {
        this.config = { ...this.config, ...config };
        
        if (config.maxConcurrent !== undefined) {
            this.scheduler.setMaxConcurrent(config.maxConcurrent);
        }
        
        if (config.retryStrategy) {
            this.retry.setDefaultStrategy(config.retryStrategy);
        }

        console.log('[TaskManager] Config updated');
    }

    /**
     * 큐를 비웁니다
     */
    public clear(): void {
        this.queue.clear();
        console.log('[TaskManager] Queue cleared');
    }

    /**
     * 대기
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * TaskQueue를 가져옵니다
     */
    public getQueue(): TaskQueue {
        return this.queue;
    }

    /**
     * TaskScheduler를 가져옵니다
     */
    public getScheduler(): TaskScheduler {
        return this.scheduler;
    }

    /**
     * TaskRetry를 가져옵니다
     */
    public getRetry(): TaskRetry {
        return this.retry;
    }

    // ===== PlanQueueService 호환 메서드들 =====

    /**
     * PlanQueue를 로드합니다
     */
    private loadPlanQueues(): void {
        if (!this.context) return;
        
        const stored = this.context.globalState.get<any>(TaskManager.PLAN_QUEUES_STORAGE_KEY);
        if (Array.isArray(stored) && stored.length > 0 && stored[0] && typeof stored[0] === 'object' && 'items' in stored[0]) {
            this.planQueues = stored as PlanQueue[];
        } else {
            // migrate from legacy single-queue key if present
            const legacy = this.context.globalState.get<PlanItem[]>('aidev-ide.planQueue', []);
            const legacyQueue: PlanQueue = {
                id: 'default',
                title: '기본 작업 큐',
                createdAt: Date.now(),
                items: Array.isArray(legacy) ? legacy : []
            };
            this.planQueues = [legacyQueue];
            this.currentPlanQueueId = 'default';
            this.persistPlanQueues();
        }
        if (!this.currentPlanQueueId) {
            this.currentPlanQueueId = this.planQueues.length > 0 ? this.planQueues[this.planQueues.length - 1].id : undefined;
        }
    }

    /**
     * PlanQueue를 저장합니다
     */
    private persistPlanQueues(): void {
        if (!this.context) return;
        this.context.globalState.update(TaskManager.PLAN_QUEUES_STORAGE_KEY, this.planQueues);
    }

    /**
     * PlanItem 목록을 가져옵니다 (PlanQueueService 호환)
     */
    public listPlanItems(): PlanItem[] {
        const q = this.getActivePlanQueue();
        return q ? [...q.items] : [];
    }

    /**
     * PlanItem을 큐에 추가합니다 (PlanQueueService 호환)
     */
    public enqueuePlanItems(items: Omit<PlanItem, 'id' | 'status' | 'createdAt'>[], defaultStatus: PlanItemStatus = 'pending'): number {
        const queue = this.getActivePlanQueueOrCreate();
        const added = this.addItemsToPlanQueue(queue, items, defaultStatus);
        this.persistPlanQueues();
        return added;
    }

    /**
     * PlanItem 상태를 업데이트합니다 (PlanQueueService 호환)
     */
    public updatePlanItemStatus(id: string, status: PlanItemStatus): void {
        const queue = this.getActivePlanQueue();
        if (!queue) return;
        const found = queue.items.find(q => q.id === id);
        if (found) {
            found.status = status;
            this.persistPlanQueues();
        }
    }

    /**
     * PlanQueue를 비웁니다 (PlanQueueService 호환)
     */
    public clearPlanQueue(): void {
        const queue = this.getActivePlanQueue();
        if (queue) {
            queue.items = [];
            this.persistPlanQueues();
        }
    }

    /**
     * 활성 PlanQueue를 설정합니다 (PlanQueueService 호환)
     */
    public setActivePlanQueue(queueId: string | undefined): void {
        this.currentPlanQueueId = queueId;
    }

    /**
     * 활성 PlanQueue ID를 가져옵니다 (PlanQueueService 호환)
     */
    public getActivePlanQueueId(): string | undefined {
        return this.currentPlanQueueId;
    }

    /**
     * 모든 PlanQueue 목록을 가져옵니다 (PlanQueueService 호환)
     */
    public listPlanQueues(): PlanQueue[] {
        return [...this.planQueues];
    }

    /**
     * 특정 PlanQueue의 아이템을 가져옵니다 (PlanQueueService 호환)
     */
    public getPlanQueue(queueId?: string): PlanItem[] {
        const q = this.planQueues.find(q => q.id === (queueId || this.currentPlanQueueId));
        return q ? [...q.items] : [];
    }

    /**
     * 새로운 PlanQueue를 생성합니다 (PlanQueueService 호환)
     */
    public createPlanQueue(title: string, initialItems: Omit<PlanItem, 'id' | 'status' | 'createdAt'>[] = [], defaultStatus: PlanItemStatus = 'pending'): string {
        const id = 'q_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
        const queue: PlanQueue = { id, title, createdAt: Date.now(), items: [] };
        if (initialItems.length > 0) this.addItemsToPlanQueue(queue, initialItems, defaultStatus);
        this.planQueues.push(queue);
        this.currentPlanQueueId = id;
        this.persistPlanQueues();
        return id;
    }

    /**
     * 특정 PlanQueue에 아이템을 추가합니다 (PlanQueueService 호환)
     */
    public enqueueToPlanQueue(queueId: string, items: Omit<PlanItem, 'id' | 'status' | 'createdAt'>[], defaultStatus: PlanItemStatus = 'pending'): number {
        const queue = this.planQueues.find(q => q.id === queueId);
        if (!queue) return 0;
        const count = this.addItemsToPlanQueue(queue, items, defaultStatus);
        this.persistPlanQueues();
        return count;
    }

    /**
     * 특정 PlanQueue를 비웁니다 (PlanQueueService 호환)
     */
    public clearPlanQueueById(queueId: string): void {
        const queue = this.planQueues.find(q => q.id === queueId);
        if (queue) {
            queue.items = [];
            this.persistPlanQueues();
        }
    }

    /**
     * 특정 PlanQueue의 아이템 상태를 업데이트합니다 (PlanQueueService 호환)
     */
    public updatePlanItemStatusInQueue(queueId: string, id: string, status: PlanItemStatus): void {
        const queue = this.planQueues.find(q => q.id === queueId);
        if (!queue) return;
        const found = queue.items.find(q => q.id === id);
        if (found) {
            found.status = status;
            this.persistPlanQueues();
        }
    }

    /**
     * 매칭되는 PlanQueue를 찾습니다 (PlanQueueService 호환)
     */
    public findMatchingPlanQueue(candidates: Array<{ title: string }>): string | undefined {
        if (!candidates || candidates.length === 0) return undefined;
        const titles = candidates.map(c => (c.title || '').toLowerCase()).filter(Boolean);
        for (let i = this.planQueues.length - 1; i >= 0; i--) {
            const q = this.planQueues[i];
            const text = (q.title + ' ' + q.items.map(it => it.title).join(' ')).toLowerCase();
            const matched = titles.some(t => t.length > 0 && text.includes(t.slice(0, Math.min(20, t.length))));
            if (matched) return q.id;
        }
        return undefined;
    }

    /**
     * PlanQueue에 아이템을 추가합니다 (내부 메서드)
     */
    private addItemsToPlanQueue(queue: PlanQueue, items: Omit<PlanItem, 'id' | 'status' | 'createdAt'>[], defaultStatus: PlanItemStatus): number {
        const now = Date.now();
        const added: PlanItem[] = items.map((it) => ({
            id: 'plan_' + Math.random().toString(36).slice(2) + now.toString(36),
            title: it.title,
            detail: it.detail,
            status: defaultStatus,
            createdAt: now
        }));
        queue.items.push(...added);
        return added.length;
    }

    /**
     * 활성 PlanQueue를 가져옵니다 (내부 메서드)
     */
    private getActivePlanQueue(): PlanQueue | undefined {
        if (this.currentPlanQueueId) return this.planQueues.find(q => q.id === this.currentPlanQueueId);
        return this.planQueues[this.planQueues.length - 1];
    }

    /**
     * 활성 PlanQueue를 가져오거나 생성합니다 (내부 메서드)
     */
    private getActivePlanQueueOrCreate(): PlanQueue {
        let q = this.getActivePlanQueue();
        if (!q) {
            const id = this.createPlanQueue('작업 큐');
            q = this.planQueues.find(q => q.id === id)!;
        }
        return q;
    }
}

