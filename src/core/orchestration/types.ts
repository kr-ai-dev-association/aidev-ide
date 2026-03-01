/**
 * Orchestration Types
 * 오케스트레이션 시스템의 공통 타입 정의
 *
 * Phase 1: 도구 병렬 실행 (ToolExecutor)
 * Phase 3: TaskSplitter → SubAgentLoop[] → ResultMerger
 */

// ─── Constants ──────────────────────────────────────────

/** thinking 태그를 제거하는 정규식 (LLM 응답에서 실제 콘텐츠만 추출) */
export const THINKING_TAG_REGEX = /<think>[\s\S]*?<\/think>/g;

/** 응답 요약 시 최대 길이 */
export const SUMMARY_MAX_LENGTH = 500;

// ─── Tool Permission ─────────────────────────────────────

export type ToolPermission = 'read-only' | 'read-only-with-commands' | 'full';

// ─── SubTask (TaskSplitter 출력) ─────────────────────────

export interface SubTask {
    id: string;
    title: string;
    description: string;
    dependencies: string[];
    toolPermission: ToolPermission;
}

// ─── TaskSplitter Result ─────────────────────────────────

export interface TaskSplitResult {
    shouldSplit: boolean;
    subtasks: SubTask[];
    reasoning: string;
}

// ─── Agent Loop Result (SubAgentLoop 출력) ────────────

export interface AgentLoopResult {
    subtaskId: string;
    success: boolean;
    response: string;
    createdFiles: string[];
    modifiedFiles: string[];
    errors: string[];
    turnCount: number;
    tokenEstimate: number;
    executionTime: number;
}

// ─── File Change (채팅 패널 표시용) ──────────────────────

export interface FileChange {
    path: string;
    action: 'created' | 'updated' | 'removed';
    content?: string;
}

// ─── Aggregated Result (ResultMerger 출력) ───────────────

export interface AggregatedResult {
    summary: string;
    createdFiles: string[];
    modifiedFiles: string[];
    fileChanges: FileChange[];
    errors: string[];
    totalTokens: number;
    totalTime: number;
    agentCount: number;
}

// ─── Agent Loop Callbacks (UI 연동용) ───────────────────

import { ToolUse, ToolResponse } from '../tools/types';

export interface AgentLoopCallbacks {
    onToolStart?: (toolUse: ToolUse, index: number) => void;
    onToolComplete?: (toolUse: ToolUse, result: ToolResponse, index: number) => void;
    onThinking?: (thinkingText: string) => void;
}

// ─── Parallel Execution Options ──────────────────────────

export interface ParallelOptions {
    maxConcurrency: number;
    toolPermission: ToolPermission;
}
