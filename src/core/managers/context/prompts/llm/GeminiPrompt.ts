/**
 * Gemini LLM Prompt Component
 */

export function getGeminiPrompt(): string {
    return `**Gemini Model-Specific Guidelines:**
- **Tool call format**: Use { "tool": "toolName", "path": "..." } format
- **File content**: Use <file_content> ... </file_content> blocks
- Provide structured responses
- **Token efficiency guide**: Provide brief explanations along with tool calls. Do not generate a separate summary-only turn.
- **Planning notes**: Plans must be written in JSON format. \`\`\`json { "plan": [{ "kind": "...", "title": "...", "detail": "..." }] } \`\`\`
- **Prohibited format**: Do not use XML tags`;
}
