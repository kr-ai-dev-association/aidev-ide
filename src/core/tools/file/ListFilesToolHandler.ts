/**
 * List Files Tool Handler
 * 파일 목록 조회 툴 핸들러
 */

import { IToolHandler, ToolExecutionContext } from '../IToolHandler';
import { ToolUse, ToolResponse, Tool } from '../types';
import * as fs from 'fs/promises';
import * as path from 'path';

export class ListFilesToolHandler implements IToolHandler {
    readonly name = Tool.LIST_FILES;

    private readonly DEFAULT_IGNORE_DIRECTORIES = [
        'node_modules',
        '.git',
        'dist',
        'build',
        'out',
        'bundle',
        'vendor',
        'tmp',
        'temp',
        'deps',
        '__pycache__',
        'env',
        'venv',
        'target',
        '.idea',
        '.vscode',
        '.next',
        '.nuxt',
        '.svelte-kit',
        '.astro',
        '.docusaurus',
        '.cache',
        '.parcel-cache',
        '.DS_Store'
    ];
    
    async execute(toolUse: ToolUse, context: ToolExecutionContext): Promise<ToolResponse> {
        const dirPath = toolUse.params.path || '.';
        const recursive = toolUse.params.recursive === 'true';
        
        const absolutePath = path.isAbsolute(dirPath)
            ? dirPath
            : path.join(context.projectRoot, dirPath);
        
        try {
            const files = await this.listFiles(absolutePath, recursive, context.projectRoot);
            return {
                success: true,
                message: `Listed ${files.length} files in ${dirPath}`,
                data: { path: dirPath, files }
            };
        } catch (error) {
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
    
    private async listFiles(dirPath: string, recursive: boolean, projectRoot: string): Promise<string[]> {
        const files: string[] = [];
        const self = this;
        
        // 탐색 대상 디렉토리 이름이 무시 목록에 있는지 확인
        const targetDirName = path.basename(dirPath);
        const isTargetingIgnored = this.DEFAULT_IGNORE_DIRECTORIES.includes(targetDirName) || targetDirName.startsWith('.');

        async function traverse(currentPath: string) {
            const entries = await fs.readdir(currentPath, { withFileTypes: true });
            
            for (const entry of entries) {
                const entryName = entry.name;
                const fullPath = path.join(currentPath, entryName);
                const relativePath = path.relative(projectRoot, fullPath);

                // 무시 필터링: 
                // 1. 명시적으로 해당 디렉토리를 타겟팅한 게 아니라면 무시 목록 체크
                // 2. 숨김 파일/디렉토리 ('.') 체크 (타겟팅하지 않은 경우에만)
                if (!isTargetingIgnored) {
                    if (self.DEFAULT_IGNORE_DIRECTORIES.includes(entryName) || entryName.startsWith('.')) {
                        continue;
                    }
                }
                
                if (entry.isFile()) {
                    files.push(relativePath || entryName);
                } else if (entry.isDirectory() && recursive) {
                    await traverse(fullPath);
                }
            }
        }
        
        await traverse(dirPath);
        return files;
    }
    
    getDescription(toolUse: ToolUse): string {
        return `[list_files: ${toolUse.params.path || 'current directory'}]`;
    }
}


