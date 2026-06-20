import * as vscode from "vscode";
import { CommandContext } from "./types";

/**
 * MCP 서버 관련 커맨드 등록
 *
 * viewMcpServers, connectMcpServer, disconnectMcpServer
 */
export function registerMcpCommands(deps: CommandContext): vscode.Disposable[] {
  const { chatViewProvider } = deps;

  const postSystem = (text: string) =>
    chatViewProvider.postMessageToWebview({
      command: "receiveMessage",
      sender: "System",
      text,
    });

  const getMcpManager = async () => {
    const { MCPManager } = await import("../core/mcp/MCPManager");
    return MCPManager.getInstance();
  };

  return [
    // MCP 서버 목록 보기 (패널에 출력 + QuickPick 선택)
    vscode.commands.registerCommand("codepilot.viewMcpServers", async () => {
      try {
        const mcpManager = await getMcpManager();
        const servers = mcpManager.getServers();

        if (servers.length === 0) {
          postSystem("등록된 MCP 서버가 없습니다.\n\n설정에서 MCP 서버를 추가해주세요.");
          return;
        }

        const items = servers.map((server: any) => ({
          label: `${server.status === "connected" ? "🟢" : "⚪"} ${server.name}`,
          description: server.type === "stdio" ? server.command : server.url,
          detail: `상태: ${server.status || "disconnected"} | 활성화: ${server.enabled ? "예" : "아니오"}`,
          serverId: server.id,
          serverName: server.name,
        }));

        const selected = await vscode.window.showQuickPick(items, {
          title: "MCP 서버 목록",
          placeHolder: "도구를 확인할 서버를 선택하세요",
        });

        if (selected) {
          const allTools = mcpManager.getAllTools();
          const serverTools = allTools.filter(
            (t: any) => t.serverId === selected.serverId
          );

          if (serverTools.length === 0) {
            postSystem(
              `**${selected.serverName}**\n\n연결되지 않았거나 도구가 없습니다.\n\`/mcp connect\` 명령어로 연결해보세요.`
            );
            return;
          }

          let toolListText = `**${selected.serverName}** - 도구 목록 (${serverTools.length}개)\n\n`;
          serverTools.forEach((t: any, idx: number) => {
            const tool = t.tool;
            toolListText += `**${idx + 1}. ${tool.name}**\n`;
            toolListText += `   ${tool.description || "설명 없음"}\n`;
            if (tool.inputSchema?.properties) {
              const params = Object.keys(tool.inputSchema.properties);
              if (params.length > 0) {
                toolListText += `   파라미터: \`${params.join(", ")}\`\n`;
              }
            }
            toolListText += "\n";
          });
          toolListText += "\n\n";
          postSystem(toolListText);
        }
      } catch (error) {
        postSystem(`MCP 서버 조회 실패: ${error}`);
      }
    }),

    // MCP 서버 연결
    vscode.commands.registerCommand("codepilot.connectMcpServer", async () => {
      try {
        const mcpManager = await getMcpManager();
        const servers = mcpManager.getServers();

        const disconnectedServers = servers.filter(
          (s: any) => s.status !== "connected"
        );
        if (disconnectedServers.length === 0) {
          vscode.window.showInformationMessage(
            "모든 MCP 서버가 이미 연결되어 있습니다."
          );
          return;
        }

        const items = disconnectedServers.map((server: any) => ({
          label: server.name,
          description: server.type === "stdio" ? server.command : server.url,
          serverId: server.id,
        }));

        const selected = await vscode.window.showQuickPick(items, {
          title: "MCP 서버 연결",
          placeHolder: "연결할 서버를 선택하세요",
        });

        if (selected) {
          postSystem(`${selected.label} 서버에 연결 중...`);
          try {
            await mcpManager.connectToServer(selected.serverId);
            postSystem(`${selected.label} 서버 연결 되었습니다.`);
          } catch (connectError) {
            postSystem(`${selected.label} 서버 연결 실패: ${connectError}`);
          }
        }
      } catch (error) {
        vscode.window.showErrorMessage(`MCP 서버 연결 실패: ${error}`);
      }
    }),

    // MCP 서버 연결 해제
    vscode.commands.registerCommand(
      "codepilot.disconnectMcpServer",
      async () => {
        try {
          const mcpManager = await getMcpManager();
          const servers = mcpManager.getServers();

          const connectedServers = servers.filter(
            (s: any) => s.status === "connected"
          );
          if (connectedServers.length === 0) {
            vscode.window.showInformationMessage(
              "연결된 MCP 서버가 없습니다."
            );
            return;
          }

          const items = connectedServers.map((server: any) => ({
            label: `🟢 ${server.name}`,
            description: server.type === "stdio" ? server.command : server.url,
            serverId: server.id,
            serverName: server.name,
          }));

          const selected = await vscode.window.showQuickPick(items, {
            title: "MCP 서버 연결 해제",
            placeHolder: "연결을 해제할 서버를 선택하세요",
          });

          if (selected) {
            await mcpManager.disconnectFromServer(selected.serverId);
            postSystem(`${selected.serverName} 서버 연결이 해제되었습니다.`);
          }
        } catch (error) {
          vscode.window.showErrorMessage(
            `MCP 서버 연결 해제 실패: ${error}`
          );
        }
      }
    ),
  ];
}
