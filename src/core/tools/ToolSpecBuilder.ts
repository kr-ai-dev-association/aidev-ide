/**
 * Tool Spec Builder
 * Builder that generates tool specs to be included in prompts
 *
 * v8.9.0: Added JSON Function Calling support
 * - buildFunctionDeclarations(): Gemini/OpenAI compatible function declarations
 * - buildToolPromptSectionJson(): JSON-based tool calling prompt
 */

import { ToolSpec, Tool, ToolName } from './types';
import { buildToolPromptSection } from '../managers/context/prompts/tools';
import { ToolRegistry } from './ToolRegistry';
import { MCPToolHandler } from './mcp/MCPToolHandler';

/**
 * JSON Schema format Function Declaration (Gemini/OpenAI compatible)
 */
export interface FunctionDeclaration {
    name: string;
    description: string;
    parameters: {
        type: 'object';
        properties: Record<string, {
            type: string;
            description: string;
            enum?: string[];
        }>;
        required: string[];
    };
}

/**
 * Native Function Call response format
 */
export interface FunctionCall {
    name: string;
    args: Record<string, any>;
}

export class ToolSpecBuilder {
    /**
     * Build all tool specs (included in prompt)
     */
    static buildToolSpecs(allowedTools?: Tool[]): ToolSpec[] {
        const specs: ToolSpec[] = [];

        // create_file
        if (!allowedTools || allowedTools.includes(Tool.CREATE_FILE)) {
            specs.push({
                name: Tool.CREATE_FILE,
                description: 'Creates a new file or overwrites an existing file. Required directories are created automatically.',
                parameters: [
                    { name: 'path', required: true, description: 'File path to write (relative path from project root)', type: 'string' },
                    { name: 'content', required: true, description: 'Full content to write to the file', type: 'string' }
                ]
            });
        }

        // update_file
        if (!allowedTools || allowedTools.includes(Tool.UPDATE_FILE)) {
            specs.push({
                name: Tool.UPDATE_FILE,
                description: 'Modifies only specific parts of an existing file. Does not overwrite the entire file. **CRITICAL: You must read the latest file content with read_file before using update_file.**',
                parameters: [
                    { name: 'path', required: true, description: 'File path to modify', type: 'string' },
                    { name: 'diff', required: true, description: 'SEARCH/REPLACE block format:\n<<<<<<< SEARCH\n[exact current file content]\n=======\n[new content]\n>>>>>>> REPLACE\n\n**Important:** The content in the SEARCH block must exactly match the latest file content read via read_file. Whitespace, indentation, and line breaks must match exactly.', type: 'string' }
                ]
            });
        }

        // remove_file
        if (!allowedTools || allowedTools.includes(Tool.REMOVE_FILE)) {
            specs.push({
                name: Tool.REMOVE_FILE,
                description: 'Deletes a file from the project.',
                parameters: [
                    { name: 'path', required: true, description: 'File path to delete', type: 'string' }
                ]
            });
        }

        // read_file
        if (!allowedTools || allowedTools.includes(Tool.READ_FILE)) {
            specs.push({
                name: Tool.READ_FILE,
                description: 'Reads the content of a file at the specified path. To read multiple files at once, provide a comma-separated list of paths in the <paths> tag, or use multiple <path> tags. For large files, you can use startLine and endLine to read only a specific range.',
                parameters: [
                    { name: 'path', required: false, description: 'File path to read (for a single file)', type: 'string' },
                    { name: 'paths', required: false, description: 'List of file paths to read (comma-separated string or multiple <path> tags)', type: 'string' },
                    { name: 'startLine', required: false, description: 'Line number to start reading from (1-based, reads from beginning if omitted)', type: 'number' },
                    { name: 'endLine', required: false, description: 'Line number to stop reading at (inclusive, reads to end if omitted)', type: 'number' }
                ]
            });
        }

        // list_files
        if (!allowedTools || allowedTools.includes(Tool.LIST_FILES)) {
            specs.push({
                name: Tool.LIST_FILES,
                description: '**For exploring directory structure only.** Use when checking "what is inside src" or "what does the folder structure look like". Do not use for file searching: use glob_search to find files by name/path, use ripgrep_search to search file contents.',
                parameters: [
                    { name: 'path', required: false, description: 'Directory path (default: project root)', type: 'string' },
                    { name: 'recursive', required: false, description: 'Whether to list recursively (true/false)', type: 'string' }
                ]
            });
        }

        // ripgrep_search
        if (!allowedTools || allowedTools.includes(Tool.RIPGREP_SEARCH)) {
            specs.push({
                name: Tool.RIPGREP_SEARCH,
                description: 'Searches for keywords or patterns within file contents. Results include file paths and **exact line numbers**. Extremely fast even in large projects. **Use for any search requiring line numbers** ("which line", "list of def functions", "where is it implemented", etc.). stat_file only returns symbol names without line numbers, so you must use ripgrep_search when line numbers are needed. **Recommended workflow**: 1) Search patterns with ripgrep_search, 2) Verify file contents with read_file, 3) Modify with update_file using SEARCH/REPLACE blocks. Never use shell commands like find + sed -i.',
                parameters: [
                    { name: 'pattern', required: true, description: 'Regex or keyword to search for', type: 'string' },
                    { name: 'path', required: false, description: 'Directory to search in (default: project root)', type: 'string' },
                    { name: 'include', required: false, description: 'File patterns to include (comma-separated)', type: 'string' },
                    { name: 'exclude', required: false, description: 'File patterns to exclude (comma-separated)', type: 'string' },
                    { name: 'caseSensitive', required: false, description: 'Whether to match case-sensitively (true/false)', type: 'string' },
                    { name: 'contextLines', required: false, description: 'Number of surrounding context lines (default: 2)', type: 'string' },
                    { name: 'outputMode', required: false, description: 'Output mode: content (matching lines + context, default), files_with_matches (file paths only), count (match count only)', type: 'string' },
                    { name: 'multiline', required: false, description: 'Multi-line pattern matching (true/false, default: false)', type: 'string' },
                    { name: 'headLimit', required: false, description: 'Return only the top N file results', type: 'string' }
                ]
            });
        }

        // run_command
        if (!allowedTools || allowedTools.includes(Tool.RUN_COMMAND)) {
            specs.push({
                name: Tool.RUN_COMMAND,
                description: 'Executes a terminal command in the project directory. **Important: Never use bulk file modification commands (find + sed, etc.). Use the ripgrep_search -> read_file -> update_file workflow instead.**',
                parameters: [
                    { name: 'command', required: true, description: 'Command to execute. **Strictly prohibited: find + sed -i, perl -i, xargs sed, and other bulk file modification commands**', type: 'string' },
                    { name: 'timeout', required: false, description: 'Command timeout (seconds)', type: 'string' },
                    { name: 'is_background', required: false, description: 'Set to "true" for long-running processes (dev servers, watchers, etc.) that should run in the background. The command starts immediately and returns without waiting for completion. Use for: npm run dev, uvicorn, docker compose up, nodemon, etc.', type: 'string' }
                ]
            });
        }


        // list_imports - Extract import/export statements from a file
        if (!allowedTools || allowedTools.includes(Tool.LIST_IMPORTS)) {
            specs.push({
                name: Tool.LIST_IMPORTS,
                description: 'Extracts import/export statements from a file. Useful for quickly identifying file dependencies and exports. Supports various languages including JS/TS, Python, Java, Go, Rust, C/C++.',
                parameters: [
                    { name: 'path', required: true, description: 'File path to analyze', type: 'string' }
                ]
            });
        }

        // stat_file - Query file metadata
        if (!allowedTools || allowedTools.includes(Tool.STAT_FILE)) {
            specs.push({
                name: Tool.STAT_FILE,
                description: 'Queries file metadata and structural summary. Returns file size, total line count, modification time, and a **list of symbol names** such as classes/functions/interfaces. Use to check file size before reading, or to identify which classes/functions exist by name only. Limitation: Does **not provide exact line numbers** for symbols. If you need line numbers ("which line", "list of defs with line numbers", "where is it implemented"), use ripgrep_search instead.',
                parameters: [
                    { name: 'path', required: true, description: 'File path to query', type: 'string' },
                    { name: 'symbols', required: false, description: 'Whether to extract symbols (classes, functions, etc.) (default: true)', type: 'string' }
                ]
            });
        }

        // read_active_file - Read currently open file
        if (!allowedTools || allowedTools.includes(Tool.READ_ACTIVE_FILE)) {
            specs.push({
                name: Tool.READ_ACTIVE_FILE,
                description: 'Reads the content of the file currently open in the editor. Use only when the user refers to the current file without a path, such as "this file", "the file I am looking at", or "the open file", and has not attached a file with @. If a file was attached with @, this tool is unnecessary.',
                parameters: []
            });
        }

        // fetch_url - Fetch URL content
        if (!allowedTools || allowedTools.includes(Tool.FETCH_URL)) {
            specs.push({
                name: Tool.FETCH_URL,
                description: 'Fetches the content of an external URL. Use this tool when the user provides a URL and requests its content. Useful for web page summarization, API documentation review, GitHub file retrieval, etc.',
                parameters: [
                    { name: 'url', required: true, description: 'URL to fetch (including https://)', type: 'string' }
                ]
            });
        }

        // lsp
        if (!allowedTools || allowedTools.includes(Tool.LSP)) {
            specs.push({
                name: Tool.LSP,
                description: 'Queries code intelligence information via Language Server Protocol (LSP). Provides symbol definition locations, reference search, type information, file/workspace symbol lists, and more.',
                parameters: [
                    { name: 'operation', required: true, description: 'Operation to perform: goToDefinition (go to definition) | findReferences (find references) | hover (type/documentation info) | documentSymbol (list symbols in file) | workspaceSymbol (search workspace symbols) | goToImplementation (find implementations)', type: 'string' },
                    { name: 'file_path', required: false, description: 'Target file path (required except for workspaceSymbol)', type: 'string' },
                    { name: 'line', required: false, description: 'Cursor line number (1-based, required for position-based operations)', type: 'string' },
                    { name: 'character', required: false, description: 'Cursor column number (0-based, required for position-based operations)', type: 'string' },
                    { name: 'query', required: false, description: 'workspaceSymbol search query', type: 'string' },
                ]
            });
        }

        // list_code_definitions
        if (!allowedTools || allowedTools.includes(Tool.LIST_CODE_DEFINITIONS)) {
            specs.push({
                name: Tool.LIST_CODE_DEFINITIONS,
                description: 'Extracts top-level code definitions (functions, classes, interfaces, types, etc.) from all files in a directory to quickly understand codebase structure. Supported languages: TypeScript, JavaScript, Python, Java, Kotlin, Go, Rust.',
                parameters: [
                    { name: 'path', required: true, description: 'Directory path to scan', type: 'string' },
                    { name: 'recursive', required: false, description: 'Whether to recursively scan subdirectories (default: false)', type: 'string' },
                    { name: 'extensions', required: false, description: 'File extensions to filter (comma-separated, e.g.: "ts,tsx,js")', type: 'string' },
                ]
            });
        }

        // glob_search - Search file paths by pattern
        if (!allowedTools || allowedTools.includes(Tool.GLOB_SEARCH)) {
            specs.push({
                name: Tool.GLOB_SEARCH,
                description: 'Searches for file paths within the project using glob patterns. Use when finding file locations by file name or path pattern. ripgrep_search searches file **contents**, while glob_search searches file **paths/names**. **Use glob_search when you do not know the file location, or when finding files whose names contain specific words (e.g.: *manager*, *service*).** Prefer glob_search over list_files.',
                parameters: [
                    { name: 'pattern', required: true, description: 'Glob pattern (e.g.: **/Dashboard.tsx, src/**/*.test.ts, **/*.config.{js,ts})', type: 'string' },
                    { name: 'path', required: false, description: 'Starting directory for search (default: project root)', type: 'string' },
                    { name: 'maxResults', required: false, description: 'Maximum number of results (default: 200)', type: 'string' }
                ]
            });
        }

        // memory_save - Persistent memory save
        if (!allowedTools || allowedTools.includes(Tool.MEMORY_SAVE)) {
            specs.push({
                name: Tool.MEMORY_SAVE,
                description: 'Persistently saves information learned from previous conversations. Save user preferences, feedback, project context, reference information, and other data useful for future conversations. Saved information is automatically loaded at the start of the next conversation.',
                parameters: [
                    { name: 'name', required: true, description: 'Memory entry name (snake_case recommended, e.g.: user_role, prefer_typescript)', type: 'string' },
                    { name: 'description', required: true, description: 'One-line description of when this memory is useful (used to determine whether to load in future conversations)', type: 'string' },
                    { name: 'type', required: true, description: 'Memory type: user (user role/preferences), feedback (workflow feedback), project (project status/goals), reference (external system reference)', type: 'string' },
                    { name: 'content', required: true, description: 'Memory content to save (supports markdown format)', type: 'string' },
                ]
            });
        }

        // memory_delete - Persistent memory delete
        if (!allowedTools || allowedTools.includes(Tool.MEMORY_DELETE)) {
            specs.push({
                name: Tool.MEMORY_DELETE,
                description: 'Deletes saved memory. Use to remove outdated or incorrect information.',
                parameters: [
                    { name: 'name', required: true, description: 'Name of the memory entry to delete', type: 'string' },
                ]
            });
        }

        // load_skill - Skill loader (for sub-agents)
        if (!allowedTools || allowedTools.includes(Tool.LOAD_SKILL)) {
            specs.push({
                name: Tool.LOAD_SKILL,
                description: 'Loads the full content of a registered skill. After checking the skill list in the system prompt for the needed skill, use this tool to retrieve the detailed instructions of that skill and apply them to your work.',
                parameters: [
                    { name: 'skill_key', required: true, description: 'Skill key to load (name shown in the skill list)', type: 'string' },
                ]
            });
        }

        // ask_question - Collect structured answers from the user
        if (!allowedTools || allowedTools.includes(Tool.ASK_QUESTION)) {
            specs.push({
                name: Tool.ASK_QUESTION,
                description: 'Collect structured multiple-choice answers from the user before proceeding. Use this when you need to clarify requirements such as technology choices, UI preferences, or implementation approaches. The user will see clickable option buttons in the chat panel.',
                parameters: [
                    { name: 'title', required: true, description: 'Title for the question set (in Korean)', type: 'string' },
                    { name: 'questions', required: true, description: 'JSON array of 1-4 questions. Each question: { "id": "unique_id", "prompt": "Question text in Korean", "options": [{ "id": "option_id", "label": "Concise label (1-5 words)", "description": "Explanation of trade-offs" }] (2-4 options per question), "allow_multiple": false }. Do NOT include an "Other" option — it is provided automatically.', type: 'string' },
                ]
            });
        }

        // Add MCP tools
        const mcpSpecs = this.buildMCPToolSpecs();
        specs.push(...mcpSpecs);

        return specs;
    }

    /**
     * Build MCP tool specs
     */
    static buildMCPToolSpecs(): ToolSpec[] {
        const registry = ToolRegistry.getInstance();
        const mcpHandlers = registry.getMCPTools();

        return mcpHandlers
            .filter((h): h is MCPToolHandler => h instanceof MCPToolHandler)
            .map(handler => {
                const spec = handler.toToolSpec();
                return {
                    name: spec.name as ToolName,
                    description: spec.description,
                    parameters: spec.parameters
                };
            });
    }

    /**
     * @deprecated XML format is no longer used. Use buildToolPromptSectionJson() instead.
     */
    static buildToolPromptSection(allowedTools?: Tool[], nativeMode?: boolean): string {
        // Redirect to JSON Function Calling
        return this.buildToolPromptSectionJson(allowedTools, nativeMode);
    }

    // ==================== JSON Function Calling Support (v8.9.0) ====================

    /**
     * Generate Gemini/OpenAI compatible Function Declarations
     * Used for native API function calling.
     */
    static buildFunctionDeclarations(allowedTools?: Tool[]): FunctionDeclaration[] {
        const specs = this.buildToolSpecs(allowedTools);
        return specs.map(spec => this.specToFunctionDeclaration(spec));
    }

    /**
     * Convert ToolSpec to FunctionDeclaration
     */
    private static specToFunctionDeclaration(spec: ToolSpec): FunctionDeclaration {
        const properties: Record<string, { type: string; description: string }> = {};
        const required: string[] = [];

        for (const param of spec.parameters) {
            properties[param.name] = {
                type: param.type || 'string',
                description: param.description
            };
            if (param.required) {
                required.push(param.name);
            }
        }

        return {
            name: spec.name,
            description: spec.description,
            parameters: {
                type: 'object',
                properties,
                required
            }
        };
    }

    /**
     * Generate JSON-based tool calling prompt section
     * v8.9.0: Uses JSON Function Calling format instead of XML
     */
    static buildToolPromptSectionJson(allowedTools?: Tool[], nativeMode?: boolean): string {
        const specs = this.buildToolSpecs(allowedTools);
        return buildToolPromptSection(specs, nativeMode);
    }

    /**
     * Generate tools configuration object for Gemini API
     */
    static buildGeminiToolsConfig(allowedTools?: Tool[]): {
        functionDeclarations: FunctionDeclaration[];
    } {
        return {
            functionDeclarations: this.buildFunctionDeclarations(allowedTools)
        };
    }

    /**
     * Generate OpenAI/Ollama compatible tools configuration object
     */
    static buildOpenAIToolsConfig(allowedTools?: Tool[], includeVirtualTools: boolean = false): Array<{
        type: 'function';
        function: FunctionDeclaration;
    }> {
        const declarations = this.buildFunctionDeclarations(allowedTools);
        const tools = declarations.map(decl => ({
            type: 'function' as const,
            function: decl
        }));

        // Add virtual tools for sub-agents
        if (includeVirtualTools) {
            tools.push({
                type: 'function' as const,
                function: {
                    name: '__done__',
                    description: 'Call this tool when the task is complete. Must include status and summary.',
                    parameters: {
                        type: 'object',
                        properties: {
                            status: { type: 'string', description: 'Completion status: completed, already_done, failed' },
                            summary: { type: 'string', description: 'Summary of the task result' },
                        },
                        required: ['status', 'summary'],
                    },
                } as FunctionDeclaration,
            });
        }

        return tools;
    }
}
