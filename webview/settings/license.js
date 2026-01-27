/**
 * License Module
 * Banya 라이센스 관련 기능
 */

let isLicenseVerified = false;

/**
 * 라이센스 검증 상태 가져오기
 * @returns {boolean}
 */
export function getIsLicenseVerified() {
  return isLicenseVerified;
}

/**
 * 라이센스 검증 상태 설정
 * @param {boolean} verified
 */
export function setIsLicenseVerified(verified) {
  isLicenseVerified = verified;
}

/**
 * 저장 버튼 상태 업데이트 (라이센스 기반)
 * @param {Object} elements - DOM 요소들
 */
export function updateSaveButtonsState(elements) {
  const {
    saveGeminiApiKeyButton,
    saveGeminiModelButton,
    saveBanyaApiKeyButton,
    saveBanyaModelButton,
    saveLocalOllamaApiUrlButton,
    saveLocalOllamaEndpointButton,
    saveRemoteOllamaModelButton,
    saveRemoteOllamaApiUrlButton,
    saveRemoteOllamaEndpointButton,
    saveOllamaServerTypeButton,
    saveOllamaModelButton,
    aiModelSelect,
    aiModelStatus,
    vscode,
  } = elements;

  // 라이센스 검증이 필요한 버튼들
  const licenseRequiredButtons = [
    saveGeminiApiKeyButton,
    saveGeminiModelButton,
    saveBanyaApiKeyButton,
    saveBanyaModelButton,
  ];

  // 항상 활성화되는 버튼들
  const alwaysEnabledButtons = [
    saveLocalOllamaApiUrlButton,
    saveLocalOllamaEndpointButton,
    saveRemoteOllamaModelButton,
    saveRemoteOllamaApiUrlButton,
    saveRemoteOllamaEndpointButton,
    saveOllamaServerTypeButton,
    saveOllamaModelButton,
  ];

  // 라이센스 검증이 필요한 버튼들 처리
  licenseRequiredButtons.forEach((button) => {
    if (button) {
      if (isLicenseVerified) {
        button.disabled = false;
        button.style.opacity = "1";
        button.style.cursor = "pointer";
      } else {
        button.disabled = true;
        button.style.opacity = "0.5";
        button.style.cursor = "not-allowed";
      }
    }
  });

  // 항상 활성화되는 버튼들 처리
  alwaysEnabledButtons.forEach((button) => {
    if (button) {
      button.disabled = false;
      button.style.opacity = "1";
      button.style.cursor = "pointer";
    }
  });

  // AI 모델 자동 저장
  try {
    if (aiModelStatus) {
      aiModelStatus.textContent = "AI 모델 자동 저장 중...";
      aiModelStatus.className = "info-message";
    }
    if (aiModelSelect && aiModelSelect.value && vscode) {
      const selectedModel = aiModelSelect.value;
      vscode.postMessage({ command: "saveAiModel", model: selectedModel });
    }
  } catch (e) {
    console.warn("Failed to autosave AI model:", e);
  }
}

/**
 * 라이센스 버튼 상태 업데이트
 * @param {Object} elements - DOM 요소들
 */
export function updateLicenseButtonsState(elements) {
  const {
    banyaLicenseSerialInput,
    saveBanyaLicenseButton,
    deleteBanyaLicenseButton,
    verifyBanyaLicenseButton,
  } = elements;

  const hasStoredLicense =
    banyaLicenseSerialInput && banyaLicenseSerialInput.value.trim() !== "";

  // 라이센스 저장 버튼
  if (saveBanyaLicenseButton) {
    if (isLicenseVerified) {
      saveBanyaLicenseButton.disabled = false;
      saveBanyaLicenseButton.style.opacity = "1";
      saveBanyaLicenseButton.style.cursor = "pointer";
    } else {
      saveBanyaLicenseButton.disabled = true;
      saveBanyaLicenseButton.style.opacity = "0.5";
      saveBanyaLicenseButton.style.cursor = "not-allowed";
    }
  }

  // 라이센스 삭제 버튼
  if (deleteBanyaLicenseButton) {
    if (hasStoredLicense) {
      deleteBanyaLicenseButton.disabled = false;
      deleteBanyaLicenseButton.style.opacity = "1";
      deleteBanyaLicenseButton.style.cursor = "pointer";
    } else {
      deleteBanyaLicenseButton.disabled = true;
      deleteBanyaLicenseButton.style.opacity = "0.5";
      deleteBanyaLicenseButton.style.cursor = "not-allowed";
    }
  }

  // 라이센스 검증 버튼
  if (verifyBanyaLicenseButton) {
    const hasInputValue =
      banyaLicenseSerialInput && banyaLicenseSerialInput.value.trim() !== "";
    verifyBanyaLicenseButton.disabled = !hasInputValue;
    verifyBanyaLicenseButton.style.opacity = hasInputValue ? "1" : "0.5";
    verifyBanyaLicenseButton.style.cursor = hasInputValue
      ? "pointer"
      : "not-allowed";
  }
}

/**
 * 라이센스 저장 이벤트 바인딩
 * @param {Object} elements - DOM 요소들
 * @param {Object} languageData - 언어 데이터
 * @param {Function} showStatusFn - 상태 표시 함수
 */
export function bindLicenseEvents(elements, languageData, showStatusFn) {
  const {
    saveBanyaLicenseButton,
    verifyBanyaLicenseButton,
    deleteBanyaLicenseButton,
    banyaLicenseSerialInput,
    banyaLicenseStatus,
    aiModelSelect,
    aiModelStatus,
    vscode,
  } = elements;

  // Banya 라이센스 저장
  if (saveBanyaLicenseButton) {
    saveBanyaLicenseButton.addEventListener("click", () => {
      const licenseSerial = banyaLicenseSerialInput.value.trim();
      if (licenseSerial) {
        vscode.postMessage({
          command: "saveBanyaLicenseSerial",
          banyaLicenseSerial: licenseSerial,
        });
        const savingText =
          languageData["banyaLicenseSaving"] || "Banya 라이센스 저장 중...";
        showStatusFn(banyaLicenseStatus, savingText, "info");
      } else {
        const pleaseEnterText =
          languageData["pleaseEnterBanyaLicense"] ||
          "라이센스 시리얼을 입력해주세요.";
        showStatusFn(banyaLicenseStatus, pleaseEnterText, "error");
      }
    });
  }

  // Banya 라이센스 검증
  if (verifyBanyaLicenseButton) {
    verifyBanyaLicenseButton.addEventListener("click", () => {
      const licenseSerial = banyaLicenseSerialInput.value.trim();
      if (licenseSerial) {
        vscode.postMessage({
          command: "verifyBanyaLicense",
          licenseSerial: licenseSerial,
        });
        const verifyingText =
          languageData["banyaLicenseVerifying"] || "Banya 라이센스 검증 중...";
        showStatusFn(banyaLicenseStatus, verifyingText, "info");
      } else {
        const pleaseEnterText =
          languageData["pleaseEnterBanyaLicense"] ||
          "라이센스 시리얼을 입력해주세요.";
        showStatusFn(banyaLicenseStatus, pleaseEnterText, "error");
      }
    });
  }

  // Banya 라이센스 삭제
  if (deleteBanyaLicenseButton) {
    deleteBanyaLicenseButton.addEventListener("click", () => {
      vscode.postMessage({ command: "deleteBanyaLicense" });
      const deletingText =
        languageData["banyaLicenseDeleting"] || "Banya 라이센스 삭제 중...";
      showStatusFn(banyaLicenseStatus, deletingText, "info");
    });
  }

  // 라이센스 입력 필드 변경
  if (banyaLicenseSerialInput) {
    banyaLicenseSerialInput.addEventListener("input", () => {
      updateLicenseButtonsState(elements);
    });
  }
}
