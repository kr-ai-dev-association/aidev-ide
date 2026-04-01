/**
 * Summarize Plan Prompt
 * Task queue summarization prompt
 */

export interface SummarizePlanOptions {
    itemsText: string;
    forceKorean: boolean;
}

export function getSummarizePlanPrompt(options: SummarizePlanOptions): string {
    const { itemsText, forceKorean } = options;

    if (forceKorean) {
        return `Summarize the following task list very concisely.

**Critical Requirements:**
- Write the entire summary in exactly 100 characters or less (no exceeding)
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

export function getSummarizePlanSystemPrompt(forceKorean: boolean): string {
    return forceKorean
        ? 'Summarize the task list into a concise command list. Output a summary under 100 chars and max 3 core commands.'
        : 'Summarize task list into concise command list. Output summary under 100 chars and max 3 core commands.';
}
