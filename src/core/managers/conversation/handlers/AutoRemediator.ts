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
import * as fs from "fs";
import * as path from "path";
import { WebviewBridge } from "../../../webview/WebviewBridge";
import { ExecutionManager } from "../../execution/ExecutionManager";
import { ClassificationResult, ErrorCategory } from "./ErrorClassifier";
import { extractErrorMessage } from "./HandlerUtils";

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

        // Case 2: 빌드 타임아웃 → 빌드 캐시 클리어 시도
        if (classification.dominantCategory === ErrorCategory.BUILD_TIMEOUT) {
            const cleanCmd = this.detectCleanCommand(workspaceRoot);
            if (cleanCmd) {
                return await this.runCleanCommand(cleanCmd, workspaceRoot, webview);
            }
        }

        // Case 3: 자동 수정 해당 없음
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
            const errorMsg = extractErrorMessage(error);
            console.error(`[AutoRemediator] Install command threw: ${errorMsg}`);

            return {
                attempted: true,
                success: false,
                command: installCommand,
                message: `의존성 설치 중 오류: ${errorMsg.substring(0, 300)}`
            };
        }
    }

    // ─── 빌드 캐시 클리어 ───

    /**
     * 프로젝트 타입별 빌드 캐시 클리어 명령 감지
     */
    private static detectCleanCommand(workspaceRoot: string): string | null {
        const exists = (file: string) =>
            fs.existsSync(path.join(workspaceRoot, file));

        // Gradle
        if (exists('gradlew') || exists('gradlew.bat')) {
            return process.platform === 'win32' ? 'gradlew.bat clean' : './gradlew clean';
        }
        if (exists('build.gradle') || exists('build.gradle.kts')) {
            return 'gradle clean';
        }

        // Maven
        if (exists('pom.xml')) {
            return 'mvn clean';
        }

        // Node.js (빌드 캐시 디렉토리 삭제)
        if (exists('package.json')) {
            if (process.platform === 'win32') {
                return 'cmd /c "for %d in (dist build .next .nuxt .vite .parcel-cache) do if exist %d rmdir /s /q %d"';
            }
            return 'rm -rf dist build .next .nuxt .vite .parcel-cache';
        }

        // Rust
        if (exists('Cargo.toml')) {
            return 'cargo clean';
        }

        // Go
        if (exists('go.mod')) {
            return 'go clean -cache';
        }

        // .NET
        if (fs.readdirSync(workspaceRoot).some(f => f.endsWith('.csproj') || f.endsWith('.sln'))) {
            return 'dotnet clean';
        }

        return null;
    }

    /**
     * 빌드 캐시 클리어 명령 실행
     */
    private static async runCleanCommand(
        cleanCommand: string,
        workspaceRoot: string,
        webview: vscode.Webview
    ): Promise<RemediationResult> {
        console.log(`[AutoRemediator] Running clean command: ${cleanCommand} in ${workspaceRoot}`);

        WebviewBridge.sendProcessingStatus(
            webview,
            "executing",
            `빌드 캐시 정리 중: ${cleanCommand}...`
        );

        try {
            const executionManager = ExecutionManager.getInstance();
            const result = await executionManager.executeCommand(cleanCommand, {
                cwd: workspaceRoot,
                timeout: 60000,       // 60초 타임아웃
                killOnTimeout: true,
            });

            if (result.success) {
                console.log(`[AutoRemediator] Clean succeeded: ${cleanCommand}`);
                WebviewBridge.sendProcessingStatus(
                    webview,
                    "executing",
                    `빌드 캐시 정리 완료`
                );

                return {
                    attempted: true,
                    success: true,
                    command: cleanCommand,
                    message: `빌드 캐시 정리 성공: ${cleanCommand}`
                };
            } else {
                const errorMsg = result.stderr || result.stdout || '알 수 없는 오류';
                console.warn(`[AutoRemediator] Clean failed: ${cleanCommand} - ${errorMsg.substring(0, 200)}`);

                return {
                    attempted: true,
                    success: false,
                    command: cleanCommand,
                    message: `빌드 캐시 정리 실패 (${cleanCommand}): ${errorMsg.substring(0, 300)}`
                };
            }
        } catch (error) {
            const errorMsg = extractErrorMessage(error);
            console.error(`[AutoRemediator] Clean command threw: ${errorMsg}`);

            return {
                attempted: true,
                success: false,
                command: cleanCommand,
                message: `빌드 캐시 정리 중 오류: ${errorMsg.substring(0, 300)}`
            };
        }
    }
}
