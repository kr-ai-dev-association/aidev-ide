/**
 * Plan Mode Prompt
 * Read-only mode that generates an implementation plan (Markdown) after exploring the codebase
 */

export interface PlanPromptOptions {
  codebaseContext?: string;
  profileContext?: string;
  intentContext?: string;
  realTimeInfo?: string;
  gitContext?: string;
  languageInstruction?: string;
  selectedFilesContent?: string;
  terminalContextContent?: string;
  diagnosticsContextContent?: string;
  frameworkRulesPrompt?: string;
  hotLoadPrompt?: string;
  ragContext?: string;
}

export function getPlanPrompt(options: PlanPromptOptions): string {
  const {
    codebaseContext = "",
    profileContext = "",
    intentContext = "",
    realTimeInfo = "",
    gitContext = "",
    languageInstruction = "",
    selectedFilesContent = "",
    terminalContextContent = "",
    diagnosticsContextContent = "",
    frameworkRulesPrompt = "",
    hotLoadPrompt = "",
    ragContext = "",
  } = options;

  const selectedFilesSection = selectedFilesContent
    ? `\n## Attached Files\n${selectedFilesContent}\n`
    : "";

  const terminalContextSection = terminalContextContent
    ? `\n## Terminal Output\n\`\`\`\n${terminalContextContent}\n\`\`\`\n`
    : "";

  const diagnosticsContextSection = diagnosticsContextContent
    ? `\n## Diagnostics\n${diagnosticsContextContent}\n`
    : "";

  const ragSection = ragContext
    ? `\n## Reference Documents (RAG)\n${ragContext}\n`
    : "";

  let skillsSection = '';
  try {
    const { PromptComposer } = require('../PromptComposer');
    const { text: agentRulesRaw, ruleKeys: localRuleKeys } = PromptComposer.loadAgentRulesWithKeys();
    const { text: serverRules, overrideKeys } = PromptComposer.loadServerPromptTemplates(localRuleKeys);

    let agentRules = agentRulesRaw;
    if (overrideKeys.size > 0 && agentRulesRaw) {
      for (const key of overrideKeys) {
        const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const sectionRegex = new RegExp(`\\*\\*[^*]*${escapedKey}[^*]*\\(mandatory rule\\):\\*\\*[\\s\\S]*?(?=\\n---\\n|$)`, 'gi');
        agentRules = agentRules.replace(sectionRegex, '').trim();
      }
      agentRules = agentRules.replace(/(\n---\n)+/g, '\n---\n').replace(/^\n---\n|\n---\n$/g, '').trim();
    }

    const parts = [agentRules, serverRules].filter(Boolean);
    if (parts.length > 0) {
      skillsSection = `\n\n## Project Development Rules\n${parts.join('\n\n')}`;
    }
  } catch { /* Ignore if Skills loading fails */ }

  return `You are an experienced software architect. You are currently operating in **PLAN mode**.
${hotLoadPrompt}
## PLAN Mode Rules

**Allowed tools (read-only):**
- read_file, glob_search, ripgrep_search, stat_file, list_files

**Strictly prohibited:**
- create_file, update_file, delete_file -- Cannot modify/create/delete files
- run_command -- Cannot execute commands
- Writing and applying code directly

**Role:**
1. Use tools to thoroughly explore the codebase
2. Once exploration is complete, output an implementation plan in the format below as Markdown
3. Terminate immediately after outputting the plan (no additional tool calls)

## Plan Output Format

After exploration is complete, you must output the plan in the following format:

\`\`\`markdown
# Implementation Plan: [Request Summary]

## Overview
[Describe the purpose and scope of the changes in 1-3 sentences]

## Analysis Results
[Key findings from exploration -- include specific details such as file paths, function names, line numbers]

## Target Files for Changes
| File | Change Type | Description |
|------|-------------|-------------|
| src/foo/bar.ts | Modify | ... |

## Implementation Steps
1. **[Step Name]**: [Specific task description]
   - File: \`path/to/file.ts\`
   - Change: [What and how]
2. ...

## Notes / Risks
- [Potential side effects, testing requirements, dependencies, etc.]

## Estimated Effort
- Difficulty: [Low/Medium/High]
- Number of files to change: N
\`\`\`
${selectedFilesSection}${terminalContextSection}${diagnosticsContextSection}${ragSection}${skillsSection}
${gitContext}
${languageInstruction}`;
}
