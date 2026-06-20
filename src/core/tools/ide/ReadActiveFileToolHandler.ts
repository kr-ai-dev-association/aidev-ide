/**
 * Read Active File Tool Handler
 * Reads the currently open file in VSCode
 */

import * as vscode from 'vscode';
import { IToolHandler, ToolExecutionContext } from '../IToolHandler';
import { ToolUse, ToolResponse, Tool } from '../types';

export class ReadActiveFileToolHandler implements IToolHandler {
    readonly name = Tool.READ_ACTIVE_FILE;

    getDescription(toolUse: ToolUse): string {
        return 'Read currently open file';
    }

    async execute(toolUse: ToolUse, context: ToolExecutionContext): Promise<ToolResponse> {
        try {
            const activeEditor = vscode.window.activeTextEditor;

            if (!activeEditor) {
                return {
                    success: false,
                    message: 'No file is currently open in the editor.',
                    error: { code: 'NO_ACTIVE_FILE', message: 'No active editor found' }
                };
            }

            const document = activeEditor.document;
            const filePath = document.fileName;
            const content = document.getText();
            const lineCount = document.lineCount;
            const languageId = document.languageId;

            // Truncate if file is too large
            const MAX_LINES = 300;
            let displayContent = content;
            let truncated = false;

            if (lineCount > MAX_LINES) {
                const lines = content.split('\n');
                const headLines = lines.slice(0, 50).join('\n');
                const tailLines = lines.slice(-30).join('\n');

                displayContent = `=== FILE INFO ===
Path: ${filePath}
Language: ${languageId}
Total Lines: ${lineCount}
Status: TRUNCATED (showing head 50 + tail 30 lines)

=== HEAD (lines 1-50) ===
${headLines}

=== TAIL (lines ${lineCount - 29}-${lineCount}) ===
${tailLines}

=== HOW TO READ MORE ===
Use read_file with startLine/endLine parameters to read specific ranges.`;

                truncated = true;
            }

            // Include selection if present
            const selection = activeEditor.selection;
            let selectionInfo = '';
            if (!selection.isEmpty) {
                const selectedText = document.getText(selection);
                selectionInfo = `\n\n=== CURRENT SELECTION (lines ${selection.start.line + 1}-${selection.end.line + 1}) ===\n${selectedText}`;
            }

            const result = truncated
                ? displayContent + selectionInfo
                : `=== FILE: ${filePath} ===
Language: ${languageId}
Lines: ${lineCount}
${selectionInfo ? selectionInfo + '\n\n=== FULL CONTENT ===\n' : ''}
${content}`;

            return {
                success: true,
                message: result,
                filePath: filePath,
                data: {
                    path: filePath,
                    language: languageId,
                    lineCount: lineCount,
                    truncated: truncated,
                    hasSelection: !selection.isEmpty
                }
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
                success: false,
                message: `Failed to read active file: ${errorMessage}`,
                error: { code: 'READ_ERROR', message: errorMessage }
            };
        }
    }
}
