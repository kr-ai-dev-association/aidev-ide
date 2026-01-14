"use strict";
/**
 * ToolExecutionCoordinator
 * Tool 실행 및 결과 처리를 담당하는 클래스
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ToolExecutionCoordinator = void 0;
const types_1 = require("../../../tools/types");
const WebviewBridge_1 = require("../../../webview/WebviewBridge");
class ToolExecutionCoordinator {
    /**
     * Tool 실행 결과가 부작용이 있는지 확인
     */
    static hasSideEffects(calls, results) {
        const sideEffectTools = [types_1.Tool.CREATE_FILE, types_1.Tool.UPDATE_FILE, types_1.Tool.REMOVE_FILE, types_1.Tool.RUN_COMMAND];
        return results.some((res, i) => res.success && sideEffectTools.includes(calls[i].name));
    }
    /**
     * 파일 변경 추적 (요약 검증용)
     */
    static trackFileChanges(toolCalls, toolResults, createdFiles, modifiedFiles) {
        toolCalls.forEach((call, index) => {
            const result = toolResults[index];
            if (!result || !result.success)
                return;
            const filePath = call.params?.path || call.params?.file_path || call.params?.target_file;
            if (!filePath)
                return;
            if (call.name === types_1.Tool.CREATE_FILE) {
                if (!createdFiles.includes(filePath)) {
                    createdFiles.push(filePath);
                }
            }
            else if (call.name === types_1.Tool.UPDATE_FILE) {
                if (!modifiedFiles.includes(filePath)) {
                    modifiedFiles.push(filePath);
                }
            }
        });
    }
    /**
     * Tool 이름을 한글 레이블로 변환
     */
    static getToolLabel(toolName) {
        const labels = {
            [types_1.Tool.CREATE_FILE]: '파일 생성',
            [types_1.Tool.UPDATE_FILE]: '파일 수정',
            [types_1.Tool.REMOVE_FILE]: '파일 삭제',
            [types_1.Tool.READ_FILE]: '파일 읽기',
            [types_1.Tool.LIST_FILES]: '파일 목록',
            [types_1.Tool.SEARCH_FILES]: '파일 검색',
            [types_1.Tool.RIPGREP_SEARCH]: '코드 검색',
            [types_1.Tool.RUN_COMMAND]: '명령 실행',
            'plan': '계획 수립',
            'task_progress': '작업 진행'
        };
        return labels[toolName] || toolName;
    }
    /**
     * Tool 실행 결과 요약 생성
     */
    static createToolResultSummary(turn, calls, results) {
        let summary = '';
        results.forEach((res, i) => {
            const toolName = calls[i].name;
            summary += `[Tool: ${toolName}]\n`;
            summary += `Status: ${res.success ? 'Success' : 'Failed'}\n`;
            if (res.message && !res.success) {
                summary += `Error Message: ${res.message}\n`;
            }
            else if (res.message && res.success && !res.data && !res.fileContent) {
                // 데이터는 없지만 성공 메시지가 있는 경우 (예: 파일 생성 성공)
                summary += `Message: ${res.message}\n`;
            }
            // read_file 도구는 파일 내용을 명시적으로 포함해야 LLM이 반복 호출하지 않음
            if (toolName === types_1.Tool.READ_FILE) {
                if (res.success && res.data) {
                    // 여러 파일인 경우 (files 배열)
                    if (res.data.files && Array.isArray(res.data.files)) {
                        res.data.files.forEach((file, index) => {
                            summary += `File ${index + 1}: ${file.path}\n`;
                            if (file.error) {
                                summary += `Error: ${file.error}\n`;
                            }
                            else if (file.content) {
                                summary += `Content:\n${file.content}\n`;
                            }
                            summary += `---\n`;
                        });
                    }
                    else {
                        // 단일 파일인 경우 (기존 형식)
                        summary += `File: ${res.data.path || 'unknown'}\n`;
                        if (res.data.content) {
                            summary += `Content:\n${res.data.content}\n`;
                        }
                    }
                }
            }
            else {
                // 도구 실행 결과 데이터 포함 (가장 중요)
                if (res.data) {
                    const dataStr = typeof res.data === 'string' ? res.data : JSON.stringify(res.data, null, 2);
                    summary += `Output Data:\n${dataStr}\n`;
                }
                else if (res.fileContent) {
                    summary += `File Content:\n${res.fileContent}\n`;
                }
            }
            summary += `-------------------\n`;
        });
        return summary;
    }
    /**
     * Tool 실행 결과를 UI에 전송
     */
    static sendToolExecutionResultsToUI(webview, calls, results) {
        results.forEach((res, i) => {
            const toolName = calls[i].name;
            const params = calls[i].params || {};
            const path = params.path || params.file_path || params.target_file || '';
            const command = params.command || '';
            if (res.success) {
                // 파일 생성/수정인 경우 헤더는 System 스타일로, 내용은 CODEPILOT 스타일로 분리하여 표시
                if (toolName === types_1.Tool.CREATE_FILE || toolName === types_1.Tool.UPDATE_FILE) {
                    const action = toolName === types_1.Tool.CREATE_FILE ? 'Created' : 'Updated';
                    const icon = toolName === types_1.Tool.CREATE_FILE ? '✅' : '📝';
                    const content = toolName === types_1.Tool.CREATE_FILE ? (params.content || '') : (res.fileContent || '');
                    const ext = path.split('.').pop() || '';
                    // 1. 헤더 전송 (테두리와 색상이 있는 시스템 스타일)
                    WebviewBridge_1.WebviewBridge.receiveMessage(webview, 'System', `${icon} [${action}] ${path}`);
                    // 2. 코드 내용 전송 (복사 버튼이 있는 마크다운 스타일)
                    if (content) {
                        const codeMarkdown = `\`\`\`${ext}\n${content}\n\`\`\``;
                        WebviewBridge_1.WebviewBridge.receiveMessage(webview, 'CODEPILOT', codeMarkdown);
                    }
                    return;
                }
                // 나머지 도구들은 기존처럼 System 스타일 메시지로 표시 (테두리/색상 적용)
                let displayMsg = '';
                // enum 값과 문자열 모두 처리
                const toolNameStr = toolName;
                switch (toolNameStr) {
                    case types_1.Tool.REMOVE_FILE:
                    case 'remove_file':
                        displayMsg = `🗑️ [Deleted] ${path}`;
                        break;
                    case types_1.Tool.READ_FILE:
                    case 'read_file':
                        displayMsg = `📖 [Read] ${path}`;
                        break;
                    case types_1.Tool.LIST_FILES:
                    case 'list_files':
                        displayMsg = `📂 [Listed] ${path || 'root'}`;
                        break;
                    case types_1.Tool.SEARCH_FILES:
                    case 'search_files':
                        displayMsg = `🔍 [Searched] ${params.pattern || params.query || ''}`;
                        break;
                    case types_1.Tool.RIPGREP_SEARCH:
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
                        }
                        else {
                            // 다른 패턴 시도 (이스케이프되지 않은 경우)
                            const functionNameMatch = pattern.match(/function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/) ||
                                pattern.match(/(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/);
                            if (functionNameMatch && functionNameMatch[1]) {
                                displayPattern = `function ${functionNameMatch[1]}`;
                            }
                            else if (pattern.length > 50) {
                                displayPattern = pattern.substring(0, 50) + '...';
                            }
                        }
                        displayMsg = `🧩 [Ripgrep] ${displayPattern}`;
                        break;
                    case types_1.Tool.RUN_COMMAND:
                    case 'run_command':
                        displayMsg = `🚀 [Executed] ${command}`;
                        // 터미널 실행 결과가 있으면 추가로 표시 (사용자 요청 반영)
                        const output = res.data?.output || '';
                        if (output) {
                            // 헤더 먼저 전송
                            WebviewBridge_1.WebviewBridge.receiveMessage(webview, 'System', displayMsg);
                            // 실행 결과(터미널 출력)를 마크다운 코드 블록으로 전송
                            const terminalMarkdown = `\`\`\`bash\n${output}\n\`\`\``;
                            WebviewBridge_1.WebviewBridge.receiveMessage(webview, 'CODEPILOT', terminalMarkdown);
                            return;
                        }
                        break;
                    case types_1.Tool.ANALYZE_CODE:
                    case 'analyze_code':
                        displayMsg = `🔬 [Analyzed] ${path}`;
                        break;
                    default:
                        displayMsg = `✔️ [Success] ${ToolExecutionCoordinator.getToolLabel(toolName)}`;
                }
                WebviewBridge_1.WebviewBridge.receiveMessage(webview, 'System', displayMsg);
            }
            else {
                // 실패 시에는 항상 System 스타일로 에러 표시
                WebviewBridge_1.WebviewBridge.receiveMessage(webview, 'System', `❌ [Failed] ${ToolExecutionCoordinator.getToolLabel(toolName)}: ${res.message || 'Unknown error'}`);
            }
        });
    }
}
exports.ToolExecutionCoordinator = ToolExecutionCoordinator;
//# sourceMappingURL=ToolExecutionCoordinator.js.map