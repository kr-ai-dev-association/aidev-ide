/**
 * GPT-OSS LLM 프롬프트 컴포넌트
 */

export function getGPTOSSPrompt(): string {
    return `**GPT-OSS 모델 최적화 지침:**
- **XML 도구 호출 필수**: 마크다운 대신 제공된 XML 태그(<create_file>, <update_file> 등)를 사용하여 결과를 출력하세요.
- **간결한 구조**: 서론과 결론을 생략하고 즉시 핵심 답변과 도구 호출을 수행하세요.
- **정밀한 실행**: 사용자의 의도를 분석하여 가장 적합한 도구를 선택하세요.`;
}

