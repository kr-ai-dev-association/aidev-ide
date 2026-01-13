/**
 * 파일 변경 추적 관련 타입 정의
 */

/**
 * 변경 타입
 */
export type ChangeType = 'create' | 'modify' | 'delete';

/**
 * 파일 변경 이력 항목
 */
export interface FileChange {
    id: string;
    filePath: string;
    changeType: ChangeType;
    timestamp: number;
    beforeContent?: string;
    afterContent?: string;
    diff?: string;
    metadata?: {
        taskId?: string;
        message?: string;
        userId?: string;
        source?: 'ai' | 'user' | 'system';
    };
}

/**
 * 파일 변경 이력
 */
export interface FileChangeHistory {
    filePath: string;
    changes: FileChange[];
    createdAt: number;
    lastModified: number;
}

/**
 * 변경사항 diff 정보
 */
export interface FileChangeDiff {
    changeId: string;
    filePath: string;
    beforeContent: string;
    afterContent: string;
    addedLines: number[];
    removedLines: number[];
    modifiedLines: Array<{
        line: number;
        before: string;
        after: string;
    }>;
}

/**
 * 되돌리기 옵션
 */
export interface RevertOptions {
    createBackup?: boolean;
    preserveMetadata?: boolean;
}

