/**
 * ToolExecutionCoordinator
 * Tool 실행 및 결과 처리를 담당하는 클래스
 */

import * as vscode from 'vscode';
import * as pathModule from 'path';
import { Tool } from '../../../tools/types';
import { WebviewBridge } from '../../../webview/WebviewBridge';
import { InlineDiffManager } from '../../diff/InlineDiffManager';

export class ToolExecutionCoordinator {
    /**
     * Tool 실행 결과가 부작용이 있는지 확인
     */
    public static hasSideEffects(calls: any[], results: any[]): boolean {
        const sideEffectTools = [Tool.CREATE_FILE, Tool.UPDATE_FILE, Tool.REMOVE_FILE, Tool.RUN_COMMAND];
        return results.some((res, i) => res.success && sideEffectTools.includes(calls[i].name as Tool));
    }

    /**
     * 파일 변경 추적 (요약 검증용)
     */
    public static trackFileChanges(
        toolCalls: any[],
        toolResults: any[],
        createdFiles: string[],
        modifiedFiles: string[]
    ): void {
        toolCalls.forEach((call, index) => {
            const result = toolResults[index];
            if (!result || !result.success) return;

            const filePath = call.params?.path || call.params?.file_path || call.params?.target_file;
            if (!filePath) return;

            if (call.name === Tool.CREATE_FILE) {
                if (!createdFiles.includes(filePath)) {
                    createdFiles.push(filePath);
                }
            } else if (call.name === Tool.UPDATE_FILE) {
                if (!modifiedFiles.includes(filePath)) {
                    modifiedFiles.push(filePath);
                }
            }
        });
    }

    /**
     * Tool 이름을 한글 레이블로 변환
     */
    public static getToolLabel(toolName: string): string {
        const labels: { [key: string]: string } = {
            [Tool.CREATE_FILE]: '파일 생성',
            [Tool.UPDATE_FILE]: '파일 수정',
            [Tool.REMOVE_FILE]: '파일 삭제',
            [Tool.READ_FILE]: '파일 읽기',
            [Tool.LIST_FILES]: '파일 목록',
            [Tool.SEARCH_FILES]: '파일 검색',
            [Tool.RIPGREP_SEARCH]: '코드 검색',
            [Tool.RUN_COMMAND]: '명령 실행',
            'plan': '계획 수립',
            'task_progress': '작업 진행'
        };
        return labels[toolName] || toolName;
    }

    /**
     * Tool 실행 결과 요약 생성
     */
    public static createToolResultSummary(turn: number, calls: any[], results: any[]): string {
        let summary = '';
        results.forEach((res, i) => {
            const toolName = calls[i].name;
            summary += `[Tool: ${toolName}]\n`;
            summary += `Status: ${res.success ? 'Success' : 'Failed'}\n`;
            if (res.message && !res.success) {
                summary += `Error Message: ${res.message}\n`;
            } else if (res.message && res.success && !res.data && !res.fileContent) {
                // 데이터는 없지만 성공 메시지가 있는 경우 (예: 파일 생성 성공)
                summary += `Message: ${res.message}\n`;
            }

            // read_file 도구는 파일 내용을 명시적으로 포함해야 LLM이 반복 호출하지 않음
            if (toolName === Tool.READ_FILE) {
                if (res.success && res.data) {
                    // 여러 파일인 경우 (files 배열)
                    if (res.data.files && Array.isArray(res.data.files)) {
                        res.data.files.forEach((file: any, index: number) => {
                            summary += `File ${index + 1}: ${file.path}\n`;
                            if (file.error) {
                                summary += `Error: ${file.error}\n`;
                            } else if (file.content) {
                                summary += `Content:\n${file.content}\n`;
                            }
                            summary += `---\n`;
                        });
                    } else {
                        // 단일 파일인 경우 (기존 형식)
                        summary += `File: ${res.data.path || 'unknown'}\n`;
                        if (res.data.content) {
                            summary += `Content:\n${res.data.content}\n`;
                        }
                    }
                }
            } else {
                // 도구 실행 결과 데이터 포함 (가장 중요)
                if (res.data) {
                    const dataStr = typeof res.data === 'string' ? res.data : JSON.stringify(res.data, null, 2);
                    summary += `Output Data:\n${dataStr}\n`;
                } else if (res.fileContent) {
                    summary += `File Content:\n${res.fileContent}\n`;
                }
            }

            summary += `-------------------\n`;
        });
        return summary;
    }

    /**
     * 🔥 단일 Tool 실행 결과를 즉시 UI에 전송 (실시간 업데이트용)
     * executeTools의 onToolComplete 콜백에서 호출
     */
    public static sendSingleToolResultToUI(
        webview: vscode.Webview | undefined,
        call: any,
        result: any
    ): { sender: 'USER' | 'CODEPILOT' | 'System'; text: string; type?: 'action' | 'code' | 'summary' | 'message' }[] {
        if (!webview) return [];

        // sendToolExecutionResultsToUI의 단일 결과 처리 로직을 재사용
        return ToolExecutionCoordinator.sendToolExecutionResultsToUISync(webview, [call], [result]);
    }

    /**
     * Tool 실행 결과를 UI에 전송 (동기 버전 - 단일 도구용)
     */
    private static sendToolExecutionResultsToUISync(
        webview: vscode.Webview,
        calls: any[],
        results: any[]
    ): Array<{ sender: 'USER' | 'CODEPILOT' | 'System'; text: string; type?: 'action' | 'code' | 'summary' | 'message' }> {
        const collectedMessages: Array<{ sender: 'USER' | 'CODEPILOT' | 'System'; text: string; type?: 'action' | 'code' | 'summary' | 'message' }> = [];

        for (let i = 0; i < results.length; i++) {
            const res = results[i];
            const toolName = calls[i].name;
            const params = calls[i].params || {};
            const path = params.path || params.file_path || params.target_file || '';
            const command = params.command || '';

            if (res.success) {
                // CREATE_FILE, UPDATE_FILE 처리
                if (toolName === Tool.CREATE_FILE || toolName === Tool.UPDATE_FILE) {
                    const icon = toolName === Tool.CREATE_FILE ? '✅' : '📝';
                    const action = toolName === Tool.CREATE_FILE ? 'Created' : 'Updated';
                    const content = res.data?.fileContent || res.fileContent || params.content || '';
                    const ext = path.split('.').pop()?.toLowerCase() || 'txt';

                    // 라인 수 계산
                    let deletedLines = 0;
                    let addedLines = 0;
                    const cachedChanges = InlineDiffManager.getInstance().getChanges(path);
                    if (cachedChanges && cachedChanges.length > 0) {
                        for (const change of cachedChanges) {
                            if (change.type === 'delete') {
                                deletedLines += change.oldText?.split('\n').length || 0;
                            } else if (change.type === 'add') {
                                addedLines += change.newText?.split('\n').length || 0;
                            } else if (change.type === 'modify') {
                                deletedLines += change.oldText?.split('\n').length || 0;
                                addedLines += change.newText?.split('\n').length || 0;
                            }
                        }
                    }

                    // 헤더 전송
                    const headerMsg = `${icon} [${action}] ${path}`;
                    WebviewBridge.receiveMessage(webview, 'System', headerMsg);
                    collectedMessages.push({ sender: 'System', text: headerMsg, type: 'action' });

                    // 코드 블록 전송
                    if (content) {
                        let langLabel = ext;
                        if (deletedLines > 0 || addedLines > 0) {
                            const parts: string[] = [];
                            if (deletedLines > 0) parts.push(`-${deletedLines} lines`);
                            if (addedLines > 0) parts.push(`+${addedLines} lines`);
                            langLabel = `${ext} ${parts.join(' ')}`;
                        }
                        const langLabelWithPath = path ? `${langLabel} [file:${path}]` : langLabel;
                        const codeMarkdown = `\`\`\`${langLabelWithPath}\n${content}\n\`\`\``;
                        WebviewBridge.receiveMessage(webview, 'CODEPILOT', codeMarkdown);
                        collectedMessages.push({ sender: 'CODEPILOT', text: codeMarkdown, type: 'code' });
                    }
                } else if (toolName === Tool.REMOVE_FILE || toolName === 'remove_file') {
                    const displayMsg = `🗑️ [Removed] ${path}`;
                    WebviewBridge.receiveMessage(webview, 'System', displayMsg);
                    collectedMessages.push({ sender: 'System', text: displayMsg, type: 'action' });
                } else if (toolName === Tool.RUN_COMMAND || toolName === 'run_terminal') {
                    const displayMsg = `🚀 [Executed] ${command}`;
                    WebviewBridge.receiveMessage(webview, 'System', displayMsg);
                    collectedMessages.push({ sender: 'System', text: displayMsg, type: 'action' });

                    const output = res.data?.output || '';
                    if (output) {
                        const terminalMarkdown = `\`\`\`bash\n${output}\n\`\`\``;
                        WebviewBridge.receiveMessage(webview, 'CODEPILOT', terminalMarkdown);
                        collectedMessages.push({ sender: 'CODEPILOT', text: terminalMarkdown, type: 'code' });
                    }
                }
                // read_file, list_files 등은 UI에 표시하지 않음
            } else {
                // 실패
                const errorMsg = `❌ [Failed] ${ToolExecutionCoordinator.getToolLabel(toolName)}: ${res.message || 'Unknown error'}`;
                WebviewBridge.receiveMessage(webview, 'System', errorMsg);
                collectedMessages.push({ sender: 'System', text: errorMsg, type: 'action' });
            }
        }

        // 🔥 파일 변경 후 pending changes 상태를 webview에 전송 (실시간 버튼 업데이트)
        ToolExecutionCoordinator.sendPendingChangesUpdate(webview);

        return collectedMessages;
    }

    /**
     * Tool 실행 결과를 UI에 전송
     * @returns UI에 보낸 메시지 배열 (세션 히스토리 저장용)
     *
     * 코드 블록은 receiveMessage로 전송 (UI 렌더링 유지 - Keep/Undo 버튼 등)
     */
    public static async sendToolExecutionResultsToUI(
        webview: vscode.Webview,
        calls: any[],
        results: any[]
    ): Promise<Array<{ sender: 'USER' | 'CODEPILOT' | 'System'; text: string; type?: 'action' | 'code' | 'summary' | 'message' }>> {
        console.log(`[ToolExecutionCoordinator] sendToolExecutionResultsToUI called with ${results.length} results, webview=${!!webview}`);
        const collectedMessages: Array<{ sender: 'USER' | 'CODEPILOT' | 'System'; text: string; type?: 'action' | 'code' | 'summary' | 'message' }> = [];

        // 🔥 forEach → for...of로 변경 (async/await 지원)
        for (let i = 0; i < results.length; i++) {
            const res = results[i];
            const toolName = calls[i].name;
            const params = calls[i].params || {};
            const path = params.path || params.file_path || params.target_file || '';
            const command = params.command || '';

            console.log(`[ToolExecutionCoordinator] Processing result ${i}: toolName="${toolName}", success=${res.success}, isCreateOrUpdate=${toolName === Tool.CREATE_FILE || toolName === Tool.UPDATE_FILE}`);

            if (res.success) {
                // 파일 생성/수정인 경우 헤더는 System 스타일로, 내용은 CODEPILOT 스타일로 분리하여 표시
                if (toolName === Tool.CREATE_FILE || toolName === Tool.UPDATE_FILE) {
                    const action = toolName === Tool.CREATE_FILE ? 'Created' : 'Updated';
                    const icon = toolName === Tool.CREATE_FILE ? '✅' : '📝';
                    // ✅ 수정: CREATE_FILE도 res.fileContent 사용 (params.content는 LLM 입력, res.fileContent는 처리된 실제 내용)
                    const content = res.fileContent || params.content || '';
                    const ext = path.split('.').pop() || '';

                    // ✅ 디버깅: content 값 확인
                    console.log(`[ToolExecutionCoordinator] ${toolName} content debug:`, {
                        hasResFileContent: !!res.fileContent,
                        resFileContentLength: res.fileContent?.length || 0,
                        hasParamsContent: !!params.content,
                        paramsContentLength: params.content?.length || 0,
                        finalContentLength: content.length,
                        resKeys: Object.keys(res)
                    });

                    // ✅ 추가/삭제 라인 수 계산
                    let addedLines = 0;
                    let deletedLines = 0;

                    if (toolName === Tool.CREATE_FILE) {
                        // 새 파일: 전체 라인 수가 추가된 라인
                        if (content) {
                            addedLines = content.split('\n').length;
                        }
                    } else if (toolName === Tool.UPDATE_FILE) {
                        // ✅ 수정 파일: InlineDiffManager에서 이미 계산한 changes 사용
                        // ✅ 핵심: showInlineDiff에서 이미 올바른 시점(apply 전)에 계산한 결과를 재사용
                        const inlineDiffManager = InlineDiffManager.getInstance();

                        // ✅ 핵심: path를 절대 경로로 변환 (workspace root 기준)
                        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
                        const absolutePath = pathModule.isAbsolute(path)
                            ? path
                            : workspaceRoot
                                ? pathModule.join(workspaceRoot, path)
                                : path;

                        // ✅ showInlineDiff에서 이미 계산한 changes 가져오기 (올바른 시점의 결과)
                        const changes = inlineDiffManager.getLastAppliedChanges(absolutePath);

                        if (changes && changes.length > 0) {
                            console.log(`[ToolExecutionCoordinator] Using ${changes.length} cached changes from InlineDiffManager for ${path}`);

                            for (const change of changes) {
                                if (change.type === 'add') {
                                    // 추가는 range 기반
                                    const affectedLines = Math.max(
                                        1,
                                        change.range.end.line - change.range.start.line + 1
                                    );
                                    addedLines += affectedLines;
                                } else if (change.type === 'delete') {
                                    // 삭제는 oldText 기준으로 정확히 계산 (range가 0인 경우 방지)
                                    const lines = change.oldText.split('\n');
                                    const deleted = lines[lines.length - 1] === '' ? lines.length - 1 : lines.length;
                                    deletedLines += Math.max(1, deleted);
                                } else if (change.type === 'modify') {
                                    // ✅ 수정은 oldText와 newText의 실제 라인 수를 각각 계산
                                    // oldText의 라인 수 (삭제된 라인)
                                    const oldTextLines = change.oldText.split('\n');
                                    const oldLineCount = oldTextLines[oldTextLines.length - 1] === ''
                                        ? Math.max(1, oldTextLines.length - 1)
                                        : Math.max(1, oldTextLines.length);

                                    // newText의 라인 수 (추가된 라인)
                                    const newTextLines = change.newText.split('\n');
                                    const newLineCount = newTextLines[newTextLines.length - 1] === ''
                                        ? Math.max(1, newTextLines.length - 1)
                                        : Math.max(1, newTextLines.length);

                                    deletedLines += oldLineCount;
                                    addedLines += newLineCount;

                                    console.log(`[ToolExecutionCoordinator] Modify change: oldText=${oldLineCount} lines, newText=${newLineCount} lines`);
                                }
                            }

                            console.log(`[ToolExecutionCoordinator] Line count calculated: deleted=${deletedLines}, added=${addedLines}`);
                        } else {
                            // ✅ changes가 없으면 경고만 하고 계속 진행 (라인 수 정보 없이 표시)
                            console.warn(`[ToolExecutionCoordinator] No changes found for ${path}, skipping line count calculation. This may happen if showInlineDiff hasn't been called yet or file was just created.`);
                            // 경고만 하고 계속 진행 (라인 수 정보 없이 코드 블록 표시)
                        }
                    }

                    // 1. 헤더 전송 (테두리와 색상이 있는 시스템 스타일)
                    const headerMsg = `${icon} [${action}] ${path}`;
                    WebviewBridge.receiveMessage(webview, 'System', headerMsg);
                    collectedMessages.push({ sender: 'System', text: headerMsg, type: 'action' });

                    // 2. 코드 내용 전송 (🔥 스트리밍 효과로 타이핑)
                    // ✅ 라인 수 정보를 언어 라벨에 포함
                    if (content) {
                        let langLabel = ext;
                        if (deletedLines > 0 || addedLines > 0) {
                            const parts: string[] = [];
                            // ✅ 순서 고정: 삭제 먼저, 추가 나중 (modify 타입 지원)
                            if (deletedLines > 0) {
                                parts.push(`-${deletedLines} lines`);
                            }
                            if (addedLines > 0) {
                                parts.push(`+${addedLines} lines`);
                            }
                            langLabel = `${ext} ${parts.join(' ')}`;
                            console.log(`[ToolExecutionCoordinator] Line count info: ${langLabel} (deleted: ${deletedLines}, added: ${addedLines})`);
                            console.log(`[ToolExecutionCoordinator] RAW langLabel string: "${langLabel}"`);
                        }
                        // ✅ 파일 경로 정보를 langLabel에 포함 (파일 열기 아이콘용)
                        const langLabelWithPath = path ? `${langLabel} [file:${path}]` : langLabel;
                        const codeMarkdown = `\`\`\`${langLabelWithPath}\n${content}\n\`\`\``;
                        console.log(`[ToolExecutionCoordinator] Code markdown with file path: langLabel="${langLabelWithPath}"`);
                        console.log(`[ToolExecutionCoordinator] BEFORE sending code block: webview=${!!webview}, codeMarkdownLength=${codeMarkdown.length}`);

                        // ✅ 코드 블록은 receiveMessage로 전송 (Keep/Undo 버튼 등 특수 UI 유지)
                        WebviewBridge.receiveMessage(webview, 'CODEPILOT', codeMarkdown);
                        collectedMessages.push({ sender: 'CODEPILOT', text: codeMarkdown, type: 'code' });
                        console.log(`[ToolExecutionCoordinator] AFTER sending code block`);
                    }
                    continue; // 🔥 return → continue (for 루프 내에서)
                }

                // 나머지 도구들은 기존처럼 System 스타일 메시지로 표시 (테두리/색상 적용)
                let displayMsg = '';
                // enum 값과 문자열 모두 처리
                const toolNameStr = toolName as string;
                switch (toolNameStr) {
                    case Tool.REMOVE_FILE:
                    case 'remove_file':
                        displayMsg = `🗑️ [Deleted] ${path}`;
                        break;
                    case Tool.READ_FILE:
                    case 'read_file':
                        displayMsg = `📖 [Read] ${path}`;
                        break;
                    case Tool.LIST_FILES:
                    case 'list_files':
                        displayMsg = `📂 [Listed] ${path || 'root'}`;
                        break;
                    case Tool.SEARCH_FILES:
                    case 'search_files':
                        displayMsg = `🔍 [Searched] ${params.pattern || params.query || ''}`;
                        break;
                    case Tool.RIPGREP_SEARCH:
                    case 'ripgrep_search':
                        // 패턴에서 함수명 추출하여 간단하게 표시
                        const pattern = params.pattern || params.query || '';
                        // 복잡한 정규식 패턴에서 함수명만 추출 (예: "function test" 또는 "test"만 표시)
                        // 패턴 예: "(?:function|const|let|var|export\s+(?:function|const|let|var)|export\s+default\s+function)\s+test\b"
                        // → "function test"로 표시
                        let displayPattern = pattern;

                        // 패턴 끝에서 함수명 추출 시도 (예: ...)\s+test\b)
                        // 이스케이프된 백슬래시를 고려하여 매칭: "\\s+" → 실제로는 "\s+"를 의미
                        const functionNameAtEnd = pattern.match(/\\s\+([a-zA-Z_$][a-zA-Z0-9_$]*)\\b/);
                        if (functionNameAtEnd && functionNameAtEnd[1]) {
                            displayPattern = `function ${functionNameAtEnd[1]}`;
                        } else {
                            // 다른 패턴 시도 (이스케이프되지 않은 경우)
                            const functionNameMatch = pattern.match(/function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/) ||
                                pattern.match(/(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/);
                            if (functionNameMatch && functionNameMatch[1]) {
                                displayPattern = `function ${functionNameMatch[1]}`;
                            } else if (pattern.length > 50) {
                                displayPattern = pattern.substring(0, 50) + '...';
                            }
                        }
                        displayMsg = `🧩 [Ripgrep] ${displayPattern}`;
                        break;
                    case Tool.RUN_COMMAND:
                    case 'run_command':
                        displayMsg = `🚀 [Executed] ${command}`;

                        // 터미널 실행 결과가 있으면 추가로 표시 (사용자 요청 반영)
                        const output = res.data?.output || '';
                        console.log(`[ToolExecutionCoordinator] 🔥 DEBUG run_command output: "${output?.substring(0, 200)}..." (${output?.length || 0} chars)`);
                        console.log(`[ToolExecutionCoordinator] 🔥 DEBUG res.data:`, JSON.stringify(res.data || {}).substring(0, 500));
                        if (output) {
                            // 헤더 먼저 전송
                            WebviewBridge.receiveMessage(webview, 'System', displayMsg);
                            collectedMessages.push({ sender: 'System', text: displayMsg, type: 'action' });
                            // ✅ 터미널 출력도 receiveMessage로 전송 (코드 블록 UI 유지)
                            const terminalMarkdown = `\`\`\`bash\n${output}\n\`\`\``;
                            WebviewBridge.receiveMessage(webview, 'CODEPILOT', terminalMarkdown);
                            collectedMessages.push({ sender: 'CODEPILOT', text: terminalMarkdown, type: 'code' });
                            continue;
                        }
                        break;
                    case Tool.ANALYZE_CODE:
                    case 'analyze_code':
                        displayMsg = `🔬 [Analyzed] ${path}`;
                        break;
                    default:
                        displayMsg = `✔️ [Success] ${ToolExecutionCoordinator.getToolLabel(toolName)}`;
                }
                WebviewBridge.receiveMessage(webview, 'System', displayMsg);
                collectedMessages.push({ sender: 'System', text: displayMsg, type: 'action' });
            } else {
                // 실패 시에는 항상 System 스타일로 에러 표시
                const errorMsg = `❌ [Failed] ${ToolExecutionCoordinator.getToolLabel(toolName)}: ${res.message || 'Unknown error'}`;
                WebviewBridge.receiveMessage(webview, 'System', errorMsg);
                collectedMessages.push({ sender: 'System', text: errorMsg, type: 'action' });
            }
        }

        // ✅ 파일 변경 후 pending changes 상태를 webview에 전송
        ToolExecutionCoordinator.sendPendingChangesUpdate(webview);

        return collectedMessages;
    }

    /**
     * Pending changes 업데이트를 webview에 전송
     */
    public static sendPendingChangesUpdate(webview: vscode.Webview): void {
        try {
            const diffManager = InlineDiffManager.getInstance();
            const stats = diffManager.getPendingChangesStats();
            webview.postMessage({
                command: 'updatePendingChanges',
                files: stats
            });
        } catch (error) {
            console.warn('[ToolExecutionCoordinator] Failed to send pending changes update:', error);
        }
    }
}
