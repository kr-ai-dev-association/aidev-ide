/**
 * OS별 프롬프트 레지스트리
 *
 * 기존 os/ 디렉토리의 4개 파일을 하나의 레지스트리로 통합.
 * 새 OS 추가 시 osPromptRegistry에 엔트리만 추가하면 됨.
 */

const osPromptRegistry: Record<string, string> = {
  windows: `**Windows 환경 특화 가이드라인:**
- PowerShell 또는 Command Prompt 명령어를 사용하세요.
- 파일 경로는 백슬래시(\\) 또는 슬래시(/) 모두 사용 가능합니다.
- 환경변수는 %VARIABLE_NAME% 형식을 사용하세요.
- 터미널 명령어는 run_command 도구를 사용하세요.
- 포트 해제: netstat -ano | findstr :포트번호, taskkill /PID 프로세스ID /F
- 프로세스 종료: taskkill /IM 프로세스명 /F
- 서비스 관리: net start/stop 서비스명
- 권한 문제 시 관리자 권한으로 실행하도록 안내하세요.`,

  macos: `**macOS 환경 특화 가이드라인:**
- Bash/Zsh 쉘 명령어를 사용하세요.
- 파일 경로는 슬래시(/)를 사용하세요.
- 환경변수는 $VARIABLE_NAME 형식을 사용하세요.
- 터미널 명령어는 run_command 도구를 사용하세요.
- 포트 해제: lsof -ti:포트번호 | xargs kill -9
- 프로세스 종료: pkill -f "프로세스명"
- Homebrew 패키지 관리자 사용을 권장하세요.
- 권한 문제 시 sudo 명령어 사용을 안내하세요.
- **중요: 쉘 스크립트 생성 조건 및 규칙:**
  - 쉘 스크립트는 **프로젝트 빌드, 실행, 테스트, 배포**와 직접 관련된 작업일 때만 생성하세요.
  - 프로젝트 빌드/실행과 무관한 작업에는 절대 쉘 스크립트를 생성하지 마세요.
  - 쉘 스크립트 내에 프로그래밍 언어 코드(Python, Node.js, Java 등)가 필요한 경우:
    * 반드시 해당 언어명 callout을 사용하세요 (예: \`\`\`python, \`\`\`javascript)
    * "새 파일: [파일경로]" 형식으로 파일 생성 가이드를 따르세요
  - 복잡한 bash 스크립트(함수 정의, 여러 줄 변수, if/for/while 루프 포함)는 반드시 .sh 파일로 생성하고, 생성 후 \`chmod +x 스크립트.sh && ./스크립트.sh\` 형식으로 실행하세요.
  - 단순한 한 줄 명령어만 코드 블록에 직접 작성하세요 (예: \`mvn clean package\`, \`npm install\` 등).`,

  linux: `**Linux 환경 특화 가이드라인:**
- Bash 쉘 명령어를 사용하세요.
- 파일 경로는 슬래시(/)를 사용하세요.
- 환경변수는 $VARIABLE_NAME 형식을 사용하세요.
- 터미널 명령어는 run_command 도구를 사용하세요.
- 포트 해제: lsof -ti:포트번호 | xargs kill -9 또는 fuser -k 포트번호/tcp
- 프로세스 종료: pkill -f "프로세스명" 또는 killall 프로세스명
- 패키지 관리자: apt (Ubuntu/Debian), yum/dnf (RHEL/CentOS), pacman (Arch)
- 권한 문제 시 sudo 명령어 사용을 안내하세요.
- **중요: 쉘 스크립트 생성 조건 및 규칙:**
  - 쉘 스크립트는 **프로젝트 빌드, 실행, 테스트, 배포**와 직접 관련된 작업일 때만 생성하세요.
  - 프로젝트 빌드/실행과 무관한 작업에는 절대 쉘 스크립트를 생성하지 마세요.
  - 쉘 스크립트 내에 프로그래밍 언어 코드(Python, Node.js, Java 등)가 필요한 경우:
    * 반드시 해당 언어명 callout을 사용하세요 (예: \`\`\`python, \`\`\`javascript)
    * "새 파일: [파일경로]" 형식으로 파일 생성 가이드를 따르세요
  - 복잡한 bash 스크립트(함수 정의, 여러 줄 변수, if/for/while 루프 포함)는 반드시 .sh 파일로 생성하고, 생성 후 \`chmod +x 스크립트.sh && ./스크립트.sh\` 형식으로 실행하세요.
  - 단순한 한 줄 명령어만 코드 블록에 직접 작성하세요 (예: \`mvn clean package\`, \`npm install\` 등).`,

  default: `**일반 환경 가이드라인:**
- 플랫폼에 독립적인 명령어를 사용하세요.
- 파일 경로는 슬래시(/)를 사용하세요.
- 환경변수는 $VARIABLE_NAME 형식을 사용하세요.
- 터미널 명령어는 run_command 도구를 사용하세요.
- 포트 해제 및 프로세스 종료 명령어는 OS별로 다를 수 있으니 주의하세요.`,
};

/**
 * OS 문자열에서 해당하는 프롬프트를 반환합니다.
 * @param userOS - 사용자 OS 문자열 (예: "macOS", "Windows", "Linux")
 */
export function getOSPrompt(userOS: string): string {
  const osLower = userOS.toLowerCase();
  if (osLower.includes('windows')) return osPromptRegistry.windows;
  if (osLower.includes('mac') || osLower.includes('darwin')) return osPromptRegistry.macos;
  if (osLower.includes('linux')) return osPromptRegistry.linux;
  return osPromptRegistry.default;
}

// 하위 호환: 기존 개별 함수 export
export const getWindowsPrompt = () => osPromptRegistry.windows;
export const getMacOSPrompt = () => osPromptRegistry.macos;
export const getLinuxPrompt = () => osPromptRegistry.linux;
export const getDefaultOSPrompt = () => osPromptRegistry.default;
