/**
 * Ollama Module
 * Ollama 설정 관련 기능
 */

import { showStatus } from "./api-keys.js";

let storedOllamaModel = null;
let currentSettingsOllamaModel = null;

/**
 * 저장된 Ollama 모델 가져오기
 */
export function getStoredOllamaModel() {
  return storedOllamaModel;
}

/**
 * 저장된 Ollama 모델 설정
 */
export function setStoredOllamaModel(model) {
  storedOllamaModel = model;
}

/**
 * 현재 설정 Ollama 모델 가져오기
 */
export function getCurrentSettingsOllamaModel() {
  return currentSettingsOllamaModel;
}

/**
 * 현재 설정 Ollama 모델 설정
 */
export function setCurrentSettingsOllamaModel(model) {
  currentSettingsOllamaModel = model;
}

/**
 * Ollama 모델 로드
 * @param {Object} vscode - VS Code API
 */
export function loadOllamaModels(vscode) {
  if (vscode) {
    vscode.postMessage({ command: "getOllamaModels" });
  }
}

/**
 * URL 유효성 검사
 * @param {string} url - 검사할 URL
 * @returns {boolean}
 */
export function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Ollama 서버 타입 변경 처리
 * @param {string} serverType - 'local' 또는 'remote'
 * @param {Object} elements - DOM 요소들
 */
export function handleServerTypeChange(serverType, elements) {
  const {
    localOllamaSettingsSection,
    remoteOllamaSettingsSection,
  } = elements;

  if (serverType === "remote") {
    if (localOllamaSettingsSection) {
      localOllamaSettingsSection.classList.add("disabled");
      localOllamaSettingsSection.style.display = "none";
    }
    if (remoteOllamaSettingsSection) {
      remoteOllamaSettingsSection.classList.remove("disabled");
      remoteOllamaSettingsSection.style.display = "block";
    }
  } else {
    if (localOllamaSettingsSection) {
      localOllamaSettingsSection.classList.remove("disabled");
      localOllamaSettingsSection.style.display = "block";
    }
    if (remoteOllamaSettingsSection) {
      remoteOllamaSettingsSection.classList.add("disabled");
      remoteOllamaSettingsSection.style.display = "none";
    }
  }
}

/**
 * Ollama 이벤트 바인딩
 * @param {Object} elements - DOM 요소들
 * @param {Object} languageData - 언어 데이터
 */
export function bindOllamaEvents(elements, languageData) {
  const {
    ollamaServerTypeSelect,
    saveOllamaServerTypeButton,
    ollamaServerTypeStatus,
    localOllamaApiUrlInput,
    saveLocalOllamaApiUrlButton,
    localOllamaApiUrlStatus,
    localOllamaEndpointSelect,
    saveLocalOllamaEndpointButton,
    localOllamaEndpointStatus,
    remoteOllamaApiUrlInput,
    saveRemoteOllamaApiUrlButton,
    remoteOllamaApiUrlStatus,
    remoteOllamaEndpointSelect,
    saveRemoteOllamaEndpointButton,
    remoteOllamaEndpointStatus,
    remoteOllamaModelInput,
    saveRemoteOllamaModelButton,
    remoteOllamaModelStatus,
    ollamaModelSelect,
    saveOllamaModelButton,
    ollamaModelStatus,
    localOllamaSettingsSection,
    remoteOllamaSettingsSection,
    vscode,
  } = elements;

  // Ollama 서버 타입 변경
  if (ollamaServerTypeSelect) {
    ollamaServerTypeSelect.addEventListener("change", () => {
      const serverType = ollamaServerTypeSelect.value;
      handleServerTypeChange(serverType, elements);
    });
  }

  // Ollama 서버 타입 저장
  if (saveOllamaServerTypeButton) {
    saveOllamaServerTypeButton.addEventListener("click", () => {
      const serverType = ollamaServerTypeSelect.value;
      if (serverType) {
        vscode.postMessage({
          command: "saveOllamaServerType",
          serverType: serverType,
        });
        const savingText =
          languageData["ollamaServerTypeSaving"] || "Ollama 서버 타입 저장 중...";
        showStatus(ollamaServerTypeStatus, savingText, "info");
      } else {
        const pleaseSelectText =
          languageData["pleaseSelectOllamaServerType"] ||
          "서버 타입을 선택해주세요.";
        showStatus(ollamaServerTypeStatus, pleaseSelectText, "error");
      }
    });
  }

  // 로컬 Ollama API URL 저장
  if (saveLocalOllamaApiUrlButton) {
    saveLocalOllamaApiUrlButton.addEventListener("click", () => {
      const apiUrl = localOllamaApiUrlInput.value.trim();
      if (apiUrl) {
        if (isValidUrl(apiUrl)) {
          vscode.postMessage({
            command: "saveLocalOllamaApiUrl",
            apiUrl: apiUrl,
          });
          const savingText =
            languageData["ollamaApiUrlSaving"] || "로컬 Ollama API URL 저장 중...";
          showStatus(localOllamaApiUrlStatus, savingText, "info");
        } else {
          const invalidText =
            languageData["invalidUrlFormat"] || "올바른 URL 형식이 아닙니다.";
          showStatus(localOllamaApiUrlStatus, invalidText, "error");
        }
      } else {
        const pleaseEnterText =
          languageData["pleaseEnterOllamaApiUrl"] ||
          "Ollama API URL을 입력해주세요.";
        showStatus(localOllamaApiUrlStatus, pleaseEnterText, "error");
      }
    });
  }

  // 로컬 Ollama 엔드포인트 저장
  if (saveLocalOllamaEndpointButton) {
    saveLocalOllamaEndpointButton.addEventListener("click", () => {
      const endpoint = localOllamaEndpointSelect.value;
      if (endpoint) {
        vscode.postMessage({
          command: "saveLocalOllamaEndpoint",
          endpoint: endpoint,
        });
        const savingText = "로컬 Ollama 엔드포인트 저장 중...";
        showStatus(localOllamaEndpointStatus, savingText, "info");
      } else {
        showStatus(localOllamaEndpointStatus, "엔드포인트를 선택해주세요.", "error");
      }
    });
  }

  // 원격 Ollama API URL 저장
  if (saveRemoteOllamaApiUrlButton) {
    saveRemoteOllamaApiUrlButton.addEventListener("click", () => {
      const apiUrl = remoteOllamaApiUrlInput.value.trim();
      if (apiUrl) {
        if (isValidUrl(apiUrl)) {
          vscode.postMessage({
            command: "saveRemoteOllamaApiUrl",
            apiUrl: apiUrl,
          });
          const savingText =
            languageData["ollamaApiUrlSaving"] || "원격 서버 API URL 저장 중...";
          showStatus(remoteOllamaApiUrlStatus, savingText, "info");
        } else {
          const invalidText =
            languageData["invalidUrlFormat"] || "올바른 URL 형식이 아닙니다.";
          showStatus(remoteOllamaApiUrlStatus, invalidText, "error");
        }
      } else {
        const pleaseEnterText =
          languageData["pleaseEnterOllamaApiUrl"] ||
          "Ollama API URL을 입력해주세요.";
        showStatus(remoteOllamaApiUrlStatus, pleaseEnterText, "error");
      }
    });
  }

  // 원격 Ollama 엔드포인트 저장
  if (saveRemoteOllamaEndpointButton) {
    saveRemoteOllamaEndpointButton.addEventListener("click", () => {
      const endpoint = remoteOllamaEndpointSelect.value;
      if (endpoint) {
        vscode.postMessage({
          command: "saveRemoteOllamaEndpoint",
          endpoint: endpoint,
        });
        const savingText = "원격 서버 엔드포인트 저장 중...";
        showStatus(remoteOllamaEndpointStatus, savingText, "info");
      } else {
        showStatus(remoteOllamaEndpointStatus, "엔드포인트를 선택해주세요.", "error");
      }
    });
  }

  // 원격 Ollama 모델명 저장
  if (saveRemoteOllamaModelButton) {
    saveRemoteOllamaModelButton.addEventListener("click", () => {
      const model = remoteOllamaModelInput.value.trim();
      if (model) {
        vscode.postMessage({ command: "saveRemoteOllamaModel", model: model });
        const savingText = "원격 서버 모델명 저장 중...";
        showStatus(remoteOllamaModelStatus, savingText, "info");
      } else {
        showStatus(remoteOllamaModelStatus, "모델명을 입력해주세요.", "error");
      }
    });
  }

  // Ollama 모델 선택 저장
  if (saveOllamaModelButton) {
    saveOllamaModelButton.addEventListener("click", () => {
      const model = ollamaModelSelect?.value;
      if (model) {
        vscode.postMessage({ command: "saveOllamaModel", model: model });
        const savingText = "Ollama 모델 저장 중...";
        showStatus(ollamaModelStatus, savingText, "info");
      } else {
        showStatus(ollamaModelStatus, "모델을 선택해주세요.", "error");
      }
    });
  }

  // Ollama 모델 선택 변경 (자동 저장)
  if (ollamaModelSelect) {
    ollamaModelSelect.addEventListener("change", () => {
      const model = ollamaModelSelect.value;
      if (model) {
        try {
          showStatus(ollamaModelStatus, "Ollama 모델 자동 저장 중...", "info");
          vscode.postMessage({ command: "saveOllamaModel", model: model });
        } catch (e) {
          console.warn("Failed to autosave Ollama model:", e);
        }
      }
    });
  }
}

/**
 * Ollama 모델 목록 업데이트
 * @param {Array} models - 모델 목록
 * @param {HTMLElement} selectElement - select 요소
 * @param {string} currentModel - 현재 선택된 모델
 */
export function updateOllamaModelSelect(models, selectElement, currentModel) {
  if (!selectElement) return;

  // 현재 선택된 모델 저장
  const savedModel = currentModel || selectElement.value;

  selectElement.innerHTML = "";

  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = "모델을 선택하세요";
  selectElement.appendChild(defaultOption);

  if (Array.isArray(models)) {
    models.forEach((name) => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      selectElement.appendChild(opt);
    });
  }

  // 저장된 모델 복원
  if (savedModel) {
    selectElement.value = savedModel;
  }
}
