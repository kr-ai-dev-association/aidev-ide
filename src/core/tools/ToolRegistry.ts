/**
 * Tool Registry
 * Registry for registering and managing tool handlers
 *
 * v9.2.3: Manages tool source via ToolRegistryEntry metadata
 * Identifies MCP tools with structural metadata (source, serverId) instead of mcp_ prefix
 */

import { IToolHandler } from './IToolHandler';

export type ToolSource = 'builtin' | 'mcp';

export interface ToolRegistryEntry {
    handler: IToolHandler;
    source: ToolSource;
    serverId?: string;
    serverName?: string;
    originalName?: string;  // Preserve original name when disambiguated due to conflict
}

export class ToolRegistry {
    private static instance: ToolRegistry;
    private entries = new Map<string, ToolRegistryEntry>();

    private constructor() {}

    static getInstance(): ToolRegistry {
        if (!ToolRegistry.instance) {
            ToolRegistry.instance = new ToolRegistry();
        }
        return ToolRegistry.instance;
    }

    /**
     * Register built-in tool
     */
    register(handler: IToolHandler): void {
        this.entries.set(handler.name, {
            handler,
            source: 'builtin',
        });
    }

    /**
     * Register MCP tool (with conflict resolution)
     * @returns Actually registered name (disambiguated name on conflict)
     */
    registerMCP(handler: IToolHandler, serverId: string, serverName: string, originalName: string): string {
        const desiredName = handler.name;
        const existing = this.entries.get(desiredName);

        // Case 1: No conflict
        if (!existing) {
            this.entries.set(desiredName, {
                handler, source: 'mcp', serverId, serverName, originalName,
            });
            return desiredName;
        }

        // Case 2: Same server reconnection -> replace
        if (existing.source === 'mcp' && existing.serverId === serverId) {
            this.entries.set(desiredName, {
                handler, source: 'mcp', serverId, serverName, originalName,
            });
            return desiredName;
        }

        // Case 3: Conflict with different source -> disambiguate
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
        return disambiguated;
    }

    /**
     * Look up tool handler
     */
    getHandler(toolName: string): IToolHandler | undefined {
        return this.entries.get(toolName)?.handler;
    }

    /**
     * Look up entry (with metadata)
     */
    getEntry(toolName: string): ToolRegistryEntry | undefined {
        return this.entries.get(toolName);
    }

    /**
     * Return all registered tool names
     */
    getRegisteredTools(): string[] {
        return Array.from(this.entries.keys());
    }

    /**
     * Return all handlers
     */
    getAllHandlers(): IToolHandler[] {
        return Array.from(this.entries.values()).map(e => e.handler);
    }

    /**
     * Unregister tool handler
     */
    unregister(toolName: string): boolean {
        const existed = this.entries.has(toolName);
        if (existed) {
            this.entries.delete(toolName);
            console.log(`[ToolRegistry] Unregistered tool: ${toolName}`);
        }
        return existed;
    }

    /**
     * Unregister all MCP tools for a specific server (on server disconnect)
     */
    unregisterByServerId(serverId: string): number {
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
     * Check if tool exists
     */
    hasHandler(toolName: string): boolean {
        return this.entries.has(toolName);
    }

    /**
     * Check if tool is MCP (metadata-based)
     */
    isMCPTool(toolName: string): boolean {
        const entry = this.entries.get(toolName);
        return entry?.source === 'mcp';
    }

    /**
     * Return only MCP tool handlers (metadata-based)
     */
    getMCPTools(): IToolHandler[] {
        return Array.from(this.entries.values())
            .filter(e => e.source === 'mcp')
            .map(e => e.handler);
    }
}
