/**
 * ResultMerger
 * 여러 SubAgentLoop의 결과를 병합하는 모듈
 *
 * 병렬 실행된 에이전트들의 결과를 하나의 AggregatedResult로 통합
 * - 파일 변경 사항 합산 (중복 제거)
 * - 에러 수집
 * - 토큰/시간 집계 (시간은 병렬이므로 max)
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
                // 코드 블록 제거 (파일 내용은 패널에 이미 표시됨)
                cleaned = cleaned.replace(/```[\s\S]*?```/g, '').trim();
                // <file_content>...</file_content> 태그 제거
                cleaned = cleaned.replace(/<file_content>[\s\S]*?<\/file_content>/g, '').trim();
                // JSON tool call 패턴 제거 (native tool_calls 미파싱 케이스 — sanitizeLastResort 오탐 방지)
                // 예: {"tool":"unknown_name","pattern":"..."} 가 lastResponse에 남아있는 경우
                cleaned = cleaned.split('\n')
                    .filter(line => !/"tool"\s*:/.test(line))
                    .join('\n')
                    .trim();
                // 연속 빈 줄 정리
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
