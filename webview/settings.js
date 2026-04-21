// settings.js
import { showStatus } from "./settings/api-keys.js";
import {
  bindToggleEvents,
  bindSpinnerEvents,
  updateToggleState,
  updateSpinnerValue,
} from "./settings/toggles.js";
// VS Code API를 전역으로 획득
if (
  typeof window.vscode === "undefined" &&
  typeof acquireVsCodeApi !== "undefined"
) {
  window.vscode = acquireVsCodeApi();
}
const vscode = window.vscode || null;

// 설정 로드 중 플래그 (자동 저장 방지용)
let isLoadingSettings = false;

// standalone: 서버 없이 빌트인 모델 프리셋 제공
let cachedServerSettings = {
  ai_model: [
    // Google (Gemini) - OpenAI 호환 엔드포인트
    {
      key: "gemini-3.1-pro-preview",
      source: "preset",
      group: "gemini",
      value: {
        name: "Gemini 3.1 Pro",
        provider: "openai",
        model: "gemini-3.1-pro-preview",
        baseUrl:
          "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
        authType: "bearer",
        streamingSupported: true,
      },
    },
    {
      key: "gemini-3-flash-preview",
      source: "preset",
      group: "gemini",
      value: {
        name: "Gemini 3 Flash",
        provider: "openai",
        model: "gemini-3-flash-preview",
        baseUrl:
          "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
        authType: "bearer",
        streamingSupported: true,
      },
    },
    {
      key: "gemini-2.5-pro",
      source: "preset",
      group: "gemini",
      value: {
        name: "Gemini 2.5 Pro",
        provider: "openai",
        model: "gemini-2.5-pro",
        baseUrl:
          "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
        authType: "bearer",
        streamingSupported: true,
      },
    },
    {
      key: "gemini-2.5-flash",
      source: "preset",
      group: "gemini",
      value: {
        name: "Gemini 2.5 Flash",
        provider: "openai",
        model: "gemini-2.5-flash",
        baseUrl:
          "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
        authType: "bearer",
        streamingSupported: true,
      },
    },
    // OpenAI
    {
      key: "gpt-5.4",
      source: "preset",
      group: "openai",
      value: {
        name: "GPT-5.4",
        provider: "openai",
        model: "gpt-5.4",
        baseUrl: "https://api.openai.com/v1/chat/completions",
        authType: "bearer",
        streamingSupported: true,
      },
    },
    {
      key: "gpt-5.4-pro",
      source: "preset",
      group: "openai",
      value: {
        name: "GPT-5.4 Pro",
        provider: "openai",
        model: "gpt-5.4-pro",
        baseUrl: "https://api.openai.com/v1/chat/completions",
        authType: "bearer",
        streamingSupported: true,
      },
    },
    {
      key: "gpt-5.3-codex",
      source: "preset",
      group: "openai",
      value: {
        name: "GPT-5.3 Codex",
        provider: "openai",
        model: "gpt-5.3-codex",
        baseUrl: "https://api.openai.com/v1/chat/completions",
        authType: "bearer",
        streamingSupported: true,
      },
    },
    {
      key: "gpt-5-mini",
      source: "preset",
      group: "openai",
      value: {
        name: "GPT-5 Mini",
        provider: "openai",
        model: "gpt-5-mini",
        baseUrl: "https://api.openai.com/v1/chat/completions",
        authType: "bearer",
        streamingSupported: true,
      },
    },
    {
      key: "gpt-4.1",
      source: "preset",
      group: "openai",
      value: {
        name: "GPT-4.1",
        provider: "openai",
        model: "gpt-4.1",
        baseUrl: "https://api.openai.com/v1/chat/completions",
        authType: "bearer",
        streamingSupported: true,
      },
    },
    // Anthropic (Claude)
    {
      key: "claude-opus-4-6",
      source: "preset",
      group: "claude",
      value: {
        name: "Claude Opus 4.6",
        provider: "anthropic",
        model: "claude-opus-4-6",
        baseUrl: "https://api.anthropic.com",
        authType: "x-api-key",
        streamingSupported: true,
      },
    },
    {
      key: "claude-sonnet-4-6",
      source: "preset",
      group: "claude",
      value: {
        name: "Claude Sonnet 4.6",
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        baseUrl: "https://api.anthropic.com",
        authType: "x-api-key",
        streamingSupported: true,
      },
    },
    {
      key: "claude-haiku-4-5",
      source: "preset",
      group: "claude",
      value: {
        name: "Claude Haiku 4.5",
        provider: "anthropic",
        model: "claude-haiku-4-5-20251001",
        baseUrl: "https://api.anthropic.com",
        authType: "x-api-key",
        streamingSupported: true,
      },
    },
  ],
};

// 조직 소속 여부: window.userHasOrganization (settings.html에서 설정)

// ===== 조직 설정 렌더링 =====

const ORG_CATEGORY_LABELS = {
  rag: "RAG",
  build_test: "빌드/테스트",
  hotload: "Hot Load",
  dev_rules: "Skills",
  exclude_patterns: "제외 패턴",
  security_rules: "보안 규칙",
  ai_model: "AI 모델",
};

const PERSONAL_LABEL_MAP = {
  rag: "personal-label-rag",
  build_test: "personal-label-build_test",
  hotload: "personal-label-hotload",
  dev_rules: "personal-label-dev_rules",
  exclude_patterns: "personal-label-exclude_patterns",
  security_rules: "personal-label-security_rules",
};

/**
 * 조직 설정 값을 사람이 읽기 좋은 형태로 변환 (기본 폴백)
 */
function formatSettingValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "사용" : "사용 안 함";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/**
 * 카테고리별 카드 내용 HTML 생성
 * 각 카테고리의 value 구조에 맞게 보기 좋은 카드를 렌더링
 */
function renderSettingCard(s, category) {
  const isRequired = s.enforcement === "required";
  const isDisabled = !!s.is_disabled;
  const itemClass = isRequired
    ? "org-setting-item is-locked"
    : isDisabled
      ? "org-setting-item is-excluded"
      : "org-setting-item";
  const badge = isRequired
    ? '<span class="badge-required">필수</span>'
    : '<span class="badge-recommended">권장</span>';

  // ai_model은 아래 드롭다운에서 선택하므로 토글 불가
  const clickAttr =
    isRequired || category === "ai_model"
      ? ""
      : ` data-org-toggle-cat="${category}" data-org-toggle-key="${escapeHtml(s.key)}"`;
  let html = `<div class="${itemClass}"${clickAttr}>`;
  html += badge;
  html += `<div class="setting-info">`;
  // RAG: 소스 이름을 키 대신 표시
  const displayKey =
    category === "rag" && s.value && s.value.name ? s.value.name : s.key;
  html += `<div class="setting-key">${escapeHtml(displayKey)}`;
  // dev_rules: 규칙/스킬 타입 배지
  if (category === "dev_rules" && s.skill_type) {
    const isSkill = s.skill_type === "skill";
    const typeLabel = isSkill ? "스킬" : "규칙";
    html += ` <span style="background:#3b82f6;color:#fff;padding:1px 6px;border-radius:4px;font-size:0.75em;font-weight:500;margin-left:4px;">${typeLabel}</span>`;
  }
  // security_rules: 이름 옆에 유형 배지
  if (category === "security_rules" && s.value && typeof s.value === "object") {
    const typeLabel =
      s.value.type === "hidden_file"
        ? "파일 은닉"
        : s.value.type === "protected_file"
          ? "보호 파일"
          : "차단 명령어";
    html += ` <span style="background:#2563eb;color:#fff;padding:1px 6px;border-radius:4px;font-size:0.75em;font-weight:500;margin-left:4px;">${typeLabel}</span>`;
  }
  html += `</div>`;

  // 카테고리별 상세 렌더링
  const v = s.value;
  if (category === "hotload" && v && typeof v === "object") {
    const rows = [];
    if (v.keywords)
      rows.push(
        `<b>키워드:</b> ${escapeHtml(Array.isArray(v.keywords) ? v.keywords.join(", ") : String(v.keywords))}`,
      );
    if (v.description) rows.push(`<b>설명:</b> ${escapeHtml(v.description)}`);
    if (v.command)
      rows.push(`<b>명령어:</b> <code>${escapeHtml(v.command)}</code>`);
    if (v.condition) rows.push(`<b>조건:</b> ${escapeHtml(v.condition)}`);
    html += `<div class="setting-detail">${rows.join("<br>")}</div>`;
  } else if (category === "dev_rules" && v && typeof v === "object") {
    const rows = [];
    if (v.title) rows.push(`<b>제목:</b> ${escapeHtml(v.title)}`);
    if (v.content) {
      const preview = String(v.content).substring(0, 200);
      rows.push(
        `<div class="setting-content-preview">${escapeHtml(preview)}${String(v.content).length > 200 ? "..." : ""}</div>`,
      );
    }
    if (v.category_sub)
      rows.push(`<b>하위분류:</b> ${escapeHtml(v.category_sub)}`);
    html += `<div class="setting-detail">${rows.join("<br>")}</div>`;
    if (s.skill_description) {
      html += `<div style="margin-top:4px;font-size:0.75em;color:#b45309;background:#fffbeb;padding:2px 8px;border-radius:4px;">${escapeHtml(s.skill_description)}</div>`;
    }
  } else if (category === "ai_model" && v && typeof v === "object") {
    const rows = [];
    if (v.provider) rows.push(`<b>제공자:</b> ${escapeHtml(v.provider)}`);
    if (v.model || v.model_name)
      rows.push(`<b>모델:</b> ${escapeHtml(v.model || v.model_name)}`);
    const cw = v.context_window || v.contextWindow;
    rows.push(
      `<b>Context Window:</b> ${cw ? Number(cw).toLocaleString() : '<span style="opacity:0.5">미설정</span>'}`,
    );
    const mt = v.max_tokens || v.maxTokens;
    rows.push(
      `<b>Max Tokens:</b> ${mt ? Number(mt).toLocaleString() : '<span style="opacity:0.5">미설정</span>'}`,
    );
    if (rows.length) {
      html += `<div class="setting-detail">${rows.join("<br>")}</div>`;
    } else {
      html += `<div class="setting-desc">${escapeHtml(formatSettingValue(v))}</div>`;
    }
  } else if (category === "build_test" && v && typeof v === "object") {
    const rows = [];
    if (s.description) rows.push(`<b>설명:</b> ${escapeHtml(s.description)}`);
    if (v.command)
      rows.push(`<b>명령어:</b> <code>${escapeHtml(v.command)}</code>`);
    if (v.language) rows.push(`<b>언어:</b> ${escapeHtml(v.language)}`);
    // 레거시 필드 fallback
    if (!v.command) {
      if (v.validate_command)
        rows.push(
          `<b>검증:</b> <code>${escapeHtml(v.validate_command)}</code>`,
        );
      if (v.format_command)
        rows.push(`<b>포맷:</b> <code>${escapeHtml(v.format_command)}</code>`);
      if (v.build_command)
        rows.push(`<b>빌드:</b> <code>${escapeHtml(v.build_command)}</code>`);
      if (v.test_command)
        rows.push(`<b>테스트:</b> <code>${escapeHtml(v.test_command)}</code>`);
    }
    if (rows.length) {
      html += `<div class="setting-detail">${rows.join("<br>")}</div>`;
    } else {
      html += `<div class="setting-desc">${escapeHtml(formatSettingValue(v))}</div>`;
    }
  } else if (category === "security_rules" && v && typeof v === "object") {
    const rows = [];
    if (v.blocked_commands && Array.isArray(v.blocked_commands))
      rows.push(
        `<b>차단 명령어:</b> <code>${v.blocked_commands.map((c) => escapeHtml(c)).join("</code>, <code>")}</code>`,
      );
    if (v.protected_files && Array.isArray(v.protected_files))
      rows.push(
        `<b>보호 파일:</b> <code>${v.protected_files.map((f) => escapeHtml(f)).join("</code>, <code>")}</code>`,
      );
    if (v.pattern)
      rows.push(`<b>패턴:</b> <code>${escapeHtml(v.pattern)}</code>`);
    if (v.description) rows.push(`<b>설명:</b> ${escapeHtml(v.description)}`);
    if (rows.length) {
      html += `<div class="setting-detail">${rows.join("<br>")}</div>`;
    } else {
      html += `<div class="setting-desc">${escapeHtml(formatSettingValue(v))}</div>`;
    }
  } else if (category === "exclude_patterns") {
    if (Array.isArray(v)) {
      html += `<div class="setting-detail"><code>${v.map((p) => escapeHtml(p)).join("</code>, <code>")}</code></div>`;
    } else if (typeof v === "string") {
      html += `<div class="setting-desc"><code>${escapeHtml(v)}</code></div>`;
    } else if (v && typeof v === "object") {
      const rows = [];
      if (v.pattern)
        rows.push(`<b>패턴:</b> <code>${escapeHtml(v.pattern)}</code>`);
      if (v.patterns && Array.isArray(v.patterns))
        rows.push(
          `<b>패턴:</b> <code>${v.patterns.map((p) => escapeHtml(p)).join("</code>, <code>")}</code>`,
        );
      if (v.description) rows.push(`<b>설명:</b> ${escapeHtml(v.description)}`);
      if (v.type) rows.push(`<b>유형:</b> ${escapeHtml(v.type)}`);
      if (rows.length) {
        html += `<div class="setting-detail">${rows.join("<br>")}</div>`;
      } else {
        html += `<div class="setting-desc">${escapeHtml(formatSettingValue(v))}</div>`;
      }
    } else {
      html += `<div class="setting-desc">${escapeHtml(formatSettingValue(v))}</div>`;
    }
  } else if (category === "rag" && v && typeof v === "object") {
    const rows = [];
    if (v.description) rows.push(`${escapeHtml(v.description)}`);
    const docCount = v.document_count != null ? v.document_count : 0;
    const vecCount = v.vector_count != null ? v.vector_count : 0;
    rows.push(
      `<b>문서:</b> ${docCount}개 &nbsp; <b>벡터:</b> ${vecCount.toLocaleString()}개`,
    );
    html += `<div class="setting-detail">${rows.join("<br>")}</div>`;
  } else {
    // 범용 폴백
    const valueStr = formatSettingValue(v);
    if (valueStr) {
      html += `<div class="setting-desc">${escapeHtml(valueStr)}</div>`;
    }
  }

  html += `</div>`; // .setting-info

  if (isRequired) {
    html += `<span class="badge-locked">🔒</span>`;
  } else {
    html += `<span class="badge-locked" style="visibility:hidden">🔒</span>`;
  }
  html += `</div>`; // .org-setting-item
  return html;
}

/**
 * 단일 카테고리의 조직 설정 렌더링
 */
function renderOrgSettings(category) {
  const container = document.getElementById(`org-settings-${category}`);
  if (!container) return;

  let settings;
  let headerLabel;
  if (window.userHasOrganization) {
    // 조직 사용자: 프리셋 제외, 관리자 설정만 표시
    settings = (cachedServerSettings[category] || []).filter(
      (s) => s.source !== "preset",
    );
    headerLabel = "관리자 설정";
  } else {
    // 개인 사용자: 프리셋(super에서 개인 활성화한 설정) 표시
    settings = (cachedServerSettings[category] || []).filter(
      (s) => s.source === "preset",
    );
    headerLabel = "기본 설정";
  }

  // RAG 빈 상태 메시지 처리
  const ragEmptyMsg = document.getElementById("rag-empty-message");
  if (category === "rag" && ragEmptyMsg) {
    ragEmptyMsg.style.display = settings.length === 0 ? "block" : "none";
  }

  if (settings.length === 0) {
    container.style.display = "none";
    const personalLabel = document.getElementById(PERSONAL_LABEL_MAP[category]);
    if (personalLabel) personalLabel.style.display = "none";
    return;
  }

  container.style.display = "block";
  const personalLabel = document.getElementById(PERSONAL_LABEL_MAP[category]);
  if (personalLabel) personalLabel.style.display = "flex";

  let html = `<div class="org-settings-section">`;
  html += `<div class="org-settings-header">${headerLabel} <span class="org-count">(${settings.length})</span></div>`;

  for (const s of settings) {
    html += renderSettingCard(s, category);
  }

  html += `</div>`;
  container.innerHTML = html;
}

/**
 * 전체 카테고리 조직 설정 렌더링
 */
function renderAllOrgSettings() {
  // 조직/개인 모두: 카테고리별 설정 카드 렌더링
  // (renderOrgSettings 내부에서 조직→관리자설정, 개인→프리셋 분기)
  const categories = Object.keys(PERSONAL_LABEL_MAP);
  for (const cat of categories) {
    renderOrgSettings(cat);
  }
  if (window.userHasOrganization) {
    // 서버에서 온 추가 카테고리도 렌더링
    for (const cat of Object.keys(cachedServerSettings)) {
      if (!PERSONAL_LABEL_MAP[cat]) {
        renderOrgSettings(cat);
      }
    }
    // 관리자 AI 모델을 드롭다운에 추가
    populateAdminModelsInDropdown();
  }
  // 지원 모델은 조직/개인 모두 표시 (프리셋 기반)
  populateSupportedModels();
  // 라우팅 셀렉트에 지원 모델 추가
  populateRoutingModelOptions();
}

/**
 * 지원 모델을 그룹 단위로 메인 드롭다운에 추가
 * 메인 드롭다운: 그룹명 선택 → 서브 셀렉트에서 모델 선택
 */
function populateSupportedModels() {
  const mainSelect = document.getElementById("ai-model-select");
  if (!mainSelect) return;
  const adminOpt = mainSelect.querySelector('option[value="admin"]');

  // 기존 동적 옵션 제거
  mainSelect
    .querySelectorAll("optgroup[data-supported-group]")
    .forEach((o) => o.remove());
  mainSelect
    .querySelectorAll("option[data-supported]")
    .forEach((o) => o.remove());

  const aiModels = cachedServerSettings["ai_model"] || [];
  const supportedModels = aiModels.filter((s) => s.source === "preset");

  // 그룹별로 분류
  const groups = {};
  for (const s of supportedModels) {
    const g = s.group || "default";
    if (!groups[g]) groups[g] = [];
    groups[g].push(s);
  }

  // 각 그룹을 메인 드롭다운에 추가 (group:xxx 형식)
  for (const groupName of Object.keys(groups)) {
    const option = document.createElement("option");
    option.value = `group:${groupName}`;
    option.textContent = groupName.charAt(0).toUpperCase() + groupName.slice(1);
    option.setAttribute("data-supported", "true");
    if (adminOpt) {
      mainSelect.insertBefore(option, adminOpt);
    } else {
      mainSelect.appendChild(option);
    }
  }
}

/**
 * supported:key에서 해당 모델의 그룹명을 찾아 반환
 */
function findGroupForSupportedKey(supportedKey) {
  const aiModels = cachedServerSettings["ai_model"] || [];
  const preset = aiModels.find(
    (s) => s.key === supportedKey && s.source === "preset",
  );
  return preset ? preset.group || "default" : null;
}

/**
 * 관리자 설정 AI 모델을 서브 드롭다운에 추가 (preset 제외 — 순수 admin 모델만)
 */
function populateAdminModelsInDropdown() {
  const subSelect = document.getElementById("admin-model-select");
  if (!subSelect) return;

  subSelect.innerHTML = "";

  const aiModels = cachedServerSettings["ai_model"] || [];
  // source가 'admin'인 것만 = 순수 관리자 모델 (preset, builtin 제외)
  const adminOnlyModels = aiModels.filter((s) => {
    const v = s.value;
    return v && v.enabled !== false && s.source === "admin";
  });

  const mainSelect = document.getElementById("ai-model-select");
  if (adminOnlyModels.length === 0) {
    if (mainSelect) {
      const adminOpt = mainSelect.querySelector('option[value="admin"]');
      if (adminOpt) adminOpt.style.display = "none";
    }
    return;
  }

  if (mainSelect) {
    const adminOpt = mainSelect.querySelector('option[value="admin"]');
    if (adminOpt) adminOpt.style.display = "";
  }

  for (const s of adminOnlyModels) {
    const v = s.value;
    const option = document.createElement("option");
    option.value = s.key;
    const model = v.model || v.model_name || s.key;
    const badge = s.enforcement === "required" ? " 🔒" : "";
    option.textContent = `${model}${badge}`;
    subSelect.appendChild(option);
  }

  const pendingKey = subSelect.getAttribute("data-pending-admin-key");
  if (pendingKey) {
    subSelect.value = pendingKey;
    subSelect.removeAttribute("data-pending-admin-key");
  }
}

/**
 * 모델 라우팅 셀렉트에 지원/관리자 모델 동적 추가
 */
function populateRoutingModelOptions() {
  const routingSelects = [
    document.getElementById("compactor-model-type-select"),
    document.getElementById("command-model-type-select"),
    document.getElementById("intent-model-type-select"),
    document.getElementById("subagent-model-type-select"),
    document.getElementById("completion-model-type-select"),
    document.getElementById("error-fallback-model-type-select"),
  ];

  const aiModels = cachedServerSettings["ai_model"] || [];

  // 지원 모델 그룹
  const supportedModels = aiModels.filter((s) => s.source === "preset");
  const groups = {};
  for (const s of supportedModels) {
    const g = s.group || "default";
    if (!groups[g]) groups[g] = [];
    groups[g].push(s);
  }

  // 관리자 모델
  const adminModels = aiModels.filter(
    (s) => s.source === "admin" && s.value?.enabled !== false,
  );

  for (const select of routingSelects) {
    if (!select) continue;

    // 기존 동적 옵션 제거
    select.querySelectorAll("option[data-dynamic]").forEach((o) => o.remove());

    // 지원 모델 그룹 추가
    for (const groupName of Object.keys(groups)) {
      const option = document.createElement("option");
      option.value = `group:${groupName}`;
      option.textContent =
        groupName.charAt(0).toUpperCase() + groupName.slice(1);
      option.setAttribute("data-dynamic", "true");
      select.appendChild(option);
    }

    // 관리자 모델 추가
    if (adminModels.length > 0) {
      const adminOpt = document.createElement("option");
      adminOpt.value = "admin";
      adminOpt.textContent = "관리자";
      adminOpt.setAttribute("data-dynamic", "true");
      select.appendChild(adminOpt);
    }
  }
}

/**
 * 모델 라우팅 UI 복원 (설정 로드 시 compactor/command/intent 공통)
 */
function restoreRoutingModelUI(prefix, modelType, modelName) {
  const typeSelect = document.getElementById(`${prefix}-model-type-select`);
  const submodelContainer = document.getElementById(
    `${prefix}-submodel-container`,
  );
  const apikeyContainer = document.getElementById(`${prefix}-apikey-container`);
  const submodelSelect = document.getElementById(`${prefix}-submodel-select`);
  const modelStatus = document.getElementById(`${prefix}-model-status`);

  if (typeSelect) typeSelect.value = modelType || "";

  if (!modelType) {
    if (submodelContainer) submodelContainer.style.display = "none";
    if (apikeyContainer) apikeyContainer.style.display = "none";
    if (modelStatus) {
      modelStatus.textContent = "";
    }
    return;
  }

  if (submodelContainer) submodelContainer.style.display = "block";
  if (apikeyContainer) apikeyContainer.style.display = "none";

  // 서브 모델 목록 채우기
  if (submodelSelect) {
    submodelSelect.innerHTML = "";
    const aiModels = cachedServerSettings["ai_model"] || [];

    if (modelType === "ollama") {
      const cache = window.routingOllamaModelsCache || [];
      if (cache.length > 0) {
        cache.forEach((name) => {
          const opt = document.createElement("option");
          opt.value = name;
          opt.textContent = name;
          submodelSelect.appendChild(opt);
        });
      } else {
        vscode.postMessage({ command: "getRoutingOllamaModels" });
        if (modelName) {
          const opt = document.createElement("option");
          opt.value = modelName;
          opt.textContent = modelName;
          submodelSelect.appendChild(opt);
        } else {
          const opt = document.createElement("option");
          opt.value = "";
          opt.textContent = "모델 로딩 중...";
          submodelSelect.appendChild(opt);
        }
      }
    } else if (modelType.startsWith("group:")) {
      const groupName = modelType.substring("group:".length);
      const groupModels = aiModels.filter(
        (s) => s.source === "preset" && (s.group || "default") === groupName,
      );
      groupModels.forEach((s) => {
        const opt = document.createElement("option");
        opt.value = s.key;
        opt.textContent = s.value?.name || s.key;
        submodelSelect.appendChild(opt);
      });
    } else if (modelType === "admin") {
      const adminModels = aiModels.filter(
        (s) => s.source === "admin" && s.value?.enabled !== false,
      );
      adminModels.forEach((s) => {
        const v = s.value || {};
        const opt = document.createElement("option");
        opt.value = s.key;
        const badge = s.enforcement === "required" ? " 🔒" : "";
        opt.textContent = `${v.model || v.model_name || v.name || s.key}${badge}`;
        submodelSelect.appendChild(opt);
      });
    }

    // 저장된 모델명 선택
    if (modelName) {
      const exists = Array.from(submodelSelect.options).some(
        (o) => o.value === modelName,
      );
      if (!exists) {
        const opt = document.createElement("option");
        opt.value = modelName;
        opt.textContent = modelName + " (저장됨)";
        submodelSelect.appendChild(opt);
      }
      submodelSelect.value = modelName;
    }
  }

  // 상태 표시
  if (modelStatus) {
    let typeLabel = modelType;
    if (modelType === "ollama") typeLabel = "Ollama";
    else if (modelType === "admin") typeLabel = "관리자";
    else if (modelType.startsWith("group:")) {
      const g = modelType.substring("group:".length);
      typeLabel = g.charAt(0).toUpperCase() + g.slice(1);
    }
    const modelInfo = modelName ? ` (${modelName})` : "";
    modelStatus.textContent = `현재: ${typeLabel}${modelInfo}`;
    modelStatus.className = "info-message success-message";
  }
}

/**
 * 지원 모델 설정 섹션 업데이트
 * @param {string} groupName - 그룹명
 * @param {string} [selectedKey] - 선택할 모델 key (없으면 첫번째 모델)
 */
function showSupportedModelSettings(groupName, selectedKey) {
  if (!supportedModelSection) return;

  const aiModels = cachedServerSettings["ai_model"] || [];
  const groupModels = aiModels.filter(
    (s) => s.source === "preset" && (s.group || "default") === groupName,
  );
  if (groupModels.length === 0) return;

  // pending key가 있으면 우선 사용
  const pendingKey = supportedModelSubselect?.getAttribute(
    "data-pending-supported-key",
  );
  const resolvedKey = selectedKey || pendingKey;
  if (pendingKey && supportedModelSubselect) {
    supportedModelSubselect.removeAttribute("data-pending-supported-key");
  }

  // 선택할 모델 결정 (지정된 key 또는 첫번째)
  const activePreset = resolvedKey
    ? groupModels.find((s) => s.key === resolvedKey) || groupModels[0]
    : groupModels[0];
  const v = activePreset.value || {};

  supportedModelSection.style.display = "block";
  currentSupportedModelKey = activePreset.key;

  // 제목: 그룹명
  if (supportedModelTitle) {
    const displayGroup = groupName.charAt(0).toUpperCase() + groupName.slice(1);
    supportedModelTitle.textContent = `${displayGroup} 설정`;
  }
  if (supportedModelDesc) {
    supportedModelDesc.textContent = `${groupName} 모델의 API 설정을 구성하세요.`;
  }

  // 모델 서브 셀렉트 (항상 표시)
  if (supportedModelSubselect && supportedModelSubselectGroup) {
    supportedModelSubselectGroup.style.display = "block";
    supportedModelSubselect.innerHTML = "";
    for (const s of groupModels) {
      const opt = document.createElement("option");
      opt.value = s.key;
      opt.textContent = s.value?.name || s.key;
      if (s.key === activePreset.key) opt.selected = true;
      supportedModelSubselect.appendChild(opt);
    }
  }

  // authType에 따라 API 키 입력 표시/숨김
  updateSupportedModelApiKeySection(v);

  // 해당 프로바이더의 API 키 설정 여부 조회
  if (vscode) {
    vscode.postMessage({
      command: "getProviderApiKeyStatus",
      provider: groupName,
    });
  }
}

/**
 * API 키 섹션 업데이트 (모델의 authType 기반)
 */
function updateSupportedModelApiKeySection(modelValue) {
  const authType = modelValue.authType || modelValue.auth_type || "bearer";
  if (supportedModelApikeyGroup) {
    supportedModelApikeyGroup.style.display =
      authType === "none" ? "none" : "block";
  }
}

/**
 * 스트리밍 토글 업데이트 (모델의 streamingSupported 기반)
 */
function updateStreamingToggle(modelValue) {
  if (!streamingToggle) return;
  const supported =
    modelValue?.streamingSupported ?? modelValue?.streaming_supported;
  if (supported === false || supported === "false") {
    streamingToggle.checked = false;
    streamingToggle.disabled = true;
    if (streamingStatus) {
      streamingStatus.textContent = "이 모델은 스트리밍을 지원하지 않습니다.";
      streamingStatus.className = "info-message";
    }
    vscode.postMessage({ command: "toggleStreaming", value: false });
  } else {
    streamingToggle.disabled = false;
    if (streamingStatus) {
      streamingStatus.textContent = "";
    }
  }
}

/**
 * 조직 권장 설정 토글 (사용/제외 전환)
 */
function toggleOrgSetting(category, key) {
  const settings = cachedServerSettings[category];
  if (!settings) return;
  const setting = settings.find((s) => s.key === key);
  if (!setting || setting.enforcement === "required") return;

  const newDisabled = !setting.is_disabled;
  if (vscode) {
    vscode.postMessage({
      command: "toggleServerSetting",
      category,
      key,
      disabled: newDisabled,
    });
  }
}

// 조직 설정 항목 클릭 이벤트 위임 (권장 설정 토글)
document.addEventListener("click", (e) => {
  const item = e.target.closest("[data-org-toggle-cat]");
  if (!item) return;
  const category = item.getAttribute("data-org-toggle-cat");
  const key = item.getAttribute("data-org-toggle-key");
  if (category && key) {
    toggleOrgSetting(category, key);
  }
});

// ===== 사이드바 네비게이션 =====
document.addEventListener("click", (e) => {
  const tab = e.target.closest(".settings-nav-item");
  if (!tab) return;
  const tabId = tab.getAttribute("data-tab");
  if (!tabId) return;

  // 사이드바 아이템 활성화
  document
    .querySelectorAll(".settings-nav-item")
    .forEach((t) => t.classList.remove("active"));
  tab.classList.add("active");

  // 탭 패널 표시
  document
    .querySelectorAll(".tab-panel")
    .forEach((p) => p.classList.remove("active"));
  const panel = document.getElementById(`tab-${tabId}`);
  if (panel) panel.classList.add("active");

  // 메인 헤더 제목 업데이트
  const title = document.getElementById("settings-title");
  const label = tab.querySelector("span");
  if (title && label) title.textContent = label.textContent;

  // 콘텐츠 영역 스크롤 최상단으로
  const main = document.querySelector(".settings-main");
  if (main) main.scrollTop = 0;
});

// 테마를 body에 적용하는 함수
function applyThemeToBody(theme) {
  if (theme === "auto") {
    // VS Code 테마 감지
    const isDark =
      document.body.classList.contains("vscode-dark") ||
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.body.setAttribute("data-theme", isDark ? "dark" : "light");
  } else {
    document.body.setAttribute("data-theme", theme);
  }
  console.log("[Settings] Theme applied to body:", theme);
}

// 초기 테마 요청
if (vscode) {
  vscode.postMessage({ command: "getChatTheme" });
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

const orchestrationToggle = document.getElementById("orchestration-toggle");
const orchestrationStatus = document.getElementById("orchestration-status");
const inlineCompletionToggle = document.getElementById(
  "inline-completion-toggle",
);
const inlineCompletionStatus = document.getElementById(
  "inline-completion-status",
);

const streamingToggle = document.getElementById("streaming-toggle");
const streamingStatus = document.getElementById("streaming-status");

const nativeToolCallingToggle = document.getElementById(
  "native-tool-calling-toggle",
);
const thinkingToggle = document.getElementById("thinking-toggle");
const thinkingLevelSelect = document.getElementById("thinking-level-select");

// 빌드/테스트 개인 설정 요소
const btTypeSelect = document.getElementById("bt-type-select");
const btLanguageSelect = document.getElementById("bt-language-select");
const btDescriptionInput = document.getElementById("bt-description-input");
const btCommandInput = document.getElementById("bt-command-input");
const btAddButton = document.getElementById("bt-add-button");
const btCancelButton = document.getElementById("bt-cancel-button");
const btAddToggleButton = document.getElementById("bt-add-toggle-button");
const btAddStatus = document.getElementById("bt-add-status");
const btListEmpty = document.getElementById("bt-list-empty");
const buildTestAddForm = document.getElementById("build-test-add-form");
const personalBuildTestList = document.getElementById(
  "personal-build-test-list",
);

// 토글 이벤트 바인딩 (모듈 함수 사용)
bindToggleEvents({
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
});

// 스피너 이벤트 바인딩 (모듈 함수 사용)
bindSpinnerEvents({
  testRetrySpinner,
  errorRetrySpinner,
  vscode,
});

// 빌드/테스트 개인 설정 이벤트 바인딩
function renderPersonalBuildTestList(settings) {
  if (!personalBuildTestList) return;
  if (!settings || settings.length === 0) {
    personalBuildTestList.innerHTML = "";
    if (btListEmpty) btListEmpty.style.display = "";
    return;
  }
  if (btListEmpty) btListEmpty.style.display = "none";
  let html = "";
  for (const s of settings) {
    const v = s.value || {};
    const typeLabel = s.key.includes("formatter") ? "포맷터" : "검증";
    const typeBg = "background: #2563eb; color: #fff;";
    html += `<div class="api-key-section" style="margin-bottom: 10px;">`;
    html += `<div style="display: flex; justify-content: space-between; align-items: center;">`;
    html += `<div style="display: flex; align-items: center; gap: 8px;">`;
    html += `<strong style="font-size: 0.9em;">${escapeHtml(s.description || v.command || s.key)}</strong>`;
    html += `<span style="font-size: 11px; padding: 1px 6px; border-radius: 3px; font-weight: 600; ${typeBg}">${escapeHtml(typeLabel)}</span>`;
    if (v.language) {
      html += `<span style="font-size: 11px; padding: 1px 6px; border-radius: 3px; background: #e3f2fd; color: #1565c0;">${escapeHtml(v.language)}</span>`;
    }
    html += `</div>`;
    html += `<button data-bt-delete-key="${escapeHtml(s.key)}" title="삭제">삭제</button>`;
    html += `</div>`;
    html += `<p style="margin-top: 5px; font-size: 0.85em; color: var(--vscode-descriptionForeground); font-family: monospace;">${escapeHtml(v.command || "")}</p>`;
    html += `</div>`;
  }
  personalBuildTestList.innerHTML = html;

  // 삭제 버튼 이벤트
  personalBuildTestList
    .querySelectorAll("[data-bt-delete-key]")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        if (vscode) {
          vscode.postMessage({
            command: "deleteBuildTestSetting",
            key: btn.getAttribute("data-bt-delete-key"),
          });
        }
      });
    });
}

function showBuildTestForm() {
  if (buildTestAddForm) buildTestAddForm.style.display = "";
  if (btAddToggleButton) btAddToggleButton.style.display = "none";
}
function hideBuildTestForm() {
  if (buildTestAddForm) buildTestAddForm.style.display = "none";
  if (btAddToggleButton) btAddToggleButton.style.display = "";
  if (btCommandInput) btCommandInput.value = "";
  if (btDescriptionInput) btDescriptionInput.value = "";
  if (btTypeSelect) btTypeSelect.selectedIndex = 0;
  if (btLanguageSelect) btLanguageSelect.selectedIndex = 0;
  if (btAddStatus) btAddStatus.textContent = "";
}

if (btAddToggleButton) {
  btAddToggleButton.addEventListener("click", showBuildTestForm);
}
if (btCancelButton) {
  btCancelButton.addEventListener("click", hideBuildTestForm);
}

if (btAddButton && btCommandInput && vscode) {
  btAddButton.addEventListener("click", () => {
    const command = btCommandInput.value.trim();
    if (!command) {
      if (btAddStatus) {
        btAddStatus.textContent = "명령어를 입력하세요.";
        btAddStatus.style.color = "#e53935";
      }
      return;
    }
    const type = btTypeSelect ? btTypeSelect.value : "validation_command";
    const language = btLanguageSelect ? btLanguageSelect.value : "";
    const description = btDescriptionInput
      ? btDescriptionInput.value.trim()
      : "";
    vscode.postMessage({
      command: "saveBuildTestSetting",
      type,
      language,
      description,
      value: command,
    });
  });
}

// API 키 관련 요소들

// 지원 모델 관련 요소들 (동적 — 서버 프리셋 기반)
const supportedModelSection = document.getElementById(
  "supported-model-section",
);
const supportedModelTitle = document.getElementById("supported-model-title");
const supportedModelDesc = document.getElementById("supported-model-desc");
const supportedModelSubselectGroup = document.getElementById(
  "supported-model-subselect-group",
);
const supportedModelSubselect = document.getElementById(
  "supported-model-subselect",
);
const supportedModelApikeyGroup = document.getElementById(
  "supported-model-apikey-group",
);
const supportedModelApiKeyInput = document.getElementById(
  "supported-model-api-key-input",
);
const saveSupportedModelApiKeyButton = document.getElementById(
  "save-supported-model-api-key-button",
);
const supportedModelStatus = document.getElementById("supported-model-status");

// 현재 선택된 지원 모델 키 추적
let currentSupportedModelKey = null;

// Ollama 설정 그룹
const ollamaSettingsGroup = document.getElementById("ollama-settings-group");

// Ollama 서버 타입 관련 요소들
const ollamaServerTypeSelect = document.getElementById(
  "ollama-server-type-select",
);
const saveOllamaServerTypeButton = document.getElementById(
  "save-ollama-server-type-button",
);
const ollamaServerTypeStatus = document.getElementById(
  "ollama-server-type-status",
);

// 로컬 Ollama API URL 관련 요소들
const localOllamaApiUrlInput = document.getElementById(
  "local-ollama-api-url-input",
);
const saveLocalOllamaApiUrlButton = document.getElementById(
  "save-local-ollama-api-url-button",
);
const localOllamaApiUrlStatus = document.getElementById(
  "local-ollama-api-url-status",
);

// 원격 서버 모델명 관련 요소들
const remoteOllamaModelInput = document.getElementById(
  "remote-ollama-model-input",
);
const saveRemoteOllamaModelButton = document.getElementById(
  "save-remote-ollama-model-button",
);
const remoteOllamaModelStatus = document.getElementById(
  "remote-ollama-model-status",
);

// 원격 서버 API URL 관련 요소들
const remoteOllamaApiUrlInput = document.getElementById(
  "remote-ollama-api-url-input",
);
const saveRemoteOllamaApiUrlButton = document.getElementById(
  "save-remote-ollama-api-url-button",
);
const remoteOllamaApiUrlStatus = document.getElementById(
  "remote-ollama-api-url-status",
);

// Ollama 모델 선택 관련 요소들
const ollamaModelSelect = document.getElementById("ollama-model-select");
const saveOllamaModelButton = document.getElementById(
  "save-ollama-model-button",
);
const ollamaModelStatus = document.getElementById("ollama-model-status");

// AI 모델 선택 관련 요소들
const aiModelSelect = document.getElementById("ai-model-select");
const saveAiModelButton = document.getElementById("save-ai-model-button");
const aiModelStatus = document.getElementById("ai-model-status");
const sourcePathStatus = document.getElementById("source-path-status");
const sourcePathsList = document.getElementById("source-paths-list");
// (legacy settings sections removed — replaced by supported-model-section)
const localOllamaSettingsSection = document.getElementById(
  "local-ollama-settings-section",
);
const remoteOllamaSettingsSection = document.getElementById(
  "remote-ollama-settings-section",
);

let storedOllamaModel = null; // 저장된 Ollama 모델 값
let currentSettingsOllamaModel = null; // currentSettings에서 받은 Ollama 모델 값

// 저장 버튼들의 활성화/비활성화를 제어하는 함수
function updateSaveButtonsState() {
  const allButtons = [
    saveSupportedModelApiKeyButton,
    saveLocalOllamaApiUrlButton,
    saveRemoteOllamaModelButton,
    saveRemoteOllamaApiUrlButton,
    saveOllamaServerTypeButton,
    saveOllamaModelButton,
  ];

  allButtons.forEach((button) => {
    if (button) {
      button.disabled = false;
      button.style.opacity = "1";
      button.style.cursor = "pointer";
    }
  });
}

// 언어별 텍스트 로딩 및 적용
const languageSelect = document.getElementById("language-select");
const saveLanguageButton = document.getElementById("save-language-button");
let currentLanguage = "ko"; // 기본값
let languageData = {};

async function loadLanguage(lang) {
  try {
    // 확장 프로그램에 언어 데이터 요청
    vscode.postMessage({ command: "getLanguageData", language: lang });
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
  const aiModelSettingsDescription = document.querySelector(
    "#api-key-section-title + p",
  );
  if (
    aiModelSettingsDescription &&
    languageData["aiModelSettingsDescription"]
  ) {
    aiModelSettingsDescription.textContent =
      languageData["aiModelSettingsDescription"];
  }

  // (legacy API key UI sections removed — now using supported-model-section)

  // 공통 저장 버튼들
  document.querySelectorAll(".save-button").forEach((btn) => {
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
  const autoUpdateEnabledText = document.getElementById(
    "auto-update-enabled-text",
  );
  if (autoUpdateEnabledText && languageData["autoUpdateEnabled"]) {
    autoUpdateEnabledText.textContent = languageData["autoUpdateEnabled"];
  }

  // 기타 설명 텍스트들 (p 태그들) - 더 정확한 매칭으로 개선
  const infoMessages = document.querySelectorAll(".info-message");
  infoMessages.forEach((msg) => {
    const text = msg.textContent;
    if (
      text &&
      (text.includes(
        "AgentGoCoder가 AI 응답을 생성할 때 참조할 소스 코드 경로 목록입니다",
      ) ||
        text.includes(
          "This is a list of source code paths that AgentGoCoder will reference",
        ) ||
        text.includes(
          "Esta es una lista de rutas de código fuente que AgentGoCoder referenciará",
        ) ||
        text.includes(
          "Ceci est une liste de chemins de code source que AgentGoCoder référencera",
        ) ||
        text.includes(
          "这是 AgentGoCoder 在生成 AI 响应时将引用的源代码路径列表",
        ) ||
        text.includes(
          "これは、AgentGoCoderがAI応答を生成する際に参照するソースコードパスのリストです",
        ))
    ) {
      // 소스 경로 설명
      if (languageData["sourcePathDescription"]) {
        msg.textContent = languageData["sourcePathDescription"];
      }
    } else if (
      text &&
      (text.includes(
        "LLM이 제안한 코드를 기반으로 파일을 자동으로 업데이트할지 여부를 설정합니다",
      ) ||
        text.includes(
          "Set whether to automatically update files based on code suggested by the LLM",
        ) ||
        text.includes(
          "Establece si actualizar automáticamente archivos basándose en código sugerido por el LLM",
        ) ||
        text.includes(
          "Définissez s'il faut mettre à jour automatiquement les fichiers en fonction du code suggéré par le LLM",
        ) ||
        text.includes("设置是否基于 LLM 建议的代码自动更新文件") ||
        text.includes(
          "LLMが提案したコードに基づいてファイルを自動更新するかどうかを設定します",
        ))
    ) {
      // 자동 업데이트 설명
      if (languageData["autoUpdateDescription"]) {
        msg.textContent = languageData["autoUpdateDescription"];
      }
    } else if (
      text &&
      (text.includes("설정 변경은 즉시 저장됩니다") ||
        text.includes("Settings are saved immediately when changed") ||
        text.includes(
          "La configuración se guarda inmediatamente cuando se cambia",
        ) ||
        text.includes(
          "Les paramètres sont enregistrés immédiatement lors de la modification",
        ) ||
        text.includes("设置更改时立即保存") ||
        text.includes("設定は変更時に即座に保存されます") ||
        text.includes(
          "Einstellungen werden sofort gespeichert, wenn sie geändert werden",
        ))
    ) {
      // 설정 저장 설명
      if (languageData["settingsSavedImmediately"]) {
        msg.textContent = languageData["settingsSavedImmediately"];
      }
    } else if (
      text &&
      (text.includes("AI 코드 생성 및 분석 기능을 활성화합니다") ||
        text.includes("Enables AI code generation and analysis features") ||
        text.includes(
          "Habilita las funciones de generación y análisis de código de IA",
        ) ||
        text.includes(
          "Active les fonctionnalités de génération et d'analyse de code IA",
        ) ||
        text.includes("启用 AI 代码生成和分析功能") ||
        text.includes("AIコード生成と分析機能を有効にします"))
    ) {
      // AI 기능 설명
      if (
        languageData["geminiApiFunctionDescription"] ||
        languageData["aiFunctionDescription"]
      ) {
        msg.textContent =
          languageData["aiFunctionDescription"] ||
          languageData["geminiApiFunctionDescription"];
      }
    } else if (
      text &&
      (text.includes(
        "실시간 정보 기능을 사용하기 위한 외부 API 키들을 설정합니다",
      ) ||
        text.includes(
          "Set external API keys to use real-time information features",
        ) ||
        text.includes(
          "Establece claves API externas para usar funciones de información en tiempo real",
        ) ||
        text.includes(
          "Définissez les clés API externes pour utiliser les fonctionnalités d'information en temps réel",
        ) ||
        text.includes("设置外部 API 密钥以使用实时信息功能") ||
        text.includes(
          "リアルタイム情報機能を使用するための外部APIキーを設定します",
        ))
    ) {
      // 외부 API 키 설명
      if (languageData["externalApiKeysDescription"]) {
        msg.textContent = languageData["externalApiKeysDescription"];
      }
    }
  });

  // 로딩 텍스트 업데이트 (언어 데이터가 로드된 후) - 더 포괄적인 매칭 추가
  if (languageData["settingsLoading"] && sourcePathStatus) {
    const currentText = sourcePathStatus.textContent;
    if (
      currentText === "설정 로드 중..." ||
      currentText === "Loading settings..." ||
      currentText === "Cargando configuración..." ||
      currentText === "Chargement des paramètres..." ||
      currentText === "正在加载设置..." ||
      currentText === "設定を読み込み中..." ||
      currentText === "Lade Einstellungen..."
    ) {
      sourcePathStatus.textContent = languageData["settingsLoading"];
    }
  }

  // 소스 경로 리스트 업데이트 (언어 데이터가 로드된 후)
  if (sourcePathsList) {
    const currentItems = sourcePathsList.querySelectorAll(".path-item");
    if (currentItems.length === 1) {
      const itemText = currentItems[0].textContent;
      if (
        itemText.includes("지정된 경로 없음") ||
        itemText.includes("No paths specified") ||
        itemText.includes("No se especificaron rutas") ||
        itemText.includes("Aucun chemin spécifié") ||
        itemText.includes("未指定路径") ||
        itemText.includes("パスが指定されていません") ||
        itemText.includes("Keine Pfade angegeben")
      ) {
        // 현재 "지정된 경로 없음" 상태라면 언어 변경 시 업데이트
        updateSourcePathsList([]);
      }
    }
  }

  // (legacy API description/registration UI removed)

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
  const ollamaApiSetupMethod = document.querySelector(
    "#ollama-api-label + p + p",
  );
  if (ollamaApiSetupMethod && languageData["ollamaApiSetupMethod"]) {
    ollamaApiSetupMethod.textContent = languageData["ollamaApiSetupMethod"];
  }

  // Ollama 저장 버튼
  const saveOllamaApiUrlButton = document.getElementById(
    "save-ollama-api-url-button",
  );
  if (saveOllamaApiUrlButton && languageData["saveOllamaApiUrlButton"]) {
    saveOllamaApiUrlButton.textContent = languageData["saveOllamaApiUrlButton"];
  }

  // AI 모델 선택 라벨
  const aiModelSelectLabel = document.getElementById("ai-model-select-label");
  if (aiModelSelectLabel && languageData["aiModelSelectLabel"]) {
    aiModelSelectLabel.innerHTML = `<b>${languageData["aiModelSelectLabel"]}</b>`;
  }

  // AI 모델 선택 옵션들
  const aiModelSelect = document.getElementById("ai-model-select");
  if (aiModelSelect && languageData["ollamaOption"]) {
    const ollamaOption = aiModelSelect.querySelector('option[value="ollama"]');
    if (ollamaOption) {
      ollamaOption.textContent = languageData["ollamaOption"];
    }
  }
  if (aiModelSelect && languageData["adminOption"]) {
    const adminOption = aiModelSelect.querySelector('option[value="admin"]');
    if (adminOption) {
      adminOption.textContent = languageData["adminOption"];
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
  // Ollama API URL 입력 필드
  const localOllamaApiUrlInput = document.getElementById(
    "local-ollama-api-url-input",
  );
  const remoteOllamaApiUrlInput = document.getElementById(
    "remote-ollama-api-url-input",
  );
  if (localOllamaApiUrlInput && languageData["pleaseEnterOllamaApiUrl"]) {
    localOllamaApiUrlInput.placeholder =
      languageData["pleaseEnterOllamaApiUrl"];
  }
  if (remoteOllamaApiUrlInput && languageData["pleaseEnterOllamaApiUrl"]) {
    remoteOllamaApiUrlInput.placeholder =
      languageData["pleaseEnterOllamaApiUrl"];
  }

  // 모든 상태 메시지 업데이트
  // Ollama API URL 상태
  const localOllamaApiUrlStatus = document.getElementById(
    "local-ollama-api-url-status",
  );
  const remoteOllamaApiUrlStatus = document.getElementById(
    "remote-ollama-api-url-status",
  );

  if (localOllamaApiUrlStatus && localOllamaApiUrlStatus.textContent) {
    const currentText = localOllamaApiUrlStatus.textContent;
    if (
      currentText.includes("설정되어 있습니다") ||
      currentText.includes("is set") ||
      currentText.includes("ist festgelegt") ||
      currentText.includes("está configurada") ||
      currentText.includes("est définie") ||
      currentText.includes("設定されています") ||
      currentText.includes("已设置")
    ) {
      localOllamaApiUrlStatus.textContent =
        languageData["ollamaApiUrlSet"] ||
        "Ollama API URL이 설정되어 있습니다.";
    } else if (
      currentText.includes("설정되지 않았습니다") ||
      currentText.includes("not set") ||
      currentText.includes("nicht festgelegt") ||
      currentText.includes("no está configurada") ||
      currentText.includes("n'est pas définie") ||
      currentText.includes("設定されていません") ||
      currentText.includes("未设置")
    ) {
      localOllamaApiUrlStatus.textContent =
        languageData["ollamaApiUrlNotSet"] ||
        "Ollama API URL이 설정되지 않았습니다.";
    }
  }

  if (remoteOllamaApiUrlStatus && remoteOllamaApiUrlStatus.textContent) {
    const currentText = remoteOllamaApiUrlStatus.textContent;
    if (
      currentText.includes("설정되어 있습니다") ||
      currentText.includes("is set") ||
      currentText.includes("ist festgelegt") ||
      currentText.includes("está configurada") ||
      currentText.includes("est définie") ||
      currentText.includes("設定されています") ||
      currentText.includes("已设置")
    ) {
      remoteOllamaApiUrlStatus.textContent =
        languageData["ollamaApiUrlSet"] ||
        "Ollama API URL이 설정되어 있습니다.";
    } else if (
      currentText.includes("설정되지 않았습니다") ||
      currentText.includes("not set") ||
      currentText.includes("nicht festgelegt") ||
      currentText.includes("no está configurada") ||
      currentText.includes("n'est pas définie") ||
      currentText.includes("設定されていません") ||
      currentText.includes("未设置")
    ) {
      remoteOllamaApiUrlStatus.textContent =
        languageData["ollamaApiUrlNotSet"] ||
        "Ollama API URL이 설정되지 않았습니다.";
    }
  }
}

if (languageSelect) {
  languageSelect.addEventListener("change", (e) => {
    const lang = e.target.value;
    console.log("Language changed to:", lang);

    // 언어 데이터 로드 요청
    loadLanguage(lang);

    // 언어 저장 요청
    vscode.postMessage({ command: "saveLanguage", language: lang });

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
        vscode.postMessage({ command: "saveAiModel", model: selectedModel });
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
    vscode.postMessage({ command: "saveLanguage", language: selectedLang });

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
    vscode.postMessage({ command: "saveChatTheme", theme: selectedTheme });

    // 상태 표시
    if (themeStatus) {
      const themeLabels = { dark: "다크", light: "라이트", auto: "자동" };
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
      ollamaServerType: selectedType,
    });
    const savingText = "Ollama 서버 타입 저장 중...";
    showStatus(ollamaServerTypeStatus, savingText, "info");
  });
}

// API 키 저장 이벤트 리스너들

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
          apiUrl: apiUrl,
        });
        const savingText =
          languageData["ollamaApiUrlSaving"] ||
          "로컬 Ollama API URL 저장 중...";
        showStatus(localOllamaApiUrlStatus, savingText, "info");
      } catch (error) {
        const invalidUrlText =
          languageData["invalidUrlFormat"] ||
          "올바른 URL 형식을 입력해주세요. (예: http://localhost:11434)";
        showStatus(localOllamaApiUrlStatus, invalidUrlText, "error");
      }
    } else {
      const pleaseEnterText =
        languageData["pleaseEnterOllamaApiUrl"] ||
        "로컬 Ollama API URL을 입력해주세요.";
      showStatus(localOllamaApiUrlStatus, pleaseEnterText, "error");
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
          apiUrl: apiUrl,
        });
        const savingText =
          languageData["ollamaApiUrlSaving"] || "원격 서버 API URL 저장 중...";
        showStatus(remoteOllamaApiUrlStatus, savingText, "info");
      } catch (error) {
        const invalidUrlText =
          languageData["invalidUrlFormat"] ||
          "올바른 URL 형식을 입력해주세요. (예: http://192.168.1.100:11434)";
        showStatus(remoteOllamaApiUrlStatus, invalidUrlText, "error");
      }
    } else {
      const pleaseEnterText =
        languageData["pleaseEnterOllamaApiUrl"] ||
        "원격 서버 API URL을 입력해주세요.";
      showStatus(remoteOllamaApiUrlStatus, pleaseEnterText, "error");
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
        ollamaServerType: serverType,
      });
      const savingText =
        languageData["ollamaServerTypeSaving"] || "Ollama 서버 타입 저장 중...";
      showStatus(ollamaServerTypeStatus, savingText, "info");
    } else {
      const pleaseSelectText =
        languageData["pleaseSelectOllamaServerType"] ||
        "Ollama 서버 타입을 선택해주세요.";
      showStatus(ollamaServerTypeStatus, pleaseSelectText, "error");
    }
  });
}

// Ollama 모델 저장 이벤트 리스너
if (saveOllamaModelButton) {
  saveOllamaModelButton.addEventListener("click", () => {
    const model = ollamaModelSelect.value;
    if (model) {
      vscode.postMessage({ command: "saveOllamaModel", model: model });
      const savingText = "Ollama 모델 저장 중...";
      showStatus(ollamaModelStatus, savingText, "info");
    } else {
      // console.log('No model selected, showing error');
      showStatus(ollamaModelStatus, "모델을 선택해주세요.", "error");
    }
    // 선택 변경 시에도 즉시 저장(자동 저장)
    try {
      if (aiModelStatus) {
        aiModelStatus.textContent = "AI 모델 자동 저장 중...";
        aiModelStatus.className = "info-message";
      }
      if (aiModelSelect && aiModelSelect.value) {
        const selectedModel = aiModelSelect.value;
        vscode.postMessage({ command: "saveAiModel", model: selectedModel });
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
      serialNumber: serialNumber,
    });
  });
}

// 원격 서버 모델명 저장 이벤트 리스너
if (saveRemoteOllamaModelButton) {
  saveRemoteOllamaModelButton.addEventListener("click", () => {
    const model = remoteOllamaModelInput.value.trim();
    if (model) {
      vscode.postMessage({ command: "saveRemoteOllamaModel", model: model });
      const savingText = "원격 서버 모델명 저장 중...";
      showStatus(remoteOllamaModelStatus, savingText, "info");
    } else {
      showStatus(remoteOllamaModelStatus, "모델명을 입력해주세요.", "error");
    }
  });
}

// AI 모델 선택 이벤트 리스너
if (aiModelSelect) {
  aiModelSelect.addEventListener("change", () => {
    const selectedModel = aiModelSelect.value;
    const adminSettingsSection = document.getElementById(
      "admin-settings-section",
    );

    // 모든 설정 섹션 초기 숨김
    function hideAllModelSections() {
      if (supportedModelSection) {
        supportedModelSection.style.display = "none";
      }
      if (ollamaSettingsGroup) {
        ollamaSettingsGroup.style.display = "none";
      }
      if (adminSettingsSection) {
        adminSettingsSection.style.display = "none";
      }
    }

    // 선택된 모델에 따라 설정 섹션 활성화/비활성화 및 표시 제어
    if (selectedModel === "admin") {
      hideAllModelSections();
      if (adminSettingsSection) {
        adminSettingsSection.style.display = "block";
      }
    } else if (selectedModel.startsWith("group:")) {
      hideAllModelSections();
      // 그룹 선택 → 지원 모델 설정 표시
      const groupName = selectedModel.substring("group:".length);
      showSupportedModelSettings(groupName);
    } else if (selectedModel === "ollama") {
      hideAllModelSections();
      if (ollamaSettingsGroup) {
        ollamaSettingsGroup.style.display = "block";
      }

      // Ollama 선택 시 서버 타입에 따라 활성 섹션 결정
      const serverType = ollamaServerTypeSelect
        ? ollamaServerTypeSelect.value
        : "local";
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
    // admin은 서브 드롭다운에서 모델 선택 시 저장
    // group:xxx는 서브 드롭다운에서 모델 선택 시 저장 (첫번째 모델 자동 저장)
    if (!isLoadingSettings && selectedModel !== "admin") {
      try {
        let modelToSave = selectedModel;
        if (selectedModel.startsWith("group:")) {
          // 그룹 선택 → 현재 서브 셀렉트의 첫번째 모델 저장
          modelToSave = currentSupportedModelKey
            ? `supported:${currentSupportedModelKey}`
            : null;
        }
        if (modelToSave) {
          if (aiModelStatus) {
            aiModelStatus.textContent = "AI 모델 자동 저장 중...";
            aiModelStatus.className = "info-message";
          }
          vscode.postMessage({ command: "saveAiModel", model: modelToSave });
        }
      } catch (e) {
        console.warn("Failed to autosave AI model:", e);
      }
    }
  });
}

// 관리자 모델 서브 드롭다운 이벤트 리스너
const adminModelSelect = document.getElementById("admin-model-select");
const adminModelStatus = document.getElementById("admin-model-status");
if (adminModelSelect) {
  adminModelSelect.addEventListener("change", () => {
    const selectedKey = adminModelSelect.value;
    if (!selectedKey) return;
    try {
      if (adminModelStatus) {
        adminModelStatus.textContent = "관리자 모델 저장 중...";
        adminModelStatus.className = "info-message";
      }
      // admin:key 형식으로 저장
      vscode.postMessage({
        command: "saveAiModel",
        model: `admin:${selectedKey}`,
      });
    } catch (e) {
      console.warn("Failed to autosave admin model:", e);
    }
  });
}

// 지원 모델 서브셀렉트 이벤트 리스너
if (supportedModelSubselect) {
  supportedModelSubselect.addEventListener("change", () => {
    const newKey = supportedModelSubselect.value;
    if (!newKey) return;
    currentSupportedModelKey = newKey;
    // 선택된 모델의 authType에 따라 API 키 섹션 업데이트
    const aiModels = cachedServerSettings["ai_model"] || [];
    const preset = aiModels.find((s) => s.key === newKey);
    if (preset) {
      updateSupportedModelApiKeySection(preset.value || {});
    }
    if (!isLoadingSettings) {
      vscode.postMessage({
        command: "saveAiModel",
        model: `supported:${newKey}`,
      });
    }
  });
}

// 지원 모델 API 키 저장
if (saveSupportedModelApiKeyButton) {
  saveSupportedModelApiKeyButton.addEventListener("click", () => {
    const apiKey = supportedModelApiKeyInput
      ? supportedModelApiKeyInput.value.trim()
      : "";
    if (!apiKey) {
      if (supportedModelStatus) {
        supportedModelStatus.textContent = "API 키를 입력해주세요.";
        supportedModelStatus.className = "info-message error-message";
      }
      return;
    }
    if (!currentSupportedModelKey) return;

    // 프로바이더별 API 키 저장 (그룹명 포함)
    const aiModels = cachedServerSettings["ai_model"] || [];
    const currentPreset = aiModels.find(
      (s) => s.key === currentSupportedModelKey,
    );
    const providerGroup = currentPreset?.group || "";
    vscode.postMessage({
      command: "saveProviderApiKey",
      apiKey: apiKey,
      provider: providerGroup,
    });

    if (supportedModelStatus) {
      supportedModelStatus.textContent = "API 키 저장 중...";
      supportedModelStatus.className = "info-message";
    }
  });
}

// AI 모델 저장 버튼 이벤트 리스너
if (saveAiModelButton) {
  saveAiModelButton.addEventListener("click", () => {
    const selectedModel = aiModelSelect.value;
    console.log(
      "[Settings] Save AI Model button clicked. selectedModel =",
      selectedModel,
    );

    if (aiModelStatus) {
      aiModelStatus.textContent = "AI 모델 저장 중...";
      aiModelStatus.className = "info-message";
    }

    // 확장 프로그램에 선택된 모델 저장 요청
    vscode.postMessage({ command: "saveAiModel", model: selectedModel });
  });
}

// 확장으로부터 메시지 수신
window.addEventListener("message", (event) => {
  const message = event.data;
  switch (message.command) {
    case "aiModelSaved": {
      console.log("[Settings] aiModelSaved received from extension.");
      if (aiModelStatus) {
        aiModelStatus.textContent = "AI 모델이 저장되었습니다.";
        aiModelStatus.className = "info-message success-message";
      }
      const _adminStatus = document.getElementById("admin-model-status");
      if (_adminStatus && aiModelSelect && aiModelSelect.value === "admin") {
        _adminStatus.textContent = "관리자 모델이 저장되었습니다.";
        _adminStatus.className = "info-message success-message";
      }
      break;
    }
    case "aiModelSaveError": {
      console.warn(
        "[Settings] aiModelSaveError received from extension:",
        message.error,
      );
      if (aiModelStatus) {
        aiModelStatus.textContent = `AI 모델 저장 실패: ${message.error}`;
        aiModelStatus.className = "error-message";
      }
      const _adminErrStatus = document.getElementById("admin-model-status");
      if (_adminErrStatus && aiModelSelect && aiModelSelect.value === "admin") {
        _adminErrStatus.textContent = `저장 실패: ${message.error}`;
        _adminErrStatus.className = "info-message error-message";
      }
      break;
    }
    case "adminModelSaved":
      if (supportedModelStatus) {
        supportedModelStatus.textContent = "모델이 저장되었습니다.";
        supportedModelStatus.className = "info-message success-message";
      }
      break;
    case "adminModelSaveError":
      if (supportedModelStatus) {
        supportedModelStatus.textContent = `모델 저장 실패: ${message.error}`;
        supportedModelStatus.className = "info-message error-message";
      }
      break;
    case "providerApiKeySaved":
      if (supportedModelStatus) {
        supportedModelStatus.textContent = "API 키가 저장되었습니다.";
        supportedModelStatus.className = "info-message success-message";
      }
      if (supportedModelApiKeyInput) {
        supportedModelApiKeyInput.value = "";
        supportedModelApiKeyInput.placeholder =
          "API 키가 설정되었습니다. (변경하려면 새 키를 입력하세요)";
      }
      break;
    case "providerApiKeySaveError":
      if (supportedModelStatus) {
        supportedModelStatus.textContent = `API 키 저장 실패: ${message.error}`;
        supportedModelStatus.className = "info-message error-message";
      }
      break;
    case "providerApiKeyStatus":
      // 프로바이더 API 키 설정 여부 표시
      if (supportedModelApiKeyInput) {
        if (message.hasKey) {
          supportedModelApiKeyInput.placeholder =
            "API 키가 설정되었습니다. (변경하려면 새 키를 입력하세요)";
        } else {
          supportedModelApiKeyInput.placeholder = "API 키를 입력하세요.";
        }
        supportedModelApiKeyInput.value = "";
      }
      if (supportedModelStatus) {
        supportedModelStatus.textContent = "";
      }
      break;
    case "ollamaModels": {
      // console.log('[Settings] Received ollamaModels message:', message);
      const sel = document.getElementById("ollama-model-select");
      if (sel) {
        // 현재 선택된 모델 저장
        const currentModel = sel.value;

        sel.innerHTML = "";
        if (Array.isArray(message.models)) {
          message.models.forEach((name) => {
            const opt = document.createElement("option");
            opt.value = name;
            opt.textContent = name;
            sel.appendChild(opt);
          });
        }

        const modelToApply = currentSettingsOllamaModel || storedOllamaModel;
        if (modelToApply && modelToApply !== "") {
          const options = Array.from(sel.options).map((o) => o.value);
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
        } else if (sel.options.length > 0) {
          // 저장된 모델이 없으면 첫 번째 모델 자동 선택
          sel.value = sel.options[0].value;
        }
      }

      break;
    }
    case "routingOllamaModels": {
      // 라우팅 모델용 Ollama 모델 리스트 수신
      console.log(
        "[Settings] Received routingOllamaModels message:",
        message.models?.length || 0,
        "개",
      );
      if (Array.isArray(message.models)) {
        // 캐시 업데이트 (window scope에서 접근 가능하도록)
        window.routingOllamaModelsCache = message.models;

        // 현재 ollama가 선택된 모든 라우팅 모델 셀렉트 업데이트
        const prefixes = [
          "compactor",
          "command",
          "intent",
          "completion",
          "error-fallback",
        ];
        prefixes.forEach((prefix) => {
          const typeSelect = document.getElementById(
            `${prefix}-model-type-select`,
          );
          const submodelSelect = document.getElementById(
            `${prefix}-submodel-select`,
          );
          if (typeSelect && typeSelect.value === "ollama" && submodelSelect) {
            // 현재 선택된 값 저장
            const currentValue = submodelSelect.value;

            // 옵션 업데이트
            submodelSelect.innerHTML = "";
            message.models.forEach((name) => {
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
          const options = Array.from(sel.options).map((o) => o.value);
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
      if (
        typeof message.autoDeleteFilesEnabled === "boolean" &&
        autoDeleteToggle
      ) {
        autoDeleteToggle.checked = message.autoDeleteFilesEnabled;
      }
      if (typeof message.errorRetryCount === "number" && errorRetrySpinner) {
        errorRetrySpinner.value = message.errorRetryCount;
      }
      if (
        typeof message.autoExecuteCommandsEnabled === "boolean" &&
        autoExecuteToggle
      ) {
        autoExecuteToggle.checked = message.autoExecuteCommandsEnabled;
      }
      if (typeof message.blockOutsideProjectEnabled === "boolean") {
        const blockToggle = document.getElementById(
          "block-outside-project-toggle",
        );
        if (blockToggle)
          blockToggle.checked = message.blockOutsideProjectEnabled;
      }
      if (
        typeof message.autoToolExecutionEnabled === "boolean" &&
        autoToolToggle
      ) {
        autoToolToggle.checked = message.autoToolExecutionEnabled;
      }
      if (
        typeof message.orchestrationEnabled === "boolean" &&
        orchestrationToggle
      ) {
        orchestrationToggle.checked = message.orchestrationEnabled;
      }
      if (
        typeof message.inlineCompletionEnabled === "boolean" &&
        inlineCompletionToggle
      ) {
        inlineCompletionToggle.checked = message.inlineCompletionEnabled;
      }
      if (typeof message.streamingEnabled === "boolean" && streamingToggle) {
        streamingToggle.checked = message.streamingEnabled;
      }
      if (
        typeof message.nativeToolCallingEnabled === "boolean" &&
        nativeToolCallingToggle
      ) {
        nativeToolCallingToggle.checked = message.nativeToolCallingEnabled;
      }
      if (typeof message.thinkingEnabled === "boolean" && thinkingToggle) {
        thinkingToggle.checked = message.thinkingEnabled;
      }
      if (message.thinkingLevel && thinkingLevelSelect) {
        thinkingLevelSelect.value = message.thinkingLevel;
      }
      if (
        typeof message.autoCorrectionEnabled === "boolean" &&
        autoCorrectionToggle
      ) {
        autoCorrectionToggle.checked = message.autoCorrectionEnabled;
      }
      if (
        typeof message.autoTestRetryEnabled === "boolean" &&
        autoTestRetryToggle
      ) {
        autoTestRetryToggle.checked = message.autoTestRetryEnabled;
      }
      if (typeof message.testRetryCount === "number" && testRetrySpinner) {
        testRetrySpinner.value = message.testRetryCount;
      }

      // ===== 빌드/테스트 개인 설정 적용 =====
      if (Array.isArray(message.personalBuildTestSettings)) {
        renderPersonalBuildTestList(message.personalBuildTestSettings);
      }

      // ===== 오류 보고 상태 적용 =====
      if (typeof message.errorReportingEnabled === "boolean") {
        const errToggle = document.getElementById("error-reporting-toggle");
        if (errToggle) errToggle.checked = message.errorReportingEnabled;
      }

      // ===== AI 모델 설정 적용 =====
      if (aiModelSelect && typeof message.aiModel === "string") {
        // 저장된 모델을 UI 표시용으로 변환
        let displayModel = message.aiModel;
        if (message.aiModel.startsWith("ollama")) {
          displayModel = "ollama";
        } else if (message.aiModel.startsWith("supported:")) {
          const sk = message.aiModel.substring("supported:".length);
          const gn = findGroupForSupportedKey(sk);
          if (gn) {
            displayModel = `group:${gn}`;
            if (supportedModelSubselect) {
              supportedModelSubselect.setAttribute(
                "data-pending-supported-key",
                sk,
              );
            }
          }
        }

        aiModelSelect.value = displayModel;

        // 모델에 따라 섹션 활성화/비활성화
        if (displayModel === "ollama") {
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
      if (
        ollamaServerTypeSelect &&
        typeof message.ollamaServerType === "string"
      ) {
        ollamaServerTypeSelect.value = message.ollamaServerType || "local";
        const setText =
          message.ollamaServerType === "remote"
            ? languageData["ollamaServerTypeRemoteSet"] ||
              "Ollama 서버 타입: 원격 서버"
            : languageData["ollamaServerTypeLocalSet"] ||
              "Ollama 서버 타입: 로컬 머신";
        showStatus(ollamaServerTypeStatus, setText, "success");

        // AI 모델이 'ollama'인 경우에만 섹션 활성화/비활성화
        const currentAiModel = aiModelSelect ? aiModelSelect.value : "ollama";
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
      if (
        localOllamaApiUrlInput &&
        typeof message.localOllamaApiUrl === "string"
      ) {
        localOllamaApiUrlInput.value = message.localOllamaApiUrl || "";
        const txt = message.localOllamaApiUrl
          ? languageData["ollamaApiUrlSet"] ||
            "Ollama API URL이 설정되어 있습니다."
          : languageData["ollamaApiUrlNotSet"] ||
            "Ollama API URL이 설정되지 않았습니다.";
        if (localOllamaApiUrlStatus) {
          showStatus(
            localOllamaApiUrlStatus,
            txt,
            message.localOllamaApiUrl ? "success" : "info",
          );
        }
      }
      // 원격 Ollama 저장값 적용
      if (
        remoteOllamaApiUrlInput &&
        typeof message.remoteOllamaApiUrl === "string"
      ) {
        remoteOllamaApiUrlInput.value = message.remoteOllamaApiUrl || "";
        const txt = message.remoteOllamaApiUrl
          ? languageData["ollamaApiUrlSet"] ||
            "Ollama API URL이 설정되어 있습니다."
          : languageData["ollamaApiUrlNotSet"] ||
            "Ollama API URL이 설정되지 않았습니다.";
        if (remoteOllamaApiUrlStatus) {
          showStatus(
            remoteOllamaApiUrlStatus,
            txt,
            message.remoteOllamaApiUrl ? "success" : "info",
          );
        }
      }
      if (
        remoteOllamaModelInput &&
        typeof message.remoteOllamaModel === "string"
      ) {
        remoteOllamaModelInput.value = message.remoteOllamaModel || "";
        const txt = message.remoteOllamaModel
          ? languageData["ollamaModelSet"] ||
            `원격 서버 모델이 설정되어 있습니다: ${message.remoteOllamaModel}`
          : languageData["ollamaModelNotSet"] ||
            "원격 서버 모델이 설정되지 않았습니다.";
        if (remoteOllamaModelStatus) {
          showStatus(
            remoteOllamaModelStatus,
            txt,
            message.remoteOllamaModel ? "success" : "info",
          );
        }
      }

      // ===== 서버(조직) 설정 렌더링 (모델 라우팅 복원 전에 먼저 실행해야 group 옵션이 채워짐) =====
      if (
        message.serverSettings &&
        typeof message.serverSettings === "object"
      ) {
        cachedServerSettings = message.serverSettings;
        renderAllOrgSettings();
      }

      // 모델 라우팅 설정 적용 (populateRoutingModelOptions 이후에 실행해야 group 옵션이 존재함)
      restoreRoutingModelUI(
        "compactor",
        message.compactorModelType,
        message.compactorModelName,
      );
      restoreRoutingModelUI(
        "command",
        message.commandModelType,
        message.commandModelName,
      );
      restoreRoutingModelUI(
        "intent",
        message.intentModelType,
        message.intentModelName,
      );
      restoreRoutingModelUI(
        "subagent",
        message.subagentModelType,
        message.subagentModelName,
      );
      restoreRoutingModelUI(
        "completion",
        message.completionModelType,
        message.completionModelName,
      );
      restoreRoutingModelUI(
        "error-fallback",
        message.errorFallbackModelType,
        message.errorFallbackModelName,
      );

      // ===== AI 모델 드롭박스 설정 (option 동적 추가 후 실행) =====
      if (message.aiModel && aiModelSelect) {
        if (message.aiModel.startsWith("admin:")) {
          aiModelSelect.value = "admin";
          const adminSubSelect = document.getElementById("admin-model-select");
          if (adminSubSelect) {
            const adminKey = message.aiModel.substring("admin:".length);
            adminSubSelect.setAttribute("data-pending-admin-key", adminKey);
            const opts = Array.from(adminSubSelect.options).map((o) => o.value);
            if (opts.includes(adminKey)) {
              adminSubSelect.value = adminKey;
              adminSubSelect.removeAttribute("data-pending-admin-key");
            }
          }
        } else if (message.aiModel.startsWith("supported:")) {
          const supportedKey = message.aiModel.substring("supported:".length);
          const groupName = findGroupForSupportedKey(supportedKey);
          if (groupName) {
            aiModelSelect.value = `group:${groupName}`;
            if (supportedModelSubselect) {
              supportedModelSubselect.setAttribute(
                "data-pending-supported-key",
                supportedKey,
              );
            }
          }
        } else {
          aiModelSelect.value = message.aiModel;
        }
        aiModelSelect.dispatchEvent(new Event("change"));
      }

      // 설정 로드 완료 - 자동 저장 다시 활성화
      isLoadingSettings = false;
      break;
    case "compactorModelSaved":
      {
        const compactorModelStatus = document.getElementById(
          "compactor-model-status",
        );
        if (compactorModelStatus) {
          compactorModelStatus.textContent = "Compactor 모델이 저장되었습니다.";
          compactorModelStatus.className = "info-message success-message";
        }
      }
      break;
    case "compactorModelSaveError":
      {
        const compactorModelStatus = document.getElementById(
          "compactor-model-status",
        );
        if (compactorModelStatus) {
          compactorModelStatus.textContent = `Compactor 모델 저장 오류: ${message.error}`;
          compactorModelStatus.className = "info-message error-message";
        }
      }
      break;
    case "compactorModelCleared":
      {
        const compactorModelStatus = document.getElementById(
          "compactor-model-status",
        );
        const compactorTypeSelect = document.getElementById(
          "compactor-model-type-select",
        );
        if (compactorTypeSelect) {
          compactorTypeSelect.value = "";
        }
        if (compactorModelStatus) {
          compactorModelStatus.textContent =
            "Compactor 모델이 초기화되었습니다. 메인 모델이 사용됩니다.";
          compactorModelStatus.className = "info-message success-message";
        }
      }
      break;
    case "commandModelSaved":
      {
        const commandModelStatus = document.getElementById(
          "command-model-status",
        );
        if (commandModelStatus) {
          commandModelStatus.textContent = "Command 모델이 저장되었습니다.";
          commandModelStatus.className = "info-message success-message";
        }
      }
      break;
    case "commandModelSaveError":
      {
        const commandModelStatus = document.getElementById(
          "command-model-status",
        );
        if (commandModelStatus) {
          commandModelStatus.textContent = `Command 모델 저장 오류: ${message.error}`;
          commandModelStatus.className = "info-message error-message";
        }
      }
      break;
    case "commandModelCleared":
      {
        const commandModelStatus = document.getElementById(
          "command-model-status",
        );
        const commandTypeSelect = document.getElementById(
          "command-model-type-select",
        );
        if (commandTypeSelect) {
          commandTypeSelect.value = "";
        }
        if (commandModelStatus) {
          commandModelStatus.textContent =
            "Command 모델이 초기화되었습니다. 메인 모델이 사용됩니다.";
          commandModelStatus.className = "info-message success-message";
        }
      }
      break;
    case "compactorApiKeySaved":
      {
        const compactorModelStatus = document.getElementById(
          "compactor-model-status",
        );
        if (compactorModelStatus) {
          compactorModelStatus.textContent =
            "Compactor API 키가 저장되었습니다.";
          compactorModelStatus.className = "info-message success-message";
        }
      }
      break;
    case "compactorApiKeySaveError":
      {
        const compactorModelStatus = document.getElementById(
          "compactor-model-status",
        );
        if (compactorModelStatus) {
          compactorModelStatus.textContent = `Compactor API 키 저장 오류: ${message.error}`;
          compactorModelStatus.className = "info-message error-message";
        }
      }
      break;
    case "commandApiKeySaved":
      {
        const commandModelStatus = document.getElementById(
          "command-model-status",
        );
        if (commandModelStatus) {
          commandModelStatus.textContent = "Command API 키가 저장되었습니다.";
          commandModelStatus.className = "info-message success-message";
        }
      }
      break;
    case "commandApiKeySaveError":
      {
        const commandModelStatus = document.getElementById(
          "command-model-status",
        );
        if (commandModelStatus) {
          commandModelStatus.textContent = `Command API 키 저장 오류: ${message.error}`;
          commandModelStatus.className = "info-message error-message";
        }
      }
      break;
    case "subagentModelSaved":
      {
        const saStatus = document.getElementById("subagent-model-status");
        if (saStatus) {
          saStatus.textContent = "서브에이전트 모델이 저장되었습니다.";
          saStatus.className = "info-message success-message";
        }
      }
      break;
    case "subagentModelSaveError":
      {
        const saStatus = document.getElementById("subagent-model-status");
        if (saStatus) {
          saStatus.textContent = `서브에이전트 모델 저장 오류: ${message.error}`;
          saStatus.className = "info-message error-message";
        }
      }
      break;
    case "subagentModelCleared":
      {
        const saStatus = document.getElementById("subagent-model-status");
        const saTypeSelect = document.getElementById(
          "subagent-model-type-select",
        );
        if (saTypeSelect) saTypeSelect.value = "";
        if (saStatus) {
          saStatus.textContent =
            "서브에이전트 모델이 초기화되었습니다. 메인 모델이 사용됩니다.";
          saStatus.className = "info-message success-message";
        }
      }
      break;
    case "subagentApiKeySaved":
      {
        const saStatus = document.getElementById("subagent-model-status");
        if (saStatus) {
          saStatus.textContent = "서브에이전트 API 키가 저장되었습니다.";
          saStatus.className = "info-message success-message";
        }
      }
      break;
    case "completionModelSaved":
      {
        const cmStatus = document.getElementById("completion-model-status");
        if (cmStatus) {
          cmStatus.textContent = "자동완성 모델이 저장되었습니다.";
          cmStatus.className = "info-message success-message";
        }
      }
      break;
    case "completionModelSaveError":
      {
        const cmStatus = document.getElementById("completion-model-status");
        if (cmStatus) {
          cmStatus.textContent = `자동완성 모델 저장 오류: ${message.error}`;
          cmStatus.className = "info-message error-message";
        }
      }
      break;
    case "completionModelCleared":
      {
        const cmStatus = document.getElementById("completion-model-status");
        const cmTypeSelect = document.getElementById(
          "completion-model-type-select",
        );
        if (cmTypeSelect) cmTypeSelect.value = "";
        if (cmStatus) {
          cmStatus.textContent =
            "자동완성 모델이 초기화되었습니다. 메인 모델이 사용됩니다.";
          cmStatus.className = "info-message success-message";
        }
      }
      break;
    case "completionApiKeySaved":
      {
        const cmStatus = document.getElementById("completion-model-status");
        if (cmStatus) {
          cmStatus.textContent = "자동완성 API 키가 저장되었습니다.";
          cmStatus.className = "info-message success-message";
        }
      }
      break;
    case "inlineCompletionEnabledSet":
      if (inlineCompletionStatus) {
        inlineCompletionStatus.textContent =
          inlineCompletionToggle && inlineCompletionToggle.checked
            ? "소스코드 자동완성이 활성화되었습니다."
            : "소스코드 자동완성이 비활성화되었습니다.";
        inlineCompletionStatus.className = "info-message success-message";
      }
      break;
    case "errorFallbackModelSaved":
      {
        const efStatus = document.getElementById("error-fallback-model-status");
        if (efStatus) {
          efStatus.textContent = "에러 폴백 모델이 저장되었습니다.";
          efStatus.className = "info-message success-message";
        }
      }
      break;
    case "errorFallbackModelSaveError":
      {
        const efStatus = document.getElementById("error-fallback-model-status");
        if (efStatus) {
          efStatus.textContent = `에러 폴백 모델 저장 오류: ${message.error}`;
          efStatus.className = "info-message error-message";
        }
      }
      break;
    case "errorFallbackModelCleared":
      {
        const efStatus = document.getElementById("error-fallback-model-status");
        const efTypeSelect = document.getElementById(
          "error-fallback-model-type-select",
        );
        if (efTypeSelect) efTypeSelect.value = "";
        if (efStatus) {
          efStatus.textContent =
            "에러 폴백 모델이 초기화되었습니다. 메인 모델이 사용됩니다.";
          efStatus.className = "info-message success-message";
        }
      }
      break;
    case "errorFallbackApiKeySaved":
      {
        const efStatus = document.getElementById("error-fallback-model-status");
        if (efStatus) {
          efStatus.textContent = "에러 폴백 모델 API 키가 저장되었습니다.";
          efStatus.className = "info-message success-message";
        }
      }
      break;
    case "errorFallbackApiKeySaveError":
      {
        const efStatus = document.getElementById("error-fallback-model-status");
        if (efStatus) {
          efStatus.textContent = `에러 폴백 모델 API 키 저장 오류: ${message.error}`;
          efStatus.className = "info-message error-message";
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
        } else if (message.model.startsWith("supported:")) {
          const sk = message.model.substring("supported:".length);
          const gn = findGroupForSupportedKey(sk);
          if (gn) {
            displayModel = `group:${gn}`;
            if (supportedModelSubselect) {
              supportedModelSubselect.setAttribute(
                "data-pending-supported-key",
                sk,
              );
            }
          }
        } else if (message.model.startsWith("admin:")) {
          // admin:key → 그룹 검색 후 group:XXX 로 변환
          const ak = message.model.substring("admin:".length);
          const agn = findGroupForSupportedKey(ak);
          if (agn) {
            displayModel = `group:${agn}`;
            if (supportedModelSubselect) {
              supportedModelSubselect.setAttribute(
                "data-pending-supported-key",
                ak,
              );
            }
          }
        }
        // group:XXX는 그대로 사용 (드롭박스 option value와 일치)

        aiModelSelect.value = displayModel;
        // change 이벤트 발생시켜 하위 섹션 활성화 (자동 저장 방지)
        isLoadingSettings = true;
        aiModelSelect.dispatchEvent(new Event("change"));
        isLoadingSettings = false;
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
      if (typeof message.enabled === "boolean" && autoTestRetryToggle) {
      }
      break;
    case "testRetryCountSet":
      if (typeof message.count === "number" && testRetrySpinner) {
      }
      break;
    case "autoCorrectionStatusChanged":
      if (typeof message.enabled === "boolean" && autoCorrectionToggle) {
        autoCorrectionToggle.checked = message.enabled;
      }
      break;
    case "currentApiKeys":
      // API 키 상태 로드 (지원 모델에서 통합 관리)
      // 로컬 Ollama API URL 상태 로드 (기본값 폴백)
      if (
        localOllamaApiUrlInput &&
        typeof message.localOllamaApiUrl === "string"
      ) {
        localOllamaApiUrlInput.value =
          message.localOllamaApiUrl || "http://localhost:11434";
        const localOllamaApiUrlSetText = message.localOllamaApiUrl
          ? languageData["ollamaApiUrlSet"] ||
            "로컬 Ollama API URL이 설정되어 있습니다."
          : languageData["ollamaApiUrlNotSet"] ||
            "로컬 Ollama API URL이 설정되지 않았습니다.";
        showStatus(
          localOllamaApiUrlStatus,
          localOllamaApiUrlSetText,
          message.localOllamaApiUrl ? "success" : "info",
        );
      }
      // 원격 서버 API URL 상태 로드
      if (
        remoteOllamaApiUrlInput &&
        typeof message.remoteOllamaApiUrl === "string"
      ) {
        remoteOllamaApiUrlInput.value = message.remoteOllamaApiUrl || "";
        const remoteOllamaApiUrlSetText = message.remoteOllamaApiUrl
          ? "원격 서버 API URL이 설정되어 있습니다."
          : "원격 서버 API URL이 설정되지 않았습니다.";
        showStatus(
          remoteOllamaApiUrlStatus,
          remoteOllamaApiUrlSetText,
          message.remoteOllamaApiUrl ? "success" : "info",
        );
      }
      // 원격 서버 모델명 상태 로드
      if (
        remoteOllamaModelInput &&
        typeof message.remoteOllamaModel === "string"
      ) {
        remoteOllamaModelInput.value = message.remoteOllamaModel || "";
        const remoteOllamaModelSetText = message.remoteOllamaModel
          ? `원격 서버 모델이 설정되어 있습니다: ${message.remoteOllamaModel}`
          : "원격 서버 모델이 설정되지 않았습니다.";
        showStatus(
          remoteOllamaModelStatus,
          remoteOllamaModelSetText,
          message.remoteOllamaModel ? "success" : "info",
        );
      }
      // Ollama 서버 타입 상태 로드
      if (
        ollamaServerTypeSelect &&
        typeof message.ollamaServerType === "string"
      ) {
        ollamaServerTypeSelect.value = message.ollamaServerType || "local";
        const ollamaServerTypeSetText = message.ollamaServerType
          ? `Ollama 서버 타입이 설정되어 있습니다: ${message.ollamaServerType === "local" ? "로컬 머신" : "원격 서버"}`
          : "Ollama 서버 타입이 설정되지 않았습니다.";
        showStatus(
          ollamaServerTypeStatus,
          ollamaServerTypeSetText,
          message.ollamaServerType ? "success" : "info",
        );

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
      if (
        typeof message.ollamaModel === "string" &&
        message.ollamaModel !== ""
      ) {
        storedOllamaModel = message.ollamaModel;
        console.log("[Settings] Stored Ollama model:", storedOllamaModel);

        // 드롭다운에 직접 적용
        if (ollamaModelSelect && message.ollamaModel) {
          // 모델이 목록에 있는지 확인
          const existingOption = Array.from(ollamaModelSelect.options).find(
            (option) => option.value === message.ollamaModel,
          );
          if (existingOption) {
            ollamaModelSelect.value = message.ollamaModel;
            console.log(
              "[Settings] Applied Ollama model to dropdown:",
              message.ollamaModel,
            );
          } else {
            // 목록에 없다면 추가
            const newOption = document.createElement("option");
            newOption.value = message.ollamaModel;
            newOption.textContent = message.ollamaModel;
            ollamaModelSelect.appendChild(newOption);
            ollamaModelSelect.value = message.ollamaModel;
            console.log(
              "[Settings] Added and applied Ollama model to dropdown:",
              message.ollamaModel,
            );
          }
        }

        const ollamaModelSetText = message.ollamaModel
          ? `Ollama 모델이 설정되어 있습니다: ${message.ollamaModel}`
          : "Ollama 모델이 설정되지 않았습니다.";
        showStatus(
          ollamaModelStatus,
          ollamaModelSetText,
          message.ollamaModel ? "success" : "info",
        );
      } else {
        console.log(
          "[Settings] No valid ollamaModel in currentSettings message",
        );
      }
      // API 키 로드 완료 후 저장 버튼 상태 갱신
      setTimeout(() => {
        updateSaveButtonsState();
      }, 100);
      break;
    case "apiKeysLoaded":
      // loadApiKeys 응답: API 키 로드 완료 후 상태 표시
      if (message.apiKey) {
        showStatus(
          supportedModelStatus,
          languageData["apiKeySet"] || "API 키가 설정되어 있습니다.",
          "success",
        );
      } else {
        showStatus(
          supportedModelStatus,
          languageData["apiKeyNotSet"] || "API 키가 설정되지 않았습니다.",
          "info",
        );
      }
      break;
    case "apiKeySaved":
      const apiKeySavedText =
        languageData["apiKeySaved"] || "API 키가 저장되었습니다.";
      showStatus(supportedModelStatus, apiKeySavedText, "success");
      if (supportedModelApiKeyInput) supportedModelApiKeyInput.value = "";
      break;
    case "apiKeySaveError":
      const apiKeyErrorText =
        languageData["apiKeyError"] || "API 키 저장 실패:";
      showStatus(
        supportedModelStatus,
        `${apiKeyErrorText} ${message.error}`,
        "error",
      );
      break;
    case "localOllamaApiUrlSaved":
      const localOllamaApiUrlSavedText =
        languageData["ollamaApiUrlSaved"] ||
        "로컬 Ollama API URL이 저장되었습니다.";
      showStatus(
        localOllamaApiUrlStatus,
        localOllamaApiUrlSavedText,
        "success",
      );
      localOllamaApiUrlInput.value = "";
      break;
    case "localOllamaApiUrlError":
      const localOllamaApiUrlErrorText =
        languageData["ollamaApiUrlError"] || "로컬 Ollama API URL 저장 실패:";
      showStatus(
        localOllamaApiUrlStatus,
        `${localOllamaApiUrlErrorText} ${message.error}`,
        "error",
      );
      break;
    case "remoteOllamaApiUrlSaved":
      showStatus(
        remoteOllamaApiUrlStatus,
        "원격 서버 API URL이 저장되었습니다.",
        "success",
      );
      remoteOllamaApiUrlInput.value = "";
      break;
    case "remoteOllamaApiUrlError":
      showStatus(
        remoteOllamaApiUrlStatus,
        `원격 서버 API URL 저장 실패: ${message.error}`,
        "error",
      );
      break;
    case "remoteOllamaModelSaved":
      showStatus(
        remoteOllamaModelStatus,
        "원격 서버 모델명이 저장되었습니다.",
        "success",
      );
      remoteOllamaModelInput.value = "";
      break;
    case "remoteOllamaModelError":
      showStatus(
        remoteOllamaModelStatus,
        `원격 서버 모델명 저장 실패: ${message.error}`,
        "error",
      );
      break;
    case "ollamaServerTypeSaved":
      showStatus(
        ollamaServerTypeStatus,
        "Ollama 서버 타입이 저장되었습니다.",
        "success",
      );
      break;
    case "ollamaServerTypeSaveError":
      showStatus(
        ollamaServerTypeStatus,
        `Ollama 서버 타입 저장 실패: ${message.error}`,
        "error",
      );
      break;
    case "errorRetryCountSaved":
      const errorRetryCountSavedText =
        languageData["errorRetryCountSaved"] ||
        "오류 수정 횟수가 저장되었습니다.";
      showStatus(errorRetryStatus, errorRetryCountSavedText, "success");
      break;
    case "errorRetryCountSaveError":
      const errorRetryCountSaveErrorText =
        languageData["errorRetryCountSaveError"] || "오류 수정 횟수 저장 실패:";
      showStatus(
        errorRetryStatus,
        `${errorRetryCountSaveErrorText} ${message.error}`,
        "error",
      );
      break;
    case "aiModelSaved":
      const aiModelSavedText =
        languageData["aiModelSaved"] || "AI 모델이 저장되었습니다.";
      showStatus(sourcePathStatus, aiModelSavedText, "success");
      break;
    case "aiModelSaveError":
      const aiModelSaveErrorText =
        languageData["aiModelSaveError"] || "AI 모델 저장 실패:";
      showStatus(
        sourcePathStatus,
        `${aiModelSaveErrorText} ${message.error}`,
        "error",
      );
      break;
    case "currentOllamaModel":
      if (message.model && ollamaModelSelect) {
        // console.log('Received current Ollama model:', message.model);
        ollamaModelSelect.value = message.model;
        const ollamaModelSetText = message.model
          ? `Ollama 모델이 설정되어 있습니다: ${message.model}`
          : "Ollama 모델이 설정되지 않았습니다.";
        showStatus(
          ollamaModelStatus,
          ollamaModelSetText,
          message.model ? "success" : "info",
        );

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
      showStatus(ollamaModelStatus, "Ollama 모델이 저장되었습니다.", "success");
      break;
    case "ollamaModelError":
      showStatus(
        ollamaModelStatus,
        `Ollama 모델 저장 실패: ${message.error}`,
        "error",
      );
      break;
    case "ollamaAuthResult":
      if (message.success) {
        showStatus(ollamaAuthStatus, "Ollama 인증이 성공했습니다.", "success");
      } else {
        showStatus(
          ollamaAuthStatus,
          `Ollama 인증 실패: ${message.message}`,
          "error",
        );
      }
      break;
    case "languageDataLoaded":
      if (message.languageData) {
        languageData = message.languageData;
        console.log(
          "Language data loaded:",
          Object.keys(languageData).length,
          "keys",
        );
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
      const languageChangedToText =
        languageData["languageChangedTo"] || "로 변경되었습니다.";
      showStatus(
        sourcePathStatus,
        `${languageChangedText} ${message.language} ${languageChangedToText}`,
        "success",
      );
      break;
    case "chatThemeSaved":
      console.log("Chat theme saved successfully:", message.theme);
      const themeSelectEl = document.getElementById("theme-select");
      const themeStatusEl = document.getElementById("theme-status");
      if (themeSelectEl) {
        themeSelectEl.value = message.theme;
      }
      if (themeStatusEl) {
        const themeLabels = { dark: "다크", light: "라이트", auto: "자동" };
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
    case "buildTestSettingsUpdated":
      if (Array.isArray(message.settings)) {
        renderPersonalBuildTestList(message.settings);
      }
      if (message.success) {
        hideBuildTestForm();
      } else if (btAddStatus) {
        btAddStatus.textContent = message.error || "";
        btAddStatus.style.color = "#e53935";
        setTimeout(() => {
          if (btAddStatus) btAddStatus.textContent = "";
        }, 2000);
      }
      break;
    case "languageSaveError":
      const languageSaveErrorText =
        languageData["languageSaveError"] || "언어 저장 실패:";
      showStatus(
        sourcePathStatus,
        `${languageSaveErrorText} ${message.error}`,
        "error",
      );
      break;
    case "currentLanguage":
      // console.log('[Settings] Received currentLanguage message:', message.language);
      if (message.language) {
        currentLanguage = message.language;
        if (languageSelect) {
          languageSelect.value = currentLanguage;
          console.log(
            "[Settings] Set language select value to:",
            currentLanguage,
          );
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
        sessionStorage.setItem("agentgocoderLang", message.language);

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
          if (
            currentText.includes("로드 완료") ||
            currentText.includes("loaded successfully") ||
            currentText.includes("cargado correctamente") ||
            currentText.includes("chargé avec succès") ||
            currentText.includes("加载完成") ||
            currentText.includes("正常に読み込まれました")
          ) {
            sourcePathStatus.textContent =
              languageData["sourcePathsLoaded"] || "소스 경로 로드 완료.";
          }
        }

        // projectRootStatus 요소가 HTML에 없으므로 제거됨 (v9.4.1)

        // autoUpdateStatus 텍스트 업데이트 제거 - 스위치 버튼으로 상태 표시
      }
      break;
  }
});

// Webview 로드 시 초기 설정값 요청
vscode.postMessage({ command: "loadApiKeys" });
// loadAiModel 제거: currentSettings에서 aiModel + serverSettings 함께 처리
vscode.postMessage({ command: "loadOllamaModel" });

const apiKeysLoadingText =
  languageData["apiKeysLoading"] || "API 키 로드 중...";
showStatus(supportedModelStatus, apiKeysLoadingText, "info");
if (localOllamaApiUrlStatus) {
  showStatus(localOllamaApiUrlStatus, apiKeysLoadingText, "info");
}
if (remoteOllamaApiUrlStatus) {
  showStatus(remoteOllamaApiUrlStatus, apiKeysLoadingText, "info");
}
// API 키 로드 후 저장 버튼 상태 업데이트는 currentApiKeys 메시지를 받은 후에 수행됨

// Ollama 모델 목록 불러오기
loadOllamaModels();

// 초기 상태: 지원 모델 섹션은 모델 선택 시 동적으로 표시됨
// 초기 활성화 상태는 AI 모델과 서버 타입에 따라 결정
if (aiModelSelect && aiModelSelect.value === "ollama") {
  const serverType = ollamaServerTypeSelect
    ? ollamaServerTypeSelect.value
    : "local";
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

// Ollama 모델 목록을 확장 호스트에 요청하여 수신
async function loadOllamaModels() {
  // console.log('Ollama 모델 목록 요청 (호스트)');
  vscode.postMessage({ command: "getOllamaModels" });
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
  vscode.postMessage({ command: "getLanguage" });

  // 2. 기본 언어 데이터 로드 (한국어)
  loadLanguage("ko");

  // 3. 전체 설정 로드
  vscode.postMessage({ command: "getCurrentSettings" });

  // 3-1. standalone: 빌트인 모델 프리셋 렌더링
  renderAllOrgSettings();

  // 4. API 키 로드
  vscode.postMessage({ command: "loadApiKeys" });

  // 5. AI 모델 로드
  vscode.postMessage({ command: "loadAiModel" });

  // 6. Ollama 모델 로드
  vscode.postMessage({ command: "loadOllamaModel" });

  // 7. 라이센스 입력 필드 초기 상태 설정
  console.log("[Settings] DOMContentLoaded - Initial load sequence completed");

  // AgentPolicy XML 파일 로드
  loadAgentPolicyFiles();

  // 타입 선택 토글 초기화
  document.querySelectorAll(".policy-type-selector").forEach((selector) => {
    const buttons = selector.querySelectorAll(".policy-type-btn");
    const descInput = selector.querySelector(".policy-skill-desc");
    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        buttons.forEach((b) => {
          b.classList.remove("active");
          b.style.background = "transparent";
          b.style.color = "var(--vscode-foreground)";
        });
        btn.classList.add("active");
        btn.style.background = "var(--vscode-button-background)";
        btn.style.color = "var(--vscode-button-foreground)";
        if (descInput) {
          descInput.style.display =
            btn.dataset.type === "skill" ? "block" : "none";
        }
      });
    });
  });

  // ===== 모델 라우팅 설정 버튼 이벤트 리스너 =====

  // 하위 모델 옵션 정의 (ollama는 동적으로 가져옴)
  const submodelOptions = {
    ollama: [], // 동적으로 채워짐
  };

  // 라우팅 모델용 Ollama 모델 리스트 캐시 (window scope 사용)
  window.routingOllamaModelsCache = window.routingOllamaModelsCache || [];

  // 라우팅 모델용 Ollama 모델 리스트 요청
  function loadRoutingOllamaModels() {
    console.log("[Settings] Requesting routing Ollama models");
    vscode.postMessage({ command: "getRoutingOllamaModels" });
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
      options.forEach((opt) => {
        const option = document.createElement("option");
        option.value = opt.value;
        option.textContent = opt.label;
        submodelSelect.appendChild(option);
      });
    }
  }

  // 모델 타입 변경 시 하위 UI 표시/숨김 함수
  function handleModelTypeChange(prefix, modelType) {
    const submodelContainer = document.getElementById(
      `${prefix}-submodel-container`,
    );
    const apikeyContainer = document.getElementById(
      `${prefix}-apikey-container`,
    );
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
        intent: "clearIntentModel",
        completion: "clearCompletionModel",
        "error-fallback": "clearErrorFallbackModel",
      };
      const deleteCommand = commandMap[prefix];
      if (deleteCommand) {
        console.log(
          `[Settings] Deleting ${prefix} model settings (switching to main model)`,
        );
        vscode.postMessage({ command: deleteCommand });
        if (modelStatus) {
          modelStatus.textContent = "메인 모델 사용으로 변경되었습니다.";
          modelStatus.className = "info-message success-message";
        }
      }
      return;
    }

    // ollama 선택 시 동적으로 모델 리스트 가져오기
    if (modelType === "ollama") {
      if (
        window.routingOllamaModelsCache &&
        window.routingOllamaModelsCache.length > 0
      ) {
        // 캐시된 리스트가 있으면 사용
        submodelOptions.ollama = window.routingOllamaModelsCache.map(
          (name) => ({ value: name, label: name }),
        );
      } else {
        // 캐시가 없으면 서버에서 가져오기
        loadRoutingOllamaModels();
      }
    }

    // 지원 모델 그룹 선택 시 해당 그룹 모델 리스트
    if (modelType.startsWith("group:")) {
      const groupName = modelType.substring("group:".length);
      const aiModels = cachedServerSettings["ai_model"] || [];
      const groupModels = aiModels.filter(
        (s) => s.source === "preset" && (s.group || "default") === groupName,
      );
      if (submodelSelect) {
        submodelSelect.innerHTML = "";
        for (const s of groupModels) {
          const opt = document.createElement("option");
          opt.value = s.key;
          opt.textContent = s.value?.name || s.key;
          submodelSelect.appendChild(opt);
        }
      }
    }

    // 관리자 모델 선택 시 관리자 모델 리스트
    if (modelType === "admin") {
      const aiModels = cachedServerSettings["ai_model"] || [];
      const adminModels = aiModels.filter(
        (s) => s.source === "admin" && s.value?.enabled !== false,
      );
      if (submodelSelect) {
        submodelSelect.innerHTML = "";
        for (const s of adminModels) {
          const v = s.value || {};
          const opt = document.createElement("option");
          opt.value = s.key;
          const badge = s.enforcement === "required" ? " 🔒" : "";
          opt.textContent = `${v.model || v.model_name || v.name || s.key}${badge}`;
          submodelSelect.appendChild(opt);
        }
      }
    }

    // ollama일 때만 기존 updateSubmodelSelect 사용
    if (modelType === "ollama" && submodelSelect) {
      updateSubmodelSelect(submodelSelect, modelType);
    }
    if (submodelContainer) {
      submodelContainer.style.display = "block";
    }

    // API 키 입력은 숨김 (모델에 이미 설정됨)
    if (apikeyContainer) {
      apikeyContainer.style.display = "none";
    }
  }

  // Compactor 모델 타입 선택 변경 이벤트
  const compactorTypeSelect = document.getElementById(
    "compactor-model-type-select",
  );
  if (compactorTypeSelect) {
    compactorTypeSelect.addEventListener("change", (e) => {
      handleModelTypeChange("compactor", e.target.value);
    });
  }

  // Command 모델 타입 선택 변경 이벤트
  const commandTypeSelect = document.getElementById(
    "command-model-type-select",
  );
  if (commandTypeSelect) {
    commandTypeSelect.addEventListener("change", (e) => {
      handleModelTypeChange("command", e.target.value);
    });
  }

  // Compactor 모델 저장 버튼
  const saveCompactorModelButton = document.getElementById(
    "save-compactor-model-button",
  );
  if (saveCompactorModelButton) {
    saveCompactorModelButton.addEventListener("click", () => {
      const compactorTypeSelect = document.getElementById(
        "compactor-model-type-select",
      );
      const compactorSubmodelSelect = document.getElementById(
        "compactor-submodel-select",
      );
      const modelType = compactorTypeSelect ? compactorTypeSelect.value : "";
      const modelName = compactorSubmodelSelect
        ? compactorSubmodelSelect.value
        : "";

      if (!modelType) {
        const compactorModelStatus = document.getElementById(
          "compactor-model-status",
        );
        if (compactorModelStatus) {
          compactorModelStatus.textContent = "모델 타입을 선택해주세요.";
          compactorModelStatus.className = "info-message error-message";
        }
        return;
      }

      vscode.postMessage({
        command: "saveCompactorModel",
        modelType: modelType,
        modelName: modelName,
      });
    });
  }

  // Compactor API 키 저장 버튼
  const saveCompactorApiKeyButton = document.getElementById(
    "save-compactor-api-key-button",
  );
  if (saveCompactorApiKeyButton) {
    saveCompactorApiKeyButton.addEventListener("click", () => {
      const compactorTypeSelect = document.getElementById(
        "compactor-model-type-select",
      );
      const compactorApiKeyInput = document.getElementById(
        "compactor-api-key-input",
      );
      const modelType = compactorTypeSelect ? compactorTypeSelect.value : "";
      const apiKey = compactorApiKeyInput ? compactorApiKeyInput.value : "";

      if (!apiKey) {
        const compactorModelStatus = document.getElementById(
          "compactor-model-status",
        );
        if (compactorModelStatus) {
          compactorModelStatus.textContent = "API 키를 입력해주세요.";
          compactorModelStatus.className = "info-message error-message";
        }
        return;
      }

      vscode.postMessage({
        command: "saveCompactorApiKey",
        modelType: modelType,
        apiKey: apiKey,
      });

      // 입력 필드 초기화
      if (compactorApiKeyInput) {
        compactorApiKeyInput.value = "";
      }
    });
  }

  // Command 모델 저장 버튼
  const saveCommandModelButton = document.getElementById(
    "save-command-model-button",
  );
  if (saveCommandModelButton) {
    saveCommandModelButton.addEventListener("click", () => {
      const commandTypeSelect = document.getElementById(
        "command-model-type-select",
      );
      const commandSubmodelSelect = document.getElementById(
        "command-submodel-select",
      );
      const modelType = commandTypeSelect ? commandTypeSelect.value : "";
      const modelName = commandSubmodelSelect
        ? commandSubmodelSelect.value
        : "";

      if (!modelType) {
        const commandModelStatus = document.getElementById(
          "command-model-status",
        );
        if (commandModelStatus) {
          commandModelStatus.textContent = "모델 타입을 선택해주세요.";
          commandModelStatus.className = "info-message error-message";
        }
        return;
      }

      vscode.postMessage({
        command: "saveCommandModel",
        modelType: modelType,
        modelName: modelName,
      });
    });
  }

  // Command API 키 저장 버튼
  const saveCommandApiKeyButton = document.getElementById(
    "save-command-api-key-button",
  );
  if (saveCommandApiKeyButton) {
    saveCommandApiKeyButton.addEventListener("click", () => {
      const commandTypeSelect = document.getElementById(
        "command-model-type-select",
      );
      const commandApiKeyInput = document.getElementById(
        "command-api-key-input",
      );
      const modelType = commandTypeSelect ? commandTypeSelect.value : "";
      const apiKey = commandApiKeyInput ? commandApiKeyInput.value : "";

      if (!apiKey) {
        const commandModelStatus = document.getElementById(
          "command-model-status",
        );
        if (commandModelStatus) {
          commandModelStatus.textContent = "API 키를 입력해주세요.";
          commandModelStatus.className = "info-message error-message";
        }
        return;
      }

      vscode.postMessage({
        command: "saveCommandApiKey",
        modelType: modelType,
        apiKey: apiKey,
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
    intentTypeSelect.addEventListener("change", (e) => {
      handleModelTypeChange("intent", e.target.value);
    });
  }

  // 에러 폴백 모델 타입 선택 변경 이벤트
  const errorFallbackTypeSelect = document.getElementById(
    "error-fallback-model-type-select",
  );
  if (errorFallbackTypeSelect) {
    errorFallbackTypeSelect.addEventListener("change", (e) => {
      handleModelTypeChange("error-fallback", e.target.value);
    });
  }

  // Intent 모델 저장 버튼
  const saveIntentModelButton = document.getElementById(
    "save-intent-model-button",
  );
  if (saveIntentModelButton) {
    saveIntentModelButton.addEventListener("click", () => {
      const intentTypeSelect = document.getElementById(
        "intent-model-type-select",
      );
      const intentSubmodelSelect = document.getElementById(
        "intent-submodel-select",
      );
      const modelType = intentTypeSelect ? intentTypeSelect.value : "";
      const modelName = intentSubmodelSelect ? intentSubmodelSelect.value : "";

      if (!modelType) {
        const intentModelStatus = document.getElementById(
          "intent-model-status",
        );
        if (intentModelStatus) {
          intentModelStatus.textContent = "모델 타입을 선택해주세요.";
          intentModelStatus.className = "info-message error-message";
        }
        return;
      }

      vscode.postMessage({
        command: "saveIntentModel",
        modelType: modelType,
        modelName: modelName,
      });
    });
  }

  // Intent API 키 저장 버튼
  const saveIntentApiKeyButton = document.getElementById(
    "save-intent-api-key-button",
  );
  if (saveIntentApiKeyButton) {
    saveIntentApiKeyButton.addEventListener("click", () => {
      const intentTypeSelect = document.getElementById(
        "intent-model-type-select",
      );
      const intentApiKeyInput = document.getElementById("intent-api-key-input");
      const modelType = intentTypeSelect ? intentTypeSelect.value : "";
      const apiKey = intentApiKeyInput ? intentApiKeyInput.value : "";

      if (!apiKey) {
        const intentModelStatus = document.getElementById(
          "intent-model-status",
        );
        if (intentModelStatus) {
          intentModelStatus.textContent = "API 키를 입력해주세요.";
          intentModelStatus.className = "info-message error-message";
        }
        return;
      }

      vscode.postMessage({
        command: "saveIntentApiKey",
        modelType: modelType,
        apiKey: apiKey,
      });

      // 입력 필드 초기화
      if (intentApiKeyInput) {
        intentApiKeyInput.value = "";
      }
    });
  }

  // 에러 폴백 모델 저장 버튼
  const saveErrorFallbackModelButton = document.getElementById(
    "save-error-fallback-model-button",
  );
  if (saveErrorFallbackModelButton) {
    saveErrorFallbackModelButton.addEventListener("click", () => {
      const typeSelect = document.getElementById(
        "error-fallback-model-type-select",
      );
      const submodelSelect = document.getElementById(
        "error-fallback-submodel-select",
      );
      const modelType = typeSelect ? typeSelect.value : "";
      const modelName = submodelSelect ? submodelSelect.value : "";

      if (!modelType) {
        const statusEl = document.getElementById("error-fallback-model-status");
        if (statusEl) {
          statusEl.textContent = "모델 타입을 선택해주세요.";
          statusEl.className = "info-message error-message";
        }
        return;
      }

      vscode.postMessage({
        command: "saveErrorFallbackModel",
        modelType,
        modelName,
      });
    });
  }

  // 에러 폴백 API 키 저장 버튼
  const saveErrorFallbackApiKeyButton = document.getElementById(
    "save-error-fallback-api-key-button",
  );
  if (saveErrorFallbackApiKeyButton) {
    saveErrorFallbackApiKeyButton.addEventListener("click", () => {
      const typeSelect = document.getElementById(
        "error-fallback-model-type-select",
      );
      const apiKeyInput = document.getElementById(
        "error-fallback-api-key-input",
      );
      const modelType = typeSelect ? typeSelect.value : "";
      const apiKey = apiKeyInput ? apiKeyInput.value : "";

      if (!apiKey) {
        const statusEl = document.getElementById("error-fallback-model-status");
        if (statusEl) {
          statusEl.textContent = "API 키를 입력해주세요.";
          statusEl.className = "info-message error-message";
        }
        return;
      }

      vscode.postMessage({
        command: "saveErrorFallbackApiKey",
        modelType,
        apiKey,
      });
      if (apiKeyInput) apiKeyInput.value = "";
    });
  }

  // 서브에이전트 모델 타입 선택 변경 이벤트
  const subagentTypeSelect = document.getElementById(
    "subagent-model-type-select",
  );
  if (subagentTypeSelect) {
    subagentTypeSelect.addEventListener("change", (e) => {
      handleModelTypeChange("subagent", e.target.value);
    });
  }

  // 서브에이전트 모델 저장 버튼
  const saveSubagentModelButton = document.getElementById(
    "save-subagent-model-button",
  );
  if (saveSubagentModelButton) {
    saveSubagentModelButton.addEventListener("click", () => {
      const typeSelect = document.getElementById("subagent-model-type-select");
      const submodelSelect = document.getElementById(
        "subagent-submodel-select",
      );
      const modelType = typeSelect ? typeSelect.value : "";
      const modelName = submodelSelect ? submodelSelect.value : "";

      if (!modelType) {
        const statusEl = document.getElementById("subagent-model-status");
        if (statusEl) {
          statusEl.textContent = "모델 타입을 선택해주세요.";
          statusEl.className = "info-message error-message";
        }
        return;
      }

      vscode.postMessage({
        command: "saveSubagentModel",
        modelType,
        modelName,
      });
    });
  }

  // 서브에이전트 API 키 저장 버튼
  const saveSubagentApiKeyButton = document.getElementById(
    "save-subagent-api-key-button",
  );
  if (saveSubagentApiKeyButton) {
    saveSubagentApiKeyButton.addEventListener("click", () => {
      const typeSelect = document.getElementById("subagent-model-type-select");
      const apiKeyInput = document.getElementById("subagent-api-key-input");
      const modelType = typeSelect ? typeSelect.value : "";
      const apiKey = apiKeyInput ? apiKeyInput.value : "";

      if (!apiKey) {
        const statusEl = document.getElementById("subagent-model-status");
        if (statusEl) {
          statusEl.textContent = "API 키를 입력해주세요.";
          statusEl.className = "info-message error-message";
        }
        return;
      }

      vscode.postMessage({ command: "saveSubagentApiKey", modelType, apiKey });
      if (apiKeyInput) apiKeyInput.value = "";
    });
  }

  // 소스코드 자동완성 모델 타입 선택 변경 이벤트
  const completionTypeSelect = document.getElementById(
    "completion-model-type-select",
  );
  if (completionTypeSelect) {
    completionTypeSelect.addEventListener("change", (e) => {
      handleModelTypeChange("completion", e.target.value);
    });
  }

  // 소스코드 자동완성 모델 저장 버튼
  const saveCompletionModelButton = document.getElementById(
    "save-completion-model-button",
  );
  if (saveCompletionModelButton) {
    saveCompletionModelButton.addEventListener("click", () => {
      const typeSelect = document.getElementById(
        "completion-model-type-select",
      );
      const submodelSelect = document.getElementById(
        "completion-submodel-select",
      );
      const modelType = typeSelect ? typeSelect.value : "";
      const modelName = submodelSelect ? submodelSelect.value : "";

      if (!modelType) {
        const statusEl = document.getElementById("completion-model-status");
        if (statusEl) {
          statusEl.textContent = "모델 타입을 선택해주세요.";
          statusEl.className = "info-message error-message";
        }
        return;
      }

      vscode.postMessage({
        command: "saveCompletionModel",
        modelType,
        modelName,
      });
    });
  }

  // 소스코드 자동완성 API 키 저장 버튼
  const saveCompletionApiKeyButton = document.getElementById(
    "save-completion-api-key-button",
  );
  if (saveCompletionApiKeyButton) {
    saveCompletionApiKeyButton.addEventListener("click", () => {
      const typeSelect = document.getElementById(
        "completion-model-type-select",
      );
      const apiKeyInput = document.getElementById("completion-api-key-input");
      const modelType = typeSelect ? typeSelect.value : "";
      const apiKey = apiKeyInput ? apiKeyInput.value : "";

      if (!apiKey) {
        const statusEl = document.getElementById("completion-model-status");
        if (statusEl) {
          statusEl.textContent = "API 키를 입력해주세요.";
          statusEl.className = "info-message error-message";
        }
        return;
      }

      vscode.postMessage({
        command: "saveCompletionApiKey",
        modelType,
        apiKey,
      });
      if (apiKeyInput) apiKeyInput.value = "";
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
  "db-policy": [],
};

// 파일 목록 렌더링
// 파일별 skill type 캐시 (extension에서 전달)
let agentPolicyFileTypesCache = {};
let agentPolicyFileDescsCache = {};

function renderPolicyFileList(category, files, fileTypes, fileDescriptions) {
  const listContainer = document.getElementById(`${category}-file-list`);
  if (!listContainer) {
    return;
  }

  // 캐시 업데이트
  agentPolicyFilesCache[category] = files;
  if (fileTypes) {
    agentPolicyFileTypesCache[category] = fileTypes;
  }
  if (fileDescriptions) {
    agentPolicyFileDescsCache[category] = fileDescriptions;
  }

  // 목록 초기화
  listContainer.innerHTML = "";

  if (!files || files.length === 0) {
    return;
  }

  const types = agentPolicyFileTypesCache[category] || {};

  files.forEach((fileName) => {
    const isLegacy = fileName.includes("(레거시)");
    const displayName = fileName.replace(" (레거시)", "");
    const skillType = types[fileName] || "rule";
    const isSkill = skillType === "skill";

    const item = document.createElement("div");
    item.className = "policy-file-item";

    const topRow = document.createElement("div");
    topRow.style.cssText =
      "display:flex;align-items:center;justify-content:space-between;width:100%;";

    const nameGroup = document.createElement("div");
    nameGroup.style.cssText = "display:flex;align-items:center;";

    const nameSpan = document.createElement("span");
    nameSpan.className = "file-name" + (isLegacy ? " legacy" : "");
    nameSpan.textContent = displayName + (isLegacy ? " (레거시)" : "");
    nameGroup.appendChild(nameSpan);

    const typeBadge = document.createElement("span");
    typeBadge.textContent = isSkill ? "스킬" : "규칙";
    typeBadge.style.cssText = `background:#3b82f6;color:#fff;padding:1px 6px;border-radius:4px;font-size:0.7em;font-weight:500;margin-left:3px;`;
    nameGroup.appendChild(typeBadge);

    topRow.appendChild(nameGroup);

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-file-btn";
    deleteBtn.textContent = "삭제";
    deleteBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log(
        "[settings.js] Delete button clicked for:",
        displayName,
        "category:",
        category,
        "isLegacy:",
        isLegacy,
      );

      // VSCode webview에서 confirm()이 작동하지 않을 수 있으므로 바로 삭제 요청
      vscode.postMessage({
        command: "deleteAgentPolicyFile",
        category: category,
        fileName: displayName,
        isLegacy: isLegacy,
      });
    });
    topRow.appendChild(deleteBtn);
    item.appendChild(topRow);

    const descs = agentPolicyFileDescsCache[category] || {};
    const desc = descs[fileName] || descs[displayName];
    if (isSkill && desc) {
      const descDiv = document.createElement("div");
      descDiv.textContent = desc;
      descDiv.className = "skill-desc";
      item.appendChild(descDiv);
    }

    listContainer.appendChild(item);
  });
}

// AgentPolicy 파일 업로드 핸들러 (다중 파일 지원)
function setupAgentPolicyFileUpload(
  inputId,
  selectButtonId,
  uploadButtonId,
  statusId,
  fileNameId,
  category,
) {
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
  fileInput.addEventListener("change", (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) {
      return;
    }

    // MD 파일만 필터링
    const validFiles = files.filter(
      (f) => f.name.endsWith(".md") || f.name.endsWith(".markdown"),
    );

    if (validFiles.length === 0) {
      showStatus(statusElement, "Markdown 파일만 저장할 수 있습니다.", "error");
      fileInput.value = "";
      uploadButton.disabled = true;
      return;
    }

    if (validFiles.length < files.length) {
      showStatus(
        statusElement,
        `${files.length - validFiles.length}개의 비-Markdown 파일이 제외되었습니다.`,
        "info",
      );
    }

    selectedFiles = validFiles;
    if (fileNameElement) {
      fileNameElement.textContent = `선택된 파일: ${validFiles.map((f) => f.name).join(", ")}`;
    }
    uploadButton.disabled = false;
  });

  // 저장 버튼 클릭 (다중 파일 업로드 — 각 파일마다 미리보기 모달 표시)
  uploadButton.addEventListener("click", async () => {
    if (selectedFiles.length === 0) return;

    const typeSelector = document.querySelector(
      `.policy-type-selector[data-category="${category}"]`,
    );
    const activeTypeBtn = typeSelector
      ? typeSelector.querySelector(".policy-type-btn.active")
      : null;
    const policyType = activeTypeBtn ? activeTypeBtn.dataset.type : "rule";
    const skillDescInput = typeSelector
      ? typeSelector.querySelector(".policy-skill-desc")
      : null;
    const skillDescription =
      policyType === "skill" && skillDescInput
        ? skillDescInput.value.trim()
        : "";

    uploadButton.disabled = true;
    let savedCount = 0;
    let errorCount = 0;
    let cancelledCount = 0;
    const filesToProcess = selectedFiles.slice();

    for (const file of filesToProcess) {
      let content;
      try {
        content = await readFileAsText(file);
      } catch (error) {
        errorCount++;
        console.error(`Failed to read file ${file.name}:`, error);
        continue;
      }
      const hash = await _computeSha256Short(content);
      const suspicious = _detectSuspiciousClient(content);
      const confirmed = await new Promise((resolve) => {
        _showSkillPreviewModal(
          {
            originUrl: `로컬 파일: ${file.name}`,
            filename: file.name,
            size: content.length,
            hash,
            suspicious,
            content,
          },
          () => resolve(true),
          () => resolve(false),
        );
      });
      if (!confirmed) {
        cancelledCount++;
        continue;
      }
      vscode.postMessage({
        command: "addAgentPolicyFile",
        category: category,
        fileName: file.name,
        content: content,
        policyType: policyType,
        skillDescription: skillDescription,
      });
      savedCount++;
    }

    fileInput.value = "";
    selectedFiles = [];
    if (fileNameElement) fileNameElement.textContent = "";
    if (skillDescInput) skillDescInput.value = "";
    uploadButton.disabled = false;

    if (savedCount > 0 || cancelledCount > 0 || errorCount > 0) {
      const parts = [];
      if (savedCount > 0) parts.push(`${savedCount}개 저장 요청됨`);
      if (cancelledCount > 0) parts.push(`${cancelledCount}개 취소됨`);
      if (errorCount > 0) parts.push(`${errorCount}개 실패`);
      showStatus(
        statusElement,
        parts.join(", "),
        errorCount > 0 ? "error" : "success",
      );
    }
  });
}

// 파일을 텍스트로 읽기 (Promise 반환)
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(event.target.result);
    reader.onerror = () => reject(new Error("파일 읽기 실패"));
    reader.readAsText(file);
  });
}

// AgentPolicy 파일 로드 (모든 카테고리의 파일 목록 조회)
function loadAgentPolicyFiles() {
  vscode.postMessage({ command: "listAllAgentPolicyFiles" });
}

// 카테고리별 상태 요소 ID 매핑
const categoryStatusMap = {
  "global-rules": "global-rules-status",
  "stable-version": "stable-version-status",
  "coding-style": "coding-style-status",
  "project-architecture": "project-architecture-status",
  "dependency-policy": "dependency-policy-status",
  "db-policy": "db-policy-status",
};

// 파일 업로드/경로/URL setup 호출 제거 — 통합 모달로 대체
// AgentPolicy 경로 입력 설정
function setupAgentPolicyPathInput(category, pathInputId, buttonId, statusId) {
  const pathInput = document.getElementById(pathInputId);
  const addButton = document.getElementById(buttonId);
  const statusElement = document.getElementById(statusId);
  if (!pathInput || !addButton) return;

  addButton.addEventListener("click", () => {
    const filePath = pathInput.value.trim();
    if (!filePath) {
      if (statusElement)
        showStatus(statusElement, "파일 경로를 입력하세요.", "error");
      return;
    }
    if (!filePath.endsWith(".md") && !filePath.endsWith(".markdown")) {
      if (statusElement)
        showStatus(
          statusElement,
          "Markdown 파일(.md)만 추가할 수 있습니다.",
          "error",
        );
      return;
    }
    // 타입 선택 정보 가져오기
    const typeSelector = document.querySelector(
      `.policy-type-selector[data-category="${category}"]`,
    );
    const activeTypeBtn = typeSelector
      ? typeSelector.querySelector(".policy-type-btn.active")
      : null;
    const policyType = activeTypeBtn ? activeTypeBtn.dataset.type : "rule";
    const skillDescInput = typeSelector
      ? typeSelector.querySelector(".policy-skill-desc")
      : null;
    const skillDescription =
      policyType === "skill" && skillDescInput
        ? skillDescInput.value.trim()
        : "";

    if (statusElement) showStatus(statusElement, "미리보기 중...", "info");
    addButton.disabled = true;
    // 백엔드에 미리보기 요청 — 응답은 agentPolicyPathPreview 핸들러에서 모달 표시 후 addPathAgentPolicy 전송
    vscode.postMessage({
      command: "previewAgentPolicyPath",
      category,
      filePath,
      policyType,
      skillDescription,
    });
  });

  pathInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addButton.click();
  });
}

// ─── URL 다운로드로 Skill/Rule 추가 ───────────────────────────────
function setupAgentPolicyUrlDownload(category) {
  const pathInput = document.getElementById(`path-${category}-input`);
  if (!pathInput) return;
  const pathGroup = pathInput.closest(".api-key-input-group");
  if (!pathGroup) return;
  if (document.getElementById(`url-${category}-input`)) return;

  const urlGroup = document.createElement("div");
  urlGroup.className = "api-key-input-group";
  urlGroup.style.marginTop = "6px";
  const urlInput = document.createElement("input");
  urlInput.type = "text";
  urlInput.id = `url-${category}-input`;
  urlInput.className = "api-key-input";
  urlInput.placeholder = "URL에서 .md 다운로드 (https://...)";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = `download-${category}-button`;
  btn.textContent = "URL 다운로드";
  urlGroup.appendChild(urlInput);
  urlGroup.appendChild(btn);
  pathGroup.insertAdjacentElement("afterend", urlGroup);

  const statusElement = document.getElementById(`${category}-status`);
  const doDownload = () => {
    const url = urlInput.value.trim();
    if (!url) {
      if (statusElement)
        showStatus(statusElement, "URL을 입력하세요.", "error");
      return;
    }
    if (statusElement) showStatus(statusElement, "다운로드 중...", "info");
    btn.disabled = true;
    const typeSelector = document.querySelector(
      `.policy-type-selector[data-category="${category}"]`,
    );
    const activeTypeBtn = typeSelector
      ? typeSelector.querySelector(".policy-type-btn.active")
      : null;
    const policyType = activeTypeBtn ? activeTypeBtn.dataset.type : "rule";
    const skillDescInput = typeSelector
      ? typeSelector.querySelector(".policy-skill-desc")
      : null;
    const skillDescription =
      policyType === "skill" && skillDescInput
        ? skillDescInput.value.trim()
        : "";
    vscode.postMessage({
      command: "downloadSkillFromUrl",
      url,
      category,
      policyType,
      skillDescription,
    });
  };
  btn.addEventListener("click", doDownload);
  urlInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doDownload();
  });
}

function _showSkillPreviewModal(data, onConfirm, onCancel) {
  const existing = document.getElementById("skill-preview-modal");
  if (existing) existing.remove();

  const isLight =
    document.body.getAttribute("data-theme") === "light" ||
    document.body.classList.contains("vscode-light") ||
    document.documentElement.getAttribute("data-theme") === "light";

  {
    const prev = document.getElementById("md-preview-modal-style");
    if (prev) prev.remove();
    const style = document.createElement("style");
    style.id = "md-preview-modal-style";
    const scrollbarCss = isLight
      ? `
        #skill-preview-modal .md-preview-pre::-webkit-scrollbar { width: 8px !important; height: 8px !important; }
        #skill-preview-modal .md-preview-pre::-webkit-scrollbar-track { background: #f3f4f6 !important; }
        #skill-preview-modal .md-preview-pre::-webkit-scrollbar-thumb { background: #9ca3af !important; border-radius: 4px !important; }
        #skill-preview-modal .md-preview-pre::-webkit-scrollbar-thumb:hover { background: #6b7280 !important; }
        #skill-preview-modal .md-preview-pre::-webkit-scrollbar-corner { background: #f3f4f6 !important; }`
      : `
        #skill-preview-modal .md-preview-pre::-webkit-scrollbar { width: 8px !important; height: 8px !important; }
        #skill-preview-modal .md-preview-pre::-webkit-scrollbar-track { background: transparent !important; }
        #skill-preview-modal .md-preview-pre::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2) !important; border-radius: 4px !important; }
        #skill-preview-modal .md-preview-pre::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.35) !important; }`;
    style.textContent = `
      #skill-preview-modal .md-preview-meta b { color: inherit; font-weight: 600; margin-right: 4px; }
      #skill-preview-modal .md-preview-meta code {
        background: transparent !important;
        padding: 0 !important;
        color: inherit !important;
        font-family: var(--vscode-editor-font-family, "SFMono-Regular", Consolas, "Courier New", monospace);
        font-size: inherit !important;
        word-break: break-all;
      }
      ${scrollbarCss}
    `;
    document.head.appendChild(style);
  }

  const overlay = document.createElement("div");
  overlay.id = "skill-preview-modal";
  overlay.style.cssText =
    "position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:10000;display:flex;align-items:center;justify-content:center;";

  const boxBg = isLight ? "#ffffff" : "var(--vscode-editor-background,#1e1e1e)";
  const boxBorder = isLight ? "#e5e7eb" : "var(--vscode-input-border,#444)";
  const boxFg = isLight ? "#111827" : "var(--vscode-foreground,#ccc)";
  const metaFg = isLight
    ? "#4b5563"
    : "var(--vscode-descriptionForeground,#888)";
  const preBg = isLight
    ? "#f3f4f6"
    : "var(--vscode-textCodeBlock-background,#2a2a2a)";
  const preFg = isLight ? "#1f2937" : "var(--vscode-foreground,#d4d4d4)";

  const box = document.createElement("div");
  box.style.cssText = `background:${boxBg};color:${boxFg};border:1px solid ${boxBorder};border-radius:6px;width:80%;max-width:820px;max-height:80vh;padding:16px;display:flex;flex-direction:column;gap:8px;font-family:var(--vscode-font-family);`;

  const title = document.createElement("h3");
  title.style.cssText = `margin:0 0 4px 0;font-size:1em;color:${boxFg};`;
  title.textContent = "MD 미리보기";
  box.appendChild(title);

  const metaRoot = document.createElement("div");
  metaRoot.className = "md-preview-meta";
  metaRoot.style.cssText = `font-size:0.82em;color:${metaFg};line-height:1.6;`;
  const addMetaRow = (label, value) => {
    if (value == null || value === "") return;
    const row = document.createElement("div");
    const b = document.createElement("b");
    b.textContent = `${label} `;
    row.appendChild(b);
    const code = document.createElement("code");
    code.textContent = String(value);
    row.appendChild(code);
    metaRoot.appendChild(row);
  };
  addMetaRow("출처:", data.originUrl);
  addMetaRow(
    "크기:",
    `${data.size} bytes${data.hash ? ` · SHA256(16): ${data.hash}` : ""}`,
  );
  addMetaRow("파일명:", data.filename);
  box.appendChild(metaRoot);

  if (Array.isArray(data.suspicious) && data.suspicious.length > 0) {
    const warn = document.createElement("div");
    warn.style.cssText =
      "background:rgba(245,158,11,0.18);border-left:3px solid #f59e0b;padding:8px;font-size:0.85em;color:" +
      (isLight ? "#92400e" : "#fbbf24") +
      ";";
    const head = document.createElement("div");
    head.textContent = "⚠️ 의심 패턴 감지:";
    warn.appendChild(head);
    data.suspicious.forEach((s) => {
      const line = document.createElement("div");
      line.textContent = `• ${String(s)}`;
      warn.appendChild(line);
    });
    box.appendChild(warn);
  }

  const pre = document.createElement("pre");
  pre.className = "md-preview-pre";
  pre.style.cssText = `flex:1;overflow:auto;background:${preBg};color:${preFg};padding:8px;margin:0;font-size:0.78em;max-height:45vh;border-radius:4px;white-space:pre;border:1px solid ${boxBorder};`;
  pre.textContent = String(data.content || "");
  box.appendChild(pre);

  const actions = document.createElement("div");
  actions.style.cssText =
    "display:flex;gap:8px;justify-content:flex-end;margin-top:4px;";
  const btnStyle = isLight
    ? "padding:6px 14px;background:transparent;color:#4b5563;border:1px solid #9ca3af;border-radius:3px;cursor:pointer;font-size:12px;"
    : "padding:6px 14px;background:transparent;color:var(--vscode-foreground);border:1px solid rgba(255,255,255,0.35);border-radius:3px;cursor:pointer;font-size:12px;";
  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.textContent = "취소";
  cancelBtn.style.cssText = btnStyle;
  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.textContent = "저장";
  saveBtn.style.cssText = btnStyle;
  actions.appendChild(cancelBtn);
  actions.appendChild(saveBtn);
  box.appendChild(actions);

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  cancelBtn.addEventListener("click", () => {
    overlay.remove();
    if (onCancel) onCancel();
  });
  saveBtn.addEventListener("click", () => {
    overlay.remove();
    if (onConfirm) onConfirm();
  });
}

async function _computeSha256Short(content) {
  try {
    const data = new TextEncoder().encode(String(content || ""));
    const buf = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 16);
  } catch {
    return "";
  }
}

function _detectSuspiciousClient(content) {
  const matches = [];
  const patterns = [
    [
      /ignore\s+(previous|all|above)\s+(instructions|rules|directives)/i,
      "이전 지시 무시 유도 문구",
    ],
    [/disregard\s+(previous|all|above)/i, "이전 지시 무시 유도 문구"],
    [/^\s*(system|assistant)\s*:\s*/im, "역할 태그 흉내 (system:/assistant:)"],
    [/[A-Za-z0-9+/=]{200,}/, "매우 긴 base64/hex 블록"],
    [/\bcurl\s+[^\s]+|\bwget\s+[^\s]+/i, "외부 커맨드 호출 (curl/wget)"],
    [/<!--\s*prompt\s*injection\s*-->/i, "prompt injection 마커"],
    [/(new\s+)?function\s*\(|eval\s*\(|require\s*\(/i, "JS 코드 실행 패턴"],
  ];
  for (const [re, label] of patterns) {
    if (re.test(content) && !matches.includes(label)) matches.push(label);
  }
  return matches;
}

// ────────────────────────────────────────────────────────────
// Skills/Rules 추가 — 통합 모달 (타입 + 방법 드롭다운)
// ────────────────────────────────────────────────────────────

function _showAddPolicyModal(category, onSubmit) {
  const existing = document.getElementById("add-policy-modal");
  if (existing) existing.remove();

  const isLight =
    document.body.getAttribute("data-theme") === "light" ||
    document.body.classList.contains("vscode-light") ||
    document.documentElement.getAttribute("data-theme") === "light";

  const boxBg = isLight ? "#ffffff" : "var(--vscode-editor-background,#1e1e1e)";
  const boxBorder = isLight ? "#e5e7eb" : "var(--vscode-input-border,#444)";
  const boxFg = isLight ? "#111827" : "var(--vscode-foreground,#ccc)";
  const labelFg = isLight
    ? "#4b5563"
    : "var(--vscode-descriptionForeground,#aaa)";
  const inputBg = isLight
    ? "#ffffff"
    : "var(--vscode-input-background,#3c3c3c)";
  const inputBorder = isLight ? "#d1d5db" : "var(--vscode-input-border,#555)";
  const inputFg = isLight ? "#111827" : "var(--vscode-input-foreground,#ccc)";
  const btnOutline = isLight
    ? "background:transparent;color:#4b5563;border:1px solid #9ca3af;"
    : "background:transparent;color:var(--vscode-foreground);border:1px solid rgba(255,255,255,0.35);";
  const btnPrimary =
    "background:#2563eb;color:#ffffff;border:1px solid #2563eb;";

  const overlay = document.createElement("div");
  overlay.id = "add-policy-modal";
  overlay.style.cssText =
    "position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:10000;display:flex;align-items:center;justify-content:center;";

  const box = document.createElement("div");
  box.style.cssText = `background:${boxBg};color:${boxFg};border:1px solid ${boxBorder};border-radius:6px;width:80%;max-width:560px;padding:16px;display:flex;flex-direction:column;gap:12px;font-family:var(--vscode-font-family);`;

  const title = document.createElement("h3");
  title.style.cssText = `margin:0;font-size:1em;color:${boxFg};`;
  title.textContent = "Skill/Rule 추가";
  box.appendChild(title);

  const typeRow = document.createElement("div");
  typeRow.style.cssText = "display:flex;flex-direction:column;gap:4px;";
  const typeLabel = document.createElement("label");
  typeLabel.textContent = "타입";
  typeLabel.style.cssText = `font-size:0.85em;color:${labelFg};`;
  typeRow.appendChild(typeLabel);
  const typeGroup = document.createElement("div");
  typeGroup.style.cssText = `display:flex;border:1px solid ${inputBorder};border-radius:4px;overflow:hidden;width:fit-content;`;
  let currentType = "rule";
  // 클래스 `.policy-type-btn` 사용 — 전역 라이트 :not(.policy-type-btn) override 회피 + .active 시 파란색 규칙 적용
  const ruleBtn = document.createElement("button");
  ruleBtn.type = "button";
  ruleBtn.className = "policy-type-btn active";
  ruleBtn.dataset.type = "rule";
  ruleBtn.textContent = "규칙";
  ruleBtn.style.cssText =
    "padding:6px 14px;font-size:0.85em;border:none;cursor:pointer;";
  const skillBtn = document.createElement("button");
  skillBtn.type = "button";
  skillBtn.className = "policy-type-btn";
  skillBtn.dataset.type = "skill";
  skillBtn.textContent = "스킬";
  skillBtn.style.cssText = `padding:6px 14px;font-size:0.85em;border:none;border-left:1px solid ${inputBorder};cursor:pointer;`;
  typeGroup.appendChild(ruleBtn);
  typeGroup.appendChild(skillBtn);
  typeRow.appendChild(typeGroup);

  const skillDescInput = document.createElement("input");
  skillDescInput.type = "text";
  skillDescInput.placeholder = "이 스킬이 필요한 상황을 설명하세요";
  skillDescInput.style.cssText = `display:none;padding:6px 8px;font-size:0.85em;background:${inputBg};color:${inputFg};border:1px solid ${inputBorder};border-radius:3px;margin-top:4px;`;
  typeRow.appendChild(skillDescInput);

  const setType = (t) => {
    currentType = t;
    if (t === "skill") {
      skillBtn.classList.add("active");
      ruleBtn.classList.remove("active");
      skillDescInput.style.display = "";
    } else {
      ruleBtn.classList.add("active");
      skillBtn.classList.remove("active");
      skillDescInput.style.display = "none";
    }
  };
  ruleBtn.addEventListener("click", () => setType("rule"));
  skillBtn.addEventListener("click", () => setType("skill"));
  box.appendChild(typeRow);

  const methodRow = document.createElement("div");
  methodRow.style.cssText = "display:flex;flex-direction:column;gap:4px;";
  const methodLabel = document.createElement("label");
  methodLabel.textContent = "추가 방법";
  methodLabel.style.cssText = `font-size:0.85em;color:${labelFg};`;
  methodRow.appendChild(methodLabel);
  const methodSelect = document.createElement("select");
  methodSelect.style.cssText = `padding:6px 8px;font-size:0.9em;background:${inputBg};color:${inputFg};border:1px solid ${inputBorder};border-radius:3px;`;
  [
    ["file", "파일 업로드"],
    ["path", "경로 추가"],
    ["url", "URL 다운로드"],
  ].forEach(([v, label]) => {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = label;
    methodSelect.appendChild(opt);
  });
  methodRow.appendChild(methodSelect);
  box.appendChild(methodRow);

  const inputArea = document.createElement("div");
  inputArea.style.cssText = "display:flex;flex-direction:column;gap:4px;";
  box.appendChild(inputArea);

  const statusEl = document.createElement("p");
  statusEl.style.cssText = `font-size:0.8em;margin:0;min-height:1.2em;color:${labelFg};`;
  box.appendChild(statusEl);

  let selectedFiles = [];
  let pathValue = "";
  let urlValue = "";
  const clearInputArea = () => {
    while (inputArea.firstChild) inputArea.removeChild(inputArea.firstChild);
  };
  const renderInput = () => {
    clearInputArea();
    statusEl.textContent = "";
    const m = methodSelect.value;
    if (m === "file") {
      const fileLabel = document.createElement("label");
      fileLabel.textContent = "Markdown 파일 (.md)";
      fileLabel.style.cssText = `font-size:0.85em;color:${labelFg};`;
      const fileBtn = document.createElement("button");
      fileBtn.type = "button";
      fileBtn.textContent = "파일 선택";
      fileBtn.style.cssText = `padding:6px 14px;font-size:0.85em;${btnOutline}border-radius:3px;cursor:pointer;width:fit-content;`;
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = ".md,.markdown,text/markdown";
      fileInput.multiple = true;
      fileInput.style.display = "none";
      const fileNameEl = document.createElement("p");
      fileNameEl.style.cssText = `font-size:0.8em;margin:0;color:${labelFg};`;
      fileBtn.addEventListener("click", () => fileInput.click());
      fileInput.addEventListener("change", (e) => {
        selectedFiles = Array.from(e.target.files || []).filter(
          (f) => f.name.endsWith(".md") || f.name.endsWith(".markdown"),
        );
        fileNameEl.textContent = selectedFiles.length
          ? `선택: ${selectedFiles.map((f) => f.name).join(", ")}`
          : "";
      });
      inputArea.appendChild(fileLabel);
      inputArea.appendChild(fileBtn);
      inputArea.appendChild(fileInput);
      inputArea.appendChild(fileNameEl);
    } else if (m === "path") {
      const pathLabel = document.createElement("label");
      pathLabel.textContent = "파일 경로 (절대 경로)";
      pathLabel.style.cssText = `font-size:0.85em;color:${labelFg};`;
      const pathInput = document.createElement("input");
      pathInput.type = "text";
      pathInput.placeholder = "/path/to/file.md";
      pathInput.value = pathValue;
      pathInput.style.cssText = `padding:6px 8px;font-size:0.85em;background:${inputBg};color:${inputFg};border:1px solid ${inputBorder};border-radius:3px;`;
      pathInput.addEventListener("input", (e) => {
        pathValue = e.target.value;
      });
      inputArea.appendChild(pathLabel);
      inputArea.appendChild(pathInput);
    } else if (m === "url") {
      const urlLabel = document.createElement("label");
      urlLabel.textContent = "URL (https://...)";
      urlLabel.style.cssText = `font-size:0.85em;color:${labelFg};`;
      const urlInput = document.createElement("input");
      urlInput.type = "text";
      urlInput.placeholder = "https://example.com/file.md";
      urlInput.value = urlValue;
      urlInput.style.cssText = `padding:6px 8px;font-size:0.85em;background:${inputBg};color:${inputFg};border:1px solid ${inputBorder};border-radius:3px;`;
      urlInput.addEventListener("input", (e) => {
        urlValue = e.target.value;
      });
      inputArea.appendChild(urlLabel);
      inputArea.appendChild(urlInput);
    }
  };
  methodSelect.addEventListener("change", renderInput);
  renderInput();

  const actions = document.createElement("div");
  actions.style.cssText =
    "display:flex;gap:8px;justify-content:flex-end;margin-top:4px;";
  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.textContent = "취소";
  cancelBtn.style.cssText = `padding:6px 14px;font-size:0.85em;${btnOutline}border-radius:3px;cursor:pointer;`;
  const nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.textContent = "다음";
  nextBtn.style.cssText = `padding:6px 14px;font-size:0.85em;${btnPrimary}border-radius:3px;cursor:pointer;`;
  actions.appendChild(cancelBtn);
  actions.appendChild(nextBtn);
  box.appendChild(actions);

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  cancelBtn.addEventListener("click", () => overlay.remove());
  nextBtn.addEventListener("click", () => {
    const m = methodSelect.value;
    const skillDescription =
      currentType === "skill" ? skillDescInput.value.trim() : "";
    if (currentType === "skill" && !skillDescription) {
      statusEl.textContent = "스킬 설명을 입력하세요.";
      statusEl.style.color = "#ef4444";
      return;
    }
    if (m === "file") {
      if (selectedFiles.length === 0) {
        statusEl.textContent = "파일을 선택하세요.";
        statusEl.style.color = "#ef4444";
        return;
      }
    } else if (m === "path") {
      if (!pathValue.trim()) {
        statusEl.textContent = "파일 경로를 입력하세요.";
        statusEl.style.color = "#ef4444";
        return;
      }
      const p = pathValue.trim();
      if (!p.endsWith(".md") && !p.endsWith(".markdown")) {
        statusEl.textContent = "Markdown 파일(.md)만 추가할 수 있습니다.";
        statusEl.style.color = "#ef4444";
        return;
      }
    } else if (m === "url") {
      if (!urlValue.trim()) {
        statusEl.textContent = "URL을 입력하세요.";
        statusEl.style.color = "#ef4444";
        return;
      }
    }
    overlay.remove();
    onSubmit({
      policyType: currentType,
      skillDescription,
      method: m,
      files: m === "file" ? selectedFiles : [],
      filePath: m === "path" ? pathValue.trim() : "",
      url: m === "url" ? urlValue.trim() : "",
    });
  });
}

async function openAddPolicyFlow(category) {
  const statusEl = document.getElementById(`${category}-status`);
  // 이전 상태 메시지 초기화 — Add 플로우 시작 시
  if (statusEl) {
    statusEl.textContent = "";
    statusEl.className = "info-message";
  }
  _showAddPolicyModal(category, async (data) => {
    const { policyType, skillDescription, method, files, filePath, url } = data;
    if (method === "file") {
      let savedCount = 0;
      let cancelledCount = 0;
      for (const file of files) {
        let content;
        try {
          content = await readFileAsText(file);
        } catch {
          if (statusEl)
            showStatus(statusEl, `파일 읽기 실패: ${file.name}`, "error");
          continue;
        }
        const hash = await _computeSha256Short(content);
        const suspicious = _detectSuspiciousClient(content);
        const confirmed = await new Promise((resolve) => {
          _showSkillPreviewModal(
            {
              originUrl: `로컬 파일: ${file.name}`,
              filename: file.name,
              size: content.length,
              hash,
              suspicious,
              content,
            },
            () => resolve(true),
            () => resolve(false),
          );
        });
        if (!confirmed) {
          cancelledCount++;
          continue;
        }
        vscode.postMessage({
          command: "addAgentPolicyFile",
          category,
          fileName: file.name,
          content,
          policyType,
          skillDescription,
        });
        savedCount++;
      }
      if (statusEl) {
        if (savedCount > 0) showStatus(statusEl, "저장 중...", "info");
        else if (cancelledCount > 0) showStatus(statusEl, "취소됨", "info");
      }
    } else if (method === "path") {
      if (statusEl) showStatus(statusEl, "미리보기 중...", "info");
      vscode.postMessage({
        command: "previewAgentPolicyPath",
        category,
        filePath,
        policyType,
        skillDescription,
      });
    } else if (method === "url") {
      if (statusEl) showStatus(statusEl, "다운로드 중...", "info");
      vscode.postMessage({
        command: "downloadSkillFromUrl",
        url,
        category,
        policyType,
        skillDescription,
      });
    }
  });
}

// + 추가 버튼 바인딩 (6개 카테고리)
[
  "global-rules",
  "stable-version",
  "coding-style",
  "project-architecture",
  "dependency-policy",
  "db-policy",
].forEach((cat) => {
  const btn = document.getElementById(`add-${cat}-button`);
  if (btn) btn.addEventListener("click", () => openAddPolicyFlow(cat));
});

// AgentPolicy 관련 메시지 핸들러 (다중 파일 지원)
window.addEventListener("message", (event) => {
  const message = event.data;

  switch (message.command) {
    // 모든 카테고리 파일 목록 로드 완료
    case "allAgentPolicyFilesList":
      if (message.files) {
        const fileTypes = message.fileTypes || {};
        const fileDescs = message.fileDescriptions || {};
        for (const category of Object.keys(message.files)) {
          renderPolicyFileList(
            category,
            message.files[category],
            fileTypes[category],
            fileDescs[category],
          );
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
          showStatus(
            document.getElementById(statusId),
            `"${message.fileName}" 파일이 저장되었습니다.`,
            "success",
          );
        }
        // 경로 입력 초기화 및 버튼 활성화
        const addPathBtn = document.getElementById(
          `add-path-${message.category}-button`,
        );
        const pathInput = document.getElementById(
          `path-${message.category}-input`,
        );
        if (addPathBtn) addPathBtn.disabled = false;
        if (pathInput) pathInput.value = "";
        // 파일 목록 새로고침
        vscode.postMessage({ command: "listAllAgentPolicyFiles" });
      }
      break;

    // 파일 추가 에러
    case "agentPolicyFileAddError":
      if (message.category) {
        const statusId = categoryStatusMap[message.category];
        if (statusId) {
          showStatus(
            document.getElementById(statusId),
            `저장 실패: ${message.error}`,
            "error",
          );
          // 업로드 버튼 및 경로 추가 버튼 다시 활성화
          const uploadBtnId = `upload-${message.category}-button`;
          const uploadBtn = document.getElementById(uploadBtnId);
          if (uploadBtn) uploadBtn.disabled = false;
          const addPathBtn = document.getElementById(
            `add-path-${message.category}-button`,
          );
          if (addPathBtn) addPathBtn.disabled = false;
        }
      }
      break;

    // URL 다운로드 미리보기 — 모달 표시 후 승인 시 기존 저장 경로 재사용
    case "skillUrlDownloadPreview": {
      const previewStatusEl = document.getElementById(
        `${message.category}-status`,
      );
      const previewBtn = document.getElementById(
        `download-${message.category}-button`,
      );
      if (previewBtn) previewBtn.disabled = false;
      _showSkillPreviewModal(
        message,
        () => {
          vscode.postMessage({
            command: "addAgentPolicyFile",
            category: message.category,
            fileName: message.filename,
            content: message.content,
            policyType: message.policyType,
            skillDescription: message.skillDescription,
          });
          if (previewStatusEl)
            showStatus(previewStatusEl, "저장 중...", "info");
          const urlInputEl = document.getElementById(
            `url-${message.category}-input`,
          );
          if (urlInputEl) urlInputEl.value = "";
        },
        () => {
          if (previewStatusEl) showStatus(previewStatusEl, "취소됨", "info");
        },
      );
      break;
    }

    // 경로 추가 미리보기 응답 — 승인 시 addPathAgentPolicy 로 저장
    case "agentPolicyPathPreview": {
      const previewStatusEl = document.getElementById(
        `${message.category}-status`,
      );
      const previewBtn = document.getElementById(
        `add-path-${message.category}-button`,
      );
      if (previewBtn) previewBtn.disabled = false;
      _showSkillPreviewModal(
        message,
        () => {
          vscode.postMessage({
            command: "addPathAgentPolicy",
            category: message.category,
            filePath: message.filePath,
            policyType: message.policyType,
            skillDescription: message.skillDescription,
          });
          if (previewStatusEl)
            showStatus(previewStatusEl, "저장 중...", "info");
          const pathInputEl = document.getElementById(
            `path-${message.category}-input`,
          );
          if (pathInputEl) pathInputEl.value = "";
          const typeSelector = document.querySelector(
            `.policy-type-selector[data-category="${message.category}"]`,
          );
          const skillDescInput = typeSelector
            ? typeSelector.querySelector(".policy-skill-desc")
            : null;
          if (skillDescInput) skillDescInput.value = "";
        },
        () => {
          if (previewStatusEl) showStatus(previewStatusEl, "취소됨", "info");
        },
      );
      break;
    }
    case "agentPolicyPathPreviewError": {
      const errStatusEl = document.getElementById(`${message.category}-status`);
      const errBtn = document.getElementById(
        `add-path-${message.category}-button`,
      );
      if (errBtn) errBtn.disabled = false;
      if (errStatusEl)
        showStatus(errStatusEl, `미리보기 실패: ${message.error}`, "error");
      break;
    }
    case "skillUrlDownloadError": {
      const errStatusEl = document.getElementById(`${message.category}-status`);
      const errBtn = document.getElementById(
        `download-${message.category}-button`,
      );
      if (errBtn) errBtn.disabled = false;
      if (errStatusEl)
        showStatus(errStatusEl, `다운로드 실패: ${message.error}`, "error");
      break;
    }

    // Skills 전체 초기화 완료
    case "allSkillsReset":
      // 모든 파일 목록 UI 비우기
      document.querySelectorAll(".policy-file-list").forEach((el) => {
        el.innerHTML = "";
      });
      // 상태 메시지 초기화
      [
        "stable-version-status",
        "coding-style-status",
        "project-architecture-status",
        "dependency-policy-status",
        "db-policy-status",
      ].forEach((id) => {
        const el = document.getElementById(id);
        if (el) showStatus(el, "초기화 완료", "success");
      });
      break;

    // 파일 삭제 완료
    case "agentPolicyFileDeleted":
      if (message.category && message.fileName) {
        const statusId = categoryStatusMap[message.category];
        if (statusId) {
          showStatus(
            document.getElementById(statusId),
            `"${message.fileName}" 파일이 삭제되었습니다.`,
            "success",
          );
        }
        // 파일 목록 새로고침
        vscode.postMessage({ command: "listAllAgentPolicyFiles" });
      }
      break;

    // 파일 삭제 에러
    case "agentPolicyFileDeleteError":
      if (message.category) {
        const statusId = categoryStatusMap[message.category];
        if (statusId) {
          showStatus(
            document.getElementById(statusId),
            `삭제 실패: ${message.error}`,
            "error",
          );
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
      // 폼 숨김 + 초기화
      hideHotLoadForm();
      // 목록 새로고침
      vscode.postMessage({ command: "getHotLoads" });
      break;

    case "hotLoadsError":
    case "hotLoadAddError":
    case "hotLoadUpdateError":
    case "hotLoadDeleteError":
      showStatus(
        document.getElementById("hotload-add-status"),
        message.error || "오류가 발생했습니다.",
        "error",
      );
      break;

    // ========== 컨텍스트 제외 패턴 관련 메시지 핸들러 ==========
    case "contextExclusions":
      renderContextExclusionLists(
        message.defaultPatterns,
        message.customPatterns,
        message.disabledPatterns,
      );
      break;

    case "contextExclusionAdded":
      hideContextExclusionForm();
      // 목록 새로고침
      vscode.postMessage({ command: "getContextExclusions" });
      break;
    case "contextExclusionDeleted":
      // 목록 새로고침
      vscode.postMessage({ command: "getContextExclusions" });
      break;

    case "contextExclusionsError":
    case "contextExclusionAddError":
    case "contextExclusionDeleteError":
    case "defaultExclusionToggleError":
      showStatus(
        document.getElementById("context-exclusion-status"),
        message.error || "오류가 발생했습니다.",
        "error",
      );
      break;

    case "defaultExclusionToggled":
      // 목록 새로고침
      vscode.postMessage({ command: "getContextExclusions" });
      break;

    // ========== 보안 규칙 관련 메시지 핸들러 ==========
    case "securityRules":
      renderSecurityRulesLists(
        message.defaultBlockedCommands,
        message.defaultProtectedFiles,
        message.customBlockedCommands,
        message.customProtectedFiles,
        message.customHiddenFiles,
        message.disabledBlockedCommands,
        message.disabledProtectedFiles,
      );
      break;

    case "securityRuleAdded":
    case "blockedCommandAdded":
      hideSecurityRuleForm();
      vscode.postMessage({ command: "getSecurityRules" });
      break;
    case "securityRuleDeleted":
    case "blockedCommandDeleted":
      vscode.postMessage({ command: "getSecurityRules" });
      break;

    case "protectedFileAdded":
      hideSecurityRuleForm();
      vscode.postMessage({ command: "getSecurityRules" });
      break;
    case "protectedFileDeleted":
      vscode.postMessage({ command: "getSecurityRules" });
      break;

    case "blockedCommandToggled":
    case "protectedFileToggled":
      // 목록 새로고침
      vscode.postMessage({ command: "getSecurityRules" });
      break;

    case "securityRulesError":
    case "securityRuleAddError":
    case "securityRuleDeleteError":
    case "blockedCommandAddError":
    case "blockedCommandDeleteError":
    case "blockedCommandToggleError":
    case "protectedFileAddError":
    case "protectedFileDeleteError":
    case "protectedFileToggleError":
      showStatus(
        document.getElementById("security-rule-status"),
        message.error || "오류가 발생했습니다.",
        "error",
      );
      break;

    // v9.7.0: 사용량 메트릭 처리
    case "usageMetricsData":
      updateUsageMetricsUI(message.metrics, message.toolStats);
      break;

    case "usageMetricsReset":
      // 리셋 후 새로고침
      vscode.postMessage({ command: "getUsageMetrics" });
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
  const formTitle = document.getElementById("hotload-form-title");

  if (keywordsInput) keywordsInput.value = "";
  if (descriptionInput) descriptionInput.value = "";
  if (commandInput) commandInput.value = "";
  if (conditionType) conditionType.value = "none";
  if (conditionValue) {
    conditionValue.value = "";
    conditionValue.style.display = "none";
  }
  if (maxRetries) maxRetries.value = "0";
  if (onFailure) onFailure.value = "stop";
  if (addButton) {
    addButton.textContent = "저장";
    delete addButton.dataset.editId;
  }
  if (formTitle) formTitle.textContent = "Hot Load 추가";
}

function showHotLoadForm() {
  const form = document.getElementById("hotload-add-form");
  const toggleBtn = document.getElementById("hotload-add-toggle-button");
  if (form) form.style.display = "";
  if (toggleBtn) toggleBtn.style.display = "none";
}

function hideHotLoadForm() {
  const form = document.getElementById("hotload-add-form");
  const toggleBtn = document.getElementById("hotload-add-toggle-button");
  if (form) form.style.display = "none";
  if (toggleBtn) toggleBtn.style.display = "";
  clearHotLoadForm();
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

  // 관리자 항목(immutable/fromServer)은 org-settings-hotload에서 별도 표시 → 개인 목록에서 제외
  const personalHotLoads = (hotLoads || []).filter(
    (h) => !h.immutable && !h.fromServer,
  );

  if (personalHotLoads.length === 0) {
    listContainer.innerHTML = "";
    if (emptyMessage) {
      emptyMessage.style.display = "block";
    }
    return;
  }

  if (emptyMessage) {
    emptyMessage.style.display = "none";
  }

  listContainer.innerHTML = personalHotLoads
    .map((item) => {
      // 확장 필드 표시 텍스트
      let extraInfo = "";
      if (item.maxRetries && item.maxRetries > 0) {
        extraInfo += `<span style="margin-right: 8px; font-size: 0.8em; color: var(--vscode-descriptionForeground);">재시도: ${item.maxRetries}회</span>`;
      }
      if (item.completionCondition) {
        const condLabels = {
          exit_code: "종료코드",
          output_contains: "출력포함",
          output_not_contains: "출력미포함",
          file_exists: "파일존재",
        };
        const condLabel =
          condLabels[item.completionCondition.type] ||
          item.completionCondition.type;
        extraInfo += `<span style="margin-right: 8px; font-size: 0.8em; color: var(--vscode-descriptionForeground);">${condLabel}: ${escapeHtml(item.completionCondition.value)}</span>`;
      }
      if (item.onFailure && item.onFailure !== "stop") {
        const failLabels = { notify: "알림", pass_to_llm: "LLM전달" };
        extraInfo += `<span style="font-size: 0.8em; color: var(--vscode-descriptionForeground);">실패: ${failLabels[item.onFailure] || item.onFailure}</span>`;
      }

      return `
    <div class="api-key-section" data-id="${item.id}" style="margin-bottom: 10px;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <strong style="font-size: 0.9em;">${escapeHtml(item.keywords)}</strong>
          <span style="font-size: 0.85em; color: var(--vscode-descriptionForeground);">${escapeHtml(item.description)}</span>
        </div>
        <div style="display: flex; gap: 5px;">
          <button class="edit-hotload-btn" data-id="${item.id}">수정</button>
          <button class="delete-hotload-btn" data-id="${item.id}">삭제</button>
        </div>
      </div>
      <p style="margin-top: 5px; font-size: 0.85em; color: var(--vscode-descriptionForeground); font-family: monospace;">${escapeHtml(item.command)}</p>
      ${extraInfo ? `<div style="margin-top: 4px;">${extraInfo}</div>` : ""}
    </div>
  `;
    })
    .join("");

  // 삭제 버튼 이벤트 바인딩
  // VSCode webview에서 confirm()이 작동하지 않으므로 바로 삭제 요청
  listContainer.querySelectorAll(".delete-hotload-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const id = parseInt(e.currentTarget.dataset.id);
      vscode.postMessage({ command: "deleteHotLoad", id: id });
    });
  });

  // 편집 버튼 이벤트 바인딩
  listContainer.querySelectorAll(".edit-hotload-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const id = parseInt(e.currentTarget.dataset.id);
      const item = hotLoads.find((h) => h.id === id);
      if (item) {
        const keywordsInput = document.getElementById("hotload-keywords-input");
        const descriptionInput = document.getElementById(
          "hotload-description-input",
        );
        const commandInput = document.getElementById("hotload-command-input");
        const addButton = document.getElementById("add-hotload-button");
        const conditionType = document.getElementById("hotload-condition-type");
        const conditionValue = document.getElementById(
          "hotload-condition-value",
        );
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
          conditionType.value = item.completionCondition
            ? item.completionCondition.type
            : "none";
        }
        if (conditionValue) {
          conditionValue.value = item.completionCondition
            ? item.completionCondition.value
            : "";
          conditionValue.style.display = item.completionCondition
            ? "block"
            : "none";
        }
        if (maxRetries) {
          maxRetries.value = item.maxRetries || 0;
        }
        if (onFailure) {
          onFailure.value = item.onFailure || "stop";
        }

        if (addButton) {
          addButton.textContent = "저장";
          addButton.dataset.editId = id;
        }
        const formTitle = document.getElementById("hotload-form-title");
        if (formTitle) formTitle.textContent = "Hot Load 수정";

        // 폼 표시 + 스크롤
        showHotLoadForm();
        keywordsInput?.scrollIntoView({ behavior: "smooth", block: "center" });
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
  const cancelButton = document.getElementById("cancel-hotload-button");
  const toggleButton = document.getElementById("hotload-add-toggle-button");
  const conditionTypeSelect = document.getElementById("hotload-condition-type");
  const conditionValueInput = document.getElementById(
    "hotload-condition-value",
  );

  // 추가/취소 버튼
  if (toggleButton) {
    toggleButton.addEventListener("click", showHotLoadForm);
  }
  if (cancelButton) {
    cancelButton.addEventListener("click", hideHotLoadForm);
  }

  // 완료 조건 타입 변경 시 value input 표시/숨김
  if (conditionTypeSelect && conditionValueInput) {
    conditionTypeSelect.addEventListener("change", () => {
      conditionValueInput.style.display =
        conditionTypeSelect.value === "none" ? "none" : "block";
      // placeholder 변경
      const placeholders = {
        exit_code: "종료 코드 (예: 0)",
        output_contains: "포함할 문자열 (예: BUILD SUCCESSFUL)",
        output_not_contains: "미포함할 문자열 (예: ERROR)",
        file_exists: "파일 경로 (예: ./dist/index.js)",
      };
      conditionValueInput.placeholder =
        placeholders[conditionTypeSelect.value] || "조건 값";
    });
  }

  if (addButton) {
    addButton.addEventListener("click", () => {
      const keywordsInput = document.getElementById("hotload-keywords-input");
      const descriptionInput = document.getElementById(
        "hotload-description-input",
      );
      const commandInput = document.getElementById("hotload-command-input");
      const conditionType = document.getElementById("hotload-condition-type");
      const conditionValue = document.getElementById("hotload-condition-value");
      const maxRetries = document.getElementById("hotload-max-retries");
      const onFailure = document.getElementById("hotload-on-failure");

      const keywords = keywordsInput?.value.trim();
      const description = descriptionInput?.value.trim();
      const command = commandInput?.value.trim();

      if (!keywords || !description || !command) {
        showStatus(
          document.getElementById("hotload-add-status"),
          "모든 필드를 입력해주세요.",
          "error",
        );
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
          onFailure: failAction,
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
          onFailure: failAction,
        });
      }
    });
  }

  // 초기 Hot Load 목록 요청
  vscode.postMessage({ command: "getHotLoads" });
}

// Hot Load 초기화 실행
initializeHotLoad();

// ========== 컨텍스트 제외 패턴 관련 함수 ==========

/**
 * 컨텍스트 제외 패턴 목록 렌더링
 */
function renderContextExclusionLists(
  defaultPatterns,
  customPatterns,
  disabledPatterns,
) {
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
      customList.innerHTML = customPatterns
        .map(
          (pattern) => `
        <div class="api-key-section" style="margin-bottom: 8px; padding: 10px 15px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <code style="font-size: 0.9em;">${escapeHtml(pattern)}</code>
            <button class="delete-context-exclusion-btn" data-pattern="${escapeHtml(pattern)}">삭제</button>
          </div>
        </div>
      `,
        )
        .join("");

      // 삭제 버튼 이벤트 바인딩
      customList
        .querySelectorAll(".delete-context-exclusion-btn")
        .forEach((btn) => {
          btn.addEventListener("click", (e) => {
            const pattern = e.currentTarget.dataset.pattern;
            vscode.postMessage({
              command: "deleteContextExclusion",
              pattern: pattern,
            });
          });
        });
    }
  }

  // 기본 패턴 목록 (토글 가능, 개인 사용자만)
  const defaultList = document.getElementById("context-exclusion-default-list");
  if (defaultList && defaultPatterns && !window.userHasOrganization) {
    defaultList.innerHTML = defaultPatterns
      .map((p) => {
        const isDisabled = disabled.includes(p);
        const bg = isDisabled
          ? "rgba(127,127,127,0.1)"
          : "var(--vscode-badge-background)";
        const color = isDisabled
          ? "var(--vscode-disabledForeground, #888)"
          : "var(--vscode-badge-foreground)";
        const textDecoration = isDisabled ? "line-through" : "none";
        const opacity = isDisabled ? "0.5" : "1";
        const title = isDisabled ? "클릭하여 다시 활성화" : "클릭하여 비활성화";
        return `<span class="default-exclusion-tag" data-pattern="${escapeHtml(p)}" data-disabled="${isDisabled}" title="${title}" style="display: inline-block; margin: 2px 4px; padding: 2px 8px; background: ${bg}; color: ${color}; border-radius: 3px; font-size: 0.85em; cursor: pointer; text-decoration: ${textDecoration}; opacity: ${opacity}; user-select: none; transition: opacity 0.2s;">${escapeHtml(p)}</span>`;
      })
      .join("");

    // 토글 이벤트 바인딩
    defaultList.querySelectorAll(".default-exclusion-tag").forEach((tag) => {
      tag.addEventListener("click", (e) => {
        const pattern = e.currentTarget.dataset.pattern;
        const isDisabled = e.currentTarget.dataset.disabled === "true";
        if (isDisabled) {
          vscode.postMessage({
            command: "enableDefaultExclusion",
            pattern: pattern,
          });
        } else {
          vscode.postMessage({
            command: "disableDefaultExclusion",
            pattern: pattern,
          });
        }
      });
    });
  }
}

/**
 * 컨텍스트 제외 패턴 초기화
 */
function showContextExclusionForm() {
  const form = document.getElementById("context-exclusion-form");
  const toggle = document.getElementById("add-context-exclusion-toggle");
  if (form) form.style.display = "";
  if (toggle) toggle.style.display = "none";
}
function hideContextExclusionForm() {
  const form = document.getElementById("context-exclusion-form");
  const toggle = document.getElementById("add-context-exclusion-toggle");
  const input = document.getElementById("context-exclusion-input");
  if (form) form.style.display = "none";
  if (toggle) toggle.style.display = "";
  if (input) input.value = "";
}

function initializeContextExclusion() {
  const addButton = document.getElementById("add-context-exclusion-button");
  const cancelButton = document.getElementById(
    "cancel-context-exclusion-button",
  );
  const toggleButton = document.getElementById("add-context-exclusion-toggle");
  const input = document.getElementById("context-exclusion-input");

  if (toggleButton) {
    toggleButton.addEventListener("click", showContextExclusionForm);
  }
  if (cancelButton) {
    cancelButton.addEventListener("click", hideContextExclusionForm);
  }

  if (addButton && input) {
    addButton.addEventListener("click", () => {
      const pattern = input.value.trim();
      if (!pattern) {
        showStatus(
          document.getElementById("context-exclusion-status"),
          "패턴을 입력해주세요.",
          "error",
        );
        return;
      }
      vscode.postMessage({ command: "addContextExclusion", pattern: pattern });
    });

    // Enter 키로도 추가 가능
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        addButton.click();
      }
    });
  }

  // 초기 목록 요청
  vscode.postMessage({ command: "getContextExclusions" });
}

// 컨텍스트 제외 패턴 초기화 실행
initializeContextExclusion();

// ========== 도구 실행 보안 규칙 관련 함수 ==========

const SECURITY_TYPE_LABELS = {
  blocked_command: "차단 명령어",
  protected_file: "보호 파일",
  hidden_file: "파일 은닉",
};

const SECURITY_TYPE_BADGE_COLORS = {
  blocked_command: "background:#2563eb;color:#fff;",
  protected_file: "background:#2563eb;color:#fff;",
  hidden_file: "background:#2563eb;color:#fff;",
};

const SECURITY_TYPE_PLACEHOLDERS = {
  blocked_command: {
    label: "명령어 패턴",
    placeholder: "예: docker rm, kubectl delete",
  },
  protected_file: {
    label: "파일 패턴",
    placeholder: "예: config/production.json, *.secret",
  },
  hidden_file: {
    label: "파일 패턴",
    placeholder: "예: .env*, credentials.json",
  },
};

/**
 * 보안 규칙 목록 렌더링 (통합)
 */
function renderSecurityRulesLists(
  defaultBlockedCommands,
  defaultProtectedFiles,
  customBlockedCommands,
  customProtectedFiles,
  customHiddenFiles,
  disabledBlockedCommands,
  disabledProtectedFiles,
) {
  const disabledCmds = disabledBlockedCommands || [];
  const disabledFiles = disabledProtectedFiles || [];

  // 통합 커스텀 보안 규칙 목록
  const customList = document.getElementById("security-rule-custom-list");
  const customEmpty = document.getElementById("security-rule-custom-empty");

  const allCustomRules = [];
  if (customBlockedCommands) {
    customBlockedCommands.forEach((p) =>
      allCustomRules.push({ pattern: p, type: "blocked_command" }),
    );
  }
  if (customProtectedFiles) {
    customProtectedFiles.forEach((p) =>
      allCustomRules.push({ pattern: p, type: "protected_file" }),
    );
  }
  if (customHiddenFiles) {
    customHiddenFiles.forEach((p) =>
      allCustomRules.push({ pattern: p, type: "hidden_file" }),
    );
  }

  if (customList) {
    if (allCustomRules.length === 0) {
      customList.innerHTML = "";
      if (customEmpty) customEmpty.style.display = "block";
    } else {
      if (customEmpty) customEmpty.style.display = "none";
      customList.innerHTML = allCustomRules
        .map(
          (rule) => `
        <div class="api-key-section" style="margin-bottom: 8px; padding: 10px 15px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <code style="font-size: 0.9em;">${escapeHtml(rule.pattern)}</code>
              <span style="${SECURITY_TYPE_BADGE_COLORS[rule.type] || SECURITY_TYPE_BADGE_COLORS.blocked_command}padding:1px 6px;border-radius:4px;font-size:0.75em;font-weight:500;">${SECURITY_TYPE_LABELS[rule.type] || "차단 명령어"}</span>
            </div>
            <button class="delete-security-rule-btn" data-pattern="${escapeHtml(rule.pattern)}" data-type="${rule.type}">삭제</button>
          </div>
        </div>
      `,
        )
        .join("");

      // 삭제 버튼 이벤트 바인딩
      customList
        .querySelectorAll(".delete-security-rule-btn")
        .forEach((btn) => {
          btn.addEventListener("click", (e) => {
            const pattern = e.currentTarget.dataset.pattern;
            const type = e.currentTarget.dataset.type;
            vscode.postMessage({
              command: "deleteSecurityRule",
              pattern,
              type,
            });
          });
        });
    }
  }

  // 기본 차단 명령어 목록 (읽기 전용)
  const defaultCmdSection = document.getElementById(
    "default-blocked-cmd-section",
  );
  const defaultCmdList = document.getElementById(
    "blocked-command-default-list",
  );
  if (defaultCmdSection)
    defaultCmdSection.style.display =
      defaultBlockedCommands && defaultBlockedCommands.length > 0 ? "" : "none";
  if (
    defaultCmdList &&
    defaultBlockedCommands &&
    defaultBlockedCommands.length > 0
  ) {
    defaultCmdList.innerHTML = defaultBlockedCommands
      .map((rule) => {
        return `<div style="display: flex; align-items: center; justify-content: space-between; margin: 4px 0; padding: 6px 10px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); border-radius: 4px; font-size: 0.85em; user-select: none;"><span>${escapeHtml(rule.description)}</span><code style="font-size: 0.8em; opacity: 0.7; margin-left: 8px; white-space: nowrap;">${escapeHtml(rule.pattern)}</code></div>`;
      })
      .join("");
  }

  // 기본 보호 파일 목록 (빈 배열이면 숨김)
  const defaultFileSection = document.getElementById(
    "default-protected-file-section",
  );
  if (defaultFileSection)
    defaultFileSection.style.display =
      defaultProtectedFiles && defaultProtectedFiles.length > 0 ? "" : "none";
}

/**
 * 통합 보안 규칙 폼 토글
 */
function showSecurityRuleForm() {
  const form = document.getElementById("security-rule-form");
  const toggle = document.getElementById("add-security-rule-toggle");
  if (form) form.style.display = "";
  if (toggle) toggle.style.display = "none";
}
function hideSecurityRuleForm() {
  const form = document.getElementById("security-rule-form");
  const toggle = document.getElementById("add-security-rule-toggle");
  const input = document.getElementById("security-rule-input");
  const typeSelect = document.getElementById("security-rule-type");
  if (form) form.style.display = "none";
  if (toggle) toggle.style.display = "";
  if (input) input.value = "";
  if (typeSelect) typeSelect.value = "blocked_command";
  updateSecurityRuleFormLabels();
}

function updateSecurityRuleFormLabels() {
  const typeSelect = document.getElementById("security-rule-type");
  const label = document.getElementById("security-rule-input-label");
  const input = document.getElementById("security-rule-input");
  if (!typeSelect) return;
  const type = typeSelect.value;
  const info =
    SECURITY_TYPE_PLACEHOLDERS[type] ||
    SECURITY_TYPE_PLACEHOLDERS.blocked_command;
  if (label) label.textContent = info.label;
  if (input) input.placeholder = info.placeholder;
}

function initializeSecurityRules() {
  // 토글/취소
  const toggleBtn = document.getElementById("add-security-rule-toggle");
  const cancelBtn = document.getElementById("cancel-security-rule-button");
  if (toggleBtn) toggleBtn.addEventListener("click", showSecurityRuleForm);
  if (cancelBtn) cancelBtn.addEventListener("click", hideSecurityRuleForm);

  // 유형 변경 시 라벨/플레이스홀더 업데이트
  const typeSelect = document.getElementById("security-rule-type");
  if (typeSelect)
    typeSelect.addEventListener("change", updateSecurityRuleFormLabels);

  // 추가
  const addBtn = document.getElementById("add-security-rule-button");
  const ruleInput = document.getElementById("security-rule-input");

  if (addBtn && ruleInput) {
    addBtn.addEventListener("click", () => {
      const pattern = ruleInput.value.trim();
      if (!pattern) {
        showStatus(
          document.getElementById("security-rule-status"),
          "패턴을 입력해주세요.",
          "error",
        );
        return;
      }
      const type =
        (document.getElementById("security-rule-type") || {}).value ||
        "blocked_command";
      vscode.postMessage({ command: "addSecurityRule", pattern, type });
    });

    ruleInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        addBtn.click();
      }
    });
  }

  // 초기 목록 요청
  vscode.postMessage({ command: "getSecurityRules" });
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
  if (sessionDuration)
    sessionDuration.textContent = formatDuration(metrics.sessionDuration || 0);

  // LLM 호출 통계
  const llmCalls = document.getElementById("metrics-llm-calls");
  const llmTokens = document.getElementById("metrics-llm-tokens");
  const llmAvgTime = document.getElementById("metrics-llm-avg-time");
  const llmErrors = document.getElementById("metrics-llm-errors");

  if (llmCalls) llmCalls.textContent = formatNumber(metrics.llmCallCount || 0);
  if (llmTokens)
    llmTokens.textContent = formatNumber(metrics.llmTotalTokens || 0);
  if (llmAvgTime)
    llmAvgTime.textContent = formatNumber(metrics.llmAvgResponseTime || 0);
  if (llmErrors) llmErrors.textContent = formatNumber(metrics.llmErrors || 0);

  // 도구 실행 통계
  const toolTotal = document.getElementById("metrics-tool-total");
  const toolSuccess = document.getElementById("metrics-tool-success");
  const toolFailure = document.getElementById("metrics-tool-failure");
  const toolAvgTime = document.getElementById("metrics-tool-avg-time");

  if (toolTotal)
    toolTotal.textContent = formatNumber(metrics.toolExecutionCount || 0);
  if (toolSuccess)
    toolSuccess.textContent = formatNumber(metrics.toolSuccessCount || 0);
  if (toolFailure)
    toolFailure.textContent = formatNumber(metrics.toolFailureCount || 0);
  if (toolAvgTime)
    toolAvgTime.textContent = formatNumber(metrics.toolAvgExecutionTime || 0);

  // 파일 작업 및 컨텍스트
  const filesCreated = document.getElementById("metrics-files-created");
  const filesModified = document.getElementById("metrics-files-modified");
  const compactionCount = document.getElementById("metrics-compaction-count");
  const tokensSaved = document.getElementById("metrics-tokens-saved");

  if (filesCreated)
    filesCreated.textContent = formatNumber(metrics.filesCreated || 0);
  if (filesModified)
    filesModified.textContent = formatNumber(metrics.filesModified || 0);
  if (compactionCount)
    compactionCount.textContent = formatNumber(
      metrics.contextCompactionCount || 0,
    );
  if (tokensSaved)
    tokensSaved.textContent = formatNumber(metrics.tokensSaved || 0);

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
        vscode.postMessage({ command: "resetUsageMetrics" });
      }
    });
  }

  // 초기 데이터 요청
  vscode.postMessage({ command: "getUsageMetrics" });
}

// 사용량 메트릭 초기화 실행
initializeUsageMetrics();

// Skills 초기화 버튼
const resetSkillsButton = document.getElementById("reset-skills-button");
if (resetSkillsButton) {
  resetSkillsButton.addEventListener("click", () => {
    if (
      confirm(
        "모든 Skills 파일을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.",
      )
    ) {
      vscode.postMessage({ command: "resetAllSkills" });
    }
  });
}

// ===== 서버(조직) 설정 메시지 핸들러 =====
window.addEventListener("message", (event) => {
  const message = event.data;
  if (message.command === "serverSettingsLoaded") {
    if (message.settings && typeof message.settings === "object") {
      cachedServerSettings = message.settings;
      renderAllOrgSettings();
      // 현재 선택된 AI 모델 그룹이면 서브 셀렉트도 갱신
      const mainSelect = document.getElementById("ai-model-select");
      if (mainSelect && mainSelect.value.startsWith("group:")) {
        mainSelect.dispatchEvent(new Event("change"));
      }
    }
    // 동기화 버튼 복원
    const syncBtn = document.getElementById("settings-sync-btn");
    const syncLabel = document.getElementById("settings-sync-label");
    if (syncBtn) {
      syncBtn.disabled = false;
      syncBtn.classList.remove("syncing");
    }
    if (syncLabel) {
      const count = Object.values(cachedServerSettings).reduce(
        (s, arr) => s + arr.length,
        0,
      );
      syncLabel.textContent = count > 0 ? `${count}개 설정` : "";
    }
  }
});

// ===== 설정 내보내기 / 가져오기 =====
(function () {
  const exportBtn = document.getElementById("export-settings-btn");
  const importBtn = document.getElementById("import-settings-btn");
  const statusEl = document.getElementById("settings-io-status");

  if (exportBtn) {
    exportBtn.addEventListener("click", () => {
      vscode.postMessage({ command: "exportSettings" });
    });
  }
  if (importBtn) {
    importBtn.addEventListener("click", () => {
      vscode.postMessage({ command: "importSettings" });
    });
  }

  window.addEventListener("message", (event) => {
    const message = event.data;
    if (message.command === "settingsExported") {
      if (statusEl) {
        statusEl.textContent = message.success
          ? "설정을 내보냈습니다."
          : `내보내기 실패: ${message.error || "알 수 없는 오류"}`;
        statusEl.style.color = message.success ? "#22c55e" : "#ef4444";
      }
    }
    if (message.command === "settingsImported") {
      if (statusEl) {
        statusEl.textContent = message.success
          ? "설정을 가져왔습니다."
          : `가져오기 실패: ${message.error || "알 수 없는 오류"}`;
        statusEl.style.color = message.success ? "#22c55e" : "#ef4444";
      }
      if (message.success) {
        // 설정 다시 로드
        vscode.postMessage({ command: "getCurrentSettings" });
      }
    }
  });
})();

/* ========================================================================= *
 *  사용자 정의 AI 모델 (User-Defined Models)
 *  - 로컬 저장(globalState + SecretStorage)
 *  - UserModelHandler.ts 와 메시지 송수신
 * ========================================================================= */
(function initUserModels() {
  const PROVIDER_PLACEHOLDERS = {
    openai: {
      name: "GPT-4o",
      model: "gpt-4o",
      endpoint: "https://api.openai.com/v1/chat/completions",
    },
    gemini: {
      name: "Gemini 2.5 Pro",
      model: "gemini-2.5-pro-preview",
      endpoint: "https://generativelanguage.googleapis.com/v1beta",
    },
    anthropic: {
      name: "Claude Opus 4.6",
      model: "claude-opus-4-6",
      endpoint: "https://api.anthropic.com",
    },
    vertex: {
      name: "Gemini 2.5 Pro",
      model: "gemini-2.5-pro-preview",
      endpoint: "https://us-central1-aiplatform.googleapis.com/v1",
    },
    azure: {
      name: "GPT-4o",
      model: "gpt-4o",
      endpoint:
        "https://{resource}.openai.azure.com/openai/deployments/{deployment}/chat/completions?api-version=2024-10-21",
    },
    groq: {
      name: "Llama 3.3 70B",
      model: "llama-3.3-70b-versatile",
      endpoint: "https://api.groq.com/openai/v1/chat/completions",
    },
    deepseek: {
      name: "DeepSeek R1",
      model: "deepseek-reasoner",
      endpoint: "https://api.deepseek.com/chat/completions",
    },
    mistral: {
      name: "Mistral Large",
      model: "mistral-large-latest",
      endpoint: "https://api.mistral.ai/v1/chat/completions",
    },
    together: {
      name: "Llama 3.3 70B",
      model: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
      endpoint: "https://api.together.xyz/v1/chat/completions",
    },
    xai: {
      name: "Grok 3",
      model: "grok-3",
      endpoint: "https://api.x.ai/v1/chat/completions",
    },
    fireworks: {
      name: "Llama 3.3 70B",
      model: "accounts/fireworks/models/llama-v3p3-70b-instruct",
      endpoint: "https://api.fireworks.ai/inference/v1/chat/completions",
    },
    perplexity: {
      name: "Sonar Pro",
      model: "sonar-pro",
      endpoint: "https://api.perplexity.ai/chat/completions",
    },
    chat_completions: {
      name: "Custom Model",
      model: "model-id",
      endpoint: "https://api.example.com/v1/chat/completions",
    },
    custom: {
      name: "Custom Model",
      model: "model-id",
      endpoint: "https://api.example.com/v1/chat/completions",
    },
  };

  /** 전역 캐시 — 메인 드롭다운 optgroup 렌더에도 사용 */
  window.__userModels = [];
  window.__activeUserModelKey = "";

  const $ = (id) => document.getElementById(id);

  const form = $("user-model-form");
  const listEl = $("user-models-list");
  const statusEl = $("user-models-status");
  const formErrorEl = $("user-model-form-error");
  const addBtn = $("user-model-add-button");
  const saveBtn = $("user-model-save-button");
  const testBtn = $("user-model-test-button");
  const cancelBtn = $("user-model-cancel-button");
  const providerSel = $("user-model-provider");
  const authTypeSel = $("user-model-auth-type");
  const authHeaderGroup = $("user-model-auth-header-group");
  const nameInput = $("user-model-name");
  const modelIdInput = $("user-model-id");
  const endpointInput = $("user-model-endpoint");
  const apiKeyInput = $("user-model-api-key");
  const apiKeyHint = $("user-model-api-key-hint");
  const contextInput = $("user-model-context-window");
  const maxOutInput = $("user-model-max-output-tokens");
  const tempInput = $("user-model-temperature");
  const topPInput = $("user-model-top-p");
  const customHeadersInput = $("user-model-custom-headers");
  const streamingSel = $("user-model-streaming-supported");
  const nativeToolsSel = $("user-model-native-tools-supported");
  const authHeaderNameInput = $("user-model-auth-header-name");
  const keyHidden = $("user-model-key");
  const formTitle = $("user-model-form-title");

  if (!form || !listEl) return;

  function applyProviderPlaceholders() {
    if (!providerSel) return;
    const ph =
      PROVIDER_PLACEHOLDERS[providerSel.value] || PROVIDER_PLACEHOLDERS.custom;
    if (nameInput && !nameInput.value) nameInput.placeholder = ph.name;
    if (modelIdInput) modelIdInput.placeholder = ph.model;
    if (endpointInput) endpointInput.placeholder = ph.endpoint;
  }

  function applyAuthTypeVisibility() {
    if (!authTypeSel || !authHeaderGroup) return;
    authHeaderGroup.style.display =
      authTypeSel.value === "custom_header" ? "flex" : "none";
  }

  function resetForm(isEdit) {
    if (formTitle)
      formTitle.textContent = isEdit ? "AI 모델 수정" : "새 AI 모델 추가";
    if (keyHidden) keyHidden.value = "";
    if (providerSel) providerSel.value = "openai";
    if (nameInput) nameInput.value = "";
    if (modelIdInput) modelIdInput.value = "";
    if (endpointInput) endpointInput.value = "";
    if (authTypeSel) authTypeSel.value = "bearer";
    if (authHeaderNameInput) authHeaderNameInput.value = "";
    if (apiKeyInput) apiKeyInput.value = "";
    if (apiKeyHint) apiKeyHint.style.display = isEdit ? "block" : "none";
    if (contextInput) contextInput.value = "";
    if (maxOutInput) maxOutInput.value = "";
    if (tempInput) tempInput.value = "0.7";
    if (topPInput) topPInput.value = "0.9";
    if (customHeadersInput) customHeadersInput.value = "";
    if (streamingSel) streamingSel.value = "true";
    if (nativeToolsSel) nativeToolsSel.value = "true";
    if (formErrorEl) formErrorEl.textContent = "";
    applyAuthTypeVisibility();
    applyProviderPlaceholders();
  }

  function populateForm(m) {
    if (!m) return;
    resetForm(true);
    if (formTitle) formTitle.textContent = "AI 모델 수정";
    if (keyHidden) keyHidden.value = m.key || "";
    if (providerSel) providerSel.value = m.provider || "openai";
    if (nameInput) nameInput.value = m.name || "";
    if (modelIdInput) modelIdInput.value = m.model || "";
    if (endpointInput) endpointInput.value = m.endpoint || "";
    if (authTypeSel) authTypeSel.value = m.authType || "bearer";
    if (authHeaderNameInput) authHeaderNameInput.value = m.authHeaderName || "";
    if (apiKeyInput) apiKeyInput.value = "";
    if (apiKeyHint) {
      apiKeyHint.textContent = m.hasApiKey
        ? "이미 저장된 API 키가 있습니다. 변경하려면 새 키를 입력하세요."
        : "이 모델에 API 키를 등록하려면 입력하세요.";
      apiKeyHint.style.display = "block";
    }
    if (contextInput)
      contextInput.value =
        m.contextWindow != null ? String(m.contextWindow) : "";
    if (maxOutInput)
      maxOutInput.value =
        m.maxOutputTokens != null ? String(m.maxOutputTokens) : "";
    if (tempInput)
      tempInput.value =
        m.defaultTemperature != null ? String(m.defaultTemperature) : "0.7";
    if (topPInput) topPInput.value = m.topP != null ? String(m.topP) : "0.9";
    if (customHeadersInput) {
      customHeadersInput.value =
        m.customHeaders && typeof m.customHeaders === "object"
          ? JSON.stringify(m.customHeaders, null, 2)
          : "";
    }
    if (streamingSel)
      streamingSel.value = m.streamingSupported === false ? "false" : "true";
    if (nativeToolsSel)
      nativeToolsSel.value = m.nativeToolCallingSupported ? "true" : "false";
    applyAuthTypeVisibility();
    applyProviderPlaceholders();
  }

  function showForm() {
    form.style.display = "block";
  }
  function hideForm() {
    form.style.display = "none";
    if (formErrorEl) formErrorEl.textContent = "";
  }

  function makeEl(tag, opts) {
    const el = document.createElement(tag);
    if (!opts) return el;
    if (opts.text != null) el.textContent = opts.text;
    if (opts.style) el.setAttribute("style", opts.style);
    if (opts.cls) el.className = opts.cls;
    if (opts.attrs) {
      for (const [k, v] of Object.entries(opts.attrs)) el.setAttribute(k, v);
    }
    return el;
  }

  function clearChildren(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function renderList(models) {
    if (!listEl) return;
    clearChildren(listEl);
    if (!Array.isArray(models) || models.length === 0) {
      listEl.appendChild(
        makeEl("p", {
          text: '등록된 사용자 모델이 없습니다. "+ 모델 추가"를 눌러 등록하세요.',
          cls: "info-message",
          style: "font-style:italic;",
        }),
      );
      return;
    }
    for (const m of models) {
      const row = makeEl("div", {
        cls: "policy-file-item",
        style: `display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--vscode-panel-border);`,
        attrs: { "data-key": m.key },
      });

      const info = makeEl("div", { style: "flex:1;min-width:0;" });
      const title = makeEl("div", { style: "font-weight:600;" });
      title.textContent = m.name;
      info.appendChild(title);

      const detail = makeEl("div", {
        style:
          "font-family:monospace;font-size:0.8em;color:var(--vscode-descriptionForeground);",
        text: `${m.model} · ${m.endpoint}`,
      });
      info.appendChild(detail);

      const keyLine = makeEl("div", {
        style: m.hasApiKey
          ? "font-size:0.75em;color:#10b981;"
          : "font-size:0.75em;color:#f59e0b;",
        text: m.hasApiKey ? "API 키 저장됨" : "API 키 없음",
      });
      info.appendChild(keyLine);

      row.appendChild(info);

      const editBtn = makeEl("button", {
        text: "편집",
        style: "padding:4px 10px;",
        attrs: {
          type: "button",
          "data-user-model-edit": m.key,
        },
      });
      row.appendChild(editBtn);

      const deleteBtn = makeEl("button", {
        text: "삭제",
        style: "padding:4px 10px;",
        attrs: {
          type: "button",
          "data-user-model-delete": m.key,
        },
      });
      row.appendChild(deleteBtn);

      listEl.appendChild(row);
    }
  }

  function setStatus(text, isError) {
    if (!statusEl) return;
    statusEl.textContent = text || "";
    statusEl.className =
      "info-message" +
      (isError ? " error-message" : text ? " success-message" : "");
  }

  function collectFormInput() {
    return {
      key: keyHidden ? keyHidden.value.trim() : "",
      name: nameInput ? nameInput.value.trim() : "",
      provider: providerSel ? providerSel.value : "openai",
      model: modelIdInput ? modelIdInput.value.trim() : "",
      endpoint: endpointInput ? endpointInput.value.trim() : "",
      authType: authTypeSel ? authTypeSel.value : "bearer",
      authHeaderName: authHeaderNameInput
        ? authHeaderNameInput.value.trim()
        : "",
      contextWindow:
        contextInput && contextInput.value !== ""
          ? Number(contextInput.value)
          : undefined,
      maxOutputTokens:
        maxOutInput && maxOutInput.value !== ""
          ? Number(maxOutInput.value)
          : undefined,
      defaultTemperature: tempInput ? Number(tempInput.value) : 0.7,
      topP: topPInput ? Number(topPInput.value) : 0.9,
      customHeaders: customHeadersInput ? customHeadersInput.value.trim() : "",
      streamingSupported: streamingSel ? streamingSel.value === "true" : true,
      nativeToolCallingSupported: nativeToolsSel
        ? nativeToolsSel.value === "true"
        : false,
    };
  }

  if (addBtn) {
    addBtn.addEventListener("click", () => {
      resetForm(false);
      showForm();
    });
  }
  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      hideForm();
    });
  }
  if (providerSel)
    providerSel.addEventListener("change", applyProviderPlaceholders);
  if (authTypeSel)
    authTypeSel.addEventListener("change", applyAuthTypeVisibility);

  if (saveBtn) {
    saveBtn.addEventListener("click", () => {
      if (formErrorEl) formErrorEl.textContent = "";
      const input = collectFormInput();
      if (!input.name) {
        formErrorEl.textContent = "모델 이름을 입력하세요.";
        return;
      }
      if (!input.model) {
        formErrorEl.textContent = "모델 ID를 입력하세요.";
        return;
      }
      if (!/^https?:\/\//i.test(input.endpoint)) {
        formErrorEl.textContent = "엔드포인트는 http(s)://로 시작해야 합니다.";
        return;
      }
      if (input.authType === "custom_header" && !input.authHeaderName) {
        formErrorEl.textContent =
          "custom_header 인증 방식에서는 헤더 이름이 필요합니다.";
        return;
      }
      if (input.customHeaders) {
        try {
          const parsed = JSON.parse(input.customHeaders);
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
            throw new Error("not object");
          input.customHeaders = parsed;
        } catch {
          formErrorEl.textContent = "추가 헤더는 올바른 JSON 객체여야 합니다.";
          return;
        }
      } else {
        input.customHeaders = undefined;
      }
      const apiKey = apiKeyInput ? apiKeyInput.value : "";
      const isUpdate = !!input.key;
      vscode.postMessage({
        command: isUpdate ? "updateUserModel" : "addUserModel",
        model: input,
        apiKey,
      });
    });
  }

  if (testBtn) {
    testBtn.addEventListener("click", () => {
      if (formErrorEl) formErrorEl.textContent = "";
      const input = collectFormInput();
      if (!input.key) {
        formErrorEl.textContent = "연결 테스트는 저장 후 사용할 수 있습니다.";
        return;
      }
      setStatus("연결 테스트 중...", false);
      vscode.postMessage({
        command: "testUserModelConnection",
        key: input.key,
      });
    });
  }

  if (listEl) {
    listEl.addEventListener("click", (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      const editKey = t.getAttribute("data-user-model-edit");
      const deleteKey = t.getAttribute("data-user-model-delete");
      if (editKey) {
        const m = (window.__userModels || []).find((x) => x.key === editKey);
        if (m) {
          populateForm(m);
          showForm();
        }
      } else if (deleteKey) {
        if (
          confirm(
            "이 사용자 모델을 삭제하시겠습니까? API 키도 함께 삭제됩니다.",
          )
        ) {
          vscode.postMessage({ command: "deleteUserModel", key: deleteKey });
        }
      }
    });
  }

  window.addEventListener("message", (event) => {
    const message = event.data || {};
    switch (message.command) {
      case "userModelsLoaded": {
        window.__userModels = Array.isArray(message.models)
          ? message.models
          : [];
        renderList(window.__userModels);
        break;
      }
      case "userModelSaved": {
        window.__userModels = Array.isArray(message.models)
          ? message.models
          : window.__userModels;
        renderList(window.__userModels);
        hideForm();
        setStatus("저장되었습니다.", false);
        break;
      }
      case "userModelDeleted": {
        window.__userModels = Array.isArray(message.models)
          ? message.models
          : window.__userModels;
        renderList(window.__userModels);
        setStatus("삭제되었습니다.", false);
        break;
      }
      case "userModelSaveError": {
        if (formErrorEl) formErrorEl.textContent = message.error || "저장 실패";
        setStatus(message.error || "저장 실패", true);
        break;
      }
      case "userModelConnectionTestResult": {
        setStatus(
          (message.success ? "✅ " : "❌ ") + (message.message || ""),
          !message.success,
        );
        break;
      }
    }
  });

  // 초기 로드
  document.addEventListener("DOMContentLoaded", () => {
    vscode.postMessage({ command: "listUserModels" });
  });
  if (document.readyState !== "loading") {
    vscode.postMessage({ command: "listUserModels" });
  }
})();
