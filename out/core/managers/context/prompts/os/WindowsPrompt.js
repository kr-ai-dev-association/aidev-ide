"use strict";
/**
 * Windows OS 프롬프트 컴포넌트
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWindowsPrompt = getWindowsPrompt;
function getWindowsPrompt() {
    return `**Windows 환경 특화 가이드라인:**
- PowerShell 또는 Command Prompt 명령어를 사용하세요.
- 파일 경로는 백슬래시(\\) 또는 슬래시(/) 모두 사용 가능합니다.
- 환경변수는 %VARIABLE_NAME% 형식을 사용하세요.
- 터미널 명령어는 \`\`\`cmd 또는 \`\`\`powershell 코드 블록을 사용하세요.
- 포트 해제: netstat -ano | findstr :포트번호, taskkill /PID 프로세스ID /F
- 프로세스 종료: taskkill /IM 프로세스명 /F
- 서비스 관리: net start/stop 서비스명
- 권한 문제 시 관리자 권한으로 실행하도록 안내하세요.`;
}
//# sourceMappingURL=WindowsPrompt.js.map