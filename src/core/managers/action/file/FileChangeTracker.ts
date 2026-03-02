/**
 * 파일 변경 추적 및 검증 시스템
 * 파일 변경 전후 상태 추적, 타임라인 기록, diff 뷰, 되돌리기 기능 제공
 */

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
    FileChange,
    FileChangeHistory,
    ChangeType,
    FileChangeDiff,
    RevertOptions,
} from './types';

export class FileChangeTracker {
    private static instance: FileChangeTracker;
    private context: vscode.ExtensionContext;
    private trackedFiles: Map<string, FileChangeHistory> = new Map();
    private changeListeners: Map<string, Set<(change: FileChange) => void>> = new Map();

    private constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.loadHistory();
    }

    public static getInstance(context?: vscode.ExtensionContext): FileChangeTracker {
        if (!FileChangeTracker.instance && context) {
            FileChangeTracker.instance = new FileChangeTracker(context);
        }
        return FileChangeTracker.instance!;
    }

    /**
     * 파일 변경사항 추적 시작
     */
    public startTracking(filePath: string): void {
        if (!this.trackedFiles.has(filePath)) {
            this.trackedFiles.set(filePath, {
                filePath,
                changes: [],
                createdAt: Date.now(),
                lastModified: Date.now(),
            });
            this.saveHistory();
            console.log(`[FileChangeTracker] Started tracking: ${filePath}`);
        }
    }

    /**
     * 파일 변경사항 기록
     */
    public async recordChange(
        filePath: string,
        changeType: ChangeType,
        beforeContent?: string,
        afterContent?: string,
        metadata?: FileChange['metadata']
    ): Promise<string> {
        // 추적 시작 (아직 추적 중이 아니면)
        this.startTracking(filePath);

        const history = this.trackedFiles.get(filePath)!;
        const changeId = this.generateChangeId();

        // beforeContent가 없으면 현재 파일 내용 읽기
        let before: string | undefined = beforeContent;
        if (!before && changeType !== 'create') {
            try {
                before = await fs.readFile(filePath, 'utf-8');
            } catch (error) {
                // 파일이 없으면 undefined 유지
                before = undefined;
            }
        }

        // afterContent가 없으면 현재 파일 내용 읽기
        let after: string | undefined = afterContent;
        if (!after && changeType !== 'delete') {
            try {
                after = await fs.readFile(filePath, 'utf-8');
            } catch (error) {
                after = undefined;
            }
        }

        // Diff 생성
        const diff = this.generateDiff(before || '', after || '');

        const change: FileChange = {
            id: changeId,
            filePath,
            changeType,
            timestamp: Date.now(),
            beforeContent: before,
            afterContent: after,
            diff,
            metadata: metadata || {},
        };

        history.changes.push(change);
        history.lastModified = Date.now();
        this.trackedFiles.set(filePath, history);
        this.saveHistory();

        // 리스너에게 알림
        this.notifyListeners(filePath, change);

        // AI가 변경한 파일이면 자동으로 diff 에디터 열기
        if (metadata?.source === 'ai' && before !== undefined && after !== undefined) {
            this.openDiffEditorForChange(filePath, before, after, changeType).catch(err => {
                console.error(`[FileChangeTracker] Failed to open diff editor:`, err);
            });
        }

        console.log(`[FileChangeTracker] Recorded ${changeType} change for ${filePath}: ${changeId}`);
        return changeId;
    }

    /**
     * 파일 변경 이력 조회
     */
    public getChangeHistory(filePath: string): FileChange[] {
        const history = this.trackedFiles.get(filePath);
        return history ? [...history.changes] : [];
    }

    /**
     * 모든 추적 중인 파일 목록
     */
    public getTrackedFiles(): string[] {
        return Array.from(this.trackedFiles.keys());
    }

    /**
     * 특정 시점으로 되돌리기
     */
    public async revertToChange(
        changeId: string,
        options?: RevertOptions
    ): Promise<void> {
        // 변경사항 찾기
        let targetChange: FileChange | undefined;
        let targetFilePath: string | undefined;

        for (const [filePath, history] of this.trackedFiles.entries()) {
            const change = history.changes.find(c => c.id === changeId);
            if (change) {
                targetChange = change;
                targetFilePath = filePath;
                break;
            }
        }

        if (!targetChange || !targetFilePath) {
            throw new Error(`Change not found: ${changeId}`);
        }

        // 백업 생성 (옵션)
        if (options?.createBackup) {
            try {
                const currentContent = await fs.readFile(targetFilePath, 'utf-8');
                await this.recordChange(
                    targetFilePath,
                    'modify',
                    currentContent,
                    targetChange.afterContent,
                    {
                        ...targetChange.metadata,
                        message: `Revert backup for ${changeId}`,
                        source: 'system',
                    }
                );
            } catch (error) {
                console.warn(`[FileChangeTracker] Failed to create backup:`, error);
            }
        }

        // 파일 내용 복원
        if (targetChange.changeType === 'delete') {
            // 삭제된 파일은 복원할 수 없음
            throw new Error('Cannot revert deleted file');
        }

        const contentToRestore = targetChange.beforeContent || targetChange.afterContent;
        if (!contentToRestore) {
            throw new Error('No content available to restore');
        }

        // 파일 복원
        await fs.writeFile(targetFilePath, contentToRestore, 'utf-8');

        // 되돌리기 변경사항 기록
        const currentContent = await fs.readFile(targetFilePath, 'utf-8').catch(() => '');
        await this.recordChange(
            targetFilePath,
            'modify',
            currentContent,
            contentToRestore,
            {
                message: `Reverted to change ${changeId}`,
                source: 'system',
            }
        );

        console.log(`[FileChangeTracker] Reverted ${targetFilePath} to change ${changeId}`);
    }

    /**
     * 변경사항 diff 정보 가져오기
     */
    public getChangeDiff(changeId: string): FileChangeDiff | null {
        for (const history of this.trackedFiles.values()) {
            const change = history.changes.find(c => c.id === changeId);
            if (change) {
                return this.computeDiff(change);
            }
        }
        return null;
    }

    /**
     * 변경사항 리스너 등록
     */
    public onFileChange(
        filePath: string,
        callback: (change: FileChange) => void
    ): vscode.Disposable {
        if (!this.changeListeners.has(filePath)) {
            this.changeListeners.set(filePath, new Set());
        }
        this.changeListeners.get(filePath)!.add(callback);

        return {
            dispose: () => {
                const listeners = this.changeListeners.get(filePath);
                if (listeners) {
                    listeners.delete(callback);
                    if (listeners.size === 0) {
                        this.changeListeners.delete(filePath);
                    }
                }
            },
        };
    }

    /**
     * 추적 중지
     */
    public stopTracking(filePath: string): void {
        this.trackedFiles.delete(filePath);
        this.changeListeners.delete(filePath);
        this.saveHistory();
        console.log(`[FileChangeTracker] Stopped tracking: ${filePath}`);
    }

    /**
     * 모든 추적 중지
     */
    public clearAllTracking(): void {
        this.trackedFiles.clear();
        this.changeListeners.clear();
        this.saveHistory();
        console.log('[FileChangeTracker] Cleared all tracking');
    }

    // ==================== Private 메서드 ====================

    /**
     * Diff 생성 (간단한 텍스트 기반)
     */
    private generateDiff(before: string, after: string): string {
        if (before === after) {
            return '';
        }

        const beforeLines = before.split('\n');
        const afterLines = after.split('\n');
        const diff: string[] = [];

        // 간단한 라인별 비교
        const maxLines = Math.max(beforeLines.length, afterLines.length);
        for (let i = 0; i < maxLines; i++) {
            const beforeLine = beforeLines[i];
            const afterLine = afterLines[i];

            if (beforeLine === undefined) {
                diff.push(`+${i + 1}: ${afterLine}`);
            } else if (afterLine === undefined) {
                diff.push(`-${i + 1}: ${beforeLine}`);
            } else if (beforeLine !== afterLine) {
                diff.push(`-${i + 1}: ${beforeLine}`);
                diff.push(`+${i + 1}: ${afterLine}`);
            }
        }

        return diff.join('\n');
    }

    /**
     * 상세 Diff 정보 계산
     */
    private computeDiff(change: FileChange): FileChangeDiff {
        const beforeLines = (change.beforeContent || '').split('\n');
        const afterLines = (change.afterContent || '').split('\n');
        const addedLines: number[] = [];
        const removedLines: number[] = [];
        const modifiedLines: Array<{ line: number; before: string; after: string }> = [];

        const maxLines = Math.max(beforeLines.length, afterLines.length);
        for (let i = 0; i < maxLines; i++) {
            const beforeLine = beforeLines[i];
            const afterLine = afterLines[i];

            if (beforeLine === undefined && afterLine !== undefined) {
                addedLines.push(i + 1);
            } else if (beforeLine !== undefined && afterLine === undefined) {
                removedLines.push(i + 1);
            } else if (beforeLine !== undefined && afterLine !== undefined && beforeLine !== afterLine) {
                modifiedLines.push({
                    line: i + 1,
                    before: beforeLine,
                    after: afterLine,
                });
            }
        }

        return {
            changeId: change.id,
            filePath: change.filePath,
            beforeContent: change.beforeContent || '',
            afterContent: change.afterContent || '',
            addedLines,
            removedLines,
            modifiedLines,
        };
    }

    /**
     * 리스너에게 알림
     */
    private notifyListeners(filePath: string, change: FileChange): void {
        const listeners = this.changeListeners.get(filePath);
        if (listeners) {
            listeners.forEach(callback => {
                try {
                    callback(change);
                } catch (error) {
                    console.error(`[FileChangeTracker] Listener error:`, error);
                }
            });
        }
    }

    /**
     * 변경 ID 생성
     */
    private generateChangeId(): string {
        return `change_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * 히스토리 저장
     */
    private saveHistory(): void {
        try {
            const historyData = Array.from(this.trackedFiles.entries());
            this.context.globalState.update('fileChangeHistory', historyData);
        } catch (error) {
            console.error('[FileChangeTracker] Failed to save history:', error);
        }
    }

    /**
     * 히스토리 로드
     */
    private loadHistory(): void {
        try {
            const historyData = this.context.globalState.get<[string, FileChangeHistory][]>(
                'fileChangeHistory'
            );

            if (historyData) {
                this.trackedFiles = new Map(historyData);
                console.log(
                    `[FileChangeTracker] Loaded history for ${this.trackedFiles.size} files`
                );
            }
        } catch (error) {
            console.error('[FileChangeTracker] Failed to load history:', error);
        }
    }

    /**
     * 변경사항에 대한 diff 에디터 자동 열기 (AI가 변경한 파일만)
     * InlineDiffManager를 사용하여 인라인 diff 표시
     */
    private async openDiffEditorForChange(
        filePath: string,
        beforeContent: string,
        afterContent: string,
        _changeType: ChangeType
    ): Promise<void> {
        try {
            // 동적 import - 모듈 전체를 가져온 후 named export 접근
            const diffModule = await import('../../diff/InlineDiffManager');
            const inlineDiffManager = diffModule.InlineDiffManager.getInstance();

            await inlineDiffManager.showInlineDiff(
                filePath,
                beforeContent,
                afterContent
            );

            console.log(`[FileChangeTracker] Opened inline diff for ${filePath}`);
        } catch (error) {
            console.error(`[FileChangeTracker] Failed to open inline diff:`, error);
        }
    }
}

