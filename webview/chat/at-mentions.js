/**
 * At Mentions Module
 * '@' 파일/터미널/진단 멘션 관련 기능
 */

// '@' 메뉴 상태
let atMenuVisible = false;
let atMenuSelectedIndex = 0;
let atMenuMode = "categories"; // 'categories', 'files', 'terminal', 'diagnostics'
let selectedAtCategory = null;
let fileList = [];

// '@' 메뉴 카테고리 정의
export const atMenuCategories = [
  { id: "files", label: "Files", description: "프로젝트 파일 참조" },
  { id: "terminal", label: "Terminal", description: "활성 터미널 출력" },
  { id: "diagnostics", label: "Diagnostics", description: "에러 및 경고" },
];

/**
 * '@' 파일 참조 메뉴 생성
 * @returns {HTMLElement} 메뉴 요소
 */
export function createAtMenu() {
  let menu = document.getElementById("at-file-menu");
  if (!menu) {
    menu = document.createElement("div");
    menu.id = "at-file-menu";
    menu.className = "at-file-menu";
    menu.style.cssText = `
      display: none;
      position: absolute;
      bottom: 100%;
      left: 0;
      right: 0;
      margin-bottom: 4px;
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      z-index: 1000;
      max-height: 200px;
      overflow-y: auto;
    `;
    const inputWrapper = document.querySelector(".input-row");
    if (inputWrapper) {
      inputWrapper.style.position = "relative";
      inputWrapper.appendChild(menu);
    }
  }
  return menu;
}

/**
 * '@' 메뉴 숨기기
 */
export function hideAtMenu() {
  const menu = document.getElementById("at-file-menu");
  if (menu) {
    menu.style.display = "none";
  }
  atMenuVisible = false;
  atMenuSelectedIndex = 0;
  atMenuMode = "categories";
  selectedAtCategory = null;
}

/**
 * 파일 목록 설정
 * @param {Array} files - 파일 목록
 */
export function setFileList(files) {
  fileList = files || [];
}

/**
 * 파일 목록 가져오기
 * @returns {Array}
 */
export function getFileList() {
  return fileList;
}

/**
 * '@' 메뉴 상태 가져오기
 */
export function getAtMenuState() {
  return {
    visible: atMenuVisible,
    selectedIndex: atMenuSelectedIndex,
    mode: atMenuMode,
    selectedCategory: selectedAtCategory,
  };
}

/**
 * '@' 메뉴 선택 인덱스 설정
 * @param {number} index
 */
export function setAtMenuSelectedIndex(index) {
  atMenuSelectedIndex = index;
}

/**
 * '@' 메뉴 모드 설정
 * @param {string} mode
 */
export function setAtMenuMode(mode) {
  atMenuMode = mode;
}

/**
 * '@' 메뉴 가시성 설정
 * @param {boolean} visible
 */
export function setAtMenuVisible(visible) {
  atMenuVisible = visible;
}

/**
 * 선택된 카테고리 설정
 * @param {string} category
 */
export function setSelectedAtCategory(category) {
  selectedAtCategory = category;
}

/**
 * 카테고리 선택
 * @param {string} categoryId - 카테고리 ID
 * @param {Object} vscode - VS Code API
 * @param {Function} renderAtMenuFn - 메뉴 렌더링 함수
 */
export function selectCategory(categoryId, vscode, renderAtMenuFn) {
  selectedAtCategory = categoryId;
  atMenuSelectedIndex = 0;

  if (categoryId === "files") {
    atMenuMode = "files";
    // 파일 목록 요청
    if (vscode) {
      vscode.postMessage({ command: "getFileList" });
    }
    if (renderAtMenuFn) {
      renderAtMenuFn("");
    }
  } else if (categoryId === "terminal") {
    atMenuMode = "terminal";
    // 터미널 컨텍스트 요청
    if (vscode) {
      vscode.postMessage({ command: "getTerminalContext" });
    }
    if (renderAtMenuFn) {
      renderAtMenuFn("");
    }
  } else if (categoryId === "diagnostics") {
    atMenuMode = "diagnostics";
    // Diagnostics 요청
    if (vscode) {
      vscode.postMessage({ command: "getDiagnostics" });
    }
    if (renderAtMenuFn) {
      renderAtMenuFn("");
    }
  }
}

/**
 * 카테고리로 돌아가기
 * @param {Function} renderAtMenuFn - 메뉴 렌더링 함수
 */
export function goBackToCategories(renderAtMenuFn) {
  atMenuMode = "categories";
  selectedAtCategory = null;
  atMenuSelectedIndex = 0;
  if (renderAtMenuFn) {
    renderAtMenuFn("");
  }
}

/**
 * 파일 멘션 삽입
 * @param {string} fileName - 파일 이름
 * @param {string} filePath - 파일 경로
 * @param {HTMLElement} chatInput - 채팅 입력 요소
 * @param {Array} selectedFiles - 선택된 파일 배열
 * @param {Function} removeAtSymbolFn - '@' 기호 제거 함수
 * @param {Function} autoResizeTextareaFn - textarea 크기 조절 함수
 */
export function insertFileMention(fileName, filePath, chatInput, selectedFiles, removeAtSymbolFn, autoResizeTextareaFn) {
  if (!chatInput) return;

  // '@' 문자와 검색어 제거
  if (removeAtSymbolFn) {
    removeAtSymbolFn();
  }

  // 멘션 스팬 생성
  const mentionSpan = document.createElement("span");
  mentionSpan.className = "file-mention";
  mentionSpan.setAttribute("data-file-path", filePath);
  mentionSpan.setAttribute("data-file-name", fileName);
  mentionSpan.textContent = fileName;
  mentionSpan.contentEditable = "false";
  mentionSpan.style.display = "inline-block";

  // 삭제 버튼 추가
  const removeBtn = document.createElement("span");
  removeBtn.className = "mention-remove";
  removeBtn.textContent = "×";
  removeBtn.style.cssText = `
    margin-left: 4px;
    cursor: pointer;
    opacity: 0.7;
    font-size: 12px;
  `;
  removeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    mentionSpan.remove();
    // selectedFiles에서도 제거
    const index = selectedFiles.findIndex((f) => f.path === filePath);
    if (index > -1) {
      selectedFiles.splice(index, 1);
    }
    if (autoResizeTextareaFn) {
      autoResizeTextareaFn();
    }
  });
  mentionSpan.appendChild(removeBtn);

  // 커서 위치에 삽입
  const selection = window.getSelection();
  if (selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    range.insertNode(mentionSpan);

    // 공백 추가하고 커서 이동
    const spaceNode = document.createTextNode("\u00A0");
    range.setStartAfter(mentionSpan);
    range.insertNode(spaceNode);
    range.setStartAfter(spaceNode);
    range.setEndAfter(spaceNode);
    selection.removeAllRanges();
    selection.addRange(range);
  } else {
    chatInput.appendChild(mentionSpan);
    chatInput.appendChild(document.createTextNode("\u00A0"));
  }

  // selectedFiles에 추가
  if (!selectedFiles.some((f) => f.path === filePath)) {
    selectedFiles.push({ name: fileName, path: filePath });
  }

  hideAtMenu();
  chatInput.focus();

  if (autoResizeTextareaFn) {
    autoResizeTextareaFn();
  }
}

/**
 * 터미널 멘션 삽입
 * @param {string} terminalName - 터미널 이름
 * @param {HTMLElement} chatInput - 채팅 입력 요소
 * @param {Object} selectedTerminalContext - 선택된 터미널 컨텍스트 객체
 * @param {Function} removeAtSymbolFn - '@' 기호 제거 함수
 * @param {Function} autoResizeTextareaFn - textarea 크기 조절 함수
 */
export function insertTerminalMention(terminalName, chatInput, selectedTerminalContext, removeAtSymbolFn, autoResizeTextareaFn) {
  if (!chatInput) return;

  // '@' 문자와 검색어 제거
  if (removeAtSymbolFn) {
    removeAtSymbolFn();
  }

  // 기존 터미널 멘션 제거
  const existingMention = chatInput.querySelector(".terminal-mention");
  if (existingMention) {
    existingMention.remove();
  }

  // 멘션 스팬 생성
  const mentionSpan = document.createElement("span");
  mentionSpan.className = "terminal-mention";
  mentionSpan.setAttribute("data-terminal-name", terminalName);
  mentionSpan.textContent = `Terminal: ${terminalName}`;
  mentionSpan.contentEditable = "false";
  mentionSpan.style.display = "inline-block";

  // 삭제 버튼 추가
  const removeBtn = document.createElement("span");
  removeBtn.className = "mention-remove";
  removeBtn.textContent = "×";
  removeBtn.style.cssText = `
    margin-left: 4px;
    cursor: pointer;
    opacity: 0.7;
    font-size: 12px;
  `;
  removeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    mentionSpan.remove();
    // 터미널 컨텍스트 초기화 - 외부에서 처리
    if (autoResizeTextareaFn) {
      autoResizeTextareaFn();
    }
  });
  mentionSpan.appendChild(removeBtn);

  // 커서 위치에 삽입
  const selection = window.getSelection();
  if (selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    range.insertNode(mentionSpan);

    // 공백 추가하고 커서 이동
    const spaceNode = document.createTextNode("\u00A0");
    range.setStartAfter(mentionSpan);
    range.insertNode(spaceNode);
    range.setStartAfter(spaceNode);
    range.setEndAfter(spaceNode);
    selection.removeAllRanges();
    selection.addRange(range);
  } else {
    chatInput.appendChild(mentionSpan);
    chatInput.appendChild(document.createTextNode("\u00A0"));
  }

  hideAtMenu();
  chatInput.focus();

  if (autoResizeTextareaFn) {
    autoResizeTextareaFn();
  }
}

/**
 * Diagnostics 멘션 삽입
 * @param {number} errorCount - 에러 수
 * @param {number} warningCount - 경고 수
 * @param {HTMLElement} chatInput - 채팅 입력 요소
 * @param {Function} removeAtSymbolFn - '@' 기호 제거 함수
 * @param {Function} autoResizeTextareaFn - textarea 크기 조절 함수
 */
export function insertDiagnosticsMention(errorCount, warningCount, chatInput, removeAtSymbolFn, autoResizeTextareaFn) {
  if (!chatInput) return;

  // '@' 문자와 검색어 제거
  if (removeAtSymbolFn) {
    removeAtSymbolFn();
  }

  // 기존 Diagnostics 멘션 제거
  const existingMention = chatInput.querySelector(".diagnostics-mention");
  if (existingMention) {
    existingMention.remove();
  }

  // 멘션 스팬 생성
  const mentionSpan = document.createElement("span");
  mentionSpan.className = "diagnostics-mention";
  mentionSpan.setAttribute("data-error-count", errorCount);
  mentionSpan.setAttribute("data-warning-count", warningCount);
  mentionSpan.textContent = `Diagnostics: ${errorCount} errors, ${warningCount} warnings`;
  mentionSpan.contentEditable = "false";
  mentionSpan.style.display = "inline-block";

  // 삭제 버튼 추가
  const removeBtn = document.createElement("span");
  removeBtn.className = "mention-remove";
  removeBtn.textContent = "×";
  removeBtn.style.cssText = `
    margin-left: 4px;
    cursor: pointer;
    opacity: 0.7;
    font-size: 12px;
  `;
  removeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    mentionSpan.remove();
    if (autoResizeTextareaFn) {
      autoResizeTextareaFn();
    }
  });
  mentionSpan.appendChild(removeBtn);

  // 커서 위치에 삽입
  const selection = window.getSelection();
  if (selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    range.insertNode(mentionSpan);

    // 공백 추가하고 커서 이동
    const spaceNode = document.createTextNode("\u00A0");
    range.setStartAfter(mentionSpan);
    range.insertNode(spaceNode);
    range.setStartAfter(spaceNode);
    range.setEndAfter(spaceNode);
    selection.removeAllRanges();
    selection.addRange(range);
  } else {
    chatInput.appendChild(mentionSpan);
    chatInput.appendChild(document.createTextNode("\u00A0"));
  }

  hideAtMenu();
  chatInput.focus();

  if (autoResizeTextareaFn) {
    autoResizeTextareaFn();
  }
}

/**
 * 현재 모드의 항목 수 가져오기
 */
export function getAtMenuItemCount() {
  if (atMenuMode === "categories") {
    return atMenuCategories.length;
  }
  if (atMenuMode === "files") {
    return fileList.length;
  }
  return 1; // terminal, diagnostics는 단일 항목
}
