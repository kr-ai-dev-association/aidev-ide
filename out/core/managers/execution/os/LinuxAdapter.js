"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.LinuxAdapter = void 0;
const os = __importStar(require("os"));
const path = __importStar(require("path"));
/**
 * Linux OS 어댑터
 */
class LinuxAdapter {
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
exports.LinuxAdapter = LinuxAdapter;
//# sourceMappingURL=LinuxAdapter.js.map