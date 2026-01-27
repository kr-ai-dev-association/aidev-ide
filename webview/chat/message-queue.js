/**
 * Message Queue Module
 * 대기 중 사용자 질문 큐 관리 관련 기능
 */

// 대기 중 질문 큐
let pendingQuestions = [];
let loadingDepth = 0;

// 외부 의존성 (초기화 시 주입)
let pendingQueueArea = null;
let updateChatContainerPaddingFn = null;
let doSendUserMessageFn = null;

/**
 * Message Queue 모듈 초기화
 * @param {Object} deps - 의존성 객체
 */
export function initMessageQueue(deps) {
  pendingQueueArea = deps.pendingQueueArea;
  updateChatContainerPaddingFn = deps.updateChatContainerPadding;
  doSendUserMessageFn = deps.doSendUserMessage;
}

/**
 * 로딩 상태 설정
 * @param {number} depth
 */
export function setLoadingDepth(depth) {
  loadingDepth = depth;
}

/**
 * 로딩 상태 가져오기
 * @returns {number}
 */
export function getLoadingDepth() {
  return loadingDepth;
}

/**
 * 로딩 상태 증가
 */
export function incrementLoadingDepth() {
  loadingDepth++;
  return loadingDepth;
}

/**
 * 로딩 상태 감소
 */
export function decrementLoadingDepth() {
  loadingDepth = Math.max(0, loadingDepth - 1);
  return loadingDepth;
}

/**
 * 대기 질문 큐에 추가
 * @param {Object} payload - 질문 페이로드
 */
export function enqueuePendingQuestion(payload) {
  pendingQuestions.push(payload);
  updatePendingQueueUI();
}

/**
 * 대기 질문을 ID로 제거
 * @param {string} id - 질문 ID
 */
export function removePendingQuestionById(id) {
  pendingQuestions = pendingQuestions.filter((item) => item.id !== id);
  updatePendingQueueUI();
}

/**
 * 대기 큐 UI 업데이트
 */
export function updatePendingQueueUI() {
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
      removePendingQuestionById(item.id)
    );

    el.appendChild(textSpan);
    el.appendChild(cancelBtn);
    pendingQueueArea.appendChild(el);
  });

  // UI 높이 변경 반영
  if (updateChatContainerPaddingFn) {
    setTimeout(() => updateChatContainerPaddingFn(), 0);
  }
}

/**
 * 대기 중인 다음 질문을 전송 (idle 상태일 때)
 */
export function sendNextQueuedQuestionIfIdle() {
  if (loadingDepth > 0) {
    return;
  }
  if (pendingQuestions.length === 0) {
    return;
  }
  const next = pendingQuestions.shift();
  updatePendingQueueUI();

  // 전송 직전 실제 사용자 메시지를 출력하고 전송
  if (doSendUserMessageFn) {
    doSendUserMessageFn(next);
  }
}

/**
 * 대기 큐 가져오기
 * @returns {Array}
 */
export function getPendingQuestions() {
  return pendingQuestions;
}

/**
 * 대기 큐 초기화
 */
export function clearPendingQuestions() {
  pendingQuestions = [];
  updatePendingQueueUI();
}
