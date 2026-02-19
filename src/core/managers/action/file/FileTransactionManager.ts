/**
 * FileTransactionManager
 * 파일 수정 트랜잭션 관리 및 롤백 기능 제공
 * v9.4.0: 파일 롤백 메커니즘 추가
 */

import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import {
    TransactionFileChange,
    FileTransaction,
    RollbackResult,
} from './types';

/**
 * 트랜잭션 기반 파일 수정 관리자
 */
export class FileTransactionManager {
    private static instance: FileTransactionManager;
    private activeTransaction: FileTransaction | null = null;
    private transactionHistory: FileTransaction[] = [];
    private readonly maxHistorySize = 50;

    private constructor() {}

    public static getInstance(): FileTransactionManager {
        if (!FileTransactionManager.instance) {
            FileTransactionManager.instance = new FileTransactionManager();
        }
        return FileTransactionManager.instance;
    }

    /**
     * 새 트랜잭션 시작
     */
    public beginTransaction(metadata?: FileTransaction['metadata']): string {
        // 기존 활성 트랜잭션이 있으면 자동 커밋
        if (this.activeTransaction) {
            console.log('[FileTransactionManager] Auto-committing previous transaction');
            this.commit();
        }

        const transactionId = this.generateTransactionId();
        this.activeTransaction = {
            id: transactionId,
            startedAt: Date.now(),
            files: [],
            status: 'active',
            metadata,
        };

        console.log(`[FileTransactionManager] Transaction started: ${transactionId}`);
        return transactionId;
    }

    /**
     * 현재 활성 트랜잭션 여부 확인
     */
    public hasActiveTransaction(): boolean {
        return this.activeTransaction !== null && this.activeTransaction.status === 'active';
    }

    /**
     * 현재 트랜잭션 ID 반환
     */
    public getCurrentTransactionId(): string | null {
        return this.activeTransaction?.id || null;
    }

    /**
     * 파일 변경 기록 (트랜잭션에 추가)
     * @param filePath 파일 경로
     * @param afterContent 수정 후 내용 (선택적)
     */
    public async recordFileChange(filePath: string, afterContent?: string): Promise<void> {
        if (!this.activeTransaction) {
            console.warn('[FileTransactionManager] No active transaction. Starting new one.');
            this.beginTransaction();
        }

        // 이미 기록된 파일인지 확인
        const existingEntry = this.activeTransaction!.files.find(f => f.path === filePath);
        if (existingEntry) {
            // 기존 엔트리 업데이트 (연속 수정)
            existingEntry.afterContent = afterContent;
            console.log(`[FileTransactionManager] Updated existing file in transaction: ${filePath}`);
            return;
        }

        // 원본 내용 읽기
        let beforeContent = '';
        try {
            if (fsSync.existsSync(filePath)) {
                beforeContent = await fs.readFile(filePath, 'utf-8');
            }
        } catch (error) {
            console.warn(`[FileTransactionManager] Failed to read original content: ${filePath}`, error);
        }

        this.activeTransaction!.files.push({
            path: filePath,
            beforeContent,
            afterContent,
            status: 'pending',
        });

        console.log(`[FileTransactionManager] Recorded file change: ${filePath}`);
    }

    /**
     * 파일 적용 완료 표시
     */
    public markFileApplied(filePath: string, afterContent?: string): void {
        if (!this.activeTransaction) {
            return;
        }

        const fileEntry = this.activeTransaction.files.find(f => f.path === filePath);
        if (fileEntry) {
            fileEntry.status = 'applied';
            fileEntry.appliedAt = Date.now();
            if (afterContent) {
                fileEntry.afterContent = afterContent;
            }
        }
    }

    /**
     * 트랜잭션 커밋
     */
    public commit(): boolean {
        if (!this.activeTransaction) {
            console.warn('[FileTransactionManager] No active transaction to commit');
            return false;
        }

        this.activeTransaction.status = 'committed';
        this.activeTransaction.endedAt = Date.now();

        // 히스토리에 추가
        this.transactionHistory.unshift(this.activeTransaction);

        // 히스토리 크기 제한
        if (this.transactionHistory.length > this.maxHistorySize) {
            this.transactionHistory = this.transactionHistory.slice(0, this.maxHistorySize);
        }

        console.log(`[FileTransactionManager] Transaction committed: ${this.activeTransaction.id} (${this.activeTransaction.files.length} files)`);
        this.activeTransaction = null;
        return true;
    }

    /**
     * 현재 활성 트랜잭션 롤백
     */
    public async rollback(): Promise<RollbackResult> {
        if (!this.activeTransaction) {
            return {
                success: false,
                rolledBackFiles: [],
                failedFiles: [],
                message: 'No active transaction to rollback',
            };
        }

        return this.rollbackTransaction(this.activeTransaction.id);
    }

    /**
     * 특정 트랜잭션 롤백
     */
    public async rollbackTransaction(transactionId: string): Promise<RollbackResult> {
        // 활성 트랜잭션 또는 히스토리에서 찾기
        let transaction = this.activeTransaction?.id === transactionId
            ? this.activeTransaction
            : this.transactionHistory.find(t => t.id === transactionId);

        if (!transaction) {
            return {
                success: false,
                rolledBackFiles: [],
                failedFiles: [],
                message: `Transaction not found: ${transactionId}`,
            };
        }

        const rolledBackFiles: string[] = [];
        const failedFiles: Array<{ path: string; error: string }> = [];

        // 역순으로 롤백 (마지막 변경부터)
        const filesToRollback = [...transaction.files].reverse();

        for (const fileChange of filesToRollback) {
            if (fileChange.status === 'rolledBack') {
                continue; // 이미 롤백됨
            }

            try {
                if (fileChange.beforeContent === '' && !fsSync.existsSync(fileChange.path)) {
                    // 새로 생성된 파일 삭제
                    if (fsSync.existsSync(fileChange.path)) {
                        await fs.unlink(fileChange.path);
                        console.log(`[FileTransactionManager] Deleted new file: ${fileChange.path}`);
                    }
                } else {
                    // 원본 내용으로 복원
                    const dir = path.dirname(fileChange.path);
                    if (!fsSync.existsSync(dir)) {
                        await fs.mkdir(dir, { recursive: true });
                    }
                    await fs.writeFile(fileChange.path, fileChange.beforeContent, 'utf-8');
                    console.log(`[FileTransactionManager] Restored file: ${fileChange.path}`);
                }

                fileChange.status = 'rolledBack';
                rolledBackFiles.push(fileChange.path);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                failedFiles.push({ path: fileChange.path, error: errorMessage });
                fileChange.status = 'failed';
                console.error(`[FileTransactionManager] Failed to rollback: ${fileChange.path}`, error);
            }
        }

        // 트랜잭션 상태 업데이트
        transaction.status = failedFiles.length > 0 ? 'failed' : 'rolledBack';
        transaction.endedAt = Date.now();

        // 활성 트랜잭션이었으면 히스토리로 이동
        if (this.activeTransaction?.id === transactionId) {
            this.transactionHistory.unshift(this.activeTransaction);
            this.activeTransaction = null;
        }

        const success = failedFiles.length === 0 && rolledBackFiles.length > 0;
        return {
            success,
            rolledBackFiles,
            failedFiles,
            message: success
                ? `Successfully rolled back ${rolledBackFiles.length} file(s)`
                : failedFiles.length > 0
                    ? `Partial rollback: ${rolledBackFiles.length} succeeded, ${failedFiles.length} failed`
                    : 'No files to rollback',
        };
    }

    /**
     * 마지막 커밋된 트랜잭션 롤백
     */
    public async rollbackLastCommitted(): Promise<RollbackResult> {
        const lastCommitted = this.transactionHistory.find(t => t.status === 'committed');
        if (!lastCommitted) {
            return {
                success: false,
                rolledBackFiles: [],
                failedFiles: [],
                message: 'No committed transaction to rollback',
            };
        }

        return this.rollbackTransaction(lastCommitted.id);
    }

    /**
     * 특정 파일의 변경 롤백 (트랜잭션 내)
     */
    public async rollbackFile(filePath: string): Promise<RollbackResult> {
        // 활성 트랜잭션에서 찾기
        let fileChange = this.activeTransaction?.files.find(f => f.path === filePath);
        let transaction = this.activeTransaction;

        // 없으면 히스토리에서 최근 변경 찾기
        if (!fileChange) {
            for (const t of this.transactionHistory) {
                const found = t.files.find(f => f.path === filePath && f.status !== 'rolledBack');
                if (found) {
                    fileChange = found;
                    transaction = t;
                    break;
                }
            }
        }

        if (!fileChange || !transaction) {
            return {
                success: false,
                rolledBackFiles: [],
                failedFiles: [],
                message: `No change found for file: ${filePath}`,
            };
        }

        try {
            if (fileChange.beforeContent === '' && !fsSync.existsSync(fileChange.path)) {
                // 새로 생성된 파일 삭제
                if (fsSync.existsSync(fileChange.path)) {
                    await fs.unlink(fileChange.path);
                }
            } else {
                // 원본 내용으로 복원
                await fs.writeFile(fileChange.path, fileChange.beforeContent, 'utf-8');
            }

            fileChange.status = 'rolledBack';
            console.log(`[FileTransactionManager] Rolled back file: ${filePath}`);

            return {
                success: true,
                rolledBackFiles: [filePath],
                failedFiles: [],
                message: `Successfully rolled back: ${filePath}`,
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
                success: false,
                rolledBackFiles: [],
                failedFiles: [{ path: filePath, error: errorMessage }],
                message: `Failed to rollback: ${filePath}`,
            };
        }
    }

    /**
     * 트랜잭션 히스토리 조회
     */
    public getTransactionHistory(): FileTransaction[] {
        return [...this.transactionHistory];
    }

    /**
     * 현재 트랜잭션의 변경된 파일 목록
     */
    public getCurrentTransactionFiles(): TransactionFileChange[] {
        return this.activeTransaction?.files || [];
    }

    /**
     * 트랜잭션 취소 (커밋 없이 종료)
     */
    public discardTransaction(): void {
        if (this.activeTransaction) {
            console.log(`[FileTransactionManager] Transaction discarded: ${this.activeTransaction.id}`);
            this.activeTransaction = null;
        }
    }

    /**
     * 히스토리 초기화
     */
    public clearHistory(): void {
        this.transactionHistory = [];
        console.log('[FileTransactionManager] History cleared');
    }

    private generateTransactionId(): string {
        return `txn_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }
}
