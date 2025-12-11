/**
 * Execution Work 작업 타입 프롬프트 컴포넌트
 * execution_work 작업에 대한 특화 프롬프트
 */

export function getExecutionWorkPrompt(): string {
  return `**실행 작업 (execution_work) 특화 규칙:**
- 설치/빌드/배포/실행 스크립트(.sh, .bat, .ps1) 생성 또는 터미널 명령 실행만 수행.
- 소스 코드 생성 금지.
- 실행 명령은 한 줄 순수 명령만 코드블록/백틱에 제공합니다.
- 명령 내 주석(#, // 등)이나 설명 텍스트를 절대 넣지 마세요.`;
}

