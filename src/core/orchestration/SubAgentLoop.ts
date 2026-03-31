/**
 * SubAgentLoop
 * 경량 에이전트 루프 — ConversationManager의 핵심 루프만 추출
 *
 * 설계 원칙:
 * - LLMManager.getInstance() 공유 (HTTP 호출만 하므로 안전)
 * - ToolExecutor 독립 인스턴스 (각 에이전트별)
 * - NO FSM, NO session management, NO user approval
 * - 스트리밍 모드 지원 (useStreaming=true 시 타임아웃 없이 스트리밍)
 * - 단순 while 루프: LLM 호출 → 도구 파싱 → 도구 실행 → 결과 축적
 */

import { LLMManager, LLMMessagePart } from '../managers/model/LLMManager';
import { AiModelType } from '../../services';
import { estimateTokens } from '../../utils/tokenUtils';
import { ToolExecutor } from '../tools/ToolExecutor';
import { ToolParser } from '../tools/ToolParser';
import { ToolSpecBuilder } from '../tools/ToolSpecBuilder';
import { ToolExecutionContext } from '../tools/IToolHandler';
import { ToolUse, ToolResponse, Tool, READ_ONLY_TOOLS } from '../tools/types';
import { ToolRegistry } from '../tools/ToolRegistry';
import { buildToolPromptSection } from '../managers/context/prompts/tools/toolCalling';
import { SubTask, AgentLoopResult, AgentLoopCallbacks, THINKING_TAG_REGEX } from './types';
import { AgentConfig } from '../config/AgentConfig';
import { SettingsManager } from '../managers/state/SettingsManager';
import { StateManager } from '../managers/state/StateManager';
import * as fs from 'fs/promises';
import * as path from 'path';

const MAX_TURNS = 25;
const MAX_CONSECUTIVE_FAILURES = 3;
const MAX_READONLY_CONSECUTIVE_TURNS = 4; // read-only 도구만 연속 N턴이면 write 유도

export class SubAgentLoop {
    private llmManager: LLMManager;
    private toolExecutor: ToolExecutor;
    private subtask: SubTask;
    private toolContext: ToolExecutionContext;
    private abortSignal?: AbortSignal;
    private projectContext: string;
    private rulesContext: string;
    private callbacks?: AgentLoopCallbacks;
    private useStreaming: boolean;
    private thinkingEnabled: boolean;
    private disableReadDedup: boolean;
    private isRepairAgent: boolean;
    private stateManager?: StateManager;

    constructor(
        subtask: SubTask,
        toolContext: ToolExecutionContext,
        abortSignal?: AbortSignal,
        projectContext?: string,
        callbacks?: AgentLoopCallbacks,
        rulesContext?: string,
        useStreaming?: boolean,
        thinkingEnabled?: boolean,
        agentOptions?: { disableReadDedup?: boolean; isRepairAgent?: boolean },
        stateManager?: StateManager,
    ) {
        this.subtask = subtask;
        this.toolContext = toolContext;
        this.abortSignal = abortSignal;
        this.projectContext = projectContext || '';
        this.rulesContext = rulesContext || '';
        this.callbacks = callbacks;
        this.useStreaming = useStreaming ?? false;
        this.thinkingEnabled = thinkingEnabled ?? true;
        this.disableReadDedup = agentOptions?.disableReadDedup ?? false;
        this.isRepairAgent = agentOptions?.isRepairAgent ?? false;
        this.stateManager = stateManager;
        this.llmManager = LLMManager.getInstance();
        this.toolExecutor = new ToolExecutor();
    }

    async run(): Promise<AgentLoopResult> {
        const startTime = Date.now();
        let pausedDuration = 0; // 사용자 승인 대기 시간 (타임아웃에서 제외)
        const createdFiles: string[] = [];
        const modifiedFiles: string[] = [];
        const deletedFiles: string[] = [];
        const errors: string[] = [];
        const warnings: string[] = [];
        let turnCount = 0;
        let tokenEstimate = 0;
        let lastResponse = '';
        let consecutiveFailures = 0;
        let completedNormally = false;
        let doneStatus: 'completed' | 'already_done' | undefined;
        let hasExecutedTools = false;
        let hasExecutedWriteTools = false;
        let consecutiveReadOnlyTurns = 0;
        // update_file 실패 추적 — __done__ 수락 전 재시도 강제용
        let failedUpdateFilePaths: string[] = [];
        // v1.0.25: createdFilesInSession 제거 — diagnostics 에러 수정을 위한 update_file 허용
        // 이 에이전트의 대화 컨텍스트
        const conversationParts: LLMMessagePart[] = [
            { text: `Task: ${this.subtask.title}\n\n${this.subtask.description}` }
        ];

        // 턴 간 중복 read_file 방지: 이미 읽은 경로 추적
        const alreadyReadFiles = new Set<string>();
        // 턴 간 중복 stat_file 방지: 이미 stat한 경로 추적
        const alreadyStattedFiles = new Set<string>();

        // Native tool calling 설정 (루프 전 1회 계산)
        const adminConfig = this.llmManager.getAdminModelConfig();
        const isNativeAdmin = this.llmManager.getCurrentModel() === AiModelType.ADMIN
            && (adminConfig?.nativeToolCallingSupported === true || String(adminConfig?.nativeToolCallingSupported) === 'true');

        const systemPrompt = this.buildSystemPrompt(isNativeAdmin);

        // 스트리밍 즉시 파일 생성 설정 (루프 전 1회 읽기)
        const isAutoToolEnabled = await SettingsManager.getInstance().isAutoToolExecutionEnabled();
        const isAutoUpdateEnabled = await SettingsManager.getInstance().isAutoUpdateEnabled();
        const allowedTools = this.getAllowedTools();
        const nativeTools = isNativeAdmin ? ToolSpecBuilder.buildOpenAIToolsConfig(allowedTools, true) : undefined;
        // thinkingEnabled=false → 항상 비활성화; true → native admin 여부에 따라 결정
        const disableThinking = !this.thinkingEnabled ? true : !isNativeAdmin;

        while (turnCount < MAX_TURNS) {
            if (this.abortSignal?.aborted) {
                errors.push('사용자에 의해 중단됨');
                break;
            }

            // 서브에이전트 대화 압축: 컨텍스트가 커지면 오래된 도구 결과 축소
            if (turnCount > 0 && conversationParts.length > 10) {
                const totalChars = conversationParts.reduce((sum, p) => sum + (p.text?.length || 0), 0);
                if (totalChars > 30000) {
                    // 첫 번째(태스크 설명)와 마지막 4개는 유지, 중간 도구 결과를 요약
                    const keepFirst = 1;
                    const keepLast = 4;
                    if (conversationParts.length > keepFirst + keepLast + 2) {
                        const middle = conversationParts.slice(keepFirst, -keepLast);
                        const middleFiles = new Set<string>();
                        for (const p of middle) {
                            const text = p.text || '';
                            const fileMatches = text.match(/(?:read_file|create_file|update_file|remove_file)[:\s]+([^\n\]]+)/g);
                            if (fileMatches) fileMatches.forEach(m => middleFiles.add(m.substring(0, 60)));
                        }
                        const summary = `[이전 턴 요약] ${middle.length}개 메시지 압축됨. 작업한 파일: ${[...middleFiles].join(', ') || '(도구 호출 없음)'}`;
                        conversationParts.splice(keepFirst, middle.length, { text: summary });
                        console.log(`[SubAgentLoop:${this.subtask.id}] Context compacted: ${middle.length} messages → 1 summary (${totalChars} → ${conversationParts.reduce((s, p) => s + (p.text?.length || 0), 0)} chars)`);
                    }
                }
            }

            // 전체 루프 타임아웃 체크 (사용자 승인 대기 시간 제외)
            if (Date.now() - startTime - pausedDuration > AgentConfig.SUB_AGENT_TOTAL_TIMEOUT) {
                errors.push(`전체 실행 시간 초과 (${AgentConfig.SUB_AGENT_TOTAL_TIMEOUT / 1000}초)`);
                break;
            }

            turnCount++;

            try {
                // 1. LLM 호출
                let response: string;
                // Fix 8: 스트리밍 중 완성된 create_file 즉시 실행 추적
                let streamingCreatedPaths = new Set<string>();
                let streamingHandledPaths = new Set<string>(); // pending 처리됨 (승인 무관)
                try {
                    if (this.useStreaming) {
                        // 스트리밍 모드: 개별 호출 타임아웃 불필요 (데이터가 계속 들어옴), 전체 타임아웃만 적용
                        let streamBuffer = '';
                        let lastReportedTool = '';
                        let lastScanPos = 0;
                        const FILE_END_MARKER = '</file_content>';
                        let streamLastFileContentPos = 0;
                        let streamingCreatePromise: Promise<void> = Promise.resolve();

                        // 스트리밍 즉시 파일 생성 공통 실행 함수
                        // needsApproval=true: 실행 전 onToolApprovalRequired 콜백으로 승인 요청
                        const executeStreamingCreate = (path: string, capturedCall: ToolUse, needsApproval: boolean = false) => {
                            if (needsApproval) {
                                streamingHandledPaths.add(path);
                            } else {
                                streamingCreatedPaths.add(path);
                            }
                            this.callbacks?.onStreamingStatus?.(`파일 생성 중: ${path}`);
                            streamingCreatePromise = streamingCreatePromise.then(async () => {
                                if (this.abortSignal?.aborted) { return; }
                                if (needsApproval && this.callbacks?.onToolApprovalRequired) {
                                    const approved = await this.callbacks.onToolApprovalRequired(capturedCall);
                                    if (!approved) { return; }
                                }
                                const streamResults = await this.toolExecutor.executeTools(
                                    [capturedCall], this.toolContext,
                                    this.callbacks?.onToolComplete, this.callbacks?.onToolStart,
                                    this.abortSignal
                                );
                                if (streamResults[0]?.success && capturedCall.params.path) {
                                    const streamPath = capturedCall.params.path;
                                    streamingCreatedPaths.add(streamPath);
                                    if (!createdFiles.includes(streamPath) && !modifiedFiles.includes(streamPath)) {
                                        createdFiles.push(streamPath);
                                    }
                                }
                            });
                        };

                        // 네이티브 tool_call 완성 시 콜백
                        // ON+ON: 즉시 실행 / ON+파일OFF 또는 도구OFF: 즉시 pending
                        const onNativeToolComplete = (toolName: string, args: Record<string, any>) => {
                            if (toolName !== 'create_file' || !args.path) { return; }
                            // read-only 권한에서는 스트리밍 중 create_file 차단
                            if (this.subtask.toolPermission !== 'full') { return; }
                            const p = args.path as string;
                            if (streamingCreatedPaths.has(p) || streamingHandledPaths.has(p)) { return; }
                            const capturedCall: ToolUse = { name: toolName, params: { ...args } };
                            const needsApproval = !isAutoToolEnabled || !isAutoUpdateEnabled;
                            executeStreamingCreate(p, capturedCall, needsApproval);
                        };

                        const onChunk = (chunk: string) => {
                            streamBuffer += chunk;

                            // read-only 권한에서는 스트리밍 중 create_file 완전 차단
                            if (this.subtask.toolPermission !== 'full') {
                                // 스트리밍 위치만 업데이트 (실행 없음)
                                let endIdx = streamBuffer.indexOf(FILE_END_MARKER, streamLastFileContentPos);
                                while (endIdx !== -1) {
                                    streamLastFileContentPos = endIdx + FILE_END_MARKER.length;
                                    endIdx = streamBuffer.indexOf(FILE_END_MARKER, streamLastFileContentPos);
                                }
                            } else if (isAutoToolEnabled && isAutoUpdateEnabled) {
                                // ON+ON: </file_content> 감지 즉시 실행
                                let endIdx = streamBuffer.indexOf(FILE_END_MARKER, streamLastFileContentPos);
                                while (endIdx !== -1) {
                                    const segmentEnd = endIdx + FILE_END_MARKER.length;
                                    const segment = streamBuffer.substring(0, segmentEnd).replace(THINKING_TAG_REGEX, '');
                                    streamLastFileContentPos = segmentEnd;
                                    const segCalls = ToolParser.parseCodeBlockFormat(segment, []);
                                    for (const call of segCalls) {
                                        if (call.name === 'create_file' && call.params.path && !streamingCreatedPaths.has(call.params.path)) {
                                            executeStreamingCreate(call.params.path, call, false);
                                        }
                                    }
                                    endIdx = streamBuffer.indexOf(FILE_END_MARKER, streamLastFileContentPos);
                                }
                            } else {
                                // 도구OFF 또는 파일OFF: </file_content> 감지 즉시 pending
                                let endIdx = streamBuffer.indexOf(FILE_END_MARKER, streamLastFileContentPos);
                                while (endIdx !== -1) {
                                    const segmentEnd = endIdx + FILE_END_MARKER.length;
                                    const segment = streamBuffer.substring(0, segmentEnd).replace(THINKING_TAG_REGEX, '');
                                    streamLastFileContentPos = segmentEnd;
                                    const segCalls = ToolParser.parseCodeBlockFormat(segment, []);
                                    for (const call of segCalls) {
                                        if (call.name === 'create_file' && call.params.path &&
                                            !streamingCreatedPaths.has(call.params.path) &&
                                            !streamingHandledPaths.has(call.params.path)) {
                                            executeStreamingCreate(call.params.path, call, true);
                                        }
                                    }
                                    endIdx = streamBuffer.indexOf(FILE_END_MARKER, streamLastFileContentPos);
                                }
                            }

                            if (!this.callbacks?.onStreamingStatus) { return; }

                            // 새로 추가된 부분만 스캔 (이전 매치 재감지 방지)
                            const newContent = streamBuffer.substring(lastScanPos);
                            const toolStatus = this.parseStreamingToolStatus(newContent);
                            if (toolStatus && toolStatus !== lastReportedTool) {
                                lastReportedTool = toolStatus;
                                lastScanPos = streamBuffer.length;
                                this.callbacks.onStreamingStatus(toolStatus);
                                return;
                            }

                            // 툴 미감지 시 토큰 카운트 표시 (500자마다 업데이트)
                            if (!lastReportedTool && streamBuffer.length % 500 < chunk.length) {
                                const tokens = estimateTokens(streamBuffer);
                                this.callbacks.onStreamingStatus(`응답 생성 중 (${tokens.toLocaleString()} 토큰...)`);
                            }
                        };
                        response = this.stateManager
                            ? await this.llmManager.sendMessageWithSubAgentModelStreaming(
                                systemPrompt, conversationParts, onChunk, this.stateManager,
                                { signal: this.abortSignal, disableThinking, nativeTools, onNativeToolComplete })
                            : await this.llmManager.sendMessageWithSystemPromptStreaming(
                                systemPrompt, conversationParts, onChunk,
                                { signal: this.abortSignal, disableThinking, nativeTools, onNativeToolComplete });
                        // 스트리밍 중 시작된 create_file 모두 완료 대기
                        await streamingCreatePromise;
                    } else {
                        // 비스트리밍 모드: 개별 호출 타임아웃 적용
                        const timeoutController = new AbortController();
                        const timeoutId = setTimeout(() => timeoutController.abort(), AgentConfig.SUB_AGENT_LLM_CALL_TIMEOUT);
                        const signals = [timeoutController.signal];
                        if (this.abortSignal) { signals.push(this.abortSignal); }
                        const combinedSignal = AbortSignal.any(signals);
                        try {
                            response = this.stateManager
                                ? await this.llmManager.sendMessageWithSubAgentModel(
                                    systemPrompt, conversationParts, this.stateManager,
                                    { signal: combinedSignal, disableThinking, nativeTools })
                                : await this.llmManager.sendMessageWithSystemPrompt(
                                    systemPrompt, conversationParts,
                                    { signal: combinedSignal, disableThinking, nativeTools });
                        } catch (timeoutErr) {
                            if (timeoutController.signal.aborted) {
                                clearTimeout(timeoutId);
                                consecutiveFailures++;
                                errors.push(`LLM 호출 타임아웃 (${AgentConfig.SUB_AGENT_LLM_CALL_TIMEOUT / 1000}초)`);
                                if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                                    errors.push('연속 실패 횟수 초과, 에이전트를 중단합니다');
                                    break;
                                }
                                conversationParts.push({ text: this.buildRecoveryNudge(consecutiveFailures) });
                                continue;
                            }
                            throw timeoutErr;
                        } finally {
                            clearTimeout(timeoutId);
                        }
                    }
                } catch (streamErr: any) {
                    if (this.abortSignal?.aborted) {
                        throw streamErr; // 외부 중단 시그널은 그대로 전파
                    }
                    consecutiveFailures++;
                    errors.push(`LLM 호출 실패: ${streamErr?.message || streamErr}`);
                    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                        errors.push('연속 실패 횟수 초과, 에이전트를 중단합니다');
                        break;
                    }
                    conversationParts.push({ text: this.buildRecoveryNudge(consecutiveFailures) });
                    continue;
                }

                tokenEstimate += estimateTokens(response);

                // 1.5a. max_tokens 감지 — 응답이 잘린 경우 다음 턴에 계속 요청
                const maxTokensReached = response.includes('[MAX_TOKENS_REACHED]');
                if (maxTokensReached) {
                    response = response.replace('[MAX_TOKENS_REACHED]', '').trim();
                    console.warn(`[SubAgentLoop:${this.subtask.id}] ⚠️ MAX_TOKENS detected — will inject continuation prompt`);
                }

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
                // 2. 도구 파싱 (<think> 블록 제거 후 파싱 — think 내부 JSON이 tool call로 실행되는 것 방지)
                const parseWarnings: string[] = [];
                const strippedForParse = response.replace(THINKING_TAG_REGEX, '').trim();
                const toolCalls = ToolParser.parseCodeBlockFormat(strippedForParse, parseWarnings);

                // lastResponse 업데이트: tool call이 없고 JSON만 있는 응답(approve 등)은 무시
                if (toolCalls.length > 0 || !this.isRawJsonOnly(response)) {
                    lastResponse = response;
                }

                // 2.5. __done__ 가상 도구 분리 — 다른 도구 실행 후 처리
                const doneCall = toolCalls.find(tc => tc.name === '__done__');
                const executableCalls = toolCalls.filter(tc => tc.name !== '__done__');

                // __done__만 단독 호출 (다른 도구 없음) → 즉시 완료
                if (executableCalls.length === 0 && doneCall) {
                    const status = doneCall.params.status || 'completed';
                    const summary = doneCall.params.summary || '';

                    // update_file 실패 기록이 있고 파일 쓰기 성공 없음 → __done__ 거부, 재시도 유도
                    // repair 에이전트는 already_done도 차단 (포기 탈출 방지)
                    const blockDone = failedUpdateFilePaths.length > 0 && !hasExecutedWriteTools
                        && (status !== 'already_done' || this.isRepairAgent);
                    if (blockDone) {
                        const paths = failedUpdateFilePaths.join(', ');
                        console.warn(`[SubAgentLoop:${this.subtask.id}] Standalone __done__ rejected: unresolved update_file failures for: ${paths}`);
                        conversationParts.push({
                            text: `[시스템] 이전에 update_file이 실패했으므로 __done__을 수락할 수 없습니다 (실패 파일: ${paths}).\n파일을 수정하지 않고 완료로 선언하는 것은 허용되지 않습니다.\nread_file로 해당 파일의 현재 내용을 다시 읽은 후, 정확한 SEARCH 블록으로 update_file을 재시도하세요.`,
                        });
                        continue;
                    }

                    console.log(`[SubAgentLoop:${this.subtask.id}] __done__ signal: status=${status}, summary=${summary.substring(0, 100)}`);
                    if (this.subtask.toolPermission === 'full' && !hasExecutedWriteTools && status !== 'already_done') {
                        warnings.push(`파일 수정 없이 완료됨 — 모델이 __done__(${status})으로 작업 완료를 선언했습니다.`);
                    }
                    lastResponse = summary || response;
                    completedNormally = true;
                    doneStatus = status as 'completed' | 'already_done';
                    break;
                }

                // 도구 없음 (+ __done__도 없음): 실제 완료인지 판단
                if (executableCalls.length === 0) {
                    // ⚡ 알 수 없는 도구 이름 → 재프롬프트 (루프 종료 방지)
                    const unknownToolWarnings = parseWarnings.filter(w => w.startsWith('알 수 없는 도구:'));
                    if (unknownToolWarnings.length > 0) {
                        const unknownNames = unknownToolWarnings.map(w => w.replace('알 수 없는 도구: ', '')).join(', ');
                        const availableTools = [
                            'read_file', 'update_file', 'create_file', 'remove_file',
                            'run_command', 'ripgrep_search', 'list_files', 'glob_search',
                            'expand_around_line', 'list_imports', 'stat_file', 'fetch_url', 'lsp',
                        ].join(', ');
                        console.warn(`[SubAgentLoop:${this.subtask.id}] Unknown tool names: ${unknownNames}. Re-prompting.`);
                        conversationParts.push({ text: response });
                        conversationParts.push({
                            text: `[시스템] 알 수 없는 도구를 호출했습니다: ${unknownNames}. 이 도구들은 존재하지 않습니다. 반드시 다음 도구 목록만 사용하세요: ${availableTools}. 도구 호출 형식: {"tool": "도구이름", ...파라미터}`,
                        });
                        continue;
                    }

                    const needsWrite = this.subtask.toolPermission === 'full';

                    // Fallback 1: write 도구 실행 완료 → 정상 완료
                    if (hasExecutedWriteTools) {
                        completedNormally = true;
                        break;
                    }

                    // Fallback 2: read-only 권한에서 읽기 도구 실행 완료 → 정상 완료
                    if (!needsWrite && hasExecutedTools) {
                        completedNormally = true;
                        break;
                    }

                    // Fail: 아무 도구도 실행 안 했고 __done__도 없음 → 실패
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
                const allowedCalls = this.filterByPermission(executableCalls);

                if (allowedCalls.length === 0) {
                    conversationParts.push({ text: response });
                    conversationParts.push({
                        text: '[시스템] 요청한 모든 도구가 권한 정책에 의해 차단되었습니다. 다른 방법을 시도하거나 도구 없이 응답하세요.'
                    });
                    continue;
                }

                // 3.5. 같은 턴 내 동일 도구+경로 중복 제거 (e.g. read_file 같은 파일 2번)
                // Pre-scan: read_file/create_file 경로 사전 수집 (순서와 무관하게 차단)
                const readFilesInTurn = new Set<string>();
                const createFilesInTurn = new Set<string>();
                for (const call of allowedCalls) {
                    if (call.name === 'read_file' && call.params.path) {
                        readFilesInTurn.add(call.params.path);
                    }
                    if (call.name === 'create_file' && call.params.path) {
                        createFilesInTurn.add(call.params.path);
                    }
                }

                const seenInTurn = new Set<string>();
                const skippedUpdateFiles: { path: string; reason: 'create' | 'read' }[] = [];
                const skippedReadFiles: string[] = [];
                const skippedStatFiles: string[] = [];
                const uniqueCalls = allowedCalls.filter(call => {
                    const key = `${call.name}:${call.params.path || call.params.command || ''}`;
                    if (seenInTurn.has(key)) {
                        console.log(`[SubAgentLoop:${this.subtask.id}] Same-turn duplicate removed: ${call.name} ${call.params.path || ''}`);
                        return false;
                    }
                    seenInTurn.add(key);

                    if (call.name === 'create_file' && call.params.path &&
                        (streamingCreatedPaths.has(call.params.path) || streamingHandledPaths.has(call.params.path))) {
                        // Fix 8: 스트리밍 중 이미 실행/pending 처리된 create_file — 재실행 방지
                        console.log(`[SubAgentLoop:${this.subtask.id}] Skipping streaming-pre-executed create_file: ${call.params.path}`);
                        return false;
                    }

                    if (call.name === 'read_file' && call.params.path) {
                        // 이미 이전 턴에서 읽은 파일 스킵 (할루시네이션 반복 방지)
                        // repair 에이전트는 비활성화 — 수정 후 현재 상태를 다시 읽어야 할 수 있음
                        if (!this.disableReadDedup && alreadyReadFiles.has(call.params.path)) {
                            console.log(`[SubAgentLoop:${this.subtask.id}] Cross-turn duplicate read skipped: ${call.params.path}`);
                            skippedReadFiles.push(call.params.path);
                            return false;
                        }
                    }

                    if (call.name === 'stat_file' && call.params.path) {
                        // 이미 이전 턴에서 stat한 파일 스킵 (중복 조회 방지)
                        if (alreadyStattedFiles.has(call.params.path)) {
                            console.log(`[SubAgentLoop:${this.subtask.id}] Cross-turn duplicate stat skipped: ${call.params.path}`);
                            skippedStatFiles.push(call.params.path);
                            return false;
                        }
                    }

                    if (call.name === 'update_file' && call.params.path) {
                        // create_file 직후 같은 턴 update_file → 스킵 (다음 턴은 허용)
                        if (createFilesInTurn.has(call.params.path)) {
                            console.log(`[SubAgentLoop:${this.subtask.id}] Skipped update_file after create_file in same turn: ${call.params.path}`);
                            skippedUpdateFiles.push({ path: call.params.path, reason: 'create' });
                            return false;
                        }
                        // read_file + update_file 동턴: 보호 파일만 차단
                        // (일반 파일은 LLM이 context에서 이미 내용을 알고 있으므로 허용)
                    }

                    return true;
                });

                // 4. 사용자 승인 필터링 (onToolApprovalRequired 콜백 제공 시)
                const rejectedCalls: ToolUse[] = [];
                let callsToExecute = uniqueCalls;
                if (this.callbacks?.onToolApprovalRequired && uniqueCalls.length > 0) {
                    callsToExecute = [];
                    for (const call of uniqueCalls) {
                        const approvalStart = Date.now();
                        const approved = await this.callbacks.onToolApprovalRequired(call);
                        pausedDuration += Date.now() - approvalStart;
                        if (approved) {
                            callsToExecute.push(call);
                        } else {
                            rejectedCalls.push(call);
                        }
                    }
                }

                // 5. 도구 실행 (UI 콜백 연결)
                const results = callsToExecute.length > 0
                    ? await this.toolExecutor.executeTools(
                        callsToExecute,
                        this.toolContext,
                        this.callbacks?.onToolComplete,
                        this.callbacks?.onToolStart,
                        this.abortSignal,
                    )
                    : [];

                // 거부된 도구 synthetic 피드백 (LLM 컨텍스트에 포함)
                for (const call of rejectedCalls) {
                    uniqueCalls.push(call);
                    results.push({
                        success: false,
                        message: `[거부됨] 사용자가 ${call.name}(${call.params.path || call.params.command || ''}) 실행을 거부했습니다.`,
                    });
                }

                // 5.1. 성공한 read_file은 alreadyReadFiles에 기록 (턴 간 중복 방지)
                for (const call of callsToExecute) {
                    if (call.name === 'read_file' && call.params.path) {
                        alreadyReadFiles.add(call.params.path);
                    }
                }
                // 5.2. 성공한 stat_file은 alreadyStattedFiles에 기록 (턴 간 중복 방지)
                for (const call of callsToExecute) {
                    if (call.name === 'stat_file' && call.params.path) {
                        alreadyStattedFiles.add(call.params.path);
                    }
                }

                // 4.4. Fix 8: 스트리밍 중 실행된 create_file에 대한 synthetic 피드백 추가
                for (const path of streamingCreatedPaths) {
                    if (allowedCalls.some(c => c.name === 'create_file' && c.params.path === path)) {
                        uniqueCalls.push({ name: 'create_file', params: { path } } as ToolUse);
                        results.push({ success: true, message: `[스트리밍 중 생성됨] ${path} 파일이 스트리밍 중 즉시 생성되었습니다.` });
                    }
                }

                // 4.5a. 크로스턴 중복 read_file 스킵에 대한 synthetic 피드백 추가 (캐시된 내용 포함)
                for (const skippedPath of skippedReadFiles) {
                    uniqueCalls.push({ name: 'read_file', params: { path: skippedPath } } as ToolUse);
                    // 캐시된 파일 내용을 포함하여 LLM이 다음 단계로 진행 가능하도록
                    let cachedContent = '';
                    try {
                        const absPath = path.resolve(this.toolContext.workspaceRoot || this.toolContext.projectRoot, skippedPath);
                        cachedContent = await fs.readFile(absPath, 'utf-8');
                    } catch { /* ignore */ }
                    const contentPreview = cachedContent
                        ? `\n\n현재 파일 내용:\n\`\`\`\n${cachedContent.substring(0, 5000)}${cachedContent.length > 5000 ? '\n... (생략)' : ''}\n\`\`\``
                        : '';
                    results.push({
                        success: true,
                        message: `[이미 읽음] ${skippedPath}는 이전 턴에서 이미 읽었습니다. 아래 내용을 사용하세요. 다시 read_file을 호출하지 마세요.${contentPreview}`,
                    });
                }

                // 4.5b. 크로스턴 중복 stat_file 스킵에 대한 synthetic 피드백 추가
                for (const path of skippedStatFiles) {
                    uniqueCalls.push({ name: 'stat_file', params: { path } } as ToolUse);
                    results.push({
                        success: true,
                        message: `[이미 조회됨] ${path}는 이전 턴에서 이미 stat_file로 조회했습니다. 이전 결과를 그대로 사용하세요. 다시 stat_file을 호출하지 마세요.`,
                    });
                }

                // 4.5. skip된 update_file에 대한 synthetic 피드백 추가
                for (const skipped of skippedUpdateFiles) {
                    uniqueCalls.push({
                        name: 'update_file',
                        params: { path: skipped.path }
                    } as ToolUse);
                    if (skipped.reason === 'create') {
                        results.push({
                            success: true,
                            message: `[스킵됨] ${skipped.path}는 이번 세션에서 create_file로 생성된 파일입니다. update_file이 자동 생략되었습니다. 파일 내용을 수정하려면 read_file로 현재 내용을 먼저 확인한 후 update_file을 사용하세요.`,
                        });
                    } else {
                        results.push({
                            success: true,
                            message: `[스킵됨] read_file(${skipped.path})과 update_file(${skipped.path})을 같은 턴에 실행할 수 없습니다. update_file은 자동 생략됩니다. 다음 턴에서 방금 read_file로 읽은 파일의 실제 내용을 기반으로 SEARCH 블록을 재생성하여 update_file만 실행하세요.`,
                        });
                    }
                }

                // 도구가 실행됐으므로 실패 카운터 리셋
                consecutiveFailures = 0;

                // 도구 성공 플래그 설정
                let hasWriteToolInThisTurn = false;
                for (let i = 0; i < uniqueCalls.length; i++) {
                    const callResult = results[i];
                    const callItem = uniqueCalls[i];
                    if (callResult?.success) {
                        hasExecutedTools = true;
                        if (!READ_ONLY_TOOLS.has(callItem.name)) {
                            hasExecutedWriteTools = true;
                            hasWriteToolInThisTurn = true;
                            // update_file 성공 시 실패 추적 목록에서 제거
                            if (callItem.name === 'update_file' && callItem.params.path) {
                                failedUpdateFilePaths = failedUpdateFilePaths.filter(p => p !== callItem.params.path);
                            }
                        }
                        // create_file 경로는 createFilesInTurn에서 같은 턴 내에서만 추적
                    } else if (!callResult?.success && callItem.name === 'update_file' && callItem.params.path) {
                        // update_file 실패 추적
                        if (!failedUpdateFilePaths.includes(callItem.params.path)) {
                            failedUpdateFilePaths.push(callItem.params.path);
                        }
                        console.warn(`[SubAgentLoop:${this.subtask.id}] update_file FAILED for: ${callItem.params.path}`);
                    }
                }

                // 경량 상태 관리: full 권한인데 read-only 도구만 연속 사용 시 write 유도
                if (this.subtask.toolPermission === 'full') {
                    if (hasWriteToolInThisTurn) {
                        consecutiveReadOnlyTurns = 0;
                    } else if (hasExecutedTools) {
                        consecutiveReadOnlyTurns++;
                        if (consecutiveReadOnlyTurns >= MAX_READONLY_CONSECUTIVE_TURNS) {
                            console.log(`[SubAgentLoop:${this.subtask.id}] ${consecutiveReadOnlyTurns} consecutive read-only turns — nudging write phase`);
                            conversationParts.push({ text: response });
                            const toolResultsText = this.formatToolResults(uniqueCalls, results);
                            conversationParts.push({ text: toolResultsText });
                            conversationParts.push({
                                text: `[시스템] 조사 단계가 충분합니다 (${consecutiveReadOnlyTurns}턴 연속 읽기 전용). 지금 바로 create_file 또는 update_file을 사용하여 파일을 생성/수정하세요. 추가 파일 읽기 없이 코드를 작성하세요.`
                            });
                            consecutiveReadOnlyTurns = 0; // 리셋 후 1회 기회
                            continue;
                        }
                    }
                }

                // 5. 파일 변경 추적 (ToolResponse.filePath 기반 — 도구 이름 하드코딩 없음)
                for (let i = 0; i < uniqueCalls.length; i++) {
                    const call = uniqueCalls[i];
                    const result = results[i];
                    if (result?.success && result.filePath) {
                        // remove_file: fileContent 없이 filePath만 반환
                        if (call.name === 'remove_file') {
                            if (!deletedFiles.includes(result.filePath)) {
                                deletedFiles.push(result.filePath);
                            }
                        } else if (result.fileContent !== undefined) {
                            if (READ_ONLY_TOOLS.has(call.name)) { continue; }
                            const alreadyTracked = createdFiles.includes(result.filePath) || modifiedFiles.includes(result.filePath);
                            if (!alreadyTracked) {
                                createdFiles.push(result.filePath);
                            } else if (!modifiedFiles.includes(result.filePath)) {
                                modifiedFiles.push(result.filePath);
                            }
                        }
                    }
                }

                // 5.5. 🔥 v1.0.24: write 도구 실행 후 즉시 LSP diagnostics 검사
                // SubAgentLoop도 ConversationManager와 동일하게 에러를 즉시 피드백
                if (hasWriteToolInThisTurn && (createdFiles.length > 0 || modifiedFiles.length > 0)) {
                    try {
                        const { TestRunner } = await import('../managers/conversation/handlers/TestRunner');
                        const workspaceRoot = this.toolContext.workspaceRoot || this.toolContext.projectRoot || '';
                        // LSP가 변경사항을 처리할 시간을 약간 대기
                        await new Promise(resolve => setTimeout(resolve, 800));
                        const diagnosticErrors = await TestRunner.checkDiagnostics(
                            createdFiles,
                            modifiedFiles,
                            workspaceRoot,
                        );
                        if (diagnosticErrors.length > 0) {
                            const errorLines = diagnosticErrors.slice(0, 10).map(
                                (e) => `  - ${e.file}:${e.line} [${e.source}/${e.code}] ${e.message}`
                            );
                            const diagMsg = `[System] ⚠️ LSP Diagnostics: ${diagnosticErrors.length}개 에러 감지\n${errorLines.join('\n')}${diagnosticErrors.length > 10 ? `\n  ... 외 ${diagnosticErrors.length - 10}개` : ''}\n\n위 에러를 수정해주세요. 현재 파일 내용을 read_file로 확인한 후 update_file로 수정하세요.`;
                            conversationParts.push({ text: diagMsg });
                            console.log(`[SubAgentLoop:${this.subtask.id}] Inline diagnostics: ${diagnosticErrors.length} errors detected`);
                        }
                    } catch (e) {
                        console.warn(`[SubAgentLoop:${this.subtask.id}] Inline diagnostics check failed:`, e);
                    }
                }

                // 6. 도구 결과를 다음 턴 컨텍스트에 추가
                const toolResultsText = this.formatToolResults(uniqueCalls, results);
                conversationParts.push({ text: response });
                conversationParts.push({ text: toolResultsText });

                // 6.1. update_file 실패 시 현재 파일 내용 자동 주입 — SEARCH 재생성 지원
                const updateFailedPaths = uniqueCalls
                    .map((call, i) => ({ call, result: results[i] }))
                    .filter(({ call, result }) => call.name === 'update_file' && !result?.success)
                    .map(({ call }) => call.params.path as string)
                    .filter(Boolean);
                if (updateFailedPaths.length > 0) {
                    const wsRoot = this.toolContext.workspaceRoot || this.toolContext.projectRoot || '';
                    const contentParts: string[] = [];
                    for (const filePath of updateFailedPaths) {
                        try {
                            const absPath = path.isAbsolute(filePath)
                                ? filePath
                                : path.join(wsRoot, filePath);
                            const content = await fs.readFile(absPath, 'utf-8');
                            contentParts.push(`--- ${filePath} (현재 실제 파일 내용) ---\n${content}\n---`);
                        } catch { /* 읽기 실패 무시 */ }
                    }
                    if (contentParts.length > 0) {
                        conversationParts.push({
                            text: `[시스템] update_file SEARCH 패턴이 파일의 실제 내용과 일치하지 않습니다.\n아래 현재 파일 내용을 확인하고, 실제 존재하는 텍스트로 SEARCH 블록을 재생성하여 update_file을 다시 시도하세요.\n⚠️ 파일 내용이 이미 아래에 제공되었으므로 read_file을 다시 호출하지 마세요. 바로 update_file을 사용하세요:\n\n${contentParts.join('\n\n')}`,
                        });
                        console.log(`[SubAgentLoop:${this.subtask.id}] Auto-injected current content for ${updateFailedPaths.length} failed update_file(s)`);
                    }
                }
                if (maxTokensReached) {
                    conversationParts.push({ text: '[시스템] 이전 응답이 max_tokens로 인해 중간에 잘렸습니다. 잘린 도구 호출이나 파일 내용이 있다면 처음부터 다시 완전하게 출력하세요. 작업을 계속 진행하세요.' });
                }

                // 7. __done__ 처리 (도구 실행 후 — 같은 턴의 다른 도구가 먼저 실행됨)
                if (doneCall) {
                    const status = doneCall.params.status || 'completed';
                    const summary = doneCall.params.summary || '';

                    // 같은 턴 update_file 실패 OR 누적 미해결 실패가 있으면 __done__ 거부
                    // repair 에이전트는 already_done도 차단 (이미 standalone __done__에서 처리하지만 post-tool도 동일하게)
                    if (status !== 'already_done' || this.isRepairAgent) {
                        const currentTurnUpdateFailures = uniqueCalls
                            .map((call, i) => ({ call, result: results[i] }))
                            .filter(({ call, result }) => call.name === 'update_file' && !result?.success);
                        // 이전 턴에서 실패했고 아직 write 성공이 없는 경우도 거부
                        const hasAccumulatedFailures = failedUpdateFilePaths.length > 0 && !hasExecutedWriteTools;
                        if (currentTurnUpdateFailures.length > 0 || hasAccumulatedFailures) {
                            const failedPaths = currentTurnUpdateFailures.length > 0
                                ? currentTurnUpdateFailures.map(({ call }) => call.params.path || '?').join(', ')
                                : failedUpdateFilePaths.join(', ');
                            console.warn(`[SubAgentLoop:${this.subtask.id}] __done__ rejected: unresolved update_file failures for: ${failedPaths}`);
                            conversationParts.push({
                                text: `[시스템] update_file이 실패했으므로 __done__을 수락할 수 없습니다 (실패 파일: ${failedPaths}).\n파일 내용은 이미 위에 제공되었습니다. read_file을 다시 호출하지 말고, 제공된 파일 내용을 기반으로 바로 update_file을 사용하여 정확한 SEARCH 블록으로 수정을 완료하세요.`,
                            });
                            continue;
                        }
                    }

                    console.log(`[SubAgentLoop:${this.subtask.id}] __done__ signal: status=${status}, summary=${summary.substring(0, 100)}`);
                    if (this.subtask.toolPermission === 'full' && !hasExecutedWriteTools && status !== 'already_done') {
                        warnings.push(`파일 수정 없이 완료됨 — 모델이 __done__(${status})으로 작업 완료를 선언했습니다.`);
                    }
                    lastResponse = summary || response;
                    completedNormally = true;
                    doneStatus = status as 'completed' | 'already_done';
                    break;
                }

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

        // 파일 작성을 했으면 성공으로 처리 (검증은 TestRunner 담당)
        // 정상 종료가 아닌 경우(MAX_TURNS 도달, 검증 커맨드 실패 등)는 warnings로 기록
        const hasWrittenFiles = hasExecutedWriteTools;
        const effectiveSuccess = completedNormally || hasWrittenFiles;

        if (!completedNormally && hasWrittenFiles) {
            warnings.push(`에이전트가 정상 종료되지 않았으나 파일 작성은 완료됨 (${createdFiles.length}개 생성, ${modifiedFiles.length}개 수정). 시스템 검증으로 대체합니다.`);
            // 기존 errors 중 자체 검증 관련은 warnings로 이동
            const verificationErrors = errors.filter(e =>
                e.includes('타임아웃') || e.includes('중단') || e.includes('초과')
            );
            for (const ve of verificationErrors) {
                warnings.push(ve);
                errors.splice(errors.indexOf(ve), 1);
            }
        }

        const dedupCreated = [...new Set(createdFiles)];
        const dedupModified = [...new Set(modifiedFiles)];
        const dedupDeleted = [...new Set(deletedFiles)];

        // completionSummary: 모든 완료 경로에서 통일된 구조화 요약
        const completionSummary = [
            doneStatus ? `상태: ${doneStatus}` : '상태: fallback 완료',
            dedupCreated.length > 0 ? `생성: ${dedupCreated.join(', ')}` : null,
            dedupModified.length > 0 ? `수정: ${dedupModified.join(', ')}` : null,
            dedupDeleted.length > 0 ? `삭제: ${dedupDeleted.join(', ')}` : null,
            warnings.length > 0 ? `경고: ${warnings.join('; ')}` : null,
            errors.length > 0 ? `오류: ${errors.join('; ')}` : null,
            lastResponse ? `요약: ${SubAgentLoop.extractHeadTail(lastResponse.replace(THINKING_TAG_REGEX, '').trim(), 800, 400)}` : null,
        ].filter(Boolean).join('\n');

        return {
            subtaskId: this.subtask.id,
            success: effectiveSuccess,
            response: lastResponse,
            createdFiles: dedupCreated,
            modifiedFiles: dedupModified,
            deletedFiles: dedupDeleted,
            errors,
            warnings,
            doneStatus,
            completionSummary,
            turnCount,
            tokenEstimate,
            executionTime: Date.now() - startTime,
        };
    }

    private buildSystemPrompt(nativeMode?: boolean): string {
        // 권한에 따라 허용할 도구 필터링
        const allowedTools = this.getAllowedTools();
        const toolSpecs = ToolSpecBuilder.buildToolSpecs(allowedTools);
        const toolSection = buildToolPromptSection(toolSpecs, nativeMode);

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
- 작업이 완료되면 __done__ 도구를 호출하세요
- 이미 구현되어 있어 추가 작업이 불필요한 경우에도 확인 후 __done__ 도구를 호출하세요
- 할당된 범위 밖의 작업은 시도하지 마세요
- 파일 구조가 제공된 경우 list_files 없이 바로 작업을 시작하세요
- 파일/코드를 찾을 때는 list_files 대신 glob_search(파일명) 또는 ripgrep_search(내용)를 사용하세요. list_files는 특정 디렉토리 구조를 확인할 때만 사용하세요
- node_modules, .git, __pycache__, env, .venv, dist, build 디렉토리는 탐색하지 마세요
- 컨텍스트에 "참고 문서 (RAG)" 섹션이 있으면 이를 우선 활용하세요. 이미 확보된 내용을 다시 검색하지 마세요. 부족한 정보만 추가로 탐색하세요
- 모든 응답은 한국어로 작성하세요
- 다른 에이전트가 생성할 파일에 의존하지 마세요. read_file 실패 시 해당 파일을 직접 create_file로 작성하세요
- 같은 도구를 동일한 파라미터로 반복 호출하지 마세요. 이미 성공한 도구 호출은 다시 실행할 필요가 없습니다
- update_file의 SEARCH 블록에는 반드시 파일의 실제 코드를 그대로 작성하세요. "... (생략됨)", "// ...", "..." 등 생략 표현은 절대 사용 금지입니다. 생략 표현이 포함된 SEARCH 블록은 즉시 오류로 처리됩니다
- __done__ summary에는 조사한 구체적 수치(파일 경로, 크기, 줄 번호 등)를 반드시 포함하세요. 집계 태스크가 이 데이터를 활용합니다.
${this.subtask.dependencies.length > 0 ? '- 이 작업은 선행 태스크의 결과를 집계합니다. 선행 태스크 요약에 이미 포함된 정보(파일 크기, 경로, 줄 번호, 심볼 목록 등)를 도구로 재조회하지 마세요. 요약에 있는 데이터를 그대로 사용하여 분석하세요.' : ''}

- 프로젝트 초기화 시 create-vite, create-react-app, create-next-app 등 스캐폴딩 도구를 사용하지 마세요. package.json, tsconfig.json 등 설정 파일과 소스 코드를 create_file로 직접 생성하고, npm install로 의존성을 설치하세요

${toolSection}

${nativeMode ? `## 도구 호출 예시 (API Function Call 형식)

- 파일 읽기: read_file 함수 호출 (path 파라미터)
- 파일 생성: create_file 함수 호출 (path, content 파라미터) — content에 파일 전체 내용 직접 전달
- 파일 수정: update_file 함수 호출 (path, diff 파라미터) — SEARCH/REPLACE 블록
- 파일 목록: list_files 함수 호출 (path, recursive 파라미터) — 특정 디렉토리 구조 확인 시만 사용
- 파일 검색: glob_search 함수 호출 (pattern 파라미터) — 파일명/확장자로 찾을 때 사용
- 코드 검색: ripgrep_search 함수 호출 (query, path 파라미터) — 내용/키워드로 찾을 때 사용
- 작업 완료: __done__ 함수 호출 (status="completed", summary 파라미터)
- 이미 완료: __done__ 함수 호출 (status="already_done", summary 파라미터)

**중요: API function call로만 도구를 호출하세요. 텍스트에 { "tool": ... } JSON을 출력하지 마세요. 작업이 끝나면 반드시 __done__을 호출하세요.**` : `## 도구 호출 예시 (반드시 이 형식을 따르세요)

파일 읽기:
{ "tool": "read_file", "path": "src/App.tsx" }

파일 생성:
{ "tool": "create_file", "path": "src/components/MyComponent.tsx" }
<file_content>
const MyComponent = () => <div>Hello</div>;
export default MyComponent;
</file_content>

파일 수정 (SEARCH/REPLACE):
{ "tool": "update_file", "path": "src/App.tsx" }
<file_changes>
<<<< SEARCH
const App = () => <div>Hello</div>;
====
import MyComponent from './components/MyComponent';
const App = () => <div><MyComponent /></div>;
>>>> REPLACE
</file_changes>

파일명으로 검색:
{ "tool": "glob_search", "pattern": "src/**/*.ts" }

코드 내용 검색:
{ "tool": "ripgrep_search", "query": "function handleLogin", "path": "src" }

파일 목록 (특정 디렉토리 구조 확인 시만):
{ "tool": "list_files", "path": "src", "recursive": "true" }

작업 완료 선언:
{ "tool": "__done__", "status": "completed", "summary": "수행한 내용 요약" }

이미 구현되어 추가 작업 불필요:
{ "tool": "__done__", "status": "already_done", "summary": "확인 결과 요약" }

**중요: 도구를 사용하려면 위 JSON 형식을 response에 직접 출력하세요. 설명 텍스트 없이 JSON만 출력하세요. thinking에 도구 호출을 넣지 마세요. 작업이 끝나면 반드시 __done__ 도구를 호출하세요.**`}`;
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
    /**
     * 응답이 tool call 없이 raw JSON만 포함하는지 판별 (approve/reject 등 LLM이 자체 생성한 JSON)
     */
    private isRawJsonOnly(response: string): boolean {
        const trimmed = response.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        // 짧은 텍스트 + JSON 객체로만 구성된 경우
        if (trimmed.length > 2000) { return false; }
        // "We need to approve." 같은 서두 제거 후 JSON만 남는지 확인
        const withoutPreamble = trimmed.replace(/^[^{]*/, '').trim();
        if (!withoutPreamble.startsWith('{')) { return false; }
        try {
            // 연속 JSON 객체들 ({"filePath":...}{"filePath":...}) 도 포함
            const jsonPattern = /\{[^{}]*\}/g;
            const matches = withoutPreamble.match(jsonPattern);
            if (!matches || matches.length === 0) { return false; }
            return matches.every(m => {
                try {
                    const obj = JSON.parse(m);
                    // filePath+action 또는 유사한 비-tool 패턴
                    return obj.action || obj.approve || obj.status;
                } catch { return false; }
            });
        } catch { return false; }
    }

    /**
     * 스트리밍 버퍼에서 마지막 툴콜 패턴을 감지하여 상태 메시지 반환
     * 실제 tool call JSON만 감지 (텍스트 내 파일 참조는 무시)
     */
    /**
     * 텍스트의 앞 head자 + 뒤 tail자를 추출 (중간 생략)
     * 전체 길이가 head+tail 이하면 그대로 반환
     */
    private static extractHeadTail(text: string, head: number, tail: number): string {
        if (text.length <= head + tail) { return text; }
        return text.substring(0, head) + '\n...(중략)...\n' + text.substring(text.length - tail);
    }

    private parseStreamingToolStatus(content: string): string | null {
        const toolLabels: Record<string, string> = {
            create_file: '파일 생성 중',
            update_file: '파일 수정 중',
            read_file: '파일 읽는 중',
            delete_file: '파일 삭제 중',
            run_command: '명령 준비 중',
            glob_search: '파일 검색 중',
            list_files: '파일 목록 중',
        };

        // 호출 측에서 새로 추가된 부분만 전달하므로 전체/tail 스캔 불필요
        // 줄의 시작이 { 인 경우만 감지 (텍스트 내 인라인 참조 제외)
        let lastMatch: { tool: string; file: string } | null = null;
        const jsonPattern = /^\s*\{\s*"tool"\s*:\s*"(\w+)"[^}]*"(?:path|filePath)"\s*:\s*"([^"]+)"/gm;
        let m: RegExpExecArray | null;
        while ((m = jsonPattern.exec(content)) !== null) {
            lastMatch = { tool: m[1], file: m[2] };
        }

        if (lastMatch && toolLabels[lastMatch.tool]) {
            const fileName = lastMatch.file.split('/').pop() || lastMatch.file;
            return `${toolLabels[lastMatch.tool]}: ${fileName}...`;
        }

        // run_command: "command" 키로 감지
        const cmdPattern = /^\s*\{\s*"tool"\s*:\s*"run_command"[^}]*"command"\s*:\s*"([^"]+)"/gm;
        let cmdMatch: RegExpExecArray | null;
        while ((cmdMatch = cmdPattern.exec(content)) !== null) {
            lastMatch = { tool: 'run_command', file: cmdMatch[1] };
        }
        if (lastMatch && lastMatch.tool === 'run_command') {
            const cmd = lastMatch.file.length > 30 ? lastMatch.file.substring(0, 30) + '...' : lastMatch.file;
            return `명령 준비 중: ${cmd}`;
        }

        return null;
    }

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


}
