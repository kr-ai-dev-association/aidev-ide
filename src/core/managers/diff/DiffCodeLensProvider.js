/**
 * Diff CodeLens Provider
 * 커서 IDE 방식의 인라인 Keep/Undo 버튼 제공
 */
import * as vscode from 'vscode';
import { InlineDiffManager } from './InlineDiffManager';
export class DiffCodeLensProvider {
    static instance;
    inlineDiffManager;
    _onDidChangeCodeLenses = new vscode.EventEmitter();
    onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;
    constructor() {
        this.inlineDiffManager = InlineDiffManager.getInstance();
    }
    static getInstance() {
        if (!DiffCodeLensProvider.instance) {
            DiffCodeLensProvider.instance = new DiffCodeLensProvider();
        }
        return DiffCodeLensProvider.instance;
    }
    /**
     * CodeLens 제공 (각 변경사항마다 Keep/Undo 버튼)
     * 각 변경사항마다 하나의 CodeLens만 반환 (중복 방지)
     */
    provideCodeLenses(document, token) {
        const filePath = document.uri.fsPath;
        const changes = this.inlineDiffManager.getChanges(filePath);
        if (changes.length === 0) {
            return [];
        }
        const lenses = [];
        const seenChangeIds = new Set(); // ✅ change ID 기반 중복 방지 (더 정확)
        for (const change of changes) {
            // dirty 상태인 change는 CodeLens 생성 안 함 (사용자가 직접 수정하여 무효화됨)
            if (change.status === 'dirty') {
                continue;
            }
            // pending 상태인 change만 CodeLens 생성
            if (change.status !== 'pending') {
                continue;
            }
            // ✅ change ID 기반 중복 체크 (range보다 정확함)
            if (seenChangeIds.has(change.id)) {
                console.log(`[DiffCodeLensProvider] Skipping duplicate CodeLens for change ${change.id}`);
                continue; // 이미 처리된 change는 건너뜀
            }
            seenChangeIds.add(change.id);
            // 에디터의 실제 라인 수 확인
            const maxLine = document.lineCount - 1;
            const startLine = Math.min(change.range.start.line, maxLine);
            const endLine = Math.min(change.range.end.line, maxLine);
            // ✅ 삭제된 코드는 decoration.before로 표시되므로 CodeLens에서는 제외
            // CodeLens는 Accept/Reject 버튼만 표시
            // ✅ 핵심: Keep/Undo 버튼을 같은 라인에 나란히 표시
            // Keep 버튼 (변경사항의 첫 번째 라인에, 왼쪽)
            const keepRange = new vscode.Range(startLine, 0, startLine, 0);
            const keepCommand = {
                title: `$(check) Keep`,
                command: 'codepilot.acceptChange',
                arguments: [filePath, change.id], // ✅ 고유한 change.id 전달
            };
            lenses.push(new vscode.CodeLens(keepRange, keepCommand));
            // Undo 버튼 (같은 라인에, Keep 옆에 표시)
            const undoRange = new vscode.Range(startLine, 0, startLine, 0);
            const undoCommand = {
                title: `$(close) Undo`,
                command: 'codepilot.rejectChange',
                arguments: [filePath, change.id], // ✅ 고유한 change.id 전달
            };
            lenses.push(new vscode.CodeLens(undoRange, undoCommand));
            // ✅ 변경 타입 표시 (선택적, 정보 제공용)
            if (change.type === 'modify') {
                const typeRange = new vscode.Range(startLine, 0, startLine, 0);
                const typeCommand = {
                    title: `$(diff-modified) Modified`,
                    command: '',
                };
                lenses.push(new vscode.CodeLens(typeRange, typeCommand));
            }
            else if (change.type === 'add') {
                const typeRange = new vscode.Range(startLine, 0, startLine, 0);
                const typeCommand = {
                    title: `$(diff-added) Added`,
                    command: '',
                };
                lenses.push(new vscode.CodeLens(typeRange, typeCommand));
            }
            else if (change.type === 'delete') {
                const typeRange = new vscode.Range(startLine, 0, startLine, 0);
                const typeCommand = {
                    title: `$(diff-removed) Deleted`,
                    command: '',
                };
                lenses.push(new vscode.CodeLens(typeRange, typeCommand));
            }
        }
        console.log(`[DiffCodeLensProvider] Provided ${lenses.length} CodeLenses for ${filePath} (${changes.length} changes)`);
        return lenses;
    }
    /**
     * CodeLens 새로고침 트리거
     */
    refresh() {
        this._onDidChangeCodeLenses.fire();
    }
    /**
     * CodeLens 해결 (선택 사항)
     */
    resolveCodeLens(codeLens, token) {
        return codeLens;
    }
}
//# sourceMappingURL=DiffCodeLensProvider.js.map