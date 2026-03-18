/**
 * Streaming Module
 * 스트리밍 메시지 처리 관련 기능
 */

import { escapeHtml, removeToolTags, sanitizeLastResort, removeThinkTags, extractCurrentThink, sanitizeOptions } from "./utils.js";
import { enhanceCodeBlocks } from "./codeBlock.js";
import { appendBeforeThinkingBubble } from "./message-display.js";

// 스트리밍 메시지 처리 변수들
let streamingMessageElement = null;
let streamingTextContent = "";
let streamingRenderTimeout = null;

// 외부 의존성 (초기화 시 주입)
let chatMessages = null;
let thinkingBubbleElement = null;
let md = null;
let sanitizeHtml = null;
let addCopyButtonsToCodeBlocks = null;

/**
 * 스트리밍 모듈 초기화
 * @param {Object} deps - 의존성 객체
 */
export function initStreaming(deps) {
  chatMessages = deps.chatMessages;
  thinkingBubbleElement = deps.thinkingBubbleElement;
  md = deps.md;
  sanitizeHtml = deps.sanitizeHtml;
  addCopyButtonsToCodeBlocks = deps.addCopyButtonsToCodeBlocks;
}

/**
 * thinking bubble 요소 업데이트 (외부에서 변경 시)
 * @param {HTMLElement} element
 */
export function setThinkingBubbleElement(element) {
  thinkingBubbleElement = element;
}

/**
 * 스트리밍 메시지 시작
 * 새로운 스트리밍 응답을 위한 메시지 요소 생성
 * @param {string} sender - 발신자
 */
export function startStreamingMessage(sender, meta) {
  if (!chatMessages) {
    console.warn("[Streaming] chatMessages element not found");
    return;
  }

  // 스트리밍 시작 시 thinking bubble 숨김
  // EXECUTION phase는 shouldStreamToUI=false라 이 함수가 호출되지 않으므로 안전
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

  // 턴 ID 스탬프 (턴 레벨 Accept/Reject용)
  if (meta && meta.conversationTurnId) {
    messageContainer.setAttribute("data-turn-id", meta.conversationTurnId);
  }

  const bubbleElement = document.createElement("div");
  bubbleElement.classList.add("message-bubble");
  bubbleElement.innerHTML = `<div class="message-content"><span class="streaming-cursor"></span></div>`;

  messageContainer.appendChild(bubbleElement);
  streamingMessageElement = messageContainer;

  appendBeforeThinkingBubble(chatMessages, streamingMessageElement);
  streamingTextContent = "";

  // 스크롤을 하단으로
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

/**
 * 스트리밍 청크 추가
 * 수신된 텍스트 청크를 메시지에 추가
 * @param {string} chunk - 텍스트 청크
 */
export function appendStreamingChunk(chunk) {
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
 * 스트리밍 콘텐츠 렌더링
 * 누적된 텍스트를 마크다운으로 렌더링
 * think 태그는 실시간으로 표시하고 완료되면 제거
 */
function renderStreamingContent() {
  if (!streamingMessageElement) {
    return;
  }

  const contentElement = streamingMessageElement.querySelector(".message-content");
  if (!contentElement) {
    return;
  }

  try {
    // 현재 진행 중인 think 내용 추출
    const { thinkContent, isThinking } = extractCurrentThink(streamingTextContent);

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

      if (md && md.render && processedText) {
        // 3. 마크다운 렌더링
        const renderedHtml = md.render(processedText);
        // 4. sanitizeHtml 적용
        if (typeof sanitizeHtml === "function" && sanitizeOptions) {
          html += sanitizeHtml(renderedHtml, sanitizeOptions);
        } else {
          html += renderedHtml;
        }
      } else if (processedText) {
        html += escapeHtml(processedText);
      }
    }

    contentElement.innerHTML = html + '<span class="streaming-cursor"></span>';

    // 스트리밍 중에도 완성된 코드 블록 UI 개선 (접기/펼치기, 언어 라벨)
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
export function endStreamingMessage() {
  if (streamingRenderTimeout) {
    clearTimeout(streamingRenderTimeout);
    streamingRenderTimeout = null;
  }

  if (!streamingMessageElement) {
    return;
  }

  // 커서 제거 및 최종 렌더링
  const contentElement = streamingMessageElement.querySelector(".message-content");
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

      if (md && md.render && cleanText) {
        // 4. 마크다운 렌더링
        const renderedHtml = md.render(cleanText);

        // 5. HTML 새니타이징 적용 (XSS 방지)
        if (typeof sanitizeHtml === "function" && sanitizeOptions) {
          contentElement.innerHTML = sanitizeHtml(renderedHtml, sanitizeOptions);
        } else {
          contentElement.innerHTML = renderedHtml;
        }
      }

      // 코드 블록 UI 개선 (접기/펼치기, 언어 라벨, 아이콘)
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
 * 스트리밍 상태 가져오기
 */
export function getStreamingState() {
  return {
    isStreaming: streamingMessageElement !== null,
    textContent: streamingTextContent,
  };
}

/**
 * 스트리밍 메시지 요소 가져오기 (외부에서 필요 시)
 */
export function getStreamingMessageElement() {
  return streamingMessageElement;
}

/**
 * 마지막 메시지 제거
 * 자연어 재시도 시 이미 스트리밍된 메시지를 UI에서 제거
 */
export function removeLastMessage() {
  if (!chatMessages) return;
  const lastMessage = chatMessages.querySelector('.codepilot-message-container:last-child');
  if (lastMessage) {
    lastMessage.remove();
  }
}
