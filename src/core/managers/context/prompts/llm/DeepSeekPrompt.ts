/**
 * DeepSeek LLM 프롬프트 컴포넌트
 */

export function getDeepSeekPrompt(): string {
    return `**DeepSeek 모델 최적화 지침:**
- **XML 도구 중심**: 모든 파일 작업 및 명령 실행은 반드시 XML 태그를 사용하세요. 마크다운 \`\`\` 블록은 금지됩니다.
- **철저한 한국어**: 모든 설명은 한국어로만 제공하세요 (중국어 사용 엄금).
- **간결성**: 핵심 정보 위주로 응답하고 중복된 설명을 피하세요.`;
}

