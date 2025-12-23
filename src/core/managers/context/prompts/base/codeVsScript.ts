/**
 * Code vs Script 프롬프트 컴포넌트
 * 코드 작성 vs 쉘 스크립트 작업 구별 규칙
 */

export function getCodeVsScriptRules(): string {
    return `**코드 작성 vs 쉘 스크립트 작업 구별 (절대 필수 - 최우선 규칙):**
- **code_work**: 소스 코드 파일(.js, .ts, .py, .java, .go, .rs 등) 생성/수정만 수행.
  - **절대로 쉘 스크립트(.sh, .bat, .ps1)를 생성하지 마세요.**
  - **절대로 터미널 명령어 코드 블록을 생성하지 마세요.**
  - **프로젝트 생성 작업**: pom.xml, package.json, build.gradle 등 프로젝트 구조 파일과 소스 코드 파일만 생성. 빌드/실행 명령은 생성하지 마세요.
  - **프로젝트 생성 시 필수 (절대 금지 사항)**:
    * "프로젝트 만들기", "프로젝트 생성", "react 프로젝트", "vite 프로젝트", "spring boot 프로젝트", "java 프로젝트", "maven 프로젝트" 등 프로젝트 생성 요청 시:
      - **경고: 프로젝트 생성 요청은 반드시 파일 생성만 수행해야 합니다. **
      - **반드시 "새 파일: [파일경로]" 형식으로 모든 필요한 파일을 생성하세요. 이것은 선택 사항이 아닌 필수입니다.**
      - **모든 프로젝트 파일(pom.xml, build.gradle, package.json, src/main/java/.../*.java, src/main/resources/application.yml 등)을 "새 파일:" 지시어로 생성하세요.**
      - **터미널 명령어 코드 블록(\`\`\`bash)은 절대 생성하지 마세요. 이것은 심각한 오류입니다.**
      - **cat <<'EOF' > file 같은 heredoc 명령어는 절대 사용하지 마세요. 이것은 심각한 오류입니다.**
      - **mkdir, cat, echo 같은 파일 생성 명령어는 절대 사용하지 마세요. 이것은 심각한 오류입니다.**
      - **if ! command -v brew 같은 조건문이나 도구 설치 명령어는 절대 포함하지 마세요.**
      - **brew install, apt install 같은 패키지 매니저 명령어도 절대 포함하지 마세요.**
    * **올바른 형식 (반드시 이 형식을 사용하세요)**: 
      - "새 파일: pom.xml" + 코드 블록 (xml)
      - "새 파일: src/main/java/com/example/App.java" + 코드 블록 (java)
      - "새 파일: src/main/resources/application.yml" + 코드 블록 (yaml)
    * **잘못된 형식 (절대 사용 금지)**: 
      - \`\`\`bash\ncat <<'EOF' > pom.xml ... EOF\n\`\`\`
      - \`\`\`bash\nmkdir -p src/main/java\n\`\`\`
      - \`\`\`bash\nif ! command -v brew; then ... fi\n\`\`\`
- **execution_work**: 설치/빌드/배포/실행 스크립트(.sh, .bat, .ps1) 생성 또는 터미널 명령 실행만 수행. 소스 코드 생성 금지.
- **사용자 의도 컨텍스트의 taskType을 반드시 확인하고 그에 맞게 작업하세요.**

쉘 스크립트 규칙:
- 빌드/실행/테스트/배포 관련 작업일 때만 생성
- 일반 작업(파일 정리, 문서화 등)에는 생성하지 않음
- 스크립트 내 프로그래밍 코드는 언어명 callout 명시 (\`\`\`python, \`\`\`javascript 등)
- **중요: 사용자가 직접 명령어를 요청한 경우 (예: "mvn spring-boot:run으로 실행해줘", "npm run dev 실행해줘")**:
  - 스크립트 파일(.sh, .bat, .ps1)을 생성하지 마세요.
  - chmod +x 같은 권한 설정 명령어를 포함하지 마세요.
  - 요청된 명령어를 직접 실행할 수 있는 코드 블록만 제공하세요.
  - 예시: 사용자가 "mvn spring-boot:run으로 실행해줘"라고 요청하면 \`\`\`bash\nmvn spring-boot:run\n\`\`\` 만 제공하세요.
  - 잘못된 예: \`\`\`bash\necho "mvn spring-boot:run" > run.sh\nchmod +x run.sh\n./run.sh\n\`\`\` (스크립트 생성 금지)`;
}

