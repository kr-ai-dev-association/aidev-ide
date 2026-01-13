/**
 * Default LLM 프롬프트 컴포넌트
 * 기타 모델용 기본 프롬프트
 */

export function getDefaultLLMPrompt(): string {
    return `**기본 지침:**
- 표준 마크다운 형식 사용
- 코드 블록: \`\`\`언어 형식
- 명확하고 구조화된 응답 제공`;
}

