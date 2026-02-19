(function webpackUniversalModuleDefinition(root, factory) {
	if(typeof exports === 'object' && typeof module === 'object')
		module.exports = factory();
	else if(typeof define === 'function' && define.amd)
		define([], factory);
	else {
		var a = factory();
		for(var i in a) (typeof exports === 'object' ? exports : root)[i] = a[i];
	}
})(self, () => {
return /******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ 156:
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   bindBanyaApiKeyEvents: () => (/* binding */ bindBanyaApiKeyEvents),
/* harmony export */   bindGeminiApiKeyEvents: () => (/* binding */ bindGeminiApiKeyEvents),
/* harmony export */   showStatus: () => (/* binding */ showStatus)
/* harmony export */ });
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
function showStatus(statusElement, message, type = "info", duration = 3000) {
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
function bindGeminiApiKeyEvents(elements, languageData) {
  const {
    saveGeminiApiKeyButton,
    geminiApiKeyInput,
    geminiApiKeyStatus,
    geminiModelSelect,
    saveGeminiModelButton,
    vscode
  } = elements;

  // Gemini API 키 저장
  if (saveGeminiApiKeyButton) {
    saveGeminiApiKeyButton.addEventListener("click", () => {
      const apiKey = geminiApiKeyInput.value.trim();
      if (apiKey) {
        vscode.postMessage({
          command: "saveGeminiApiKey",
          apiKey: apiKey
        });
        const savingText = languageData["apiKeysLoading"] || "Gemini API 키 저장 중...";
        showStatus(geminiApiKeyStatus, savingText, "info");
      } else {
        const pleaseEnterText = languageData["pleaseEnterApiKey"] || "API 키를 입력해주세요.";
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
          model: selectedGeminiModel
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
        model: selectedGeminiModel
      });
    });
  }
}

/**
 * Banya API 키 이벤트 바인딩
 * @param {Object} elements - DOM 요소들
 * @param {Object} languageData - 언어 데이터
 */
function bindBanyaApiKeyEvents(elements, languageData) {
  const {
    saveBanyaApiKeyButton,
    banyaApiKeyInput,
    banyaApiKeyStatus,
    banyaModelSelect,
    saveBanyaModelButton,
    vscode
  } = elements;

  // Banya API 키 저장
  if (saveBanyaApiKeyButton) {
    saveBanyaApiKeyButton.addEventListener("click", () => {
      const apiKey = banyaApiKeyInput.value.trim();
      if (apiKey) {
        vscode.postMessage({
          command: "saveBanyaApiKey",
          apiKey: apiKey
        });
        const savingText = languageData["apiKeysLoading"] || "Banya API 키 저장 중...";
        showStatus(banyaApiKeyStatus, savingText, "info");
      } else {
        const pleaseEnterText = languageData["pleaseEnterApiKey"] || "API 키를 입력해주세요.";
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
          model: selectedBanyaModel
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
        model: selectedBanyaModel
      });
    });
  }
}

/***/ }),

/***/ 157:
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   bindSpinnerEvents: () => (/* binding */ bindSpinnerEvents),
/* harmony export */   bindToggleEvents: () => (/* binding */ bindToggleEvents),
/* harmony export */   updateSpinnerValue: () => (/* binding */ updateSpinnerValue),
/* harmony export */   updateToggleState: () => (/* binding */ updateToggleState)
/* harmony export */ });
/**
 * Toggles Module
 * 토글 스위치 관련 기능 (자동 업데이트, 스트리밍 등)
 */

/**
 * 토글 이벤트 바인딩
 * @param {Object} elements - DOM 요소들
 */
function bindToggleEvents(elements) {
  const {
    autoUpdateToggle,
    autoDeleteToggle,
    streamingToggle,
    autoTestRetryToggle,
    autoCorrectionToggle,
    autoExecuteToggle,
    autoToolToggle,
    vscode
  } = elements;

  // 자동 파일 업데이트 토글
  if (autoUpdateToggle) {
    autoUpdateToggle.addEventListener("change", () => {
      const enabled = autoUpdateToggle.checked;
      if (vscode) {
        vscode.postMessage({
          command: "setAutoUpdateEnabled",
          enabled
        });
      }
    });
  }

  // 자동 파일 삭제 토글
  if (autoDeleteToggle) {
    autoDeleteToggle.addEventListener("change", () => {
      const enabled = autoDeleteToggle.checked;
      if (vscode) {
        vscode.postMessage({
          command: "setAutoDeleteFilesEnabled",
          enabled
        });
      }
    });
  }

  // 도구 자동 실행 토글
  if (autoToolToggle) {
    autoToolToggle.addEventListener("change", () => {
      const enabled = autoToolToggle.checked;
      if (vscode) {
        vscode.postMessage({
          command: "setAutoToolExecutionEnabled",
          enabled
        });
      }
    });
  }

  // 스트리밍 토글
  if (streamingToggle) {
    streamingToggle.addEventListener("change", () => {
      const enabled = streamingToggle.checked;
      if (vscode) {
        vscode.postMessage({
          command: "setStreamingEnabled",
          enabled
        });
      }
    });
  }

  // 자동 테스트 재시도 토글
  if (autoTestRetryToggle) {
    autoTestRetryToggle.addEventListener("change", () => {
      const enabled = autoTestRetryToggle.checked;
      if (vscode) {
        vscode.postMessage({
          command: "setAutoTestRetryEnabled",
          enabled
        });
      }
    });
  }

  // 자동 오류 수정 토글
  if (autoCorrectionToggle) {
    autoCorrectionToggle.addEventListener("change", () => {
      const enabled = autoCorrectionToggle.checked;
      if (vscode) {
        vscode.postMessage({
          command: "setAutoCorrectionEnabled",
          enabled
        });
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
          enabled
        });
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
function updateToggleState(toggleElement, statusElement, enabled, languageData, enabledKey, disabledKey) {
  if (toggleElement) {
    toggleElement.checked = enabled;
  }
  if (statusElement) {
    const text = enabled ? languageData[enabledKey] || "활성화됨" : languageData[disabledKey] || "비활성화됨";
    statusElement.textContent = text;
    statusElement.className = enabled ? "success-message" : "info-message";
  }
}

/**
 * 스피너 값 이벤트 바인딩
 * @param {Object} elements - DOM 요소들
 */
function bindSpinnerEvents(elements) {
  const {
    testRetrySpinner,
    errorRetrySpinner,
    vscode
  } = elements;

  // 테스트 재시도 횟수 스피너
  if (testRetrySpinner) {
    testRetrySpinner.addEventListener("change", () => {
      const count = parseInt(testRetrySpinner.value, 10);
      if (!isNaN(count) && count >= 1 && count <= 10 && vscode) {
        vscode.postMessage({
          command: "setTestRetryCount",
          count
        });
      }
    });
  }

  // 오류 수정 재시도 횟수 스피너
  if (errorRetrySpinner) {
    errorRetrySpinner.addEventListener("change", () => {
      const count = parseInt(errorRetrySpinner.value, 10);
      if (!isNaN(count) && count >= 1 && count <= 10 && vscode) {
        vscode.postMessage({
          command: "setErrorRetryCount",
          count
        });
      }
    });
  }
}

/**
 * 스피너 값 업데이트
 * @param {HTMLElement} spinnerElement - 스피너 요소
 * @param {number} value - 값
 */
function updateSpinnerValue(spinnerElement, value) {
  if (spinnerElement && typeof value === "number") {
    spinnerElement.value = value;
  }
}

/***/ }),

/***/ 158:
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   bindMcpSettingsEvents: () => (/* binding */ bindMcpSettingsEvents),
/* harmony export */   handleMcpMessage: () => (/* binding */ handleMcpMessage),
/* harmony export */   updateMcpServerStatus: () => (/* binding */ updateMcpServerStatus),
/* harmony export */   updateMcpServers: () => (/* binding */ updateMcpServers)
/* harmony export */ });
/* harmony import */ var _api_keys_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(156);
/**
 * MCP Settings Module
 * MCP 서버 설정 관련 기능
 */



// 현재 서버 목록 캐시
let mcpServers = [];

/**
 * MCP 서버 카드 HTML 생성
 */
function createServerCard(server) {
  const isEnabled = server.enabled !== false; // 기본값 true
  const statusClass = !isEnabled ? "" : server.status === "connected" ? "success" : server.status === "error" ? "error" : "";
  const statusText = !isEnabled ? "비활성" : server.status === "connected" ? "연결됨" : server.status === "error" ? "오류" : "대기";
  const toolCount = server.tools?.length || 0;
  const disabledStyle = !isEnabled ? "opacity: 0.5;" : "";

  // 도구 목록 HTML
  const toolsHtml = server.tools && server.tools.length > 0 ? server.tools.map(tool => `
        <div style="padding: 6px 8px; border: 1px solid var(--vscode-panel-border); border-radius: 4px; margin-bottom: 4px;">
          <strong style="font-size: 0.85em;">${tool.name}</strong>
          <span style="font-size: 0.8em; color: var(--vscode-descriptionForeground); margin-left: 6px;">
            ${tool.description || "설명 없음"}
          </span>
        </div>
      `).join("") : '<p class="info-message" style="margin: 4px 0; font-size: 0.85em;">도구 없음 - 연결 테스트를 실행해주세요</p>';
  return `
    <div class="api-key-section mcp-server-card" data-server-id="${server.id}" style="margin-bottom: 10px;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <label class="mcp-toggle" title="${isEnabled ? "비활성화" : "활성화"}">
            <input type="checkbox" class="mcp-toggle-input" data-server-id="${server.id}" ${isEnabled ? "checked" : ""} />
            <span class="mcp-toggle-slider"></span>
          </label>
          <strong style="${disabledStyle}">${server.name}</strong>
          <span style="font-size: 0.85em; color: var(--vscode-descriptionForeground); ${disabledStyle}">
            (${server.type === "stdio" ? "로컬" : "HTTP"})
          </span>
          <span class="info-message ${statusClass}-message" style="font-size: 0.85em;">
            ${statusText}
          </span>
        </div>
        <div style="display: flex; gap: 5px;">
          <button class="mcp-test-btn" data-server-id="${server.id}" title="연결 테스트" ${!isEnabled ? "disabled" : ""}>
            연결
          </button>
          <button class="mcp-tools-btn" data-server-id="${server.id}" title="도구 목록 토글 (${toolCount}개)" ${!isEnabled ? "disabled" : ""}>
            도구 ${toolCount}
          </button>
          <button class="mcp-edit-btn" data-server-id="${server.id}" title="편집">
            수정
          </button>
          <button class="mcp-delete-btn" data-server-id="${server.id}" title="삭제">
            삭제
          </button>
        </div>
      </div>
      <p style="margin-top: 5px; font-size: 0.85em; color: var(--vscode-descriptionForeground); ${disabledStyle}">
        ${server.type === "stdio" ? `${server.command} ${(server.args || []).join(" ")}` : server.url || ""}
      </p>
      <!-- 인라인 도구 목록 (토글) -->
      <div class="mcp-inline-tools" data-server-id="${server.id}" style="display: none; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--vscode-panel-border);">
        <p style="margin: 0 0 6px 0; font-size: 0.85em; font-weight: bold;">도구 목록 (${toolCount}개)</p>
        ${toolsHtml}
      </div>
      <!-- 인라인 수정 폼 (토글) -->
      <div class="mcp-inline-edit" data-server-id="${server.id}" style="display: none; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--vscode-panel-border);">
      </div>
      <!-- 인라인 테스트 결과 -->
      <div class="mcp-inline-status" data-server-id="${server.id}" style="display: none; margin-top: 8px; padding: 6px 8px; border-radius: 4px; font-size: 0.85em;">
      </div>
    </div>
  `;
}

/**
 * MCP 서버 목록 렌더링
 */
function renderServerList() {
  const listEl = document.getElementById("mcp-server-list");
  if (!listEl) {
    return;
  }
  if (mcpServers.length === 0) {
    listEl.innerHTML = '<p class="info-message">등록된 MCP 서버가 없습니다.</p>';
  } else {
    listEl.innerHTML = mcpServers.map(createServerCard).join("");
  }

  // 이벤트 바인딩
  bindServerCardEvents();
}

/**
 * 서버 카드 이벤트 바인딩
 */
function bindServerCardEvents() {
  // 온/오프 토글
  document.querySelectorAll(".mcp-toggle-input").forEach(toggle => {
    toggle.addEventListener("change", e => {
      const serverId = e.currentTarget.dataset.serverId;
      const enabled = e.currentTarget.checked;
      window.vscode?.postMessage({
        command: "toggleMcpServer",
        serverId,
        enabled
      });
    });
  });

  // 테스트 버튼
  document.querySelectorAll(".mcp-test-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      const serverId = e.currentTarget.dataset.serverId;
      // 인라인 상태 표시
      const statusEl = document.querySelector(`.mcp-inline-status[data-server-id="${serverId}"]`);
      if (statusEl) {
        statusEl.style.display = "block";
        statusEl.style.backgroundColor = "var(--vscode-textBlockQuote-background)";
        statusEl.textContent = "연결 테스트 중...";
      }
      window.vscode?.postMessage({
        command: "testMcpServer",
        serverId
      });
    });
  });

  // 도구 목록 토글 버튼
  document.querySelectorAll(".mcp-tools-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      const serverId = e.currentTarget.dataset.serverId;
      const card = document.querySelector(`.mcp-server-card[data-server-id="${serverId}"]`);
      const toolsEl = card?.querySelector(`.mcp-inline-tools`);
      const editEl = card?.querySelector(`.mcp-inline-edit`);

      // 수정 패널이 열려있으면 닫기 (상호 배제)
      if (editEl) {
        editEl.style.display = "none";
      }
      if (toolsEl) {
        toolsEl.style.display = toolsEl.style.display === "none" ? "block" : "none";
      }
    });
  });

  // 편집 버튼
  document.querySelectorAll(".mcp-edit-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      const serverId = e.currentTarget.dataset.serverId;
      showInlineEditForm(serverId);
    });
  });

  // 삭제 버튼 (confirm()은 VSCode webview에서 작동하지 않으므로 사용하지 않음)
  document.querySelectorAll(".mcp-delete-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      const serverId = e.currentTarget.dataset.serverId;
      window.vscode?.postMessage({
        command: "removeMcpServer",
        serverId
      });
    });
  });
}

/**
 * 서버 인라인 테스트 결과 표시
 */
function showInlineTestResult(serverId, success, message) {
  const statusEl = document.querySelector(`.mcp-inline-status[data-server-id="${serverId}"]`);
  if (!statusEl) {
    return;
  }
  statusEl.style.display = "block";
  if (success) {
    statusEl.style.backgroundColor = "var(--vscode-testing-iconPassed, #28a745)";
    statusEl.style.color = "#fff";
  } else {
    statusEl.style.backgroundColor = "var(--vscode-testing-iconFailed, #dc3545)";
    statusEl.style.color = "#fff";
  }
  statusEl.textContent = message;

  // 5초 후 자동 숨김
  setTimeout(() => {
    statusEl.style.display = "none";
  }, 5000);
}

/**
 * 인라인 수정 폼 표시 (서버 카드 내부)
 */
function showInlineEditForm(serverId) {
  const server = mcpServers.find(s => s.id === serverId);
  if (!server) {
    return;
  }
  const card = document.querySelector(`.mcp-server-card[data-server-id="${serverId}"]`);
  if (!card) {
    return;
  }
  const editEl = card.querySelector(`.mcp-inline-edit`);
  const toolsEl = card.querySelector(`.mcp-inline-tools`);
  if (!editEl) {
    return;
  }

  // 도구 패널이 열려있으면 닫기 (상호 배제)
  if (toolsEl) {
    toolsEl.style.display = "none";
  }

  // 이미 열려있으면 토글로 닫기
  if (editEl.style.display !== "none" && editEl.innerHTML.trim() !== "") {
    editEl.style.display = "none";
    editEl.innerHTML = "";
    return;
  }
  const isStdio = server.type === "stdio";
  editEl.innerHTML = `
    <p style="margin: 0 0 8px 0; font-size: 0.85em; font-weight: bold;">서버 편집</p>
    <div style="margin-bottom: 8px;">
      <label style="display: block; margin-bottom: 3px; font-size: 0.85em;">서버 이름</label>
      <input type="text" class="mcp-edit-name" value="${server.name || ""}"
        style="width: 100%; padding: 6px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 3px; font-size: 0.85em;" />
    </div>
    <div style="margin-bottom: 8px;">
      <label style="display: block; margin-bottom: 3px; font-size: 0.85em;">연결 타입</label>
      <select class="mcp-edit-type" style="width: 100%; padding: 6px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 3px; font-size: 0.85em;">
        <option value="stdio" ${isStdio ? "selected" : ""}>로컬 - 로컬 명령어</option>
        <option value="http" ${!isStdio ? "selected" : ""}>원격 - 외부 MCP 서버 URL</option>
      </select>
    </div>
    <div class="mcp-edit-stdio" style="display: ${isStdio ? "block" : "none"};">
      <div style="margin-bottom: 8px;">
        <label style="display: block; margin-bottom: 3px; font-size: 0.85em;">명령어</label>
        <input type="text" class="mcp-edit-command" value="${server.command || ""}"
          style="width: 100%; padding: 6px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 3px; font-size: 0.85em;" />
      </div>
      <div style="margin-bottom: 8px;">
        <label style="display: block; margin-bottom: 3px; font-size: 0.85em;">인자</label>
        <input type="text" class="mcp-edit-args" value="${(server.args || []).join(", ")}"
          style="width: 100%; padding: 6px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 3px; font-size: 0.85em;" />
      </div>
    </div>
    <div class="mcp-edit-http" style="display: ${!isStdio ? "block" : "none"};">
      <div style="margin-bottom: 8px;">
        <label style="display: block; margin-bottom: 3px; font-size: 0.85em;">서버 URL</label>
        <input type="text" class="mcp-edit-url" value="${server.url || ""}"
          style="width: 100%; padding: 6px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 3px; font-size: 0.85em;" />
      </div>
      <div style="margin-bottom: 8px;">
        <label style="display: block; margin-bottom: 3px; font-size: 0.85em;">API 키</label>
        <input type="password" class="mcp-edit-apikey" value="${server.apiKey || ""}"
          style="width: 100%; padding: 6px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 3px; font-size: 0.85em;" />
      </div>
    </div>
    <div style="margin-bottom: 8px;">
      <label style="display: block; margin-bottom: 3px; font-size: 0.85em;">프롬프트</label>
      <textarea class="mcp-edit-prompt" rows="2"
        style="width: 100%; padding: 6px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 3px; font-size: 0.85em; resize: vertical;">${server.customPrompt || ""}</textarea>
    </div>
    <div style="display: flex; gap: 8px; margin-top: 8px;">
      <button class="mcp-edit-save-btn" style="padding: 5px 12px; font-size: 0.85em;">저장</button>
      <button class="mcp-edit-cancel-btn" style="padding: 5px 12px; font-size: 0.85em; background-color: #6b7280;">취소</button>
    </div>
    <p class="mcp-edit-status" style="font-size: 0.8em; margin-top: 4px;"></p>
  `;
  editEl.style.display = "block";

  // 타입 변경 시 필드 표시 전환
  const typeSelect = editEl.querySelector(".mcp-edit-type");
  typeSelect?.addEventListener("change", e => {
    const stdioEl = editEl.querySelector(".mcp-edit-stdio");
    const httpEl = editEl.querySelector(".mcp-edit-http");
    if (stdioEl) stdioEl.style.display = e.target.value === "stdio" ? "block" : "none";
    if (httpEl) httpEl.style.display = e.target.value === "http" ? "block" : "none";
  });

  // 저장 버튼
  editEl.querySelector(".mcp-edit-save-btn")?.addEventListener("click", () => {
    const name = editEl.querySelector(".mcp-edit-name")?.value.trim();
    if (!name) {
      const statusP = editEl.querySelector(".mcp-edit-status");
      if (statusP) {
        statusP.textContent = "서버 이름을 입력해주세요.";
        statusP.style.color = "var(--vscode-terminal-ansiRed)";
      }
      return;
    }
    const type = editEl.querySelector(".mcp-edit-type")?.value || "stdio";
    const serverConfig = {
      id: serverId,
      name,
      type,
      enabled: server.enabled !== false
    };
    if (type === "stdio") {
      const command = editEl.querySelector(".mcp-edit-command")?.value.trim();
      if (!command) {
        const statusP = editEl.querySelector(".mcp-edit-status");
        if (statusP) {
          statusP.textContent = "명령어를 입력해주세요.";
          statusP.style.color = "var(--vscode-terminal-ansiRed)";
        }
        return;
      }
      serverConfig.command = command;
      serverConfig.args = editEl.querySelector(".mcp-edit-args")?.value.split(",").map(s => s.trim()).filter(s => s);
    } else {
      const url = editEl.querySelector(".mcp-edit-url")?.value.trim();
      if (!url) {
        const statusP = editEl.querySelector(".mcp-edit-status");
        if (statusP) {
          statusP.textContent = "URL을 입력해주세요.";
          statusP.style.color = "var(--vscode-terminal-ansiRed)";
        }
        return;
      }
      serverConfig.url = url;
      const apiKey = editEl.querySelector(".mcp-edit-apikey")?.value.trim();
      if (apiKey) serverConfig.apiKey = apiKey;
    }
    const customPrompt = editEl.querySelector(".mcp-edit-prompt")?.value.trim();
    if (customPrompt) serverConfig.customPrompt = customPrompt;
    window.vscode?.postMessage({
      command: "updateMcpServer",
      server: serverConfig
    });

    // 폼 닫기
    editEl.style.display = "none";
    editEl.innerHTML = "";
  });

  // 취소 버튼
  editEl.querySelector(".mcp-edit-cancel-btn")?.addEventListener("click", () => {
    editEl.style.display = "none";
    editEl.innerHTML = "";
  });
}

/**
 * 서버 편집 폼 표시 (글로벌 폼 — 서버 추가 전용으로 유지)
 */
function editServer(serverId) {
  const server = mcpServers.find(s => s.id === serverId);
  if (!server) {
    return;
  }
  showServerForm(server);
}

/**
 * 서버 추가/편집 폼 표시
 */
function showServerForm(server = null) {
  const formEl = document.getElementById("mcp-server-form");
  const titleEl = document.getElementById("mcp-form-title");
  const idInput = document.getElementById("mcp-server-id");
  const nameInput = document.getElementById("mcp-server-name");
  const typeSelect = document.getElementById("mcp-server-type");
  const commandInput = document.getElementById("mcp-command");
  const argsInput = document.getElementById("mcp-args");
  const urlInput = document.getElementById("mcp-url");
  const apiKeyInput = document.getElementById("mcp-api-key");
  const customPromptInput = document.getElementById("mcp-custom-prompt");
  if (!formEl) {
    return;
  }
  if (server) {
    titleEl.textContent = "MCP 서버 편집";
    idInput.value = server.id;
    nameInput.value = server.name || "";
    typeSelect.value = server.type || "stdio";
    commandInput.value = server.command || "";
    argsInput.value = (server.args || []).join(", ");
    urlInput.value = server.url || "";
    apiKeyInput.value = server.apiKey || "";
    if (customPromptInput) customPromptInput.value = server.customPrompt || "";
  } else {
    titleEl.textContent = "MCP 서버 추가";
    idInput.value = "";
    nameInput.value = "";
    typeSelect.value = "stdio";
    commandInput.value = "";
    argsInput.value = "";
    urlInput.value = "";
    apiKeyInput.value = "";
    if (customPromptInput) customPromptInput.value = "";
  }
  updateTypeVisibility(typeSelect.value);
  formEl.style.display = "block";
}

/**
 * 연결 타입에 따른 필드 표시/숨김
 */
function updateTypeVisibility(type) {
  const stdioSettings = document.getElementById("mcp-stdio-settings");
  const httpSettings = document.getElementById("mcp-http-settings");
  if (stdioSettings && httpSettings) {
    stdioSettings.style.display = type === "stdio" ? "block" : "none";
    httpSettings.style.display = type === "http" ? "block" : "none";
  }
}

/**
 * 폼 숨기기
 */
function hideServerForm() {
  const formEl = document.getElementById("mcp-server-form");
  if (formEl) {
    formEl.style.display = "none";
  }
}

/**
 * 폼 데이터 수집 및 저장
 */
function saveServerFromForm() {
  const idInput = document.getElementById("mcp-server-id");
  const nameInput = document.getElementById("mcp-server-name");
  const typeSelect = document.getElementById("mcp-server-type");
  const commandInput = document.getElementById("mcp-command");
  const argsInput = document.getElementById("mcp-args");
  const urlInput = document.getElementById("mcp-url");
  const apiKeyInput = document.getElementById("mcp-api-key");
  const statusEl = document.getElementById("mcp-form-status");
  const name = nameInput?.value.trim();
  if (!name) {
    (0,_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(statusEl, "서버 이름을 입력해주세요.", "error");
    return;
  }
  const type = typeSelect?.value || "stdio";
  let serverConfig = {
    id: idInput?.value || `mcp_${Date.now()}`,
    name,
    type,
    enabled: true
  };
  if (type === "stdio") {
    const command = commandInput?.value.trim();
    if (!command) {
      (0,_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(statusEl, "명령어를 입력해주세요.", "error");
      return;
    }
    serverConfig.command = command;
    serverConfig.args = argsInput?.value.split(",").map(s => s.trim()).filter(s => s);
  } else {
    const url = urlInput?.value.trim();
    if (!url) {
      (0,_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(statusEl, "URL을 입력해주세요.", "error");
      return;
    }
    serverConfig.url = url;
    if (apiKeyInput?.value.trim()) {
      serverConfig.apiKey = apiKeyInput.value.trim();
    }
  }

  // 커스텀 프롬프트 (공통)
  const customPromptInput = document.getElementById("mcp-custom-prompt");
  const customPrompt = customPromptInput?.value.trim();
  if (customPrompt) {
    serverConfig.customPrompt = customPrompt;
  }

  // 기존 서버 업데이트 또는 새 서버 추가
  if (idInput?.value) {
    window.vscode?.postMessage({
      command: "updateMcpServer",
      server: serverConfig
    });
  } else {
    window.vscode?.postMessage({
      command: "addMcpServer",
      server: serverConfig
    });
  }
  hideServerForm();
}

/**
 * MCP 설정 이벤트 바인딩
 */
function bindMcpSettingsEvents(vscode) {
  // 서버 추가 버튼
  const addBtn = document.getElementById("add-mcp-server-button");
  if (addBtn) {
    addBtn.addEventListener("click", () => showServerForm());
  }

  // 타입 선택 변경
  const typeSelect = document.getElementById("mcp-server-type");
  if (typeSelect) {
    typeSelect.addEventListener("change", e => {
      updateTypeVisibility(e.target.value);
    });
  }

  // 저장 버튼
  const saveBtn = document.getElementById("save-mcp-server-button");
  if (saveBtn) {
    saveBtn.addEventListener("click", saveServerFromForm);
  }

  // 취소 버튼
  const cancelBtn = document.getElementById("cancel-mcp-server-button");
  if (cancelBtn) {
    cancelBtn.addEventListener("click", hideServerForm);
  }

  // 초기 서버 목록 요청
  vscode?.postMessage({
    command: "getMcpServers"
  });
}

/**
 * MCP 서버 목록 업데이트
 */
function updateMcpServers(servers) {
  mcpServers = servers || [];
  renderServerList();
}

/**
 * MCP 서버 상태 업데이트
 */
function updateMcpServerStatus(serverId, status, tools = null) {
  const server = mcpServers.find(s => s.id === serverId);
  if (server) {
    server.status = status;
    if (tools) {
      server.tools = tools;
    }
    renderServerList();
  }
}

/**
 * MCP 메시지 핸들러
 */
function handleMcpMessage(data) {
  switch (data.command) {
    case "mcpServers":
      updateMcpServers(data.servers);
      break;
    case "mcpServerAdded":
      if (data.server) {
        mcpServers.push(data.server);
        renderServerList();
      }
      break;
    case "mcpServerUpdated":
      if (data.server) {
        const idx = mcpServers.findIndex(s => s.id === data.server.id);
        if (idx !== -1) {
          mcpServers[idx] = data.server;
          renderServerList();
        }
      }
      break;
    case "mcpServerRemoved":
      mcpServers = mcpServers.filter(s => s.id !== data.serverId);
      renderServerList();
      break;
    case "mcpServerStatus":
      updateMcpServerStatus(data.serverId, data.status, data.tools);
      break;
    case "mcpTestResult":
      if (data.success) {
        showInlineTestResult(data.serverId, true, `연결 성공! ${data.toolCount || 0}개 도구 발견`);
        updateMcpServerStatus(data.serverId, "connected", data.tools);
      } else {
        showInlineTestResult(data.serverId, false, `연결 실패: ${data.error}`);
        updateMcpServerStatus(data.serverId, "error");
      }
      break;
    case "mcpServerToggled":
      {
        const server = mcpServers.find(s => s.id === data.serverId);
        if (server) {
          server.enabled = data.enabled;
          server.status = data.status || (data.enabled ? "disconnected" : "disconnected");
          if (!data.enabled) {
            server.tools = [];
          }
          renderServerList();
        }
        break;
      }
  }
}

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__webpack_require__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__webpack_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry needs to be wrapped in an IIFE because it needs to be isolated against other modules in the chunk.
(() => {
__webpack_require__.r(__webpack_exports__);
/* harmony import */ var _settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(156);
/* harmony import */ var _settings_toggles_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(157);
/* harmony import */ var _settings_mcp_settings_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(158);
// settings.js




// VS Code API를 전역으로 획득
if (typeof window.vscode === "undefined" && typeof acquireVsCodeApi !== "undefined") {
  window.vscode = acquireVsCodeApi();
}
const vscode = window.vscode || null;

// 설정 로드 중 플래그 (자동 저장 방지용)
let isLoadingSettings = false;

// 테마를 body에 적용하는 함수
function applyThemeToBody(theme) {
  if (theme === "auto") {
    // VS Code 테마 감지
    const isDark = document.body.classList.contains("vscode-dark") || window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.body.setAttribute("data-theme", isDark ? "dark" : "light");
  } else {
    document.body.setAttribute("data-theme", theme);
  }
  console.log("[Settings] Theme applied to body:", theme);
}

// 초기 테마 요청
if (vscode) {
  vscode.postMessage({
    command: "getChatTheme"
  });
}

// DOM 요소 참조

const autoUpdateToggle = document.getElementById("auto-update-toggle");
const autoUpdateStatus = document.getElementById("auto-update-status");
const autoDeleteToggle = document.getElementById("auto-delete-toggle");
const autoDeleteStatus = document.getElementById("auto-delete-status");
const testRetrySpinner = document.getElementById("test-retry-spinner");
const testRetryStatus = document.getElementById("test-retry-status");
const autoTestRetryToggle = document.getElementById("auto-test-retry-toggle");
const autoTestRetryStatus = document.getElementById("auto-test-retry-status");
const errorRetrySpinner = document.getElementById("error-retry-spinner");
const errorRetryStatus = document.getElementById("error-retry-status");
const autoCorrectionToggle = document.getElementById("auto-correction-toggle");
const autoCorrectionStatus = document.getElementById("auto-correction-status");
const autoExecuteToggle = document.getElementById("auto-execute-toggle");
const autoExecuteStatus = document.getElementById("auto-execute-status");
const autoToolToggle = document.getElementById("auto-tool-toggle");
const autoToolStatus = document.getElementById("auto-tool-status");
const streamingToggle = document.getElementById("streaming-toggle");
const streamingStatus = document.getElementById("streaming-status");

// 토글 이벤트 바인딩 (모듈 함수 사용)
(0,_settings_toggles_js__WEBPACK_IMPORTED_MODULE_1__.bindToggleEvents)({
  autoUpdateToggle,
  autoDeleteToggle,
  streamingToggle,
  autoTestRetryToggle,
  autoCorrectionToggle,
  autoExecuteToggle,
  autoToolToggle,
  vscode
});

// 스피너 이벤트 바인딩 (모듈 함수 사용)
(0,_settings_toggles_js__WEBPACK_IMPORTED_MODULE_1__.bindSpinnerEvents)({
  testRetrySpinner,
  errorRetrySpinner,
  vscode
});

// API 키 관련 요소들

// Gemini API 키 관련 요소들
const geminiApiKeyInput = document.getElementById("gemini-api-key-input");
const saveGeminiApiKeyButton = document.getElementById("save-gemini-api-key-button");
const geminiApiKeyStatus = document.getElementById("gemini-api-key-status");
const geminiModelSelect = document.getElementById("gemini-model-select");
const saveGeminiModelButton = document.getElementById("save-gemini-model-button");

// Banya API 키 관련 요소들
const banyaApiKeyInput = document.getElementById("banya-api-key-input");
const saveBanyaApiKeyButton = document.getElementById("save-banya-api-key-button");
const banyaApiKeyStatus = document.getElementById("banya-api-key-status");
const banyaModelSelect = document.getElementById("banya-model-select");
const saveBanyaModelButton = document.getElementById("save-banya-model-button");

// Ollama 설정 그룹
const ollamaSettingsGroup = document.getElementById("ollama-settings-group");

// Ollama 서버 타입 관련 요소들
const ollamaServerTypeSelect = document.getElementById("ollama-server-type-select");
const saveOllamaServerTypeButton = document.getElementById("save-ollama-server-type-button");
const ollamaServerTypeStatus = document.getElementById("ollama-server-type-status");

// 로컬 Ollama API URL 관련 요소들
const localOllamaApiUrlInput = document.getElementById("local-ollama-api-url-input");
const saveLocalOllamaApiUrlButton = document.getElementById("save-local-ollama-api-url-button");
const localOllamaApiUrlStatus = document.getElementById("local-ollama-api-url-status");

// 로컬 Ollama 엔드포인트 관련 요소들
const localOllamaEndpointSelect = document.getElementById("local-ollama-endpoint-select");
const saveLocalOllamaEndpointButton = document.getElementById("save-local-ollama-endpoint-button");
const localOllamaEndpointStatus = document.getElementById("local-ollama-endpoint-status");

// 원격 서버 모델명 관련 요소들
const remoteOllamaModelInput = document.getElementById("remote-ollama-model-input");
const saveRemoteOllamaModelButton = document.getElementById("save-remote-ollama-model-button");
const remoteOllamaModelStatus = document.getElementById("remote-ollama-model-status");

// 원격 서버 API URL 관련 요소들
const remoteOllamaApiUrlInput = document.getElementById("remote-ollama-api-url-input");
const saveRemoteOllamaApiUrlButton = document.getElementById("save-remote-ollama-api-url-button");
const remoteOllamaApiUrlStatus = document.getElementById("remote-ollama-api-url-status");

// 원격 서버 엔드포인트 관련 요소들
const remoteOllamaEndpointSelect = document.getElementById("remote-ollama-endpoint-select");
const saveRemoteOllamaEndpointButton = document.getElementById("save-remote-ollama-endpoint-button");
const remoteOllamaEndpointStatus = document.getElementById("remote-ollama-endpoint-status");

// Ollama 모델 선택 관련 요소들
const ollamaModelSelect = document.getElementById("ollama-model-select");
const saveOllamaModelButton = document.getElementById("save-ollama-model-button");
const ollamaModelStatus = document.getElementById("ollama-model-status");

// AIDEV 시리얼 번호 관련 요소들
const banyaLicenseSerialInput = document.getElementById("banya-license-serial-input");
const saveBanyaLicenseButton = document.getElementById("save-banya-license-button");
const verifyBanyaLicenseButton = document.getElementById("verify-banya-license-button");
const deleteBanyaLicenseButton = document.getElementById("delete-banya-license-button");
const banyaLicenseStatus = document.getElementById("banya-license-status");

// AI 모델 선택 관련 요소들
const aiModelSelect = document.getElementById("ai-model-select");
const saveAiModelButton = document.getElementById("save-ai-model-button");
const aiModelStatus = document.getElementById("ai-model-status");
const sourcePathStatus = document.getElementById("source-path-status");
const sourcePathsList = document.getElementById("source-paths-list");
const geminiSettingsSection = document.getElementById("gemini-settings-section");
const banyaSettingsSection = document.getElementById("banya-settings-section");
const localOllamaSettingsSection = document.getElementById("local-ollama-settings-section");
const remoteOllamaSettingsSection = document.getElementById("remote-ollama-settings-section");

// 시리얼 번호 검증 상태 추적
let isLicenseVerified = false;
let storedOllamaModel = null; // 저장된 Ollama 모델 값
let currentSettingsOllamaModel = null; // currentSettings에서 받은 Ollama 모델 값

// 저장 버튼들의 활성화/비활성화를 제어하는 함수
function updateSaveButtonsState() {
  // 시리얼 번호 검증이 필요한 버튼들 (API 키 관련)
  const licenseRequiredButtons = [saveGeminiApiKeyButton, saveGeminiModelButton, saveBanyaApiKeyButton, saveBanyaModelButton];

  // 시리얼 번호 검증이 필요하지 않은 버튼들 (설정 관련)
  const alwaysEnabledButtons = [saveLocalOllamaApiUrlButton, saveLocalOllamaEndpointButton, saveRemoteOllamaModelButton, saveRemoteOllamaApiUrlButton, saveRemoteOllamaEndpointButton, saveOllamaServerTypeButton, saveOllamaModelButton];

  // console.log('Updating save buttons state. Serial number verified:', isLicenseVerified);

  // 시리얼 번호 검증이 필요한 버튼들 처리
  licenseRequiredButtons.forEach(button => {
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
  alwaysEnabledButtons.forEach(button => {
    if (button) {
      button.disabled = false;
      button.style.opacity = "1";
      button.style.cursor = "pointer";
    }
    // 선택 변경 시에도 즉시 저장(자동 저장)
    try {
      if (aiModelStatus) {
        aiModelStatus.textContent = "AI 모델 자동 저장 중...";
        aiModelStatus.className = "info-message";
      }
      if (aiModelSelect && aiModelSelect.value) {
        const selectedModel = aiModelSelect.value;
        vscode.postMessage({
          command: "saveAiModel",
          model: selectedModel
        });
      }
    } catch (e) {
      console.warn("Failed to autosave AI model:", e);
    }
  });
}

// 라이센스 버튼들의 활성화/비활성화를 제어하는 함수
function updateLicenseButtonsState() {
  const hasStoredLicense = banyaLicenseSerialInput && banyaLicenseSerialInput.value.trim() !== "";

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
    const hasInputValue = banyaLicenseSerialInput && banyaLicenseSerialInput.value.trim() !== "";
    verifyBanyaLicenseButton.disabled = !hasInputValue;
    verifyBanyaLicenseButton.style.opacity = hasInputValue ? "1" : "0.5";
    verifyBanyaLicenseButton.style.cursor = hasInputValue ? "pointer" : "not-allowed";
  }
}

// 언어별 텍스트 로딩 및 적용
const languageSelect = document.getElementById("language-select");
const saveLanguageButton = document.getElementById("save-language-button");
let currentLanguage = "ko"; // 기본값
let languageData = {};
async function loadLanguage(lang) {
  try {
    // 확장 프로그램에 언어 데이터 요청
    vscode.postMessage({
      command: "getLanguageData",
      language: lang
    });
  } catch (e) {
    console.error("Failed to load language:", lang, e);
  }
}
function applyLanguage() {
  // 타이틀
  const settingsTitle = document.getElementById("settings-title");
  if (settingsTitle && languageData["settingsTitle"]) {
    settingsTitle.textContent = languageData["settingsTitle"];
  }

  // 언어 라벨
  const languageLabel = document.getElementById("language-label");
  if (languageLabel && languageData["languageLabel"]) {
    languageLabel.textContent = languageData["languageLabel"];
  }

  // 언어 저장 버튼
  const saveLanguageButton = document.getElementById("save-language-button");
  if (saveLanguageButton && languageData["saveButton"]) {
    saveLanguageButton.textContent = languageData["saveButton"];
  }

  // API 키 섹션 타이틀
  const apiKeySectionTitle = document.getElementById("api-key-section-title");
  if (apiKeySectionTitle && languageData["apiKeySectionTitle"]) {
    apiKeySectionTitle.textContent = languageData["apiKeySectionTitle"];
  }

  // AI 모델 설정 설명
  const aiModelSettingsDescription = document.querySelector("#api-key-section-title + p");
  if (aiModelSettingsDescription && languageData["aiModelSettingsDescription"]) {
    aiModelSettingsDescription.textContent = languageData["aiModelSettingsDescription"];
  }

  // Gemini API 키 라벨
  const geminiApiKeyLabel = document.getElementById("gemini-api-key-label");
  if (geminiApiKeyLabel && languageData["geminiApiKeyLabel"]) {
    geminiApiKeyLabel.textContent = languageData["geminiApiKeyLabel"];
  }

  // Gemini API 설명 (기존 변수 사용)
  const geminiApiDescriptionForLabel = document.querySelector("#gemini-api-key-label + p");
  if (geminiApiDescriptionForLabel && languageData["geminiApiDescription"]) {
    geminiApiDescriptionForLabel.textContent = languageData["geminiApiDescription"];
  }

  // Gemini API 등록 방법 (기존 변수 사용)
  const geminiApiRegistrationMethodForLabel = document.querySelector("#gemini-api-key-label + p + p");
  if (geminiApiRegistrationMethodForLabel && languageData["geminiApiRegistrationMethod"]) {
    const linkMatch = geminiApiRegistrationMethodForLabel.innerHTML.match(/<a[^>]*>([^<]*)<\/a>/);
    if (linkMatch) {
      const linkText = linkMatch[1];
      const newText = languageData["geminiApiRegistrationMethod"].replace("Google AI Studio API 키 페이지", `<a href="https://aistudio.google.com/app/apikey" target="_blank">${linkText}</a>`);
      geminiApiRegistrationMethodForLabel.innerHTML = newText;
    } else {
      geminiApiRegistrationMethodForLabel.textContent = languageData["geminiApiRegistrationMethod"];
    }
  }

  // Gemini 저장 버튼
  const saveGeminiApiKeyButton = document.getElementById("save-gemini-api-key-button");
  if (saveGeminiApiKeyButton && languageData["saveGeminiApiKeyButton"]) {
    saveGeminiApiKeyButton.textContent = languageData["saveGeminiApiKeyButton"];
  }

  // Gemini 저장 상태 - 현재 상태에 따라 업데이트
  const geminiApiKeyStatus = document.getElementById("gemini-api-key-status");
  if (geminiApiKeyStatus) {
    const currentText = geminiApiKeyStatus.textContent;
    if (currentText.includes("저장됨") || currentText.includes("Saved") || currentText.includes("Gespeichert") || currentText.includes("Guardado") || currentText.includes("Enregistré") || currentText.includes("保存済み") || currentText.includes("已保存")) {
      geminiApiKeyStatus.textContent = languageData["geminiApiKeyStatusSaved"];
    } else if (currentText.includes("미저장") || currentText.includes("Not Saved") || currentText.includes("Nicht gespeichert") || currentText.includes("No guardado") || currentText.includes("Non enregistré") || currentText.includes("未保存") || currentText.includes("未保存")) {
      geminiApiKeyStatus.textContent = languageData["geminiApiKeyStatusNotSaved"];
    }
  }

  // 공통 저장 버튼들
  document.querySelectorAll(".save-button").forEach(btn => {
    if (languageData["saveButton"]) {
      btn.textContent = languageData["saveButton"];
    }
  });

  // 소스 경로 라벨
  const sourcePathLabel = document.getElementById("source-path-label");
  if (sourcePathLabel && languageData["sourcePathLabel"]) {
    sourcePathLabel.textContent = languageData["sourcePathLabel"];
  }

  // 소스 경로 추가 버튼
  const addSourcePathButton = document.getElementById("add-source-path-button");
  if (addSourcePathButton && languageData["addSourcePathButton"]) {
    addSourcePathButton.textContent = languageData["addSourcePathButton"];
  }

  // 자동 파일 업데이트 라벨
  const autoUpdateLabel = document.getElementById("auto-update-label");
  if (autoUpdateLabel && languageData["autoUpdateLabel"]) {
    autoUpdateLabel.textContent = languageData["autoUpdateLabel"];
  }

  // 자동 파일 업데이트 on/off
  const autoUpdateOn = document.getElementById("auto-update-on");
  if (autoUpdateOn && languageData["autoUpdateOn"]) {
    autoUpdateOn.textContent = languageData["autoUpdateOn"];
  }
  const autoUpdateOff = document.getElementById("auto-update-off");
  if (autoUpdateOff && languageData["autoUpdateOff"]) {
    autoUpdateOff.textContent = languageData["autoUpdateOff"];
  }

  // 자동 파일 업데이트 활성화 텍스트
  const autoUpdateEnabledText = document.getElementById("auto-update-enabled-text");
  if (autoUpdateEnabledText && languageData["autoUpdateEnabled"]) {
    autoUpdateEnabledText.textContent = languageData["autoUpdateEnabled"];
  }

  // 기타 설명 텍스트들 (p 태그들) - 더 정확한 매칭으로 개선
  const infoMessages = document.querySelectorAll(".info-message");
  infoMessages.forEach(msg => {
    const text = msg.textContent;
    if (text && (text.includes("CODEPILOT이 AI 응답을 생성할 때 참조할 소스 코드 경로 목록입니다") || text.includes("This is a list of source code paths that CODEPILOT will reference") || text.includes("Esta es una lista de rutas de código fuente que CODEPILOT referenciará") || text.includes("Ceci est une liste de chemins de code source que CODEPILOT référencera") || text.includes("这是 CODEPILOT 在生成 AI 响应时将引用的源代码路径列表") || text.includes("これは、CODEPILOTがAI応答を生成する際に参照するソースコードパスのリストです"))) {
      // 소스 경로 설명
      if (languageData["sourcePathDescription"]) {
        msg.textContent = languageData["sourcePathDescription"];
      }
    } else if (text && (text.includes("LLM이 제안한 코드를 기반으로 파일을 자동으로 업데이트할지 여부를 설정합니다") || text.includes("Set whether to automatically update files based on code suggested by the LLM") || text.includes("Establece si actualizar automáticamente archivos basándose en código sugerido por el LLM") || text.includes("Définissez s'il faut mettre à jour automatiquement les fichiers en fonction du code suggéré par le LLM") || text.includes("设置是否基于 LLM 建议的代码自动更新文件") || text.includes("LLMが提案したコードに基づいてファイルを自動更新するかどうかを設定します"))) {
      // 자동 업데이트 설명
      if (languageData["autoUpdateDescription"]) {
        msg.textContent = languageData["autoUpdateDescription"];
      }
    } else if (text && (text.includes("설정 변경은 즉시 저장됩니다") || text.includes("Settings are saved immediately when changed") || text.includes("La configuración se guarda inmediatamente cuando se cambia") || text.includes("Les paramètres sont enregistrés immédiatement lors de la modification") || text.includes("设置更改时立即保存") || text.includes("設定は変更時に即座に保存されます") || text.includes("Einstellungen werden sofort gespeichert, wenn sie geändert werden"))) {
      // 설정 저장 설명
      if (languageData["settingsSavedImmediately"]) {
        msg.textContent = languageData["settingsSavedImmediately"];
      }
    } else if (text && (text.includes("CODEPILOT의 AI 기능을 사용하기 위한 모델 설정합니다") || text.includes("Set the Gemini API key to use CODEPILOT's AI features") || text.includes("Establece la clave API de Gemini para usar las funciones de IA de ACODEPILOT") || text.includes("Définissez la clé API Gemini pour utiliser les fonctionnalités IA de CODEPILOT") || text.includes("设置 Gemini API 密钥以使用 CODEPILOT 的 AI 功能") || text.includes("CODEPILOTのAI機能を使用するためのGemini APIキーを設定します"))) {
      // Gemini API 설명
      if (languageData["geminiApiDescription"]) {
        msg.textContent = languageData["geminiApiDescription"];
      }
    } else if (text && (text.includes("AI 코드 생성 및 분석 기능을 활성화합니다") || text.includes("Enables AI code generation and analysis features") || text.includes("Habilita las funciones de generación y análisis de código de IA") || text.includes("Active les fonctionnalités de génération et d'analyse de code IA") || text.includes("启用 AI 代码生成和分析功能") || text.includes("AIコード生成と分析機能を有効にします"))) {
      // Gemini API 기능 설명
      if (languageData["geminiApiFunctionDescription"]) {
        msg.textContent = languageData["geminiApiFunctionDescription"];
      }
    } else if (text && (text.includes("실시간 정보 기능을 사용하기 위한 외부 API 키들을 설정합니다") || text.includes("Set external API keys to use real-time information features") || text.includes("Establece claves API externas para usar funciones de información en tiempo real") || text.includes("Définissez les clés API externes pour utiliser les fonctionnalités d'information en temps réel") || text.includes("设置外部 API 密钥以使用实时信息功能") || text.includes("リアルタイム情報機能を使用するための外部APIキーを設定します"))) {
      // 외부 API 키 설명
      if (languageData["externalApiKeysDescription"]) {
        msg.textContent = languageData["externalApiKeysDescription"];
      }
    }
  });

  // 로딩 텍스트 업데이트 (언어 데이터가 로드된 후) - 더 포괄적인 매칭 추가
  if (languageData["settingsLoading"] && sourcePathStatus) {
    const currentText = sourcePathStatus.textContent;
    if (currentText === "설정 로드 중..." || currentText === "Loading settings..." || currentText === "Cargando configuración..." || currentText === "Chargement des paramètres..." || currentText === "正在加载设置..." || currentText === "設定を読み込み中..." || currentText === "Lade Einstellungen...") {
      sourcePathStatus.textContent = languageData["settingsLoading"];
    }
  }

  // 소스 경로 리스트 업데이트 (언어 데이터가 로드된 후)
  if (sourcePathsList) {
    const currentItems = sourcePathsList.querySelectorAll(".path-item");
    if (currentItems.length === 1) {
      const itemText = currentItems[0].textContent;
      if (itemText.includes("지정된 경로 없음") || itemText.includes("No paths specified") || itemText.includes("No se especificaron rutas") || itemText.includes("Aucun chemin spécifié") || itemText.includes("未指定路径") || itemText.includes("パスが指定されていません") || itemText.includes("Keine Pfade angegeben")) {
        // 현재 "지정된 경로 없음" 상태라면 언어 변경 시 업데이트
        updateSourcePathsList([]);
      }
    }
  }

  // Gemini API 설명
  const geminiApiDescription = document.querySelector("#api-key-section-title + p");
  if (geminiApiDescription && languageData["geminiApiDescription"]) {
    geminiApiDescription.textContent = languageData["geminiApiDescription"];
  }

  // Gemini API 등록 방법
  const geminiApiRegistrationMethod = document.querySelector("#api-key-section-title + p + p");
  if (geminiApiRegistrationMethod && languageData["geminiApiRegistrationMethod"]) {
    // 링크는 유지하면서 텍스트만 업데이트
    const linkMatch = geminiApiRegistrationMethod.innerHTML.match(/<a[^>]*>([^<]*)<\/a>/);
    if (linkMatch) {
      const linkText = linkMatch[1];
      const newText = languageData["geminiApiRegistrationMethod"].replace("Google AI Studio API 키 페이지", `<a href="https://aistudio.google.com/app/apikey" target="_blank">${linkText}</a>`);
      geminiApiRegistrationMethod.innerHTML = newText;
    } else {
      geminiApiRegistrationMethod.textContent = languageData["geminiApiRegistrationMethod"];
    }
  }

  // AI 모델 설정 제목
  const aiModelSettingsTitle = document.getElementById("api-key-section-title");
  if (aiModelSettingsTitle && languageData["aiModelSettingsTitle"]) {
    aiModelSettingsTitle.textContent = languageData["aiModelSettingsTitle"];
  }

  // Ollama API 라벨
  const ollamaApiLabel = document.getElementById("ollama-api-label");
  if (ollamaApiLabel && languageData["ollamaApiLabel"]) {
    ollamaApiLabel.textContent = languageData["ollamaApiLabel"];
  }

  // Ollama API 설명
  const ollamaApiDescription = document.querySelector("#ollama-api-label + p");
  if (ollamaApiDescription && languageData["ollamaApiDescription"]) {
    ollamaApiDescription.textContent = languageData["ollamaApiDescription"];
  }

  // Ollama API 설정 방법
  const ollamaApiSetupMethod = document.querySelector("#ollama-api-label + p + p");
  if (ollamaApiSetupMethod && languageData["ollamaApiSetupMethod"]) {
    ollamaApiSetupMethod.textContent = languageData["ollamaApiSetupMethod"];
  }

  // Ollama 저장 버튼
  const saveOllamaApiUrlButton = document.getElementById("save-ollama-api-url-button");
  if (saveOllamaApiUrlButton && languageData["saveOllamaApiUrlButton"]) {
    saveOllamaApiUrlButton.textContent = languageData["saveOllamaApiUrlButton"];
  }

  // Banya 라이센스 제목
  const banyaLicenseTitle = document.getElementById("banya-license-title");
  if (banyaLicenseTitle && languageData["banyaLicenseTitle"]) {
    banyaLicenseTitle.textContent = languageData["banyaLicenseTitle"];
  }

  // Banya 라이센스 설명
  const banyaLicenseDescription = document.querySelector("#banya-license-title + p");
  if (banyaLicenseDescription && languageData["banyaLicenseDescription"]) {
    banyaLicenseDescription.textContent = languageData["banyaLicenseDescription"];
  }

  // Banya 라이센스 라벨
  const banyaLicenseLabel = document.getElementById("banya-license-label");
  if (banyaLicenseLabel && languageData["banyaLicenseLabel"]) {
    banyaLicenseLabel.textContent = languageData["banyaLicenseLabel"];
  }

  // Banya 라이센스 설명 (섹션 내)
  const banyaLicenseSectionDescription = document.querySelector("#banya-license-label + p");
  if (banyaLicenseSectionDescription && languageData["banyaLicenseSectionDescription"]) {
    banyaLicenseSectionDescription.textContent = languageData["banyaLicenseSectionDescription"];
  }

  // Banya 라이센스 저장 버튼
  const saveBanyaLicenseButton = document.getElementById("save-banya-license-button");
  if (saveBanyaLicenseButton && languageData["saveBanyaLicenseButton"]) {
    saveBanyaLicenseButton.textContent = languageData["saveBanyaLicenseButton"];
  }

  // Banya 라이센스 검증 버튼
  const verifyBanyaLicenseButton = document.getElementById("verify-banya-license-button");
  if (verifyBanyaLicenseButton && languageData["verifyButton"]) {
    verifyBanyaLicenseButton.textContent = languageData["verifyButton"];
  }

  // Banya 라이센스 삭제 버튼
  const deleteBanyaLicenseButton = document.getElementById("delete-banya-license-button");
  if (deleteBanyaLicenseButton && languageData["deleteBanyaLicenseButton"]) {
    deleteBanyaLicenseButton.textContent = languageData["deleteBanyaLicenseButton"];
  }

  // Banya 라이센스 입력 필드 placeholder
  const banyaLicenseSerialInput = document.getElementById("banya-license-serial-input");
  if (banyaLicenseSerialInput && languageData["pleaseEnterBanyaLicense"]) {
    banyaLicenseSerialInput.placeholder = languageData["pleaseEnterBanyaLicense"];
  }

  // Banya 라이센스 상태 메시지 업데이트
  const banyaLicenseStatus = document.getElementById("banya-license-status");
  if (banyaLicenseStatus && banyaLicenseStatus.textContent) {
    const currentText = banyaLicenseStatus.textContent;
    if (currentText.includes("설정되지 않았습니다") || currentText.includes("not set") || currentText.includes("nicht festgelegt") || currentText.includes("no está configurada") || currentText.includes("n'est pas définie") || currentText.includes("設定されていません") || currentText.includes("未设置")) {
      banyaLicenseStatus.textContent = languageData["banyaLicenseNotSet"] || "Banya 라이센스가 설정되지 않았습니다.";
    } else if (currentText.includes("설정되어 있습니다") || currentText.includes("is set") || currentText.includes("ist festgelegt") || currentText.includes("está configurada") || currentText.includes("est définie") || currentText.includes("設定されています") || currentText.includes("已设置")) {
      banyaLicenseStatus.textContent = languageData["banyaLicenseSet"] || "Banya 라이센스가 설정되어 있습니다.";
    }
  }

  // AI 모델 선택 라벨
  const aiModelSelectLabel = document.getElementById("ai-model-select-label");
  if (aiModelSelectLabel && languageData["aiModelSelectLabel"]) {
    aiModelSelectLabel.innerHTML = `<b>${languageData["aiModelSelectLabel"]}</b>`;
  }

  // AI 모델 선택 옵션들
  const aiModelSelect = document.getElementById("ai-model-select");
  if (aiModelSelect && languageData["geminiOption"]) {
    const geminiOption = aiModelSelect.querySelector('option[value="gemini"]');
    if (geminiOption) {
      geminiOption.textContent = languageData["geminiOption"];
    }
  }
  if (aiModelSelect && languageData["ollamaOption"]) {
    const ollamaOption = aiModelSelect.querySelector('option[value="ollama"]');
    if (ollamaOption) {
      ollamaOption.textContent = languageData["ollamaOption"];
    }
  }
  if (aiModelSelect && languageData["banyaOption"]) {
    const banyaOption = aiModelSelect.querySelector('option[value="banya"]');
    if (banyaOption) {
      banyaOption.textContent = languageData["banyaOption"];
    }
  }

  // Ollama API URL 라벨 (기존 변수 사용)
  if (ollamaApiLabel && languageData["ollamaApiLabel"]) {
    ollamaApiLabel.textContent = languageData["ollamaApiLabel"];
  }

  // Ollama API 설명 (기존 변수 사용)
  if (ollamaApiDescription && languageData["ollamaApiDescription"]) {
    ollamaApiDescription.textContent = languageData["ollamaApiDescription"];
  }

  // Ollama API 설정 방법 (기존 변수 사용)
  if (ollamaApiSetupMethod && languageData["ollamaApiSetupMethod"]) {
    ollamaApiSetupMethod.textContent = languageData["ollamaApiSetupMethod"];
  }

  // Ollama API URL 저장 버튼 (기존 변수 사용)
  if (saveOllamaApiUrlButton && languageData["saveOllamaApiUrlButton"]) {
    saveOllamaApiUrlButton.textContent = languageData["saveOllamaApiUrlButton"];
  }

  // 모든 placeholder 업데이트
  // Gemini API 키 입력 필드
  if (geminiApiKeyInput && languageData["pleaseEnterApiKey"]) {
    geminiApiKeyInput.placeholder = languageData["pleaseEnterApiKey"];
  }

  // Ollama API URL 입력 필드
  const localOllamaApiUrlInput = document.getElementById("local-ollama-api-url-input");
  const remoteOllamaApiUrlInput = document.getElementById("remote-ollama-api-url-input");
  if (localOllamaApiUrlInput && languageData["pleaseEnterOllamaApiUrl"]) {
    localOllamaApiUrlInput.placeholder = languageData["pleaseEnterOllamaApiUrl"];
  }
  if (remoteOllamaApiUrlInput && languageData["pleaseEnterOllamaApiUrl"]) {
    remoteOllamaApiUrlInput.placeholder = languageData["pleaseEnterOllamaApiUrl"];
  }

  // 모든 상태 메시지 업데이트
  // Gemini API 키 상태
  if (geminiApiKeyStatus && geminiApiKeyStatus.textContent) {
    const currentText = geminiApiKeyStatus.textContent;
    if (currentText.includes("설정되어 있습니다") || currentText.includes("is set") || currentText.includes("ist festgelegt") || currentText.includes("está configurada") || currentText.includes("est définie") || currentText.includes("設定されています") || currentText.includes("已设置")) {
      geminiApiKeyStatus.textContent = languageData["geminiApiKeySet"] || "Gemini API 키가 설정되어 있습니다.";
    } else if (currentText.includes("설정되지 않았습니다") || currentText.includes("not set") || currentText.includes("nicht festgelegt") || currentText.includes("no está configurada") || currentText.includes("n'est pas définie") || currentText.includes("設定されていません") || currentText.includes("未设置")) {
      geminiApiKeyStatus.textContent = languageData["geminiApiKeyNotSet"] || "Gemini API 키가 설정되지 않았습니다.";
    }
  }

  // Ollama API URL 상태
  const localOllamaApiUrlStatus = document.getElementById("local-ollama-api-url-status");
  const remoteOllamaApiUrlStatus = document.getElementById("remote-ollama-api-url-status");
  if (localOllamaApiUrlStatus && localOllamaApiUrlStatus.textContent) {
    const currentText = localOllamaApiUrlStatus.textContent;
    if (currentText.includes("설정되어 있습니다") || currentText.includes("is set") || currentText.includes("ist festgelegt") || currentText.includes("está configurada") || currentText.includes("est définie") || currentText.includes("設定されています") || currentText.includes("已设置")) {
      localOllamaApiUrlStatus.textContent = languageData["ollamaApiUrlSet"] || "Ollama API URL이 설정되어 있습니다.";
    } else if (currentText.includes("설정되지 않았습니다") || currentText.includes("not set") || currentText.includes("nicht festgelegt") || currentText.includes("no está configurada") || currentText.includes("n'est pas définie") || currentText.includes("設定されていません") || currentText.includes("未设置")) {
      localOllamaApiUrlStatus.textContent = languageData["ollamaApiUrlNotSet"] || "Ollama API URL이 설정되지 않았습니다.";
    }
  }
  if (remoteOllamaApiUrlStatus && remoteOllamaApiUrlStatus.textContent) {
    const currentText = remoteOllamaApiUrlStatus.textContent;
    if (currentText.includes("설정되어 있습니다") || currentText.includes("is set") || currentText.includes("ist festgelegt") || currentText.includes("está configurada") || currentText.includes("est définie") || currentText.includes("設定されています") || currentText.includes("已设置")) {
      remoteOllamaApiUrlStatus.textContent = languageData["ollamaApiUrlSet"] || "Ollama API URL이 설정되어 있습니다.";
    } else if (currentText.includes("설정되지 않았습니다") || currentText.includes("not set") || currentText.includes("nicht festgelegt") || currentText.includes("no está configurada") || currentText.includes("n'est pas définie") || currentText.includes("設定されていません") || currentText.includes("未设置")) {
      remoteOllamaApiUrlStatus.textContent = languageData["ollamaApiUrlNotSet"] || "Ollama API URL이 설정되지 않았습니다.";
    }
  }
}
if (languageSelect) {
  languageSelect.addEventListener("change", e => {
    const lang = e.target.value;
    console.log("Language changed to:", lang);

    // 언어 데이터 로드 요청
    loadLanguage(lang);

    // 언어 저장 요청
    vscode.postMessage({
      command: "saveLanguage",
      language: lang
    });

    // 임시로 현재 언어 업데이트 (UI 반응성 향상)
    currentLanguage = lang;

    // 즉시 UI 업데이트 시도 (기존 언어 데이터로)
    if (Object.keys(languageData).length > 0) {
      console.log("Immediate UI update with existing language data");
      applyLanguage();
    }
    // 선택 변경 시에도 즉시 저장(자동 저장)
    try {
      if (aiModelStatus) {
        aiModelStatus.textContent = "AI 모델 자동 저장 중...";
        aiModelStatus.className = "info-message";
      }
      if (aiModelSelect && aiModelSelect.value) {
        const selectedModel = aiModelSelect.value;
        vscode.postMessage({
          command: "saveAiModel",
          model: selectedModel
        });
      }
    } catch (e) {
      console.warn("Failed to autosave AI model:", e);
    }
  });
}

// 언어 저장 버튼 이벤트 리스너
if (saveLanguageButton) {
  saveLanguageButton.addEventListener("click", () => {
    const selectedLang = languageSelect.value;
    console.log("Manual language save requested:", selectedLang);

    // 이미 현재 언어와 같으면 저장하지 않음
    if (selectedLang === currentLanguage) {
      console.log("Language already saved, skipping duplicate save");
      return;
    }

    // 확장에 언어 저장 요청
    vscode.postMessage({
      command: "saveLanguage",
      language: selectedLang
    });

    // 로컬에서도 즉시 적용
    currentLanguage = selectedLang;
    loadLanguage(selectedLang);
  });
}

// 테마 저장 버튼 이벤트 리스너
const themeSelect = document.getElementById("theme-select");
const saveThemeButton = document.getElementById("save-theme-button");
const themeStatus = document.getElementById("theme-status");
if (saveThemeButton && themeSelect) {
  saveThemeButton.addEventListener("click", () => {
    const selectedTheme = themeSelect.value;
    console.log("Theme save requested:", selectedTheme);

    // 확장에 테마 저장 요청
    vscode.postMessage({
      command: "saveChatTheme",
      theme: selectedTheme
    });

    // 상태 표시
    if (themeStatus) {
      const themeLabels = {
        dark: "다크",
        light: "라이트",
        auto: "자동"
      };
      themeStatus.textContent = `테마가 ${themeLabels[selectedTheme] || selectedTheme}(으)로 저장되었습니다.`;
      themeStatus.className = "info-message success-message";
    }
  });
}

// showStatus -> ./settings/api-keys.js로 이동 (import로 사용)

// 토글 및 스피너 이벤트 리스너 -> 상단 bindToggleEvents, bindSpinnerEvents로 이동

// Ollama 서버 타입 선택 이벤트 리스너
if (ollamaServerTypeSelect) {
  ollamaServerTypeSelect.addEventListener("change", () => {
    const selectedType = ollamaServerTypeSelect.value;

    // 선택된 타입에 따라 섹션 표시/숨김
    if (selectedType === "local") {
      localOllamaSettingsSection.style.display = "block";
      remoteOllamaSettingsSection.style.display = "none";
      // disabled 클래스도 함께 관리
      if (localOllamaSettingsSection) {
        localOllamaSettingsSection.classList.remove("disabled");
      }
      if (remoteOllamaSettingsSection) {
        remoteOllamaSettingsSection.classList.add("disabled");
      }
    } else if (selectedType === "remote") {
      localOllamaSettingsSection.style.display = "none";
      remoteOllamaSettingsSection.style.display = "block";
      // disabled 클래스도 함께 관리
      if (localOllamaSettingsSection) {
        localOllamaSettingsSection.classList.add("disabled");
      }
      if (remoteOllamaSettingsSection) {
        remoteOllamaSettingsSection.classList.remove("disabled");
      }
    }

    // 서버 타입 저장
    vscode.postMessage({
      command: "saveOllamaServerType",
      ollamaServerType: selectedType
    });
    const savingText = "Ollama 서버 타입 저장 중...";
    (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(ollamaServerTypeStatus, savingText, "info");
  });
}

// API 키 저장 이벤트 리스너들
// Gemini API 키 저장 이벤트 리스너
if (saveGeminiApiKeyButton) {
  saveGeminiApiKeyButton.addEventListener("click", () => {
    const apiKey = geminiApiKeyInput.value.trim();
    if (apiKey) {
      vscode.postMessage({
        command: "saveApiKey",
        apiKey: apiKey
      });
      const savingText = languageData["apiKeysLoading"] || "Gemini API 키 저장 중...";
      (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(geminiApiKeyStatus, savingText, "info");
    } else {
      const pleaseEnterText = languageData["pleaseEnterApiKey"] || "API 키를 입력해주세요.";
      (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(geminiApiKeyStatus, pleaseEnterText, "error");
    }
    // 선택 변경 시에도 즉시 저장(자동 저장)
    try {
      if (aiModelStatus) {
        aiModelStatus.textContent = "AI 모델 자동 저장 중...";
        aiModelStatus.className = "info-message";
      }
      if (aiModelSelect && aiModelSelect.value) {
        const selectedModel = aiModelSelect.value;
        vscode.postMessage({
          command: "saveAiModel",
          model: selectedModel
        });
      }
    } catch (e) {
      console.warn("Failed to autosave AI model:", e);
    }
  });
}

// 로컬 Ollama API URL 저장 이벤트 리스너
if (saveLocalOllamaApiUrlButton) {
  saveLocalOllamaApiUrlButton.addEventListener("click", () => {
    const apiUrl = localOllamaApiUrlInput.value.trim();
    if (apiUrl) {
      // URL 유효성 검사
      try {
        new URL(apiUrl);
        vscode.postMessage({
          command: "saveLocalOllamaApiUrl",
          apiUrl: apiUrl
        });
        const savingText = languageData["ollamaApiUrlSaving"] || "로컬 Ollama API URL 저장 중...";
        (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(localOllamaApiUrlStatus, savingText, "info");
      } catch (error) {
        const invalidUrlText = languageData["invalidUrlFormat"] || "올바른 URL 형식을 입력해주세요. (예: http://localhost:11434)";
        (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(localOllamaApiUrlStatus, invalidUrlText, "error");
      }
    } else {
      const pleaseEnterText = languageData["pleaseEnterOllamaApiUrl"] || "로컬 Ollama API URL을 입력해주세요.";
      (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(localOllamaApiUrlStatus, pleaseEnterText, "error");
    }
  });
}

// 원격 서버 Ollama API URL 저장 이벤트 리스너
if (saveRemoteOllamaApiUrlButton) {
  saveRemoteOllamaApiUrlButton.addEventListener("click", () => {
    const apiUrl = remoteOllamaApiUrlInput.value.trim();
    if (apiUrl) {
      // URL 유효성 검사
      try {
        new URL(apiUrl);
        vscode.postMessage({
          command: "saveRemoteOllamaApiUrl",
          apiUrl: apiUrl
        });
        const savingText = languageData["ollamaApiUrlSaving"] || "원격 서버 API URL 저장 중...";
        (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(remoteOllamaApiUrlStatus, savingText, "info");
      } catch (error) {
        const invalidUrlText = languageData["invalidUrlFormat"] || "올바른 URL 형식을 입력해주세요. (예: http://192.168.1.100:11434)";
        (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(remoteOllamaApiUrlStatus, invalidUrlText, "error");
      }
    } else {
      const pleaseEnterText = languageData["pleaseEnterOllamaApiUrl"] || "원격 서버 API URL을 입력해주세요.";
      (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(remoteOllamaApiUrlStatus, pleaseEnterText, "error");
    }
  });
}

// Ollama 서버 타입 저장 이벤트 리스너
if (saveOllamaServerTypeButton) {
  saveOllamaServerTypeButton.addEventListener("click", () => {
    const serverType = ollamaServerTypeSelect.value;
    if (serverType) {
      vscode.postMessage({
        command: "saveOllamaServerType",
        ollamaServerType: serverType
      });
      const savingText = languageData["ollamaServerTypeSaving"] || "Ollama 서버 타입 저장 중...";
      (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(ollamaServerTypeStatus, savingText, "info");
    } else {
      const pleaseSelectText = languageData["pleaseSelectOllamaServerType"] || "Ollama 서버 타입을 선택해주세요.";
      (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(ollamaServerTypeStatus, pleaseSelectText, "error");
    }
  });
}

// Ollama 모델 저장 이벤트 리스너
if (saveOllamaModelButton) {
  saveOllamaModelButton.addEventListener("click", () => {
    const model = ollamaModelSelect.value;
    if (model) {
      vscode.postMessage({
        command: "saveOllamaModel",
        model: model
      });
      const savingText = "Ollama 모델 저장 중...";
      (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(ollamaModelStatus, savingText, "info");
    } else {
      // console.log('No model selected, showing error');
      (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(ollamaModelStatus, "모델을 선택해주세요.", "error");
    }
    // 선택 변경 시에도 즉시 저장(자동 저장)
    try {
      if (aiModelStatus) {
        aiModelStatus.textContent = "AI 모델 자동 저장 중...";
        aiModelStatus.className = "info-message";
      }
      if (aiModelSelect && aiModelSelect.value) {
        const selectedModel = aiModelSelect.value;
        vscode.postMessage({
          command: "saveAiModel",
          model: selectedModel
        });
      }
    } catch (e) {
      console.warn("Failed to autosave AI model:", e);
    }
  });
}

// Ollama 모델 선택 변경 이벤트 리스너
if (ollamaModelSelect) {
  ollamaModelSelect.addEventListener("change", () => {
    const selectedModel = ollamaModelSelect.value;
    // console.log('Ollama model selected:', selectedModel);

    // gpt-oss-120b:cloud 모델 선택 시 인증 섹션 표시
    const authSection = document.getElementById("ollama-auth-section");
    const authStatus = document.getElementById("ollama-auth-status");
    if (selectedModel === "gpt-oss-120b:cloud") {
      if (authSection) {
        authSection.style.display = "flex";
      }
      if (authStatus) {
        authStatus.style.display = "block";
      }
    } else {
      if (authSection) {
        authSection.style.display = "none";
      }
      if (authStatus) {
        authStatus.style.display = "none";
      }
    }
  });
}

// Ollama 인증 버튼 이벤트 리스너
const ollamaAuthButton = document.getElementById("ollama-auth-button");
const ollamaAuthSerial = document.getElementById("ollama-auth-serial");
const ollamaAuthStatus = document.getElementById("ollama-auth-status");
if (ollamaAuthButton) {
  ollamaAuthButton.addEventListener("click", () => {
    const serialNumber = ollamaAuthSerial ? ollamaAuthSerial.value.trim() : "";
    if (!serialNumber) {
      if (ollamaAuthStatus) {
        ollamaAuthStatus.textContent = "인증 시리얼 번호를 입력해주세요.";
        ollamaAuthStatus.className = "error-message";
      }
      return;
    }
    if (ollamaAuthStatus) {
      ollamaAuthStatus.textContent = "Ollama 인증 중...";
      ollamaAuthStatus.className = "info-message";
    }

    // 확장 프로그램에 Ollama 인증 요청
    vscode.postMessage({
      command: "ollamaAuth",
      serialNumber: serialNumber
    });
  });
}

// 로컬 Ollama 엔드포인트 저장 이벤트 리스너
if (saveLocalOllamaEndpointButton) {
  saveLocalOllamaEndpointButton.addEventListener("click", () => {
    const endpoint = localOllamaEndpointSelect.value;
    if (endpoint) {
      vscode.postMessage({
        command: "saveLocalOllamaEndpoint",
        endpoint: endpoint
      });
      const savingText = "로컬 Ollama 엔드포인트 저장 중...";
      (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(localOllamaEndpointStatus, savingText, "info");
    } else {
      (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(localOllamaEndpointStatus, "엔드포인트를 선택해주세요.", "error");
    }
  });
}

// 원격 서버 Ollama 엔드포인트 저장 이벤트 리스너
if (saveRemoteOllamaEndpointButton) {
  saveRemoteOllamaEndpointButton.addEventListener("click", () => {
    const endpoint = remoteOllamaEndpointSelect.value;
    if (endpoint) {
      vscode.postMessage({
        command: "saveRemoteOllamaEndpoint",
        endpoint: endpoint
      });
      const savingText = "원격 서버 엔드포인트 저장 중...";
      (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(remoteOllamaEndpointStatus, savingText, "info");
    } else {
      (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(remoteOllamaEndpointStatus, "엔드포인트를 선택해주세요.", "error");
    }
  });
}

// 원격 서버 모델명 저장 이벤트 리스너
if (saveRemoteOllamaModelButton) {
  saveRemoteOllamaModelButton.addEventListener("click", () => {
    const model = remoteOllamaModelInput.value.trim();
    if (model) {
      vscode.postMessage({
        command: "saveRemoteOllamaModel",
        model: model
      });
      const savingText = "원격 서버 모델명 저장 중...";
      (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(remoteOllamaModelStatus, savingText, "info");
    } else {
      (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(remoteOllamaModelStatus, "모델명을 입력해주세요.", "error");
    }
  });
}

// Banya 라이센스 저장 이벤트 리스너
if (saveBanyaLicenseButton) {
  saveBanyaLicenseButton.addEventListener("click", () => {
    const licenseSerial = banyaLicenseSerialInput.value.trim();
    if (licenseSerial) {
      vscode.postMessage({
        command: "saveBanyaLicenseSerial",
        banyaLicenseSerial: licenseSerial
      });
      const savingText = languageData["banyaLicenseSaving"] || "Banya 라이센스 저장 중...";
      (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(banyaLicenseStatus, savingText, "info");
    } else {
      const pleaseEnterText = languageData["pleaseEnterBanyaLicense"] || "라이센스 시리얼을 입력해주세요.";
      (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(banyaLicenseStatus, pleaseEnterText, "error");
    }
    // 선택 변경 시에도 즉시 저장(자동 저장)
    try {
      if (aiModelStatus) {
        aiModelStatus.textContent = "AI 모델 자동 저장 중...";
        aiModelStatus.className = "info-message";
      }
      if (aiModelSelect && aiModelSelect.value) {
        const selectedModel = aiModelSelect.value;
        vscode.postMessage({
          command: "saveAiModel",
          model: selectedModel
        });
      }
    } catch (e) {
      console.warn("Failed to autosave AI model:", e);
    }
  });
}

// Banya 라이센스 검증 이벤트 리스너
if (verifyBanyaLicenseButton) {
  verifyBanyaLicenseButton.addEventListener("click", () => {
    const licenseSerial = banyaLicenseSerialInput.value.trim();
    if (licenseSerial) {
      vscode.postMessage({
        command: "verifyBanyaLicense",
        licenseSerial: licenseSerial
      });
      const verifyingText = languageData["banyaLicenseVerifying"] || "Banya 라이센스 검증 중...";
      (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(banyaLicenseStatus, verifyingText, "info");
    } else {
      const pleaseEnterText = languageData["pleaseEnterBanyaLicense"] || "라이센스 시리얼을 입력해주세요.";
      (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(banyaLicenseStatus, pleaseEnterText, "error");
    }
    // 선택 변경 시에도 즉시 저장(자동 저장)
    try {
      if (aiModelStatus) {
        aiModelStatus.textContent = "AI 모델 자동 저장 중...";
        aiModelStatus.className = "info-message";
      }
      if (aiModelSelect && aiModelSelect.value) {
        const selectedModel = aiModelSelect.value;
        vscode.postMessage({
          command: "saveAiModel",
          model: selectedModel
        });
      }
    } catch (e) {
      console.warn("Failed to autosave AI model:", e);
    }
  });
}

// Banya 라이센스 삭제 이벤트 리스너
if (deleteBanyaLicenseButton) {
  deleteBanyaLicenseButton.addEventListener("click", () => {
    vscode.postMessage({
      command: "deleteBanyaLicense"
    });
    const deletingText = languageData["banyaLicenseDeleting"] || "Banya 라이센스 삭제 중...";
    (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(banyaLicenseStatus, deletingText, "info");
  });
}

// 라이센스 입력 필드 변경 이벤트 리스너
if (banyaLicenseSerialInput) {
  banyaLicenseSerialInput.addEventListener("input", () => {
    updateLicenseButtonsState();
  });
}

// AI 모델 선택 이벤트 리스너
if (aiModelSelect) {
  aiModelSelect.addEventListener("change", () => {
    const selectedModel = aiModelSelect.value;
    // console.log('AI model selected:', selectedModel);

    // 선택된 모델에 따라 설정 섹션 활성화/비활성화 및 표시 제어
    if (selectedModel === "gemini") {
      geminiSettingsSection.style.display = "block";
      geminiSettingsSection.classList.remove("disabled");
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
      geminiSettingsSection.style.display = "none";
      geminiSettingsSection.classList.add("disabled");
      if (ollamaSettingsGroup) {
        ollamaSettingsGroup.style.display = "none";
      }
    } else if (selectedModel === "ollama") {
      geminiSettingsSection.style.display = "none";
      geminiSettingsSection.classList.add("disabled");
      if (banyaSettingsSection) {
        banyaSettingsSection.style.display = "none";
        banyaSettingsSection.classList.add("disabled");
      }
      if (ollamaSettingsGroup) {
        ollamaSettingsGroup.style.display = "block";
      }

      // Ollama 선택 시 서버 타입에 따라 활성 섹션 결정
      const serverType = ollamaServerTypeSelect ? ollamaServerTypeSelect.value : "local";
      if (serverType === "remote") {
        localOllamaSettingsSection.classList.add("disabled");
        localOllamaSettingsSection.style.display = "none";
        remoteOllamaSettingsSection.classList.remove("disabled");
        remoteOllamaSettingsSection.style.display = "block";
      } else {
        localOllamaSettingsSection.classList.remove("disabled");
        localOllamaSettingsSection.style.display = "block";
        remoteOllamaSettingsSection.classList.add("disabled");
        remoteOllamaSettingsSection.style.display = "none";
      }
      // Ollama 선택 시 모델 목록 즉시 요청
      try {
        loadOllamaModels();
      } catch (e) {
        console.warn("loadOllamaModels failed:", e);
      }
    }

    // 선택 변경 시에도 즉시 저장(자동 저장) - 단, 설정 로드 중이 아닐 때만
    if (!isLoadingSettings) {
      try {
        if (aiModelStatus) {
          aiModelStatus.textContent = "AI 모델 자동 저장 중...";
          aiModelStatus.className = "info-message";
        }
        vscode.postMessage({
          command: "saveAiModel",
          model: selectedModel
        });
      } catch (e) {
        console.warn("Failed to autosave AI model:", e);
      }
    }
  });
}

// Gemini 모델 선택 이벤트 리스너 추가
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
        model: selectedGeminiModel
      });
    } catch (e) {
      console.warn("Failed to autosave Gemini model:", e);
    }
  });
}

// Gemini 모델 저장 버튼 이벤트 리스너
if (saveGeminiModelButton) {
  saveGeminiModelButton.addEventListener("click", () => {
    const selectedGeminiModel = geminiModelSelect.value;
    if (geminiApiKeyStatus) {
      geminiApiKeyStatus.textContent = "Gemini 모델 저장 중...";
      geminiApiKeyStatus.className = "info-message";
    }
    vscode.postMessage({
      command: "saveGeminiModel",
      model: selectedGeminiModel
    });
  });
}

// Banya API 키 저장 이벤트 리스너
if (saveBanyaApiKeyButton) {
  saveBanyaApiKeyButton.addEventListener("click", () => {
    const apiKey = banyaApiKeyInput.value.trim();
    if (apiKey) {
      vscode.postMessage({
        command: "saveBanyaApiKey",
        apiKey: apiKey
      });
      const savingText = languageData["apiKeysLoading"] || "Banya API 키 저장 중...";
      (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(banyaApiKeyStatus, savingText, "info");
    } else {
      const pleaseEnterText = languageData["pleaseEnterApiKey"] || "API 키를 입력해주세요.";
      (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(banyaApiKeyStatus, pleaseEnterText, "error");
    }
  });
}

// Banya 모델 선택 이벤트 리스너
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
        model: selectedBanyaModel
      });
    } catch (e) {
      console.warn("Failed to autosave Banya model:", e);
    }
  });
}
if (saveBanyaModelButton) {
  saveBanyaModelButton.addEventListener("click", () => {
    const selectedBanyaModel = banyaModelSelect.value;
    if (banyaApiKeyStatus) {
      banyaApiKeyStatus.textContent = "Banya 모델 저장 중...";
      banyaApiKeyStatus.className = "info-message";
    }
    vscode.postMessage({
      command: "saveBanyaModel",
      model: selectedBanyaModel
    });
  });
}

// AI 모델 저장 버튼 이벤트 리스너
if (saveAiModelButton) {
  saveAiModelButton.addEventListener("click", () => {
    const selectedModel = aiModelSelect.value;
    console.log("[Settings] Save AI Model button clicked. selectedModel =", selectedModel);
    if (aiModelStatus) {
      aiModelStatus.textContent = "AI 모델 저장 중...";
      aiModelStatus.className = "info-message";
    }

    // 확장 프로그램에 선택된 모델 저장 요청
    vscode.postMessage({
      command: "saveAiModel",
      model: selectedModel
    });
  });
}

// 확장으로부터 메시지 수신
window.addEventListener("message", event => {
  const message = event.data;
  switch (message.command) {
    case "aiModelSaved":
      {
        console.log("[Settings] aiModelSaved received from extension.");
        if (aiModelStatus) {
          aiModelStatus.textContent = "AI 모델이 저장되었습니다.";
          aiModelStatus.className = "success-message";
        }
        break;
      }
    case "aiModelSaveError":
      {
        console.warn("[Settings] aiModelSaveError received from extension:", message.error);
        if (aiModelStatus) {
          aiModelStatus.textContent = `AI 모델 저장 실패: ${message.error}`;
          aiModelStatus.className = "error-message";
        }
        break;
      }
    case "geminiModelSaved":
      {
        if (geminiApiKeyStatus) {
          geminiApiKeyStatus.textContent = "Gemini 모델이 저장되었습니다.";
          geminiApiKeyStatus.className = "success-message";
        }
        break;
      }
    case "geminiModelSaveError":
      {
        if (geminiApiKeyStatus) {
          geminiApiKeyStatus.textContent = `Gemini 모델 저장 실패: ${message.error}`;
          geminiApiKeyStatus.className = "error-message";
        }
        break;
      }
    case "banyaApiKeySaved":
      {
        if (banyaApiKeyStatus) {
          banyaApiKeyStatus.textContent = "Banya API 키가 저장되었습니다.";
          banyaApiKeyStatus.className = "success-message";
        }
        if (banyaApiKeyInput) {
          banyaApiKeyInput.value = "";
        }
        break;
      }
    case "banyaApiKeySaveError":
      {
        if (banyaApiKeyStatus) {
          banyaApiKeyStatus.textContent = `Banya API 키 저장 실패: ${message.error}`;
          banyaApiKeyStatus.className = "error-message";
        }
        break;
      }
    case "banyaModelSaved":
      {
        if (banyaApiKeyStatus) {
          banyaApiKeyStatus.textContent = "Banya 모델이 저장되었습니다.";
          banyaApiKeyStatus.className = "success-message";
        }
        break;
      }
    case "banyaModelSaveError":
      {
        if (banyaApiKeyStatus) {
          banyaApiKeyStatus.textContent = `Banya 모델 저장 실패: ${message.error}`;
          banyaApiKeyStatus.className = "error-message";
        }
        break;
      }
    case "ollamaModels":
      {
        // console.log('[Settings] Received ollamaModels message:', message);
        const sel = document.getElementById("ollama-model-select");
        if (sel) {
          // 현재 선택된 모델 저장
          const currentModel = sel.value;
          sel.innerHTML = "";
          const def = document.createElement("option");
          def.value = "";
          def.textContent = "모델을 선택하세요";
          sel.appendChild(def);
          if (Array.isArray(message.models)) {
            message.models.forEach(name => {
              const opt = document.createElement("option");
              opt.value = name;
              opt.textContent = name;
              sel.appendChild(opt);
            });
          }
          const modelToApply = currentSettingsOllamaModel || storedOllamaModel;
          if (modelToApply && modelToApply !== "") {
            const options = Array.from(sel.options).map(o => o.value);
            if (options.includes(modelToApply)) {
              sel.value = modelToApply;
            } else {
              // 목록에 없다면 앞에 추가
              const opt = document.createElement("option");
              opt.value = modelToApply;
              opt.textContent = modelToApply;
              sel.insertBefore(opt, sel.firstChild);
              sel.value = modelToApply;
            }
            // 적용 후 저장된 값 초기화
            storedOllamaModel = null;
            currentSettingsOllamaModel = null;
          } else if (currentModel && currentModel !== "") {
            sel.value = currentModel;
          }
        }
        break;
      }
    case "routingOllamaModels":
      {
        // 라우팅 모델용 Ollama 모델 리스트 수신
        console.log("[Settings] Received routingOllamaModels message:", message.models?.length || 0, "개");
        if (Array.isArray(message.models)) {
          // 캐시 업데이트 (window scope에서 접근 가능하도록)
          window.routingOllamaModelsCache = message.models;

          // 현재 ollama가 선택된 모든 라우팅 모델 셀렉트 업데이트
          const prefixes = ["compactor", "command", "intent"];
          prefixes.forEach(prefix => {
            const typeSelect = document.getElementById(`${prefix}-model-type-select`);
            const submodelSelect = document.getElementById(`${prefix}-submodel-select`);
            if (typeSelect && typeSelect.value === "ollama" && submodelSelect) {
              // 현재 선택된 값 저장
              const currentValue = submodelSelect.value;

              // 옵션 업데이트
              submodelSelect.innerHTML = "";
              message.models.forEach(name => {
                const option = document.createElement("option");
                option.value = name;
                option.textContent = name;
                submodelSelect.appendChild(option);
              });

              // 이전 선택값 복원 (있으면)
              if (currentValue && message.models.includes(currentValue)) {
                submodelSelect.value = currentValue;
              }
            }
          });
        }
        break;
      }
    case "currentSettings":
      // 설정 로드 시작 - 자동 저장 방지
      isLoadingSettings = true;

      // AI 모델 엔진 설정 처리
      if (message.aiModel && aiModelSelect) {
        aiModelSelect.value = message.aiModel;
        // AI 모델 선택에 따른 섹션 표시 업데이트
        aiModelSelect.dispatchEvent(new Event("change"));
      }

      // Gemini 모델 설정 처리
      if (message.geminiModel && geminiModelSelect) {
        geminiModelSelect.value = message.geminiModel;
      }

      // Banya 모델 설정 처리
      if (message.banyaModel && banyaModelSelect) {
        banyaModelSelect.value = message.banyaModel;
      }

      // 언어 설정 처리
      if (message.language && languageSelect) {
        // console.log('[Settings] Setting language from currentSettings:', message.language);
        languageSelect.value = message.language;
        currentLanguage = message.language;
        loadLanguage(message.language);
      }

      // 테마 설정 처리
      if (message.chatTheme) {
        const themeSelect = document.getElementById("theme-select");
        if (themeSelect) {
          themeSelect.value = message.chatTheme;
        }
        // body에 테마 적용
        applyThemeToBody(message.chatTheme);
      }

      // 버전 표시 (package.json에서 동기화)
      if (message.extensionVersion) {
        const versionNumberElement = document.getElementById("version-number");
        if (versionNumberElement) {
          versionNumberElement.textContent = message.extensionVersion;
        }
      }

      // Ollama 모델 설정 처리
      if (message.ollamaModel && message.ollamaModel !== "") {
        storedOllamaModel = message.ollamaModel;
        currentSettingsOllamaModel = message.ollamaModel;

        // 이미 Ollama 모델 목록이 로드되었다면 즉시 적용
        const sel = document.getElementById("ollama-model-select");
        if (sel && sel.options.length > 1) {
          // 기본 옵션 외에 다른 옵션이 있다면
          // console.log('[Settings] Applying stored model immediately:', message.ollamaModel);
          const options = Array.from(sel.options).map(o => o.value);
          if (options.includes(message.ollamaModel)) {
            sel.value = message.ollamaModel;
          } else {
            // 목록에 없다면 앞에 추가
            const opt = document.createElement("option");
            opt.value = message.ollamaModel;
            opt.textContent = message.ollamaModel;
            sel.insertBefore(opt, sel.firstChild);
            sel.value = message.ollamaModel;
          }
          // 적용 후 저장된 값 초기화
          storedOllamaModel = null;
          currentSettingsOllamaModel = null;
        }
      }
      if (typeof message.autoUpdateEnabled === "boolean" && autoUpdateToggle) {
        autoUpdateToggle.checked = message.autoUpdateEnabled;
      }
      if (typeof message.autoDeleteFilesEnabled === "boolean" && autoDeleteToggle) {
        autoDeleteToggle.checked = message.autoDeleteFilesEnabled;
      }
      if (typeof message.errorRetryCount === "number" && errorRetrySpinner) {
        errorRetrySpinner.value = message.errorRetryCount;
      }
      if (typeof message.autoExecuteCommandsEnabled === "boolean" && autoExecuteToggle) {
        autoExecuteToggle.checked = message.autoExecuteCommandsEnabled;
      }
      if (typeof message.autoToolExecutionEnabled === "boolean" && autoToolToggle) {
        autoToolToggle.checked = message.autoToolExecutionEnabled;
      }
      if (typeof message.streamingEnabled === "boolean" && streamingToggle) {
        streamingToggle.checked = message.streamingEnabled;
      }
      if (typeof message.autoCorrectionEnabled === "boolean" && autoCorrectionToggle) {
        autoCorrectionToggle.checked = message.autoCorrectionEnabled;
      }
      if (typeof message.autoTestRetryEnabled === "boolean" && autoTestRetryToggle) {
        autoTestRetryToggle.checked = message.autoTestRetryEnabled;
      }
      if (typeof message.testRetryCount === "number" && testRetrySpinner) {
        testRetrySpinner.value = message.testRetryCount;
      }

      // ===== AI 모델 설정 적용 =====
      if (aiModelSelect && typeof message.aiModel === "string") {
        // 저장된 모델을 UI 표시용으로 변환
        let displayModel = message.aiModel;
        if (message.aiModel.startsWith("ollama")) {
          displayModel = "ollama";
        } else if (message.aiModel === "gemini") {
          displayModel = "gemini";
        }
        aiModelSelect.value = displayModel;

        // 모델에 따라 섹션 활성화/비활성화
        if (displayModel === "gemini") {
          geminiSettingsSection.classList.remove("disabled");
          localOllamaSettingsSection.classList.add("disabled");
          remoteOllamaSettingsSection.classList.add("disabled");
        } else if (displayModel === "ollama") {
          geminiSettingsSection.classList.add("disabled");
          // 서버 타입에 따라 활성 섹션 결정
          const serverType = message.ollamaServerType || "local";
          if (serverType === "remote") {
            if (localOllamaSettingsSection) {
              localOllamaSettingsSection.style.display = "none";
              localOllamaSettingsSection.classList.add("disabled");
            }
            if (remoteOllamaSettingsSection) {
              remoteOllamaSettingsSection.style.display = "block";
              remoteOllamaSettingsSection.classList.remove("disabled");
            }
          } else {
            if (localOllamaSettingsSection) {
              localOllamaSettingsSection.style.display = "block";
              localOllamaSettingsSection.classList.remove("disabled");
            }
            if (remoteOllamaSettingsSection) {
              remoteOllamaSettingsSection.style.display = "none";
              remoteOllamaSettingsSection.classList.add("disabled");
            }
          }
        }
      }

      // ===== Ollama 서버 타입 및 저장된 설정 적용 =====
      if (ollamaServerTypeSelect && typeof message.ollamaServerType === "string") {
        ollamaServerTypeSelect.value = message.ollamaServerType || "local";
        const setText = message.ollamaServerType === "remote" ? languageData["ollamaServerTypeRemoteSet"] || "Ollama 서버 타입: 원격 서버" : languageData["ollamaServerTypeLocalSet"] || "Ollama 서버 타입: 로컬 머신";
        (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(ollamaServerTypeStatus, setText, "success");

        // AI 모델이 'ollama'인 경우에만 섹션 활성화/비활성화
        const currentAiModel = aiModelSelect ? aiModelSelect.value : "gemini";
        if (currentAiModel === "ollama") {
          // 섹션 가시성 + disabled 클래스 동기화
          if (message.ollamaServerType === "remote") {
            if (localOllamaSettingsSection) {
              localOllamaSettingsSection.style.display = "none";
              localOllamaSettingsSection.classList.add("disabled");
            }
            if (remoteOllamaSettingsSection) {
              remoteOllamaSettingsSection.style.display = "block";
              remoteOllamaSettingsSection.classList.remove("disabled");
            }
          } else {
            if (localOllamaSettingsSection) {
              localOllamaSettingsSection.style.display = "block";
              localOllamaSettingsSection.classList.remove("disabled");
            }
            if (remoteOllamaSettingsSection) {
              remoteOllamaSettingsSection.style.display = "none";
              remoteOllamaSettingsSection.classList.add("disabled");
            }
          }
        }
      }

      // 로컬 Ollama 저장값 적용
      if (localOllamaApiUrlInput && typeof message.localOllamaApiUrl === "string") {
        localOllamaApiUrlInput.value = message.localOllamaApiUrl || "";
        const txt = message.localOllamaApiUrl ? languageData["ollamaApiUrlSet"] || "Ollama API URL이 설정되어 있습니다." : languageData["ollamaApiUrlNotSet"] || "Ollama API URL이 설정되지 않았습니다.";
        if (localOllamaApiUrlStatus) {
          (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(localOllamaApiUrlStatus, txt, message.localOllamaApiUrl ? "success" : "info");
        }
      }
      if (localOllamaEndpointSelect && typeof message.localOllamaEndpoint === "string") {
        localOllamaEndpointSelect.value = message.localOllamaEndpoint || "/api/generate";
        const txt = message.localOllamaEndpoint ? languageData["ollamaEndpointSet"] || `로컬 엔드포인트가 설정되어 있습니다: ${message.localOllamaEndpoint}` : languageData["ollamaEndpointNotSet"] || "로컬 엔드포인트가 설정되지 않았습니다.";
        if (localOllamaEndpointStatus) {
          (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(localOllamaEndpointStatus, txt, message.localOllamaEndpoint ? "success" : "info");
        }
      }

      // 원격 Ollama 저장값 적용
      if (remoteOllamaApiUrlInput && typeof message.remoteOllamaApiUrl === "string") {
        remoteOllamaApiUrlInput.value = message.remoteOllamaApiUrl || "";
        const txt = message.remoteOllamaApiUrl ? languageData["ollamaApiUrlSet"] || "Ollama API URL이 설정되어 있습니다." : languageData["ollamaApiUrlNotSet"] || "Ollama API URL이 설정되지 않았습니다.";
        if (remoteOllamaApiUrlStatus) {
          (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(remoteOllamaApiUrlStatus, txt, message.remoteOllamaApiUrl ? "success" : "info");
        }
      }
      if (remoteOllamaEndpointSelect && typeof message.remoteOllamaEndpoint === "string") {
        remoteOllamaEndpointSelect.value = message.remoteOllamaEndpoint || "/api/chat";
        const txt = message.remoteOllamaEndpoint ? languageData["ollamaEndpointSet"] || `원격 서버 엔드포인트가 설정되어 있습니다: ${message.remoteOllamaEndpoint}` : languageData["ollamaEndpointNotSet"] || "원격 서버 엔드포인트가 설정되지 않았습니다.";
        if (remoteOllamaEndpointStatus) {
          (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(remoteOllamaEndpointStatus, txt, message.remoteOllamaEndpoint ? "success" : "info");
        }
      }
      if (remoteOllamaModelInput && typeof message.remoteOllamaModel === "string") {
        remoteOllamaModelInput.value = message.remoteOllamaModel || "";
        const txt = message.remoteOllamaModel ? languageData["ollamaModelSet"] || `원격 서버 모델이 설정되어 있습니다: ${message.remoteOllamaModel}` : languageData["ollamaModelNotSet"] || "원격 서버 모델이 설정되지 않았습니다.";
        if (remoteOllamaModelStatus) {
          (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(remoteOllamaModelStatus, txt, message.remoteOllamaModel ? "success" : "info");
        }
      }

      // 모델 라우팅 설정 적용
      console.log("[Settings] Received routing model settings:", {
        compactorModelType: message.compactorModelType,
        compactorModelName: message.compactorModelName,
        commandModelType: message.commandModelType,
        commandModelName: message.commandModelName,
        intentModelType: message.intentModelType,
        intentModelName: message.intentModelName
      });
      {
        const compactorTypeSelect = document.getElementById("compactor-model-type-select");
        const compactorSubmodelContainer = document.getElementById("compactor-submodel-container");
        const compactorApikeyContainer = document.getElementById("compactor-apikey-container");
        const compactorSubmodelSelect = document.getElementById("compactor-submodel-select");
        const compactorModelStatus = document.getElementById("compactor-model-status");
        console.log("[Settings] compactorTypeSelect element:", compactorTypeSelect);
        console.log("[Settings] compactorTypeSelect options:", compactorTypeSelect ? Array.from(compactorTypeSelect.options).map(o => o.value) : "N/A");
        if (compactorTypeSelect) {
          compactorTypeSelect.value = message.compactorModelType || "";
          console.log("[Settings] compactorTypeSelect.value after set:", compactorTypeSelect.value);
        }

        // 하위 UI 표시 및 값 설정
        if (message.compactorModelType) {
          // 타입 선택 시 하위 모델 표시
          if (compactorSubmodelContainer) {
            compactorSubmodelContainer.style.display = "block";
          }
          if (compactorApikeyContainer) {
            compactorApikeyContainer.style.display = message.compactorModelType === "gemini" || message.compactorModelType === "banya" ? "block" : "none";
          }
          // 하위 모델 셀렉트 채우기 (ollama는 동적으로 가져옴)
          if (compactorSubmodelSelect && message.compactorModelType) {
            const submodelOptionsForLoad = {
              gemini: [{
                value: "gemini-3-flash-preview",
                label: "Gemini 3 Flash Preview (권장)"
              }, {
                value: "gemini-3-pro-preview",
                label: "Gemini 3 Pro Preview"
              }],
              banya: [{
                value: "Banya Solar:100b",
                label: "Banya Solar:100b"
              }, {
                value: "Banya Qwen-Coder:32b",
                label: "Banya Qwen-Coder:32b"
              }],
              ollama: (window.routingOllamaModelsCache || []).map(name => ({
                value: name,
                label: name
              }))
            };
            compactorSubmodelSelect.innerHTML = "";
            let options = submodelOptionsForLoad[message.compactorModelType] || [];

            // ollama인데 캐시가 비어있으면 모델 리스트 요청
            if (message.compactorModelType === "ollama" && options.length === 0) {
              vscode.postMessage({
                command: "getRoutingOllamaModels"
              });
              // 저장된 모델명이 있으면 일단 추가
              if (message.compactorModelName) {
                const customOption = document.createElement("option");
                customOption.value = message.compactorModelName;
                customOption.textContent = message.compactorModelName;
                compactorSubmodelSelect.appendChild(customOption);
                compactorSubmodelSelect.value = message.compactorModelName;
              } else {
                const loadingOption = document.createElement("option");
                loadingOption.value = "";
                loadingOption.textContent = "모델 로딩 중...";
                compactorSubmodelSelect.appendChild(loadingOption);
              }
            } else {
              options.forEach(opt => {
                const option = document.createElement("option");
                option.value = opt.value;
                option.textContent = opt.label;
                compactorSubmodelSelect.appendChild(option);
              });
              // 저장된 모델명 선택 (목록에 없으면 추가)
              if (message.compactorModelName) {
                const exists = options.some(opt => opt.value === message.compactorModelName);
                if (!exists) {
                  const customOption = document.createElement("option");
                  customOption.value = message.compactorModelName;
                  customOption.textContent = message.compactorModelName + " (저장됨)";
                  compactorSubmodelSelect.appendChild(customOption);
                }
                compactorSubmodelSelect.value = message.compactorModelName;
              }
            }
          }
        } else {
          if (compactorSubmodelContainer) {
            compactorSubmodelContainer.style.display = "none";
          }
          if (compactorApikeyContainer) {
            compactorApikeyContainer.style.display = "none";
          }
        }
        if (compactorModelStatus) {
          if (message.compactorModelType) {
            const typeLabel = {
              ollama: "Ollama",
              gemini: "Google Gemini",
              banya: "Banya"
            }[message.compactorModelType] || message.compactorModelType;
            const modelInfo = message.compactorModelName ? ` (${message.compactorModelName})` : "";
            const apiKeyInfo = message.compactorApiKeySet ? " | API 키 설정됨" : "";
            compactorModelStatus.textContent = `현재: ${typeLabel}${modelInfo}${apiKeyInfo}`;
            compactorModelStatus.className = "info-message success-message";
          } else {
            compactorModelStatus.textContent = "현재: 메인 모델 사용";
            compactorModelStatus.className = "info-message";
          }
        }
      }
      {
        const commandTypeSelect = document.getElementById("command-model-type-select");
        const commandSubmodelContainer = document.getElementById("command-submodel-container");
        const commandApikeyContainer = document.getElementById("command-apikey-container");
        const commandSubmodelSelect = document.getElementById("command-submodel-select");
        const commandModelStatus = document.getElementById("command-model-status");
        if (commandTypeSelect) {
          commandTypeSelect.value = message.commandModelType || "";
        }

        // 하위 UI 표시 및 값 설정
        if (message.commandModelType) {
          if (commandSubmodelContainer) {
            commandSubmodelContainer.style.display = "block";
          }
          if (commandApikeyContainer) {
            commandApikeyContainer.style.display = message.commandModelType === "gemini" || message.commandModelType === "banya" ? "block" : "none";
          }
          // 하위 모델 셀렉트 채우기 (ollama는 동적으로 가져옴)
          if (commandSubmodelSelect && message.commandModelType) {
            const submodelOptionsForLoad = {
              gemini: [{
                value: "gemini-3-flash-preview",
                label: "Gemini 3 Flash Preview (권장)"
              }, {
                value: "gemini-3-pro-preview",
                label: "Gemini 3 Pro Preview"
              }],
              banya: [{
                value: "Banya Solar:100b",
                label: "Banya Solar:100b"
              }, {
                value: "Banya Qwen-Coder:32b",
                label: "Banya Qwen-Coder:32b"
              }],
              ollama: (window.routingOllamaModelsCache || []).map(name => ({
                value: name,
                label: name
              }))
            };
            commandSubmodelSelect.innerHTML = "";
            let options = submodelOptionsForLoad[message.commandModelType] || [];

            // ollama인데 캐시가 비어있으면 모델 리스트 요청
            if (message.commandModelType === "ollama" && options.length === 0) {
              vscode.postMessage({
                command: "getRoutingOllamaModels"
              });
              // 저장된 모델명이 있으면 일단 추가
              if (message.commandModelName) {
                const customOption = document.createElement("option");
                customOption.value = message.commandModelName;
                customOption.textContent = message.commandModelName;
                commandSubmodelSelect.appendChild(customOption);
                commandSubmodelSelect.value = message.commandModelName;
              } else {
                const loadingOption = document.createElement("option");
                loadingOption.value = "";
                loadingOption.textContent = "모델 로딩 중...";
                commandSubmodelSelect.appendChild(loadingOption);
              }
            } else {
              options.forEach(opt => {
                const option = document.createElement("option");
                option.value = opt.value;
                option.textContent = opt.label;
                commandSubmodelSelect.appendChild(option);
              });
              // 저장된 모델명 선택 (목록에 없으면 추가)
              if (message.commandModelName) {
                const exists = options.some(opt => opt.value === message.commandModelName);
                if (!exists) {
                  const customOption = document.createElement("option");
                  customOption.value = message.commandModelName;
                  customOption.textContent = message.commandModelName + " (저장됨)";
                  commandSubmodelSelect.appendChild(customOption);
                }
                commandSubmodelSelect.value = message.commandModelName;
              }
            }
          }
        } else {
          if (commandSubmodelContainer) {
            commandSubmodelContainer.style.display = "none";
          }
          if (commandApikeyContainer) {
            commandApikeyContainer.style.display = "none";
          }
        }
        if (commandModelStatus) {
          if (message.commandModelType) {
            const typeLabel = {
              ollama: "Ollama",
              gemini: "Google Gemini",
              banya: "Banya"
            }[message.commandModelType] || message.commandModelType;
            const modelInfo = message.commandModelName ? ` (${message.commandModelName})` : "";
            const apiKeyInfo = message.commandApiKeySet ? " | API 키 설정됨" : "";
            commandModelStatus.textContent = `현재: ${typeLabel}${modelInfo}${apiKeyInfo}`;
            commandModelStatus.className = "info-message success-message";
          } else {
            commandModelStatus.textContent = "현재: 메인 모델 사용";
            commandModelStatus.className = "info-message";
          }
        }
      }
      // Intent 모델 설정 적용
      {
        const intentTypeSelect = document.getElementById("intent-model-type-select");
        const intentSubmodelContainer = document.getElementById("intent-submodel-container");
        const intentApikeyContainer = document.getElementById("intent-apikey-container");
        const intentSubmodelSelect = document.getElementById("intent-submodel-select");
        const intentModelStatus = document.getElementById("intent-model-status");
        if (intentTypeSelect) {
          intentTypeSelect.value = message.intentModelType || "";
        }

        // 하위 UI 표시 및 값 설정
        if (message.intentModelType) {
          if (intentSubmodelContainer) {
            intentSubmodelContainer.style.display = "block";
          }
          if (intentApikeyContainer) {
            intentApikeyContainer.style.display = message.intentModelType === "gemini" || message.intentModelType === "banya" ? "block" : "none";
          }
          // 하위 모델 셀렉트 채우기 (ollama는 동적으로 가져옴)
          if (intentSubmodelSelect && message.intentModelType) {
            const submodelOptionsForLoad = {
              gemini: [{
                value: "gemini-3-flash-preview",
                label: "Gemini 3 Flash Preview"
              }, {
                value: "gemini-3-pro-preview",
                label: "Gemini 3 Pro Preview"
              }],
              banya: [{
                value: "Banya Solar:100b",
                label: "Banya Solar:100b"
              }, {
                value: "Banya Qwen-Coder:32b",
                label: "Banya Qwen-Coder:32b"
              }],
              ollama: (window.routingOllamaModelsCache || []).map(name => ({
                value: name,
                label: name
              }))
            };
            intentSubmodelSelect.innerHTML = "";
            let options = submodelOptionsForLoad[message.intentModelType] || [];

            // ollama인데 캐시가 비어있으면 모델 리스트 요청
            if (message.intentModelType === "ollama" && options.length === 0) {
              vscode.postMessage({
                command: "getRoutingOllamaModels"
              });
              // 저장된 모델명이 있으면 일단 추가
              if (message.intentModelName) {
                const customOption = document.createElement("option");
                customOption.value = message.intentModelName;
                customOption.textContent = message.intentModelName;
                intentSubmodelSelect.appendChild(customOption);
                intentSubmodelSelect.value = message.intentModelName;
              } else {
                const loadingOption = document.createElement("option");
                loadingOption.value = "";
                loadingOption.textContent = "모델 로딩 중...";
                intentSubmodelSelect.appendChild(loadingOption);
              }
            } else {
              options.forEach(opt => {
                const option = document.createElement("option");
                option.value = opt.value;
                option.textContent = opt.label;
                intentSubmodelSelect.appendChild(option);
              });
              // 저장된 모델명 선택 (목록에 없으면 추가)
              if (message.intentModelName) {
                const exists = options.some(opt => opt.value === message.intentModelName);
                if (!exists) {
                  const customOption = document.createElement("option");
                  customOption.value = message.intentModelName;
                  customOption.textContent = message.intentModelName + " (저장됨)";
                  intentSubmodelSelect.appendChild(customOption);
                }
                intentSubmodelSelect.value = message.intentModelName;
              }
            }
          }
        } else {
          if (intentSubmodelContainer) {
            intentSubmodelContainer.style.display = "none";
          }
          if (intentApikeyContainer) {
            intentApikeyContainer.style.display = "none";
          }
        }
        if (intentModelStatus) {
          if (message.intentModelType) {
            const typeLabel = {
              ollama: "Ollama",
              gemini: "Google Gemini",
              banya: "Banya"
            }[message.intentModelType] || message.intentModelType;
            const modelInfo = message.intentModelName ? ` (${message.intentModelName})` : "";
            const apiKeyInfo = message.intentApiKeySet ? " | API 키 설정됨" : "";
            intentModelStatus.textContent = `현재: ${typeLabel}${modelInfo}${apiKeyInfo}`;
            intentModelStatus.className = "info-message success-message";
          } else {
            intentModelStatus.textContent = "현재: 메인 모델 사용";
            intentModelStatus.className = "info-message";
          }
        }
      }

      // 설정 로드 완료 - 자동 저장 다시 활성화
      isLoadingSettings = false;
      break;
    case "compactorModelSaved":
      {
        const compactorModelStatus = document.getElementById("compactor-model-status");
        if (compactorModelStatus) {
          compactorModelStatus.textContent = "Compactor 모델이 저장되었습니다.";
          compactorModelStatus.className = "info-message success-message";
        }
      }
      break;
    case "compactorModelSaveError":
      {
        const compactorModelStatus = document.getElementById("compactor-model-status");
        if (compactorModelStatus) {
          compactorModelStatus.textContent = `Compactor 모델 저장 오류: ${message.error}`;
          compactorModelStatus.className = "info-message error-message";
        }
      }
      break;
    case "compactorModelCleared":
      {
        const compactorModelStatus = document.getElementById("compactor-model-status");
        const compactorTypeSelect = document.getElementById("compactor-model-type-select");
        if (compactorTypeSelect) {
          compactorTypeSelect.value = "";
        }
        if (compactorModelStatus) {
          compactorModelStatus.textContent = "Compactor 모델이 초기화되었습니다. 메인 모델이 사용됩니다.";
          compactorModelStatus.className = "info-message";
        }
      }
      break;
    case "commandModelSaved":
      {
        const commandModelStatus = document.getElementById("command-model-status");
        if (commandModelStatus) {
          commandModelStatus.textContent = "Command 모델이 저장되었습니다.";
          commandModelStatus.className = "info-message success-message";
        }
      }
      break;
    case "commandModelSaveError":
      {
        const commandModelStatus = document.getElementById("command-model-status");
        if (commandModelStatus) {
          commandModelStatus.textContent = `Command 모델 저장 오류: ${message.error}`;
          commandModelStatus.className = "info-message error-message";
        }
      }
      break;
    case "commandModelCleared":
      {
        const commandModelStatus = document.getElementById("command-model-status");
        const commandTypeSelect = document.getElementById("command-model-type-select");
        if (commandTypeSelect) {
          commandTypeSelect.value = "";
        }
        if (commandModelStatus) {
          commandModelStatus.textContent = "Command 모델이 초기화되었습니다. 메인 모델이 사용됩니다.";
          commandModelStatus.className = "info-message";
        }
      }
      break;
    case "compactorApiKeySaved":
      {
        const compactorModelStatus = document.getElementById("compactor-model-status");
        if (compactorModelStatus) {
          compactorModelStatus.textContent = "Compactor API 키가 저장되었습니다.";
          compactorModelStatus.className = "info-message success-message";
        }
      }
      break;
    case "compactorApiKeySaveError":
      {
        const compactorModelStatus = document.getElementById("compactor-model-status");
        if (compactorModelStatus) {
          compactorModelStatus.textContent = `Compactor API 키 저장 오류: ${message.error}`;
          compactorModelStatus.className = "info-message error-message";
        }
      }
      break;
    case "commandApiKeySaved":
      {
        const commandModelStatus = document.getElementById("command-model-status");
        if (commandModelStatus) {
          commandModelStatus.textContent = "Command API 키가 저장되었습니다.";
          commandModelStatus.className = "info-message success-message";
        }
      }
      break;
    case "commandApiKeySaveError":
      {
        const commandModelStatus = document.getElementById("command-model-status");
        if (commandModelStatus) {
          commandModelStatus.textContent = `Command API 키 저장 오류: ${message.error}`;
          commandModelStatus.className = "info-message error-message";
        }
      }
      break;
    case "aiModelSaved":
      if (aiModelStatus) {
        aiModelStatus.textContent = "AI 모델이 성공적으로 저장되었습니다.";
        aiModelStatus.className = "info-message success-message";
      }
      break;
    case "aiModelSaveError":
      if (aiModelStatus) {
        aiModelStatus.textContent = `AI 모델 저장 실패: ${message.error}`;
        aiModelStatus.className = "info-message error-message";
      }
      break;
    case "currentAiModel":
      if (aiModelSelect && message.model) {
        // 저장된 모델을 UI 표시용으로 변환
        let displayModel = message.model;
        if (message.model.startsWith("ollama")) {
          displayModel = "ollama";
        } else if (message.model === "gemini") {
          displayModel = "gemini";
        }
        aiModelSelect.value = displayModel;

        // 모델에 따라 섹션 활성화/비활성화
        if (displayModel === "gemini") {
          geminiSettingsSection.classList.remove("disabled");
          localOllamaSettingsSection.classList.add("disabled");
          remoteOllamaSettingsSection.classList.add("disabled");
        } else if (displayModel === "ollama") {
          geminiSettingsSection.classList.add("disabled");
          // 서버 타입에 따라 활성 섹션 결정
          const serverType = ollamaServerTypeSelect ? ollamaServerTypeSelect.value : "local";
          if (serverType === "remote") {
            localOllamaSettingsSection.classList.add("disabled");
            remoteOllamaSettingsSection.classList.remove("disabled");
          } else {
            localOllamaSettingsSection.classList.remove("disabled");
            remoteOllamaSettingsSection.classList.add("disabled");
          }
          // Ollama 모델 목록 로드
          try {
            loadOllamaModels();
          } catch (e) {
            console.warn("loadOllamaModels failed:", e);
          }
        }
      }
      break;
    case "autoUpdateStatusChanged":
      if (typeof message.enabled === "boolean" && autoUpdateToggle) {
        autoUpdateToggle.checked = message.enabled;
      }
      break;
    case "errorRetryCountChanged":
      if (typeof message.count === "number" && errorRetrySpinner) {
        errorRetrySpinner.value = message.count;
      }
      break;
    case "autoTestRetryEnabledSet":
      if (typeof message.enabled === "boolean" && autoTestRetryToggle) {}
      break;
    case "testRetryCountSet":
      if (typeof message.count === "number" && testRetrySpinner) {}
      break;
    case "autoCorrectionStatusChanged":
      if (typeof message.enabled === "boolean" && autoCorrectionToggle) {
        autoCorrectionToggle.checked = message.enabled;
      }
      break;
    case "currentApiKeys":
      // API 키 상태 로드
      // Gemini API 키 상태 로드
      if (geminiApiKeyInput && typeof message.geminiApiKey === "string") {
        geminiApiKeyInput.value = message.geminiApiKey;
        const geminiApiKeySetText = message.geminiApiKey ? languageData["geminiApiKeySet"] || "Gemini API 키가 설정되어 있습니다." : languageData["geminiApiKeyNotSet"] || "Gemini API 키가 설정되지 않았습니다.";
        (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(geminiApiKeyStatus, geminiApiKeySetText, message.geminiApiKey ? "success" : "info");
      }

      // Banya API 키 로드
      if (banyaApiKeyInput && typeof message.banyaApiKey === "string") {
        banyaApiKeyInput.value = message.banyaApiKey;
        const banyaApiKeySetText = message.banyaApiKey ? "Banya API 키가 설정되어 있습니다." : "Banya API 키가 설정되지 않았습니다.";
        (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(banyaApiKeyStatus, banyaApiKeySetText, message.banyaApiKey ? "success" : "info");
      }
      // 로컬 Ollama API URL 상태 로드 (기본값 폴백)
      if (localOllamaApiUrlInput && typeof message.localOllamaApiUrl === "string") {
        localOllamaApiUrlInput.value = message.localOllamaApiUrl || "http://localhost:11434";
        const localOllamaApiUrlSetText = message.localOllamaApiUrl ? languageData["ollamaApiUrlSet"] || "로컬 Ollama API URL이 설정되어 있습니다." : languageData["ollamaApiUrlNotSet"] || "로컬 Ollama API URL이 설정되지 않았습니다.";
        (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(localOllamaApiUrlStatus, localOllamaApiUrlSetText, message.localOllamaApiUrl ? "success" : "info");
      }
      // 로컬 Ollama 엔드포인트 상태 로드 (기본값 폴백)
      if (localOllamaEndpointSelect && typeof message.localOllamaEndpoint === "string") {
        localOllamaEndpointSelect.value = message.localOllamaEndpoint || "/api/generate";
        const localOllamaEndpointSetText = message.localOllamaEndpoint ? `로컬 Ollama 엔드포인트가 설정되어 있습니다: ${message.localOllamaEndpoint}` : "로컬 Ollama 엔드포인트가 설정되지 않았습니다.";
        (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(localOllamaEndpointStatus, localOllamaEndpointSetText, message.localOllamaEndpoint ? "success" : "info");
      }
      // 원격 서버 API URL 상태 로드
      if (remoteOllamaApiUrlInput && typeof message.remoteOllamaApiUrl === "string") {
        remoteOllamaApiUrlInput.value = message.remoteOllamaApiUrl || "";
        const remoteOllamaApiUrlSetText = message.remoteOllamaApiUrl ? "원격 서버 API URL이 설정되어 있습니다." : "원격 서버 API URL이 설정되지 않았습니다.";
        (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(remoteOllamaApiUrlStatus, remoteOllamaApiUrlSetText, message.remoteOllamaApiUrl ? "success" : "info");
      }
      // 원격 서버 엔드포인트 상태 로드
      if (remoteOllamaEndpointSelect && typeof message.remoteOllamaEndpoint === "string") {
        remoteOllamaEndpointSelect.value = message.remoteOllamaEndpoint || "/api/generate";
        const remoteOllamaEndpointSetText = message.remoteOllamaEndpoint ? `원격 서버 엔드포인트가 설정되어 있습니다: ${message.remoteOllamaEndpoint}` : "원격 서버 엔드포인트가 설정되지 않았습니다.";
        (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(remoteOllamaEndpointStatus, remoteOllamaEndpointSetText, message.remoteOllamaEndpoint ? "success" : "info");
      }
      // 원격 서버 모델명 상태 로드
      if (remoteOllamaModelInput && typeof message.remoteOllamaModel === "string") {
        remoteOllamaModelInput.value = message.remoteOllamaModel || "";
        const remoteOllamaModelSetText = message.remoteOllamaModel ? `원격 서버 모델이 설정되어 있습니다: ${message.remoteOllamaModel}` : "원격 서버 모델이 설정되지 않았습니다.";
        (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(remoteOllamaModelStatus, remoteOllamaModelSetText, message.remoteOllamaModel ? "success" : "info");
      }
      // Ollama 서버 타입 상태 로드
      if (ollamaServerTypeSelect && typeof message.ollamaServerType === "string") {
        ollamaServerTypeSelect.value = message.ollamaServerType || "local";
        const ollamaServerTypeSetText = message.ollamaServerType ? `Ollama 서버 타입이 설정되어 있습니다: ${message.ollamaServerType === "local" ? "로컬 머신" : "원격 서버"}` : "Ollama 서버 타입이 설정되지 않았습니다.";
        (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(ollamaServerTypeStatus, ollamaServerTypeSetText, message.ollamaServerType ? "success" : "info");

        // 서버 타입에 따라 섹션 표시/숨김
        if (message.ollamaServerType === "local") {
          localOllamaSettingsSection.style.display = "block";
          remoteOllamaSettingsSection.style.display = "none";
          if (localOllamaSettingsSection) {
            localOllamaSettingsSection.classList.remove("disabled");
          }
          if (remoteOllamaSettingsSection) {
            remoteOllamaSettingsSection.classList.add("disabled");
          }
        } else if (message.ollamaServerType === "remote") {
          localOllamaSettingsSection.style.display = "none";
          remoteOllamaSettingsSection.style.display = "block";
          if (localOllamaSettingsSection) {
            localOllamaSettingsSection.classList.add("disabled");
          }
          if (remoteOllamaSettingsSection) {
            remoteOllamaSettingsSection.classList.remove("disabled");
          }
        }
      }
      // Ollama 모델 상태 로드 - 저장된 모델 값을 전역 변수에 저장하고 드롭다운에 적용
      if (typeof message.ollamaModel === "string" && message.ollamaModel !== "") {
        storedOllamaModel = message.ollamaModel;
        console.log("[Settings] Stored Ollama model:", storedOllamaModel);

        // 드롭다운에 직접 적용
        if (ollamaModelSelect && message.ollamaModel) {
          // 모델이 목록에 있는지 확인
          const existingOption = Array.from(ollamaModelSelect.options).find(option => option.value === message.ollamaModel);
          if (existingOption) {
            ollamaModelSelect.value = message.ollamaModel;
            console.log("[Settings] Applied Ollama model to dropdown:", message.ollamaModel);
          } else {
            // 목록에 없다면 추가
            const newOption = document.createElement("option");
            newOption.value = message.ollamaModel;
            newOption.textContent = message.ollamaModel;
            ollamaModelSelect.appendChild(newOption);
            ollamaModelSelect.value = message.ollamaModel;
            console.log("[Settings] Added and applied Ollama model to dropdown:", message.ollamaModel);
          }
        }
        const ollamaModelSetText = message.ollamaModel ? `Ollama 모델이 설정되어 있습니다: ${message.ollamaModel}` : "Ollama 모델이 설정되지 않았습니다.";
        (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(ollamaModelStatus, ollamaModelSetText, message.ollamaModel ? "success" : "info");
      } else {
        console.log("[Settings] No valid ollamaModel in currentSettings message");
      }
      // Banya 라이센스 상태 로드
      if (banyaLicenseSerialInput && typeof message.banyaLicenseSerial === "string") {
        // 추가 검증 - 잘못된 데이터 필터링
        const isValidLicense = message.banyaLicenseSerial && message.banyaLicenseSerial.trim() !== "" && !message.banyaLicenseSerial.includes("/") && !message.banyaLicenseSerial.includes("\\") && !message.banyaLicenseSerial.includes("프로젝트") && !message.banyaLicenseSerial.includes("Project") && !message.banyaLicenseSerial.includes("설정") && !message.banyaLicenseSerial.includes("Setting") && message.banyaLicenseSerial.length > 5;
        if (isValidLicense) {
          banyaLicenseSerialInput.value = message.banyaLicenseSerial.trim();
          banyaLicenseSerialInput.readOnly = true; // 저장된 라이센스는 읽기 전용으로 설정
          const banyaLicenseSetText = languageData["banyaLicenseSet"] || "Banya 라이센스가 설정되어 있습니다.";
          (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(banyaLicenseStatus, banyaLicenseSetText, "success");
        } else {
          banyaLicenseSerialInput.value = "";
          banyaLicenseSerialInput.readOnly = false; // 라이센스가 없으면 편집 가능
          const banyaLicenseNotSetText = languageData["banyaLicenseNotSet"] || "Banya 라이센스가 설정되지 않았습니다.";
          (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(banyaLicenseStatus, banyaLicenseNotSetText, "info");
        }
      }

      // 라이선스 검증 상태 처리
      if (typeof message.isLicenseVerified === "boolean") {
        isLicenseVerified = message.isLicenseVerified;
        // console.log('License verification status received:', isLicenseVerified);
      } else {
        console.log("No license verification status received, message:", message);
      }

      // API 키 로드 완료 후 저장 버튼 상태 재확인
      setTimeout(() => {
        // console.log('Final button state update after API keys load, isLicenseVerified:', isLicenseVerified);
        updateSaveButtonsState();
        updateLicenseButtonsState();
      }, 100);
      break;
    case "apiKeySaved":
      const geminiApiKeySavedText = languageData["geminiApiKeySaved"] || "Gemini API 키가 저장되었습니다.";
      (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(geminiApiKeyStatus, geminiApiKeySavedText, "success");
      geminiApiKeyInput.value = "";
      break;
    case "apiKeySaveError":
      const geminiApiKeyErrorText = languageData["geminiApiKeyError"] || "Gemini API 키 저장 실패:";
      (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(geminiApiKeyStatus, `${geminiApiKeyErrorText} ${message.error}`, "error");
      break;
    case "localOllamaApiUrlSaved":
      const localOllamaApiUrlSavedText = languageData["ollamaApiUrlSaved"] || "로컬 Ollama API URL이 저장되었습니다.";
      (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(localOllamaApiUrlStatus, localOllamaApiUrlSavedText, "success");
      localOllamaApiUrlInput.value = "";
      break;
    case "localOllamaApiUrlError":
      const localOllamaApiUrlErrorText = languageData["ollamaApiUrlError"] || "로컬 Ollama API URL 저장 실패:";
      (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(localOllamaApiUrlStatus, `${localOllamaApiUrlErrorText} ${message.error}`, "error");
      break;
    case "localOllamaEndpointSaved":
      (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(localOllamaEndpointStatus, "로컬 Ollama 엔드포인트가 저장되었습니다.", "success");
      break;
    case "localOllamaEndpointError":
      (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(localOllamaEndpointStatus, `로컬 Ollama 엔드포인트 저장 실패: ${message.error}`, "error");
      break;
    case "remoteOllamaApiUrlSaved":
      (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(remoteOllamaApiUrlStatus, "원격 서버 API URL이 저장되었습니다.", "success");
      remoteOllamaApiUrlInput.value = "";
      break;
    case "remoteOllamaApiUrlError":
      (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(remoteOllamaApiUrlStatus, `원격 서버 API URL 저장 실패: ${message.error}`, "error");
      break;
    case "remoteOllamaEndpointSaved":
      (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(remoteOllamaEndpointStatus, "원격 서버 엔드포인트가 저장되었습니다.", "success");
      break;
    case "remoteOllamaEndpointError":
      (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(remoteOllamaEndpointStatus, `원격 서버 엔드포인트 저장 실패: ${message.error}`, "error");
      break;
    case "remoteOllamaModelSaved":
      (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(remoteOllamaModelStatus, "원격 서버 모델명이 저장되었습니다.", "success");
      remoteOllamaModelInput.value = "";
      break;
    case "remoteOllamaModelError":
      (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(remoteOllamaModelStatus, `원격 서버 모델명 저장 실패: ${message.error}`, "error");
      break;
    case "ollamaServerTypeSaved":
      (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(ollamaServerTypeStatus, "Ollama 서버 타입이 저장되었습니다.", "success");
      break;
    case "ollamaServerTypeSaveError":
      (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(ollamaServerTypeStatus, `Ollama 서버 타입 저장 실패: ${message.error}`, "error");
      break;
    case "banyaLicenseSaved":
      const banyaLicenseSavedText = languageData["banyaLicenseSaved"] || "Banya 라이센스가 저장되었습니다.";
      (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(banyaLicenseStatus, banyaLicenseSavedText, "success");
      banyaLicenseSerialInput.value = "";
      break;
    case "banyaLicenseError":
      const banyaLicenseErrorText = languageData["banyaLicenseError"] || "Banya 라이센스 저장 실패:";
      (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(banyaLicenseStatus, `${banyaLicenseErrorText} ${message.error}`, "error");
      break;
    case "errorRetryCountSaved":
      const errorRetryCountSavedText = languageData["errorRetryCountSaved"] || "오류 수정 횟수가 저장되었습니다.";
      (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(errorRetryStatus, errorRetryCountSavedText, "success");
      break;
    case "errorRetryCountSaveError":
      const errorRetryCountSaveErrorText = languageData["errorRetryCountSaveError"] || "오류 수정 횟수 저장 실패:";
      (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(errorRetryStatus, `${errorRetryCountSaveErrorText} ${message.error}`, "error");
      break;
    case "banyaLicenseVerified":
      const banyaLicenseVerifiedText = languageData["banyaLicenseVerified"] || "Banya 라이센스가 유효합니다.";
      (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(banyaLicenseStatus, banyaLicenseVerifiedText, "success");
      isLicenseVerified = true;
      console.log("License verification successful, enabling save buttons");
      updateSaveButtonsState();
      updateLicenseButtonsState();
      break;
    case "banyaLicenseVerificationFailed":
      const banyaLicenseVerificationFailedText = languageData["banyaLicenseVerificationFailed"] || "Banya 라이센스 검증 실패:";
      (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(banyaLicenseStatus, `${banyaLicenseVerificationFailedText} ${message.error}`, "error");
      isLicenseVerified = false;
      console.log("License verification failed, disabling save buttons");
      updateSaveButtonsState();
      updateLicenseButtonsState();
      break;
    case "banyaLicenseDeleted":
      const banyaLicenseDeletedText = languageData["banyaLicenseDeleted"] || "Banya 라이센스가 삭제되었습니다.";
      (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(banyaLicenseStatus, banyaLicenseDeletedText, "success");
      if (banyaLicenseSerialInput) {
        banyaLicenseSerialInput.value = "";
        banyaLicenseSerialInput.readOnly = false; // 라이센스 삭제 시 편집 가능하게 설정
      }
      isLicenseVerified = false;
      updateSaveButtonsState();
      updateLicenseButtonsState();
      break;
    case "banyaLicenseDeleteError":
      const banyaLicenseDeleteErrorText = languageData["banyaLicenseDeleteError"] || "Banya 라이센스 삭제 실패:";
      (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(banyaLicenseStatus, `${banyaLicenseDeleteErrorText} ${message.error}`, "error");
      break;
    case "aiModelSaved":
      const aiModelSavedText = languageData["aiModelSaved"] || "AI 모델이 저장되었습니다.";
      (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(sourcePathStatus, aiModelSavedText, "success");
      break;
    case "aiModelSaveError":
      const aiModelSaveErrorText = languageData["aiModelSaveError"] || "AI 모델 저장 실패:";
      (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(sourcePathStatus, `${aiModelSaveErrorText} ${message.error}`, "error");
      break;
    case "currentOllamaModel":
      if (message.model && ollamaModelSelect) {
        // console.log('Received current Ollama model:', message.model);
        ollamaModelSelect.value = message.model;
        const ollamaModelSetText = message.model ? `Ollama 모델이 설정되어 있습니다: ${message.model}` : "Ollama 모델이 설정되지 않았습니다.";
        (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(ollamaModelStatus, ollamaModelSetText, message.model ? "success" : "info");

        // gpt-oss-120b:cloud 모델인 경우 인증 섹션 표시
        const authSection = document.getElementById("ollama-auth-section");
        const authStatus = document.getElementById("ollama-auth-status");
        if (message.model === "gpt-oss-120b:cloud") {
          if (authSection) {
            authSection.style.display = "flex";
          }
          if (authStatus) {
            authStatus.style.display = "block";
          }
        } else {
          if (authSection) {
            authSection.style.display = "none";
          }
          if (authStatus) {
            authStatus.style.display = "none";
          }
        }
      }
      break;
    case "ollamaModelSaved":
      (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(ollamaModelStatus, "Ollama 모델이 저장되었습니다.", "success");
      break;
    case "ollamaModelError":
      (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(ollamaModelStatus, `Ollama 모델 저장 실패: ${message.error}`, "error");
      break;
    case "ollamaAuthResult":
      if (message.success) {
        (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(ollamaAuthStatus, "Ollama 인증이 성공했습니다.", "success");
      } else {
        (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(ollamaAuthStatus, `Ollama 인증 실패: ${message.message}`, "error");
      }
      break;
    case "languageDataLoaded":
      if (message.languageData) {
        languageData = message.languageData;
        console.log("Language data loaded:", Object.keys(languageData).length, "keys");
        applyLanguage();
      }
      break;
    case "languageSaved":
      console.log("Language saved successfully:", message.language);
      currentLanguage = message.language;
      if (languageSelect) {
        languageSelect.value = currentLanguage;
      }
      const languageChangedText = languageData["languageChanged"] || "언어가";
      const languageChangedToText = languageData["languageChangedTo"] || "로 변경되었습니다.";
      (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(sourcePathStatus, `${languageChangedText} ${message.language} ${languageChangedToText}`, "success");
      break;
    case "chatThemeSaved":
      console.log("Chat theme saved successfully:", message.theme);
      const themeSelectEl = document.getElementById("theme-select");
      const themeStatusEl = document.getElementById("theme-status");
      if (themeSelectEl) {
        themeSelectEl.value = message.theme;
      }
      if (themeStatusEl) {
        const themeLabels = {
          dark: "다크",
          light: "라이트",
          auto: "자동"
        };
        themeStatusEl.textContent = `테마가 ${themeLabels[message.theme] || message.theme}(으)로 저장되었습니다.`;
        themeStatusEl.className = "info-message success-message";
      }
      // body에 테마 적용
      applyThemeToBody(message.theme);
      break;
    case "chatTheme":
      // 테마 변경 메시지 수신 시 body에 적용
      if (message.theme) {
        applyThemeToBody(message.theme);
        const themeSelectForUpdate = document.getElementById("theme-select");
        if (themeSelectForUpdate) {
          themeSelectForUpdate.value = message.theme;
        }
      }
      break;
    case "languageSaveError":
      const languageSaveErrorText = languageData["languageSaveError"] || "언어 저장 실패:";
      (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(sourcePathStatus, `${languageSaveErrorText} ${message.error}`, "error");
      break;
    case "currentLanguage":
      // console.log('[Settings] Received currentLanguage message:', message.language);
      if (message.language) {
        currentLanguage = message.language;
        if (languageSelect) {
          languageSelect.value = currentLanguage;
          console.log("[Settings] Set language select value to:", currentLanguage);
        }
        loadLanguage(currentLanguage);
      }
      break;
    case "languageSaveError":
      console.error("Language save error:", message.error);
      // 오류 발생 시 이전 언어로 되돌리기
      if (languageSelect) {
        languageSelect.value = currentLanguage;
      }
      break;
    case "languageDataReceived":
      if (message.language && message.data) {
        // console.log('Received language data for:', message.language);
        // console.log('Language data keys:', Object.keys(message.data));
        languageData = message.data;
        currentLanguage = message.language;
        sessionStorage.setItem("codepilotLang", message.language);

        // 언어 선택 드롭다운 값 업데이트
        if (languageSelect) {
          languageSelect.value = currentLanguage;
          // console.log('Updated language select value to:', currentLanguage);
        }

        // 즉시 언어 적용
        // console.log('Applying language immediately');
        applyLanguage();

        // 강제로 모든 UI 요소 업데이트 (여러 번 실행)
        setTimeout(() => {
          // console.log('Forcing UI refresh after language change (1st)');
          applyLanguage();
        }, 50);
        setTimeout(() => {
          // console.log('Forcing UI refresh after language change (2nd)');
          applyLanguage();
        }, 200);
        setTimeout(() => {
          // console.log('Forcing UI refresh after language change (3rd)');
          applyLanguage();
        }, 500);

        // 추가 강제 업데이트
        setTimeout(() => {
          // console.log('Final UI refresh after language change');
          applyLanguage();
        }, 1000);

        // 디버깅: 프로젝트 Root 표시 업데이트 확인 (현재 사용하지 않음)
        // if (projectRootPathDisplay) {
        //   console.log('Project root display current text:', projectRootPathDisplay.textContent);
        //   console.log('No project root set translation:', languageData['noProjectRootSet']);
        // }

        // 언어 변경 후 즉시 모든 상태 메시지 업데이트
        if (sourcePathStatus && sourcePathStatus.textContent) {
          const currentText = sourcePathStatus.textContent;
          if (currentText.includes("로드 완료") || currentText.includes("loaded successfully") || currentText.includes("cargado correctamente") || currentText.includes("chargé avec succès") || currentText.includes("加载完成") || currentText.includes("正常に読み込まれました")) {
            sourcePathStatus.textContent = languageData["sourcePathsLoaded"] || "소스 경로 로드 완료.";
          }
        }

        // projectRootStatus 요소가 HTML에 없으므로 제거됨 (v9.4.1)

        // autoUpdateStatus 텍스트 업데이트 제거 - 스위치 버튼으로 상태 표시
      }
      break;
  }

  // MCP 관련 메시지는 별도 모듈에서 처리
  if (message.command && message.command.startsWith("mcp")) {
    (0,_settings_mcp_settings_js__WEBPACK_IMPORTED_MODULE_2__.handleMcpMessage)(message);
  }
});

// Webview 로드 시 초기 설정값 요청 (제거 - 중복 방지)
vscode.postMessage({
  command: "loadApiKeys"
});
vscode.postMessage({
  command: "loadAiModel"
});
vscode.postMessage({
  command: "loadOllamaModel"
});
const apiKeysLoadingText = languageData["apiKeysLoading"] || "API 키 로드 중...";
(0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(geminiApiKeyStatus, apiKeysLoadingText, "info");
if (localOllamaApiUrlStatus) {
  (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(localOllamaApiUrlStatus, apiKeysLoadingText, "info");
}
if (remoteOllamaApiUrlStatus) {
  (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(remoteOllamaApiUrlStatus, apiKeysLoadingText, "info");
}
(0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(banyaLicenseStatus, apiKeysLoadingText, "info");

// API 키 로드 후 저장 버튼 상태 업데이트는 currentApiKeys 메시지를 받은 후에 수행됨
// 여기서는 초기화만 하고, 실제 업데이트는 서버 응답 후에 수행

// Ollama 모델 목록 불러오기
loadOllamaModels();

// 초기 상태: Gemini가 기본값이므로 Gemini 설정 섹션 활성화, Ollama 설정 섹션 비활성화
if (geminiSettingsSection) {
  geminiSettingsSection.classList.remove("disabled");
}
// 초기 활성화 상태는 AI 모델과 서버 타입에 따라 결정
if (aiModelSelect && aiModelSelect.value === "ollama") {
  const serverType = ollamaServerTypeSelect ? ollamaServerTypeSelect.value : "local";
  if (serverType === "remote") {
    if (localOllamaSettingsSection) {
      localOllamaSettingsSection.classList.add("disabled");
    }
    if (remoteOllamaSettingsSection) {
      remoteOllamaSettingsSection.classList.remove("disabled");
    }
  } else {
    if (localOllamaSettingsSection) {
      localOllamaSettingsSection.classList.remove("disabled");
    }
    if (remoteOllamaSettingsSection) {
      remoteOllamaSettingsSection.classList.add("disabled");
    }
  }
} else {
  if (localOllamaSettingsSection) {
    localOllamaSettingsSection.classList.add("disabled");
  }
  if (remoteOllamaSettingsSection) {
    remoteOllamaSettingsSection.classList.add("disabled");
  }
}

// 초기 상태: 라이선스 검증 상태는 서버에서 받아올 때까지 대기
// isLicenseVerified는 서버에서 전송된 값으로 설정됨

// Ollama 모델 목록을 확장 호스트에 요청하여 수신
async function loadOllamaModels() {
  // console.log('Ollama 모델 목록 요청 (호스트)');
  vscode.postMessage({
    command: "getOllamaModels"
  });
}

// 로컬 Ollama API URL 변경 시 모델 목록 다시 불러오기
if (localOllamaApiUrlInput) {
  localOllamaApiUrlInput.addEventListener("change", () => {
    // console.log('로컬 Ollama API URL 변경됨, 모델 목록 다시 불러오기');
    loadOllamaModels();
  });
  localOllamaApiUrlInput.addEventListener("blur", () => {
    // console.log('로컬 Ollama API URL 입력 완료, 모델 목록 다시 불러오기');
    loadOllamaModels();
  });
}

// 페이지 로드 시 초기 설정 로드
document.addEventListener("DOMContentLoaded", () => {
  console.log("[Settings] DOMContentLoaded - Starting initial load sequence");

  // 1. 언어 설정 로드
  vscode.postMessage({
    command: "getLanguage"
  });

  // 2. 기본 언어 데이터 로드 (한국어)
  loadLanguage("ko");

  // 3. 전체 설정 로드
  vscode.postMessage({
    command: "getCurrentSettings"
  });

  // 4. API 키 로드
  vscode.postMessage({
    command: "loadApiKeys"
  });

  // 5. AI 모델 로드
  vscode.postMessage({
    command: "loadAiModel"
  });

  // 6. Ollama 모델 로드
  vscode.postMessage({
    command: "loadOllamaModel"
  });

  // 7. 라이센스 입력 필드 초기 상태 설정
  if (banyaLicenseSerialInput) {
    banyaLicenseSerialInput.readOnly = false;
  }
  console.log("[Settings] DOMContentLoaded - Initial load sequence completed");

  // AgentPolicy XML 파일 로드
  loadAgentPolicyFiles();

  // MCP 설정 이벤트 바인딩
  (0,_settings_mcp_settings_js__WEBPACK_IMPORTED_MODULE_2__.bindMcpSettingsEvents)(vscode);

  // ===== 모델 라우팅 설정 버튼 이벤트 리스너 =====

  // 하위 모델 옵션 정의 (gemini, banya는 고정, ollama는 동적으로 가져옴)
  const submodelOptions = {
    gemini: [{
      value: "gemini-3-flash-preview",
      label: "Gemini 3 Flash Preview (권장)"
    }, {
      value: "gemini-3-pro-preview",
      label: "Gemini 3 Pro Preview"
    }],
    banya: [{
      value: "Banya Solar:100b",
      label: "Banya Solar:100b"
    }, {
      value: "Banya Qwen-Coder:32b",
      label: "Banya Qwen-Coder:32b"
    }],
    ollama: [] // 동적으로 채워짐
  };

  // 라우팅 모델용 Ollama 모델 리스트 캐시 (window scope 사용)
  window.routingOllamaModelsCache = window.routingOllamaModelsCache || [];

  // 라우팅 모델용 Ollama 모델 리스트 요청
  function loadRoutingOllamaModels() {
    console.log("[Settings] Requesting routing Ollama models");
    vscode.postMessage({
      command: "getRoutingOllamaModels"
    });
  }

  // 하위 모델 셀렉트 업데이트 함수
  function updateSubmodelSelect(submodelSelect, modelType) {
    submodelSelect.innerHTML = "";
    const options = submodelOptions[modelType] || [];
    if (modelType === "ollama" && options.length === 0) {
      // Ollama 모델 리스트가 비어있으면 로딩 표시
      const loadingOption = document.createElement("option");
      loadingOption.value = "";
      loadingOption.textContent = "모델 로딩 중...";
      submodelSelect.appendChild(loadingOption);
    } else {
      options.forEach(opt => {
        const option = document.createElement("option");
        option.value = opt.value;
        option.textContent = opt.label;
        submodelSelect.appendChild(option);
      });
    }
  }

  // 모델 타입 변경 시 하위 UI 표시/숨김 함수
  function handleModelTypeChange(prefix, modelType) {
    const submodelContainer = document.getElementById(`${prefix}-submodel-container`);
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
        intent: "clearIntentModel"
      };
      const deleteCommand = commandMap[prefix];
      if (deleteCommand) {
        console.log(`[Settings] Deleting ${prefix} model settings (switching to main model)`);
        vscode.postMessage({
          command: deleteCommand
        });
        if (modelStatus) {
          modelStatus.textContent = "메인 모델 사용으로 변경되었습니다.";
          modelStatus.className = "info-message success-message";
        }
      }
      return;
    }

    // ollama 선택 시 동적으로 모델 리스트 가져오기
    if (modelType === "ollama") {
      if (window.routingOllamaModelsCache && window.routingOllamaModelsCache.length > 0) {
        // 캐시된 리스트가 있으면 사용
        submodelOptions.ollama = window.routingOllamaModelsCache.map(name => ({
          value: name,
          label: name
        }));
      } else {
        // 캐시가 없으면 서버에서 가져오기
        loadRoutingOllamaModels();
      }
    }

    // 하위 모델 셀렉트 업데이트 및 표시
    if (submodelSelect) {
      updateSubmodelSelect(submodelSelect, modelType);
    }
    if (submodelContainer) {
      submodelContainer.style.display = "block";
    }

    // API 키 입력은 gemini, banya만 표시 (ollama는 로컬이므로 필요 없음)
    if (apikeyContainer) {
      apikeyContainer.style.display = modelType === "gemini" || modelType === "banya" ? "block" : "none";
    }
  }

  // Compactor 모델 타입 선택 변경 이벤트
  const compactorTypeSelect = document.getElementById("compactor-model-type-select");
  if (compactorTypeSelect) {
    compactorTypeSelect.addEventListener("change", e => {
      handleModelTypeChange("compactor", e.target.value);
    });
  }

  // Command 모델 타입 선택 변경 이벤트
  const commandTypeSelect = document.getElementById("command-model-type-select");
  if (commandTypeSelect) {
    commandTypeSelect.addEventListener("change", e => {
      handleModelTypeChange("command", e.target.value);
    });
  }

  // Compactor 모델 저장 버튼
  const saveCompactorModelButton = document.getElementById("save-compactor-model-button");
  if (saveCompactorModelButton) {
    saveCompactorModelButton.addEventListener("click", () => {
      const compactorTypeSelect = document.getElementById("compactor-model-type-select");
      const compactorSubmodelSelect = document.getElementById("compactor-submodel-select");
      const modelType = compactorTypeSelect ? compactorTypeSelect.value : "";
      const modelName = compactorSubmodelSelect ? compactorSubmodelSelect.value : "";
      if (!modelType) {
        const compactorModelStatus = document.getElementById("compactor-model-status");
        if (compactorModelStatus) {
          compactorModelStatus.textContent = "모델 타입을 선택해주세요.";
          compactorModelStatus.className = "info-message error-message";
        }
        return;
      }
      vscode.postMessage({
        command: "saveCompactorModel",
        modelType: modelType,
        modelName: modelName
      });
    });
  }

  // Compactor API 키 저장 버튼
  const saveCompactorApiKeyButton = document.getElementById("save-compactor-api-key-button");
  if (saveCompactorApiKeyButton) {
    saveCompactorApiKeyButton.addEventListener("click", () => {
      const compactorTypeSelect = document.getElementById("compactor-model-type-select");
      const compactorApiKeyInput = document.getElementById("compactor-api-key-input");
      const modelType = compactorTypeSelect ? compactorTypeSelect.value : "";
      const apiKey = compactorApiKeyInput ? compactorApiKeyInput.value : "";
      if (!apiKey) {
        const compactorModelStatus = document.getElementById("compactor-model-status");
        if (compactorModelStatus) {
          compactorModelStatus.textContent = "API 키를 입력해주세요.";
          compactorModelStatus.className = "info-message error-message";
        }
        return;
      }
      vscode.postMessage({
        command: "saveCompactorApiKey",
        modelType: modelType,
        apiKey: apiKey
      });

      // 입력 필드 초기화
      if (compactorApiKeyInput) {
        compactorApiKeyInput.value = "";
      }
    });
  }

  // Command 모델 저장 버튼
  const saveCommandModelButton = document.getElementById("save-command-model-button");
  if (saveCommandModelButton) {
    saveCommandModelButton.addEventListener("click", () => {
      const commandTypeSelect = document.getElementById("command-model-type-select");
      const commandSubmodelSelect = document.getElementById("command-submodel-select");
      const modelType = commandTypeSelect ? commandTypeSelect.value : "";
      const modelName = commandSubmodelSelect ? commandSubmodelSelect.value : "";
      if (!modelType) {
        const commandModelStatus = document.getElementById("command-model-status");
        if (commandModelStatus) {
          commandModelStatus.textContent = "모델 타입을 선택해주세요.";
          commandModelStatus.className = "info-message error-message";
        }
        return;
      }
      vscode.postMessage({
        command: "saveCommandModel",
        modelType: modelType,
        modelName: modelName
      });
    });
  }

  // Command API 키 저장 버튼
  const saveCommandApiKeyButton = document.getElementById("save-command-api-key-button");
  if (saveCommandApiKeyButton) {
    saveCommandApiKeyButton.addEventListener("click", () => {
      const commandTypeSelect = document.getElementById("command-model-type-select");
      const commandApiKeyInput = document.getElementById("command-api-key-input");
      const modelType = commandTypeSelect ? commandTypeSelect.value : "";
      const apiKey = commandApiKeyInput ? commandApiKeyInput.value : "";
      if (!apiKey) {
        const commandModelStatus = document.getElementById("command-model-status");
        if (commandModelStatus) {
          commandModelStatus.textContent = "API 키를 입력해주세요.";
          commandModelStatus.className = "info-message error-message";
        }
        return;
      }
      vscode.postMessage({
        command: "saveCommandApiKey",
        modelType: modelType,
        apiKey: apiKey
      });

      // 입력 필드 초기화
      if (commandApiKeyInput) {
        commandApiKeyInput.value = "";
      }
    });
  }

  // Intent 모델 타입 선택 변경 이벤트
  const intentTypeSelect = document.getElementById("intent-model-type-select");
  if (intentTypeSelect) {
    intentTypeSelect.addEventListener("change", e => {
      handleModelTypeChange("intent", e.target.value);
    });
  }

  // Intent 모델 저장 버튼
  const saveIntentModelButton = document.getElementById("save-intent-model-button");
  if (saveIntentModelButton) {
    saveIntentModelButton.addEventListener("click", () => {
      const intentTypeSelect = document.getElementById("intent-model-type-select");
      const intentSubmodelSelect = document.getElementById("intent-submodel-select");
      const modelType = intentTypeSelect ? intentTypeSelect.value : "";
      const modelName = intentSubmodelSelect ? intentSubmodelSelect.value : "";
      if (!modelType) {
        const intentModelStatus = document.getElementById("intent-model-status");
        if (intentModelStatus) {
          intentModelStatus.textContent = "모델 타입을 선택해주세요.";
          intentModelStatus.className = "info-message error-message";
        }
        return;
      }
      vscode.postMessage({
        command: "saveIntentModel",
        modelType: modelType,
        modelName: modelName
      });
    });
  }

  // Intent API 키 저장 버튼
  const saveIntentApiKeyButton = document.getElementById("save-intent-api-key-button");
  if (saveIntentApiKeyButton) {
    saveIntentApiKeyButton.addEventListener("click", () => {
      const intentTypeSelect = document.getElementById("intent-model-type-select");
      const intentApiKeyInput = document.getElementById("intent-api-key-input");
      const modelType = intentTypeSelect ? intentTypeSelect.value : "";
      const apiKey = intentApiKeyInput ? intentApiKeyInput.value : "";
      if (!apiKey) {
        const intentModelStatus = document.getElementById("intent-model-status");
        if (intentModelStatus) {
          intentModelStatus.textContent = "API 키를 입력해주세요.";
          intentModelStatus.className = "info-message error-message";
        }
        return;
      }
      vscode.postMessage({
        command: "saveIntentApiKey",
        modelType: modelType,
        apiKey: apiKey
      });

      // 입력 필드 초기화
      if (intentApiKeyInput) {
        intentApiKeyInput.value = "";
      }
    });
  }
});

// ===== AgentPolicy 관련 함수들 (다중 파일 지원) =====

// 카테고리별 파일 캐시
const agentPolicyFilesCache = {
  "stable-version": [],
  "coding-style": [],
  "project-architecture": [],
  "dependency-policy": [],
  "db-policy": []
};

// 파일 목록 렌더링
function renderPolicyFileList(category, files) {
  const listContainer = document.getElementById(`${category}-file-list`);
  if (!listContainer) {
    return;
  }

  // 캐시 업데이트
  agentPolicyFilesCache[category] = files;

  // 목록 초기화
  listContainer.innerHTML = "";
  if (!files || files.length === 0) {
    return;
  }
  files.forEach(fileName => {
    const isLegacy = fileName.includes("(레거시)");
    const displayName = fileName.replace(" (레거시)", "");
    const item = document.createElement("div");
    item.className = "policy-file-item";
    const nameSpan = document.createElement("span");
    nameSpan.className = "file-name" + (isLegacy ? " legacy" : "");
    nameSpan.textContent = displayName + (isLegacy ? " (레거시)" : "");
    item.appendChild(nameSpan);
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-file-btn";
    deleteBtn.textContent = "삭제";
    deleteBtn.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      console.log("[settings.js] Delete button clicked for:", displayName, "category:", category, "isLegacy:", isLegacy);

      // VSCode webview에서 confirm()이 작동하지 않을 수 있으므로 바로 삭제 요청
      vscode.postMessage({
        command: "deleteAgentPolicyFile",
        category: category,
        fileName: displayName,
        isLegacy: isLegacy
      });
    });
    item.appendChild(deleteBtn);
    listContainer.appendChild(item);
  });
}

// AgentPolicy 파일 업로드 핸들러 (다중 파일 지원)
function setupAgentPolicyFileUpload(inputId, selectButtonId, uploadButtonId, statusId, fileNameId, category) {
  const fileInput = document.getElementById(inputId);
  const selectButton = document.getElementById(selectButtonId);
  const uploadButton = document.getElementById(uploadButtonId);
  const statusElement = document.getElementById(statusId);
  const fileNameElement = document.getElementById(fileNameId);
  if (!fileInput || !selectButton || !uploadButton || !statusElement) {
    return;
  }

  // 선택된 파일들을 저장할 배열
  let selectedFiles = [];

  // 파일 선택 버튼 클릭
  selectButton.addEventListener("click", () => {
    fileInput.click();
  });

  // 파일 선택 시 (다중 파일 지원)
  fileInput.addEventListener("change", e => {
    const files = Array.from(e.target.files);
    if (files.length === 0) {
      return;
    }

    // MD 파일만 필터링
    const validFiles = files.filter(f => f.name.endsWith(".md") || f.name.endsWith(".markdown"));
    if (validFiles.length === 0) {
      (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(statusElement, "Markdown 파일만 저장할 수 있습니다.", "error");
      fileInput.value = "";
      uploadButton.disabled = true;
      return;
    }
    if (validFiles.length < files.length) {
      (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(statusElement, `${files.length - validFiles.length}개의 비-Markdown 파일이 제외되었습니다.`, "info");
    }
    selectedFiles = validFiles;
    if (fileNameElement) {
      fileNameElement.textContent = `선택된 파일: ${validFiles.map(f => f.name).join(", ")}`;
    }
    uploadButton.disabled = false;
  });

  // 저장 버튼 클릭 (다중 파일 업로드)
  uploadButton.addEventListener("click", async () => {
    if (selectedFiles.length === 0) {
      return;
    }
    (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(statusElement, "저장 중...", "info");
    uploadButton.disabled = true;
    let successCount = 0;
    let errorCount = 0;
    for (const file of selectedFiles) {
      try {
        const content = await readFileAsText(file);
        vscode.postMessage({
          command: "addAgentPolicyFile",
          category: category,
          fileName: file.name,
          content: content
        });
        successCount++;
      } catch (error) {
        errorCount++;
        console.error(`Failed to read file ${file.name}:`, error);
      }
    }

    // 파일 입력 초기화
    fileInput.value = "";
    selectedFiles = [];
    if (fileNameElement) {
      fileNameElement.textContent = "";
    }
    if (errorCount > 0) {
      (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(statusElement, `${successCount}개 저장됨, ${errorCount}개 실패`, errorCount > 0 ? "error" : "success");
    }
  });
}

// 파일을 텍스트로 읽기 (Promise 반환)
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = event => resolve(event.target.result);
    reader.onerror = () => reject(new Error("파일 읽기 실패"));
    reader.readAsText(file);
  });
}

// AgentPolicy 파일 로드 (모든 카테고리의 파일 목록 조회)
function loadAgentPolicyFiles() {
  vscode.postMessage({
    command: "listAllAgentPolicyFiles"
  });
}

// 카테고리별 상태 요소 ID 매핑
const categoryStatusMap = {
  "stable-version": "stable-version-status",
  "coding-style": "coding-style-status",
  "project-architecture": "project-architecture-status",
  "dependency-policy": "dependency-policy-status",
  "db-policy": "db-policy-status"
};

// AgentPolicy 파일 업로드 설정 (다중 파일 지원)
setupAgentPolicyFileUpload("agent-policy-stable-version-input", "select-stable-version-button", "upload-stable-version-button", "stable-version-status", "stable-version-file-name", "stable-version");
setupAgentPolicyFileUpload("agent-policy-coding-style-input", "select-coding-style-button", "upload-coding-style-button", "coding-style-status", "coding-style-file-name", "coding-style");
setupAgentPolicyFileUpload("agent-policy-project-architecture-input", "select-project-architecture-button", "upload-project-architecture-button", "project-architecture-status", "project-architecture-file-name", "project-architecture");
setupAgentPolicyFileUpload("agent-policy-dependency-policy-input", "select-dependency-policy-button", "upload-dependency-policy-button", "dependency-policy-status", "dependency-policy-file-name", "dependency-policy");
setupAgentPolicyFileUpload("agent-policy-db-policy-input", "select-db-policy-button", "upload-db-policy-button", "db-policy-status", "db-policy-file-name", "db-policy");

// AgentPolicy 관련 메시지 핸들러 (다중 파일 지원)
window.addEventListener("message", event => {
  const message = event.data;
  switch (message.command) {
    // 모든 카테고리 파일 목록 로드 완료
    case "allAgentPolicyFilesList":
      if (message.files) {
        for (const category of Object.keys(message.files)) {
          renderPolicyFileList(category, message.files[category]);
        }
      }
      break;

    // 파일 목록 로드 에러
    case "allAgentPolicyFilesListError":
      console.error("파일 목록 로드 에러:", message.error);
      break;

    // 파일 추가 완료
    case "agentPolicyFileAdded":
      if (message.category && message.fileName) {
        const statusId = categoryStatusMap[message.category];
        if (statusId) {
          (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(document.getElementById(statusId), `"${message.fileName}" 파일이 저장되었습니다.`, "success");
        }
        // 파일 목록 새로고침
        vscode.postMessage({
          command: "listAllAgentPolicyFiles"
        });
      }
      break;

    // 파일 추가 에러
    case "agentPolicyFileAddError":
      if (message.category) {
        const statusId = categoryStatusMap[message.category];
        if (statusId) {
          (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(document.getElementById(statusId), `저장 실패: ${message.error}`, "error");
          // 업로드 버튼 다시 활성화
          const uploadBtnId = `upload-${message.category}-button`;
          const uploadBtn = document.getElementById(uploadBtnId);
          if (uploadBtn) {
            uploadBtn.disabled = false;
          }
        }
      }
      break;

    // 파일 삭제 완료
    case "agentPolicyFileDeleted":
      if (message.category && message.fileName) {
        const statusId = categoryStatusMap[message.category];
        if (statusId) {
          (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(document.getElementById(statusId), `"${message.fileName}" 파일이 삭제되었습니다.`, "success");
        }
        // 파일 목록 새로고침
        vscode.postMessage({
          command: "listAllAgentPolicyFiles"
        });
      }
      break;

    // 파일 삭제 에러
    case "agentPolicyFileDeleteError":
      if (message.category) {
        const statusId = categoryStatusMap[message.category];
        if (statusId) {
          (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(document.getElementById(statusId), `삭제 실패: ${message.error}`, "error");
        }
      }
      break;

    // ========== Hot Load 관련 메시지 핸들러 ==========
    case "hotLoads":
      renderHotLoadList(message.hotLoads);
      break;
    case "hotLoadAdded":
    case "hotLoadUpdated":
    case "hotLoadDeleted":
      // 폼 초기화
      clearHotLoadForm();
      (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(document.getElementById("hotload-add-status"), "성공적으로 처리되었습니다.", "success");
      // 목록 새로고침
      vscode.postMessage({
        command: "getHotLoads"
      });
      break;
    case "hotLoadsError":
    case "hotLoadAddError":
    case "hotLoadUpdateError":
    case "hotLoadDeleteError":
      (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(document.getElementById("hotload-add-status"), message.error || "오류가 발생했습니다.", "error");
      break;

    // ========== 컨텍스트 제외 패턴 관련 메시지 핸들러 ==========
    case "contextExclusions":
      renderContextExclusionLists(message.defaultPatterns, message.customPatterns, message.disabledPatterns);
      break;
    case "contextExclusionAdded":
    case "contextExclusionDeleted":
      (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(document.getElementById("context-exclusion-status"), "성공적으로 처리되었습니다.", "success");
      // 목록 새로고침
      vscode.postMessage({
        command: "getContextExclusions"
      });
      break;
    case "contextExclusionsError":
    case "contextExclusionAddError":
    case "contextExclusionDeleteError":
    case "defaultExclusionToggleError":
      (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(document.getElementById("context-exclusion-status"), message.error || "오류가 발생했습니다.", "error");
      break;
    case "defaultExclusionToggled":
      // 목록 새로고침
      vscode.postMessage({
        command: "getContextExclusions"
      });
      break;

    // ========== 보안 규칙 관련 메시지 핸들러 ==========
    case "securityRules":
      renderSecurityRulesLists(message.defaultBlockedCommands, message.defaultProtectedFiles, message.customBlockedCommands, message.customProtectedFiles, message.disabledBlockedCommands, message.disabledProtectedFiles);
      break;
    case "blockedCommandAdded":
    case "blockedCommandDeleted":
      (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(document.getElementById("blocked-command-status"), "성공적으로 처리되었습니다.", "success");
      // 목록 새로고침
      vscode.postMessage({
        command: "getSecurityRules"
      });
      break;
    case "protectedFileAdded":
    case "protectedFileDeleted":
      (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(document.getElementById("protected-file-status"), "성공적으로 처리되었습니다.", "success");
      // 목록 새로고침
      vscode.postMessage({
        command: "getSecurityRules"
      });
      break;
    case "blockedCommandToggled":
    case "protectedFileToggled":
      // 목록 새로고침
      vscode.postMessage({
        command: "getSecurityRules"
      });
      break;
    case "securityRulesError":
    case "blockedCommandAddError":
    case "blockedCommandDeleteError":
    case "blockedCommandToggleError":
      (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(document.getElementById("blocked-command-status"), message.error || "오류가 발생했습니다.", "error");
      break;
    case "protectedFileAddError":
    case "protectedFileDeleteError":
    case "protectedFileToggleError":
      (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(document.getElementById("protected-file-status"), message.error || "오류가 발생했습니다.", "error");
      break;

    // v9.7.0: 사용량 메트릭 처리
    case "usageMetricsData":
      updateUsageMetricsUI(message.metrics, message.toolStats);
      break;
    case "usageMetricsReset":
      // 리셋 후 새로고침
      vscode.postMessage({
        command: "getUsageMetrics"
      });
      break;
    case "usageMetricsError":
      console.error("[Settings] Usage metrics error:", message.error);
      break;
  }
});

// ========== Hot Load 관련 함수 ==========

/**
 * Hot Load 폼 초기화
 */
function clearHotLoadForm() {
  const keywordsInput = document.getElementById("hotload-keywords-input");
  const descriptionInput = document.getElementById("hotload-description-input");
  const commandInput = document.getElementById("hotload-command-input");
  const addButton = document.getElementById("add-hotload-button");
  const conditionType = document.getElementById("hotload-condition-type");
  const conditionValue = document.getElementById("hotload-condition-value");
  const maxRetries = document.getElementById("hotload-max-retries");
  const onFailure = document.getElementById("hotload-on-failure");
  if (keywordsInput) {
    keywordsInput.value = "";
  }
  if (descriptionInput) {
    descriptionInput.value = "";
  }
  if (commandInput) {
    commandInput.value = "";
  }
  if (conditionType) {
    conditionType.value = "none";
  }
  if (conditionValue) {
    conditionValue.value = "";
    conditionValue.style.display = "none";
  }
  if (maxRetries) {
    maxRetries.value = "0";
  }
  if (onFailure) {
    onFailure.value = "stop";
  }
  if (addButton) {
    addButton.textContent = "Hot Load 추가";
    delete addButton.dataset.editId;
  }
}

/**
 * Hot Load 목록 렌더링
 */
function renderHotLoadList(hotLoads) {
  const listContainer = document.getElementById("hotload-list");
  const emptyMessage = document.getElementById("hotload-list-empty");
  if (!listContainer) {
    return;
  }
  if (!hotLoads || hotLoads.length === 0) {
    listContainer.innerHTML = "";
    if (emptyMessage) {
      emptyMessage.style.display = "block";
    }
    return;
  }
  if (emptyMessage) {
    emptyMessage.style.display = "none";
  }
  listContainer.innerHTML = hotLoads.map(item => {
    // 확장 필드 표시 텍스트
    let extraInfo = "";
    if (item.maxRetries && item.maxRetries > 0) {
      extraInfo += `<span style="margin-right: 8px; font-size: 0.8em; opacity: 0.8;">재시도: ${item.maxRetries}회</span>`;
    }
    if (item.completionCondition) {
      const condLabels = {
        exit_code: "종료코드",
        output_contains: "출력포함",
        output_not_contains: "출력미포함",
        file_exists: "파일존재"
      };
      const condLabel = condLabels[item.completionCondition.type] || item.completionCondition.type;
      extraInfo += `<span style="margin-right: 8px; font-size: 0.8em; opacity: 0.8;">${condLabel}: ${escapeHtml(item.completionCondition.value)}</span>`;
    }
    if (item.onFailure && item.onFailure !== "stop") {
      const failLabels = {
        notify: "알림",
        pass_to_llm: "LLM전달"
      };
      extraInfo += `<span style="font-size: 0.8em; opacity: 0.8;">실패: ${failLabels[item.onFailure] || item.onFailure}</span>`;
    }
    return `
    <div class="policy-file-item" data-id="${item.id}" style="flex-direction: column; align-items: stretch;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; width: 100%;">
        <div style="flex: 1;">
          <strong style="color: var(--vscode-foreground);">${escapeHtml(item.keywords)}</strong>
          <p style="margin: 4px 0; font-size: 0.9em; color: var(--vscode-descriptionForeground);">${escapeHtml(item.description)}</p>
          <code style="background: var(--vscode-textCodeBlock-background); padding: 2px 6px; border-radius: 3px; font-size: 0.85em;">${escapeHtml(item.command)}</code>
          ${extraInfo ? `<div style="margin-top: 4px;">${extraInfo}</div>` : ""}
        </div>
        <div style="display: flex; gap: 5px; margin-left: 10px;">
          <button class="edit-hotload-btn delete-file-btn" data-id="${item.id}" style="background-color: var(--vscode-button-secondaryBackground);">편집</button>
          <button class="delete-hotload-btn delete-file-btn" data-id="${item.id}">삭제</button>
        </div>
      </div>
    </div>
  `;
  }).join("");

  // 삭제 버튼 이벤트 바인딩
  // VSCode webview에서 confirm()이 작동하지 않으므로 바로 삭제 요청
  listContainer.querySelectorAll(".delete-hotload-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      const id = parseInt(e.currentTarget.dataset.id);
      vscode.postMessage({
        command: "deleteHotLoad",
        id: id
      });
    });
  });

  // 편집 버튼 이벤트 바인딩
  listContainer.querySelectorAll(".edit-hotload-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      const id = parseInt(e.currentTarget.dataset.id);
      const item = hotLoads.find(h => h.id === id);
      if (item) {
        const keywordsInput = document.getElementById("hotload-keywords-input");
        const descriptionInput = document.getElementById("hotload-description-input");
        const commandInput = document.getElementById("hotload-command-input");
        const addButton = document.getElementById("add-hotload-button");
        const conditionType = document.getElementById("hotload-condition-type");
        const conditionValue = document.getElementById("hotload-condition-value");
        const maxRetries = document.getElementById("hotload-max-retries");
        const onFailure = document.getElementById("hotload-on-failure");
        if (keywordsInput) {
          keywordsInput.value = item.keywords;
        }
        if (descriptionInput) {
          descriptionInput.value = item.description;
        }
        if (commandInput) {
          commandInput.value = item.command;
        }

        // 확장 필드 채우기
        if (conditionType) {
          conditionType.value = item.completionCondition ? item.completionCondition.type : "none";
        }
        if (conditionValue) {
          conditionValue.value = item.completionCondition ? item.completionCondition.value : "";
          conditionValue.style.display = item.completionCondition ? "block" : "none";
        }
        if (maxRetries) {
          maxRetries.value = item.maxRetries || 0;
        }
        if (onFailure) {
          onFailure.value = item.onFailure || "stop";
        }
        if (addButton) {
          addButton.textContent = "Hot Load 수정";
          addButton.dataset.editId = id;
        }

        // 폼으로 스크롤
        keywordsInput?.scrollIntoView({
          behavior: "smooth",
          block: "center"
        });
      }
    });
  });
}

/**
 * HTML 이스케이프
 */
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Hot Load 초기화
 */
function initializeHotLoad() {
  const addButton = document.getElementById("add-hotload-button");
  const conditionTypeSelect = document.getElementById("hotload-condition-type");
  const conditionValueInput = document.getElementById("hotload-condition-value");

  // 완료 조건 타입 변경 시 value input 표시/숨김
  if (conditionTypeSelect && conditionValueInput) {
    conditionTypeSelect.addEventListener("change", () => {
      conditionValueInput.style.display = conditionTypeSelect.value === "none" ? "none" : "block";
      // placeholder 변경
      const placeholders = {
        exit_code: "종료 코드 (예: 0)",
        output_contains: "포함할 문자열 (예: BUILD SUCCESSFUL)",
        output_not_contains: "미포함할 문자열 (예: ERROR)",
        file_exists: "파일 경로 (예: ./dist/index.js)"
      };
      conditionValueInput.placeholder = placeholders[conditionTypeSelect.value] || "조건 값";
    });
  }
  if (addButton) {
    addButton.addEventListener("click", () => {
      const keywordsInput = document.getElementById("hotload-keywords-input");
      const descriptionInput = document.getElementById("hotload-description-input");
      const commandInput = document.getElementById("hotload-command-input");
      const conditionType = document.getElementById("hotload-condition-type");
      const conditionValue = document.getElementById("hotload-condition-value");
      const maxRetries = document.getElementById("hotload-max-retries");
      const onFailure = document.getElementById("hotload-on-failure");
      const keywords = keywordsInput?.value.trim();
      const description = descriptionInput?.value.trim();
      const command = commandInput?.value.trim();
      if (!keywords || !description || !command) {
        (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(document.getElementById("hotload-add-status"), "모든 필드를 입력해주세요.", "error");
        return;
      }

      // 확장 필드 값 읽기
      const condType = conditionType?.value || "none";
      const condValue = conditionValue?.value.trim() || "";
      const retries = parseInt(maxRetries?.value || "0", 10);
      const failAction = onFailure?.value || "stop";
      const editId = addButton.dataset.editId;
      if (editId) {
        // 수정 모드
        vscode.postMessage({
          command: "updateHotLoad",
          id: parseInt(editId),
          keywords: keywords,
          description: description,
          commandStr: command,
          conditionType: condType,
          conditionValue: condValue,
          maxRetries: retries,
          onFailure: failAction
        });
      } else {
        // 추가 모드
        vscode.postMessage({
          command: "addHotLoad",
          keywords: keywords,
          description: description,
          commandStr: command,
          conditionType: condType,
          conditionValue: condValue,
          maxRetries: retries,
          onFailure: failAction
        });
      }
    });
  }

  // 초기 Hot Load 목록 요청
  vscode.postMessage({
    command: "getHotLoads"
  });
}

// Hot Load 초기화 실행
initializeHotLoad();

// ========== 컨텍스트 제외 패턴 관련 함수 ==========

/**
 * 컨텍스트 제외 패턴 목록 렌더링
 */
function renderContextExclusionLists(defaultPatterns, customPatterns, disabledPatterns) {
  const disabled = disabledPatterns || [];

  // 커스텀 패턴 목록
  const customList = document.getElementById("context-exclusion-custom-list");
  const customEmpty = document.getElementById("context-exclusion-custom-empty");
  if (customList) {
    if (!customPatterns || customPatterns.length === 0) {
      customList.innerHTML = "";
      if (customEmpty) {
        customEmpty.style.display = "block";
      }
    } else {
      if (customEmpty) {
        customEmpty.style.display = "none";
      }
      customList.innerHTML = customPatterns.map(pattern => `
        <div class="policy-file-item" style="display: flex; justify-content: space-between; align-items: center;">
          <code style="background: var(--vscode-textCodeBlock-background); padding: 2px 6px; border-radius: 3px; font-size: 0.9em;">${escapeHtml(pattern)}</code>
          <button class="delete-context-exclusion-btn delete-file-btn" data-pattern="${escapeHtml(pattern)}">삭제</button>
        </div>
      `).join("");

      // 삭제 버튼 이벤트 바인딩
      customList.querySelectorAll(".delete-context-exclusion-btn").forEach(btn => {
        btn.addEventListener("click", e => {
          const pattern = e.currentTarget.dataset.pattern;
          vscode.postMessage({
            command: "deleteContextExclusion",
            pattern: pattern
          });
        });
      });
    }
  }

  // 기본 패턴 목록 (토글 가능, 개별 태그로 표시)
  const defaultList = document.getElementById("context-exclusion-default-list");
  if (defaultList && defaultPatterns) {
    defaultList.innerHTML = defaultPatterns.map(p => {
      const isDisabled = disabled.includes(p);
      const bg = isDisabled ? "var(--vscode-inputValidation-errorBackground, rgba(255,0,0,0.1))" : "var(--vscode-badge-background)";
      const color = isDisabled ? "var(--vscode-errorForeground, #f44)" : "var(--vscode-badge-foreground)";
      const textDecoration = isDisabled ? "line-through" : "none";
      const title = isDisabled ? "클릭하여 다시 활성화" : "클릭하여 비활성화";
      return `<span class="default-exclusion-tag" data-pattern="${escapeHtml(p)}" data-disabled="${isDisabled}" title="${title}" style="display: inline-block; margin: 2px 4px; padding: 2px 8px; background: ${bg}; color: ${color}; border-radius: 3px; font-size: 0.85em; cursor: pointer; text-decoration: ${textDecoration}; user-select: none; transition: opacity 0.2s;">${escapeHtml(p)}</span>`;
    }).join("");

    // 토글 이벤트 바인딩
    defaultList.querySelectorAll(".default-exclusion-tag").forEach(tag => {
      tag.addEventListener("click", e => {
        const pattern = e.currentTarget.dataset.pattern;
        const isDisabled = e.currentTarget.dataset.disabled === "true";
        if (isDisabled) {
          vscode.postMessage({
            command: "enableDefaultExclusion",
            pattern: pattern
          });
        } else {
          vscode.postMessage({
            command: "disableDefaultExclusion",
            pattern: pattern
          });
        }
      });
    });
  }
}

/**
 * 컨텍스트 제외 패턴 초기화
 */
function initializeContextExclusion() {
  const addButton = document.getElementById("add-context-exclusion-button");
  const input = document.getElementById("context-exclusion-input");
  if (addButton && input) {
    addButton.addEventListener("click", () => {
      const pattern = input.value.trim();
      if (!pattern) {
        (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(document.getElementById("context-exclusion-status"), "패턴을 입력해주세요.", "error");
        return;
      }
      vscode.postMessage({
        command: "addContextExclusion",
        pattern: pattern
      });
      input.value = "";
    });

    // Enter 키로도 추가 가능
    input.addEventListener("keydown", e => {
      if (e.key === "Enter") {
        addButton.click();
      }
    });
  }

  // 초기 목록 요청
  vscode.postMessage({
    command: "getContextExclusions"
  });
}

// 컨텍스트 제외 패턴 초기화 실행
initializeContextExclusion();

// ========== 도구 실행 보안 규칙 관련 함수 ==========

/**
 * 보안 규칙 목록 렌더링
 */
function renderSecurityRulesLists(defaultBlockedCommands, defaultProtectedFiles, customBlockedCommands, customProtectedFiles, disabledBlockedCommands, disabledProtectedFiles) {
  const disabledCmds = disabledBlockedCommands || [];
  const disabledFiles = disabledProtectedFiles || [];

  // 커스텀 차단 명령어 목록
  const customCmdList = document.getElementById("blocked-command-custom-list");
  const customCmdEmpty = document.getElementById("blocked-command-custom-empty");
  if (customCmdList) {
    if (!customBlockedCommands || customBlockedCommands.length === 0) {
      customCmdList.innerHTML = "";
      if (customCmdEmpty) {
        customCmdEmpty.style.display = "block";
      }
    } else {
      if (customCmdEmpty) {
        customCmdEmpty.style.display = "none";
      }
      customCmdList.innerHTML = customBlockedCommands.map(pattern => `
        <div class="policy-file-item" style="display: flex; justify-content: space-between; align-items: center;">
          <code style="background: var(--vscode-textCodeBlock-background); padding: 2px 6px; border-radius: 3px; font-size: 0.9em;">${escapeHtml(pattern)}</code>
          <button class="delete-blocked-command-btn delete-file-btn" data-pattern="${escapeHtml(pattern)}">삭제</button>
        </div>
      `).join("");

      // 삭제 버튼 이벤트 바인딩
      customCmdList.querySelectorAll(".delete-blocked-command-btn").forEach(btn => {
        btn.addEventListener("click", e => {
          const pattern = e.currentTarget.dataset.pattern;
          vscode.postMessage({
            command: "deleteBlockedCommand",
            pattern: pattern
          });
        });
      });
    }
  }

  // 커스텀 보호 파일 목록
  const customFileList = document.getElementById("protected-file-custom-list");
  const customFileEmpty = document.getElementById("protected-file-custom-empty");
  if (customFileList) {
    if (!customProtectedFiles || customProtectedFiles.length === 0) {
      customFileList.innerHTML = "";
      if (customFileEmpty) {
        customFileEmpty.style.display = "block";
      }
    } else {
      if (customFileEmpty) {
        customFileEmpty.style.display = "none";
      }
      customFileList.innerHTML = customProtectedFiles.map(pattern => `
        <div class="policy-file-item" style="display: flex; justify-content: space-between; align-items: center;">
          <code style="background: var(--vscode-textCodeBlock-background); padding: 2px 6px; border-radius: 3px; font-size: 0.9em;">${escapeHtml(pattern)}</code>
          <button class="delete-protected-file-btn delete-file-btn" data-pattern="${escapeHtml(pattern)}">삭제</button>
        </div>
      `).join("");

      // 삭제 버튼 이벤트 바인딩
      customFileList.querySelectorAll(".delete-protected-file-btn").forEach(btn => {
        btn.addEventListener("click", e => {
          const pattern = e.currentTarget.dataset.pattern;
          vscode.postMessage({
            command: "deleteProtectedFile",
            pattern: pattern
          });
        });
      });
    }
  }

  // 기본 차단 명령어 목록 (토글 가능)
  const defaultCmdList = document.getElementById("blocked-command-default-list");
  if (defaultCmdList && defaultBlockedCommands) {
    defaultCmdList.innerHTML = defaultBlockedCommands.map(rule => {
      const isDisabled = disabledCmds.includes(rule.id);
      const bg = isDisabled ? "var(--vscode-inputValidation-errorBackground, rgba(255,0,0,0.1))" : "var(--vscode-badge-background)";
      const color = isDisabled ? "var(--vscode-errorForeground, #f44)" : "var(--vscode-badge-foreground)";
      const textDecoration = isDisabled ? "line-through" : "none";
      const title = isDisabled ? "클릭하여 다시 활성화" : "클릭하여 비활성화";
      return `<span class="default-blocked-cmd-tag" data-id="${escapeHtml(rule.id)}" data-disabled="${isDisabled}" title="${title}" style="display: inline-block; margin: 3px 4px; padding: 4px 10px; background: ${bg}; color: ${color}; border-radius: 3px; font-size: 0.85em; cursor: pointer; text-decoration: ${textDecoration}; user-select: none; transition: opacity 0.2s;">${escapeHtml(rule.description)}</span>`;
    }).join("");

    // 토글 이벤트 바인딩
    defaultCmdList.querySelectorAll(".default-blocked-cmd-tag").forEach(tag => {
      tag.addEventListener("click", e => {
        const id = e.currentTarget.dataset.id;
        const isDisabled = e.currentTarget.dataset.disabled === "true";
        if (isDisabled) {
          vscode.postMessage({
            command: "enableBlockedCommand",
            id: id
          });
        } else {
          vscode.postMessage({
            command: "disableBlockedCommand",
            id: id
          });
        }
      });
    });
  }

  // 기본 보호 파일 목록 (토글 가능)
  const defaultFileList = document.getElementById("protected-file-default-list");
  if (defaultFileList && defaultProtectedFiles) {
    defaultFileList.innerHTML = defaultProtectedFiles.map(rule => {
      const isDisabled = disabledFiles.includes(rule.id);
      const bg = isDisabled ? "var(--vscode-inputValidation-errorBackground, rgba(255,0,0,0.1))" : "var(--vscode-badge-background)";
      const color = isDisabled ? "var(--vscode-errorForeground, #f44)" : "var(--vscode-badge-foreground)";
      const textDecoration = isDisabled ? "line-through" : "none";
      const title = isDisabled ? "클릭하여 다시 활성화" : "클릭하여 비활성화";
      return `<span class="default-protected-file-tag" data-id="${escapeHtml(rule.id)}" data-disabled="${isDisabled}" title="${title}" style="display: inline-block; margin: 3px 4px; padding: 4px 10px; background: ${bg}; color: ${color}; border-radius: 3px; font-size: 0.85em; cursor: pointer; text-decoration: ${textDecoration}; user-select: none; transition: opacity 0.2s;">${escapeHtml(rule.description)}</span>`;
    }).join("");

    // 토글 이벤트 바인딩
    defaultFileList.querySelectorAll(".default-protected-file-tag").forEach(tag => {
      tag.addEventListener("click", e => {
        const id = e.currentTarget.dataset.id;
        const isDisabled = e.currentTarget.dataset.disabled === "true";
        if (isDisabled) {
          vscode.postMessage({
            command: "enableProtectedFile",
            id: id
          });
        } else {
          vscode.postMessage({
            command: "disableProtectedFile",
            id: id
          });
        }
      });
    });
  }
}

/**
 * 보안 규칙 초기화
 */
function initializeSecurityRules() {
  // 차단 명령어 추가
  const addCmdButton = document.getElementById("add-blocked-command-button");
  const cmdInput = document.getElementById("blocked-command-input");
  if (addCmdButton && cmdInput) {
    addCmdButton.addEventListener("click", () => {
      const pattern = cmdInput.value.trim();
      if (!pattern) {
        (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(document.getElementById("blocked-command-status"), "패턴을 입력해주세요.", "error");
        return;
      }
      vscode.postMessage({
        command: "addBlockedCommand",
        pattern: pattern
      });
      cmdInput.value = "";
    });

    // Enter 키로도 추가 가능
    cmdInput.addEventListener("keydown", e => {
      if (e.key === "Enter") {
        addCmdButton.click();
      }
    });
  }

  // 보호 파일 추가
  const addFileButton = document.getElementById("add-protected-file-button");
  const fileInput = document.getElementById("protected-file-input");
  if (addFileButton && fileInput) {
    addFileButton.addEventListener("click", () => {
      const pattern = fileInput.value.trim();
      if (!pattern) {
        (0,_settings_api_keys_js__WEBPACK_IMPORTED_MODULE_0__.showStatus)(document.getElementById("protected-file-status"), "패턴을 입력해주세요.", "error");
        return;
      }
      vscode.postMessage({
        command: "addProtectedFile",
        pattern: pattern
      });
      fileInput.value = "";
    });

    // Enter 키로도 추가 가능
    fileInput.addEventListener("keydown", e => {
      if (e.key === "Enter") {
        addFileButton.click();
      }
    });
  }

  // 초기 목록 요청
  vscode.postMessage({
    command: "getSecurityRules"
  });
}

// 보안 규칙 초기화 실행
initializeSecurityRules();

// ========== 사용량 메트릭 관련 함수 (v9.7.0) ==========

/**
 * 시간을 포맷팅하는 헬퍼 함수
 */
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * 숫자를 천 단위 구분 포맷으로 변환
 */
function formatNumber(num) {
  return num.toLocaleString();
}

/**
 * 사용량 메트릭 UI 업데이트
 */
function updateUsageMetricsUI(metrics, toolStats) {
  if (!metrics) return;

  // 메모리 사용량
  const memCurrent = document.getElementById("metrics-memory-current");
  const memPeak = document.getElementById("metrics-memory-peak");
  const sessionDuration = document.getElementById("metrics-session-duration");
  if (memCurrent) memCurrent.textContent = metrics.memoryUsage || 0;
  if (memPeak) memPeak.textContent = metrics.peakMemory || 0;
  if (sessionDuration) sessionDuration.textContent = formatDuration(metrics.sessionDuration || 0);

  // LLM 호출 통계
  const llmCalls = document.getElementById("metrics-llm-calls");
  const llmTokens = document.getElementById("metrics-llm-tokens");
  const llmAvgTime = document.getElementById("metrics-llm-avg-time");
  const llmErrors = document.getElementById("metrics-llm-errors");
  if (llmCalls) llmCalls.textContent = formatNumber(metrics.llmCallCount || 0);
  if (llmTokens) llmTokens.textContent = formatNumber(metrics.llmTotalTokens || 0);
  if (llmAvgTime) llmAvgTime.textContent = formatNumber(metrics.llmAvgResponseTime || 0);
  if (llmErrors) llmErrors.textContent = formatNumber(metrics.llmErrors || 0);

  // 도구 실행 통계
  const toolTotal = document.getElementById("metrics-tool-total");
  const toolSuccess = document.getElementById("metrics-tool-success");
  const toolFailure = document.getElementById("metrics-tool-failure");
  const toolAvgTime = document.getElementById("metrics-tool-avg-time");
  if (toolTotal) toolTotal.textContent = formatNumber(metrics.toolExecutionCount || 0);
  if (toolSuccess) toolSuccess.textContent = formatNumber(metrics.toolSuccessCount || 0);
  if (toolFailure) toolFailure.textContent = formatNumber(metrics.toolFailureCount || 0);
  if (toolAvgTime) toolAvgTime.textContent = formatNumber(metrics.toolAvgExecutionTime || 0);

  // 파일 작업 및 컨텍스트
  const filesCreated = document.getElementById("metrics-files-created");
  const filesModified = document.getElementById("metrics-files-modified");
  const compactionCount = document.getElementById("metrics-compaction-count");
  const tokensSaved = document.getElementById("metrics-tokens-saved");
  if (filesCreated) filesCreated.textContent = formatNumber(metrics.filesCreated || 0);
  if (filesModified) filesModified.textContent = formatNumber(metrics.filesModified || 0);
  if (compactionCount) compactionCount.textContent = formatNumber(metrics.contextCompactionCount || 0);
  if (tokensSaved) tokensSaved.textContent = formatNumber(metrics.tokensSaved || 0);
  console.log("[Settings] Usage metrics UI updated");
}

/**
 * 사용량 메트릭 초기화
 */
function initializeUsageMetrics() {
  // 초기화 버튼
  const resetButton = document.getElementById("reset-metrics-button");
  if (resetButton) {
    resetButton.addEventListener("click", () => {
      if (confirm("사용량 통계를 초기화하시겠습니까?")) {
        vscode.postMessage({
          command: "resetUsageMetrics"
        });
      }
    });
  }

  // 초기 데이터 요청
  vscode.postMessage({
    command: "getUsageMetrics"
  });
}

// 사용량 메트릭 초기화 실행
initializeUsageMetrics();
})();

/******/ 	return __webpack_exports__;
/******/ })()
;
});
//# sourceMappingURL=settings.js.map