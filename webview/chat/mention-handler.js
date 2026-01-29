/**
 * Mention Handler Module
 * 파일/터미널/진단 멘션 삽입 및 관리 관련 기능
 */

// 외부 의존성 (초기화 시 주입)
let chatInput = null;
let selectedFiles = [];
let autoResizeTextareaFn = null;

// MutationObserver 관련 변수
let mentionObserver = null;
let isRestoringMentions = false;

/**
 * Mention Handler 모듈 초기화
 * @param {Object} deps - 의존성 객체
 */
export function initMentionHandler(deps) {
  chatInput = deps.chatInput;
  selectedFiles = deps.selectedFiles || [];
  autoResizeTextareaFn = deps.autoResizeTextarea;
}

/**
 * selectedFiles 배열 설정 (외부에서 참조 업데이트 필요 시)
 * @param {Array} files
 */
export function setSelectedFiles(files) {
  selectedFiles = files;
}

/**
 * selectedFiles 배열 가져오기
 * @returns {Array}
 */
export function getSelectedFiles() {
  return selectedFiles;
}

/**
 * '@' 기호와 그 이후 검색어를 제거하는 헬퍼 함수
 * @returns {Object|null} { node, offset } - 삽입할 위치 정보
 */
export function removeAtSymbolFromInput() {
  if (!chatInput) {
    return null;
  }

  // TreeWalker로 텍스트 노드만 순회하며 마지막 '@'가 포함된 노드 찾기
  const walker = document.createTreeWalker(
    chatInput,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );

  let lastAtNode = null;
  let lastAtIndex = -1;

  let node;
  while ((node = walker.nextNode())) {
    const idx = node.textContent.lastIndexOf("@");
    if (idx !== -1) {
      lastAtNode = node;
      lastAtIndex = idx;
    }
  }

  if (lastAtNode && lastAtIndex !== -1) {
    const textContent = lastAtNode.textContent;
    // '@' 이후의 검색어 끝 찾기 (공백이나 문자열 끝까지)
    let endIndex = textContent.length;
    for (let i = lastAtIndex + 1; i < textContent.length; i++) {
      if (textContent[i] === " " || textContent[i] === "\n") {
        endIndex = i;
        break;
      }
    }
    // '@검색어' 제거하고 앞뒤 텍스트 유지
    const beforeAt = textContent.substring(0, lastAtIndex);
    const afterSearch = textContent.substring(endIndex);
    lastAtNode.textContent = beforeAt + afterSearch;

    // 삽입 위치 반환 (beforeAt의 끝 위치)
    return { node: lastAtNode, offset: beforeAt.length };
  }
  return null;
}

/**
 * 파일 멘션 블록 삽입
 * @param {string} fileName - 파일 이름
 * @param {string} filePath - 파일 경로
 * @param {boolean} removeAtSymbol - '@' 기호 제거 여부
 */
export function insertFileMention(fileName, filePath, removeAtSymbol = true) {
  if (!chatInput) {
    return;
  }

  // '@' 제거 (기존 멘션 span은 유지) 및 삽입 위치 가져오기
  let insertPosition = null;
  if (removeAtSymbol) {
    insertPosition = removeAtSymbolFromInput();
  }

  // 파일 멘션 블록 생성
  const mentionSpan = document.createElement("span");
  mentionSpan.className = "file-mention";
  mentionSpan.setAttribute("data-file-path", filePath);
  mentionSpan.setAttribute("data-file-name", fileName);
  mentionSpan.textContent = fileName;
  mentionSpan.contentEditable = "false";
  mentionSpan.style.display = "inline-block";

  const selection = window.getSelection();
  const range = document.createRange();

  try {
    if (
      insertPosition &&
      insertPosition.node &&
      insertPosition.node.parentNode
    ) {
      // '@'가 있던 위치에 멘션 삽입
      const textNode = insertPosition.node;
      const offset = insertPosition.offset;

      if (offset === 0) {
        // 텍스트 노드 앞에 삽입
        textNode.parentNode.insertBefore(mentionSpan, textNode);
      } else if (offset >= textNode.textContent.length) {
        // 텍스트 노드 뒤에 삽입
        if (textNode.nextSibling) {
          textNode.parentNode.insertBefore(mentionSpan, textNode.nextSibling);
        } else {
          textNode.parentNode.appendChild(mentionSpan);
        }
      } else {
        // 텍스트 노드 중간에 삽입 - 노드를 분할
        const afterText = textNode.textContent.substring(offset);
        textNode.textContent = textNode.textContent.substring(0, offset);
        const afterNode = document.createTextNode(afterText);
        if (textNode.nextSibling) {
          textNode.parentNode.insertBefore(mentionSpan, textNode.nextSibling);
          mentionSpan.parentNode.insertBefore(
            afterNode,
            mentionSpan.nextSibling
          );
        } else {
          textNode.parentNode.appendChild(mentionSpan);
          textNode.parentNode.appendChild(afterNode);
        }
      }

      // 공백 추가
      const spaceNode = document.createTextNode(" ");
      if (mentionSpan.nextSibling) {
        mentionSpan.parentNode.insertBefore(spaceNode, mentionSpan.nextSibling);
      } else {
        mentionSpan.parentNode.appendChild(spaceNode);
      }

      // 커서를 공백 뒤로 이동
      range.setStartAfter(spaceNode);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    } else {
      // 삽입 위치를 찾지 못하면 끝에 추가
      chatInput.appendChild(mentionSpan);
      const spaceNode = document.createTextNode(" ");
      chatInput.appendChild(spaceNode);

      // 커서를 끝으로 이동
      range.selectNodeContents(chatInput);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  } catch (e) {
    console.error("[insertFileMention] Error:", e);
    // 오류 발생 시 끝에 추가
    chatInput.appendChild(mentionSpan);
    const spaceNode = document.createTextNode(" ");
    chatInput.appendChild(spaceNode);

    // 커서를 끝으로 이동
    range.selectNodeContents(chatInput);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  if (autoResizeTextareaFn) {
    autoResizeTextareaFn();
  }
}

/**
 * 터미널 멘션 블록 삽입
 * @param {string} terminalName - 터미널 이름
 */
export function insertTerminalMention(terminalName) {
  if (!chatInput) {
    return;
  }

  // '@' 기호는 selectCategory에서 이미 제거됨
  // 현재 커서 위치 또는 끝에 멘션 삽입

  // 터미널 멘션 블록 생성
  const mentionSpan = document.createElement("span");
  mentionSpan.className = "terminal-mention";
  mentionSpan.setAttribute("data-terminal-name", terminalName);
  mentionSpan.textContent = terminalName;
  mentionSpan.contentEditable = "false";
  mentionSpan.style.display = "inline-block";

  // 멘션을 끝에 추가 (@ 기호는 selectCategory에서 이미 제거됨)
  chatInput.appendChild(mentionSpan);
  const spaceNode = document.createTextNode(" ");
  chatInput.appendChild(spaceNode);

  // 커서를 끝으로 이동
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(chatInput);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);

  if (autoResizeTextareaFn) {
    autoResizeTextareaFn();
  }
  chatInput.focus();
}

/**
 * Diagnostics 멘션 삽입
 * @param {number} errorCount - 에러 수
 * @param {number} warningCount - 경고 수
 */
export function insertDiagnosticsMention(errorCount, warningCount) {
  if (!chatInput) {
    return;
  }

  // '@' 기호는 selectCategory에서 이미 제거됨

  // Diagnostics 멘션 블록 생성
  const mentionSpan = document.createElement("span");
  mentionSpan.className = "diagnostics-mention";
  mentionSpan.setAttribute("data-error-count", errorCount);
  mentionSpan.setAttribute("data-warning-count", warningCount);
  mentionSpan.textContent = `${errorCount} errors, ${warningCount} warnings`;
  mentionSpan.contentEditable = "false";
  mentionSpan.style.display = "inline-block";

  // 멘션을 끝에 추가
  chatInput.appendChild(mentionSpan);
  const spaceNode = document.createTextNode(" ");
  chatInput.appendChild(spaceNode);

  // 커서를 끝으로 이동
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(chatInput);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);

  if (autoResizeTextareaFn) {
    autoResizeTextareaFn();
  }
  chatInput.focus();
}

/**
 * 텍스트로 변환된 멘션을 복원합니다.
 * 브라우저가 contenteditable에서 타이핑할 때 contenteditable="false" 스팬을
 * 텍스트로 변환하는 문제를 해결합니다.
 */
export function restoreMentionsFromText() {
  if (!chatInput || selectedFiles.length === 0 || isRestoringMentions) {
    return;
  }

  // 현재 DOM에서 멘션 스팬으로 존재하는 파일 경로들
  const existingMentions = new Set();
  chatInput.querySelectorAll(".file-mention").forEach((span) => {
    const path = span.getAttribute("data-file-path");
    if (path) {
      existingMentions.add(path);
    }
  });

  // selectedFiles 중 DOM에 스팬으로 없는 파일들 (텍스트로 변환되었을 수 있음)
  const missingFiles = selectedFiles.filter(
    (file) => !existingMentions.has(file.path)
  );

  if (missingFiles.length === 0) {
    return;
  }

  // 복원 중 플래그 설정 (MutationObserver 무한 루프 방지)
  isRestoringMentions = true;

  try {
    // 모든 누락된 파일을 한 번에 복원하기 위해 반복
    let remainingFiles = [...missingFiles];
    let maxIterations = 10; // 무한 루프 방지

    while (remainingFiles.length > 0 && maxIterations > 0) {
      maxIterations--;

      // TreeWalker로 모든 텍스트 노드 순회 (매 반복마다 새로 수집)
      const walker = document.createTreeWalker(
        chatInput,
        NodeFilter.SHOW_TEXT,
        null,
        false
      );

      const nodesToProcess = [];
      let node;
      while ((node = walker.nextNode())) {
        nodesToProcess.push(node);
      }

      let restoredAny = false;

      // 각 텍스트 노드에서 누락된 파일명 찾아서 복원
      for (const textNode of nodesToProcess) {
        if (!textNode.parentNode) {
          continue;
        }

        const text = textNode.textContent;

        for (let i = 0; i < remainingFiles.length; i++) {
          const file = remainingFiles[i];
          const fileName = file.name;

          // '@파일명' 또는 '파일명' 형태로 검색
          const atFileName = "@" + fileName;
          let index = text.indexOf(atFileName);
          let matchLength = atFileName.length;

          if (index === -1) {
            // '@' 없이 파일명만 검색
            index = text.indexOf(fileName);
            matchLength = fileName.length;
          }

          if (index !== -1) {
            // 텍스트 노드를 분할하고 멘션 스팬 삽입
            const beforeText = text.substring(0, index);
            const afterText = text.substring(index + matchLength);

            // 새 멘션 스팬 생성
            const mentionSpan = document.createElement("span");
            mentionSpan.className = "file-mention";
            mentionSpan.setAttribute("data-file-path", file.path);
            mentionSpan.setAttribute("data-file-name", fileName);
            mentionSpan.textContent = fileName;
            mentionSpan.contentEditable = "false";
            mentionSpan.style.display = "inline-block";

            // DOM 업데이트
            const parent = textNode.parentNode;

            if (beforeText) {
              const beforeNode = document.createTextNode(beforeText);
              parent.insertBefore(beforeNode, textNode);
            }

            parent.insertBefore(mentionSpan, textNode);

            if (afterText) {
              textNode.textContent = afterText;
            } else {
              parent.removeChild(textNode);
            }

            // 이 파일은 복원했으므로 remainingFiles에서 제거
            remainingFiles.splice(i, 1);
            restoredAny = true;
            break; // DOM이 변경되었으므로 다시 텍스트 노드 수집 필요
          }
        }

        if (restoredAny) {
          break;
        } // 외부 for 루프도 중단하고 while 루프로 돌아감
      }

      // 이번 반복에서 아무것도 복원하지 못했으면 종료
      if (!restoredAny) {
        break;
      }
    }
  } finally {
    isRestoringMentions = false;
  }
}

/**
 * chatInput에 MutationObserver를 설정하여 멘션 스팬이 텍스트로 변환될 때 즉시 복원합니다.
 */
export function setupMentionObserver() {
  if (!chatInput || mentionObserver) {
    return;
  }

  mentionObserver = new MutationObserver((mutations) => {
    if (isRestoringMentions || selectedFiles.length === 0) {
      return;
    }

    // 멘션 스팬이 제거되었는지 확인
    let mentionRemoved = false;
    for (const mutation of mutations) {
      if (mutation.type === "childList") {
        for (const removedNode of mutation.removedNodes) {
          if (
            removedNode.nodeType === Node.ELEMENT_NODE &&
            removedNode.classList &&
            removedNode.classList.contains("file-mention")
          ) {
            mentionRemoved = true;
            break;
          }
        }
      }
      if (mentionRemoved) {
        break;
      }
    }

    // 멘션이 제거되었으면 복원 시도
    if (mentionRemoved) {
      // requestAnimationFrame으로 DOM 안정화 후 복원
      requestAnimationFrame(() => {
        restoreMentionsFromText();
      });
    }
  });

  mentionObserver.observe(chatInput, {
    childList: true,
    subtree: true,
  });
}

/**
 * MutationObserver 해제
 */
export function disconnectMentionObserver() {
  if (mentionObserver) {
    mentionObserver.disconnect();
    mentionObserver = null;
  }
}
