"use strict";
/**
 * StringUtils
 * 문자열 처리 유틸리티 함수들을 모아놓은 클래스
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.StringUtils = void 0;
const TextPatterns_1 = require("../config/TextPatterns");
class StringUtils {
    /**
     * LLM 응답에서 thinking/reasoning 태그를 모두 제거
     */
    static removeThinkingTags(text) {
        let result = text;
        for (const pattern of TextPatterns_1.TextPatterns.getThinkingPatterns()) {
            result = result.replace(pattern, '');
        }
        return result;
    }
    /**
     * LLM 응답에서 자연어 추론 패턴을 모두 제거
     */
    static removeNaturalLanguagePatterns(text) {
        let result = text;
        for (const pattern of TextPatterns_1.TextPatterns.getNaturalLanguagePatterns()) {
            result = result.replace(pattern, '');
        }
        return result;
    }
    /**
     * LLM 응답에서 시스템 메시지 패턴을 모두 제거
     */
    static removeSystemMessagePatterns(text) {
        let result = text;
        for (const pattern of TextPatterns_1.TextPatterns.getSystemMessagePatterns()) {
            result = result.replace(pattern, '');
        }
        return result;
    }
    /**
     * LLM 응답에서 도구 호출 태그를 모두 제거
     */
    static removeToolTags(text) {
        let result = text;
        for (const pattern of TextPatterns_1.TextPatterns.getToolTagPatterns()) {
            result = result.replace(pattern, '');
        }
        return result;
    }
    /**
     * JSON 래핑된 응답을 파싱하여 실제 내용 추출
     */
    static extractJsonContent(text) {
        const jsonMatch = text.match(TextPatterns_1.TextPatterns.JSON_WRAPPER);
        if (jsonMatch) {
            try {
                const parsed = JSON.parse(text);
                return parsed.response || parsed.content || parsed.message || parsed.text || text;
            }
            catch {
                return text;
            }
        }
        return text;
    }
    /**
     * JSON 응답에서 thinking 필드 제거
     */
    static removeJsonThinkingFields(text) {
        return text
            .replace(TextPatterns_1.TextPatterns.JSON_THINKING_FIELD_STRING, '')
            .replace(TextPatterns_1.TextPatterns.JSON_THINKING_FIELD_OBJECT, '');
    }
    /**
     * 텍스트를 완전히 정제 (모든 패턴 제거)
     */
    static cleanText(text, options = {}) {
        const { removeThinking = true, removeNaturalLanguage = true, removeSystemMessages = true, removeToolTags = true, removeJsonThinking = true, extractJson = true } = options;
        let result = text.trim();
        if (removeJsonThinking) {
            result = this.removeJsonThinkingFields(result);
        }
        if (extractJson) {
            result = this.extractJsonContent(result);
        }
        if (removeThinking) {
            result = this.removeThinkingTags(result);
        }
        if (removeNaturalLanguage) {
            result = this.removeNaturalLanguagePatterns(result);
        }
        if (removeSystemMessages) {
            result = this.removeSystemMessagePatterns(result);
        }
        if (removeToolTags) {
            result = this.removeToolTags(result);
        }
        // investigation_done 토큰 제거
        result = result.replace(TextPatterns_1.TextPatterns.INVESTIGATION_DONE, '');
        return result.trim();
    }
    /**
     * 파일 경로에서 파일명 추출
     */
    static extractFileName(filePath) {
        const parts = filePath.split(/[/\\]/);
        return parts[parts.length - 1] || filePath;
    }
    /**
     * 파일 경로에서 확장자 추출
     */
    static extractFileExtension(filePath) {
        const parts = filePath.split('.');
        return parts.length > 1 ? parts[parts.length - 1] : '';
    }
    /**
     * 텍스트를 지정된 길이로 자르고 말줄임표 추가
     */
    static truncate(text, maxLength, suffix = '...') {
        if (text.length <= maxLength) {
            return text;
        }
        return text.substring(0, maxLength - suffix.length) + suffix;
    }
    /**
     * 여러 줄 텍스트를 지정된 라인 수로 자르기
     */
    static truncateLines(text, maxLines, suffix = '\n...') {
        const lines = text.split('\n');
        if (lines.length <= maxLines) {
            return text;
        }
        return lines.slice(0, maxLines).join('\n') + suffix;
    }
}
exports.StringUtils = StringUtils;
//# sourceMappingURL=StringUtils.js.map