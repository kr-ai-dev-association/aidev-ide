/**
 * Default OS Prompt Component
 * Unknown OS or general environment
 */

export function getDefaultOSPrompt(): string {
    return `**General Environment Guidelines:**
- Use platform-independent commands.
- Use forward slashes (/) for file paths.
- Use $VARIABLE_NAME format for environment variables.
- Use \`\`\`bash code blocks for terminal commands.
- Port release and process termination commands may vary by OS, so use caution.`;
}
