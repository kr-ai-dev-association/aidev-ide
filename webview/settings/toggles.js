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
    autoDeleteToggle,
    streamingToggle,
    nativeToolCallingToggle,
    thinkingToggle,
    autoTestRetryToggle,
    autoCorrectionToggle,
    autoExecuteToggle,
    autoToolToggle,
    orchestrationToggle,
    inlineCompletionToggle,
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

  // 자동 파일 삭제 토글
  if (autoDeleteToggle) {
    autoDeleteToggle.addEventListener("change", () => {
      const enabled = autoDeleteToggle.checked;
      if (vscode) {
        vscode.postMessage({ command: "setAutoDeleteFilesEnabled", enabled });
      }
    });
  }

  // 도구 자동 실행 토글
  if (autoToolToggle) {
    autoToolToggle.addEventListener("change", () => {
      const enabled = autoToolToggle.checked;
      if (vscode) {
        vscode.postMessage({ command: "setAutoToolExecutionEnabled", enabled });
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

  // 네이티브 툴 콜링 토글
  if (nativeToolCallingToggle) {
    nativeToolCallingToggle.addEventListener("change", () => {
      const enabled = nativeToolCallingToggle.checked;
      if (vscode) {
        vscode.postMessage({ command: "setNativeToolCallingEnabled", enabled });
      }
    });
  }

  // Thinking(추론) 토글
  if (thinkingToggle) {
    thinkingToggle.addEventListener("change", () => {
      const enabled = thinkingToggle.checked;
      if (vscode) {
        vscode.postMessage({ command: "setThinkingEnabled", enabled });
      }
    });
  }

  // Thinking 레벨 선택
  const thinkingLevelSelect = document.getElementById("thinking-level-select");
  if (thinkingLevelSelect) {
    thinkingLevelSelect.addEventListener("change", () => {
      if (vscode) {
        vscode.postMessage({
          command: "setThinkingLevel",
          level: thinkingLevelSelect.value,
        });
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

  // 오케스트레이션 토글
  if (orchestrationToggle) {
    orchestrationToggle.addEventListener("change", () => {
      const enabled = orchestrationToggle.checked;
      if (vscode) {
        vscode.postMessage({ command: "setOrchestrationEnabled", enabled });
      }
    });
  }

  // 명령어 자동 실행 토글
  if (autoExecuteToggle) {
    autoExecuteToggle.addEventListener("change", () => {
      const enabled = autoExecuteToggle.checked;
      if (vscode) {
        vscode.postMessage({
          command: "setAutoExecuteCommandsEnabled",
          enabled,
        });
      }
    });
  }

  // 프로젝트 외부 파일 차단 토글
  const blockOutsideProjectToggle = document.getElementById(
    "block-outside-project-toggle",
  );
  if (blockOutsideProjectToggle) {
    blockOutsideProjectToggle.addEventListener("change", () => {
      const enabled = blockOutsideProjectToggle.checked;
      if (vscode) {
        vscode.postMessage({
          command: "setBlockOutsideProjectEnabled",
          enabled,
        });
      }
    });
  }

  // 소스코드 자동완성 토글
  if (inlineCompletionToggle) {
    inlineCompletionToggle.addEventListener("change", () => {
      const enabled = inlineCompletionToggle.checked;
      if (vscode) {
        vscode.postMessage({ command: "setInlineCompletionEnabled", enabled });
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
export function updateToggleState(
  toggleElement,
  statusElement,
  enabled,
  languageData,
  enabledKey,
  disabledKey,
) {
  if (toggleElement) {
    toggleElement.checked = enabled;
  }
  if (statusElement) {
    const text = enabled
      ? languageData[enabledKey] || "활성화됨"
      : languageData[disabledKey] || "비활성화됨";
    statusElement.textContent = text;
    statusElement.className = enabled ? "success-message" : "info-message";
  }
}

/**
 * 스피너 값 이벤트 바인딩
 * @param {Object} elements - DOM 요소들
 */
export function bindSpinnerEvents(elements) {
  const { testRetrySpinner, errorRetrySpinner, vscode } = elements;

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
