/**
 * GPT-OSS LLM Prompt Component
 */

export function getGPTOSSPrompt(): string {
    return `**GPT-OSS Model Optimization Guidelines:**
- **Tool call format**: Use { "tool": "toolName", "path": "..." } format
- **File content**: Use <file_content> ... </file_content> blocks
- **Concise structure**: Skip introductions and conclusions, and immediately provide the core answer and tool calls.
- **Precise execution**: Analyze the user's intent and select the most appropriate tool.
- **Prohibited format**: Do not use XML tags`;
}
