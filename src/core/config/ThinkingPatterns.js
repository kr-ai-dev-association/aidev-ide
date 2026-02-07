/**
 * ThinkingPatterns
 * LLM의 "생각" 패턴 감지를 위한 중앙화된 설정
 *
 * 이 패턴들은 LLM이 내부 추론 과정을 노출할 때 감지하는 데 사용됩니다.
 * <think>...</think> 태그를 사용하지 않는 모델에서 필요합니다.
 *
 * 새로운 패턴을 추가하려면 이 파일만 수정하면 됩니다.
 */
/**
 * 영어 thinking 패턴
 * LLM이 자주 사용하는 추론 문구들
 */
export const THINKING_PATTERNS_EN = [
    // 의도/계획 표현
    /\bWe should\b/i,
    /\bWe need to\b/i,
    /\bWe must\b/i,
    /\bI should\b/i,
    /\bI will\b/i,
    /\bI'll\b/i,
    /\bI need to\b/i,
    // 행동 시작 표현
    /\bLet's\b/i,
    /\bLet me\b/i,
    /\bFirst,?\s*let\b/i,
    /\bNow we need\b/i,
    /\bNow I need\b/i,
    // 추론 과정 표현
    /\bTo do this\b/i,
    /\bProbably need\b/i,
    /\bI think\b/i,
    /\bI assume\b/i,
    /\bI believe\b/i,
    /\bLet's try\b/i,
    // 불확실성 표현
    /\bNot sure\b/i,
    /\bPossibly\b/i,
    /\bMaybe\b/i,
    // 메타 분석 표현
    /\bThe rule says\b/i,
    /\bGiven\b.*\bwe\b/i,
    /\bHowever\b/i,
    /\bBut that's\b/i,
];
/**
 * 한국어 thinking 패턴
 */
export const THINKING_PATTERNS_KO = [
    // 의도/계획 표현
    /먼저.*해야/,
    /우선.*해야/,
    /해야\s*합니다/,
    /해야\s*할\s*것\s*같/,
    /해보겠습니다/,
    /하겠습니다$/,
    // 추론 과정 표현
    /생각합니다/,
    /것\s*같습니다/,
    /보입니다/,
    /추측/,
    // 불확실성 표현
    /아마도/,
    /혹시/,
    /확실하지/,
];
/**
 * 모든 thinking 패턴 (영어 + 한국어)
 */
export const ALL_THINKING_PATTERNS = [
    ...THINKING_PATTERNS_EN,
    ...THINKING_PATTERNS_KO,
];
/**
 * 응답에서 thinking 패턴이 있는지 검사
 * @param text 검사할 텍스트
 * @returns thinking 패턴이 발견되면 true
 */
export function hasThinkingPattern(text) {
    return ALL_THINKING_PATTERNS.some(pattern => pattern.test(text));
}
/**
 * 응답에서 thinking 문장들을 제거
 * @param text 원본 텍스트
 * @returns thinking 문장이 제거된 텍스트
 */
export function removeThinkingPatterns(text) {
    let result = text;
    // 영어 thinking 문장 제거 (문장 단위)
    const sentencePatterns = [
        /We need to[^.]*\./gi,
        /We should[^.]*\./gi,
        /But that's[^.]*\./gi,
        /However[^.]*\./gi,
        /Not sure[^.]*\./gi,
        /Possibly[^.]*\./gi,
        /The rule says[^.]*\./gi,
        /Given[^.]*\./gi,
        /Let's[^.]*\./gi,
        /Let me[^.]*\./gi,
        /I think[^.]*\./gi,
        /I assume[^.]*\./gi,
        /I should[^.]*\./gi,
        /First,? let[^.]*\./gi,
    ];
    for (const pattern of sentencePatterns) {
        result = result.replace(pattern, '');
    }
    // 한국어 thinking 문장 제거
    const koreanPatterns = [
        /먼저[^.]*\./g,
        /우선[^.]*\./g,
        /해야[^.]*\./g,
    ];
    for (const pattern of koreanPatterns) {
        result = result.replace(pattern, '');
    }
    return result.trim();
}
/**
 * <think>...</think> 태그 제거
 * 명시적인 thinking 태그를 사용하는 모델용
 */
export function removeThinkTags(text) {
    return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}
/**
 * 모든 thinking 관련 내용 제거 (태그 + 패턴)
 */
export function cleanThinkingContent(text) {
    let result = removeThinkTags(text);
    result = removeThinkingPatterns(result);
    return result;
}
//# sourceMappingURL=ThinkingPatterns.js.map