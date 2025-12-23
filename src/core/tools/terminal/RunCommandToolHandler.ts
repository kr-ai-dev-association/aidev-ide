/**
 * Run Command Tool Handler
 * 터미널 명령어 실행 툴 핸들러
 */

import { IToolHandler, ToolExecutionContext } from '../IToolHandler';
import { ToolUse, ToolResponse, Tool } from '../types';

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
        
        // 기존 ExecutionManager 사용
        const result = await context.executionManager.executeCommand(command, {
            cwd: context.projectRoot,
            timeout: toolUse.params.timeout ? parseInt(toolUse.params.timeout) : undefined
        });
        
        return {
            success: result.success,
            message: result.success 
                ? `Command executed: ${command}` 
                : `Command failed: ${command}`,
            data: { 
                output: result.stdout, 
                error: result.stderr,
                exitCode: result.exitCode 
            }
        };
    }
    
    getDescription(toolUse: ToolUse): string {
        return `[run_command: ${toolUse.params.command}]`;
    }
}


