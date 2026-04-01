/**
 * MCP Tool Handler
 * Integrates MCP tools into the existing Tool system
 *
 * v9.2.3: Uses original tool names (removed mcp_ prefix)
 * Conflict resolution is handled by ToolRegistry.registerMCP()
 */

import * as vscode from 'vscode';
import { IToolHandler, ToolExecutionContext } from '../IToolHandler';
import { ToolUse, ToolResponse, Tool } from '../types';
import { MCPManager, MCPToolInfo } from '../../mcp';

/**
 * Wraps MCP tools as IToolHandler
 */
export class MCPToolHandler implements IToolHandler {
    name: string;
    readonly serverId: string;
    readonly serverName: string;
    private mcpToolName: string;
    private toolInfo: MCPToolInfo;
    private mcpManager: MCPManager;

    constructor(serverId: string, serverName: string, toolInfo: MCPToolInfo) {
        // Use original tool name -- conflict resolution is handled by ToolRegistry
        this.name = toolInfo.name;
        this.serverId = serverId;
        this.serverName = serverName;
        this.mcpToolName = toolInfo.name;
        this.toolInfo = toolInfo;
        this.mcpManager = MCPManager.getInstance();
    }

    /**
     * Called by Registry to update the name when disambiguated due to conflict
     */
    setRegisteredName(name: string): void {
        this.name = name;
    }

    /**
     * Returns tool description
     */
    getDescription(toolUse: ToolUse): string {
        return `[MCP:${this.serverName}] ${this.toolInfo.description || this.mcpToolName}`;
    }

    /**
     * Executes tool
     */
    async execute(toolUse: ToolUse, context: ToolExecutionContext): Promise<ToolResponse> {
        console.log(`[MCPToolHandler] Executing MCP tool: ${this.mcpToolName}`);

        // Check MCP tool auto-execution setting
        const { SettingsManager } = await import('../../managers/state/SettingsManager');
        const isAutoMcpEnabled = await SettingsManager.getInstance().isAutoMcpToolExecutionEnabled();

        // If auto-execution is OFF and tool is not approved, request user confirmation
        if (!isAutoMcpEnabled && !this.mcpManager.isToolApproved(this.serverId, this.mcpToolName)) {
            const approved = await this.requestApproval(context.webview);
            if (!approved) {
                return {
                    success: false,
                    message: `MCP tool execution denied by user: ${this.mcpToolName}`,
                    error: { code: 'USER_DENIED', message: 'Tool execution denied by user' }
                };
            }
            // Save approval
            await this.mcpManager.approveTool(this.serverId, this.mcpToolName);
        }

        // Extract parameters
        const args = this.extractArguments(toolUse.params);
        console.log(`[MCPToolHandler] Tool: ${this.mcpToolName}, serverId: ${this.serverId}, args:`, JSON.stringify(args));

        // Call MCP tool
        const result = await this.mcpManager.callTool(this.serverId, this.mcpToolName, args);

        if (!result.success) {
            // Include error content for more detailed message if available
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
                message: `MCP tool execution failed (${this.mcpToolName}): ${fullError}`,
                error: { code: 'MCP_ERROR', message: errorDetail }
            };
        }

        // Format result
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
     * Request user approval
     */
    private async requestApproval(webview?: vscode.Webview): Promise<boolean> {
        const message = `Allow execution of MCP tool "${this.mcpToolName}"?\n\nDescription: ${this.toolInfo.description || '(no description)'}`;

        const result = await vscode.window.showWarningMessage(
            message,
            { modal: true },
            'Allow (auto-execute later)',
            'Allow this time only',
            'Deny'
        );

        if (result === 'Allow (auto-execute later)') {
            return true;
        } else if (result === 'Allow this time only') {
            // Temporary approval (not saved)
            return true;
        }

        return false;
    }

    /**
     * Extract parameters
     */
    private extractArguments(params: Record<string, string>): Record<string, any> {
        const args: Record<string, any> = {};

        // Extract keys starting with 'args_' from params
        // or extract based on inputSchema properties
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
     * Parse value (string to appropriate type)
     */
    private parseValue(value: string): any {
        // Try JSON parsing
        try {
            return JSON.parse(value);
        } catch {
            // Return as string
            return value;
        }
    }

    /**
     * Format result
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
     * Generate tool spec (for ToolSpecBuilder)
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
