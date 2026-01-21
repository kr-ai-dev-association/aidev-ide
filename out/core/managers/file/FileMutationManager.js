"use strict";
/**
 * File Mutation Manager
 * 파일 수정 전략 및 정합성 검사 관리자
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileMutationManager = exports.PatchStrategy = void 0;
const BaseManager_1 = require("../base/BaseManager");
const AgentConfig_1 = require("../../config/AgentConfig");
var PatchStrategy;
(function (PatchStrategy) {
    PatchStrategy["SEARCH_REPLACE"] = "search_replace";
    PatchStrategy["STRUCTURAL_REWRITE"] = "structural_rewrite";
    PatchStrategy["FULL_OVERWRITE"] = "full_overwrite";
})(PatchStrategy || (exports.PatchStrategy = PatchStrategy = {}));
// @ts-ignore - BaseManager 상속 타입 호환성
class FileMutationManager extends BaseManager_1.BaseManager {
    constructor(context) {
        super(context);
    }
    static getInstance(context) {
        return BaseManager_1.BaseManager.getInstance.call(FileMutationManager, context);
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
    /**
     * 문자열 유사도 계산 (Dice's Coefficient)
     */
    getStringSimilarity(str1, str2) {
        const s1 = str1.replace(/\s+/g, '');
        const s2 = str2.replace(/\s+/g, '');
        if (s1 === s2)
            return 1.0;
        if (s1.length < 2 || s2.length < 2)
            return 0;
        const bigrams1 = new Map();
        for (let i = 0; i < s1.length - 1; i++) {
            const bigram = s1.substring(i, i + 2);
            bigrams1.set(bigram, (bigrams1.get(bigram) || 0) + 1);
        }
        let intersection = 0;
        for (let i = 0; i < s2.length - 1; i++) {
            const bigram = s2.substring(i, i + 2);
            const count = bigrams1.get(bigram) || 0;
            if (count > 0) {
                bigrams1.set(bigram, count - 1);
                intersection++;
            }
        }
        return (2.0 * intersection) / (s1.length + s2.length - 2);
    }
    /**
     * 유사도 기반 퍼지 매칭
     */
    fuzzyMatch(content, search, threshold = AgentConfig_1.AgentConfig.MIN_FUZZY_MATCH_THRESHOLD) {
        const searchLines = search.split('\n').filter(l => l.trim() !== '');
        if (searchLines.length === 0)
            return false;
        const contentLines = content.split('\n');
        let bestMatch = false;
        let bestScore = 0;
        // 슬라이딩 윈도우 방식으로 검색
        for (let i = 0; i <= contentLines.length - searchLines.length; i++) {
            const window = contentLines.slice(i, i + searchLines.length).join('\n');
            const score = this.getStringSimilarity(window, search);
            if (score > threshold && score > bestScore) {
                bestScore = score;
                // 정확한 위치 계산
                let startPos = 0;
                for (let k = 0; k < i; k++)
                    startPos += contentLines[k].length + 1;
                let endPos = startPos;
                for (let k = 0; k < searchLines.length; k++)
                    endPos += contentLines[i + k].length + 1;
                bestMatch = [startPos, Math.min(endPos, content.length)];
            }
        }
        return bestMatch;
    }
}
exports.FileMutationManager = FileMutationManager;
//# sourceMappingURL=FileMutationManager.js.map