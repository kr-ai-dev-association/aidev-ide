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
import { getValidationCommandPrompt } from "../../context/prompts/test/validationCommand";
import { RichDiagnostic, ClassificationResult, ErrorClassifier, ErrorCategory, ExecutionOutcome } from "./ErrorClassifier";
import { AutoRemediator } from "./AutoRemediator";
import { extractErrorMessage } from "./HandlerUtils";

export interface TestResult {
  success: boolean;
  errorMessage?: string;
  classification?: ClassificationResult;
}

export class TestRunner {
  /**
   * 서브 프로젝트 감지 결과 캐시 (세션 내 재사용)
   * key: workspaceRoot, value: { root, info }
   */
  private static subProjectCache: Map<string, { root: string; info: { type: ProjectType; confidence: number; buildTool: any } } | null> = new Map();

  /**
   * 서브 프로젝트 캐시 초기화 (새 세션/대화 시작 시 호출)
   */
  public static clearSubProjectCache(): void {
    TestRunner.subProjectCache.clear();
    console.log("[TestRunner] Sub-project cache cleared");
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
  ): Promise<TestResult> {
    let workspaceRoot = _workspaceRoot;
    try {
      // 검증 시작
      WebviewBridge.sendProcessingStep(webview, "executing");
      WebviewBridge.sendProcessingStatus(
        webview,
        "executing",
        "코드 검증 시작...",
      );

      // ProjectDetector를 사용하여 프로젝트 타입 감지
      WebviewBridge.sendProcessingStatus(
        webview,
        "executing",
        "프로젝트 타입 감지 중...",
      );
      const detector = new ProjectDetector();
      const projectInfo = await detector.detectProjectType(workspaceRoot);

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
              "executing",
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
              "executing",
              "프로젝트 타입 미확인 (캐시) — Diagnostics 검사만 실행",
            );
          }
        } else {
          // 캐시 미스: LLM fallback 실행
          console.log(
            "[TestRunner] Unknown project type, trying LLM fallback...",
          );
          WebviewBridge.sendProcessingStatus(
            webview,
            "executing",
            "프로젝트 타입 LLM 감지 중...",
          );
          const currentProject = ProjectManager.getInstance().getCurrentProject();
          const llmManager = LLMManager.getInstance();
          const currentModelType = llmManager.getCurrentModel();
          const ollamaApi = llmManager.getOllamaApi();

          const llmResult = await detector.detectWithLLMFallback(
            workspaceRoot,
            ollamaApi,
            currentModelType,
          );

          if (llmResult && llmResult.type !== ProjectType.UNKNOWN) {
            console.log(
              `[TestRunner] LLM fallback detected project type: ${llmResult.type}`,
            );
            Object.assign(projectInfo, llmResult);
          } else {
            // 루트에서 감지 실패 → 수정된 파일 경로 기반으로 서브디렉토리 탐지
            console.log(
              "[TestRunner] Unknown project type at root. Trying subdirectory detection based on modified files...",
            );
            const subProjectRoot = await TestRunner.findSubProjectRoot(
              workspaceRoot,
              createdFiles,
              modifiedFiles,
              detector,
            );

            // 결과를 캐시에 저장 (null도 저장 — 반복 탐색 방지)
            TestRunner.subProjectCache.set(workspaceRoot, subProjectRoot);
            console.log(
              `[TestRunner] Sub-project cache set for ${workspaceRoot}: ${subProjectRoot ? subProjectRoot.root : 'null'}`,
            );

            if (subProjectRoot) {
              console.log(
                `[TestRunner] Sub-project detected at: ${subProjectRoot.root} (type: ${subProjectRoot.info.type})`,
              );
              WebviewBridge.sendProcessingStatus(
                webview,
                "executing",
                `서브 프로젝트 감지: ${path.basename(subProjectRoot.root)} (${subProjectRoot.info.type})`,
              );
              Object.assign(projectInfo, subProjectRoot.info);
              workspaceRoot = subProjectRoot.root;
            } else {
              console.log(
                "[TestRunner] No sub-project found. Smoke Test/Lint Check will be skipped, but Diagnostics will still run.",
              );
              WebviewBridge.sendProcessingStatus(
                webview,
                "executing",
                "프로젝트 타입 미확인 — Diagnostics 검사만 실행",
              );
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
          "executing",
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
            "executing",
            "Smoke Test 실패",
          );
        } else {
          testResults.push(`Smoke Test 통과: 모든 필수 파일이 존재합니다.`);
          WebviewBridge.sendProcessingStatus(
            webview,
            "executing",
            "Smoke Test 통과",
          );
        }
      }

      // 2. VS Code Diagnostics Check (LSP 기반 빠른 검사)
      // CLI 실행 전에 문법/타입 에러를 빠르게 잡음
      WebviewBridge.sendProcessingStatus(
        webview,
        "executing",
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

        console.log(`[TestRunner] Error classification: ${classification.dominantCategory}, groups: ${classification.groups.length}, envNeedsInstall: ${envHealth.needsInstall}`);

        // Pre-LLM 자동 수정 시도 (의존성 미설치 등)
        if (classification.dominantCategory === ErrorCategory.ENVIRONMENT_MISSING) {
          WebviewBridge.sendProcessingStatus(
            webview,
            "executing",
            `환경 문제 감지 - 자동 수정 중 (${envHealth.installCommand || '...'})...`,
          );

          const remediation = await AutoRemediator.attemptFix(classification, workspaceRoot, webview);

          if (remediation.attempted && remediation.success) {
            console.log(`[TestRunner] Auto-remediation succeeded: ${remediation.command}`);
            // LSP가 업데이트할 시간 대기
            await new Promise(resolve => setTimeout(resolve, 3000));

            // Diagnostics 재확인
            const retryDiagnostics = await TestRunner.checkDiagnostics(
              createdFiles, modifiedFiles, workspaceRoot
            );

            if (retryDiagnostics.length === 0) {
              testResults.push(`Diagnostics 검사 통과: 자동 의존성 설치 후 에러 해결됨`);
              WebviewBridge.sendProcessingStatus(
                webview,
                "executing",
                "Diagnostics 검사 통과 (자동 수정 적용)",
              );
              // CLI 검증으로 계속 진행 (fall through)
            } else {
              // 자동 수정 후에도 에러 남음 → 재분류하여 반환
              const newEnvHealth = ProjectDetector.checkEnvironmentHealth(workspaceRoot);
              const newClassification = ErrorClassifier.classify(retryDiagnostics, newEnvHealth, configFiles);
              const errorSummary = TestRunner.formatClassifiedErrors(newClassification);

              return {
                success: false,
                errorMessage: errorSummary,
                classification: newClassification,
              };
            }
          } else {
            // 자동 수정 실패 또는 미시도
            const errorSummary = TestRunner.formatClassifiedErrors(classification);
            return {
              success: false,
              errorMessage: errorSummary,
              classification,
            };
          }
        } else {
          // 환경 문제가 아닌 일반 에러 → 분류 결과와 함께 반환
          const errorSummary = TestRunner.formatClassifiedErrors(classification);
          WebviewBridge.sendProcessingStatus(
            webview,
            "executing",
            `Diagnostics 에러 ${diagnosticErrors.length}개 발견`,
          );

          return {
            success: false,
            errorMessage: errorSummary,
            classification,
          };
        }
      } else {
        testResults.push(`Diagnostics 검사 통과: 문법/타입 에러 없음`);
        WebviewBridge.sendProcessingStatus(
          webview,
          "executing",
          "Diagnostics 검사 통과",
        );
      }

      // 3. Lint Check: 프로젝트 타입별 컴파일/빌드 검사 (CLI) — UNKNOWN이면 스킵
      let cliClassification: ClassificationResult | undefined;

      if (!isUnknownProject) {
        // 3-0. CLI 검증 전 의존성 설치 여부 확인
        const envHealth = ProjectDetector.checkEnvironmentHealth(workspaceRoot);
        if (envHealth.needsInstall && envHealth.installCommand) {
          console.log(`[TestRunner] Dependencies missing (no ${envHealth.hasDependencyDir ? '' : 'dependency dir'}). Running: ${envHealth.installCommand}`);
          WebviewBridge.sendProcessingStatus(
            webview,
            "executing",
            `의존성 설치 중: ${envHealth.installCommand}...`,
          );
          const installResult = await AutoRemediator.attemptInstall(envHealth.installCommand, workspaceRoot, webview);
          if (installResult.success) {
            console.log(`[TestRunner] Pre-validation install succeeded: ${envHealth.installCommand}`);
          } else {
            console.warn(`[TestRunner] Pre-validation install failed: ${installResult.message}`);
            testResults.push(`의존성 설치 실패: ${installResult.message}`);
            WebviewBridge.sendProcessingStatus(webview, "executing", "의존성 설치 실패");
            // 설치 실패해도 validation은 시도 (실패할 수 있지만 에러 메시지를 LLM에게 전달하기 위해)
          }
        }

        let validationCmd = await detector.getValidationCommand(
          projectInfo.type,
          workspaceRoot,
          createdFiles,
          modifiedFiles,
        );

        // COMMAND_NOT_FOUND fallback: 이전에 실패한 명령어면 스킵하고 다음 후보 요청
        if (validationCmd && excludedValidationCommands.length > 0) {
          const cmdStr = validationCmd.command;
          const isExcluded = excludedValidationCommands.some(
            excluded => cmdStr.includes(excluded) || excluded.includes(cmdStr)
          );
          if (isExcluded) {
            console.log(`[TestRunner] Validation command excluded (not found): ${cmdStr}. Trying next candidate.`);
            validationCmd = await detector.getNextValidationCandidate(
              projectInfo.type,
              workspaceRoot,
              createdFiles,
              modifiedFiles,
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
            createdFiles,
            modifiedFiles,
          );
        }

        if (validationCmd) {
          const lintResult = await TestRunner.runValidationCommand(
            webview,
            validationCmd,
            workspaceRoot,
            validationTimeout,
          );
          testResults.push(lintResult.message);
          cliClassification = lintResult.classification;
        } else {
          testResults.push(
            `컴파일 검사: 프로젝트 타입(${projectInfo.type})에 대한 검증 명령어를 결정할 수 없습니다. (규칙 기반 및 LLM fallback 모두 실패)`,
          );
          WebviewBridge.sendProcessingStatus(
            webview,
            "executing",
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
          "executing",
          "테스트 검증 실패",
        );
        UsageMetricsManager.getInstance().recordVerification(false);
        return { success: false, errorMessage, classification: cliClassification };
      }

      // 모든 테스트 통과
      WebviewBridge.sendProcessingStatus(
        webview,
        "executing",
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
  ): Promise<{ command: string; description: string } | null> {
    console.log(
      "[TestRunner] getValidationCommand() returned null. Querying LLM for validation command...",
    );
    WebviewBridge.sendProcessingStatus(
      webview,
      "executing",
      "검증 명령어 LLM 추론 중...",
    );

    const llmManager = LLMManager.getInstance();

    try {
      const prompt = getValidationCommandPrompt({
        projectType: projectInfo.type.toString(),
        workspaceRoot,
        createdFiles,
        modifiedFiles,
      });

      const response = await llmManager.sendMessage(prompt);

      // JSON 파싱
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.command && parsed.description) {
            const validationCmd = {
              command: parsed.command,
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
  ): Promise<{ message: string; classification?: ClassificationResult }> {
    WebviewBridge.sendProcessingStatus(
      webview,
      "executing",
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
          "executing",
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
          "executing",
          `${validationCmd.description} 실패`,
        );
        return { message, classification };
      }
    } catch (error) {
      const message = `${validationCmd.description} 실행 실패: ${extractErrorMessage(error)}`;
      WebviewBridge.sendProcessingStatus(
        webview,
        "executing",
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

    // 수정된 파일들의 첫 번째 디렉토리 세그먼트 수집 (중복 제거)
    const subDirs = new Set<string>();
    for (const file of allFiles) {
      const relativePath = path.isAbsolute(file)
        ? path.relative(workspaceRoot, file)
        : file;
      const firstSegment = relativePath.split(path.sep)[0];
      if (firstSegment && firstSegment !== relativePath) {
        subDirs.add(firstSegment);
      }
    }

    // 각 서브 디렉토리에서 프로젝트 타입 감지 시도
    for (const subDir of subDirs) {
      const subRoot = path.join(workspaceRoot, subDir);
      try {
        const stat = await fs.stat(subRoot);
        if (!stat.isDirectory()) continue;

        const subInfo = await detector.detectProjectType(subRoot);
        if (subInfo.type !== ProjectType.UNKNOWN) {
          return { root: subRoot, info: subInfo };
        }
      } catch {
        // 디렉토리 접근 실패 시 무시
      }
    }

    return null;
  }
}
