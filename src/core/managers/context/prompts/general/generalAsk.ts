/**
 * General Ask Prompt
 * General question-and-answer prompt
 */

export interface GeneralAskPromptOptions {
  codebaseContext?: string;
  profileContext?: string;
  intentContext?: string;
  realTimeInfo?: string;
  gitContext?: string;
  languageInstruction?: string;
  selectedFilesContent?: string; // Content of user-selected files
  terminalContextContent?: string; // User-selected terminal history
  diagnosticsContextContent?: string; // User-selected Diagnostics
  frameworkRulesPrompt?: string; // Framework rules
  hotLoadPrompt?: string; // Hot Load prompt
  ragContext?: string; // Server RAG search results
}

export function getGeneralAskPrompt(options: GeneralAskPromptOptions): string {
  const {
    codebaseContext = "",
    profileContext = "",
    intentContext = "",
    realTimeInfo = "",
    gitContext = "",
    languageInstruction = "",
    selectedFilesContent = "",
    terminalContextContent = "",
    diagnosticsContextContent = "",
    frameworkRulesPrompt = "",
    hotLoadPrompt = "",
    ragContext = "",
  } = options;

  // User-selected files section - strong directive
  const selectedFilesSection = selectedFilesContent
    ? `
## IMPORTANT: User-Attached Files
The files below are files that the user has **explicitly requested analysis for**.
**You must answer based on the file contents below. Do not answer about other topics.**

${selectedFilesContent}
`
    : "";

  // Terminal context section - strong directive
  const terminalContextSection = terminalContextContent
    ? `
## IMPORTANT: User-Attached Terminal Output
Below is the **actual terminal screen content explicitly attached by the user via @terminal**.
**You must analyze and answer based on the actual data (numbers, process names, statuses, etc.) from the terminal output below.**
**Your answer must be based on the actual values in the attached output, not general command explanations.**

\`\`\`
${terminalContextContent}
\`\`\`
`
    : "";

  // Diagnostics section - strong directive
  const diagnosticsContextSection = diagnosticsContextContent
    ? `
## IMPORTANT: User-Attached Diagnostics
Below are **errors/warnings that the user has explicitly requested analysis for** from the current workspace.
**You must answer based on the Diagnostics content below.**

${diagnosticsContextContent}
`
    : "";

  // RAG document section
  const ragSection = ragContext
    ? `
## Reference Documents (RAG) -- Use as Priority
Below is content retrieved from internal organization documents related to the user's question.
**Important**: Use the RAG document content below as the top priority for your answer. Cite the document source, and supplement with general knowledge for content not found in the documents.

${ragContext}
`
    : "";

  // Whether attached context exists
  const hasAttachedContext =
    selectedFilesContent || terminalContextContent || diagnosticsContextContent;

  // Emphasis at the top when attached context exists
  const attachedContextWarning = hasAttachedContext
    ? `
# Top Priority Directive
The user has attached files/terminal output/Diagnostics below.
**You must analyze and answer based only on the attached content.**
Do not answer about general knowledge or other topics.

`
    : "";

  // Integrated Skills loading: local (.agent/rules) + server (dev_rules)
  // Required server rules take priority over local; recommended rules defer to local
  let skillsSection = "";
  try {
    const { PromptComposer } = require("../PromptComposer");
    const { text: agentRulesRaw, ruleKeys: localRuleKeys } =
      PromptComposer.loadAgentRulesWithKeys();
    const { text: serverRules, overrideKeys } =
      PromptComposer.loadServerPromptTemplates(localRuleKeys);

    // Remove local rules overridden by required server rules
    let agentRules = agentRulesRaw;
    if (overrideKeys.size > 0 && agentRulesRaw) {
      for (const key of overrideKeys) {
        const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const sectionRegex = new RegExp(
          `\\*\\*[^*]*${escapedKey}[^*]*\\(mandatory rule\\):\\*\\*[\\s\\S]*?(?=\\n---\\n|$)`,
          "gi",
        );
        agentRules = agentRules.replace(sectionRegex, "").trim();
      }
      agentRules = agentRules
        .replace(/(\n---\n)+/g, "\n---\n")
        .replace(/^\n---\n|\n---\n$/g, "")
        .trim();
    }

    const parts = [agentRules, serverRules].filter(Boolean);
    if (parts.length > 0) {
      skillsSection = `\n\n## Project Development Rules (Mandatory)\nThe Skills below are mandatory rules registered for the project. You must apply these rules when answering.\n\n${parts.join("\n\n")}`;
    }
  } catch {
    /* Ignore if Skills loading fails */
  }

  return `You are a professional software developer and technical expert answering in READ-ONLY ASK mode.

## ASK 모드 필수 규칙 (최우선)
- 사용자 질문에 **자연어로 직접 답변**합니다. 파일 수정/생성/삭제·명령 실행은 할 수 없습니다.
- **절대 plan JSON(예: {"plan":[...]})이나 도구 호출/도구 코드(예: <tool_code>...</tool_code>, read_file(...), ls_r(...), {"tool":"..."})를 출력하지 마세요.**
- 코드 변경이 필요하면, 바꿀 코드를 **예시 코드 블록과 설명**으로 자연어로 제시하고, 실제 적용은 사용자가 CODE 모드로 전환해 수행한다고 안내하세요.
${hotLoadPrompt}${attachedContextWarning}${selectedFilesSection}${terminalContextSection}${diagnosticsContextSection}${ragSection}${skillsSection}
Key guidelines:
${gitContext}
${languageInstruction}`;
}
