/**
 * Read File Tool Handler
 * 파일 읽기 툴 핸들러
 */

import { IToolHandler, ToolExecutionContext } from '../IToolHandler';
import { ToolUse, ToolResponse, Tool } from '../types';
import * as fs from 'fs/promises';
import * as path from 'path';

export class ReadFileToolHandler implements IToolHandler {
    readonly name = Tool.READ_FILE;
    
    async execute(toolUse: ToolUse, context: ToolExecutionContext): Promise<ToolResponse> {
        const filePath = toolUse.params.path;
        
        if (!filePath) {
            return {
                success: false,
                message: 'Path parameter is required',
                error: { code: 'MISSING_PARAM', message: 'path is required' }
            };
        }
        
        const absolutePath = path.isAbsolute(filePath)
            ? filePath
            : path.join(context.projectRoot, filePath);
        
        try {
            const content = await fs.readFile(absolutePath, 'utf8');
            return {
                success: true,
                message: `File read: ${filePath}`,
                data: { path: filePath, content }
            };
        } catch (error) {
            return {
                success: false,
                message: `Failed to read file: ${filePath}`,
                error: { 
                    code: 'READ_ERROR', 
                    message: error instanceof Error ? error.message : String(error)
                }
            };
        }
    }
    
    getDescription(toolUse: ToolUse): string {
        return `[read_file: ${toolUse.params.path}]`;
    }
}


