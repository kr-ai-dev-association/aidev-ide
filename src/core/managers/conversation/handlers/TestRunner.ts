/**
 * TestRunner
 * 자동 테스트 실행 및 검증을 담당하는 클래스
 */

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { WebviewBridge } from '../../../webview/WebviewBridge';
import { ProjectDetector } from '../../project/ProjectDetector';
import { ProjectType } from '../../project/types';
import { ProjectManager } from '../../project/ProjectManager';
import { LLMManager } from '../../model/LLMManager';
import { ExecutionManager } from '../../execution/ExecutionManager';
import { AiModelType } from '../../../../services';
import { AgentConfig } from '../../../config/AgentConfig';
import { StringUtils } from '../../../utils/StringUtils';
import { getValidationCommandPrompt } from '../../context/prompts/test/validationCommand';

export interface TestResult {
    success: boolean;
    errorMessage?: string;
}

export class TestRunner {
    /**
     * 자동 테스트 검증 (Smoke Test & Lint Check)
     */
    public static async runAutomatedTests(
        webview: vscode.Webview,
        workspaceRoot: string,
        createdFiles: string[],
        modifiedFiles: string[]
    ): Promise<TestResult> {
        try {
            // 검증 시작
            WebviewBridge.sendProcessingStep(webview, 'executing');
            WebviewBridge.sendProcessingStatus(webview, 'executing', '코드 검증 시작...');

            // ProjectDetector를 사용하여 프로젝트 타입 감지
            WebviewBridge.sendProcessingStatus(webview, 'executing', '프로젝트 타입 감지 중...');
            const detector = new ProjectDetector();
            const projectInfo = await detector.detectProjectType(workspaceRoot);

            // Fallback: 규칙으로 찾지 못했을 때 LLM에게 판단 넘기기
            if (projectInfo.type === ProjectType.UNKNOWN) {
                console.log('[TestRunner] Unknown project type, trying LLM fallback...');
                WebviewBridge.sendProcessingStatus(webview, 'executing', '프로젝트 타입 LLM 감지 중...');
                const currentProject = ProjectManager.getInstance().getCurrentProject();
                const llmManager = LLMManager.getInstance();
                const currentModelType = llmManager.getCurrentModel();
                const geminiApi = llmManager.getGeminiApi();
                const ollamaApi = llmManager.getOllamaApi();

                const llmResult = await detector.detectWithLLMFallback(
                    workspaceRoot,
                    currentModelType === AiModelType.GEMINI ? geminiApi : ollamaApi,
                    currentModelType
                );

                if (llmResult && llmResult.type !== ProjectType.UNKNOWN) {
                    console.log(`[TestRunner] LLM fallback detected project type: ${llmResult.type}`);
                    Object.assign(projectInfo, llmResult);
                } else {
                    console.log('[TestRunner] Unknown project type, skipping automated tests.');
                    WebviewBridge.sendProcessingStatus(webview, 'executing', '프로젝트 타입 미확인 테스트 검증 완료');
                    return { success: true }; // 알 수 없는 프로젝트 타입은 성공으로 간주
                }
            }

            const testResults: string[] = [];

            // 1. Smoke Test: 프로젝트 타입별 필수 파일 존재 확인
            WebviewBridge.sendProcessingStatus(webview, 'executing', 'Smoke Test 실행 중 (필수 파일 확인)...');
            const criticalFiles = detector.getCriticalFiles(projectInfo.type, workspaceRoot);

            const missingFiles: string[] = [];
            for (const file of criticalFiles) {
                try {
                    const filePath = path.isAbsolute(file) ? file : path.join(workspaceRoot, file);
                    await fs.access(filePath);
                } catch {
                    // build.gradle와 build.gradle.kts는 둘 중 하나만 있으면 됨
                    if (projectInfo.type === ProjectType.SPRING_BOOT && projectInfo.buildTool.toString().includes('gradle') && (file === 'build.gradle' || file === 'build.gradle.kts')) {
                        const otherFile = file === 'build.gradle' ? 'build.gradle.kts' : 'build.gradle';
                        try {
                            await fs.access(path.join(workspaceRoot, otherFile));
                            continue; // 다른 파일이 있으면 통과
                        } catch { }
                    }
                    // requirements.txt와 pyproject.toml도 둘 중 하나만 있으면 됨
                    if ((projectInfo.type === ProjectType.PYTHON || projectInfo.type === ProjectType.DJANGO || projectInfo.type === ProjectType.FLASK || projectInfo.type === ProjectType.FASTAPI) && (file === 'requirements.txt' || file === 'pyproject.toml')) {
                        const otherFile = file === 'requirements.txt' ? 'pyproject.toml' : 'requirements.txt';
                        try {
                            await fs.access(path.join(workspaceRoot, otherFile));
                            continue; // 다른 파일이 있으면 통과
                        } catch { }
                    }
                    missingFiles.push(file);
                }
            }

            if (missingFiles.length > 0) {
                testResults.push(`Smoke Test 실패: 다음 파일이 누락되었습니다: ${missingFiles.join(', ')}`);
                WebviewBridge.sendProcessingStatus(webview, 'executing', 'Smoke Test 실패');
            } else {
                testResults.push(`Smoke Test 통과: 모든 필수 파일이 존재합니다.`);
                WebviewBridge.sendProcessingStatus(webview, 'executing', 'Smoke Test 통과');
            }

            // 2. Lint Check: 프로젝트 타입별 컴파일/빌드 검사
            let validationCmd = detector.getValidationCommand(projectInfo.type, workspaceRoot, createdFiles, modifiedFiles);

            // Fallback: getValidationCommand()가 null을 반환하면 LLM에게 질의
            if (!validationCmd) {
                validationCmd = await TestRunner.getValidationCommandFromLLM(
                    webview,
                    projectInfo,
                    workspaceRoot,
                    createdFiles,
                    modifiedFiles
                );
            }

            if (validationCmd) {
                const lintResult = await TestRunner.runValidationCommand(
                    webview,
                    validationCmd,
                    workspaceRoot
                );
                testResults.push(lintResult);
            } else {
                testResults.push(`컴파일 검사: 프로젝트 타입(${projectInfo.type})에 대한 검증 명령어를 결정할 수 없습니다. (규칙 기반 및 LLM fallback 모두 실패)`);
                WebviewBridge.sendProcessingStatus(webview, 'executing', '검증 명령어 없음 (건너뜀)');
            }

            // 실패한 테스트 확인
            const hasFailedTests = testResults.some(r => r.includes('실패') || r.includes('Failed'));

            if (hasFailedTests) {
                const failedTestMessages = testResults.filter(r => r.includes('실패') || r.includes('Failed'));
                const errorMessage = failedTestMessages.join('\n');
                WebviewBridge.sendProcessingStatus(webview, 'executing', '테스트 검증 실패');
                return { success: false, errorMessage };
            }

            // 모든 테스트 통과
            WebviewBridge.sendProcessingStatus(webview, 'executing', '테스트 검증 통과');
            return { success: true };

        } catch (error) {
            console.error('[TestRunner] Error running automated tests:', error);
            const errorMsg = `자동 테스트 실행 중 오류 발생: ${error instanceof Error ? error.message : String(error)}`;
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
        modifiedFiles: string[]
    ): Promise<{ command: string; description: string } | null> {
        console.log('[TestRunner] getValidationCommand() returned null. Querying LLM for validation command...');
        WebviewBridge.sendProcessingStatus(webview, 'executing', '검증 명령어 LLM 추론 중...');

        const llmManager = LLMManager.getInstance();
        const currentModelType = llmManager.getCurrentModel();
        const geminiApi = llmManager.getGeminiApi();
        const ollamaApi = llmManager.getOllamaApi();
        const llmApi = currentModelType === AiModelType.GEMINI ? geminiApi : ollamaApi;

        if (!llmApi) {
            return null;
        }

        try {
            const prompt = getValidationCommandPrompt({
                projectType: projectInfo.type.toString(),
                workspaceRoot,
                createdFiles,
                modifiedFiles
            });

            const response = await llmApi.sendMessage(prompt);

            // JSON 파싱
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                try {
                    const parsed = JSON.parse(jsonMatch[0]);
                    if (parsed.command && parsed.description) {
                        const validationCmd = {
                            command: parsed.command,
                            description: parsed.description
                        };
                        console.log(`[TestRunner] LLM suggested validation command: ${validationCmd.command}`);
                        return validationCmd;
                    }
                } catch (parseError) {
                    console.error('[TestRunner] Failed to parse LLM response for validation command:', parseError);
                }
            }
        } catch (llmError) {
            console.error('[TestRunner] Error querying LLM for validation command:', llmError);
        }

        return null;
    }

    /**
     * 검증 명령어 실행
     */
    private static async runValidationCommand(
        webview: vscode.Webview,
        validationCmd: { command: string; description: string },
        workspaceRoot: string
    ): Promise<string> {
        WebviewBridge.sendProcessingStatus(webview, 'executing', `${validationCmd.description} 실행 중...`);
        try {
            const executionManager = ExecutionManager.getInstance();
            const result = await executionManager.executeCommand(
                validationCmd.command,
                { cwd: workspaceRoot, timeout: AgentConfig.VALIDATION_COMMAND_TIMEOUT }
            );

            if (result.exitCode === 0) {
                const message = `${validationCmd.description} 통과: 문법 오류가 없습니다.`;
                WebviewBridge.sendProcessingStatus(webview, 'executing', `${validationCmd.description} 통과`);
                return message;
            } else {
                const errorOutput = result.stderr || result.stdout || '';
                const truncatedOutput = StringUtils.truncate(errorOutput, AgentConfig.MAX_ERROR_MESSAGE_LENGTH);
                const message = `${validationCmd.description} 실패: 오류가 발견되었습니다.\n${truncatedOutput}`;
                WebviewBridge.sendProcessingStatus(webview, 'executing', `${validationCmd.description} 실패`);
                return message;
            }
        } catch (error) {
            const message = `${validationCmd.description} 실행 실패: ${error instanceof Error ? error.message : String(error)}`;
            WebviewBridge.sendProcessingStatus(webview, 'executing', `${validationCmd.description} 실행 실패`);
            return message;
        }
    }

    /**
     * 에러 패턴 추출 (중복 재시도 방지용)
     */
    public static extractErrorPattern(errorMessage: string): string {
        // TypeScript 에러 패턴: "error TS2345: ..."
        const tsErrorMatch = errorMessage.match(/error\s+TS\d+:/i);
        if (tsErrorMatch) {
            return `TS_ERROR:${tsErrorMatch[0]}`;
        }

        // Import 에러 패턴: "Cannot find module ..."
        const importErrorMatch = errorMessage.match(/Cannot find module ['"]([^'"]+)['"]/i);
        if (importErrorMatch) {
            return `IMPORT_ERROR:${importErrorMatch[1]}`;
        }

        // Dependency 에러 패턴: "npm ERR!" 또는 "Module not found"
        const depErrorMatch = errorMessage.match(/(npm ERR!|Module not found|Cannot resolve)/i);
        if (depErrorMatch) {
            return `DEPENDENCY_ERROR:${depErrorMatch[0]}`;
        }

        // Build 에러 패턴: "Build failed" 또는 "Compilation failed"
        const buildErrorMatch = errorMessage.match(/(Build failed|Compilation failed)/i);
        if (buildErrorMatch) {
            return `BUILD_ERROR:${buildErrorMatch[0]}`;
        }

        // 기본 패턴: 첫 100자
        return `GENERIC:${errorMessage.substring(0, 100).replace(/\s+/g, ' ')}`;
    }
}
