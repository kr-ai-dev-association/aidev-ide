import * as os from 'os';
import * as path from 'path';
/**
 * macOS (Darwin) OS 어댑터
 */
export class DarwinAdapter {
    osType = 'darwin';
    osName = 'macOS';
    // ==================== 터미널 관련 ====================
    getDefaultShell() {
        return process.env.SHELL || '/bin/zsh';
    }
    getShellType() {
        const shell = this.getDefaultShell();
        if (shell.includes('zsh'))
            return 'zsh';
        if (shell.includes('bash'))
            return 'bash';
        return 'sh';
    }
    normalizeCommand(command) {
        // macOS는 대부분 bash/zsh 명령어 그대로 사용
        return command;
    }
    getSetEnvCommand(key, value) {
        return `export ${key}="${value}"`;
    }
    getAddPathCommand(path) {
        return `export PATH="${path}:$PATH"`;
    }
    getKillProcessCommand(pid) {
        return `kill -9 ${pid}`;
    }
    getFindProcessByPortCommand(port) {
        return `lsof -ti:${port}`;
    }
    // ==================== 파일 처리 ====================
    getPathSeparator() {
        return '/';
    }
    normalizePath(filePath) {
        return path.posix.normalize(filePath);
    }
    getExecutableExtension() {
        return '';
    }
    getChmodCommand(filePath, permissions) {
        return `chmod ${permissions} "${filePath}"`;
    }
    // ==================== 명령어 처리 ====================
    getNpmCommand() {
        return 'npm';
    }
    getNpxCommand() {
        return 'npx';
    }
    getJavaCommand() {
        return 'java';
    }
    getMavenCommand() {
        // macOS에서는 mvnw가 있으면 우선 사용
        return './mvnw';
    }
    getGradleCommand() {
        // macOS에서는 gradlew가 있으면 우선 사용
        return './gradlew';
    }
    // ==================== API 호출 ====================
    getHttpClientOptions() {
        return {
        // macOS는 기본 설정 사용
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
            /^ssh\s/,
            /^sudo\s/,
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
        };
    }
    // ==================== 유틸리티 ====================
    static detect() {
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
//# sourceMappingURL=DarwinAdapter.js.map