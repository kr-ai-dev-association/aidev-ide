/**
 * Error Manager
 * 에러 감지, 파싱, 분석을 담당하는 메인 매니저
 */

import * as vscode from 'vscode';
import {
    ParsedError,
    ErrorSource,
    ErrorCategory,
    ErrorSeverity,
    ErrorHistoryEntry,
    ErrorFilter,
    ErrorStats,
    ErrorGroup,
    FixSuggestion,
    ErrorPattern
} from './types';
import { ErrorParser } from './ErrorParser';
import { StackTraceAnalyzer } from './StackTraceAnalyzer';
import { ErrorHistory } from './ErrorHistory';
import { ExecutionManager } from '../execution/ExecutionManager';

/**
 * 터미널 에러 이벤트 (terminalMonitorService에서 사용하던 인터페이스)
 */
export interface TerminalErrorEvent {
    time: number;
    source: string;
    message: string;
    recentLogs: Array<{
        timestamp: number;
        level: 'info' | 'warn' | 'error' | 'debug';
        source: 'terminal' | 'console' | 'output';
        message: string;
        rawOutput: string;
    }>;
}

export class ErrorManager {
    private static instance: ErrorManager;
    private parser: ErrorParser;
    private analyzer: StackTraceAnalyzer;
    private history: ErrorHistory;
    private patterns: Map<string, ErrorPattern> = new Map();
    private executionManager?: ExecutionManager;
    private onErrorEmitter = new vscode.EventEmitter<TerminalErrorEvent>();
    public readonly onError = this.onErrorEmitter.event;

    private constructor() {
        this.parser = new ErrorParser();
        this.analyzer = new StackTraceAnalyzer();
        this.history = new ErrorHistory();
        this.registerDefaultPatterns();
    }

    public static getInstance(): ErrorManager {
        if (!ErrorManager.instance) {
            ErrorManager.instance = new ErrorManager();
        }
        return ErrorManager.instance;
    }

    /**
     * Execution Manager를 설정합니다
     */
    public setExecutionManager(executionManager: ExecutionManager): void {
        this.executionManager = executionManager;
        console.log('[ErrorManager] Execution Manager set');
    }

    /**
     * 에러를 캡처하고 파싱합니다
     */
    public async captureError(
        source: ErrorSource,
        output: string,
        metadata?: any
    ): Promise<ParsedError> {
        console.log(`[ErrorManager] Capturing error from ${source}`);

        // Execution Manager의 ErrorDetector 사용 (있는 경우)
        if (this.executionManager) {
            const errorInfo = this.executionManager.detectError(output);
            if (errorInfo) {
                // ErrorInfo를 ParsedError로 변환
                const parsedError = this.convertErrorInfoToParsedError(errorInfo, output, source, metadata);
                this.history.add(parsedError);
                
                // 터미널 에러인 경우 이벤트 발행
                if (source === ErrorSource.TERMINAL) {
                    this.fireTerminalErrorEvent(parsedError, metadata);
                }
                
                return parsedError;
            }
        }

        // 직접 파싱
        const parsedError = this.parser.parse(output, source, metadata);
        this.history.add(parsedError);

        // 터미널 에러인 경우 이벤트 발행
        if (source === ErrorSource.TERMINAL) {
            this.fireTerminalErrorEvent(parsedError, metadata);
        }

        return parsedError;
    }

    /**
     * 터미널 에러 이벤트를 발행합니다
     */
    private fireTerminalErrorEvent(parsedError: ParsedError, metadata?: any): void {
        const terminalName = metadata?.terminalName || metadata?.source || 'unknown';
        const recentLogs = this.getRecentLogs(30);
        
        this.onErrorEmitter.fire({
            time: parsedError.timestamp,
            source: terminalName,
            message: parsedError.message,
            recentLogs: recentLogs.map(log => ({
                timestamp: log.error.timestamp,
                level: log.error.severity === ErrorSeverity.CRITICAL ? 'error' : 
                       log.error.severity === ErrorSeverity.HIGH ? 'error' :
                       log.error.severity === ErrorSeverity.MEDIUM ? 'warn' : 'info',
                source: 'terminal',
                message: log.error.message,
                rawOutput: log.error.rawOutput
            }))
        });
    }

    /**
     * 최근 로그를 가져옵니다 (에러 이벤트용)
     */
    private getRecentLogs(count: number): ErrorHistoryEntry[] {
        const allErrors = this.history.getAll();
        return allErrors
            .filter(e => e.error.source === ErrorSource.TERMINAL)
            .sort((a, b) => b.error.timestamp - a.error.timestamp)
            .slice(0, count);
    }

    /**
     * 스택 트레이스를 파싱합니다
     */
    public async parseStackTrace(trace: string): Promise<any> {
        const parsedError = this.parser.parse(trace, ErrorSource.RUNTIME);
        
        if (parsedError.stackTrace) {
            return this.analyzer.analyze(parsedError.stackTrace);
        }

        return null;
    }

    /**
     * 파일 위치를 추출합니다
     */
    public async extractFileLocation(error: ParsedError): Promise<any> {
        if (error.stackTrace) {
            return this.analyzer.extractErrorLocation(error.stackTrace);
        }

        return error.location;
    }

    /**
     * 에러 히스토리를 가져옵니다
     */
    public getErrorHistory(filter?: ErrorFilter): ParsedError[] {
        if (filter) {
            return this.history.getFiltered(filter).map(e => e.error);
        }
        return this.history.getAll().map(e => e.error);
    }

    /**
     * 해결되지 않은 에러를 가져옵니다
     */
    public getUnresolvedErrors(): ParsedError[] {
        return this.history.getUnresolved().map(e => e.error);
    }

    /**
     * 에러를 해결된 것으로 표시합니다
     */
    public resolveError(errorId: string, resolution: any): boolean {
        return this.history.resolve(errorId, resolution);
    }

    /**
     * 수정 제안을 생성합니다
     */
    public async suggestFix(error: ParsedError): Promise<FixSuggestion[]> {
        const suggestions: FixSuggestion[] = [];

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
            case ErrorCategory.SYNTAX:
                suggestions.push({
                    id: `fix_${Date.now()}`,
                    type: 'code',
                    title: 'Check syntax',
                    description: 'Review the code for syntax errors',
                    confidence: 0.7,
                    automated: false
                });
                break;

            case ErrorCategory.TYPE:
                suggestions.push({
                    id: `fix_${Date.now()}`,
                    type: 'code',
                    title: 'Fix type mismatch',
                    description: 'Check variable types and ensure they match',
                    confidence: 0.7,
                    automated: false
                });
                break;

            case ErrorCategory.DEPENDENCY:
                if (error.metadata?.package) {
                    suggestions.push({
                        id: `fix_${Date.now()}`,
                        type: 'install',
                        title: `Install ${error.metadata.package}`,
                        description: `Run: npm install ${error.metadata.package}`,
                        confidence: 0.9,
                        automated: true,
                        fix: {
                            packages: [error.metadata.package],
                            packageManager: 'npm'
                        }
                    });
                }
                break;

            case ErrorCategory.FILE_SYSTEM:
                if (error.location?.file) {
                    suggestions.push({
                        id: `fix_${Date.now()}`,
                        type: 'code',
                        title: 'Create missing file',
                        description: `Create the file: ${error.location.file}`,
                        confidence: 0.8,
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
    public registerPattern(pattern: ErrorPattern): void {
        this.patterns.set(pattern.id, pattern);
        console.log(`[ErrorManager] Registered error pattern: ${pattern.id}`);
    }

    /**
     * 통계를 가져옵니다
     */
    public getStats(): ErrorStats {
        return this.history.getStats();
    }

    /**
     * 유사한 에러를 그룹화합니다
     */
    public groupErrors(): ErrorGroup[] {
        return this.history.groupSimilar();
    }

    /**
     * 오류 수정을 위한 LLM 메시지 전송
     */
    public async sendMessageForErrorCorrection(
        prompt: string,
        llmApiClient: any,
        abortSignal?: AbortSignal
    ): Promise<string> {
        try {
            // LLMApiClient의 sendMessage 메서드 사용
            const response = await llmApiClient.sendMessage(prompt, { signal: abortSignal });
            console.log(`[ErrorManager] 오류 수정 응답: ${response}`);
            return response;
        } catch (error) {
            console.error('[ErrorManager] 오류 수정 메시지 전송 실패:', error);
            throw error;
        }
    }

    /**
     * ErrorInfo를 ParsedError로 변환합니다
     */
    private convertErrorInfoToParsedError(
        errorInfo: any,
        rawOutput: string,
        source: ErrorSource,
        metadata?: any
    ): ParsedError {
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
    private mapErrorTypeToCategory(errorType: string): any {
        const mapping: Record<string, ErrorCategory> = {
            'PORT_CONFLICT': ErrorCategory.NETWORK,
            'COMMAND_NOT_FOUND': ErrorCategory.DEPENDENCY,
            'PERMISSION_DENIED': ErrorCategory.PERMISSION,
            'SYNTAX_ERROR': ErrorCategory.SYNTAX,
            'RUNTIME_ERROR': ErrorCategory.RUNTIME,
            'NETWORK_ERROR': ErrorCategory.NETWORK,
            'FILE_NOT_FOUND': ErrorCategory.FILE_SYSTEM,
            'OUT_OF_MEMORY': ErrorCategory.RUNTIME,
            'TIMEOUT': ErrorCategory.RUNTIME,
            'UNKNOWN': ErrorCategory.UNKNOWN
        };

        return mapping[errorType] || ErrorCategory.UNKNOWN;
    }

    /**
     * 기본 에러 패턴을 등록합니다
     */
    private registerDefaultPatterns(): void {
        // 포트 충돌
        this.registerPattern({
            id: 'port_conflict',
            name: 'Port Conflict',
            category: ErrorCategory.NETWORK,
            severity: ErrorSeverity.HIGH,
            pattern: /port\s+\d+\s+(?:is\s+)?(?:already\s+)?(?:in\s+use|occupied)/i,
            extract: (match, raw) => ({
                category: ErrorCategory.NETWORK,
                severity: ErrorSeverity.HIGH,
                message: match[0]
            }),
            suggest: (error) => [{
                id: 'fix_port',
                type: 'command',
                title: 'Kill process on port',
                description: `Stop the process using the port`,
                confidence: 0.9,
                automated: false
            }]
        });

        console.log('[ErrorManager] Default error patterns registered');
    }

    /**
     * 에러 ID를 생성합니다
     */
    private generateErrorId(): string {
        return `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * ErrorHistory를 가져옵니다
     */
    public getHistory(): ErrorHistory {
        return this.history;
    }

    /**
     * ErrorParser를 가져옵니다
     */
    public getParser(): ErrorParser {
        return this.parser;
    }

    /**
     * StackTraceAnalyzer를 가져옵니다
     */
    public getAnalyzer(): StackTraceAnalyzer {
        return this.analyzer;
    }
}

