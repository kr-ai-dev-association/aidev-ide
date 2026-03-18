import * as vscode from "vscode";
import * as path from "path";

import {
  NotificationService,
  OllamaApi,
} from "./services";
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
  AutoFix,
  AutoFixLlmClient,
  LLMManager,
} from "./core";
import { PromptBuilder } from "./core/managers/context/PromptBuilder";
import { PromptComposer } from "./core/managers/context/prompts/PromptComposer";
import { ConversationManager } from "./core/managers/conversation/ConversationManager";
import { LLMApiClient } from "./core/managers/model/LLMApiClient";
import { FileChangeTracker } from "./core/managers/action/file/FileChangeTracker";
import { FileContextTracker } from "./core/managers/context/file/FileContextTracker";
import { ToolRegistry } from "./core/tools/ToolRegistry";
import {
  DiffContentProvider,
  DIFF_VIEW_URI_SCHEME,
} from "./core/managers/diff/DiffContentProvider";
import { DiffManager } from "./core/managers/diff/DiffManager";
import { InlineCompletionProvider } from "./core/completion/InlineCompletionProvider";
import { DiffCodeLensProvider } from "./core/managers/diff/DiffCodeLensProvider";
import { InlineDiffManager } from "./core/managers/diff/InlineDiffManager";
import {
  CreateFileToolHandler,
  UpdateFileToolHandler,
  RemoveFileToolHandler,
  ReadFileToolHandler,
  ListFilesToolHandler,
  RipgrepSearchToolHandler,
  ExpandAroundLineToolHandler,
  ListImportsToolHandler,
  StatFileToolHandler,
  GlobSearchToolHandler,
} from "./core/tools/file";
import { RunCommandToolHandler } from "./core/tools/terminal";
import { ReadActiveFileToolHandler, LspToolHandler } from "./core/tools/ide";
import { FetchUrlToolHandler } from "./core/tools/web";
import { ListCodeDefinitionsToolHandler } from "./core/tools/file";
import { MCPToolHandler } from "./core/tools/mcp/MCPToolHandler";
import { MCPManager } from "./core/mcp/MCPManager";
import { HotLoadManager } from "./core/managers/hotload";
import { DEFAULT_OLLAMA_URL } from './core/config/ApiDefaults';
import {
  registerGitCommands,
  registerMcpCommands,
  registerSessionCommands,
  registerDiagnosticCommands,
} from "./commands";

// 전역 변수
let ollamaApi: OllamaApi;
let notificationService: NotificationService;

export async function activate(context: vscode.ExtensionContext) {
  // punycode deprecation 경고 억제 (간접 의존성에서 발생, 기능에는 영향 없음)
  const originalEmitWarning = process.emitWarning;
  process.emitWarning = (warning: string | Error, ...args: any[]) => {
    if (typeof warning === "string" && warning.includes("punycode")) {
      return; // punycode deprecation 경고 무시
    }
    return originalEmitWarning.call(process, warning, ...args);
  };

  // 서비스 초기화 (순서 중요: 의존성 주입)
  notificationService = new NotificationService();

  // InlineDiffManager에 ExtensionContext 주입 (영구 저장 복원)
  InlineDiffManager.getInstance().setContext(context);

  // Skills 파일을 storageUri (프로젝트 폴더 외부)에 저장
  if (context.storageUri) {
    const skillsDir = path.join(context.storageUri.fsPath, 'rules');
    PromptComposer.setSkillsDir(skillsDir);
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(skillsDir));
  }

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
  ollamaApi = new OllamaApi(
    initialOllamaUrl || DEFAULT_OLLAMA_URL,
    context,
  );
  ollamaApi.setModel(initialOllamaModel);
  try {
    await ollamaApi.loadSettingsFromStorage();
  } catch (e) {
    console.warn("[Extension] Failed to load Ollama settings at startup:", e);
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

  // AutoFixService에 LLM 클라이언트 주입
  try {
    const autoFixService = AutoFix.getInstance();
    const autoFixLlmClient: AutoFixLlmClient = async ({ error, context }) => {
      const commandPart = context.lastCommand
        ? `실패한 명령어:\n${context.lastCommand}\n\n`
        : "";
      const cwdPart = context.cwd ? `작업 디렉터리: ${context.cwd}\n\n` : "";
      const terminalPart = context.terminalName
        ? `터미널 이름: ${context.terminalName}\n\n`
        : "";

      const prompt =
        "당신은 터미널 명령 오류를 빠르고 안전하게 수정하는 시니어 개발자입니다.\n" +
        "주어진 정보(실패한 명령어, 작업 디렉터리, 오류 메시지)를 바탕으로, " +
        "**수정된 단일 명령어 한 줄만** 제시하세요.\n\n" +
        "규칙:\n" +
        "- 설명 문장, 마크다운, 코드블록, 주석을 포함하지 마세요.\n" +
        "- 오직 실제로 실행할 하나의 명령어만 출력하세요.\n" +
        "- 필요하다면 && 로 여러 하위 명령을 연결할 수 있지만, 너무 복잡한 스크립트는 피하세요.\n" +
        "- 사용자의 OS는 대소문자와 상관없이 감지되며, 현재 환경에 맞는 명령을 사용하세요.\n\n" +
        commandPart +
        cwdPart +
        terminalPart +
        `오류 요약 (카테고리: ${error.category}, 심각도: ${error.severity}):\n${error.message}\n\n` +
        `전체 오류 출력:\n${error.rawOutput}\n`;

      // ErrorManager를 통해 오류 수정 메시지 전송
      const errorManager = ErrorManager.getInstance();
      // AiModelType이 제대로 로드되었는지 확인
      let defaultModelForError: AiModelType = "ollama" as AiModelType;
      if (AiModelType && AiModelType.OLLAMA) {
        defaultModelForError = AiModelType.OLLAMA;
      } else {
        // 동적 import도 정적 import와 동일한 모듈 경로를 사용합니다.
        const typesModule = await import("./services/types");
        if (typesModule.AiModelType) {
          const ollamaValue = typesModule.AiModelType.OLLAMA;
          if (ollamaValue) {
            defaultModelForError = ollamaValue;
          }
        }
      }
      const raw = await errorManager.sendMessageForErrorCorrection(
        prompt,
        new LLMApiClient(
          ollamaApi,
          (currentAiModel as AiModelType) || defaultModelForError,
        ),
        undefined,
      );
      if (!raw) {
        return { correctedCommand: null };
      }

      // 첫 번째 유효한 한 줄을 명령어로 사용
      const line =
        raw
          .split("\n")
          .map((l: string) => l.trim())
          .filter(
            (l: string) => !!l && !l.startsWith("#") && !l.startsWith("//"),
          )[0] || raw.trim();

      return {
        correctedCommand: line || null,
      };
    };

    autoFixService.configure({ llmClient: autoFixLlmClient });
    // AutoFixService LLM client configured
  } catch (e) {
    console.warn(
      "[Extension] Failed to configure AutoFixService LLM client:",
      e,
    );
  }

  // ============================================
  // Manager 시스템 초기화
  // ============================================
  // Initializing Manager System

  // State/Session Manager 초기화 (Extension Context 필요)
  // stateManager와 settingsManager는 이미 위에서 초기화됨
  const sessionManager = SessionManager.getInstance(context);

  // HotLoadManager 초기화 (Hot Load 기능 사용을 위해)
  HotLoadManager.getInstance(context);

  // 커스텀 제외 패턴 캐시 로드
  const { loadCustomExclusionPatterns } = await import('./core/utils/FileExclusionConstants');
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
    } else if (uiAiModel.startsWith("admin:") || uiAiModel.startsWith("group:") || uiAiModel.startsWith("supported:")) {
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
  const llmApiClient = new LLMApiClient(
    ollamaApi,
    currentAiModel as any,
  );
  const llmManager = LLMManager.getInstance(
    ollamaApi,
    currentAiModel as any,
  );
  // 관리자 모델 설정 로드 (admin 타입인 경우)
  if (currentAiModel === 'admin') {
    try {
      const adminConfigJson = await stateManager.getAdminModelConfig();
      if (adminConfigJson) {
        const adminConfig = JSON.parse(adminConfigJson);
        // 프로바이더별 API 키 조회 (group 기반)
        if (!adminConfig.apiKey && adminConfig.key) {
          const aiModelSettings = settingsManager.getServerSettings('ai_model');
          const presetEntry = aiModelSettings.find((s: any) => s.key === adminConfig.key);
          const providerGroup = (presetEntry as any)?.group || '';
          const perProviderKey = providerGroup
            ? context.globalState.get<string>(`codepilot.apiKey.${providerGroup}`)
            : context.globalState.get<string>("codepilot.adminApiKey");
          if (perProviderKey) {
            adminConfig.apiKey = perProviderKey;
          }
        }
        // preset에서 authType, endpoint, nativeToolCallingSupported 등 보완
        if (adminConfig.key) {
          try {
            const aiModelSettings = settingsManager.getServerSettings('ai_model');
            const serverEntry = aiModelSettings.find((s: any) => s.key === adminConfig.key);
            if (serverEntry?.value) {
              const v = serverEntry.value;
              // preset에서 provider, endpoint, authType 항상 동기화 (프리셋 변경 시 반영)
              const presetProvider = v.provider;
              if (presetProvider) {
                adminConfig.provider = presetProvider;
              }
              const presetEndpoint = v.baseUrl || v.base_url || v.endpoint || v.apiEndpoint;
              if (presetEndpoint) {
                adminConfig.endpoint = presetEndpoint;
              }
              const presetAuthType = v.authType || v.auth_type;
              if (presetAuthType) {
                adminConfig.authType = presetAuthType;
              }
              if (adminConfig.nativeToolCallingSupported === undefined) {
                const rawNative = v.nativeToolCallingSupported ?? v.native_tool_calling_supported;
                adminConfig.nativeToolCallingSupported = rawNative === true || String(rawNative) === 'true';
                adminConfig.streamingSupported = adminConfig.streamingSupported ?? v.streamingSupported ?? v.streaming_supported ?? true;
              }
            }
          } catch { /* ignore */ }
        }
        llmManager.setAdminModelConfig(adminConfig);
        llmApiClient.setAdminModelConfig(adminConfig);
        // 토큰 제한 동적 업데이트
        const { updateAdminTokenLimits } = await import("./utils/tokenUtils");
        updateAdminTokenLimits(adminConfig.contextWindow, adminConfig.maxOutputTokens || adminConfig.maxTokens);
        console.log('[Extension] Admin model config loaded:', adminConfig.model, `nativeToolCalling=${adminConfig.nativeToolCallingSupported}`);
      }
    } catch (e) {
      console.warn('[Extension] Failed to load admin model config:', e);
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
  // 소스코드 자동완성 Provider 등록 (Ghost Text / Tab Completion)
  const inlineCompletionProvider = new InlineCompletionProvider(llmManager, stateManager);
  context.subscriptions.push(
    vscode.languages.registerInlineCompletionItemProvider(
      { scheme: 'file' },
      inlineCompletionProvider
    )
  );

  // 커서 IDE 방식: 인라인 Diff 명령어 등록
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "codepilot.acceptChange",
      async (filePath: string, changeId: string) => {
        const inlineDiffManager = InlineDiffManager.getInstance();
        await inlineDiffManager.acceptChange(filePath, changeId);
        diffCodeLensProvider.refresh();
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "codepilot.rejectChange",
      async (filePath: string, changeId: string) => {
        const inlineDiffManager = InlineDiffManager.getInstance();
        await inlineDiffManager.rejectChange(filePath, changeId);
        diffCodeLensProvider.refresh();
      },
    ),
  );

  // 커서 IDE 방식: 키보드 단축키 (Cmd+Enter: 모든 변경사항 수락, Cmd+Backspace: 모든 변경사항 거부)
  context.subscriptions.push(
    vscode.commands.registerCommand("codepilot.acceptAllChanges", async () => {
      const inlineDiffManager = InlineDiffManager.getInstance();
      const pendingFiles = inlineDiffManager.getAllPendingFiles();

      for (const filePath of pendingFiles) {
        await inlineDiffManager.acceptAllChanges(filePath);
      }
      diffCodeLensProvider.refresh();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("codepilot.rejectAllChanges", async () => {
      const inlineDiffManager = InlineDiffManager.getInstance();
      const pendingFiles = inlineDiffManager.getAllPendingFiles();

      for (const filePath of pendingFiles) {
        await inlineDiffManager.rejectAllChanges(filePath);
      }
      diffCodeLensProvider.refresh();
    }),
  );

  // Diff 명령어 등록
  context.subscriptions.push(
    vscode.commands.registerCommand("codepilot.showDiff", async () => {
      const diffManager = DiffManager.getInstance();
      await diffManager.showWorkingDirectoryChanges();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "codepilot.showDiffForFile",
      async (filePath?: string) => {
        const diffManager = DiffManager.getInstance();
        if (!filePath) {
          const activeEditor = vscode.window.activeTextEditor;
          if (activeEditor) {
            filePath = activeEditor.document.uri.fsPath;
          } else {
            vscode.window.showWarningMessage(
              "No file selected. Please open a file first.",
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
  toolRegistry.register(new ExpandAroundLineToolHandler());
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
  // MCP Manager 초기화 및 도구 등록 브릿지
  const mcpManager = MCPManager.getInstance();
  await mcpManager.initialize(context);

  // MCPManager 연결 이벤트 → ToolRegistry 동적 등록
  mcpManager.onConnectionEvent((event) => {
    if (event.type === 'connected' && event.tools) {
      // 기존 도구 해제 후 새로 등록 (serverId 기반)
      toolRegistry.unregisterByServerId(event.serverId);

      for (const tool of event.tools) {
        const handler = new MCPToolHandler(event.serverId, event.serverName, tool);
        const registeredName = toolRegistry.registerMCP(handler, event.serverId, event.serverName, tool.name);
        if (registeredName !== handler.name) {
          handler.setRegisteredName(registeredName);
        }
      }
    } else if (event.type === 'disconnected') {
      toolRegistry.unregisterByServerId(event.serverId);
    }
  });

  // 이미 연결된 서버의 도구를 ToolRegistry에 등록
  const allMcpTools = mcpManager.getAllTools();
  for (const { serverId, serverName, tool } of allMcpTools) {
    const handler = new MCPToolHandler(serverId, serverName, tool);
    const registeredName = toolRegistry.registerMCP(handler, serverId, serverName, tool.name);
    if (registeredName !== handler.name) {
      handler.setRegisteredName(registeredName);
    }
  }

  // 터미널 매니저에 오류 수정 서비스 설정은 각 웹뷰 프로바이더에서 수행됨

  const autoCorrectionEnabled = await stateManager.getAutoCorrectionEnabled();
  const errorRetryCount = await settingsManager.getErrorRetryCount();

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
        "workbench.view.extension.codepilot",
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
    vscode.commands.registerCommand("codepilot.openChatView", async () => {
      try {
        await vscode.commands.executeCommand(
          "workbench.view.extension.codepilot",
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
    vscode.commands.registerCommand("codepilot.openSettingsPanel", () => {
      // openSettingsPanel command called
      if (!openSettingsPanel) {
        console.error(
          "[Extension] ERROR: openSettingsPanel is undefined when command is called!",
        );
        vscode.window.showErrorMessage(
          "Settings panel could not be opened. Please reload the extension.",
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
  // Command registered: codepilot.openSettingsPanel

  // 언어 변경 브로드캐스트 명령어 등록
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "codepilot.broadcastLanguageChange",
      (language: string) => {
        // 모든 활성 webview에 언어 변경 메시지 브로드캐스트
        vscode.window.terminals.forEach((terminal) => {
          if (terminal.name.includes("codepilot")) {
            terminal.sendText(`echo "Language changed to: ${language}"`);
          }
        });

        // 모든 활성 webview 패널에 언어 변경 메시지 전송
        vscode.window.terminals.forEach((terminal) => {
          if (terminal.name.includes("codepilot")) {
            terminal.sendText(`echo "Language changed to: ${language}"`);
          }
        });
      },
    ),
  );

  // Status Bar에 자동 오류 수정 중단 버튼 추가
  const stopErrorCorrectionButton = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  stopErrorCorrectionButton.text = "$(stop-circle)";
  stopErrorCorrectionButton.tooltip = "자동 오류 수정 중단";
  stopErrorCorrectionButton.command = "codepilot.stopErrorCorrection";
  stopErrorCorrectionButton.show();
  context.subscriptions.push(stopErrorCorrectionButton);

  // 자동 오류 수정 중단 명령어 등록
  context.subscriptions.push(
    vscode.commands.registerCommand("codepilot.stopErrorCorrection", () => {
      vscode.window.showInformationMessage(
        "자동 오류 수정 중단 기능은 AutoFixService로 이동되었습니다.",
      );
    }),
  );

  // 설정 변경 시 TerminalManager에 반영
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (event) => {
      if (event.affectsConfiguration("codepilot.errorRetryCount")) {
        const errorRetryCount = await settingsManager.getErrorRetryCount();
      }
      if (event.affectsConfiguration("codepilot.autoCorrectionEnabled")) {
        const enabled = await stateManager.getAutoCorrectionEnabled();
        // onDidChangeConfiguration: autoCorrectionEnabled
      }
      // debugEnabled 설정은 더 이상 사용하지 않음 (Run/Debug 이벤트로만 제어)
    }),
  );

  // 진단/테스트 커맨드 등록 (diagnosticCommands.ts)
  context.subscriptions.push(
    ...registerDiagnosticCommands({ context, chatViewProvider })
  );

  // 캐시/세션 커맨드 등록 (sessionCommands.ts)
  context.subscriptions.push(
    ...registerSessionCommands({ context, chatViewProvider, ollamaApi })
  );

  // MCP 커맨드 등록 (mcpCommands.ts)
  context.subscriptions.push(
    ...registerMcpCommands({ context, chatViewProvider })
  );

  // Git 커맨드 등록 (gitCommands.ts)
  context.subscriptions.push(
    ...registerGitCommands({ context, chatViewProvider })
  );
}

export function deactivate() {
  // 터미널 정리는 TerminalManager에서 처리됨
}
