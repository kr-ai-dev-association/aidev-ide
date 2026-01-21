"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvestigationManager = void 0;
const BaseManager_1 = require("../base/BaseManager");
const types_1 = require("../../tools/types");
const phase_1 = require("../context/prompts/phase");
/**
 * 조사 관리자 (Investigation Manager)
 * AI가 코드를 수정하기 전에 프로젝트 상태를 파악하고 사실을 수집하도록 관리합니다.
 */
// @ts-ignore - BaseManager 상속 타입 호환성
class InvestigationManager extends BaseManager_1.BaseManager {
    // 조사 단계에서 허용되는 읽기 전용 도구 목록
    INVESTIGATION_TOOLS = [
        types_1.Tool.READ_FILE,
        types_1.Tool.LIST_FILES,
        types_1.Tool.SEARCH_FILES,
        types_1.Tool.RIPGREP_SEARCH
    ];
    constructor(context) {
        super(context);
    }
    static getInstance(context) {
        return BaseManager_1.BaseManager.getInstance.call(InvestigationManager, context);
    }
    /**
     * 조사 단계 전용 프롬프트를 생성합니다 (v5.2.0: 엄격한 단계 전환 가이드 추가).
     */
    getInvestigationPrompt(userQuery) {
        // 프롬프트를 context/prompts에서 가져옴
        return (0, phase_1.getInvestigationPrompt)(userQuery);
    }
    /**
     * 지정된 도구가 조사 도구인지 확인합니다.
     */
    isInvestigationTool(toolName) {
        return this.INVESTIGATION_TOOLS.includes(toolName);
    }
    /**
     * 조사 단계에서 사용 가능한 도구 목록을 반환합니다.
     */
    getInvestigationTools() {
        return [...this.INVESTIGATION_TOOLS];
    }
}
exports.InvestigationManager = InvestigationManager;
//# sourceMappingURL=InvestigationManager.js.map