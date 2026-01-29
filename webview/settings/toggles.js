/**
 * Toggles Module
 * 토글 스위치 관련 기능 (자동 업데이트, 스트리밍 등)
 */

/**
 * 토글 이벤트 바인딩
 * @param {Object} elements - DOM 요소들
 */
export function bindToggleEvents(elements) {
  const {
    autoUpdateToggle,
    outputLogToggle,
    streamingToggle,
    autoTestRetryToggle,
    autoCorrectionToggle,
    autoExecuteToggle,
    vscode,
  } = elements;

  // 자동 파일 업데이트 토글
  if (autoUpdateToggle) {
    autoUpdateToggle.addEventListener("change", () => {
      const enabled = autoUpdateToggle.checked;
      if (vscode) {
        vscode.postMessage({ command: "setAutoUpdateEnabled", enabled });
      }
    });
  }

  // 출력 로그 토글
  if (outputLogToggle) {
    outputLogToggle.addEventListener("change", () => {
      const enabled = outputLogToggle.checked;
      if (vscode) {
        vscode.postMessage({ command: "setOutputLogEnabled", enabled });
      }
    });
  }

  // 스트리밍 토글
  if (streamingToggle) {
    streamingToggle.addEventListener("change", () => {
      const enabled = streamingToggle.checked;
      if (vscode) {
        vscode.postMessage({ command: "setStreamingEnabled", enabled });
      }
    });
  }

  // 자동 테스트 재시도 토글
  if (autoTestRetryToggle) {
    autoTestRetryToggle.addEventListener("change", () => {
      const enabled = autoTestRetryToggle.checked;
      if (vscode) {
        vscode.postMessage({ command: "setAutoTestRetryEnabled", enabled });
      }
    });
  }

  // 자동 오류 수정 토글
  if (autoCorrectionToggle) {
    autoCorrectionToggle.addEventListener("change", () => {
      const enabled = autoCorrectionToggle.checked;
      if (vscode) {
        vscode.postMessage({ command: "setAutoCorrectionEnabled", enabled });
      }
    });
  }

  // 명령어 자동 실행 토글
  if (autoExecuteToggle) {
    autoExecuteToggle.addEventListener("change", () => {
      const enabled = autoExecuteToggle.checked;
      if (vscode) {
        vscode.postMessage({ command: "setAutoExecuteCommandsEnabled", enabled });
      }
    });
  }
}

/**
 * 토글 상태 업데이트
 * @param {HTMLElement} toggleElement - 토글 요소
 * @param {HTMLElement} statusElement - 상태 표시 요소
 * @param {boolean} enabled - 활성화 여부
 * @param {Object} languageData - 언어 데이터
 * @param {string} enabledKey - 활성화 텍스트 키
 * @param {string} disabledKey - 비활성화 텍스트 키
 */
export function updateToggleState(toggleElement, statusElement, enabled, languageData, enabledKey, disabledKey) {
  if (toggleElement) {
    toggleElement.checked = enabled;
  }
  if (statusElement) {
    const text = enabled
      ? (languageData[enabledKey] || "활성화됨")
      : (languageData[disabledKey] || "비활성화됨");
    statusElement.textContent = text;
    statusElement.className = enabled ? "success-message" : "info-message";
  }
}

/**
 * 스피너 값 이벤트 바인딩
 * @param {Object} elements - DOM 요소들
 */
export function bindSpinnerEvents(elements) {
  const {
    testRetrySpinner,
    errorRetrySpinner,
    vscode,
  } = elements;

  // 테스트 재시도 횟수 스피너
  if (testRetrySpinner) {
    testRetrySpinner.addEventListener("change", () => {
      const count = parseInt(testRetrySpinner.value, 10);
      if (!isNaN(count) && count >= 1 && count <= 10 && vscode) {
        vscode.postMessage({ command: "setTestRetryCount", count });
      }
    });
  }

  // 오류 수정 재시도 횟수 스피너
  if (errorRetrySpinner) {
    errorRetrySpinner.addEventListener("change", () => {
      const count = parseInt(errorRetrySpinner.value, 10);
      if (!isNaN(count) && count >= 1 && count <= 10 && vscode) {
        vscode.postMessage({ command: "setErrorRetryCount", count });
      }
    });
  }
}

/**
 * 스피너 값 업데이트
 * @param {HTMLElement} spinnerElement - 스피너 요소
 * @param {number} value - 값
 */
export function updateSpinnerValue(spinnerElement, value) {
  if (spinnerElement && typeof value === "number") {
    spinnerElement.value = value;
  }
}
