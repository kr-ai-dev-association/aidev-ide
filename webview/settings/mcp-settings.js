/**
 * MCP Settings Module
 * MCP 서버 설정 관련 기능
 */

import { showStatus } from "./api-keys.js";

// 현재 서버 목록 캐시
let mcpServers = [];

/**
 * MCP 서버 카드 HTML 생성
 */
function createServerCard(server) {
  const statusClass = server.status === 'connected' ? 'success' : (server.status === 'error' ? 'error' : '');
  const statusText = server.status === 'connected' ? '연결됨' : (server.status === 'error' ? '오류' : '대기');
  const toolCount = server.tools?.length || 0;

  return `
    <div class="api-key-section mcp-server-card" data-server-id="${server.id}" style="margin-bottom: 10px;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <strong>${server.name}</strong>
          <span style="margin-left: 10px; font-size: 0.85em; color: var(--vscode-descriptionForeground);">
            (${server.type === 'stdio' ? '로컬' : 'HTTP'})
          </span>
          <span class="info-message ${statusClass}-message" style="margin-left: 10px; font-size: 0.85em;">
            ${statusText}
          </span>
        </div>
        <div style="display: flex; gap: 5px;">
          <button class="mcp-test-btn" data-server-id="${server.id}" title="연결 테스트">
            🔌
          </button>
          <button class="mcp-tools-btn" data-server-id="${server.id}" title="도구 목록 (${toolCount}개)">
            🛠️ ${toolCount}
          </button>
          <button class="mcp-edit-btn" data-server-id="${server.id}" title="편집">
            ✏️
          </button>
          <button class="mcp-delete-btn" data-server-id="${server.id}" title="삭제">
            🗑️
          </button>
        </div>
      </div>
      <p style="margin-top: 5px; font-size: 0.85em; color: var(--vscode-descriptionForeground);">
        ${server.type === 'stdio' ? `${server.command} ${(server.args || []).join(' ')}` : server.url || ''}
      </p>
    </div>
  `;
}

/**
 * MCP 서버 목록 렌더링
 */
function renderServerList() {
  const listEl = document.getElementById('mcp-server-list');
  if (!listEl) return;

  if (mcpServers.length === 0) {
    listEl.innerHTML = '<p class="info-message">등록된 MCP 서버가 없습니다.</p>';
  } else {
    listEl.innerHTML = mcpServers.map(createServerCard).join('');
  }

  // 이벤트 바인딩
  bindServerCardEvents();
}

/**
 * 서버 카드 이벤트 바인딩
 */
function bindServerCardEvents() {
  // 테스트 버튼
  document.querySelectorAll('.mcp-test-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const serverId = e.currentTarget.dataset.serverId;
      window.vscode?.postMessage({ command: 'testMcpServer', serverId });
    });
  });

  // 도구 목록 버튼
  document.querySelectorAll('.mcp-tools-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const serverId = e.currentTarget.dataset.serverId;
      showServerDetails(serverId);
    });
  });

  // 편집 버튼
  document.querySelectorAll('.mcp-edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const serverId = e.currentTarget.dataset.serverId;
      editServer(serverId);
    });
  });

  // 삭제 버튼
  document.querySelectorAll('.mcp-delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const serverId = e.currentTarget.dataset.serverId;
      if (confirm('이 MCP 서버를 삭제하시겠습니까?')) {
        window.vscode?.postMessage({ command: 'removeMcpServer', serverId });
      }
    });
  });
}

/**
 * 서버 상세 정보 (도구 목록) 표시
 */
function showServerDetails(serverId) {
  const server = mcpServers.find(s => s.id === serverId);
  if (!server) return;

  const detailsEl = document.getElementById('mcp-server-details');
  const titleEl = document.getElementById('mcp-details-title');
  const toolsListEl = document.getElementById('mcp-tools-list');

  if (!detailsEl || !titleEl || !toolsListEl) return;

  titleEl.textContent = `${server.name} - 도구 목록`;

  if (!server.tools || server.tools.length === 0) {
    toolsListEl.innerHTML = '<p class="info-message">사용 가능한 도구가 없습니다. 서버 연결 테스트를 실행해주세요.</p>';
  } else {
    toolsListEl.innerHTML = server.tools.map(tool => `
      <div style="padding: 8px; border: 1px solid var(--vscode-panel-border); border-radius: 4px; margin-bottom: 8px;">
        <strong>${tool.name}</strong>
        <p style="margin: 5px 0 0 0; font-size: 0.85em; color: var(--vscode-descriptionForeground);">
          ${tool.description || '설명 없음'}
        </p>
      </div>
    `).join('');
  }

  detailsEl.style.display = 'block';
}

/**
 * 서버 편집 폼 표시
 */
function editServer(serverId) {
  const server = mcpServers.find(s => s.id === serverId);
  if (!server) return;

  showServerForm(server);
}

/**
 * 서버 추가/편집 폼 표시
 */
function showServerForm(server = null) {
  const formEl = document.getElementById('mcp-server-form');
  const titleEl = document.getElementById('mcp-form-title');
  const idInput = document.getElementById('mcp-server-id');
  const nameInput = document.getElementById('mcp-server-name');
  const typeSelect = document.getElementById('mcp-server-type');
  const commandInput = document.getElementById('mcp-command');
  const argsInput = document.getElementById('mcp-args');
  const urlInput = document.getElementById('mcp-url');
  const apiKeyInput = document.getElementById('mcp-api-key');

  if (!formEl) return;

  if (server) {
    titleEl.textContent = 'MCP 서버 편집';
    idInput.value = server.id;
    nameInput.value = server.name || '';
    typeSelect.value = server.type || 'stdio';
    commandInput.value = server.command || '';
    argsInput.value = (server.args || []).join(', ');
    urlInput.value = server.url || '';
    apiKeyInput.value = server.apiKey || '';
  } else {
    titleEl.textContent = 'MCP 서버 추가';
    idInput.value = '';
    nameInput.value = '';
    typeSelect.value = 'stdio';
    commandInput.value = '';
    argsInput.value = '';
    urlInput.value = '';
    apiKeyInput.value = '';
  }

  updateTypeVisibility(typeSelect.value);
  formEl.style.display = 'block';
}

/**
 * 연결 타입에 따른 필드 표시/숨김
 */
function updateTypeVisibility(type) {
  const stdioSettings = document.getElementById('mcp-stdio-settings');
  const httpSettings = document.getElementById('mcp-http-settings');

  if (stdioSettings && httpSettings) {
    stdioSettings.style.display = type === 'stdio' ? 'block' : 'none';
    httpSettings.style.display = type === 'http' ? 'block' : 'none';
  }
}

/**
 * 폼 숨기기
 */
function hideServerForm() {
  const formEl = document.getElementById('mcp-server-form');
  if (formEl) {
    formEl.style.display = 'none';
  }
}

/**
 * 폼 데이터 수집 및 저장
 */
function saveServerFromForm() {
  const idInput = document.getElementById('mcp-server-id');
  const nameInput = document.getElementById('mcp-server-name');
  const typeSelect = document.getElementById('mcp-server-type');
  const commandInput = document.getElementById('mcp-command');
  const argsInput = document.getElementById('mcp-args');
  const urlInput = document.getElementById('mcp-url');
  const apiKeyInput = document.getElementById('mcp-api-key');
  const statusEl = document.getElementById('mcp-form-status');

  const name = nameInput?.value.trim();
  if (!name) {
    showStatus(statusEl, '서버 이름을 입력해주세요.', 'error');
    return;
  }

  const type = typeSelect?.value || 'stdio';
  let serverConfig = {
    id: idInput?.value || `mcp_${Date.now()}`,
    name,
    type,
    enabled: true
  };

  if (type === 'stdio') {
    const command = commandInput?.value.trim();
    if (!command) {
      showStatus(statusEl, '명령어를 입력해주세요.', 'error');
      return;
    }
    serverConfig.command = command;
    serverConfig.args = argsInput?.value.split(',').map(s => s.trim()).filter(s => s);
  } else {
    const url = urlInput?.value.trim();
    if (!url) {
      showStatus(statusEl, 'URL을 입력해주세요.', 'error');
      return;
    }
    serverConfig.url = url;
    if (apiKeyInput?.value.trim()) {
      serverConfig.apiKey = apiKeyInput.value.trim();
    }
  }

  // 기존 서버 업데이트 또는 새 서버 추가
  if (idInput?.value) {
    window.vscode?.postMessage({ command: 'updateMcpServer', server: serverConfig });
  } else {
    window.vscode?.postMessage({ command: 'addMcpServer', server: serverConfig });
  }

  hideServerForm();
}

/**
 * MCP 설정 이벤트 바인딩
 */
export function bindMcpSettingsEvents(vscode) {
  // 서버 추가 버튼
  const addBtn = document.getElementById('add-mcp-server-button');
  if (addBtn) {
    addBtn.addEventListener('click', () => showServerForm());
  }

  // 타입 선택 변경
  const typeSelect = document.getElementById('mcp-server-type');
  if (typeSelect) {
    typeSelect.addEventListener('change', (e) => {
      updateTypeVisibility(e.target.value);
    });
  }

  // 저장 버튼
  const saveBtn = document.getElementById('save-mcp-server-button');
  if (saveBtn) {
    saveBtn.addEventListener('click', saveServerFromForm);
  }

  // 취소 버튼
  const cancelBtn = document.getElementById('cancel-mcp-server-button');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', hideServerForm);
  }

  // 상세 정보 닫기 버튼
  const closeDetailsBtn = document.getElementById('close-mcp-details-button');
  if (closeDetailsBtn) {
    closeDetailsBtn.addEventListener('click', () => {
      const detailsEl = document.getElementById('mcp-server-details');
      if (detailsEl) detailsEl.style.display = 'none';
    });
  }

  // 초기 서버 목록 요청
  vscode?.postMessage({ command: 'getMcpServers' });
}

/**
 * MCP 서버 목록 업데이트
 */
export function updateMcpServers(servers) {
  mcpServers = servers || [];
  renderServerList();
}

/**
 * MCP 서버 상태 업데이트
 */
export function updateMcpServerStatus(serverId, status, tools = null) {
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
export function handleMcpMessage(data) {
  switch (data.command) {
    case 'mcpServers':
      updateMcpServers(data.servers);
      break;
    case 'mcpServerAdded':
      if (data.server) {
        mcpServers.push(data.server);
        renderServerList();
      }
      break;
    case 'mcpServerUpdated':
      if (data.server) {
        const idx = mcpServers.findIndex(s => s.id === data.server.id);
        if (idx !== -1) {
          mcpServers[idx] = data.server;
          renderServerList();
        }
      }
      break;
    case 'mcpServerRemoved':
      mcpServers = mcpServers.filter(s => s.id !== data.serverId);
      renderServerList();
      break;
    case 'mcpServerStatus':
      updateMcpServerStatus(data.serverId, data.status, data.tools);
      break;
    case 'mcpTestResult':
      const statusEl = document.getElementById('mcp-form-status');
      if (data.success) {
        showStatus(statusEl, `연결 성공! ${data.toolCount || 0}개 도구 발견`, 'success');
        updateMcpServerStatus(data.serverId, 'connected', data.tools);
      } else {
        showStatus(statusEl, `연결 실패: ${data.error}`, 'error');
        updateMcpServerStatus(data.serverId, 'error');
      }
      break;
  }
}
