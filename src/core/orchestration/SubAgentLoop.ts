/**
 * SubAgentLoop
 * Lightweight agent loop — extracts only the core loop from ConversationManager
 *
 * Design principles:
 * - Shares LLMManager.getInstance() (safe since it only makes HTTP calls)
 * - Independent ToolExecutor instance (per agent)
 * - NO FSM, NO session management, NO user approval
 * - Streaming mode support (no timeout when useStreaming=true, streams continuously)
 * - Simple while loop: LLM call -> tool parsing -> tool execution -> accumulate results
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
const MAX_REPAIR_TURNS = 10; // repair agent는 에러 수정만 하므로 짧게
const MAX_CONSECUTIVE_FAILURES = 3;
const MAX_READONLY_CONSECUTIVE_TURNS = 4; // If only read-only tools are used for N consecutive turns, nudge write
const MAX_SAME_FILE_UPDATE_FAILURES = 3; // 같은 파일 연속 N회 실패 시 __done__ 허용

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
    private isAgentMode: boolean;
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
        agentOptions?: { disableReadDedup?: boolean; isRepairAgent?: boolean; isAgentMode?: boolean },
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
        this.isAgentMode = agentOptions?.isAgentMode ?? false;
        this.stateManager = stateManager;
        this.llmManager = LLMManager.getInstance();
        this.toolExecutor = new ToolExecutor();
    }

    async run(): Promise<AgentLoopResult> {
        const startTime = Date.now();
        let pausedDuration = 0; // User approval wait time (excluded from timeout)
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
        // Track update_file failures — force retry before accepting __done__
        let failedUpdateFilePaths: string[] = [];
        // v1.0.25: Removed createdFilesInSession — allow update_file for diagnostics error fixes
        // Conversation context for this agent
        const conversationParts: LLMMessagePart[] = [
            { text: `Task: ${this.subtask.title}\n\n${this.subtask.description}` }
        ];

        // Prevent duplicate read_file across turns: track already-read paths
        const alreadyReadFiles = new Set<string>();
        // Prevent duplicate stat_file across turns: track already-statted paths
        const alreadyStattedFiles = new Set<string>();

        // Native tool calling configuration (computed once before loop)
        const adminConfig = this.llmManager.getAdminModelConfig();
        const isNativeAdmin = this.llmManager.getCurrentModel() === AiModelType.ADMIN
            && (adminConfig?.nativeToolCallingSupported === true || String(adminConfig?.nativeToolCallingSupported) === 'true');

        const systemPrompt = this.buildSystemPrompt(isNativeAdmin);

        // Streaming immediate file creation setting (read once before loop)
        const isAutoToolEnabled = await SettingsManager.getInstance().isAutoToolExecutionEnabled();
        const isAutoUpdateEnabled = await SettingsManager.getInstance().isAutoUpdateEnabled();
        const allowedTools = this.getAllowedTools();
        const nativeTools = isNativeAdmin ? ToolSpecBuilder.buildOpenAIToolsConfig(allowedTools, true) : undefined;
        // thinkingEnabled=false -> always disabled; true -> depends on native admin
        const disableThinking = !this.thinkingEnabled ? true : !isNativeAdmin;

        const effectiveMaxTurns = this.isRepairAgent ? MAX_REPAIR_TURNS : MAX_TURNS;
        while (turnCount < effectiveMaxTurns) {
            if (this.abortSignal?.aborted) {
                errors.push('Aborted by user');
                break;
            }

            // Sub-agent conversation compaction: shrink old tool results when context grows large
            if (turnCount > 0 && conversationParts.length > 10) {
                const totalChars = conversationParts.reduce((sum, p) => sum + (p.text?.length || 0), 0);
                if (totalChars > 30000) {
                    // Keep first (task description) and last 4, summarize middle tool results
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
                        const summary = `[Previous turns summary] ${middle.length} messages compacted. Files worked on: ${[...middleFiles].join(', ') || '(no tool calls)'}`;
                        conversationParts.splice(keepFirst, middle.length, { text: summary });
                        console.log(`[SubAgentLoop:${this.subtask.id}] Context compacted: ${middle.length} messages → 1 summary (${totalChars} → ${conversationParts.reduce((s, p) => s + (p.text?.length || 0), 0)} chars)`);
                    }
                }
            }

            // Total loop timeout check (excluding user approval wait time)
            if (Date.now() - startTime - pausedDuration > AgentConfig.SUB_AGENT_TOTAL_TIMEOUT) {
                errors.push(`Total execution time exceeded (${AgentConfig.SUB_AGENT_TOTAL_TIMEOUT / 1000}s)`);
                break;
            }

            turnCount++;

            try {
                // 1. LLM call
                let response: string;
                // Fix 8: Track create_file executed immediately during streaming
                let streamingCreatedPaths = new Set<string>();
                let streamingHandledPaths = new Set<string>(); // pending handled (regardless of approval)
                try {
                    if (this.useStreaming) {
                        // Streaming mode: no per-call timeout needed (data keeps flowing), only total timeout applies
                        let streamBuffer = '';
                        let lastReportedTool = '';
                        let lastScanPos = 0;
                        const FILE_END_MARKER = '</file_content>';
                        let streamLastFileContentPos = 0;
                        let streamingCreatePromise: Promise<void> = Promise.resolve();

                        // Common execution function for streaming immediate file creation
                        // needsApproval=true: request approval via onToolApprovalRequired callback before execution
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

                        // Callback when native tool_call completes
                        // ON+ON: execute immediately / ON+fileOFF or toolOFF: immediate pending
                        const onNativeToolComplete = (toolName: string, args: Record<string, any>) => {
                            if (toolName !== 'create_file' || !args.path) { return; }
                            // Block create_file during streaming in read-only permission
                            if (this.subtask.toolPermission !== 'full') { return; }
                            const p = args.path as string;
                            if (streamingCreatedPaths.has(p) || streamingHandledPaths.has(p)) { return; }
                            const capturedCall: ToolUse = { name: toolName, params: { ...args } };
                            const needsApproval = !isAutoToolEnabled || !isAutoUpdateEnabled;
                            executeStreamingCreate(p, capturedCall, needsApproval);
                        };

                        const onChunk = (chunk: string) => {
                            streamBuffer += chunk;

                            // In read-only permission, completely block create_file during streaming
                            if (this.subtask.toolPermission !== 'full') {
                                // Only update streaming position (no execution)
                                let endIdx = streamBuffer.indexOf(FILE_END_MARKER, streamLastFileContentPos);
                                while (endIdx !== -1) {
                                    streamLastFileContentPos = endIdx + FILE_END_MARKER.length;
                                    endIdx = streamBuffer.indexOf(FILE_END_MARKER, streamLastFileContentPos);
                                }
                            } else if (isAutoToolEnabled && isAutoUpdateEnabled) {
                                // ON+ON: execute immediately upon </file_content> detection
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
                                // toolOFF or fileOFF: immediate pending upon </file_content> detection
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

                            // Scan only newly added portion (prevent re-detecting previous matches)
                            const newContent = streamBuffer.substring(lastScanPos);
                            const toolStatus = this.parseStreamingToolStatus(newContent);
                            if (toolStatus && toolStatus !== lastReportedTool) {
                                lastReportedTool = toolStatus;
                                lastScanPos = streamBuffer.length;
                                this.callbacks.onStreamingStatus(toolStatus);
                                return;
                            }

                            // When no tool detected, show token count (update every 500 chars)
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
                        // Wait for all create_file operations started during streaming to complete
                        await streamingCreatePromise;
                    } else {
                        // Non-streaming mode: per-call timeout applies
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
                                errors.push(`LLM call timeout (${AgentConfig.SUB_AGENT_LLM_CALL_TIMEOUT / 1000}s)`);
                                if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                                    errors.push('Consecutive failure limit exceeded, aborting agent');
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
                        throw streamErr; // Propagate external abort signal as-is
                    }
                    consecutiveFailures++;
                    errors.push(`LLM call failed: ${streamErr?.message || streamErr}`);
                    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                        errors.push('Consecutive failure limit exceeded, aborting agent');
                        break;
                    }
                    conversationParts.push({ text: this.buildRecoveryNudge(consecutiveFailures) });
                    continue;
                }

                tokenEstimate += estimateTokens(response);

                // 1.5a. Detect max_tokens — if response was truncated, request continuation on next turn
                const maxTokensReached = response.includes('[MAX_TOKENS_REACHED]');
                if (maxTokensReached) {
                    response = response.replace('[MAX_TOKENS_REACHED]', '').trim();
                    console.warn(`[SubAgentLoop:${this.subtask.id}] MAX_TOKENS detected — will inject continuation prompt`);
                }

                // 1.5. Send thinking content to UI + detect empty responses
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
                        errors.push('The LLM only repeated thinking without producing any tool calls or text responses. The model may not have understood the task instructions.');
                        break;
                    }
                    // Preserve thinking content in context -> can be utilized in next turn
                    conversationParts.push({ text: response });
                    conversationParts.push({
                        text: this.buildRecoveryNudge(consecutiveFailures)
                    });
                    continue;
                }
                // 2. Tool parsing (parse after removing <think> blocks -- prevent JSON inside think from being executed as tool calls)
                const parseWarnings: string[] = [];
                const strippedForParse = response.replace(THINKING_TAG_REGEX, '').trim();
                const toolCalls = ToolParser.parseCodeBlockFormat(strippedForParse, parseWarnings);

                // Update lastResponse: ignore responses that contain only raw JSON without tool calls (approve, etc.)
                if (toolCalls.length > 0 || !this.isRawJsonOnly(response)) {
                    lastResponse = response;
                }

                // 2.5. Separate __done__ virtual tool — process after other tools execute
                const doneCall = toolCalls.find(tc => tc.name === '__done__');
                const executableCalls = toolCalls.filter(tc => tc.name !== '__done__');

                // __done__ called alone (no other tools) -> complete immediately
                if (executableCalls.length === 0 && doneCall) {
                    const status = doneCall.params.status || 'completed';
                    const summary = doneCall.params.summary || '';

                    // If there are update_file failure records and no successful file writes -> reject __done__, nudge retry
                    // Repair agent also blocks already_done (prevent escape by giving up)
                    // BUT: if same files failed MAX_SAME_FILE_UPDATE_FAILURES times, allow __done__ to prevent infinite loop
                    const hasExhaustedRetries = failedUpdateFilePaths.length > 0 && failedUpdateFilePaths.every(fp => {
                        const count = (this as any)._fileFailureCounts?.get(fp) || 0;
                        return count >= MAX_SAME_FILE_UPDATE_FAILURES;
                    });
                    const blockDone = failedUpdateFilePaths.length > 0 && !hasExecutedWriteTools
                        && !hasExhaustedRetries
                        && (status !== 'already_done' || this.isRepairAgent);
                    if (blockDone) {
                        const paths = failedUpdateFilePaths.join(', ');
                        console.warn(`[SubAgentLoop:${this.subtask.id}] Standalone __done__ rejected: unresolved update_file failures for: ${paths}`);
                        conversationParts.push({
                            text: `[System] Cannot accept __done__ because update_file failed previously (failed files: ${paths}).\nDeclaring completion without modifying files is not allowed.\nRe-read the current content of those files with read_file, then retry update_file with accurate SEARCH blocks.`,
                        });
                        continue;
                    }
                    if (hasExhaustedRetries) {
                        console.warn(`[SubAgentLoop:${this.subtask.id}] __done__ allowed despite failures — max retries (${MAX_SAME_FILE_UPDATE_FAILURES}) exhausted for: ${failedUpdateFilePaths.join(', ')}`);
                    }

                    console.log(`[SubAgentLoop:${this.subtask.id}] __done__ signal: status=${status}, summary=${summary.substring(0, 100)}`);
                    if (this.subtask.toolPermission === 'full' && !hasExecutedWriteTools && status !== 'already_done') {
                        warnings.push(`Completed without file modifications -- the model declared task completion with __done__(${status}).`);
                    }
                    lastResponse = summary || response;
                    completedNormally = true;
                    doneStatus = status as 'completed' | 'already_done';
                    break;
                }

                // AGENT mode: no tools and no __done__ = text-only completion
                if (this.isAgentMode && !doneCall && executableCalls.length === 0) {
                    console.log(`[SubAgentLoop:${this.subtask.id}] AGENT mode: Text-only response — completing.`);
                    completedNormally = true;
                    doneStatus = 'completed';
                    break;
                }

                // No tools (and no __done__): determine if actually complete
                if (executableCalls.length === 0) {
                    // Unknown tool name -> re-prompt (prevent loop termination)
                    const unknownToolWarnings = parseWarnings.filter(w => w.startsWith('알 수 없는 도구:'));
                    if (unknownToolWarnings.length > 0) {
                        const unknownNames = unknownToolWarnings.map(w => w.replace('알 수 없는 도구: ', '')).join(', ');
                        const availableTools = [
                            'read_file', 'update_file', 'create_file', 'remove_file',
                            'run_command', 'ripgrep_search', 'list_files', 'glob_search',
                            'list_imports', 'stat_file', 'fetch_url', 'lsp',
                        ].join(', ');
                        console.warn(`[SubAgentLoop:${this.subtask.id}] Unknown tool names: ${unknownNames}. Re-prompting.`);
                        conversationParts.push({ text: response });
                        conversationParts.push({
                            text: `[System] You called unknown tools: ${unknownNames}. These tools do not exist. You must only use the following tools: ${availableTools}. Tool call format: {"tool": "tool_name", ...parameters}`,
                        });
                        continue;
                    }

                    const needsWrite = this.subtask.toolPermission === 'full';

                    // Fallback 1: write tool execution completed -> normal completion
                    if (hasExecutedWriteTools) {
                        completedNormally = true;
                        break;
                    }

                    // Fallback 2: read-only permission and read tools executed -> normal completion
                    if (!needsWrite && hasExecutedTools) {
                        completedNormally = true;
                        break;
                    }

                    // Fail: no tools executed and no __done__ -> failure
                    consecutiveFailures++;
                    const reason = needsWrite && hasExecutedTools
                        ? 'read-only tools only, no write operations'
                        : 'no prior tool execution';
                    console.warn(`[SubAgentLoop:${this.subtask.id}] No tool calls (${reason}) — treating as failure (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES})`);
                    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                        errors.push(needsWrite && hasExecutedTools
                            ? 'The LLM only performed file reads without creating/modifying any files. It may have failed to follow the tool call format (```json).'
                            : 'The LLM failed to generate tool calls. The response did not contain tool calls in ```json code block format.');
                        break;
                    }
                    conversationParts.push({ text: response });
                    conversationParts.push({
                        text: this.buildRecoveryNudge(consecutiveFailures)
                    });
                    continue;
                }

                // 3. Permission-based filtering
                const allowedCalls = this.filterByPermission(executableCalls);

                if (allowedCalls.length === 0) {
                    conversationParts.push({ text: response });
                    conversationParts.push({
                        text: '[System] All requested tools were blocked by the permission policy. Try a different approach or respond without using tools.'
                    });
                    continue;
                }

                // 3.5. Deduplicate same tool+path within the same turn (e.g. read_file same file twice)
                // Pre-scan: collect read_file/create_file paths upfront (block regardless of order)
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
                        // Fix 8: create_file already executed/pending during streaming -- prevent re-execution
                        console.log(`[SubAgentLoop:${this.subtask.id}] Skipping streaming-pre-executed create_file: ${call.params.path}`);
                        return false;
                    }

                    if (call.name === 'read_file' && call.params.path) {
                        // Skip files already read in previous turns (prevent hallucination loops)
                        // Disabled for repair agent -- may need to re-read current state after modifications
                        if (!this.disableReadDedup && alreadyReadFiles.has(call.params.path)) {
                            console.log(`[SubAgentLoop:${this.subtask.id}] Cross-turn duplicate read skipped: ${call.params.path}`);
                            skippedReadFiles.push(call.params.path);
                            return false;
                        }
                    }

                    if (call.name === 'stat_file' && call.params.path) {
                        // Skip files already statted in previous turns (prevent duplicate lookups)
                        if (alreadyStattedFiles.has(call.params.path)) {
                            console.log(`[SubAgentLoop:${this.subtask.id}] Cross-turn duplicate stat skipped: ${call.params.path}`);
                            skippedStatFiles.push(call.params.path);
                            return false;
                        }
                    }

                    if (call.name === 'update_file' && call.params.path) {
                        // create_file followed by update_file in same turn -> skip (allow in next turn)
                        if (createFilesInTurn.has(call.params.path)) {
                            console.log(`[SubAgentLoop:${this.subtask.id}] Skipped update_file after create_file in same turn: ${call.params.path}`);
                            skippedUpdateFiles.push({ path: call.params.path, reason: 'create' });
                            return false;
                        }
                        // read_file + update_file same turn: block only protected files
                        // (for regular files, LLM already knows the content from context, so allow)
                    }

                    return true;
                });

                // 4. User approval filtering (when onToolApprovalRequired callback is provided)
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

                // 5. Execute tools (connect UI callbacks)
                const results = callsToExecute.length > 0
                    ? await this.toolExecutor.executeTools(
                        callsToExecute,
                        this.toolContext,
                        this.callbacks?.onToolComplete,
                        this.callbacks?.onToolStart,
                        this.abortSignal,
                    )
                    : [];

                // Synthetic feedback for rejected tools (included in LLM context)
                for (const call of rejectedCalls) {
                    uniqueCalls.push(call);
                    results.push({
                        success: false,
                        message: `[Rejected] The user rejected execution of ${call.name}(${call.params.path || call.params.command || ''}).`,
                    });
                }

                // 5.1. Record successful read_file in alreadyReadFiles (prevent cross-turn duplicates)
                for (const call of callsToExecute) {
                    if (call.name === 'read_file' && call.params.path) {
                        alreadyReadFiles.add(call.params.path);
                    }
                }
                // 5.2. Record successful stat_file in alreadyStattedFiles (prevent cross-turn duplicates)
                for (const call of callsToExecute) {
                    if (call.name === 'stat_file' && call.params.path) {
                        alreadyStattedFiles.add(call.params.path);
                    }
                }

                // 4.4. Fix 8: Add synthetic feedback for create_file executed during streaming
                for (const path of streamingCreatedPaths) {
                    if (allowedCalls.some(c => c.name === 'create_file' && c.params.path === path)) {
                        uniqueCalls.push({ name: 'create_file', params: { path } } as ToolUse);
                        results.push({ success: true, message: `[Created during streaming] File ${path} was created immediately during streaming.` });
                    }
                }

                // 4.5a. Add synthetic feedback for cross-turn duplicate read_file skips (including cached content)
                for (const skippedPath of skippedReadFiles) {
                    uniqueCalls.push({ name: 'read_file', params: { path: skippedPath } } as ToolUse);
                    // Include cached file content so LLM can proceed to next step
                    let cachedContent = '';
                    try {
                        const absPath = path.resolve(this.toolContext.workspaceRoot || this.toolContext.projectRoot, skippedPath);
                        cachedContent = await fs.readFile(absPath, 'utf-8');
                    } catch { /* ignore */ }
                    const contentPreview = cachedContent
                        ? `\n\nCurrent file content:\n\`\`\`\n${cachedContent.substring(0, 5000)}${cachedContent.length > 5000 ? '\n... (truncated)' : ''}\n\`\`\``
                        : '';
                    results.push({
                        success: true,
                        message: `[Already read] ${skippedPath} was already read in a previous turn. Use the content below. Do not call read_file again.${contentPreview}`,
                    });
                }

                // 4.5b. Add synthetic feedback for cross-turn duplicate stat_file skips
                for (const path of skippedStatFiles) {
                    uniqueCalls.push({ name: 'stat_file', params: { path } } as ToolUse);
                    results.push({
                        success: true,
                        message: `[Already queried] ${path} was already queried with stat_file in a previous turn. Use the previous result as-is. Do not call stat_file again.`,
                    });
                }

                // 4.5. Add synthetic feedback for skipped update_file
                for (const skipped of skippedUpdateFiles) {
                    uniqueCalls.push({
                        name: 'update_file',
                        params: { path: skipped.path }
                    } as ToolUse);
                    if (skipped.reason === 'create') {
                        results.push({
                            success: true,
                            message: `[Skipped] ${skipped.path} was created with create_file in this session. update_file was automatically skipped. To modify the file content, first check the current content with read_file, then use update_file.`,
                        });
                    } else {
                        results.push({
                            success: true,
                            message: `[Skipped] Cannot execute read_file(${skipped.path}) and update_file(${skipped.path}) in the same turn. update_file is automatically skipped. In the next turn, regenerate the SEARCH block based on the actual content just read with read_file, and execute only update_file.`,
                        });
                    }
                }

                // Reset failure counter since tools were executed
                consecutiveFailures = 0;

                // Set tool success flags
                let hasWriteToolInThisTurn = false;
                for (let i = 0; i < uniqueCalls.length; i++) {
                    const callResult = results[i];
                    const callItem = uniqueCalls[i];
                    if (callResult?.success) {
                        hasExecutedTools = true;
                        if (!READ_ONLY_TOOLS.has(callItem.name)) {
                            hasExecutedWriteTools = true;
                            hasWriteToolInThisTurn = true;
                            // Remove from failure tracking list on successful update_file
                            if (callItem.name === 'update_file' && callItem.params.path) {
                                failedUpdateFilePaths = failedUpdateFilePaths.filter(p => p !== callItem.params.path);
                            }
                        }
                        // create_file paths tracked in createFilesInTurn only within the same turn
                    } else if (!callResult?.success && callItem.name === 'update_file' && callItem.params.path) {
                        // Track update_file failures
                        if (!failedUpdateFilePaths.includes(callItem.params.path)) {
                            failedUpdateFilePaths.push(callItem.params.path);
                        }
                        // Track per-file failure count for exhaustion detection
                        if (!(this as any)._fileFailureCounts) (this as any)._fileFailureCounts = new Map<string, number>();
                        const fp = callItem.params.path as string;
                        const prevCount = (this as any)._fileFailureCounts.get(fp) || 0;
                        (this as any)._fileFailureCounts.set(fp, prevCount + 1);
                        console.warn(`[SubAgentLoop:${this.subtask.id}] update_file FAILED for: ${fp} (attempt ${prevCount + 1}/${MAX_SAME_FILE_UPDATE_FAILURES})`);
                    }
                }

                // Lightweight state management: nudge write when only read-only tools used consecutively with full permission
                // Agent mode: skip nudge — LLM autonomously decides when to write
                if (this.subtask.toolPermission === 'full' && !this.isAgentMode) {
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
                                text: `[System] Investigation phase is sufficient (${consecutiveReadOnlyTurns} consecutive read-only turns). Now use create_file or update_file to create/modify files immediately. Write code without additional file reads.`
                            });
                            consecutiveReadOnlyTurns = 0; // Reset and give one more chance
                            continue;
                        }
                    }
                }

                // 5. Track file changes (based on ToolResponse.filePath -- no hardcoded tool names)
                for (let i = 0; i < uniqueCalls.length; i++) {
                    const call = uniqueCalls[i];
                    const result = results[i];
                    if (result?.success && result.filePath) {
                        // remove_file: returns only filePath without fileContent
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

                // 5.5. v1.0.24: Check LSP diagnostics immediately after write tool execution
                // SubAgentLoop also provides immediate error feedback like ConversationManager
                if (hasWriteToolInThisTurn && (createdFiles.length > 0 || modifiedFiles.length > 0)) {
                    try {
                        const { TestRunner } = await import('../managers/conversation/handlers/TestRunner');
                        const workspaceRoot = this.toolContext.workspaceRoot || this.toolContext.projectRoot || '';
                        // Wait briefly for LSP to process the changes
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
                            const diagMsg = `[System] LSP Diagnostics: ${diagnosticErrors.length} errors detected\n${errorLines.join('\n')}${diagnosticErrors.length > 10 ? `\n  ... and ${diagnosticErrors.length - 10} more` : ''}\n\nPlease fix the above errors. Check the current file content with read_file, then fix with update_file.`;
                            conversationParts.push({ text: diagMsg });
                            console.log(`[SubAgentLoop:${this.subtask.id}] Inline diagnostics: ${diagnosticErrors.length} errors detected`);
                        }
                    } catch (e) {
                        console.warn(`[SubAgentLoop:${this.subtask.id}] Inline diagnostics check failed:`, e);
                    }
                }

                // 6. Add tool results to next turn context
                const toolResultsText = this.formatToolResults(uniqueCalls, results);
                conversationParts.push({ text: response });
                conversationParts.push({ text: toolResultsText });

                // 6.1. Auto-inject current file content on update_file failure -- support SEARCH block regeneration
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
                            contentParts.push(`--- ${filePath} (current actual file content) ---\n${content}\n---`);
                        } catch { /* ignore read failure */ }
                    }
                    if (contentParts.length > 0) {
                        conversationParts.push({
                            text: `[System] The update_file SEARCH pattern does not match the actual file content.\nCheck the current file content below, then retry update_file with SEARCH blocks containing the actual existing text.\nThe file content is already provided below, so do NOT call read_file again. Use update_file directly:\n\n${contentParts.join('\n\n')}`,
                        });
                        console.log(`[SubAgentLoop:${this.subtask.id}] Auto-injected current content for ${updateFailedPaths.length} failed update_file(s)`);
                    }
                }
                if (maxTokensReached) {
                    conversationParts.push({ text: '[System] The previous response was truncated due to max_tokens. If there are any truncated tool calls or file content, output them again completely from the beginning. Continue with the task.' });
                }

                // 7. Process __done__ (after tool execution -- other tools in the same turn execute first)
                if (doneCall) {
                    const status = doneCall.params.status || 'completed';
                    const summary = doneCall.params.summary || '';

                    // If same-turn update_file failed OR accumulated unresolved failures exist, reject __done__
                    // Repair agent also blocks already_done (handled in standalone __done__ but apply same logic for post-tool)
                    if (status !== 'already_done' || this.isRepairAgent) {
                        const currentTurnUpdateFailures = uniqueCalls
                            .map((call, i) => ({ call, result: results[i] }))
                            .filter(({ call, result }) => call.name === 'update_file' && !result?.success);
                        const hasAccumulatedFailures = failedUpdateFilePaths.length > 0 && !hasExecutedWriteTools;

                        // Check if max retries exhausted for all failed files
                        const allRetriesExhausted = failedUpdateFilePaths.length > 0 && failedUpdateFilePaths.every(fp => {
                            const count = (this as any)._fileFailureCounts?.get(fp) || 0;
                            return count >= MAX_SAME_FILE_UPDATE_FAILURES;
                        });

                        if ((currentTurnUpdateFailures.length > 0 || hasAccumulatedFailures) && !allRetriesExhausted) {
                            const failedPaths = currentTurnUpdateFailures.length > 0
                                ? currentTurnUpdateFailures.map(({ call }) => call.params.path || '?').join(', ')
                                : failedUpdateFilePaths.join(', ');
                            console.warn(`[SubAgentLoop:${this.subtask.id}] __done__ rejected: unresolved update_file failures for: ${failedPaths}`);
                            conversationParts.push({
                                text: `[System] Cannot accept __done__ because update_file failed (failed files: ${failedPaths}).\nThe file content is already provided above. Do NOT call read_file again. Use the provided file content to retry update_file with accurate SEARCH blocks to complete the modification.`,
                            });
                            continue;
                        }
                        if (allRetriesExhausted) {
                            console.warn(`[SubAgentLoop:${this.subtask.id}] __done__ allowed despite failures — max retries exhausted`);
                        }
                    }

                    console.log(`[SubAgentLoop:${this.subtask.id}] __done__ signal: status=${status}, summary=${summary.substring(0, 100)}`);
                    if (this.subtask.toolPermission === 'full' && !hasExecutedWriteTools && status !== 'already_done') {
                        warnings.push(`Completed without file modifications -- the model declared task completion with __done__(${status}).`);
                    }
                    lastResponse = summary || response;
                    completedNormally = true;
                    doneStatus = status as 'completed' | 'already_done';
                    break;
                }

            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                if (error instanceof Error && error.name === 'AbortError') {
                    errors.push('Aborted by user');
                    break;
                }

                consecutiveFailures++;
                errors.push(`Turn ${turnCount}: ${msg}`);

                if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                    errors.push('Consecutive failure limit exceeded, aborting agent');
                    break;
                }

                conversationParts.push({
                    text: this.buildRecoveryNudge(consecutiveFailures)
                });
            }
        }

        // If files were written, treat as success (verification is handled by TestRunner)
        // If not terminated normally (MAX_TURNS reached, verification command failure, etc.), record as warnings
        const hasWrittenFiles = hasExecutedWriteTools;
        const effectiveSuccess = completedNormally || hasWrittenFiles;

        if (!completedNormally && hasWrittenFiles) {
            warnings.push(`Agent did not terminate normally but file writing was completed (${createdFiles.length} created, ${modifiedFiles.length} modified). Falling back to system verification.`);
            // Move self-verification related errors to warnings
            const verificationErrors = errors.filter(e =>
                e.includes('timeout') || e.includes('abort') || e.includes('exceeded') ||
                e.includes('Aborted') || e.includes('Consecutive')
            );
            for (const ve of verificationErrors) {
                warnings.push(ve);
                errors.splice(errors.indexOf(ve), 1);
            }
        }

        const dedupCreated = [...new Set(createdFiles)];
        const dedupModified = [...new Set(modifiedFiles)];
        const dedupDeleted = [...new Set(deletedFiles)];

        // completionSummary: unified structured summary across all completion paths
        const completionSummary = [
            doneStatus ? `Status: ${doneStatus}` : 'Status: fallback completion',
            dedupCreated.length > 0 ? `Created: ${dedupCreated.join(', ')}` : null,
            dedupModified.length > 0 ? `Modified: ${dedupModified.join(', ')}` : null,
            dedupDeleted.length > 0 ? `Deleted: ${dedupDeleted.join(', ')}` : null,
            warnings.length > 0 ? `Warnings: ${warnings.join('; ')}` : null,
            errors.length > 0 ? `Errors: ${errors.join('; ')}` : null,
            lastResponse ? `Summary: ${SubAgentLoop.extractHeadTail(lastResponse.replace(THINKING_TAG_REGEX, '').trim(), 800, 400)}` : null,
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
        // Filter allowed tools based on permission
        const allowedTools = this.getAllowedTools();
        const toolSpecs = ToolSpecBuilder.buildToolSpecs(allowedTools);
        const toolSection = buildToolPromptSection(toolSpecs, nativeMode);

        const projectSection = this.projectContext
            ? `\n## Project Structure\n${this.projectContext}\n`
            : '';

        const rulesSection = this.rulesContext
            ? `\n${this.rulesContext}\n`
            : '';

        const agentModeSection = this.isAgentMode ? `
## Agent Mode
You are operating in autonomous agent mode. You have full freedom to decide:
- What to read, write, create, delete, and execute
- When to stop (call __done__ or respond with text only)
- How to handle errors (retry or report)
No phase restrictions apply. Think and act directly.
` : '';

        return `You are a coding assistant that performs a specific subtask.
${rulesSection}${agentModeSection}
## Task
${this.subtask.title}

## Detailed Instructions
${this.subtask.description}
${projectSection}
## Rules
- Focus only on this task
- Call the __done__ tool when the task is complete
- Even if the task is already implemented and no additional work is needed, call the __done__ tool after verification
- Do not attempt work outside your assigned scope
- If a file structure is provided, start working immediately without using list_files
- When searching for files/code, use glob_search (for filenames) or ripgrep_search (for content) instead of list_files. Only use list_files when you need to check a specific directory structure
- Do not explore node_modules, .git, __pycache__, env, .venv, dist, build directories
- If there is a "Reference Documents (RAG)" section in the context, use it as your primary data source. These documents are pre-fetched from an external knowledge base and MAY NOT exist as files in the local filesystem. Do not attempt to read them with read_file. Extract the information directly from the provided content
- Write all responses in Korean
- Do not depend on files that other agents will create. If read_file fails, create the file yourself with create_file
- Do not call the same tool with identical parameters repeatedly. There is no need to re-execute a tool call that already succeeded
- The SEARCH block in update_file must contain the exact actual code from the file. Abbreviations like "... (omitted)", "// ...", "..." are strictly forbidden. SEARCH blocks containing abbreviations will be immediately treated as errors
- The __done__ summary must include specific figures from your investigation (file paths, sizes, line numbers, etc.). The aggregation task will use this data.
${this.subtask.dependencies.length > 0 ? '- This task aggregates results from prerequisite tasks. Do not re-query information already included in prerequisite task summaries (file sizes, paths, line numbers, symbol lists, etc.) using tools. Use the data from the summaries as-is for your analysis.' : ''}

- When initializing a project, do not use scaffolding tools like create-vite, create-react-app, create-next-app, etc. Directly create configuration files (package.json, tsconfig.json, etc.) and source code with create_file, then install dependencies with npm install

${toolSection}

${nativeMode ? `## Tool Call Examples (API Function Call format)

- Read file: call read_file function (path parameter)
- Create file: call create_file function (path, content parameters) -- pass the entire file content directly in content
- Modify file: call update_file function (path, diff parameters) -- SEARCH/REPLACE blocks
- List files: call list_files function (path, recursive parameters) -- use only when checking a specific directory structure
- Search files: call glob_search function (pattern parameter) -- use when searching by filename/extension
- Search code: call ripgrep_search function (query, path parameters) -- use when searching by content/keywords
- Task complete: call __done__ function (status="completed", summary parameter)
- Already done: call __done__ function (status="already_done", summary parameter)

**Important: Only call tools via API function calls. Do not output { "tool": ... } JSON in text. Always call __done__ when the task is finished.**` : `## Tool Call Examples (you must follow this format)

Read file:
{ "tool": "read_file", "path": "src/App.tsx" }

Create file:
{ "tool": "create_file", "path": "src/components/MyComponent.tsx" }
<file_content>
const MyComponent = () => <div>Hello</div>;
export default MyComponent;
</file_content>

Modify file (SEARCH/REPLACE):
{ "tool": "update_file", "path": "src/App.tsx" }
<file_changes>
<<<< SEARCH
const App = () => <div>Hello</div>;
====
import MyComponent from './components/MyComponent';
const App = () => <div><MyComponent /></div>;
>>>> REPLACE
</file_changes>

Search by filename:
{ "tool": "glob_search", "pattern": "src/**/*.ts" }

Search code content:
{ "tool": "ripgrep_search", "query": "function handleLogin", "path": "src" }

List files (only for checking specific directory structure):
{ "tool": "list_files", "path": "src", "recursive": "true" }

Declare task completion:
{ "tool": "__done__", "status": "completed", "summary": "Summary of what was done" }

Already implemented, no additional work needed:
{ "tool": "__done__", "status": "already_done", "summary": "Summary of verification results" }

**Important: To use a tool, output the JSON format above directly in your response. Output only JSON without explanatory text. Do not put tool calls inside thinking. Always call the __done__ tool when the task is finished.**`}`;
    }

    // Tools exclusive to main loop — sub-agents should not use these
    private static readonly MAIN_LOOP_ONLY_TOOLS = new Set([
        Tool.WORK_PLAN,
        Tool.SPAWN_AGENT,
        Tool.STOP_AGENT,
    ]);

    private getAllowedTools(): Tool[] {
        const exclude = (tools: Tool[]) => tools.filter(t => !SubAgentLoop.MAIN_LOOP_ONLY_TOOLS.has(t));

        if (this.isAgentMode) {
            return exclude(Object.values(Tool) as Tool[]);
        }
        if (this.subtask.toolPermission === 'full') {
            return exclude(Object.values(Tool) as Tool[]);
        }

        const readOnly = Array.from(READ_ONLY_TOOLS) as Tool[];

        if (this.subtask.toolPermission === 'read-only-with-commands') {
            return [...readOnly, Tool.RUN_COMMAND];
        }

        return readOnly;
    }

    private filterByPermission(toolCalls: ToolUse[]): ToolUse[] {
        if (this.isAgentMode) {
            return toolCalls;
        }
        if (this.subtask.toolPermission === 'full') {
            return toolCalls;
        }

        const registry = ToolRegistry.getInstance();

        return toolCalls.filter(call => {
            if (READ_ONLY_TOOLS.has(call.name)) {
                return true;
            }
            // MCP tools are allowed at all permission levels (they have their own approval mechanism)
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

            // Include both message + data (data contains the actual content)
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
     * Convert tool result data to a string readable by LLM
     * Generic serialization not dependent on specific tools
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
     * Generate progressively more specific recovery prompts based on consecutive failure count
     */
    /**
     * Determine if response contains only raw JSON without tool calls (approve/reject etc. self-generated by LLM)
     */
    private isRawJsonOnly(response: string): boolean {
        const trimmed = response.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        // Short text + composed only of JSON objects
        if (trimmed.length > 2000) { return false; }
        // Remove preamble like "We need to approve." and check if only JSON remains
        const withoutPreamble = trimmed.replace(/^[^{]*/, '').trim();
        if (!withoutPreamble.startsWith('{')) { return false; }
        try {
            // Include consecutive JSON objects ({"filePath":...}{"filePath":...})
            const jsonPattern = /\{[^{}]*\}/g;
            const matches = withoutPreamble.match(jsonPattern);
            if (!matches || matches.length === 0) { return false; }
            return matches.every(m => {
                try {
                    const obj = JSON.parse(m);
                    // filePath+action or similar non-tool patterns
                    return obj.action || obj.approve || obj.status;
                } catch { return false; }
            });
        } catch { return false; }
    }

    /**
     * Detect the last tool call pattern in the streaming buffer and return a status message
     * Only detect actual tool call JSON (ignore file references in text)
     */
    /**
     * Extract the first `head` chars + last `tail` chars of text (omit middle)
     * Return as-is if total length is less than or equal to head+tail
     */
    private static extractHeadTail(text: string, head: number, tail: number): string {
        if (text.length <= head + tail) { return text; }
        return text.substring(0, head) + '\n...(omitted)...\n' + text.substring(text.length - tail);
    }

    private parseStreamingToolStatus(content: string): string | null {
        const toolLabels: Record<string, string> = {
            create_file: '파일 생성 중',
            update_file: '파일 수정 중',
            read_file: '파일 읽기 중',
            delete_file: '파일 삭제 중',
            run_command: '명령 준비 중',
            glob_search: '파일 검색 중',
            list_files: '파일 목록 조회 중',
        };

        // Caller passes only newly added portion, so no need for full/tail scan
        // Only detect lines starting with { (exclude inline references in text)
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

        // run_command: detect by "command" key
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
            return '[System] The previous response was empty or contained only thinking. You must output either a tool call or a plain text final summary.';
        }

        // Provide specific tool call examples after 2+ failures
        const allowedTools = this.getAllowedTools();
        const exampleTool = allowedTools[0] || 'list_files';
        return `[System] Warning: ${failureCount} consecutive failures. You must output one of the following:\n` +
            `1. A tool call in the following format:\n` +
            '```json\n' +
            `{ "tool": "${exampleTool}", "params": {} }\n` +
            '```\n' +
            `2. Or a plain text summary of completed work (no tool call = task complete).\n` +
            `Do not output only <think> tags. Generate visible output now.`;
    }


}
