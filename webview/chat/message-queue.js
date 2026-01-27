/**
 * Message Queue Module
 * 대기 중인 사용자 질문 큐 관리
 */

let pendingQuestions = [];

/**
 * 고유 ID 생성
 * @returns {string}
 */
export function generateId() {
  return "q_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * 대기 중인 질문 추가
 * @param {Object} payload - 질문 페이로드
 */
export function enqueuePendingQuestion(payload) {
  pendingQuestions.push(payload);
  updatePendingQueueUI();
}

/**
 * ID로 대기 중인 질문 제거
 * @param {string} id - 질문 ID
 */
export function removePendingQuestionById(id) {
  pendingQuestions = pendingQuestions.filter((q) => q.id !== id);
  updatePendingQueueUI();
}

/**
 * 대기 중인 질문 목록 가져오기
 * @returns {Array}
 */
export function getPendingQuestions() {
  return pendingQuestions;
}

/**
 * 대기 중인 질문이 있는지 확인
 * @returns {boolean}
 */
export function hasPendingQuestions() {
  return pendingQuestions.length > 0;
}

/**
 * 다음 대기 중인 질문 가져오기 (제거하지 않음)
 * @returns {Object|null}
 */
export function peekNextQuestion() {
  return pendingQuestions.length > 0 ? pendingQuestions[0] : null;
}

/**
 * 다음 대기 중인 질문 가져오고 제거
 * @returns {Object|null}
 */
export function dequeueQuestion() {
  if (pendingQuestions.length === 0) return null;
  const question = pendingQuestions.shift();
  updatePendingQueueUI();
  return question;
}

/**
 * 대기 큐 UI 업데이트
 */
export function updatePendingQueueUI() {
  const pendingQueueArea = document.getElementById("pending-queue-area");
  if (!pendingQueueArea) return;

  if (pendingQuestions.length === 0) {
    pendingQueueArea.style.display = "none";
    pendingQueueArea.innerHTML = "";
    return;
  }

  pendingQueueArea.style.display = "block";
  pendingQueueArea.innerHTML = pendingQuestions
    .map(
      (q, index) => `
      <div class="pending-question-item" data-id="${q.id}">
        <span class="pending-index">${index + 1}</span>
        <span class="pending-text">${truncateText(q.text, 50)}</span>
        <button class="pending-remove" data-id="${q.id}" title="제거">×</button>
      </div>
    `
    )
    .join("");

  // 제거 버튼 이벤트
  pendingQueueArea.querySelectorAll(".pending-remove").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.getAttribute("data-id");
      removePendingQuestionById(id);
    });
  });
}

/**
 * 텍스트 자르기
 * @param {string} text - 원본 텍스트
 * @param {number} maxLength - 최대 길이
 * @returns {string}
 */
function truncateText(text, maxLength) {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
}

/**
 * 유휴 상태일 때 다음 대기 질문 전송
 * @param {number} loadingDepth - 현재 로딩 깊이
 * @param {Function} sendFn - 전송 함수
 * @returns {boolean} 전송 여부
 */
export function sendNextQueuedQuestionIfIdle(loadingDepth, sendFn) {
  if (loadingDepth > 0 || pendingQuestions.length === 0) {
    return false;
  }

  const nextQuestion = dequeueQuestion();
  if (nextQuestion && sendFn) {
    sendFn(nextQuestion);
    return true;
  }

  return false;
}

/**
 * 대기 큐 초기화
 */
export function clearPendingQuestions() {
  pendingQuestions = [];
  updatePendingQueueUI();
}
