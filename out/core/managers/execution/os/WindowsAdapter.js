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
exports.WindowsAdapter = void 0;
const os = __importStar(require("os"));
const path = __importStar(require("path"));
/**
 * Windows OS 어댑터
 */
class WindowsAdapter {
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
exports.WindowsAdapter = WindowsAdapter;
//# sourceMappingURL=WindowsAdapter.js.map