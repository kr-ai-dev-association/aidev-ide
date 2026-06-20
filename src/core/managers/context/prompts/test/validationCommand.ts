/**
 * Validation Command Prompt
 * Prompt for inferring validation commands using LLM
 */

export interface ValidationCommandPromptOptions {
    projectType: string;
    workspaceRoot: string;
    createdFiles: string[];
    modifiedFiles: string[];
}

export function getValidationCommandPrompt(options: ValidationCommandPromptOptions): string {
    const { projectType, workspaceRoot, createdFiles, modifiedFiles } = options;
    const fileList = [...createdFiles, ...modifiedFiles].slice(0, 10).join(', ');

    return `Infer the validation command for the following project.

Project type: ${projectType}
Project root: ${workspaceRoot}
Created/modified files: ${fileList || 'none'}

You need to infer validation commands that cannot be determined by rule-based methods.
Based on the project type and file information, suggest appropriate validation commands (compile, build, lint, etc.).

Respond in JSON format:
{
  "command": "Command to execute (e.g., npm run build, mvn compile, python -m pytest, etc.)",
  "description": "Validation description (e.g., Node.js build check, Python test execution, etc.)"
}

Important: The command must be actually executable and use validation tools appropriate for the project type.`;
}
