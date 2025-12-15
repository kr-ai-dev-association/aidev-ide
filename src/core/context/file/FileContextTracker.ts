/**
 * FileContextTracker
 * - 파일 변경을 추적하고, 컨텍스트에 포함된 파일들의 안정적인 상태를 보장하기 위한 유틸리티
 *
 * 기능:
 *  - trackFile(filePath): 특정 파일의 변경을 추적 시작
 *  - onFileChanged(cb): 파일 변경 이벤트 구독
 *  - getTrackedFiles(): 현재 추적 중인 파일 목록 조회
 *  - waitForFileStability(filePath, timeout?): 파일 크기/mtime이 일정 시간 동안 변하지 않을 때까지 대기
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export type FileChangeType = 'create' | 'change' | 'delete';

interface TrackedFileInfo {
    watcher: vscode.FileSystemWatcher;
    lastChangeTime: number;
}

export class FileContextTracker {
    private static instance: FileContextTracker;

    /** 추적 중인 파일 맵 (absolute path -> watcher/상태) */
    private trackedFiles: Map<string, TrackedFileInfo> = new Map();

    /** 외부에서 등록한 변경 콜백 */
    private changeListeners: Set<(filePath: string, changeType: FileChangeType) => void> = new Set();

    private constructor(private readonly context?: vscode.ExtensionContext) { }

    public static getInstance(context?: vscode.ExtensionContext): FileContextTracker {
        if (!FileContextTracker.instance) {
            FileContextTracker.instance = new FileContextTracker(context);
        }
        return FileContextTracker.instance;
    }

    /**
     * 파일 추적 시작
     * - 이미 추적 중인 파일이면 무시
     */
    public trackFile(filePath: string): void {
        try {
            const absPath = path.resolve(filePath);
            if (this.trackedFiles.has(absPath)) {
                return;
            }

            const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(absPath));
            const basePath = folder ? folder.uri.fsPath : path.dirname(absPath);
            const relPattern = path.relative(basePath, absPath).replace(/\\/g, '/');

            const pattern = new vscode.RelativePattern(basePath, relPattern || path.basename(absPath));
            const watcher = vscode.workspace.createFileSystemWatcher(pattern);

            const info: TrackedFileInfo = {
                watcher,
                lastChangeTime: Date.now()
            };

            watcher.onDidCreate(uri => {
                if (uri.fsPath === absPath) {
                    info.lastChangeTime = Date.now();
                    this.emitChange(absPath, 'create');
                }
            }, null, this.context?.subscriptions);

            watcher.onDidChange(uri => {
                if (uri.fsPath === absPath) {
                    info.lastChangeTime = Date.now();
                    this.emitChange(absPath, 'change');
                }
            }, null, this.context?.subscriptions);

            watcher.onDidDelete(uri => {
                if (uri.fsPath === absPath) {
                    info.lastChangeTime = Date.now();
                    this.emitChange(absPath, 'delete');
                    // 삭제된 파일은 더 이상 추적할 필요 없음
                    this.untrackFile(absPath);
                }
            }, null, this.context?.subscriptions);

            this.trackedFiles.set(absPath, info);
            console.log('[FileContextTracker] Start tracking file:', absPath);
        } catch (error) {
            console.warn('[FileContextTracker] Failed to track file:', filePath, error);
        }
    }

    /**
     * 파일 추적 해제
     */
    public untrackFile(filePath: string): void {
        const absPath = path.resolve(filePath);
        const info = this.trackedFiles.get(absPath);
        if (info) {
            try {
                info.watcher.dispose();
            } catch {
                // ignore
            }
            this.trackedFiles.delete(absPath);
            console.log('[FileContextTracker] Stop tracking file:', absPath);
        }
    }

    /**
     * 파일 변경 이벤트 구독
     * - 반환된 Disposable을 통해 해제 가능
     */
    public onFileChanged(
        callback: (filePath: string, changeType: FileChangeType) => void
    ): vscode.Disposable {
        this.changeListeners.add(callback);
        return new vscode.Disposable(() => {
            this.changeListeners.delete(callback);
        });
    }

    /**
     * 현재 추적 중인 파일 목록을 반환
     */
    public getTrackedFiles(): string[] {
        return Array.from(this.trackedFiles.keys());
    }

    /**
     * 파일이 "안정" 상태가 될 때까지 대기
     * - 파일 크기/mtime이 일정 기간 동안 변하지 않을 때 resolve
     * - timeout(ms) 내에 안정되지 않으면 마지막 상태 기준으로 resolve (실패는 로그만)
     */
    public async waitForFileStability(
        filePath: string,
        timeout: number = 5000,
        stableDuration: number = 500,
        pollInterval: number = 200
    ): Promise<void> {
        const absPath = path.resolve(filePath);

        return new Promise((resolve) => {
            let lastSize: number | null = null;
            let lastMTimeMs: number | null = null;
            let stableSince = Date.now();
            const start = Date.now();

            const check = () => {
                try {
                    const stats = fs.statSync(absPath);
                    const size = stats.size;
                    const mtimeMs = stats.mtimeMs;

                    if (lastSize === null || lastMTimeMs === null) {
                        lastSize = size;
                        lastMTimeMs = mtimeMs;
                        stableSince = Date.now();
                    } else if (size !== lastSize || mtimeMs !== lastMTimeMs) {
                        // 변경 발생 → 기준 갱신 및 안정 타이머 리셋
                        lastSize = size;
                        lastMTimeMs = mtimeMs;
                        stableSince = Date.now();
                    }

                    const now = Date.now();
                    if (now - stableSince >= stableDuration) {
                        console.log('[FileContextTracker] File is stable:', absPath);
                        clearInterval(interval);
                        resolve();
                        return;
                    }

                    if (now - start >= timeout) {
                        console.warn('[FileContextTracker] waitForFileStability timeout reached for', absPath);
                        clearInterval(interval);
                        resolve();
                    }
                } catch (error) {
                    // 파일이 존재하지 않으면 더 이상 대기할 수 없음 → 종료
                    console.warn('[FileContextTracker] waitForFileStability error:', absPath, error);
                    clearInterval(interval);
                    resolve();
                }
            };

            const interval = setInterval(check, pollInterval);
            // 즉시 한 번 검사
            check();
        });
    }

    /**
     * 모든 추적을 해제
     */
    public dispose(): void {
        for (const [filePath, info] of this.trackedFiles.entries()) {
            try {
                info.watcher.dispose();
            } catch {
                // ignore
            }
            console.log('[FileContextTracker] Disposed watcher for', filePath);
        }
        this.trackedFiles.clear();
        this.changeListeners.clear();
    }

    private emitChange(filePath: string, changeType: FileChangeType): void {
        for (const listener of this.changeListeners) {
            try {
                listener(filePath, changeType);
            } catch (error) {
                console.warn('[FileContextTracker] Error in change listener:', error);
            }
        }
    }
}


