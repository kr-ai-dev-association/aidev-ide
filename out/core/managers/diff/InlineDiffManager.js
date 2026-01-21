"use strict";
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
exports.InlineDiffManager = void 0;
const vscode = __importStar(require("vscode"));
const diff = __importStar(require("diff"));
class InlineDiffManager {
    static instance;
    pendingChanges = new Map(); // filePath -> changes[] (source of truth)
    originalContents = new Map(); // filePath -> originalContent (deprecated, checkpoint 사용)
    checkpoints = new Map(); // filePath -> checkpoint (파일당 활성 체크포인트 1개)
    documentVersions = new Map(); // filePath -> document version (range drift 방지)
    addedDecoration;
    deletedDecoration;
    editorChangeDisposable;
    visibleEditorsDisposable;
    documentChangeDisposable;
    fileSystemWatcher;
    lastKnownContent = new Map(); // filePath -> last known content (외부 변경 감지용)
    constructor() {
        // 추가된 라인 (초록색)
        this.addedDecoration = vscode.window.createTextEditorDecorationType({
            backgroundColor: new vscode.ThemeColor('diffEditor.insertedLineBackground'),
            isWholeLine: true,
            overviewRulerColor: 'green',
            overviewRulerLane: vscode.OverviewRulerLane.Left,
        });
        // 삭제된 라인 (빨간색, 취소선) - decoration.before로 표시
        // ⚠️ decoration.before를 사용할 때는 isWholeLine을 false로 설정해야 함
        this.deletedDecoration = vscode.window.createTextEditorDecorationType({
            isWholeLine: false, // decoration.before는 라인 위에 표시되므로 isWholeLine 불필요
            backgroundColor: new vscode.ThemeColor('diffEditor.removedLineBackground'), // 배경색 추가 (ghost decoration)
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
    setupEditorChangeListener() {
        // 활성 에디터 변경 감지
        this.editorChangeDisposable = vscode.window.onDidChangeActiveTextEditor(async (editor) => {
            if (!editor)
                return;
            const filePath = editor.document.uri.fsPath;
            const changes = this.pendingChanges.get(filePath);
            if (changes && changes.length > 0) {
                // 에디터가 완전히 로드될 때까지 대기 후 decoration 재적용
                setTimeout(() => {
                    this.reapplyDecorationsForEditor(editor);
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
                        this.reapplyDecorationsForEditor(editor);
                    }, 100);
                }
            }
        });
    }
    /**
     * 두 Range가 겹치는지 확인
     */
    rangesOverlap(range1, range2) {
        // range1이 range2와 겹치거나 포함하는지 확인
        return range1.start.line <= range2.end.line && range1.end.line >= range2.start.line;
    }
    /**
     * 두 change가 동일한지 확인 (change identity dedupe)
     *
     * oldText/newText, 같은 offset이면 같은 change
     */
    isSameChange(a, b) {
        return (a.filePath === b.filePath &&
            a.startOffset === b.startOffset &&
            a.endOffset === b.endOffset &&
            a.oldText === b.oldText &&
            a.newText === b.newText &&
            a.type === b.type);
    }
    /**
     * Change가 document에 여전히 살아있는지 확인 (state-based)
     *
     * editor ❌, filesystem event ❌, timestamp ❌
     * 오직 텍스트 상태만 본다
     */
    isChangeAlive(change, document) {
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
        }
        catch (error) {
            // range 계산 실패 시 dead로 간주
            return false;
        }
    }
    /**
     * Document 상태 기반으로 모든 change 재평가 (state-based reconciliation)
     *
     * 중앙 집중식 reconciliation
     * - editor lifecycle에 의존하지 않음
     * - filesystem event를 판단 트리거로만 사용
     * - 오직 document 상태만 본다
     */
    async reconcileChanges(filePath) {
        const changes = this.pendingChanges.get(filePath);
        if (!changes || changes.length === 0) {
            return;
        }
        try {
            // Document 가져오기 (editor 없이도 가능)
            const uri = vscode.Uri.file(filePath);
            const document = await vscode.workspace.openTextDocument(uri);
            let hasDirtyChanges = false;
            // 각 change를 document 상태와 비교
            for (const change of changes) {
                if (change.status !== 'pending') {
                    continue; // 이미 처리된 change는 건너뛰기
                }
                // Change가 여전히 살아있는지 확인
                if (!this.isChangeAlive(change, document)) {
                    console.log(`[InlineDiffManager] Change ${change.id} is no longer alive, marking as dirty`);
                    change.status = 'dirty';
                    hasDirtyChanges = true;
                }
            }
            if (hasDirtyChanges) {
                // Decoration 재적용 (dirty change는 자동 제외됨)
                const editors = vscode.window.visibleTextEditors.filter(e => e.document.uri.fsPath === filePath);
                for (const editor of editors) {
                    this.applyDecorationsToEditor(editor, changes);
                }
                // CodeLens 새로고침
                const { DiffCodeLensProvider } = require('./DiffCodeLensProvider');
                DiffCodeLensProvider.getInstance().refresh();
                const remainingPending = changes.filter(c => c.status === 'pending').length;
                console.log(`[InlineDiffManager] Reconciled changes for ${filePath}, remaining pending: ${remainingPending}`);
            }
        }
        catch (error) {
            // 파일이 삭제되었거나 접근할 수 없는 경우
            console.log(`[InlineDiffManager] File ${filePath} is no longer accessible during reconciliation`);
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
     * 사용자 수동 수정 처리
     * - 겹친 change만 dirty로 표시
     * - 나머지 change는 유지
     * - 절대 clearAllDiff() 하지 않음
     */
    setupDocumentChangeListener() {
        this.documentChangeDisposable = vscode.workspace.onDidChangeTextDocument((e) => {
            // 사용자가 직접 편집한 경우에만 처리 (extension이 수정한 경우는 제외)
            if (e.contentChanges.length === 0)
                return;
            const filePath = e.document.uri.fsPath;
            const changes = this.pendingChanges.get(filePath);
            if (!changes || changes.length === 0) {
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
                    console.warn(`[InlineDiffManager] Document version mismatch for ${filePath}: expected ${expectedVersion}, got ${actualVersion}. Marking all pending changes as dirty.`);
                    // version mismatch 시 모든 pending change를 dirty로 표시
                    for (const aiChange of currentChanges) {
                        if (aiChange.status === 'pending') {
                            aiChange.status = 'dirty';
                            hasDirtyChanges = true;
                        }
                    }
                }
                else {
                    // ✅ 각 contentChange에 대해 semantic 겹침 판정
                    const currentDocumentText = e.document.getText();
                    for (const docChange of contentChanges) {
                        // VS Code의 contentChange는 range를 직접 제공
                        const docChangeRange = docChange.range;
                        const docChangeStartOffset = e.document.offsetAt(docChangeRange.start);
                        const docChangeEndOffset = e.document.offsetAt(docChangeRange.end);
                        for (const aiChange of currentChanges) {
                            // pending 상태인 change만 확인
                            if (aiChange.status !== 'pending')
                                continue;
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
                                    // change.newText와 현재 document의 해당 위치 텍스트가 다르면 dirty
                                    if (currentText !== aiChange.newText) {
                                        isDirty = true;
                                    }
                                }
                                catch (error) {
                                    // range 계산 실패 시 안전하게 dirty 처리
                                    isDirty = true;
                                }
                            }
                            // 4. change.oldText와 document 불일치 (delete 타입의 경우)
                            if (!isDirty && aiChange.type === 'delete') {
                                // delete 타입은 newText가 없으므로 oldText 기준으로 확인
                                // 현재 document에서 oldText가 예상 위치에 있는지 확인 (있으면 문제)
                                const checkOffset = Math.max(0, Math.min(aiChange.startOffset, currentDocumentText.length));
                                const checkText = currentDocumentText.substring(checkOffset, Math.min(currentDocumentText.length, checkOffset + aiChange.oldText.length));
                                // oldText가 예상 위치에 있으면 사용자가 수동으로 복원한 것
                                if (checkText === aiChange.oldText) {
                                    isDirty = true;
                                }
                            }
                            if (isDirty) {
                                console.log(`[InlineDiffManager] User edit semantically overlaps with AI change ${aiChange.id} (${aiChange.type}), marking as dirty`);
                                aiChange.status = 'dirty';
                                hasDirtyChanges = true;
                            }
                        }
                    }
                }
                if (hasDirtyChanges) {
                    // ✅ 상태 기반 재생성: dirty change는 제외하고 나머지 pending change만 decoration 재적용
                    const editors = vscode.window.visibleTextEditors.filter(ed => ed.document.uri.fsPath === filePath);
                    for (const editor of editors) {
                        // ✅ 상태 기반 재생성: 모든 change를 다시 적용 (dirty는 자동 제외됨)
                        this.applyDecorationsToEditor(editor, currentChanges);
                    }
                    // CodeLens 새로고침 (dirty change는 CodeLens 생성 안 함)
                    const { DiffCodeLensProvider } = require('./DiffCodeLensProvider');
                    DiffCodeLensProvider.getInstance().refresh();
                    console.log(`[InlineDiffManager] Marked overlapping changes as dirty for ${filePath}, remaining pending changes: ${currentChanges.filter(c => c.status === 'pending').length}`);
                }
            }, 100);
        });
    }
    /**
     * 외부 변경 감지 리스너 설정 (CLI/formatter/tsc 등)
     *
     * 외부 도구가 파일을 수정하면 pending diff 전부 무효화
     * - decoration 제거
     * - CodeLens 제거
     * - checkpoint 폐기 (advance 아님)
     * - 다음 LLM 요청은 clean context
     */
    setupExternalChangeListener() {
        // 파일 시스템 watcher 설정 (workspace 전체)
        const pattern = new vscode.RelativePattern(vscode.workspace.workspaceFolders?.[0] || vscode.Uri.file(process.cwd()), '**/*');
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
            // 약간의 지연을 두어 extension 수정과 외부 변경을 구분
            setTimeout(async () => {
                try {
                    // 파일이 여전히 존재하는지 확인
                    const document = await vscode.workspace.openTextDocument(uri);
                    const currentContent = document.getText();
                    const lastKnownContent = this.lastKnownContent.get(filePath);
                    // extension이 수정한 경우는 lastKnownContent가 업데이트되어 있음
                    // 외부 변경은 lastKnownContent와 다름
                    if (lastKnownContent !== undefined && currentContent === lastKnownContent) {
                        // extension이 수정한 경우 - reconciliation만 수행
                        await this.reconcileChanges(filePath);
                        return;
                    }
                    // ✅ 외부 변경 감지: change 단위로 판단 (무조건 invalidate 금지)
                    console.log(`[InlineDiffManager] External modification detected for ${filePath}, reconciling changes`);
                    await this.reconcileChanges(filePath);
                }
                catch (error) {
                    // 파일이 삭제되었거나 접근할 수 없는 경우에만 invalidate
                    console.log(`[InlineDiffManager] File ${filePath} is no longer accessible, invalidating pending diffs`);
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
     * 외부 도구가 파일을 수정하면 AI 제안은 더 이상 신뢰할 수 없음
     * - decoration 제거
     * - CodeLens 제거
     * - checkpoint 폐기 (advance 아님)
     * - pendingChanges 삭제
     */
    invalidateFile(filePath, options) {
        const changes = this.pendingChanges.get(filePath);
        if (!changes || changes.length === 0) {
            return;
        }
        console.log(`[InlineDiffManager] Invalidating file ${filePath} (reason: ${options?.reason || 'unknown'}, source: ${options?.source || 'unknown'})`);
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
        this.lastKnownContent.delete(filePath);
        console.log(`[InlineDiffManager] Invalidated all pending diffs for ${filePath}`);
    }
    static getInstance() {
        if (!InlineDiffManager.instance) {
            InlineDiffManager.instance = new InlineDiffManager();
        }
        return InlineDiffManager.instance;
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
    async showInlineDiff(filePath, originalContent, newContent) {
        const uri = vscode.Uri.file(filePath);
        // 새 파일의 경우 파일이 존재하지 않을 수 있으므로 확인
        const isNewFile = originalContent === '';
        // 파일 열기 (이미 열려있으면 활성화)
        let editor = vscode.window.visibleTextEditors.find(e => e.document.uri.fsPath === filePath);
        if (!editor) {
            // 새 파일이거나 아직 열리지 않은 경우
            try {
                editor = await vscode.window.showTextDocument(uri, {
                    preserveFocus: false,
                    preview: false,
                });
            }
            catch (error) {
                // 파일이 존재하지 않으면 새로 생성
                if (isNewFile) {
                    // 새 파일 생성 (빈 파일로 시작)
                    const fs = require('fs').promises;
                    const path = require('path');
                    await fs.mkdir(path.dirname(filePath), { recursive: true });
                    await fs.writeFile(filePath, '', 'utf8');
                    // 다시 열기
                    editor = await vscode.window.showTextDocument(uri, {
                        preserveFocus: false,
                        preview: false,
                    });
                }
                else {
                    throw error;
                }
            }
        }
        else {
            await vscode.window.showTextDocument(editor.document, {
                preserveFocus: false,
            });
        }
        // ✅ STEP 1: Checkpoint 생성 (AI가 파일을 수정하기 직전의 전체 스냅샷)
        // 에디터의 현재 내용 확인 (이미 accept한 변경사항이 있을 수 있음)
        const currentEditorContent = editor.document.getText();
        // Checkpoint 기준점 결정: 기존 pending change가 있으면 현재 document 상태, 없으면 originalContent
        const existingChanges = this.pendingChanges.get(filePath);
        let checkpointBeforeContent;
        if (existingChanges && existingChanges.length > 0) {
            // 기존 pending change가 있으면 현재 document 상태를 checkpoint로 사용
            checkpointBeforeContent = currentEditorContent;
            console.log(`[InlineDiffManager] Creating checkpoint with current document state (${existingChanges.length} existing changes)`);
        }
        else {
            // 기존 change가 없으면 originalContent를 checkpoint로 사용
            checkpointBeforeContent = originalContent === '' ? '' : (currentEditorContent || originalContent);
            console.log(`[InlineDiffManager] Creating checkpoint with original content`);
        }
        // ✅ STEP 2: LLM 응답을 문서에 즉시 적용
        // ⚠️ 중요: 이 시점에 사용자가 보는 파일은 이미 변경된 상태!
        const edit = new vscode.WorkspaceEdit();
        const fullRange = new vscode.Range(new vscode.Position(0, 0), editor.document.positionAt(currentEditorContent.length));
        edit.replace(uri, fullRange, newContent);
        await vscode.workspace.applyEdit(edit);
        // 문서 적용 후 에디터 새로고침 대기
        await new Promise(resolve => setTimeout(resolve, 100));
        // 적용 후 현재 문서 내용 가져오기
        const afterContent = editor.document.getText();
        // ✅ STEP 3: Diff 계산 (checkpoint.content vs document.getText())
        // ❌ LLM이 말한 diff 사용 안 함!
        // ✅ 실제 적용 결과로 diff 계산!
        const newChanges = this.analyzeChanges(checkpointBeforeContent, afterContent);
        // ✅ 중복 방지 가드 1: 이미 동일한 내용이 document에 있으면 skip
        const contentFilteredChanges = [];
        for (const change of newChanges) {
            // change.newText가 이미 document에 있는지 확인
            if (change.newText && change.newText.trim()) {
                const newTextTrimmed = change.newText.trim();
                if (afterContent.includes(newTextTrimmed)) {
                    // 이미 존재하는지 더 정확히 확인 (중복 삽입 방지)
                    const existingCount = (afterContent.match(new RegExp(newTextTrimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
                    if (existingCount > 1) {
                        console.log(`[InlineDiffManager] Skipping duplicate change: ${change.id} (content already exists in document)`);
                        continue; // 중복이면 skip
                    }
                }
            }
            contentFilteredChanges.push(change);
        }
        // ✅ 기존 pending change는 모두 유지 (같은 파일에 여러 개의 pending change가 공존)
        const existingPendingChanges = (existingChanges || []).filter(c => c.status === 'pending');
        const existingProcessedChanges = (existingChanges || []).filter(c => c.status === 'accepted' || c.status === 'rejected');
        // ✅ 중복 방지 가드 2: 기존 pending change와 동일한 change인지 확인 (change identity dedupe)
        const finalNewChanges = [];
        for (const newChange of contentFilteredChanges) {
            // 기존 pending change와 비교
            let isDuplicate = false;
            for (const existingChange of existingPendingChanges) {
                if (this.isSameChange(newChange, existingChange)) {
                    console.log(`[InlineDiffManager] Skipping duplicate change: ${newChange.id} (same as existing ${existingChange.id})`);
                    isDuplicate = true;
                    break;
                }
            }
            if (!isDuplicate) {
                finalNewChanges.push(newChange);
            }
        }
        // 각 change에 status, filePath, checkpointId 설정
        const checkpointId = `checkpoint_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        finalNewChanges.forEach((change, index) => {
            // ✅ 핵심: 고유한 change ID 생성 (중복 방지)
            // 기존 change.id는 analyzeChanges에서 생성된 임시 ID이므로 고유 ID로 재설정
            change.id = `change_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${index}`;
            change.filePath = filePath;
            change.status = 'pending';
            change.checkpointId = checkpointId;
        });
        // ✅ 기존 pending change의 range를 새 change에 맞게 업데이트
        // 새 change가 추가되면 기존 change의 라인 번호가 shift될 수 있음
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
            // range 업데이트
            if (lineOffset !== 0) {
                const updatedChange = { ...existingChange };
                updatedChange.range = new vscode.Range(new vscode.Position(existingChange.range.start.line + lineOffset, existingChange.range.start.character), new vscode.Position(existingChange.range.end.line + lineOffset, existingChange.range.end.character));
                updatedChange.line = existingChange.line + lineOffset;
                return updatedChange;
            }
            return existingChange;
        });
        // ✅ STEP 4: InlineChange 객체 병합
        const allChanges = [
            ...updatedExistingPendingChanges, // 기존 pending change 유지 (range 업데이트됨)
            ...existingProcessedChanges, // 기존 accepted/rejected change 유지
            ...finalNewChanges // 새 pending change 추가 (중복 제거됨)
        ];
        // ✅ Checkpoint 저장
        const checkpoint = {
            id: checkpointId,
            fileUri: filePath,
            beforeContent: checkpointBeforeContent, // AI가 파일을 수정하기 직전 상태
            changes: finalNewChanges, // 이 checkpoint에 연결된 change만 포함 (중복 제거됨)
            status: 'pending',
            createdAt: Date.now(),
        };
        // 하위 호환성: originalContents 저장
        if (!this.originalContents.has(filePath)) {
            this.originalContents.set(filePath, originalContent);
        }
        this.pendingChanges.set(filePath, allChanges);
        this.checkpoints.set(filePath, checkpoint);
        // ✅ extension이 수정한 내용을 기록 (외부 변경 감지용)
        this.lastKnownContent.set(filePath, afterContent);
        console.log(`[InlineDiffManager] Applied AI changes to ${filePath}: ${finalNewChanges.length} new changes (${newChanges.length - finalNewChanges.length} duplicates skipped), ${allChanges.length} total changes (${existingPendingChanges.length} existing pending, ${existingProcessedChanges.length} processed)`);
        // ✅ STEP 5: Decoration 적용
        // editor는 decoration 렌더링 용도만, 상태는 document 기반
        setTimeout(() => {
            // 현재 visible editors에서 해당 파일 찾기
            const currentEditor = vscode.window.visibleTextEditors.find(e => e.document.uri.fsPath === filePath);
            if (currentEditor) {
                this.applyDecorationsToEditor(currentEditor, allChanges);
                // CodeLens 새로고침 (Accept/Reject 버튼 표시)
                const { DiffCodeLensProvider } = require('./DiffCodeLensProvider');
                DiffCodeLensProvider.getInstance().refresh();
            }
            else {
                // ✅ Editor가 없어도 상태는 유지 (decoration은 editor가 열릴 때 자동 적용됨)
                // CodeLens는 editor 없이도 작동할 수 있으므로 새로고침
                const { DiffCodeLensProvider } = require('./DiffCodeLensProvider');
                DiffCodeLensProvider.getInstance().refresh();
            }
        }, 200);
    }
    /**
     * 원본과 새 내용을 비교하여 변경사항 추출
     * 각 변경 블록(연속된 삭제+추가)을 하나의 change로 묶음
     * ✅ offset 계산: newContent 기준으로 절대 문자 위치 계산
     */
    analyzeChanges(originalContent, newContent) {
        const changes = [];
        const newLines = newContent.split('\n');
        // 라인 시작 offset 계산 (각 라인의 시작 위치)
        const lineStartOffsets = [0];
        let currentOffset = 0;
        for (let i = 0; i < newLines.length - 1; i++) {
            currentOffset += newLines[i].length + 1; // +1 for \n
            lineStartOffsets.push(currentOffset);
        }
        // 새 파일인 경우: 모든 라인을 추가된 것으로 처리
        if (!originalContent || originalContent.trim() === '') {
            if (newLines.length > 0 && (newLines.length > 1 || newLines[0] !== '')) {
                // 빈 파일이 아닌 경우에만 change 추가
                const nonEmptyLines = newLines.filter((line, index) => index < newLines.length - 1 || line !== '');
                if (nonEmptyLines.length > 0) {
                    const startOffset = 0;
                    const endOffset = newContent.length;
                    changes.push({
                        id: 'change_0',
                        filePath: '',
                        range: new vscode.Range(0, 0, nonEmptyLines.length - 1, Number.MAX_SAFE_INTEGER),
                        startOffset,
                        endOffset,
                        oldText: '',
                        newText: newContent,
                        type: 'add',
                        line: 0,
                        status: 'pending',
                        checkpointId: '', // 나중에 showInlineDiff에서 설정됨
                        createdAt: Date.now(),
                    });
                }
            }
            return changes;
        }
        const diffs = diff.diffLines(originalContent, newContent);
        let originalLine = 0; // originalContent 기준 라인 번호
        let newLine = 0; // newContent 기준 라인 번호
        let changeId = 0;
        let pendingDelete = null;
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
            }
            else if (part.added) {
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
                    });
                    pendingDelete = null;
                }
                else {
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
                    });
                }
                newLine += part.count || 0;
            }
            else {
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
                id: `change_${changeId++}`,
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
    getCurrentRange(change, document) {
        try {
            // offset이 document 범위를 벗어나면 range 사용 (fallback)
            if (change.startOffset < 0 || change.endOffset > document.getText().length) {
                return change.range;
            }
            const start = document.positionAt(change.startOffset);
            const end = document.positionAt(change.endOffset);
            return new vscode.Range(start, end);
        }
        catch (error) {
            // offset 계산 실패 시 range 사용 (fallback)
            console.warn(`[InlineDiffManager] Failed to calculate range from offset for change ${change.id}, using range fallback`);
            return change.range;
        }
    }
    /**
     * 특정 에디터에 Decoration 적용 (상태 기반 재생성)
     *
     * decoration은 상태 기반 재생성
     * - 절대 clearAllDecorations() 후 재생성하지 않음
     * - 상태별로 decoration 재계산
     * - pending: 초록색 배경
     * - dirty: 주황색 배경 (선택적)
     *
     * 🔥 핵심: 삭제된 코드는 decoration.before로 표시 (문서에 실제로 존재하지 않음)
     */
    applyDecorationsToEditor(editor, changes) {
        if (!editor || !editor.document) {
            return;
        }
        // ✅ 상태 기반 필터링: pending만 decoration 적용 (dirty는 제외)
        const pendingChanges = changes.filter(c => c.status === 'pending');
        if (pendingChanges.length === 0) {
            this.clearAllDecorationsForEditor(editor);
            return;
        }
        const deletedDecorations = [];
        const addedRanges = [];
        for (const change of pendingChanges) {
            try {
                // ✅ offset 기반으로 현재 range 계산 (document 변경 후에도 정확함)
                const currentRange = this.getCurrentRange(change, editor.document);
                // ✅ decoration 생성 가능 여부 확인
                if (currentRange.start.line < 0 || currentRange.end.line >= editor.document.lineCount) {
                    console.warn(`[InlineDiffManager] Skipping decoration for change ${change.id}: range out of bounds (start: ${currentRange.start.line}, end: ${currentRange.end.line}, doc lines: ${editor.document.lineCount})`);
                    continue;
                }
                if (change.type === 'add' || change.type === 'modify') {
                    // 추가/수정된 라인: 초록색 배경
                    const startLine = currentRange.start.line;
                    const endLine = currentRange.end.line;
                    for (let line = startLine; line <= endLine; line++) {
                        if (line >= 0 && line < editor.document.lineCount) {
                            addedRanges.push(new vscode.Range(line, 0, line, Number.MAX_SAFE_INTEGER));
                        }
                    }
                }
            }
            catch (error) {
                console.warn(`[InlineDiffManager] Failed to apply decoration for change ${change.id}:`, error);
                continue;
            }
            if (change.type === 'delete' || change.type === 'modify') {
                try {
                    // ✅ offset 기반으로 현재 range 계산
                    const currentRange = this.getCurrentRange(change, editor.document);
                    // 삭제된 코드: decoration.before로 표시 (선택/편집 불가)
                    // modify의 경우: 삭제된 라인(oldLine)을 신규 라인(newLine) 위에 표시
                    // delete의 경우: 다음 unchanged 라인 위에 표시
                    const targetLine = change.type === 'modify'
                        ? currentRange.start.line // modify: newLine의 시작 라인 위에 oldLine 표시
                        : Math.min(change.line, editor.document.lineCount);
                    if (targetLine >= 0 && targetLine <= editor.document.lineCount && change.oldText && change.oldText.trim() !== '') {
                        // 삭제된 라인들을 각각 개별 decoration으로 표시
                        // VS Code는 같은 라인에 여러 decoration을 자동으로 위로 쌓아줌
                        const deletedLines = change.oldText.split('\n');
                        // 마지막 빈 줄 제거 (split('\n')의 특성상)
                        const filteredLines = deletedLines.filter((line, index) => index < deletedLines.length - 1 || line !== '');
                        console.log(`[InlineDiffManager] Processing ${change.type} change: oldText="${change.oldText.substring(0, 50)}...", targetLine=${targetLine}, filteredLines=${filteredLines.length}`);
                        // 각 삭제된 라인을 개별 decoration으로 표시
                        // 역순으로 추가하여 첫 번째 줄이 가장 위에 오도록
                        for (let i = filteredLines.length - 1; i >= 0; i--) {
                            const deletedLine = filteredLines[i];
                            // 빈 줄도 표시 (의미 있는 삭제일 수 있음)
                            // ✅ oldText의 들여쓰기 유지 (시각적 일관성)
                            // 들여쓰기가 있으면 그대로 표시, 없으면 공백 추가하지 않음
                            const displayText = deletedLine || ' '; // 빈 줄은 공백으로 표시
                            // ✅ decoration.before를 사용할 때는 range가 정확한 라인을 가리켜야 함
                            const safeTargetLine = Math.max(0, Math.min(targetLine, editor.document.lineCount - 1));
                            // ✅ VS Code decoration.before는 라인의 첫 번째 문자 앞에 표시됨
                            // modify의 경우: oldText를 newText 라인 위에 표시하려면 이전 라인 사용
                            // 하지만 decoration.before는 실제로 라인 위에 별도 라인으로 표시되지 않음
                            // 대신 현재 라인의 시작 부분에 인라인으로 표시됨
                            // ✅ 해결책: 이전 라인의 끝에 배치하여 시각적으로 위에 표시되도록 함
                            const decorationLine = safeTargetLine > 0 ? safeTargetLine - 1 : safeTargetLine;
                            const prevLine = editor.document.lineAt(decorationLine);
                            const decorationRange = new vscode.Range(decorationLine, prevLine.text.length, // 이전 라인의 끝에 배치
                            decorationLine, prevLine.text.length);
                            console.log(`[InlineDiffManager] Creating before decoration for line ${safeTargetLine} (decoration at line ${decorationLine}, end): "${displayText.substring(0, 30)}..."`);
                            deletedDecorations.push({
                                range: decorationRange,
                                renderOptions: {
                                    before: {
                                        contentText: '\n' + displayText, // 줄바꿈을 앞에 추가하여 새 라인으로 표시
                                        color: new vscode.ThemeColor('diffEditor.removedLineForeground'),
                                        textDecoration: 'line-through',
                                        fontWeight: 'normal',
                                        // backgroundColor는 decoration 자체에 설정됨
                                    },
                                },
                            });
                        }
                    }
                    else {
                        console.log(`[InlineDiffManager] Skipping ${change.type} decoration: targetLine=${targetLine}, oldText="${change.oldText ? change.oldText.substring(0, 30) : 'empty'}..."`);
                    }
                }
                catch (error) {
                    console.warn(`[InlineDiffManager] Failed to apply delete decoration for change ${change.id}:`, error);
                    continue;
                }
            }
        }
        // Decoration 적용
        editor.setDecorations(this.addedDecoration, addedRanges);
        editor.setDecorations(this.deletedDecoration, deletedDecorations);
        const filePath = editor.document.uri.fsPath;
        const appliedCount = addedRanges.length + deletedDecorations.length;
        const skippedCount = pendingChanges.length - appliedCount;
        if (skippedCount > 0) {
            console.warn(`[InlineDiffManager] Applied decorations for ${filePath}: ${addedRanges.length} added, ${deletedDecorations.length} deleted, ${skippedCount} skipped (total changes: ${changes.length}, pending: ${pendingChanges.length}, editor lines: ${editor.document.lineCount})`);
        }
        else {
            console.log(`[InlineDiffManager] Applied decorations for ${filePath}: ${addedRanges.length} added, ${deletedDecorations.length} deleted (total changes: ${changes.length}, pending: ${pendingChanges.length}, editor lines: ${editor.document.lineCount})`);
        }
    }
    /**
     * Decoration 상태 기반 재생성 (언제든 호출 가능한 순수 함수)
     *
     * decoration은 상태 기반 재생성
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
    refreshDecorations(filePath) {
        const editors = vscode.window.visibleTextEditors.filter(e => e.document.uri.fsPath === filePath);
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
     * 특정 에디터에 대해 Decoration 재적용
     */
    reapplyDecorationsForEditor(editor) {
        if (!editor || !editor.document) {
            return;
        }
        const filePath = editor.document.uri.fsPath;
        this.refreshDecorations(filePath);
    }
    /**
     * 특정 변경사항 승인 (change 단위)
     *
     * Accept는 상태 전이
     * - "이 변경은 더 이상 AI 변경이 아니다"
     * - 상태만 변경 (pending → accepted)
     * - 문서 내용은 이미 반영된 상태 (변경 없음)
     * - VS Code Undo 스택과 완전히 분리
     */
    async acceptChange(filePath, changeId) {
        const changes = this.pendingChanges.get(filePath);
        if (!changes) {
            console.warn(`[InlineDiffManager] acceptChange: No changes found for ${filePath}`);
            return;
        }
        // ✅ 핵심: 정확한 change ID 매칭 (고유 ID 사용)
        const change = changes.find(c => c.id === changeId);
        if (!change) {
            console.warn(`[InlineDiffManager] acceptChange: Change ${changeId} not found in ${filePath}. Available changes: ${changes.map(c => `${c.id}(${c.type})`).join(', ')}`);
            return;
        }
        console.log(`[InlineDiffManager] Accepting change ${changeId} in ${filePath} (type: ${change.type}, range: ${change.range.start.line}-${change.range.end.line})`);
        // 현재 visible editors에서 해당 파일 찾기
        const editors = vscode.window.visibleTextEditors.filter(e => e.document.uri.fsPath === filePath);
        if (editors.length === 0) {
            return;
        }
        // 🔥 Accept: 문서에는 이미 newContent가 있으므로, decoration만 제거하면 됨
        // (삭제된 라인은 decoration.before로만 표시되었으므로 문서에서 제거할 필요 없음)
        // ⚠️ VS Code Undo 스택과 분리: 문서 수정 없음
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
            const changesAfterThisCheckpoint = changes.filter(c => c.status === 'pending' &&
                c.checkpointId === checkpoint.id &&
                c.createdAt > change.createdAt);
            // 이후 pending change가 없으면 checkpoint advance
            if (changesAfterThisCheckpoint.length === 0) {
                // 해당 checkpoint의 모든 change가 처리되었는지 확인
                const checkpointChanges = changes.filter(c => c.checkpointId === checkpoint.id);
                const allProcessed = checkpointChanges.every(c => c.status === 'accepted' || c.status === 'rejected');
                if (allProcessed) {
                    // checkpoint의 모든 change가 처리되었으므로 checkpoint advance
                    checkpoint.status = 'accepted';
                    console.log(`[InlineDiffManager] Checkpoint ${checkpoint.id} advanced (all changes processed)`);
                }
            }
        }
        // decoration 재적용 (pending 상태인 change만 표시)
        const pendingChanges = changes.filter(c => c.status === 'pending');
        if (pendingChanges.length === 0) {
            // 모든 변경사항이 승인되었으므로 정리
            this.pendingChanges.delete(filePath);
            this.originalContents.delete(filePath);
            // 모든 에디터에서 decoration 제거
            for (const editor of editors) {
                this.clearAllDecorationsForEditor(editor);
            }
        }
        else {
            // 남은 변경사항에 대해 decoration 재적용
            // ✅ 핵심: setTimeout 내부에서 최신 editors와 changes를 가져와야 함
            setTimeout(() => {
                // 최신 editors 가져오기 (에디터가 변경되었을 수 있음)
                const currentEditors = vscode.window.visibleTextEditors.filter(e => e.document.uri.fsPath === filePath);
                // 최신 changes 가져오기 (다른 곳에서 변경되었을 수 있음)
                const currentChanges = this.pendingChanges.get(filePath);
                if (!currentChanges || currentChanges.length === 0) {
                    console.log(`[InlineDiffManager] No changes found for ${filePath} after accept`);
                    return;
                }
                // 남은 pending changes 확인
                const remainingPending = currentChanges.filter(c => c.status === 'pending');
                console.log(`[InlineDiffManager] After accept ${changeId}: ${remainingPending.length} pending changes remaining out of ${currentChanges.length} total`);
                if (remainingPending.length === 0) {
                    // 모든 변경사항이 처리되었으므로 정리
                    this.pendingChanges.delete(filePath);
                    this.originalContents.delete(filePath);
                    for (const editor of currentEditors) {
                        this.clearAllDecorationsForEditor(editor);
                    }
                }
                else {
                    // 남은 pending changes에 대해 decoration 재적용
                    console.log(`[InlineDiffManager] Reapplying decorations for ${remainingPending.length} pending changes`);
                    for (const editor of currentEditors) {
                        this.applyDecorationsToEditor(editor, currentChanges);
                    }
                }
            }, 100);
        }
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
        // ✅ extension이 수정한 내용을 기록 (외부 변경 감지용)
        if (editors.length > 0) {
            const currentContent = editors[0].document.getText();
            this.lastKnownContent.set(filePath, currentContent);
        }
    }
    /**
     * 특정 변경사항 거부 (change 단위)
     *
     * Reject는 checkpoint를 안 본다
     * - change 생성 시 캡쳐한 oldText만 믿는다
     * - 현재 document에서 change.newText를 찾아서 change.oldText로 교체
     * - offset 기반으로 정확한 위치 찾기
     * - 파일 전체 undo 아님 (부분 롤백)
     * - 상태 전이 (pending → rejected)
     * - VS Code Undo 스택과 완전히 분리
     */
    async rejectChange(filePath, changeId) {
        const changes = this.pendingChanges.get(filePath);
        if (!changes) {
            console.warn(`[InlineDiffManager] rejectChange: No changes found for ${filePath}`);
            return;
        }
        // ✅ 핵심: 정확한 change ID 매칭 (고유 ID 사용)
        const change = changes.find(c => c.id === changeId);
        if (!change) {
            console.warn(`[InlineDiffManager] rejectChange: Change ${changeId} not found in ${filePath}. Available changes: ${changes.map(c => `${c.id}(${c.type})`).join(', ')}`);
            return;
        }
        console.log(`[InlineDiffManager] Rejecting change ${changeId} in ${filePath} (type: ${change.type}, range: ${change.range.start.line}-${change.range.end.line})`);
        // 현재 visible editors에서 해당 파일 찾기
        const editors = vscode.window.visibleTextEditors.filter(e => e.document.uri.fsPath === filePath);
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
        }
        else if (change.type === 'modify') {
            // 수정된 라인을 원본으로 되돌리기: change.oldText로 교체
            edit.replace(editor.document.uri, currentRange, change.oldText);
        }
        else if (change.type === 'delete') {
            // delete 타입: change.line 위치에 change.oldText 삽입
            const targetLine = Math.min(change.line, editor.document.lineCount);
            const insertPosition = new vscode.Position(targetLine, 0);
            edit.insert(editor.document.uri, insertPosition, change.oldText + (change.oldText.endsWith('\n') ? '' : '\n'));
        }
        await vscode.workspace.applyEdit(edit);
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
            const currentEditors = vscode.window.visibleTextEditors.filter(e => e.document.uri.fsPath === filePath);
            // 최신 changes 가져오기 (다른 곳에서 변경되었을 수 있음)
            const currentChanges = this.pendingChanges.get(filePath);
            if (!currentChanges || currentChanges.length === 0) {
                return;
            }
            // ✅ 나머지 pending changes는 그대로 유지
            const pendingChanges = currentChanges.filter(c => c.status === 'pending');
            console.log(`[InlineDiffManager] After reject ${changeId}: ${pendingChanges.length} pending changes remaining out of ${currentChanges.length} total`);
            if (pendingChanges.length === 0) {
                // 모든 변경사항이 처리되었으므로 정리
                this.pendingChanges.delete(filePath);
                this.originalContents.delete(filePath);
                // 체크포인트 상태 업데이트
                const checkpoint = this.checkpoints.get(filePath);
                if (checkpoint) {
                    const allAccepted = currentChanges.every(c => c.status === 'accepted');
                    const allRejected = currentChanges.every(c => c.status === 'rejected');
                    if (allAccepted) {
                        checkpoint.status = 'accepted';
                    }
                    else if (allRejected) {
                        checkpoint.status = 'rejected';
                    }
                }
                // 모든 에디터에서 decoration 제거
                for (const e of currentEditors) {
                    this.clearAllDecorationsForEditor(e);
                }
            }
            else {
                // ✅ 나머지 pending changes에 대해 decoration 재적용
                // reject된 change는 이미 문서에서 제거되었으므로, 나머지 change의 range를 업데이트할 필요 없음
                // (각 change는 offset 기반이므로 자동으로 올바른 위치를 가리킴)
                // 모든 에디터에 decoration 재적용
                for (const e of currentEditors) {
                    this.applyDecorationsToEditor(e, currentChanges);
                }
            }
            // CodeLens 새로고침
            const { DiffCodeLensProvider } = require('./DiffCodeLensProvider');
            DiffCodeLensProvider.getInstance().refresh();
            // ✅ extension이 수정한 내용을 기록 (외부 변경 감지용)
            if (currentEditors.length > 0) {
                const currentContent = currentEditors[0].document.getText();
                this.lastKnownContent.set(filePath, currentContent);
            }
        }, 100);
    }
    /**
     * 모든 변경사항 승인
     */
    async acceptAllChanges(filePath) {
        const changes = this.pendingChanges.get(filePath);
        if (!changes)
            return;
        // 모든 change 상태 업데이트
        changes.forEach(change => {
            change.status = 'accepted';
        });
        // 🔥 Accept: 문서에는 이미 newContent가 있으므로, decoration만 제거하면 됨
        // 모든 에디터에서 decoration 제거
        const editors = vscode.window.visibleTextEditors.filter(e => e.document.uri.fsPath === filePath);
        for (const editor of editors) {
            this.clearAllDecorationsForEditor(editor);
        }
        // 체크포인트 상태 업데이트
        const checkpoint = this.checkpoints.get(filePath);
        if (checkpoint) {
            checkpoint.status = 'accepted';
        }
        // 변경사항 목록에서 제거
        this.pendingChanges.delete(filePath);
        this.originalContents.delete(filePath);
    }
    /**
     * 모든 변경사항 거부
     * 🔥 체크포인트의 beforeContent로 정확히 복원
     * ⚠️ VS Code Undo 스택과 분리: WorkspaceEdit 사용
     */
    async rejectAllChanges(filePath) {
        const changes = this.pendingChanges.get(filePath);
        if (!changes)
            return;
        // 현재 visible editors에서 해당 파일 찾기
        const editors = vscode.window.visibleTextEditors.filter(e => e.document.uri.fsPath === filePath);
        if (editors.length === 0) {
            return;
        }
        const editor = editors[0]; // 첫 번째 에디터 사용
        const checkpoint = this.checkpoints.get(filePath);
        // 🔥 체크포인트의 beforeContent로 정확히 복원
        // ⚠️ VS Code Undo 스택과 분리: WorkspaceEdit 사용
        const beforeContent = checkpoint?.beforeContent ?? this.originalContents.get(filePath);
        if (beforeContent !== undefined) {
            const edit = new vscode.WorkspaceEdit();
            const currentText = editor.document.getText();
            const fullRange = new vscode.Range(new vscode.Position(0, 0), editor.document.positionAt(currentText.length));
            edit.replace(editor.document.uri, fullRange, beforeContent);
            await vscode.workspace.applyEdit(edit);
            // 새 파일의 경우 (beforeContent가 빈 문자열) 파일 삭제
            if (beforeContent === '') {
                setTimeout(async () => {
                    try {
                        const fs = require('fs').promises;
                        await fs.unlink(filePath);
                        console.log(`[InlineDiffManager] Deleted new file: ${filePath}`);
                    }
                    catch (error) {
                        console.error(`[InlineDiffManager] Failed to delete file: ${filePath}`, error);
                    }
                }, 100);
            }
        }
        // 모든 change 상태 업데이트
        changes.forEach(change => {
            change.status = 'rejected';
        });
        // 체크포인트 상태 업데이트
        if (checkpoint) {
            checkpoint.status = 'rejected';
        }
        // 모든 에디터에서 decoration 제거
        for (const e of editors) {
            this.clearAllDecorationsForEditor(e);
        }
        // 변경사항 목록에서 제거
        this.pendingChanges.delete(filePath);
        this.originalContents.delete(filePath);
    }
    /**
     * 특정 에디터의 모든 decoration 제거
     */
    clearAllDecorationsForEditor(editor) {
        if (!editor)
            return;
        editor.setDecorations(this.addedDecoration, []);
        editor.setDecorations(this.deletedDecoration, []);
    }
    /**
     * 특정 파일의 모든 에디터에서 decoration 제거
     */
    clearAllDecorationsForFile(filePath) {
        const editors = vscode.window.visibleTextEditors.filter(e => e.document.uri.fsPath === filePath);
        for (const editor of editors) {
            this.clearAllDecorationsForEditor(editor);
        }
    }
    /**
     * 파일의 모든 변경사항 가져오기
     */
    getChanges(filePath) {
        return this.pendingChanges.get(filePath) || [];
    }
    /**
     * 원본 내용 가져오기 (deprecated, checkpoint 사용 권장)
     */
    getOriginalContent(filePath) {
        return this.originalContents.get(filePath);
    }
    /**
     * 활성 체크포인트 가져오기
     */
    getActiveCheckpoint(filePath) {
        return this.checkpoints.get(filePath);
    }
    /**
     * 현재 문서 내용 가져오기 (LLM 프롬프트용)
     *
     * LLM에게는 pending change를 제외한 내용만 전달
     * - pending change가 있으면 checkpoint.beforeContent + accepted changes만 사용
     * - 이렇게 해야 LLM이 자기 자신을 다시 생성하지 않음
     *
     *
     * 핵심: checkpoint는 "텍스트"가 아니라 "상태 의미"
     * - LLM은 checkpoint의 존재를 모름
     * - LLM은 현재 파일 상태만 봄 (pending change 제외)
     * - Checkpoint는 IDE 내부 상태 관리용 (사용자 액션 추적)
     *
     * "This is the CURRENT file content (excluding pending AI suggestions).
     *  This is the ONLY source of truth.
     *  Previous AI suggestions may have been rejected or edited."
     */
    getCurrentDocumentContent(filePath) {
        const editor = vscode.window.visibleTextEditors.find(e => e.document.uri.fsPath === filePath);
        if (!editor) {
            return undefined;
        }
        const changes = this.pendingChanges.get(filePath);
        const pendingChanges = changes?.filter(c => c.status === 'pending') || [];
        // ✅ pending change가 있으면 제외한 내용만 반환
        if (pendingChanges.length > 0) {
            const checkpoint = this.checkpoints.get(filePath);
            if (checkpoint) {
                // checkpoint.beforeContent를 기준으로 시작
                let stableContent = checkpoint.beforeContent;
                // accepted changes만 적용
                const acceptedChanges = changes?.filter(c => c.status === 'accepted') || [];
                const currentContent = editor.document.getText();
                // 더 정확한 방법: currentContent에서 pending change의 newText 제거
                // 역순으로 처리하여 offset 유지
                const sortedPendingChanges = [...pendingChanges].sort((a, b) => b.startOffset - a.startOffset);
                let content = currentContent;
                for (const change of sortedPendingChanges) {
                    try {
                        const changeRange = this.getCurrentRange(change, editor.document);
                        const changeText = editor.document.getText(changeRange);
                        if (changeText === change.newText) {
                            // pending change의 newText를 oldText로 교체 (또는 제거)
                            if (change.type === 'add') {
                                // 추가된 부분 제거
                                const startOffset = editor.document.offsetAt(changeRange.start);
                                const endOffset = editor.document.offsetAt(changeRange.end);
                                content = content.substring(0, startOffset) + content.substring(endOffset);
                            }
                            else if (change.type === 'modify') {
                                // 수정된 부분을 oldText로 복원
                                const startOffset = editor.document.offsetAt(changeRange.start);
                                const endOffset = editor.document.offsetAt(changeRange.end);
                                content = content.substring(0, startOffset) + change.oldText + content.substring(endOffset);
                            }
                            // delete 타입은 이미 없으므로 그대로
                        }
                    }
                    catch (error) {
                        // range 계산 실패 시 무시하고 전체 내용 사용
                        console.warn(`[InlineDiffManager] Failed to exclude pending change from content, using full content`);
                        return editor.document.getText();
                    }
                }
                console.log(`[InlineDiffManager] Returning stable content (${pendingChanges.length} pending changes excluded)`);
                return content;
            }
        }
        // pending change가 없으면 전체 내용 반환
        return editor.document.getText();
    }
    /**
     * LLM에게 전달할 파일 컨텍스트 (상태 포함, 선택적)
     *
     * 텍스트만이 아니라 "상태"를 전달
     * - 현재 파일 전체 내용
     * - Pending changes 존재 여부 (선택적)
     *
     * 사용 예:
     * {
     *   uri: "app.ts",
     *   content: "...",
     *   version: 123,
     *   context: {
     *     hasPendingChanges: true,
     *     pendingCount: 2,
     *     affectedLines: [10-15, 20-25]
     *   }
     * }
     */
    getFileContextForLLM(filePath) {
        const editor = vscode.window.visibleTextEditors.find(e => e.document.uri.fsPath === filePath);
        if (!editor) {
            return undefined;
        }
        const changes = this.pendingChanges.get(filePath);
        const pendingChanges = changes?.filter(c => c.status === 'pending') || [];
        const result = {
            uri: filePath,
            content: editor.document.getText(),
            version: editor.document.version,
        };
        // Pending changes가 있으면 컨텍스트 추가 (선택적)
        if (pendingChanges.length > 0) {
            result.context = {
                hasPendingChanges: true,
                pendingCount: pendingChanges.length,
                affectedLines: pendingChanges.map(c => ({
                    start: c.range.start.line,
                    end: c.range.end.line,
                })),
            };
        }
        return result;
    }
    /**
     * Decoration 재적용 (에디터 변경 시 사용)
     * 파일 경로 기반으로 모든 visible editors에 재적용
     */
    reapplyDecorations(filePath) {
        const changes = this.pendingChanges.get(filePath);
        if (!changes || changes.length === 0) {
            return;
        }
        // 모든 visible editors에서 해당 파일 찾기
        const editors = vscode.window.visibleTextEditors.filter(e => e.document.uri.fsPath === filePath);
        for (const editor of editors) {
            this.reapplyDecorationsForEditor(editor);
        }
    }
    /**
     * 모든 pending changes 가져오기
     */
    getAllPendingFiles() {
        return Array.from(this.pendingChanges.keys());
    }
    /**
     * 모든 파일의 모든 변경사항 승인
     */
    async acceptAllChangesForAllFiles() {
        const pendingFiles = this.getAllPendingFiles();
        for (const filePath of pendingFiles) {
            await this.acceptAllChanges(filePath);
        }
    }
    /**
     * 모든 파일의 모든 변경사항 거부
     */
    async rejectAllChangesForAllFiles() {
        const pendingFiles = this.getAllPendingFiles();
        for (const filePath of pendingFiles) {
            await this.rejectAllChanges(filePath);
        }
    }
    /**
     * 정리
     */
    dispose() {
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
        this.addedDecoration.dispose();
        this.deletedDecoration.dispose();
        this.pendingChanges.clear();
        this.originalContents.clear();
        this.checkpoints.clear();
        this.documentVersions.clear();
        this.lastKnownContent.clear();
    }
}
exports.InlineDiffManager = InlineDiffManager;
//# sourceMappingURL=InlineDiffManager.js.map