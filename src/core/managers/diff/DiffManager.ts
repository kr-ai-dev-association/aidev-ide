/**
 * Diff Manager
 * VS Code의 diff 에디터를 열고 관리
 */

import * as vscode from "vscode";
import * as path from "path";
import {
  DiffContentProvider,
  DIFF_VIEW_URI_SCHEME,
} from "./DiffContentProvider";
import { FileChangeTracker } from "../action/file/FileChangeTracker";

export interface DiffFile {
  filePath: string;
  leftContent: string;
  rightContent: string;
}

export class DiffManager {
  private static instance: DiffManager;

  private constructor() {}

  public static getInstance(): DiffManager {
    if (!DiffManager.instance) {
      DiffManager.instance = new DiffManager();
    }
    return DiffManager.instance;
  }

  /**
   * 단일 파일 diff 열기
   */
  public async openSingleFileDiff(
    filePath: string,
    originalContent: string,
    modifiedContent: string,
    title?: string,
  ): Promise<void> {
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
      await vscode.commands.executeCommand(
        "vscode.diff",
        originalUri,
        uri,
        diffTitle,
        { preserveFocus: true },
      );
      console.log(`[DiffManager] Opened diff for ${filePath}`);
    } catch (error) {
      console.error("[DiffManager] Failed to open diff editor:", error);
      vscode.window.showErrorMessage(`Diff 뷰를 열지 못했습니다: ${error}`);
    }
  }

  /**
   * 여러 파일 diff 열기
   */
  public async openMultiFileDiff(
    diffs: DiffFile[],
    title: string = "File Changes",
  ): Promise<void> {
    if (diffs.length === 0) {
      vscode.window.showInformationMessage("표시할 변경사항이 없습니다");
      return;
    }

    for (const diff of diffs) {
      await this.openSingleFileDiff(
        diff.filePath,
        diff.leftContent,
        diff.rightContent,
        `${title}: ${path.basename(diff.filePath)}`,
      );
    }
  }

  /**
   * FileChangeTracker에서 변경된 파일들의 diff 표시
   */
  public async showChangedFilesDiff(
    filePaths?: string[],
    sinceTimestamp?: number,
  ): Promise<void> {
    const fileChangeTracker = FileChangeTracker.getInstance();

    const filesToShow = filePaths || fileChangeTracker.getTrackedFiles();
    const diffs: DiffFile[] = [];

    for (const filePath of filesToShow) {
      const history = fileChangeTracker.getChangeHistory(filePath);

      if (history.length === 0) continue;

      const relevantChanges = sinceTimestamp
        ? history.filter((c) => c.timestamp >= sinceTimestamp)
        : history;

      if (relevantChanges.length === 0) continue;

      const latestChange = relevantChanges[relevantChanges.length - 1];

      if (
        latestChange.beforeContent !== undefined &&
        latestChange.afterContent !== undefined
      ) {
        diffs.push({
          filePath,
          leftContent: latestChange.beforeContent,
          rightContent: latestChange.afterContent,
        });
      }
    }

    if (diffs.length === 0) {
      vscode.window.showInformationMessage("변경사항을 찾을 수 없습니다");
      return;
    }

    await this.openMultiFileDiff(diffs, "Changes");
  }

  /**
   * 특정 파일의 diff 표시
   */
  public async showFileDiff(filePath: string): Promise<void> {
    const fileChangeTracker = FileChangeTracker.getInstance();
    const history = fileChangeTracker.getChangeHistory(filePath);

    if (history.length === 0) {
      vscode.window.showInformationMessage(
        `${filePath} 의 변경사항을 찾을 수 없습니다`,
      );
      return;
    }

    const latestChange = history[history.length - 1];
    if (
      latestChange.beforeContent !== undefined &&
      latestChange.afterContent !== undefined
    ) {
      await this.openSingleFileDiff(
        filePath,
        latestChange.beforeContent,
        latestChange.afterContent,
      );
    }
  }

  /**
   * 작업 디렉토리의 모든 변경사항 표시
   */
  public async showWorkingDirectoryChanges(): Promise<void> {
    await this.showChangedFilesDiff();
  }
}
