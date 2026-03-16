/**
 * FileChangeHandler
 * 파일 변경 후처리를 담당하는 핸들러
 * - Formatter 실행 (조건부)
 * - 삭제된 파일의 import 검색
 *
 * v10.x: ConversationManager에서 분리
 */

import * as path from 'path';
import * as vscode from 'vscode';
import { ExecutionManager } from '../../execution/ExecutionManager';
import { LLMManager } from '../../model/LLMManager';
import { ProjectDetector } from '../../project/ProjectDetector';
import { ProjectType } from '../../project/types';
import { InlineDiffManager } from '../../diff/InlineDiffManager';
import { WebviewBridge } from '../../../webview/WebviewBridge';
import { AgentConfig } from '../../../config/AgentConfig';
import { DependencyInstaller } from './DependencyInstaller';

export class FileChangeHandler {
  /**
   * Formatter 실행 여부 결정 (조건부 호출)
   */
  public static shouldRunFormatter(
    createdFiles: string[],
    modifiedFiles: string[],
  ): boolean {
    // 1. 새 파일 추가 시 → YES
    if (createdFiles.length > 0) {
      console.log(
        "[FileChangeHandler] New files detected, formatter will run",
      );
      return true;
    }

    // 2. 10줄 이상 구조 변경 → YES
    const inlineDiffManager = InlineDiffManager.getInstance();
    let totalModifiedLines = 0;

    for (const filePath of modifiedFiles) {
      const workspaceRoot =
        vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
      const absolutePath = path.isAbsolute(filePath)
        ? filePath
        : workspaceRoot
          ? path.join(workspaceRoot, filePath)
          : filePath;

      const changes = inlineDiffManager.getChanges(absolutePath);
      if (changes && changes.length > 0) {
        for (const change of changes) {
          if (change.status === "pending") {
            const affectedLines = Math.max(
              1,
              change.range.end.line - change.range.start.line + 1,
            );
            totalModifiedLines += affectedLines;
          }
        }
      }
    }

    if (totalModifiedLines >= AgentConfig.MIN_SIGNIFICANT_MODIFICATION_LINES) {
      console.log(
        `[FileChangeHandler] ${totalModifiedLines} lines modified, formatter will run`,
      );
      return true;
    }

    // 3. 단순 문자열 / 한 줄 수정 → NO
    console.log(
      `[FileChangeHandler] Only ${totalModifiedLines} lines modified (threshold: ${AgentConfig.MIN_SIGNIFICANT_MODIFICATION_LINES}), skipping formatter`,
    );
    return false;
  }

  /**
   * 파일 변경 후 formatter 및 validation 실행
   * 실행 순서: DependencyInstall → Formatter
   */
  public static async afterFileChanges(
    webview: vscode.Webview,
    workspaceRoot: string,
    createdFiles: string[],
    modifiedFiles: string[],
  ): Promise<void> {
    try {
      // 의존성 파일 변경 감지 → 자동 설치
      await DependencyInstaller.autoInstall(webview, workspaceRoot, createdFiles, modifiedFiles);

      // 조건부 Formatter 실행 결정
      if (!FileChangeHandler.shouldRunFormatter(createdFiles, modifiedFiles)) {
        return;
      }

      const detector = new ProjectDetector();
      const projectInfo = await detector.detectProjectType(workspaceRoot);

      // Fallback: LLM으로 프로젝트 타입 감지
      if (projectInfo.type === ProjectType.UNKNOWN) {
        console.log(
          "[FileChangeHandler] Unknown project type, trying LLM fallback...",
        );
        const llmManager = LLMManager.getInstance();

        const llmResult = await detector.detectWithLLMFallback(
          workspaceRoot,
          llmManager,
        );

        if (llmResult && llmResult.type !== ProjectType.UNKNOWN) {
          console.log(
            `[FileChangeHandler] LLM fallback detected project type: ${llmResult.type}`,
          );
          Object.assign(projectInfo, llmResult);
        } else {
          console.log(
            "[FileChangeHandler] Unknown project type, skipping formatter and validation.",
          );
          return;
        }
      }

      const executionManager = ExecutionManager.getInstance();
      const inlineDiffManager = InlineDiffManager.getInstance();

      // Formatter 실행 (조건부)
      const formatterCmd = detector.getFormatterCommand(
        projectInfo.type,
        workspaceRoot,
        createdFiles,
        modifiedFiles,
      );
      if (formatterCmd) {
        // Formatter 실행 전: diff 보호 시작
        const allAffectedFiles = [...createdFiles, ...modifiedFiles];
        for (const filePath of allAffectedFiles) {
          const absolutePath = path.isAbsolute(filePath)
            ? filePath
            : workspaceRoot
              ? path.join(workspaceRoot, filePath)
              : filePath;
          inlineDiffManager.markFormatterRunning(absolutePath);
        }

        WebviewBridge.sendProcessingStatus(
          webview,
          "executing",
          `${formatterCmd.description} 실행 중...`,
        );
        try {
          const formatterResult = await executionManager.executeCommand(
            formatterCmd.command,
            {
              cwd: workspaceRoot,
              timeout: AgentConfig.VALIDATION_COMMAND_TIMEOUT,
            },
          );

          // Formatter 실행 후: diff 보호 해제
          for (const filePath of allAffectedFiles) {
            const absolutePath = path.isAbsolute(filePath)
              ? filePath
              : workspaceRoot
                ? path.join(workspaceRoot, filePath)
                : filePath;
            inlineDiffManager.markFormatterFinished(absolutePath);
          }

          if (formatterResult.exitCode === 0) {
            console.log(
              `[FileChangeHandler] Formatter executed successfully: ${formatterCmd.description}`,
            );
            WebviewBridge.sendProcessingStatus(
              webview,
              "executing",
              `${formatterCmd.description} 완료`,
            );
          } else {
            console.warn(
              `[FileChangeHandler] Formatter failed (non-fatal): ${formatterResult.stderr || formatterResult.stdout || ""}`,
            );
            WebviewBridge.sendProcessingStatus(
              webview,
              "executing",
              `${formatterCmd.description} 경고 (계속 진행)`,
            );
          }
        } catch (error) {
          // 에러 발생 시에도 diff 보호 해제
          for (const filePath of allAffectedFiles) {
            const absolutePath = path.isAbsolute(filePath)
              ? filePath
              : workspaceRoot
                ? path.join(workspaceRoot, filePath)
                : filePath;
            inlineDiffManager.markFormatterFinished(absolutePath);
          }
          console.warn(
            `[FileChangeHandler] Formatter error (non-fatal):`,
            error,
          );
          WebviewBridge.sendProcessingStatus(
            webview,
            "executing",
            `${formatterCmd.description} 경고 (계속 진행)`,
          );
        }
      } else {
        console.log(
          `[FileChangeHandler] No formatter command found for project type: ${projectInfo.type}`,
        );
      }

      // Validation은 TestRunner.runAutomatedTests()에서 실행되므로 여기서는 실행하지 않음
    } catch (error) {
      console.error("[FileChangeHandler] Error in afterFileChanges:", error);
    }
  }

  /**
   * 삭제된 파일을 import하는 파일 검색 (import 자동 정리용)
   */
  public static async findImportingFiles(
    deletedFiles: string[],
    workspaceRoot: string,
  ): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>();

    try {
      const { FileSearcher } = require('../../managers/context/file/FileSearcher');
      const searcher = FileSearcher.getInstance();
      const pathModule = require('path');

      for (const deletedFile of deletedFiles) {
        const basename = pathModule.basename(deletedFile);
        const moduleNameNoExt = basename.replace(/\.[^.]+$/, '');

        // import/require/from 패턴으로 검색
        const pattern = `(import|from|require).*['"\`].*${moduleNameNoExt}['"\`]`;

        try {
          const searchResults = await searcher.searchFiles(pattern, workspaceRoot, {
            maxResults: 50,
            include: ['*.ts', '*.tsx', '*.js', '*.jsx', '*.vue', '*.svelte', '*.py', '*.go', '*.java'],
          });

          const importingFiles = searchResults
            .map((r: any) => r.file)
            .filter((fp: string) => fp !== deletedFile);

          if (importingFiles.length > 0) {
            result.set(deletedFile, importingFiles);
          }
        } catch (e) {
          console.warn(`[FileChangeHandler] Import search failed for ${deletedFile}:`, e);
        }
      }
    } catch (e) {
      console.warn('[FileChangeHandler] findImportingFiles failed:', e);
    }

    return result;
  }
}
