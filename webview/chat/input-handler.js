/**
 * Input Handler Module
 * 채팅 입력 처리 관련 기능
 */

/**
 * contenteditable div에서 텍스트만 추출 (파일 멘션 제외)
 * @param {HTMLElement} chatInput - 채팅 입력 요소
 * @returns {string}
 */
export function getChatInputText(chatInput) {
  if (!chatInput) return "";

  const clone = chatInput.cloneNode(true);
  const mentions = clone.querySelectorAll(".file-mention");
  mentions.forEach((mention) => mention.remove());
  return clone.textContent || clone.innerText || "";
}

/**
 * contenteditable div에서 전체 내용을 가져오기 (멘션 포함, 표시용)
 * @param {HTMLElement} chatInput - 채팅 입력 요소
 * @returns {string}
 */
export function getChatInputDisplayContent(chatInput) {
  if (!chatInput) return "";

  const result = [];

  function processNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent || "").replace(/[\n\r]/g, " ");
      result.push(text);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const tagName = node.tagName.toLowerCase();

      if (tagName === "br") {
        result.push(" ");
        return;
      }

      if (node.classList && node.classList.contains("file-mention")) {
        const fileName =
          node.getAttribute("data-file-name") || node.textContent || "";
        result.push("@" + fileName);
      } else if (
        node.classList &&
        node.classList.contains("terminal-mention")
      ) {
        const terminalName =
          node.getAttribute("data-terminal-name") || node.textContent || "";
        result.push("Terminal: " + terminalName);
      } else if (
        node.classList &&
        node.classList.contains("diagnostics-mention")
      ) {
        const errorCount = node.getAttribute("data-error-count") || "0";
        const warningCount = node.getAttribute("data-warning-count") || "0";
        result.push(
          `Diagnostics: ${errorCount} errors, ${warningCount} warnings`,
        );
      } else {
        if (tagName === "div" && result.length > 0) {
          result.push(" ");
        }
        const children = Array.from(node.childNodes);
        children.forEach((child) => processNode(child));
      }
    }
  }

  const children = Array.from(chatInput.childNodes);
  children.forEach((child) => processNode(child));

  return result.join("").replace(/\s+/g, " ").trim();
}

/**
 * contenteditable div에서 현재 값 가져오기
 * @param {HTMLElement} chatInput - 채팅 입력 요소
 * @returns {string}
 */
export function getChatInputValue(chatInput) {
  if (!chatInput) return "";
  return chatInput.innerText || chatInput.textContent || "";
}

/**
 * textarea 자동 크기 조절
 * @param {HTMLElement} chatInput - 채팅 입력 요소
 * @param {Function} updatePaddingFn - 패딩 업데이트 함수
 */
export function autoResizeTextarea(chatInput, updatePaddingFn) {
  if (!chatInput) return;

  chatInput.style.height = "auto";
  const computedStyle = getComputedStyle(chatInput);
  const minHeight = parseInt(computedStyle.minHeight, 10);
  const maxHeight = parseInt(computedStyle.maxHeight, 10);
  const adjustedHeight = Math.max(
    minHeight,
    Math.min(chatInput.scrollHeight, maxHeight),
  );
  chatInput.style.height = adjustedHeight + "px";

  if (updatePaddingFn) {
    updatePaddingFn();
  }
}

/**
 * 커서를 끝으로 이동
 * @param {HTMLElement} element - 대상 요소
 */
export function setCursorToEnd(element) {
  if (!element) return;

  const range = document.createRange();
  const selection = window.getSelection();
  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

/**
 * 붙여넣기 핸들러
 * @param {Event} event - 붙여넣기 이벤트
 * @param {HTMLElement} chatInput - 채팅 입력 요소
 * @param {Function} onImagePasteFn - 이미지 붙여넣기 콜백
 * @param {Function} autoResizeTextareaFn - textarea 크기 조절 함수
 */
export function handlePaste(
  event,
  chatInput,
  onImagePasteFn,
  autoResizeTextareaFn,
) {
  const clipboardData =
    event.clipboardData || event.originalEvent.clipboardData;
  const items = clipboardData.items;
  let imageFound = false;

  // 이미지 파일 처리
  for (const item of items) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          if (onImagePasteFn) {
            onImagePasteFn(
              e.target.result.split(",")[1],
              file.type,
              e.target.result,
            );
          }
        };
        reader.readAsDataURL(file);
        imageFound = true;
        break;
      }
    }
  }

  if (imageFound) {
    event.preventDefault();
    return;
  }

  // 텍스트 붙여넣기: HTML 서식 제거
  const plainText = clipboardData.getData("text/plain");
  if (plainText) {
    event.preventDefault();

    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      range.deleteContents();

      const textNode = document.createTextNode(plainText);
      range.insertNode(textNode);

      range.setStartAfter(textNode);
      range.setEndAfter(textNode);
      selection.removeAllRanges();
      selection.addRange(range);
    }

    if (chatInput) {
      chatInput.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }
}

/**
 * 입력창에서 '@' 기호와 검색어 제거
 * @param {HTMLElement} chatInput - 채팅 입력 요소
 * @returns {Object} { node, offset } 삽입 위치 정보
 */
export function removeAtSymbolFromInput(chatInput) {
  if (!chatInput) return null;

  const selection = window.getSelection();
  if (!selection.rangeCount) return null;

  const range = selection.getRangeAt(0);
  const node = range.startContainer;
  const offset = range.startOffset;

  if (node.nodeType !== Node.TEXT_NODE) return null;

  const text = node.textContent;
  const textBefore = text.substring(0, offset);

  // '@' 문자 위치 찾기
  const atIndex = textBefore.lastIndexOf("@");
  if (atIndex === -1) return null;

  // '@'와 이후 검색어 제거
  const newText = text.substring(0, atIndex) + text.substring(offset);
  node.textContent = newText;

  // 커서 위치 반환
  return { node, offset: atIndex };
}

/**
 * 메시지 전송 버튼 스타일 업데이트
 * @param {HTMLElement} sendBtn - 전송 버튼 요소
 * @param {string} currentMode - 현재 모드 ('ASK' 또는 그 외는 CODE로 취급)
 * @param {boolean} isLightTheme - 라이트 테마 여부 (미사용, 하위 호환성 유지)
 */
export function updateSendButtonStyle(sendBtn, currentMode, isLightTheme) {
  if (!sendBtn) return;

  const iconImg = sendBtn.querySelector(".icon-img");
  const effectiveMode = currentMode === "ASK" ? "ASK" : "CODE";
  const isAskMode = effectiveMode === "ASK";

  if (isAskMode) {
    sendBtn.classList.add("ask-mode");
    sendBtn.classList.remove("plan-mode", "agent-mode");
    sendBtn.style.backgroundColor = "#10B981";
  } else {
    sendBtn.classList.remove("ask-mode", "plan-mode", "agent-mode");
    sendBtn.style.backgroundColor = "transparent";
    if (iconImg) {
      iconImg.style.filter = "";
    }
  }
}

/**
 * 전송/취소 버튼 상태 업데이트
 * @param {boolean} isSending - 전송 중 여부
 * @param {HTMLElement} sendButton - 전송 버튼
 * @param {HTMLElement} cancelButton - 취소 버튼
 */
export function updateSendCancelButtons(isSending, sendButton, cancelButton) {
  if (sendButton) {
    sendButton.style.display = isSending ? "none" : "flex";
  }
  if (cancelButton) {
    cancelButton.style.display = isSending ? "flex" : "none";
  }
}
