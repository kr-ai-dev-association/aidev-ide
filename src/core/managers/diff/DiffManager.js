/**
 * Diff Manager
 * VS Code의 diff 에디터를 열고 관리
 */
import * as vscode from 'vscode';
import * as path from 'path';
import { DIFF_VIEW_URI_SCHEME } from './DiffContentProvider';
import { FileChangeTracker } from '../action/file/FileChangeTracker';
export class DiffManager {
    static instance;
    constructor() { }
    static getInstance() {
        if (!DiffManager.instance) {
            DiffManager.instance = new DiffManager();
        }
        return DiffManager.instance;
    }
    /**
     * 단일 파일 diff 열기
     */
    async openSingleFileDiff(filePath, originalContent, modifiedContent, title) {
        const uri = vscode.Uri.file(filePath);
        const fileName = path.basename(filePath);
        // 원본 내용을 커스텀 URI로 생성 (base64 인코딩)
        const originalUri = vscode.Uri.from({
            scheme: DIFF_VIEW_URI_SCHEME,
            path: `/${fileName}`,
            query: Buffer.from(originalContent).toString("base64"),
        });
        const diffTitle = title || `${fileName}: Original ↔ Changes`;
        try {
            await vscode.commands.executeCommand("vscode.diff", originalUri, uri, diffTitle, { preserveFocus: true });
            console.log(`[DiffManager] Opened diff for ${filePath}`);
        }
        catch (error) {
            console.error('[DiffManager] Failed to open diff editor:', error);
            vscode.window.showErrorMessage(`Failed to open diff view: ${error}`);
        }
    }
    /**
     * 여러 파일 diff 열기
     */
    async openMultiFileDiff(diffs, title = "File Changes") {
        if (diffs.length === 0) {
            vscode.window.showInformationMessage("No changes to display");
            return;
        }
        for (const diff of diffs) {
            await this.openSingleFileDiff(diff.filePath, diff.leftContent, diff.rightContent, `${title}: ${path.basename(diff.filePath)}`);
        }
    }
    /**
     * FileChangeTracker에서 변경된 파일들의 diff 표시
     */
    async showChangedFilesDiff(filePaths, sinceTimestamp) {
        const fileChangeTracker = FileChangeTracker.getInstance();
        const filesToShow = filePaths || fileChangeTracker.getTrackedFiles();
        const diffs = [];
        for (const filePath of filesToShow) {
            const history = fileChangeTracker.getChangeHistory(filePath);
            if (history.length === 0)
                continue;
            const relevantChanges = sinceTimestamp
                ? history.filter(c => c.timestamp >= sinceTimestamp)
                : history;
            if (relevantChanges.length === 0)
                continue;
            const latestChange = relevantChanges[relevantChanges.length - 1];
            if (latestChange.beforeContent !== undefined &&
                latestChange.afterContent !== undefined) {
                diffs.push({
                    filePath,
                    leftContent: latestChange.beforeContent,
                    rightContent: latestChange.afterContent,
                });
            }
        }
        if (diffs.length === 0) {
            vscode.window.showInformationMessage("No changes found");
            return;
        }
        await this.openMultiFileDiff(diffs, "Changes");
    }
    /**
     * 특정 파일의 diff 표시
     */
    async showFileDiff(filePath) {
        const fileChangeTracker = FileChangeTracker.getInstance();
        const history = fileChangeTracker.getChangeHistory(filePath);
        if (history.length === 0) {
            vscode.window.showInformationMessage(`No changes found for ${filePath}`);
            return;
        }
        const latestChange = history[history.length - 1];
        if (latestChange.beforeContent !== undefined &&
            latestChange.afterContent !== undefined) {
            await this.openSingleFileDiff(filePath, latestChange.beforeContent, latestChange.afterContent);
        }
    }
    /**
     * 작업 디렉토리의 모든 변경사항 표시
     */
    async showWorkingDirectoryChanges() {
        await this.showChangedFilesDiff();
    }
}
//# sourceMappingURL=DiffManager.js.map