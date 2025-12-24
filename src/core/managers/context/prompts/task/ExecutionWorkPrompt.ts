/**
 * Execution Work 작업 타입 프롬프트 컴포넌트
 * execution_work 작업에 대한 특화 프롬프트
 */

export function getExecutionWorkPrompt(): string {
  return `**실행 작업 (execution_work) 특화 규칙:**

**⚠️ 매우 중요: execution_work에서도 반드시 XML 도구 호출을 사용해야 합니다!**
- **절대로 마크다운 코드 블록(\\\`\\\`\\\`bash)을 사용하지 마세요.**
- **절대로 텍스트 설명만 제공하지 마세요.**
- **반드시 run_command XML 도구를 호출해야 합니다.**
- **파일을 찾아야 하는 경우에도 먼저 search_files 또는 list_files XML 도구를 사용한 후 run_command XML 도구를 사용하세요.**
- **어떤 경우에도 마크다운 코드 블록을 사용하지 마세요. XML 도구 호출만 사용하세요.**

** 실행 작업 규칙:**
    - 프로젝트의 설치, 빌드, 배포, 실행을 위한 터미널 명령을 실행합니다.
- 소스 코드 파일을 생성/수정하지 마세요 (code_work가 아닙니다).
- 실행 계획을 만들지 마세요. 직접 run_command XML 도구를 호출하세요.

** 올바른 형식:**
모든 명령 실행 요청은 반드시 run_command XML 도구를 사용하세요:

\`\`\`xml
<run_command>
<command>실행할 명령어</command>
</run_command>
\`\`\`

** 파일을 찾아야 하는 경우:**
필요한 파일을 찾아야 한다면 먼저 search_files 또는 list_files XML 도구를 사용한 후 run_command를 사용하세요:

\`\`\`xml
<search_files>
<path>.</path>
<pattern>파일패턴</pattern>
</search_files>
<run_command>
<command>찾은 파일을 사용한 명령어</command>
</run_command>
\`\`\`

          ** 절대 하지 말아야 할 것:**
            - ❌ \`\`\`bash\npsql -U banya -d test -f backend/seed.sql\n\`\`\` (마크다운 코드 블록 사용 금지)
- ❌ "실행 계획 (Step-by-Step)" 형식으로 응답
- ❌ 스크립트 파일(.sh, .bat, .ps1) 생성 (단순 명령 실행은 스크립트 파일 불필요)
- ❌ 플레이스홀더 경로(/path/to/your/sql 등) 사용
- ❌ thinking 필드에만 도구 호출 넣기 (반드시 response 필드에 넣어야 함)

**중요:**
- **thinking 필드는 비워두고**, 모든 XML 도구 호출을 **response 필드에 넣으세요**.
- **response 필드를 비워두면 실패합니다.**
- **execution_work 작업도 code_work와 동일하게 XML 도구 호출을 사용합니다.**
- **마크다운 코드 블록은 어떤 경우에도 사용하지 마세요.**`;
}

