/**
 * Tool Registry
 * 툴 핸들러를 등록하고 관리하는 레지스트리
 *
 * v9.2.3: ToolRegistryEntry 메타데이터 기반으로 도구 출처 관리
 * mcp_ 프리픽스 대신 구조적 메타데이터(source, serverId)로 MCP 도구 식별
 */
export class ToolRegistry {
    static instance;
    entries = new Map();
    constructor() { }
    static getInstance() {
        if (!ToolRegistry.instance) {
            ToolRegistry.instance = new ToolRegistry();
        }
        return ToolRegistry.instance;
    }
    /**
     * 내장 도구 등록
     */
    register(handler) {
        this.entries.set(handler.name, {
            handler,
            source: 'builtin',
        });
        console.log(`[ToolRegistry] Registered tool: ${handler.name}`);
    }
    /**
     * MCP 도구 등록 (충돌 해결 포함)
     * @returns 실제 등록된 이름 (충돌 시 disambiguate된 이름)
     */
    registerMCP(handler, serverId, serverName, originalName) {
        const desiredName = handler.name;
        const existing = this.entries.get(desiredName);
        // Case 1: 충돌 없음
        if (!existing) {
            this.entries.set(desiredName, {
                handler, source: 'mcp', serverId, serverName, originalName,
            });
            console.log(`[ToolRegistry] Registered MCP tool: ${desiredName} (server: ${serverName})`);
            return desiredName;
        }
        // Case 2: 같은 서버 재연결 → 교체
        if (existing.source === 'mcp' && existing.serverId === serverId) {
            this.entries.set(desiredName, {
                handler, source: 'mcp', serverId, serverName, originalName,
            });
            console.log(`[ToolRegistry] Replaced MCP tool: ${desiredName} (server: ${serverName})`);
            return desiredName;
        }
        // Case 3: 다른 출처와 충돌 → disambiguate
        const sanitized = serverName.toLowerCase().replace(/[^a-z0-9]/g, '_');
        let disambiguated = `${sanitized}_${desiredName}`;
        let index = 2;
        while (this.entries.has(disambiguated)) {
            disambiguated = `${sanitized}_${desiredName}_${index}`;
            index++;
        }
        this.entries.set(disambiguated, {
            handler, source: 'mcp', serverId, serverName, originalName,
        });
        console.log(`[ToolRegistry] Registered MCP tool (disambiguated): ${disambiguated} (original: ${desiredName}, server: ${serverName})`);
        return disambiguated;
    }
    /**
     * 툴 핸들러 조회
     */
    getHandler(toolName) {
        return this.entries.get(toolName)?.handler;
    }
    /**
     * 엔트리 조회 (메타데이터 포함)
     */
    getEntry(toolName) {
        return this.entries.get(toolName);
    }
    /**
     * 등록된 모든 툴 이름 반환
     */
    getRegisteredTools() {
        return Array.from(this.entries.keys());
    }
    /**
     * 모든 핸들러 반환
     */
    getAllHandlers() {
        return Array.from(this.entries.values()).map(e => e.handler);
    }
    /**
     * 툴 핸들러 해제
     */
    unregister(toolName) {
        const existed = this.entries.has(toolName);
        if (existed) {
            this.entries.delete(toolName);
            console.log(`[ToolRegistry] Unregistered tool: ${toolName}`);
        }
        return existed;
    }
    /**
     * 특정 서버의 모든 MCP 도구 해제 (서버 연결 해제 시)
     */
    unregisterByServerId(serverId) {
        let count = 0;
        for (const [name, entry] of this.entries) {
            if (entry.source === 'mcp' && entry.serverId === serverId) {
                this.entries.delete(name);
                console.log(`[ToolRegistry] Unregistered MCP tool: ${name}`);
                count++;
            }
        }
        return count;
    }
    /**
     * 도구 존재 여부 확인
     */
    hasHandler(toolName) {
        return this.entries.has(toolName);
    }
    /**
     * MCP 도구인지 확인 (메타데이터 기반)
     */
    isMCPTool(toolName) {
        const entry = this.entries.get(toolName);
        return entry?.source === 'mcp';
    }
    /**
     * MCP 도구 핸들러 목록만 반환 (메타데이터 기반)
     */
    getMCPTools() {
        return Array.from(this.entries.values())
            .filter(e => e.source === 'mcp')
            .map(e => e.handler);
    }
}
//# sourceMappingURL=ToolRegistry.js.map