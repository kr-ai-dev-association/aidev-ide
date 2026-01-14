"use strict";
/**
 * Tool Manager 타입 정의
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Tool = void 0;
/**
 * 툴 이름 상수
 *
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
var Tool;
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
})(Tool || (exports.Tool = Tool = {}));
//# sourceMappingURL=types.js.map