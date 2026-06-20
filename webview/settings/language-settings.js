/**
 * Language Settings Module
 * 다국어 지원 (i18n/localization) 관련 기능
 */

// 모듈 상태
let currentLanguage = "ko";
let languageData = {};

/**
 * 현재 언어 설정
 * @param {string} lang
 */
export function setCurrentLanguage(lang) {
  currentLanguage = lang;
}

/**
 * 현재 언어 가져오기
 * @returns {string}
 */
export function getCurrentLanguage() {
  return currentLanguage;
}

/**
 * 언어 데이터 설정
 * @param {Object} data
 */
export function setLanguageData(data) {
  languageData = data || {};
}

/**
 * 언어 데이터 가져오기
 * @returns {Object}
 */
export function getLanguageData() {
  return languageData;
}

/**
 * 언어 데이터 로드 요청
 * @param {string} lang - 언어 코드
 * @param {Object} vscode - vscode API 객체
 */
export function loadLanguage(lang, vscode) {
  if (vscode) {
    vscode.postMessage({ command: "getLanguageData", language: lang });
  }
}

/**
 * 언어 저장 요청
 * @param {string} lang - 언어 코드
 * @param {Object} vscode - vscode API 객체
 */
export function saveLanguage(lang, vscode) {
  if (vscode) {
    vscode.postMessage({ command: "saveLanguage", language: lang });
  }
}

/**
 * 언어 선택 이벤트 바인딩
 * @param {HTMLSelectElement} languageSelect - 언어 선택 요소
 * @param {Object} vscode - vscode API 객체
 * @param {Function} onLanguageChange - 언어 변경 시 콜백
 */
export function bindLanguageSelectEvents(languageSelect, vscode, onLanguageChange) {
  if (!languageSelect) return;

  languageSelect.addEventListener("change", (e) => {
    const lang = e.target.value;
    console.log("[Language] Language changed to:", lang);

    // 언어 데이터 로드 요청
    loadLanguage(lang, vscode);

    // 언어 저장 요청
    saveLanguage(lang, vscode);

    // 현재 언어 업데이트
    currentLanguage = lang;

    // 콜백 호출
    if (onLanguageChange) {
      onLanguageChange(lang);
    }
  });
}

/**
 * 언어 데이터를 UI에 적용
 * 이 함수는 settings.js에서 직접 호출하거나,
 * applyLanguageToElements를 사용하여 특정 요소들만 업데이트할 수 있습니다.
 */
export function applyLanguage() {
  // 타이틀
  applyText("settings-title", languageData["settingsTitle"]);

  // 언어 라벨
  applyText("language-label", languageData["languageLabel"]);

  // 언어 저장 버튼
  applyText("save-language-button", languageData["saveButton"]);

  // API 키 섹션 타이틀
  applyText("api-key-section-title", languageData["apiKeySectionTitle"]);

  // AI 모델 설정 설명
  const aiModelSettingsDescription = document.querySelector(
    "#api-key-section-title + p"
  );
  if (aiModelSettingsDescription && languageData["aiModelSettingsDescription"]) {
    aiModelSettingsDescription.textContent =
      languageData["aiModelSettingsDescription"];
  }

  // Gemini API 키 라벨
  applyText("gemini-api-key-label", languageData["geminiApiKeyLabel"]);

  // Gemini API 설명
  const geminiApiDescription = document.querySelector("#gemini-api-key-label + p");
  if (geminiApiDescription && languageData["geminiApiDescription"]) {
    geminiApiDescription.textContent = languageData["geminiApiDescription"];
  }

  // Gemini API 등록 방법 (링크 유지)
  const geminiApiRegistrationMethod = document.querySelector(
    "#gemini-api-key-label + p + p"
  );
  if (geminiApiRegistrationMethod && languageData["geminiApiRegistrationMethod"]) {
    const linkMatch = geminiApiRegistrationMethod.innerHTML.match(/<a[^>]*>([^<]*)<\/a>/);
    if (linkMatch) {
      const linkText = linkMatch[1];
      const newText = languageData["geminiApiRegistrationMethod"].replace(
        "Google AI Studio API 키 페이지",
        `<a href="https://aistudio.google.com/app/apikey" target="_blank">${linkText}</a>`
      );
      geminiApiRegistrationMethod.innerHTML = newText;
    } else {
      geminiApiRegistrationMethod.textContent =
        languageData["geminiApiRegistrationMethod"];
    }
  }

  // Gemini 저장 버튼
  applyText("save-gemini-api-key-button", languageData["saveGeminiApiKeyButton"]);

  // 상태 텍스트 업데이트 (저장됨/미저장)
  updateStatusText(
    "gemini-api-key-status",
    languageData["geminiApiKeyStatusSaved"],
    languageData["geminiApiKeyStatusNotSaved"]
  );

  // 공통 저장 버튼들
  document.querySelectorAll(".save-button").forEach((btn) => {
    if (languageData["saveButton"]) {
      btn.textContent = languageData["saveButton"];
    }
  });

  // 소스 경로 관련
  applyText("source-path-label", languageData["sourcePathLabel"]);
  applyText("add-source-path-button", languageData["addSourcePathButton"]);

  // 자동 파일 업데이트 관련
  applyText("auto-update-label", languageData["autoUpdateLabel"]);
  applyText("auto-update-on", languageData["autoUpdateOn"]);
  applyText("auto-update-off", languageData["autoUpdateOff"]);
  applyText("auto-update-enabled-text", languageData["autoUpdateEnabled"]);

  // Banya API 키 관련
  applyText("banya-api-key-label", languageData["banyaApiKeyLabel"]);
  applyText("save-banya-api-key-button", languageData["saveBanyaApiKeyButton"]);
  updateStatusText(
    "banya-api-key-status",
    languageData["banyaApiKeyStatusSaved"],
    languageData["banyaApiKeyStatusNotSaved"]
  );

  // AI 모델 선택 관련
  applyText("ai-model-label", languageData["aiModelLabel"]);
  applyText("save-ai-model-button", languageData["saveAiModelButton"]);

  // Ollama 설정 관련
  applyText("ollama-server-type-label", languageData["ollamaServerTypeLabel"]);
  applyText("local-ollama-api-url-label", languageData["localOllamaApiUrlLabel"]);
  applyText("local-ollama-endpoint-label", languageData["localOllamaEndpointLabel"]);
  applyText("remote-ollama-model-label", languageData["remoteOllamaModelLabel"]);
  applyText("remote-ollama-api-url-label", languageData["remoteOllamaApiUrlLabel"]);
  applyText("remote-ollama-endpoint-label", languageData["remoteOllamaEndpointLabel"]);
  applyText("ollama-model-label", languageData["ollamaModelLabel"]);

  // 스트리밍 관련
  applyText("streaming-label", languageData["streamingLabel"]);
  applyText("streaming-on", languageData["streamingOn"]);
  applyText("streaming-off", languageData["streamingOff"]);

  // 자동 테스트 재시도 관련
  applyText("auto-test-retry-label", languageData["autoTestRetryLabel"]);
  applyText("test-retry-spinner-label", languageData["testRetrySpinnerLabel"]);

  // 자동 오류 수정 관련
  applyText("auto-correction-label", languageData["autoCorrectionLabel"]);
  applyText("error-retry-spinner-label", languageData["errorRetrySpinnerLabel"]);

  // 자동 실행 관련
  applyText("auto-execute-label", languageData["autoExecuteLabel"]);

  console.log("[Language] Language applied:", currentLanguage);
}

/**
 * 요소에 텍스트 적용 헬퍼 함수
 * @param {string} elementId - 요소 ID
 * @param {string} text - 적용할 텍스트
 */
function applyText(elementId, text) {
  if (!text) return;
  const element = document.getElementById(elementId);
  if (element) {
    element.textContent = text;
  }
}

/**
 * 상태 텍스트 업데이트 (저장됨/미저장 등)
 * @param {string} elementId - 요소 ID
 * @param {string} savedText - 저장됨 텍스트
 * @param {string} notSavedText - 미저장 텍스트
 */
function updateStatusText(elementId, savedText, notSavedText) {
  const element = document.getElementById(elementId);
  if (!element) return;

  const currentText = element.textContent;

  // 저장됨 상태 확인 (다국어 지원)
  const savedKeywords = [
    "저장됨",
    "Saved",
    "Gespeichert",
    "Guardado",
    "Enregistré",
    "保存済み",
    "已保存",
  ];
  const notSavedKeywords = [
    "미저장",
    "Not Saved",
    "Nicht gespeichert",
    "No guardado",
    "Non enregistré",
    "未保存",
  ];

  if (savedKeywords.some((keyword) => currentText.includes(keyword))) {
    if (savedText) {
      element.textContent = savedText;
    }
  } else if (notSavedKeywords.some((keyword) => currentText.includes(keyword))) {
    if (notSavedText) {
      element.textContent = notSavedText;
    }
  }
}

/**
 * 언어 데이터 수신 처리
 * @param {Object} data - 수신된 언어 데이터
 */
export function handleLanguageDataReceived(data) {
  if (data && typeof data === "object") {
    languageData = data;
    console.log("[Language] Language data received, applying...");
    applyLanguage();
  }
}
