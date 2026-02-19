/**
 * Error Detector
 * 터미널 출력에서 에러를 감지하고 분석하는 클래스
 */
import { ErrorType } from './types';
export class ErrorDetector {
    errorPatterns = new Map();
    constructor() {
        this.registerDefaultPatterns();
    }
    /**
     * 출력에서 에러를 감지합니다
     */
    detectError(output, source = 'terminal') {
        const lines = output.split('\n');
        for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine) {
                continue;
            }
            // 각 에러 타입별로 검사
            for (const [type, patterns] of this.errorPatterns.entries()) {
                for (const pattern of patterns) {
                    const match = pattern.exec(trimmedLine);
                    if (match) {
                        return this.createErrorInfo(type, match, output, source);
                    }
                }
            }
        }
        // 일반적인 에러 키워드 검사
        if (this.hasGeneralErrorKeywords(output)) {
            return this.createErrorInfo(ErrorType.UNKNOWN, null, output, source);
        }
        return null;
    }
    /**
     * 포트 충돌을 감지합니다
     */
    detectPortConflict(output) {
        const portPatterns = [
            /port\s+(\d+)\s+(?:is\s+)?(?:already\s+)?(?:in\s+use|occupied|bound)/i,
            /EADDRINUSE.*:(\d+)/i,
            /address\s+already\s+in\s+use.*:(\d+)/i,
            /listen\s+EADDRINUSE:?\s*.*:(\d+)/i,
            /bind.*failed.*port\s+(\d+)/i
        ];
        for (const pattern of portPatterns) {
            const match = pattern.exec(output);
            if (match) {
                const port = parseInt(match[1], 10);
                return {
                    port,
                    message: `Port ${port} is already in use`
                };
            }
        }
        return null;
    }
    /**
     * ErrorInfo 객체를 생성합니다
     */
    createErrorInfo(type, match, output, source) {
        const details = this.extractDetails(type, match, output);
        return {
            type,
            message: this.extractMessage(match, output),
            severity: this.determineSeverity(type),
            source,
            timestamp: Date.now(),
            details
        };
    }
    /**
     * 에러 메시지를 추출합니다
     */
    extractMessage(match, output) {
        if (match && match[0]) {
            return match[0].trim();
        }
        // 첫 번째 에러 라인을 찾습니다
        const lines = output.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (this.looksLikeError(trimmed)) {
                return trimmed;
            }
        }
        return output.split('\n')[0].trim();
    }
    /**
     * 에러 상세 정보를 추출합니다
     */
    extractDetails(type, match, output) {
        const details = {};
        // 포트 번호 추출
        if (type === ErrorType.PORT_CONFLICT) {
            const portMatch = /\d+/.exec(match ? match[0] : output);
            if (portMatch) {
                details.port = parseInt(portMatch[0], 10);
            }
        }
        // 파일 경로 추출 (확장자 있는 파일 + 특수 파일명)
        // 지원: .ts, .js, .tsx, .jsx, .py, .java, .go, .rs, .cpp, .c, .json, .yaml, .yml, .toml, .md, .sh, .css, .scss, .html
        // 특수 파일: .env*, Dockerfile*, Makefile, .gitignore, .eslintrc*, .prettierrc*, package.json 등
        const filePatterns = [
            // 표준 확장자 파일
            /(?:at\s+|in\s+|File\s+")?([\/\w\-\.]+\.(?:ts|js|tsx|jsx|mjs|cjs|py|java|go|rs|cpp|c|h|hpp|json|yaml|yml|toml|md|sh|bash|zsh|css|scss|sass|less|html|xml|sql|rb|php|swift|kt|scala|vue|svelte))(?::(\d+))?(?::(\d+))?/i,
            // .env 파일 (.env, .env.local, .env.development 등)
            /(?:at\s+|in\s+|File\s+")?([\/\w\-]*\.env(?:\.[a-zA-Z]+)?)(?::(\d+))?(?::(\d+))?/i,
            // 특수 설정 파일 (확장자 없음 또는 dot prefix)
            /(?:at\s+|in\s+|File\s+")?([\/\w\-]*(?:Dockerfile|Makefile|Procfile|Gemfile|Rakefile|\.gitignore|\.dockerignore|\.editorconfig|\.browserslistrc)(?:\.[a-zA-Z]+)?)(?::(\d+))?(?::(\d+))?/i,
            // rc 설정 파일 (.eslintrc, .prettierrc, .babelrc 등)
            /(?:at\s+|in\s+|File\s+")?([\/\w\-]*\.[a-z]+rc(?:\.(?:js|json|yaml|yml))?)(?::(\d+))?(?::(\d+))?/i
        ];
        let fileMatch = null;
        for (const pattern of filePatterns) {
            fileMatch = pattern.exec(output);
            if (fileMatch)
                break;
        }
        if (fileMatch) {
            details.file = fileMatch[1];
            if (fileMatch[2]) {
                details.line = parseInt(fileMatch[2], 10);
            }
            if (fileMatch[3]) {
                details.column = parseInt(fileMatch[3], 10);
            }
        }
        // 스택 트레이스 추출
        if (output.includes('at ') || output.includes('Stack trace:')) {
            const stackLines = output.split('\n').filter(line => line.trim().startsWith('at ') ||
                line.includes('Stack trace:'));
            if (stackLines.length > 0) {
                details.stackTrace = stackLines.join('\n');
            }
        }
        // 제안 추가
        details.suggestion = this.getSuggestion(type, details);
        return details;
    }
    /**
     * 심각도를 결정합니다
     */
    determineSeverity(type) {
        const severityMap = {
            [ErrorType.PORT_CONFLICT]: 'high',
            [ErrorType.COMMAND_NOT_FOUND]: 'high',
            [ErrorType.PERMISSION_DENIED]: 'high',
            [ErrorType.SYNTAX_ERROR]: 'medium',
            [ErrorType.RUNTIME_ERROR]: 'medium',
            [ErrorType.NETWORK_ERROR]: 'medium',
            [ErrorType.FILE_NOT_FOUND]: 'medium',
            [ErrorType.OUT_OF_MEMORY]: 'critical',
            [ErrorType.TIMEOUT]: 'low',
            [ErrorType.UNKNOWN]: 'low'
        };
        return severityMap[type] || 'low';
    }
    /**
     * 수정 제안을 생성합니다
     */
    getSuggestion(type, details) {
        switch (type) {
            case ErrorType.PORT_CONFLICT:
                return details.port
                    ? `Try stopping the process using port ${details.port} or use a different port`
                    : 'Try using a different port';
            case ErrorType.COMMAND_NOT_FOUND:
                return details.command
                    ? `Install ${details.command} or check if it's in your PATH`
                    : 'Check if the command is installed and in your PATH';
            case ErrorType.PERMISSION_DENIED:
                return details.file
                    ? `Check file permissions for ${details.file} or run with appropriate privileges`
                    : 'Check permissions or run with appropriate privileges';
            case ErrorType.FILE_NOT_FOUND:
                return details.file
                    ? `Create the file ${details.file} or check the path`
                    : 'Check if the file exists and the path is correct';
            case ErrorType.OUT_OF_MEMORY:
                return 'Increase memory allocation or optimize your code';
            case ErrorType.NETWORK_ERROR:
                return 'Check your network connection and firewall settings';
            default:
                return undefined;
        }
    }
    /**
     * 라인이 에러처럼 보이는지 확인합니다
     */
    looksLikeError(line) {
        const errorKeywords = [
            'error', 'exception', 'failed', 'failure', 'fatal',
            'cannot', 'unable', 'invalid', 'not found', 'denied'
        ];
        const lowerLine = line.toLowerCase();
        return errorKeywords.some(keyword => lowerLine.includes(keyword));
    }
    /**
     * 일반적인 에러 키워드가 있는지 확인합니다
     */
    hasGeneralErrorKeywords(output) {
        const lowerOutput = output.toLowerCase();
        const keywords = [
            'error:', 'exception:', 'fatal:', 'failed:', 'failure:',
            'traceback', 'stack trace'
        ];
        return keywords.some(keyword => lowerOutput.includes(keyword));
    }
    /**
     * 기본 에러 패턴을 등록합니다
     */
    registerDefaultPatterns() {
        // PORT_CONFLICT
        this.addPattern(ErrorType.PORT_CONFLICT, [
            /port\s+\d+\s+(?:is\s+)?(?:already\s+)?(?:in\s+use|occupied)/i,
            /EADDRINUSE/i,
            /address\s+already\s+in\s+use/i
        ]);
        // COMMAND_NOT_FOUND
        this.addPattern(ErrorType.COMMAND_NOT_FOUND, [
            /command\s+not\s+found/i,
            /is\s+not\s+recognized\s+as\s+an\s+internal\s+or\s+external\s+command/i,
            /No\s+such\s+file\s+or\s+directory/i
        ]);
        // PERMISSION_DENIED
        this.addPattern(ErrorType.PERMISSION_DENIED, [
            /permission\s+denied/i,
            /EACCES/i,
            /access\s+is\s+denied/i,
            /operation\s+not\s+permitted/i
        ]);
        // SYNTAX_ERROR
        this.addPattern(ErrorType.SYNTAX_ERROR, [
            /SyntaxError/i,
            /unexpected\s+token/i,
            /invalid\s+syntax/i,
            /ParseError/i
        ]);
        // RUNTIME_ERROR
        this.addPattern(ErrorType.RUNTIME_ERROR, [
            /RuntimeError/i,
            /TypeError/i,
            /ReferenceError/i,
            /NullPointerException/i,
            /IndexError/i
        ]);
        // NETWORK_ERROR
        this.addPattern(ErrorType.NETWORK_ERROR, [
            /ECONNREFUSED/i,
            /ETIMEDOUT/i,
            /ENOTFOUND/i,
            /network\s+error/i,
            /connection\s+refused/i
        ]);
        // FILE_NOT_FOUND
        this.addPattern(ErrorType.FILE_NOT_FOUND, [
            /ENOENT/i,
            /no\s+such\s+file/i,
            /cannot\s+find\s+(?:file|module)/i,
            /FileNotFoundError/i
        ]);
        // OUT_OF_MEMORY
        this.addPattern(ErrorType.OUT_OF_MEMORY, [
            /out\s+of\s+memory/i,
            /OutOfMemoryError/i,
            /JavaScript\s+heap\s+out\s+of\s+memory/i,
            /MemoryError/i
        ]);
        // TIMEOUT
        this.addPattern(ErrorType.TIMEOUT, [
            /timeout/i,
            /timed\s+out/i,
            /ETIMEDOUT/i
        ]);
        console.log('[ErrorDetector] Default error patterns registered');
    }
    /**
     * 에러 패턴을 추가합니다
     */
    addPattern(type, patterns) {
        if (!this.errorPatterns.has(type)) {
            this.errorPatterns.set(type, []);
        }
        this.errorPatterns.get(type).push(...patterns);
    }
    /**
     * 커스텀 패턴을 등록합니다
     */
    registerCustomPattern(type, pattern) {
        this.addPattern(type, [pattern]);
        console.log(`[ErrorDetector] Registered custom pattern for ${type}`);
    }
}
//# sourceMappingURL=ErrorDetector.js.map