"use strict";
/**
 * VS Code Diff View Provider
 * 커서 IDE 방식의 인라인 diff 구현
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
exports.VscodeDiffViewProvider = void 0;
const vscode = __importStar(require("vscode"));
const DiffViewProvider_1 = require("./DiffViewProvider");
const InlineDiffManager_1 = require("./InlineDiffManager");
const DiffCodeLensProvider_1 = require("./DiffCodeLensProvider");
class VscodeDiffViewProvider extends DiffViewProvider_1.DiffViewProvider {
    activeEditor;
    inlineDiffManager;
    codeLensProvider;
    constructor() {
        super();
        this.inlineDiffManager = InlineDiffManager_1.InlineDiffManager.getInstance();
        this.codeLensProvider = DiffCodeLensProvider_1.DiffCodeLensProvider.getInstance();
    }
    async openDiffEditor() {
        if (!this.absolutePath) {
            throw new Error("No file path set");
        }
        const uri = vscode.Uri.file(this.absolutePath);
        // 커서 IDE 방식: 단일 파일 에디터 열기 (side-by-side diff view 사용 안 함)
        // 이미 열려있는 에디터가 있는지 확인
        let editor = vscode.window.visibleTextEditors.find(e => e.document.uri.fsPath === this.absolutePath);
        if (!editor) {
            editor = await vscode.window.showTextDocument(uri, {
                preserveFocus: false,
                preview: false,
            });
        }
        else {
            editor = await vscode.window.showTextDocument(editor.document, {
                preserveFocus: false,
            });
        }
        this.activeEditor = editor;
        // 인라인 diff 표시 (원본과 새 내용 비교)
        if (this.originalContent !== undefined && this.newContent !== undefined) {
            await this.inlineDiffManager.showInlineDiff(this.absolutePath, this.originalContent, this.newContent);
        }
        // CodeLens 새로고침 (Accept/Reject 버튼 표시)
        this.codeLensProvider.refresh();
    }
    async replaceText(content, rangeToReplace, currentLine) {
        if (!this.activeEditor || !this.activeEditor.document) {
            throw new Error("User closed text editor, unable to edit file...");
        }
        const document = this.activeEditor.document;
        const edit = new vscode.WorkspaceEdit();
        const range = new vscode.Range(rangeToReplace.startLine, 0, rangeToReplace.endLine, 0);
        edit.replace(document.uri, range, content);
        await vscode.workspace.applyEdit(edit);
        // 인라인 diff 재적용
        if (this.originalContent !== undefined && this.newContent !== undefined) {
            await this.inlineDiffManager.showInlineDiff(this.absolutePath, this.originalContent, content);
            this.codeLensProvider.refresh();
        }
    }
    async getDocumentText() {
        if (!this.activeEditor || !this.activeEditor.document) {
            return undefined;
        }
        return this.activeEditor.document.getText();
    }
    async saveDocument() {
        if (!this.activeEditor) {
            return false;
        }
        if (!this.activeEditor.document.isDirty) {
            return false;
        }
        await this.activeEditor.document.save();
        return true;
    }
    async closeAllDiffViews() {
        // 커서 IDE 방식: 에디터는 닫지 않고 유지
        // decoration만 제거
    }
    async resetDiffView() {
        // 인라인 diff decoration 제거
        if (this.absolutePath) {
            const changes = this.inlineDiffManager.getChanges(this.absolutePath);
            // 모든 변경사항 decoration 제거는 InlineDiffManager에서 처리
            // CodeLens도 새로고침
            this.codeLensProvider.refresh();
        }
    }
    async scrollEditorToLine(line) {
        if (!this.activeEditor) {
            return;
        }
        const scrollLine = Math.max(0, line - 2);
        this.activeEditor.revealRange(new vscode.Range(scrollLine, 0, scrollLine, 0), vscode.TextEditorRevealType.InCenter);
    }
    async scrollAnimation(_startLine, _endLine) {
        // 사용되지 않음 - InlineDiffManager에서 직접 처리
    }
    async truncateDocument(_lineNumber) {
        // 사용되지 않음 - InlineDiffManager에서 직접 처리
    }
}
exports.VscodeDiffViewProvider = VscodeDiffViewProvider;
//# sourceMappingURL=VscodeDiffViewProvider.js.map