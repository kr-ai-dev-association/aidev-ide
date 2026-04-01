/**
 * List Files Tool Handler
 * Lists files in a directory
 */

import { IToolHandler, ToolExecutionContext } from '../IToolHandler';
import { ToolUse, ToolResponse, Tool } from '../types';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { SubProjectDetector } from '../../managers/project/SubProjectDetector';

export class ListFilesToolHandler implements IToolHandler {
    readonly name = Tool.LIST_FILES;

    // .gitignore pattern cache (projectRoot -> patterns)
    private gitignoreCache: Map<string, string[]> = new Map();

    private async loadGitignorePatterns(projectRoot: string): Promise<string[]> {
        if (this.gitignoreCache.has(projectRoot)) {
            return this.gitignoreCache.get(projectRoot)!;
        }
        const gitignorePath = path.join(projectRoot, '.gitignore');
        try {
            const content = await fs.readFile(gitignorePath, 'utf-8');
            const patterns = content
                .split('\n')
                .map(line => line.trim())
                .filter(line => line && !line.startsWith('#') && !line.startsWith('!'));
            this.gitignoreCache.set(projectRoot, patterns);
            return patterns;
        } catch {
            this.gitignoreCache.set(projectRoot, []);
            return [];
        }
    }

    private matchesGitignore(entryName: string, relativePath: string, patterns: string[]): boolean {
        for (const pattern of patterns) {
            const p = pattern.endsWith('/') ? pattern.slice(0, -1) : pattern;
            // Simple name matching
            if (!p.includes('/') && !p.includes('*')) {
                if (entryName === p) { return true; }
                continue;
            }
            // Wildcard pattern -- simple glob conversion
            const regex = new RegExp(
                '^' + p.replace(/\./g, '\\.').replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*') + '$'
            );
            if (regex.test(entryName) || regex.test(relativePath)) { return true; }
        }
        return false;
    }

    private readonly DEFAULT_IGNORE_DIRECTORIES = [
        // JS/TS
        'node_modules',
        'dist',
        'build',
        'out',
        'bundle',
        '.next',
        '.nuxt',
        '.svelte-kit',
        '.astro',
        '.docusaurus',
        '.cache',
        '.parcel-cache',
        'coverage',
        '__mocks__',
        // Python
        'venv',
        '.venv',
        'env',
        '__pycache__',
        '.pytest_cache',
        // Java/Kotlin/Android
        'target',
        '.gradle',
        // iOS
        'Pods',
        'DerivedData',
        // Go/PHP/Ruby
        'vendor',
        '.bundle',
        // VCS
        '.git',
        '.svn',
        '.hg',
        // IaC
        '.terraform',
        // IDE
        '.idea',
        '.vscode',
        // OS/misc
        'tmp',
        'temp',
        'deps',
        'logs',
        '.DS_Store',
    ];
    
    async execute(toolUse: ToolUse, context: ToolExecutionContext): Promise<ToolResponse> {
        const dirPath = toolUse.params.path || '.';
        const recursive = toolUse.params.recursive === 'true';
        
        let absolutePath = path.isAbsolute(dirPath)
            ? dirPath
            : path.join(context.projectRoot, dirPath);

        // Sub-project path fallback: re-search from sub-project root if directory not found
        if (!path.isAbsolute(dirPath) && !fsSync.existsSync(absolutePath)) {
            const fallback = SubProjectDetector.resolveWithFallback(context.projectRoot, dirPath);
            if (fallback && fsSync.statSync(fallback).isDirectory()) {
                console.log(`[ListFilesToolHandler] SubProject fallback: ${dirPath} → ${path.relative(context.projectRoot, fallback)}`);
                absolutePath = fallback;
            }
        }

        // Block access to paths outside project root
        if (!absolutePath.startsWith(context.projectRoot) && absolutePath !== context.projectRoot) {
            console.warn(`[ListFilesToolHandler] External path blocked: ${absolutePath}. Using project root instead.`);
            absolutePath = context.projectRoot;
        }
        
        try {
            const gitignorePatterns = await this.loadGitignorePatterns(context.projectRoot);
            const files = await this.listFiles(absolutePath, recursive, context.projectRoot, gitignorePatterns);
            return {
                success: true,
                message: `Listed ${files.length} files in ${dirPath}`,
                data: { path: dirPath, files }
            };
        } catch (error: any) {
            // Handle permission errors
            if (error.code === 'EACCES') {
                return {
                    success: false,
                    message: `Permission denied: ${dirPath}`,
                    error: { code: 'PERMISSION_DENIED', message: error.message }
                };
            }
            return {
                success: false,
                message: `Failed to list files: ${dirPath}`,
                error: { 
                    code: 'LIST_ERROR', 
                    message: error instanceof Error ? error.message : String(error)
                }
            };
        }
    }
    
    private async listFiles(dirPath: string, recursive: boolean, projectRoot: string, gitignorePatterns: string[] = []): Promise<string[]> {
        const files: string[] = [];
        const self = this;

        // Check if target directory name is in the ignore list
        const targetDirName = path.basename(dirPath);
        const isTargetingIgnored = this.DEFAULT_IGNORE_DIRECTORIES.includes(targetDirName) || targetDirName.startsWith('.');

        async function traverse(currentPath: string) {
            try {
                const entries = await fs.readdir(currentPath, { withFileTypes: true });

                for (const entry of entries) {
                    const entryName = entry.name;
                    const fullPath = path.join(currentPath, entryName);
                    const relativePath = path.relative(projectRoot, fullPath);

                    // Ignore filtering:
                    // 1. Check ignore list unless explicitly targeting this directory
                    // 2. Check hidden files/directories ('.') (only when not targeting)
                    // 3. Check .gitignore patterns
                    if (!isTargetingIgnored) {
                        if (self.DEFAULT_IGNORE_DIRECTORIES.includes(entryName) || entryName.startsWith('.')) {
                            continue;
                        }
                        if (gitignorePatterns.length > 0 && self.matchesGitignore(entryName, relativePath, gitignorePatterns)) {
                            continue;
                        }
                    }
                    
                    if (entry.isFile()) {
                        files.push(relativePath || entryName);
                    } else if (entry.isDirectory() && recursive) {
                        await traverse(fullPath);
                    }
                }
            } catch (error: any) {
                // Skip only the subdirectory with permission errors
                if (error.code === 'EACCES') {
                    console.warn(`[ListFilesToolHandler] Skipping protected directory: ${currentPath}`);
                    return;
                }
                throw error;
            }
        }
        
        await traverse(dirPath);
        return files;
    }
    
    getDescription(toolUse: ToolUse): string {
        return `[list_files: ${toolUse.params.path || 'current directory'}]`;
    }
}


