import * as os from 'os';
import * as path from 'path';
import { IOperatingSystemAdapter, OSDetectionResult } from './IOperatingSystemAdapter';

/**
 * macOS (Darwin) OS 어댑터
 */
export class DarwinAdapter implements IOperatingSystemAdapter {
    readonly osType = 'darwin' as const;
    readonly osName = 'macOS';

    // ==================== 터미널 관련 ====================

    getDefaultShell(): string {
        return process.env.SHELL || '/bin/zsh';
    }

    getShellType(): 'bash' | 'zsh' | 'powershell' | 'cmd' | 'sh' {
        const shell = this.getDefaultShell();
        if (shell.includes('zsh')) return 'zsh';
        if (shell.includes('bash')) return 'bash';
        return 'sh';
    }

    normalizeCommand(command: string): string {
        // macOS는 대부분 bash/zsh 명령어 그대로 사용
        return command;
    }

    getSetEnvCommand(key: string, value: string): string {
        return `export ${key}="${value}"`;
    }

    getAddPathCommand(path: string): string {
        return `export PATH="${path}:$PATH"`;
    }

    getKillProcessCommand(pid: number): string {
        return `kill -9 ${pid}`;
    }

    getFindProcessByPortCommand(port: number): string {
        return `lsof -ti:${port}`;
    }

    getFindNodeProcessByCwdCommand(cwd: string): string {
        return `lsof -a -d cwd -c node -F p | grep -E "^p[0-9]+" | sed 's/^p//'`;
    }

    getProcessCwdCommand(pid: number): string {
        return `lsof -a -p ${pid} -d cwd -Fn | grep -E "^n" | head -1 | sed 's/^n//'`;
    }

    getFindDevServerProcessCommand(cwd: string): string {
        return `ps aux | grep -E "(npm run dev|vite|next dev|nuxt dev)" | grep -v grep | awk '{print $2}' | xargs -I {} sh -c 'lsof -a -p {} -d cwd -Fn 2>/dev/null | grep -E "^n" | head -1 | sed "s/^n//" | grep -q "^${cwd}" && echo {}'`;
    }

    // ==================== 파일 처리 ====================

    getPathSeparator(): string {
        return '/';
    }

    normalizePath(filePath: string): string {
        return path.posix.normalize(filePath);
    }

    getExecutableExtension(): string {
        return '';
    }

    getChmodCommand(filePath: string, permissions: string): string {
        return `chmod ${permissions} "${filePath}"`;
    }

    // ==================== 명령어 처리 ====================

    getNpmCommand(): string {
        return 'npm';
    }

    getNpxCommand(): string {
        return 'npx';
    }

    getJavaCommand(): string {
        return 'java';
    }

    getMavenCommand(): string {
        // macOS에서는 mvnw가 있으면 우선 사용
        return './mvnw';
    }

    getGradleCommand(): string {
        // macOS에서는 gradlew가 있으면 우선 사용
        return './gradlew';
    }

    // ==================== API 호출 ====================

    getHttpClientOptions(): Record<string, any> {
        return {
            // macOS는 기본 설정 사용
        };
    }

    getTempDirectory(): string {
        return os.tmpdir();
    }

    getHomeDirectory(): string {
        return os.homedir();
    }

    // ==================== 프로세스 관리 ====================

    isInteractiveCommand(command: string): boolean {
        const interactivePatterns = [
            /^ssh\s/,
            /^sudo\s/,
            /npm\s+create/,
            /npx\s+create/,
            /yarn\s+create/,
            /git\s+clone.*--depth/,
        ];
        return interactivePatterns.some(pattern => pattern.test(command));
    }


    getShellExecutionOptions(): Record<string, any> {
        return {
            shell: this.getDefaultShell(),
            env: process.env,
        };
    }

    // ==================== 유틸리티 ====================

    static detect(): OSDetectionResult {
        const adapter = new DarwinAdapter();
        return {
            osType: 'darwin',
            osName: 'macOS',
            osVersion: os.release(),
            architecture: os.arch(),
            shellType: adapter.getShellType(),
            shellPath: adapter.getDefaultShell(),
        };
    }
}

