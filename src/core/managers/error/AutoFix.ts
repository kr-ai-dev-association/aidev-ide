/**
 * AutoFix
 * 터미널/실행 오류에 대해 자동 수정 명령을 제안하고 실행하는 서비스
 *
 * 설계 원칙:
 * - core 레이어이므로 VS Code API, Webview, LlmService(웹뷰 브리지)에 직접 의존하지 않는다.
 * - ExecutionManager / TerminalManager / ErrorManager 와만 직접 통합한다.
 * - LLM 호출은 콜백(또는 어댑터 인터페이스)로 주입받아 사용한다.
 */

import { ParsedError } from './types';
import { ExecutionManager } from '../execution/ExecutionManager';
import { TerminalManager } from '../terminal/TerminalManager';

/**
 * 자동 수정 시 참고하는 명령/터미널 컨텍스트
 */
export interface AutoFixContext {
    lastCommand?: string;
    cwd?: string;
    terminalName?: string;
    retryCount?: number;
}

/**
 * LLM 기반 수정안 요청을 위한 최소 인터페이스
 * - core는 구체적인 LlmService 구현을 몰라도 되도록 추상화
 */
export type AutoFixLlmClient = (params: {
    error: ParsedError;
    context: AutoFixContext;
}) => Promise<{
    correctedCommand?: string | null;
} | null>;

export class AutoFix {
    private static instance: AutoFix;

    private executionManager: ExecutionManager;
    private terminalManager: TerminalManager;
    private llmClient?: AutoFixLlmClient;

    private maxRetries = 3;
    private globalRetryCount = 0;

    private constructor() {
        this.executionManager = ExecutionManager.getInstance();
        this.terminalManager = TerminalManager.getInstance();
    }

    public static getInstance(): AutoFix {
        if (!AutoFix.instance) {
            AutoFix.instance = new AutoFix();
        }
        return AutoFix.instance;
    }

    /**
     * 의존성 및 옵션을 설정합니다.
     * - 확장(또는 LlmService) 측에서 LLM 클라이언트를 주입해 사용합니다.
     */
    public configure(options: {
        llmClient?: AutoFixLlmClient;
        maxRetries?: number;
    }): void {
        if (options.llmClient) {
            this.llmClient = options.llmClient;
        }
        if (typeof options.maxRetries === 'number') {
            this.maxRetries = Math.max(1, Math.min(10, options.maxRetries));
        }
    }

    /**
     * 단일 ParsedError + 컨텍스트에 대해 자동 수정을 시도합니다.
     * - 휴리스틱(빠른 패턴 기반) → 실패 시 LLM 클라이언트 순으로 시도
     * - 성공 시 true, 더 이상 시도하지 않거나 실패 시 false
     */
    public async tryAutoFix(error: ParsedError, context: AutoFixContext = {}): Promise<boolean> {
        // 전역 재시도 한도 체크 (터미널 단위/세션 단위 상위 로직이 별도 관리할 수도 있음)
        if (this.globalRetryCount >= this.maxRetries * 2) {
            return false;
        }

        this.globalRetryCount++;

        // 1단계: 휴리스틱 기반 빠른 수정 (esbuild, ENOTEMPTY 등)
        const heuristic = await this.getHeuristicFix(error, context);
        if (heuristic) {
            await this.executeCorrectedCommand(heuristic, context);
            return true;
        }

        // 2단계: LLM 기반 수정 (주입된 클라이언트 사용)
        if (!this.llmClient) {
            // 아직 LLM 통합이 안 된 경우 false 반환 (상위 레이어에서 처리)
            return false;
        }

        try {
            const result = await this.llmClient({
                error,
                context
            });

            const corrected = result?.correctedCommand;
            if (!this.isValidCommand(corrected, context)) {
                return false;
            }

            await this.executeCorrectedCommand(corrected!.trim(), context);
            return true;
        } catch {
            // LLM 호출 실패는 자동 수정 실패로 취급
            return false;
        }
    }

    /**
     * 전역 재시도 카운터를 리셋합니다.
     * - 터미널 세션/명령 시퀀스가 새로 시작될 때 호출할 수 있습니다.
     */
    public resetGlobalRetryCount(): void {
        this.globalRetryCount = 0;
    }

    /**
     * 일부 유명 패턴에 대해서는 LLM을 거치지 않고 바로 수정 명령을 생성합니다.
     * - esbuild 바이너리 손상
     * - npm install 중 node_modules ENOTEMPTY
     */
    private async getHeuristicFix(error: ParsedError, context: AutoFixContext): Promise<string | null> {
        const output = error.rawOutput || '';
        const failedCommand = context.lastCommand || '';

        // ExecutionManager의 OS 어댑터 사용
        const osAdapter = this.executionManager.getOSAdapter();
        const isWindows = osAdapter.osType === 'win32';

        // esbuild 바이너리 손상 / 관련 오류
        if (
            (output.includes('esbuild') && output.includes('SyntaxError')) ||
            (output.includes('esbuild') && output.includes('Invalid or unexpected token')) ||
            (output.includes('node_modules/esbuild') && output.includes('command failed')) ||
            (output.includes('esbuild') && output.includes('spawn sh ENOENT')) ||
            (output.includes('esbuild') && output.toLowerCase().includes('enoent'))
        ) {
            const cmd = isWindows
                ? `rmdir /s /q node_modules\\esbuild 2>nul & npm cache clean --force & npm install`
                : `rm -rf node_modules/esbuild && npm cache clean --force && npm install`;
            return cmd;
        }

        // npm install 중 node_modules 관련 ENOTEMPTY 오류
        if (
            (output.includes('ENOTEMPTY') && output.includes('node_modules')) ||
            (output.includes('TAR_ENTRY_ERROR') && output.includes('ENOENT')) ||
            (output.includes('tar TAR_ENTRY_ERROR') && output.includes('ENOENT'))
        ) {
            if (failedCommand.includes('npm install') || failedCommand.includes('npm i')) {
                const cmd = isWindows
                    ? `rmdir /s /q node_modules 2>nul & npm cache clean --force & npm install`
                    : `rm -rf node_modules && npm cache clean --force && npm install`;
                return cmd;
            }
        }

        // ts-node-dev ESM 오류 → tsx로 대체 (type: module 유지)
        if (
            (output.includes('Must use import to load ES Module') || output.includes('Cannot use import statement')) &&
            (output.includes('ts-node-dev') || failedCommand.includes('ts-node-dev'))
        ) {
            let corrected = failedCommand.replace(/ts-node-dev/g, 'tsx').replace(/ts-node/g, 'tsx');
            // tsx 설치 여부는 상위에서 보장하거나, 실패 시 사용자가 수동 처리
            return corrected;
        }

        return null;
    }

    /**
     * 수정된 명령어를 실행합니다.
     * - 터미널 이름이 주어지면 VS Code 터미널 세션을 찾아 sendText
     * - 없으면 ExecutionManager를 통해 프로세스로 실행
     */
    private async executeCorrectedCommand(command: string, context: AutoFixContext): Promise<void> {
        const trimmed = command.trim();
        if (!trimmed) return;

        if (context.terminalName) {
            const session = this.terminalManager.findByName(context.terminalName);
            if (session) {
                const vscodeTerminal = session.getTerminal();
                vscodeTerminal.sendText(trimmed);
                return;
            }
        }

        await this.executionManager.executeCommand(trimmed, {
            cwd: context.cwd
        });
    }

    /**
     * LLM이 제안한 명령어에 대한 최소한의 검증
     * - 빈 문자열, 단순 토큰, 명백한 플레이스홀더, 각종 잘못된 형식 필터링
     * - PowerShell + cmd.exe && 관련 기본 규칙은 터미널 쪽 고급 검증에 위임
     */
    private isValidCommand(command: string | null | undefined, context: AutoFixContext): boolean {
        if (!command) return false;
        const t = command.trim();
        if (!t) return false;
        if (t === '\\') return false;
        if (t === '""' || t === "''") return false;

        // LLM이 자주 내놓는 플레이스홀더 필터링
        if (/[<>]/.test(t)) return false;
        if (/Your(Command|ActualCommand)(Here)?/i.test(t)) return false;

        // 코드블록 자체가 넘어온 경우
        if (/^```/.test(t)) return false;

        // 지나치게 짧은 명령은 무시
        if (t.length < 2) return false;

        return true;
    }
}


