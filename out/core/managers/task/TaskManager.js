"use strict";
/**
 * Task Manager
 * 비동기 작업 큐를 관리하는 메인 매니저
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskManager = void 0;
const types_1 = require("./types");
const TaskQueue_1 = require("./TaskQueue");
const TaskScheduler_1 = require("./TaskScheduler");
const TaskRetry_1 = require("./TaskRetry");
class TaskManager {
    static instance;
    queue;
    scheduler;
    retry;
    config;
    eventListeners = new Map();
    taskIdCounter = 0;
    // PlanQueueService 호환 기능
    context;
    planQueues = [];
    currentPlanQueueId;
    static PLAN_QUEUES_STORAGE_KEY = 'codepilot.planQueues.v2';
    constructor() {
        this.queue = new TaskQueue_1.TaskQueue();
        this.config = {
            maxConcurrent: 3,
            defaultPriority: types_1.Priority.NORMAL,
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
        this.scheduler = new TaskScheduler_1.TaskScheduler(this.queue, this.config.maxConcurrent);
        this.retry = new TaskRetry_1.TaskRetry();
        this.retry.setDefaultStrategy(this.config.retryStrategy);
        // 이벤트 리스너 초기화
        Object.values(types_1.TaskEvent).forEach(event => {
            this.eventListeners.set(event, new Set());
        });
        console.log('[TaskManager] Initialized');
    }
    static getInstance(context) {
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
    enqueue(type, title, options) {
        const taskId = this.generateTaskId();
        const task = {
            id: taskId,
            type,
            title,
            description: options?.description,
            priority: options?.priority || this.config.defaultPriority,
            status: types_1.TaskStatus.PENDING,
            dependencies: options?.dependencies,
            metadata: {
                ...options?.metadata,
                timeout: options?.timeout || this.config.defaultTimeout,
                maxRetries: options?.maxRetries || this.config.retryStrategy.maxRetries
            },
            createdAt: Date.now()
        };
        this.queue.enqueue(task);
        this.emitEvent(types_1.TaskEvent.ENQUEUED, task);
        console.log(`[TaskManager] Enqueued task: ${taskId} (${type}, priority: ${task.priority})`);
        return taskId;
    }
    /**
     * 작업 핸들러를 등록합니다
     */
    registerHandler(type, handler) {
        this.scheduler.registerHandler(type, handler);
        console.log(`[TaskManager] Registered handler for: ${type}`);
    }
    /**
     * 스케줄러를 시작합니다
     */
    start() {
        this.scheduler.start();
        console.log('[TaskManager] Scheduler started');
    }
    /**
     * 스케줄러를 중지합니다
     */
    stop() {
        this.scheduler.stop();
        console.log('[TaskManager] Scheduler stopped');
    }
    /**
     * 작업 상태를 업데이트합니다
     */
    updateStatus(taskId, status) {
        const task = this.queue.get(taskId);
        if (!task) {
            console.warn(`[TaskManager] Task not found: ${taskId}`);
            return;
        }
        const oldStatus = task.status;
        task.status = status;
        if (status === types_1.TaskStatus.IN_PROGRESS && !task.startedAt) {
            task.startedAt = Date.now();
            this.emitEvent(types_1.TaskEvent.STARTED, task);
        }
        else if (status === types_1.TaskStatus.COMPLETED) {
            task.completedAt = Date.now();
            this.emitEvent(types_1.TaskEvent.COMPLETED, task);
        }
        else if (status === types_1.TaskStatus.FAILED) {
            task.completedAt = Date.now();
            this.emitEvent(types_1.TaskEvent.FAILED, task);
            // 재시도 가능하면 재시도
            if (this.retry.canRetry(task)) {
                this.emitEvent(types_1.TaskEvent.RETRYING, task);
                this.scheduleRetry(task);
            }
        }
        else if (status === types_1.TaskStatus.CANCELLED) {
            this.emitEvent(types_1.TaskEvent.CANCELLED, task);
        }
        console.log(`[TaskManager] Task ${taskId} status: ${oldStatus} -> ${status}`);
    }
    /**
     * 작업 결과를 설정합니다
     */
    setResult(taskId, result) {
        const task = this.queue.get(taskId);
        if (task) {
            task.result = result;
            if (result.success) {
                this.updateStatus(taskId, types_1.TaskStatus.COMPLETED);
            }
            else {
                this.updateStatus(taskId, types_1.TaskStatus.FAILED);
            }
        }
    }
    /**
     * 작업을 취소합니다
     */
    cancel(taskId) {
        const cancelled = this.scheduler.cancelTask(taskId);
        if (cancelled) {
            this.updateStatus(taskId, types_1.TaskStatus.CANCELLED);
        }
        return cancelled;
    }
    /**
     * 작업을 일시정지합니다
     */
    pause(taskId) {
        return this.scheduler.pauseTask(taskId);
    }
    /**
     * 작업을 재개합니다
     */
    resume(taskId) {
        return this.scheduler.resumeTask(taskId);
    }
    /**
     * 작업을 재시도합니다
     */
    async retryTask(taskId) {
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
        this.emitEvent(types_1.TaskEvent.RETRYING, task);
        this.updateStatus(taskId, types_1.TaskStatus.PENDING);
        return true;
    }
    /**
     * 작업을 가져옵니다
     */
    get(taskId) {
        return this.queue.get(taskId);
    }
    /**
     * 모든 작업을 가져옵니다
     */
    getAll() {
        return this.queue.getAll();
    }
    /**
     * 필터링된 작업을 가져옵니다
     */
    getFiltered(filter) {
        return this.queue.getFiltered(filter);
    }
    /**
     * 통계를 가져옵니다
     */
    getStats() {
        const queueStats = this.queue.getStats();
        const allTasks = this.queue.getAll();
        // 성공률 계산
        const completed = allTasks.filter(t => t.status === types_1.TaskStatus.COMPLETED);
        const failed = allTasks.filter(t => t.status === types_1.TaskStatus.FAILED);
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
    on(event, listener) {
        const listeners = this.eventListeners.get(event);
        if (listeners) {
            listeners.add(listener);
            console.log(`[TaskManager] Registered listener for: ${event}`);
        }
    }
    /**
     * 이벤트 리스너를 제거합니다
     */
    off(event, listener) {
        const listeners = this.eventListeners.get(event);
        if (listeners) {
            listeners.delete(listener);
        }
    }
    /**
     * 이벤트를 발생시킵니다
     */
    emitEvent(event, task, data) {
        const listeners = this.eventListeners.get(event);
        if (listeners && listeners.size > 0) {
            const eventData = {
                event,
                task,
                timestamp: Date.now(),
                data
            };
            listeners.forEach(listener => {
                try {
                    listener(eventData);
                }
                catch (error) {
                    console.error(`[TaskManager] Listener error for ${event}:`, error);
                }
            });
        }
    }
    /**
     * 재시도를 스케줄링합니다
     */
    scheduleRetry(task) {
        const { shouldRetry, delay } = this.retry.prepareForRetry(task);
        if (shouldRetry) {
            setTimeout(() => {
                this.updateStatus(task.id, types_1.TaskStatus.PENDING);
            }, delay);
        }
    }
    /**
     * 작업 ID를 생성합니다
     */
    generateTaskId() {
        return `task_${Date.now()}_${++this.taskIdCounter}`;
    }
    /**
     * 설정을 업데이트합니다
     */
    updateConfig(config) {
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
    clear() {
        this.queue.clear();
        console.log('[TaskManager] Queue cleared');
    }
    /**
     * 대기
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    /**
     * TaskQueue를 가져옵니다
     */
    getQueue() {
        return this.queue;
    }
    /**
     * TaskScheduler를 가져옵니다
     */
    getScheduler() {
        return this.scheduler;
    }
    /**
     * TaskRetry를 가져옵니다
     */
    getRetry() {
        return this.retry;
    }
    // ===== PlanQueueService 호환 메서드들 =====
    /**
     * PlanQueue를 로드합니다
     */
    loadPlanQueues() {
        if (!this.context)
            return;
        const stored = this.context.globalState.get(TaskManager.PLAN_QUEUES_STORAGE_KEY);
        if (Array.isArray(stored) && stored.length > 0 && stored[0] && typeof stored[0] === 'object' && 'items' in stored[0]) {
            this.planQueues = stored;
        }
        else {
            const legacy = this.context.globalState.get('codepilot.planQueue', []);
            const legacyQueue = {
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
    persistPlanQueues() {
        if (!this.context)
            return;
        this.context.globalState.update(TaskManager.PLAN_QUEUES_STORAGE_KEY, this.planQueues);
    }
    /**
     * PlanItem 목록을 가져옵니다 (PlanQueueService 호환)
     */
    listPlanItems() {
        const q = this.getActivePlanQueue();
        return q ? [...q.items] : [];
    }
    /**
     * PlanItem을 큐에 추가합니다 (PlanQueueService 호환)
     */
    enqueuePlanItems(items, defaultStatus = 'pending') {
        const queue = this.getActivePlanQueueOrCreate();
        const added = this.addItemsToPlanQueue(queue, items, defaultStatus);
        this.persistPlanQueues();
        return added;
    }
    /**
     * PlanItem 상태를 업데이트합니다 (PlanQueueService 호환)
     */
    updatePlanItemStatus(id, status) {
        const queue = this.getActivePlanQueue();
        if (!queue)
            return;
        const found = queue.items.find(q => q.id === id);
        if (found) {
            found.status = status;
            this.persistPlanQueues();
        }
    }
    /**
     * PlanQueue를 비웁니다 (PlanQueueService 호환)
     */
    clearPlanQueue() {
        const queue = this.getActivePlanQueue();
        if (queue) {
            queue.items = [];
            this.persistPlanQueues();
        }
    }
    /**
     * 활성 PlanQueue를 설정합니다 (PlanQueueService 호환)
     */
    setActivePlanQueue(queueId) {
        this.currentPlanQueueId = queueId;
    }
    /**
     * 활성 PlanQueue ID를 가져옵니다 (PlanQueueService 호환)
     */
    getActivePlanQueueId() {
        return this.currentPlanQueueId;
    }
    /**
     * 모든 PlanQueue 목록을 가져옵니다 (PlanQueueService 호환)
     */
    listPlanQueues() {
        return [...this.planQueues];
    }
    /**
     * 특정 PlanQueue의 아이템을 가져옵니다 (PlanQueueService 호환)
     */
    getPlanQueue(queueId) {
        const q = this.planQueues.find(q => q.id === (queueId || this.currentPlanQueueId));
        return q ? [...q.items] : [];
    }
    /**
     * 새로운 PlanQueue를 생성합니다 (PlanQueueService 호환)
     */
    createPlanQueue(title, initialItems = [], defaultStatus = 'pending') {
        const id = 'q_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
        const queue = { id, title, createdAt: Date.now(), items: [] };
        if (initialItems.length > 0)
            this.addItemsToPlanQueue(queue, initialItems, defaultStatus);
        this.planQueues.push(queue);
        this.currentPlanQueueId = id;
        this.persistPlanQueues();
        return id;
    }
    /**
     * 특정 PlanQueue에 아이템을 추가합니다 (PlanQueueService 호환)
     */
    enqueueToPlanQueue(queueId, items, defaultStatus = 'pending') {
        const queue = this.planQueues.find(q => q.id === queueId);
        if (!queue)
            return 0;
        const count = this.addItemsToPlanQueue(queue, items, defaultStatus);
        this.persistPlanQueues();
        return count;
    }
    /**
     * 특정 PlanQueue를 비웁니다 (PlanQueueService 호환)
     */
    clearPlanQueueById(queueId) {
        const queue = this.planQueues.find(q => q.id === queueId);
        if (queue) {
            queue.items = [];
            this.persistPlanQueues();
        }
    }
    /**
     * 특정 PlanQueue의 아이템 상태를 업데이트합니다 (PlanQueueService 호환)
     */
    updatePlanItemStatusInQueue(queueId, id, status) {
        const queue = this.planQueues.find(q => q.id === queueId);
        if (!queue)
            return;
        const found = queue.items.find(q => q.id === id);
        if (found) {
            found.status = status;
            this.persistPlanQueues();
        }
    }
    /**
     * 매칭되는 PlanQueue를 찾습니다 (PlanQueueService 호환)
     */
    findMatchingPlanQueue(candidates) {
        if (!candidates || candidates.length === 0)
            return undefined;
        const titles = candidates.map(c => (c.title || '').toLowerCase()).filter(Boolean);
        for (let i = this.planQueues.length - 1; i >= 0; i--) {
            const q = this.planQueues[i];
            const text = (q.title + ' ' + q.items.map(it => it.title).join(' ')).toLowerCase();
            const matched = titles.some(t => t.length > 0 && text.includes(t.slice(0, Math.min(20, t.length))));
            if (matched)
                return q.id;
        }
        return undefined;
    }
    /**
     * PlanQueue에 아이템을 추가합니다 (내부 메서드)
     */
    addItemsToPlanQueue(queue, items, defaultStatus) {
        const now = Date.now();
        const added = items.map((it) => ({
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
     * 다음에 수행할 대기 중인 아이템을 가져옵니다 (진행 중인 아이템 우선)
     */
    getNextPendingItem() {
        const queue = this.getActivePlanQueue();
        if (!queue)
            return undefined;
        // 1. 이미 진행 중인 항목이 있으면 그것을 최우선으로 반환
        const inProgress = queue.items.find(item => item.status === 'in_progress');
        if (inProgress)
            return inProgress;
        // 2. 없으면 대기 중인 첫 번째 항목 반환
        return queue.items.find(item => item.status === 'pending');
    }
    /**
     * 새로운 플랜 아이템들을 설정합니다 (기존 아이템 대체)
     */
    setPlanItems(items) {
        const queue = this.getActivePlanQueueOrCreate();
        queue.items = []; // 기존 아이템 제거
        this.addItemsToPlanQueue(queue, items, 'pending');
        this.persistPlanQueues();
    }
    /**
     * 활성 PlanQueue를 가져옵니다 (내부 메서드)
     */
    getActivePlanQueue() {
        if (this.currentPlanQueueId)
            return this.planQueues.find(q => q.id === this.currentPlanQueueId);
        return this.planQueues[this.planQueues.length - 1];
    }
    /**
     * 활성 PlanQueue를 가져오거나 생성합니다 (내부 메서드)
     */
    getActivePlanQueueOrCreate() {
        let q = this.getActivePlanQueue();
        if (!q) {
            const id = this.createPlanQueue('작업 큐');
            q = this.planQueues.find(q => q.id === id);
        }
        return q;
    }
}
exports.TaskManager = TaskManager;
//# sourceMappingURL=TaskManager.js.map