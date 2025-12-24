/**
 * Update File Tool Handler
 * 파일 수정 툴 핸들러 (부분 수정 지원)
 */

import { IToolHandler, ToolExecutionContext } from '../IToolHandler';
import { ToolUse, ToolResponse, Tool } from '../types';
import { fixModelHtmlEscaping } from '../../../utils/string';
import * as fs from 'fs/promises';
import * as path from 'path';

export class UpdateFileToolHandler implements IToolHandler {
    readonly name = Tool.UPDATE_FILE;
    
    async execute(toolUse: ToolUse, context: ToolExecutionContext): Promise<ToolResponse> {
        const filePath = toolUse.params.path;
        const diff = toolUse.params.diff;
        
        if (!filePath || !diff) {
            return {
                success: false,
                message: 'Path and diff parameters are required',
                error: { code: 'MISSING_PARAM', message: 'path and diff are required' }
            };
        }
        
        // HTML 엔티티 처리 (AI 모델이 잘못 이스케이프한 경우 수정)
        const cleanedDiff = fixModelHtmlEscaping(diff);
        
        // SEARCH/REPLACE 블록 파싱
        const replacements = this.parseDiff(cleanedDiff);
        if (replacements.length === 0) {
            return {
                success: false,
                message: 'No valid SEARCH/REPLACE blocks found in diff',
                error: { code: 'INVALID_DIFF', message: 'Diff must contain SEARCH/REPLACE blocks' }
            };
        }
        
        // 파일 읽기
        const absolutePath = path.isAbsolute(filePath)
            ? filePath
            : path.join(context.projectRoot, filePath);
        
        let fileContent = '';
        try {
            fileContent = await fs.readFile(absolutePath, 'utf8');
        } catch (error) {
            return {
                success: false,
                message: `File not found: ${filePath}`,
                error: { 
                    code: 'FILE_NOT_FOUND', 
                    message: error instanceof Error ? error.message : String(error)
                }
            };
        }
        
        // 각 REPLACE 블록 적용
        let newContent = fileContent;
        for (const replacement of replacements) {
            if (newContent.includes(replacement.search)) {
                newContent = newContent.replace(replacement.search, replacement.replace);
            } else {
                return {
                    success: false,
                    message: `Search pattern not found in file: ${filePath}`,
                    error: { code: 'PATTERN_NOT_FOUND', message: 'Search block not found' }
                };
            }
        }
        
        // 파일 쓰기
        await fs.writeFile(absolutePath, newContent, 'utf8');
        
        return {
            success: true,
            message: `File ${filePath} updated successfully`,
            data: { filePath, changes: replacements.length },
            filePath: filePath,
            fileContent: newContent
        };
    }
    
    private parseDiff(diff: string): Array<{ search: string; replace: string }> {
        const replacements: Array<{ search: string; replace: string }> = [];
        
        // SEARCH/REPLACE 블록 파싱
        // 형식: ------- SEARCH\n[content]\n=======\n[new content]\n------- REPLACE
        const blockPattern = /-------\s*SEARCH\s*\n([\s\S]*?)\n=======\s*\n([\s\S]*?)\n-------\s*REPLACE/g;
        let match;
        
        while ((match = blockPattern.exec(diff)) !== null) {
            replacements.push({
                search: match[1].trim(),
                replace: match[2].trim()
            });
        }
        
        return replacements;
    }
    
    getDescription(toolUse: ToolUse): string {
        return `[update_file for '${toolUse.params.path}']`;
    }
}


