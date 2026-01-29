/**
 * GPT-OSS LLM 프롬프트 컴포넌트
 */

export function getGPTOSSPrompt(): string {
    return `**GPT-OSS 모델 최적화 지침:**
- **도구 호출 형식**: { "tool": "도구명", "path": "..." } 형식 사용
- **파일 내용**: <file_content> ... </file_content> 블록 사용
- **간결한 구조**: 서론과 결론을 생략하고 즉시 핵심 답변과 도구 호출을 수행하세요.
- **정밀한 실행**: 사용자의 의도를 분석하여 가장 적합한 도구를 선택하세요.
- **금지된 형식**: XML 태그 사용 금지`;
}

