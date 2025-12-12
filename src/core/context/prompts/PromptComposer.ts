/**
 * Prompt Composer
 * OS별, LLM별, 프레임워크별 프롬프트 컴포넌트를 조합하여 최종 프롬프트 생성
 */

import { AiModelType } from '../../../services';
import { OSAdapterFactory } from '../../execution/os/OSAdapterFactory';
import { ProjectManager } from '../../project/ProjectManager';
import { IFrameworkAdapter } from '../../project/framework/IFrameworkAdapter';
import * as base from './base';
import * as os from './os';
import * as llm from './llm';
import * as framework from './framework';
import * as task from './task';
import { FrameworkPromptBuilder } from './framework/FrameworkPromptBuilder';

export interface PromptComposerOptions {
    userOS: string;
    modelType: AiModelType;
    taskType?: 'code_work' | 'execution_work' | 'analysis' | 'documentation' | 'terminal';
    frameworkName?: string; // 'vite', 'spring-boot', 'node-typescript', 'express' 등 (옵션, 자동 감지 가능)
    projectType?: string; // 프로젝트 타입 정보
    frameworkAdapter?: IFrameworkAdapter | null; // FrameworkAdapter 직접 전달 (옵션)
}

export class PromptComposer {
    /**
     * 최종 시스템 프롬프트를 생성합니다.
     */
    public static composeSystemPrompt(options: PromptComposerOptions): string {
        const { userOS, modelType, taskType, frameworkName, projectType, frameworkAdapter } = options;

        // OS 정보 가져오기 (OSAdapter 사용)
        const osDetectionResult = OSAdapterFactory.detect();
        const osContextInfo = `**실행 환경:**
- OS: ${osDetectionResult.osName} (${osDetectionResult.osType})
- 셸: ${osDetectionResult.shellType}
- 아키텍처: ${osDetectionResult.architecture}
`;

        // 베이스 프롬프트 조합
        const basePrompt = [
            base.getAgentRole(),
            base.getObjective(),
            base.getBaseRules(),
            base.getFileOperationsRules(),
            base.getCodeVsScriptRules()
        ].join('\n\n');

        // OS별 프롬프트
        const osPrompt = this.getOSPrompt(userOS);

        // LLM별 프롬프트
        const llmPrompt = this.getLLMPrompt(modelType);

        // 작업 타입별 프롬프트
        const taskPrompt = taskType ? this.getTaskPrompt(taskType) : '';

        // 프레임워크별 프롬프트 (FrameworkAdapter 우선 사용)
        const frameworkPrompt = this.getFrameworkPromptFromAdapter(frameworkAdapter, frameworkName);

        // 터미널 명령 규칙 (execution_work일 때만 포함)
        const terminalCommandRules = taskType === 'execution_work' ? base.getTerminalCommandRules() : '';

        // 조합
        const parts = [
            osContextInfo,
            basePrompt,
            terminalCommandRules,
            taskPrompt,
            frameworkPrompt,
            llmPrompt,
            osPrompt
        ].filter(part => part && part.trim() !== '');

        return parts.join('\n\n');
    }

    /**
     * OS별 프롬프트 가져오기
     * public으로 노출하여 어댑터의 fallback 경로에서도 사용 가능
     */
    public static getOSPrompt(userOS: string): string {
        const osLower = userOS.toLowerCase();
        if (osLower.includes('windows')) {
            return os.getWindowsPrompt();
        } else if (osLower.includes('mac') || osLower.includes('darwin')) {
            return os.getMacOSPrompt();
        } else if (osLower.includes('linux')) {
            return os.getLinuxPrompt();
        } else {
            return os.getDefaultOSPrompt();
        }
    }

    /**
     * LLM별 프롬프트 가져오기
     */
    private static getLLMPrompt(modelType: AiModelType): string {
        switch (modelType) {
            case AiModelType.GEMINI:
                return llm.getGeminiPrompt();
            case AiModelType.OLLAMA_GPT_OSS:
                return llm.getGPTOSSPrompt();
            case AiModelType.OLLAMA_DeepSeek:
                return llm.getDeepSeekPrompt();
            case AiModelType.OLLAMA_Gemma:
                return llm.getGemmaPrompt();
            case AiModelType.OLLAMA_CodeLlama:
                return llm.getCodeLlamaPrompt();
            default:
                return llm.getDefaultLLMPrompt();
        }
    }

    /**
     * 작업 타입별 프롬프트 가져오기
     */
    private static getTaskPrompt(taskType: string): string {
        switch (taskType) {
            case 'code_work':
                return task.getCodeWorkPrompt();
            case 'execution_work':
                return task.getExecutionWorkPrompt();
            default:
                return '';
        }
    }

    /**
     * 프레임워크별 프롬프트 가져오기
     * FrameworkAdapter를 우선 사용하고, 없으면 frameworkName으로 감지
     */
    private static getFrameworkPromptFromAdapter(
        frameworkAdapter: IFrameworkAdapter | null | undefined,
        frameworkName?: string
    ): string {
        // FrameworkAdapter가 있으면 FrameworkPromptBuilder 사용 (추상화 레이어 활용)
        if (frameworkAdapter) {
            return FrameworkPromptBuilder.buildFromAdapter(frameworkAdapter);
        }

        // FrameworkAdapter가 없으면 frameworkName으로 감지 (기존 로직)
        if (frameworkName) {
            return this.getFrameworkPrompt(frameworkName);
        }

        // ProjectManager에서 자동 감지 시도
        try {
            const projectManager = ProjectManager.getInstance();
            const adapter = projectManager.getFrameworkAdapter();
            if (adapter) {
                return FrameworkPromptBuilder.buildFromAdapter(adapter);
            }
        } catch (error) {
            // ProjectManager가 초기화되지 않았을 수 있음
        }

        return '';
    }

    /**
     * 프레임워크별 프롬프트 가져오기 (frameworkName 문자열 기반)
     */
    private static getFrameworkPrompt(frameworkName: string): string {
        const frameworkLower = frameworkName.toLowerCase();

        // Vite 감지
        if (frameworkLower.includes('vite')) {
            return framework.getVitePrompt();
        }

        // Spring Boot 감지
        if (frameworkLower.includes('spring') || frameworkLower.includes('spring-boot')) {
            return framework.getSpringBootPrompt();
        }

        // Express 감지
        if (frameworkLower.includes('express')) {
            return framework.getExpressPrompt();
        }

        // Node.js TypeScript 감지
        if (frameworkLower.includes('typescript') || frameworkLower.includes('node')) {
            return framework.getNodeTypeScriptPrompt();
        }

        return '';
    }
}

