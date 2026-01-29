/**
 * License Settings Module
 * 라이센스/시리얼 번호 관리 관련 기능
 */

import { showStatus } from "./api-keys.js";

// 모듈 상태
let isLicenseVerified = false;

/**
 * 라이센스 검증 상태 설정
 * @param {boolean} verified
 */
export function setLicenseVerified(verified) {
  isLicenseVerified = verified;
}

/**
 * 라이센스 검증 상태 가져오기
 * @returns {boolean}
 */
export function getLicenseVerified() {
  return isLicenseVerified;
}

/**
 * 저장 버튼들의 활성화/비활성화 제어
 * @param {Object} elements - DOM 요소들
 * @param {Object} vscode - vscode API 객체
 */
export function updateSaveButtonsState(elements, vscode) {
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
  } = elements;

  // 시리얼 번호 검증이 필요한 버튼들 (API 키 관련)
  const licenseRequiredButtons = [
    saveGeminiApiKeyButton,
    saveGeminiModelButton,
    saveBanyaApiKeyButton,
    saveBanyaModelButton,
  ];

  // 시리얼 번호 검증이 필요하지 않은 버튼들 (설정 관련)
  const alwaysEnabledButtons = [
    saveLocalOllamaApiUrlButton,
    saveLocalOllamaEndpointButton,
    saveRemoteOllamaModelButton,
    saveRemoteOllamaApiUrlButton,
    saveRemoteOllamaEndpointButton,
    saveOllamaServerTypeButton,
    saveOllamaModelButton,
  ];

  // 시리얼 번호 검증이 필요한 버튼들 처리
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
 * 라이센스 버튼들의 활성화/비활성화 제어
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

  // 라이센스 저장 버튼: 검증이 완료되어야 활성화
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

  // 라이센스 삭제 버튼: 저장된 라이센스가 있어야 활성화
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

  // 라이센스 검증 버튼: 항상 활성화 (입력값이 있을 때만)
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
 * 라이센스 이벤트 바인딩
 * @param {Object} elements - DOM 요소들
 * @param {Object} vscode - vscode API 객체
 * @param {Function} onLicenseStateChange - 라이센스 상태 변경 시 콜백
 */
export function bindLicenseEvents(elements, vscode, onLicenseStateChange) {
  const {
    banyaLicenseSerialInput,
    saveBanyaLicenseButton,
    verifyBanyaLicenseButton,
    deleteBanyaLicenseButton,
    banyaLicenseStatus,
  } = elements;

  // 라이센스 입력 필드 변경 이벤트
  if (banyaLicenseSerialInput) {
    banyaLicenseSerialInput.addEventListener("input", () => {
      // 입력 변경 시 검증 상태 초기화
      isLicenseVerified = false;
      updateLicenseButtonsState(elements);
      if (onLicenseStateChange) {
        onLicenseStateChange(isLicenseVerified);
      }
    });
  }

  // 라이센스 검증 버튼
  if (verifyBanyaLicenseButton) {
    verifyBanyaLicenseButton.addEventListener("click", () => {
      const serialNumber = banyaLicenseSerialInput?.value?.trim();
      if (serialNumber && vscode) {
        showStatus(banyaLicenseStatus, "라이센스 검증 중...", "info");
        vscode.postMessage({
          command: "verifyBanyaLicense",
          serialNumber: serialNumber,
        });
      }
    });
  }

  // 라이센스 저장 버튼
  if (saveBanyaLicenseButton) {
    saveBanyaLicenseButton.addEventListener("click", () => {
      const serialNumber = banyaLicenseSerialInput?.value?.trim();
      if (serialNumber && isLicenseVerified && vscode) {
        showStatus(banyaLicenseStatus, "라이센스 저장 중...", "info");
        vscode.postMessage({
          command: "saveBanyaLicense",
          serialNumber: serialNumber,
        });
      }
    });
  }

  // 라이센스 삭제 버튼
  if (deleteBanyaLicenseButton) {
    deleteBanyaLicenseButton.addEventListener("click", () => {
      if (vscode) {
        showStatus(banyaLicenseStatus, "라이센스 삭제 중...", "info");
        vscode.postMessage({ command: "deleteBanyaLicense" });
      }
    });
  }
}

/**
 * 라이센스 검증 결과 처리
 * @param {boolean} verified - 검증 결과
 * @param {string} message - 결과 메시지
 * @param {Object} elements - DOM 요소들
 * @param {Function} onLicenseStateChange - 라이센스 상태 변경 시 콜백
 */
export function handleLicenseVerificationResult(
  verified,
  message,
  elements,
  onLicenseStateChange
) {
  const { banyaLicenseStatus, banyaLicenseSerialInput } = elements;

  isLicenseVerified = verified;

  if (verified) {
    showStatus(banyaLicenseStatus, message || "라이센스 검증 완료", "success");
    if (banyaLicenseSerialInput) {
      banyaLicenseSerialInput.readOnly = true;
    }
  } else {
    showStatus(
      banyaLicenseStatus,
      message || "라이센스 검증 실패",
      "error",
      5000
    );
  }

  updateLicenseButtonsState(elements);

  if (onLicenseStateChange) {
    onLicenseStateChange(isLicenseVerified);
  }
}

/**
 * 라이센스 삭제 결과 처리
 * @param {boolean} success - 삭제 성공 여부
 * @param {string} message - 결과 메시지
 * @param {Object} elements - DOM 요소들
 * @param {Function} onLicenseStateChange - 라이센스 상태 변경 시 콜백
 */
export function handleLicenseDeleteResult(
  success,
  message,
  elements,
  onLicenseStateChange
) {
  const { banyaLicenseStatus, banyaLicenseSerialInput } = elements;

  if (success) {
    isLicenseVerified = false;
    if (banyaLicenseSerialInput) {
      banyaLicenseSerialInput.value = "";
      banyaLicenseSerialInput.readOnly = false;
    }
    showStatus(banyaLicenseStatus, message || "라이센스 삭제 완료", "success");
  } else {
    showStatus(
      banyaLicenseStatus,
      message || "라이센스 삭제 실패",
      "error",
      5000
    );
  }

  updateLicenseButtonsState(elements);

  if (onLicenseStateChange) {
    onLicenseStateChange(isLicenseVerified);
  }
}
