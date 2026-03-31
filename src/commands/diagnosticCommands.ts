import * as vscode from "vscode";
import { CommandContext } from "./types";

/**
 * 진단/테스트 관련 커맨드 등록
 *
 * testTerminalMonitoring
 */
export function registerDiagnosticCommands(
  deps: CommandContext
): vscode.Disposable[] {
  return [
    // 터미널 모니터링 테스트
    vscode.commands.registerCommand(
      "codepilot-standalone.testTerminalMonitoring",
      async () => {
        try {
          const { ErrorManager } = await import(
            "../core/managers/error/ErrorManager"
          );
          const errorManager = ErrorManager.getInstance();
          if (errorManager) {
            const stats = errorManager.getStats();
            vscode.window.showInformationMessage(
              `에러 관리 상태: 총 에러=${stats.total}, 해결됨=${stats.resolved}, 미해결=${stats.unresolved}`
            );
          } else {
            vscode.window.showErrorMessage(
              "ErrorManager를 찾을 수 없습니다."
            );
          }
        } catch (error) {
          vscode.window.showErrorMessage(
            `터미널 모니터링 테스트 오류: ${error}`
          );
        }
      }
    ),
  ];
}
