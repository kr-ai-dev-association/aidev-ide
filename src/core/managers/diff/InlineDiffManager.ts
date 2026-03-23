/**
 * Inline Diff Manager
 * 커서 IDE 방식의 인라인 diff 표시 및 관리
 * 
 * 아키텍처 규칙:
 * - 문서에는 수정 후 코드만 존재
 * - 삭제된 코드는 decoration.before로만 표시 (선택/편집 불가)
 * - TextEditor 캐싱 금지 (항상 현재 에디터 사용)
 * - 체크포인트: AI 요청 단위로 beforeContent 저장 (Reject 기준점)
 * - VS Code Undo와 AI Checkpoint는 절대 섞이지 않음
 * - Accept/Reject는 change 단위로 처리
 */

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as diff from 'diff';
import * as path from 'path';
import { UsageMetricsManager } from '../state/UsageMetricsManager';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 직렬화 타입 (globalState 영구 저장용)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
interface SerializableRange {
    start: { line: number; character: number };
    end: { line: number; character: number };
}
interface SerializableInlineChange extends Omit<InlineChange, 'range'> {
    range: SerializableRange;
}
interface SerializableCheckpoint extends Omit<AICheckpoint, 'changes'> {
    changes: SerializableInlineChange[];
}
interface SerializableTurnCheckpoint {
    id: string;
    conversationTurnId: string;
    fileSnapshots: [string, string][];
    createdAt: number;
}
interface PersistedDiffState {
    version: 2 | 3;
    savedAt: number;
    pendingChanges: [string, SerializableInlineChange[]][];
    checkpoints: [string, SerializableCheckpoint][];
    shadow: [string, string][];
    disk: [string, string][];
    fileHashes: [string, string][];
    turnCheckpointStack?: SerializableTurnCheckpoint[]; // v3
}

/**
 * InlineChange: 변경 단위 모델
 * - Accept/Reject는 change 단위로 처리
 * - status로 각 change의 상태 관리
 */
/**
 * Change 단위 상태
 * - pending: AI 제안, 아직 결정 안 됨
 * - accepted: 사용자가 승인
 * - rejected: 사용자가 거부
 * - dirty: 사용자가 직접 수정해서 무효화
 */
export type ChangeStatus = 'pending' | 'accepted' | 'rejected' | 'dirty';

/**
 * InlineChange: 변경 단위 모델
 * - AI 변경은 "코드를 바꾸는 행위"가 아니라 "사용자에게 제안되는 상태 머신"
 * - range는 "수정 후 코드 기준" (decoration용)
 * - offset은 "절대 문자 위치" (overlap/reject용, 훨씬 정확함)
 * 
 */
export interface InlineChange {
    id: string;
    filePath: string; // fileUri (하위 호환성)
    range: vscode.Range; // ⚠️ 수정 후 코드 기준 range (decoration용)
    startOffset: number; // 절대 문자 위치 (overlap/reject용, 생성 시점 캡쳐)
    endOffset: number; // 절대 문자 위치 (overlap/reject용, 생성 시점 캡쳐)
    oldText: string; // 수정 전 (Reject 시 이걸만 믿음, 생성 시점 캡쳐)
    newText: string; // 수정 후 (이미 에디터에 반영됨)
    type: 'delete' | 'add' | 'modify';
    line: number; // 신규 코드 기준 라인 번호 (decoration.before 표시 위치)
    status: ChangeStatus; // change 단위 상태
    checkpointId: string; // 체크포인트 연결 (Undo용)
    createdAt: number; // 생성 시점 (timestamp, checkpoint advance 판정용)
    conversationTurnId: string; // LLM 턴 식별자 (턴 단위 Accept/Reject용)
}

/**
 * AI 체크포인트 (AI 요청 단위)
 * - AI 요청 직전 상태(beforeContent) 저장
 * - 변경사항(InlineChange[]) 저장
 * - Reject 시 기준점으로 사용
 * - VS Code Undo와 완전히 분리
 */
export interface AICheckpoint {
    id: string;
    fileUri: string;
    beforeContent: string; // AI 요청 직전 상태 (Reject 기준점)
    changes: InlineChange[]; // AI가 제안한 변경사항
    status: 'pending' | 'accepted' | 'rejected'; // checkpoint 전체 상태
    createdAt: number;
    conversationTurnId: string; // LLM 턴 식별자 (턴 단위 Accept/Reject용)
}

/**
 * Turn Checkpoint (턴 단위 스냅샷)
 * - 각 LLM 턴이 파일을 수정하기 직전 상태를 저장
 * - 스택 구조: oldest-first 순서
 * - "Undo Turn N"은 Turn N 이전 상태로 복원 (이후 턴도 cascade undo)
 * - Cursor, Cline 등 표준 체크포인트 패턴
 */
export interface TurnCheckpoint {
    id: string;
    conversationTurnId: string;
    fileSnapshots: Map<string, string>; // filePath → 이 턴이 수정하기 전 내용
    createdAt: number;
}

export class InlineDiffManager {
    private static instance: InlineDiffManager;
    private pendingChanges: Map<string, InlineChange[]> = new Map(); // filePath -> changes[] (source of truth)
    private originalContents: Map<string, string> = new Map(); // filePath -> originalContent (deprecated, checkpoint 사용)
    private checkpoints: Map<string, AICheckpoint> = new Map(); // filePath -> checkpoint (파일당 활성 체크포인트 1개)
    private documentVersions: Map<string, number> = new Map(); // filePath -> document version (range drift 방지)
    private formatterRunning: Set<string> = new Set(); // filePath -> formatter 실행 중 플래그 (diff 보호용)
    private formatterJustFinished: Set<string> = new Set(); // filePath -> formatter 방금 종료됨 플래그 (다음 document 변경 1회만 무시)
    private lastAppliedChanges: Map<string, InlineChange[]> = new Map(); // filePath -> 마지막으로 적용된 changes (ToolExecutionCoordinator용 캐시)

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ✅ Shadow Document Pattern
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // shadow: 작업 중인 가상 문서 상태 (LLM에게 보여줄 누적 상태)
    // disk: 실제 디스크에 저장된 내용 (Accept 전 상태)
    //
    // 흐름:
    // 1. LLM 요청 시: getContentForEditing() → shadow 반환 (없으면 disk)
    // 2. LLM 응답 적용 시: shadow 업데이트 + decoration 표시
    // 3. Accept 시: disk = shadow, checkpoint 정리
    // 4. Reject 시: shadow = checkpoint.beforeContent (해당 변경 전 상태로 복원)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    private shadow: Map<string, string> = new Map(); // filePath -> 작업 중인 가상 문서 (누적 상태)
    private disk: Map<string, string> = new Map(); // filePath -> 마지막 Accept된 상태 (또는 원본)
    private addedDecoration: vscode.TextEditorDecorationType;
    private deletedDecoration: vscode.TextEditorDecorationType;
    private editorChangeDisposable: vscode.Disposable | undefined;
    private visibleEditorsDisposable: vscode.Disposable | undefined;
    private documentChangeDisposable: vscode.Disposable | undefined;
    private fileSystemWatcher: vscode.FileSystemWatcher | undefined;

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Persistence (globalState 영구 저장)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    private extensionContext: vscode.ExtensionContext | undefined;
    private saveTimer: NodeJS.Timeout | undefined;
    private storedFileHashes: Map<string, string> = new Map();
    private restorationDisposable: vscode.Disposable | undefined;
    // 병렬 에이전트 race condition 방지 — 파일별 Promise-chain 직렬화
    private readonly fileLocks = new Map<string, Promise<void>>();

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Turn Checkpoint Stack (표준 체크포인트)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    private turnCheckpointStack: TurnCheckpoint[] = []; // oldest-first 순서

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 이벤트 (턴 레벨 UI 연동)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    private _onPendingChangedEmitter = new vscode.EventEmitter<void>();
    public readonly onPendingChanged = this._onPendingChangedEmitter.event;
    private documentCache: Map<string, { document: vscode.TextDocument; version: number; timestamp: number }> = new Map(); // Document 캐싱

    private constructor() {
        // 추가된 라인 (초록색)
        this.addedDecoration = vscode.window.createTextEditorDecorationType({
            backgroundColor: new vscode.ThemeColor('diffEditor.insertedLineBackground'),
            isWholeLine: true,
            overviewRulerColor: 'green',
            overviewRulerLane: vscode.OverviewRulerLane.Left,
        });

        // 삭제된 라인 (빨간색 배경 + decoration.before로 oldText 표시)
        this.deletedDecoration = vscode.window.createTextEditorDecorationType({
            backgroundColor: new vscode.ThemeColor('diffEditor.removedLineBackground'),
            isWholeLine: false, // decoration.before 사용 시 false
            overviewRulerColor: 'red',
            overviewRulerLane: vscode.OverviewRulerLane.Left,
        });

        // 에디터 변경 감지하여 decoration 재적용
        this.setupEditorChangeListener();

        // 사용자 편집 감지 (diff 무효화)
        this.setupDocumentChangeListener();

        // 외부 변경 감지 (CLI/formatter/tsc 등)
        this.setupExternalChangeListener();
    }

    /**
     * 에디터 변경 감지 리스너 설정
     */
    private setupEditorChangeListener(): void {
        // 활성 에디터 변경 감지
        this.editorChangeDisposable = vscode.window.onDidChangeActiveTextEditor(async (editor) => {
            if (!editor) return;

            const filePath = editor.document.uri.fsPath;
            const changes = this.pendingChanges.get(filePath);

            if (changes && changes.length > 0) {
                // 에디터가 완전히 로드될 때까지 대기 후 decoration 재적용
                setTimeout(() => {
                    this.refreshDecorations(filePath);
                }, 100);
            }
        });

        // visible editors 변경 감지 (split editor, 탭 전환 등)
        this.visibleEditorsDisposable = vscode.window.onDidChangeVisibleTextEditors((editors) => {
            // 모든 visible editors 중 pending changes가 있는 파일에 decoration 재적용
            for (const editor of editors) {
                const filePath = editor.document.uri.fsPath;
                const changes = this.pendingChanges.get(filePath);

                if (changes && changes.length > 0) {
                    setTimeout(() => {
                        this.refreshDecorations(filePath);
                    }, 100);
                }
            }
        });
    }

    /**
     * 두 Range가 겹치는지 확인
     */
    private rangesOverlap(range1: vscode.Range, range2: vscode.Range): boolean {
        // range1이 range2와 겹치거나 포함하는지 확인
        return range1.start.line <= range2.end.line && range1.end.line >= range2.start.line;
    }

    /**
     * 두 change가 동일한지 확인 (change identity dedupe)
     * 
     */
    private isSameChange(a: InlineChange, b: InlineChange): boolean {
        return (
            a.filePath === b.filePath &&
            a.startOffset === b.startOffset &&
            a.endOffset === b.endOffset &&
            a.oldText === b.oldText &&
            a.newText === b.newText &&
            a.type === b.type
        );
    }

    /**
     * 텍스트 정규화 (의미적 비교용)
     * - whitespace 정규화 (연속 공백 → 단일 공백)
     * - 앞뒤 공백 제거
     * - 빈 줄 제거
     *
     * 🔥 Solution 2: 다른 코드 어시스턴트처럼 indentation 차이를 무시하고 의미적 동일성 판단
     */
    private normalizeTextForComparison(text: string): string {
        return text
            .split('\n')
            .map(line => line.trim())  // 각 줄의 앞뒤 공백 제거 (indentation 무시)
            .filter(line => line.length > 0)  // 빈 줄 제거
            .join('\n')
            .replace(/\s+/g, ' ')  // 연속 whitespace → 단일 공백
            .trim();
    }

    /**
     * 중복 change 확인 (더 강력한 로직)
     * 1. Offset 기반 비교
     * 2. 텍스트 내용 비교 (정확히 일치)
     * 3. 🔥 의미적 텍스트 비교 (whitespace 무시) - Solution 2
     * 4. Range 중복 확인 (90% 이상 겹침)
     *
     * 🔥 Solution 2: 다른 코드 어시스턴트처럼 semantic duplicate 감지
     * 예: "    </div>" vs "      </div>" → 같은 코드로 판단
     */
    private isDuplicateChange(
        newChange: InlineChange,
        existingChanges: InlineChange[],
        document: vscode.TextDocument
    ): boolean {
        for (const existing of existingChanges) {
            // 1. Offset 기반 비교
            if (newChange.startOffset === existing.startOffset &&
                newChange.endOffset === existing.endOffset) {
                return true;
            }

            // 2. 텍스트 내용 비교 (정확히 일치)
            if (newChange.oldText === existing.oldText &&
                newChange.newText === existing.newText) {
                return true;
            }

            // 🔥 3. 의미적 텍스트 비교 (whitespace 무시) - Solution 2
            // 다른 코드 어시스턴트(Cursor, Copilot)처럼 indentation 차이 무시
            const normalizedNewOld = this.normalizeTextForComparison(newChange.oldText);
            const normalizedNewNew = this.normalizeTextForComparison(newChange.newText);
            const normalizedExistingOld = this.normalizeTextForComparison(existing.oldText);
            const normalizedExistingNew = this.normalizeTextForComparison(existing.newText);

            if (normalizedNewOld === normalizedExistingOld &&
                normalizedNewNew === normalizedExistingNew) {
                return true;
            }

            // 🔥 3-1. newText만 의미적으로 같은 경우도 중복으로 간주 (같은 코드 추가 시도)
            if (normalizedNewNew === normalizedExistingNew &&
                normalizedNewNew.length > 10) {  // 너무 짧은 코드는 제외 (false positive 방지)
                return true;
            }

            // 4. Range 중복 확인 (90% 이상 겹침)
            const newRange = this.getCurrentRange(newChange, document);
            const existingRange = this.getCurrentRange(existing, document);
            const overlap = this.calculateOverlapPercentage(newRange, existingRange);
            if (overlap > 0.9) {
                return true;
            }
        }

        return false;
    }

    /**
     * 파일 경로를 절대 경로로 변환
     * 상대 경로인 경우 workspace root를 기준으로 절대 경로로 변환
     */
    private resolveFilePath(filePath: string): string {
        // 이미 절대 경로인 경우 그대로 반환
        if (path.isAbsolute(filePath)) {
            return filePath;
        }

        // workspace root 찾기
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            // 첫 번째 workspace folder를 기준으로 절대 경로 생성
            return path.resolve(workspaceFolders[0].uri.fsPath, filePath);
        }

        // workspace가 없으면 현재 작업 디렉토리 사용
        return path.resolve(filePath);
    }

    /**
     * 두 Range의 겹침 비율 계산 (0.0 ~ 1.0)
     */
    private calculateOverlapPercentage(
        range1: vscode.Range,
        range2: vscode.Range
    ): number {
        const start = Math.max(range1.start.line, range2.start.line);
        const end = Math.min(range1.end.line, range2.end.line);

        if (start > end) return 0;

        const overlapLines = end - start + 1;
        const totalLines = Math.max(
            range1.end.line - range1.start.line + 1,
            range2.end.line - range2.start.line + 1
        );

        if (totalLines === 0) return 0;

        return overlapLines / totalLines;
    }

    /**
     * Change가 document에 여전히 살아있는지 확인 (state-based)
     * 
     * 오직 텍스트 상태만 본다
     */
    private isChangeAlive(change: InlineChange, document: vscode.TextDocument): boolean {
        try {
            // offset 기반으로 현재 range 계산
            const currentRange = this.getCurrentRange(change, document);
            const currentText = document.getText(currentRange);

            // change.newText가 document에 여전히 존재하는지 확인
            if (change.newText && change.newText.trim() !== '') {
                // 정확히 일치하는지 확인 (공백 정규화)
                const normalizedCurrent = currentText.trim();
                const normalizedNew = change.newText.trim();
                return normalizedCurrent === normalizedNew;
            }

            // delete 타입의 경우: oldText가 document에 없어야 함
            if (change.type === 'delete') {
                // oldText가 document에 있으면 change가 아직 적용되지 않은 것
                return !document.getText().includes(change.oldText);
            }

            return false;
        } catch (error) {
            // range 계산 실패 시 dead로 간주
            return false;
        }
    }

    /**
     * Document 가져오기 (캐싱 포함)
     * 1. 캐시 확인 (1초 이내)
     * 2. Editor에서 찾기 (가장 빠름)
     * 3. Workspace에서 열기 (느림)
     */
    private async getDocument(filePath: string): Promise<vscode.TextDocument | null> {
        // 1. 캐시 확인
        const cached = this.documentCache.get(filePath);
        if (cached && Date.now() - cached.timestamp < 1000) { // 1초 캐시
            // Document version 확인 (변경되었으면 캐시 무효화)
            const editor = vscode.window.visibleTextEditors.find(
                e => e.document.uri.fsPath === filePath
            );
            if (editor && editor.document.version === cached.version) {
                return cached.document;
            }
        }

        // 2. Editor에서 찾기 (가장 빠름)
        const editor = vscode.window.visibleTextEditors.find(
            e => e.document.uri.fsPath === filePath
        );
        if (editor) {
            this.documentCache.set(filePath, {
                document: editor.document,
                version: editor.document.version,
                timestamp: Date.now()
            });
            return editor.document;
        }

        // 3. Workspace에서 열기 (느림)
        try {
            const uri = vscode.Uri.file(filePath);
            const document = await vscode.workspace.openTextDocument(uri);
            this.documentCache.set(filePath, {
                document,
                version: document.version,
                timestamp: Date.now()
            });
            return document;
        } catch {
            return null;
        }
    }

    /**
     * Document 상태 기반으로 모든 change 재평가 (state-based reconciliation)
     * 
     * - editor lifecycle에 의존하지 않음
     * - filesystem event를 판단 트리거로만 사용
     * - 오직 document 상태만 본다
     */
    private async reconcileChanges(filePath: string): Promise<void> {
        const changes = this.pendingChanges.get(filePath);
        if (!changes || changes.length === 0) {
            return;
        }

        try {
            // Document 가져오기 (캐싱 포함)
            const document = await this.getDocument(filePath);
            if (!document) {
                return;
            }

            let hasDirtyChanges = false;

            // 각 change를 document 상태와 비교
            for (const change of changes) {
                if (change.status !== 'pending') {
                    continue; // 이미 처리된 change는 건너뛰기
                }

                // Change가 여전히 살아있는지 확인
                if (!this.isChangeAlive(change, document)) {
                    change.status = 'dirty';
                    hasDirtyChanges = true;
                }
            }

            if (hasDirtyChanges) {
                // Decoration 재적용 (dirty change는 자동 제외됨)
                const editors = vscode.window.visibleTextEditors.filter(
                    e => e.document.uri.fsPath === filePath
                );

                for (const editor of editors) {
                    this.applyDecorationsToEditor(editor, changes);
                }

                // CodeLens 새로고침
                const { DiffCodeLensProvider } = require('./DiffCodeLensProvider');
                DiffCodeLensProvider.getInstance().refresh();

            }
        } catch {
            // 파일이 삭제되었거나 접근할 수 없는 경우
            // 파일이 삭제된 경우에만 invalidate
            this.invalidateFile(filePath, {
                reason: 'file-inaccessible',
                source: 'reconciliation'
            });
        }
    }

    /**
     * 문서 변경 감지 리스너 설정 (사용자 직접 편집 시 영향받은 change만 무효화)
     * 
     * - 겹친 change만 dirty로 표시
     * - 나머지 change는 유지
     * - 절대 clearAllDiff() 하지 않음
     */
    private setupDocumentChangeListener(): void {
        this.documentChangeDisposable = vscode.workspace.onDidChangeTextDocument((e) => {
            // 사용자가 직접 편집한 경우에만 처리 (extension이 수정한 경우는 제외)
            if (e.contentChanges.length === 0) return;

            const filePath = e.document.uri.fsPath;

            // ✅ formatter 방금 종료: 이번 변경은 formatter에 의한 것 (무시하고 플래그 제거)
            if (this.formatterJustFinished.has(filePath)) {
                this.formatterJustFinished.delete(filePath);
                this.documentVersions.set(filePath, e.document.version);

                // decoration 재적용
                const changes = this.pendingChanges.get(filePath);
                if (changes && changes.length > 0) {
                    const editor = vscode.window.visibleTextEditors.find(ed => ed.document === e.document);
                    if (editor) {
                        this.applyDecorationsToEditor(editor, changes);

                        // CodeLens 새로고침
                        const { DiffCodeLensProvider } = require('./DiffCodeLensProvider');
                        DiffCodeLensProvider.getInstance().refresh();
                    }
                }
                return;
            }

            const changes = this.pendingChanges.get(filePath);

            if (!changes || changes.length === 0) {
                return;
            }

            // ✅ Undo/Redo: 겹치는 change만 dirty 마킹, 무관한 change는 유지
            if (
                e.reason === vscode.TextDocumentChangeReason.Undo ||
                e.reason === vscode.TextDocumentChangeReason.Redo
            ) {
                const affectedChanges: InlineChange[] = [];
                for (const docChange of e.contentChanges) {
                    for (const aiChange of changes) {
                        if (aiChange.status !== 'pending') continue;
                        try {
                            const aiRange = this.getCurrentRange(aiChange, e.document);
                            if (docChange.range.intersection(aiRange)) {
                                affectedChanges.push(aiChange);
                            }
                        } catch {
                            // range 계산 실패 시 보수적으로 dirty 처리
                            affectedChanges.push(aiChange);
                        }
                    }
                }

                if (affectedChanges.length === 0) {
                    // Undo가 AI 변경과 무관 → offset 재계산만 수행
                    this.documentVersions.set(filePath, e.document.version);
                    this.recalculateAllOffsetsFromDocument(filePath, e.document);
                    return;
                }

                // 겹치는 change만 dirty 마킹
                for (const c of affectedChanges) {
                    c.status = 'dirty';
                }

                // 전부 dirty/accepted/rejected면 전체 무효화
                const stillPending = changes.filter(c => c.status === 'pending');
                if (stillPending.length === 0) {
                    this.invalidateFile(filePath, {
                        reason: 'undo-redo',
                        source: 'document-change',
                    });
                } else {
                    // 남은 pending change의 offset 재계산 + 데코레이션 갱신
                    this.recalculateAllOffsetsFromDocument(filePath, e.document);
                    this.pendingChanges.set(filePath, changes);
                    const currentEditors = vscode.window.visibleTextEditors.filter(
                        ed => ed.document.uri.fsPath === filePath
                    );
                    for (const ed of currentEditors) {
                        this.applyDecorationsToEditor(ed, changes);
                    }
                    const { DiffCodeLensProvider } = require('./DiffCodeLensProvider');
                    DiffCodeLensProvider.getInstance().refresh();
                }
                return;
            }

            // extension이 applyEdit으로 수정한 경우는 제외하기 위해 약간의 지연
            setTimeout(() => {
                // 여전히 pending changes가 있는지 확인
                const currentChanges = this.pendingChanges.get(filePath);
                if (!currentChanges || currentChanges.length === 0) {
                    return;
                }

                // ✅ range drift 방지: document version 확인
                const expectedVersion = this.documentVersions.get(filePath) || 0;
                const actualVersion = e.document.version;

                // ✅ bulk edit 보호: contentChanges를 reverse order로 처리
                // (여러 개의 변경이 있을 때 range 계산이 정확해야 함)
                const contentChanges = [...e.contentChanges].reverse();

                let hasDirtyChanges = false;

                if (actualVersion < expectedVersion) {
                    // version mismatch 시 모든 pending change를 dirty로 표시
                    for (const aiChange of currentChanges) {
                        if (aiChange.status === 'pending') {
                            aiChange.status = 'dirty';
                            hasDirtyChanges = true;
                        }
                    }
                } else {
                    // ✅ 각 contentChange에 대해 semantic 겹침 판정
                    const currentDocumentText = e.document.getText();
                    const checkpoint = this.checkpoints.get(filePath);
                    const isNewFileCheckpoint = checkpoint?.beforeContent === '';

                    for (const docChange of contentChanges) {
                        // VS Code의 contentChange는 range를 직접 제공
                        const docChangeRange = docChange.range;
                        const docChangeStartOffset = e.document.offsetAt(docChangeRange.start);
                        const docChangeEndOffset = e.document.offsetAt(docChangeRange.end);

                        for (const aiChange of currentChanges) {
                            // pending 상태인 change만 확인
                            if (aiChange.status !== 'pending') continue;

                            // ✅ Semantic 겹침 판정 (더 안전한 판정)
                            let isDirty = false;

                            // 1. Range overlap (최소 조건)
                            if (this.rangesOverlap(docChangeRange, aiChange.range)) {
                                isDirty = true;
                            }

                            // 2. Offset overlap (더 정확한 판정)
                            if (!isDirty) {
                                const changeStartOffset = aiChange.startOffset;
                                const changeEndOffset = aiChange.endOffset;
                                // offset 범위가 겹치는지 확인
                                if (!(docChangeEndOffset <= changeStartOffset || docChangeStartOffset >= changeEndOffset)) {
                                    isDirty = true;
                                }
                            }

                            // 3. change.newText가 document에 없거나 변경됨 (Semantic 검사)
                            if (!isDirty && aiChange.newText) {
                                // offset 기반으로 현재 range 계산
                                try {
                                    const changeCurrentRange = this.getCurrentRange(aiChange, e.document);
                                    const currentText = e.document.getText(changeCurrentRange);

                                    // ✅ 새 파일 + 전체 add인 경우 포맷터 수정은 동기화(keep pending)
                                    if (
                                        isNewFileCheckpoint &&
                                        aiChange.type === 'add' &&
                                        aiChange.startOffset === 0
                                    ) {
                                        aiChange.newText = currentDocumentText;
                                        aiChange.range = new vscode.Range(
                                            0,
                                            0,
                                            e.document.lineCount - 1,
                                            e.document.lineAt(Math.max(0, e.document.lineCount - 1)).text.length
                                        );
                                        aiChange.endOffset = currentDocumentText.length;
                                        // newText를 동기화했으므로 dirty 처리하지 않음
                                    } else {
                                        // change.newText와 현재 document의 해당 위치 텍스트가 다르면 dirty
                                        if (currentText !== aiChange.newText) {
                                            isDirty = true;
                                        }
                                    }
                                } catch (error) {
                                    // range 계산 실패 시 안전하게 dirty 처리
                                    isDirty = true;
                                }
                            }

                            // 4. change.oldText와 document 불일치 (delete 타입의 경우)
                            if (!isDirty && aiChange.type === 'delete') {
                                // delete 타입은 newText가 없으므로 oldText 기준으로 확인
                                // 현재 document에서 oldText가 예상 위치에 있는지 확인 (있으면 문제)
                                const checkOffset = Math.max(0, Math.min(aiChange.startOffset, currentDocumentText.length));
                                const checkText = currentDocumentText.substring(
                                    checkOffset,
                                    Math.min(currentDocumentText.length, checkOffset + aiChange.oldText.length)
                                );
                                // oldText가 예상 위치에 있으면 사용자가 수동으로 복원한 것
                                if (checkText === aiChange.oldText) {
                                    isDirty = true;
                                }
                            }

                            // ✅ 새 파일 전체 추가(change.type === 'add', oldText === '')에 포맷터가 개입한 경우
                            // dirty로 날리는 대신 현재 문서 내용으로 동기화하여 diff를 유지
                            if (
                                isDirty &&
                                aiChange.type === 'add' &&
                                aiChange.oldText === '' &&
                                aiChange.startOffset === 0
                            ) {
                                const docText = currentDocumentText;
                                const lastLine = Math.max(0, e.document.lineCount - 1);
                                const lastLineLen = e.document.lineCount > 0 ? e.document.lineAt(lastLine).text.length : 0;
                                aiChange.newText = docText;
                                aiChange.endOffset = docText.length;
                                aiChange.range = new vscode.Range(0, 0, lastLine, lastLineLen);
                                isDirty = false;
                            }

                            if (isDirty) {
                                aiChange.status = 'dirty';
                                hasDirtyChanges = true;
                            }
                        }
                    }
                }

                if (hasDirtyChanges) {
                    // ✅ 상태 기반 재생성: dirty change는 제외하고 나머지 pending change만 decoration 재적용
                    const editors = vscode.window.visibleTextEditors.filter(
                        ed => ed.document.uri.fsPath === filePath
                    );

                    for (const editor of editors) {
                        // ✅ 상태 기반 재생성: 모든 change를 다시 적용 (dirty는 자동 제외됨)
                        this.applyDecorationsToEditor(editor, currentChanges);
                    }

                    // CodeLens 새로고침 (dirty change는 CodeLens 생성 안 함)
                    const { DiffCodeLensProvider } = require('./DiffCodeLensProvider');
                    DiffCodeLensProvider.getInstance().refresh();
                }
            }, 100);
        });
    }

    /**
     * 외부 변경 감지 리스너 설정 (CLI/formatter/tsc 등)
     * 
     * - decoration 제거
     * - CodeLens 제거
     * - checkpoint 폐기 (advance 아님)
     * - 다음 LLM 요청은 clean context
     */
    private setupExternalChangeListener(): void {
        // 파일 시스템 watcher 설정 (workspace 전체)
        const pattern = new vscode.RelativePattern(
            vscode.workspace.workspaceFolders?.[0] || vscode.Uri.file(process.cwd()),
            '**/*'
        );
        this.fileSystemWatcher = vscode.workspace.createFileSystemWatcher(pattern);

        // 파일 변경 감지
        this.fileSystemWatcher.onDidChange(async (uri) => {
            const filePath = uri.fsPath;
            const changes = this.pendingChanges.get(filePath);

            // pending diff가 없으면 무시
            if (!changes || changes.length === 0) {
                return;
            }

            // external event는 판단 트리거일 뿐, 결론이 아님
            setTimeout(async () => {
                try {
                    // 파일이 여전히 존재하는지 확인
                    const document = await vscode.workspace.openTextDocument(uri);
                    const currentVersion = document.version;
                    const lastVersion = this.documentVersions.get(filePath);

                    // ✅ Formatter 실행 중인 파일은 무시 (diff 보호)
                    if (this.formatterRunning.has(filePath)) {
                        // document version만 업데이트 (reconciliation 스킵)
                        this.documentVersions.set(filePath, currentVersion);
                        return;
                    }

                    // ✅ document version 기반으로 변경 감지
                    // version이 변경되었으면 reconciliation 수행
                    if (lastVersion !== undefined && currentVersion === lastVersion) {
                        // version이 동일하면 변경 없음 (reconciliation 불필요)
                        return;
                    }

                    // ✅ 외부 변경 감지: change 단위로 판단 (무조건 invalidate 금지)
                    this.documentVersions.set(filePath, currentVersion);
                    await this.reconcileChanges(filePath);
                } catch {
                    // 파일이 삭제되었거나 접근할 수 없는 경우에만 invalidate
                    this.invalidateFile(filePath, {
                        reason: 'file-inaccessible',
                        source: 'file-system-watcher'
                    });
                }
            }, 200);
        });
    }

    /**
     * 파일의 pending diff 무효화 (외부 변경 감지 시 호출)
     * 
     * - decoration 제거
     * - CodeLens 제거
     * - checkpoint 폐기 (advance 아님)
     * - pendingChanges 삭제
     */
    public invalidateFile(filePath: string, options?: { reason?: string; source?: string }): void {
        const changes = this.pendingChanges.get(filePath);
        if (!changes || changes.length === 0) {
            return;
        }

        // 1. decoration 제거
        this.clearAllDecorationsForFile(filePath);

        // 2. CodeLens 제거
        const { DiffCodeLensProvider } = require('./DiffCodeLensProvider');
        DiffCodeLensProvider.getInstance().refresh();

        // 3. checkpoint 폐기 (advance 아님)
        this.checkpoints.delete(filePath);

        // 4. pendingChanges 삭제
        this.pendingChanges.delete(filePath);
        this.originalContents.delete(filePath);
        this.documentVersions.delete(filePath);
        this.lastAppliedChanges.delete(filePath); // ✅ 캐시도 정리

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // ✅ Shadow Document Pattern: invalidate 시 shadow/disk 정리
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        this.shadow.delete(filePath);
        this.disk.delete(filePath);

        // ✅ Turn Checkpoint Stack: 해당 파일 스냅샷 제거 + 빈 체크포인트 정리
        for (const tc of this.turnCheckpointStack) {
            tc.fileSnapshots.delete(filePath);
        }
        this.turnCheckpointStack = this.turnCheckpointStack.filter(tc => tc.fileSnapshots.size > 0);

        // Persistence + 이벤트
        this.scheduleSave();
        this._onPendingChangedEmitter.fire();
    }

    public static getInstance(): InlineDiffManager {
        if (!InlineDiffManager.instance) {
            InlineDiffManager.instance = new InlineDiffManager();
        }
        return InlineDiffManager.instance;
    }

    /**
     * 파일의 첫 번째 수정된 라인 번호 가져오기
     */
    public getFirstModifiedLine(filePath: string): number | null {
        const changes = this.pendingChanges.get(filePath);
        if (!changes || changes.length === 0) {
            return null;
        }

        // pending 상태인 변경사항 중 가장 작은 라인 번호 찾기
        const pendingChanges = changes.filter(c => c.status === 'pending');
        if (pendingChanges.length === 0) {
            return null;
        }

        const firstChange = pendingChanges.reduce((min, change) => {
            return change.range.start.line < min.range.start.line ? change : min;
        }, pendingChanges[0]);

        return firstChange.range.start.line;
    }

    /**
     * Checkpoint의 beforeContent 가져오기 (ToolExecutionCoordinator용)
     * ✅ Formatter 실행 전 상태를 기준으로 라인 수 계산
     */
    /**
     * Formatter 실행 시작 (diff 보호)
     */
    public markFormatterRunning(filePath: string): void {
        this.formatterRunning.add(filePath);
    }

    /**
     * Formatter 실행 종료 (diff 보호 해제)
     */
    public markFormatterFinished(filePath: string): void {
        // ✅ formatter 실행 중 플래그 제거
        this.formatterRunning.delete(filePath);

        // ✅ formatter 방금 종료됨 플래그 설정 (다음 document 변경 1회만 무시)
        this.formatterJustFinished.add(filePath);

        // ✅ Formatter가 실제 파일을 변경했으므로 shadow를 실제 파일 내용으로 동기화
        // 이렇게 해야 LLM이 다음 턴에서 formatter 적용 후 내용을 기준으로 search pattern 생성
        // (shadow 미동기화 시: LLM=single quotes, 실제 파일=double quotes → SEARCH 실패)
        if (this.shadow.has(filePath)) {
            try {
                const fs = require('fs') as typeof import('fs');
                const actualContent = fs.readFileSync(filePath, 'utf8');
                this.shadow.set(filePath, actualContent);
            } catch { /* 파일 읽기 실패 시 무시 (formatter가 파일 삭제했을 경우 등) */ }
        }
    }

    public getCheckpointBeforeContent(filePath: string): string | undefined {
        const checkpoint = this.checkpoints.get(filePath);
        if (checkpoint) {
            return checkpoint.beforeContent;
        }
        return undefined;
    }

    /**
     * 파일별 Promise-chain mutex — 병렬 에이전트가 같은 파일을 동시 수정할 때 직렬화
     */
    private async withFileLock<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
        const current = this.fileLocks.get(filePath) ?? Promise.resolve();
        let release!: () => void;
        const next = new Promise<void>(r => { release = r; });
        this.fileLocks.set(filePath, next);
        try {
            await current;
            return await fn();
        } finally {
            release();
            if (this.fileLocks.get(filePath) === next) {
                this.fileLocks.delete(filePath);
            }
        }
    }

    /**
     * 파일의 변경사항을 인라인 diff로 표시
     *
     * STEP 1: Checkpoint 생성 (AI가 파일을 수정하기 직전의 전체 스냅샷)
     * STEP 2: LLM 응답을 문서에 즉시 적용
     * STEP 3: Diff 계산 (checkpoint.content vs document.getText())
     * STEP 4: InlineChange 객체 생성
     * STEP 5: Decoration 적용
     * 
     * ⚠️ 중요: Diff는 "LLM이 말한 diff"가 아니라 "적용 결과의 diff"
     */
    public async showInlineDiff(
        filePath: string,
        originalContent: string,
        newContent: string,
        conversationTurnId: string = 'legacy',
    ): Promise<void> {
        return this.withFileLock(filePath, async () => {
        const uri = vscode.Uri.file(filePath);

        // ✅ 새 파일 여부를 명확히 판단
        const isNewFile = !originalContent || originalContent.trim() === '';

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // ✅ STEP 0: 새 파일이면 먼저 생성
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        if (isNewFile) {
            try {
                const fs = require('fs').promises;
                const path = require('path');

                // 디렉토리 생성
                await fs.mkdir(path.dirname(filePath), { recursive: true });

                // ✅ 빈 파일이 아니라 newContent로 생성
                await fs.writeFile(filePath, newContent, 'utf8');

                // 파일 생성 메트릭 기록
                UsageMetricsManager.getInstance().recordFileCreated();

                // 파일 생성 후 약간의 대기 (파일 시스템 동기화)
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (error) {
                console.error('[InlineDiffManager] Failed to create new file:', error);
                vscode.window.showErrorMessage(`Failed to create file: ${error}`);


                return;
            }
        }

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // ✅ STEP 1: 파일 열기
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        let editor = vscode.window.visibleTextEditors.find(
            e => e.document.uri.fsPath === filePath
        );

        if (!editor) {
            try {
                editor = await vscode.window.showTextDocument(uri, {
                    preserveFocus: false,
                    preview: false,
                });

                // 에디터가 열릴 때까지 대기
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (error) {
                console.error('[InlineDiffManager] Failed to open editor:', error);
                vscode.window.showErrorMessage(`Failed to open file: ${error}`);
                return;
            }
        } else {
            await vscode.window.showTextDocument(editor.document, {
                preserveFocus: false,
            });
        }

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // ✅ STEP 2: Shadow Document + Checkpoint 설정
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        const currentEditorContent = editor.document.getText();
        let existingChanges = this.pendingChanges.get(filePath);

        // ✅ 새 파일 생성 시: 기존 pending change 정리 (중복 방지)
        if (isNewFile && existingChanges && existingChanges.length > 0) {
            this.pendingChanges.delete(filePath);
            this.checkpoints.delete(filePath);
            this.shadow.delete(filePath);
            this.disk.delete(filePath);
            existingChanges = [];
        }

        let checkpointBeforeContent: string;

        if (isNewFile) {
            // ✅ 새 파일인 경우: 무조건 빈 문자열
            checkpointBeforeContent = '';
            // ✅ Shadow Document: disk = 빈 문자열 (새 파일)
            if (!this.disk.has(filePath)) {
                this.disk.set(filePath, '');
            }
        } else if (existingChanges && existingChanges.length > 0) {
            // ✅ 기존 pending change가 있는 경우: 현재 shadow 상태 사용
            // (연속 수정 시 shadow가 이미 있음)
            const existingShadow = this.shadow.get(filePath);
            checkpointBeforeContent = existingShadow || currentEditorContent;
        } else {
            // ✅ 기존 파일 첫 수정의 경우: originalContent 사용
            checkpointBeforeContent = originalContent;
            // ✅ Shadow Document: disk = 원본 (첫 수정 시)
            if (!this.disk.has(filePath)) {
                this.disk.set(filePath, originalContent);
            }
        }

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // ✅ STEP 2.5: Turn Checkpoint Stack - 턴 스냅샷 캡처
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        this.pushTurnSnapshot(filePath, checkpointBeforeContent, conversationTurnId);

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // ✅ STEP 3: LLM 응답을 문서에 적용
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        if (isNewFile) {
            // ✅ 새 파일은 이미 newContent로 생성되었으므로 skip
        } else {
            // ✅ 기존 파일만 replace
            const edit = new vscode.WorkspaceEdit();
            const fullRange = new vscode.Range(
                new vscode.Position(0, 0),
                editor.document.positionAt(currentEditorContent.length)
            );
            edit.replace(uri, fullRange, newContent);
            await vscode.workspace.applyEdit(edit);

            // 파일 수정 메트릭 기록
            UsageMetricsManager.getInstance().recordFileModified();

            // ✅ 핵심: WorkspaceEdit 적용 직후 저장 (파일을 수정한 곳에서만 저장)
            // Accept는 상태 관리만 담당하고, 실제 파일 저장은 수정한 곳에서 책임짐
            try {
                const document = editor.document;
                if (document.isDirty) {
                    await document.save();
                }
            } catch {
                // 저장 실패는 치명적이지 않음 (formatter나 다른 도구가 이미 저장했을 수 있음)
            }

            // 문서 적용 후 대기
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        // 적용 후 현재 문서 내용 가져오기
        const afterContent = editor.document.getText();

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // ✅ STEP 4: Diff 계산
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        const newChanges = this.analyzeChanges(checkpointBeforeContent, afterContent);

        // ✅ 새 파일인데 change가 없으면 강제로 생성
        if (isNewFile && newChanges.length === 0 && afterContent.trim() !== '') {

            const lines = afterContent.split('\n');
            newChanges.push({
                id: 'change_new_file_manual',
                filePath: filePath,
                range: new vscode.Range(0, 0, lines.length - 1, Number.MAX_SAFE_INTEGER),
                startOffset: 0,
                endOffset: afterContent.length,
                oldText: '',
                newText: afterContent,
                type: 'add',
                line: 0,
                status: 'pending',
                checkpointId: '',
                createdAt: Date.now(),
                conversationTurnId,
            });
        }

        // ✅ 중복 방지 가드 1: 이미 동일한 내용이 document에 있으면 skip
        const contentFilteredChanges: InlineChange[] = [];
        for (const change of newChanges) {
            // change.newText가 이미 document에 있는지 확인
            if (change.newText && change.newText.trim()) {
                const newTextTrimmed = change.newText.trim();
                if (afterContent.includes(newTextTrimmed)) {
                    // 이미 존재하는지 더 정확히 확인 (중복 삽입 방지)
                    const existingCount = (afterContent.match(new RegExp(newTextTrimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
                    if (existingCount > 1) {
                        continue; // 중복이면 skip
                    }
                }
            }
            contentFilteredChanges.push(change);
        }

        // ✅ 기존 pending change는 모두 유지 (같은 파일에 여러 개의 pending change가 공존)
        const existingPendingChanges = (existingChanges || []).filter(c => c.status === 'pending');
        const existingProcessedChanges = (existingChanges || []).filter(c =>
            c.status === 'accepted' || c.status === 'rejected'
        );

        // ✅ 중복 방지 가드 2: 기존 pending change와 동일한 change인지 확인 (강화된 로직)
        const finalNewChanges: InlineChange[] = [];

        // 현재 document 가져오기 (중복 확인용)
        let currentDocument: vscode.TextDocument | null = null;
        try {
            const uri = vscode.Uri.file(filePath);
            const editor = vscode.window.visibleTextEditors.find(e => e.document.uri.fsPath === filePath);
            if (editor) {
                currentDocument = editor.document;
            } else {
                currentDocument = await vscode.workspace.openTextDocument(uri);
            }
        } catch {
            // Could not get document for duplicate check
        }

        for (const newChange of contentFilteredChanges) {
            // 기존 pending change와 비교 (강화된 로직)
            let isDuplicate = false;

            if (currentDocument) {
                // 강화된 중복 확인 (offset, 텍스트, range overlap)
                isDuplicate = this.isDuplicateChange(newChange, existingPendingChanges, currentDocument);
            } else {
                // Fallback: 기본 비교
                for (const existingChange of existingPendingChanges) {
                    if (this.isSameChange(newChange, existingChange)) {
                        isDuplicate = true;
                        break;
                    }
                }
            }

            if (!isDuplicate) {
                finalNewChanges.push(newChange);
            }
        }

        // 각 change에 status, filePath, checkpointId 설정
        const checkpointId = `checkpoint_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        finalNewChanges.forEach((change: InlineChange, index: number) => {
            // ✅ 핵심: 고유한 change ID 생성 (중복 방지)
            // 기존 change.id는 analyzeChanges에서 생성된 임시 ID이므로 고유 ID로 재설정
            change.id = `change_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${index}`;
            change.filePath = filePath;
            change.status = 'pending';
            change.checkpointId = checkpointId;
            change.conversationTurnId = conversationTurnId;
        });

        // ✅ 기존 pending change의 range를 새 change에 맞게 업데이트
        // 새 change가 추가되면 기존 change의 라인 번호가 shift될 수 있음
        // ✅ afterContent 기준 라인별 offset 테이블 (startOffset/endOffset 재계산용)
        const afterLines = afterContent.split('\n');
        const afterLineStartOffsets: number[] = [0];
        let runningOffset = 0;
        for (let i = 0; i < afterLines.length - 1; i++) {
            runningOffset += afterLines[i].length + 1; // +1 for \n
            afterLineStartOffsets.push(runningOffset);
        }

        const updatedExistingPendingChanges = existingPendingChanges.map(existingChange => {
            // 새 change 중에서 기존 change보다 앞에 있는 것들의 라인 수 변화 계산
            let lineOffset = 0;
            for (const newChange of finalNewChanges) {
                // 새 change가 기존 change보다 앞에 있고, 추가/수정인 경우
                if (newChange.range.end.line < existingChange.range.start.line) {
                    const oldLines = newChange.oldText.split('\n').length;
                    const newLines = newChange.newText.split('\n').length;
                    lineOffset += (newLines - oldLines);
                }
            }

            // range + offset 업데이트
            const updatedChange = lineOffset !== 0 ? { ...existingChange } : { ...existingChange };
            if (lineOffset !== 0) {
                updatedChange.range = new vscode.Range(
                    new vscode.Position(existingChange.range.start.line + lineOffset, existingChange.range.start.character),
                    new vscode.Position(existingChange.range.end.line + lineOffset, existingChange.range.end.character)
                );
                updatedChange.line = existingChange.line + lineOffset;
            }

            // ✅ startOffset/endOffset 재계산 (afterContent 기준)
            // getCurrentRange()가 offset을 우선 사용하므로, document 교체 후 정확한 offset 필수
            const startLine = updatedChange.range.start.line;
            const endLine = updatedChange.range.end.line;
            if (startLine >= 0 && startLine < afterLineStartOffsets.length) {
                updatedChange.startOffset = afterLineStartOffsets[startLine] + updatedChange.range.start.character;
            }
            if (endLine >= 0 && endLine < afterLineStartOffsets.length) {
                updatedChange.endOffset = afterLineStartOffsets[endLine] + updatedChange.range.end.character;
            }

            return updatedChange;
        });

        // ✅ STEP 4: InlineChange 객체 병합
        const allChanges = [
            ...updatedExistingPendingChanges,  // 기존 pending change 유지 (range 업데이트됨)
            ...existingProcessedChanges, // 기존 accepted/rejected change 유지
            ...finalNewChanges                // 새 pending change 추가 (중복 제거됨)
        ];

        // ✅ Checkpoint 저장
        const checkpoint: AICheckpoint = {
            id: checkpointId,
            fileUri: filePath,
            beforeContent: checkpointBeforeContent, // AI가 파일을 수정하기 직전 상태
            changes: finalNewChanges, // 이 checkpoint에 연결된 change만 포함 (중복 제거됨)
            status: 'pending',
            createdAt: Date.now(),
            conversationTurnId,
        };

        // 하위 호환성: originalContents 저장
        if (!this.originalContents.has(filePath)) {
            this.originalContents.set(filePath, originalContent);
        }

        this.pendingChanges.set(filePath, allChanges);
        this.checkpoints.set(filePath, checkpoint);

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // ✅ Shadow Document Pattern: shadow 업데이트
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // afterContent = 실제 editor에 적용된 내용 (누적 상태)
        // 이제 LLM이 getContentForEditing()을 호출하면 이 shadow를 반환
        this.shadow.set(filePath, afterContent);

        // ✅ 마지막 적용된 changes 캐시 (ToolExecutionCoordinator에서 라인 수 계산용)
        // showInlineDiff에서 계산한 finalNewChanges를 저장 (올바른 시점의 계산 결과)
        this.lastAppliedChanges.set(filePath, [...finalNewChanges]);

        // ✅ document version 업데이트 (외부 변경 감지용)
        if (editor && editor.document) {
            this.documentVersions.set(filePath, editor.document.version);
        }

        // ✅ STEP 5: Decoration 적용
        // 새 파일인 경우 document가 완전히 로드될 때까지 대기
        // ✅ editor를 직접 전달하여 VSCode 재시작 후에도 decoration이 적용되도록 함
        await this.applyDecorationsWithRetry(filePath, allChanges, afterContent, isNewFile, 0, editor);

        // Persistence + 이벤트
        this.updateFileHash(filePath);
        this.scheduleSave();
        this._onPendingChangedEmitter.fire();
        }); // end withFileLock
    }

    /**
     * 원본과 새 내용을 비교하여 변경사항 추출
     * 각 변경 블록(연속된 삭제+추가)을 하나의 change로 묶음
     * ✅ offset 계산: newContent 기준으로 절대 문자 위치 계산
     */
    /**
     * 원본과 새 내용을 비교하여 변경사항 추출
     * ✅ public으로 변경: ToolExecutionCoordinator에서 직접 호출 가능하도록
     */
    public analyzeChanges(originalContent: string, newContent: string): InlineChange[] {
        const changes: InlineChange[] = [];
        const newLines = newContent.split('\n');

        // 라인 시작 offset 계산 (각 라인의 시작 위치)
        const lineStartOffsets: number[] = [0];
        let currentOffset = 0;
        for (let i = 0; i < newLines.length - 1; i++) {
            currentOffset += newLines[i].length + 1; // +1 for \n
            lineStartOffsets.push(currentOffset);
        }

        // ✅ 새 파일인 경우: 더 관대한 조건으로 변경
        const isNewFile = !originalContent || originalContent.trim() === '';

        if (isNewFile) {
            // ✅ 새 파일이고 내용이 있으면 무조건 change 생성
            if (newContent && newContent.trim() !== '') {
                const startOffset = 0;
                const endOffset = newContent.length;
                const lineCount = newLines.length;

                // ✅ 마지막 라인이 빈 줄이어도 포함
                const endLine = Math.max(0, lineCount - 1);

                // ✅ 고유 ID 생성 (중복 방지)
                const uniqueId = `change_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_newfile`;
                changes.push({
                    id: uniqueId,
                    filePath: '',
                    range: new vscode.Range(0, 0, endLine, Number.MAX_SAFE_INTEGER),
                    startOffset,
                    endOffset,
                    oldText: '',
                    newText: newContent,
                    type: 'add',
                    line: 0,
                    status: 'pending' as const,
                    checkpointId: '', // 나중에 showInlineDiff에서 설정됨
                    createdAt: Date.now(),
                    conversationTurnId: '', // 나중에 showInlineDiff에서 설정됨
                });
            }

            return changes;
        }

        // ✅ 기존 파일 수정의 경우: 기존 diff 로직 사용
        const diffs = diff.diffLines(originalContent, newContent);

        let originalLine = 0; // originalContent 기준 라인 번호
        let newLine = 0;      // newContent 기준 라인 번호
        let changeId = 0;
        let pendingDelete: { startLine: number; endLine: number; text: string; originalLine: number } | null = null;

        for (let i = 0; i < diffs.length; i++) {
            const part = diffs[i];
            const nextPart = i < diffs.length - 1 ? diffs[i + 1] : null;

            if (part.removed) {
                // 삭제된 라인 저장
                const startLine = originalLine;
                const endLine = originalLine + (part.count || 0) - 1;
                pendingDelete = {
                    startLine,
                    endLine,
                    text: part.value,
                    originalLine: originalLine
                };
                originalLine += part.count || 0;
            } else if (part.added) {
                // 추가된 라인
                const startLine = newLine;
                const endLine = newLine + (part.count || 0) - 1;

                // offset 계산 (newContent 기준)
                const startOffset = lineStartOffsets[startLine] || (startLine > 0 ? lineStartOffsets[lineStartOffsets.length - 1] + newLines[newLines.length - 1].length : 0);
                const endOffset = lineStartOffsets[endLine + 1] || (endLine + 1 < lineStartOffsets.length ? lineStartOffsets[endLine + 1] : newContent.length);

                // ✅ 핵심: SEARCH/REPLACE는 반드시 하나의 modify change로 합침
                // pendingDelete가 있고, 바로 다음에 added가 오면 modify (연속된 removed+added)
                if (pendingDelete) {
                    // ✅ 삭제+추가가 연속으로 있으면 modify로 처리 (SEARCH/REPLACE)
                    changes.push({
                        id: `change_${changeId++}`,
                        filePath: '',
                        range: new vscode.Range(startLine, 0, endLine, Number.MAX_SAFE_INTEGER),
                        startOffset,
                        endOffset,
                        oldText: pendingDelete.text,
                        newText: part.value,
                        type: 'modify',
                        line: startLine,
                        status: 'pending',
                        checkpointId: '',
                        createdAt: Date.now(),
                        conversationTurnId: '',
                    });
                    pendingDelete = null;
                } else {
                    // 추가만 있으면 add로 처리
                    changes.push({
                        id: `change_${changeId++}`,
                        filePath: '',
                        range: new vscode.Range(startLine, 0, endLine, Number.MAX_SAFE_INTEGER),
                        startOffset,
                        endOffset,
                        oldText: '',
                        newText: part.value,
                        type: 'add',
                        line: startLine,
                        status: 'pending',
                        checkpointId: '',
                        createdAt: Date.now(),
                        conversationTurnId: '',
                    });
                }

                newLine += part.count || 0;
            } else {
                // 변경되지 않은 라인
                if (pendingDelete) {
                    // 삭제만 있고 추가가 없으면 delete로 처리
                    const deleteStartOffset = lineStartOffsets[newLine] || 0;
                    const deleteEndOffset = deleteStartOffset; // delete는 newContent에 없으므로 같은 위치
                    changes.push({
                        id: `change_${changeId++}`,
                        filePath: '',
                        range: new vscode.Range(pendingDelete.startLine, 0, pendingDelete.endLine, Number.MAX_SAFE_INTEGER),
                        startOffset: deleteStartOffset,
                        endOffset: deleteEndOffset,
                        oldText: pendingDelete.text,
                        newText: '',
                        type: 'delete',
                        line: newLine, // 다음 unchanged 라인 위에 표시
                        status: 'pending',
                        checkpointId: '',
                        createdAt: Date.now(),
                        conversationTurnId: '',
                    });
                    pendingDelete = null;
                }
                originalLine += part.count || 0;
                newLine += part.count || 0;
            }
        }

        // 마지막에 남은 삭제 처리
        if (pendingDelete) {
            const deleteStartOffset = lineStartOffsets[newLine] || newContent.length;
            const deleteEndOffset = deleteStartOffset; // delete는 newContent에 없으므로 같은 위치
            changes.push({
                id: `change_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${changeId++}`,
                filePath: '',
                range: new vscode.Range(pendingDelete.startLine, 0, pendingDelete.endLine, Number.MAX_SAFE_INTEGER),
                startOffset: deleteStartOffset,
                endOffset: deleteEndOffset,
                oldText: pendingDelete.text,
                newText: '',
                type: 'delete',
                line: newLine, // 파일 끝에 표시
                status: 'pending',
                checkpointId: '',
                createdAt: Date.now(),
                conversationTurnId: '',
            });
        }

        return changes;
    }

    /**
     * Offset 기반으로 현재 Range 계산
     * ✅ 핵심: document가 변경되었어도 offset으로 정확한 위치 계산
     * 
     * 사용처:
     * - Decoration 그리기
     * - Overlap 검사
     * - Reject 시 복원
     */
    public getCurrentRange(change: InlineChange, document: vscode.TextDocument): vscode.Range {
        try {
            // offset이 document 범위를 벗어나면 range 사용 (fallback)
            if (change.startOffset < 0 || change.endOffset > document.getText().length) {
                return change.range;
            }

            const start = document.positionAt(change.startOffset);
            const end = document.positionAt(change.endOffset);
            return new vscode.Range(start, end);
        } catch {
            // offset 계산 실패 시 range 사용 (fallback)
            return change.range;
        }
    }

    /**
     * 특정 에디터에 Decoration 적용 (상태 기반 재생성)
     * 
     * - 절대 clearAllDecorations() 후 재생성하지 않음
     * - 상태별로 decoration 재계산
     * - pending: 초록색 배경
     * - dirty: 주황색 배경 (선택적)
     * 
     * 🔥 핵심: 삭제된 코드는 decoration.before로 표시 (문서에 실제로 존재하지 않음)
     */
    private applyDecorationsToEditor(editor: vscode.TextEditor, changes: InlineChange[]): void {
        if (!editor || !editor.document) {
            return;
        }

        // ✅ 기존 decoration 먼저 제거 (중복 적용 방지)
        this.clearAllDecorationsForEditor(editor);

        // ✅ 상태 기반 필터링: pending만 decoration 적용 (dirty는 제외)
        const pendingChanges = changes.filter(c => c.status === 'pending');

        if (pendingChanges.length === 0) {
            return;
        }

        const addedRanges: vscode.Range[] = [];
        const deletedDecorations: vscode.DecorationOptions[] = []; // ✅ decoration.before 사용

        for (const change of pendingChanges) {
            try {
                if (change.type === 'delete' || change.type === 'modify') {
                    const targetLine = change.type === 'modify'
                        ? this.getCurrentRange(change, editor.document).start.line
                        : Math.min(change.line, editor.document.lineCount);

                    if (targetLine < 0 || targetLine >= editor.document.lineCount) {
                        // modify 타입은 아래에서 처리
                        if (change.type === 'modify') {
                            // modify는 계속 진행하여 newText 부분도 decoration 적용
                        } else {
                            continue;
                        }
                    } else {
                        // 삭제된 각 라인에 대해 decoration.before 생성
                        const oldLines = change.oldText.split('\n');
                        for (let i = 0; i < oldLines.length; i++) {
                            const lineText = oldLines[i];
                            if (lineText.trim() === '' && i < oldLines.length - 1) {
                                // 빈 줄은 건너뛰기 (선택적)
                                continue;
                            }

                            deletedDecorations.push({
                                range: new vscode.Range(targetLine, 0, targetLine, 0),
                                renderOptions: {
                                    before: {
                                        contentText: lineText,
                                        color: new vscode.ThemeColor('editorError.foreground'),
                                        backgroundColor: new vscode.ThemeColor('diffEditor.removedLineBackground'),
                                        textDecoration: 'line-through',
                                        margin: '0 8px 0 0',
                                        fontStyle: 'italic',
                                    }
                                }
                            });
                        }
                    }

                    // delete 타입은 여기서 종료 (newText가 없음)
                    if (change.type === 'delete') {
                        continue;
                    }
                }

                // ✅ offset 기반으로 현재 range 계산 (document 변경 후에도 정확함)
                const currentRange = this.getCurrentRange(change, editor.document);

                // ✅ decoration 생성 가능 여부 확인
                if (currentRange.start.line < 0 || currentRange.end.line >= editor.document.lineCount) {
                    continue;
                }

                if (change.type === 'add' || change.type === 'modify') {
                    // 추가/수정된 라인: 초록색 배경
                    const startLine = currentRange.start.line;
                    // ✅ endOffset이 다음 라인의 시작을 가리킬 수 있으므로, end.line이 start.line과 같으면 한 줄만 decoration
                    // end.line이 start.line보다 크면 end.line은 제외 (endOffset이 다음 라인 시작을 가리키는 경우)
                    const endLine = currentRange.end.line;

                    // ✅ endOffset이 다음 라인의 시작을 가리키는 경우 처리
                    // end.position이 다음 라인의 시작(column 0)이고 start.line과 다르면, end.line은 제외
                    if (endLine > startLine && currentRange.end.character === 0) {
                        // endOffset이 다음 라인의 시작을 가리키는 경우, endLine은 제외
                        for (let line = startLine; line < endLine; line++) {
                            if (line >= 0 && line < editor.document.lineCount) {
                                addedRanges.push(new vscode.Range(
                                    line,
                                    0,
                                    line,
                                    Number.MAX_SAFE_INTEGER
                                ));
                            }
                        }
                    } else {
                        // 일반적인 경우: startLine부터 endLine까지 포함
                        for (let line = startLine; line <= endLine; line++) {
                            if (line >= 0 && line < editor.document.lineCount) {
                                addedRanges.push(new vscode.Range(
                                    line,
                                    0,
                                    line,
                                    Number.MAX_SAFE_INTEGER
                                ));
                            }
                        }
                    }
                }
            } catch {
                continue;
            }
        }

        // Decoration 적용 (추가된 코드: 초록색, 삭제된 코드: decoration.before)
        editor.setDecorations(this.addedDecoration, addedRanges);
        editor.setDecorations(this.deletedDecoration, deletedDecorations);
    }

    /**
     * Decoration 적용 (재시도 로직 포함)
     * 새 파일 생성 시 document가 완전히 로드될 때까지 대기
     *
     * @param providedEditor - showInlineDiff에서 이미 열린 editor (optional)
     */
    private async applyDecorationsWithRetry(
        filePath: string,
        allChanges: InlineChange[],
        expectedContent: string,
        isNewFile: boolean,
        retryCount: number = 0,
        providedEditor?: vscode.TextEditor
    ): Promise<void> {
        const maxRetries = isNewFile ? 10 : 5; // 재시도 횟수 증가
        const retryDelay = isNewFile ? 200 : 150; // 재시도 간격 증가

        // 현재 visible editors에서 해당 파일 찾기 (providedEditor 우선 사용)
        let currentEditor = providedEditor || vscode.window.visibleTextEditors.find(
            e => e.document.uri.fsPath === filePath
        );

        if (!currentEditor) {
            // ✅ Editor가 없으면 재시도 (VSCode 재시작 후 첫 호출 시 필요)
            if (retryCount < maxRetries) {
                console.log(`[InlineDiffManager] Editor not ready for ${filePath}, retrying (${retryCount + 1}/${maxRetries})...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                return this.applyDecorationsWithRetry(filePath, allChanges, expectedContent, isNewFile, retryCount + 1);
            }
            // 최대 재시도 후에도 editor가 없으면 CodeLens만 새로고침
            console.warn(`[InlineDiffManager] Editor not available after ${maxRetries} retries for ${filePath}`);
            const { DiffCodeLensProvider } = require('./DiffCodeLensProvider');
            DiffCodeLensProvider.getInstance().refresh();
            return;
        }

        // ✅ document 내용 확인 (새 파일인 경우 특히 중요)
        const currentContent = currentEditor.document.getText();
        const contentMatches = currentContent === expectedContent ||
            (isNewFile && currentContent.trim() === expectedContent.trim());

        if (!contentMatches && retryCount < maxRetries) {
            // 재시도 (현재 editor를 계속 사용)
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            return this.applyDecorationsWithRetry(filePath, allChanges, expectedContent, isNewFile, retryCount + 1, currentEditor);
        }

        // ✅ Decoration 적용 (applyDecorationsToEditor 내부에서 기존 decoration 제거됨)
        this.applyDecorationsToEditor(currentEditor, allChanges);

        // CodeLens 새로고침 (Accept/Reject 버튼 표시)
        const { DiffCodeLensProvider } = require('./DiffCodeLensProvider');
        DiffCodeLensProvider.getInstance().refresh();
    }

    /**
     * Decoration 상태 기반 재생성 (언제든 호출 가능한 순수 함수)
     * 
     * - 절대 clearAllDecorations() 후 재생성하지 않음
     * - 상태별로 decoration 재계산
     * 
     * 호출 시점:
     * - onDidChangeTextDocument
     * - onDidChangeActiveTextEditor
     * - onDidChangeVisibleTextEditors
     * - Accept/Reject 후
     * - 스크롤 시
     */
    public refreshDecorations(filePath: string): void {
        const editors = vscode.window.visibleTextEditors.filter(
            e => e.document.uri.fsPath === filePath
        );

        if (editors.length === 0) {
            return;
        }

        const changes = this.pendingChanges.get(filePath);
        if (!changes || changes.length === 0) {
            // 모든 decoration 제거
            for (const editor of editors) {
                this.clearAllDecorationsForEditor(editor);
            }
            return;
        }

        // 상태 기반으로 decoration 재생성
        for (const editor of editors) {
            this.applyDecorationsToEditor(editor, changes);
        }

        // CodeLens 새로고침
        const { DiffCodeLensProvider } = require('./DiffCodeLensProvider');
        DiffCodeLensProvider.getInstance().refresh();
    }


    /**
     * 특정 변경사항 승인 (change 단위)
     * 
     * - "이 변경은 더 이상 AI 변경이 아니다"
     * - 상태만 변경 (pending → accepted)
     * - 문서 내용은 이미 반영된 상태 (변경 없음)
     * - VS Code Undo 스택과 완전히 분리
     */
    public async acceptChange(filePath: string, changeId: string): Promise<void> {
        const changes = this.pendingChanges.get(filePath);
        if (!changes) {
            return;
        }

        // ✅ 핵심: 정확한 change ID 매칭 (고유 ID 사용)
        const change = changes.find(c => c.id === changeId);
        if (!change) {
            return;
        }

        // 현재 visible editors에서 해당 파일 찾기
        const editors = vscode.window.visibleTextEditors.filter(
            e => e.document.uri.fsPath === filePath
        );

        if (editors.length === 0) {
            return;
        }

        // 🔥 Accept: 문서에는 이미 newContent가 있으므로, decoration만 제거하면 됨
        // (삭제된 라인은 decoration.before로만 표시되었으므로 문서에서 제거할 필요 없음)
        // ⚠️ VS Code Undo 스택과 분리: 문서 수정 없음
        // ✅ Accept는 의미적 커밋이지만, 파일 저장은 showInlineDiff()에서 담당
        // (파일을 수정한 곳에서만 저장해야 "파일 내용이 최신입니다" 오류 방지)

        // 커서 위치 저장 (Accept 후 유지)
        const currentSelections = editors.map(e => e.selection);

        // change 상태 업데이트
        change.status = 'accepted';

        // ✅ 핵심: 상태 변경 후 pendingChanges를 명시적으로 업데이트
        // changes 배열은 참조이므로 상태 변경이 자동으로 반영되지만,
        // 명시적으로 set하여 확실하게 함
        this.pendingChanges.set(filePath, changes);

        // ✅ checkpoint advance: 해당 checkpoint 이후의 pending change가 없을 때만
        const checkpoint = this.checkpoints.get(filePath);
        if (checkpoint && change.checkpointId === checkpoint.id) {
            // 해당 checkpoint 이후의 pending change 확인
            const changesAfterThisCheckpoint = changes.filter(c =>
                c.status === 'pending' &&
                c.checkpointId === checkpoint.id &&
                c.createdAt > change.createdAt
            );

            // 이후 pending change가 없으면 checkpoint advance
            if (changesAfterThisCheckpoint.length === 0) {
                // 해당 checkpoint의 모든 change가 처리되었는지 확인
                const checkpointChanges = changes.filter(c => c.checkpointId === checkpoint.id);
                const allProcessed = checkpointChanges.every(c =>
                    c.status === 'accepted' || c.status === 'rejected'
                );

                if (allProcessed) {
                    // checkpoint의 모든 change가 처리되었으므로 checkpoint advance
                    checkpoint.status = 'accepted';
                }
            }
        }

        // ✅ 핵심: 즉시 decoration 재적용 (pending 상태인 change만 표시)
        const pendingChanges = changes.filter(c => c.status === 'pending');

        if (pendingChanges.length === 0) {
            // 모든 변경사항이 승인되었으므로 정리
            this.pendingChanges.delete(filePath);
            this.originalContents.delete(filePath);
            this.lastAppliedChanges.delete(filePath); // ✅ 캐시도 정리

            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            // ✅ Shadow Document Pattern: Accept 완료 시 disk = shadow
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            const shadowContent = this.shadow.get(filePath);
            if (shadowContent !== undefined) {
                this.disk.set(filePath, shadowContent);
            }
            // shadow는 유지 (다음 수정을 위해)

            // 모든 에디터에서 decoration 제거
            for (const editor of editors) {
                this.clearAllDecorationsForEditor(editor);
            }
        } else {
            // ✅ 즉시 decoration 재적용 (pending 상태인 change만)
            for (const editor of editors) {
                this.applyDecorationsToEditor(editor, changes);
            }
        }

        // ✅ 추가 안전장치: setTimeout으로 한 번 더 확인
        setTimeout(() => {
            // 최신 editors 가져오기 (에디터가 변경되었을 수 있음)
            const currentEditors = vscode.window.visibleTextEditors.filter(
                e => e.document.uri.fsPath === filePath
            );

            // 최신 changes 가져오기 (다른 곳에서 변경되었을 수 있음)
            const currentChanges = this.pendingChanges.get(filePath);

            if (!currentChanges || currentChanges.length === 0) {
                // 모든 decoration 제거
                for (const editor of currentEditors) {
                    this.clearAllDecorationsForEditor(editor);
                }
                return;
            }

            // 남은 pending changes 확인
            const remainingPending = currentChanges.filter(c => c.status === 'pending');

            if (remainingPending.length === 0) {
                // 모든 변경사항이 처리되었으므로 정리
                this.pendingChanges.delete(filePath);
                this.originalContents.delete(filePath);
                this.lastAppliedChanges.delete(filePath); // ✅ 캐시도 정리

                // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                // ✅ Shadow Document Pattern: Accept 완료 시 disk = shadow
                // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                const shadowContent = this.shadow.get(filePath);
                if (shadowContent !== undefined) {
                    this.disk.set(filePath, shadowContent);
                }

                for (const editor of currentEditors) {
                    this.clearAllDecorationsForEditor(editor);
                }
            } else {
                // 남은 pending changes에 대해 decoration 재적용
                for (const editor of currentEditors) {
                    this.applyDecorationsToEditor(editor, currentChanges);
                }
            }
        }, 100);

        // 커서 위치 복원 (decoration 제거 후에도 유지)
        setTimeout(() => {
            editors.forEach((editor, index) => {
                if (editor && editor.document && currentSelections[index]) {
                    editor.selection = currentSelections[index];
                }
            });
        }, 50);

        // CodeLens 새로고침 (변경사항이 없으면 CodeLens도 자동으로 사라짐)
        const { DiffCodeLensProvider } = require('./DiffCodeLensProvider');
        DiffCodeLensProvider.getInstance().refresh();

        // ✅ document version 업데이트 (외부 변경 감지용)
        if (editors.length > 0 && editors[0].document) {
            this.documentVersions.set(filePath, editors[0].document.version);
        }

        // Persistence + 이벤트
        this.scheduleSave();
        this._onPendingChangedEmitter.fire();
    }

    /**
     * 특정 변경사항 거부 (change 단위)
     * 
     * - change 생성 시 캡쳐한 oldText만 믿는다
     * - 현재 document에서 change.newText를 찾아서 change.oldText로 교체
     * - offset 기반으로 정확한 위치 찾기
     * - 파일 전체 undo 아님 (부분 롤백)
     * - 상태 전이 (pending → rejected)
     * - VS Code Undo 스택과 완전히 분리
     */
    public async rejectChange(filePath: string, changeId: string): Promise<void> {
        const changes = this.pendingChanges.get(filePath);
        if (!changes) {
            return;
        }

        // ✅ 핵심: 정확한 change ID 매칭 (고유 ID 사용)
        const change = changes.find(c => c.id === changeId);
        if (!change) {
            return;
        }

        // 현재 visible editors에서 해당 파일 찾기
        const editors = vscode.window.visibleTextEditors.filter(
            e => e.document.uri.fsPath === filePath
        );

        if (editors.length === 0) {
            return;
        }

        const editor = editors[0]; // 첫 번째 에디터 사용

        // ✅ 핵심: change.newText를 현재 document에서 찾아서 change.oldText로 교체
        // offset 기반으로 정확한 위치 찾기
        const edit = new vscode.WorkspaceEdit();

        // ✅ offset 기반으로 현재 range 계산
        const currentRange = this.getCurrentRange(change, editor.document);

        if (change.type === 'add') {
            // 추가된 라인 삭제: 현재 range 사용
            edit.delete(editor.document.uri, currentRange);
        } else if (change.type === 'modify') {
            // 수정된 라인을 원본으로 되돌리기: change.oldText로 교체
            edit.replace(editor.document.uri, currentRange, change.oldText);
        } else if (change.type === 'delete') {
            // delete 타입: change.line 위치에 change.oldText 삽입
            const targetLine = Math.min(change.line, editor.document.lineCount);
            const insertPosition = new vscode.Position(targetLine, 0);
            edit.insert(editor.document.uri, insertPosition, change.oldText + (change.oldText.endsWith('\n') ? '' : '\n'));
        }

        await vscode.workspace.applyEdit(edit);

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // ✅ Reject 후 sibling offset 재계산
        // reject로 인해 문서 내용이 변경되어 나머지 pending change의 offset이 drift됨
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        this.recalculateOffsetsAfterReject(changes, change, editor.document);

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // ✅ Shadow Document Pattern: Reject 시 shadow 업데이트
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // Reject 후 editor 내용이 변경되었으므로 shadow 동기화
        const updatedContent = editor.document.getText();
        this.shadow.set(filePath, updatedContent);

        // change 상태 업데이트
        change.status = 'rejected';

        // ✅ 핵심: 상태 변경 후 pendingChanges를 명시적으로 업데이트
        // changes 배열은 참조이므로 상태 변경이 자동으로 반영되지만,
        // 명시적으로 set하여 확실하게 함
        this.pendingChanges.set(filePath, changes);

        // 에디터가 업데이트된 후 decoration 재적용
        // ✅ 핵심: reject는 하나의 change만 처리하고 나머지는 유지
        // 변경사항을 재계산하지 않고 기존 change 배열을 그대로 사용
        setTimeout(() => {
            // ✅ 핵심: setTimeout 내부에서 최신 editors와 changes를 가져와야 함
            // 최신 editors 가져오기 (에디터가 변경되었을 수 있음)
            const currentEditors = vscode.window.visibleTextEditors.filter(
                e => e.document.uri.fsPath === filePath
            );

            // 최신 changes 가져오기 (다른 곳에서 변경되었을 수 있음)
            const currentChanges = this.pendingChanges.get(filePath);

            if (!currentChanges || currentChanges.length === 0) {
                return;
            }

            // ✅ 나머지 pending changes는 그대로 유지
            const pendingChanges = currentChanges.filter(c => c.status === 'pending');

            if (pendingChanges.length === 0) {
                // 모든 변경사항이 처리되었으므로 정리
                this.pendingChanges.delete(filePath);
                this.originalContents.delete(filePath);
                this.lastAppliedChanges.delete(filePath); // ✅ 캐시도 정리

                // 체크포인트 상태 업데이트
                const checkpoint = this.checkpoints.get(filePath);
                if (checkpoint) {
                    const allAccepted = currentChanges.every(c => c.status === 'accepted');
                    const allRejected = currentChanges.every(c => c.status === 'rejected');
                    if (allAccepted) {
                        checkpoint.status = 'accepted';
                        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                        // ✅ Shadow Document Pattern: Accept 완료 시 disk = shadow
                        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                        const shadowContent = this.shadow.get(filePath);
                        if (shadowContent !== undefined) {
                            this.disk.set(filePath, shadowContent);
                        }
                    } else if (allRejected) {
                        checkpoint.status = 'rejected';
                        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                        // ✅ Shadow Document Pattern: Reject 완료 시 shadow = editor (이미 복원됨)
                        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                        // Reject 시점에 이미 shadow가 업데이트되었으므로 disk도 동기화
                        const shadowContent = this.shadow.get(filePath);
                        if (shadowContent !== undefined) {
                            this.disk.set(filePath, shadowContent);
                        }
                    }
                }

                // 모든 에디터에서 decoration 제거
                for (const e of currentEditors) {
                    this.clearAllDecorationsForEditor(e);
                }
            } else {
                // ✅ 나머지 pending changes에 대해 decoration 재적용
                // reject 후 recalculateOffsetsAfterReject()에서 sibling offset이 이미 보정됨

                // 모든 에디터에 decoration 재적용
                for (const e of currentEditors) {
                    this.applyDecorationsToEditor(e, currentChanges);
                }
            }

            // CodeLens 새로고침
            const { DiffCodeLensProvider } = require('./DiffCodeLensProvider');
            DiffCodeLensProvider.getInstance().refresh();

            // ✅ document version 업데이트 (외부 변경 감지용)
            if (currentEditors.length > 0 && currentEditors[0].document) {
                this.documentVersions.set(filePath, currentEditors[0].document.version);
            }
        }, 100);

        // Persistence + 이벤트
        this.scheduleSave();
        this._onPendingChangedEmitter.fire();
    }

    /**
     * Reject 후 sibling pending change들의 offset을 재계산
     * reject로 인해 문서 길이가 변경되면 이후 위치의 change들의 frozen offset이 틀어짐
     */
    private recalculateOffsetsAfterReject(
        changes: InlineChange[],
        rejectedChange: InlineChange,
        document: vscode.TextDocument
    ): void {
        // delete 타입은 line 기반 삽입이므로 document 텍스트에서 재탐색
        if (rejectedChange.type === 'delete') {
            const docText = document.getText();
            for (const sibling of changes) {
                if (sibling.id === rejectedChange.id || sibling.status !== 'pending') continue;
                if (sibling.newText) {
                    // 기존 offset 근처에서 우선 탐색
                    const searchStart = Math.max(0, sibling.startOffset - 500);
                    const idx = docText.indexOf(sibling.newText, searchStart);
                    if (idx !== -1) {
                        sibling.startOffset = idx;
                        sibling.endOffset = idx + sibling.newText.length;
                    }
                }
            }
            return;
        }

        // add/modify: 수학적 delta 계산
        const rejectionPoint = rejectedChange.startOffset;
        let offsetDelta = 0;
        if (rejectedChange.type === 'add') {
            // newText가 삭제됨 → 문서 축소
            offsetDelta = -rejectedChange.newText.length;
        } else if (rejectedChange.type === 'modify') {
            // newText → oldText 교체
            offsetDelta = rejectedChange.oldText.length - rejectedChange.newText.length;
        }
        if (offsetDelta === 0) return;

        for (const sibling of changes) {
            if (sibling.id === rejectedChange.id || sibling.status !== 'pending') continue;
            if (sibling.startOffset >= rejectionPoint) {
                sibling.startOffset += offsetDelta;
                sibling.endOffset += offsetDelta;
            }
        }
    }

    /**
     * Undo 등 외부 변경 후 pending change들의 offset을 document에서 재탐색하여 갱신
     * 각 change의 newText를 기존 offset 근처에서 먼저 찾고, 없으면 전체 탐색
     */
    private recalculateAllOffsetsFromDocument(filePath: string, document: vscode.TextDocument): void {
        const changes = this.pendingChanges.get(filePath);
        if (!changes) return;

        const docText = document.getText();
        for (const change of changes) {
            if (change.status !== 'pending') continue;
            if (!change.newText || change.newText.length < 10) continue; // 짧은 텍스트는 false positive 위험

            // 기존 offset 근처 ±500자에서 우선 탐색
            const searchStart = Math.max(0, change.startOffset - 500);
            const searchEnd = Math.min(docText.length, change.endOffset + 500);
            const window = docText.substring(searchStart, searchEnd);
            const localIdx = window.indexOf(change.newText);

            if (localIdx !== -1) {
                change.startOffset = searchStart + localIdx;
                change.endOffset = change.startOffset + change.newText.length;
            } else {
                // 근처에 없으면 전체 문서에서 탐색
                const globalIdx = docText.indexOf(change.newText);
                if (globalIdx !== -1) {
                    change.startOffset = globalIdx;
                    change.endOffset = globalIdx + change.newText.length;
                }
                // 못 찾으면 기존 offset 유지 (isChangeAlive에서 dirty 감지)
            }
        }
    }

    /**
     * 모든 변경사항 승인
     */
    public async acceptAllChanges(filePath: string): Promise<void> {
        // ✅ 상대 경로를 절대 경로로 변환
        const absolutePath = this.resolveFilePath(filePath);

        const changes = this.pendingChanges.get(absolutePath);
        if (!changes) {
            // ✅ 상대 경로로도 시도
            const relativeChanges = this.pendingChanges.get(filePath);
            if (relativeChanges) {
                return this.acceptAllChanges(absolutePath); // 재귀 호출로 절대 경로 사용
            }
            return;
        }

        // 파일이 열려있지 않으면 먼저 열기
        let editors = vscode.window.visibleTextEditors.filter(
            e => e.document.uri.fsPath === absolutePath
        );

        if (editors.length === 0) {
            try {
                const uri = vscode.Uri.file(absolutePath);
                const document = await vscode.workspace.openTextDocument(uri);
                const editor = await vscode.window.showTextDocument(document, {
                    preserveFocus: false,
                    preview: false,
                });
                editors = [editor];
                // 에디터가 열릴 때까지 대기
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch {
                return;
            }
        }

        // 각 change를 개별적으로 accept (codelens 클릭과 동일한 방식)
        const pendingChanges = changes.filter(c => c.status === 'pending');
        for (const change of pendingChanges) {
            await this.acceptChange(absolutePath, change.id);
        }
    }

    /**
     * 모든 변경사항 거부
     * 🔥 체크포인트의 beforeContent로 정확히 복원
     * ⚠️ VS Code Undo 스택과 분리: WorkspaceEdit 사용
     */
    public async rejectAllChanges(filePath: string): Promise<void> {
        // ✅ 상대 경로를 절대 경로로 변환
        const absolutePath = this.resolveFilePath(filePath);

        const changes = this.pendingChanges.get(absolutePath);
        if (!changes) {
            // ✅ 상대 경로로도 시도
            const relativeChanges = this.pendingChanges.get(filePath);
            if (relativeChanges) {
                return this.rejectAllChanges(absolutePath); // 재귀 호출로 절대 경로 사용
            }
            return;
        }

        // 파일이 열려있지 않으면 먼저 열기
        let editors = vscode.window.visibleTextEditors.filter(
            e => e.document.uri.fsPath === absolutePath
        );

        if (editors.length === 0) {
            try {
                const uri = vscode.Uri.file(absolutePath);
                const document = await vscode.workspace.openTextDocument(uri);
                const editor = await vscode.window.showTextDocument(document, {
                    preserveFocus: false,
                    preview: false,
                });
                editors = [editor];
                // 에디터가 열릴 때까지 대기
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch {
                return;
            }
        }

        // 각 change를 개별적으로 reject (codelens 클릭과 동일한 방식)
        const pendingChanges = changes.filter(c => c.status === 'pending');
        for (const change of pendingChanges) {
            await this.rejectChange(absolutePath, change.id);
        }

        // 변경사항 목록에서 제거
        this.pendingChanges.delete(absolutePath);
        this.originalContents.delete(absolutePath);
        this.lastAppliedChanges.delete(absolutePath); // ✅ 캐시도 정리
    }

    /**
     * 특정 에디터의 모든 decoration 제거
     */
    private clearAllDecorationsForEditor(editor: vscode.TextEditor): void {
        if (!editor) return;
        editor.setDecorations(this.addedDecoration, []);
        // ✅ 삭제된 코드 decoration.before도 명시적으로 제거
        editor.setDecorations(this.deletedDecoration, []);
    }

    /**
     * 특정 파일의 모든 에디터에서 decoration 제거
     */
    private clearAllDecorationsForFile(filePath: string): void {
        const editors = vscode.window.visibleTextEditors.filter(
            e => e.document.uri.fsPath === filePath
        );
        for (const editor of editors) {
            this.clearAllDecorationsForEditor(editor);
        }
    }

    /**
     * 파일의 모든 변경사항 가져오기
     */
    public getChanges(filePath: string): InlineChange[] {
        return this.pendingChanges.get(filePath) || [];
    }

    /**
     * 원본 내용 가져오기 (deprecated, checkpoint 사용 권장)
     * rejectAllChanges에서 사용됨
     */
    public getOriginalContent(filePath: string): string | undefined {
        return this.originalContents.get(filePath);
    }

    /**
     * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     * ✅ Shadow Document Pattern - Core Method
     * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     * LLM에게 보여줄 파일 내용 반환 (누적 수정 포함)
     *
     * Shadow Document 패턴:
     * - LLM은 항상 shadow(누적된 수정 상태)를 봄
     * - Accept 전까지 disk에는 반영되지 않음
     * - 이렇게 해야 "버튼 1개 추가 → 2개 추가되는 문제" 해결
     *
     * 이전 문제:
     * - getCurrentDocumentContent()가 pending changes를 제외한 "원본"을 반환
     * - LLM이 항상 원본을 기준으로 수정 → 누적 수정 불가능
     *
     * 해결:
     * - shadow가 있으면 shadow 반환 (누적된 상태)
     * - shadow가 없으면 disk 반환 (원본 또는 마지막 Accept 상태)
     * - disk도 없으면 현재 editor content 반환
     */
    public getContentForEditing(filePath: string): string | undefined {
        // 1. Shadow가 있으면 shadow 반환 (누적된 수정 상태)
        const shadowContent = this.shadow.get(filePath);
        if (shadowContent !== undefined) {
            return shadowContent;
        }

        // 2. Disk가 있으면 disk 반환 (마지막 Accept 상태 또는 원본)
        const diskContent = this.disk.get(filePath);
        if (diskContent !== undefined) {
            return diskContent;
        }

        // 3. 둘 다 없으면 editor에서 현재 내용 가져오기
        const editor = vscode.window.visibleTextEditors.find(
            e => e.document.uri.fsPath === filePath
        );

        if (editor) {
            return editor.document.getText();
        }

        return undefined;
    }

    /**
     * 현재 문서 내용 가져오기 (LLM 프롬프트용)
     *
     * ✅ Shadow Document Pattern 적용:
     * - 이제 getContentForEditing()을 호출하여 shadow(누적 상태) 반환
     * - 이전: pending changes 제외 → 원본 반환 → 중복 수정 문제
     * - 이후: shadow 반환 → 누적 상태 → 올바른 연속 수정
     *
     * @deprecated getContentForEditing() 사용 권장
     */
    public getCurrentDocumentContent(filePath: string): string | undefined {
        // ✅ Shadow Document Pattern: getContentForEditing() 호출
        return this.getContentForEditing(filePath);
    }

    /**
     * 원본(disk) 상태만 가져오기 (Accept/Reject 비교용)
     * - Shadow가 아닌 실제 disk 상태 반환
     * - Accept 전 상태 확인용
     */
    public getDiskContent(filePath: string): string | undefined {
        return this.disk.get(filePath);
    }

    /**
     * Shadow 상태만 가져오기 (디버깅/비교용)
     */
    public getShadowContent(filePath: string): string | undefined {
        return this.shadow.get(filePath);
    }



    /**
     * 마지막으로 적용된 changes 가져오기 (ToolExecutionCoordinator용)
     * ✅ showInlineDiff에서 계산한 결과를 캐시하여 재사용
     * 이렇게 하면 올바른 시점(apply 전)의 계산 결과를 사용할 수 있음
     */
    public getLastAppliedChanges(filePath: string): InlineChange[] {
        const changes = this.lastAppliedChanges.get(filePath);
        if (changes && changes.length > 0) {
            return changes;
        }

        // Fallback: pending changes에서 가져오기 (하위 호환성)
        const pending = this.pendingChanges.get(filePath);
        if (pending && pending.length > 0) {
            return pending.filter(c => c.status === 'pending');
        }

        return [];
    }

    /**
     * 모든 pending changes 가져오기
     */
    public getAllPendingFiles(): string[] {
        return Array.from(this.pendingChanges.keys());
    }

    /**
     * Pending changes 통계 가져오기 (UI 팝업용)
     * 각 파일별로 추가/삭제 라인 수와 함께 반환
     */
    public getPendingChangesStats(): Array<{
        filePath: string;
        fileName: string;
        addedLines: number;
        deletedLines: number;
        totalChanges: number;
    }> {
        const stats: Array<{
            filePath: string;
            fileName: string;
            addedLines: number;
            deletedLines: number;
            totalChanges: number;
        }> = [];

        for (const [filePath, changes] of this.pendingChanges.entries()) {
            const pendingChanges = changes.filter(c => c.status === 'pending');
            if (pendingChanges.length === 0) continue;

            let addedLines = 0;
            let deletedLines = 0;

            for (const change of pendingChanges) {
                if (change.type === 'add') {
                    addedLines += change.newText.split('\n').length;
                } else if (change.type === 'delete') {
                    deletedLines += change.oldText.split('\n').length;
                } else if (change.type === 'modify') {
                    const oldLines = change.oldText.split('\n').length;
                    const newLines = change.newText.split('\n').length;
                    addedLines += newLines;
                    deletedLines += oldLines;
                }
            }

            stats.push({
                filePath,
                fileName: path.basename(filePath),
                addedLines,
                deletedLines,
                totalChanges: pendingChanges.length
            });
        }

        return stats;
    }

    /**
     * Pending changes가 있는지 확인
     */
    public hasPendingChanges(): boolean {
        for (const [, changes] of this.pendingChanges.entries()) {
            if (changes.some(c => c.status === 'pending')) {
                return true;
            }
        }
        return false;
    }

    /**
     * 모든 파일의 모든 변경사항 승인
     */
    public async acceptAllChangesForAllFiles(): Promise<void> {
        const pendingFiles = this.getAllPendingFiles();
        for (const filePath of pendingFiles) {
            await this.acceptAllChanges(filePath);
        }
    }

    /**
     * 모든 파일의 모든 변경사항 거부
     */
    public async rejectAllChangesForAllFiles(): Promise<void> {
        const pendingFiles = this.getAllPendingFiles();
        for (const filePath of pendingFiles) {
            await this.rejectAllChanges(filePath);
        }
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Persistence: 영구 저장/복원
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    public setContext(context: vscode.ExtensionContext): void {
        this.extensionContext = context;
        this.loadPersistedState();
    }

    private serializeChange(c: InlineChange): SerializableInlineChange {
        return {
            ...c,
            range: {
                start: { line: c.range.start.line, character: c.range.start.character },
                end: { line: c.range.end.line, character: c.range.end.character },
            },
        };
    }

    private deserializeChange(sc: SerializableInlineChange): InlineChange {
        return {
            ...sc,
            range: new vscode.Range(
                new vscode.Position(sc.range.start.line, sc.range.start.character),
                new vscode.Position(sc.range.end.line, sc.range.end.character),
            ),
        };
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Turn Checkpoint Stack 메서드
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    /**
     * 턴 스냅샷 캡처: 파일이 수정되기 직전 상태를 턴 체크포인트 스택에 저장
     * - 같은 턴에서 같은 파일을 여러번 수정해도 첫 스냅샷만 유지
     * - 'legacy' turnId는 스킵 (하위 호환)
     */
    private pushTurnSnapshot(filePath: string, beforeContent: string, conversationTurnId: string): void {
        if (!conversationTurnId || conversationTurnId === 'legacy') { return; }

        let tc = this.turnCheckpointStack.find(t => t.conversationTurnId === conversationTurnId);
        if (!tc) {
            tc = {
                id: `tc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                conversationTurnId,
                fileSnapshots: new Map(),
                createdAt: Date.now(),
            };
            this.turnCheckpointStack.push(tc);
        }

        if (!tc.fileSnapshots.has(filePath)) {
            tc.fileSnapshots.set(filePath, beforeContent);
        }
    }

    /**
     * 파일 복원: 전체 내용을 교체 (cascade undo용)
     * - 빈 문자열이면 새 파일이었으므로 삭제
     */
    private async restoreFileContent(filePath: string, content: string): Promise<void> {
        const uri = vscode.Uri.file(filePath);

        // 빈 문자열 = 새 파일이었으므로 삭제
        if (content === '') {
            try {
                await vscode.workspace.fs.delete(uri);
                console.log(`[InlineDiffManager] Deleted new file on undo: ${path.basename(filePath)}`);
            } catch { /* 이미 삭제됨 */ }
            return;
        }

        let doc: vscode.TextDocument;
        try {
            doc = await vscode.workspace.openTextDocument(uri);
        } catch { return; }

        const fullRange = new vscode.Range(
            new vscode.Position(0, 0),
            doc.positionAt(doc.getText().length)
        );
        const edit = new vscode.WorkspaceEdit();
        edit.replace(uri, fullRange, content);
        await vscode.workspace.applyEdit(edit);

        if (doc.isDirty) {
            try { await doc.save(); } catch { /* non-fatal */ }
        }
    }

    private scheduleSave(): void {
        if (this.saveTimer) { clearTimeout(this.saveTimer); }
        this.saveTimer = setTimeout(() => { void this.savePersistedState(); }, 100);
    }

    private async savePersistedState(): Promise<void> {
        if (!this.extensionContext) { return; }
        try {
            // pending 상태가 있는 파일만 저장
            const pendingEntries: [string, SerializableInlineChange[]][] = [];
            const checkpointEntries: [string, SerializableCheckpoint][] = [];
            const shadowEntries: [string, string][] = [];
            const diskEntries: [string, string][] = [];
            const hashEntries: [string, string][] = [];

            for (const [filePath, changes] of this.pendingChanges.entries()) {
                const pending = changes.filter(c => c.status === 'pending');
                if (pending.length === 0) { continue; }
                pendingEntries.push([filePath, changes.map(c => this.serializeChange(c))]);

                const cp = this.checkpoints.get(filePath);
                if (cp) {
                    checkpointEntries.push([filePath, {
                        ...cp,
                        changes: cp.changes.map(c => this.serializeChange(c)),
                    }]);
                }
                const sh = this.shadow.get(filePath);
                if (sh !== undefined) { shadowEntries.push([filePath, sh]); }
                const dk = this.disk.get(filePath);
                if (dk !== undefined) { diskEntries.push([filePath, dk]); }
                // 디스크에서 실시간 해시 계산 (포맷터 실행 후 변경 반영)
                try {
                    const fs = require('fs');
                    const currentContent = fs.readFileSync(filePath, 'utf8');
                    const freshHash = crypto.createHash('sha256').update(currentContent).digest('hex');
                    hashEntries.push([filePath, freshHash]);
                    this.storedFileHashes.set(filePath, freshHash);
                } catch {
                    // 파일을 읽을 수 없으면 캐시된 해시 사용
                    const hash = this.storedFileHashes.get(filePath);
                    if (hash) { hashEntries.push([filePath, hash]); }
                }
            }

            if (pendingEntries.length === 0) {
                await this.extensionContext.globalState.update('inlineDiffState_v2', undefined);
                return;
            }

            // Turn Checkpoint Stack 직렬화
            const serializedTurnStack: SerializableTurnCheckpoint[] = this.turnCheckpointStack.map(tc => ({
                id: tc.id,
                conversationTurnId: tc.conversationTurnId,
                fileSnapshots: Array.from(tc.fileSnapshots.entries()),
                createdAt: tc.createdAt,
            }));

            const state: PersistedDiffState = {
                version: 3,
                savedAt: Date.now(),
                pendingChanges: pendingEntries,
                checkpoints: checkpointEntries,
                shadow: shadowEntries,
                disk: diskEntries,
                fileHashes: hashEntries,
                turnCheckpointStack: serializedTurnStack,
            };
            await this.extensionContext.globalState.update('inlineDiffState_v2', state);
        } catch (e) {
            console.error('[InlineDiffManager] Failed to persist state:', e);
        }
    }

    private async loadPersistedState(): Promise<void> {
        if (!this.extensionContext) { return; }
        try {
            const state = this.extensionContext.globalState.get<PersistedDiffState>('inlineDiffState_v2');
            if (!state || (state.version !== 2 && state.version !== 3)) { return; }

            // 24시간 초과 시 폐기
            const MAX_AGE = 24 * 60 * 60 * 1000;
            if (Date.now() - state.savedAt > MAX_AGE) {
                console.log('[InlineDiffManager] Persisted state expired (>24h), discarding');
                await this.extensionContext.globalState.update('inlineDiffState_v2', undefined);
                return;
            }

            let restoredFiles = 0;
            const fs = require('fs').promises;

            for (const [filePath, serializedChanges] of state.pendingChanges) {
                // 파일 해시 무결성 검사
                const savedHash = state.fileHashes.find(([fp]) => fp === filePath)?.[1];
                if (savedHash) {
                    try {
                        const currentContent = await fs.readFile(filePath, 'utf8');
                        const currentHash = crypto.createHash('sha256').update(currentContent).digest('hex');
                        if (currentHash !== savedHash) {
                            console.log(`[InlineDiffManager] File hash mismatch for ${filePath} (saved=${savedHash.substring(0, 8)}..., current=${currentHash.substring(0, 8)}...), discarding`);
                            continue;
                        }
                    } catch {
                        console.log(`[InlineDiffManager] Cannot read file ${filePath}, discarding`);
                        continue;
                    }
                }

                // 복원
                const changes = serializedChanges.map(sc => this.deserializeChange(sc));
                this.pendingChanges.set(filePath, changes);
                if (savedHash) { this.storedFileHashes.set(filePath, savedHash); }

                // checkpoint 복원
                const cpEntry = state.checkpoints.find(([fp]) => fp === filePath);
                if (cpEntry) {
                    const [, scp] = cpEntry;
                    this.checkpoints.set(filePath, {
                        ...scp,
                        changes: scp.changes.map(sc => this.deserializeChange(sc)),
                    });
                }

                // shadow / disk 복원
                const shEntry = state.shadow.find(([fp]) => fp === filePath);
                if (shEntry) { this.shadow.set(filePath, shEntry[1]); }
                const dkEntry = state.disk.find(([fp]) => fp === filePath);
                if (dkEntry) { this.disk.set(filePath, dkEntry[1]); }

                restoredFiles++;
            }

            // Turn Checkpoint Stack 복원 (v3+)
            if (state.turnCheckpointStack && state.turnCheckpointStack.length > 0) {
                this.turnCheckpointStack = state.turnCheckpointStack.map(stc => ({
                    id: stc.id,
                    conversationTurnId: stc.conversationTurnId,
                    fileSnapshots: new Map(stc.fileSnapshots),
                    createdAt: stc.createdAt,
                }));
                console.log(`[InlineDiffManager] Restored turn checkpoint stack: ${this.turnCheckpointStack.length} entries`);
            }

            if (restoredFiles > 0) {
                console.log(`[InlineDiffManager] Restored persisted state: ${restoredFiles} files`);
                this.scheduleDecorationRestore();
                this._onPendingChangedEmitter.fire();
            }

            // 복원 완료 후 저장된 상태 제거 (다음 변경 시 다시 저장됨)
            await this.extensionContext.globalState.update('inlineDiffState_v2', undefined);
        } catch (e) {
            console.error('[InlineDiffManager] Failed to load persisted state:', e);
        }
    }

    private scheduleDecorationRestore(): void {
        // 이미 열린 에디터에 500ms 후 적용
        setTimeout(() => {
            for (const editor of vscode.window.visibleTextEditors) {
                const filePath = editor.document.uri.fsPath;
                const changes = this.pendingChanges.get(filePath);
                if (changes) {
                    this.applyDecorationsToEditor(editor, changes);
                }
            }
        }, 500);

        // 나중에 열리는 에디터도 30초간 감시
        this.restorationDisposable = vscode.window.onDidChangeVisibleTextEditors(editors => {
            for (const editor of editors) {
                const filePath = editor.document.uri.fsPath;
                const changes = this.pendingChanges.get(filePath);
                if (changes) {
                    this.applyDecorationsToEditor(editor, changes);
                }
            }
        });
        setTimeout(() => {
            if (this.restorationDisposable) {
                this.restorationDisposable.dispose();
                this.restorationDisposable = undefined;
            }
        }, 30000);
    }

    private updateFileHash(filePath: string): void {
        try {
            const fs = require('fs');
            const content = fs.readFileSync(filePath, 'utf8');
            this.storedFileHashes.set(filePath, crypto.createHash('sha256').update(content).digest('hex'));
        } catch {
            // 파일을 읽을 수 없으면 해시 제거
            this.storedFileHashes.delete(filePath);
        }
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Turn-level Accept/Reject API
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    /**
     * 턴 단위 Accept: 해당 turnId의 모든 pending change를 파일별로 accept
     */
    public async acceptChangesByTurn(conversationTurnId: string): Promise<void> {
        console.log(`[InlineDiffManager] acceptChangesByTurn: ${conversationTurnId}`);

        // 에디터가 열려있는 파일은 acceptChange로 처리 (decoration 즉시 제거)
        // 에디터가 닫혀있는 파일은 직접 status 변경 + 정리
        for (const [filePath, changes] of this.pendingChanges.entries()) {
            const turnChanges = changes.filter(
                c => c.conversationTurnId === conversationTurnId && c.status === 'pending'
            );
            if (turnChanges.length === 0) { continue; }

            const editors = vscode.window.visibleTextEditors.filter(
                e => e.document.uri.fsPath === filePath
            );

            if (editors.length > 0) {
                // 에디터 열려있음 → 기존 acceptChange (decoration 처리 포함)
                for (const change of turnChanges) {
                    await this.acceptChange(filePath, change.id);
                }
            } else {
                // 에디터 닫혀있음 → status만 직접 변경
                for (const change of turnChanges) {
                    change.status = 'accepted';
                }
                this.pendingChanges.set(filePath, changes);

                // 남은 pending changes 확인하여 파일 정리
                const remainingPending = changes.filter(c => c.status === 'pending');
                if (remainingPending.length === 0) {
                    this.pendingChanges.delete(filePath);
                    this.originalContents.delete(filePath);
                    this.lastAppliedChanges.delete(filePath);
                    const shadowContent = this.shadow.get(filePath);
                    if (shadowContent !== undefined) {
                        this.disk.set(filePath, shadowContent);
                    }
                    this.clearAllDecorationsForFile(filePath);
                }
            }
        }

        // TurnCheckpoint 스택에서 제거 (accepted → 더 이상 undo 불필요)
        const idx = this.turnCheckpointStack.findIndex(
            tc => tc.conversationTurnId === conversationTurnId
        );
        if (idx !== -1) {
            this.turnCheckpointStack.splice(idx, 1);
            console.log(`[InlineDiffManager] Removed TurnCheckpoint for ${conversationTurnId.substring(0, 8)}, stack size: ${this.turnCheckpointStack.length}`);
        }

        this.scheduleSave();
        this._onPendingChangedEmitter.fire();
    }

    /**
     * Turn-level Reject with cascade undo (표준 체크포인트 패턴)
     * - Turn N을 undo하면 이후 모든 턴도 함께 undo (point-in-time restore)
     * - TurnCheckpoint의 파일 스냅샷으로 전체 파일 복원
     * - TurnCheckpoint가 없으면 레거시 per-change 방식 fallback
     */
    public async rejectChangesByTurn(conversationTurnId: string): Promise<void> {
        const targetIndex = this.turnCheckpointStack.findIndex(
            tc => tc.conversationTurnId === conversationTurnId
        );

        if (targetIndex === -1) {
            console.warn(`[InlineDiffManager] No TurnCheckpoint for ${conversationTurnId}, legacy fallback`);
            return this.rejectChangesByTurnLegacy(conversationTurnId);
        }

        // 1. Cascade: target + 이후 모든 턴 undo 대상
        const turnsToUndo = this.turnCheckpointStack.slice(targetIndex);
        const turnIdsToUndo = new Set(turnsToUndo.map(tc => tc.conversationTurnId));
        console.log(`[InlineDiffManager] Cascade undo: ${turnsToUndo.length} turn(s) from index ${targetIndex}`);

        // 2. pending 변경이 실제로 있는지 확인
        let hasPending = false;
        for (const [, changes] of this.pendingChanges) {
            if (changes.some(c => turnIdsToUndo.has(c.conversationTurnId) && c.status === 'pending')) {
                hasPending = true;
                break;
            }
        }
        if (!hasPending) {
            // pending 없음 → 스택만 정리
            this.turnCheckpointStack.splice(targetIndex);
            this.scheduleSave();
            this._onPendingChangedEmitter.fire();
            return;
        }

        // 3. 각 파일별 복원 대상 콘텐츠 결정 (가장 오래된 스냅샷 우선)
        const filesToRestore = new Map<string, string>();
        for (const tc of turnsToUndo) {
            for (const [fp, content] of tc.fileSnapshots) {
                if (!filesToRestore.has(fp)) {
                    filesToRestore.set(fp, content);
                }
            }
        }

        // 4. 파일 복원 (전체 내용 교체)
        for (const [fp, content] of filesToRestore) {
            await this.restoreFileContent(fp, content);
        }

        // 5. pending changes 정리
        for (const [fp] of filesToRestore) {
            const changes = this.pendingChanges.get(fp);
            if (!changes) { continue; }

            const remaining = changes.filter(c => !turnIdsToUndo.has(c.conversationTurnId));
            if (remaining.length === 0) {
                // 이 파일의 모든 변경이 undo 대상
                this.pendingChanges.delete(fp);
                this.originalContents.delete(fp);
                this.lastAppliedChanges.delete(fp);
                this.checkpoints.delete(fp);
                this.clearAllDecorationsForFile(fp);

                const restored = filesToRestore.get(fp)!;
                if (restored === '') {
                    this.shadow.delete(fp);
                    this.disk.delete(fp);
                } else {
                    this.shadow.set(fp, restored);
                    this.disk.set(fp, restored);
                }
            } else {
                // 이전 턴의 변경이 남아있음
                this.pendingChanges.set(fp, remaining);
                this.shadow.set(fp, filesToRestore.get(fp)!);
                this.refreshDecorations(fp);
            }
            this.documentVersions.delete(fp);
        }

        // 6. 스택에서 undo된 턴 제거
        this.turnCheckpointStack.splice(targetIndex);

        // 7. 정리
        const { DiffCodeLensProvider } = require('./DiffCodeLensProvider');
        DiffCodeLensProvider.getInstance().refresh();
        this.scheduleSave();
        this._onPendingChangedEmitter.fire();
        console.log(`[InlineDiffManager] Cascade undo complete. Stack size: ${this.turnCheckpointStack.length}`);
    }

    /**
     * 레거시 fallback: TurnCheckpoint 없는 턴의 per-change 방식 reject
     */
    private async rejectChangesByTurnLegacy(conversationTurnId: string): Promise<void> {
        console.log(`[InlineDiffManager] rejectChangesByTurnLegacy: ${conversationTurnId}`);
        const filesToProcess: Map<string, InlineChange[]> = new Map();

        for (const [filePath, changes] of this.pendingChanges.entries()) {
            const turnChanges = changes.filter(
                c => c.conversationTurnId === conversationTurnId && c.status === 'pending'
            );
            if (turnChanges.length > 0) {
                filesToProcess.set(filePath, turnChanges);
            }
        }

        for (const [filePath, turnChanges] of filesToProcess.entries()) {
            const sorted = [...turnChanges].sort((a, b) => b.startOffset - a.startOffset);
            for (const change of sorted) {
                await this.rejectChange(filePath, change.id);
            }
        }

        this.scheduleSave();
        this._onPendingChangedEmitter.fire();
    }

    /**
     * 턴별 pending 변경 통계 (webview 버튼 표시용)
     */
    public getPendingChangesByTurn(): Array<{
        conversationTurnId: string;
        files: Array<{ filePath: string; fileName: string; addedLines: number; deletedLines: number; isNewFile: boolean }>;
        totalFiles: number;
        totalChanges: number;
        cascadeUndoTurnCount: number; // 이 턴 undo 시 함께 undo되는 턴 수
    }> {
        const turnMap = new Map<string, Map<string, { addedLines: number; deletedLines: number }>>();

        for (const [filePath, changes] of this.pendingChanges.entries()) {
            for (const change of changes) {
                if (change.status !== 'pending' || !change.conversationTurnId) { continue; }
                let fileMap = turnMap.get(change.conversationTurnId);
                if (!fileMap) {
                    fileMap = new Map();
                    turnMap.set(change.conversationTurnId, fileMap);
                }
                let stats = fileMap.get(filePath);
                if (!stats) {
                    stats = { addedLines: 0, deletedLines: 0 };
                    fileMap.set(filePath, stats);
                }
                if (change.type === 'add') {
                    stats.addedLines += change.newText.split('\n').length;
                } else if (change.type === 'delete') {
                    stats.deletedLines += change.oldText.split('\n').length;
                } else if (change.type === 'modify') {
                    stats.addedLines += change.newText.split('\n').length;
                    stats.deletedLines += change.oldText.split('\n').length;
                }
            }
        }

        const result: Array<{
            conversationTurnId: string;
            files: Array<{ filePath: string; fileName: string; addedLines: number; deletedLines: number; isNewFile: boolean }>;
            totalFiles: number;
            totalChanges: number;
            cascadeUndoTurnCount: number;
        }> = [];

        for (const [turnId, fileMap] of turnMap.entries()) {
            const files: Array<{ filePath: string; fileName: string; addedLines: number; deletedLines: number; isNewFile: boolean }> = [];
            let totalChanges = 0;
            for (const [fp, stats] of fileMap.entries()) {
                // 새 파일 여부: checkpoint의 beforeContent가 빈 문자열이면 새 파일
                const checkpoint = this.checkpoints.get(fp);
                const isNewFile = checkpoint ? checkpoint.beforeContent === '' : false;
                files.push({
                    filePath: fp,
                    fileName: path.basename(fp),
                    addedLines: stats.addedLines,
                    deletedLines: stats.deletedLines,
                    isNewFile,
                });
                totalChanges += stats.addedLines + stats.deletedLines;
            }
            // Cascade 정보: 이 턴부터 스택 끝까지 몇 개 턴이 함께 undo 되는지
            const stackIndex = this.turnCheckpointStack.findIndex(
                tc => tc.conversationTurnId === turnId
            );
            const cascadeUndoTurnCount = stackIndex !== -1
                ? this.turnCheckpointStack.length - stackIndex
                : 1;

            result.push({
                conversationTurnId: turnId,
                files,
                totalFiles: files.length,
                totalChanges,
                cascadeUndoTurnCount,
            });
        }

        return result;
    }

    /**
     * 정리
     */
    public dispose(): void {
        // dispose 전 마지막 저장
        if (this.saveTimer) { clearTimeout(this.saveTimer); }
        this.savePersistedState();

        if (this.editorChangeDisposable) {
            this.editorChangeDisposable.dispose();
        }
        if (this.visibleEditorsDisposable) {
            this.visibleEditorsDisposable.dispose();
        }
        if (this.documentChangeDisposable) {
            this.documentChangeDisposable.dispose();
        }
        if (this.fileSystemWatcher) {
            this.fileSystemWatcher.dispose();
        }
        if (this.restorationDisposable) {
            this.restorationDisposable.dispose();
        }
        this._onPendingChangedEmitter.dispose();
        this.addedDecoration.dispose();
        this.deletedDecoration.dispose();
        this.pendingChanges.clear();
        this.originalContents.clear();
        this.checkpoints.clear();
        this.documentVersions.clear();
        this.storedFileHashes.clear();
        // ✅ Shadow Document Pattern: dispose 시 shadow/disk 정리
        this.shadow.clear();
        this.disk.clear();
        // ✅ Turn Checkpoint Stack 정리
        this.turnCheckpointStack = [];
    }
}
