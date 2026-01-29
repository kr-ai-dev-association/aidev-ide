/**
 * Shared Modules Index
 * 웹뷰에서 공유되는 모듈들의 통합 export
 */

// VSCode API
export {
  vscode,
  postMessage,
  setState,
  getState,
} from "./vscode-api.js";

// Theme Manager
export {
  applyThemeToBody,
  getCurrentTheme,
  isLightTheme,
  isDarkTheme,
  requestTheme,
  onThemeChange,
  initTheme,
} from "./theme-manager.js";

// Language Manager
export {
  getCurrentLanguage,
  setCurrentLanguage,
  getLanguageData,
  setLanguageData,
  t,
  loadLanguage,
  saveLanguage,
  handleLanguageMessage,
  requestCurrentLanguage,
} from "./language-manager.js";
