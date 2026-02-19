/**
 * Execution Manager 타입 정의
 * 액션을 실제 실행으로 변환하는 매니저의 타입들
 */
/**
 * 프로세스 상태
 */
export var ProcessStatus;
(function (ProcessStatus) {
    ProcessStatus["STARTING"] = "starting";
    ProcessStatus["RUNNING"] = "running";
    ProcessStatus["STOPPING"] = "stopping";
    ProcessStatus["STOPPED"] = "stopped";
    ProcessStatus["FAILED"] = "failed";
    ProcessStatus["KILLED"] = "killed";
})(ProcessStatus || (ProcessStatus = {}));
/**
 * 에러 타입
 */
export var ErrorType;
(function (ErrorType) {
    ErrorType["PORT_CONFLICT"] = "port_conflict";
    ErrorType["COMMAND_NOT_FOUND"] = "command_not_found";
    ErrorType["PERMISSION_DENIED"] = "permission_denied";
    ErrorType["SYNTAX_ERROR"] = "syntax_error";
    ErrorType["RUNTIME_ERROR"] = "runtime_error";
    ErrorType["NETWORK_ERROR"] = "network_error";
    ErrorType["FILE_NOT_FOUND"] = "file_not_found";
    ErrorType["OUT_OF_MEMORY"] = "out_of_memory";
    ErrorType["TIMEOUT"] = "timeout";
    ErrorType["UNKNOWN"] = "unknown";
})(ErrorType || (ErrorType = {}));
//# sourceMappingURL=types.js.map