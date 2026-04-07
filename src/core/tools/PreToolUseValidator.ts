/**
 * PreToolUseValidator
 * Pre-tool-execution dangerous command blocking and path validation
 *
 * Validation items:
 * - Block dangerous terminal commands (rm -rf /, sudo, etc.)
 * - Block access to paths outside the project
 * - Prevent modification of sensitive files (.git, .env, etc.)
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
 * Default rule item (for UI display)
 */
export interface DefaultRule {
    id: string;
    pattern: string;
    description: string;
}

/**
 * Default blocked command list
 */
export const DEFAULT_BLOCKED_COMMANDS: DefaultRule[] = [
    { id: 'rm_rf', pattern: 'rm\\s+-rf\\s+/', description: 'Root path deletion (rm -rf /)' },
    { id: 'rm_recursive', pattern: 'rm\\s+(-[a-zA-Z]*r[a-zA-Z]*|--recursive)\\s+(\\/|~|\\.\\.\\/)', description: 'Recursive deletion of parent/home/root' },
    { id: 'chmod_777', pattern: 'chmod\\s+(-R\\s+)?777\\s+/', description: 'Full permissions on root path' },
    { id: 'mkfs', pattern: 'mkfs|format\\s+[cCdD]:', description: 'Disk format' },
    { id: 'dd_disk', pattern: 'dd\\s+.*of=\\/dev\\/', description: 'Direct disk write (dd)' },
    { id: 'curl_pipe_sh', pattern: 'curl\\s+.*\\|\\s*(sudo\\s+)?(ba)?sh', description: 'Download and execute script from URL' },
    { id: 'wget_pipe_sh', pattern: 'wget\\s+.*\\|\\s*(sudo\\s+)?(ba)?sh', description: 'Download and execute script from URL' },
    { id: 'eval_remote', pattern: 'eval\\s+"?\\$\\(curl', description: 'Remote code eval execution' },
    { id: 'shutdown', pattern: '(shutdown|reboot|halt|poweroff)\\s', description: 'System shutdown/restart' },
    { id: 'fdisk', pattern: '\\b(fdisk|parted)\\b', description: 'Partition modification' },
    { id: 'sudo_rm', pattern: 'sudo\\s+rm\\s', description: 'File deletion with sudo privileges' },

    // Zsh dangerous commands
    { id: 'zmodload', pattern: '\\bzmodload\\b', description: 'Zsh module loading (gateway to system-level attacks)' },
    { id: 'emulate_c', pattern: '\\bemulate\\s+-c\\b', description: 'Zsh eval-equivalent command' },
    { id: 'sysopen', pattern: '\\bsysopen\\b', description: 'Zsh direct file I/O (bypass file permissions)' },
    { id: 'zpty', pattern: '\\bzpty\\b', description: 'Zsh pseudo-terminal (process execution bypass)' },
    { id: 'ztcp', pattern: '\\bztcp\\b', description: 'Zsh TCP socket (network access bypass)' },
    { id: 'zsocket', pattern: '\\bzsocket\\b', description: 'Zsh socket (network access bypass)' },

    // Command injection patterns (pipe to shell)
    { id: 'curl_pipe_bash', pattern: 'curl\\s+.*\\|\\s*bash', description: 'Remote code execution via pipe' },
    { id: 'wget_pipe_bash', pattern: 'wget\\s+.*\\|\\s*bash', description: 'Remote code execution via pipe' },

    // Dangerous data exposure
    { id: 'proc_environ', pattern: '\\/proc\\/\\d*\\/environ', description: 'Environment variable exposure via /proc' },

    // Redirect to dynamic/variable target
    { id: 'unsafe_redirect', pattern: '[>|]\\s*[\\$`~]', description: 'Redirect to dynamic/variable target (injection risk)' },
];

/**
 * Default protected file list
 */
export const DEFAULT_PROTECTED_FILES: DefaultRule[] = [];

// Custom rule cache
let customBlockedCommands: string[] = [];
let customProtectedFiles: string[] = [];
let customHiddenFiles: string[] = [];
let disabledBlockedCommands: string[] = [];
let disabledProtectedFiles: string[] = [];

// Server security rule cache
let _serverBlockedCommands: { pattern: string; description: string }[] = [];
let _serverRecommendedCommands: { pattern: string; description: string }[] = [];
let _serverProtectedFiles: { pattern: string; description: string; enforcement: string }[] = [];
let _serverHiddenFiles: { pattern: string; description: string; enforcement: string }[] = [];
let _serverSecurityRulesLoaded = false;

/**
 * Update custom blocked commands cache
 */
export function updateCustomBlockedCommands(patterns: string[]): void {
    customBlockedCommands = patterns;
    PreToolUseValidator.invalidateCache();
}

/**
 * Update custom protected files cache
 */
export function updateCustomProtectedFiles(patterns: string[]): void {
    customProtectedFiles = patterns;
    PreToolUseValidator.invalidateCache();
}

/**
 * Update custom hidden files cache
 */
export function updateCustomHiddenFiles(patterns: string[]): void {
    customHiddenFiles = patterns;
    PreToolUseValidator.invalidateCache();
    if (patterns.length > 0) {
        console.log(`[PreToolUseValidator] Custom hidden files updated: [${patterns.join(', ')}]`);
    }
}

/**
 * Update disabled blocked commands cache
 */
export function updateDisabledBlockedCommands(ids: string[]): void {
    disabledBlockedCommands = ids;
    PreToolUseValidator.invalidateCache();
}

/**
 * Update disabled protected files cache
 */
export function updateDisabledProtectedFiles(ids: string[]): void {
    disabledProtectedFiles = ids;
    PreToolUseValidator.invalidateCache();
}

/**
 * Load server security rules
 * Fetches server security rules from SettingsManager and stores them in cache.
 * Required rules are always enforced; recommended rules can be disabled by the user.
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

        // Separate by type: blocked_command / protected_file / hidden_file
        const commandRules = rules.filter((r: { type: string }) => r.type === 'blocked_command' || (!r.type));
        const protectedRules = rules.filter((r: { type: string }) => r.type === 'protected_file');
        const hiddenRules = rules.filter((r: { type: string }) => r.type === 'hidden_file');

        // Blocked commands: required (always enforced) / recommended (can be disabled)
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

        // Protected files (block modification/deletion)
        _serverProtectedFiles = protectedRules
            .map((r: { pattern: string; description: string; enforcement: string }) => ({
                pattern: r.pattern,
                description: r.description,
                enforcement: r.enforcement
            }));

        // Hidden files (block read/modify/delete)
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
        // SettingsManager load failed - proceed without server rules
        _serverBlockedCommands = [];
        _serverRecommendedCommands = [];
        _serverProtectedFiles = [];
        _serverHiddenFiles = [];
        _serverSecurityRulesLoaded = true;
    }
}

export class PreToolUseValidator {
    // Cached regex arrays (reset via invalidateCache())
    private static _cachedDangerousCommands: RegExp[] | null = null;
    private static _cachedSensitiveFiles: RegExp[] | null = null;
    private static _cachedReadOnlyFiles: RegExp[] | null = null;
    private static _cachedHiddenFilePatterns: RegExp[] | null = null;

    /**
     * Check if file is a sensitive file (protected/hidden)
     */
    static isSensitiveFile(filePath: string): boolean {
        for (const pattern of this.SENSITIVE_FILES) {
            if (pattern.test(filePath)) return true;
        }
        return false;
    }

    /**
     * Invalidate cache - called when rules change
     */
    static invalidateCache(): void {
        PreToolUseValidator._cachedDangerousCommands = null;
        PreToolUseValidator._cachedSensitiveFiles = null;
        PreToolUseValidator._cachedReadOnlyFiles = null;
        PreToolUseValidator._cachedHiddenFilePatterns = null;
    }

    /**
     * Build deduplicated RegExp array from pattern string sources
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

    // v9.4.0: Shell metacharacter patterns (prevent command bypass)
    private static readonly SHELL_METACHAR_PATTERNS: RegExp[] = [
        /\$\([^)]+\)/,           // $() subshell
        /`[^`]+`/,               // ` ` backtick subshell
        /\$\{[^}]+\}/,           // ${} variable expansion
        /\$[A-Za-z_][A-Za-z0-9_]*/,  // $VAR variable reference
    ];

    // v9.4.0: Dangerous path patterns (blocked in combination with rm)
    private static readonly DANGEROUS_PATH_PATTERNS: RegExp[] = [
        /^\s*\/\s*$/,            // Root directory
        /^\s*~\s*$/,             // Home directory
        /^\s*\/etc/i,            // System configuration
        /^\s*\/usr/i,            // System binaries
        /^\s*\/var/i,            // System data
        /^\s*\/boot/i,           // Boot partition
        /^\s*\/dev/i,            // Device files
        /^\s*\/sys/i,            // System info
        /^\s*\/proc/i,           // Process info
    ];

    // Dangerous command patterns (never execute) - dynamically generated from defaults (deduplicated, cached)
    private static get DANGEROUS_COMMANDS(): RegExp[] {
        if (this._cachedDangerousCommands) return this._cachedDangerousCommands;

        if (!_serverSecurityRulesLoaded) loadServerSecurityRules();

        const sources: Array<{ pattern: string; skip?: boolean }> = [
            // Default rules that are not disabled
            ...DEFAULT_BLOCKED_COMMANDS.map(r => ({ pattern: r.pattern, skip: disabledBlockedCommands.includes(r.id) })),
            // Custom rules
            ...customBlockedCommands.map(p => ({ pattern: p })),
            // Server required blocking rules
            ..._serverBlockedCommands.map(r => ({ pattern: r.pattern })),
            // Server recommended blocking rules (only those not disabled)
            ..._serverRecommendedCommands.map(r => ({ pattern: r.pattern, skip: disabledBlockedCommands.includes(`server:${r.description}`) })),
        ];

        this._cachedDangerousCommands = this.buildRegexPatterns(sources);
        return this._cachedDangerousCommands;
    }

    // Caution-required command patterns (warn then allow)
    private static readonly CAUTION_COMMANDS: RegExp[] = [
        /\brm\s+(-[rf]+\s+)/i,                       // rm -rf (general)
        /\bgit\s+(push\s+--force|reset\s+--hard)/i,  // dangerous git commands
        /\bnpm\s+publish/i,                          // npm publish
        /\bdocker\s+rm/i,                            // docker remove
        /\bkill\s+-9/i,                              // force kill
    ];

    // Sensitive file patterns (block modification) - dynamically generated (cached)
    private static get SENSITIVE_FILES(): RegExp[] {
        if (this._cachedSensitiveFiles) return this._cachedSensitiveFiles;

        if (!_serverSecurityRulesLoaded) loadServerSecurityRules();

        const readOnlyIds = ['package_lock', 'yarn_lock', 'pnpm_lock'];
        const sources: Array<{ pattern: string; skip?: boolean }> = [
            // Default rules that are not disabled (excluding read-only)
            ...DEFAULT_PROTECTED_FILES.map(r => ({
                pattern: r.pattern,
                skip: disabledProtectedFiles.includes(r.id) || readOnlyIds.includes(r.id),
            })),
            // Custom protected files
            ...customProtectedFiles.map(p => ({ pattern: p })),
            // Server protected files
            ..._serverProtectedFiles.map(r => ({ pattern: r.pattern })),
            // Server hidden files (also block modification/deletion)
            ..._serverHiddenFiles.map(r => ({ pattern: r.pattern })),
            // Custom hidden files (also block modification/deletion)
            ...customHiddenFiles.map(p => ({ pattern: p })),
        ];

        this._cachedSensitiveFiles = this.buildRegexPatterns(sources);
        return this._cachedSensitiveFiles;
    }

    // Files that allow reading but block modification - dynamically generated (cached)
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

    // Hidden file patterns (for blocking reads) - cached
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
     * Check if file is hidden (for search result filtering)
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
     * Validate before tool use
     */
    static async validate(toolUse: ToolUse, projectRoot: string): Promise<ValidationResult> {
        switch (toolUse.name) {
            case Tool.RUN_COMMAND:
                return this.validateCommand(toolUse.params.command || '');

            case Tool.CREATE_FILE:
            case Tool.UPDATE_FILE:
                return this.validateFileWrite(toolUse.params.path || '', projectRoot);

            case Tool.READ_FILE:
            case Tool.LIST_IMPORTS:
            case Tool.STAT_FILE:
                return this.validateFileRead(toolUse.params.path || '', projectRoot);

            case Tool.REMOVE_FILE:
                return this.validateFileRemove(toolUse.params.path || '', projectRoot);

            default:
                return { allowed: true };
        }
    }

    // Continuation line security: detect backslash-newline that could hide commands
    private static hasSuspiciousContinuation(command: string): boolean {
        const lines = command.split('\n');
        for (let i = 0; i < lines.length - 1; i++) {
            const match = lines[i].match(/\\+$/);
            if (match && match[0].length % 2 === 1) {
                // Odd number of backslashes = real continuation
                // Check if next line starts with a dangerous command
                const nextLine = lines[i + 1]?.trim();
                if (nextLine && /^(rm|chmod|dd|mkfs|curl|wget|eval)/.test(nextLine)) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Command validation
     * v9.4.0: Enhanced shell metacharacter and variable expansion pattern detection
     */
    private static validateCommand(command: string): ValidationResult {
        // Block suspicious continuation lines (backslash-newline hiding dangerous commands)
        if (this.hasSuspiciousContinuation(command)) {
            return {
                allowed: false,
                reason: `Suspicious continuation line detected: backslash-newline hiding dangerous command`,
                severity: 'error'
            };
        }

        // Block dangerous commands
        for (const pattern of this.DANGEROUS_COMMANDS) {
            if (pattern.test(command)) {
                return {
                    allowed: false,
                    reason: `Dangerous command blocked: ${command.substring(0, 50)}...`,
                    severity: 'error'
                };
            }
        }

        // v9.4.0: Block rm command + shell metacharacter combinations
        const hasRmCommand = /\brm\s+(-[rRfF]+\s+)*/.test(command);
        if (hasRmCommand) {
            // Block if shell metacharacters are present (prevent bypass via variables/subshells)
            for (const metaPattern of this.SHELL_METACHAR_PATTERNS) {
                if (metaPattern.test(command)) {
                    return {
                        allowed: false,
                        reason: `Dangerous command bypass attempt blocked: rm + shell metacharacter combination not allowed`,
                        severity: 'error'
                    };
                }
            }

            // Block rm combined with command chaining via semicolons, pipes, &&
            if (/[;|]/.test(command) || /&&/.test(command) || /\|\|/.test(command)) {
                // Additional check for dangerous paths after rm
                for (const pathPattern of this.DANGEROUS_PATH_PATTERNS) {
                    if (pathPattern.test(command)) {
                        return {
                            allowed: false,
                            reason: `Dangerous path deletion blocked: system directory protection`,
                            severity: 'error'
                        };
                    }
                }
            }
        }

        // v9.4.0: Block sudo + dangerous command combinations
        if (/\bsudo\b/.test(command)) {
            // Detect dangerous patterns with sudo
            if (/\brm\b/.test(command) || /\bchmod\b/.test(command) || /\bchown\b/.test(command)) {
                for (const pathPattern of this.DANGEROUS_PATH_PATTERNS) {
                    if (pathPattern.test(command)) {
                        return {
                            allowed: false,
                            reason: `sudo privilege escalation + system path access blocked`,
                            severity: 'error'
                        };
                    }
                }
            }
        }

        // Caution-required command warning (still allowed)
        for (const pattern of this.CAUTION_COMMANDS) {
            if (pattern.test(command)) {
                console.warn(`[PreToolUseValidator] Caution-required command: ${command}`);
                return {
                    allowed: true,
                    reason: `Caution-required command: ${command.substring(0, 50)}`,
                    severity: 'warning'
                };
            }
        }

        return { allowed: true };
    }

    /**
     * Path normalization (resolve symbolic links)
     * v9.4.0: Prevent symbolic link bypass
     */
    private static async resolveRealPath(p: string): Promise<string> {
        try {
            return await fsPromises.realpath(p);
        } catch {
            return p;
        }
    }

    private static async normalizePath(filePath: string, projectRoot: string): Promise<{ absolutePath: string; error?: string }> {
        try {
            // Convert to absolute path
            let absolutePath = path.isAbsolute(filePath)
                ? filePath
                : path.resolve(projectRoot, filePath);

            // Resolve symbolic links (return actual path)
            // Normalize via realpath if file exists
            if (fs.existsSync(absolutePath)) {
                absolutePath = await this.resolveRealPath(absolutePath);
            } else {
                // If file doesn't exist, check parent directory
                const parentDir = path.dirname(absolutePath);
                if (fs.existsSync(parentDir)) {
                    const realParent = await this.resolveRealPath(parentDir);
                    absolutePath = path.join(realParent, path.basename(absolutePath));
                }
            }

            // Normalize path (remove .. etc.)
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
     * Windows 대소문자 무시 경로 비교
     */
    private static pathStartsWith(childPath: string, parentPath: string): boolean {
        if (process.platform === 'win32') {
            return childPath.toLowerCase().startsWith(parentPath.toLowerCase());
        }
        return childPath.startsWith(parentPath);
    }

    /**
     * File write path validation
     * v9.4.0: Added symbolic link normalization
     */
    private static async validateFileWrite(filePath: string, projectRoot: string): Promise<ValidationResult> {
        // v9.4.0: Use actual path with symbolic links resolved
        const { absolutePath, error } = await this.normalizePath(filePath, projectRoot);

        if (error) {
            console.warn(`[PreToolUseValidator] Path normalization warning: ${error}`);
        }

        // Block access outside project (check with normalized path)
        const normalizedProjectRoot = fs.existsSync(projectRoot)
            ? await this.resolveRealPath(projectRoot)
            : projectRoot;

        if (!this.pathStartsWith(absolutePath, normalizedProjectRoot)) {
            return {
                allowed: false,
                reason: `File modification outside project blocked: ${filePath}`,
                severity: 'error'
            };
        }

        // Convert to relative path for pattern matching
        const relativePath = path.relative(normalizedProjectRoot, absolutePath);

        // Block sensitive files
        for (const pattern of this.SENSITIVE_FILES) {
            if (pattern.test(relativePath) || pattern.test(filePath)) {
                return {
                    allowed: false,
                    reason: `Sensitive file modification blocked: ${filePath}`,
                    severity: 'error'
                };
            }
        }

        // Block read-only files
        for (const pattern of this.READ_ONLY_FILES) {
            if (pattern.test(relativePath) || pattern.test(filePath)) {
                return {
                    allowed: false,
                    reason: `Read-only file modification blocked: ${filePath}`,
                    severity: 'error'
                };
            }
        }

        return { allowed: true };
    }

    /**
     * File read path validation
     * v9.4.0: Added symbolic link normalization
     */
    private static async validateFileRead(filePath: string, projectRoot: string): Promise<ValidationResult> {
        // v9.4.0: Use actual path with symbolic links resolved
        const { absolutePath } = await this.normalizePath(filePath, projectRoot);

        // Block access outside project (check with normalized path)
        const normalizedProjectRoot = fs.existsSync(projectRoot)
            ? await this.resolveRealPath(projectRoot)
            : projectRoot;

        if (!this.pathStartsWith(absolutePath, normalizedProjectRoot)) {
            return {
                allowed: false,
                reason: `File read outside project blocked: ${filePath}`,
                severity: 'error'
            };
        }

        // Block hidden file reads (using cached patterns)
        const relativePath = absolutePath.replace(normalizedProjectRoot + '/', '');
        for (const pattern of this.HIDDEN_FILE_PATTERNS) {
            if (pattern.test(relativePath) || pattern.test(filePath) || pattern.test(path.basename(filePath))) {
                console.log(`[PreToolUseValidator] Hidden file match: pattern="${pattern}", file="${filePath}", relativePath="${relativePath}"`);
                return {
                    allowed: false,
                    reason: `Hidden file read blocked: ${filePath}`,
                    severity: 'error'
                };
            }
        }

        return { allowed: true };
    }

    /**
     * File deletion path validation
     * v9.4.0: Added symbolic link normalization and READ_ONLY_FILES deletion blocking
     */
    private static async validateFileRemove(filePath: string, projectRoot: string): Promise<ValidationResult> {
        // v9.4.0: Use actual path with symbolic links resolved
        const { absolutePath } = await this.normalizePath(filePath, projectRoot);

        // Block deletion outside project (check with normalized path)
        const normalizedProjectRoot = fs.existsSync(projectRoot)
            ? await this.resolveRealPath(projectRoot)
            : projectRoot;

        if (!this.pathStartsWith(absolutePath, normalizedProjectRoot)) {
            return {
                allowed: false,
                reason: `File deletion outside project blocked: ${filePath}`,
                severity: 'error'
            };
        }

        // 상대 경로로 변환
        const relativePath = path.relative(normalizedProjectRoot, absolutePath);

        // Block sensitive file deletion
        for (const pattern of this.SENSITIVE_FILES) {
            if (pattern.test(relativePath) || pattern.test(filePath)) {
                return {
                    allowed: false,
                    reason: `Sensitive file deletion blocked: ${filePath}`,
                    severity: 'error'
                };
            }
        }

        // v9.4.0: Also block read-only file deletion (package-lock.json, etc.)
        for (const pattern of this.READ_ONLY_FILES) {
            if (pattern.test(relativePath) || pattern.test(filePath)) {
                return {
                    allowed: false,
                    reason: `Read-only file deletion blocked: ${filePath}`,
                    severity: 'error'
                };
            }
        }

        return { allowed: true };
    }

    /**
     * Batch validate multiple tools
     * @returns Indices and reasons for blocked tools
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
