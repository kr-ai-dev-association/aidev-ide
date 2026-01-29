/**
 * Gemma LLM 프롬프트 컴포넌트
 */

export function getGemmaPrompt(): string {
    return `**Gemma 모델 최적화 지침:**
- **도구 호출 형식**: { "tool": "도구명", "path": "..." } 형식 사용
- **파일 내용**: <file_content> ... </file_content> 블록 사용
- **간결하고 명확한 응답**: 기술적인 핵심만 전달하고 불필요한 수식을 피하세요.
- **금지된 형식**: XML 태그 사용 금지`;
}

