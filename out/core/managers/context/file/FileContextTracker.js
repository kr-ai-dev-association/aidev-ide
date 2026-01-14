"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileContextTracker = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class FileContextTracker {
    context;
    static instance;
    /** 추적 중인 파일 맵 (absolute path -> watcher/상태) */
    trackedFiles = new Map();
    /** 외부에서 등록한 변경 콜백 */
    changeListeners = new Set();
    constructor(context) {
        this.context = context;
    }
    static getInstance(context) {
        if (!FileContextTracker.instance) {
            FileContextTracker.instance = new FileContextTracker(context);
        }
        return FileContextTracker.instance;
    }
    /**
     * 파일 추적 시작
     * - 이미 추적 중인 파일이면 무시
     */
    trackFile(filePath) {
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
            const info = {
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
        }
        catch (error) {
            console.warn('[FileContextTracker] Failed to track file:', filePath, error);
        }
    }
    /**
     * 파일 추적 해제
     */
    untrackFile(filePath) {
        const absPath = path.resolve(filePath);
        const info = this.trackedFiles.get(absPath);
        if (info) {
            try {
                info.watcher.dispose();
            }
            catch {
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
    onFileChanged(callback) {
        this.changeListeners.add(callback);
        return new vscode.Disposable(() => {
            this.changeListeners.delete(callback);
        });
    }
    /**
     * 현재 추적 중인 파일 목록을 반환
     */
    getTrackedFiles() {
        return Array.from(this.trackedFiles.keys());
    }
    /**
     * 파일이 "안정" 상태가 될 때까지 대기
     * - 파일 크기/mtime이 일정 기간 동안 변하지 않을 때 resolve
     * - ✅ pending change가 있으면 unstable로 판정
     * - timeout(ms) 내에 안정되지 않으면 마지막 상태 기준으로 resolve (실패는 로그만)
     */
    async waitForFileStability(filePath, timeout = 5000, stableDuration = 500, pollInterval = 200) {
        // ✅ pending change 확인
        try {
            const { InlineDiffManager } = await import('../../diff/InlineDiffManager');
            const inlineDiffManager = InlineDiffManager.getInstance();
            const changes = inlineDiffManager.getChanges(filePath);
            const pendingChanges = changes?.filter(c => c.status === 'pending') || [];
            if (pendingChanges.length > 0) {
                console.log(`[FileContextTracker] File has ${pendingChanges.length} pending changes, marking as unstable: ${filePath}`);
                // pending change가 있으면 unstable로 판정 (즉시 resolve하되 unstable 상태)
                return;
            }
        }
        catch (error) {
            // InlineDiffManager를 사용할 수 없으면 무시하고 계속 진행
        }
        const absPath = path.resolve(filePath);
        return new Promise((resolve) => {
            let lastSize = null;
            let lastMTimeMs = null;
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
                    }
                    else if (size !== lastSize || mtimeMs !== lastMTimeMs) {
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
                }
                catch (error) {
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
    dispose() {
        for (const [filePath, info] of this.trackedFiles.entries()) {
            try {
                info.watcher.dispose();
            }
            catch {
                // ignore
            }
            console.log('[FileContextTracker] Disposed watcher for', filePath);
        }
        this.trackedFiles.clear();
        this.changeListeners.clear();
    }
    emitChange(filePath, changeType) {
        for (const listener of this.changeListeners) {
            try {
                listener(filePath, changeType);
            }
            catch (error) {
                console.warn('[FileContextTracker] Error in change listener:', error);
            }
        }
    }
}
exports.FileContextTracker = FileContextTracker;
//# sourceMappingURL=FileContextTracker.js.map