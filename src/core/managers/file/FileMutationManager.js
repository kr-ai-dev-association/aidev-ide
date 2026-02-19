/**
 * File Mutation Manager
 * 파일 수정 전략 및 정합성 검사 관리자
 */
import { BaseManager } from '../base/BaseManager';
export var PatchStrategy;
(function (PatchStrategy) {
    PatchStrategy["SEARCH_REPLACE"] = "search_replace";
    PatchStrategy["STRUCTURAL_REWRITE"] = "structural_rewrite";
    PatchStrategy["FULL_OVERWRITE"] = "full_overwrite";
})(PatchStrategy || (PatchStrategy = {}));
// @ts-ignore - BaseManager 상속 타입 호환성
export class FileMutationManager extends BaseManager {
    constructor(context) {
        super(context);
    }
    static getInstance(context) {
        return BaseManager.getInstance.call(FileMutationManager, context);
    }
    /**
     * 파일 내용 분석
     */
    analyzeFile(content) {
        return {
            hasDefaultExport: /export\s+default/.test(content),
            hasReactComponent: /function\s+[A-Z]\w*|const\s+[A-Z]\w*\s*=\s*\(/.test(content),
            isViteTemplate: content.includes('Vite + React') || content.includes('viteLogo'),
            hasNav: /<nav|Router|NavLink|Link\s+to=/.test(content),
            lineCount: content.split('\n').length,
            size: content.length
        };
    }
    /**
     * 수정 전략 선택
     */
    chooseStrategy(analysis, searchContent) {
        // 파일이 매우 작거나 Vite 기본 템플릿인 경우 재작성 선호
        if (analysis.isViteTemplate && analysis.lineCount < 50) {
            return PatchStrategy.STRUCTURAL_REWRITE;
        }
        // 파일 크기가 작으면 전체 재작성이 더 안전할 수 있음
        if (analysis.size < 1000 && analysis.lineCount < 30) {
            return PatchStrategy.STRUCTURAL_REWRITE;
        }
        return PatchStrategy.SEARCH_REPLACE;
    }
}
//# sourceMappingURL=FileMutationManager.js.map