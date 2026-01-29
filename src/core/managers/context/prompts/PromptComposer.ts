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
    frameworkRulesPrompt?: string; // v9.2.1: 동적 프레임워크 규칙 프롬프트
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
        const { userOS, modelType, taskType, projectType, codebaseContext, selectedFilesContent, terminalContextContent, diagnosticsContextContent, allowedTools, frameworkRulesPrompt } = options;

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

        // 사용자가 선택한 파일들의 내용 - 강한 지시 (ASK 모드와 동일)
        const selectedFilesSection = selectedFilesContent ? `
## ⚠️ 중요: 사용자가 첨부한 파일
**아래 파일들은 사용자가 @파일로 명시적으로 첨부한 파일입니다.**
**반드시 아래 파일 내용을 기반으로 작업을 수행하세요.**
**다른 파일을 먼저 읽거나 프로젝트 탐색을 하지 마세요 - 첨부된 파일이 최우선입니다.**

${selectedFilesContent}
` : '';

        // 사용자가 선택한 터미널 히스토리
        const terminalContextSection = terminalContextContent ? `
## ⚠️ 중요: 사용자가 첨부한 터미널 출력
**아래는 사용자가 @terminal로 명시적으로 첨부한 실제 터미널 화면 내용입니다.**
**반드시 아래 터미널 출력의 실제 데이터를 분석하여 답변하세요. 일반적인 설명이 아닌 실제 값을 기반으로 답변해야 합니다.**

\`\`\`
${terminalContextContent}
\`\`\`
` : '';

        // 사용자가 선택한 Diagnostics (에러/경고) - 강한 지시
        const diagnosticsContextSection = diagnosticsContextContent ? `
## ⚠️ 중요: 사용자가 첨부한 Diagnostics
**아래는 현재 워크스페이스에서 사용자가 명시적으로 분석을 요청한 에러/경고입니다.**
**반드시 아래 Diagnostics 내용을 기반으로 답변하세요.**

${diagnosticsContextContent}
` : '';

        // 첨부 컨텍스트 존재 여부
        const hasAttachedContext = selectedFilesContent || terminalContextContent || diagnosticsContextContent;

        // 첨부 컨텍스트가 있을 때 최상단에 강조
        const attachedContextWarning = hasAttachedContext ? `
# ⚠️ 최우선 지시사항
사용자가 아래에 파일/터미널/Diagnostics를 첨부했습니다.
**반드시 첨부된 내용을 최우선으로 분석하고 작업을 수행하세요.**
다른 파일을 먼저 읽거나 프로젝트 탐색을 하지 마세요.
` : '';

        // 개발 규칙 로드 (.agent/rules 디렉토리의 md 파일들)
        const agentRules = this.loadAgentRules();

        // v9.2.1: 프레임워크 규칙 섹션 (동적 감지된 스택 기반)
        const frameworkRulesSection = frameworkRulesPrompt || '';

        // 조합 (첨부 컨텍스트 경고를 최상단에 배치)
        const parts = [
            attachedContextWarning, // 첨부 컨텍스트 경고 (최상단)
            osContextInfo,
            basePrompt,
            agentRules, // 개발 규칙을 강력하게 포함
            frameworkRulesSection, // v9.2.1: 동적 프레임워크 규칙
            terminalCommandRules,
            taskPrompt,
            // 사용자가 첨부한 컨텍스트 (터미널, 파일, Diagnostics)를 코드베이스보다 앞에 배치
            terminalContextSection, // 사용자가 @terminal로 첨부한 터미널 출력 (우선순위 높음)
            selectedFilesSection, // 사용자가 @file로 선택한 파일들
            diagnosticsContextSection, // 사용자가 @diagnostics로 선택한 에러/경고
            codebaseSection, // 자동 수집된 코드베이스 컨텍스트
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

