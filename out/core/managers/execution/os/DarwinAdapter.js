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
exports.DarwinAdapter = void 0;
const os = __importStar(require("os"));
const path = __importStar(require("path"));
/**
 * macOS (Darwin) OS 어댑터
 */
class DarwinAdapter {
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
exports.DarwinAdapter = DarwinAdapter;
//# sourceMappingURL=DarwinAdapter.js.map