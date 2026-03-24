import * as vscode from "vscode";
import * as path from "path";
import { CommandContext } from "./types";

/**
 * 캐시/세션 관련 커맨드 등록
 *
 * viewCacheStats, clearCache, listSavedSessions, restoreSavedSession, compactConversation
 */
export function registerSessionCommands(
  deps: CommandContext
): vscode.Disposable[] {
  const { context, chatViewProvider, ollamaApi } = deps;

  const postSystem = (text: string) =>
    chatViewProvider.postMessageToWebview({
      command: "receiveMessage",
      sender: "System",
      text,
    });

  const getSessionManager = async () => {
    const { SessionManager } = await import(
      "../core/managers/state/SessionManager"
    );
    return SessionManager.getInstance(context);
  };

  return [
    // 캐시 통계 보기
    vscode.commands.registerCommand("codepilot.viewCacheStats", async () => {
      try {
        const sessionManager = await getSessionManager();
        const stats = sessionManager.getCacheStats();

        if (!stats) {
          postSystem("캐시 통계를 가져올 수 없습니다.");
          return;
        }

        postSystem(
          `\n캐시 통계\n\n` +
            `- 총 캐시 엔트리: ${stats.totalEntries}개\n` +
            `- 총 캐시 크기: ${(stats.totalSize / 1024 / 1024).toFixed(2)} MB\n` +
            `- 캐시 히트: ${stats.hitCount}회\n` +
            `- 캐시 미스: ${stats.missCount}회\n` +
            `- 캐시 히트율: ${(stats.hitRate * 100).toFixed(1)}%\n\n`
        );
      } catch (error) {
        postSystem(`캐시 통계 조회 실패: ${error}`);
      }
    }),

    // 캐시 초기화 (QuickPick 확인 + 패널에 결과 출력)
    vscode.commands.registerCommand("codepilot.clearCache", async () => {
      try {
        const confirm = await vscode.window.showQuickPick(["예", "아니오"], {
          title: "캐시 초기화",
          placeHolder: "모든 컨텍스트 캐시를 초기화하시겠습니까?",
        });

        if (confirm === "예") {
          const sessionManager = await getSessionManager();
          sessionManager.clearAllCache();
          postSystem(
            "\n캐시 초기화 완료\n\n모든 컨텍스트 캐시가 초기화되었습니다.\n\n"
          );
        }
      } catch (error) {
        postSystem(`캐시 초기화 실패: ${error}`);
      }
    }),

    // 저장된 세션 목록 보기 (QuickPick)
    vscode.commands.registerCommand(
      "codepilot.listSavedSessions",
      async () => {
        try {
          const sessionManager = await getSessionManager();
          const sessions = sessionManager.getAllSessions();

          if (sessions.length === 0) {
            vscode.window.showInformationMessage("저장된 세션이 없습니다.");
            return;
          }

          const items = sessions.map((session: any) => ({
            label:
              path.basename(session.projectPath) || session.projectPath,
            description: `메시지 ${session.conversationHistory.length}개`,
            detail: `마지막 활성: ${new Date(session.lastActiveAt).toLocaleString()}`,
            sessionId: session.id,
          }));

          await vscode.window.showQuickPick(items, {
            title: "저장된 세션 목록",
            placeHolder: "세션을 선택하세요",
          });
        } catch (error) {
          vscode.window.showErrorMessage(`세션 목록 조회 실패: ${error}`);
        }
      }
    ),

    // 저장된 세션 복원 (QuickPick)
    vscode.commands.registerCommand(
      "codepilot.restoreSavedSession",
      async () => {
        try {
          const sessionManager = await getSessionManager();
          const sessions = sessionManager.getAllSessions();

          if (sessions.length === 0) {
            vscode.window.showInformationMessage("복원할 세션이 없습니다.");
            return;
          }

          const items = sessions.map((session: any) => ({
            label:
              path.basename(session.projectPath) || session.projectPath,
            description: `메시지 ${session.conversationHistory.length}개`,
            detail: `생성: ${new Date(session.createdAt).toLocaleString()}`,
            sessionId: session.id,
          }));

          const selected = await vscode.window.showQuickPick(items, {
            title: "세션 복원",
            placeHolder: "복원할 세션을 선택하세요",
          });

          if (selected && (selected as any).sessionId) {
            const success = sessionManager.setCurrentSession(
              (selected as any).sessionId
            );
            if (success) {
              const session = sessionManager.getSession(
                (selected as any).sessionId
              );
              if (session && chatViewProvider.restoreConversationHistory) {
                chatViewProvider.restoreConversationHistory(
                  session.conversationHistory
                );
              }
            } else {
              vscode.window.showErrorMessage("세션 복원에 실패했습니다.");
            }
          }
        } catch (error) {
          vscode.window.showErrorMessage(`세션 복원 실패: ${error}`);
        }
      }
    ),

    // 세션 삭제 (QuickPick 선택 후 삭제)
    vscode.commands.registerCommand(
      "codepilot.deleteSession",
      async () => {
        try {
          const sessionManager = await getSessionManager();
          const sessions = sessionManager.getAllSessions();

          if (sessions.length === 0) {
            vscode.window.showInformationMessage("삭제할 세션이 없습니다.");
            return;
          }

          const items = sessions.map((session: any) => ({
            label: path.basename(session.projectPath) || session.projectPath,
            description: `메시지 ${session.conversationHistory.length}개`,
            detail: `마지막 활성: ${new Date(session.lastActiveAt).toLocaleString()}`,
            sessionId: session.id,
          }));

          const selected = await vscode.window.showQuickPick(items, {
            title: "세션 삭제",
            placeHolder: "삭제할 세션을 선택하세요",
            canPickMany: true,
          });

          if (!selected || selected.length === 0) return;

          const confirm = await vscode.window.showWarningMessage(
            `선택한 세션 ${selected.length}개를 삭제하시겠습니까?`,
            { modal: true },
            "삭제"
          );

          if (confirm !== "삭제") return;

          let deleted = 0;
          for (const item of selected) {
            if (sessionManager.deleteSession((item as any).sessionId)) {
              deleted++;
            }
          }

          vscode.window.showInformationMessage(`세션 ${deleted}개가 삭제되었습니다.`);
        } catch (error) {
          vscode.window.showErrorMessage(`세션 삭제 실패: ${error}`);
        }
      }
    ),

    // 대화 압축 (QuickPick 확인 추가)
    vscode.commands.registerCommand(
      "codepilot.compactConversation",
      async () => {
        try {
          const sessionManager = await getSessionManager();
          const currentSession = sessionManager.getCurrentSession();

          if (
            !currentSession ||
            currentSession.conversationHistory.length < 3
          ) {
            postSystem(
              "압축할 대화가 충분하지 않습니다. (최소 3개 이상의 대화 필요)"
            );
            return;
          }

          const confirm = await vscode.window.showQuickPick(["예", "아니오"], {
            title: "대화 압축",
            placeHolder: `현재 대화(${currentSession.conversationHistory.length}개)를 압축하시겠습니까?`,
          });

          if (confirm !== "예") return;

          // 로딩 표시
          chatViewProvider.postMessageToWebview({ command: "showLoading" });
          chatViewProvider.postMessageToWebview({
            command: "updateProcessingStatus",
            status: "> 대화 압축 준비 중...",
          });

          const { ConversationCompactor } = await import(
            "../core/managers/conversation/ConversationCompactor"
          );
          const { LLMManager } = await import(
            "../core/managers/model/LLMManager"
          );
          const { StateManager } = await import(
            "../core/managers/state/StateManager"
          );
          const llmManager = LLMManager.getInstance(ollamaApi);
          const compactor = ConversationCompactor.getInstance(llmManager);
          compactor.setStateManager(StateManager.getInstance(context));

          const userParts = currentSession.conversationHistory.map(
            (entry: any) => ({
              text: `[User]: ${entry.userRequest}\n[Assistant]: ${entry.assistantResponse || "(응답 없음)"}`,
            })
          );

          const currentModelType = llmManager.getCurrentModel();
          const { MODEL_TOKEN_LIMITS } = await import("../utils/tokenUtils");
          const maxTokens =
            MODEL_TOKEN_LIMITS[currentModelType]?.maxInputTokens || 128000;

          chatViewProvider.postMessageToWebview({
            command: "updateProcessingStatus",
            status: `> 대화 압축 중... (${currentSession.conversationHistory.length}개 대화)`,
          });

          const result = await compactor.forceCompact(userParts, maxTokens);

          chatViewProvider.postMessageToWebview({ command: "hideLoading" });

          if (result.compacted && result.summary) {
            sessionManager.addCompactedSummary(
              currentSession.id,
              result.summary
            );

            const keepCount = Math.min(
              6,
              currentSession.conversationHistory.length
            );
            sessionManager.trimSessionHistory(keepCount);
            sessionManager.setTotalTokensUsed(result.compactedTokens);

            const savedPercent = (
              (result.savedTokens / result.originalTokens) *
              100
            ).toFixed(1);

            postSystem(
              `\n대화 압축 완료\n\n` +
                `- 원본 토큰: ${result.originalTokens.toLocaleString()}\n` +
                `- 압축 후 토큰: ${result.compactedTokens.toLocaleString()}\n` +
                `- 절감률: ${savedPercent}%\n\n` +
                `최근 ${keepCount}개의 대화만 유지됩니다.\n\n`
            );

            chatViewProvider.postMessageToWebview({
              command: "updateContextInfo",
              contextInfo: {
                messageCount: keepCount,
                tokenUsage: {
                  current: result.compactedTokens,
                  max: maxTokens,
                  percentage: (result.compactedTokens / maxTokens) * 100,
                },
              },
            });
          } else {
            postSystem("압축할 대화가 충분하지 않습니다.");
          }
        } catch (error) {
          console.error("[Extension] 대화 압축 실패:", error);
          chatViewProvider.postMessageToWebview({ command: "hideLoading" });
          postSystem(`대화 압축 실패: ${error}`);
        }
      }
    ),
  ];
}
