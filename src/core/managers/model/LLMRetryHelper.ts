/**
 * LLMRetryHelper
 * LLM API 호출 재시도 로직
 * v9.4.0: 네트워크 오류 및 rate limit 재시도 지원
 */

/**
 * 재시도 설정
 */
export interface LLMRetryConfig {
    /** 최대 재시도 횟수 (기본: 3) */
    maxRetries: number;
    /** 초기 대기 시간 밀리초 (기본: 1000) */
    initialDelayMs: number;
    /** 최대 대기 시간 밀리초 (기본: 30000) */
    maxDelayMs: number;
    /** 지수 백오프 배수 (기본: 2) */
    backoffMultiplier: number;
    /** Jitter 사용 여부 (기본: true) */
    useJitter: boolean;
}

/**
 * 재시도 결과
 */
export interface LLMRetryResult<T> {
    success: boolean;
    result?: T;
    error?: Error;
    attempts: number;
    totalDelayMs: number;
}

/**
 * 기본 재시도 설정
 */
export const DEFAULT_RETRY_CONFIG: LLMRetryConfig = {
    maxRetries: 5,
    initialDelayMs: 2000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
    useJitter: true,
};

/** 처음 N회 retry는 UI에 표시하지 않음 (hidden retry) */
export const HIDDEN_RETRY_THRESHOLD = 2;

/**
 * HTTP 상태 코드별 사용자 메시지 생성
 */
export function getRetryUserMessage(error: unknown, delayMs: number): string {
    if (!(error instanceof Error)) return '';
    const msg = error.message;
    const delaySec = Math.ceil(delayMs / 1000);

    if (msg.includes('429') || msg.toLowerCase().includes('rate limit') || msg.toLowerCase().includes('too many requests')) {
        return `LLM 요청 한도 초과(429). ${delaySec}초 후 재시도합니다`;
    }
    if (msg.includes('503') || msg.toLowerCase().includes('service unavailable')) {
        return `LLM 응답 오류(503). ${delaySec}초 후 재시도합니다`;
    }
    if (msg.includes('500') || msg.toLowerCase().includes('server error')) {
        return `LLM 응답 오류(500). ${delaySec}초 후 재시도합니다`;
    }
    if (msg.includes('502') || msg.toLowerCase().includes('bad gateway')) {
        return `LLM 게이트웨이 오류(502). ${delaySec}초 후 재시도합니다`;
    }
    if (msg.includes('504') || msg.toLowerCase().includes('gateway timeout')) {
        return `LLM 게이트웨이 시간 초과(504). ${delaySec}초 후 재시도합니다`;
    }
    if (msg.toLowerCase().includes('econnrefused')) {
        return `Ollama 서버에 연결할 수 없습니다. ${delaySec}초 후 재시도합니다`;
    }
    if (msg.toLowerCase().includes('etimedout') || msg.toLowerCase().includes('timeout')) {
        return `LLM 응답 시간 초과. ${delaySec}초 후 재시도합니다`;
    }
    return `LLM 오류 발생. ${delaySec}초 후 재시도합니다`;
}

/**
 * 재시도 가능한 에러인지 확인
 */
export function isRetryableError(error: unknown): boolean {
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
        '429',         // Rate Limit
        '500',         // Internal Server Error
        '502',         // Bad Gateway
        '503',         // Service Unavailable
        '504',         // Gateway Timeout
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
export function extractRetryAfter(error: unknown): number | null {
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
export function calculateDelay(
    attempt: number,
    config: LLMRetryConfig,
    retryAfterMs?: number | null,
): number {
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
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
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
export async function withRetry<T>(
    fn: () => Promise<T>,
    config: Partial<LLMRetryConfig> = {},
    signal?: AbortSignal,
    onRetry?: (attempt: number, error: Error, delayMs: number) => void,
): Promise<LLMRetryResult<T>> {
    const fullConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
    let lastError: Error | undefined;
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
        } catch (error) {
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

            console.log(
                `[LLMRetryHelper] Retry attempt ${attempt + 1}/${fullConfig.maxRetries} after ${delayMs}ms: ${lastError.message.substring(0, 100)}`,
            );

            // 대기
            try {
                await sleep(delayMs, signal);
            } catch (sleepError) {
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
