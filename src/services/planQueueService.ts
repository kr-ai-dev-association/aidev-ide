import * as vscode from 'vscode';

export type PlanItemStatus = 'pending' | 'in_progress' | 'done' | 'failed' | 'skipped';

export interface PlanItem {
    id: string;
    title: string;
    detail?: string;
    status: PlanItemStatus;
    createdAt: number;
}

export class PlanQueueService {
    private static STORAGE_KEY = 'aidev-ide.planQueue';
    private context: vscode.ExtensionContext;
    private queue: PlanItem[] = [];

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.queue = this.context.globalState.get<PlanItem[]>(PlanQueueService.STORAGE_KEY, []);
    }

    public list(): PlanItem[] {
        return [...this.queue];
    }

    public enqueue(items: Omit<PlanItem, 'id' | 'status' | 'createdAt'>[], defaultStatus: PlanItemStatus = 'pending'): number {
        const now = Date.now();
        const added: PlanItem[] = items.map((it) => ({
            id: 'plan_' + Math.random().toString(36).slice(2) + now.toString(36),
            title: it.title,
            detail: it.detail,
            status: defaultStatus,
            createdAt: now
        }));
        this.queue.push(...added);
        this.persist();
        return added.length;
    }

    public updateStatus(id: string, status: PlanItemStatus): void {
        const found = this.queue.find(q => q.id === id);
        if (found) {
            found.status = status;
            this.persist();
        }
    }

    public clear(): void {
        this.queue = [];
        this.persist();
    }

    private persist(): void {
        this.context.globalState.update(PlanQueueService.STORAGE_KEY, this.queue);
    }
}


