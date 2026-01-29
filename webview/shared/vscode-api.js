/**
 * VSCode API Bridge
 * VS Code webview API를 전역으로 초기화하고 공유하는 모듈
 */

// VS Code API를 전역으로 획득
if (
  typeof window.vscode === "undefined" &&
  typeof acquireVsCodeApi !== "undefined"
) {
  window.vscode = acquireVsCodeApi();

  // __BOOT_PING__ 테스트 - Webview 연결 확인
  try {
    window.vscode.postMessage({
      command: "__BOOT_PING__",
      timestamp: Date.now(),
    });
  } catch (error) {
    // Silent error handling
  }
}

export const vscode = window.vscode || null;

/**
 * VS Code에 메시지 전송
 * @param {Object} message - 전송할 메시지 객체
 */
export function postMessage(message) {
  if (vscode) {
    vscode.postMessage(message);
  } else {
    console.warn("[VSCode API] vscode API not available");
  }
}

/**
 * VS Code 상태 저장
 * @param {Object} state - 저장할 상태 객체
 */
export function setState(state) {
  if (vscode) {
    vscode.setState(state);
  }
}

/**
 * VS Code 상태 가져오기
 * @returns {Object|undefined} 저장된 상태
 */
export function getState() {
  if (vscode) {
    return vscode.getState();
  }
  return undefined;
}
