/**
 * Banya LLM 프롬프트 컴포넌트
 * Banya Solar 모델 최적화
 */

export function getBanyaPrompt(): string {
    return `**Banya Solar 모델 최적화 지침:**
- **도구 호출 형식**: { "tool": "도구명", "path": "..." } 형식 사용
- **파일 내용**: <file_content> ... </file_content> 블록 사용
- **한국어 우선 처리**: 한국어 요청에 대해 자연스러운 한국어로 응답하세요.
- **간결하고 정확한 응답**: 불필요한 서론이나 반복을 피하고 핵심 내용만 전달하세요.
- **구조화된 출력**: 명확한 단계별 설명과 함께 실행 가능한 코드를 제공하세요.
- **금지된 형식**: XML 태그 사용 금지`;
}
