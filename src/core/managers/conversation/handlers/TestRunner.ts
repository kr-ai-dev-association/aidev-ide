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
import { getCriticPassPrompt, parseCriticPassResult, CriticPassResult } from '../../context/prompts/test/criticPass';
import * as fsSync from 'fs';
import { StateManager } from '../../state/StateManager';

export interface TestResult {
    success: boolean;
    errorMessage?: string;
}

export class TestRunner {
    /**
     * Critic Pass + 자동 테스트 검증 통합 실행
     * 순서: Critic Pass (활성화된 경우) → Automated Tests
     *
     * @param context - Extension context (Critic Pass 설정 확인용)
     * @param userRequest - 원래 사용자 요청 (Critic Pass용)
     */
    public static async runCriticPassAndTests(
        webview: vscode.Webview,
        workspaceRoot: string,
        createdFiles: string[],
        modifiedFiles: string[],
        context: vscode.ExtensionContext,
        userRequest: string = ''
    ): Promise<TestResult & { criticPassFixes?: CriticPassResult['fixes'] }> {
        // 1. Critic Pass 실행 (활성화된 경우)
        const criticPassResult = await TestRunner.runCriticPass(
            webview,
            workspaceRoot,
            createdFiles,
            modifiedFiles,
            userRequest,
            context
        );

        // Critic Pass 실패 시 수정 사항 반환
        if (!criticPassResult.success && criticPassResult.fixes && criticPassResult.fixes.length > 0) {
            return {
                success: false,
                errorMessage: `Critic Pass 검증 실패: ${criticPassResult.result?.summary || '코드에 문제가 발견되었습니다.'}`,
                criticPassFixes: criticPassResult.fixes
            };
        }

        // 2. 자동 테스트 검증 실행
        return await TestRunner.runAutomatedTests(webview, workspaceRoot, createdFiles, modifiedFiles);
    }

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

            // 2. VS Code Diagnostics Check (LSP 기반 빠른 검사)
            // CLI 실행 전에 문법/타입 에러를 빠르게 잡음
            WebviewBridge.sendProcessingStatus(webview, 'executing', 'Diagnostics 검사 중...');
            const diagnosticErrors = await TestRunner.checkDiagnostics(createdFiles, modifiedFiles, workspaceRoot);
            if (diagnosticErrors.length > 0) {
                const errorSummary = diagnosticErrors
                    .slice(0, 10) // 최대 10개만 표시
                    .map((e: { file: string; line: number; message: string }) => `- ${e.file}:${e.line}: ${e.message}`)
                    .join('\n');
                const truncatedNote = diagnosticErrors.length > 10 ? `\n... 외 ${diagnosticErrors.length - 10}개 에러` : '';
                testResults.push(`Diagnostics 검사 실패:\n${errorSummary}${truncatedNote}`);
                WebviewBridge.sendProcessingStatus(webview, 'executing', `Diagnostics 에러 ${diagnosticErrors.length}개 발견`);

                // Diagnostics 에러가 있으면 CLI 검사 없이 바로 반환 (빠른 피드백)
                return {
                    success: false,
                    errorMessage: `Diagnostics 검사 실패 (${diagnosticErrors.length}개 에러):\n${errorSummary}${truncatedNote}`
                };
            } else {
                testResults.push(`Diagnostics 검사 통과: 문법/타입 에러 없음`);
                WebviewBridge.sendProcessingStatus(webview, 'executing', 'Diagnostics 검사 통과');
            }

            // 3. Lint Check: 프로젝트 타입별 컴파일/빌드 검사 (CLI)
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
     * VS Code Diagnostics를 사용한 빠른 에러 검사
     * LSP 기반으로 문법/타입 에러를 CLI 실행 없이 빠르게 확인
     */
    private static async checkDiagnostics(
        createdFiles: string[],
        modifiedFiles: string[],
        workspaceRoot: string
    ): Promise<Array<{ file: string; line: number; message: string; code: string | number }>> {
        const errors: Array<{ file: string; line: number; message: string; code: string | number }> = [];
        const allFiles = [...createdFiles, ...modifiedFiles];

        for (const filePath of allFiles) {
            try {
                const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(workspaceRoot, filePath);
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
                    d => d.severity === vscode.DiagnosticSeverity.Error
                );

                for (const diagnostic of criticalErrors) {
                    const fileName = path.relative(workspaceRoot, absolutePath);
                    errors.push({
                        file: fileName,
                        line: diagnostic.range.start.line + 1, // 0-based to 1-based
                        message: diagnostic.message,
                        code: diagnostic.code?.toString() || 'unknown'
                    });
                }
            } catch (error) {
                console.warn(`[TestRunner] Failed to check diagnostics for ${filePath}:`, error);
            }
        }

        return errors;
    }

    /**
     * Critic Pass: LLM이 생성/수정한 코드를 재검증
     * 자동 검증 테스트(runAutomatedTests) 전에 호출됨
     */
    public static async runCriticPass(
        webview: vscode.Webview,
        workspaceRoot: string,
        createdFiles: string[],
        modifiedFiles: string[],
        userRequest: string,
        context: vscode.ExtensionContext
    ): Promise<{ success: boolean; result: CriticPassResult | null; fixes?: CriticPassResult['fixes'] }> {
        try {
            // Critic Pass 설정 확인
            const stateManager = StateManager.getInstance(context);
            const criticPassEnabled = await stateManager.getCriticPassEnabled();

            if (!criticPassEnabled) {
                console.log('[TestRunner] Critic Pass is disabled, skipping...');
                return { success: true, result: null };
            }

            // 파일이 없으면 스킵
            if (createdFiles.length === 0 && modifiedFiles.length === 0) {
                console.log('[TestRunner] No files to validate, skipping Critic Pass...');
                return { success: true, result: null };
            }

            WebviewBridge.sendProcessingStatus(webview, 'executing', 'Critic Pass: 코드 검증 중...');
            console.log('[TestRunner] Running Critic Pass...');

            // 파일 내용 읽기
            const createdFilesWithContent: Array<{ path: string; content: string }> = [];
            const modifiedFilesWithContent: Array<{ path: string; content: string }> = [];

            for (const filePath of createdFiles) {
                try {
                    const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(workspaceRoot, filePath);
                    const content = fsSync.readFileSync(absolutePath, 'utf-8');
                    createdFilesWithContent.push({ path: filePath, content });
                } catch (error) {
                    console.warn(`[TestRunner] Failed to read created file: ${filePath}`, error);
                }
            }

            for (const filePath of modifiedFiles) {
                try {
                    const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(workspaceRoot, filePath);
                    const content = fsSync.readFileSync(absolutePath, 'utf-8');
                    modifiedFilesWithContent.push({ path: filePath, content });
                } catch (error) {
                    console.warn(`[TestRunner] Failed to read modified file: ${filePath}`, error);
                }
            }

            // LLM API 가져오기
            const llmManager = LLMManager.getInstance();
            const currentModelType = llmManager.getCurrentModel();
            const geminiApi = llmManager.getGeminiApi();
            const ollamaApi = llmManager.getOllamaApi();
            const llmApi = currentModelType === AiModelType.GEMINI ? geminiApi : ollamaApi;

            if (!llmApi) {
                console.warn('[TestRunner] No LLM API available for Critic Pass');
                WebviewBridge.sendProcessingStatus(webview, 'executing', 'Critic Pass: LLM 없음 (건너뜀)');
                return { success: true, result: null };
            }

            // Critic Pass 프롬프트 생성
            const prompt = getCriticPassPrompt({
                createdFiles: createdFilesWithContent,
                modifiedFiles: modifiedFilesWithContent,
                userRequest,
                projectType: 'auto-detected'
            });

            // LLM 호출
            WebviewBridge.sendProcessingStatus(webview, 'executing', 'Critic Pass: LLM 검증 중...');
            const response = await llmApi.sendMessage(prompt);

            // 결과 파싱
            const result = parseCriticPassResult(response);

            if (!result) {
                console.warn('[TestRunner] Failed to parse Critic Pass result');
                WebviewBridge.sendProcessingStatus(webview, 'executing', 'Critic Pass: 결과 파싱 실패');
                return { success: true, result: null }; // 파싱 실패 시 통과로 간주
            }

            if (result.status === 'pass') {
                console.log('[TestRunner] Critic Pass: All checks passed');
                WebviewBridge.sendProcessingStatus(webview, 'executing', 'Critic Pass: 검증 통과 ✓');
                return { success: true, result };
            } else {
                console.log(`[TestRunner] Critic Pass: Found ${result.issues.length} issues`);
                WebviewBridge.sendProcessingStatus(webview, 'executing', `Critic Pass: ${result.issues.length}개 문제 발견`);

                // 수정 사항이 있으면 반환
                if (result.fixes && result.fixes.length > 0) {
                    return { success: false, result, fixes: result.fixes };
                }

                return { success: false, result };
            }

        } catch (error) {
            console.error('[TestRunner] Error running Critic Pass:', error);
            WebviewBridge.sendProcessingStatus(webview, 'executing', 'Critic Pass: 오류 발생');
            return { success: true, result: null }; // 오류 발생 시 통과로 간주
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
