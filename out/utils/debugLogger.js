"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.debugLog = exports.DebugLogger = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
class DebugLoggerImpl {
    enabled = false;
    workspaceRoot;
    logFilePath;
    setContext(enabled, workspaceRoot) {
        this.enabled = !!enabled;
        this.workspaceRoot = workspaceRoot;
    }
    startIfEnabled() {
        if (!this.enabled)
            return;
        // 워크스페이스 루트가 지정되지 않았다면 VS Code API로 조회
        if (!this.workspaceRoot) {
            try {
                const ws = vscode.workspace.workspaceFolders;
                if (ws && ws.length > 0) {
                    this.workspaceRoot = ws[0].uri.fsPath;
                }
            }
            catch { /* ignore */ }
        }
        if (!this.workspaceRoot)
            return;
        try {
            const dir = path.join(this.workspaceRoot, 'debug_log');
            fs.mkdirSync(dir, { recursive: true });
            this.logFilePath = path.join(dir, 'log.txt');
            // overwrite when turning on debug mode
            const header = `[${new Date().toISOString()}] Debug session started\n`;
            fs.writeFileSync(this.logFilePath, header, 'utf8');
        }
        catch {
            // ignore file system errors in debug logger
        }
    }
    log(message) {
        if (!this.enabled)
            return;
        // 지연 초기화: 기록 시점에 파일 없으면 생성 시도
        if (!this.logFilePath) {
            this.startIfEnabled();
        }
        if (!this.logFilePath)
            return;
        try {
            const line = `[${new Date().toISOString()}] ${message}\n`;
            fs.appendFileSync(this.logFilePath, line, 'utf8');
        }
        catch {
            // ignore
        }
    }
}
exports.DebugLogger = new DebugLoggerImpl();
const debugLog = (msg) => exports.DebugLogger.log(msg);
exports.debugLog = debugLog;
//# sourceMappingURL=debugLogger.js.map