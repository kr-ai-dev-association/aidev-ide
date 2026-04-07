import sanitizeHtml from "sanitize-html";
import { addCopyButtonsToCodeBlocks } from "./codeCopy.js";
import { getIcon } from "@peoplesgrocers/seti-ui-file-icons";
import {
  escapeHtml,
  generateId,
  normalizeLanguage,
  highlightCodeBlock,
  removeToolTags,
  sanitizeLastResort,
  removeThinkTags,
  sanitizeOptions,
} from "./chat/utils.js";
import { loadFileIcon } from "./chat/codeBlock.js";
// extractCurrentThink, enhanceCodeBlocks는 streaming.js 모듈 내부에서 사용됨
import { createMarkdownRenderer } from "./chat/markdown.js";
import {
  slashCategories,
  slashCommandsByCategory,
  slashCommands,
  atMenuCategories,
} from "./chat/commands.js";
// streaming.js 모듈은 현재 chat.js 내부 구현 사용 (로컬 변수 의존성)
import {
  createSlashMenu as createSlashMenuModule,
  renderSlashMenu as renderSlashMenuModule,
  selectSlashCategory as selectSlashCategoryModule,
  hideSlashMenu as hideSlashMenuModule,
  executeSlashCommand as executeSlashCommandModule,
  getSlashMenuState,
  setSlashMenuSelectedIndex,
} from "./chat/slash-commands.js";
import {
  createAtMenu as createAtMenuModule,
  hideAtMenu as hideAtMenuModule,
  getAtMenuState,
  setAtMenuSelectedIndex,
  setAtMenuMode,
  setAtMenuVisible,
  setSelectedAtCategory,
} from "./chat/at-mentions.js";
import {
  getChatInputText as getChatInputTextModule,
  getChatInputDisplayContent as getChatInputDisplayContentModule,
  getChatInputValue as getChatInputValueModule,
  setCursorToEnd,
} from "./chat/input-handler.js";
import {
  displayUserMessage as displayUserMessageModule,
  displaySystemMessage as displaySystemMessageModule,
  scrollToUserMessage as scrollToUserMessageModule,
  showLoading as showLoadingModule,
  appendBeforeThinkingBubble,
} from "./chat/message-display.js";
// 새로 분리된 모듈들
import {
  initStreaming,
  startStreamingMessage as startStreamingMessageModule,
  appendStreamingChunk as appendStreamingChunkModule,
  endStreamingMessage as endStreamingMessageModule,
  removeLastMessage as removeLastMessageModule,
  setThinkingBubbleElement as setStreamingThinkingBubble,
} from "./chat/streaming.js";
import {
  initProcessingSteps,
  setProcessingStep as setProcessingStepModule,
  updateProcessingStatus as updateProcessingStatusModule,
  handleScroll as handleScrollModule,
  resetProcessingStatuses as resetProcessingStatusesModule,
  showAutoCorrectingIndicator as showAutoCorrectingIndicatorModule,
  hideAutoCorrectingIndicator as hideAutoCorrectingIndicatorModule,
  showErrorCorrection as showErrorCorrectionModule,
  setThinkingBubbleElement as setProcessingThinkingBubble,
  getThinkingBubbleElement,
  updateThinkingContent as updateThinkingContentModule,
  clearThinkingContent as clearThinkingContentModule,
} from "./chat/processing-steps.js";
import {
  setCurrentOllamaModel,
  requestOllamaModels,
  setModelLabel,
  populateModelDropdown,
  bindModelDropdownEvents,
} from "./chat/model-selector.js";
import {
  applyTheme,
  updateSendButtonStyle,
  updateChatContainerPadding,
  loadLanguage,
  applyLanguage,
  setCurrentLanguage,
  setLanguageData,
  initLanguageSelect,
} from "./chat/theme-language.js";

// mention-handler.js 모듈은 chat.js 내부 변수(chatInput, selectedFiles)에 의존하여
// 현재는 로컬 구현 사용. 향후 완전 분리 시 아래 import 활성화
// import { initMentionHandler, ... } from "./chat/mention-handler.js";

// message-queue.js 모듈은 chat.js 내부 변수(pendingQueueArea, loadingDepth)에 의존하여
// 현재는 로컬 구현 사용. 향후 완전 분리 시 아래 import 활성화
// import { initMessageQueue, ... } from "./chat/message-queue.js";

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


// ===== 처리 단계 및 스크롤 관련 함수들 (모듈 래퍼) =====
// 실제 구현은 ./chat/processing-steps.js 모듈에 있음

function setProcessingStep(stepName) {
  setProcessingStepModule(stepName);
  // done 단계에서 thinking content 정리
  if (stepName === 'done') {
    clearThinkingContentModule();
  }
}

function updateProcessingStatus(stepName, status) {
  updateProcessingStatusModule(stepName, status, handleScroll);
}

function handleScroll() {
  handleScrollModule();
}

function resetProcessingStatuses() {
  resetProcessingStatusesModule();
}

function showAutoCorrectingIndicator() {
  showAutoCorrectingIndicatorModule();
}

function hideAutoCorrectingIndicator() {
  hideAutoCorrectingIndicatorModule();
}

function showErrorCorrection(originalCommand, correctedCommand, retryCount) {
  showErrorCorrectionModule(originalCommand, correctedCommand, retryCount);
}

// ===== 스트리밍 메시지 처리 함수들 (모듈 래퍼) =====
// 실제 구현은 ./chat/streaming.js 모듈에 있음

function startStreamingMessage(sender, meta) {
  startStreamingMessageModule(sender, meta);
}

function appendStreamingChunk(chunk) {
  appendStreamingChunkModule(chunk);
}

function endStreamingMessage() {
  endStreamingMessageModule();
}

/**
 * 마지막 CODEPILOT 메시지에 토큰 뱃지를 추가합니다.
 */
function appendTokenBadgeToLastMessage(tokenInfo) {
  const chatMessages = document.getElementById("chat-messages");
  if (!chatMessages) return;

  // 마지막 codepilot 메시지 컨테이너 찾기
  const containers = chatMessages.querySelectorAll(".codepilot-message-container");
  if (containers.length === 0) return;
  const lastContainer = containers[containers.length - 1];

  // 이미 토큰 뱃지가 있으면 업데이트
  let badge = lastContainer.querySelector(".message-token-badge");
  if (!badge) {
    badge = document.createElement("div");
    badge.className = "message-token-badge";
    lastContainer.appendChild(badge);
  }

  const tokens = tokenInfo.tokens || 0;
  const model = tokenInfo.model || "";
  const formattedTokens = tokens >= 1000 ? (tokens / 1000).toFixed(1) + "K" : tokens.toString();

  badge.textContent = `${formattedTokens} tokens`;
  if (model) {
    badge.title = `Model: ${model} | Tokens: ${tokens.toLocaleString()}`;
  } else {
    badge.title = `Tokens: ${tokens.toLocaleString()}`;
  }
}

/**
 * 참조 추적 패널을 마지막 메시지에 추가합니다.
 */
function appendReferencePanelToLastMessage(referenceInfo) {
  const chatMessages = document.getElementById("chat-messages");
  if (!chatMessages || !referenceInfo || !referenceInfo.items || referenceInfo.items.length === 0) return;

  // 기존 참조 패널이 있으면 업데이트, 없으면 chat-messages 레벨에 삽입 (turn-actions 앞)
  let panel = chatMessages.querySelector(".reference-panel");
  if (!panel) {
    panel = document.createElement("div");
    panel.className = "reference-panel";
    // turn-actions가 있으면 그 앞에, 없으면 맨 뒤에 삽입
    const turnActions = chatMessages.querySelector(".turn-actions");
    if (turnActions) {
      chatMessages.insertBefore(panel, turnActions);
    } else {
      chatMessages.appendChild(panel);
    }
  }

  const typeLabels = {
    rag: "RAG",
    local_rule: "Rule",
    local_skill: "Skill",
    server_rule: "Rule",
    server_skill: "Skill",
  };

  const listItems = referenceInfo.items.map((item, idx) => {
    const typeLabel = typeLabels[item.type] || item.type;
    const chunkLabel = item.type === 'rag' ? ` #${idx + 1}` : "";
    const similarity = item.similarity != null ? ` (${(item.similarity * 100).toFixed(0)}%)` : "";
    return `<div class="ref-item"><span class="ref-type ${item.type}">${typeLabel}${chunkLabel}</span><span>${item.name}${similarity}</span></div>`;
  }).join("");

  panel.innerHTML = `<div class="reference-panel-toggle" onclick="var icon=this.querySelector('.toggle-icon');if(icon)icon.classList.toggle('expanded');var next=this.nextElementSibling;if(next)next.classList.toggle('show')"><span class="toggle-icon">&#9654;</span> ${referenceInfo.items.length}개 참조</div><div class="reference-panel-list">${listItems}</div>`;
}

function removeLastMessage() {
  removeLastMessageModule();
}

// ===== 스트리밍 메시지 처리 함수들 끝 =====

// sanitizeOptions -> ./chat/utils.js로 이동
// enhanceCodeBlocks -> ./chat/codeBlock.js로 이동
// escapeHtml -> ./chat/utils.js로 이동
// showAutoCorrectingIndicator, hideAutoCorrectingIndicator, showErrorCorrection -> ./chat/processing-steps.js로 이동
// resetProcessingStatuses -> ./chat/processing-steps.js로 이동
// sanitizeOptions -> ./chat/utils.js로 이동

const sendButton = document.getElementById("send-button");
const chatInput = document.getElementById("chat-input");
const chatMessages = document.getElementById("chat-messages"); // 스크롤 컨테이너
const clearHistoryButton = document.getElementById("clear-history-button"); // Clear History 버튼 참조
const cancelButton = document.getElementById("cancel-call-button"); // Cancel 버튼 참조
const queueSendButton = document.getElementById("queue-send-button"); // 다시 보내기 버튼
const imagePreviewContainer = document.getElementById(
  "image-preview-container",
);
const imagePreview = document.getElementById("image-preview");
const removeImageButton = document.getElementById("remove-image-button");
const modelDropdown = document.getElementById("model-dropdown");

// 파일 선택 관련 요소들 (상단 영역은 더 이상 사용하지 않음)
// const fileSelectionArea = document.getElementById("file-selection-area");
// const selectedFilesContainer = document.getElementById("selected-files-container");
// const clearFilesButton = document.getElementById("clear-files-button");
const filePickerButton = document.getElementById("file-picker-button");
let currentMode = window.chatMode || "CODE";

// 채팅 컨테이너 참조 추가
const chatContainer = document.getElementById("chat-container");
const pendingQueueArea = document.getElementById("pending-queue-area");

let thinkingBubbleElement = null;
let selectedImageBase64 = null; // Base64 인코딩된 이미지 데이터를 저장할 변수
let selectedImageMimeType = null; // 이미지 MIME 타입 저장
let selectedFiles = []; // 선택된 파일 목록

// 히스토리 lazy loading 상태
let _historyHasMore = false;
let _historyLoading = false;
let _prependBuffer = null; // prepend 중 임시 컨테이너
let selectedEditorCode = null; // 에디터에서 선택된 코드 { text, fileName, lineStart, lineEnd }
let loadingDepth = 0; // 중첩 로딩 상태(에러 우선 처리 대비)
let isPendingSend = false; // doSendUserMessage 호출 후 showLoading 수신 전 Race Condition 방지
let pendingQuestions = []; // 대기 중 사용자 질문 큐
let mentionObserver = null; // MutationObserver for mention restoration
let isRestoringMentions = false; // 멘션 복원 중 플래그 (무한 루프 방지)

// generateId -> ./chat/utils.js로 이동
// loadFileIcon -> ./chat/codeBlock.js로 이동

// Input handler 함수들 - 모듈 래퍼
function getChatInputText() {
  return getChatInputTextModule(chatInput);
}

function getChatInputDisplayContent() {
  return getChatInputDisplayContentModule(chatInput);
}

function getChatInputValue() {
  return getChatInputValueModule(chatInput);
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
    (file) => !existingMentions.has(file.path),
  );

  if (missingFiles.length === 0) {
    return;
  }

  console.log(
    "[restoreMentionsFromText] Missing files to restore:",
    missingFiles.map((f) => f.name),
  );

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
        false,
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
          // '@'가 앞에 있으면 함께 제거
          const atFileName = "@" + fileName;
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

        if (restoredAny) {
          break;
        } // 외부 for 루프도 중단하고 while 루프로 돌아감
      }

      // 이번 반복에서 아무것도 복원하지 못했으면 종료
      if (!restoredAny) {
        break;
      }
    }

    if (remainingFiles.length > 0) {
      console.log(
        "[restoreMentionsFromText] Could not restore:",
        remainingFiles.map((f) => f.name),
      );
    }
  } finally {
    isRestoringMentions = false;
  }
}

/**
 * chatInput에 MutationObserver를 설정하여 멘션 스팬이 텍스트로 변환될 때 즉시 복원합니다.
 */
function setupMentionObserver() {
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

  console.log("[setupMentionObserver] MutationObserver initialized");
}

function removeAtSymbolFromInput() {
  if (!chatInput) {
    return null;
  }

  // TreeWalker로 텍스트 노드만 순회하며 마지막 '@'가 포함된 노드 찾기
  const walker = document.createTreeWalker(
    chatInput,
    NodeFilter.SHOW_TEXT,
    null,
    false,
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
    chatInputHTML: chatInput.innerHTML,
  });

  if (lastAtNode && lastAtIndex !== -1) {
    const textContent = lastAtNode.textContent;
    // '@' 이후의 검색어 끝 찾기 (공백이나 문자열 끝까지)
    // '@검색어' 패턴에서 '@검색어' 부분만 제거
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

    console.log("[removeAtSymbolFromInput] After removal:", {
      beforeAt,
      afterSearch,
      newNodeText: lastAtNode.textContent,
      offset: beforeAt.length,
      chatInputHTML: chatInput.innerHTML,
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

  console.log(
    "[insertFileMention] Before removal, chatInput.innerHTML:",
    chatInput.innerHTML,
  );

  // '@' 제거 (기존 멘션 span은 유지) 및 삽입 위치 가져오기
  let insertPosition = null;
  if (removeAtSymbol) {
    insertPosition = removeAtSymbolFromInput();
  }

  console.log("[insertFileMention] insertPosition:", insertPosition);
  console.log(
    "[insertFileMention] After removal, chatInput.innerHTML:",
    chatInput.innerHTML,
  );

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
            mentionSpan.nextSibling,
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

  console.log(
    "[insertFileMention] Final chatInput.innerHTML:",
    chatInput.innerHTML,
  );
  console.log(
    "[insertFileMention] Final chatInput.childNodes:",
    Array.from(chatInput.childNodes).map((n) => ({
      type: n.nodeType,
      text: n.textContent,
      className: n.className,
    })),
  );
  autoResizeTextarea();
}

// 터미널 멘션 블록 삽입
function insertTerminalMention(terminalName) {
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

  autoResizeTextarea();
  chatInput.focus();
}

// Diagnostics 멘션 삽입
function insertDiagnosticsMention(errorCount, warningCount) {
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

  autoResizeTextarea();
  chatInput.focus();
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

  // 카운트 업데이트
  const countEl = document.getElementById("queue-header-count");
  if (countEl) {
    countEl.textContent = pendingQuestions.length > 0 ? `(${pendingQuestions.length})` : "";
  }

  // 아이템 목록 렌더링
  const itemsList = document.getElementById("queue-items-list");
  if (!itemsList) return;
  itemsList.innerHTML = "";
  pendingQuestions.forEach((item, idx) => {
    const el = document.createElement("div");
    el.className = "pending-item";

    const indexSpan = document.createElement("span");
    indexSpan.className = "queue-index";
    indexSpan.textContent = `${idx + 1}.`;

    const textSpan = document.createElement("span");
    textSpan.className = "text";
    textSpan.title = item.text || "";
    textSpan.textContent = (item.text || "").trim() || "(image/files only)";

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "cancel-btn";
    // outline 스타일 휴지통 아이콘
    cancelBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><polyline points="1.5,4 14.5,4"/><path d="M5,4V2h6v2"/><path d="M3.5,4l1,9h7l1-9"/><line x1="6.5" y1="7" x2="6.5" y2="10.5"/><line x1="9.5" y1="7" x2="9.5" y2="10.5"/></svg>`;
    cancelBtn.title = "삭제";
    cancelBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      removePendingQuestionById(item.id);
    });

    el.appendChild(indexSpan);
    el.appendChild(textSpan);
    el.appendChild(cancelBtn);
    itemsList.appendChild(el);
  });

  // UI 높이 변경 반영
  setTimeout(() => updateChatContainerPadding(), 0);
}

function sendNextQueuedQuestionIfIdle() {
  if (loadingDepth > 0 || isPendingSend) {
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
  const selectedCode = payload.selectedCode || null;
  const mode = payload.mode || currentMode || "CODE";
  const terminalCtx = payload.terminalContext || null;
  const diagnosticsCtx = payload.diagnosticsContext || null;
  const alreadyDisplayed = payload.alreadyDisplayed || false;

  isPendingSend = true; // showLoading 수신 전 Race Condition 방지
  updateSendCancelButtons(true); // 전송 시작 시 중지 버튼으로 스왑

  // 큐에서 온 메시지가 아닌 경우에만 표시 (큐 메시지는 이미 표시됨)
  if (!alreadyDisplayed) {
    // payload.displayText 우선, 없으면 입력창 내용 사용 (큐 메시지는 payload에 저장됨)
    const displayText = (payload.displayText || getChatInputDisplayContent()).trimEnd();
    const codeInfo = payload.selectedCode ? {
      fileName: payload.selectedCodeFileName || "",
      lineStart: payload.selectedCodeLineStart || 0,
      lineEnd: payload.selectedCodeLineEnd || 0,
    } : null;
    window.displayUserMessage(displayText, img, codeInfo);
  }
  window.showLoading();
  vscode.postMessage({
    command: "sendMessage",
    text: text,
    imageData: img,
    imageMimeType: imgMime,
    selectedFiles: files,
    selectedCode: selectedCode,
    terminalContext: terminalCtx,
    diagnosticsContext: diagnosticsCtx,
    mode,
  });
}

// normalizeLanguage, highlightCodeBlock -> ./chat/utils.js로 이동
// markdown-it 설정 -> ./chat/markdown.js로 이동
const md = createMarkdownRenderer();

// 슬래시 명령어 설정 -> ./chat/commands.js로 이동
// 슬래시 메뉴 상태 -> ./chat/slash-commands.js 모듈에서 관리

// '@' 파일 참조 메뉴 관련 변수 -> ./chat/at-mentions.js 모듈에서 관리
let fileList = []; // 파일 목록 캐시 (일부 함수에서 직접 사용)

// atMenuCategories -> ./chat/commands.js로 이동

// 선택된 터미널 컨텍스트 (단일 - 활성 터미널만 선택 가능)
let selectedTerminalContext = null;

// 선택된 진단(Diagnostics) 컨텍스트
let selectedDiagnosticsContext = null;

// 슬래시 메뉴 함수들 - 모듈 래퍼
function createSlashMenu() {
  return createSlashMenuModule();
}

function renderSlashMenu(filter = "") {
  renderSlashMenuModule(filter, chatInput, setCursorToEnd, vscode, autoResizeTextarea);
}

function selectSlashCategory(categoryId) {
  selectSlashCategoryModule(categoryId, chatInput, setCursorToEnd, vscode, autoResizeTextarea);
}

function hideSlashMenu() {
  hideSlashMenuModule();
}

function executeSlashCommand(action) {
  executeSlashCommandModule(action, chatInput, vscode, autoResizeTextarea);
}

// '@' 파일 참조 메뉴 함수들 - 모듈 래퍼
function createAtMenu() {
  return createAtMenuModule();
}

function hideAtMenu() {
  hideAtMenuModule();
}

// '@' 파일 참조 메뉴 렌더링
function renderAtMenu(filter = "") {
  const menu = createAtMenu();
  const atMenuState = getAtMenuState();
  const { mode: atMenuMode, selectedIndex: atMenuSelectedIndex } = atMenuState;

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
        setAtMenuSelectedIndex(parseInt(item.getAttribute("data-index")));
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
      setAtMenuVisible(true);
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
        setAtMenuSelectedIndex(parseInt(item.getAttribute("data-index")));
        renderAtMenu(filter);
      });
    });
  }

  // 참고: 터미널은 이제 selectCategory에서 바로 활성 터미널 컨텍스트를 요청함 (Continue IDE 방식)
  // atMenuMode === "terminal" 케이스는 더 이상 여기에서 렌더링되지 않음

  // 선택된 항목이 보이도록 스크롤 이동 (상태 다시 조회)
  const finalState = getAtMenuState();
  if (finalState.mode === "files") {
    const selectedItem = menu.querySelector(
      `.at-file-item[data-index="${finalState.selectedIndex}"]`,
    );
    if (selectedItem) {
      selectedItem.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  } else {
    const selectedItem = menu.querySelector(
      `.at-category-item[data-index="${finalState.selectedIndex}"]`,
    );
    if (selectedItem) {
      selectedItem.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  menu.style.display = "block";
  setAtMenuVisible(true);
}

// 카테고리 선택
function selectCategory(categoryId) {
  setSelectedAtCategory(categoryId);
  setAtMenuSelectedIndex(0);

  if (categoryId === "files") {
    setAtMenuMode("files");
    // 파일 목록 항상 새로 요청 (실시간 업데이트)
    if (vscode) {
      fileList = []; // 캐시 초기화
      vscode.postMessage({ command: "requestFileList" });
    }
  } else if (categoryId === "terminal") {
    // Terminal은 활성 터미널의 내용을 바로 가져옴 (Continue IDE 방식)
    // 먼저 '@' 기호 제거 (비동기 응답 전에 미리 처리)
    removeAtSymbolFromInput();
    hideAtMenu();
    chatInput.focus();
    if (vscode) {
      vscode.postMessage({ command: "requestTerminalContext" });
    }
    return; // 메뉴 렌더링 건너뛰기
  } else if (categoryId === "diagnostics") {
    // Diagnostics는 바로 컨텍스트 요청 (목록 없이 전체 진단 정보)
    // 먼저 '@' 기호 제거 (비동기 응답 전에 미리 처리)
    removeAtSymbolFromInput();
    hideAtMenu();
    chatInput.focus();
    if (vscode) {
      vscode.postMessage({ command: "requestDiagnosticsContext" });
    }
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
  setAtMenuMode("categories");
  setSelectedAtCategory(null);
  setAtMenuSelectedIndex(0);

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

// 참고: hideAtMenu()는 이미 위에서 모듈 래퍼로 정의됨 (hideAtMenuModule 호출)

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

// 큐 헤더 토글 (접기/펼치기)
const queueHeader = document.getElementById("queue-header");
if (queueHeader && pendingQueueArea) {
  queueHeader.addEventListener("click", () => {
    pendingQueueArea.classList.toggle("collapsed");
    setTimeout(() => updateChatContainerPadding(), 0);
  });
}

// 다시 보내기 버튼 (처리 중 입력 있을 때 표시)
if (queueSendButton) {
  queueSendButton.addEventListener("click", handleSendMessage);
}

// 메시지 전송 로직 (기존 코드 유지 - 절대 수정 금지 영역)
if (sendButton && chatInput) {
  sendButton.addEventListener("click", handleSendMessage);

  chatInput.addEventListener("keydown", function (e) {
    // '@' 메뉴가 열려있을 때 키보드 네비게이션
    const atState = getAtMenuState();
    if (atState.visible) {
      const currentValue = getChatInputValue();
      const atIndex = currentValue.lastIndexOf("@");
      const afterAt = atIndex !== -1 ? currentValue.substring(atIndex + 1) : "";

      // 카테고리 모드
      if (atState.mode === "categories") {
        const filter = afterAt.trim();
        const filteredCategories = atMenuCategories.filter(
          (cat) =>
            cat.label.toLowerCase().includes(filter.toLowerCase()) ||
            cat.description.toLowerCase().includes(filter.toLowerCase()),
        );

        if (e.key === "ArrowDown") {
          e.preventDefault();
          const newIndex = Math.min(
            atState.selectedIndex + 1,
            filteredCategories.length - 1,
          );
          setAtMenuSelectedIndex(newIndex);
          renderAtMenu(filter);
          setTimeout(() => {
            const menu = document.getElementById("at-file-menu");
            const selectedItem = menu?.querySelector(
              `.at-category-item[data-index="${newIndex}"]`,
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
          const newIndex = Math.max(atState.selectedIndex - 1, 0);
          setAtMenuSelectedIndex(newIndex);
          renderAtMenu(filter);
          setTimeout(() => {
            const menu = document.getElementById("at-file-menu");
            const selectedItem = menu?.querySelector(
              `.at-category-item[data-index="${newIndex}"]`,
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
          if (filteredCategories[atState.selectedIndex]) {
            selectCategory(filteredCategories[atState.selectedIndex].id);
          }
          return;
        } else if (e.key === "Escape") {
          e.preventDefault();
          hideAtMenu();
          return;
        }
      }
      // 파일 리스트 모드
      else if (atState.mode === "files") {
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
          const newIndex = Math.min(
            atState.selectedIndex + 1,
            filteredFiles.length - 1,
          );
          setAtMenuSelectedIndex(newIndex);
          renderAtMenu(filter);
          setTimeout(() => {
            const menu = document.getElementById("at-file-menu");
            const selectedItem = menu?.querySelector(
              `.at-file-item[data-index="${newIndex}"]`,
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
          const newIndex = Math.max(atState.selectedIndex - 1, 0);
          setAtMenuSelectedIndex(newIndex);
          renderAtMenu(filter);
          setTimeout(() => {
            const menu = document.getElementById("at-file-menu");
            const selectedItem = menu?.querySelector(
              `.at-file-item[data-index="${newIndex}"]`,
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
          if (filteredFiles[atState.selectedIndex]) {
            const file = filteredFiles[atState.selectedIndex];
            selectFileFromAtMenu(file.path, file.name);
          }
          return;
        }
      }
      // 참고: 터미널은 이제 selectCategory에서 바로 활성 터미널 컨텍스트를 요청함 (Continue IDE 방식)
      // 터미널 리스트 키보드 네비게이션 코드는 더 이상 필요하지 않음
    }

    // 슬래시 메뉴가 열려있을 때 키보드 네비게이션
    const slashState = getSlashMenuState();
    if (slashState.visible) {
      // 카테고리 모드인지 명령어 모드인지에 따라 다르게 처리
      if (slashState.mode === "categories") {
        const filteredCategories = slashCategories.filter(
          (cat) =>
            cat.label
              .toLowerCase()
              .includes(getChatInputValue().slice(1).toLowerCase()) ||
            cat.id
              .toLowerCase()
              .includes(getChatInputValue().slice(1).toLowerCase()),
        );

        if (e.key === "ArrowDown") {
          e.preventDefault();
          const newIndex = Math.min(
            slashState.selectedIndex + 1,
            filteredCategories.length - 1,
          );
          setSlashMenuSelectedIndex(newIndex);
          renderSlashMenu(getChatInputValue().slice(1));
          return;
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          const newIndex = Math.max(slashState.selectedIndex - 1, 0);
          setSlashMenuSelectedIndex(newIndex);
          renderSlashMenu(getChatInputValue().slice(1));
          return;
        } else if (e.key === "Enter") {
          e.preventDefault();
          if (filteredCategories[slashState.selectedIndex]) {
            selectSlashCategory(filteredCategories[slashState.selectedIndex].id);
          }
          return;
        } else if (e.key === "Escape") {
          e.preventDefault();
          hideSlashMenu();
          return;
        }
      } else {
        // 명령어 모드
        const commands = slashCommandsByCategory[slashState.selectedCategory] || [];
        // 입력값에서 카테고리 부분 제거하여 필터 생성 (예: "/git commit" -> "commit")
        const inputValue = getChatInputValue();
        const categoryPrefix = `/${slashState.selectedCategory} `;
        const commandFilter = inputValue.startsWith(categoryPrefix)
          ? inputValue.slice(categoryPrefix.length).trim()
          : "";
        const filteredCommands = commands.filter(
          (cmd) =>
            cmd.command.toLowerCase().includes(commandFilter.toLowerCase()) ||
            cmd.label.toLowerCase().includes(commandFilter.toLowerCase()),
        );

        if (e.key === "ArrowDown") {
          e.preventDefault();
          const newIndex = Math.min(
            slashState.selectedIndex + 1,
            filteredCommands.length - 1,
          );
          setSlashMenuSelectedIndex(newIndex);
          renderSlashMenu(commandFilter);
          return;
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          const newIndex = Math.max(slashState.selectedIndex - 1, 0);
          setSlashMenuSelectedIndex(newIndex);
          renderSlashMenu(commandFilter);
          return;
        } else if (e.key === "Enter") {
          e.preventDefault();
          if (filteredCommands[slashState.selectedIndex]) {
            executeSlashCommand(
              filteredCommands[slashState.selectedIndex].action,
            );
          }
          return;
        } else if (e.key === "Escape") {
          e.preventDefault();
          // 뒤로가기 (카테고리 모드로) - hideSlashMenu가 상태 초기화 포함
          hideSlashMenu();
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

    // 입력 내용에 따라 버튼 전환
    if (loadingDepth > 0 || isPendingSend) {
      // 처리 중: Stop ↔ 다시 보내기
      const hasContent = getChatInputText().trim() !== ""
        || !!selectedImageBase64
        || selectedFiles.length > 0;
      updateSendCancelButtons(hasContent ? 'queue' : true);
    } else {
      // 대기 중: Send ↔ Stop(비활성)
      updateSendCancelButtons(false);
    }

    // 브라우저가 멘션 스팬을 텍스트로 변환했을 수 있으므로 먼저 복원 시도
    // '@' 메뉴가 열려있을 때도 복원은 수행 (타이핑 중 변환된 멘션 복구)
    restoreMentionsFromText();

    // 멘션 블록이 DOM에서 삭제되었는지 확인하고 selectedFiles/selectedTerminalContext 동기화
    // '@' 메뉴가 열려있을 때는 동기화하지 않음 (멘션 삽입 중일 수 있으므로)
    const atStateForInput = getAtMenuState();
    if (!atStateForInput.visible) {
      syncMentionsWithDOM();
    }

    const value = getChatInputValue();
    const lastAtIndex = value.lastIndexOf("@");
    const lastSlashIndex = value.lastIndexOf("/");

    // '@' 입력 감지 (가장 마지막 '@' 이후에 스페이스가 없을 때만)
    // '@' 앞이 공백이거나 줄 시작일 때만 멘션으로 인식 (git@github.com 등 방지)
    const isValidMention = lastAtIndex === 0 || /\s/.test(value[lastAtIndex - 1]);
    if (
      lastAtIndex !== -1 &&
      isValidMention &&
      (lastSlashIndex === -1 || lastAtIndex > lastSlashIndex)
    ) {
      const afterAt = value.substring(lastAtIndex + 1);
      const parts = afterAt.trim().split(/\s+/);

      // 카테고리 모드인지 파일 모드인지 확인
      if (parts.length === 0 || (parts.length === 1 && parts[0] === "")) {
        // 카테고리 모드
        setAtMenuMode("categories");
        setAtMenuSelectedIndex(0);
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
          const currentAtState = getAtMenuState();
          if (currentAtState.mode !== targetMode || currentAtState.selectedCategory !== category.id) {
            setAtMenuMode(targetMode);
            setSelectedAtCategory(category.id);
            setAtMenuSelectedIndex(0);
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
          setAtMenuMode("categories");
          setAtMenuSelectedIndex(0);
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
      setSlashMenuSelectedIndex(0);
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
    const slashStateClick = getSlashMenuState();
    const atStateClick = getAtMenuState();
    if (
      slashStateClick.visible &&
      slashMenu &&
      !slashMenu.contains(e.target) &&
      e.target !== chatInput
    ) {
      hideSlashMenu();
    }
    if (
      atStateClick.visible &&
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
    selectedDiagnosticsContext ||
    selectedEditorCode
  ) {
    // 텍스트, 이미지, 선택된 파일, 터미널 컨텍스트, 또는 Diagnostics 컨텍스트가 있을 때만 전송
    // 큐 진입 시 표시할 텍스트를 미리 캡처 (입력창 클리어 전)
    const displayText = getChatInputDisplayContent().trimEnd();
    // 에디터 선택이 있으면 text(userQuery)에 라벨 접두어 추가 → 히스토리에 보존
    let finalText = text;
    if (selectedEditorCode) {
      const li = selectedEditorCode.lineStart === selectedEditorCode.lineEnd
        ? `L${selectedEditorCode.lineStart}`
        : `L${selectedEditorCode.lineStart}-${selectedEditorCode.lineEnd}`;
      finalText = `${selectedEditorCode.fileName} ${li} ${text}`;
    }
    const payload = {
      id: generateId(),
      text: finalText,
      displayText: displayText, // 큐에서 꺼낼 때 채팅창 표시용
      imageData: selectedImageBase64,
      imageMimeType: selectedImageMimeType,
      selectedFiles: selectedFiles.map((file) => file.path),
      selectedCode: selectedEditorCode ? selectedEditorCode.text : null,
      selectedCodeFileName: selectedEditorCode ? selectedEditorCode.fileName : null,
      selectedCodeLineStart: selectedEditorCode ? selectedEditorCode.lineStart : null,
      selectedCodeLineEnd: selectedEditorCode ? selectedEditorCode.lineEnd : null,
      terminalContext: selectedTerminalContext
        ? selectedTerminalContext.contextString
        : null,
      diagnosticsContext: selectedDiagnosticsContext
        ? selectedDiagnosticsContext.contextString
        : null,
      mode: currentMode,
    };

    if (loadingDepth > 0 || isPendingSend) {
      // AI 응답 대기 중: 채팅창에 표시하지 않고 큐에만 적재 (응답 완료 후 순서대로 전송)
      enqueuePendingQuestion(payload);
      updateSendCancelButtons(true); // 입력 비워졌으니 Stop 버튼으로
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
    // 에디터 선택 코드 chip 초기화
    selectedEditorCode = null;
    const chipEl = document.getElementById("editor-selection-chip");
    if (chipEl) chipEl.classList.remove("visible");
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


// 모드 변경 이벤트 수신
window.addEventListener("chat-mode-changed", () => {
  currentMode = window.chatMode || "CODE";
  // 모드 변경 시 보내기 버튼 스타일 업데이트
  updateSendButtonStyle();
});



document.addEventListener("DOMContentLoaded", () => {
  // 모듈 초기화
  initStreaming({
    chatMessages,
    thinkingBubbleElement: null, // 동적으로 설정됨
    md,
    sanitizeHtml,
    addCopyButtonsToCodeBlocks,
  });

  initProcessingSteps({
    chatMessages,
    chatContainer,
  });

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

  // 스크롤 이벤트 리스너 등록 (버블 고정용 + 히스토리 lazy loading)
  if (chatContainer) {
    chatContainer.addEventListener("scroll", handleScroll);
    chatContainer.addEventListener("scroll", function () {
      // 스크롤이 맨 위 근처에 도달하면 이전 히스토리 로드
      if (chatContainer.scrollTop < 50 && _historyHasMore && !_historyLoading) {
        _historyLoading = true;
        console.log("[chat.js] Scroll top reached, requesting more history");
        vscode.postMessage({ command: "loadMoreHistory" });
      }
    });
  }

  // 모델 목록 요청 및 드롭다운 초기화
  bindModelDropdownEvents();
  requestOllamaModels();

  // 언어 선택 초기화 (이벤트 바인딩 + 초기 언어 요청)
  initLanguageSelect();

  // 테마 설정 요청
  if (vscode) {
    vscode.postMessage({ command: "getChatTheme" });
  }

  // 에디터 선택 chip dismiss 버튼
  const editorSelectionChip = document.getElementById("editor-selection-chip");
  const editorSelectionDismiss = document.getElementById("editor-selection-chip-dismiss");
  if (editorSelectionDismiss) {
    editorSelectionDismiss.addEventListener("click", () => {
      selectedEditorCode = null;
      if (editorSelectionChip) editorSelectionChip.classList.remove("visible");
      updateChatContainerPadding();
    });
  }

  // 웹뷰 초기화 완료 알림 (pending changes/turn actions 복원용)
  if (vscode) {
    vscode.postMessage({ command: "webviewLoaded" });
  }
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
    case "editorSelectionChanged": {
      selectedEditorCode = {
        text: message.text,
        fileName: message.fileName,
        lineStart: message.lineStart,
        lineEnd: message.lineEnd,
      };
      const chip = document.getElementById("editor-selection-chip");
      const chipLabel = document.getElementById("editor-selection-chip-label");
      if (chip && chipLabel) {
        const lineInfo = message.lineStart === message.lineEnd
          ? `L${message.lineStart}`
          : `L${message.lineStart}-${message.lineEnd}`;
        chipLabel.textContent = `${message.fileName} ${lineInfo}`;
        chip.classList.add("visible");
        updateChatContainerPadding();
      }
      break;
    }
    case "editorSelectionCleared": {
      selectedEditorCode = null;
      const chip = document.getElementById("editor-selection-chip");
      if (chip) {
        chip.classList.remove("visible");
        updateChatContainerPadding();
      }
      break;
    }
    case "showLoading":
      console.log("Received showLoading command.");
      isPendingSend = false; // 정상적으로 showLoading 받음
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
      isPendingSend = false; // showLoading 미수신 엣지 케이스 방어
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
    case "askQuestion":
      renderAskQuestionUI(message.title, message.questions, message.requestId);
      break;
    case "showPlanApproval":
      renderPlanApprovalUI(message.planText);
      break;
    case "autoPlanExecute": {
      const planExecText = message.text || "위 계획대로 진행해줘";
      window.showLoading();
      vscode.postMessage({
        command: "sendMessage",
        text: planExecText,
        mode: "CODE",
      });
      break;
    }
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
    case "updateThinkingContent":
      if (message.text) {
        updateThinkingContentModule(message.text);
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
      populateModelDropdown(message.models || [], message.current || "", message.adminModels || [], message.supportedModels || []);
      break;
    case "ollamaModelChanged":
      console.log("[chat] ollamaModelChanged received:", message.model);
      if (message.model) {
        setCurrentOllamaModel(message.model);

        // 드롭다운에서 일치하는 아이템을 찾아 displayName과 modelType 결정
        let display = message.model;
        let modelType = "ollama";
        let matchFound = false;
        if (modelDropdown) {
          const allItems = modelDropdown.querySelectorAll(".dropdown-option");
          allItems.forEach((item) => {
            if (item.dataset.model === message.model) {
              display = item.textContent || message.model;
              item.classList.add("selected");
              matchFound = true;
            } else {
              item.classList.remove("selected");
            }
          });
        }
        if (message.model.startsWith("supported:")) {
          modelType = "supported";
        } else if (message.model.startsWith("admin:")) {
          modelType = "admin";
        }

        // 드롭다운에 매칭 아이템이 없으면 전체 모델 리스트 재요청 (드롭다운 미초기화 상태)
        if (!matchFound) {
          console.log("[chat] No matching dropdown item, requesting full model list refresh");
          requestOllamaModels();
        } else {
          console.log("[chat] Setting model label:", display, modelType);
          setModelLabel(display, modelType);
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

    case "scrollToBottom":
      if (chatMessages) {
        chatMessages.scrollTop = chatMessages.scrollHeight;
      }
      break;

    // ═══════════ 히스토리 lazy loading ═══════════
    case "historyMeta":
      _historyHasMore = message.hasMore;
      _historyLoading = false;
      console.log(`[chat.js] historyMeta: hasMore=${message.hasMore}, loaded=${message.loadedCount}/${message.totalCount}`);
      break;

    case "prependHistoryStart":
      // prepend 시작 — 스크롤 위치 보존을 위해 현재 높이 기록
      if (chatMessages) {
        chatMessages._prevScrollHeight = chatMessages.scrollHeight;
        chatMessages._prevScrollTop = chatMessages.scrollTop;
      }
      _prependBuffer = document.createDocumentFragment();
      break;

    case "prependUserMessage": {
      if (!_prependBuffer || !chatMessages) break;
      const userDiv = document.createElement("div");
      userDiv.className = "user-message-container";
      const bubble = document.createElement("div");
      bubble.className = "user-message";
      bubble.textContent = message.text;
      userDiv.appendChild(bubble);
      _prependBuffer.appendChild(userDiv);
      break;
    }

    case "prependMessage": {
      if (!_prependBuffer || !chatMessages) break;
      const msgDiv = document.createElement("div");
      if (message.sender === "CODEPILOT") {
        msgDiv.className = "codepilot-message-container";
        // renderCodePilotContent로 라이브 메시지와 동일하게 렌더링
        const rendered = renderCodePilotContent(message.text);
        if (rendered) {
          msgDiv.appendChild(rendered);
        } else {
          const msgBubble = document.createElement("div");
          msgBubble.className = "message-bubble";
          msgBubble.textContent = message.text;
          msgDiv.appendChild(msgBubble);
        }
      } else {
        msgDiv.className = "system-message";
        msgDiv.textContent = message.text;
      }
      _prependBuffer.appendChild(msgDiv);
      break;
    }

    case "prependHistoryEnd":
      // prepend 완료 — DOM에 삽입 후 스크롤 위치 보존
      if (_prependBuffer && chatMessages) {
        chatMessages.insertBefore(_prependBuffer, chatMessages.firstChild);
        // 스크롤 위치 보존: 새로 추가된 높이만큼 스크롤 이동
        const newScrollHeight = chatMessages.scrollHeight;
        const addedHeight = newScrollHeight - (chatMessages._prevScrollHeight || 0);
        chatMessages.scrollTop = (chatMessages._prevScrollTop || 0) + addedHeight;
        console.log(`[chat.js] Prepended history, added height: ${addedHeight}px`);
      }
      _prependBuffer = null;
      _historyLoading = false;
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
        const atStateFileList = getAtMenuState();
        if (atStateFileList.visible && atStateFileList.mode === "files" && chatInput) {
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
          const existingMention = chatInput.querySelector(".terminal-mention");
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
    case "chatTheme":
      // 테마 설정 수신
      if (message.theme) {
        applyTheme(message.theme);
      }
      break;
    case "currentLanguage":
      if (message.language) {
        setCurrentLanguage(message.language);
        const langSel = document.getElementById("language-select");
        if (langSel) {
          langSel.value = message.language;
        }
        loadLanguage(message.language);
      }
      break;
    case "languageDataReceived":
      if (message.language && message.data) {
        setLanguageData(message.data, message.language);
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
      startStreamingMessage(message.sender, message.meta);
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

    case "updateMessageTokenInfo":
      if (message.tokenInfo) {
        appendTokenBadgeToLastMessage(message.tokenInfo);
      }
      break;

    case "updateReferenceInfo":
      if (message.referenceInfo) {
        appendReferencePanelToLastMessage(message.referenceInfo);
      }
      break;

    case "showTurnActions":
      // 파일 diff 완료 후, review 스트리밍 전에 턴 액션 삽입
      if (message.turns) {
        window._latestTurnStats = message.turns;
      }
      if (typeof window._flushPendingTurnActions === "function") {
        window._flushPendingTurnActions();
      }
      break;

    case "removeLastMessage":
      console.log("[Streaming] Removing last message (natural language retry)");
      removeLastMessage();
      break;

    case "showSuggestions":
      renderSuggestions(message.suggestions);
      break;
  }
});

// --- Prompt Suggestion 렌더링 ---
function renderSuggestions(suggestions) {
  // Remove existing suggestions
  const existing = document.querySelector('.suggestion-container');
  if (existing) existing.remove();

  if (!suggestions || suggestions.length === 0) return;

  const container = document.createElement('div');
  container.className = 'suggestion-container';

  const label = document.createElement('div');
  label.className = 'suggestion-label';
  label.textContent = '다음 작업 제안';
  container.appendChild(label);

  const optionsDiv = document.createElement('div');
  optionsDiv.className = 'suggestion-options';

  suggestions.forEach(s => {
    const btn = document.createElement('button');
    btn.className = 'suggestion-btn';
    btn.textContent = s.text;
    btn.title = s.prompt;
    btn.addEventListener('click', () => {
      container.remove();
      if (chatInput) {
        chatInput.textContent = s.prompt;
        handleSendMessage();
      }
    });
    optionsDiv.appendChild(btn);
  });

  container.appendChild(optionsDiv);

  // Insert at end of chat messages
  const chatMessages = document.getElementById('chat-messages');
  if (chatMessages) {
    chatMessages.appendChild(container);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}

// --- UI 업데이트 및 마크다운 렌더링 관련 함수 정의 ---
// 메시지 표시 함수들 - 모듈 래퍼

// 사용자 메시지 표시
function displayUserMessage(text, imageData = null, selectedCodeInfo = null) {
  const container = displayUserMessageModule(text, imageData, chatMessages, scrollToUserMessage);
  // 에디터 선택 코드가 있으면 메시지 버블 아래에 badge 추가
  if (container && selectedCodeInfo) {
    const badge = document.createElement("span");
    badge.className = "editor-selection-badge";
    const lineInfo = selectedCodeInfo.lineStart === selectedCodeInfo.lineEnd
      ? `L${selectedCodeInfo.lineStart}`
      : `L${selectedCodeInfo.lineStart}-${selectedCodeInfo.lineEnd}`;
    badge.textContent = `⌥ ${selectedCodeInfo.fileName} ${lineInfo}`;
    const msgEl = container.querySelector(".user-plain-message");
    if (msgEl) msgEl.prepend(badge);
  }
  return container;
}

// 시스템 메시지 표시
function displaySystemMessage(text) {
  const isLightTheme = document.body.getAttribute("data-theme") === "light";
  return displaySystemMessageModule(text, chatMessages, isLightTheme, sanitizeHtml, sanitizeOptions);
}

// 사용자 메시지로 스크롤
function scrollToUserMessage(userMessageElement) {
  scrollToUserMessageModule(userMessageElement, chatMessages);
}

// 로딩 버블 생성 함수
function showLoading() {
  if (!chatMessages || thinkingBubbleElement) {
    return;
  }
  thinkingBubbleElement = showLoadingModule(chatMessages);

  // 모듈에 thinkingBubbleElement 전달
  setProcessingThinkingBubble(thinkingBubbleElement);
  setStreamingThinkingBubble(thinkingBubbleElement);

  // 로딩 애니메이션이 보일 때 Clear 버튼 비활성화, Cancel 버튼 활성화
  if (clearHistoryButton) {
    clearHistoryButton.disabled = true;
  }
  if (cancelButton) {
    cancelButton.disabled = false;
  }
  updateSendCancelButtons(true);

  // thinking 애니메이션이 추가된 후 즉시 스크롤을 해당 애니메이션으로 이동 (여러 번 시도)
  scrollToThinkingBubble(thinkingBubbleElement);
}

// thinking 버블로 스크롤하는 함수 (여러 번 시도)
// scrollIntoView({ block: "end" })는 버블을 뷰포트 맨 아래에 놓지만,
// 하단 입력 영역(.bottom-fixed-area)에 가려져 handleScroll이 is-forced-top을 적용함.
// 대신 chatContainer.scrollTo()로 최대 스크롤하면 padding-bottom: 220px 덕분에
// 버블이 입력 영역 위에 위치함.
function scrollToThinkingBubble(thinkingElement) {
  let attempts = 0;
  const maxAttempts = 5;

  const attemptScroll = () => {
    attempts++;
    if (thinkingElement && thinkingElement.offsetHeight > 0) {
      // chatContainer를 최대 하단으로 스크롤 (padding-bottom이 입력 영역 높이를 보상)
      if (chatContainer) {
        chatContainer.scrollTo({
          top: chatContainer.scrollHeight,
          behavior: "smooth",
        });
      }
      return true; // 성공
    } else if (attempts < maxAttempts) {
      // 아직 요소가 렌더링되지 않았으면 다시 시도
      setTimeout(attemptScroll, 20);
      return false; // 아직 시도 중
    } else {
      // 최대 시도 횟수 초과 시 fallback
      if (chatContainer) {
        chatContainer.scrollTop = chatContainer.scrollHeight;
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

    // 모듈에 thinkingBubbleElement null 전달
    setProcessingThinkingBubble(null);
    setStreamingThinkingBubble(null);
  }

  // 상태 배열 초기화 (모듈 함수 호출)
  resetProcessingStatuses();

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
  if (isSending === 'queue') {
    // 처리 중 + 입력 있음: 다시 보내기 버튼
    sendButton.classList.add("hidden");
    sendButton.style.display = "none";
    cancelButton.classList.add("hidden");
    cancelButton.style.display = "none";
    cancelButton.disabled = true;
    if (queueSendButton) {
      queueSendButton.classList.remove("hidden");
      queueSendButton.style.display = "inline-flex";
      queueSendButton.style.order = "99";
      // 모드별 배경색 동기화
      const mode = window.chatMode || "CODE";
      const queueIcon = queueSendButton.querySelector(".icon-img");
      if (mode === "ASK") {
        queueSendButton.style.backgroundColor = "#10B981";
        queueSendButton.style.borderRadius = "50%";
        if (queueIcon) queueIcon.style.filter = "brightness(0) invert(1)";
      } else if (mode === "PLAN") {
        queueSendButton.style.backgroundColor = "#2563EB";
        queueSendButton.style.borderRadius = "50%";
        if (queueIcon) queueIcon.style.filter = "brightness(0) invert(1)";
      } else if (mode === "AGENT") {
        queueSendButton.style.backgroundColor = "#000000";
        queueSendButton.style.borderRadius = "50%";
        if (queueIcon) queueIcon.style.filter = "brightness(0) invert(1)";
      } else {
        queueSendButton.style.backgroundColor = "transparent";
        queueSendButton.style.borderRadius = "6px";
        if (queueIcon) queueIcon.style.filter = "";
      }
    }
  } else if (isSending) {
    // 처리 중 + 입력 없음: Stop 버튼
    sendButton.classList.add("hidden");
    sendButton.style.display = "none";
    cancelButton.classList.remove("hidden");
    cancelButton.style.display = "inline-flex";
    cancelButton.style.order = "99"; // 오른쪽 끝으로 배치
    cancelButton.disabled = false;
    if (queueSendButton) {
      queueSendButton.classList.add("hidden");
      queueSendButton.style.display = "none";
    }
  } else {
    // 대기 중: 입력 내용 있으면 Send, 없으면 Stop(비활성)
    const hasContent = typeof chatInput !== "undefined" && chatInput
      ? (getChatInputText().trim() !== "" || !!selectedImageBase64 || selectedFiles.length > 0)
      : false;
    if (queueSendButton) {
      queueSendButton.classList.add("hidden");
      queueSendButton.style.display = "none";
    }
    cancelButton.classList.add("hidden");
    cancelButton.style.display = "none";
    cancelButton.disabled = true;
    cancelButton.style.order = "0";
    sendButton.classList.remove("hidden");
    sendButton.style.display = "inline-flex";
    sendButton.style.order = "99";
    sendButton.disabled = !hasContent;
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
            <h3 style="margin: 0 0 12px 0; color: var(--vscode-foreground); font-size: 16px;">대화 기록 삭제</h3>
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
      // 모듈에도 알림
      setProcessingThinkingBubble(null);
      setStreamingThinkingBubble(null);
      // 턴 액션(undo/keep) 상태 초기화
      window._latestTurnStats = [];
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

// removeToolTags, sanitizeLastResort -> ./chat/utils.js로 이동

/**
 * 마크다운 텍스트를 코드 블록 파싱 + 파일 카드 렌더링하여 DOM 요소로 반환
 * displayCodePilotMessage와 prependMessage 양쪽에서 재사용
 * @param {string} markdownText - 마크다운 텍스트
 * @returns {HTMLElement|null} - 렌더링된 message-bubble 요소, 또는 빈 텍스트면 null
 */
function renderCodePilotContent(markdownText) {
  // 1차: 최후 방어선 적용 (tool 태그 완전 차단)
  let sanitizedText = sanitizeLastResort(markdownText);
  if (!sanitizedText || sanitizedText.trim().length === 0) {
    return null;
  }

  // 2차: 기존 removeToolTags 적용
  const displayText = removeToolTags(sanitizedText);

  const bubbleElement = document.createElement("div");
  bubbleElement.classList.add("message-bubble");

  // --- Markdown 텍스트를 코드 블록 기준으로 분할 및 조합 ---
  // ✅ 수정: 닫는 ```는 줄 시작 위치에서만 매칭 (코드 내부의 백틱과 구분)
  // - ^```는 멀티라인 모드(m)에서 줄 시작에 있는 ```만 매칭
  // - 코드 내용에 ``` 포함된 경우 (예: const match = str.match(/```/)) 잘못 종료되지 않음
  const codeBlockRegex = /```([^\n]*?)\n([\s\S]*?)^```/gm;
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

  addCopyButtonsToCodeBlocks(bubbleElement);

  return bubbleElement;
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

  const bubbleElement = renderCodePilotContent(markdownText);
  if (!bubbleElement) {
    console.log(
      "[displayCodePilotMessage] Empty text after sanitization, skipping",
    );
    return;
  }

  const messageContainer = document.createElement("div");
  messageContainer.classList.add("codepilot-message-container");
  messageContainer.appendChild(bubbleElement);

  appendBeforeThinkingBubble(chatMessages, messageContainer);

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
        "[chat.js] Terminal mention removed from DOM, clearing selectedTerminalContext",
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
function renderAskQuestionUI(title, questions, requestId) {
  const existing = document.querySelector(".ask-question-overlay");
  if (existing) existing.remove();

  const selectedAnswers = {};
  questions.forEach(q => { selectedAnswers[q.id] = []; });

  const overlay = document.createElement("div");
  overlay.className = "ask-question-overlay";

  const popup = document.createElement("div");
  popup.className = "ask-question-popup";

  const titleEl = document.createElement("div");
  titleEl.className = "ask-question-title";
  titleEl.textContent = title;
  popup.appendChild(titleEl);

  questions.forEach(q => {
    const item = document.createElement("div");
    item.className = "ask-question-item";

    const prompt = document.createElement("div");
    prompt.className = "ask-question-prompt";
    prompt.textContent = q.prompt;
    item.appendChild(prompt);

    const optionsDiv = document.createElement("div");
    optionsDiv.className = "ask-question-options";

    q.options.forEach(opt => {
      const btn = document.createElement("button");
      btn.className = "ask-question-option";
      btn.dataset.questionId = q.id;
      btn.dataset.optionId = opt.id;
      const labelSpan = document.createElement("strong");
      labelSpan.textContent = opt.label;
      btn.appendChild(labelSpan);
      if (opt.description) {
        const descSpan = document.createElement("span");
        descSpan.textContent = " — " + opt.description;
        descSpan.style.fontWeight = "normal";
        descSpan.style.opacity = "0.7";
        descSpan.style.fontSize = "11px";
        btn.appendChild(descSpan);
      }
      btn.addEventListener("click", () => {
        if (q.allowMultiple) {
          btn.classList.toggle("selected");
          if (btn.classList.contains("selected")) {
            selectedAnswers[q.id].push(opt.id);
          } else {
            selectedAnswers[q.id] = selectedAnswers[q.id].filter(id => id !== opt.id);
          }
        } else {
          optionsDiv.querySelectorAll(".ask-question-option").forEach(b => b.classList.remove("selected"));
          btn.classList.add("selected");
          selectedAnswers[q.id] = [opt.id];
        }
      });
      optionsDiv.appendChild(btn);
    });

    item.appendChild(optionsDiv);

    const otherDiv = document.createElement("div");
    otherDiv.className = "ask-question-other";
    const otherInput = document.createElement("input");
    otherInput.placeholder = "기타";
    otherInput.dataset.questionId = q.id;
    otherDiv.appendChild(otherInput);
    item.appendChild(otherDiv);

    popup.appendChild(item);
  });

  const submitBtn = document.createElement("button");
  submitBtn.className = "ask-question-submit";
  submitBtn.textContent = "선택 완료";
  submitBtn.addEventListener("click", () => {
    const finalAnswers = {};
    questions.forEach(q => {
      const otherInput = popup.querySelector(`input[data-question-id="${q.id}"]`);
      const otherText = otherInput ? otherInput.value.trim() : "";
      if (otherText) {
        finalAnswers[q.id] = [...selectedAnswers[q.id], otherText];
      } else if (selectedAnswers[q.id].length > 0) {
        finalAnswers[q.id] = selectedAnswers[q.id];
      } else {
        finalAnswers[q.id] = ["(no selection)"];
      }
    });
    vscode.postMessage({ command: "askQuestionResponse", requestId: requestId, answers: finalAnswers });
    overlay.style.opacity = "0";
    overlay.style.transition = "opacity 0.2s";
    setTimeout(() => overlay.remove(), 200);
  });

  popup.appendChild(submitBtn);
  overlay.appendChild(popup);

  const inputArea = document.getElementById("chat-input-area");
  if (inputArea && inputArea.parentNode) {
    inputArea.parentNode.insertBefore(overlay, inputArea);
  } else {
    document.body.appendChild(overlay);
  }
}

// ===== Plan Approval UI =====
function renderPlanApprovalUI(planText) {
  const chatContainer = document.getElementById("chat-container");
  if (!chatContainer) return;

  const container = document.createElement("div");
  container.className = "ask-question-container";
  container.style.textAlign = "center";

  const title = document.createElement("div");
  title.className = "ask-question-title";
  title.textContent = "위 계획을 승인하시겠습니까?";
  container.appendChild(title);

  const btnRow = document.createElement("div");
  btnRow.style.display = "flex";
  btnRow.style.gap = "10px";
  btnRow.style.justifyContent = "center";
  btnRow.style.marginTop = "10px";

  const approveBtn = document.createElement("button");
  approveBtn.className = "ask-question-submit";
  approveBtn.textContent = "승인 — 실행 시작";
  approveBtn.addEventListener("click", () => {
    const modeSelect = document.getElementById("mode-select");
    if (modeSelect) modeSelect.value = "CODE";

    vscode.postMessage({
      command: "sendMessage",
      text: "위 계획대로 진행해줘",
      mode: "CODE",
    });

    container.innerHTML = "";
    const done = document.createElement("div");
    done.className = "ask-question-title";
    done.textContent = "✓ 승인됨 — 실행을 시작합니다";
    done.style.opacity = "0.7";
    container.appendChild(done);
  });

  const rejectBtn = document.createElement("button");
  rejectBtn.className = "ask-question-submit";
  rejectBtn.style.background = "var(--vscode-button-secondary-background, #555)";
  rejectBtn.style.color = "var(--vscode-button-secondary-foreground, #fff)";
  rejectBtn.textContent = "거절";
  rejectBtn.addEventListener("click", () => {
    container.innerHTML = "";
    const done = document.createElement("div");
    done.className = "ask-question-title";
    done.textContent = "✗ 거절됨 — 계획을 수정하려면 새로 질의하세요";
    done.style.opacity = "0.5";
    container.appendChild(done);
  });

  btnRow.appendChild(approveBtn);
  btnRow.appendChild(rejectBtn);
  container.appendChild(btnRow);

  const wrapper = document.createElement("div");
  wrapper.className = "message-bubble bot";
  wrapper.appendChild(container);
  chatContainer.appendChild(wrapper);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}
