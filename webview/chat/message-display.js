/**
 * Message Display Module
 * 메시지 표시 관련 기능
 */

/**
 * chatMessages에 요소를 추가할 때 thinking bubble이 있으면 그 앞에 삽입
 * thinking bubble이 항상 맨 아래에 유지되도록 보장
 * @param {HTMLElement} chatMessages - 채팅 메시지 컨테이너
 * @param {HTMLElement} element - 추가할 요소
 */
export function appendBeforeThinkingBubble(chatMessages, element) {
  const thinkingBubble = chatMessages.querySelector('.thinking-bubble');
  if (thinkingBubble) {
    chatMessages.insertBefore(element, thinkingBubble);
  } else {
    chatMessages.appendChild(element);
  }
}

/**
 * 사용자 메시지 표시 (멘션 파싱 포함)
 * @param {string} text - 메시지 텍스트
 * @param {string|null} imageData - 이미지 데이터 (Base64)
 * @param {HTMLElement} chatMessages - 채팅 메시지 컨테이너
 * @param {Function} scrollToUserMessageFn - 스크롤 함수
 */
export function displayUserMessage(text, imageData, chatMessages, scrollToUserMessageFn) {
  if (!chatMessages) return null;

  // 사용자 메시지 컨테이너 생성
  const containerElement = document.createElement("div");
  containerElement.classList.add("user-message-container");

  // 메시지 내용
  const userMessageElement = document.createElement("div");
  userMessageElement.classList.add("user-plain-message");

  // 이미지 데이터가 있으면 이미지 표시
  if (imageData) {
    const imgElement = document.createElement("img");
    imgElement.classList.add("user-message-image");
    imgElement.src = `data:image/png;base64,${imageData}`;
    userMessageElement.appendChild(imgElement);
  }

  // 텍스트가 있으면 멘션 패턴을 파싱하여 스타일링 적용
  if (text) {
    // 파일 멘션: @로 시작하고 파일명 문자만 매칭 (공백에서 종료)
    // 터미널 멘션: "Terminal: 터미널이름" 형식 (공백 전까지)
    // 진단 멘션: "Diagnostics: N errors, M warnings" 형식
    const mentionRegex =
      /(@[a-zA-Z0-9\.\-\_\/\\]+)|(Terminal:\s*[^\s]+)|(Diagnostics:\s*\d+\s*errors?,\s*\d+\s*warnings?)/g;

    let lastIndex = 0;
    let match;

    while ((match = mentionRegex.exec(text)) !== null) {
      // 멘션 이전의 일반 텍스트 추가
      if (match.index > lastIndex) {
        const textBefore = document.createTextNode(
          text.substring(lastIndex, match.index)
        );
        userMessageElement.appendChild(textBefore);
      }

      const matchedText = match[0];
      const mentionSpan = document.createElement("span");

      if (match[1]) {
        // 파일 멘션 (@파일명)
        mentionSpan.className = "file-mention";
        mentionSpan.textContent = match[1].substring(1); // @ 제거 (CSS ::before로 추가됨)
      } else if (match[2]) {
        // 터미널 멘션 (Terminal: 터미널이름)
        mentionSpan.className = "terminal-mention";
        mentionSpan.textContent = match[2].replace("Terminal:", "").trim();
      } else if (match[3]) {
        // 진단 멘션 (Diagnostics: N errors, M warnings)
        mentionSpan.className = "diagnostics-mention";
        mentionSpan.textContent = match[3].replace("Diagnostics:", "").trim();
      }

      userMessageElement.appendChild(mentionSpan);
      lastIndex = match.index + matchedText.length;
    }

    // 마지막 멘션 이후의 텍스트 추가
    if (lastIndex < text.length) {
      const textAfter = document.createTextNode(text.substring(lastIndex));
      userMessageElement.appendChild(textAfter);
    }
  }

  containerElement.appendChild(userMessageElement);

  const separatorElement = document.createElement("hr");
  separatorElement.classList.add("message-separator");

  chatMessages.appendChild(containerElement);
  chatMessages.appendChild(separatorElement);

  // 사용자 메시지가 추가된 후 즉시 스크롤을 해당 메시지로 이동
  if (scrollToUserMessageFn) {
    scrollToUserMessageFn(containerElement);
  } else {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  return containerElement;
}

/**
 * 시스템 메시지 표시 (파일 내용 필터링 및 색상 적용)
 * @param {string} text - 메시지 텍스트
 * @param {HTMLElement} chatMessages - 채팅 메시지 컨테이너
 * @param {boolean} isLightTheme - 라이트 테마 여부
 * @param {Function} sanitizeHtmlFn - HTML 살균 함수
 * @param {Object} sanitizeOptions - 살균 옵션
 */
export function displaySystemMessage(text, chatMessages, isLightTheme = false, sanitizeHtmlFn = null, sanitizeOptions = null) {
  if (!chatMessages || !text || !text.trim()) return null;

  // 🔥 파일 내용이 포함된 긴 메시지 필터링
  let displayText = text.trim();
  if (displayText.includes("[Updated]") || displayText.includes("[Created]") || displayText.includes("[Modified]")) {
    const firstLine = displayText.split("\n")[0].trim();
    displayText = firstLine.length > 200 ? firstLine.substring(0, 200) + "..." : firstLine;
  }

  // 너무 긴 메시지는 자르기 (방어적 처리)
  if (displayText.length > 500) {
    displayText = displayText.substring(0, 500) + "...";
  }

  // displayText가 비어있으면 렌더링하지 않음
  if (!displayText) return null;

  const systemMessageElement = document.createElement("div");
  systemMessageElement.classList.add("system-message");

  // 이모지에 따라 색상 다르게 표시
  let color = "var(--vscode-descriptionForeground)";
  if (
    text.includes("✅") ||
    text.includes("✔️") ||
    text.includes("📖") ||
    text.includes("📂")
  ) {
    color = isLightTheme ? "#16a34a" : "var(--vscode-testing-iconPassed)";
  } else if (text.includes("❌") || text.includes("Failed")) {
    color = isLightTheme ? "#dc2626" : "var(--vscode-testing-iconFailed)";
  } else if (text.includes("🚀") || text.includes("Executed")) {
    color = isLightTheme ? "#0891b2" : "var(--vscode-terminal-ansiCyan)";
  } else if (text.includes("📝") || text.includes("Updated")) {
    color = isLightTheme ? "#ca8a04" : "var(--vscode-terminal-ansiYellow)";
  } else if (text.includes("Created")) {
    color = isLightTheme ? "#16a34a" : "var(--vscode-testing-iconPassed)";
  }

  systemMessageElement.style.cssText = `
    padding: 4px 8px;
    margin: 2px 0;
    font-size: 12px;
    font-family: var(--vscode-editor-font-family);
    color: ${color};
    background: rgba(128, 128, 128, 0.05);
    border-radius: 4px;
    border-left: 2px solid ${color};
    word-break: break-all;
    white-space: pre-line;
  `;

  // HTML 살균 함수가 제공되면 사용, 아니면 텍스트 그대로
  if (sanitizeHtmlFn && sanitizeOptions) {
    systemMessageElement.innerHTML = sanitizeHtmlFn(displayText, sanitizeOptions);
  } else {
    systemMessageElement.textContent = displayText;
  }

  appendBeforeThinkingBubble(chatMessages, systemMessageElement);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  return systemMessageElement;
}

/**
 * 사용자 메시지로 스크롤하는 함수 (여러 번 시도)
 * @param {HTMLElement} userMessageElement - 사용자 메시지 요소
 * @param {HTMLElement} chatMessages - 채팅 메시지 컨테이너
 */
export function scrollToUserMessage(userMessageElement, chatMessages) {
  let attempts = 0;
  const maxAttempts = 5;

  const attemptScroll = () => {
    attempts++;
    if (userMessageElement && userMessageElement.offsetHeight > 0) {
      if (chatMessages) {
        chatMessages.scrollTop = chatMessages.scrollHeight;
      }
      return true;
    } else if (attempts < maxAttempts) {
      setTimeout(attemptScroll, 20);
      return false;
    } else {
      if (chatMessages) {
        chatMessages.scrollTop = chatMessages.scrollHeight;
      }
      return false;
    }
  };

  if (!attemptScroll()) {
    setTimeout(attemptScroll, 20);
  }
}

/**
 * 로딩 버블 생성 및 표시
 * @param {HTMLElement} chatMessages - 채팅 메시지 컨테이너
 * @returns {HTMLElement} thinking 버블 요소
 */
export function showLoading(chatMessages) {
  if (!chatMessages) return null;

  const messageContainer = document.createElement("div");
  messageContainer.classList.add("thinking-bubble");

  // 타자기 효과를 위한 구조
  messageContainer.innerHTML =
    '<span class="thinking-text"></span><span class="thinking-cursor">|</span>';

  chatMessages.appendChild(messageContainer);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  return messageContainer;
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

  appendBeforeThinkingBubble(chatMessages, errorCorrectionDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
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

  appendBeforeThinkingBubble(chatMessages, gitInfoDiv);
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
