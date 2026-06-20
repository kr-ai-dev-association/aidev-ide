/**
 * Banya LLM Prompt Component
 * Banya Solar model optimization
 */

export function getBanyaPrompt(): string {
    return `**Banya Solar Model Optimization Guidelines:**
- **Tool call format**: Use { "tool": "toolName", "path": "..." } format
- **File content**: Use <file_content> ... </file_content> blocks
- **Concise and accurate responses**: Avoid unnecessary introductions or repetition, and deliver only the essential content.
- **Structured output**: Provide executable code with clear step-by-step explanations.
- **Prohibited format**: Do not use XML tags`;
}
