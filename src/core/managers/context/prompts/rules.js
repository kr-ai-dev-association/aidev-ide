/**
 * Rules Prompt Components
 * 규칙 프롬프트 컴포넌트 통합 파일
 */
import { getFileCreationContext } from "./base";
// ==================== Execution First Rule ====================
export function getExecutionFirstRulePrompt() {
    return (`\n\n⚠️ **실행 우선 작업 규칙 (중요)**\n\n` +
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
        "```\n\n");
}
/**
 * 자동 테스트 실패 시 오류 분석 및 수정 안내 프롬프트
 * 🔥 v9.2.2: 수정된 파일 내용을 포함하여 LLM이 최신 상태 기반으로 수정 가능
 * @param errorMessage 오류 메시지
 * @param modifiedFilesContext 이번 턴에 수정된 파일들의 최신 내용 (optional)
 */
export function getErrorRetryPrompt(errorMessage, modifiedFilesContext) {
    let prompt = `\n[System] ⚠️ **자동 테스트가 실패했습니다.**\n\n**오류 내용:**\n\`\`\`\n${errorMessage}\n\`\`\`\n\n`;
    // 🔥 수정된 파일의 최신 내용 포함 (코드 중복 방지)
    if (modifiedFilesContext && modifiedFilesContext.length > 0) {
        prompt += `**⚠️ 중요: 아래는 이번 턴에 수정된 파일들의 최신 내용입니다.**\n`;
        prompt += `**SEARCH 블록 작성 시 반드시 아래 내용을 기준으로 작성하세요.**\n\n`;
        for (const file of modifiedFilesContext) {
            const lines = file.content.split('\n');
            const preview = lines.slice(0, 150).join('\n'); // 최대 150줄
            const isTruncated = lines.length > 150;
            prompt += `**[${file.path}] 현재 내용:**\n\`\`\`\n${preview}${isTruncated ? '\n... (생략됨)' : ''}\n\`\`\`\n\n`;
        }
    }
    prompt +=
        `**중요: { "tool": "..." } 형식으로만 응답하세요**\n\n` +
            `**오류 유형별 수정 방법:**\n` +
            `- TypeScript 오류 ("Cannot find module", "Property does not exist") → update_file로 파일 수정\n` +
            `- 의존성 누락 ("Cannot find module 'xxx'") → run_command로 npm install\n` +
            `- 빌드 오류 ("Command failed") → 설정 파일 수정\n\n` +
            `**빌드/테스트 도구 설치 절대 금지:**\n` +
            `- "tsc not found", "gradle not found", "mvn not found" 등 빌드 도구가 없는 경우\n` +
            `- 절대 npm install -g typescript, brew install gradle 등 도구 설치 명령을 실행하지 마세요\n` +
            `- 대신 사용자에게 설치를 권유하는 메시지만 출력하세요\n` +
            `- 예: "TypeScript 컴파일러(tsc)가 설치되어 있지 않습니다. npm install -g typescript 로 설치해주세요."\n\n` +
            `**절대 금지:**\n` +
            `- 자연어 응답 (설명, 분석, "We need to..." 등)\n` +
            `- XML 태그 형식\n` +
            `- 빌드 도구 자동 설치 (tsc, gradle, mvn, cargo, go 등)\n\n` +
            `**필수 출력 형식:**\n` +
            "```\n" +
            `{ "tool": "update_file", "path": "..." }\n` +
            `<file_content>\n` +
            `<<<<<<< SEARCH\n` +
            `기존 코드 (위에 제공된 최신 파일 내용 기준)\n` +
            `=======\n` +
            `수정된 코드\n` +
            `>>>>>>> REPLACE\n` +
            `</file_content>\n` +
            "```\n\n" +
            `**지금 바로 도구 호출을 출력하세요. 자연어 텍스트는 무시됩니다.**\n`;
    return prompt;
}
export function getSimpleErrorRetryPrompt(errorMessage) {
    return (`\n[System] ⚠️ 자동 테스트가 실패했습니다. 다음 오류를 수정하세요:\n${errorMessage || "알 수 없는 오류"}\n\n${getFileCreationContext()}\n\n` +
        `**의존성 설치 (허용):** npm install, pip install -r requirements.txt 등 프로젝트 의존성 설치는 가능합니다.\n\n` +
        `**빌드/테스트 도구 설치 금지:**\n` +
        `- "tsc not found", "gradle not found" 등 빌드 도구가 없는 경우 자동 설치하지 마세요\n` +
        `- 대신 사용자에게 설치를 권유하세요 (예: "tsc가 없습니다. npm install -g typescript 로 설치해주세요.")\n`);
}
export function getTestRetryExceededMessage(maxTestFixAttempts, errorMessage) {
    return `⚠️ 테스트 수정 시도 횟수 초과 (${maxTestFixAttempts}회). 최종 오류:\n${errorMessage || "알 수 없는 오류"}`;
}
// ==================== Nudge Prompts ====================
/**
 * Investigation 단계에서 도구 호출 유도 nudge
 */
export function getInvestigationNudgePrompt() {
    return (`\n[System] ⚠️ **도구 호출 필수 - 자연어 응답 금지**\n\n` +
        `당신의 이전 응답이 자연어로 감지되어 무시되었습니다.\n` +
        `**반드시 아래 형식으로만 응답하세요.**\n\n` +
        `**조사 도구 호출 예시:**\n` +
        "```\n" +
        `{ "tool": "read_file", "path": "src/App.tsx" }\n` +
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
        `**지금 바로 도구 호출을 출력하세요.**`);
}
/**
 * Execution 단계에서 도구 호출 유도 nudge
 */
export function getExecutionNudgePrompt() {
    return (`\n[System] ⚠️ **도구 호출 필수 - 자연어 응답 금지**\n\n` +
        `당신의 이전 응답이 자연어로 감지되어 무시되었습니다.\n` +
        `**반드시 아래 형식으로만 응답하세요. 다른 텍스트는 절대 출력하지 마세요.**\n\n` +
        `**올바른 형식 예시:**\n` +
        "```\n" +
        `{ "tool": "read_file", "path": "src/App.tsx" }\n` +
        "```\n\n" +
        `**파일 생성 예시:**\n` +
        "```\n" +
        `{ "tool": "create_file", "path": "src/App.tsx" }\n` +
        `<file_content>\n` +
        `import React from 'react';\n` +
        `export default function App() { return <div>Hello</div>; }\n` +
        `</file_content>\n` +
        "```\n\n" +
        `**절대 금지:**\n` +
        `- "버튼이 추가되었습니다" 같은 설명\n` +
        `- XML 태그 형식\n` +
        `- 생각, 분석, 계획 텍스트\n\n` +
        `**지금 바로 도구 호출을 출력하세요. 다른 모든 텍스트는 무시됩니다.**`);
}
/**
 * EXECUTION phase에서 도구 호출 없이 plan만 다시 제출했을 때 강제 프롬프트
 * 파일 생성/수정 없이 완료 처리되는 것을 방지
 */
export function getExecutionNoToolCallWarningPrompt(planItemTitle) {
    return (`\n[System] ⚠️ **실행 도구 호출 필수 - plan 재제출 금지**\n\n` +
        `당신은 현재 실행(EXECUTION) 단계에 있습니다.\n` +
        `작업 "${planItemTitle}"을(를) 완료하려면 **반드시 파일 도구를 호출**해야 합니다.\n\n` +
        `**❌ 금지된 응답:**\n` +
        `- { "plan": [...] } ← plan은 이미 수립되었습니다. 다시 제출하지 마세요.\n` +
        `- 자연어 설명, 분석 텍스트\n\n` +
        `**✅ 필수 응답 형식:**\n` +
        `파일 생성:\n` +
        "```\n" +
        `{ "tool": "create_file", "path": "파일경로" }\n` +
        `<file_content>\n` +
        `파일 내용\n` +
        `</file_content>\n` +
        "```\n\n" +
        `파일 수정:\n` +
        "```\n" +
        `{ "tool": "update_file", "path": "파일경로" }\n` +
        `<file_content>\n` +
        `<<<<<<< SEARCH\n` +
        `기존 코드\n` +
        `=======\n` +
        `새 코드\n` +
        `>>>>>>> REPLACE\n` +
        `</file_content>\n` +
        "```\n\n" +
        `**지금 바로 create_file 또는 update_file 도구를 호출하세요.**`);
}
/**
 * 테스트 실패 시 수정 강제 프롬프트
 * EXECUTION 단계에서 테스트 실패 시 update_file 도구 사용을 강제
 */
export function getTestFailureFixPrompt(errorMessage) {
    return (`\n[System] ⚠️ **테스트 실패 - 즉시 코드 수정 필요**\n\n` +
        `**오류 내용:**\n\`\`\`\n${errorMessage}\n\`\`\`\n\n` +
        `**❌ 금지된 행동 (위반 시 재시도 실패):**\n` +
        `- read_file, list_files, search_files 등 조사 도구 호출 금지\n` +
        `- 자연어 설명, 분석 텍스트 출력 금지\n` +
        `- { "plan": [...] } 재제출 금지\n\n` +
        `**✅ 필수 행동:**\n` +
        `오류를 분석하고 **즉시 update_file 또는 create_file 도구로 코드를 수정**하세요.\n\n` +
        `**예시 (update_file로 오류 수정):**\n` +
        "```\n" +
        `{ "tool": "update_file", "path": "오류가_발생한_파일.tsx" }\n` +
        `<file_content>\n` +
        `<<<<<<< SEARCH\n` +
        `// 오류가 있는 기존 코드\n` +
        `=======\n` +
        `// 수정된 코드\n` +
        `>>>>>>> REPLACE\n` +
        `</file_content>\n` +
        "```\n\n" +
        `**지금 바로 update_file 도구로 오류를 수정하세요. 파일을 다시 읽지 마세요.**`);
}
/**
 * Investigation 텍스트만 출력 시 경고 메시지
 */
export function getInvestigationTextOnlyWarningPrompt() {
    return (`\n[System] ⚠️ 조사(Investigation) 단계에서는 텍스트 설명만 출력하는 것이 금지됩니다.\n` +
        `다음 중 하나를 수행하세요:\n` +
        `1. 조사 도구 호출: { "tool": "read_file", "path": "..." } 형식으로 정보를 수집하세요.\n` +
        `2. 계획 수립: 충분한 정보를 수집했다면 { "plan": [...] } JSON 형식으로 작업 계획을 수립하세요.\n\n` +
        `텍스트 설명만 출력하지 마세요. 반드시 도구를 호출하거나 계획을 제출해야 합니다.`);
}
/**
 * Investigation 단계에서 도구 실행 후 다음 턴 지시
 * 도구 결과를 받고 다음에 무엇을 해야 하는지 명확히 안내
 */
export function getInvestigationToolResultFollowupPrompt() {
    return (`\n[System] 도구 실행 결과를 받았습니다. 다음 단계를 진행하세요:\n\n` +
        `**필수 출력 형식 중 하나를 선택하세요:**\n` +
        `1. **추가 조사 필요**: { "tool": "read_file", "path": "..." } 또는 { "tool": "search_files", "pattern": "..." }\n` +
        `2. **조사 완료, 계획 수립**: { "plan": [{ "kind": "execution", "title": "...", "detail": "..." }] }\n\n` +
        `**절대 금지:** 자연어 설명, 분석 텍스트 출력\n` +
        `**반드시 위 JSON 형식 중 하나로만 응답하세요.**`);
}
// ==================== Output Contract Prompts ====================
/**
 * Investigation 단계 Output Contract 위반 시 메시지
 */
export function getInvestigationOutputContractViolationPrompt() {
    return (`\n[System] **조사(Investigation) 단계 Output Contract 위반**\n\n` +
        `조사 단계에서는 실행 도구(create_file, update_file, run_command)와 plan을 동시에 제출할 수 없습니다.\n\n` +
        `**허용되는 출력 형식:**\n` +
        `1. 조사 도구 사용: { "tool": "read_file", ... } (파일 수정 없이 조사만)\n` +
        `2. 계획 제출: { "plan": [...] } (실행 도구 없이)\n` +
        `3. 조사 도구와 plan 함께 사용 가능\n\n` +
        `**금지됨**: 실행 도구 + plan 동시 제출\n\n` +
        `다시 시도하세요. { "tool": "..." } 형식으로 응답하세요.`);
}
/**
 * Execution 단계 Output Contract 위반 시 메시지
 */
export function getExecutionOutputContractViolationPrompt() {
    return (`\n[System] ⚠️ **EXECUTION 단계 Output Contract 위반**\n\n` +
        `실행 단계에서는 계획 없이 실행 도구를 사용해야 합니다.\n` +
        `이미 승인된 계획이 있으므로 새 plan을 제출하지 마세요.\n` +
        `{ "tool": "..." } 형식으로 실행 도구를 호출하세요.`);
}
// ==================== FSM Violation Prompts ====================
/**
 * FSM 위반: Investigation 항목이 Execution 단계에 도달
 */
export function getFsmViolationInvestigationInExecutionPrompt(itemTitle) {
    return (`\n[System] ⚠️ **FSM 위반 감지**: 조사(Investigation) 항목 "${itemTitle}"이 실행(Execution) 단계에 도달했습니다.\n` +
        `조사 항목은 INVESTIGATION 단계에서 처리되어야 합니다. 이 항목을 건너뛰고 다음 실행 항목으로 진행합니다.\n` +
        `{ "tool": "..." } 형식으로 실행 도구를 호출하세요.`);
}
// ==================== File Operation Prompts ====================
/**
 * 코드 수정 작업 시 파일 도구 필요 경고
 */
export function getCodeModifyRequiresFileToolPrompt() {
    return `\n[System] ⚠️ 코드 수정 작업(code_modify)은 반드시 파일 생성/수정 도구(create_file, update_file)가 필요합니다. 조사(read_file)만으로는 작업이 완료되지 않습니다. 계획에 따라 파일을 생성하거나 수정하세요.\n`;
}
/**
 * 단계별 도구 사용 제한 경고
 */
export function getPhaseToolRestrictionPrompt(phase, blockedTools) {
    return `\n[System] ⚠️ ${phase} 단계에서는 ${blockedTools.join(", ")} 도구를 사용할 수 없습니다.\n`;
}
/**
 * create_file content 누락 경고
 */
export function getCreateFileContentMissingPrompt(warningText) {
    return `\n[System] ⚠️ create_file 사용 시 <file_content> 블록이 필수입니다. 다음 호출은 무시되었습니다:\n${warningText}\n\n올바른 형식:\n{ "tool": "create_file", "path": "..." }\n<file_content>\n파일 내용\n</file_content>\n`;
}
// ==================== Validation Prompts ====================
/**
 * 검증 명령어 추론용 프롬프트
 */
export function getValidationCommandInferencePrompt(projectType, workspaceRoot, fileList) {
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
export function getSimpleTestFailurePrompt(errorMessage) {
    return (`\n[System] ⚠️ **자동 테스트가 실패했습니다.**\n\n**오류 내용:**\n\`\`\`\n${errorMessage}\n\`\`\`\n\n` +
        `**⚠️ { "tool": "..." } 형식 필수 - 자연어 응답 금지**\n\n` +
        `오류를 수정하기 위해 도구 호출을 출력하세요.\n` +
        `- 파일 수정: { "tool": "update_file", "path": "..." } + <file_content> ... </file_content>\n` +
        `- 파일 생성: { "tool": "create_file", "path": "..." } + <file_content> ... </file_content>\n` +
        `- 명령어 실행: { "tool": "run_command", "command": "..." }\n\n` +
        `**지금 바로 도구 호출을 출력하세요.**\n`);
}
/**
 * EXECUTION 단계에서 LLM에 전달할 컨텍스트 프롬프트
 */
export function getExecutionPhaseContextPrompt(options) {
    const { currentTaskTitle, currentTaskDetail, projectInventoryContext, preloadedFilesContext, } = options;
    return (`\n\n[EXECUTION PHASE - ABSOLUTE RULES (NO EXCEPTIONS)]\n` +
        `CURRENT TASK: ${currentTaskTitle}` +
        (currentTaskDetail ? `\nDETAIL: ${currentTaskDetail}` : "") +
        projectInventoryContext +
        preloadedFilesContext +
        `\n\n** ABSOLUTELY FORBIDDEN (시스템이 자동으로 무시함):**\n` +
        `- NO thinking, reasoning, explanation, or meta-analysis\n` +
        `- NO "We need to...", "According to...", "Let's call...", "I should..."\n` +
        `- NO natural language text (except inside <file_content> blocks)\n` +
        `- NO project exploration (investigation is already complete)\n` +
        `- NO re-reading files already provided above\n` +
        `- NO plan creation (planning phase is over)\n` +
        `- NO XML tag format\n\n` +
        `**✅ REQUIRED OUTPUT FORMAT:**\n` +
        `- ONLY { "tool": "..." } format\n` +
        `- File content in <file_content> ... </file_content> blocks\n` +
        `- NO text before or after tool calls\n\n` +
        `**Example:**\n` +
        `{ "tool": "create_file", "path": "src/App.tsx" }\n` +
        `<file_content>\n` +
        `import React from 'react';\n` +
        `export default function App() { return <div>Hello</div>; }\n` +
        `</file_content>\n\n` +
        `**CRITICAL:** You are a DSL compiler, NOT a human assistant.\n` +
        `Any natural language text will be IGNORED by the system.\n\n` +
        `**파일 읽기 전략 (시스템이 자동 관리):**\n` +
        `- 위에 이미 제공된 파일 내용을 참고하세요 (다시 읽지 마세요)\n` +
        `- 새로 생성/수정할 파일만 필요시 읽으세요\n` +
        `- **다중 도구 호출 필수**: 필요한 모든 파일을 한 번에 처리하세요\n\n` +
        `이 계획 항목을 실행하기 위해 필요한 모든 도구 호출을 한 번에 즉시 제공하세요.`);
}
// ====================  Compact Rule ====================
/**
 * 압축용 간소화된 요약 프롬프트
 */
export function getCompactSummarizationPrompt() {
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
// ==================== Classified Error Retry Prompt ====================
/**
 * 구조적 에러 분류 기반 재시도 프롬프트
 * 키워드 매칭 없이 분류된 에러 그룹 + 근본 원인 분석을 LLM에 전달
 *
 * @param classification ErrorClassifier의 분류 결과
 * @param modifiedFilesContext 수정된 파일들의 최신 내용
 * @param escalation 동일 패턴 3회+ 반복 여부
 * @param samePatternCount 동일 패턴 반복 횟수
 */
export function buildClassifiedRetryPrompt(classification, modifiedFilesContext, escalation, samePatternCount) {
    let prompt = `\n[System] ⚠️ **자동 테스트가 실패했습니다.**\n\n`;
    // 섹션 1: 에러 분류 결과 (구조적 분석)
    prompt += `**에러 분류 결과:**\n`;
    prompt += `- 총 에러 수: ${classification.totalErrorCount}\n`;
    prompt += `- 주요 원인 유형: ${classification.dominantCategory}\n`;
    if (classification.environmentCheck.needsInstall) {
        prompt += `- ⚠️ 환경 문제: 의존성 디렉토리 누락 (자동 설치 시도됨)\n`;
    }
    prompt += `\n**에러 그룹:**\n`;
    for (const group of classification.groups.slice(0, 5)) {
        prompt += `\n### [${group.source}] 코드 ${group.representativeCode} (${group.count}건, ${group.affectedFiles.length}개 파일)\n`;
        prompt += `- 영향 파일: ${group.affectedFiles.slice(0, 5).join(', ')}${group.affectedFiles.length > 5 ? ` 외 ${group.affectedFiles.length - 5}개` : ''}\n`;
        if (group.rootCauseHypothesis) {
            prompt += `- 분석: ${group.rootCauseHypothesis}\n`;
        }
        prompt += `- 샘플:\n`;
        for (const msg of group.sampleMessages) {
            prompt += `  - ${msg}\n`;
        }
    }
    // 섹션 2: 에스컬레이션 경고 (동일 패턴 반복)
    if (escalation) {
        prompt += `\n**⚠️ 경고: 동일한 에러 패턴이 ${samePatternCount}회 반복되고 있습니다.**\n`;
        prompt += `이전과 **다른 접근 방식**을 시도하세요:\n`;
        prompt += `- 동일한 수정을 반복하지 마세요\n`;
        prompt += `- 에러의 근본 원인을 다시 분석하세요\n`;
        prompt += `- 의존성 문제라면 run_command로 패키지 설치를 시도하세요\n`;
        prompt += `- 타입/모듈 에러가 반복되면 import 경로나 설정 파일을 확인하세요\n`;
    }
    // 섹션 3: 수정된 파일 최신 내용 (항상 포함)
    if (modifiedFilesContext && modifiedFilesContext.length > 0) {
        prompt += `\n**⚠️ 중요: 아래는 수정된 파일들의 최신 내용입니다.**\n`;
        prompt += `**SEARCH 블록 작성 시 반드시 아래 내용을 기준으로 작성하세요.**\n\n`;
        for (const file of modifiedFilesContext) {
            const lines = file.content.split('\n');
            const preview = lines.slice(0, 150).join('\n');
            const isTruncated = lines.length > 150;
            prompt += `**[${file.path}] 현재 내용:**\n\`\`\`\n${preview}${isTruncated ? '\n... (생략됨)' : ''}\n\`\`\`\n\n`;
        }
    }
    // 섹션 4: 도구 호출 형식 지침
    prompt +=
        `**중요: { "tool": "..." } 형식으로만 응답하세요**\n\n` +
            `**사용 가능한 도구:**\n` +
            `- 파일 수정: { "tool": "update_file", "path": "..." }\n` +
            `- 파일 생성: { "tool": "create_file", "path": "..." }\n` +
            `- 명령어 실행: { "tool": "run_command", "command": "..." }\n\n` +
            `**빌드/테스트 도구 설치 절대 금지:**\n` +
            `- "tsc not found", "gradle not found" 등 빌드 도구가 없는 경우\n` +
            `- 절대 npm install -g typescript, brew install gradle 등 도구 설치 명령을 실행하지 마세요\n` +
            `- 대신 사용자에게 설치를 권유하는 메시지만 출력하세요\n\n` +
            `**절대 금지:**\n` +
            `- 자연어 응답 (설명, 분석, "We need to..." 등)\n` +
            `- XML 태그 형식\n\n` +
            `**지금 바로 도구 호출을 출력하세요. 자연어 텍스트는 무시됩니다.**\n`;
    return prompt;
}
//# sourceMappingURL=rules.js.map