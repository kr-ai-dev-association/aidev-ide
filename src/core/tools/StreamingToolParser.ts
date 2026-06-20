/**
 * StreamingToolParser
 * Utility for incrementally parsing tool calls from streaming responses
 *
 * Core principles:
 * 1. Only display text in UI during streaming
 * 2. When { "tool": ... } <file_content> ... </file_content> is detected, separate as tool call
 * 3. Full tool parsing and execution after response completion
 *
 * v9.2.0: XML-style file_content tag format (prevents Git merge conflict marker confusion)
 */

import { ToolUse } from './types';
import { ToolParser } from './ToolParser';

export interface StreamingParseResult {
    /** Text to display in UI (excluding tool calls) */
    displayText: string;
    /** List of parsed tool calls */
    toolCalls: ToolUse[];
    /** Whether there are incomplete JSON blocks */
    hasPendingJson: boolean;
    /** Full original text */
    fullText: string;
}

export interface StreamingCallbacks {
    /** Called when text chunk is received */
    onTextChunk: (text: string) => void;
    /** Called when tool call is detected (optional) */
    onToolCallDetected?: (toolCall: ToolUse) => void;
    /** Called when streaming is complete */
    onComplete: (result: StreamingParseResult) => void;
}

/**
 * Separate tool calls from streaming responses while displaying text in real-time
 */
export class StreamingToolParser {
    // CODE 블록 마커 상수 (XML 스타일)
    private static readonly CODE_START_MARKER = '<file_content>';
    private static readonly CODE_END_MARKER = '</file_content>';

    private buffer: string = '';
    private displayedLength: number = 0;
    private inJsonBlock: boolean = false;
    private inCodeBlock: boolean = false;
    private jsonBlockStart: number = -1;
    private toolJsonStart: number = -1;
    private detectedToolCalls: ToolUse[] = [];
    private callbacks: StreamingCallbacks;

    constructor(callbacks: StreamingCallbacks) {
        this.callbacks = callbacks;
    }

    /**
     * Process streaming chunk
     */
    processChunk(chunk: string): void {
        this.buffer += chunk;
        this.parseAndStream();
    }

    /**
     * Parse buffer and stream only safe text
     */
    private parseAndStream(): void {
        const buffer = this.buffer;

        // Core: Block text output during streaming if tool call pattern is in buffer
        // Prevents case where LLM returns tool calls after text like "We need to..."
        if (/\{\s*["']tool["']\s*:/.test(buffer)) {
            // Output nothing when tool call is detected (final processing in complete())
            return;
        }

        // Detect JSON block start: ```json
        const jsonStartPattern = /```json\s*/g;
        const jsonEndPattern = /```/g;

        // CODE block pattern: { "tool": ... } followed by <file_content> ... </file_content>
        const toolJsonPattern = /\{\s*["']tool["']\s*:/g;

        let safeEndIndex = this.displayedLength;
        let currentIndex = this.displayedLength;

        while (currentIndex < buffer.length) {
            if (!this.inJsonBlock && !this.inCodeBlock) {
                // 1. Detect new CODE block format: { "tool": ... }
                toolJsonPattern.lastIndex = currentIndex;
                const toolMatch = toolJsonPattern.exec(buffer);

                // 2. Detect existing JSON block format: ```json
                jsonStartPattern.lastIndex = currentIndex;
                const jsonMatch = jsonStartPattern.exec(buffer);

                // Process whichever comes first
                const toolIndex = toolMatch ? toolMatch.index : Infinity;
                const jsonIndex = jsonMatch ? jsonMatch.index : Infinity;

                if (toolIndex < jsonIndex && toolIndex !== Infinity) {
                    // CODE block format comes first
                    safeEndIndex = toolMatch!.index;
                    this.inCodeBlock = true;
                    this.toolJsonStart = toolMatch!.index;
                    currentIndex = toolMatch!.index;
                } else if (jsonIndex !== Infinity) {
                    // JSON block comes first
                    safeEndIndex = jsonMatch!.index;
                    this.inJsonBlock = true;
                    this.jsonBlockStart = jsonMatch!.index;
                    currentIndex = jsonMatch!.index + jsonMatch![0].length;
                } else {
                    // Neither found - safe to the end
                    // However, reserve last 15 chars as pattern may be truncated
                    safeEndIndex = Math.max(this.displayedLength, buffer.length - 15);
                    break;
                }
            } else if (this.inJsonBlock) {
                // Find JSON block end (``` after ```json)
                jsonEndPattern.lastIndex = currentIndex;
                const endMatch = jsonEndPattern.exec(buffer);

                if (endMatch) {
                    // JSON block complete
                    const jsonBlockContent = buffer.substring(this.jsonBlockStart, endMatch.index + endMatch[0].length);
                    this.tryParseJsonBlock(jsonBlockContent);

                    this.inJsonBlock = false;
                    this.jsonBlockStart = -1;
                    currentIndex = endMatch.index + endMatch[0].length;
                    safeEndIndex = currentIndex;
                } else {
                    // JSON block not yet complete
                    break;
                }
            } else if (this.inCodeBlock) {
                // Find CODE block end: </file_content>
                const codeEndIndex = buffer.lastIndexOf(StreamingToolParser.CODE_END_MARKER);

                if (codeEndIndex !== -1) {
                    // CODE block complete
                    const codeBlockContent = buffer.substring(this.toolJsonStart, codeEndIndex + StreamingToolParser.CODE_END_MARKER.length);
                    this.tryParseCodeBlock(codeBlockContent);

                    this.inCodeBlock = false;
                    this.toolJsonStart = -1;
                    currentIndex = codeEndIndex + StreamingToolParser.CODE_END_MARKER.length;
                    safeEndIndex = currentIndex;
                } else {
                    // CODE block may not have started - JSON only case
                    // Find closing } for JSON
                    const jsonCloseBrace = this.findJsonEnd(buffer, this.toolJsonStart);
                    if (jsonCloseBrace !== -1) {
                        const afterJson = buffer.substring(jsonCloseBrace + 1, Math.min(buffer.length, jsonCloseBrace + 20));
                        // If no <file_content>, it's a JSON-only tool call
                        if (!afterJson.includes('<file_content') && buffer.length > jsonCloseBrace + 15) {
                            const jsonOnly = buffer.substring(this.toolJsonStart, jsonCloseBrace + 1);
                            this.tryParseCodeBlock(jsonOnly);

                            this.inCodeBlock = false;
                            this.toolJsonStart = -1;
                            currentIndex = jsonCloseBrace + 1;
                            safeEndIndex = currentIndex;
                            continue;
                        }
                    }
                    // CODE block not yet complete
                    break;
                }
            }
        }

        // Stream only safe text (excluding tool call blocks)
        if (safeEndIndex > this.displayedLength) {
            const textToDisplay = this.getDisplayableText(this.displayedLength, safeEndIndex);
            if (textToDisplay) {
                this.callbacks.onTextChunk(textToDisplay);
            }
            this.displayedLength = safeEndIndex;
        }
    }

    /**
     * Find end position of JSON object
     */
    private findJsonEnd(content: string, startIndex: number): number {
        let depth = 0;
        let inString = false;
        let escape = false;

        for (let i = startIndex; i < content.length; i++) {
            const char = content[i];

            if (escape) {
                escape = false;
                continue;
            }

            if (char === '\\') {
                escape = true;
                continue;
            }

            if (char === '"') {
                inString = !inString;
                continue;
            }

            if (!inString) {
                if (char === '{') depth++;
                else if (char === '}') {
                    depth--;
                    if (depth === 0) {
                        return i;
                    }
                }
            }
        }

        return -1;
    }

    /**
     * Parse tool calls from CODE block format
     */
    private tryParseCodeBlock(block: string): void {
        const toolCalls = ToolParser.parseCodeBlockFormat(block);
        for (const toolCall of toolCalls) {
            this.detectedToolCalls.push(toolCall);
            if (this.callbacks.onToolCallDetected) {
                this.callbacks.onToolCallDetected(toolCall);
            }
        }
    }

    /**
     * Extract displayable text excluding tool call blocks
     */
    private getDisplayableText(start: number, end: number): string {
        let segment = this.buffer.substring(start, end);

        // Remove JSON block patterns
        segment = segment
            .replace(/```json[\s\S]*?```/g, '')
            .replace(/```json[\s\S]*/g, '');

        // Remove CODE block format: { "tool": ... } <file_content> ... </file_content>
        // 1. Remove complete CODE blocks (including file_path attribute)
        segment = segment
            .replace(/\{\s*["']tool["'][\s\S]*?\}\s*<file_content>[\s\S]*?<\/file_content>/gi, '')
            // 2. Remove partial CODE blocks (during streaming)
            .replace(/\{\s*["']tool["'][\s\S]*?\}\s*<file_content>[\s\S]*/gi, '')
            // 3. Also remove JSON-only tool calls
            .replace(/\{\s*["']tool["'][\s\S]*?\}/g, '')
            // 4. Remove orphan CODE blocks (CODE blocks without JSON)
            .replace(/<file_content>[\s\S]*?<\/file_content>/gi, '')
            .replace(/<file_content>[\s\S]*/gi, '');

        // Core: Hide natural language in this segment if tool call pattern exists in full buffer
        // Handles case where LLM returns tool calls along with text like "We need to run..."
        if (/\{\s*["']tool["']\s*:/.test(this.buffer)) {
            // Clear natural language text in responses where tool calls are detected
            segment = '';
        }

        return segment;
    }

    /**
     * Parse plan etc. from JSON blocks (tool calls are only handled via CODE block format)
     */
    private tryParseJsonBlock(block: string): void {
        try {
            // ```json ... ``` 에서 JSON 부분만 추출
            const jsonMatch = block.match(/```json\s*([\s\S]*?)\s*```/);
            if (!jsonMatch) return;

            const jsonStr = jsonMatch[1].trim();
            // Only parse JSON; plan etc. are handled by ToolParser
            JSON.parse(jsonStr); // Validation only
        } catch (e) {
            // JSON parse failure - ignore (may be incomplete JSON)
            console.debug('[StreamingToolParser] Failed to parse JSON block:', e);
        }
    }

    /**
     * Handle streaming completion
     */
    complete(): StreamingParseResult {
        // Process remaining buffer
        if (this.displayedLength < this.buffer.length && !this.inJsonBlock && !this.inCodeBlock) {
            const remainingText = this.getDisplayableText(this.displayedLength, this.buffer.length);
            if (remainingText) {
                this.callbacks.onTextChunk(remainingText);
            }
        }

        // Final tool call parsing from full response (using ToolParser)
        const allToolCalls = ToolParser.parseToolCallsUnified(this.buffer);

        // Merge streaming-detected and final parsing results (deduplicated)
        const finalToolCalls = this.mergeToolCalls(this.detectedToolCalls, allToolCalls);

        // Display text (with tool call blocks removed)
        let displayText = this.buffer
            .replace(/```json[\s\S]*?```/g, '')
            // Remove complete CODE blocks
            .replace(/\{\s*["']tool["'][\s\S]*?\}\s*<file_content>[\s\S]*?<\/file_content>/gi, '')
            // Remove CODE blocks without closing tag (when LLM omits </file_content>)
            .replace(/\{\s*["']tool["'][\s\S]*?\}\s*<file_content>[\s\S]*/gi, '')
            // Also remove JSON-only tool calls
            .replace(/\{\s*["']tool["'][\s\S]*?\}/g, '')
            // Remove orphan CODE blocks
            .replace(/<file_content>[\s\S]*?<\/file_content>/gi, '')
            .replace(/<file_content>[\s\S]*/gi, '')
            .trim();

        // Core: Hide all natural language text in responses containing tool calls
        // Handles case where LLM returns tool calls along with text like "We need to run..."
        if (finalToolCalls.length > 0 || /\{\s*["']tool["']\s*:/.test(this.buffer)) {
            displayText = '';
        }

        const result: StreamingParseResult = {
            displayText,
            toolCalls: finalToolCalls,
            hasPendingJson: this.inJsonBlock || this.inCodeBlock,
            fullText: this.buffer
        };

        this.callbacks.onComplete(result);
        return result;
    }

    /**
     * Merge tool call lists (deduplicated)
     */
    private mergeToolCalls(detected: ToolUse[], parsed: ToolUse[]): ToolUse[] {
        // Use parsed results as reference (more accurate)
        if (parsed.length > 0) {
            return parsed;
        }
        return detected;
    }

    /**
     * Return current buffer content
     */
    getBuffer(): string {
        return this.buffer;
    }

    /**
     * Reset state
     */
    reset(): void {
        this.buffer = '';
        this.displayedLength = 0;
        this.inJsonBlock = false;
        this.inCodeBlock = false;
        this.jsonBlockStart = -1;
        this.toolJsonStart = -1;
        this.detectedToolCalls = [];
    }
}

/**
 * Helper function to integrate streaming callbacks with StreamingToolParser
 */
export function createStreamingToolCallback(
    onTextChunk: (text: string) => void,
    onComplete: (result: StreamingParseResult) => void,
    onToolCallDetected?: (toolCall: ToolUse) => void
): {
    onChunk: (chunk: string, done: boolean) => void;
    parser: StreamingToolParser;
} {
    const parser = new StreamingToolParser({
        onTextChunk,
        onToolCallDetected,
        onComplete
    });

    const onChunk = (chunk: string, done: boolean) => {
        if (chunk) {
            parser.processChunk(chunk);
        }
        if (done) {
            parser.complete();
        }
    };

    return { onChunk, parser };
}
