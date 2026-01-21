/**
 * General Analysis Prompt
 * 일반 분석 질의에 대한 프롬프트
 */

import { getNoThinkingLeakageRules } from "../base";

export function getGeneralAnalysisPrompt(): string {
  const noThinkingLeakage = getNoThinkingLeakageRules();
  return (
    `\n\n[System] ⚠️ 지금까지 읽은 파일과 검색 결과를 기반으로, 사용자의 질문에 한국어로 간단히 직접 답변하세요. **도구를 다시 호출하지 말고**, 한 번의 자연어 답변만 출력하세요.\n` +
    `[System] 예: "handleSearch 함수는 src/components/SearchBar.tsx 파일의 45번째 줄에 정의되어 있습니다."처럼 위치/결과만 명확하게 알려주세요.\n` +
    `[System] **절대 금지**: 도구 호출(JSON function_call 또는 도구 태그)을 출력하는 것. 자연어 답변만 출력하세요.\n\n` +
    `${noThinkingLeakage}\n`
  );
}

export function getBatchScoringPrompt(
  userQuery: string,
  filesSection: string,
): string {
  return `다음 사용자 요청과 여러 파일들의 내용 관련성을 평가하세요.

**사용자 요청:**
${userQuery}

**파일 목록:**
${filesSection}

**평가 기준:**
- 0-30: 관련성 낮음 (거의 관련 없음)
- 31-60: 관련성 보통 (일부 관련 있음)
- 61-80: 관련성 높음 (명확히 관련 있음)
- 81-100: 관련성 매우 높음 (직접적으로 관련 있음)

**출력 형식 (JSON 배열):**
[
  {
    "file": "파일 경로 (relativePath)",
    "score": 75,
    "reasoning": "이 파일이 사용자 요청과 관련된 이유를 간단히 설명"
  },
  ...
]

각 파일마다 score(정수)와 reasoning(한 문장)을 반환하세요.`;
}
