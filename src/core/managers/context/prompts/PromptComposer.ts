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
import { getOSPrompt as getOSPromptByName } from './osPrompts';
import { getLLMPrompt as getLLMPromptByKey } from './llmPrompts';
import { getCodeWorkPrompt, getExecutionWorkPrompt } from './task';
import { Tool } from '../../../tools/types';

export interface PromptComposerOptions {
    userOS: string;
    modelType: AiModelType;
    provider?: string; // API provider 키 (chat_completions, gemini, ollama). 설정 시 modelType보다 우선
    taskType?: 'code_work' | 'execution_work' | 'analysis' | 'documentation' | 'terminal';
    projectType?: string; // 프로젝트 타입 정보
    codebaseContext?: string; // 코드베이스 컨텍스트 (관련 파일 내용 등)
    selectedFilesContent?: string; // 사용자가 선택한 파일들의 내용
    terminalContextContent?: string; // 사용자가 선택한 터미널 히스토리
    diagnosticsContextContent?: string; // 사용자가 선택한 Diagnostics (에러/경고)
    allowedTools?: Tool[]; // 사용 가능한 도구 목록 (v5.2.0: 조사 단계 등에서 제한 가능)
    frameworkRulesPrompt?: string; // v9.2.1: 동적 프레임워크 규칙 프롬프트
    hotLoadPrompt?: string; // Hot Load 프롬프트 (최우선 규칙)
    mcpCustomPrompts?: string; // MCP 서버별 커스텀 프롬프트 (결합된 문자열)
    ragContext?: string; // 서버 RAG 문서 컨텍스트
}

export class PromptComposer {
    /** storageUri 기반 스킬 디렉토리 (extension.ts activate 시 설정) */
    private static _skillsDir: string | null = null;

    /**
     * VS Code storageUri 기반 스킬 디렉토리 경로 설정.
     * activate()에서 호출. 설정되면 .agent/rules 대신 이 경로를 사용.
     */
    public static setSkillsDir(dir: string): void {
        PromptComposer._skillsDir = dir;
    }

    /**
     * 스킬 파일 디렉토리 경로 반환.
     * setSkillsDir로 설정된 경우 그 경로를, 아니면 .agent/rules를 반환.
     */
    public static getSkillsDir(): string {
        if (PromptComposer._skillsDir) {
            return PromptComposer._skillsDir;
        }
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
        return path.join(workspaceRoot, '.agent', 'rules');
    }

    /**
     * 서버 설정 동기화가 완료될 때까지 대기합니다.
     * 익스텐션 시작 직후 sync가 진행 중일 수 있으므로,
     * 프롬프트 생성 전에 호출하여 최신 서버 스킬이 반영되도록 합니다.
     */
    public static async ensureServerSettingsSynced(): Promise<void> {
        try {
            const { SettingsManager } = require('../../state/SettingsManager');
            const settingsManager = SettingsManager.getInstance();
            await settingsManager.waitForSync();
        } catch {
            // SettingsManager가 초기화되지 않은 경우 무시
        }
    }

    /**
     * 스킬 파일 디렉토리의 개발 규칙 파일들을 읽어서 반환합니다.
     * 각 카테고리는 디렉토리로 구성되며, 디렉토리 내 모든 .md 파일을 읽습니다.
     * 기존 단일 파일 형식(stable-version.md)도 하위 호환성을 위해 지원합니다.
     */
    public static loadAgentRulesWithKeys(): { text: string; ruleKeys: Set<string> } {
        const ruleKeys = new Set<string>();
        try {
            const agentRulesDir = PromptComposer.getSkillsDir();
            if (!agentRulesDir) {
                return { text: '', ruleKeys };
            }

            // 디렉토리 존재 여부 확인
            if (!fs.existsSync(agentRulesDir)) {
                return { text: '', ruleKeys };
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
                                    // 파일명(확장자 제거)과 디렉토리명을 ruleKeys에 추가
                                    ruleKeys.add(file.replace(/\.(md|markdown)$/, ''));
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
                    ruleKeys.add(category.dir);
                    rules.push(`**${category.title} (강제 규칙):**\n${categoryRules.join('\n\n')}`);
                }
            }

            // 규칙이 하나도 없으면 빈 문자열 반환 (프롬프트에 포함하지 않음)
            if (rules.length === 0) {
                return { text: '', ruleKeys };
            }

            return {
                text: `# ⚠️ Skills (필수 적용 강제 규칙)
아래 Skills는 프로젝트에 등록된 개발 규칙으로, 코드 생성·파일 작성·아키텍처 설계 등 **모든 작업의 결과물에 반드시 반영**해야 합니다.
- 디자인 시스템 규칙이 있으면: 생성하는 **모든 UI 코드**에 해당 색상 토큰, 타이포그래피, 간격, 컴포넌트 명세를 적용하세요.
- 아키텍처 규칙이 있으면: 생성하는 **모든 코드의 구조**(계층, 디렉토리, 의존성 방향)가 해당 규칙을 따라야 합니다.
- 코딩 컨벤션이 있으면: 생성하는 **모든 코드**가 해당 네이밍·스타일·금지사항을 따라야 합니다.
**이 규칙들을 무시하거나 위반하는 코드를 절대 생성하지 마세요.**

${rules.join('\n\n---\n\n')}`,
                ruleKeys,
            };
        } catch (error) {
            console.warn('[PromptComposer] Failed to load agent rules:', error);
            return { text: '', ruleKeys };
        }
    }

    /**
     * 서버 관리자 Skills(dev_rules)를 로드합니다.
     * 로컬 규칙 키와 중복되는 서버 규칙은 제외합니다.
     * @param localRuleKeys 이미 로드된 로컬 규칙 키 Set (중복 제거용)
     */
    /**
     * 서버 관리자 Skills(dev_rules)를 로드합니다.
     * - required(필수): 로컬 중복이 있어도 서버 규칙 사용 (로컬 제외 키 반환)
     * - recommended(권장): 로컬 중복이 있으면 서버 규칙 제외 (로컬 우선)
     * @param localRuleKeys 이미 로드된 로컬 규칙 키 Set (중복 제거용)
     * @returns { text: string, overrideKeys: Set<string> } overrideKeys = 서버 필수가 덮어쓴 로컬 키
     */
    public static loadServerPromptTemplates(localRuleKeys: Set<string>): { text: string; overrideKeys: Set<string> } {
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { SettingsManager } = require('../../state/SettingsManager');
            const settingsManager = SettingsManager.getInstance();
            const rules = settingsManager.getServerDevRules();

            if (!rules || rules.length === 0) {
                return { text: '', overrideKeys: new Set() };
            }

            const overrideKeys = new Set<string>(); // 서버 필수가 덮어쓴 로컬 키

            const filteredRules = rules.filter((r: { key: string; enforcement: string; title?: string }) => {
                const rKey = r.key.toLowerCase().replace(/[-_\s]/g, '');
                const rTitle = (r.title || '').toLowerCase().replace(/[-_\s]/g, '');

                // 로컬 중복 확인
                let hasLocalDuplicate = false;
                let matchedLocalKey = '';
                for (const localKey of localRuleKeys) {
                    const lk = localKey.toLowerCase().replace(/[-_\s]/g, '');
                    if (lk === rKey || (rTitle && lk === rTitle)) {
                        hasLocalDuplicate = true;
                        matchedLocalKey = localKey;
                        break;
                    }
                }

                if (hasLocalDuplicate) {
                    if (r.enforcement === 'required') {
                        // 필수: 서버 규칙 사용, 로컬 제외 대상으로 기록
                        overrideKeys.add(matchedLocalKey);
                        return true;
                    } else {
                        // 권장: 로컬 우선, 서버 제외
                        return false;
                    }
                }
                return true;
            });

            if (filteredRules.length === 0) {
                return { text: '', overrideKeys };
            }

            const formattedRules = filteredRules.map((r: { key: string; content: string; enforcement: string; title?: string }) => {
                const label = r.enforcement === 'required' ? '[필수]' : '[권장]';
                const name = r.title || r.key;
                return `${label} **${name}**:\n${r.content}`;
            }).join('\n\n');

            const wrappedText = `## 관리자 등록 Skills
아래는 조직 관리자가 등록한 개발 규칙입니다. 위 로컬 Skills와 동일하게 **모든 작업의 결과물에 반드시 반영**하세요.

${formattedRules}`;

            return { text: wrappedText, overrideKeys };
        } catch (error) {
            return { text: '', overrideKeys: new Set() };
        }
    }

    /**
     * 최종 시스템 프롬프트를 생성합니다.
     */
    public static composeSystemPrompt(options: PromptComposerOptions): string {
        const { userOS, modelType, provider, taskType, projectType, codebaseContext, selectedFilesContent, terminalContextContent, diagnosticsContextContent, allowedTools, frameworkRulesPrompt, hotLoadPrompt, mcpCustomPrompts, ragContext } = options;

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

        // LLM별 프롬프트 (provider 우선, 없으면 modelType fallback)
        const llmPrompt = this.getLLMPrompt(provider || modelType);

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

        // Skills 통합 로드: 로컬(.agent/rules) + 서버(dev_rules)
        // 필수(required) 서버 규칙은 로컬보다 우선, 권장(recommended)은 로컬 우선
        const { text: agentRulesRaw, ruleKeys: localRuleKeys } = this.loadAgentRulesWithKeys();
        const { text: serverPromptTemplates, overrideKeys } = this.loadServerPromptTemplates(localRuleKeys);

        // 서버 필수 규칙이 덮어쓴 로컬 규칙 제거
        let agentRules = agentRulesRaw;
        if (overrideKeys.size > 0 && agentRulesRaw) {
            // 로컬 규칙 텍스트에서 덮어쓰인 카테고리 섹션 제거
            for (const key of overrideKeys) {
                // "**카테고리 제목 (강제 규칙):**" 블록을 제거
                const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const sectionRegex = new RegExp(`\\*\\*[^*]*${escapedKey}[^*]*\\(강제 규칙\\):\\*\\*[\\s\\S]*?(?=\\n---\\n|$)`, 'gi');
                agentRules = agentRules.replace(sectionRegex, '').trim();
            }
            // 남은 구분선 정리
            agentRules = agentRules.replace(/(\n---\n)+/g, '\n---\n').replace(/^\n---\n|\n---\n$/g, '').trim();
        }

        // v9.2.1: 프레임워크 규칙 섹션 (동적 감지된 스택 기반)
        const frameworkRulesSection = frameworkRulesPrompt || '';

        // RAG 문서 섹션
        const ragSection = ragContext ? `## 참고 문서 (RAG) — 우선 활용
아래는 사용자 질문과 관련하여 조직 내부 문서에서 검색된 내용입니다.
**중요**: 아래 RAG 문서의 내용을 최우선으로 활용하여 작업하세요. 문서에 포함된 정보를 우선 사용하고, 문서에 없는 내용은 일반 지식을 바탕으로 보충하세요.

${ragContext}` : '';

        // 조합 (Hot Load 프롬프트와 첨부 컨텍스트 경고를 최상단에 배치)
        const parts = [
            hotLoadPrompt, // Hot Load 프롬프트 (최우선 규칙)
            attachedContextWarning, // 첨부 컨텍스트 경고
            osContextInfo,
            basePrompt,
            mcpCustomPrompts, // MCP 서버별 커스텀 프롬프트 (도구 정의 직후)
            agentRules, // 개발 규칙 (서버 필수가 덮어쓴 것 제거)
            serverPromptTemplates, // 서버 관리자 프롬프트 템플릿
            frameworkRulesSection, // v9.2.1: 동적 프레임워크 규칙
            ragSection, // 서버 RAG 문서 컨텍스트
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
        return getOSPromptByName(userOS);
    }

    /**
     * LLM별 프롬프트 가져오기
     */
    private static getLLMPrompt(providerOrModelType: string): string {
        // provider(chat_completions, gemini, ollama) 또는 legacy AiModelType(gemini, banya, ollama, admin)
        // 모두 llmPrompts.ts의 getLLMPrompt()가 내부에서 처리
        return getLLMPromptByKey(providerOrModelType);
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

