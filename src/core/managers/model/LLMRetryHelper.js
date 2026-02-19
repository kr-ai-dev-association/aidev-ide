/**
 * LLMRetryHelper
 * LLM API 호출 재시도 로직
 * v9.4.0: 네트워크 오류 및 rate limit 재시도 지원
 */
/**
 * 기본 재시도 설정
 */
export const DEFAULT_RETRY_CONFIG = {
    maxRetries: 3,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
    useJitter: true,
};
/**
 * 재시도 가능한 에러인지 확인
 */
export function isRetryableError(error) {
    if (!(error instanceof Error)) {
        return false;
    }
    const message = error.message.toLowerCase();
    const name = error.name;
    // 네트워크 에러
    const networkErrors = [
        'econnreset',
        'econnrefused',
        'etimedout',
        'enotfound',
        'enetunreach',
        'socket hang up',
        'network error',
        'fetch failed',
    ];
    if (networkErrors.some(e => message.includes(e))) {
        return true;
    }
    // HTTP 상태 코드 기반 에러
    const httpRetryable = [
        '429', // Rate Limit
        '500', // Internal Server Error
        '502', // Bad Gateway
        '503', // Service Unavailable
        '504', // Gateway Timeout
        'rate limit',
        'too many requests',
        'server error',
        'bad gateway',
        'service unavailable',
        'gateway timeout',
    ];
    if (httpRetryable.some(e => message.includes(e))) {
        return true;
    }
    // 타임아웃 에러
    if (name === 'TimeoutError' || message.includes('timeout')) {
        return true;
    }
    // AbortError는 재시도하지 않음 (사용자 취소)
    if (name === 'AbortError') {
        return false;
    }
    return false;
}
/**
 * 에러에서 Retry-After 헤더 값 추출 (밀리초)
 */
export function extractRetryAfter(error) {
    if (!(error instanceof Error)) {
        return null;
    }
    const message = error.message;
    // "Retry-After: 30" 패턴 찾기
    const retryAfterMatch = message.match(/retry-after[:\s]+(\d+)/i);
    if (retryAfterMatch) {
        return parseInt(retryAfterMatch[1], 10) * 1000;
    }
    return null;
}
/**
 * 지수 백오프 + Jitter로 대기 시간 계산
 */
export function calculateDelay(attempt, config, retryAfterMs) {
    // Retry-After 헤더가 있으면 우선 사용
    if (retryAfterMs && retryAfterMs > 0) {
        return Math.min(retryAfterMs, config.maxDelayMs);
    }
    // 지수 백오프: initialDelay * (multiplier ^ attempt)
    let delay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt);
    // 최대 대기 시간 제한
    delay = Math.min(delay, config.maxDelayMs);
    // Jitter 추가 (±25%)
    if (config.useJitter) {
        const jitter = delay * 0.25 * (Math.random() * 2 - 1);
        delay = Math.max(100, delay + jitter);
    }
    return Math.round(delay);
}
/**
 * 대기 (sleep)
 */
export function sleep(ms, signal) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(new DOMException('Aborted', 'AbortError'));
            return;
        }
        const timer = setTimeout(resolve, ms);
        signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new DOMException('Aborted', 'AbortError'));
        }, { once: true });
    });
}
/**
 * 재시도 로직으로 함수 실행
 */
export async function withRetry(fn, config = {}, signal, onRetry) {
    const fullConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
    let lastError;
    let attempts = 0;
    let totalDelayMs = 0;
    for (let attempt = 0; attempt <= fullConfig.maxRetries; attempt++) {
        attempts = attempt + 1;
        if (signal?.aborted) {
            return {
                success: false,
                error: new DOMException('Aborted', 'AbortError'),
                attempts,
                totalDelayMs,
            };
        }
        try {
            const result = await fn();
            return {
                success: true,
                result,
                attempts,
                totalDelayMs,
            };
        }
        catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            // 마지막 시도이거나 재시도 불가 에러면 종료
            if (attempt >= fullConfig.maxRetries || !isRetryableError(error)) {
                return {
                    success: false,
                    error: lastError,
                    attempts,
                    totalDelayMs,
                };
            }
            // 대기 시간 계산
            const retryAfterMs = extractRetryAfter(error);
            const delayMs = calculateDelay(attempt, fullConfig, retryAfterMs);
            totalDelayMs += delayMs;
            // 재시도 콜백 호출
            if (onRetry) {
                onRetry(attempt, lastError, delayMs);
            }
            console.log(`[LLMRetryHelper] Retry attempt ${attempt + 1}/${fullConfig.maxRetries} after ${delayMs}ms: ${lastError.message.substring(0, 100)}`);
            // 대기
            try {
                await sleep(delayMs, signal);
            }
            catch (sleepError) {
                // AbortError
                return {
                    success: false,
                    error: sleepError instanceof Error ? sleepError : new Error('Aborted'),
                    attempts,
                    totalDelayMs,
                };
            }
        }
    }
    return {
        success: false,
        error: lastError || new Error('Unknown error'),
        attempts,
        totalDelayMs,
    };
}
//# sourceMappingURL=LLMRetryHelper.js.map