"use strict";
/**
 * Task Queue
 * 작업 큐를 관리하는 클래스
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskQueue = void 0;
const types_1 = require("./types");
class TaskQueue {
    queue = [];
    maxSize = 1000;
    /**
     * 작업을 큐에 추가합니다
     */
    enqueue(task) {
        // 최대 크기 확인
        if (this.queue.length >= this.maxSize) {
            // 오래된 PENDING 작업 제거
            const oldestPending = this.queue.findIndex(t => t.status === types_1.TaskStatus.PENDING);
            if (oldestPending !== -1) {
                this.queue.splice(oldestPending, 1);
                console.log('[TaskQueue] Removed oldest pending task to make room');
            }
            else {
                console.warn('[TaskQueue] Queue is full, cannot add new task');
                return;
            }
        }
        this.queue.push(task);
        console.log(`[TaskQueue] Enqueued task: ${task.id} (${task.type}, priority: ${task.priority})`);
    }
    /**
     * 큐에서 작업을 제거합니다
     */
    dequeue() {
        if (this.queue.length === 0) {
            return null;
        }
        // 우선순위에 따라 정렬
        this.sortByPriority();
        // PENDING 상태인 작업 찾기
        const task = this.queue.find(t => t.status === types_1.TaskStatus.PENDING);
        if (!task) {
            return null;
        }
        // 큐에서 제거하지 않고 상태만 변경 (히스토리 유지)
        return task;
    }
    /**
     * 작업을 큐에서 제거합니다
     */
    remove(taskId) {
        const index = this.queue.findIndex(t => t.id === taskId);
        if (index !== -1) {
            this.queue.splice(index, 1);
            console.log(`[TaskQueue] Removed task: ${taskId}`);
            return true;
        }
        return false;
    }
    /**
     * 작업을 가져옵니다
     */
    get(taskId) {
        return this.queue.find(t => t.id === taskId);
    }
    /**
     * 모든 작업을 가져옵니다
     */
    getAll() {
        return [...this.queue];
    }
    /**
     * 필터링된 작업을 가져옵니다
     */
    getFiltered(filter) {
        return this.queue.filter(task => {
            // 상태 필터
            if (filter.status && !filter.status.includes(task.status)) {
                return false;
            }
            // 타입 필터
            if (filter.type && !filter.type.includes(task.type)) {
                return false;
            }
            // 우선순위 필터
            if (filter.priority && !filter.priority.includes(task.priority)) {
                return false;
            }
            // 시간 범위 필터
            if (filter.startTime && task.createdAt < filter.startTime) {
                return false;
            }
            if (filter.endTime && task.createdAt > filter.endTime) {
                return false;
            }
            // 태그 필터
            if (filter.tags && filter.tags.length > 0) {
                const taskTags = task.metadata?.tags || [];
                if (!filter.tags.some(tag => taskTags.includes(tag))) {
                    return false;
                }
            }
            return true;
        });
    }
    /**
     * PENDING 작업을 가져옵니다
     */
    getPending() {
        return this.queue.filter(t => t.status === types_1.TaskStatus.PENDING);
    }
    /**
     * IN_PROGRESS 작업을 가져옵니다
     */
    getInProgress() {
        return this.queue.filter(t => t.status === types_1.TaskStatus.IN_PROGRESS);
    }
    /**
     * 완료된 작업을 가져옵니다
     */
    getCompleted() {
        return this.queue.filter(t => t.status === types_1.TaskStatus.COMPLETED);
    }
    /**
     * 실패한 작업을 가져옵니다
     */
    getFailed() {
        return this.queue.filter(t => t.status === types_1.TaskStatus.FAILED);
    }
    /**
     * 큐를 비웁니다
     */
    clear() {
        const count = this.queue.length;
        this.queue = [];
        console.log(`[TaskQueue] Cleared ${count} tasks`);
    }
    /**
     * 특정 상태의 작업을 제거합니다
     */
    clearByStatus(status) {
        const before = this.queue.length;
        this.queue = this.queue.filter(t => t.status !== status);
        const removed = before - this.queue.length;
        console.log(`[TaskQueue] Removed ${removed} tasks with status: ${status}`);
        return removed;
    }
    /**
     * 오래된 작업을 제거합니다
     */
    clearOld(olderThanMs) {
        const cutoff = Date.now() - olderThanMs;
        const before = this.queue.length;
        this.queue = this.queue.filter(t => t.createdAt >= cutoff);
        const removed = before - this.queue.length;
        console.log(`[TaskQueue] Removed ${removed} old tasks`);
        return removed;
    }
    /**
     * 우선순위에 따라 정렬합니다
     */
    sortByPriority() {
        this.queue.sort((a, b) => {
            // 우선순위가 같으면 생성 시간 순
            if (a.priority === b.priority) {
                return a.createdAt - b.createdAt;
            }
            // 우선순위가 낮을수록 먼저 (CRITICAL=0이 가장 높음)
            return a.priority - b.priority;
        });
    }
    /**
     * 큐 크기를 가져옵니다
     */
    size() {
        return this.queue.length;
    }
    /**
     * 큐가 비어있는지 확인합니다
     */
    isEmpty() {
        return this.queue.length === 0;
    }
    /**
     * 최대 크기를 설정합니다
     */
    setMaxSize(max) {
        this.maxSize = max;
        if (this.queue.length > max) {
            const excess = this.queue.length - max;
            // 오래된 COMPLETED/FAILED 작업부터 제거
            const sorted = [...this.queue].sort((a, b) => a.createdAt - b.createdAt);
            const toRemove = sorted
                .filter(t => t.status === types_1.TaskStatus.COMPLETED || t.status === types_1.TaskStatus.FAILED)
                .slice(0, excess);
            toRemove.forEach(t => this.remove(t.id));
            console.log(`[TaskQueue] Trimmed to ${max} tasks (removed ${toRemove.length})`);
        }
    }
    /**
     * 통계를 가져옵니다
     */
    getStats() {
        const byStatus = {
            [types_1.TaskStatus.PENDING]: 0,
            [types_1.TaskStatus.IN_PROGRESS]: 0,
            [types_1.TaskStatus.PAUSED]: 0,
            [types_1.TaskStatus.COMPLETED]: 0,
            [types_1.TaskStatus.FAILED]: 0,
            [types_1.TaskStatus.CANCELLED]: 0,
            [types_1.TaskStatus.SKIPPED]: 0
        };
        const byType = {
            [types_1.TaskType.ACTION]: 0,
            [types_1.TaskType.COMMAND]: 0,
            [types_1.TaskType.FILE_OPERATION]: 0,
            [types_1.TaskType.CODE_GENERATION]: 0,
            [types_1.TaskType.ANALYSIS]: 0,
            [types_1.TaskType.REFACTOR]: 0
        };
        const byPriority = {
            [types_1.Priority.CRITICAL]: 0,
            [types_1.Priority.HIGH]: 0,
            [types_1.Priority.NORMAL]: 0,
            [types_1.Priority.LOW]: 0,
            [types_1.Priority.BACKGROUND]: 0
        };
        for (const task of this.queue) {
            byStatus[task.status]++;
            byType[task.type]++;
            byPriority[task.priority]++;
        }
        return {
            total: this.queue.length,
            byStatus,
            byType,
            byPriority
        };
    }
}
exports.TaskQueue = TaskQueue;
//# sourceMappingURL=TaskQueue.js.map