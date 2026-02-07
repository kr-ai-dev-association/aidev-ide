import * as os from 'os';
import * as path from 'path';
/**
 * Windows OS 어댑터
 */
export class WindowsAdapter {
    osType = 'win32';
    osName = 'Windows';
    // ==================== 터미널 관련 ====================
    getDefaultShell() {
        // PowerShell Core > PowerShell > cmd 우선순위
        return process.env.SHELL ||
            'C:\\Program Files\\PowerShell\\7\\pwsh.exe' ||
            'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
    }
    getShellType() {
        const shell = this.getDefaultShell();
        if (shell.includes('powershell') || shell.includes('pwsh'))
            return 'powershell';
        if (shell.includes('cmd'))
            return 'cmd';
        return 'powershell'; // 기본값
    }
    normalizeCommand(command) {
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
    getSetEnvCommand(key, value) {
        if (this.getShellType() === 'powershell') {
            return `$env:${key}="${value}"`;
        }
        else {
            return `set ${key}=${value}`;
        }
    }
    getAddPathCommand(path) {
        if (this.getShellType() === 'powershell') {
            return `$env:PATH="${path};$env:PATH"`;
        }
        else {
            return `set PATH=${path};%PATH%`;
        }
    }
    getKillProcessCommand(pid) {
        return `taskkill /F /PID ${pid}`;
    }
    getFindProcessByPortCommand(port) {
        return `netstat -ano | findstr :${port}`;
    }
    // ==================== 파일 처리 ====================
    getPathSeparator() {
        return '\\';
    }
    normalizePath(filePath) {
        // Windows 경로로 정규화
        return path.win32.normalize(filePath);
    }
    getExecutableExtension() {
        return '.exe';
    }
    getChmodCommand(filePath, permissions) {
        // Windows에서는 icacls 사용
        return `icacls "${filePath}" /grant Everyone:F`;
    }
    // ==================== 명령어 처리 ====================
    getNpmCommand() {
        return 'npm.cmd';
    }
    getNpxCommand() {
        return 'npx.cmd';
    }
    getJavaCommand() {
        return 'java.exe';
    }
    getMavenCommand() {
        return 'mvnw.cmd';
    }
    getGradleCommand() {
        return 'gradlew.bat';
    }
    // ==================== API 호출 ====================
    getHttpClientOptions() {
        return {
        // Windows 특화 옵션 (프록시 설정 등)
        };
    }
    getTempDirectory() {
        return os.tmpdir();
    }
    getHomeDirectory() {
        return os.homedir();
    }
    // ==================== 프로세스 관리 ====================
    isInteractiveCommand(command) {
        const interactivePatterns = [
            /npm\s+create/,
            /npx\s+create/,
            /yarn\s+create/,
            /git\s+clone.*--depth/,
        ];
        return interactivePatterns.some(pattern => pattern.test(command));
    }
    getShellExecutionOptions() {
        return {
            shell: this.getDefaultShell(),
            env: process.env,
            windowsVerbatimArguments: true,
        };
    }
    // ==================== 유틸리티 ====================
    static detect() {
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
//# sourceMappingURL=WindowsAdapter.js.map