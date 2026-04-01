/**
 * LLM Common Prompt
 *
 * Uses a single prompt without provider-specific branching.
 * Tool call format, response style, etc. are commonly applied to all LLMs.
 */

const LLM_PROMPT = `**AI Code Assistant Guidelines:**
- **Tool call format**: Use { "tool": "toolName", "path": "..." } format
- **File content**: Use <file_content> ... </file_content> blocks
- **Concise and accurate responses**: Avoid unnecessary introductions or repetition, and deliver only the essential content.
- **Structured output**: Provide executable code with clear step-by-step explanations.
- **Token efficiency**: Provide brief explanations along with tool calls. Do not generate a separate summary-only turn.
- **Prohibited format**: Do not use XML tags`;

/**
 * Returns the LLM prompt.
 * The provider/modelType arguments are accepted for backward compatibility but the result is the same.
 */
export function getLLMPrompt(_provider?: string): string {
  return LLM_PROMPT;
}

// Backward compatibility: individual function exports (re-exported from llm/index.ts)
export const getGeminiPrompt = () => LLM_PROMPT;
export const getBanyaPrompt = () => LLM_PROMPT;
export const getGPTOSSPrompt = () => LLM_PROMPT;
export const getDeepSeekPrompt = () => LLM_PROMPT;
export const getCodeLlamaPrompt = () => LLM_PROMPT;
export const getGemmaPrompt = () => LLM_PROMPT;
export const getDefaultLLMPrompt = () => LLM_PROMPT;
