import * as vscode from 'vscode';

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

export class PlanQueueService {
    // v2 storage key (multi-queue). We'll migrate from legacy single queue if found.
    private static STORAGE_KEY = 'aidev-ide.planQueues.v2';
    private context: vscode.ExtensionContext;

    private queues: PlanQueue[] = [];
    private currentQueueId: string | undefined;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        const stored = this.context.globalState.get<any>(PlanQueueService.STORAGE_KEY);
        if (Array.isArray(stored) && stored.length > 0 && stored[0] && typeof stored[0] === 'object' && 'items' in stored[0]) {
            this.queues = stored as PlanQueue[];
        } else {
            // migrate from legacy single-queue key if present
            const legacy = this.context.globalState.get<PlanItem[]>('aidev-ide.planQueue', []);
            const legacyQueue: PlanQueue = {
                id: 'default',
                title: '기본 작업 큐',
                createdAt: Date.now(),
                items: Array.isArray(legacy) ? legacy : []
            };
            this.queues = [legacyQueue];
            this.currentQueueId = 'default';
            this.persist();
        }
        if (!this.currentQueueId) {
            this.currentQueueId = this.queues.length > 0 ? this.queues[this.queues.length - 1].id : undefined;
        }
    }

    // ===== Backward-compatible API (operates on active queue) =====
    public list(): PlanItem[] {
        const q = this.getActiveQueue();
        return q ? [...q.items] : [];
    }

    public enqueue(items: Omit<PlanItem, 'id' | 'status' | 'createdAt'>[], defaultStatus: PlanItemStatus = 'pending'): number {
        const queue = this.getActiveQueueOrCreate();
        const added = this.addItemsToQueue(queue, items, defaultStatus);
        this.persist();
        return added;
    }

    public updateStatus(id: string, status: PlanItemStatus): void {
        const queue = this.getActiveQueue();
        if (!queue) return;
        const found = queue.items.find(q => q.id === id);
        if (found) {
            found.status = status;
            this.persist();
        }
    }

    public clear(): void {
        const queue = this.getActiveQueue();
        if (queue) {
            queue.items = [];
            this.persist();
        }
    }

    private persist(): void {
        this.context.globalState.update(PlanQueueService.STORAGE_KEY, this.queues);
    }

    // ===== v2 multi-queue API =====
    public setActiveQueue(queueId: string | undefined): void {
        this.currentQueueId = queueId;
    }

    public getActiveQueueId(): string | undefined {
        return this.currentQueueId;
    }

    public listQueues(): PlanQueue[] {
        return [...this.queues];
    }

    public getQueue(queueId?: string): PlanItem[] {
        const q = this.queues.find(q => q.id === (queueId || this.currentQueueId));
        return q ? [...q.items] : [];
    }

    public createQueue(title: string, initialItems: Omit<PlanItem, 'id' | 'status' | 'createdAt'>[] = [], defaultStatus: PlanItemStatus = 'pending'): string {
        const id = 'q_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
        const queue: PlanQueue = { id, title, createdAt: Date.now(), items: [] };
        if (initialItems.length > 0) this.addItemsToQueue(queue, initialItems, defaultStatus);
        this.queues.push(queue);
        this.currentQueueId = id;
        this.persist();
        return id;
    }

    public enqueueTo(queueId: string, items: Omit<PlanItem, 'id' | 'status' | 'createdAt'>[], defaultStatus: PlanItemStatus = 'pending'): number {
        const queue = this.queues.find(q => q.id === queueId);
        if (!queue) return 0;
        const count = this.addItemsToQueue(queue, items, defaultStatus);
        this.persist();
        return count;
    }

    public clearQueue(queueId: string): void {
        const queue = this.queues.find(q => q.id === queueId);
        if (queue) {
            queue.items = [];
            this.persist();
        }
    }

    public updateStatusIn(queueId: string, id: string, status: PlanItemStatus): void {
        const queue = this.queues.find(q => q.id === queueId);
        if (!queue) return;
        const found = queue.items.find(q => q.id === id);
        if (found) {
            found.status = status;
            this.persist();
        }
    }

    public findMatchingQueue(candidates: Array<{ title: string }>): string | undefined {
        if (!candidates || candidates.length === 0) return undefined;
        const titles = candidates.map(c => (c.title || '').toLowerCase()).filter(Boolean);
        for (let i = this.queues.length - 1; i >= 0; i--) {
            const q = this.queues[i];
            const text = (q.title + ' ' + q.items.map(it => it.title).join(' ')).toLowerCase();
            const matched = titles.some(t => t.length > 0 && text.includes(t.slice(0, Math.min(20, t.length))));
            if (matched) return q.id;
        }
        return undefined;
    }

    private addItemsToQueue(queue: PlanQueue, items: Omit<PlanItem, 'id' | 'status' | 'createdAt'>[], defaultStatus: PlanItemStatus): number {
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

    private getActiveQueue(): PlanQueue | undefined {
        if (this.currentQueueId) return this.queues.find(q => q.id === this.currentQueueId);
        return this.queues[this.queues.length - 1];
    }

    private getActiveQueueOrCreate(): PlanQueue {
        let q = this.getActiveQueue();
        if (!q) {
            const id = this.createQueue('작업 큐');
            q = this.queues.find(q => q.id === id)!;
        }
        return q;
    }
}


