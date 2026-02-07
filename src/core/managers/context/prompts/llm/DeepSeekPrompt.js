/**
 * DeepSeek LLM 프롬프트 컴포넌트
 */
export function getDeepSeekPrompt() {
    return `**DeepSeek 모델 최적화 지침:**
- **JSON Function Calling 필수**: 모든 파일 작업 및 명령 실행은 반드시 JSON 형식을 사용하세요.
- **XML 금지**: XML 태그(<create_file>, <update_file> 등)는 절대 사용하지 마세요.
- **철저한 한국어**: 모든 설명은 한국어로만 제공하세요 (중국어 사용 엄금).
- **간결성**: 핵심 정보 위주로 응답하고 중복된 설명을 피하세요.`;
}
//# sourceMappingURL=DeepSeekPrompt.js.map