/**
 * OS-specific prompt registry
 *
 * Consolidates the 4 files from the os/ directory into a single registry.
 * To add a new OS, simply add an entry to osPromptRegistry.
 */

const osPromptRegistry: Record<string, string> = {
  windows: `**Windows Environment Guidelines:**
- Use PowerShell or Command Prompt commands.
- File paths can use either backslashes (\\) or forward slashes (/).
- Use the %VARIABLE_NAME% format for environment variables.
- Use the run_command tool for terminal commands.
- Release port: netstat -ano | findstr :PORT_NUMBER, taskkill /PID PROCESS_ID /F
- Kill process: taskkill /IM PROCESS_NAME /F
- Service management: net start/stop SERVICE_NAME
- If there are permission issues, instruct the user to run as administrator.`,

  macos: `**macOS Environment Guidelines:**
- Use Bash/Zsh shell commands.
- Use forward slashes (/) for file paths.
- Use the $VARIABLE_NAME format for environment variables.
- Use the run_command tool for terminal commands.
- Release port: lsof -ti:PORT_NUMBER | xargs kill -9
- Kill process: pkill -f "PROCESS_NAME"
- Recommend using the Homebrew package manager.
- If there are permission issues, instruct the user to use the sudo command.
- **Important: Shell script creation conditions and rules:**
  - Only create shell scripts for tasks directly related to **project build, run, test, or deployment**.
  - Never create shell scripts for tasks unrelated to project build/run.
  - If programming language code (Python, Node.js, Java, etc.) is needed inside a shell script:
    * Always use the appropriate language callout (e.g., \`\`\`python, \`\`\`javascript)
    * Follow the file creation guide in the format "New file: [file_path]"
  - Complex bash scripts (containing function definitions, multi-line variables, if/for/while loops) must be created as .sh files and executed using \`chmod +x script.sh && ./script.sh\`.
  - Only write simple one-line commands directly in code blocks (e.g., \`mvn clean package\`, \`npm install\`, etc.).`,

  linux: `**Linux Environment Guidelines:**
- Use Bash shell commands.
- Use forward slashes (/) for file paths.
- Use the $VARIABLE_NAME format for environment variables.
- Use the run_command tool for terminal commands.
- Release port: lsof -ti:PORT_NUMBER | xargs kill -9 or fuser -k PORT_NUMBER/tcp
- Kill process: pkill -f "PROCESS_NAME" or killall PROCESS_NAME
- Package managers: apt (Ubuntu/Debian), yum/dnf (RHEL/CentOS), pacman (Arch)
- If there are permission issues, instruct the user to use the sudo command.
- **Important: Shell script creation conditions and rules:**
  - Only create shell scripts for tasks directly related to **project build, run, test, or deployment**.
  - Never create shell scripts for tasks unrelated to project build/run.
  - If programming language code (Python, Node.js, Java, etc.) is needed inside a shell script:
    * Always use the appropriate language callout (e.g., \`\`\`python, \`\`\`javascript)
    * Follow the file creation guide in the format "New file: [file_path]"
  - Complex bash scripts (containing function definitions, multi-line variables, if/for/while loops) must be created as .sh files and executed using \`chmod +x script.sh && ./script.sh\`.
  - Only write simple one-line commands directly in code blocks (e.g., \`mvn clean package\`, \`npm install\`, etc.).`,

  default: `**General Environment Guidelines:**
- Use platform-independent commands.
- Use forward slashes (/) for file paths.
- Use the $VARIABLE_NAME format for environment variables.
- Use the run_command tool for terminal commands.
- Port release and process termination commands may vary by OS, so use caution.`,
};

/**
 * Returns the corresponding prompt for the given OS string.
 * @param userOS - User OS string (e.g., "macOS", "Windows", "Linux")
 */
export function getOSPrompt(userOS: string): string {
  const osLower = userOS.toLowerCase();
  if (osLower.includes('windows')) {
    // Windows: 현재 사용 중인 셸 정보를 LLM에 전달
    const shellInfo = getWindowsShellInfo();
    return osPromptRegistry.windows + '\n' + shellInfo;
  }
  if (osLower.includes('mac') || osLower.includes('darwin')) return osPromptRegistry.macos;
  if (osLower.includes('linux')) return osPromptRegistry.linux;
  return osPromptRegistry.default;
}

/**
 * Windows에서 현재 사용 중인 셸 정보를 반환
 */
function getWindowsShellInfo(): string {
  if (process.platform !== 'win32') return '';

  const shell = process.env.SHELL || '';
  if (shell.includes('bash')) {
    return `- **현재 셸: Git Bash** — Unix 명령어 (grep, find, cat, ls 등) 사용 가능. bash 문법으로 명령어를 작성하세요.`;
  }

  // PowerShell 감지
  try {
    const { execSync } = require('child_process');
    execSync('where pwsh.exe', { stdio: 'pipe', timeout: 2000 });
    return `- **현재 셸: PowerShell (pwsh)** — PowerShell 명령어를 사용하세요. Unix 명령어 대신 Get-ChildItem, Select-String 등을 사용하세요. 환경변수는 $env:VAR 형식입니다.`;
  } catch {
    try {
      const { execSync } = require('child_process');
      execSync('where powershell.exe', { stdio: 'pipe', timeout: 2000 });
      return `- **현재 셸: PowerShell (5.1)** — PowerShell 명령어를 사용하세요. Unix 명령어 대신 Get-ChildItem, Select-String 등을 사용하세요. 환경변수는 $env:VAR 형식입니다.`;
    } catch {
      return `- **현재 셸: cmd.exe** — Windows 명령어 (dir, findstr, type 등)를 사용하세요. Unix 명령어 (grep, find, cat)는 사용할 수 없습니다. 환경변수는 %VAR% 형식입니다.`;
    }
  }
}

// Backward compatibility: export individual functions
export const getWindowsPrompt = () => osPromptRegistry.windows;
export const getMacOSPrompt = () => osPromptRegistry.macos;
export const getLinuxPrompt = () => osPromptRegistry.linux;
export const getDefaultOSPrompt = () => osPromptRegistry.default;
