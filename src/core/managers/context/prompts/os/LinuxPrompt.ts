/**
 * Linux OS Prompt Component
 */

export function getLinuxPrompt(): string {
    return `**Linux Environment-Specific Guidelines:**
- Use Bash shell commands.
- Use forward slashes (/) for file paths.
- Use $VARIABLE_NAME format for environment variables.
- Use \`\`\`bash code blocks for terminal commands.
- Port release: lsof -ti:PORT_NUMBER | xargs kill -9 or fuser -k PORT_NUMBER/tcp
- Process termination: pkill -f "process_name" or killall process_name
- Package managers: apt (Ubuntu/Debian), yum/dnf (RHEL/CentOS), pacman (Arch)
- Guide users to use the sudo command for permission issues.
- **Important: Shell script creation conditions and rules:**
  - Only create shell scripts for tasks directly related to **project build, run, test, or deployment**.
  - Never create shell scripts for tasks unrelated to project build/run.
  - If programming language code (Python, Node.js, Java, etc.) is needed within a shell script:
    * Always use the appropriate language callout (e.g., \`\`\`python, \`\`\`javascript)
    * Follow the file creation guide in "New file: [file_path]" format
  - Complex bash scripts (containing function definitions, multi-line variables, if/for/while loops) must be created as .sh files, then executed using \`chmod +x script.sh && ./script.sh\` format.
  - Only write simple one-line commands directly in code blocks (e.g., \`mvn clean package\`, \`npm install\`, etc.).`;
}
