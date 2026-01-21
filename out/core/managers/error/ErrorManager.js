"use strict";
/**
 * Error Manager
 * 에러 감지, 파싱, 분석을 담당하는 메인 매니저
 */
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
exports.ErrorManager = void 0;
const vscode = __importStar(require("vscode"));
const types_1 = require("./types");
const ErrorParser_1 = require("./ErrorParser");
const StackTraceAnalyzer_1 = require("./StackTraceAnalyzer");
const ErrorHistory_1 = require("./ErrorHistory");
const AgentConfig_1 = require("../../config/AgentConfig");
class ErrorManager {
    static instance;
    parser;
    analyzer;
    history;
    patterns = new Map();
    executionManager;
    onErrorEmitter = new vscode.EventEmitter();
    onError = this.onErrorEmitter.event;
    constructor() {
        this.parser = new ErrorParser_1.ErrorParser();
        this.analyzer = new StackTraceAnalyzer_1.StackTraceAnalyzer();
        this.history = new ErrorHistory_1.ErrorHistory();
        this.registerDefaultPatterns();
    }
    static getInstance() {
        if (!ErrorManager.instance) {
            ErrorManager.instance = new ErrorManager();
        }
        return ErrorManager.instance;
    }
    /**
     * Execution Manager를 설정합니다
     */
    setExecutionManager(executionManager) {
        this.executionManager = executionManager;
        console.log('[ErrorManager] Execution Manager set');
    }
    /**
     * 에러를 캡처하고 파싱합니다
     */
    async captureError(source, output, metadata) {
        console.log(`[ErrorManager] Capturing error from ${source}`);
        // Execution Manager의 ErrorDetector 사용 (있는 경우)
        if (this.executionManager) {
            const errorInfo = this.executionManager.detectError(output);
            if (errorInfo) {
                // ErrorInfo를 ParsedError로 변환
                const parsedError = this.convertErrorInfoToParsedError(errorInfo, output, source, metadata);
                this.history.add(parsedError);
                // 터미널 에러인 경우 이벤트 발행
                if (source === types_1.ErrorSource.TERMINAL) {
                    this.fireTerminalErrorEvent(parsedError, metadata);
                }
                return parsedError;
            }
        }
        // 직접 파싱
        const parsedError = this.parser.parse(output, source, metadata);
        this.history.add(parsedError);
        // 터미널 에러인 경우 이벤트 발행
        if (source === types_1.ErrorSource.TERMINAL) {
            this.fireTerminalErrorEvent(parsedError, metadata);
        }
        return parsedError;
    }
    /**
     * 터미널 에러 이벤트를 발행합니다
     */
    fireTerminalErrorEvent(parsedError, metadata) {
        const terminalName = metadata?.terminalName || metadata?.source || 'unknown';
        const recentLogs = this.getRecentLogs(30);
        this.onErrorEmitter.fire({
            time: parsedError.timestamp,
            source: terminalName,
            message: parsedError.message,
            recentLogs: recentLogs.map(log => ({
                timestamp: log.error.timestamp,
                level: log.error.severity === types_1.ErrorSeverity.CRITICAL ? 'error' :
                    log.error.severity === types_1.ErrorSeverity.HIGH ? 'error' :
                        log.error.severity === types_1.ErrorSeverity.MEDIUM ? 'warn' : 'info',
                source: 'terminal',
                message: log.error.message,
                rawOutput: log.error.rawOutput
            }))
        });
    }
    /**
     * 최근 로그를 가져옵니다 (에러 이벤트용)
     */
    getRecentLogs(count) {
        const allErrors = this.history.getAll();
        return allErrors
            .filter(e => e.error.source === types_1.ErrorSource.TERMINAL)
            .sort((a, b) => b.error.timestamp - a.error.timestamp)
            .slice(0, count);
    }
    /**
     * 스택 트레이스를 파싱합니다
     */
    async parseStackTrace(trace) {
        const parsedError = this.parser.parse(trace, types_1.ErrorSource.RUNTIME);
        if (parsedError.stackTrace) {
            return this.analyzer.analyze(parsedError.stackTrace);
        }
        return null;
    }
    /**
     * 파일 위치를 추출합니다
     */
    async extractFileLocation(error) {
        if (error.stackTrace) {
            return this.analyzer.extractErrorLocation(error.stackTrace);
        }
        return error.location;
    }
    /**
     * 에러 히스토리를 가져옵니다
     */
    getErrorHistory(filter) {
        if (filter) {
            return this.history.getFiltered(filter).map(e => e.error);
        }
        return this.history.getAll().map(e => e.error);
    }
    /**
     * 해결되지 않은 에러를 가져옵니다
     */
    getUnresolvedErrors() {
        return this.history.getUnresolved().map(e => e.error);
    }
    /**
     * 에러를 해결된 것으로 표시합니다
     */
    resolveError(errorId, resolution) {
        return this.history.resolve(errorId, resolution);
    }
    /**
     * 수정 제안을 생성합니다
     */
    async suggestFix(error) {
        const suggestions = [];
        // 패턴 기반 제안
        for (const pattern of this.patterns.values()) {
            if (pattern.pattern.test(error.message) ||
                (error.rawOutput && pattern.pattern.test(error.rawOutput))) {
                if (pattern.suggest) {
                    const patternSuggestions = pattern.suggest(error);
                    suggestions.push(...patternSuggestions);
                }
            }
        }
        // 카테고리별 기본 제안
        switch (error.category) {
            case types_1.ErrorCategory.SYNTAX:
                suggestions.push({
                    id: `fix_${Date.now()}`,
                    type: 'code',
                    title: 'Check syntax',
                    description: 'Review the code for syntax errors',
                    confidence: 0.7,
                    automated: false
                });
                break;
            case types_1.ErrorCategory.TYPE:
                suggestions.push({
                    id: `fix_${Date.now()}`,
                    type: 'code',
                    title: 'Fix type mismatch',
                    description: 'Check variable types and ensure they match',
                    confidence: 0.7,
                    automated: false
                });
                break;
            case types_1.ErrorCategory.DEPENDENCY:
                if (error.metadata?.package) {
                    suggestions.push({
                        id: `fix_${Date.now()}`,
                        type: 'install',
                        title: `Install ${error.metadata.package}`,
                        description: `Run: npm install ${error.metadata.package}`,
                        confidence: AgentConfig_1.AgentConfig.ERROR_FIX_CONFIDENCE.AUTOMATED,
                        automated: true,
                        fix: {
                            packages: [error.metadata.package],
                            packageManager: 'npm'
                        }
                    });
                }
                break;
            case types_1.ErrorCategory.FILE_SYSTEM:
                if (error.location?.file) {
                    suggestions.push({
                        id: `fix_${Date.now()}`,
                        type: 'code',
                        title: 'Create missing file',
                        description: `Create the file: ${error.location.file}`,
                        confidence: AgentConfig_1.AgentConfig.ERROR_FIX_CONFIDENCE.MANUAL,
                        automated: false
                    });
                }
                break;
        }
        // 신뢰도 순으로 정렬
        suggestions.sort((a, b) => b.confidence - a.confidence);
        return suggestions;
    }
    /**
     * 에러 패턴을 등록합니다
     */
    registerPattern(pattern) {
        this.patterns.set(pattern.id, pattern);
        console.log(`[ErrorManager] Registered error pattern: ${pattern.id}`);
    }
    /**
     * 통계를 가져옵니다
     */
    getStats() {
        return this.history.getStats();
    }
    /**
     * 유사한 에러를 그룹화합니다
     */
    groupErrors() {
        return this.history.groupSimilar();
    }
    /**
     * 오류 수정을 위한 LLM 메시지 전송
     */
    async sendMessageForErrorCorrection(prompt, llmApiClient, abortSignal) {
        try {
            // LLMApiClient의 sendMessage 메서드 사용
            const response = await llmApiClient.sendMessage(prompt, { signal: abortSignal });
            console.log(`[ErrorManager] 오류 수정 응답: ${response}`);
            return response;
        }
        catch (error) {
            console.error('[ErrorManager] 오류 수정 메시지 전송 실패:', error);
            throw error;
        }
    }
    /**
     * ErrorInfo를 ParsedError로 변환합니다
     */
    convertErrorInfoToParsedError(errorInfo, rawOutput, source, metadata) {
        return {
            id: this.generateErrorId(),
            source,
            category: this.mapErrorTypeToCategory(errorInfo.type),
            severity: errorInfo.severity,
            message: errorInfo.message,
            rawOutput,
            timestamp: Date.now(),
            location: errorInfo.details ? {
                file: errorInfo.details.file,
                line: errorInfo.details.line,
                column: errorInfo.details.column
            } : undefined,
            metadata: {
                ...metadata,
                ...errorInfo.details
            }
        };
    }
    /**
     * ErrorType을 ErrorCategory로 매핑합니다
     */
    mapErrorTypeToCategory(errorType) {
        const mapping = {
            'PORT_CONFLICT': types_1.ErrorCategory.NETWORK,
            'COMMAND_NOT_FOUND': types_1.ErrorCategory.DEPENDENCY,
            'PERMISSION_DENIED': types_1.ErrorCategory.PERMISSION,
            'SYNTAX_ERROR': types_1.ErrorCategory.SYNTAX,
            'RUNTIME_ERROR': types_1.ErrorCategory.RUNTIME,
            'NETWORK_ERROR': types_1.ErrorCategory.NETWORK,
            'FILE_NOT_FOUND': types_1.ErrorCategory.FILE_SYSTEM,
            'OUT_OF_MEMORY': types_1.ErrorCategory.RUNTIME,
            'TIMEOUT': types_1.ErrorCategory.RUNTIME,
            'UNKNOWN': types_1.ErrorCategory.UNKNOWN
        };
        return mapping[errorType] || types_1.ErrorCategory.UNKNOWN;
    }
    /**
     * 기본 에러 패턴을 등록합니다
     */
    registerDefaultPatterns() {
        // 포트 충돌
        this.registerPattern({
            id: 'port_conflict',
            name: 'Port Conflict',
            category: types_1.ErrorCategory.NETWORK,
            severity: types_1.ErrorSeverity.HIGH,
            pattern: /port\s+\d+\s+(?:is\s+)?(?:already\s+)?(?:in\s+use|occupied)/i,
            extract: (match, raw) => ({
                category: types_1.ErrorCategory.NETWORK,
                severity: types_1.ErrorSeverity.HIGH,
                message: match[0]
            }),
            suggest: (error) => [{
                    id: 'fix_port',
                    type: 'command',
                    title: 'Kill process on port',
                    description: `Stop the process using the port`,
                    confidence: AgentConfig_1.AgentConfig.ERROR_FIX_CONFIDENCE.SEMI_AUTO,
                    automated: false
                }]
        });
        console.log('[ErrorManager] Default error patterns registered');
    }
    /**
     * 에러 ID를 생성합니다
     */
    generateErrorId() {
        return `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    /**
     * ErrorHistory를 가져옵니다
     */
    getHistory() {
        return this.history;
    }
    /**
     * ErrorParser를 가져옵니다
     */
    getParser() {
        return this.parser;
    }
    /**
     * StackTraceAnalyzer를 가져옵니다
     */
    getAnalyzer() {
        return this.analyzer;
    }
}
exports.ErrorManager = ErrorManager;
//# sourceMappingURL=ErrorManager.js.map