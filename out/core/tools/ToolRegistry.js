"use strict";
/**
 * Tool Registry
 * 툴 핸들러를 등록하고 관리하는 레지스트리
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ToolRegistry = void 0;
class ToolRegistry {
    static instance;
    handlers = new Map();
    constructor() { }
    static getInstance() {
        if (!ToolRegistry.instance) {
            ToolRegistry.instance = new ToolRegistry();
        }
        return ToolRegistry.instance;
    }
    /**
     * 툴 핸들러 등록
     */
    register(handler) {
        this.handlers.set(handler.name, handler);
        console.log(`[ToolRegistry] Registered tool: ${handler.name}`);
    }
    /**
     * 툴 핸들러 조회
     */
    getHandler(toolName) {
        return this.handlers.get(toolName);
    }
    /**
     * 등록된 모든 툴 이름 반환
     */
    getRegisteredTools() {
        return Array.from(this.handlers.keys());
    }
    /**
     * 모든 핸들러 반환
     */
    getAllHandlers() {
        return Array.from(this.handlers.values());
    }
}
exports.ToolRegistry = ToolRegistry;
//# sourceMappingURL=ToolRegistry.js.map