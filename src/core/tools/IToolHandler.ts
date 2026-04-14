/**
 * Tool Handler Interface
 * 툴 핸들러 인터페이스 정의
 */

import * as vscode from "vscode";
import { ToolUse, ToolResponse } from "./types";
import { ActionManager } from "../managers/action/ActionManager";
import { ExecutionManager } from "../managers/execution/ExecutionManager";
import { TerminalManager } from "../managers/terminal/TerminalManager";
import { ContextManager } from "../managers/context/ContextManager";

export interface IToolHandler {
  readonly name: string;

  /**
   * 툴 실행
   */
  execute(
    toolUse: ToolUse,
    context: ToolExecutionContext,
  ): Promise<ToolResponse>;

  /**
   * 부분 블록 처리 (스트리밍 중)
   */
  handlePartialBlock?(
    toolUse: ToolUse,
    context: ToolExecutionContext,
  ): Promise<void>;

  /**
   * 툴 설명 (UI 표시용)
   */
  getDescription(toolUse: ToolUse): string;
}

export interface ToolExecutionContext {
  projectRoot: string;
  workspaceRoot: string;
  currentFile?: string;
  actionManager: ActionManager;
  executionManager: ExecutionManager;
  terminalManager: TerminalManager;
  contextManager: ContextManager;
  webview?: vscode.Webview; // diff 승인을 위한 webview
  conversationTurnId?: string; // LLM 턴 식별자 (턴 단위 Accept/Reject용)
}
