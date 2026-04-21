import * as vscode from "vscode";
import * as path from "path";
import { StateManager } from "../managers/state/StateManager";
import {
  NotificationService,
  AiModelType,
  ExternalApiService,
} from "../../services";
import { SettingsManager } from "../managers/state/SettingsManager";
import { createAndSetupWebviewPanel } from "../../utils";
import { TerminalManager } from "../managers/terminal/TerminalManager";
import { TaskManager } from "../managers/task/TaskManager";
import { ModelConnectionService } from "../managers/model/ModelConnectionService";
import { LocaleService } from "../../webview/services";
import { HotLoadManager } from "../managers/hotload";
import { UsageMetricsManager } from "../managers/state/UsageMetricsManager";
import { AuthService } from "../../services/auth/AuthService";
import { DEFAULT_OLLAMA_URL } from "../config/ApiDefaults";
import { AgentPolicyHandler } from "./handlers/AgentPolicyHandler";
import { SecurityRulesHandler } from "./handlers/SecurityRulesHandler";

// 전역 webview 배열 - 모든 활성 webview를 추적
const allWebviews: vscode.Webview[] = [];

/**
 * 웹뷰에 안전하게 메시지를 전송하는 헬퍼 함수
 */
function safePostMessage(panel: vscode.WebviewPanel, message: any): void {
  try {
    if (panel && !panel.webview) {
      return;
    }
    panel.webview.postMessage(message);
  } catch (error) {}
}

/**
 * CODEPILOT 설정 패널을 엽니다.
 */
export function openSettingsPanel(
  extensionUri: vscode.Uri,
  context: vscode.ExtensionContext,
  viewColumn: vscode.ViewColumn,
  configurationService: SettingsManager,
  notificationService: NotificationService,
  ollamaApi?: any, // OllamaApi 추가
  llmService?: any, // LlmService 추가
  terminalMonitorService?: any, // TerminalMonitorService 추가
  chatViewProvider?: any, // ChatViewProvider 추가
) {
  const settingsManager = SettingsManager.getInstance(context);
  const panel = createAndSetupWebviewPanel(
    extensionUri,
    context,
    "settings",
    "CODEPILOT Settings",
    "settings",
    viewColumn,
    async (data, panel: vscode.WebviewPanel) => {
      const stateManager = StateManager.getInstance(context); // 모든 case에서 사용

      // AgentPolicy 핸들러 위임
      if (AgentPolicyHandler.isAgentPolicyCommand(data.command)) {
        await AgentPolicyHandler.handleMessage(
          data,
          panel,
          context,
          notificationService,
        );
        return;
      }

      // SecurityRules 핸들러 위임
      if (SecurityRulesHandler.isSecurityRulesCommand(data.command)) {
        await SecurityRulesHandler.handleMessage(
          data,
          panel,
          context,
          notificationService,
        );
        return;
      }

      switch (data.command) {
        case "getCurrentSettings": {
          try {
            // 서버 설정 동기화 완료 대기 (시작 직후 sync 미완료 방지)
            await settingsManager.waitForSync();
            // 현재 설정들을 가져와서 웹뷰에 전송
            const apiKey = await stateManager.getApiKey();
            const ollamaApiUrl = await stateManager.getOllamaApiUrl();
            const ollamaModel = await stateManager.getOllamaModel();
            const ollamaServerType = await stateManager.getOllamaServerType();
            const remoteOllamaApiUrl =
              await stateManager.getRemoteOllamaApiUrl();
            const remoteOllamaModel = await stateManager.getRemoteOllamaModel();
            const autoTestRetryEnabled =
              await settingsManager.isAutoTestRetryEnabled();
            const testRetryCount = await settingsManager.getTestRetryCount();
            const autoCorrectionEnabled =
              await stateManager.getAutoCorrectionEnabled();
            const errorRetryCount = await stateManager.getErrorRetryCount();
            const aiModel = await stateManager.getAiModel();
            // UI 표시용 aiModel을 사용 (supported:key, admin:key, ollama 형태)
            const modelToUse = aiModel || "ollama";
            const language = await stateManager.getLanguage();
            const autoUpdateEnabled =
              await settingsManager.isAutoUpdateEnabled();
            const autoDeleteFilesEnabled =
              await settingsManager.isAutoDeleteFilesEnabled();
            const autoExecuteCommandsEnabled =
              await settingsManager.isAutoExecuteCommandsEnabled();
            const blockOutsideProjectEnabled =
              await settingsManager.isBlockOutsideProjectEnabled();
            const autoToolExecutionEnabled =
              await settingsManager.isAutoToolExecutionEnabled();
            const autoMcpToolExecutionEnabled =
              await settingsManager.isAutoMcpToolExecutionEnabled();
            const orchestrationEnabled =
              await settingsManager.isOrchestrationEnabled();
            const streamingEnabled = await settingsManager.isStreamingEnabled();
            const nativeToolCallingEnabled =
              await settingsManager.isNativeToolCallingEnabled();
            const thinkingEnabled = await settingsManager.isThinkingEnabled();
            const thinkingLevel = await settingsManager.getThinkingLevel();

            // 채팅 테마 설정 로드
            const config = vscode.workspace.getConfiguration("codepilot");
            const chatTheme = config.get<string>("chatTheme") || "dark";

            // 확장 버전 로드 (context에서)
            const extension = vscode.extensions.getExtension("banya.codepilot");
            const extensionVersion = extension?.packageJSON?.version || "0.0.0";

            // 모델 라우팅 설정 로드 (타입, 모델명, API 키 여부)
            const compactorModelType =
              await stateManager.getCompactorModelType();
            const compactorModelName =
              await stateManager.getCompactorModelName();
            const compactorApiKeySet = await stateManager.hasCompactorApiKey();
            const commandModelType = await stateManager.getCommandModelType();
            const commandModelName = await stateManager.getCommandModelName();
            const commandApiKeySet = await stateManager.hasCommandApiKey();
            const intentModelType = await stateManager.getIntentModelType();
            const intentModelName = await stateManager.getIntentModelName();
            const intentApiKeySet = await stateManager.hasIntentApiKey();
            const errorFallbackModelType =
              await stateManager.getErrorFallbackModelType();
            const errorFallbackModelName =
              await stateManager.getErrorFallbackModelName();
            const errorFallbackApiKeySet =
              await stateManager.hasErrorFallbackApiKey();
            const completionModelType =
              await stateManager.getCompletionModelType();
            const completionModelName =
              await stateManager.getCompletionModelName();
            const completionApiKeySet =
              await stateManager.hasCompletionApiKey();
            const subagentModelType = await stateManager.getSubagentModelType();
            const subagentModelName = await stateManager.getSubagentModelName();
            const subagentApiKeySet = await stateManager.hasSubagentApiKey();
            const inlineCompletionEnabled = vscode.workspace
              .getConfiguration("codepilot")
              .get<boolean>("inlineCompletion", false);
            const promptSuggestionEnabled = vscode.workspace
              .getConfiguration("codepilot")
              .get<boolean>("promptSuggestion", false);

            // duplicate removed
            const messageToSend = {
              command: "currentSettings",
              apiKey: apiKey || "",
              ollamaApiUrl: ollamaApiUrl || DEFAULT_OLLAMA_URL,
              ollamaModel: ollamaModel || "gemma3:27b",
              ollamaServerType: ollamaServerType || "local",
              localOllamaApiUrl: ollamaApiUrl || DEFAULT_OLLAMA_URL,
              remoteOllamaApiUrl: remoteOllamaApiUrl || "",
              remoteOllamaModel: remoteOllamaModel || "",
              autoTestRetryEnabled: autoTestRetryEnabled || false,
              testRetryCount: testRetryCount || 2,
              autoCorrectionEnabled: autoCorrectionEnabled || false,
              autoUpdateEnabled: autoUpdateEnabled || false,
              autoDeleteFilesEnabled: autoDeleteFilesEnabled || false,
              errorRetryCount: errorRetryCount || 2,
              aiModel: modelToUse, // AI 모델 정보 추가
              language: language || "ko", // 언어 설정 추가
              autoExecuteCommandsEnabled: autoExecuteCommandsEnabled, // 명령어 자동 실행 설정 추가
              blockOutsideProjectEnabled: blockOutsideProjectEnabled,
              autoToolExecutionEnabled: autoToolExecutionEnabled, // 도구 자동 실행 설정 추가
              autoMcpToolExecutionEnabled: autoMcpToolExecutionEnabled, // MCP 도구 자동 실행 설정
              orchestrationEnabled: orchestrationEnabled || false, // 멀티 에이전트 설정
              streamingEnabled: streamingEnabled || false, // 스트리밍 설정 추가
              nativeToolCallingEnabled: nativeToolCallingEnabled, // 네이티브 툴 콜링 설정
              thinkingEnabled: thinkingEnabled, // Thinking 설정
              thinkingLevel: thinkingLevel || "medium", // Thinking 레벨
              // 모델 라우팅 설정 (타입, 모델명, API 키 여부)
              compactorModelType: compactorModelType || "",
              compactorModelName: compactorModelName || "",
              compactorApiKeySet: compactorApiKeySet,
              commandModelType: commandModelType || "",
              commandModelName: commandModelName || "",
              commandApiKeySet: commandApiKeySet,
              intentModelType: intentModelType || "",
              intentModelName: intentModelName || "",
              intentApiKeySet: intentApiKeySet,
              errorFallbackModelType: errorFallbackModelType || "",
              errorFallbackModelName: errorFallbackModelName || "",
              errorFallbackApiKeySet: errorFallbackApiKeySet,
              completionModelType: completionModelType || "",
              completionModelName: completionModelName || "",
              completionApiKeySet: completionApiKeySet,
              subagentModelType: subagentModelType || "",
              subagentModelName: subagentModelName || "",
              subagentApiKeySet: subagentApiKeySet,
              inlineCompletionEnabled: inlineCompletionEnabled,
              promptSuggestionEnabled: promptSuggestionEnabled,
              chatTheme: chatTheme,
              extensionVersion: extensionVersion,
              personalBuildTestSettings: context.globalState.get<any[]>(
                "personalBuildTestSettings",
                [],
              ),
              errorReportingEnabled: config.get<boolean>(
                "errorReportingEnabled",
                false,
              ),
              serverSettings: settingsManager.getAllServerSettings(),
              // 조직 소속 여부를 함께 전달 (로그인 응답보다 먼저 도착해도 렌더링 가능)
              hasOrganization: (() => {
                const userInfo =
                  context.globalState.get<any>("codepilot.userInfo");
                return !!(userInfo?.organization || userInfo?.organization_id);
              })(),
              selectedProjectId:
                context.globalState.get<string>("codepilot.projectId") || "",
              projects: await (async () => {
                try {
                  const userInfo =
                    context.globalState.get<any>("codepilot.userInfo");
                  const orgId = userInfo?.organization_id;
                  if (!orgId) {
                    console.log(
                      `[SettingsPanelProvider] getCurrentSettings: no orgId (userInfo=${typeof userInfo}, has=${!!userInfo}) → empty projects`,
                    );
                    return [];
                  }
                  const { CodePilotApiClient } =
                    await import("../../services/api/CodePilotApiClient");
                  const api = CodePilotApiClient.getInstance();
                  const url = `/organizations/${orgId}/projects/`;
                  console.log(
                    `[SettingsPanelProvider] getCurrentSettings: fetching ${url}`,
                  );
                  const raw: any = await api.get(url);
                  const projects = Array.isArray(raw)
                    ? raw
                    : raw?.data || raw?.results || [];
                  console.log(
                    `[SettingsPanelProvider] getCurrentSettings: got ${projects.length} projects`,
                  );
                  return projects;
                } catch (e: any) {
                  console.warn(
                    "[SettingsPanelProvider] getCurrentSettings projects fetch failed:",
                    e?.message,
                  );
                  return [];
                }
              })(),
            };
            safePostMessage(panel, messageToSend);
          } catch (error: any) {
            console.error("Error getting current settings:", error);
            safePostMessage(panel, {
              command: "currentSettings",
              error: error.message,
            });
          }
          break;
        }
        case "getOllamaModels": {
          try {
            const apiUrl =
              (await stateManager.getOllamaApiUrl()) || DEFAULT_OLLAMA_URL;
            const models = await ModelConnectionService.getOllamaModels(apiUrl);

            safePostMessage(panel, {
              command: "ollamaModels",
              models,
              apiUrl: apiUrl,
            });
          } catch (e: any) {
            console.error(
              "[PanelManager] Failed to get Ollama models:",
              e?.message || String(e),
            );
            safePostMessage(panel, {
              command: "ollamaModels",
              models: [],
              error: e?.message || String(e),
            });
          }
          break;
        }
        case "refreshOllamaModels": {
          // Ollama 모델 목록 새로고침
          try {
            const apiUrl =
              (await stateManager.getOllamaApiUrl()) || DEFAULT_OLLAMA_URL;
            const models = await ModelConnectionService.getOllamaModels(apiUrl);

            safePostMessage(panel, {
              command: "ollamaModels",
              models,
              apiUrl: apiUrl,
            });
          } catch (e: any) {
            safePostMessage(panel, {
              command: "ollamaModels",
              models: [],
              error: e?.message || String(e),
            });
          }
          break;
        }
        case "getRoutingOllamaModels": {
          // 라우팅 모델용 Ollama 모델 목록 요청
          try {
            const apiUrl =
              (await stateManager.getOllamaApiUrl()) || DEFAULT_OLLAMA_URL;
            const models = await ModelConnectionService.getOllamaModels(apiUrl);

            safePostMessage(panel, {
              command: "routingOllamaModels",
              models,
              apiUrl: apiUrl,
            });
          } catch (e: any) {
            console.error(
              "[PanelManager] Failed to get routing Ollama models:",
              e?.message || String(e),
            );
            safePostMessage(panel, {
              command: "routingOllamaModels",
              models: [],
              error: e?.message || String(e),
            });
          }
          break;
        }
        case "saveApiKey":
          const apiKeyToSave = data.apiKey;
          if (apiKeyToSave && typeof apiKeyToSave === "string") {
            try {
              await stateManager.saveApiKey(apiKeyToSave);
              safePostMessage(panel, { command: "apiKeySaved" });
              notificationService.showInfoMessage(
                "CODEPILOT: API Key saved successfully.",
              );
            } catch (error: any) {
              safePostMessage(panel, {
                command: "apiKeySaveError",
                error: error.message,
              });
              notificationService.showErrorMessage(
                `Error saving API Key: ${error.message}`,
              );
            }
          } else {
            safePostMessage(panel, {
              command: "apiKeySaveError",
              error: "Invalid API key",
            });
            notificationService.showErrorMessage("Invalid API key provided.");
          }
          break;
        case "saveCompactorModel": // Compactor 모델 저장
          try {
            const compactorType = data.modelType;
            const compactorModelName = data.modelName;
            if (compactorType) {
              // 모델 타입과 모델명 저장
              await stateManager.saveCompactorModelType(compactorType);
              if (compactorModelName) {
                await stateManager.saveCompactorModelName(compactorModelName);
              }
              // group: 또는 admin 선택 시 AdminModelConfig 빌드 및 저장
              if (
                (compactorType.startsWith("group:") ||
                  compactorType === "admin") &&
                compactorModelName
              ) {
                const aiModelSettings =
                  settingsManager.getServerSettings("ai_model");
                const preset = aiModelSettings.find(
                  (s: any) => s.key === compactorModelName,
                );
                if (preset && preset.value) {
                  const v = preset.value;
                  const ch = v.customHeaders || v.custom_headers || {};
                  const userApiKey =
                    context.globalState.get<string>("codepilot.adminApiKey") ||
                    "";
                  const adminConfig = {
                    key: compactorModelName,
                    provider: v.provider || "chat_completions",
                    model: v.model || v.model_name || "",
                    apiKey: userApiKey || v.api_key || v.apiKey || "",
                    endpoint: v.base_url || v.endpoint || v.apiEndpoint || "",
                    maxTokens: v.max_tokens || v.maxTokens || undefined,
                    maxOutputTokens:
                      v.maxOutputTokens || v.max_output_tokens || undefined,
                    contextWindow:
                      v.context_window || v.contextWindow || undefined,
                    enabled: v.enabled !== false,
                    authType: v.authType || v.auth_type || "bearer",
                    authHeaderName:
                      v.authHeaderName || v.auth_header_name || undefined,
                    customHeaders:
                      typeof ch === "string" ? JSON.parse(ch || "{}") : ch,
                    defaultTemperature:
                      v.defaultTemperature ?? v.default_temperature ?? 0.7,
                    topP: v.topP ?? v.top_p ?? 0.9,
                    streamingSupported:
                      v.streamingSupported ?? v.streaming_supported ?? true,
                  };
                  await stateManager.saveCompactorAdminConfig(
                    JSON.stringify(adminConfig),
                  );
                }
              }
              safePostMessage(panel, { command: "compactorModelSaved" });
              const typeLabel =
                { ollama: "Ollama", admin: "Admin" }[compactorType as string] ||
                compactorType;
              const modelInfo = compactorModelName
                ? ` (${compactorModelName})`
                : "";
              notificationService.showInfoMessage(
                `CODEPILOT: Compactor 모델이 ${typeLabel}${modelInfo}로 설정되었습니다.`,
              );
            } else {
              safePostMessage(panel, {
                command: "compactorModelSaveError",
                error: "모델 타입을 선택해주세요.",
              });
            }
          } catch (error: any) {
            safePostMessage(panel, {
              command: "compactorModelSaveError",
              error: error.message,
            });
            notificationService.showErrorMessage(
              `Compactor 모델 저장 오류: ${error.message}`,
            );
          }
          break;
        case "saveCompactorApiKey": // Compactor API 키 저장
          try {
            const compactorApiKey = data.apiKey;
            const compactorApiType = data.modelType;
            if (compactorApiKey) {
              await stateManager.saveCompactorApiKey(compactorApiKey);
              safePostMessage(panel, { command: "compactorApiKeySaved" });
              const typeLabel =
                { admin: "Admin" }[compactorApiType as string] || "";
              notificationService.showInfoMessage(
                `CODEPILOT: Compactor ${typeLabel} API 키가 저장되었습니다.`,
              );
            } else {
              safePostMessage(panel, {
                command: "compactorApiKeySaveError",
                error: "API 키를 입력해주세요.",
              });
            }
          } catch (error: any) {
            safePostMessage(panel, {
              command: "compactorApiKeySaveError",
              error: error.message,
            });
            notificationService.showErrorMessage(
              `Compactor API 키 저장 오류: ${error.message}`,
            );
          }
          break;
        case "clearCompactorModel": // Compactor 모델 초기화
          try {
            await stateManager.deleteCompactorModelType();
            await stateManager.deleteCompactorModelName();
            await stateManager.deleteCompactorApiKey();
            await stateManager.deleteCompactorAdminConfig();
            safePostMessage(panel, { command: "compactorModelCleared" });
            notificationService.showInfoMessage(
              "CODEPILOT: Compactor 모델이 초기화되었습니다. 메인 모델이 사용됩니다.",
            );
          } catch (error: any) {
            safePostMessage(panel, {
              command: "compactorModelClearError",
              error: error.message,
            });
          }
          break;
        case "saveCommandModel": // Command 모델 저장
          try {
            const commandType = data.modelType;
            const commandModelName = data.modelName;
            if (commandType) {
              // 모델 타입과 모델명 저장
              await stateManager.saveCommandModelType(commandType);
              if (commandModelName) {
                await stateManager.saveCommandModelName(commandModelName);
              }
              // group: 또는 admin 선택 시 AdminModelConfig 빌드 및 저장
              if (
                (commandType.startsWith("group:") || commandType === "admin") &&
                commandModelName
              ) {
                const aiModelSettings =
                  settingsManager.getServerSettings("ai_model");
                const preset = aiModelSettings.find(
                  (s: any) => s.key === commandModelName,
                );
                if (preset && preset.value) {
                  const v = preset.value;
                  const ch = v.customHeaders || v.custom_headers || {};
                  const userApiKey =
                    context.globalState.get<string>("codepilot.adminApiKey") ||
                    "";
                  const adminConfig = {
                    key: commandModelName,
                    provider: v.provider || "chat_completions",
                    model: v.model || v.model_name || "",
                    apiKey: userApiKey || v.api_key || v.apiKey || "",
                    endpoint: v.base_url || v.endpoint || v.apiEndpoint || "",
                    maxTokens: v.max_tokens || v.maxTokens || undefined,
                    maxOutputTokens:
                      v.maxOutputTokens || v.max_output_tokens || undefined,
                    contextWindow:
                      v.context_window || v.contextWindow || undefined,
                    enabled: v.enabled !== false,
                    authType: v.authType || v.auth_type || "bearer",
                    authHeaderName:
                      v.authHeaderName || v.auth_header_name || undefined,
                    customHeaders:
                      typeof ch === "string" ? JSON.parse(ch || "{}") : ch,
                    defaultTemperature:
                      v.defaultTemperature ?? v.default_temperature ?? 0.7,
                    topP: v.topP ?? v.top_p ?? 0.9,
                    streamingSupported:
                      v.streamingSupported ?? v.streaming_supported ?? true,
                  };
                  await stateManager.saveCommandAdminConfig(
                    JSON.stringify(adminConfig),
                  );
                }
              }
              safePostMessage(panel, { command: "commandModelSaved" });
              const typeLabel =
                { ollama: "Ollama", admin: "Admin" }[commandType as string] ||
                commandType;
              const modelInfo = commandModelName
                ? ` (${commandModelName})`
                : "";
              notificationService.showInfoMessage(
                `CODEPILOT: Command 모델이 ${typeLabel}${modelInfo}로 설정되었습니다.`,
              );
            } else {
              safePostMessage(panel, {
                command: "commandModelSaveError",
                error: "모델 타입을 선택해주세요.",
              });
            }
          } catch (error: any) {
            safePostMessage(panel, {
              command: "commandModelSaveError",
              error: error.message,
            });
            notificationService.showErrorMessage(
              `Command 모델 저장 오류: ${error.message}`,
            );
          }
          break;
        case "saveCommandApiKey": // Command API 키 저장
          try {
            const commandApiKey = data.apiKey;
            const commandApiType = data.modelType;
            if (commandApiKey) {
              await stateManager.saveCommandApiKey(commandApiKey);
              safePostMessage(panel, { command: "commandApiKeySaved" });
              const typeLabel =
                { admin: "Admin" }[commandApiType as string] || "";
              notificationService.showInfoMessage(
                `CODEPILOT: Command ${typeLabel} API 키가 저장되었습니다.`,
              );
            } else {
              safePostMessage(panel, {
                command: "commandApiKeySaveError",
                error: "API 키를 입력해주세요.",
              });
            }
          } catch (error: any) {
            safePostMessage(panel, {
              command: "commandApiKeySaveError",
              error: error.message,
            });
            notificationService.showErrorMessage(
              `Command API 키 저장 오류: ${error.message}`,
            );
          }
          break;
        case "clearCommandModel": // Command 모델 초기화
          try {
            await stateManager.deleteCommandModelType();
            await stateManager.deleteCommandModelName();
            await stateManager.deleteCommandApiKey();
            await stateManager.deleteCommandAdminConfig();
            safePostMessage(panel, { command: "commandModelCleared" });
            notificationService.showInfoMessage(
              "CODEPILOT: Command 모델이 초기화되었습니다. 메인 모델이 사용됩니다.",
            );
          } catch (error: any) {
            safePostMessage(panel, {
              command: "commandModelClearError",
              error: error.message,
            });
          }
          break;
        case "saveIntentModel": // Intent 모델 저장
          try {
            const intentType = data.modelType;
            const intentModelName = data.modelName;
            if (intentType) {
              await stateManager.saveIntentModelType(intentType);
              if (intentModelName) {
                await stateManager.saveIntentModelName(intentModelName);
              }
              // group: 또는 admin 선택 시 AdminModelConfig 빌드 및 저장
              if (
                (intentType.startsWith("group:") || intentType === "admin") &&
                intentModelName
              ) {
                const aiModelSettings =
                  settingsManager.getServerSettings("ai_model");
                const preset = aiModelSettings.find(
                  (s: any) => s.key === intentModelName,
                );
                if (preset && preset.value) {
                  const v = preset.value;
                  const ch = v.customHeaders || v.custom_headers || {};
                  const userApiKey =
                    context.globalState.get<string>("codepilot.adminApiKey") ||
                    "";
                  const adminConfig = {
                    key: intentModelName,
                    provider: v.provider || "chat_completions",
                    model: v.model || v.model_name || "",
                    apiKey: userApiKey || v.api_key || v.apiKey || "",
                    endpoint: v.base_url || v.endpoint || v.apiEndpoint || "",
                    maxTokens: v.max_tokens || v.maxTokens || undefined,
                    maxOutputTokens:
                      v.maxOutputTokens || v.max_output_tokens || undefined,
                    contextWindow:
                      v.context_window || v.contextWindow || undefined,
                    enabled: v.enabled !== false,
                    authType: v.authType || v.auth_type || "bearer",
                    authHeaderName:
                      v.authHeaderName || v.auth_header_name || undefined,
                    customHeaders:
                      typeof ch === "string" ? JSON.parse(ch || "{}") : ch,
                    defaultTemperature:
                      v.defaultTemperature ?? v.default_temperature ?? 0.7,
                    topP: v.topP ?? v.top_p ?? 0.9,
                    streamingSupported:
                      v.streamingSupported ?? v.streaming_supported ?? true,
                  };
                  await stateManager.saveIntentAdminConfig(
                    JSON.stringify(adminConfig),
                  );
                }
              }
              safePostMessage(panel, { command: "intentModelSaved" });
              const typeLabel =
                { ollama: "Ollama", admin: "Admin" }[intentType as string] ||
                intentType;
              const modelInfo = intentModelName ? ` (${intentModelName})` : "";
              notificationService.showInfoMessage(
                `CODEPILOT: Intent 모델이 ${typeLabel}${modelInfo}로 설정되었습니다.`,
              );
            } else {
              safePostMessage(panel, {
                command: "intentModelSaveError",
                error: "모델 타입을 선택해주세요.",
              });
            }
          } catch (error: any) {
            safePostMessage(panel, {
              command: "intentModelSaveError",
              error: error.message,
            });
            notificationService.showErrorMessage(
              `Intent 모델 저장 오류: ${error.message}`,
            );
          }
          break;
        case "saveIntentApiKey": // Intent API 키 저장
          try {
            const intentApiKey = data.apiKey;
            const intentApiType = data.modelType;
            if (intentApiKey) {
              await stateManager.saveIntentApiKey(intentApiKey);
              safePostMessage(panel, { command: "intentApiKeySaved" });
              const typeLabel =
                { admin: "Admin" }[intentApiType as string] || "";
              notificationService.showInfoMessage(
                `CODEPILOT: Intent ${typeLabel} API 키가 저장되었습니다.`,
              );
            } else {
              safePostMessage(panel, {
                command: "intentApiKeySaveError",
                error: "API 키를 입력해주세요.",
              });
            }
          } catch (error: any) {
            safePostMessage(panel, {
              command: "intentApiKeySaveError",
              error: error.message,
            });
            notificationService.showErrorMessage(
              `Intent API 키 저장 오류: ${error.message}`,
            );
          }
          break;
        case "clearIntentModel": // Intent 모델 초기화
          try {
            await stateManager.deleteIntentModelType();
            await stateManager.deleteIntentModelName();
            await stateManager.deleteIntentApiKey();
            await stateManager.deleteIntentAdminConfig();
            safePostMessage(panel, { command: "intentModelCleared" });
            notificationService.showInfoMessage(
              "CODEPILOT: Intent 모델이 초기화되었습니다. 메인 모델이 사용됩니다.",
            );
          } catch (error: any) {
            safePostMessage(panel, {
              command: "intentModelClearError",
              error: error.message,
            });
          }
          break;
        case "saveErrorFallbackModel": // 에러 폴백 모델 저장
          try {
            const errorFallbackType = data.modelType;
            const errorFallbackModelName = data.modelName;
            if (errorFallbackType) {
              await stateManager.saveErrorFallbackModelType(errorFallbackType);
              if (errorFallbackModelName) {
                await stateManager.saveErrorFallbackModelName(
                  errorFallbackModelName,
                );
              }
              // group: 또는 admin 선택 시 AdminModelConfig 빌드 및 저장
              if (
                (errorFallbackType.startsWith("group:") ||
                  errorFallbackType === "admin") &&
                errorFallbackModelName
              ) {
                const aiModelSettings =
                  settingsManager.getServerSettings("ai_model");
                const preset = aiModelSettings.find(
                  (s: any) => s.key === errorFallbackModelName,
                );
                if (preset && preset.value) {
                  const v = preset.value;
                  const ch = v.customHeaders || v.custom_headers || {};
                  const userApiKey =
                    context.globalState.get<string>("codepilot.adminApiKey") ||
                    "";
                  const adminConfig = {
                    key: errorFallbackModelName,
                    provider: v.provider || "chat_completions",
                    model: v.model || v.model_name || "",
                    apiKey: userApiKey || v.api_key || v.apiKey || "",
                    endpoint: v.base_url || v.endpoint || v.apiEndpoint || "",
                    maxTokens: v.max_tokens || v.maxTokens || undefined,
                    maxOutputTokens:
                      v.maxOutputTokens || v.max_output_tokens || undefined,
                    contextWindow:
                      v.context_window || v.contextWindow || undefined,
                    enabled: v.enabled !== false,
                    authType: v.authType || v.auth_type || "bearer",
                    authHeaderName:
                      v.authHeaderName || v.auth_header_name || undefined,
                    customHeaders:
                      typeof ch === "string" ? JSON.parse(ch || "{}") : ch,
                    defaultTemperature:
                      v.defaultTemperature ?? v.default_temperature ?? 0.7,
                    topP: v.topP ?? v.top_p ?? 0.9,
                    streamingSupported:
                      v.streamingSupported ?? v.streaming_supported ?? true,
                  };
                  await stateManager.saveErrorFallbackAdminConfig(
                    JSON.stringify(adminConfig),
                  );
                }
              }
              const modelInfo = errorFallbackModelName
                ? ` (${errorFallbackModelName})`
                : "";
              safePostMessage(panel, {
                command: "errorFallbackModelSaved",
                modelType: errorFallbackType,
                modelName: errorFallbackModelName,
              });
              notificationService.showInfoMessage(
                `CODEPILOT: 에러 폴백 모델이 저장되었습니다.${modelInfo}`,
              );
            }
          } catch (error: any) {
            safePostMessage(panel, {
              command: "errorFallbackModelSaveError",
              error: error.message,
            });
          }
          break;
        case "saveErrorFallbackApiKey": // 에러 폴백 API 키 저장
          try {
            const errorFallbackApiKey = data.apiKey;
            if (errorFallbackApiKey) {
              await stateManager.saveErrorFallbackApiKey(errorFallbackApiKey);
              safePostMessage(panel, { command: "errorFallbackApiKeySaved" });
              notificationService.showInfoMessage(
                "CODEPILOT: 에러 폴백 모델 API 키가 저장되었습니다.",
              );
            }
          } catch (error: any) {
            safePostMessage(panel, {
              command: "errorFallbackApiKeySaveError",
              error: error.message,
            });
          }
          break;
        case "clearErrorFallbackModel": // 에러 폴백 모델 초기화
          try {
            await stateManager.clearErrorFallbackModelConfig();
            safePostMessage(panel, { command: "errorFallbackModelCleared" });
            notificationService.showInfoMessage(
              "CODEPILOT: 에러 폴백 모델이 초기화되었습니다. 메인 모델이 사용됩니다.",
            );
          } catch (error: any) {
            safePostMessage(panel, {
              command: "errorFallbackModelClearError",
              error: error.message,
            });
          }
          break;

        case "saveCompletionModel": // 소스코드 자동완성 모델 저장
          try {
            const completionType = data.modelType;
            const completionModelNameSave = data.modelName;
            if (completionType) {
              await stateManager.saveCompletionModelType(completionType);
              if (completionModelNameSave) {
                await stateManager.saveCompletionModelName(
                  completionModelNameSave,
                );
              }
              if (
                (completionType.startsWith("group:") ||
                  completionType === "admin") &&
                completionModelNameSave
              ) {
                const aiModelSettings =
                  settingsManager.getServerSettings("ai_model");
                const preset = aiModelSettings.find(
                  (s: any) => s.key === completionModelNameSave,
                );
                if (preset && preset.value) {
                  const v = preset.value;
                  const ch = v.customHeaders || v.custom_headers || {};
                  const userApiKey =
                    context.globalState.get<string>("codepilot.adminApiKey") ||
                    "";
                  const adminConfig = {
                    key: completionModelNameSave,
                    provider: v.provider || "chat_completions",
                    model: v.model || v.model_name || "",
                    apiKey: userApiKey || v.api_key || v.apiKey || "",
                    endpoint: v.base_url || v.endpoint || v.apiEndpoint || "",
                    maxTokens: v.max_tokens || v.maxTokens || undefined,
                    maxOutputTokens:
                      v.maxOutputTokens || v.max_output_tokens || undefined,
                    contextWindow:
                      v.context_window || v.contextWindow || undefined,
                    enabled: v.enabled !== false,
                    authType: v.authType || v.auth_type || "bearer",
                    authHeaderName:
                      v.authHeaderName || v.auth_header_name || undefined,
                    customHeaders:
                      typeof ch === "string" ? JSON.parse(ch || "{}") : ch,
                    defaultTemperature:
                      v.defaultTemperature ?? v.default_temperature ?? 0.7,
                    topP: v.topP ?? v.top_p ?? 0.9,
                    streamingSupported:
                      v.streamingSupported ?? v.streaming_supported ?? true,
                  };
                  await stateManager.saveCompletionAdminConfig(
                    JSON.stringify(adminConfig),
                  );
                }
              }
              safePostMessage(panel, { command: "completionModelSaved" });
              const typeLabel =
                { ollama: "Ollama", admin: "Admin" }[
                  completionType as string
                ] || completionType;
              const modelInfo = completionModelNameSave
                ? ` (${completionModelNameSave})`
                : "";
              notificationService.showInfoMessage(
                `CODEPILOT: 자동완성 모델이 ${typeLabel}${modelInfo}로 설정되었습니다.`,
              );
            } else {
              safePostMessage(panel, {
                command: "completionModelSaveError",
                error: "모델 타입을 선택해주세요.",
              });
            }
          } catch (error: any) {
            safePostMessage(panel, {
              command: "completionModelSaveError",
              error: error.message,
            });
            notificationService.showErrorMessage(
              `자동완성 모델 저장 오류: ${error.message}`,
            );
          }
          break;

        case "saveCompletionApiKey": // 소스코드 자동완성 API 키 저장
          try {
            const completionApiKey = data.apiKey;
            const completionApiType = data.modelType;
            if (completionApiKey) {
              await stateManager.saveCompletionApiKey(completionApiKey);
              safePostMessage(panel, { command: "completionApiKeySaved" });
              const typeLabel =
                { admin: "Admin" }[completionApiType as string] || "";
              notificationService.showInfoMessage(
                `CODEPILOT: 자동완성 ${typeLabel} API 키가 저장되었습니다.`,
              );
            } else {
              safePostMessage(panel, {
                command: "completionApiKeySaveError",
                error: "API 키를 입력해주세요.",
              });
            }
          } catch (error: any) {
            safePostMessage(panel, {
              command: "completionApiKeySaveError",
              error: error.message,
            });
            notificationService.showErrorMessage(
              `자동완성 API 키 저장 오류: ${error.message}`,
            );
          }
          break;

        case "clearCompletionModel": // 소스코드 자동완성 모델 초기화
          try {
            await stateManager.clearCompletionModelConfig();
            safePostMessage(panel, { command: "completionModelCleared" });
            notificationService.showInfoMessage(
              "CODEPILOT: 자동완성 모델이 초기화되었습니다. 메인 모델이 사용됩니다.",
            );
          } catch (error: any) {
            safePostMessage(panel, {
              command: "completionModelClearError",
              error: error.message,
            });
          }
          break;

        case "saveSubagentModel": // 서브에이전트 모델 저장
          try {
            const subagentType = data.modelType;
            const subagentModelNameSave = data.modelName;
            if (subagentType) {
              await stateManager.saveSubagentModelType(subagentType);
              if (subagentModelNameSave) {
                await stateManager.saveSubagentModelName(subagentModelNameSave);
              }
              if (
                (subagentType.startsWith("group:") ||
                  subagentType === "admin") &&
                subagentModelNameSave
              ) {
                const aiModelSettings =
                  settingsManager.getServerSettings("ai_model");
                const preset = aiModelSettings.find(
                  (s: any) => s.key === subagentModelNameSave,
                );
                if (preset && preset.value) {
                  const v = preset.value;
                  const ch = v.customHeaders || v.custom_headers || {};
                  const userApiKey =
                    context.globalState.get<string>("codepilot.adminApiKey") ||
                    "";
                  const adminConfig = {
                    key: subagentModelNameSave,
                    provider: v.provider || "chat_completions",
                    model: v.model || v.model_name || "",
                    apiKey: userApiKey || v.api_key || v.apiKey || "",
                    endpoint: v.base_url || v.endpoint || v.apiEndpoint || "",
                    maxTokens: v.max_tokens || v.maxTokens || undefined,
                    maxOutputTokens:
                      v.maxOutputTokens || v.max_output_tokens || undefined,
                    contextWindow:
                      v.context_window || v.contextWindow || undefined,
                    enabled: v.enabled !== false,
                    authType: v.authType || v.auth_type || "bearer",
                    authHeaderName:
                      v.authHeaderName || v.auth_header_name || undefined,
                    customHeaders:
                      typeof ch === "string" ? JSON.parse(ch || "{}") : ch,
                    defaultTemperature:
                      v.defaultTemperature ?? v.default_temperature ?? 0.7,
                    topP: v.topP ?? v.top_p ?? 0.9,
                    streamingSupported:
                      v.streamingSupported ?? v.streaming_supported ?? true,
                  };
                  await stateManager.saveSubagentAdminConfig(
                    JSON.stringify(adminConfig),
                  );
                }
              }
              safePostMessage(panel, { command: "subagentModelSaved" });
              const typeLabel =
                { ollama: "Ollama", admin: "Admin" }[subagentType as string] ||
                subagentType;
              const modelInfo = subagentModelNameSave
                ? ` (${subagentModelNameSave})`
                : "";
              notificationService.showInfoMessage(
                `CODEPILOT: 서브에이전트 모델이 ${typeLabel}${modelInfo}로 설정되었습니다.`,
              );
            } else {
              safePostMessage(panel, {
                command: "subagentModelSaveError",
                error: "모델 타입을 선택해주세요.",
              });
            }
          } catch (error: any) {
            safePostMessage(panel, {
              command: "subagentModelSaveError",
              error: error.message,
            });
            notificationService.showErrorMessage(
              `서브에이전트 모델 저장 오류: ${error.message}`,
            );
          }
          break;

        case "saveSubagentApiKey": // 서브에이전트 API 키 저장
          try {
            const subagentApiKey = data.apiKey;
            const subagentApiType = data.modelType;
            if (subagentApiKey) {
              await stateManager.saveSubagentApiKey(subagentApiKey);
              safePostMessage(panel, { command: "subagentApiKeySaved" });
              const typeLabel =
                { admin: "Admin" }[subagentApiType as string] || "";
              notificationService.showInfoMessage(
                `CODEPILOT: 서브에이전트 ${typeLabel} API 키가 저장되었습니다.`,
              );
            } else {
              safePostMessage(panel, {
                command: "subagentApiKeySaveError",
                error: "API 키를 입력해주세요.",
              });
            }
          } catch (error: any) {
            safePostMessage(panel, {
              command: "subagentApiKeySaveError",
              error: error.message,
            });
            notificationService.showErrorMessage(
              `서브에이전트 API 키 저장 오류: ${error.message}`,
            );
          }
          break;

        case "clearSubagentModel": // 서브에이전트 모델 초기화
          try {
            await stateManager.clearSubagentModelConfig();
            safePostMessage(panel, { command: "subagentModelCleared" });
            notificationService.showInfoMessage(
              "CODEPILOT: 서브에이전트 모델이 초기화되었습니다. 메인 모델이 사용됩니다.",
            );
          } catch (error: any) {
            safePostMessage(panel, {
              command: "subagentModelClearError",
              error: error.message,
            });
          }
          break;

        case "setInlineCompletionEnabled": // 소스코드 자동완성 ON/OFF
          try {
            const inlineCompletionVal = data.enabled;
            if (typeof inlineCompletionVal === "boolean") {
              await vscode.workspace
                .getConfiguration("codepilot")
                .update(
                  "inlineCompletion",
                  inlineCompletionVal,
                  vscode.ConfigurationTarget.Global,
                );
              safePostMessage(panel, { command: "inlineCompletionEnabledSet" });
            }
          } catch (error: any) {
            safePostMessage(panel, {
              command: "inlineCompletionEnabledSetError",
              error: error.message,
            });
          }
          break;

        case "setPromptSuggestionEnabled": // 다음 작업 제안 ON/OFF
          try {
            const promptSuggestionVal = data.enabled;
            if (typeof promptSuggestionVal === "boolean") {
              await vscode.workspace
                .getConfiguration("codepilot")
                .update(
                  "promptSuggestion",
                  promptSuggestionVal,
                  vscode.ConfigurationTarget.Global,
                );
              safePostMessage(panel, { command: "promptSuggestionEnabledSet" });
            }
          } catch (error: any) {
            safePostMessage(panel, {
              command: "promptSuggestionEnabledSetError",
              error: error.message,
            });
          }
          break;

        case "saveOllamaApiUrl": // Ollama API URL 저장 케이스 추가
          const ollamaApiUrlToSave = data.ollamaApiUrl;
          if (ollamaApiUrlToSave && typeof ollamaApiUrlToSave === "string") {
            try {
              await stateManager.saveOllamaApiUrl(ollamaApiUrlToSave);
              safePostMessage(panel, { command: "ollamaApiUrlSaved" });
              notificationService.showInfoMessage(
                "CODEPILOT: Ollama API URL saved.",
              );
            } catch (error: any) {
              safePostMessage(panel, {
                command: "ollamaApiUrlSaveError",
                error: error.message,
              });
              notificationService.showErrorMessage(
                `Error saving Ollama API URL: ${error.message}`,
              );
            }
          } else {
            safePostMessage(panel, {
              command: "ollamaApiUrlSaveError",
              error: "Invalid Ollama API URL",
            });
            notificationService.showErrorMessage(
              "Invalid Ollama API URL provided.",
            );
          }
          break;
        case "saveLocalOllamaApiUrl": // 로컬 Ollama API URL 저장 케이스 추가
          const localOllamaApiUrlToSave = data.localOllamaApiUrl || data.apiUrl;
          if (
            localOllamaApiUrlToSave &&
            typeof localOllamaApiUrlToSave === "string"
          ) {
            try {
              await stateManager.saveOllamaApiUrl(localOllamaApiUrlToSave);
              safePostMessage(panel, { command: "localOllamaApiUrlSaved" });
              notificationService.showInfoMessage(
                "CODEPILOT: Local Ollama API URL saved.",
              );
            } catch (error: any) {
              safePostMessage(panel, {
                command: "localOllamaApiUrlError",
                error: error.message,
              });
              notificationService.showErrorMessage(
                `Error saving Local Ollama API URL: ${error.message}`,
              );
            }
          } else {
            safePostMessage(panel, {
              command: "localOllamaApiUrlError",
              error: "Invalid Local Ollama API URL",
            });
            notificationService.showErrorMessage(
              "Invalid Local Ollama API URL provided.",
            );
          }
          break;
        case "saveOllamaModel": // Ollama 모델 저장 케이스 추가
          const ollamaModelToSave = data.ollamaModel || data.model;
          if (ollamaModelToSave && typeof ollamaModelToSave === "string") {
            try {
              await stateManager.saveOllamaModel(ollamaModelToSave);
              safePostMessage(panel, { command: "ollamaModelSaved" });

              // 채팅 패널에도 모델 변경 알림
              if (
                chatViewProvider &&
                typeof chatViewProvider.postMessageToWebview === "function"
              ) {
                chatViewProvider.postMessageToWebview({
                  command: "ollamaModelChanged",
                  model: ollamaModelToSave,
                });
              }

              notificationService.showInfoMessage(
                "CODEPILOT: Ollama Model saved.",
              );
            } catch (error: any) {
              safePostMessage(panel, {
                command: "ollamaModelSaveError",
                error: error.message,
              });
              notificationService.showErrorMessage(
                `Error saving Ollama Model: ${error.message}`,
              );
            }
          } else {
            safePostMessage(panel, {
              command: "ollamaModelSaveError",
              error: "Invalid Ollama Model",
            });
            notificationService.showErrorMessage(
              "Invalid Ollama Model provided.",
            );
          }
          break;
        case "saveOllamaServerType": // Ollama 서버 타입 저장 케이스 추가
          const ollamaServerTypeToSave = data.ollamaServerType;
          if (
            ollamaServerTypeToSave &&
            typeof ollamaServerTypeToSave === "string"
          ) {
            try {
              await stateManager.saveOllamaServerType(ollamaServerTypeToSave);
              safePostMessage(panel, { command: "ollamaServerTypeSaved" });
              notificationService.showInfoMessage(
                "CODEPILOT: Ollama Server Type saved.",
              );
            } catch (error: any) {
              safePostMessage(panel, {
                command: "ollamaServerTypeSaveError",
                error: error.message,
              });
              notificationService.showErrorMessage(
                `Error saving Ollama Server Type: ${error.message}`,
              );
            }
          } else {
            safePostMessage(panel, {
              command: "ollamaServerTypeSaveError",
              error: "Invalid Ollama Server Type",
            });
            notificationService.showErrorMessage(
              "Invalid Ollama Server Type provided.",
            );
          }
          break;
        case "saveRemoteOllamaApiUrl": // 원격 Ollama API URL 저장 케이스 추가
          const remoteOllamaApiUrlToSave = data.remoteOllamaApiUrl;
          if (
            remoteOllamaApiUrlToSave &&
            typeof remoteOllamaApiUrlToSave === "string"
          ) {
            try {
              await stateManager.saveRemoteOllamaApiUrl(
                remoteOllamaApiUrlToSave,
              );
              safePostMessage(panel, { command: "remoteOllamaApiUrlSaved" });
              notificationService.showInfoMessage(
                "CODEPILOT: Remote Ollama API URL saved.",
              );
            } catch (error: any) {
              safePostMessage(panel, {
                command: "remoteOllamaApiUrlSaveError",
                error: error.message,
              });
              notificationService.showErrorMessage(
                `Error saving Remote Ollama API URL: ${error.message}`,
              );
            }
          } else {
            safePostMessage(panel, {
              command: "remoteOllamaApiUrlSaveError",
              error: "Invalid Remote Ollama API URL",
            });
            notificationService.showErrorMessage(
              "Invalid Remote Ollama API URL provided.",
            );
          }
          break;
        case "saveRemoteOllamaModel": // 원격 Ollama 모델 저장 케이스 추가
          const remoteOllamaModelToSave = data.remoteOllamaModel;
          if (
            remoteOllamaModelToSave &&
            typeof remoteOllamaModelToSave === "string"
          ) {
            try {
              await stateManager.saveRemoteOllamaModel(remoteOllamaModelToSave);
              safePostMessage(panel, { command: "remoteOllamaModelSaved" });
              notificationService.showInfoMessage(
                "CODEPILOT: Remote Ollama Model saved.",
              );
            } catch (error: any) {
              safePostMessage(panel, {
                command: "remoteOllamaModelSaveError",
                error: error.message,
              });
              notificationService.showErrorMessage(
                `Error saving Remote Ollama Model: ${error.message}`,
              );
            }
          } else {
            safePostMessage(panel, {
              command: "remoteOllamaModelSaveError",
              error: "Invalid Remote Ollama Model",
            });
            notificationService.showErrorMessage(
              "Invalid Remote Ollama Model provided.",
            );
          }
          break;
        case "setAutoUpdate": // 자동 업데이트 설정 저장 케이스 (별칭)
        case "saveAutoUpdateEnabled": // 자동 업데이트 설정 저장 케이스 추가
          const autoUpdateEnabledToSave = data.autoUpdateEnabled;
          if (typeof autoUpdateEnabledToSave === "boolean") {
            try {
              // 설정 저장을 ConfigurationService로 일원화
              await settingsManager.updateAutoUpdateEnabled(
                autoUpdateEnabledToSave,
              );
              // 과거 저장값과의 호환(필요 시 유지)
              try {
                await stateManager.saveAutoUpdateEnabled(
                  autoUpdateEnabledToSave,
                );
              } catch {}
              safePostMessage(panel, { command: "autoUpdateEnabledSaved" });
              notificationService.showInfoMessage(
                "CODEPILOT: Auto Update setting saved.",
              );
            } catch (error: any) {
              safePostMessage(panel, {
                command: "autoUpdateEnabledSaveError",
                error: error.message,
              });
              notificationService.showErrorMessage(
                `Error saving Auto Update setting: ${error.message}`,
              );
            }
          } else {
            safePostMessage(panel, {
              command: "autoUpdateEnabledSaveError",
              error: "Invalid Auto Update setting",
            });
            notificationService.showErrorMessage(
              "Invalid Auto Update setting provided.",
            );
          }
          break;
        case "saveErrorRetryCount": // 오류 재시도 횟수 저장 케이스 추가
          const errorRetryCountToSave = data.errorRetryCount;
          if (
            typeof errorRetryCountToSave === "number" &&
            errorRetryCountToSave >= 0 &&
            errorRetryCountToSave <= 10
          ) {
            try {
              await stateManager.saveErrorRetryCount(errorRetryCountToSave);
              safePostMessage(panel, { command: "errorRetryCountSaved" });
              notificationService.showInfoMessage(
                "CODEPILOT: Error Retry Count setting saved.",
              );
            } catch (error: any) {
              safePostMessage(panel, {
                command: "errorRetryCountSaveError",
                error: error.message,
              });
              notificationService.showErrorMessage(
                `Error saving Error Retry Count setting: ${error.message}`,
              );
            }
          } else {
            safePostMessage(panel, {
              command: "errorRetryCountSaveError",
              error: "Invalid Error Retry Count setting",
            });
            notificationService.showErrorMessage(
              "Invalid Error Retry Count setting provided.",
            );
          }
          break;
        case "saveAutoCorrectionEnabled": // 자동 오류 수정 설정 저장 케이스 추가
          const autoCorrectionEnabledToSave = data.autoCorrectionEnabled;
          if (typeof autoCorrectionEnabledToSave === "boolean") {
            try {
              // StorageService에 저장 (설정 패널에서 사용하는 소스)
              await stateManager.saveAutoCorrectionEnabled(
                autoCorrectionEnabledToSave,
              );
              // ConfigurationService에도 동기화 (다른 곳에서 읽을 수 있도록)
              await settingsManager.updateAutoCorrectionEnabled(
                autoCorrectionEnabledToSave,
              );
              safePostMessage(panel, { command: "autoCorrectionEnabledSaved" });
              notificationService.showInfoMessage(
                "CODEPILOT: Auto Correction setting saved.",
              );
            } catch (error: any) {
              safePostMessage(panel, {
                command: "autoCorrectionEnabledSaveError",
                error: error.message,
              });
              notificationService.showErrorMessage(
                `Error saving Auto Correction setting: ${error.message}`,
              );
            }
          } else {
            safePostMessage(panel, {
              command: "autoCorrectionEnabledSaveError",
              error: "Invalid Auto Correction setting",
            });
            notificationService.showErrorMessage(
              "Invalid Auto Correction setting provided.",
            );
          }
          break;
        case "setAutoCorrectionEnabled": // 자동 오류 수정 설정 저장 케이스 추가 (토글에서 직접 호출)
          const autoCorrectionEnabledToSet = data.enabled;
          if (typeof autoCorrectionEnabledToSet === "boolean") {
            try {
              await stateManager.saveAutoCorrectionEnabled(
                autoCorrectionEnabledToSet,
              );
              await settingsManager.updateAutoCorrectionEnabled(
                autoCorrectionEnabledToSet,
              );
              safePostMessage(panel, { command: "autoCorrectionEnabledSet" });
              // 토글에서는 알림을 표시하지 않음 (사용자 경험을 위해)
            } catch (error: any) {
              safePostMessage(panel, {
                command: "autoCorrectionEnabledSetError",
                error: error.message,
              });
              notificationService.showErrorMessage(
                `Error setting Auto Correction: ${error.message}`,
              );
            }
          } else {
            safePostMessage(panel, {
              command: "autoCorrectionEnabledSetError",
              error: "Invalid Auto Correction setting",
            });
            notificationService.showErrorMessage(
              "Invalid Auto Correction setting provided.",
            );
          }
          break;
        case "setAutoTestRetryEnabled": // 자동 테스트 재시도 설정 저장 케이스 추가
          const autoTestRetryEnabledToSet = data.enabled;
          if (typeof autoTestRetryEnabledToSet === "boolean") {
            try {
              await settingsManager.updateAutoTestRetryEnabled(
                autoTestRetryEnabledToSet,
              );
              safePostMessage(panel, { command: "autoTestRetryEnabledSet" });
            } catch (error: any) {
              safePostMessage(panel, {
                command: "autoTestRetryEnabledSetError",
                error: error.message,
              });
              notificationService.showErrorMessage(
                `Error setting Auto Test Retry: ${error.message}`,
              );
            }
          } else {
            safePostMessage(panel, {
              command: "autoTestRetryEnabledSetError",
              error: "Invalid Auto Test Retry setting",
            });
            notificationService.showErrorMessage(
              "Invalid Auto Test Retry setting provided.",
            );
          }
          break;
        case "setTestRetryCount": // 자동 테스트 재시도 횟수 설정 저장
          const testRetryCountToSet = data.count;
          if (
            typeof testRetryCountToSet === "number" &&
            testRetryCountToSet >= 1 &&
            testRetryCountToSet <= 10
          ) {
            try {
              await settingsManager.updateTestRetryCount(testRetryCountToSet);
              safePostMessage(panel, { command: "testRetryCountSet" });
            } catch (error: any) {
              safePostMessage(panel, {
                command: "testRetryCountSetError",
                error: error.message,
              });
              notificationService.showErrorMessage(
                `Error setting Test Retry Count: ${error.message}`,
              );
            }
          } else {
            safePostMessage(panel, {
              command: "testRetryCountSetError",
              error: "Invalid Test Retry Count setting",
            });
            notificationService.showErrorMessage(
              "Invalid Test Retry Count setting provided.",
            );
          }
          break;
        case "setAutoUpdateEnabled": // 자동 파일 업데이트 설정 저장 케이스 추가 (toggles.js에서 호출)
          const autoUpdateEnabledToSet = data.enabled;
          if (typeof autoUpdateEnabledToSet === "boolean") {
            try {
              await settingsManager.updateAutoUpdateEnabled(
                autoUpdateEnabledToSet,
              );
              // 과거 저장값과의 호환(필요 시 유지)
              try {
                await stateManager.saveAutoUpdateEnabled(
                  autoUpdateEnabledToSet,
                );
              } catch {}
              safePostMessage(panel, { command: "autoUpdateEnabledSet" });
              console.log(
                `[PanelManager] Auto Update 설정 저장됨: ${autoUpdateEnabledToSet}`,
              );
            } catch (error: any) {
              safePostMessage(panel, {
                command: "autoUpdateEnabledSetError",
                error: error.message,
              });
              notificationService.showErrorMessage(
                `Error setting Auto Update: ${error.message}`,
              );
            }
          } else {
            safePostMessage(panel, {
              command: "autoUpdateEnabledSetError",
              error: "Invalid Auto Update setting",
            });
            notificationService.showErrorMessage(
              "Invalid Auto Update setting provided.",
            );
          }
          break;
        case "setAutoDeleteFilesEnabled": // 자동 파일 삭제 설정 저장 케이스 추가
          const autoDeleteFilesEnabledToSet = data.enabled;
          if (typeof autoDeleteFilesEnabledToSet === "boolean") {
            try {
              await settingsManager.updateAutoDeleteFilesEnabled(
                autoDeleteFilesEnabledToSet,
              );
              safePostMessage(panel, { command: "autoDeleteFilesEnabledSet" });
              console.log(
                `[PanelManager] Auto Delete Files 설정 저장됨: ${autoDeleteFilesEnabledToSet}`,
              );
            } catch (error: any) {
              safePostMessage(panel, {
                command: "autoDeleteFilesEnabledSetError",
                error: error.message,
              });
              notificationService.showErrorMessage(
                `Error setting Auto Delete Files: ${error.message}`,
              );
            }
          } else {
            safePostMessage(panel, {
              command: "autoDeleteFilesEnabledSetError",
              error: "Invalid Auto Delete Files setting",
            });
            notificationService.showErrorMessage(
              "Invalid Auto Delete Files setting provided.",
            );
          }
          break;
        case "setAutoExecuteCommandsEnabled": // 명령어 자동 실행 설정 저장 케이스 추가
          const autoExecuteCommandsEnabledToSet = data.enabled;
          if (typeof autoExecuteCommandsEnabledToSet === "boolean") {
            try {
              await settingsManager.updateAutoExecuteCommandsEnabled(
                autoExecuteCommandsEnabledToSet,
              );
              safePostMessage(panel, {
                command: "autoExecuteCommandsEnabledSet",
              });
              console.log(
                `[PanelManager] Auto Execute Commands 설정 저장됨: ${autoExecuteCommandsEnabledToSet}`,
              );
            } catch (error: any) {
              safePostMessage(panel, {
                command: "autoExecuteCommandsEnabledSetError",
                error: error.message,
              });
              notificationService.showErrorMessage(
                `Error setting Auto Execute Commands: ${error.message}`,
              );
            }
          } else {
            safePostMessage(panel, {
              command: "autoExecuteCommandsEnabledSetError",
              error: "Invalid Auto Execute Commands setting",
            });
            notificationService.showErrorMessage(
              "Invalid Auto Execute Commands setting provided.",
            );
          }
          break;
        case "setBlockOutsideProjectEnabled":
          const blockOutsideProjectEnabledToSet = data.enabled;
          if (typeof blockOutsideProjectEnabledToSet === "boolean") {
            try {
              await settingsManager.updateBlockOutsideProjectEnabled(
                blockOutsideProjectEnabledToSet,
              );
              safePostMessage(panel, {
                command: "blockOutsideProjectEnabledSet",
              });
              console.log(
                `[PanelManager] Block Outside Project 설정 저장됨: ${blockOutsideProjectEnabledToSet}`,
              );
            } catch (error: any) {
              safePostMessage(panel, {
                command: "blockOutsideProjectEnabledSetError",
                error: error.message,
              });
            }
          }
          break;
        case "setAutoToolExecutionEnabled": // 도구 자동 실행 설정 저장 케이스 추가
          const autoToolExecutionEnabledToSet = data.enabled;
          if (typeof autoToolExecutionEnabledToSet === "boolean") {
            try {
              await settingsManager.updateAutoToolExecutionEnabled(
                autoToolExecutionEnabledToSet,
              );
              safePostMessage(panel, {
                command: "autoToolExecutionEnabledSet",
              });
              console.log(
                `[PanelManager] Auto Tool Execution 설정 저장됨: ${autoToolExecutionEnabledToSet}`,
              );
            } catch (error: any) {
              safePostMessage(panel, {
                command: "autoToolExecutionEnabledSetError",
                error: error.message,
              });
              notificationService.showErrorMessage(
                `Error setting Auto Tool Execution: ${error.message}`,
              );
            }
          } else {
            safePostMessage(panel, {
              command: "autoToolExecutionEnabledSetError",
              error: "Invalid Auto Tool Execution setting",
            });
            notificationService.showErrorMessage(
              "Invalid Auto Tool Execution setting provided.",
            );
          }
          break;
        case "setAutoMcpToolExecutionEnabled": {
          // MCP 도구 자동 실행 설정
          const autoMcpToolVal = data.enabled;
          if (typeof autoMcpToolVal === "boolean") {
            try {
              await settingsManager.updateAutoMcpToolExecutionEnabled(
                autoMcpToolVal,
              );
              safePostMessage(panel, {
                command: "autoMcpToolExecutionEnabledSet",
              });
            } catch (error: any) {
              safePostMessage(panel, {
                command: "autoMcpToolExecutionEnabledSetError",
                error: error.message,
              });
              notificationService.showErrorMessage(
                `Error setting Auto MCP Tool Execution: ${error.message}`,
              );
            }
          } else {
            safePostMessage(panel, {
              command: "autoMcpToolExecutionEnabledSetError",
              error: "Invalid setting",
            });
          }
          break;
        }
        case "setOrchestrationEnabled": {
          // 오케스트레이션 설정
          const orchestrationVal = data.enabled;
          if (typeof orchestrationVal === "boolean") {
            try {
              await settingsManager.updateOrchestrationEnabled(
                orchestrationVal,
              );
              safePostMessage(panel, { command: "orchestrationEnabledSet" });
            } catch (error: any) {
              safePostMessage(panel, {
                command: "orchestrationEnabledSetError",
                error: error.message,
              });
            }
          } else {
            safePostMessage(panel, {
              command: "orchestrationEnabledSetError",
              error: "Invalid setting",
            });
          }
          break;
        }
        case "setStreamingEnabled": // 스트리밍 설정 저장 케이스 추가
          const streamingEnabledToSet = data.enabled;
          if (typeof streamingEnabledToSet === "boolean") {
            try {
              await settingsManager.updateStreamingEnabled(
                streamingEnabledToSet,
              );
              safePostMessage(panel, {
                command: "streamingEnabledSet",
              });
              console.log(
                `[PanelManager] Streaming 설정 저장됨: ${streamingEnabledToSet}`,
              );
              // 알림 제거 (v9.4.1) - 사용자 요청
            } catch (error: any) {
              safePostMessage(panel, {
                command: "streamingEnabledSetError",
                error: error.message,
              });
              notificationService.showErrorMessage(
                `Error setting Streaming: ${error.message}`,
              );
            }
          } else {
            safePostMessage(panel, {
              command: "streamingEnabledSetError",
              error: "Invalid Streaming setting",
            });
            notificationService.showErrorMessage(
              "Invalid Streaming setting provided.",
            );
          }
          break;
        case "setNativeToolCallingEnabled": {
          const nativeToolCallingEnabledToSet = data.enabled;
          if (typeof nativeToolCallingEnabledToSet === "boolean") {
            try {
              await settingsManager.updateNativeToolCallingEnabled(
                nativeToolCallingEnabledToSet,
              );
              console.log(
                `[PanelManager] 네이티브 툴 콜링 설정 저장됨: ${nativeToolCallingEnabledToSet}`,
              );
            } catch (error: any) {
              console.error(
                "[PanelManager] 네이티브 툴 콜링 설정 저장 오류:",
                error,
              );
            }
          }
          break;
        }
        case "setThinkingEnabled": {
          const thinkingEnabledToSet = data.enabled;
          if (typeof thinkingEnabledToSet === "boolean") {
            try {
              await settingsManager.updateThinkingEnabled(thinkingEnabledToSet);
              console.log(
                `[PanelManager] Thinking 설정 저장됨: ${thinkingEnabledToSet}`,
              );
            } catch (error: any) {
              console.error("[PanelManager] Thinking 설정 저장 오류:", error);
            }
          }
          break;
        }
        case "setThinkingLevel": {
          const level = data.level;
          if (level && ["low", "medium", "high"].includes(level)) {
            try {
              await settingsManager.updateThinkingLevel(level);
              console.log(`[PanelManager] Thinking 레벨 저장됨: ${level}`);
            } catch (error: any) {
              console.error("[PanelManager] Thinking 레벨 저장 오류:", error);
            }
          }
          break;
        }
        case "saveAiModel": // AI 모델 저장 케이스 추가
          const aiModelToSave = data.aiModel || data.model;
          if (aiModelToSave && typeof aiModelToSave === "string") {
            try {
              // 관리자 모델 처리: "admin:key" 또는 "supported:key" 형식
              const isAdminModel = aiModelToSave.startsWith("admin:");
              const isSupportedModel = aiModelToSave.startsWith("supported:");
              let toRuntime = aiModelToSave;
              let modelName = aiModelToSave;

              if (isSupportedModel) {
                const presetKey = aiModelToSave.substring("supported:".length);
                toRuntime = "admin"; // 런타임은 AdminModelApi 사용

                // 서버 설정에서 지원 모델 config 추출
                const aiModelSettings =
                  settingsManager.getServerSettings("ai_model");
                const presetSetting = aiModelSettings.find(
                  (s: any) => s.key === presetKey,
                );

                if (presetSetting && presetSetting.value) {
                  const v = presetSetting.value;
                  const customHeaders =
                    v.customHeaders || v.custom_headers || {};
                  // 사용자가 IDE에서 저장한 API 키 우선 사용
                  const userApiKey =
                    context.globalState.get<string>("codepilot.adminApiKey") ||
                    "";
                  const adminConfig = {
                    key: presetKey,
                    provider: v.provider || "chat_completions",
                    model: v.model || v.model_name || "",
                    apiKey: userApiKey || v.api_key || v.apiKey || "",
                    endpoint: v.base_url || v.endpoint || v.apiEndpoint || "",
                    maxTokens: v.max_tokens || v.maxTokens || undefined,
                    maxOutputTokens:
                      v.maxOutputTokens || v.max_output_tokens || undefined,
                    contextWindow:
                      v.context_window || v.contextWindow || undefined,
                    enabled: v.enabled !== false,
                    authType: v.authType || v.auth_type || "bearer",
                    authHeaderName:
                      v.authHeaderName || v.auth_header_name || undefined,
                    customHeaders:
                      typeof customHeaders === "string"
                        ? JSON.parse(customHeaders || "{}")
                        : customHeaders,
                    defaultTemperature:
                      v.defaultTemperature ?? v.default_temperature ?? 0.7,
                    topP: v.topP ?? v.top_p ?? 0.9,
                    streamingSupported:
                      v.streamingSupported ?? v.streaming_supported ?? true,
                    nativeToolCallingSupported:
                      (v.nativeToolCallingSupported ??
                        v.native_tool_calling_supported) === true ||
                      String(
                        v.nativeToolCallingSupported ??
                          v.native_tool_calling_supported,
                      ) === "true",
                  };
                  await stateManager.saveAdminModelConfig(
                    JSON.stringify(adminConfig),
                  );
                  modelName = adminConfig.model || presetKey;

                  // LLMManager에 즉시 적용
                  try {
                    const { LLMManager } =
                      await import("../managers/model/LLMManager");
                    const llmManager = LLMManager.getInstance();
                    llmManager.setAdminModelConfig(adminConfig as any);
                    llmManager.setCurrentModel(AiModelType.ADMIN);
                  } catch {}

                  // 토큰 제한 동적 업데이트
                  try {
                    const { updateAdminTokenLimits } =
                      await import("../../utils/tokenUtils");
                    updateAdminTokenLimits(
                      adminConfig.contextWindow,
                      adminConfig.maxOutputTokens || adminConfig.maxTokens,
                    );
                  } catch {}
                } else {
                  throw new Error(
                    `지원 모델 '${presetKey}'을 찾을 수 없습니다.`,
                  );
                }
              } else if (isAdminModel) {
                const adminKey = aiModelToSave.substring("admin:".length);
                toRuntime = "admin";

                // 서버 설정에서 해당 관리자 모델 설정 추출
                const aiModelSettings =
                  settingsManager.getServerSettings("ai_model");
                const adminSetting = aiModelSettings.find(
                  (s: any) => s.key === adminKey,
                );

                if (adminSetting && adminSetting.value) {
                  const v = adminSetting.value;
                  const customHeaders =
                    v.customHeaders || v.custom_headers || {};
                  const userApiKeyForAdmin =
                    context.globalState.get<string>("codepilot.adminApiKey") ||
                    "";
                  const adminConfig = {
                    key: adminKey,
                    provider: v.provider || "chat_completions",
                    model: v.model || v.model_name || "",
                    apiKey: userApiKeyForAdmin || v.api_key || v.apiKey || "",
                    endpoint: v.base_url || v.endpoint || v.apiEndpoint || "",
                    maxTokens: v.max_tokens || v.maxTokens || undefined,
                    maxOutputTokens:
                      v.maxOutputTokens || v.max_output_tokens || undefined,
                    contextWindow:
                      v.context_window || v.contextWindow || undefined,
                    enabled: v.enabled !== false,
                    authType: v.authType || v.auth_type || "bearer",
                    authHeaderName:
                      v.authHeaderName || v.auth_header_name || undefined,
                    customHeaders:
                      typeof customHeaders === "string"
                        ? JSON.parse(customHeaders || "{}")
                        : customHeaders,
                    defaultTemperature:
                      v.defaultTemperature ?? v.default_temperature ?? 0.7,
                    topP: v.topP ?? v.top_p ?? 0.9,
                    streamingSupported:
                      v.streamingSupported ?? v.streaming_supported ?? true,
                    nativeToolCallingSupported:
                      (v.nativeToolCallingSupported ??
                        v.native_tool_calling_supported) === true ||
                      String(
                        v.nativeToolCallingSupported ??
                          v.native_tool_calling_supported,
                      ) === "true",
                  };
                  // 관리자 모델 설정 저장
                  await stateManager.saveAdminModelConfig(
                    JSON.stringify(adminConfig),
                  );
                  modelName = adminConfig.model || adminKey;

                  // LLMManager에 즉시 적용
                  try {
                    const { LLMManager } =
                      await import("../managers/model/LLMManager");
                    const llmManager = LLMManager.getInstance();
                    llmManager.setAdminModelConfig(adminConfig as any);
                    llmManager.setCurrentModel(AiModelType.ADMIN);
                  } catch {}

                  // 토큰 제한 동적 업데이트
                  try {
                    const { updateAdminTokenLimits } =
                      await import("../../utils/tokenUtils");
                    updateAdminTokenLimits(
                      adminConfig.contextWindow,
                      adminConfig.maxOutputTokens || adminConfig.maxTokens,
                    );
                  } catch {}
                } else {
                  throw new Error(
                    `관리자 모델 '${adminKey}'을 찾을 수 없습니다.`,
                  );
                }
              } else if (aiModelToSave.toLowerCase() === "ollama") {
                toRuntime = "ollama";
              }

              // UI 표시에 쓰는 키와 런타임에서 사용하는 키를 모두 저장
              await stateManager.saveAiModel(aiModelToSave);
              await stateManager.saveCurrentAiModel(toRuntime);

              // 런타임 모델 타입도 즉시 업데이트
              if (!isAdminModel && !isSupportedModel) {
                try {
                  const { LLMManager } =
                    await import("../managers/model/LLMManager");
                  const llmManager = LLMManager.getInstance();
                  const modelTypeMap: Record<string, AiModelType> = {
                    ollama: AiModelType.OLLAMA,
                    admin: AiModelType.ADMIN,
                  };
                  const runtimeType = modelTypeMap[toRuntime];
                  if (runtimeType) {
                    llmManager.setCurrentModel(runtimeType);
                  }
                } catch {}
              }

              safePostMessage(panel, { command: "aiModelSaved" });

              // 채팅 패널에도 모델 변경 알림 (전체 모델 목록 포함)
              if (
                chatViewProvider &&
                typeof chatViewProvider.postMessageToWebview === "function"
              ) {
                let chatModel = aiModelToSave;
                if (aiModelToSave === "ollama") {
                  const ollamaModel = await stateManager.getOllamaModel();
                  chatModel = ollamaModel || "ollama";
                }

                // 프리셋 모델 목록도 함께 전송하여 드롭다운 재구성
                let supportedModels: {
                  key: string;
                  name: string;
                  displayName: string;
                  group: string;
                }[] = [];
                try {
                  const aiModelSettings =
                    settingsManager.getServerSettings("ai_model");
                  supportedModels = (aiModelSettings || [])
                    .filter(
                      (s: any) =>
                        s.source === "preset" &&
                        s.value &&
                        s.value.enabled !== false,
                    )
                    .map((s: any) => ({
                      key: s.key,
                      name: `supported:${s.key}`,
                      displayName: s.value?.name || s.key,
                      group: s.group || "default",
                    }));
                } catch {}

                chatViewProvider.postMessageToWebview({
                  command: "ollamaModels",
                  models: [],
                  current: chatModel,
                  adminModels: [],
                  supportedModels,
                });
              }

              // 웹뷰 내 상태 메시지로 대체 (알림 팝업 제거)
            } catch (error: any) {
              safePostMessage(panel, {
                command: "aiModelSaveError",
                error: error.message,
              });
              notificationService.showErrorMessage(
                `Error saving AI Model: ${error.message}`,
              );
            }
          } else {
            safePostMessage(panel, {
              command: "aiModelSaveError",
              error: "Invalid AI Model",
            });
            notificationService.showErrorMessage("Invalid AI Model provided.");
          }
          break;
        case "saveLanguage": // 언어 설정 저장 케이스 추가
          const languageToSave = data.language;
          if (languageToSave && typeof languageToSave === "string") {
            try {
              await stateManager.saveLanguage(languageToSave);
              safePostMessage(panel, {
                command: "languageSaved",
                language: languageToSave,
              });
              notificationService.showInfoMessage(
                "CODEPILOT: Language setting updated.",
              );
            } catch (error: any) {
              console.error("[PanelManager] Failed to save language:", error);
              safePostMessage(panel, {
                command: "languageSaveError",
                error: error.message,
              });
              notificationService.showErrorMessage(
                `Error saving language setting: ${error.message}`,
              );
            }
          } else {
            console.error(
              "[PanelManager] Invalid language setting provided:",
              languageToSave,
            );
            safePostMessage(panel, {
              command: "languageSaveError",
              error: "Invalid language setting",
            });
            notificationService.showErrorMessage(
              "Invalid language setting provided.",
            );
          }
          break;
        case "testOllamaConnection": // Ollama 연결 테스트 케이스 추가
          try {
            const apiUrl =
              (await stateManager.getOllamaApiUrl()) || DEFAULT_OLLAMA_URL;
            const result =
              await ModelConnectionService.testOllamaConnection(apiUrl);
            safePostMessage(panel, {
              command: "ollamaConnectionTestResult",
              success: result.success,
              data: result.data,
              error: result.error,
            });
            if (result.success) {
              notificationService.showInfoMessage(
                "CODEPILOT: Ollama connection test successful.",
              );
            } else {
              notificationService.showErrorMessage(
                `CODEPILOT: Ollama connection test failed: ${result.error}`,
              );
            }
          } catch (error: any) {
            safePostMessage(panel, {
              command: "ollamaConnectionTestResult",
              success: false,
              error: error.message,
            });
            notificationService.showErrorMessage(
              `CODEPILOT: Ollama connection test failed: ${error.message}`,
            );
          }
          break;
        case "testTerminalDaemonConnection": // Terminal Daemon 연결 테스트 케이스 추가
          try {
            // 🆕 core TerminalManager 사용
            const terminalManager = TerminalManager.getInstance(context);
            const testResult = await terminalManager.testDaemonConnection();
            if (testResult.success) {
              safePostMessage(panel, {
                command: "terminalDaemonConnectionTestResult",
                success: true,
                data: testResult.data,
              });
              notificationService.showInfoMessage(
                "CODEPILOT: Terminal Daemon connection test successful.",
              );
            } else {
              safePostMessage(panel, {
                command: "terminalDaemonConnectionTestResult",
                success: false,
                error: testResult.error,
              });
              notificationService.showErrorMessage(
                `CODEPILOT: Terminal Daemon connection test failed: ${testResult.error}`,
              );
            }
          } catch (error: any) {
            safePostMessage(panel, {
              command: "terminalDaemonConnectionTestResult",
              success: false,
              error: error.message,
            });
            notificationService.showErrorMessage(
              `CODEPILOT: Terminal Daemon connection test failed: ${error.message}`,
            );
          }
          break;
        case "testAllConnections": // 모든 연결 테스트 케이스 추가
          try {
            const results = {
              ollama: false,
              terminalDaemon: false,
            };

            // Ollama 연결 테스트
            try {
              const apiUrl =
                (await stateManager.getOllamaApiUrl()) || DEFAULT_OLLAMA_URL;
              const ollamaTest =
                await ModelConnectionService.testOllamaConnection(apiUrl);
              results.ollama = ollamaTest.success;
            } catch (e) {
              /* 무시 */
            }

            // Terminal Daemon 연결 테스트
            try {
              // 🆕 core TerminalManager 사용
              const terminalManager = TerminalManager.getInstance(context);
              const daemonTest = await terminalManager.testDaemonConnection();
              results.terminalDaemon = daemonTest.success;
            } catch (e) {
              /* 무시 */
            }

            safePostMessage(panel, {
              command: "allConnectionsTestResult",
              results,
            });
            notificationService.showInfoMessage(
              "CODEPILOT: All connections test completed.",
            );
          } catch (error: any) {
            safePostMessage(panel, {
              command: "allConnectionsTestResult",
              error: error.message,
            });
            notificationService.showErrorMessage(
              `CODEPILOT: All connections test failed: ${error.message}`,
            );
          }
          break;
        case "initializePanel": {
          // 패널이 열릴 때 현재 설정들을 로드하여 웹뷰에 전송
          try {
            // 서버 설정 동기화 완료 대기 (시작 직후 sync 미완료 방지)
            await settingsManager.waitForSync();
            const apiKey = await stateManager.getApiKey();
            const ollamaApiUrl = await stateManager.getOllamaApiUrl();
            const ollamaModel = await stateManager.getOllamaModel();
            const ollamaServerType = await stateManager.getOllamaServerType();
            const remoteOllamaApiUrl =
              await stateManager.getRemoteOllamaApiUrl();
            const remoteOllamaModel = await stateManager.getRemoteOllamaModel();
            const autoTestRetryEnabled =
              await settingsManager.isAutoTestRetryEnabled();
            const testRetryCount = await settingsManager.getTestRetryCount();
            const autoCorrectionEnabled =
              await stateManager.getAutoCorrectionEnabled();
            const errorRetryCount = await stateManager.getErrorRetryCount();
            const aiModel = await stateManager.getAiModel();

            const messageToSend = {
              command: "currentSettings",
              apiKey: apiKey || "",
              ollamaApiUrl: ollamaApiUrl || DEFAULT_OLLAMA_URL,
              ollamaModel: ollamaModel || "gemma3:27b",
              ollamaServerType: ollamaServerType || "local",
              localOllamaApiUrl: ollamaApiUrl || DEFAULT_OLLAMA_URL,
              remoteOllamaApiUrl: remoteOllamaApiUrl || "",
              remoteOllamaModel: remoteOllamaModel || "",
              autoTestRetryEnabled: autoTestRetryEnabled || false,
              testRetryCount: testRetryCount || 2,
              autoCorrectionEnabled: autoCorrectionEnabled || false,
              errorRetryCount: errorRetryCount || 2,
              aiModel: aiModel || "ollama",
            };
            safePostMessage(panel, messageToSend);
          } catch (error: any) {
            console.error("Error getting current settings:", error);
            safePostMessage(panel, {
              command: "currentSettings",
              error: error.message,
            });
          }
          break;
        }
        case "initSettings": // 설정 초기화 (별칭)
        case "loadSettings": // 설정 로드
          try {
            // 서버 설정 동기화 완료 대기 (시작 직후 sync 미완료 방지)
            await settingsManager.waitForSync();
            // initializePanel 케이스와 동일한 로직 사용
            const apiKey = await stateManager.getApiKey();
            const ollamaApiUrl = await stateManager.getOllamaApiUrl();
            const ollamaModel = await stateManager.getOllamaModel();
            const ollamaServerType = await stateManager.getOllamaServerType();
            const remoteOllamaApiUrl =
              await stateManager.getRemoteOllamaApiUrl();
            const remoteOllamaModel = await stateManager.getRemoteOllamaModel();
            const autoTestRetryEnabled =
              await settingsManager.isAutoTestRetryEnabled();
            const testRetryCount = await settingsManager.getTestRetryCount();
            const autoCorrectionEnabled =
              await stateManager.getAutoCorrectionEnabled();
            const errorRetryCount = await stateManager.getErrorRetryCount();
            // 추가 토글 설정들 로드 (닫았다 열어도 유지되도록)
            const autoUpdateEnabled =
              await settingsManager.isAutoUpdateEnabled();
            const autoDeleteFilesEnabled =
              await settingsManager.isAutoDeleteFilesEnabled();
            const autoExecuteCommandsEnabled =
              await settingsManager.isAutoExecuteCommandsEnabled();
            const blockOutsideProjectEnabled =
              await settingsManager.isBlockOutsideProjectEnabled();
            const autoToolExecutionEnabled =
              await settingsManager.isAutoToolExecutionEnabled();
            const autoMcpToolExecutionEnabled =
              await settingsManager.isAutoMcpToolExecutionEnabled();
            const orchestrationEnabled =
              await settingsManager.isOrchestrationEnabled();
            const streamingEnabled = await settingsManager.isStreamingEnabled();
            const nativeToolCallingEnabled2 =
              await settingsManager.isNativeToolCallingEnabled();
            const thinkingEnabled2 = await settingsManager.isThinkingEnabled();
            const aiModel = await stateManager.getAiModel();
            // UI 표시용 aiModel을 사용 (supported:key, admin:key, ollama 형태)
            const modelToUse = aiModel || "ollama";

            const messageToSend = {
              command: "currentSettings",
              apiKey: apiKey || "",
              ollamaApiUrl: ollamaApiUrl || DEFAULT_OLLAMA_URL,
              ollamaModel: ollamaModel || "gemma3:27b",
              ollamaServerType: ollamaServerType || "local",
              localOllamaApiUrl: ollamaApiUrl || DEFAULT_OLLAMA_URL,
              remoteOllamaApiUrl: remoteOllamaApiUrl || "",
              remoteOllamaModel: remoteOllamaModel || "",
              autoTestRetryEnabled: autoTestRetryEnabled || false,
              testRetryCount: testRetryCount || 2,
              autoCorrectionEnabled: autoCorrectionEnabled || false,
              errorRetryCount: errorRetryCount || 2,
              // 추가된 토글 설정들
              autoUpdateEnabled: autoUpdateEnabled || false,
              autoDeleteFilesEnabled: autoDeleteFilesEnabled || false,
              autoExecuteCommandsEnabled: autoExecuteCommandsEnabled ?? true,
              blockOutsideProjectEnabled: blockOutsideProjectEnabled,
              autoToolExecutionEnabled: autoToolExecutionEnabled ?? true,
              autoMcpToolExecutionEnabled: autoMcpToolExecutionEnabled ?? false,
              orchestrationEnabled: orchestrationEnabled || false,
              streamingEnabled: streamingEnabled || false,
              nativeToolCallingEnabled: nativeToolCallingEnabled2,
              thinkingEnabled: thinkingEnabled2,
              aiModel: modelToUse,
              serverSettings: settingsManager.getAllServerSettings(),
            };
            safePostMessage(panel, messageToSend);
          } catch (error: any) {
            console.error("Error loading settings:", error);
            safePostMessage(panel, {
              command: "settingsLoadError",
              error: error.message,
            });
          }
          break;
        case "loadApiKeys": // API 키 로드
          try {
            const apiKey = await stateManager.getApiKey();
            safePostMessage(panel, { command: "apiKeysLoaded", apiKey });
          } catch (error: any) {
            console.error("Error loading API keys:", error);
            safePostMessage(panel, {
              command: "apiKeysLoadError",
              error: error.message,
            });
          }
          break;
        case "loadAiModel": // AI 모델 로드
          try {
            const aiModel = await stateManager.getAiModel();
            safePostMessage(panel, {
              command: "currentAiModel",
              model: aiModel || "ollama",
            });
          } catch (error: any) {
            console.error("Error loading AI model:", error);
            safePostMessage(panel, {
              command: "aiModelLoadError",
              error: error.message,
            });
          }
          break;
        case "loadOllamaModel": // Ollama 모델 로드
          try {
            const ollamaModel = await stateManager.getOllamaModel();
            safePostMessage(panel, {
              command: "ollamaModelLoaded",
              ollamaModel,
            });
          } catch (error: any) {
            console.error("Error loading Ollama model:", error);
            safePostMessage(panel, {
              command: "ollamaModelLoadError",
              error: error.message,
            });
          }
          break;
        case "getLanguage": // 언어 설정 로드
          try {
            const language = await stateManager.getLanguage();
            safePostMessage(panel, { command: "currentLanguage", language });
          } catch (error: any) {
            console.error("Error getting language:", error);
            safePostMessage(panel, {
              command: "languageLoadError",
              error: error.message,
            });
          }
          break;
        case "getLanguageData": // 언어 데이터 로드
          try {
            const language = data.language || vscode.env.language;
            const languageData = LocaleService.loadLanguageData(language);
            safePostMessage(panel, {
              command: "languageDataReceived",
              language,
              data: languageData,
            });
          } catch (error: any) {
            console.error("Error loading language data:", error);
            safePostMessage(panel, {
              command: "languageDataLoadError",
              error: error.message,
            });
          }
          break;
        case "saveChatTheme": // 채팅 테마 저장
          try {
            const theme = data.theme;
            if (theme && ["dark", "light", "auto"].includes(theme)) {
              const config = vscode.workspace.getConfiguration("codepilot");
              await config.update(
                "chatTheme",
                theme,
                vscode.ConfigurationTarget.Global,
              );
              safePostMessage(panel, {
                command: "chatThemeSaved",
                theme: theme,
              });
            }
          } catch (error: any) {
            console.error("[SettingsPanel] Failed to save chat theme:", error);
            safePostMessage(panel, {
              command: "chatThemeSaveError",
              error: error.message,
            });
          }
          break;
        case "getChatTheme": // 채팅 테마 로드
          try {
            const config = vscode.workspace.getConfiguration("codepilot");
            const theme = config.get<string>("chatTheme") || "dark";
            safePostMessage(panel, {
              command: "chatTheme",
              theme: theme,
            });
          } catch (error: any) {
            console.error("[SettingsPanel] Failed to get chat theme:", error);
            safePostMessage(panel, {
              command: "chatTheme",
              theme: "dark",
            });
          }
          break;
        // ===== MCP 서버 설정 =====
        case "getMcpServers": // MCP 서버 목록 로드
          try {
            const servers = await stateManager.getMcpServers();
            const { MCPManager: MCPMgrGet } = await import("../mcp/MCPManager");
            const mcpMgrGet = MCPMgrGet.getInstance();
            const adminServers = mcpMgrGet.getAdminServers();
            // 라이브 연결 상태를 MCPManager에서 병합 (autoConnect 결과 반영)
            const liveServers = mcpMgrGet.getServers();
            const mergedServers = servers.map((s: any) => {
              const live = liveServers.find((ls: any) => ls.id === s.id);
              if (live) {
                return {
                  ...s,
                  status: live.status,
                  tools: live.tools || s.tools,
                };
              }
              return s;
            });
            safePostMessage(panel, {
              command: "mcpServers",
              servers: mergedServers,
              adminServers: adminServers,
            });
          } catch (error: any) {
            console.error("[SettingsPanel] Failed to get MCP servers:", error);
            safePostMessage(panel, {
              command: "mcpServers",
              servers: [],
              adminServers: [],
              error: error.message,
            });
          }
          break;
        case "addMcpServer": // MCP 서버 추가
          try {
            const server = data.server;
            if (server && server.name) {
              await stateManager.addMcpServer(server);
              safePostMessage(panel, {
                command: "mcpServerAdded",
                server: server,
              });
              notificationService.showInfoMessage(
                `CODEPILOT: MCP 서버 "${server.name}" 추가됨`,
              );
            } else {
              throw new Error("서버 정보가 올바르지 않습니다.");
            }
          } catch (error: any) {
            console.error("[SettingsPanel] Failed to add MCP server:", error);
            safePostMessage(panel, {
              command: "mcpServerAddError",
              error: error.message,
            });
          }
          break;
        case "updateMcpServer": // MCP 서버 업데이트
          try {
            const server = data.server;
            if (server && server.id) {
              await stateManager.updateMcpServer(server.id, server);
              safePostMessage(panel, {
                command: "mcpServerUpdated",
                server: server,
              });
              notificationService.showInfoMessage(
                `CODEPILOT: MCP 서버 "${server.name}" 업데이트됨`,
              );
            } else {
              throw new Error("서버 정보가 올바르지 않습니다.");
            }
          } catch (error: any) {
            console.error(
              "[SettingsPanel] Failed to update MCP server:",
              error,
            );
            safePostMessage(panel, {
              command: "mcpServerUpdateError",
              error: error.message,
            });
          }
          break;
        case "removeMcpServer": // MCP 서버 삭제
          try {
            const serverId = data.serverId;
            if (serverId) {
              const removed = await stateManager.removeMcpServer(serverId);
              if (removed) {
                // 해당 서버의 승인된 도구도 삭제
                await stateManager.revokeAllMcpToolsForServer(serverId);
                safePostMessage(panel, {
                  command: "mcpServerRemoved",
                  serverId: serverId,
                });
                notificationService.showInfoMessage(
                  "CODEPILOT: MCP 서버 삭제됨",
                );
              } else {
                throw new Error("서버를 찾을 수 없습니다.");
              }
            } else {
              throw new Error("서버 ID가 필요합니다.");
            }
          } catch (error: any) {
            console.error(
              "[SettingsPanel] Failed to remove MCP server:",
              error,
            );
            safePostMessage(panel, {
              command: "mcpServerRemoveError",
              error: error.message,
            });
          }
          break;
        case "toggleMcpServer": // MCP 서버 활성화/비활성화 (개인 서버)
          try {
            const toggleServerId = data.serverId;
            const enabled = data.enabled;
            if (!toggleServerId) {
              throw new Error("서버 ID가 필요합니다.");
            }

            const { MCPManager: MCPMgr } = await import("../mcp/MCPManager");
            const mcpMgr = MCPMgr.getInstance();

            let resultStatus = "disconnected";
            let resultTools: any[] = [];

            // updateServer가 메모리 업데이트 → disconnect → save를 일관되게 처리
            const updated = await mcpMgr.updateServer(toggleServerId, {
              enabled,
            });
            if (updated) {
              resultStatus =
                updated.status || (enabled ? "connected" : "disconnected");
              resultTools = updated.tools || [];
            }
            console.log(
              `[SettingsPanel] MCP server ${enabled ? "enabled" : "disabled"}: ${toggleServerId}`,
            );

            safePostMessage(panel, {
              command: "mcpServerToggled",
              serverId: toggleServerId,
              enabled,
              status: resultStatus,
              tools: resultTools,
            });
            notificationService.showInfoMessage(
              `CODEPILOT: MCP 서버 ${enabled ? "활성화" : "비활성화"}됨`,
            );
          } catch (error: any) {
            console.error(
              "[SettingsPanel] Failed to toggle MCP server:",
              error,
            );
            safePostMessage(panel, {
              command: "mcpServerToggled",
              serverId: data.serverId,
              enabled: !data.enabled,
              status: "error",
            });
          }
          break;
        case "toggleAdminMcpServer": // 관리자 MCP 서버 토글 (권장만)
          try {
            const adminServerId = data.serverId;
            const adminEnabled = data.enabled;
            if (!adminServerId) {
              throw new Error("서버 ID가 필요합니다.");
            }

            const { MCPManager: MCPMgrAdmin } =
              await import("../mcp/MCPManager");
            const mcpMgrAdmin = MCPMgrAdmin.getInstance();
            const toggled = await mcpMgrAdmin.toggleAdminServer(
              adminServerId,
              adminEnabled,
            );

            if (toggled) {
              safePostMessage(panel, {
                command: "adminMcpServerToggled",
                serverId: adminServerId,
                enabled: adminEnabled,
                status: toggled.status || "disconnected",
                tools: toggled.tools || [],
              });
              notificationService.showInfoMessage(
                `CODEPILOT: 관리자 MCP 서버 ${adminEnabled ? "활성화" : "비활성화"}됨`,
              );
            }
          } catch (error: any) {
            console.error(
              "[SettingsPanel] Failed to toggle admin MCP server:",
              error,
            );
          }
          break;
        case "testMcpServer": // MCP 서버 연결 테스트 (개인 + 관리자 모두)
          try {
            const serverId = data.serverId;
            if (!serverId) {
              throw new Error("서버 ID가 필요합니다.");
            }

            const { MCPManager } = await import("../mcp/MCPManager");
            const mcpManager = MCPManager.getInstance();

            // 개인 서버에서 찾기
            const personalServers = await stateManager.getMcpServers();
            const personalServer = personalServers.find(
              (s: any) => s.id === serverId,
            );
            const isAdmin = !personalServer;

            if (personalServer) {
              // 개인 서버: MCPManager에 등록 후 연결
              const existingServers = mcpManager.getServers();
              if (!existingServers.find((s) => s.id === serverId)) {
                await mcpManager.addServer(personalServer);
              }
            }
            // 관리자 서버는 이미 MCPManager.adminServers에 있음

            // 연결 테스트
            await mcpManager.connectToServer(serverId);

            // 도구 목록 가져오기 (개인 + 관리자 모두에서 검색)
            const allServers = [
              ...mcpManager.getServers(),
              ...mcpManager.getAdminServers(),
            ];
            const connectedServer = allServers.find((s) => s.id === serverId);
            const tools = connectedServer?.tools || [];

            // 개인 서버만 StateManager에 상태 저장
            if (!isAdmin) {
              await stateManager.updateMcpServer(serverId, {
                status: "connected",
                tools: tools,
                lastConnected: Date.now(),
              });
            }

            safePostMessage(panel, {
              command: "mcpTestResult",
              serverId: serverId,
              success: true,
              toolCount: tools.length,
              tools: tools,
            });
            notificationService.showInfoMessage(
              `CODEPILOT: MCP 서버 연결 성공 (${tools.length}개 도구)`,
            );
          } catch (error: any) {
            console.error("[SettingsPanel] Failed to test MCP server:", error);

            // 개인 서버만 StateManager에 에러 상태 저장
            if (data.serverId) {
              const pServers = await stateManager.getMcpServers();
              if (pServers.find((s: any) => s.id === data.serverId)) {
                await stateManager.updateMcpServer(data.serverId, {
                  status: "error",
                });
              }
            }

            safePostMessage(panel, {
              command: "mcpTestResult",
              serverId: data.serverId,
              success: false,
              error: error.message,
            });
            notificationService.showErrorMessage(
              `CODEPILOT: MCP 서버 연결 실패 - ${error.message}`,
            );
          }
          break;

        // ========== Hot Load 관련 메시지 핸들러 ==========
        case "getHotLoads":
          try {
            const hotLoadManager = HotLoadManager.getInstance(context);
            const hotLoads = await hotLoadManager.getAllHotLoads();
            safePostMessage(panel, {
              command: "hotLoads",
              hotLoads: hotLoads,
            });
          } catch (error: any) {
            console.error("[SettingsPanelProvider] getHotLoads error:", error);
            safePostMessage(panel, {
              command: "hotLoadsError",
              error: error.message,
            });
          }
          break;

        case "addHotLoad":
          try {
            const hotLoadManager = HotLoadManager.getInstance(context);
            // 완료조건 파싱
            const addCondition =
              data.conditionType && data.conditionType !== "none"
                ? { type: data.conditionType, value: data.conditionValue || "" }
                : undefined;
            const id = await hotLoadManager.addHotLoad(
              data.keywords,
              data.description,
              data.commandStr,
              addCondition,
              data.maxRetries ? parseInt(data.maxRetries, 10) : undefined,
              data.onFailure || undefined,
            );
            safePostMessage(panel, {
              command: "hotLoadAdded",
              id: id,
            });
            notificationService.showInfoMessage(
              "CODEPILOT: Hot Load 항목이 추가되었습니다.",
            );
          } catch (error: any) {
            console.error("[SettingsPanelProvider] addHotLoad error:", error);
            safePostMessage(panel, {
              command: "hotLoadAddError",
              error: error.message,
            });
          }
          break;

        case "updateHotLoad":
          try {
            const hotLoadManager = HotLoadManager.getInstance(context);
            // 완료조건 파싱
            const updateCondition =
              data.conditionType && data.conditionType !== "none"
                ? { type: data.conditionType, value: data.conditionValue || "" }
                : undefined;
            await hotLoadManager.updateHotLoad(
              data.id,
              data.keywords,
              data.description,
              data.commandStr,
              updateCondition,
              data.maxRetries ? parseInt(data.maxRetries, 10) : undefined,
              data.onFailure || undefined,
            );
            safePostMessage(panel, { command: "hotLoadUpdated" });
            notificationService.showInfoMessage(
              "CODEPILOT: Hot Load 항목이 수정되었습니다.",
            );
          } catch (error: any) {
            console.error(
              "[SettingsPanelProvider] updateHotLoad error:",
              error,
            );
            safePostMessage(panel, {
              command: "hotLoadUpdateError",
              error: error.message,
            });
          }
          break;

        case "deleteHotLoad":
          try {
            const hotLoadManager = HotLoadManager.getInstance(context);
            await hotLoadManager.deleteHotLoad(data.id);
            safePostMessage(panel, { command: "hotLoadDeleted" });
            notificationService.showInfoMessage(
              "CODEPILOT: Hot Load 항목이 삭제되었습니다.",
            );
          } catch (error: any) {
            console.error(
              "[SettingsPanelProvider] deleteHotLoad error:",
              error,
            );
            safePostMessage(panel, {
              command: "hotLoadDeleteError",
              error: error.message,
            });
          }
          break;

        // ========== 컨텍스트 제외 패턴 관련 메시지 핸들러 ==========
        case "getContextExclusions":
          try {
            const customExclusions: string[] = context.globalState.get(
              "contextExclusionPatterns",
              [],
            );
            const disabledExclusions: string[] = context.globalState.get(
              "contextExclusionDisabled",
              [],
            );
            const { EXCLUDED_LIBRARY_PATHS } =
              await import("../utils/FileExclusionConstants");
            safePostMessage(panel, {
              command: "contextExclusions",
              defaultPatterns: EXCLUDED_LIBRARY_PATHS,
              customPatterns: customExclusions,
              disabledPatterns: disabledExclusions,
            });
          } catch (error: any) {
            console.error(
              "[SettingsPanelProvider] getContextExclusions error:",
              error,
            );
            safePostMessage(panel, {
              command: "contextExclusionsError",
              error: error.message,
            });
          }
          break;

        case "addContextExclusion":
          try {
            const pattern = (data.pattern || "").trim();
            if (!pattern) {
              throw new Error("패턴을 입력해주세요.");
            }
            const currentPatterns: string[] = context.globalState.get(
              "contextExclusionPatterns",
              [],
            );
            if (currentPatterns.includes(pattern)) {
              throw new Error("이미 등록된 패턴입니다.");
            }
            currentPatterns.push(pattern);
            await context.globalState.update(
              "contextExclusionPatterns",
              currentPatterns,
            );
            // 캐시 갱신
            const { updateCustomExclusionCache: updateCacheAdd } =
              await import("../utils/FileExclusionConstants");
            updateCacheAdd(currentPatterns);
            safePostMessage(panel, { command: "contextExclusionAdded" });
          } catch (error: any) {
            console.error(
              "[SettingsPanelProvider] addContextExclusion error:",
              error,
            );
            safePostMessage(panel, {
              command: "contextExclusionAddError",
              error: error.message,
            });
          }
          break;

        case "deleteContextExclusion":
          try {
            const patternToDelete = data.pattern;
            const existingPatterns: string[] = context.globalState.get(
              "contextExclusionPatterns",
              [],
            );
            const filtered = existingPatterns.filter(
              (p) => p !== patternToDelete,
            );
            await context.globalState.update(
              "contextExclusionPatterns",
              filtered,
            );
            // 캐시 갱신
            const { updateCustomExclusionCache: updateCacheDel } =
              await import("../utils/FileExclusionConstants");
            updateCacheDel(filtered);
            safePostMessage(panel, { command: "contextExclusionDeleted" });
          } catch (error: any) {
            console.error(
              "[SettingsPanelProvider] deleteContextExclusion error:",
              error,
            );
            safePostMessage(panel, {
              command: "contextExclusionDeleteError",
              error: error.message,
            });
          }
          break;

        case "disableDefaultExclusion":
          try {
            const patternToDisable = data.pattern;
            const currentDisabled: string[] = context.globalState.get(
              "contextExclusionDisabled",
              [],
            );
            if (!currentDisabled.includes(patternToDisable)) {
              currentDisabled.push(patternToDisable);
              await context.globalState.update(
                "contextExclusionDisabled",
                currentDisabled,
              );
              const { updateDisabledExclusionCache: updateDisCache } =
                await import("../utils/FileExclusionConstants");
              updateDisCache(currentDisabled);
            }
            safePostMessage(panel, { command: "defaultExclusionToggled" });
          } catch (error: any) {
            console.error(
              "[SettingsPanelProvider] disableDefaultExclusion error:",
              error,
            );
            safePostMessage(panel, {
              command: "defaultExclusionToggleError",
              error: error.message,
            });
          }
          break;

        case "enableDefaultExclusion":
          try {
            const patternToEnable = data.pattern;
            const disabledList: string[] = context.globalState.get(
              "contextExclusionDisabled",
              [],
            );
            const updatedDisabled = disabledList.filter(
              (p) => p !== patternToEnable,
            );
            await context.globalState.update(
              "contextExclusionDisabled",
              updatedDisabled,
            );
            const { updateDisabledExclusionCache: updateEnCache } =
              await import("../utils/FileExclusionConstants");
            updateEnCache(updatedDisabled);
            safePostMessage(panel, { command: "defaultExclusionToggled" });
          } catch (error: any) {
            console.error(
              "[SettingsPanelProvider] enableDefaultExclusion error:",
              error,
            );
            safePostMessage(panel, {
              command: "defaultExclusionToggleError",
              error: error.message,
            });
          }
          break;

        // v9.7.0: 사용량 메트릭 조회
        case "getUsageMetrics":
          try {
            const metricsManager = UsageMetricsManager.getInstance();
            const metrics = metricsManager.getMetrics();
            const toolStats = Object.fromEntries(metricsManager.getToolStats());
            safePostMessage(panel, {
              command: "usageMetricsData",
              metrics,
              toolStats,
            });
          } catch (error: any) {
            console.error(
              "[SettingsPanelProvider] getUsageMetrics error:",
              error,
            );
            safePostMessage(panel, {
              command: "usageMetricsError",
              error: error.message,
            });
          }
          break;

        // Skills 전체 초기화
        case "resetAllSkills":
          try {
            const skillsDir = context.storageUri
              ? path.join(context.storageUri.fsPath, "rules")
              : null;
            if (skillsDir) {
              const skillsDirUri = vscode.Uri.file(skillsDir);
              try {
                const entries =
                  await vscode.workspace.fs.readDirectory(skillsDirUri);
                for (const [name] of entries) {
                  const entryUri = vscode.Uri.file(path.join(skillsDir, name));
                  await vscode.workspace.fs.delete(entryUri, {
                    recursive: true,
                  });
                }
              } catch (e: any) {
                if (e.code !== "FileNotFound") throw e;
              }
            }
            safePostMessage(panel, { command: "allSkillsReset" });
            notificationService.showInfoMessage(
              "모든 Skills 파일이 삭제되었습니다.",
            );
          } catch (error: any) {
            console.error(
              "[SettingsPanelProvider] resetAllSkills error:",
              error,
            );
            notificationService.showErrorMessage(
              `Skills 초기화 실패: ${error.message}`,
            );
          }
          break;

        // v9.7.0: 사용량 메트릭 리셋
        case "resetUsageMetrics":
          try {
            const metricsManager = UsageMetricsManager.getInstance();
            metricsManager.resetMetrics();
            safePostMessage(panel, { command: "usageMetricsReset" });
            notificationService.showInfoMessage(
              "사용량 통계가 초기화되었습니다.",
            );
          } catch (error: any) {
            console.error(
              "[SettingsPanelProvider] resetUsageMetrics error:",
              error,
            );
          }
          break;

        // ═══════════ 인증 게이트 핸들러 ═══════════
        case "checkAuthState": {
          try {
            const auth = AuthService.getInstance();
            const state = auth.getAuthState();
            let user = state.loggedIn ? auth.getUserInfo() : undefined;

            // 로그인 상태면 서버에서 최신 유저 정보 동기화
            if (state.loggedIn) {
              try {
                const { CodePilotApiClient } =
                  await import("../../services/api/CodePilotApiClient");
                const api = CodePilotApiClient.getInstance();
                const meRaw: any = await api.get("/auth/me/");
                const me = meRaw?.data || meRaw;
                if (me?.id) {
                  const orgName =
                    me.organization_name ||
                    (user as any)?.organization_name ||
                    "";
                  const updated = {
                    ...(user || {}),
                    ...me,
                    organization: orgName,
                    organization_id:
                      me.organization_id ||
                      me.organization ||
                      (user as any)?.organization_id,
                    organization_name: orgName,
                  };
                  await context.globalState.update(
                    "codepilot.userInfo",
                    updated,
                  );
                  user = updated;
                }
              } catch {
                // 서버 연결 실패 시 캐시된 정보 사용
              }
            }

            safePostMessage(panel, {
              command: "authState",
              loggedIn: state.loggedIn,
              user,
            });
          } catch {
            safePostMessage(panel, {
              command: "authState",
              loggedIn: false,
            });
          }
          break;
        }
        case "loginWithGoogle": {
          try {
            const auth = AuthService.getInstance();
            await auth.loginWithGoogle();
            // OAuth 콜백이 handleOAuthCallback → onDidChangeAuth → authState 메시지로 처리됨
          } catch (e: any) {
            safePostMessage(panel, {
              command: "loginError",
              message: e?.message || "로그인 실패",
            });
          }
          break;
        }
        case "logout": {
          try {
            const auth = AuthService.getInstance();
            await auth.logout();
          } catch {
            /* ignore */
          }
          break;
        }
        case "changeApiKey": {
          try {
            const newKey = (data.apiKey || "").trim();
            if (!newKey) {
              safePostMessage(panel, {
                command: "changeApiKeyResult",
                success: false,
                message: "API 키를 입력하세요.",
              });
              break;
            }

            const auth = AuthService.getInstance();

            // 서버에 API 키 검증 요청 (/license/join/)
            try {
              const { CodePilotApiClient } =
                await import("../../services/api/CodePilotApiClient");
              const api = CodePilotApiClient.getInstance();
              const result: any = await api.post("/license/join/", {
                api_key: newKey,
              });

              // 서버 검증 성공 → 반환된 사용자 정보로 업데이트
              const apiKeyName = result?.api_key_name || "조직 연결됨";
              const apiKeyMasked =
                result?.api_key_masked ||
                (newKey.length > 8
                  ? newKey.slice(0, 4) + "..." + newKey.slice(-4)
                  : "****");

              const orgName = result?.organization_name || "";
              const updatedInfo = {
                ...(auth.getUserInfo() || {}),
                apiKeyName,
                apiKeyMasked,
                organization: orgName,
                organization_id:
                  result?.organization_id || result?.organization,
                organization_name: orgName,
              };
              await context.globalState.update(
                "codepilot.userInfo",
                updatedInfo,
              );
              await context.globalState.update("codepilot.apiKey", newKey);
              safePostMessage(panel, {
                command: "changeApiKeyResult",
                success: true,
              });
              (auth as any)._onDidChangeAuth?.fire(true);

              // 조직 설정 즉시 동기화
              try {
                const { SettingsManager } =
                  await import("../../core/managers/state/SettingsManager");
                const settingsManager = SettingsManager.getInstance(context);
                await settingsManager.syncServerSettings();
              } catch {}
            } catch (apiError: any) {
              const errorMsg =
                apiError?.message || "유효하지 않은 API 키입니다";
              safePostMessage(panel, {
                command: "changeApiKeyResult",
                success: false,
                message: errorMsg,
              });
            }
          } catch (e: any) {
            const msg = e?.message || "API 키 변경 실패";
            safePostMessage(panel, {
              command: "changeApiKeyResult",
              success: false,
              message: msg,
            });
          }
          break;
        }

        case "clearApiKey": {
          try {
            // globalState에서 API 키 관련 데이터 제거
            await context.globalState.update("codepilot.apiKey", undefined);
            const auth = AuthService.getInstance();
            const currentInfo = auth.getUserInfo() || {};
            const cleaned = { ...currentInfo } as any;
            delete cleaned.apiKeyName;
            delete cleaned.apiKeyMasked;
            await context.globalState.update("codepilot.userInfo", cleaned);
            safePostMessage(panel, {
              command: "clearApiKeyResult",
              success: true,
            });
          } catch {
            safePostMessage(panel, {
              command: "clearApiKeyResult",
              success: false,
            });
          }
          break;
        }

        // ===== 빌드/테스트 개인 설정 CRUD =====
        case "saveBuildTestSetting": {
          try {
            const type = data.type || "validation_command";
            const language = data.language || "";
            const description = data.description || "";
            const command = data.value || "";
            if (!command) {
              safePostMessage(panel, {
                command: "buildTestSettingsUpdated",
                success: false,
                error: "명령어를 입력하세요",
                settings: context.globalState.get<any[]>(
                  "personalBuildTestSettings",
                  [],
                ),
              });
              break;
            }
            const keySuffix = language
              ? `-${language.toLowerCase().replace(/[^a-z0-9]+/g, "")}`
              : "";
            const key = `${type}${keySuffix}`;
            const settings = context.globalState.get<any[]>(
              "personalBuildTestSettings",
              [],
            );
            const existing = settings.findIndex((s: any) => s.key === key);
            const entry = { key, description, value: { command, language } };
            if (existing >= 0) {
              settings[existing] = entry;
            } else {
              settings.push(entry);
            }
            await context.globalState.update(
              "personalBuildTestSettings",
              settings,
            );
            console.log(
              `[SettingsPanel] Build/test setting saved: ${key} = ${command}`,
            );
            safePostMessage(panel, {
              command: "buildTestSettingsUpdated",
              success: true,
              settings,
            });
          } catch (error: any) {
            console.error(
              "[SettingsPanel] Failed to save build/test setting:",
              error,
            );
            safePostMessage(panel, {
              command: "buildTestSettingsUpdated",
              success: false,
              error: error.message,
              settings: context.globalState.get<any[]>(
                "personalBuildTestSettings",
                [],
              ),
            });
          }
          break;
        }
        case "deleteBuildTestSetting": {
          try {
            const key = data.key;
            const settings = context.globalState.get<any[]>(
              "personalBuildTestSettings",
              [],
            );
            const filtered = settings.filter((s: any) => s.key !== key);
            await context.globalState.update(
              "personalBuildTestSettings",
              filtered,
            );
            console.log(`[SettingsPanel] Build/test setting deleted: ${key}`);
            safePostMessage(panel, {
              command: "buildTestSettingsUpdated",
              success: true,
              settings: filtered,
            });
          } catch (error: any) {
            console.error(
              "[SettingsPanel] Failed to delete build/test setting:",
              error,
            );
            safePostMessage(panel, {
              command: "buildTestSettingsUpdated",
              success: false,
              error: error.message,
              settings: context.globalState.get<any[]>(
                "personalBuildTestSettings",
                [],
              ),
            });
          }
          break;
        }
        case "selectProject": {
          const projectId = data.projectId || null;
          await context.globalState.update("codepilot.projectId", projectId);
          console.log(
            `[PanelManager] Project selected: ${projectId || "(team common)"}`,
          );
          // 설정 재동기화 후 UI 갱신
          try {
            await settingsManager.syncServerSettings();
            // 업데이트된 설정을 webview에 전송
            safePostMessage(panel, {
              command: "updateServerSettings",
              serverSettings: settingsManager.getAllServerSettings(),
            });
            notificationService.showInfoMessage(
              projectId
                ? `프로젝트 설정이 적용되었습니다.`
                : `팀 기본 설정으로 전환되었습니다.`,
            );
          } catch {
            /* ignore */
          }
          break;
        }
        case "deleteAccount": {
          try {
            const input = await vscode.window.showInputBox({
              prompt: '계정을 탈퇴하려면 "탈퇴"를 입력하세요',
              placeHolder: "탈퇴",
              validateInput: (v) =>
                v === "탈퇴" ? null : '"탈퇴"를 정확히 입력하세요',
            });
            if (input !== "탈퇴") break;

            const { CodePilotApiClient } =
              await import("../../services/api/CodePilotApiClient");
            const api = CodePilotApiClient.getInstance();
            await api.delete("/auth/me/");

            // 로컬 상태 정리
            await context.globalState.update("codepilot.userInfo", undefined);
            await context.globalState.update("codepilot.apiKey", undefined);

            vscode.window.showInformationMessage("계정이 탈퇴 처리되었습니다.");
            safePostMessage(panel, { command: "logoutResult", success: true });
          } catch (e: any) {
            vscode.window.showErrorMessage(
              `계정 탈퇴 실패: ${e?.message || "알 수 없는 오류"}`,
            );
          }
          break;
        }
        case "leaveTeam": {
          try {
            const confirm = await vscode.window.showWarningMessage(
              "정말 현재 조직에서 탈퇴하시겠습니까? 조직 설정에 더 이상 접근할 수 없습니다.",
              { modal: true },
              "탈퇴",
            );
            if (confirm !== "탈퇴") break;

            const { CodePilotApiClient } =
              await import("../../services/api/CodePilotApiClient");
            const api = CodePilotApiClient.getInstance();
            await api.post("/auth/me/leave-organization/", {});

            // 로컬 userInfo 갱신 (조직 + API 키 정보 제거)
            const auth = AuthService.getInstance();
            const userInfo = auth.getUserInfo();
            if (userInfo) {
              const cleaned = { ...userInfo } as any;
              cleaned.organization = "";
              cleaned.organization_id = null;
              cleaned.organization_name = "";
              delete cleaned.apiKeyName;
              delete cleaned.apiKeyMasked;
              await context.globalState.update("codepilot.userInfo", cleaned);
            }
            await context.globalState.update("codepilot.apiKey", undefined);

            safePostMessage(panel, {
              command: "leaveTeamResult",
              success: true,
            });
            vscode.window.showInformationMessage("조직에서 탈퇴했습니다.");
          } catch (e: any) {
            vscode.window.showErrorMessage(
              `팀 탈퇴 실패: ${e?.message || "알 수 없는 오류"}`,
            );
            safePostMessage(panel, {
              command: "leaveTeamResult",
              success: false,
            });
          }
          break;
        }
        case "toggleErrorReporting": {
          try {
            const config = vscode.workspace.getConfiguration("codepilot");
            await config.update(
              "errorReportingEnabled",
              !!data.value,
              vscode.ConfigurationTarget.Global,
            );
          } catch {
            /* ignore */
          }
          break;
        }
        case "syncSettings": {
          try {
            const { SettingsManager } =
              await import("../../core/managers/state/SettingsManager");
            const sm = SettingsManager.getInstance();
            await sm.syncServerSettings();
            // 동기화 후 서버 설정도 다시 전송
            safePostMessage(panel, {
              command: "serverSettingsLoaded",
              settings: sm.getAllServerSettings(),
            });
            // 프로젝트 목록도 갱신
            try {
              const userInfo =
                context.globalState.get<any>("codepilot.userInfo");
              const orgId = userInfo?.organization_id;
              if (orgId) {
                const { CodePilotApiClient } =
                  await import("../../services/api/CodePilotApiClient");
                const api = CodePilotApiClient.getInstance();
                const raw: any = await api.get(
                  `/organizations/${orgId}/projects/`,
                );
                const projects = Array.isArray(raw)
                  ? raw
                  : raw?.data || raw?.results || [];
                safePostMessage(panel, {
                  command: "projectListUpdated",
                  projects,
                });
              }
            } catch {
              /* ignore */
            }
          } catch {
            /* ignore */
          }
          break;
        }

        case "getServerSettings": {
          try {
            // 진행 중인 동기화 완료 대기 후, 캐시가 비어있으면 재동기화
            await settingsManager.waitForSync();
            let serverSettings = settingsManager.getAllServerSettings();
            if (!serverSettings || Object.keys(serverSettings).length === 0) {
              await settingsManager.syncServerSettings();
              serverSettings = settingsManager.getAllServerSettings();
            }
            safePostMessage(panel, {
              command: "serverSettingsLoaded",
              settings: serverSettings,
            });
          } catch {
            /* ignore */
          }
          break;
        }

        case "toggleServerSetting": {
          try {
            const { category, key, disabled } = data;
            await settingsManager.toggleRecommendedSetting(
              category,
              key,
              !!disabled,
            );
            // 변경 후 전체 서버 설정 다시 전송
            safePostMessage(panel, {
              command: "serverSettingsLoaded",
              settings: settingsManager.getAllServerSettings(),
            });
          } catch {
            /* ignore */
          }
          break;
        }

        case "saveAdminApiKey": {
          try {
            const key = (data.apiKey || "").trim();
            if (!key) {
              safePostMessage(panel, {
                command: "adminApiKeySaveError",
                error: "API 키를 입력하세요.",
              });
              break;
            }
            // globalState에 저장
            await context.globalState.update("codepilot.adminApiKey", key);

            // 현재 adminConfig에 API 키 반영 + LLMManager 업데이트
            try {
              const configJson = await stateManager.getAdminModelConfig();
              if (configJson) {
                const adminConfig = JSON.parse(configJson);
                adminConfig.apiKey = key;
                await stateManager.saveAdminModelConfig(
                  JSON.stringify(adminConfig),
                );
                const { LLMManager } =
                  await import("../managers/model/LLMManager");
                const llmManager = LLMManager.getInstance();
                llmManager.setAdminModelConfig(adminConfig);
              }
            } catch {}

            safePostMessage(panel, { command: "adminApiKeySaved" });
          } catch (e: any) {
            safePostMessage(panel, {
              command: "adminApiKeySaveError",
              error: e?.message || "저장 실패",
            });
          }
          break;
        }

        // ========== 설정 내보내기 / 가져오기 ==========
        case "exportSettings": {
          try {
            const config = vscode.workspace.getConfiguration("codepilot");

            const exportData: any = {
              version:
                vscode.extensions.getExtension("banya.codepilot")?.packageJSON
                  ?.version || "0.0.0",
              exportedAt: new Date().toISOString(),
              settings: {
                language: (await stateManager.getLanguage()) || "ko",
                chatTheme: config.get<string>("chatTheme") || "dark",
                autoUpdateEnabled: await settingsManager.isAutoUpdateEnabled(),
                autoDeleteFilesEnabled:
                  await settingsManager.isAutoDeleteFilesEnabled(),
                autoExecuteCommandsEnabled:
                  await settingsManager.isAutoExecuteCommandsEnabled(),
                blockOutsideProjectEnabled:
                  await settingsManager.isBlockOutsideProjectEnabled(),
                autoToolExecutionEnabled:
                  await settingsManager.isAutoToolExecutionEnabled(),
                autoMcpToolExecutionEnabled:
                  await settingsManager.isAutoMcpToolExecutionEnabled(),
                orchestrationEnabled:
                  await settingsManager.isOrchestrationEnabled(),
                streamingEnabled: await settingsManager.isStreamingEnabled(),
                nativeToolCallingEnabled:
                  await settingsManager.isNativeToolCallingEnabled(),
                thinkingEnabled: await settingsManager.isThinkingEnabled(),
                thinkingLevel: await settingsManager.getThinkingLevel(),
                inlineCompletionEnabled: config.get<boolean>(
                  "inlineCompletion",
                  false,
                ),
                promptSuggestionEnabled: config.get<boolean>(
                  "promptSuggestion",
                  false,
                ),
                errorReportingEnabled: config.get<boolean>(
                  "errorReportingEnabled",
                  false,
                ),
                autoTestRetryEnabled:
                  await settingsManager.isAutoTestRetryEnabled(),
                testRetryCount: await settingsManager.getTestRetryCount(),
                autoCorrectionEnabled:
                  await stateManager.getAutoCorrectionEnabled(),
                errorRetryCount: await stateManager.getErrorRetryCount(),
                aiModel: (await stateManager.getAiModel()) || "ollama",
                ollamaServerType:
                  (await stateManager.getOllamaServerType()) || "local",
                ollamaApiUrl: (await stateManager.getOllamaApiUrl()) || "",
                ollamaModel: (await stateManager.getOllamaModel()) || "",
                remoteOllamaApiUrl:
                  (await stateManager.getRemoteOllamaApiUrl()) || "",
                remoteOllamaModel:
                  (await stateManager.getRemoteOllamaModel()) || "",
                compactorModelType:
                  (await stateManager.getCompactorModelType()) || "",
                compactorModelName:
                  (await stateManager.getCompactorModelName()) || "",
                commandModelType:
                  (await stateManager.getCommandModelType()) || "",
                commandModelName:
                  (await stateManager.getCommandModelName()) || "",
                intentModelType:
                  (await stateManager.getIntentModelType()) || "",
                intentModelName:
                  (await stateManager.getIntentModelName()) || "",
                errorFallbackModelType:
                  (await stateManager.getErrorFallbackModelType()) || "",
                errorFallbackModelName:
                  (await stateManager.getErrorFallbackModelName()) || "",
                completionModelType:
                  (await stateManager.getCompletionModelType()) || "",
                completionModelName:
                  (await stateManager.getCompletionModelName()) || "",
                subagentModelType:
                  (await stateManager.getSubagentModelType()) || "",
                subagentModelName:
                  (await stateManager.getSubagentModelName()) || "",
              },
              buildTestSettings: context.globalState.get<any[]>(
                "personalBuildTestSettings",
                [],
              ),
              mcpServers: await stateManager.getMcpServers(),
              hotLoads:
                await HotLoadManager.getInstance(context).getAllHotLoads(),
              security: {
                blockedCommands: context.globalState.get<string[]>(
                  "securityBlockedCommands",
                  [],
                ),
                protectedFiles: context.globalState.get<string[]>(
                  "securityProtectedFiles",
                  [],
                ),
                hiddenFiles: context.globalState.get<string[]>(
                  "securityHiddenFiles",
                  [],
                ),
                disabledBlockedCommands: context.globalState.get<string[]>(
                  "securityDisabledBlockedCommands",
                  [],
                ),
                disabledProtectedFiles: context.globalState.get<string[]>(
                  "securityDisabledProtectedFiles",
                  [],
                ),
              },
              contextExclusions: context.globalState.get<string[]>(
                "contextExclusionPatterns",
                [],
              ),
              contextExclusionDisabled: context.globalState.get<string[]>(
                "contextExclusionDisabled",
                [],
              ),
            };

            const uri = await vscode.window.showSaveDialog({
              defaultUri: vscode.Uri.file(
                `codepilot-settings-${new Date().toISOString().slice(0, 10)}.json`,
              ),
              filters: { JSON: ["json"] },
            });

            if (uri) {
              await vscode.workspace.fs.writeFile(
                uri,
                Buffer.from(JSON.stringify(exportData, null, 2), "utf8"),
              );
              safePostMessage(panel, {
                command: "settingsExported",
                success: true,
              });
            } else {
              safePostMessage(panel, {
                command: "settingsExported",
                success: false,
                error: "취소됨",
              });
            }
          } catch (error: any) {
            console.error("[SettingsPanel] exportSettings error:", error);
            safePostMessage(panel, {
              command: "settingsExported",
              success: false,
              error: error.message,
            });
          }
          break;
        }

        case "importSettings": {
          try {
            const uris = await vscode.window.showOpenDialog({
              canSelectMany: false,
              filters: { JSON: ["json"] },
            });

            if (!uris || uris.length === 0) {
              safePostMessage(panel, {
                command: "settingsImported",
                success: false,
                error: "취소됨",
              });
              break;
            }

            const fileContent = await vscode.workspace.fs.readFile(uris[0]);
            const imported = JSON.parse(
              Buffer.from(fileContent).toString("utf8"),
            );

            if (!imported.settings || typeof imported.settings !== "object") {
              throw new Error("유효하지 않은 설정 파일입니다.");
            }

            const s = imported.settings;
            const cfgImport = vscode.workspace.getConfiguration("codepilot");

            if (s.language) {
              await stateManager.saveLanguage(s.language);
            }
            if (s.chatTheme) {
              await cfgImport.update(
                "chatTheme",
                s.chatTheme,
                vscode.ConfigurationTarget.Global,
              );
            }
            if (typeof s.autoUpdateEnabled === "boolean") {
              await cfgImport.update(
                "autoUpdateFiles",
                s.autoUpdateEnabled,
                vscode.ConfigurationTarget.Global,
              );
            }
            if (typeof s.autoDeleteFilesEnabled === "boolean") {
              await cfgImport.update(
                "autoDeleteFiles",
                s.autoDeleteFilesEnabled,
                vscode.ConfigurationTarget.Global,
              );
            }
            if (typeof s.autoExecuteCommandsEnabled === "boolean") {
              await cfgImport.update(
                "autoExecuteCommands",
                s.autoExecuteCommandsEnabled,
                vscode.ConfigurationTarget.Global,
              );
            }
            if (typeof s.blockOutsideProjectEnabled === "boolean") {
              await cfgImport.update(
                "blockOutsideProject",
                s.blockOutsideProjectEnabled,
                vscode.ConfigurationTarget.Global,
              );
            }
            if (typeof s.autoToolExecutionEnabled === "boolean") {
              await cfgImport.update(
                "autoToolExecution",
                s.autoToolExecutionEnabled,
                vscode.ConfigurationTarget.Global,
              );
            }
            if (typeof s.autoMcpToolExecutionEnabled === "boolean") {
              await cfgImport.update(
                "autoMcpToolExecution",
                s.autoMcpToolExecutionEnabled,
                vscode.ConfigurationTarget.Global,
              );
            }
            if (typeof s.orchestrationEnabled === "boolean") {
              await cfgImport.update(
                "orchestration",
                s.orchestrationEnabled,
                vscode.ConfigurationTarget.Global,
              );
            }
            if (typeof s.streamingEnabled === "boolean") {
              await cfgImport.update(
                "streamingEnabled",
                s.streamingEnabled,
                vscode.ConfigurationTarget.Global,
              );
            }
            if (typeof s.nativeToolCallingEnabled === "boolean") {
              await cfgImport.update(
                "nativeToolCallingEnabled",
                s.nativeToolCallingEnabled,
                vscode.ConfigurationTarget.Global,
              );
            }
            if (typeof s.thinkingEnabled === "boolean") {
              await cfgImport.update(
                "thinkingEnabled",
                s.thinkingEnabled,
                vscode.ConfigurationTarget.Global,
              );
            }
            if (s.thinkingLevel) {
              await cfgImport.update(
                "thinkingLevel",
                s.thinkingLevel,
                vscode.ConfigurationTarget.Global,
              );
            }
            if (typeof s.inlineCompletionEnabled === "boolean") {
              await cfgImport.update(
                "inlineCompletion",
                s.inlineCompletionEnabled,
                vscode.ConfigurationTarget.Global,
              );
            }
            if (typeof s.promptSuggestionEnabled === "boolean") {
              await cfgImport.update(
                "promptSuggestion",
                s.promptSuggestionEnabled,
                vscode.ConfigurationTarget.Global,
              );
            }
            if (typeof s.errorReportingEnabled === "boolean") {
              await cfgImport.update(
                "errorReportingEnabled",
                s.errorReportingEnabled,
                vscode.ConfigurationTarget.Global,
              );
            }
            if (typeof s.autoTestRetryEnabled === "boolean") {
              await cfgImport.update(
                "autoTestRetryEnabled",
                s.autoTestRetryEnabled,
                vscode.ConfigurationTarget.Global,
              );
            }
            if (typeof s.testRetryCount === "number") {
              await cfgImport.update(
                "testRetryCount",
                s.testRetryCount,
                vscode.ConfigurationTarget.Global,
              );
            }
            if (typeof s.autoCorrectionEnabled === "boolean") {
              await stateManager.saveAutoCorrectionEnabled(
                s.autoCorrectionEnabled,
              );
            }
            if (typeof s.errorRetryCount === "number") {
              await stateManager.saveErrorRetryCount(s.errorRetryCount);
            }

            if (s.aiModel) {
              await stateManager.saveAiModel(s.aiModel);
            }
            if (s.ollamaServerType) {
              await stateManager.saveOllamaServerType(s.ollamaServerType);
            }
            if (s.ollamaApiUrl) {
              await stateManager.saveOllamaApiUrl(s.ollamaApiUrl);
            }
            if (s.ollamaModel) {
              await stateManager.saveOllamaModel(s.ollamaModel);
            }
            if (s.remoteOllamaApiUrl) {
              await stateManager.saveRemoteOllamaApiUrl(s.remoteOllamaApiUrl);
            }
            if (s.remoteOllamaModel) {
              await stateManager.saveRemoteOllamaModel(s.remoteOllamaModel);
            }

            if (s.compactorModelType) {
              await stateManager.saveCompactorModelType(s.compactorModelType);
            }
            if (s.compactorModelName) {
              await stateManager.saveCompactorModelName(s.compactorModelName);
            }
            if (s.commandModelType) {
              await stateManager.saveCommandModelType(s.commandModelType);
            }
            if (s.commandModelName) {
              await stateManager.saveCommandModelName(s.commandModelName);
            }
            if (s.intentModelType) {
              await stateManager.saveIntentModelType(s.intentModelType);
            }
            if (s.intentModelName) {
              await stateManager.saveIntentModelName(s.intentModelName);
            }
            if (s.errorFallbackModelType) {
              await stateManager.saveErrorFallbackModelType(
                s.errorFallbackModelType,
              );
            }
            if (s.errorFallbackModelName) {
              await stateManager.saveErrorFallbackModelName(
                s.errorFallbackModelName,
              );
            }
            if (s.completionModelType) {
              await stateManager.saveCompletionModelType(s.completionModelType);
            }
            if (s.completionModelName) {
              await stateManager.saveCompletionModelName(s.completionModelName);
            }
            if (s.subagentModelType) {
              await stateManager.saveSubagentModelType(s.subagentModelType);
            }
            if (s.subagentModelName) {
              await stateManager.saveSubagentModelName(s.subagentModelName);
            }

            if (Array.isArray(imported.buildTestSettings)) {
              await context.globalState.update(
                "personalBuildTestSettings",
                imported.buildTestSettings,
              );
            }
            if (Array.isArray(imported.mcpServers)) {
              await stateManager.saveMcpServers(imported.mcpServers);
            }
            if (Array.isArray(imported.hotLoads)) {
              const hotLoadManager = HotLoadManager.getInstance(context);
              const existingHotLoads = await hotLoadManager.getAllHotLoads();
              for (const hl of existingHotLoads) {
                await hotLoadManager.deleteHotLoad(hl.id);
              }
              for (const hl of imported.hotLoads) {
                await hotLoadManager.addHotLoad(
                  hl.keywords,
                  hl.description,
                  hl.command,
                  hl.completionCondition,
                  hl.maxRetries,
                  hl.onFailure,
                );
              }
            }
            if (imported.security && typeof imported.security === "object") {
              if (Array.isArray(imported.security.blockedCommands)) {
                await context.globalState.update(
                  "securityBlockedCommands",
                  imported.security.blockedCommands,
                );
              }
              if (Array.isArray(imported.security.protectedFiles)) {
                await context.globalState.update(
                  "securityProtectedFiles",
                  imported.security.protectedFiles,
                );
              }
              if (Array.isArray(imported.security.hiddenFiles)) {
                await context.globalState.update(
                  "securityHiddenFiles",
                  imported.security.hiddenFiles,
                );
              }
              if (Array.isArray(imported.security.disabledBlockedCommands)) {
                await context.globalState.update(
                  "securityDisabledBlockedCommands",
                  imported.security.disabledBlockedCommands,
                );
              }
              if (Array.isArray(imported.security.disabledProtectedFiles)) {
                await context.globalState.update(
                  "securityDisabledProtectedFiles",
                  imported.security.disabledProtectedFiles,
                );
              }
            }
            if (Array.isArray(imported.contextExclusions)) {
              await context.globalState.update(
                "contextExclusionPatterns",
                imported.contextExclusions,
              );
            }
            if (Array.isArray(imported.contextExclusionDisabled)) {
              await context.globalState.update(
                "contextExclusionDisabled",
                imported.contextExclusionDisabled,
              );
            }

            safePostMessage(panel, {
              command: "settingsImported",
              success: true,
            });
          } catch (error: any) {
            console.error("[SettingsPanel] importSettings error:", error);
            safePostMessage(panel, {
              command: "settingsImported",
              success: false,
              error: error.message,
            });
          }
          break;
        }

        default:
          console.log("Unknown command:", data.command);
      }
    },
  );

  // 인증 상태 변경 시 웹뷰에 자동 전달
  try {
    const authService = AuthService.getInstance();
    const authDisposable = authService.onDidChangeAuth(async (loggedIn) => {
      const user = loggedIn ? authService.getUserInfo() : undefined;
      safePostMessage(panel, {
        command: "authState",
        loggedIn,
        user,
      });
    });
    context.subscriptions.push(authDisposable);
  } catch {
    /* AuthService 미초기화 시 무시 */
  }

  // webview를 전역 배열에 등록
  allWebviews.push(panel.webview);

  // 패널이 dispose될 때 배열에서 제거
  panel.onDidDispose(
    () => {
      try {
        const idx = allWebviews.indexOf(panel.webview);
        if (idx !== -1) {
          allWebviews.splice(idx, 1);
        }
      } catch (error) {
        // Panel이 이미 dispose된 경우 무시 (콘솔 스팸 방지를 위해 주석 처리)
      }
    },
    undefined,
    context.subscriptions,
  );

  // 로그인 후 자동으로 서버 설정 + 프로젝트 목록을 webview에 갱신
  const authService = AuthService.getInstance();
  const authDisposable = authService.onDidChangeAuth(async (loggedIn) => {
    if (loggedIn) {
      try {
        await settingsManager.syncServerSettings();
        const serverSettings = settingsManager.getAllServerSettings();
        safePostMessage(panel, {
          command: "serverSettingsLoaded",
          settings: serverSettings,
        });
        // 프로젝트 목록도 갱신 — 미로그인 상태에서 패널 열린 경우 빈 드롭다운으로 남는 문제 해결
        try {
          const userInfo = context.globalState.get<any>("codepilot.userInfo");
          const orgId = userInfo?.organization_id;
          if (orgId) {
            const { CodePilotApiClient } =
              await import("../../services/api/CodePilotApiClient");
            const api = CodePilotApiClient.getInstance();
            const raw: any = await api.get(`/organizations/${orgId}/projects/`);
            const projects = Array.isArray(raw)
              ? raw
              : raw?.data || raw?.results || [];
            safePostMessage(panel, {
              command: "projectListUpdated",
              projects,
            });
            console.log(
              `[SettingsPanelProvider] Project list refreshed after login: ${projects.length} projects`,
            );
          }
        } catch (e: any) {
          console.warn(
            "[SettingsPanelProvider] Project list refresh failed:",
            e?.message,
          );
        }
        console.log(
          "[SettingsPanelProvider] Server settings refreshed after login",
        );
      } catch {
        /* ignore */
      }
    }
  });
  panel.onDidDispose(() => authDisposable.dispose());

  return panel;
}

/**
 * Plan Queue 패널을 엽니다.
 */
export function openPlanPanel(
  extensionUri: vscode.Uri,
  context: vscode.ExtensionContext,
) {
  // 🆕 core TaskManager 사용
  const taskManager = TaskManager.getInstance(context);
  const panel = createAndSetupWebviewPanel(
    extensionUri,
    context,
    "plan",
    "CODEPILOT Plan Queue",
    "plan",
    vscode.ViewColumn.Two,
    async (data, panel: vscode.WebviewPanel) => {
      switch (data.command) {
        case "planQueueLoad": {
          try {
            const items = taskManager.listPlanItems();
            safePostMessage(panel, { command: "planQueueData", items });
          } catch (e: any) {
            safePostMessage(panel, {
              command: "planQueueError",
              error: e?.message || String(e),
            });
          }
          break;
        }
        case "planQueueRun": {
          try {
            const id = String(data.id || "");
            if (!id) {
              throw new Error("Invalid id");
            }
            taskManager.updatePlanItemStatus(id, "in_progress");
            const items = taskManager.listPlanItems();
            safePostMessage(panel, { command: "planQueueData", items });
          } catch (e: any) {
            safePostMessage(panel, {
              command: "planQueueError",
              error: e?.message || String(e),
            });
          }
          break;
        }
        case "planQueueComplete": {
          try {
            const id = String(data.id || "");
            if (!id) {
              throw new Error("Invalid id");
            }
            taskManager.updatePlanItemStatus(id, "done");
            const items = taskManager.listPlanItems();
            safePostMessage(panel, { command: "planQueueData", items });
          } catch (e: any) {
            safePostMessage(panel, {
              command: "planQueueError",
              error: e?.message || String(e),
            });
          }
          break;
        }
        case "planQueueCancel": {
          try {
            const id = String(data.id || "");
            if (!id) {
              throw new Error("Invalid id");
            }
            taskManager.updatePlanItemStatus(id, "skipped");
            const items = taskManager.listPlanItems();
            safePostMessage(panel, { command: "planQueueData", items });
          } catch (e: any) {
            safePostMessage(panel, {
              command: "planQueueError",
              error: e?.message || String(e),
            });
          }
          break;
        }
        case "planQueueClear": {
          taskManager.clearPlanQueue();
          const items = taskManager.listPlanItems();
          safePostMessage(panel, { command: "planQueueData", items });
          break;
        }
        default:
          break;
      }
    },
  );

  // 초기 로드
  safePostMessage(panel, {
    command: "planQueueData",
    items: taskManager.listPlanItems(),
  });

  return panel;
}
