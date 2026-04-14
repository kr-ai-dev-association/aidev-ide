/**
 * Tool Registry
 * Registry for registering and managing tool handlers
 */

import { IToolHandler } from "./IToolHandler";

export interface ToolRegistryEntry {
  handler: IToolHandler;
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
    });
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
    return Array.from(this.entries.values()).map((e) => e.handler);
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
   * Unregister all tools for a specific server (kept for API compat, no-op)
   */
  unregisterByServerId(_serverId: string): number {
    return 0;
  }

  /**
   * Check if tool exists
   */
  hasHandler(toolName: string): boolean {
    return this.entries.has(toolName);
  }
}
