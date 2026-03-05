/**
 * SubAgentLoop
 * 경량 에이전트 루프 — ConversationManager의 핵심 루프만 추출
 *
 * 설계 원칙:
 * - LLMManager.getInstance() 공유 (HTTP 호출만 하므로 안전)
 * - ToolExecutor 독립 인스턴스 (각 에이전트별)
 * - NO FSM, NO streaming, NO session management, NO user approval
 * - 단순 while 루프: LLM 호출 → 도구 파싱 → 도구 실행 → 결과 축적
 */

import { LLMManager, LLMMessagePart } from '../managers/model/LLMManager';
import { ToolExecutor } from '../tools/ToolExecutor';
import { ToolParser } from '../tools/ToolParser';
import { ToolSpecBuilder } from '../tools/ToolSpecBuilder';
import { ToolExecutionContext } from '../tools/IToolHandler';
import { ToolUse, ToolResponse, Tool, READ_ONLY_TOOLS } from '../tools/types';
import { ToolRegistry } from '../tools/ToolRegistry';
import { buildToolPromptSection } from '../managers/context/prompts/tools/toolCalling';
import { SubTask, AgentLoopResult, AgentLoopCallbacks, THINKING_TAG_REGEX } from './types';

const MAX_TURNS = 15;
const MAX_CONSECUTIVE_FAILURES = 3;

export class SubAgentLoop {
    private llmManager: LLMManager;
    private toolExecutor: ToolExecutor;
    private subtask: SubTask;
    private toolContext: ToolExecutionContext;
    private abortSignal?: AbortSignal;
    private projectContext: string;
    private rulesContext: string;
    private callbacks?: AgentLoopCallbacks;

    constructor(
        subtask: SubTask,
        toolContext: ToolExecutionContext,
        abortSignal?: AbortSignal,
        projectContext?: string,
        callbacks?: AgentLoopCallbacks,
        rulesContext?: string,
    ) {
        this.subtask = subtask;
        this.toolContext = toolContext;
        this.abortSignal = abortSignal;
        this.projectContext = projectContext || '';
        this.rulesContext = rulesContext || '';
        this.callbacks = callbacks;
        this.llmManager = LLMManager.getInstance();
        this.toolExecutor = new ToolExecutor();
    }

    async run(): Promise<AgentLoopResult> {
        const startTime = Date.now();
        const createdFiles: string[] = [];
        const modifiedFiles: string[] = [];
        const errors: string[] = [];
        let turnCount = 0;
        let tokenEstimate = 0;
        let lastResponse = '';
        let consecutiveFailures = 0;
        let completedNormally = false;
        let hasExecutedTools = false;
        let hasExecutedWriteTools = false;
        let lastRunCommand = '';
        let consecutiveRunCommandCount = 0;

        // 이 에이전트의 대화 컨텍스트
        const conversationParts: LLMMessagePart[] = [
            { text: `Task: ${this.subtask.title}\n\n${this.subtask.description}` }
        ];

        const systemPrompt = this.buildSystemPrompt();

        while (turnCount < MAX_TURNS) {
            if (this.abortSignal?.aborted) {
                errors.push('사용자에 의해 중단됨');
                break;
            }

            turnCount++;

            try {
                // 1. LLM 호출
                const response = await this.llmManager.sendMessageWithSystemPrompt(
                    systemPrompt,
                    conversationParts,
                    { signal: this.abortSignal, disableThinking: false }
                );

                tokenEstimate += this.estimateTokens(response);

                // 1.5. thinking 내용 UI 전송 + 빈 응답 감지
                const thinkingMatch = response.match(/<think>([\s\S]*?)<\/think>/);
                if (thinkingMatch && this.callbacks?.onThinking) {
                    const thinkingText = thinkingMatch[1].trim();
                    if (thinkingText) {
                        this.callbacks.onThinking(thinkingText);
                    }
                }

                const trimmed = response.replace(THINKING_TAG_REGEX, '').trim();
                if (!trimmed) {
                    consecutiveFailures++;
                    console.warn(`[SubAgentLoop:${this.subtask.id}] Empty/thinking-only response (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES})`);
                    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                        errors.push('LLM이 사고(thinking)만 반복하고 도구 호출이나 텍스트 응답을 생성하지 못했습니다. 모델이 작업 지시를 이해하지 못했을 수 있습니다.');
                        break;
                    }
                    // thinking 내용을 컨텍스트에 보존 → 다음 턴에서 활용 가능
                    conversationParts.push({ text: response });
                    conversationParts.push({
                        text: this.buildRecoveryNudge(consecutiveFailures)
                    });
                    continue;
                }
                lastResponse = response;

                // 2. 도구 파싱
                const warnings: string[] = [];
                const toolCalls = ToolParser.parseCodeBlockFormat(response, warnings);

                // 도구 없음: 실제 완료인지 판단
                if (toolCalls.length === 0) {
                    // full 권한 → 쓰기 도구 실행 필수, read-only → 읽기만으로 충분
                    const needsWrite = this.subtask.toolPermission === 'full';
                    const hasCompletedWork = needsWrite ? hasExecutedWriteTools : hasExecutedTools;

                    if (hasCompletedWork) {
                        completedNormally = true;
                        break;
                    }
                    // 작업을 수행하지 않았는데 텍스트만 출력 → 실패
                    consecutiveFailures++;
                    const reason = needsWrite && hasExecutedTools
                        ? 'read-only tools only, no write operations'
                        : 'no prior tool execution';
                    console.warn(`[SubAgentLoop:${this.subtask.id}] No tool calls (${reason}) — treating as failure (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES})`);
                    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                        errors.push(needsWrite && hasExecutedTools
                            ? 'LLM이 파일 읽기만 수행하고 파일 생성/수정을 하지 않았습니다. 도구 호출 형식(```json)을 따르지 못한 것일 수 있습니다.'
                            : 'LLM이 도구 호출을 생성하지 못했습니다. 응답에 ```json 코드블록 형식의 도구 호출이 포함되지 않았습니다.');
                        break;
                    }
                    conversationParts.push({ text: response });
                    conversationParts.push({
                        text: this.buildRecoveryNudge(consecutiveFailures)
                    });
                    continue;
                }

                // 3. 권한별 필터링
                const allowedCalls = this.filterByPermission(toolCalls);

                if (allowedCalls.length === 0) {
                    conversationParts.push({ text: response });
                    conversationParts.push({
                        text: '[시스템] 요청한 모든 도구가 권한 정책에 의해 차단되었습니다. 다른 방법을 시도하거나 도구 없이 응답하세요.'
                    });
                    continue;
                }

                // 4. 연속 동일 run_command 가드 — 3회차부터 자동 차단
                const blockedCommandMessages: string[] = [];
                const deduplicatedCalls = allowedCalls.filter(call => {
                    if (call.name !== 'run_command') { return true; }
                    const cmd = (call.params.command as string) || '';
                    if (cmd === lastRunCommand) {
                        consecutiveRunCommandCount++;
                    } else {
                        lastRunCommand = cmd;
                        consecutiveRunCommandCount = 1;
                    }
                    if (consecutiveRunCommandCount >= 3) {
                        console.warn(`[SubAgentLoop:${this.subtask.id}] Auto-blocking repeated run_command (${consecutiveRunCommandCount}x): ${cmd}`);
                        blockedCommandMessages.push(
                            `[run_command] BLOCKED\n` +
                            `[시스템] "${cmd}"가 이미 ${consecutiveRunCommandCount - 1}회 실행되어 백그라운드에서 실행 중입니다. ` +
                            `동일 명령어를 반복 호출하지 마세요. 서버가 정상 실행 중이므로 다음 단계로 진행하거나 작업 완료를 선언하세요.`
                        );
                        return false;
                    }
                    return true;
                });

                // 5. 도구 실행 (UI 콜백 연결)
                const results = deduplicatedCalls.length > 0
                    ? await this.toolExecutor.executeTools(
                        deduplicatedCalls,
                        this.toolContext,
                        this.callbacks?.onToolComplete,
                        this.callbacks?.onToolStart,
                    )
                    : [];

                // 도구가 실행됐으므로 실패 카운터 리셋
                consecutiveFailures = 0;

                // 도구 성공 플래그 설정
                for (let i = 0; i < deduplicatedCalls.length; i++) {
                    if (results[i]?.success) {
                        hasExecutedTools = true;
                        if (!READ_ONLY_TOOLS.has(deduplicatedCalls[i].name)) {
                            hasExecutedWriteTools = true;
                        }
                    }
                }

                // 6. 파일 변경 추적 (ToolResponse.filePath 기반 — 도구 이름 하드코딩 없음)
                for (let i = 0; i < deduplicatedCalls.length; i++) {
                    const call = deduplicatedCalls[i];
                    const result = results[i];
                    if (result?.success && result.filePath) {
                        if (result.fileContent !== undefined) {
                            if (READ_ONLY_TOOLS.has(call.name)) { continue; }
                            // 이미 추적 중이면 modifiedFiles로, 처음이면 createdFiles로
                            const alreadyTracked = createdFiles.includes(result.filePath) || modifiedFiles.includes(result.filePath);
                            if (!alreadyTracked) {
                                createdFiles.push(result.filePath);
                            } else if (!modifiedFiles.includes(result.filePath)) {
                                modifiedFiles.push(result.filePath);
                            }
                        }
                    }
                }

                // 7. 도구 결과를 다음 턴 컨텍스트에 추가 (차단된 명령어 메시지 포함)
                let toolResultsText = this.formatToolResults(deduplicatedCalls, results);
                if (blockedCommandMessages.length > 0) {
                    toolResultsText += (toolResultsText ? '\n\n' : '') + blockedCommandMessages.join('\n\n');
                }
                conversationParts.push({ text: response });
                conversationParts.push({ text: toolResultsText });

            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                if (error instanceof Error && error.name === 'AbortError') {
                    errors.push('사용자에 의해 중단됨');
                    break;
                }

                consecutiveFailures++;
                errors.push(`${turnCount}턴: ${msg}`);

                if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                    errors.push('연속 실패 횟수 초과, 에이전트를 중단합니다');
                    break;
                }

                conversationParts.push({
                    text: this.buildRecoveryNudge(consecutiveFailures)
                });
            }
        }

        return {
            subtaskId: this.subtask.id,
            success: completedNormally,
            response: lastResponse,
            createdFiles: [...new Set(createdFiles)],
            modifiedFiles: [...new Set(modifiedFiles)],
            errors,
            turnCount,
            tokenEstimate,
            executionTime: Date.now() - startTime,
        };
    }

    private buildSystemPrompt(): string {
        // 권한에 따라 허용할 도구 필터링
        const allowedTools = this.getAllowedTools();
        const toolSpecs = ToolSpecBuilder.buildToolSpecs(allowedTools);
        const toolSection = buildToolPromptSection(toolSpecs);

        const projectSection = this.projectContext
            ? `\n## 프로젝트 구조\n${this.projectContext}\n`
            : '';

        const rulesSection = this.rulesContext
            ? `\n${this.rulesContext}\n`
            : '';

        return `당신은 특정 서브태스크를 수행하는 코딩 어시스턴트입니다.
${rulesSection}
## 작업
${this.subtask.title}

## 상세 지시사항
${this.subtask.description}
${projectSection}
## 규칙
- 이 작업에만 집중하세요
- 작업이 완료되면 수행한 내용을 **한국어로** 간략히 요약하세요
- 할당된 범위 밖의 작업은 시도하지 마세요
- 파일 구조가 제공된 경우 list_files 없이 바로 작업을 시작하세요
- 모든 응답은 한국어로 작성하세요

${toolSection}

## 도구 호출 예시 (반드시 이 형식을 따르세요)

파일 읽기:
{ "tool": "read_file", "path": "src/App.tsx" }

파일 생성:
{ "tool": "create_file", "path": "src/components/MyComponent.tsx" }
<file_content>
import React from 'react';
const MyComponent = () => <div>Hello</div>;
export default MyComponent;
</file_content>

파일 수정 (SEARCH/REPLACE):
{ "tool": "update_file", "path": "src/App.tsx" }
<file_changes>
<<<< SEARCH
import React from 'react';
====
import React from 'react';
import MyComponent from './components/MyComponent';
>>>> REPLACE
</file_changes>

파일 목록:
{ "tool": "list_files", "path": "src", "recursive": "true" }

**중요: 도구를 사용하려면 위 JSON 형식을 response에 직접 출력하세요. 설명 텍스트 없이 JSON만 출력하세요. thinking에 도구 호출을 넣지 마세요.**`;
    }

    private getAllowedTools(): Tool[] {
        if (this.subtask.toolPermission === 'full') {
            return Object.values(Tool) as Tool[];
        }

        const readOnly = Array.from(READ_ONLY_TOOLS) as Tool[];

        if (this.subtask.toolPermission === 'read-only-with-commands') {
            return [...readOnly, Tool.RUN_COMMAND];
        }

        return readOnly;
    }

    private filterByPermission(toolCalls: ToolUse[]): ToolUse[] {
        if (this.subtask.toolPermission === 'full') {
            return toolCalls;
        }

        const registry = ToolRegistry.getInstance();

        return toolCalls.filter(call => {
            if (READ_ONLY_TOOLS.has(call.name)) {
                return true;
            }
            // MCP 도구는 모든 권한 수준에서 허용 (자체 승인 메커니즘 보유)
            if (registry.isMCPTool(call.name)) {
                return true;
            }
            if (this.subtask.toolPermission === 'read-only-with-commands' && call.name === 'run_command') {
                return true;
            }
            console.warn(`[SubAgentLoop:${this.subtask.id}] Blocked tool ${call.name} (permission: ${this.subtask.toolPermission})`);
            return false;
        });
    }

    private formatToolResults(calls: ToolUse[], results: ToolResponse[]): string {
        const parts: string[] = [];
        for (let i = 0; i < calls.length; i++) {
            const call = calls[i];
            const result = results[i];
            if (!result) { continue; }

            const status = result.success ? 'OK' : 'FAILED';
            const isReadOnly = READ_ONLY_TOOLS.has(call.name);
            const isMCP = ToolRegistry.getInstance().isMCPTool(call.name);
            const maxLen = (isReadOnly || isMCP) ? 8000 : 1000;

            // message + data 모두 포함 (data에 실제 내용이 있음)
            let body = result.message || '';
            if (result.data) {
                body += '\n' + this.serializeToolData(result.data);
            }

            if (body.length > maxLen) {
                body = body.substring(0, maxLen) + '\n[...truncated]';
            }

            parts.push(`[${call.name}] ${status}\n${body}`);
        }
        return parts.join('\n\n');
    }

    /**
     * 도구 결과 데이터를 LLM이 읽을 수 있는 문자열로 변환
     * 특정 도구에 의존하지 않는 범용 직렬화
     */
    private serializeToolData(data: any): string {
        if (data === null || data === undefined) { return ''; }
        if (typeof data !== 'object') { return String(data); }
        if (Array.isArray(data)) {
            return data.map(item => typeof item === 'string' ? item : JSON.stringify(item)).join('\n');
        }
        try { return JSON.stringify(data, null, 2); }
        catch { return String(data); }
    }

    /**
     * 연속 실패 횟수에 따라 점점 더 구체적인 복구 프롬프트 생성
     */
    private buildRecoveryNudge(failureCount: number): string {
        if (failureCount <= 1) {
            return '[시스템] 이전 응답이 비어있거나 사고(thinking)만 포함되어 있습니다. 반드시 도구 호출 또는 일반 텍스트 최종 요약을 출력하세요.';
        }

        // 2회 이상 실패 시 구체적인 도구 호출 예시 제공
        const allowedTools = this.getAllowedTools();
        const exampleTool = allowedTools[0] || 'list_files';
        return `[시스템] 경고: ${failureCount}회 연속 실패. 반드시 다음 중 하나를 출력하세요:\n` +
            `1. 다음 형식의 도구 호출:\n` +
            '```json\n' +
            `{ "tool": "${exampleTool}", "params": {} }\n` +
            '```\n' +
            `2. 또는 완료된 작업의 일반 텍스트 요약 (도구 호출 없음 = 작업 완료).\n` +
            `<think> 태그만 출력하지 마세요. 지금 바로 가시적인 출력을 생성하세요.`;
    }

    private estimateTokens(text: string): number {
        return Math.ceil(text.length / 4);
    }
}
