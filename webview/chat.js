import DOMPurify from "dompurify";
import { addCopyButtonsToCodeBlocks } from "./codeCopy.js";
import markdownit from "markdown-it";
import markdownitContainer from "markdown-it-container";

// console.log("✅ chat.js loaded");

// VS Code API를 전역으로 획득 (codeCopy.js와 공유)
if (
    typeof window.vscode === "undefined" &&
    typeof acquireVsCodeApi !== "undefined"
) {
    window.vscode = acquireVsCodeApi();

    // ✅ __BOOT_PING__ 테스트 - Webview 연결 확인
    try {
        window.vscode.postMessage({ command: '__BOOT_PING__', timestamp: Date.now() });
    } catch (error) {
        // Silent error handling
    }
}
const vscode = window.vscode || null;

// 처리 단계 제어 변수들
let processingStepsArray = [];
let typingInterval = null;
let lastFullText = "";

function showProcessingSteps() {
    // 상단 고정 UI 삭제됨 - 하단 타자기 효과로 통합
}

function hideProcessingSteps() {
    // 상단 고정 UI 삭제됨 - 하단 타자기 효과로 통합
}

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

// Allow custom codepilot:// scheme links to survive sanitization
try {
    if (DOMPurify && typeof DOMPurify.addHook === "function") {
        DOMPurify.addHook("uponSanitizeAttribute", (node, data) => {
            if (data.attrName === "href" && typeof data.attrValue === "string") {
                if (data.attrValue.startsWith("codepilot://")) {
                    data.keepAttr = true;
                }
            }
        });
    }
} catch (e) {
    console.warn("DOMPurify hook setup failed:", e);
}

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

// 파일 선택 관련 요소들
const fileSelectionArea = document.getElementById("file-selection-area");
const selectedFilesContainer = document.getElementById(
    "selected-files-container",
);
const clearFilesButton = document.getElementById("clear-files-button");
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

function generateId() {
    return "q_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
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

    updateSendCancelButtons(true); // 전송 시작 시 중지 버튼으로 스왑
    window.displayUserMessage(text, img);
    window.showLoading();
    vscode.postMessage({
        command: "sendMessage",
        text: text,
        imageData: img,
        imageMimeType: imgMime,
        selectedFiles: files,
        mode,
    });
}

const md = markdownit({
    html: false,
    linkify: true,
    typographer: true,
    // highlight: function (str, lang) { // Syntax highlighting (선택 사항, 필요 시 highlight.js 등 추가)
    //    if (lang && window.hljs && hljs.getLanguage(lang)) {
    //        try {
    //            return hljs.highlight(str, { language: lang }).value;
    //        } catch (__) {}
    //    }
    //    return '';
    // }
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

// 메시지 전송 로직 (기존 코드 유지 - 절대 수정 금지 영역)
if (sendButton && chatInput) {
    sendButton.addEventListener("click", handleSendMessage);

    chatInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            setTimeout(() => {
                handleSendMessage();
            }, 0);
        }
    });

    chatInput.addEventListener("input", autoResizeTextarea);
    chatInput.addEventListener("paste", handlePaste); // 붙여넣기 이벤트 리스너 추가
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

if (clearFilesButton) {
    clearFilesButton.addEventListener("click", clearAllSelectedFiles);
}

function handlePaste(event) {
    const items = (event.clipboardData || event.originalEvent.clipboardData)
        .items;
    let imageFound = false;

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
    const text = chatInput.value.trimEnd(); // trim() 대신 trimEnd() 사용 (기존 로직 유지)
    if (text || selectedImageBase64 || selectedFiles.length > 0) {
        // 텍스트, 이미지, 또는 선택된 파일이 있을 때만 전송
        const payload = {
            id: generateId(),
            text: text,
            imageData: selectedImageBase64,
            imageMimeType: selectedImageMimeType,
            selectedFiles: selectedFiles.map((file) => file.path),
            mode: currentMode,
        };

        if (loadingDepth > 0) {
            // AI 응답 대기 중: 채팅창에 먼저 출력하고, 큐에 적재(전송은 응답 후)
            window.displayUserMessage(text, selectedImageBase64);
            enqueuePendingQuestion(payload);
        } else {
            // 즉시 전송
            doSendUserMessage(payload);
        }

        chatInput.value = "";
        chatInput.style.height = "auto";
        removeAttachedImage(); // 이미지 전송 후 썸네일 제거
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
        item.style.padding = "6px 10px";
        item.style.cursor = "pointer";
        item.style.borderLeft = "3px solid #4285f4"; // Gemini 색상 포인트
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

    // 구분선 (모델이 있을 경우에만)
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
        item.style.padding = "6px 10px";
        item.style.cursor = "pointer";
        item.style.borderLeft = "3px solid #f68537"; // Ollama 색상 포인트 (주황색)
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
    const allModels = [...geminiModels, ...availableOllamaModels];
    const currentModel = allModels.find((m) => m.name === currentOllamaModel);
    const currentDisplay =
        currentModel?.displayName || currentOllamaModel || "Model";
    const modelType = geminiModels.some((m) => m.name === currentOllamaModel)
        ? "gemini"
        : "ollama";
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
            showProcessingSteps();
            resetProcessingStatuses();
            setProcessingStep("intent");
            break;
        case "hideLoading":
            console.log("Received hideLoading command.");
            if (loadingDepth > 0) {
                loadingDepth--;
            }
            window.hideLoading();
            hideProcessingSteps();
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
            if (message.model) {
                const geminiModels = [
                    { name: "gemini-3-pro-preview", displayName: "Gemini 3.0 Pro" },
                    { name: "gemini-3-flash-preview", displayName: "Gemini 3.0 Flash" },
                ];
                const allModels = [...geminiModels, ...availableOllamaModels];
                const currentModel = allModels.find((m) => m.name === message.model);
                const display = currentModel?.displayName || message.model;
                currentOllamaModel = message.model;
                const modelType = geminiModels.some((m) => m.name === message.model)
                    ? "gemini"
                    : "ollama";
                setModelLabel(display, modelType);
            }
            if (message.error) {
                console.warn("[chat] ollamaModelChanged error:", message.error);
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
                const codeBlockMatch = message.text.match(/```([^\n]*?)\n/);
                if (codeBlockMatch) {
                    console.log("[RAW CODE BLOCK TEXT] lang label:", codeBlockMatch[1]);
                }
            }

            // hideLoading 이벤트에서 처리하므로 여기서는 처리하지 않음

            if (
                (message.sender === "CODEPILOT") &&
                message.text !== undefined
            ) {
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
    const userMessageElement = document.createElement("div");
    userMessageElement.classList.add("user-plain-message");

    // 이미지 데이터가 있으면 이미지 표시
    if (imageData) {
        const imgElement = document.createElement("img");
        imgElement.classList.add("user-message-image");
        imgElement.src = `data:image/png;base64,${imageData}`; // MIME 타입은 PNG로 가정하거나, 전송된 MIME 타입 사용
        userMessageElement.appendChild(imgElement);
    }

    // 텍스트가 있으면 텍스트 표시
    if (text) {
        const textNode = document.createElement("span");
        // ✅ 사용자 입력은 순수 텍스트로 표시 (HTML 태그 이스케이프)
        // textContent를 사용하여 HTML 태그가 렌더링되지 않도록 함
        // white-space: pre-wrap CSS로 줄바꿈 유지
        textNode.textContent = text;
        userMessageElement.appendChild(textNode);
    }

    const separatorElement = document.createElement("hr");
    separatorElement.classList.add("message-separator");

    chatMessages.appendChild(userMessageElement);
    chatMessages.appendChild(separatorElement);

    // 사용자 메시지가 추가된 후 즉시 스크롤을 해당 메시지로 이동 (여러 번 시도)
    scrollToUserMessage(userMessageElement);
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

    systemMessageElement.innerHTML = DOMPurify.sanitize(text);
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
            userMessageElement.scrollIntoView({
                behavior: "smooth",
                block: "center", // 메시지를 화면 중앙에 위치시킴
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
        return;
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
            console.log(
            );
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
                console.log(
                );
            }
        }

        console.log(
        );

        // 1. 코드 블록 이전 텍스트 처리 (Markdown 포맷 적용)
        const processedPrecedingHtml = md.render(precedingText); // markdown-it 사용
        tempHtmlElements.innerHTML += DOMPurify.sanitize(processedPrecedingHtml);

        // 2. 코드 블록 처리 (HTML 태그 완전 제거, 순수 텍스트만)
        const preElement = document.createElement("pre");
        const codeElement = document.createElement("code");

        // HTML 엔티티만 디코딩하고 HTML 태그는 보존
        let cleanCodeContent = codeContent;

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

        const languageLabel = document.createElement("span");
        languageLabel.classList.add("code-language");
        languageLabel.textContent = lang || "text";

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
                    margin-left: 8px;
                    opacity: 0.7;
                    transition: opacity 0.2s;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    vertical-align: middle;
                    background: none;
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 3px;
                    padding: 2px 6px;
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
                        openFileIcon.style.backgroundColor = "var(--vscode-focusBorder)";
                    },
                    { passive: true },
                );

                openFileIcon.addEventListener(
                    "mouseleave",
                    () => {
                        openFileIcon.style.opacity = "0.7";
                        openFileIcon.style.backgroundColor = "transparent";
                    },
                    { passive: true },
                );

                lineCountLabel.appendChild(openFileIcon);
                console.log(
                );
            } else {
            }
        }
        // 라인 수 정보가 없으면 라인 수 라벨 자체를 표시하지 않음

        codeHeader.appendChild(languageLabel);
        if (deletedLines > 0 || addedLines > 0) {
            codeHeader.appendChild(lineCountLabel);
            console.log(
            );
        } else if (filePath) {
            // ✅ 라인 수 정보가 없어도 filePath가 있으면 아이콘만 표시
            console.log(
            );
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
                margin-left: 8px;
                opacity: 0.7;
                transition: opacity 0.2s;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                vertical-align: middle;
                background: none;
                border: 1px solid var(--vscode-panel-border);
                border-radius: 3px;
                padding: 2px 6px;
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
                    openFileIcon.style.backgroundColor = "var(--vscode-focusBorder)";
                },
                { passive: true },
            );

            openFileIcon.addEventListener(
                "mouseleave",
                () => {
                    openFileIcon.style.opacity = "0.7";
                    openFileIcon.style.backgroundColor = "transparent";
                },
                { passive: true },
            );

            codeHeader.appendChild(openFileIcon);
            console.log(
            );
        }

        // 코드 컨테이너 생성
        const codeContainer = document.createElement("div");
        codeContainer.classList.add("code-container");

        // 전체 코드 요소 (항상 표시)
        codeElement.textContent = cleanCodeContent;
        preElement.appendChild(codeElement);
        codeContainer.appendChild(preElement);

        // 코드 블록 컨테이너에 헤더와 코드 추가
        codeBlockContainer.appendChild(codeHeader);
        codeBlockContainer.appendChild(codeContainer);

        tempHtmlElements.appendChild(codeBlockContainer);

        lastIndex = codeBlockRegex.lastIndex; // 다음 검색 시작 위치 업데이트
    }

    // 3. 마지막 코드 블록 이후의 텍스트 처리 (Markdown 포맷 적용)
    const remainingText = displayText.substring(lastIndex);
    const processedRemainingHtml = md.render(remainingText); // markdown-it 사용
    tempHtmlElements.innerHTML += DOMPurify.sanitize(processedRemainingHtml);

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
    updateFileSelectionDisplay();
}

// 선택된 파일 제거
function removeSelectedFile(filePath) {
    selectedFiles = selectedFiles.filter((file) => file.path !== filePath);
    updateFileSelectionDisplay();
}

// 모든 선택된 파일 제거
function clearAllSelectedFiles() {
    selectedFiles = [];
    updateFileSelectionDisplay();
}

// 파일 선택 영역 UI 업데이트
function updateFileSelectionDisplay() {
    if (!selectedFilesContainer || !fileSelectionArea) {
        return;
    }

    selectedFilesContainer.innerHTML = "";

    // 구분선 요소 찾기
    const divider = document.querySelector(".file-input-divider");

    if (selectedFiles.length === 0) {
        fileSelectionArea.classList.add("hidden");
        if (divider) {
            divider.classList.add("hidden");
        }
    } else {
        fileSelectionArea.classList.remove("hidden");
        if (divider) {
            divider.classList.remove("hidden");
        }

        selectedFiles.forEach((file) => {
            const fileTag = document.createElement("div");
            fileTag.classList.add("selected-file-tag");
            fileTag.innerHTML = `
                <span class="file-name" title="${file.path}">${file.name}</span>
                <button class="remove-file" data-path="${file.path}" title="Remove file">×</button>
            `;

            // 개별 파일 제거 버튼 이벤트
            const removeButton = fileTag.querySelector(".remove-file");
            removeButton.addEventListener("click", () => {
                removeSelectedFile(file.path);
            });

            selectedFilesContainer.appendChild(fileTag);
        });
    }

    // 파일 선택 영역이 변경되면 채팅 컨테이너 패딩 업데이트
    setTimeout(() => {
        updateChatContainerPadding();
    }, 0); // DOM 업데이트 후 실행
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
    console.log("=== applyLanguage called ===");
    console.log("Current language:", currentLanguage);
    console.log("Language data keys:", Object.keys(languageData));
    console.log("inputPlaceholder value:", languageData["inputPlaceholder"]);

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
    console.log("Chat input element found:", !!chatInput);
    if (chatInput) {
        console.log("Current placeholder:", chatInput.placeholder);
        console.log("New placeholder value:", languageData["inputPlaceholder"]);
    }
    if (chatInput && languageData["inputPlaceholder"]) {
        chatInput.placeholder = languageData["inputPlaceholder"];
        console.log("Placeholder updated to:", chatInput.placeholder);
    } else {
        console.log(
            "Failed to update placeholder - chatInput:",
            !!chatInput,
            "inputPlaceholder:",
            !!languageData["inputPlaceholder"],
        );
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
                    if (window.vscode && typeof window.vscode.postMessage === 'function') {
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
