"use strict";
/**
 * Diff CodeLens Provider
 * 커서 IDE 방식의 인라인 Accept/Reject 버튼 제공
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
exports.DiffCodeLensProvider = void 0;
const vscode = __importStar(require("vscode"));
const InlineDiffManager_1 = require("./InlineDiffManager");
class DiffCodeLensProvider {
    static instance;
    inlineDiffManager;
    _onDidChangeCodeLenses = new vscode.EventEmitter();
    onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;
    constructor() {
        this.inlineDiffManager = InlineDiffManager_1.InlineDiffManager.getInstance();
    }
    static getInstance() {
        if (!DiffCodeLensProvider.instance) {
            DiffCodeLensProvider.instance = new DiffCodeLensProvider();
        }
        return DiffCodeLensProvider.instance;
    }
    /**
     * CodeLens 제공 (각 변경사항마다 Accept/Reject 버튼)
     * 각 변경사항마다 하나의 CodeLens만 반환 (중복 방지)
     */
    provideCodeLenses(document, token) {
        const filePath = document.uri.fsPath;
        const changes = this.inlineDiffManager.getChanges(filePath);
        if (changes.length === 0) {
            return [];
        }
        const lenses = [];
        const seenRanges = new Set(); // 중복 방지
        for (const change of changes) {
            // dirty 상태인 change는 CodeLens 생성 안 함 (사용자가 직접 수정하여 무효화됨)
            if (change.status === 'dirty') {
                continue;
            }
            // pending 상태인 change만 CodeLens 생성
            if (change.status !== 'pending') {
                continue;
            }
            // range를 문자열로 변환하여 중복 체크
            const rangeKey = `${change.range.start.line}-${change.range.end.line}-${change.id}`;
            if (seenRanges.has(rangeKey)) {
                continue; // 이미 처리된 range는 건너뜀
            }
            seenRanges.add(rangeKey);
            // 에디터의 실제 라인 수 확인
            const maxLine = document.lineCount - 1;
            const startLine = Math.min(change.range.start.line, maxLine);
            const endLine = Math.min(change.range.end.line, maxLine);
            // ✅ 핵심: Accept/Reject 버튼을 같은 라인에 나란히 표시
            // Accept 버튼 (변경사항의 첫 번째 라인에, 왼쪽)
            const acceptRange = new vscode.Range(startLine, 0, startLine, 0);
            const acceptCommand = {
                title: `✔️ Accept [${change.id.slice(-8)}]`, // change ID의 마지막 8자리 표시 (디버깅용)
                command: 'codepilot.acceptChange',
                arguments: [filePath, change.id], // ✅ 고유한 change.id 전달
            };
            lenses.push(new vscode.CodeLens(acceptRange, acceptCommand));
            // Reject 버튼 (같은 라인에, Accept 옆에 표시)
            const rejectRange = new vscode.Range(startLine, 0, startLine, 0);
            const rejectCommand = {
                title: `✖️ Reject [${change.id.slice(-8)}]`, // change ID의 마지막 8자리 표시 (디버깅용)
                command: 'codepilot.rejectChange',
                arguments: [filePath, change.id], // ✅ 고유한 change.id 전달
            };
            lenses.push(new vscode.CodeLens(rejectRange, rejectCommand));
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
exports.DiffCodeLensProvider = DiffCodeLensProvider;
//# sourceMappingURL=DiffCodeLensProvider.js.map