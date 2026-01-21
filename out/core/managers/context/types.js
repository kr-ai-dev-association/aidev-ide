"use strict";
/**
 * Context Manager 타입 정의
 * LLM에게 제공할 컨텍스트를 수집하는 매니저의 타입들
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContextType = void 0;
/**
 * 컨텍스트 타입
 */
var ContextType;
(function (ContextType) {
    ContextType["FILE"] = "file";
    ContextType["SELECTION"] = "selection";
    ContextType["CURSOR"] = "cursor";
    ContextType["ERROR"] = "error";
    ContextType["TERMINAL"] = "terminal";
    ContextType["EDIT_HISTORY"] = "edit_history";
    ContextType["RELATED_FILES"] = "related_files";
    ContextType["PROJECT"] = "project";
})(ContextType || (exports.ContextType = ContextType = {}));
//# sourceMappingURL=types.js.map