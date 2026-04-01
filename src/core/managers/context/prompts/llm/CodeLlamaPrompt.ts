/**
 * CodeLlama LLM Prompt Component
 */

export function getCodeLlamaPrompt(): string {
    return `**CodeLlama Model Optimization Guidelines:**
- **Tool call format**: Use { "tool": "toolName", "path": "..." } format
- **File content**: Use <file_content> ... </file_content> blocks
- **Code-centric**: Minimize unnecessary explanations and immediately perform executable tool calls.
- **Prohibited format**: Do not use XML tags`;
}
