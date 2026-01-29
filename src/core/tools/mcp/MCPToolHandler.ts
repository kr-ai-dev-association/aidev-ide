/**
 * MCP Tool Handler
 * MCP 도구를 기존 Tool 시스템에 통합
 */

import * as vscode from 'vscode';
import { IToolHandler, ToolExecutionContext } from '../IToolHandler';
import { ToolUse, ToolResponse, Tool } from '../types';
import { MCPManager, MCPToolInfo } from '../../mcp';

/**
 * MCP 도구를 IToolHandler로 래핑
 */
export class MCPToolHandler implements IToolHandler {
    readonly name: string;
    private serverId: string;
    private mcpToolName: string;
    private toolInfo: MCPToolInfo;
    private mcpManager: MCPManager;

    constructor(serverId: string, serverName: string, toolInfo: MCPToolInfo) {
        // 도구 이름: mcp_{서버명}_{도구명} 형식으로 고유하게 생성
        this.name = `mcp_${this.sanitizeName(serverName)}_${toolInfo.name}`;
        this.serverId = serverId;
        this.mcpToolName = toolInfo.name;
        this.toolInfo = toolInfo;
        this.mcpManager = MCPManager.getInstance();
    }

    /**
     * 이름에서 특수문자 제거
     */
    private sanitizeName(name: string): string {
        return name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    }

    /**
     * 도구 설명 반환
     */
    getDescription(toolUse: ToolUse): string {
        return `[MCP] ${this.toolInfo.description || this.mcpToolName}`;
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

        // MCP 도구 호출
        const result = await this.mcpManager.callTool(this.serverId, this.mcpToolName, args);

        if (!result.success) {
            return {
                success: false,
                message: `MCP 도구 실행 실패: ${result.error || 'Unknown error'}`,
                error: { code: 'MCP_ERROR', message: result.error || 'Unknown error' }
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
            description: `[MCP] ${this.toolInfo.description || this.mcpToolName}`,
            parameters
        };
    }
}
