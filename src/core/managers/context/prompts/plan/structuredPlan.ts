/**
 * Structured Plan Prompt
 * 구조화된 계획 수립 프롬프트 (JSON 형식)
 */

export interface StructuredPlanOptions {
    userQuery: string;
    os: string;
    modelName: string;
    topFiles: string;
    keywords: string;
    forceKorean: boolean;
}

export function getStructuredPlanPrompt(options: StructuredPlanOptions): string {
    const { userQuery, os, modelName, topFiles, keywords, forceKorean } = options;

    const languageRule = forceKorean
        ? '\n- "description"과 "title"은 반드시 한국어로 작성하세요. 코드나 식별자는 원래 언어를 유지하세요.'
        : '\n- Write "description" and "title" in English. Keep identifiers/code in their original language.';

    if (forceKorean) {
        return `다음 사용자 요청을 분석하여 실행 가능한 단계별 계획을 JSON 형식으로 수립하세요.

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
1. 복잡한 작업을 논리적인 단계(Step)로 나누세요.
2. 각 단계는 명확한 목표(Goal)와 실행할 툴(Tool)에 대한 힌트를 포함해야 합니다.
3. 파일 생성/수정/삭제가 필요한 경우 파일 경로를 명시하세요.
4. JSON 배열 포맷으로 출력해야 합니다.${languageRule}

출력 포맷 (JSON):
[
  {
    "id": "step_1",
    "title": "작업 제목 (간결하게)",
    "description": "구체적인 작업 내용과 목적",
    "expected_artifact": "생성되거나 수정될 파일 경로 (없으면 null)"
  },
  ...
]`;
    }

    return `다음 사용자 요청을 분석하여 실행 가능한 단계별 계획을 JSON 형식으로 수립하세요.

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
1. 복잡한 작업을 논리적인 단계(Step)로 나누세요.
2. 각 단계는 명확한 목표(Goal)와 실행할 툴(Tool)에 대한 힌트를 포함해야 합니다.
3. 파일 생성/수정/삭제가 필요한 경우 파일 경로를 명시하세요.
4. JSON 배열 포맷으로 출력해야 합니다.${languageRule}

출력 포맷 (JSON):
[
  {
    "id": "step_1",
    "title": "작업 제목 (간결하게)",
    "description": "구체적인 작업 내용과 목적",
    "expected_artifact": "생성되거나 수정될 파일 경로 (없으면 null)"
  },
  ...
]`;
}
