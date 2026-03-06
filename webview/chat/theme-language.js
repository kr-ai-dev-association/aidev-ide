/**
 * Theme & Language Module
 * 테마 적용, 언어 로딩/적용, 채팅 컨테이너 패딩 조정
 */

let currentTheme = 'dark';
let currentLanguage = 'ko';
let languageData = {};

export function getCurrentLanguage() {
  return currentLanguage;
}

export function setCurrentLanguage(lang) {
  currentLanguage = lang;
}

export function setLanguageData(data, lang) {
  languageData = data;
  currentLanguage = lang;
}

// 하단 고정 영역의 높이를 계산하고 채팅 컨테이너의 패딩을 조정
export function updateChatContainerPadding() {
  const chatContainer = document.getElementById('chat-container');
  if (!chatContainer) {
    return;
  }

  const fileSelectionArea = document.getElementById('file-selection-area');
  const chatInputArea = document.getElementById('chat-input-area');
  const pendingArea = document.getElementById('pending-queue-area');

  if (!chatInputArea) {
    return;
  }

  const fileSelectionHeight =
    fileSelectionArea && !fileSelectionArea.classList.contains('hidden')
      ? fileSelectionArea.offsetHeight
      : 0;

  let pendingHeight = 0;
  if (pendingArea) {
    const isVisible = pendingArea.classList.contains('visible');
    pendingHeight = isVisible ? pendingArea.offsetHeight : 0;
  }

  const chatInputHeight = chatInputArea.offsetHeight;
  const totalBottomHeight = pendingHeight + fileSelectionHeight + chatInputHeight + 20;
  chatContainer.style.paddingBottom = `${totalBottomHeight}px`;
}

// 테마 적용
export function applyTheme(theme) {
  console.log('[Chat] applyTheme called with:', theme);
  let effectiveTheme = theme;

  if (theme === 'auto') {
    const vscodeThemeKind = document.body.getAttribute('data-vscode-theme-kind');
    console.log('[Chat] VSCode theme kind:', vscodeThemeKind);
    effectiveTheme = (vscodeThemeKind && vscodeThemeKind.includes('light')) ? 'light' : 'dark';
  }

  currentTheme = effectiveTheme;
  document.documentElement.setAttribute('data-theme', effectiveTheme);
  document.body.setAttribute('data-theme', effectiveTheme);

  updateSendButtonStyle();

  console.log('[Chat] Theme applied:', effectiveTheme, 'html data-theme:', document.documentElement.getAttribute('data-theme'));
}

// ASK 모드 보내기 버튼 스타일 업데이트
// currentMode는 window.chatMode에서 읽음 (chat.js의 chat-mode-changed 이벤트로 갱신됨)
export function updateSendButtonStyle() {
  const sendBtn = document.getElementById('send-button');
  if (!sendBtn) {
    return;
  }

  const currentMode = window.chatMode || 'CODE';
  const isAskMode = currentMode === 'ASK';
  const iconImg = sendBtn.querySelector('.icon-img');

  if (isAskMode) {
    sendBtn.classList.add('ask-mode');
    if (currentTheme === 'light') {
      sendBtn.style.backgroundColor = '#2563EB';
      sendBtn.style.borderRadius = '50%';
    } else {
      sendBtn.style.backgroundColor = '#10B981';
      sendBtn.style.borderRadius = '50%';
    }
    if (iconImg) {
      iconImg.style.filter = 'brightness(0) invert(1)';
    }
  } else {
    sendBtn.classList.remove('ask-mode');
    sendBtn.style.backgroundColor = 'transparent';
    sendBtn.style.borderRadius = '6px';
    if (iconImg) {
      iconImg.style.filter = '';
    }
  }
}

// 언어 데이터 요청
export function loadLanguage(lang) {
  try {
    if (window.vscode) {
      window.vscode.postMessage({ command: 'getLanguageData', language: lang });
    }
  } catch (e) {
    console.error('Failed to load language:', lang, e);
  }
}

// 언어 텍스트 적용
export function applyLanguage() {
  const chatTitle = document.getElementById('chat-title');
  if (chatTitle && languageData['chatTitle']) {
    chatTitle.textContent = languageData['chatTitle'];
  }

  const languageLabel = document.getElementById('language-label');
  if (languageLabel && languageData['languageLabel']) {
    languageLabel.textContent = languageData['languageLabel'];
  }

  const sendButton = document.getElementById('send-button');
  if (sendButton && languageData['sendButton']) {
    sendButton.textContent = languageData['sendButton'];
  }

  const clearButton = document.getElementById('clean-history-button');
  if (clearButton && languageData['clearButton']) {
    clearButton.textContent = languageData['clearButton'];
  }

  const cancelButton = document.getElementById('cancel-call-button');
  if (cancelButton && languageData['cancelButton']) {
    cancelButton.textContent = languageData['cancelButton'];
  }

  const chatInput = document.getElementById('chat-input');
  if (chatInput && languageData['inputPlaceholder']) {
    chatInput.placeholder = languageData['inputPlaceholder'];
  }

  const filePickerButton = document.getElementById('file-picker-button');
  if (filePickerButton && languageData['filePickerButton']) {
    filePickerButton.textContent = languageData['filePickerButton'];
  }

  console.log('=== applyLanguage completed ===');
}

// 언어 선택 드롭다운 이벤트 초기화 + 초기 언어 요청
export function initLanguageSelect() {
  const languageSelect = document.getElementById('language-select');
  if (languageSelect) {
    languageSelect.addEventListener('change', (e) => {
      const lang = e.target.value;
      console.log('Language changed to:', lang);
      currentLanguage = lang;
      loadLanguage(lang);
      if (window.vscode) {
        window.vscode.postMessage({ command: 'saveLanguage', language: lang });
      }
    });
  }

  // VS Code 설정에서 언어를 가져오도록 요청
  if (window.vscode) {
    window.vscode.postMessage({ command: 'getLanguage' });
  }
}
