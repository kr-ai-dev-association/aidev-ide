/**
 * FileChangeHandler
 * 파일 변경 후처리를 담당하는 핸들러
 * - Formatter 실행 (조건부)
 * - 삭제된 파일의 import 검색
 *
 * v10.x: ConversationManager에서 분리
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import * as vscode from 'vscode';
import { ExecutionManager } from '../../execution/ExecutionManager';
import { LLMManager } from '../../model/LLMManager';
import { ProjectDetector } from '../../project/ProjectDetector';
import { ProjectType } from '../../project/types';
import { InlineDiffManager } from '../../diff/InlineDiffManager';
import { WebviewBridge } from '../../../webview/WebviewBridge';
import { AgentConfig } from '../../../config/AgentConfig';

export class FileChangeHandler {
  /** 프로젝트 타입 감지 결과 캐시 (세션 단위, 대화 시작 시 초기화) */
  private static projectTypeCache = new Map<string, ProjectType>();

  /** 캐시 초기화 */
  static resetProjectTypeCache(): void {
    FileChangeHandler.projectTypeCache.clear();
  }

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
      // 조건부 Formatter 실행 결정
      if (!FileChangeHandler.shouldRunFormatter(createdFiles, modifiedFiles)) {
        return;
      }

      // 캐시된 프로젝트 타입 확인
      const cachedType = FileChangeHandler.projectTypeCache.get(workspaceRoot);
      let projectInfo: any;

      if (cachedType !== undefined) {
        console.log(`[FileChangeHandler] Using cached project type: ${cachedType}`);
        if (cachedType === ProjectType.UNKNOWN) {
          console.log("[FileChangeHandler] Cached as UNKNOWN, skipping formatter.");
          return;
        }
        projectInfo = { type: cachedType };
      } else {
        const detector = new ProjectDetector();
        projectInfo = await detector.detectProjectType(workspaceRoot);

        // Fallback: 루트 unknown → 서브디렉토리 탐색 먼저 → 실패 시 LLM 폴백
        if (projectInfo.type === ProjectType.UNKNOWN) {
          console.log(
            "[FileChangeHandler] Unknown project type at root. Trying subdirectory detection first...",
          );

          // 서브디렉토리 탐색 (수정된 파일 경로 기반)
          const originalWorkspaceRoot = workspaceRoot;
          const allFiles = [...createdFiles, ...modifiedFiles];
          let subDetected = false;
          if (allFiles.length > 0) {
            const seen = new Set<string>();
            for (const file of allFiles) {
              const relativePath = path.isAbsolute(file)
                ? path.relative(workspaceRoot, file)
                : file;
              const segments = relativePath.split(path.sep);
              for (let i = segments.length - 2; i >= 0; i--) {
                const ancestorRelative = segments.slice(0, i + 1).join(path.sep);
                if (seen.has(ancestorRelative)) continue;
                seen.add(ancestorRelative);

                const absDir = path.join(workspaceRoot, ancestorRelative);
                try {
                  const stat = await fs.stat(absDir);
                  if (!stat.isDirectory()) continue;

                  const subInfo = await detector.detectProjectType(absDir);
                  if (subInfo.type !== ProjectType.UNKNOWN) {
                    console.log(
                      `[FileChangeHandler] Sub-project detected at: ${ancestorRelative} (type: ${subInfo.type})`,
                    );
                    Object.assign(projectInfo, subInfo);
                    workspaceRoot = absDir;
                    // 파일 경로를 새 workspaceRoot 기준으로 재계산 (ruff 등 포매터가 올바른 경로를 받도록)
                    createdFiles = createdFiles.map(f => {
                      const abs = path.isAbsolute(f) ? f : path.join(originalWorkspaceRoot, f);
                      return path.relative(workspaceRoot, abs);
                    });
                    modifiedFiles = modifiedFiles.map(f => {
                      const abs = path.isAbsolute(f) ? f : path.join(originalWorkspaceRoot, f);
                      return path.relative(workspaceRoot, abs);
                    });
                    subDetected = true;
                    break;
                  }
                } catch { /* ignore */ }
              }
              if (subDetected) break;
            }
          }

          if (!subDetected) {
            // 서브디렉토리에서도 못 찾음 → LLM 폴백 (서브디렉토리 구조 포함)
            console.log(
              "[FileChangeHandler] Sub-project not found. Trying LLM fallback with directory structure...",
            );
            const llmManager = LLMManager.getInstance();

            // 서브디렉토리 구조 정보 수집
            let subDirInfo: string | undefined;
            try {
              const rootFiles = await fs.readdir(workspaceRoot);
              const dirEntries: string[] = [];
              for (const f of rootFiles.slice(0, 30)) {
                const fullPath = path.join(workspaceRoot, f);
                try {
                  const stat = await fs.stat(fullPath);
                  if (stat.isDirectory() && !f.startsWith('.') && f !== 'node_modules') {
                    const subFiles = await fs.readdir(fullPath);
                    dirEntries.push(`${f}/: ${subFiles.slice(0, 10).join(', ')}`);
                  }
                } catch { /* ignore */ }
              }
              if (dirEntries.length > 0) {
                subDirInfo = dirEntries.join('\n');
              }
            } catch { /* ignore */ }

            const llmResult = await detector.detectWithLLMFallback(
              workspaceRoot,
              llmManager,
              undefined,
              undefined,
              subDirInfo,
            );

            if (llmResult && llmResult.type !== ProjectType.UNKNOWN) {
              console.log(
                `[FileChangeHandler] LLM fallback detected project type: ${llmResult.type}`,
              );
              Object.assign(projectInfo, llmResult);

              // LLM이 타입 감지 → 서브디렉토리에서 실제 프로젝트 루트 탐색
              try {
                const rootEntries = await fs.readdir(workspaceRoot);
                for (const entry of rootEntries) {
                  if (entry.startsWith('.') || entry === 'node_modules') continue;
                  const subPath = path.join(workspaceRoot, entry);
                  try {
                    const stat = await fs.stat(subPath);
                    if (!stat.isDirectory()) continue;
                    const subInfo = await detector.detectProjectType(subPath);
                    if (subInfo.type !== ProjectType.UNKNOWN) {
                      console.log(
                        `[FileChangeHandler] LLM fallback: sub-project root found at ${entry} (${subInfo.type})`,
                      );
                      workspaceRoot = subPath;
                      createdFiles = createdFiles.map(f => {
                        const abs = path.isAbsolute(f) ? f : path.join(originalWorkspaceRoot, f);
                        return path.relative(workspaceRoot, abs);
                      });
                      modifiedFiles = modifiedFiles.map(f => {
                        const abs = path.isAbsolute(f) ? f : path.join(originalWorkspaceRoot, f);
                        return path.relative(workspaceRoot, abs);
                      });
                      break;
                    }
                  } catch { /* ignore */ }
                }
              } catch { /* ignore */ }
            } else {
              console.log(
                "[FileChangeHandler] Unknown project type, skipping formatter and validation.",
              );
              FileChangeHandler.projectTypeCache.set(workspaceRoot, ProjectType.UNKNOWN);
              return;
            }
          }
        }

        // 성공한 결과 캐시
        FileChangeHandler.projectTypeCache.set(workspaceRoot, projectInfo.type);
      }

      const detector = new ProjectDetector();

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
      const { FileSearcher } = require('../../context/file/FileSearcher');
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
