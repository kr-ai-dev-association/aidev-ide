/**
 * PromisePool
 * 동시 실행 수를 제한하는 Promise 풀
 * 에러가 발생해도 나머지 태스크는 계속 실행되며, 모든 에러를 수집하여 drain() 에서 반환
 */

export class PromisePool {
    private concurrency: number;
    private running = 0;
    private queue: Array<() => Promise<void>> = [];
    private resolveWhenDrained: (() => void) | null = null;
    private errors: Error[] = [];

    constructor(concurrency: number) {
        this.concurrency = concurrency;
    }

    add(task: () => Promise<void>): void {
        this.queue.push(task);
        this.tryNext();
    }

    private tryNext(): void {
        while (this.running < this.concurrency && this.queue.length > 0) {
            const task = this.queue.shift()!;
            this.running++;
            task()
                .catch((err) => {
                    this.errors.push(err instanceof Error ? err : new Error(String(err)));
                })
                .finally(() => {
                    this.running--;
                    if (this.running === 0 && this.queue.length === 0 && this.resolveWhenDrained) {
                        this.resolveWhenDrained();
                        this.resolveWhenDrained = null;
                    } else {
                        this.tryNext();
                    }
                });
        }
    }

    /**
     * 모든 태스크가 완료될 때까지 대기
     * @returns 실행 중 발생한 에러 배열 (없으면 빈 배열)
     */
    async drain(): Promise<Error[]> {
        if (this.running === 0 && this.queue.length === 0) {
            return this.errors;
        }

        return new Promise(resolve => {
            this.resolveWhenDrained = () => resolve(this.errors);
        });
    }
}
