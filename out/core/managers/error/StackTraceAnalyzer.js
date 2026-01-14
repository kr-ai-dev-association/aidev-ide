"use strict";
/**
 * Stack Trace Analyzer
 * 스택 트레이스를 분석하는 클래스
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.StackTraceAnalyzer = void 0;
class StackTraceAnalyzer {
    /**
     * 스택 트레이스를 분석합니다
     */
    analyze(stackTrace) {
        const frames = stackTrace.frames;
        if (frames.length === 0) {
            return {
                userCodeFrames: [],
                libraryFrames: []
            };
        }
        // 루트 원인 (첫 번째 프레임)
        const rootCause = frames[0];
        // 사용자 코드와 라이브러리 코드 분리
        const userCodeFrames = [];
        const libraryFrames = [];
        for (const frame of frames) {
            if (this.isUserCode(frame)) {
                userCodeFrames.push(frame);
            }
            else {
                libraryFrames.push(frame);
            }
        }
        // 가장 관련성 높은 프레임 (사용자 코드 중 첫 번째)
        const mostRelevantFrame = userCodeFrames.length > 0
            ? userCodeFrames[0]
            : frames[0];
        return {
            rootCause,
            userCodeFrames,
            libraryFrames,
            mostRelevantFrame
        };
    }
    /**
     * 사용자 코드인지 확인합니다
     */
    isUserCode(frame) {
        if (!frame.file) {
            return false;
        }
        const file = frame.file.toLowerCase();
        // node_modules, 라이브러리 경로 제외
        const libraryPatterns = [
            'node_modules',
            'vendor',
            'packages',
            '.gradle',
            '.m2',
            'site-packages',
            'dist',
            'build',
            'target',
            '.next',
            '.nuxt'
        ];
        for (const pattern of libraryPatterns) {
            if (file.includes(pattern)) {
                return false;
            }
        }
        // src, app, lib 등 사용자 코드 경로
        const userCodePatterns = [
            'src/',
            'app/',
            'lib/',
            'components/',
            'pages/',
            'views/',
            'controllers/',
            'services/'
        ];
        for (const pattern of userCodePatterns) {
            if (file.includes(pattern)) {
                return true;
            }
        }
        // 프로젝트 루트의 직접 파일
        if (!file.includes('/') || file.split('/').length <= 2) {
            return true;
        }
        return false;
    }
    /**
     * 스택 트레이스에서 에러 위치를 추출합니다
     */
    extractErrorLocation(stackTrace) {
        const analysis = this.analyze(stackTrace);
        if (analysis.mostRelevantFrame) {
            const frame = analysis.mostRelevantFrame;
            return {
                file: frame.file,
                line: frame.line,
                column: frame.column,
                function: frame.function
            };
        }
        if (analysis.rootCause) {
            const frame = analysis.rootCause;
            return {
                file: frame.file,
                line: frame.line,
                column: frame.column,
                function: frame.function
            };
        }
        return undefined;
    }
    /**
     * 스택 트레이스를 단순화합니다 (중요한 프레임만)
     */
    simplify(stackTrace, maxFrames = 10) {
        const analysis = this.analyze(stackTrace);
        // 사용자 코드 프레임 우선, 그 다음 라이브러리 프레임
        const importantFrames = [
            ...analysis.userCodeFrames.slice(0, maxFrames),
            ...analysis.libraryFrames.slice(0, Math.max(0, maxFrames - analysis.userCodeFrames.length))
        ];
        return {
            frames: importantFrames,
            raw: stackTrace.raw
        };
    }
    /**
     * 스택 트레이스의 깊이를 가져옵니다
     */
    getDepth(stackTrace) {
        return stackTrace.frames.length;
    }
    /**
     * 스택 트레이스에서 특정 파일을 찾습니다
     */
    findFrameByFile(stackTrace, fileName) {
        return stackTrace.frames.find(frame => frame.file && frame.file.includes(fileName));
    }
    /**
     * 스택 트레이스에서 특정 함수를 찾습니다
     */
    findFrameByFunction(stackTrace, functionName) {
        return stackTrace.frames.find(frame => frame.function && frame.function.includes(functionName));
    }
}
exports.StackTraceAnalyzer = StackTraceAnalyzer;
//# sourceMappingURL=StackTraceAnalyzer.js.map