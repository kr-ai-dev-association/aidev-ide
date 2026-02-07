/**
 * Legacy Plan Prompt
 * 레거시 계획 수립 프롬프트 (마크다운 체크박스 형식)
 */
export function getLegacyPlanPrompt(options) {
    const { userQuery, os, modelName, topFiles, keywords, forceKorean } = options;
    const languageRule = forceKorean
        ? '\n- 모든 출력은 한국어로 작성하세요. 영어 표현이 필요한 식별자/코드는 그대로 두되 설명과 계획은 한국어로 작성하세요.'
        : '\n- Write all output in English. Keep identifiers/code in their original language, but write descriptions and plans in English.';
    if (forceKorean) {
        return `다음 사용자 요청을 분석하여 단계별 실행 계획을 수립하세요.

사용자 요청:
"""
${userQuery}
"""

프로젝트 컨텍스트:
- OS: ${os}
- 모델: ${modelName}
- 관련 파일:
${topFiles || '(없음)'}
- 키워드: ${keywords || '(없음)'}

요구사항:
- 각 단계는 명확하고 실행 가능해야 합니다.
- 단계는 순서대로 번호를 매겨주세요.
- 각 단계는 한 문장으로 간결하게 작성하세요.
- 마크다운 체크박스 형식(- [ ] 단계 설명)으로 작성하세요.
- 최대 10개 단계로 제한하세요.${languageRule}

출력 형식:
- [ ] 1단계: 첫 번째 작업
- [ ] 2단계: 두 번째 작업
- [ ] 3단계: 세 번째 작업
...`;
    }
    return `Analyze the following user request and create a step-by-step execution plan.

User request:
"""
${userQuery}
"""

Project context:
- OS: ${os}
- Model: ${modelName}
- Related files:
${topFiles || '(none)'}
- Keywords: ${keywords || '(none)'}

Requirements:
- Each step should be clear and executable.
- Number steps in order.
- Write each step concisely in one sentence.
- Write in markdown checkbox format (- [ ] step description).
- Limit to maximum 10 steps.${languageRule}

Output format:
- [ ] Step 1: First task
- [ ] Step 2: Second task
- [ ] Step 3: Third task
...`;
}
//# sourceMappingURL=legacyPlan.js.map