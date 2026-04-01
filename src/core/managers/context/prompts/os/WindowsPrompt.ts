/**
 * Windows OS Prompt Component
 */

export function getWindowsPrompt(): string {
    return `**Windows Environment-Specific Guidelines:**
- Use PowerShell or Command Prompt commands.
- Both backslashes (\\) and forward slashes (/) can be used for file paths.
- Use %VARIABLE_NAME% format for environment variables.
- Use \`\`\`cmd or \`\`\`powershell code blocks for terminal commands.
- Port release: netstat -ano | findstr :PORT_NUMBER, taskkill /PID PROCESS_ID /F
- Process termination: taskkill /IM process_name /F
- Service management: net start/stop service_name
- Guide users to run with administrator privileges for permission issues.`;
}
