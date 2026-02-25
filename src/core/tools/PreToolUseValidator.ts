/**
 * PreToolUseValidator
 * 도구 실행 전 위험 명령 차단 및 경로 검증
 *
 * 검증 항목:
 * - 위험한 터미널 명령어 차단 (rm -rf /, sudo 등)
 * - 프로젝트 외부 경로 접근 차단
 * - 민감한 파일 수정 방지 (.git, .env 등)
 */

import * as path from 'path';
import * as fs from 'fs';
import { ToolUse, Tool } from './types';

export interface ValidationResult {
    allowed: boolean;
    reason?: string;
    severity?: 'warning' | 'error';
}

/**
 * 기본 규칙 항목 (UI 표시용)
 */
export interface DefaultRule {
    id: string;
    pattern: string;
    description: string;
}

/**
 * 기본 차단 명령어 목록 (서버에서 관리 — 하드코딩 제거됨)
 */
export const DEFAULT_BLOCKED_COMMANDS: DefaultRule[] = [];

/**
 * 기본 보호 파일 목록 (서버에서 관리 — 하드코딩 제거됨)
 */
export const DEFAULT_PROTECTED_FILES: DefaultRule[] = [];

// 커스텀 규칙 캐시
let customBlockedCommands: string[] = [];
let customProtectedFiles: string[] = [];
let customHiddenFiles: string[] = [];
let disabledBlockedCommands: string[] = [];
let disabledProtectedFiles: string[] = [];

// 서버 보안 규칙 캐시
let _serverBlockedCommands: { pattern: string; description: string }[] = [];
let _serverRecommendedCommands: { pattern: string; description: string }[] = [];
let _serverProtectedFiles: { pattern: string; description: string; enforcement: string }[] = [];
let _serverHiddenFiles: { pattern: string; description: string; enforcement: string }[] = [];
let _serverSecurityRulesLoaded = false;

/**
 * 커스텀 차단 명령어 캐시 업데이트
 */
export function updateCustomBlockedCommands(patterns: string[]): void {
    customBlockedCommands = patterns;
}

/**
 * 커스텀 보호 파일 캐시 업데이트
 */
export function updateCustomProtectedFiles(patterns: string[]): void {
    customProtectedFiles = patterns;
}

/**
 * 커스텀 은닉 파일 캐시 업데이트
 */
export function updateCustomHiddenFiles(patterns: string[]): void {
    customHiddenFiles = patterns;
}

/**
 * 비활성화된 차단 명령어 캐시 업데이트
 */
export function updateDisabledBlockedCommands(ids: string[]): void {
    disabledBlockedCommands = ids;
}

/**
 * 비활성화된 보호 파일 캐시 업데이트
 */
export function updateDisabledProtectedFiles(ids: string[]): void {
    disabledProtectedFiles = ids;
}

/**
 * 서버 보안 규칙 로드
 * SettingsManager에서 서버 보안 규칙을 가져와 캐시에 저장합니다.
 * required 규칙은 항상 강제 적용되고, recommended 규칙은 사용자가 비활성화 가능합니다.
 */
export function loadServerSecurityRules(): void {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { SettingsManager } = require('../managers/state/SettingsManager');
        const settingsManager = SettingsManager.getInstance();
        const rules = settingsManager.getServerSecurityRules();

        if (!rules || rules.length === 0) {
            _serverBlockedCommands = [];
            _serverRecommendedCommands = [];
            _serverProtectedFiles = [];
            _serverHiddenFiles = [];
            _serverSecurityRulesLoaded = true;
            return;
        }

        // type별 분리: blocked_command / protected_file / hidden_file
        const commandRules = rules.filter((r: { type: string }) => r.type === 'blocked_command' || (!r.type));
        const protectedRules = rules.filter((r: { type: string }) => r.type === 'protected_file');
        const hiddenRules = rules.filter((r: { type: string }) => r.type === 'hidden_file');

        // 차단 명령어: required (항상 강제) / recommended (비활성화 가능)
        _serverBlockedCommands = commandRules
            .filter((r: { enforcement: string }) => r.enforcement === 'required')
            .map((r: { pattern: string; description: string }) => ({
                pattern: r.pattern,
                description: r.description
            }));

        _serverRecommendedCommands = commandRules
            .filter((r: { enforcement: string }) => r.enforcement !== 'required')
            .map((r: { pattern: string; description: string }) => ({
                pattern: r.pattern,
                description: r.description
            }));

        // 보호 파일 (수정/삭제 차단)
        _serverProtectedFiles = protectedRules
            .map((r: { pattern: string; description: string; enforcement: string }) => ({
                pattern: r.pattern,
                description: r.description,
                enforcement: r.enforcement
            }));

        // 은닉 파일 (읽기/수정/삭제 모두 차단)
        _serverHiddenFiles = hiddenRules
            .map((r: { pattern: string; description: string; enforcement: string }) => ({
                pattern: r.pattern,
                description: r.description,
                enforcement: r.enforcement
            }));

        _serverSecurityRulesLoaded = true;
        console.log(`[PreToolUseValidator] Server security rules loaded: ${_serverBlockedCommands.length} blocked(required), ${_serverRecommendedCommands.length} blocked(recommended), ${_serverProtectedFiles.length} protected, ${_serverHiddenFiles.length} hidden`);
    } catch (error) {
        // SettingsManager 로드 실패 - 서버 규칙 없이 진행
        _serverBlockedCommands = [];
        _serverRecommendedCommands = [];
        _serverProtectedFiles = [];
        _serverHiddenFiles = [];
        _serverSecurityRulesLoaded = true;
    }
}

export class PreToolUseValidator {
    // v9.4.0: 셸 메타문자 패턴 (명령어 우회 방지)
    private static readonly SHELL_METACHAR_PATTERNS: RegExp[] = [
        /\$\([^)]+\)/,           // $() 서브셸
        /`[^`]+`/,               // ` ` 백틱 서브셸
        /\$\{[^}]+\}/,           // ${} 변수 확장
        /\$[A-Za-z_][A-Za-z0-9_]*/,  // $VAR 변수 참조
    ];

    // v9.4.0: 위험한 경로 패턴 (rm과 조합 시 차단)
    private static readonly DANGEROUS_PATH_PATTERNS: RegExp[] = [
        /^\s*\/\s*$/,            // 루트 디렉토리
        /^\s*~\s*$/,             // 홈 디렉토리
        /^\s*\/etc/i,            // 시스템 설정
        /^\s*\/usr/i,            // 시스템 바이너리
        /^\s*\/var/i,            // 시스템 데이터
        /^\s*\/boot/i,           // 부트 파티션
        /^\s*\/dev/i,            // 디바이스
        /^\s*\/sys/i,            // 시스템 정보
        /^\s*\/proc/i,           // 프로세스 정보
    ];

    // 위험한 명령어 패턴 (절대 실행 금지) - 기본값 기반으로 동적 생성 (중복 제거)
    private static get DANGEROUS_COMMANDS(): RegExp[] {
        const patterns: RegExp[] = [];
        const addedPatterns = new Set<string>(); // 패턴 문자열 기반 중복 방지

        const addPattern = (patternStr: string) => {
            if (addedPatterns.has(patternStr)) return;
            addedPatterns.add(patternStr);
            try {
                patterns.push(new RegExp(patternStr, 'i'));
            } catch (e) {
                const escaped = patternStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                if (!addedPatterns.has(escaped)) {
                    addedPatterns.add(escaped);
                    patterns.push(new RegExp(escaped, 'i'));
                }
            }
        };

        // 기본 규칙 중 비활성화되지 않은 것들
        for (const rule of DEFAULT_BLOCKED_COMMANDS) {
            if (!disabledBlockedCommands.includes(rule.id)) {
                addPattern(rule.pattern);
            }
        }

        // 커스텀 규칙 추가
        for (const pattern of customBlockedCommands) {
            addPattern(pattern);
        }

        // 서버 보안 규칙 로드 (최초 1회)
        if (!_serverSecurityRulesLoaded) {
            loadServerSecurityRules();
        }

        // 서버 필수(required) 차단 규칙 추가 (항상 강제 적용)
        for (const rule of _serverBlockedCommands) {
            addPattern(rule.pattern);
        }

        // 서버 권장(recommended) 차단 규칙 추가 (비활성화되지 않은 것만)
        for (const rule of _serverRecommendedCommands) {
            if (!disabledBlockedCommands.includes(`server:${rule.description}`)) {
                addPattern(rule.pattern);
            }
        }

        return patterns;
    }

    // 주의 필요 명령어 패턴 (경고 후 허용)
    private static readonly CAUTION_COMMANDS: RegExp[] = [
        /\brm\s+(-[rf]+\s+)/i,                       // rm -rf (일반)
        /\bgit\s+(push\s+--force|reset\s+--hard)/i,  // 위험한 git 명령
        /\bnpm\s+publish/i,                          // npm 배포
        /\bdocker\s+rm/i,                            // 도커 삭제
        /\bkill\s+-9/i,                              // 강제 종료
    ];

    // 민감한 파일 패턴 (수정 차단) - 동적 생성
    private static get SENSITIVE_FILES(): RegExp[] {
        const patterns: RegExp[] = [];

        // 기본 규칙 중 비활성화되지 않은 것들 (읽기 전용 제외)
        const readOnlyIds = ['package_lock', 'yarn_lock', 'pnpm_lock'];
        for (const rule of DEFAULT_PROTECTED_FILES) {
            if (!disabledProtectedFiles.includes(rule.id) && !readOnlyIds.includes(rule.id)) {
                try {
                    patterns.push(new RegExp(rule.pattern, 'i'));
                } catch (e) {
                    console.warn(`[PreToolUseValidator] Invalid regex pattern: ${rule.pattern}`);
                }
            }
        }

        // 커스텀 규칙 추가
        for (const pattern of customProtectedFiles) {
            try {
                patterns.push(new RegExp(pattern, 'i'));
            } catch (e) {
                patterns.push(new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
            }
        }

        // 서버 보호 파일 규칙 로드
        if (!_serverSecurityRulesLoaded) {
            loadServerSecurityRules();
        }
        for (const rule of _serverProtectedFiles) {
            try {
                patterns.push(new RegExp(rule.pattern, 'i'));
            } catch (e) {
                patterns.push(new RegExp(rule.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
            }
        }

        // 서버 은닉 파일도 수정/삭제 차단 (읽기는 validateFileRead에서 별도 차단)
        for (const rule of _serverHiddenFiles) {
            try {
                patterns.push(new RegExp(rule.pattern, 'i'));
            } catch (e) {
                patterns.push(new RegExp(rule.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
            }
        }

        // 커스텀 은닉 파일도 수정/삭제 차단
        for (const pattern of customHiddenFiles) {
            try {
                patterns.push(new RegExp(pattern, 'i'));
            } catch (e) {
                patterns.push(new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
            }
        }

        return patterns;
    }

    // 읽기 허용되지만 수정 차단되는 파일 - 동적 생성
    private static get READ_ONLY_FILES(): RegExp[] {
        const patterns: RegExp[] = [];
        const readOnlyIds = ['package_lock', 'yarn_lock', 'pnpm_lock'];

        for (const rule of DEFAULT_PROTECTED_FILES) {
            if (readOnlyIds.includes(rule.id) && !disabledProtectedFiles.includes(rule.id)) {
                try {
                    patterns.push(new RegExp(rule.pattern, 'i'));
                } catch (e) {
                    console.warn(`[PreToolUseValidator] Invalid regex pattern: ${rule.pattern}`);
                }
            }
        }

        return patterns;
    }

    /**
     * 도구 사용 전 검증
     */
    static validate(toolUse: ToolUse, projectRoot: string): ValidationResult {
        switch (toolUse.name) {
            case Tool.RUN_COMMAND:
                return this.validateCommand(toolUse.params.command || '');

            case Tool.CREATE_FILE:
            case Tool.UPDATE_FILE:
                return this.validateFileWrite(toolUse.params.path || '', projectRoot);

            case Tool.READ_FILE:
                return this.validateFileRead(toolUse.params.path || '', projectRoot);

            case Tool.REMOVE_FILE:
                return this.validateFileRemove(toolUse.params.path || '', projectRoot);

            default:
                return { allowed: true };
        }
    }

    /**
     * 명령어 검증
     * v9.4.0: 셸 메타문자 및 변수 확장 패턴 감지 강화
     */
    private static validateCommand(command: string): ValidationResult {
        // 위험한 명령어 차단
        for (const pattern of this.DANGEROUS_COMMANDS) {
            if (pattern.test(command)) {
                return {
                    allowed: false,
                    reason: `위험한 명령어 차단: ${command.substring(0, 50)}...`,
                    severity: 'error'
                };
            }
        }

        // v9.4.0: rm 명령어 + 셸 메타문자 조합 차단
        const hasRmCommand = /\brm\s+(-[rRfF]+\s+)*/.test(command);
        if (hasRmCommand) {
            // 셸 메타문자가 포함되어 있으면 차단 (변수/서브셸을 통한 우회 방지)
            for (const metaPattern of this.SHELL_METACHAR_PATTERNS) {
                if (metaPattern.test(command)) {
                    return {
                        allowed: false,
                        reason: `위험한 명령어 우회 시도 차단: rm과 셸 메타문자 조합 불허`,
                        severity: 'error'
                    };
                }
            }

            // 세미콜론, 파이프, && 를 통한 명령어 연결 + rm 조합 차단
            if (/[;|]/.test(command) || /&&/.test(command) || /\|\|/.test(command)) {
                // rm 뒤에 위험한 경로가 있는지 추가 검사
                for (const pathPattern of this.DANGEROUS_PATH_PATTERNS) {
                    if (pathPattern.test(command)) {
                        return {
                            allowed: false,
                            reason: `위험한 경로 삭제 차단: 시스템 디렉토리 보호`,
                            severity: 'error'
                        };
                    }
                }
            }
        }

        // v9.4.0: sudo + 위험 명령어 조합 차단
        if (/\bsudo\b/.test(command)) {
            // sudo와 함께 위험한 패턴 감지
            if (/\brm\b/.test(command) || /\bchmod\b/.test(command) || /\bchown\b/.test(command)) {
                for (const pathPattern of this.DANGEROUS_PATH_PATTERNS) {
                    if (pathPattern.test(command)) {
                        return {
                            allowed: false,
                            reason: `sudo 권한 상승 + 시스템 경로 접근 차단`,
                            severity: 'error'
                        };
                    }
                }
            }
        }

        // 주의 필요 명령어 경고 (허용은 함)
        for (const pattern of this.CAUTION_COMMANDS) {
            if (pattern.test(command)) {
                console.warn(`[PreToolUseValidator] 주의 필요 명령어: ${command}`);
                return {
                    allowed: true,
                    reason: `주의 필요 명령어: ${command.substring(0, 50)}`,
                    severity: 'warning'
                };
            }
        }

        return { allowed: true };
    }

    /**
     * 경로 정규화 (심볼릭 링크 해결)
     * v9.4.0: 심볼릭 링크 우회 방지
     */
    private static normalizePath(filePath: string, projectRoot: string): { absolutePath: string; error?: string } {
        try {
            // 절대 경로 변환
            let absolutePath = path.isAbsolute(filePath)
                ? filePath
                : path.resolve(projectRoot, filePath);

            // 심볼릭 링크 해결 (실제 경로 반환)
            // 파일이 존재하면 realpath로 정규화
            if (fs.existsSync(absolutePath)) {
                try {
                    absolutePath = fs.realpathSync(absolutePath);
                } catch (e) {
                    // realpath 실패 시 원래 경로 사용 (새 파일 생성 등)
                }
            } else {
                // 파일이 없으면 부모 디렉토리로 검사
                const parentDir = path.dirname(absolutePath);
                if (fs.existsSync(parentDir)) {
                    try {
                        const realParent = fs.realpathSync(parentDir);
                        absolutePath = path.join(realParent, path.basename(absolutePath));
                    } catch (e) {
                        // 부모 디렉토리 realpath 실패 시 원래 경로 사용
                    }
                }
            }

            // 경로 정규화 (.. 등 제거)
            absolutePath = path.normalize(absolutePath);

            return { absolutePath };
        } catch (error) {
            return {
                absolutePath: filePath,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    /**
     * 파일 쓰기 경로 검증
     * v9.4.0: 심볼릭 링크 정규화 추가
     */
    private static validateFileWrite(filePath: string, projectRoot: string): ValidationResult {
        // v9.4.0: 심볼릭 링크를 해결한 실제 경로 사용
        const { absolutePath, error } = this.normalizePath(filePath, projectRoot);

        if (error) {
            console.warn(`[PreToolUseValidator] Path normalization warning: ${error}`);
        }

        // 프로젝트 외부 접근 차단 (정규화된 경로로 검사)
        const normalizedProjectRoot = fs.existsSync(projectRoot)
            ? fs.realpathSync(projectRoot)
            : projectRoot;

        if (!absolutePath.startsWith(normalizedProjectRoot)) {
            return {
                allowed: false,
                reason: `프로젝트 외부 파일 수정 차단: ${filePath}`,
                severity: 'error'
            };
        }

        // 상대 경로로 변환하여 패턴 매칭
        const relativePath = path.relative(normalizedProjectRoot, absolutePath);

        // 민감한 파일 차단
        for (const pattern of this.SENSITIVE_FILES) {
            if (pattern.test(relativePath) || pattern.test(filePath)) {
                return {
                    allowed: false,
                    reason: `민감한 파일 수정 차단: ${filePath}`,
                    severity: 'error'
                };
            }
        }

        // 읽기 전용 파일 차단
        for (const pattern of this.READ_ONLY_FILES) {
            if (pattern.test(relativePath) || pattern.test(filePath)) {
                return {
                    allowed: false,
                    reason: `읽기 전용 파일 수정 차단: ${filePath}`,
                    severity: 'error'
                };
            }
        }

        return { allowed: true };
    }

    /**
     * 파일 읽기 경로 검증
     * v9.4.0: 심볼릭 링크 정규화 추가
     */
    private static validateFileRead(filePath: string, projectRoot: string): ValidationResult {
        // v9.4.0: 심볼릭 링크를 해결한 실제 경로 사용
        const { absolutePath } = this.normalizePath(filePath, projectRoot);

        // 프로젝트 외부 접근 차단 (정규화된 경로로 검사)
        const normalizedProjectRoot = fs.existsSync(projectRoot)
            ? fs.realpathSync(projectRoot)
            : projectRoot;

        if (!absolutePath.startsWith(normalizedProjectRoot)) {
            return {
                allowed: false,
                reason: `프로젝트 외부 파일 읽기 차단: ${filePath}`,
                severity: 'error'
            };
        }

        // 은닉 파일 읽기 차단
        if (!_serverSecurityRulesLoaded) {
            loadServerSecurityRules();
        }
        const relativePath = absolutePath.replace(normalizedProjectRoot + '/', '');
        for (const rule of _serverHiddenFiles) {
            try {
                const regex = new RegExp(rule.pattern, 'i');
                if (regex.test(relativePath) || regex.test(filePath) || regex.test(path.basename(filePath))) {
                    return {
                        allowed: false,
                        reason: `은닉 파일 읽기 차단: ${filePath} (${rule.description})`,
                        severity: 'error'
                    };
                }
            } catch {
                const escaped = rule.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                if (new RegExp(escaped, 'i').test(relativePath) || new RegExp(escaped, 'i').test(filePath)) {
                    return {
                        allowed: false,
                        reason: `은닉 파일 읽기 차단: ${filePath} (${rule.description})`,
                        severity: 'error'
                    };
                }
            }
        }

        // 커스텀 은닉 파일 읽기 차단
        for (const pattern of customHiddenFiles) {
            try {
                const regex = new RegExp(pattern, 'i');
                if (regex.test(relativePath) || regex.test(filePath) || regex.test(path.basename(filePath))) {
                    return {
                        allowed: false,
                        reason: `은닉 파일 읽기 차단: ${filePath} (사용자 설정)`,
                        severity: 'error'
                    };
                }
            } catch {
                const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                if (new RegExp(escaped, 'i').test(relativePath) || new RegExp(escaped, 'i').test(filePath)) {
                    return {
                        allowed: false,
                        reason: `은닉 파일 읽기 차단: ${filePath} (사용자 설정)`,
                        severity: 'error'
                    };
                }
            }
        }

        return { allowed: true };
    }

    /**
     * 파일 삭제 경로 검증
     * v9.4.0: 심볼릭 링크 정규화 및 READ_ONLY_FILES 삭제 차단 추가
     */
    private static validateFileRemove(filePath: string, projectRoot: string): ValidationResult {
        // v9.4.0: 심볼릭 링크를 해결한 실제 경로 사용
        const { absolutePath } = this.normalizePath(filePath, projectRoot);

        // 프로젝트 외부 삭제 차단 (정규화된 경로로 검사)
        const normalizedProjectRoot = fs.existsSync(projectRoot)
            ? fs.realpathSync(projectRoot)
            : projectRoot;

        if (!absolutePath.startsWith(normalizedProjectRoot)) {
            return {
                allowed: false,
                reason: `프로젝트 외부 파일 삭제 차단: ${filePath}`,
                severity: 'error'
            };
        }

        // 상대 경로로 변환
        const relativePath = path.relative(normalizedProjectRoot, absolutePath);

        // 민감한 파일 삭제 차단
        for (const pattern of this.SENSITIVE_FILES) {
            if (pattern.test(relativePath) || pattern.test(filePath)) {
                return {
                    allowed: false,
                    reason: `민감한 파일 삭제 차단: ${filePath}`,
                    severity: 'error'
                };
            }
        }

        // v9.4.0: 읽기 전용 파일 삭제도 차단 (package-lock.json 등)
        for (const pattern of this.READ_ONLY_FILES) {
            if (pattern.test(relativePath) || pattern.test(filePath)) {
                return {
                    allowed: false,
                    reason: `읽기 전용 파일 삭제 차단: ${filePath}`,
                    severity: 'error'
                };
            }
        }

        return { allowed: true };
    }

    /**
     * 여러 도구에 대해 일괄 검증
     * @returns 차단된 도구들의 인덱스와 이유
     */
    static validateAll(toolUses: ToolUse[], projectRoot: string): Map<number, ValidationResult> {
        const blocked = new Map<number, ValidationResult>();

        toolUses.forEach((toolUse, index) => {
            const result = this.validate(toolUse, projectRoot);
            if (!result.allowed) {
                blocked.set(index, result);
            }
        });

        return blocked;
    }
}
