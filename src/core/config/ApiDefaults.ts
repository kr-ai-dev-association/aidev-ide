/**
 * API 기본값 상수
 * 하드코딩된 URL, 타임아웃 등을 중앙 관리
 */

// ===== 기본 URL =====
export const DEFAULT_OLLAMA_URL = 'http://localhost:11434';

// ===== 기본 토큰 제한 =====
export const DEFAULT_TOKEN_LIMIT = 128000;

// ===== 타임아웃 (ms) =====
export const FETCH_URL_TIMEOUT = 10000;        // URL 페치 타임아웃 (10초)
export const HOTLOAD_COMMAND_TIMEOUT = 60000;   // 핫로드 명령 타임아웃 (60초)
export const TASK_DEFAULT_TIMEOUT = 300000;     // 작업 기본 타임아웃 (5분)
export const AUTO_REMEDIATE_TIMEOUT = 120000;   // 자동 수정 타임아웃 (2분)
export const AUTO_REMEDIATE_QUICK_TIMEOUT = 60000; // 자동 수정 빠른 타임아웃 (60초)

// ===== 리트라이 =====
export const RETRY_BASE_DELAY_MS = 1000;
export const RETRY_MAX_DELAY_MS = 5000;

// ===== 캐시 TTL =====
export const SETTINGS_CACHE_TTL_MS = 5 * 60 * 1000; // 5분
export const PROJECT_CONTEXT_CACHE_TTL_MS = 5 * 60 * 1000; // 5분

// ===== ErrorReporting =====
export const ERROR_FLUSH_INTERVAL_MS = 10000;  // 10초
export const ERROR_MAX_QUEUE_SIZE = 50;

// ===== UsageMetrics =====
export const MEMORY_CHECK_INTERVAL_MS = 30000; // 30초
export const MAX_METRIC_RECORDS = 1000;
