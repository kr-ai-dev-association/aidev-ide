/**
 * DeepSeek LLM Prompt Component
 */

export function getDeepSeekPrompt(): string {
    return `**DeepSeek Model Optimization Guidelines:**
- **JSON Function Calling required**: All file operations and command execution must use JSON format.
- **XML prohibited**: Never use XML tags (<create_file>, <update_file>, etc.).
- **Conciseness**: Respond with key information and avoid redundant explanations.`;
}
