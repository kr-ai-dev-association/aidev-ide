/**
 * General Analysis Prompt
 * 일반 분석 질의에 대한 프롬프트
 */

import { getNoThinkingLeakageRules } from '../base';

export function getGeneralAnalysisPrompt(): string {
    const noThinkingLeakage = getNoThinkingLeakageRules();
    return `\n\n[System] ⚠️ 지금까지 읽은 파일과 검색 결과를 기반으로, 사용자의 질문에 한국어로 간단히 직접 답변하세요. **도구를 다시 호출하지 말고**, 한 번의 자연어 답변만 출력하세요.\n` +
        `[System] 예: "handleSearch 함수는 src/components/SearchBar.tsx 파일의 45번째 줄에 정의되어 있습니다."처럼 위치/결과만 명확하게 알려주세요.\n` +
        `[System] **절대 금지**: <list_files>, <read_file>, <ripgrep_search> 등 도구 태그를 출력하는 것. 자연어 답변만 출력하세요.\n\n` +
        `${noThinkingLeakage}\n`;
}
