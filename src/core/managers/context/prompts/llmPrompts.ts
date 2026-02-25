/**
 * LLM 공통 프롬프트
 *
 * provider별 분기 없이 단일 프롬프트를 사용합니다.
 * 도구 호출 형식, 응답 스타일 등은 모든 LLM에 공통 적용.
 */

const LLM_PROMPT = `**AI 코드 어시스턴트 지침:**
- **도구 호출 형식**: { "tool": "도구명", "path": "..." } 형식 사용
- **파일 내용**: <file_content> ... </file_content> 블록 사용
- **한국어 우선 처리**: 한국어 요청에 대해 자연스러운 한국어로 응답하세요.
- **간결하고 정확한 응답**: 불필요한 서론이나 반복을 피하고 핵심 내용만 전달하세요.
- **구조화된 출력**: 명확한 단계별 설명과 함께 실행 가능한 코드를 제공하세요.
- **토큰 효율성**: 도구 호출과 함께 간단한 설명을 제공하세요. 별도의 요약 전용 턴을 생성하지 마세요.
- **금지된 형식**: XML 태그 사용 금지`;

/**
 * LLM 프롬프트를 반환합니다.
 * provider/modelType 인자는 하위 호환을 위해 받지만 결과는 동일합니다.
 */
export function getLLMPrompt(_provider?: string): string {
  return LLM_PROMPT;
}

// 하위 호환: 기존 개별 함수 export (llm/index.ts에서 re-export됨)
export const getGeminiPrompt = () => LLM_PROMPT;
export const getBanyaPrompt = () => LLM_PROMPT;
export const getGPTOSSPrompt = () => LLM_PROMPT;
export const getDeepSeekPrompt = () => LLM_PROMPT;
export const getCodeLlamaPrompt = () => LLM_PROMPT;
export const getGemmaPrompt = () => LLM_PROMPT;
export const getDefaultLLMPrompt = () => LLM_PROMPT;
