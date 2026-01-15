/**
 * Prompt Composer
 * OS별, LLM별 프롬프트 컴포넌트를 조합하여 최종 프롬프트 생성
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { AiModelType } from '../../../../services';
import { OSAdapterFactory } from '../../execution/os/OSAdapterFactory';
import { ProjectManager } from '../../project/ProjectManager';
import * as base from './base';
import * as os from './os';
import * as llm from './llm';
import { getCodeWorkPrompt, getExecutionWorkPrompt } from './task';
import { Tool } from '../../../tools/types';

export interface PromptComposerOptions {
    userOS: string;
    modelType: AiModelType;
    taskType?: 'code_work' | 'execution_work' | 'analysis' | 'documentation' | 'terminal';
    projectType?: string; // 프로젝트 타입 정보
    codebaseContext?: string; // 코드베이스 컨텍스트 (관련 파일 내용 등)
    allowedTools?: Tool[]; // 사용 가능한 도구 목록 (v5.2.0: 조사 단계 등에서 제한 가능)
}

export class PromptComposer {
    /**
     * .agent/rules 디렉토리의 개발 규칙 파일들을 읽어서 반환합니다.
     */
    private static loadAgentRules(): string {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                return '';
            }

            const workspaceRoot = workspaceFolders[0].uri.fsPath;
            const agentRulesDir = path.join(workspaceRoot, '.agent', 'rules');

            // 디렉토리 존재 여부 확인
            if (!fs.existsSync(agentRulesDir)) {
                return '';
            }

            const ruleFiles = [
                { name: 'stable-version.md', title: '버전 관리 규칙' },
                { name: 'coding-style.md', title: '코딩 스타일 규칙' },
                { name: 'project-architecture.md', title: '프로젝트 아키텍처 규칙' },
                { name: 'dependency-policy.md', title: '의존성 정책 규칙' },
                { name: 'db-policy.md', title: '데이터베이스 정책 규칙' }
            ];

            const rules: string[] = [];

            // 각 규칙 파일이 존재하는지 확인하고, 존재하는 파일만 읽어서 추가
            // 파일이 일부만 있어도 문제없이 동작 (예: coding-style.md만 있어도 OK)
            for (const ruleFile of ruleFiles) {
                const filePath = path.join(agentRulesDir, ruleFile.name);
                if (fs.existsSync(filePath)) {
                    try {
                        const content = fs.readFileSync(filePath, 'utf8').trim();
                        // 파일이 존재하고 내용이 있을 때만 추가
                        if (content) {
                            rules.push(`**${ruleFile.title} (강제 규칙):**
${content}`);
                        }
                    } catch (error) {
                        console.warn(`[PromptComposer] Failed to read ${ruleFile.name}:`, error);
                    }
                }
                // 파일이 존재하지 않으면 그냥 건너뜀 (에러 없음)
            }

            // 규칙이 하나도 없으면 빈 문자열 반환 (프롬프트에 포함하지 않음)
            if (rules.length === 0) {
                return '';
            }

            return `**⚠️ 개발 규칙 (반드시 준수해야 할 강제 규칙):**
아래 규칙들은 프로젝트의 개발 규칙으로, 모든 작업에서 반드시 준수해야 합니다. 이 규칙들을 위반하는 코드나 작업은 절대 생성하지 마세요.

${rules.join('\n\n---\n\n')}`;
        } catch (error) {
            console.warn('[PromptComposer] Failed to load agent rules:', error);
            return '';
        }
    }

    /**
     * 최종 시스템 프롬프트를 생성합니다.
     */
    public static composeSystemPrompt(options: PromptComposerOptions): string {
        const { userOS, modelType, taskType, projectType, codebaseContext, allowedTools } = options;

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

        // 터미널 명령 규칙 (execution_work일 때만 포함)
        const terminalCommandRules = taskType === 'execution_work' ? base.getTerminalCommandRules() : '';

        // 코드베이스 컨텍스트 (관련 파일 내용)
        const codebaseSection = codebaseContext ? `**코드베이스 컨텍스트:**
다음 파일들의 내용을 참고하여 작업을 수행하세요. 이 파일들은 사용자 요청과 관련된 중요한 정보를 포함하고 있습니다.

${codebaseContext}` : '';

        // 개발 규칙 로드 (.agent/rules 디렉토리의 md 파일들)
        const agentRules = this.loadAgentRules();

        // 조합 (개발 규칙을 basePrompt 바로 다음에 배치하여 강조)
        const parts = [
            osContextInfo,
            basePrompt,
            agentRules, // 개발 규칙을 강력하게 포함
            terminalCommandRules,
            taskPrompt,
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
            case AiModelType.BANYA:
                return llm.getBanyaPrompt();
            case AiModelType.OLLAMA:
                return llm.getGPTOSSPrompt(); // Ollama 기본 프롬프트로 GPT-OSS 스타일 사용
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
                return getCodeWorkPrompt();
            case 'execution_work':
                return getExecutionWorkPrompt();
            default:
                return '';
        }
    }
}

