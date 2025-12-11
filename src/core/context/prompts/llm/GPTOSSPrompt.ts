/**
 * GPT-OSS LLM 프롬프트 컴포넌트
 */

export function getGPTOSSPrompt(): string {
    return `**GPT-OSS 모델 특화 지침:**
- 표준 마크다운 형식 준수
- 코드 블록: \`\`\`언어 형식으로 명시
- 파일 작업 시 명확한 구분자 사용
- GPT-OSS 출력 형식에 맞춰 응답
- 간결하고 명확한 응답 선호`;
}

