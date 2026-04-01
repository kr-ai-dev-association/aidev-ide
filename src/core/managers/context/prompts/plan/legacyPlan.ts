/**
 * Legacy Plan Prompt
 * Legacy planning prompt (markdown checkbox format)
 */

export interface LegacyPlanOptions {
    userQuery: string;
    os: string;
    modelName: string;
    topFiles: string;
    keywords: string;
    forceKorean: boolean;
}

export function getLegacyPlanPrompt(options: LegacyPlanOptions): string {
    const { userQuery, os, modelName, topFiles, keywords, forceKorean } = options;

    const languageRule = forceKorean
        ? '\n- Write all output in English. Keep identifiers/code in their original language, but write descriptions and plans in English.'
        : '\n- Write all output in English. Keep identifiers/code in their original language, but write descriptions and plans in English.';

    if (forceKorean) {
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
