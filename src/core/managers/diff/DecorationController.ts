/**
 * Decoration Controller
 * diff 에디터의 시각적 피드백을 위한 장식 관리
 * 커서 IDE 방식: 삭제/추가 라인 하이라이트
 */

import * as vscode from "vscode";

const fadedOverlayDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: "rgba(255, 255, 0, 0.1)",
    opacity: "0.4",
    isWholeLine: true,
});

const activeLineDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: "rgba(255, 255, 0, 0.3)",
    opacity: "1",
    isWholeLine: true,
    border: "1px solid rgba(255, 255, 0, 0.5)",
});

// 커서 IDE 방식: 추가된 라인 (초록색)
export const addedLineDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor('diffEditor.insertedLineBackground'),
    isWholeLine: true,
    overviewRulerColor: 'green',
    overviewRulerLane: vscode.OverviewRulerLane.Left,
});

// 커서 IDE 방식: 삭제된 라인 (빨간색, 취소선)
export const deletedLineDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor('diffEditor.removedLineBackground'),
    textDecoration: 'line-through',
    isWholeLine: true,
    overviewRulerColor: 'red',
    overviewRulerLane: vscode.OverviewRulerLane.Left,
});

type DecorationType = "fadedOverlay" | "activeLine" | "addedLine" | "deletedLine";

export class DecorationController {
    private decorationType: DecorationType;
    private editor: vscode.TextEditor;
    private ranges: vscode.Range[] = [];

    constructor(decorationType: DecorationType, editor: vscode.TextEditor) {
        this.decorationType = decorationType;
        this.editor = editor;
    }

    getDecoration() {
        switch (this.decorationType) {
            case "fadedOverlay":
                return fadedOverlayDecorationType;
            case "activeLine":
                return activeLineDecorationType;
            case "addedLine":
                return addedLineDecorationType;
            case "deletedLine":
                return deletedLineDecorationType;
        }
    }

    addLines(startIndex: number, numLines: number) {
        if (startIndex < 0 || numLines <= 0) {
            return;
        }

        const lastRange = this.ranges[this.ranges.length - 1];
        if (lastRange && lastRange.end.line === startIndex - 1) {
            this.ranges[this.ranges.length - 1] = lastRange.with(undefined, lastRange.end.translate(numLines));
        } else {
            const endLine = startIndex + numLines - 1;
            this.ranges.push(new vscode.Range(startIndex, 0, endLine, Number.MAX_SAFE_INTEGER));
        }

        this.editor.setDecorations(this.getDecoration(), this.ranges);
    }

    clear() {
        this.ranges = [];
        this.editor.setDecorations(this.getDecoration(), this.ranges);
    }

    updateOverlayAfterLine(line: number, totalLines: number) {
        this.ranges = this.ranges.filter((range) => range.end.line < line);

        if (line < totalLines - 1) {
            this.ranges.push(
                new vscode.Range(new vscode.Position(line + 1, 0), new vscode.Position(totalLines - 1, Number.MAX_SAFE_INTEGER)),
            );
        }

        this.editor.setDecorations(this.getDecoration(), this.ranges);
    }

    setActiveLine(line: number) {
        this.ranges = [new vscode.Range(line, 0, line, Number.MAX_SAFE_INTEGER)];
        this.editor.setDecorations(this.getDecoration(), this.ranges);
    }
}
