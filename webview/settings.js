// settings.js
// VS Code API를 전역으로 획득
if (typeof window.vscode === 'undefined' && typeof acquireVsCodeApi !== 'undefined') {
    window.vscode = acquireVsCodeApi();
}
const vscode = window.vscode || null;

// DOM 요소 참조

const autoUpdateToggle = document.getElementById('auto-update-toggle');
const autoUpdateStatus = document.getElementById('auto-update-status');

const outputLogToggle = document.getElementById('output-log-toggle');
const outputLogStatus = document.getElementById('output-log-status');

const errorRetrySpinner = document.getElementById('error-retry-spinner');
const errorRetryStatus = document.getElementById('error-retry-status');
const autoCorrectionToggle = document.getElementById('auto-correction-toggle');
const autoCorrectionStatus = document.getElementById('auto-correction-status');

const autoExecuteToggle = document.getElementById('auto-execute-toggle');
const autoExecuteStatus = document.getElementById('auto-execute-status');
// 자동 오류 수정 토글
if (autoCorrectionToggle) {
    autoCorrectionToggle.addEventListener('change', () => {
        const enabled = autoCorrectionToggle.checked;
        // console.log('[Settings] autoCorrectionToggle changed ->', enabled);
        if (autoCorrectionStatus) {
            autoCorrectionStatus.textContent = enabled ? (languageData['autoCorrectionOn'] || '자동 오류 수정: 켜짐') : (languageData['autoCorrectionOff'] || '자동 오류 수정: 꺼짐');
        }
        if (errorRetrySpinner) {
            errorRetrySpinner.disabled = !enabled;
            errorRetrySpinner.style.opacity = enabled ? '1' : '0.5';
        }
        if (vscode) {
            vscode.postMessage({ command: 'setAutoCorrectionEnabled', enabled });
        }
    });
}

// 명령어 자동 실행 토글
if (autoExecuteToggle) {
    autoExecuteToggle.addEventListener('change', () => {
        const enabled = autoExecuteToggle.checked;
        // console.log('[Settings] autoExecuteToggle changed ->', enabled);
        if (autoExecuteStatus) {
            autoExecuteStatus.textContent = enabled ? (languageData['autoExecuteOn'] || '명령어 자동 실행: 켜짐') : (languageData['autoExecuteOff'] || '명령어 자동 실행: 꺼짐');
        }
        if (vscode) {
            vscode.postMessage({ command: 'setAutoExecuteCommandsEnabled', enabled });
        }
    });
}


// API 키 관련 요소들

// Gemini API 키 관련 요소들
const geminiApiKeyInput = document.getElementById('gemini-api-key-input');
const saveGeminiApiKeyButton = document.getElementById('save-gemini-api-key-button');
const geminiApiKeyStatus = document.getElementById('gemini-api-key-status');

// Ollama 서버 타입 관련 요소들
const ollamaServerTypeSelect = document.getElementById('ollama-server-type-select');
const saveOllamaServerTypeButton = document.getElementById('save-ollama-server-type-button');
const ollamaServerTypeStatus = document.getElementById('ollama-server-type-status');

// 로컬 Ollama API URL 관련 요소들
const localOllamaApiUrlInput = document.getElementById('local-ollama-api-url-input');
const saveLocalOllamaApiUrlButton = document.getElementById('save-local-ollama-api-url-button');
const localOllamaApiUrlStatus = document.getElementById('local-ollama-api-url-status');

// 로컬 Ollama 엔드포인트 관련 요소들
const localOllamaEndpointSelect = document.getElementById('local-ollama-endpoint-select');
const saveLocalOllamaEndpointButton = document.getElementById('save-local-ollama-endpoint-button');
const localOllamaEndpointStatus = document.getElementById('local-ollama-endpoint-status');

// 원격 서버 모델명 관련 요소들
const remoteOllamaModelInput = document.getElementById('remote-ollama-model-input');
const saveRemoteOllamaModelButton = document.getElementById('save-remote-ollama-model-button');
const remoteOllamaModelStatus = document.getElementById('remote-ollama-model-status');

// 원격 서버 API URL 관련 요소들
const remoteOllamaApiUrlInput = document.getElementById('remote-ollama-api-url-input');
const saveRemoteOllamaApiUrlButton = document.getElementById('save-remote-ollama-api-url-button');
const remoteOllamaApiUrlStatus = document.getElementById('remote-ollama-api-url-status');

// 원격 서버 엔드포인트 관련 요소들
const remoteOllamaEndpointSelect = document.getElementById('remote-ollama-endpoint-select');
const saveRemoteOllamaEndpointButton = document.getElementById('save-remote-ollama-endpoint-button');
const remoteOllamaEndpointStatus = document.getElementById('remote-ollama-endpoint-status');

// Ollama 모델 선택 관련 요소들
const ollamaModelSelect = document.getElementById('ollama-model-select');
const saveOllamaModelButton = document.getElementById('save-ollama-model-button');
const ollamaModelStatus = document.getElementById('ollama-model-status');

// AIDEV 시리얼 번호 관련 요소들
const banyaLicenseSerialInput = document.getElementById('banya-license-serial-input');
const saveBanyaLicenseButton = document.getElementById('save-banya-license-button');
const verifyBanyaLicenseButton = document.getElementById('verify-banya-license-button');
const deleteBanyaLicenseButton = document.getElementById('delete-banya-license-button');
const banyaLicenseStatus = document.getElementById('banya-license-status');


// AI 모델 선택 관련 요소들
const aiModelSelect = document.getElementById('ai-model-select');
const saveAiModelButton = document.getElementById('save-ai-model-button');
const aiModelStatus = document.getElementById('ai-model-status');
const sourcePathStatus = document.getElementById('source-path-status');
const sourcePathsList = document.getElementById('source-paths-list');
const geminiSettingsSection = document.getElementById('gemini-settings-section');
const localOllamaSettingsSection = document.getElementById('local-ollama-settings-section');
const remoteOllamaSettingsSection = document.getElementById('remote-ollama-settings-section');

// 시리얼 번호 검증 상태 추적
let isLicenseVerified = false;
let storedOllamaModel = null; // 저장된 Ollama 모델 값
let currentSettingsOllamaModel = null; // currentSettings에서 받은 Ollama 모델 값

// 저장 버튼들의 활성화/비활성화를 제어하는 함수
function updateSaveButtonsState() {
    // 시리얼 번호 검증이 필요한 버튼들 (API 키 관련)
    const licenseRequiredButtons = [
        saveGeminiApiKeyButton
    ];

    // 시리얼 번호 검증이 필요하지 않은 버튼들 (설정 관련)
    const alwaysEnabledButtons = [
        saveLocalOllamaApiUrlButton,
        saveLocalOllamaEndpointButton,
        saveRemoteOllamaModelButton,
        saveRemoteOllamaApiUrlButton,
        saveRemoteOllamaEndpointButton,
        saveOllamaServerTypeButton
    ];

    // console.log('Updating save buttons state. Serial number verified:', isLicenseVerified);

    // 시리얼 번호 검증이 필요한 버튼들 처리
    licenseRequiredButtons.forEach(button => {
        if (button) {
            if (isLicenseVerified) {
                button.disabled = false;
                button.style.opacity = '1';
                button.style.cursor = 'pointer';
                // console.log('Button enabled (license required):', button.id);
            } else {
                button.disabled = true;
                button.style.opacity = '0.5';
                button.style.cursor = 'not-allowed';
                // console.log('Button disabled (license required):', button.id);
            }
        }
    });

    // 항상 활성화되는 버튼들 처리
    alwaysEnabledButtons.forEach(button => {
        if (button) {
            button.disabled = false;
            button.style.opacity = '1';
            button.style.cursor = 'pointer';
            // console.log('Button enabled (always enabled):', button.id);
        }
        // 선택 변경 시에도 즉시 저장(자동 저장)
        try {
            if (aiModelStatus) {
                aiModelStatus.textContent = 'AI 모델 자동 저장 중...';
                aiModelStatus.className = 'info-message';
            }
            if (aiModelSelect && aiModelSelect.value) {
                const selectedModel = aiModelSelect.value;
                vscode.postMessage({ command: 'saveAiModel', model: selectedModel });
            }
        } catch (e) {
            console.warn('Failed to autosave AI model:', e);
        }

    });
}

// 라이센스 버튼들의 활성화/비활성화를 제어하는 함수
function updateLicenseButtonsState() {
    const hasStoredLicense = banyaLicenseSerialInput && banyaLicenseSerialInput.value.trim() !== '';

    // 라이센스 저장 버튼: 검증이 완료되어야 활성화
    if (saveBanyaLicenseButton) {
        if (isLicenseVerified) {
            saveBanyaLicenseButton.disabled = false;
            saveBanyaLicenseButton.style.opacity = '1';
            saveBanyaLicenseButton.style.cursor = 'pointer';
        } else {
            saveBanyaLicenseButton.disabled = true;
            saveBanyaLicenseButton.style.opacity = '0.5';
            saveBanyaLicenseButton.style.cursor = 'not-allowed';
        }
    }

    // 라이센스 삭제 버튼: 저장된 라이센스가 있어야 활성화
    if (deleteBanyaLicenseButton) {
        if (hasStoredLicense) {
            deleteBanyaLicenseButton.disabled = false;
            deleteBanyaLicenseButton.style.opacity = '1';
            deleteBanyaLicenseButton.style.cursor = 'pointer';
        } else {
            deleteBanyaLicenseButton.disabled = true;
            deleteBanyaLicenseButton.style.opacity = '0.5';
            deleteBanyaLicenseButton.style.cursor = 'not-allowed';
        }
    }

    // 라이센스 검증 버튼: 항상 활성화 (입력값이 있을 때만)
    if (verifyBanyaLicenseButton) {
        const hasInputValue = banyaLicenseSerialInput && banyaLicenseSerialInput.value.trim() !== '';
        verifyBanyaLicenseButton.disabled = !hasInputValue;
        verifyBanyaLicenseButton.style.opacity = hasInputValue ? '1' : '0.5';
        verifyBanyaLicenseButton.style.cursor = hasInputValue ? 'pointer' : 'not-allowed';
    }
}

// 언어별 텍스트 로딩 및 적용
const languageSelect = document.getElementById('language-select');
const saveLanguageButton = document.getElementById('save-language-button');
let currentLanguage = 'ko'; // 기본값
let languageData = {};

async function loadLanguage(lang) {
    try {
        // console.log('Requesting language data from extension:', lang);
        // 확장 프로그램에 언어 데이터 요청
        vscode.postMessage({ command: 'getLanguageData', language: lang });
    } catch (e) {
        console.error('Failed to load language:', lang, e);
    }
}

function applyLanguage() {
    // console.log('Applying language:', currentLanguage, languageData);

    // 타이틀
    const settingsTitle = document.getElementById('settings-title');
    if (settingsTitle && languageData['settingsTitle']) {
        settingsTitle.textContent = languageData['settingsTitle'];
        // console.log('Updated settings title:', languageData['settingsTitle']);
    }

    // 언어 라벨
    const languageLabel = document.getElementById('language-label');
    if (languageLabel && languageData['languageLabel']) {
        languageLabel.textContent = languageData['languageLabel'];
        // console.log('Updated language label:', languageData['languageLabel']);
    }

    // 언어 저장 버튼
    const saveLanguageButton = document.getElementById('save-language-button');
    if (saveLanguageButton && languageData['saveButton']) {
        saveLanguageButton.textContent = languageData['saveButton'];
        // console.log('Updated save language button:', languageData['saveButton']);
    }

    // API 키 섹션 타이틀
    const apiKeySectionTitle = document.getElementById('api-key-section-title');
    if (apiKeySectionTitle && languageData['apiKeySectionTitle']) {
        apiKeySectionTitle.textContent = languageData['apiKeySectionTitle'];
        // console.log('Updated API key section title:', languageData['apiKeySectionTitle']);
    }

    // Gemini API 키 라벨
    const geminiApiKeyLabel = document.getElementById('gemini-api-key-label');
    if (geminiApiKeyLabel && languageData['geminiApiKeyLabel']) {
        geminiApiKeyLabel.textContent = languageData['geminiApiKeyLabel'];
        // console.log('Updated Gemini API key label:', languageData['geminiApiKeyLabel']);
    }

    // Gemini API 설명 (기존 변수 사용)
    const geminiApiDescriptionForLabel = document.querySelector('#gemini-api-key-label + p');
    if (geminiApiDescriptionForLabel && languageData['geminiApiDescription']) {
        geminiApiDescriptionForLabel.textContent = languageData['geminiApiDescription'];
        // console.log('Updated Gemini API description:', languageData['geminiApiDescription']);
    }

    // Gemini API 등록 방법 (기존 변수 사용)
    const geminiApiRegistrationMethodForLabel = document.querySelector('#gemini-api-key-label + p + p');
    if (geminiApiRegistrationMethodForLabel && languageData['geminiApiRegistrationMethod']) {
        // 링크는 유지하면서 텍스트만 업데이트
        const linkMatch = geminiApiRegistrationMethodForLabel.innerHTML.match(/<a[^>]*>([^<]*)<\/a>/);
        if (linkMatch) {
            const linkText = linkMatch[1];
            const newText = languageData['geminiApiRegistrationMethod'].replace('Google AI Studio API 키 페이지', `<a href="https://aistudio.google.com/app/apikey" target="_blank">${linkText}</a>`);
            geminiApiRegistrationMethodForLabel.innerHTML = newText;
        } else {
            geminiApiRegistrationMethodForLabel.textContent = languageData['geminiApiRegistrationMethod'];
        }
        // console.log('Updated Gemini API registration method:', languageData['geminiApiRegistrationMethod']);
    }

    // Gemini 저장 버튼
    const saveGeminiApiKeyButton = document.getElementById('save-gemini-api-key-button');
    if (saveGeminiApiKeyButton && languageData['saveGeminiApiKeyButton']) {
        saveGeminiApiKeyButton.textContent = languageData['saveGeminiApiKeyButton'];
        // console.log('Updated Gemini save button:', languageData['saveGeminiApiKeyButton']);
    }

    // Gemini 저장 상태 - 현재 상태에 따라 업데이트
    const geminiApiKeyStatus = document.getElementById('gemini-api-key-status');
    if (geminiApiKeyStatus) {
        const currentText = geminiApiKeyStatus.textContent;
        if (currentText.includes('저장됨') || currentText.includes('Saved') || currentText.includes('Gespeichert') || currentText.includes('Guardado') || currentText.includes('Enregistré') || currentText.includes('保存済み') || currentText.includes('已保存')) {
            geminiApiKeyStatus.textContent = languageData['geminiApiKeyStatusSaved'];
        } else if (currentText.includes('미저장') || currentText.includes('Not Saved') || currentText.includes('Nicht gespeichert') || currentText.includes('No guardado') || currentText.includes('Non enregistré') || currentText.includes('未保存') || currentText.includes('未保存')) {
            geminiApiKeyStatus.textContent = languageData['geminiApiKeyStatusNotSaved'];
        }
    }

    // 공통 저장 버튼들
    document.querySelectorAll('.save-button').forEach(btn => {
        if (languageData['saveButton']) {
            btn.textContent = languageData['saveButton'];
            // console.log('Updated save button:', languageData['saveButton']);
        }
    });


    // 소스 경로 라벨
    const sourcePathLabel = document.getElementById('source-path-label');
    if (sourcePathLabel && languageData['sourcePathLabel']) {
        sourcePathLabel.textContent = languageData['sourcePathLabel'];
        // console.log('Updated source path label:', languageData['sourcePathLabel']);
    }

    // 소스 경로 추가 버튼
    const addSourcePathButton = document.getElementById('add-source-path-button');
    if (addSourcePathButton && languageData['addSourcePathButton']) {
        addSourcePathButton.textContent = languageData['addSourcePathButton'];
        // console.log('Updated add source path button:', languageData['addSourcePathButton']);
    }

    // 자동 파일 업데이트 라벨
    const autoUpdateLabel = document.getElementById('auto-update-label');
    if (autoUpdateLabel && languageData['autoUpdateLabel']) {
        autoUpdateLabel.textContent = languageData['autoUpdateLabel'];
        // console.log('Updated auto update label:', languageData['autoUpdateLabel']);
    }

    // 자동 파일 업데이트 on/off
    const autoUpdateOn = document.getElementById('auto-update-on');
    if (autoUpdateOn && languageData['autoUpdateOn']) {
        autoUpdateOn.textContent = languageData['autoUpdateOn'];
        // console.log('Updated auto update on:', languageData['autoUpdateOn']);
    }
    const autoUpdateOff = document.getElementById('auto-update-off');
    if (autoUpdateOff && languageData['autoUpdateOff']) {
        autoUpdateOff.textContent = languageData['autoUpdateOff'];
        // console.log('Updated auto update off:', languageData['autoUpdateOff']);
    }

    // 자동 파일 업데이트 활성화 텍스트
    const autoUpdateEnabledText = document.getElementById('auto-update-enabled-text');
    if (autoUpdateEnabledText && languageData['autoUpdateEnabled']) {
        autoUpdateEnabledText.textContent = languageData['autoUpdateEnabled'];
        // console.log('Updated auto update enabled text:', languageData['autoUpdateEnabled']);
    }



    // 기타 설명 텍스트들 (p 태그들) - 더 정확한 매칭으로 개선
    const infoMessages = document.querySelectorAll('.info-message');
    infoMessages.forEach(msg => {
        const text = msg.textContent;
        if (text && (text.includes('AIDEV-IDE이 AI 응답을 생성할 때 참조할 소스 코드 경로 목록입니다') ||
            text.includes('This is a list of source code paths that AIDEV-IDE will reference') ||
            text.includes('Esta es una lista de rutas de código fuente que AIDEV-IDE referenciará') ||
            text.includes('Ceci est une liste de chemins de code source que AIDEV-IDE référencera') ||
            text.includes('这是 AIDEV-IDE 在生成 AI 响应时将引用的源代码路径列表') ||
            text.includes('これは、AIDEV-IDEがAI応答を生成する際に参照するソースコードパスのリストです'))) {
            // 소스 경로 설명
            if (languageData['sourcePathDescription']) {
                msg.textContent = languageData['sourcePathDescription'];
            }
        } else if (text && (text.includes('LLM이 제안한 코드를 기반으로 파일을 자동으로 업데이트할지 여부를 설정합니다') ||
            text.includes('Set whether to automatically update files based on code suggested by the LLM') ||
            text.includes('Establece si actualizar automáticamente archivos basándose en código sugerido por el LLM') ||
            text.includes('Définissez s\'il faut mettre à jour automatiquement les fichiers en fonction du code suggéré par le LLM') ||
            text.includes('设置是否基于 LLM 建议的代码自动更新文件') ||
            text.includes('LLMが提案したコードに基づいてファイルを自動更新するかどうかを設定します'))) {
            // 자동 업데이트 설명
            if (languageData['autoUpdateDescription']) {
                msg.textContent = languageData['autoUpdateDescription'];
            }
        } else if (text && (text.includes('설정 변경은 즉시 저장됩니다') ||
            text.includes('Settings are saved immediately when changed') ||
            text.includes('La configuración se guarda inmediatamente cuando se cambia') ||
            text.includes('Les paramètres sont enregistrés immédiatement lors de la modification') ||
            text.includes('设置更改时立即保存') ||
            text.includes('設定は変更時に即座に保存されます') ||
            text.includes('Einstellungen werden sofort gespeichert, wenn sie geändert werden'))) {
            // 설정 저장 설명
            if (languageData['settingsSavedImmediately']) {
                msg.textContent = languageData['settingsSavedImmediately'];
            }
        } else if (text && (text.includes('AIDEV-IDE의 AI 기능을 사용하기 위한 Gemini API 키를 설정합니다') ||
            text.includes('Set the Gemini API key to use AIDEV-IDE\'s AI features') ||
            text.includes('Establece la clave API de Gemini para usar las funciones de IA de AIDEV-IDE') ||
            text.includes('Définissez la clé API Gemini pour utiliser les fonctionnalités IA de AIDEV-IDE') ||
            text.includes('设置 Gemini API 密钥以使用 AIDEV-IDE 的 AI 功能') ||
            text.includes('AIDEV-IDEのAI機能を使用するためのGemini APIキーを設定します'))) {
            // Gemini API 설명
            if (languageData['geminiApiDescription']) {
                msg.textContent = languageData['geminiApiDescription'];
            }
        } else if (text && (text.includes('AI 코드 생성 및 분석 기능을 활성화합니다') ||
            text.includes('Enables AI code generation and analysis features') ||
            text.includes('Habilita las funciones de generación y análisis de código de IA') ||
            text.includes('Active les fonctionnalités de génération et d\'analyse de code IA') ||
            text.includes('启用 AI 代码生成和分析功能') ||
            text.includes('AIコード生成と分析機能を有効にします'))) {
            // Gemini API 기능 설명
            if (languageData['geminiApiFunctionDescription']) {
                msg.textContent = languageData['geminiApiFunctionDescription'];
            }
        } else if (text && (text.includes('실시간 정보 기능을 사용하기 위한 외부 API 키들을 설정합니다') ||
            text.includes('Set external API keys to use real-time information features') ||
            text.includes('Establece claves API externas para usar funciones de información en tiempo real') ||
            text.includes('Définissez les clés API externes pour utiliser les fonctionnalités d\'information en temps réel') ||
            text.includes('设置外部 API 密钥以使用实时信息功能') ||
            text.includes('リアルタイム情報機能を使用するための外部APIキーを設定します'))) {
            // 외부 API 키 설명
            if (languageData['externalApiKeysDescription']) {
                msg.textContent = languageData['externalApiKeysDescription'];
            }
        }
    });

    // 로딩 텍스트 업데이트 (언어 데이터가 로드된 후) - 더 포괄적인 매칭 추가
    if (languageData['settingsLoading'] && sourcePathStatus) {
        const currentText = sourcePathStatus.textContent;
        if (currentText === '설정 로드 중...' || currentText === 'Loading settings...' ||
            currentText === 'Cargando configuración...' || currentText === 'Chargement des paramètres...' ||
            currentText === '正在加载设置...' || currentText === '設定を読み込み中...' ||
            currentText === 'Lade Einstellungen...') {
            sourcePathStatus.textContent = languageData['settingsLoading'];
        }
    }

    if (languageData['autoUpdateLoading'] && autoUpdateStatus) {
        const currentText = autoUpdateStatus.textContent;
        if (currentText === '자동 업데이트 설정 로드 중...' || currentText === 'Loading auto update settings...' ||
            currentText === 'Cargando configuración de actualización automática...' || currentText === 'Chargement des paramètres de mise à jour automatique...' ||
            currentText === '正在加载自动更新设置...' || currentText === '自動更新設定を読み込み中...' ||
            currentText === 'Lade automatische Aktualisierungseinstellungen...') {
            autoUpdateStatus.textContent = languageData['autoUpdateLoading'];
        }
    }


    // 소스 경로 리스트 업데이트 (언어 데이터가 로드된 후)
    if (sourcePathsList) {
        const currentItems = sourcePathsList.querySelectorAll('.path-item');
        if (currentItems.length === 1) {
            const itemText = currentItems[0].textContent;
            if (itemText.includes('지정된 경로 없음') || itemText.includes('No paths specified') ||
                itemText.includes('No se especificaron rutas') || itemText.includes('Aucun chemin spécifié') ||
                itemText.includes('未指定路径') || itemText.includes('パスが指定されていません') ||
                itemText.includes('Keine Pfade angegeben')) {
                // 현재 "지정된 경로 없음" 상태라면 언어 변경 시 업데이트
                updateSourcePathsList([]);
            }
        }
    }


    // Gemini API 설명
    const geminiApiDescription = document.querySelector('#api-key-section-title + p');
    if (geminiApiDescription && languageData['geminiApiDescription']) {
        geminiApiDescription.textContent = languageData['geminiApiDescription'];
        // console.log('Updated Gemini API description:', languageData['geminiApiDescription']);
    }

    // Gemini API 등록 방법
    const geminiApiRegistrationMethod = document.querySelector('#api-key-section-title + p + p');
    if (geminiApiRegistrationMethod && languageData['geminiApiRegistrationMethod']) {
        // 링크는 유지하면서 텍스트만 업데이트
        const linkMatch = geminiApiRegistrationMethod.innerHTML.match(/<a[^>]*>([^<]*)<\/a>/);
        if (linkMatch) {
            const linkText = linkMatch[1];
            const newText = languageData['geminiApiRegistrationMethod'].replace('Google AI Studio API 키 페이지', `<a href="https://aistudio.google.com/app/apikey" target="_blank">${linkText}</a>`);
            geminiApiRegistrationMethod.innerHTML = newText;
        } else {
            geminiApiRegistrationMethod.textContent = languageData['geminiApiRegistrationMethod'];
        }
        // console.log('Updated Gemini API registration method:', languageData['geminiApiRegistrationMethod']);
    }

    // AI 모델 설정 제목
    const aiModelSettingsTitle = document.getElementById('api-key-section-title');
    if (aiModelSettingsTitle && languageData['aiModelSettingsTitle']) {
        aiModelSettingsTitle.textContent = languageData['aiModelSettingsTitle'];
        // console.log('Updated AI model settings title:', languageData['aiModelSettingsTitle']);
    }

    // Ollama API 라벨
    const ollamaApiLabel = document.getElementById('ollama-api-label');
    if (ollamaApiLabel && languageData['ollamaApiLabel']) {
        ollamaApiLabel.textContent = languageData['ollamaApiLabel'];
        // console.log('Updated Ollama API label:', languageData['ollamaApiLabel']);
    }

    // Ollama API 설명
    const ollamaApiDescription = document.querySelector('#ollama-api-label + p');
    if (ollamaApiDescription && languageData['ollamaApiDescription']) {
        ollamaApiDescription.textContent = languageData['ollamaApiDescription'];
        // console.log('Updated Ollama API description:', languageData['ollamaApiDescription']);
    }

    // Ollama API 설정 방법
    const ollamaApiSetupMethod = document.querySelector('#ollama-api-label + p + p');
    if (ollamaApiSetupMethod && languageData['ollamaApiSetupMethod']) {
        ollamaApiSetupMethod.textContent = languageData['ollamaApiSetupMethod'];
        // console.log('Updated Ollama API setup method:', languageData['ollamaApiSetupMethod']);
    }

    // Ollama 저장 버튼
    const saveOllamaApiUrlButton = document.getElementById('save-ollama-api-url-button');
    if (saveOllamaApiUrlButton && languageData['saveOllamaApiUrlButton']) {
        saveOllamaApiUrlButton.textContent = languageData['saveOllamaApiUrlButton'];
        // console.log('Updated Ollama save button:', languageData['saveOllamaApiUrlButton']);
    }

    // Banya 라이센스 제목
    const banyaLicenseTitle = document.getElementById('banya-license-title');
    if (banyaLicenseTitle && languageData['banyaLicenseTitle']) {
        banyaLicenseTitle.textContent = languageData['banyaLicenseTitle'];
        // console.log('Updated Banya license title:', languageData['banyaLicenseTitle']);
    }

    // Banya 라이센스 설명
    const banyaLicenseDescription = document.querySelector('#banya-license-title + p');
    if (banyaLicenseDescription && languageData['banyaLicenseDescription']) {
        banyaLicenseDescription.textContent = languageData['banyaLicenseDescription'];
        // console.log('Updated Banya license description:', languageData['banyaLicenseDescription']);
    }

    // Banya 라이센스 라벨
    const banyaLicenseLabel = document.getElementById('banya-license-label');
    if (banyaLicenseLabel && languageData['banyaLicenseLabel']) {
        banyaLicenseLabel.textContent = languageData['banyaLicenseLabel'];
        // console.log('Updated Banya license label:', languageData['banyaLicenseLabel']);
    }

    // Banya 라이센스 설명 (섹션 내)
    const banyaLicenseSectionDescription = document.querySelector('#banya-license-label + p');
    if (banyaLicenseSectionDescription && languageData['banyaLicenseSectionDescription']) {
        banyaLicenseSectionDescription.textContent = languageData['banyaLicenseSectionDescription'];
        // console.log('Updated Banya license section description:', languageData['banyaLicenseSectionDescription']);
    }

    // Banya 라이센스 저장 버튼
    const saveBanyaLicenseButton = document.getElementById('save-banya-license-button');
    if (saveBanyaLicenseButton && languageData['saveBanyaLicenseButton']) {
        saveBanyaLicenseButton.textContent = languageData['saveBanyaLicenseButton'];
        // console.log('Updated Banya license save button:', languageData['saveBanyaLicenseButton']);
    }

    // Banya 라이센스 검증 버튼
    const verifyBanyaLicenseButton = document.getElementById('verify-banya-license-button');
    if (verifyBanyaLicenseButton && languageData['verifyButton']) {
        verifyBanyaLicenseButton.textContent = languageData['verifyButton'];
        // console.log('Updated Banya license verify button:', languageData['verifyButton']);
    }

    // Banya 라이센스 삭제 버튼
    const deleteBanyaLicenseButton = document.getElementById('delete-banya-license-button');
    if (deleteBanyaLicenseButton && languageData['deleteBanyaLicenseButton']) {
        deleteBanyaLicenseButton.textContent = languageData['deleteBanyaLicenseButton'];
        // console.log('Updated Banya license delete button:', languageData['deleteBanyaLicenseButton']);
    }

    // Banya 라이센스 입력 필드 placeholder
    const banyaLicenseSerialInput = document.getElementById('banya-license-serial-input');
    if (banyaLicenseSerialInput && languageData['pleaseEnterBanyaLicense']) {
        banyaLicenseSerialInput.placeholder = languageData['pleaseEnterBanyaLicense'];
        // console.log('Updated Banya license input placeholder:', languageData['pleaseEnterBanyaLicense']);
    }

    // Banya 라이센스 상태 메시지 업데이트
    const banyaLicenseStatus = document.getElementById('banya-license-status');
    if (banyaLicenseStatus && banyaLicenseStatus.textContent) {
        const currentText = banyaLicenseStatus.textContent;
        if (currentText.includes('설정되지 않았습니다') || currentText.includes('not set') ||
            currentText.includes('nicht festgelegt') || currentText.includes('no está configurada') ||
            currentText.includes('n\'est pas définie') || currentText.includes('設定されていません') ||
            currentText.includes('未设置')) {
            banyaLicenseStatus.textContent = languageData['banyaLicenseNotSet'] || 'Banya 라이센스가 설정되지 않았습니다.';
        } else if (currentText.includes('설정되어 있습니다') || currentText.includes('is set') ||
            currentText.includes('ist festgelegt') || currentText.includes('está configurada') ||
            currentText.includes('est définie') || currentText.includes('設定されています') ||
            currentText.includes('已设置')) {
            banyaLicenseStatus.textContent = languageData['banyaLicenseSet'] || 'Banya 라이센스가 설정되어 있습니다.';
        }
    }

    // AI 모델 선택 라벨
    const aiModelSelectLabel = document.getElementById('ai-model-select-label');
    if (aiModelSelectLabel && languageData['aiModelSelectLabel']) {
        aiModelSelectLabel.innerHTML = `<b>${languageData['aiModelSelectLabel']}</b>`;
        // console.log('Updated AI model select label:', languageData['aiModelSelectLabel']);
    }

    // AI 모델 선택 옵션들
    const aiModelSelect = document.getElementById('ai-model-select');
    if (aiModelSelect && languageData['geminiOption']) {
        const geminiOption = aiModelSelect.querySelector('option[value="gemini"]');
        if (geminiOption) {
            geminiOption.textContent = languageData['geminiOption'];
        }
    }
    if (aiModelSelect && languageData['ollamaOption']) {
        const ollamaOption = aiModelSelect.querySelector('option[value="ollama"]');
        if (ollamaOption) {
            ollamaOption.textContent = languageData['ollamaOption'];
        }
    }

    // Ollama API URL 라벨 (기존 변수 사용)
    if (ollamaApiLabel && languageData['ollamaApiLabel']) {
        ollamaApiLabel.textContent = languageData['ollamaApiLabel'];
        // console.log('Updated Ollama API label:', languageData['ollamaApiLabel']);
    }

    // Ollama API 설명 (기존 변수 사용)
    if (ollamaApiDescription && languageData['ollamaApiDescription']) {
        ollamaApiDescription.textContent = languageData['ollamaApiDescription'];
        // console.log('Updated Ollama API description:', languageData['ollamaApiDescription']);
    }

    // Ollama API 설정 방법 (기존 변수 사용)
    if (ollamaApiSetupMethod && languageData['ollamaApiSetupMethod']) {
        ollamaApiSetupMethod.textContent = languageData['ollamaApiSetupMethod'];
        // console.log('Updated Ollama API setup method:', languageData['ollamaApiSetupMethod']);
    }

    // Ollama API URL 저장 버튼 (기존 변수 사용)
    if (saveOllamaApiUrlButton && languageData['saveOllamaApiUrlButton']) {
        saveOllamaApiUrlButton.textContent = languageData['saveOllamaApiUrlButton'];
        // console.log('Updated Ollama API URL save button:', languageData['saveOllamaApiUrlButton']);
    }

    // 모든 placeholder 업데이트
    // Gemini API 키 입력 필드
    if (geminiApiKeyInput && languageData['pleaseEnterApiKey']) {
        geminiApiKeyInput.placeholder = languageData['pleaseEnterApiKey'];
    }

    // Ollama API URL 입력 필드
    const localOllamaApiUrlInput = document.getElementById('local-ollama-api-url-input');
    const remoteOllamaApiUrlInput = document.getElementById('remote-ollama-api-url-input');
    if (localOllamaApiUrlInput && languageData['pleaseEnterOllamaApiUrl']) {
        localOllamaApiUrlInput.placeholder = languageData['pleaseEnterOllamaApiUrl'];
    }
    if (remoteOllamaApiUrlInput && languageData['pleaseEnterOllamaApiUrl']) {
        remoteOllamaApiUrlInput.placeholder = languageData['pleaseEnterOllamaApiUrl'];
    }

    // 모든 상태 메시지 업데이트
    // Gemini API 키 상태
    if (geminiApiKeyStatus && geminiApiKeyStatus.textContent) {
        const currentText = geminiApiKeyStatus.textContent;
        if (currentText.includes('설정되어 있습니다') || currentText.includes('is set') ||
            currentText.includes('ist festgelegt') || currentText.includes('está configurada') ||
            currentText.includes('est définie') || currentText.includes('設定されています') ||
            currentText.includes('已设置')) {
            geminiApiKeyStatus.textContent = languageData['geminiApiKeySet'] || 'Gemini API 키가 설정되어 있습니다.';
        } else if (currentText.includes('설정되지 않았습니다') || currentText.includes('not set') ||
            currentText.includes('nicht festgelegt') || currentText.includes('no está configurada') ||
            currentText.includes('n\'est pas définie') || currentText.includes('設定されていません') ||
            currentText.includes('未设置')) {
            geminiApiKeyStatus.textContent = languageData['geminiApiKeyNotSet'] || 'Gemini API 키가 설정되지 않았습니다.';
        }
    }

    // Ollama API URL 상태
    const localOllamaApiUrlStatus = document.getElementById('local-ollama-api-url-status');
    const remoteOllamaApiUrlStatus = document.getElementById('remote-ollama-api-url-status');

    if (localOllamaApiUrlStatus && localOllamaApiUrlStatus.textContent) {
        const currentText = localOllamaApiUrlStatus.textContent;
        if (currentText.includes('설정되어 있습니다') || currentText.includes('is set') ||
            currentText.includes('ist festgelegt') || currentText.includes('está configurada') ||
            currentText.includes('est définie') || currentText.includes('設定されています') ||
            currentText.includes('已设置')) {
            localOllamaApiUrlStatus.textContent = languageData['ollamaApiUrlSet'] || 'Ollama API URL이 설정되어 있습니다.';
        } else if (currentText.includes('설정되지 않았습니다') || currentText.includes('not set') ||
            currentText.includes('nicht festgelegt') || currentText.includes('no está configurada') ||
            currentText.includes('n\'est pas définie') || currentText.includes('設定されていません') ||
            currentText.includes('未设置')) {
            localOllamaApiUrlStatus.textContent = languageData['ollamaApiUrlNotSet'] || 'Ollama API URL이 설정되지 않았습니다.';
        }
    }

    if (remoteOllamaApiUrlStatus && remoteOllamaApiUrlStatus.textContent) {
        const currentText = remoteOllamaApiUrlStatus.textContent;
        if (currentText.includes('설정되어 있습니다') || currentText.includes('is set') ||
            currentText.includes('ist festgelegt') || currentText.includes('está configurada') ||
            currentText.includes('est définie') || currentText.includes('設定されています') ||
            currentText.includes('已设置')) {
            remoteOllamaApiUrlStatus.textContent = languageData['ollamaApiUrlSet'] || 'Ollama API URL이 설정되어 있습니다.';
        } else if (currentText.includes('설정되지 않았습니다') || currentText.includes('not set') ||
            currentText.includes('nicht festgelegt') || currentText.includes('no está configurada') ||
            currentText.includes('n\'est pas définie') || currentText.includes('設定されていません') ||
            currentText.includes('未设置')) {
            remoteOllamaApiUrlStatus.textContent = languageData['ollamaApiUrlNotSet'] || 'Ollama API URL이 설정되지 않았습니다.';
        }
    }


}

if (languageSelect) {
    languageSelect.addEventListener('change', (e) => {
        const lang = e.target.value;
        console.log('Language changed to:', lang);

        // 언어 데이터 로드 요청
        loadLanguage(lang);

        // 언어 저장 요청
        vscode.postMessage({ command: 'saveLanguage', language: lang });

        // 임시로 현재 언어 업데이트 (UI 반응성 향상)
        currentLanguage = lang;

        // 즉시 UI 업데이트 시도 (기존 언어 데이터로)
        if (Object.keys(languageData).length > 0) {
            console.log('Immediate UI update with existing language data');
            applyLanguage();
        }
        // 선택 변경 시에도 즉시 저장(자동 저장)
        try {
            if (aiModelStatus) {
                aiModelStatus.textContent = 'AI 모델 자동 저장 중...';
                aiModelStatus.className = 'info-message';
            }
            if (aiModelSelect && aiModelSelect.value) {
                const selectedModel = aiModelSelect.value;
                vscode.postMessage({ command: 'saveAiModel', model: selectedModel });
            }
        } catch (e) {
            console.warn('Failed to autosave AI model:', e);
        }

    });
}

// 언어 저장 버튼 이벤트 리스너
if (saveLanguageButton) {
    saveLanguageButton.addEventListener('click', () => {
        const selectedLang = languageSelect.value;
        console.log('Manual language save requested:', selectedLang);

        // 이미 현재 언어와 같으면 저장하지 않음
        if (selectedLang === currentLanguage) {
            console.log('Language already saved, skipping duplicate save');
            return;
        }

        // 확장에 언어 저장 요청
        vscode.postMessage({ command: 'saveLanguage', language: selectedLang });

        // 로컬에서도 즉시 적용
        currentLanguage = selectedLang;
        loadLanguage(selectedLang);
    });
}

// 페이지 로드 시 기본 언어 적용 (제거 - 중복 방지)



// 상태 메시지 표시
function showStatus(element, message, type = 'info', duration = 3000) {
    if (!element) return;
    element.textContent = message;
    element.className = `info-message ${type}-message`;
    if (type === 'success' || type === 'error') {
        setTimeout(() => {
            element.textContent = '';
            element.className = 'info-message';
        }, duration);
    }
}



// 이벤트 리스너: 자동 업데이트 토글
if (autoUpdateToggle) {
    autoUpdateToggle.addEventListener('change', () => {
        const isChecked = autoUpdateToggle.checked;
        vscode.postMessage({ command: 'setAutoUpdate', autoUpdateEnabled: isChecked });
        const settingChangeText = languageData['settingChangeInProgress'] || '설정 변경 중...';
        const enabledText = languageData['settingChangeEnabled'] || '(활성화)';
        const disabledText = languageData['settingChangeDisabled'] || '(비활성화)';
        autoUpdateStatus.textContent = `${settingChangeText} ${isChecked ? enabledText : disabledText}`;
    });
}

// 이벤트 리스너: OUTPUT 로그 토글
if (outputLogToggle) {
    outputLogToggle.addEventListener('change', () => {
        const isChecked = outputLogToggle.checked;
        vscode.postMessage({ command: 'setOutputLog', outputLogEnabled: isChecked });
        const settingChangeText = languageData['settingChangeInProgress'] || '설정 변경 중...';
        const enabledText = languageData['settingChangeEnabled'] || '(활성화)';
        const disabledText = languageData['settingChangeDisabled'] || '(비활성화)';
        if (outputLogStatus) {
            outputLogStatus.textContent = `${settingChangeText} ${isChecked ? enabledText : disabledText}`;
        }
    });
}

// 이벤트 리스너: 오류 수정 횟수 스피너
if (errorRetrySpinner) {
    errorRetrySpinner.addEventListener('change', () => {
        const count = parseInt(errorRetrySpinner.value);
        if (count >= 1 && count <= 10) {
            vscode.postMessage({ command: 'saveErrorRetryCount', errorRetryCount: count });
            const settingChangeText = languageData['settingChangeInProgress'] || '설정 변경 중...';
            if (errorRetryStatus) {
                errorRetryStatus.textContent = `${settingChangeText} ${count}회`;
            }
        } else {
            // 범위를 벗어나면 기본값으로 되돌림
            errorRetrySpinner.value = 3;
        }
    });
}

// Ollama 서버 타입 선택 이벤트 리스너
if (ollamaServerTypeSelect) {
    ollamaServerTypeSelect.addEventListener('change', () => {
        const selectedType = ollamaServerTypeSelect.value;

        // 선택된 타입에 따라 섹션 표시/숨김
        if (selectedType === 'local') {
            localOllamaSettingsSection.style.display = 'block';
            remoteOllamaSettingsSection.style.display = 'none';
            // disabled 클래스도 함께 관리
            if (localOllamaSettingsSection) localOllamaSettingsSection.classList.remove('disabled');
            if (remoteOllamaSettingsSection) remoteOllamaSettingsSection.classList.add('disabled');
        } else if (selectedType === 'remote') {
            localOllamaSettingsSection.style.display = 'none';
            remoteOllamaSettingsSection.style.display = 'block';
            // disabled 클래스도 함께 관리
            if (localOllamaSettingsSection) localOllamaSettingsSection.classList.add('disabled');
            if (remoteOllamaSettingsSection) remoteOllamaSettingsSection.classList.remove('disabled');
        }

        // 서버 타입 저장
        vscode.postMessage({ command: 'saveOllamaServerType', ollamaServerType: selectedType });
        const savingText = 'Ollama 서버 타입 저장 중...';
        showStatus(ollamaServerTypeStatus, savingText, 'info');
    });
}

// API 키 저장 이벤트 리스너들
// Gemini API 키 저장 이벤트 리스너
if (saveGeminiApiKeyButton) {
    saveGeminiApiKeyButton.addEventListener('click', () => {
        const apiKey = geminiApiKeyInput.value.trim();
        if (apiKey) {
            vscode.postMessage({ command: 'saveApiKey', apiKey: apiKey });
            const savingText = languageData['apiKeysLoading'] || 'Gemini API 키 저장 중...';
            showStatus(geminiApiKeyStatus, savingText, 'info');
        } else {
            const pleaseEnterText = languageData['pleaseEnterApiKey'] || 'API 키를 입력해주세요.';
            showStatus(geminiApiKeyStatus, pleaseEnterText, 'error');
        }
        // 선택 변경 시에도 즉시 저장(자동 저장)
        try {
            if (aiModelStatus) {
                aiModelStatus.textContent = 'AI 모델 자동 저장 중...';
                aiModelStatus.className = 'info-message';
            }
            if (aiModelSelect && aiModelSelect.value) {
                const selectedModel = aiModelSelect.value;
                vscode.postMessage({ command: 'saveAiModel', model: selectedModel });
            }
        } catch (e) {
            console.warn('Failed to autosave AI model:', e);
        }

    });
}

// 로컬 Ollama API URL 저장 이벤트 리스너
if (saveLocalOllamaApiUrlButton) {
    saveLocalOllamaApiUrlButton.addEventListener('click', () => {
        const apiUrl = localOllamaApiUrlInput.value.trim();
        if (apiUrl) {
            // URL 유효성 검사
            try {
                new URL(apiUrl);
                vscode.postMessage({ command: 'saveLocalOllamaApiUrl', apiUrl: apiUrl });
                const savingText = languageData['ollamaApiUrlSaving'] || '로컬 Ollama API URL 저장 중...';
                showStatus(localOllamaApiUrlStatus, savingText, 'info');
            } catch (error) {
                const invalidUrlText = languageData['invalidUrlFormat'] || '올바른 URL 형식을 입력해주세요. (예: http://localhost:11434)';
                showStatus(localOllamaApiUrlStatus, invalidUrlText, 'error');
            }
        } else {
            const pleaseEnterText = languageData['pleaseEnterOllamaApiUrl'] || '로컬 Ollama API URL을 입력해주세요.';
            showStatus(localOllamaApiUrlStatus, pleaseEnterText, 'error');
        }
    });
}

// 원격 서버 Ollama API URL 저장 이벤트 리스너
if (saveRemoteOllamaApiUrlButton) {
    saveRemoteOllamaApiUrlButton.addEventListener('click', () => {
        const apiUrl = remoteOllamaApiUrlInput.value.trim();
        if (apiUrl) {
            // URL 유효성 검사
            try {
                new URL(apiUrl);
                vscode.postMessage({ command: 'saveRemoteOllamaApiUrl', apiUrl: apiUrl });
                const savingText = languageData['ollamaApiUrlSaving'] || '원격 서버 API URL 저장 중...';
                showStatus(remoteOllamaApiUrlStatus, savingText, 'info');
            } catch (error) {
                const invalidUrlText = languageData['invalidUrlFormat'] || '올바른 URL 형식을 입력해주세요. (예: http://192.168.1.100:11434)';
                showStatus(remoteOllamaApiUrlStatus, invalidUrlText, 'error');
            }
        } else {
            const pleaseEnterText = languageData['pleaseEnterOllamaApiUrl'] || '원격 서버 API URL을 입력해주세요.';
            showStatus(remoteOllamaApiUrlStatus, pleaseEnterText, 'error');
        }
    });
}

// Ollama 서버 타입 저장 이벤트 리스너
if (saveOllamaServerTypeButton) {
    saveOllamaServerTypeButton.addEventListener('click', () => {
        const serverType = ollamaServerTypeSelect.value;
        if (serverType) {
            vscode.postMessage({ command: 'saveOllamaServerType', ollamaServerType: serverType });
            const savingText = languageData['ollamaServerTypeSaving'] || 'Ollama 서버 타입 저장 중...';
            showStatus(ollamaServerTypeStatus, savingText, 'info');
        } else {
            const pleaseSelectText = languageData['pleaseSelectOllamaServerType'] || 'Ollama 서버 타입을 선택해주세요.';
            showStatus(ollamaServerTypeStatus, pleaseSelectText, 'error');
        }
    });
}

// Ollama 모델 저장 이벤트 리스너
if (saveOllamaModelButton) {
    saveOllamaModelButton.addEventListener('click', () => {
        const model = ollamaModelSelect.value;
        // console.log('Ollama model save button clicked, selected model:', model);
        if (model) {
            // console.log('Sending saveOllamaModel command to extension with model:', model);
            vscode.postMessage({ command: 'saveOllamaModel', model: model });
            const savingText = 'Ollama 모델 저장 중...';
            showStatus(ollamaModelStatus, savingText, 'info');
        } else {
            // console.log('No model selected, showing error');
            showStatus(ollamaModelStatus, '모델을 선택해주세요.', 'error');
        }
        // 선택 변경 시에도 즉시 저장(자동 저장)
        try {
            if (aiModelStatus) {
                aiModelStatus.textContent = 'AI 모델 자동 저장 중...';
                aiModelStatus.className = 'info-message';
            }
            if (aiModelSelect && aiModelSelect.value) {
                const selectedModel = aiModelSelect.value;
                vscode.postMessage({ command: 'saveAiModel', model: selectedModel });
            }
        } catch (e) {
            console.warn('Failed to autosave AI model:', e);
        }

    });
}

// Ollama 모델 선택 변경 이벤트 리스너
if (ollamaModelSelect) {
    ollamaModelSelect.addEventListener('change', () => {
        const selectedModel = ollamaModelSelect.value;
        // console.log('Ollama model selected:', selectedModel);

        // gpt-oss-120b:cloud 모델 선택 시 인증 섹션 표시
        const authSection = document.getElementById('ollama-auth-section');
        const authStatus = document.getElementById('ollama-auth-status');

        if (selectedModel === 'gpt-oss-120b:cloud') {
            if (authSection) authSection.style.display = 'flex';
            if (authStatus) authStatus.style.display = 'block';
        } else {
            if (authSection) authSection.style.display = 'none';
            if (authStatus) authStatus.style.display = 'none';
        }
    });
}

// Ollama 인증 버튼 이벤트 리스너
const ollamaAuthButton = document.getElementById('ollama-auth-button');
const ollamaAuthSerial = document.getElementById('ollama-auth-serial');
const ollamaAuthStatus = document.getElementById('ollama-auth-status');

if (ollamaAuthButton) {
    ollamaAuthButton.addEventListener('click', () => {
        const serialNumber = ollamaAuthSerial ? ollamaAuthSerial.value.trim() : '';

        if (!serialNumber) {
            if (ollamaAuthStatus) {
                ollamaAuthStatus.textContent = '인증 시리얼 번호를 입력해주세요.';
                ollamaAuthStatus.className = 'error-message';
            }
            return;
        }

        if (ollamaAuthStatus) {
            ollamaAuthStatus.textContent = 'Ollama 인증 중...';
            ollamaAuthStatus.className = 'info-message';
        }

        // 확장 프로그램에 Ollama 인증 요청
        vscode.postMessage({
            command: 'ollamaAuth',
            serialNumber: serialNumber
        });
    });
}

// 로컬 Ollama 엔드포인트 저장 이벤트 리스너
if (saveLocalOllamaEndpointButton) {
    saveLocalOllamaEndpointButton.addEventListener('click', () => {
        const endpoint = localOllamaEndpointSelect.value;
        if (endpoint) {
            vscode.postMessage({ command: 'saveLocalOllamaEndpoint', endpoint: endpoint });
            const savingText = '로컬 Ollama 엔드포인트 저장 중...';
            showStatus(localOllamaEndpointStatus, savingText, 'info');
        } else {
            showStatus(localOllamaEndpointStatus, '엔드포인트를 선택해주세요.', 'error');
        }
    });
}

// 원격 서버 Ollama 엔드포인트 저장 이벤트 리스너
if (saveRemoteOllamaEndpointButton) {
    saveRemoteOllamaEndpointButton.addEventListener('click', () => {
        const endpoint = remoteOllamaEndpointSelect.value;
        if (endpoint) {
            vscode.postMessage({ command: 'saveRemoteOllamaEndpoint', endpoint: endpoint });
            const savingText = '원격 서버 엔드포인트 저장 중...';
            showStatus(remoteOllamaEndpointStatus, savingText, 'info');
        } else {
            showStatus(remoteOllamaEndpointStatus, '엔드포인트를 선택해주세요.', 'error');
        }
    });
}

// 원격 서버 모델명 저장 이벤트 리스너
if (saveRemoteOllamaModelButton) {
    saveRemoteOllamaModelButton.addEventListener('click', () => {
        const model = remoteOllamaModelInput.value.trim();
        if (model) {
            vscode.postMessage({ command: 'saveRemoteOllamaModel', model: model });
            const savingText = '원격 서버 모델명 저장 중...';
            showStatus(remoteOllamaModelStatus, savingText, 'info');
        } else {
            showStatus(remoteOllamaModelStatus, '모델명을 입력해주세요.', 'error');
        }
    });
}

// Banya 라이센스 저장 이벤트 리스너
if (saveBanyaLicenseButton) {
    saveBanyaLicenseButton.addEventListener('click', () => {
        const licenseSerial = banyaLicenseSerialInput.value.trim();
        if (licenseSerial) {
            vscode.postMessage({ command: 'saveBanyaLicenseSerial', banyaLicenseSerial: licenseSerial });
            const savingText = languageData['banyaLicenseSaving'] || 'Banya 라이센스 저장 중...';
            showStatus(banyaLicenseStatus, savingText, 'info');
        } else {
            const pleaseEnterText = languageData['pleaseEnterBanyaLicense'] || '라이센스 시리얼을 입력해주세요.';
            showStatus(banyaLicenseStatus, pleaseEnterText, 'error');
        }
        // 선택 변경 시에도 즉시 저장(자동 저장)
        try {
            if (aiModelStatus) {
                aiModelStatus.textContent = 'AI 모델 자동 저장 중...';
                aiModelStatus.className = 'info-message';
            }
            if (aiModelSelect && aiModelSelect.value) {
                const selectedModel = aiModelSelect.value;
                vscode.postMessage({
                    command: 'saveAiModel',
                    model: selectedModel
                });
            }
        } catch (e) {
            console.warn('Failed to autosave AI model:', e);
        }
    });
}

// Banya 라이센스 검증 이벤트 리스너
if (verifyBanyaLicenseButton) {
    verifyBanyaLicenseButton.addEventListener('click', () => {
        const licenseSerial = banyaLicenseSerialInput.value.trim();
        if (licenseSerial) {
            vscode.postMessage({ command: 'verifyBanyaLicense', licenseSerial: licenseSerial });
            const verifyingText = languageData['banyaLicenseVerifying'] || 'Banya 라이센스 검증 중...';
            showStatus(banyaLicenseStatus, verifyingText, 'info');
        } else {
            const pleaseEnterText = languageData['pleaseEnterBanyaLicense'] || '라이센스 시리얼을 입력해주세요.';
            showStatus(banyaLicenseStatus, pleaseEnterText, 'error');
        }
        // 선택 변경 시에도 즉시 저장(자동 저장)
        try {
            if (aiModelStatus) {
                aiModelStatus.textContent = 'AI 모델 자동 저장 중...';
                aiModelStatus.className = 'info-message';
            }
            if (aiModelSelect && aiModelSelect.value) {
                const selectedModel = aiModelSelect.value;
                vscode.postMessage({ command: 'saveAiModel', model: selectedModel });
            }
        } catch (e) {
            console.warn('Failed to autosave AI model:', e);
        }

    });
}

// Banya 라이센스 삭제 이벤트 리스너
if (deleteBanyaLicenseButton) {
    deleteBanyaLicenseButton.addEventListener('click', () => {
        vscode.postMessage({ command: 'deleteBanyaLicense' });
        const deletingText = languageData['banyaLicenseDeleting'] || 'Banya 라이센스 삭제 중...';
        showStatus(banyaLicenseStatus, deletingText, 'info');
    });
}

// 라이센스 입력 필드 변경 이벤트 리스너
if (banyaLicenseSerialInput) {
    banyaLicenseSerialInput.addEventListener('input', () => {
        updateLicenseButtonsState();
    });
}

// AI 모델 선택 이벤트 리스너
if (aiModelSelect) {
    aiModelSelect.addEventListener('change', () => {
        const selectedModel = aiModelSelect.value;
        // console.log('AI model selected:', selectedModel);

        // 선택된 모델에 따라 설정 섹션 활성화/비활성화
        if (selectedModel === 'gemini') {
            geminiSettingsSection.classList.remove('disabled');
            localOllamaSettingsSection.classList.add('disabled');
            remoteOllamaSettingsSection.classList.add('disabled');
        } else if (selectedModel === 'ollama') {
            geminiSettingsSection.classList.add('disabled');
            // Ollama 선택 시 서버 타입을 기본값 'local'로 설정
            if (ollamaServerTypeSelect) {
                ollamaServerTypeSelect.value = 'local';
                // 서버 타입 변경 이벤트 트리거
                ollamaServerTypeSelect.dispatchEvent(new Event('change'));
            }
            // 서버 타입에 따라 활성 섹션 결정
            const serverType = ollamaServerTypeSelect ? ollamaServerTypeSelect.value : 'local';
            if (serverType === 'remote') {
                localOllamaSettingsSection.classList.add('disabled');
                remoteOllamaSettingsSection.classList.remove('disabled');
            } else {
                localOllamaSettingsSection.classList.remove('disabled');
                remoteOllamaSettingsSection.classList.add('disabled');
            }
            // Ollama 선택 시 모델 목록 즉시 요청
            try { loadOllamaModels(); } catch (e) { console.warn('loadOllamaModels failed:', e); }
        } else {
            // 모델이 선택되지 않은 경우 기본값(Gemini)으로 설정
            aiModelSelect.value = 'gemini';
            geminiSettingsSection.classList.remove('disabled');
            localOllamaSettingsSection.classList.add('disabled');
            remoteOllamaSettingsSection.classList.add('disabled');
        }
        // 선택 변경 시에도 즉시 저장(자동 저장)
        try {
            if (aiModelStatus) {
                aiModelStatus.textContent = 'AI 모델 자동 저장 중...';
                aiModelStatus.className = 'info-message';
            }
            if (aiModelSelect && aiModelSelect.value) {
                const selectedModel = aiModelSelect.value;
                vscode.postMessage({ command: 'saveAiModel', model: selectedModel });
            }
        } catch (e) {
            console.warn('Failed to autosave AI model:', e);
        }

    });
}

// AI 모델 저장 버튼 이벤트 리스너
if (saveAiModelButton) {
    saveAiModelButton.addEventListener('click', () => {
        const selectedModel = aiModelSelect.value;
        console.log('[Settings] Save AI Model button clicked. selectedModel =', selectedModel);

        if (aiModelStatus) {
            aiModelStatus.textContent = 'AI 모델 저장 중...';
            aiModelStatus.className = 'info-message';
        }

        // 확장 프로그램에 선택된 모델 저장 요청
        vscode.postMessage({ command: 'saveAiModel', model: selectedModel });
    });
}


// 확장으로부터 메시지 수신
window.addEventListener('message', event => {
    const message = event.data;
    switch (message.command) {
        case 'aiModelSaved': {
            console.log('[Settings] aiModelSaved received from extension.');
            if (aiModelStatus) {
                aiModelStatus.textContent = 'AI 모델이 저장되었습니다.';
                aiModelStatus.className = 'success-message';
            }
            break;
        }
        case 'aiModelSaveError': {
            console.warn('[Settings] aiModelSaveError received from extension:', message.error);
            if (aiModelStatus) {
                aiModelStatus.textContent = `AI 모델 저장 실패: ${message.error}`;
                aiModelStatus.className = 'error-message';
            }
            break;
        }
        case 'ollamaModels': {
            // console.log('[Settings] Received ollamaModels message:', message);
            const sel = document.getElementById('ollama-model-select');
            if (sel) {
                // 현재 선택된 모델 저장
                const currentModel = sel.value;

                sel.innerHTML = '';
                const def = document.createElement('option');
                def.value = '';
                def.textContent = '모델을 선택하세요';
                sel.appendChild(def);
                if (Array.isArray(message.models)) {
                    message.models.forEach(name => {
                        const opt = document.createElement('option');
                        opt.value = name;
                        opt.textContent = name;
                        sel.appendChild(opt);
                    });
                }
                // console.log('Ollama 모델 목록 수신:', message.models?.length || 0, '개 from', message.apiUrl || 'unknown');

                // 저장된 모델 값이 있으면 우선 적용, 없으면 기존 모델 유지
                // console.log('[Settings] Applying Ollama model - storedOllamaModel:', storedOllamaModel, 'currentSettingsOllamaModel:', currentSettingsOllamaModel, 'currentModel:', currentModel);

                // currentSettings에서 받은 모델을 우선적으로 사용
                const modelToApply = currentSettingsOllamaModel || storedOllamaModel;
                if (modelToApply && modelToApply !== '') {
                    const options = Array.from(sel.options).map(o => o.value);
                    // console.log('[Settings] Available options:', options);
                    if (options.includes(modelToApply)) {
                        sel.value = modelToApply;
                        // console.log('[Settings] Applied model:', modelToApply);
                    } else {
                        // 목록에 없다면 앞에 추가
                        const opt = document.createElement('option');
                        opt.value = modelToApply;
                        opt.textContent = modelToApply;
                        sel.insertBefore(opt, sel.firstChild);
                        sel.value = modelToApply;
                        // console.log('[Settings] Added and applied model:', modelToApply);
                    }
                    // 적용 후 저장된 값 초기화
                    storedOllamaModel = null;
                    currentSettingsOllamaModel = null;
                } else if (currentModel && currentModel !== '') {
                    sel.value = currentModel;
                    // console.log('[Settings] Applied current model:', currentModel);
                }
            }

            // 다운로드된 모델 목록을 받았을 때 버튼 상태 업데이트
            updateDownloadButtonStates(message.models || []);
            break;
        }
        case 'currentSettings':
            // console.log('[Settings] Received currentSettings message:', message);
            // console.log('[Settings] message.ollamaModel:', message.ollamaModel);

            // 언어 설정 처리
            if (message.language && languageSelect) {
                // console.log('[Settings] Setting language from currentSettings:', message.language);
                languageSelect.value = message.language;
                currentLanguage = message.language;
                loadLanguage(message.language);
            }


            // Ollama 모델 설정 처리
            if (message.ollamaModel && message.ollamaModel !== '') {
                // console.log('[Settings] Storing Ollama model from currentSettings:', message.ollamaModel);
                storedOllamaModel = message.ollamaModel;
                currentSettingsOllamaModel = message.ollamaModel;

                // 이미 Ollama 모델 목록이 로드되었다면 즉시 적용
                const sel = document.getElementById('ollama-model-select');
                if (sel && sel.options.length > 1) { // 기본 옵션 외에 다른 옵션이 있다면
                    // console.log('[Settings] Applying stored model immediately:', message.ollamaModel);
                    const options = Array.from(sel.options).map(o => o.value);
                    if (options.includes(message.ollamaModel)) {
                        sel.value = message.ollamaModel;
                        // console.log('[Settings] Applied stored model immediately:', message.ollamaModel);
                    } else {
                        // 목록에 없다면 앞에 추가
                        const opt = document.createElement('option');
                        opt.value = message.ollamaModel;
                        opt.textContent = message.ollamaModel;
                        sel.insertBefore(opt, sel.firstChild);
                        sel.value = message.ollamaModel;
                        // console.log('[Settings] Added and applied stored model immediately:', message.ollamaModel);
                    }
                    // 적용 후 저장된 값 초기화
                    storedOllamaModel = null;
                    currentSettingsOllamaModel = null;
                }
            }
            if (typeof message.autoUpdateEnabled === 'boolean' && autoUpdateToggle) {
                autoUpdateToggle.checked = message.autoUpdateEnabled;
                const autoUpdateChangedText = languageData['autoUpdateChanged'] || '자동 업데이트';
                const enabledText = languageData['autoUpdateEnabledStatus'] || '활성화됨';
                const disabledText = languageData['autoUpdateDisabledStatus'] || '비활성화됨';
                const currentText = languageData['current'] || '현재:';
                const statusText = `${autoUpdateChangedText} ${message.autoUpdateEnabled ? enabledText : disabledText}.`;
                showStatus(autoUpdateStatus, statusText, 'success');
                autoUpdateStatus.textContent = `${currentText} ${statusText}`;
            }
            if (typeof message.outputLogEnabled === 'boolean' && outputLogToggle) {
                outputLogToggle.checked = message.outputLogEnabled;
                const outputLogEnabledText = languageData['outputLogEnabled'] || 'OUTPUT 로그 활성화';
                const enabledText = languageData['outputLogStatusEnabled'] || '현재: OUTPUT 로그 활성화됨';
                const disabledText = languageData['outputLogStatusDisabled'] || '현재: OUTPUT 로그 비활성화됨';
                const statusText = message.outputLogEnabled ? enabledText : disabledText;
                showStatus(outputLogStatus, statusText, 'success');
                outputLogStatus.textContent = statusText;
            }
            if (typeof message.errorRetryCount === 'number' && errorRetrySpinner) {
                errorRetrySpinner.value = message.errorRetryCount;
                const errorRetryStatusText = languageData['errorRetryStatus'] || '현재: 최대 오류 수정 횟수';
                const timesText = languageData['errorRetryTimes'] || '회';
                const statusText = `${errorRetryStatusText} ${message.errorRetryCount}${timesText}`;
                showStatus(errorRetryStatus, statusText, 'success');
                errorRetryStatus.textContent = statusText;
            }
            if (typeof message.autoExecuteCommandsEnabled === 'boolean' && autoExecuteToggle) {
                autoExecuteToggle.checked = message.autoExecuteCommandsEnabled;
                const autoExecuteOnText = languageData['autoExecuteOn'] || '명령어 자동 실행: 켜짐';
                const autoExecuteOffText = languageData['autoExecuteOff'] || '명령어 자동 실행: 꺼짐';
                const statusText = message.autoExecuteCommandsEnabled ? autoExecuteOnText : autoExecuteOffText;
                showStatus(autoExecuteStatus, statusText, 'success');
                autoExecuteStatus.textContent = statusText;
            }
            if (typeof message.autoCorrectionEnabled === 'boolean' && autoCorrectionToggle) {
                autoCorrectionToggle.checked = message.autoCorrectionEnabled;
                if (autoCorrectionStatus) {
                    autoCorrectionStatus.textContent = message.autoCorrectionEnabled ? (languageData['autoCorrectionOn'] || '자동 오류 수정: 켜짐') : (languageData['autoCorrectionOff'] || '자동 오류 수정: 꺼짐');
                }
                if (errorRetrySpinner) {
                    errorRetrySpinner.disabled = !message.autoCorrectionEnabled;
                    errorRetrySpinner.style.opacity = message.autoCorrectionEnabled ? '1' : '0.5';
                }
            }
            if (typeof message.projectRoot === 'string') {
                updateProjectRootDisplay(message.projectRoot);
                const projectRootLoadedText = languageData['projectRootLoaded'] || '프로젝트 Root 로드 완료.';
                showStatus(projectRootStatus, projectRootLoadedText, 'success');
            } else {
                // 프로젝트 Root가 설정되지 않은 경우에도 업데이트
                updateProjectRootDisplay(null);
            }

            // ===== AI 모델 설정 적용 =====
            if (aiModelSelect && typeof message.aiModel === 'string') {
                // 저장된 모델을 UI 표시용으로 변환
                let displayModel = message.aiModel;
                if (message.aiModel === 'ollama-gemma' || message.aiModel === 'ollama-deepseek' ||
                    message.aiModel === 'ollama-codellama' || message.aiModel === 'ollama-gpt-oss') {
                    displayModel = 'ollama';
                } else if (message.aiModel === 'gemini') {
                    displayModel = 'gemini';
                }

                aiModelSelect.value = displayModel;

                // 모델에 따라 섹션 활성화/비활성화
                if (displayModel === 'gemini') {
                    geminiSettingsSection.classList.remove('disabled');
                    localOllamaSettingsSection.classList.add('disabled');
                    remoteOllamaSettingsSection.classList.add('disabled');
                } else if (displayModel === 'ollama') {
                    geminiSettingsSection.classList.add('disabled');
                    // 서버 타입에 따라 활성 섹션 결정
                    const serverType = message.ollamaServerType || 'local';
                    if (serverType === 'remote') {
                        if (localOllamaSettingsSection) {
                            localOllamaSettingsSection.style.display = 'none';
                            localOllamaSettingsSection.classList.add('disabled');
                        }
                        if (remoteOllamaSettingsSection) {
                            remoteOllamaSettingsSection.style.display = 'block';
                            remoteOllamaSettingsSection.classList.remove('disabled');
                        }
                    } else {
                        if (localOllamaSettingsSection) {
                            localOllamaSettingsSection.style.display = 'block';
                            localOllamaSettingsSection.classList.remove('disabled');
                        }
                        if (remoteOllamaSettingsSection) {
                            remoteOllamaSettingsSection.style.display = 'none';
                            remoteOllamaSettingsSection.classList.add('disabled');
                        }
                    }
                }
            }

            // ===== Ollama 서버 타입 및 저장된 설정 적용 =====
            if (ollamaServerTypeSelect && typeof message.ollamaServerType === 'string') {
                ollamaServerTypeSelect.value = message.ollamaServerType || 'local';
                const setText = message.ollamaServerType === 'remote'
                    ? (languageData['ollamaServerTypeRemoteSet'] || 'Ollama 서버 타입: 원격 서버')
                    : (languageData['ollamaServerTypeLocalSet'] || 'Ollama 서버 타입: 로컬 머신');
                showStatus(ollamaServerTypeStatus, setText, 'success');

                // AI 모델이 'ollama'인 경우에만 섹션 활성화/비활성화
                const currentAiModel = aiModelSelect ? aiModelSelect.value : 'gemini';
                if (currentAiModel === 'ollama') {
                    // 섹션 가시성 + disabled 클래스 동기화
                    if (message.ollamaServerType === 'remote') {
                        if (localOllamaSettingsSection) {
                            localOllamaSettingsSection.style.display = 'none';
                            localOllamaSettingsSection.classList.add('disabled');
                        }
                        if (remoteOllamaSettingsSection) {
                            remoteOllamaSettingsSection.style.display = 'block';
                            remoteOllamaSettingsSection.classList.remove('disabled');
                        }
                    } else {
                        if (localOllamaSettingsSection) {
                            localOllamaSettingsSection.style.display = 'block';
                            localOllamaSettingsSection.classList.remove('disabled');
                        }
                        if (remoteOllamaSettingsSection) {
                            remoteOllamaSettingsSection.style.display = 'none';
                            remoteOllamaSettingsSection.classList.add('disabled');
                        }
                    }
                }
            }

            // 로컬 Ollama 저장값 적용
            if (localOllamaApiUrlInput && typeof message.localOllamaApiUrl === 'string') {
                localOllamaApiUrlInput.value = message.localOllamaApiUrl || '';
                const txt = message.localOllamaApiUrl
                    ? (languageData['ollamaApiUrlSet'] || 'Ollama API URL이 설정되어 있습니다.')
                    : (languageData['ollamaApiUrlNotSet'] || 'Ollama API URL이 설정되지 않았습니다.');
                if (localOllamaApiUrlStatus) showStatus(localOllamaApiUrlStatus, txt, message.localOllamaApiUrl ? 'success' : 'info');
            }
            if (localOllamaEndpointSelect && typeof message.localOllamaEndpoint === 'string') {
                localOllamaEndpointSelect.value = message.localOllamaEndpoint || '/api/generate';
                const txt = message.localOllamaEndpoint
                    ? (languageData['ollamaEndpointSet'] || `로컬 엔드포인트가 설정되어 있습니다: ${message.localOllamaEndpoint}`)
                    : (languageData['ollamaEndpointNotSet'] || '로컬 엔드포인트가 설정되지 않았습니다.');
                if (localOllamaEndpointStatus) showStatus(localOllamaEndpointStatus, txt, message.localOllamaEndpoint ? 'success' : 'info');
            }

            // 원격 Ollama 저장값 적용
            if (remoteOllamaApiUrlInput && typeof message.remoteOllamaApiUrl === 'string') {
                remoteOllamaApiUrlInput.value = message.remoteOllamaApiUrl || '';
                const txt = message.remoteOllamaApiUrl
                    ? (languageData['ollamaApiUrlSet'] || 'Ollama API URL이 설정되어 있습니다.')
                    : (languageData['ollamaApiUrlNotSet'] || 'Ollama API URL이 설정되지 않았습니다.');
                if (remoteOllamaApiUrlStatus) showStatus(remoteOllamaApiUrlStatus, txt, message.remoteOllamaApiUrl ? 'success' : 'info');
            }
            if (remoteOllamaEndpointSelect && typeof message.remoteOllamaEndpoint === 'string') {
                remoteOllamaEndpointSelect.value = message.remoteOllamaEndpoint || '/api/chat';
                const txt = message.remoteOllamaEndpoint
                    ? (languageData['ollamaEndpointSet'] || `원격 서버 엔드포인트가 설정되어 있습니다: ${message.remoteOllamaEndpoint}`)
                    : (languageData['ollamaEndpointNotSet'] || '원격 서버 엔드포인트가 설정되지 않았습니다.');
                if (remoteOllamaEndpointStatus) showStatus(remoteOllamaEndpointStatus, txt, message.remoteOllamaEndpoint ? 'success' : 'info');
            }
            if (remoteOllamaModelInput && typeof message.remoteOllamaModel === 'string') {
                remoteOllamaModelInput.value = message.remoteOllamaModel || '';
                const txt = message.remoteOllamaModel
                    ? (languageData['ollamaModelSet'] || `원격 서버 모델이 설정되어 있습니다: ${message.remoteOllamaModel}`)
                    : (languageData['ollamaModelNotSet'] || '원격 서버 모델이 설정되지 않았습니다.');
                if (remoteOllamaModelStatus) showStatus(remoteOllamaModelStatus, txt, message.remoteOllamaModel ? 'success' : 'info');
            }
            break;
        case 'aiModelSaved':
            if (aiModelStatus) {
                aiModelStatus.textContent = 'AI 모델이 성공적으로 저장되었습니다.';
                aiModelStatus.className = 'info-message success-message';
            }
            break;
        case 'aiModelSaveError':
            if (aiModelStatus) {
                aiModelStatus.textContent = `AI 모델 저장 실패: ${message.error}`;
                aiModelStatus.className = 'info-message error-message';
            }
            break;
        case 'currentAiModel':
            if (aiModelSelect && message.model) {
                // console.log('Received current AI model:', message.model);

                // 저장된 모델을 UI 표시용으로 변환
                let displayModel = message.model;
                if (message.model === 'ollama-gemma' || message.model === 'ollama-deepseek' ||
                    message.model === 'ollama-codellama' || message.model === 'ollama-gpt-oss') {
                    displayModel = 'ollama';
                } else if (message.model === 'gemini') {
                    displayModel = 'gemini';
                }

                // console.log('Setting AI model select to:', displayModel);
                aiModelSelect.value = displayModel;

                // 모델에 따라 섹션 활성화/비활성화
                if (displayModel === 'gemini') {
                    geminiSettingsSection.classList.remove('disabled');
                    localOllamaSettingsSection.classList.add('disabled');
                    remoteOllamaSettingsSection.classList.add('disabled');
                } else if (displayModel === 'ollama') {
                    geminiSettingsSection.classList.add('disabled');
                    // 서버 타입에 따라 활성 섹션 결정
                    const serverType = ollamaServerTypeSelect ? ollamaServerTypeSelect.value : 'local';
                    if (serverType === 'remote') {
                        localOllamaSettingsSection.classList.add('disabled');
                        remoteOllamaSettingsSection.classList.remove('disabled');
                    } else {
                        localOllamaSettingsSection.classList.remove('disabled');
                        remoteOllamaSettingsSection.classList.add('disabled');
                    }
                    // Ollama 모델 목록 로드
                    try { loadOllamaModels(); } catch (e) { console.warn('loadOllamaModels failed:', e); }
                }
            }
            break;
        case 'autoUpdateStatusChanged':
            if (typeof message.enabled === 'boolean' && autoUpdateToggle) {
                autoUpdateToggle.checked = message.enabled;
                const autoUpdateChangedText = languageData['autoUpdateChanged'] || '자동 업데이트';
                const enabledText = languageData['autoUpdateEnabledStatus'] || '활성화됨';
                const disabledText = languageData['autoUpdateDisabledStatus'] || '비활성화됨';
                const currentText = languageData['current'] || '현재:';
                const statusText = `${autoUpdateChangedText} ${message.enabled ? enabledText : disabledText}.`;
                showStatus(autoUpdateStatus, statusText, 'success');
                autoUpdateStatus.textContent = `${currentText} ${statusText}`;
            }
            break;
        case 'outputLogStatusChanged':
            if (typeof message.enabled === 'boolean' && outputLogToggle) {
                outputLogToggle.checked = message.enabled;
                const outputLogEnabledText = languageData['outputLogEnabled'] || 'OUTPUT 로그 활성화';
                const enabledText = languageData['outputLogStatusEnabled'] || '현재: OUTPUT 로그 활성화됨';
                const disabledText = languageData['outputLogStatusDisabled'] || '현재: OUTPUT 로그 비활성화됨';
                const statusText = message.enabled ? enabledText : disabledText;
                showStatus(outputLogStatus, statusText, 'success');
                outputLogStatus.textContent = statusText;
            }
            break;
        case 'errorRetryCountChanged':
            if (typeof message.count === 'number' && errorRetrySpinner) {
                errorRetrySpinner.value = message.count;
                const errorRetryStatusText = languageData['errorRetryStatus'] || '현재: 최대 오류 수정 횟수';
                const timesText = languageData['errorRetryTimes'] || '회';
                const statusText = `${errorRetryStatusText} ${message.count}${timesText}`;
                showStatus(errorRetryStatus, statusText, 'success');
                errorRetryStatus.textContent = statusText;
            }
            break;
        case 'autoCorrectionStatusChanged':
            if (typeof message.enabled === 'boolean' && autoCorrectionToggle) {
                autoCorrectionToggle.checked = message.enabled;
                if (autoCorrectionStatus) {
                    autoCorrectionStatus.textContent = message.enabled ? (languageData['autoCorrectionOn'] || '자동 오류 수정: 켜짐') : (languageData['autoCorrectionOff'] || '자동 오류 수정: 꺼짐');
                }
                if (errorRetrySpinner) {
                    errorRetrySpinner.disabled = !message.enabled;
                    errorRetrySpinner.style.opacity = message.enabled ? '1' : '0.5';
                }
            }
            break;
        case 'currentApiKeys':
            // API 키 상태 로드
            // Gemini API 키 상태 로드
            if (geminiApiKeyInput && typeof message.geminiApiKey === 'string') {
                geminiApiKeyInput.value = message.geminiApiKey;
                const geminiApiKeySetText = message.geminiApiKey ?
                    (languageData['geminiApiKeySet'] || 'Gemini API 키가 설정되어 있습니다.') :
                    (languageData['geminiApiKeyNotSet'] || 'Gemini API 키가 설정되지 않았습니다.');
                showStatus(geminiApiKeyStatus, geminiApiKeySetText, message.geminiApiKey ? 'success' : 'info');
            }
            // 로컬 Ollama API URL 상태 로드 (기본값 폴백)
            if (localOllamaApiUrlInput && typeof message.localOllamaApiUrl === 'string') {
                localOllamaApiUrlInput.value = message.localOllamaApiUrl || 'http://localhost:11434';
                const localOllamaApiUrlSetText = message.localOllamaApiUrl ?
                    (languageData['ollamaApiUrlSet'] || '로컬 Ollama API URL이 설정되어 있습니다.') :
                    (languageData['ollamaApiUrlNotSet'] || '로컬 Ollama API URL이 설정되지 않았습니다.');
                showStatus(localOllamaApiUrlStatus, localOllamaApiUrlSetText, message.localOllamaApiUrl ? 'success' : 'info');
            }
            // 로컬 Ollama 엔드포인트 상태 로드 (기본값 폴백)
            if (localOllamaEndpointSelect && typeof message.localOllamaEndpoint === 'string') {
                localOllamaEndpointSelect.value = message.localOllamaEndpoint || '/api/generate';
                const localOllamaEndpointSetText = message.localOllamaEndpoint ?
                    `로컬 Ollama 엔드포인트가 설정되어 있습니다: ${message.localOllamaEndpoint}` :
                    '로컬 Ollama 엔드포인트가 설정되지 않았습니다.';
                showStatus(localOllamaEndpointStatus, localOllamaEndpointSetText, message.localOllamaEndpoint ? 'success' : 'info');
            }
            // 원격 서버 API URL 상태 로드
            if (remoteOllamaApiUrlInput && typeof message.remoteOllamaApiUrl === 'string') {
                remoteOllamaApiUrlInput.value = message.remoteOllamaApiUrl || '';
                const remoteOllamaApiUrlSetText = message.remoteOllamaApiUrl ?
                    '원격 서버 API URL이 설정되어 있습니다.' :
                    '원격 서버 API URL이 설정되지 않았습니다.';
                showStatus(remoteOllamaApiUrlStatus, remoteOllamaApiUrlSetText, message.remoteOllamaApiUrl ? 'success' : 'info');
            }
            // 원격 서버 엔드포인트 상태 로드
            if (remoteOllamaEndpointSelect && typeof message.remoteOllamaEndpoint === 'string') {
                remoteOllamaEndpointSelect.value = message.remoteOllamaEndpoint || '/api/generate';
                const remoteOllamaEndpointSetText = message.remoteOllamaEndpoint ?
                    `원격 서버 엔드포인트가 설정되어 있습니다: ${message.remoteOllamaEndpoint}` :
                    '원격 서버 엔드포인트가 설정되지 않았습니다.';
                showStatus(remoteOllamaEndpointStatus, remoteOllamaEndpointSetText, message.remoteOllamaEndpoint ? 'success' : 'info');
            }
            // 원격 서버 모델명 상태 로드
            if (remoteOllamaModelInput && typeof message.remoteOllamaModel === 'string') {
                remoteOllamaModelInput.value = message.remoteOllamaModel || '';
                const remoteOllamaModelSetText = message.remoteOllamaModel ?
                    `원격 서버 모델이 설정되어 있습니다: ${message.remoteOllamaModel}` :
                    '원격 서버 모델이 설정되지 않았습니다.';
                showStatus(remoteOllamaModelStatus, remoteOllamaModelSetText, message.remoteOllamaModel ? 'success' : 'info');
            }
            // Ollama 서버 타입 상태 로드
            if (ollamaServerTypeSelect && typeof message.ollamaServerType === 'string') {
                ollamaServerTypeSelect.value = message.ollamaServerType || 'local';
                const ollamaServerTypeSetText = message.ollamaServerType ?
                    `Ollama 서버 타입이 설정되어 있습니다: ${message.ollamaServerType === 'local' ? '로컬 머신' : '원격 서버'}` :
                    'Ollama 서버 타입이 설정되지 않았습니다.';
                showStatus(ollamaServerTypeStatus, ollamaServerTypeSetText, message.ollamaServerType ? 'success' : 'info');

                // 서버 타입에 따라 섹션 표시/숨김
                if (message.ollamaServerType === 'local') {
                    localOllamaSettingsSection.style.display = 'block';
                    remoteOllamaSettingsSection.style.display = 'none';
                    if (localOllamaSettingsSection) localOllamaSettingsSection.classList.remove('disabled');
                    if (remoteOllamaSettingsSection) remoteOllamaSettingsSection.classList.add('disabled');
                } else if (message.ollamaServerType === 'remote') {
                    localOllamaSettingsSection.style.display = 'none';
                    remoteOllamaSettingsSection.style.display = 'block';
                    if (localOllamaSettingsSection) localOllamaSettingsSection.classList.add('disabled');
                    if (remoteOllamaSettingsSection) remoteOllamaSettingsSection.classList.remove('disabled');
                }
            }
            // Ollama 모델 상태 로드 - 저장된 모델 값을 전역 변수에 저장하고 드롭다운에 적용
            if (typeof message.ollamaModel === 'string' && message.ollamaModel !== '') {
                storedOllamaModel = message.ollamaModel;
                console.log('[Settings] Stored Ollama model:', storedOllamaModel);

                // 드롭다운에 직접 적용
                if (ollamaModelSelect && message.ollamaModel) {
                    // 모델이 목록에 있는지 확인
                    const existingOption = Array.from(ollamaModelSelect.options).find(option => option.value === message.ollamaModel);
                    if (existingOption) {
                        ollamaModelSelect.value = message.ollamaModel;
                        console.log('[Settings] Applied Ollama model to dropdown:', message.ollamaModel);
                    } else {
                        // 목록에 없다면 추가
                        const newOption = document.createElement('option');
                        newOption.value = message.ollamaModel;
                        newOption.textContent = message.ollamaModel;
                        ollamaModelSelect.appendChild(newOption);
                        ollamaModelSelect.value = message.ollamaModel;
                        console.log('[Settings] Added and applied Ollama model to dropdown:', message.ollamaModel);
                    }
                }

                const ollamaModelSetText = message.ollamaModel ?
                    `Ollama 모델이 설정되어 있습니다: ${message.ollamaModel}` :
                    'Ollama 모델이 설정되지 않았습니다.';
                showStatus(ollamaModelStatus, ollamaModelSetText, message.ollamaModel ? 'success' : 'info');
            } else {
                console.log('[Settings] No valid ollamaModel in currentSettings message');
            }
            // Banya 라이센스 상태 로드
            if (banyaLicenseSerialInput && typeof message.banyaLicenseSerial === 'string') {
                // 추가 검증 - 잘못된 데이터 필터링
                const isValidLicense = message.banyaLicenseSerial &&
                    message.banyaLicenseSerial.trim() !== '' &&
                    !message.banyaLicenseSerial.includes('/') &&
                    !message.banyaLicenseSerial.includes('\\') &&
                    !message.banyaLicenseSerial.includes('프로젝트') &&
                    !message.banyaLicenseSerial.includes('Project') &&
                    !message.banyaLicenseSerial.includes('설정') &&
                    !message.banyaLicenseSerial.includes('Setting') &&
                    message.banyaLicenseSerial.length > 5;

                if (isValidLicense) {
                    banyaLicenseSerialInput.value = message.banyaLicenseSerial.trim();
                    banyaLicenseSerialInput.readOnly = true; // 저장된 라이센스는 읽기 전용으로 설정
                    const banyaLicenseSetText = languageData['banyaLicenseSet'] || 'Banya 라이센스가 설정되어 있습니다.';
                    showStatus(banyaLicenseStatus, banyaLicenseSetText, 'success');
                } else {
                    banyaLicenseSerialInput.value = '';
                    banyaLicenseSerialInput.readOnly = false; // 라이센스가 없으면 편집 가능
                    const banyaLicenseNotSetText = languageData['banyaLicenseNotSet'] || 'Banya 라이센스가 설정되지 않았습니다.';
                    showStatus(banyaLicenseStatus, banyaLicenseNotSetText, 'info');
                }
            }

            // 라이선스 검증 상태 처리
            if (typeof message.isLicenseVerified === 'boolean') {
                isLicenseVerified = message.isLicenseVerified;
                // console.log('License verification status received:', isLicenseVerified);
            } else {
                console.log('No license verification status received, message:', message);
            }

            // API 키 로드 완료 후 저장 버튼 상태 재확인
            setTimeout(() => {
                // console.log('Final button state update after API keys load, isLicenseVerified:', isLicenseVerified);
                updateSaveButtonsState();
                updateLicenseButtonsState();
            }, 100);
            break;
        case 'apiKeySaved':
            const geminiApiKeySavedText = languageData['geminiApiKeySaved'] || 'Gemini API 키가 저장되었습니다.';
            showStatus(geminiApiKeyStatus, geminiApiKeySavedText, 'success');
            geminiApiKeyInput.value = '';
            break;
        case 'apiKeySaveError':
            const geminiApiKeyErrorText = languageData['geminiApiKeyError'] || 'Gemini API 키 저장 실패:';
            showStatus(geminiApiKeyStatus, `${geminiApiKeyErrorText} ${message.error}`, 'error');
            break;
        case 'localOllamaApiUrlSaved':
            const localOllamaApiUrlSavedText = languageData['ollamaApiUrlSaved'] || '로컬 Ollama API URL이 저장되었습니다.';
            showStatus(localOllamaApiUrlStatus, localOllamaApiUrlSavedText, 'success');
            localOllamaApiUrlInput.value = '';
            break;
        case 'localOllamaApiUrlError':
            const localOllamaApiUrlErrorText = languageData['ollamaApiUrlError'] || '로컬 Ollama API URL 저장 실패:';
            showStatus(localOllamaApiUrlStatus, `${localOllamaApiUrlErrorText} ${message.error}`, 'error');
            break;
        case 'localOllamaEndpointSaved':
            showStatus(localOllamaEndpointStatus, '로컬 Ollama 엔드포인트가 저장되었습니다.', 'success');
            break;
        case 'localOllamaEndpointError':
            showStatus(localOllamaEndpointStatus, `로컬 Ollama 엔드포인트 저장 실패: ${message.error}`, 'error');
            break;
        case 'remoteOllamaApiUrlSaved':
            showStatus(remoteOllamaApiUrlStatus, '원격 서버 API URL이 저장되었습니다.', 'success');
            remoteOllamaApiUrlInput.value = '';
            break;
        case 'remoteOllamaApiUrlError':
            showStatus(remoteOllamaApiUrlStatus, `원격 서버 API URL 저장 실패: ${message.error}`, 'error');
            break;
        case 'remoteOllamaEndpointSaved':
            showStatus(remoteOllamaEndpointStatus, '원격 서버 엔드포인트가 저장되었습니다.', 'success');
            break;
        case 'remoteOllamaEndpointError':
            showStatus(remoteOllamaEndpointStatus, `원격 서버 엔드포인트 저장 실패: ${message.error}`, 'error');
            break;
        case 'remoteOllamaModelSaved':
            showStatus(remoteOllamaModelStatus, '원격 서버 모델명이 저장되었습니다.', 'success');
            remoteOllamaModelInput.value = '';
            break;
        case 'remoteOllamaModelError':
            showStatus(remoteOllamaModelStatus, `원격 서버 모델명 저장 실패: ${message.error}`, 'error');
            break;
        case 'ollamaServerTypeSaved':
            showStatus(ollamaServerTypeStatus, 'Ollama 서버 타입이 저장되었습니다.', 'success');
            break;
        case 'ollamaServerTypeSaveError':
            showStatus(ollamaServerTypeStatus, `Ollama 서버 타입 저장 실패: ${message.error}`, 'error');
            break;
        case 'banyaLicenseSaved':
            const banyaLicenseSavedText = languageData['banyaLicenseSaved'] || 'Banya 라이센스가 저장되었습니다.';
            showStatus(banyaLicenseStatus, banyaLicenseSavedText, 'success');
            banyaLicenseSerialInput.value = '';
            break;
        case 'banyaLicenseError':
            const banyaLicenseErrorText = languageData['banyaLicenseError'] || 'Banya 라이센스 저장 실패:';
            showStatus(banyaLicenseStatus, `${banyaLicenseErrorText} ${message.error}`, 'error');
            break;
        case 'errorRetryCountSaved':
            const errorRetryCountSavedText = languageData['errorRetryCountSaved'] || '오류 수정 횟수가 저장되었습니다.';
            showStatus(errorRetryStatus, errorRetryCountSavedText, 'success');
            break;
        case 'errorRetryCountSaveError':
            const errorRetryCountSaveErrorText = languageData['errorRetryCountSaveError'] || '오류 수정 횟수 저장 실패:';
            showStatus(errorRetryStatus, `${errorRetryCountSaveErrorText} ${message.error}`, 'error');
            break;
        case 'banyaLicenseVerified':
            const banyaLicenseVerifiedText = languageData['banyaLicenseVerified'] || 'Banya 라이센스가 유효합니다.';
            showStatus(banyaLicenseStatus, banyaLicenseVerifiedText, 'success');
            isLicenseVerified = true;
            console.log('License verification successful, enabling save buttons');
            updateSaveButtonsState();
            updateLicenseButtonsState();
            break;
        case 'banyaLicenseVerificationFailed':
            const banyaLicenseVerificationFailedText = languageData['banyaLicenseVerificationFailed'] || 'Banya 라이센스 검증 실패:';
            showStatus(banyaLicenseStatus, `${banyaLicenseVerificationFailedText} ${message.error}`, 'error');
            isLicenseVerified = false;
            console.log('License verification failed, disabling save buttons');
            updateSaveButtonsState();
            updateLicenseButtonsState();
            break;
        case 'banyaLicenseDeleted':
            const banyaLicenseDeletedText = languageData['banyaLicenseDeleted'] || 'Banya 라이센스가 삭제되었습니다.';
            showStatus(banyaLicenseStatus, banyaLicenseDeletedText, 'success');
            if (banyaLicenseSerialInput) {
                banyaLicenseSerialInput.value = '';
                banyaLicenseSerialInput.readOnly = false; // 라이센스 삭제 시 편집 가능하게 설정
            }
            isLicenseVerified = false;
            updateSaveButtonsState();
            updateLicenseButtonsState();
            break;
        case 'banyaLicenseDeleteError':
            const banyaLicenseDeleteErrorText = languageData['banyaLicenseDeleteError'] || 'Banya 라이센스 삭제 실패:';
            showStatus(banyaLicenseStatus, `${banyaLicenseDeleteErrorText} ${message.error}`, 'error');
            break;
        case 'aiModelSaved':
            const aiModelSavedText = languageData['aiModelSaved'] || 'AI 모델이 저장되었습니다.';
            showStatus(sourcePathStatus, aiModelSavedText, 'success');
            break;
        case 'aiModelSaveError':
            const aiModelSaveErrorText = languageData['aiModelSaveError'] || 'AI 모델 저장 실패:';
            showStatus(sourcePathStatus, `${aiModelSaveErrorText} ${message.error}`, 'error');
            break;
        case 'currentOllamaModel':
            if (message.model && ollamaModelSelect) {
                // console.log('Received current Ollama model:', message.model);
                ollamaModelSelect.value = message.model;
                const ollamaModelSetText = message.model ?
                    `Ollama 모델이 설정되어 있습니다: ${message.model}` :
                    'Ollama 모델이 설정되지 않았습니다.';
                showStatus(ollamaModelStatus, ollamaModelSetText, message.model ? 'success' : 'info');

                // gpt-oss-120b:cloud 모델인 경우 인증 섹션 표시
                const authSection = document.getElementById('ollama-auth-section');
                const authStatus = document.getElementById('ollama-auth-status');

                if (message.model === 'gpt-oss-120b:cloud') {
                    if (authSection) authSection.style.display = 'flex';
                    if (authStatus) authStatus.style.display = 'block';
                } else {
                    if (authSection) authSection.style.display = 'none';
                    if (authStatus) authStatus.style.display = 'none';
                }
            }
            break;
        case 'ollamaModelSaved':
            showStatus(ollamaModelStatus, 'Ollama 모델이 저장되었습니다.', 'success');
            break;
        case 'ollamaModelError':
            showStatus(ollamaModelStatus, `Ollama 모델 저장 실패: ${message.error}`, 'error');
            break;
        case 'ollamaAuthResult':
            if (message.success) {
                showStatus(ollamaAuthStatus, 'Ollama 인증이 성공했습니다.', 'success');
            } else {
                showStatus(ollamaAuthStatus, `Ollama 인증 실패: ${message.message}`, 'error');
            }
            break;
        case 'languageDataLoaded':
            if (message.languageData) {
                languageData = message.languageData;
                console.log('Language data loaded:', Object.keys(languageData).length, 'keys');
                applyLanguage();
            }
            break;
        case 'languageSaved':
            console.log('Language saved successfully:', message.language);
            currentLanguage = message.language;
            if (languageSelect) {
                languageSelect.value = currentLanguage;
            }
            const languageChangedText = languageData['languageChanged'] || '언어가';
            const languageChangedToText = languageData['languageChangedTo'] || '로 변경되었습니다.';
            showStatus(sourcePathStatus, `${languageChangedText} ${message.language} ${languageChangedToText}`, 'success');
            break;
        case 'languageSaveError':
            const languageSaveErrorText = languageData['languageSaveError'] || '언어 저장 실패:';
            showStatus(sourcePathStatus, `${languageSaveErrorText} ${message.error}`, 'error');
            break;
        case 'currentLanguage':
            // console.log('[Settings] Received currentLanguage message:', message.language);
            if (message.language) {
                currentLanguage = message.language;
                if (languageSelect) {
                    languageSelect.value = currentLanguage;
                    console.log('[Settings] Set language select value to:', currentLanguage);
                }
                loadLanguage(currentLanguage);
            }
            break;
        case 'languageSaveError':
            console.error('Language save error:', message.error);
            // 오류 발생 시 이전 언어로 되돌리기
            if (languageSelect) {
                languageSelect.value = currentLanguage;
            }
            break;
        case 'languageDataReceived':
            if (message.language && message.data) {
                // console.log('Received language data for:', message.language);
                // console.log('Language data keys:', Object.keys(message.data));
                languageData = message.data;
                currentLanguage = message.language;
                sessionStorage.setItem('aidev-ideLang', message.language);

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

                // 디버깅: 프로젝트 Root 표시 업데이트 확인
                if (projectRootPathDisplay) {
                    // console.log('Project root display current text:', projectRootPathDisplay.textContent);
                    // console.log('No project root set translation:', languageData['noProjectRootSet']);
                }

                // 언어 변경 후 즉시 모든 상태 메시지 업데이트
                if (sourcePathStatus && sourcePathStatus.textContent) {
                    const currentText = sourcePathStatus.textContent;
                    if (currentText.includes('로드 완료') || currentText.includes('loaded successfully') ||
                        currentText.includes('cargado correctamente') || currentText.includes('chargé avec succès') ||
                        currentText.includes('加载完成') || currentText.includes('正常に読み込まれました')) {
                        sourcePathStatus.textContent = languageData['sourcePathsLoaded'] || '소스 경로 로드 완료.';
                    }
                }

                if (projectRootStatus && projectRootStatus.textContent) {
                    const currentText = projectRootStatus.textContent;
                    if (currentText.includes('로드 완료') || currentText.includes('loaded successfully') ||
                        currentText.includes('cargado correctamente') || currentText.includes('chargé avec succès') ||
                        currentText.includes('加载完成') || currentText.includes('正常に読み込まれました')) {
                        projectRootStatus.textContent = languageData['projectRootLoaded'] || '프로젝트 Root 로드 완료.';
                    }
                }

                if (autoUpdateStatus && autoUpdateStatus.textContent) {
                    const currentText = autoUpdateStatus.textContent;
                    if (currentText.includes('활성화됨') || currentText.includes('enabled') ||
                        currentText.includes('habilitada') || currentText.includes('activée') ||
                        currentText.includes('已启用') || currentText.includes('有効') ||
                        currentText.includes('비활성화됨') || currentText.includes('disabled') ||
                        currentText.includes('deshabilitada') || currentText.includes('désactivée') ||
                        currentText.includes('已禁用') || currentText.includes('無効')) {
                        // 자동 업데이트 상태 텍스트 업데이트
                        const autoUpdateChangedText = languageData['autoUpdateChanged'] || '자동 업데이트';
                        const enabledText = languageData['autoUpdateEnabledStatus'] || '활성화됨';
                        const disabledText = languageData['autoUpdateDisabledStatus'] || '비활성화됨';
                        const currentText = languageData['current'] || '현재:';
                        const isEnabled = autoUpdateToggle ? autoUpdateToggle.checked : false;
                        const statusText = `${autoUpdateChangedText} ${isEnabled ? enabledText : disabledText}.`;
                        autoUpdateStatus.textContent = `${currentText} ${statusText}`;
                    }
                }
            }
            break;
    }
});

// Webview 로드 시 초기 설정값 요청 (제거 - 중복 방지)
vscode.postMessage({ command: 'loadApiKeys' });
vscode.postMessage({ command: 'loadAiModel' });
vscode.postMessage({ command: 'loadOllamaModel' });

const apiKeysLoadingText = languageData['apiKeysLoading'] || 'API 키 로드 중...';
showStatus(weatherApiKeyStatus, apiKeysLoadingText, 'info');
showStatus(newsApiKeyStatus, apiKeysLoadingText, 'info');
showStatus(stockApiKeyStatus, apiKeysLoadingText, 'info');
showStatus(geminiApiKeyStatus, apiKeysLoadingText, 'info');
if (localOllamaApiUrlStatus) showStatus(localOllamaApiUrlStatus, apiKeysLoadingText, 'info');
if (remoteOllamaApiUrlStatus) showStatus(remoteOllamaApiUrlStatus, apiKeysLoadingText, 'info');
showStatus(banyaLicenseStatus, apiKeysLoadingText, 'info');

// API 키 로드 후 저장 버튼 상태 업데이트는 currentApiKeys 메시지를 받은 후에 수행됨
// 여기서는 초기화만 하고, 실제 업데이트는 서버 응답 후에 수행

// Ollama 모델 목록 불러오기
loadOllamaModels();

// 초기 상태: Gemini가 기본값이므로 Gemini 설정 섹션 활성화, Ollama 설정 섹션 비활성화
if (geminiSettingsSection) geminiSettingsSection.classList.remove('disabled');
// 초기 활성화 상태는 AI 모델과 서버 타입에 따라 결정
if (aiModelSelect && aiModelSelect.value === 'ollama') {
    const serverType = ollamaServerTypeSelect ? ollamaServerTypeSelect.value : 'local';
    if (serverType === 'remote') {
        if (localOllamaSettingsSection) localOllamaSettingsSection.classList.add('disabled');
        if (remoteOllamaSettingsSection) remoteOllamaSettingsSection.classList.remove('disabled');
    } else {
        if (localOllamaSettingsSection) localOllamaSettingsSection.classList.remove('disabled');
        if (remoteOllamaSettingsSection) remoteOllamaSettingsSection.classList.add('disabled');
    }
} else {
    if (localOllamaSettingsSection) localOllamaSettingsSection.classList.add('disabled');
    if (remoteOllamaSettingsSection) remoteOllamaSettingsSection.classList.add('disabled');
}

// 초기 상태: 라이선스 검증 상태는 서버에서 받아올 때까지 대기
// isLicenseVerified는 서버에서 전송된 값으로 설정됨

// Ollama 모델 목록을 확장 호스트에 요청하여 수신
async function loadOllamaModels() {
    // console.log('Ollama 모델 목록 요청 (호스트)');
    vscode.postMessage({ command: 'getOllamaModels' });
}

// 로컬 Ollama API URL 변경 시 모델 목록 다시 불러오기
if (localOllamaApiUrlInput) {
    localOllamaApiUrlInput.addEventListener('change', () => {
        // console.log('로컬 Ollama API URL 변경됨, 모델 목록 다시 불러오기');
        loadOllamaModels();
    });

    localOllamaApiUrlInput.addEventListener('blur', () => {
        // console.log('로컬 Ollama API URL 입력 완료, 모델 목록 다시 불러오기');
        loadOllamaModels();
    });
}

// Ollama 모델 다운로드 기능
let supportedModels = [];

// 지원되는 모델 목록 로드
async function loadSupportedModels() {
    // console.log('[Settings] Starting to load supported models...');
    try {
        if (vscode) {
            // console.log('[Settings] Sending getSupportedModels command to extension');
            vscode.postMessage({ command: 'getSupportedModels' });
        } else {
            throw new Error('VS Code API not available');
        }
    } catch (error) {
        console.error('[Settings] Failed to load supported models:', error);
        const modelListContainer = document.getElementById('ollama-model-list');
        if (modelListContainer) {
            modelListContainer.innerHTML = '<p class="info-message">모델 목록을 불러올 수 없습니다.</p>';
        }
    }
}

// 모델 리스트 렌더링
function renderModelList() {
    // console.log('[Settings] renderModelList called with supportedModels:', supportedModels);
    const modelListContainer = document.getElementById('ollama-model-list');
    if (!modelListContainer) {
        console.error('[Settings] ollama-model-list container not found');
        return;
    }

    modelListContainer.innerHTML = '';
    // console.log('[Settings] Rendering', supportedModels.length, 'models');

    supportedModels.forEach(model => {
        const modelItem = document.createElement('div');
        modelItem.className = 'model-item';
        modelItem.setAttribute('data-model', model.name);
        modelItem.innerHTML = `
            <div class="model-info">
                <div class="model-name">${model.displayName}</div>
                <div class="model-description">${model.description}</div>
                <div class="model-size">크기: ${model.size}</div>
                <div class="model-tags">
                    ${model.tags.map(tag => `<span class="model-tag">${tag}</span>`).join('')}
                </div>
            </div>
            <button class="model-download-button" data-model="${model.name}">
                다운로드
            </button>
        `;
        modelListContainer.appendChild(modelItem);
    });

    // 다운로드 버튼 이벤트 리스너 추가
    const downloadButtons = modelListContainer.querySelectorAll('.model-download-button');
    downloadButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            const modelName = e.target.getAttribute('data-model');
            downloadModel(modelName, e.target);
        });
    });

    // 현재 로컬에 다운로드된 모델 확인하여 버튼 상태 업데이트
    checkDownloadedModels();
}

// 현재 다운로드된 모델 확인
function checkDownloadedModels() {
    if (!vscode) return;

    // Ollama 모델 목록 요청
    vscode.postMessage({ command: 'getOllamaModels' });
}

// 다운로드 버튼 상태 업데이트
function updateDownloadButtonStates(downloadedModels) {
    const modelListContainer = document.getElementById('ollama-model-list');
    if (!modelListContainer) return;

    // 각 모델 아이템의 버튼 상태 업데이트
    const modelItems = modelListContainer.querySelectorAll('.model-item');
    modelItems.forEach(item => {
        const modelName = item.getAttribute('data-model');
        const button = item.querySelector('.model-download-button');

        if (button && modelName) {
            // 다운로드된 모델인지 확인
            const isDownloaded = downloadedModels.includes(modelName);

            if (isDownloaded) {
                button.textContent = '다운로드 완료';
                button.disabled = true;
                button.style.backgroundColor = '#4CAF50'; // 녹색
                button.style.color = 'white';
            } else {
                button.textContent = '다운로드';
                button.disabled = false;
                button.style.backgroundColor = ''; // 기본 색상
                button.style.color = '';
            }
        }
    });
}

// 모델 다운로드
async function downloadModel(modelName, buttonElement) {
    if (!vscode) return;

    // 버튼 비활성화
    buttonElement.disabled = true;
    buttonElement.textContent = '다운로드 중...';

    try {
        // 확장 프로그램에 다운로드 요청 전송
        vscode.postMessage({
            command: 'downloadOllamaModel',
            modelName: modelName
        });
    } catch (error) {
        console.error('Failed to download model:', error);
        buttonElement.disabled = false;
        buttonElement.textContent = '다운로드';
    }
}

// 모델 다운로드 진행 상황 처리
window.addEventListener('message', (event) => {
    const message = event.data;

    switch (message.command) {
        case 'supportedModels':
            // console.log('[Settings] Received supportedModels:', message.models);
            supportedModels = message.models || [];
            // console.log('[Settings] Set supportedModels to:', supportedModels);
            renderModelList();
            break;
        case 'supportedModelsError':
            console.error('[Settings] Failed to load supported models:', message.error);
            const modelListContainer = document.getElementById('ollama-model-list');
            if (modelListContainer) {
                modelListContainer.innerHTML = '<p class="info-message">모델 목록을 불러올 수 없습니다.</p>';
            }
            break;
        case 'modelDownloadStarted':
            updateModelDownloadStatus(message.modelName, '다운로드 시작...', true);
            break;
        case 'modelDownloadProgress':
            updateModelDownloadStatus(message.modelName, `다운로드 중... ${message.progress}%`, true);
            break;
        case 'modelDownloadCompleted':
            updateModelDownloadStatus(message.modelName, '다운로드 완료', false);
            // 모델 목록 새로고침
            loadOllamaModels();
            // 다운로드된 모델을 Ollama 모델 드롭다운에 즉시 반영
            setTimeout(() => {
                if (ollamaModelSelect && message.modelName) {
                    // 현재 선택된 값 저장
                    const currentValue = ollamaModelSelect.value;

                    // 새 모델이 목록에 있는지 확인하고 없으면 추가
                    const existingOption = Array.from(ollamaModelSelect.options).find(option => option.value === message.modelName);
                    if (!existingOption) {
                        const newOption = document.createElement('option');
                        newOption.value = message.modelName;
                        newOption.textContent = message.modelName;
                        ollamaModelSelect.appendChild(newOption);
                    }

                    // 다운로드된 모델을 자동으로 선택
                    ollamaModelSelect.value = message.modelName;

                    // 모델 선택 이벤트 트리거
                    ollamaModelSelect.dispatchEvent(new Event('change'));

                    // 상태 메시지 업데이트
                    const modelDownloadedText = `새 모델 '${message.modelName}'이 다운로드되어 선택되었습니다.`;
                    showStatus(ollamaModelStatus, modelDownloadedText, 'success');
                }
            }, 500); // 모델 목록이 업데이트될 시간을 고려하여 지연
            break;
        case 'modelDownloadError':
            updateModelDownloadStatus(message.modelName, `다운로드 실패: ${message.error}`, false);
            break;
        case 'refreshOllamaModels':
            loadOllamaModels();
            break;
    }
});

// 모델 다운로드 상태 업데이트
function updateModelDownloadStatus(modelName, status, isDownloading) {
    const modelListContainer = document.getElementById('ollama-model-list');
    if (!modelListContainer) return;

    const modelItem = modelListContainer.querySelector(`[data-model="${modelName}"]`);
    if (modelItem) {
        const button = modelItem.querySelector('.model-download-button');
        if (button) {
            button.textContent = status;
            button.disabled = isDownloading;
        }
    }
}

// 페이지 로드 시 초기 설정 로드
document.addEventListener('DOMContentLoaded', () => {
    console.log('[Settings] DOMContentLoaded - Starting initial load sequence');

    // 1. 언어 설정 로드
    vscode.postMessage({ command: 'getLanguage' });

    // 2. 기본 언어 데이터 로드 (한국어)
    loadLanguage('ko');

    // 3. 전체 설정 로드
    vscode.postMessage({ command: 'getCurrentSettings' });

    // 4. API 키 로드
    vscode.postMessage({ command: 'loadApiKeys' });

    // 5. AI 모델 로드
    vscode.postMessage({ command: 'loadAiModel' });

    // 6. Ollama 모델 로드
    vscode.postMessage({ command: 'loadOllamaModel' });

    // 7. 지원되는 모델 목록 로드
    loadSupportedModels();

    // 8. 라이센스 입력 필드 초기 상태 설정
    if (banyaLicenseSerialInput) {
        banyaLicenseSerialInput.readOnly = false;
    }

    console.log('[Settings] DOMContentLoaded - Initial load sequence completed');
});

// === Planning (Reasoning) Section ===
(function initPlanningSection() {
    const planningContainer = document.createElement('div');
    planningContainer.className = 'section-container';
    planningContainer.innerHTML = `
        <h2 id="planning-section-title">🧠 Planning (Reasoning)</h2>
        <p class="info-message" id="planning-helper">키워드 추출 후 계획(Plan) 생성을 위한 Reasoning 모델을 선택하세요.</p>
        <div class="api-key-section" id="planning-settings-section">
            <div class="api-key-input-group">
                <label for="planning-model-select" style="margin-right:10px; font-weight:bold;">Reasoning 모델</label>
                <select id="planning-model-select" style="flex-grow:1; padding: 8px; border: 1px solid var(--vscode-input-border); background-color: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 3px;"></select>
                <button id="save-planning-model-button">모델 저장</button>
            </div>
            <p id="planning-model-status" class="info-message"></p>
        </div>
    `;

    // 적절한 삽입 위치: Ollama 설정 섹션 바로 아래 배치 시도
    const settingsRoot = document.body || document.documentElement;
    settingsRoot.appendChild(planningContainer);

    const planningSelect = document.getElementById('planning-model-select');
    const planningStatus = document.getElementById('planning-model-status');
    const planningHelper = document.getElementById('planning-helper');
    const savePlanningModelButton = document.getElementById('save-planning-model-button');

    function setPlanningStatus(text, cls) {
        if (!planningStatus) return;
        planningStatus.textContent = text || '';
        planningStatus.className = 'info-message' + (cls ? ' ' + cls : '');
    }

    if (savePlanningModelButton) {
        savePlanningModelButton.addEventListener('click', () => {
            if (!planningSelect) return;
            const model = planningSelect.value || '';
            if (model && window.vscode) {
                vscode.postMessage({ command: 'savePlanningModel', model });
            }
        });
    }

    // 메시지 수신 확장: reasoningModels/planningModel 사용
    window.addEventListener('message', (event) => {
        const message = event.data || {};
        if (message.command === 'ollamaModels') {
            if (Array.isArray(message.reasoningModels) && planningSelect) {
                planningSelect.innerHTML = '';
                const def = document.createElement('option');
                def.value = '';
                def.textContent = 'Reasoning 모델을 선택하세요';
                planningSelect.appendChild(def);

                message.reasoningModels.forEach(name => {
                    const opt = document.createElement('option');
                    opt.value = name;
                    opt.textContent = name;
                    planningSelect.appendChild(opt);
                });

                // 모델 없을 때 안내
                if (message.reasoningModels.length === 0) {
                    if (planningHelper) {
                        planningHelper.textContent = '로컬 Ollama에 Reasoning 모델이 없습니다. 아래 Ollama 모델 다운로드 섹션에서 적절한 모델을 다운로드하세요.';
                    }
                } else {
                    if (planningHelper) {
                        planningHelper.textContent = '키워드 추출 후 계획(Plan) 생성을 위한 Reasoning 모델을 선택하세요.';
                    }
                }

                // 현재 저장된 planningModel 적용
                if (typeof message.planningModel === 'string' && message.planningModel) {
                    const options = Array.from(planningSelect.options).map(o => o.value);
                    if (options.includes(message.planningModel)) {
                        planningSelect.value = message.planningModel;
                    } else {
                        // 목록에 없으면 앞에 추가
                        const opt = document.createElement('option');
                        opt.value = message.planningModel;
                        opt.textContent = message.planningModel;
                        planningSelect.insertBefore(opt, planningSelect.firstChild);
                        planningSelect.value = message.planningModel;
                    }
                }
            }
        } else if (message.command === 'planningModelSaved') {
            setPlanningStatus(`Planning 모델이 저장되었습니다: ${message.model}`, 'success-message');
        } else if (message.command === 'planningModelSaveError') {
            setPlanningStatus(`Planning 모델 저장 실패: ${message.error}`, 'error-message');
        } else if (message.command === 'currentSettings') {
            // 초기 로드 시 planningModel만 반영 (reasoningModels는 별도 ollamaModels에서 옴)
            if (planningSelect && typeof message.planningModel === 'string' && message.planningModel) {
                const options = Array.from(planningSelect.options).map(o => o.value);
                if (options.includes(message.planningModel)) {
                    planningSelect.value = message.planningModel;
                } else if (message.planningModel) {
                    const opt = document.createElement('option');
                    opt.value = message.planningModel;
                    opt.textContent = message.planningModel;
                    planningSelect.insertBefore(opt, planningSelect.firstChild);
                    planningSelect.value = message.planningModel;
                }
            }
        }
    });
})();
