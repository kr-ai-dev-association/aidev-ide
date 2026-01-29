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
    selectedFilesContent?: string; // 사용자가 선택한 파일들의 내용
    terminalContextContent?: string; // 사용자가 선택한 터미널 히스토리
    diagnosticsContextContent?: string; // 사용자가 선택한 Diagnostics (에러/경고)
    allowedTools?: Tool[]; // 사용 가능한 도구 목록 (v5.2.0: 조사 단계 등에서 제한 가능)
}

export class PromptComposer {
    /**
     * .agent/rules 디렉토리의 개발 규칙 파일들을 읽어서 반환합니다.
     * 각 카테고리는 디렉토리로 구성되며, 디렉토리 내 모든 .md 파일을 읽습니다.
     * 기존 단일 파일 형식(stable-version.md)도 하위 호환성을 위해 지원합니다.
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

            const ruleCategories = [
                { dir: 'stable-version', legacyFile: 'stable-version.md', title: '버전 관리 규칙' },
                { dir: 'coding-style', legacyFile: 'coding-style.md', title: '코딩 스타일 규칙' },
                { dir: 'project-architecture', legacyFile: 'project-architecture.md', title: '프로젝트 아키텍처 규칙' },
                { dir: 'dependency-policy', legacyFile: 'dependency-policy.md', title: '의존성 정책 규칙' },
                { dir: 'db-policy', legacyFile: 'db-policy.md', title: '데이터베이스 정책 규칙' }
            ];

            const rules: string[] = [];

            for (const category of ruleCategories) {
                const categoryRules: string[] = [];

                // 1. 새 구조: 디렉토리 내 모든 .md 파일 읽기
                const categoryDir = path.join(agentRulesDir, category.dir);
                if (fs.existsSync(categoryDir) && fs.statSync(categoryDir).isDirectory()) {
                    try {
                        const files = fs.readdirSync(categoryDir)
                            .filter(f => f.endsWith('.md') || f.endsWith('.markdown'))
                            .sort(); // 알파벳 순서로 정렬

                        for (const file of files) {
                            const filePath = path.join(categoryDir, file);
                            try {
                                const content = fs.readFileSync(filePath, 'utf8').trim();
                                if (content) {
                                    categoryRules.push(`[${file}]\n${content}`);
                                }
                            } catch (error) {
                                console.warn(`[PromptComposer] Failed to read ${filePath}:`, error);
                            }
                        }
                    } catch (error) {
                        console.warn(`[PromptComposer] Failed to read directory ${categoryDir}:`, error);
                    }
                }

                // 2. 레거시 구조: 단일 파일 (하위 호환성)
                // 디렉토리가 없거나 비어있을 때만 레거시 파일 확인
                if (categoryRules.length === 0) {
                    const legacyFilePath = path.join(agentRulesDir, category.legacyFile);
                    if (fs.existsSync(legacyFilePath) && fs.statSync(legacyFilePath).isFile()) {
                        try {
                            const content = fs.readFileSync(legacyFilePath, 'utf8').trim();
                            if (content) {
                                categoryRules.push(content);
                            }
                        } catch (error) {
                            console.warn(`[PromptComposer] Failed to read ${category.legacyFile}:`, error);
                        }
                    }
                }

                // 카테고리에 규칙이 있으면 추가
                if (categoryRules.length > 0) {
                    rules.push(`**${category.title} (강제 규칙):**\n${categoryRules.join('\n\n')}`);
                }
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
        const { userOS, modelType, taskType, projectType, codebaseContext, selectedFilesContent, terminalContextContent, diagnosticsContextContent, allowedTools } = options;

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

        // 사용자가 선택한 파일들의 내용
        const selectedFilesSection = selectedFilesContent ? `**사용자가 선택한 파일들:**
다음 파일들은 사용자가 명시적으로 대화 컨텍스트에 포함하도록 요청한 파일들입니다. 이 파일들의 내용을 반드시 참고하여 작업을 수행하세요.

${selectedFilesContent}` : '';

        // 사용자가 선택한 터미널 히스토리
        const terminalContextSection = terminalContextContent ? `**터미널 컨텍스트:**
다음은 사용자가 명시적으로 대화 컨텍스트에 포함하도록 요청한 터미널 히스토리입니다. 최근 실행한 명령어와 그 결과를 참고하여 작업을 수행하세요.

${terminalContextContent}` : '';

        // 사용자가 선택한 Diagnostics (에러/경고)
        const diagnosticsContextSection = diagnosticsContextContent ? `**Diagnostics (에러/경고):**
다음은 현재 워크스페이스에서 감지된 에러와 경고입니다. 이 문제들을 해결하는 데 참고하세요.

${diagnosticsContextContent}` : '';

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
            selectedFilesSection, // 사용자가 선택한 파일들 (코드베이스 컨텍스트 다음에 배치)
            terminalContextSection, // 사용자가 선택한 터미널 히스토리
            diagnosticsContextSection, // 사용자가 선택한 Diagnostics (에러/경고)
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

