/**
 * Context Manager 타입 정의
 * LLM에게 제공할 컨텍스트를 수집하는 매니저의 타입들
 */
/**
 * 컨텍스트 타입
 */
export var ContextType;
(function (ContextType) {
    ContextType["FILE"] = "file";
    ContextType["SELECTION"] = "selection";
    ContextType["CURSOR"] = "cursor";
    ContextType["ERROR"] = "error";
    ContextType["TERMINAL"] = "terminal";
    ContextType["EDIT_HISTORY"] = "edit_history";
    ContextType["RELATED_FILES"] = "related_files";
    ContextType["PROJECT"] = "project";
    ContextType["OPEN_TABS"] = "open_tabs";
})(ContextType || (ContextType = {}));
//# sourceMappingURL=types.js.map