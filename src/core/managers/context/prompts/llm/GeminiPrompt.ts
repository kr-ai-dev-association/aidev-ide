/**
 * Gemini LLM 프롬프트 컴포넌트
 */

export function getGeminiPrompt(): string {
    return `**Gemini 모델 특화 지침:**
- 표준 마크다운 형식 사용
- 코드 블록: \`\`\`언어 형식
- 파일 작업 시 명확한 구분자 사용
- 구조화된 응답 제공`;
}

