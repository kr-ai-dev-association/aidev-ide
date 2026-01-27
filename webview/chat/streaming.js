/**
 * Streaming Module
 * 스트리밍 메시지 처리 관련 기능
 */

// 스트리밍 메시지 처리 변수들
let streamingMessageElement = null;
let streamingTextContent = "";
let streamingRenderTimeout = null;

/**
 * 스트리밍 메시지 시작
 * @param {string} sender - 메시지 발신자
 * @param {HTMLElement} chatMessages - 채팅 메시지 컨테이너
 * @param {HTMLElement} thinkingBubbleElement - thinking 버블 요소
 * @param {Function} endStreamingMessageFn - 스트리밍 종료 함수
 */
export function startStreamingMessage(sender, chatMessages, thinkingBubbleElement, endStreamingMessageFn) {
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
    if (endStreamingMessageFn) {
      endStreamingMessageFn();
    }
  }

  // 새 메시지 요소 생성
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
 * @param {string} chunk - 추가할 텍스트 청크
 * @param {Function} renderFn - 렌더링 함수
 */
export function appendStreamingChunk(chunk, renderFn) {
  streamingTextContent += chunk;

  // 디바운싱: 빠른 청크 수신 시 렌더링 최적화
  if (streamingRenderTimeout) {
    clearTimeout(streamingRenderTimeout);
  }

  streamingRenderTimeout = setTimeout(() => {
    if (renderFn) {
      renderFn(streamingTextContent, streamingMessageElement);
    }
  }, 16); // 약 60fps
}

/**
 * 스트리밍 메시지 완료
 * @param {HTMLElement} chatMessages - 채팅 메시지 컨테이너
 * @param {Function} finalRenderFn - 최종 렌더링 함수
 */
export function endStreamingMessage(chatMessages, finalRenderFn) {
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

    // 최종 렌더링
    if (finalRenderFn) {
      finalRenderFn(streamingTextContent, contentElement);
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
 * think 태그에서 현재 진행 중인 사고 과정 추출
 * @param {string} text - 전체 텍스트
 * @returns {Object} thinkContent, isThinking, justCompleted
 */
export function extractCurrentThink(text) {
  // 아직 닫히지 않은 think 태그 찾기
  const openThinkMatch = text.match(/<think>([\s\S]*)$/i);
  if (openThinkMatch) {
    return {
      thinkContent: openThinkMatch[1].trim(),
      isThinking: true,
    };
  }

  // 가장 마지막 완료된 think 태그 찾기
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
 * think 태그를 제거한 텍스트 반환
 * @param {string} text - 원본 텍스트
 * @returns {string} think 태그가 제거된 텍스트
 */
export function removeThinkTags(text) {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*$/gi, "")
    .trim();
}

/**
 * 현재 스트리밍 요소 가져오기
 * @returns {HTMLElement|null}
 */
export function getStreamingMessageElement() {
  return streamingMessageElement;
}

/**
 * 현재 스트리밍 텍스트 가져오기
 * @returns {string}
 */
export function getStreamingTextContent() {
  return streamingTextContent;
}

/**
 * 스트리밍 상태 초기화
 */
export function resetStreamingState() {
  streamingMessageElement = null;
  streamingTextContent = "";
  if (streamingRenderTimeout) {
    clearTimeout(streamingRenderTimeout);
    streamingRenderTimeout = null;
  }
}
