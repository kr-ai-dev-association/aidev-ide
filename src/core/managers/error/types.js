/**
 * Error Manager 타입 정의
 * 에러 감지, 파싱, 분석을 담당하는 매니저의 타입들
 */
/**
 * 에러 소스
 */
export var ErrorSource;
(function (ErrorSource) {
    ErrorSource["TERMINAL"] = "terminal";
    ErrorSource["DIAGNOSTIC"] = "diagnostic";
    ErrorSource["RUNTIME"] = "runtime";
    ErrorSource["COMPILE"] = "compile";
    ErrorSource["LINT"] = "lint";
    ErrorSource["SYSTEM"] = "system";
})(ErrorSource || (ErrorSource = {}));
/**
 * 에러 심각도
 */
export var ErrorSeverity;
(function (ErrorSeverity) {
    ErrorSeverity["LOW"] = "low";
    ErrorSeverity["MEDIUM"] = "medium";
    ErrorSeverity["HIGH"] = "high";
    ErrorSeverity["CRITICAL"] = "critical";
})(ErrorSeverity || (ErrorSeverity = {}));
/**
 * 에러 카테고리
 */
export var ErrorCategory;
(function (ErrorCategory) {
    ErrorCategory["SYNTAX"] = "syntax";
    ErrorCategory["TYPE"] = "type";
    ErrorCategory["RUNTIME"] = "runtime";
    ErrorCategory["NETWORK"] = "network";
    ErrorCategory["FILE_SYSTEM"] = "file_system";
    ErrorCategory["PERMISSION"] = "permission";
    ErrorCategory["DEPENDENCY"] = "dependency";
    ErrorCategory["CONFIGURATION"] = "configuration";
    ErrorCategory["UNKNOWN"] = "unknown";
})(ErrorCategory || (ErrorCategory = {}));
//# sourceMappingURL=types.js.map