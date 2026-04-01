/**
 * ResultMerger
 * Module for merging results from multiple SubAgentLoops
 *
 * Consolidates results from parallel-executed agents into a single AggregatedResult
 * - Aggregate file changes (deduplicated)
 * - Collect errors
 * - Aggregate tokens/time (time uses max since parallel)
 */

import { AgentLoopResult, AggregatedResult, THINKING_TAG_REGEX, SUMMARY_MAX_LENGTH } from './types';

export class ResultMerger {
    static merge(results: AgentLoopResult[]): AggregatedResult {
        const allCreated: string[] = [];
        const allModified: string[] = [];
        const allDeleted: string[] = [];
        const allErrors: string[] = [];
        const allWarnings: string[] = [];
        let totalTokens = 0;
        let maxTime = 0;
        const summaries: string[] = [];

        for (const result of results) {
            allCreated.push(...result.createdFiles);
            allModified.push(...result.modifiedFiles);
            allDeleted.push(...result.deletedFiles);
            totalTokens += result.tokenEstimate;
            maxTime = Math.max(maxTime, result.executionTime);

            if (result.errors.length > 0) {
                allErrors.push(...result.errors.map(e => `[${result.subtaskId}] ${e}`));
            }
            if (result.warnings?.length > 0) {
                allWarnings.push(...result.warnings.map(w => `[${result.subtaskId}] ${w}`));
            }

            if (result.response) {
                let cleaned = result.response.replace(THINKING_TAG_REGEX, '').trim();
                // Remove code blocks (file content is already displayed in panel)
                cleaned = cleaned.replace(/```[\s\S]*?```/g, '').trim();
                // Remove <file_content>...</file_content> tags
                cleaned = cleaned.replace(/<file_content>[\s\S]*?<\/file_content>/g, '').trim();
                // Remove JSON tool call patterns (unparsed native tool_calls -- prevent sanitizeLastResort false positives)
                // e.g., {"tool":"unknown_name","pattern":"..."} remaining in lastResponse
                cleaned = cleaned.split('\n')
                    .filter(line => !/"tool"\s*:/.test(line))
                    .join('\n')
                    .trim();
                // Clean up consecutive blank lines
                cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();
                if (cleaned) {
                    const label = result.subtaskId.replace(/^task-/, '에이전트 ');
                    summaries.push(`### ${label}\n${cleaned.substring(0, SUMMARY_MAX_LENGTH)}`);
                }
            }
        }

        const createdFiles = [...new Set(allCreated)];
        const modifiedFiles = [...new Set(allModified)];
        const deletedFiles = [...new Set(allDeleted)];

        return {
            summary: summaries.join('\n\n'),
            createdFiles,
            modifiedFiles,
            deletedFiles,
            fileChanges: [
                ...createdFiles.map(p => ({ path: p, action: 'created' as const })),
                ...modifiedFiles.map(p => ({ path: p, action: 'updated' as const })),
                ...deletedFiles.map(p => ({ path: p, action: 'removed' as const })),
            ],
            errors: allErrors,
            warnings: allWarnings,
            totalTokens,
            totalTime: maxTime,
            agentCount: results.length,
        };
    }
}
