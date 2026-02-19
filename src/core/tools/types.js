/**
 * Tool Manager 타입 정의
 * codepilot의 툴 콜링 시스템을 위한 타입들
 */
/**
 * 툴 이름 상수
 *
 * codepilot의 기존 ActionType과 매핑:
 * - CREATE_FILE → CODE_GENERATION (파일 생성)
 * - UPDATE_FILE → FILE_OPERATION UPDATE (파일 수정)
 * - REMOVE_FILE → FILE_OPERATION DELETE (파일 삭제)
 * - READ_FILE → FILE_READ (파일 읽기)
 * - LIST_FILES → FILE_LIST (파일 목록)
 * - SEARCH_FILES → FILE_SEARCH (파일 검색)
 * - RUN_COMMAND → TERMINAL_COMMAND (명령어 실행)
 * - ANALYZE_CODE → ANALYSIS (코드 분석)
 * - VERIFY_CODE → VERIFICATION (코드 검증)
 * - REFACTOR_CODE → REFACTOR (리팩토링)
 */
export var Tool;
(function (Tool) {
    Tool["CREATE_FILE"] = "create_file";
    Tool["UPDATE_FILE"] = "update_file";
    Tool["REMOVE_FILE"] = "remove_file";
    Tool["READ_FILE"] = "read_file";
    Tool["LIST_FILES"] = "list_files";
    Tool["SEARCH_FILES"] = "search_files";
    Tool["RUN_COMMAND"] = "run_command";
    Tool["ANALYZE_CODE"] = "analyze_code";
    Tool["VERIFY_CODE"] = "verify_code";
    Tool["REFACTOR_CODE"] = "refactor_code";
    Tool["RIPGREP_SEARCH"] = "ripgrep_search";
    // 새로운 파일 읽기 도구들
    Tool["EXPAND_AROUND_LINE"] = "expand_around_line";
    Tool["LIST_IMPORTS"] = "list_imports";
    Tool["STAT_FILE"] = "stat_file";
    // Git 및 IDE 연동 도구들
    Tool["GIT_DIFF"] = "git_diff";
    Tool["READ_ACTIVE_FILE"] = "read_active_file";
    Tool["FETCH_URL"] = "fetch_url";
})(Tool || (Tool = {}));
//# sourceMappingURL=types.js.map