/**
 * General Analysis Prompt
 * Prompt for general analysis queries
 */

import { getNoThinkingLeakageRules } from "../base";

export function getGeneralAnalysisPrompt(): string {
  const noThinkingLeakage = getNoThinkingLeakageRules();
  return (
    `\n\n[System] Based on the files read and search results so far, answer the user's question briefly and directly. **Do not call tools again**, and output only a single natural language answer.\n` +
    `[System] Example: "The handleSearch function is defined at line 45 of src/components/SearchBar.tsx." -- Clearly state only the location/result.\n` +
    `[System] **Strictly prohibited**: Outputting tool calls ({ "tool": ... }). Output only natural language answers.\n\n` +
    `${noThinkingLeakage}\n`
  );
}

export function getBatchScoringPrompt(
  userQuery: string,
  filesSection: string,
): string {
  return `Evaluate the relevance of the following user request to the content of multiple files.

**User request:**
${userQuery}

**File list:**
${filesSection}

**Evaluation criteria:**
- 0-30: Low relevance (almost unrelated)
- 31-60: Moderate relevance (partially related)
- 61-80: High relevance (clearly related)
- 81-100: Very high relevance (directly related)

**Output format (JSON array):**
[
  {
    "file": "file path (relativePath)",
    "score": 75,
    "reasoning": "Brief explanation of why this file is related to the user request"
  },
  ...
]

Return a score (integer) and reasoning (one sentence) for each file.`;
}
