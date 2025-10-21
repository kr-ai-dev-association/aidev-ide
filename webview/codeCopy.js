// VS Code API를 전역으로 획득 (ask.js와 공유)
if (typeof window.vscode === 'undefined' && typeof acquireVsCodeApi !== 'undefined') {
    window.vscode = acquireVsCodeApi();
}
const vscode = window.vscode || null;

// 클립보드 복사 기능을 위한 헬퍼 함수
// Webview에서는 navigator.clipboard 사용 가능
async function copyToClipboard(text) {
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
            // console.log('Code copied to clipboard!');
            return true; // 성공
        } else {
            console.warn('Clipboard API not available.');
            // Fallback 방법 (document.execCommand('copy'))은 보안상 권장되지 않아 생략
            return false; // 실패
        }
    } catch (err) {
        console.error('Failed to copy code:', err);
        return false; // 실패
    }
}

// 복사 버튼을 생성하는 헬퍼 함수
function createCopyButton() {
    const button = document.createElement('button');
    button.classList.add('copy-code-button');
    button.textContent = 'Copy'; // 버튼 텍스트
    button.title = 'Copy code to clipboard'; // 툴팁

    return button;
}

// Run 버튼을 생성하는 헬퍼 함수
function createRunButton() {
    const button = document.createElement('button');
    button.classList.add('run-bash-button');
    button.textContent = 'Run'; // 버튼 텍스트
    button.title = 'Run bash commands'; // 툴팁

    return button;
}

// 개별 callout 박스에 executing 상태를 표시하는 함수
function showCalloutExecutingState(button, codeElement) {
    // callout 박스 찾기 (codeElement의 부모 요소)
    const calloutBox = codeElement.closest('pre') || codeElement.closest('.code-block');
    if (!calloutBox) return;

    // executing 상태 표시 요소 생성
    const executingIndicator = document.createElement('div');
    executingIndicator.className = 'callout-executing-indicator';
    executingIndicator.innerHTML = `
        <div class="callout-executing-content">
            <div class="callout-executing-spinner"></div>
            <span class="callout-executing-text">Executing...</span>
        </div>
    `;

    // 스타일 적용
    executingIndicator.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.8);
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10;
        border-radius: 4px;
    `;

    // callout 박스를 relative positioning으로 설정
    calloutBox.style.position = 'relative';
    
    // executing 상태 표시
    calloutBox.appendChild(executingIndicator);

    // 3초 후 자동으로 제거 (실제 실행 완료 시에는 다른 로직에서 제거)
    setTimeout(() => {
        if (executingIndicator.parentNode) {
            executingIndicator.parentNode.removeChild(executingIndicator);
        }
    }, 3000);
}

// 명령어에서 인라인 주석을 제거하는 함수
function removeInlineComment(command) {
    // 따옴표 안의 #은 주석이 아니므로 보호
    let inQuotes = false;
    let quoteChar = '';
    let escaped = false;

    for (let i = 0; i < command.length; i++) {
        const char = command[i];

        if (escaped) {
            escaped = false;
            continue;
        }

        if (char === '\\') {
            escaped = true;
            continue;
        }

        if (!inQuotes && (char === '"' || char === "'")) {
            inQuotes = true;
            quoteChar = char;
            continue;
        }

        if (inQuotes && char === quoteChar) {
            inQuotes = false;
            quoteChar = '';
            continue;
        }

        if (!inQuotes && char === '#') {
            return command.substring(0, i).trim();
        }
    }

    return command.trim();
}

// bash 명령어를 추출하고 정리하는 함수
function extractBashCommands(bashCode) {
    const commands = [];
    const lines = bashCode.split('\n');

    for (const line of lines) {
        const trimmedLine = line.trim();
        // 주석 처리된 줄들(#으로 시작)과 빈 줄들을 제외
        if (trimmedLine && !trimmedLine.startsWith('#')) {
            // 인라인 주석 제거
            const cleanCommand = removeInlineComment(trimmedLine);
            if (cleanCommand) {
                commands.push(cleanCommand);
            }
        }
    }

    return commands;
}

// Run 버튼에 이벤트 리스너를 등록하는 함수
function attachRunButtonListener(button, codeElement) {
    button.addEventListener('click', async () => {
        console.log('[codeCopy.js] Run button clicked');
        const bashCode = codeElement.textContent || '';
        console.log('[codeCopy.js] Bash code:', bashCode);
        const commands = extractBashCommands(bashCode);
        console.log('[codeCopy.js] Extracted commands:', commands);

        if (commands.length === 0) {
            console.log('[codeCopy.js] No valid bash commands found');
            return;
        }

        // 개별 callout 박스에 executing 상태 표시
        showCalloutExecutingState(button, codeElement);

        // VS Code API를 통해 확장에 명령어 실행 요청
        if (vscode) {
            console.log('[codeCopy.js] Sending executeBashCommands message:', commands);
            vscode.postMessage({
                command: 'executeBashCommands',
                commands: commands
            });
        } else {
            console.error('[codeCopy.js] VS Code API not available');
        }

        // 버튼 피드백
        const originalText = button.textContent;
        button.textContent = 'Running...';
        button.disabled = true;

        setTimeout(() => {
            button.textContent = originalText;
            button.disabled = false;
        }, 2000);
    });
}

// 단일 복사 버튼에 이벤트 리스너를 등록하는 함수
// 클릭된 버튼과 해당 코드 엘리먼트를 연결합니다.
function attachCopyButtonListener(button, codeElement) {
    button.addEventListener('click', async () => {
        const codeText = codeElement.textContent || '';
        const success = await copyToClipboard(codeText);

        // 복사 성공/실패 시 버튼 텍스트 변경 피드백
        const originalText = button.textContent;
        if (success) {
            button.textContent = 'Copied!';
        } else {
            button.textContent = 'Failed!';
        }
        setTimeout(() => {
            button.textContent = originalText;
        }, 2000); // 2초 후 복원

        // TODO: VS Code API를 통해 사용자에게 알림 표시 고려 (선택 사항)
        // 웹뷰에서 확장으로 메시지를 보내 알림 표시를 요청하는 방식 사용
        // 예: vscode.postMessage({ command: 'showInfoNotification', message: 'Code copied!' });
    });
}

// CodePilot 메시지 버블 내부에서 코드 블록을 찾아 복사 버튼과 run 버튼을 추가하는 메인 함수
// 이 함수는 chat.js의 displayCodePilotMessage 함수에서 호출됩니다.
// 인자로 CodePilot 메시지의 bubbleElement (DOM 요소)를 받습니다.
export function addCopyButtonsToCodeBlocks(bubbleElement) { // <-- export 키워드 유지
    if (!bubbleElement) return;

    // 새로운 코드 블록 컨테이너 구조에서 복사 버튼과 run 버튼 추가
    const codeBlockContainers = bubbleElement.querySelectorAll('.code-block-container');

    codeBlockContainers.forEach(container => {
        // 코드 컨테이너 내부의 code 요소를 찾습니다
        const codeElement = container.querySelector('code');

        if (codeElement) {
            // 언어 라벨 확인 (bash인지 체크)
            const languageLabel = container.querySelector('.code-language');
            const isBash = languageLabel && languageLabel.textContent.toLowerCase() === 'bash';

            // 버튼 컨테이너 생성
            const buttonContainer = document.createElement('div');
            buttonContainer.classList.add('bash-button-container');

            // 복사 버튼 생성
            const copyButton = createCopyButton();
            buttonContainer.appendChild(copyButton);

            // bash인 경우 run 버튼도 추가
            if (isBash) {
                const runButton = createRunButton();
                buttonContainer.appendChild(runButton);
                attachRunButtonListener(runButton, codeElement);
            }

            // 버튼 컨테이너를 코드 블록 컨테이너 바로 뒤에 삽입
            container.insertAdjacentElement('afterend', buttonContainer);

            // 복사 버튼에 클릭 이벤트 리스너 등록
            attachCopyButtonListener(copyButton, codeElement);
        }
    });

    // 기존 구조의 pre 요소들도 처리 (하지만 중복 방지를 위해 이미 처리된 컨테이너는 제외)
    const preElements = bubbleElement.querySelectorAll('pre:not(.code-block-container pre)');

    preElements.forEach(preElement => {
        // 이미 코드 블록 컨테이너의 자식인 경우 건너뛰기
        if (preElement.closest('.code-block-container')) {
            return;
        }

        // <pre> 태그 안에 <code> 태그가 있는지 확인
        const codeElement = preElement.querySelector('code');
        if (codeElement) {
            // 복사 버튼 생성
            const copyButton = createCopyButton();

            // 버튼을 <pre> 요소 바로 뒤(형제)로 삽입합니다.
            preElement.insertAdjacentElement('afterend', copyButton);

            // 새로 생성된 버튼에 클릭 이벤트 리스너 등록
            attachCopyButtonListener(copyButton, codeElement);
        }
    });

    // console.log(`[codeCopy.js] Added copy buttons to ${codeBlockContainers.length} code block containers and ${preElements.length} legacy pre elements.`);
}


// TODO: 필요하다면 이 파일에서 VS Code API와 통신하는 함수 추가 (예: 알림 표시 요청)
// 현재는 attachCopyButtonListener 내부에서 직접 navigator.clipboard를 사용하므로 필요 없을 수 있습니다.