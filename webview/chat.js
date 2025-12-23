import DOMPurify from 'dompurify';
import { addCopyButtonsToCodeBlocks } from './codeCopy.js';
import markdownit from 'markdown-it';
import markdownitContainer from 'markdown-it-container';


// console.log("✅ chat.js loaded");

// VS Code API를 전역으로 획득 (codeCopy.js와 공유)
if (typeof window.vscode === 'undefined' && typeof acquireVsCodeApi !== 'undefined') {
    window.vscode = acquireVsCodeApi();
}
const vscode = window.vscode || null;

// 처리 단계 제어 함수들
function showProcessingSteps() {
    const processingSteps = document.getElementById('processing-steps');
    if (processingSteps) {
        processingSteps.style.display = 'block';
    }
}

function hideProcessingSteps() {
    const processingSteps = document.getElementById('processing-steps');
    if (processingSteps) {
        processingSteps.style.display = 'none';
    }
}

function setProcessingStep(stepName) {
    const processingSteps = document.getElementById('processing-steps');
    if (!processingSteps) return;

    // 모든 단계를 비활성화
    const allSteps = processingSteps.querySelectorAll('.processing-step');
    allSteps.forEach(step => {
        step.classList.remove('active', 'completed');
    });

    // 현재 단계를 활성화
    const currentStep = processingSteps.querySelector(`[data-step="${stepName}"]`);
    if (currentStep) {
        currentStep.classList.add('active');
    }

    // 이전 단계들을 완료로 표시
    const stepOrder = ['systems', 'intent', 'keywords', 'plan', 'analyzing', 'assembling', 'executing', 'parsing', 'file_processing', 'printing'];
    const currentIndex = stepOrder.indexOf(stepName);
    for (let i = 0; i < currentIndex; i++) {
        const prevStep = processingSteps.querySelector(`[data-step="${stepOrder[i]}"]`);
        if (prevStep) {
            prevStep.classList.add('completed');
        }
    }
}

function updateProcessingStatus(stepName, status) {
    const statusElement = document.getElementById(`${stepName}-status`);
    if (statusElement) {
        statusElement.textContent = status;
    }
}

// Auto Correcting Indicator Functions
function showAutoCorrectingIndicator() {
    const indicator = document.getElementById('auto-correcting-indicator');
    if (indicator) {
        indicator.classList.remove('hidden');
    }
}

function hideAutoCorrectingIndicator() {
    const indicator = document.getElementById('auto-correcting-indicator');
    if (indicator) {
        indicator.classList.add('hidden');
    }
}

function showErrorCorrection(originalCommand, correctedCommand, retryCount) {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;

    const errorCorrectionDiv = document.createElement('div');
    errorCorrectionDiv.className = 'error-correction-message';
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
    const statuses = ['intent', 'keywords', 'analyzing', 'assembling', 'parsing', 'printing'];
    statuses.forEach(step => {
        const statusElement = document.getElementById(`${step}-status`);
        if (statusElement) {
            if (step === 'intent') {
                statusElement.textContent = 'Initializing...';
            } else {
                statusElement.textContent = 'Waiting...';
            }
        }
    });
}


// Allow custom aidev-ide:// scheme links to survive sanitization
try {
    if (DOMPurify && typeof DOMPurify.addHook === 'function') {
        DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
            if (data.attrName === 'href' && typeof data.attrValue === 'string') {
                if (data.attrValue.startsWith('aidev-ide://')) {
                    data.keepAttr = true;
                }
            }
        });
    }
} catch (e) {
    console.warn('DOMPurify hook setup failed:', e);
}

const sendButton = document.getElementById('send-button');
const chatInput = document.getElementById('chat-input');
const chatMessages = document.getElementById('chat-messages'); // 스크롤 컨테이너
const clearHistoryButton = document.getElementById('clear-history-button'); // Clear History 버튼 참조
const cancelButton = document.getElementById('cancel-call-button'); // Cancel 버튼 참조
const imagePreviewContainer = document.getElementById('image-preview-container');
const imagePreview = document.getElementById('image-preview');
const removeImageButton = document.getElementById('remove-image-button');
const modelSelectorButton = document.getElementById('model-selector');
const modelDropdown = document.getElementById('model-dropdown');
const modelLabel = document.getElementById('model-label');

// 파일 선택 관련 요소들
const fileSelectionArea = document.getElementById('file-selection-area');
const selectedFilesContainer = document.getElementById('selected-files-container');
const clearFilesButton = document.getElementById('clear-files-button');
const filePickerButton = document.getElementById('file-picker-button');
let currentMode = (window.chatMode || 'CODE');
let currentOllamaModel = '';
let availableOllamaModels = [];

// 채팅 컨테이너 참조 추가
const chatContainer = document.getElementById('chat-container');
const pendingQueueArea = document.getElementById('pending-queue-area');

let thinkingBubbleElement = null;
let selectedImageBase64 = null; // Base64 인코딩된 이미지 데이터를 저장할 변수
let selectedImageMimeType = null; // 이미지 MIME 타입 저장
let selectedFiles = []; // 선택된 파일 목록
let loadingDepth = 0; // 중첩 로딩 상태(에러 우선 처리 대비)
let pendingQuestions = []; // 대기 중 사용자 질문 큐

function generateId() {
    return 'q_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function enqueuePendingQuestion(payload) {
    pendingQuestions.push(payload);
    updatePendingQueueUI();
}

function removePendingQuestionById(id) {
    pendingQuestions = pendingQuestions.filter(item => item.id !== id);
    updatePendingQueueUI();
}

function updatePendingQueueUI() {
    if (!pendingQueueArea) return;
    // 표시/숨김
    if (pendingQuestions.length > 0) {
        pendingQueueArea.classList.add('visible');
    } else {
        pendingQueueArea.classList.remove('visible');
    }
    // 렌더링
    pendingQueueArea.innerHTML = '';
    pendingQuestions.forEach(item => {
        const el = document.createElement('div');
        el.className = 'pending-item';
        const textSpan = document.createElement('span');
        textSpan.className = 'text';
        textSpan.title = item.text || '';
        textSpan.textContent = (item.text || '').trim() || '(image/files only)';
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'cancel-btn';
        cancelBtn.textContent = '×';
        cancelBtn.addEventListener('click', () => removePendingQuestionById(item.id));
        el.appendChild(textSpan);
        el.appendChild(cancelBtn);
        pendingQueueArea.appendChild(el);
    });

    // UI 높이 변경 반영
    setTimeout(() => updateChatContainerPadding(), 0);
}

function sendNextQueuedQuestionIfIdle() {
    if (loadingDepth > 0) return;
    if (pendingQuestions.length === 0) return;
    const next = pendingQuestions.shift();
    updatePendingQueueUI();
    // 전송 직전 실제 사용자 메시지를 출력하고 전송
    doSendUserMessage(next);
}

function doSendUserMessage(payload) {
    const text = payload.text || '';
    const img = payload.imageData || null;
    const imgMime = payload.imageMimeType || null;
    const files = payload.selectedFiles || [];
    const mode = payload.mode || currentMode || 'CODE';

    updateSendCancelButtons(true); // 전송 시작 시 중지 버튼으로 스왑
    window.displayUserMessage(text, img);
    window.showLoading();
    vscode.postMessage({
        command: 'sendMessage',
        text: text,
        imageData: img,
        imageMimeType: imgMime,
        selectedFiles: files,
        mode
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
md.use(markdownitContainer, 'text', {
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
    }
});


// 메시지 전송 로직 (기존 코드 유지 - 절대 수정 금지 영역)
if (sendButton && chatInput) {
    sendButton.addEventListener('click', handleSendMessage);

    chatInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            setTimeout(() => {
                handleSendMessage();
            }, 0);
        }
    });

    chatInput.addEventListener('input', autoResizeTextarea);
    chatInput.addEventListener('paste', handlePaste); // 붙여넣기 이벤트 리스너 추가
}

// Clear History 버튼 클릭 이벤트 리스너
if (clearHistoryButton) {
    clearHistoryButton.addEventListener('click', handleClearHistory);
}

// Cancel 버튼 클릭 이벤트 리스너
if (cancelButton) {
    cancelButton.addEventListener('click', () => {
        console.log('Cancel button clicked. Sending cancel command to extension.');
        vscode.postMessage({ command: 'cancelGeminiCall' }); // 확장 프로그램으로 취소 명령 전송
        window.hideLoading(); // 로딩 애니메이션은 즉시 숨김
    });
}

// 이미지 제거 버튼 클릭 이벤트 리스너
if (removeImageButton) {
    removeImageButton.addEventListener('click', removeAttachedImage);
}

// 파일 선택 관련 이벤트 리스너들
if (filePickerButton) {
    filePickerButton.addEventListener('click', openFilePicker);
}

if (clearFilesButton) {
    clearFilesButton.addEventListener('click', clearAllSelectedFiles);
}

function handlePaste(event) {
    const items = (event.clipboardData || event.originalEvent.clipboardData).items;
    let imageFound = false;

    for (const item of items) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
            const file = item.getAsFile();
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    selectedImageBase64 = e.target.result.split(',')[1]; // Get base64 string without data:image/...
                    selectedImageMimeType = file.type;

                    imagePreview.src = e.target.result;
                    imagePreviewContainer.classList.remove('hidden');
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
    imagePreview.src = '#';
    imagePreviewContainer.classList.add('hidden');
    autoResizeTextarea(); // 썸네일 제거 후 입력창 높이 재조정
    chatInput.focus();

    // 이미지 제거 후 패딩 업데이트
    setTimeout(() => {
        updateChatContainerPadding();
    }, 0);
}

function handleSendMessage() {
    if (!chatInput) return;
    const text = chatInput.value.trimEnd(); // trim() 대신 trimEnd() 사용 (기존 로직 유지)
    if (text || selectedImageBase64 || selectedFiles.length > 0) { // 텍스트, 이미지, 또는 선택된 파일이 있을 때만 전송
        const payload = {
            id: generateId(),
            text: text,
            imageData: selectedImageBase64,
            imageMimeType: selectedImageMimeType,
            selectedFiles: selectedFiles.map(file => file.path),
            mode: currentMode
        };

        if (loadingDepth > 0) {
            // AI 응답 대기 중: 채팅창에 먼저 출력하고, 큐에 적재(전송은 응답 후)
            window.displayUserMessage(text, selectedImageBase64);
            enqueuePendingQuestion(payload);
        } else {
            // 즉시 전송
            doSendUserMessage(payload);
        }

        chatInput.value = '';
        chatInput.style.height = 'auto';
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
                behavior: 'smooth',
                block: 'end', // 애니메이션을 화면 하단에 위치시킴
                inline: 'nearest'
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
    if (!chatInput) return;
    chatInput.style.height = 'auto';
    const computedStyle = getComputedStyle(chatInput);
    const minHeight = parseInt(computedStyle.minHeight, 10);
    const maxHeight = parseInt(computedStyle.maxHeight, 10);
    const adjustedHeight = Math.max(minHeight, Math.min(chatInput.scrollHeight, maxHeight));
    chatInput.style.height = adjustedHeight + 'px';

    // 입력창 높이가 변경되면 하단 고정 영역 높이도 재계산
    updateChatContainerPadding();
}

function requestOllamaModels() {
    if (vscode) {
        vscode.postMessage({ command: 'getOllamaModels' });
    }
}

function setModelLabel(name) {
    if (modelLabel) {
        modelLabel.textContent = name || 'Model';
    }
}

function populateModelDropdown(models, current) {
    // models: [{name, displayName}] 또는 ["name", ...]
    availableOllamaModels = (models || []).map((m) => {
        if (typeof m === 'string') return { name: m, displayName: m };
        return { name: m?.name || '', displayName: m?.displayName || m?.name || '' };
    }).filter((m) => m.name);

    currentOllamaModel = current || '';

    if (!modelDropdown) return;
    modelDropdown.innerHTML = '';

    availableOllamaModels.forEach((m) => {
        const display = m.displayName || m.name;
        const item = document.createElement('div');
        item.className = 'dropdown-option';
        item.dataset.model = m.name;
        item.textContent = display;
        item.style.padding = '6px 10px';
        item.style.cursor = 'pointer';
        item.addEventListener('click', () => {
            currentOllamaModel = m.name;
            setModelLabel(display);
            if (modelDropdown) {
                modelDropdown.classList.add('hidden');
                modelDropdown.style.display = 'none';
            }
            vscode.postMessage({ command: 'setOllamaModel', model: m.name });
        });
        modelDropdown.appendChild(item);
    });

    const currentDisplay = (availableOllamaModels.find(m => m.name === currentOllamaModel)?.displayName) || currentOllamaModel || 'Model';
    setModelLabel(currentDisplay);

    if (!availableOllamaModels.length) {
        const empty = document.createElement('div');
        empty.className = 'dropdown-option';
        empty.textContent = '모델을 불러올 수 없습니다';
        empty.style.padding = '6px 10px';
        modelDropdown.appendChild(empty);
    }
}

function bindModelDropdownEvents() {
    if (!modelSelectorButton || !modelDropdown) return;

    const closeDropdown = () => {
        modelDropdown.classList.add('hidden');
        modelDropdown.style.display = 'none';
    };

    modelSelectorButton.addEventListener('click', (e) => {
        e.stopPropagation();
        const willShow = modelDropdown.classList.contains('hidden');
        if (willShow) {
            modelDropdown.classList.remove('hidden');
            modelDropdown.style.display = 'block';
        } else {
            closeDropdown();
        }
    });

    document.addEventListener('click', (e) => {
        if (!modelDropdown.contains(e.target) && e.target !== modelSelectorButton) {
            closeDropdown();
        }
    });
}

// 모드 변경 이벤트 수신
window.addEventListener('chat-mode-changed', () => {
    currentMode = (window.chatMode || 'CODE');
});

// 하단 고정 영역의 높이를 계산하고 채팅 컨테이너의 패딩을 조정하는 함수
function updateChatContainerPadding() {
    if (!chatContainer) return;

    // 하단 고정 영역의 요소들
    const bottomFixedArea = document.querySelector('.bottom-fixed-area');
    const fileSelectionArea = document.getElementById('file-selection-area');
    const chatInputArea = document.getElementById('chat-input-area');
    const pendingArea = document.getElementById('pending-queue-area');

    if (!bottomFixedArea || !chatInputArea) return;

    // 파일 선택 영역의 높이 (숨겨져 있으면 0)
    const fileSelectionHeight = fileSelectionArea && !fileSelectionArea.classList.contains('hidden')
        ? fileSelectionArea.offsetHeight
        : 0;

    // 대기 큐 영역의 높이 (보이지 않으면 0)
    let pendingHeight = 0;
    if (pendingArea) {
        const isVisible = pendingArea.classList.contains('visible');
        pendingHeight = isVisible ? pendingArea.offsetHeight : 0;
    }

    // 입력 영역의 높이
    const chatInputHeight = chatInputArea.offsetHeight;

    // 전체 하단 고정 영역 높이 계산 (여유 공간 포함)
    const totalBottomHeight = pendingHeight + fileSelectionHeight + chatInputHeight + 20; // 20px 여유 공간

    // 채팅 컨테이너의 하단 패딩을 동적으로 설정
    chatContainer.style.paddingBottom = `${totalBottomHeight}px`;

    // console.log(`Bottom area height: ${totalBottomHeight}px (pending: ${pendingHeight}px, file: ${fileSelectionHeight}px, input: ${chatInputHeight}px)`);
}

document.addEventListener('DOMContentLoaded', () => {
    if (chatInput) {
        autoResizeTextarea();
    }
    // 초기 로드 시 Cancel 버튼 비활성화
    if (cancelButton) {
        cancelButton.disabled = true;
    }
    // 이미지 프리뷰 초기 숨김
    if (imagePreviewContainer) {
        imagePreviewContainer.classList.add('hidden');
    }

    // 초기 채팅 컨테이너 패딩 설정
    setTimeout(() => {
        updateChatContainerPadding();
    }, 100); // DOM이 완전히 로드된 후 실행

    // 모델 목록 요청 및 드롭다운 초기화
    bindModelDropdownEvents();
    requestOllamaModels();
});

window.addEventListener('message', event => {
    const message = event.data;

    switch (message.command) {
        case 'priorityErrorPrompt':
            // 확장 측에서 파일 작업/터미널 에러 우선 처리 요청 → 확장으로 전달하여 즉시 LLM 호출
            if (typeof message.text === 'string' && message.text.trim().length > 0) {
                vscode.postMessage({ command: 'priorityErrorPrompt', text: message.text });
            }
            break;
        case 'showLoading':
            console.log('Received showLoading command.');
            loadingDepth++;
            window.showLoading();
            showProcessingSteps();
            resetProcessingStatuses();
            setProcessingStep('intent');
            break;
        case 'hideLoading':
            console.log('Received hideLoading command.');
            if (loadingDepth > 0) loadingDepth--;
            window.hideLoading();
            hideProcessingSteps();
            // 약간의 지연 후, 에러 우선 처리(showLoading 재등장) 기회를 준 뒤 큐 전송
            setTimeout(() => {
                if (loadingDepth === 0) {
                    sendNextQueuedQuestionIfIdle();
                }
            }, 200);
            break;
        case 'setProcessingStep':
            if (message.step) {
                setProcessingStep(message.step);
            }
            break;
        case 'updateProcessingStatus':
            if (message.step && message.status) {
                updateProcessingStatus(message.step, message.status);

                // Auto Correcting Indicator 표시/숨김
                if (message.step === 'error_correction') {
                    if (message.status.includes('자동 오류 수정') || message.status.includes('오류 수정')) {
                        showAutoCorrectingIndicator();
                    } else if (message.status.includes('완료') || message.status.includes('실패')) {
                        hideAutoCorrectingIndicator();
                    }
                }
            }
            break;
        case 'showGitInfo':
            if (message.content) {
                showGitRepositoryInfo(message.content);
            }
            break;
        case 'showErrorCorrection':
            console.log('Received error correction message:', message);
            showErrorCorrection(message.originalCommand, message.correctedCommand, message.retryCount);
            break;
        case 'displayUserMessage':
            console.log('Received command to display user message:', message.text, message.imageData);
            // console.log('Received command to display user message:', message.text, message.imageData);
            if (message.text !== undefined || message.imageData !== undefined) { // 텍스트 또는 이미지가 있을 때
                window.displayUserMessage(message.text, message.imageData);
            }
            break;
        case 'ollamaModels':
            populateModelDropdown(message.models || [], message.current || '');
            break;
        case 'ollamaModelChanged':
            if (message.model) {
                const display = (availableOllamaModels.find(m => m.name === message.model)?.displayName) || message.model;
                currentOllamaModel = message.model;
                setModelLabel(display);
            }
            if (message.error) {
                console.warn('[chat] ollamaModelChanged error:', message.error);
            }
            break;

        case 'receiveMessage':
            // console.log('Received message from extension:', message.text);
            console.log('Received message from extension:', {
                sender: message.sender,
                textLength: message.text ? message.text.length : 0,
                textPreview: message.text ? message.text.substring(0, 200) + '...' : 'undefined'
            });
            // hideLoading 이벤트에서 처리하므로 여기서는 처리하지 않음

            if (message.sender === 'AIDEV-IDE' && message.text !== undefined) {
                console.log('Calling displayCodePilotMessage with text length:', message.text.length);
                window.displayCodePilotMessage(message.text); // AIDEV-IDE 메시지 표시
            }
            break;

        case 'fileSelected':
            console.log('File selected:', message.filePath, message.fileName);
            if (message.filePath && message.fileName) {
                addSelectedFile(message.filePath, message.fileName);
            }
            break;

        case 'openPanel':
            console.log(`Received open panel command from extension: ${message.panel}`);
            break;
        case 'languageChanged':
            console.log(`Language changed to: ${message.language}`);
            loadLanguage(message.language);
            break;
        case 'currentLanguage':
            if (message.language) {
                currentLanguage = message.language;
                if (languageSelect) {
                    languageSelect.value = currentLanguage;
                }
                loadLanguage(currentLanguage);
            }
            break;
        case 'languageDataReceived':
            if (message.language && message.data) {
                languageData = message.data;
                currentLanguage = message.language;
                sessionStorage.setItem('aidev-ideLang', message.language);

                applyLanguage();
            }
            break;
    }
});

// --- UI 업데이트 및 마크다운 렌더링 관련 함수 정의 ---
// 이 함수들을 window 객체에 할당하여 메시지 핸들러에서 접근 가능하게 합니다.

// 사용자 메시지를 일반 텍스트와 구분선으로 표시하는 함수
function displayUserMessage(text, imageData = null) { // imageData 파라미터 추가
    if (!chatMessages) return;
    const userMessageElement = document.createElement('div');
    userMessageElement.classList.add('user-plain-message');

    // 이미지 데이터가 있으면 이미지 표시
    if (imageData) {
        const imgElement = document.createElement('img');
        imgElement.classList.add('user-message-image');
        imgElement.src = `data:image/png;base64,${imageData}`; // MIME 타입은 PNG로 가정하거나, 전송된 MIME 타입 사용
        userMessageElement.appendChild(imgElement);
    }

    // 텍스트가 있으면 텍스트 표시
    if (text) {
        const textNode = document.createElement('span');
        // DOMPurify.sanitize(text)는 HTML 태그를 제거하고 안전한 텍스트를 반환합니다.
        // .replace(/\n/g, '<br>')를 사용하여 줄바꿈을 HTML <br> 태그로 변환합니다.
        textNode.innerHTML = DOMPurify.sanitize(text).replace(/\n/g, '<br>');
        userMessageElement.appendChild(textNode);
    }

    const separatorElement = document.createElement('hr');
    separatorElement.classList.add('message-separator');

    chatMessages.appendChild(userMessageElement);
    chatMessages.appendChild(separatorElement);

    // 사용자 메시지가 추가된 후 즉시 스크롤을 해당 메시지로 이동 (여러 번 시도)
    scrollToUserMessage(userMessageElement);
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
                behavior: 'smooth',
                block: 'center', // 메시지를 화면 중앙에 위치시킴
                inline: 'nearest'
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
    const messageContainer = document.createElement('div');
    messageContainer.classList.add('thinking-bubble');
    messageContainer.innerHTML = 'thinking <span class="thinking-dots"><span></span><span></span><span></span></span>';

    chatMessages.appendChild(messageContainer);
    thinkingBubbleElement = messageContainer; // 엘리먼트 참조 저장

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
                behavior: 'smooth',
                block: 'end', // 애니메이션을 화면 하단에 위치시킴
                inline: 'nearest'
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
    if (!sendButton || !cancelButton) return;
    if (isSending) {
        sendButton.classList.add('hidden');
        sendButton.style.display = 'none';
        cancelButton.classList.remove('hidden');
        cancelButton.style.display = 'inline-flex';
        cancelButton.style.order = '99'; // 오른쪽 끝으로 배치
        cancelButton.disabled = false;
    } else {
        cancelButton.classList.add('hidden');
        cancelButton.style.display = 'none';
        sendButton.classList.remove('hidden');
        sendButton.style.display = 'inline-flex';
        sendButton.style.order = '99';
        cancelButton.style.order = '0';
        cancelButton.disabled = true;
    }
}

// 초기 상태: 전송 버튼만 보이도록 설정
updateSendCancelButtons(false);

// 저장된 대화 이력을 삭제하는 함수
function handleClearHistory() {
    // 커스텀 경고창 생성
    const warningModal = document.createElement('div');
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

    const warningContent = document.createElement('div');
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
    const cancelBtn = document.getElementById('cancel-clear-history');
    cancelBtn.addEventListener('click', () => {
        document.body.removeChild(warningModal);
    });

    // 확인 버튼 이벤트
    const confirmBtn = document.getElementById('confirm-clear-history');
    confirmBtn.addEventListener('click', () => {
        document.body.removeChild(warningModal);

        // UI 클리어
        if (chatMessages) {
            while (chatMessages.firstChild) {
                chatMessages.removeChild(chatMessages.firstChild);
            }
            thinkingBubbleElement = null; // 로딩 애니메이션 참조도 초기화
            console.log('Chat history cleared.');
        }

        // 확장 프로그램에 대화기록 삭제 요청 전송
        vscode.postMessage({
            command: 'clearHistory',
            promptType: 'CODE_GENERATION' // Code 탭
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
    warningModal.addEventListener('click', (e) => {
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
    if (!text) return text;
    
    let result = text;
    
    // aidev-ide 툴 이름 목록
    const toolNames = [
        'create_file',
        'update_file',
        'remove_file',
        'read_file',
        'list_files',
        'search_files',
        'run_command',
        'analyze_code',
        'verify_code',
        'refactor_code'
    ];
    
    // 각 툴 태그를 처리
    for (const toolName of toolNames) {
        // 정규식: <toolName>...</toolName> 또는 <toolName>...</toolName> (개행 포함)
        const toolTagRegex = new RegExp(`<${toolName}>([\\s\\S]*?)<\\/${toolName}>`, 'gi');
        
        result = result.replace(toolTagRegex, (match, content) => {
            // 툴 태그를 완전히 제거
            return '';
        });
    }
    
    // 부분 태그 제거 (스트리밍 중 닫히지 않은 태그)
    const lastOpenBracketIndex = result.lastIndexOf('<');
    if (lastOpenBracketIndex !== -1) {
        const possibleTag = result.slice(lastOpenBracketIndex);
        // 닫는 태그가 없고 툴 이름과 일치하면 제거
        if (!possibleTag.includes('</') && toolNames.some(name => possibleTag.startsWith(`<${name}`))) {
            result = result.slice(0, lastOpenBracketIndex);
        }
    }
    
    // 기타 XML 태그 제거 (thinking, function_calls 등)
    result = result.replace(/<thinking>\s?/g, '');
    result = result.replace(/\s?<\/thinking>/g, '');
    result = result.replace(/<think>\s?/g, '');
    result = result.replace(/\s?<\/think>/g, '');
    result = result.replace(/<function_calls>\s?/g, '');
    result = result.replace(/\s?<\/function_calls>/g, '');
    
    return result;
}

// AIDEV-IDE 메시지를 코드 블록 제외하고 Markdown 포맷 적용하여 표시
function displayCodePilotMessage(markdownText) {
    console.log('displayCodePilotMessage called with text length:', markdownText.length);
    if (!chatMessages) {
        console.error('chatMessages element not found!');
        return;
    }
    console.log('chatMessages element found, creating message container...');

    // 1. XML 툴 태그 제거
    const displayText = removeToolTags(markdownText);

    const messageContainer = document.createElement('div');
    messageContainer.classList.add('aidev-ide-message-container');

    const bubbleElement = document.createElement('div');
    bubbleElement.classList.add('message-bubble');

    // --- Markdown 텍스트를 코드 블록 기준으로 분할 및 조합 ---
    const codeBlockRegex = /```(\S*?)\n([\s\S]*?)```/g;
    let lastIndex = 0;
    const tempHtmlElements = document.createElement('div'); // 임시 컨테이너

    let match;
    // 모든 코드 블록을 순회하며 일반 텍스트와 코드 블록을 분리 처리
    while ((match = codeBlockRegex.exec(displayText)) !== null) {
        const precedingText = displayText.substring(lastIndex, match.index);
        const codeBlockFullMatch = match[0]; // ```...``` 전체
        const lang = match[1]; // 언어명
        const codeContent = match[2]; // 코드 내용

        // 1. 코드 블록 이전 텍스트 처리 (Markdown 포맷 적용)
        const processedPrecedingHtml = md.render(precedingText); // markdown-it 사용
        tempHtmlElements.innerHTML += DOMPurify.sanitize(processedPrecedingHtml);

        // 2. 코드 블록 처리 (HTML 태그 완전 제거, 순수 텍스트만)
        const preElement = document.createElement('pre');
        const codeElement = document.createElement('code');

        // HTML 엔티티만 디코딩하고 HTML 태그는 보존
        let cleanCodeContent = codeContent;

        // HTML 엔티티 디코딩
        const textarea = document.createElement('textarea');
        textarea.innerHTML = cleanCodeContent;
        cleanCodeContent = textarea.value;

        // HTML 태그는 제거하지 않고 보존 (HTML 엔티티만 디코딩)
        // 추가적인 HTML 엔티티 정리 (이미 디코딩된 것들은 다시 인코딩)
        cleanCodeContent = cleanCodeContent
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&nbsp;/g, ' ');

        // 코드 라인 수 계산
        const codeLines = cleanCodeContent.split('\n');
        const totalLines = codeLines.length;

        // 코드 블록 컨테이너 생성
        const codeBlockContainer = document.createElement('div');
        codeBlockContainer.classList.add('code-block-container');

        // 코드 블록 헤더 생성 (언어 표시만)
        const codeHeader = document.createElement('div');
        codeHeader.classList.add('code-block-header');

        const languageLabel = document.createElement('span');
        languageLabel.classList.add('code-language');
        languageLabel.textContent = lang || 'text';

        const lineCountLabel = document.createElement('span');
        lineCountLabel.classList.add('code-line-count');
        lineCountLabel.textContent = `${totalLines} lines`;

        codeHeader.appendChild(languageLabel);
        codeHeader.appendChild(lineCountLabel);

        // 코드 컨테이너 생성
        const codeContainer = document.createElement('div');
        codeContainer.classList.add('code-container');

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
                behavior: 'smooth',
                block: 'start', // 응답의 시작 부분이 화면 상단에 보이도록
                inline: 'nearest'
            });
        } else if (chatMessages) { // Fallback
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
window.showLoading = showLoading;
window.hideLoading = hideLoading;
window.displayCodePilotMessage = displayCodePilotMessage;

// 파일 선택기 열기
function openFilePicker() {
    console.log('Opening file picker...');
    vscode.postMessage({ command: 'openFilePicker' });
}

// 선택된 파일 추가
function addSelectedFile(filePath, fileName) {
    // 중복 파일 체크
    if (selectedFiles.some(file => file.path === filePath)) {
        console.log('File already selected:', filePath);
        return;
    }

    selectedFiles.push({ path: filePath, name: fileName });
    updateFileSelectionDisplay();
}

// 선택된 파일 제거
function removeSelectedFile(filePath) {
    selectedFiles = selectedFiles.filter(file => file.path !== filePath);
    updateFileSelectionDisplay();
}

// 모든 선택된 파일 제거
function clearAllSelectedFiles() {
    selectedFiles = [];
    updateFileSelectionDisplay();
}

// 파일 선택 영역 UI 업데이트
function updateFileSelectionDisplay() {
    if (!selectedFilesContainer || !fileSelectionArea) return;

    selectedFilesContainer.innerHTML = '';

    // 구분선 요소 찾기
    const divider = document.querySelector('.file-input-divider');

    if (selectedFiles.length === 0) {
        fileSelectionArea.classList.add('hidden');
        if (divider) {
            divider.classList.add('hidden');
        }
    } else {
        fileSelectionArea.classList.remove('hidden');
        if (divider) {
            divider.classList.remove('hidden');
        }

        selectedFiles.forEach(file => {
            const fileTag = document.createElement('div');
            fileTag.classList.add('selected-file-tag');
            fileTag.innerHTML = `
                <span class="file-name" title="${file.path}">${file.name}</span>
                <button class="remove-file" data-path="${file.path}" title="Remove file">×</button>
            `;

            // 개별 파일 제거 버튼 이벤트
            const removeButton = fileTag.querySelector('.remove-file');
            removeButton.addEventListener('click', () => {
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
const languageSelect = document.getElementById('language-select');
let currentLanguage = 'ko'; // 기본값
let languageData = {};

async function loadLanguage(lang) {
    try {
        // console.log('Requesting language data from extension:', lang);
        // 확장 프로그램에 언어 데이터 요청
        vscode.postMessage({ command: 'getLanguageData', language: lang });
    } catch (e) {
        console.error('Failed to load language:', lang, e);
    }
}

function applyLanguage() {
    console.log('=== applyLanguage called ===');
    console.log('Current language:', currentLanguage);
    console.log('Language data keys:', Object.keys(languageData));
    console.log('inputPlaceholder value:', languageData['inputPlaceholder']);

    // 타이틀
    const chatTitle = document.getElementById('chat-title');
    if (chatTitle && languageData['chatTitle']) chatTitle.textContent = languageData['chatTitle'];

    // 언어 라벨
    const languageLabel = document.getElementById('language-label');
    if (languageLabel && languageData['languageLabel']) languageLabel.textContent = languageData['languageLabel'];

    // Send 버튼
    const sendButton = document.getElementById('send-button');
    if (sendButton && languageData['sendButton']) sendButton.textContent = languageData['sendButton'];

    // Clear 버튼
    const clearButton = document.getElementById('clean-history-button');
    if (clearButton && languageData['clearButton']) clearButton.textContent = languageData['clearButton'];

    // Cancel 버튼
    const cancelButton = document.getElementById('cancel-call-button');
    if (cancelButton && languageData['cancelButton']) cancelButton.textContent = languageData['cancelButton'];

    // 입력창 placeholder
    const chatInput = document.getElementById('chat-input');
    console.log('Chat input element found:', !!chatInput);
    if (chatInput) {
        console.log('Current placeholder:', chatInput.placeholder);
        console.log('New placeholder value:', languageData['inputPlaceholder']);
    }
    if (chatInput && languageData['inputPlaceholder']) {
        chatInput.placeholder = languageData['inputPlaceholder'];
        console.log('Placeholder updated to:', chatInput.placeholder);
    } else {
        console.log('Failed to update placeholder - chatInput:', !!chatInput, 'inputPlaceholder:', !!languageData['inputPlaceholder']);
    }

    // 파일 선택 버튼
    const filePickerButton = document.getElementById('file-picker-button');
    if (filePickerButton && languageData['filePickerButton']) filePickerButton.textContent = languageData['filePickerButton'];

    console.log('=== applyLanguage completed ===');
}

if (languageSelect) {
    languageSelect.addEventListener('change', (e) => {
        const lang = e.target.value;
        console.log('Language changed to:', lang);
        currentLanguage = lang;
        loadLanguage(lang);

        // 언어 변경 시 즉시 저장 요청
        vscode.postMessage({ command: 'saveLanguage', language: lang });
    });
}

// 페이지 로드 시 기본 언어 적용
window.addEventListener('DOMContentLoaded', () => {
    // VS Code 설정에서 언어를 가져오도록 요청
    vscode.postMessage({ command: 'getLanguage' });
});

// --- Link click interception for opening files from AI messages ---
if (chatMessages) {
    chatMessages.addEventListener('click', (event) => {
        const target = event.target;
        if (!target) return;
        const anchor = target.closest ? target.closest('a') : null;
        if (!anchor) return;
        const href = anchor.getAttribute('href');
        if (!href) return;
        // Support both custom scheme and https placeholder
        if (href.startsWith('aidev-ide://open') || href.startsWith('https://aidev-ide.invalid/open')) {
            event.preventDefault();
            try {
                const url = new URL(href);
                const query = url.search ? url.search.slice(1) : (href.split('?')[1] || '');
                const params = new URLSearchParams(query);
                const p = params.get('path');
                if (p) {
                    vscode.postMessage({ command: 'openFileInEditor', path: decodeURIComponent(p) });
                }
            } catch (e) {
                console.warn('Failed to parse aidev-ide link:', href, e);
            }
        }
    });
}

/**
 * Git 리포지토리 정보를 채팅창에 표시
 */
function showGitRepositoryInfo(content) {
    const chatContainer = document.getElementById('chat-container');
    if (!chatContainer) return;

    // 기존 Git 정보 메시지가 있으면 제거
    const existingGitInfo = document.getElementById('git-repository-info');
    if (existingGitInfo) {
        existingGitInfo.remove();
    }

    // Git 정보 메시지 생성
    const gitInfoDiv = document.createElement('div');
    gitInfoDiv.id = 'git-repository-info';
    gitInfoDiv.className = 'git-info-message';
    gitInfoDiv.innerHTML = `
        <div class="git-info-content">
            <div class="git-info-header">
                <span class="git-info-icon">🔗</span>
                <span class="git-info-title">Git 리포지토리 연결됨</span>
            </div>
            <div class="git-info-body">
                ${content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/`(.*?)`/g, '<code>$1</code>').replace(/\n/g, '<br>')}
            </div>
        </div>
    `;

    // 스타일 추가
    const style = document.createElement('style');
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

    if (!document.getElementById('git-info-styles')) {
        style.id = 'git-info-styles';
        document.head.appendChild(style);
    }

    // 채팅 컨테이너 맨 위에 추가
    chatContainer.insertBefore(gitInfoDiv, chatContainer.firstChild);
}
