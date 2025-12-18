/**
 * Execution Work 작업 타입 프롬프트 컴포넌트
 * execution_work 작업에 대한 특화 프롬프트
 */

export function getExecutionWorkPrompt(): string {
  return `**실행 작업 (execution_work) 특화 규칙:**
- 프로젝트의 설치, 빌드, 배포, 실행을 위한 스크립트(.sh, .bat, .ps1 등)를 생성하거나 터미널 명령을 실행해야 합니다.
- 소스 코드 파일을 생성/수정하지 마세요.
- 실행 명령은 한 줄 순수 명령만 코드블록/백틱에 제공합니다.
- 명령 내 주석(#, // 등)이나 설명 텍스트를 절대 넣지 마세요.

**매우 중요: 실행 계획을 만들지 마세요. 직접 명령어만 제공하세요.**
  * ❌ "실행 계획 (Step-by-Step)" 같은 형식으로 응답하지 마세요.
  * ❌ "아래 단계들을 차례대로 수행하세요" 같은 설명을 포함하지 마세요.
  * ❌ 플레이스홀더 경로(/path/to/your/sql, /home/banya/sql 등)를 사용하지 마세요.
  * ✅ 실제 파일 경로를 찾아서 사용하세요. 코드베이스 컨텍스트에서 파일 경로를 확인하세요.
  * ✅ 사용자가 요청한 명령어를 직접 실행할 수 있는 코드 블록만 제공하세요.

**중요: 사용자가 직접 명령어를 요청한 경우 (예: "psql로 실행해줘", "mvn spring-boot:run으로 실행해줘", "npm run dev 실행해줘")**:
  * 스크립트 파일(.sh, .bat, .ps1)을 생성하지 마세요.
  * chmod +x 같은 권한 설정 명령어를 포함하지 마세요.
  * 요청된 명령어를 직접 실행할 수 있는 코드 블록만 제공하세요.
  * 예시: 사용자가 "생성된 sql 파일 psql로 실행해줘"라고 요청하면:
    - 코드베이스 컨텍스트에서 실제 SQL 파일 경로를 찾으세요 (예: backend/db/setup.sql)
    - \`\`\`bash\npsql -U banya -d test -f backend/db/setup.sql\n\`\`\` 만 제공하세요.
  * 잘못된 예: 
    - "실행 계획" 형식으로 응답
    - \`\`\`bash\necho "mvn spring-boot:run" > run.sh\nchmod +x run.sh\n./run.sh\n\`\`\` (스크립트 생성 금지)
    - \`\`\`bash\ncd /path/to/your/sql\n\`\`\` (플레이스홀더 경로 사용 금지)
- 복잡한 빌드/배포 스크립트가 필요한 경우에만 스크립트 파일을 생성하세요.`;
}

