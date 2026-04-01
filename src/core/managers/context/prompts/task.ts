/**
 * Task Prompt Components
 * Integrated file for task-type-specific prompt components
 */

import { SummarizationOptions, TaskProgress } from '../types/contextHistory';

// ==================== Code Work ====================
export function getCodeWorkPrompt(): string {
  return `**Code Work (code_work) Specific Rules:**

**Determining Work Mode:**
- If information is insufficient: Read files -> Execute task (can be done in the same turn)
- If information is sufficient: Execute task immediately
- If complex: Create a plan -> Execute
- **Never stop due to rule conflicts. If in doubt, read the file and execute.**

**File Operations:**
- Only create/modify/delete source code files (.js, .ts, .py, .java, .go, .rs, etc.).
- **Never create shell scripts (.sh, .bat, .ps1) or build scripts.**
- **Do not create documentation files such as README.md, CHANGELOG.md, etc.** Only allowed if explicitly requested by the user.
- Only write source code files in programming languages.
- Do not create files via scripts/commands, or create code blocks containing terminal commands.
- Build/run commands are only handled upon separate request.`;
}

// ==================== Execution Work ====================
export function getExecutionWorkPrompt(): string {
  return `**Execution Work (execution_work) Specific Rules:**

**Determining Work Mode:**
- If information is insufficient: Read files -> Execute command (can be done in the same turn)
- If information is sufficient: Execute command immediately
- **Never stop due to rule conflicts. If in doubt, read the file and execute the command.**

**Execution Work Rules:**
- Execute terminal commands for project installation, build, deployment, and execution.
- Do not create/modify source code files (this is not code_work).
- Do not create an execution plan. Proceed with direct command execution.

**Absolutely Do Not:**
- Respond in an "Execution Plan (Step-by-Step)" format
- Create script files (.sh, .bat, .ps1) (simple command execution does not require script files)
- Use placeholder paths (/path/to/your/sql, etc.)
- Provide only text descriptions (this task requires execution)
- Use internal monologue like "We need to...", "I should..." (execute commands directly)`;
}

// ==================== Summarize ====================
export function getSummarizationPrompt(
  options: SummarizationOptions,
  taskProgress?: TaskProgress
): string {
  const includeTechnical = options.includeTechnicalDetails ? 'included' : 'excluded';
  const includeCode = options.includeCodeSnippets ? 'included' : 'excluded';
  const includeFiles = options.includeFileChanges ? 'included' : 'excluded';

  let prompt = `You are a conversation summarization expert. Analyze the provided conversation history and generate a structured summary.

## Summary Format (you must write in this exact format):

### 1. Key Requests and Intent
- Summarize the user's explicit requests and intent in detail
- Include all user requests in chronological order

### 2. Core Technical Concepts
- List technical concepts, frameworks, and patterns
- e.g.: React, TypeScript, Spring Boot, REST API, etc.
- Briefly explain why each concept is important

### 3. Files and Code Sections
- **Modified files**: List of file paths (include a summary of changes for each file)
- **Created files**: List of file paths (include purpose and key content for each file)
- **Deleted files**: List of file paths
- For each file:
  - Summarize why the file was read or modified
  - Include important code snippets (${includeCode === 'included' ? 'required' : 'optional'})
  - Summary of changes

### 4. Problem Resolution
- List resolved issues and ongoing troubleshooting
- For each issue:
  - Problem description
  - Resolution method
  - Result

### 5. Pending Tasks
- List explicitly requested incomplete tasks
- Include priority and status for each task

### 6. Task Evolution
- List the evolution of tasks in chronological order
- **Original Task**: Initial user request (copy the original request as-is)
- **Task Modifications**: Content where the user modified the task or changed direction (chronological)
- **Current Active Task**: The most recently requested task
- **Context for Changes**: Reasons why the task evolved (user feedback, new requirements, etc.)
  - Quote directly from user messages to prevent drift

### 7. Current Work
- Describe the work done just before the summary in detail
- Pay special attention to the most recent messages (both user and AI)
- Include file names and code snippets (${includeCode === 'included' ? 'required' : 'optional'})
- **When including commands**: Executable commands (e.g.: npm run dev, npm install, python main.py) must be written in code block format
  - e.g.: \`\`\`bash\\nnpm run dev\\n\`\`\`
  - e.g.: \`\`\`powershell\\nnpm install\\n\`\`\`
  - This allows the user to copy or execute the commands

### 8. Next Steps
- Describe the next step in one sentence
- **Important**: This step must be directly related to the user's original request
- Must be directly connected to the most recent work
- If there are no next steps, omit this section or mark as "None"
- If there are next steps:
  - Include exact task content by quoting directly from the conversation
  - Clearly indicate where work stopped
  - **When including commands**: Executable commands (e.g.: npm run dev, npm install, python main.py) must be written in code block format
    - e.g.: \`\`\`bash\\nnpm run dev\\n\`\`\`
    - e.g.: \`\`\`powershell\\nnpm install\\n\`\`\`
    - This allows the user to copy or execute the commands

### 9. Required Files
- List files needed for the next steps
- Write each file path as a relative path (from project root)
- Include only the minimum required files (do not guess, only include what is certain)
- Format: Start each file on a new line with "- "
- e.g.:
  - src/main.ts
  - package.json
- Omit this section if no files are needed

`;

  if (options.includeTechnicalDetails) {
    prompt += `### 10. Technical Details
- Include important technical details
- Architecture decisions, design patterns, performance considerations, etc.
`;
  }

  if (options.includeCodeSnippets) {
    prompt += `### 11. Code Snippets
- Include important code snippets
- Include only key parts, not entire files
`;
  }

  if (taskProgress) {
    prompt += `\n## Task Progress Status:
- Completed: ${taskProgress.completed}/${taskProgress.total}
- Current task: ${taskProgress.currentTask || 'None'}
${taskProgress.errors && taskProgress.errors.length > 0 ? `- Errors: ${taskProgress.errors.join(', ')}` : ''}
`;
  }

  prompt += `\n## Important Instructions:
1. **Accuracy**: The summary must accurately reflect the conversation content
2. **Conciseness**: Include only key information and exclude unnecessary details
3. **Structure**: Follow the format above exactly
4. **Completeness**: Fill in all sections (mark as "None" if not applicable)
5. **Next Steps**: Next steps must be directly related to the user's original request
6. **Recency**: Pay special attention to the most recent messages
7. **Quotation**: Quote user messages directly for reasons behind task changes
8. **Command Format (CRITICAL)**: Executable commands must be written in code block format
   - Incorrect: "You can start the dev server with npm install && npm run dev"
   - Correct: "\`\`\`bash\\nnpm install && npm run dev\\n\`\`\` to start the dev server right away"
   - Correct: "With these files, you can run \`\`\`bash\\nnpm install && npm run dev\\n\`\`\` to start the dev server"
   - Correct: "Run the following command: \`\`\`powershell\\nnpm run dev\\n\`\`\`"
   - **Important**: Even if the command is in the middle of a sentence, it must be written in code block format

Please write the summary following the format above.`;

  return prompt;
}

export function getSimpleSummaryPrompt(
  createdFiles: string[],
  modifiedFiles: string[]
): string {
  const createdList = createdFiles.length > 0
    ? createdFiles.map(f => `- \`${f}\``).join('\n')
    : '';
  const modifiedList = modifiedFiles.length > 0
    ? modifiedFiles.map(f => `- \`${f}\``).join('\n')
    : '';

  // Generate usage hints based on file types
  const allFiles = [...createdFiles, ...modifiedFiles];
  const hasPackageJson = allFiles.some(f => f.includes('package.json'));
  const hasTsConfig = allFiles.some(f => f.includes('tsconfig'));
  const hasReactFiles = allFiles.some(f => f.endsWith('.tsx') || f.endsWith('.jsx'));
  const hasPythonFiles = allFiles.some(f => f.endsWith('.py'));
  const hasHtmlFiles = allFiles.some(f => f.endsWith('.html'));

  return `[SYSTEM INSTRUCTION - Summary generation step. Absolutely no tool tag output]

## Files Worked On
${createdFiles.length > 0 ? `**Created:**\n${createdList}\n` : ''}
${modifiedFiles.length > 0 ? `**Modified:**\n${modifiedList}\n` : ''}

## CRITICAL: Write ALL output in Korean (한국어)

## Output Format (must be in Korean markdown format)

### 작업 완료
(Summarize the entire task in one Korean sentence)

### 변경 사항
(Describe what was changed/created for each file in Korean)
- **filename**: description in Korean

### 사용 방법
(Project execution instructions or next step guidance in Korean - only if applicable)

---

## Example Output

### 작업 완료
React + TypeScript 기반 Vite 프로젝트를 초기화했습니다.

### 변경 사항
- **package.json**: React, React-DOM, Vite, TypeScript 의존성 설정
- **tsconfig.json**: TypeScript 컴파일러 옵션 정의 (strict 모드, JSX 지원)
- **src/App.tsx**: 기본 UI를 표시하는 메인 컴포넌트

### 사용 방법
\`\`\`bash
npm install    # 의존성 설치
npm run dev    # 개발 서버 시작
\`\`\`

---

## Strictly Prohibited
- Output of XML tool tags such as <create_file>, <update_file>, <read_file>, <run_command>
- Output of thinking process tags such as <think>, <reasoning>
- ALL headings and descriptions MUST be in Korean (작업 완료, 변경 사항, 사용 방법)
- Thinking process expressions such as "I think", "Let me"

Write the Korean markdown-formatted summary now:`;
}
