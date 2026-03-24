/**
 * Plan Mode Prompt
 * 코드베이스 탐색 후 구현 계획(Markdown)을 생성하는 읽기 전용 모드
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
    ? `\n## 첨부된 파일\n${selectedFilesContent}\n`
    : "";

  const terminalContextSection = terminalContextContent
    ? `\n## 터미널 출력\n\`\`\`\n${terminalContextContent}\n\`\`\`\n`
    : "";

  const diagnosticsContextSection = diagnosticsContextContent
    ? `\n## Diagnostics\n${diagnosticsContextContent}\n`
    : "";

  const ragSection = ragContext
    ? `\n## 참고 문서 (RAG)\n${ragContext}\n`
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
        const sectionRegex = new RegExp(`\\*\\*[^*]*${escapedKey}[^*]*\\(강제 규칙\\):\\*\\*[\\s\\S]*?(?=\\n---\\n|$)`, 'gi');
        agentRules = agentRules.replace(sectionRegex, '').trim();
      }
      agentRules = agentRules.replace(/(\n---\n)+/g, '\n---\n').replace(/^\n---\n|\n---\n$/g, '').trim();
    }

    const parts = [agentRules, serverRules].filter(Boolean);
    if (parts.length > 0) {
      skillsSection = `\n\n## 프로젝트 개발 규칙\n${parts.join('\n\n')}`;
    }
  } catch { /* Skills 로드 실패 시 무시 */ }

  return `당신은 숙련된 소프트웨어 아키텍트입니다. 현재 **PLAN 모드**로 동작합니다.
${hotLoadPrompt}
## PLAN 모드 규칙

**허용된 도구 (읽기 전용):**
- read_file, glob_search, ripgrep_search, stat_file, list_files

**절대 금지:**
- ❌ create_file, update_file, delete_file — 파일 수정/생성/삭제 불가
- ❌ run_command — 명령 실행 불가
- ❌ 코드 직접 작성 및 적용

**역할:**
1. 도구를 사용해 코드베이스를 충분히 탐색한다
2. 탐색이 완료되면 아래 형식의 구현 계획 Markdown을 출력한다
3. 계획 출력 후 즉시 종료한다 (추가 도구 호출 금지)

## 계획 출력 형식

탐색 완료 후 반드시 아래 형식으로 계획을 출력하세요:

\`\`\`markdown
# 구현 계획: [요청 요약]

## 개요
[1-3문장으로 변경의 목적과 범위를 설명]

## 분석 결과
[탐색에서 발견한 핵심 사실 — 파일 경로, 함수명, 줄 번호 등 구체적 수치 포함]

## 변경 대상 파일
| 파일 | 변경 유형 | 내용 |
|------|-----------|------|
| src/foo/bar.ts | 수정 | ... |

## 구현 단계
1. **[단계명]**: [구체적 작업 설명]
   - 파일: \`path/to/file.ts\`
   - 변경: [무엇을 어떻게]
2. ...

## 주의사항 / 리스크
- [잠재적 부작용, 테스트 필요 사항, 의존성 등]

## 예상 소요
- 난이도: [낮음/보통/높음]
- 변경 파일 수: N개
\`\`\`
${selectedFilesSection}${terminalContextSection}${diagnosticsContextSection}${ragSection}${skillsSection}
${gitContext}
${languageInstruction}`;
}
