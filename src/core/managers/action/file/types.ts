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

/**
 * 트랜잭션 파일 변경 정보 (FileTransactionManager에서 사용)
 * v9.4.0: 파일 롤백 메커니즘
 */
export interface TransactionFileChange {
    path: string;
    beforeContent: string;
    afterContent?: string;
    status: 'pending' | 'applied' | 'failed' | 'rolledBack';
    appliedAt?: number;
}

/**
 * 파일 트랜잭션
 * v9.4.0: 파일 롤백 메커니즘
 */
export interface FileTransaction {
    id: string;
    startedAt: number;
    endedAt?: number;
    files: TransactionFileChange[];
    status: 'active' | 'committed' | 'rolledBack' | 'failed';
    metadata?: {
        userQuery?: string;
        planItemId?: string;
        source?: string;
    };
}

/**
 * 롤백 결과
 * v9.4.0: 파일 롤백 메커니즘
 */
export interface RollbackResult {
    success: boolean;
    rolledBackFiles: string[];
    failedFiles: Array<{ path: string; error: string }>;
    message: string;
}

