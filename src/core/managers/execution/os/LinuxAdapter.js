import * as os from 'os';
import * as path from 'path';
/**
 * Linux OS 어댑터
 */
export class LinuxAdapter {
    osType = 'linux';
    osName = 'Linux';
    // ==================== 터미널 관련 ====================
    getDefaultShell() {
        return process.env.SHELL || '/bin/bash';
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
        // Linux는 대부분 bash 명령어 그대로 사용
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
        return `lsof -ti:${port} || fuser ${port}/tcp 2>/dev/null`;
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
        return './mvnw';
    }
    getGradleCommand() {
        return './gradlew';
    }
    // ==================== API 호출 ====================
    getHttpClientOptions() {
        return {
        // Linux 기본 설정
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
            /apt\s+install/,
            /apt-get\s+install/,
            /yum\s+install/,
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
//# sourceMappingURL=LinuxAdapter.js.map