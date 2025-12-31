/**
 * Prompt Composer
 * OS별, LLM별, 프레임워크별 프롬프트 컴포넌트를 조합하여 최종 프롬프트 생성
 */

import { AiModelType } from '../../../../services';
import { OSAdapterFactory } from '../../execution/os/OSAdapterFactory';
import { ProjectManager } from '../../project/ProjectManager';
import * as base from './base';
import * as os from './os';
import * as llm from './llm';
import * as framework from './framework';
import * as task from './task';
import { FrameworkPromptBuilder } from './framework/FrameworkPromptBuilder';
import { Tool } from '../../../tools/types';

export interface PromptComposerOptions {
    userOS: string;
    modelType: AiModelType;
    taskType?: 'code_work' | 'execution_work' | 'analysis' | 'documentation' | 'terminal';
    frameworkName?: string; // 'vite', 'spring-boot', 'node-typescript', 'express' 등 (옵션, 자동 감지 가능)
    projectType?: string; // 프로젝트 타입 정보
    codebaseContext?: string; // 코드베이스 컨텍스트 (관련 파일 내용 등)
    allowedTools?: Tool[]; // 사용 가능한 도구 목록 (v5.2.0: 조사 단계 등에서 제한 가능)
}

export class PromptComposer {
    /**
     * 최종 시스템 프롬프트를 생성합니다.
     */
    public static composeSystemPrompt(options: PromptComposerOptions): string {
        const { userOS, modelType, taskType, frameworkName, projectType, codebaseContext, allowedTools } = options;

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
            base.getCodeVsScriptRules(),
            base.getToolsPrompt(allowedTools)
        ].join('\n\n');

        // OS별 프롬프트
        const osPrompt = this.getOSPrompt(userOS);

        // LLM별 프롬프트
        const llmPrompt = this.getLLMPrompt(modelType);

        // 작업 타입별 프롬프트
        const taskPrompt = taskType ? this.getTaskPrompt(taskType) : '';

        // 프레임워크별 프롬프트 (이름 기반)
        const frameworkPrompt = frameworkName ? this.getFrameworkPrompt(frameworkName) : '';

        // 터미널 명령 규칙 (execution_work일 때만 포함)
        const terminalCommandRules = taskType === 'execution_work' ? base.getTerminalCommandRules() : '';

        // 코드베이스 컨텍스트 (관련 파일 내용)
        const codebaseSection = codebaseContext ? `**코드베이스 컨텍스트:**
다음 파일들의 내용을 참고하여 작업을 수행하세요. 이 파일들은 사용자 요청과 관련된 중요한 정보를 포함하고 있습니다.

${codebaseContext}` : '';

        // 조합
        const parts = [
            osContextInfo,
            basePrompt,
            terminalCommandRules,
            taskPrompt,
            frameworkPrompt,
            codebaseSection,
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
            case AiModelType.OLLAMA:
                return llm.getDefaultLLMPrompt();
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
     * 프레임워크별 프롬프트 가져오기 (frameworkName 문자열 기반)
     */
    private static getFrameworkPrompt(frameworkName: string): string {
        const frameworkLower = frameworkName.toLowerCase();

        // React + TypeScript + Vite 감지
        if (frameworkLower.includes('vite')) {
            // Vite는 대부분 React/TypeScript 조합으로 사용된다고 가정하고 ViteTypePrompt 사용
            return framework.getViteTypePrompt();
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
            console.log('[PromptComposer] Node.js TypeScript 프레임워크 감지, getNodeTypeScriptPrompt 호출');
            return framework.getNodeTypeScriptPrompt();
        }

        return '';
    }
}

