/**
 * RetryCoordinator
 * 9개 재시도 위치를 대체하는 통합 재시도 관리자
 *
 * 기능:
 * - 통합 재시도 진입점 (handleTestFailure)
 * - 구조적 패턴 추적 (retryFingerprint 기반)
 * - 동일 패턴 반복 시 조기 종료 (같은 에러 3회 반복 = 이 방법으로는 해결 불가)
 * - 수정된 파일 컨텍스트를 항상 포함
 */

import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as path from "path";
import { WebviewBridge } from "../../../webview/WebviewBridge";
import {
  ClassificationResult,
  ErrorClassifier,
  ErrorCategory,
} from "./ErrorClassifier";
import { AutoRemediator } from "./AutoRemediator";
import { TestResult } from "./TestRunner";
import {
  buildClassifiedRetryPrompt,
  ModifiedFileContext,
} from "../../context/prompts/rules";
import { ProjectDetector } from "../../project/ProjectDetector";
import { AgentConfig } from "../../../config/AgentConfig";

export interface RetryContext {
  testResult: TestResult;
  testFixAttempts: number;
  maxTestFixAttempts: number;
  isAutoTestRetryEnabled: boolean;
  createdFiles: string[];
  modifiedFiles: string[];
  workspaceRoot: string;
  webview: vscode.Webview;
}

export interface RetryDecision {
  action: "retry" | "give_up";
  prompt?: string;
  testFixAttempts: number;
  retryFingerprint: string;
  giveUpReason?: "exceeded" | "non_retryable" | "same_pattern" | "disabled";
}

export class RetryCoordinator {
  private lastFingerprint: string = "";
  private samePatternCount: number = 0;
  private _pendingFallbackModel: boolean = false;
  private buildTimeoutCount: number = 0;
  /** COMMAND_NOT_FOUND로 실패한 검증 명령어 목록 (fallback 시 제외) */
  private _excludedValidationCommands: string[] = [];

  /**
   * 에러 폴백 모델 사용 여부 확인 후 소비 (1회성)
   */
  public consumePendingFallbackModel(): boolean {
    const value = this._pendingFallbackModel;
    this._pendingFallbackModel = false;
    return value;
  }

  /**
   * BUILD_TIMEOUT 재시도 횟수에 따라 동적으로 증가하는 타임아웃 반환
   * 15s → 30s → 60s → 120s (MAX)
   */
  public getValidationTimeout(): number {
    const base = AgentConfig.VALIDATION_COMMAND_TIMEOUT;
    const multiplier = Math.pow(
      AgentConfig.BUILD_RETRY_TIMEOUT_MULTIPLIER,
      this.buildTimeoutCount,
    );
    return Math.min(base * multiplier, AgentConfig.MAX_BUILD_TIMEOUT);
  }

  /**
   * 통합 재시도 처리
   * ConversationManager의 9개 재시도 블록을 이 메서드 하나로 대체
   */
  async handleTestFailure(ctx: RetryContext): Promise<RetryDecision> {
    const {
      testResult,
      testFixAttempts,
      maxTestFixAttempts,
      isAutoTestRetryEnabled,
    } = ctx;

    // 1. 재시도 허용 여부 확인
    if (!isAutoTestRetryEnabled || testFixAttempts >= maxTestFixAttempts) {
      return {
        action: "give_up",
        testFixAttempts,
        retryFingerprint: "",
        giveUpReason: !isAutoTestRetryEnabled ? "disabled" : "exceeded",
      };
    }

    // 2. 분류 결과 가져오기 (TestResult에 포함되어 있으면 사용, 없으면 fallback)
    const classification =
      testResult.classification ||
      this.classifyFromErrorMessage(
        testResult.errorMessage || "",
        ctx.workspaceRoot,
      );

    // 3. 비재시도 카테고리 즉시 종료 (LLM이 해결할 수 없는 실행 레벨 실패)
    if (this.isNonRetryable(classification.dominantCategory)) {
      console.log(
        `[RetryCoordinator] Non-retryable category: ${classification.dominantCategory}. ` +
          `Giving up immediately. fingerprint=${classification.retryFingerprint}`,
      );

      WebviewBridge.sendProcessingStatus(
        ctx.webview,
        "executing",
        this.getNonRetryableMessage(classification.dominantCategory),
      );

      return {
        action: "give_up",
        testFixAttempts,
        retryFingerprint: classification.retryFingerprint,
        giveUpReason: "non_retryable",
      };
    }

    // 3.5. COMMAND_NOT_FOUND → 실패한 명령어 제외 후 다음 후보로 재시도
    if (classification.dominantCategory === ErrorCategory.COMMAND_NOT_FOUND) {
      // 실패한 명령어를 제외 목록에 추가
      const failedCmd = classification.groups[0]?.sampleMessages[0] || "";
      if (failedCmd) {
        this._excludedValidationCommands.push(failedCmd);
      }
      // retryFingerprint에서 명령어 추출 (command_not_found:{command}:{exitCode})
      const cmdFromFingerprint =
        classification.retryFingerprint.split(":")[1] || "";
      if (
        cmdFromFingerprint &&
        !this._excludedValidationCommands.includes(cmdFromFingerprint)
      ) {
        this._excludedValidationCommands.push(cmdFromFingerprint);
      }

      console.log(
        `[RetryCoordinator] COMMAND_NOT_FOUND — excluded commands: [${this._excludedValidationCommands.join(", ")}]. ` +
          `Will retry with next validation candidate.`,
      );

      WebviewBridge.sendProcessingStatus(
        ctx.webview,
        "executing",
        `검증 도구 미설치 — 다음 후보로 재시도 중...`,
      );

      // 재시도 (TestRunner가 excludedValidationCommands를 참고하여 다음 후보 선택)
      return {
        action: "retry" as const,
        prompt: `[System] Validation command not found (${cmdFromFingerprint}). Automatically retrying with the next validation candidate.`,
        testFixAttempts: testFixAttempts + 1,
        retryFingerprint: classification.retryFingerprint,
      };
    }

    // 3.6. BUILD_TIMEOUT → 캐시 클리어 시도 후 재시도
    if (classification.dominantCategory === ErrorCategory.BUILD_TIMEOUT) {
      this.buildTimeoutCount++;
      console.log(
        `[RetryCoordinator] BUILD_TIMEOUT detected (count=${this.buildTimeoutCount}) — next validation timeout: ${this.getValidationTimeout()}ms`,
      );
      WebviewBridge.sendProcessingStatus(
        ctx.webview,
        "executing",
        "빌드 타임아웃 — 캐시 정리 후 재시도 중...",
      );

      const remediation = await AutoRemediator.attemptFix(
        classification,
        ctx.workspaceRoot,
        ctx.webview,
      );

      if (remediation.attempted) {
        console.log(
          `[RetryCoordinator] Cache clear ${remediation.success ? "succeeded" : "failed"}: ${remediation.message}`,
        );
      }
    }

    // 4. 구조적 패턴 추적 (fingerprint 기반, 키워드 매칭 없음)
    const currentFingerprint = classification.retryFingerprint;
    if (currentFingerprint === this.lastFingerprint) {
      this.samePatternCount++;
    } else {
      this.lastFingerprint = currentFingerprint;
      this.samePatternCount = 1;
    }

    // 5. 동일 패턴 반복 시 처리
    if (this.samePatternCount > 3) {
      // 에러 폴백 모델도 실패 → give_up
      console.log(
        `[RetryCoordinator] Fallback model also failed (samePattern=${this.samePatternCount}). ` +
          `fingerprint=${currentFingerprint}, category=${classification.dominantCategory}`,
      );

      WebviewBridge.sendProcessingStatus(
        ctx.webview,
        "executing",
        `에러 폴백 모델도 실패 — 자동 수정 중단`,
      );

      return {
        action: "give_up",
        testFixAttempts,
        retryFingerprint: currentFingerprint,
        giveUpReason: "same_pattern",
      };
    }

    if (this.samePatternCount === 3) {
      // 3번째 동일 패턴 = 마지막 시도를 에러 폴백 모델로
      console.log(
        `[RetryCoordinator] Same pattern 3 times — escalating to error fallback model. ` +
          `fingerprint=${currentFingerprint}, category=${classification.dominantCategory}`,
      );
      this._pendingFallbackModel = true;
    }

    // 6. 시도 횟수 증가
    const newAttempts = testFixAttempts + 1;

    // 7. 수정된 파일 컨텍스트 읽기 (항상 포함)
    const modifiedFilesContext = await this.readModifiedFiles(ctx);

    // 8. 통합 프롬프트 생성
    const prompt = buildClassifiedRetryPrompt(
      classification,
      modifiedFilesContext,
      false, // escalation 없음 — 3회 도달 전에만 여기에 옴
      this.samePatternCount,
      undefined,
      ctx.testResult.errorMessage,
    );

    // 9. UI 업데이트
    WebviewBridge.sendProcessingStep(ctx.webview, "executing");
    WebviewBridge.sendProcessingStatus(
      ctx.webview,
      "executing",
      this._pendingFallbackModel
        ? `테스트 실패 - 에러 폴백 모델로 재시도 중 (${newAttempts}/${maxTestFixAttempts})...`
        : `테스트 실패 - 자동 수정 중 (${newAttempts}/${maxTestFixAttempts})...`,
    );

    console.log(
      `[RetryCoordinator] Retry ${newAttempts}/${maxTestFixAttempts}, ` +
        `category=${classification.dominantCategory}, ` +
        `samePattern=${this.samePatternCount}`,
    );

    return {
      action: "retry",
      prompt,
      testFixAttempts: newAttempts,
      retryFingerprint: currentFingerprint,
    };
  }

  /**
   * 패턴 추적 상태 리셋 (새 요청 시작 시)
   */
  reset(): void {
    this.lastFingerprint = "";
    this.samePatternCount = 0;
    this._pendingFallbackModel = false;
    this._excludedValidationCommands = [];
    this.buildTimeoutCount = 0;
  }

  /**
   * 검증 성공 시 호출 — buildTimeoutCount 리셋
   */
  onValidationSuccess(): void {
    this.buildTimeoutCount = 0;
  }

  /**
   * COMMAND_NOT_FOUND로 실패한 명령어 목록 반환 (TestRunner에서 제외용)
   */
  public get excludedValidationCommands(): string[] {
    return this._excludedValidationCommands;
  }

  /**
   * LLM 재시도가 무의미한 카테고리인지 확인
   * COMMAND_NOT_FOUND는 fallback 후보가 있으면 재시도 가능하므로 여기서 제외
   */
  private isNonRetryable(category: ErrorCategory): boolean {
    return (
      category === ErrorCategory.EXECUTION_TIMEOUT ||
      category === ErrorCategory.SILENT_FAILURE
    );
  }

  /**
   * 비재시도 카테고리별 사용자 메시지
   */
  private getNonRetryableMessage(category: ErrorCategory): string {
    switch (category) {
      case ErrorCategory.EXECUTION_TIMEOUT:
        return "검증 명령어 타임아웃 — 자동 수정 불가";
      case ErrorCategory.SILENT_FAILURE:
        return "명령어 실패 (출력 없음) — 자동 수정 불가";
      default:
        return "자동 수정 불가";
    }
  }

  /**
   * errorMessage만 있을 때의 fallback 분류
   */
  private classifyFromErrorMessage(
    errorMessage: string,
    workspaceRoot: string,
  ): ClassificationResult {
    const envHealth = ProjectDetector.checkEnvironmentHealth(workspaceRoot);
    return ErrorClassifier.classifyFromMessage(errorMessage, envHealth);
  }

  /**
   * 수정된 파일들의 최신 내용 읽기
   */
  private async readModifiedFiles(
    ctx: RetryContext,
  ): Promise<ModifiedFileContext[]> {
    const result: ModifiedFileContext[] = [];
    const allPaths = [...new Set([...ctx.createdFiles, ...ctx.modifiedFiles])];

    for (const filePath of allPaths) {
      try {
        const absolutePath = path.isAbsolute(filePath)
          ? filePath
          : path.join(ctx.workspaceRoot, filePath);
        const content = await fs.readFile(absolutePath, "utf-8");
        result.push({ path: filePath, content });
      } catch {
        // 읽기 실패 파일은 스킵
      }
    }

    return result;
  }
}
