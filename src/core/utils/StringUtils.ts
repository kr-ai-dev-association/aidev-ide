/**
 * StringUtils
 * 문자열 처리 유틸리티 함수들을 모아놓은 클래스
 */

import { TextPatterns } from '../config/TextPatterns';

export class StringUtils {
    /**
     * LLM 응답에서 thinking/reasoning 태그를 모두 제거
     */
    static removeThinkingTags(text: string): string {
        let result = text;
        for (const pattern of TextPatterns.getThinkingPatterns()) {
            result = result.replace(pattern, '');
        }
        return result;
    }
    
    /**
     * LLM 응답에서 자연어 추론 패턴을 모두 제거
     */
    static removeNaturalLanguagePatterns(text: string): string {
        let result = text;
        for (const pattern of TextPatterns.getNaturalLanguagePatterns()) {
            result = result.replace(pattern, '');
        }
        return result;
    }
    
    /**
     * LLM 응답에서 시스템 메시지 패턴을 모두 제거
     */
    static removeSystemMessagePatterns(text: string): string {
        let result = text;
        for (const pattern of TextPatterns.getSystemMessagePatterns()) {
            result = result.replace(pattern, '');
        }
        return result;
    }
    
    /**
     * LLM 응답에서 도구 호출 태그를 모두 제거
     */
    static removeToolTags(text: string): string {
        let result = text;
        for (const pattern of TextPatterns.getToolTagPatterns()) {
            result = result.replace(pattern, '');
        }
        return result;
    }
    
    /**
     * JSON 래핑된 응답을 파싱하여 실제 내용 추출
     */
    static extractJsonContent(text: string): string {
        const jsonMatch = text.match(TextPatterns.JSON_WRAPPER);
        if (jsonMatch) {
            try {
                const parsed = JSON.parse(text);
                return parsed.response || parsed.content || parsed.message || parsed.text || text;
            } catch {
                return text;
            }
        }
        return text;
    }
    
    /**
     * JSON 응답에서 thinking 필드 제거
     */
    static removeJsonThinkingFields(text: string): string {
        return text
            .replace(TextPatterns.JSON_THINKING_FIELD_STRING, '')
            .replace(TextPatterns.JSON_THINKING_FIELD_OBJECT, '');
    }
    
    /**
     * 텍스트를 완전히 정제 (모든 패턴 제거)
     */
    static cleanText(text: string, options: {
        removeThinking?: boolean;
        removeNaturalLanguage?: boolean;
        removeSystemMessages?: boolean;
        removeToolTags?: boolean;
        removeJsonThinking?: boolean;
        extractJson?: boolean;
    } = {}): string {
        const {
            removeThinking = true,
            removeNaturalLanguage = true,
            removeSystemMessages = true,
            removeToolTags = true,
            removeJsonThinking = true,
            extractJson = true
        } = options;
        
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
        result = result.replace(TextPatterns.INVESTIGATION_DONE, '');
        
        return result.trim();
    }
    
    /**
     * 파일 경로에서 파일명 추출
     */
    static extractFileName(filePath: string): string {
        const parts = filePath.split(/[/\\]/);
        return parts[parts.length - 1] || filePath;
    }
    
    /**
     * 파일 경로에서 확장자 추출
     */
    static extractFileExtension(filePath: string): string {
        const parts = filePath.split('.');
        return parts.length > 1 ? parts[parts.length - 1] : '';
    }
    
    /**
     * 텍스트를 지정된 길이로 자르고 말줄임표 추가
     */
    static truncate(text: string, maxLength: number, suffix: string = '...'): string {
        if (text.length <= maxLength) {
            return text;
        }
        return text.substring(0, maxLength - suffix.length) + suffix;
    }
    
    /**
     * 여러 줄 텍스트를 지정된 라인 수로 자르기
     */
    static truncateLines(text: string, maxLines: number, suffix: string = '\n...'): string {
        const lines = text.split('\n');
        if (lines.length <= maxLines) {
            return text;
        }
        return lines.slice(0, maxLines).join('\n') + suffix;
    }
}
