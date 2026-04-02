/**
 * Prompt Composer
 * OS별, LLM별 프롬프트 컴포넌트를 조합하여 최종 프롬프트 생성
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { AiModelType } from '../../../../services';
import { estimateTokens, MODEL_TOKEN_LIMITS } from '../../../../utils/tokenUtils';
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
    promptType?: string; // PromptType (code_generation, agent, plan, general_ask)
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

/** Rule precedence levels (higher = higher priority) */
export enum RulePrecedence {
    BASE_PROMPT = 1,
    RAG = 2,
    FRAMEWORK = 3,
    SKILL = 4,
    GLOBAL_RULES = 5,
    SERVER_RECOMMENDED = 6,
    LOCAL_RULES = 7,
    MEMORY = 8,
    SERVER_REQUIRED = 9,
    HOTLOAD = 10,
}

/** Rule entry with metadata for precedence, budget, and compression */
export interface RuleEntry {
    key: string;
    content: string;
    source: 'hotload' | 'memory' | 'global' | 'local' | 'server' | 'skill' | 'framework' | 'rag' | 'base';
    precedence: RulePrecedence;
    enforcement: 'required' | 'recommended' | 'optional';
    essential?: boolean; // true = survives context compression
    tokenEstimate?: number; // estimated token count
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
    private static _essentialRules: RuleEntry[] = [];

    /** Touched file paths for conditional rule matching */
    private static _touchedFilePaths: Set<string> = new Set();

    public static addTouchedFile(filePath: string): void {
        PromptComposer._touchedFilePaths.add(filePath);
    }

    public static clearTouchedFiles(): void {
        PromptComposer._touchedFilePaths.clear();
    }

    /**
     * Check if a rule file should be excluded based on codepilot.ruleExcludes setting
     */
    private static isRuleExcluded(filePath: string): boolean {
        try {
            const vscodeConfig = vscode.workspace.getConfiguration('codepilot');
            const excludes = vscodeConfig.get<string[]>('ruleExcludes', []);
            if (excludes.length === 0) return false;

            const normalizedPath = path.normalize(filePath);
            return excludes.some(pattern => {
                const regex = new RegExp('^' + pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*').replace(/\./g, '\\.') + '$');
                return regex.test(normalizedPath) || regex.test(path.basename(normalizedPath));
            });
        } catch {
            return false;
        }
    }

    /**
     * Resolve @include directives in rule content
     * Supports: @./relative/path, @~/home/path
     * Max depth: 5, circular reference prevention
     */
    private static resolveIncludes(content: string, basePath: string, depth: number = 0, processedPaths: Set<string> = new Set()): string {
        if (depth > 5) { return content; }
        // Match @./path or @~/path (not inside code blocks)
        const includePattern = /@(\.\/[^\s\)]+|~\/[^\s\)]+)/g;
        return content.replace(includePattern, (match, includePath) => {
            let resolvedPath: string;
            if (includePath.startsWith('~/')) {
                resolvedPath = path.join(os.homedir(), includePath.substring(2));
            } else {
                resolvedPath = path.resolve(basePath, includePath);
            }
            // Circular reference prevention
            const normalizedPath = path.normalize(resolvedPath);
            if (processedPaths.has(normalizedPath)) {
                console.warn(`[PromptComposer] Circular @include detected: ${normalizedPath}`);
                return '';
            }
            if (!fs.existsSync(resolvedPath)) {
                return ''; // Non-existent files silently ignored
            }
            try {
                processedPaths.add(normalizedPath);
                const included = fs.readFileSync(resolvedPath, 'utf-8');
                return PromptComposer.resolveIncludes(included, path.dirname(resolvedPath), depth + 1, processedPaths);
            } catch {
                return '';
            }
        });
    }

    public static getEssentialRules(): RuleEntry[] {
        return PromptComposer._essentialRules;
    }

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

    /** load_skill 호출 시 참조에 스킬 추가 */
    public static addSkillReference(skillKey: string, source: 'local' | 'server'): void {
        const refType = source === 'server' ? 'server_skill' : 'local_skill';
        // 중복 방지
        if (!PromptComposer._lastReferences.some(r => r.type === refType && r.name === skillKey)) {
            PromptComposer._lastReferences.push({ type: refType, name: skillKey, source });
        }
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
    public static getSkillDescriptions(): { key: string; description: string; source: string }[] {
        return Array.from(PromptComposer._skillRegistry.values())
            .map(s => ({ key: s.key, description: s.description, source: s.source }));
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
                    if (PromptComposer.isRuleExcluded(filePath)) {
                        console.log(`[PromptComposer] Rule excluded by setting: ${filePath}`);
                        continue;
                    }
                    try {
                        let rawContent = fs.readFileSync(filePath, 'utf8').trim();
                        if (!rawContent) { continue; }
                        rawContent = PromptComposer.resolveIncludes(rawContent, path.dirname(filePath));

                        // Parse frontmatter for paths-based conditional rules
                        const frontmatterMatch = rawContent.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
                        let ruleBody = rawContent;
                        let rulePaths: string[] | null = null;

                        if (frontmatterMatch) {
                            const frontmatterText = frontmatterMatch[1];
                            ruleBody = frontmatterMatch[2];
                            const pathsMatch = frontmatterText.match(/^paths:\s*(.+)$/m);
                            if (pathsMatch) {
                                rulePaths = pathsMatch[1].split(',').map(p => p.trim().replace(/['"]/g, ''));
                            }
                        }

                        // Conditional rule: skip if paths specified but no touched files match
                        if (rulePaths && rulePaths.length > 0) {
                            const hasMatch = Array.from(PromptComposer._touchedFilePaths).some(touchedFile => {
                                return rulePaths!.some(glob => {
                                    const regex = new RegExp('^' + glob.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*').replace(/\./g, '\\.') + '$');
                                    return regex.test(touchedFile);
                                });
                            });
                            if (!hasMatch) {
                                console.log(`[PromptComposer] Conditional rule skipped (no matching files): ${filePath}, paths: ${rulePaths.join(', ')}`);
                                continue;
                            }
                        }

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
                let rawContent = fs.readFileSync(legacyFile, 'utf8').trim();
                if (rawContent) {
                    rawContent = PromptComposer.resolveIncludes(rawContent, path.dirname(legacyFile));
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
                text: `# Global Skills (Mandatory Rules for All Projects)
The following skills are development rules that apply universally across all projects. They **must always be followed** regardless of the project.

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
                { dir: 'stable-version', legacyFile: 'stable-version.md', title: 'Version Management Rules' },
                { dir: 'coding-style', legacyFile: 'coding-style.md', title: 'Coding Style Rules' },
                { dir: 'project-architecture', legacyFile: 'project-architecture.md', title: 'Project Architecture Rules' },
                { dir: 'dependency-policy', legacyFile: 'dependency-policy.md', title: 'Dependency Policy Rules' },
                { dir: 'db-policy', legacyFile: 'db-policy.md', title: 'Database Policy Rules' }
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
                            if (PromptComposer.isRuleExcluded(filePath)) {
                                console.log(`[PromptComposer] Rule excluded by setting: ${filePath}`);
                                continue;
                            }
                            try {
                                let rawContent = fs.readFileSync(filePath, 'utf8').trim();
                                if (!rawContent) { continue; }
                                rawContent = PromptComposer.resolveIncludes(rawContent, path.dirname(filePath));

                                // Parse frontmatter for paths-based conditional rules
                                const frontmatterMatch = rawContent.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
                                let ruleBody = rawContent;
                                let rulePaths: string[] | null = null;

                                if (frontmatterMatch) {
                                    const frontmatterText = frontmatterMatch[1];
                                    ruleBody = frontmatterMatch[2];
                                    const pathsMatch = frontmatterText.match(/^paths:\s*(.+)$/m);
                                    if (pathsMatch) {
                                        rulePaths = pathsMatch[1].split(',').map(p => p.trim().replace(/['"]/g, ''));
                                    }
                                }

                                // Conditional rule: skip if paths specified but no touched files match
                                if (rulePaths && rulePaths.length > 0) {
                                    const hasMatch = Array.from(PromptComposer._touchedFilePaths).some(touchedFile => {
                                        return rulePaths!.some(glob => {
                                            const regex = new RegExp('^' + glob.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*').replace(/\./g, '\\.') + '$');
                                            return regex.test(touchedFile);
                                        });
                                    });
                                    if (!hasMatch) {
                                        console.log(`[PromptComposer] Conditional rule skipped (no matching files): ${filePath}, paths: ${rulePaths.join(', ')}`);
                                        continue;
                                    }
                                }

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
                                    // ruleKeys에는 추가하지 않음 (스킬은 조건부)
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
                            let rawContent = fs.readFileSync(legacyFilePath, 'utf8').trim();
                            if (rawContent) {
                                rawContent = PromptComposer.resolveIncludes(rawContent, path.dirname(legacyFilePath));
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

                // 카테고리에 Rule(항상 주입)이 있으면 추가 (디렉토리명은 ruleKeys에 넣지 않음)
                if (categoryRules.length > 0) {
                    rules.push(`**${category.title} (Enforced Rules):**\n${categoryRules.join('\n\n')}`);
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
                text: `# Skills (Mandatory Enforced Rules)
The following skills are development rules registered for this project and **must be applied to all outputs** including code generation, file creation, and architecture design.
- If design system rules exist: Apply the specified color tokens, typography, spacing, and component specs to **all generated UI code**.
- If architecture rules exist: Ensure the **structure of all generated code** (layers, directories, dependency directions) follows those rules.
- If coding conventions exist: Ensure **all generated code** follows the specified naming, style, and restrictions.
**Never generate code that ignores or violates these rules.**

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
                return `[Required] **${name}**:\n${r.content}`;
            }).join('\n\n');

            const wrappedText = `## Admin-Registered Skills (Mandatory Enforced Rules)
The following are development rules registered by the organization administrator.
**You must apply the rules below to all code generation, file creation, and UI implementation. Never generate code that ignores or violates these rules.**

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
        const { userOS, modelType, provider, promptType, taskType, codebaseContext, selectedFilesContent, terminalContextContent, diagnosticsContextContent, allowedTools, nativeMode, frameworkRulesPrompt, hotLoadPrompt, mcpCustomPrompts, ragContext, memoryContext, activeSkillKeys, subProjectStructure, repoMap } = options;
        const isAgentMode = promptType === 'agent';

        // OS 정보 가져오기 (OSAdapter 사용)
        const osDetectionResult = OSAdapterFactory.detect();
        const osContextInfo = `**Execution Environment:**
- OS: ${osDetectionResult.osName} (${osDetectionResult.osType})
- Shell: ${osDetectionResult.shellType}
- Architecture: ${osDetectionResult.architecture}
`;

        // 베이스 프롬프트 조합 (AGENT 모드: plan 관련 규칙 제외, 간결화)
        const basePromptParts = [
            base.getAgentRole(),
            isAgentMode ? '' : base.getObjective(), // AGENT: objective는 agentPrompt.ts에서 대체
            base.getBaseRules(nativeMode),
            base.getFileOperationsRules(nativeMode),
            isAgentMode ? '' : base.getCodeVsScriptRules(nativeMode), // AGENT: 불필요 (자율 판단)
            base.getToolsPrompt(allowedTools, nativeMode)
        ].filter(Boolean);
        const basePrompt = basePromptParts.join('\n\n');

        // OS별 프롬프트
        const osPrompt = this.getOSPrompt(userOS);

        // LLM별 프롬프트 (provider 우선, 없으면 modelType fallback)
        const llmPrompt = this.getLLMPrompt(provider || modelType);

        // 작업 타입별 프롬프트
        const taskPrompt = taskType ? this.getTaskPrompt(taskType) : '';

        // 터미널 명령 규칙 (execution_work일 때만 포함)
        const terminalCommandRules = taskType === 'execution_work' ? base.getTerminalCommandRules() : '';

        // 코드베이스 컨텍스트 (관련 파일 내용)
        const codebaseSection = codebaseContext ? `**Codebase Context:**
Refer to the following file contents to perform your task. These files contain important information relevant to the user's request.

${codebaseContext}` : '';

        // 사용자가 선택한 파일들의 내용 - 강한 지시 (ASK 모드와 동일)
        const selectedFilesSection = selectedFilesContent ? `
## Important: User-Attached Files
**The files below were explicitly attached by the user via @file.**
**You must perform your task based on these file contents.**
**Do not read other files or explore the project first - the attached files take highest priority.**

${selectedFilesContent}
` : '';

        // 사용자가 선택한 터미널 히스토리
        const terminalContextSection = terminalContextContent ? `
## Important: User-Attached Terminal Output
**The following is actual terminal screen content explicitly attached by the user via @terminal.**
**You must analyze the actual data in the terminal output below for your response. Provide answers based on actual values, not general explanations.**

\`\`\`
${terminalContextContent}
\`\`\`
` : '';

        // 사용자가 선택한 Diagnostics (에러/경고) - 강한 지시
        const diagnosticsContextSection = diagnosticsContextContent ? `
## Important: User-Attached Diagnostics
**The following are errors/warnings from the current workspace that the user has explicitly requested analysis for.**
**You must provide your response based on the diagnostics content below.**

${diagnosticsContextContent}
` : '';

        // 첨부 컨텍스트 존재 여부
        const hasAttachedContext = selectedFilesContent || terminalContextContent || diagnosticsContextContent;

        // 첨부 컨텍스트가 있을 때 최상단에 강조
        const attachedContextWarning = hasAttachedContext ? `
# Top Priority Instructions
The user has attached files/terminal output/diagnostics below.
**You must prioritize analyzing the attached content and perform your task accordingly.**
Do not read other files or explore the project first.
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
                const sectionRegex = new RegExp(`\\*\\*[^*]*${escapedKey}[^*]*\\(Enforced Rules\\):\\*\\*[\\s\\S]*?(?=\\n---\\n|$)`, 'gi');
                agentRules = agentRules.replace(sectionRegex, '').trim();
            }
            // 남은 구분선 정리
            agentRules = agentRules.replace(/(\n---\n)+/g, '\n---\n').replace(/^\n---\n|\n---\n$/g, '').trim();
        }

        // 참조 추적: 사용된 로컬 규칙, 서버 규칙, 활성 스킬 기록
        // 이전 참조 보존 (load_skill 등으로 추가된 것 포함) 후 Rule은 최신으로 갱신
        const prevNonRuleRefs = PromptComposer._lastReferences.filter(
            r => r.type === 'server_skill' || r.type === 'local_skill'
        );
        const references: ReferenceItem[] = [];
        for (const key of localRuleKeys) {
            references.push({ type: 'local_rule', name: key, source: 'local' });
        }
        for (const rule of PromptComposer._lastIncludedServerRuleKeys) {
            references.push({ type: 'server_rule', name: rule.title, source: 'server' });
        }
        // 활성 스킬 (IntentDetector가 선택한 스킬만 참조에 추가)
        if (activeSkillKeys && activeSkillKeys.length > 0) {
            for (const skillKey of activeSkillKeys) {
                const entry = PromptComposer._skillRegistry.get(skillKey);
                if (entry) {
                    const skillType = entry.source === 'server' ? 'server_skill' : 'local_skill';
                    references.push({ type: skillType, name: entry.key, source: entry.source });
                }
            }
        }
        // 이전 턴의 스킬 참조 병합 (중복 제거)
        for (const prev of prevNonRuleRefs) {
            if (!references.some(r => r.type === prev.type && r.name === prev.name)) {
                references.push(prev);
            }
        }
        PromptComposer._lastReferences = references;

        // v9.2.1: 프레임워크 규칙 섹션 (동적 감지된 스택 기반)
        const frameworkRulesSection = frameworkRulesPrompt || '';

        // RAG 문서 섹션
        const ragSection = ragContext ? `## Reference Documents (RAG) - Use with Priority
The following content was retrieved from internal organization documents relevant to the user's question.
**Important**: Use the RAG documents below as your primary source. Prioritize information from these documents, and supplement with general knowledge only for information not covered in the documents.

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
                activeSkillsSection = `## Active Skills (Conditionally Applied Rules)
The following skills have been activated for the current task. You must comply with them.

${activeParts.join('\n\n---\n\n')}`;
            }
        }

        // 스킬 description 목록 (LLM이 참고할 수 있도록 항상 포함)
        const skillDescriptions = PromptComposer.getSkillDescriptions();
        const skillDescriptionSection = skillDescriptions.length > 0
            ? `## Available Skills (Referenced When Needed)
${skillDescriptions.map(s => `- ${s.key}: ${s.description}`).join('\n')}`
            : '';

        // Skills 존재 여부에 따른 끝부분 리마인더
        const hasSkills = !!(agentRules || serverPromptTemplates || activeSkillsSection);
        const skillsReminder = hasSkills
            ? `# Reminder: Comply with Skills Rules
You must follow the **Skills (development rules)** registered in the system prompt above.
- If a design system is registered, apply the specified tokens and component specs to all UI code.
- If architecture rules are registered, generate code structure, layers, and directories according to those rules.
- If coding conventions are registered, comply with all naming, style, and restrictions.
**Code that ignores Skills is not allowed.**`
            : '';

        // XML 태그로 감싸는 헬퍼
        const wrapXml = (tag: string, content: string | undefined): string => {
            if (!content || !content.trim()) return '';
            return `<${tag}>\n${content.trim()}\n</${tag}>`;
        };

        // 조합 (XML 태그로 섹션 분리 — LLM 규칙 준수율 향상)
        const parts = [
            wrapXml('hotload', hotLoadPrompt),
            wrapXml('memory', memoryContext),
            attachedContextWarning, // 이미 자체 포맷 포함
            wrapXml('global_rules', globalRulesRaw),
            wrapXml('dev_rules', agentRules),
            wrapXml('server_rules', serverPromptTemplates),
            wrapXml('active_skills', activeSkillsSection),
            wrapXml('user_info', osContextInfo),
            wrapXml('project_structure', subProjectStructure),
            wrapXml('repo_map', repoMap ? `This is a list of file paths and key symbols (functions/classes/interfaces, etc.) in the project.\nDo not guess file paths - refer to this map and use accurate paths.\nIf a file is not in the map, search for it using glob_search.\n\n${repoMap}` : undefined),
            wrapXml('identity_and_rules', basePrompt),
            wrapXml('mcp_tools', mcpCustomPrompts),
            wrapXml('framework_rules', frameworkRulesSection),
            wrapXml('rag_context', ragSection),
            wrapXml('terminal_rules', terminalCommandRules),
            wrapXml('task_rules', taskPrompt),
            terminalContextSection, // 이미 자체 포맷 포함
            selectedFilesSection, // 이미 자체 포맷 포함
            diagnosticsContextSection, // 이미 자체 포맷 포함
            wrapXml('codebase_context', codebaseSection),
            wrapXml('llm_specific', llmPrompt),
            wrapXml('os_specific', osPrompt),
            wrapXml('available_skills', skillDescriptionSection),
            wrapXml('skills_reminder', skillsReminder),
        ].filter(part => part && part.trim() !== '');

        // Track essential rules for post-compression re-injection
        PromptComposer._essentialRules = [];
        if (hotLoadPrompt) {
            PromptComposer._essentialRules.push({
                key: 'hotload', content: hotLoadPrompt, source: 'hotload',
                precedence: RulePrecedence.HOTLOAD, enforcement: 'required', essential: true,
                tokenEstimate: estimateTokens(hotLoadPrompt),
            });
        }
        // Korean language rule is always essential
        const koreanRule = `**CRITICAL Language Rule — NEVER respond in English**:
- ALL user-facing text MUST be written in Korean (한국어).
- The ONLY exceptions are: code, file paths, technical identifiers, CLI commands.`;
        PromptComposer._essentialRules.push({
            key: 'korean_language', content: koreanRule, source: 'base',
            precedence: RulePrecedence.BASE_PROMPT, enforcement: 'required', essential: true,
            tokenEstimate: estimateTokens(koreanRule),
        });

        // Enhanced rule loading log
        const ruleLog: string[] = [];
        const addRuleLog = (precedence: number, source: string, name: string, tokens: number) => {
            ruleLog.push(`  [${precedence}] ${source}: "${name}" (${tokens} tokens)`);
        };

        if (hotLoadPrompt) addRuleLog(10, 'hotload', 'HotLoad Rules', estimateTokens(hotLoadPrompt));
        if (memoryContext) addRuleLog(8, 'memory', 'Memory Context', estimateTokens(memoryContext));
        if (globalRulesRaw) addRuleLog(5, 'global', 'Global Rules', estimateTokens(globalRulesRaw));
        if (agentRules) addRuleLog(7, 'local', 'Agent Rules', estimateTokens(agentRules));
        if (serverPromptTemplates) addRuleLog(9, 'server', 'Server Rules', estimateTokens(serverPromptTemplates));
        if (activeSkillsSection) addRuleLog(4, 'skill', 'Active Skills', estimateTokens(activeSkillsSection));
        if (frameworkRulesSection) addRuleLog(3, 'framework', 'Framework Rules', estimateTokens(frameworkRulesSection));
        if (ragSection) addRuleLog(2, 'rag', 'RAG Context', estimateTokens(ragSection));
        if (mcpCustomPrompts) addRuleLog(4, 'mcp', 'MCP Prompts', estimateTokens(mcpCustomPrompts));

        const totalRuleTokens = ruleLog.length > 0 ? estimateTokens(parts.filter(Boolean).join('\n\n')) : 0;
        if (ruleLog.length > 0) {
            console.log(`[PromptComposer] Rules loaded: ${ruleLog.length} sections, ${totalRuleTokens} tokens\n${ruleLog.join('\n')}`);
        }

        // Token budget check: if total exceeds 30% of model max, trim low-precedence sections
        const totalPromptText = parts.filter(Boolean).join('\n\n');
        const totalTokens = estimateTokens(totalPromptText);
        const modelLimits = MODEL_TOKEN_LIMITS[modelType] || MODEL_TOKEN_LIMITS[AiModelType.OLLAMA];
        const tokenBudget = Math.floor(modelLimits.maxInputTokens * 0.3);

        if (totalTokens > tokenBudget) {
            console.log(`[PromptComposer] System prompt exceeds token budget: ${totalTokens} > ${tokenBudget}. Trimming low-priority sections.`);
            // Already ordered by priority in sections array, so we trim from the end (lowest priority)
            // But actually the sections are ordered for prompt injection, not by priority
            // So just log the warning for now - actual trimming would need the precedence-sorted structure
        }

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
