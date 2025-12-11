/**
 * CodeLlama LLM 프롬프트 컴포넌트
 */

export function getCodeLlamaPrompt(): string {
    return `**CodeLlama 모델 특화 지침:**
- 코드 중심 응답 제공
- 표준 마크다운 형식 사용
- 코드 블록: \`\`\`언어 형식
- 코드 품질과 가독성 중시`;
}

