/**
 * GPT-OSS LLM 프롬프트 컴포넌트
 */

export function getGPTOSSPrompt(): string {
    return `**GPT-OSS 모델 최적화 지침:**
- **JSON Function Calling 필수**: 모든 도구 호출은 JSON 형식으로 수행하세요. \`\`\`json { "function_call": { "name": "도구명", "args": {...} } } \`\`\`
- **간결한 구조**: 서론과 결론을 생략하고 즉시 핵심 답변과 도구 호출을 수행하세요.
- **정밀한 실행**: 사용자의 의도를 분석하여 가장 적합한 도구를 선택하세요.
- **XML 금지**: XML 태그(<create_file>, <update_file> 등)는 사용하지 마세요. 반드시 JSON 형식을 사용하세요.`;
}

