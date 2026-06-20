/**
 * Gemma LLM Prompt Component
 */

export function getGemmaPrompt(): string {
    return `**Gemma Model Optimization Guidelines:**
- **Tool call format**: Use { "tool": "toolName", "path": "..." } format
- **File content**: Use <file_content> ... </file_content> blocks
- **Concise and clear responses**: Deliver only the technical essentials and avoid unnecessary embellishments.
- **Prohibited format**: Do not use XML tags`;
}
