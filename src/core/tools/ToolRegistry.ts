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
}

