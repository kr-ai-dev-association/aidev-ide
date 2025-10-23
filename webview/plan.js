// Plan Queue Webview Script
if (typeof window.vscode === 'undefined' && typeof acquireVsCodeApi !== 'undefined') {
    window.vscode = acquireVsCodeApi();
}
const vscode = window.vscode || null;

function render(items) {
    const root = document.getElementById('plan-root');
    if (!root) return;
    root.innerHTML = '';

    const toolbar = document.createElement('div');
    toolbar.className = 'plan-toolbar';
    toolbar.innerHTML = `
        <button id="refresh-plan">새로고침</button>
        <button id="clear-plan">모두 비우기</button>
    `;
    root.appendChild(toolbar);

    const list = document.createElement('div');
    list.className = 'plan-list';

    if (!Array.isArray(items) || items.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'info-message';
        empty.textContent = '큐에 항목이 없습니다. Plan 단계를 실행하면 할일이 추가됩니다.';
        list.appendChild(empty);
    } else {
        items.forEach(item => {
            const row = document.createElement('div');
            row.className = `plan-row status-${item.status}`;
            row.innerHTML = `
                <div class="plan-main">
                    <div class="plan-title">${item.title}</div>
                    ${item.detail ? `<div class="plan-detail">${item.detail}</div>` : ''}
                    <div class="plan-meta">${new Date(item.createdAt).toLocaleString()} • ${item.status}</div>
                </div>
                <div class="plan-actions">
                    <button data-cmd="run" data-id="${item.id}">실행</button>
                    <button data-cmd="complete" data-id="${item.id}">완료</button>
                    <button data-cmd="cancel" data-id="${item.id}">취소</button>
                </div>
            `;
            list.appendChild(row);
        });
    }
    root.appendChild(list);

    // wire events
    const refreshBtn = document.getElementById('refresh-plan');
    if (refreshBtn) refreshBtn.onclick = () => vscode && vscode.postMessage({ command: 'planQueueLoad' });
    const clearBtn = document.getElementById('clear-plan');
    if (clearBtn) clearBtn.onclick = () => vscode && vscode.postMessage({ command: 'planQueueClear' });

    list.querySelectorAll('button[data-cmd]')?.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const el = e.currentTarget;
            const cmd = el.getAttribute('data-cmd');
            const id = el.getAttribute('data-id');
            if (vscode) vscode.postMessage({ command: cmd === 'run' ? 'planQueueRun' : cmd === 'complete' ? 'planQueueComplete' : 'planQueueCancel', id });
        });
    });
}

window.addEventListener('message', (event) => {
    const message = event.data;
    if (message.command === 'planQueueData') {
        render(message.items || []);
    } else if (message.command === 'planQueueError') {
        const root = document.getElementById('plan-root');
        if (root) root.innerHTML = `<p class="error-message">${message.error}</p>`;
    }
});

// initial request
if (vscode) vscode.postMessage({ command: 'planQueueLoad' });


