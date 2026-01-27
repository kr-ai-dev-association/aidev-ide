/**
 * Theme Manager
 * 다크/라이트 테마 관리 모듈
 */

import { vscode, postMessage } from "./vscode-api.js";

let currentTheme = "dark";

/**
 * 테마를 body에 적용
 * @param {string} theme - "dark", "light", "auto"
 */
export function applyThemeToBody(theme) {
  if (theme === "auto") {
    // VS Code 테마 감지
    const isDark =
      document.body.classList.contains("vscode-dark") ||
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.body.setAttribute("data-theme", isDark ? "dark" : "light");
    currentTheme = isDark ? "dark" : "light";
  } else {
    document.body.setAttribute("data-theme", theme);
    currentTheme = theme;
  }
  console.log("[Theme Manager] Theme applied:", theme);
}

/**
 * 현재 테마 가져오기
 * @returns {string} 현재 테마
 */
export function getCurrentTheme() {
  return currentTheme;
}

/**
 * 라이트 테마인지 확인
 * @returns {boolean}
 */
export function isLightTheme() {
  return currentTheme === "light";
}

/**
 * 다크 테마인지 확인
 * @returns {boolean}
 */
export function isDarkTheme() {
  return currentTheme === "dark";
}

/**
 * 확장에서 테마 정보 요청
 */
export function requestTheme() {
  postMessage({ command: "getChatTheme" });
}

/**
 * 테마 변경 메시지 핸들러 등록
 * @param {Function} callback - 테마 변경 시 호출될 콜백
 */
export function onThemeChange(callback) {
  window.addEventListener("message", (event) => {
    const message = event.data;
    if (message.command === "chatTheme" || message.command === "chatThemeSaved") {
      const theme = message.theme || message.value;
      if (theme) {
        applyThemeToBody(theme);
        if (callback) {
          callback(theme);
        }
      }
    }
  });
}

/**
 * 초기 테마 설정 (자동 요청 및 적용)
 * @param {Function} callback - 테마 적용 후 호출될 콜백
 */
export function initTheme(callback) {
  onThemeChange(callback);
  requestTheme();
}
