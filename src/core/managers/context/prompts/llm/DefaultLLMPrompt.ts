/**
 * Default LLM Prompt Component
 * Default prompt for other models
 */

export function getDefaultLLMPrompt(): string {
    return `**Default Guidelines:**
- Use standard markdown format
- Code blocks: \`\`\`language format
- Provide clear and structured responses`;
}
