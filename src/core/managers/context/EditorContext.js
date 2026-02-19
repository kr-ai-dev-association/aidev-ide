/**
 * Editor Context
 * 에디터 컨텍스트를 수집하는 클래스
 */
import * as vscode from 'vscode';
export class EditorContextCollector {
    /**
     * 커서 컨텍스트를 수집합니다
     */
    async collectCursorContext() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return null;
        }
        const document = editor.document;
        const position = editor.selection.active;
        const line = position.line;
        // 현재 라인 텍스트
        const currentLineText = document.lineAt(line).text;
        // 주변 라인 (위 5줄, 아래 5줄)
        const surroundingLines = [];
        const startLine = Math.max(0, line - 5);
        const endLine = Math.min(document.lineCount - 1, line + 5);
        for (let i = startLine; i <= endLine; i++) {
            surroundingLines.push(document.lineAt(i).text);
        }
        // 커서 위치의 심볼 찾기
        const symbolAtCursor = await this.getSymbolAtPosition(document, position);
        const cursorContext = {
            line: position.line,
            column: position.character,
            file: document.uri.fsPath,
            currentLineText,
            surroundingLines,
            symbolAtCursor
        };
        console.log(`[EditorContext] Collected cursor context: line ${line}, column ${position.character}`);
        return cursorContext;
    }
    /**
     * 선택된 텍스트 컨텍스트를 수집합니다
     */
    async collectSelectionContext() {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.selection.isEmpty) {
            return null;
        }
        const document = editor.document;
        const selection = editor.selection;
        // 선택된 텍스트
        const text = document.getText(selection);
        // 주변 코드 (선택 영역 위아래 각 3줄)
        const surroundingLines = [];
        const startLine = Math.max(0, selection.start.line - 3);
        const endLine = Math.min(document.lineCount - 1, selection.end.line + 3);
        for (let i = startLine; i <= endLine; i++) {
            if (i < selection.start.line || i > selection.end.line) {
                surroundingLines.push(document.lineAt(i).text);
            }
        }
        const selectionContext = {
            text,
            startLine: selection.start.line,
            endLine: selection.end.line,
            startColumn: selection.start.character,
            endColumn: selection.end.character,
            file: document.uri.fsPath,
            surroundingCode: surroundingLines.join('\n')
        };
        console.log(`[EditorContext] Collected selection context: ${selection.start.line}-${selection.end.line}`);
        return selectionContext;
    }
    /**
     * 커서 위치의 심볼을 가져옵니다
     */
    async getSymbolAtPosition(document, position) {
        try {
            // 문서 심볼 가져오기
            const symbols = await vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', document.uri);
            if (!symbols || symbols.length === 0) {
                return undefined;
            }
            // 위치에 해당하는 심볼 찾기
            const symbol = this.findSymbolAtPosition(symbols, position);
            if (!symbol) {
                return undefined;
            }
            return {
                name: symbol.name,
                kind: symbol.kind,
                range: {
                    start: {
                        line: symbol.range.start.line,
                        column: symbol.range.start.character
                    },
                    end: {
                        line: symbol.range.end.line,
                        column: symbol.range.end.character
                    }
                },
                definition: document.getText(symbol.range)
            };
        }
        catch (error) {
            console.warn('[EditorContext] Failed to get symbol:', error);
            return undefined;
        }
    }
    /**
     * 위치에 해당하는 심볼을 찾습니다
     */
    findSymbolAtPosition(symbols, position) {
        for (const symbol of symbols) {
            // 심볼 범위에 위치가 포함되는지 확인
            if (symbol.range.contains(position)) {
                // 자식 심볼 확인
                if (symbol.children && symbol.children.length > 0) {
                    const childSymbol = this.findSymbolAtPosition(symbol.children, position);
                    if (childSymbol) {
                        return childSymbol;
                    }
                }
                return symbol;
            }
        }
        return undefined;
    }
}
//# sourceMappingURL=EditorContext.js.map