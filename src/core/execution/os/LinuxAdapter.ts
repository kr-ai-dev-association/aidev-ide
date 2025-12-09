import * as os from 'os';
import * as path from 'path';
import { IOperatingSystemAdapter, OSDetectionResult } from './IOperatingSystemAdapter';

/**
 * Linux OS 어댑터
 */
export class LinuxAdapter implements IOperatingSystemAdapter {
    readonly osType = 'linux' as const;
    readonly osName = 'Linux';

    // ==================== 터미널 관련 ====================

    getDefaultShell(): string {
        return process.env.SHELL || '/bin/bash';
    }

    getShellType(): 'bash' | 'zsh' | 'powershell' | 'cmd' | 'sh' {
        const shell = this.getDefaultShell();
        if (shell.includes('zsh')) return 'zsh';
        if (shell.includes('bash')) return 'bash';
        return 'sh';
    }

    normalizeCommand(command: string): string {
        // Linux는 대부분 bash 명령어 그대로 사용
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
        return `lsof -ti:${port} || fuser ${port}/tcp 2>/dev/null`;
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
        return './mvnw';
    }

    getGradleCommand(): string {
        return './gradlew';
    }

    // ==================== API 호출 ====================

    getHttpClientOptions(): Record<string, any> {
        return {
            // Linux 기본 설정
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
            /apt\s+install/,
            /apt-get\s+install/,
            /yum\s+install/,
        ];
        return interactivePatterns.some(pattern => pattern.test(command));
    }

    isLongRunningCommand(command: string): boolean {
        const longRunningPatterns = [
            /npm\s+run\s+dev/,
            /npm\s+start/,
            /yarn\s+dev/,
            /yarn\s+start/,
            /vite/,
            /webpack.*serve/,
            /ng\s+serve/,
            /\.\/mvnw\s+spring-boot:run/,
            /\.\/gradlew\s+bootRun/,
            /docker\s+run/,
        ];
        return longRunningPatterns.some(pattern => pattern.test(command));
    }

    getShellExecutionOptions(): Record<string, any> {
        return {
            shell: this.getDefaultShell(),
            env: process.env,
        };
    }

    // ==================== 유틸리티 ====================

    static detect(): OSDetectionResult {
        const adapter = new LinuxAdapter();
        return {
            osType: 'linux',
            osName: 'Linux',
            osVersion: os.release(),
            architecture: os.arch(),
            shellType: adapter.getShellType(),
            shellPath: adapter.getDefaultShell(),
        };
    }
}

