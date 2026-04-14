/**
 * WebView Message Type Definitions
 * 웹뷰 ↔ 익스텐션 간 메시지 프로토콜 타입 정의
 *
 * 모든 메시지는 `command` 필드를 discriminant로 사용하는 유니온 타입입니다.
 */

import { Task } from "../managers/task/types";

interface MCPServerConfig {
  id?: string;
  name: string;
  type: "stdio" | "http";
  command?: string;
  args?: string[];
  url?: string;
  apiKey?: string;
  enabled: boolean;
}

interface MCPToolInfo {
  name: string;
  description?: string;
}

/** Pending Changes 통계 정보 */
export interface PendingChangeStats {
  filePath: string;
  fileName: string;
  addedLines: number;
  deletedLines: number;
  totalChanges: number;
}

// ==================== Chat Messages (webview → extension) ====================

export interface SendMessageCommand {
  command: "sendMessage";
  text: string;
  imageData?: string;
}

export interface CancelLLMCallCommand {
  command: "cancelGeminiCall"; // kept for webview backward compat
}

export interface CancelAutoCorrectionCommand {
  command: "cancelAutoCorrection";
}

export interface StopCommandExecutionCommand {
  command: "stopCommandExecution";
}

export interface ClearHistoryCommand {
  command: "clearHistory";
}

export interface WebviewLoadedCommand {
  command: "webviewLoaded";
}

export interface ExecuteSlashCommand {
  command: "executeSlashCommand";
  action: string;
  args?: string;
}

export interface OpenFileCommand {
  command: "openFile";
  filePath: string;
}

export interface OpenDiffCommand {
  command: "openDiff";
  filePath: string;
}

export interface ExecuteBashCommandsCommand {
  command: "executeBashCommands";
  commands: string[];
}

export interface StopBashCommandCommand {
  command: "stopBashCommand";
}

export interface DisplayUserMessageCommand {
  command: "displayUserMessage";
  text: string;
  imageData?: string;
}

// ==================== File/Context Requests (webview → extension) ====================

export interface RequestPendingChangesCommand {
  command: "requestPendingChanges";
}

export interface AcceptPendingFileCommand {
  command: "acceptPendingFile";
  filePath: string;
}

export interface RejectPendingFileCommand {
  command: "rejectPendingFile";
}

export interface ApproveAllChangesCommand {
  command: "approveAllChanges";
}

export interface RejectAllChangesCommand {
  command: "rejectAllChanges";
}

export interface AcceptAllChangesForFileCommand {
  command: "acceptAllChangesForFile";
  filePath: string;
}

export interface RejectAllChangesForFileCommand {
  command: "rejectAllChangesForFile";
  filePath: string;
}

export interface RequestFileListCommand {
  command: "requestFileList";
}

export interface RequestTerminalListCommand {
  command: "requestTerminalList";
}

export interface RequestTerminalContextCommand {
  command: "requestTerminalContext";
  terminalName: string;
}

export interface RequestDiagnosticsContextCommand {
  command: "requestDiagnosticsContext";
}

export interface OpenFilePickerCommand {
  command: "openFilePicker";
}

// ==================== Settings Requests (webview → extension) ====================

export interface GetCurrentSettingsCommand {
  command: "getCurrentSettings";
}

export interface SaveApiKeyCommand {
  command: "saveApiKey";
  apiKey: string;
}

export interface SaveAiModelCommand {
  command: "saveAiModel";
  model: string;
}

export interface SaveLanguageCommand {
  command: "saveLanguage";
  language: string;
}

export interface GetLanguageCommand {
  command: "getLanguage" | "getCurrentLanguage" | "getLanguageData";
}

export interface SaveChatThemeCommand {
  command: "saveChatTheme";
  theme: string;
}

export interface GetChatThemeCommand {
  command: "getChatTheme";
}

export interface SetToggleSettingCommand {
  command:
    | "setAutoUpdateEnabled"
    | "setAutoTestRetryEnabled"
    | "setAutoCorrectionEnabled"
    | "setAutoExecuteCommandsEnabled"
    | "setAutoToolExecutionEnabled";
  enabled: boolean;
}

export interface SetRetryCountCommand {
  command: "setTestRetryCount" | "setErrorRetryCount";
  count: number;
}

export interface LoadApiKeysCommand {
  command: "loadApiKeys";
}

// ==================== Model Settings (webview → extension) ====================

export interface GetOllamaModelsCommand {
  command: "getOllamaModels";
}

export interface SetOllamaModelCommand {
  command: "setOllamaModel" | "saveOllamaModel" | "saveRemoteOllamaModel";
  model: string;
}

export interface ProjectTypeSelectedCommand {
  command: "projectTypeSelected";
  type: string;
}

// ==================== MCP Commands (webview → extension) ====================

export interface GetMcpServersCommand {
  command: "getMcpServers";
}

export interface AddMcpServerCommand {
  command: "addMcpServer";
  server: {
    id?: string;
    name: string;
    type: "stdio" | "http";
    command?: string;
    args?: string[];
    url?: string;
    apiKey?: string;
    enabled: boolean;
  };
}

export interface UpdateMcpServerCommand {
  command: "updateMcpServer";
  server: {
    id: string;
    name: string;
    type: "stdio" | "http";
    command?: string;
    args?: string[];
    url?: string;
    apiKey?: string;
    enabled: boolean;
  };
}

export interface RemoveMcpServerCommand {
  command: "removeMcpServer";
  serverId: string;
}

export interface TestMcpServerCommand {
  command: "testMcpServer";
  serverId: string;
}

export interface ToggleMcpServerCommand {
  command: "toggleMcpServer";
  serverId: string;
  enabled: boolean;
}

// ==================== Agent Policy Commands (webview → extension) ====================

export interface GetAgentPolicyCommand {
  command:
    | "getAgentPolicyStableVersion"
    | "getAgentPolicyCodingStyle"
    | "getAgentPolicyProjectArchitecture"
    | "getAgentPolicyDependencyPolicy"
    | "getAgentPolicyDbPolicy";
}

export interface SaveAgentPolicyCommand {
  command: string; // 'saveAgentPolicy*' variants
  content: string;
}

// ==================== Webview → Extension Union ====================

export type WebviewToExtensionMessage =
  // Chat
  | SendMessageCommand
  | CancelLLMCallCommand
  | CancelAutoCorrectionCommand
  | StopCommandExecutionCommand
  | ClearHistoryCommand
  | WebviewLoadedCommand
  | ExecuteSlashCommand
  | OpenFileCommand
  | OpenDiffCommand
  | ExecuteBashCommandsCommand
  | DisplayUserMessageCommand
  // File/Context
  | RequestPendingChangesCommand
  | AcceptPendingFileCommand
  | RejectPendingFileCommand
  | ApproveAllChangesCommand
  | RejectAllChangesCommand
  | AcceptAllChangesForFileCommand
  | RejectAllChangesForFileCommand
  | RequestFileListCommand
  | RequestTerminalListCommand
  | RequestTerminalContextCommand
  | RequestDiagnosticsContextCommand
  | OpenFilePickerCommand
  // Settings
  | GetCurrentSettingsCommand
  | SaveApiKeyCommand
  | SaveAiModelCommand
  | SaveLanguageCommand
  | GetLanguageCommand
  | SaveChatThemeCommand
  | GetChatThemeCommand
  | SetToggleSettingCommand
  | SetRetryCountCommand
  | LoadApiKeysCommand
  // Model
  | GetOllamaModelsCommand
  | SetOllamaModelCommand
  | ProjectTypeSelectedCommand
  // MCP
  | GetMcpServersCommand
  | AddMcpServerCommand
  | UpdateMcpServerCommand
  | RemoveMcpServerCommand
  | TestMcpServerCommand
  | ToggleMcpServerCommand
  // Agent Policy
  | GetAgentPolicyCommand
  | SaveAgentPolicyCommand;

// ==================== Extension → Webview Messages ====================

export interface MessageTokenInfo {
  tokens: number;
  model?: string;
}

export interface ReceiveMessageResponse {
  command: "receiveMessage";
  sender: string;
  text: string;
}

export interface StartStreamingMessageResponse {
  command: "startStreamingMessage";
  sender: string;
}

export interface StreamMessageChunkResponse {
  command: "streamMessageChunk";
  chunk: string;
}

export interface EndStreamingMessageResponse {
  command: "endStreamingMessage";
}

export interface UpdateMessageTokenInfoResponse {
  command: "updateMessageTokenInfo";
  tokenInfo: MessageTokenInfo;
}

/** 참조 추적 항목 */
export interface ReferenceItem {
  type: "rag" | "local_rule" | "local_skill" | "server_rule" | "server_skill";
  name: string;
  source?: string; // RAG: source_name, local: 'local', server: 'server'
  similarity?: number; // RAG 유사도 (0~1)
}

/** 참조 추적 정보 */
export interface ReferenceInfo {
  items: ReferenceItem[];
}

export interface UpdateReferenceInfoResponse {
  command: "updateReferenceInfo";
  referenceInfo: ReferenceInfo;
}

export interface ShowLoadingResponse {
  command: "showLoading";
}

export interface HideLoadingResponse {
  command: "hideLoading";
}

export interface SetProcessingStepResponse {
  command: "setProcessingStep";
  step: string;
}

export interface UpdateProcessingStatusResponse {
  command: "updateProcessingStatus";
  step: "processing" | "done" | "error" | "Waiting...";
  status: string;
}

export interface UpdateTaskQueueResponse {
  command: "updateTaskQueue";
  tasks: Task[];
  clear?: boolean;
}

export interface UpdateContextInfoResponse {
  command: "updateContextInfo";
  contextInfo: {
    messageCount: number;
    tokenUsage: {
      current: number;
      max: number;
      percentage: number;
    };
  };
}

export interface ClearChatResponse {
  command: "clearChat";
}

export interface UpdatePendingChangesResponse {
  command: "updatePendingChanges";
  changes: PendingChangeStats[];
}

export interface FileSelectedResponse {
  command: "fileSelected";
  filePath: string;
  fileName: string;
}

export interface FileListReceivedResponse {
  command: "fileListReceived";
  files: string[];
}

export interface TerminalListReceivedResponse {
  command: "terminalListReceived";
  terminals: string[];
}

export interface TerminalContextReceivedResponse {
  command: "terminalContextReceived";
  terminalContext: string;
  error?: string;
}

export interface DiagnosticsContextReceivedResponse {
  command: "diagnosticsContextReceived";
  diagnosticsContext: string;
}

export interface ShowApprovalButtonsResponse {
  command: "showApprovalButtons";
}

export interface HideApprovalButtonsResponse {
  command: "hideApprovalButtons";
}

export interface ShowErrorCorrectionResponse {
  command: "showErrorCorrection";
  originalCommand: string;
  correctedCommand: string;
  retryCount: number;
}

export interface PriorityErrorPromptResponse {
  command: "priorityErrorPrompt";
  text: string;
}

export interface ShowGitInfoResponse {
  command: "showGitInfo";
  content: string;
}

// Settings Responses

export interface CurrentSettingsResponse {
  command: "currentSettings";
  settings: Record<string, any>;
}

export interface LanguageChangedResponse {
  command: "languageChanged" | "currentLanguage";
  language: string;
}

export interface LanguageDataReceivedResponse {
  command: "languageDataReceived" | "languageDataLoaded";
  language: string;
  data: Record<string, any>;
}

export interface ChatThemeResponse {
  command: "chatTheme";
  theme: string;
}

export interface OllamaModelsResponse {
  command: "ollamaModels";
  models: string[];
  current?: string;
}

export interface OpenPanelResponse {
  command: "openPanel";
  panel: string;
}

// MCP Responses

export interface McpServersResponse {
  command: "mcpServers";
  servers: MCPServerConfig[];
}

export interface McpServerAddedResponse {
  command: "mcpServerAdded";
  server: MCPServerConfig;
}

export interface McpServerUpdatedResponse {
  command: "mcpServerUpdated";
  server: MCPServerConfig;
}

export interface McpServerRemovedResponse {
  command: "mcpServerRemoved";
  serverId: string;
}

export interface McpServerStatusResponse {
  command: "mcpServerStatus";
  serverId: string;
  status: string;
  tools?: MCPToolInfo[];
}

export interface McpTestResultResponse {
  command: "mcpTestResult";
  serverId: string;
  success: boolean;
  toolCount?: number;
  tools?: MCPToolInfo[];
  error?: string;
}

export interface McpServerToggledResponse {
  command: "mcpServerToggled";
  serverId: string;
  enabled: boolean;
  status: string;
}

// Generic success/error response for settings operations

export interface SettingsOperationResponse {
  command: string; // e.g., 'apiKeySaved', 'aiModelSaveError', etc.
  success?: boolean;
  error?: string;
  message?: string;
  [key: string]: any;
}

// ==================== Extension → Webview Union ====================

export type ExtensionToWebviewMessage =
  // Chat
  | ReceiveMessageResponse
  | StartStreamingMessageResponse
  | StreamMessageChunkResponse
  | EndStreamingMessageResponse
  | UpdateMessageTokenInfoResponse
  | ShowLoadingResponse
  | HideLoadingResponse
  | SetProcessingStepResponse
  | UpdateProcessingStatusResponse
  | UpdateReferenceInfoResponse
  | UpdateTaskQueueResponse
  | UpdateContextInfoResponse
  | ClearChatResponse
  | ShowErrorCorrectionResponse
  | PriorityErrorPromptResponse
  | ShowGitInfoResponse
  // File/Context
  | UpdatePendingChangesResponse
  | FileSelectedResponse
  | FileListReceivedResponse
  | TerminalListReceivedResponse
  | TerminalContextReceivedResponse
  | DiagnosticsContextReceivedResponse
  | ShowApprovalButtonsResponse
  | HideApprovalButtonsResponse
  // Settings
  | CurrentSettingsResponse
  | LanguageChangedResponse
  | LanguageDataReceivedResponse
  | ChatThemeResponse
  | OllamaModelsResponse
  | OpenPanelResponse
  // MCP
  | McpServersResponse
  | McpServerAddedResponse
  | McpServerUpdatedResponse
  | McpServerRemovedResponse
  | McpServerStatusResponse
  | McpTestResultResponse
  | McpServerToggledResponse
  // Generic settings operations
  | SettingsOperationResponse;

// ==================== Utility Types ====================

/**
 * 모든 WebView 메시지 타입
 */
export type WebviewMessage =
  | WebviewToExtensionMessage
  | ExtensionToWebviewMessage;

/**
 * command 필드로 메시지 타입을 좁히는 헬퍼
 */
export type MessageByCommand<
  T extends WebviewMessage,
  C extends string,
> = T extends { command: C } ? T : never;
