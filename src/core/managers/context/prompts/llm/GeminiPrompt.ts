/**
 * Gemini LLM 프롬프트 컴포넌트
 */

export function getGeminiPrompt(): string {
    return `**Gemini 모델 특화 지침:**
- **JSON Function Calling 필수**: 모든 도구 호출은 JSON 형식으로 수행하세요.
- 코드 블록: \`\`\`json 형식으로 function_call 작성
- 구조화된 응답 제공
- **토큰 효율성 가이드**: 도구 호출과 함께 간단한 설명을 제공하세요. 별도의 요약 전용 턴을 생성하지 마세요.
- **계획 수립 시 주의사항**: plan은 반드시 JSON 형식으로 작성하세요. \`\`\`json { "plan": [{ "kind": "...", "title": "...", "detail": "..." }] } \`\`\` 숫자 리스트(1., 2., ...)나 XML은 사용하지 마세요.
- **XML 금지**: XML 태그(<plan>, <create_file> 등)는 사용하지 마세요. 반드시 JSON 형식을 사용하세요.`;
}

