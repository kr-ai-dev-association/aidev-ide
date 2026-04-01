/**
 * Tool Calling Prompts
 * Prompts related to JSON Function Calling
 */

import { ToolSpec, Tool } from '../../../../tools/types';

/**
 * Tool calling format prompt
 */
export function getToolCallingFormatPrompt(): string {
    let prompt = '## Tool Calling Rules (Required)\n\n';

    prompt += '### Tool Calling Format\n';
    prompt += '**You must** use only the following format. Other formats will be ignored.\n\n';

    prompt += '**File Creation (create_file):**\n';
    prompt += '```\n';
    prompt += '{ "tool": "create_file", "path": "src/example.py" }\n';
    prompt += '<file_content>\n';
    prompt += 'def example():\n';
    prompt += '    print("hello")\n';
    prompt += '</file_content>\n';
    prompt += '```\n\n';

    prompt += '**File Modification (update_file):**\n';
    prompt += '```\n';
    prompt += '{ "tool": "update_file", "path": "src/App.tsx" }\n';
    prompt += '<file_content>\n';
    prompt += '<<<<<<< SEARCH\n';
    prompt += 'existing code\n';
    prompt += '=======\n';
    prompt += 'new code\n';
    prompt += '>>>>>>> REPLACE\n';
    prompt += '</file_content>\n';
    prompt += '```\n\n';

    prompt += '**Tools without code (read_file, list_files, run_command, etc.):**\n';
    prompt += '```\n';
    prompt += '{ "tool": "read_file", "path": "src/file.ts" }\n';
    prompt += '{ "tool": "list_files", "path": "src", "recursive": "true" }\n';
    prompt += '{ "tool": "run_command", "command": "npm install" }\n';
    prompt += '```\n\n';

    prompt += '### Calling Multiple Tools Simultaneously\n';
    prompt += '```\n';
    prompt += '{ "tool": "read_file", "path": "src/a.ts" }\n';
    prompt += '{ "tool": "read_file", "path": "src/b.ts" }\n';
    prompt += '```\n\n';

    prompt += '**Prohibited Formats (Do not use):**\n';
    prompt += '- Tool calls inside ` ```json ``` ` blocks\n';
    prompt += '- XML tag format\n';
    prompt += '- Any variation other than the formats above\n\n';

    return prompt;
}

/**
 * Tool spec prompt generation
 */
export function getToolSpecPrompt(spec: ToolSpec): string {
    let prompt = `#### ${spec.name}\n`;
    prompt += `${spec.description}\n\n`;

    // Special warning for update_file
    if (spec.name === Tool.UPDATE_FILE) {
        prompt += '**CRITICAL WARNING**\n';
        prompt += 'Before using `update_file`, you **must** first read the latest file contents with `read_file`!\n';
        prompt += '- The file may have already been modified\n';
        prompt += '- Creating a SEARCH pattern based on previously read content or guesses will fail\n';
        prompt += '- **Always use in this order: `read_file` then `update_file`**\n\n';

        prompt += '**SEARCH Block Integrity Rules (Required)**\n';
        prompt += 'The SEARCH block must:\n';
        prompt += '- **Copy the current file contents exactly as-is** (copy from the read_file result)\n';
        prompt += '- **Never introduce typos, duplicates, or omissions in the pre-modification code**\n';
        prompt += '- **Do not rewrite or alter the existing code structure**\n';
        prompt += '- If the SEARCH block does not exactly match the current file contents, the modification will fail\n\n';

        prompt += '**Common Mistakes (Absolutely prohibited):**\n';
        prompt += '- `export default App;}` (duplicate braces)\n';
        prompt += '- Missing or extra code blocks\n';
        prompt += '- Arbitrary changes to indentation/whitespace\n';
        prompt += '- Arbitrarily adding/removing semicolons or commas\n';
        prompt += '- Writing code from memory (always verify with read_file results)\n\n';
    }

    prompt += '**Parameters:**\n';
    for (const param of spec.parameters) {
        prompt += `- \`${param.name}\`${param.required ? ' (required)' : ' (optional)'}: ${param.description}\n`;
    }
    prompt += '\n';

    // Examples - displayed in backtick code block format
    prompt += '**Usage Examples:**\n';

    // create_file and update_file use CODE block format
    if (spec.name === Tool.CREATE_FILE) {
        prompt += '```\n';
        prompt += '{ "tool": "create_file", "path": "src/example.ts" }\n';
        prompt += '<file_content>\n';
        prompt += '// file contents\n';
        prompt += 'export function example() {\n';
        prompt += '    return "hello";\n';
        prompt += '}\n';
        prompt += '</file_content>\n';
        prompt += '```\n\n';
    } else if (spec.name === Tool.UPDATE_FILE) {
        prompt += '```\n';
        prompt += '{ "tool": "update_file", "path": "src/App.tsx" }\n';
        prompt += '<file_content>\n';
        prompt += '<<<<<<< SEARCH\n';
        prompt += 'existing code\n';
        prompt += '=======\n';
        prompt += 'new code\n';
        prompt += '>>>>>>> REPLACE\n';
        prompt += '</file_content>\n';
        prompt += '```\n\n';
    } else {
        // Other tools use simple JSON format
        prompt += '```\n';
        prompt += `{ "tool": "${spec.name}"`;
        for (const param of spec.parameters) {
            if (param.required) {
                let exampleValue = '...';
                if (param.name === 'path') exampleValue = 'src/example.ts';
                else if (param.name === 'command') exampleValue = 'npm install';
                else if (param.name === 'pattern') exampleValue = 'TODO';
                prompt += `, "${param.name}": "${exampleValue}"`;
            }
        }
        prompt += ' }\n';
        prompt += '```\n\n';
    }

    return prompt;
}

/**
 * Workflow guidelines prompt
 */
export function getWorkflowGuidelinePrompt(): string {
    let prompt = '### Workflow Guidelines\n\n';

    // File reading strategy (critical!)
    prompt += '**File Reading Strategy (Required!):**\n';
    prompt += 'Before reading a file, you **must** first check the file size with `stat_file`.\n';
    prompt += 'Reading an entire large file wastes context.\n\n';

    prompt += '| Line Count | Recommended Method |\n';
    prompt += '|---------|----------|\n';
    prompt += '| ~200 lines | `read_file` full read |\n';
    prompt += '| 200~500 lines | `list_imports` + `read_file` partial read |\n';
    prompt += '| 500+ lines | `stat_file` then `list_imports` then read only the needed range |\n\n';

    prompt += '**File Reading Workflow (Recommended):**\n';
    prompt += '```\n';
    prompt += '// Step 1: Check file info\n';
    prompt += '{ "tool": "stat_file", "path": "src/chat.js" }\n';
    prompt += '// Step 2: If large file, understand the structure\n';
    prompt += '{ "tool": "list_imports", "path": "src/chat.js" }\n';
    prompt += '// Step 3: Read only the needed section\n';
    prompt += '{ "tool": "read_file", "path": "src/chat.js", "startLine": "200", "endLine": "350" }\n';
    prompt += '```\n\n';

    prompt += '**Use multilingual keywords when searching:**\n';
    prompt += '- When searching with Korean keywords, also search for English synonyms\n';
    prompt += '- The codebase may contain a mix of Korean comments/variable names and English function/class names\n';
    prompt += '- Example: when searching for "onboarding" -> `onboarding|온보딩`, for "auth" -> `auth|인증|login`\n';
    prompt += '- ripgrep supports `|` (OR) so you can find both in a single search\n\n';

    prompt += '**Verify context after searching:**\n';
    prompt += '```\n';
    prompt += '{ "tool": "ripgrep_search", "pattern": "handleSubmit" }\n';
    prompt += '// Result: found at src/chat.js:245\n';
    prompt += '{ "tool": "read_file", "path": "src/chat.js", "startLine": "230", "endLine": "260" }\n';
    prompt += '```\n\n';

    prompt += '**File Modification Workflow:**\n';
    prompt += '```\n';
    prompt += '// Step 1: Read the file first (required!)\n';
    prompt += '{ "tool": "read_file", "path": "src/App.tsx" }\n';
    prompt += '// Step 2: Modify based on what was read\n';
    prompt += '{ "tool": "update_file", "path": "src/App.tsx" }\n';
    prompt += '<file_content>\n';
    prompt += '<<<<<<< SEARCH\n';
    prompt += 'existing code\n';
    prompt += '=======\n';
    prompt += 'new code\n';
    prompt += '>>>>>>> REPLACE\n';
    prompt += '</file_content>\n';
    prompt += '```\n\n';

    return prompt;
}

/**
 * Workflow guidelines for native mode (no code block examples)
 */
export function getNativeWorkflowGuidelinePrompt(): string {
    let prompt = '### Workflow Guidelines\n\n';

    prompt += '**File Reading Strategy (Required!):**\n';
    prompt += 'Before reading a file, you **must** first check the file size with `stat_file`.\n';
    prompt += 'Reading an entire large file wastes context.\n\n';

    prompt += '| Line Count | Recommended Method |\n';
    prompt += '|---------|----------|\n';
    prompt += '| ~200 lines | `read_file` full read |\n';
    prompt += '| 200~500 lines | `list_imports` + `read_file` partial read |\n';
    prompt += '| 500+ lines | `stat_file` then `list_imports` then read only the needed range |\n\n';

    prompt += '**File reading order:** stat_file (step 1) then list_imports (step 2, for large files) then read_file (step 3, needed range)\n\n';

    prompt += '**Use multilingual keywords when searching:**\n';
    prompt += '- When searching with Korean keywords, also search for English synonyms\n';
    prompt += '- Example: "onboarding" -> `onboarding|온보딩`, "auth" -> `auth|인증|login`\n';
    prompt += '- After ripgrep_search, use read_file with startLine/endLine to check surrounding context\n\n';

    prompt += '**File modification order (required):** Always follow the read_file then update_file order.\n';
    prompt += '- update_file `diff` parameter: Use the current contents exactly as read from read_file for the SEARCH block\n';
    prompt += '- If the SEARCH block does not exactly match the current file contents, the modification will fail\n\n';

    prompt += '**File deletion rules:**\n';
    prompt += '- Do not delete existing files to resolve errors\n';
    prompt += '- Only use remove_file when the user explicitly requests it\n\n';

    prompt += '**Self-verification before __done__ (required):**\n';
    prompt += 'Before calling __done__, re-check the original request:\n';
    prompt += '- If the user asked "which line number" but you only used stat_file -> use ripgrep_search to find the actual line number before completing\n';
    prompt += '- If the user requested "function list with line numbers" but you only returned symbol names -> use ripgrep_search to verify each function\'s line number\n';
    prompt += '- Only call __done__ after confirming that the tool results actually fulfill the request\n\n';

    return prompt;
}

/**
 * Important rules prompt
 */
export function getImportantRulesPrompt(): string {
    let prompt = '### Important Rules\n\n';

    // No text before or after tool calls (most important!)
    prompt += '**Absolutely no text before or after tool calls:**\n';
    prompt += '- Do not output explanations, thoughts, plans, or analysis before a tool call\n';
    prompt += '- Do not output additional explanations after a tool call either\n';
    prompt += '- **Only output `{ "tool": ... }` JSON**\n';
    prompt += '- Text output will cause UI errors\n\n';

    prompt += '**Incorrect example (absolutely prohibited):**\n';
    prompt += '```\n';
    prompt += 'Let me read the file first.\n';
    prompt += '{ "tool": "read_file", "path": "src/app.ts" }\n';
    prompt += '```\n\n';

    prompt += '**Correct example:**\n';
    prompt += '```\n';
    prompt += '{ "tool": "read_file", "path": "src/app.ts" }\n';
    prompt += '```\n\n';

    prompt += '**Output format (strictly enforced):**\n';
    prompt += '- **Only use `{ "tool": "..." }` format**\n';
    prompt += '- XML tag format is **prohibited**\n';
    prompt += '- Explanations, thoughts, analysis, and planning text will be ignored by the system\n';
    prompt += '- All text other than tool calls will be treated as invalid\n\n';
    prompt += '**File operation rules:**\n';
    prompt += '1. **read_file required before update_file**: Always read the latest contents before modifying a file.\n';
    prompt += '2. **create_file requires <file_content>**: Empty code blocks are not allowed.\n';
    prompt += '3. **Use create_file for large-scale modifications**: Rewrite the entire file.\n';
    prompt += '4. **No batch modifications**: Use read_file then update_file instead of sed -i.\n\n';
    prompt += '**File deletion rules (absolutely prohibited):**\n';
    prompt += '- **Do not delete files when tests/builds/validations fail**: Do not delete existing files to resolve errors.\n';
    prompt += '- **Only use remove_file when the user explicitly requests it**\n';
    prompt += '- **How to resolve errors**: Modify the code or change configuration instead of deleting files.\n\n';
    prompt += '**Correct response:**\n';
    prompt += '```\n';
    prompt += '{ "tool": "read_file", "path": "src/App.tsx" }\n';
    prompt += '```\n\n';

    prompt += '**Self-verification before __done__ (required):**\n';
    prompt += 'Before calling __done__, re-check the original request:\n';
    prompt += '- If the user asked "which line number" but you only used stat_file -> use ripgrep_search to find the actual line number before completing\n';
    prompt += '- If the user requested "function list with line numbers" but you only returned symbol names -> use ripgrep_search to verify each function\'s line number\n';
    prompt += '- Only call __done__ after confirming that the tool results actually fulfill the request\n';

    return prompt;
}

/**
 * Tool calling format prompt for Native API Function Call mode
 */
export function getNativeToolCallingFormatPrompt(): string {
    let prompt = '## Tool Calling Rules (Required)\n\n';
    prompt += '### Tool Calling Format\n';
    prompt += '**Use API Function Calls** -- do not output JSON or code blocks in text responses.\n\n';
    prompt += 'Perform all tool calls only through the API-provided function call mechanism.\n\n';
    prompt += '**Absolutely prohibited (will cause parsing failure):**\n';
    prompt += '- Directly outputting `{ "tool": "create_file", ... }` JSON in text\n';
    prompt += '- `<file_content>...</file_content>` code block format\n';
    prompt += '- Tool JSON inside markdown code blocks\n\n';
    prompt += '**Correct method:**\n';
    prompt += '- Only call tools through API function calls (handled automatically by the system)\n';
    prompt += '- `create_file`: Pass the entire file contents directly in the `content` parameter\n';
    prompt += '- `update_file`: Pass the SEARCH/REPLACE block in the `diff` parameter\n\n';
    return prompt;
}

/**
 * Tool spec prompt for native mode (no code block examples)
 */
export function getNativeToolSpecPrompt(spec: ToolSpec): string {
    let prompt = `#### ${spec.name}\n`;
    prompt += `${spec.description}\n\n`;

    if (spec.name === Tool.UPDATE_FILE) {
        prompt += '**CRITICAL WARNING**\n';
        prompt += 'Before using `update_file`, you **must** first read the latest file contents with `read_file`!\n';
        prompt += '- The file may have already been modified\n';
        prompt += '- Creating a SEARCH pattern based on previously read content or guesses will fail\n';
        prompt += '- **Always use in this order: `read_file` then `update_file`**\n\n';

        prompt += '**SEARCH Block Integrity Rules (Required)**\n';
        prompt += 'The SEARCH block must:\n';
        prompt += '- **Copy the current file contents exactly as-is** (copy from the read_file result)\n';
        prompt += '- **Never introduce typos, duplicates, or omissions in the pre-modification code**\n';
        prompt += '- If the SEARCH block does not exactly match the current file contents, the modification will fail\n\n';
    }

    prompt += '**Parameters:**\n';
    for (const param of spec.parameters) {
        prompt += `- \`${param.name}\`${param.required ? ' (required)' : ' (optional)'}: ${param.description}\n`;
    }
    prompt += '\n';

    return prompt;
}

/**
 * Build the complete tool prompt section
 * @param nativeMode If true, use API Function Call format (no code blocks)
 */
export function buildToolPromptSection(specs: ToolSpec[], nativeMode?: boolean): string {
    if (nativeMode) {
        let prompt = getNativeToolCallingFormatPrompt();
        prompt += '### Available Tools\n\n';
        for (const spec of specs) {
            prompt += getNativeToolSpecPrompt(spec);
        }
        prompt += getNativeWorkflowGuidelinePrompt();
        return prompt;
    }

    let prompt = getToolCallingFormatPrompt();
    prompt += '### Available Tools\n\n';

    for (const spec of specs) {
        prompt += getToolSpecPrompt(spec);
    }

    prompt += getWorkflowGuidelinePrompt();
    prompt += getImportantRulesPrompt();

    return prompt;
}
