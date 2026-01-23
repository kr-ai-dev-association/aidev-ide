import sanitizeHtml from "sanitize-html";
import { addCopyButtonsToCodeBlocks } from "./codeCopy.js";
import markdownit from "markdown-it";
import markdownitContainer from "markdown-it-container";
import { getIcon } from "@peoplesgrocers/seti-ui-file-icons";

// console.log("✅ chat.js loaded");

// VS Code API를 전역으로 획득 (codeCopy.js와 공유)
if (
  typeof window.vscode === "undefined" &&
  typeof acquireVsCodeApi !== "undefined"
) {
  window.vscode = acquireVsCodeApi();

  // ✅ __BOOT_PING__ 테스트 - Webview 연결 확인
  try {
    window.vscode.postMessage({
      command: "__BOOT_PING__",
      timestamp: Date.now(),
    });
  } catch (error) {
    // Silent error handling
  }
}
const vscode = window.vscode || null;

// 처리 단계 제어 변수들
let processingStepsArray = [];
let typingInterval = null;
let lastFullText = "";

// 스트리밍 메시지 처리 변수들
let streamingMessageElement = null;
let streamingTextContent = "";
let streamingRenderTimeout = null;

// showProcessingSteps(), hideProcessingSteps() - 상단 고정 UI 삭제됨 (하단 타자기 효과로 통합)

function updateThinkingBubbleText() {
  if (!thinkingBubbleElement) {
    return;
  }

  // 모든 단계를 '|'로 이어 붙이는 대신, 현재 진행 중인 최신 단계 하나만 표시합니다.
  // (사용자 피드백: 히스토리를 다 보여주지 말고 현재 상태만 깔끔하게 출력 요청 반영)
  const lastStep = processingStepsArray[processingStepsArray.length - 1];
  if (!lastStep) {
    return;
  }

  const status = lastStep.status || "";
  const stepName = lastStep.step || "";

  // 'processing'이나 'Waiting...' 같은 기본값보다는 실제 의미 있는 상태 메시지(status)를 우선 사용합니다.
  const stepLabels = {
    intent: "의도 분석",
    assembling: "컨텍스트 수집",
    thinking: "분석 및 생각",
    plan: "작업 계획 수립",
    executing: "도구 실행",
    done: "작업 완료",
  };

  let displayMsg =
    status && status !== "processing" && status !== "Waiting..."
      ? status
      : stepLabels[stepName] || stepName;

  // 터미널 느낌을 주기 위해 '>' 기호를 접두어로 사용합니다.
  const newFullText = `> ${displayMsg}`;

  // 이미 같은 텍스트면 중단
  if (newFullText === lastFullText) {
    return;
  }
  lastFullText = newFullText;

  // 이전 타이핑 인터벌 중지
  if (typingInterval) {
    clearInterval(typingInterval);
  }

  const textElement = thinkingBubbleElement.querySelector(".thinking-text");
  if (!textElement) {
    return;
  }

  // 타자기 효과 시작
  let index = 0;
  textElement.textContent = "";
  typingInterval = setInterval(() => {
    if (index < newFullText.length) {
      textElement.textContent += newFullText[index];
      index++;
      // 스크롤 유지
      if (chatMessages) {
        chatMessages.scrollTop = chatMessages.scrollHeight;
      }
    } else {
      clearInterval(typingInterval);
      typingInterval = null;
    }
  }, 20); // 타자기 속도
}

function setProcessingStep(stepName) {
  // global array update
  const existingStepIndex = processingStepsArray.findIndex(
    (s) => s.step === stepName,
  );
  if (existingStepIndex === -1) {
    processingStepsArray.push({ step: stepName, status: "processing" });
  } else {
    processingStepsArray[existingStepIndex].status = "processing";
  }
  updateThinkingBubbleText();

  const processingSteps = document.getElementById("processing-steps");
  if (!processingSteps) {
    return;
  }

  // 모든 단계를 비활성화
  const allSteps = processingSteps.querySelectorAll(".processing-step");
  allSteps.forEach((step) => {
    step.classList.remove("active", "completed");
  });

  // 현재 단계를 활성화
  const currentStep = processingSteps.querySelector(
    `[data-step="${stepName}"]`,
  );
  if (currentStep) {
    currentStep.classList.add("active");
  }

  // 이전 단계들을 완료로 표시
  const stepOrder = [
    "systems",
    "intent",
    "plan",
    "thinking",
    "analyzing",
    "assembling",
    "executing",
    "parsing",
    "file_processing",
    "printing",
  ];
  const currentIndex = stepOrder.indexOf(stepName);
  for (let i = 0; i < currentIndex; i++) {
    const prevStep = processingSteps.querySelector(
      `[data-step="${stepOrder[i]}"]`,
    );
    if (prevStep) {
      prevStep.classList.add("completed");
    }
  }
}

function updateProcessingStatus(stepName, status) {
  // global array update
  const existingStepIndex = processingStepsArray.findIndex(
    (s) => s.step === stepName,
  );
  if (existingStepIndex !== -1) {
    processingStepsArray[existingStepIndex].status = status;
  } else {
    processingStepsArray.push({ step: stepName, status: status });
  }
  updateThinkingBubbleText();
  handleScroll(); // 상태 업데이트 시 위치 체크

  const statusElement = document.getElementById(`${stepName}-status`);
  if (statusElement) {
    statusElement.textContent = status;
  }
}

// 스크롤 감지하여 버블 고정/해제 처리
function handleScroll() {
  if (!thinkingBubbleElement || !chatContainer) {
    return;
  }

  const bubbleRect = thinkingBubbleElement.getBoundingClientRect();
  const containerRect = chatContainer.getBoundingClientRect();

  // 하단 입력창 영역 높이 계산 (동적 패딩값 활용)
  const bottomFixedArea = document.querySelector(".bottom-fixed-area");
  const bottomHeight = bottomFixedArea ? bottomFixedArea.offsetHeight : 220;
  const visibleBottom = containerRect.bottom - bottomHeight;

  // 1. 하단 가려짐 감지: 버블의 상단이 보이는 영역의 하단보다 아래에 있으면 (위로 스크롤 시)
  if (bubbleRect.top > visibleBottom - 20) {
    thinkingBubbleElement.classList.add("is-forced-top");
  } else {
    // 2. 고정 해제: 사용자가 다시 맨 아래로 스크롤했을 때
    const isAtBottom =
      chatContainer.scrollHeight - chatContainer.scrollTop <=
      chatContainer.clientHeight + 100;
    if (isAtBottom) {
      thinkingBubbleElement.classList.remove("is-forced-top");
    }
  }
}

// ===== 스트리밍 메시지 처리 함수들 =====

/**
 * 스트리밍 메시지 시작
 * 새로운 스트리밍 응답을 위한 메시지 요소 생성
 */
function startStreamingMessage(sender) {
  if (!chatMessages) {
    console.warn("[Streaming] chatMessages element not found");
    return;
  }

  // thinking bubble 숨기기
  if (thinkingBubbleElement) {
    thinkingBubbleElement.style.display = "none";
  }

  // 기존 스트리밍 요소가 있으면 먼저 완료 처리
  if (streamingMessageElement) {
    endStreamingMessage();
  }

  // 새 메시지 요소 생성 (displayCodePilotMessage와 동일한 구조)
  const messageContainer = document.createElement("div");
  messageContainer.classList.add("codepilot-message-container", "streaming");

  const bubbleElement = document.createElement("div");
  bubbleElement.classList.add("message-bubble");
  bubbleElement.innerHTML = `<div class="message-content"><span class="streaming-cursor"></span></div>`;

  messageContainer.appendChild(bubbleElement);
  streamingMessageElement = messageContainer;

  chatMessages.appendChild(streamingMessageElement);
  streamingTextContent = "";

  // 스크롤을 하단으로
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

/**
 * 스트리밍 청크 추가
 * 수신된 텍스트 청크를 메시지에 추가
 */
function appendStreamingChunk(chunk) {
  if (!streamingMessageElement) {
    // 스트리밍이 시작되지 않았으면 시작
    startStreamingMessage("assistant");
  }

  streamingTextContent += chunk;

  // 디바운싱: 빠른 청크 수신 시 렌더링 최적화
  if (streamingRenderTimeout) {
    clearTimeout(streamingRenderTimeout);
  }

  streamingRenderTimeout = setTimeout(() => {
    renderStreamingContent();
  }, 16); // 약 60fps
}

/**
 * think 태그에서 현재 진행 중인 사고 과정 추출
 * 스트리밍 중에만 표시하고 완료되면 제거됨
 */
function extractCurrentThink(text) {
  // 아직 닫히지 않은 think 태그 찾기 (현재 진행 중인 것)
  const openThinkMatch = text.match(/<think>([\s\S]*)$/i);
  if (openThinkMatch) {
    // 닫히지 않은 think 태그가 있음 = 현재 사고 중
    return {
      thinkContent: openThinkMatch[1].trim(),
      isThinking: true,
    };
  }

  // 가장 마지막 완료된 think 태그 찾기 (바로 직전에 완료된 것 - 잠시 표시용)
  const closedThinkMatches = [...text.matchAll(/<think>([\s\S]*?)<\/think>/gi)];
  if (closedThinkMatches.length > 0) {
    const lastMatch = closedThinkMatches[closedThinkMatches.length - 1];
    return {
      thinkContent: lastMatch[1].trim(),
      isThinking: false,
      justCompleted: true,
    };
  }

  return { thinkContent: null, isThinking: false };
}

/**
 * think 태그를 제거한 텍스트 반환 (최종 출력용)
 */
function removeThinkTags(text) {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*$/gi, "")
    .trim();
}

/**
 * 스트리밍 콘텐츠 렌더링
 * 누적된 텍스트를 마크다운으로 렌더링
 * think 태그는 실시간으로 표시하고 완료되면 제거
 */
function renderStreamingContent() {
  if (!streamingMessageElement) {
    return;
  }

  const contentElement =
    streamingMessageElement.querySelector(".message-content");
  if (!contentElement) {
    return;
  }

  try {
    // 현재 진행 중인 think 내용 추출
    const { thinkContent, isThinking } =
      extractCurrentThink(streamingTextContent);

    // think 태그가 제거된 실제 응답 텍스트
    const cleanText = removeThinkTags(streamingTextContent);

    let html = "";

    // think 내용이 있고 현재 사고 중이면 상단에 표시
    if (thinkContent && isThinking) {
      html += `<div class="think-bubble">
                <span class="think-icon">💭</span>
                <span class="think-text">${escapeHtml(thinkContent)}</span>
                <span class="think-cursor">▌</span>
            </div>`;
    }

    // 실제 응답 텍스트 렌더링 (displayCodePilotMessage와 동일한 처리)
    if (cleanText) {
      // 1. sanitizeLastResort 적용
      let processedText = cleanText;
      if (typeof sanitizeLastResort === "function") {
        processedText = sanitizeLastResort(processedText);
      }
      // 2. removeToolTags 적용
      if (typeof removeToolTags === "function") {
        processedText = removeToolTags(processedText);
      }

      if (typeof md !== "undefined" && md.render && processedText) {
        // 3. 마크다운 렌더링
        const renderedHtml = md.render(processedText);
        // 4. sanitizeHtml 적용
        if (typeof sanitizeHtml === "function" && typeof sanitizeOptions !== "undefined") {
          html += sanitizeHtml(renderedHtml, sanitizeOptions);
        } else {
          html += renderedHtml;
        }
      } else if (processedText) {
        html += escapeHtml(processedText);
      }
    }

    contentElement.innerHTML = html + '<span class="streaming-cursor"></span>';

    // 🔥 스트리밍 중에도 완성된 코드 블록 UI 개선 (접기/펼치기, 언어 라벨)
    enhanceCodeBlocks(contentElement);

    // 코드 블록에 복사 버튼 추가
    if (typeof addCopyButtonsToCodeBlocks === "function") {
      addCopyButtonsToCodeBlocks(contentElement);
    }
  } catch (e) {
    console.error("[Streaming] Render error:", e);
    contentElement.textContent = streamingTextContent;
  }

  // 스크롤을 하단으로
  if (chatMessages) {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}

/**
 * 스트리밍 메시지 완료
 * 스트리밍 응답 완료 후 최종 처리
 * think 태그는 완전히 제거됨
 */
function endStreamingMessage() {
  if (streamingRenderTimeout) {
    clearTimeout(streamingRenderTimeout);
    streamingRenderTimeout = null;
  }

  if (!streamingMessageElement) {
    return;
  }

  // 커서 제거 및 최종 렌더링
  const contentElement =
    streamingMessageElement.querySelector(".message-content");
  if (contentElement) {
    const cursor = contentElement.querySelector(".streaming-cursor");
    if (cursor) {
      cursor.remove();
    }

    // think 버블 제거
    const thinkBubble = contentElement.querySelector(".think-bubble");
    if (thinkBubble) {
      thinkBubble.remove();
    }

    // 최종 마크다운 렌더링 (displayCodePilotMessage와 동일한 처리 적용)
    try {
      // 1. think 태그 제거
      let cleanText = removeThinkTags(streamingTextContent);

      // 2. sanitizeLastResort 적용 (tool 태그 완전 차단)
      if (typeof sanitizeLastResort === "function") {
        cleanText = sanitizeLastResort(cleanText);
      }

      // 3. removeToolTags 적용 (추가 tool 태그 제거)
      if (typeof removeToolTags === "function") {
        cleanText = removeToolTags(cleanText);
      }

      if (typeof md !== "undefined" && md.render && cleanText) {
        // 4. 마크다운 렌더링
        const renderedHtml = md.render(cleanText);

        // 5. HTML 새니타이징 적용 (XSS 방지)
        if (typeof sanitizeHtml === "function" && typeof sanitizeOptions !== "undefined") {
          contentElement.innerHTML = sanitizeHtml(renderedHtml, sanitizeOptions);
        } else {
          contentElement.innerHTML = renderedHtml;
        }
      }

      // 🔥 코드 블록 UI 개선 (접기/펼치기, 언어 라벨, 아이콘)
      enhanceCodeBlocks(contentElement);

      // 코드 블록에 복사 버튼 추가
      if (typeof addCopyButtonsToCodeBlocks === "function") {
        addCopyButtonsToCodeBlocks(contentElement);
      }
    } catch (e) {
      console.error("[Streaming] Final render error:", e);
    }
  }

  // 스트리밍 클래스 제거
  streamingMessageElement.classList.remove("streaming");

  // 상태 초기화
  streamingMessageElement = null;
  streamingTextContent = "";

  // 스크롤을 하단으로
  if (chatMessages) {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}

/**
 * HTML 이스케이프 헬퍼 함수
 */
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// ===== 스트리밍 메시지 처리 함수들 끝 =====

/**
 * 🔥 스트리밍 완료 후 코드 블록 UI 개선
 * displayCodePilotMessage()와 동일한 UI로 코드 블록을 재렌더링
 * - 접기/펼치기 버튼
 * - 복사 버튼
 * - 언어 라벨
 * - 파일 아이콘
 * (Keep/Undo 버튼은 제외 - 요약의 예시 코드에는 필요 없음)
 */
function enhanceCodeBlocks(contentElement) {
  // 마크다운 렌더링된 코드 블록 찾기 (<pre><code>)
  const preElements = contentElement.querySelectorAll("pre");

  preElements.forEach((preElement) => {
    // 이미 처리된 코드 블록은 스킵 (code-block-container로 감싸진 경우)
    if (preElement.parentElement?.classList.contains("code-container")) {
      return;
    }

    const codeElement = preElement.querySelector("code");
    if (!codeElement) return;

    // 언어 추출 (class="language-xxx" 또는 hljs의 data-highlighted)
    let lang = "";
    const classNames = codeElement.className.split(" ");
    for (const className of classNames) {
      if (className.startsWith("language-")) {
        lang = className.replace("language-", "");
        break;
      } else if (className.startsWith("hljs-")) {
        continue; // hljs 스타일 클래스는 스킵
      } else if (className && className !== "hljs") {
        lang = className;
        break;
      }
    }

    // 코드 내용
    const codeContent = codeElement.textContent || "";

    // 코드 블록 컨테이너 생성
    const codeBlockContainer = document.createElement("div");
    codeBlockContainer.classList.add("code-block-container");

    // 코드 블록 헤더 생성
    const codeHeader = document.createElement("div");
    codeHeader.classList.add("code-block-header");

    // 접기/펼치기 버튼
    const toggleButton = document.createElement("span");
    toggleButton.classList.add("code-toggle-button");
    toggleButton.textContent = "▾";

    // 언어 라벨
    const languageLabel = document.createElement("span");
    languageLabel.classList.add("code-language");

    const displayLang = lang || "text";
    const headerDisplayText = displayLang.toUpperCase();
    const iconFilename = `file.${displayLang}`;

    // 파일 아이콘 로드
    loadFileIcon(iconFilename, languageLabel, headerDisplayText, 14);

    // 왼쪽 그룹 (토글 버튼 + 언어 라벨)
    const headerLeft = document.createElement("a");
    headerLeft.classList.add("code-header-left");
    headerLeft.title = "접기/펼치기";
    headerLeft.appendChild(toggleButton);
    headerLeft.appendChild(languageLabel);

    codeHeader.appendChild(headerLeft);

    // 코드 컨테이너 생성
    const codeContainer = document.createElement("div");
    codeContainer.classList.add("code-container");

    // 고유 ID 생성 (토글용)
    const blockId = `code-block-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    codeBlockContainer.setAttribute("data-block-id", blockId);
    codeContainer.setAttribute("data-container-for", blockId);

    // 토글 링크 설정
    headerLeft.href = `codepilot://toggle?id=${blockId}`;

    // 커서 스타일
    codeHeader.style.cursor = "pointer";

    // 새 pre/code 요소 생성 (기존 것 복제)
    const newPreElement = document.createElement("pre");
    const newCodeElement = document.createElement("code");
    newCodeElement.textContent = codeContent;

    // 동적 구문 강조 적용
    highlightCodeBlock(newCodeElement, lang || null);

    newPreElement.appendChild(newCodeElement);
    codeContainer.appendChild(newPreElement);

    // 코드 블록 컨테이너에 헤더와 코드 추가
    codeBlockContainer.appendChild(codeHeader);
    codeBlockContainer.appendChild(codeContainer);

    // 기존 pre 요소를 새 컨테이너로 교체
    preElement.parentNode.replaceChild(codeBlockContainer, preElement);
  });
}

// Auto Correcting Indicator Functions
function showAutoCorrectingIndicator() {
  const indicator = document.getElementById("auto-correcting-indicator");
  if (indicator) {
    indicator.classList.remove("hidden");
  }
}

function hideAutoCorrectingIndicator() {
  const indicator = document.getElementById("auto-correcting-indicator");
  if (indicator) {
    indicator.classList.add("hidden");
  }
}

function showErrorCorrection(originalCommand, correctedCommand, retryCount) {
  const chatMessages = document.getElementById("chatMessages");
  if (!chatMessages) {
    return;
  }

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

function resetProcessingStatuses() {
  processingStepsArray = [];
  const statuses = ["intent", "analyzing", "assembling", "parsing", "printing"];
  statuses.forEach((step) => {
    const statusElement = document.getElementById(`${step}-status`);
    if (statusElement) {
      if (step === "intent") {
        statusElement.textContent = "Initializing...";
      } else {
        statusElement.textContent = "Waiting...";
      }
    }
  });
}

// sanitize-html 옵션 설정 (codepilot:// 스킴 허용)
const sanitizeOptions = {
  allowedTags: [
    "b",
    "i",
    "em",
    "strong",
    "a",
    "p",
    "br",
    "ul",
    "ol",
    "li",
    "code",
    "pre",
    "span",
    "div",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "blockquote",
    "hr",
  ],
  allowedAttributes: {
    a: ["href", "title"],
    "*": ["class", "id", "style"],
  },
  allowedSchemes: ["http", "https", "mailto", "codepilot"], // codepilot:// 스킴 허용
  allowedSchemesByTag: {
    a: ["http", "https", "mailto", "codepilot"],
  },
};

const sendButton = document.getElementById("send-button");
const chatInput = document.getElementById("chat-input");
const chatMessages = document.getElementById("chat-messages"); // 스크롤 컨테이너
const clearHistoryButton = document.getElementById("clear-history-button"); // Clear History 버튼 참조
const cancelButton = document.getElementById("cancel-call-button"); // Cancel 버튼 참조
const imagePreviewContainer = document.getElementById(
  "image-preview-container",
);
const imagePreview = document.getElementById("image-preview");
const removeImageButton = document.getElementById("remove-image-button");
const modelSelectorButton = document.getElementById("model-selector");
const modelDropdown = document.getElementById("model-dropdown");
const modelLabel = document.getElementById("model-label");

// 파일 선택 관련 요소들 (상단 영역은 더 이상 사용하지 않음)
// const fileSelectionArea = document.getElementById("file-selection-area");
// const selectedFilesContainer = document.getElementById("selected-files-container");
// const clearFilesButton = document.getElementById("clear-files-button");
const filePickerButton = document.getElementById("file-picker-button");
let currentMode = window.chatMode || "CODE";
let currentOllamaModel = "";
let availableOllamaModels = [];

// 채팅 컨테이너 참조 추가
const chatContainer = document.getElementById("chat-container");
const pendingQueueArea = document.getElementById("pending-queue-area");

let thinkingBubbleElement = null;
let selectedImageBase64 = null; // Base64 인코딩된 이미지 데이터를 저장할 변수
let selectedImageMimeType = null; // 이미지 MIME 타입 저장
let selectedFiles = []; // 선택된 파일 목록
let loadingDepth = 0; // 중첩 로딩 상태(에러 우선 처리 대비)
let pendingQuestions = []; // 대기 중 사용자 질문 큐
let mentionObserver = null; // MutationObserver for mention restoration
let isRestoringMentions = false; // 멘션 복원 중 플래그 (무한 루프 방지)

function generateId() {
  return "q_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// 파일 아이콘 로드 함수 (seti-icons 사용)
// @param {string} filename - 파일명 또는 확장자
// @param {HTMLElement} container - 아이콘을 삽입할 컨테이너 요소
// @param {string} displayLang - 표시할 언어명 (코드 블록 헤더용, 선택사항)
// @param {number} iconSize - 아이콘 크기 (px, 기본값: 18)
function loadFileIcon(filename, container, displayLang, iconSize = 18) {
  // displayLang이 있으면 텍스트도 표시 (코드 블록 헤더용)
  if (displayLang) {
    container.textContent = displayLang.toUpperCase();
  } else {
    // displayLang이 없으면 빈 상태로 시작 (파일 리스트용)
    container.textContent = "";
  }

  // 아이콘 가져오기
  try {
    const iconData = getIcon(filename);
    if (iconData && iconData.svg) {
      // 기존 텍스트 제거
      container.textContent = "";

      // SVG를 안전하게 삽입
      const iconContainer = document.createElement("span");
      // 컨테이너 크기를 확실히 고정
      iconContainer.style.cssText = `
                display: inline-flex; 
                align-items: center; 
                justify-content: center; 
                width: ${iconSize}px; 
                height: ${iconSize}px; 
                flex-shrink: 0; 
                vertical-align: middle;
            `;
      // SVG sanitize를 건너뛰고 직접 삽입 (seti-icons는 신뢰할 수 있는 소스)
      iconContainer.innerHTML = iconData.svg;

      // 색상 및 크기 적용
      const svgElement = iconContainer.querySelector("svg");
      if (svgElement) {
        // 1. 색상 적용
        if (iconData.color) {
          svgElement.setAttribute("fill", iconData.color);
        }

        // 2. 핵심: 기존 width/height 속성을 제거하거나 100%로 변경
        // 이렇게 해야 viewBox 설정에 따라 아이콘이 부모 크기에 맞춰 리사이징됩니다.
        svgElement.removeAttribute("width");
        svgElement.removeAttribute("height");

        // 3. 스타일로 크기 제어
        svgElement.style.cssText = `
                    width: 100%; 
                    height: 100%; 
                    display: block;
                `;
      }

      container.appendChild(iconContainer);

      // displayLang이 있으면 텍스트도 함께 표시 (코드 블록 헤더용)
      if (displayLang) {
        const textSpan = document.createElement("span");
        textSpan.style.marginLeft = "4px"; // 텍스트와 간격 조정
        textSpan.textContent = displayLang.toUpperCase();
        container.appendChild(textSpan);
      }
    }
  } catch (error) {
    console.warn("Failed to get file icon:", error);
    // 에러 발생 시 텍스트만 표시 (이미 설정됨)
  }
}

// contenteditable div에서 텍스트만 추출 (파일 멘션 제외)
function getChatInputText() {
  if (!chatInput) {
    return "";
  }
  // 파일 멘션 블록을 제외하고 텍스트만 추출
  const clone = chatInput.cloneNode(true);
  const mentions = clone.querySelectorAll(".file-mention");
  mentions.forEach((mention) => mention.remove());
  return clone.textContent || clone.innerText || "";
}

// contenteditable div에서 전체 내용을 가져오기 (멘션 포함, 표시용)
// 입력 순서대로 그대로 표시
function getChatInputDisplayContent() {
  if (!chatInput) {
    return "";
  }
  // 입력창의 모든 노드를 순서대로 순회하면서 멘션을 텍스트로 변환
  const result = [];

  function processNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      // 텍스트 노드는 그대로 추가 (줄바꿈 문자는 공백으로 변환)
      const text = (node.textContent || "").replace(/[\n\r]/g, " ");
      result.push(text);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const tagName = node.tagName.toLowerCase();

      // <br> 태그는 공백으로 처리 (줄바꿈 방지)
      if (tagName === "br") {
        result.push(" ");
        return;
      }

      if (node.classList && node.classList.contains("file-mention")) {
        // 파일 멘션을 @filename으로 변환
        const fileName =
          node.getAttribute("data-file-name") || node.textContent || "";
        result.push("@" + fileName);
      } else if (node.classList && node.classList.contains("terminal-mention")) {
        // 터미널 멘션을 "Terminal: 터미널이름"으로 변환
        const terminalName =
          node.getAttribute("data-terminal-name") || node.textContent || "";
        result.push("Terminal: " + terminalName);
      } else if (node.classList && node.classList.contains("diagnostics-mention")) {
        // Diagnostics 멘션을 "Diagnostics: N errors, M warnings"로 변환
        const errorCount = node.getAttribute("data-error-count") || "0";
        const warningCount = node.getAttribute("data-warning-count") || "0";
        result.push(`Diagnostics: ${errorCount} errors, ${warningCount} warnings`);
      } else {
        // <div>나 다른 블록 요소 앞에 공백 추가 (줄바꿈 대신)
        if (tagName === "div" && result.length > 0) {
          result.push(" ");
        }
        // 다른 요소는 자식 노드들을 재귀적으로 처리
        const children = Array.from(node.childNodes);
        children.forEach((child) => processNode(child));
      }
    }
  }

  // 모든 자식 노드를 순서대로 처리
  const children = Array.from(chatInput.childNodes);
  children.forEach((child) => processNode(child));

  // 연속 공백을 단일 공백으로 정리하고 앞뒤 공백 제거
  return result.join("").replace(/\s+/g, " ").trim();
}

// contenteditable div에 텍스트 설정
function setChatInputText(text) {
  if (!chatInput) {
    return;
  }
  chatInput.textContent = text;
}

// contenteditable div에서 현재 커서 위치의 텍스트 가져오기
function getChatInputValue() {
  if (!chatInput) {
    return "";
  }
  return chatInput.innerText || chatInput.textContent || "";
}

// '@' 문자와 그 이후 검색어를 제거하는 헬퍼 함수 (멘션 span은 유지)
// '@' 메뉴에서 항목 선택 시 '@검색어' 부분만 제거
// 반환값: { node, offset } - 삽입할 위치 정보
/**
 * 텍스트로 변환된 멘션을 복원합니다.
 * 브라우저가 contenteditable에서 타이핑할 때 contenteditable="false" 스팬을
 * 텍스트로 변환하는 문제를 해결합니다.
 */
function restoreMentionsFromText() {
  if (!chatInput || selectedFiles.length === 0 || isRestoringMentions) return;

  // 현재 DOM에서 멘션 스팬으로 존재하는 파일 경로들
  const existingMentions = new Set();
  chatInput.querySelectorAll('.file-mention').forEach(span => {
    const path = span.getAttribute('data-file-path');
    if (path) existingMentions.add(path);
  });

  // selectedFiles 중 DOM에 스팬으로 없는 파일들 (텍스트로 변환되었을 수 있음)
  const missingFiles = selectedFiles.filter(file => !existingMentions.has(file.path));

  if (missingFiles.length === 0) return;

  console.log("[restoreMentionsFromText] Missing files to restore:", missingFiles.map(f => f.name));

  // 복원 중 플래그 설정 (MutationObserver 무한 루프 방지)
  isRestoringMentions = true;

  try {
    // 모든 누락된 파일을 한 번에 복원하기 위해 반복
    // DOM이 변경되면 다시 텍스트 노드를 수집해야 함
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
        if (!textNode.parentNode) continue;

        const text = textNode.textContent;

        for (let i = 0; i < remainingFiles.length; i++) {
          const file = remainingFiles[i];
          const fileName = file.name;

          // '@파일명' 또는 '파일명' 형태로 검색
          // '@'가 앞에 있으면 함께 제거
          const atFileName = '@' + fileName;
          let index = text.indexOf(atFileName);
          let matchLength = atFileName.length;

          if (index === -1) {
            // '@' 없이 파일명만 검색
            index = text.indexOf(fileName);
            matchLength = fileName.length;
          }

          if (index !== -1) {
            console.log("[restoreMentionsFromText] Restoring:", fileName);

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

        if (restoredAny) break; // 외부 for 루프도 중단하고 while 루프로 돌아감
      }

      // 이번 반복에서 아무것도 복원하지 못했으면 종료
      if (!restoredAny) break;
    }

    if (remainingFiles.length > 0) {
      console.log("[restoreMentionsFromText] Could not restore:", remainingFiles.map(f => f.name));
    }
  } finally {
    isRestoringMentions = false;
  }
}

/**
 * chatInput에 MutationObserver를 설정하여 멘션 스팬이 텍스트로 변환될 때 즉시 복원합니다.
 */
function setupMentionObserver() {
  if (!chatInput || mentionObserver) return;

  mentionObserver = new MutationObserver((mutations) => {
    if (isRestoringMentions || selectedFiles.length === 0) return;

    // 멘션 스팬이 제거되었는지 확인
    let mentionRemoved = false;
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        for (const removedNode of mutation.removedNodes) {
          if (removedNode.nodeType === Node.ELEMENT_NODE &&
              removedNode.classList &&
              removedNode.classList.contains('file-mention')) {
            mentionRemoved = true;
            break;
          }
        }
      }
      if (mentionRemoved) break;
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
    subtree: true
  });

  console.log("[setupMentionObserver] MutationObserver initialized");
}

function removeAtSymbolFromInput() {
  if (!chatInput) return null;

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

  console.log("[removeAtSymbolFromInput] Found '@' at:", {
    nodeText: lastAtNode?.textContent,
    atIndex: lastAtIndex,
    chatInputHTML: chatInput.innerHTML
  });

  if (lastAtNode && lastAtIndex !== -1) {
    const textContent = lastAtNode.textContent;
    // '@' 이후의 검색어 끝 찾기 (공백이나 문자열 끝까지)
    // '@검색어' 패턴에서 '@검색어' 부분만 제거
    let endIndex = textContent.length;
    for (let i = lastAtIndex + 1; i < textContent.length; i++) {
      if (textContent[i] === ' ' || textContent[i] === '\n') {
        endIndex = i;
        break;
      }
    }
    // '@검색어' 제거하고 앞뒤 텍스트 유지
    const beforeAt = textContent.substring(0, lastAtIndex);
    const afterSearch = textContent.substring(endIndex);
    lastAtNode.textContent = beforeAt + afterSearch;

    console.log("[removeAtSymbolFromInput] After removal:", {
      beforeAt,
      afterSearch,
      newNodeText: lastAtNode.textContent,
      offset: beforeAt.length,
      chatInputHTML: chatInput.innerHTML
    });

    // 삽입 위치 반환 (beforeAt의 끝 위치)
    return { node: lastAtNode, offset: beforeAt.length };
  }
  return null;
}

// 파일 멘션 블록 삽입
function insertFileMention(fileName, filePath, removeAtSymbol = true) {
  if (!chatInput) {
    return;
  }

  console.log("[insertFileMention] Before removal, chatInput.innerHTML:", chatInput.innerHTML);

  // '@' 제거 (기존 멘션 span은 유지) 및 삽입 위치 가져오기
  let insertPosition = null;
  if (removeAtSymbol) {
    insertPosition = removeAtSymbolFromInput();
  }

  console.log("[insertFileMention] insertPosition:", insertPosition);
  console.log("[insertFileMention] After removal, chatInput.innerHTML:", chatInput.innerHTML);

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
    if (insertPosition && insertPosition.node && insertPosition.node.parentNode) {
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
          mentionSpan.parentNode.insertBefore(afterNode, mentionSpan.nextSibling);
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

  console.log("[insertFileMention] Final chatInput.innerHTML:", chatInput.innerHTML);
  console.log("[insertFileMention] Final chatInput.childNodes:", Array.from(chatInput.childNodes).map(n => ({type: n.nodeType, text: n.textContent, className: n.className})));
  autoResizeTextarea();
}

// 터미널 멘션 블록 삽입
function insertTerminalMention(terminalName) {
  if (!chatInput) {
    return;
  }

  // '@' 제거 (기존 멘션 span은 유지) 및 삽입 위치 가져오기
  const insertPosition = removeAtSymbolFromInput();

  // 터미널 멘션 블록 생성
  const mentionSpan = document.createElement("span");
  mentionSpan.className = "terminal-mention";
  mentionSpan.setAttribute("data-terminal-name", terminalName);
  mentionSpan.textContent = terminalName;
  mentionSpan.contentEditable = "false";
  mentionSpan.style.display = "inline-block";

  const selection = window.getSelection();
  const range = document.createRange();

  try {
    if (insertPosition && insertPosition.node && insertPosition.node.parentNode) {
      // '@'가 있던 위치에 멘션 삽입
      const textNode = insertPosition.node;
      const offset = insertPosition.offset;

      if (offset === 0) {
        textNode.parentNode.insertBefore(mentionSpan, textNode);
      } else if (offset >= textNode.textContent.length) {
        if (textNode.nextSibling) {
          textNode.parentNode.insertBefore(mentionSpan, textNode.nextSibling);
        } else {
          textNode.parentNode.appendChild(mentionSpan);
        }
      } else {
        const afterText = textNode.textContent.substring(offset);
        textNode.textContent = textNode.textContent.substring(0, offset);
        const afterNode = document.createTextNode(afterText);
        if (textNode.nextSibling) {
          textNode.parentNode.insertBefore(mentionSpan, textNode.nextSibling);
          mentionSpan.parentNode.insertBefore(afterNode, mentionSpan.nextSibling);
        } else {
          textNode.parentNode.appendChild(mentionSpan);
          textNode.parentNode.appendChild(afterNode);
        }
      }

      const spaceNode = document.createTextNode(" ");
      if (mentionSpan.nextSibling) {
        mentionSpan.parentNode.insertBefore(spaceNode, mentionSpan.nextSibling);
      } else {
        mentionSpan.parentNode.appendChild(spaceNode);
      }

      range.setStartAfter(spaceNode);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    } else {
      chatInput.appendChild(mentionSpan);
      const spaceNode = document.createTextNode(" ");
      chatInput.appendChild(spaceNode);

      range.selectNodeContents(chatInput);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  } catch (e) {
    console.error("[insertTerminalMention] Error:", e);
    chatInput.appendChild(mentionSpan);
    const spaceNode = document.createTextNode(" ");
    chatInput.appendChild(spaceNode);

    range.selectNodeContents(chatInput);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  autoResizeTextarea();
}

// Diagnostics 멘션 삽입
function insertDiagnosticsMention(errorCount, warningCount) {
  if (!chatInput) {
    return;
  }

  // '@' 제거 (기존 멘션 span은 유지) 및 삽입 위치 가져오기
  const insertPosition = removeAtSymbolFromInput();

  // Diagnostics 멘션 블록 생성
  const mentionSpan = document.createElement("span");
  mentionSpan.className = "diagnostics-mention";
  mentionSpan.setAttribute("data-error-count", errorCount);
  mentionSpan.setAttribute("data-warning-count", warningCount);
  mentionSpan.textContent = `${errorCount} errors, ${warningCount} warnings`;
  mentionSpan.contentEditable = "false";
  mentionSpan.style.display = "inline-block";

  const selection = window.getSelection();
  const range = document.createRange();

  try {
    if (insertPosition && insertPosition.node && insertPosition.node.parentNode) {
      // '@'가 있던 위치에 멘션 삽입
      const textNode = insertPosition.node;
      const offset = insertPosition.offset;

      if (offset === 0) {
        textNode.parentNode.insertBefore(mentionSpan, textNode);
      } else if (offset >= textNode.textContent.length) {
        if (textNode.nextSibling) {
          textNode.parentNode.insertBefore(mentionSpan, textNode.nextSibling);
        } else {
          textNode.parentNode.appendChild(mentionSpan);
        }
      } else {
        const afterText = textNode.textContent.substring(offset);
        textNode.textContent = textNode.textContent.substring(0, offset);
        const afterNode = document.createTextNode(afterText);
        if (textNode.nextSibling) {
          textNode.parentNode.insertBefore(mentionSpan, textNode.nextSibling);
          mentionSpan.parentNode.insertBefore(afterNode, mentionSpan.nextSibling);
        } else {
          textNode.parentNode.appendChild(mentionSpan);
          textNode.parentNode.appendChild(afterNode);
        }
      }

      const spaceNode = document.createTextNode(" ");
      if (mentionSpan.nextSibling) {
        mentionSpan.parentNode.insertBefore(spaceNode, mentionSpan.nextSibling);
      } else {
        mentionSpan.parentNode.appendChild(spaceNode);
      }

      range.setStartAfter(spaceNode);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    } else {
      chatInput.appendChild(mentionSpan);
      const spaceNode = document.createTextNode(" ");
      chatInput.appendChild(spaceNode);

      range.selectNodeContents(chatInput);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  } catch (e) {
    console.error("[insertDiagnosticsMention] Error:", e);
    chatInput.appendChild(mentionSpan);
    const spaceNode = document.createTextNode(" ");
    chatInput.appendChild(spaceNode);

    range.selectNodeContents(chatInput);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  autoResizeTextarea();
}

function enqueuePendingQuestion(payload) {
  pendingQuestions.push(payload);
  updatePendingQueueUI();
}

function removePendingQuestionById(id) {
  pendingQuestions = pendingQuestions.filter((item) => item.id !== id);
  updatePendingQueueUI();
}

function updatePendingQueueUI() {
  if (!pendingQueueArea) {
    return;
  }
  // 표시/숨김
  if (pendingQuestions.length > 0) {
    pendingQueueArea.classList.add("visible");
  } else {
    pendingQueueArea.classList.remove("visible");
  }
  // 렌더링
  pendingQueueArea.innerHTML = "";
  pendingQuestions.forEach((item) => {
    const el = document.createElement("div");
    el.className = "pending-item";
    const textSpan = document.createElement("span");
    textSpan.className = "text";
    textSpan.title = item.text || "";
    textSpan.textContent = (item.text || "").trim() || "(image/files only)";
    const cancelBtn = document.createElement("button");
    cancelBtn.className = "cancel-btn";
    cancelBtn.textContent = "×";
    cancelBtn.addEventListener("click", () =>
      removePendingQuestionById(item.id),
    );
    el.appendChild(textSpan);
    el.appendChild(cancelBtn);
    pendingQueueArea.appendChild(el);
  });

  // UI 높이 변경 반영
  setTimeout(() => updateChatContainerPadding(), 0);
}

function sendNextQueuedQuestionIfIdle() {
  if (loadingDepth > 0) {
    return;
  }
  if (pendingQuestions.length === 0) {
    return;
  }
  const next = pendingQuestions.shift();
  updatePendingQueueUI();
  // 전송 직전 실제 사용자 메시지를 출력하고 전송
  doSendUserMessage(next);
}

function doSendUserMessage(payload) {
  const text = payload.text || "";
  const img = payload.imageData || null;
  const imgMime = payload.imageMimeType || null;
  const files = payload.selectedFiles || [];
  const mode = payload.mode || currentMode || "CODE";
  const terminalCtx = payload.terminalContext || null;
  const diagnosticsCtx = payload.diagnosticsContext || null;

  updateSendCancelButtons(true); // 전송 시작 시 중지 버튼으로 스왑

  // 입력창의 실제 내용을 그대로 표시 (입력 순서대로)
  const displayText = getChatInputDisplayContent().trimEnd();

  window.displayUserMessage(displayText, img);
  window.showLoading();
  vscode.postMessage({
    command: "sendMessage",
    text: text,
    imageData: img,
    imageMimeType: imgMime,
    selectedFiles: files,
    terminalContext: terminalCtx,
    diagnosticsContext: diagnosticsCtx,
    mode,
  });
}

// 언어명 정규화 함수 (일반적인 별칭을 표준 언어명으로 변환)
function normalizeLanguage(lang) {
  if (!lang) {
    return null;
  }

  const langMap = {
    js: "javascript",
    jsx: "javascript",
    ts: "typescript",
    tsx: "typescript",
    py: "python",
    rb: "ruby",
    sh: "bash",
    yml: "yaml",
    md: "markdown",
    json: "json",
    html: "html",
    css: "css",
    scss: "scss",
    sass: "sass",
    less: "less",
    java: "java",
    c: "c",
    cpp: "cpp",
    cxx: "cpp",
    cc: "cpp",
    cs: "csharp",
    php: "php",
    go: "go",
    rs: "rust",
    swift: "swift",
    kt: "kotlin",
    scala: "scala",
    clj: "clojure",
    hs: "haskell",
    ml: "ocaml",
    fs: "fsharp",
    sql: "sql",
    xml: "xml",
    dockerfile: "dockerfile",
    makefile: "makefile",
    ini: "ini",
    toml: "toml",
    diff: "diff",
    patch: "diff",
    vue: "vue",
    svelte: "svelte",
    dart: "dart",
    r: "r",
    lua: "lua",
    perl: "perl",
    elixir: "elixir",
    erlang: "erlang",
    julia: "julia",
    matlab: "matlab",
    powershell: "powershell",
    ps1: "powershell",
    pwsh: "powershell",
    vb: "vbnet",
    vba: "vba",
    graphql: "graphql",
    protobuf: "protobuf",
    proto: "protobuf",
    thrift: "thrift",
    solidity: "solidity",
    sol: "solidity",
    terraform: "terraform",
    tf: "terraform",
  };

  const lowerLang = lang.toLowerCase();
  return langMap[lowerLang] || lowerLang;
}

// 동적 코드 하이라이팅 함수
function highlightCodeBlock(codeElement, language) {
  if (!window.hljs) {
    // highlight.js가 로드되지 않았으면 일반 텍스트로 표시
    return;
  }

  const normalizedLang = normalizeLanguage(language);

  if (normalizedLang && window.hljs.getLanguage(normalizedLang)) {
    // 언어를 인식한 경우
    codeElement.className = `language-${normalizedLang}`;
    try {
      window.hljs.highlightElement(codeElement);
    } catch (err) {
      console.warn("Syntax highlighting failed:", err);
    }
  } else {
    // 언어를 모르면 자동 감지
    codeElement.className = "";
    try {
      window.hljs.highlightElement(codeElement);
    } catch (err) {
      console.warn("Auto-detection highlighting failed:", err);
    }
  }
}

const md = markdownit({
  html: false,
  linkify: true,
  typographer: true,
});

// Container 플러그인 추가 (callout 지원)
md.use(markdownitContainer, "text", {
  validate: function (params) {
    return params.trim().match(/^text\s+(.*)$/);
  },
  render: function (tokens, idx) {
    const m = tokens[idx].info.trim().match(/^text\s+(.*)$/);
    if (tokens[idx].nesting === 1) {
      // opening tag
      return `<div class="callout callout-text">\n`;
    } else {
      // closing tag
      return `</div>\n`;
    }
  },
});

// 슬래시 명령어 카테고리 정의
const slashCategories = [
  { id: "git", label: "Git", description: "Git 리포지토리 관련 명령어" },
  { id: "session", label: "Session", description: "대화 세션 관리" },
  { id: "cache", label: "Cache", description: "캐시 관리" },
];

// 카테고리별 슬래시 명령어
const slashCommandsByCategory = {
  git: [
    { command: "/git status", label: "상태 보기", description: "현재 Git 리포지토리 상태 표시", action: "gitStatus" },
    { command: "/git diff", label: "변경사항", description: "스테이징 안된 변경사항 보기", action: "gitDiff" },
    { command: "/git log", label: "히스토리", description: "최근 커밋 히스토리 보기", action: "gitLog" },
    { command: "/git branch", label: "브랜치 목록", description: "로컬/원격 브랜치 목록 보기", action: "gitBranch" },
    { command: "/git info", label: "리포지토리 정보", description: "GitHub 리포지토리 정보 표시", action: "gitInfo" },
    { command: "/git staged", label: "스테이징 변경사항", description: "스테이징된 변경사항 보기", action: "gitStaged" },
    { command: "/git stash", label: "Stash 목록", description: "저장된 stash 목록 보기", action: "gitStash" },
  ],
  session: [
    { command: "/sessions", label: "세션 목록", description: "저장된 대화 세션 목록 보기", action: "listSavedSessions" },
    { command: "/restore", label: "세션 복원", description: "저장된 세션 복원하기", action: "restoreSavedSession" },
  ],
  cache: [
    { command: "/cache", label: "캐시 통계", description: "프로젝트 컨텍스트 캐시 통계 표시", action: "viewCacheStats" },
    { command: "/clear-cache", label: "캐시 초기화", description: "모든 컨텍스트 캐시 삭제", action: "clearCache" },
    { command: "/compact", label: "대화 압축", description: "현재 대화를 요약하여 토큰 절약", action: "compactConversation" },
  ],
};

// 모든 슬래시 명령어 목록 (하위 호환성)
const slashCommands = Object.values(slashCommandsByCategory).flat();

let slashMenuVisible = false;
let slashMenuSelectedIndex = 0;
let slashMenuMode = "categories"; // 'categories' 또는 'commands'
let selectedSlashCategory = null;

// '@' 파일 참조 메뉴 관련 변수
let atMenuVisible = false;
let atMenuSelectedIndex = 0;
let fileList = []; // 파일 목록 캐시
let atMenuMode = "categories"; // 'categories' 또는 'files'
let selectedCategory = null; // 선택된 카테고리

// '@' 메뉴 카테고리 정의
const atMenuCategories = [
  { id: "files", label: "Files", description: "프로젝트 파일 목록" },
  { id: "terminal", label: "Terminal", description: "터미널 히스토리 및 출력" },
  { id: "diagnostics", label: "Diagnostics", description: "에러 및 경고" },
];

// 선택된 터미널 컨텍스트 (단일 - 활성 터미널만 선택 가능)
let selectedTerminalContext = null;

// 선택된 진단(Diagnostics) 컨텍스트
let selectedDiagnosticsContext = null;

// 슬래시 메뉴 생성
function createSlashMenu() {
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

// '@' 파일 참조 메뉴 생성
function createAtMenu() {
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

// 슬래시 메뉴 렌더링
function renderSlashMenu(filter = "") {
  const menu = createSlashMenu();

  // 카테고리 모드
  if (slashMenuMode === "categories") {
    const filteredCategories = slashCategories.filter(
      (cat) =>
        cat.label.toLowerCase().includes(filter.toLowerCase()) ||
        cat.description.toLowerCase().includes(filter.toLowerCase()) ||
        cat.id.toLowerCase().includes(filter.toLowerCase()),
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
      `,
      )
      .join("");

    menu.querySelectorAll(".slash-category-item").forEach((item) => {
      item.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const categoryId = item.getAttribute("data-category");
        selectSlashCategory(categoryId);
      });
      item.addEventListener("mouseenter", () => {
        slashMenuSelectedIndex = parseInt(item.getAttribute("data-index"));
        renderSlashMenu(filter);
      });
    });
  } else {
    // 명령어 모드 (카테고리 선택 후)
    const commands = slashCommandsByCategory[selectedSlashCategory] || [];
    const filteredCommands = commands.filter(
      (cmd) =>
        cmd.command.toLowerCase().includes(filter.toLowerCase()) ||
        cmd.label.toLowerCase().includes(filter.toLowerCase()),
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
          <span style="font-size: 10px; color: var(--vscode-descriptionForeground);">뒤로 (카테고리 선택)</span>
      </div>
    `;

    menu.innerHTML = backButton + filteredCommands
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
      `,
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
        renderSlashMenu("");
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
        executeSlashCommand(action);
      });
      item.addEventListener("mouseenter", () => {
        slashMenuSelectedIndex = parseInt(item.getAttribute("data-index"));
        renderSlashMenu(filter);
      });
    });
  }

  // 선택된 항목이 보이도록 스크롤 이동
  const selectedItem = menu.querySelector(
    `[data-index="${slashMenuSelectedIndex}"]`,
  );
  if (selectedItem) {
    selectedItem.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  menu.style.display = "block";
  slashMenuVisible = true;
}

// 슬래시 카테고리 선택
function selectSlashCategory(categoryId) {
  selectedSlashCategory = categoryId;
  slashMenuMode = "commands";
  slashMenuSelectedIndex = 0;
  renderSlashMenu("");

  // 입력창에 카테고리 표시
  if (chatInput) {
    chatInput.textContent = `/${categoryId} `;
    setCursorToEnd(chatInput);
  }
}

// 슬래시 메뉴 숨기기
function hideSlashMenu() {
  const menu = document.getElementById("slash-command-menu");
  if (menu) {
    menu.style.display = "none";
  }
  slashMenuVisible = false;
  slashMenuSelectedIndex = 0;
  slashMenuMode = "categories";
  selectedSlashCategory = null;
}

// 슬래시 명령 실행
function executeSlashCommand(action) {
  hideSlashMenu();
  if (chatInput) {
    chatInput.textContent = "";
    autoResizeTextarea();
  }

  if (vscode) {
    vscode.postMessage({ command: "executeSlashCommand", action: action });
  }
}

// '@' 파일 참조 메뉴 렌더링
function renderAtMenu(filter = "") {
  const menu = createAtMenu();

  // 카테고리 모드
  if (atMenuMode === "categories") {
    const filteredCategories = atMenuCategories.filter(
      (cat) =>
        cat.label.toLowerCase().includes(filter.toLowerCase()) ||
        cat.description.toLowerCase().includes(filter.toLowerCase()),
    );

    if (filteredCategories.length === 0) {
      hideAtMenu();
      return;
    }

    menu.innerHTML = filteredCategories
      .map(
        (category, index) => `
            <div class="at-category-item ${index === atMenuSelectedIndex ? "selected" : ""}" 
                 data-index="${index}" data-category="${category.id}"
                 style="padding: 8px 12px; cursor: pointer; display: flex; flex-direction: column; gap: 2px; border-bottom: 1px solid var(--vscode-panel-border); ${index === atMenuSelectedIndex ? "background: rgba(128,128,128,0.2);" : ""}">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-weight: 500; font-size: 10px;">${category.label}</span>
                </div>
                <div style="font-size: 9px; color: var(--vscode-descriptionForeground);">${category.description}</div>
            </div>
        `,
      )
      .join("");

    menu.querySelectorAll(".at-category-item").forEach((item) => {
      item.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const categoryId = item.getAttribute("data-category");
        selectCategory(categoryId);
      });
      item.addEventListener("mouseenter", () => {
        atMenuSelectedIndex = parseInt(item.getAttribute("data-index"));
        renderAtMenu(filter);
      });
    });
  }
  // 파일 리스트 모드
  else if (atMenuMode === "files") {
    // 파일 목록이 로딩 중이면 로딩 표시
    if (fileList.length === 0) {
      menu.innerHTML =
        '<div style="padding: 12px; text-align: center; color: var(--vscode-descriptionForeground); font-size: 10px;">파일 목록 로딩 중...</div>';
      menu.style.display = "block";
      atMenuVisible = true;
      return;
    }

    const filteredFiles = fileList.filter(
      (file) =>
        file.name.toLowerCase().includes(filter.toLowerCase()) ||
        file.path.toLowerCase().includes(filter.toLowerCase()),
    );

    if (filteredFiles.length === 0) {
      hideAtMenu();
      return;
    }

    // 뒤로가기 버튼 추가 (상단 고정)
    const backButton = document.createElement("div");
    backButton.className = "at-back-item";
    backButton.style.cssText = `
            padding: 8px 12px;
            cursor: pointer;
            border-bottom: 1px solid var(--vscode-panel-border);
            background: rgba(128,128,128,0.1);
            position: sticky;
            top: 0;
            z-index: 10;
            backdrop-filter: blur(4px);
        `;
    backButton.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 10px;">←</span>
                <span style="font-weight: 500; font-size: 10px;">뒤로</span>
            </div>
        `;
    backButton.addEventListener("mousedown", (e) => {
      e.preventDefault();
      goBackToCategories();
    });
    backButton.addEventListener("mouseenter", () => {
      backButton.style.background = "rgba(128,128,128,0.2)";
    });
    backButton.addEventListener("mouseleave", () => {
      backButton.style.background = "rgba(128,128,128,0.1)";
    });
    menu.innerHTML = "";
    menu.appendChild(backButton);

    const filesHtml = filteredFiles
      .map((file, index) => {
        const isSelected = selectedFiles.some((f) => f.path === file.path);
        const isItemSelected = index === atMenuSelectedIndex;
        return `
            <div class="at-file-item ${isItemSelected ? "selected" : ""}" 
                 data-index="${index}" data-path="${file.path}" data-name="${file.name}"
                 style="padding: 8px 12px; cursor: pointer; display: flex; flex-direction: column; gap: 2px; border-bottom: 1px solid var(--vscode-panel-border); ${isItemSelected ? "background: rgba(128,128,128,0.2);" : ""} ${isSelected ? "opacity: 0.6;" : ""}">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span class="at-file-icon" data-filename="${file.name}" style="display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; flex-shrink: 0; box-sizing: border-box;"></span>
                    <span style="font-weight: 500; font-size: 10px;">${file.name}</span>
                    ${isSelected ? '<span style="color: var(--vscode-textLink-foreground); font-size: 9px;">(선택됨)</span>' : ""}
                </div>
                <div style="font-size: 9px; color: var(--vscode-descriptionForeground); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${file.path}</div>
            </div>
        `;
      })
      .join("");

    const filesContainer = document.createElement("div");
    filesContainer.innerHTML = filesHtml;
    menu.appendChild(filesContainer);

    // 각 파일 항목에 아이콘 추가 (파일 리스트용 작은 크기)
    filesContainer
      .querySelectorAll(".at-file-icon")
      .forEach((iconContainer) => {
        const fileName = iconContainer.getAttribute("data-filename");
        if (fileName) {
          loadFileIcon(fileName, iconContainer, "", 16);
        }
      });

    menu.querySelectorAll(".at-file-item").forEach((item) => {
      item.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const filePath = item.getAttribute("data-path");
        const fileName = item.getAttribute("data-name");
        selectFileFromAtMenu(filePath, fileName);
      });
      item.addEventListener("mouseenter", () => {
        atMenuSelectedIndex = parseInt(item.getAttribute("data-index"));
        renderAtMenu(filter);
      });
    });
  }

  // 참고: 터미널은 이제 selectCategory에서 바로 활성 터미널 컨텍스트를 요청함 (Continue IDE 방식)
  // atMenuMode === "terminal" 케이스는 더 이상 여기에서 렌더링되지 않음

  // 선택된 항목이 보이도록 스크롤 이동
  if (atMenuMode === "files") {
    const selectedItem = menu.querySelector(
      `.at-file-item[data-index="${atMenuSelectedIndex}"]`,
    );
    if (selectedItem) {
      selectedItem.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  } else {
    const selectedItem = menu.querySelector(
      `.at-category-item[data-index="${atMenuSelectedIndex}"]`,
    );
    if (selectedItem) {
      selectedItem.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  menu.style.display = "block";
  atMenuVisible = true;
}

// 카테고리 선택
function selectCategory(categoryId) {
  selectedCategory = categoryId;
  atMenuSelectedIndex = 0;

  if (categoryId === "files") {
    atMenuMode = "files";
    // 파일 목록 항상 새로 요청 (실시간 업데이트)
    if (vscode) {
      fileList = []; // 캐시 초기화
      vscode.postMessage({ command: "requestFileList" });
    }
  } else if (categoryId === "terminal") {
    // Terminal은 활성 터미널의 내용을 바로 가져옴 (Continue IDE 방식)
    if (vscode) {
      vscode.postMessage({ command: "requestTerminalContext" });
    }
    hideAtMenu();
    chatInput.focus();
    return; // 메뉴 렌더링 건너뛰기
  } else if (categoryId === "diagnostics") {
    // Diagnostics는 바로 컨텍스트 요청 (목록 없이 전체 진단 정보)
    if (vscode) {
      vscode.postMessage({ command: "requestDiagnosticsContext" });
    }
    hideAtMenu();
    chatInput.focus();
    return; // 메뉴 렌더링 건너뛰기
  }

  // 입력창 업데이트: '@' 뒤에 카테고리명 추가
  if (chatInput) {
    const currentValue = getChatInputValue();
    const atIndex = currentValue.lastIndexOf("@");
    if (atIndex !== -1) {
      const category = atMenuCategories.find((c) => c.id === categoryId);
      const beforeAt = currentValue.substring(0, atIndex + 1);
      const newValue = beforeAt + category.label.toLowerCase() + " ";
      chatInput.textContent = newValue;
      autoResizeTextarea();
      chatInput.focus();
    }
  }

  renderAtMenu("");
}

// 카테고리로 돌아가기
function goBackToCategories() {
  atMenuMode = "categories";
  selectedCategory = null;
  atMenuSelectedIndex = 0;

  // 입력창 업데이트: '@'만 남기기
  if (chatInput) {
    const currentValue = getChatInputValue();
    const atIndex = currentValue.lastIndexOf("@");
    if (atIndex !== -1) {
      const beforeAt = currentValue.substring(0, atIndex + 1);
      chatInput.textContent = beforeAt;
      autoResizeTextarea();
      chatInput.focus();
    }
  }

  renderAtMenu("");
}

// 전역으로 노출
window.goBackToCategories = goBackToCategories;

// '@' 파일 참조 메뉴 숨기기
function hideAtMenu() {
  const menu = document.getElementById("at-file-menu");
  if (menu) {
    menu.style.display = "none";
  }
  atMenuVisible = false;
  atMenuSelectedIndex = 0;
  atMenuMode = "categories";
  selectedCategory = null;
}

// '@' 메뉴에서 파일 선택
function selectFileFromAtMenu(filePath, fileName) {
  // 중복 파일 체크
  if (selectedFiles.some((file) => file.path === filePath)) {
    console.log("File already selected:", filePath);
    hideAtMenu();
    chatInput.focus();
    return;
  }

  // selectedFiles에 추가 (insertFileMention은 여기서 직접 호출)
  selectedFiles.push({ path: filePath, name: fileName });
  hideAtMenu();

  // 파일 멘션 블록 삽입 ('@' 기호 제거)
  insertFileMention(fileName, filePath, true);
  chatInput.focus();
}

// 메시지 전송 로직 (기존 코드 유지 - 절대 수정 금지 영역)
if (sendButton && chatInput) {
  sendButton.addEventListener("click", handleSendMessage);

  chatInput.addEventListener("keydown", function (e) {
    // '@' 메뉴가 열려있을 때 키보드 네비게이션
    if (atMenuVisible) {
      const currentValue = getChatInputValue();
      const atIndex = currentValue.lastIndexOf("@");
      const afterAt = atIndex !== -1 ? currentValue.substring(atIndex + 1) : "";

      // 카테고리 모드
      if (atMenuMode === "categories") {
        const filter = afterAt.trim();
        const filteredCategories = atMenuCategories.filter(
          (cat) =>
            cat.label.toLowerCase().includes(filter.toLowerCase()) ||
            cat.description.toLowerCase().includes(filter.toLowerCase()),
        );

        if (e.key === "ArrowDown") {
          e.preventDefault();
          atMenuSelectedIndex = Math.min(
            atMenuSelectedIndex + 1,
            filteredCategories.length - 1,
          );
          renderAtMenu(filter);
          setTimeout(() => {
            const menu = document.getElementById("at-file-menu");
            const selectedItem = menu?.querySelector(
              `.at-category-item[data-index="${atMenuSelectedIndex}"]`,
            );
            if (selectedItem) {
              selectedItem.scrollIntoView({
                behavior: "smooth",
                block: "nearest",
              });
            }
          }, 0);
          return;
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          atMenuSelectedIndex = Math.max(atMenuSelectedIndex - 1, 0);
          renderAtMenu(filter);
          setTimeout(() => {
            const menu = document.getElementById("at-file-menu");
            const selectedItem = menu?.querySelector(
              `.at-category-item[data-index="${atMenuSelectedIndex}"]`,
            );
            if (selectedItem) {
              selectedItem.scrollIntoView({
                behavior: "smooth",
                block: "nearest",
              });
            }
          }, 0);
          return;
        } else if (e.key === "Enter") {
          e.preventDefault();
          if (filteredCategories[atMenuSelectedIndex]) {
            selectCategory(filteredCategories[atMenuSelectedIndex].id);
          }
          return;
        } else if (e.key === "Escape") {
          e.preventDefault();
          hideAtMenu();
          return;
        }
      }
      // 파일 리스트 모드
      else if (atMenuMode === "files") {
        // 뒤로가기: Escape 키
        if (e.key === "Escape") {
          e.preventDefault();
          goBackToCategories();
          return;
        }

        // 파일명 필터링
        const parts = afterAt.split(/\s+/);
        const filter = parts.length > 1 ? parts.slice(1).join(" ") : "";
        const filteredFiles = fileList.filter(
          (file) =>
            file.name.toLowerCase().includes(filter.toLowerCase()) ||
            file.path.toLowerCase().includes(filter.toLowerCase()),
        );

        if (e.key === "ArrowDown") {
          e.preventDefault();
          // 파일 리스트만 탐색 (0부터 시작)
          atMenuSelectedIndex = Math.min(
            atMenuSelectedIndex + 1,
            filteredFiles.length - 1,
          );
          renderAtMenu(filter);
          setTimeout(() => {
            const menu = document.getElementById("at-file-menu");
            const selectedItem = menu?.querySelector(
              `.at-file-item[data-index="${atMenuSelectedIndex}"]`,
            );
            if (selectedItem) {
              selectedItem.scrollIntoView({
                behavior: "smooth",
                block: "nearest",
              });
            }
          }, 0);
          return;
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          // 파일 리스트만 탐색 (최소 0)
          atMenuSelectedIndex = Math.max(atMenuSelectedIndex - 1, 0);
          renderAtMenu(filter);
          setTimeout(() => {
            const menu = document.getElementById("at-file-menu");
            const selectedItem = menu?.querySelector(
              `.at-file-item[data-index="${atMenuSelectedIndex}"]`,
            );
            if (selectedItem) {
              selectedItem.scrollIntoView({
                behavior: "smooth",
                block: "nearest",
              });
            }
          }, 0);
          return;
        } else if (e.key === "Enter") {
          e.preventDefault();
          if (filteredFiles[atMenuSelectedIndex]) {
            const file = filteredFiles[atMenuSelectedIndex];
            selectFileFromAtMenu(file.path, file.name);
          }
          return;
        }
      }
      // 참고: 터미널은 이제 selectCategory에서 바로 활성 터미널 컨텍스트를 요청함 (Continue IDE 방식)
      // 터미널 리스트 키보드 네비게이션 코드는 더 이상 필요하지 않음
    }

    // 슬래시 메뉴가 열려있을 때 키보드 네비게이션
    if (slashMenuVisible) {
      // 카테고리 모드인지 명령어 모드인지에 따라 다르게 처리
      if (slashMenuMode === "categories") {
        const filteredCategories = slashCategories.filter(
          (cat) =>
            cat.label.toLowerCase().includes(getChatInputValue().slice(1).toLowerCase()) ||
            cat.id.toLowerCase().includes(getChatInputValue().slice(1).toLowerCase()),
        );

        if (e.key === "ArrowDown") {
          e.preventDefault();
          slashMenuSelectedIndex = Math.min(
            slashMenuSelectedIndex + 1,
            filteredCategories.length - 1,
          );
          renderSlashMenu(getChatInputValue().slice(1));
          return;
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          slashMenuSelectedIndex = Math.max(slashMenuSelectedIndex - 1, 0);
          renderSlashMenu(getChatInputValue().slice(1));
          return;
        } else if (e.key === "Enter") {
          e.preventDefault();
          if (filteredCategories[slashMenuSelectedIndex]) {
            selectSlashCategory(filteredCategories[slashMenuSelectedIndex].id);
          }
          return;
        } else if (e.key === "Escape") {
          e.preventDefault();
          hideSlashMenu();
          return;
        }
      } else {
        // 명령어 모드
        const commands = slashCommandsByCategory[selectedSlashCategory] || [];
        // 입력값에서 카테고리 부분 제거하여 필터 생성 (예: "/git commit" -> "commit")
        const inputValue = getChatInputValue();
        const categoryPrefix = `/${selectedSlashCategory} `;
        const commandFilter = inputValue.startsWith(categoryPrefix)
          ? inputValue.slice(categoryPrefix.length).trim()
          : "";
        const filteredCommands = commands.filter((cmd) =>
          cmd.command.toLowerCase().includes(commandFilter.toLowerCase()) ||
          cmd.label.toLowerCase().includes(commandFilter.toLowerCase()),
        );

        if (e.key === "ArrowDown") {
          e.preventDefault();
          slashMenuSelectedIndex = Math.min(
            slashMenuSelectedIndex + 1,
            filteredCommands.length - 1,
          );
          renderSlashMenu(commandFilter);
          return;
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          slashMenuSelectedIndex = Math.max(slashMenuSelectedIndex - 1, 0);
          renderSlashMenu(commandFilter);
          return;
        } else if (e.key === "Enter") {
          e.preventDefault();
          if (filteredCommands[slashMenuSelectedIndex]) {
            executeSlashCommand(filteredCommands[slashMenuSelectedIndex].action);
          }
          return;
        } else if (e.key === "Escape") {
          e.preventDefault();
          // 뒤로가기 (카테고리 모드로)
          slashMenuMode = "categories";
          selectedSlashCategory = null;
          slashMenuSelectedIndex = 0;
          renderSlashMenu("");
          if (chatInput) {
            chatInput.textContent = "/";
            setCursorToEnd(chatInput);
          }
          return;
        }
      }
    }

    // 백스페이스로 파일/터미널 멘션 블록 삭제
    if (e.key === "Backspace") {
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const node = range.startContainer;

        // 커서가 멘션 블록 바로 앞에 있는지 확인
        if (node.nodeType === Node.TEXT_NODE && range.startOffset === 0) {
          const prevSibling = node.previousSibling;
          if (prevSibling && prevSibling.classList) {
            // 파일 멘션 블록 삭제
            if (prevSibling.classList.contains("file-mention")) {
              e.preventDefault();
              const filePath = prevSibling.getAttribute("data-file-path");
              if (filePath) {
                removeSelectedFile(filePath);
              }
              prevSibling.remove();
              autoResizeTextarea();
              return;
            }
            // 터미널 멘션 블록 삭제
            if (prevSibling.classList.contains("terminal-mention")) {
              e.preventDefault();
              selectedTerminalContext = null;
              prevSibling.remove();
              autoResizeTextarea();
              return;
            }
          }
        }

        // 커서가 멘션 블록 내부에 있는지 확인
        let currentNode = node;
        while (currentNode && currentNode !== chatInput) {
          if (currentNode.classList) {
            // 파일 멘션 블록 내부
            if (currentNode.classList.contains("file-mention")) {
              e.preventDefault();
              const filePath = currentNode.getAttribute("data-file-path");
              if (filePath) {
                removeSelectedFile(filePath);
              }
              currentNode.remove();
              autoResizeTextarea();
              return;
            }
            // 터미널 멘션 블록 내부
            if (currentNode.classList.contains("terminal-mention")) {
              e.preventDefault();
              selectedTerminalContext = null;
              currentNode.remove();
              autoResizeTextarea();
              return;
            }
          }
          currentNode = currentNode.parentNode;
        }
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      setTimeout(() => {
        handleSendMessage();
      }, 0);
    }
  });

  chatInput.addEventListener("input", function (e) {
    autoResizeTextarea();

    // 브라우저가 멘션 스팬을 텍스트로 변환했을 수 있으므로 먼저 복원 시도
    // '@' 메뉴가 열려있을 때도 복원은 수행 (타이핑 중 변환된 멘션 복구)
    restoreMentionsFromText();

    // 멘션 블록이 DOM에서 삭제되었는지 확인하고 selectedFiles/selectedTerminalContext 동기화
    // '@' 메뉴가 열려있을 때는 동기화하지 않음 (멘션 삽입 중일 수 있으므로)
    if (!atMenuVisible) {
      syncMentionsWithDOM();
    }

    const value = getChatInputValue();
    const lastAtIndex = value.lastIndexOf("@");
    const lastSlashIndex = value.lastIndexOf("/");

    // '@' 입력 감지 (가장 마지막 '@' 이후에 스페이스가 없을 때만)
    if (
      lastAtIndex !== -1 &&
      (lastSlashIndex === -1 || lastAtIndex > lastSlashIndex)
    ) {
      const afterAt = value.substring(lastAtIndex + 1);
      const parts = afterAt.trim().split(/\s+/);

      // 카테고리 모드인지 파일 모드인지 확인
      if (parts.length === 0 || (parts.length === 1 && parts[0] === "")) {
        // 카테고리 모드
        atMenuMode = "categories";
        atMenuSelectedIndex = 0;
        renderAtMenu("");
        hideSlashMenu();
      } else {
        // 카테고리명 확인
        const firstPart = parts[0].toLowerCase();
        const category = atMenuCategories.find(
          (c) => c.label.toLowerCase() === firstPart || c.id === firstPart,
        );

        if (category) {
          // 카테고리에 따라 모드 설정
          const targetMode = category.id === "terminal" ? "terminal" : "files";
          if (atMenuMode !== targetMode || selectedCategory !== category.id) {
            atMenuMode = targetMode;
            selectedCategory = category.id;
            atMenuSelectedIndex = 0;
            // 터미널 모드면 터미널 목록 요청
            if (targetMode === "terminal" && vscode) {
              vscode.postMessage({ command: "requestTerminalList" });
            }
          }
          const filter = parts.length > 1 ? parts.slice(1).join(" ") : "";
          renderAtMenu(filter);
          hideSlashMenu();
        } else if (!afterAt.includes("\n")) {
          // 아직 카테고리 선택 전
          atMenuMode = "categories";
          atMenuSelectedIndex = 0;
          renderAtMenu(afterAt.trim());
          hideSlashMenu();
        } else {
          hideAtMenu();
        }
      }
    } else {
      hideAtMenu();
    }

    // / 로 시작하고 스페이스가 없을 때만 슬래시 메뉴 표시
    if (
      value.startsWith("/") &&
      !value.includes(" ") &&
      (lastAtIndex === -1 || lastSlashIndex > lastAtIndex)
    ) {
      const filter = value.slice(1);
      slashMenuSelectedIndex = 0;
      renderSlashMenu(filter);
      hideAtMenu(); // '@' 메뉴는 숨기기
    } else if (
      !value.startsWith("/") ||
      (lastAtIndex !== -1 && lastAtIndex > lastSlashIndex)
    ) {
      hideSlashMenu();
    }
  });

  chatInput.addEventListener("paste", handlePaste); // 붙여넣기 이벤트 리스너 추가

  // 포커스 아웃 시 메뉴 숨기기 (약간의 딜레이)
  chatInput.addEventListener("blur", function () {
    setTimeout(() => {
      hideSlashMenu();
      hideAtMenu();
    }, 150);
  });

  // 다른 곳 클릭 시 메뉴 숨기기
  document.addEventListener("click", function (e) {
    const slashMenu = document.getElementById("slash-command-menu");
    const atMenu = document.getElementById("at-file-menu");
    if (
      slashMenuVisible &&
      slashMenu &&
      !slashMenu.contains(e.target) &&
      e.target !== chatInput
    ) {
      hideSlashMenu();
    }
    if (
      atMenuVisible &&
      atMenu &&
      !atMenu.contains(e.target) &&
      e.target !== chatInput
    ) {
      hideAtMenu();
    }
  });
}

// Clear History 버튼 클릭 이벤트 리스너
if (clearHistoryButton) {
  clearHistoryButton.addEventListener("click", handleClearHistory);
}

// Cancel 버튼 클릭 이벤트 리스너
if (cancelButton) {
  cancelButton.addEventListener("click", () => {
    console.log("Cancel button clicked. Sending cancel command to extension.");
    vscode.postMessage({ command: "cancelGeminiCall" }); // 확장 프로그램으로 취소 명령 전송
    window.hideLoading(); // 로딩 애니메이션은 즉시 숨김
  });
}

// 이미지 제거 버튼 클릭 이벤트 리스너
if (removeImageButton) {
  removeImageButton.addEventListener("click", removeAttachedImage);
}

// 파일 선택 관련 이벤트 리스너들
if (filePickerButton) {
  filePickerButton.addEventListener("click", openFilePicker);
}

// clearFilesButton은 더 이상 사용하지 않음 (입력창에 블록으로 표시)
// if (clearFilesButton) {
//     clearFilesButton.addEventListener("click", clearAllSelectedFiles);
// }

function handlePaste(event) {
  const clipboardData =
    event.clipboardData || event.originalEvent.clipboardData;
  const items = clipboardData.items;
  let imageFound = false;

  // 1. 이미지 파일 처리
  for (const item of items) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          selectedImageBase64 = e.target.result.split(",")[1]; // Get base64 string without data:image/...
          selectedImageMimeType = file.type;

          imagePreview.src = e.target.result;
          imagePreviewContainer.classList.remove("hidden");
          autoResizeTextarea(); // 썸네일 추가 후 입력창 높이 재조정
          chatInput.focus();

          // 이미지 추가 후 패딩 업데이트
          setTimeout(() => {
            updateChatContainerPadding();
          }, 0);
        };
        reader.readAsDataURL(file);
        imageFound = true;
        break; // 한 개의 이미지만 처리
      }
    }
  }

  if (imageFound) {
    event.preventDefault(); // 이미지가 붙여넣어졌으면 기본 텍스트 붙여넣기 방지
    return;
  }

  // 2. 텍스트 붙여넣기: HTML 서식 제거하고 plain text만 삽입
  // contenteditable에 직접 HTML이 들어가는 것을 방지 (색상, 폰트 등 제거)
  const plainText = clipboardData.getData("text/plain");
  if (plainText) {
    event.preventDefault();

    // 현재 선택 영역에 plain text 삽입
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      range.deleteContents();

      // 텍스트 노드로 삽입 (HTML 태그 방지)
      const textNode = document.createTextNode(plainText);
      range.insertNode(textNode);

      // 커서를 삽입된 텍스트 뒤로 이동
      range.setStartAfter(textNode);
      range.setEndAfter(textNode);
      selection.removeAllRanges();
      selection.addRange(range);
    }

    // 입력 이벤트 발생시켜 자동 높이 조절 등 트리거
    chatInput.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

function removeAttachedImage() {
  selectedImageBase64 = null;
  selectedImageMimeType = null;
  imagePreview.src = "#";
  imagePreviewContainer.classList.add("hidden");
  autoResizeTextarea(); // 썸네일 제거 후 입력창 높이 재조정
  chatInput.focus();

  // 이미지 제거 후 패딩 업데이트
  setTimeout(() => {
    updateChatContainerPadding();
  }, 0);
}

function handleSendMessage() {
  if (!chatInput) {
    return;
  }
  const text = getChatInputText().trimEnd(); // 파일 멘션 제외하고 텍스트만 추출
  if (
    text ||
    selectedImageBase64 ||
    selectedFiles.length > 0 ||
    selectedTerminalContext ||
    selectedDiagnosticsContext
  ) {
    // 텍스트, 이미지, 선택된 파일, 터미널 컨텍스트, 또는 Diagnostics 컨텍스트가 있을 때만 전송
    const payload = {
      id: generateId(),
      text: text,
      imageData: selectedImageBase64,
      imageMimeType: selectedImageMimeType,
      selectedFiles: selectedFiles.map((file) => file.path),
      terminalContext: selectedTerminalContext ? selectedTerminalContext.contextString : null,
      diagnosticsContext: selectedDiagnosticsContext
        ? selectedDiagnosticsContext.contextString
        : null,
      mode: currentMode,
    };

    if (loadingDepth > 0) {
      // AI 응답 대기 중: 채팅창에 먼저 출력하고, 큐에 적재(전송은 응답 후)
      // 채팅 패널에 표시할 내용 (파일 멘션 포함)
      const displayText = getChatInputDisplayContent().trimEnd();
      window.displayUserMessage(displayText, selectedImageBase64);
      enqueuePendingQuestion(payload);
    } else {
      // 즉시 전송 (doSendUserMessage 내부에서 파일 멘션 포함해서 표시)
      doSendUserMessage(payload);
    }

    chatInput.textContent = "";
    chatInput.style.height = "auto";
    removeAttachedImage(); // 이미지 전송 후 썸네일 제거
    // 선택된 파일들 초기화 (입력창의 파일 멘션 블록은 이미 textContent = ""로 제거됨)
    selectedFiles = [];
    // 터미널 컨텍스트 초기화
    selectedTerminalContext = null;
    // Diagnostics 컨텍스트 초기화
    selectedDiagnosticsContext = null;
    autoResizeTextarea();
    chatInput.focus();
    // 스크롤은 showLoading 시 처리됨
  }
}

// thinking 애니메이션으로 스크롤하는 함수 (여러 번 시도)
function scrollToThinkingAnimation() {
  let attempts = 0;
  const maxAttempts = 10;

  const attemptScroll = () => {
    attempts++;
    if (thinkingBubbleElement) {
      thinkingBubbleElement.scrollIntoView({
        behavior: "smooth",
        block: "end", // 애니메이션을 화면 하단에 위치시킴
        inline: "nearest",
      });
      return true; // 성공
    } else if (attempts < maxAttempts) {
      // 아직 thinkingBubbleElement가 생성되지 않았으면 다시 시도
      setTimeout(attemptScroll, 50);
      return false; // 아직 시도 중
    } else {
      // 최대 시도 횟수 초과 시 fallback
      if (chatMessages) {
        chatMessages.scrollTop = chatMessages.scrollHeight;
      }
      return false; // 실패
    }
  };

  // 즉시 첫 번째 시도
  if (!attemptScroll()) {
    // 첫 번째 시도가 실패하면 50ms 후 다시 시도
    setTimeout(attemptScroll, 50);
  }
}

function autoResizeTextarea() {
  if (!chatInput) {
    return;
  }
  chatInput.style.height = "auto";
  const computedStyle = getComputedStyle(chatInput);
  const minHeight = parseInt(computedStyle.minHeight, 10);
  const maxHeight = parseInt(computedStyle.maxHeight, 10);
  const adjustedHeight = Math.max(
    minHeight,
    Math.min(chatInput.scrollHeight, maxHeight),
  );
  chatInput.style.height = adjustedHeight + "px";

  // 입력창 높이가 변경되면 하단 고정 영역 높이도 재계산
  updateChatContainerPadding();
}

function requestOllamaModels() {
  if (vscode) {
    vscode.postMessage({ command: "getOllamaModels" });
  }
}

function setModelLabel(name, modelType) {
  if (modelLabel) {
    modelLabel.textContent = name || "Model";
  }
  // 모델 타입에 따라 버튼의 data-model-type 속성 설정 (색상 포인트용)
  if (modelSelectorButton) {
    if (modelType === "gemini") {
      modelSelectorButton.setAttribute("data-model-type", "gemini");
    } else if (modelType === "banya") {
      modelSelectorButton.setAttribute("data-model-type", "banya");
    } else {
      modelSelectorButton.setAttribute("data-model-type", "ollama");
    }
  }
}

function populateModelDropdown(models, current) {
  // Gemini 모델 정의
  const geminiModels = [
    { name: "gemini-3-pro-preview", displayName: "Gemini 3.0 Pro" },
    { name: "gemini-3-flash-preview", displayName: "Gemini 3.0 Flash" },
  ];

  // Banya 모델 정의
  const banyaModels = [
    { name: "Banya Solar:100b", displayName: "Banya Solar 100B" },
    { name: "Banya Qwen-Coder:32b", displayName: "Banya Qwen-Coder 32B" },
  ];

  // models: [{name, displayName}] 또는 ["name", ...]
  availableOllamaModels = (models || [])
    .map((m) => {
      if (typeof m === "string") {
        return { name: m, displayName: m };
      }
      return {
        name: m?.name || "",
        displayName: m?.displayName || m?.name || "",
      };
    })
    .filter((m) => m.name);

  currentOllamaModel = current || "";

  if (!modelDropdown) {
    return;
  }
  modelDropdown.innerHTML = "";

  // Gemini 모델 먼저 추가
  geminiModels.forEach((m) => {
    const item = document.createElement("div");
    item.className = "dropdown-option";
    if (m.name === currentOllamaModel) {
      item.classList.add("selected");
    }
    item.dataset.model = m.name;
    item.textContent = m.displayName;
    item.style.padding = "4px 8px";
    item.style.cursor = "pointer";
    item.style.fontSize = "10px";
    item.style.borderRadius = "4px";
    item.addEventListener("click", () => {
      currentOllamaModel = m.name;
      setModelLabel(m.displayName, "gemini");
      if (modelDropdown) {
        modelDropdown.classList.add("hidden");
        modelDropdown.style.display = "none";
      }
      vscode.postMessage({ command: "setGeminiModel", model: m.name });
    });
    modelDropdown.appendChild(item);
  });

  // Gemini와 Banya 사이 구분선
  if (banyaModels.length > 0) {
    const divider = document.createElement("div");
    divider.style.height = "1px";
    divider.style.backgroundColor = "var(--vscode-panel-border)";
    divider.style.margin = "4px 0";
    modelDropdown.appendChild(divider);
  }

  // Banya 모델 추가
  banyaModels.forEach((m) => {
    const item = document.createElement("div");
    item.className = "dropdown-option";
    if (m.name === currentOllamaModel) {
      item.classList.add("selected");
    }
    item.dataset.model = m.name;
    item.textContent = m.displayName;
    item.style.padding = "4px 8px";
    item.style.cursor = "pointer";
    item.style.fontSize = "10px";
    item.style.borderRadius = "4px";
    item.addEventListener("click", () => {
      currentOllamaModel = m.name;
      setModelLabel(m.displayName, "banya");
      if (modelDropdown) {
        modelDropdown.classList.add("hidden");
        modelDropdown.style.display = "none";
      }
      vscode.postMessage({ command: "setBanyaModel", model: m.name });
    });
    modelDropdown.appendChild(item);
  });

  // 구분선 (Ollama 모델이 있을 경우에만)
  if (availableOllamaModels.length > 0) {
    const divider = document.createElement("div");
    divider.style.height = "1px";
    divider.style.backgroundColor = "var(--vscode-panel-border)";
    divider.style.margin = "4px 0";
    modelDropdown.appendChild(divider);
  }

  // Ollama 모델 추가
  availableOllamaModels.forEach((m) => {
    const display = m.displayName || m.name;
    const item = document.createElement("div");
    item.className = "dropdown-option";
    if (m.name === currentOllamaModel) {
      item.classList.add("selected");
    }
    item.dataset.model = m.name;
    item.textContent = display;
    item.style.padding = "4px 8px";
    item.style.cursor = "pointer";
    item.style.fontSize = "10px";
    item.style.borderRadius = "4px";
    item.addEventListener("click", () => {
      currentOllamaModel = m.name;
      setModelLabel(display, "ollama");
      if (modelDropdown) {
        modelDropdown.classList.add("hidden");
        modelDropdown.style.display = "none";
      }
      vscode.postMessage({ command: "setOllamaModel", model: m.name });
    });
    modelDropdown.appendChild(item);
  });

  // 현재 선택된 모델 라벨 업데이트
  const allModels = [...geminiModels, ...banyaModels, ...availableOllamaModels];
  const currentModel = allModels.find((m) => m.name === currentOllamaModel);
  const currentDisplay =
    currentModel?.displayName || currentOllamaModel || "Model";

  let modelType = "ollama";
  if (geminiModels.some((m) => m.name === currentOllamaModel)) {
    modelType = "gemini";
  } else if (banyaModels.some((m) => m.name === currentOllamaModel)) {
    modelType = "banya";
  }

  setModelLabel(currentDisplay, modelType);

  if (!allModels.length) {
    const empty = document.createElement("div");
    empty.className = "dropdown-option";
    empty.textContent = "모델을 불러올 수 없습니다";
    empty.style.padding = "6px 10px";
    modelDropdown.appendChild(empty);
  }
}

function bindModelDropdownEvents() {
  if (!modelSelectorButton || !modelDropdown) {
    return;
  }

  const closeDropdown = () => {
    modelDropdown.classList.add("hidden");
    modelDropdown.style.display = "none";
  };

  modelSelectorButton.addEventListener("click", (e) => {
    e.stopPropagation();
    const willShow = modelDropdown.classList.contains("hidden");
    if (willShow) {
      // 모델 선택 버튼의 위치에 맞춰 드롭다운 위치 조정
      const buttonRect = modelSelectorButton.getBoundingClientRect();
      const parentRect =
        modelSelectorButton.parentElement.getBoundingClientRect();

      // 버튼의 왼쪽 위치를 기준으로 드롭다운 위치 설정
      const leftOffset = buttonRect.left - parentRect.left;
      modelDropdown.style.left = leftOffset + "px";
      modelDropdown.style.right = "auto";
      modelDropdown.style.width = buttonRect.width + "px";

      modelDropdown.classList.remove("hidden");
      modelDropdown.style.display = "block";
    } else {
      closeDropdown();
    }
  });

  document.addEventListener("click", (e) => {
    if (!modelDropdown.contains(e.target) && e.target !== modelSelectorButton) {
      closeDropdown();
    }
  });
}

// 모드 변경 이벤트 수신
window.addEventListener("chat-mode-changed", () => {
  currentMode = window.chatMode || "CODE";
});

// 하단 고정 영역의 높이를 계산하고 채팅 컨테이너의 패딩을 조정하는 함수
function updateChatContainerPadding() {
  if (!chatContainer) {
    return;
  }

  // 하단 고정 영역의 요소들
  const bottomFixedArea = document.querySelector(".bottom-fixed-area");
  const fileSelectionArea = document.getElementById("file-selection-area");
  const chatInputArea = document.getElementById("chat-input-area");
  const pendingArea = document.getElementById("pending-queue-area");

  if (!bottomFixedArea || !chatInputArea) {
    return;
  }

  // 파일 선택 영역의 높이 (숨겨져 있으면 0)
  const fileSelectionHeight =
    fileSelectionArea && !fileSelectionArea.classList.contains("hidden")
      ? fileSelectionArea.offsetHeight
      : 0;

  // 대기 큐 영역의 높이 (보이지 않으면 0)
  let pendingHeight = 0;
  if (pendingArea) {
    const isVisible = pendingArea.classList.contains("visible");
    pendingHeight = isVisible ? pendingArea.offsetHeight : 0;
  }

  // 입력 영역의 높이
  const chatInputHeight = chatInputArea.offsetHeight;

  // 전체 하단 고정 영역 높이 계산 (여유 공간 포함)
  const totalBottomHeight =
    pendingHeight + fileSelectionHeight + chatInputHeight + 20; // 20px 여유 공간

  // 채팅 컨테이너의 하단 패딩을 동적으로 설정
  chatContainer.style.paddingBottom = `${totalBottomHeight}px`;

  // console.log(`Bottom area height: ${totalBottomHeight}px (pending: ${pendingHeight}px, file: ${fileSelectionHeight}px, input: ${chatInputHeight}px)`);
}

document.addEventListener("DOMContentLoaded", () => {
  if (chatInput) {
    autoResizeTextarea();
    // MutationObserver 설정 (멘션 복원용)
    setupMentionObserver();
  }
  // 초기 로드 시 Cancel 버튼 비활성화
  if (cancelButton) {
    cancelButton.disabled = true;
  }
  // 이미지 프리뷰 초기 숨김
  if (imagePreviewContainer) {
    imagePreviewContainer.classList.add("hidden");
  }

  // 초기 채팅 컨테이너 패딩 설정
  setTimeout(() => {
    updateChatContainerPadding();
  }, 100); // DOM이 완전히 로드된 후 실행

  // 스크롤 이벤트 리스너 등록 (버블 고정용)
  if (chatContainer) {
    chatContainer.addEventListener("scroll", handleScroll);
  }

  // 모델 목록 요청 및 드롭다운 초기화
  bindModelDropdownEvents();
  requestOllamaModels();
});

window.addEventListener("message", (event) => {
  const message = event.data;

  switch (message.command) {
    case "priorityErrorPrompt":
      // 확장 측에서 파일 작업/터미널 에러 우선 처리 요청 → 확장으로 전달하여 즉시 LLM 호출
      if (typeof message.text === "string" && message.text.trim().length > 0) {
        vscode.postMessage({
          command: "priorityErrorPrompt",
          text: message.text,
        });
      }
      break;
    case "showLoading":
      console.log("Received showLoading command.");
      loadingDepth++;
      window.showLoading();
      resetProcessingStatuses();
      setProcessingStep("intent");
      break;
    case "hideLoading":
      console.log("Received hideLoading command.");
      if (loadingDepth > 0) {
        loadingDepth--;
      }
      window.hideLoading();
      // 약간의 지연 후, 에러 우선 처리(showLoading 재등장) 기회를 준 뒤 큐 전송
      setTimeout(() => {
        if (loadingDepth === 0) {
          sendNextQueuedQuestionIfIdle();
        }
      }, 200);
      break;
    case "setProcessingStep":
      if (message.step) {
        setProcessingStep(message.step);
      }
      break;
    case "updateProcessingStatus":
      if (message.step && message.status) {
        updateProcessingStatus(message.step, message.status);

        // Auto Correcting Indicator 표시/숨김
        if (message.step === "error_correction") {
          if (
            message.status.includes("자동 오류 수정") ||
            message.status.includes("오류 수정")
          ) {
            showAutoCorrectingIndicator();
          } else if (
            message.status.includes("완료") ||
            message.status.includes("실패")
          ) {
            hideAutoCorrectingIndicator();
          }
        }
      }
      break;
    case "showGitInfo":
      if (message.content) {
        showGitRepositoryInfo(message.content);
      }
      break;
    case "showErrorCorrection":
      console.log("Received error correction message:", message);
      showErrorCorrection(
        message.originalCommand,
        message.correctedCommand,
        message.retryCount,
      );
      break;
    case "displayUserMessage":
      console.log(
        "Received command to display user message:",
        message.text,
        message.imageData,
      );
      // console.log('Received command to display user message:', message.text, message.imageData);
      if (message.text !== undefined || message.imageData !== undefined) {
        // 텍스트 또는 이미지가 있을 때
        window.displayUserMessage(message.text, message.imageData);
      }
      break;
    case "ollamaModels":
      populateModelDropdown(message.models || [], message.current || "");
      break;
    case "ollamaModelChanged":
      console.log("[chat] ollamaModelChanged received:", message.model);
      if (message.model) {
        const _geminiModels = [
          { name: "gemini-3-pro-preview", displayName: "Gemini 3.0 Pro" },
          { name: "gemini-3-flash-preview", displayName: "Gemini 3.0 Flash" },
        ];
        const _banyaModels = [
          { name: "Banya Solar:100b", displayName: "Banya Solar 100B" },
          { name: "Banya Qwen-Coder:32b", displayName: "Banya Qwen-Coder 32B" },
        ];
        const _allModels = [
          ..._geminiModels,
          ..._banyaModels,
          ...availableOllamaModels,
        ];
        const currentModel = _allModels.find((m) => m.name === message.model);
        const display = currentModel?.displayName || message.model;
        currentOllamaModel = message.model;

        let modelType = "ollama";
        if (_geminiModels.some((m) => m.name === message.model)) {
          modelType = "gemini";
        } else if (_banyaModels.some((m) => m.name === message.model)) {
          modelType = "banya";
        }

        console.log("[chat] Setting model label:", display, modelType);
        setModelLabel(display, modelType);

        // 드롭다운의 selected 클래스 업데이트
        if (modelDropdown) {
          const allItems = modelDropdown.querySelectorAll(".dropdown-option");
          console.log(
            "[chat] Updating dropdown items, total:",
            allItems.length,
          );
          allItems.forEach((item) => {
            if (item.dataset.model === message.model) {
              console.log(
                "[chat] Marking item as selected:",
                item.dataset.model,
              );
              item.classList.add("selected");
            } else {
              item.classList.remove("selected");
            }
          });
        }
      }
      if (message.error) {
        console.warn("[chat] ollamaModelChanged error:", message.error);
      }
      break;

    case "updateContextInfo":
      if (message.contextInfo && window.updateContextInfo) {
        window.updateContextInfo(message.contextInfo);
      }
      break;

    case "clearChat":
      console.log("Clearing chat messages");
      const chatMessagesDiv = document.getElementById("chat-messages");
      if (chatMessagesDiv) {
        chatMessagesDiv.innerHTML = "";
      }
      break;

    case "receiveMessage":
      // console.log('Received message from extension:', message.text);
      console.log("Received message from extension:", {
        sender: message.sender,
        textLength: message.text ? message.text.length : 0,
        textPreview: message.text
          ? message.text.substring(0, 200) + "..."
          : "undefined",
      });

      // ✅ RAW CODE BLOCK TEXT 확인 (디버깅용)
      if (message.sender === "CODEPILOT" && message.text) {
        console.log(
          "[RAW CODEPILOT MESSAGE] length:",
          message.text.length,
          "preview:",
          message.text.substring(0, 200),
        );
        const codeBlockMatch = message.text.match(/```([^\n]*?)\n/);
        if (codeBlockMatch) {
          console.log("[RAW CODE BLOCK TEXT] lang label:", codeBlockMatch[1]);
        } else {
          console.log("[RAW CODE BLOCK TEXT] No code block found in message");
        }
      }

      // hideLoading 이벤트에서 처리하므로 여기서는 처리하지 않음

      if (message.sender === "CODEPILOT" && message.text !== undefined) {
        console.log(
          "Calling displayCodePilotMessage with text length:",
          message.text.length,
        );
        window.displayCodePilotMessage(message.text); // CODEPILOT 메시지 표시
      } else if (message.sender === "System" && message.text !== undefined) {
        window.displaySystemMessage(message.text); // 시스템 메시지 (툴 실행 결과 등) 표시
      }
      break;

    case "fileSelected":
      console.log("File selected:", message.filePath, message.fileName);
      if (message.filePath && message.fileName) {
        addSelectedFile(message.filePath, message.fileName);
      }
      break;

    case "fileListReceived":
      console.log("File list received:", message.files?.length || 0, "files");
      if (message.files) {
        fileList = message.files;
        // '@' 메뉴가 열려있고 파일 모드면 다시 렌더링
        if (atMenuVisible && atMenuMode === "files" && chatInput) {
          const currentValue = getChatInputValue();
          const atIndex = currentValue.lastIndexOf("@");
          if (atIndex !== -1) {
            const afterAt = currentValue.substring(atIndex + 1);
            const parts = afterAt.trim().split(/\s+/);
            const filter = parts.length > 1 ? parts.slice(1).join(" ") : "";
            renderAtMenu(filter);
          }
        }
      }
      break;

    // 참고: terminalListReceived는 더 이상 사용되지 않음 (Continue IDE 방식으로 변경)
    // 터미널은 이제 활성 터미널의 내용을 직접 읽어옴

    case "terminalContextReceived":
      console.log("Terminal context received:", message.terminalContext?.name);
      if (message.terminalContext) {
        // 기존 터미널 멘션이 있으면 제거
        if (selectedTerminalContext) {
          const existingMention = chatInput.querySelector('.terminal-mention');
          if (existingMention) {
            existingMention.remove();
          }
        }
        // 단일 터미널 컨텍스트 설정 (활성 터미널만)
        selectedTerminalContext = message.terminalContext;
        // 입력창에 터미널 멘션 블록 삽입
        insertTerminalMention(message.terminalContext.name);
      } else if (message.error) {
        // 에러 메시지 표시
        console.warn("Terminal context error:", message.error);
        // 사용자에게 알림 (선택적)
      }
      break;

    case "diagnosticsContextReceived":
      console.log("Diagnostics context received:", message.diagnosticsContext);
      if (message.diagnosticsContext) {
        selectedDiagnosticsContext = message.diagnosticsContext;
        // 입력창에 Diagnostics 멘션 블록 삽입
        insertDiagnosticsMention(
          message.diagnosticsContext.errorCount || 0,
          message.diagnosticsContext.warningCount || 0,
        );
      }
      break;

    case "openPanel":
      console.log(
        `Received open panel command from extension: ${message.panel}`,
      );
      break;
    case "languageChanged":
      console.log(`Language changed to: ${message.language}`);
      loadLanguage(message.language);
      break;
    case "currentLanguage":
      if (message.language) {
        currentLanguage = message.language;
        if (languageSelect) {
          languageSelect.value = currentLanguage;
        }
        loadLanguage(currentLanguage);
      }
      break;
    case "languageDataReceived":
      if (message.language && message.data) {
        languageData = message.data;
        currentLanguage = message.language;
        sessionStorage.setItem("codepilotLang", message.language);

        applyLanguage();
      }
      break;
    case "showApprovalButtons":
      const container = document.getElementById("approval-buttons-container");
      if (container) {
        container.style.display = "flex";
      } else {
      }
      break;
    case "hideApprovalButtons":
      const hideContainer = document.getElementById(
        "approval-buttons-container",
      );
      if (hideContainer) {
        hideContainer.style.display = "none";
      }
      break;

    // 스트리밍 메시지 처리
    case "startStreamingMessage":
      console.log(
        "[Streaming] Starting streaming message from:",
        message.sender,
      );
      startStreamingMessage(message.sender);
      break;

    case "streamMessageChunk":
      if (message.chunk) {
        appendStreamingChunk(message.chunk);
      }
      break;

    case "endStreamingMessage":
      console.log("[Streaming] Ending streaming message");
      endStreamingMessage();
      break;
  }
});

// --- UI 업데이트 및 마크다운 렌더링 관련 함수 정의 ---
// 이 함수들을 window 객체에 할당하여 메시지 핸들러에서 접근 가능하게 합니다.

// 사용자 메시지를 일반 텍스트와 구분선으로 표시하는 함수
function displayUserMessage(text, imageData = null) {
  // imageData 파라미터 추가
  if (!chatMessages) {
    return;
  }

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
    imgElement.src = `data:image/png;base64,${imageData}`; // MIME 타입은 PNG로 가정하거나, 전송된 MIME 타입 사용
    userMessageElement.appendChild(imgElement);
  }

  // 텍스트가 있으면 멘션 패턴을 파싱하여 스타일링 적용
  if (text) {
    // 파일 멘션: @로 시작하고 파일명 문자만 매칭 (공백에서 종료)
    // 터미널 멘션: "Terminal: 터미널이름" 형식 (공백 전까지)
    // 진단 멘션: "Diagnostics: N errors, M warnings" 형식
    const mentionRegex = /(@[a-zA-Z0-9\.\-\_\/\\]+)|(Terminal:\s*[^\s]+)|(Diagnostics:\s*\d+\s*errors?,\s*\d+\s*warnings?)/g;

    let lastIndex = 0;
    let match;

    while ((match = mentionRegex.exec(text)) !== null) {
      // 멘션 이전의 일반 텍스트 추가
      if (match.index > lastIndex) {
        const textBefore = document.createTextNode(text.substring(lastIndex, match.index));
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

  // 사용자 메시지가 추가된 후 즉시 스크롤을 해당 메시지로 이동 (여러 번 시도)
  scrollToUserMessage(containerElement);
}

// 시스템 메시지 (툴 실행 결과 등)를 표시하는 함수
function displaySystemMessage(text) {
  if (!chatMessages) {
    return;
  }
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
    color = "var(--vscode-testing-iconPassed)";
  } else if (text.includes("❌") || text.includes("Failed")) {
    color = "var(--vscode-testing-iconFailed)";
  } else if (text.includes("🚀") || text.includes("Executed")) {
    color = "var(--vscode-terminal-ansiCyan)";
  } else if (
    text.includes("📝") ||
    text.includes("Updated") ||
    text.includes("Created")
  ) {
    color = "var(--vscode-terminal-ansiYellow)";
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
    `;

  systemMessageElement.innerHTML = sanitizeHtml(text, sanitizeOptions);
  chatMessages.appendChild(systemMessageElement);

  // 자동 스크롤
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 사용자 메시지로 스크롤하는 함수 (여러 번 시도)
function scrollToUserMessage(userMessageElement) {
  let attempts = 0;
  const maxAttempts = 5;

  const attemptScroll = () => {
    attempts++;
    if (userMessageElement && userMessageElement.offsetHeight > 0) {
      // 요소가 실제로 렌더링되었는지 확인
      // 사용자 메시지 전송 후 스크롤을 맨 아래로 이동
      if (chatMessages) {
        chatMessages.scrollTop = chatMessages.scrollHeight;
      }
      return true; // 성공
    } else if (attempts < maxAttempts) {
      // 아직 요소가 렌더링되지 않았으면 다시 시도
      setTimeout(attemptScroll, 20);
      return false; // 아직 시도 중
    } else {
      // 최대 시도 횟수 초과 시 fallback
      if (chatMessages) {
        chatMessages.scrollTop = chatMessages.scrollHeight;
      }
      return false; // 실패
    }
  };

  // 즉시 첫 번째 시도
  if (!attemptScroll()) {
    // 첫 번째 시도가 실패하면 20ms 후 다시 시도
    setTimeout(attemptScroll, 20);
  }
}

// 로딩 버블 생성 함수
function showLoading() {
  if (!chatMessages || thinkingBubbleElement) {
    return;
  }
  const messageContainer = document.createElement("div");
  messageContainer.classList.add("thinking-bubble");

  // 타자기 효과를 위한 구조
  messageContainer.innerHTML =
    '<span class="thinking-text"></span><span class="thinking-cursor">|</span>';

  chatMessages.appendChild(messageContainer);
  thinkingBubbleElement = messageContainer; // 엘리먼트 참조 저장

  // 상태 초기화
  lastFullText = "";

  // 현재 진행 중인 상태가 있다면 즉시 업데이트
  updateThinkingBubbleText();

  // 로딩 애니메이션이 보일 때 Clear 버튼 비활성화, Cancel 버튼 활성화
  if (clearHistoryButton) {
    clearHistoryButton.disabled = true;
  }
  if (cancelButton) {
    cancelButton.disabled = false;
  }
  updateSendCancelButtons(true);

  // thinking 애니메이션이 추가된 후 즉시 스크롤을 해당 애니메이션으로 이동 (여러 번 시도)
  scrollToThinkingBubble(messageContainer);
}

// thinking 버블로 스크롤하는 함수 (여러 번 시도)
function scrollToThinkingBubble(thinkingElement) {
  let attempts = 0;
  const maxAttempts = 5;

  const attemptScroll = () => {
    attempts++;
    if (thinkingElement && thinkingElement.offsetHeight > 0) {
      // 요소가 실제로 렌더링되었는지 확인
      thinkingElement.scrollIntoView({
        behavior: "smooth",
        block: "end", // 애니메이션을 화면 하단에 위치시킴
        inline: "nearest",
      });
      return true; // 성공
    } else if (attempts < maxAttempts) {
      // 아직 요소가 렌더링되지 않았으면 다시 시도
      setTimeout(attemptScroll, 20);
      return false; // 아직 시도 중
    } else {
      // 최대 시도 횟수 초과 시 fallback
      if (chatMessages) {
        chatMessages.scrollTop = chatMessages.scrollHeight;
      }
      return false; // 실패
    }
  };

  // 즉시 첫 번째 시도
  if (!attemptScroll()) {
    // 첫 번째 시도가 실패하면 20ms 후 다시 시도
    setTimeout(attemptScroll, 20);
  }
}

// ==================== 로딩 버블 ====================

// 로딩 버블 제거 함수
function hideLoading() {
  if (thinkingBubbleElement && chatMessages) {
    chatMessages.removeChild(thinkingBubbleElement);
    thinkingBubbleElement = null;
  }

  // 상태 배열 초기화
  processingStepsArray = [];

  // 로딩 애니메이션이 사라질 때 Clear 버튼 활성화, Cancel 버튼 비활성화
  if (clearHistoryButton) {
    clearHistoryButton.disabled = false;
  }
  if (cancelButton) {
    cancelButton.disabled = true;
  }
  updateSendCancelButtons(false);
}

// 전송/중지 버튼 스왑 UI
function updateSendCancelButtons(isSending) {
  if (!sendButton || !cancelButton) {
    return;
  }
  if (isSending) {
    sendButton.classList.add("hidden");
    sendButton.style.display = "none";
    cancelButton.classList.remove("hidden");
    cancelButton.style.display = "inline-flex";
    cancelButton.style.order = "99"; // 오른쪽 끝으로 배치
    cancelButton.disabled = false;
  } else {
    cancelButton.classList.add("hidden");
    cancelButton.style.display = "none";
    sendButton.classList.remove("hidden");
    sendButton.style.display = "inline-flex";
    sendButton.style.order = "99";
    cancelButton.style.order = "0";
    cancelButton.disabled = true;
  }
}

// 초기 상태: 전송 버튼만 보이도록 설정
updateSendCancelButtons(false);

// 저장된 대화 이력을 삭제하는 함수
function handleClearHistory() {
  // 커스텀 경고창 생성
  const warningModal = document.createElement("div");
  warningModal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
    `;

  const warningContent = document.createElement("div");
  warningContent.style.cssText = `
        background-color: var(--vscode-editor-background);
        border: 1px solid var(--vscode-panel-border);
        border-radius: 8px;
        padding: 20px;
        max-width: 400px;
        width: 90%;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    `;

  warningContent.innerHTML = `
        <div style="margin-bottom: 16px;">
            <h3 style="margin: 0 0 12px 0; color: var(--vscode-foreground); font-size: 16px;">⚠️ 대화 기록 삭제</h3>
            <p style="margin: 0; color: var(--vscode-foreground); line-height: 1.4;">
                저장된 모든 대화 기록이 사라집니다.<br>
                이 작업은 되돌릴 수 없습니다.
            </p>
        </div>
        <div style="display: flex; gap: 12px; justify-content: flex-end;">
            <button id="cancel-clear-history" style="
                padding: 8px 16px;
                border: 1px solid var(--vscode-panel-border);
                background-color: var(--vscode-button-secondaryBackground);
                color: var(--vscode-button-secondaryForeground);
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
            ">취소</button>
            <button id="confirm-clear-history" style="
                padding: 8px 16px;
                border: none;
                background-color: #dc3545;
                color: white;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
            ">확인</button>
        </div>
    `;

  warningModal.appendChild(warningContent);
  document.body.appendChild(warningModal);

  // 취소 버튼 이벤트
  const cancelBtn = document.getElementById("cancel-clear-history");
  cancelBtn.addEventListener("click", () => {
    document.body.removeChild(warningModal);
  });

  // 확인 버튼 이벤트
  const confirmBtn = document.getElementById("confirm-clear-history");
  confirmBtn.addEventListener("click", () => {
    document.body.removeChild(warningModal);

    // UI 클리어
    if (chatMessages) {
      while (chatMessages.firstChild) {
        chatMessages.removeChild(chatMessages.firstChild);
      }
      thinkingBubbleElement = null; // 로딩 애니메이션 참조도 초기화
      console.log("Chat history cleared.");
    }

    // 확장 프로그램에 대화기록 삭제 요청 전송
    vscode.postMessage({
      command: "clearHistory",
      promptType: "CODE_GENERATION", // Code 탭
    });

    // 버튼 상태 초기화
    if (clearHistoryButton) {
      clearHistoryButton.disabled = false;
    }
    if (cancelButton) {
      cancelButton.disabled = true;
    }
  });

  // 배경 클릭 시 닫기
  warningModal.addEventListener("click", (e) => {
    if (e.target === warningModal) {
      document.body.removeChild(warningModal);
    }
  });
}

/**
 * XML 툴 태그를 제거하거나 사용자 친화적인 텍스트로 변환
 * @param {string} text - 원본 텍스트 (XML 툴 태그 포함 가능)
 * @returns {string} - 툴 태그가 제거되거나 변환된 텍스트
 */
function removeToolTags(text) {
  if (!text) {
    return text;
  }

  let result = text;

  // 툴 이름 목록
  const toolNames = [
    "create_file",
    "update_file",
    "remove_file",
    "read_file",
    "list_files",
    "search_files",
    "run_command",
    "analyze_code",
    "verify_code",
    "refactor_code",
  ];

  // 각 툴 태그를 처리
  for (const toolName of toolNames) {
    // 정규식: <toolName>...</toolName> 또는 <toolName>...</toolName> (개행 포함)
    const toolTagRegex = new RegExp(
      `<${toolName}>([\\s\\S]*?)<\\/${toolName}>`,
      "gi",
    );

    result = result.replace(toolTagRegex, (match, content) => {
      // 툴 태그를 완전히 제거
      return "";
    });
  }

  // 부분 태그 제거 (스트리밍 중 닫히지 않은 태그)
  const lastOpenBracketIndex = result.lastIndexOf("<");
  if (lastOpenBracketIndex !== -1) {
    const possibleTag = result.slice(lastOpenBracketIndex);
    // 닫는 태그가 없고 툴 이름과 일치하면 제거
    if (
      !possibleTag.includes("</") &&
      toolNames.some((name) => possibleTag.startsWith(`<${name}`))
    ) {
      result = result.slice(0, lastOpenBracketIndex);
    }
  }

  // 기타 XML 태그 제거 (thinking, function_calls 등)
  result = result.replace(/<thinking>\s?/g, "");
  result = result.replace(/\s?<\/thinking>/g, "");
  result = result.replace(/<think>\s?/g, "");
  result = result.replace(/\s?<\/think>/g, "");
  result = result.replace(/<function_calls>\s?/g, "");
  result = result.replace(/\s?<\/function_calls>/g, "");

  return result;
}

// ✅ 최후 방어선: Tool 태그 완전 차단
function sanitizeLastResort(text) {
  if (!text) {
    return "";
  }

  return text
    .replace(/<read_file[\s\S]*?<\/read_file>/gi, "")
    .replace(/<update_file[\s\S]*?<\/update_file>/gi, "")
    .replace(/<create_file[\s\S]*?<\/create_file>/gi, "")
    .replace(/<remove_file[\s\S]*?<\/remove_file>/gi, "")
    .replace(/<list_files[\s\S]*?<\/list_files>/gi, "")
    .replace(/<search_files[\s\S]*?<\/search_files>/gi, "")
    .replace(/<ripgrep_search[\s\S]*?<\/ripgrep_search>/gi, "")
    .replace(/<run_command[\s\S]*?<\/run_command>/gi, "")
    .replace(/<plan[\s\S]*?<\/plan>/gi, "")
    .replace(/<task_progress[\s\S]*?<\/task_progress>/gi, "")
    .trim();
}

// CODEPILOT 메시지를 코드 블록 제외하고 Markdown 포맷 적용하여 표시
function displayCodePilotMessage(markdownText) {
  console.log(
    "displayCodePilotMessage called with text length:",
    markdownText.length,
  );
  if (!chatMessages) {
    console.error("chatMessages element not found!");
    return;
  }
  console.log("chatMessages element found, creating message container...");

  // ✅ 1차: 최후 방어선 적용 (tool 태그 완전 차단)
  let sanitizedText = sanitizeLastResort(markdownText);
  if (!sanitizedText || sanitizedText.trim().length === 0) {
    console.log(
      "[displayCodePilotMessage] Empty text after sanitization, skipping",
    );
    return;
  }

  // 2차: 기존 removeToolTags 적용
  const displayText = removeToolTags(sanitizedText);

  const messageContainer = document.createElement("div");
  messageContainer.classList.add("codepilot-message-container");

  const bubbleElement = document.createElement("div");
  bubbleElement.classList.add("message-bubble");

  // --- Markdown 텍스트를 코드 블록 기준으로 분할 및 조합 ---
  // ✅ 수정: \S*?는 공백을 포함하지 않으므로 [^\n]*?로 변경 (공백 포함 언어 라벨 지원)
  const codeBlockRegex = /```([^\n]*?)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  const tempHtmlElements = document.createElement("div"); // 임시 컨테이너

  let match;
  // 모든 코드 블록을 순회하며 일반 텍스트와 코드 블록을 분리 처리
  while ((match = codeBlockRegex.exec(displayText)) !== null) {
    const precedingText = displayText.substring(lastIndex, match.index);
    const codeBlockFullMatch = match[0]; // ```...``` 전체
    let lang = match[1]; // 언어명 (라인 수 정보 포함 가능)
    const codeContent = match[2]; // 코드 내용

    // ✅ 라인 수 정보 추출 (예: "tsx -1 lines +1 lines" → "tsx"만 남기고 라인 수는 별도 처리)
    let deletedLines = 0;
    let addedLines = 0;

    // ✅ 파일 경로 정보 제거 (라인 수 파싱 전에 처리)
    let filePath = null;
    const filePathMatch = lang.match(/\[file:(.+?)\]/);
    if (filePathMatch) {
      filePath = filePathMatch[1];
      lang = lang.replace(/\[file:.+?\]/, "").trim();
    }

    // ✅ 핵심 수정: 쌍(-N +M)을 먼저 처리, 단일은 나중에 (순서 고정)
    // 1️⃣ 반드시 쌍(-N +M)을 먼저 처리 (modify 타입)
    const pairMatch = lang.match(/-(\d+)\s+lines\s+\+(\d+)\s+lines/);
    if (pairMatch) {
      deletedLines = parseInt(pairMatch[1], 10);
      addedLines = parseInt(pairMatch[2], 10);
      console.log();
      // 라인 수 정보 제거
      lang = lang.replace(pairMatch[0], "").trim();
    } else {
      // 2️⃣ 단일 +N (추가만)
      const addMatch = lang.match(/\+(\d+)\s+lines/);
      if (addMatch) {
        addedLines = parseInt(addMatch[1], 10);
        lang = lang.replace(addMatch[0], "").trim();
      }

      // 3️⃣ 단일 -N (삭제만)
      const delMatch = lang.match(/-(\d+)\s+lines/);
      if (delMatch) {
        deletedLines = parseInt(delMatch[1], 10);
        lang = lang.replace(delMatch[0], "").trim();
      }

      if (!addMatch && !delMatch) {
      } else {
        console.log();
      }
    }

    console.log();

    // 1. 코드 블록 이전 텍스트 처리 (Markdown 포맷 적용)
    const processedPrecedingHtml = md.render(precedingText); // markdown-it 사용
    tempHtmlElements.innerHTML += sanitizeHtml(
      processedPrecedingHtml,
      sanitizeOptions,
    );

    // 2. 코드 블록 처리 (HTML 태그 완전 제거, 순수 텍스트만)
    const preElement = document.createElement("pre");
    const codeElement = document.createElement("code");

    // HTML 엔티티만 디코딩하고 HTML 태그는 보존
    let cleanCodeContent = codeContent;

    // CDATA 섹션 제거 (LLM이 XML CDATA로 감싸는 경우 처리)
    cleanCodeContent = cleanCodeContent.replace(
      /<!\[CDATA\[([\s\S]*?)\]\]>/g,
      "$1",
    );

    // HTML 엔티티 디코딩
    const textarea = document.createElement("textarea");
    textarea.innerHTML = cleanCodeContent;
    cleanCodeContent = textarea.value;

    // HTML 태그는 제거하지 않고 보존 (HTML 엔티티만 디코딩)
    // 추가적인 HTML 엔티티 정리 (이미 디코딩된 것들은 다시 인코딩)
    cleanCodeContent = cleanCodeContent
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ");

    // 코드 블록 컨테이너 생성
    const codeBlockContainer = document.createElement("div");
    codeBlockContainer.classList.add("code-block-container");

    // ✅ 파일 경로가 있으면 data-file-path 속성 설정 (Accept/Reject 버튼용)
    if (filePath) {
      codeBlockContainer.setAttribute("data-file-path", filePath);
    }

    // 코드 블록 헤더 생성 (언어 표시만)
    const codeHeader = document.createElement("div");
    codeHeader.classList.add("code-block-header");

    // 접기/펼치기 버튼 (span으로 변경)
    const toggleButton = document.createElement("span");
    toggleButton.classList.add("code-toggle-button");
    toggleButton.textContent = "▾";

    const languageLabel = document.createElement("span");
    languageLabel.classList.add("code-language");

    // 파일 경로가 있으면 파일명 표시, 없으면 확장자만 표시
    const displayLang = lang || "text";
    let headerDisplayText = displayLang.toUpperCase();
    let iconFilename = `file.${displayLang}`;

    if (filePath) {
      // 파일 경로에서 파일명 추출
      const pathParts = filePath.split("/");
      const fileName = pathParts[pathParts.length - 1];
      headerDisplayText = fileName;
      iconFilename = fileName;
    }

    // seti-icons를 사용하여 아이콘 가져오기 (코드 블록 헤더용 크기)
    loadFileIcon(iconFilename, languageLabel, headerDisplayText, 14);

    // 왼쪽 그룹 (토글 버튼 + 언어 라벨) - a 태그로 클릭 이벤트 위임
    const headerLeft = document.createElement("a");
    headerLeft.classList.add("code-header-left");
    headerLeft.href = "codepilot://toggle"; // 이벤트 위임용 (ID는 나중에 설정)
    headerLeft.title = "접기/펼치기";
    headerLeft.appendChild(toggleButton);
    headerLeft.appendChild(languageLabel);

    // ✅ 라인 수 정보 표시 (삭제/추가 라인 수만, 총 라인 수는 표시하지 않음)
    const lineCountLabel = document.createElement("span");
    lineCountLabel.classList.add("code-line-count");

    if (deletedLines > 0 || addedLines > 0) {
      // 삭제/추가 라인 수만 표시 (총 라인 수는 표시하지 않음)
      if (deletedLines > 0) {
        const deletedSpan = document.createElement("span");
        deletedSpan.style.color = "#f14c4c"; // 빨간색
        deletedSpan.textContent = `-${deletedLines} lines `;
        lineCountLabel.appendChild(deletedSpan);
      }

      if (addedLines > 0) {
        const addedSpan = document.createElement("span");
        addedSpan.style.color = "#73c991"; // 초록색
        addedSpan.textContent = `+${addedLines} lines`;
        lineCountLabel.appendChild(addedSpan);
      }

      // ✅ 파일 diff 아이콘 추가 (filePath가 있을 때만)
      if (filePath) {
        const diffIcon = document.createElement("a");
        diffIcon.classList.add("diff-file-icon");
        diffIcon.innerHTML = "⇄"; // diff 아이콘
        diffIcon.title = `Diff 보기: ${filePath}`;

        const encodedPath = encodeURIComponent(filePath);
        diffIcon.href = `codepilot://diff?path=${encodedPath}`;

        diffIcon.style.cssText = `
                    cursor: pointer;
                    margin-left: 6px;
                    opacity: 0.5;
                    transition: opacity 0.2s;
                    display: inline-flex;
                    align-items: center;
                    color: rgba(255, 255, 255, 0.7);
                    font-size: 12px;
                    text-decoration: none;
                    font-size: 12px;
                    position: relative;
                    text-decoration: none;
                `;

        diffIcon.addEventListener(
          "mouseenter",
          () => {
            diffIcon.style.opacity = "1";
          },
          { passive: true },
        );
        diffIcon.addEventListener(
          "mouseleave",
          () => {
            diffIcon.style.opacity = "0.5";
          },
          { passive: true },
        );

        lineCountLabel.appendChild(diffIcon);
      }

      // ✅ 파일 열기 아이콘 추가 (filePath가 있을 때만)
      // 🔥 anchor 태그 방식으로 변경 - Webview 컨텍스트 문제 해결
      if (filePath) {
        const openFileIcon = document.createElement("a");
        openFileIcon.classList.add("open-file-icon");
        openFileIcon.innerHTML = "↗"; // 파일 열기 아이콘
        openFileIcon.title = `파일 열기: ${filePath}`;

        // ✅ codepilot://open 스킴 사용 (chatMessages click 핸들러에서 처리)
        const encodedPath = encodeURIComponent(filePath);
        openFileIcon.href = `codepilot://open?path=${encodedPath}`;

        openFileIcon.style.cssText = `
                    cursor: pointer;
                    margin-left: 6px;
                    opacity: 0.5;
                    transition: opacity 0.2s;
                    display: inline-flex;
                    align-items: center;
                    color: rgba(255, 255, 255, 0.7);
                    font-size: 12px;
                    text-decoration: none;
                    color: var(--vscode-foreground);
                    font-size: 12px;
                    position: relative;
                    text-decoration: none;
                `;

        // Hover 효과 (인풋과 동일한 파란색)
        openFileIcon.addEventListener(
          "mouseenter",
          () => {
            openFileIcon.style.opacity = "1";
          },
          { passive: true },
        );
        openFileIcon.addEventListener(
          "mouseleave",
          () => {
            openFileIcon.style.opacity = "0.5";
          },
          { passive: true },
        );

        lineCountLabel.appendChild(openFileIcon);
        console.log();
      } else {
      }
    }
    // 라인 수 정보가 없으면 라인 수 라벨 자체를 표시하지 않음

    codeHeader.appendChild(headerLeft);
    if (deletedLines > 0 || addedLines > 0) {
      codeHeader.appendChild(lineCountLabel);
      console.log();
    } else if (filePath) {
      // ✅ 라인 수 정보가 없어도 filePath가 있으면 아이콘만 표시
      // 🔥 headerRight 컨테이너로 감싸서 왼쪽 정렬 유지
      const headerRight = document.createElement("span");
      headerRight.classList.add("code-header-right");
      headerRight.style.cssText = `
                display: inline-flex;
                align-items: center;
                gap: 0;
            `;

      // ✅ Diff 아이콘 추가
      const diffIcon = document.createElement("a");
      diffIcon.classList.add("diff-file-icon");
      diffIcon.innerHTML = "⇄";
      diffIcon.title = `Diff 보기: ${filePath}`;

      const encodedPathDiff = encodeURIComponent(filePath);
      diffIcon.href = `codepilot://diff?path=${encodedPathDiff}`;

      diffIcon.style.cssText = `
                cursor: pointer;
                margin-left: 6px;
                opacity: 0.5;
                transition: opacity 0.2s;
                display: inline-flex;
                align-items: center;
                color: rgba(255, 255, 255, 0.7);
                font-size: 12px;
                text-decoration: none;
            `;

      diffIcon.addEventListener(
        "mouseenter",
        () => {
          diffIcon.style.opacity = "1";
        },
        { passive: true },
      );
      diffIcon.addEventListener(
        "mouseleave",
        () => {
          diffIcon.style.opacity = "0.5";
        },
        { passive: true },
      );

      headerRight.appendChild(diffIcon);

      // 🔥 anchor 태그 방식으로 변경 - Webview 컨텍스트 문제 해결
      const openFileIcon = document.createElement("a");
      openFileIcon.classList.add("open-file-icon");
      openFileIcon.innerHTML = "↗";
      openFileIcon.title = `파일 열기: ${filePath}`;

      // ✅ codepilot://open 스킴 사용 (chatMessages click 핸들러에서 처리)
      const encodedPath = encodeURIComponent(filePath);
      openFileIcon.href = `codepilot://open?path=${encodedPath}`;

      openFileIcon.style.cssText = `
                cursor: pointer;
                margin-left: 6px;
                opacity: 0.5;
                transition: opacity 0.2s;
                display: inline-flex;
                align-items: center;
                color: rgba(255, 255, 255, 0.7);
                font-size: 12px;
                text-decoration: none;
            `;

      openFileIcon.addEventListener(
        "mouseenter",
        () => {
          openFileIcon.style.opacity = "1";
        },
        { passive: true },
      );
      openFileIcon.addEventListener(
        "mouseleave",
        () => {
          openFileIcon.style.opacity = "0.5";
        },
        { passive: true },
      );

      headerRight.appendChild(openFileIcon);
      codeHeader.appendChild(headerRight);
    }

    // 코드 컨테이너 생성
    const codeContainer = document.createElement("div");
    codeContainer.classList.add("code-container");

    // 코드 내용을 먼저 설정 (highlightElement가 textContent를 읽음)
    codeElement.textContent = cleanCodeContent;

    // 동적 구문 강조 적용
    highlightCodeBlock(codeElement, lang ? lang.trim() : null);

    preElement.appendChild(codeElement);
    codeContainer.appendChild(preElement);

    // 고유 ID 생성 (토글용)
    const blockId = `code-block-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    codeBlockContainer.setAttribute("data-block-id", blockId);
    codeContainer.setAttribute("data-container-for", blockId);

    // 토글 버튼과 헤더에 블록 ID 추가
    toggleButton.href = `codepilot://toggle?id=${blockId}`;
    headerLeft.href = `codepilot://toggle?id=${blockId}`;

    // 커서 스타일
    codeHeader.style.cursor = "pointer";

    // 코드 블록 컨테이너에 헤더와 코드 추가
    codeBlockContainer.appendChild(codeHeader);
    codeBlockContainer.appendChild(codeContainer);

    tempHtmlElements.appendChild(codeBlockContainer);

    lastIndex = codeBlockRegex.lastIndex; // 다음 검색 시작 위치 업데이트
  }

  // 3. 마지막 코드 블록 이후의 텍스트 처리 (Markdown 포맷 적용)
  const remainingText = displayText.substring(lastIndex);
  const processedRemainingHtml = md.render(remainingText); // markdown-it 사용
  tempHtmlElements.innerHTML += sanitizeHtml(
    processedRemainingHtml,
    sanitizeOptions,
  );

  // tempHtmlElements의 모든 자식 노드를 bubbleElement로 옮깁니다.
  while (tempHtmlElements.firstChild) {
    bubbleElement.appendChild(tempHtmlElements.firstChild);
  }

  messageContainer.appendChild(bubbleElement);

  addCopyButtonsToCodeBlocks(bubbleElement);

  chatMessages.appendChild(messageContainer);

  // AI 응답이 추가된 후 스크롤을 해당 응답으로 이동
  requestAnimationFrame(() => {
    if (messageContainer) {
      // AI 응답을 화면에 명확하게 보이도록 스크롤
      messageContainer.scrollIntoView({
        behavior: "smooth",
        block: "start", // 응답의 시작 부분이 화면 상단에 보이도록
        inline: "nearest",
      });
    } else if (chatMessages) {
      // Fallback
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  });
}

// renderBasicMarkdown 함수는 현재 md.render()로 대체되었으므로, 더 이상 사용되지 않습니다.
function renderBasicMarkdown(markdownText) {
  return markdownText; // 원본 텍스트를 그대로 반환 (사용되지 않음)
}

// --- 웹뷰 메시지 핸들러에서 호출되는 함수들을 전역 window 객체에 할당 ---
window.displayUserMessage = displayUserMessage;
window.displaySystemMessage = displaySystemMessage;
window.showLoading = showLoading;
window.hideLoading = hideLoading;
window.displayCodePilotMessage = displayCodePilotMessage;

// 파일 선택기 열기
function openFilePicker() {
  console.log("Opening file picker...");
  vscode.postMessage({ command: "openFilePicker" });
}

// 선택된 파일 추가
function addSelectedFile(filePath, fileName) {
  // 중복 파일 체크
  if (selectedFiles.some((file) => file.path === filePath)) {
    console.log("File already selected:", filePath);
    return;
  }

  selectedFiles.push({ path: filePath, name: fileName });

  // 입력창에 파일 멘션 블록 추가 (파일 선택 버튼으로 선택한 경우 '@' 제거하지 않음)
  if (chatInput) {
    insertFileMention(fileName, filePath, false);
    chatInput.focus();
  }
}

// 선택된 파일 제거
/**
 * DOM의 멘션 블록과 selectedFiles/selectedTerminalContext를 동기화
 * 사용자가 백스페이스 등으로 멘션 블록을 삭제하면 상태도 업데이트
 */
function syncMentionsWithDOM() {
  if (!chatInput) {
    return;
  }

  // 파일 멘션 동기화
  if (selectedFiles.length > 0) {
    const fileMentions = chatInput.querySelectorAll(".file-mention");
    const mentionedPaths = new Set();
    fileMentions.forEach((mention) => {
      const path = mention.getAttribute("data-file-path");
      if (path) {
        mentionedPaths.add(path);
      }
    });

    // DOM에 없는 파일은 selectedFiles에서 제거
    const removedFiles = selectedFiles.filter(
      (file) => !mentionedPaths.has(file.path),
    );
    if (removedFiles.length > 0) {
      console.log(
        "[chat.js] File mentions removed from DOM:",
        removedFiles.map((f) => f.name),
      );
      selectedFiles = selectedFiles.filter((file) =>
        mentionedPaths.has(file.path),
      );
    }
  }

  // 터미널 멘션 동기화 (단일)
  if (selectedTerminalContext) {
    const terminalMention = chatInput.querySelector(".terminal-mention");
    if (!terminalMention) {
      console.log(
        "[chat.js] Terminal mention removed from DOM, clearing selectedTerminalContext"
      );
      selectedTerminalContext = null;
    }
  }

  // Diagnostics 멘션 동기화
  if (selectedDiagnosticsContext) {
    const diagnosticsMention = chatInput.querySelector(".diagnostics-mention");
    if (!diagnosticsMention) {
      console.log(
        "[chat.js] Diagnostics mention removed from DOM, clearing selectedDiagnosticsContext",
      );
      selectedDiagnosticsContext = null;
    }
  }
}

function removeSelectedFile(filePath) {
  selectedFiles = selectedFiles.filter((file) => file.path !== filePath);
  // 입력창에서 파일 멘션 블록도 제거
  if (chatInput) {
    const mentions = chatInput.querySelectorAll(
      '.file-mention[data-file-path="' + filePath + '"]',
    );
    mentions.forEach((mention) => mention.remove());
    autoResizeTextarea();
  }
}

// 모든 선택된 파일 제거
function clearAllSelectedFiles() {
  selectedFiles = [];
  // 입력창에서 모든 파일 멘션 블록 제거
  if (chatInput) {
    const mentions = chatInput.querySelectorAll(".file-mention");
    mentions.forEach((mention) => mention.remove());
    autoResizeTextarea();
  }
}

// 파일 선택 영역 UI 업데이트 (더 이상 사용하지 않음 - 입력창에 블록으로 표시)
function updateFileSelectionDisplay() {
  // 상단 파일 선택 영역은 더 이상 사용하지 않음
  // 파일은 입력창에 @filename 블록으로 표시됨
  // 이 함수는 호환성을 위해 유지하지만 아무 작업도 하지 않음
}

// 언어별 텍스트 로딩 및 적용
const languageSelect = document.getElementById("language-select");
let currentLanguage = "ko"; // 기본값
let languageData = {};

async function loadLanguage(lang) {
  try {
    // console.log('Requesting language data from extension:', lang);
    // 확장 프로그램에 언어 데이터 요청
    vscode.postMessage({ command: "getLanguageData", language: lang });
  } catch (e) {
    console.error("Failed to load language:", lang, e);
  }
}

function applyLanguage() {
  // 타이틀
  const chatTitle = document.getElementById("chat-title");
  if (chatTitle && languageData["chatTitle"]) {
    chatTitle.textContent = languageData["chatTitle"];
  }

  // 언어 라벨
  const languageLabel = document.getElementById("language-label");
  if (languageLabel && languageData["languageLabel"]) {
    languageLabel.textContent = languageData["languageLabel"];
  }

  // Send 버튼
  const sendButton = document.getElementById("send-button");
  if (sendButton && languageData["sendButton"]) {
    sendButton.textContent = languageData["sendButton"];
  }

  // Clear 버튼
  const clearButton = document.getElementById("clean-history-button");
  if (clearButton && languageData["clearButton"]) {
    clearButton.textContent = languageData["clearButton"];
  }

  // Cancel 버튼
  const cancelButton = document.getElementById("cancel-call-button");
  if (cancelButton && languageData["cancelButton"]) {
    cancelButton.textContent = languageData["cancelButton"];
  }

  // 입력창 placeholder
  const chatInput = document.getElementById("chat-input");
  if (chatInput && languageData["inputPlaceholder"]) {
    chatInput.placeholder = languageData["inputPlaceholder"];
  }

  // 파일 선택 버튼
  const filePickerButton = document.getElementById("file-picker-button");
  if (filePickerButton && languageData["filePickerButton"]) {
    filePickerButton.textContent = languageData["filePickerButton"];
  }

  console.log("=== applyLanguage completed ===");
}

if (languageSelect) {
  languageSelect.addEventListener("change", (e) => {
    const lang = e.target.value;
    console.log("Language changed to:", lang);
    currentLanguage = lang;
    loadLanguage(lang);

    // 언어 변경 시 즉시 저장 요청
    vscode.postMessage({ command: "saveLanguage", language: lang });
  });
}

// 페이지 로드 시 기본 언어 적용
window.addEventListener("DOMContentLoaded", () => {
  // VS Code 설정에서 언어를 가져오도록 요청
  vscode.postMessage({ command: "getLanguage" });
});

// --- Link click interception for opening files from AI messages ---
// 🔥 이벤트 위임 방식 - anchor 태그 클릭 처리
if (chatMessages) {
  chatMessages.addEventListener("click", (event) => {
    const target = event.target;
    if (!target) {
      return;
    }

    // ✅ codepilot://open 링크 찾기
    const anchor = target.closest ? target.closest("a") : null;
    if (!anchor) {
      return;
    }
    const href = anchor.getAttribute("href");
    if (!href) {
      return;
    }

    // Support both custom scheme and https placeholder
    if (
      href.startsWith("codepilot://open") ||
      href.startsWith("https://codepilot.invalid/open")
    ) {
      event.preventDefault();

      try {
        const url = new URL(href);
        const query = url.search
          ? url.search.slice(1)
          : href.split("?")[1] || "";
        const params = new URLSearchParams(query);
        const p = params.get("path");
        if (p) {
          const filePath = decodeURIComponent(p);

          // ✅ openFile 명령 사용 (ChatViewProvider에서 처리)
          if (
            window.vscode &&
            typeof window.vscode.postMessage === "function"
          ) {
            window.vscode.postMessage({
              command: "openFile",
              filePath: filePath,
              timestamp: Date.now(),
            });
          } else {
          }
        }
      } catch (e) {
        console.warn("Failed to parse codepilot link:", href, e);
      }
    } else if (
      href.startsWith("codepilot://diff") ||
      href.startsWith("https://codepilot.invalid/diff")
    ) {
      event.preventDefault();

      try {
        const url = new URL(href);
        const query = url.search
          ? url.search.slice(1)
          : href.split("?")[1] || "";
        const params = new URLSearchParams(query);
        const p = params.get("path");
        if (p) {
          const filePath = decodeURIComponent(p);

          // ✅ openDiff 명령 사용 (ChatViewProvider에서 처리)
          if (
            window.vscode &&
            typeof window.vscode.postMessage === "function"
          ) {
            window.vscode.postMessage({
              command: "openDiff",
              filePath: filePath,
              timestamp: Date.now(),
            });
          } else {
          }
        }
      } catch (e) {
        console.warn("Failed to parse codepilot diff link:", href, e);
      }
    } else if (
      href.startsWith("codepilot://acceptAll") ||
      href.startsWith("https://codepilot.invalid/acceptAll")
    ) {
      event.preventDefault();
      console.log("[chat.js] Accept All button clicked");

      try {
        const url = new URL(href);
        const query = url.search
          ? url.search.slice(1)
          : href.split("?")[1] || "";
        const params = new URLSearchParams(query);
        const p = params.get("path");
        if (p) {
          const filePath = decodeURIComponent(p);
          console.log("[chat.js] Accept All for file:", filePath);

          // ✅ 같은 파일의 모든 Keep/Undo 버튼 제거
          removeChatPanelButtonsForFile(filePath);
          console.log(
            "[chat.js] All Keep/Undo buttons removed for file:",
            filePath,
          );

          // ✅ acceptAllChangesForFile 명령 사용
          if (
            window.vscode &&
            typeof window.vscode.postMessage === "function"
          ) {
            window.vscode.postMessage({
              command: "acceptAllChangesForFile",
              filePath: filePath,
              timestamp: Date.now(),
            });
            console.log("[chat.js] Accept All message sent");
          } else {
            console.warn("[chat.js] VS Code API not available");
          }
        }
      } catch (e) {
        console.error("[chat.js] Failed to parse acceptAll link:", href, e);
      }
    } else if (
      href.startsWith("codepilot://rejectAll") ||
      href.startsWith("https://codepilot.invalid/rejectAll")
    ) {
      event.preventDefault();
      console.log("[chat.js] Reject All button clicked");

      try {
        const url = new URL(href);
        const query = url.search
          ? url.search.slice(1)
          : href.split("?")[1] || "";
        const params = new URLSearchParams(query);
        const p = params.get("path");
        if (p) {
          const filePath = decodeURIComponent(p);
          console.log("[chat.js] Reject All for file:", filePath);

          // ✅ 같은 파일의 모든 Keep/Undo 버튼 제거
          removeChatPanelButtonsForFile(filePath);
          console.log(
            "[chat.js] All Keep/Undo buttons removed for file:",
            filePath,
          );

          // ✅ rejectAllChangesForFile 명령 사용
          if (
            window.vscode &&
            typeof window.vscode.postMessage === "function"
          ) {
            window.vscode.postMessage({
              command: "rejectAllChangesForFile",
              filePath: filePath,
              timestamp: Date.now(),
            });
            console.log("[chat.js] Reject All message sent");
          } else {
            console.warn("[chat.js] VS Code API not available");
          }
        }
      } catch (e) {
        console.error("[chat.js] Failed to parse rejectAll link:", href, e);
      }
    } else if (href.startsWith("codepilot://toggle")) {
      // ✅ 코드 블록 접기/펼치기 토글
      event.preventDefault();
      event.stopPropagation();

      try {
        const query = href.split("?")[1] || "";
        const params = new URLSearchParams(query);
        const blockId = params.get("id");

        if (blockId) {
          const codeBlock = document.querySelector(
            `[data-block-id="${blockId}"]`,
          );
          const codeContainer = document.querySelector(
            `[data-container-for="${blockId}"]`,
          );

          if (codeBlock && codeContainer) {
            const toggleBtn = codeBlock.querySelector(".code-toggle-button");
            const header = codeBlock.querySelector(".code-block-header");
            const isCurrentlyCollapsed = codeContainer.style.display === "none";

            if (isCurrentlyCollapsed) {
              // 펼치기
              codeContainer.style.display = "block";
              if (toggleBtn) {
                toggleBtn.classList.remove("collapsed");
              }
              if (header) {
                header.classList.remove("collapsed");
              }
            } else {
              // 접기
              codeContainer.style.display = "none";
              if (toggleBtn) {
                toggleBtn.classList.add("collapsed");
              }
              if (header) {
                header.classList.add("collapsed");
              }
            }
          }
        }
      } catch (e) {
        console.error("[chat.js] Failed to toggle code block:", href, e);
      }
    }
  });
}

/**
 * 채팅 패널에서 특정 파일의 모든 Keep/Undo 버튼 제거
 * @param {string} filePath - 파일 경로
 */
function removeChatPanelButtonsForFile(filePath) {
  const fileName =
    filePath.split("/").pop() || filePath.split("\\").pop() || filePath;

  // data-file-path 속성으로 코드 블록 찾기
  const codeBlocks = document.querySelectorAll(".code-block-container");
  codeBlocks.forEach((block) => {
    const dataFilePath = block.getAttribute("data-file-path");

    // 파일 경로가 일치하는지 확인 (절대/상대 경로 모두 처리)
    const isMatch =
      dataFilePath &&
      (dataFilePath === filePath ||
        dataFilePath.endsWith(fileName) ||
        filePath.endsWith(dataFilePath) ||
        dataFilePath.includes(fileName));

    if (isMatch) {
      // 해당 코드 블록 다음의 버튼 컨테이너 찾기
      let nextElement = block.nextElementSibling;
      while (nextElement) {
        if (nextElement.classList.contains("bash-button-container")) {
          const keepBtn = nextElement.querySelector(".keep-button");
          const undoBtn = nextElement.querySelector(".undo-button");
          if (keepBtn) {
            keepBtn.remove();
          }
          if (undoBtn) {
            undoBtn.remove();
          }
          // 버튼 컨테이너가 비어있으면 제거
          if (nextElement.children.length === 0) {
            nextElement.remove();
          }
          break;
        }
        // 다른 코드 블록이 나오면 중단
        if (nextElement.classList.contains("code-block-container")) {
          break;
        }
        nextElement = nextElement.nextElementSibling;
      }
    }
  });
}

/**
 * Git 리포지토리 정보를 채팅창에 표시
 */
function showGitRepositoryInfo(content) {
  const chatContainer = document.getElementById("chat-container");
  if (!chatContainer) {
    return;
  }

  // 기존 Git 정보 메시지가 있으면 제거
  const existingGitInfo = document.getElementById("git-repository-info");
  if (existingGitInfo) {
    existingGitInfo.remove();
  }

  // Git 정보 메시지 생성
  const gitInfoDiv = document.createElement("div");
  gitInfoDiv.id = "git-repository-info";
  gitInfoDiv.className = "git-info-message";
  gitInfoDiv.innerHTML = `
        <div class="git-info-content">
            <div class="git-info-header">
                <span class="git-info-icon">🔗</span>
                <span class="git-info-title">Git 리포지토리 연결됨</span>
            </div>
            <div class="git-info-body">
                ${content
                  .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
                  .replace(/`(.*?)`/g, "<code>$1</code>")
                  .replace(/\n/g, "<br>")}
            </div>
        </div>
    `;

  // 스타일 추가
  const style = document.createElement("style");
  style.textContent = `
        .git-info-message {
            margin: 10px 0;
            padding: 12px;
            background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
            border: 1px solid #dee2e6;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .git-info-content {
            font-size: 14px;
            line-height: 1.5;
        }
        .git-info-header {
            display: flex;
            align-items: center;
            margin-bottom: 8px;
        }
        .git-info-icon {
            font-size: 16px;
            margin-right: 8px;
        }
        .git-info-title {
            font-weight: 600;
            color: #495057;
        }
        .git-info-body {
            color: #6c757d;
        }
        .git-info-body code {
            background: #f1f3f4;
            padding: 2px 4px;
            border-radius: 3px;
            font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
        }
        .git-info-body strong {
            color: #495057;
        }
    `;

  if (!document.getElementById("git-info-styles")) {
    style.id = "git-info-styles";
    document.head.appendChild(style);
  }

  // 채팅 컨테이너 맨 위에 추가
  chatContainer.insertBefore(gitInfoDiv, chatContainer.firstChild);
}

// Diff 승인/거부 함수
function approveAllChanges() {
  if (vscode) {
    vscode.postMessage({
      command: "approveAllChanges",
    });
  } else {
    console.warn("VS Code API not available");
  }
}

function rejectAllChanges() {
  if (vscode) {
    vscode.postMessage({
      command: "rejectAllChanges",
    });
  } else {
    console.warn("VS Code API not available");
  }
}

// 컨텍스트 정보 업데이트 함수
function updateContextInfo(contextInfo) {
  const contextCountElement = document.getElementById("context-messages-count");
  const gaugeFill = document.getElementById("token-gauge-fill");
  const percentageElement = document.getElementById("token-percentage");
  const gaugeContainer = document.querySelector(".token-gauge-container");

  if (contextCountElement && contextInfo.messageCount !== undefined) {
    const count = contextInfo.messageCount;
    contextCountElement.textContent = count > 9999 ? "9999+" : count;
  }

  if (gaugeFill && percentageElement && contextInfo.tokenUsage !== undefined) {
    const { current, max, percentage } = contextInfo.tokenUsage;
    const roundedPercentage = Math.round(percentage);

    // 게이지 바 너비 업데이트
    gaugeFill.style.width = `${Math.min(100, roundedPercentage)}%`;

    // 퍼센트 텍스트 업데이트
    percentageElement.textContent =
      roundedPercentage > 100 ? "100%+" : `${roundedPercentage}%`;

    // tooltip 업데이트
    if (gaugeContainer) {
      const maxFormatted = max >= 1000 ? `${Math.floor(max / 1000)}K` : max;
      let tooltipText = `토큰 사용량: ${current.toLocaleString()} / ${maxFormatted}`;

      // 컨텍스트 정보 추가
      if (contextInfo.messageCount !== undefined) {
        const contextCount = contextInfo.messageCount;
        tooltipText += `\n컨텍스트: ${contextCount.toLocaleString()}개 메시지`;
      }

      gaugeContainer.title = tooltipText;
    }

    // 토큰 사용량에 따른 색상 변경 (항상 흰색으로 고정)
    gaugeFill.className = "token-gauge-fill";
  }
}

// 전역으로 노출
window.updateContextInfo = updateContextInfo;
