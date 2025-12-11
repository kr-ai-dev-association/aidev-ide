/**
 * Gemma LLM 프롬프트 컴포넌트
 */

export function getGemmaPrompt(): string {
    return `**Gemma 모델 특화 지침:**
- 표준 마크다운 형식 사용
- 코드 블록: \`\`\`언어 형식
- 간결하고 명확한 응답
- 구조화된 형식 선호`;
}

