/**
 * Processing Steps Module
 * thinking bubble 및 처리 단계 표시 관련 기능
 */

// 처리 단계 제어 변수들
let processingStepsArray = [];
let typingInterval = null;
let lastFullText = "";

// 외부 의존성 (초기화 시 주입)
let thinkingBubbleElement = null;
let chatMessages = null;
let chatContainer = null;

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

/**
 * 처리 단계 설정
 * @param {string} stepName - 단계 이름
 */
export function setProcessingStep(stepName) {
  // global array update
  const existingStepIndex = processingStepsArray.findIndex(
    (s) => s.step === stepName
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
  // global array update
  const existingStepIndex = processingStepsArray.findIndex(
    (s) => s.step === stepName
  );
  if (existingStepIndex !== -1) {
    processingStepsArray[existingStepIndex].status = status;
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
 * 스크롤 감지하여 버블 고정/해제 처리
 */
export function handleScroll() {
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

/**
 * 처리 상태들 초기화
 */
export function resetProcessingStatuses() {
  processingStepsArray = [];
  lastFullText = "";

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

  chatMessages.appendChild(errorCorrectionDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}
