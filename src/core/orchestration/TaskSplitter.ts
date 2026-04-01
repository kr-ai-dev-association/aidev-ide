/**
 * TaskSplitter
 * Module that splits user requests into subtasks
 *
 * Single LLM call to determine task complexity + perform splitting
 * Simple task -> shouldSplit: false (single ConversationManager loop)
 * Complex task -> shouldSplit: true + SubTask[] (SubAgentLoop parallel execution)
 */

import { LLMManager } from '../managers/model/LLMManager';
import { SubTask, TaskSplitResult, ToolPermission } from './types';

const SYSTEM_PROMPT = `You are a task splitting evaluator for a coding assistant.
You analyze user requests and determine whether it would be efficient for multiple agents to process them in parallel.

## Core Principles

1. **Investigation is almost always parallelizable.**
   Read-only tasks such as file reading, structure analysis, searching, and code analysis do not conflict with each other.
   Investigating multiple areas simultaneously significantly reduces time.

2. **Creating different files/modules is parallelizable.**
   Tasks like "login page + API endpoint + tests" that each create different files
   are independently creatable even if they will later be connected via imports.

3. **Only simultaneous modification of the same file causes conflicts.**
   Two agents modifying the same file simultaneously will cause conflicts.
   However, agent A creating a new file while agent B creates a different new file is safe.

5. **If there are file dependencies, you must specify them in dependencies.**
   If task-B needs to read a file that task-A will create using read_file,
   task-B's dependencies must include task-A.
   Parallel tasks cannot access files that other tasks will create.

4. **Integration work is handled sequentially after parallel work.**
   Tasks that combine multiple results, such as routing connections or index.ts updates,
   just need to specify predecessor tasks in dependencies.

## Splitting Criteria

### Cases to split (shouldSplit: true)
- Tasks that create files in different directories/modules
- Tasks spanning different layers like backend + frontend
- Tasks creating multiple independent components/pages
- Tasks investigating/analyzing code across multiple areas

### Cases not to split (shouldSplit: false)
- Single file modification (bug fix, refactoring)
- Tasks adding only one feature
- Tasks where the entire flow depends sequentially (A completes then B, B completes then C)
- **Requests matching HOT LOAD keywords** (registered commands must be executed, so splitting is not allowed)

## Subtask Design Rules

- Minimum 2, maximum 5
- If dependencies is empty, it can be executed in parallel immediately
- If dependencies contains other task ids, it executes after those tasks complete
- toolPermission settings:
  - "read-only": Only needs file reading and searching (investigation/analysis)
  - "read-only-with-commands": Reading + command execution (testing, build verification)
  - "full": Needs file creation/modification/deletion (implementation)
- **Path specification (required)**: You must include the target directory path in each subtask's description.
  - If the user said "create an API in server/" -> specify "in the server/ directory..." in the description
  - If the user said "create frontend in client/" -> specify "in the client/ directory..." in the description
  - If project info contains workspace root directory or user-mentioned paths, you must reference them
  - Sub-agents may not know the project structure, so the exact path for file creation must be included in the description

## Examples

### Example 1: Split YES
Request: "Add a backend API in server/, create a frontend dashboard in client/, and write tests"
-> shouldSplit: true
Subtasks:
  - task-1: "Create backend API endpoints in the server/ directory (server/src/routes/, server/src/controllers/)" (full, dependencies: [])
  - task-2: "Create frontend dashboard page in the client/ directory (client/src/pages/Dashboard.tsx)" (full, dependencies: [])
  - task-3: "Write test code (server/src/__tests__/, client/src/__tests__/)" (full, dependencies: ["task-1", "task-2"])

### Example 2: Split YES
Request: "Create a login page, signup page, and settings page"
-> shouldSplit: true
Subtasks:
  - task-1: "Create login page (src/pages/Login.tsx)" (full, dependencies: [])
  - task-2: "Create signup page (src/pages/Signup.tsx)" (full, dependencies: [])
  - task-3: "Create settings page (src/pages/Settings.tsx)" (full, dependencies: [])
  - task-4: "Connect routing in App.tsx" (full, dependencies: ["task-1", "task-2", "task-3"])

### Example 3: Split NO
Request: "Add a button"
-> shouldSplit: false (single file modification)

### Example 4: Split NO
Request: "Find and fix the bug in this function"
-> shouldSplit: false (a single sequential task)

## Response Format

Output only valid JSON (no markdown, no explanation):
{
  "shouldSplit": boolean,
  "reasoning": "Reason for the decision in Korean (1-2 sentences)",
  "subtasks": [
    {
      "id": "task-1",
      "title": "Short title in Korean",
      "description": "Detailed instructions in Korean to pass to the agent. Must include target directory paths, specify which files to create, and what to implement in detail.",
      "dependencies": [],
      "toolPermission": "full"
    }
  ]
}
If shouldSplit is false, subtasks should be an empty array.

IMPORTANT: All "title", "description", and "reasoning" values MUST be written in Korean.`;

export class TaskSplitter {
    private llmManager: LLMManager;

    constructor() {
        this.llmManager = LLMManager.getInstance();
    }

    async split(userQuery: string, projectContext?: string, hotLoadKeywords?: string[]): Promise<TaskSplitResult> {
        const prompt = this.buildPrompt(userQuery, projectContext, hotLoadKeywords);

        try {
            const response = await this.llmManager.sendMessageWithSystemPrompt(
                SYSTEM_PROMPT,
                [{ text: prompt }],
                { disableRetry: true }
            );

            return this.parseResponse(response);
        } catch (error) {
            console.error('[TaskSplitter] LLM call failed:', error);
            return { shouldSplit: false, subtasks: [], reasoning: 'LLM call failed' };
        }
    }

    private buildPrompt(userQuery: string, projectContext?: string, hotLoadKeywords?: string[]): string {
        let prompt = `User request: ${userQuery}`;
        if (projectContext) {
            prompt += `\n\nProject information:\n${projectContext}`;
        }
        if (hotLoadKeywords && hotLoadKeywords.length > 0) {
            prompt += `\n\nHOT LOAD registered keywords: [${hotLoadKeywords.join(', ')}]\nIf the above keywords are semantically related to the user request, you must return shouldSplit: false. The registered command must be executed in a single loop.`;
        }
        return prompt;
    }

    private parseResponse(response: string): TaskSplitResult {
        try {
            // Remove thinking blocks (<think>...</think>) then extract JSON
            const stripped = response.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
            const jsonMatch = stripped.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                return { shouldSplit: false, subtasks: [], reasoning: 'Failed to parse response' };
            }

            const parsed = JSON.parse(jsonMatch[0]);

            if (!parsed.shouldSplit || !Array.isArray(parsed.subtasks) || parsed.subtasks.length < 2) {
                console.log(`[TaskSplitter] Not splitting: shouldSplit=${parsed.shouldSplit}, subtasks=${parsed.subtasks?.length ?? 0}, reasoning=${parsed.reasoning}`);
                return { shouldSplit: false, subtasks: [], reasoning: parsed.reasoning || 'Single task' };
            }

            const subtasks: SubTask[] = parsed.subtasks.map((st: any, i: number) => ({
                id: st.id || `task-${i + 1}`,
                title: st.title || `Subtask ${i + 1}`,
                description: st.description || '',
                dependencies: Array.isArray(st.dependencies) ? st.dependencies : [],
                toolPermission: this.validatePermission(st.toolPermission),
            }));

            const independent = subtasks.filter(st => st.dependencies.length === 0);
            const dependent = subtasks.filter(st => st.dependencies.length > 0);

            if (independent.length < 2) {
                console.log(`[TaskSplitter] Not splitting: ${independent.length} independent / ${dependent.length} dependent tasks`);
                return { shouldSplit: false, subtasks: [], reasoning: 'Not enough independent tasks for parallel execution' };
            }

            console.log(`[TaskSplitter] Split result: ${subtasks.length} total, ${independent.length} independent, ${dependent.length} dependent`);

            return {
                shouldSplit: true,
                subtasks,  // Return all — the router determines independent/dependent execution order
                reasoning: parsed.reasoning || '',
            };
        } catch (error) {
            console.error('[TaskSplitter] Failed to parse LLM response:', error);
            return { shouldSplit: false, subtasks: [], reasoning: 'Parsing error' };
        }
    }

    private validatePermission(perm: string): ToolPermission {
        if (perm === 'read-only' || perm === 'read-only-with-commands' || perm === 'full') {
            return perm;
        }
        return 'full';
    }
}
