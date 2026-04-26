import * as vscode from "vscode";
import * as path from "path";

import { NotificationService, OllamaApi } from "./services";
import { AiModelType } from "./services/types";
import { ChatViewProvider } from "./webview/providers";
import { openSettingsPanel } from "./core/webview/SettingsPanelProvider";
import {
  ActionManager,
  ExecutionManager,
  TerminalManager,
  TaskManager,
  ErrorManager,
  ContextManager,
  StateManager,
  SessionManager,
  SettingsManager,
  ProjectManager,
  LLMManager,
} from "./core";
import { PromptBuilder } from "./core/managers/context/PromptBuilder";
import { PromptComposer } from "./core/managers/context/prompts/PromptComposer";
import { ConversationManager } from "./core/managers/conversation/ConversationManager";
import { LLMApiClient } from "./core/managers/model/LLMApiClient";
import { ModelConnectionService } from "./core/managers/model/ModelConnectionService";
import { FileChangeTracker } from "./core/managers/action/file/FileChangeTracker";
import { FileContextTracker } from "./core/managers/context/file/FileContextTracker";
import { ToolRegistry } from "./core/tools/ToolRegistry";
import {
  DiffContentProvider,
  DIFF_VIEW_URI_SCHEME,
} from "./core/managers/diff/DiffContentProvider";
import { DiffManager } from "./core/managers/diff/DiffManager";
import { DiffCodeLensProvider } from "./core/managers/diff/DiffCodeLensProvider";
import { InlineDiffManager } from "./core/managers/diff/InlineDiffManager";
import {
  CreateFileToolHandler,
  UpdateFileToolHandler,
  RemoveFileToolHandler,
  ReadFileToolHandler,
  ListFilesToolHandler,
  RipgrepSearchToolHandler,
  ListImportsToolHandler,
  StatFileToolHandler,
  GlobSearchToolHandler,
} from "./core/tools/file";
import { RunCommandToolHandler } from "./core/tools/terminal";
import { ReadActiveFileToolHandler, LspToolHandler } from "./core/tools/ide";
import { FetchUrlToolHandler } from "./core/tools/web";
import { ListCodeDefinitionsToolHandler } from "./core/tools/file";
import { HotLoadManager } from "./core/managers/hotload";
import { MemoryManager } from "./core/memory/MemoryManager";
import { MemorySaveToolHandler } from "./core/tools/memory/MemorySaveToolHandler";
import { MemoryDeleteToolHandler } from "./core/tools/memory/MemoryDeleteToolHandler";
import { LoadSkillToolHandler } from "./core/tools/skill/LoadSkillToolHandler";
import { AskQuestionToolHandler } from "./core/tools/interaction/AskQuestionToolHandler";
import { DEFAULT_OLLAMA_URL } from "./core/config/ApiDefaults";
import {
  registerGitCommands,
  registerSessionCommands,
  registerDiagnosticCommands,
} from "./commands";
import { runCleanupFunctions, registerCleanup } from "./utils/cleanupRegistry";

// 전역 변수
let ollamaApi: OllamaApi;
let notificationService: NotificationService;

/** codepilot.* globalState 키를 agentgocoder.* 로 일회 마이그레이션 */
async function migrateLegacyGlobalStateKeys(
  context: vscode.ExtensionContext,
): Promise<void> {
  try {
    for (const key of context.globalState.keys()) {
      if (key.startsWith("codepilot.apiKey.")) {
        const suffix = key.slice("codepilot.apiKey.".length);
        const newKey = `agentgocoder.apiKey.${suffix}`;
        const val = context.globalState.get<string>(key);
        if (typeof val === "string" && val.length > 0) {
          const existing = context.globalState.get<string>(newKey);
          if (!existing) {
            await context.globalState.update(newKey, val);
          }
        }
        await context.globalState.update(key, undefined);
      }
    }
    const legacySessions = context.globalState.get<{ sessions: unknown[] }>(
      "codepilot.sessions",
    );
    if (legacySessions?.sessions?.length) {
      const next = context.globalState.get<{ sessions: unknown[] }>(
        "agentgocoder.sessions",
      );
      if (!next?.sessions?.length) {
        await context.globalState.update(
          "agentgocoder.sessions",
          legacySessions,
        );
      }
      await context.globalState.update("codepilot.sessions", undefined);
    }
    const legacyGlobal = context.globalState.get<Record<string, unknown>>(
      "codepilot.globalState",
    );
    if (legacyGlobal && Object.keys(legacyGlobal).length > 0) {
      const next = context.globalState.get<Record<string, unknown>>(
        "agentgocoder.globalState",
      );
      if (!next || Object.keys(next).length === 0) {
        await context.globalState.update(
          "agentgocoder.globalState",
          legacyGlobal,
        );
      }
      await context.globalState.update("codepilot.globalState", undefined);
    }
  } catch (e) {
    console.warn("[Extension] migrateLegacyGlobalStateKeys:", e);
  }
}

export async function activate(context: vscode.ExtensionContext) {
  // punycode deprecation 경고 억제 (간접 의존성에서 발생, 기능에는 영향 없음)
  const originalEmitWarning = process.emitWarning;
  process.emitWarning = (warning: string | Error, ...args: any[]) => {
    if (typeof warning === "string" && warning.includes("punycode")) {
      return; // punycode deprecation 경고 무시
    }
    return originalEmitWarning.call(process, warning, ...args);
  };

  await migrateLegacyGlobalStateKeys(context);

  // 서비스 초기화 (순서 중요: 의존성 주입)
  notificationService = new NotificationService();

  // InlineDiffManager에 ExtensionContext 주입 (영구 저장 복원)
  InlineDiffManager.getInstance().setContext(context);

  // Skills 파일을 storageUri (프로젝트 폴더 외부)에 저장
  if (context.storageUri) {
    const skillsDir = path.join(context.storageUri.fsPath, "rules");
    PromptComposer.setSkillsDir(skillsDir);
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(skillsDir));
  }

  // 글로벌 규칙 디렉토리 설정 (globalStorageUri — 모든 프로젝트 공통)
  const globalRulesDir = path.join(context.globalStorageUri.fsPath, "rules");
  PromptComposer.setGlobalRulesDir(globalRulesDir);
  await vscode.workspace.fs.createDirectory(vscode.Uri.file(globalRulesDir));

  // Core Manager 시스템 초기화
  const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const execManager = ExecutionManager.getInstance();
  const projManager = ProjectManager.getInstance();

  if (workspacePath) {
    try {
      await projManager.initialize(workspacePath);
      // Core Manager System initialized
      // Core Manager System initialized
    } catch (error) {
      console.error("[Extension] Failed to initialize core managers:", error);
    }
  } else {
    console.warn(
      "[Extension] No workspace folder found, core managers initialized without project path",
    );
  }

  const stateManager = StateManager.getInstance(context);
  const settingsManager = SettingsManager.getInstance(context);
  let currentAiModel = await stateManager.getCurrentAiModel();
  const currentAiModelInit = currentAiModel;

  // Ollama API 초기화
  const initialOllamaUrl = await stateManager.getOllamaApiUrl();
  const initialOllamaModel = await stateManager.getOllamaModel();
  ollamaApi = new OllamaApi(initialOllamaUrl || DEFAULT_OLLAMA_URL, context);
  ollamaApi.setModel(initialOllamaModel);
  try {
    await ollamaApi.loadSettingsFromStorage();
  } catch (e) {
    console.warn("[Extension] Failed to load Ollama settings at startup:", e);
  }

  // Ollama 모델의 실제 context length 조회 및 토큰 제한 업데이트 (현재 모델이 Ollama일 때만)
  if (initialOllamaModel && currentAiModel === "ollama") {
    ModelConnectionService.getOllamaModelContextLength(
      initialOllamaModel,
      initialOllamaUrl || DEFAULT_OLLAMA_URL,
    )
      .then((ctxLen: number | null) => {
        if (ctxLen) {
          const { updateOllamaTokenLimits } = require("./utils/tokenUtils");
          updateOllamaTokenLimits(ctxLen);
        }
      })
      .catch(() => {
        /* non-critical */
      });
  }

  // 사용자 OS 정보를 PromptBuilder에 설정
  const userOS =
    require("os").platform() === "darwin"
      ? "macOS"
      : require("os").platform() === "win32"
        ? "Windows"
        : require("os").platform() === "linux"
          ? "Linux"
          : "Unknown";

  // AiModelType이 제대로 로드되었는지 확인
  let defaultModelForPrompt: AiModelType = "ollama" as AiModelType;
  if (AiModelType && AiModelType.OLLAMA) {
    defaultModelForPrompt = AiModelType.OLLAMA;
  }
  const promptBuilder = new PromptBuilder(
    userOS,
    (currentAiModel as AiModelType) || defaultModelForPrompt,
  );
  promptBuilder.setUserOS(userOS);

  // ============================================
  // Manager 시스템 초기화
  // ============================================
  // Initializing Manager System

  // State/Session Manager 초기화 (Extension Context 필요)
  // stateManager와 settingsManager는 이미 위에서 초기화됨
  const sessionManager = SessionManager.getInstance(context);

  // HotLoadManager 초기화 (Hot Load 기능 사용을 위해)
  HotLoadManager.getInstance(context);

  // MemoryManager 초기화 (영속적 메모리 시스템)
  if (workspacePath) {
    MemoryManager.getInstance().initialize(context, workspacePath);
  }

  // 커스텀 제외 패턴 캐시 로드
  const { loadCustomExclusionPatterns } =
    await import("./core/utils/FileExclusionConstants");
  loadCustomExclusionPatterns(context);

  // Project Manager는 이미 위에서 초기화됨
  if (workspacePath) {
    try {
      await projManager.initialize(workspacePath);
      // Project Manager initialized

      // 워크스페이스가 열릴 때 자동으로 세션 생성 및 캐시 미리 로드
      const existingSession =
        sessionManager.findSessionByProject(workspacePath);
      if (!existingSession) {
        // 새 세션 생성
        const newSession = sessionManager.createSession(workspacePath);
        console.log(
          `[Extension] Auto-created session for workspace: ${workspacePath}`,
        );
      } else {
        // 기존 세션을 현재 세션으로 설정
        sessionManager.setCurrentSession(existingSession.id);
        console.log(
          `[Extension] Restored existing session: ${existingSession.id}`,
        );
      }

      // 프로젝트 컨텍스트 캐시 미리 로드 (비동기, 백그라운드)
      sessionManager.preloadProjectContext(workspacePath).catch((err) => {
        console.warn("[Extension] Failed to preload project context:", err);
      });
    } catch (error) {
      console.error("[Extension] Failed to initialize Project Manager:", error);
    }
  }

  // Context Manager 초기화
  const contextManager = ContextManager.getInstance();
  const terminalManager = TerminalManager.getInstance();
  contextManager.setProjectManager(projManager);
  contextManager.setTerminalManager(terminalManager);

  // Error Manager 초기화
  const errorManager = ErrorManager.getInstance();
  errorManager.setExecutionManager(execManager);

  // Task Manager 초기화 및 시작
  const taskManager = TaskManager.getInstance(context);
  taskManager.start();

  // Manager 간 연결 설정
  contextManager.setErrorManager(errorManager);

  // LLM Manager를 ContextManager에 설정 (내용 기반 relevance scoring용)
  // llmManager는 아래에서 초기화되므로 나중에 설정

  // Manager System initialized successfully

  // 현재 AI 모델 설정 로드
  currentAiModel = await stateManager.getCurrentAiModel();
  const uiAiModel = await stateManager.getAiModel();

  // 마이그레이션: 과거 구체적인 'ollama-*' 타입이 저장된 경우 'ollama'로 통일
  if (currentAiModel && currentAiModel.toString().startsWith("ollama")) {
    currentAiModel = "ollama" as any;
    await stateManager.saveCurrentAiModel("ollama" as any);
  }

  // UI에서 저장된 모델이 우선 — 런타임 타입으로 매핑
  if (uiAiModel && uiAiModel !== currentAiModel) {
    let mappedUiModel: string = uiAiModel;
    if (uiAiModel.startsWith("ollama")) {
      mappedUiModel = "ollama";
    } else if (
      uiAiModel.startsWith("admin:") ||
      uiAiModel.startsWith("group:") ||
      uiAiModel.startsWith("supported:")
    ) {
      mappedUiModel = "admin";
    }
    currentAiModel = mappedUiModel as any;
    await stateManager.saveCurrentAiModel(mappedUiModel as any);
  }

  // ConversationManager 초기화 및 설정

  const conversationManager = ConversationManager.getInstance(
    userOS,
    ollamaApi,
  );
  const llmApiClient = new LLMApiClient(ollamaApi, currentAiModel as any);
  const llmManager = LLMManager.getInstance(ollamaApi, currentAiModel as any);
  // 관리자 모델 설정 로드 (admin 타입인 경우)
  if (currentAiModel === "admin") {
    try {
      const adminConfigJson = await stateManager.getAdminModelConfig();
      if (adminConfigJson) {
        const adminConfig = JSON.parse(adminConfigJson);
        // 프로바이더별 API 키 조회 (group 기반)
        if (!adminConfig.apiKey && adminConfig.key) {
          const aiModelSettings = settingsManager.getServerSettings("ai_model");
          const presetEntry = aiModelSettings.find(
            (s: any) => s.key === adminConfig.key,
          );
          const providerGroup = (presetEntry as any)?.group || "";
          const perProviderKey = providerGroup
            ? context.globalState.get<string>(
                `agentgocoder.apiKey.${providerGroup}`,
              )
            : context.globalState.get<string>("agentgocoder.adminApiKey");
          if (perProviderKey) {
            adminConfig.apiKey = perProviderKey;
          }
        }
        // preset에서 authType, endpoint, nativeToolCallingSupported 등 보완
        if (adminConfig.key) {
          try {
            const aiModelSettings =
              settingsManager.getServerSettings("ai_model");
            const serverEntry = aiModelSettings.find(
              (s: any) => s.key === adminConfig.key,
            );
            if (serverEntry?.value) {
              const v = serverEntry.value;
              // preset에서 provider, endpoint, authType 항상 동기화 (프리셋 변경 시 반영)
              const presetProvider = v.provider;
              if (presetProvider) {
                adminConfig.provider = presetProvider;
              }
              const presetEndpoint =
                v.baseUrl || v.base_url || v.endpoint || v.apiEndpoint;
              if (presetEndpoint) {
                adminConfig.endpoint = presetEndpoint;
              }
              const presetAuthType = v.authType || v.auth_type;
              if (presetAuthType) {
                adminConfig.authType = presetAuthType;
              }
              if (adminConfig.nativeToolCallingSupported === undefined) {
                const rawNative =
                  v.nativeToolCallingSupported ??
                  v.native_tool_calling_supported;
                adminConfig.nativeToolCallingSupported =
                  rawNative === true || String(rawNative) === "true";
                adminConfig.streamingSupported =
                  adminConfig.streamingSupported ??
                  v.streamingSupported ??
                  v.streaming_supported ??
                  true;
              }
            }
          } catch {
            /* ignore */
          }
        }
        llmManager.setAdminModelConfig(adminConfig);
        llmApiClient.setAdminModelConfig(adminConfig);
        // 토큰 제한 동적 업데이트
        const { updateAdminTokenLimits } = await import("./utils/tokenUtils");
        updateAdminTokenLimits(
          adminConfig.contextWindow,
          adminConfig.maxOutputTokens || adminConfig.maxTokens,
        );
        console.log(
          "[Extension] Admin model config loaded:",
          adminConfig.model,
          `nativeToolCalling=${adminConfig.nativeToolCallingSupported}`,
        );
      }
    } catch (e) {
      console.warn("[Extension] Failed to load admin model config:", e);
    }
  }

  conversationManager.setLLMService(llmApiClient);
  conversationManager.setPromptBuilder(promptBuilder);
  conversationManager.setStateManager(stateManager);

  // LLM Manager를 ContextManager에 설정 (내용 기반 relevance scoring용)
  contextManager.setLLMManager(llmManager);

  // FileChangeTracker / FileContextTracker 초기화 및 ActionManager에 설정
  const fileChangeTracker = FileChangeTracker.getInstance(context);
  const fileContextTracker = FileContextTracker.getInstance(context);
  const actionManager = ActionManager.getInstance();
  actionManager.setFileChangeTracker(fileChangeTracker);
  actionManager.setFileContextTracker(fileContextTracker);

  // Diff Content Provider 등록 (커스텀 URI 스킴 처리)
  const diffContentProvider = DiffContentProvider.getInstance();
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(
      DIFF_VIEW_URI_SCHEME,
      diffContentProvider,
    ),
  );
  // 커서 IDE 방식: 인라인 Diff CodeLens Provider 등록
  const diffCodeLensProvider = DiffCodeLensProvider.getInstance();
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { scheme: "file" },
      diffCodeLensProvider,
    ),
  );

  // 커서 IDE 방식: 인라인 Diff 명령어 등록
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "agentgocoder.acceptChange",
      async (filePath: string, changeId: string) => {
        const inlineDiffManager = InlineDiffManager.getInstance();
        await inlineDiffManager.acceptChange(filePath, changeId);
        diffCodeLensProvider.refresh();
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "agentgocoder.rejectChange",
      async (filePath: string, changeId: string) => {
        const inlineDiffManager = InlineDiffManager.getInstance();
        await inlineDiffManager.rejectChange(filePath, changeId);
        diffCodeLensProvider.refresh();
      },
    ),
  );

  // 커서 IDE 방식: 키보드 단축키 (Cmd+Enter: 모든 변경사항 수락, Cmd+Backspace: 모든 변경사항 거부)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "agentgocoder.acceptAllChanges",
      async () => {
        const inlineDiffManager = InlineDiffManager.getInstance();
        const pendingFiles = inlineDiffManager.getAllPendingFiles();

        for (const filePath of pendingFiles) {
          await inlineDiffManager.acceptAllChanges(filePath);
        }
        diffCodeLensProvider.refresh();
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "agentgocoder.rejectAllChanges",
      async () => {
        const inlineDiffManager = InlineDiffManager.getInstance();
        const pendingFiles = inlineDiffManager.getAllPendingFiles();

        for (const filePath of pendingFiles) {
          await inlineDiffManager.rejectAllChanges(filePath);
        }
        diffCodeLensProvider.refresh();
      },
    ),
  );

  // Diff 명령어 등록
  context.subscriptions.push(
    vscode.commands.registerCommand("agentgocoder.showDiff", async () => {
      const diffManager = DiffManager.getInstance();
      await diffManager.showWorkingDirectoryChanges();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "agentgocoder.showDiffForFile",
      async (filePath?: string) => {
        const diffManager = DiffManager.getInstance();
        if (!filePath) {
          const activeEditor = vscode.window.activeTextEditor;
          if (activeEditor) {
            filePath = activeEditor.document.uri.fsPath;
          } else {
            vscode.window.showWarningMessage(
              "파일이 선택되지 않았습니다. 먼저 파일을 열어주세요.",
            );
            return;
          }
        }
        await diffManager.showFileDiff(filePath);
      },
    ),
  );

  // Tool 핸들러 등록
  const toolRegistry = ToolRegistry.getInstance();
  toolRegistry.register(new CreateFileToolHandler());
  toolRegistry.register(new UpdateFileToolHandler());
  toolRegistry.register(new RemoveFileToolHandler());
  toolRegistry.register(new ReadFileToolHandler());
  toolRegistry.register(new ListFilesToolHandler());
  toolRegistry.register(new RipgrepSearchToolHandler());
  toolRegistry.register(new RunCommandToolHandler());
  // 새로운 파일 읽기 도구들
  toolRegistry.register(new ListImportsToolHandler());
  toolRegistry.register(new StatFileToolHandler());
  // IDE, Web 도구들
  toolRegistry.register(new ReadActiveFileToolHandler());
  toolRegistry.register(new FetchUrlToolHandler());
  // 파일 경로 패턴 검색
  toolRegistry.register(new GlobSearchToolHandler());
  // 코드 인텔리전스 도구들
  toolRegistry.register(new LspToolHandler());
  toolRegistry.register(new ListCodeDefinitionsToolHandler());
  // 영속적 메모리 도구들
  toolRegistry.register(new MemorySaveToolHandler());
  toolRegistry.register(new MemoryDeleteToolHandler());
  // 스킬 로더 도구 (서브에이전트용)
  toolRegistry.register(new LoadSkillToolHandler());
  // 사용자 질문 도구
  toolRegistry.register(new AskQuestionToolHandler());

  // Graceful shutdown: register cleanup functions for ExecutionManager
  registerCleanup(async () => {
    await execManager.cleanup();
  });

  // ChatViewProvider 인스턴스 생성 및 등록 (CODE 탭)
  const chatViewProvider = new ChatViewProvider(
    context.extensionUri,
    context,
    (viewColumn: vscode.ViewColumn) =>
      openSettingsPanel(
        context.extensionUri,
        context,
        viewColumn,
        settingsManager,
        notificationService,
        ollamaApi,
        undefined,
        undefined,
        chatViewProvider,
      ),
    settingsManager,
    notificationService,
    ollamaApi,
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      ChatViewProvider.viewType,
      chatViewProvider,
      {
        webviewOptions: { retainContextWhenHidden: true },
      },
    ),
  );

  // 웹뷰 자동 열기 (약간의 지연 후)
  setTimeout(async () => {
    try {
      await vscode.commands.executeCommand(
        "workbench.view.extension.agentgocoder",
      );
      // 뷰가 열릴 때까지 약간 대기
      await new Promise((resolve) => setTimeout(resolve, 500));
      await vscode.commands.executeCommand(
        `${ChatViewProvider.viewType}.focus`,
      );
    } catch (error: any) {
      // 사용자가 수동으로 열 수도 있으므로 에러는 무시
    }
  }, 1000);

  // Command 등록
  context.subscriptions.push(
    vscode.commands.registerCommand("agentgocoder.openChatView", async () => {
      try {
        await vscode.commands.executeCommand(
          "workbench.view.extension.agentgocoder",
        );
        await vscode.commands.executeCommand(
          `${ChatViewProvider.viewType}.focus`,
        );
      } catch (error: any) {
        console.error("[Extension] Error opening chat view:", error);
      }
    }),
  );
  // Registering commands

  context.subscriptions.push(
    vscode.commands.registerCommand("agentgocoder.openSettingsPanel", () => {
      // openSettingsPanel command called
      if (!openSettingsPanel) {
        console.error(
          "[Extension] ERROR: openSettingsPanel is undefined when command is called!",
        );
        vscode.window.showErrorMessage(
          "설정 패널을 열 수 없습니다. 확장을 다시 로드해주세요.",
        );
        return;
      }
      openSettingsPanel(
        context.extensionUri,
        context,
        vscode.ViewColumn.One,
        settingsManager,
        notificationService,
        ollamaApi,
        undefined,
        undefined,
        chatViewProvider,
      );
    }),
  );
  // Command registered: agentgocoder.openSettingsPanel

  // 언어 변경 브로드캐스트 명령어 등록
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "agentgocoder.broadcastLanguageChange",
      (language: string) => {
        // 모든 활성 webview에 언어 변경 메시지 브로드캐스트
        vscode.window.terminals.forEach((terminal) => {
          if (terminal.name.includes("agentgocoder")) {
            terminal.sendText(`echo "Language changed to: ${language}"`);
          }
        });

        // 모든 활성 webview 패널에 언어 변경 메시지 전송
        vscode.window.terminals.forEach((terminal) => {
          if (terminal.name.includes("agentgocoder")) {
            terminal.sendText(`echo "Language changed to: ${language}"`);
          }
        });
      },
    ),
  );

  // 진단/테스트 커맨드 등록 (diagnosticCommands.ts)
  context.subscriptions.push(
    ...registerDiagnosticCommands({ context, chatViewProvider }),
  );

  // 캐시/세션 커맨드 등록 (sessionCommands.ts)
  context.subscriptions.push(
    ...registerSessionCommands({ context, chatViewProvider, ollamaApi }),
  );

  // Git 커맨드 등록 (gitCommands.ts)
  context.subscriptions.push(
    ...registerGitCommands({ context, chatViewProvider }),
  );
}

export async function deactivate(): Promise<void> {
  console.log("[Extension] Deactivating...");
  await runCleanupFunctions(5000);
  console.log("[Extension] Deactivated");
}
