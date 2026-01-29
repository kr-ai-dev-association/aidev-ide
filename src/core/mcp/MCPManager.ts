/**
 * MCP Manager
 * MCP 서버 설정 및 클라이언트 관리
 */

import * as vscode from 'vscode';
import { MCPClient } from './MCPClient';
import {
    MCPServerConfig,
    MCPSettings,
    MCPToolInfo,
    MCPToolResult,
    MCPConnectionEvent,
    ApprovedMCPTool,
    DEFAULT_MCP_SETTINGS
} from './types';

export class MCPManager {
    private static instance: MCPManager | null = null;
    private context: vscode.ExtensionContext | null = null;

    private clients: Map<string, MCPClient> = new Map();
    private settings: MCPSettings = DEFAULT_MCP_SETTINGS;
    private eventListeners: ((event: MCPConnectionEvent) => void)[] = [];

    private constructor() { }

    static getInstance(): MCPManager {
        if (!MCPManager.instance) {
            MCPManager.instance = new MCPManager();
        }
        return MCPManager.instance;
    }

    /**
     * 초기화
     */
    async initialize(context: vscode.ExtensionContext): Promise<void> {
        this.context = context;
        await this.loadSettings();
        console.log(`[MCPManager] Initialized with ${this.settings.servers.length} servers`);

        // 활성화된 서버들에 자동 연결
        for (const server of this.settings.servers) {
            if (server.enabled) {
                this.connectToServer(server.id).catch(err => {
                    console.error(`[MCPManager] Auto-connect failed for ${server.name}:`, err);
                });
            }
        }
    }

    /**
     * 설정 로드
     */
    private async loadSettings(): Promise<void> {
        if (!this.context) return;

        const savedSettings = this.context.globalState.get<MCPSettings>('mcp.settings');
        if (savedSettings) {
            this.settings = savedSettings;
        }
    }

    /**
     * 설정 저장
     */
    private async saveSettings(): Promise<void> {
        if (!this.context) return;
        await this.context.globalState.update('mcp.settings', this.settings);
    }

    // ==================== 서버 관리 ====================

    /**
     * 서버 목록 조회
     */
    getServers(): MCPServerConfig[] {
        return [...this.settings.servers];
    }

    /**
     * 서버 추가
     */
    async addServer(config: Omit<MCPServerConfig, 'id'>): Promise<MCPServerConfig> {
        const id = `mcp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const server: MCPServerConfig = {
            ...config,
            id,
            status: 'disconnected'
        };

        this.settings.servers.push(server);
        await this.saveSettings();

        console.log(`[MCPManager] Server added: ${server.name}`);
        return server;
    }

    /**
     * 서버 업데이트
     */
    async updateServer(id: string, updates: Partial<MCPServerConfig>): Promise<MCPServerConfig | null> {
        const index = this.settings.servers.findIndex(s => s.id === id);
        if (index === -1) return null;

        // 연결 해제 후 업데이트
        if (this.clients.has(id)) {
            await this.disconnectFromServer(id);
        }

        this.settings.servers[index] = {
            ...this.settings.servers[index],
            ...updates,
            id // ID는 변경 불가
        };

        await this.saveSettings();

        // 활성화 상태면 재연결
        if (this.settings.servers[index].enabled) {
            await this.connectToServer(id);
        }

        return this.settings.servers[index];
    }

    /**
     * 서버 삭제
     */
    async removeServer(id: string): Promise<boolean> {
        const index = this.settings.servers.findIndex(s => s.id === id);
        if (index === -1) return false;

        // 연결 해제
        if (this.clients.has(id)) {
            await this.disconnectFromServer(id);
        }

        const [removed] = this.settings.servers.splice(index, 1);
        await this.saveSettings();

        // 관련 승인 도구도 삭제
        this.settings.approvedTools = this.settings.approvedTools.filter(
            t => t.serverId !== id
        );
        await this.saveSettings();

        console.log(`[MCPManager] Server removed: ${removed.name}`);
        return true;
    }

    // ==================== 연결 관리 ====================

    /**
     * 서버에 연결
     */
    async connectToServer(serverId: string): Promise<void> {
        const server = this.settings.servers.find(s => s.id === serverId);
        if (!server) {
            throw new Error(`Server not found: ${serverId}`);
        }

        // 기존 클라이언트가 있으면 재사용
        let client = this.clients.get(serverId);
        if (!client) {
            client = new MCPClient(server);
            this.clients.set(serverId, client);
        }

        try {
            await client.connect();

            // 서버 상태 업데이트
            server.status = 'connected';
            server.tools = client.tools;
            server.lastConnected = Date.now();
            await this.saveSettings();

            // 이벤트 발행
            this.emitEvent({
                type: 'connected',
                serverId: server.id,
                serverName: server.name,
                tools: client.tools
            });

        } catch (error) {
            server.status = 'error';
            await this.saveSettings();

            this.emitEvent({
                type: 'error',
                serverId: server.id,
                serverName: server.name,
                error: error instanceof Error ? error.message : String(error)
            });

            throw error;
        }
    }

    /**
     * 서버 연결 해제
     */
    async disconnectFromServer(serverId: string): Promise<void> {
        const client = this.clients.get(serverId);
        if (client) {
            await client.disconnect();
            this.clients.delete(serverId);
        }

        const server = this.settings.servers.find(s => s.id === serverId);
        if (server) {
            server.status = 'disconnected';
            await this.saveSettings();

            this.emitEvent({
                type: 'disconnected',
                serverId: server.id,
                serverName: server.name
            });
        }
    }

    /**
     * 연결 테스트
     */
    async testConnection(serverId: string): Promise<{ success: boolean; error?: string; tools?: MCPToolInfo[] }> {
        const server = this.settings.servers.find(s => s.id === serverId);
        if (!server) {
            return { success: false, error: 'Server not found' };
        }

        const testClient = new MCPClient(server);
        const result = await testClient.testConnection();
        await testClient.disconnect();

        return result;
    }

    // ==================== 도구 관리 ====================

    /**
     * 모든 활성 서버의 도구 목록 조회
     */
    getAllTools(): { serverId: string; serverName: string; tool: MCPToolInfo }[] {
        const allTools: { serverId: string; serverName: string; tool: MCPToolInfo }[] = [];

        for (const [serverId, client] of this.clients) {
            if (client.status === 'connected') {
                for (const tool of client.tools) {
                    allTools.push({
                        serverId,
                        serverName: client.serverName,
                        tool
                    });
                }
            }
        }

        return allTools;
    }

    /**
     * 도구 호출
     */
    async callTool(serverId: string, toolName: string, args: Record<string, any>): Promise<MCPToolResult> {
        const client = this.clients.get(serverId);
        if (!client || client.status !== 'connected') {
            return {
                success: false,
                content: [],
                error: `Server not connected: ${serverId}`
            };
        }

        return await client.callTool(toolName, args);
    }

    // ==================== 승인 관리 ====================

    /**
     * 도구가 승인되었는지 확인
     */
    isToolApproved(serverId: string, toolName: string): boolean {
        return this.settings.approvedTools.some(
            t => t.serverId === serverId && t.toolName === toolName
        );
    }

    /**
     * 도구 승인
     */
    async approveTool(serverId: string, toolName: string): Promise<void> {
        if (this.isToolApproved(serverId, toolName)) return;

        this.settings.approvedTools.push({
            serverId,
            toolName,
            approvedAt: Date.now()
        });

        await this.saveSettings();
        console.log(`[MCPManager] Tool approved: ${serverId}/${toolName}`);
    }

    /**
     * 도구 승인 취소
     */
    async revokeTool(serverId: string, toolName: string): Promise<void> {
        this.settings.approvedTools = this.settings.approvedTools.filter(
            t => !(t.serverId === serverId && t.toolName === toolName)
        );
        await this.saveSettings();
    }

    /**
     * 모든 승인된 도구 목록
     */
    getApprovedTools(): ApprovedMCPTool[] {
        return [...this.settings.approvedTools];
    }

    // ==================== 이벤트 ====================

    /**
     * 이벤트 리스너 등록
     */
    onConnectionEvent(listener: (event: MCPConnectionEvent) => void): void {
        this.eventListeners.push(listener);
    }

    /**
     * 이벤트 리스너 해제
     */
    offConnectionEvent(listener: (event: MCPConnectionEvent) => void): void {
        this.eventListeners = this.eventListeners.filter(l => l !== listener);
    }

    /**
     * 이벤트 발행
     */
    private emitEvent(event: MCPConnectionEvent): void {
        for (const listener of this.eventListeners) {
            try {
                listener(event);
            } catch (error) {
                console.error('[MCPManager] Event listener error:', error);
            }
        }
    }

    // ==================== 정리 ====================

    /**
     * 모든 연결 해제 및 정리
     */
    async dispose(): Promise<void> {
        for (const [serverId] of this.clients) {
            await this.disconnectFromServer(serverId);
        }
        this.clients.clear();
        this.eventListeners = [];
        console.log('[MCPManager] Disposed');
    }
}
