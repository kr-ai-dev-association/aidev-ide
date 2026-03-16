import * as os from 'os';
import * as fs from 'fs';
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
        // 환경변수 우선
        if (process.env.SHELL) return process.env.SHELL;
        // PowerShell Core 7+ (pwsh) > Windows PowerShell 5.1 > cmd
        const pwsh7 = 'C:\\Program Files\\PowerShell\\7\\pwsh.exe';
        const pwsh51 = (process.env.SystemRoot || 'C:\\Windows') + '\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
        try { if (fs.existsSync(pwsh7)) return pwsh7; } catch { /* ignore */ }
        try { if (fs.existsSync(pwsh51)) return pwsh51; } catch { /* ignore */ }
        return 'cmd.exe';
    }

    getShellType(): 'bash' | 'zsh' | 'powershell' | 'cmd' | 'sh' {
        const shell = this.getDefaultShell();
        if (shell.includes('bash')) return 'bash';
        if (shell.includes('powershell') || shell.includes('pwsh')) return 'powershell';
        if (shell.includes('cmd')) return 'cmd';
        return 'cmd'; // 기본값
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

    getFindNodeProcessByCwdCommand(cwd: string): string {
        // PowerShell: node.exe 프로세스 중 CWD 기반 필터링은 제한적이므로 전체 node 프로세스 PID 반환
        return `powershell -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process -Filter \\"Name='node.exe'\\" | Select-Object -ExpandProperty ProcessId"`;
    }

    getProcessCwdCommand(pid: number): string {
        // PowerShell: 프로세스의 CommandLine에서 작업 디렉토리 추정
        return `powershell -ExecutionPolicy Bypass -Command "(Get-CimInstance Win32_Process -Filter \\"ProcessId=${pid}\\").CommandLine"`;
    }

    getFindDevServerProcessCommand(cwd: string): string {
        // PowerShell: dev 서버 패턴 프로세스 검색
        const escapedCwd = cwd.replace(/\\/g, '\\\\');
        return `powershell -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'npm run dev|vite|next dev|nuxt dev' } | Select-Object -ExpandProperty ProcessId"`;
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
        const shell = this.getDefaultShell();
        if (shell.includes('powershell') || shell.includes('pwsh')) {
            // PowerShell: -ExecutionPolicy Bypass로 스크립트 실행 제한 우회
            return {
                shell,
                env: process.env,
                windowsVerbatimArguments: true,
                shellArgs: ['-ExecutionPolicy', 'Bypass'],
            };
        }
        return {
            shell,
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
