/**
 * Context History Manager 타입 정의
 * 컨텍스트 히스토리 관리 및 자동 요약 관련 타입들
 */

import { ConversationEntry } from '../../state/types';
import { ContextData } from '../types';

/**
 * 컨텍스트 업데이트 타입
 */
export type ContextUpdateType = 'add' | 'remove' | 'modify';

/**
 * 컨텍스트 업데이트
 */
export interface ContextUpdate {
    id: string;
    messageIndex: number;
    timestamp: number;
    updateType: ContextUpdateType;
    contextType: string;
    content: string;
    metadata?: Record<string, any>;
}

/**
 * 컨텍스트 체크포인트
 */
export interface ContextCheckpoint {
    id: string;
    messageIndex: number;
    timestamp: number;
    contextData: ContextData;
    updates: ContextUpdate[];
}

/**
 * 컨텍스트 크기 정보
 */
export interface ContextSizeInfo {
    currentSize: number;
    maxSize: number;
    isExceeded: boolean;
    tokenCount?: number;
    characterCount?: number;
}

/**
 * 대화 요약 옵션
 */
export interface SummarizationOptions {
    includeTechnicalDetails: boolean;
    includeCodeSnippets: boolean;
    includeFileChanges: boolean;
    maxSummaryLength?: number;
}

/**
 * 대화 요약 (Context History Manager 전용)
 */
export interface ContextConversationSummary {
    id: string;
    createdAt: number;
    messageRange: {
        startIndex: number;
        endIndex: number;
    };
    primaryRequest: string;
    keyConcepts: string[];
    filesModified: string[];
    filesCreated: string[];
    filesDeleted: string[];
    pendingTasks: string[];
    problemSolving: string[];
    taskEvolution: string[];
    currentWork: string;
    nextStep: string;
    requiredFiles: string[];
    technicalDetails?: string;
    codeSnippets?: string[];
}

/**
 * 요약된 세션 재개 프롬프트
 */
export interface ContinuationPrompt {
    summary: ContextConversationSummary;
    prompt: string;
    contextHint: string;
}

/**
 * 작업 진행 상태
 */
export interface TaskProgress {
    completed: number;
    total: number;
    currentTask?: string;
    errors?: string[];
}

/**
 * 대화 히스토리 삭제 범위
 * [startIndex, endIndex] - 삭제된 메시지 범위 (inclusive)
 */
export type ConversationHistoryDeletedRange = [number, number] | undefined;

/**
 * 메시지 히스토리 인덱스 정보
 */
export interface MessageHistoryIndex {
    conversationHistoryIndex?: number; // API 히스토리에서의 인덱스
    conversationHistoryDeletedRange?: ConversationHistoryDeletedRange; // 삭제된 범위
}

