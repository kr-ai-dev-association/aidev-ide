/**
 * Inline Code Completion Provider
 * 소스코드 자동완성 (Ghost Text / Tab Completion)
 * Continue/Copilot 방식: FIM(/api/generate) → chat fallback
 */

import * as vscode from "vscode";
import * as path from "path";
import { LLMManager } from "../managers/model/LLMManager";
import { StateManager } from "../managers/state/StateManager";

// 딜레이: 타이핑 중 과도한 API 호출 방지
const DEBOUNCE_MS = 500;

export class InlineCompletionProvider
  implements vscode.InlineCompletionItemProvider
{
  private abortController: AbortController | null = null;
  private isInFlight = false;
  private readonly outputChannel: vscode.OutputChannel;

  constructor(
    private readonly llmManager: LLMManager,
    private readonly stateManager: StateManager,
  ) {
    this.outputChannel = vscode.window.createOutputChannel(
      "AgentGoCoder Completion",
    );
  }

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken,
  ): Promise<vscode.InlineCompletionItem[]> {
    const enabled = vscode.workspace
      .getConfiguration("agentgocoder")
      .get<boolean>("inlineCompletion", false);
    if (!enabled) return [];

    // 빈 줄이면 스킵
    if (document.lineAt(position.line).text.trim() === "") return [];

    // 이미 요청 진행 중이면 skip
    if (this.isInFlight) {
      this.outputChannel.appendLine(`[Completion] skip (in-flight)`);
      return [];
    }

    // 이전 debounce 취소
    if (this.abortController) this.abortController.abort();
    this.abortController = new AbortController();
    token.onCancellationRequested(() => this.abortController?.abort());

    // 타이핑 멈춤 대기
    await new Promise((r) => setTimeout(r, DEBOUNCE_MS));
    if (token.isCancellationRequested) return [];

    const prefix = this.buildPrefix(document, position, 80);
    const suffix = this.buildSuffix(document, position, 25);
    const neighborContext = this.buildNeighborContext(document);
    const filename = path.basename(document.fileName);
    const language = document.languageId;

    this.outputChannel.appendLine(
      `[Completion] ${filename} (${language}) line ${position.line + 1}`,
    );

    this.isInFlight = true;
    try {
      const raw = await this.llmManager.sendInlineCompletion(
        neighborContext + prefix,
        suffix,
        this.stateManager,
        { signal: this.abortController.signal },
      );

      if (token.isCancellationRequested) {
        this.outputChannel.appendLine(`[Completion] cancelled`);
        return [];
      }
      const cleaned = raw.trim();
      if (!cleaned) {
        this.outputChannel.appendLine(`[Completion] empty response`);
        return [];
      }
      this.outputChannel.appendLine(
        `[Completion] OK: "${cleaned.slice(0, 60).replace(/\n/g, "↵")}${cleaned.length > 60 ? "..." : ""}"`,
      );
      return [new vscode.InlineCompletionItem(cleaned)];
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      if (
        msg.includes("aborted") ||
        msg.includes("abort") ||
        err?.name === "AbortError"
      ) {
        this.outputChannel.appendLine(`[Completion] aborted`);
      } else {
        this.outputChannel.appendLine(`[Completion] ERROR: ${msg}`);
      }
      return [];
    } finally {
      this.isInFlight = false;
    }
  }

  private buildNeighborContext(currentDoc: vscode.TextDocument): string {
    const snippets: string[] = [];
    for (const editor of vscode.window.visibleTextEditors) {
      const doc = editor.document;
      if (doc.uri.toString() === currentDoc.uri.toString()) continue;
      if (doc.uri.scheme !== "file") continue;
      const totalLines = doc.lineCount;
      if (totalLines === 0) continue;
      const maxSnippetLines = Math.min(30, totalLines);
      const startLine = Math.max(0, totalLines - maxSnippetLines);
      const snippet = doc.getText(
        new vscode.Range(
          new vscode.Position(startLine, 0),
          doc.lineAt(totalLines - 1).range.end,
        ),
      );
      snippets.push(`// File: ${path.basename(doc.fileName)}\n${snippet}\n`);
    }
    if (snippets.length === 0) return "";
    return snippets.join("\n") + "\n";
  }

  private buildPrefix(
    doc: vscode.TextDocument,
    pos: vscode.Position,
    maxLines: number,
  ): string {
    const startLine = Math.max(0, pos.line - maxLines);
    return doc.getText(
      new vscode.Range(new vscode.Position(startLine, 0), pos),
    );
  }

  private buildSuffix(
    doc: vscode.TextDocument,
    pos: vscode.Position,
    maxLines: number,
  ): string {
    const endLine = Math.min(doc.lineCount - 1, pos.line + maxLines);
    return doc.getText(new vscode.Range(pos, doc.lineAt(endLine).range.end));
  }
}
