"use strict";
/**
 * TestRunner
 * 자동 테스트 실행 및 검증을 담당하는 클래스
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.TestRunner = void 0;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const WebviewBridge_1 = require("../../../webview/WebviewBridge");
const ProjectDetector_1 = require("../../project/ProjectDetector");
const types_1 = require("../../project/types");
const ProjectManager_1 = require("../../project/ProjectManager");
const LLMManager_1 = require("../../model/LLMManager");
const ExecutionManager_1 = require("../../execution/ExecutionManager");
const services_1 = require("../../../../services");
const AgentConfig_1 = require("../../../config/AgentConfig");
const StringUtils_1 = require("../../../utils/StringUtils");
const validationCommand_1 = require("../../context/prompts/test/validationCommand");
class TestRunner {
    /**
     * 자동 테스트 검증 (Smoke Test & Lint Check)
     */
    static async runAutomatedTests(webview, workspaceRoot, createdFiles, modifiedFiles) {
        try {
            // 검증 시작
            WebviewBridge_1.WebviewBridge.sendProcessingStep(webview, 'executing');
            WebviewBridge_1.WebviewBridge.sendProcessingStatus(webview, 'executing', '코드 검증 시작...');
            // ProjectDetector를 사용하여 프로젝트 타입 감지
            WebviewBridge_1.WebviewBridge.sendProcessingStatus(webview, 'executing', '프로젝트 타입 감지 중...');
            const detector = new ProjectDetector_1.ProjectDetector();
            const projectInfo = await detector.detectProjectType(workspaceRoot);
            // Fallback: 규칙으로 찾지 못했을 때 LLM에게 판단 넘기기
            if (projectInfo.type === types_1.ProjectType.UNKNOWN) {
                console.log('[TestRunner] Unknown project type, trying LLM fallback...');
                WebviewBridge_1.WebviewBridge.sendProcessingStatus(webview, 'executing', '프로젝트 타입 LLM 감지 중...');
                const currentProject = ProjectManager_1.ProjectManager.getInstance().getCurrentProject();
                const llmManager = LLMManager_1.LLMManager.getInstance();
                const currentModelType = llmManager.getCurrentModel();
                const geminiApi = llmManager.getGeminiApi();
                const ollamaApi = llmManager.getOllamaApi();
                const llmResult = await detector.detectWithLLMFallback(workspaceRoot, currentModelType === services_1.AiModelType.GEMINI ? geminiApi : ollamaApi, currentModelType);
                if (llmResult && llmResult.type !== types_1.ProjectType.UNKNOWN) {
                    console.log(`[TestRunner] LLM fallback detected project type: ${llmResult.type}`);
                    Object.assign(projectInfo, llmResult);
                }
                else {
                    console.log('[TestRunner] Unknown project type, skipping automated tests.');
                    WebviewBridge_1.WebviewBridge.sendProcessingStatus(webview, 'executing', '프로젝트 타입 미확인 테스트 검증 완료');
                    return { success: true }; // 알 수 없는 프로젝트 타입은 성공으로 간주
                }
            }
            const testResults = [];
            // 1. Smoke Test: 프로젝트 타입별 필수 파일 존재 확인
            WebviewBridge_1.WebviewBridge.sendProcessingStatus(webview, 'executing', 'Smoke Test 실행 중 (필수 파일 확인)...');
            const criticalFiles = detector.getCriticalFiles(projectInfo.type, workspaceRoot);
            const missingFiles = [];
            for (const file of criticalFiles) {
                try {
                    const filePath = path.isAbsolute(file) ? file : path.join(workspaceRoot, file);
                    await fs.access(filePath);
                }
                catch {
                    // build.gradle와 build.gradle.kts는 둘 중 하나만 있으면 됨
                    if (projectInfo.type === types_1.ProjectType.SPRING_BOOT && projectInfo.buildTool.toString().includes('gradle') && (file === 'build.gradle' || file === 'build.gradle.kts')) {
                        const otherFile = file === 'build.gradle' ? 'build.gradle.kts' : 'build.gradle';
                        try {
                            await fs.access(path.join(workspaceRoot, otherFile));
                            continue; // 다른 파일이 있으면 통과
                        }
                        catch { }
                    }
                    // requirements.txt와 pyproject.toml도 둘 중 하나만 있으면 됨
                    if ((projectInfo.type === types_1.ProjectType.PYTHON || projectInfo.type === types_1.ProjectType.DJANGO || projectInfo.type === types_1.ProjectType.FLASK || projectInfo.type === types_1.ProjectType.FASTAPI) && (file === 'requirements.txt' || file === 'pyproject.toml')) {
                        const otherFile = file === 'requirements.txt' ? 'pyproject.toml' : 'requirements.txt';
                        try {
                            await fs.access(path.join(workspaceRoot, otherFile));
                            continue; // 다른 파일이 있으면 통과
                        }
                        catch { }
                    }
                    missingFiles.push(file);
                }
            }
            if (missingFiles.length > 0) {
                testResults.push(`Smoke Test 실패: 다음 파일이 누락되었습니다: ${missingFiles.join(', ')}`);
                WebviewBridge_1.WebviewBridge.sendProcessingStatus(webview, 'executing', 'Smoke Test 실패');
            }
            else {
                testResults.push(`Smoke Test 통과: 모든 필수 파일이 존재합니다.`);
                WebviewBridge_1.WebviewBridge.sendProcessingStatus(webview, 'executing', 'Smoke Test 통과');
            }
            // 2. Lint Check: 프로젝트 타입별 컴파일/빌드 검사
            let validationCmd = detector.getValidationCommand(projectInfo.type, workspaceRoot, createdFiles, modifiedFiles);
            // Fallback: getValidationCommand()가 null을 반환하면 LLM에게 질의
            if (!validationCmd) {
                validationCmd = await TestRunner.getValidationCommandFromLLM(webview, projectInfo, workspaceRoot, createdFiles, modifiedFiles);
            }
            if (validationCmd) {
                const lintResult = await TestRunner.runValidationCommand(webview, validationCmd, workspaceRoot);
                testResults.push(lintResult);
            }
            else {
                testResults.push(`컴파일 검사: 프로젝트 타입(${projectInfo.type})에 대한 검증 명령어를 결정할 수 없습니다. (규칙 기반 및 LLM fallback 모두 실패)`);
                WebviewBridge_1.WebviewBridge.sendProcessingStatus(webview, 'executing', '검증 명령어 없음 (건너뜀)');
            }
            // 실패한 테스트 확인
            const hasFailedTests = testResults.some(r => r.includes('실패') || r.includes('Failed'));
            if (hasFailedTests) {
                const failedTestMessages = testResults.filter(r => r.includes('실패') || r.includes('Failed'));
                const errorMessage = failedTestMessages.join('\n');
                WebviewBridge_1.WebviewBridge.sendProcessingStatus(webview, 'executing', '테스트 검증 실패');
                return { success: false, errorMessage };
            }
            // 모든 테스트 통과
            WebviewBridge_1.WebviewBridge.sendProcessingStatus(webview, 'executing', '테스트 검증 통과');
            return { success: true };
        }
        catch (error) {
            console.error('[TestRunner] Error running automated tests:', error);
            const errorMsg = `자동 테스트 실행 중 오류 발생: ${error instanceof Error ? error.message : String(error)}`;
            return { success: false, errorMessage: errorMsg };
        }
    }
    /**
     * LLM을 사용하여 검증 명령어 추론
     */
    static async getValidationCommandFromLLM(webview, projectInfo, workspaceRoot, createdFiles, modifiedFiles) {
        console.log('[TestRunner] getValidationCommand() returned null. Querying LLM for validation command...');
        WebviewBridge_1.WebviewBridge.sendProcessingStatus(webview, 'executing', '검증 명령어 LLM 추론 중...');
        const llmManager = LLMManager_1.LLMManager.getInstance();
        const currentModelType = llmManager.getCurrentModel();
        const geminiApi = llmManager.getGeminiApi();
        const ollamaApi = llmManager.getOllamaApi();
        const llmApi = currentModelType === services_1.AiModelType.GEMINI ? geminiApi : ollamaApi;
        if (!llmApi) {
            return null;
        }
        try {
            const prompt = (0, validationCommand_1.getValidationCommandPrompt)({
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
                }
                catch (parseError) {
                    console.error('[TestRunner] Failed to parse LLM response for validation command:', parseError);
                }
            }
        }
        catch (llmError) {
            console.error('[TestRunner] Error querying LLM for validation command:', llmError);
        }
        return null;
    }
    /**
     * 검증 명령어 실행
     */
    static async runValidationCommand(webview, validationCmd, workspaceRoot) {
        WebviewBridge_1.WebviewBridge.sendProcessingStatus(webview, 'executing', `${validationCmd.description} 실행 중...`);
        try {
            const executionManager = ExecutionManager_1.ExecutionManager.getInstance();
            const result = await executionManager.executeCommand(validationCmd.command, { cwd: workspaceRoot, timeout: AgentConfig_1.AgentConfig.VALIDATION_COMMAND_TIMEOUT });
            if (result.exitCode === 0) {
                const message = `${validationCmd.description} 통과: 문법 오류가 없습니다.`;
                WebviewBridge_1.WebviewBridge.sendProcessingStatus(webview, 'executing', `${validationCmd.description} 통과`);
                return message;
            }
            else {
                const errorOutput = result.stderr || result.stdout || '';
                const truncatedOutput = StringUtils_1.StringUtils.truncate(errorOutput, AgentConfig_1.AgentConfig.MAX_ERROR_MESSAGE_LENGTH);
                const message = `${validationCmd.description} 실패: 오류가 발견되었습니다.\n${truncatedOutput}`;
                WebviewBridge_1.WebviewBridge.sendProcessingStatus(webview, 'executing', `${validationCmd.description} 실패`);
                return message;
            }
        }
        catch (error) {
            const message = `${validationCmd.description} 실행 실패: ${error instanceof Error ? error.message : String(error)}`;
            WebviewBridge_1.WebviewBridge.sendProcessingStatus(webview, 'executing', `${validationCmd.description} 실행 실패`);
            return message;
        }
    }
    /**
     * 에러 패턴 추출 (중복 재시도 방지용)
     */
    static extractErrorPattern(errorMessage) {
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
exports.TestRunner = TestRunner;
//# sourceMappingURL=TestRunner.js.map