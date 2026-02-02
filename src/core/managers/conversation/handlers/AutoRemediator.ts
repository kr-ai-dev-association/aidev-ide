/**
 * AutoRemediator
 * Pre-LLM 자동 수정 — 파일시스템 상태로 100% 확실한 경우만 자동 수정
 *
 * 현재 지원:
 * - 의존성 디렉토리 누락 시 자동 설치 (npm install, pip install 등)
 *
 * 설계 원칙:
 * - 의도적으로 최소한의 범위만 처리
 * - LLM 추론이 필요한 수정은 절대 시도하지 않음
 * - 파일시스템 상태 기반 판단만 사용
 */

import * as vscode from "vscode";
import { WebviewBridge } from "../../../webview/WebviewBridge";
import { ExecutionManager } from "../../execution/ExecutionManager";
import { ClassificationResult, ErrorCategory } from "./ErrorClassifier";

export interface RemediationResult {
    attempted: boolean;
    success: boolean;
    command?: string;
    message: string;
}

export class AutoRemediator {

    /**
     * 분류된 에러에 대해 LLM 없이 자동 수정을 시도
     * 성공 여부와 관계없이 시도 결과를 반환
     */
    static async attemptFix(
        classification: ClassificationResult,
        workspaceRoot: string,
        webview: vscode.Webview
    ): Promise<RemediationResult> {
        const env = classification.environmentCheck;

        // Case 1: 의존성 디렉토리 누락 (가장 흔한 케이스)
        if (
            classification.dominantCategory === ErrorCategory.ENVIRONMENT_MISSING &&
            env.needsInstall &&
            env.installCommand
        ) {
            return await this.runInstallCommand(env.installCommand, workspaceRoot, webview);
        }

        // Case 2: 자동 수정 해당 없음
        return {
            attempted: false,
            success: false,
            message: '자동 수정 해당 없음'
        };
    }

    /**
     * 의존성 설치 명령어 실행
     */
    private static async runInstallCommand(
        installCommand: string,
        workspaceRoot: string,
        webview: vscode.Webview
    ): Promise<RemediationResult> {
        console.log(`[AutoRemediator] Running install command: ${installCommand} in ${workspaceRoot}`);

        WebviewBridge.sendProcessingStatus(
            webview,
            "executing",
            `의존성 설치 중: ${installCommand}...`
        );

        try {
            const executionManager = ExecutionManager.getInstance();
            const result = await executionManager.executeCommand(installCommand, {
                cwd: workspaceRoot,
                timeout: 120000,      // 2분 타임아웃
                killOnTimeout: true,
            });

            if (result.success) {
                console.log(`[AutoRemediator] Install succeeded: ${installCommand}`);
                WebviewBridge.sendProcessingStatus(
                    webview,
                    "executing",
                    `의존성 설치 완료: ${installCommand}`
                );

                return {
                    attempted: true,
                    success: true,
                    command: installCommand,
                    message: `의존성 설치 성공: ${installCommand}`
                };
            } else {
                const errorMsg = result.stderr || result.stdout || '알 수 없는 오류';
                console.warn(`[AutoRemediator] Install failed: ${installCommand} - ${errorMsg.substring(0, 200)}`);
                WebviewBridge.sendProcessingStatus(
                    webview,
                    "executing",
                    `의존성 설치 실패`
                );

                return {
                    attempted: true,
                    success: false,
                    command: installCommand,
                    message: `의존성 설치 실패 (${installCommand}): ${errorMsg.substring(0, 300)}`
                };
            }
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error(`[AutoRemediator] Install command threw: ${errorMsg}`);

            return {
                attempted: true,
                success: false,
                command: installCommand,
                message: `의존성 설치 중 오류: ${errorMsg.substring(0, 300)}`
            };
        }
    }
}
