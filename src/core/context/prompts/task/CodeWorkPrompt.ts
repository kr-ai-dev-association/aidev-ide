/**
 * Code Work 작업 타입 프롬프트 컴포넌트
 * code_work 작업에 대한 특화 프롬프트
 */

export function getCodeWorkPrompt(): string {
  return `**코드 작성 작업 (code_work) 특화 규칙:**
- 소스 코드 파일(.js, .ts, .py, .java, .go, .rs 등) 생성/수정만 수행.
- 절대로 쉘 스크립트(.sh, .bat, .ps1)를 생성하지 마세요.
- 절대로 터미널 명령어 코드 블록을 생성하지 마세요.
- 프로젝트 생성 작업: pom.xml, package.json, build.gradle 등 프로젝트 구조 파일과 소스 코드 파일만 생성. 빌드/실행 명령은 생성하지 마세요.`;
}

