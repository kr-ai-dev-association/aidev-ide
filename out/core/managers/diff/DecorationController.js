"use strict";
/**
 * Decoration Controller
 * diff 에디터의 시각적 피드백을 위한 장식 관리
 * 커서 IDE 방식: 삭제/추가 라인 하이라이트
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DecorationController = exports.deletedLineDecorationType = exports.addedLineDecorationType = void 0;
const vscode = __importStar(require("vscode"));
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
exports.addedLineDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor('diffEditor.insertedLineBackground'),
    isWholeLine: true,
    overviewRulerColor: 'green',
    overviewRulerLane: vscode.OverviewRulerLane.Left,
});
// 커서 IDE 방식: 삭제된 라인 (빨간색, 취소선)
exports.deletedLineDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor('diffEditor.removedLineBackground'),
    textDecoration: 'line-through',
    isWholeLine: true,
    overviewRulerColor: 'red',
    overviewRulerLane: vscode.OverviewRulerLane.Left,
});
class DecorationController {
    decorationType;
    editor;
    ranges = [];
    constructor(decorationType, editor) {
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
                return exports.addedLineDecorationType;
            case "deletedLine":
                return exports.deletedLineDecorationType;
        }
    }
    addLines(startIndex, numLines) {
        if (startIndex < 0 || numLines <= 0) {
            return;
        }
        const lastRange = this.ranges[this.ranges.length - 1];
        if (lastRange && lastRange.end.line === startIndex - 1) {
            this.ranges[this.ranges.length - 1] = lastRange.with(undefined, lastRange.end.translate(numLines));
        }
        else {
            const endLine = startIndex + numLines - 1;
            this.ranges.push(new vscode.Range(startIndex, 0, endLine, Number.MAX_SAFE_INTEGER));
        }
        this.editor.setDecorations(this.getDecoration(), this.ranges);
    }
    clear() {
        this.ranges = [];
        this.editor.setDecorations(this.getDecoration(), this.ranges);
    }
    updateOverlayAfterLine(line, totalLines) {
        this.ranges = this.ranges.filter((range) => range.end.line < line);
        if (line < totalLines - 1) {
            this.ranges.push(new vscode.Range(new vscode.Position(line + 1, 0), new vscode.Position(totalLines - 1, Number.MAX_SAFE_INTEGER)));
        }
        this.editor.setDecorations(this.getDecoration(), this.ranges);
    }
    setActiveLine(line) {
        this.ranges = [new vscode.Range(line, 0, line, Number.MAX_SAFE_INTEGER)];
        this.editor.setDecorations(this.getDecoration(), this.ranges);
    }
}
exports.DecorationController = DecorationController;
//# sourceMappingURL=DecorationController.js.map