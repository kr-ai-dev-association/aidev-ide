/**
 * 추상화 통합 서비스
 * OS, LLM, 기술 스택 추상화를 통합하여 관리
 */

import { IOperatingSystemAdapter, OSDetectionResult } from './os/IOperatingSystemAdapter';
import { OSAdapterFactory } from './os/OSAdapterFactory';
import { ILLMAdapter, SystemPromptContext, UserPromptContext } from './llm/ILLMAdapter';
import { GptOssAdapter } from './llm/GptOssAdapter';
import { ITechStackAdapter } from './techStack/ITechStackAdapter';
import { TechStackAdapterFactory } from './techStack/TechStackAdapterFactory';

/**
 * 추상화 통합 서비스
 * 모든 추상화 레이어를 관리하고 조율
 */
export class AbstractionIntegrationService {
    private static instance: AbstractionIntegrationService | null = null;

    private osAdapter: IOperatingSystemAdapter;
    private llmAdapter: ILLMAdapter;
    private techStackAdapter: ITechStackAdapter | null = null;
    private projectPath: string | null = null;

    private constructor() {
        // OS 어댑터 초기화
        this.osAdapter = OSAdapterFactory.getInstance();
        
        // LLM 어댑터 초기화 (현재는 GPT-OSS 고정)
        this.llmAdapter = new GptOssAdapter();

        console.log('[AbstractionIntegrationService] Initialized');
        console.log(`  OS: ${this.osAdapter.osName} (${this.osAdapter.osType})`);
        console.log(`  Shell: ${this.osAdapter.getShellType()}`);
        console.log(`  LLM: ${this.llmAdapter.llmName}`);
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
        this.techStackAdapter = await TechStackAdapterFactory.detectAndCreate(projectPath);
        
        if (this.techStackAdapter) {
            console.log(`[AbstractionIntegrationService] Detected tech stack: ${this.techStackAdapter.stackName}`);
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
            projectType: this.techStackAdapter?.stackName,
            techStack: this.techStackAdapter ? [this.techStackAdapter.language] : undefined,
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
    getTechStackAdapter(): ITechStackAdapter | null {
        return this.techStackAdapter;
    }

    /**
     * 빌드 명령어 반환 (기술 스택에 맞게)
     */
    getBuildCommand(): string | null {
        return this.techStackAdapter?.getBuildCommand() || null;
    }

    /**
     * 개발 서버 실행 명령어 반환
     */
    getDevCommand(): string | null {
        return this.techStackAdapter?.getDevCommand() || null;
    }

    /**
     * 의존성 설치 명령어 반환
     */
    getInstallCommand(): string | null {
        return this.techStackAdapter?.getInstallCommand() || null;
    }

    /**
     * 테스트 실행 명령어 반환
     */
    getTestCommand(): string | null {
        return this.techStackAdapter?.getTestCommand() || null;
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
        if (!this.techStackAdapter) {
            return null;
        }
        return this.techStackAdapter.getFileTemplate(fileType, fileName);
    }

    /**
     * 에러 수정 제안 생성 (기술 스택에 맞게)
     */
    suggestErrorFix(error: { message: string; type: string }): any {
        if (!this.techStackAdapter) {
            return null;
        }
        return this.techStackAdapter.suggestErrorFix(error);
    }

    /**
     * 전체 컨텍스트 정보 반환 (디버깅/로깅용)
     */
    getFullContext(): {
        os: { type: string; name: string; shell: string };
        llm: { id: string; name: string; model: string };
        techStack: { id: string; name: string; language: string } | null;
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
            techStack: this.techStackAdapter ? {
                id: this.techStackAdapter.stackId,
                name: this.techStackAdapter.stackName,
                language: this.techStackAdapter.language,
            } : null,
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
        TechStackAdapterFactory.clearCache();
    }
}

/**
 * 전역 인스턴스 접근 헬퍼 함수
 */
export function getAbstractionService(): AbstractionIntegrationService {
    return AbstractionIntegrationService.getInstance();
}

