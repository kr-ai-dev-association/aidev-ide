/**
 * Theme Module
 * 테마 설정 관련 기능
 */

import { showStatus } from "./api-keys.js";

/**
 * 테마를 body에 적용
 * @param {string} theme - 테마 ('dark', 'light', 'auto')
 */
export function applyThemeToBody(theme) {
  if (theme === "auto") {
    const isDark =
      document.body.classList.contains("vscode-dark") ||
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.body.setAttribute("data-theme", isDark ? "dark" : "light");
  } else {
    document.body.setAttribute("data-theme", theme);
  }
  console.log("[Settings] Theme applied to body:", theme);
}

/**
 * 테마 이벤트 바인딩
 * @param {Object} elements - DOM 요소들
 */
export function bindThemeEvents(elements) {
  const { themeSelect, saveThemeButton, themeStatus, vscode } = elements;

  if (saveThemeButton && themeSelect) {
    saveThemeButton.addEventListener("click", () => {
      const selectedTheme = themeSelect.value;
      console.log("Theme save requested:", selectedTheme);

      if (vscode) {
        vscode.postMessage({ command: "saveChatTheme", theme: selectedTheme });
      }

      if (themeStatus) {
        const themeLabels = { dark: "다크", light: "라이트", auto: "자동" };
        themeStatus.textContent = `테마가 ${themeLabels[selectedTheme] || selectedTheme}(으)로 저장되었습니다.`;
        themeStatus.className = "info-message success-message";
      }
    });
  }
}

/**
 * 테마 초기화
 * @param {Object} vscode - VS Code API
 */
export function initializeTheme(vscode) {
  if (vscode) {
    vscode.postMessage({ command: "getChatTheme" });
  }
}
