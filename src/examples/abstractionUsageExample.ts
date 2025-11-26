/**
 * 추상화 레이어 사용 예제
 * 기존 코드를 추상화를 사용하도록 마이그레이션하는 방법을 보여줍니다.
 */

import * as vscode from 'vscode';
import { getAbstractionService } from '../abstractions';
import {
    UserPromptContext,
    CodeGenerationContext,
    ErrorCorrectionContext,
    CommandExecutionContext,
} from '../abstractions';

/**
 * 예제 1: Extension 초기화 시 추상화 설정
 */
export async function initializeAbstractions(context: vscode.ExtensionContext) {
    console.log('[Example] Initializing abstraction layers...');

    // 추상화 서비스 가져오기
    const abstractionService = getAbstractionService();

    // 워크스페이스 경로 가져오기
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    if (workspacePath) {
        // 프로젝트 경로 설정 (기술 스택 자동 감지)
        await abstractionService.setProjectPath(workspacePath);
        console.log('[Example] Project path set:', workspacePath);
    }

    // 전체 컨텍스트 확인
    const fullContext = abstractionService.getFullContext();
    console.log('[Example] Full context:', JSON.stringify(fullContext, null, 2));

    // OS 정보 출력
    const osAdapter = abstractionService.getOSAdapter();
    console.log('[Example] OS:', osAdapter.osName);
    console.log('[Example] Shell:', osAdapter.getShellType());

    // 기술 스택 정보 출력
    const techAdapter = abstractionService.getTechStackAdapter();
    if (techAdapter) {
        console.log('[Example] Tech Stack:', techAdapter.stackName);
        console.log('[Example] Language:', techAdapter.language);
    } else {
        console.warn('[Example] Tech stack not detected');
    }
}

/**
 * 예제 2: 터미널 명령어 처리 (OS 추상화 사용)
 */
export function handleTerminalCommand(command: string): string {
    const abstractionService = getAbstractionService();
    const osAdapter = abstractionService.getOSAdapter();

    // 명령어를 OS에 맞게 정규화
    const normalizedCommand = osAdapter.normalizeCommand(command);

    console.log('[Example] Original command:', command);
    console.log('[Example] Normalized command:', normalizedCommand);

    return normalizedCommand;
}

/**
 * 예제 3: 프로젝트별 빌드 명령어 생성 (기술 스택 추상화 사용)
 */
export function generateBuildCommand(): string | null {
    const abstractionService = getAbstractionService();

    // 기술 스택에 맞는 빌드 명령어 자동 생성
    const buildCommand = abstractionService.generateCommand('build');

    if (buildCommand) {
        console.log('[Example] Build command:', buildCommand);
        // TypeScript: npm run build
        // Spring Boot (Maven): ./mvnw clean package (macOS/Linux)
        // Spring Boot (Maven): mvnw.cmd clean package (Windows)
    } else {
        console.warn('[Example] Could not generate build command');
    }

    return buildCommand;
}

/**
 * 예제 4: LLM 프롬프트 생성 (LLM 추상화 사용)
 */
export function generateSystemPrompt(): string {
    const abstractionService = getAbstractionService();

    // 시스템 프롬프트 생성 (OS + 기술 스택 정보 자동 포함)
    const systemPrompt = abstractionService.buildSystemPrompt({
        codebaseContext: 'This is a REST API project with authentication',
    });

    console.log('[Example] System prompt generated');
    console.log(systemPrompt.substring(0, 200) + '...');

    return systemPrompt;
}

/**
 * 예제 5: 사용자 쿼리 프롬프트 생성
 */
export function generateUserPrompt(
    query: string,
    files: Array<{ name: string; content: string }>
): string {
    const abstractionService = getAbstractionService();

    const context: UserPromptContext = {
        query,
        includedFiles: files,
        projectRoot: abstractionService.getProjectPath() || undefined,
    };

    const userPrompt = abstractionService.buildUserPrompt(context);

    console.log('[Example] User prompt generated for query:', query);

    return userPrompt;
}

/**
 * 예제 6: 코드 생성 프롬프트
 */
export function generateCodeGenerationPrompt(requirements: string): string {
    const abstractionService = getAbstractionService();
    const llmAdapter = abstractionService.getLLMAdapter();
    const techAdapter = abstractionService.getTechStackAdapter();

    const context: CodeGenerationContext = {
        intent: 'code_generation',
        projectType: techAdapter?.stackName || 'Unknown',
        techStack: techAdapter ? [techAdapter.language] : [],
        requirements,
    };

    const prompt = llmAdapter.buildCodeGenerationPrompt(context);

    console.log('[Example] Code generation prompt created');

    return prompt;
}

/**
 * 예제 7: 에러 수정 프롬프트
 */
export function generateErrorCorrectionPrompt(
    errorMessage: string,
    failedCommand?: string,
    terminalOutput?: string
): string {
    const abstractionService = getAbstractionService();
    const llmAdapter = abstractionService.getLLMAdapter();

    const context: ErrorCorrectionContext = {
        errorMessage,
        errorType: 'BUILD_ERROR',
        commandExecuted: failedCommand,
        terminalOutput,
    };

    const prompt = llmAdapter.buildErrorCorrectionPrompt(context);

    console.log('[Example] Error correction prompt created');

    return prompt;
}

/**
 * 예제 8: 명령어 실행 프롬프트
 */
export function generateCommandExecutionPrompt(intent: string): string {
    const abstractionService = getAbstractionService();
    const llmAdapter = abstractionService.getLLMAdapter();
    const osAdapter = abstractionService.getOSAdapter();
    const techAdapter = abstractionService.getTechStackAdapter();

    const context: CommandExecutionContext = {
        intent,
        osType: osAdapter.osType,
        shellType: osAdapter.getShellType(),
        projectType: techAdapter?.stackName || 'Unknown',
        currentDirectory: abstractionService.getProjectPath() || process.cwd(),
    };

    const prompt = llmAdapter.buildCommandExecutionPrompt(context);

    console.log('[Example] Command execution prompt created');

    return prompt;
}

/**
 * 예제 9: 파일 템플릿 생성 (기술 스택별)
 */
export function generateFileTemplate(fileType: string, fileName: string): string | null {
    const abstractionService = getAbstractionService();

    const template = abstractionService.generateFileTemplate(fileType, fileName);

    if (template) {
        console.log('[Example] File template generated for:', fileName);
        console.log(template.substring(0, 150) + '...');
    } else {
        console.warn('[Example] Could not generate template');
    }

    return template;
}

/**
 * 예제 10: 에러 자동 수정 제안
 */
export function suggestErrorFix(errorMessage: string, errorType: string) {
    const abstractionService = getAbstractionService();

    const suggestion = abstractionService.suggestErrorFix({
        message: errorMessage,
        type: errorType,
    });

    if (suggestion) {
        console.log('[Example] Error fix suggestion:');
        console.log('  Diagnosis:', suggestion.diagnosis);
        console.log('  Fix:', suggestion.suggestedFix);
        if (suggestion.commands) {
            console.log('  Commands:', suggestion.commands.join(', '));
        }
    } else {
        console.log('[Example] No automatic fix suggestion available');
    }

    return suggestion;
}

/**
 * 예제 11: OS별 특수 명령어 생성
 */
export function generateOSSpecificCommands() {
    const abstractionService = getAbstractionService();
    const osAdapter = abstractionService.getOSAdapter();

    console.log('[Example] OS-specific commands:');

    // npm 명령어
    const npmCommand = osAdapter.getNpmCommand();
    console.log('  npm:', npmCommand);

    // Java 명령어
    const javaCommand = osAdapter.getJavaCommand();
    console.log('  java:', javaCommand);

    // 환경 변수 설정
    const setEnvCommand = osAdapter.getSetEnvCommand('NODE_ENV', 'production');
    console.log('  set env:', setEnvCommand);

    // PATH 추가
    const addPathCommand = osAdapter.getAddPathCommand('/usr/local/bin');
    console.log('  add path:', addPathCommand);

    // 프로세스 종료
    const killCommand = osAdapter.getKillProcessCommand(1234);
    console.log('  kill process:', killCommand);

    // 포트로 프로세스 찾기
    const findPortCommand = osAdapter.getFindProcessByPortCommand(8080);
    console.log('  find by port:', findPortCommand);
}

/**
 * 예제 12: 기술 스택별 프로젝트 정보
 */
export async function displayProjectInfo() {
    const abstractionService = getAbstractionService();
    const techAdapter = abstractionService.getTechStackAdapter();

    if (!techAdapter) {
        console.log('[Example] No tech stack detected');
        return;
    }

    console.log('[Example] Project Information:');
    console.log('  Stack:', techAdapter.stackName);
    console.log('  Language:', techAdapter.language);
    console.log('  Required files:', techAdapter.getRequiredConfigFiles().join(', '));
    console.log('  Source dirs:', techAdapter.getSourceDirectories().join(', '));
    console.log('  Build output:', techAdapter.getBuildOutputDirectories().join(', '));

    console.log('\n[Example] Available Commands:');
    console.log('  Install:', techAdapter.getInstallCommand());
    console.log('  Build:', techAdapter.getBuildCommand());
    console.log('  Dev:', techAdapter.getDevCommand());
    console.log('  Test:', techAdapter.getTestCommand());

    const projectPath = abstractionService.getProjectPath();
    if (projectPath) {
        const metadata = await techAdapter.extractProjectMetadata(projectPath);
        console.log('\n[Example] Project Metadata:');
        console.log('  Name:', metadata.name);
        console.log('  Version:', metadata.version);
        console.log('  Dependencies:', Object.keys(metadata.dependencies).length);
    }
}

/**
 * 예제 13: 통합 사용 시나리오
 */
export async function completeWorkflowExample(userQuery: string) {
    console.log('\n=== Complete Workflow Example ===\n');

    const abstractionService = getAbstractionService();

    // 1. 시스템 프롬프트 생성
    const systemPrompt = abstractionService.buildSystemPrompt();
    console.log('1. System prompt generated');

    // 2. 사용자 프롬프트 생성
    const userPrompt = abstractionService.buildUserPrompt({
        query: userQuery,
        includedFiles: [],
    });
    console.log('2. User prompt generated');

    // 3. LLM 호출 (실제로는 여기서 API 호출)
    console.log('3. Would call LLM API here...');

    // 4. 응답 파싱
    const llmAdapter = abstractionService.getLLMAdapter();
    const mockResponse = '새 파일: src/example.ts\n```typescript\nexport function example() {}\n```';
    const parsed = llmAdapter.parseResponse(mockResponse);
    console.log('4. Response parsed:', {
        fileOperations: parsed.fileOperations?.length,
        codeBlocks: parsed.codeBlocks?.length,
        commands: parsed.commands?.length,
    });

    // 5. 명령어 실행 (OS에 맞게)
    if (parsed.commands && parsed.commands.length > 0) {
        const osAdapter = abstractionService.getOSAdapter();
        parsed.commands.forEach((cmd) => {
            const normalizedCmd = osAdapter.normalizeCommand(cmd);
            console.log('5. Would execute command:', normalizedCmd);
        });
    }

    // 6. 파일 작업 (경로 정규화)
    if (parsed.fileOperations && parsed.fileOperations.length > 0) {
        const osAdapter = abstractionService.getOSAdapter();
        parsed.fileOperations.forEach((op) => {
            const normalizedPath = osAdapter.normalizePath(op.path);
            console.log(`6. Would ${op.operation} file:`, normalizedPath);
        });
    }

    console.log('\n=== Workflow Complete ===\n');
}

/**
 * 모든 예제 실행
 */
export async function runAllExamples(context: vscode.ExtensionContext) {
    try {
        await initializeAbstractions(context);

        console.log('\n--- Terminal Command Example ---');
        handleTerminalCommand('npm install');

        console.log('\n--- Build Command Example ---');
        generateBuildCommand();

        console.log('\n--- LLM Prompt Examples ---');
        generateSystemPrompt();
        generateUserPrompt('Create a new component', []);

        console.log('\n--- OS-Specific Commands ---');
        generateOSSpecificCommands();

        console.log('\n--- Project Information ---');
        await displayProjectInfo();

        console.log('\n--- Complete Workflow ---');
        await completeWorkflowExample('Create a REST API endpoint for user registration');
    } catch (error) {
        console.error('[Example] Error:', error);
    }
}

