/**
 * Code Work 작업 타입 프롬프트 컴포넌트
 * code_work 작업에 대한 특화 프롬프트
 */

export function getCodeWorkPrompt(): string {
  return `**코드 작성 작업 (code_work) 특화 규칙:**
- 소스 코드 파일(.js, .ts, .py, .java, .go, .rs 등) 생성/수정/삭제만 수행.
- **절대로 쉘 스크립트(.sh, .bat, .ps1)나 빌드 스크립트를 생성하지 마세요.**
- **절대로 터미널 명령어 코드 블록을 생성하지 마세요.**
- 프로그래밍 언어의 소스 코드 파일만 작성하세요.

**⚠️ XML 툴 사용 (필수)**
- 파일 생성/수정/삭제/읽기/검색 등 모든 작업은 XML 툴 콜로 지시하세요. (마크다운 지시어 사용 금지)
- 예시:
  - \`<create_file><path>src/App.tsx</path><content>...</content></create_file>\`
  - \`<update_file><path>src/App.tsx</path><diff>...SEARCH/REPLACE...</diff></update_file>\`
- response 필드에만 XML을 넣고, thinking은 비워두세요.

**프로젝트 생성/파일 작업 주의**
- 프로젝트 파일을 만들 때도 반드시 XML 툴 콜로 전체 내용을 생성하세요.
- 스크립트/명령어로 파일을 만들거나, 터미널 명령을 포함한 코드블록을 만들지 마세요.
- 빌드/실행 명령은 별도 요청 시에만 처리합니다.`;
}

