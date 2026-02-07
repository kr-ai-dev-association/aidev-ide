/**
 * Task Retry
 * 작업 재시도 로직을 담당하는 클래스
 */
import { TaskStatus } from './types';
export class TaskRetry {
    defaultStrategy = {
        maxRetries: 3,
        initialDelay: 1000,
        maxDelay: 30000,
        backoffMultiplier: 2,
        retryableErrors: []
    };
    /**
     * 작업을 재시도할 수 있는지 확인합니다
     */
    canRetry(task, strategy) {
        const retryStrategy = strategy || this.defaultStrategy;
        const retryCount = task.metadata?.retryCount || 0;
        // 최대 재시도 횟수 확인
        if (retryCount >= retryStrategy.maxRetries) {
            return false;
        }
        // 작업이 실패 상태인지 확인
        if (task.status !== TaskStatus.FAILED) {
            return false;
        }
        // 에러가 재시도 가능한지 확인
        if (task.error) {
            // 재시도 가능한 에러 목록이 있고, 현재 에러가 포함되어 있지 않으면 재시도 불가
            if (retryStrategy.retryableErrors && retryStrategy.retryableErrors.length > 0) {
                if (!retryStrategy.retryableErrors.includes(task.error.code)) {
                    return false;
                }
            }
            // recoverable이 false면 재시도 불가
            if (task.error.recoverable === false) {
                return false;
            }
        }
        return true;
    }
    /**
     * 재시도 지연 시간을 계산합니다 (Exponential Backoff)
     */
    calculateDelay(task, strategy) {
        const retryStrategy = strategy || this.defaultStrategy;
        const retryCount = task.metadata?.retryCount || 0;
        // Exponential backoff: initialDelay * (backoffMultiplier ^ retryCount)
        const delay = retryStrategy.initialDelay * Math.pow(retryStrategy.backoffMultiplier, retryCount);
        // 최대 지연 시간 제한
        return Math.min(delay, retryStrategy.maxDelay);
    }
    /**
     * 작업을 재시도 준비 상태로 만듭니다
     */
    prepareForRetry(task, strategy) {
        const canRetry = this.canRetry(task, strategy);
        if (!canRetry) {
            return {
                shouldRetry: false,
                delay: 0
            };
        }
        const delay = this.calculateDelay(task, strategy);
        // 재시도 횟수 증가
        if (!task.metadata) {
            task.metadata = {};
        }
        task.metadata.retryCount = (task.metadata.retryCount || 0) + 1;
        // 상태를 PENDING으로 변경
        task.status = TaskStatus.PENDING;
        task.error = undefined; // 에러 초기화
        console.log(`[TaskRetry] Prepared task ${task.id} for retry (attempt ${task.metadata.retryCount})`);
        return {
            shouldRetry: true,
            delay
        };
    }
    /**
     * 작업을 재시도합니다
     */
    async retryTask(task, retryFunction, strategy) {
        const { shouldRetry, delay } = this.prepareForRetry(task, strategy);
        if (!shouldRetry) {
            console.log(`[TaskRetry] Cannot retry task ${task.id}`);
            return false;
        }
        // 지연 시간 대기
        if (delay > 0) {
            console.log(`[TaskRetry] Waiting ${delay}ms before retrying task ${task.id}`);
            await this.sleep(delay);
        }
        try {
            // 재시도 실행
            await retryFunction();
            console.log(`[TaskRetry] Successfully retried task ${task.id}`);
            return true;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`[TaskRetry] Retry failed for task ${task.id}:`, errorMessage);
            // 에러 저장
            task.error = {
                code: 'RETRY_FAILED',
                message: errorMessage,
                stack: error instanceof Error ? error.stack : undefined,
                recoverable: this.canRetry(task, strategy)
            };
            task.status = TaskStatus.FAILED;
            return false;
        }
    }
    /**
     * 기본 재시도 전략을 설정합니다
     */
    setDefaultStrategy(strategy) {
        this.defaultStrategy = strategy;
        console.log('[TaskRetry] Default retry strategy updated');
    }
    /**
     * 작업의 재시도 정보를 가져옵니다
     */
    getRetryInfo(task, strategy) {
        const retryStrategy = strategy || this.defaultStrategy;
        const retryCount = task.metadata?.retryCount || 0;
        const canRetry = this.canRetry(task, strategy);
        const nextDelay = this.calculateDelay(task, strategy);
        return {
            canRetry,
            retryCount,
            maxRetries: retryStrategy.maxRetries,
            nextDelay,
            remainingRetries: Math.max(0, retryStrategy.maxRetries - retryCount)
        };
    }
    /**
     * 대기
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
//# sourceMappingURL=TaskRetry.js.map