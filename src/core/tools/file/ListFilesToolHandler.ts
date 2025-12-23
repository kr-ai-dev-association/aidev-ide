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
    
    async execute(toolUse: ToolUse, context: ToolExecutionContext): Promise<ToolResponse> {
        const dirPath = toolUse.params.path || context.projectRoot;
        const recursive = toolUse.params.recursive === 'true';
        
        const absolutePath = path.isAbsolute(dirPath)
            ? dirPath
            : path.join(context.projectRoot, dirPath);
        
        try {
            const files = await this.listFiles(absolutePath, recursive);
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
    
    private async listFiles(dirPath: string, recursive: boolean): Promise<string[]> {
        const files: string[] = [];
        
        async function traverse(currentPath: string) {
            const entries = await fs.readdir(currentPath, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(currentPath, entry.name);
                
                if (entry.isFile()) {
                    files.push(fullPath);
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


