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
import { Tool } from './types';
/**
 * 기본 차단 명령어 목록
 */
export const DEFAULT_BLOCKED_COMMANDS = [
    // Unix/Linux/macOS
    { id: 'rm_root', pattern: '\\brm\\s+(-[rf]+\\s+)*[\\/~]\\s*$', description: 'rm -rf /' },
    { id: 'sudo_rm', pattern: '\\bsudo\\s+rm\\s+(-[rf]+\\s+)*[\\/~]', description: 'sudo rm -rf /' },
    { id: 'mkfs', pattern: '\\bmkfs\\b', description: 'mkfs' },
    { id: 'dd_dev', pattern: '\\bdd\\s+.*of=\\/dev\\/', description: 'dd of=/dev/*' },
    { id: 'fork_bomb', pattern: ':(){ :|:& };:', description: ':(){ :|:& };:' },
    { id: 'chmod_777', pattern: '\\bchmod\\s+(-[rR]+\\s+)?777\\s+[\\/~]', description: 'chmod 777 /' },
    { id: 'chown_root', pattern: '\\bchown\\s+(-[rR]+\\s+)?.*[\\/~]\\s*$', description: 'chown -R /' },
    { id: 'write_dev', pattern: '>\\s*\\/dev\\/(sda|hd|nvme)', description: '> /dev/sda' },
    { id: 'curl_sh', pattern: '\\bcurl\\s+.*\\|\\s*(ba)?sh', description: 'curl | sh' },
    { id: 'wget_sh', pattern: '\\bwget\\s+.*\\|\\s*(ba)?sh', description: 'wget | sh' },
    // Windows
    { id: 'rd_root', pattern: '\\b(rd|rmdir)\\s+\\/s\\s+\\/q\\s+[cC]:\\\\', description: 'rd /s /q C:\\' },
    { id: 'del_root', pattern: '\\bdel\\s+\\/[fFsS].*[cC]:\\\\\\*', description: 'del /f C:\\*' },
    { id: 'format', pattern: '\\bformat\\s+[a-zA-Z]:', description: 'format C:' },
    { id: 'diskpart', pattern: '\\bdiskpart\\b', description: 'diskpart' },
    { id: 'reg_delete', pattern: '\\breg\\s+delete\\s+HK(LM|CR|CU)', description: 'reg delete HKLM' },
    { id: 'bcdedit', pattern: '\\bbcdedit\\s+\\/delete', description: 'bcdedit /delete' },
    { id: 'powershell_rm', pattern: 'Remove-Item\\s+.*-Recurse.*[cC]:\\\\', description: 'Remove-Item -Recurse C:\\' },
    { id: 'iex_download', pattern: '\\biex\\s*\\(.*Net\\.WebClient', description: 'iex (New-Object Net.WebClient)' },
];
/**
 * 기본 보호 파일 목록
 */
export const DEFAULT_PROTECTED_FILES = [
    { id: 'git_dir', pattern: '^\\.git\\/', description: '.git/' },
    { id: 'env_file', pattern: '^\\.env$', description: '.env' },
    { id: 'env_variants', pattern: '^\\.env\\.[^\\/]+$', description: '.env.*' },
    { id: 'nested_git', pattern: '\\/\\.git\\/', description: '**/.git/' },
    { id: 'credentials', pattern: 'credentials', description: '*credentials*' },
    { id: 'secrets', pattern: 'secrets?\\.', description: 'secret.*' },
    { id: 'pem', pattern: '\\.pem$', description: '*.pem' },
    { id: 'key', pattern: '\\.key$', description: '*.key' },
    { id: 'id_rsa', pattern: 'id_rsa', description: 'id_rsa' },
    { id: 'package_lock', pattern: 'package-lock\\.json$', description: 'package-lock.json' },
    { id: 'yarn_lock', pattern: 'yarn\\.lock$', description: 'yarn.lock' },
    { id: 'pnpm_lock', pattern: 'pnpm-lock\\.yaml$', description: 'pnpm-lock.yaml' },
];
// 커스텀 규칙 캐시
let customBlockedCommands = [];
let customProtectedFiles = [];
let disabledBlockedCommands = [];
let disabledProtectedFiles = [];
/**
 * 커스텀 차단 명령어 캐시 업데이트
 */
export function updateCustomBlockedCommands(patterns) {
    customBlockedCommands = patterns;
}
/**
 * 커스텀 보호 파일 캐시 업데이트
 */
export function updateCustomProtectedFiles(patterns) {
    customProtectedFiles = patterns;
}
/**
 * 비활성화된 차단 명령어 캐시 업데이트
 */
export function updateDisabledBlockedCommands(ids) {
    disabledBlockedCommands = ids;
}
/**
 * 비활성화된 보호 파일 캐시 업데이트
 */
export function updateDisabledProtectedFiles(ids) {
    disabledProtectedFiles = ids;
}
export class PreToolUseValidator {
    // v9.4.0: 셸 메타문자 패턴 (명령어 우회 방지)
    static SHELL_METACHAR_PATTERNS = [
        /\$\([^)]+\)/, // $() 서브셸
        /`[^`]+`/, // ` ` 백틱 서브셸
        /\$\{[^}]+\}/, // ${} 변수 확장
        /\$[A-Za-z_][A-Za-z0-9_]*/, // $VAR 변수 참조
    ];
    // v9.4.0: 위험한 경로 패턴 (rm과 조합 시 차단)
    static DANGEROUS_PATH_PATTERNS = [
        /^\s*\/\s*$/, // 루트 디렉토리
        /^\s*~\s*$/, // 홈 디렉토리
        /^\s*\/etc/i, // 시스템 설정
        /^\s*\/usr/i, // 시스템 바이너리
        /^\s*\/var/i, // 시스템 데이터
        /^\s*\/boot/i, // 부트 파티션
        /^\s*\/dev/i, // 디바이스
        /^\s*\/sys/i, // 시스템 정보
        /^\s*\/proc/i, // 프로세스 정보
    ];
    // 위험한 명령어 패턴 (절대 실행 금지) - 기본값 기반으로 동적 생성
    static get DANGEROUS_COMMANDS() {
        const patterns = [];
        // 기본 규칙 중 비활성화되지 않은 것들
        for (const rule of DEFAULT_BLOCKED_COMMANDS) {
            if (!disabledBlockedCommands.includes(rule.id)) {
                try {
                    patterns.push(new RegExp(rule.pattern, 'i'));
                }
                catch (e) {
                    console.warn(`[PreToolUseValidator] Invalid regex pattern: ${rule.pattern}`);
                }
            }
        }
        // 커스텀 규칙 추가
        for (const pattern of customBlockedCommands) {
            try {
                patterns.push(new RegExp(pattern, 'i'));
            }
            catch (e) {
                // 정규식이 아닌 경우 문자열 포함 검사로 처리
                patterns.push(new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
            }
        }
        return patterns;
    }
    // 주의 필요 명령어 패턴 (경고 후 허용)
    static CAUTION_COMMANDS = [
        /\brm\s+(-[rf]+\s+)/i, // rm -rf (일반)
        /\bgit\s+(push\s+--force|reset\s+--hard)/i, // 위험한 git 명령
        /\bnpm\s+publish/i, // npm 배포
        /\bdocker\s+rm/i, // 도커 삭제
        /\bkill\s+-9/i, // 강제 종료
    ];
    // 민감한 파일 패턴 (수정 차단) - 동적 생성
    static get SENSITIVE_FILES() {
        const patterns = [];
        // 기본 규칙 중 비활성화되지 않은 것들 (읽기 전용 제외)
        const readOnlyIds = ['package_lock', 'yarn_lock', 'pnpm_lock'];
        for (const rule of DEFAULT_PROTECTED_FILES) {
            if (!disabledProtectedFiles.includes(rule.id) && !readOnlyIds.includes(rule.id)) {
                try {
                    patterns.push(new RegExp(rule.pattern, 'i'));
                }
                catch (e) {
                    console.warn(`[PreToolUseValidator] Invalid regex pattern: ${rule.pattern}`);
                }
            }
        }
        // 커스텀 규칙 추가
        for (const pattern of customProtectedFiles) {
            try {
                patterns.push(new RegExp(pattern, 'i'));
            }
            catch (e) {
                patterns.push(new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
            }
        }
        return patterns;
    }
    // 읽기 허용되지만 수정 차단되는 파일 - 동적 생성
    static get READ_ONLY_FILES() {
        const patterns = [];
        const readOnlyIds = ['package_lock', 'yarn_lock', 'pnpm_lock'];
        for (const rule of DEFAULT_PROTECTED_FILES) {
            if (readOnlyIds.includes(rule.id) && !disabledProtectedFiles.includes(rule.id)) {
                try {
                    patterns.push(new RegExp(rule.pattern, 'i'));
                }
                catch (e) {
                    console.warn(`[PreToolUseValidator] Invalid regex pattern: ${rule.pattern}`);
                }
            }
        }
        return patterns;
    }
    /**
     * 도구 사용 전 검증
     */
    static validate(toolUse, projectRoot) {
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
    static validateCommand(command) {
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
    static normalizePath(filePath, projectRoot) {
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
                }
                catch (e) {
                    // realpath 실패 시 원래 경로 사용 (새 파일 생성 등)
                }
            }
            else {
                // 파일이 없으면 부모 디렉토리로 검사
                const parentDir = path.dirname(absolutePath);
                if (fs.existsSync(parentDir)) {
                    try {
                        const realParent = fs.realpathSync(parentDir);
                        absolutePath = path.join(realParent, path.basename(absolutePath));
                    }
                    catch (e) {
                        // 부모 디렉토리 realpath 실패 시 원래 경로 사용
                    }
                }
            }
            // 경로 정규화 (.. 등 제거)
            absolutePath = path.normalize(absolutePath);
            return { absolutePath };
        }
        catch (error) {
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
    static validateFileWrite(filePath, projectRoot) {
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
    static validateFileRead(filePath, projectRoot) {
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
        return { allowed: true };
    }
    /**
     * 파일 삭제 경로 검증
     * v9.4.0: 심볼릭 링크 정규화 및 READ_ONLY_FILES 삭제 차단 추가
     */
    static validateFileRemove(filePath, projectRoot) {
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
    static validateAll(toolUses, projectRoot) {
        const blocked = new Map();
        toolUses.forEach((toolUse, index) => {
            const result = this.validate(toolUse, projectRoot);
            if (!result.allowed) {
                blocked.set(index, result);
            }
        });
        return blocked;
    }
}
//# sourceMappingURL=PreToolUseValidator.js.map