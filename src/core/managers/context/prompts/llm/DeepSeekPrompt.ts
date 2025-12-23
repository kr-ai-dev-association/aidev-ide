/**
 * DeepSeek LLM 프롬프트 컴포넌트
 */

export function getDeepSeekPrompt(): string {
    return `**DeepSeek 모델 특화 지침:**
- 표준 마크다운 형식 사용
- 코드 블록: \`\`\`언어 형식
- 파일 작업 시 명확한 구분자 사용
- 반드시 한국어로만 답변 (중국어, 영어, 일본어 사용 금지)
- 간결하고 실용적인 응답 제공`;
}

