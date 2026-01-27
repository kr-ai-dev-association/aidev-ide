/**
 * Model Dropdown Module
 * 모델 선택 드롭다운 관련 기능
 */

// 모델 상태
let currentOllamaModel = "";
let availableOllamaModels = [];

// Gemini 모델 정의
export const geminiModels = [
  { name: "gemini-3-pro-preview", displayName: "Gemini 3.0 Pro" },
  { name: "gemini-3-flash-preview", displayName: "Gemini 3.0 Flash" },
];

// Banya 모델 정의
export const banyaModels = [
  { name: "Banya Solar:100b", displayName: "Banya Solar 100B" },
  { name: "Banya Qwen-Coder:32b", displayName: "Banya Qwen-Coder 32B" },
];

/**
 * 모델 라벨 설정
 * @param {string} name - 모델 이름
 * @param {string} modelType - 모델 타입 ('gemini', 'banya', 'ollama')
 * @param {HTMLElement} modelLabel - 모델 라벨 요소
 * @param {HTMLElement} modelSelectorButton - 모델 선택 버튼 요소
 */
export function setModelLabel(name, modelType, modelLabel, modelSelectorButton) {
  if (modelLabel) {
    modelLabel.textContent = name || "Model";
  }
  // 모델 타입에 따라 버튼의 data-model-type 속성 설정
  if (modelSelectorButton) {
    modelSelectorButton.setAttribute("data-model-type", modelType || "ollama");
  }
}

/**
 * 모델 드롭다운 채우기
 * @param {Array} models - Ollama 모델 목록
 * @param {string} current - 현재 선택된 모델
 * @param {HTMLElement} modelDropdown - 드롭다운 요소
 * @param {HTMLElement} modelLabel - 모델 라벨 요소
 * @param {HTMLElement} modelSelectorButton - 모델 선택 버튼 요소
 * @param {Object} vscode - VS Code API
 */
export function populateModelDropdown(models, current, modelDropdown, modelLabel, modelSelectorButton, vscode) {
  // Ollama 모델 파싱
  availableOllamaModels = (models || [])
    .map((m) => {
      if (typeof m === "string") {
        return { name: m, displayName: m };
      }
      return {
        name: m?.name || "",
        displayName: m?.displayName || m?.name || "",
      };
    })
    .filter((m) => m.name);

  currentOllamaModel = current || "";

  if (!modelDropdown) return;
  modelDropdown.innerHTML = "";

  // Gemini 모델 추가
  geminiModels.forEach((m) => {
    const item = createModelItem(m, currentOllamaModel, "gemini", modelLabel, modelSelectorButton, modelDropdown, vscode);
    modelDropdown.appendChild(item);
  });

  // 구분선
  const separator1 = document.createElement("div");
  separator1.style.cssText = "height: 1px; background: var(--vscode-panel-border); margin: 4px 0;";
  modelDropdown.appendChild(separator1);

  // Banya 모델 추가
  banyaModels.forEach((m) => {
    const item = createModelItem(m, currentOllamaModel, "banya", modelLabel, modelSelectorButton, modelDropdown, vscode);
    modelDropdown.appendChild(item);
  });

  // Ollama 모델이 있으면 추가
  if (availableOllamaModels.length > 0) {
    const separator2 = document.createElement("div");
    separator2.style.cssText = "height: 1px; background: var(--vscode-panel-border); margin: 4px 0;";
    modelDropdown.appendChild(separator2);

    availableOllamaModels.forEach((m) => {
      const item = createModelItem(m, currentOllamaModel, "ollama", modelLabel, modelSelectorButton, modelDropdown, vscode);
      modelDropdown.appendChild(item);
    });
  }
}

/**
 * 모델 아이템 생성
 * @private
 */
function createModelItem(model, currentModel, modelType, modelLabel, modelSelectorButton, modelDropdown, vscode) {
  const item = document.createElement("div");
  item.className = "dropdown-option";
  if (model.name === currentModel) {
    item.classList.add("selected");
  }
  item.dataset.model = model.name;
  item.textContent = model.displayName;
  item.style.cssText = `
    padding: 4px 8px;
    cursor: pointer;
    font-size: 10px;
    border-radius: 4px;
  `;

  item.addEventListener("click", () => {
    currentOllamaModel = model.name;
    setModelLabel(model.displayName, modelType, modelLabel, modelSelectorButton);
    if (modelDropdown) {
      modelDropdown.classList.add("hidden");
      modelDropdown.style.display = "none";
    }

    // 모델 타입에 따른 메시지 전송
    if (vscode) {
      if (modelType === "gemini") {
        vscode.postMessage({ command: "setGeminiModel", model: model.name });
      } else if (modelType === "banya") {
        vscode.postMessage({ command: "setBanyaModel", model: model.name });
      } else {
        vscode.postMessage({ command: "setOllamaModel", model: model.name });
      }
    }
  });

  item.addEventListener("mouseenter", () => {
    item.style.background = "var(--vscode-list-hoverBackground)";
  });
  item.addEventListener("mouseleave", () => {
    if (!item.classList.contains("selected")) {
      item.style.background = "";
    }
  });

  return item;
}

/**
 * 모델 드롭다운 이벤트 바인딩
 * @param {HTMLElement} modelSelectorButton - 모델 선택 버튼
 * @param {HTMLElement} modelDropdown - 드롭다운 요소
 */
export function bindModelDropdownEvents(modelSelectorButton, modelDropdown) {
  if (!modelSelectorButton || !modelDropdown) return;

  modelSelectorButton.addEventListener("click", (e) => {
    e.stopPropagation();
    const isHidden = modelDropdown.classList.contains("hidden") || modelDropdown.style.display === "none";
    if (isHidden) {
      modelDropdown.classList.remove("hidden");
      modelDropdown.style.display = "block";
    } else {
      modelDropdown.classList.add("hidden");
      modelDropdown.style.display = "none";
    }
  });

  // 외부 클릭 시 닫기
  document.addEventListener("click", (e) => {
    if (!modelSelectorButton.contains(e.target) && !modelDropdown.contains(e.target)) {
      modelDropdown.classList.add("hidden");
      modelDropdown.style.display = "none";
    }
  });
}

/**
 * Ollama 모델 목록 요청
 * @param {Object} vscode - VS Code API
 */
export function requestOllamaModels(vscode) {
  if (vscode) {
    vscode.postMessage({ command: "getOllamaModels" });
  }
}

/**
 * 현재 모델 가져오기
 */
export function getCurrentModel() {
  return currentOllamaModel;
}

/**
 * 사용 가능한 Ollama 모델 목록 가져오기
 */
export function getAvailableOllamaModels() {
  return availableOllamaModels;
}
