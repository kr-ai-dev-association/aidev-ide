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
    button.textContent = 'Run';
    button.title = 'Run commands';
    return button;
}

// Stop 버튼을 생성하는 헬퍼 함수
function createStopButton() {
    const button = document.createElement('button');
    button.classList.add('stop-bash-button');
    button.textContent = 'Stop';
    button.title = 'Stop running process';
    button.style.display = 'none'; // 초기엔 숨김
    return button;
}

// Stop 버튼에 이벤트 리스너를 등록하는 함수
function attachStopButtonListener(stopButton, runButton) {
    stopButton.addEventListener('click', () => {
        console.log('[codeCopy.js] Stop button clicked');
        if (vscode) {
            vscode.postMessage({ command: 'stopBashCommand' });
        }
        // Stop 숨기고 Run 복원
        stopButton.style.display = 'none';
        runButton.style.display = '';
    });
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

// bash 블록을 단일 명령으로 병합 (if/then/elif/else/fi 유지)
function mergeBashBlockToSingleCommand(bashCode) {
    const lines = bashCode.split('\n');
    let buffer = [];
    let ifDepth = 0;

    const pushLine = (l) => {
        const clean = removeInlineComment(l.trim());
        if (!clean || clean.startsWith('#')) return;
        if (/^exit(\s+\d+)?$/i.test(clean)) return; // 비정상 종료/종료 라인 제거
        if (/^echo\s*"?"?$/i.test(clean)) return; // 빈 echo 제거
        buffer.push(clean);
    };

    for (let raw of lines) {
        const line = removeInlineComment(raw.trim());
        if (!line || line.startsWith('#')) continue;

        // 고아 제어토큰 방지
        if (/^(then|fi|else|elif\b)/.test(line) && ifDepth === 0) {
            continue;
        }

        const startsIf = /^(if\b|if\s*\[|if\s*\[\[|if\s+test\b)/.test(line);
        const endsWithThen = /;\s*then\s*$/.test(line) || /\bthen\b\s*$/.test(line);

        if (startsIf) {
            ifDepth += 1;
            let normalized = line;
            if (!endsWithThen) normalized = line.replace(/;?\s*$/, ' ; then');
            pushLine(normalized);
            continue;
        }

        if (ifDepth > 0 && /^(elif\b|else\b)/.test(line)) {
            pushLine(line);
            continue;
        }

        if (/^fi\b/.test(line)) {
            ifDepth = Math.max(0, ifDepth - 1);
            pushLine('fi');
            continue;
        }

        // 일반 라인
        pushLine(line);
    }

    // 세미콜론으로 한 줄로 결합
    return buffer.join('; ');
}

// bash 명령어를 추출하고 정리하는 함수 (단일 명령으로 병합하여 반환)
function extractBashCommands(bashCode) {
    const merged = mergeBashBlockToSingleCommand(bashCode);
    return merged ? [merged] : [];
}

// powershell/cmd 블록은 원문을 단일 명령으로 전달 (터미널에서 그대로 실행)
function extractGenericCommands(rawCode) {
    const text = (rawCode || '').trim();
    return text ? [text] : [];
}

// Run 버튼에 이벤트 리스너를 등록하는 함수
function attachRunButtonListener(button, codeElement, lang, stopButton) {
    button.addEventListener('click', async () => {
        console.log('[codeCopy.js] Run button clicked');
        const codeText = codeElement.textContent || '';
        let commands = [];
        if (lang === 'bash' || lang === 'sh' || lang === 'shell') {
            console.log('[codeCopy.js] Bash code:', codeText);
            commands = extractBashCommands(codeText);
        } else {
            console.log('[codeCopy.js] Non-bash code (powershell/cmd):', lang);
            commands = extractGenericCommands(codeText);
        }
        console.log('[codeCopy.js] Extracted commands:', commands);

        if (commands.length === 0) {
            console.log('[codeCopy.js] No valid bash commands found');
            return;
        }

        // 개별 callout 박스에 executing 상태 표시
        showCalloutExecutingState(button, codeElement);

        // VS Code API를 통해 확장에 명령어 실행 요청 (단일 명령으로 동일 셸 세션에서 실행)
        if (vscode) {
            console.log('[codeCopy.js] Sending executeBashCommands message:', commands);
            vscode.postMessage({
                command: 'executeBashCommands',
                commands: commands
            });
        } else {
            console.error('[codeCopy.js] VS Code API not available');
        }

        // Run 숨기고 Stop 표시
        button.style.display = 'none';
        if (stopButton) {
            stopButton.style.display = '';
        }
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

// 이 함수는 chat.js의 displayCodePilotMessage 함수에서 호출됩니다.
// Keep 버튼 생성 함수 (anchor 태그 방식 - 파일 열기 아이콘과 동일한 로직)
function createKeepButton(filePath) {
    const button = document.createElement('a');
    button.classList.add('keep-button');
    button.textContent = 'Keep';
    button.title = `Keep all changes for ${filePath}`;

    // ✅ codepilot://acceptAll 스킴 사용 (chatMessages click 핸들러에서 처리)
    const encodedPath = encodeURIComponent(filePath);
    button.href = `codepilot://acceptAll?path=${encodedPath}`;
    
    button.style.cssText = `
        display: flex;
        justify-content: center;
        align-items: center;
        margin-top: 5px;
        margin-bottom: 10px;
        padding: 4px 12px;
        font-size: 11px;
        line-height: 1;
        border: none;
        border-radius: 3px;
        cursor: pointer;
        opacity: 1;
        transition: background-color 0.2s ease-in-out;
        z-index: 2;
        font-weight: 500;
        background-color: #73c991;
        color: white;
        text-decoration: none;
    `;
    
    return button;
}

// Undo 버튼 생성 함수 (anchor 태그 방식 - 파일 열기 아이콘과 동일한 로직)
function createUndoButton(filePath) {
    const button = document.createElement('a');
    button.classList.add('undo-button');
    button.textContent = 'Undo';
    button.title = `Undo all changes for ${filePath}`;

    // ✅ codepilot://rejectAll 스킴 사용 (chatMessages click 핸들러에서 처리)
    const encodedPath = encodeURIComponent(filePath);
    button.href = `codepilot://rejectAll?path=${encodedPath}`;
    
    button.style.cssText = `
        display: flex;
        justify-content: center;
        align-items: center;
        margin-top: 5px;
        margin-bottom: 10px;
        padding: 4px 12px;
        font-size: 11px;
        line-height: 1;
        border: none;
        border-radius: 3px;
        cursor: pointer;
        opacity: 1;
        transition: background-color 0.2s ease-in-out;
        z-index: 2;
        font-weight: 500;
        background-color: #1e1e1e;
        color: white;
        text-decoration: none;
    `;
    
    return button;
}

export function addCopyButtonsToCodeBlocks(bubbleElement) { // <-- export 키워드 유지 (함수명은 유지하되 기능 변경)
    if (!bubbleElement) return;

    // 새로운 코드 블록 컨테이너 구조에서 버튼 추가
    const codeBlockContainers = bubbleElement.querySelectorAll('.code-block-container');

    codeBlockContainers.forEach(container => {
        // 파일 경로 확인
        const filePath = container.getAttribute('data-file-path');
        
        // 코드 컨테이너 내부의 code 요소를 찾습니다
        const codeElement = container.querySelector('code');

        if (codeElement) {
            // 언어 라벨 확인 (bash인지 체크)
            const languageLabel = container.querySelector('.code-language');
            const labelText = (languageLabel && languageLabel.textContent) ? languageLabel.textContent.toLowerCase() : '';
            const isBash = labelText === 'bash' || labelText === 'sh' || labelText === 'shell';
            const isPwsh = labelText === 'powershell' || labelText === 'pwsh' || labelText === 'ps1';
            const isCmd = labelText === 'cmd' || labelText === 'batch' || labelText === 'bat';

            // 버튼 컨테이너 생성
            const buttonContainer = document.createElement('div');
            buttonContainer.classList.add('bash-button-container');

            // 파일 경로가 있는 경우: Undo/Keep 버튼 추가
            if (filePath) {
                // Undo 버튼 생성 (먼저)
                const undoButton = createUndoButton(filePath);
                buttonContainer.appendChild(undoButton);

                // Keep 버튼 생성 (나중)
                const keepButton = createKeepButton(filePath);
                buttonContainer.appendChild(keepButton);
            } else {
                // 파일 경로가 없는 경우: Bash/PowerShell/Cmd 블록에만 Copy와 Run 버튼 추가
                if (isBash || isPwsh || isCmd) {
                    // Copy 버튼 추가
                    const copyButton = createCopyButton();
                    buttonContainer.appendChild(copyButton);
                    attachCopyButtonListener(copyButton, codeElement);

                    // Run + Stop 버튼 추가
                    const runButton = createRunButton();
                    const stopButton = createStopButton();
                    buttonContainer.appendChild(runButton);
                    buttonContainer.appendChild(stopButton);
                    const lang = isBash ? 'bash' : (isPwsh ? 'powershell' : 'cmd');
                    attachRunButtonListener(runButton, codeElement, lang, stopButton);
                    attachStopButtonListener(stopButton, runButton);
                }
            }

            // 버튼이 있는 경우에만 컨테이너 삽입
            if (buttonContainer.children.length > 0) {
                container.insertAdjacentElement('afterend', buttonContainer);
            }
        }
    });

    // 기존 구조의 pre 요소들도 처리 (bash 블록에만 Copy 버튼 추가)
    const preElements = bubbleElement.querySelectorAll('pre:not(.code-block-container pre)');

    preElements.forEach(preElement => {
        // 이미 코드 블록 컨테이너의 자식인 경우 건너뛰기
        if (preElement.closest('.code-block-container')) {
            return;
        }

        // <pre> 태그 안에 <code> 태그가 있는지 확인
        const codeElement = preElement.querySelector('code');
        if (codeElement) {
            // 언어 확인 (bash/powershell/cmd인 경우에만 버튼 추가)
            const codeClass = codeElement.className || '';
            const isBash = codeClass.includes('language-bash') || codeClass.includes('language-sh') || codeClass.includes('language-shell');
            const isPwsh = codeClass.includes('language-powershell') || codeClass.includes('language-pwsh') || codeClass.includes('language-ps1');
            const isCmd = codeClass.includes('language-cmd') || codeClass.includes('language-batch') || codeClass.includes('language-bat');

            if (isBash || isPwsh || isCmd) {
                // 버튼 컨테이너 생성
                const buttonContainer = document.createElement('div');
                buttonContainer.classList.add('bash-button-container');

                // Copy 버튼 추가
                const copyButton = createCopyButton();
                buttonContainer.appendChild(copyButton);
                attachCopyButtonListener(copyButton, codeElement);

                // Run + Stop 버튼 추가
                const runButton = createRunButton();
                const stopButton = createStopButton();
                buttonContainer.appendChild(runButton);
                buttonContainer.appendChild(stopButton);
                const lang = isBash ? 'bash' : (isPwsh ? 'powershell' : 'cmd');
                attachRunButtonListener(runButton, codeElement, lang, stopButton);
                attachStopButtonListener(stopButton, runButton);

                // 버튼 컨테이너를 <pre> 요소 바로 뒤에 삽입
                preElement.insertAdjacentElement('afterend', buttonContainer);
            }
        }
    });
}


// TODO: 필요하다면 이 파일에서 VS Code API와 통신하는 함수 추가 (예: 알림 표시 요청)
// 현재는 attachCopyButtonListener 내부에서 직접 navigator.clipboard를 사용하므로 필요 없을 수 있습니다.