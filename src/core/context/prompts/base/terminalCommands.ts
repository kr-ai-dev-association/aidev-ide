/**
 * Terminal Commands 프롬프트 컴포넌트
 * 터미널 명령 출력 규칙
 */

export function getTerminalCommandRules(): string {
    return `실행 의도/터미널 명령 출력 규칙 (중요):
- 실행 명령은 한 줄 순수 명령만 코드블록/백틱에 제공합니다. **명령 내 주석(#, // 등)이나 설명 텍스트를 절대 넣지 마세요.** echo/if/elif/else/플레이스홀더 경로 금지.
- 최대 4개 이하 명령만 반환하세요.
- 버전 확인은 1회만(예: node -v && npm -v).
- package.json이 없을 때만 init 명령을 포함합니다.
- 설치는 lock 존재 시 npm ci / yarn install --frozen-lockfile / pnpm install --frozen-lockfile 중 하나만, 없으면 npm/yarn/pnpm install 중 하나만(중복 금지).
- npm audit/list/outdated 등 추가 진단 명령은 포함하지 마세요.
- 프레임워크/프로젝트 타입에 맞는 실행 명령을 한 줄만 제시하세요(예: react/vite/next → npm run dev, nest → npm run start:dev 등).`;
}

/**
 * Command Execution 가이드
 * 명령 생성 지침
 */
export function getCommandExecutionGuide(): string {
    return `명령 생성 지침:
- 사용자의 OS와 셸 타입에 맞는 문법 사용 (macOS/Linux: bash, Windows: PowerShell/CMD)
- 안전하고 비파괴적인 명령만 제시
- 각 명령이 수행하는 작업을 간단히 설명
- 명령은 한 줄로만 작성하고, 주석(#, // 등)이나 설명 텍스트는 포함하지 않음`;
}

/**
 * Shell별 프롬프트 생성 헬퍼
 */
export function buildShellSpecificPrompt(shellType: string): string {
    const shellGuides: Record<string, string> = {
        bash: '```bash\n# Bash 명령어 예시\ncommand --option value\n```',
        zsh: '```zsh\n# Zsh 명령어 예시\ncommand --option value\n```',
        powershell: '```powershell\n# PowerShell 명령어 예시\nCommand-Verb -Parameter Value\n```',
        cmd: '```cmd\n# CMD 명령어 예시\ncommand /option value\n```',
    };

    return `명령어는 **${shellType}** 문법으로 작성하세요.\n\n예시:\n${shellGuides[shellType] || shellGuides.bash}`;
}

