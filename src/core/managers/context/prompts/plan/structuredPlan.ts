/**
 * Structured Plan Prompt (JSON format)
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
        ? '\n- Write "description" and "title" in Korean. Keep identifiers/code in their original language.'
        : '\n- Write "description" and "title" in English. Keep identifiers/code in their original language.';

    return `Analyze the following user request and create a step-by-step executable plan in JSON format.

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
1. Break complex tasks into logical steps.
2. Each step must include a clear goal and hints about which tools to use.
3. Specify file paths when file creation/modification/deletion is needed.
4. Output must be in JSON array format.${languageRule}

Output format (JSON):
[
  {
    "id": "step_1",
    "title": "Task title in Korean (concise)",
    "description": "Specific task details and purpose in Korean",
    "expected_artifact": "File path to be created or modified (null if none)"
  },
  ...
]`;
}
