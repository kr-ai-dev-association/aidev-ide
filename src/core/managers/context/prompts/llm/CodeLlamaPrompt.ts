/**
 * CodeLlama LLM 프롬프트 컴포넌트
 */

export function getCodeLlamaPrompt(): string {
    return `**CodeLlama 모델 최적화 지침:**
- **JSON Function Calling 필수**: 모든 코드는 \`\`\`json { "function_call": {...} } \`\`\` 형식으로 작성하세요.
- **XML 금지**: XML 태그(<create_file>, <update_file> 등)는 절대 사용하지 마세요.
- **코드 중심**: 불필요한 설명은 줄이고 바로 실행 가능한 JSON 도구 호출을 수행하세요.`;
}

