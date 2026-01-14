/**
 * VS Code Diff View Provider
 * 커서 IDE 방식의 인라인 diff 구현
 */

import * as vscode from "vscode";
import * as path from "path";
import { DiffViewProvider } from "./DiffViewProvider";
import { InlineDiffManager } from "./InlineDiffManager";
import { DiffCodeLensProvider } from "./DiffCodeLensProvider";

export class VscodeDiffViewProvider extends DiffViewProvider {
    private activeEditor?: vscode.TextEditor;
    private inlineDiffManager: InlineDiffManager;
    private codeLensProvider: DiffCodeLensProvider;

    constructor() {
        super();
        this.inlineDiffManager = InlineDiffManager.getInstance();
        this.codeLensProvider = DiffCodeLensProvider.getInstance();
    }

    override async openDiffEditor(): Promise<void> {
        if (!this.absolutePath) {
            throw new Error("No file path set");
        }

        const uri = vscode.Uri.file(this.absolutePath);

        // 커서 IDE 방식: 단일 파일 에디터 열기 (side-by-side diff view 사용 안 함)
        // 이미 열려있는 에디터가 있는지 확인
        let editor = vscode.window.visibleTextEditors.find(
            e => e.document.uri.fsPath === this.absolutePath
        );

        if (!editor) {
            editor = await vscode.window.showTextDocument(uri, {
                preserveFocus: false,
                preview: false,
            });
        } else {
            editor = await vscode.window.showTextDocument(editor.document, {
                preserveFocus: false,
            });
        }

        this.activeEditor = editor;

        // 인라인 diff 표시 (원본과 새 내용 비교)
        if (this.originalContent !== undefined && this.newContent !== undefined) {
            await this.inlineDiffManager.showInlineDiff(
                this.absolutePath,
                this.originalContent,
                this.newContent
            );
        }

        // CodeLens 새로고침 (Accept/Reject 버튼 표시)
        this.codeLensProvider.refresh();
    }

    override async replaceText(
        content: string,
        rangeToReplace: { startLine: number; endLine: number },
        currentLine: number | undefined,
    ): Promise<void> {
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
            await this.inlineDiffManager.showInlineDiff(
                this.absolutePath!,
                this.originalContent,
                content
            );
            this.codeLensProvider.refresh();
        }
    }

    protected override async getDocumentText(): Promise<string | undefined> {
        if (!this.activeEditor || !this.activeEditor.document) {
            return undefined;
        }
        return this.activeEditor.document.getText();
    }

    protected override async saveDocument(): Promise<boolean> {
        if (!this.activeEditor) {
            return false;
        }
        if (!this.activeEditor.document.isDirty) {
            return false;
        }
        await this.activeEditor.document.save();
        return true;
    }

    protected override async closeAllDiffViews(): Promise<void> {
        // 커서 IDE 방식: 에디터는 닫지 않고 유지
        // decoration만 제거
    }

    protected override async resetDiffView(): Promise<void> {
        // 인라인 diff decoration 제거
        if (this.absolutePath) {
            const changes = this.inlineDiffManager.getChanges(this.absolutePath);
            // 모든 변경사항 decoration 제거는 InlineDiffManager에서 처리
            // CodeLens도 새로고침
            this.codeLensProvider.refresh();
        }
    }

    override async scrollEditorToLine(line: number): Promise<void> {
        if (!this.activeEditor) {
            return;
        }
        const scrollLine = Math.max(0, line - 2);
        this.activeEditor.revealRange(new vscode.Range(scrollLine, 0, scrollLine, 0), vscode.TextEditorRevealType.InCenter);
    }

    override async scrollAnimation(_startLine: number, _endLine: number): Promise<void> {
        // 사용되지 않음 - InlineDiffManager에서 직접 처리
    }

    override async truncateDocument(_lineNumber: number): Promise<void> {
        // 사용되지 않음 - InlineDiffManager에서 직접 처리
    }
}
