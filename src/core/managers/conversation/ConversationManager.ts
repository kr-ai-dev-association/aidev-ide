import * as vscode from "vscode";
import {
  PromptBuilder,
  PromptType,
  PromptBuilderOptions,
} from "../context/PromptBuilder";
import { IConversationHandler } from "./IConversationHandler";
import { ContextManager } from "../context/ContextManager";
import { TaskManager } from "../task/TaskManager";
import { LLMManager } from "../model/LLMManager";
import { WebviewBridge } from "../../webview/WebviewBridge";
import { ToolParser } from "../../tools/ToolParser";
import { ToolExecutor } from "../../tools/ToolExecutor";
import { ToolRegistry } from "../../tools/ToolRegistry";
import { ToolExecutionContext } from "../../tools/IToolHandler";
import { StreamingCodeApplier } from "../../tools/StreamingCodeApplier";
import { ActionManager } from "../action/ActionManager";
import { ExecutionManager } from "../execution/ExecutionManager";
import { TerminalManager } from "../terminal/TerminalManager";
import { Tool } from "../../tools/types";
import { ToolSpecBuilder } from "../../tools/ToolSpecBuilder";
import { ProjectManager } from "../project/ProjectManager";
import { InvestigationManager } from "../investigation/InvestigationManager";
import { SettingsManager } from "../state/SettingsManager";
import { StateManager } from "../state/StateManager";
import { UsageMetricsManager } from "../state/UsageMetricsManager";
import { AiModelType, OllamaApi } from "../../../services";
import type { NotificationService } from "../../../services";
import { AgentStateManager, AgentPhase } from "./AgentStateManager";
import { getSimpleSummaryPrompt } from "../context/prompts/task";
import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as path from "path";
import { TestRunner } from "./handlers/TestRunner";
import { ResponseProcessor } from "./handlers/ResponseProcessor";
import { ToolExecutionCoordinator } from "./handlers/ToolExecutionCoordinator";
// OutputValidator는 handlers/OutputValidator.ts에서 독립적으로 사용 가능
import { AgentConfig } from "../../config/AgentConfig";
import { InlineDiffManager } from "../diff/InlineDiffManager";
import { HotLoadManager } from "../hotload/HotLoadManager";
import { MemoryManager } from "../../memory/MemoryManager";
import { PromptComposer } from "../context/prompts/PromptComposer";
import { FetchUrlToolHandler } from "../../tools/web/FetchUrlToolHandler";
import { StringUtils } from "../../utils/StringUtils";
import { getExecutionPhasePrompt } from "../context/prompts/phase";
import { resetAgentTaskManager } from "../../tools/agent/SpawnAgentToolHandler";
import { resetWorkPlan } from "../../tools/agent/WorkPlanToolHandler";
import {
  getExecutionFirstRulePrompt,
  getTestRetryExceededMessage,
  getInvestigationNudgePrompt,
  getExecutionNudgePrompt,
  getInvestigationTextOnlyWarningPrompt,
  getExecutionOutputContractViolationPrompt,
  getFsmViolationInvestigationInExecutionPrompt,
  getCodeModifyRequiresFileToolPrompt,
  getPhaseToolRestrictionPrompt,
  getCreateFileContentMissingPrompt,
  getValidationCommandInferencePrompt,
  getExecutionPhaseContextPrompt,
  getInvestigationToolResultFollowupPrompt,
  getExecutionNoToolCallWarningPrompt,
} from "../context/prompts/rules";
import { RetryCoordinator } from "./handlers/RetryCoordinator";
import { FileChangeHandler } from "./handlers/FileChangeHandler";

import { LoopStateTracker } from "./handlers/LoopStateTracker";
import { ContextGatherer } from "./handlers/ContextGatherer";
import { getGeneralAnalysisPrompt } from "../context/prompts/analysis/generalAnalysis";
import { ConversationCompactor } from "./ConversationCompactor";
import { AgentLoopManager } from "./AgentLoopManager";
import { MODEL_TOKEN_LIMITS } from "../../../utils/tokenUtils";
import { estimateTokens } from "../../../utils";
import {
  TurnContext,
  TurnAction,
  LoopState,
  UserPart,
  CollectedAction,
  CollectedUIMessage,
} from "./types/TurnContext";
import { IntentDetectionResult } from "../action/IntentDetector";
import {
  ToolUse,
  ToolResponse,
  READ_ONLY_TOOLS,
  AGENT_ONLY_TOOLS,
} from "../../tools/types";
import { FileTransactionManager } from "../action/file/FileTransactionManager";
import * as crypto from "crypto";

export interface ConversationOptions {
  userQuery: string;
  webviewToRespond: vscode.Webview;
  promptType: PromptType;
  abortSignal?: AbortSignal;
  imageData?: string;
  imageMimeType?: string;
  selectedFiles?: string[];
  selectedCode?: string; // 에디터에서 선택된 코드 (RAG 쿼리 보강용)
  terminalContext?: string;
  diagnosticsContext?: string;
  extensionContext?: vscode.ExtensionContext;
  ollamaApi?: OllamaApi;
  currentModelType?: AiModelType;
  userOS?: string;
  notificationService?: NotificationService;
}

/**
 * gatherContext 반환 타입
 */
export interface GatheredContext {
  codebaseContext?: string;
  realTimeInfo?: string;
  profileContext?: string;
  intentContext: string;
  gitContext: string;
  languageInstruction: string;
  selectedFilesContent: string;
  terminalContextContent: string;
  diagnosticsContextContent: string;
  frameworkRulesPrompt: string;
  ragContext: string;
  subProjectStructure?: string;
  repoMap?: string;
}

// AgentPhase는 AgentStateManager에서 import

/**
 * 대화 및 에이전트 루프를 관리하는 매니저
 */
export class ConversationManager implements IConversationHandler {
  private static instance: ConversationManager;
  private promptBuilder: PromptBuilder;
  private contextManager: ContextManager;
  private llmManager: LLMManager;
  private responseProcessor: ResponseProcessor;
  private currentAbortController: AbortController | null = null;
  private stateManager: StateManager | null = null;
  private _retryGaveUp = false; // RetryCoordinator가 동일 에러 반복으로 포기한 경우
  private _isAgentMode = false; // AGENT 모드 플래그 (dispatch 및 finally에서 참조)
  private deletedFiles: string[] = []; // 파일 삭제 추적 (import 정리용)
  private _pendingImportCleanupMsg: string | null = null; // 삭제 후 import 정리 메시지
  private _pendingTokenInfo: { tokens: number; model?: string } | null = null; // CODE 모드 토큰 누적
  private loopStateTracker = new LoopStateTracker();
  private contextGatherer!: ContextGatherer;

  private constructor(userOS: string, ollamaApi: OllamaApi) {
    this.promptBuilder = new PromptBuilder(userOS, AiModelType.OLLAMA);
    this.contextManager = ContextManager.getInstance();
    this.llmManager = LLMManager.getInstance(ollamaApi);
    this.responseProcessor = new ResponseProcessor(this.llmManager);
    this.contextGatherer = new ContextGatherer(
      this.contextManager,
      this.llmManager,
    );
  }

  public static getInstance(
    userOS: string = process.platform,
    ollamaApi?: OllamaApi,
  ): ConversationManager {
    if (!ConversationManager.instance) {
      if (!ollamaApi) {
        throw new Error(
          "ConversationManager requires OllamaApi for initial creation",
        );
      }
      ConversationManager.instance = new ConversationManager(userOS, ollamaApi);
    }
    return ConversationManager.instance;
  }

  // ─── 싱글톤 상태 격리 (테스트용) ───

  /**
   * 싱글톤 인스턴스 리셋 (테스트 환경 전용)
   * 프로덕션에서는 사용하지 않음
   */
  public static resetInstance(): void {
    if (process.env.NODE_ENV === "test" || process.env.VSCODE_TEST) {
      ConversationManager.instance =
        undefined as unknown as ConversationManager;
    } else {
      // non-test environment - ignored
    }
  }

  /**
   * 격리된 인스턴스 생성 (테스트 환경 전용)
   * 싱글톤과 독립적인 인스턴스를 반환
   */
  public static createIsolatedInstance(
    userOS: string,
    ollamaApi: OllamaApi,
  ): ConversationManager {
    if (process.env.NODE_ENV !== "test" && !process.env.VSCODE_TEST) {
      // non-test environment warning suppressed
    }
    return new ConversationManager(userOS, ollamaApi);
  }

  // extension.ts 호환성을 위한 Setter 메서드들 (레거시, 대부분 no-op)
  public setLLMService(
    service: { getCurrentModel?: () => AiModelType } | null,
  ): void {
    if (service && typeof service.getCurrentModel === "function") {
      const model = service.getCurrentModel();
      this.llmManager.setCurrentModel(model);
      this.promptBuilder.setModelType(model);
    }
  }
  public setPromptBuilder(builder: PromptBuilder): void {
    this.promptBuilder = builder;
  }
  public setStateManager(stateManager: StateManager): void {
    this.stateManager = stateManager;
    this.contextGatherer.setStateManager(stateManager);
    console.log(
      "[ConversationManager] StateManager configured for model routing",
    );
  }

  /**
   * 현재 진행 중인 LLM 호출을 취소합니다
   */
  public cancelCurrentCall(): void {
    if (this.currentAbortController) {
      console.log("[ConversationManager] Cancelling current LLM call...");
      this.currentAbortController.abort();
      this.currentAbortController = null;
    }
  }

  /**
   * 사용자의 메시지를 처리하고 응답을 생성하는 메인 엔트리 포인트
   */
  public async handleUserMessageAndRespond(
    options: ConversationOptions,
  ): Promise<void> {
    const { webviewToRespond, extensionContext } = options;

    const userQuery = options.userQuery;

    // 새 AbortController 생성 (이전 요청이 있으면 취소)
    if (this.currentAbortController) {
      this.currentAbortController.abort();
    }
    this.currentAbortController = new AbortController();
    const abortSignal =
      options.abortSignal || this.currentAbortController.signal;

    // options에 abortSignal 추가 (내부 메서드들이 사용)
    const optionsWithAbort: ConversationOptions = {
      ...options,
      abortSignal,
    };

    try {
      // 1. 초기화 및 준비
      this.contextGatherer.prepareUI(webviewToRespond);

      TestRunner.clearSubProjectCache();
      PromptComposer.clearTouchedFiles();
      this._retryGaveUp = false;

      // 탈출 시도 카운터 리셋 (새 대화 시작)
      this.loopStateTracker.resetEscapeCount();

      // v9.4.0: 파일 트랜잭션 시작 (롤백 지원)
      const fileTransactionManager = FileTransactionManager.getInstance();
      fileTransactionManager.beginTransaction({
        userQuery: options.userQuery,
        source: "conversation",
      });

      // 세션 히스토리 정리 체크 (LLM 요약 없이 오래된 항목 제거)
      if (extensionContext) {
        const { SessionManager } = await import("../state/SessionManager");
        const sessionManager = SessionManager.getInstance(extensionContext);

        // SESSION_TRIM_THRESHOLD 초과 시 SESSION_TRIM_TARGET만 유지 (구조화된 메타데이터라 용량 적음)
        if (
          sessionManager.needsSessionTrim(AgentConfig.SESSION_TRIM_THRESHOLD)
        ) {
          sessionManager.trimSessionHistory(AgentConfig.SESSION_TRIM_TARGET);
          console.log(
            "[ConversationManager] Session history trimmed (no LLM cost)",
          );
        }
      }

      // 모델 설정 업데이트
      if (options.currentModelType) {
        this.llmManager.setCurrentModel(options.currentModelType);
        this.promptBuilder.setModelType(options.currentModelType);

        console.log(
          `[ConversationManager] LLM model updated to: ${options.currentModelType}`,
        );
      }

      // 2. Hot Load 항목 로드 (Intent Detection에 전달)
      let hotLoadItems: any[] = [];
      try {
        const hotLoadManager = HotLoadManager.getInstance();
        hotLoadItems = await hotLoadManager.getAllHotLoads();
        if (hotLoadItems.length > 0) {
          console.log(
            `[ConversationManager] Hot Load items loaded: ${hotLoadItems.length} items`,
          );
        }
      } catch (error: any) {
        console.warn(
          `[ConversationManager] Failed to load Hot Load items: ${error?.message || error}`,
        );
      }

      // Skill Registry 사전 로드 (IntentDetector가 skill descriptions를 참조하기 위해)
      try {
        await PromptComposer.ensureServerSettingsSynced();
        PromptComposer.loadAgentRulesWithKeys(); // skill registry 채움
        PromptComposer.loadServerPromptTemplates(new Set()); // 서버 skill도 registry에 등록
      } catch {
        /* registry 로드 실패해도 intent 진행 */
      }

      // 3. 의도 파악 (Hot Load 항목 포함하여 LLM이 의미론적 매칭, main: contextGatherer 경유)
      const intent = await this.contextGatherer.detectIntent(
        userQuery,
        hotLoadItems,
      );

      // 4. 컨텍스트 수집
      const context = await this.contextGatherer.gatherContext(
        optionsWithAbort,
        intent,
      );

      // 5. 시스템 프롬프트 생성
      // Hot Load 프롬프트: 매칭된 경우 인자 추출 프롬프트, 아니면 전체 목록
      let hotLoadPrompt = "";
      try {
        const hotLoadManager = HotLoadManager.getInstance();
        if (intent.hotLoadMatch) {
          // 매칭됨 → 인자 추출 가이드 포함 프롬프트
          // (IntentDetectionResult.hotLoadMatch 는 HotLoadItemForIntent; HotLoadManager
          //  의 HotLoadItem 과 구조 호환이나 명목 타입이 달라 캐스트 — 1476행과 동일 패턴)
          hotLoadPrompt = hotLoadManager.getMatchedPromptSection(
            intent.hotLoadMatch as any,
            userQuery,
          );
          console.log(
            `[ConversationManager] Hot Load matched: ${intent.hotLoadMatch.keywords} → argument extraction prompt injected`,
          );
        } else {
          // 매칭 안됨 → 전체 목록 프롬프트
          hotLoadPrompt = await hotLoadManager.getPromptSection();
          if (hotLoadPrompt) {
            console.log(
              `[ConversationManager] Hot Load prompt loaded (${hotLoadPrompt.length} chars)`,
            );
          }
        }
      } catch (error) {
        console.warn(
          "[ConversationManager] Failed to load Hot Load prompt:",
          error,
        );
      }

      // 영속적 메모리 컨텍스트 로드
      let memoryContext = "";
      try {
        memoryContext = await MemoryManager.getInstance().loadForPrompt();
      } catch {
        /* 메모리 로드 실패 시 무시 */
      }

      // MCP 커스텀 프롬프트 수집
      const mcpCustomPrompts = this.contextGatherer.collectMcpCustomPrompts();

      // URL 자동 감지 + fetch (HotLoad 전용 짧은 메시지는 제외)
      const autoFetchedUrlContents = await this.extractAndFetchUrls(
        userQuery,
        webviewToRespond,
        hotLoadPrompt,
      );

      // 서버 설정 동기화 완료 대기 (시작 직후 sync 미완료 방지)
      try {
        const settingsManager = SettingsManager.getInstance();
        await settingsManager.waitForSync();
      } catch {
        /* 초기화 전이면 무시 */
      }

      // 네이티브 모드 여부 (시스템 프롬프트 형식 결정)
      let isNativeMode = false;
      try {
        const isNativeEnabled = optionsWithAbort.extensionContext
          ? await SettingsManager.getInstance(
              optionsWithAbort.extensionContext,
            ).isNativeToolCallingEnabled()
          : false;
        if (
          isNativeEnabled &&
          optionsWithAbort.currentModelType === AiModelType.ADMIN
        ) {
          const adminConfig = this.llmManager.getAdminModelConfig();
          isNativeMode =
            adminConfig?.nativeToolCallingSupported === true ||
            String(adminConfig?.nativeToolCallingSupported) === "true";
        }
      } catch {
        /* 설정 읽기 실패 시 기본값 사용 */
      }

      const promptOptions: PromptBuilderOptions = {
        userOS: optionsWithAbort.userOS || process.platform,
        modelType: optionsWithAbort.currentModelType || AiModelType.OLLAMA,
        promptType: optionsWithAbort.promptType,
        hotLoadPrompt, // Hot Load 프롬프트 추가
        memoryContext, // 영속적 메모리 컨텍스트 추가
        mcpCustomPrompts, // MCP 커스텀 프롬프트 추가
        activeSkillKeys: intent.requiredSkillKeys, // IntentDetector가 선택한 스킬
        nativeMode: isNativeMode, // 네이티브 Function Call 모드
        ...context,
      };
      const systemPrompt =
        this.promptBuilder.generateSystemPrompt(promptOptions);

      // ASK/PLAN에서도 Rule/Skill 참조를 수집 (composeSystemPrompt가 아닌 경로용)
      if (
        optionsWithAbort.promptType === PromptType.GENERAL_ASK ||
        optionsWithAbort.promptType === PromptType.PLAN
      ) {
        // loadServerPromptTemplates가 이미 호출되었으므로 Rule 참조 수집
        const ruleRefs = PromptComposer.getLastIncludedServerRuleKeys().map(
          (r: { key: string; title: string }) => ({
            type: "server_rule" as const,
            name: r.title,
            source: "server" as const,
          }),
        );
        const skillRefs = (intent.requiredSkillKeys || []).map(
          (key: string) => ({
            type: "server_skill" as const,
            name: key,
            source: "server" as const,
          }),
        );
        if (ruleRefs.length > 0 || skillRefs.length > 0) {
          const prevRefs = PromptComposer.getLastReferences();
          const newRefs = [...ruleRefs, ...skillRefs];
          for (const ref of newRefs) {
            if (
              !prevRefs.some((r) => r.type === ref.type && r.name === ref.name)
            ) {
              prevRefs.push(ref);
            }
          }
          // @ts-ignore - _lastReferences 직접 설정
          PromptComposer["_lastReferences"] = prevRefs;
        }
      }

      // 컨텍스트 참조 채팅 알림 (RAG 알림과 동일 패턴)
      if (webviewToRespond) {
        // Rules
        const includedRules = PromptComposer.getLastIncludedServerRuleKeys();
        if (includedRules.length > 0) {
          const ruleNames = includedRules.map((r) => r.title).slice(0, 5);
          WebviewBridge.receiveMessage(
            webviewToRespond,
            "System",
            `📋 [Rules] ${ruleNames.join(", ")}`,
          );
        }
        // Skills
        const skillRegistry = PromptComposer.getSkillRegistry();
        const activeSkills = (intent.requiredSkillKeys || []).filter(
          (k: string) => skillRegistry.has(k),
        );
        if (activeSkills.length > 0) {
          WebviewBridge.receiveMessage(
            webviewToRespond,
            "System",
            `🧩 [Skills] ${activeSkills.join(", ")}`,
          );
        }
        // MCP 라벨은 dispatch 단계에서 emit 하지 않음 — 등록만 되고 실제 호출
        // 안 된 경우에도 매번 표시되는 노이즈를 방지. 실제 MCP tool 이 성공
        // 실행되는 시점에 MCPToolHandler.execute() 가 라벨을 송출함.
      }

      // 5. 작업 타입에 따른 실행 분기
      if (optionsWithAbort.promptType === PromptType.AGENT) {
        // AGENT 모드: AgentLoopManager로 디스패치 (FSM 없는 순수 자율 루프)
        const userParts = await this.buildUserPartsWithUrlsAndHistory(
          userQuery,
          autoFetchedUrlContents,
          optionsWithAbort,
        );
        this._isAgentMode = true;
        resetAgentTaskManager();
        resetWorkPlan();

        // AGENT mode: LLM 자율 탐색 (Claude Code 스타일)
        // ProjectDetector 결과를 주입하지 않음 — LLM이 직접 파일을 읽고 프로젝트 구조를 파악
        // 워크스페이스 루트 경로만 제공
        const wsRoot = options.extensionContext
          ? (await import("vscode")).workspace.workspaceFolders?.[0]?.uri
              .fsPath || ""
          : "";
        if (wsRoot) {
          userParts.push({
            text: `[System] 워크스페이스: ${wsRoot}\n프로젝트 구조를 파악하려면 list_files, glob_search, read_file을 사용하세요. 필요한 파일만 선택적으로 탐색하세요.`,
          });
        }

        const agentLoop = new AgentLoopManager(this.llmManager);
        await agentLoop.execute(optionsWithAbort, systemPrompt, userParts);
        return;
      }

      if (
        optionsWithAbort.promptType === PromptType.CODE_GENERATION ||
        optionsWithAbort.promptType === PromptType.PLAN
      ) {
        // CODE/PLAN 모드: 기존 FSM 기반 에이전트 루프
        const userParts = await this.buildUserPartsWithUrlsAndHistory(
          userQuery,
          autoFetchedUrlContents,
          optionsWithAbort,
        );
        await this.executeAgentLoop(
          systemPrompt,
          userParts,
          optionsWithAbort,
          intent,
          context,
        );
      } else {
        // ASK 모드: 이전 대화 컨텍스트 포함
        const userParts = await this.buildUserPartsWithHistory(
          userQuery,
          optionsWithAbort,
        );
        // ASK 모드에도 URL 자동 감지 내용 추가
        if (autoFetchedUrlContents.length > 0) {
          for (const fetched of autoFetchedUrlContents) {
            userParts.push({
              text: `\n--- 자동 가져온 URL: ${fetched.url} ---\n${fetched.content}\n--- URL 내용 끝 ---`,
            });
          }
        }
        await this.handleGeneralAsk(systemPrompt, userParts, optionsWithAbort);
      }
    } catch (error: unknown) {
      this.handleError(error, webviewToRespond);
    } finally {
      // AGENT 모드: 스트리밍 커서가 남아있을 수 있으므로 확실히 닫기
      if (this._isAgentMode) {
        WebviewBridge.endStreamingMessage(webviewToRespond);
      }
      WebviewBridge.hideLoading(webviewToRespond);
    }
  }

  /**
   * ASK 모드에서 이전 대화 컨텍스트를 포함한 userParts 생성
   * 구조화된 메타데이터에서 컨텍스트 추출
   */
  private async buildUserPartsWithHistory(
    currentQuery: string,
    options: ConversationOptions,
  ): Promise<UserPart[]> {
    const userParts: UserPart[] = [];

    if (options.extensionContext) {
      try {
        const { SessionManager } = await import("../state/SessionManager");
        const sessionManager = SessionManager.getInstance(
          options.extensionContext,
        );
        const currentSession = sessionManager.getCurrentSession();

        if (currentSession && currentSession.conversationHistory.length > 0) {
          // 최근 대화 히스토리 (구조화된 메타데이터)
          const history = currentSession.conversationHistory.slice(
            -AgentConfig.MAX_HISTORY_ENTRIES,
          );

          // 이전 대화를 간결한 컨텍스트로 추가
          for (const entry of history) {
            // 구조화된 형식에서 컨텍스트 추출
            const actions =
              entry.actions && entry.actions.length > 0
                ? ` [Actions: ${entry.actions.map((a) => `${a.type}${a.file ? ":" + a.file : ""}`).join(", ")}]`
                : "";
            // assistantResponse가 있으면 사용, 없으면 파일 변경 정보 또는 '작업 완료'
            const response = entry.assistantResponse
              ? entry.assistantResponse.slice(
                  0,
                  AgentConfig.MAX_HISTORY_ACTION_PREVIEW_LENGTH,
                )
              : entry.filesCreated || entry.filesModified
                ? "파일 변경 완료"
                : "작업 완료";
            userParts.push({
              text: `[User]: ${entry.userRequest}${actions}\n[Assistant]: ${response}`,
            });
          }
        }
      } catch (error) {
        console.warn(
          "[ConversationManager] Failed to load conversation history:",
          error,
        );
      }
    }

    // 현재 질문 추가
    userParts.push({ text: `[User]: ${currentQuery}` });

    return userParts;
  }

  // ─── URL 자동 감지 ───

  /** URL 정규식 */
  private static readonly URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/g;

  /**
   * 사용자 메시지에서 URL을 추출하고 내용을 자동으로 가져옴
   * HotLoad 전용 짧은 메시지(키워드만)는 건너뜀
   */
  private async extractAndFetchUrls(
    userQuery: string,
    webview: vscode.Webview,
    hotLoadPrompt: string,
  ): Promise<{ url: string; content: string }[]> {
    try {
      // HotLoad 의도인 짧은 메시지는 URL fetch 건너뜀
      const shouldSkip =
        hotLoadPrompt.length > 0 && userQuery.split(/\s+/).length <= 5;
      if (shouldSkip) {
        return [];
      }

      const matches = userQuery.match(ConversationManager.URL_REGEX);
      if (!matches || matches.length === 0) {
        return [];
      }

      // 중복 제거
      const uniqueUrls = [...new Set(matches)];

      // 최대 3개까지만 처리
      const urlsToFetch = uniqueUrls.slice(0, 3);

      console.log(
        `[ConversationManager] URL ${urlsToFetch.length}개 감지 - 내용 가져오는 중...`,
      );
      WebviewBridge.sendProcessingStatus(
        webview,
        "context",
        `URL ${urlsToFetch.length}개 감지 - 내용 가져오는 중...`,
      );

      // 병렬 fetch
      const results = await Promise.allSettled(
        urlsToFetch.map(async (url) => {
          const { content } = await FetchUrlToolHandler.fetchAndExtract(url);
          return { url, content };
        }),
      );

      const fetched: { url: string; content: string }[] = [];
      const failed: string[] = [];
      for (const result of results) {
        if (result.status === "fulfilled") {
          fetched.push(result.value);
        } else {
          // 실패한 URL 추적
          const reason =
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason);
          failed.push(reason);
        }
      }

      if (fetched.length > 0) {
        console.log(
          `[ConversationManager] URL ${fetched.length}개 내용 가져오기 완료`,
        );
      }

      // 실패한 URL이 있으면 사용자에게 알림
      if (failed.length > 0) {
        console.warn(
          `[ConversationManager] URL ${failed.length}개 가져오기 실패:`,
          failed,
        );
        WebviewBridge.receiveMessage(
          webview,
          "System",
          `⚠️ 일부 URL을 가져오지 못했습니다 (${failed.length}개 실패)`,
        );
      }

      return fetched;
    } catch (error) {
      console.warn("[ConversationManager] URL auto-fetch failed:", error);
      return [];
    }
  }

  /**
   * userParts에 이전 대화 히스토리와 자동 fetch된 URL 내용을 포함하여 구성
   * v9.5.0: AGENT 모드에서도 이전 대화 컨텍스트 포함
   */
  private async buildUserPartsWithUrlsAndHistory(
    userQuery: string,
    autoFetchedUrlContents: { url: string; content: string }[],
    options: ConversationOptions,
  ): Promise<UserPart[]> {
    const userParts: UserPart[] = [];

    // 이전 대화 히스토리 추가 (대화 연속성 유지)
    if (options.extensionContext) {
      try {
        const { SessionManager } = await import("../state/SessionManager");
        const sessionManager = SessionManager.getInstance(
          options.extensionContext,
        );
        const currentSession = sessionManager.getCurrentSession();

        if (currentSession && currentSession.conversationHistory.length > 0) {
          // Cross-session continuation: inject compacted summary from previous sessions
          if (
            currentSession.compactedSummaries &&
            currentSession.compactedSummaries.length > 0
          ) {
            const lastSummary =
              currentSession.compactedSummaries[
                currentSession.compactedSummaries.length - 1
              ];
            if (lastSummary && lastSummary.summary) {
              userParts.push({
                text: `[Previous session context]\n${lastSummary.summary}\n[End of previous context]`,
              });
              console.log(
                "[ConversationManager] Injected previous session summary for continuation",
              );
            }
          }

          // 최근 대화 히스토리 (구조화된 메타데이터)
          const history = currentSession.conversationHistory.slice(
            -AgentConfig.MAX_HISTORY_ENTRIES,
          );

          // 이전 대화를 간결한 컨텍스트로 추가
          for (const entry of history) {
            const actions =
              entry.actions && entry.actions.length > 0
                ? ` [Actions: ${entry.actions.map((a) => `${a.type}${a.file ? ":" + a.file : ""}`).join(", ")}]`
                : "";
            // 에러/실패가 포함된 응답은 간략화 (LLM이 이전 실패를 현재 작업으로 오해하는 것 방지)
            let response: string;
            const hasError =
              entry.assistantResponse &&
              /오류|에러|실패|error|fail/i.test(entry.assistantResponse);
            if (hasError) {
              response = `(이전 작업 - 완료)`;
            } else {
              response = entry.assistantResponse
                ? entry.assistantResponse.slice(
                    0,
                    AgentConfig.MAX_HISTORY_ACTION_PREVIEW_LENGTH,
                  )
                : entry.filesCreated || entry.filesModified
                  ? "파일 변경 완료"
                  : "작업 완료";
            }
            const historyText = `[Previous conversation - reference only] User: ${entry.userRequest}${actions}\nAssistant: ${response}`;
            userParts.push({
              text: historyText,
            });
          }
        }
      } catch (error) {
        console.warn(
          "[ConversationManager] Failed to load conversation history for AGENT mode:",
          error,
        );
      }
    } else {
      console.warn(
        "[ConversationManager] extensionContext not available, cannot load history",
      );
    }

    // 현재 질문 추가 (이전 히스토리와 명확히 구분)
    userParts.push({
      text: `[CURRENT REQUEST - This is what the user is asking NOW. Focus ONLY on this request, NOT on previous conversations above.]\n${userQuery}`,
    });

    // URL 내용 추가
    if (autoFetchedUrlContents.length > 0) {
      for (const fetched of autoFetchedUrlContents) {
        userParts.push({
          text: `\n--- 자동 가져온 URL: ${fetched.url} ---\n${fetched.content}\n--- URL 내용 끝 ---`,
        });
      }
    }
    return userParts;
  }

  private async executeAgentLoop(
    systemPrompt: string,
    userParts: UserPart[],
    options: ConversationOptions,
    intent: IntentDetectionResult,
    gatheredContext?: GatheredContext,
  ): Promise<void> {
    // 참고: executionIntent는 더 이상 INVESTIGATION→EXECUTION 전환에 사용되지 않음
    // 실행 도구 자체가 실행 의도의 증거이므로 조건 없이 전환됨
    const { webviewToRespond, abortSignal, userQuery } = options;
    // AGENT mode uses AgentLoopManager and never reaches executeAgentLoop
    const maxTurns = AgentConfig.MAX_TURNS;
    let turnCount = 0;
    let nativeToolCallingNoticeShown = false; // 네이티브 툴 콜링 미지원 안내 한 번만 표시
    // thinking 레벨 설정 (세션 시작 시 1회 로드)
    const thinkingLevel = options.extensionContext
      ? await SettingsManager.getInstance(
          options.extensionContext,
        ).getThinkingLevel()
      : "medium";
    let conversationTurnId = crypto.randomUUID(); // 턴 단위 변경 그룹화용
    let lastExecutionTurnId = conversationTurnId; // 마지막 tool 실행 시의 turnId (review 메시지에 사용)
    let accumulatedUserParts = [...userParts];
    let testFixAttempts = 0; // 테스트 실패 시 자동 수정 시도 횟수
    let pendingRetryPrompt = false; // retry 프롬프트가 LLM에 전달 대기 중인지
    let pendingMCPResultInterpretation = false; // MCP 도구 결과가 LLM 해석 대기 중인지
    const retryCoordinator = new RetryCoordinator();
    // 설정에서 최대 시도 횟수 가져오기 (기본값: retry ON, 5회)
    let maxTestFixAttempts = 5;
    let isAutoTestRetryEnabled = true;
    try {
      maxTestFixAttempts =
        (await SettingsManager.getInstance().getTestRetryCount()) ?? 5;
      isAutoTestRetryEnabled =
        (await SettingsManager.getInstance().isAutoTestRetryEnabled()) ?? true;
    } catch (settingsError) {
      console.warn(
        "[ConversationManager] Failed to load test retry settings, using defaults:",
        settingsError,
      );
    }
    let executionNoToolRetryCount = 0; // EXECUTION phase에서 도구 호출 없이 응답 시 재시도 횟수
    const maxExecutionNoToolRetries = 2; // 최대 재시도 횟수
    let consecutiveEmptyResponses = 0; // thinking-only 등 빈 응답 연속 횟수
    const maxConsecutiveEmptyResponses = 3; // 빈 응답 최대 재시도
    // 같은 명령 반복 실패 추적 (run_command 무한 루프 방지)
    const commandFailureCounts = new Map<string, number>();
    const MAX_SAME_COMMAND_FAILURES = 3;
    let extractedFunctionName: string | null = null; // 사용자 쿼리에서 추출한 함수명 저장

    // 📝 구조화된 메타데이터 수집 (세션 히스토리용)
    const collectedActions: Array<{
      type: string;
      file?: string;
      command?: string;
      result?: string;
    }> = [];
    const collectedUIMessages: Array<{
      sender: "USER" | "CODEPILOT" | "System";
      text: string;
      type?: "action" | "code" | "summary" | "message";
    }> = [];
    let lastAssistantResponse = "";

    // 문제 1 해결: npm install 등 명령어 중복 실행 방지 (전역 추적)
    const recentlyExecutedCommands = new Set<string>(); // 최근 실행된 명령어 추적

    // 자연어 응답 재시도 카운터 리셋
    (this as any).naturalLanguageRetry = 0;

    // Solution 1: 이전 턴에서 도구가 성공적으로 실행됐는지 추적
    // 도구 성공 후 자연어 응답이 오면 "완료"로 처리 (retry 방지)
    let lastTurnHadSuccessfulToolExecution = false;

    const taskManager = TaskManager.getInstance();
    const actionManager = ActionManager.getInstance();
    const executionManager = ExecutionManager.getInstance();
    const terminalManager = TerminalManager.getInstance();
    const investigationManager = InvestigationManager.getInstance();
    const toolExecutor = new ToolExecutor();
    const usageMetrics = UsageMetricsManager.getInstance(); // v9.7.0: 사용량 메트릭

    // ✅ Phase 기준 CODEPILOT 텍스트 송신 제어 함수
    // v8.9.8: EXECUTION 단계에서도 스트리밍 (CODE 블록 → 마크다운 변환)
    const shouldSendCodePilotText = (phase: AgentPhase): boolean => {
      // EXECUTION, REVIEW, DONE phase에서 사용자에게 텍스트를 보여줌
      return (
        phase === AgentPhase.EXECUTION ||
        phase === AgentPhase.REVIEW ||
        phase === AgentPhase.DONE
      );
    };
    // 과거 실행 의도가 있었는지 영속적으로 추적 (plan이 덮어써져도 유지)
    let hasExecutionIntentEver = taskManager
      .listPlanItems()
      .some((item) => item.kind === "execution");
    // intent가 code/execution이면 초기 플래그 설정
    if (
      intent &&
      (intent.category === "execution" || intent.category === "code")
    ) {
      hasExecutionIntentEver = true;
    }
    // 자동 조사 완료 여부 (계획 반복 방지용)
    let autoInvestigationCompleted = false;

    // 1. 초기 페이즈 결정: Plan이 없으면 항상 INVESTIGATION으로 시작
    const currentPlanItems = taskManager.listPlanItems();
    const hasActivePlan = currentPlanItems.some(
      (i) => i.status === "pending" || i.status === "in_progress",
    );

    // 의도가 없거나 단순 인사인 경우만 바로 응답하고 종료
    // 분석(analysis) 요청은 INVESTIGATION 단계로 들어가서 실제 코드베이스를 확인해야 함
    const hasNoIntent =
      !intent ||
      intent.confidence < AgentConfig.MIN_INTENT_CONFIDENCE ||
      (!intent.subtype && !intent.category) ||
      (intent.subtype === null && !intent.category) ||
      (intent.reasoning &&
        intent.reasoning.includes("인사") &&
        intent.confidence < AgentConfig.MIN_GREETING_CONFIDENCE);

    if (hasNoIntent && !hasActivePlan) {
      console.log(
        "[ConversationManager] No clear intent detected or simple greeting. Responding directly without investigation.",
      );

      // 스트리밍 설정 확인
      const isStreamingEnabledForGreeting = options.extensionContext
        ? await SettingsManager.getInstance(
            options.extensionContext,
          ).isStreamingEnabled()
        : false;

      // 인사/간단한 질문 응답용 시스템 프롬프트 (JSON function call 금지)
      const greetingSystemPrompt = `당신은 친절한 AI 코딩 어시스턴트입니다.
사용자의 인사나 간단한 질문에 자연스럽게 한국어로 답변해주세요.

**중요 규칙:**
- JSON 형식으로 응답하지 마세요
- 도구 호출을 하지 마세요
- 자연스러운 한국어 문장으로만 답변하세요
- 짧고 친근하게 응답하세요`;

      let greetingResponse: string;

      if (isStreamingEnabledForGreeting) {
        // 스트리밍 모드: 인사 응답 실시간 전송
        console.log(
          "[ConversationManager] Streaming mode enabled for greeting response",
        );
        WebviewBridge.startStreamingMessage(webviewToRespond, "assistant");

        const onGreetingChunk = (chunk: string, done: boolean) => {
          if (chunk) {
            WebviewBridge.streamMessageChunk(webviewToRespond, chunk);
          }
          if (done) {
            WebviewBridge.endStreamingMessage(webviewToRespond);
          }
        };

        const _llmStartGreeting = Date.now();
        greetingResponse =
          await this.llmManager.sendMessageWithSystemPromptStreaming(
            greetingSystemPrompt,
            accumulatedUserParts,
            onGreetingChunk,
            { signal: abortSignal },
          );
        {
          const _t = Date.now() - _llmStartGreeting;
          const _tok = estimateTokens(greetingResponse);
          usageMetrics.recordLLMCall(
            _t,
            _tok,
            true,
            await this.llmManager.getCurrentModelName().catch(() => "unknown"),
          );
        }

        // 인사말 응답도 세션에 저장
        if (options.extensionContext) {
          try {
            const { SessionManager } = await import("../state/SessionManager");
            const sessionManager = SessionManager.getInstance(
              options.extensionContext,
            );
            const currentSession = sessionManager.getCurrentSession();
            if (currentSession) {
              await sessionManager.addConversationEntry(currentSession.id, {
                id: `conv_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
                timestamp: Date.now(),
                userRequest: options.userQuery || "",
                assistantResponse: greetingResponse,
                actions: [],
                result: "success",
                model: options.currentModelType,
              });
            }
          } catch (e) {
            console.warn(
              "[ConversationManager] Failed to save greeting to session:",
              e,
            );
          }
        }

        return; // 스트리밍 완료 후 즉시 종료
      }

      // 비스트리밍 모드: 인사 응답용 시스템 프롬프트 사용
      const _llmStartGreetingNS = Date.now();
      greetingResponse = await this.llmManager.sendMessageWithSystemPrompt(
        greetingSystemPrompt,
        accumulatedUserParts,
        { signal: abortSignal },
      );
      {
        const _t = Date.now() - _llmStartGreetingNS;
        const _tok = estimateTokens(greetingResponse);
        usageMetrics.recordLLMCall(
          _t,
          _tok,
          true,
          await this.llmManager.getCurrentModelName().catch(() => "unknown"),
        );
      }

      // 응답 정제: extractResponseText 사용하여 일관된 정제
      let cleanGreetingResponse =
        this.responseProcessor.extractResponseText(greetingResponse);

      // JSON 래핑이 있는 경우 추가 파싱 (extractResponseText에서 처리되지 않은 경우)
      if (
        !cleanGreetingResponse ||
        cleanGreetingResponse.trim().length < AgentConfig.MIN_RESPONSE_LENGTH
      ) {
        try {
          // JSON 형태로 래핑된 경우 파싱 시도
          const jsonMatch = greetingResponse.match(/^\{[\s\S]*\}$/);
          if (jsonMatch) {
            const parsed = JSON.parse(greetingResponse);
            cleanGreetingResponse =
              parsed.response || parsed.content || parsed.message || "";
          }
        } catch (e) {
          // JSON 파싱 실패 시 원본 사용
        }
      }

      // 응답이 비어있거나 너무 짧은 경우 기본 응답 사용
      if (
        !cleanGreetingResponse ||
        cleanGreetingResponse.trim().length < AgentConfig.MIN_RESPONSE_LENGTH
      ) {
        console.warn(
          "[ConversationManager] Greeting response is empty or too short, using default response.",
        );
        cleanGreetingResponse = AgentConfig.DEFAULT_GREETING_MESSAGE;
      }

      // 최종 정제: 앞뒤 공백 제거
      cleanGreetingResponse = cleanGreetingResponse.trim();

      // CODEPILOT 타입으로 전송 (스트리밍 효과)
      await WebviewBridge.streamText(
        webviewToRespond,
        "CODEPILOT",
        cleanGreetingResponse,
      );

      // 인사말 응답도 세션에 저장
      if (options.extensionContext) {
        try {
          const { SessionManager } = await import("../state/SessionManager");
          const sessionManager = SessionManager.getInstance(
            options.extensionContext,
          );
          const currentSession = sessionManager.getCurrentSession();
          if (currentSession) {
            await sessionManager.addConversationEntry(currentSession.id, {
              id: `conv_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
              timestamp: Date.now(),
              userRequest: options.userQuery || "",
              assistantResponse: cleanGreetingResponse,
              actions: [],
              result: "success",
              model: options.currentModelType,
            });
          }
        } catch (e) {
          console.warn(
            "[ConversationManager] Failed to save greeting to session:",
            e,
          );
        }
      }

      return; // 즉시 종료
    }

    // ⚠️ 핵심 수정: execution-first task 감지 및 바로 EXECUTION으로 전환
    // 공통 함수 사용으로 모든 곳에서 동일한 기준 적용
    const isExecutionFirstTask = this.isExecutionFirstTask(
      intent,
      hasExecutionIntentEver,
      hasActivePlan,
    );

    // ⚠️ 안전 장치: 기존 프로젝트가 존재하면 execution-first라도 INVESTIGATION으로 시작
    // “기존 프로젝트” 판단: 루트에 실제 파일/디렉터리가 하나라도 있으면 true
    let hasExistingProject = false;
    const currentProjectForInitial =
      ProjectManager.getInstance().getCurrentProject();
    const workspaceRootForInitial = currentProjectForInitial?.root || "";
    if (workspaceRootForInitial) {
      try {
        const entries = fsSync.readdirSync(workspaceRootForInitial, {
          withFileTypes: true,
        });
        hasExistingProject = entries.some((e) => {
          const name = e.name;
          // 숨김/무시 대상
          if (AgentConfig.IGNORED_DIRECTORIES.includes(name)) {
            return false;
          }
          return true; // 하나라도 있으면 존재한다고 판단
        });
      } catch (e) {
        console.warn(
          "[ConversationManager] Failed to check existing project contents:",
          e,
        );
      }
    }

    // FSM 초기화
    // requiresPlan이 false인 경우:
    // - analysis/documentation 카테고리: INVESTIGATION (조사 후 바로 답변, plan 없이)
    // - execution 카테고리: EXECUTION (바로 명령어 실행)
    // - code 카테고리: EXECUTION (LLM이 plan 불필요로 판단한 단순 코드 수정)
    const isSimpleTask = intent?.requiresPlan === false;
    const isDirectResponseTask =
      isSimpleTask &&
      (intent?.category === "analysis" || intent?.category === "documentation");
    const isDirectExecutionTask =
      isSimpleTask &&
      (intent?.category === "execution" || intent?.category === "code");

    const isPlanMode = options.promptType === PromptType.PLAN;

    const initialState = isPlanMode
      ? AgentPhase.INVESTIGATION // PLAN mode always starts with investigation
      : hasActivePlan
        ? AgentPhase.EXECUTION
        : isDirectExecutionTask || (isExecutionFirstTask && !hasExistingProject)
          ? AgentPhase.EXECUTION
          : AgentPhase.INVESTIGATION;
    const stateManager = new AgentStateManager(initialState);

    if (isDirectResponseTask) {
      console.log(
        `[ConversationManager] Direct response task detected (${intent.category}). Starting in INVESTIGATION for immediate response.`,
      );
    } else if (isDirectExecutionTask) {
      console.log(
        `[ConversationManager] Simple task detected (requiresPlan: false, ${intent?.category}). Starting directly in EXECUTION phase.`,
      );
    } else if (isExecutionFirstTask) {
      if (hasExistingProject) {
        console.log(
          `[ConversationManager] Execution-first task detected (${intent.category}/${intent.subtype}) but existing project found. Starting in INVESTIGATION for safety.`,
        );
      } else {
        console.log(
          `[ConversationManager] Execution-first task detected (${intent.category}/${intent.subtype}). Starting directly in EXECUTION phase.`,
        );
      }
    }

    // 파일 목록은 시스템이 먼저 제공: 첫 LLM 호출 전에 프로젝트 파일 인벤토리 제공 ([D] [F] 형식)
    if (initialState === AgentPhase.INVESTIGATION && !hasActivePlan) {
      try {
        const projectManager = ProjectManager.getInstance();
        const inventory = await projectManager.buildProjectInventorySection(
          AgentConfig.MAX_PROJECT_INVENTORY_FILES,
        );
        if (inventory) {
          accumulatedUserParts.push({
            text: `${inventory}\n\n**중요**: 위 프로젝트 파일 구조를 참고하여 필요한 파일만 선택적으로 읽으세요. 모든 파일을 읽을 필요는 없습니다.`,
          });
          console.log(
            `[ConversationManager] Pre-loaded project file inventory for INVESTIGATION phase`,
          );
        }
      } catch (error) {
        console.warn(
          `[ConversationManager] Failed to pre-load project inventory:`,
          error,
        );
      }
    }

    // plan 생성 시 받은 도구 호출을 추적
    let toolCallsFromPlanCreation: ToolUse[] = [];
    let hasInvestigationHistory = false; // 조사 이력 추적
    const preloadedFiles = new Set<string>(); // Pre-load된 파일 목록 추적 (중복 읽기 방지)
    const alreadyStattedFiles = new Set<string>(); // 턴 간 중복 stat_file 방지
    // isPlanMode is declared earlier (before initialState) for phase decision
    let planTextResponse = ""; // PLAN 모드 응답 원문 (세션 히스토리 저장용)

    // 파일 변경 추적 (요약 검증용)
    const createdFiles: string[] = [];
    const modifiedFiles: string[] = [];
    const executedCommands: string[] = []; // run_command 실행 이력 추적
    this.deletedFiles = [];
    this._pendingImportCleanupMsg = null;

    // 대화 시작 시 reviewProcessed 플래그 초기화 (이전 대화에서 남은 값 제거)
    (this as any).reviewProcessed = null;

    // v9.4.0: 무한 루프 감지 상태 초기화
    const loopState = this.loopStateTracker.initializeLoopState();
    loopState.lastPhase = initialState;

    while (turnCount < maxTurns) {
      if (abortSignal?.aborted) {
        break;
      }

      // 각 턴마다 새로운 conversationTurnId 생성 (턴 단위 변경 그룹화)
      conversationTurnId = crypto.randomUUID();

      // 🔒 메모리 누수 방지: accumulatedUserParts 정리
      accumulatedUserParts = this.trimAccumulatedParts(accumulatedUserParts);

      // 파일 삭제 후 import 정리 메시지 주입
      if (this._pendingImportCleanupMsg) {
        accumulatedUserParts.push({ text: this._pendingImportCleanupMsg });
        this._pendingImportCleanupMsg = null;
      }

      // 🔄 컨텍스트 자동 압축 체크 (토큰 임계값 초과 시 트리거)
      try {
        const compactor = ConversationCompactor.getInstance(this.llmManager);
        // StateManager 설정 (compactorModel 사용을 위해)
        if (options.extensionContext) {
          compactor.setStateManager(
            StateManager.getInstance(options.extensionContext),
          );
        }
        const currentModelType = options.currentModelType || AiModelType.OLLAMA;
        const modelLimits =
          MODEL_TOKEN_LIMITS[currentModelType] ||
          MODEL_TOKEN_LIMITS[AiModelType.OLLAMA];
        const maxTokens = modelLimits?.maxInputTokens || 128000;

        // Tier 1: 도구 결과 경량 트림 (LLM 호출 없이 오래된 도구 결과 축약)
        const trimResult = compactor.trimToolResults(
          accumulatedUserParts,
          systemPrompt,
          maxTokens,
        );
        if (trimResult.trimmed) {
          accumulatedUserParts = trimResult.parts;
          console.log(
            `[ConversationManager] Tier1 tool result trim: saved ${trimResult.savedTokens} tokens`,
          );
        }

        // Tier 1.5: Microcompact — 도구 결과를 1줄 요약으로 축약 (LLM 호출 없음, 70% 초과 시)
        const microResult = compactor.microcompact(
          accumulatedUserParts,
          systemPrompt,
          maxTokens,
        );
        if (microResult.compacted) {
          accumulatedUserParts = microResult.parts;
          console.log(
            `[ConversationManager] Microcompact: saved ${microResult.savedTokens} tokens`,
          );
        }

        // Tier 2: LLM 요약 (Microcompact 후에도 threshold 초과 시)
        if (
          compactor.needsCompaction(
            accumulatedUserParts,
            systemPrompt,
            maxTokens,
          )
        ) {
          console.log(
            `[ConversationManager] Token threshold exceeded. Starting context compaction...`,
          );
          WebviewBridge.sendProcessingStatus(
            webviewToRespond,
            "context",
            "컨텍스트 압축 중...",
          );

          const compactionResult = await compactor.compact(
            accumulatedUserParts,
            systemPrompt,
            maxTokens,
            abortSignal,
          );

          if (compactionResult.compacted) {
            accumulatedUserParts = compactionResult.recentMessages;
            console.log(
              `[ConversationManager] Context compacted. Saved ${compactionResult.savedTokens} tokens (${compactionResult.originalTokens} → ${compactionResult.compactedTokens})`,
            );

            // v9.7.0: 컨텍스트 압축 메트릭 기록
            usageMetrics.recordContextCompaction(compactionResult.savedTokens);

            // UI에 압축 알림
            WebviewBridge.receiveMessage(
              webviewToRespond,
              "SYSTEM_INFO",
              `💡 컨텍스트가 자동 압축되었습니다. (${compactionResult.savedTokens.toLocaleString()} 토큰 절약)`,
            );
          }
        }

        // 현재 대화 컨텍스트의 토큰만 계산 (세션 누적 제거 - 이중 계산 방지)
        const currentContextTokens = compactor.calculateTotalTokens(
          accumulatedUserParts,
          systemPrompt,
        );
        const currentMessageCount = accumulatedUserParts.length;

        console.log(
          `[ConversationManager] 토큰 사용량: ${currentContextTokens.toLocaleString()} / ${maxTokens.toLocaleString()} (${((currentContextTokens / maxTokens) * 100).toFixed(1)}%)`,
        );

        WebviewBridge.updateContextInfo(webviewToRespond, {
          messageCount: currentMessageCount,
          tokenUsage: {
            current: currentContextTokens,
            max: maxTokens,
            percentage: (currentContextTokens / maxTokens) * 100,
          },
        });
      } catch (compactionError) {
        console.warn(
          "[ConversationManager] Context compaction failed:",
          compactionError,
        );
        // 압축 실패해도 계속 진행
      }

      // [수정] 루프 시작 시점에 현재 계획 상태를 UI에 즉시 동기화 (PLAN 모드에서는 숨김)
      const allItems = taskManager.listPlanItems();
      if (allItems.length > 0 && !isPlanMode) {
        WebviewBridge.updateTaskQueue(webviewToRespond, allItems);
      }

      // 현재 활성 계획 아이템 확인
      const currentPlanItem = taskManager.getNextPendingItem();

      // 실행 시작 시 in_progress로 전환 (UI에 파란색 표시, PLAN 모드 제외)
      if (currentPlanItem && currentPlanItem.status === "pending") {
        taskManager.updatePlanItemStatus(currentPlanItem.id, "in_progress");
        if (!isPlanMode) {
          WebviewBridge.updateTaskQueue(
            webviewToRespond,
            taskManager.listPlanItems(),
          );
        }
      }

      // FSM에서 현재 상태 가져오기
      const currentPhase = stateManager.getCurrentState();
      const statusPrefix = currentPlanItem ? `[${currentPlanItem.title}] ` : "";
      console.log(
        `[ConversationManager] Turn ${turnCount + 1}: currentPhase=${currentPhase}, planItem=${currentPlanItem?.title || "none"}`,
      );

      // REVIEW 또는 DONE 단계는 LLM 호출 없이 시스템이 처리
      if (currentPhase === AgentPhase.REVIEW) {
        const reviewResult = await this.handleReviewPhase(
          stateManager,
          webviewToRespond,
          createdFiles,
          modifiedFiles,
          systemPrompt,
          accumulatedUserParts,
          abortSignal,
          options,
          userQuery,
          collectedActions,
          collectedUIMessages,
          lastExecutionTurnId,
          executedCommands,
          retryCoordinator,
        );
        if (reviewResult.action === "break") {
          break;
        }
        turnCount++;
        continue;
      }

      if (currentPhase === AgentPhase.DONE) {
        console.log("[ConversationManager] DONE phase: All work completed.");
        break; // 이미 완료 상태이므로 루프 종료
      }

      const actionText =
        currentPhase === AgentPhase.INVESTIGATION
          ? "조사 및 분석"
          : "작업 진행";
      WebviewBridge.sendProcessingStep(webviewToRespond, "thinking");
      WebviewBridge.sendProcessingStatus(
        webviewToRespond,
        "thinking",
        `${statusPrefix}${actionText} 중...`,
      );

      // 페이즈별 프롬프트 보정 및 도구 제한
      let activeSystemPrompt = systemPrompt;
      let allowedTools: Tool[] | undefined = undefined;
      let nativeToolsForCall: any[] | undefined = undefined; // 네이티브 툴 콜링용 (나중에 설정됨)

      // CODE 모드: AGENT 전용 도구(work_plan, spawn_agent, stop_agent) 제외
      if (!this._isAgentMode) {
        allowedTools = (Object.values(Tool) as Tool[]).filter(
          (t) => !AGENT_ONLY_TOOLS.has(t),
        );
      }

      if (currentPhase === AgentPhase.INVESTIGATION) {
        const investigationPrompt = investigationManager.getInvestigationPrompt(
          options.userQuery,
        );
        activeSystemPrompt = investigationPrompt + "\n\n" + systemPrompt;
        allowedTools = investigationManager.getInvestigationTools();

        // 조사 단계에서는 PromptBuilder를 다시 사용하여 도구 설명 섹션만 교체
        // 핵심 수정: gatheredContext의 첨부 컨텍스트(selectedFilesContent 등)를 포함해야 함
        // Hot Load 프롬프트 로드 (매칭된 경우 인자 추출 프롬프트 우선)
        let hotLoadPromptForInvestigation = "";
        try {
          const hotLoadManager = HotLoadManager.getInstance();
          if (intent?.hotLoadMatch) {
            hotLoadPromptForInvestigation =
              hotLoadManager.getMatchedPromptSection(intent.hotLoadMatch as any, options.userQuery);
          } else {
            hotLoadPromptForInvestigation =
              await hotLoadManager.getPromptSection();
          }
        } catch (error) {
          console.warn(
            "[ConversationManager] Failed to load Hot Load prompt for investigation:",
            error,
          );
        }

        // MCP 커스텀 프롬프트 수집
        const mcpCustomPromptsForInvestigation =
          this.contextGatherer.collectMcpCustomPrompts();

        // 영속적 메모리 컨텍스트 로드
        let memoryContextForInvestigation = "";
        try {
          memoryContextForInvestigation =
            await MemoryManager.getInstance().loadForPrompt();
        } catch {
          /* 메모리 로드 실패 시 무시 */
        }

        // 네이티브 모드 여부 (조사 단계 프롬프트 형식 결정)
        let isNativeModeForInvestigation = false;
        try {
          const isNativeEnabled = options.extensionContext
            ? await SettingsManager.getInstance(
                options.extensionContext,
              ).isNativeToolCallingEnabled()
            : false;
          if (
            isNativeEnabled &&
            options.currentModelType === AiModelType.ADMIN
          ) {
            const adminConfig = this.llmManager.getAdminModelConfig();
            isNativeModeForInvestigation =
              adminConfig?.nativeToolCallingSupported === true ||
              String(adminConfig?.nativeToolCallingSupported) === "true";
          }
        } catch {
          /* 설정 읽기 실패 시 기본값 사용 */
        }

        const promptOptions: PromptBuilderOptions = {
          userOS: options.userOS || process.platform,
          modelType: options.currentModelType || AiModelType.OLLAMA,
          promptType: options.promptType,
          allowedTools, // 도구 제한 전달
          nativeMode: isNativeModeForInvestigation, // 네이티브 Function Call 모드
          hotLoadPrompt: hotLoadPromptForInvestigation, // Hot Load 프롬프트 추가
          memoryContext: memoryContextForInvestigation, // 영속적 메모리 컨텍스트 추가
          mcpCustomPrompts: mcpCustomPromptsForInvestigation, // MCP 커스텀 프롬프트 추가
          // 사용자가 첨부한 컨텍스트 포함 (gatheredContext에서 가져옴)
          selectedFilesContent: gatheredContext?.selectedFilesContent,
          terminalContextContent: gatheredContext?.terminalContextContent,
          diagnosticsContextContent: gatheredContext?.diagnosticsContextContent,
          codebaseContext: gatheredContext?.codebaseContext,
          frameworkRulesPrompt: gatheredContext?.frameworkRulesPrompt, // v9.2.1
          ragContext: gatheredContext?.ragContext, // RAG 컨텍스트 포함
          subProjectStructure: gatheredContext?.subProjectStructure, // 서브프로젝트 구조
        };
        activeSystemPrompt =
          investigationPrompt +
          "\n\n" +
          this.promptBuilder.generateSystemPrompt(promptOptions);

        // 핵심 수정: analysis/documentation 인텐트에서는 plan JSON 대신 자연어 응답 유도
        if (
          intent &&
          (intent.category === "analysis" ||
            intent.category === "documentation")
        ) {
          const intentTypeKr =
            intent.category === "analysis" ? "분석/질문" : "문서/요약";
          activeSystemPrompt += `\n\n⚠️ **${intentTypeKr} 요청 - 특별 규칙:**
이 요청은 ${intentTypeKr} 요청입니다. 코드 수정이나 실행이 필요하지 않습니다.

**필수 행동:**
1. 필요한 파일을 읽기 위해 조사 도구(read_file, ripgrep_search 등)를 호출하세요.
2. 충분한 정보를 수집한 후, **직접 한국어로 답변/요약을 작성하세요.**
3. plan JSON을 출력하지 마세요. 바로 자연어 답변을 출력하세요.
4. **"읽어줘", "보여줘" 요청 시**: read_file로 파일을 읽은 후, 반드시 파일 내용을 코드 블록(\`\`\`)으로 사용자에게 보여주세요. investigation_done만 보내지 마세요.

**절대 금지:**
- ❌ plan JSON 출력 (${intentTypeKr} 요청에는 plan이 필요하지 않습니다)
- ❌ 실행 도구 호출 (create_file, update_file, run_command 등)
- ❌ 코드 수정 제안 (${intentTypeKr}만 요청받았습니다)
- ❌ 파일 내용을 읽고도 텍스트 응답 없이 종료 (사용자에게 결과를 보여줘야 합니다)

**올바른 흐름:**
조사 도구로 정보 수집 → 자연어로 직접 답변/요약 출력 (파일 내용 포함)
`;
        }

        // 문제 해결: execution-first 작업일 때 investigation item 금지
        // 공통 함수 사용으로 일관된 판단
        if (
          this.isExecutionFirstTask(
            intent,
            hasExecutionIntentEver,
            hasActivePlan,
          )
        ) {
          activeSystemPrompt += getExecutionFirstRulePrompt();
        }
      } else if (currentPhase === AgentPhase.EXECUTION) {
        if (isPlanMode) {
          // PLAN 모드: execution phase prompt 금지 (planPrompt 지시와 충돌)
          // 탐색 완료 후 텍스트로 계획 출력하도록 remind
          activeSystemPrompt += `\n\n⚠️ **PLAN 모드**: 탐색이 완료되었습니다. 지금 즉시 구현 계획 Markdown을 텍스트로 출력하세요. 도구 호출 금지.`;
        } else {
          // ⚠️ EXECUTION 단계에서는 설명 금지, 도구 호출만 허용
          // 핵심: LLM을 "DSL 컴파일러"처럼 사용 - Planning/Reasoning 금지, Execution만 허용
          activeSystemPrompt += getExecutionPhasePrompt();
        }
      }

      // 최적화: 도구 실행이 성공했고 plan의 모든 item이 완료되면 LLM 호출 없이 바로 REVIEW로 전환
      // "완료 확인" 호출 제거 - 불필요한 LLM 호출 방지
      // ⚠️ plan이 한 번도 생성되지 않은 경우(no-plan 실행): 조기 종료 금지, 다음 턴으로 계속
      // ⚠️ retry 프롬프트 또는 MCP 결과 해석이 대기 중이면 스킵하지 않음
      const currentPhaseForExecution = stateManager.getCurrentState();
      if (
        currentPhaseForExecution === AgentPhase.EXECUTION &&
        lastTurnHadSuccessfulToolExecution &&
        !pendingRetryPrompt &&
        !pendingMCPResultInterpretation
      ) {
        const remainingPlanItems = taskManager.getNextPendingItem();
        const planExists = taskManager.listPlanItems().length > 0;

        if (planExists && !remainingPlanItems) {
          // Case A: plan 기반 플로우 — 모든 plan item 완료 → 테스트 후 REVIEW 전환
          console.log(
            `[ConversationManager] EXECUTION phase: All plan items completed. Running tests and transitioning.`,
          );
          lastTurnHadSuccessfulToolExecution = false; // 리셋

          if (abortSignal?.aborted) {
            break;
          }
          const testTransition = await this.runTestsAndTransition(
            webviewToRespond,
            stateManager,
            retryCoordinator,
            createdFiles,
            modifiedFiles,
            testFixAttempts,
            maxTestFixAttempts,
            isAutoTestRetryEnabled,
            accumulatedUserParts,
            turnCount,
            true, // allPlanItemsDone
          );
          testFixAttempts = testTransition.testFixAttempts;
          pendingRetryPrompt =
            testTransition.pendingRetryPrompt || pendingRetryPrompt;
          if (testTransition.turnAction.action === "continue") {
            turnCount++;
            continue;
          }
        } else if (!planExists) {
          // Case C: no-plan 실행 — plan이 한 번도 생성되지 않음
          // 도구 성공만으로 완료 판정 불가, LLM에게 다음 턴을 줘서 계속 작업하게 함
          console.log(
            `[ConversationManager] EXECUTION phase: Tool succeeded but no plan exists. Continuing to let LLM work.`,
          );
          lastTurnHadSuccessfulToolExecution = false;
        }
        // remainingPlanItems가 있으면 계속 진행 (다음 plan item 실행)
      }

      // [핵심 수정] EXECUTION phase에서 plan이 있으면 우선 plan 기반 도구를 직접 실행하고,
      // plan에 실행 도구가 없을 경우에만 한 번 LLM을 호출해 tool call을 생성
      if (
        currentPhaseForExecution === AgentPhase.EXECUTION &&
        currentPlanItem
      ) {
        // plan 생성 시 받은 도구 호출이 있으면 바로 실행
        if (toolCallsFromPlanCreation.length > 0) {
          console.log(
            `[ConversationManager] EXECUTION phase: executing ${toolCallsFromPlanCreation.length} tool calls from plan creation, skipping LLM call.`,
          );

          WebviewBridge.sendProcessingStep(webviewToRespond, "executing");
          WebviewBridge.sendProcessingStatus(
            webviewToRespond,
            "executing",
            `도구 실행 중...`,
          );

          const {
            toolResults,
            hasSuccessfulExecution: hasSuccessfulPlanExecution,
            hasWriteToolExecution: hasWritePlanExecution,
            hasBlockedByValidator,
            blockedMessages,
            hasUserSkipped,
            inlineDiagnosticErrors: inlineDiagErrors1,
          } = await this.executeToolsWithUI(
            toolExecutor,
            toolCallsFromPlanCreation,
            webviewToRespond,
            actionManager,
            executionManager,
            terminalManager,
            collectedUIMessages,
            preloadedFiles,
            alreadyStattedFiles,
            createdFiles,
            modifiedFiles,
            true, // includeWebviewInContext — ask_question 등 webview 필요 도구 지원
            conversationTurnId,
            executedCommands,
            isPlanMode,
          );
          if (hasSuccessfulPlanExecution && hasWritePlanExecution) {
            lastTurnHadSuccessfulToolExecution = true;
            lastExecutionTurnId = conversationTurnId; // review 메시지에 사용할 turnId 저장
            console.log(
              `[ConversationManager] Plan-based tool execution succeeded.`,
            );
          }

          // v1.0.24: EXECUTION 중 LSP 에러 즉시 피드백
          if (inlineDiagErrors1) {
            accumulatedUserParts.push({ text: inlineDiagErrors1 });
          }

          // PreToolUseValidator에 의해 차단된 경우
          const blockResult = this.handleBlockedTools(
            hasBlockedByValidator,
            blockedMessages,
            hasSuccessfulPlanExecution,
            stateManager,
            accumulatedUserParts,
            webviewToRespond,
          );
          if (blockResult === "break") break;

          // 사용자가 스킵한 경우에도 플랜 아이템 완료 처리 (무한 루프 방지)
          if (hasUserSkipped && currentPlanItem) {
            console.log(
              `[ConversationManager] User skipped tool execution, marking plan item as done.`,
            );
            this.completePlanItem(
              taskManager,
              webviewToRespond,
              currentPlanItem.id,
            );
          }

          // 현재 Plan Item 완료 처리
          if (
            ToolExecutionCoordinator.hasSideEffects(
              toolCallsFromPlanCreation,
              toolResults,
            ) &&
            currentPlanItem
          ) {
            this.completePlanItem(
              taskManager,
              webviewToRespond,
              currentPlanItem.id,
            );
          }

          // 다음 계획 항목이 있으면 계속, 없으면 EXECUTION 완료 → REVIEW로 전환
          const nextItem = taskManager.getNextPendingItem();
          if (nextItem) {
            // 현재 plan item은 완료되었으므로 다음 item으로 이동
            toolCallsFromPlanCreation = [];
            turnCount++;
            continue;
          } else {
            // 모든 plan item 완료 → 자동 테스트 후 REVIEW 전환
            if (abortSignal?.aborted) {
              break;
            }
            const testTransition = await this.runTestsAndTransition(
              webviewToRespond,
              stateManager,
              retryCoordinator,
              createdFiles,
              modifiedFiles,
              testFixAttempts,
              maxTestFixAttempts,
              isAutoTestRetryEnabled,
              accumulatedUserParts,
              turnCount,
              true, // allPlanItemsDone
            );
            testFixAttempts = testTransition.testFixAttempts;
            if (testTransition.pendingRetryPrompt) {
              pendingRetryPrompt = true;
            }
            turnCount++;
            continue;
          }
        } else {
          // plan에 실행 도구가 없을 때: plan item을 기반으로 LLM을 1회 호출하여 tool call 생성

          // ⚠️ 핵심 수정: investigation item 체크를 LLM 호출 전에 먼저 수행
          // Plan item이 조사 작업인지 확인 (kind 기반, 자동 완료 처리)
          if (currentPlanItem) {
            // kind 필드가 있으면 그것을 우선 사용, 없으면 기본값은 'execution'
            const isInvestigationTask =
              currentPlanItem.kind === "investigation";

            if (isInvestigationTask) {
              // ⚠️ 핵심 수정: investigation item은 INVESTIGATION phase에서만 처리
              // EXECUTION phase에서는 investigation item을 완전히 스킵
              console.log(
                `[ConversationManager] ⚠️ EXECUTION phase: plan item "${currentPlanItem.title}" is an investigation task. Investigation items must be processed in INVESTIGATION phase only. Skipping and moving to next item.`,
              );

              // investigation item을 스킵하고 다음 항목으로
              taskManager.updatePlanItemStatus(currentPlanItem.id, "skipped");
              WebviewBridge.updateTaskQueue(
                webviewToRespond,
                taskManager.listPlanItems(),
              );

              // 에러 메시지 추가: investigation item이 EXECUTION phase에 도달했다는 것은 FSM 위반
              accumulatedUserParts.push({
                text: getFsmViolationInvestigationInExecutionPrompt(
                  currentPlanItem.title,
                ),
              });

              // 다음 계획 항목이 있으면 계속, 없으면 자동 테스트 후 REVIEW로 전환
              const nextItem = taskManager.getNextPendingItem();
              if (nextItem) {
                turnCount++;
                continue;
              } else {
                // 모든 plan item 완료 → 자동 테스트 후 REVIEW 전환
                if (abortSignal?.aborted) {
                  break;
                }
                const testTransition = await this.runTestsAndTransition(
                  webviewToRespond,
                  stateManager,
                  retryCoordinator,
                  createdFiles,
                  modifiedFiles,
                  testFixAttempts,
                  maxTestFixAttempts,
                  isAutoTestRetryEnabled,
                  accumulatedUserParts,
                  turnCount,
                  true, // allPlanItemsDone
                );
                testFixAttempts = testTransition.testFixAttempts;
                if (testTransition.pendingRetryPrompt) {
                  pendingRetryPrompt = true;
                }
                turnCount++;
                continue;
              }
            }
          }

          // ⚠️ 핵심 수정: investigation item이 아닌 execution item에 대해서만 LLM 호출
          // investigation item은 위에서 이미 처리되었으므로 여기서는 execution item만 처리
          if (currentPlanItem && currentPlanItem.kind !== "investigation") {
            // ⚠️ 자동 완료 로직 제거: 파일 존재만으로는 작업 완료를 보장할 수 없음
            // LLM이 작업 상태를 가장 정확히 알고 있으므로, LLM이 항상 판단하도록 함
            // 파일이 생성/수정되었다고 해서 Plan Item의 목표가 달성되었다고 보장할 수 없음
            // 예: "user authentication 기능 추가" 계획에서 auth.ts 파일만 생성되고 실제 로직은 비어있을 수 있음

            // LLM 호출하여 작업 상태 확인 및 계속 진행
            // 아직 파일이 생성되지 않았고 plan item이 execution kind이면 LLM을 1회 호출하여 tool call 생성
            console.log(
              `[ConversationManager] EXECUTION phase: no tool calls from plan creation, calling LLM once for execution plan item "${currentPlanItem.title}".`,
            );

            // 🚀 최적화: 프로젝트 파일 인벤토리 제공 (buildProjectInventorySection 활용)
            let projectInventoryContext = "";
            try {
              const projectManager = ProjectManager.getInstance();
              const inventory =
                await projectManager.buildProjectInventorySection(
                  AgentConfig.MAX_PROJECT_INVENTORY_FILES,
                );
              if (inventory) {
                projectInventoryContext = `\n\n${inventory}\n\n**중요**: 위 프로젝트 파일 구조를 참고하여 필요한 파일만 선택적으로 읽으세요. 모든 파일을 읽을 필요는 없습니다.\n`;
              }
            } catch (error) {
              console.warn(
                "[ConversationManager] Failed to build project inventory:",
                error,
              );
            }

            // Pre-load된 파일 목록과 실제 내용을 EXECUTION 컨텍스트에 명확하게 포함
            // ⚠️ 핵심 수정: Pre-load된 파일의 실제 내용을 accumulatedUserParts에서 추출하여 포함
            let preloadedFilesContextForExecution = "";
            const preloadedFilesContent: Array<{
              path: string;
              content: string;
            }> = [];
            const processedPaths = new Set<string>(); // 중복 체크용

            // accumulatedUserParts에서 Pre-load된 파일 내용 추출
            for (const part of accumulatedUserParts) {
              try {
                if (
                  part.text &&
                  part.text.includes("[System] ⚠️ **이미 읽은 파일")
                ) {
                  // 개선된 정규식: 파일 경로 추출 (언어 태그 지원)
                  const fileMatch = part.text.match(
                    /이미 읽은 파일[^:]*:\s*(.+?)(?:\n|$)/,
                  );
                  const contentMatch = part.text.match(
                    /```[\w]*\n([\s\S]*?)```/,
                  );

                  if (fileMatch && contentMatch) {
                    // 경로 정규화 및 중복 체크
                    const filePath = path.normalize(fileMatch[1].trim());
                    const content = contentMatch[1].trim();

                    // 빈 내용 무시 및 중복 체크
                    if (content && !processedPaths.has(filePath)) {
                      processedPaths.add(filePath);
                      preloadedFilesContent.push({
                        path: filePath,
                        content: content,
                      });
                    }
                  }
                }
              } catch (error) {
                console.warn(
                  "[ConversationManager] Failed to extract preloaded file content:",
                  error,
                );
                // 계속 진행
              }
            }

            if (preloadedFiles.size > 0 || preloadedFilesContent.length > 0) {
              const preloadedFilesArray = Array.from(preloadedFiles);
              preloadedFilesContextForExecution = `\n\n**⚠️ 이미 읽은 파일 목록 (다시 읽지 마세요):**\n${preloadedFilesArray.map((f) => `- ${f}`).join("\n")}\n\n`;

              // Pre-load된 파일의 실제 내용 제공
              if (preloadedFilesContent.length > 0) {
                console.log(
                  `[ConversationManager] Extracted ${preloadedFilesContent.length} preloaded file contents`,
                );
                preloadedFilesContextForExecution += `**이미 읽은 파일 내용 (위 대화 기록에서 확인 가능):**\n\n`;
                preloadedFilesContent.forEach(({ path, content }) => {
                  const lines = content.split("\n");
                  const preview = StringUtils.truncateLines(
                    content,
                    AgentConfig.MAX_FILE_PREVIEW_LINES,
                    "\n... (파일이 길어 일부만 표시)",
                  );
                  preloadedFilesContextForExecution += `\n**파일: ${path}**\n\`\`\`\n${preview}\n\`\`\`\n`;
                });
                preloadedFilesContextForExecution +=
                  `\n**중요**: 위 파일들은 이미 읽었고 내용이 위에 제공되었습니다.\n` +
                  `다시 read_file을 호출하지 마세요. 위 내용을 참고하여 작업을 진행하세요.\n`;
              } else {
                preloadedFilesContextForExecution +=
                  `**중요**: 위 파일들은 이미 읽었고, 위 대화 기록에서 파일 내용이 제공되었습니다.\n` +
                  `다시 read_file을 호출하지 마세요. 위 대화 기록에서 파일 내용을 확인하세요.\n`;
              }
            }

            const planContextForExecution = getExecutionPhaseContextPrompt({
              currentTaskTitle: currentPlanItem.title,
              currentTaskDetail: currentPlanItem.detail,
              projectInventoryContext,
              preloadedFilesContext: preloadedFilesContextForExecution,
              ragContext: gatheredContext?.ragContext, // RAG 컨텍스트 재주입
            });

            // execution 의도일 때 Command 모델 사용
            // 네이티브 툴 콜링 설정 (메인 루프 진입 전이므로 여기서 직접 확인)
            let nativeToolsForPlanItem: any[] | undefined = undefined;
            {
              const isNativeEnabled = options.extensionContext
                ? await SettingsManager.getInstance(
                    options.extensionContext,
                  ).isNativeToolCallingEnabled()
                : false;
              if (isNativeEnabled) {
                const adminConfig = this.llmManager.getAdminModelConfig();
                const nativeSupported =
                  adminConfig?.nativeToolCallingSupported === true ||
                  String(adminConfig?.nativeToolCallingSupported) === "true";
                if (nativeSupported) {
                  nativeToolsForPlanItem =
                    ToolSpecBuilder.buildOpenAIToolsConfig(allowedTools);
                  console.log(
                    `[ConversationManager] EXECUTION plan item: Native tool calling enabled for ${adminConfig?.model}`,
                  );
                }
              }
            }

            // 스트리밍 설정 확인
            const isStreamingForPlanItem = options.extensionContext
              ? await SettingsManager.getInstance(
                  options.extensionContext,
                ).isStreamingEnabled()
              : false;

            let llmResponseForExecution: string;
            const _llmStartPlanItem = Date.now();
            if (
              intent &&
              intent.category === "execution" &&
              this.stateManager
            ) {
              console.log(
                "[ConversationManager] EXECUTION phase: Using Command model for execution intent",
              );
              llmResponseForExecution =
                await this.llmManager.sendMessageWithCommandModel(
                  activeSystemPrompt + planContextForExecution,
                  accumulatedUserParts,
                  this.stateManager,
                  { signal: abortSignal },
                );
            } else if (isStreamingForPlanItem) {
              console.log(
                `[ConversationManager] EXECUTION plan item: Streaming mode enabled`,
              );
              let planItemStreamBuffer = "";
              let planItemLastTool = "";
              const planItemOnChunk = (chunk: string) => {
                planItemStreamBuffer += chunk;

                // 툴 패턴 감지 (JSON 기반)
                const toolLabels: Record<string, string> = {
                  create_file: "파일 생성 중",
                  update_file: "파일 수정 중",
                  read_file: "파일 읽는 중",
                  delete_file: "파일 삭제 중",
                  run_command: "명령 준비 중",
                  glob_search: "파일 검색 중",
                  list_files: "파일 목록 중",
                };
                const jsonPattern =
                  /"tool"\s*:\s*"(\w+)"[^}]*"(?:path|filePath)"\s*:\s*"([^"]+)"/g;
                let tm: RegExpExecArray | null;
                let lastToolMatch: { tool: string; file: string } | null = null;
                while ((tm = jsonPattern.exec(planItemStreamBuffer)) !== null) {
                  lastToolMatch = { tool: tm[1], file: tm[2] };
                }
                if (lastToolMatch && toolLabels[lastToolMatch.tool]) {
                  if (isPlanMode) {
                    // PLAN mode: don't show file creation status, show plan writing status instead
                    if (planItemLastTool !== "계획 작성 중...") {
                      planItemLastTool = "계획 작성 중...";
                      WebviewBridge.sendProcessingStatus(
                        webviewToRespond,
                        "thinking",
                        "계획 작성 중...",
                      );
                    }
                    return;
                  }
                  const fileName =
                    lastToolMatch.file.split("/").pop() || lastToolMatch.file;
                  const status = `${toolLabels[lastToolMatch.tool]}: ${fileName}...`;
                  if (status !== planItemLastTool) {
                    planItemLastTool = status;
                    WebviewBridge.sendProcessingStatus(
                      webviewToRespond,
                      "executing",
                      status,
                    );
                  }
                  return;
                }
                // 토큰 카운트 표시 (500자마다 업데이트)
                if (
                  !planItemLastTool &&
                  planItemStreamBuffer.length % 500 < chunk.length
                ) {
                  const tokens = estimateTokens(planItemStreamBuffer);
                  WebviewBridge.sendProcessingStatus(
                    webviewToRespond,
                    isPlanMode ? "thinking" : "executing",
                    `${isPlanMode ? "계획 작성 중" : "응답 생성 중"} (${tokens.toLocaleString()} 토큰...)`,
                  );
                }
              };
              llmResponseForExecution =
                await this.llmManager.sendMessageWithSystemPromptStreaming(
                  activeSystemPrompt + planContextForExecution,
                  accumulatedUserParts,
                  planItemOnChunk,
                  { signal: abortSignal, nativeTools: nativeToolsForPlanItem },
                );
            } else {
              llmResponseForExecution =
                await this.llmManager.sendMessageWithSystemPrompt(
                  activeSystemPrompt + planContextForExecution,
                  accumulatedUserParts,
                  { signal: abortSignal, nativeTools: nativeToolsForPlanItem },
                );
            }
            {
              const _t = Date.now() - _llmStartPlanItem;
              const _tok = estimateTokens(llmResponseForExecution);
              usageMetrics.recordLLMCall(
                _t,
                _tok,
                true,
                await this.llmManager
                  .getCurrentModelName()
                  .catch(() => "unknown"),
              );
            }

            if (abortSignal?.aborted) {
              break;
            }
            const cleanExecutionResponse = llmResponseForExecution
              .replace(/<think>[\s\S]*?<\/think>/gi, "")
              .trim();
            const toolCallsFromExecution = ToolParser.parseToolCalls(
              cleanExecutionResponse,
            );

            // __done__은 SubAgentLoop 전용 — ConversationManager plan item 실행 시
            // ToolExecutor에 넘기면 "Unknown tool: __done__" 에러로 패널에 ❌ 표시됨
            // 여기서 필터링하여 ToolExecutor로 전달하지 않음
            const filteredExecutionCalls = toolCallsFromExecution.filter(
              (c) => c.name !== "__done__",
            );
            if (
              toolCallsFromExecution.length !== filteredExecutionCalls.length
            ) {
              console.log(
                `[ConversationManager] __done__ intercepted in plan item execution (plan item: "${currentPlanItem?.title}")`,
              );
            }

            // 같은 명령 반복 실패 방지: MAX_SAME_COMMAND_FAILURES 초과 시 스킵
            const skippedByFailureLimit: string[] = [];
            const allowedExecutionCalls = filteredExecutionCalls.filter(
              (call) => {
                if (call.name === "run_command" && call.params.command) {
                  const cmd = call.params.command;
                  const failCount = commandFailureCounts.get(cmd) || 0;
                  if (failCount >= MAX_SAME_COMMAND_FAILURES) {
                    console.warn(
                      `[ConversationManager] Skipping run_command — ${failCount} failures exceeded limit: ${cmd.substring(0, 80)}`,
                    );
                    skippedByFailureLimit.push(cmd);
                    return false;
                  }
                }
                return true;
              },
            );
            if (skippedByFailureLimit.length > 0) {
              accumulatedUserParts.push({
                text: `[시스템 알림] 다음 명령어는 ${MAX_SAME_COMMAND_FAILURES}회 연속 실패하여 실행이 중단되었습니다: ${skippedByFailureLimit.join(", ")}. 다른 방법을 시도하거나 이 단계를 건너뛰세요.`,
              });
            }

            if (
              allowedExecutionCalls.length === 0 &&
              skippedByFailureLimit.length > 0
            ) {
              // 모든 도구가 반복 실패로 스킵됨 → plan item 완료 처리
              console.log(
                `[ConversationManager] All tools skipped due to repeated failures, moving to next plan item`,
              );
              if (currentPlanItem) {
                this.completePlanItem(
                  taskManager,
                  webviewToRespond,
                  currentPlanItem.id,
                );
              }
              turnCount++;
              continue;
            }

            if (allowedExecutionCalls.length > 0) {
              WebviewBridge.sendProcessingStep(webviewToRespond, "executing");
              WebviewBridge.sendProcessingStatus(
                webviewToRespond,
                "executing",
                `도구 실행 중...`,
              );

              const {
                toolResults,
                hasSuccessfulExecution: hasSuccessfulToolExecution,
                hasWriteToolExecution: hasWriteToolExecution2,
                hasBlockedByValidator: hasBlockedByValidator2,
                blockedMessages: blockedMessages2,
                hasUserSkipped: hasUserSkipped2,
                inlineDiagnosticErrors: inlineDiagErrors2,
              } = await this.executeToolsWithUI(
                toolExecutor,
                allowedExecutionCalls,
                webviewToRespond,
                actionManager,
                executionManager,
                terminalManager,
                collectedUIMessages,
                preloadedFiles,
                alreadyStattedFiles,
                createdFiles,
                modifiedFiles,
                true, // includeWebviewInContext — ask_question 등 webview 필요 도구 지원
                conversationTurnId,
                executedCommands,
                isPlanMode,
              );
              if (hasSuccessfulToolExecution && hasWriteToolExecution2) {
                lastTurnHadSuccessfulToolExecution = true;
                lastExecutionTurnId = conversationTurnId; // review 메시지에 사용할 turnId 저장
                console.log(
                  `[ConversationManager] Tool execution (from LLM) succeeded.`,
                );
              }

              // v1.0.24: EXECUTION 중 LSP 에러 즉시 피드백
              if (inlineDiagErrors2) {
                accumulatedUserParts.push({ text: inlineDiagErrors2 });
              }

              // PreToolUseValidator에 의해 차단된 경우
              const blockResult2 = this.handleBlockedTools(
                hasBlockedByValidator2,
                blockedMessages2,
                hasSuccessfulToolExecution,
                stateManager,
                accumulatedUserParts,
                webviewToRespond,
              );
              if (blockResult2 === "break") break;

              // 사용자가 스킵한 경우에도 플랜 아이템 완료 처리 (무한 루프 방지)
              if (hasUserSkipped2 && currentPlanItem) {
                console.log(
                  `[ConversationManager] User skipped tool execution, marking plan item as done.`,
                );
                this.completePlanItem(
                  taskManager,
                  webviewToRespond,
                  currentPlanItem.id,
                );
              }

              // run_command 실패 카운트 추적
              for (let ri = 0; ri < allowedExecutionCalls.length; ri++) {
                const call = allowedExecutionCalls[ri];
                if (
                  call.name === "run_command" &&
                  call.params.command &&
                  toolResults[ri] &&
                  !toolResults[ri].success
                ) {
                  const cmd = call.params.command;
                  const prev = commandFailureCounts.get(cmd) || 0;
                  commandFailureCounts.set(cmd, prev + 1);
                  console.warn(
                    `[ConversationManager] run_command failed (${prev + 1}/${MAX_SAME_COMMAND_FAILURES}): ${cmd.substring(0, 80)}`,
                  );
                } else if (
                  call.name === "run_command" &&
                  call.params.command &&
                  toolResults[ri]?.success
                ) {
                  commandFailureCounts.delete(call.params.command); // 성공하면 리셋
                }
              }

              const resultSummary =
                ToolExecutionCoordinator.createToolResultSummary(
                  turnCount,
                  allowedExecutionCalls,
                  toolResults,
                );

              if (
                ToolExecutionCoordinator.hasSideEffects(
                  allowedExecutionCalls,
                  toolResults,
                ) &&
                currentPlanItem
              ) {
                this.completePlanItem(
                  taskManager,
                  webviewToRespond,
                  currentPlanItem.id,
                );
              }

              // create_file 하드 가드 차단 감지 → glob_search 강제 유도
              const blockedByReadFailPlan = toolResults.filter(
                (r: any) => r.error?.code === "CREATE_BLOCKED_AFTER_READ_FAIL",
              );
              if (blockedByReadFailPlan.length > 0) {
                const blockedPathsPlan = blockedByReadFailPlan
                  .map((r: any) => r.message || "")
                  .join(", ");
                accumulatedUserParts.push({
                  text: `\n[System] ⚠️ 파일 경로 확인이 필요합니다.\n\n다음 경로의 파일이 존재하지 않습니다: ${blockedPathsPlan}\n**반드시 glob_search 도구로 파일의 실제 위치를 검색하세요.**\n예: { "tool": "glob_search", "pattern": "**/{파일명}" }\nglob_search 결과에서 파일이 발견되면 올바른 경로를 사용하세요.\n파일이 프로젝트에 없으면 사용자에게 알려주세요.`,
                });
                console.log(
                  `[ConversationManager] CREATE_BLOCKED_AFTER_READ_FAIL detected (plan mode), injecting glob_search guidance for: ${blockedPathsPlan}`,
                );
              }

              // 다음 계획 항목이 있으면 계속, 없으면 자동 테스트 후 REVIEW로 전환
              const nextItem = taskManager.getNextPendingItem();
              if (nextItem) {
                accumulatedUserParts.push({ text: llmResponseForExecution });
                accumulatedUserParts.push({ text: resultSummary });
                turnCount++;
                continue;
              } else {
                // 모든 plan item 완료 → 자동 테스트 후 REVIEW 전환
                if (abortSignal?.aborted) {
                  break;
                }
                const testTransition = await this.runTestsAndTransition(
                  webviewToRespond,
                  stateManager,
                  retryCoordinator,
                  createdFiles,
                  modifiedFiles,
                  testFixAttempts,
                  maxTestFixAttempts,
                  isAutoTestRetryEnabled,
                  accumulatedUserParts,
                  turnCount,
                  true, // allPlanItemsDone
                );
                testFixAttempts = testTransition.testFixAttempts;
                if (testTransition.pendingRetryPrompt) {
                  pendingRetryPrompt = true;
                }
                turnCount++;
                continue;
              }
            } else {
              // LLM을 호출했지만 도구 호출이 없음
              const textResponse = this.responseProcessor.extractResponseText(
                cleanExecutionResponse,
              );
              const hasAttachedContext =
                options.terminalContext ||
                (options.selectedFiles && options.selectedFiles.length > 0) ||
                options.diagnosticsContext;

              // 핵심 수정: 파일 변경이 없고 재시도 횟수가 남아있으면 도구 호출 강제
              const hasFileChanges =
                createdFiles.length > 0 || modifiedFiles.length > 0;

              if (
                !hasFileChanges &&
                !isPlanMode &&
                executionNoToolRetryCount < maxExecutionNoToolRetries
              ) {
                // 파일 변경 없이 도구 호출도 없음 → LLM에게 도구 호출 강제 프롬프트 추가 후 재시도
                executionNoToolRetryCount++;
                console.log(
                  `[ConversationManager] EXECUTION phase: No tool calls and no file changes. Forcing tool call (retry ${executionNoToolRetryCount}/${maxExecutionNoToolRetries}).`,
                );

                const planItemTitle = currentPlanItem?.title || "현재 작업";
                accumulatedUserParts.push({ text: llmResponseForExecution });
                accumulatedUserParts.push({
                  text: getExecutionNoToolCallWarningPrompt(planItemTitle),
                });
                turnCount++;
                continue;
              }

              // 첨부 컨텍스트 또는 PLAN 모드일 때는 텍스트 응답을 사용자에게 표시
              if (textResponse && textResponse.trim().length > 0) {
                if (hasAttachedContext || isPlanMode) {
                  console.log(
                    `[ConversationManager] EXECUTION phase: Text response displayed (length: ${textResponse.length}). isPlanMode=${isPlanMode}`,
                  );
                  if (isPlanMode) {
                    planTextResponse = textResponse;
                    await WebviewBridge.streamText(
                      webviewToRespond,
                      "CODEPILOT",
                      textResponse,
                    );
                    // Show approval dialog
                    const vscodeModule = require("vscode");
                    const approval =
                      await vscodeModule.window.showInformationMessage(
                        "구현 계획이 작성되었습니다. 승인하시겠습니까?",
                        { modal: true },
                        "승인",
                        "거절",
                      );
                    if (approval === "승인") {
                      console.log(
                        "[ConversationManager] PLAN approved — auto-executing in CODE mode",
                      );
                      WebviewBridge.receiveMessage(
                        webviewToRespond,
                        "System",
                        "✓ 계획이 승인되었습니다.",
                      );
                      // Save plan to globalStorage
                      try {
                        const globalStoragePath =
                          options.extensionContext?.globalStorageUri?.fsPath;
                        if (globalStoragePath && planTextResponse) {
                          const plansDir = path.join(
                            globalStoragePath,
                            "plans",
                          );
                          if (!fsSync.existsSync(plansDir)) {
                            fsSync.mkdirSync(plansDir, { recursive: true });
                          }
                          const sessionId = options.extensionContext
                            ? (
                                await import("../state/SessionManager")
                              ).SessionManager.getInstance(
                                options.extensionContext,
                              ).getCurrentSession()?.id
                            : undefined;
                          const planFileName = sessionId
                            ? `plan_${sessionId}.md`
                            : `plan_${Date.now()}.md`;
                          const planFilePath = path.join(
                            plansDir,
                            planFileName,
                          );
                          fsSync.writeFileSync(
                            planFilePath,
                            planTextResponse,
                            "utf-8",
                          );
                          console.log(
                            `[ConversationManager] Plan saved: ${planFilePath}`,
                          );
                        }
                      } catch (planSaveError) {
                        console.warn(
                          "[ConversationManager] Failed to save plan file:",
                          planSaveError,
                        );
                      }
                      setTimeout(() => {
                        webviewToRespond.postMessage({
                          command: "autoPlanExecute",
                          text: "위 계획대로 진행해줘",
                        });
                      }, 500);
                    } else {
                      WebviewBridge.receiveMessage(
                        webviewToRespond,
                        "System",
                        "✗ 계획이 거절되었습니다.",
                      );
                    }
                    stateManager.transitionTo(AgentPhase.REVIEW);
                    break;
                  }
                  await WebviewBridge.streamText(
                    webviewToRespond,
                    "CODEPILOT",
                    textResponse,
                  );
                  stateManager.transitionTo(AgentPhase.REVIEW);
                  break;
                } else {
                  console.log(
                    `[ConversationManager] EXECUTION phase: Text response received (length: ${textResponse.length}). Skipping display (EXECUTION phase blocks CODEPILOT text).`,
                  );
                  accumulatedUserParts.push({ text: llmResponseForExecution });
                }
              }

              // 재시도 횟수 초과 또는 파일 변경이 있는 경우 → plan item 완료 처리
              console.log(
                "[ConversationManager] No tool calls returned for plan item execution. Marking current plan item as done and moving to next.",
              );

              if (currentPlanItem) {
                this.completePlanItem(
                  taskManager,
                  webviewToRespond,
                  currentPlanItem.id,
                );
              }

              const nextItem = taskManager.getNextPendingItem();
              if (nextItem) {
                executionNoToolRetryCount = 0; // 다음 plan item으로 이동 시 카운터 리셋
                turnCount++;
                continue;
              } else {
                // 모든 plan item 완료 → 자동 테스트 후 REVIEW 전환
                if (abortSignal?.aborted) {
                  break;
                }
                const testTransition = await this.runTestsAndTransition(
                  webviewToRespond,
                  stateManager,
                  retryCoordinator,
                  createdFiles,
                  modifiedFiles,
                  testFixAttempts,
                  maxTestFixAttempts,
                  isAutoTestRetryEnabled,
                  accumulatedUserParts,
                  turnCount,
                  true, // allPlanItemsDone
                );
                testFixAttempts = testTransition.testFixAttempts;
                if (testTransition.pendingRetryPrompt) {
                  pendingRetryPrompt = true;
                }
                turnCount++;
                continue;
              }
            }
          } else {
            // currentPlanItem이 없거나 investigation kind인 경우: LLM 호출 없이 완료 처리
            console.log(
              "[ConversationManager] EXECUTION phase: no actionable plan item. Marking as done without additional LLM call.",
            );

            if (currentPlanItem) {
              this.completePlanItem(
                taskManager,
                webviewToRespond,
                currentPlanItem.id,
              );
            }

            // 다음 계획 항목이 있으면 계속, 없으면 자동 테스트 후 REVIEW로 전환
            const nextItem = taskManager.getNextPendingItem();
            if (nextItem) {
              turnCount++;
              continue;
            } else {
              // 모든 plan item 완료 → 자동 테스트 후 REVIEW 전환
              if (abortSignal?.aborted) {
                break;
              }
              const testTransition = await this.runTestsAndTransition(
                webviewToRespond,
                stateManager,
                retryCoordinator,
                createdFiles,
                modifiedFiles,
                testFixAttempts,
                maxTestFixAttempts,
                isAutoTestRetryEnabled,
                accumulatedUserParts,
                turnCount,
                true, // allPlanItemsDone
              );
              testFixAttempts = testTransition.testFixAttempts;
              if (testTransition.pendingRetryPrompt) {
                pendingRetryPrompt = true;
              }
              turnCount++;
              continue;
            }
          }
        }
      }

      // Pre-load된 파일 목록을 컨텍스트에 포함
      const preloadedFilesList =
        preloadedFiles.size > 0
          ? `\n\n**⚠️ 이미 읽은 파일 목록 (다시 읽지 마세요):**\n${Array.from(
              preloadedFiles,
            )
              .map((f) => `- ${f}`)
              .join(
                "\n",
              )}\n\n이 파일들은 이미 읽었으므로 다시 read_file을 호출하지 마세요. 위 대화 기록에서 파일 내용을 확인하세요.`
          : "";

      const planContext = currentPlanItem
        ? `\n\nCURRENT TASK: ${currentPlanItem.title}${currentPlanItem.detail ? `\nDETAIL: ${currentPlanItem.detail}` : ""}${preloadedFilesList}\n\n**중요**: 필요한 파일이 여러 개라면 반드시 한 번의 응답에 모든 도구를 호출하세요. 여러 도구 호출을 연속해서 작성할 수 있습니다. 한 번에 최대한 많은 작업을 수행하세요.`
        : `\n\n=== NO ACTIVE PLAN ===\nAnalyze the user query and proceed with necessary actions (e.g. create a plan using JSON format).${preloadedFilesList}\n\n**중요**: 필요한 파일이 여러 개라면 반드시 한 번의 응답에 모든 도구를 호출하세요. 여러 도구 호출을 연속해서 작성할 수 있습니다.`;

      console.log(
        `[ConversationManager] Calling LLM for Turn ${turnCount + 1} (Phase: ${currentPhase})`,
      );
      pendingRetryPrompt = false; // LLM에 전달되었으므로 리셋
      const useErrorFallbackModel =
        retryCoordinator.consumePendingFallbackModel();

      // LLM 호출 전 UI 상태 업데이트
      WebviewBridge.sendProcessingStep(webviewToRespond, "thinking");
      WebviewBridge.sendProcessingStatus(
        webviewToRespond,
        "thinking",
        `LLM 응답 대기 중...`,
      );

      // 스트리밍 설정 확인
      const isStreamingEnabled = options.extensionContext
        ? await SettingsManager.getInstance(
            options.extensionContext,
          ).isStreamingEnabled()
        : false;

      // 네이티브 툴 콜링 설정 확인 (INVESTIGATION/EXECUTION 단계에서만 tools 배열 전달)
      const isToolCallingPhase =
        (currentPhase as AgentPhase) === AgentPhase.INVESTIGATION ||
        (currentPhase as AgentPhase) === AgentPhase.EXECUTION;
      if (isToolCallingPhase) {
        const isNativeToolCallingEnabled = options.extensionContext
          ? await SettingsManager.getInstance(
              options.extensionContext,
            ).isNativeToolCallingEnabled()
          : false;
        if (isNativeToolCallingEnabled) {
          const modelType = this.llmManager.getCurrentModel();
          if (modelType === AiModelType.ADMIN) {
            const adminConfig = this.llmManager.getAdminModelConfig();
            const nativeSupported =
              adminConfig?.nativeToolCallingSupported === true ||
              String(adminConfig?.nativeToolCallingSupported) === "true";
            console.log(
              `[ConversationManager] nativeToolCallingSupported=${adminConfig?.nativeToolCallingSupported} (resolved=${nativeSupported}) model=${adminConfig?.model}`,
            );
            if (nativeSupported) {
              nativeToolsForCall =
                ToolSpecBuilder.buildOpenAIToolsConfig(allowedTools);
              console.log(
                `[ConversationManager] Native tool calling enabled for admin model: ${adminConfig?.model}`,
              );
            } else if (adminConfig && !nativeToolCallingNoticeShown) {
              // admin 모델이지만 native tool calling 미지원 → 1회 안내
              nativeToolCallingNoticeShown = true;
              WebviewBridge.receiveMessage(
                webviewToRespond,
                "SYSTEM_INFO",
                `ℹ️ 현재 모델(${adminConfig.model})은 네이티브 툴 콜링을 지원하지 않습니다. 설정에서 [네이티브 툴 콜링]을 OFF 하세요. (텍스트 기반 파싱으로 동작 중)`,
              );
            }
          }
          // Ollama 로컬 모델: 설정 ON이면 네이티브 툴 콜링 활성화
          if (modelType === AiModelType.OLLAMA) {
            nativeToolsForCall =
              ToolSpecBuilder.buildOpenAIToolsConfig(allowedTools);
            console.log(
              `[ConversationManager] Native tool calling enabled for Ollama local model`,
            );
          }
        }
      }

      let llmResponse: string;
      const llmStartTime = Date.now(); // v9.7.0: LLM 호출 시간 측정

      // REVIEW/DONE 단계에서만 실제 스트리밍 출력, EXECUTION은 제외 ([] 깜빡거림 방지)
      // 단, pendingMCPResultInterpretation=true면 INVESTIGATION에서도 MCP 결과 해석을 스트리밍
      // PLAN 모드는 EXECUTION 단계에서 계획 텍스트를 직접 출력하므로 스트리밍 허용
      // 스코프 밖(removeLastMessage 가드 등)에서도 접근해야 하므로 블록 밖에 선언
      // AGENT 모드: 스트리밍 중 UI 표시 안 함 (도구 JSON과 텍스트 구분 불가)
      // 대신 스트리밍 완료 후 텍스트만 streamText로 표시
      // PLAN 모드: INVESTIGATION 단계에서는 스트리밍 표시 안 함 (JSON plan이 채팅에 노출되는 문제 방지)
      const isPlanInvestigation =
        isPlanMode && (currentPhase as AgentPhase) === AgentPhase.INVESTIGATION;
      const shouldStreamToUI =
        (currentPhase as AgentPhase) === AgentPhase.REVIEW ||
        (currentPhase as AgentPhase) === AgentPhase.DONE ||
        pendingMCPResultInterpretation ||
        (isPlanMode && !isPlanInvestigation);

      // 스트리밍 즉시 파일 생성 설정 (onChunk 동기 핸들러에서 사용)
      const isAutoToolForStreaming =
        await SettingsManager.getInstance().isAutoToolExecutionEnabled();
      const isAutoUpdateForStreaming =
        await SettingsManager.getInstance().isAutoUpdateEnabled();

      // Fix: 스트리밍 중 완성된 create_file/update_file 즉시 실행 추적 (턴별 리셋)
      const streamingCreatedPaths = new Set<string>();
      const streamingUpdatedPaths = new Set<string>();
      // 스트리밍 중 pending 처리된 경로 (승인 여부 무관 — post-stream 중복 방지용)
      const streamingHandledPaths = new Set<string>();

      if (isStreamingEnabled) {
        // 스트리밍 모드: 실시간으로 웹뷰에 청크 전송
        console.log(
          `[ConversationManager] Streaming mode enabled for Turn ${turnCount + 1}`,
        );

        // 채팅 패널 타이핑 효과 (자연어 텍스트만, 코드 블록은 ToolExecutor가 처리)
        let textStreamer: StreamingCodeApplier | null = null;

        if (shouldStreamToUI) {
          textStreamer = new StreamingCodeApplier({
            onTextChunk: (chunk) => {
              WebviewBridge.streamMessageChunk(webviewToRespond, chunk);
            },
          });
        }

        if (shouldStreamToUI) {
          // 스트리밍 시작 알림 (AGENT 모드는 shouldStreamToUI=false이므로 여기 안 탐)
          WebviewBridge.startStreamingMessage(
            webviewToRespond,
            "assistant",
            conversationTurnId ? { conversationTurnId } : undefined,
          );
        }

        let accumulatedResponse = "";
        let streamingCreatePromise: Promise<void> = Promise.resolve();
        let streamLastFileContentPos = 0;
        const FILE_END_MARKER = "</file_content>";

        // 스트리밍 즉시 파일 생성/수정 공통 실행 함수 (FILE_END_MARKER + onNativeToolComplete 공용)
        // needsApproval=true: 실행 전 사용자 승인 모달 표시
        const executeStreamingFileOp = (
          path: string,
          capturedCall: ToolUse,
          needsApproval: boolean = false,
        ) => {
          const isCreate = capturedCall.name === "create_file";
          const trackingSet = isCreate
            ? streamingCreatedPaths
            : streamingUpdatedPaths;
          const actionLabel = isCreate ? "생성" : "수정";

          if (needsApproval) {
            streamingHandledPaths.add(`${capturedCall.name}:${path}`);
          }
          streamingCreatePromise = streamingCreatePromise.then(async () => {
            if (abortSignal?.aborted) {
              return;
            }
            if (needsApproval) {
              const detailDisplay = `: ${path.substring(0, 50)}${path.length > 50 ? "..." : ""}`;
              WebviewBridge.receiveMessage(
                webviewToRespond,
                "System",
                `⏳ [Pending] 파일 ${actionLabel}${detailDisplay} - 사용자 승인 필요`,
              );
              const result = await vscode.window.showInformationMessage(
                `파일 ${actionLabel}: ${path}`,
                { modal: true },
                "실행",
                "건너뛰기",
              );
              if (result !== "실행") {
                return;
              }
            }
            const streamRoot =
              ProjectManager.getInstance().getCurrentProject()?.root || "";
            const streamCtx: ToolExecutionContext = {
              projectRoot: streamRoot,
              workspaceRoot: streamRoot,
              actionManager,
              executionManager,
              terminalManager,
              contextManager: this.contextManager,
            };
            const fileName = path.split("/").pop() || path;
            WebviewBridge.sendProcessingStatus(
              webviewToRespond,
              "executing",
              `파일 ${actionLabel} 중: ${fileName}...`,
            );
            const streamResults = await toolExecutor.executeTools(
              [capturedCall],
              streamCtx,
              undefined,
              undefined,
              abortSignal,
            );
            if (streamResults[0]?.success && capturedCall.params.path) {
              const p = capturedCall.params.path as string;
              trackingSet.add(p);
              if (isCreate) {
                if (!createdFiles.includes(p) && !modifiedFiles.includes(p)) {
                  createdFiles.push(p);
                }
              } else {
                if (!modifiedFiles.includes(p) && !createdFiles.includes(p)) {
                  modifiedFiles.push(p);
                }
              }
              if (streamResults[0]) {
                ToolExecutionCoordinator.sendSingleToolResultToUI(
                  webviewToRespond,
                  capturedCall,
                  streamResults[0],
                );
              }
            } else if (streamResults[0] && !streamResults[0].success) {
              // 실패 시 채팅에 메시지 표시 + 메인 실행에서 중복 실행 방지
              const reason =
                streamResults[0].message ||
                streamResults[0].error?.message ||
                "실행 실패";
              const isSecurityBlock =
                streamResults[0].error?.code === "BLOCKED_BY_VALIDATOR";
              const icon = isSecurityBlock ? "🚫 [차단]" : "❌ [Failed]";
              WebviewBridge.receiveMessage(
                webviewToRespond,
                "System",
                `${icon} ${reason}`,
              );
              // 실패한 도구도 handled로 추가 — 스트리밍 중 같은 파일 반복 실행 방지
              streamingHandledPaths.add(`${capturedCall.name}:${path}`);
            }
          });
        };

        // 네이티브 tool_call 완성 시 콜백
        // ON+ON: 즉시 실행 / ON+파일OFF 또는 도구OFF: 즉시 pending
        const onNativeToolComplete = (
          toolName: string,
          args: Record<string, any>,
        ) => {
          if (
            (toolName !== "create_file" && toolName !== "update_file") ||
            !args.path
          ) {
            return;
          }
          const p = args.path as string;
          const trackingSet =
            toolName === "create_file"
              ? streamingCreatedPaths
              : streamingUpdatedPaths;
          const handledKey = `${toolName}:${p}`;
          if (trackingSet.has(p) || streamingHandledPaths.has(handledKey)) {
            return;
          }
          const capturedCall: ToolUse = { name: toolName, params: { ...args } };
          const needsApproval =
            !isAutoToolForStreaming || !isAutoUpdateForStreaming;
          executeStreamingFileOp(p, capturedCall, needsApproval);
        };

        // onChunk는 SYNC여야 함 (LLM API가 await 안 함)
        const onChunk = (chunk: string, done: boolean) => {
          accumulatedResponse += chunk;

          if (
            isAutoToolForStreaming &&
            isAutoUpdateForStreaming &&
            !isPlanMode
          ) {
            // ON+ON: </file_content> 감지 즉시 실행 (PLAN 모드에서는 비활성)
            let endIdx = accumulatedResponse.indexOf(
              FILE_END_MARKER,
              streamLastFileContentPos,
            );
            while (endIdx !== -1) {
              const segmentEnd = endIdx + FILE_END_MARKER.length;
              const segment = accumulatedResponse.substring(0, segmentEnd);
              streamLastFileContentPos = segmentEnd;
              const segCalls = ToolParser.parseCodeBlockFormat(segment, []);
              for (const call of segCalls) {
                if (
                  call.name === "create_file" &&
                  call.params.path &&
                  !streamingCreatedPaths.has(call.params.path as string)
                ) {
                  executeStreamingFileOp(
                    call.params.path as string,
                    call,
                    false,
                  );
                }
                if (
                  call.name === "update_file" &&
                  call.params.path &&
                  !streamingUpdatedPaths.has(call.params.path as string)
                ) {
                  executeStreamingFileOp(
                    call.params.path as string,
                    call,
                    false,
                  );
                }
              }
              endIdx = accumulatedResponse.indexOf(
                FILE_END_MARKER,
                streamLastFileContentPos,
              );
            }
          } else if (!isPlanMode) {
            // 도구OFF 또는 파일OFF: </file_content> 감지 즉시 pending 처리 (PLAN 모드에서는 비활성)
            let endIdx = accumulatedResponse.indexOf(
              FILE_END_MARKER,
              streamLastFileContentPos,
            );
            while (endIdx !== -1) {
              const segmentEnd = endIdx + FILE_END_MARKER.length;
              const segment = accumulatedResponse
                .substring(0, segmentEnd)
                .replace(/<think>[\s\S]*?<\/think>/g, "");
              streamLastFileContentPos = segmentEnd;
              const segCalls = ToolParser.parseCodeBlockFormat(segment, []);
              for (const call of segCalls) {
                const p = call.params.path as string;
                if (
                  call.name === "create_file" &&
                  p &&
                  !streamingCreatedPaths.has(p) &&
                  !streamingHandledPaths.has(`create_file:${p}`)
                ) {
                  executeStreamingFileOp(p, call, true);
                }
                if (
                  call.name === "update_file" &&
                  p &&
                  !streamingUpdatedPaths.has(p) &&
                  !streamingHandledPaths.has(`update_file:${p}`)
                ) {
                  executeStreamingFileOp(p, call, true);
                }
              }
              endIdx = accumulatedResponse.indexOf(
                FILE_END_MARKER,
                streamLastFileContentPos,
              );
            }
          }

          // 채팅 타이핑 효과: textStreamer가 도구 호출 제외하고 텍스트만 출력
          if (textStreamer) {
            textStreamer.processChunk(chunk);
          }

          if (done) {
            // 타이핑 완료 (fire-and-forget, async)
            if (textStreamer) {
              textStreamer.complete().catch((err: Error) => {
                console.error(
                  "[ConversationManager] Text streaming error:",
                  err,
                );
              });
            }
            if (shouldStreamToUI) {
              WebviewBridge.endStreamingMessage(webviewToRespond);
            }
          }
        };

        // 에러 폴백 모델 우선 적용 (동일 에러 3회 반복 시)
        if (useErrorFallbackModel && this.stateManager) {
          console.log(
            "[ConversationManager] Error fallback model triggered (streaming)",
          );
          llmResponse = await this.llmManager.sendMessageWithErrorFallbackModel(
            activeSystemPrompt + planContext,
            accumulatedUserParts,
            this.stateManager,
            { signal: abortSignal },
          );
        } else if (
          intent &&
          intent.category === "execution" &&
          this.stateManager
        ) {
          // execution 의도일 때 Command 모델 사용 (스트리밍)
          console.log(
            "[ConversationManager] Execution intent detected, using Command model (streaming)",
          );
          llmResponse =
            await this.llmManager.sendMessageWithCommandModelStreaming(
              activeSystemPrompt + planContext,
              accumulatedUserParts,
              onChunk,
              this.stateManager,
              { signal: abortSignal },
            );
        } else {
          llmResponse =
            await this.llmManager.sendMessageWithSystemPromptStreaming(
              activeSystemPrompt + planContext,
              accumulatedUserParts,
              onChunk,
              {
                signal: abortSignal,
                nativeTools: nativeToolsForCall,
                onNativeToolComplete,
                thinkingLevel,
                onRetryNotify: (attempt, message) => {
                  WebviewBridge.sendProcessingStatus(
                    webviewToRespond,
                    "retrying",
                    message,
                  );
                },
              },
            );
        }
        // 스트리밍 중 시작된 create_file 모두 완료 대기
        await streamingCreatePromise;
      } else {
        // 비스트리밍 모드: 기존 방식
        const retryNotify = (attempt: number, message: string) => {
          WebviewBridge.sendProcessingStatus(
            webviewToRespond,
            "retrying",
            message,
          );
        };
        // 에러 폴백 모델 우선 적용 (동일 에러 3회 반복 시)
        if (useErrorFallbackModel && this.stateManager) {
          console.log("[ConversationManager] Error fallback model triggered");
          llmResponse = await this.llmManager.sendMessageWithErrorFallbackModel(
            activeSystemPrompt + planContext,
            accumulatedUserParts,
            this.stateManager,
            { signal: abortSignal, thinkingLevel, onRetryNotify: retryNotify },
          );
        } else if (
          intent &&
          intent.category === "execution" &&
          this.stateManager
        ) {
          // execution 의도일 때 Command 모델 사용
          console.log(
            "[ConversationManager] Execution intent detected, using Command model",
          );
          llmResponse = await this.llmManager.sendMessageWithCommandModel(
            activeSystemPrompt + planContext,
            accumulatedUserParts,
            this.stateManager,
            { signal: abortSignal, thinkingLevel, onRetryNotify: retryNotify },
          );
        } else {
          llmResponse = await this.llmManager.sendMessageWithSystemPrompt(
            activeSystemPrompt + planContext,
            accumulatedUserParts,
            {
              signal: abortSignal,
              nativeTools: nativeToolsForCall,
              thinkingLevel,
              onRetryNotify: retryNotify,
            },
          );
        }
      }

      if (abortSignal?.aborted) {
        break;
      }

      // v9.7.0: LLM 호출 메트릭 기록
      const llmResponseTime = Date.now() - llmStartTime;
      const estimatedTokenCount = estimateTokens(llmResponse);
      let actualModelName: string | undefined;
      try {
        actualModelName = await this.llmManager.getCurrentModelName();
      } catch {}
      usageMetrics.recordLLMCall(
        llmResponseTime,
        estimatedTokenCount,
        true,
        actualModelName,
      );
      usageMetrics.incrementTurnCount();

      // CODE 모드 토큰 누적 (REVIEW 요약 메시지 렌더링 후 전송)
      this._pendingTokenInfo = {
        tokens: (this._pendingTokenInfo?.tokens || 0) + estimatedTokenCount,
        model: actualModelName,
      };

      console.log(
        `[ConversationManager] LLM Raw Response (Turn ${turnCount + 1}): (${llmResponse.length} chars)`,
      );

      // 0.5. thinking 내용을 UI processing-steps 영역에 표시
      const thinkingMatch = llmResponse.match(/<think>([\s\S]*?)<\/think>/);
      if (thinkingMatch) {
        const thinkingText = thinkingMatch[1].trim();
        if (thinkingText) {
          WebviewBridge.sendThinkingContent(webviewToRespond, thinkingText);
        }
      }

      // 1. 응답 정제 (<think> 태그 및 JSON thinking 제거)
      // 자연어는 모든 단계에서 유지 (마크다운 구조 보존)
      let cleanResponse = StringUtils.cleanText(llmResponse, {
        removeThinking: true,
        removeNaturalLanguage: false,
        removeSystemMessages: false,
        removeToolTags: false,
        removeJsonThinking: true,
        extractJson: false,
      });

      // 도구 호출만 남기고 자연어 텍스트 제거 (EXECUTION phase에서 특히 중요)
      // 핵심: EXECUTION phase에서는 "생각", "설명" → 전부 무시, tool call만 추출
      if (currentPhase === AgentPhase.EXECUTION) {
        // 새 형식: { "tool": "..." } 패턴 확인
        // ⚠️ llmResponse (원본)에서 체크 - cleanResponse는 자연어 필터링으로 JSON이 손상될 수 있음
        const hasToolCallPattern = /\{\s*["']tool["']\s*:\s*["']/.test(
          llmResponse,
        );

        if (hasToolCallPattern) {
          // 도구 호출 형식 감지됨 - 원본 유지 (ToolParser에서 처리)
          console.log(
            `[ConversationManager] EXECUTION phase: Tool call detected`,
          );
          // 스트리밍 모드에서 tool call JSON이 chat에 빈 버블로 남지 않도록 제거
          // shouldStreamToUI=false(EXECUTION)면 버블이 없으므로 제거하지 않음 → 이전 코드블록 삭제 방지
          if (isStreamingEnabled && shouldStreamToUI) {
            WebviewBridge.removeLastMessage(webviewToRespond);
          }
        } else {
          // 도구 호출이 없으면 자연어 응답으로 간주
          console.warn(
            `[ConversationManager] EXECUTION phase: No tool calls found. LLM provided natural language instead of tool calls.`,
          );

          // ⚠️ MCP 도구 결과 해석 대기 중이면 → 텍스트를 사용자에게 표시 후 종료
          if (pendingMCPResultInterpretation) {
            console.log(
              `[ConversationManager] EXECUTION phase: pendingMCPResultInterpretation=true. Displaying LLM text response to user.`,
            );
            pendingMCPResultInterpretation = false;
            lastTurnHadSuccessfulToolExecution = false;
            (this as any).naturalLanguageRetry = 0;

            // v9.7.4: JSON plan 응답이 raw로 노출되는 문제 수정
            // LLM이 tool call 대신 JSON plan을 반환한 경우 → 스트리밍된 raw JSON 제거 후 정리된 텍스트로 대체
            const isJsonPlanResponse = /\{\s*"plan"\s*:/.test(llmResponse);

            if (isStreamingEnabled && isJsonPlanResponse) {
              // 스트리밍으로 이미 표시된 raw JSON 제거
              WebviewBridge.removeLastMessage(webviewToRespond);
              console.log(
                `[ConversationManager] ${isPlanMode ? "PLAN" : "EXECUTION"} phase: Removed streamed JSON plan from UI`,
              );

              if (isPlanMode) {
                // PLAN mode: don't show plan items in chat — wait for markdown plan text
                console.log(
                  `[ConversationManager] PLAN mode: JSON plan suppressed from chat UI`,
                );
              }

              // plan items에서 사용자 친화적 요약 추출 (CODE mode only)
              const planItems = ToolParser.parsePlanItems(llmResponse);
              if (planItems.length > 0 && !isPlanMode) {
                const summary = planItems
                  .map(
                    (item) =>
                      `- ${item.title}${item.detail ? `: ${item.detail}` : ""}`,
                  )
                  .join("\n");
                await WebviewBridge.streamText(
                  webviewToRespond,
                  "CODEPILOT",
                  summary,
                );
              }
            } else if (!isStreamingEnabled) {
              // 스트리밍 비활성화 시 별도 출력
              let cleanMCPResponse = StringUtils.cleanText(llmResponse, {
                removeThinking: true,
                removeNaturalLanguage: false,
                removeSystemMessages: false,
                removeToolTags: false,
                removeJsonThinking: true,
                extractJson: false,
              });

              // JSON plan이면 사용자 친화적 텍스트로 변환
              if (isJsonPlanResponse) {
                const planItems = ToolParser.parsePlanItems(llmResponse);
                if (planItems.length > 0) {
                  cleanMCPResponse = planItems
                    .map(
                      (item) =>
                        `- ${item.title}${item.detail ? `: ${item.detail}` : ""}`,
                    )
                    .join("\n");
                }
              }

              if (cleanMCPResponse && cleanMCPResponse.trim()) {
                await WebviewBridge.streamText(
                  webviewToRespond,
                  "CODEPILOT",
                  cleanMCPResponse,
                );
              }
            }

            // EXECUTION → REVIEW → DONE (상태 머신 규칙 준수)
            stateManager.transitionTo(AgentPhase.REVIEW);
            stateManager.transitionTo(AgentPhase.DONE, {});
            break;
          }

          // 최적화: 이전 턴에서 도구가 성공적으로 실행됐고 plan의 모든 item이 완료되면
          // "완료 확인" 호출 없이 바로 REVIEW로 전환 (불필요한 LLM 호출 제거)
          // ⚠️ plan이 한 번도 생성되지 않은 경우: 조기 종료 금지, 다음 턴으로 계속
          const remainingPlanItems = taskManager.getNextPendingItem();
          const planExistsForReview = taskManager.listPlanItems().length > 0;
          if (
            lastTurnHadSuccessfulToolExecution &&
            planExistsForReview &&
            !remainingPlanItems
          ) {
            // Case A: plan 기반 플로우 — 모든 plan item 완료
            console.log(
              `[ConversationManager] EXECUTION phase: All plan items completed. Skipping completion confirmation and transitioning to REVIEW.`,
            );
            // 스트리밍 모드에서 이미 UI에 표시된 자연어 응답을 제거 (버블이 있을 때만)
            if (isStreamingEnabled && shouldStreamToUI) {
              WebviewBridge.removeLastMessage(webviewToRespond);
            }
            // "완료 확인" 호출 없이 바로 REVIEW로 전환
            stateManager.transitionTo(AgentPhase.REVIEW);
            lastTurnHadSuccessfulToolExecution = false; // 리셋
            (this as any).naturalLanguageRetry = 0; // 리셋
            cleanResponse = ""; // 자연어 응답은 무시 (불필요한 "완료했습니다" 메시지)
          } else if (
            lastTurnHadSuccessfulToolExecution &&
            !planExistsForReview
          ) {
            // Case C: no-plan 실행 — plan이 한 번도 생성되지 않음
            // 도구 성공만으로 완료 판정 불가, LLM에게 다음 턴을 줘서 계속 작업하게 함
            console.log(
              `[ConversationManager] EXECUTION phase: Tool succeeded but no plan exists. Continuing to let LLM work.`,
            );
            lastTurnHadSuccessfulToolExecution = false;
            (this as any).naturalLanguageRetry = 0;
          } else if (lastTurnHadSuccessfulToolExecution && remainingPlanItems) {
            // 남은 plan item이 있으면 계속 진행 (다음 plan item 실행)
            console.log(
              `[ConversationManager] EXECUTION phase: Previous turn had successful tool execution but remaining plan items exist. Continuing to next item.`,
            );
            // 스트리밍 모드에서 이미 UI에 표시된 자연어 응답을 제거 (버블이 있을 때만)
            if (isStreamingEnabled && shouldStreamToUI) {
              WebviewBridge.removeLastMessage(webviewToRespond);
            }
            lastTurnHadSuccessfulToolExecution = false; // 리셋
            (this as any).naturalLanguageRetry = 0; // 리셋
            // cleanResponse는 유지하지 않음 (자연어 응답 무시하고 다음 plan item으로)
            cleanResponse = "";
          } else {
            // 자연어 응답 (도구 호출 없음) — write tool 이력 기반 종료 판정
            const hasWriteHistory =
              createdFiles.length > 0 || modifiedFiles.length > 0;

            if (hasWriteHistory) {
              // write tool 이력 있음 → 작업 완료 후 마무리 응답으로 판단 → done
              console.log(
                `[ConversationManager] EXECUTION phase: Natural language response with write history. Treating as done.`,
              );
              (this as any).naturalLanguageRetry = 0;
            } else {
              // write tool 이력 없음 → thinking만 보낸 케이스 가능 → nudge 1회
              // PLAN 모드는 텍스트 계획 출력이 목적 → nudge 금지
              if (isPlanMode) {
                if (cleanResponse.trim()) {
                  console.log(
                    `[ConversationManager] PLAN mode: Natural language response accepted as plan output. Done.`,
                  );
                  // Show approval dialog (VS Code modal)
                  planTextResponse = cleanResponse.trim();
                  const vscodeModule = require("vscode");
                  const approval =
                    await vscodeModule.window.showInformationMessage(
                      "구현 계획이 작성되었습니다. 승인하시겠습니까?",
                      { modal: true },
                      "승인",
                      "거절",
                    );
                  if (approval === "승인") {
                    console.log(
                      "[ConversationManager] PLAN approved — auto-executing in CODE mode",
                    );
                    // Auto-execute: send plan as CODE mode message
                    WebviewBridge.receiveMessage(
                      webviewToRespond,
                      "System",
                      "✓ 계획이 승인되었습니다.",
                    );
                    // Save plan to globalStorage
                    try {
                      const globalStoragePath =
                        options.extensionContext?.globalStorageUri?.fsPath;
                      if (globalStoragePath && planTextResponse) {
                        const plansDir = path.join(globalStoragePath, "plans");
                        if (!fsSync.existsSync(plansDir)) {
                          fsSync.mkdirSync(plansDir, { recursive: true });
                        }
                        const sessionId = options.extensionContext
                          ? (
                              await import("../state/SessionManager")
                            ).SessionManager.getInstance(
                              options.extensionContext,
                            ).getCurrentSession()?.id
                          : undefined;
                        const planFileName = sessionId
                          ? `plan_${sessionId}.md`
                          : `plan_${Date.now()}.md`;
                        const planFilePath = path.join(plansDir, planFileName);
                        fsSync.writeFileSync(
                          planFilePath,
                          planTextResponse,
                          "utf-8",
                        );
                        console.log(
                          `[ConversationManager] Plan saved: ${planFilePath}`,
                        );
                      }
                    } catch (planSaveError) {
                      console.warn(
                        "[ConversationManager] Failed to save plan file:",
                        planSaveError,
                      );
                    }
                    // Queue a CODE mode execution with the plan context
                    setTimeout(() => {
                      webviewToRespond.postMessage({
                        command: "autoPlanExecute",
                        text: "위 계획대로 진행해줘",
                      });
                    }, 500);
                  } else {
                    WebviewBridge.receiveMessage(
                      webviewToRespond,
                      "System",
                      "✗ 계획이 거절되었습니다. 새로 질의하거나 수정 사항을 알려주세요.",
                    );
                  }
                  break; // 계획 출력 완료 → 루프 종료
                } else {
                  // think 태그만 있고 실제 계획 텍스트 없음 → 한 번 더 요청
                  console.log(
                    `[ConversationManager] PLAN mode: No visible plan text (only thinking). Requesting plan output.`,
                  );
                  accumulatedUserParts.push({
                    text: "지금 바로 구현 계획을 Markdown 텍스트로 출력해주세요. 도구 호출 없이 텍스트만 출력하세요.",
                  });
                  turnCount++;
                  continue;
                }
              } else {
                const naturalLanguageRetryKey = "naturalLanguageRetry";
                const currentRetryCount =
                  (this as any)[naturalLanguageRetryKey] || 0;
                if (currentRetryCount < 1) {
                  (this as any)[naturalLanguageRetryKey] =
                    currentRetryCount + 1;
                  console.log(
                    `[ConversationManager] EXECUTION phase: Natural language response with no write history. Nudging once (attempt ${currentRetryCount + 1}/1)`,
                  );
                  // 스트리밍 모드에서 이미 UI에 표시된 자연어 응답을 제거 (버블이 있을 때만)
                  if (isStreamingEnabled && shouldStreamToUI) {
                    WebviewBridge.removeLastMessage(webviewToRespond);
                  }
                  accumulatedUserParts.push({
                    text: getExecutionNudgePrompt(),
                  });
                  turnCount++;
                  continue; // 즉시 재요청
                } else {
                  // nudge 1회 후에도 텍스트만 → LLM 판단 존중, done
                  console.log(
                    `[ConversationManager] EXECUTION phase: Nudge exhausted (1/1). Respecting LLM decision.`,
                  );
                  (this as any)[naturalLanguageRetryKey] = 0;
                }
              }
            }
            cleanResponse = "";
          }
        }
      }

      // 1-1. INVESTIGATION 단계 Output Contract 검증: plan과 실행 도구가 함께 나오면
      // 개선: 재요청 대신 실행 도구만 처리하고 plan은 무시 (턴 낭비 방지)
      // ⚠️ ripgrep_search는 허용 (조사 행위, 부작용 없음)
      // ⚠️ JSON Function Calling도 지원
      if (currentPhase === AgentPhase.INVESTIGATION) {
        // JSON plan 확인
        // ⚠️ llmResponse (원본)에서 체크 - cleanResponse는 자연어 필터링으로 JSON이 손상될 수 있음
        const hasPlan =
          /\{\s*"plan"\s*:/.test(llmResponse) ||
          /```json[\s\S]*?"plan"[\s\S]*?```/i.test(llmResponse);

        // 도구 호출에서 실행 도구 확인
        // ⚠️ llmResponse (원본)에서 파싱 - cleanResponse는 자연어 필터링으로 JSON이 손상될 수 있음
        const parsedToolCalls = ToolParser.parseToolCalls(llmResponse);
        const executionTools = [
          Tool.CREATE_FILE,
          Tool.UPDATE_FILE,
          Tool.REMOVE_FILE,
          Tool.RUN_COMMAND,
        ];
        const hasExecutionTool = parsedToolCalls.some((call) =>
          executionTools.includes(call.name as Tool),
        );

        // 개선: plan과 실행 도구가 함께 있으면 plan을 무시하고 실행 도구만 처리
        // 이전: 즉시 재요청 → 불필요한 턴 발생, 429 에러 유발
        // 현재: 실행 도구 처리 후 EXECUTION 단계로 전환
        if (hasPlan && hasExecutionTool) {
          console.log(
            "[ConversationManager] INVESTIGATION: plan과 실행 도구가 함께 제공됨. read-only 도구만 실행하고 write 도구는 다음 턴으로 미룹니다.",
          );
          // plan JSON 부분 제거
          cleanResponse = cleanResponse
            .replace(
              /```json[\s\S]*?\{\s*"plan"\s*:[\s\S]*?\}[\s\S]*?```/gi,
              "",
            )
            .replace(/\{\s*"plan"\s*:\s*\[[\s\S]*?\]\s*\}/g, "")
            .trim();
          // Filter out write tools from the response — only keep read-only tools
          // Write tools will be re-generated by LLM in the next turn with actual file content
          const writeToolNames = [
            Tool.CREATE_FILE,
            Tool.UPDATE_FILE,
            Tool.REMOVE_FILE,
            Tool.RUN_COMMAND,
          ];
          for (const wt of writeToolNames) {
            // Remove JSON tool call blocks for write tools
            const wtRegex = new RegExp(
              `\\{\\s*"tool"\\s*:\\s*"${wt}"[\\s\\S]*?\\}(?:\\s*<file_content>[\\s\\S]*?</file_content>)?`,
              "g",
            );
            cleanResponse = cleanResponse.replace(wtRegex, "").trim();
          }
          const remainingTools = ToolParser.parseCodeBlockFormat(cleanResponse);
          if (remainingTools.length > 0) {
            console.log(
              `[ConversationManager] INVESTIGATION: ${remainingTools.length} read-only tool(s) kept, write tools filtered out`,
            );
          } else {
            console.log(
              `[ConversationManager] INVESTIGATION: All tools were write tools, keeping plan for next turn`,
            );
          }
          // Transition to EXECUTION after read-only tools are processed
          stateManager.transitionTo(AgentPhase.EXECUTION);
          console.log(
            "[ConversationManager] Transitioning to EXECUTION phase (tool found with plan)",
          );
        }
      }

      // 2. <investigation_done/> 토큰 파싱 (제거 전에 먼저 파싱)
      // ⚠️ 중요: llmResponse에서 직접 파싱 (cleanResponse는 이미 정제되었을 수 있음)
      const investigationDoneToken =
        ToolParser.parseInvestigationDone(llmResponse);
      if (investigationDoneToken) {
        console.log(
          `[ConversationManager] investigation_done token detected in raw response`,
        );
      }

      // 3. 시스템 내부 토큰 제거 (사용자에게 표시되면 안 됨)
      // <investigation_done/> 토큰과 { "investigation_done": true } JSON은 시스템 내부용이므로 제거
      cleanResponse = cleanResponse
        .replace(/<investigation_done\s*\/>/gi, "")
        .replace(/\{\s*["']investigation_done["']\s*:\s*true\s*\}/gi, "")
        .trim();

      // EXECUTION phase에서 텍스트만 나오면 즉시 재요청 (핵심 개선)
      // PLAN 모드는 텍스트 계획 출력이 목적이므로 도구 호출 강제 금지
      if (
        currentPhase === AgentPhase.EXECUTION &&
        !isPlanMode &&
        llmResponse.trim()
      ) {
        // 도구 호출이 있는지 확인 (새 형식: { "tool": "..." })
        // ⚠️ llmResponse (원본)에서 체크 - cleanResponse는 자연어 필터링으로 JSON이 손상될 수 있음
        const hasToolCallInExecution = /\{\s*["']tool["']\s*:\s*["']/.test(
          llmResponse,
        );

        if (!hasToolCallInExecution) {
          // 텍스트만 있고 도구 호출이 없으면 자연어 응답으로 간주
          console.warn(
            `[ConversationManager] EXECUTION phase: LLM provided natural language text instead of tool calls. Rejecting and requesting again.`,
          );
          accumulatedUserParts.push({
            text: getExecutionOutputContractViolationPrompt(),
          });
          turnCount++;
          continue; // 즉시 재요청
        }
      }

      // 중복 실행 방지: 전체 llmResponse에서 모든 tool call을 한 번만 파싱
      // ⚠️ llmResponse (원본)에서 파싱 - cleanResponse는 자연어 필터링으로 JSON이 손상될 수 있음
      const allToolCallsParseWarnings: string[] = [];
      const allToolCallsFromResponse = ToolParser.parseToolCalls(
        llmResponse,
        allToolCallsParseWarnings,
      );

      // ⚡ 알 수 없는 도구 이름 감지 → 즉시 재프롬프트 (루프 종료 방지)
      const unknownToolWarnings = allToolCallsParseWarnings.filter((w) =>
        w.startsWith("알 수 없는 도구:"),
      );
      if (
        unknownToolWarnings.length > 0 &&
        allToolCallsFromResponse.length === 0
      ) {
        const unknownNames = unknownToolWarnings
          .map((w) => w.replace("알 수 없는 도구: ", ""))
          .join(", ");
        const availableTools = [
          "read_file",
          "update_file",
          "create_file",
          "remove_file",
          "run_command",
          "ripgrep_search",
          "list_files",
          "glob_search",
          "list_imports",
          "stat_file",
          "fetch_url",
          "lsp",
        ].join(", ");
        console.warn(
          `[ConversationManager] Unknown tool names detected: ${unknownNames}. Re-prompting.`,
        );
        accumulatedUserParts.push({ text: llmResponse });
        accumulatedUserParts.push({
          text: `[시스템] 알 수 없는 도구를 호출했습니다: ${unknownNames}. 이 도구들은 존재하지 않습니다. 반드시 다음 도구 목록만 사용하세요: ${availableTools}. 도구 호출 형식: {"tool": "도구이름", ...파라미터}`,
        });
        turnCount++;
        continue;
      }

      const parsedToolCallsMap = new Map<string, any>();
      allToolCallsFromResponse.forEach((call) => {
        const key = `${call.name}:${JSON.stringify(call.params)}`;
        parsedToolCallsMap.set(key, call);
      });

      let turnHasSideEffects = false;
      let turnResultsSummary = "";
      let hasPlanTag = false;
      let currentActiveItem = taskManager.getNextPendingItem();
      const executedInTurn = new Set<string>();

      // 툴 파싱 경고 수집 (예: create_file content 누락)
      const toolParseWarnings: string[] = [];

      // 도구 호출 처리 (새 형식: { "tool": "..." })
      // ⚠️ 핵심 수정: llmResponse (원본)에서 체크 - cleanResponse는 자연어 필터링으로 JSON이 손상될 수 있음
      const hasToolCall = /\{\s*["']tool["']\s*:\s*["']/.test(llmResponse);
      // ⚠️ Plan 감지: <think> 블록 제거 후 체크 — thinking 안의 plan JSON이 오탐되는 문제 방지
      const responseWithoutThinking = llmResponse
        .replace(/<think>[\s\S]*?<\/think>/g, "")
        .trim();
      const hasJsonPlanInResponse =
        /\{\s*"plan"\s*:/.test(responseWithoutThinking) ||
        /```json[\s\S]*?\{[\s\S]*?"plan"[\s\S]*?\}[\s\S]*?```/i.test(
          responseWithoutThinking,
        );

      // JSON Plan 처리 (도구 호출 없이 plan만 있는 경우)
      // 핵심 수정: analysis/documentation 인텐트에서는 JSON plan을 무시하고 자연어 응답으로 처리
      // v9.2.1: MCP 도구가 포함된 플랜은 intent와 무관하게 실행 (외부 도구 호출은 텍스트 응답이 아님)
      // CODE 모드에서는 documentation이라도 파일 생성이 필요하므로 plan 허용
      const isCodeMode = options.promptType === PromptType.CODE_GENERATION;
      const isTextOnlyIntent =
        !isCodeMode &&
        intent &&
        (intent.category === "analysis" || intent.category === "documentation");
      // MCP 도구 포함 여부: ToolRegistry에 등록된 MCP 도구가 응답에 포함되어 있는지 확인
      const registeredMCPTools = ToolRegistry.getInstance().getMCPTools();
      const hasMCPToolInPlan =
        registeredMCPTools.length > 0 &&
        registeredMCPTools.some((handler) =>
          llmResponse.includes(handler.name),
        );
      if (
        hasJsonPlanInResponse &&
        (!isTextOnlyIntent || hasMCPToolInPlan) &&
        !isPlanMode
      ) {
        if (hasMCPToolInPlan && isTextOnlyIntent) {
          console.log(
            `[ConversationManager] JSON plan contains MCP tools - overriding ${intent?.category} intent to execute plan`,
          );
        } else {
          console.log(`[ConversationManager] JSON plan detected`);
        }
        // ⚠️ 핵심 수정: thinking 제거된 응답에서 파싱 - thinking 안의 plan JSON 오탐 방지
        const planItems = ToolParser.parsePlanItems(responseWithoutThinking);
        if (planItems.length > 0) {
          WebviewBridge.sendProcessingStep(webviewToRespond, "plan");
          WebviewBridge.sendProcessingStatus(
            webviewToRespond,
            "plan",
            "작업 계획 분석 및 파싱 중...",
          );

          taskManager.setPlanItems(planItems);
          hasPlanTag = true;
          WebviewBridge.updateTaskQueue(
            webviewToRespond,
            taskManager.listPlanItems(),
          );

          // 핵심 수정: Plan이 수립되면 INVESTIGATION → EXECUTION 전환
          if (currentPhase === AgentPhase.INVESTIGATION) {
            console.log(
              "[ConversationManager] Plan received in INVESTIGATION phase. Transitioning to EXECUTION.",
            );
            stateManager.transitionTo(AgentPhase.EXECUTION, {
              hasPlan: true,
              toolCallsInTurn: [],
              hasInvestigationHistory: true,
            });
          }
        } else {
          // v9.7.4: 빈/불완전 플랜 처리
          // tool call이 같이 있으면 플랜은 무시하고 tool call 처리 계속 진행
          const hasToolCallInResponse = /\{\s*["']tool["']\s*:\s*["']/.test(
            llmResponse,
          );
          if (hasToolCallInResponse) {
            console.log(
              "[ConversationManager] Empty/malformed plan but tool calls found. Ignoring plan, continuing to tool execution.",
            );
            // 스트리밍으로 이미 표시된 JSON plan 텍스트 제거
            if (isStreamingEnabled) {
              WebviewBridge.removeLastMessage(webviewToRespond);
            }
          } else {
            // tool call도 없고 플랜도 비어있음
            // v9.7.5: INVESTIGATION phase에서 코드 인텐트면 빈 플랜이라도 재시도
            const isCodeIntent =
              intent &&
              (intent.category === "code" || intent.taskType === "code_work");
            if (
              currentPhase === AgentPhase.INVESTIGATION &&
              isCodeIntent &&
              turnCount < maxTurns - 1
            ) {
              console.log(
                "[ConversationManager] Empty plan in INVESTIGATION phase with code intent. Nudging LLM to create proper plan.",
              );
              if (isStreamingEnabled) {
                WebviewBridge.removeLastMessage(webviewToRespond);
              }
              accumulatedUserParts.push({
                text: "[시스템 알림] 빈 플랜이 반환되었습니다. 사용자가 요청한 작업(에러 수정, 코드 변경 등)을 수행하기 위한 구체적인 실행 계획을 JSON 형식으로 다시 생성하세요. 반드시 plan 배열 안에 kind: 'execution' 항목을 포함해야 합니다.",
              });
              turnCount++;
              continue;
            }

            console.log(
              "[ConversationManager] Empty plan and no tool calls. LLM determined nothing to do.",
            );

            // 스트리밍으로 이미 표시된 JSON 제거
            if (isStreamingEnabled) {
              WebviewBridge.removeLastMessage(webviewToRespond);
            }

            // LLM 응답에서 JSON을 제외한 텍스트 설명 추출
            let emptyPlanExplanation = StringUtils.cleanText(
              llmResponse || "",
              {
                removeThinking: true,
                removeNaturalLanguage: false,
                removeSystemMessages: false,
                removeToolTags: false,
                removeJsonThinking: true,
                extractJson: false,
              },
            );
            // JSON 블록 제거
            emptyPlanExplanation = emptyPlanExplanation
              .replace(/```json[\s\S]*?```/gi, "")
              .replace(/\{[\s\S]*?"plan"\s*:\s*\[[\s\S]*?\][\s\S]*?\}/g, "")
              .trim();

            if (!emptyPlanExplanation || emptyPlanExplanation.length < 10) {
              emptyPlanExplanation =
                "요청하신 작업은 이미 완료되어 있거나, 현재 상태에서 추가로 수행할 작업이 없습니다.";
            }

            await WebviewBridge.streamText(
              webviewToRespond,
              "CODEPILOT",
              emptyPlanExplanation,
            );
            stateManager.transitionTo(AgentPhase.DONE, {});
            console.log(
              "[ConversationManager] Empty plan — responded to user and transitioned to DONE.",
            );
            break;
          }
        }
      } else if (hasJsonPlanInResponse && isTextOnlyIntent) {
        console.log(
          `[ConversationManager] JSON plan detected but ignored for ${intent?.category} intent - will use natural language response`,
        );
      }

      // 도구 호출 처리 (새 형식: { "tool": "..." })
      if (hasToolCall) {
        console.log(
          `[ConversationManager] Tool call detected, processing tool calls`,
        );

        // 도구 실행 처리
        // ⚠️ 핵심 수정: llmResponse (원본)에서 파싱 - cleanResponse는 자연어 필터링으로 JSON이 손상될 수 있음
        const toolCallsFromJson = ToolParser.parseToolCalls(
          llmResponse,
          toolParseWarnings,
        );
        console.log(
          `[ConversationManager] Tool calls: parsed ${toolCallsFromJson.length} tool calls`,
        );

        if (toolCallsFromJson.length > 0) {
          // 중복 제거
          const toolCallsMap = new Map<string, any>();
          toolCallsFromJson.forEach((call) => {
            const key = `${call.name}:${JSON.stringify(call.params)}`;
            if (!executedInTurn.has(key)) {
              toolCallsMap.set(key, call);
            } else {
              console.log(
                `[ConversationManager] Skipping already executed tool call: ${call.name}`,
              );
            }
          });

          const toolCalls = Array.from(toolCallsMap.values()).filter((call) => {
            if (call.name === "create_file" && call.params.path) {
              const p = call.params.path as string;
              if (streamingCreatedPaths.has(p)) {
                console.log(
                  `[ConversationManager] Streaming-pre-executed create_file skipped: ${p}`,
                );
                turnResultsSummary += `\n[도구 결과] create_file(${p}): 성공 (스트리밍 중 즉시 생성됨)`;
                return false;
              }
              if (streamingHandledPaths.has(`create_file:${p}`)) {
                console.log(
                  `[ConversationManager] Streaming-rejected create_file skipped: ${p}`,
                );
                turnResultsSummary += `\n[도구 결과] create_file(${p}): 건너뜀 (스트리밍 중 사용자가 거부)`;
                return false;
              }
            }
            if (call.name === "update_file" && call.params.path) {
              const p = call.params.path as string;
              if (streamingUpdatedPaths.has(p)) {
                console.log(
                  `[ConversationManager] Streaming-pre-executed update_file skipped: ${p}`,
                );
                turnResultsSummary += `\n[도구 결과] update_file(${p}): 성공 (스트리밍 중 즉시 수정됨)`;
                return false;
              }
              if (streamingHandledPaths.has(`update_file:${p}`)) {
                console.log(
                  `[ConversationManager] Streaming-rejected update_file skipped: ${p}`,
                );
                turnResultsSummary += `\n[도구 결과] update_file(${p}): 건너뜀 (스트리밍 중 사용자가 거부)`;
                return false;
              }
            }
            return true;
          });

          if (toolCalls.length > 0) {
            // FSM을 사용한 도구 허용 여부 검증
            const blockedCalls = toolCalls.filter(
              (call) => !stateManager.isToolAllowed(call.name),
            );

            // INVESTIGATION 단계에서 EXECUTION 도구가 있으면 EXECUTION으로 전환
            // 개선: 실행 도구 자체가 "실행 의도"의 명확한 증거이므로 조건 완화
            // - 이전: hasExecutionIntentInHistory || executionIntent 조건 필요
            // - 현재: 실행 도구가 나오면 무조건 EXECUTION으로 전환 (불필요한 재요청 방지)
            if (
              blockedCalls.length > 0 &&
              currentPhase === AgentPhase.INVESTIGATION
            ) {
              const existingPlanItems = taskManager.listPlanItems();

              // 실행 도구가 나왔다는 것 자체가 실행 의도의 증거
              // plan 없이도 전환 가능하게 하여 불필요한 턴 낭비 방지
              console.log(
                `[ConversationManager] JSON: Execution tool detected in INVESTIGATION. Transitioning to EXECUTION phase.`,
              );
              const transitionContext = {
                hasPlan: existingPlanItems.length > 0,
                toolCallsInTurn: toolCalls,
                hasInvestigationHistory: hasInvestigationHistory,
              };

              const transitionResult = stateManager.transitionTo(
                AgentPhase.EXECUTION,
                transitionContext,
              );
              if (transitionResult.success) {
                console.log(
                  "[ConversationManager] JSON: Successfully transitioned to EXECUTION phase.",
                );
                turnResultsSummary += `\n[System] 실행 도구가 감지되어 실행 단계로 전환합니다.\n`;
                // 전환 성공 후 blockedCalls 재검증
                blockedCalls.splice(0, blockedCalls.length); // 배열 비우기
              }
            }

            // blockedCalls가 없거나 비워졌으면 도구 실행
            if (blockedCalls.length === 0) {
              // EXECUTION 단계에서 조사 도구만 호출하는 경우 경고 및 수정 도구 강제
              const investigationTools = [
                Tool.READ_FILE,
                Tool.LIST_FILES,
                Tool.RIPGREP_SEARCH,
              ];
              const onlyInvestigationTools = toolCalls.every((call) =>
                investigationTools.includes(call.name as Tool),
              );

              if (
                currentPhase === AgentPhase.EXECUTION &&
                onlyInvestigationTools
              ) {
                // 읽기 도구만 호출: 파일을 읽어야 정확한 SEARCH/REPLACE 가능하므로 실행 허용
                // 단, 연속 2턴 이상 읽기만 하면 경고 (수정 도구 사용 유도)
                console.log(
                  `[ConversationManager] EXECUTION phase: Investigation tools detected (${toolCalls.map((c) => c.name).join(", ")}). Allowing read before edit.`,
                );
                executionNoToolRetryCount++;
                if (executionNoToolRetryCount > 2) {
                  console.warn(
                    `[ConversationManager] EXECUTION phase: ${executionNoToolRetryCount} consecutive read-only turns. Nudging for modification tools.`,
                  );
                  accumulatedUserParts.push({
                    text:
                      `\n[System] 파일 읽기를 여러 턴 연속 수행했습니다. 이제 update_file 또는 create_file로 수정을 진행하세요.\n` +
                      `파일을 완전히 재작성해야 한다면 create_file을 사용하세요.`,
                  });
                }
              } else if (!onlyInvestigationTools) {
                // 수정 도구가 포함되어 있으면 카운터 리셋
                executionNoToolRetryCount = 0;
              }

              // 중복 방지를 위해 executedInTurn에 추가
              toolCalls.forEach((call) => {
                const key = `${call.name}:${JSON.stringify(call.params)}`;
                executedInTurn.add(key);
              });

              console.log(
                `[ConversationManager] JSON: Executing ${toolCalls.length} tool(s):`,
                toolCalls.map((c) => c.name),
              );

              // 도구 실행
              WebviewBridge.sendProcessingStep(webviewToRespond, "executing");
              WebviewBridge.sendProcessingStatus(
                webviewToRespond,
                "executing",
                `${ToolExecutionCoordinator.getToolLabel(toolCalls[0].name)} 실행 중...`,
              );

              const {
                toolResults,
                hasSuccessfulExecution,
                hasWriteToolExecution: hasWriteToolExecution3,
                hasBlockedByValidator: hasBlockedByValidator3,
                blockedMessages: blockedMessages3,
                hasUserSkipped: hasUserSkipped3,
                inlineDiagnosticErrors: inlineDiagErrors3,
              } = await this.executeToolsWithUI(
                toolExecutor,
                toolCalls,
                webviewToRespond,
                actionManager,
                executionManager,
                terminalManager,
                collectedUIMessages,
                preloadedFiles,
                alreadyStattedFiles,
                createdFiles,
                modifiedFiles,
                true, // includeWebviewInContext
                conversationTurnId,
                executedCommands,
                isPlanMode,
              );
              if (hasSuccessfulExecution && hasWriteToolExecution3) {
                lastTurnHadSuccessfulToolExecution = true;
                lastExecutionTurnId = conversationTurnId; // review 메시지에 사용할 turnId 저장
                console.log(`[ConversationManager] Tool execution succeeded.`);
              }

              // v1.0.24: EXECUTION 중 LSP 에러 즉시 피드백
              if (inlineDiagErrors3) {
                accumulatedUserParts.push({ text: inlineDiagErrors3 });
              }

              // PreToolUseValidator에 의해 차단된 경우
              const blockResult3 = this.handleBlockedTools(
                hasBlockedByValidator3,
                blockedMessages3,
                hasSuccessfulExecution,
                stateManager,
                accumulatedUserParts,
                webviewToRespond,
              );
              if (blockResult3 === "break") break;

              // 사용자가 스킵한 경우에도 REVIEW로 전환 (무한 루프 방지)
              if (hasUserSkipped3) {
                console.log(
                  `[ConversationManager] User skipped tool execution, transitioning to REVIEW.`,
                );
                stateManager.transitionTo(AgentPhase.REVIEW);
                break;
              }

              // 결과 요약 누적
              const resultSummary =
                ToolExecutionCoordinator.createToolResultSummary(
                  turnCount,
                  toolCalls,
                  toolResults,
                );
              turnResultsSummary += resultSummary;
              turnHasSideEffects = true;

              // create_file 하드 가드 차단 감지 → glob_search 강제 유도
              const blockedByReadFail = toolResults.filter(
                (r: any) => r.error?.code === "CREATE_BLOCKED_AFTER_READ_FAIL",
              );
              if (blockedByReadFail.length > 0) {
                const blockedPaths = blockedByReadFail
                  .map((r: any) => r.message || "")
                  .join(", ");
                accumulatedUserParts.push({
                  text: `\n[System] ⚠️ 파일 경로 확인이 필요합니다.\n\n다음 경로의 파일이 존재하지 않습니다: ${blockedPaths}\n**반드시 glob_search 도구로 파일의 실제 위치를 검색하세요.**\n예: { "tool": "glob_search", "pattern": "**/{파일명}" }\nglob_search 결과에서 파일이 발견되면 올바른 경로를 사용하세요.\n파일이 프로젝트에 없으면 사용자에게 알려주세요.`,
                });
                console.log(
                  `[ConversationManager] CREATE_BLOCKED_AFTER_READ_FAIL detected, injecting glob_search guidance for: ${blockedPaths}`,
                );
              }
            } else {
              console.log(
                `[ConversationManager] JSON: ${blockedCalls.length} tool(s) blocked in ${currentPhase} phase`,
              );
              turnResultsSummary += getPhaseToolRestrictionPrompt(
                currentPhase,
                blockedCalls.map((c) => c.name),
              );
            }
          }
        }
      }

      // 3. 루프 종료 조건 확인 및 턴 관리
      const totalToolCalls = ToolParser.parseToolCalls(
        llmResponse,
        toolParseWarnings,
      );
      const totalResponseText =
        this.responseProcessor.extractResponseText(llmResponse);

      // 유효한 응답이 있으면 빈 응답 카운터 리셋
      if (totalResponseText && totalResponseText.trim()) {
        consecutiveEmptyResponses = 0;
      }

      // create_file content 누락 등 툴 파싱 경고를 사용자 컨텍스트에 추가
      if (toolParseWarnings.length > 0) {
        accumulatedUserParts.push({
          text: getCreateFileContentMissingPrompt(toolParseWarnings.join("\n")),
        });
      }

      const validPlanReceived =
        hasPlanTag && TaskManager.getInstance().listPlanItems().length > 0;

      // 도구를 실행했다면 결과를 누적하고 전이 결정
      const postToolResult = await this.handlePostToolTransition(
        totalToolCalls,
        validPlanReceived,
        currentPhase,
        stateManager,
        taskManager,
        webviewToRespond,
        retryCoordinator,
        accumulatedUserParts,
        createdFiles,
        modifiedFiles,
        testFixAttempts,
        maxTestFixAttempts,
        isAutoTestRetryEnabled,
        turnCount,
        llmResponse,
        turnResultsSummary,
        intent,
      );
      testFixAttempts = postToolResult.testFixAttempts;
      if (postToolResult.pendingRetryPrompt) {
        pendingRetryPrompt = true;
      }
      if (postToolResult.pendingMCPResultInterpretation) {
        pendingMCPResultInterpretation = true;
      }

      // v9.4.0: 무한 루프 감지 (턴 종료 시점에 체크)
      const hasProgress =
        turnHasSideEffects ||
        validPlanReceived ||
        createdFiles.length > 0 ||
        modifiedFiles.length > 0;
      const toolCallSignatures = totalToolCalls.map(
        (tc: ToolUse) => `${tc.name}:${JSON.stringify(tc.params || {})}`,
      );
      const loopCheck = this.loopStateTracker.updateAndCheckLoopState(
        loopState,
        currentPhase,
        currentPlanItem?.id || null,
        toolCallSignatures,
        llmResponse,
        hasProgress,
      );

      if (loopCheck.isLoop) {
        const escapeResult = this.loopStateTracker.handleInfiniteLoopEscape(
          loopCheck.reason!,
          loopState,
          stateManager,
          taskManager,
          webviewToRespond,
        );

        if (escapeResult.shouldBreak) {
          console.log(
            `[ConversationManager] 무한 루프 탈출 실패, 대화 종료: ${escapeResult.message}`,
          );
          break;
        } else {
          // 탈출 성공 - 로그만 남기고 계속 진행
          console.log(
            `[ConversationManager] 무한 루프 탈출 시도: ${escapeResult.message}`,
          );
        }
      }

      if (postToolResult.turnAction.action === "continue") {
        // memory-only INVESTIGATION 턴: memory_save/memory_delete만 실행된 경우
        // Turn 1 텍스트를 사용자에게 표시하고 DONE으로 전환 (불필요한 Turn 2 방지)
        // 단, 에러 수정/코드 작업 등 실제 작업이 필요한 intent면 건너뜀 (수정 없이 끝나는 버그 방지)
        const MEMORY_TOOLS: string[] = [Tool.MEMORY_SAVE, Tool.MEMORY_DELETE];
        const isMemoryOnlyTurn =
          currentPhase === AgentPhase.INVESTIGATION &&
          totalToolCalls.length > 0 &&
          totalToolCalls.every((tc) => MEMORY_TOOLS.includes(tc.name));

        const isActionRequiredIntent =
          intent &&
          (intent.taskType === "terminal" || intent.taskType === "code_work");

        if (isMemoryOnlyTurn && !isActionRequiredIntent) {
          // tool call JSON 블록 제거 후 자연어 텍스트만 추출
          let memoryTurnText = cleanResponse
            .replace(
              /\{\s*["']tool["']\s*:\s*["']memory_(?:save|delete)["'][\s\S]*?\}/g,
              "",
            )
            .trim();

          if (memoryTurnText && memoryTurnText.trim()) {
            console.log(
              "[ConversationManager] Memory-only INVESTIGATION turn: displaying accompanying text to user.",
            );
            await WebviewBridge.streamText(
              webviewToRespond,
              "CODEPILOT",
              memoryTurnText,
            );
          }
          stateManager.transitionTo(AgentPhase.DONE, {});
          console.log(
            "[ConversationManager] Memory-only INVESTIGATION turn: transitioning to DONE.",
          );
          break;
        }

        turnCount++;
        continue;
      }
      if (postToolResult.turnAction.action === "break") {
        break;
      }

      // 핵심 수정: INVESTIGATION 단계에서도 MCP 결과 해석 턴 처리
      // pendingMCPResultInterpretation=true이면 LLM의 텍스트 응답을 사용자에게 표시
      if (
        pendingMCPResultInterpretation &&
        currentPhase === AgentPhase.INVESTIGATION &&
        totalResponseText.trim()
      ) {
        console.log(
          "[ConversationManager] INVESTIGATION phase: pendingMCPResultInterpretation=true. Displaying MCP result interpretation to user.",
        );
        pendingMCPResultInterpretation = false;

        let cleanMCPResponse = StringUtils.cleanText(totalResponseText, {
          removeThinking: true,
          removeNaturalLanguage: false,
          removeSystemMessages: false,
          removeToolTags: false,
          removeJsonThinking: true,
          extractJson: false,
        });
        // JSON plan이 포함되어 있으면 제거 (MCP 결과 해석 텍스트만 필요)
        // investigation_done 토큰 정제 — quote 종류·marker 위치 무관하게 강제 제거.
        // (이전엔 ASCII quote 만 매치해서 LLM 이 smart quote `"` `"` 로 출력하면
        //  strip 실패 → 사용자 화면에 그대로 노출되던 회귀 수정.)
        cleanMCPResponse = cleanMCPResponse
          .replace(/```json[\s\S]*?\{\s*"plan"\s*:[\s\S]*?\}[\s\S]*?```/gi, "")
          .replace(/\{\s*"plan"\s*:\s*\[[\s\S]*?\]\s*\}/g, "")
          // <investigation_done/> XML 태그
          .replace(/<investigation_done\s*\/>/gi, "")
          // markdown 코드블록 안에 감싸진 investigation_done JSON
          .replace(
            /```(?:json|JSON)?\s*\{[^{}]*investigation_done[^{}]*\}\s*```/gi,
            "",
          )
          // 일반 JSON {{ ... investigation_done ... }} — quote 종류 무관 (ASCII / smart quote 둘 다)
          .replace(/\{[^{}]*investigation_done[^{}]*\}/gi, "")
          // 미닫힘 ```TEXT 같은 빈 코드 펜스 (LLM 이 종료 신호로 잘못 emit 한 경우)
          .replace(/```(?:[A-Za-z]+)?\s*$/g, "")
          .trim();

        if (cleanMCPResponse && cleanMCPResponse.trim()) {
          // 근본 fix — 스트리밍 / 비스트리밍 무관하게 동일 처리:
          //   1) 진행 중이던 stream 명시적 종료 (cursor 닫기)
          //   2) 오염된 마지막 메시지 제거 (investigation_done JSON 토큰 / 미닫힘
          //      코드블록 잔재가 흘러간 chunks 포함)
          //   3) receiveMessage 로 한 번에 정제 텍스트 출력 (새 cursor 안 생김)
          // 이렇게 해야 cursor 가 깜박이지 않고 사용자에게 깨끗한 응답만 보임.
          // 이중 endStream — webview state(streamingMessageElement) 가 끊어진
          // 참조를 가진 채로 남으면 cursor 가 살아있는 것처럼 보일 수 있음.
          // remove 전과 후 모두 endStream 호출하여 양쪽 모두 cleanup.
          try {
            WebviewBridge.endStreamingMessage(webviewToRespond);
          } catch {
            /* webview disposed */
          }
          try {
            WebviewBridge.removeLastMessage(webviewToRespond);
          } catch {
            /* webview disposed */
          }
          try {
            WebviewBridge.endStreamingMessage(webviewToRespond);
          } catch {
            /* webview disposed */
          }
          try {
            WebviewBridge.receiveMessage(
              webviewToRespond,
              "CODEPILOT",
              cleanMCPResponse,
            );
          } catch {
            /* webview disposed */
          }
        }

        stateManager.transitionTo(AgentPhase.DONE, {});

        // 종료 시그널 명시적 송출 — break 후엔 메인 루프가 끝나지만 webview
        // 측에는 endStream/hideLoading/done 이벤트가 안 가서 스피너가 계속
        // 깜박이던 회귀를 수정.
        try {
          WebviewBridge.endStreamingMessage(webviewToRespond);
        } catch {
          /* webview disposed */
        }
        try {
          WebviewBridge.sendProcessingStep(webviewToRespond, "done");
        } catch {
          /* webview disposed */
        }
        try {
          WebviewBridge.hideLoading(webviewToRespond);
        } catch {
          /* webview disposed */
        }
        break;
      }

      // INVESTIGATION 단계에서 도구 호출도 없고 plan도 없으면 텍스트 출력 차단
      // 단, 의도가 없거나 단순 인사인 경우는 허용
      // ⚠️ 핵심 수정: analysis intent이고 조사가 완료된 경우, 자연어 답변 허용
      // 최적화: investigation_done 토큰이 있고 ripgrep_search 결과가 있으면 텍스트 차단을 건너뛰고 바로 자동 답변 생성
      if (
        currentPhase === AgentPhase.INVESTIGATION &&
        totalToolCalls.length === 0 &&
        !validPlanReceived &&
        totalResponseText.trim()
      ) {
        // investigation_done 토큰이 있고 ripgrep_search 결과가 있으면 텍스트 차단을 건너뛰고 자동 답변 생성 로직으로 넘어감
        const isTextAllowedIntentForSkip =
          intent &&
          (intent.category === "analysis" ||
            intent.category === "documentation");
        if (investigationDoneToken && isTextAllowedIntentForSkip) {
          let hasRipgrepResults = false;
          for (const part of accumulatedUserParts) {
            if (
              part.text &&
              part.text.includes("**검색 결과 (이미 검색함)**")
            ) {
              hasRipgrepResults = true;
              break;
            }
          }
          if (hasRipgrepResults) {
            console.log(
              "[ConversationManager] INVESTIGATION phase: investigation_done + ripgrep_search results found. Skipping text blocking, will generate auto-answer.",
            );
            // 텍스트 차단을 건너뛰고 자동 답변 생성 로직으로 넘어감
          } else {
            // ripgrep_search 결과가 없으면 기존 로직 계속
          }
        }

        // 의도가 없거나 단순 인사인 경우 텍스트 응답 허용하고 종료
        if (hasNoIntent) {
          console.log(
            "[ConversationManager] INVESTIGATION phase: No intent detected, allowing text-only response and terminating.",
          );
          // ✅ Phase gate: hasNoIntent인 경우는 DONE으로 전환 후 텍스트 전송 (스트리밍)
          stateManager.transitionTo(AgentPhase.DONE);
          if (shouldSendCodePilotText(AgentPhase.DONE)) {
            await WebviewBridge.streamText(
              webviewToRespond,
              "CODEPILOT",
              totalResponseText,
            );
          }
          return; // 즉시 종료
        }

        // ⚠️ 핵심 수정: analysis/documentation intent이고 조사가 완료된 경우, 자연어 답변 허용
        // 중복 방지: investigation_done 토큰이 있으면 위의 블록에서 이미 처리되므로 여기서는 처리하지 않음
        // 추가 중복 방지: ripgrep_search 결과가 있으면 자동 답변 생성 로직에서 처리되므로 여기서는 처리하지 않음
        // 수정: JSON plan이 있는 경우는 텍스트 응답으로 처리하지 않음
        const isTextAllowedIntentForHistory =
          intent &&
          (intent.category === "analysis" ||
            intent.category === "documentation");
        if (
          isTextAllowedIntentForHistory &&
          hasInvestigationHistory &&
          !investigationDoneToken &&
          !hasPlanTag &&
          !hasJsonPlanInResponse
        ) {
          // ripgrep_search 결과가 있는지 확인
          let hasRipgrepResults = false;
          for (const part of accumulatedUserParts) {
            if (
              part.text &&
              part.text.includes("**검색 결과 (이미 검색함)**")
            ) {
              hasRipgrepResults = true;
              break;
            }
          }

          // ripgrep_search 결과가 있으면 자동 답변 생성 로직(2732 라인)에서 처리되므로 여기서는 처리하지 않음
          if (hasRipgrepResults) {
            console.log(
              "[ConversationManager] INVESTIGATION phase: ripgrep_search results found. Will be handled by auto-answer generation logic.",
            );
            // 자동 답변 생성 로직으로 넘어가도록 continue하지 않고 계속 진행
          } else {
            // ripgrep_search 결과가 없고 LLM이 직접 답변을 생성한 경우만 처리
            console.log(
              "[ConversationManager] INVESTIGATION phase: Analysis intent with completed investigation. Allowing text-only response.",
            );
            // 응답 정제: thinking 태그 제거 (자연어/마크다운은 유지)
            let cleanResponse = StringUtils.cleanText(totalResponseText, {
              removeThinking: true,
              removeNaturalLanguage: false,
              removeSystemMessages: false,
              removeToolTags: false,
              removeJsonThinking: true,
              extractJson: false,
            });

            if (
              cleanResponse &&
              cleanResponse.length > AgentConfig.MIN_RESPONSE_LENGTH
            ) {
              // 스트리밍 효과로 전송 ('Assistant' → 'CODEPILOT')
              await WebviewBridge.streamText(
                webviewToRespond,
                "CODEPILOT",
                cleanResponse,
              );
              // DONE으로 전환
              stateManager.transitionTo(AgentPhase.DONE, {});
              console.log(
                "[ConversationManager] Analysis response sent. Transitioning to DONE.",
              );
              break;
            }
          }
        }

        // 핵심 수정: 파일이 이미 생성/수정되었다면 완료로 간주하고 REVIEW 전환
        if (createdFiles.length > 0 || modifiedFiles.length > 0) {
          console.log(
            `[ConversationManager] INVESTIGATION phase: Files already modified (created: ${createdFiles.length}, modified: ${modifiedFiles.length}). Transitioning to REVIEW.`,
          );
          stateManager.transitionTo(AgentPhase.REVIEW);
          // 다음 턴에서 REVIEW 로직 실행 (REVIEW handler가 turnCount++ 처리)
          continue;
        }

        // 핵심 수정: analysis/documentation 의도(질문, 설명, 요약 요청)일 때는 텍스트 응답 허용
        // 예: "터미널 내용 알려줘", "파일 내용 설명해줘", "@Terminal 뭐라고 나왔어?", "읽고 요약해줘"
        // 길이 체크 제거 - 응답 존재 여부만 확인 (다른 코드 어시스턴트처럼)
        // 수정: JSON plan이 있는 경우는 텍스트 응답으로 처리하지 않음
        const isTextAllowedIntent =
          intent &&
          (intent.category === "analysis" ||
            intent.category === "documentation");

        // v9.4.1: 파일 미존재 응답 패턴 감지 - 사용자에게 확인 질문은 허용
        const isFileNotExistResponse =
          totalResponseText &&
          (/파일이?\s*(존재하지\s*않|없)/i.test(totalResponseText) ||
            /존재하지\s*않습니다/i.test(totalResponseText) ||
            /새로\s*생성.*\?/i.test(totalResponseText) ||
            /file.*not.*exist/i.test(totalResponseText) ||
            /does.*not.*exist/i.test(totalResponseText));

        if (
          (isTextAllowedIntent || isFileNotExistResponse) &&
          totalResponseText &&
          totalResponseText.trim() &&
          !hasPlanTag &&
          !hasJsonPlanInResponse
        ) {
          console.log(
            `[ConversationManager] INVESTIGATION phase: ${isFileNotExistResponse ? "file-not-exist response" : intent?.category + " intent"} detected, allowing text response.`,
          );
          // 응답 정제: thinking 태그 및 시스템 토큰 제거
          let cleanResponse = StringUtils.cleanText(totalResponseText, {
            removeThinking: true,
            removeNaturalLanguage: false, // analysis 응답은 자연어 허용
            removeSystemMessages: false,
            removeToolTags: false,
            removeJsonThinking: true,
            extractJson: false,
          });

          // investigation_done 시스템 토큰 제거
          cleanResponse = cleanResponse
            .replace(/<investigation_done\s*\/>/gi, "")
            .replace(/\{\s*["']investigation_done["']\s*:\s*true\s*\}/gi, "")
            .trim();

          // investigation_done 토큰만 있고 cleanResponse가 비어있는 경우 (memory_save 등 완료 후) → 바로 DONE
          if (!cleanResponse || !cleanResponse.trim()) {
            if (investigationDoneToken) {
              stateManager.transitionTo(AgentPhase.DONE, {});
              console.log(
                "[ConversationManager] investigation_done with empty response. Transitioning to DONE.",
              );
              break;
            }
          } else {
            await WebviewBridge.streamText(
              webviewToRespond,
              "CODEPILOT",
              cleanResponse,
            );

            // v9.5.0: 파일 미존재 응답도 세션에 저장 (대화 연속성 유지)
            if (options.extensionContext) {
              try {
                const { SessionManager } =
                  await import("../state/SessionManager");
                const sessionManager = SessionManager.getInstance(
                  options.extensionContext,
                );
                const currentSession = sessionManager.getCurrentSession();
                if (currentSession) {
                  await sessionManager.addConversationEntry(currentSession.id, {
                    id: `conv_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
                    timestamp: Date.now(),
                    userRequest: userQuery || "",
                    assistantResponse: cleanResponse,
                    actions: collectedActions as any,
                    result: "success",
                    model: options.currentModelType,
                  });
                  console.log(
                    "[ConversationManager] Saved file-not-exist response to session history",
                  );
                }
              } catch (e) {
                console.warn(
                  "[ConversationManager] Failed to save file-not-exist response to session:",
                  e,
                );
              }
            }

            stateManager.transitionTo(AgentPhase.DONE, {});
            console.log(
              "[ConversationManager] Text response sent (file-not-exist or analysis). Transitioning to DONE.",
            );
            break;
          }
        }

        // PLAN 모드: INVESTIGATION에서 텍스트만 와도 plan 텍스트로 수용 → 승인 팝업 표시
        if (isPlanMode && totalResponseText && totalResponseText.trim()) {
          const cleanPlanText = StringUtils.cleanText(totalResponseText, {
            removeThinking: true,
            removeNaturalLanguage: false,
            removeSystemMessages: false,
            removeToolTags: false,
            removeJsonThinking: true,
            extractJson: false,
          })
            .replace(/<investigation_done\s*\/>/gi, "")
            .replace(/\{\s*["']investigation_done["']\s*:\s*true\s*\}/gi, "")
            .trim();

          if (cleanPlanText) {
            console.log(
              `[ConversationManager] PLAN mode: Text response in INVESTIGATION accepted as plan output.`,
            );
            // JSON plan 감지: JSON이 포함되어 있으면 채팅에 표시하지 않음 (승인 팝업에서만 확인)
            const hasJsonInPlan = /\{\s*"plan"\s*:|\{\s*"kind"\s*:/.test(
              cleanPlanText,
            );
            if (!hasJsonInPlan) {
              // 순수 마크다운 텍스트면 채팅에 표시
              await WebviewBridge.streamText(
                webviewToRespond,
                "CODEPILOT",
                cleanPlanText,
              );
              collectedUIMessages.push({
                sender: "CODEPILOT",
                text: cleanPlanText,
                type: "summary",
              });
            } else {
              // JSON 포함 → plan items 파싱해서 요약만 표시
              const planItems = ToolParser.parsePlanItems(cleanPlanText);
              if (planItems.length > 0) {
                const planSummary =
                  `📋 **구현 계획** (${planItems.length}단계)\n\n` +
                  planItems
                    .map(
                      (item, i) =>
                        `**${i + 1}. ${item.title}**\n${item.detail || ""}`,
                    )
                    .join("\n\n");
                await WebviewBridge.streamText(
                  webviewToRespond,
                  "CODEPILOT",
                  planSummary,
                );
                collectedUIMessages.push({
                  sender: "CODEPILOT",
                  text: planSummary,
                  type: "summary",
                });
              } else {
                // 파싱 실패 시 "계획 작성 완료" 간단 메시지
                await WebviewBridge.streamText(
                  webviewToRespond,
                  "CODEPILOT",
                  "📋 구현 계획이 작성되었습니다.",
                );
                collectedUIMessages.push({
                  sender: "CODEPILOT",
                  text: "구현 계획 작성 완료",
                  type: "summary",
                });
              }
            }

            // 승인 팝업
            planTextResponse = cleanPlanText;
            const vscodeModule = require("vscode");
            const approval = await vscodeModule.window.showInformationMessage(
              "구현 계획이 작성되었습니다. 승인하시겠습니까?",
              { modal: true },
              "승인",
              "거절",
            );
            if (approval === "승인") {
              console.log(
                "[ConversationManager] PLAN approved — auto-executing in CODE mode",
              );
              WebviewBridge.receiveMessage(
                webviewToRespond,
                "System",
                "✓ 계획이 승인되었습니다.",
              );
              try {
                const globalStoragePath =
                  options.extensionContext?.globalStorageUri?.fsPath;
                if (globalStoragePath && planTextResponse) {
                  const plansDir = path.join(globalStoragePath, "plans");
                  if (!fsSync.existsSync(plansDir)) {
                    fsSync.mkdirSync(plansDir, { recursive: true });
                  }
                  const sessionId = options.extensionContext
                    ? (
                        await import("../state/SessionManager")
                      ).SessionManager.getInstance(
                        options.extensionContext,
                      ).getCurrentSession()?.id
                    : undefined;
                  const planFileName = sessionId
                    ? `plan_${sessionId}.md`
                    : `plan_${Date.now()}.md`;
                  fsSync.writeFileSync(
                    path.join(plansDir, planFileName),
                    planTextResponse,
                    "utf-8",
                  );
                }
              } catch (planSaveError) {
                console.warn(
                  "[ConversationManager] Failed to save plan file:",
                  planSaveError,
                );
              }
              setTimeout(() => {
                webviewToRespond.postMessage({
                  command: "autoPlanExecute",
                  text: "위 계획대로 진행해줘",
                });
              }, 500);
            } else {
              WebviewBridge.receiveMessage(
                webviewToRespond,
                "System",
                "✗ 계획이 거절되었습니다. 새로 질의하거나 수정 사항을 알려주세요.",
              );
            }
            // 스트리밍 커서 종료 + processing step 완료
            WebviewBridge.endStreamingMessage(webviewToRespond);
            WebviewBridge.sendProcessingStep(webviewToRespond, "done");
            break;
          }
        }

        console.log(
          `[ConversationManager] INVESTIGATION phase: No tools/plan but text received. Blocking text-only output.`,
        );

        // 텍스트만 출력하는 것을 차단하고 강력한 안내 메시지 제공
        accumulatedUserParts.push({
          text: getInvestigationTextOnlyWarningPrompt(),
        });
        turnCount++;
        continue;
      }

      // ⚠️ 핵심 수정: analysis intent이고 investigation_done 토큰이 있으면, 빈 응답이어도 analysis 답변 생성 후 종료
      // (analysis 답변 생성 로직은 INVESTIGATION phase 처리 블록에서 실행됨)
      // 디버깅: 조건 확인
      if (investigationDoneToken) {
        console.log(
          `[ConversationManager] Debug: investigationDoneToken=true, intent=${intent?.category}, currentPhase=${currentPhase}`,
        );
      }
      const isTextAllowedIntentForDone =
        intent &&
        (intent.category === "analysis" || intent.category === "documentation");
      if (
        investigationDoneToken &&
        isTextAllowedIntentForDone &&
        currentPhase === AgentPhase.INVESTIGATION
      ) {
        console.log(
          `[ConversationManager] ${intent.category} intent with investigation_done token detected. Will generate answer in INVESTIGATION phase block.`,
        );
        // 빈 응답 체크를 건너뛰고 계속 진행 (INVESTIGATION phase 블록에서 답변 생성)
      } else if (!totalResponseText || !totalResponseText.trim()) {
        // 도구 호출도 없고 유효한 계획도 없는 경우
        // 추가: investigation_done 토큰이 있으면 analysis/documentation 답변 생성 시도
        if (
          investigationDoneToken &&
          isTextAllowedIntentForDone &&
          currentPhase === AgentPhase.INVESTIGATION
        ) {
          console.log(
            `[ConversationManager] Empty response but investigation_done token found for ${intent.category} intent. Will generate answer in INVESTIGATION phase block.`,
          );
          // 빈 응답 체크를 건너뛰고 계속 진행
        } else if (currentPhase === AgentPhase.EXECUTION && currentPlanItem) {
          // ✅ 핵심 수정: EXECUTION phase로 전환된 직후 루프에서는 빈 응답 체크를 건너뛰어야 함
          // 이 시점에는 아직 LLM을 호출하지 않았기 때문에 totalResponseText가 비어있을 수 있음
          console.log(
            "[ConversationManager] EXECUTION phase with pending plan item. Skipping empty response check, will execute plan item.",
          );
          // 빈 응답 체크를 건너뛰고 계속 진행
        } else {
          // thinking-only 응답 감지: LLM이 thinking만 반환하고 실제 출력 없음
          // 스트리밍에서 thinking 필드만 있거나, 완전히 빈 응답인 경우
          consecutiveEmptyResponses++;
          if (consecutiveEmptyResponses < maxConsecutiveEmptyResponses) {
            console.log(
              `[ConversationManager] Empty/thinking-only response (${consecutiveEmptyResponses}/${maxConsecutiveEmptyResponses}), retrying...`,
            );
            // 다음 턴에서 더 구체적인 프롬프트 제공
            accumulatedUserParts.push({
              text: "[시스템] 이전 응답이 비어있습니다. 도구 호출(```json 코드블록) 또는 텍스트 응답을 반드시 출력하세요.",
            });
            turnCount++;
            continue;
          }
          // 도구 호출도 없고 유효한 계획도 없는 경우 종료 로직
          if (investigationDoneToken) {
            console.log(
              `[ConversationManager] Debug: investigationDoneToken=true but conditions not met. intent=${intent?.category}, currentPhase=${currentPhase}`,
            );
          }
          console.log(
            "[ConversationManager] Empty response or invalid plan, ending loop",
          );
          break;
        }
      }

      const currentPlanItemsAll = taskManager.listPlanItems();
      const remaining = currentPlanItemsAll.filter(
        (i) => i.status === "pending" || i.status === "in_progress",
      );

      // ⚠️ MCP 도구 결과 해석 턴: LLM이 tool result를 보고 텍스트 응답을 생성한 경우
      // 이 텍스트는 사용자에게 직접 보여줘야 함 (REVIEW의 하드코딩 메시지가 아닌 LLM 해석 결과)
      if (
        pendingMCPResultInterpretation &&
        currentPhase === AgentPhase.EXECUTION &&
        totalResponseText.trim()
      ) {
        console.log(
          "[ConversationManager] MCP result interpretation: LLM generated text response. Displaying to user.",
        );
        pendingMCPResultInterpretation = false;

        // 스트리밍이 비활성화된 경우에만 별도 출력 (스트리밍 활성화 시 이미 실시간 출력됨)
        if (!isStreamingEnabled) {
          let cleanMCPResponse = StringUtils.cleanText(totalResponseText, {
            removeThinking: true,
            removeNaturalLanguage: false,
            removeSystemMessages: false,
            removeToolTags: false,
            removeJsonThinking: true,
            extractJson: false,
          });

          if (cleanMCPResponse && cleanMCPResponse.trim()) {
            await WebviewBridge.streamText(
              webviewToRespond,
              "CODEPILOT",
              cleanMCPResponse,
            );
          }
        }

        // LLM이 추가 도구도 호출한 경우 (텍스트 + 도구 혼합) → 계속 진행
        if (totalToolCalls.length > 0) {
          accumulatedUserParts.push({ text: llmResponse });
          accumulatedUserParts.push({ text: turnResultsSummary });
          turnCount++;
          continue;
        }

        // 텍스트만 → REVIEW → DONE으로 전환 (상태 머신 규칙 준수)
        stateManager.transitionTo(AgentPhase.REVIEW);
        stateManager.transitionTo(AgentPhase.DONE, {});
        break;
      }
      pendingMCPResultInterpretation = false; // 해석 턴이 아닌 경우 리셋

      // EXECUTION phase에서 도구 호출 없이 텍스트만 출력한 경우, plan item 완료 처리
      // (요약은 REVIEW 단계에서 시스템이 생성)
      if (
        currentPhase === AgentPhase.EXECUTION &&
        totalToolCalls.length === 0 &&
        totalResponseText.trim()
      ) {
        console.log(
          "[ConversationManager] EXECUTION phase: No tool calls but text received. Marking plan item as done.",
        );

        // 현재 plan item이 있으면 완료 처리
        if (currentPlanItem) {
          this.completePlanItem(
            taskManager,
            webviewToRespond,
            currentPlanItem.id,
          );
        }

        // 다음 계획 항목이 있으면 계속, 없으면 EXECUTION 완료 → REVIEW로 전환
        const nextItem = taskManager.getNextPendingItem();
        if (nextItem) {
          turnCount++;
          continue;
        } else {
          // 모든 plan item 완료 → 자동 테스트 후 REVIEW 전환
          if (abortSignal?.aborted) {
            break;
          }
          const testTransition = await this.runTestsAndTransition(
            webviewToRespond,
            stateManager,
            retryCoordinator,
            createdFiles,
            modifiedFiles,
            testFixAttempts,
            maxTestFixAttempts,
            isAutoTestRetryEnabled,
            accumulatedUserParts,
            turnCount,
            true, // allPlanItemsDone
          );
          testFixAttempts = testTransition.testFixAttempts;
          if (testTransition.pendingRetryPrompt) {
            pendingRetryPrompt = true;
            turnCount++; // retry → back to EXECUTION
          }
          // REVIEW 전환 시 turnCount++ 하지 않음 (REVIEW handler가 처리)
          continue;
        }
      }

      // [수정] 모델이 행동 없이 설명만 하는 경우, 재촉(Nudge) 수행
      // INVESTIGATION 단계에서는 더 관대하게 처리 (여러 번 nudge 가능)
      const isCodeIntent =
        intent?.category === "code" ||
        intent?.taskType === "code_work" ||
        intent?.taskType === "terminal";
      const shouldNudge =
        totalResponseText.trim() && isCodeIntent && totalToolCalls.length === 0;

      if (shouldNudge) {
        // INVESTIGATION 단계에서는 최대 MAX_NUDGE_COUNT회까지 nudge 허용
        const maxNudges =
          currentPhase === AgentPhase.INVESTIGATION
            ? AgentConfig.MAX_NUDGE_COUNT
            : AgentConfig.MAX_NUDGE_COUNT_EXECUTION;
        const nudgeCount = turnCount; // 간단한 추적 (실제로는 별도 카운터가 필요할 수 있음)

        if (currentPhase === AgentPhase.INVESTIGATION || turnCount === 0) {
          if (
            currentPhase === AgentPhase.INVESTIGATION ||
            nudgeCount < maxNudges
          ) {
            console.log(
              `[ConversationManager] Action missing, providing nudge (turn ${turnCount + 1}).`,
            );
            accumulatedUserParts.push({ text: llmResponse });

            const nudgeText =
              currentPhase === AgentPhase.INVESTIGATION
                ? getInvestigationNudgePrompt()
                : getExecutionNudgePrompt();

            accumulatedUserParts.push({ text: nudgeText });
            turnCount++;
            continue;
          }
        }
      }

      // 문제 해결: analysis intent이고 (investigation_done 토큰이 있거나 ripgrep_search 결과가 있으면) 여기서 바로 답변 생성
      // ripgrep_search 결과 확인
      let hasRipgrepResultsForAutoAnswer = false;
      for (const part of accumulatedUserParts) {
        if (part.text && part.text.includes("**검색 결과 (이미 검색함)**")) {
          hasRipgrepResultsForAutoAnswer = true;
          break;
        }
      }

      const isTextAllowedIntentForAutoAnswer =
        intent &&
        (intent.category === "analysis" || intent.category === "documentation");
      if (
        (investigationDoneToken || hasRipgrepResultsForAutoAnswer) &&
        isTextAllowedIntentForAutoAnswer &&
        currentPhase === AgentPhase.INVESTIGATION
      ) {
        if (investigationDoneToken) {
          console.log(
            `[ConversationManager] ${intent.category} intent with investigation_done token detected. Checking for existing search results...`,
          );
        } else {
          console.log(
            `[ConversationManager] ${intent.category} intent with ripgrep_search results detected. Checking for existing search results...`,
          );
        }

        // 최적화: ripgrep_search 결과가 이미 있으면 LLM 호출 없이 직접 답변 생성
        let hasRipgrepResults = false;
        let ripgrepResults: unknown = null;
        let ripgrepPattern = "";

        // accumulatedUserParts에서 ripgrep_search 결과 찾기
        for (const part of accumulatedUserParts) {
          if (part.text && part.text.includes("**검색 결과 (이미 검색함)**")) {
            // JSON 결과 추출
            const jsonMatch = part.text.match(/```json\n([\s\S]*?)\n```/);
            if (jsonMatch) {
              try {
                ripgrepResults = JSON.parse(jsonMatch[1]);
                // 패턴 추출
                const patternMatch = part.text.match(
                  /\*\*검색 결과 \(이미 검색함\)\*\*: (.+?)\n/,
                );
                if (patternMatch) {
                  ripgrepPattern = patternMatch[1];
                }
                hasRipgrepResults = true;
                console.log(
                  `[ConversationManager] Found existing ripgrep_search results for pattern: ${ripgrepPattern}`,
                );
                break;
              } catch (e) {
                console.warn(
                  "[ConversationManager] Failed to parse ripgrep_search results from accumulatedUserParts:",
                  e,
                );
              }
            }
          }
        }

        let cleanAnalysisResponse: string;

        if (hasRipgrepResults && ripgrepResults) {
          // LLM 호출 없이 검색 결과를 직접 파싱하여 답변 생성
          console.log(
            "[ConversationManager] Using existing ripgrep_search results to generate answer without LLM call.",
          );
          console.log(
            "[ConversationManager] Debug: ripgrepResults type:",
            Array.isArray(ripgrepResults) ? "array" : typeof ripgrepResults,
          );
          console.log(
            "[ConversationManager] Debug: ripgrepResults length:",
            Array.isArray(ripgrepResults) ? ripgrepResults.length : "N/A",
          );
          if (Array.isArray(ripgrepResults) && ripgrepResults.length > 0) {
            console.log(
              "[ConversationManager] Debug: ripgrepResults[0]:",
              JSON.stringify(ripgrepResults[0], null, 2).substring(
                0,
                AgentConfig.MAX_LOG_PREVIEW_LENGTH,
              ),
            );
          }

          // 검색 결과에서 함수 위치 추출 (SearchResult[] 형식)
          const results: string[] = [];
          if (Array.isArray(ripgrepResults)) {
            for (const searchResult of ripgrepResults) {
              if (
                searchResult &&
                searchResult.file &&
                searchResult.matches &&
                Array.isArray(searchResult.matches)
              ) {
                const fileName =
                  searchResult.file.split(/[/\\]/).pop() || searchResult.file;
                // 첫 번째 매칭 결과의 라인 번호 사용
                if (
                  searchResult.matches.length > 0 &&
                  searchResult.matches[0] &&
                  searchResult.matches[0].line
                ) {
                  results.push(
                    `${fileName} 파일의 ${searchResult.matches[0].line}번째 줄`,
                  );
                }
              }
            }
          }

          if (results.length > 0) {
            // 함수명 추출: 사용자 쿼리에서 추출한 함수명 우선, 없으면 패턴에서 추출
            let functionName: string = extractedFunctionName || "";
            if (!functionName) {
              // 패턴에서 마지막 함수명 추출 (패턴 끝부분의 함수명)
              // 예: (?:function|const|let|var|export\s+(?:function|const|let|var)|export\s+default\s+function)\s+handleSearch\b
              // → handleSearch 추출
              const functionNameMatch = ripgrepPattern.match(/\\(\w+)\\b$/);
              if (functionNameMatch) {
                functionName = functionNameMatch[1];
              } else {
                // 대안: 패턴에서 \s+ 다음의 단어 추출 (마지막 매칭)
                const altMatch = ripgrepPattern.match(/\\s\+(\w+)\\b/);
                if (altMatch) {
                  functionName = altMatch[1];
                } else {
                  // 최후의 수단: 패턴에서 마지막 단어 추출
                  const words = ripgrepPattern.split(/\\s\+/);
                  if (words.length > 0) {
                    const lastWord = words[words.length - 1].replace(
                      /\\b$/,
                      "",
                    );
                    if (
                      lastWord &&
                      lastWord.length > 0 &&
                      !lastWord.includes("\\")
                    ) {
                      functionName = lastWord;
                    }
                  }
                }
              }
            }
            if (!functionName) {
              functionName = "함수";
            }

            cleanAnalysisResponse = `${functionName} 함수는 ${results.join(", ")}에 정의되어 있습니다.`;
            console.log(
              `[ConversationManager] Generated answer from ripgrep results: ${cleanAnalysisResponse}`,
            );
          } else {
            console.warn(
              "[ConversationManager] Failed to extract results from ripgrep_search data. ripgrepResults:",
              JSON.stringify(ripgrepResults, null, 2).substring(0, 1000),
            );
            cleanAnalysisResponse = "검색 결과를 찾을 수 없습니다.";
          }
        } else {
          // 기존 로직: LLM 호출하여 답변 생성
          console.log(
            "[ConversationManager] No existing ripgrep_search results found. Calling LLM to generate answer.",
          );

          const analysisPrompt = systemPrompt + getGeneralAnalysisPrompt();

          // 스트리밍 설정 확인
          const isStreamingEnabledForAnalysis = options.extensionContext
            ? await SettingsManager.getInstance(
                options.extensionContext,
              ).isStreamingEnabled()
            : false;

          let analysisResponse: string;

          if (isStreamingEnabledForAnalysis) {
            // 스트리밍 모드: 분석 응답 실시간 전송
            console.log(
              "[ConversationManager] Streaming mode enabled for analysis response",
            );
            WebviewBridge.startStreamingMessage(
              webviewToRespond,
              "assistant",
              conversationTurnId ? { conversationTurnId } : undefined,
            );

            const onAnalysisChunk = (chunk: string, done: boolean) => {
              if (chunk) {
                WebviewBridge.streamMessageChunk(webviewToRespond, chunk);
              }
              if (done) {
                WebviewBridge.endStreamingMessage(webviewToRespond);
              }
            };

            const _llmStartAnalysisS = Date.now();
            analysisResponse =
              await this.llmManager.sendMessageWithSystemPromptStreaming(
                analysisPrompt,
                accumulatedUserParts,
                onAnalysisChunk,
                { signal: abortSignal },
              );
            {
              const _t = Date.now() - _llmStartAnalysisS;
              const _tok = estimateTokens(analysisResponse);
              usageMetrics.recordLLMCall(
                _t,
                _tok,
                true,
                await this.llmManager
                  .getCurrentModelName()
                  .catch(() => "unknown"),
              );
            }

            // 스트리밍 완료 후 바로 종료 (정제 필요 없음 - 이미 출력됨)
            stateManager.transitionTo(AgentPhase.DONE);
            break;
          }

          // 비스트리밍 모드
          const _llmStartAnalysisNS = Date.now();
          analysisResponse = await this.llmManager.sendMessageWithSystemPrompt(
            analysisPrompt,
            accumulatedUserParts,
            { signal: abortSignal },
          );
          {
            const _t = Date.now() - _llmStartAnalysisNS;
            const _tok = estimateTokens(analysisResponse);
            usageMetrics.recordLLMCall(
              _t,
              _tok,
              true,
              await this.llmManager
                .getCurrentModelName()
                .catch(() => "unknown"),
            );
          }

          // 응답 정제: thinking 태그 및 JSON 래핑 제거
          cleanAnalysisResponse = StringUtils.cleanText(analysisResponse, {
            removeThinking: true,
            removeNaturalLanguage: false,
            removeSystemMessages: false,
            removeToolTags: true,
            removeJsonThinking: true,
            extractJson: true,
          });

          // JSON 래핑이 있는 경우 파싱
          try {
            const jsonMatch = cleanAnalysisResponse.match(/^\{[\s\S]*\}$/);
            if (jsonMatch) {
              const parsed = JSON.parse(cleanAnalysisResponse);
              if (parsed.response) {
                cleanAnalysisResponse = parsed.response;
              }
            }
          } catch (e) {
            // JSON 파싱 실패 시 원본 사용
          }

          // 응답이 비어있거나 너무 짧은 경우 기본 메시지
          if (
            !cleanAnalysisResponse ||
            cleanAnalysisResponse.length < AgentConfig.MIN_RESPONSE_LENGTH
          ) {
            cleanAnalysisResponse =
              "조사 결과를 바탕으로 답변을 생성할 수 없습니다.";
          }
        }

        console.log(
          `[ConversationManager] Sending analysis response to webview (length: ${cleanAnalysisResponse.length}): ${cleanAnalysisResponse.substring(0, AgentConfig.MIN_ANALYSIS_RESPONSE_LENGTH)}...`,
        );
        // 스트리밍 효과로 전송
        await WebviewBridge.streamText(
          webviewToRespond,
          "CODEPILOT",
          cleanAnalysisResponse,
        );

        // DONE으로 전환
        stateManager.transitionTo(AgentPhase.DONE, {});
        console.log(
          "[ConversationManager] Analysis response sent. Transitioning to DONE.",
        );
        break;
      } else if (currentPlanItemsAll.length > 0 && remaining.length > 0) {
        console.log(
          `[ConversationManager] Tools missing while plan remains. Ending loop.`,
        );
      } else {
        console.log(
          `[ConversationManager] No tools/plan in response. Ending loop.`,
        );
        // [추가] 아무런 작업도 수행하지 않고 루프가 종료된 경우 사용자에게 안내
        if (turnCount === 0) {
          WebviewBridge.receiveMessage(
            webviewToRespond,
            "System",
            "⚠️ 에이전트가 생각만 하고 실제 도구를 호출하지 않았습니다. 모델을 바꾸거나 다시 시도해 보세요.",
          );
        }

        // EXECUTION phase에서 파일이 생성/수정되었으면 테스트 후 REVIEW로 전환
        if (
          currentPhase === AgentPhase.EXECUTION &&
          (createdFiles.length > 0 || modifiedFiles.length > 0)
        ) {
          console.log(
            "[ConversationManager] EXECUTION phase completed with file changes. Running tests before REVIEW.",
          );
          const testTransition = await this.runTestsAndTransition(
            webviewToRespond,
            stateManager,
            retryCoordinator,
            createdFiles,
            modifiedFiles,
            testFixAttempts,
            maxTestFixAttempts,
            isAutoTestRetryEnabled,
            accumulatedUserParts,
            turnCount,
            false, // allPlanItemsDone
            lastTurnHadSuccessfulToolExecution,
          );
          testFixAttempts = testTransition.testFixAttempts;
          if (testTransition.pendingRetryPrompt) {
            pendingRetryPrompt = true;
            turnCount++; // retry → back to EXECUTION
          }
          // REVIEW 전환 시 turnCount++ 하지 않음 (REVIEW handler가 처리)
          continue;
        }
      }

      // 루프 종료 전 자동 테스트 실행 (파일이 생성/수정된 경우, 아직 REVIEW 전환 안 된 경우)
      const hasFileChanges =
        createdFiles.length > 0 || modifiedFiles.length > 0;
      const allPlanItemsCompleted = taskManager.getNextPendingItem() === null;

      if (
        hasFileChanges &&
        stateManager.getCurrentState() !== AgentPhase.REVIEW &&
        allPlanItemsCompleted
      ) {
        const testTransition = await this.runTestsAndTransition(
          webviewToRespond,
          stateManager,
          retryCoordinator,
          createdFiles,
          modifiedFiles,
          testFixAttempts,
          maxTestFixAttempts,
          isAutoTestRetryEnabled,
          accumulatedUserParts,
          turnCount,
          allPlanItemsCompleted, // allPlanItemsDone
          lastTurnHadSuccessfulToolExecution,
        );
        testFixAttempts = testTransition.testFixAttempts;
        if (testTransition.pendingRetryPrompt) {
          pendingRetryPrompt = true;
          turnCount++; // retry → back to EXECUTION
          continue;
        }
        // REVIEW 전환 시 turnCount++ 하지 않음 (REVIEW handler가 처리)
        continue;
      }

      break;
    }

    // Safety net: 루프가 maxTurns로 종료됐지만 REVIEW 상태인 경우 리뷰 실행
    if (
      stateManager.getCurrentState() === AgentPhase.REVIEW &&
      turnCount >= maxTurns
    ) {
      console.log(
        "[ConversationManager] Safety net: Loop exited at maxTurns but REVIEW pending. Running review.",
      );
      await this.handleReviewPhase(
        stateManager,
        webviewToRespond,
        createdFiles,
        modifiedFiles,
        systemPrompt,
        accumulatedUserParts,
        abortSignal,
        options,
        userQuery,
        collectedActions,
        collectedUIMessages,
        lastExecutionTurnId,
        executedCommands,
      );
    }

    // v9.4.0: 파일 트랜잭션 커밋
    FileTransactionManager.getInstance().commit();

    if (turnCount >= maxTurns) {
      WebviewBridge.updateProcessingStatus(
        webviewToRespond,
        "최대 턴 수 도달로 중단되었습니다.",
        "error",
      );
    } else {
      // [수정] 루프가 정상 종료되었는데 아직 'in_progress' 또는 'pending'인 항목이 있다면 'done'으로 처리 (에이전트가 완료했다고 판단한 경우)
      const allItems = taskManager.listPlanItems();
      const unfinishedItems = allItems.filter(
        (item) => item.status === "in_progress" || item.status === "pending",
      );

      if (unfinishedItems.length > 0) {
        console.log(
          `[ConversationManager] Marking ${unfinishedItems.length} remaining items as done`,
        );
        unfinishedItems.forEach((item) => {
          taskManager.updatePlanItemStatus(item.id, "done");
        });
        WebviewBridge.updateTaskQueue(
          webviewToRespond,
          taskManager.listPlanItems(),
        );
      }
      // "작업 완료" processStep 제거: REVIEW 요약이 이미 동일 정보를 표시하므로 중복
    }

    // 참조 추적 정보 전송 (RAG + 정책/스킬) — 리뷰 밑, 턴 액션 위에 표시
    const promptReferences = PromptComposer.getLastReferences();
    const ragReferences = ContextGatherer.getLastRagReferences();
    const allReferences = [...ragReferences, ...promptReferences];
    if (allReferences.length > 0) {
      WebviewBridge.sendReferenceInfo(webviewToRespond, {
        items: allReferences,
      });
    }

    // 턴 액션 삽입 (모든 턴이 완료된 후 한 번만 표시)
    try {
      const diffMgr = InlineDiffManager.getInstance();
      const turnStats = diffMgr.getPendingChangesByTurn();
      if (turnStats.length > 0) {
        webviewToRespond.postMessage({
          command: "showTurnActions",
          turns: turnStats,
        });
      }
    } catch (e) {
      console.warn("[ConversationManager] showTurnActions failed:", e);
    }

    // 📝 v9.7.0: 루프 종료 후 세션에 저장 (어떤 경로로든 종료 시 보장)
    if (options.extensionContext) {
      try {
        const { SessionManager } = await import("../state/SessionManager");
        const sessionManager = SessionManager.getInstance(
          options.extensionContext,
        );
        const currentSession = sessionManager.getCurrentSession();

        if (currentSession) {
          // 최종 응답 생성
          const finalSummary =
            createdFiles.length > 0 || modifiedFiles.length > 0
              ? `${createdFiles.length > 0 ? `생성된 파일: ${createdFiles.join(", ")}\n` : ""}${modifiedFiles.length > 0 ? `수정된 파일: ${modifiedFiles.join(", ")}` : ""}`
              : "";

          // PLAN 모드: 플랜 원문을 assistantResponse로 저장 (다음 턴 히스토리 참조용)
          const assistantResponseToSave =
            isPlanMode && planTextResponse ? planTextResponse : finalSummary;

          const modeLabel = isPlanMode ? "PLAN" : "CODE";
          console.log(
            `[ConversationManager] Saving ${modeLabel} mode entry (loop end) - userQuery: "${userQuery?.substring(0, 50)}..."`,
          );
          await sessionManager.addConversationEntry(currentSession.id, {
            id: `conv_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
            timestamp: Date.now(),
            userRequest: userQuery || "",
            assistantResponse: assistantResponseToSave,
            actions: collectedActions as any,
            filesCreated: createdFiles,
            filesModified: modifiedFiles,
            uiMessages: collectedUIMessages,
            result: "success",
            model: options.currentModelType,
            conversationTurnId: lastExecutionTurnId, // Undo 복원 시 turnCheckpointStack 매칭용
          });
          console.log(
            `[ConversationManager] ${modeLabel} mode entry saved successfully (loop end)`,
          );
        }
      } catch (e) {
        console.warn(
          "[ConversationManager] Failed to save CODE mode entry (loop end):",
          e,
        );
      }

      // Prompt Suggestions (설정으로 on/off)
      const promptSuggestionEnabled = vscode.workspace
        .getConfiguration("codepilot")
        .get<boolean>("promptSuggestion", false);
      if (!promptSuggestionEnabled) {
        console.log(
          "[ConversationManager] Prompt suggestions disabled by setting",
        );
      } else
        try {
          console.log(
            `[ConversationManager] Generating prompt suggestions (files: ${createdFiles.length} created, ${modifiedFiles.length} modified)...`,
          );
          const { PromptSuggestionService } =
            await import("../suggestion/PromptSuggestionService");
          const suggestionService = PromptSuggestionService.getInstance(
            this.llmManager,
          );
          const suggestions = await suggestionService.generateSuggestions(
            userQuery || "",
            createdFiles,
            modifiedFiles,
            "",
          );
          if (suggestions.length > 0 && webviewToRespond) {
            console.log(
              `[ConversationManager] Sending ${suggestions.length} suggestions to webview`,
            );
            webviewToRespond.postMessage({
              command: "showSuggestions",
              suggestions,
            });
          } else {
            console.log(
              `[ConversationManager] No suggestions to show (${suggestions.length} items)`,
            );
          }
        } catch (e) {
          console.warn("[ConversationManager] Prompt suggestions failed:", e);
        }

      // Session Memory auto-extraction
      try {
        const { SessionMemoryExtractor } =
          await import("../../memory/SessionMemoryExtractor");
        const extractor = SessionMemoryExtractor.getInstance(this.llmManager);
        const compactorForExtraction = ConversationCompactor.getInstance(
          this.llmManager,
        );
        const extractionTokens = compactorForExtraction.calculateTotalTokens(
          accumulatedUserParts,
          systemPrompt,
        );
        if (extractor.shouldExtract(extractionTokens, turnCount)) {
          const summary = compactorForExtraction.getLastSummary();
          if (summary) {
            await extractor.extractAndSave(summary, turnCount);
          }
        }
      } catch (e) {
        console.warn(
          "[ConversationManager] Session memory extraction failed:",
          e,
        );
      }

      // AutoDream: increment session counter and check for consolidation
      try {
        const { AutoDreamService } =
          await import("../../memory/AutoDreamService");
        const dreamService = AutoDreamService.getInstance(this.llmManager);
        dreamService.onSessionComplete();
        if (dreamService.shouldConsolidate()) {
          // Run in background (don't block the UI)
          dreamService
            .consolidate()
            .catch((e) =>
              console.warn(
                "[ConversationManager] AutoDream consolidation failed:",
                e,
              ),
            );
        }
      } catch (e) {
        console.warn("[ConversationManager] AutoDream check failed:", e);
      }
    }
  }

  /**
   * 일반 질의응답 처리
   */
  private async handleGeneralAsk(
    systemPrompt: string,
    userParts: UserPart[],
    options: ConversationOptions,
  ): Promise<void> {
    // 스트리밍 설정 확인
    const isStreamingEnabled = options.extensionContext
      ? await SettingsManager.getInstance(
          options.extensionContext,
        ).isStreamingEnabled()
      : false;

    let response: string;

    if (isStreamingEnabled) {
      // 스트리밍 모드: ASK 응답 실시간 전송
      console.log(
        "[ConversationManager] Streaming mode enabled for ASK response",
      );
      WebviewBridge.startStreamingMessage(
        options.webviewToRespond,
        "assistant",
      );

      const onAskChunk = (chunk: string, done: boolean) => {
        if (chunk) {
          WebviewBridge.streamMessageChunk(options.webviewToRespond, chunk);
        }
        if (done) {
          WebviewBridge.endStreamingMessage(options.webviewToRespond);
        }
      };

      const _llmStartAskS = Date.now();
      response = await this.llmManager.sendMessageWithSystemPromptStreaming(
        systemPrompt,
        userParts,
        onAskChunk,
        { signal: options.abortSignal },
      );
      {
        const _t = Date.now() - _llmStartAskS;
        const _tok = estimateTokens(response);
        UsageMetricsManager.getInstance().recordLLMCall(
          _t,
          _tok,
          true,
          await this.llmManager.getCurrentModelName().catch(() => "unknown"),
        );
      }
    } else {
      // 비스트리밍 모드: 기존 방식 (스트리밍 효과 추가)
      const _llmStartAskNS = Date.now();
      response = await this.llmManager.sendMessageWithSystemPrompt(
        systemPrompt,
        userParts,
        { signal: options.abortSignal },
      );
      {
        const _t = Date.now() - _llmStartAskNS;
        const _tok = estimateTokens(response);
        UsageMetricsManager.getInstance().recordLLMCall(
          _t,
          _tok,
          true,
          await this.llmManager.getCurrentModelName().catch(() => "unknown"),
        );
      }
      await WebviewBridge.streamText(
        options.webviewToRespond,
        "CODEPILOT",
        response,
      );
    }

    // ASK 모드 메시지별 토큰 정보
    if (response) {
      const askTokenCount = estimateTokens(response);
      let askModelName: string | undefined;
      try {
        askModelName = await this.llmManager.getCurrentModelName();
      } catch {}
      WebviewBridge.updateMessageTokenInfo(options.webviewToRespond, {
        tokens: askTokenCount,
        model: askModelName,
      });

      // ASK 모드 참조 추적 정보 전송
      const askPromptRefs = PromptComposer.getLastReferences();
      const askRagRefs = ContextGatherer.getLastRagReferences();
      const askAllRefs = [...askRagRefs, ...askPromptRefs];
      if (askAllRefs.length > 0) {
        WebviewBridge.sendReferenceInfo(options.webviewToRespond, {
          items: askAllRefs,
        });
      }
    }

    // 📝 구조화된 메타데이터로 세션에 저장 (ASK 모드)
    if (options.extensionContext && response) {
      const { SessionManager } = await import("../state/SessionManager");
      const sessionManager = SessionManager.getInstance(
        options.extensionContext,
      );
      const currentSession = sessionManager.getCurrentSession();

      if (currentSession) {
        // v9.7.0: 원본 사용자 요청은 options.userQuery 사용 (userParts에서 추출 시 히스토리 포함 문제)
        await sessionManager.addConversationEntry(currentSession.id, {
          id: `conv_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
          timestamp: Date.now(),
          userRequest: options.userQuery || "",
          assistantResponse: response, // ASK 모드는 전체 응답 저장
          actions: [], // ASK 모드는 도구 사용 안 함
          result: "success",
          model: options.currentModelType,
        });
      }

      // ASK 모드 사용 토큰 계산 및 누적
      let askTokens = estimateTokens(systemPrompt);
      userParts.forEach((part) => {
        if (part.text) {
          askTokens += estimateTokens(part.text);
        }
      });
      if (response) {
        askTokens += estimateTokens(response);
      }
      sessionManager.addTokensUsed(askTokens);

      // 실제 컨텍스트 토큰 사용량으로 게이지 업데이트 (누적이 아닌 현재 LLM 컨텍스트)
      const currentModelType = options.currentModelType || AiModelType.OLLAMA;
      const modelLimits =
        MODEL_TOKEN_LIMITS[currentModelType] ||
        MODEL_TOKEN_LIMITS[AiModelType.OLLAMA];
      const maxTokens = modelLimits?.maxInputTokens || 128000;

      // askTokens = 시스템 프롬프트 + userParts + response (실제 LLM 컨텍스트)
      WebviewBridge.updateContextInfo(options.webviewToRespond, {
        messageCount: userParts.length,
        tokenUsage: {
          current: askTokens,
          max: maxTokens,
          percentage: (askTokens / maxTokens) * 100,
        },
      });

      // 세션 히스토리 자동 압축 (LLM 요약 포함)
      try {
        // ConversationCompactor를 SessionManager에 주입 (lazy injection)
        const compactor = ConversationCompactor.getInstance(this.llmManager);
        // StateManager 설정 (compactorModel 사용을 위해)
        if (options.extensionContext) {
          compactor.setStateManager(
            StateManager.getInstance(options.extensionContext),
          );
        }
        sessionManager.setCompactor(compactor);

        // 토큰 임계값 확인 후 자동 압축
        await sessionManager.compactSessionIfNeeded(maxTokens);
      } catch (e) {
        console.warn(
          "[ConversationManager] Failed to compact session history (ASK mode):",
          e,
        );
      }
    }
  }

  /**
   * 텍스트에서 파일 경로 추출 (단순화된 정규식)
   * Smart Skip 로직 및 Investigation phase에서 사용
   *
   * @param text 추출할 텍스트
   * @returns 추출된 파일 경로 배열 (중복 제거됨)
   */
  private extractFilePathsFromText(text: string): string[] {
    if (!text) {
      return [];
    }

    // 단순화된 정규식: 확장자가 있는 경로/파일명만 추출
    // 예: "src/App.tsx", "package.json", "./config.json" 등
    const fileRegex = /\b[\w\-\/\.]+\.[a-zA-Z0-9]+\b/g;
    const matches = text.match(fileRegex) || [];

    // 중복 제거 및 필터링
    const uniquePaths = Array.from(new Set(matches))
      .map((path) => path.trim().replace(/^\.\//, "")) // 앞뒤 공백 제거, ./ 제거
      .filter((path) => {
        // 최소 길이 체크 (예: "a.b" 같은 건 제외)
        if (path.length < AgentConfig.MIN_FILE_PATH_LENGTH) {
          return false;
        }
        // '...' 같은 패턴 제외
        if (path.includes("...")) {
          return false;
        }
        // 확장자만 있고 파일명이 없는 경우 제외 (예: ".tsx")
        if (path.startsWith(".")) {
          return false;
        }
        return true;
      });

    return uniquePaths;
  }

  /**
   * 에러 핸들링
   */
  private handleError(error: unknown, webview: vscode.Webview): void {
    // AbortError는 사용자가 의도적으로 취소한 것이므로 무시
    const isError = error instanceof Error;
    const errorName = isError ? error.name : "";
    const errorMsg = isError ? error.message : String(error);

    if (errorName === "AbortError" || errorMsg.includes("aborted")) {
      console.log("[ConversationManager] Request cancelled by user");
      return;
    }

    console.error("[ConversationManager] Error:", error);
    const errorMessage = errorMsg || "알 수 없는 오류가 발생했습니다.";
    WebviewBridge.receiveMessage(
      webview,
      "System",
      `오류 발생: ${errorMessage}`,
    );
    WebviewBridge.updateProcessingStatus(
      webview,
      "오류가 발생했습니다.",
      "error",
    );
  }

  // Output Contract 검증은 OutputValidator.validate() 사용
  // handlers/OutputValidator.ts로 분리됨

  /**
   * 텍스트 응답 추출
   */
  /**
   * execution-first 작업인지 판단하는 공통 함수
   * 모든 곳에서 동일한 기준으로 판단하여 FSM 일관성 보장
   *
   * @param intent 의도 분석 결과
   * @param hasExecutionIntentEver 이미 execution plan item이 존재하는지 여부
   * @param hasActivePlan 기존 활성 plan이 있는지 여부 (초기 판단에만 사용, 기본값: false)
   * @param hasExecutionIntent 현재 plan에 execution item이 있는지 여부 (선택적, 기본값: false)
   * @returns execution-first 작업 여부
   */
  private isExecutionFirstTask(
    intent: IntentDetectionResult | null,
    hasExecutionIntentEver: boolean,
    hasActivePlan: boolean = false,
    hasExecutionIntent: boolean = false,
  ): boolean {
    // 이미 execution plan이 있거나 현재 plan에 execution item이 있으면 execution-first로 간주
    if (hasExecutionIntentEver || hasExecutionIntent) {
      return true;
    }

    // intent가 없으면 execution-first 아님
    if (!intent) {
      return false;
    }

    // 초기 판단 시: hasActivePlan이 있으면 execution-first 아님
    if (hasActivePlan) {
      return false;
    }

    // execution 카테고리 또는 code 카테고리의 code_generate/code_modify/code_remove 서브타입
    const isExecutionCategory = intent.category === "execution";
    const isCodeGenerateOrModify =
      intent.category === "code" &&
      (intent.subtype === "code_generate" ||
        intent.subtype === "code_modify" ||
        intent.subtype === "code_remove");

    // confidence >= MIN_EXECUTION_FIRST_CONFIDENCE 필수
    const hasHighConfidence =
      intent.confidence >= AgentConfig.MIN_EXECUTION_FIRST_CONFIDENCE;

    return (isExecutionCategory || isCodeGenerateOrModify) && hasHighConfidence;
  }

  // 참고: 이전 메서드들 (extractResponseText, getToolLabel, createToolResultSummary,
  // sendToolExecutionResultsToUI, hasSideEffects, trackFileChanges)은
  // ResponseProcessor 및 ToolExecutionCoordinator로 이동되었습니다.

  /**
   * 실제 파일 목록을 주입하여 검증된 요약 생성
   */
  private async generateVerifiedSummary(
    originalSummary: string,
    createdFiles: string[],
    modifiedFiles: string[],
    workspaceRoot: string,
    systemPrompt: string,
    accumulatedParts: UserPart[],
    abortSignal?: AbortSignal,
  ): Promise<string> {
    // 실제 디스크에서 파일 존재 여부 확인
    const verifiedCreated: string[] = [];
    const verifiedModified: string[] = [];

    for (const filePath of createdFiles) {
      try {
        const absPath = path.isAbsolute(filePath)
          ? filePath
          : path.join(workspaceRoot, filePath);
        await fs.access(absPath);
        verifiedCreated.push(filePath);
      } catch {
        // 파일이 존재하지 않으면 무시
      }
    }

    for (const filePath of modifiedFiles) {
      try {
        const absPath = path.isAbsolute(filePath)
          ? filePath
          : path.join(workspaceRoot, filePath);
        await fs.access(absPath);
        verifiedModified.push(filePath);
      } catch {
        // 파일이 존재하지 않으면 무시
      }
    }

    // 실제 파일 목록이 없으면 원본 요약 반환 (없으면 기본 메시지)
    if (verifiedCreated.length === 0 && verifiedModified.length === 0) {
      return originalSummary || "작업이 완료되었습니다.";
    }

    // 원본 요약이 있으면 검증만 수행, 없으면 새로 생성
    if (originalSummary && originalSummary.trim()) {
      // 원본 요약이 있는 경우: 파일 목록만 추가하여 반환 (LLM 호출 없음)
      return (
        originalSummary +
        (verifiedCreated.length > 0
          ? `\n\n[생성된 파일: ${verifiedCreated.join(", ")}]`
          : "") +
        (verifiedModified.length > 0
          ? `\n[수정된 파일: ${verifiedModified.join(", ")}]`
          : "")
      );
    } else {
      // 원본 요약이 없는 경우: LLM에게 요약 생성 요청 (1회만)
      // summarize.ts에서 프롬프트 가져오기
      const summaryPrompt = getSimpleSummaryPrompt(
        verifiedCreated,
        verifiedModified,
      );

      try {
        const _llmStartSummary = Date.now();
        const verifiedSummary =
          await this.llmManager.sendMessageWithSystemPrompt(
            summaryPrompt,
            accumulatedParts,
            { signal: abortSignal },
          );
        {
          const _t = Date.now() - _llmStartSummary;
          const _tok = estimateTokens(verifiedSummary);
          UsageMetricsManager.getInstance().recordLLMCall(
            _t,
            _tok,
            true,
            await this.llmManager.getCurrentModelName().catch(() => "unknown"),
          );
        }

        // 문제 해결: REVIEW 단계에서 도구 호출 및 thinking 제거 강화
        let summaryText =
          this.responseProcessor.extractResponseText(verifiedSummary);

        // 도구 호출 및 JSON 패턴 제거
        // ```json ... ``` 블록 제거
        summaryText = summaryText.replace(/```json[\s\S]*?```/gi, "");
        // 직접 JSON 객체 제거 (tool/plan)
        summaryText = summaryText.replace(/\{\s*["']tool["'][\s\S]*?\}/gi, "");
        summaryText = summaryText.replace(/\{\s*"plan"[\s\S]*?\}/gi, "");
        // <file_content> ... </file_content> 블록 제거 (XML 스타일)
        summaryText = summaryText.replace(
          /<file_content>[\s\S]*?<\/file_content>/gi,
          "",
        );

        // thinking/reasoning 패턴 추가 제거 (LLM의 내부 사고 과정)
        summaryText = summaryText.replace(/We need to[^.]*\./gi, "");
        summaryText = summaryText.replace(/But that's[^.]*\./gi, "");
        summaryText = summaryText.replace(/However[^.]*\./gi, "");
        summaryText = summaryText.replace(/Not sure[^.]*\./gi, "");
        summaryText = summaryText.replace(/Possibly[^.]*\./gi, "");
        summaryText = summaryText.replace(/The rule says[^.]*\./gi, "");
        summaryText = summaryText.replace(/Given[^.]*\./gi, "");
        summaryText = summaryText.replace(/Let's[^.]*\./gi, "");

        // 정제된 텍스트 반환
        summaryText = summaryText.trim();
        return summaryText || "작업이 완료되었습니다.";
      } catch (error) {
        console.warn(
          "[ConversationManager] Failed to generate verified summary:",
          error,
        );
        // 실패 시 기본 메시지 반환
        return "작업이 완료되었습니다.";
      }
    }
  }

  /**
   * 요약 결과를 그대로 반환 (변환 로직 제거)
   * 명령어는 프롬프트에서 코드 블록 형식으로 출력하도록 지시
   */
  private parseCommandsInSummary(summary: string): string {
    // 변환 없이 그대로 반환 (프롬프트에서 이미 코드 블록 형식으로 출력하도록 지시)
    return summary;
  }

  /**
   * 현재 세션의 대화를 강제로 압축 (슬래시 명령어용)
   * @param userParts - 압축할 대화 메시지 배열
   * @param extensionContext - ExtensionContext (compactorModel 사용을 위해 선택사항)
   * @returns 압축 결과
   */
  public async forceCompact(
    userParts: UserPart[],
    extensionContext?: vscode.ExtensionContext,
  ): Promise<{
    compacted: boolean;
    originalTokens: number;
    compactedTokens: number;
    savedTokens: number;
    summary?: string;
  }> {
    try {
      const compactor = ConversationCompactor.getInstance(this.llmManager);
      // StateManager 설정 (compactorModel 사용을 위해)
      if (extensionContext) {
        compactor.setStateManager(StateManager.getInstance(extensionContext));
      }
      const currentModelType = this.llmManager.getCurrentModel();
      const maxTokens =
        MODEL_TOKEN_LIMITS[currentModelType]?.maxInputTokens || 128000;

      // 강제 압축 실행 (임계값 무시)
      const result = await compactor.forceCompact(userParts, maxTokens);

      console.log(
        `[ConversationManager] Force compact result: ${result.originalTokens} -> ${result.compactedTokens} tokens`,
      );

      return {
        compacted: result.compacted,
        originalTokens: result.originalTokens,
        compactedTokens: result.compactedTokens,
        savedTokens: result.savedTokens,
        summary: result.summary,
      };
    } catch (error) {
      console.error("[ConversationManager] Force compact failed:", error);
      return {
        compacted: false,
        originalTokens: 0,
        compactedTokens: 0,
        savedTokens: 0,
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 리팩토링 헬퍼 메서드 (v9.3.0: 턴 루프 중복 제거)
  // ═══════════════════════════════════════════════════════════════

  /**
   * REVIEW 단계 처리: 요약 생성, 세션 저장, 컨텍스트 압축, DONE 전환
   * Block 4 (executeAgentLoop 턴 루프에서 추출)
   */
  private async handleReviewPhase(
    stateManager: AgentStateManager,
    webview: vscode.Webview,
    createdFiles: string[],
    modifiedFiles: string[],
    systemPrompt: string,
    accumulatedUserParts: UserPart[],
    abortSignal: AbortSignal | undefined,
    options: ConversationOptions,
    userQuery: string,
    collectedActions: Array<{
      type: string;
      file?: string;
      command?: string;
      result?: string;
    }>,
    collectedUIMessages: Array<{
      sender: "USER" | "CODEPILOT" | "System";
      text: string;
      type?: "action" | "code" | "summary" | "message";
    }>,
    conversationTurnId?: string,
    executedCommands: string[] = [],
    retryCoordinator?: RetryCoordinator,
  ): Promise<TurnAction> {
    // REVIEW가 이미 처리되었는지 확인 (중복 호출 방지)
    const reviewProcessedKey = `review_processed_${createdFiles.join(",")}_${modifiedFiles.join(",")}`;
    console.log(
      `[ConversationManager] REVIEW check - key: "${reviewProcessedKey}", previous: "${(this as any).reviewProcessed}"`,
    );
    if ((this as any).reviewProcessed === reviewProcessedKey) {
      console.log(
        "[ConversationManager] REVIEW phase already processed. Skipping duplicate review.",
      );
      stateManager.transitionTo(AgentPhase.DONE);
      return { action: "break" };
    }
    (this as any).reviewProcessed = reviewProcessedKey;

    console.log(
      "[ConversationManager] REVIEW phase: Generating summary and transitioning to DONE.",
    );
    console.log(
      `[ConversationManager] REVIEW phase files - created: [${createdFiles.join(", ")}], modified: [${modifiedFiles.join(", ")}]`,
    );
    const currentProject = ProjectManager.getInstance().getCurrentProject();
    const workspaceRoot = currentProject?.root || "";

    // 페이즈별 프롬프트 보정 (REVIEW 단계용)
    const activeSystemPrompt = systemPrompt;

    // 요약 생성 (파일이 생성/수정된 경우)
    let finalResponse = "";

    WebviewBridge.sendProcessingStep(webview, "review");
    WebviewBridge.sendProcessingStatus(
      webview,
      "review",
      "결과 요약 생성 중......",
    );

    if (createdFiles.length > 0 || modifiedFiles.length > 0) {
      const verifiedSummary =
        await this.responseProcessor.generateVerifiedSummary(
          "",
          createdFiles,
          modifiedFiles,
          workspaceRoot,
          activeSystemPrompt,
          accumulatedUserParts,
          abortSignal,
        );

      if (verifiedSummary && verifiedSummary.trim()) {
        finalResponse = this.parseCommandsInSummary(verifiedSummary);
        await WebviewBridge.streamText(
          webview,
          "CODEPILOT",
          finalResponse,
          30,
          10,
          conversationTurnId ? { conversationTurnId } : undefined,
        );
      } else if (createdFiles.length > 0 || modifiedFiles.length > 0) {
        finalResponse =
          (createdFiles.length > 0
            ? `생성된 파일: ${createdFiles.join(", ")}\n`
            : "") +
          (modifiedFiles.length > 0
            ? `수정된 파일: ${modifiedFiles.join(", ")}\n`
            : "");
        await WebviewBridge.streamText(
          webview,
          "CODEPILOT",
          finalResponse,
          30,
          10,
          conversationTurnId ? { conversationTurnId } : undefined,
        );
      }
      // 파일 변경 없고 요약도 없으면 메시지 출력하지 않음
    } else {
      // 파일 변경 없으면 완료 메시지 출력하지 않음
      finalResponse = "";
    }

    // CODE 모드 누적 토큰 정보 전송 (요약 메시지 렌더링 후)
    if (this._pendingTokenInfo) {
      WebviewBridge.updateMessageTokenInfo(webview, this._pendingTokenInfo);
      this._pendingTokenInfo = null;
    }

    // 📝 v9.7.0: 세션 저장은 루프 종료 후 executeAgentLoop 끝에서 처리
    // (collectedActions, collectedUIMessages 업데이트는 유지)
    createdFiles.forEach((file) => {
      if (
        !collectedActions.some((a) => a.type === "create" && a.file === file)
      ) {
        collectedActions.push({ type: "create", file, result: "success" });
      }
    });
    modifiedFiles.forEach((file) => {
      if (
        !collectedActions.some((a) => a.type === "modify" && a.file === file)
      ) {
        collectedActions.push({ type: "modify", file, result: "success" });
      }
    });
    if (finalResponse) {
      collectedUIMessages.push({
        sender: "CODEPILOT",
        text: finalResponse,
        type: "summary",
      });
    }

    // CODE 모드 사용 토큰을 세션에 설정
    if (options.extensionContext) {
      try {
        const { SessionManager } = await import("../state/SessionManager");
        const sessionManager = SessionManager.getInstance(
          options.extensionContext,
        );
        const compactor = ConversationCompactor.getInstance(this.llmManager);
        const currentTokens = compactor.calculateTotalTokens(
          accumulatedUserParts,
          systemPrompt,
        );
        sessionManager.setTotalTokensUsed(currentTokens);
      } catch (e) {
        console.warn(
          "[ConversationManager] Failed to set tokens in session:",
          e,
        );
      }
    }

    // 세션 히스토리 자동 압축
    if (options.extensionContext) {
      try {
        const { SessionManager } = await import("../state/SessionManager");
        const sessionManager = SessionManager.getInstance(
          options.extensionContext,
        );
        const currentModelType = options.currentModelType || AiModelType.OLLAMA;
        const modelLimits =
          MODEL_TOKEN_LIMITS[currentModelType] ||
          MODEL_TOKEN_LIMITS[AiModelType.OLLAMA];
        const maxTokens = modelLimits?.maxInputTokens || 128000;

        const compactor = ConversationCompactor.getInstance(this.llmManager);
        compactor.setStateManager(
          StateManager.getInstance(options.extensionContext),
        );
        sessionManager.setCompactor(compactor);

        await sessionManager.compactSessionIfNeeded(maxTokens);
      } catch (e) {
        console.warn(
          "[ConversationManager] Failed to compact session history:",
          e,
        );
      }
    }

    // REVIEW 완료 후 DONE으로 전환
    stateManager.transitionTo(AgentPhase.DONE);
    console.log(
      "[ConversationManager] REVIEW completed, transitioning to DONE.",
    );
    return { action: "break" };
  }

  /**
   * PreToolUseValidator에 의해 차단된 도구 처리
   * @returns 'break' (모든 도구 차단 → 루프 종료), 'continue' (일부 성공 → 계속), null (차단 없음)
   */
  private handleBlockedTools(
    hasBlocked: boolean,
    blockedMessages: string[],
    hasSuccessful: boolean,
    stateManager: AgentStateManager,
    accumulatedUserParts: UserPart[],
    webview?: vscode.Webview,
  ): "break" | "continue" | null {
    if (!hasBlocked || blockedMessages.length === 0) {
      return null;
    }

    console.log(
      `[ConversationManager] Tool blocked by PreToolUseValidator: ${blockedMessages.join(", ")}`,
    );

    // 차단 메시지 채팅 출력은 ToolExecutionCoordinator 가 이미 `🚫 [보안 차단]`
    // 으로 송출함 (BLOCKED_BY_VALIDATOR 분기). 여기서 또 송출하면 동일 차단이
    // 두 번 표시되는 회귀가 생기므로 ConversationManager 측 emit 은 제거.
    // (로그는 디버깅용으로 유지)

    if (!hasSuccessful) {
      stateManager.transitionTo(AgentPhase.REVIEW);
      return "break";
    }

    accumulatedUserParts.push({
      text: `[시스템 알림] 다음 파일은 보안 규칙에 의해 접근이 차단되었습니다: ${blockedMessages.join(", ")}. 해당 파일을 제외하고 나머지 파일로 작업을 계속하세요.`,
    });
    return "continue";
  }

  /**
   * REVIEW 단계로 전환 (UI 상태 업데이트 포함)
   */
  private transitionToReview(
    stateManager: AgentStateManager,
    webview: vscode.Webview,
    message: string,
  ): TurnAction {
    WebviewBridge.sendProcessingStep(webview, "review");
    WebviewBridge.sendProcessingStatus(webview, "review", `[검토] ${message}`);
    stateManager.transitionTo(AgentPhase.REVIEW);
    return { action: "continue" };
  }

  /**
   * Plan item 완료 처리 + UI 동기화
   */
  private completePlanItem(
    taskManager: TaskManager,
    webview: vscode.Webview,
    planItemId: string,
  ): void {
    taskManager.updatePlanItemStatus(planItemId, "done");
    WebviewBridge.updateTaskQueue(webview, taskManager.listPlanItems());
  }

  /**
   * 도구 실행 후 전이 결정: INVESTIGATION 계속, EXECUTION 완료 → REVIEW, MCP 결과 해석 등
   * Block 22 (executeAgentLoop 턴 루프에서 추출)
   */
  private async handlePostToolTransition(
    totalToolCalls: ToolUse[],
    validPlanReceived: boolean,
    currentPhase: string,
    stateManager: AgentStateManager,
    taskManager: TaskManager,
    webview: vscode.Webview,
    retryCoordinator: RetryCoordinator,
    accumulatedUserParts: UserPart[],
    createdFiles: string[],
    modifiedFiles: string[],
    testFixAttempts: number,
    maxTestFixAttempts: number,
    isAutoTestRetryEnabled: boolean,
    turnCount: number,
    llmResponse: string,
    turnResultsSummary: string,
    intent: IntentDetectionResult | null,
  ): Promise<{
    turnAction: TurnAction;
    testFixAttempts: number;
    pendingRetryPrompt: boolean;
    pendingMCPResultInterpretation: boolean;
  }> {
    if (totalToolCalls.length === 0 && !validPlanReceived) {
      return {
        turnAction: { action: "proceed" },
        testFixAttempts,
        pendingRetryPrompt: false,
        pendingMCPResultInterpretation: false,
      };
    }

    accumulatedUserParts.push({ text: llmResponse });
    accumulatedUserParts.push({ text: turnResultsSummary });

    const nextPendingItem = taskManager.getNextPendingItem();

    // 남은 계획이 있으면 계속 진행
    if (nextPendingItem) {
      return {
        turnAction: { action: "continue" },
        testFixAttempts,
        pendingRetryPrompt: false,
        pendingMCPResultInterpretation: false,
      };
    }

    // 조사 단계에서는 계획이 없어도 계속 진행
    if (currentPhase === AgentPhase.INVESTIGATION) {
      // 핵심 수정: INVESTIGATION 단계에서도 MCP 도구 실행 후 결과 해석 플래그 설정
      // 이전: MCP 체크가 INVESTIGATION early return 이후에 있어서 도달 불가 → 무한 루프
      // 현재: MCP 도구가 실행되었으면 pendingMCPResultInterpretation=true로 설정
      const toolRegistry = ToolRegistry.getInstance();
      const hasMCPToolInInvestigation = totalToolCalls.some((call) =>
        toolRegistry.isMCPTool(call.name),
      );

      if (hasMCPToolInInvestigation) {
        console.log(
          "[ConversationManager] INVESTIGATION phase: MCP tool executed. Feeding results back to LLM for interpretation.",
        );
        WebviewBridge.sendProcessingStep(webview, "thinking");
        WebviewBridge.sendProcessingStatus(
          webview,
          "thinking",
          `[조사] MCP 도구 결과 분석 중...`,
        );
        return {
          turnAction: { action: "continue" },
          testFixAttempts,
          pendingRetryPrompt: false,
          pendingMCPResultInterpretation: true,
        };
      }

      console.log(
        "[ConversationManager] Investigation phase: continuing to allow plan creation or work execution.",
      );
      accumulatedUserParts.push({
        text: getInvestigationToolResultFollowupPrompt(),
      });
      return {
        turnAction: { action: "continue" },
        testFixAttempts,
        pendingRetryPrompt: false,
        pendingMCPResultInterpretation: false,
      };
    }

    // code_modify/code_generate intent일 때 파일 도구(create_file/update_file) 없으면 완료로 판단하지 않음
    // v1.0.25: run_command만으로는 파일 생성 완료로 판단하지 않음 (mkdir, cat 등은 파일 추적 안 됨)
    const fileTools = [Tool.CREATE_FILE, Tool.UPDATE_FILE, Tool.REMOVE_FILE];
    const hasFileToolInHistory =
      createdFiles.length > 0 ||
      modifiedFiles.length > 0 ||
      totalToolCalls.some((call) => fileTools.includes(call.name as Tool));
    const isCodeModifyIntent = intent && intent.subtype === "code_modify";

    const isCodeGenerateIntent = intent && intent.subtype === "code_generate";

    const isCodeRemoveIntent = intent && intent.subtype === "code_remove";

    if (
      (isCodeModifyIntent || isCodeGenerateIntent || isCodeRemoveIntent) &&
      !hasFileToolInHistory
    ) {
      console.log(
        `[ConversationManager] EXECUTION phase: ${intent!.subtype} intent requires write tool. Continuing.`,
      );
      accumulatedUserParts.push({
        text: isCodeModifyIntent
          ? getCodeModifyRequiresFileToolPrompt()
          : isCodeRemoveIntent
            ? `\n[System] You have inspected the relevant files. Now perform the actual deletion the user requested by calling update_file (to remove the referenced code blocks) or remove_file (to delete the whole file). Do not end the turn without a write/delete tool call.`
            : `\n[System] 조사 결과를 바탕으로 실제 파일을 생성하세요. create_file, update_file 등의 도구를 사용하여 사용자가 요청한 코드를 작성하세요.`,
      });
      return {
        turnAction: { action: "continue" },
        testFixAttempts,
        pendingRetryPrompt: false,
        pendingMCPResultInterpretation: false,
      };
    }

    // 파일 변경이 있으면 자동 테스트 후 REVIEW
    const hasFileChanges = createdFiles.length > 0 || modifiedFiles.length > 0;
    if (hasFileChanges) {
      const testTransition = await this.runTestsAndTransition(
        webview,
        stateManager,
        retryCoordinator,
        createdFiles,
        modifiedFiles,
        testFixAttempts,
        maxTestFixAttempts,
        isAutoTestRetryEnabled,
        accumulatedUserParts,
        turnCount,
      );
      return {
        turnAction: { action: "continue" },
        testFixAttempts: testTransition.testFixAttempts,
        pendingRetryPrompt: testTransition.pendingRetryPrompt,
        pendingMCPResultInterpretation: false,
      };
    }

    // 파일 변경이 없는 경우
    const isExecutionRunIntent = intent && intent.subtype === "execution_run";
    const toolRegistry = ToolRegistry.getInstance();
    const hasMCPToolInHistory = totalToolCalls.some((call) =>
      toolRegistry.isMCPTool(call.name),
    );
    const hasRunCommandInHistory = totalToolCalls.some(
      (call) => call.name === Tool.RUN_COMMAND,
    );

    // MCP 도구가 실행된 경우: LLM에게 돌려주고 한 턴 더 진행
    if (hasMCPToolInHistory) {
      console.log(
        "[ConversationManager] MCP tool executed without file changes. Feeding results back to LLM.",
      );
      WebviewBridge.sendProcessingStep(webview, "thinking");
      WebviewBridge.sendProcessingStatus(
        webview,
        "thinking",
        `[실행] MCP 도구 결과 분석 중...`,
      );
      return {
        turnAction: { action: "continue" },
        testFixAttempts,
        pendingRetryPrompt: false,
        pendingMCPResultInterpretation: true,
      };
    }

    // execution_run intent일 때는 run_command가 실행될 때까지 계속 진행 (CODE 모드만 — AGENT는 LLM 자율)
    if (isExecutionRunIntent && !hasRunCommandInHistory) {
      console.log(
        "[ConversationManager] EXECUTION phase: execution_run intent requires run_command. Continuing.",
      );
      WebviewBridge.sendProcessingStep(webview, "executing");
      WebviewBridge.sendProcessingStatus(
        webview,
        "executing",
        `[실행] 명령 실행 준비 중...`,
      );
      accumulatedUserParts.push({
        text: `\n[System] ⚠️ 명령 실행이 필요합니다.\n\n사용자가 명령 실행을 요청했습니다. run_command 도구를 사용하여 적절한 명령을 실행하세요.\n프로젝트 구조를 파악했다면, 이제 실제 명령을 실행하세요.`,
      });
      return {
        turnAction: { action: "continue" },
        testFixAttempts,
        pendingRetryPrompt: false,
        pendingMCPResultInterpretation: false,
      };
    }

    // 그 외의 경우 바로 REVIEW로 전환
    console.log(
      "[ConversationManager] All tasks completed. No file changes detected. Transitioning to REVIEW.",
    );
    const action = this.transitionToReview(
      stateManager,
      webview,
      "작업 완료 - 결과 검토 중...",
    );
    return {
      turnAction: action,
      testFixAttempts,
      pendingRetryPrompt: false,
      pendingMCPResultInterpretation: false,
    };
  }

  /**
   * 도구 실행 공통 패턴: 실행 + UI 콜백 + 파일 추적 + 성공 여부 반환
   * 3곳에서 중복된 도구 실행 보일러플레이트를 통합
   */
  private async executeToolsWithUI(
    toolExecutor: ToolExecutor,
    toolCalls: ToolUse[],
    webview: vscode.Webview,
    actionManager: ActionManager,
    executionManager: ExecutionManager,
    terminalManager: TerminalManager,
    collectedUIMessages: Array<{
      sender: "USER" | "CODEPILOT" | "System";
      text: string;
      type?: "action" | "code" | "summary" | "message";
    }>,
    preloadedFiles: Set<string>,
    alreadyStattedFiles: Set<string>,
    createdFiles: string[],
    modifiedFiles: string[],
    includeWebviewInContext: boolean = false,
    conversationTurnId?: string,
    executedCommands: string[] = [],
    isPlanMode: boolean = false,
    abortSignal?: AbortSignal,
  ): Promise<{
    toolResults: ToolResponse[];
    hasSuccessfulExecution: boolean;
    hasWriteToolExecution: boolean;
    hasBlockedByValidator: boolean;
    blockedMessages: string[];
    hasUserSkipped?: boolean;
    inlineDiagnosticErrors?: string;
  }> {
    const currentProject = ProjectManager.getInstance().getCurrentProject();
    const workspaceRoot = currentProject?.root || "";

    // 사용자 확인이 필요한 도구 필터링
    const settingsManager = SettingsManager.getInstance();
    const isAutoToolEnabled =
      await settingsManager.isAutoToolExecutionEnabled();
    const isAutoCommandEnabled =
      await settingsManager.isAutoExecuteCommandsEnabled();
    const isAutoUpdateEnabled = await settingsManager.isAutoUpdateEnabled();
    const isAutoDeleteFilesEnabled =
      await settingsManager.isAutoDeleteFilesEnabled();

    // 실행할 도구와 건너뛸 도구 분리
    const approvedToolCalls: ToolUse[] = [];
    const skippedToolResults: ToolResponse[] = [];

    // ⚡ 동일 턴 read_file(A) + update_file(A) 차단: LLM이 파일 내용 모르고 SEARCH 생성하는 패턴
    const readPathsInBatch = new Set<string>();
    for (const call of toolCalls) {
      if (call.name === Tool.READ_FILE && call.params.path) {
        readPathsInBatch.add(call.params.path);
      }
    }

    for (const call of toolCalls) {
      // PLAN 모드: 쓰기 도구 차단
      if (
        isPlanMode &&
        [
          Tool.CREATE_FILE,
          Tool.UPDATE_FILE,
          Tool.REMOVE_FILE,
          Tool.RUN_COMMAND,
        ].includes(call.name as Tool)
      ) {
        console.log(
          `[ConversationManager] PLAN mode blocked write tool: ${call.name}`,
        );
        skippedToolResults.push({
          success: false,
          message: `[PLAN 모드] ${call.name}은 PLAN 모드에서 실행할 수 없습니다. PLAN 모드는 읽기 전용입니다. 탐색을 마치고 구현 계획 Markdown만 출력하세요.`,
        });
        continue;
      }

      // cross-turn 중복 stat_file → 스킵
      if (
        call.name === Tool.STAT_FILE &&
        call.params.path &&
        alreadyStattedFiles.has(call.params.path)
      ) {
        console.log(
          `[ConversationManager] Cross-turn duplicate stat skipped: ${call.params.path}`,
        );
        skippedToolResults.push({
          success: true,
          message: `[이미 조회됨] ${call.params.path}는 이전 턴에서 이미 stat_file로 조회했습니다. 이전 결과를 그대로 사용하세요. 다시 stat_file을 호출하지 마세요.`,
        });
        continue;
      }

      // read_file과 동턴 update_file → 보호 파일만 차단
      if (
        call.name === Tool.UPDATE_FILE &&
        call.params.path &&
        readPathsInBatch.has(call.params.path)
      ) {
        const { PreToolUseValidator } =
          await import("../../tools/PreToolUseValidator");
        if (PreToolUseValidator.isSensitiveFile(call.params.path)) {
          console.log(
            `[ConversationManager] Skipped update_file (protected file): ${call.params.path}`,
          );
          const blockedMsg = `🚫 [보안 차단] 민감한 파일 수정 차단: ${call.params.path}`;
          WebviewBridge.receiveMessage(webview, "System", blockedMsg);
          skippedToolResults.push({
            success: false,
            message: blockedMsg,
          });
          continue;
        }
      }

      const needsConfirmation = await this.checkToolNeedsConfirmation(
        call,
        isAutoToolEnabled,
        isAutoCommandEnabled,
        isAutoUpdateEnabled,
        isAutoDeleteFilesEnabled,
      );

      if (needsConfirmation) {
        const userApproved = await this.requestToolApproval(call, webview);
        if (userApproved) {
          approvedToolCalls.push(call);
        } else {
          // 사용자가 거부한 경우 스킵 결과 추가
          skippedToolResults.push({
            success: false,
            message: "Tool execution rejected by user.",
            error: {
              code: "USER_REJECTED",
              message: "Tool execution rejected by user",
            },
          });
          const skipMsg = `⏭️ [Skipped] ${ToolExecutionCoordinator.getToolLabel(call.name)}: User rejected`;
          WebviewBridge.receiveMessage(webview, "System", skipMsg);
          collectedUIMessages.push({
            sender: "System",
            text: skipMsg,
            type: "action",
          });
        }
      } else {
        approvedToolCalls.push(call);
      }
    }

    // 승인된 도구가 없으면 빈 결과 반환 (사용자가 스킵한 경우 hasUserSkipped: true)
    if (approvedToolCalls.length === 0) {
      const hasUserSkipped = skippedToolResults.some(
        (r: ToolResponse) => r.error?.code === "USER_REJECTED",
      );
      return {
        toolResults: skippedToolResults,
        hasSuccessfulExecution: false,
        hasWriteToolExecution: false,
        hasBlockedByValidator: false,
        blockedMessages: [],
        hasUserSkipped,
      };
    }

    const executionContext: ToolExecutionContext = {
      projectRoot: workspaceRoot,
      workspaceRoot: workspaceRoot,
      actionManager,
      executionManager,
      terminalManager,
      contextManager: this.contextManager,
      conversationTurnId,
    };
    if (includeWebviewInContext) {
      executionContext.webview = webview;
    }

    const uiMsgs: Array<{
      sender: "USER" | "CODEPILOT" | "System";
      text: string;
      type?: "action" | "code" | "summary" | "message";
    }> = [];
    const executedResults = await toolExecutor.executeTools(
      approvedToolCalls,
      executionContext,
      (_toolUse: ToolUse, result: ToolResponse, index: number) => {
        const msgs = ToolExecutionCoordinator.sendSingleToolResultToUI(
          webview,
          approvedToolCalls[index],
          result,
        );
        uiMsgs.push(...msgs);
        WebviewBridge.sendProcessingStatus(
          webview,
          "executing",
          "LLM 응답 대기 중...",
        );
      },
      // 도구 실행 시작 시 진행 상태 표시 (v9.5.0)
      (toolUse: ToolUse, _index: number) => {
        ToolExecutionCoordinator.sendToolStartStatus(webview, toolUse);
      },
      abortSignal,
    );

    // 스킵된 결과와 실행된 결과를 합침 (원래 순서 유지를 위해 재구성)
    const toolResults: ToolResponse[] = [];
    let executedIdx = 0;
    let skippedIdx = 0;
    for (const call of toolCalls) {
      if (approvedToolCalls.includes(call)) {
        const result = executedResults[executedIdx++];
        // 병렬 실행에서 실패로 인해 스킵된 도구는 undefined일 수 있음
        toolResults.push(
          result ?? {
            success: false,
            message: `Tool execution skipped due to prior failure: ${call.name}`,
            error: {
              code: "SKIPPED_DUE_TO_FAILURE",
              message: "Prior command failed, execution stopped",
            },
          },
        );
      } else {
        toolResults.push(skippedToolResults[skippedIdx++]);
      }
    }

    collectedUIMessages.push(...uiMsgs);

    // read_file 결과를 preloadedFiles에 추가 (중복 읽기 방지)
    toolCalls.forEach((call: ToolUse, index: number) => {
      if (call.name === Tool.READ_FILE && toolResults[index]?.success) {
        const filePath = call.params.path || call.params.paths?.split(",")[0];
        if (filePath) {
          preloadedFiles.add(filePath);
        }
      }
    });

    // stat_file 결과를 alreadyStattedFiles에 추가 (턴 간 중복 방지)
    toolCalls.forEach((call: ToolUse, index: number) => {
      if (
        call.name === Tool.STAT_FILE &&
        call.params.path &&
        toolResults[index]?.success
      ) {
        alreadyStattedFiles.add(call.params.path);
      }
    });

    // 파일 변경 추적 (이번 도구 실행에서 새로 변경된 파일만 추적하기 위해 스냅샷)
    const prevCreatedCount = createdFiles.length;
    const prevModifiedCount = modifiedFiles.length;
    ToolExecutionCoordinator.trackFileChanges(
      toolCalls,
      toolResults,
      createdFiles,
      modifiedFiles,
      this.deletedFiles,
    );

    // 성공 여부 추적
    const hasSuccessfulExecution = toolResults.some(
      (result: ToolResponse) => result?.success === true,
    );

    // 쓰기 도구(create_file, update_file, remove_file, run_command) 실행 여부 추적
    // 읽기 전용 도구만 실행된 경우 "작업 완료"로 판단하지 않기 위해 사용
    const hasWriteToolExecution = toolCalls.some(
      (call: ToolUse, index: number) =>
        toolResults[index]?.success === true && !READ_ONLY_TOOLS.has(call.name),
    );

    // PreToolUseValidator 차단 여부 추적 (재시도 방지용)
    const hasBlockedByValidator = toolResults.some(
      (result: ToolResponse) => result.error?.code === "BLOCKED_BY_VALIDATOR",
    );
    const blockedMessages = toolResults
      .filter(
        (result: ToolResponse) => result.error?.code === "BLOCKED_BY_VALIDATOR",
      )
      .map((result: ToolResponse) => result.message || result.error?.message)
      .filter((msg): msg is string => Boolean(msg));

    // 파일 변경 후 formatter 및 validation 실행 (이번 도구 실행에서 새로 변경된 파일만)
    // 누적된 createdFiles/modifiedFiles 전체를 넘기면 이전 턴 pending diff가 남아 중복 포맷팅 발생
    const newlyCreated = createdFiles.slice(prevCreatedCount);
    const newlyModified = modifiedFiles.slice(prevModifiedCount);
    if (newlyCreated.length > 0 || newlyModified.length > 0) {
      await FileChangeHandler.afterFileChanges(
        webview,
        workspaceRoot,
        newlyCreated,
        newlyModified,
      );
    }

    // v1.0.24: EXECUTION 중 즉시 LSP diagnostics 검사
    // 파일 수정 직후 에러를 감지하여 다음 턴에서 LLM이 즉시 수정할 수 있도록 함
    let inlineDiagnosticErrors: string | undefined;
    if (
      hasWriteToolExecution &&
      (createdFiles.length > 0 || modifiedFiles.length > 0)
    ) {
      try {
        // LSP가 변경사항을 처리할 시간을 약간 대기
        await new Promise((resolve) => setTimeout(resolve, 800));
        const diagnosticErrors = await TestRunner.checkDiagnostics(
          createdFiles,
          modifiedFiles,
          workspaceRoot,
        );
        if (diagnosticErrors.length > 0) {
          // Error 수준만 (Warning은 무시) — checkDiagnostics에서 이미 필터링됨
          const errorLines = diagnosticErrors
            .slice(0, 10)
            .map(
              (e) =>
                `  - ${e.file}:${e.line} [${e.source}/${e.code}] ${e.message}`,
            );
          inlineDiagnosticErrors = `[System] ⚠️ LSP Diagnostics: ${diagnosticErrors.length}개 에러 감지\n${errorLines.join("\n")}${diagnosticErrors.length > 10 ? `\n  ... 외 ${diagnosticErrors.length - 10}개` : ""}\n\n위 에러를 수정해주세요. 현재 파일 내용을 read_file로 확인한 후 update_file로 수정하세요.`;
          console.log(
            `[ConversationManager] Inline diagnostics: ${diagnosticErrors.length} errors detected during EXECUTION`,
          );
        }
      } catch (e) {
        console.warn(
          "[ConversationManager] Inline diagnostics check failed:",
          e,
        );
      }
    }

    // 파일 삭제 후 import 정리 컨텍스트 수집
    if (this.deletedFiles.length > 0) {
      try {
        const importMap = await FileChangeHandler.findImportingFiles(
          this.deletedFiles,
          workspaceRoot,
        );
        if (importMap.size > 0) {
          let cleanupMsg =
            "[SYSTEM] 삭제된 파일의 import를 사용하는 파일이 감지되었습니다. 해당 import 문을 정리해주세요:\n";
          for (const [deleted, importers] of importMap) {
            cleanupMsg += `\n삭제된 파일: ${deleted}\nimport하는 파일: ${importers.join(", ")}\n`;
          }
          this._pendingImportCleanupMsg = cleanupMsg;
          console.log(
            `[ConversationManager] Import cleanup needed for ${importMap.size} deleted file(s)`,
          );
        }
      } catch (e) {
        console.warn(
          "[ConversationManager] Import cleanup detection failed:",
          e,
        );
      } finally {
        // 처리 완료 후 deletedFiles 초기화 (중복 검색 방지, 메모리 누수 방지)
        this.deletedFiles = [];
      }
    }

    // 사용자가 스킵한 도구가 있는지 확인
    const hasUserSkipped = toolResults.some(
      (r: ToolResponse) => r.error?.code === "USER_REJECTED",
    );

    return {
      toolResults,
      hasSuccessfulExecution,
      hasWriteToolExecution,
      hasBlockedByValidator,
      blockedMessages,
      hasUserSkipped,
      inlineDiagnosticErrors,
    };
  }

  /**
   * 도구가 사용자 확인이 필요한지 판단
   */
  private async checkToolNeedsConfirmation(
    call: ToolUse,
    isAutoToolEnabled: boolean,
    isAutoCommandEnabled: boolean,
    isAutoUpdateEnabled: boolean,
    isAutoDeleteFilesEnabled: boolean,
  ): Promise<boolean> {
    const toolName = call.name as string;

    // 전체 도구 자동 실행이 OFF면 모든 도구에 확인 필요
    if (!isAutoToolEnabled) {
      return true;
    }

    // 명령어 자동 실행이 OFF이고 RUN_COMMAND인 경우
    if (!isAutoCommandEnabled && toolName === Tool.RUN_COMMAND) {
      return true;
    }

    // 파일 자동 업데이트가 OFF이고 파일 생성/수정 도구인 경우
    if (
      !isAutoUpdateEnabled &&
      (toolName === Tool.CREATE_FILE || toolName === Tool.UPDATE_FILE)
    ) {
      return true;
    }

    // 파일 자동 삭제가 OFF이고 REMOVE_FILE인 경우
    if (!isAutoDeleteFilesEnabled && toolName === Tool.REMOVE_FILE) {
      return true;
    }

    return false;
  }

  /**
   * 사용자에게 도구 실행 승인 요청
   */
  private async requestToolApproval(
    call: ToolUse,
    webview: vscode.Webview,
  ): Promise<boolean> {
    const toolName = call.name as string;
    const toolLabel = ToolExecutionCoordinator.getToolLabel(toolName);
    const params = call.params || {};

    // 도구별 상세 정보 구성 (의미 있는 정보만 표시)
    let detail = "";
    if (toolName === Tool.RUN_COMMAND) {
      detail = params.command || "";
    } else if (
      toolName === Tool.CREATE_FILE ||
      toolName === Tool.UPDATE_FILE ||
      toolName === Tool.REMOVE_FILE
    ) {
      detail = params.path || params.file_path || params.target_file || "";
    } else if (toolName === Tool.READ_FILE) {
      detail = params.path || params.paths || "";
    } else if (toolName === Tool.LIST_FILES) {
      // list_files는 path만 표시
      detail = params.path || "(project root)";
    } else {
      // 기타 도구는 빈 문자열 (JSON 표시 안 함)
      detail = "";
    }

    // UI에 확인 대기 메시지 표시
    const detailDisplay = detail
      ? `: ${detail.substring(0, 50)}${detail.length > 50 ? "..." : ""}`
      : "";
    const waitingMsg = `⏳ [Pending] ${toolLabel}${detailDisplay} - 사용자 승인 필요`;
    WebviewBridge.receiveMessage(webview, "System", waitingMsg);

    // VS Code 확인 다이얼로그 표시
    const dialogDetail = detail ? `\n${detail}` : "";
    const result = await vscode.window.showInformationMessage(
      `도구 실행: ${toolLabel}${dialogDetail}`,
      { modal: true },
      "실행",
      "건너뛰기",
    );

    return result === "실행";
  }

  /**
   * 자동 테스트 실행 후 결과에 따라 REVIEW 전환 또는 재시도 결정
   * 5곳에서 중복된 테스트+재시도 로직을 통합
   */
  private async runTestsAndTransition(
    webview: vscode.Webview,
    stateManager: AgentStateManager,
    retryCoordinator: RetryCoordinator,
    createdFiles: string[],
    modifiedFiles: string[],
    testFixAttempts: number,
    maxTestFixAttempts: number,
    isAutoTestRetryEnabled: boolean,
    accumulatedUserParts: UserPart[],
    turnCount: number,
    allPlanItemsDone: boolean = false,
    hasWriteToolSinceLastTest: boolean = true,
    abortSignal?: AbortSignal,
  ): Promise<{
    turnAction: TurnAction;
    testFixAttempts: number;
    pendingRetryPrompt: boolean;
  }> {
    const hasFileChanges = createdFiles.length > 0 || modifiedFiles.length > 0;

    if (!hasFileChanges) {
      const action = this.transitionToReview(
        stateManager,
        webview,
        "작업 완료 - 결과 검토 중...",
      );
      return { turnAction: action, testFixAttempts, pendingRetryPrompt: false };
    }

    // write tool 없이 read_file만 실행된 retry 턴에서는 테스트 스킵 (코드 변경 없으므로 결과 동일)
    if (!hasWriteToolSinceLastTest && testFixAttempts > 0) {
      console.log(
        "[ConversationManager] Skipping TestRunner: no write tools since last test (read-only retry turn).",
      );
      return {
        turnAction: { action: "continue" },
        testFixAttempts,
        pendingRetryPrompt: false,
      };
    }

    // UI 상태: 테스트 실행 중
    WebviewBridge.sendProcessingStep(webview, "executing");
    WebviewBridge.sendProcessingStatus(
      webview,
      "executing",
      `[실행][단계 ${turnCount + 1}] 자동 테스트 실행 중...`,
    );

    const workspaceRoot =
      ProjectManager.getInstance().getCurrentProject()?.root || "";
    const testResult = await TestRunner.runAutomatedTests(
      webview,
      workspaceRoot,
      createdFiles,
      modifiedFiles,
      retryCoordinator.getValidationTimeout(),
      retryCoordinator.excludedValidationCommands,
      "executing",
      abortSignal,
    );

    if (testResult.success) {
      retryCoordinator.onValidationSuccess();
      console.log(
        "[ConversationManager] Tests passed. Transitioning to REVIEW phase.",
      );
      const action = this.transitionToReview(
        stateManager,
        webview,
        "테스트 통과 - 결과 검토 중...",
      );
      return { turnAction: action, testFixAttempts, pendingRetryPrompt: false };
    }

    // 테스트 실패 → RetryCoordinator
    const retryDecision = await retryCoordinator.handleTestFailure({
      testResult,
      testFixAttempts,
      maxTestFixAttempts,
      isAutoTestRetryEnabled,
      createdFiles,
      modifiedFiles,
      workspaceRoot,
      webview,
    });
    testFixAttempts = retryDecision.testFixAttempts;

    if (retryDecision.action === "retry") {
      accumulatedUserParts.push({ text: retryDecision.prompt! });
      return {
        turnAction: { action: "continue" },
        testFixAttempts,
        pendingRetryPrompt: true,
      };
    }

    // 재시도 초과 또는 RetryCoordinator give_up
    this._retryGaveUp = true;
    if (retryDecision.giveUpReason !== "disabled") {
      WebviewBridge.receiveMessage(
        webview,
        "System",
        getTestRetryExceededMessage(
          maxTestFixAttempts,
          testResult.errorMessage || "",
          retryDecision.giveUpReason,
        ),
      );
    }
    const action = this.transitionToReview(
      stateManager,
      webview,
      "테스트 실패 - 결과 검토 중...",
    );
    return { turnAction: action, testFixAttempts, pendingRetryPrompt: false };
  }

  // ─── 메모리 누수 방지 ───

  /**
   * accumulatedUserParts 메모리 정리
   * - 최대 항목 수 초과 시 오래된 항목 제거
   * - 개별 항목의 텍스트 길이 제한
   */
  private trimAccumulatedParts(parts: UserPart[]): UserPart[] {
    // 1. 항목 수 제한
    if (parts.length > AgentConfig.MAX_ACCUMULATED_PARTS) {
      console.log(
        `[ConversationManager] Trimming accumulatedUserParts: ${parts.length} → ${AgentConfig.ACCUMULATED_PARTS_TRIM_TARGET}`,
      );
      // 첫 번째 항목(원래 사용자 쿼리)과 최근 항목들 유지
      const firstPart = parts[0];
      const recentParts = parts.slice(
        -AgentConfig.ACCUMULATED_PARTS_TRIM_TARGET + 1,
      );
      parts = [firstPart, ...recentParts];
    }

    // 2. read_file 중복 제거 (같은 파일을 여러 번 읽은 경우 최신 결과만 유지)
    const fileReadPattern = /\[Tool: read_file\][\s\S]*?File:\s*([^\n]+)/;
    const lastReadIndex = new Map<string, number>(); // filePath → 마지막 인덱스

    // 역순으로 탐색하여 각 파일의 마지막 읽기 위치 기록
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

    // 중복된 이전 읽기 결과를 축약으로 교체
    let dedupeCount = 0;
    for (let i = 0; i < parts.length; i++) {
      const text = parts[i]?.text;
      if (!text) continue;
      const match = text.match(fileReadPattern);
      if (match) {
        const filePath = match[1].trim();
        const lastIdx = lastReadIndex.get(filePath);
        if (lastIdx !== undefined && lastIdx !== i) {
          // 이전 읽기 → 축약으로 교체
          parts[i] = {
            text: `[이전 read_file 결과 생략: ${filePath} — 최신 결과가 아래에 있음]`,
          };
          dedupeCount++;
        }
      }
    }
    if (dedupeCount > 0) {
      console.log(
        `[ConversationManager] Deduped ${dedupeCount} duplicate read_file results`,
      );
    }

    // 3. 개별 항목 텍스트 길이 제한
    for (const part of parts) {
      if (part.text && part.text.length > AgentConfig.MAX_PART_TEXT_LENGTH) {
        console.log(
          `[ConversationManager] Trimming part text: ${part.text.length} → ${AgentConfig.PART_TEXT_TRIM_LENGTH}`,
        );
        part.text =
          part.text.substring(0, AgentConfig.PART_TEXT_TRIM_LENGTH) +
          "\n\n... [내용이 너무 길어 일부가 생략되었습니다] ...";
      }
    }

    return parts;
  }

  /**
   * 대화 종료 시 리소스 정리
   * handleUserMessageAndRespond 또는 runAgentLoop 종료 시 호출 가능
   */
  public cleanupConversationResources(): void {
    // 트랜잭션 매니저 정리
    try {
      const txManager = FileTransactionManager.getInstance();
      txManager.discardTransaction();
      txManager.clearHistory();
    } catch (e) {
      // 무시
    }
  }
}
