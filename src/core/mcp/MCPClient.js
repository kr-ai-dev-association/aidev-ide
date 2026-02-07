/**
 * MCP Client 래퍼
 * @modelcontextprotocol/sdk를 래핑하여 MCP 서버와 통신
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
export class MCPClient {
    client = null;
    transport = null;
    config;
    _status = 'disconnected';
    _tools = [];
    constructor(config) {
        this.config = config;
    }
    get status() {
        return this._status;
    }
    get tools() {
        return this._tools;
    }
    get serverId() {
        return this.config.id;
    }
    get serverName() {
        return this.config.name;
    }
    /**
     * MCP 서버에 연결
     */
    async connect() {
        if (this._status === 'connected') {
            console.log(`[MCPClient] Already connected to ${this.config.name}`);
            return;
        }
        this._status = 'connecting';
        console.log(`[MCPClient] Connecting to ${this.config.name} (${this.config.type})...`);
        try {
            // Transport 생성
            if (this.config.type === 'stdio') {
                if (!this.config.command) {
                    throw new Error('stdio transport requires command');
                }
                this.transport = new StdioClientTransport({
                    command: this.config.command,
                    args: this.config.args || []
                });
            }
            else if (this.config.type === 'http') {
                if (!this.config.url) {
                    throw new Error('http transport requires url');
                }
                const headers = {};
                if (this.config.apiKey) {
                    headers['Authorization'] = `Bearer ${this.config.apiKey}`;
                }
                this.transport = new StreamableHTTPClientTransport(new URL(this.config.url), { requestInit: { headers } });
            }
            else {
                throw new Error(`Unknown transport type: ${this.config.type}`);
            }
            // Client 생성 및 연결
            this.client = new Client({ name: 'codepilot-mcp-client', version: '1.0.0' }, { capabilities: {} });
            await this.client.connect(this.transport);
            this._status = 'connected';
            console.log(`[MCPClient] Connected to ${this.config.name}`);
            // 도구 목록 조회
            await this.refreshTools();
        }
        catch (error) {
            this._status = 'error';
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`[MCPClient] Connection failed: ${errorMessage}`);
            throw error;
        }
    }
    /**
     * MCP 서버 연결 해제
     */
    async disconnect() {
        if (this._status === 'disconnected') {
            return;
        }
        console.log(`[MCPClient] Disconnecting from ${this.config.name}...`);
        try {
            if (this.client) {
                await this.client.close();
                this.client = null;
            }
            if (this.transport) {
                // Transport 정리
                this.transport = null;
            }
            this._status = 'disconnected';
            this._tools = [];
            console.log(`[MCPClient] Disconnected from ${this.config.name}`);
        }
        catch (error) {
            console.error(`[MCPClient] Disconnect error:`, error);
            this._status = 'disconnected';
            this._tools = [];
        }
    }
    /**
     * 도구 목록 새로고침
     */
    async refreshTools() {
        if (!this.client || this._status !== 'connected') {
            throw new Error('Not connected to MCP server');
        }
        try {
            console.log(`[MCPClient] Fetching tools from ${this.config.name}...`);
            const response = await this.client.listTools();
            this._tools = (response.tools || []).map(tool => ({
                name: tool.name,
                description: tool.description || '',
                inputSchema: tool.inputSchema || { type: 'object' }
            }));
            console.log(`[MCPClient] Found ${this._tools.length} tools from ${this.config.name}`);
            return this._tools;
        }
        catch (error) {
            console.error(`[MCPClient] Failed to list tools:`, error);
            throw error;
        }
    }
    /**
     * 도구 호출
     */
    async callTool(toolName, args) {
        if (!this.client || this._status !== 'connected') {
            return {
                success: false,
                content: [],
                error: 'Not connected to MCP server'
            };
        }
        try {
            console.log(`[MCPClient] Calling tool ${toolName} on ${this.config.name}...`);
            console.log(`[MCPClient] Tool arguments:`, JSON.stringify(args));
            const response = await this.client.callTool({
                name: toolName,
                arguments: args
            });
            console.log(`[MCPClient] Tool ${toolName} response isError=${response.isError}, content items=${Array.isArray(response.content) ? response.content.length : 0}`);
            // 결과 변환
            const responseContent = Array.isArray(response.content) ? response.content : [];
            const content = responseContent.map((item) => {
                if (item.type === 'text') {
                    return { type: 'text', text: item.text };
                }
                else if (item.type === 'image') {
                    return {
                        type: 'image',
                        data: item.data,
                        mimeType: item.mimeType
                    };
                }
                else {
                    return { type: 'resource', text: JSON.stringify(item) };
                }
            });
            if (response.isError) {
                // 에러 시 content에서 실제 에러 메시지 추출
                const errorText = responseContent
                    .filter((item) => item.type === 'text' && item.text)
                    .map((item) => item.text)
                    .join('\n') || 'Tool execution failed (no error details)';
                console.error(`[MCPClient] Tool ${toolName} returned error: ${errorText}`);
                return {
                    success: false,
                    content,
                    error: errorText
                };
            }
            console.log(`[MCPClient] Tool ${toolName} completed successfully`);
            return {
                success: true,
                content
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`[MCPClient] Tool call failed: ${errorMessage}`);
            // 연결 끊김 감지 시 상태 업데이트
            if (errorMessage.includes('closed') || errorMessage.includes('disconnected') || errorMessage.includes('ECONNREFUSED')) {
                this._status = 'error';
                console.error(`[MCPClient] Connection lost to ${this.config.name}, marking as error`);
            }
            return {
                success: false,
                content: [],
                error: errorMessage
            };
        }
    }
    /**
     * 연결 테스트
     */
    async testConnection() {
        try {
            await this.connect();
            const tools = await this.refreshTools();
            return { success: true, tools };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return { success: false, error: errorMessage };
        }
    }
}
//# sourceMappingURL=MCPClient.js.map