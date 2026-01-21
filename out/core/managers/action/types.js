"use strict";
/**
 * Action Manager 타입 정의
 * LLM 요청을 실행 가능한 액션으로 변환하는 매니저의 타입들
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Permission = exports.FileOperationType = exports.ActionType = void 0;
/**
 * 액션 타입
 */
var ActionType;
(function (ActionType) {
    ActionType["CODE_GENERATION"] = "code_generation";
    ActionType["FILE_OPERATION"] = "file_operation";
    ActionType["TERMINAL_COMMAND"] = "terminal_command";
    ActionType["ANALYSIS"] = "analysis";
    ActionType["VERIFICATION"] = "verification";
    ActionType["SEARCH"] = "search";
    ActionType["FILE_READ"] = "file_read";
    ActionType["FILE_LIST"] = "file_list";
    ActionType["FILE_SEARCH"] = "file_search";
    ActionType["REFACTOR"] = "refactor";
})(ActionType || (exports.ActionType = ActionType = {}));
/**
 * 파일 작업 종류
 */
var FileOperationType;
(function (FileOperationType) {
    FileOperationType["CREATE"] = "create";
    FileOperationType["UPDATE"] = "update";
    FileOperationType["DELETE"] = "delete";
    FileOperationType["RENAME"] = "rename";
    FileOperationType["MOVE"] = "move";
})(FileOperationType || (exports.FileOperationType = FileOperationType = {}));
/**
 * 권한 타입
 */
var Permission;
(function (Permission) {
    Permission["READ_FILE"] = "read_file";
    Permission["WRITE_FILE"] = "write_file";
    Permission["DELETE_FILE"] = "delete_file";
    Permission["EXECUTE_COMMAND"] = "execute_command";
    Permission["NETWORK_ACCESS"] = "network_access";
    Permission["MODIFY_SETTINGS"] = "modify_settings";
})(Permission || (exports.Permission = Permission = {}));
//# sourceMappingURL=types.js.map