/**
 * Phase Prompt Components
 * Integrated file for phase-specific prompt components
 * v9.2.0: Changed to XML-style file_content tags ({ "tool": "..." } + <file_content> ... </file_content>)
 */

import {
  getPlanFormatRules,
  getMultiFileReadRules,
  getNoDuplicateReadRules,
  getFileExistenceCheckRules,
  getLargeFileChunkReadingRules,
} from "./base";

// ==================== Intent Phase ====================
export function getIntentPrompt(userQuery: string, skillDescriptions: { key: string; description: string }[] = []): string {
  const skillSection = skillDescriptions.length > 0
    ? `

**Registered skills -- you must include the matching keys in requiredSkillKeys:**
${skillDescriptions.map(s => `- "${s.key}": ${s.description}`).join('\n')}

**Rules for determining requiredSkillKeys:**
- If the user request matches the **keywords/intent** of a skill description above, you must include that skill key in the requiredSkillKeys array.
- Example: "review this" -> if it matches a code review skill's description, include that key
- Example: "create an API" -> if it matches an API generation skill's description, include that key
- If no skill matches, return an empty array ([]).
- **If multiple skills are relevant, include all of them.**`
    : '';

  return `
Analyze the following user request and determine the intent (Subtype) and whether a plan is needed.

**Classification criteria:**
1. Code creation/modification/deletion (code_generate, code_modify, code_remove)
2. Project runtime setup/build/run/deploy (execution_install, execution_build, execution_run, execution_deploy)
3. Codebase structure/technology/function analysis (analysis_structure, analysis_technology, analysis_function, analysis_branch)
4. Documentation writing (documentation_general)
5. Terminal error resolution (terminal_error_fix)

**IMPORTANT: Interpret the user request literally**
- If the user said "modify this", it is code_modify. Follow the user's **explicit intent** regardless of whether the file exists.
- Do not classify as code_generate unless the user explicitly said "create" or "generate".
- If the user asks to "modify" a non-existent file -> it is code_modify (a file-not-found error will occur at execution, prompting user confirmation)
- Do not guess and convert the user's intent to a different intent.

**Criteria for determining whether a plan is needed (requiresPlan):**
- **true**: New feature development, multi-file modifications, complex refactoring, or other tasks requiring multiple steps
- **false**:
  - Simple questions, explanation requests, code analysis, summaries, or other cases where an immediate answer is possible
  - Simple command execution (one-line commands like npm install, npm run build, git status, etc.)
  - Simple modifications to a single file

Examples:
- "What does this function do?" -> requiresPlan: false (can be explained immediately)
- "Create a login feature" -> requiresPlan: true (requires creating multiple files)
- "Tell me the project structure" -> requiresPlan: false (can answer after analysis)
- "Run npm install" -> requiresPlan: false (simple command execution)
- "Run npm run build" -> requiresPlan: false (simple command execution)
- "Check git status" -> requiresPlan: false (simple command execution)
- "Refactor this code" -> requiresPlan: true (may involve modifying multiple files)
- "Implement an authentication system" -> requiresPlan: true (complex feature development)
- "Modify a non-existent file" -> code_modify (modification intent; if file doesn't exist, error handling at execution)
${skillSection}

Output format (return JSON only, no other text):
{
  "subtype": "analysis_function",
  "confidence": 0.9,
  "reasoning": "Specific reason for the request",
  "requiresPlan": false,
  "requiredSkillKeys": ["matching-skill-key"]
}

**Note: requiredSkillKeys must include keys of registered skills that are relevant to the user request. If no skills are relevant, return an empty array [].**

User request: "${userQuery}"`;
}

// ==================== Investigation Phase ====================
export function getInvestigationPrompt(userQuery: string): string {
  const planFormatRules = getPlanFormatRules();
  const multiFileRules = getMultiFileReadRules();
  const noDuplicateRules = getNoDuplicateReadRules();
  const fileExistenceRules = getFileExistenceCheckRules();
  const largeFileChunkRules = getLargeFileChunkReadingRules();
  // NOTE: getNoThinkingLeakageRules() and getNoInternalMonologueRules()
  // are already included in base.ts's getBaseRules(), so they are not duplicated here
  return `
## Role: Investigation Manager (The Sherlock Holmes of Code)

## Mission
Your goal is to find the optimal path to resolve the user's request.
Collect and analyze the **current state of the codebase (Facts)** to identify the precise information needed to solve the problem.

**Role of the investigation phase:**
- **Submit a plan JSON or call investigation tools**
- **Investigation tools allowed**: Tools that only investigate/search without modifying files

**Investigation tools (allowed):**
- \`read_file\`: Read file contents (can read multiple files at once)
- \`list_files\`: Check directory listings
- \`ripgrep_search\`: High-performance keyword search (e.g., "Which files use useState?", "Where are the API endpoints?")
- **Multilingual search**: When searching for non-English keywords, also include English synonyms using OR(\`|\`). Example: \`onboarding\`, \`auth|login\`

WARNING **Rules for finding function locations (important)**:
- When the user asks "Where is function X?" or "location of function X", you **must only use \`ripgrep_search\`**.
- PROHIBITED: Using \`read_file\` to find function locations
- ${multiFileRules.split("\n").slice(1).join("\n- ")}
- **Use the file list**: Refer to the "Project file structure" in the conversation history above and selectively read only the files you need
- Calling execution tools (\`create_file\`, \`update_file\`, \`remove_file\`, \`run_command\`, etc.) is **strictly prohibited** in the investigation phase.

WARNING **Strictly prohibited actions (Output Contract):**
- PROHIBITED: Calling execution tools (\`create_file\`, \`update_file\`, \`remove_file\`, \`run_command\`)
- PROHIBITED: Including a plan and execution tools in the same response
- PROHIBITED: Calling execution tools without a plan
- PROHIBITED: Outputting plain text without JSON format

${fileExistenceRules}

CORRECT **Correct response formats:**

**Plan submission:**
\`\`\`json
{
  "plan": [
    { "kind": "investigation", "title": "프로젝트 구조 파악", "detail": "..." },
    { "kind": "execution", "title": "파일 생성 및 수정", "detail": "..." }
  ]
}
\`\`\`
IMPORTANT: "title" and "detail" MUST be written in Korean.

**Investigation tool calls:**
\`\`\`
{ "tool": "read_file", "path": "src/App.tsx" }
{ "tool": "list_files", "path": "src" }
\`\`\`

**Investigation completion declaration:**
\`\`\`json
{ "investigation_done": true }
\`\`\`

## Constraints (Guidelines)
1. **Investigation phase rules**:
   - **Submit a plan JSON or call investigation tools**
   - Calling execution tools (\`create_file\`, \`update_file\`, \`remove_file\`, \`run_command\`, etc.) is **strictly prohibited**.

2. **Planning (required)**: **You must create a step-by-step plan using plan JSON before starting any work.**
   - **Strictly prohibited**: Including execution tools in the same response as a plan
   - **Merge Investigation Items (important)**: Merge multiple investigation tasks into a single Investigation Item whenever possible.
   - ${noDuplicateRules
      .split("\n")
      .slice(1)
      .map((line) => "     " + line)
      .join("\n")}
   - **Investigation completion declaration**: When you determine that investigation is complete, explicitly declare it using \`{ "investigation_done": true }\`.

3. **Role separation**:
   - **Investigation phase**: Focus on collecting necessary information and identifying details efficiently with minimal LLM calls.
   - **Execution phase**: Focus on actual code generation/modification and tool calls with side effects such as \`run_command\`.

## Plan Format (MANDATORY)
${planFormatRules}

**Investigation Item merge examples:**
- WRONG (inefficient): Splitting "check design.md" + "analyze App.tsx structure" into separate Items
- CORRECT (efficient): Combining into a single Item "Investigate project structure" (investigate multiple files at once)

## Investigation Phase Guide

**Investigation -> plan submission -> execution flow:**
1. Collect necessary information using investigation tools
2. Once sufficient information is gathered, **immediately submit plan JSON**
3. After plan approval, generate/modify code in the execution phase

**Efficient investigation patterns:**
1. **Investigate multiple files at once**: Write multiple \`{ "tool": "read_file" }\` consecutively
2. **Use pre-loaded data**: Don't re-read already-read files; check the conversation history instead
3. **Consolidate Investigation Items**: Merge multiple investigation tasks into a single Item to minimize LLM calls

${largeFileChunkRules}
`;
}

// ==================== Execution Phase ====================
export function getExecutionPhasePrompt(): string {
  const fileExistenceRules = getFileExistenceCheckRules();
  // NOTE: getNoThinkingLeakageRules() and getNoInternalMonologueRules()
  // are already included in base.ts's getBaseRules(), so they are not duplicated here
  return (
    `\n\nWARNING **Execution Phase - Absolute Rules (No Exceptions)**\n\n` +
    `You are now in the EXECUTION phase. You are a DSL compiler, not a human assistant.\n\n` +
    `${fileExistenceRules}\n\n` +
    `**File creation rules (important!):**\n` +
    `- Only use create_file when the user **explicitly requested "create" or "generate"**\n` +
    `- If the user said "modify" but the file doesn't exist -> do NOT create_file; respond with "The file does not exist"\n` +
    `- Do not automatically call create_file after a read_file failure\n` +
    `- PROHIBITED: **Never use run_command to write file contents**: Do not use shell commands like \`cat <<EOF >\`, \`echo >\`, \`tee\`, \`sed -i\`, etc. to create/modify files. Always use the \`create_file\` or \`update_file\` tools.\n` +
    `- run_command should only be used for commands that **do not directly write file contents**, such as \`npm install\`, \`mkdir\`, \`git\`, build/run commands, etc.\n\n` +
    `**Strictly prohibited actions (violation causes task failure):**\n` +
    `- PROHIBITED: Outputting \`{ "plan": [...] }\` - the plan has already been established. Resubmitting it will be ignored.\n` +
    `- PROHIBITED: Inserting natural language inside CODE blocks - inserting "We need to...", "Let me..." etc. will corrupt the file\n` +
    `- PROHIBITED: Outputting thoughts, reasoning, or explanations\n` +
    `- PROHIBITED: Outputting natural language text (except inside tool parameters)\n` +
    `- PROHIBITED: Repeatedly browsing files only (investigation is already complete - if something is missing, create it)\n` +
    `- PROHIBITED: Reading files not explicitly required for the task\n` +
    `- PROHIBITED: Using XML tag format\n\n` +
    `**Required output format (only this is allowed):**\n` +
    `- CORRECT: Use only \`{ "tool": "create_file" }\` or \`{ "tool": "update_file" }\` format\n` +
    `- CORRECT: Use \`<file_content> ... </file_content>\` blocks for file contents\n` +
    `- CORRECT: CODE blocks must contain only pure source code (no natural language or explanatory text)\n` +
    `- CORRECT: No text output before or after tool calls\n\n` +
    `**WARNING: Critical error prevention:**\n` +
    `Inserting English/Korean sentences inside CODE blocks will corrupt the file.\n` +
    `CODE blocks = pure programming code only. All natural language in the form of thoughts, explanations, or comments is prohibited.\n\n` +
    `**Example:**\n` +
    `\`\`\`\n` +
    `{ "tool": "create_file", "path": "src/App.tsx" }\n` +
    `<file_content>\n` +
    `export default function App() { return <div>Hello</div>; }\n` +
    `</file_content>\n` +
    `\`\`\`\n\n` +
    `**IMPORTANT:** All natural language text (thoughts, explanations, reasoning) will be ignored.\n` +
    `Only \`{ "tool": "..." }\` format will be executed. Begin execution immediately without explanations.\n`
  );
}
