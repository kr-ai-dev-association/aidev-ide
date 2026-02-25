/**
 * General Ask Prompt
 * 일반 질의응답 프롬프트
 */

export interface GeneralAskPromptOptions {
  codebaseContext?: string;
  profileContext?: string;
  intentContext?: string;
  realTimeInfo?: string;
  gitContext?: string;
  languageInstruction?: string;
  selectedFilesContent?: string; // 사용자가 선택한 파일들의 내용
  terminalContextContent?: string; // 사용자가 선택한 터미널 히스토리
  diagnosticsContextContent?: string; // 사용자가 선택한 Diagnostics
  frameworkRulesPrompt?: string; // 프레임워크 규칙
  hotLoadPrompt?: string; // Hot Load 프롬프트
  ragContext?: string; // 서버 RAG 검색 결과
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

  // 사용자가 선택한 파일 섹션 - 강한 지시
  const selectedFilesSection = selectedFilesContent
    ? `
## ⚠️ 중요: 사용자가 첨부한 파일 
아래 파일들은 사용자가 **명시적으로 분석을 요청한 파일**입니다.
**반드시 아래 파일 내용을 기반으로 답변하세요. 다른 주제에 대해 답변하지 마세요.**

${selectedFilesContent}
`
    : "";

  // 터미널 컨텍스트 섹션 - 강한 지시
  const terminalContextSection = terminalContextContent
    ? `
## ⚠️ 중요: 사용자가 첨부한 터미널 출력
아래는 사용자가 **@terminal로 명시적으로 첨부한 실제 터미널 화면 내용**입니다.
**반드시 아래 터미널 출력의 실제 데이터(숫자, 프로세스명, 상태 등)를 분석하여 답변하세요.**
**일반적인 명령어 설명이 아닌, 첨부된 출력의 실제 값을 기반으로 답변해야 합니다.**

\`\`\`
${terminalContextContent}
\`\`\`
`
    : "";

  // Diagnostics 섹션 - 강한 지시
  const diagnosticsContextSection = diagnosticsContextContent
    ? `
## ⚠️ 중요: 사용자가 첨부한 Diagnostics 
아래는 현재 워크스페이스에서 **사용자가 명시적으로 분석을 요청한 에러/경고**입니다.
**반드시 아래 Diagnostics 내용을 기반으로 답변하세요.**

${diagnosticsContextContent}
`
    : "";

  // RAG 문서 섹션
  const ragSection = ragContext
    ? `
## 참고 문서 (RAG) — 반드시 우선 활용
아래는 사용자 질문과 관련하여 조직 내부 문서에서 검색된 내용입니다.
**중요**: 아래 RAG 문서의 내용을 최우선으로 활용하여 답변하세요. 문서 출처를 명시하고, 문서에 없는 내용은 추측하지 마세요.

${ragContext}
`
    : "";

  // 첨부 컨텍스트 존재 여부
  const hasAttachedContext =
    selectedFilesContent || terminalContextContent || diagnosticsContextContent;

  // 첨부 컨텍스트가 있을 때 최상단에 강조
  const attachedContextWarning = hasAttachedContext
    ? `
# ⚠️ 최우선 지시사항
사용자가 아래에 파일/터미널/Diagnostics를 첨부했습니다.
**반드시 첨부된 내용만을 분석하여 답변하세요.**
일반적인 지식이나 다른 주제에 대해 답변하지 마세요.

`
    : "";

  // Skills 통합 로드: 로컬(.agent/rules) + 서버(dev_rules)
  // 필수(required) 서버 규칙은 로컬보다 우선, 권장(recommended)은 로컬 우선
  let skillsSection = '';
  try {
    const { PromptComposer } = require('../PromptComposer');
    const { text: agentRulesRaw, ruleKeys: localRuleKeys } = PromptComposer.loadAgentRulesWithKeys();
    const { text: serverRules, overrideKeys } = PromptComposer.loadServerPromptTemplates(localRuleKeys);

    // 서버 필수 규칙이 덮어쓴 로컬 규칙 제거
    let agentRules = agentRulesRaw;
    if (overrideKeys.size > 0 && agentRulesRaw) {
      for (const key of overrideKeys) {
        const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const sectionRegex = new RegExp(`\\*\\*[^*]*${escapedKey}[^*]*\\(강제 규칙\\):\\*\\*[\\s\\S]*?(?=\\n---\\n|$)`, 'gi');
        agentRules = agentRules.replace(sectionRegex, '').trim();
      }
      agentRules = agentRules.replace(/(\n---\n)+/g, '\n---\n').replace(/^\n---\n|\n---\n$/g, '').trim();
    }

    const parts = [agentRules, serverRules].filter(Boolean);
    if (parts.length > 0) {
      skillsSection = `\n\n## 프로젝트 개발 규칙\n아래 규칙을 반드시 준수하세요:\n\n${parts.join('\n\n')}`;
    }
  } catch { /* Skills 로드 실패 시 무시 */ }

  return `당신은 전문적인 소프트웨어 개발자이자 기술 전문가입니다.
${hotLoadPrompt}${attachedContextWarning}${selectedFilesSection}${terminalContextSection}${diagnosticsContextSection}${ragSection}${skillsSection}
주요 지침:
${gitContext}
${languageInstruction}`;
}
