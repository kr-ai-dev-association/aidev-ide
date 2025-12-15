/**
 * Error Parser
 * 에러 메시지를 파싱하고 구조화하는 클래스
 */

import {
    ParsedError,
    ErrorSource,
    ErrorCategory,
    ErrorSeverity,
    ErrorLocation,
    StackTrace,
    StackFrame,
    ErrorMetadata
} from './types';

export class ErrorParser {
    /**
     * 에러를 파싱합니다
     */
    public parse(
        rawOutput: string,
        source: ErrorSource,
        metadata?: ErrorMetadata
    ): ParsedError {
        const errorId = this.generateErrorId();
        const timestamp = Date.now();

        // 기본 파싱
        const category = this.detectCategory(rawOutput);
        const severity = this.determineSeverity(category, rawOutput);
        const location = this.extractLocation(rawOutput);
        const stackTrace = this.extractStackTrace(rawOutput);
        const message = this.extractMessage(rawOutput, location);

        const parsedError: ParsedError = {
            id: errorId,
            source,
            category,
            severity,
            message,
            rawOutput,
            timestamp,
            location,
            stackTrace,
            metadata: metadata || {}
        };

        console.log(`[ErrorParser] Parsed error: ${errorId} (${category}, ${severity})`);

        return parsedError;
    }

    /**
     * 에러 카테고리를 감지합니다
     */
    private detectCategory(rawOutput: string): ErrorCategory {
        const lower = rawOutput.toLowerCase();

        // SYNTAX
        if (lower.includes('syntaxerror') || lower.includes('syntax error') || 
            lower.includes('parseerror') || lower.includes('unexpected token')) {
            return ErrorCategory.SYNTAX;
        }

        // TYPE
        if (lower.includes('typeerror') || lower.includes('type error') ||
            lower.includes('cannot read property') || lower.includes('undefined is not')) {
            return ErrorCategory.TYPE;
        }

        // RUNTIME
        if (lower.includes('runtimeerror') || lower.includes('runtime error') ||
            lower.includes('referenceerror') || lower.includes('nullpointerexception')) {
            return ErrorCategory.RUNTIME;
        }

        // NETWORK
        if (lower.includes('network') || lower.includes('econnrefused') ||
            lower.includes('etimedout') || lower.includes('enotfound')) {
            return ErrorCategory.NETWORK;
        }

        // FILE_SYSTEM
        if (lower.includes('enoent') || lower.includes('file not found') ||
            lower.includes('cannot find') || lower.includes('no such file')) {
            return ErrorCategory.FILE_SYSTEM;
        }

        // PERMISSION
        if (lower.includes('permission denied') || lower.includes('eacces') ||
            lower.includes('access is denied') || lower.includes('operation not permitted')) {
            return ErrorCategory.PERMISSION;
        }

        // DEPENDENCY
        if (lower.includes('module not found') || lower.includes('cannot find module') ||
            lower.includes('package not found') || lower.includes('dependency')) {
            return ErrorCategory.DEPENDENCY;
        }

        // CONFIGURATION
        if (lower.includes('configuration') || lower.includes('config error') ||
            lower.includes('invalid config') || lower.includes('missing config')) {
            return ErrorCategory.CONFIGURATION;
        }

        return ErrorCategory.UNKNOWN;
    }

    /**
     * 심각도를 결정합니다
     */
    private determineSeverity(category: ErrorCategory, rawOutput: string): ErrorSeverity {
        const lower = rawOutput.toLowerCase();

        // CRITICAL: 메모리 부족, 치명적 오류
        if (lower.includes('out of memory') || lower.includes('fatal') ||
            lower.includes('cannot recover') || lower.includes('abort')) {
            return ErrorSeverity.CRITICAL;
        }

        // HIGH: 런타임 에러, 네트워크 에러, 권한 문제
        if (category === ErrorCategory.RUNTIME || 
            category === ErrorCategory.NETWORK ||
            category === ErrorCategory.PERMISSION) {
            return ErrorSeverity.HIGH;
        }

        // MEDIUM: 구문 오류, 타입 오류, 파일 시스템
        if (category === ErrorCategory.SYNTAX ||
            category === ErrorCategory.TYPE ||
            category === ErrorCategory.FILE_SYSTEM) {
            return ErrorSeverity.MEDIUM;
        }

        // LOW: 의존성, 설정
        if (category === ErrorCategory.DEPENDENCY ||
            category === ErrorCategory.CONFIGURATION) {
            return ErrorSeverity.LOW;
        }

        return ErrorSeverity.MEDIUM;
    }

    /**
     * 에러 위치를 추출합니다
     */
    private extractLocation(rawOutput: string): ErrorLocation | undefined {
        // 파일 경로 패턴들
        const filePatterns = [
            /at\s+([\/\w\-\.]+\.(?:ts|js|tsx|jsx|py|java|go|rs|cpp|c))(?::(\d+))?(?::(\d+))?/i,
            /in\s+([\/\w\-\.]+\.(?:ts|js|tsx|jsx|py|java|go|rs|cpp|c))(?::(\d+))?(?::(\d+))?/i,
            /file\s+["']?([\/\w\-\.]+\.(?:ts|js|tsx|jsx|py|java|go|rs|cpp|c))["']?(?:\s+line\s+(\d+))?/i,
            /([\/\w\-\.]+\.(?:ts|js|tsx|jsx|py|java|go|rs|cpp|c))\((\d+)(?:,\s*(\d+))?\)/i
        ];

        for (const pattern of filePatterns) {
            const match = pattern.exec(rawOutput);
            if (match) {
                const location: ErrorLocation = {
                    file: match[1]
                };

                if (match[2]) {
                    location.line = parseInt(match[2], 10);
                }
                if (match[3]) {
                    location.column = parseInt(match[3], 10);
                }

                // 함수명 추출 시도
                const functionMatch = /at\s+(\w+)\s*\(/.exec(rawOutput);
                if (functionMatch) {
                    location.function = functionMatch[1];
                }

                return location;
            }
        }

        return undefined;
    }

    /**
     * 스택 트레이스를 추출합니다
     */
    private extractStackTrace(rawOutput: string): StackTrace | undefined {
        const stackLines: string[] = [];
        const frames: StackFrame[] = [];

        const lines = rawOutput.split('\n');
        let inStackTrace = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            // 스택 트레이스 시작 감지
            if (line.includes('Stack trace:') || line.includes('at ') || 
                line.match(/^\s*at\s+/)) {
                inStackTrace = true;
            }

            if (inStackTrace) {
                // "at " 패턴
                const atMatch = /at\s+(?:(\w+)\s+)?\(?([\/\w\-\.]+\.(?:ts|js|tsx|jsx|py|java|go|rs|cpp|c))(?::(\d+))?(?::(\d+))?\)?/i.exec(line);
                if (atMatch) {
                    stackLines.push(line);

                    const frame: StackFrame = {
                        file: atMatch[2],
                        line: atMatch[3] ? parseInt(atMatch[3], 10) : 0
                    };

                    if (atMatch[4]) {
                        frame.column = parseInt(atMatch[4], 10);
                    }

                    if (atMatch[1]) {
                        frame.function = atMatch[1];
                    }

                    // 코드 추출 (다음 라인)
                    if (i + 1 < lines.length) {
                        const codeLine = lines[i + 1].trim();
                        if (codeLine && !codeLine.startsWith('at ') && codeLine.length < 100) {
                            frame.code = codeLine;
                        }
                    }

                    frames.push(frame);
                } else if (line && !line.startsWith('at ')) {
                    // 스택 트레이스가 아닌 라인
                    if (line.length < 200) {
                        stackLines.push(line);
                    }
                }
            }
        }

        if (frames.length === 0) {
            return undefined;
        }

        return {
            frames,
            raw: stackLines.join('\n')
        };
    }

    /**
     * 에러 메시지를 추출합니다
     */
    private extractMessage(rawOutput: string, location?: ErrorLocation): string {
        const lines = rawOutput.split('\n');

        // 첫 번째 의미있는 라인 찾기
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed && 
                !trimmed.startsWith('at ') &&
                !trimmed.startsWith('Stack trace:') &&
                !trimmed.startsWith('Error:') &&
                trimmed.length > 10 &&
                trimmed.length < 500) {
                return trimmed;
            }
        }

        // Error: 패턴
        const errorMatch = /Error:\s*(.+)/i.exec(rawOutput);
        if (errorMatch) {
            return errorMatch[1].trim();
        }

        // 첫 번째 라인
        if (lines.length > 0) {
            return lines[0].trim().substring(0, 200);
        }

        return 'Unknown error';
    }

    /**
     * 에러 ID를 생성합니다
     */
    private generateErrorId(): string {
        return `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

