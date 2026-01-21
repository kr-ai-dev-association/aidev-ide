"use strict";
/**
 * Diff Manager
 * VS Code의 diff 에디터를 열고 관리
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
exports.DiffManager = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const DiffContentProvider_1 = require("./DiffContentProvider");
const FileChangeTracker_1 = require("../action/file/FileChangeTracker");
class DiffManager {
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
            scheme: DiffContentProvider_1.DIFF_VIEW_URI_SCHEME,
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
        const fileChangeTracker = FileChangeTracker_1.FileChangeTracker.getInstance();
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
        const fileChangeTracker = FileChangeTracker_1.FileChangeTracker.getInstance();
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
exports.DiffManager = DiffManager;
//# sourceMappingURL=DiffManager.js.map