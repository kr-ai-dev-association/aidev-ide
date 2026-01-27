/**
 * Message Display Module
 * 메시지 표시 관련 기능
 */

/**
 * 사용자 메시지 표시
 * @param {string} text - 메시지 텍스트
 * @param {string|null} imageData - 이미지 데이터 (Base64)
 * @param {HTMLElement} chatMessages - 채팅 메시지 컨테이너
 * @param {Function} scrollToUserMessageFn - 스크롤 함수
 */
export function displayUserMessage(text, imageData, chatMessages, scrollToUserMessageFn) {
  if (!chatMessages) return;

  const userMessageDiv = document.createElement("div");
  userMessageDiv.className = "user-message-container";

  const contentDiv = document.createElement("div");
  contentDiv.className = "user-message";

  // 텍스트 내용 추가
  if (text) {
    const textSpan = document.createElement("span");
    textSpan.textContent = text;
    contentDiv.appendChild(textSpan);
  }

  // 이미지 추가
  if (imageData) {
    const imgElement = document.createElement("img");
    imgElement.src = `data:image/png;base64,${imageData}`;
    imgElement.className = "user-message-image";
    imgElement.style.cssText = `
      max-width: 200px;
      max-height: 150px;
      border-radius: 8px;
      margin-top: 8px;
    `;
    contentDiv.appendChild(imgElement);
  }

  userMessageDiv.appendChild(contentDiv);
  chatMessages.appendChild(userMessageDiv);

  // 스크롤
  if (scrollToUserMessageFn) {
    scrollToUserMessageFn(userMessageDiv);
  } else {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  return userMessageDiv;
}

/**
 * 시스템 메시지 표시
 * @param {string} text - 메시지 텍스트
 * @param {HTMLElement} chatMessages - 채팅 메시지 컨테이너
 * @param {boolean} isLightTheme - 라이트 테마 여부
 */
export function displaySystemMessage(text, chatMessages, isLightTheme = false) {
  if (!chatMessages) return;

  const systemMessageDiv = document.createElement("div");
  systemMessageDiv.className = "system-message";

  // 아이콘 및 색상 결정
  let icon = "ℹ️";
  let color = "var(--vscode-terminal-ansiBrightBlue)";

  if (text.includes("[Created]") || text.includes("[New]")) {
    icon = "✨";
    color = isLightTheme ? "#16a34a" : "var(--vscode-terminal-ansiGreen)";
  } else if (text.includes("[Updated]") || text.includes("[Modified]")) {
    icon = "📝";
    color = isLightTheme ? "#ca8a04" : "var(--vscode-terminal-ansiYellow)";
  } else if (text.includes("[Deleted]") || text.includes("[Removed]")) {
    icon = "🗑️";
    color = isLightTheme ? "#dc2626" : "var(--vscode-terminal-ansiRed)";
  } else if (text.includes("[Error]") || text.includes("[Failed]")) {
    icon = "❌";
    color = isLightTheme ? "#dc2626" : "var(--vscode-terminal-ansiRed)";
  } else if (text.includes("[Warning]")) {
    icon = "⚠️";
    color = isLightTheme ? "#ca8a04" : "var(--vscode-terminal-ansiYellow)";
  } else if (text.includes("[Success]") || text.includes("[Done]")) {
    icon = "✅";
    color = isLightTheme ? "#16a34a" : "var(--vscode-terminal-ansiGreen)";
  } else if (text.includes("[Info]")) {
    icon = "ℹ️";
    color = isLightTheme ? "#2563eb" : "var(--vscode-terminal-ansiBrightBlue)";
  }

  systemMessageDiv.innerHTML = `<span style="color: ${color};">${icon} ${text}</span>`;
  chatMessages.appendChild(systemMessageDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  return systemMessageDiv;
}

/**
 * 로딩 표시
 * @param {HTMLElement} chatMessages - 채팅 메시지 컨테이너
 * @param {Function} createThinkingBubbleFn - thinking 버블 생성 함수
 * @returns {HTMLElement} thinking 버블 요소
 */
export function showLoading(chatMessages, createThinkingBubbleFn) {
  if (!chatMessages) return null;

  let thinkingBubbleElement = null;

  if (createThinkingBubbleFn) {
    thinkingBubbleElement = createThinkingBubbleFn();
  } else {
    // 기본 thinking 버블 생성
    thinkingBubbleElement = document.createElement("div");
    thinkingBubbleElement.className = "thinking-bubble";
    thinkingBubbleElement.innerHTML = `
      <div class="thinking-animation">
        <span class="dot"></span>
        <span class="dot"></span>
        <span class="dot"></span>
      </div>
      <span class="thinking-text"></span>
    `;
  }

  chatMessages.appendChild(thinkingBubbleElement);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  return thinkingBubbleElement;
}

/**
 * 로딩 숨기기
 * @param {HTMLElement} thinkingBubbleElement - thinking 버블 요소
 */
export function hideLoading(thinkingBubbleElement) {
  if (thinkingBubbleElement && thinkingBubbleElement.parentNode) {
    thinkingBubbleElement.remove();
  }
}

/**
 * 에러 수정 메시지 표시
 * @param {string} originalCommand - 원래 명령어
 * @param {string} correctedCommand - 수정된 명령어
 * @param {number} retryCount - 재시도 횟수
 * @param {HTMLElement} chatMessages - 채팅 메시지 컨테이너
 */
export function showErrorCorrection(originalCommand, correctedCommand, retryCount, chatMessages) {
  if (!chatMessages) return;

  const errorCorrectionDiv = document.createElement("div");
  errorCorrectionDiv.className = "error-correction-message";
  errorCorrectionDiv.innerHTML = `
    <div class="error-correction-header">
      🔧 명령어 오류 수정 (시도 ${retryCount}/3)
    </div>
    <div class="error-correction-content">
      <div class="original-command">
        <strong>실패한 명령어:</strong> <code>${originalCommand}</code>
      </div>
      <div class="corrected-command">
        <strong>수정된 명령어:</strong> <code>${correctedCommand}</code>
      </div>
    </div>
  `;

  chatMessages.appendChild(errorCorrectionDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

/**
 * 자동 수정 인디케이터 표시
 */
export function showAutoCorrectingIndicator() {
  const indicator = document.getElementById("auto-correcting-indicator");
  if (indicator) {
    indicator.classList.remove("hidden");
  }
}

/**
 * 자동 수정 인디케이터 숨기기
 */
export function hideAutoCorrectingIndicator() {
  const indicator = document.getElementById("auto-correcting-indicator");
  if (indicator) {
    indicator.classList.add("hidden");
  }
}

/**
 * Git 저장소 정보 표시
 * @param {string} content - Git 정보 내용
 * @param {HTMLElement} chatMessages - 채팅 메시지 컨테이너
 */
export function showGitRepositoryInfo(content, chatMessages) {
  if (!chatMessages) return;

  const gitInfoDiv = document.createElement("div");
  gitInfoDiv.className = "git-repository-info";
  gitInfoDiv.innerHTML = `
    <div class="git-info-header">
      <span>📦 Git Repository Info</span>
    </div>
    <div class="git-info-content">
      <pre>${content}</pre>
    </div>
  `;

  chatMessages.appendChild(gitInfoDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

/**
 * 컨텍스트 정보 업데이트
 * @param {Object} contextInfo - 컨텍스트 정보
 */
export function updateContextInfo(contextInfo) {
  const contextInfoElement = document.getElementById("context-info");
  if (!contextInfoElement || !contextInfo) return;

  const { fileCount, totalTokens, lastUpdated } = contextInfo;

  contextInfoElement.innerHTML = `
    <span class="context-files">${fileCount || 0} files</span>
    <span class="context-tokens">${totalTokens || 0} tokens</span>
    ${lastUpdated ? `<span class="context-updated">Updated: ${new Date(lastUpdated).toLocaleTimeString()}</span>` : ""}
  `;
}
