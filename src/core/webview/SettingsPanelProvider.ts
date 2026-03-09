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
import { DEFAULT_OLLAMA_URL } from '../config/ApiDefaults';

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
  } catch (error) {
  }
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

      // 프로바이더별 API 키 조회 헬퍼
      const getProviderApiKey = (presetKey: string): string => {
        const aiModels = settingsManager.getServerSettings('ai_model');
        const preset = aiModels.find((s: any) => s.key === presetKey);
        const group = (preset as any)?.group || '';
        if (group) {
          return context.globalState.get<string>(`codepilot.apiKey.${group}`) || '';
        }
        return context.globalState.get<string>("codepilot.adminApiKey") || '';
      };

      switch (data.command) {
        case "getCurrentSettings": {
          try {
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
            const autoToolExecutionEnabled =
              await settingsManager.isAutoToolExecutionEnabled();
            const autoMcpToolExecutionEnabled =
              await settingsManager.isAutoMcpToolExecutionEnabled();
            const orchestrationEnabled =
              await settingsManager.isOrchestrationEnabled();
            const streamingEnabled =
              await settingsManager.isStreamingEnabled();
            const nativeToolCallingEnabled =
              await settingsManager.isNativeToolCallingEnabled();

            // 채팅 테마 설정 로드
            const config = vscode.workspace.getConfiguration('codepilot');
            const chatTheme = config.get<string>('chatTheme') || 'dark';

            // 확장 버전 로드 (context에서)
            const extension = vscode.extensions.getExtension('banya.codepilot');
            const extensionVersion = extension?.packageJSON?.version || '0.0.0';

            // 모델 라우팅 설정 로드 (타입, 모델명, API 키 여부)
            const compactorModelType = await stateManager.getCompactorModelType();
            const compactorModelName = await stateManager.getCompactorModelName();
            const compactorApiKeySet = await stateManager.hasCompactorApiKey();
            const commandModelType = await stateManager.getCommandModelType();
            const commandModelName = await stateManager.getCommandModelName();
            const commandApiKeySet = await stateManager.hasCommandApiKey();
            const intentModelType = await stateManager.getIntentModelType();
            const intentModelName = await stateManager.getIntentModelName();
            const intentApiKeySet = await stateManager.hasIntentApiKey();
            const errorFallbackModelType = await stateManager.getErrorFallbackModelType();
            const errorFallbackModelName = await stateManager.getErrorFallbackModelName();
            const errorFallbackApiKeySet = await stateManager.hasErrorFallbackApiKey();
            const completionModelType = await stateManager.getCompletionModelType();
            const completionModelName = await stateManager.getCompletionModelName();
            const completionApiKeySet = await stateManager.hasCompletionApiKey();
            const inlineCompletionEnabled = vscode.workspace.getConfiguration('codepilot')
              .get<boolean>('inlineCompletion', false);

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
              autoToolExecutionEnabled: autoToolExecutionEnabled, // 도구 자동 실행 설정 추가
              autoMcpToolExecutionEnabled: autoMcpToolExecutionEnabled, // MCP 도구 자동 실행 설정
              orchestrationEnabled: orchestrationEnabled || false, // 멀티 에이전트 설정
              streamingEnabled: streamingEnabled || false, // 스트리밍 설정 추가
              nativeToolCallingEnabled: nativeToolCallingEnabled, // 네이티브 툴 콜링 설정
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
              inlineCompletionEnabled: inlineCompletionEnabled,
              chatTheme: chatTheme,
              extensionVersion: extensionVersion,
              personalBuildTestSettings: context.globalState.get<any[]>('personalBuildTestSettings', []),
              errorReportingEnabled: config.get<boolean>('errorReportingEnabled', false),
              serverSettings: settingsManager.getAllServerSettings(),
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
              (await stateManager.getOllamaApiUrl()) ||
              DEFAULT_OLLAMA_URL;
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
              (await stateManager.getOllamaApiUrl()) ||
              DEFAULT_OLLAMA_URL;
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
              (await stateManager.getOllamaApiUrl()) ||
              DEFAULT_OLLAMA_URL;
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
              if ((compactorType.startsWith('group:') || compactorType === 'admin') && compactorModelName) {
                const aiModelSettings = settingsManager.getServerSettings('ai_model');
                const preset = aiModelSettings.find((s: any) => s.key === compactorModelName);
                if (preset && preset.value) {
                  const v = preset.value;
                  const ch = v.customHeaders || v.custom_headers || {};
                  const userApiKey = getProviderApiKey(compactorModelName);
                  const adminConfig = {
                    key: compactorModelName,
                    provider: v.provider || 'chat_completions',
                    model: v.model || v.model_name || '',
                    apiKey: userApiKey || v.api_key || v.apiKey || '',
                    endpoint: v.baseUrl || v.base_url || v.endpoint || v.apiEndpoint || '',
                    maxTokens: v.max_tokens || v.maxTokens || undefined,
                    maxOutputTokens: v.maxOutputTokens || v.max_output_tokens || undefined,
                    contextWindow: v.context_window || v.contextWindow || undefined,
                    enabled: v.enabled !== false,
                    authType: v.authType || v.auth_type || 'bearer',
                    authHeaderName: v.authHeaderName || v.auth_header_name || undefined,
                    customHeaders: typeof ch === 'string' ? JSON.parse(ch || '{}') : ch,
                    defaultTemperature: v.defaultTemperature ?? v.default_temperature ?? 0.7,
                    topP: v.topP ?? v.top_p ?? 0.9,
                    streamingSupported: v.streamingSupported ?? v.streaming_supported ?? true,
                  };
                  await stateManager.saveCompactorAdminConfig(JSON.stringify(adminConfig));
                }
              }
              safePostMessage(panel, { command: "compactorModelSaved" });
              const typeLabel = { ollama: "Ollama", admin: "Admin" }[compactorType as string] || compactorType;
              const modelInfo = compactorModelName ? ` (${compactorModelName})` : "";
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
              const typeLabel = { admin: "Admin" }[compactorApiType as string] || "";
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
              if ((commandType.startsWith('group:') || commandType === 'admin') && commandModelName) {
                const aiModelSettings = settingsManager.getServerSettings('ai_model');
                const preset = aiModelSettings.find((s: any) => s.key === commandModelName);
                if (preset && preset.value) {
                  const v = preset.value;
                  const ch = v.customHeaders || v.custom_headers || {};
                  const userApiKey = getProviderApiKey(commandModelName);
                  const adminConfig = {
                    key: commandModelName,
                    provider: v.provider || 'chat_completions',
                    model: v.model || v.model_name || '',
                    apiKey: userApiKey || v.api_key || v.apiKey || '',
                    endpoint: v.baseUrl || v.base_url || v.endpoint || v.apiEndpoint || '',
                    maxTokens: v.max_tokens || v.maxTokens || undefined,
                    maxOutputTokens: v.maxOutputTokens || v.max_output_tokens || undefined,
                    contextWindow: v.context_window || v.contextWindow || undefined,
                    enabled: v.enabled !== false,
                    authType: v.authType || v.auth_type || 'bearer',
                    authHeaderName: v.authHeaderName || v.auth_header_name || undefined,
                    customHeaders: typeof ch === 'string' ? JSON.parse(ch || '{}') : ch,
                    defaultTemperature: v.defaultTemperature ?? v.default_temperature ?? 0.7,
                    topP: v.topP ?? v.top_p ?? 0.9,
                    streamingSupported: v.streamingSupported ?? v.streaming_supported ?? true,
                  };
                  await stateManager.saveCommandAdminConfig(JSON.stringify(adminConfig));
                }
              }
              safePostMessage(panel, { command: "commandModelSaved" });
              const typeLabel = { ollama: "Ollama", admin: "Admin" }[commandType as string] || commandType;
              const modelInfo = commandModelName ? ` (${commandModelName})` : "";
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
              const typeLabel = { admin: "Admin" }[commandApiType as string] || "";
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
              if ((intentType.startsWith('group:') || intentType === 'admin') && intentModelName) {
                const aiModelSettings = settingsManager.getServerSettings('ai_model');
                const preset = aiModelSettings.find((s: any) => s.key === intentModelName);
                if (preset && preset.value) {
                  const v = preset.value;
                  const ch = v.customHeaders || v.custom_headers || {};
                  const userApiKey = getProviderApiKey(intentModelName);
                  const adminConfig = {
                    key: intentModelName,
                    provider: v.provider || 'chat_completions',
                    model: v.model || v.model_name || '',
                    apiKey: userApiKey || v.api_key || v.apiKey || '',
                    endpoint: v.baseUrl || v.base_url || v.endpoint || v.apiEndpoint || '',
                    maxTokens: v.max_tokens || v.maxTokens || undefined,
                    maxOutputTokens: v.maxOutputTokens || v.max_output_tokens || undefined,
                    contextWindow: v.context_window || v.contextWindow || undefined,
                    enabled: v.enabled !== false,
                    authType: v.authType || v.auth_type || 'bearer',
                    authHeaderName: v.authHeaderName || v.auth_header_name || undefined,
                    customHeaders: typeof ch === 'string' ? JSON.parse(ch || '{}') : ch,
                    defaultTemperature: v.defaultTemperature ?? v.default_temperature ?? 0.7,
                    topP: v.topP ?? v.top_p ?? 0.9,
                    streamingSupported: v.streamingSupported ?? v.streaming_supported ?? true,
                  };
                  await stateManager.saveIntentAdminConfig(JSON.stringify(adminConfig));
                }
              }
              safePostMessage(panel, { command: "intentModelSaved" });
              const typeLabel = { ollama: "Ollama", admin: "Admin" }[intentType as string] || intentType;
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
              const typeLabel = { admin: "Admin" }[intentApiType as string] || "";
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
                await stateManager.saveErrorFallbackModelName(errorFallbackModelName);
              }
              // group: 또는 admin 선택 시 AdminModelConfig 빌드 및 저장
              if ((errorFallbackType.startsWith('group:') || errorFallbackType === 'admin') && errorFallbackModelName) {
                const aiModelSettings = settingsManager.getServerSettings('ai_model');
                const preset = aiModelSettings.find((s: any) => s.key === errorFallbackModelName);
                if (preset && preset.value) {
                  const v = preset.value;
                  const ch = v.customHeaders || v.custom_headers || {};
                  const userApiKey = getProviderApiKey(errorFallbackModelName);
                  const adminConfig = {
                    key: errorFallbackModelName,
                    provider: v.provider || 'chat_completions',
                    model: v.model || v.model_name || '',
                    apiKey: userApiKey || v.api_key || v.apiKey || '',
                    endpoint: v.baseUrl || v.base_url || v.endpoint || v.apiEndpoint || '',
                    maxTokens: v.max_tokens || v.maxTokens || undefined,
                    maxOutputTokens: v.maxOutputTokens || v.max_output_tokens || undefined,
                    contextWindow: v.context_window || v.contextWindow || undefined,
                    enabled: v.enabled !== false,
                    authType: v.authType || v.auth_type || 'bearer',
                    authHeaderName: v.authHeaderName || v.auth_header_name || undefined,
                    customHeaders: typeof ch === 'string' ? JSON.parse(ch || '{}') : ch,
                    defaultTemperature: v.defaultTemperature ?? v.default_temperature ?? 0.7,
                    topP: v.topP ?? v.top_p ?? 0.9,
                    streamingSupported: v.streamingSupported ?? v.streaming_supported ?? true,
                  };
                  await stateManager.saveErrorFallbackAdminConfig(JSON.stringify(adminConfig));
                }
              }
              const modelInfo = errorFallbackModelName ? ` (${errorFallbackModelName})` : "";
              safePostMessage(panel, { command: "errorFallbackModelSaved", modelType: errorFallbackType, modelName: errorFallbackModelName });
              notificationService.showInfoMessage(`CODEPILOT: 에러 폴백 모델이 저장되었습니다.${modelInfo}`);
            }
          } catch (error: any) {
            safePostMessage(panel, { command: "errorFallbackModelSaveError", error: error.message });
          }
          break;
        case "saveErrorFallbackApiKey": // 에러 폴백 API 키 저장
          try {
            const errorFallbackApiKey = data.apiKey;
            if (errorFallbackApiKey) {
              await stateManager.saveErrorFallbackApiKey(errorFallbackApiKey);
              safePostMessage(panel, { command: "errorFallbackApiKeySaved" });
              notificationService.showInfoMessage("CODEPILOT: 에러 폴백 모델 API 키가 저장되었습니다.");
            }
          } catch (error: any) {
            safePostMessage(panel, { command: "errorFallbackApiKeySaveError", error: error.message });
          }
          break;
        case "clearErrorFallbackModel": // 에러 폴백 모델 초기화
          try {
            await stateManager.clearErrorFallbackModelConfig();
            safePostMessage(panel, { command: "errorFallbackModelCleared" });
            notificationService.showInfoMessage("CODEPILOT: 에러 폴백 모델이 초기화되었습니다. 메인 모델이 사용됩니다.");
          } catch (error: any) {
            safePostMessage(panel, { command: "errorFallbackModelClearError", error: error.message });
          }
          break;

        case "saveCompletionModel": // 소스코드 자동완성 모델 저장
          try {
            const completionType = data.modelType;
            const completionModelNameSave = data.modelName;
            if (completionType) {
              await stateManager.saveCompletionModelType(completionType);
              if (completionModelNameSave) {
                await stateManager.saveCompletionModelName(completionModelNameSave);
              }
              if ((completionType.startsWith('group:') || completionType === 'admin') && completionModelNameSave) {
                const aiModelSettings = settingsManager.getServerSettings('ai_model');
                const preset = aiModelSettings.find((s: any) => s.key === completionModelNameSave);
                if (preset && preset.value) {
                  const v = preset.value;
                  const ch = v.customHeaders || v.custom_headers || {};
                  const userApiKey = getProviderApiKey(completionModelNameSave);
                  const adminConfig = {
                    key: completionModelNameSave,
                    provider: v.provider || 'chat_completions',
                    model: v.model || v.model_name || '',
                    apiKey: userApiKey || v.api_key || v.apiKey || '',
                    endpoint: v.baseUrl || v.base_url || v.endpoint || v.apiEndpoint || '',
                    maxTokens: v.max_tokens || v.maxTokens || undefined,
                    maxOutputTokens: v.maxOutputTokens || v.max_output_tokens || undefined,
                    contextWindow: v.context_window || v.contextWindow || undefined,
                    enabled: v.enabled !== false,
                    authType: v.authType || v.auth_type || 'bearer',
                    authHeaderName: v.authHeaderName || v.auth_header_name || undefined,
                    customHeaders: typeof ch === 'string' ? JSON.parse(ch || '{}') : ch,
                    defaultTemperature: v.defaultTemperature ?? v.default_temperature ?? 0.7,
                    topP: v.topP ?? v.top_p ?? 0.9,
                    streamingSupported: v.streamingSupported ?? v.streaming_supported ?? true,
                  };
                  await stateManager.saveCompletionAdminConfig(JSON.stringify(adminConfig));
                }
              }
              safePostMessage(panel, { command: "completionModelSaved" });
              const typeLabel = { ollama: "Ollama", admin: "Admin" }[completionType as string] || completionType;
              const modelInfo = completionModelNameSave ? ` (${completionModelNameSave})` : "";
              notificationService.showInfoMessage(
                `CODEPILOT: 자동완성 모델이 ${typeLabel}${modelInfo}로 설정되었습니다.`,
              );
            } else {
              safePostMessage(panel, { command: "completionModelSaveError", error: "모델 타입을 선택해주세요." });
            }
          } catch (error: any) {
            safePostMessage(panel, { command: "completionModelSaveError", error: error.message });
            notificationService.showErrorMessage(`자동완성 모델 저장 오류: ${error.message}`);
          }
          break;

        case "saveCompletionApiKey": // 소스코드 자동완성 API 키 저장
          try {
            const completionApiKey = data.apiKey;
            const completionApiType = data.modelType;
            if (completionApiKey) {
              await stateManager.saveCompletionApiKey(completionApiKey);
              safePostMessage(panel, { command: "completionApiKeySaved" });
              const typeLabel = { admin: "Admin" }[completionApiType as string] || "";
              notificationService.showInfoMessage(
                `CODEPILOT: 자동완성 ${typeLabel} API 키가 저장되었습니다.`,
              );
            } else {
              safePostMessage(panel, { command: "completionApiKeySaveError", error: "API 키를 입력해주세요." });
            }
          } catch (error: any) {
            safePostMessage(panel, { command: "completionApiKeySaveError", error: error.message });
            notificationService.showErrorMessage(`자동완성 API 키 저장 오류: ${error.message}`);
          }
          break;

        case "clearCompletionModel": // 소스코드 자동완성 모델 초기화
          try {
            await stateManager.clearCompletionModelConfig();
            safePostMessage(panel, { command: "completionModelCleared" });
            notificationService.showInfoMessage("CODEPILOT: 자동완성 모델이 초기화되었습니다. 메인 모델이 사용됩니다.");
          } catch (error: any) {
            safePostMessage(panel, { command: "completionModelClearError", error: error.message });
          }
          break;

        case "setInlineCompletionEnabled": // 소스코드 자동완성 ON/OFF
          try {
            const inlineCompletionVal = data.enabled;
            if (typeof inlineCompletionVal === "boolean") {
              await vscode.workspace.getConfiguration('codepilot')
                .update('inlineCompletion', inlineCompletionVal, vscode.ConfigurationTarget.Global);
              safePostMessage(panel, { command: "inlineCompletionEnabledSet" });
            }
          } catch (error: any) {
            safePostMessage(panel, { command: "inlineCompletionEnabledSetError", error: error.message });
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
              if (chatViewProvider && typeof chatViewProvider.postMessageToWebview === 'function') {
                chatViewProvider.postMessageToWebview({
                  command: 'ollamaModelChanged',
                  model: ollamaModelToSave
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
              } catch { }
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
          if (typeof testRetryCountToSet === "number" && testRetryCountToSet >= 1 && testRetryCountToSet <= 10) {
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
              await settingsManager.updateAutoUpdateEnabled(autoUpdateEnabledToSet);
              // 과거 저장값과의 호환(필요 시 유지)
              try {
                await stateManager.saveAutoUpdateEnabled(autoUpdateEnabledToSet);
              } catch { }
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
              await settingsManager.updateAutoDeleteFilesEnabled(autoDeleteFilesEnabledToSet);
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
        case "setAutoMcpToolExecutionEnabled": { // MCP 도구 자동 실행 설정
          const autoMcpToolVal = data.enabled;
          if (typeof autoMcpToolVal === "boolean") {
            try {
              await settingsManager.updateAutoMcpToolExecutionEnabled(autoMcpToolVal);
              safePostMessage(panel, { command: "autoMcpToolExecutionEnabledSet" });
            } catch (error: any) {
              safePostMessage(panel, {
                command: "autoMcpToolExecutionEnabledSetError",
                error: error.message,
              });
              notificationService.showErrorMessage(`Error setting Auto MCP Tool Execution: ${error.message}`);
            }
          } else {
            safePostMessage(panel, {
              command: "autoMcpToolExecutionEnabledSetError",
              error: "Invalid setting",
            });
          }
          break;
        }
        case "setOrchestrationEnabled": { // 오케스트레이션 설정
          const orchestrationVal = data.enabled;
          if (typeof orchestrationVal === "boolean") {
            try {
              await settingsManager.updateOrchestrationEnabled(orchestrationVal);
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
              console.error('[PanelManager] 네이티브 툴 콜링 설정 저장 오류:', error);
            }
          }
          break;
        }
        case "saveAiModel": // AI 모델 저장 케이스 추가
          const aiModelToSave = data.aiModel || data.model;
          if (aiModelToSave && typeof aiModelToSave === "string") {
            try {
              // 관리자 모델 처리: "admin:key" 또는 "supported:key" 형식
              const isAdminModel = aiModelToSave.startsWith('admin:');
              const isSupportedModel = aiModelToSave.startsWith('supported:');
              let toRuntime = aiModelToSave;
              let modelName = aiModelToSave;

              if (isSupportedModel) {
                const presetKey = aiModelToSave.substring('supported:'.length);
                toRuntime = 'admin'; // 런타임은 AdminModelApi 사용

                // 서버 설정에서 지원 모델 config 추출
                const aiModelSettings = settingsManager.getServerSettings('ai_model');
                const presetSetting = aiModelSettings.find(
                  (s: any) => s.key === presetKey
                );

                if (presetSetting && presetSetting.value) {
                  const v = presetSetting.value;
                  const customHeaders = v.customHeaders || v.custom_headers || {};
                  // 프로바이더별 API 키 조회
                  const userApiKey = getProviderApiKey(presetKey);
                  const adminConfig = {
                    key: presetKey,
                    provider: v.provider || 'chat_completions',
                    model: v.model || v.model_name || '',
                    apiKey: userApiKey || v.api_key || v.apiKey || '',
                    endpoint: v.baseUrl || v.base_url || v.endpoint || v.apiEndpoint || '',
                    maxTokens: v.max_tokens || v.maxTokens || undefined,
                    maxOutputTokens: v.maxOutputTokens || v.max_output_tokens || undefined,
                    contextWindow: v.context_window || v.contextWindow || undefined,
                    enabled: v.enabled !== false,
                    authType: v.authType || v.auth_type || 'bearer',
                    authHeaderName: v.authHeaderName || v.auth_header_name || undefined,
                    customHeaders: typeof customHeaders === 'string' ? JSON.parse(customHeaders || '{}') : customHeaders,
                    defaultTemperature: v.defaultTemperature ?? v.default_temperature ?? 0.7,
                    topP: v.topP ?? v.top_p ?? 0.9,
                    streamingSupported: v.streamingSupported ?? v.streaming_supported ?? true,
                    nativeToolCallingSupported: (v.nativeToolCallingSupported ?? v.native_tool_calling_supported) === true || String(v.nativeToolCallingSupported ?? v.native_tool_calling_supported) === 'true',
                  };
                  await stateManager.saveAdminModelConfig(JSON.stringify(adminConfig));
                  modelName = adminConfig.model || presetKey;

                  // LLMManager에 즉시 적용
                  try {
                    const { LLMManager } = await import('../managers/model/LLMManager');
                    const llmManager = LLMManager.getInstance();
                    llmManager.setAdminModelConfig(adminConfig as any);
                    llmManager.setCurrentModel(AiModelType.ADMIN);
                  } catch { }

                  // 토큰 제한 동적 업데이트
                  try {
                    const { updateAdminTokenLimits } = await import('../../utils/tokenUtils');
                    updateAdminTokenLimits(adminConfig.contextWindow, adminConfig.maxOutputTokens || adminConfig.maxTokens);
                  } catch { }
                } else {
                  throw new Error(`지원 모델 '${presetKey}'을 찾을 수 없습니다.`);
                }
              } else if (isAdminModel) {
                const adminKey = aiModelToSave.substring('admin:'.length);
                toRuntime = 'admin';

                // 서버 설정에서 해당 관리자 모델 설정 추출
                const aiModelSettings = settingsManager.getServerSettings('ai_model');
                const adminSetting = aiModelSettings.find(
                  (s: any) => s.key === adminKey
                );

                if (adminSetting && adminSetting.value) {
                  const v = adminSetting.value;
                  const customHeaders = v.customHeaders || v.custom_headers || {};
                  const userApiKeyForAdmin = getProviderApiKey(adminKey);
                  const adminConfig = {
                    key: adminKey,
                    provider: v.provider || 'chat_completions',
                    model: v.model || v.model_name || '',
                    apiKey: userApiKeyForAdmin || v.api_key || v.apiKey || '',
                    endpoint: v.baseUrl || v.base_url || v.endpoint || v.apiEndpoint || '',
                    maxTokens: v.max_tokens || v.maxTokens || undefined,
                    maxOutputTokens: v.maxOutputTokens || v.max_output_tokens || undefined,
                    contextWindow: v.context_window || v.contextWindow || undefined,
                    enabled: v.enabled !== false,
                    authType: v.authType || v.auth_type || 'bearer',
                    authHeaderName: v.authHeaderName || v.auth_header_name || undefined,
                    customHeaders: typeof customHeaders === 'string' ? JSON.parse(customHeaders || '{}') : customHeaders,
                    defaultTemperature: v.defaultTemperature ?? v.default_temperature ?? 0.7,
                    topP: v.topP ?? v.top_p ?? 0.9,
                    streamingSupported: v.streamingSupported ?? v.streaming_supported ?? true,
                    nativeToolCallingSupported: (v.nativeToolCallingSupported ?? v.native_tool_calling_supported) === true || String(v.nativeToolCallingSupported ?? v.native_tool_calling_supported) === 'true',
                  };
                  // 관리자 모델 설정 저장
                  await stateManager.saveAdminModelConfig(JSON.stringify(adminConfig));
                  modelName = adminConfig.model || adminKey;

                  // LLMManager에 즉시 적용
                  try {
                    const { LLMManager } = await import('../managers/model/LLMManager');
                    const llmManager = LLMManager.getInstance();
                    llmManager.setAdminModelConfig(adminConfig as any);
                    llmManager.setCurrentModel(AiModelType.ADMIN);
                  } catch { }

                  // 토큰 제한 동적 업데이트
                  try {
                    const { updateAdminTokenLimits } = await import('../../utils/tokenUtils');
                    updateAdminTokenLimits(adminConfig.contextWindow, adminConfig.maxOutputTokens || adminConfig.maxTokens);
                  } catch { }
                } else {
                  throw new Error(`관리자 모델 '${adminKey}'을 찾을 수 없습니다.`);
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
                  const { LLMManager } = await import('../managers/model/LLMManager');
                  const llmManager = LLMManager.getInstance();
                  const modelTypeMap: Record<string, AiModelType> = {
                    'ollama': AiModelType.OLLAMA,
                    'admin': AiModelType.ADMIN,
                  };
                  const runtimeType = modelTypeMap[toRuntime];
                  if (runtimeType) {
                    llmManager.setCurrentModel(runtimeType);
                  }
                } catch { }
              }

              safePostMessage(panel, { command: "aiModelSaved" });

              // 채팅 패널에도 모델 변경 알림
              if (chatViewProvider && typeof chatViewProvider.postMessageToWebview === 'function') {
                let chatModel = aiModelToSave;
                // Ollama인 경우 실제 ollama 모델명을 보냄 (채팅 드롭박스 매칭용)
                if (aiModelToSave === 'ollama') {
                  const ollamaModel = await stateManager.getOllamaModel();
                  chatModel = ollamaModel || 'ollama';
                }

                chatViewProvider.postMessageToWebview({
                  command: 'ollamaModelChanged',
                  model: chatModel
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
              (await stateManager.getOllamaApiUrl()) ||
              DEFAULT_OLLAMA_URL;
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
                (await stateManager.getOllamaApiUrl()) ||
                DEFAULT_OLLAMA_URL;
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
            const autoToolExecutionEnabled =
              await settingsManager.isAutoToolExecutionEnabled();
            const autoMcpToolExecutionEnabled =
              await settingsManager.isAutoMcpToolExecutionEnabled();
            const orchestrationEnabled =
              await settingsManager.isOrchestrationEnabled();
            const streamingEnabled =
              await settingsManager.isStreamingEnabled();
            const nativeToolCallingEnabled2 =
              await settingsManager.isNativeToolCallingEnabled();
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
              autoToolExecutionEnabled: autoToolExecutionEnabled ?? true,
              autoMcpToolExecutionEnabled: autoMcpToolExecutionEnabled ?? false,
              orchestrationEnabled: orchestrationEnabled || false,
              streamingEnabled: streamingEnabled || false,
              nativeToolCallingEnabled: nativeToolCallingEnabled2,
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
        case "uploadAgentPolicyStableVersion": // Stable Version Markdown 저장
          try {
            const mdContent = data.mdContent || data.xmlContent; // 호환성을 위해 xmlContent도 허용
            if (mdContent && typeof mdContent === "string") {
              // 워크스페이스 루트 가져오기
              const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
              if (!workspaceRoot) {
                throw new Error("워크스페이스가 열려있지 않습니다.");
              }

              // storageUri/rules 디렉토리 생성
              const agentDir = path.join(context.storageUri!.fsPath, "rules");
              const agentDirUri = vscode.Uri.file(agentDir);
              await vscode.workspace.fs.createDirectory(agentDirUri);

              // 파일 저장
              const filePath = path.join(agentDir, "stable-version.md");
              const fileUri = vscode.Uri.file(filePath);
              await vscode.workspace.fs.writeFile(fileUri, Buffer.from(mdContent, "utf8"));

              // 메모리에도 저장 (호환성)
              await stateManager.saveAgentPolicyStableVersion(mdContent);
              
              safePostMessage(panel, { command: "agentPolicyStableVersionSaved" });
              notificationService.showInfoMessage(
                `CODEPILOT: Stable Version Markdown saved to ${filePath}`,
              );
            } else {
              safePostMessage(panel, {
                command: "agentPolicyStableVersionSaveError",
                error: "Invalid Markdown content",
              });
              notificationService.showErrorMessage(
                "Invalid Markdown content provided.",
              );
            }
          } catch (error: any) {
            safePostMessage(panel, {
              command: "agentPolicyStableVersionSaveError",
              error: error.message,
            });
            notificationService.showErrorMessage(
              `Error saving Stable Version Markdown: ${error.message}`,
            );
          }
          break;
        case "uploadAgentPolicyCodingStyle": // Coding Style Markdown 저장
          try {
            const mdContent = data.mdContent || data.xmlContent; // 호환성을 위해 xmlContent도 허용
            if (mdContent && typeof mdContent === "string") {
              // 워크스페이스 루트 가져오기
              const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
              if (!workspaceRoot) {
                throw new Error("워크스페이스가 열려있지 않습니다.");
              }

              // storageUri/rules 디렉토리 생성
              const agentDir = path.join(context.storageUri!.fsPath, "rules");
              const agentDirUri = vscode.Uri.file(agentDir);
              await vscode.workspace.fs.createDirectory(agentDirUri);

              // 파일 저장
              const filePath = path.join(agentDir, "coding-style.md");
              const fileUri = vscode.Uri.file(filePath);
              await vscode.workspace.fs.writeFile(fileUri, Buffer.from(mdContent, "utf8"));

              // 메모리에도 저장 (호환성)
              await stateManager.saveAgentPolicyCodingStyle(mdContent);
              
              safePostMessage(panel, { command: "agentPolicyCodingStyleSaved" });
              notificationService.showInfoMessage(
                `CODEPILOT: Coding Style Markdown saved to ${filePath}`,
              );
            } else {
              safePostMessage(panel, {
                command: "agentPolicyCodingStyleSaveError",
                error: "Invalid Markdown content",
              });
              notificationService.showErrorMessage(
                "Invalid Markdown content provided.",
              );
            }
          } catch (error: any) {
            safePostMessage(panel, {
              command: "agentPolicyCodingStyleSaveError",
              error: error.message,
            });
            notificationService.showErrorMessage(
              `Error saving Coding Style Markdown: ${error.message}`,
            );
          }
          break;
        case "uploadAgentPolicyProjectArchitecture": // Project Architecture Markdown 저장
          try {
            const mdContent = data.mdContent || data.xmlContent; // 호환성을 위해 xmlContent도 허용
            if (mdContent && typeof mdContent === "string") {
              // 워크스페이스 루트 가져오기
              const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
              if (!workspaceRoot) {
                throw new Error("워크스페이스가 열려있지 않습니다.");
              }

              // storageUri/rules 디렉토리 생성
              const agentDir = path.join(context.storageUri!.fsPath, "rules");
              const agentDirUri = vscode.Uri.file(agentDir);
              await vscode.workspace.fs.createDirectory(agentDirUri);

              // 파일 저장
              const filePath = path.join(agentDir, "project-architecture.md");
              const fileUri = vscode.Uri.file(filePath);
              await vscode.workspace.fs.writeFile(fileUri, Buffer.from(mdContent, "utf8"));

              // 메모리에도 저장 (호환성)
              await stateManager.saveAgentPolicyProjectArchitecture(mdContent);
              
              safePostMessage(panel, { command: "agentPolicyProjectArchitectureSaved" });
              notificationService.showInfoMessage(
                `CODEPILOT: Project Architecture Markdown saved to ${filePath}`,
              );
            } else {
              safePostMessage(panel, {
                command: "agentPolicyProjectArchitectureSaveError",
                error: "Invalid Markdown content",
              });
              notificationService.showErrorMessage(
                "Invalid Markdown content provided.",
              );
            }
          } catch (error: any) {
            safePostMessage(panel, {
              command: "agentPolicyProjectArchitectureSaveError",
              error: error.message,
            });
            notificationService.showErrorMessage(
              `Error saving Project Architecture Markdown: ${error.message}`,
            );
          }
          break;
        case "uploadAgentPolicyDependencyPolicy": // Dependency Policy Markdown 저장
          try {
            const mdContent = data.mdContent || data.xmlContent; // 호환성을 위해 xmlContent도 허용
            if (mdContent && typeof mdContent === "string") {
              // 워크스페이스 루트 가져오기
              const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
              if (!workspaceRoot) {
                throw new Error("워크스페이스가 열려있지 않습니다.");
              }

              // storageUri/rules 디렉토리 생성
              const agentDir = path.join(context.storageUri!.fsPath, "rules");
              const agentDirUri = vscode.Uri.file(agentDir);
              await vscode.workspace.fs.createDirectory(agentDirUri);

              // 파일 저장
              const filePath = path.join(agentDir, "dependency-policy.md");
              const fileUri = vscode.Uri.file(filePath);
              await vscode.workspace.fs.writeFile(fileUri, Buffer.from(mdContent, "utf8"));

              // 메모리에도 저장 (호환성)
              await stateManager.saveAgentPolicyDependencyPolicy(mdContent);
              
              safePostMessage(panel, { command: "agentPolicyDependencyPolicySaved" });
              notificationService.showInfoMessage(
                `CODEPILOT: Dependency Policy Markdown saved to ${filePath}`,
              );
            } else {
              safePostMessage(panel, {
                command: "agentPolicyDependencyPolicySaveError",
                error: "Invalid Markdown content",
              });
              notificationService.showErrorMessage(
                "Invalid Markdown content provided.",
              );
            }
          } catch (error: any) {
            safePostMessage(panel, {
              command: "agentPolicyDependencyPolicySaveError",
              error: error.message,
            });
            notificationService.showErrorMessage(
              `Error saving Dependency Policy Markdown: ${error.message}`,
            );
          }
          break;
        case "uploadAgentPolicyDbPolicy": // DB Policy Markdown 저장
          try {
            const mdContent = data.mdContent || data.xmlContent; // 호환성을 위해 xmlContent도 허용
            if (mdContent && typeof mdContent === "string") {
              // 워크스페이스 루트 가져오기
              const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
              if (!workspaceRoot) {
                throw new Error("워크스페이스가 열려있지 않습니다.");
              }

              // storageUri/rules 디렉토리 생성
              const agentDir = path.join(context.storageUri!.fsPath, "rules");
              const agentDirUri = vscode.Uri.file(agentDir);
              await vscode.workspace.fs.createDirectory(agentDirUri);

              // 파일 저장
              const filePath = path.join(agentDir, "db-policy.md");
              const fileUri = vscode.Uri.file(filePath);
              await vscode.workspace.fs.writeFile(fileUri, Buffer.from(mdContent, "utf8"));

              // 메모리에도 저장 (호환성)
              await stateManager.saveAgentPolicyDbPolicy(mdContent);
              
              safePostMessage(panel, { command: "agentPolicyDbPolicySaved" });
              notificationService.showInfoMessage(
                `CODEPILOT: DB Policy Markdown saved to ${filePath}`,
              );
            } else {
              safePostMessage(panel, {
                command: "agentPolicyDbPolicySaveError",
                error: "Invalid Markdown content",
              });
              notificationService.showErrorMessage(
                "Invalid Markdown content provided.",
              );
            }
          } catch (error: any) {
            safePostMessage(panel, {
              command: "agentPolicyDbPolicySaveError",
              error: error.message,
            });
            notificationService.showErrorMessage(
              `Error saving DB Policy Markdown: ${error.message}`,
            );
          }
          break;
        case "getAgentPolicyStableVersion": // Stable Version Markdown 로드
          try {
            const mdContent = await stateManager.getAgentPolicyStableVersion();
            safePostMessage(panel, {
              command: "agentPolicyStableVersionLoaded",
              mdContent: mdContent || "",
              xmlContent: mdContent || "", // 호환성을 위해 xmlContent도 포함
            });
          } catch (error: any) {
            console.error("Error loading Stable Version Markdown:", error);
            safePostMessage(panel, {
              command: "agentPolicyStableVersionLoadError",
              error: error.message,
            });
          }
          break;
        case "getAgentPolicyCodingStyle": // Coding Style Markdown 로드
          try {
            const mdContent = await stateManager.getAgentPolicyCodingStyle();
            safePostMessage(panel, {
              command: "agentPolicyCodingStyleLoaded",
              mdContent: mdContent || "",
              xmlContent: mdContent || "", // 호환성을 위해 xmlContent도 포함
            });
          } catch (error: any) {
            console.error("Error loading Coding Style Markdown:", error);
            safePostMessage(panel, {
              command: "agentPolicyCodingStyleLoadError",
              error: error.message,
            });
          }
          break;
        case "getAgentPolicyProjectArchitecture": // Project Architecture Markdown 로드
          try {
            const mdContent = await stateManager.getAgentPolicyProjectArchitecture();
            safePostMessage(panel, {
              command: "agentPolicyProjectArchitectureLoaded",
              mdContent: mdContent || "",
              xmlContent: mdContent || "", // 호환성을 위해 xmlContent도 포함
            });
          } catch (error: any) {
            console.error("Error loading Project Architecture Markdown:", error);
            safePostMessage(panel, {
              command: "agentPolicyProjectArchitectureLoadError",
              error: error.message,
            });
          }
          break;
        case "getAgentPolicyDependencyPolicy": // Dependency Policy Markdown 로드
          try {
            const mdContent = await stateManager.getAgentPolicyDependencyPolicy();
            safePostMessage(panel, {
              command: "agentPolicyDependencyPolicyLoaded",
              mdContent: mdContent || "",
              xmlContent: mdContent || "", // 호환성을 위해 xmlContent도 포함
            });
          } catch (error: any) {
            console.error("Error loading Dependency Policy Markdown:", error);
            safePostMessage(panel, {
              command: "agentPolicyDependencyPolicyLoadError",
              error: error.message,
            });
          }
          break;
        case "getAgentPolicyDbPolicy": // DB Policy Markdown 로드
          try {
            const mdContent = await stateManager.getAgentPolicyDbPolicy();
            safePostMessage(panel, {
              command: "agentPolicyDbPolicyLoaded",
              mdContent: mdContent || "",
              xmlContent: mdContent || "", // 호환성을 위해 xmlContent도 포함
            });
          } catch (error: any) {
            console.error("Error loading DB Policy Markdown:", error);
            safePostMessage(panel, {
              command: "agentPolicyDbPolicyLoadError",
              error: error.message,
            });
          }
          break;
        case "deleteAgentPolicyStableVersion": // Stable Version Markdown 삭제
          try {
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (workspaceRoot) {
              const filePath = path.join(context.storageUri!.fsPath, "rules", "stable-version.md");
              const fileUri = vscode.Uri.file(filePath);
              try {
                await vscode.workspace.fs.delete(fileUri);
              } catch (e: any) {
                // 파일이 없으면 무시
                if (e.code !== "FileNotFound") throw e;
              }
            }
            await stateManager.deleteAgentPolicyStableVersion();
            safePostMessage(panel, { command: "agentPolicyStableVersionDeleted" });
            notificationService.showInfoMessage("CODEPILOT: Stable Version Markdown deleted.");
          } catch (error: any) {
            safePostMessage(panel, {
              command: "agentPolicyStableVersionDeleteError",
              error: error.message,
            });
            notificationService.showErrorMessage(`Error deleting Stable Version Markdown: ${error.message}`);
          }
          break;
        case "deleteAgentPolicyCodingStyle": // Coding Style Markdown 삭제
          try {
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (workspaceRoot) {
              const filePath = path.join(context.storageUri!.fsPath, "rules", "coding-style.md");
              const fileUri = vscode.Uri.file(filePath);
              try {
                await vscode.workspace.fs.delete(fileUri);
              } catch (e: any) {
                // 파일이 없으면 무시
                if (e.code !== "FileNotFound") throw e;
              }
            }
            await stateManager.deleteAgentPolicyCodingStyle();
            safePostMessage(panel, { command: "agentPolicyCodingStyleDeleted" });
            notificationService.showInfoMessage("CODEPILOT: Coding Style Markdown deleted.");
          } catch (error: any) {
            safePostMessage(panel, {
              command: "agentPolicyCodingStyleDeleteError",
              error: error.message,
            });
            notificationService.showErrorMessage(`Error deleting Coding Style Markdown: ${error.message}`);
          }
          break;
        case "deleteAgentPolicyProjectArchitecture": // Project Architecture Markdown 삭제
          try {
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (workspaceRoot) {
              const filePath = path.join(context.storageUri!.fsPath, "rules", "project-architecture.md");
              const fileUri = vscode.Uri.file(filePath);
              try {
                await vscode.workspace.fs.delete(fileUri);
              } catch (e: any) {
                // 파일이 없으면 무시
                if (e.code !== "FileNotFound") throw e;
              }
            }
            await stateManager.deleteAgentPolicyProjectArchitecture();
            safePostMessage(panel, { command: "agentPolicyProjectArchitectureDeleted" });
            notificationService.showInfoMessage("CODEPILOT: Project Architecture Markdown deleted.");
          } catch (error: any) {
            safePostMessage(panel, {
              command: "agentPolicyProjectArchitectureDeleteError",
              error: error.message,
            });
            notificationService.showErrorMessage(`Error deleting Project Architecture Markdown: ${error.message}`);
          }
          break;
        case "deleteAgentPolicyDependencyPolicy": // Dependency Policy Markdown 삭제
          try {
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (workspaceRoot) {
              const filePath = path.join(context.storageUri!.fsPath, "rules", "dependency-policy.md");
              const fileUri = vscode.Uri.file(filePath);
              try {
                await vscode.workspace.fs.delete(fileUri);
              } catch (e: any) {
                // 파일이 없으면 무시
                if (e.code !== "FileNotFound") throw e;
              }
            }
            await stateManager.deleteAgentPolicyDependencyPolicy();
            safePostMessage(panel, { command: "agentPolicyDependencyPolicyDeleted" });
            notificationService.showInfoMessage("CODEPILOT: Dependency Policy Markdown deleted.");
          } catch (error: any) {
            safePostMessage(panel, {
              command: "agentPolicyDependencyPolicyDeleteError",
              error: error.message,
            });
            notificationService.showErrorMessage(`Error deleting Dependency Policy Markdown: ${error.message}`);
          }
          break;
        case "deleteAgentPolicyDbPolicy": // DB Policy Markdown 삭제
          try {
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (workspaceRoot) {
              const filePath = path.join(context.storageUri!.fsPath, "rules", "db-policy.md");
              const fileUri = vscode.Uri.file(filePath);
              try {
                await vscode.workspace.fs.delete(fileUri);
              } catch (e: any) {
                // 파일이 없으면 무시
                if (e.code !== "FileNotFound") throw e;
              }
            }
            await stateManager.deleteAgentPolicyDbPolicy();
            safePostMessage(panel, { command: "agentPolicyDbPolicyDeleted" });
            notificationService.showInfoMessage("CODEPILOT: DB Policy Markdown deleted.");
          } catch (error: any) {
            safePostMessage(panel, {
              command: "agentPolicyDbPolicyDeleteError",
              error: error.message,
            });
            notificationService.showErrorMessage(`Error deleting DB Policy Markdown: ${error.message}`);
          }
          break;
        // ===== AgentPolicy 다중 파일 관리 =====
        case "addAgentPolicyFile": // 카테고리에 파일 추가
          try {
            const { category, fileName, content } = data;
            if (!category || !fileName || !content) {
              throw new Error("카테고리, 파일명, 내용이 필요합니다.");
            }

            // 카테고리 검증
            const validCategories = ['stable-version', 'coding-style', 'project-architecture', 'dependency-policy', 'db-policy'];
            if (!validCategories.includes(category)) {
              throw new Error(`유효하지 않은 카테고리: ${category}`);
            }

            // 워크스페이스 루트 가져오기
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspaceRoot) {
              throw new Error("워크스페이스가 열려있지 않습니다.");
            }

            // storageUri/rules/{category} 디렉토리 생성
            const categoryDir = path.join(context.storageUri!.fsPath, "rules", category);
            const categoryDirUri = vscode.Uri.file(categoryDir);
            await vscode.workspace.fs.createDirectory(categoryDirUri);

            // 파일명 정리 (확장자 추가)
            let safeFileName = fileName.replace(/[<>:"/\\|?*]/g, '_');
            if (!safeFileName.endsWith('.md') && !safeFileName.endsWith('.markdown')) {
              safeFileName += '.md';
            }

            // 파일 저장
            const filePath = path.join(categoryDir, safeFileName);
            const fileUri = vscode.Uri.file(filePath);
            await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, "utf8"));

            safePostMessage(panel, {
              command: "agentPolicyFileAdded",
              category,
              fileName: safeFileName
            });
            notificationService.showInfoMessage(
              `CODEPILOT: ${safeFileName} saved to skills/${category}/`,
            );
          } catch (error: any) {
            safePostMessage(panel, {
              command: "agentPolicyFileAddError",
              category: data.category,
              error: error.message,
            });
            notificationService.showErrorMessage(
              `Error adding Agent Policy file: ${error.message}`,
            );
          }
          break;

        case "addPathAgentPolicy": // 경로 입력으로 파일 추가
          try {
            const { category, filePath: srcFilePath } = data;
            const validCategories = ['stable-version', 'coding-style', 'project-architecture', 'dependency-policy', 'db-policy'];
            if (!category || !validCategories.includes(category)) {
              throw new Error(`유효하지 않은 카테고리: ${category}`);
            }
            if (!srcFilePath || typeof srcFilePath !== 'string') {
              throw new Error("파일 경로가 필요합니다.");
            }

            // 파일 읽기
            const srcUri = vscode.Uri.file(srcFilePath);
            const rawBytes = await vscode.workspace.fs.readFile(srcUri);
            const content = Buffer.from(rawBytes).toString('utf8');

            // 파일명 추출 및 정리
            const baseName = path.basename(srcFilePath);
            if (!baseName.endsWith('.md') && !baseName.endsWith('.markdown')) {
              throw new Error("Markdown 파일(.md, .markdown)만 추가할 수 있습니다.");
            }
            let safeFileName = baseName.replace(/[<>:"/\\|?*]/g, '_');

            // storageUri/rules/{category} 디렉토리 생성
            const categoryDir = path.join(context.storageUri!.fsPath, "rules", category);
            await vscode.workspace.fs.createDirectory(vscode.Uri.file(categoryDir));

            // 파일 저장
            const destPath = path.join(categoryDir, safeFileName);
            await vscode.workspace.fs.writeFile(vscode.Uri.file(destPath), Buffer.from(content, 'utf8'));

            safePostMessage(panel, {
              command: "agentPolicyFileAdded",
              category,
              fileName: safeFileName,
            });
            notificationService.showInfoMessage(
              `CODEPILOT: ${safeFileName} saved to skills/${category}/`,
            );
          } catch (error: any) {
            safePostMessage(panel, {
              command: "agentPolicyFileAddError",
              category: data.category,
              error: error.message,
            });
            notificationService.showErrorMessage(
              `Error adding Agent Policy file from path: ${error.message}`,
            );
          }
          break;

        case "deleteAgentPolicyFile": // 카테고리에서 특정 파일 삭제
          try {
            const { category, fileName, isLegacy } = data;

            if (!category || !fileName) {
              throw new Error("카테고리와 파일명이 필요합니다.");
            }

            // 워크스페이스 루트 가져오기
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspaceRoot) {
              throw new Error("워크스페이스가 열려있지 않습니다.");
            }

            // 파일명에 확장자가 없으면 .md 추가
            let targetFileName = fileName;
            if (!targetFileName.endsWith('.md') && !targetFileName.endsWith('.markdown')) {
              targetFileName += '.md';
            }

            let deleted = false;

            if (isLegacy) {
              // 레거시 파일: .agent/rules/{fileName}
              const legacyPath = path.join(context.storageUri!.fsPath, "rules", targetFileName);
              try {
                const legacyUri = vscode.Uri.file(legacyPath);
                await vscode.workspace.fs.stat(legacyUri);
                await vscode.workspace.fs.delete(legacyUri);
                deleted = true;
              } catch (e: any) {
                console.warn(`[SettingsPanel] Legacy file not found: ${legacyPath}`, e.message);
              }
            } else {
              // 새 구조 파일: .agent/rules/{category}/{fileName}
              const newStructurePath = path.join(context.storageUri!.fsPath, "rules", category, targetFileName);
              try {
                const newUri = vscode.Uri.file(newStructurePath);
                await vscode.workspace.fs.stat(newUri);
                await vscode.workspace.fs.delete(newUri);
                deleted = true;
              } catch (e: any) {
                console.warn(`[SettingsPanel] New structure file not found: ${newStructurePath}`, e.message);
              }
            }

            if (!deleted) {
              throw new Error(`파일을 찾을 수 없습니다: ${targetFileName}`);
            }

            safePostMessage(panel, {
              command: "agentPolicyFileDeleted",
              category,
              fileName: targetFileName
            });
            notificationService.showInfoMessage(
              `CODEPILOT: ${targetFileName} deleted`,
            );
          } catch (error: any) {
            console.error(`[SettingsPanel] deleteAgentPolicyFile error:`, error);
            safePostMessage(panel, {
              command: "agentPolicyFileDeleteError",
              category: data.category,
              error: error.message,
            });
            notificationService.showErrorMessage(
              `Error deleting Agent Policy file: ${error.message}`,
            );
          }
          break;

        case "listAllAgentPolicyFiles": // 모든 카테고리의 파일 목록 조회
          try {
            const categories = ['stable-version', 'coding-style', 'project-architecture', 'dependency-policy', 'db-policy'];
            const allFiles: Record<string, string[]> = {};

            for (const category of categories) {
              allFiles[category] = [];

              const categoryDir = path.join(context.storageUri!.fsPath, "rules", category);

              // 디렉토리가 존재하면 파일 목록 조회
              try {
                const categoryDirUri = vscode.Uri.file(categoryDir);
                // stat()으로 존재 여부 먼저 확인 — readDirectory 전에 ENOENT 내부 로그 방지
                try {
                  await vscode.workspace.fs.stat(categoryDirUri);
                } catch {
                  // 디렉토리 없음 — 레거시 파일 확인으로 넘어감
                  throw Object.assign(new Error('Dir not found'), { code: 'FileNotFound' });
                }
                const entries = await vscode.workspace.fs.readDirectory(categoryDirUri);

                for (const [name, type] of entries) {
                  if (type === vscode.FileType.File && (name.endsWith('.md') || name.endsWith('.markdown'))) {
                    allFiles[category].push(name);
                  }
                }
              } catch (e: any) {
                // 디렉토리가 없으면 레거시 단일 파일 확인
                if (e.code === 'FileNotFound' || e.code === 'ENOENT') {
                  const legacyFileMap: Record<string, string> = {
                    'stable-version': 'stable-version.md',
                    'coding-style': 'coding-style.md',
                    'project-architecture': 'project-architecture.md',
                    'dependency-policy': 'dependency-policy.md',
                    'db-policy': 'db-policy.md'
                  };
                  const legacyFile = legacyFileMap[category];
                  if (legacyFile) {
                    const legacyPath = path.join(context.storageUri!.fsPath, "rules", legacyFile);
                    try {
                      await vscode.workspace.fs.stat(vscode.Uri.file(legacyPath));
                      allFiles[category].push(legacyFile + ' (레거시)');
                    } catch {
                      // 레거시 파일도 없음
                    }
                  }
                }
              }
            }

            safePostMessage(panel, {
              command: "allAgentPolicyFilesList",
              files: allFiles
            });
          } catch (error: any) {
            safePostMessage(panel, {
              command: "allAgentPolicyFilesListError",
              error: error.message
            });
          }
          break;
        case "saveChatTheme": // 채팅 테마 저장
          try {
            const theme = data.theme;
            if (theme && ['dark', 'light', 'auto'].includes(theme)) {
              const config = vscode.workspace.getConfiguration('codepilot');
              await config.update('chatTheme', theme, vscode.ConfigurationTarget.Global);
              safePostMessage(panel, {
                command: 'chatThemeSaved',
                theme: theme
              });
            }
          } catch (error: any) {
            console.error('[SettingsPanel] Failed to save chat theme:', error);
            safePostMessage(panel, {
              command: 'chatThemeSaveError',
              error: error.message
            });
          }
          break;
        case "getChatTheme": // 채팅 테마 로드
          try {
            const config = vscode.workspace.getConfiguration('codepilot');
            const theme = config.get<string>('chatTheme') || 'dark';
            safePostMessage(panel, {
              command: 'chatTheme',
              theme: theme
            });
          } catch (error: any) {
            console.error('[SettingsPanel] Failed to get chat theme:', error);
            safePostMessage(panel, {
              command: 'chatTheme',
              theme: 'dark'
            });
          }
          break;
        // ===== MCP 서버 설정 =====
        case "getMcpServers": // MCP 서버 목록 로드
          try {
            const servers = await stateManager.getMcpServers();
            const { MCPManager: MCPMgrGet } = await import('../mcp/MCPManager');
            const mcpMgrGet = MCPMgrGet.getInstance();
            const adminServers = mcpMgrGet.getAdminServers();
            // 라이브 연결 상태를 MCPManager에서 병합 (autoConnect 결과 반영)
            const liveServers = mcpMgrGet.getServers();
            const mergedServers = servers.map((s: any) => {
              const live = liveServers.find((ls: any) => ls.id === s.id);
              if (live) {
                return { ...s, status: live.status, tools: live.tools || s.tools };
              }
              return s;
            });
            safePostMessage(panel, {
              command: 'mcpServers',
              servers: mergedServers,
              adminServers: adminServers,
            });
          } catch (error: any) {
            console.error('[SettingsPanel] Failed to get MCP servers:', error);
            safePostMessage(panel, {
              command: 'mcpServers',
              servers: [],
              adminServers: [],
              error: error.message
            });
          }
          break;
        case "addMcpServer": // MCP 서버 추가
          try {
            const server = data.server;
            if (server && server.name) {
              await stateManager.addMcpServer(server);
              safePostMessage(panel, {
                command: 'mcpServerAdded',
                server: server
              });
              notificationService.showInfoMessage(`CODEPILOT: MCP 서버 "${server.name}" 추가됨`);
            } else {
              throw new Error('서버 정보가 올바르지 않습니다.');
            }
          } catch (error: any) {
            console.error('[SettingsPanel] Failed to add MCP server:', error);
            safePostMessage(panel, {
              command: 'mcpServerAddError',
              error: error.message
            });
          }
          break;
        case "updateMcpServer": // MCP 서버 업데이트
          try {
            const server = data.server;
            if (server && server.id) {
              await stateManager.updateMcpServer(server.id, server);
              safePostMessage(panel, {
                command: 'mcpServerUpdated',
                server: server
              });
              notificationService.showInfoMessage(`CODEPILOT: MCP 서버 "${server.name}" 업데이트됨`);
            } else {
              throw new Error('서버 정보가 올바르지 않습니다.');
            }
          } catch (error: any) {
            console.error('[SettingsPanel] Failed to update MCP server:', error);
            safePostMessage(panel, {
              command: 'mcpServerUpdateError',
              error: error.message
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
                  command: 'mcpServerRemoved',
                  serverId: serverId
                });
                notificationService.showInfoMessage('CODEPILOT: MCP 서버 삭제됨');
              } else {
                throw new Error('서버를 찾을 수 없습니다.');
              }
            } else {
              throw new Error('서버 ID가 필요합니다.');
            }
          } catch (error: any) {
            console.error('[SettingsPanel] Failed to remove MCP server:', error);
            safePostMessage(panel, {
              command: 'mcpServerRemoveError',
              error: error.message
            });
          }
          break;
        case "toggleMcpServer": // MCP 서버 활성화/비활성화 (개인 서버)
          try {
            const toggleServerId = data.serverId;
            const enabled = data.enabled;
            if (!toggleServerId) {
              throw new Error('서버 ID가 필요합니다.');
            }

            const { MCPManager: MCPMgr } = await import('../mcp/MCPManager');
            const mcpMgr = MCPMgr.getInstance();

            let resultStatus = 'disconnected';
            let resultTools: any[] = [];

            // updateServer가 메모리 업데이트 → disconnect → save를 일관되게 처리
            const updated = await mcpMgr.updateServer(toggleServerId, { enabled });
            if (updated) {
              resultStatus = updated.status || (enabled ? 'connected' : 'disconnected');
              resultTools = updated.tools || [];
            }
            console.log(`[SettingsPanel] MCP server ${enabled ? 'enabled' : 'disabled'}: ${toggleServerId}`);

            safePostMessage(panel, {
              command: 'mcpServerToggled',
              serverId: toggleServerId,
              enabled,
              status: resultStatus,
              tools: resultTools,
            });
            notificationService.showInfoMessage(`CODEPILOT: MCP 서버 ${enabled ? '활성화' : '비활성화'}됨`);
          } catch (error: any) {
            console.error('[SettingsPanel] Failed to toggle MCP server:', error);
            safePostMessage(panel, {
              command: 'mcpServerToggled',
              serverId: data.serverId,
              enabled: !data.enabled,
              status: 'error'
            });
          }
          break;
        case "toggleAdminMcpServer": // 관리자 MCP 서버 토글 (권장만)
          try {
            const adminServerId = data.serverId;
            const adminEnabled = data.enabled;
            if (!adminServerId) {
              throw new Error('서버 ID가 필요합니다.');
            }

            const { MCPManager: MCPMgrAdmin } = await import('../mcp/MCPManager');
            const mcpMgrAdmin = MCPMgrAdmin.getInstance();
            const toggled = await mcpMgrAdmin.toggleAdminServer(adminServerId, adminEnabled);

            if (toggled) {
              safePostMessage(panel, {
                command: 'adminMcpServerToggled',
                serverId: adminServerId,
                enabled: adminEnabled,
                status: toggled.status || 'disconnected',
                tools: toggled.tools || [],
              });
              notificationService.showInfoMessage(`CODEPILOT: 관리자 MCP 서버 ${adminEnabled ? '활성화' : '비활성화'}됨`);
            }
          } catch (error: any) {
            console.error('[SettingsPanel] Failed to toggle admin MCP server:', error);
          }
          break;
        case "testMcpServer": // MCP 서버 연결 테스트 (개인 + 관리자 모두)
          try {
            const serverId = data.serverId;
            if (!serverId) {
              throw new Error('서버 ID가 필요합니다.');
            }

            const { MCPManager } = await import('../mcp/MCPManager');
            const mcpManager = MCPManager.getInstance();

            // 개인 서버에서 찾기
            const personalServers = await stateManager.getMcpServers();
            const personalServer = personalServers.find((s: any) => s.id === serverId);
            const isAdmin = !personalServer;

            if (personalServer) {
              // 개인 서버: MCPManager에 등록 후 연결
              const existingServers = mcpManager.getServers();
              if (!existingServers.find(s => s.id === serverId)) {
                await mcpManager.addServer(personalServer);
              }
            }
            // 관리자 서버는 이미 MCPManager.adminServers에 있음

            // 연결 테스트
            await mcpManager.connectToServer(serverId);

            // 도구 목록 가져오기 (개인 + 관리자 모두에서 검색)
            const allServers = [...mcpManager.getServers(), ...mcpManager.getAdminServers()];
            const connectedServer = allServers.find(s => s.id === serverId);
            const tools = connectedServer?.tools || [];

            // 개인 서버만 StateManager에 상태 저장
            if (!isAdmin) {
              await stateManager.updateMcpServer(serverId, {
                status: 'connected',
                tools: tools,
                lastConnected: Date.now()
              });
            }

            safePostMessage(panel, {
              command: 'mcpTestResult',
              serverId: serverId,
              success: true,
              toolCount: tools.length,
              tools: tools
            });
            notificationService.showInfoMessage(`CODEPILOT: MCP 서버 연결 성공 (${tools.length}개 도구)`);
          } catch (error: any) {
            console.error('[SettingsPanel] Failed to test MCP server:', error);

            // 개인 서버만 StateManager에 에러 상태 저장
            if (data.serverId) {
              const pServers = await stateManager.getMcpServers();
              if (pServers.find((s: any) => s.id === data.serverId)) {
                await stateManager.updateMcpServer(data.serverId, {
                  status: 'error'
                });
              }
            }

            safePostMessage(panel, {
              command: 'mcpTestResult',
              serverId: data.serverId,
              success: false,
              error: error.message
            });
            notificationService.showErrorMessage(`CODEPILOT: MCP 서버 연결 실패 - ${error.message}`);
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
            const addCondition = data.conditionType && data.conditionType !== 'none'
              ? { type: data.conditionType, value: data.conditionValue || '' }
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
              "CODEPILOT: Hot Load 항목이 추가되었습니다."
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
            const updateCondition = data.conditionType && data.conditionType !== 'none'
              ? { type: data.conditionType, value: data.conditionValue || '' }
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
              "CODEPILOT: Hot Load 항목이 수정되었습니다."
            );
          } catch (error: any) {
            console.error("[SettingsPanelProvider] updateHotLoad error:", error);
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
              "CODEPILOT: Hot Load 항목이 삭제되었습니다."
            );
          } catch (error: any) {
            console.error("[SettingsPanelProvider] deleteHotLoad error:", error);
            safePostMessage(panel, {
              command: "hotLoadDeleteError",
              error: error.message,
            });
          }
          break;

        // ========== 컨텍스트 제외 패턴 관련 메시지 핸들러 ==========
        case "getContextExclusions":
          try {
            const customExclusions: string[] = context.globalState.get('contextExclusionPatterns', []);
            const disabledExclusions: string[] = context.globalState.get('contextExclusionDisabled', []);
            const { EXCLUDED_LIBRARY_PATHS } = await import('../utils/FileExclusionConstants');
            safePostMessage(panel, {
              command: "contextExclusions",
              defaultPatterns: EXCLUDED_LIBRARY_PATHS,
              customPatterns: customExclusions,
              disabledPatterns: disabledExclusions,
            });
          } catch (error: any) {
            console.error("[SettingsPanelProvider] getContextExclusions error:", error);
            safePostMessage(panel, {
              command: "contextExclusionsError",
              error: error.message,
            });
          }
          break;

        case "addContextExclusion":
          try {
            const pattern = (data.pattern || '').trim();
            if (!pattern) {
              throw new Error('패턴을 입력해주세요.');
            }
            const currentPatterns: string[] = context.globalState.get('contextExclusionPatterns', []);
            if (currentPatterns.includes(pattern)) {
              throw new Error('이미 등록된 패턴입니다.');
            }
            currentPatterns.push(pattern);
            await context.globalState.update('contextExclusionPatterns', currentPatterns);
            // 캐시 갱신
            const { updateCustomExclusionCache: updateCacheAdd } = await import('../utils/FileExclusionConstants');
            updateCacheAdd(currentPatterns);
            safePostMessage(panel, { command: "contextExclusionAdded" });
          } catch (error: any) {
            console.error("[SettingsPanelProvider] addContextExclusion error:", error);
            safePostMessage(panel, {
              command: "contextExclusionAddError",
              error: error.message,
            });
          }
          break;

        case "deleteContextExclusion":
          try {
            const patternToDelete = data.pattern;
            const existingPatterns: string[] = context.globalState.get('contextExclusionPatterns', []);
            const filtered = existingPatterns.filter(p => p !== patternToDelete);
            await context.globalState.update('contextExclusionPatterns', filtered);
            // 캐시 갱신
            const { updateCustomExclusionCache: updateCacheDel } = await import('../utils/FileExclusionConstants');
            updateCacheDel(filtered);
            safePostMessage(panel, { command: "contextExclusionDeleted" });
          } catch (error: any) {
            console.error("[SettingsPanelProvider] deleteContextExclusion error:", error);
            safePostMessage(panel, {
              command: "contextExclusionDeleteError",
              error: error.message,
            });
          }
          break;

        case "disableDefaultExclusion":
          try {
            const patternToDisable = data.pattern;
            const currentDisabled: string[] = context.globalState.get('contextExclusionDisabled', []);
            if (!currentDisabled.includes(patternToDisable)) {
              currentDisabled.push(patternToDisable);
              await context.globalState.update('contextExclusionDisabled', currentDisabled);
              const { updateDisabledExclusionCache: updateDisCache } = await import('../utils/FileExclusionConstants');
              updateDisCache(currentDisabled);
            }
            safePostMessage(panel, { command: "defaultExclusionToggled" });
          } catch (error: any) {
            console.error("[SettingsPanelProvider] disableDefaultExclusion error:", error);
            safePostMessage(panel, {
              command: "defaultExclusionToggleError",
              error: error.message,
            });
          }
          break;

        case "enableDefaultExclusion":
          try {
            const patternToEnable = data.pattern;
            const disabledList: string[] = context.globalState.get('contextExclusionDisabled', []);
            const updatedDisabled = disabledList.filter(p => p !== patternToEnable);
            await context.globalState.update('contextExclusionDisabled', updatedDisabled);
            const { updateDisabledExclusionCache: updateEnCache } = await import('../utils/FileExclusionConstants');
            updateEnCache(updatedDisabled);
            safePostMessage(panel, { command: "defaultExclusionToggled" });
          } catch (error: any) {
            console.error("[SettingsPanelProvider] enableDefaultExclusion error:", error);
            safePostMessage(panel, {
              command: "defaultExclusionToggleError",
              error: error.message,
            });
          }
          break;

        // ========== PreToolUse 보안 규칙 관련 메시지 핸들러 ==========
        case "getSecurityRules":
          try {
            const {
              DEFAULT_BLOCKED_COMMANDS,
              DEFAULT_PROTECTED_FILES,
              updateCustomBlockedCommands,
              updateCustomProtectedFiles,
              updateCustomHiddenFiles,
              updateDisabledBlockedCommands,
              updateDisabledProtectedFiles,
            } = await import('../tools/PreToolUseValidator');

            const customCommands: string[] = context.globalState.get('securityBlockedCommands', []);
            const customFiles: string[] = context.globalState.get('securityProtectedFiles', []);
            const customHidden: string[] = context.globalState.get('securityHiddenFiles', []);
            const disabledCommands: string[] = context.globalState.get('securityDisabledBlockedCommands', []);
            const disabledFiles: string[] = context.globalState.get('securityDisabledProtectedFiles', []);

            // 캐시 업데이트
            updateCustomBlockedCommands(customCommands);
            updateCustomProtectedFiles(customFiles);
            updateCustomHiddenFiles(customHidden);
            updateDisabledBlockedCommands(disabledCommands);
            updateDisabledProtectedFiles(disabledFiles);

            safePostMessage(panel, {
              command: "securityRules",
              defaultBlockedCommands: DEFAULT_BLOCKED_COMMANDS,
              defaultProtectedFiles: DEFAULT_PROTECTED_FILES,
              customBlockedCommands: customCommands,
              customProtectedFiles: customFiles,
              customHiddenFiles: customHidden,
              disabledBlockedCommands: disabledCommands,
              disabledProtectedFiles: disabledFiles,
            });
          } catch (error: any) {
            console.error("[SettingsPanelProvider] getSecurityRules error:", error);
            safePostMessage(panel, {
              command: "securityRulesError",
              error: error.message,
            });
          }
          break;

        case "addBlockedCommand":
          try {
            const cmdPattern = (data.pattern || '').trim();
            if (!cmdPattern) {
              throw new Error('패턴을 입력해주세요.');
            }
            const currentCmds: string[] = context.globalState.get('securityBlockedCommands', []);
            if (currentCmds.includes(cmdPattern)) {
              throw new Error('이미 등록된 패턴입니다.');
            }
            currentCmds.push(cmdPattern);
            await context.globalState.update('securityBlockedCommands', currentCmds);
            const { updateCustomBlockedCommands } = await import('../tools/PreToolUseValidator');
            updateCustomBlockedCommands(currentCmds);
            safePostMessage(panel, { command: "blockedCommandAdded" });
          } catch (error: any) {
            console.error("[SettingsPanelProvider] addBlockedCommand error:", error);
            safePostMessage(panel, {
              command: "blockedCommandAddError",
              error: error.message,
            });
          }
          break;

        case "deleteBlockedCommand":
          try {
            const cmdToDelete = data.pattern;
            const existingCmds: string[] = context.globalState.get('securityBlockedCommands', []);
            const filteredCmds = existingCmds.filter(p => p !== cmdToDelete);
            await context.globalState.update('securityBlockedCommands', filteredCmds);
            const { updateCustomBlockedCommands: updateCmdsDel } = await import('../tools/PreToolUseValidator');
            updateCmdsDel(filteredCmds);
            safePostMessage(panel, { command: "blockedCommandDeleted" });
          } catch (error: any) {
            console.error("[SettingsPanelProvider] deleteBlockedCommand error:", error);
            safePostMessage(panel, {
              command: "blockedCommandDeleteError",
              error: error.message,
            });
          }
          break;

        case "addProtectedFile":
          try {
            const filePattern = (data.pattern || '').trim();
            if (!filePattern) {
              throw new Error('패턴을 입력해주세요.');
            }
            const currentFiles: string[] = context.globalState.get('securityProtectedFiles', []);
            if (currentFiles.includes(filePattern)) {
              throw new Error('이미 등록된 패턴입니다.');
            }
            currentFiles.push(filePattern);
            await context.globalState.update('securityProtectedFiles', currentFiles);
            const { updateCustomProtectedFiles } = await import('../tools/PreToolUseValidator');
            updateCustomProtectedFiles(currentFiles);
            safePostMessage(panel, { command: "protectedFileAdded" });
          } catch (error: any) {
            console.error("[SettingsPanelProvider] addProtectedFile error:", error);
            safePostMessage(panel, {
              command: "protectedFileAddError",
              error: error.message,
            });
          }
          break;

        case "deleteProtectedFile":
          try {
            const fileToDelete = data.pattern;
            const existingFiles: string[] = context.globalState.get('securityProtectedFiles', []);
            const filteredFiles = existingFiles.filter(p => p !== fileToDelete);
            await context.globalState.update('securityProtectedFiles', filteredFiles);
            const { updateCustomProtectedFiles: updateFilesDel } = await import('../tools/PreToolUseValidator');
            updateFilesDel(filteredFiles);
            safePostMessage(panel, { command: "protectedFileDeleted" });
          } catch (error: any) {
            console.error("[SettingsPanelProvider] deleteProtectedFile error:", error);
            safePostMessage(panel, {
              command: "protectedFileDeleteError",
              error: error.message,
            });
          }
          break;

        // 통합 보안 규칙 추가/삭제 (유형별 분기)
        case "addSecurityRule":
          try {
            const rulePattern = (data.pattern || '').trim();
            const ruleType = data.type || 'blocked_command';
            if (!rulePattern) {
              throw new Error('패턴을 입력해주세요.');
            }
            const storageKeyMap: Record<string, string> = {
              blocked_command: 'securityBlockedCommands',
              protected_file: 'securityProtectedFiles',
              hidden_file: 'securityHiddenFiles',
            };
            const cacheUpdateMap: Record<string, string> = {
              blocked_command: 'updateCustomBlockedCommands',
              protected_file: 'updateCustomProtectedFiles',
              hidden_file: 'updateCustomHiddenFiles',
            };
            const storageKey = storageKeyMap[ruleType] || storageKeyMap.blocked_command;
            const currentRules: string[] = context.globalState.get(storageKey, []);
            if (currentRules.includes(rulePattern)) {
              throw new Error('이미 등록된 패턴입니다.');
            }
            currentRules.push(rulePattern);
            await context.globalState.update(storageKey, currentRules);
            const validatorModule = await import('../tools/PreToolUseValidator');
            const updateFn = cacheUpdateMap[ruleType] || cacheUpdateMap.blocked_command;
            (validatorModule as any)[updateFn](currentRules);
            safePostMessage(panel, { command: "securityRuleAdded" });
          } catch (error: any) {
            console.error("[SettingsPanelProvider] addSecurityRule error:", error);
            safePostMessage(panel, {
              command: "securityRuleAddError",
              error: error.message,
            });
          }
          break;

        case "deleteSecurityRule":
          try {
            const delPattern = data.pattern;
            const delType = data.type || 'blocked_command';
            const delStorageKeyMap: Record<string, string> = {
              blocked_command: 'securityBlockedCommands',
              protected_file: 'securityProtectedFiles',
              hidden_file: 'securityHiddenFiles',
            };
            const delCacheMap: Record<string, string> = {
              blocked_command: 'updateCustomBlockedCommands',
              protected_file: 'updateCustomProtectedFiles',
              hidden_file: 'updateCustomHiddenFiles',
            };
            const delKey = delStorageKeyMap[delType] || delStorageKeyMap.blocked_command;
            const existingRules: string[] = context.globalState.get(delKey, []);
            const filtered = existingRules.filter(p => p !== delPattern);
            await context.globalState.update(delKey, filtered);
            const delValidatorModule = await import('../tools/PreToolUseValidator');
            const delUpdateFn = delCacheMap[delType] || delCacheMap.blocked_command;
            (delValidatorModule as any)[delUpdateFn](filtered);
            safePostMessage(panel, { command: "securityRuleDeleted" });
          } catch (error: any) {
            console.error("[SettingsPanelProvider] deleteSecurityRule error:", error);
            safePostMessage(panel, {
              command: "securityRuleDeleteError",
              error: error.message,
            });
          }
          break;

        case "disableBlockedCommand":
          try {
            const cmdIdToDisable = data.id;
            const currentDisabledCmds: string[] = context.globalState.get('securityDisabledBlockedCommands', []);
            if (!currentDisabledCmds.includes(cmdIdToDisable)) {
              currentDisabledCmds.push(cmdIdToDisable);
              await context.globalState.update('securityDisabledBlockedCommands', currentDisabledCmds);
              const { updateDisabledBlockedCommands } = await import('../tools/PreToolUseValidator');
              updateDisabledBlockedCommands(currentDisabledCmds);
            }
            safePostMessage(panel, { command: "blockedCommandToggled" });
          } catch (error: any) {
            console.error("[SettingsPanelProvider] disableBlockedCommand error:", error);
            safePostMessage(panel, {
              command: "blockedCommandToggleError",
              error: error.message,
            });
          }
          break;

        case "enableBlockedCommand":
          try {
            const cmdIdToEnable = data.id;
            const disabledCmdList: string[] = context.globalState.get('securityDisabledBlockedCommands', []);
            const updatedDisabledCmds = disabledCmdList.filter(id => id !== cmdIdToEnable);
            await context.globalState.update('securityDisabledBlockedCommands', updatedDisabledCmds);
            const { updateDisabledBlockedCommands: updateEnCmds } = await import('../tools/PreToolUseValidator');
            updateEnCmds(updatedDisabledCmds);
            safePostMessage(panel, { command: "blockedCommandToggled" });
          } catch (error: any) {
            console.error("[SettingsPanelProvider] enableBlockedCommand error:", error);
            safePostMessage(panel, {
              command: "blockedCommandToggleError",
              error: error.message,
            });
          }
          break;

        case "disableProtectedFile":
          try {
            const fileIdToDisable = data.id;
            const currentDisabledFiles: string[] = context.globalState.get('securityDisabledProtectedFiles', []);
            if (!currentDisabledFiles.includes(fileIdToDisable)) {
              currentDisabledFiles.push(fileIdToDisable);
              await context.globalState.update('securityDisabledProtectedFiles', currentDisabledFiles);
              const { updateDisabledProtectedFiles } = await import('../tools/PreToolUseValidator');
              updateDisabledProtectedFiles(currentDisabledFiles);
            }
            safePostMessage(panel, { command: "protectedFileToggled" });
          } catch (error: any) {
            console.error("[SettingsPanelProvider] disableProtectedFile error:", error);
            safePostMessage(panel, {
              command: "protectedFileToggleError",
              error: error.message,
            });
          }
          break;

        case "enableProtectedFile":
          try {
            const fileIdToEnable = data.id;
            const disabledFileList: string[] = context.globalState.get('securityDisabledProtectedFiles', []);
            const updatedDisabledFiles = disabledFileList.filter(id => id !== fileIdToEnable);
            await context.globalState.update('securityDisabledProtectedFiles', updatedDisabledFiles);
            const { updateDisabledProtectedFiles: updateEnFiles } = await import('../tools/PreToolUseValidator');
            updateEnFiles(updatedDisabledFiles);
            safePostMessage(panel, { command: "protectedFileToggled" });
          } catch (error: any) {
            console.error("[SettingsPanelProvider] enableProtectedFile error:", error);
            safePostMessage(panel, {
              command: "protectedFileToggleError",
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
            console.error("[SettingsPanelProvider] getUsageMetrics error:", error);
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
                const entries = await vscode.workspace.fs.readDirectory(skillsDirUri);
                for (const [name] of entries) {
                  const entryUri = vscode.Uri.file(path.join(skillsDir, name));
                  await vscode.workspace.fs.delete(entryUri, { recursive: true });
                }
              } catch (e: any) {
                if (e.code !== "FileNotFound") throw e;
              }
            }
            safePostMessage(panel, { command: "allSkillsReset" });
            notificationService.showInfoMessage("모든 Skills 파일이 삭제되었습니다.");
          } catch (error: any) {
            console.error("[SettingsPanelProvider] resetAllSkills error:", error);
            notificationService.showErrorMessage(`Skills 초기화 실패: ${error.message}`);
          }
          break;

        // v9.7.0: 사용량 메트릭 리셋
        case "resetUsageMetrics":
          try {
            const metricsManager = UsageMetricsManager.getInstance();
            metricsManager.resetMetrics();
            safePostMessage(panel, { command: "usageMetricsReset" });
            notificationService.showInfoMessage("사용량 통계가 초기화되었습니다.");
          } catch (error: any) {
            console.error("[SettingsPanelProvider] resetUsageMetrics error:", error);
          }
          break;

        // ═══════════ standalone: 인증 불필요 ═══════════
        case "checkAuthState": {
          safePostMessage(panel, {
            command: "authState",
            loggedIn: true,
          });
          break;
        }
        // ===== 빌드/테스트 개인 설정 CRUD =====
        case "saveBuildTestSetting": {
          try {
            const type = data.type || 'validation_command';
            const language = data.language || '';
            const description = data.description || '';
            const command = data.value || '';
            if (!command) {
              safePostMessage(panel, { command: 'buildTestSettingsUpdated', success: false, error: '명령어를 입력하세요', settings: context.globalState.get<any[]>('personalBuildTestSettings', []) });
              break;
            }
            const keySuffix = language ? `-${language.toLowerCase().replace(/[^a-z0-9]+/g, '')}` : '';
            const key = `${type}${keySuffix}`;
            const settings = context.globalState.get<any[]>('personalBuildTestSettings', []);
            const existing = settings.findIndex((s: any) => s.key === key);
            const entry = { key, description, value: { command, language } };
            if (existing >= 0) {
              settings[existing] = entry;
            } else {
              settings.push(entry);
            }
            await context.globalState.update('personalBuildTestSettings', settings);
            console.log(`[SettingsPanel] Build/test setting saved: ${key} = ${command}`);
            safePostMessage(panel, { command: 'buildTestSettingsUpdated', success: true, settings });
          } catch (error: any) {
            console.error('[SettingsPanel] Failed to save build/test setting:', error);
            safePostMessage(panel, { command: 'buildTestSettingsUpdated', success: false, error: error.message, settings: context.globalState.get<any[]>('personalBuildTestSettings', []) });
          }
          break;
        }
        case "deleteBuildTestSetting": {
          try {
            const key = data.key;
            const settings = context.globalState.get<any[]>('personalBuildTestSettings', []);
            const filtered = settings.filter((s: any) => s.key !== key);
            await context.globalState.update('personalBuildTestSettings', filtered);
            console.log(`[SettingsPanel] Build/test setting deleted: ${key}`);
            safePostMessage(panel, { command: 'buildTestSettingsUpdated', success: true, settings: filtered });
          } catch (error: any) {
            console.error('[SettingsPanel] Failed to delete build/test setting:', error);
            safePostMessage(panel, { command: 'buildTestSettingsUpdated', success: false, error: error.message, settings: context.globalState.get<any[]>('personalBuildTestSettings', []) });
          }
          break;
        }
        case "toggleErrorReporting": {
          try {
            const config = vscode.workspace.getConfiguration('codepilot');
            await config.update('errorReportingEnabled', !!data.value, vscode.ConfigurationTarget.Global);
          } catch { /* ignore */ }
          break;
        }
        case "syncSettings": {
          try {
            const { SettingsManager } = await import("../../core/managers/state/SettingsManager");
            const sm = SettingsManager.getInstance();
            await sm.syncServerSettings();
            // 동기화 후 서버 설정도 다시 전송
            safePostMessage(panel, {
              command: 'serverSettingsLoaded',
              settings: sm.getAllServerSettings(),
            });
          } catch { /* ignore */ }
          break;
        }

        case "getServerSettings": {
          try {
            const serverSettings = settingsManager.getAllServerSettings();
            safePostMessage(panel, {
              command: 'serverSettingsLoaded',
              settings: serverSettings,
            });
          } catch { /* ignore */ }
          break;
        }

        case "toggleServerSetting": {
          try {
            const { category, key, disabled } = data;
            await settingsManager.toggleRecommendedSetting(category, key, !!disabled);
            // 변경 후 전체 서버 설정 다시 전송
            safePostMessage(panel, {
              command: 'serverSettingsLoaded',
              settings: settingsManager.getAllServerSettings(),
            });
          } catch { /* ignore */ }
          break;
        }

        case "saveProviderApiKey": {
          try {
            const key = (data.apiKey || "").trim();
            const provider = (data.provider || "").trim();
            if (!key) {
              safePostMessage(panel, { command: "providerApiKeySaveError", error: "API 키를 입력하세요." });
              break;
            }
            if (!provider) {
              safePostMessage(panel, { command: "providerApiKeySaveError", error: "프로바이더 정보가 없습니다." });
              break;
            }
            // 프로바이더별 globalState 키에 저장
            await context.globalState.update(`codepilot.apiKey.${provider}`, key);

            // 현재 adminConfig의 프로바이더가 일치하면 즉시 반영
            try {
              const configJson = await stateManager.getAdminModelConfig();
              if (configJson) {
                const adminConfig = JSON.parse(configJson);
                // 현재 활성 모델의 프로바이더 그룹 확인
                const aiModelSettings = settingsManager.getServerSettings('ai_model');
                const currentPreset = aiModelSettings.find((s: any) => s.key === adminConfig.key);
                const currentGroup = (currentPreset as any)?.group || '';
                if (currentGroup === provider) {
                  adminConfig.apiKey = key;
                  await stateManager.saveAdminModelConfig(JSON.stringify(adminConfig));
                  const { LLMManager } = await import('../managers/model/LLMManager');
                  const llmManager = LLMManager.getInstance();
                  llmManager.setAdminModelConfig(adminConfig);
                }
              }
            } catch { }

            safePostMessage(panel, { command: "providerApiKeySaved" });
          } catch (e: any) {
            safePostMessage(panel, { command: "providerApiKeySaveError", error: e?.message || "저장 실패" });
          }
          break;
        }

        case "getProviderApiKeyStatus": {
          const provider = (data.provider || "").trim();
          if (provider) {
            const savedKey = context.globalState.get<string>(`codepilot.apiKey.${provider}`) || '';
            safePostMessage(panel, { command: "providerApiKeyStatus", hasKey: !!savedKey, provider });
          }
          break;
        }

        default:
          console.log("Unknown command:", data.command);
      }
    },
  );


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

