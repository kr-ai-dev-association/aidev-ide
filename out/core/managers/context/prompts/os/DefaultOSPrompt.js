"use strict";
/**
 * Default OS 프롬프트 컴포넌트
 * 알 수 없는 OS 또는 일반 환경
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDefaultOSPrompt = getDefaultOSPrompt;
function getDefaultOSPrompt() {
    return `**일반 환경 가이드라인:**
- 플랫폼에 독립적인 명령어를 사용하세요.
- 파일 경로는 슬래시(/)를 사용하세요.
- 환경변수는 $VARIABLE_NAME 형식을 사용하세요.
- 터미널 명령어는 \`\`\`bash 코드 블록을 사용하세요.
- 포트 해제 및 프로세스 종료 명령어는 OS별로 다를 수 있으니 주의하세요.`;
}
//# sourceMappingURL=DefaultOSPrompt.js.map