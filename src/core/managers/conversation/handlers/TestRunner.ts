/**
 * TestRunner
 * 자동 테스트 실행 및 검증을 담당하는 클래스
 */

import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as path from "path";
import { WebviewBridge } from "../../../webview/WebviewBridge";
import { ProjectDetector } from "../../project/ProjectDetector";
import { ProjectType } from "../../project/types";
import { ProjectManager } from "../../project/ProjectManager";
import { LLMManager } from "../../model/LLMManager";
import { ExecutionManager } from "../../execution/ExecutionManager";

import { AgentConfig } from "../../../config/AgentConfig";
import { UsageMetricsManager } from "../../state/UsageMetricsManager";
import { StringUtils } from "../../../utils/StringUtils";
import { SubProjectDetector } from "../../project/SubProjectDetector";
import { getValidationCommandPrompt } from "../../context/prompts/test/validationCommand";
import { RichDiagnostic, ClassificationResult, ErrorClassifier, ErrorCategory, ExecutionOutcome } from "./ErrorClassifier";

import { extractErrorMessage } from "./HandlerUtils";

export interface TestResult {
  success: boolean;
  errorMessage?: string;
  classification?: ClassificationResult;
  /** 서브 프로젝트가 감지된 경우 해당 디렉토리 경로 (repair agent cwd용) */
  detectedSubProjectRoot?: string;
}

export class TestRunner {
  /**
   * 서브 프로젝트 감지 결과 캐시 (세션 내 재사용)
   * key: workspaceRoot, value: { root, info }
   */
  private static subProjectCache: Map<string, { root: string; info: { type: ProjectType; confidence: number; buildTool: any } } | null> = new Map();

  /**
   * LLM 프로젝트 타입 감지 결과 캐시 (세션 내 재사용)
   * key: workspaceRoot, value: detected project info or null
   */
  private static llmProjectTypeCache: Map<string, { type: ProjectType; confidence: number; buildTool: any } | null> = new Map();

  /**
   * 서브 프로젝트 캐시 초기화 (새 세션/대화 시작 시 호출)
   */
  public static clearSubProjectCache(): void {
    TestRunner.subProjectCache.clear();
    TestRunner.llmProjectTypeCache.clear();
    console.log("[TestRunner] Sub-project and LLM project type caches cleared");
  }

  /**
   * 프로젝트 타입에 따른 빌드 검증 타임아웃 반환
   */
  public static getValidationTimeout(projectType?: string): number {
    if (!projectType) { return AgentConfig.VALIDATION_COMMAND_TIMEOUT; }
    const key = projectType.toLowerCase();
    return AgentConfig.VALIDATION_TIMEOUT_BY_PROJECT[key]
      ?? AgentConfig.VALIDATION_COMMAND_TIMEOUT;
  }

  /**
   * 자동 테스트 검증 (Smoke Test & Lint Check)
   */
  public static async runAutomatedTests(
    webview: vscode.Webview,
    _workspaceRoot: string,
    createdFiles: string[],
    modifiedFiles: string[],
    validationTimeout: number = AgentConfig.VALIDATION_COMMAND_TIMEOUT,
    excludedValidationCommands: string[] = [],
    /** UI step name — 호출 컨텍스트에 따라 'executing' 또는 'review' */
    uiStep: string = 'executing',
  ): Promise<TestResult> {
    let workspaceRoot = _workspaceRoot;
    try {
      // 검증 시작
      WebviewBridge.sendProcessingStep(webview, uiStep);
      WebviewBridge.sendProcessingStatus(
        webview,
        uiStep,
        "코드 검증 시작...",
      );

      // ProjectDetector를 사용하여 프로젝트 타입 감지
      WebviewBridge.sendProcessingStatus(
        webview,
        uiStep,
        "프로젝트 타입 감지 중...",
      );
      const detector = new ProjectDetector();
      const projectInfo = await detector.detectProjectType(workspaceRoot);

      // 프로젝트 타입에 따른 동적 타임아웃 적용
      if (validationTimeout === AgentConfig.VALIDATION_COMMAND_TIMEOUT) {
        validationTimeout = TestRunner.getValidationTimeout(projectInfo.type);
      }

      // Fallback: 규칙으로 찾지 못했을 때 캐시 확인 → LLM 판단
      if (projectInfo.type === ProjectType.UNKNOWN) {
        // 캐시에서 서브 프로젝트 결과 확인 (LLM 호출 절약)
        const cachedSubProject = TestRunner.subProjectCache.get(workspaceRoot);
        if (cachedSubProject !== undefined) {
          if (cachedSubProject) {
            console.log(
              `[TestRunner] Using cached sub-project: ${cachedSubProject.root} (type: ${cachedSubProject.info.type})`,
            );
            WebviewBridge.sendProcessingStatus(
              webview,
              uiStep,
              `서브 프로젝트 (캐시): ${path.basename(cachedSubProject.root)} (${cachedSubProject.info.type})`,
            );
            Object.assign(projectInfo, cachedSubProject.info);
            workspaceRoot = cachedSubProject.root;
          } else {
            console.log(
              "[TestRunner] Cached: no sub-project found previously. Diagnostics only.",
            );
            WebviewBridge.sendProcessingStatus(
              webview,
              uiStep,
              "프로젝트 타입 미확인 (캐시) — Diagnostics 검사만 실행",
            );
          }
        } else {
          // 서브디렉토리 탐색 먼저 시도 (LLM 호출 절약)
          console.log(
            "[TestRunner] Unknown project type at root. Trying subdirectory detection first...",
          );
          WebviewBridge.sendProcessingStatus(
            webview,
            uiStep,
            "서브 프로젝트 탐색 중...",
          );
          const subProjectRoot = await TestRunner.findSubProjectRoot(
            workspaceRoot,
            createdFiles,
            modifiedFiles,
            detector,
          );

          if (subProjectRoot) {
            // 서브디렉토리에서 프로젝트 발견 — LLM 불필요
            console.log(
              `[TestRunner] Sub-project detected at: ${subProjectRoot.root} (type: ${subProjectRoot.info.type})`,
            );
            WebviewBridge.sendProcessingStatus(
              webview,
              uiStep,
              `서브 프로젝트 감지: ${path.basename(subProjectRoot.root)} (${subProjectRoot.info.type})`,
            );
            Object.assign(projectInfo, subProjectRoot.info);
            workspaceRoot = subProjectRoot.root;
            TestRunner.subProjectCache.set(workspaceRoot, subProjectRoot);
          } else {
            // 서브디렉토리에서도 못 찾음 → LLM 폴백 (캐시 확인 후)
            TestRunner.subProjectCache.set(workspaceRoot, null);

            const cachedLLMType = TestRunner.llmProjectTypeCache.get(workspaceRoot);
            if (cachedLLMType !== undefined) {
              if (cachedLLMType && cachedLLMType.type !== ProjectType.UNKNOWN) {
                console.log(
                  `[TestRunner] Using cached LLM project type: ${cachedLLMType.type}`,
                );
                WebviewBridge.sendProcessingStatus(
                  webview,
                  uiStep,
                  `프로젝트 타입 (LLM 캐시): ${cachedLLMType.type}`,
                );
                Object.assign(projectInfo, cachedLLMType);
              } else {
                console.log(
                  "[TestRunner] Cached LLM result: UNKNOWN. Diagnostics only.",
                );
                WebviewBridge.sendProcessingStatus(
                  webview,
                  uiStep,
                  "프로젝트 타입 미확인 (LLM 캐시) — Diagnostics 검사만 실행",
                );
              }
            } else {
              // LLM 폴백 — 서브디렉토리 구조 정보를 함께 전달
              console.log(
                "[TestRunner] Sub-project not found. Trying LLM fallback with directory structure...",
              );
              WebviewBridge.sendProcessingStatus(
                webview,
                uiStep,
                "프로젝트 타입 LLM 감지 중...",
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

              TestRunner.llmProjectTypeCache.set(workspaceRoot, llmResult || null);
              console.log(
                `[TestRunner] LLM project type cache set for ${workspaceRoot}: ${llmResult?.type || 'null'}`,
              );

              if (llmResult && llmResult.type !== ProjectType.UNKNOWN) {
                console.log(
                  `[TestRunner] LLM fallback detected project type: ${llmResult.type}`,
                );
                Object.assign(projectInfo, llmResult);
              } else {
                console.log(
                  "[TestRunner] No project type found. Diagnostics only.",
                );
                WebviewBridge.sendProcessingStatus(
                  webview,
                  uiStep,
                  "프로젝트 타입 미확인 — Diagnostics 검사만 실행",
                );
              }
            }
          }
        }
      }

      const testResults: string[] = [];
      const isUnknownProject = projectInfo.type === ProjectType.UNKNOWN;

      // 1. Smoke Test: 프로젝트 타입별 필수 파일 존재 확인 (UNKNOWN이면 스킵)
      if (!isUnknownProject) {
        WebviewBridge.sendProcessingStatus(
          webview,
          uiStep,
          "Smoke Test 실행 중 (필수 파일 확인)...",
        );
        const criticalFiles = detector.getCriticalFiles(
          projectInfo.type,
          workspaceRoot,
        );

        const missingFiles: string[] = [];
        for (const file of criticalFiles) {
          try {
            const filePath = path.isAbsolute(file)
              ? file
              : path.join(workspaceRoot, file);
            await fs.access(filePath);
          } catch {
            // build.gradle와 build.gradle.kts는 둘 중 하나만 있으면 됨 (Android, Spring Boot)
            if (
              (projectInfo.type === ProjectType.SPRING_BOOT ||
                projectInfo.type === ProjectType.ANDROID) &&
              projectInfo.buildTool.toString().includes("gradle") &&
              (file === "build.gradle" ||
                file === "build.gradle.kts" ||
                file === "app/build.gradle" ||
                file === "app/build.gradle.kts" ||
                file === "settings.gradle" ||
                file === "settings.gradle.kts")
            ) {
              const otherFile = file.includes(".kts")
                ? file.replace(".kts", "")
                : file + ".kts";
              try {
                await fs.access(path.join(workspaceRoot, otherFile));
                continue; // 다른 파일이 있으면 통과
              } catch {}
            }
            // requirements.txt와 pyproject.toml도 둘 중 하나만 있으면 됨
            if (
              (projectInfo.type === ProjectType.PYTHON ||
                projectInfo.type === ProjectType.DJANGO ||
                projectInfo.type === ProjectType.FLASK ||
                projectInfo.type === ProjectType.FASTAPI) &&
              (file === "requirements.txt" || file === "pyproject.toml")
            ) {
              const otherFile =
                file === "requirements.txt"
                  ? "pyproject.toml"
                  : "requirements.txt";
              try {
                await fs.access(path.join(workspaceRoot, otherFile));
                continue; // 다른 파일이 있으면 통과
              } catch {}
            }
            missingFiles.push(file);
          }
        }

        if (missingFiles.length > 0) {
          testResults.push(
            `Smoke Test 실패: 다음 파일이 누락되었습니다: ${missingFiles.join(", ")}`,
          );
          WebviewBridge.sendProcessingStatus(
            webview,
            uiStep,
            "Smoke Test 실패",
          );
        } else {
          testResults.push(`Smoke Test 통과: 모든 필수 파일이 존재합니다.`);
          WebviewBridge.sendProcessingStatus(
            webview,
            uiStep,
            "Smoke Test 통과",
          );
        }
      }

      // 2. VS Code Diagnostics Check (LSP 기반 빠른 검사)
      // CLI 실행 전에 문법/타입 에러를 빠르게 잡음
      WebviewBridge.sendProcessingStatus(
        webview,
        uiStep,
        "Diagnostics 검사 중...",
      );
      const diagnosticErrors = await TestRunner.checkDiagnostics(
        createdFiles,
        modifiedFiles,
        workspaceRoot,
      );
      if (diagnosticErrors.length > 0) {
        // 구조적 에러 분류 (source+code 그룹핑, 키워드 매칭 없음)
        const envHealth = ProjectDetector.checkEnvironmentHealth(workspaceRoot);
        const configFiles = detector.getCriticalFiles(projectInfo.type, workspaceRoot);
        const classification = ErrorClassifier.classify(diagnosticErrors, envHealth, configFiles);

        console.log(`[TestRunner] Error classification: ${classification.dominantCategory}, groups: ${classification.groups.length}`);

        // 분류 결과와 함께 에러 반환 → LLM이 판단하여 필요 시 의존성 설치 등 수행
        const errorSummary = TestRunner.formatClassifiedErrors(classification);
        WebviewBridge.sendProcessingStatus(
          webview,
          uiStep,
          `Diagnostics 에러 ${diagnosticErrors.length}개 발견`,
        );

        return {
          success: false,
          errorMessage: errorSummary,
          classification,
        };
      } else {
        testResults.push(`Diagnostics 검사 통과: 문법/타입 에러 없음`);
        WebviewBridge.sendProcessingStatus(
          webview,
          uiStep,
          "Diagnostics 검사 통과",
        );
      }

      // 3. Lint Check: 프로젝트 타입별 컴파일/빌드 검사 (CLI) — UNKNOWN이면 스킵
      let cliClassification: ClassificationResult | undefined;

      if (!isUnknownProject) {
        // 서브프로젝트 감지로 workspaceRoot가 변경된 경우, 파일 경로를 새 root 기준으로 rebase
        // 예: workspaceRoot=/test2/backend, 파일=backend/app/main.py → app/main.py
        let effectiveCreatedFiles = createdFiles;
        let effectiveModifiedFiles = modifiedFiles;
        if (workspaceRoot !== _workspaceRoot) {
          const subDir = path.relative(_workspaceRoot, workspaceRoot); // e.g. "backend"
          const rebasePath = (f: string): string => {
            // 절대 경로는 새 root 기준 상대 경로로 변환
            if (path.isAbsolute(f)) {
              return path.relative(workspaceRoot, f);
            }
            // 상대 경로가 서브디렉토리 접두사로 시작하면 제거
            if (f.startsWith(subDir + '/') || f.startsWith(subDir + path.sep)) {
              return f.slice(subDir.length + 1);
            }
            return f;
          };
          effectiveCreatedFiles = createdFiles.map(rebasePath);
          effectiveModifiedFiles = modifiedFiles.map(rebasePath);
          console.log(`[TestRunner] Rebased file paths for sub-project (${subDir}/): ${effectiveCreatedFiles.length + effectiveModifiedFiles.length} files`);
        }

        let validationCmd = await detector.getValidationCommand(
          projectInfo.type,
          workspaceRoot,
          effectiveCreatedFiles,
          effectiveModifiedFiles,
        );

        // COMMAND_NOT_FOUND fallback: 이전에 실패한 명령어면 스킵하고 다음 후보 요청
        if (validationCmd && excludedValidationCommands.length > 0) {
          const cmdStr = validationCmd.command;
          const isExcluded = excludedValidationCommands.some(
            excluded => cmdStr.trim() === excluded.trim()
          );
          if (isExcluded) {
            console.log(`[TestRunner] Validation command excluded (not found): ${cmdStr}. Trying next candidate.`);
            validationCmd = await detector.getNextValidationCandidate(
              projectInfo.type,
              workspaceRoot,
              effectiveCreatedFiles,
              effectiveModifiedFiles,
              excludedValidationCommands,
            );
          }
        }

        // Fallback: getValidationCommand()가 null을 반환하면 LLM에게 질의
        if (!validationCmd) {
          validationCmd = await TestRunner.getValidationCommandFromLLM(
            webview,
            projectInfo,
            workspaceRoot,
            effectiveCreatedFiles,
            effectiveModifiedFiles,
            [],
            uiStep,
          );
        }

        if (validationCmd) {
          const lintResult = await TestRunner.runValidationCommand(
            webview,
            validationCmd,
            workspaceRoot,
            validationTimeout,
            uiStep,
          );

          // COMMAND_NOT_FOUND 즉시 재시도: 같은 턴에서 LLM에 다음 후보 요청
          if (lintResult.classification?.dominantCategory === ErrorCategory.COMMAND_NOT_FOUND) {
            console.log(
              `[TestRunner] Validation command not found: ${validationCmd.command}. Trying LLM fallback immediately.`,
            );
            excludedValidationCommands.push(validationCmd.command);
            WebviewBridge.sendProcessingStatus(webview, uiStep, "검증 도구 미설치 — 대체 명령어 탐색 중...");

            const fallbackCmd = await TestRunner.getValidationCommandFromLLM(
              webview,
              projectInfo,
              workspaceRoot,
              effectiveCreatedFiles,
              effectiveModifiedFiles,
              excludedValidationCommands,
              uiStep,
            );

            if (fallbackCmd) {
              // fallback 명령어가 이미 제외된 명령과 정확히 일치하면 스킵
              const isDuplicate = excludedValidationCommands.some(
                ex => fallbackCmd.command.trim() === ex.trim()
              );
              if (isDuplicate) {
                console.log(`[TestRunner] LLM fallback is duplicate of excluded command. Skipping validation.`);
                WebviewBridge.sendProcessingStatus(webview, uiStep, "검증 도구 미설치 — 검증 건너뜀");
              } else {
                const fallbackResult = await TestRunner.runValidationCommand(
                  webview,
                  fallbackCmd,
                  workspaceRoot,
                  validationTimeout,
                  uiStep,
                );
                // fallback도 COMMAND_NOT_FOUND면 더 이상 재시도하지 않음
                if (fallbackResult.classification?.dominantCategory === ErrorCategory.COMMAND_NOT_FOUND) {
                  console.log(`[TestRunner] LLM fallback also COMMAND_NOT_FOUND. Skipping validation.`);
                  WebviewBridge.sendProcessingStatus(webview, uiStep, "검증 도구 미설치 — 검증 건너뜀");
                } else {
                  testResults.push(fallbackResult.message);
                  cliClassification = fallbackResult.classification;
                }
              }
            } else {
              console.log(`[TestRunner] No fallback validation command available. Skipping.`);
              WebviewBridge.sendProcessingStatus(webview, uiStep, "대체 검증 명령어 없음 (건너뜀)");
            }
          } else {
            testResults.push(lintResult.message);
            cliClassification = lintResult.classification;
          }
        } else {
          // 검증 명령어를 결정할 수 없는 경우 → smoke test/diagnostics 통과 시 성공으로 처리
          console.log(
            `[TestRunner] No validation command available for ${projectInfo.type}. Skipping compile check.`,
          );
          WebviewBridge.sendProcessingStatus(
            webview,
            uiStep,
            "검증 명령어 없음 (건너뜀)",
          );
        }
      }

      // 실패한 테스트 확인
      const hasFailedTests = testResults.some(
        (r) => r.includes("실패") || r.includes("Failed"),
      );

      if (hasFailedTests) {
        const failedTestMessages = testResults.filter(
          (r) => r.includes("실패") || r.includes("Failed"),
        );
        const errorMessage = failedTestMessages.join("\n");
        WebviewBridge.sendProcessingStatus(
          webview,
          uiStep,
          "테스트 검증 실패",
        );
        UsageMetricsManager.getInstance().recordVerification(false);
        const subRoot = workspaceRoot !== _workspaceRoot ? workspaceRoot : undefined;
        return { success: false, errorMessage, classification: cliClassification, detectedSubProjectRoot: subRoot };
      }

      // 모든 테스트 통과
      WebviewBridge.sendProcessingStatus(
        webview,
        uiStep,
        "테스트 검증 통과",
      );
      UsageMetricsManager.getInstance().recordVerification(true);
      return { success: true };
    } catch (error) {
      console.error("[TestRunner] Error running automated tests:", error);
      const errorMsg = `자동 테스트 실행 중 오류 발생: ${extractErrorMessage(error)}`;
      return { success: false, errorMessage: errorMsg };
    }
  }

  /**
   * LLM을 사용하여 검증 명령어 추론
   */
  private static async getValidationCommandFromLLM(
    webview: vscode.Webview,
    projectInfo: any,
    workspaceRoot: string,
    createdFiles: string[],
    modifiedFiles: string[],
    excludedCommands: string[] = [],
    uiStep: string = 'executing',
  ): Promise<{ command: string; description: string } | null> {
    console.log(
      "[TestRunner] getValidationCommand() returned null. Querying LLM for validation command...",
    );
    WebviewBridge.sendProcessingStatus(
      webview,
      uiStep,
      "검증 명령어 LLM 추론 중...",
    );

    const llmManager = LLMManager.getInstance();

    try {
      const excludedNote = excludedCommands.length > 0
        ? `\n\n주의: 다음 명령어는 이미 실패했으므로 사용하지 마세요: ${excludedCommands.join(', ')}`
        : '';
      const prompt = getValidationCommandPrompt({
        projectType: projectInfo.type.toString(),
        workspaceRoot,
        createdFiles,
        modifiedFiles,
      }) + excludedNote;

      const response = await llmManager.sendMessage(prompt);

      // JSON 파싱 (markdown code fence 제거)
      const cleaned = response.replace(/```(?:json)?\s*/g, '').trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*?\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.command && parsed.description) {
            // 유효하지 않은 명령어 필터링 (예: "...", 빈 문자열, 구두점만)
            const cmd = parsed.command.trim();
            if (!TestRunner.isValidCommand(cmd)) {
              console.warn(
                `[TestRunner] LLM suggested invalid command, rejecting: "${cmd}"`,
              );
              return null;
            }
            const validationCmd = {
              command: cmd,
              description: parsed.description,
            };
            console.log(
              `[TestRunner] LLM suggested validation command: ${validationCmd.command}`,
            );
            return validationCmd;
          }
        } catch (parseError) {
          console.error(
            "[TestRunner] Failed to parse LLM response for validation command:",
            parseError,
          );
        }
      }
    } catch (llmError) {
      console.error(
        "[TestRunner] Error querying LLM for validation command:",
        llmError,
      );
    }

    return null;
  }

  /**
   * 검증 명령어 실행
   * 실패 시 ExecutionOutcome을 구성하여 구조적 분류를 수행
   */
  private static async runValidationCommand(
    webview: vscode.Webview,
    validationCmd: { command: string; description: string },
    workspaceRoot: string,
    timeout: number = AgentConfig.VALIDATION_COMMAND_TIMEOUT,
    uiStep: string = 'executing',
  ): Promise<{ message: string; classification?: ClassificationResult }> {
    WebviewBridge.sendProcessingStatus(
      webview,
      uiStep,
      `${validationCmd.description} 실행 중...`,
    );
    try {
      const executionManager = ExecutionManager.getInstance();
      const result = await executionManager.executeCommand(
        validationCmd.command,
        { cwd: workspaceRoot, timeout },
      );

      if (result.exitCode === 0) {
        const message = `${validationCmd.description} 통과: 문법 오류가 없습니다.`;
        WebviewBridge.sendProcessingStatus(
          webview,
          uiStep,
          `${validationCmd.description} 통과`,
        );
        return { message };
      } else {
        // ExecutionResult → ExecutionOutcome 변환
        const outcome: ExecutionOutcome = {
          command: validationCmd.command,
          exitCode: result.exitCode,
          hasStderr: (result.stderr || '').length > 0,
          hasStdout: (result.stdout || '').length > 0,
          duration: result.duration,
          errorCode: result.error?.code,
          killed: result.error?.killed ?? false,
          signal: result.error?.signal,
          stderrSnippet: (result.stderr || result.stdout || '').substring(0, 200),
        };

        // 구조적 분류
        const envHealth = ProjectDetector.checkEnvironmentHealth(workspaceRoot);
        const classification = ErrorClassifier.classifyFromExecution(outcome, envHealth);

        const errorOutput = result.stderr || result.stdout || "";
        const truncatedOutput = StringUtils.truncate(
          errorOutput,
          AgentConfig.MAX_ERROR_MESSAGE_LENGTH,
        );
        const message = `${validationCmd.description} 실패: 오류가 발견되었습니다.\n${truncatedOutput}`;
        WebviewBridge.sendProcessingStatus(
          webview,
          uiStep,
          `${validationCmd.description} 실패`,
        );
        return { message, classification };
      }
    } catch (error) {
      const message = `${validationCmd.description} 실행 실패: ${extractErrorMessage(error)}`;
      WebviewBridge.sendProcessingStatus(
        webview,
        uiStep,
        `${validationCmd.description} 실행 실패`,
      );
      return { message };
    }
  }

  /**
   * VS Code Diagnostics를 사용한 빠른 에러 검사
   * LSP 기반으로 문법/타입 에러를 CLI 실행 없이 빠르게 확인
   *
   * RichDiagnostic 반환: source, relatedFiles, tags 등 구조적 필드 포함
   */
  public static async checkDiagnostics(
    createdFiles: string[],
    modifiedFiles: string[],
    workspaceRoot: string,
  ): Promise<RichDiagnostic[]> {
    const errors: RichDiagnostic[] = [];
    const allFiles = [...createdFiles, ...modifiedFiles];

    for (const filePath of allFiles) {
      try {
        const absolutePath = path.isAbsolute(filePath)
          ? filePath
          : path.join(workspaceRoot, filePath);
        const uri = vscode.Uri.file(absolutePath);

        // 파일이 존재하는지 확인
        try {
          await fs.access(absolutePath);
        } catch {
          continue; // 파일이 없으면 스킵
        }

        // VS Code Diagnostics 가져오기
        const diagnostics = vscode.languages.getDiagnostics(uri);

        // Error 수준만 필터링 (Warning은 무시)
        const criticalErrors = diagnostics.filter(
          (d) => d.severity === vscode.DiagnosticSeverity.Error,
        );

        for (const diagnostic of criticalErrors) {
          const fileName = path.relative(workspaceRoot, absolutePath);

          // relatedInformation에서 관련 파일 추출
          const relatedFiles: string[] = [];
          if (diagnostic.relatedInformation) {
            for (const info of diagnostic.relatedInformation) {
              const relPath = path.relative(workspaceRoot, info.location.uri.fsPath);
              if (!relatedFiles.includes(relPath)) {
                relatedFiles.push(relPath);
              }
            }
          }

          errors.push({
            file: fileName,
            line: diagnostic.range.start.line + 1, // 0-based to 1-based
            message: diagnostic.message,
            code: diagnostic.code?.toString() || "unknown",
            source: diagnostic.source || "unknown",
            relatedFiles,
            tags: diagnostic.tags ? diagnostic.tags.map(t => t as number) : [],
            severity: 'error',
          });
        }
      } catch (error) {
        console.warn(
          `[TestRunner] Failed to check diagnostics for ${filePath}:`,
          error,
        );
      }
    }

    return errors;
  }

  /**
   * 분류된 에러를 LLM 프롬프트용 문자열로 포맷팅
   */
  private static formatClassifiedErrors(classification: ClassificationResult): string {
    const lines: string[] = [];
    lines.push(`Diagnostics 검사 실패 (${classification.totalErrorCount}개 에러):`);
    lines.push(`분류: ${classification.dominantCategory}`);

    if (classification.environmentCheck.needsInstall) {
      lines.push(`환경: 의존성 디렉토리 누락 (${classification.environmentCheck.installCommand || '설치 필요'})`);
    }

    for (const group of classification.groups) {
      lines.push(`\n[${group.source}:${group.representativeCode}] ${group.count}건 - ${group.affectedFiles.length}개 파일:`);
      for (const file of group.affectedFiles.slice(0, 5)) {
        lines.push(`  - ${file}`);
      }
      for (const msg of group.sampleMessages) {
        lines.push(`  > ${msg}`);
      }
      if (group.rootCauseHypothesis) {
        lines.push(`  분석: ${group.rootCauseHypothesis}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * 에러 패턴 추출 (중복 재시도 방지용)
   * @deprecated ErrorClassifier.classify()의 retryFingerprint로 대체
   */
  public static extractErrorPattern(errorMessage: string): string {
    // TypeScript 에러 패턴: "error TS2345: ..."
    const tsErrorMatch = errorMessage.match(/error\s+TS\d+:/i);
    if (tsErrorMatch) {
      return `TS_ERROR:${tsErrorMatch[0]}`;
    }

    // Import 에러 패턴: "Cannot find module ..."
    const importErrorMatch = errorMessage.match(
      /Cannot find module ['"]([^'"]+)['"]/i,
    );
    if (importErrorMatch) {
      return `IMPORT_ERROR:${importErrorMatch[1]}`;
    }

    // Dependency 에러 패턴: "npm ERR!" 또는 "Module not found"
    const depErrorMatch = errorMessage.match(
      /(npm ERR!|Module not found|Cannot resolve)/i,
    );
    if (depErrorMatch) {
      return `DEPENDENCY_ERROR:${depErrorMatch[0]}`;
    }

    // Build 에러 패턴: "Build failed" 또는 "Compilation failed"
    const buildErrorMatch = errorMessage.match(
      /(Build failed|Compilation failed)/i,
    );
    if (buildErrorMatch) {
      return `BUILD_ERROR:${buildErrorMatch[0]}`;
    }

    // 기본 패턴: 첫 100자
    return `GENERIC:${errorMessage.substring(0, 100).replace(/\s+/g, " ")}`;
  }

  /**
   * LLM이 제안한 명령어가 유효한 셸 명령어인지 검증
   * "...", 빈 문자열, 구두점만으로 구성된 문자열 등을 거부
   */
  private static isValidCommand(cmd: string): boolean {
    if (!cmd || cmd.length < 2) return false;
    // 구두점/공백만으로 구성된 명령어 거부
    if (/^[\s.…,;:!?'"()\[\]{}<>/*\-_=+]+$/.test(cmd)) return false;
    // 알파벳/숫자가 하나도 없는 명령어 거부
    if (!/[a-zA-Z0-9]/.test(cmd)) return false;
    return true;
  }

  /**
   * 수정된 파일 경로에서 서브 프로젝트 루트를 찾습니다.
   * 예: workspaceRoot=/test, modifiedFiles=[frontend/src/App.tsx]
   *   → frontend/ 디렉토리에서 프로젝트 타입 감지 시도
   */
  private static async findSubProjectRoot(
    workspaceRoot: string,
    createdFiles: string[],
    modifiedFiles: string[],
    detector: ProjectDetector,
  ): Promise<{ root: string; info: { type: ProjectType; confidence: number; buildTool: any } } | null> {
    const allFiles = [...createdFiles, ...modifiedFiles];
    if (allFiles.length === 0) return null;

    // 수정된 파일의 모든 ancestor 디렉토리를 수집 (파일에서 루트 방향으로)
    // 예: packages/client/src/App.tsx → [packages/client/src, packages/client, packages]
    const candidateDirs: string[] = [];
    const seen = new Set<string>();
    for (const file of allFiles) {
      const relativePath = path.isAbsolute(file)
        ? path.relative(workspaceRoot, file)
        : file;
      const segments = relativePath.split(path.sep);
      // 파일 자체 제외, 부모 디렉토리부터 역순으로 (가장 가까운 것 먼저)
      for (let i = segments.length - 2; i >= 0; i--) {
        const ancestorRelative = segments.slice(0, i + 1).join(path.sep);
        if (!seen.has(ancestorRelative)) {
          seen.add(ancestorRelative);
          candidateDirs.push(ancestorRelative);
        }
      }
    }

    // 가장 가까운 ancestor부터 프로젝트 타입 감지 시도
    for (const relDir of candidateDirs) {
      const absDir = path.join(workspaceRoot, relDir);
      try {
        const stat = await fs.stat(absDir);
        if (!stat.isDirectory()) continue;

        const subInfo = await detector.detectProjectType(absDir);
        if (subInfo.type !== ProjectType.UNKNOWN) {
          console.log(
            `[TestRunner] Nearest ancestor manifest found: ${relDir} (type: ${subInfo.type})`,
          );
          return { root: absDir, info: subInfo };
        }
      } catch {
        // 디렉토리 접근 실패 시 무시
      }
    }

    return null;
  }

  /**
   * 워크스페이스 루트에 해당 프로젝트 타입의 manifest 파일이 있는지 확인
   */
  private static async hasManifestFile(workspaceRoot: string, projectType: ProjectType): Promise<boolean> {
    const manifestMap: Record<string, string[]> = {
      [ProjectType.NODE]: ['package.json'],
      [ProjectType.REACT]: ['package.json'],
      [ProjectType.VUE]: ['package.json'],
      [ProjectType.ANGULAR]: ['package.json'],
      [ProjectType.PYTHON]: ['requirements.txt', 'pyproject.toml', 'Pipfile'],
      [ProjectType.DJANGO]: ['requirements.txt', 'pyproject.toml', 'manage.py'],
      [ProjectType.FLASK]: ['requirements.txt', 'pyproject.toml'],
      [ProjectType.FASTAPI]: ['requirements.txt', 'pyproject.toml'],
      [ProjectType.JAVA]: ['pom.xml', 'build.gradle', 'build.gradle.kts'],
      [ProjectType.SPRING_BOOT]: ['pom.xml', 'build.gradle', 'build.gradle.kts'],
      [ProjectType.ANDROID]: ['build.gradle', 'build.gradle.kts'],
      [ProjectType.GO]: ['go.mod'],
      [ProjectType.RUST]: ['Cargo.toml'],
      [ProjectType.RUBY]: ['Gemfile'],
      [ProjectType.PHP]: ['composer.json'],
      [ProjectType.CSHARP]: ['*.csproj', '*.sln'],
      [ProjectType.SWIFT]: ['Package.swift'],
      [ProjectType.FLUTTER]: ['pubspec.yaml'],
    };

    const manifests = manifestMap[projectType];
    if (!manifests) return true; // 매핑 없으면 검증 스킵

    for (const manifest of manifests) {
      try {
        if (manifest.includes('*')) {
          // glob 패턴 (*.csproj 등)
          const entries = await fs.readdir(workspaceRoot);
          const ext = manifest.replace('*', '');
          if (entries.some(e => e.endsWith(ext))) return true;
        } else {
          await fs.access(path.join(workspaceRoot, manifest));
          return true;
        }
      } catch {}
    }

    return false;
  }
}
