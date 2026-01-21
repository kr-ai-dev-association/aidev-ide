/**
 * Gemma LLM 프롬프트 컴포넌트
 */

export function getGemmaPrompt(): string {
    return `**Gemma 모델 최적화 지침:**
- **JSON Function Calling 필수**: 모든 도구 호출은 JSON 형식으로 수행하세요.
- **XML 금지**: XML 태그(<create_file>, <update_file> 등)는 절대 사용하지 마세요.
- **간결하고 명확한 응답**: 기술적인 핵심만 전달하고 불필요한 수식을 피하세요.
- **도구 형식 준수**: \`\`\`json { "function_call": {...} } \`\`\` 형식을 엄격히 따르세요.`;
}

