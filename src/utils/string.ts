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
 * XML CDATA 섹션을 제거합니다
 * LLM이 JSON이나 특수 문자를 CDATA로 감싸는 경우를 처리
 * @param text CDATA 섹션이 포함될 수 있는 문자열
 * @returns CDATA 섹션이 제거된 문자열
 */
export function removeCDataSections(text: string): string {
    // <![CDATA[...]]> 형식 제거
    return text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
}

/**
 * JSON 문자열에서 주석과 후행 쉼표(trailing commas)를 제거합니다.
 * tsconfig.json 등 JSONC 파일을 파싱할 때 유용합니다.
 */
export function cleanJsonContent(text: string): string {
    return text
        // 멀티라인 주석 제거
        .replace(/\/\*[\s\S]*?\*\//g, '')
        // 싱글라인 주석 제거
        .replace(/\/\/.*/g, '')
        // 후행 쉼표 제거 (배열/객체 마지막 요소 뒤의 ,)
        .replace(/,(\s*[\]}])/g, '$1')
        .trim();
}

