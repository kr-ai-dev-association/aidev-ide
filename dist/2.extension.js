"use strict";
exports.id = 2;
exports.ids = [2];
exports.modules = {

/***/ 369:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


/**
 * Tool Parser
 * LLM 응답에서 XML 툴 콜을 파싱하는 클래스
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ToolParser = void 0;
const types_1 = __webpack_require__(277);
class ToolParser {
    /**
     * LLM 응답에서 툴 콜을 파싱
     */
    static parseToolCalls(content) {
        const toolCalls = [];
        const toolNames = Object.values(types_1.Tool);
        // XML 태그 기반 파싱
        for (const toolName of toolNames) {
            const pattern = new RegExp(`<${toolName}>([\\s\\S]*?)<\\/${toolName}>`, 'gi');
            let match;
            while ((match = pattern.exec(content)) !== null) {
                const innerContent = match[1];
                const params = this.parseToolParams(innerContent);
                toolCalls.push({
                    name: toolName,
                    params,
                    partial: false
                });
            }
        }
        return toolCalls;
    }
    /**
     * 툴 파라미터 파싱
     */
    static parseToolParams(content) {
        const params = {};
        const paramPattern = /<(\w+)>([\s\S]*?)<\/\1>/g;
        let match;
        while ((match = paramPattern.exec(content)) !== null) {
            const [, paramName, paramValue] = match;
            params[paramName] = paramValue.trim();
        }
        return params;
    }
    /**
     * 부분 블록 감지 (스트리밍 중)
     */
    static detectPartialBlock(content) {
        // 닫는 태그가 없으면 부분 블록
        const openTags = content.match(/<(\w+)>/g) || [];
        const closeTags = content.match(/<\/(\w+)>/g) || [];
        return openTags.length > closeTags.length;
    }
    /**
     * 부분 툴 콜 파싱 (스트리밍 중)
     */
    static parsePartialToolCall(content) {
        // 열린 태그만 있는 경우 감지
        const openTagPattern = /<(\w+)>/g;
        const closeTagPattern = /<\/(\w+)>/g;
        const openTags = [];
        const closeTags = [];
        let match;
        while ((match = openTagPattern.exec(content)) !== null) {
            openTags.push(match[1]);
        }
        while ((match = closeTagPattern.exec(content)) !== null) {
            closeTags.push(match[1]);
        }
        // 닫히지 않은 태그가 있으면 부분 블록
        if (openTags.length > closeTags.length) {
            const lastOpenTag = openTags[openTags.length - 1];
            if (Object.values(types_1.Tool).includes(lastOpenTag)) {
                // 부분 파라미터 파싱
                const partialParams = this.parsePartialParams(content, lastOpenTag);
                return {
                    name: lastOpenTag,
                    params: partialParams,
                    partial: true
                };
            }
        }
        return null;
    }
    /**
     * 부분 파라미터 파싱
     */
    static parsePartialParams(content, toolName) {
        const params = {};
        const toolStart = content.lastIndexOf(`<${toolName}>`);
        if (toolStart === -1)
            return params;
        const toolContent = content.substring(toolStart);
        const paramPattern = /<(\w+)>([\s\S]*?)(?:<\/\1>|$)/g;
        let match;
        while ((match = paramPattern.exec(toolContent)) !== null) {
            const [, paramName, paramValue] = match;
            if (paramValue && !paramValue.includes(`</${paramName}>`)) {
                // 닫히지 않은 파라미터
                params[paramName] = paramValue.trim();
            }
        }
        return params;
    }
}
exports.ToolParser = ToolParser;


/***/ })

};
;
//# sourceMappingURL=2.extension.js.map