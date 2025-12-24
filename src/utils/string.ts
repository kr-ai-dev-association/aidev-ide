/**
 * String utility functions
 * 문자열 유틸리티 함수들
 */

/**
 * AI 모델 출력에서 잘못 이스케이프된 HTML 엔티티를 수정합니다
 * @param text AI 모델에서 나온 잘못 이스케이프된 HTML 엔티티가 포함될 수 있는 문자열
 * @returns HTML 엔티티가 일반 문자로 변환된 문자열
 */
export function fixModelHtmlEscaping(text: string): string {
    return text
        .replace(/&gt;/g, ">")
        .replace(/&lt;/g, "<")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&")
        .replace(/&apos;/g, "'");
}

/**
 * 잘못된 문자(예: replacement character)를 문자열에서 제거합니다
 * @param text 잘못된 문자가 포함될 수 있는 문자열
 * @returns 잘못된 문자가 제거된 문자열
 */
export function removeInvalidChars(text: string): string {
    // Replacement character () 및 기타 잘못된 문자 제거
    return text.replace(/\uFFFD/g, '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

