/**
 * Ollama Settings Module
 * Ollama 서버 설정 관련 기능 (로컬/원격 서버, 모델 선택)
 */

import { showStatus } from "./api-keys.js";

// 모듈 상태
let storedOllamaModel = null;
let currentSettingsOllamaModel = null;

/**
 * 저장된 Ollama 모델 값 설정
 * @param {string} model
 */
export function setStoredOllamaModel(model) {
  storedOllamaModel = model;
}

/**
 * 저장된 Ollama 모델 값 가져오기
 * @returns {string|null}
 */
export function getStoredOllamaModel() {
  return storedOllamaModel;
}

/**
 * currentSettings에서 받은 Ollama 모델 값 설정
 * @param {string} model
 */
export function setCurrentSettingsOllamaModel(model) {
  currentSettingsOllamaModel = model;
}

/**
 * currentSettings에서 받은 Ollama 모델 값 가져오기
 * @returns {string|null}
 */
export function getCurrentSettingsOllamaModel() {
  return currentSettingsOllamaModel;
}

/**
 * Ollama 모델 목록 로드 요청
 * @param {Object} vscode - vscode API 객체
 */
export function loadOllamaModels(vscode) {
  if (vscode) {
    vscode.postMessage({ command: "getOllamaModels" });
  }
}

/**
 * Ollama 서버 타입에 따른 설정 섹션 표시/숨김
 * @param {string} serverType - 'local' 또는 'remote'
 * @param {Object} elements - DOM 요소들
 */
export function updateOllamaSettingsVisibility(serverType, elements) {
  const {
    localOllamaSettingsSection,
    remoteOllamaSettingsSection,
    ollamaSettingsGroup,
  } = elements;

  if (serverType === "local") {
    if (localOllamaSettingsSection) {
      localOllamaSettingsSection.style.display = "block";
    }
    if (remoteOllamaSettingsSection) {
      remoteOllamaSettingsSection.style.display = "none";
    }
  } else if (serverType === "remote") {
    if (localOllamaSettingsSection) {
      localOllamaSettingsSection.style.display = "none";
    }
    if (remoteOllamaSettingsSection) {
      remoteOllamaSettingsSection.style.display = "block";
    }
  }

  // Ollama 설정 그룹 표시
  if (ollamaSettingsGroup) {
    ollamaSettingsGroup.style.display = "block";
  }
}

/**
 * Ollama 서버 타입 이벤트 바인딩
 * @param {Object} elements - DOM 요소들
 * @param {Object} vscode - vscode API 객체
 */
export function bindOllamaServerTypeEvents(elements, vscode) {
  const {
    ollamaServerTypeSelect,
    saveOllamaServerTypeButton,
    ollamaServerTypeStatus,
    localOllamaSettingsSection,
    remoteOllamaSettingsSection,
  } = elements;

  // 서버 타입 변경 시 설정 섹션 표시/숨김
  if (ollamaServerTypeSelect) {
    ollamaServerTypeSelect.addEventListener("change", () => {
      const serverType = ollamaServerTypeSelect.value;
      updateOllamaSettingsVisibility(serverType, elements);
    });
  }

  // 서버 타입 저장 버튼
  if (saveOllamaServerTypeButton) {
    saveOllamaServerTypeButton.addEventListener("click", () => {
      const serverType = ollamaServerTypeSelect?.value;
      if (serverType && vscode) {
        vscode.postMessage({
          command: "saveOllamaServerType",
          serverType: serverType,
        });
        showStatus(ollamaServerTypeStatus, "서버 타입 저장 중...", "info");
      }
    });
  }
}

/**
 * 로컬 Ollama 설정 이벤트 바인딩
 * @param {Object} elements - DOM 요소들
 * @param {Object} vscode - vscode API 객체
 */
export function bindLocalOllamaEvents(elements, vscode) {
  const {
    localOllamaApiUrlInput,
    saveLocalOllamaApiUrlButton,
    localOllamaApiUrlStatus,
    localOllamaEndpointSelect,
    saveLocalOllamaEndpointButton,
    localOllamaEndpointStatus,
  } = elements;

  // 로컬 API URL 변경 시 모델 목록 다시 불러오기
  if (localOllamaApiUrlInput) {
    localOllamaApiUrlInput.addEventListener("change", () => {
      loadOllamaModels(vscode);
    });

    localOllamaApiUrlInput.addEventListener("blur", () => {
      loadOllamaModels(vscode);
    });
  }

  // 로컬 API URL 저장 버튼
  if (saveLocalOllamaApiUrlButton) {
    saveLocalOllamaApiUrlButton.addEventListener("click", () => {
      const apiUrl = localOllamaApiUrlInput?.value?.trim();
      if (apiUrl && vscode) {
        vscode.postMessage({
          command: "saveLocalOllamaApiUrl",
          apiUrl: apiUrl,
        });
        showStatus(localOllamaApiUrlStatus, "API URL 저장 중...", "info");
      }
    });
  }

  // 로컬 엔드포인트 저장 버튼
  if (saveLocalOllamaEndpointButton) {
    saveLocalOllamaEndpointButton.addEventListener("click", () => {
      const endpoint = localOllamaEndpointSelect?.value;
      if (endpoint && vscode) {
        vscode.postMessage({
          command: "saveLocalOllamaEndpoint",
          endpoint: endpoint,
        });
        showStatus(localOllamaEndpointStatus, "엔드포인트 저장 중...", "info");
      }
    });
  }
}

/**
 * 원격 Ollama 설정 이벤트 바인딩
 * @param {Object} elements - DOM 요소들
 * @param {Object} vscode - vscode API 객체
 */
export function bindRemoteOllamaEvents(elements, vscode) {
  const {
    remoteOllamaModelInput,
    saveRemoteOllamaModelButton,
    remoteOllamaModelStatus,
    remoteOllamaApiUrlInput,
    saveRemoteOllamaApiUrlButton,
    remoteOllamaApiUrlStatus,
    remoteOllamaEndpointSelect,
    saveRemoteOllamaEndpointButton,
    remoteOllamaEndpointStatus,
  } = elements;

  // 원격 모델명 저장 버튼
  if (saveRemoteOllamaModelButton) {
    saveRemoteOllamaModelButton.addEventListener("click", () => {
      const model = remoteOllamaModelInput?.value?.trim();
      if (model && vscode) {
        vscode.postMessage({
          command: "saveRemoteOllamaModel",
          model: model,
        });
        showStatus(remoteOllamaModelStatus, "모델명 저장 중...", "info");
      }
    });
  }

  // 원격 API URL 저장 버튼
  if (saveRemoteOllamaApiUrlButton) {
    saveRemoteOllamaApiUrlButton.addEventListener("click", () => {
      const apiUrl = remoteOllamaApiUrlInput?.value?.trim();
      if (apiUrl && vscode) {
        vscode.postMessage({
          command: "saveRemoteOllamaApiUrl",
          apiUrl: apiUrl,
        });
        showStatus(remoteOllamaApiUrlStatus, "API URL 저장 중...", "info");
      }
    });
  }

  // 원격 엔드포인트 저장 버튼
  if (saveRemoteOllamaEndpointButton) {
    saveRemoteOllamaEndpointButton.addEventListener("click", () => {
      const endpoint = remoteOllamaEndpointSelect?.value;
      if (endpoint && vscode) {
        vscode.postMessage({
          command: "saveRemoteOllamaEndpoint",
          endpoint: endpoint,
        });
        showStatus(remoteOllamaEndpointStatus, "엔드포인트 저장 중...", "info");
      }
    });
  }
}

/**
 * Ollama 모델 선택 이벤트 바인딩
 * @param {Object} elements - DOM 요소들
 * @param {Object} vscode - vscode API 객체
 */
export function bindOllamaModelSelectEvents(elements, vscode) {
  const { ollamaModelSelect, saveOllamaModelButton, ollamaModelStatus } =
    elements;

  // Ollama 모델 저장 버튼
  if (saveOllamaModelButton) {
    saveOllamaModelButton.addEventListener("click", () => {
      const model = ollamaModelSelect?.value;
      if (model && vscode) {
        vscode.postMessage({
          command: "saveOllamaModel",
          model: model,
        });
        showStatus(ollamaModelStatus, "모델 저장 중...", "info");
        storedOllamaModel = model;
      }
    });
  }
}

/**
 * Ollama 모델 목록 업데이트
 * @param {HTMLSelectElement} selectElement - 모델 선택 요소
 * @param {Array<string>} models - 모델 목록
 * @param {string|null} selectedModel - 선택할 모델
 */
export function updateOllamaModelList(selectElement, models, selectedModel) {
  if (!selectElement) return;

  // 기존 옵션 제거
  selectElement.innerHTML = "";

  // 모델 목록 추가
  if (models && models.length > 0) {
    models.forEach((model) => {
      const option = document.createElement("option");
      option.value = model;
      option.textContent = model;
      selectElement.appendChild(option);
    });

    // 선택된 모델 설정
    if (selectedModel && models.includes(selectedModel)) {
      selectElement.value = selectedModel;
    } else if (storedOllamaModel && models.includes(storedOllamaModel)) {
      selectElement.value = storedOllamaModel;
    } else if (
      currentSettingsOllamaModel &&
      models.includes(currentSettingsOllamaModel)
    ) {
      selectElement.value = currentSettingsOllamaModel;
    }
  } else {
    // 모델이 없을 경우 기본 옵션
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "모델을 찾을 수 없습니다";
    selectElement.appendChild(option);
  }
}

/**
 * 모든 Ollama 설정 이벤트 바인딩 (통합 함수)
 * @param {Object} elements - DOM 요소들
 * @param {Object} vscode - vscode API 객체
 */
export function bindAllOllamaEvents(elements, vscode) {
  bindOllamaServerTypeEvents(elements, vscode);
  bindLocalOllamaEvents(elements, vscode);
  bindRemoteOllamaEvents(elements, vscode);
  bindOllamaModelSelectEvents(elements, vscode);
}
