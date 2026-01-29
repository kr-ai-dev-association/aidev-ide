/**
 * Tool Registry
 * 툴 핸들러를 등록하고 관리하는 레지스트리
 */

import { IToolHandler } from './IToolHandler';

export class ToolRegistry {
    private static instance: ToolRegistry;
    private handlers = new Map<string, IToolHandler>();
    
    private constructor() {}
    
    static getInstance(): ToolRegistry {
        if (!ToolRegistry.instance) {
            ToolRegistry.instance = new ToolRegistry();
        }
        return ToolRegistry.instance;
    }
    
    /**
     * 툴 핸들러 등록
     */
    register(handler: IToolHandler): void {
        this.handlers.set(handler.name, handler);
        console.log(`[ToolRegistry] Registered tool: ${handler.name}`);
    }
    
    /**
     * 툴 핸들러 조회
     */
    getHandler(toolName: string): IToolHandler | undefined {
        return this.handlers.get(toolName);
    }
    
    /**
     * 등록된 모든 툴 이름 반환
     */
    getRegisteredTools(): string[] {
        return Array.from(this.handlers.keys());
    }
    
    /**
     * 모든 핸들러 반환
     */
    getAllHandlers(): IToolHandler[] {
        return Array.from(this.handlers.values());
    }

    /**
     * 툴 핸들러 해제 (MCP 도구 동적 해제용)
     */
    unregister(toolName: string): boolean {
        const existed = this.handlers.has(toolName);
        if (existed) {
            this.handlers.delete(toolName);
            console.log(`[ToolRegistry] Unregistered tool: ${toolName}`);
        }
        return existed;
    }

    /**
     * 특정 prefix로 시작하는 모든 도구 해제 (MCP 서버 연결 해제 시)
     */
    unregisterByPrefix(prefix: string): number {
        let count = 0;
        for (const toolName of this.handlers.keys()) {
            if (toolName.startsWith(prefix)) {
                this.handlers.delete(toolName);
                console.log(`[ToolRegistry] Unregistered tool: ${toolName}`);
                count++;
            }
        }
        return count;
    }

    /**
     * 도구 존재 여부 확인
     */
    hasHandler(toolName: string): boolean {
        return this.handlers.has(toolName);
    }

    /**
     * MCP 도구인지 확인
     */
    isMCPTool(toolName: string): boolean {
        return toolName.startsWith('mcp_');
    }

    /**
     * MCP 도구 목록만 반환
     */
    getMCPTools(): IToolHandler[] {
        return Array.from(this.handlers.values()).filter(h => h.name.startsWith('mcp_'));
    }
}

