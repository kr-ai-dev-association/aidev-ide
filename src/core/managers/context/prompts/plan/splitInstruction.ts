/**
 * Split Instruction Prompt
 * Prompt for splitting user instructions into action units
 */

export interface SplitInstructionOptions {
    userQuery: string;
    forceKorean: boolean;
}

export function getSplitInstructionPrompt(options: SplitInstructionOptions): string {
    const { userQuery, forceKorean } = options;

    if (forceKorean) {
        return `Split the following user instruction into action units. Each action should be an independently executable unit.

User instruction:
"""
${userQuery}
"""

Requirements:
- Express each action as a single sentence.
- Actions should be written as clear actions starting with a verb.
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
        ? 'Split instructions into action units. Respond in JSON format.'
        : 'Split instructions into action units. Respond in JSON format.';
}
