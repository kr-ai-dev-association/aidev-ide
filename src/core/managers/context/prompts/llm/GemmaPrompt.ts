/**
 * Gemma LLM 프롬프트 컴포넌트
 */

export function getGemmaPrompt(): string {
    return `**Gemma 모델 최적화 지침:**
- **XML 기반 액션**: 설명보다는 XML 도구 호출을 우선시하세요.
- **간결하고 명확한 응답**: 기술적인 핵심만 전달하고 불필요한 수식을 피하세요.
- **도구 형식 준수**: 제공된 XML 스키마를 엄격히 따르세요.`;
}

