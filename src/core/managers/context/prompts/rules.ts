/**
 * Rules Prompt Components
 * 규칙 프롬프트 컴포넌트 통합 파일
 */

import { getFileCreationContext } from './base';

// ==================== Execution First Rule ====================
export function getExecutionFirstRulePrompt(): string {
    return `\n\n⚠️ **실행 우선 작업 규칙 (중요)**\n\n` +
        `**현재 작업은 실행 우선(execution-first) 작업입니다.** 사용자 요청은 파일 생성, 코드 수정, 프로젝트 초기화 등 실행 작업입니다.\n\n` +
        `**절대 금지:**\n` +
        `- ❌ <kind>investigation</kind> 항목을 plan에 포함하는 것\n` +
        `- ❌ 조사 작업을 계획에 추가하는 것\n` +
        `- ❌ "요구사항 확인", "파일 구조 조사" 같은 investigation item 추가\n\n` +
        `**필수 사항:**\n` +
        `- ✅ <plan> 태그에는 <kind>execution</kind> 항목만 포함하세요\n` +
        `- ✅ 조사가 필요하면 시스템이 자동으로 처리합니다\n` +
        `- ✅ 바로 실행 계획(<kind>execution</kind>)만 제시하세요\n\n` +
        `**예시 (올바른 plan):**\n` +
        `<plan>\n` +
        `  <item>\n` +
        `    <kind>execution</kind>\n` +
        `    <title>React TypeScript Vite 프로젝트 생성</title>\n` +
        `    <detail>package.json, tsconfig.json, vite.config.ts, index.html, src/main.tsx, src/App.tsx 등을 생성합니다.</detail>\n` +
        `  </item>\n` +
        `</plan>\n\n` +
        `**잘못된 예시 (절대 금지):**\n` +
        `<plan>\n` +
        `  <item>\n` +
        `    <kind>investigation</kind>  ← ❌ execution-first에서는 금지!\n` +
        `    <title>요구사항 확인</title>\n` +
        `  </item>\n` +
        `  <item>\n` +
        `    <kind>execution</kind>\n` +
        `    <title>프로젝트 생성</title>\n` +
        `  </item>\n` +
        `</plan>\n\n`;
}

// ==================== Error Retry ====================
export interface ErrorRetryPromptOptions {
    errorMessage: string;
    testFixAttempts: number;
    maxTestFixAttempts: number;
}

export function getErrorRetryPrompt(options: ErrorRetryPromptOptions): string {
    const { errorMessage, testFixAttempts, maxTestFixAttempts } = options;
    
    return `\n[System] ⚠️ **자동 테스트가 실패했습니다.**\n\n**오류 내용:**\n${errorMessage}\n\n**⚠️ 중요: 오류를 먼저 분석하세요**\n` +
        `1. **오류 유형 파악**: TypeScript 컴파일 오류인가? 의존성 누락인가? 런타임 오류인가?\n` +
        `2. **오류 원인 분석**:\n` +
        `   - TypeScript 오류 (예: "Cannot find module", "Property does not exist") → 파일 수정 필요, npm install로 해결 안 됨\n` +
        `   - 의존성 오류 (예: "Cannot find module 'xxx'", "Module not found") → npm install 필요\n` +
        `   - 빌드 오류 (예: "Command failed", "Build failed") → 빌드 설정 또는 코드 오류 확인\n` +
        `3. **적절한 조치 선택**:\n` +
        `   - TypeScript/컴파일 오류 → <update_file>로 파일 수정\n` +
        `   - 의존성 누락 → <run_command>로 npm install (단, 이미 실행했다면 다른 원인 확인)\n` +
        `   - 빌드 설정 오류 → 설정 파일 수정\n\n` +
        `${getFileCreationContext()}\n\n` +
        `**절대 하지 말 것**:\n` +
        `- 오류 분석 없이 무작정 npm install 실행 (이미 실행했다면 효과 없음)\n` +
        `- 같은 명령어 반복 실행 (중복 실행 방지됨)\n\n` +
        `필요하다면 run_command 도구를 사용하여 의존성을 설치하세요 (예: npm install, pip install -r requirements.txt, mvn install 등).\n\n` +
        `오류를 분석한 후 적절한 수정을 수행하세요.\n`;
}

export function getSimpleErrorRetryPrompt(errorMessage: string): string {
    return `\n[System] ⚠️ 자동 테스트가 실패했습니다. 다음 오류를 수정하세요:\n${errorMessage || '알 수 없는 오류'}\n\n${getFileCreationContext()}\n\n` +
        `필요하다면 run_command 도구를 사용하여 의존성을 설치하세요 (예: npm install, pip install -r requirements.txt, mvn install 등).\n`;
}

export function getTestRetryExceededMessage(maxTestFixAttempts: number, errorMessage: string): string {
    return `⚠️ 테스트 수정 시도 횟수 초과 (${maxTestFixAttempts}회). 최종 오류:\n${errorMessage || '알 수 없는 오류'}`;
}
