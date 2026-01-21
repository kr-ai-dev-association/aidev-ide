/**
 * Split Instruction Prompt
 * 사용자 지시사항을 행위 단위로 분리하는 프롬프트
 */

export interface SplitInstructionOptions {
    userQuery: string;
    forceKorean: boolean;
}

export function getSplitInstructionPrompt(options: SplitInstructionOptions): string {
    const { userQuery, forceKorean } = options;

    if (forceKorean) {
        return `다음 사용자 지시사항을 행위 단위로 분리하세요. 각 행위는 독립적으로 실행 가능한 단위여야 합니다.

사용자 지시사항:
"""
${userQuery}
"""

요구사항:
- 각 행위를 하나의 문장으로 표현하세요.
- 행위는 동사로 시작하는 명확한 액션으로 작성하세요.
- 각 행위는 순서대로 번호를 매겨주세요.
- JSON 배열 형식으로 출력하세요.

출력 형식 (JSON):
{
  "actions": [
    "첫 번째 행위",
    "두 번째 행위",
    "세 번째 행위"
  ]
}`;
    }

    return `Split the following user instruction into action units. Each action should be independently executable.

User instruction:
"""
${userQuery}
"""

Requirements:
- Express each action as a single sentence.
- Actions should start with a verb and be clear actions.
- Number each action in order.
- Output in JSON array format.

Output format (JSON):
{
  "actions": [
    "First action",
    "Second action",
    "Third action"
  ]
}`;
}

export function getSplitInstructionSystemPrompt(forceKorean: boolean): string {
    return forceKorean
        ? '행위 단위로 지시사항을 분리하세요. JSON 형식으로 응답하세요.'
        : 'Split instructions into action units. Respond in JSON format.';
}
