/**
 * API Keys Module
 * Gemini/Banya API 키 관련 기능
 */

/**
 * 상태 메시지 표시
 * @param {HTMLElement} statusElement - 상태 표시 요소
 * @param {string} message - 메시지
 * @param {string} type - 메시지 타입 ('info', 'success', 'error')
 * @param {number} duration - 자동 클리어 시간 (ms), 0이면 클리어 안함
 */
export function showStatus(statusElement, message, type = "info", duration = 3000) {
  if (!statusElement) return;

  statusElement.textContent = message;
  statusElement.className = `info-message ${type}-message`;

  if ((type === "success" || type === "error") && duration > 0) {
    setTimeout(() => {
      statusElement.textContent = "";
      statusElement.className = "info-message";
    }, duration);
  }
}

/**
 * Gemini API 키 이벤트 바인딩
 * @param {Object} elements - DOM 요소들
 * @param {Object} languageData - 언어 데이터
 */
export function bindGeminiApiKeyEvents(elements, languageData) {
  const {
    saveGeminiApiKeyButton,
    geminiApiKeyInput,
    geminiApiKeyStatus,
    geminiModelSelect,
    saveGeminiModelButton,
    vscode,
  } = elements;

  // Gemini API 키 저장
  if (saveGeminiApiKeyButton) {
    saveGeminiApiKeyButton.addEventListener("click", () => {
      const apiKey = geminiApiKeyInput.value.trim();
      if (apiKey) {
        vscode.postMessage({ command: "saveGeminiApiKey", apiKey: apiKey });
        const savingText =
          languageData["apiKeysLoading"] || "Gemini API 키 저장 중...";
        showStatus(geminiApiKeyStatus, savingText, "info");
      } else {
        const pleaseEnterText =
          languageData["pleaseEnterApiKey"] || "API 키를 입력해주세요.";
        showStatus(geminiApiKeyStatus, pleaseEnterText, "error");
      }
    });
  }

  // Gemini 모델 선택 변경
  if (geminiModelSelect) {
    geminiModelSelect.addEventListener("change", () => {
      const selectedGeminiModel = geminiModelSelect.value;
      try {
        if (geminiApiKeyStatus) {
          geminiApiKeyStatus.textContent = "Gemini 모델 자동 저장 중...";
          geminiApiKeyStatus.className = "info-message";
        }
        vscode.postMessage({
          command: "saveGeminiModel",
          model: selectedGeminiModel,
        });
      } catch (e) {
        console.warn("Failed to autosave Gemini model:", e);
      }
    });
  }

  // Gemini 모델 저장 버튼
  if (saveGeminiModelButton) {
    saveGeminiModelButton.addEventListener("click", () => {
      const selectedGeminiModel = geminiModelSelect.value;
      if (geminiApiKeyStatus) {
        geminiApiKeyStatus.textContent = "Gemini 모델 저장 중...";
        geminiApiKeyStatus.className = "info-message";
      }
      vscode.postMessage({
        command: "saveGeminiModel",
        model: selectedGeminiModel,
      });
    });
  }
}

/**
 * Banya API 키 이벤트 바인딩
 * @param {Object} elements - DOM 요소들
 * @param {Object} languageData - 언어 데이터
 */
export function bindBanyaApiKeyEvents(elements, languageData) {
  const {
    saveBanyaApiKeyButton,
    banyaApiKeyInput,
    banyaApiKeyStatus,
    banyaModelSelect,
    saveBanyaModelButton,
    vscode,
  } = elements;

  // Banya API 키 저장
  if (saveBanyaApiKeyButton) {
    saveBanyaApiKeyButton.addEventListener("click", () => {
      const apiKey = banyaApiKeyInput.value.trim();
      if (apiKey) {
        vscode.postMessage({ command: "saveBanyaApiKey", apiKey: apiKey });
        const savingText =
          languageData["apiKeysLoading"] || "Banya API 키 저장 중...";
        showStatus(banyaApiKeyStatus, savingText, "info");
      } else {
        const pleaseEnterText =
          languageData["pleaseEnterApiKey"] || "API 키를 입력해주세요.";
        showStatus(banyaApiKeyStatus, pleaseEnterText, "error");
      }
    });
  }

  // Banya 모델 선택 변경
  if (banyaModelSelect) {
    banyaModelSelect.addEventListener("change", () => {
      const selectedBanyaModel = banyaModelSelect.value;
      try {
        if (banyaApiKeyStatus) {
          banyaApiKeyStatus.textContent = "Banya 모델 자동 저장 중...";
          banyaApiKeyStatus.className = "info-message";
        }
        vscode.postMessage({
          command: "saveBanyaModel",
          model: selectedBanyaModel,
        });
      } catch (e) {
        console.warn("Failed to autosave Banya model:", e);
      }
    });
  }

  // Banya 모델 저장 버튼
  if (saveBanyaModelButton) {
    saveBanyaModelButton.addEventListener("click", () => {
      const selectedBanyaModel = banyaModelSelect.value;
      if (banyaApiKeyStatus) {
        banyaApiKeyStatus.textContent = "Banya 모델 저장 중...";
        banyaApiKeyStatus.className = "info-message";
      }
      vscode.postMessage({
        command: "saveBanyaModel",
        model: selectedBanyaModel,
      });
    });
  }
}
