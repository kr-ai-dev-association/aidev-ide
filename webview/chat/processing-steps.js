/**
 * Processing Steps Module
 * thinking bubble 및 처리 단계 표시 관련 기능
 */

// 처리 단계 제어 변수들
let processingStepsArray = [];
let typingInterval = null;
let lastFullText = "";
let lastUpdateTime = 0; // 빠른 연속 업데이트 감지용

// 외부 의존성 (초기화 시 주입)
let thinkingBubbleElement = null;
let chatMessages = null;
let chatContainer = null;

// is-forced-top 적용을 일시 억제하는 타이머
// 버블 생성 직후 smooth scroll 완료 전에 handleScroll이 강제 고정하는 것을 방지
let _suppressForcedTop = false;

// 컨텐츠 변경(파일 생성/수정 등) 후 고정↔해제 반복을 방지하는 debounce 타이머
let _scrollDebounceTimer = null;

/**
 * 사용자가 위로 스크롤하여 하단에서 떨어져 있는지 판단
 * 하단 100px 이내이면 "하단에 있음" (auto-scroll 허용)
 */
function isUserScrolledUp() {
  if (!chatMessages) return false;
  const threshold = 100;
  return chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight > threshold;
}

/**
 * Processing Steps 모듈 초기화
 * @param {Object} deps - 의존성 객체
 */
export function initProcessingSteps(deps) {
  chatMessages = deps.chatMessages;
  chatContainer = deps.chatContainer;
}

/**
 * thinking bubble 요소 설정
 * @param {HTMLElement} element
 */
export function setThinkingBubbleElement(element) {
  thinkingBubbleElement = element;

  // 버블이 새로 설정되면 is-forced-top 억제 (smooth scroll이 완료될 때까지)
  if (element) {
    _suppressForcedTop = true;
    setTimeout(() => {
      _suppressForcedTop = false;
    }, 600);
  }
}

/**
 * thinking bubble 요소 가져오기
 * @returns {HTMLElement|null}
 */
export function getThinkingBubbleElement() {
  return thinkingBubbleElement;
}

/**
 * 처리 단계 배열 가져오기
 * @returns {Array}
 */
export function getProcessingStepsArray() {
  return processingStepsArray;
}

/**
 * 단계 라벨 매핑
 */
const stepLabels = {
  intent: "의도 분석",
  assembling: "컨텍스트 수집",
  thinking: "분석 및 생각",
  plan: "작업 계획 수립",
  executing: "도구 실행",
  review: "결과 검토",
  done: "작업 완료",
};

/**
 * thinking bubble 텍스트 업데이트
 */
export function updateThinkingBubbleText() {
  if (!thinkingBubbleElement) {
    return;
  }

  // 모든 단계를 '|'로 이어 붙이는 대신, 현재 진행 중인 최신 단계 하나만 표시합니다.
  const lastStep = processingStepsArray[processingStepsArray.length - 1];
  if (!lastStep) {
    return;
  }

  const status = lastStep.status || "";
  const stepName = lastStep.step || "";

  // 'processing'이나 'Waiting...' 같은 기본값보다는 실제 의미 있는 상태 메시지(status)를 우선 사용합니다.
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

  const now = Date.now();
  const timeSinceLastUpdate = now - lastUpdateTime;
  lastUpdateTime = now;

  // 빠른 연속 업데이트 시 (150ms 이내) 타이핑 애니메이션 생략 → 즉시 표시
  if (timeSinceLastUpdate < 150) {
    textElement.textContent = newFullText;
    if (chatMessages && !isUserScrolledUp()) {
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    return;
  }

  // 타자기 효과 시작 (간격이 충분할 때만)
  let index = 0;
  textElement.textContent = "";
  typingInterval = setInterval(() => {
    if (index < newFullText.length) {
      textElement.textContent += newFullText[index];
      index++;
      // 사용자가 하단 근처에 있을 때만 자동 스크롤 (위로 스크롤 중이면 방해하지 않음)
      if (chatMessages && !isUserScrolledUp()) {
        chatMessages.scrollTop = chatMessages.scrollHeight;
      }
    } else {
      clearInterval(typingInterval);
      typingInterval = null;
    }
  }, 10); // 타자기 속도 (20ms → 10ms)
}

/**
 * 처리 단계 설정
 * @param {string} stepName - 단계 이름
 */
export function setProcessingStep(stepName) {
  console.log(`[processing-steps] setProcessingStep called: stepName=${stepName}`);

  // 🔥 thinking bubble이 숨겨져 있으면 다시 표시
  if (thinkingBubbleElement && thinkingBubbleElement.style.display === "none") {
    console.log(`[processing-steps] Showing hidden thinking bubble for step: ${stepName}`);
    thinkingBubbleElement.style.display = "";
  }

  // global array update — 현재 활성 단계를 항상 배열 끝으로 이동
  // (재시도 시 review→executing 전환 등에서 마지막 항목이 현재 단계여야 함)
  const existingStepIndex = processingStepsArray.findIndex(
    (s) => s.step === stepName
  );
  if (existingStepIndex === -1) {
    processingStepsArray.push({ step: stepName, status: "processing" });
  } else {
    processingStepsArray.splice(existingStepIndex, 1);
    processingStepsArray.push({ step: stepName, status: "processing" });
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
    `[data-step="${stepName}"]`
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
    "review",
    "parsing",
    "file_processing",
    "printing",
  ];
  const currentIndex = stepOrder.indexOf(stepName);
  for (let i = 0; i < currentIndex; i++) {
    const prevStep = processingSteps.querySelector(
      `[data-step="${stepOrder[i]}"]`
    );
    if (prevStep) {
      prevStep.classList.add("completed");
    }
  }
}

/**
 * 처리 상태 업데이트
 * @param {string} stepName - 단계 이름
 * @param {string} status - 상태 메시지
 * @param {Function} handleScrollFn - 스크롤 핸들러 함수 (optional)
 */
export function updateProcessingStatus(stepName, status, handleScrollFn) {
  console.log(`[processing-steps] updateProcessingStatus called: stepName=${stepName}, status=${status}`);

  // 🔥 thinking bubble이 숨겨져 있으면 다시 표시
  if (thinkingBubbleElement && thinkingBubbleElement.style.display === "none") {
    console.log(`[processing-steps] Showing hidden thinking bubble for status update: ${stepName} - ${status}`);
    thinkingBubbleElement.style.display = "";
  }

  // global array update
  const existingStepIndex = processingStepsArray.findIndex(
    (s) => s.step === stepName
  );
  if (existingStepIndex !== -1) {
    processingStepsArray.splice(existingStepIndex, 1);
    processingStepsArray.push({ step: stepName, status: status });
  } else {
    processingStepsArray.push({ step: stepName, status: status });
  }
  updateThinkingBubbleText();

  // 상태 업데이트 시 위치 체크
  if (handleScrollFn) {
    handleScrollFn();
  }

  const statusElement = document.getElementById(`${stepName}-status`);
  if (statusElement) {
    statusElement.textContent = status;
  }
}

/**
 * 버블의 스크롤 영역 내 자연 위치 (position: fixed 적용 전 기준)
 * chatContainer.scrollTop 에 대한 오프셋
 */
let _bubbleNaturalScrollOffset = null;

/**
 * 자연 위치 오프셋 저장 (버블 생성/재배치 시 호출)
 */
export function saveBubbleNaturalOffset() {
  if (!thinkingBubbleElement || !chatContainer) return;
  const containerRect = chatContainer.getBoundingClientRect();
  const bubbleRect = thinkingBubbleElement.getBoundingClientRect();
  _bubbleNaturalScrollOffset =
    chatContainer.scrollTop + (bubbleRect.top - containerRect.top);
}

/**
 * 스크롤 감지하여 버블 고정/해제 처리
 * - 위로 스크롤: 버블이 하단 입력영역에 가려지면 상단 고정
 * - 아래로 스크롤: 버블이 뷰포트 상단을 넘어가면 상단 고정
 * - 버블이 보이는 영역이면 고정 해제
 */
export function handleScroll() {
  if (!thinkingBubbleElement || !chatContainer) {
    return;
  }

  const containerRect = chatContainer.getBoundingClientRect();
  const bottomFixedArea = document.querySelector(".bottom-fixed-area");
  const bottomHeight = bottomFixedArea ? bottomFixedArea.offsetHeight : 220;
  const visibleBottom = containerRect.bottom - bottomHeight;

  const isForced = thinkingBubbleElement.classList.contains("is-forced-top");

  if (!isForced) {
    // 자연 상태 — 실제 위치로 판단
    const bubbleRect = thinkingBubbleElement.getBoundingClientRect();
    // 자연 위치 기록 (고정 해제 판단에 사용)
    _bubbleNaturalScrollOffset =
      chatContainer.scrollTop + (bubbleRect.top - containerRect.top);

    const isBelow = bubbleRect.top > visibleBottom - 20;
    const isAbove = bubbleRect.bottom < containerRect.top + 10;

    // 버블 생성 직후에는 강제 고정하지 않음 (smooth scroll 완료 대기)
    if ((isBelow || isAbove) && !_suppressForcedTop) {
      // debounce: 컨텐츠 추가로 순간적으로 밀릴 때 즉시 고정하지 않고 대기
      if (!_scrollDebounceTimer) {
        _scrollDebounceTimer = setTimeout(() => {
          _scrollDebounceTimer = null;
          // 타이머 만료 후 다시 확인 — 아직도 밖에 있으면 고정
          if (!thinkingBubbleElement || !chatContainer) return;
          const recheckedRect = thinkingBubbleElement.getBoundingClientRect();
          const recheckedContainerRect = chatContainer.getBoundingClientRect();
          const recheckedVisibleBottom = recheckedContainerRect.bottom - bottomHeight;
          const stillBelow = recheckedRect.top > recheckedVisibleBottom - 20;
          const stillAbove = recheckedRect.bottom < recheckedContainerRect.top + 10;
          if ((stillBelow || stillAbove) && !_suppressForcedTop) {
            thinkingBubbleElement.classList.add("is-forced-top");
          }
        }, 150);
      }
    }
  } else {
    // 고정 상태 — 스크롤이 하단 근처이면 해제
    // 버블은 항상 chatMessages의 마지막 요소이므로, 최대 스크롤 근처면 자연 위치가 보임
    const scrollBottom = chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight;
    if (scrollBottom < 100) {
      // debounce 중이면 취소 (고정→해제 직후 다시 고정되는 것 방지)
      if (_scrollDebounceTimer) {
        clearTimeout(_scrollDebounceTimer);
        _scrollDebounceTimer = null;
      }
      thinkingBubbleElement.classList.remove("is-forced-top");
      const tc = thinkingBubbleElement.querySelector(".thinking-content");
      if (tc) tc.classList.remove("expanded");
    }
  }
}

/**
 * 처리 상태들 초기화
 */
export function resetProcessingStatuses() {
  processingStepsArray = [];
  lastFullText = "";
  _bubbleNaturalScrollOffset = null;
  if (_scrollDebounceTimer) {
    clearTimeout(_scrollDebounceTimer);
    _scrollDebounceTimer = null;
  }

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

/**
 * LLM thinking 내용을 thinking bubble 하단에 표시
 * 새로운 thinking이 오면 이전 내용을 교체
 * @param {string} text - thinking 텍스트
 */
export function updateThinkingContent(text) {
  if (!thinkingBubbleElement) return;

  let thinkingContent = thinkingBubbleElement.querySelector('.thinking-content');
  if (!thinkingContent) {
    thinkingContent = document.createElement('div');
    thinkingContent.className = 'thinking-content';
    // 클릭으로 접기/펼치기 토글
    thinkingContent.addEventListener('click', () => {
      thinkingContent.classList.toggle('expanded');
    });
    thinkingBubbleElement.appendChild(thinkingContent);
  }

  // CSS -webkit-line-clamp으로 2줄 접기 처리 → 전체 텍스트 저장 (펼치기 시 사용)
  thinkingContent.textContent = text;
  thinkingContent.style.display = '';

  // 사용자가 하단 근처에 있을 때만 자동 스크롤
  if (chatMessages && !isUserScrolledUp()) {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}

/**
 * thinking content 영역 숨기기
 */
export function clearThinkingContent() {
  if (!thinkingBubbleElement) return;
  const thinkingContent = thinkingBubbleElement.querySelector('.thinking-content');
  if (thinkingContent) {
    thinkingContent.style.display = 'none';
    thinkingContent.textContent = '';
  }
}

/**
 * Auto Correcting Indicator 표시
 */
export function showAutoCorrectingIndicator() {
  const indicator = document.getElementById("auto-correcting-indicator");
  if (indicator) {
    indicator.classList.remove("hidden");
  }
}

/**
 * Auto Correcting Indicator 숨기기
 */
export function hideAutoCorrectingIndicator() {
  const indicator = document.getElementById("auto-correcting-indicator");
  if (indicator) {
    indicator.classList.add("hidden");
  }
}

/**
 * 에러 수정 메시지 표시
 * @param {string} originalCommand - 원래 명령어
 * @param {string} correctedCommand - 수정된 명령어
 * @param {number} retryCount - 재시도 횟수
 */
export function showErrorCorrection(originalCommand, correctedCommand, retryCount) {
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

  // thinking bubble이 있으면 그 앞에 삽입하여 bubble이 항상 맨 아래 유지
  if (thinkingBubbleElement && thinkingBubbleElement.parentNode === chatMessages) {
    chatMessages.insertBefore(errorCorrectionDiv, thinkingBubbleElement);
  } else {
    chatMessages.appendChild(errorCorrectionDiv);
  }
  if (!isUserScrolledUp()) {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}
