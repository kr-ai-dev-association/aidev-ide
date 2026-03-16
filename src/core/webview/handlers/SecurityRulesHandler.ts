import * as vscode from "vscode";

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

interface NotificationServiceLike {
  showInfoMessage(msg: string): void;
  showErrorMessage(msg: string): void;
}

const SECURITY_RULES_COMMANDS = new Set([
  "getSecurityRules",
  "addBlockedCommand",
  "deleteBlockedCommand",
  "addProtectedFile",
  "deleteProtectedFile",
  "addSecurityRule",
  "deleteSecurityRule",
  "disableBlockedCommand",
  "enableBlockedCommand",
  "disableProtectedFile",
  "enableProtectedFile",
]);

export class SecurityRulesHandler {
  /**
   * 주어진 command가 SecurityRules 관련 명령인지 확인합니다.
   */
  static isSecurityRulesCommand(command: string): boolean {
    return SECURITY_RULES_COMMANDS.has(command);
  }

  /**
   * SecurityRules 관련 메시지를 처리합니다.
   * @returns true if the command was handled, false otherwise
   */
  static async handleMessage(
    data: any,
    panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    notificationService: NotificationServiceLike,
  ): Promise<boolean> {
    if (!this.isSecurityRulesCommand(data.command)) {
      return false;
    }

    switch (data.command) {
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
          } = await import('../../tools/PreToolUseValidator');

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
          console.error("[SecurityRulesHandler] getSecurityRules error:", error);
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
          const { updateCustomBlockedCommands } = await import('../../tools/PreToolUseValidator');
          updateCustomBlockedCommands(currentCmds);
          safePostMessage(panel, { command: "blockedCommandAdded" });
        } catch (error: any) {
          console.error("[SecurityRulesHandler] addBlockedCommand error:", error);
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
          const { updateCustomBlockedCommands: updateCmdsDel } = await import('../../tools/PreToolUseValidator');
          updateCmdsDel(filteredCmds);
          safePostMessage(panel, { command: "blockedCommandDeleted" });
        } catch (error: any) {
          console.error("[SecurityRulesHandler] deleteBlockedCommand error:", error);
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
          const { updateCustomProtectedFiles } = await import('../../tools/PreToolUseValidator');
          updateCustomProtectedFiles(currentFiles);
          safePostMessage(panel, { command: "protectedFileAdded" });
        } catch (error: any) {
          console.error("[SecurityRulesHandler] addProtectedFile error:", error);
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
          const { updateCustomProtectedFiles: updateFilesDel } = await import('../../tools/PreToolUseValidator');
          updateFilesDel(filteredFiles);
          safePostMessage(panel, { command: "protectedFileDeleted" });
        } catch (error: any) {
          console.error("[SecurityRulesHandler] deleteProtectedFile error:", error);
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
          const validatorModule = await import('../../tools/PreToolUseValidator');
          const updateFn = cacheUpdateMap[ruleType] || cacheUpdateMap.blocked_command;
          (validatorModule as any)[updateFn](currentRules);
          safePostMessage(panel, { command: "securityRuleAdded" });
        } catch (error: any) {
          console.error("[SecurityRulesHandler] addSecurityRule error:", error);
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
          const delValidatorModule = await import('../../tools/PreToolUseValidator');
          const delUpdateFn = delCacheMap[delType] || delCacheMap.blocked_command;
          (delValidatorModule as any)[delUpdateFn](filtered);
          safePostMessage(panel, { command: "securityRuleDeleted" });
        } catch (error: any) {
          console.error("[SecurityRulesHandler] deleteSecurityRule error:", error);
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
            const { updateDisabledBlockedCommands } = await import('../../tools/PreToolUseValidator');
            updateDisabledBlockedCommands(currentDisabledCmds);
          }
          safePostMessage(panel, { command: "blockedCommandToggled" });
        } catch (error: any) {
          console.error("[SecurityRulesHandler] disableBlockedCommand error:", error);
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
          const { updateDisabledBlockedCommands: updateEnCmds } = await import('../../tools/PreToolUseValidator');
          updateEnCmds(updatedDisabledCmds);
          safePostMessage(panel, { command: "blockedCommandToggled" });
        } catch (error: any) {
          console.error("[SecurityRulesHandler] enableBlockedCommand error:", error);
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
            const { updateDisabledProtectedFiles } = await import('../../tools/PreToolUseValidator');
            updateDisabledProtectedFiles(currentDisabledFiles);
          }
          safePostMessage(panel, { command: "protectedFileToggled" });
        } catch (error: any) {
          console.error("[SecurityRulesHandler] disableProtectedFile error:", error);
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
          const { updateDisabledProtectedFiles: updateEnFiles } = await import('../../tools/PreToolUseValidator');
          updateEnFiles(updatedDisabledFiles);
          safePostMessage(panel, { command: "protectedFileToggled" });
        } catch (error: any) {
          console.error("[SecurityRulesHandler] enableProtectedFile error:", error);
          safePostMessage(panel, {
            command: "protectedFileToggleError",
            error: error.message,
          });
        }
        break;

      default:
        return false;
    }

    return true;
  }
}
