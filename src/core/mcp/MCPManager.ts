/**
 * MCP Manager
 * MCP 서버 설정 및 클라이언트 관리
 *
 * 데이터 영속성은 StateManager에 위임하고,
 * MCPManager는 클라이언트 연결/도구 호출 등 런타임 관리만 담당합니다.
 */

import * as vscode from 'vscode';
import { MCPClient } from './MCPClient';
import { StateManager } from '../managers/state/StateManager';
import {
    MCPServerConfig,
    MCPSettings,
    MCPToolInfo,
    MCPToolResult,
    MCPConnectionEvent,
    ApprovedMCPTool,
    AdminMCPServer,
    DEFAULT_MCP_SETTINGS
} from './types';

export class MCPManager {
    private static instance: MCPManager;
    private context: vscode.ExtensionContext | undefined;

    private clients: Map<string, MCPClient> = new Map();
    private settings: MCPSettings = DEFAULT_MCP_SETTINGS;
    /** 관리자(서버)에서 푸시된 MCP 서버 (개인 설정과 분리) */
    private adminServers: AdminMCPServer[] = [];
    private eventListeners: ((event: MCPConnectionEvent) => void)[] = [];
    private initialized = false;

    private constructor() { }

    static getInstance(): MCPManager {
        if (!MCPManager.instance) {
            MCPManager.instance = new MCPManager();
        }
        return MCPManager.instance;
    }

    /**
     * StateManager 인스턴스를 가져옵니다
     */
    private getStateManager(): StateManager {
        if (!this.context) {
            throw new Error('[MCPManager] Not initialized - context is undefined');
        }
        return StateManager.getInstance(this.context);
    }

    /**
     * 초기화 (중복 호출 안전)
     */
    async initialize(context: vscode.ExtensionContext): Promise<void> {
        if (this.initialized) {
            // 컨텍스트 갱신 시 기존 연결 정리 후 설정 리로드
            this.context = context;
            await this.disconnectAllServers();
            await this.loadSettings();
            await this.autoConnectEnabledServers();
            return;
        }

        this.context = context;
        await this.migrateLegacySettings();
        await this.loadSettings();
        this.initialized = true;
        console.log(`[MCPManager] Initialized with ${this.settings.servers.length} servers`);

        await this.autoConnectEnabledServers();
    }

    /**
     * 모든 서버 연결 해제 (설정 리로드 전 정리용)
     */
    private async disconnectAllServers(): Promise<void> {
        const serverIds = Array.from(this.clients.keys());
        for (const serverId of serverIds) {
            try {
                await this.disconnectFromServer(serverId);
            } catch (err) {
                console.warn(`[MCPManager] Disconnect failed for ${serverId}:`, err);
            }
        }
    }

    /**
     * 활성화된 서버들에 자동 연결 (상태 업데이트 포함)
     */
    private async autoConnectEnabledServers(): Promise<void> {
        // 개인 서버 + 관리자 서버 모두 연결
        const allServers = [...this.settings.servers, ...this.adminServers];
        console.log(`[MCPManager] autoConnect: ${allServers.length} servers (${allServers.map(s => `${s.id}:enabled=${s.enabled}`).join(', ')})`);
        for (const server of allServers) {
            if (server.enabled) {
                this.connectToServer(server.id).catch(async (err) => {
                    const errorMessage = err instanceof Error ? err.message : String(err);
                    console.error(`[MCPManager] Auto-connect failed for ${server.name}:`, errorMessage);

                    server.status = 'error';
                    // 개인 서버만 StateManager에 저장
                    if (!this.adminServers.find(s => s.id === server.id)) {
                        await this.saveSettings();
                    }

                    this.emitEvent({
                        type: 'error',
                        serverId: server.id,
                        serverName: server.name,
                        error: `Auto-connect failed: ${errorMessage}`
                    });

                    import('../../services/error/ErrorReportingService').then(({ ErrorReportingService }) => {
                        ErrorReportingService.getInstance().reportMCPError(server.id, server.name, `Auto-connect failed: ${errorMessage}`);
                    }).catch(() => {});
                });
            }
        }
    }

    /**
     * 레거시 globalState 데이터 마이그레이션 (한 번만 실행)
     */
    private async migrateLegacySettings(): Promise<void> {
        if (!this.context) return;

        const legacySettings = this.context.globalState.get<MCPSettings>('mcp.settings');
        if (legacySettings && legacySettings.servers.length > 0) {
            const stateManager = this.getStateManager();
            const existingServers = await stateManager.getMcpServers();
            if (existingServers.length === 0) {
                console.log('[MCPManager] Migrating from globalState to StateManager...');
                await stateManager.saveMcpServers(legacySettings.servers);
                await stateManager.saveMcpApprovedTools(legacySettings.approvedTools || []);
                // 레거시 데이터 정리
                await this.context.globalState.update('mcp.settings', undefined);
            }
        }
    }

    /**
     * StateManager에서 설정을 로드하여 인메모리 캐시에 반영
     */
    private async loadSettings(): Promise<void> {
        if (!this.context) return;

        const stateManager = this.getStateManager();
        const servers = await stateManager.getMcpServers() as MCPServerConfig[];
        const approvedTools = await stateManager.getMcpApprovedTools() as ApprovedMCPTool[];

        this.settings = {
            servers,
            approvedTools,
            enabled: true
        };

        // 서버 관리 MCP 설정 병합
        await this.mergeServerMCPConfigs();
    }

    /**
     * 서버(백엔드)에서 관리되는 MCP 설정을 별도 adminServers 배열로 로드
     * 개인 서버 목록(this.settings.servers)에는 병합하지 않음
     */
    private async mergeServerMCPConfigs(): Promise<void> {
        try {
            const { SettingsManager } = await import('../managers/state/SettingsManager');
            const settingsManager = SettingsManager.getInstance();
            const serverConfigs = settingsManager.getServerMCPConfigs();

            this.adminServers = [];

            if (!serverConfigs || serverConfigs.length === 0) {
                return;
            }

            for (const serverConfig of serverConfigs) {
                const configValue = serverConfig.value as MCPServerConfig;
                if (!configValue) continue;

                // transport type 추론
                if (!configValue.type) {
                    configValue.type = configValue.command ? 'stdio' : 'http';
                }

                const serverId = configValue.id || `server_${serverConfig.key}`;
                const enforcement = serverConfig.enforcement as string;
                // required가 아닌 모든 enforcement(recommended, preset 등)는 비활성화 가능
                const isDisabled = enforcement !== 'required' && settingsManager.isSettingDisabled('mcp_server', serverConfig.key);
                console.log(`[MCPManager] Admin server "${serverConfig.key}": enforcement=${enforcement}, isDisabled=${isDisabled}, enabled=${enforcement === 'required' ? true : !isDisabled}`);

                // 개인 목록에서 동일 ID 제거 (이전 병합 마이그레이션)
                const personalIdx = this.settings.servers.findIndex(s => s.id === serverId);
                if (personalIdx !== -1) {
                    this.settings.servers.splice(personalIdx, 1);
                }

                this.adminServers.push({
                    ...configValue,
                    id: serverId,
                    name: configValue.name || serverConfig.key,
                    enabled: enforcement === 'required' ? true : !isDisabled,
                    status: 'disconnected',
                    enforcement: enforcement as 'required' | 'recommended',
                    source: (serverConfig as any).source || 'admin',
                });
            }

            console.log(`[MCPManager] Loaded ${this.adminServers.length} admin MCP configs`);
        } catch (error) {
            console.warn('[MCPManager] Failed to load admin MCP configs (falling back to local-only):', error);
        }
    }

    /**
     * 인메모리 설정을 StateManager에 저장
     */
    private async saveSettings(): Promise<void> {
        if (!this.context) return;
        const stateManager = this.getStateManager();
        await stateManager.saveMcpServers(this.settings.servers);
        await stateManager.saveMcpApprovedTools(this.settings.approvedTools);
    }

    // ==================== 서버 관리 ====================

    /**
     * 개인/관리자 서버 통합 조회 (내부용)
     */
    private findServer(serverId: string): MCPServerConfig | AdminMCPServer | undefined {
        return this.settings.servers.find(s => s.id === serverId)
            || this.adminServers.find(s => s.id === serverId);
    }

    /**
     * 개인 서버 목록 조회
     */
    getServers(): MCPServerConfig[] {
        return [...this.settings.servers];
    }

    /**
     * 관리자 MCP 서버 목록 조회
     */
    getAdminServers(): AdminMCPServer[] {
        return [...this.adminServers];
    }

    /**
     * 서버 추가
     * 기존 ID가 있으면 유지, 없으면 새로 생성
     */
    async addServer(config: MCPServerConfig | Omit<MCPServerConfig, 'id'>): Promise<MCPServerConfig> {
        const id = ('id' in config && config.id)
            ? config.id
            : `mcp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // 이미 같은 ID의 서버가 있으면 중복 추가 방지
        const existing = this.settings.servers.find(s => s.id === id);
        if (existing) {
            console.log(`[MCPManager] Server already exists: ${id}`);
            return existing;
        }

        const server: MCPServerConfig = {
            ...config,
            id,
            status: 'disconnected'
        };

        this.settings.servers.push(server);
        await this.saveSettings();

        console.log(`[MCPManager] Server added: ${server.name} (id: ${id})`);
        return server;
    }

    /**
     * 서버 업데이트
     */
    async updateServer(id: string, updates: Partial<MCPServerConfig>): Promise<MCPServerConfig | null> {
        const index = this.settings.servers.findIndex(s => s.id === id);
        if (index === -1) return null;

        // 메모리 상태를 먼저 업데이트 (disconnect 내부 saveSettings가 올바른 상태를 저장하도록)
        this.settings.servers[index] = {
            ...this.settings.servers[index],
            ...updates,
            id // ID는 변경 불가
        };

        // 연결 해제 (내부 saveSettings에서 위에서 업데이트된 enabled 상태가 반영됨)
        if (this.clients.has(id)) {
            await this.disconnectFromServer(id);
        }

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
        const server = this.findServer(serverId);
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
            if (!this.isAdminServer(serverId)) {
                await this.saveSettings();
            }

            // 이벤트 발행
            this.emitEvent({
                type: 'connected',
                serverId: server.id,
                serverName: server.name,
                tools: client.tools
            });

        } catch (error) {
            server.status = 'error';
            if (!this.isAdminServer(serverId)) {
                await this.saveSettings();
            }

            const errorMessage = error instanceof Error ? error.message : String(error);

            this.emitEvent({
                type: 'error',
                serverId: server.id,
                serverName: server.name,
                error: errorMessage
            });

            // 에러 리포팅
            import('../../services/error/ErrorReportingService').then(({ ErrorReportingService }) => {
                ErrorReportingService.getInstance().reportMCPError(server.id, server.name, errorMessage);
            }).catch(() => {});

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

        const server = this.findServer(serverId);
        if (server) {
            server.status = 'disconnected';
            if (!this.isAdminServer(serverId)) {
                await this.saveSettings();
            }

            this.emitEvent({
                type: 'disconnected',
                serverId: server.id,
                serverName: server.name
            });
        }
    }

    /**
     * 연결 테스트 (성공 시 실제 연결도 유지)
     */
    async testConnection(serverId: string): Promise<{ success: boolean; error?: string; tools?: MCPToolInfo[] }> {
        const server = this.findServer(serverId);
        if (!server) {
            return { success: false, error: 'Server not found' };
        }

        // 기존 클라이언트가 있으면 먼저 정리
        if (this.clients.has(serverId)) {
            await this.disconnectFromServer(serverId);
        }

        // 실제 연결 시도 (성공하면 클라이언트를 유지)
        try {
            await this.connectToServer(serverId);
            const client = this.clients.get(serverId);
            return { success: true, tools: client?.tools || [] };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return { success: false, error: errorMessage };
        }
    }

    /**
     * 관리자 서버인지 확인
     */
    private isAdminServer(serverId: string): boolean {
        return this.adminServers.some(s => s.id === serverId);
    }

    /**
     * 관리자 MCP 서버 토글 (권장만 가능, 필수는 불가)
     */
    async toggleAdminServer(serverId: string, enabled: boolean): Promise<AdminMCPServer | null> {
        const server = this.adminServers.find(s => s.id === serverId);
        if (!server || server.enforcement === 'required') return null;

        server.enabled = enabled;

        if (enabled) {
            try {
                await this.connectToServer(serverId);
            } catch {
                // 연결 실패 시에도 enabled 상태 유지
            }
        } else {
            if (this.clients.has(serverId)) {
                await this.disconnectFromServer(serverId);
            }
            server.status = 'disconnected';
            server.tools = [];
        }

        // SettingsManager에 비활성화 상태 저장 (globalState)
        try {
            const { SettingsManager } = await import('../managers/state/SettingsManager');
            const settingsManager = SettingsManager.getInstance();
            // key 추출: serverId에서 "server_" prefix 제거
            const key = serverId.startsWith('server_') ? serverId.substring(7) : serverId;
            console.log(`[MCPManager] toggleAdminServer: serverId="${serverId}", key="${key}", disabled=${!enabled}`);
            await settingsManager.toggleRecommendedSetting('mcp_server', key, !enabled);
            console.log(`[MCPManager] toggleAdminServer: disabled state saved successfully`);
        } catch (err) {
            console.error('[MCPManager] Failed to save admin server disabled state:', err);
        }

        return server;
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
     * 도구 호출 (연결 끊어진 경우 자동 재연결 시도)
     */
    async callTool(serverId: string, toolName: string, args: Record<string, any>): Promise<MCPToolResult> {
        let client = this.clients.get(serverId);

        // 클라이언트가 없거나 연결이 끊어진 경우 재연결 시도
        if (!client || client.status !== 'connected') {
            console.log(`[MCPManager] Client not connected for ${serverId}, attempting reconnect...`);
            try {
                await this.connectToServer(serverId);
                client = this.clients.get(serverId);
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                console.error(`[MCPManager] Reconnect failed for ${serverId}: ${errorMsg}`);
                return {
                    success: false,
                    content: [],
                    error: `Server not connected and reconnect failed: ${errorMsg}`
                };
            }
        }

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
        this.adminServers = [];
        this.eventListeners = [];
        console.log('[MCPManager] Disposed');
    }
}
