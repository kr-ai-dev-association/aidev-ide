/**
 * Model Routing Module
 * 모델 라우팅 설정 관련 기능 (Compactor, Command, Intent)
 */

import { showStatus } from "./api-keys.js";

// 라우팅 모델용 Ollama 모델 리스트 캐시
let routingOllamaModelsCache = [];

/**
 * 라우팅 Ollama 모델 캐시 가져오기
 */
export function getRoutingOllamaModelsCache() {
  return routingOllamaModelsCache;
}

/**
 * 라우팅 Ollama 모델 캐시 설정
 */
export function setRoutingOllamaModelsCache(models) {
  routingOllamaModelsCache = models;
  window.routingOllamaModelsCache = models;
}

// 하위 모델 옵션 정의
const submodelOptions = {
  gemini: [
    {
      value: "gemini-3-flash-preview",
      label: "Gemini 3 Flash Preview (권장)",
    },
    { value: "gemini-3-pro-preview", label: "Gemini 3 Pro Preview" },
  ],
  banya: [
    { value: "Banya Solar:100b", label: "Banya Solar:100b" },
    { value: "Banya Qwen-Coder:32b", label: "Banya Qwen-Coder:32b" },
  ],
  ollama: [],
};

/**
 * 하위 모델 옵션 가져오기
 */
export function getSubmodelOptions(modelType) {
  if (modelType === "ollama") {
    return routingOllamaModelsCache.map((name) => ({ value: name, label: name }));
  }
  return submodelOptions[modelType] || [];
}

/**
 * 라우팅 모델용 Ollama 모델 리스트 요청
 * @param {Object} vscode - VS Code API
 */
export function loadRoutingOllamaModels(vscode) {
  console.log("[Settings] Requesting routing Ollama models");
  if (vscode) {
    vscode.postMessage({ command: "getRoutingOllamaModels" });
  }
}

/**
 * 하위 모델 셀렉트 업데이트
 * @param {HTMLElement} submodelSelect - 서브모델 셀렉트 요소
 * @param {string} modelType - 모델 타입
 */
export function updateSubmodelSelect(submodelSelect, modelType) {
  if (!submodelSelect) return;

  submodelSelect.innerHTML = "";
  const options = getSubmodelOptions(modelType);

  if (modelType === "ollama" && options.length === 0) {
    const loadingOption = document.createElement("option");
    loadingOption.value = "";
    loadingOption.textContent = "모델 로딩 중...";
    submodelSelect.appendChild(loadingOption);
  } else {
    options.forEach((opt) => {
      const option = document.createElement("option");
      option.value = opt.value;
      option.textContent = opt.label;
      submodelSelect.appendChild(option);
    });
  }
}

/**
 * 모델 타입 변경 처리
 * @param {string} prefix - 접두사 (compactor, command, intent)
 * @param {string} modelType - 모델 타입
 * @param {Object} vscode - VS Code API
 */
export function handleModelTypeChange(prefix, modelType, vscode) {
  const submodelContainer = document.getElementById(
    `${prefix}-submodel-container`
  );
  const apikeyContainer = document.getElementById(`${prefix}-apikey-container`);
  const submodelSelect = document.getElementById(`${prefix}-submodel-select`);
  const modelStatus = document.getElementById(`${prefix}-model-status`);

  if (!modelType) {
    // 메인 모델 사용 선택 시 저장된 설정 삭제 및 UI 숨김
    if (submodelContainer) {
      submodelContainer.style.display = "none";
    }
    if (apikeyContainer) {
      apikeyContainer.style.display = "none";
    }

    // 저장된 라우팅 모델 설정 삭제
    const commandMap = {
      compactor: "clearCompactorModel",
      command: "clearCommandModel",
      intent: "clearIntentModel",
    };
    const deleteCommand = commandMap[prefix];
    if (deleteCommand && vscode) {
      console.log(
        `[Settings] Deleting ${prefix} model settings (switching to main model)`
      );
      vscode.postMessage({ command: deleteCommand });
      if (modelStatus) {
        modelStatus.textContent = "메인 모델 사용으로 변경되었습니다.";
        modelStatus.className = "info-message success-message";
      }
    }
    return;
  }

  // ollama 선택 시 동적으로 모델 리스트 가져오기
  if (modelType === "ollama") {
    if (routingOllamaModelsCache && routingOllamaModelsCache.length > 0) {
      // 캐시된 리스트가 있으면 사용
    } else {
      // 캐시가 없으면 서버에서 가져오기
      loadRoutingOllamaModels(vscode);
    }
  }

  // 하위 모델 셀렉트 업데이트 및 표시
  if (submodelSelect) {
    updateSubmodelSelect(submodelSelect, modelType);
  }
  if (submodelContainer) {
    submodelContainer.style.display = "block";
  }

  // API 키 입력은 gemini, banya만 표시
  if (apikeyContainer) {
    apikeyContainer.style.display =
      modelType === "gemini" || modelType === "banya" ? "block" : "none";
  }
}

/**
 * 모델 라우팅 이벤트 바인딩
 * @param {Object} vscode - VS Code API
 */
export function bindModelRoutingEvents(vscode) {
  // Compactor 모델 타입 선택 변경
  const compactorTypeSelect = document.getElementById(
    "compactor-model-type-select"
  );
  if (compactorTypeSelect) {
    compactorTypeSelect.addEventListener("change", (e) => {
      handleModelTypeChange("compactor", e.target.value, vscode);
    });
  }

  // Command 모델 타입 선택 변경
  const commandTypeSelect = document.getElementById("command-model-type-select");
  if (commandTypeSelect) {
    commandTypeSelect.addEventListener("change", (e) => {
      handleModelTypeChange("command", e.target.value, vscode);
    });
  }

  // Intent 모델 타입 선택 변경
  const intentTypeSelect = document.getElementById("intent-model-type-select");
  if (intentTypeSelect) {
    intentTypeSelect.addEventListener("change", (e) => {
      handleModelTypeChange("intent", e.target.value, vscode);
    });
  }

  // Compactor 모델 저장 버튼
  const saveCompactorModelButton = document.getElementById(
    "save-compactor-model-button"
  );
  if (saveCompactorModelButton) {
    saveCompactorModelButton.addEventListener("click", () => {
      saveRoutingModel("compactor", vscode);
    });
  }

  // Command 모델 저장 버튼
  const saveCommandModelButton = document.getElementById(
    "save-command-model-button"
  );
  if (saveCommandModelButton) {
    saveCommandModelButton.addEventListener("click", () => {
      saveRoutingModel("command", vscode);
    });
  }

  // Intent 모델 저장 버튼
  const saveIntentModelButton = document.getElementById(
    "save-intent-model-button"
  );
  if (saveIntentModelButton) {
    saveIntentModelButton.addEventListener("click", () => {
      saveRoutingModel("intent", vscode);
    });
  }

  // API 키 저장 버튼들
  setupApiKeySaveButton("compactor", vscode);
  setupApiKeySaveButton("command", vscode);
  setupApiKeySaveButton("intent", vscode);
}

/**
 * 라우팅 모델 저장
 * @param {string} prefix - 접두사
 * @param {Object} vscode - VS Code API
 */
function saveRoutingModel(prefix, vscode) {
  const typeSelect = document.getElementById(`${prefix}-model-type-select`);
  const submodelSelect = document.getElementById(`${prefix}-submodel-select`);
  const modelStatus = document.getElementById(`${prefix}-model-status`);

  const modelType = typeSelect ? typeSelect.value : "";
  const modelName = submodelSelect ? submodelSelect.value : "";

  if (!modelType) {
    if (modelStatus) {
      modelStatus.textContent = "모델 타입을 선택해주세요.";
      modelStatus.className = "info-message error-message";
    }
    return;
  }

  const commandMap = {
    compactor: "saveCompactorModel",
    command: "saveCommandModel",
    intent: "saveIntentModel",
  };

  if (vscode) {
    vscode.postMessage({
      command: commandMap[prefix],
      modelType: modelType,
      modelName: modelName,
    });
  }
}

/**
 * API 키 저장 버튼 설정
 * @param {string} prefix - 접두사
 * @param {Object} vscode - VS Code API
 */
function setupApiKeySaveButton(prefix, vscode) {
  const saveButton = document.getElementById(`save-${prefix}-api-key-button`);
  if (saveButton) {
    saveButton.addEventListener("click", () => {
      const typeSelect = document.getElementById(`${prefix}-model-type-select`);
      const apiKeyInput = document.getElementById(`${prefix}-api-key-input`);
      const modelStatus = document.getElementById(`${prefix}-model-status`);

      const modelType = typeSelect ? typeSelect.value : "";
      const apiKey = apiKeyInput ? apiKeyInput.value : "";

      if (!apiKey) {
        if (modelStatus) {
          modelStatus.textContent = "API 키를 입력해주세요.";
          modelStatus.className = "info-message error-message";
        }
        return;
      }

      const commandMap = {
        compactor: "saveCompactorApiKey",
        command: "saveCommandApiKey",
        intent: "saveIntentApiKey",
      };

      if (vscode) {
        vscode.postMessage({
          command: commandMap[prefix],
          modelType: modelType,
          apiKey: apiKey,
        });
      }

      // 입력 필드 초기화
      if (apiKeyInput) {
        apiKeyInput.value = "";
      }
    });
  }
}
