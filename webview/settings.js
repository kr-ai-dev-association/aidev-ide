// settings.js
import { showStatus, bindGeminiApiKeyEvents, bindBanyaApiKeyEvents } from "./settings/api-keys.js";
import { bindToggleEvents, bindSpinnerEvents, updateToggleState, updateSpinnerValue } from "./settings/toggles.js";

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

// 테마를 body에 적용하는 함수
function applyThemeToBody(theme) {
  if (theme === "auto") {
    // VS Code 테마 감지
    const isDark = document.body.classList.contains("vscode-dark") ||
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

const outputLogToggle = document.getElementById("output-log-toggle");
const outputLogStatus = document.getElementById("output-log-status");

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

const streamingToggle = document.getElementById("streaming-toggle");
const streamingStatus = document.getElementById("streaming-status");

// 토글 이벤트 바인딩 (모듈 함수 사용)
bindToggleEvents({
  autoUpdateToggle,
  outputLogToggle,
  streamingToggle,
  autoTestRetryToggle,
  autoCorrectionToggle,
  autoExecuteToggle,
  vscode,
});

// 스피너 이벤트 바인딩 (모듈 함수 사용)
bindSpinnerEvents({
  testRetrySpinner,
  errorRetrySpinner,
  vscode,
});

// API 키 관련 요소들

// Gemini API 키 관련 요소들
const geminiApiKeyInput = document.getElementById("gemini-api-key-input");
const saveGeminiApiKeyButton = document.getElementById(
  "save-gemini-api-key-button",
);
const geminiApiKeyStatus = document.getElementById("gemini-api-key-status");
const geminiModelSelect = document.getElementById("gemini-model-select");
const saveGeminiModelButton = document.getElementById(
  "save-gemini-model-button",
);

// Banya API 키 관련 요소들
const banyaApiKeyInput = document.getElementById("banya-api-key-input");
const saveBanyaApiKeyButton = document.getElementById(
  "save-banya-api-key-button",
);
const banyaApiKeyStatus = document.getElementById("banya-api-key-status");
const banyaModelSelect = document.getElementById("banya-model-select");
const saveBanyaModelButton = document.getElementById("save-banya-model-button");

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

// 로컬 Ollama 엔드포인트 관련 요소들
const localOllamaEndpointSelect = document.getElementById(
  "local-ollama-endpoint-select",
);
const saveLocalOllamaEndpointButton = document.getElementById(
  "save-local-ollama-endpoint-button",
);
const localOllamaEndpointStatus = document.getElementById(
  "local-ollama-endpoint-status",
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

// 원격 서버 엔드포인트 관련 요소들
const remoteOllamaEndpointSelect = document.getElementById(
  "remote-ollama-endpoint-select",
);
const saveRemoteOllamaEndpointButton = document.getElementById(
  "save-remote-ollama-endpoint-button",
);
const remoteOllamaEndpointStatus = document.getElementById(
  "remote-ollama-endpoint-status",
);

// Ollama 모델 선택 관련 요소들
const ollamaModelSelect = document.getElementById("ollama-model-select");
const saveOllamaModelButton = document.getElementById(
  "save-ollama-model-button",
);
const ollamaModelStatus = document.getElementById("ollama-model-status");

// AIDEV 시리얼 번호 관련 요소들
const banyaLicenseSerialInput = document.getElementById(
  "banya-license-serial-input",
);
const saveBanyaLicenseButton = document.getElementById(
  "save-banya-license-button",
);
const verifyBanyaLicenseButton = document.getElementById(
  "verify-banya-license-button",
);
const deleteBanyaLicenseButton = document.getElementById(
  "delete-banya-license-button",
);
const banyaLicenseStatus = document.getElementById("banya-license-status");

// AI 모델 선택 관련 요소들
const aiModelSelect = document.getElementById("ai-model-select");
const saveAiModelButton = document.getElementById("save-ai-model-button");
const aiModelStatus = document.getElementById("ai-model-status");
const sourcePathStatus = document.getElementById("source-path-status");
const sourcePathsList = document.getElementById("source-paths-list");
const geminiSettingsSection = document.getElementById(
  "gemini-settings-section",
);
const banyaSettingsSection = document.getElementById("banya-settings-section");
const localOllamaSettingsSection = document.getElementById(
  "local-ollama-settings-section",
);
const remoteOllamaSettingsSection = document.getElementById(
  "remote-ollama-settings-section",
);

// 시리얼 번호 검증 상태 추적
let isLicenseVerified = false;
let storedOllamaModel = null; // 저장된 Ollama 모델 값
let currentSettingsOllamaModel = null; // currentSettings에서 받은 Ollama 모델 값

// 저장 버튼들의 활성화/비활성화를 제어하는 함수
function updateSaveButtonsState() {
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

  // console.log('Updating save buttons state. Serial number verified:', isLicenseVerified);

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

// 라이센스 버튼들의 활성화/비활성화를 제어하는 함수
function updateLicenseButtonsState() {
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

  // Gemini API 키 라벨
  const geminiApiKeyLabel = document.getElementById("gemini-api-key-label");
  if (geminiApiKeyLabel && languageData["geminiApiKeyLabel"]) {
    geminiApiKeyLabel.textContent = languageData["geminiApiKeyLabel"];
  }

  // Gemini API 설명 (기존 변수 사용)
  const geminiApiDescriptionForLabel = document.querySelector(
    "#gemini-api-key-label + p",
  );
  if (geminiApiDescriptionForLabel && languageData["geminiApiDescription"]) {
    geminiApiDescriptionForLabel.textContent =
      languageData["geminiApiDescription"];
  }

  // Gemini API 등록 방법 (기존 변수 사용)
  const geminiApiRegistrationMethodForLabel = document.querySelector(
    "#gemini-api-key-label + p + p",
  );
  if (
    geminiApiRegistrationMethodForLabel &&
    languageData["geminiApiRegistrationMethod"]
  ) {
    const linkMatch =
      geminiApiRegistrationMethodForLabel.innerHTML.match(
        /<a[^>]*>([^<]*)<\/a>/,
      );
    if (linkMatch) {
      const linkText = linkMatch[1];
      const newText = languageData["geminiApiRegistrationMethod"].replace(
        "Google AI Studio API 키 페이지",
        `<a href="https://aistudio.google.com/app/apikey" target="_blank">${linkText}</a>`,
      );
      geminiApiRegistrationMethodForLabel.innerHTML = newText;
    } else {
      geminiApiRegistrationMethodForLabel.textContent =
        languageData["geminiApiRegistrationMethod"];
    }
  }

  // Gemini 저장 버튼
  const saveGeminiApiKeyButton = document.getElementById(
    "save-gemini-api-key-button",
  );
  if (saveGeminiApiKeyButton && languageData["saveGeminiApiKeyButton"]) {
    saveGeminiApiKeyButton.textContent = languageData["saveGeminiApiKeyButton"];
  }

  // Gemini 저장 상태 - 현재 상태에 따라 업데이트
  const geminiApiKeyStatus = document.getElementById("gemini-api-key-status");
  if (geminiApiKeyStatus) {
    const currentText = geminiApiKeyStatus.textContent;
    if (
      currentText.includes("저장됨") ||
      currentText.includes("Saved") ||
      currentText.includes("Gespeichert") ||
      currentText.includes("Guardado") ||
      currentText.includes("Enregistré") ||
      currentText.includes("保存済み") ||
      currentText.includes("已保存")
    ) {
      geminiApiKeyStatus.textContent = languageData["geminiApiKeyStatusSaved"];
    } else if (
      currentText.includes("미저장") ||
      currentText.includes("Not Saved") ||
      currentText.includes("Nicht gespeichert") ||
      currentText.includes("No guardado") ||
      currentText.includes("Non enregistré") ||
      currentText.includes("未保存") ||
      currentText.includes("未保存")
    ) {
      geminiApiKeyStatus.textContent =
        languageData["geminiApiKeyStatusNotSaved"];
    }
  }

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
        "CODEPILOT이 AI 응답을 생성할 때 참조할 소스 코드 경로 목록입니다",
      ) ||
        text.includes(
          "This is a list of source code paths that CODEPILOT will reference",
        ) ||
        text.includes(
          "Esta es una lista de rutas de código fuente que CODEPILOT referenciará",
        ) ||
        text.includes(
          "Ceci est une liste de chemins de code source que CODEPILOT référencera",
        ) ||
        text.includes(
          "这是 CODEPILOT 在生成 AI 响应时将引用的源代码路径列表",
        ) ||
        text.includes(
          "これは、CODEPILOTがAI応答を生成する際に参照するソースコードパスのリストです",
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
      (text.includes("CODEPILOT의 AI 기능을 사용하기 위한 모델 설정합니다") ||
        text.includes(
          "Set the Gemini API key to use CODEPILOT's AI features",
        ) ||
        text.includes(
          "Establece la clave API de Gemini para usar las funciones de IA de ACODEPILOT",
        ) ||
        text.includes(
          "Définissez la clé API Gemini pour utiliser les fonctionnalités IA de CODEPILOT",
        ) ||
        text.includes("设置 Gemini API 密钥以使用 CODEPILOT 的 AI 功能") ||
        text.includes(
          "CODEPILOTのAI機能を使用するためのGemini APIキーを設定します",
        ))
    ) {
      // Gemini API 설명
      if (languageData["geminiApiDescription"]) {
        msg.textContent = languageData["geminiApiDescription"];
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
      // Gemini API 기능 설명
      if (languageData["geminiApiFunctionDescription"]) {
        msg.textContent = languageData["geminiApiFunctionDescription"];
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

  // Gemini API 설명
  const geminiApiDescription = document.querySelector(
    "#api-key-section-title + p",
  );
  if (geminiApiDescription && languageData["geminiApiDescription"]) {
    geminiApiDescription.textContent = languageData["geminiApiDescription"];
  }

  // Gemini API 등록 방법
  const geminiApiRegistrationMethod = document.querySelector(
    "#api-key-section-title + p + p",
  );
  if (
    geminiApiRegistrationMethod &&
    languageData["geminiApiRegistrationMethod"]
  ) {
    // 링크는 유지하면서 텍스트만 업데이트
    const linkMatch =
      geminiApiRegistrationMethod.innerHTML.match(/<a[^>]*>([^<]*)<\/a>/);
    if (linkMatch) {
      const linkText = linkMatch[1];
      const newText = languageData["geminiApiRegistrationMethod"].replace(
        "Google AI Studio API 키 페이지",
        `<a href="https://aistudio.google.com/app/apikey" target="_blank">${linkText}</a>`,
      );
      geminiApiRegistrationMethod.innerHTML = newText;
    } else {
      geminiApiRegistrationMethod.textContent =
        languageData["geminiApiRegistrationMethod"];
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

  // Banya 라이센스 제목
  const banyaLicenseTitle = document.getElementById("banya-license-title");
  if (banyaLicenseTitle && languageData["banyaLicenseTitle"]) {
    banyaLicenseTitle.textContent = languageData["banyaLicenseTitle"];
  }

  // Banya 라이센스 설명
  const banyaLicenseDescription = document.querySelector(
    "#banya-license-title + p",
  );
  if (banyaLicenseDescription && languageData["banyaLicenseDescription"]) {
    banyaLicenseDescription.textContent =
      languageData["banyaLicenseDescription"];
  }

  // Banya 라이센스 라벨
  const banyaLicenseLabel = document.getElementById("banya-license-label");
  if (banyaLicenseLabel && languageData["banyaLicenseLabel"]) {
    banyaLicenseLabel.textContent = languageData["banyaLicenseLabel"];
  }

  // Banya 라이센스 설명 (섹션 내)
  const banyaLicenseSectionDescription = document.querySelector(
    "#banya-license-label + p",
  );
  if (
    banyaLicenseSectionDescription &&
    languageData["banyaLicenseSectionDescription"]
  ) {
    banyaLicenseSectionDescription.textContent =
      languageData["banyaLicenseSectionDescription"];
  }

  // Banya 라이센스 저장 버튼
  const saveBanyaLicenseButton = document.getElementById(
    "save-banya-license-button",
  );
  if (saveBanyaLicenseButton && languageData["saveBanyaLicenseButton"]) {
    saveBanyaLicenseButton.textContent = languageData["saveBanyaLicenseButton"];
  }

  // Banya 라이센스 검증 버튼
  const verifyBanyaLicenseButton = document.getElementById(
    "verify-banya-license-button",
  );
  if (verifyBanyaLicenseButton && languageData["verifyButton"]) {
    verifyBanyaLicenseButton.textContent = languageData["verifyButton"];
  }

  // Banya 라이센스 삭제 버튼
  const deleteBanyaLicenseButton = document.getElementById(
    "delete-banya-license-button",
  );
  if (deleteBanyaLicenseButton && languageData["deleteBanyaLicenseButton"]) {
    deleteBanyaLicenseButton.textContent =
      languageData["deleteBanyaLicenseButton"];
  }

  // Banya 라이센스 입력 필드 placeholder
  const banyaLicenseSerialInput = document.getElementById(
    "banya-license-serial-input",
  );
  if (banyaLicenseSerialInput && languageData["pleaseEnterBanyaLicense"]) {
    banyaLicenseSerialInput.placeholder =
      languageData["pleaseEnterBanyaLicense"];
  }

  // Banya 라이센스 상태 메시지 업데이트
  const banyaLicenseStatus = document.getElementById("banya-license-status");
  if (banyaLicenseStatus && banyaLicenseStatus.textContent) {
    const currentText = banyaLicenseStatus.textContent;
    if (
      currentText.includes("설정되지 않았습니다") ||
      currentText.includes("not set") ||
      currentText.includes("nicht festgelegt") ||
      currentText.includes("no está configurada") ||
      currentText.includes("n'est pas définie") ||
      currentText.includes("設定されていません") ||
      currentText.includes("未设置")
    ) {
      banyaLicenseStatus.textContent =
        languageData["banyaLicenseNotSet"] ||
        "Banya 라이센스가 설정되지 않았습니다.";
    } else if (
      currentText.includes("설정되어 있습니다") ||
      currentText.includes("is set") ||
      currentText.includes("ist festgelegt") ||
      currentText.includes("está configurada") ||
      currentText.includes("est définie") ||
      currentText.includes("設定されています") ||
      currentText.includes("已设置")
    ) {
      banyaLicenseStatus.textContent =
        languageData["banyaLicenseSet"] ||
        "Banya 라이센스가 설정되어 있습니다.";
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
  // Gemini API 키 상태
  if (geminiApiKeyStatus && geminiApiKeyStatus.textContent) {
    const currentText = geminiApiKeyStatus.textContent;
    if (
      currentText.includes("설정되어 있습니다") ||
      currentText.includes("is set") ||
      currentText.includes("ist festgelegt") ||
      currentText.includes("está configurada") ||
      currentText.includes("est définie") ||
      currentText.includes("設定されています") ||
      currentText.includes("已设置")
    ) {
      geminiApiKeyStatus.textContent =
        languageData["geminiApiKeySet"] || "Gemini API 키가 설정되어 있습니다.";
    } else if (
      currentText.includes("설정되지 않았습니다") ||
      currentText.includes("not set") ||
      currentText.includes("nicht festgelegt") ||
      currentText.includes("no está configurada") ||
      currentText.includes("n'est pas définie") ||
      currentText.includes("設定されていません") ||
      currentText.includes("未设置")
    ) {
      geminiApiKeyStatus.textContent =
        languageData["geminiApiKeyNotSet"] ||
        "Gemini API 키가 설정되지 않았습니다.";
    }
  }

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
// Gemini API 키 저장 이벤트 리스너
if (saveGeminiApiKeyButton) {
  saveGeminiApiKeyButton.addEventListener("click", () => {
    const apiKey = geminiApiKeyInput.value.trim();
    if (apiKey) {
      vscode.postMessage({ command: "saveApiKey", apiKey: apiKey });
      const savingText =
        languageData["apiKeysLoading"] || "Gemini API 키 저장 중...";
      showStatus(geminiApiKeyStatus, savingText, "info");
    } else {
      const pleaseEnterText =
        languageData["pleaseEnterApiKey"] || "API 키를 입력해주세요.";
      showStatus(geminiApiKeyStatus, pleaseEnterText, "error");
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

// 로컬 Ollama 엔드포인트 저장 이벤트 리스너
if (saveLocalOllamaEndpointButton) {
  saveLocalOllamaEndpointButton.addEventListener("click", () => {
    const endpoint = localOllamaEndpointSelect.value;
    if (endpoint) {
      vscode.postMessage({
        command: "saveLocalOllamaEndpoint",
        endpoint: endpoint,
      });
      const savingText = "로컬 Ollama 엔드포인트 저장 중...";
      showStatus(localOllamaEndpointStatus, savingText, "info");
    } else {
      showStatus(
        localOllamaEndpointStatus,
        "엔드포인트를 선택해주세요.",
        "error",
      );
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
        endpoint: endpoint,
      });
      const savingText = "원격 서버 엔드포인트 저장 중...";
      showStatus(remoteOllamaEndpointStatus, savingText, "info");
    } else {
      showStatus(
        remoteOllamaEndpointStatus,
        "엔드포인트를 선택해주세요.",
        "error",
      );
    }
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

// Banya 라이센스 저장 이벤트 리스너
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
      showStatus(banyaLicenseStatus, savingText, "info");
    } else {
      const pleaseEnterText =
        languageData["pleaseEnterBanyaLicense"] ||
        "라이센스 시리얼을 입력해주세요.";
      showStatus(banyaLicenseStatus, pleaseEnterText, "error");
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
          model: selectedModel,
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
        licenseSerial: licenseSerial,
      });
      const verifyingText =
        languageData["banyaLicenseVerifying"] || "Banya 라이센스 검증 중...";
      showStatus(banyaLicenseStatus, verifyingText, "info");
    } else {
      const pleaseEnterText =
        languageData["pleaseEnterBanyaLicense"] ||
        "라이센스 시리얼을 입력해주세요.";
      showStatus(banyaLicenseStatus, pleaseEnterText, "error");
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

// Banya 라이센스 삭제 이벤트 리스너
if (deleteBanyaLicenseButton) {
  deleteBanyaLicenseButton.addEventListener("click", () => {
    vscode.postMessage({ command: "deleteBanyaLicense" });
    const deletingText =
      languageData["banyaLicenseDeleting"] || "Banya 라이센스 삭제 중...";
    showStatus(banyaLicenseStatus, deletingText, "info");
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
    if (!isLoadingSettings) {
      try {
        if (aiModelStatus) {
          aiModelStatus.textContent = "AI 모델 자동 저장 중...";
          aiModelStatus.className = "info-message";
        }
        vscode.postMessage({ command: "saveAiModel", model: selectedModel });
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
        model: selectedGeminiModel,
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
      model: selectedGeminiModel,
    });
  });
}

// Banya API 키 저장 이벤트 리스너
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
        model: selectedBanyaModel,
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
      model: selectedBanyaModel,
    });
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
        aiModelStatus.className = "success-message";
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
      break;
    }
    case "geminiModelSaved": {
      if (geminiApiKeyStatus) {
        geminiApiKeyStatus.textContent = "Gemini 모델이 저장되었습니다.";
        geminiApiKeyStatus.className = "success-message";
      }
      break;
    }
    case "geminiModelSaveError": {
      if (geminiApiKeyStatus) {
        geminiApiKeyStatus.textContent = `Gemini 모델 저장 실패: ${message.error}`;
        geminiApiKeyStatus.className = "error-message";
      }
      break;
    }
    case "banyaApiKeySaved": {
      if (banyaApiKeyStatus) {
        banyaApiKeyStatus.textContent = "Banya API 키가 저장되었습니다.";
        banyaApiKeyStatus.className = "success-message";
      }
      if (banyaApiKeyInput) {
        banyaApiKeyInput.value = "";
      }
      break;
    }
    case "banyaApiKeySaveError": {
      if (banyaApiKeyStatus) {
        banyaApiKeyStatus.textContent = `Banya API 키 저장 실패: ${message.error}`;
        banyaApiKeyStatus.className = "error-message";
      }
      break;
    }
    case "banyaModelSaved": {
      if (banyaApiKeyStatus) {
        banyaApiKeyStatus.textContent = "Banya 모델이 저장되었습니다.";
        banyaApiKeyStatus.className = "success-message";
      }
      break;
    }
    case "banyaModelSaveError": {
      if (banyaApiKeyStatus) {
        banyaApiKeyStatus.textContent = `Banya 모델 저장 실패: ${message.error}`;
        banyaApiKeyStatus.className = "error-message";
      }
      break;
    }
    case "ollamaModels": {
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
        const prefixes = ["compactor", "command", "intent"];
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
      if (typeof message.outputLogEnabled === "boolean" && outputLogToggle) {
        outputLogToggle.checked = message.outputLogEnabled;
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
      if (typeof message.streamingEnabled === "boolean" && streamingToggle) {
        streamingToggle.checked = message.streamingEnabled;
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
      if (
        localOllamaEndpointSelect &&
        typeof message.localOllamaEndpoint === "string"
      ) {
        localOllamaEndpointSelect.value =
          message.localOllamaEndpoint || "/api/generate";
        const txt = message.localOllamaEndpoint
          ? languageData["ollamaEndpointSet"] ||
            `로컬 엔드포인트가 설정되어 있습니다: ${message.localOllamaEndpoint}`
          : languageData["ollamaEndpointNotSet"] ||
            "로컬 엔드포인트가 설정되지 않았습니다.";
        if (localOllamaEndpointStatus) {
          showStatus(
            localOllamaEndpointStatus,
            txt,
            message.localOllamaEndpoint ? "success" : "info",
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
        remoteOllamaEndpointSelect &&
        typeof message.remoteOllamaEndpoint === "string"
      ) {
        remoteOllamaEndpointSelect.value =
          message.remoteOllamaEndpoint || "/api/chat";
        const txt = message.remoteOllamaEndpoint
          ? languageData["ollamaEndpointSet"] ||
            `원격 서버 엔드포인트가 설정되어 있습니다: ${message.remoteOllamaEndpoint}`
          : languageData["ollamaEndpointNotSet"] ||
            "원격 서버 엔드포인트가 설정되지 않았습니다.";
        if (remoteOllamaEndpointStatus) {
          showStatus(
            remoteOllamaEndpointStatus,
            txt,
            message.remoteOllamaEndpoint ? "success" : "info",
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

      // 모델 라우팅 설정 적용
      console.log("[Settings] Received routing model settings:", {
        compactorModelType: message.compactorModelType,
        compactorModelName: message.compactorModelName,
        commandModelType: message.commandModelType,
        commandModelName: message.commandModelName,
        intentModelType: message.intentModelType,
        intentModelName: message.intentModelName,
      });
      {
        const compactorTypeSelect = document.getElementById(
          "compactor-model-type-select",
        );
        const compactorSubmodelContainer = document.getElementById(
          "compactor-submodel-container",
        );
        const compactorApikeyContainer = document.getElementById(
          "compactor-apikey-container",
        );
        const compactorSubmodelSelect = document.getElementById(
          "compactor-submodel-select",
        );
        const compactorModelStatus = document.getElementById(
          "compactor-model-status",
        );

        console.log(
          "[Settings] compactorTypeSelect element:",
          compactorTypeSelect,
        );
        console.log(
          "[Settings] compactorTypeSelect options:",
          compactorTypeSelect
            ? Array.from(compactorTypeSelect.options).map((o) => o.value)
            : "N/A",
        );
        if (compactorTypeSelect) {
          compactorTypeSelect.value = message.compactorModelType || "";
          console.log(
            "[Settings] compactorTypeSelect.value after set:",
            compactorTypeSelect.value,
          );
        }

        // 하위 UI 표시 및 값 설정
        if (message.compactorModelType) {
          // 타입 선택 시 하위 모델 표시
          if (compactorSubmodelContainer) {
            compactorSubmodelContainer.style.display = "block";
          }
          if (compactorApikeyContainer) {
            compactorApikeyContainer.style.display =
              message.compactorModelType === "gemini" ||
              message.compactorModelType === "banya"
                ? "block"
                : "none";
          }
          // 하위 모델 셀렉트 채우기 (ollama는 동적으로 가져옴)
          if (compactorSubmodelSelect && message.compactorModelType) {
            const submodelOptionsForLoad = {
              gemini: [
                {
                  value: "gemini-3-flash-preview",
                  label: "Gemini 3 Flash Preview (권장)",
                },
                {
                  value: "gemini-3-pro-preview",
                  label: "Gemini 3 Pro Preview",
                },
              ],
              banya: [
                { value: "Banya Solar:100b", label: "Banya Solar:100b" },
                {
                  value: "Banya Qwen-Coder:32b",
                  label: "Banya Qwen-Coder:32b",
                },
              ],
              ollama: (window.routingOllamaModelsCache || []).map((name) => ({
                value: name,
                label: name,
              })),
            };
            compactorSubmodelSelect.innerHTML = "";
            let options =
              submodelOptionsForLoad[message.compactorModelType] || [];

            // ollama인데 캐시가 비어있으면 모델 리스트 요청
            if (
              message.compactorModelType === "ollama" &&
              options.length === 0
            ) {
              vscode.postMessage({ command: "getRoutingOllamaModels" });
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
              options.forEach((opt) => {
                const option = document.createElement("option");
                option.value = opt.value;
                option.textContent = opt.label;
                compactorSubmodelSelect.appendChild(option);
              });
              // 저장된 모델명 선택 (목록에 없으면 추가)
              if (message.compactorModelName) {
                const exists = options.some(
                  (opt) => opt.value === message.compactorModelName,
                );
                if (!exists) {
                  const customOption = document.createElement("option");
                  customOption.value = message.compactorModelName;
                  customOption.textContent =
                    message.compactorModelName + " (저장됨)";
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
            const typeLabel =
              { ollama: "Ollama", gemini: "Google Gemini", banya: "Banya" }[
                message.compactorModelType
              ] || message.compactorModelType;
            const modelInfo = message.compactorModelName
              ? ` (${message.compactorModelName})`
              : "";
            const apiKeyInfo = message.compactorApiKeySet
              ? " | API 키 설정됨"
              : "";
            compactorModelStatus.textContent = `현재: ${typeLabel}${modelInfo}${apiKeyInfo}`;
            compactorModelStatus.className = "info-message success-message";
          } else {
            compactorModelStatus.textContent = "현재: 메인 모델 사용";
            compactorModelStatus.className = "info-message";
          }
        }
      }
      {
        const commandTypeSelect = document.getElementById(
          "command-model-type-select",
        );
        const commandSubmodelContainer = document.getElementById(
          "command-submodel-container",
        );
        const commandApikeyContainer = document.getElementById(
          "command-apikey-container",
        );
        const commandSubmodelSelect = document.getElementById(
          "command-submodel-select",
        );
        const commandModelStatus = document.getElementById(
          "command-model-status",
        );

        if (commandTypeSelect) {
          commandTypeSelect.value = message.commandModelType || "";
        }

        // 하위 UI 표시 및 값 설정
        if (message.commandModelType) {
          if (commandSubmodelContainer) {
            commandSubmodelContainer.style.display = "block";
          }
          if (commandApikeyContainer) {
            commandApikeyContainer.style.display =
              message.commandModelType === "gemini" ||
              message.commandModelType === "banya"
                ? "block"
                : "none";
          }
          // 하위 모델 셀렉트 채우기 (ollama는 동적으로 가져옴)
          if (commandSubmodelSelect && message.commandModelType) {
            const submodelOptionsForLoad = {
              gemini: [
                {
                  value: "gemini-3-flash-preview",
                  label: "Gemini 3 Flash Preview (권장)",
                },
                {
                  value: "gemini-3-pro-preview",
                  label: "Gemini 3 Pro Preview",
                },
              ],
              banya: [
                { value: "Banya Solar:100b", label: "Banya Solar:100b" },
                {
                  value: "Banya Qwen-Coder:32b",
                  label: "Banya Qwen-Coder:32b",
                },
              ],
              ollama: (window.routingOllamaModelsCache || []).map((name) => ({
                value: name,
                label: name,
              })),
            };
            commandSubmodelSelect.innerHTML = "";
            let options =
              submodelOptionsForLoad[message.commandModelType] || [];

            // ollama인데 캐시가 비어있으면 모델 리스트 요청
            if (message.commandModelType === "ollama" && options.length === 0) {
              vscode.postMessage({ command: "getRoutingOllamaModels" });
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
              options.forEach((opt) => {
                const option = document.createElement("option");
                option.value = opt.value;
                option.textContent = opt.label;
                commandSubmodelSelect.appendChild(option);
              });
              // 저장된 모델명 선택 (목록에 없으면 추가)
              if (message.commandModelName) {
                const exists = options.some(
                  (opt) => opt.value === message.commandModelName,
                );
                if (!exists) {
                  const customOption = document.createElement("option");
                  customOption.value = message.commandModelName;
                  customOption.textContent =
                    message.commandModelName + " (저장됨)";
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
            const typeLabel =
              { ollama: "Ollama", gemini: "Google Gemini", banya: "Banya" }[
                message.commandModelType
              ] || message.commandModelType;
            const modelInfo = message.commandModelName
              ? ` (${message.commandModelName})`
              : "";
            const apiKeyInfo = message.commandApiKeySet
              ? " | API 키 설정됨"
              : "";
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
        const intentTypeSelect = document.getElementById(
          "intent-model-type-select",
        );
        const intentSubmodelContainer = document.getElementById(
          "intent-submodel-container",
        );
        const intentApikeyContainer = document.getElementById(
          "intent-apikey-container",
        );
        const intentSubmodelSelect = document.getElementById(
          "intent-submodel-select",
        );
        const intentModelStatus = document.getElementById(
          "intent-model-status",
        );

        if (intentTypeSelect) {
          intentTypeSelect.value = message.intentModelType || "";
        }

        // 하위 UI 표시 및 값 설정
        if (message.intentModelType) {
          if (intentSubmodelContainer) {
            intentSubmodelContainer.style.display = "block";
          }
          if (intentApikeyContainer) {
            intentApikeyContainer.style.display =
              message.intentModelType === "gemini" ||
              message.intentModelType === "banya"
                ? "block"
                : "none";
          }
          // 하위 모델 셀렉트 채우기 (ollama는 동적으로 가져옴)
          if (intentSubmodelSelect && message.intentModelType) {
            const submodelOptionsForLoad = {
              gemini: [
                {
                  value: "gemini-3-flash-preview",
                  label: "Gemini 3 Flash Preview",
                },
                {
                  value: "gemini-3-pro-preview",
                  label: "Gemini 3 Pro Preview",
                },
              ],
              banya: [
                { value: "Banya Solar:100b", label: "Banya Solar:100b" },
                {
                  value: "Banya Qwen-Coder:32b",
                  label: "Banya Qwen-Coder:32b",
                },
              ],
              ollama: (window.routingOllamaModelsCache || []).map((name) => ({
                value: name,
                label: name,
              })),
            };
            intentSubmodelSelect.innerHTML = "";
            let options = submodelOptionsForLoad[message.intentModelType] || [];

            // ollama인데 캐시가 비어있으면 모델 리스트 요청
            if (message.intentModelType === "ollama" && options.length === 0) {
              vscode.postMessage({ command: "getRoutingOllamaModels" });
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
              options.forEach((opt) => {
                const option = document.createElement("option");
                option.value = opt.value;
                option.textContent = opt.label;
                intentSubmodelSelect.appendChild(option);
              });
              // 저장된 모델명 선택 (목록에 없으면 추가)
              if (message.intentModelName) {
                const exists = options.some(
                  (opt) => opt.value === message.intentModelName,
                );
                if (!exists) {
                  const customOption = document.createElement("option");
                  customOption.value = message.intentModelName;
                  customOption.textContent =
                    message.intentModelName + " (저장됨)";
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
            const typeLabel =
              { ollama: "Ollama", gemini: "Google Gemini", banya: "Banya" }[
                message.intentModelType
              ] || message.intentModelType;
            const modelInfo = message.intentModelName
              ? ` (${message.intentModelName})`
              : "";
            const apiKeyInfo = message.intentApiKeySet
              ? " | API 키 설정됨"
              : "";
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
          compactorModelStatus.className = "info-message";
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
          commandModelStatus.className = "info-message";
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
          const serverType = ollamaServerTypeSelect
            ? ollamaServerTypeSelect.value
            : "local";
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
    case "outputLogStatusChanged":
      if (typeof message.enabled === "boolean" && outputLogToggle) {
        outputLogToggle.checked = message.enabled;
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
      // API 키 상태 로드
      // Gemini API 키 상태 로드
      if (geminiApiKeyInput && typeof message.geminiApiKey === "string") {
        geminiApiKeyInput.value = message.geminiApiKey;
        const geminiApiKeySetText = message.geminiApiKey
          ? languageData["geminiApiKeySet"] ||
            "Gemini API 키가 설정되어 있습니다."
          : languageData["geminiApiKeyNotSet"] ||
            "Gemini API 키가 설정되지 않았습니다.";
        showStatus(
          geminiApiKeyStatus,
          geminiApiKeySetText,
          message.geminiApiKey ? "success" : "info",
        );
      }

      // Banya API 키 로드
      if (banyaApiKeyInput && typeof message.banyaApiKey === "string") {
        banyaApiKeyInput.value = message.banyaApiKey;
        const banyaApiKeySetText = message.banyaApiKey
          ? "Banya API 키가 설정되어 있습니다."
          : "Banya API 키가 설정되지 않았습니다.";
        showStatus(
          banyaApiKeyStatus,
          banyaApiKeySetText,
          message.banyaApiKey ? "success" : "info",
        );
      }
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
      // 로컬 Ollama 엔드포인트 상태 로드 (기본값 폴백)
      if (
        localOllamaEndpointSelect &&
        typeof message.localOllamaEndpoint === "string"
      ) {
        localOllamaEndpointSelect.value =
          message.localOllamaEndpoint || "/api/generate";
        const localOllamaEndpointSetText = message.localOllamaEndpoint
          ? `로컬 Ollama 엔드포인트가 설정되어 있습니다: ${message.localOllamaEndpoint}`
          : "로컬 Ollama 엔드포인트가 설정되지 않았습니다.";
        showStatus(
          localOllamaEndpointStatus,
          localOllamaEndpointSetText,
          message.localOllamaEndpoint ? "success" : "info",
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
      // 원격 서버 엔드포인트 상태 로드
      if (
        remoteOllamaEndpointSelect &&
        typeof message.remoteOllamaEndpoint === "string"
      ) {
        remoteOllamaEndpointSelect.value =
          message.remoteOllamaEndpoint || "/api/generate";
        const remoteOllamaEndpointSetText = message.remoteOllamaEndpoint
          ? `원격 서버 엔드포인트가 설정되어 있습니다: ${message.remoteOllamaEndpoint}`
          : "원격 서버 엔드포인트가 설정되지 않았습니다.";
        showStatus(
          remoteOllamaEndpointStatus,
          remoteOllamaEndpointSetText,
          message.remoteOllamaEndpoint ? "success" : "info",
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
      // Banya 라이센스 상태 로드
      if (
        banyaLicenseSerialInput &&
        typeof message.banyaLicenseSerial === "string"
      ) {
        // 추가 검증 - 잘못된 데이터 필터링
        const isValidLicense =
          message.banyaLicenseSerial &&
          message.banyaLicenseSerial.trim() !== "" &&
          !message.banyaLicenseSerial.includes("/") &&
          !message.banyaLicenseSerial.includes("\\") &&
          !message.banyaLicenseSerial.includes("프로젝트") &&
          !message.banyaLicenseSerial.includes("Project") &&
          !message.banyaLicenseSerial.includes("설정") &&
          !message.banyaLicenseSerial.includes("Setting") &&
          message.banyaLicenseSerial.length > 5;

        if (isValidLicense) {
          banyaLicenseSerialInput.value = message.banyaLicenseSerial.trim();
          banyaLicenseSerialInput.readOnly = true; // 저장된 라이센스는 읽기 전용으로 설정
          const banyaLicenseSetText =
            languageData["banyaLicenseSet"] ||
            "Banya 라이센스가 설정되어 있습니다.";
          showStatus(banyaLicenseStatus, banyaLicenseSetText, "success");
        } else {
          banyaLicenseSerialInput.value = "";
          banyaLicenseSerialInput.readOnly = false; // 라이센스가 없으면 편집 가능
          const banyaLicenseNotSetText =
            languageData["banyaLicenseNotSet"] ||
            "Banya 라이센스가 설정되지 않았습니다.";
          showStatus(banyaLicenseStatus, banyaLicenseNotSetText, "info");
        }
      }

      // 라이선스 검증 상태 처리
      if (typeof message.isLicenseVerified === "boolean") {
        isLicenseVerified = message.isLicenseVerified;
        // console.log('License verification status received:', isLicenseVerified);
      } else {
        console.log(
          "No license verification status received, message:",
          message,
        );
      }

      // API 키 로드 완료 후 저장 버튼 상태 재확인
      setTimeout(() => {
        // console.log('Final button state update after API keys load, isLicenseVerified:', isLicenseVerified);
        updateSaveButtonsState();
        updateLicenseButtonsState();
      }, 100);
      break;
    case "apiKeySaved":
      const geminiApiKeySavedText =
        languageData["geminiApiKeySaved"] || "Gemini API 키가 저장되었습니다.";
      showStatus(geminiApiKeyStatus, geminiApiKeySavedText, "success");
      geminiApiKeyInput.value = "";
      break;
    case "apiKeySaveError":
      const geminiApiKeyErrorText =
        languageData["geminiApiKeyError"] || "Gemini API 키 저장 실패:";
      showStatus(
        geminiApiKeyStatus,
        `${geminiApiKeyErrorText} ${message.error}`,
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
    case "localOllamaEndpointSaved":
      showStatus(
        localOllamaEndpointStatus,
        "로컬 Ollama 엔드포인트가 저장되었습니다.",
        "success",
      );
      break;
    case "localOllamaEndpointError":
      showStatus(
        localOllamaEndpointStatus,
        `로컬 Ollama 엔드포인트 저장 실패: ${message.error}`,
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
    case "remoteOllamaEndpointSaved":
      showStatus(
        remoteOllamaEndpointStatus,
        "원격 서버 엔드포인트가 저장되었습니다.",
        "success",
      );
      break;
    case "remoteOllamaEndpointError":
      showStatus(
        remoteOllamaEndpointStatus,
        `원격 서버 엔드포인트 저장 실패: ${message.error}`,
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
    case "banyaLicenseSaved":
      const banyaLicenseSavedText =
        languageData["banyaLicenseSaved"] || "Banya 라이센스가 저장되었습니다.";
      showStatus(banyaLicenseStatus, banyaLicenseSavedText, "success");
      banyaLicenseSerialInput.value = "";
      break;
    case "banyaLicenseError":
      const banyaLicenseErrorText =
        languageData["banyaLicenseError"] || "Banya 라이센스 저장 실패:";
      showStatus(
        banyaLicenseStatus,
        `${banyaLicenseErrorText} ${message.error}`,
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
    case "banyaLicenseVerified":
      const banyaLicenseVerifiedText =
        languageData["banyaLicenseVerified"] || "Banya 라이센스가 유효합니다.";
      showStatus(banyaLicenseStatus, banyaLicenseVerifiedText, "success");
      isLicenseVerified = true;
      console.log("License verification successful, enabling save buttons");
      updateSaveButtonsState();
      updateLicenseButtonsState();
      break;
    case "banyaLicenseVerificationFailed":
      const banyaLicenseVerificationFailedText =
        languageData["banyaLicenseVerificationFailed"] ||
        "Banya 라이센스 검증 실패:";
      showStatus(
        banyaLicenseStatus,
        `${banyaLicenseVerificationFailedText} ${message.error}`,
        "error",
      );
      isLicenseVerified = false;
      console.log("License verification failed, disabling save buttons");
      updateSaveButtonsState();
      updateLicenseButtonsState();
      break;
    case "banyaLicenseDeleted":
      const banyaLicenseDeletedText =
        languageData["banyaLicenseDeleted"] ||
        "Banya 라이센스가 삭제되었습니다.";
      showStatus(banyaLicenseStatus, banyaLicenseDeletedText, "success");
      if (banyaLicenseSerialInput) {
        banyaLicenseSerialInput.value = "";
        banyaLicenseSerialInput.readOnly = false; // 라이센스 삭제 시 편집 가능하게 설정
      }
      isLicenseVerified = false;
      updateSaveButtonsState();
      updateLicenseButtonsState();
      break;
    case "banyaLicenseDeleteError":
      const banyaLicenseDeleteErrorText =
        languageData["banyaLicenseDeleteError"] || "Banya 라이센스 삭제 실패:";
      showStatus(
        banyaLicenseStatus,
        `${banyaLicenseDeleteErrorText} ${message.error}`,
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

        if (projectRootStatus && projectRootStatus.textContent) {
          const currentText = projectRootStatus.textContent;
          if (
            currentText.includes("로드 완료") ||
            currentText.includes("loaded successfully") ||
            currentText.includes("cargado correctamente") ||
            currentText.includes("chargé avec succès") ||
            currentText.includes("加载完成") ||
            currentText.includes("正常に読み込まれました")
          ) {
            projectRootStatus.textContent =
              languageData["projectRootLoaded"] || "프로젝트 Root 로드 완료.";
          }
        }

        // autoUpdateStatus 텍스트 업데이트 제거 - 스위치 버튼으로 상태 표시
      }
      break;
  }
});

// Webview 로드 시 초기 설정값 요청 (제거 - 중복 방지)
vscode.postMessage({ command: "loadApiKeys" });
vscode.postMessage({ command: "loadAiModel" });
vscode.postMessage({ command: "loadOllamaModel" });

const apiKeysLoadingText =
  languageData["apiKeysLoading"] || "API 키 로드 중...";
showStatus(geminiApiKeyStatus, apiKeysLoadingText, "info");
if (localOllamaApiUrlStatus) {
  showStatus(localOllamaApiUrlStatus, apiKeysLoadingText, "info");
}
if (remoteOllamaApiUrlStatus) {
  showStatus(remoteOllamaApiUrlStatus, apiKeysLoadingText, "info");
}
showStatus(banyaLicenseStatus, apiKeysLoadingText, "info");

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

// 초기 상태: 라이선스 검증 상태는 서버에서 받아올 때까지 대기
// isLicenseVerified는 서버에서 전송된 값으로 설정됨

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

  // 4. API 키 로드
  vscode.postMessage({ command: "loadApiKeys" });

  // 5. AI 모델 로드
  vscode.postMessage({ command: "loadAiModel" });

  // 6. Ollama 모델 로드
  vscode.postMessage({ command: "loadOllamaModel" });

  // 7. 라이센스 입력 필드 초기 상태 설정
  if (banyaLicenseSerialInput) {
    banyaLicenseSerialInput.readOnly = false;
  }

  console.log("[Settings] DOMContentLoaded - Initial load sequence completed");

  // AgentPolicy XML 파일 로드
  loadAgentPolicyFiles();

  // ===== 모델 라우팅 설정 버튼 이벤트 리스너 =====

  // 하위 모델 옵션 정의 (gemini, banya는 고정, ollama는 동적으로 가져옴)
  const submodelOptions = {
    gemini: [
      {
        value: "gemini-3-flash-preview",
        label: "Gemini 3 Flash Preview (권장)",
      },
      { value: "gemini-3-pro-preview", label: "Gemini 3 Pro Preview" },
    ],
    banya: [
      { value: "Banya Solar:100b", label: "Banya Solar:100b" },
      { value: "Banya Qwen-Coder:32b", label: "Banya Qwen-Coder:32b" },
    ],
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

    // 하위 모델 셀렉트 업데이트 및 표시
    if (submodelSelect) {
      updateSubmodelSelect(submodelSelect, modelType);
    }
    if (submodelContainer) {
      submodelContainer.style.display = "block";
    }

    // API 키 입력은 gemini, banya만 표시 (ollama는 로컬이므로 필요 없음)
    if (apikeyContainer) {
      apikeyContainer.style.display =
        modelType === "gemini" || modelType === "banya" ? "block" : "none";
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
});

// ===== AgentPolicy 관련 함수들 =====

// AgentPolicy 파일 업로드 핸들러
function setupAgentPolicyFileUpload(
  inputId,
  selectButtonId,
  uploadButtonId,
  deleteButtonId,
  statusId,
  fileNameId,
  uploadCommand,
) {
  const fileInput = document.getElementById(inputId);
  const selectButton = document.getElementById(selectButtonId);
  const uploadButton = document.getElementById(uploadButtonId);
  const deleteButton = document.getElementById(deleteButtonId);
  const statusElement = document.getElementById(statusId);
  const fileNameElement = document.getElementById(fileNameId);

  if (!fileInput || !selectButton || !uploadButton || !statusElement) {
    return;
  }

  // 파일 선택 버튼 클릭
  selectButton.addEventListener("click", () => {
    fileInput.click();
  });

  // 파일 선택 시
  fileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) {
      if (!file.name.endsWith(".md") && !file.name.endsWith(".markdown")) {
        showStatus(
          statusElement,
          "Markdown 파일만 저장할 수 있습니다.",
          "error",
        );
        fileInput.value = "";
        uploadButton.disabled = true;
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const mdContent = event.target.result;
        if (fileNameElement) {
          fileNameElement.textContent = `선택된 파일: ${file.name}`;
        }
        uploadButton.disabled = false;
        uploadButton.dataset.mdContent = mdContent;
        uploadButton.dataset.xmlContent = mdContent; // 호환성을 위해 xmlContent도 저장
      };
      reader.onerror = () => {
        showStatus(statusElement, "파일 읽기 실패", "error");
        uploadButton.disabled = true;
      };
      reader.readAsText(file);
    }
  });

  // 저장 버튼 클릭
  uploadButton.addEventListener("click", () => {
    const mdContent =
      uploadButton.dataset.mdContent || uploadButton.dataset.xmlContent;
    if (mdContent) {
      showStatus(statusElement, "저장 중...", "info");
      uploadButton.disabled = true;
      vscode.postMessage({
        command: uploadCommand,
        mdContent: mdContent,
        xmlContent: mdContent, // 호환성을 위해 xmlContent도 포함
      });
    }
  });

  // 삭제 버튼 클릭
  if (deleteButton) {
    deleteButton.addEventListener("click", () => {
      if (confirm("정말로 이 파일을 삭제하시겠습니까?")) {
        showStatus(statusElement, "삭제 중...", "info");
        // 삭제 명령어 매핑
        const deleteCommandMap = {
          "agent-policy-stable-version-input": "deleteAgentPolicyStableVersion",
          "agent-policy-coding-style-input": "deleteAgentPolicyCodingStyle",
          "agent-policy-project-architecture-input":
            "deleteAgentPolicyProjectArchitecture",
          "agent-policy-dependency-policy-input":
            "deleteAgentPolicyDependencyPolicy",
          "agent-policy-db-policy-input": "deleteAgentPolicyDbPolicy",
        };
        const deleteCommand = deleteCommandMap[inputId];
        if (deleteCommand && vscode) {
          vscode.postMessage({ command: deleteCommand });
        }
      }
    });
  }
}

// AgentPolicy 파일 로드
function loadAgentPolicyFiles() {
  vscode.postMessage({ command: "getAgentPolicyStableVersion" });
  vscode.postMessage({ command: "getAgentPolicyCodingStyle" });
  vscode.postMessage({ command: "getAgentPolicyProjectArchitecture" });
  vscode.postMessage({ command: "getAgentPolicyDependencyPolicy" });
  vscode.postMessage({ command: "getAgentPolicyDbPolicy" });
}

// AgentPolicy 파일 업로드 설정
setupAgentPolicyFileUpload(
  "agent-policy-stable-version-input",
  "select-stable-version-button",
  "upload-stable-version-button",
  "delete-stable-version-button",
  "stable-version-status",
  "stable-version-file-name",
  "uploadAgentPolicyStableVersion",
);

setupAgentPolicyFileUpload(
  "agent-policy-coding-style-input",
  "select-coding-style-button",
  "upload-coding-style-button",
  "delete-coding-style-button",
  "coding-style-status",
  "coding-style-file-name",
  "uploadAgentPolicyCodingStyle",
);

setupAgentPolicyFileUpload(
  "agent-policy-project-architecture-input",
  "select-project-architecture-button",
  "upload-project-architecture-button",
  "delete-project-architecture-button",
  "project-architecture-status",
  "project-architecture-file-name",
  "uploadAgentPolicyProjectArchitecture",
);

setupAgentPolicyFileUpload(
  "agent-policy-dependency-policy-input",
  "select-dependency-policy-button",
  "upload-dependency-policy-button",
  "delete-dependency-policy-button",
  "dependency-policy-status",
  "dependency-policy-file-name",
  "uploadAgentPolicyDependencyPolicy",
);

setupAgentPolicyFileUpload(
  "agent-policy-db-policy-input",
  "select-db-policy-button",
  "upload-db-policy-button",
  "delete-db-policy-button",
  "db-policy-status",
  "db-policy-file-name",
  "uploadAgentPolicyDbPolicy",
);

// AgentPolicy 관련 메시지 핸들러
window.addEventListener("message", (event) => {
  const message = event.data;

  switch (message.command) {
    case "agentPolicyStableVersionSaved":
      showStatus(
        document.getElementById("stable-version-status"),
        "Stable Version Markdown이 저장되었습니다.",
        "success",
      );
      const stableVersionInput = document.getElementById(
        "agent-policy-stable-version-input",
      );
      const stableVersionUploadBtn = document.getElementById(
        "upload-stable-version-button",
      );
      const stableVersionDeleteBtn = document.getElementById(
        "delete-stable-version-button",
      );
      const stableVersionFileName = document.getElementById(
        "stable-version-file-name",
      );
      if (stableVersionInput) {
        stableVersionInput.value = "";
      }
      if (stableVersionUploadBtn) {
        stableVersionUploadBtn.disabled = true;
        delete stableVersionUploadBtn.dataset.mdContent;
        delete stableVersionUploadBtn.dataset.xmlContent;
      }
      if (stableVersionDeleteBtn) {
        stableVersionDeleteBtn.style.display = "inline-block";
      }
      if (stableVersionFileName) {
        stableVersionFileName.textContent = "";
      }
      break;
    case "agentPolicyStableVersionSaveError":
      showStatus(
        document.getElementById("stable-version-status"),
        `저장 실패: ${message.error}`,
        "error",
      );
      document.getElementById("upload-stable-version-button").disabled = false;
      break;
    case "agentPolicyStableVersionLoaded":
      if (message.mdContent || message.xmlContent) {
        showStatus(
          document.getElementById("stable-version-status"),
          "Stable Version Markdown이 로드되었습니다.",
          "success",
        );
        document.getElementById("delete-stable-version-button").style.display =
          "inline-block";
      }
      break;
    case "agentPolicyCodingStyleSaved":
      showStatus(
        document.getElementById("coding-style-status"),
        "Coding Style Markdown이 저장되었습니다.",
        "success",
      );
      const codingStyleInput = document.getElementById(
        "agent-policy-coding-style-input",
      );
      const codingStyleUploadBtn = document.getElementById(
        "upload-coding-style-button",
      );
      const codingStyleDeleteBtn = document.getElementById(
        "delete-coding-style-button",
      );
      const codingStyleFileName = document.getElementById(
        "coding-style-file-name",
      );
      if (codingStyleInput) {
        codingStyleInput.value = "";
      }
      if (codingStyleUploadBtn) {
        codingStyleUploadBtn.disabled = true;
        delete codingStyleUploadBtn.dataset.mdContent;
        delete codingStyleUploadBtn.dataset.xmlContent;
      }
      if (codingStyleDeleteBtn) {
        codingStyleDeleteBtn.style.display = "inline-block";
      }
      if (codingStyleFileName) {
        codingStyleFileName.textContent = "";
      }
      break;
    case "agentPolicyCodingStyleSaveError":
      showStatus(
        document.getElementById("coding-style-status"),
        `저장 실패: ${message.error}`,
        "error",
      );
      document.getElementById("upload-coding-style-button").disabled = false;
      break;
    case "agentPolicyCodingStyleLoaded":
      if (message.mdContent || message.xmlContent) {
        showStatus(
          document.getElementById("coding-style-status"),
          "Coding Style Markdown이 로드되었습니다.",
          "success",
        );
        document.getElementById("delete-coding-style-button").style.display =
          "inline-block";
      }
      break;
    case "agentPolicyProjectArchitectureSaved":
      showStatus(
        document.getElementById("project-architecture-status"),
        "Project Architecture Markdown이 저장되었습니다.",
        "success",
      );
      const projectArchInput = document.getElementById(
        "agent-policy-project-architecture-input",
      );
      const projectArchUploadBtn = document.getElementById(
        "upload-project-architecture-button",
      );
      const projectArchDeleteBtn = document.getElementById(
        "delete-project-architecture-button",
      );
      const projectArchFileName = document.getElementById(
        "project-architecture-file-name",
      );
      if (projectArchInput) {
        projectArchInput.value = "";
      }
      if (projectArchUploadBtn) {
        projectArchUploadBtn.disabled = true;
        delete projectArchUploadBtn.dataset.mdContent;
        delete projectArchUploadBtn.dataset.xmlContent;
      }
      if (projectArchDeleteBtn) {
        projectArchDeleteBtn.style.display = "inline-block";
      }
      if (projectArchFileName) {
        projectArchFileName.textContent = "";
      }
      break;
    case "agentPolicyProjectArchitectureSaveError":
      showStatus(
        document.getElementById("project-architecture-status"),
        `저장 실패: ${message.error}`,
        "error",
      );
      document.getElementById("upload-project-architecture-button").disabled =
        false;
      break;
    case "agentPolicyProjectArchitectureLoaded":
      if (message.mdContent || message.xmlContent) {
        showStatus(
          document.getElementById("project-architecture-status"),
          "Project Architecture Markdown이 로드되었습니다.",
          "success",
        );
        document.getElementById(
          "delete-project-architecture-button",
        ).style.display = "inline-block";
      }
      break;
    case "agentPolicyDependencyPolicySaved":
      showStatus(
        document.getElementById("dependency-policy-status"),
        "Dependency Policy Markdown이 저장되었습니다.",
        "success",
      );
      const dependencyPolicyInput = document.getElementById(
        "agent-policy-dependency-policy-input",
      );
      const dependencyPolicyUploadBtn = document.getElementById(
        "upload-dependency-policy-button",
      );
      const dependencyPolicyDeleteBtn = document.getElementById(
        "delete-dependency-policy-button",
      );
      const dependencyPolicyFileName = document.getElementById(
        "dependency-policy-file-name",
      );
      if (dependencyPolicyInput) {
        dependencyPolicyInput.value = "";
      }
      if (dependencyPolicyUploadBtn) {
        dependencyPolicyUploadBtn.disabled = true;
        delete dependencyPolicyUploadBtn.dataset.mdContent;
        delete dependencyPolicyUploadBtn.dataset.xmlContent;
      }
      if (dependencyPolicyDeleteBtn) {
        dependencyPolicyDeleteBtn.style.display = "inline-block";
      }
      if (dependencyPolicyFileName) {
        dependencyPolicyFileName.textContent = "";
      }
      break;
    case "agentPolicyDependencyPolicySaveError":
      showStatus(
        document.getElementById("dependency-policy-status"),
        `저장 실패: ${message.error}`,
        "error",
      );
      document.getElementById("upload-dependency-policy-button").disabled =
        false;
      break;
    case "agentPolicyDependencyPolicyLoaded":
      if (message.mdContent || message.xmlContent) {
        showStatus(
          document.getElementById("dependency-policy-status"),
          "Dependency Policy Markdown이 로드되었습니다.",
          "success",
        );
        document.getElementById(
          "delete-dependency-policy-button",
        ).style.display = "inline-block";
      }
      break;
    case "agentPolicyDbPolicySaved":
      showStatus(
        document.getElementById("db-policy-status"),
        "DB Policy Markdown이 저장되었습니다.",
        "success",
      );
      const dbPolicyInput = document.getElementById(
        "agent-policy-db-policy-input",
      );
      const dbPolicyUploadBtn = document.getElementById(
        "upload-db-policy-button",
      );
      const dbPolicyDeleteBtn = document.getElementById(
        "delete-db-policy-button",
      );
      const dbPolicyFileName = document.getElementById("db-policy-file-name");
      if (dbPolicyInput) {
        dbPolicyInput.value = "";
      }
      if (dbPolicyUploadBtn) {
        dbPolicyUploadBtn.disabled = true;
        delete dbPolicyUploadBtn.dataset.mdContent;
        delete dbPolicyUploadBtn.dataset.xmlContent;
      }
      if (dbPolicyDeleteBtn) {
        dbPolicyDeleteBtn.style.display = "inline-block";
      }
      if (dbPolicyFileName) {
        dbPolicyFileName.textContent = "";
      }
      break;
    case "agentPolicyDbPolicySaveError":
      showStatus(
        document.getElementById("db-policy-status"),
        `저장 실패: ${message.error}`,
        "error",
      );
      document.getElementById("upload-db-policy-button").disabled = false;
      break;
    case "agentPolicyDbPolicyLoaded":
      if (message.mdContent || message.xmlContent) {
        showStatus(
          document.getElementById("db-policy-status"),
          "DB Policy Markdown이 로드되었습니다.",
          "success",
        );
        document.getElementById("delete-db-policy-button").style.display =
          "inline-block";
      }
      break;
    case "agentPolicyStableVersionDeleted":
      showStatus(
        document.getElementById("stable-version-status"),
        "Stable Version Markdown이 삭제되었습니다.",
        "success",
      );
      document.getElementById("delete-stable-version-button").style.display =
        "none";
      break;
    case "agentPolicyStableVersionDeleteError":
      showStatus(
        document.getElementById("stable-version-status"),
        `삭제 실패: ${message.error}`,
        "error",
      );
      break;
    case "agentPolicyCodingStyleDeleted":
      showStatus(
        document.getElementById("coding-style-status"),
        "Coding Style Markdown이 삭제되었습니다.",
        "success",
      );
      document.getElementById("delete-coding-style-button").style.display =
        "none";
      break;
    case "agentPolicyCodingStyleDeleteError":
      showStatus(
        document.getElementById("coding-style-status"),
        `삭제 실패: ${message.error}`,
        "error",
      );
      break;
    case "agentPolicyProjectArchitectureDeleted":
      showStatus(
        document.getElementById("project-architecture-status"),
        "Project Architecture Markdown이 삭제되었습니다.",
        "success",
      );
      document.getElementById(
        "delete-project-architecture-button",
      ).style.display = "none";
      break;
    case "agentPolicyProjectArchitectureDeleteError":
      showStatus(
        document.getElementById("project-architecture-status"),
        `삭제 실패: ${message.error}`,
        "error",
      );
      break;
    case "agentPolicyDependencyPolicyDeleted":
      showStatus(
        document.getElementById("dependency-policy-status"),
        "Dependency Policy Markdown이 삭제되었습니다.",
        "success",
      );
      document.getElementById("delete-dependency-policy-button").style.display =
        "none";
      break;
    case "agentPolicyDependencyPolicyDeleteError":
      showStatus(
        document.getElementById("dependency-policy-status"),
        `삭제 실패: ${message.error}`,
        "error",
      );
      break;
    case "agentPolicyDbPolicyDeleted":
      showStatus(
        document.getElementById("db-policy-status"),
        "DB Policy Markdown이 삭제되었습니다.",
        "success",
      );
      document.getElementById("delete-db-policy-button").style.display = "none";
      break;
    case "agentPolicyDbPolicyDeleteError":
      showStatus(
        document.getElementById("db-policy-status"),
        `삭제 실패: ${message.error}`,
        "error",
      );
      break;
  }
});
