/**
 * MCP Settings Module
 * MCP 서버 설정 관련 기능
 */

import { showStatus } from "./api-keys.js";

// 현재 서버 목록 캐시
let mcpServers = [];
// 관리자 MCP 서버 캐시
let adminMcpServers = [];

/**
 * MCP 서버 카드 HTML 생성
 */
function createServerCard(server) {
  const isEnabled = server.enabled !== false; // 기본값 true
  const statusClass = !isEnabled
    ? ""
    : server.status === "connected"
      ? "success"
      : server.status === "error"
        ? "error"
        : "";
  const statusText = !isEnabled
    ? "비활성"
    : server.status === "connected"
      ? "연결됨"
      : server.status === "error"
        ? "오류"
        : "대기";
  const toolCount = server.tools?.length || 0;
  const disabledStyle = !isEnabled ? "opacity: 0.5;" : "";

  // 도구 목록 HTML
  const toolsHtml =
    server.tools && server.tools.length > 0
      ? server.tools
          .map(
            (tool) => `
        <div style="padding: 6px 8px; border: 1px solid var(--vscode-panel-border); border-radius: 4px; margin-bottom: 4px;">
          <strong style="font-size: 0.85em;">${tool.name}</strong>
          <span style="font-size: 0.8em; color: var(--vscode-descriptionForeground); margin-left: 6px;">
            ${tool.description || "설명 없음"}
          </span>
        </div>
      `,
          )
          .join("")
      : '<p class="info-message" style="margin: 4px 0; font-size: 0.85em;">도구 없음 - 연결 테스트를 실행해주세요</p>';

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
          <span class="info-message ${statusClass}-message" style="font-size: 0.85em; margin: 0;">
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
 * 관리자 MCP 서버 카드 HTML (연결 + 도구만)
 */
function createAdminServerCard(server) {
  const isEnabled = server.enabled !== false;
  const isRequired = server.enforcement === 'required';
  const statusClass = !isEnabled
    ? ""
    : server.status === "connected"
      ? "success"
      : server.status === "error"
        ? "error"
        : "";
  const statusText = !isEnabled
    ? "비활성"
    : server.status === "connected"
      ? "연결됨"
      : server.status === "error"
        ? "오류"
        : "대기";
  const toolCount = server.tools?.length || 0;
  const disabledStyle = !isEnabled ? "opacity: 0.5;" : "";
  const enforcementBadge = isRequired
    ? '<span class="badge-required">필수</span>'
    : '<span class="badge-recommended">권장</span>';

  const toolsHtml = server.tools && server.tools.length > 0
    ? server.tools.map((tool) => `
        <div style="padding: 6px 8px; border: 1px solid var(--vscode-panel-border); border-radius: 4px; margin-bottom: 4px;">
          <strong style="font-size: 0.85em;">${tool.name}</strong>
          <span style="font-size: 0.8em; color: var(--vscode-descriptionForeground); margin-left: 6px;">${tool.description || "설명 없음"}</span>
        </div>`).join("")
    : '<p class="info-message" style="margin: 4px 0; font-size: 0.85em;">도구 없음 - 연결 테스트를 실행해주세요</p>';

  // 권장 서버만 토글 표시
  const toggleHtml = !isRequired ? `
    <label class="mcp-toggle" title="${isEnabled ? "비활성화" : "활성화"}">
      <input type="checkbox" class="mcp-toggle-input admin-mcp-toggle-input" data-server-id="${server.id}" ${isEnabled ? "checked" : ""} />
      <span class="mcp-toggle-slider"></span>
    </label>` : '';

  return `
    <div class="api-key-section admin-mcp-server-card" data-server-id="${server.id}" style="margin-bottom: 10px;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div style="display: flex; align-items: center; gap: 8px;">
          ${toggleHtml}
          <strong style="${disabledStyle}">${server.name}</strong>
          <span style="font-size: 0.85em; color: var(--vscode-descriptionForeground); ${disabledStyle}">
            (${server.type === "stdio" ? "로컬" : "HTTP"})
          </span>
          ${enforcementBadge}
          <span class="info-message ${statusClass}-message" style="font-size: 0.85em; margin: 0;">
            ${statusText}
          </span>
        </div>
        <div style="display: flex; gap: 5px;">
          <button class="admin-mcp-test-btn" data-server-id="${server.id}" title="연결 테스트" ${!isEnabled ? "disabled" : ""}>
            연결
          </button>
          <button class="admin-mcp-tools-btn" data-server-id="${server.id}" title="도구 목록 토글 (${toolCount}개)" ${!isEnabled ? "disabled" : ""}>
            도구 ${toolCount}
          </button>
        </div>
      </div>
      <!-- 인라인 도구 목록 (토글) -->
      <div class="admin-mcp-inline-tools" data-server-id="${server.id}" style="display: none; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--vscode-panel-border);">
        <p style="margin: 0 0 6px 0; font-size: 0.85em; font-weight: bold;">도구 목록 (${toolCount}개)</p>
        ${toolsHtml}
      </div>
      <!-- 인라인 테스트 결과 -->
      <div class="admin-mcp-inline-status" data-server-id="${server.id}" style="display: none; margin-top: 8px; padding: 6px 8px; border-radius: 4px; font-size: 0.85em;">
      </div>
    </div>
  `;
}

/**
 * 관리자 MCP 서버 목록 렌더링
 */
function renderAdminServerList() {
  const listEl = document.getElementById("admin-mcp-server-list");
  const personalLabel = document.getElementById("personal-label-mcp");
  if (!listEl) return;

  if (adminMcpServers.length === 0) {
    listEl.style.display = "none";
    if (personalLabel) personalLabel.style.display = "none";
    return;
  }

  listEl.style.display = "block";
  if (personalLabel) personalLabel.style.display = "flex";

  // preset(super admin)과 org admin 설정 분리
  const orgServers = adminMcpServers.filter(s => s.enforcement !== 'preset');
  const presetServers = adminMcpServers.filter(s => s.enforcement === 'preset');

  let html = '';

  // 조직 관리자 MCP (required/recommended)
  if (orgServers.length > 0) {
    html += '<div class="org-settings-section">';
    html += `<div class="org-settings-header">관리자 설정 <span class="org-count">(${orgServers.length})</span></div>`;
    html += orgServers.map(createAdminServerCard).join("");
    html += '</div>';
  }

  // 기본 제공 MCP (preset - super admin 등록)
  if (presetServers.length > 0) {
    html += '<div class="org-settings-section">';
    html += `<div class="org-settings-header">기본 설정 <span class="org-count">(${presetServers.length})</span></div>`;
    html += presetServers.map(createAdminServerCard).join("");
    html += '</div>';
  }

  listEl.innerHTML = html;

  bindAdminServerCardEvents();
}

/**
 * 관리자 서버 카드 이벤트 바인딩
 */
function bindAdminServerCardEvents() {
  // 권장 서버 토글
  document.querySelectorAll(".admin-mcp-toggle-input").forEach((toggle) => {
    toggle.addEventListener("change", (e) => {
      const serverId = e.currentTarget.dataset.serverId;
      const enabled = e.currentTarget.checked;
      window.vscode?.postMessage({
        command: "toggleAdminMcpServer",
        serverId,
        enabled,
      });
    });
  });

  // 테스트 버튼
  document.querySelectorAll(".admin-mcp-test-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const serverId = e.currentTarget.dataset.serverId;
      const statusEl = document.querySelector(
        `.admin-mcp-inline-status[data-server-id="${serverId}"]`
      );
      if (statusEl) {
        statusEl.style.display = "block";
        statusEl.style.backgroundColor = "var(--vscode-textBlockQuote-background)";
        statusEl.textContent = "연결 테스트 중...";
      }
      window.vscode?.postMessage({ command: "testMcpServer", serverId });
    });
  });

  // 도구 목록 토글
  document.querySelectorAll(".admin-mcp-tools-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const serverId = e.currentTarget.dataset.serverId;
      const card = document.querySelector(`.admin-mcp-server-card[data-server-id="${serverId}"]`);
      const toolsEl = card?.querySelector(`.admin-mcp-inline-tools`);
      if (toolsEl) {
        toolsEl.style.display = toolsEl.style.display === "none" ? "block" : "none";
      }
    });
  });
}

/**
 * MCP 서버 목록 렌더링 (개인)
 */
function renderServerList() {
  const listEl = document.getElementById("mcp-server-list");
  if (!listEl) {
    return;
  }

  if (mcpServers.length === 0) {
    listEl.innerHTML =
      '<p class="info-message">등록된 MCP 서버가 없습니다.</p>';
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
  document.querySelectorAll(".mcp-toggle-input").forEach((toggle) => {
    toggle.addEventListener("change", (e) => {
      const serverId = e.currentTarget.dataset.serverId;
      const enabled = e.currentTarget.checked;
      window.vscode?.postMessage({
        command: "toggleMcpServer",
        serverId,
        enabled,
      });
    });
  });

  // 테스트 버튼
  document.querySelectorAll(".mcp-test-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const serverId = e.currentTarget.dataset.serverId;
      // 인라인 상태 표시
      const statusEl = document.querySelector(
        `.mcp-inline-status[data-server-id="${serverId}"]`,
      );
      if (statusEl) {
        statusEl.style.display = "block";
        statusEl.style.backgroundColor =
          "var(--vscode-textBlockQuote-background)";
        statusEl.textContent = "연결 테스트 중...";
      }
      window.vscode?.postMessage({ command: "testMcpServer", serverId });
    });
  });

  // 도구 목록 토글 버튼
  document.querySelectorAll(".mcp-tools-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
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
        toolsEl.style.display =
          toolsEl.style.display === "none" ? "block" : "none";
      }
    });
  });

  // 편집 버튼
  document.querySelectorAll(".mcp-edit-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const serverId = e.currentTarget.dataset.serverId;
      showInlineEditForm(serverId);
    });
  });

  // 삭제 버튼 (confirm()은 VSCode webview에서 작동하지 않으므로 사용하지 않음)
  document.querySelectorAll(".mcp-delete-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const serverId = e.currentTarget.dataset.serverId;
      window.vscode?.postMessage({ command: "removeMcpServer", serverId });
    });
  });
}

/**
 * 서버 인라인 테스트 결과 표시
 */
function showInlineTestResult(serverId, success, message) {
  const statusEl = document.querySelector(
    `.mcp-inline-status[data-server-id="${serverId}"]`,
  );
  if (!statusEl) {
    return;
  }

  statusEl.style.display = "block";
  if (success) {
    statusEl.style.backgroundColor =
      "var(--vscode-testing-iconPassed, #28a745)";
    statusEl.style.color = "#fff";
  } else {
    statusEl.style.backgroundColor =
      "var(--vscode-testing-iconFailed, #dc3545)";
    statusEl.style.color = "#fff";
  }
  statusEl.textContent = message;

  // 5초 후 자동 숨김
  setTimeout(() => {
    statusEl.style.display = "none";
  }, 5000);
}

/**
 * 관리자 서버 인라인 테스트 결과 표시
 */
function showAdminInlineTestResult(serverId, success, message) {
  const statusEl = document.querySelector(
    `.admin-mcp-inline-status[data-server-id="${serverId}"]`
  );
  if (!statusEl) return;

  statusEl.style.display = "block";
  if (success) {
    statusEl.style.backgroundColor = "var(--vscode-testing-iconPassed, #28a745)";
    statusEl.style.color = "#fff";
  } else {
    statusEl.style.backgroundColor = "var(--vscode-testing-iconFailed, #dc3545)";
    statusEl.style.color = "#fff";
  }
  statusEl.textContent = message;
  setTimeout(() => { statusEl.style.display = "none"; }, 5000);
}

/**
 * 인라인 수정 폼 표시 (서버 카드 내부)
 */
function showInlineEditForm(serverId) {
  const server = mcpServers.find((s) => s.id === serverId);
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
  typeSelect?.addEventListener("change", (e) => {
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
      enabled: server.enabled !== false,
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
      serverConfig.args = editEl.querySelector(".mcp-edit-args")?.value
        .split(",").map(s => s.trim()).filter(s => s);
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
      server: serverConfig,
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
  const server = mcpServers.find((s) => s.id === serverId);
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
    showStatus(statusEl, "서버 이름을 입력해주세요.", "error");
    return;
  }

  const type = typeSelect?.value || "stdio";
  let serverConfig = {
    id: idInput?.value || `mcp_${Date.now()}`,
    name,
    type,
    enabled: true,
  };

  if (type === "stdio") {
    const command = commandInput?.value.trim();
    if (!command) {
      showStatus(statusEl, "명령어를 입력해주세요.", "error");
      return;
    }
    serverConfig.command = command;
    serverConfig.args = argsInput?.value
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s);
  } else {
    const url = urlInput?.value.trim();
    if (!url) {
      showStatus(statusEl, "URL을 입력해주세요.", "error");
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
      server: serverConfig,
    });
  } else {
    window.vscode?.postMessage({
      command: "addMcpServer",
      server: serverConfig,
    });
  }

  hideServerForm();
}

/**
 * MCP 설정 이벤트 바인딩
 */
export function bindMcpSettingsEvents(vscode) {
  // 서버 추가 버튼
  const addBtn = document.getElementById("add-mcp-server-button");
  if (addBtn) {
    addBtn.addEventListener("click", () => showServerForm());
  }

  // 타입 선택 변경
  const typeSelect = document.getElementById("mcp-server-type");
  if (typeSelect) {
    typeSelect.addEventListener("change", (e) => {
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
  vscode?.postMessage({ command: "getMcpServers" });
}

/**
 * MCP 서버 목록 업데이트
 */
export function updateMcpServers(servers, adminServersData) {
  mcpServers = servers || [];
  if (adminServersData !== undefined) {
    adminMcpServers = adminServersData || [];
  }
  renderServerList();
  renderAdminServerList();
}

/**
 * MCP 서버 상태 업데이트
 */
export function updateMcpServerStatus(serverId, status, tools = null) {
  const server = mcpServers.find((s) => s.id === serverId);
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
export function handleMcpMessage(data) {
  switch (data.command) {
    case "mcpServers":
      updateMcpServers(data.servers, data.adminServers);
      break;
    case "mcpServerAdded":
      if (data.server) {
        mcpServers.push(data.server);
        renderServerList();
      }
      break;
    case "mcpServerUpdated":
      if (data.server) {
        const idx = mcpServers.findIndex((s) => s.id === data.server.id);
        if (idx !== -1) {
          mcpServers[idx] = data.server;
          renderServerList();
        }
      }
      break;
    case "mcpServerRemoved":
      mcpServers = mcpServers.filter((s) => s.id !== data.serverId);
      renderServerList();
      break;
    case "mcpServerStatus":
      updateMcpServerStatus(data.serverId, data.status, data.tools);
      break;
    case "mcpTestResult": {
      const isAdminTest = adminMcpServers.some(s => s.id === data.serverId);
      if (data.success) {
        if (isAdminTest) {
          showAdminInlineTestResult(data.serverId, true, `연결 성공! ${data.toolCount || 0}개 도구 발견`);
          const as = adminMcpServers.find(s => s.id === data.serverId);
          if (as) { as.status = "connected"; if (data.tools) as.tools = data.tools; }
          renderAdminServerList();
        } else {
          showInlineTestResult(data.serverId, true, `연결 성공! ${data.toolCount || 0}개 도구 발견`);
          updateMcpServerStatus(data.serverId, "connected", data.tools);
        }
      } else {
        if (isAdminTest) {
          showAdminInlineTestResult(data.serverId, false, `연결 실패: ${data.error}`);
          const as = adminMcpServers.find(s => s.id === data.serverId);
          if (as) as.status = "error";
          renderAdminServerList();
        } else {
          showInlineTestResult(data.serverId, false, `연결 실패: ${data.error}`);
          updateMcpServerStatus(data.serverId, "error");
        }
      }
      break;
    }
    case "mcpServerToggled": {
      const server = mcpServers.find((s) => s.id === data.serverId);
      if (server) {
        server.enabled = data.enabled;
        server.status = data.status || "disconnected";
        if (data.tools) server.tools = data.tools;
        if (!data.enabled) {
          server.tools = [];
        }
        renderServerList();
      }
      break;
    }
    case "adminMcpServerToggled": {
      const adminServer = adminMcpServers.find((s) => s.id === data.serverId);
      if (adminServer) {
        adminServer.enabled = data.enabled;
        adminServer.status = data.status || "disconnected";
        if (data.tools) adminServer.tools = data.tools;
        if (!data.enabled) {
          adminServer.tools = [];
        }
        renderAdminServerList();
      }
      break;
    }
  }
}
