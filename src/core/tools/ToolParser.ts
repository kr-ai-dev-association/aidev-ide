/**
 * Tool Parser
 * Class for parsing tool calls from LLM responses
 *
 * v9.2.0: XML-style file_content tag format
 *   - JSON + <file_content> / </file_content> format
 *   - Prevents Git merge conflict marker confusion
 *   - Streaming support and prevents ``` collisions in code
 *
 * v11.5.0: Parser stability improvements
 *   - Replaced regex [^}]* with bracket-balanced parser: handles values containing }
 *   - Section-based state machine: limits content extraction scope to inter-tool-JSON sections
 *   - ToolParseResult structured failure return
 *
 * Supported formats:
 *    { "tool": "create_file", "path": "..." }
 *    <file_content>
 *    code content
 *    </file_content>
 *
 *    { "tool": "read_file", "path": "src/file.ts" }
 */

import { ToolUse, Tool, ToolName, ToolParseResult } from './types';
import { ToolRegistry } from './ToolRegistry';

/** JSON candidate returned by bracket-balanced parser */
interface JsonCandidate {
    json: string;
    startIndex: number;
    endIndex: number;
}

export class ToolParser {
    // CODE 블록 마커 상수 (XML 스타일)
    private static readonly CODE_START_MARKER = '<file_content>';
    private static readonly CODE_END_MARKER = '</file_content>';

    // ==================== Core Parsing ====================

    /**
     * Extract all JSON objects from text (bracket-balanced parser)
     *
     * Overcomes limitations of previous regex /\{\s*["']tool["']\s*:\s*["']([^"']+)["'][^}]*\}/:
     *   - [^}]* pattern: JSON gets truncated if path value contains }
     *   - Cannot handle nested objects (e.g., "metadata": { ... })
     *
     * Improvement: character-by-character scan, string interior/escape handling, depth tracking
     */
    private static extractAllJsonCandidates(text: string): JsonCandidate[] {
        const results: JsonCandidate[] = [];
        let i = 0;

        while (i < text.length) {
            if (text[i] !== '{') { i++; continue; }

            const startIndex = i;
            let depth = 0;
            let inString = false;
            let escape = false;
            let j = i;
            let found = false;

            while (j < text.length) {
                const ch = text[j];

                if (escape) { escape = false; j++; continue; }
                if (ch === '\\' && inString) { escape = true; j++; continue; }
                if (ch === '"') { inString = !inString; j++; continue; }
                if (inString) { j++; continue; }

                if (ch === '{') { depth++; j++; continue; }
                if (ch === '}') {
                    depth--;
                    if (depth === 0) {
                        results.push({
                            json: text.slice(startIndex, j + 1),
                            startIndex,
                            endIndex: j + 1,
                        });
                        i = j + 1;
                        found = true;
                        break;
                    }
                    j++;
                    continue;
                }
                j++;
            }

            // Unclosed JSON (streaming partial) - no further scanning needed
            if (!found) break;
        }

        return results;
    }

    /**
     * Extract <file_content> content from section (after tool JSON ~ before next tool JSON)
     *
     * State machine:
     *   SCAN -> CODE_START_FOUND -> IN_CONTENT -> DONE
     *   SCAN -> NO_TAG (no content or SEARCH/REPLACE fallback)
     *
     * Section boundaries are pre-cut, eliminating the need for "next tool JSON search" logic.
     */
    private static extractFileContent(
        toolName: string,
        section: string,
        warnings?: string[],
    ): string | undefined {
        const codeStartIdx = section.indexOf(this.CODE_START_MARKER);

        if (codeStartIdx === -1) {
            // SEARCH/REPLACE fallback (when diff comes directly without tags)
            if (toolName === Tool.CREATE_FILE || toolName === Tool.UPDATE_FILE) {
                const trimmed = section.trim();
                if (trimmed.includes('<<<<<<< SEARCH') && trimmed.includes('>>>>>>> REPLACE')) {
                    warnings?.push(`[ToolParser] Fallback: content extracted via SEARCH/REPLACE markers, length=${trimmed.length}`);
                    return trimmed;
                }
            }
            return undefined;
        }

        const contentStart = codeStartIdx + this.CODE_START_MARKER.length;
        const codeEndIdx = section.indexOf(this.CODE_END_MARKER, contentStart);

        if (codeEndIdx !== -1) {
            // Normal: both opening and closing tags present
            return section.substring(contentStart, codeEndIdx).trim();
        }

        // Fallback: only <file_content> opening tag, no </file_content>
        // (max_tokens truncation or LLM omission)
        const extracted = section.substring(contentStart).trim();
        warnings?.push(`[ToolParser] Fallback: missing </file_content> closing tag, length=${extracted.length}`);
        return extracted;
    }

    /**
     * Parse XML-style file_content tag format from LLM responses
     *
     * Improvements (v11.5.0):
     *   1. JSON extraction: regex -> bracket-balanced parser (safe for nesting/special chars)
     *   2. Content extraction scope: section-based (tool JSON <-> next tool JSON section)
     *      -> No false positives even if { "tool": ... } code exists inside <file_content>
     *   3. Early whitelist validation: check tool name immediately after JSON parsing
     */
    static parseCodeBlockFormat(content: string, warnings?: string[]): ToolUse[] {
        const toolCalls: ToolUse[] = [];

        // Step 1: Extract all JSON candidates with bracket-balanced parser
        const candidates = this.extractAllJsonCandidates(content);

        // Step 2: Filter only candidates with "tool" key (tool call header)
        const toolCandidates: Array<{ parsed: any; startIndex: number; endIndex: number }> = [];

        for (const candidate of candidates) {
            let parsed: any;
            try {
                parsed = JSON.parse(candidate.json);
            } catch {
                // Log warning if tool key appears present, otherwise silently skip
                if (candidate.json.includes('"tool"') || candidate.json.includes("'tool'")) {
                    warnings?.push(`JSON parse failed: ${candidate.json.substring(0, 80)}...`);
                }
                continue;
            }

            if (!parsed.tool || typeof parsed.tool !== 'string') continue;

            // Early whitelist validation - block at parsing stage, not just before execution
            if (!this.isValidToolName(parsed.tool)) {
                warnings?.push(`Unknown tool: ${parsed.tool}`);
                continue;
            }

            toolCandidates.push({ parsed, startIndex: candidate.startIndex, endIndex: candidate.endIndex });
        }

        // Step 3: Extract content from each tool candidate's section + create ToolUse
        for (let i = 0; i < toolCandidates.length; i++) {
            const { parsed, endIndex } = toolCandidates[i];
            const toolName: string = parsed.tool;

            // Section: this JSON end ~ next JSON start (or end of content if none)
            // -> Safe even if JSON exists inside <file_content> since it's outside section scope
            const nextStart = i + 1 < toolCandidates.length
                ? toolCandidates[i + 1].startIndex
                : content.length;
            const section = content.substring(endIndex, nextStart);

            // Extract <file_content> content (state machine)
            const codeContent = this.extractFileContent(toolName, section, warnings);

            // Build params
            const params: Record<string, string> = {};

            // Handle path / paths
            // v9.2.3: paths (plural) -> expanded to multiple read_file calls
            if (parsed.path !== undefined) {
                params.path = String(parsed.path);
            } else if (parsed.paths && toolName === Tool.READ_FILE) {
                const pathList = String(parsed.paths)
                    .split(',')
                    .map((p: string) => p.trim())
                    .filter((p: string) => p.length > 0);
                if (pathList.length > 0) {
                    params.path = pathList[0];
                    for (let j = 1; j < pathList.length; j++) {
                        toolCalls.push({ name: Tool.READ_FILE, params: { path: pathList[j] }, partial: false });
                    }
                    console.log(`[ToolParser] read_file paths expanded: ${pathList.length} files`);
                }
            }

            // Assign content / diff
            if (codeContent !== undefined) {
                if (toolName === Tool.CREATE_FILE) {
                    params.content = codeContent;
                } else if (toolName === Tool.UPDATE_FILE) {
                    params.diff = codeContent;
                } else {
                    params.content = codeContent;
                }
            }

            // Copy remaining parameters (excluding tool, lang)
            for (const [key, value] of Object.entries(parsed)) {
                if (key !== 'tool' && key !== 'lang' && !params[key]) {
                    params[key] = String(value);
                }
            }

            // Required parameter validation
            const validation = this.validateToolParams(toolName, params);
            if (!validation.valid) {
                warnings?.push(validation.message || `${toolName}: required parameter missing`);
                console.log(`[ToolParser] ${toolName} skipped: ${validation.message}`);
                continue;
            }

            toolCalls.push({ name: toolName as ToolName, params, partial: false, toolCallId: parsed.toolCallId });
        }

        // Remove duplicate tool calls (same name + same parameters)
        const deduped = this.deduplicateToolCalls(toolCalls);
        if (deduped.length < toolCalls.length) {
            console.log(`[ToolParser] Deduplicated: ${toolCalls.length} → ${deduped.length} tool calls`);
        }

        // Maximum 20 per response limit
        const MAX_TOOL_CALLS_PER_RESPONSE = 20;
        const capped = deduped.length > MAX_TOOL_CALLS_PER_RESPONSE ? deduped.slice(0, MAX_TOOL_CALLS_PER_RESPONSE) : deduped;
        if (capped.length < deduped.length) {
            console.warn(`[ToolParser] Tool call cap applied: ${deduped.length} → ${capped.length} (max ${MAX_TOOL_CALLS_PER_RESPONSE})`);
        }

        console.log(`[ToolParser] parseCodeBlockFormat result: ${capped.length} tool calls found`, capped.map(c => c.name));
        return capped;
    }

    /**
     * Deduplicate identical tool calls
     * Prevents cases where LLM outputs the same JSON multiple times
     */
    private static deduplicateToolCalls(toolCalls: ToolUse[]): ToolUse[] {
        const seen = new Set<string>();
        return toolCalls.filter(call => {
            const key = JSON.stringify({ name: call.name, params: call.params });
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    // ==================== Parameter Validation ====================

    /**
     * Per-tool required parameter validation
     */
    private static validateToolParams(toolName: string, params: Record<string, string>): { valid: boolean; message?: string } {
        // MCP dynamically registered tools are validated by server - bypass internal validation
        if (ToolRegistry.getInstance().isMCPTool(toolName)) {
            return { valid: true };
        }

        if (toolName === Tool.CREATE_FILE) {
            if (!params.path || params.path.trim().length === 0) {
                return { valid: false, message: `create_file is missing path` };
            }
            if (!params.content && params.content !== '') {
                // Only reject when content is completely missing (empty string is allowed - for creating empty files like __init__.py)
                return { valid: false, message: `create_file is missing content (path=${params.path})` };
            }
        }

        if (toolName === Tool.RUN_COMMAND) {
            if (!params.command || params.command.trim().length === 0) {
                return { valid: false, message: `run_command is missing command` };
            }
        }

        if (toolName === Tool.RIPGREP_SEARCH) {
            if (!params.pattern || params.pattern.trim().length === 0) {
                return { valid: false, message: `ripgrep_search is missing pattern` };
            }
        }

        if (toolName === Tool.READ_FILE) {
            if (!params.path || params.path.trim().length === 0) {
                return { valid: false, message: `read_file is missing path` };
            }
        }

        // list_files: empty string "" means project root so it's allowed, only block undefined/null
        if (toolName === Tool.LIST_FILES) {
            if (params.path === undefined || params.path === null) {
                return { valid: false, message: `list_files is missing path` };
            }
        }


        if (toolName === Tool.LIST_IMPORTS) {
            if (!params.path || params.path.trim().length === 0) {
                return { valid: false, message: `list_imports is missing path` };
            }
        }

        if (toolName === Tool.STAT_FILE) {
            if (!params.path || params.path.trim().length === 0) {
                return { valid: false, message: `stat_file is missing path` };
            }
        }

        if (toolName === Tool.FETCH_URL) {
            if (!params.url || params.url.trim().length === 0) {
                return { valid: false, message: `fetch_url is missing url` };
            }
        }

        // git_diff, read_active_file require no parameters
        return { valid: true };
    }

    /**
     * Validate tool name (built-in + Registry dynamic registration)
     */
    private static isValidToolName(name: string): boolean {
        if (name === '__done__') return true; // SubAgentLoop completion signal virtual tool
        if (Object.values(Tool).includes(name as Tool)) return true;
        return ToolRegistry.getInstance().hasHandler(name);
    }

    // ==================== Public API ====================

    /**
     * Unified parsing method - CODE block format only
     */
    static parseToolCallsUnified(
        content: string,
        _nativeResponse?: any,
        _provider?: 'gemini' | 'chat_completions' | 'ollama',
        warnings?: string[],
    ): ToolUse[] {
        if (content.includes('"tool"') || content.includes("'tool'")) {
            return this.parseCodeBlockFormat(content, warnings);
        }
        return [];
    }

    /**
     * Parse tool calls (returns ToolUse[] - legacy compatible API)
     */
    static parseToolCalls(content: string, warnings?: string[]): ToolUse[] {
        return this.parseToolCallsUnified(content, undefined, undefined, warnings);
    }

    /**
     * Parse tool calls (returns ToolParseResult - includes structured failures)
     *
     * Used by ConversationManager to explicitly check for parsing failures
     * or to insert retry prompts for LLM.
     */
    static parseToolCallsWithResult(content: string): ToolParseResult {
        const warnings: string[] = [];
        const tools = this.parseToolCallsUnified(content, undefined, undefined, warnings);
        const hasErrors = warnings.some(w =>
            w.includes('JSON parse failed') ||
            w.includes('Unknown tool') ||
            w.includes('required parameter missing'),
        );
        return { tools, warnings, hasErrors };
    }

    // ==================== Plan/Progress Parsing ====================

    /**
     * Extract first JSON object from string (bracket-balanced parser)
     * Used for parsing plan, task_progress, etc.
     */
    private static extractJsonObject(content: string): string | null {
        const candidates = this.extractAllJsonCandidates(content);
        return candidates.length > 0 ? candidates[0].json : null;
    }

    /**
     * Parse task_progress from LLM response (JSON format)
     */
    static parseTaskProgress(content: string): string | undefined {
        try {
            const jsonBlockPattern = /```json\s*([\s\S]*?)```/gi;
            let match;

            while ((match = jsonBlockPattern.exec(content)) !== null) {
                try {
                    const parsed = JSON.parse(match[1].trim());
                    if (parsed.task_progress) return parsed.task_progress;
                } catch { /* ignore */ }
            }

            const directJsonStr = this.extractJsonObject(content);
            if (directJsonStr) {
                try {
                    const parsed = JSON.parse(directJsonStr);
                    if (parsed.task_progress) return parsed.task_progress;
                } catch { /* ignore */ }
            }
        } catch { /* ignore */ }

        return undefined;
    }

    /**
     * Parse plan items from LLM response (JSON format)
     */
    static parsePlanItems(content: string): Array<{ title: string; detail?: string; kind?: 'investigation' | 'execution' }> {
        const items: Array<{ title: string; detail?: string; kind?: 'investigation' | 'execution' }> = [];

        const parseItems = (parsed: any) => {
            if (parsed.plan && Array.isArray(parsed.plan)) {
                for (const item of parsed.plan) {
                    if (item.title) {
                        items.push({
                            title: item.title,
                            detail: item.detail,
                            kind: (item.kind === 'investigation' || item.kind === 'execution') ? item.kind : undefined,
                        });
                    }
                }
            }
        };

        try {
            const jsonBlockPattern = /```json\s*([\s\S]*?)```/gi;
            let match;
            while ((match = jsonBlockPattern.exec(content)) !== null) {
                try { parseItems(JSON.parse(match[1].trim())); } catch { /* 무시 */ }
            }

            if (items.length === 0) {
                const directJsonStr = this.extractJsonObject(content);
                if (directJsonStr) {
                    try { parseItems(JSON.parse(directJsonStr)); } catch { /* 무시 */ }
                }
            }
        } catch { /* ignore */ }

        return items;
    }

    /**
     * Parse investigation_done from LLM response (JSON format)
     */
    static parseInvestigationDone(content: string): boolean {
        try {
            const jsonBlockPattern = /```json\s*([\s\S]*?)```/gi;
            let match;
            while ((match = jsonBlockPattern.exec(content)) !== null) {
                try {
                    const parsed = JSON.parse(match[1].trim());
                    if (parsed.investigation_done === true) return true;
                } catch { /* ignore */ }
            }

            const directJsonStr = this.extractJsonObject(content);
            if (directJsonStr) {
                try {
                    const parsed = JSON.parse(directJsonStr);
                    if (parsed.investigation_done === true) return true;
                } catch { /* ignore */ }
            }
        } catch { /* ignore */ }

        return false;
    }

    // ==================== Streaming Support ====================

    /**
     * Detect partial blocks (during streaming)
     *
     * Improvement (v11.5.0):
     *   <file_content> open tags > close tags -> partial state (primary)
     *   ```json block unclosed -> legacy fallback (secondary)
     */
    static detectPartialBlock(content: string): boolean {
        const openTags = (content.match(/<file_content>/g) ?? []).length;
        const closeTags = (content.match(/<\/file_content>/g) ?? []).length;
        if (openTags > closeTags) return true;

        // Legacy fallback: unclosed ```json block
        const openBlocks = (content.match(/```json/g) || []).length;
        const closeBlocks = (content.match(/```(?!json)/g) || []).length;
        return openBlocks > closeBlocks;
    }

    /**
     * Parse partial tool call (during streaming)
     * Extract tool name from { "tool": "..." } format
     */
    static parsePartialToolCall(content: string): ToolUse | null {
        try {
            const toolMatch = content.match(/\{\s*["']tool["']\s*:\s*["']([^"']+)["']/);
            if (toolMatch && this.isValidToolName(toolMatch[1])) {
                return { name: toolMatch[1] as ToolName, params: {}, partial: true };
            }
        } catch { /* ignore */ }
        return null;
    }
}
