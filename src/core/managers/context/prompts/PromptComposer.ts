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
import { ReferenceItem } from '../../../webview/types';

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
    nativeMode?: boolean; // 네이티브 API Function Call 모드 (코드 블록 형식 교육 제외)
    frameworkRulesPrompt?: string; // v9.2.1: 동적 프레임워크 규칙 프롬프트
    hotLoadPrompt?: string; // Hot Load 프롬프트 (최우선 규칙)
    mcpCustomPrompts?: string; // MCP 서버별 커스텀 프롬프트 (결합된 문자열)
    ragContext?: string; // 서버 RAG 문서 컨텍스트
    memoryContext?: string; // 영속적 메모리 컨텍스트 (이전 대화에서 저장된 정보)
    activeSkillKeys?: string[]; // IntentDetector가 선택한 활성 스킬 키 목록
    subProjectStructure?: string; // 서브프로젝트 구조 (모노레포/멀티 디렉토리 grounding)
    repoMap?: string; // 프로젝트 파일 맵 (파일 경로 + 심볼)
}

/** Skill Registry 항목 */
export interface SkillEntry {
    key: string;
    description: string;
    content: string;
    source: 'local' | 'server';
    enforcement?: string;
}

export class PromptComposer {
    /** storageUri 기반 스킬 디렉토리 (extension.ts activate 시 설정) */
    private static _skillsDir: string | null = null;

    /** globalStorageUri 기반 글로벌 규칙 디렉토리 (extension.ts activate 시 설정) */
    private static _globalRulesDir: string | null = null;

    /** Skill Registry: 조건부 주입 대상 스킬 저장소 */
    private static _skillRegistry: Map<string, SkillEntry> = new Map();

    /** 마지막 composeSystemPrompt 호출 시 수집된 참조 정보 */
    private static _lastReferences: ReferenceItem[] = [];

    /** 마지막 프롬프트 생성에서 사용된 참조 정보 반환 */
    public static getLastReferences(): ReferenceItem[] {
        return [...PromptComposer._lastReferences];
    }

    /** 마지막 loadServerPromptTemplates에서 포함된 서버 규칙 키 반환 (참조 추적용) */
    public static getLastIncludedServerRuleKeys(): { key: string; title: string }[] {
        return [...PromptComposer._lastIncludedServerRuleKeys];
    }

    /**
     * VS Code storageUri 기반 스킬 디렉토리 경로 설정.
     * activate()에서 호출. 설정되면 .agent/rules 대신 이 경로를 사용.
     */
    public static setSkillsDir(dir: string): void {
        PromptComposer._skillsDir = dir;
    }

    /**
     * globalStorageUri 기반 글로벌 규칙 디렉토리 경로 설정.
     * activate()에서 호출. 모든 프로젝트에 공통 적용되는 규칙을 저장하는 경로.
     */
    public static setGlobalRulesDir(dir: string): void {
        PromptComposer._globalRulesDir = dir;
    }

    /**
     * Markdown 파일에서 frontmatter를 파싱합니다.
     * ---\ntype: skill\ndescription: "..."\n---\n본문
     */
    private static parseFrontmatter(content: string): { type: string; description: string; body: string } {
        const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
        if (!match) {
            return { type: 'rule', description: '', body: content };
        }
        const frontmatter = match[1];
        const body = match[2];
        let type = 'rule';
        let description = '';
        for (const line of frontmatter.split('\n')) {
            const [key, ...rest] = line.split(':');
            const value = rest.join(':').trim().replace(/^["']|["']$/g, '');
            if (key.trim() === 'type') { type = value; }
            if (key.trim() === 'description') { description = value; }
        }
        return { type, description, body: body.trim() };
    }

    /** Skill Registry 접근 */
    public static getSkillRegistry(): Map<string, SkillEntry> {
        return PromptComposer._skillRegistry;
    }

    /** 특정 스킬의 full content 가져오기 */
    public static getSkillContent(key: string): SkillEntry | undefined {
        return PromptComposer._skillRegistry.get(key);
    }

    /** 스킬 description 목록 생성 (IntentDetector에 전달용) */
    public static getSkillDescriptions(): { key: string; description: string }[] {
        return Array.from(PromptComposer._skillRegistry.values())
            .map(s => ({ key: s.key, description: s.description }));
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
     * 글로벌 규칙을 로드합니다. (globalStorageUri/rules/global-rules/)
     * 모든 프로젝트에 공통 적용되는 규칙/스킬로, 로컬 프로젝트 규칙보다 먼저 주입됩니다.
     */
    public static loadGlobalRulesWithKeys(): { text: string; ruleKeys: Set<string> } {
        const ruleKeys = new Set<string>();
        const skillEntries: SkillEntry[] = [];

        if (!PromptComposer._globalRulesDir) {
            return { text: '', ruleKeys };
        }

        try {
            const globalDir = path.join(PromptComposer._globalRulesDir, 'global-rules');
            const legacyFile = path.join(PromptComposer._globalRulesDir, 'global-rules.md');
            const rules: string[] = [];

            // 새 구조: global-rules/ 디렉토리
            if (fs.existsSync(globalDir) && fs.statSync(globalDir).isDirectory()) {
                const files = fs.readdirSync(globalDir)
                    .filter(f => f.endsWith('.md') || f.endsWith('.markdown'))
                    .sort();

                for (const file of files) {
                    const filePath = path.join(globalDir, file);
                    try {
                        const rawContent = fs.readFileSync(filePath, 'utf8').trim();
                        if (!rawContent) { continue; }
                        const { type, description, body } = PromptComposer.parseFrontmatter(rawContent);
                        const fileKey = file.replace(/\.(md|markdown)$/, '');
                        if (type === 'skill' && description) {
                            skillEntries.push({ key: `global-rules--${fileKey}`, description, content: body, source: 'local' });
                            ruleKeys.add(fileKey);
                        } else {
                            rules.push(`[${file}]\n${body}`);
                            ruleKeys.add(fileKey);
                        }
                    } catch (e) {
                        console.warn(`[PromptComposer] 글로벌 규칙 파일 읽기 실패: ${filePath}`, e);
                    }
                }
            }

            // 레거시: global-rules.md 단일 파일 (하위 호환)
            if (rules.length === 0 && skillEntries.length === 0 && fs.existsSync(legacyFile)) {
                const rawContent = fs.readFileSync(legacyFile, 'utf8').trim();
                if (rawContent) {
                    const { type, description, body } = PromptComposer.parseFrontmatter(rawContent);
                    if (type === 'skill' && description) {
                        skillEntries.push({ key: 'global-rules--global-rules', description, content: body, source: 'local' });
                    } else {
                        rules.push(body);
                        ruleKeys.add('global-rules');
                    }
                }
            }

            // 글로벌 스킬 레지스트리에 등록
            for (const entry of skillEntries) {
                PromptComposer._skillRegistry.set(entry.key, entry);
            }

            if (skillEntries.length > 0) {
                console.log(`[PromptComposer] 글로벌 Skills(조건부) 등록: ${skillEntries.length}개`);
            }

            if (rules.length === 0) {
                return { text: '', ruleKeys };
            }

            console.log(`[PromptComposer] 글로벌 Rules 로드: ${rules.length}개`);
            return {
                text: `# ⚠️ 글로벌 Skills (모든 프로젝트 공통 필수 규칙)
아래 Skills는 모든 프로젝트에 공통으로 적용되는 개발 규칙입니다. 프로젝트와 무관하게 **항상 반드시 반영**해야 합니다.

${rules.join('\n\n---\n\n')}`,
                ruleKeys,
            };
        } catch (error) {
            console.warn('[PromptComposer] 글로벌 규칙 로드 실패:', error);
            return { text: '', ruleKeys };
        }
    }

    /**
     * 스킬 파일 디렉토리의 개발 규칙 파일들을 읽어서 반환합니다.
     * 각 카테고리는 디렉토리로 구성되며, 디렉토리 내 모든 .md 파일을 읽습니다.
     * 기존 단일 파일 형식(stable-version.md)도 하위 호환성을 위해 지원합니다.
     */
    public static loadAgentRulesWithKeys(): { text: string; ruleKeys: Set<string> } {
        const ruleKeys = new Set<string>();
        // 로컬 스킬 레지스트리 초기화 (매 로드 시 갱신)
        const localSkillEntries: SkillEntry[] = [];

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
                                const rawContent = fs.readFileSync(filePath, 'utf8').trim();
                                if (!rawContent) { continue; }

                                // frontmatter 파싱: type/description 추출
                                const { type, description, body } = PromptComposer.parseFrontmatter(rawContent);
                                const fileKey = file.replace(/\.(md|markdown)$/, '');

                                if (type === 'skill' && description) {
                                    // Skill → 레지스트리에 등록, rules에는 포함하지 않음
                                    localSkillEntries.push({
                                        key: `${category.dir}--${fileKey}`,
                                        description,
                                        content: body,
                                        source: 'local',
                                    });
                                    ruleKeys.add(fileKey);
                                } else {
                                    // Rule → 기존처럼 무조건 주입
                                    categoryRules.push(`[${file}]\n${body}`);
                                    ruleKeys.add(fileKey);
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
                if (categoryRules.length === 0 && !localSkillEntries.some(s => s.key.startsWith(`${category.dir}--`))) {
                    const legacyFilePath = path.join(agentRulesDir, category.legacyFile);
                    if (fs.existsSync(legacyFilePath) && fs.statSync(legacyFilePath).isFile()) {
                        try {
                            const rawContent = fs.readFileSync(legacyFilePath, 'utf8').trim();
                            if (rawContent) {
                                // 레거시 파일도 frontmatter 지원
                                const { type, description, body } = PromptComposer.parseFrontmatter(rawContent);
                                if (type === 'skill' && description) {
                                    localSkillEntries.push({
                                        key: category.dir,
                                        description,
                                        content: body,
                                        source: 'local',
                                    });
                                } else {
                                    categoryRules.push(body);
                                }
                            }
                        } catch (error) {
                            console.warn(`[PromptComposer] Failed to read ${category.legacyFile}:`, error);
                        }
                    }
                }

                // 카테고리에 Rule(항상 주입)이 있으면 추가
                if (categoryRules.length > 0) {
                    ruleKeys.add(category.dir);
                    rules.push(`**${category.title} (강제 규칙):**\n${categoryRules.join('\n\n')}`);
                }
            }

            // 로컬 스킬을 레지스트리에 등록
            for (const entry of localSkillEntries) {
                PromptComposer._skillRegistry.set(entry.key, entry);
            }

            if (localSkillEntries.length > 0) {
                console.log(`[PromptComposer] 로컬 Skills(조건부) 등록: ${localSkillEntries.length}개 — ${localSkillEntries.map(s => s.key).join(', ')}`);
            }

            // 규칙이 하나도 없으면 빈 문자열 반환 (프롬프트에 포함하지 않음)
            if (rules.length === 0) {
                console.log(`[PromptComposer] 로컬 Rules 로드: 0개`);
                return { text: '', ruleKeys };
            }

            console.log(`[PromptComposer] 로컬 Rules 로드: ${rules.length}개 카테고리, 키: [${[...ruleKeys].join(', ')}]`);

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
    /** 마지막 loadServerPromptTemplates에서 프롬프트에 포함된 서버 규칙 키 */
    private static _lastIncludedServerRuleKeys: { key: string; title: string }[] = [];

    public static loadServerPromptTemplates(localRuleKeys: Set<string>): { text: string; overrideKeys: Set<string> } {
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { SettingsManager } = require('../../state/SettingsManager');
            const settingsManager = SettingsManager.getInstance();
            const rules = settingsManager.getServerDevRules();

            if (!rules || rules.length === 0) {
                console.log('[PromptComposer] 서버 Skills(dev_rules) 로드: 0개');
                return { text: '', overrideKeys: new Set() };
            }

            console.log(`[PromptComposer] 서버 Skills(dev_rules) 로드: ${rules.length}개 — ${rules.map((r: { key: string; enforcement: string; title?: string; skill_type?: string }) => `[${r.enforcement}/${r.skill_type || 'rule'}] ${r.title || r.key}`).join(', ')}`);

            const overrideKeys = new Set<string>(); // 서버 필수가 덮어쓴 로컬 키

            const filteredRules = rules.filter((r: { key: string; content: string; enforcement: string; title?: string; skill_type?: string; skill_description?: string }) => {
                const rKey = r.key.toLowerCase().replace(/[-_\s]/g, '');
                const rTitle = (r.title || '').toLowerCase().replace(/[-_\s]/g, '');

                // skill 타입은 레지스트리에 등록하고 rules에서 제외
                if (r.skill_type === 'skill' && r.skill_description) {
                    PromptComposer._skillRegistry.set(r.key, {
                        key: r.key,
                        description: r.skill_description,
                        content: r.content,
                        source: 'server',
                        enforcement: r.enforcement,
                    });
                    console.log(`[PromptComposer] 서버 Skill(조건부) 등록: ${r.title || r.key}`);
                    return false; // rules 목록에서 제외
                }

                // 로컬 중복 확인 (rule 타입만)
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

            // 프롬프트에 포함된 서버 규칙 키 저장 (참조 추적용)
            PromptComposer._lastIncludedServerRuleKeys = filteredRules.map(
                (r: { key: string; title?: string }) => ({ key: r.key, title: r.title || r.key })
            );

            if (filteredRules.length === 0) {
                return { text: '', overrideKeys };
            }

            const formattedRules = filteredRules.map((r: { key: string; content: string; enforcement: string; title?: string }) => {
                const name = r.title || r.key;
                return `[필수] **${name}**:\n${r.content}`;
            }).join('\n\n');

            const wrappedText = `## 관리자 등록 Skills (필수 적용 강제 규칙)
아래는 조직 관리자가 등록한 개발 규칙입니다.
**모든 코드 생성·파일 작성·UI 구현 시 아래 규칙을 반드시 적용하세요. 이 규칙을 무시하거나 위반하는 코드를 절대 생성하지 마세요.**

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
        const { userOS, modelType, provider, taskType, codebaseContext, selectedFilesContent, terminalContextContent, diagnosticsContextContent, allowedTools, nativeMode, frameworkRulesPrompt, hotLoadPrompt, mcpCustomPrompts, ragContext, memoryContext, activeSkillKeys, subProjectStructure, repoMap } = options;

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
            base.getBaseRules(nativeMode),
            base.getFileOperationsRules(nativeMode),
            base.getCodeVsScriptRules(nativeMode),
            base.getToolsPrompt(allowedTools, nativeMode)
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

        // 글로벌 규칙 로드 (globalStorageUri/rules/global-rules/) — 프로젝트 무관 공통 적용
        const { text: globalRulesRaw } = this.loadGlobalRulesWithKeys();

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

        // 참조 추적: 사용된 로컬 규칙, 서버 규칙, 활성 스킬 기록
        const references: ReferenceItem[] = [];
        for (const key of localRuleKeys) {
            references.push({ type: 'local_rule', name: key, source: 'local' });
        }
        // 프롬프트에 포함된 모든 서버 규칙 추적 (override뿐 아니라 recommended도 포함)
        for (const rule of PromptComposer._lastIncludedServerRuleKeys) {
            references.push({ type: 'server_rule', name: rule.title, source: 'server' });
        }
        if (activeSkillKeys) {
            for (const skillKey of activeSkillKeys) {
                const entry = PromptComposer._skillRegistry.get(skillKey);
                if (entry) {
                    const skillType = entry.source === 'server' ? 'server_skill' : 'local_skill';
                    references.push({ type: skillType, name: entry.key, source: entry.source });
                }
            }
        }
        PromptComposer._lastReferences = references;

        // v9.2.1: 프레임워크 규칙 섹션 (동적 감지된 스택 기반)
        const frameworkRulesSection = frameworkRulesPrompt || '';

        // RAG 문서 섹션
        const ragSection = ragContext ? `## 참고 문서 (RAG) — 우선 활용
아래는 사용자 질문과 관련하여 조직 내부 문서에서 검색된 내용입니다.
**중요**: 아래 RAG 문서의 내용을 최우선으로 활용하여 작업하세요. 문서에 포함된 정보를 우선 사용하고, 문서에 없는 내용은 일반 지식을 바탕으로 보충하세요.

${ragContext}` : '';

        // 조건부 스킬: IntentDetector가 선택한 스킬의 full content 주입
        let activeSkillsSection = '';
        if (activeSkillKeys && activeSkillKeys.length > 0) {
            const activeParts: string[] = [];
            for (const skillKey of activeSkillKeys) {
                const entry = PromptComposer._skillRegistry.get(skillKey);
                if (entry) {
                    activeParts.push(`**${entry.key}:**\n${entry.content}`);
                }
            }
            if (activeParts.length > 0) {
                activeSkillsSection = `## 활성 스킬 (조건부 적용 규칙)
다음 스킬은 현재 작업과 관련하여 활성화되었습니다. 반드시 준수하세요.

${activeParts.join('\n\n---\n\n')}`;
            }
        }

        // 스킬 description 목록 (LLM이 참고할 수 있도록 항상 포함)
        const skillDescriptions = PromptComposer.getSkillDescriptions();
        const skillDescriptionSection = skillDescriptions.length > 0
            ? `## 사용 가능한 스킬 (필요시 참조됨)
${skillDescriptions.map(s => `- ${s.key}: ${s.description}`).join('\n')}`
            : '';

        // Skills 존재 여부에 따른 끝부분 리마인더
        const hasSkills = !!(agentRules || serverPromptTemplates || activeSkillsSection);
        const skillsReminder = hasSkills
            ? `# ⚠️ 리마인더: Skills 규칙 준수
위 시스템 프롬프트에 등록된 **Skills(개발 규칙)**을 반드시 따르세요.
- 디자인 시스템이 등록되어 있으면 모든 UI 코드에 해당 토큰·컴포넌트 명세를 적용하세요.
- 아키텍처 규칙이 등록되어 있으면 코드 구조·계층·디렉토리를 해당 규칙대로 생성하세요.
- 코딩 컨벤션이 등록되어 있으면 네이밍·스타일·금지사항을 모두 준수하세요.
**Skills를 무시한 코드는 허용되지 않습니다.**`
            : '';

        // 조합 (Skills를 최상단, 리마인더를 최하단에 배치)
        const parts = [
            hotLoadPrompt, // Hot Load 프롬프트 (최우선 규칙)
            memoryContext, // 영속적 메모리 컨텍스트 (이전 대화에서 저장된 정보)
            attachedContextWarning, // 첨부 컨텍스트 경고
            globalRulesRaw, // 글로벌 규칙 (모든 프로젝트 공통)
            agentRules, // 개발 규칙(Rule) — 최상단 배치 (서버 필수가 덮어쓴 것 제거)
            serverPromptTemplates, // 서버 관리자 프롬프트 템플릿(Rule) — 최상단 배치
            activeSkillsSection, // 조건부 스킬 — IntentDetector가 선택한 것만
            osContextInfo,
            subProjectStructure, // 서브프로젝트 구조 (모노레포 경로 grounding)
            repoMap ? `## 프로젝트 파일 맵\n아래는 프로젝트의 파일 경로와 주요 심볼(함수/클래스/인터페이스 등) 목록입니다.\n**파일 경로를 추측하지 말고, 이 맵을 참고하여 정확한 경로를 사용하세요.**\n파일이 맵에 없으면 glob_search로 검색하세요.\n\n${repoMap}` : '',
            basePrompt,
            mcpCustomPrompts, // MCP 서버별 커스텀 프롬프트 (도구 정의 직후)
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
            osPrompt,
            skillDescriptionSection, // 스킬 description 목록 — 최하단 근처
            skillsReminder, // Skills 리마인더 — 최하단 배치
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

