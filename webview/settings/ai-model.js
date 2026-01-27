/**
 * AI Model Module
 * AI 모델 선택 관련 기능
 */

import { showStatus } from "./api-keys.js";
import { loadOllamaModels, handleServerTypeChange } from "./ollama.js";

/**
 * AI 모델 변경 처리
 * @param {string} selectedModel - 선택된 모델 ('gemini', 'banya', 'ollama')
 * @param {Object} elements - DOM 요소들
 * @param {boolean} isLoadingSettings - 설정 로드 중 여부
 */
export function handleAiModelChange(selectedModel, elements, isLoadingSettings) {
  const {
    geminiSettingsSection,
    banyaSettingsSection,
    ollamaSettingsGroup,
    localOllamaSettingsSection,
    remoteOllamaSettingsSection,
    ollamaServerTypeSelect,
    aiModelStatus,
    vscode,
  } = elements;

  // 선택된 모델에 따라 설정 섹션 활성화/비활성화
  if (selectedModel === "gemini") {
    if (geminiSettingsSection) {
      geminiSettingsSection.style.display = "block";
      geminiSettingsSection.classList.remove("disabled");
    }
    if (banyaSettingsSection) {
      banyaSettingsSection.style.display = "none";
      banyaSettingsSection.classList.add("disabled");
    }
    if (ollamaSettingsGroup) {
      ollamaSettingsGroup.style.display = "none";
    }
  } else if (selectedModel === "banya") {
    if (banyaSettingsSection) {
      banyaSettingsSection.style.display = "block";
      banyaSettingsSection.classList.remove("disabled");
    }
    if (geminiSettingsSection) {
      geminiSettingsSection.style.display = "none";
      geminiSettingsSection.classList.add("disabled");
    }
    if (ollamaSettingsGroup) {
      ollamaSettingsGroup.style.display = "none";
    }
  } else if (selectedModel === "ollama") {
    if (geminiSettingsSection) {
      geminiSettingsSection.style.display = "none";
      geminiSettingsSection.classList.add("disabled");
    }
    if (banyaSettingsSection) {
      banyaSettingsSection.style.display = "none";
      banyaSettingsSection.classList.add("disabled");
    }
    if (ollamaSettingsGroup) {
      ollamaSettingsGroup.style.display = "block";
    }

    // Ollama 선택 시 서버 타입에 따라 활성 섹션 결정
    const serverType = ollamaServerTypeSelect
      ? ollamaServerTypeSelect.value
      : "local";
    handleServerTypeChange(serverType, elements);

    // Ollama 선택 시 모델 목록 요청
    try {
      loadOllamaModels(vscode);
    } catch (e) {
      console.warn("loadOllamaModels failed:", e);
    }
  }

  // 자동 저장 (설정 로드 중이 아닐 때만)
  if (!isLoadingSettings) {
    try {
      if (aiModelStatus) {
        aiModelStatus.textContent = "AI 모델 자동 저장 중...";
        aiModelStatus.className = "info-message";
      }
      if (vscode) {
        vscode.postMessage({ command: "saveAiModel", model: selectedModel });
      }
    } catch (e) {
      console.warn("Failed to autosave AI model:", e);
    }
  }
}

/**
 * AI 모델 이벤트 바인딩
 * @param {Object} elements - DOM 요소들
 * @param {Function} getIsLoadingSettings - 설정 로드 중 여부 가져오는 함수
 */
export function bindAiModelEvents(elements, getIsLoadingSettings) {
  const {
    aiModelSelect,
    saveAiModelButton,
    aiModelStatus,
    vscode,
  } = elements;

  // AI 모델 선택 변경
  if (aiModelSelect) {
    aiModelSelect.addEventListener("change", () => {
      const selectedModel = aiModelSelect.value;
      handleAiModelChange(selectedModel, elements, getIsLoadingSettings());
    });
  }

  // AI 모델 저장 버튼
  if (saveAiModelButton) {
    saveAiModelButton.addEventListener("click", () => {
      const selectedModel = aiModelSelect.value;
      console.log("[Settings] Save AI Model button clicked:", selectedModel);

      if (aiModelStatus) {
        aiModelStatus.textContent = "AI 모델 저장 중...";
        aiModelStatus.className = "info-message";
      }

      if (vscode) {
        vscode.postMessage({ command: "saveAiModel", model: selectedModel });
      }
    });
  }
}

/**
 * AI 모델 선택 값 설정
 * @param {HTMLElement} selectElement - select 요소
 * @param {string} model - 모델 값
 */
export function setAiModelSelectValue(selectElement, model) {
  if (selectElement && model) {
    selectElement.value = model;
    // change 이벤트 트리거
    selectElement.dispatchEvent(new Event("change"));
  }
}
