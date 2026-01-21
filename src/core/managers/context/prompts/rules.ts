/**
 * Rules Prompt Components
 * 규칙 프롬프트 컴포넌트 통합 파일
 */

import { getFileCreationContext } from "./base";

// ==================== Execution First Rule ====================
export function getExecutionFirstRulePrompt(): string {
  return (
    `\n\n⚠️ **실행 우선 작업 규칙 (중요)**\n\n` +
    `**현재 작업은 실행 우선(execution-first) 작업입니다.** 사용자 요청은 파일 생성, 코드 수정, 프로젝트 초기화 등 실행 작업입니다.\n\n` +
    `**절대 금지:**\n` +
    `- ❌ "kind": "investigation" 항목을 plan에 포함하는 것\n` +
    `- ❌ 조사 작업을 계획에 추가하는 것\n` +
    `- ❌ "요구사항 확인", "파일 구조 조사" 같은 investigation item 추가\n\n` +
    `**필수 사항:**\n` +
    `- ✅ plan에는 "kind": "execution" 항목만 포함하세요\n` +
    `- ✅ 조사가 필요하면 시스템이 자동으로 처리합니다\n` +
    `- ✅ 바로 실행 계획("kind": "execution")만 제시하세요\n\n` +
    `**예시 (올바른 plan - JSON 형식):**\n` +
    "```json\n" +
    `{\n` +
    `  "plan": [\n` +
    `    {\n` +
    `      "kind": "execution",\n` +
    `      "title": "React TypeScript Vite 프로젝트 생성",\n` +
    `      "detail": "package.json, tsconfig.json, vite.config.ts, index.html, src/main.tsx, src/App.tsx 등을 생성합니다."\n` +
    `    }\n` +
    `  ]\n` +
    `}\n` +
    "```\n\n" +
    `**잘못된 예시 (절대 금지):**\n` +
    "```json\n" +
    `{\n` +
    `  "plan": [\n` +
    `    {\n` +
    `      "kind": "investigation",  // ❌ execution-first에서는 금지!\n` +
    `      "title": "요구사항 확인"\n` +
    `    },\n` +
    `    {\n` +
    `      "kind": "execution",\n` +
    `      "title": "프로젝트 생성"\n` +
    `    }\n` +
    `  ]\n` +
    `}\n` +
    "```\n\n"
  );
}

// ==================== Error Retry ====================

/**
 * 자동 테스트 실패 시 오류 분석 및 수정 안내 프롬프트
 */
export function getErrorRetryPrompt(errorMessage: string): string {
  return (
    `\n[System] ⚠️ **자동 테스트가 실패했습니다.**\n\n**오류 내용:**\n\`\`\`\n${errorMessage}\n\`\`\`\n\n` +
    `**🔥 중요: JSON Function Calling으로만 응답하세요**\n\n` +
    `**오류 유형별 수정 방법:**\n` +
    `- TypeScript 오류 ("Cannot find module", "Property does not exist") → update_file로 파일 수정\n` +
    `- 의존성 누락 ("Cannot find module 'xxx'") → run_command로 npm install\n` +
    `- 빌드 오류 ("Command failed") → 설정 파일 수정\n\n` +
    `**⚠️ 절대 금지:**\n` +
    `- 자연어 응답 (설명, 분석, "We need to..." 등)\n` +
    `- 같은 명령어 반복 실행\n\n` +
    `**✅ 필수 출력 형식 (JSON만 출력):**\n` +
    "```json\n" +
    `{ "function_call": { "name": "read_file", "args": { "path": "오류_파일_경로" } } }\n` +
    "```\n" +
    `또는:\n` +
    "```json\n" +
    `{ "function_call": { "name": "update_file", "args": { "path": "...", "diff": "..." } } }\n` +
    "```\n\n" +
    `**지금 바로 JSON function_call을 출력하세요. 자연어 텍스트는 무시됩니다.**\n`
  );
}

export function getSimpleErrorRetryPrompt(errorMessage: string): string {
  return (
    `\n[System] ⚠️ 자동 테스트가 실패했습니다. 다음 오류를 수정하세요:\n${errorMessage || "알 수 없는 오류"}\n\n${getFileCreationContext()}\n\n` +
    `필요하다면 run_command 도구를 사용하여 의존성을 설치하세요 (예: npm install, pip install -r requirements.txt, mvn install 등).\n`
  );
}

export function getTestRetryExceededMessage(
  maxTestFixAttempts: number,
  errorMessage: string,
): string {
  return `⚠️ 테스트 수정 시도 횟수 초과 (${maxTestFixAttempts}회). 최종 오류:\n${errorMessage || "알 수 없는 오류"}`;
}

// ==================== Nudge Prompts ====================

/**
 * Investigation 단계에서 도구 호출 유도 nudge
 */
export function getInvestigationNudgePrompt(): string {
  return (
    `\n[System] ⚠️ **JSON FUNCTION CALL REQUIRED - 자연어 응답 금지**\n\n` +
    `당신의 이전 응답이 자연어로 감지되어 무시되었습니다.\n` +
    `**반드시 아래 JSON 형식으로만 응답하세요.**\n\n` +
    `**조사 도구 호출 예시:**\n` +
    "```json\n" +
    `{\n` +
    `  "function_call": {\n` +
    `    "name": "read_file",\n` +
    `    "args": { "path": "src/App.tsx" }\n` +
    `  }\n` +
    `}\n` +
    "```\n\n" +
    `**계획 제출 예시:**\n` +
    "```json\n" +
    `{\n` +
    `  "plan": [\n` +
    `    { "kind": "execution", "title": "버튼 컴포넌트 추가", "detail": "src/App.tsx에 버튼 추가" }\n` +
    `  ]\n` +
    `}\n` +
    "```\n\n" +
    `**절대 금지:** 설명, 생각, 분석 텍스트 출력\n` +
    `**지금 바로 JSON을 출력하세요.**`
  );
}

/**
 * Execution 단계에서 도구 호출 유도 nudge
 */
export function getExecutionNudgePrompt(): string {
  return (
    `\n[System] ⚠️ **JSON FUNCTION CALL REQUIRED - 자연어 응답 금지**\n\n` +
    `당신의 이전 응답이 자연어로 감지되어 무시되었습니다.\n` +
    `**반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트는 절대 출력하지 마세요.**\n\n` +
    `**올바른 형식 예시:**\n` +
    "```json\n" +
    `{\n` +
    `  "function_call": {\n` +
    `    "name": "read_file",\n` +
    `    "args": { "path": "src/App.tsx" }\n` +
    `  }\n` +
    `}\n` +
    "```\n\n" +
    `**또는 여러 도구 호출:**\n` +
    "```json\n" +
    `{\n` +
    `  "function_calls": [\n` +
    `    { "name": "read_file", "args": { "path": "src/App.tsx" } },\n` +
    `    { "name": "list_files", "args": { "path": "src" } }\n` +
    `  ]\n` +
    `}\n` +
    "```\n\n" +
    `**절대 금지:**\n` +
    `- "버튼이 추가되었습니다" 같은 설명\n` +
    `- "해야 합니다", "하겠습니다" 같은 의도 표현\n` +
    `- 생각, 분석, 계획 텍스트\n\n` +
    `**지금 바로 JSON function_call을 출력하세요. JSON 외의 모든 텍스트는 무시됩니다.**`
  );
}

/**
 * Investigation 텍스트만 출력 시 경고 메시지
 */
export function getInvestigationTextOnlyWarningPrompt(): string {
  return (
    `\n[System] ⚠️ 조사(Investigation) 단계에서는 텍스트 설명만 출력하는 것이 금지됩니다.\n` +
    `다음 중 하나를 수행하세요:\n` +
    `1. 조사 도구 호출: JSON Function Calling으로 read_file, list_files, ripgrep_search를 호출하여 정보를 수집하세요.\n` +
    `2. 계획 수립: 충분한 정보를 수집했다면 { "plan": [...] } JSON 형식으로 작업 계획을 수립하세요.\n\n` +
    `텍스트 설명만 출력하지 마세요. 반드시 도구를 호출하거나 계획을 제출해야 합니다.`
  );
}

// ==================== Output Contract Prompts ====================

/**
 * Investigation 단계 Output Contract 위반 시 메시지
 */
export function getInvestigationOutputContractViolationPrompt(): string {
  return (
    `\n[System] **조사(Investigation) 단계 Output Contract 위반**\n\n` +
    `조사 단계에서는 실행 도구(create_file, update_file, run_command)와 plan을 동시에 제출할 수 없습니다.\n\n` +
    `**허용되는 출력 형식:**\n` +
    `1. 조사 도구 사용: read_file, list_files, search_files, ripgrep_search (파일 수정 없이 조사만)\n` +
    `2. 계획 제출: { "plan": [...] } (실행 도구 없이)\n` +
    `3. 조사 도구와 plan 함께 사용 가능\n\n` +
    `**금지됨**: 실행 도구 + plan 동시 제출\n\n` +
    `다시 시도하세요. 올바른 순서:\n` +
    `1. 먼저 조사 도구로 정보를 수집하세요 (선택사항)\n` +
    `2. 충분한 정보를 수집한 후 plan만 제출하세요 (실행 도구 없이)\n` +
    `3. 계획이 승인되면 실행 단계로 전환되어 실행 도구를 사용할 수 있습니다.\n\n` +
    `JSON Function Calling 형식으로 응답하세요.`
  );
}

/**
 * Execution 단계 Output Contract 위반 시 메시지
 */
export function getExecutionOutputContractViolationPrompt(): string {
  return (
    `\n[System] ⚠️ **EXECUTION 단계 Output Contract 위반**\n\n` +
    `실행 단계에서는 계획 없이 실행 도구를 사용해야 합니다.\n` +
    `이미 승인된 계획이 있으므로 새 plan을 제출하지 마세요.\n` +
    `JSON Function Calling 형식으로 실행 도구를 호출하세요.`
  );
}

// ==================== FSM Violation Prompts ====================

/**
 * FSM 위반: Investigation 항목이 Execution 단계에 도달
 */
export function getFsmViolationInvestigationInExecutionPrompt(
  itemTitle: string,
): string {
  return (
    `\n[System] ⚠️ **FSM 위반 감지**: 조사(Investigation) 항목 "${itemTitle}"이 실행(Execution) 단계에 도달했습니다.\n` +
    `조사 항목은 INVESTIGATION 단계에서 처리되어야 합니다. 이 항목을 건너뛰고 다음 실행 항목으로 진행합니다.\n` +
    `JSON Function Calling 형식으로 실행 도구를 호출하세요.`
  );
}

// ==================== File Operation Prompts ====================

/**
 * 코드 수정 작업 시 파일 도구 필요 경고
 */
export function getCodeModifyRequiresFileToolPrompt(): string {
  return `\n[System] ⚠️ 코드 수정 작업(code_modify)은 반드시 파일 생성/수정 도구(create_file, update_file)가 필요합니다. 조사(read_file)만으로는 작업이 완료되지 않습니다. 계획에 따라 파일을 생성하거나 수정하세요.\n`;
}

/**
 * 단계별 도구 사용 제한 경고
 */
export function getPhaseToolRestrictionPrompt(
  phase: string,
  blockedTools: string[],
): string {
  return `\n[System] ⚠️ ${phase} 단계에서는 ${blockedTools.join(", ")} 도구를 사용할 수 없습니다.\n`;
}

/**
 * create_file content 누락 경고
 */
export function getCreateFileContentMissingPrompt(warningText: string): string {
  return `\n[System] ⚠️ create_file 사용 시 content가 필수입니다. 다음 호출은 무시되었습니다:\n${warningText}\n\n{ "function_call": { "name": "create_file", "args": { "path": "...", "content": "..." } } } 형식을 사용하세요.\n`;
}

// ==================== Validation Prompts ====================

/**
 * 검증 명령어 추론용 프롬프트
 */
export function getValidationCommandInferencePrompt(
  projectType: string,
  workspaceRoot: string,
  fileList: string,
): string {
  return `다음 프로젝트에 대한 검증 명령어를 추론하세요.

프로젝트 타입: ${projectType}
프로젝트 루트: ${workspaceRoot}
생성/수정된 파일: ${fileList || "없음"}

규칙 기반으로 결정할 수 없는 검증 명령어를 추론해야 합니다.
프로젝트 타입과 파일 정보를 바탕으로 적절한 검증 명령어(컴파일, 빌드, 린트 등)를 제안하세요.

반드시 다음 JSON 형식으로만 응답하세요:
{ "command": "실행할 명령어", "description": "명령어 설명" }

예시:
{ "command": "npm run build", "description": "TypeScript 빌드" }
{ "command": "python -m py_compile main.py", "description": "Python 문법 검사" }`;
}

/**
 * 테스트 실패 시 간단한 오류 메시지
 */
export function getSimpleTestFailurePrompt(errorMessage: string): string {
  return (
    `\n[System] ⚠️ **자동 테스트가 실패했습니다.**\n\n**오류 내용:**\n\`\`\`\n${errorMessage}\n\`\`\`\n\n` +
    `**⚠️ JSON Function Calling 필수 - 자연어 응답 금지**\n\n` +
    `오류를 수정하기 위해 JSON function_call을 출력하세요.\n` +
    `- 파일 수정: update_file\n` +
    `- 파일 생성: create_file (파일이 없을 때만)\n` +
    `- 명령어 실행: run_command\n\n` +
    `**중요:** 이미 존재하는 파일은 create_file 대신 update_file을 사용하세요.\n\n` +
    `**지금 바로 JSON function_call을 출력하세요.**\n`
  );
}

// ==================== Execution Phase Context ====================

export interface ExecutionPhaseContextOptions {
  currentTaskTitle: string;
  currentTaskDetail?: string;
  projectInventoryContext: string;
  preloadedFilesContext: string;
}

/**
 * EXECUTION 단계에서 LLM에 전달할 컨텍스트 프롬프트
 */
export function getExecutionPhaseContextPrompt(
  options: ExecutionPhaseContextOptions,
): string {
  const {
    currentTaskTitle,
    currentTaskDetail,
    projectInventoryContext,
    preloadedFilesContext,
  } = options;

  return (
    `\n\n[EXECUTION PHASE - ABSOLUTE RULES (NO EXCEPTIONS)]\n` +
    `CURRENT TASK: ${currentTaskTitle}` +
    (currentTaskDetail ? `\nDETAIL: ${currentTaskDetail}` : "") +
    projectInventoryContext +
    preloadedFilesContext +
    `\n\n** ABSOLUTELY FORBIDDEN (시스템이 자동으로 무시함):**\n` +
    `- NO thinking, reasoning, explanation, or meta-analysis\n` +
    `- NO "We need to...", "According to...", "Let's call...", "I should..."\n` +
    `- NO natural language text (except inside tool parameters)\n` +
    `- NO project exploration (investigation is already complete)\n` +
    `- NO re-reading files already provided above\n` +
    `- NO plan creation (planning phase is over)\n\n` +
    `**✅ REQUIRED OUTPUT (ONLY THIS):**\n` +
    `- ONLY JSON Function Calling (create_file, update_file, run_command, etc.)\n` +
    `- NO text before or after function calls\n` +
    `- If no function call is required, output NOTHING (empty response)\n\n` +
    `**CRITICAL:** You are a DSL compiler, NOT a human assistant.\n` +
    `Any natural language text will be IGNORED by the system.\n` +
    `Only JSON function calls will be executed.\n\n` +
    `**파일 읽기 전략 (시스템이 자동 관리):**\n` +
    `- 위에 이미 제공된 파일 내용을 참고하세요 (다시 읽지 마세요)\n` +
    `- 새로 생성/수정할 파일만 필요시 읽으세요\n` +
    `- **다중 도구 호출 필수**: 필요한 모든 파일을 한 번에 처리하세요\n` +
    `  - 여러 function_calls를 동시에 출력 가능\n` +
    `  - 한 번에 최대한 많은 작업 수행\n` +
    `- **Read A + Update A 규칙**: 같은 파일을 읽고 수정하는 것은 시스템이 자동으로 턴을 나눕니다. LLM은 신경 쓰지 마세요.\n\n` +
    `이 계획 항목을 실행하기 위해 필요한 모든 JSON function_call을 한 번에 즉시 제공하세요.\n` +
    `설명 없이 function_call만 호출하세요.`
  );
}
// ====================  Compact Rule ====================
/**
 * 압축용 간소화된 요약 프롬프트
 */
export function getCompactSummarizationPrompt(): string {
  return `당신은 대화 요약 전문가입니다. 코드 어시스턴트의 대화를 간결하게 요약해주세요.

## 요약 형식:

### 사용자 요청
- 사용자가 요청한 주요 작업들

### 완료된 작업
- 완료된 파일 생성/수정 목록
- 실행된 명령어

### 핵심 컨텍스트
- 다음 작업에 필요한 중요 정보
- 프로젝트 구조, 기술 스택, 설정 등

### 대기 중인 작업
- 아직 완료되지 않은 작업

## 지침:
1. 핵심 정보만 포함하세요 (토큰 절약이 목적)
2. 코드는 포함하지 마세요 (파일명만 기록)
3. 한국어로 작성하세요
4. 다음 작업에 필수적인 컨텍스트만 유지하세요`;
}
