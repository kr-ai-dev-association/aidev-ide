/**
 * Rules Prompt Components
 * Unified rules prompt component file
 */

import { getFileCreationContext } from "./base";
import { ClassificationResult } from "../../conversation/handlers/ErrorClassifier";

// ==================== Execution First Rule ====================
export function getExecutionFirstRulePrompt(): string {
  return (
    `\n\n**Execution-First Task Rules (Important)**\n\n` +
    `**The current task is an execution-first task.** The user request involves execution tasks such as file creation, code modification, or project initialization.\n\n` +
    `**Strictly Prohibited:**\n` +
    `- Including "kind": "investigation" items in the plan\n` +
    `- Adding investigation tasks to the plan\n` +
    `- Adding investigation items like "check requirements", "investigate file structure"\n\n` +
    `**Required:**\n` +
    `- Only include "kind": "execution" items in the plan\n` +
    `- The system will automatically handle any necessary investigation\n` +
    `- Only present execution plans ("kind": "execution")\n\n` +
    `**Example (correct plan - JSON format):**\n` +
    "```json\n" +
    `{\n` +
    `  "plan": [\n` +
    `    {\n` +
    `      "kind": "execution",\n` +
    `      "title": "Create initial project files",\n` +
    `      "detail": "Create configuration files and source files needed for the project."\n` +
    `    }\n` +
    `  ]\n` +
    `}\n` +
    "```\n\n" +
    `**Incorrect example (strictly prohibited):**\n` +
    "```json\n" +
    `{\n` +
    `  "plan": [\n` +
    `    {\n` +
    `      "kind": "investigation",  // Prohibited in execution-first!\n` +
    `      "title": "Check requirements"\n` +
    `    },\n` +
    `    {\n` +
    `      "kind": "execution",\n` +
    `      "title": "Create project"\n` +
    `    }\n` +
    `  ]\n` +
    `}\n` +
    "```\n\n"
  );
}

// ==================== Error Retry ====================

/**
 * Type for modified file context information
 */
export interface ModifiedFileContext {
  path: string;
  content: string;
}

/**
 * Error analysis and fix guidance prompt for automated test failures
 * v9.2.2: Includes modified file contents so the LLM can fix based on the latest state
 * @param errorMessage Error message
 * @param modifiedFilesContext Latest contents of files modified in this turn (optional)
 */
export function getErrorRetryPrompt(errorMessage: string, modifiedFilesContext?: ModifiedFileContext[]): string {
  let prompt = `\n[System] **Automated test failed.**\n\n**Error details:**\n\`\`\`\n${errorMessage}\n\`\`\`\n\n`;

  // Include latest contents of modified files (to prevent code duplication)
  if (modifiedFilesContext && modifiedFilesContext.length > 0) {
    prompt += `**Important: Below are the latest contents of files modified in this turn.**\n`;
    prompt += `**When writing SEARCH blocks, you MUST base them on the contents below.**\n\n`;

    for (const file of modifiedFilesContext) {
      const lines = file.content.split('\n');
      const preview = lines.slice(0, 150).join('\n'); // Max 150 lines
      const isTruncated = lines.length > 150;

      prompt += `**[${file.path}] Current contents:**\n\`\`\`\n${preview}${isTruncated ? '\n... (truncated)' : ''}\n\`\`\`\n\n`;
    }
  }

  prompt +=
    `**Important: Respond only in { "tool": "..." } format**\n\n` +
    `**Fix methods by error type:**\n` +
    `- TypeScript errors ("Cannot find module", "Property does not exist") -> Fix file with update_file\n` +
    `- Missing dependency ("Cannot find module 'xxx'") -> Run npm install with run_command\n` +
    `- Build errors ("Command failed") -> Fix configuration files\n\n` +
    `**Build/test tool installation strictly prohibited:**\n` +
    `- When build tools are missing such as "tsc not found", "gradle not found", etc.\n` +
    `- Never run tool installation commands like npm install -g typescript, brew install gradle, etc.\n` +
    `- Instead, only output a message suggesting the user install it\n` +
    `- Example: "TypeScript compiler (tsc) is not installed. Please install it with npm install -g typescript."\n\n` +
    `**Strictly Prohibited:**\n` +
    `- Natural language responses (explanations, analysis, "We need to..." etc.)\n` +
    `- XML tag format\n` +
    `- Automatic installation of build tools (tsc, gradle, mvn, cargo, go, etc.)\n\n` +
    `**Required output format:**\n` +
    "```\n" +
    `{ "tool": "update_file", "path": "..." }\n` +
    `<file_content>\n` +
    `<<<<<<< SEARCH\n` +
    `Existing code (based on the latest file contents provided above)\n` +
    `=======\n` +
    `Modified code\n` +
    `>>>>>>> REPLACE\n` +
    `</file_content>\n` +
    "```\n\n" +
    `**Output tool calls immediately. Natural language text will be ignored.**\n`;

  return prompt;
}

export function getSimpleErrorRetryPrompt(errorMessage: string): string {
  return (
    `\n[System] Automated test failed. Fix the following error:\n${errorMessage || "Unknown error"}\n\n${getFileCreationContext()}\n\n` +
    `**Dependency installation (allowed):** Project dependency installation such as npm install, pip install -r requirements.txt is allowed.\n\n` +
    `**Build/test tool installation prohibited:**\n` +
    `- When build tools are missing such as "tsc not found", "gradle not found", do not install them automatically\n` +
    `- Instead, suggest the user install them (e.g., "tsc is not found. Please install it with npm install -g typescript.")\n`
  );
}

export function getTestRetryExceededMessage(
  maxTestFixAttempts: number,
  errorMessage: string,
  giveUpReason?: 'exceeded' | 'non_retryable' | 'same_pattern' | 'disabled',
): string {
  const error = errorMessage || "Unknown error";
  if (giveUpReason === 'non_retryable') {
    return `Auto-fix not possible -- tool not installed or timeout. Final error:\n${error}`;
  }
  if (giveUpReason === 'same_pattern') {
    return `Auto-fix stopped due to repeated identical errors. Final error:\n${error}`;
  }
  return `Test fix attempt limit exceeded (${maxTestFixAttempts} attempts). Final error:\n${error}`;
}

// ==================== Nudge Prompts ====================

/**
 * Nudge to prompt tool calls during the Investigation phase
 */
export function getInvestigationNudgePrompt(): string {
  return (
    `\n[System] **Tool call required - natural language responses prohibited**\n\n` +
    `Your previous response was detected as natural language and was ignored.\n` +
    `**You must respond only in the format below.**\n\n` +
    `**Investigation tool call example:**\n` +
    "```\n" +
    `{ "tool": "read_file", "path": "src/App.tsx" }\n` +
    "```\n\n" +
    `**Plan submission example:**\n` +
    "```json\n" +
    `{\n` +
    `  "plan": [\n` +
    `    { "kind": "execution", "title": "Add button component", "detail": "Add button to src/App.tsx" }\n` +
    `  ]\n` +
    `}\n` +
    "```\n\n" +
    `**Strictly prohibited:** Explanations, thoughts, analysis text output\n` +
    `**Output tool calls immediately.**`
  );
}

/**
 * Nudge to prompt tool calls during the Execution phase
 */
export function getExecutionNudgePrompt(): string {
  return (
    `\n[System] **Tool call required - natural language responses prohibited**\n\n` +
    `Your previous response was detected as natural language and was ignored.\n` +
    `**You must respond only in the format below. Do not output any other text.**\n\n` +
    `**Correct format example:**\n` +
    "```\n" +
    `{ "tool": "read_file", "path": "src/App.tsx" }\n` +
    "```\n\n" +
    `**File creation example:**\n` +
    "```\n" +
    `{ "tool": "create_file", "path": "src/App.tsx" }\n` +
    `<file_content>\n` +
    `export default function App() { return <div>Hello</div>; }\n` +
    `</file_content>\n` +
    "```\n\n" +
    `**Strictly prohibited:**\n` +
    `- Explanations like "The button has been added"\n` +
    `- XML tag format\n` +
    `- Thoughts, analysis, planning text\n\n` +
    `**Output tool calls immediately. All other text will be ignored.**`
  );
}

/**
 * Force prompt when only a plan is resubmitted without tool calls during the EXECUTION phase
 * Prevents completion without file creation/modification
 */
export function getExecutionNoToolCallWarningPrompt(planItemTitle: string): string {
  return (
    `\n[System] **Execution tool call required - plan resubmission prohibited**\n\n` +
    `You are currently in the EXECUTION phase.\n` +
    `To complete the task "${planItemTitle}", you **must call a file tool**.\n\n` +
    `**Prohibited responses:**\n` +
    `- { "plan": [...] } -- The plan has already been established. Do not resubmit it.\n` +
    `- Natural language explanations, analysis text\n\n` +
    `**Required response format:**\n` +
    `File creation:\n` +
    "```\n" +
    `{ "tool": "create_file", "path": "file_path" }\n` +
    `<file_content>\n` +
    `File contents\n` +
    `</file_content>\n` +
    "```\n\n" +
    `File modification:\n` +
    "```\n" +
    `{ "tool": "update_file", "path": "file_path" }\n` +
    `<file_content>\n` +
    `<<<<<<< SEARCH\n` +
    `Existing code\n` +
    `=======\n` +
    `New code\n` +
    `>>>>>>> REPLACE\n` +
    `</file_content>\n` +
    "```\n\n" +
    `**Call create_file or update_file tool immediately.**`
  );
}

/**
 * Force prompt for fixing test failures
 * Forces the use of update_file tool when tests fail during the EXECUTION phase
 */
export function getTestFailureFixPrompt(errorMessage: string): string {
  return (
    `\n[System] **Test failed - immediate code fix required**\n\n` +
    `**Error details:**\n\`\`\`\n${errorMessage}\n\`\`\`\n\n` +
    `**Prohibited actions (retry will fail if violated):**\n` +
    `- Calling investigation tools such as read_file, list_files, ripgrep_search is prohibited\n` +
    `- Natural language explanations, analysis text output prohibited\n` +
    `- { "plan": [...] } resubmission prohibited\n\n` +
    `**Required action:**\n` +
    `Analyze the error and **immediately fix the code using the update_file tool**. (Do not use create_file -- risk of losing existing file contents)\n\n` +
    `**Example (fixing error with update_file):**\n` +
    "```\n" +
    `{ "tool": "update_file", "path": "file_with_error.tsx" }\n` +
    `<file_content>\n` +
    `<<<<<<< SEARCH\n` +
    `// Existing code with error\n` +
    `=======\n` +
    `// Fixed code\n` +
    `>>>>>>> REPLACE\n` +
    `</file_content>\n` +
    "```\n\n" +
    `**Fix the error with update_file tool immediately. Do not re-read files.**`
  );
}

/**
 * Warning message when only text is output during Investigation
 */
export function getInvestigationTextOnlyWarningPrompt(): string {
  return (
    `\n[System] Outputting only text explanations is prohibited during the Investigation phase.\n` +
    `Perform one of the following:\n` +
    `1. Call an investigation tool: Collect information using { "tool": "read_file", "path": "..." } format.\n` +
    `2. Submit a plan: If sufficient information has been collected, submit a task plan in { "plan": [...] } JSON format.\n\n` +
    `Do not output only text explanations. You must call a tool or submit a plan.`
  );
}

/**
 * Next turn instructions after tool execution during the Investigation phase
 * Clearly guides what to do next after receiving tool results
 */
export function getInvestigationToolResultFollowupPrompt(): string {
  return (
    `\n[System] Tool execution results received. Proceed with the next step:\n\n` +
    `**Choose one of the following required output formats:**\n` +
    `1. **Additional investigation needed**: { "tool": "read_file", "path": "..." } or { "tool": "ripgrep_search", "pattern": "..." }\n` +
    `2. **Investigation complete, create plan**: { "plan": [{ "kind": "execution", "title": "...", "detail": "..." }] }\n\n` +
    `**Strictly prohibited:** Natural language explanations, analysis text output\n` +
    `**You must respond only in one of the JSON formats above.**`
  );
}

// ==================== Output Contract Prompts ====================

/**
 * Message for Investigation phase Output Contract violation
 */
export function getInvestigationOutputContractViolationPrompt(): string {
  return (
    `\n[System] **Investigation Phase Output Contract Violation**\n\n` +
    `During the investigation phase, you cannot submit execution tools (create_file, update_file, run_command) and a plan simultaneously.\n\n` +
    `**Allowed output formats:**\n` +
    `1. Use investigation tools: { "tool": "read_file", ... } (investigation only, no file modifications)\n` +
    `2. Submit plan: { "plan": [...] } (without execution tools)\n` +
    `3. Investigation tools and plan can be used together\n\n` +
    `**Prohibited**: Submitting execution tools + plan simultaneously\n\n` +
    `Try again. Respond in { "tool": "..." } format.`
  );
}

/**
 * Message for Execution phase Output Contract violation
 */
export function getExecutionOutputContractViolationPrompt(): string {
  return (
    `\n[System] **EXECUTION Phase Output Contract Violation**\n\n` +
    `During the execution phase, you must use execution tools without a plan.\n` +
    `An approved plan already exists, so do not submit a new plan.\n` +
    `Call execution tools in { "tool": "..." } format.`
  );
}

// ==================== FSM Violation Prompts ====================

/**
 * FSM Violation: Investigation item reached the Execution phase
 */
export function getFsmViolationInvestigationInExecutionPrompt(
  itemTitle: string,
): string {
  return (
    `\n[System] **FSM violation detected**: Investigation item "${itemTitle}" has reached the Execution phase.\n` +
    `Investigation items should be processed during the INVESTIGATION phase. Skipping this item and proceeding to the next execution item.\n` +
    `Call execution tools in { "tool": "..." } format.`
  );
}

// ==================== File Operation Prompts ====================

/**
 * Warning that file tools are required for code modification tasks
 */
export function getCodeModifyRequiresFileToolPrompt(): string {
  return `\n[System] Code modification tasks (code_modify) require file creation/modification tools (create_file, update_file). Investigation (read_file) alone will not complete the task. Create or modify files according to the plan.\n`;
}

/**
 * Phase-specific tool usage restriction warning
 */
export function getPhaseToolRestrictionPrompt(
  phase: string,
  blockedTools: string[],
): string {
  return `\n[System] The tools ${blockedTools.join(", ")} cannot be used during the ${phase} phase.\n`;
}

/**
 * create_file content missing warning
 */
export function getCreateFileContentMissingPrompt(warningText: string): string {
  return `\n[System] The <file_content> block is required when using create_file. The following call was ignored:\n${warningText}\n\nCorrect format:\n{ "tool": "create_file", "path": "..." }\n<file_content>\nFile contents\n</file_content>\n`;
}

// ==================== Validation Prompts ====================

/**
 * Prompt for inferring validation commands
 */
export function getValidationCommandInferencePrompt(
  projectType: string,
  workspaceRoot: string,
  fileList: string,
): string {
  return `Infer the validation command for the following project.

Project type: ${projectType}
Project root: ${workspaceRoot}
Created/modified files: ${fileList || "None"}

You need to infer a validation command that cannot be determined by rule-based logic.
Based on the project type and file information, suggest an appropriate validation command (compile, build, lint, etc.).

You must respond only in the following JSON format:
{ "command": "Command to execute", "description": "Command description" }

Examples:
{ "command": "npm run build", "description": "TypeScript build" }
{ "command": "python -m py_compile main.py", "description": "Python syntax check" }`;
}

/**
 * Simple error message for test failures
 */
export function getSimpleTestFailurePrompt(errorMessage: string): string {
  return (
    `\n[System] **Automated test failed.**\n\n**Error details:**\n\`\`\`\n${errorMessage}\n\`\`\`\n\n` +
    `**{ "tool": "..." } format required - natural language responses prohibited**\n\n` +
    `Output tool calls to fix the error.\n` +
    `- File modification: { "tool": "update_file", "path": "..." } + <file_content> ... </file_content>\n` +
    `- File creation: { "tool": "create_file", "path": "..." } + <file_content> ... </file_content>\n` +
    `- Command execution: { "tool": "run_command", "command": "..." }\n\n` +
    `**Output tool calls immediately.**\n`
  );
}

// ==================== Execution Phase Context ====================

export interface ExecutionPhaseContextOptions {
  currentTaskTitle: string;
  currentTaskDetail?: string;
  projectInventoryContext: string;
  preloadedFilesContext: string;
  ragContext?: string; // RAG context re-injection
}

/**
 * Context prompt to pass to the LLM during the EXECUTION phase
 */
export function getExecutionPhaseContextPrompt(
  options: ExecutionPhaseContextOptions,
): string {
  const {
    currentTaskTitle,
    currentTaskDetail,
    projectInventoryContext,
    preloadedFilesContext,
    ragContext,
  } = options;

  // Re-inject RAG context during execution phase if available (positioned closer than file read results)
  const ragSection = ragContext
    ? `\n\n## Reference Documents (RAG) -- Must be prioritized\n` +
      `Below are contents retrieved from internal organization documents. Prioritize the contents below when creating/modifying files.\n\n` +
      `${ragContext}\n`
    : '';

  return (
    `\n\n[EXECUTION PHASE - ABSOLUTE RULES (NO EXCEPTIONS)]\n` +
    `CURRENT TASK: ${currentTaskTitle}` +
    (currentTaskDetail ? `\nDETAIL: ${currentTaskDetail}` : "") +
    projectInventoryContext +
    preloadedFilesContext +
    ragSection +
    `\n\n** ABSOLUTELY FORBIDDEN (system will automatically ignore):**\n` +
    `- NO thinking, reasoning, explanation, or meta-analysis\n` +
    `- NO "We need to...", "According to...", "Let's call...", "I should..."\n` +
    `- NO natural language text (except inside <file_content> blocks)\n` +
    `- NO project exploration (investigation is already complete)\n` +
    `- NO re-reading files already provided above\n` +
    `- NO plan creation (planning phase is over)\n` +
    `- NO XML tag format\n\n` +
    `**REQUIRED OUTPUT FORMAT:**\n` +
    `- ONLY { "tool": "..." } format\n` +
    `- File content in <file_content> ... </file_content> blocks\n` +
    `- NO text before or after tool calls\n\n` +
    `**Example:**\n` +
    `{ "tool": "create_file", "path": "src/App.tsx" }\n` +
    `<file_content>\n` +
    `export default function App() { return <div>Hello</div>; }\n` +
    `</file_content>\n\n` +
    `**CRITICAL:** You are a DSL compiler, NOT a human assistant.\n` +
    `Any natural language text will be IGNORED by the system.\n\n` +
    `**File reading strategy (managed automatically by the system):**\n` +
    `- Refer to the file contents already provided above (do not re-read them)\n` +
    `- Only read files that need to be newly created/modified if necessary\n` +
    `- **Multiple tool calls required**: Process all necessary files at once\n\n` +
    `Provide all tool calls needed to execute this plan item at once immediately.`
  );
}
// ====================  Compact Rule ====================
/**
 * Simplified summarization prompt for compaction
 */
export function getCompactSummarizationPrompt(): string {
  return `You are a conversation summarization expert. Create a structured summary that preserves all critical context for continuing the conversation.

## Required Sections (include ALL 9 sections):

### 1. Primary Request and Intent
- The user's original request and overall goal
- Category: code generation / modification / analysis / documentation / execution

### 2. Key Technical Concepts
- Technologies, frameworks, libraries mentioned or used
- Architecture decisions made (e.g., "using Repository pattern", "FastAPI + React")
- Important constraints or requirements discussed

### 3. Files and Code Sections
- List ALL files that were read, created, or modified with their paths
- For modified files: note what was changed (e.g., "src/App.tsx: added Router import and routes")
- For created files: note purpose (e.g., "backend/app/main.py: FastAPI entry point with CORS")
- Include specific line numbers or function names when referenced

### 4. Errors and Fixes
- Any errors encountered and how they were resolved
- Tool failures (e.g., "update_file SEARCH failed for X → re-read and retried")
- Build/test errors and their fixes

### 5. Problem Solving Approach
- Key decisions made during implementation
- Alternative approaches considered and rejected
- Non-obvious solutions applied

### 6. User Messages (ALL)
- Reproduce every user message verbatim (or near-verbatim if very long)
- This is critical for maintaining conversation context

### 7. Pending Tasks
- Tasks explicitly requested but not yet completed
- Tasks implied but not started

### 8. Current Work State
- What was being worked on when the summary was created
- Current phase: investigation / implementation / testing / review
- Any in-progress tool executions or pending results

### 9. Suggested Next Step
- The most logical next action based on current state
- Any blockers that need resolution

## Guidelines:
1. Be thorough — this summary replaces the full conversation history
2. File paths must be exact (the AI will use them for read_file/update_file)
3. Do NOT include source code content (only file names and what changed)
4. Write in English (technical accuracy over brevity)
5. If a file was modified multiple times, record the final state description
6. Preserve error messages verbatim when they are important for debugging`;
}

// ==================== Classified Error Retry Prompt ====================

/**
 * Retry prompt based on structural error classification
 * Passes classified error groups + root cause analysis to the LLM without keyword matching
 *
 * @param classification Classification result from ErrorClassifier
 * @param modifiedFilesContext Latest contents of modified files
 * @param escalation Whether the same pattern has repeated 3+ times
 * @param samePatternCount Number of times the same pattern has repeated
 */
export function buildClassifiedRetryPrompt(
    classification: ClassificationResult,
    modifiedFilesContext: ModifiedFileContext[],
    escalation: boolean,
    samePatternCount: number,
    detectedSubProjectRoot?: string,
): string {
    let prompt = `\n[System] **Automated test failed.**\n\n`;

    // Section 1: Error classification results (structural analysis)
    prompt += `**Error classification results:**\n`;
    prompt += `- Total error count: ${classification.totalErrorCount}\n`;
    prompt += `- Dominant cause type: ${classification.dominantCategory}\n`;

    if (classification.environmentCheck.needsInstall) {
        prompt += `- Environment issue: dependency directory missing (automatic installation attempted)\n`;
    }

    prompt += `\n**Error groups:**\n`;
    for (const group of classification.groups.slice(0, 5)) {
        prompt += `\n### [${group.source}] Code ${group.representativeCode} (${group.count} occurrences, ${group.affectedFiles.length} files)\n`;
        prompt += `- Affected files: ${group.affectedFiles.slice(0, 5).join(', ')}${group.affectedFiles.length > 5 ? ` and ${group.affectedFiles.length - 5} more` : ''}\n`;
        if (group.rootCauseHypothesis) {
            prompt += `- Analysis: ${group.rootCauseHypothesis}\n`;
        }
        prompt += `- Samples:\n`;
        for (const msg of group.sampleMessages) {
            prompt += `  - ${msg}\n`;
        }
    }

    // Section 2: Escalation warning (same pattern repeated)
    if (escalation) {
        prompt += `\n**Warning: The same error pattern has repeated ${samePatternCount} times.**\n`;
        prompt += `Try a **different approach** from before:\n`;
        prompt += `- Do not repeat the same fix\n`;
        prompt += `- Re-analyze the root cause of the error\n`;
        prompt += `- If it is a dependency issue, try installing packages with run_command\n`;
        prompt += `- If type/module errors persist, check import paths or configuration files\n`;
    }

    // Section 3: Latest contents of modified files (always included)
    if (modifiedFilesContext && modifiedFilesContext.length > 0) {
        prompt += `\n**Important: Below are the latest contents of modified files.**\n`;
        prompt += `**When writing SEARCH blocks, you MUST base them on the contents below.**\n\n`;

        for (const file of modifiedFilesContext) {
            const lines = file.content.split('\n');
            const preview = lines.slice(0, 150).join('\n');
            const isTruncated = lines.length > 150;
            prompt += `**[${file.path}] Current contents:**\n\`\`\`\n${preview}${isTruncated ? '\n... (truncated)' : ''}\n\`\`\`\n\n`;
        }
    }

    // Section 4: Sub-project scope restriction
    if (detectedSubProjectRoot) {
        const subDir = detectedSubProjectRoot.split('/').pop() || detectedSubProjectRoot;
        prompt += `\n**Sub-project scope restriction: \`${subDir}/\`**\n`;
        prompt += `- The root of this project is \`${subDir}/\`. All file modifications must be performed only under \`${subDir}/\`.\n`;
        prompt += `- Prohibited: Creating/modifying files in parent directories (project root) (e.g., \`./package.json\`, \`./src/**\`, \`./eslint.config.*\`)\n`;
        prompt += `- Allowed: Only files under \`${subDir}/\` (e.g., \`${subDir}/package.json\`, \`${subDir}/src/**\`, \`${subDir}/tsconfig.json\`)\n`;
        prompt += `- Unless the user explicitly requests it, never touch files outside the sub-project.\n\n`;
    }

    // Section 5: Tool call format instructions
    prompt +=
        `**Important: Respond only in { "tool": "..." } format**\n\n` +
        `**Available tools:**\n` +
        `- File modification: { "tool": "update_file", "path": "..." }\n` +
        `- Command execution: { "tool": "run_command", "command": "..." }\n` +
        `- create_file prohibited: Recreating existing files will result in content loss. Use only update_file.\n\n` +
        `**Build/test tool installation strictly prohibited:**\n` +
        `- When build tools are missing such as "tsc not found", "gradle not found", etc.\n` +
        `- Never run tool installation commands like npm install -g typescript, brew install gradle, etc.\n` +
        `- Instead, only output a message suggesting the user install it\n\n` +
        `**File copy/move/structure changes strictly prohibited:**\n` +
        `- Do not use file copy/move commands such as cp, cp -r, mv, rsync\n` +
        `- Do not change the project structure. Only modify code contents.\n` +
        `- If existing files (package.json, eslint config, etc.) exist, only modify/supplement them; do not replace/delete them.\n\n` +
        `**Strictly prohibited:**\n` +
        `- Natural language responses (explanations, analysis, "We need to..." etc.)\n` +
        `- XML tag format\n\n` +
        `**Output tool calls immediately. Natural language text will be ignored.**\n`;

    return prompt;
}
