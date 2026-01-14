/**
 * Diff View Provider (추상 클래스)
 */

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as diff from 'diff';

export abstract class DiffViewProvider {
    editType?: "create" | "modify" | "delete";
    isEditing = false;
    originalContent: string | undefined;
    protected documentWasOpen = false;
    protected absolutePath?: string;
    protected relPath?: string;
    protected newContent?: string;

    constructor() { }

    public async open(filePath: string, options?: { displayPath?: string }): Promise<void> {
        this.isEditing = true;
        this.absolutePath = filePath;
        this.relPath = options?.displayPath ?? filePath;

        try {
            this.originalContent = await fs.readFile(this.absolutePath, 'utf8');
            this.editType = 'modify';
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                this.originalContent = '';
                this.editType = 'create';
                // 새 파일의 경우, 디렉토리가 없으면 생성
                await fs.mkdir(path.dirname(this.absolutePath), { recursive: true });
                await fs.writeFile(this.absolutePath, '', 'utf8'); // 빈 파일 생성
            } else {
                throw error;
            }
        }
        await this.openDiffEditor();
        await this.scrollEditorToLine(0);
    }

    protected abstract openDiffEditor(): Promise<void>;
    protected abstract scrollEditorToLine(line: number): Promise<void>;
    protected abstract scrollAnimation(startLine: number, endLine: number): Promise<void>;
    protected abstract truncateDocument(lineNumber: number): Promise<void>;
    protected abstract getDocumentText(): Promise<string | undefined>;
    protected abstract saveDocument(): Promise<boolean>;
    protected abstract closeAllDiffViews(): Promise<void>;
    protected abstract resetDiffView(): Promise<void>;
    protected abstract replaceText(content: string, rangeToReplace: { startLine: number; endLine: number }, currentLine: number | undefined): Promise<void>;

    async update(accumulatedContent: string, isFinal: boolean, changeLocation?: { startLine: number; endLine: number; startChar: number; endChar: number }): Promise<void> {
        if (!this.isEditing) {
            throw new Error("Not editing any file");
        }
        this.newContent = accumulatedContent;
        const accumulatedLines = accumulatedContent.split("\n");

        const currentLine = accumulatedLines.length - 1;
        const contentToReplace = accumulatedLines.join("\n");
        const lineCount = (this.originalContent?.split('\n').length || 0) + accumulatedLines.length;
        const rangeToReplace = { startLine: 0, endLine: lineCount };

        // currentLine을 전달하여 updateOverlayAfterLine이 호출되도록 함
        await this.replaceText(contentToReplace, rangeToReplace, currentLine >= 0 ? currentLine : undefined);

        // truncateDocument는 사용되지 않음 (InlineDiffManager에서 직접 처리)
        // if (isFinal) {
        //     await this.truncateDocument(accumulatedLines.length);
        // }
    }

    async saveChanges(): Promise<{ newProblemsMessage: string | undefined; userEdits: string | undefined; autoFormattingEdits: string | undefined; finalContent: string | undefined; }> {
        if (!this.absolutePath || !this.newContent) {
            throw new Error("No file path or new content set for saving");
        }

        // diff 에디터에서 현재 내용 가져오기 (사용자가 수정했을 수 있음)
        const currentContent = await this.getDocumentText();
        const contentToSave = currentContent || this.newContent;

        // 실제 파일에 저장
        await fs.writeFile(this.absolutePath, contentToSave, 'utf8');

        await this.saveDocument();

        await this.resetDiffView();

        // 완전히 리셋하지 않고 isEditing만 false로 설정
        this.isEditing = false;

        return {
            newProblemsMessage: undefined, // TODO: 진단 기능 통합
            userEdits: undefined,
            autoFormattingEdits: undefined,
            finalContent: contentToSave,
        };
    }

    async revertChanges(): Promise<void> {
        if (!this.absolutePath || !this.isEditing) {
            return;
        }

        if (this.editType === "create") {
            // 새로 생성된 파일이면 삭제
            await this.saveDocument();
            await this.closeAllDiffViews();
            await fs.rm(this.absolutePath, { force: true });
            console.log(`File ${this.absolutePath} has been deleted.`);
        } else if (this.editType === "modify") {
            // 기존 파일이면 원본 내용으로 되돌리기
            const contents = await this.getDocumentText() || "";
            const lineCount = (contents.match(/\n/g) || []).length + 1;
            await this.replaceText(this.originalContent ?? "", { startLine: 0, endLine: lineCount }, undefined);
            await this.saveDocument();
            console.log(`File ${this.absolutePath} has been reverted to its original content.`);
        }

        // 되돌리기 후 decoration clear
        await this.resetDiffView();

        // 완전히 리셋하지 않고 isEditing만 false로 설정
        this.isEditing = false;
    }

    async scrollToFirstDiff() {
        if (!this.isEditing || !this.originalContent || !this.newContent) {
            return;
        }
        const diffs = diff.diffLines(this.originalContent, this.newContent);
        let lineCount = 0;
        for (const part of diffs) {
            if (part.added || part.removed) {
                this.scrollEditorToLine(lineCount);
                return;
            }
            if (!part.removed) {
                lineCount += part.count || 0;
            }
        }
    }

    async reset() {
        // reset은 승인/거부 후에만 호출되도록 하고,
        // 다른 파일로 이동했다가 돌아왔을 때는 diff view를 유지
        this.isEditing = false;
        // 상태는 유지 (다시 열 수 있도록)
        // this.editType = undefined;
        // this.absolutePath = undefined;
        // this.relPath = undefined;
        // this.originalContent = undefined;
        // this.newContent = undefined;
        await this.resetDiffView();
    }

    /**
     * 완전히 리셋 (승인/거부 후 호출)
     */
    async fullReset() {
        this.isEditing = false;
        this.editType = undefined;
        this.absolutePath = undefined;
        this.relPath = undefined;
        this.originalContent = undefined;
        this.newContent = undefined;
        await this.resetDiffView();
    }
}
