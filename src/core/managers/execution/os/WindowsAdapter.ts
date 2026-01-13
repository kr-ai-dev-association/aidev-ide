import * as os from 'os';
import * as path from 'path';
import { IOperatingSystemAdapter, OSDetectionResult } from './IOperatingSystemAdapter';

/**
 * Windows OS 어댑터
 */
export class WindowsAdapter implements IOperatingSystemAdapter {
    readonly osType = 'win32' as const;
    readonly osName = 'Windows';

    // ==================== 터미널 관련 ====================

    getDefaultShell(): string {
        // PowerShell Core > PowerShell > cmd 우선순위
        return process.env.SHELL ||
            'C:\\Program Files\\PowerShell\\7\\pwsh.exe' ||
            'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
    }

    getShellType(): 'bash' | 'zsh' | 'powershell' | 'cmd' | 'sh' {
        const shell = this.getDefaultShell();
        if (shell.includes('powershell') || shell.includes('pwsh')) return 'powershell';
        if (shell.includes('cmd')) return 'cmd';
        return 'powershell'; // 기본값
    }

    normalizeCommand(command: string): string {
        // Unix 스타일 명령어를 Windows 스타일로 변환
        let normalized = command;

        // chmod, chown 등은 Windows에서 지원하지 않음
        if (normalized.startsWith('chmod ')) {
            normalized = `# ${normalized} (Windows에서는 icacls 사용)`;
        }

        // ./ 실행을 Windows 스타일로 변환
        normalized = normalized.replace(/^\.\//, '.\\');

        return normalized;
    }

    getSetEnvCommand(key: string, value: string): string {
        if (this.getShellType() === 'powershell') {
            return `$env:${key}="${value}"`;
        } else {
            return `set ${key}=${value}`;
        }
    }

    getAddPathCommand(path: string): string {
        if (this.getShellType() === 'powershell') {
            return `$env:PATH="${path};$env:PATH"`;
        } else {
            return `set PATH=${path};%PATH%`;
        }
    }

    getKillProcessCommand(pid: number): string {
        return `taskkill /F /PID ${pid}`;
    }

    getFindProcessByPortCommand(port: number): string {
        return `netstat -ano | findstr :${port}`;
    }

    // ==================== 파일 처리 ====================

    getPathSeparator(): string {
        return '\\';
    }

    normalizePath(filePath: string): string {
        // Windows 경로로 정규화
        return path.win32.normalize(filePath);
    }

    getExecutableExtension(): string {
        return '.exe';
    }

    getChmodCommand(filePath: string, permissions: string): string {
        // Windows에서는 icacls 사용
        return `icacls "${filePath}" /grant Everyone:F`;
    }

    // ==================== 명령어 처리 ====================

    getNpmCommand(): string {
        return 'npm.cmd';
    }

    getNpxCommand(): string {
        return 'npx.cmd';
    }

    getJavaCommand(): string {
        return 'java.exe';
    }

    getMavenCommand(): string {
        return 'mvnw.cmd';
    }

    getGradleCommand(): string {
        return 'gradlew.bat';
    }

    // ==================== API 호출 ====================

    getHttpClientOptions(): Record<string, any> {
        return {
            // Windows 특화 옵션 (프록시 설정 등)
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
            windowsVerbatimArguments: true,
        };
    }

    // ==================== 유틸리티 ====================

    static detect(): OSDetectionResult {
        const adapter = new WindowsAdapter();
        return {
            osType: 'win32',
            osName: 'Windows',
            osVersion: os.release(),
            architecture: os.arch(),
            shellType: adapter.getShellType(),
            shellPath: adapter.getDefaultShell(),
        };
    }
}

