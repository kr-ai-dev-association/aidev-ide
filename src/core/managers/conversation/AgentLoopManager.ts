/**
 * AgentLoopManager — Pure autonomous agent loop (no FSM)
 *
 * Claude Code-style while(true) loop:
 *   1. Inject worker notifications + work_plan status
 *   2. Context management (trim + compaction)
 *   3. Call LLM with streaming
 *   4. Parse response for tool calls
 *   5. Execute tools if found → continue
 *   6. Text-only response AND no running workers → break (task completed)
 *
 * After loop: save session entry
 */

import * as vscode from "vscode";
import * as crypto from "crypto";
import { LLMManager } from "../model/LLMManager";
import { WebviewBridge } from "../../webview/WebviewBridge";
import { ToolParser } from "../../tools/ToolParser";
import { ToolExecutor } from "../../tools/ToolExecutor";
import { ToolExecutionContext } from "../../tools/IToolHandler";
import { ToolExecutionCoordinator } from "./handlers/ToolExecutionCoordinator";
import { ResponseProcessor } from "./handlers/ResponseProcessor";
import { ConversationCompactor } from "./ConversationCompactor";
import { ContextManager } from "../context/ContextManager";
import { ActionManager } from "../action/ActionManager";
import { ExecutionManager } from "../execution/ExecutionManager";
import { TerminalManager } from "../terminal/TerminalManager";
import { ProjectManager } from "../project/ProjectManager";
import { SettingsManager } from "../state/SettingsManager";
import { StateManager } from "../state/StateManager";
import { UsageMetricsManager } from "../state/UsageMetricsManager";
import { AiModelType } from "../../../services";
import { ToolSpecBuilder } from "../../tools/ToolSpecBuilder";
import { AgentConfig } from "../../config/AgentConfig";
import { MODEL_TOKEN_LIMITS } from "../../../utils/tokenUtils";
import { estimateTokens } from "../../../utils";
import { StringUtils } from "../../utils/StringUtils";
import { getAgentTaskManager } from "../../tools/agent/SpawnAgentToolHandler";
import { getWorkPlanStatus } from "../../tools/agent/WorkPlanToolHandler";
import { getAgentModePrompt } from "../context/prompts/agent/agentPrompt";
import { StreamingCodeApplier } from "../../tools/StreamingCodeApplier";
import { InlineDiffManager } from "../diff/InlineDiffManager";
import { ToolUse, ToolResponse, Tool } from "../../tools/types";
import { UserPart, CollectedAction, CollectedUIMessage } from "./types/TurnContext";
import { ConversationOptions } from "./ConversationManager";

export interface AgentLoopOptions {
  options: ConversationOptions;
  systemPrompt: string;
  userParts: UserPart[];
}

export class AgentLoopManager {
  private llmManager: LLMManager;
  private contextManager: ContextManager;
  private responseProcessor: ResponseProcessor;

  constructor(llmManager: LLMManager) {
    this.llmManager = llmManager;
    this.contextManager = ContextManager.getInstance();
    this.responseProcessor = new ResponseProcessor(llmManager);
  }

  /**
   * Run the pure autonomous agent loop.
   * Returns when the agent completes its task (text-only response with no running workers).
   */
  async execute(
    options: ConversationOptions,
    systemPrompt: string,
    userParts: UserPart[],
  ): Promise<void> {
    const { webviewToRespond, abortSignal, userQuery } = options;
    const maxTestFixAttempts = 5;

    // Append agent mode prompt to system prompt
    const activeSystemPrompt = systemPrompt + '\n\n' + getAgentModePrompt(maxTestFixAttempts);

    let accumulatedUserParts = [...userParts];
    let turnCount = 0;
    let conversationTurnId = crypto.randomUUID();

    // Metadata collection for session history
    const collectedActions: CollectedAction[] = [];
    const collectedUIMessages: CollectedUIMessage[] = [];
    const createdFiles: string[] = [];
    const modifiedFiles: string[] = [];
    const executedCommands: string[] = [];
    const preloadedFiles = new Set<string>();
    const alreadyStattedFiles = new Set<string>();

    // Managers
    const actionManager = ActionManager.getInstance();
    const executionManager = ExecutionManager.getInstance();
    const terminalManager = TerminalManager.getInstance();
    const toolExecutor = new ToolExecutor();
    const currentProject = ProjectManager.getInstance().getCurrentProject();
    const workspaceRoot = currentProject?.root || "";
    const usageMetrics = UsageMetricsManager.getInstance();

    // Settings
    const thinkingLevel = options.extensionContext
      ? await SettingsManager.getInstance(options.extensionContext).getThinkingLevel()
      : 'medium';

    // FileTransactionManager — rollback support
    const { FileTransactionManager } = await import("../action/file/FileTransactionManager");
    const txnMgr = FileTransactionManager.getInstance();
    txnMgr.beginTransaction();

    console.log(`[AgentLoopManager] Starting autonomous loop`);

    // Streaming pre-execution tracking (persists across turns)
    const streamingCreatedPaths = new Set<string>();
    const streamingUpdatedPaths = new Set<string>();

    // Error accumulation tracking
    const consecutiveToolFailures = new Map<string, number>();
    const MAX_CONSECUTIVE_TOOL_FAILURES = 3;
    const MAX_TURNS_WARNING_THRESHOLD = 20;
    const MAX_AGENT_TURNS = 25;

    try {
    // ─── Main Loop ───
    while (true) {
      if (abortSignal?.aborted) {
        console.log(`[AgentLoopManager] Aborted at turn ${turnCount}`);
        break;
      }

      // max_turns 경고
      if (turnCount >= MAX_TURNS_WARNING_THRESHOLD) {
        const remaining = MAX_AGENT_TURNS - turnCount;
        accumulatedUserParts.push({
          text: `[System] 주의: 남은 턴이 ${remaining}회입니다. 작업을 마무리하고 최종 결과를 정리하세요.`,
        });
        console.log(`[AgentLoopManager] Turn limit warning: ${remaining} turns remaining`);
      }

      // 1. Inject worker notifications (spawn_agent results)
      const agentTaskMgr = getAgentTaskManager();
      const notifications = agentTaskMgr.consumePendingNotifications();
      if (notifications.length > 0) {
        for (const notifXml of notifications) {
          accumulatedUserParts.push({ text: notifXml });
        }
        console.log(`[AgentLoopManager] Injected ${notifications.length} task notification(s)`);
      }

      // 2. Inject work_plan status
      const workPlanStatus = getWorkPlanStatus();
      if (workPlanStatus) {
        accumulatedUserParts.push({ text: workPlanStatus });
      }

      // 3. New turn ID
      conversationTurnId = crypto.randomUUID();

      // 4. Trim accumulated parts (memory leak prevention)
      accumulatedUserParts = this.trimAccumulatedParts(accumulatedUserParts);

      // 5. Context compaction
      try {
        const compactor = ConversationCompactor.getInstance(this.llmManager);
        if (options.extensionContext) {
          compactor.setStateManager(StateManager.getInstance(options.extensionContext));
        }
        const currentModelType = options.currentModelType || AiModelType.OLLAMA;
        const modelLimits = MODEL_TOKEN_LIMITS[currentModelType] || MODEL_TOKEN_LIMITS[AiModelType.OLLAMA];
        const maxTokens = modelLimits?.maxInputTokens || 128000;

        // Tier 1: Tool result trim (no LLM call)
        const trimResult = compactor.trimToolResults(accumulatedUserParts, activeSystemPrompt, maxTokens);
        if (trimResult.trimmed) {
          accumulatedUserParts = trimResult.parts;
          console.log(`[AgentLoopManager] Tier1 trim: saved ${trimResult.savedTokens} tokens`);
        }

        // Tier 1.5: Microcompact — 도구 결과를 1줄 요약 (LLM 호출 없음, 70% 초과 시)
        const microResult = compactor.microcompact(accumulatedUserParts, activeSystemPrompt, maxTokens);
        if (microResult.compacted) {
          accumulatedUserParts = microResult.parts;
          console.log(`[AgentLoopManager] Microcompact: saved ${microResult.savedTokens} tokens`);
        }

        // Tier 2: LLM summary (if still over threshold)
        if (compactor.needsCompaction(accumulatedUserParts, activeSystemPrompt, maxTokens)) {
          console.log(`[AgentLoopManager] Token threshold exceeded. Starting context compaction...`);
          WebviewBridge.sendProcessingStatus(webviewToRespond, "context", "컨텍스트 압축 중...");

          const compactionResult = await compactor.compact(
            accumulatedUserParts, activeSystemPrompt, maxTokens, abortSignal,
          );

          if (compactionResult.compacted) {
            accumulatedUserParts = compactionResult.recentMessages;
            console.log(`[AgentLoopManager] Context compacted. Saved ${compactionResult.savedTokens} tokens`);
            usageMetrics.recordContextCompaction(compactionResult.savedTokens);
            WebviewBridge.receiveMessage(
              webviewToRespond, "SYSTEM_INFO",
              `컨텍스트가 자동 압축되었습니다. (${compactionResult.savedTokens.toLocaleString()} 토큰 절약)`,
            );
          }
        }

        // Update context info in UI
        const currentContextTokens = compactor.calculateTotalTokens(accumulatedUserParts, activeSystemPrompt);
        WebviewBridge.updateContextInfo(webviewToRespond, {
          messageCount: accumulatedUserParts.length,
          tokenUsage: {
            current: currentContextTokens,
            max: maxTokens,
            percentage: (currentContextTokens / maxTokens) * 100,
          },
        });
      } catch (compactionError) {
        console.warn("[AgentLoopManager] Context compaction failed:", compactionError);
      }

      // 6. UI status
      WebviewBridge.sendProcessingStep(webviewToRespond, "thinking");
      WebviewBridge.sendProcessingStatus(webviewToRespond, "thinking", `LLM 응답 대기 중...`);

      // 7. Streaming setting
      const isStreamingEnabled = options.extensionContext
        ? await SettingsManager.getInstance(options.extensionContext).isStreamingEnabled()
        : false;

      // 8. Native tool calling
      let nativeToolsForCall: any[] | undefined = undefined;
      try {
        const isNativeEnabled = options.extensionContext
          ? await SettingsManager.getInstance(options.extensionContext).isNativeToolCallingEnabled()
          : false;
        if (isNativeEnabled) {
          const modelType = this.llmManager.getCurrentModel();
          // AGENT 모드: 모든 도구 포함 (AGENT 전용 도구 포함)
          const allTools = Object.values(Tool) as Tool[];
          if (modelType === AiModelType.ADMIN) {
            const adminConfig = this.llmManager.getAdminModelConfig();
            const nativeSupported = adminConfig?.nativeToolCallingSupported === true || String(adminConfig?.nativeToolCallingSupported) === 'true';
            if (nativeSupported) {
              nativeToolsForCall = ToolSpecBuilder.buildOpenAIToolsConfig(allTools);
              console.log(`[AgentLoopManager] Native tool calling enabled: ${adminConfig?.model}`);
            }
          }
          if (modelType === AiModelType.OLLAMA) {
            nativeToolsForCall = ToolSpecBuilder.buildOpenAIToolsConfig(allTools);
            console.log(`[AgentLoopManager] Native tool calling enabled for Ollama`);
          }
        }
      } catch { /* ignore */ }

      // 9. Call LLM
      const llmStartTime = Date.now();
      let llmResponse: string;

      if (isStreamingEnabled) {
        let accumulatedResponse = "";
        let streamLastFileContentPos = 0;
        const FILE_END_MARKER = '</file_content>';
        const streamingHandledPaths = new Set<string>();
        let streamingFileOpPromise = Promise.resolve();

        // Streaming pre-execution: create_file/update_file 즉시 실행
        const executeStreamingFileOp = (path: string, capturedCall: ToolUse, isUpdate: boolean) => {
          const trackingSet = isUpdate ? streamingUpdatedPaths : streamingCreatedPaths;
          trackingSet.add(path);

          streamingFileOpPromise = streamingFileOpPromise.then(async () => {
            if (abortSignal?.aborted) return;
            const streamCtx: ToolExecutionContext = {
              projectRoot: workspaceRoot, workspaceRoot, actionManager, executionManager,
              terminalManager, contextManager: this.contextManager, conversationTurnId,
              isAgentMode: true,
            };
            try {
              const results = await toolExecutor.executeTools([capturedCall], streamCtx);
              if (results[0]?.success) {
                const p = capturedCall.params.path as string;
                trackingSet.add(p);
                if (isUpdate) {
                  if (!modifiedFiles.includes(p)) modifiedFiles.push(p);
                } else {
                  if (!createdFiles.includes(p) && !modifiedFiles.includes(p)) createdFiles.push(p);
                }
                ToolExecutionCoordinator.sendSingleToolResultToUI(webviewToRespond, capturedCall, results[0]);
              }
            } catch (e) { /* streaming pre-exec failure is non-fatal */ }
          });
        };

        // Native tool complete callback
        const onNativeToolComplete = (toolName: string, args: Record<string, any>) => {
          if ((toolName !== 'create_file' && toolName !== 'update_file') || !args.path) return;
          const p = args.path as string;
          const isUpdate = toolName === 'update_file';
          const trackingSet = isUpdate ? streamingUpdatedPaths : streamingCreatedPaths;
          const handledKey = `${toolName}:${p}`;
          if (trackingSet.has(p) || streamingHandledPaths.has(handledKey)) return;
          const capturedCall: ToolUse = { name: toolName, params: { ...args } };
          executeStreamingFileOp(p, capturedCall, isUpdate);
        };

        const onChunk = (chunk: string, done: boolean) => {
          accumulatedResponse += chunk;
          // FILE_END_MARKER 기반 스트리밍 즉시 실행
          let endIdx = accumulatedResponse.indexOf(FILE_END_MARKER, streamLastFileContentPos);
          while (endIdx !== -1) {
            const segmentEnd = endIdx + FILE_END_MARKER.length;
            const segment = accumulatedResponse.substring(0, segmentEnd);
            streamLastFileContentPos = segmentEnd;
            try {
              const segCalls = ToolParser.parseCodeBlockFormat(segment, []);
              for (const call of segCalls) {
                if ((call.name === 'create_file' || call.name === 'update_file') && call.params.path) {
                  const p = call.params.path as string;
                  const isUpdate = call.name === 'update_file';
                  const trackingSet = isUpdate ? streamingUpdatedPaths : streamingCreatedPaths;
                  if (!trackingSet.has(p) && !streamingHandledPaths.has(`${call.name}:${p}`)) {
                    executeStreamingFileOp(p, call, isUpdate);
                  }
                }
              }
            } catch { /* parse error during streaming is expected */ }
            endIdx = accumulatedResponse.indexOf(FILE_END_MARKER, streamLastFileContentPos);
          }
          // Show token count periodically
          if (accumulatedResponse.length % 500 < chunk.length) {
            const tokens = estimateTokens(accumulatedResponse);
            WebviewBridge.sendProcessingStatus(
              webviewToRespond, 'executing', `응답 생성 중 (${tokens.toLocaleString()} 토큰...)`,
            );
          }
        };
        llmResponse = await this.llmManager.sendMessageWithSystemPromptStreaming(
          activeSystemPrompt,
          accumulatedUserParts,
          onChunk,
          {
            signal: abortSignal,
            nativeTools: nativeToolsForCall,
            onNativeToolComplete,
            thinkingLevel,
            onRetryNotify: (attempt, message) => {
              WebviewBridge.sendProcessingStatus(webviewToRespond, 'retrying', message);
            },
          },
        );
        // Wait for all streaming pre-executions to complete
        await streamingFileOpPromise;
      } else {
        llmResponse = await this.llmManager.sendMessageWithSystemPrompt(
          activeSystemPrompt,
          accumulatedUserParts,
          {
            signal: abortSignal,
            nativeTools: nativeToolsForCall,
            thinkingLevel,
            onRetryNotify: (attempt: number, message: string) => {
              WebviewBridge.sendProcessingStatus(webviewToRespond, 'retrying', message);
            },
          },
        );
      }

      if (abortSignal?.aborted) break;

      // 10. Metrics
      const llmResponseTime = Date.now() - llmStartTime;
      const estimatedTokenCount = estimateTokens(llmResponse);
      let actualModelName: string | undefined;
      try { actualModelName = await this.llmManager.getCurrentModelName(); } catch { }
      usageMetrics.recordLLMCall(llmResponseTime, estimatedTokenCount, true, actualModelName);
      usageMetrics.incrementTurnCount();

      console.log(`[AgentLoopManager] Turn ${turnCount + 1}: LLM responded (${llmResponse.length} chars)`);

      // 11. Show thinking content
      const thinkingMatch = llmResponse.match(/<think>([\s\S]*?)<\/think>/);
      if (thinkingMatch) {
        const thinkingText = thinkingMatch[1].trim();
        if (thinkingText) {
          WebviewBridge.sendThinkingContent(webviewToRespond, thinkingText);
        }
      }

      // 12. Clean response
      const cleanResponse = llmResponse
        .replace(/<think>[\s\S]*?<\/think>/gi, "")
        .trim();

      // 13. Parse tool calls
      const toolParseWarnings: string[] = [];
      const toolCalls = ToolParser.parseToolCalls(llmResponse, toolParseWarnings);

      // Filter out __done__ + streaming pre-executed tools
      const filteredToolCalls = toolCalls.filter(c => {
        if (c.name === '__done__') return false;
        if ((c.name === 'create_file' || c.name === 'update_file') && c.params.path) {
          const p = c.params.path as string;
          if (c.name === 'create_file' && streamingCreatedPaths.has(p)) {
            console.log(`[AgentLoopManager] Streaming-pre-executed create_file skipped: ${p}`);
            return false;
          }
          if (c.name === 'update_file' && streamingUpdatedPaths.has(p)) {
            console.log(`[AgentLoopManager] Streaming-pre-executed update_file skipped: ${p}`);
            return false;
          }
        }
        return true;
      });

      // 14. Handle unknown tool warnings
      const unknownToolWarnings = toolParseWarnings.filter(w => w.startsWith('알 수 없는 도구:'));
      if (unknownToolWarnings.length > 0 && filteredToolCalls.length === 0) {
        const unknownNames = unknownToolWarnings.map(w => w.replace('알 수 없는 도구: ', '')).join(', ');
        const availableTools = [
          'read_file', 'update_file', 'create_file', 'remove_file',
          'run_command', 'ripgrep_search', 'list_files', 'glob_search',
          'list_imports', 'stat_file', 'fetch_url', 'lsp',
          'spawn_agent', 'work_plan', 'memory_save', 'memory_delete',
        ].join(', ');
        console.warn(`[AgentLoopManager] Unknown tools: ${unknownNames}. Re-prompting.`);
        accumulatedUserParts.push({ text: llmResponse });
        accumulatedUserParts.push({
          text: `[시스템] 알 수 없는 도구: ${unknownNames}. 다음 도구만 사용하세요: ${availableTools}`,
        });
        turnCount++;
        continue;
      }

      // 15. Branch: tool calls found → execute
      if (filteredToolCalls.length > 0) {
        console.log(`[AgentLoopManager] Turn ${turnCount + 1}: ${filteredToolCalls.length} tool call(s) detected`);

        WebviewBridge.sendProcessingStep(webviewToRespond, "executing");
        WebviewBridge.sendProcessingStatus(
          webviewToRespond, "executing",
          `${ToolExecutionCoordinator.getToolLabel(filteredToolCalls[0].name)} 실행 중...`,
        );

        const {
          toolResults,
          hasSuccessfulExecution,
          hasWriteToolExecution,
        } = await this.executeTools(
          toolExecutor,
          filteredToolCalls,
          webviewToRespond,
          actionManager,
          executionManager,
          terminalManager,
          collectedUIMessages,
          preloadedFiles,
          alreadyStattedFiles,
          createdFiles,
          modifiedFiles,
          conversationTurnId,
          executedCommands,
          abortSignal,
        );

        // Build result summary and add to context
        const resultSummary = ToolExecutionCoordinator.createToolResultSummary(
          turnCount, filteredToolCalls, toolResults,
        );
        accumulatedUserParts.push({ text: llmResponse });
        accumulatedUserParts.push({ text: resultSummary });

        // 에러 누적 감지
        for (let i = 0; i < filteredToolCalls.length; i++) {
          const call = filteredToolCalls[i];
          const result = toolResults[i];
          if (result?.success) {
            consecutiveToolFailures.delete(call.name);
          } else {
            const count = (consecutiveToolFailures.get(call.name) || 0) + 1;
            consecutiveToolFailures.set(call.name, count);
            if (count >= MAX_CONSECUTIVE_TOOL_FAILURES) {
              accumulatedUserParts.push({
                text: `[System] ${call.name} 도구가 ${count}회 연속 실패했습니다. 다른 방법을 시도하거나, 파일을 다시 읽은 후 정확한 내용으로 재시도하세요.`,
              });
              console.warn(`[AgentLoopManager] ${call.name} failed ${count} times consecutively — nudging alternative approach`);
              consecutiveToolFailures.set(call.name, 0);
            }
          }
        }

        turnCount++;
        continue;
      }

      // 16. Branch: text-only response → check for running workers
      const textResponse = cleanResponse;
      const agentTaskMgrCheck = getAgentTaskManager();

      if (agentTaskMgrCheck.hasRunningTasks()) {
        // Workers still running → wait and continue
        console.log(`[AgentLoopManager] Text-only but ${agentTaskMgrCheck.getRunningTaskCount()} worker(s) running. Waiting...`);
        if (textResponse.trim()) {
          await WebviewBridge.streamText(webviewToRespond, "CODEPILOT", textResponse);
        }
        WebviewBridge.sendProcessingStatus(
          webviewToRespond, 'executing',
          `에이전트 작업 대기 중 (${agentTaskMgrCheck.getRunningTaskCount()}개 실행 중)...`,
        );
        await agentTaskMgrCheck.waitForAnyTaskCompletion();
        accumulatedUserParts.push({ text: llmResponse });
        turnCount++;
        continue;
      }

      // No tool calls, no running workers → task completed
      console.log(`[AgentLoopManager] Turn ${turnCount + 1}: Text-only response, no workers → task completed`);
      if (textResponse.trim()) {
        await WebviewBridge.streamText(webviewToRespond, "CODEPILOT", textResponse);
        collectedUIMessages.push({ sender: "CODEPILOT", text: textResponse, type: "summary" });
      }

      // Send reference info (RAG, Rules, Skills)
      try {
        const { PromptComposer } = await import("../context/prompts/PromptComposer");
        const { ContextGatherer } = await import("./handlers/ContextGatherer");
        const promptRefs = PromptComposer.getLastReferences();
        const ragRefs = ContextGatherer.getLastRagReferences();
        const allRefs = [...ragRefs, ...promptRefs];
        if (allRefs.length > 0) {
          WebviewBridge.sendReferenceInfo(webviewToRespond, { items: allRefs });
        }
      } catch (e) {
        console.warn('[AgentLoopManager] Failed to send reference info:', e);
      }

      // 파일 변경 요약 제거 — Turn Actions(Undo/Keep)에서 이미 동일 정보 표시

      break;
    }

    // ─── Post-loop: Turn actions display ───
    try {
      const diffMgr = InlineDiffManager.getInstance();
      const turnStats = diffMgr.getPendingChangesByTurn();
      if (turnStats.length > 0) {
        webviewToRespond.postMessage({ command: 'showTurnActions', turns: turnStats });
      }
    } catch (e) {
      console.warn('[AgentLoopManager] showTurnActions failed:', e);
    }

    // ─── Post-loop: Save session entry ───
    if (options.extensionContext) {
      try {
        const { SessionManager } = await import("../state/SessionManager");
        const sessionManager = SessionManager.getInstance(options.extensionContext);
        const currentSession = sessionManager.getCurrentSession();

        if (currentSession) {
          const finalSummary = (createdFiles.length > 0 || modifiedFiles.length > 0)
            ? `${createdFiles.length > 0 ? `생성된 파일: ${createdFiles.join(", ")}\n` : ""}${modifiedFiles.length > 0 ? `수정된 파일: ${modifiedFiles.join(", ")}` : ""}`
            : "";

          console.log(`[AgentLoopManager] Saving AGENT mode entry - userQuery: "${userQuery?.substring(0, 50)}..."`);
          await sessionManager.addConversationEntry(currentSession.id, {
            id: `conv_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
            timestamp: Date.now(),
            userRequest: userQuery || "",
            assistantResponse: finalSummary,
            actions: collectedActions as any,
            filesCreated: createdFiles,
            filesModified: modifiedFiles,
            uiMessages: collectedUIMessages,
            result: "success",
            model: options.currentModelType,
          });
          console.log(`[AgentLoopManager] AGENT mode entry saved successfully`);
        }
      } catch (e) {
        console.warn("[AgentLoopManager] Failed to save AGENT mode entry:", e);
      }

      // Prompt Suggestions (설정으로 on/off)
      const promptSuggestionEnabled = vscode.workspace.getConfiguration('codepilot-standalone')
        .get<boolean>('promptSuggestion', false);
      if (!promptSuggestionEnabled) {
        console.log('[AgentLoopManager] Prompt suggestions disabled by setting');
      } else try {
        const { PromptSuggestionService } = await import("../suggestion/PromptSuggestionService");
        const suggestionService = PromptSuggestionService.getInstance(this.llmManager);
        const suggestions = await suggestionService.generateSuggestions(
          userQuery || '',
          createdFiles,
          modifiedFiles,
          '',
        );
        if (suggestions.length > 0 && webviewToRespond) {
          webviewToRespond.postMessage({
            command: 'showSuggestions',
            suggestions,
          });
        }
      } catch (e) {
        console.warn("[AgentLoopManager] Prompt suggestions failed:", e);
      }

      // Session Memory auto-extraction
      try {
        const { SessionMemoryExtractor } = await import("../../memory/SessionMemoryExtractor");
        const extractor = SessionMemoryExtractor.getInstance(this.llmManager);
        const compactorForExtraction = ConversationCompactor.getInstance(this.llmManager);
        const extractionTokens = compactorForExtraction.calculateTotalTokens(accumulatedUserParts, activeSystemPrompt);
        if (extractor.shouldExtract(extractionTokens, turnCount)) {
          const summary = compactorForExtraction.getLastSummary();
          if (summary) {
            await extractor.extractAndSave(summary, turnCount);
          }
        }
      } catch (e) {
        console.warn("[AgentLoopManager] Session memory extraction failed:", e);
      }

      // AutoDream: increment session counter and check for consolidation
      try {
        const { AutoDreamService } = await import("../../memory/AutoDreamService");
        const dreamService = AutoDreamService.getInstance(this.llmManager);
        dreamService.onSessionComplete();
        if (dreamService.shouldConsolidate()) {
          // Run in background (don't block the UI)
          dreamService.consolidate().catch(e =>
            console.warn("[AgentLoopManager] AutoDream consolidation failed:", e)
          );
        }
      } catch (e) {
        console.warn("[AgentLoopManager] AutoDream check failed:", e);
      }
    }

    // Commit transaction
    txnMgr.commit();

    // Final processing step
    WebviewBridge.sendProcessingStep(webviewToRespond, "done");

    } catch (error) {
      // Transaction rollback on error
      try { txnMgr.commit(); } catch {}
      throw error;
    }
  }

  // ─── Private Helpers ───

  /**
   * Execute tools and collect results, mirroring ConversationManager.executeToolsWithUI
   * but simplified for AGENT mode (all tools allowed, no plan mode checks).
   */
  private async executeTools(
    toolExecutor: ToolExecutor,
    toolCalls: ToolUse[],
    webview: vscode.Webview,
    actionManager: ActionManager,
    executionManager: ExecutionManager,
    terminalManager: TerminalManager,
    collectedUIMessages: CollectedUIMessage[],
    preloadedFiles: Set<string>,
    alreadyStattedFiles: Set<string>,
    createdFiles: string[],
    modifiedFiles: string[],
    conversationTurnId: string,
    executedCommands: string[],
    abortSignal?: AbortSignal,
  ): Promise<{
    toolResults: ToolResponse[];
    hasSuccessfulExecution: boolean;
    hasWriteToolExecution: boolean;
  }> {
    const currentProject = ProjectManager.getInstance().getCurrentProject();
    const workspaceRoot = currentProject?.root || "";

    // Settings for auto-execution
    const settingsManager = SettingsManager.getInstance();
    const isAutoToolEnabled = await settingsManager.isAutoToolExecutionEnabled();
    const isAutoCommandEnabled = await settingsManager.isAutoExecuteCommandsEnabled();
    const isAutoUpdateEnabled = await settingsManager.isAutoUpdateEnabled();
    const isAutoDeleteFilesEnabled = await settingsManager.isAutoDeleteFilesEnabled();

    // Approval filtering
    const approvedToolCalls: ToolUse[] = [];
    const skippedToolResults: ToolResponse[] = [];

    for (const call of toolCalls) {
      // cross-turn duplicate stat_file → skip
      if (call.name === Tool.STAT_FILE && call.params.path && alreadyStattedFiles.has(call.params.path)) {
        skippedToolResults.push({
          success: true,
          message: `[이미 조회됨] ${call.params.path}는 이전 턴에서 이미 stat_file로 조회했습니다.`,
        });
        continue;
      }

      const needsConfirmation = this.checkToolNeedsConfirmation(
        call, isAutoToolEnabled, isAutoCommandEnabled, isAutoUpdateEnabled, isAutoDeleteFilesEnabled,
      );

      if (needsConfirmation) {
        const userApproved = await this.requestToolApproval(call, webview);
        if (userApproved) {
          approvedToolCalls.push(call);
        } else {
          skippedToolResults.push({
            success: false,
            message: "Tool execution rejected by user.",
            error: { code: "USER_REJECTED", message: "Tool execution rejected by user" },
          });
          WebviewBridge.receiveMessage(webview, "System",
            `[Skipped] ${ToolExecutionCoordinator.getToolLabel(call.name)}: User rejected`);
        }
      } else {
        approvedToolCalls.push(call);
      }
    }

    // Execute approved tools
    const ctx: ToolExecutionContext = {
      projectRoot: workspaceRoot,
      workspaceRoot,
      actionManager,
      executionManager,
      terminalManager,
      contextManager: this.contextManager,
      conversationTurnId,
      isAgentMode: true,
      webview,
    };

    let toolResults: ToolResponse[] = [];
    let hasSuccessfulExecution = false;
    let hasWriteToolExecution = false;

    if (approvedToolCalls.length > 0) {
      toolResults = await toolExecutor.executeTools(
        approvedToolCalls, ctx, undefined, undefined, abortSignal,
      );

      // Track results
      for (let i = 0; i < approvedToolCalls.length; i++) {
        const call = approvedToolCalls[i];
        const result = toolResults[i];

        if (result?.success) {
          hasSuccessfulExecution = true;

          // Track file changes
          if (call.name === Tool.CREATE_FILE && call.params.path) {
            if (!createdFiles.includes(call.params.path)) {
              createdFiles.push(call.params.path);
            }
            hasWriteToolExecution = true;
          }
          if (call.name === Tool.UPDATE_FILE && call.params.path) {
            if (!modifiedFiles.includes(call.params.path)) {
              modifiedFiles.push(call.params.path);
            }
            hasWriteToolExecution = true;
          }
          if (call.name === Tool.REMOVE_FILE && call.params.path) {
            hasWriteToolExecution = true;
          }
          if (call.name === Tool.RUN_COMMAND && call.params.command) {
            executedCommands.push(call.params.command);
            hasWriteToolExecution = true;
          }

          // Track preloaded files
          if (call.name === Tool.READ_FILE && call.params.path) {
            preloadedFiles.add(call.params.path);
          }
          if (call.name === Tool.STAT_FILE && call.params.path) {
            alreadyStattedFiles.add(call.params.path);
          }
        }

        // Send tool result to UI (skip work_plan — displayed in task queue only)
        if (call.name !== Tool.WORK_PLAN) {
          const uiMsgs = ToolExecutionCoordinator.sendSingleToolResultToUI(webview, call, result);
          collectedUIMessages.push(...uiMsgs);
        }
      }
    }

    // Merge skipped results
    toolResults = [...skippedToolResults, ...toolResults];

    return { toolResults, hasSuccessfulExecution, hasWriteToolExecution };
  }

  /**
   * Trim accumulated parts to prevent memory leak (mirrors ConversationManager.trimAccumulatedParts)
   */
  private trimAccumulatedParts(parts: UserPart[]): UserPart[] {
    // 1. Limit item count
    if (parts.length > AgentConfig.MAX_ACCUMULATED_PARTS) {
      console.log(
        `[AgentLoopManager] Trimming parts: ${parts.length} → ${AgentConfig.ACCUMULATED_PARTS_TRIM_TARGET}`,
      );
      const firstPart = parts[0];
      const recentParts = parts.slice(-AgentConfig.ACCUMULATED_PARTS_TRIM_TARGET + 1);
      parts = [firstPart, ...recentParts];
    }

    // 2. Deduplicate read_file results
    const fileReadPattern = /\[Tool: read_file\][\s\S]*?File:\s*([^\n]+)/;
    const lastReadIndex = new Map<string, number>();
    for (let i = parts.length - 1; i >= 0; i--) {
      const text = parts[i]?.text;
      if (!text) continue;
      const match = text.match(fileReadPattern);
      if (match) {
        const filePath = match[1].trim();
        if (!lastReadIndex.has(filePath)) {
          lastReadIndex.set(filePath, i);
        }
      }
    }
    let dedupeCount = 0;
    for (let i = 0; i < parts.length; i++) {
      const text = parts[i]?.text;
      if (!text) continue;
      const match = text.match(fileReadPattern);
      if (match) {
        const filePath = match[1].trim();
        const lastIdx = lastReadIndex.get(filePath);
        if (lastIdx !== undefined && lastIdx !== i) {
          parts[i] = { text: `[이전 read_file 결과 생략: ${filePath} — 최신 결과가 아래에 있음]` };
          dedupeCount++;
        }
      }
    }
    if (dedupeCount > 0) {
      console.log(`[AgentLoopManager] Deduped ${dedupeCount} duplicate read_file results`);
    }

    // 3. Limit individual part text length
    for (const part of parts) {
      if (part.text && part.text.length > AgentConfig.MAX_PART_TEXT_LENGTH) {
        part.text = part.text.substring(0, AgentConfig.PART_TEXT_TRIM_LENGTH) +
          '\n\n... [내용이 너무 길어 일부가 생략되었습니다] ...';
      }
    }

    return parts;
  }

  /**
   * Check if a tool call needs user confirmation
   */
  private checkToolNeedsConfirmation(
    call: ToolUse,
    isAutoToolEnabled: boolean,
    isAutoCommandEnabled: boolean,
    isAutoUpdateEnabled: boolean,
    isAutoDeleteFilesEnabled: boolean,
  ): boolean {
    if (!isAutoToolEnabled) return true;

    switch (call.name) {
      case Tool.RUN_COMMAND:
        return !isAutoCommandEnabled;
      case Tool.UPDATE_FILE:
        return !isAutoUpdateEnabled;
      case Tool.REMOVE_FILE:
        return !isAutoDeleteFilesEnabled;
      case Tool.CREATE_FILE:
        return !isAutoUpdateEnabled;
      default:
        return false; // Read-only tools don't need confirmation
    }
  }

  /**
   * Request user approval for a tool call
   */
  private async requestToolApproval(
    call: ToolUse,
    webview: vscode.Webview,
  ): Promise<boolean> {
    const toolLabel = ToolExecutionCoordinator.getToolLabel(call.name);
    const detail = call.params.path
      ? `: ${(call.params.path as string).substring(0, 60)}`
      : call.params.command
        ? `: ${(call.params.command as string).substring(0, 60)}`
        : '';

    WebviewBridge.receiveMessage(
      webview, 'System', `[Pending] ${toolLabel}${detail} - 사용자 승인 필요`,
    );

    const result = await vscode.window.showInformationMessage(
      `${toolLabel}${detail}`,
      { modal: true },
      '실행',
      '건너뛰기',
    );

    return result === '실행';
  }
}
