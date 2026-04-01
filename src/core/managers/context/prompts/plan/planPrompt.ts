/**
 * Plan Mode Prompt
 * Read-only mode that generates an implementation plan (Markdown) after exploring the codebase
 */

export interface PlanPromptOptions {
  codebaseContext?: string;
  profileContext?: string;
  intentContext?: string;
  realTimeInfo?: string;
  gitContext?: string;
  languageInstruction?: string;
  selectedFilesContent?: string;
  terminalContextContent?: string;
  diagnosticsContextContent?: string;
  frameworkRulesPrompt?: string;
  hotLoadPrompt?: string;
  ragContext?: string;
}

export function getPlanPrompt(options: PlanPromptOptions): string {
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

  const selectedFilesSection = selectedFilesContent
    ? `\n## Attached Files\n${selectedFilesContent}\n`
    : "";

  const terminalContextSection = terminalContextContent
    ? `\n## Terminal Output\n\`\`\`\n${terminalContextContent}\n\`\`\`\n`
    : "";

  const diagnosticsContextSection = diagnosticsContextContent
    ? `\n## Diagnostics\n${diagnosticsContextContent}\n`
    : "";

  const ragSection = ragContext
    ? `\n## Reference Documents (RAG)\n${ragContext}\n`
    : "";

  let skillsSection = '';
  try {
    const { PromptComposer } = require('../PromptComposer');
    const { text: agentRulesRaw, ruleKeys: localRuleKeys } = PromptComposer.loadAgentRulesWithKeys();
    const { text: serverRules, overrideKeys } = PromptComposer.loadServerPromptTemplates(localRuleKeys);

    let agentRules = agentRulesRaw;
    if (overrideKeys.size > 0 && agentRulesRaw) {
      for (const key of overrideKeys) {
        const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const sectionRegex = new RegExp(`\\*\\*[^*]*${escapedKey}[^*]*\\(mandatory rule\\):\\*\\*[\\s\\S]*?(?=\\n---\\n|$)`, 'gi');
        agentRules = agentRules.replace(sectionRegex, '').trim();
      }
      agentRules = agentRules.replace(/(\n---\n)+/g, '\n---\n').replace(/^\n---\n|\n---\n$/g, '').trim();
    }

    const parts = [agentRules, serverRules].filter(Boolean);
    if (parts.length > 0) {
      skillsSection = `\n\n## Project Development Rules\n${parts.join('\n\n')}`;
    }
  } catch { /* Ignore if Skills loading fails */ }

  return `You are an experienced software architect. You are currently operating in **PLAN mode**.
${hotLoadPrompt}
## PLAN Mode Rules

**Allowed tools (read-only):**
- read_file, glob_search, ripgrep_search, stat_file, list_files, ask_question

**Strictly prohibited:**
- create_file, update_file, delete_file -- Cannot modify/create/delete files
- run_command -- Cannot execute commands
- Writing and applying code directly
- Outputting actual source code -- only describe what to implement
- Outputting JSON plan format ({"plan": [...]}) -- use Korean Markdown format ONLY
- Do NOT output a JSON plan object. Go straight to the Markdown plan format below

**Role:**
1. Use tools to thoroughly explore the codebase
2. Use ask_question if you need to clarify requirements or approaches
3. Once exploration is complete, output an implementation plan in Korean Markdown
4. Terminate immediately after outputting the plan (no additional tool calls)

**CRITICAL: ALL plan content MUST be written in Korean (한국어). Never use English headings or descriptions.**

## Plan Output Format

After exploration is complete, you must output the plan in the following format:

\`\`\`markdown
# 구현 계획: [요청 요약]

## 개요
[변경 목적과 범위를 1-3문장으로 설명]

## 분석 결과
[탐색에서 발견한 핵심 사항 — 파일 경로, 함수명, 줄 번호 등 구체적 정보 포함]

## 변경 대상 파일
| 파일 | 변경 유형 | 설명 |
|------|----------|------|
| src/foo/bar.ts | 수정 | ... |

## 구현 단계
1. **[단계명]**: [구체적인 작업 설명]
   - 파일: \`path/to/file.ts\`
   - 변경: [무엇을 어떻게]
2. ...

## 참고 사항 / 위험 요소
- [잠재적 부작용, 테스트 필요 사항, 의존성 등]

## 예상 난이도
- 난이도: [낮음/보통/높음]
- 변경 파일 수: N개
\`\`\`
${selectedFilesSection}${terminalContextSection}${diagnosticsContextSection}${ragSection}${skillsSection}
${gitContext}
${languageInstruction}`;
}
