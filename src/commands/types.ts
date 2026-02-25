import * as vscode from "vscode";

/**
 * 커맨드 등록 함수에 전달할 공통 의존성
 */
export interface CommandContext {
  context: vscode.ExtensionContext;
  chatViewProvider: {
    postMessageToWebview(message: any): void;
    restoreConversationHistory?(history: any[]): void;
  };
  gitRepositoryService?: any;
  ollamaApi?: any;
  settingsManager?: any;
  stateManager?: any;
  notificationService?: any;
}
