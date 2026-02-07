/**
 * Git Diff Tool Handler
 * git diff로 현재 working changes 조회
 */
import { Tool } from '../types';
import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);
export class GitDiffToolHandler {
    name = Tool.GIT_DIFF;
    getDescription(toolUse) {
        const staged = toolUse.params?.staged === 'true';
        return staged ? 'Git staged 변경사항 조회' : 'Git 변경사항 조회';
    }
    async execute(toolUse, context) {
        const { staged } = toolUse.params;
        const showStaged = staged === 'true';
        try {
            const projectRoot = context.projectRoot;
            // git diff 실행 (staged 또는 working changes)
            const diffCommand = showStaged ? 'git diff --staged' : 'git diff';
            const statusCommand = 'git status --short';
            const [diffResult, statusResult] = await Promise.all([
                execAsync(diffCommand, { cwd: projectRoot, maxBuffer: 1024 * 1024 }),
                execAsync(statusCommand, { cwd: projectRoot, maxBuffer: 1024 * 1024 })
            ]);
            const diff = diffResult.stdout.trim();
            const status = statusResult.stdout.trim();
            if (!diff && !status) {
                return {
                    success: true,
                    message: 'No changes detected in the repository.'
                };
            }
            let result = '';
            if (status) {
                result += '=== Git Status ===\n';
                result += status + '\n\n';
            }
            if (diff) {
                result += `=== Git Diff ${showStaged ? '(Staged)' : '(Working)'} ===\n`;
                // diff가 너무 길면 자르기
                if (diff.length > 10000) {
                    result += diff.substring(0, 10000);
                    result += '\n\n... [truncated, diff too long] ...';
                }
                else {
                    result += diff;
                }
            }
            return {
                success: true,
                message: result
            };
        }
        catch (error) {
            // git이 설치되지 않았거나 git repo가 아닌 경우
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (errorMessage.includes('not a git repository')) {
                return {
                    success: false,
                    message: 'This directory is not a git repository.',
                    error: { code: 'NOT_GIT_REPO', message: errorMessage }
                };
            }
            return {
                success: false,
                message: `Failed to get git diff: ${errorMessage}`,
                error: { code: 'GIT_ERROR', message: errorMessage }
            };
        }
    }
}
//# sourceMappingURL=GitDiffToolHandler.js.map