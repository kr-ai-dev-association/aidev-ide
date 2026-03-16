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
import * as fsPromises from 'fs/promises';
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
 * 기본 차단 명령어 목록 (standalone: 빌트인 기본값)
 */
export const DEFAULT_BLOCKED_COMMANDS: DefaultRule[] = [
    { id: 'rm_rf', pattern: 'rm\\s+-rf\\s+/', description: '루트 경로 삭제 (rm -rf /)' },
    { id: 'rm_recursive', pattern: 'rm\\s+(-[a-zA-Z]*r[a-zA-Z]*|--recursive)\\s+(\\/|~|\\.\\.\\/)', description: '상위/홈/루트 재귀 삭제' },
    { id: 'format_disk', pattern: 'mkfs|format\\s+[cCdD]:', description: '디스크 포맷' },
    { id: 'dd_disk', pattern: 'dd\\s+.*of=\\/dev\\/', description: '디스크 직접 쓰기 (dd)' },
    { id: 'chmod_777', pattern: 'chmod\\s+(-R\\s+)?777\\s+/', description: '루트 경로 전체 권한 부여' },
    { id: 'shutdown', pattern: '(shutdown|reboot|halt|poweroff)\\s', description: '시스템 종료/재시작' },
    { id: 'curl_pipe_sh', pattern: 'curl\\s+.*\\|\\s*(sudo\\s+)?(ba)?sh', description: 'URL에서 스크립트 다운로드 실행' },
    { id: 'wget_pipe_sh', pattern: 'wget\\s+.*\\|\\s*(sudo\\s+)?(ba)?sh', description: 'URL에서 스크립트 다운로드 실행' },
    { id: 'eval_remote', pattern: 'eval\\s+"?\\$\\(curl', description: '원격 코드 eval 실행' },
    { id: 'drop_database', pattern: 'DROP\\s+(DATABASE|TABLE|SCHEMA)', description: '데이터베이스/테이블 삭제' },
    { id: 'git_push_force', pattern: 'git\\s+push\\s+.*--force', description: 'Git 강제 푸시' },
    { id: 'npm_publish', pattern: 'npm\\s+publish', description: 'npm 패키지 퍼블리시' },
    { id: 'sudo_rm', pattern: 'sudo\\s+rm\\s', description: 'sudo 권한 파일 삭제' },
    { id: 'kill_all', pattern: 'killall|pkill\\s+-9', description: '프로세스 강제 종료' },
    { id: 'env_export', pattern: 'printenv|env\\s*$|export\\s+-p', description: '환경 변수 전체 출력' },
];

/**
 * 기본 보호 파일 목록 (standalone: 빌트인 기본값)
 */
export const DEFAULT_PROTECTED_FILES: DefaultRule[] = [
    { id: 'env_file', pattern: '\\.env$|\\.env\\.', description: '환경 변수 파일 (.env)' },
    { id: 'credentials', pattern: 'credentials(\\.json|\\.yml|\\.yaml)?$', description: '인증 정보 파일' },
    { id: 'ssh_keys', pattern: '\\.ssh\\/(id_|authorized_keys|known_hosts)', description: 'SSH 키/설정' },
    { id: 'private_key', pattern: '\\.(pem|key|p12|pfx|jks)$', description: '개인 키/인증서 파일' },
    { id: 'aws_config', pattern: '\\.aws\\/(credentials|config)', description: 'AWS 자격 증명' },
    { id: 'docker_secrets', pattern: '\\.docker\\/config\\.json', description: 'Docker 인증 설정' },
    { id: 'git_credentials', pattern: '\\.git-credentials|\\.gitconfig', description: 'Git 자격 증명' },
    { id: 'npmrc', pattern: '\\.npmrc$', description: 'npm 인증 토큰 (.npmrc)' },
    { id: 'pypirc', pattern: '\\.pypirc$', description: 'PyPI 인증 토큰' },
    { id: 'kubeconfig', pattern: 'kubeconfig|\\.kube\\/config', description: 'Kubernetes 설정' },
    { id: 'package_lock', pattern: 'package-lock\\.json$', description: 'package-lock.json (읽기 전용)' },
    { id: 'yarn_lock', pattern: 'yarn\\.lock$', description: 'yarn.lock (읽기 전용)' },
    { id: 'pnpm_lock', pattern: 'pnpm-lock\\.yaml$', description: 'pnpm-lock.yaml (읽기 전용)' },
];

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
    PreToolUseValidator.invalidateCache();
}

/**
 * 커스텀 보호 파일 캐시 업데이트
 */
export function updateCustomProtectedFiles(patterns: string[]): void {
    customProtectedFiles = patterns;
    PreToolUseValidator.invalidateCache();
}

/**
 * 커스텀 은닉 파일 캐시 업데이트
 */
export function updateCustomHiddenFiles(patterns: string[]): void {
    customHiddenFiles = patterns;
    PreToolUseValidator.invalidateCache();
    if (patterns.length > 0) {
        console.log(`[PreToolUseValidator] Custom hidden files updated: [${patterns.join(', ')}]`);
    }
}

/**
 * 비활성화된 차단 명령어 캐시 업데이트
 */
export function updateDisabledBlockedCommands(ids: string[]): void {
    disabledBlockedCommands = ids;
    PreToolUseValidator.invalidateCache();
}

/**
 * 비활성화된 보호 파일 캐시 업데이트
 */
export function updateDisabledProtectedFiles(ids: string[]): void {
    disabledProtectedFiles = ids;
    PreToolUseValidator.invalidateCache();
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
        PreToolUseValidator.invalidateCache();
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
    // 캐시된 regex 배열 (invalidateCache()로 초기화)
    private static _cachedDangerousCommands: RegExp[] | null = null;
    private static _cachedSensitiveFiles: RegExp[] | null = null;
    private static _cachedReadOnlyFiles: RegExp[] | null = null;
    private static _cachedHiddenFilePatterns: RegExp[] | null = null;

    /**
     * 캐시 무효화 — 규칙 변경 시 호출
     */
    static invalidateCache(): void {
        PreToolUseValidator._cachedDangerousCommands = null;
        PreToolUseValidator._cachedSensitiveFiles = null;
        PreToolUseValidator._cachedReadOnlyFiles = null;
        PreToolUseValidator._cachedHiddenFilePatterns = null;
    }

    /**
     * 패턴 문자열 배열로부터 중복 제거된 RegExp 배열 생성
     */
    private static buildRegexPatterns(sources: Array<{ pattern: string; skip?: boolean }>): RegExp[] {
        const patterns: RegExp[] = [];
        const added = new Set<string>();
        for (const { pattern: p, skip } of sources) {
            if (skip || added.has(p)) continue;
            added.add(p);
            try {
                patterns.push(new RegExp(p, 'i'));
            } catch {
                const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                if (!added.has(escaped)) {
                    added.add(escaped);
                    patterns.push(new RegExp(escaped, 'i'));
                }
            }
        }
        return patterns;
    }

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

    // 위험한 명령어 패턴 (절대 실행 금지) - 기본값 기반으로 동적 생성 (중복 제거, 캐싱)
    private static get DANGEROUS_COMMANDS(): RegExp[] {
        if (this._cachedDangerousCommands) return this._cachedDangerousCommands;

        if (!_serverSecurityRulesLoaded) loadServerSecurityRules();

        const sources: Array<{ pattern: string; skip?: boolean }> = [
            // 기본 규칙 중 비활성화되지 않은 것들
            ...DEFAULT_BLOCKED_COMMANDS.map(r => ({ pattern: r.pattern, skip: disabledBlockedCommands.includes(r.id) })),
            // 커스텀 규칙
            ...customBlockedCommands.map(p => ({ pattern: p })),
            // 서버 필수(required) 차단 규칙
            ..._serverBlockedCommands.map(r => ({ pattern: r.pattern })),
            // 서버 권장(recommended) 차단 규칙 (비활성화되지 않은 것만)
            ..._serverRecommendedCommands.map(r => ({ pattern: r.pattern, skip: disabledBlockedCommands.includes(`server:${r.description}`) })),
        ];

        this._cachedDangerousCommands = this.buildRegexPatterns(sources);
        return this._cachedDangerousCommands;
    }

    // 주의 필요 명령어 패턴 (경고 후 허용)
    private static readonly CAUTION_COMMANDS: RegExp[] = [
        /\brm\s+(-[rf]+\s+)/i,                       // rm -rf (일반)
        /\bgit\s+(push\s+--force|reset\s+--hard)/i,  // 위험한 git 명령
        /\bnpm\s+publish/i,                          // npm 배포
        /\bdocker\s+rm/i,                            // 도커 삭제
        /\bkill\s+-9/i,                              // 강제 종료
    ];

    // 민감한 파일 패턴 (수정 차단) - 동적 생성 (캐싱)
    private static get SENSITIVE_FILES(): RegExp[] {
        if (this._cachedSensitiveFiles) return this._cachedSensitiveFiles;

        if (!_serverSecurityRulesLoaded) loadServerSecurityRules();

        const readOnlyIds = ['package_lock', 'yarn_lock', 'pnpm_lock'];
        const sources: Array<{ pattern: string; skip?: boolean }> = [
            // 기본 규칙 중 비활성화되지 않은 것들 (읽기 전용 제외)
            ...DEFAULT_PROTECTED_FILES.map(r => ({
                pattern: r.pattern,
                skip: disabledProtectedFiles.includes(r.id) || readOnlyIds.includes(r.id),
            })),
            // 커스텀 보호 파일
            ...customProtectedFiles.map(p => ({ pattern: p })),
            // 서버 보호 파일
            ..._serverProtectedFiles.map(r => ({ pattern: r.pattern })),
            // 서버 은닉 파일 (수정/삭제도 차단)
            ..._serverHiddenFiles.map(r => ({ pattern: r.pattern })),
            // 커스텀 은닉 파일 (수정/삭제도 차단)
            ...customHiddenFiles.map(p => ({ pattern: p })),
        ];

        this._cachedSensitiveFiles = this.buildRegexPatterns(sources);
        return this._cachedSensitiveFiles;
    }

    // 읽기 허용되지만 수정 차단되는 파일 - 동적 생성 (캐싱)
    private static get READ_ONLY_FILES(): RegExp[] {
        if (this._cachedReadOnlyFiles) return this._cachedReadOnlyFiles;

        const readOnlyIds = ['package_lock', 'yarn_lock', 'pnpm_lock'];
        const sources: Array<{ pattern: string; skip?: boolean }> = DEFAULT_PROTECTED_FILES.map(r => ({
            pattern: r.pattern,
            skip: !readOnlyIds.includes(r.id) || disabledProtectedFiles.includes(r.id),
        }));

        this._cachedReadOnlyFiles = this.buildRegexPatterns(sources);
        return this._cachedReadOnlyFiles;
    }

    // 은닉 파일 패턴 (읽기 차단용) - 캐싱
    private static get HIDDEN_FILE_PATTERNS(): RegExp[] {
        if (this._cachedHiddenFilePatterns) return this._cachedHiddenFilePatterns;

        if (!_serverSecurityRulesLoaded) loadServerSecurityRules();

        const sources: Array<{ pattern: string; skip?: boolean }> = [
            ..._serverHiddenFiles.map(r => ({ pattern: r.pattern })),
            ...customHiddenFiles.map(p => ({ pattern: p })),
        ];

        this._cachedHiddenFilePatterns = this.buildRegexPatterns(sources);
        return this._cachedHiddenFilePatterns;
    }

    /**
     * 은닉 파일 여부 확인 (검색 결과 필터링용)
     */
    static isHiddenFile(filePath: string, projectRoot: string): boolean {
        const patterns = this.HIDDEN_FILE_PATTERNS;
        if (patterns.length === 0) return false;

        const relativePath = path.isAbsolute(filePath)
            ? path.relative(projectRoot, filePath)
            : filePath;
        const basename = path.basename(filePath);

        for (const pattern of patterns) {
            if (pattern.test(relativePath) || pattern.test(filePath) || pattern.test(basename)) {
                return true;
            }
        }
        return false;
    }

    /**
     * 도구 사용 전 검증
     */
    static async validate(toolUse: ToolUse, projectRoot: string): Promise<ValidationResult> {
        switch (toolUse.name) {
            case Tool.RUN_COMMAND:
                return this.validateCommand(toolUse.params.command || '');

            case Tool.CREATE_FILE:
            case Tool.UPDATE_FILE:
                return this.validateFileWrite(toolUse.params.path || '', projectRoot);

            case Tool.READ_FILE:
            case Tool.EXPAND_AROUND_LINE:
            case Tool.LIST_IMPORTS:
            case Tool.STAT_FILE:
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
     * 심볼릭 링크를 해결한 실제 경로 반환 (async)
     */
    private static async resolveRealPath(p: string): Promise<string> {
        try {
            return await fsPromises.realpath(p);
        } catch {
            return p;
        }
    }

    /**
     * 경로 정규화 (심볼릭 링크 해결)
     * v9.4.0: 심볼릭 링크 우회 방지
     */
    private static async normalizePath(filePath: string, projectRoot: string): Promise<{ absolutePath: string; error?: string }> {
        try {
            // 절대 경로 변환
            let absolutePath = path.isAbsolute(filePath)
                ? filePath
                : path.resolve(projectRoot, filePath);

            // 심볼릭 링크 해결 (실제 경로 반환)
            // 파일이 존재하면 realpath로 정규화
            if (fs.existsSync(absolutePath)) {
                absolutePath = await this.resolveRealPath(absolutePath);
            } else {
                // 파일이 없으면 부모 디렉토리로 검사
                const parentDir = path.dirname(absolutePath);
                if (fs.existsSync(parentDir)) {
                    const realParent = await this.resolveRealPath(parentDir);
                    absolutePath = path.join(realParent, path.basename(absolutePath));
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
    private static async validateFileWrite(filePath: string, projectRoot: string): Promise<ValidationResult> {
        // v9.4.0: 심볼릭 링크를 해결한 실제 경로 사용
        const { absolutePath, error } = await this.normalizePath(filePath, projectRoot);

        if (error) {
            console.warn(`[PreToolUseValidator] Path normalization warning: ${error}`);
        }

        // 프로젝트 외부 접근 차단 (정규화된 경로로 검사)
        const normalizedProjectRoot = await this.resolveRealPath(projectRoot);

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
    private static async validateFileRead(filePath: string, projectRoot: string): Promise<ValidationResult> {
        // v9.4.0: 심볼릭 링크를 해결한 실제 경로 사용
        const { absolutePath } = await this.normalizePath(filePath, projectRoot);

        // 프로젝트 외부 접근 차단 (정규화된 경로로 검사)
        const normalizedProjectRoot = await this.resolveRealPath(projectRoot);

        if (!absolutePath.startsWith(normalizedProjectRoot)) {
            return {
                allowed: false,
                reason: `프로젝트 외부 파일 읽기 차단: ${filePath}`,
                severity: 'error'
            };
        }

        // 은닉 파일 읽기 차단 (캐싱된 패턴 사용)
        const relativePath = absolutePath.replace(normalizedProjectRoot + '/', '');
        for (const pattern of this.HIDDEN_FILE_PATTERNS) {
            if (pattern.test(relativePath) || pattern.test(filePath) || pattern.test(path.basename(filePath))) {
                console.log(`[PreToolUseValidator] Hidden file match: pattern="${pattern}", file="${filePath}", relativePath="${relativePath}"`);
                return {
                    allowed: false,
                    reason: `은닉 파일 읽기 차단: ${filePath}`,
                    severity: 'error'
                };
            }
        }

        return { allowed: true };
    }

    /**
     * 파일 삭제 경로 검증
     * v9.4.0: 심볼릭 링크 정규화 및 READ_ONLY_FILES 삭제 차단 추가
     */
    private static async validateFileRemove(filePath: string, projectRoot: string): Promise<ValidationResult> {
        // v9.4.0: 심볼릭 링크를 해결한 실제 경로 사용
        const { absolutePath } = await this.normalizePath(filePath, projectRoot);

        // 프로젝트 외부 삭제 차단 (정규화된 경로로 검사)
        const normalizedProjectRoot = await this.resolveRealPath(projectRoot);

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
    static async validateAll(toolUses: ToolUse[], projectRoot: string): Promise<Map<number, ValidationResult>> {
        const blocked = new Map<number, ValidationResult>();

        for (let index = 0; index < toolUses.length; index++) {
            const result = await this.validate(toolUses[index], projectRoot);
            if (!result.allowed) {
                blocked.set(index, result);
            }
        }

        return blocked;
    }
}
