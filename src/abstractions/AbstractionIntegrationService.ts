/**
 * 추상화 통합 서비스
 * OS, LLM, 기술 스택 추상화를 통합하여 관리
 */

import { IOperatingSystemAdapter, OSDetectionResult } from './os/IOperatingSystemAdapter';
import { OSAdapterFactory } from './os/OSAdapterFactory';
import { ILLMAdapter, SystemPromptContext, UserPromptContext } from './llm/ILLMAdapter';
import { GptAdapter } from './llm/GptAdapter';
import { IFrameworkAdapter } from './framework/IFrameworkAdapter';
import { FrameworkAdapterFactory } from './framework/FrameworkAdapterFactory';
import { ICodeParserAdapter, CodeDefinitions, ParseOptions } from './codeParser/ICodeParserAdapter';
import { TreeSitterAdapter } from './codeParser/TreeSitterAdapter';

/**
 * 추상화 통합 서비스
 * 모든 추상화 레이어를 관리하고 조율
 */
export class AbstractionIntegrationService {
    private static instance: AbstractionIntegrationService | null = null;

    private osAdapter: IOperatingSystemAdapter;
    private llmAdapter: ILLMAdapter;
    private frameworkAdapter: IFrameworkAdapter | null = null;
    private codeParserAdapter: ICodeParserAdapter;
    private projectPath: string | null = null;

    private constructor() {
        // OS 어댑터 초기화
        this.osAdapter = OSAdapterFactory.getInstance();

        // LLM 어댑터 초기화 (현재는 GPT 고정, 프론트엔드에서 모델 선택)
        this.llmAdapter = new GptAdapter();

        // 코드 파서 초기화
        this.codeParserAdapter = new TreeSitterAdapter();

        console.log('[AbstractionIntegrationService] Initialized');
        console.log(`  OS: ${this.osAdapter.osName} (${this.osAdapter.osType})`);
        console.log(`  Shell: ${this.osAdapter.getShellType()}`);
        console.log(`  LLM: ${this.llmAdapter.llmName}`);
        console.log(`  Code Parser: ${this.codeParserAdapter.parserName}`);
    }

    /**
     * 싱글톤 인스턴스 반환
     */
    static getInstance(): AbstractionIntegrationService {
        if (!this.instance) {
            this.instance = new AbstractionIntegrationService();
        }
        return this.instance;
    }

    // ==================== 프로젝트 설정 ====================

    /**
     * 프로젝트 경로 설정 및 기술 스택 자동 감지
     */
    async setProjectPath(projectPath: string): Promise<void> {
        this.projectPath = projectPath;
        this.frameworkAdapter = await FrameworkAdapterFactory.detectAndCreate(projectPath);

        if (this.frameworkAdapter) {
            console.log(`[AbstractionIntegrationService] Detected tech stack: ${this.frameworkAdapter.frameworkName}`);
        } else {
            console.warn(`[AbstractionIntegrationService] Could not detect tech stack for: ${projectPath}`);
        }
    }

    /**
     * 현재 프로젝트 경로 반환
     */
    getProjectPath(): string | null {
        return this.projectPath;
    }

    // ==================== OS 관련 ====================

    /**
     * OS 어댑터 반환
     */
    getOSAdapter(): IOperatingSystemAdapter {
        return this.osAdapter;
    }

    /**
     * OS 감지 결과 반환
     */
    getOSDetectionResult(): OSDetectionResult {
        return OSAdapterFactory.detect();
    }

    /**
     * 명령어를 OS에 맞게 변환
     */
    normalizeCommand(command: string): string {
        return this.osAdapter.normalizeCommand(command);
    }

    /**
     * 경로를 OS에 맞게 변환
     */
    normalizePath(path: string): string {
        return this.osAdapter.normalizePath(path);
    }

    // ==================== LLM 관련 ====================

    /**
     * LLM 어댑터 반환
     */
    getLLMAdapter(): ILLMAdapter {
        return this.llmAdapter;
    }

    /**
     * LLM 어댑터 변경 (추후 다른 LLM 지원 시 사용)
     */
    setLLMAdapter(adapter: ILLMAdapter): void {
        this.llmAdapter = adapter;
        console.log(`[AbstractionIntegrationService] LLM adapter changed to: ${adapter.llmName}`);
    }

    /**
     * 시스템 프롬프트 생성 (OS + 기술 스택 정보 포함)
     */
    buildSystemPrompt(additionalContext?: Partial<SystemPromptContext>): string {
        const osResult = this.getOSDetectionResult();

        const context: SystemPromptContext = {
            osType: osResult.osType,
            osName: osResult.osName,
            shellType: osResult.shellType,
            projectType: this.frameworkAdapter?.frameworkName,
            framework: this.frameworkAdapter ? [this.frameworkAdapter.language] : undefined,
            ...additionalContext,
        };

        return this.llmAdapter.buildSystemPrompt(context);
    }

    /**
     * 사용자 프롬프트 생성
     */
    buildUserPrompt(context: UserPromptContext): string {
        return this.llmAdapter.buildUserPrompt(context);
    }

    // ==================== 기술 스택 관련 ====================

    /**
     * 기술 스택 어댑터 반환
     */
    getFrameworkAdapter(): IFrameworkAdapter | null {
        return this.frameworkAdapter;
    }

    /**
     * 빌드 명령어 반환 (기술 스택에 맞게)
     */
    getBuildCommand(): string | null {
        return this.frameworkAdapter?.getBuildCommand() || null;
    }

    /**
     * 개발 서버 실행 명령어 반환
     */
    getDevCommand(): string | null {
        return this.frameworkAdapter?.getDevCommand() || null;
    }

    /**
     * 의존성 설치 명령어 반환
     */
    getInstallCommand(): string | null {
        return this.frameworkAdapter?.getInstallCommand() || null;
    }

    /**
     * 테스트 실행 명령어 반환
     */
    getTestCommand(): string | null {
        return this.frameworkAdapter?.getTestCommand() || null;
    }

    // ==================== 코드 파서 관련 ====================

    /**
     * 코드 파서 어댑터 반환
     */
    getCodeParserAdapter(): ICodeParserAdapter {
        return this.codeParserAdapter;
    }

    /**
     * 프로젝트 코드 정의 추출 (LLM 컨텍스트용)
     */
    async parseProjectCode(options?: ParseOptions): Promise<CodeDefinitions | null> {
        if (!this.projectPath) {
            console.warn('[AbstractionIntegrationService] Project path not set');
            return null;
        }

        try {
            return await this.codeParserAdapter.parseDirectory(this.projectPath, options);
        } catch (error) {
            console.error('[AbstractionIntegrationService] Error parsing project code:', error);
            return null;
        }
    }

    /**
     * 프로젝트 구조 요약 (LLM 프롬프트용)
     */
    async getProjectCodeSummary(options?: ParseOptions): Promise<string> {
        if (!this.projectPath) {
            return '프로젝트 경로가 설정되지 않았습니다.';
        }

        try {
            return await this.codeParserAdapter.getProjectSummary(this.projectPath, options);
        } catch (error) {
            console.error('[AbstractionIntegrationService] Error getting project summary:', error);
            return '프로젝트 요약을 가져오는 중 오류가 발생했습니다.';
        }
    }

    /**
     * 특정 파일의 정의 추출
     */
    async parseFile(filePath: string): Promise<string> {
        try {
            return await this.codeParserAdapter.getFileSummary(filePath);
        } catch (error) {
            console.error('[AbstractionIntegrationService] Error parsing file:', error);
            return `파일 파싱 중 오류가 발생했습니다: ${filePath}`;
        }
    }

    /**
     * 특정 클래스 정의 찾기 (LLM이 코드를 참고할 때 유용)
     */
    async findClass(className: string): Promise<any> {
        if (!this.projectPath) {
            return null;
        }

        try {
            return await this.codeParserAdapter.getClassDefinition(className, this.projectPath);
        } catch (error) {
            console.error('[AbstractionIntegrationService] Error finding class:', error);
            return null;
        }
    }

    // ==================== 통합 기능 ====================

    /**
     * 명령어 생성 (OS + 기술 스택 고려)
     */
    generateCommand(intent: 'build' | 'dev' | 'test' | 'install'): string | null {
        let command: string | null = null;

        switch (intent) {
            case 'build':
                command = this.getBuildCommand();
                break;
            case 'dev':
                command = this.getDevCommand();
                break;
            case 'test':
                command = this.getTestCommand();
                break;
            case 'install':
                command = this.getInstallCommand();
                break;
        }

        if (command) {
            // OS에 맞게 명령어 변환
            command = this.normalizeCommand(command);
        }

        return command;
    }

    /**
     * 파일 템플릿 생성 (기술 스택에 맞게)
     */
    generateFileTemplate(fileType: string, fileName: string): string | null {
        if (!this.frameworkAdapter) {
            return null;
        }
        return this.frameworkAdapter.getFileTemplate(fileType, fileName);
    }

    /**
     * 에러 수정 제안 생성 (기술 스택에 맞게)
     */
    suggestErrorFix(error: { message: string; type: string }): any {
        if (!this.frameworkAdapter) {
            return null;
        }
        return this.frameworkAdapter.suggestErrorFix(error);
    }

    /**
     * 전체 컨텍스트 정보 반환 (디버깅/로깅용)
     */
    getFullContext(): {
        os: { type: string; name: string; shell: string };
        llm: { id: string; name: string; model: string };
        framework: { id: string; name: string; language: string } | null;
        codeParser: { id: string; name: string; supportedLanguages: string[] };
        project: { path: string | null };
    } {
        return {
            os: {
                type: this.osAdapter.osType,
                name: this.osAdapter.osName,
                shell: this.osAdapter.getShellType(),
            },
            llm: {
                id: this.llmAdapter.llmId,
                name: this.llmAdapter.llmName,
                model: this.llmAdapter.modelName,
            },
            framework: this.frameworkAdapter ? {
                id: this.frameworkAdapter.frameworkId,
                name: this.frameworkAdapter.frameworkName,
                language: this.frameworkAdapter.language,
            } : null,
            codeParser: {
                id: this.codeParserAdapter.parserId,
                name: this.codeParserAdapter.parserName,
                supportedLanguages: this.codeParserAdapter.getSupportedLanguages(),
            },
            project: {
                path: this.projectPath,
            },
        };
    }

    /**
     * 인스턴스 리셋 (테스트용)
     */
    static reset(): void {
        this.instance = null;
        OSAdapterFactory.reset();
        FrameworkAdapterFactory.clearCache();
    }
}

/**
 * 전역 인스턴스 접근 헬퍼 함수
 */
export function getAbstractionService(): AbstractionIntegrationService {
    return AbstractionIntegrationService.getInstance();
}

