/**
 * Language Module
 * 언어 설정 관련 기능
 */

import { showStatus } from "./api-keys.js";

// 언어 데이터 저장
let languageData = {};
let currentLanguage = "ko";

/**
 * 언어 데이터 가져오기
 */
export function getLanguageData() {
  return languageData;
}

/**
 * 언어 데이터 설정
 */
export function setLanguageData(data) {
  languageData = data;
}

/**
 * 현재 언어 가져오기
 */
export function getCurrentLanguage() {
  return currentLanguage;
}

/**
 * 현재 언어 설정
 */
export function setCurrentLanguage(lang) {
  currentLanguage = lang;
}

/**
 * 언어 로드
 * @param {string} lang - 언어 코드
 * @param {Object} vscode - VS Code API
 */
export function loadLanguage(lang, vscode) {
  try {
    if (vscode) {
      vscode.postMessage({ command: "getLanguageData", language: lang });
    }
  } catch (e) {
    console.error("Failed to load language:", lang, e);
  }
}

/**
 * 언어 이벤트 바인딩
 * @param {Object} elements - DOM 요소들
 */
export function bindLanguageEvents(elements) {
  const { languageSelect, saveLanguageButton, sourcePathStatus, vscode } =
    elements;

  // 언어 선택 변경
  if (languageSelect) {
    languageSelect.addEventListener("change", (e) => {
      const lang = e.target.value;
      console.log("Language changed to:", lang);

      // 언어 데이터 로드 요청
      loadLanguage(lang, vscode);

      // 언어 저장 요청
      if (vscode) {
        vscode.postMessage({ command: "saveLanguage", language: lang });
      }

      // 임시로 현재 언어 업데이트
      currentLanguage = lang;

      // 즉시 UI 업데이트 시도
      if (Object.keys(languageData).length > 0) {
        console.log("Immediate UI update with existing language data");
      }
    });
  }

  // 언어 저장 버튼
  if (saveLanguageButton) {
    saveLanguageButton.addEventListener("click", () => {
      const selectedLang = languageSelect.value;
      console.log("Manual language save requested:", selectedLang);

      if (selectedLang === currentLanguage) {
        console.log("Language already saved, skipping duplicate save");
        return;
      }

      if (vscode) {
        vscode.postMessage({ command: "saveLanguage", language: selectedLang });
      }

      currentLanguage = selectedLang;
      loadLanguage(selectedLang, vscode);
    });
  }
}

/**
 * 언어 UI 적용
 * @param {Object} elements - DOM 요소들
 */
export function applyLanguageUI(elements) {
  const {
    settingsTitle,
    languageLabel,
    saveLanguageButton,
    apiKeySectionTitle,
    geminiApiKeyLabel,
    geminiApiKeyStatus,
    sourcePathLabel,
    addSourcePathButton,
    autoUpdateLabel,
    autoUpdateOn,
    autoUpdateOff,
    sourcePathStatus,
    sourcePathsList,
    geminiApiKeyInput,
    localOllamaApiUrlInput,
    remoteOllamaApiUrlInput,
    banyaLicenseSerialInput,
    banyaLicenseStatus,
    aiModelSelectLabel,
    aiModelSelect,
    ollamaApiLabel,
    banyaLicenseTitle,
    banyaLicenseLabel,
    localOllamaApiUrlStatus,
    remoteOllamaApiUrlStatus,
  } = elements;

  // 타이틀
  if (settingsTitle && languageData["settingsTitle"]) {
    settingsTitle.textContent = languageData["settingsTitle"];
  }

  // 언어 라벨
  if (languageLabel && languageData["languageLabel"]) {
    languageLabel.textContent = languageData["languageLabel"];
  }

  // 언어 저장 버튼
  if (saveLanguageButton && languageData["saveButton"]) {
    saveLanguageButton.textContent = languageData["saveButton"];
  }

  // API 키 섹션 타이틀
  if (apiKeySectionTitle && languageData["apiKeySectionTitle"]) {
    apiKeySectionTitle.textContent = languageData["apiKeySectionTitle"];
  }

  // Gemini API 키 라벨
  if (geminiApiKeyLabel && languageData["geminiApiKeyLabel"]) {
    geminiApiKeyLabel.textContent = languageData["geminiApiKeyLabel"];
  }

  // Gemini API 저장 상태
  if (geminiApiKeyStatus) {
    const currentText = geminiApiKeyStatus.textContent;
    if (
      currentText.includes("저장됨") ||
      currentText.includes("Saved") ||
      currentText.includes("已保存")
    ) {
      geminiApiKeyStatus.textContent = languageData["geminiApiKeyStatusSaved"];
    } else if (
      currentText.includes("미저장") ||
      currentText.includes("Not Saved") ||
      currentText.includes("未保存")
    ) {
      geminiApiKeyStatus.textContent =
        languageData["geminiApiKeyStatusNotSaved"];
    }
  }

  // 소스 경로 라벨
  if (sourcePathLabel && languageData["sourcePathLabel"]) {
    sourcePathLabel.textContent = languageData["sourcePathLabel"];
  }

  // 소스 경로 추가 버튼
  if (addSourcePathButton && languageData["addSourcePathButton"]) {
    addSourcePathButton.textContent = languageData["addSourcePathButton"];
  }

  // 자동 파일 업데이트 라벨
  if (autoUpdateLabel && languageData["autoUpdateLabel"]) {
    autoUpdateLabel.textContent = languageData["autoUpdateLabel"];
  }

  // 자동 파일 업데이트 on/off
  if (autoUpdateOn && languageData["autoUpdateOn"]) {
    autoUpdateOn.textContent = languageData["autoUpdateOn"];
  }
  if (autoUpdateOff && languageData["autoUpdateOff"]) {
    autoUpdateOff.textContent = languageData["autoUpdateOff"];
  }

  // placeholder 업데이트
  if (geminiApiKeyInput && languageData["pleaseEnterApiKey"]) {
    geminiApiKeyInput.placeholder = languageData["pleaseEnterApiKey"];
  }
  if (localOllamaApiUrlInput && languageData["pleaseEnterOllamaApiUrl"]) {
    localOllamaApiUrlInput.placeholder =
      languageData["pleaseEnterOllamaApiUrl"];
  }
  if (remoteOllamaApiUrlInput && languageData["pleaseEnterOllamaApiUrl"]) {
    remoteOllamaApiUrlInput.placeholder =
      languageData["pleaseEnterOllamaApiUrl"];
  }
  if (banyaLicenseSerialInput && languageData["pleaseEnterBanyaLicense"]) {
    banyaLicenseSerialInput.placeholder =
      languageData["pleaseEnterBanyaLicense"];
  }

  // AI 모델 선택 라벨
  if (aiModelSelectLabel && languageData["aiModelSelectLabel"]) {
    aiModelSelectLabel.innerHTML = `<b>${languageData["aiModelSelectLabel"]}</b>`;
  }

  // AI 모델 선택 옵션들
  if (aiModelSelect && languageData["geminiOption"]) {
    const geminiOption = aiModelSelect.querySelector('option[value="gemini"]');
    if (geminiOption) {
      geminiOption.textContent = languageData["geminiOption"];
    }
  }
  if (aiModelSelect && languageData["ollamaOption"]) {
    const ollamaOption = aiModelSelect.querySelector('option[value="ollama"]');
    if (ollamaOption) {
      ollamaOption.textContent = languageData["ollamaOption"];
    }
  }
  if (aiModelSelect && languageData["banyaOption"]) {
    const banyaOption = aiModelSelect.querySelector('option[value="banya"]');
    if (banyaOption) {
      banyaOption.textContent = languageData["banyaOption"];
    }
  }

  // Ollama API 라벨
  if (ollamaApiLabel && languageData["ollamaApiLabel"]) {
    ollamaApiLabel.textContent = languageData["ollamaApiLabel"];
  }

  // Banya 라이센스 타이틀
  if (banyaLicenseTitle && languageData["banyaLicenseTitle"]) {
    banyaLicenseTitle.textContent = languageData["banyaLicenseTitle"];
  }

  // Banya 라이센스 라벨
  if (banyaLicenseLabel && languageData["banyaLicenseLabel"]) {
    banyaLicenseLabel.textContent = languageData["banyaLicenseLabel"];
  }

  // 상태 메시지 업데이트
  if (banyaLicenseStatus && banyaLicenseStatus.textContent) {
    const currentText = banyaLicenseStatus.textContent;
    if (
      currentText.includes("설정되지 않았습니다") ||
      currentText.includes("not set")
    ) {
      banyaLicenseStatus.textContent =
        languageData["banyaLicenseNotSet"] ||
        "Banya 라이센스가 설정되지 않았습니다.";
    } else if (
      currentText.includes("설정되어 있습니다") ||
      currentText.includes("is set")
    ) {
      banyaLicenseStatus.textContent =
        languageData["banyaLicenseSet"] ||
        "Banya 라이센스가 설정되어 있습니다.";
    }
  }
}
