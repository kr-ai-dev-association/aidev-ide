/**
 * Run Command Tool Handler
 * Terminal command execution tool handler
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { IToolHandler, ToolExecutionContext } from '../IToolHandler';
import { ToolUse, ToolResponse, Tool } from '../types';
import { HotLoadManager } from '../../managers/hotload/HotLoadManager';
import { semanticBoolean } from '../../../utils/semanticBoolean';

/** Auto-background commands — long-running processes that should run in background automatically */
const AUTO_BACKGROUND_PATTERNS = [
    /\bnpm\s+run\s+(dev|start|serve)\b/,
    /\byarn\s+(dev|start|serve)\b/,
    /\bpnpm\s+(dev|start|serve)\b/,
    /\bnpx\s+(vite|next|nuxt)\b/,
    /\buvicorn\b/,
    /\bgunicorn\b/,
    /\bpython\s+.*manage\.py\s+runserver\b/,
    /\bflask\s+run\b/,
    /\bgo\s+run\b.*--.*server/,
    /\bcargo\s+run\b/,
    /\bdocker\s+compose\s+up\b/,
    /\bdocker-compose\s+up\b/,
];

function isAutoBackgroundCommand(command: string): boolean {
    return AUTO_BACKGROUND_PATTERNS.some(p => p.test(command));
}

/** Safe read-only commands whitelist (for INVESTIGATION phase validation) */
export const READ_ONLY_SAFE_COMMANDS = new Set([
    // Unix
    'cat', 'less', 'more', 'head', 'tail', 'file', 'wc', 'stat',
    'find', 'grep', 'rg', 'fd', 'locate', 'which', 'whereis',
    'ls', 'du', 'df', 'ps', 'whoami', 'pwd', 'date', 'env', 'echo',
    // Windows
    'type', 'dir', 'findstr', 'where', 'hostname', 'systeminfo',
    'Get-Content', 'Get-ChildItem', 'Get-Item', 'Get-Process', 'Get-Location',
    // Cross-platform
    'git status', 'git log', 'git show', 'git diff', 'git branch',
    'npm list', 'npm ls', 'pip list', 'pip show',
    'node --version', 'python --version', 'python3 --version',
    'uv --version', 'cargo --version', 'go version', 'dotnet --version',
]);

export function isReadOnlySafeCommand(command: string): boolean {
    const trimmed = command.trim();
    const firstWord = trimmed.split(/\s+/)[0];
    // Check if the first command word is in the safe list
    if (READ_ONLY_SAFE_COMMANDS.has(firstWord)) return true;
    // Check multi-word commands (git status, npm list, etc.)
    for (const safe of READ_ONLY_SAFE_COMMANDS) {
        if (safe.includes(' ') && trimmed.startsWith(safe)) return true;
    }
    return false;
}

/**
 * Command prefix -> manifest file mapping
 * If manifest is not at workspace root, auto-search in subdirectories
 */
const COMMAND_MANIFEST_MAP: Record<string, string[]> = {
    // ── JavaScript / TypeScript ──
    'npm': ['package.json'],
    'npx': ['package.json'],
    'yarn': ['package.json'],
    'pnpm': ['package.json'],
    'bun': ['package.json', 'bun.lockb'],
    'bunx': ['package.json'],
    'deno': ['deno.json', 'deno.jsonc'],
    'tsc': ['tsconfig.json', 'package.json'],
    'tsx': ['package.json', 'tsconfig.json'],

    // ── Python ──
    'pip': ['requirements.txt', 'setup.py', 'pyproject.toml'],
    'pip3': ['requirements.txt', 'setup.py', 'pyproject.toml'],
    'python': ['requirements.txt', 'setup.py', 'pyproject.toml'],
    'python3': ['requirements.txt', 'setup.py', 'pyproject.toml'],
    'uv': ['pyproject.toml', 'uv.lock', 'requirements.txt'],
    'uvx': ['pyproject.toml', 'uv.lock'],
    'poetry': ['pyproject.toml', 'poetry.lock'],
    'pipenv': ['Pipfile'],
    'pdm': ['pyproject.toml', 'pdm.lock'],
    'hatch': ['pyproject.toml'],
    'pytest': ['pyproject.toml', 'setup.cfg', 'pytest.ini'],

    // ── Rust ──
    'cargo': ['Cargo.toml'],
    'rustc': ['Cargo.toml'],

    // ── Go ──
    'go': ['go.mod'],

    // ── Ruby ──
    'bundle': ['Gemfile'],
    'gem': ['Gemfile'],
    'rails': ['Gemfile'],
    'rake': ['Gemfile', 'Rakefile'],

    // ── PHP ──
    'composer': ['composer.json'],

    // ── Dart / Flutter ──
    'flutter': ['pubspec.yaml'],
    'dart': ['pubspec.yaml'],

    // ── Java / JVM ──
    'gradle': ['build.gradle', 'build.gradle.kts', 'settings.gradle'],
    'gradlew': ['build.gradle', 'build.gradle.kts', 'settings.gradle'],
    './gradlew': ['build.gradle', 'build.gradle.kts', 'settings.gradle'],
    'mvn': ['pom.xml'],
    'mvnw': ['pom.xml'],
    './mvnw': ['pom.xml'],
    'sbt': ['build.sbt'],

    // ── .NET ──
    'dotnet': ['*.csproj', '*.fsproj', '*.sln'],

    // ── C / C++ ──
    'make': ['Makefile', 'makefile'],
    'cmake': ['CMakeLists.txt'],

    // ── Swift ──
    'swift': ['Package.swift'],

    // ── Elixir ──
    'mix': ['mix.exs'],

    // ── Zig ──
    'zig': ['build.zig'],

    // ── Gleam ──
    'gleam': ['gleam.toml'],

    // ── Erlang ──
    'rebar3': ['rebar.config'],

    // ── Clojure ──
    'lein': ['project.clj'],

    // ── Terraform / IaC ──
    'terraform': ['main.tf'],

    // ── Helm ──
    'helm': ['Chart.yaml'],
};

const MAX_OUTPUT_CHARS = 30000;
const HEAD_CHARS = 15000;
const TAIL_CHARS = 15000;

function truncateOutput(output: string | undefined): string | undefined {
    if (!output || output.length <= MAX_OUTPUT_CHARS) return output;
    const head = output.slice(0, HEAD_CHARS);
    const tail = output.slice(-TAIL_CHARS);
    const dropped = output.length - HEAD_CHARS - TAIL_CHARS;
    return `${head}\n\n... [output truncated: ${dropped.toLocaleString()} chars omitted - showing first ${HEAD_CHARS.toLocaleString()} + last ${TAIL_CHARS.toLocaleString()} chars] ...\n\n${tail}`;
}

export class RunCommandToolHandler implements IToolHandler {
    readonly name = Tool.RUN_COMMAND;

    async execute(toolUse: ToolUse, context: ToolExecutionContext): Promise<ToolResponse> {
        const command = toolUse.params.command;

        if (!command) {
            return {
                success: false,
                message: 'Command parameter is required',
                error: { code: 'MISSING_PARAM', message: 'command is required' }
            };
        }

        // Check HotLoad matching - use executeWithRetry if completion condition/retries are configured
        const hotLoadResult = await this.tryHotLoadExecution(command, context);
        if (hotLoadResult) {
            return hotLoadResult;
        }

        const timeoutSeconds = toolUse.params.timeout ? parseInt(toolUse.params.timeout) : undefined;
        const isBackground = semanticBoolean(toolUse.params.is_background) || isAutoBackgroundCommand(command);

        if (!isBackground && isAutoBackgroundCommand(command)) {
            console.log(`[RunCommandToolHandler] Auto-background detected: ${command}`);
        }

        // -- Sub-project auto-detection: search subdirectories if no manifest --
        const effectiveCwd = this.resolveCommandCwd(command, context.projectRoot);

        // Phase 0: LLM explicitly requested or auto-detected background execution
        if (isBackground) {
            console.log(`[RunCommandToolHandler] Background mode requested: ${command}`);
            const bgResult = await context.executionManager.executeCommand(command, {
                cwd: effectiveCwd,
                timeout: 5000, // Short wait to capture initial output
                killOnTimeout: false,
            });

            // 프로세스가 타임아웃 전에 종료된 경우 exit code 확인
            const processExited = bgResult.exitCode !== undefined && bgResult.exitCode !== null;
            const exitedWithError = processExited && bgResult.exitCode !== 0;

            if (exitedWithError) {
                // 프로세스가 빠르게 크래시한 경우 — 실패로 처리 (백그라운드 전환 안 함)
                console.log(`[RunCommandToolHandler] Background process crashed immediately: ${command} (exit=${bgResult.exitCode})`);
                return {
                    success: false,
                    message: `Command failed immediately with exit code ${bgResult.exitCode}: ${command}`,
                    data: {
                        output: truncateOutput(bgResult.stdout),
                        error: truncateOutput(bgResult.stderr),
                        exitCode: bgResult.exitCode,
                        llmNote: `The background command failed to start (exit code ${bgResult.exitCode}). Check the error output and fix the issue before retrying.`,
                    }
                };
            }

            const pid = bgResult.pid || context.executionManager.getRunningProcesses()
                .find(p => p.command === command)?.pid;
            if (pid) {
                context.executionManager.continueProcess(pid);
            }
            return {
                success: true,
                message: `Background command started: ${command}${pid ? ` (PID: ${pid})` : ''}`,
                data: {
                    output: truncateOutput(bgResult.stdout) || `Process started in background${pid ? ` (PID: ${pid})` : ''}.`,
                    llmNote: 'This command is running in the background. Do not re-execute the same command. Proceed with the next task.',
                    error: truncateOutput(bgResult.stderr),
                    exitCode: bgResult.exitCode,
                }
            };
        }

        // Phase 1: Execute with timeout to check output
        const INITIAL_TIMEOUT = 30000; // 30s wait

        const initialResult = await context.executionManager.executeCommand(command, {
            cwd: effectiveCwd,
            timeout: timeoutSeconds ? timeoutSeconds * 1000 : INITIAL_TIMEOUT,
            killOnTimeout: false,
        });

        // Phase 2: If completed in initial execution -> judge by exit code
        if (initialResult.exitCode !== undefined) {
            console.log(`[RunCommandToolHandler] Command completed: ${command} (exit=${initialResult.exitCode})`);
            return {
                success: initialResult.exitCode === 0,
                message: initialResult.exitCode === 0
                    ? `Command executed: ${command}`
                    : `Command failed: ${command}`,
                data: {
                    output: truncateOutput(initialResult.stdout),
                    error: truncateOutput(initialResult.stderr),
                    exitCode: initialResult.exitCode,
                }
            };
        }

        // Phase 3: Timeout occurred -> process still running, switch to background immediately
        // No need to wait 120s — the process continues in background regardless
        const pid = initialResult.pid || context.executionManager.getRunningProcesses()
            .find(p => p.command === command)?.pid;

        if (pid) {
            context.executionManager.continueProcess(pid);
            console.log(`[RunCommandToolHandler] Timeout reached, moving to background: ${command} (PID: ${pid})`);
            return {
                success: true,
                message: `Command running in background: ${command} (PID: ${pid})`,
                data: {
                    output: truncateOutput(initialResult.stdout) || `Process started in background (PID: ${pid}).`,
                    llmNote: 'This command did not finish within the initial timeout. It is now running in the background. Do not re-execute the same command. Proceed with the next task.',
                    error: truncateOutput(initialResult.stderr),
                    exitCode: undefined,
                }
            };
        }

        // Timeout without pid -> return error
        return {
            success: false,
            message: `Command timed out: ${command}`,
            data: {
                output: truncateOutput(initialResult.stdout),
                error: truncateOutput(initialResult.stderr) || 'Command timed out without producing a process ID',
                exitCode: undefined,
            }
        };
    }

    getDescription(toolUse: ToolUse): string {
        return `[run_command: ${toolUse.params.command}]`;
    }

    /** Directories to exclude from search */
    private static readonly SKIP_DIRS = new Set([
        'node_modules', '.git', '.svn', '.hg', 'dist', 'build', 'out',
        '.next', '.nuxt', '.output', '__pycache__', '.venv', 'venv',
        'vendor', 'target', '.gradle', '.idea', '.vscode',
    ]);

    /**
     * Check if manifest name is a glob pattern (*.csproj, etc.)
     * and verify if matching files exist in the directory
     */
    private hasManifestIn(dir: string, manifests: string[]): boolean {
        return manifests.some(m => {
            if (m.startsWith('*')) {
                // glob pattern: extension matching
                const ext = m.slice(1); // "*.csproj" → ".csproj"
                try {
                    return fs.readdirSync(dir).some((f: string) => f.endsWith(ext));
                } catch { return false; }
            }
            return fs.existsSync(path.join(dir, m));
        });
    }

    /**
     * Search subdirectories up to maxDepth and return the nearest directory with manifest
     * BFS search, prioritizing results with lower (closer) depth
     */
    private findManifestDir(root: string, manifests: string[], maxDepth: number): string | null {
        const queue: { dir: string; depth: number }[] = [];

        // Add 1-depth child directories to queue
        try {
            const entries = fs.readdirSync(root, { withFileTypes: true });
            for (const entry of entries) {
                if (!entry.isDirectory() || entry.name.startsWith('.') || RunCommandToolHandler.SKIP_DIRS.has(entry.name)) continue;
                queue.push({ dir: path.join(root, entry.name), depth: 1 });
            }
        } catch { return null; }

        while (queue.length > 0) {
            const { dir, depth } = queue.shift()!;

            if (this.hasManifestIn(dir, manifests)) {
                return dir;
            }

            // Continue searching subdirectories if maxDepth not yet reached
            if (depth < maxDepth) {
                try {
                    const entries = fs.readdirSync(dir, { withFileTypes: true });
                    for (const entry of entries) {
                        if (!entry.isDirectory() || entry.name.startsWith('.') || RunCommandToolHandler.SKIP_DIRS.has(entry.name)) continue;
                        queue.push({ dir: path.join(dir, entry.name), depth: depth + 1 });
                    }
                } catch { /* skip unreadable dirs */ }
            }
        }

        return null;
    }

    /**
     * Detect the command's package manager and determine the appropriate cwd.
     * If manifest file is not at workspace root, auto-search in subdirectories.
     * BFS 2-depth search: supports monorepos like packages/api/, apps/web/, services/auth/
     */
    private resolveCommandCwd(command: string, projectRoot: string): string {
        const cmdPrefix = command.trim().split(/\s+/)[0];
        const manifests = COMMAND_MANIFEST_MAP[cmdPrefix];
        if (!manifests) return projectRoot;

        // Use as-is if manifest exists at root
        if (this.hasManifestIn(projectRoot, manifests)) return projectRoot;

        // 명령어에서 서브 프로젝트 경로 추출 시도
        // 예: "dotnet build MyWebApi/MyWebApi.csproj" → "MyWebApi"
        // 예: "cd MyWebApi && dotnet build" → "MyWebApi"
        const cmdHint = this.extractProjectHintFromCommand(command, projectRoot);
        if (cmdHint) {
            console.log(`[RunCommandToolHandler] Auto-resolved cwd to sub-project (from command): ${cmdHint}`);
            return cmdHint;
        }

        // BFS search up to 2-depth (폴백: 첫 번째 매니페스트 디렉토리)
        const found = this.findManifestDir(projectRoot, manifests, 2);
        if (found) {
            console.log(`[RunCommandToolHandler] Auto-resolved cwd to sub-project: ${found}`);
            return found;
        }

        return projectRoot;
    }

    /**
     * 명령어에서 서브 프로젝트 디렉토리를 추출
     * "dotnet build MyWebApi/MyWebApi.csproj" → projectRoot/MyWebApi
     * "cd MyWebApi && dotnet build" → projectRoot/MyWebApi
     * "npm run dev --prefix frontend" → projectRoot/frontend
     */
    private extractProjectHintFromCommand(command: string, projectRoot: string): string | null {
        const path = require('path');
        const fs = require('fs');

        // 1. "cd XXX && ..." 패턴
        const cdMatch = command.match(/^cd\s+([^\s&]+)/);
        if (cdMatch) {
            const candidate = path.join(projectRoot, cdMatch[1]);
            if (fs.existsSync(candidate)) return candidate;
        }

        // 2. 명령어 인자에서 디렉토리/파일 경로 추출
        const parts = command.split(/\s+/);
        for (const part of parts) {
            // "MyWebApi/MyWebApi.csproj" → "MyWebApi"
            // "MyWebApi" → "MyWebApi"
            // "--project MyWebApi" → "MyWebApi"
            const cleaned = part.replace(/^["']|["']$/g, ''); // 따옴표 제거
            if (cleaned.startsWith('-') || cleaned.startsWith('/')) continue; // 플래그 스킵

            // 파일 경로면 부모 디렉토리 사용
            let dirCandidate = cleaned;
            if (cleaned.includes('/') || cleaned.includes('\\')) {
                dirCandidate = cleaned.split(/[/\\]/)[0];
            }

            const fullPath = path.join(projectRoot, dirCandidate);
            try {
                if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
                    return fullPath;
                }
            } catch { /* skip */ }
        }

        return null;
    }

    /**
     * Check command match with HotLoad items and execute with retry
     * If matched and completionCondition/maxRetries exist, execute in HotLoad mode
     */
    private async tryHotLoadExecution(
        command: string,
        context: ToolExecutionContext
    ): Promise<ToolResponse | null> {
        try {
            const hotLoadManager = HotLoadManager.getInstance();
            const items = await hotLoadManager.getAllHotLoads();

            // Find HotLoad item with exact command match
            const matchedItem = items.find(item =>
                item.command.trim() === command.trim()
            );

            if (!matchedItem) {
                return null; // No match -> proceed with normal execution
            }

            // completionCondition or maxRetries must exist for HotLoad execution to be meaningful
            if (!matchedItem.completionCondition && (!matchedItem.maxRetries || matchedItem.maxRetries === 0)) {
                console.log(`[RunCommandToolHandler] HotLoad matched but no conditions/retries: ${command}`);
                return null; // Proceed with normal execution
            }

            console.log(`[RunCommandToolHandler] HotLoad executeWithRetry: ${command}`);

            // Get webview from context (create dummy if unavailable)
            const webview = context.webview || this.createDummyWebview();

            const result = await hotLoadManager.executeWithRetry(
                matchedItem,
                context.projectRoot,
                webview
            );

            // Process result
            if (result.success) {
                return {
                    success: true,
                    message: `HotLoad command executed: ${command} (${result.attempts} attempt(s))`,
                    data: {
                        output: result.output,
                        exitCode: result.exitCode,
                        hotload: true,
                        attempts: result.attempts
                    }
                };
            }

            // Handle failure based on failureAction
            const response: ToolResponse = {
                success: false,
                message: `HotLoad command failed: ${command} (${result.attempts} attempt(s))`,
                data: {
                    output: result.output,
                    exitCode: result.exitCode,
                    hotload: true,
                    attempts: result.attempts,
                    failureAction: result.failureAction
                }
            };

            // If pass_to_llm, add detailed info to error field
            if (result.failureAction === 'pass_to_llm') {
                response.error = {
                    code: 'HOTLOAD_FAILED',
                    message: `HotLoad failed (${result.attempts} attempts): ${result.output}`
                };
            }

            return response;
        } catch (error) {
            console.warn('[RunCommandToolHandler] HotLoad check failed:', error);
            return null; // Proceed with normal execution on error
        }
    }

    /**
     * Dummy object to use when webview is unavailable
     */
    private createDummyWebview(): vscode.Webview {
        return {
            postMessage: () => Promise.resolve(true),
            html: '',
            options: {},
            onDidReceiveMessage: () => ({ dispose: () => {} }),
            asWebviewUri: (uri: vscode.Uri) => uri,
            cspSource: ''
        } as unknown as vscode.Webview;
    }
}


