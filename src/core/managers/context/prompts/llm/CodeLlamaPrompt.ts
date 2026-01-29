/**
 * CodeLlama LLM 프롬프트 컴포넌트
 */

export function getCodeLlamaPrompt(): string {
    return `**CodeLlama 모델 최적화 지침:**
- **도구 호출 형식**: { "tool": "도구명", "path": "..." } 형식 사용
- **파일 내용**: <file_content> ... </file_content> 블록 사용
- **코드 중심**: 불필요한 설명은 줄이고 바로 실행 가능한 도구 호출을 수행하세요.
- **금지된 형식**: XML 태그 사용 금지`;
}

