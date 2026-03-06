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
/* harmony import */ var vscode__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(1);
/* harmony import */ var vscode__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(vscode__WEBPACK_IMPORTED_MODULE_0__);
/**
 * Error Reporting Service
 * IDE에서 발생한 오류를 백엔드로 전송하는 서비스
 * codepilot.errorReportingEnabled 설정에 따라 on/off
 */

class ErrorReportingService {
    static instance;
    queue = [];
    flushTimer = null;
    FLUSH_INTERVAL = 10000; // 10초마다 배치 전송
    MAX_QUEUE = 50;
    constructor() {
        this.startFlushTimer();
    }
    static getInstance() {
        if (!ErrorReportingService.instance) {
            ErrorReportingService.instance = new ErrorReportingService();
        }
        return ErrorReportingService.instance;
    }
    /**
     * 오류 리포팅이 활성화되어 있는지 확인
     */
    isEnabled() {
        const config = vscode__WEBPACK_IMPORTED_MODULE_0__.workspace.getConfiguration("codepilot");
        return config.get("errorReportingEnabled", false);
    }
    /**
     * 오류를 큐에 추가 (비동기, 논블로킹)
     */
    report(level, message, options) {
        if (!this.isEnabled())
            return;
        this.queue.push({
            level,
            message,
            stack_trace: options?.stackTrace,
            source: options?.source || "ide",
            metadata: {
                ...options?.metadata,
                timestamp: new Date().toISOString(),
                extensionVersion: this.getExtensionVersion(),
            },
        });
        // 큐가 가득 차면 즉시 전송
        if (this.queue.length >= this.MAX_QUEUE) {
            this.flush();
        }
    }
    /**
     * 편의 메서드: Error 객체에서 리포트
     */
    reportError(error, metadata) {
        this.report("error", error.message, {
            stackTrace: error.stack,
            metadata,
        });
    }
    /**
     * 편의 메서드: LLM 에러 리포트
     */
    reportLLMError(message, model, metadata) {
        this.report("error", message, {
            source: "ide-llm",
            metadata: { model, ...metadata },
        });
    }
    /**
     * 편의 메서드: 도구 실행 에러 리포트
     */
    reportToolError(toolName, message, metadata) {
        this.report("warning", `Tool '${toolName}' failed: ${message}`, {
            source: "ide-tool",
            metadata: { toolName, ...metadata },
        });
    }
    /**
     * 편의 메서드: MCP 서버 연결 에러 리포트
     */
    reportMCPError(serverId, serverName, message, metadata) {
        this.report("error", `MCP '${serverName}' (${serverId}): ${message}`, {
            source: "ide-mcp",
            metadata: { serverId, serverName, ...metadata },
        });
    }
    /**
     * 편의 메서드: 인증 에러 리포트
     */
    reportAuthError(message, metadata) {
        this.report("error", `Auth: ${message}`, {
            source: "ide-auth",
            metadata,
        });
    }
    /**
     * 편의 메서드: 설정 동기화 에러 리포트
     */
    reportSyncError(message, metadata) {
        this.report("warning", `Settings sync: ${message}`, {
            source: "ide-sync",
            metadata,
        });
    }
    /**
     * 편의 메서드: 파일 I/O 에러 리포트
     */
    reportFileError(filePath, message, metadata) {
        this.report("warning", `File I/O '${filePath}': ${message}`, {
            source: "ide-file",
            metadata: { filePath, ...metadata },
        });
    }
    /**
     * 큐에 있는 오류를 백엔드로 전송
     */
    async flush() {
        if (this.queue.length === 0)
            return;
        if (!this.isEnabled()) {
            this.queue = [];
            return;
        }
        const batch = this.queue.splice(0, this.MAX_QUEUE);
        try {
            const { CodePilotApiClient } = await __webpack_require__.e(/* import() */ 2).then(__webpack_require__.bind(__webpack_require__, 712));
            const { AuthService } = await Promise.resolve(/* import() */).then(__webpack_require__.bind(__webpack_require__, 677));
            const auth = AuthService.getInstance();
            if (!auth.isLoggedIn())
                return;
            const api = CodePilotApiClient.getInstance();
            // 각 에러를 개별 전송 (백엔드 API가 단건 처리)
            const promises = batch.map((entry) => api.reportError({
                level: entry.level,
                message: entry.message,
                stack_trace: entry.stack_trace,
                source: entry.source,
                metadata: entry.metadata,
            }).catch(() => {
                // 개별 전송 실패 시 무시
            }));
            await Promise.allSettled(promises);
        }
        catch {
            // 전체 전송 실패 시 무시 (오프라인 등)
        }
    }
    startFlushTimer() {
        this.flushTimer = setInterval(() => {
            this.flush();
        }, this.FLUSH_INTERVAL);
    }
    getExtensionVersion() {
        try {
            const ext = vscode__WEBPACK_IMPORTED_MODULE_0__.extensions.getExtension("banya.codepilot");
            return ext?.packageJSON?.version || "unknown";
        }
        catch {
            return "unknown";
        }
    }
    dispose() {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
            this.flushTimer = null;
        }
        // 남은 큐 즉시 전송
        this.flush();
    }
}


/***/ })

};
;
//# sourceMappingURL=1.extension.js.map