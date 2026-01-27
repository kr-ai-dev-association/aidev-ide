/**
 * Slash Commands Module
 * 슬래시 명령어 메뉴 관련 기능
 */

// 슬래시 메뉴 상태
let slashMenuVisible = false;
let slashMenuSelectedIndex = 0;
let slashMenuMode = "categories"; // 'categories' 또는 'commands'
let selectedSlashCategory = null;

// 슬래시 명령어 카테고리 정의
export const slashCategories = [
  { id: "context", label: "컨텍스트", description: "프로젝트 컨텍스트 관련 명령" },
  { id: "code", label: "코드", description: "코드 생성 및 수정 관련 명령" },
  { id: "terminal", label: "터미널", description: "터미널 명령어 관련" },
  { id: "git", label: "Git", description: "Git 관련 명령" },
  { id: "session", label: "세션", description: "세션 관리 명령" },
];

// 카테고리별 슬래시 명령어 정의
export const slashCommandsByCategory = {
  context: [
    { command: "/context refresh", label: "컨텍스트 새로고침", description: "프로젝트 컨텍스트를 다시 로드합니다", action: "context_refresh" },
    { command: "/context clear", label: "컨텍스트 초기화", description: "캐시된 컨텍스트를 초기화합니다", action: "context_clear" },
    { command: "/context stats", label: "컨텍스트 통계", description: "현재 컨텍스트 캐시 상태를 확인합니다", action: "context_stats" },
  ],
  code: [
    { command: "/code explain", label: "코드 설명", description: "선택한 코드를 설명합니다", action: "code_explain" },
    { command: "/code refactor", label: "리팩토링", description: "선택한 코드를 리팩토링합니다", action: "code_refactor" },
    { command: "/code test", label: "테스트 생성", description: "선택한 코드의 테스트를 생성합니다", action: "code_test" },
    { command: "/code review", label: "코드 리뷰", description: "선택한 코드를 리뷰합니다", action: "code_review" },
  ],
  terminal: [
    { command: "/terminal run", label: "명령 실행", description: "터미널 명령어를 실행합니다", action: "terminal_run" },
    { command: "/terminal history", label: "히스토리", description: "최근 터미널 히스토리를 확인합니다", action: "terminal_history" },
  ],
  git: [
    { command: "/git status", label: "Git 상태", description: "Git 상태를 확인합니다", action: "git_status" },
    { command: "/git diff", label: "변경사항", description: "변경된 파일 목록을 확인합니다", action: "git_diff" },
    { command: "/git commit", label: "커밋", description: "변경사항을 커밋합니다", action: "git_commit" },
  ],
  session: [
    { command: "/session save", label: "세션 저장", description: "현재 세션을 저장합니다", action: "session_save" },
    { command: "/session list", label: "세션 목록", description: "저장된 세션 목록을 확인합니다", action: "session_list" },
    { command: "/session clear", label: "세션 초기화", description: "현재 세션을 초기화합니다", action: "session_clear" },
  ],
};

/**
 * 슬래시 메뉴 생성
 * @returns {HTMLElement} 메뉴 요소
 */
export function createSlashMenu() {
  let menu = document.getElementById("slash-command-menu");
  if (!menu) {
    menu = document.createElement("div");
    menu.id = "slash-command-menu";
    menu.className = "slash-command-menu";
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
 * 슬래시 메뉴 렌더링
 * @param {string} filter - 필터 문자열
 * @param {HTMLElement} chatInput - 채팅 입력 요소
 * @param {Function} setCursorToEnd - 커서를 끝으로 이동하는 함수
 */
export function renderSlashMenu(filter = "", chatInput, setCursorToEnd) {
  const menu = createSlashMenu();

  // 카테고리 모드
  if (slashMenuMode === "categories") {
    const filteredCategories = slashCategories.filter(
      (cat) =>
        cat.label.toLowerCase().includes(filter.toLowerCase()) ||
        cat.description.toLowerCase().includes(filter.toLowerCase()) ||
        cat.id.toLowerCase().includes(filter.toLowerCase())
    );

    if (filteredCategories.length === 0) {
      hideSlashMenu();
      return;
    }

    menu.innerHTML = filteredCategories
      .map(
        (category, index) => `
        <div class="slash-category-item ${index === slashMenuSelectedIndex ? "selected" : ""}"
             data-index="${index}" data-category="${category.id}"
             style="padding: 8px 12px; cursor: pointer; display: flex; flex-direction: column; gap: 2px; border-bottom: 1px solid var(--vscode-panel-border); ${index === slashMenuSelectedIndex ? "background: rgba(128,128,128,0.2);" : ""}">
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-weight: 500; font-size: 10px;">${category.label}</span>
                <span style="color: var(--vscode-descriptionForeground); font-size: 9px;">/${category.id}</span>
            </div>
            <div style="font-size: 9px; color: var(--vscode-descriptionForeground);">${category.description}</div>
        </div>
      `
      )
      .join("");

    menu.querySelectorAll(".slash-category-item").forEach((item) => {
      item.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const categoryId = item.getAttribute("data-category");
        selectSlashCategory(categoryId, chatInput, setCursorToEnd);
      });
      item.addEventListener("mouseenter", () => {
        slashMenuSelectedIndex = parseInt(item.getAttribute("data-index"));
        renderSlashMenu(filter, chatInput, setCursorToEnd);
      });
    });
  } else {
    // 명령어 모드
    const commands = slashCommandsByCategory[selectedSlashCategory] || [];
    const filteredCommands = commands.filter(
      (cmd) =>
        cmd.command.toLowerCase().includes(filter.toLowerCase()) ||
        cmd.label.toLowerCase().includes(filter.toLowerCase())
    );

    if (filteredCommands.length === 0) {
      hideSlashMenu();
      return;
    }

    // 뒤로가기 버튼 + 명령어 목록
    const backButton = `
      <div class="slash-back-item"
           style="padding: 8px 12px; cursor: pointer; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid var(--vscode-panel-border); background: var(--vscode-sideBar-background);">
          <span style="font-size: 12px;">←</span>
          <span style="font-size: 10px; color: var(--vscode-descriptionForeground);">뒤로</span>
      </div>
    `;

    menu.innerHTML =
      backButton +
      filteredCommands
        .map(
          (cmd, index) => `
        <div class="slash-command-item ${index === slashMenuSelectedIndex ? "selected" : ""}"
             data-index="${index}" data-action="${cmd.action}"
             style="padding: 8px 12px; cursor: pointer; display: flex; flex-direction: column; gap: 2px; border-bottom: 1px solid var(--vscode-panel-border); ${index === slashMenuSelectedIndex ? "background: rgba(128,128,128,0.2);" : ""}">
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-weight: 500; font-size: 10px;">${cmd.label}</span>
                <span style="color: var(--vscode-descriptionForeground); font-size: 9px;">${cmd.command}</span>
            </div>
            <div style="font-size: 9px; color: var(--vscode-descriptionForeground);">${cmd.description}</div>
        </div>
      `
        )
        .join("");

    // 뒤로가기 버튼 이벤트
    const backBtn = menu.querySelector(".slash-back-item");
    if (backBtn) {
      backBtn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        slashMenuMode = "categories";
        selectedSlashCategory = null;
        slashMenuSelectedIndex = 0;
        renderSlashMenu("", chatInput, setCursorToEnd);
        if (chatInput) {
          chatInput.textContent = "/";
          setCursorToEnd(chatInput);
        }
      });
    }

    menu.querySelectorAll(".slash-command-item").forEach((item) => {
      item.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const action = item.getAttribute("data-action");
        executeSlashCommand(action, chatInput);
      });
      item.addEventListener("mouseenter", () => {
        slashMenuSelectedIndex = parseInt(item.getAttribute("data-index"));
        renderSlashMenu(filter, chatInput, setCursorToEnd);
      });
    });
  }

  // 선택된 항목이 보이도록 스크롤 이동
  const selectedItem = menu.querySelector(`[data-index="${slashMenuSelectedIndex}"]`);
  if (selectedItem) {
    selectedItem.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  menu.style.display = "block";
  slashMenuVisible = true;
}

/**
 * 슬래시 카테고리 선택
 * @param {string} categoryId - 카테고리 ID
 * @param {HTMLElement} chatInput - 채팅 입력 요소
 * @param {Function} setCursorToEnd - 커서를 끝으로 이동하는 함수
 */
export function selectSlashCategory(categoryId, chatInput, setCursorToEnd) {
  selectedSlashCategory = categoryId;
  slashMenuMode = "commands";
  slashMenuSelectedIndex = 0;
  renderSlashMenu("", chatInput, setCursorToEnd);

  if (chatInput) {
    chatInput.textContent = `/${categoryId} `;
    setCursorToEnd(chatInput);
  }
}

/**
 * 슬래시 메뉴 숨기기
 */
export function hideSlashMenu() {
  const menu = document.getElementById("slash-command-menu");
  if (menu) {
    menu.style.display = "none";
  }
  slashMenuVisible = false;
  slashMenuSelectedIndex = 0;
  slashMenuMode = "categories";
  selectedSlashCategory = null;
}

/**
 * 슬래시 명령 실행
 * @param {string} action - 실행할 액션
 * @param {HTMLElement} chatInput - 채팅 입력 요소
 * @param {Object} vscode - VS Code API
 * @param {Function} autoResizeTextarea - textarea 크기 조절 함수
 */
export function executeSlashCommand(action, chatInput, vscode, autoResizeTextarea) {
  hideSlashMenu();
  if (chatInput) {
    chatInput.textContent = "";
    if (autoResizeTextarea) {
      autoResizeTextarea();
    }
  }

  if (vscode) {
    vscode.postMessage({ command: "executeSlashCommand", action: action });
  }
}

/**
 * 슬래시 메뉴 상태 가져오기
 */
export function getSlashMenuState() {
  return {
    visible: slashMenuVisible,
    selectedIndex: slashMenuSelectedIndex,
    mode: slashMenuMode,
    selectedCategory: selectedSlashCategory,
  };
}

/**
 * 슬래시 메뉴 선택 인덱스 설정
 * @param {number} index
 */
export function setSlashMenuSelectedIndex(index) {
  slashMenuSelectedIndex = index;
}

/**
 * 현재 모드의 항목 수 가져오기
 */
export function getSlashMenuItemCount() {
  if (slashMenuMode === "categories") {
    return slashCategories.length;
  }
  return (slashCommandsByCategory[selectedSlashCategory] || []).length;
}
