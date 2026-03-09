"use strict";
exports.id = 1;
exports.ids = [1];
exports.modules = {

/***/ 711:
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   ErrorReportingService: () => (/* binding */ ErrorReportingService)
/* harmony export */ });
/**
 * Error Reporting Service (no-op stub)
 */
class ErrorReportingService {
    static instance;
    constructor() { }
    static getInstance() {
        if (!ErrorReportingService.instance) {
            ErrorReportingService.instance = new ErrorReportingService();
        }
        return ErrorReportingService.instance;
    }
    report(_level, _message, _options) { }
    reportError(_error, _metadata) { }
    reportLLMError(_message, _model, _metadata) { }
    reportToolError(_toolName, _message, _metadata) { }
    reportMCPError(_serverId, _serverName, _message, _metadata) { }
    reportAuthError(_message, _metadata) { }
    reportSyncError(_message, _metadata) { }
    reportFileError(_filePath, _message, _metadata) { }
    flush() { }
    dispose() { }
}


/***/ })

};
;
//# sourceMappingURL=1.extension.js.map