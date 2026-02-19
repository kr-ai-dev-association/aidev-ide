/**
 * MCP Tool Handler
 * MCP 도구를 기존 Tool 시스템에 통합
 *
 * v9.2.3: 원래 도구 이름 사용 (mcp_ 프리픽스 제거)
 * 충돌 해결은 ToolRegistry.registerMCP()에서 처리
 */

import * as vscode from 'vscode';
import { IToolHandler, ToolExecutionContext } from '../IToolHandler';
import { ToolUse, ToolResponse, Tool } from '../types';
import { MCPManager, MCPToolInfo } from '../../mcp';

/**
 * MCP 도구를 IToolHandler로 래핑
 */
export class MCPToolHandler implements IToolHandler {
    name: string;
    readonly serverId: string;
    readonly serverName: string;
    private mcpToolName: string;
    private toolInfo: MCPToolInfo;
    private mcpManager: MCPManager;

    constructor(serverId: string, serverName: string, toolInfo: MCPToolInfo) {
        // 원래 도구 이름 사용 — 충돌 해결은 ToolRegistry가 담당
        this.name = toolInfo.name;
        this.serverId = serverId;
        this.serverName = serverName;
        this.mcpToolName = toolInfo.name;
        this.toolInfo = toolInfo;
        this.mcpManager = MCPManager.getInstance();
    }

    /**
     * 충돌로 disambiguate된 경우 Registry가 호출하여 이름 업데이트
     */
    setRegisteredName(name: string): void {
        this.name = name;
    }

    /**
     * 도구 설명 반환
     */
    getDescription(toolUse: ToolUse): string {
        return `[MCP:${this.serverName}] ${this.toolInfo.description || this.mcpToolName}`;
    }

    /**
     * 도구 실행
     */
    async execute(toolUse: ToolUse, context: ToolExecutionContext): Promise<ToolResponse> {
        console.log(`[MCPToolHandler] Executing MCP tool: ${this.mcpToolName}`);

        // 승인 확인
        if (!this.mcpManager.isToolApproved(this.serverId, this.mcpToolName)) {
            // 사용자 확인 요청
            const approved = await this.requestApproval(context.webview);
            if (!approved) {
                return {
                    success: false,
                    message: `MCP 도구 실행이 사용자에 의해 거부되었습니다: ${this.mcpToolName}`,
                    error: { code: 'USER_DENIED', message: 'Tool execution denied by user' }
                };
            }
            // 승인 저장
            await this.mcpManager.approveTool(this.serverId, this.mcpToolName);
        }

        // 파라미터 추출
        const args = this.extractArguments(toolUse.params);
        console.log(`[MCPToolHandler] Tool: ${this.mcpToolName}, serverId: ${this.serverId}, args:`, JSON.stringify(args));

        // MCP 도구 호출
        const result = await this.mcpManager.callTool(this.serverId, this.mcpToolName, args);

        if (!result.success) {
            // 에러 content가 있으면 포함하여 더 상세한 메시지 제공
            const errorDetail = result.error || 'Unknown error';
            const contentText = result.content?.length > 0
                ? this.formatResult(result.content)
                : '';
            const fullError = contentText
                ? `${errorDetail}\n---\n${contentText}`
                : errorDetail;

            console.error(`[MCPToolHandler] Tool ${this.mcpToolName} failed: ${errorDetail}`);
            return {
                success: false,
                message: `MCP 도구 실행 실패 (${this.mcpToolName}): ${fullError}`,
                error: { code: 'MCP_ERROR', message: errorDetail }
            };
        }

        // 결과 포맷팅
        const message = this.formatResult(result.content);

        return {
            success: true,
            message,
            data: {
                serverId: this.serverId,
                toolName: this.mcpToolName,
                content: result.content
            }
        };
    }

    /**
     * 사용자 승인 요청
     */
    private async requestApproval(webview?: vscode.Webview): Promise<boolean> {
        const message = `MCP 도구 "${this.mcpToolName}" 실행을 허용하시겠습니까?\n\n설명: ${this.toolInfo.description || '(설명 없음)'}`;

        const result = await vscode.window.showWarningMessage(
            message,
            { modal: true },
            '허용 (이후 자동 실행)',
            '이번만 허용',
            '거부'
        );

        if (result === '허용 (이후 자동 실행)') {
            return true;
        } else if (result === '이번만 허용') {
            // 일시적 허용 (저장하지 않음)
            return true;
        }

        return false;
    }

    /**
     * 파라미터 추출
     */
    private extractArguments(params: Record<string, string>): Record<string, any> {
        const args: Record<string, any> = {};

        // params에서 'args_'로 시작하는 키들을 추출하거나
        // inputSchema의 properties를 기반으로 추출
        for (const [key, value] of Object.entries(params)) {
            if (key.startsWith('args_')) {
                args[key.substring(5)] = this.parseValue(value);
            } else if (key !== 'tool' && key !== 'server') {
                args[key] = this.parseValue(value);
            }
        }

        return args;
    }

    /**
     * 값 파싱 (문자열 → 적절한 타입)
     */
    private parseValue(value: string): any {
        // JSON 파싱 시도
        try {
            return JSON.parse(value);
        } catch {
            // 문자열 그대로 반환
            return value;
        }
    }

    /**
     * 결과 포맷팅
     */
    private formatResult(content: { type: string; text?: string; data?: string }[]): string {
        const parts: string[] = [];

        for (const item of content) {
            if (item.type === 'text' && item.text) {
                parts.push(item.text);
            } else if (item.type === 'image' && item.data) {
                parts.push(`[Image: ${item.data.substring(0, 50)}...]`);
            } else {
                parts.push(JSON.stringify(item));
            }
        }

        return parts.join('\n\n') || '(empty result)';
    }

    /**
     * 도구 스펙 생성 (ToolSpecBuilder용)
     */
    toToolSpec(): { name: string; description: string; parameters: any[] } {
        const parameters: any[] = [];

        if (this.toolInfo.inputSchema?.properties) {
            for (const [name, prop] of Object.entries(this.toolInfo.inputSchema.properties)) {
                const isRequired = this.toolInfo.inputSchema.required?.includes(name) || false;
                parameters.push({
                    name,
                    required: isRequired,
                    description: prop.description || name,
                    type: prop.type || 'string'
                });
            }
        }

        return {
            name: this.name,
            description: `[MCP:${this.serverName}] ${this.toolInfo.description || this.mcpToolName}`,
            parameters
        };
    }
}
