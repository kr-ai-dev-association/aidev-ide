/**
 * Summarize Plan Prompt
 * 작업 큐 요약 프롬프트
 */
export function getSummarizePlanPrompt(options) {
    const { itemsText, forceKorean } = options;
    if (forceKorean) {
        return `다음 작업 목록을 매우 간결하게 요약하세요.

**중요 요구사항:**
- 전체 요약을 정확히 100자 이하로 작성 (초과 금지)
- 최대 3개의 핵심 명령어만 출력
- 각 명령어는 30자 이내로 매우 간결하게
- 마크다운 불릿 포인트 형식으로만 출력
- 반복되는 내용은 제거하고 핵심만 추출

**출력 형식 (정확히 이 형식으로만):**
- 전체 요약 (100자 이하)
- 명령어 1 (30자 이내)
- 명령어 2 (30자 이내)
- 명령어 3 (30자 이내)

작업 목록:
${itemsText}

출력:`;
    }
    return `Summarize the following task list very concisely.

**Critical Requirements:**
- Write a summary in exactly 100 characters or less (no exceed)
- Output maximum 3 core commands only
- Each command should be very concise within 30 characters
- Output only in markdown bullet point format
- Remove repetitive content and extract only core points

**Output format (exactly this format only):**
- Overall summary (100 chars or less)
- Command 1 (30 chars or less)
- Command 2 (30 chars or less)
- Command 3 (30 chars or less)

Task list:
${itemsText}

Output:`;
}
export function getSummarizePlanSystemPrompt(forceKorean) {
    return forceKorean
        ? '작업 목록을 간결한 명령어 리스트로 요약하세요. 100자 이하 요약과 최대 3개의 핵심 명령어만 출력하세요.'
        : 'Summarize task list into concise command list. Output summary under 100 chars and max 3 core commands.';
}
//# sourceMappingURL=summarizePlan.js.map