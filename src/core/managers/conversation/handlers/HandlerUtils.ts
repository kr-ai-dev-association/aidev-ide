/**
 * 대화 핸들러 공통 유틸리티
 *
 * 8개 핸들러에서 반복되는 패턴을 공유 함수로 추출.
 */
import * as vscode from 'vscode';

/**
 * unknown 타입의 에러에서 메시지 문자열을 추출합니다.
 * 패턴: `error instanceof Error ? error.message : String(error)`
 */
export function extractErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * 핸들러 이름 접두사가 포함된 로거를 생성합니다.
 *
 * Usage:
 * ```
 * const log = createHandlerLogger('TestRunner');
 * log.info('테스트 시작');
 * log.warn('경고 메시지');
 * log.error('에러 발생', error);
 * ```
 */
export function createHandlerLogger(handlerName: string) {
  const prefix = `[${handlerName}]`;
  return {
    info: (message: string, ...args: any[]) =>
      console.log(`${prefix} ${message}`, ...args),
    warn: (message: string, ...args: any[]) =>
      console.warn(`${prefix} ${message}`, ...args),
    error: (message: string, ...args: any[]) =>
      console.error(`${prefix} ${message}`, ...args),
  };
}

/**
 * WebviewBridge 상태 전송 헬퍼.
 * webview가 없거나 disposed된 경우를 안전하게 처리합니다.
 */
export function sendStatus(
  webview: vscode.Webview | undefined,
  phase: string,
  message: string
): void {
  if (!webview) return;
  try {
    // dynamic import를 피하기 위해 직접 호출하지 않고, 호출측에서 WebviewBridge를 사용
    // 이 함수는 webview 유효성 검사 + try-catch 래퍼로만 사용
    webview.postMessage({
      command: 'updateProcessingStatus',
      status: message,
      phase,
    });
  } catch {
    // webview가 이미 disposed된 경우 무시
  }
}

/**
 * 재시도 가능한 비동기 함수 래퍼
 *
 * @param fn - 실행할 비동기 함수
 * @param maxRetries - 최대 재시도 횟수 (기본 2)
 * @param onRetry - 재시도 시 호출할 콜백 (선택)
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 2,
  onRetry?: (attempt: number, error: unknown) => void
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        onRetry?.(attempt + 1, error);
      }
    }
  }
  throw lastError;
}
