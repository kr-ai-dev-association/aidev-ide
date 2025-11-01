import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { NotificationService } from '../services/notificationService';
import { LlmService } from './llmService';

export interface LogEntry {
    timestamp: number;
    level: 'info' | 'warn' | 'error' | 'debug';
    source: 'terminal' | 'console' | 'output';
    message: string;
    rawOutput: string;
}

export interface ErrorPattern {
    pattern: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    regex?: RegExp;
}

export type OperatingSystem = 'windows' | 'macos' | 'linux' | 'unknown';

export interface TerminalErrorEvent {
    time: number;
    source: string;
    message: string;
    recentLogs: LogEntry[];
}

export interface CommandErrorContext {
    command: string;
    errorOutput: string;
    workingDirectory: string;
    timestamp: number;
    terminalName: string;
    retryCount: number;
}

export class TerminalMonitorService {
    private notificationService: NotificationService;
    private logEntries: LogEntry[] = [];
    private errorPatterns: ErrorPattern[] = [];
    private isMonitoring: boolean = false;
    private outputChannel: vscode.OutputChannel;
    private terminalDisposables: vscode.Disposable[] = [];
    private activeTerminals: Set<vscode.Terminal> = new Set();
    private monitoringInterval: NodeJS.Timeout | null = null;
    private lastTerminalCount: number = 0;
    private isCommandExecutionStopped: boolean = false;
    private onErrorEmitter = new vscode.EventEmitter<TerminalErrorEvent>();
    private userOS: OperatingSystem;
    private outputLogEnabled: boolean = true;
    private maxErrorRetries: number = 3;
    public readonly onError = this.onErrorEmitter.event;

    // 오류 수정 관련 속성
    private llmService: LlmService | undefined = undefined;
    private errorCorrectionInProgress: boolean = false;
    private recentErrors: TerminalErrorEvent[] = [];
    private maxRecentErrors: number = 10;
    private errorRetryCount = 0;
    private recentCommands: Map<string, CommandErrorContext> = new Map();
    private autoCorrectionEnabled = true;
    private currentWebview: vscode.Webview | undefined = undefined;

    constructor(notificationService: NotificationService) {
        this.notificationService = notificationService;
        this.outputChannel = vscode.window.createOutputChannel('AIDEV-IDE Terminal Monitor');
        this.userOS = this.detectOperatingSystem();
        // if (this.outputLogEnabled) {
        //     console.log(`[TerminalMonitorService] 사용자 OS 감지: ${this.userOS}`);
        // }
        this.initializeErrorPatterns();
    }

    /**
     * 사용자의 운영체제를 감지합니다.
     */
    private detectOperatingSystem(): OperatingSystem {
        const platform = os.platform();
        switch (platform) {
            case 'win32':
                return 'windows';
            case 'darwin':
                return 'macos';
            case 'linux':
                return 'linux';
            default:
                return 'unknown';
        }
    }

    /**
     * 현재 사용자의 OS 정보를 반환합니다.
     */
    public getUserOS(): OperatingSystem {
        return this.userOS;
    }

    /**
     * OUTPUT 로그 활성화 상태를 설정합니다.
     */
    public setOutputLogEnabled(enabled: boolean): void {
        this.outputLogEnabled = enabled;
        // if (this.outputLogEnabled) {
        //     console.log(`[TerminalMonitorService] OUTPUT 로그 ${enabled ? '활성화' : '비활성화'}`);
        // }

        // OUTPUT 로그가 비활성화되면 채널을 숨기고 비활성화
        if (!enabled) {
            try {
                this.outputChannel.hide();
                this.outputChannel.clear();
                // 로그 엔트리 배열도 정리
                this.logEntries = [];
            } catch (error) {
                // 채널이 이미 닫혀있거나 오류가 발생해도 무시
            }
        }
    }

    /**
     * OUTPUT 로그 활성화 상태를 반환합니다.
     */
    public isOutputLogEnabled(): boolean {
        return this.outputLogEnabled;
    }

    /**
     * 최대 오류 수정 횟수를 설정합니다.
     */
    public setMaxErrorRetries(count: number): void {
        this.maxErrorRetries = Math.max(1, Math.min(10, count));
        // if (this.outputLogEnabled) {
        //     console.log(`[TerminalMonitorService] 최대 오류 수정 횟수 설정: ${this.maxErrorRetries}`);
        // }
    }

    /**
     * 최대 오류 수정 횟수를 반환합니다.
     */
    public getMaxErrorRetries(): number {
        return this.maxErrorRetries;
    }

    /**
     * 자동 오류 수정을 즉시 중단합니다.
     */
    public stopErrorCorrection(): void {
        this.errorCorrectionInProgress = false;
        this.errorRetryCount = 0;
        this.recentCommands.clear();
        // if (this.outputLogEnabled) {
        //     console.log('[TerminalMonitorService] 자동 오류 수정이 중단되었습니다.');
        // }

        // 웹뷰에 중단 메시지 전송
        if (this.currentWebview) {
            this.currentWebview.postMessage({
                command: 'showErrorCorrectionStopped',
                message: '자동 오류 수정이 중단되었습니다.'
            });
        }
    }

    /**
     * OS별 시스템 프롬프트를 생성합니다.
     */
    private generateOSSpecificSystemPrompt(): string {
        const basePrompt = `당신은 전문적인 소프트웨어 개발자입니다. 사용자의 요청에 따라 코드를 생성하고 수정하는 작업을 수행합니다.

주요 지침:
1. 코드 생성 시 항상 완전하고 실행 가능한 코드를 제공하세요.
2. 코드 수정 시 기존 코드의 구조와 스타일을 유지하세요.
3. 파일 경로를 포함한 구체적인 수정 사항을 명시하세요.
4. 한글로 설명을 제공하세요.
5. 새 파일을 생성할 때는 반드시 "새 파일: [파일경로]" 형식으로 시작하고, 그 다음에 코드 블록을 포함하세요.
6. 기존 파일을 수정할 때는 반드시 "수정 파일: [파일경로]" 형식으로 시작하고, 그 다음에 수정된 코드 블록을 포함하세요.
7. 파일을 삭제할 때는 "삭제 파일: [파일경로]" 형식으로 명시하세요.
8. 마크다운 파일(.md)을 생성할 때는 코드 블록 없이 마크다운 내용을 직접 포함하세요.
9. 터미널 명령어가 필요한 경우 적절한 코드 블록으로 제공하세요. 이 명령어들은 자동으로 실행됩니다.
10. Vite 프로젝트의 package.json 스크립트는 "vite" 대신 "npx vite"를 사용하세요.
11. Spring Boot 프로젝트를 생성할 때는 반드시 Spring Boot 3.4.0 이상을 사용하세요.

현재 사용자 환경: ${this.userOS.toUpperCase()}`;

        const osSpecificGuidelines = this.getOSSpecificGuidelines();

        return `${basePrompt}

${osSpecificGuidelines}`;
    }

    /**
     * OS별 특화 가이드라인을 반환합니다.
     */
    private getOSSpecificGuidelines(): string {
        switch (this.userOS) {
            case 'windows':
                return `**Windows 환경 특화 가이드라인:**
- PowerShell 또는 Command Prompt 명령어를 사용하세요.
- 파일 경로는 백슬래시(\\) 또는 슬래시(/) 모두 사용 가능합니다.
- 환경변수는 %VARIABLE_NAME% 형식을 사용하세요.
- 포트 해제: netstat -ano | findstr :포트번호, taskkill /PID 프로세스ID /F
- 프로세스 종료: taskkill /IM 프로세스명 /F
- 서비스 관리: net start/stop 서비스명
- 권한 문제 시 관리자 권한으로 실행하도록 안내하세요.`;

            case 'macos':
                return `**macOS 환경 특화 가이드라인:**
- Bash/Zsh 쉘 명령어를 사용하세요.
- 파일 경로는 슬래시(/)를 사용하세요.
- 환경변수는 $VARIABLE_NAME 형식을 사용하세요.
- 포트 해제: lsof -ti:포트번호 | xargs kill -9
- 프로세스 종료: pkill -f "프로세스명"
- Homebrew 패키지 관리자 사용을 권장하세요.
- 권한 문제 시 sudo 명령어 사용을 안내하세요.`;

            case 'linux':
                return `**Linux 환경 특화 가이드라인:**
- Bash 쉘 명령어를 사용하세요.
- 파일 경로는 슬래시(/)를 사용하세요.
- 환경변수는 $VARIABLE_NAME 형식을 사용하세요.
- 포트 해제: lsof -ti:포트번호 | xargs kill -9 또는 fuser -k 포트번호/tcp
- 프로세스 종료: pkill -f "프로세스명" 또는 killall 프로세스명
- 패키지 관리자: apt (Ubuntu/Debian), yum/dnf (RHEL/CentOS), pacman (Arch)
- 권한 문제 시 sudo 명령어 사용을 안내하세요.`;

            default:
                return `**일반 환경 가이드라인:**
- 플랫폼에 독립적인 명령어를 사용하세요.
- 파일 경로는 슬래시(/)를 사용하세요.
- 환경변수는 $VARIABLE_NAME 형식을 사용하세요.
- 포트 해제 및 프로세스 종료 명령어는 OS별로 다를 수 있으니 주의하세요.`;
        }
    }

    /**
     * OS별 포트 해제 가이드를 생성합니다.
     */
    private generateOSSpecificPortReleaseGuide(): string {
        switch (this.userOS) {
            case 'windows':
                return `**Windows 환경 포트 해제 가이드:**

**Java/Spring Boot 프로젝트 (포트 8080):**
1. **새 PowerShell/CMD 창 열기** (현재 터미널이 아닌 새로운 터미널)
2. netstat -ano | findstr :8080
3. taskkill /PID [프로세스ID] /F
4. **강력한 방법**: taskkill /IM java.exe /F
5. **Spring Boot 전용**: taskkill /IM java.exe /F && taskkill /IM mvn.cmd /F
6. **최종 확인**: netstat -ano | findstr :8080

**Node.js 프로젝트 (포트 3000, 5173, 8080):**
1. netstat -ano | findstr :3000
2. taskkill /PID [프로세스ID] /F
3. **강력한 방법**: taskkill /IM node.exe /F

**Python 프로젝트 (포트 8000, 5000):**
1. netstat -ano | findstr :8000
2. taskkill /PID [프로세스ID] /F
3. **강력한 방법**: taskkill /IM python.exe /F`;

            case 'macos':
                return `**macOS 환경 포트 해제 가이드:**

**Java/Spring Boot 프로젝트 (포트 8080):**
1. **새 터미널 열기** (현재 터미널이 아닌 새로운 터미널)
2. lsof -i:8080
3. lsof -ti:8080 | xargs kill -9
4. sleep 2 && lsof -i:8080
5. **강력한 방법**: pkill -f "spring-boot" && pkill -f "java.*8080" && pkill -f "mvn.*spring-boot:run"
6. **추가 강력한 방법**: ps aux | grep -E "(spring-boot|java.*8080)" | grep -v grep | awk '{print $2}' | xargs kill -9
7. **최종 확인**: lsof -i:8080 || echo "포트 해제 완료"

**Node.js 프로젝트 (포트 3000, 5173, 8080):**
1. lsof -i:3000
2. lsof -ti:3000 | xargs kill -9
3. **강력한 방법**: pkill -f "node.*3000" && pkill -f "npm.*start" && pkill -f "vite"

**Python 프로젝트 (포트 8000, 5000):**
1. lsof -i:8000
2. lsof -ti:8000 | xargs kill -9
3. **강력한 방법**: pkill -f "python.*8000" && pkill -f "django.*runserver" && pkill -f "flask"`;

            case 'linux':
                return `**Linux 환경 포트 해제 가이드:**

**Java/Spring Boot 프로젝트 (포트 8080):**
1. **새 터미널 열기** (현재 터미널이 아닌 새로운 터미널)
2. lsof -i:8080 또는 fuser -k 8080/tcp
3. lsof -ti:8080 | xargs kill -9
4. sleep 2 && lsof -i:8080
5. **강력한 방법**: pkill -f "spring-boot" && pkill -f "java.*8080" && pkill -f "mvn.*spring-boot:run"
6. **추가 강력한 방법**: ps aux | grep -E "(spring-boot|java.*8080)" | grep -v grep | awk '{print $2}' | xargs kill -9
7. **최종 확인**: lsof -i:8080 || echo "포트 해제 완료"

**Node.js 프로젝트 (포트 3000, 5173, 8080):**
1. lsof -i:3000 또는 fuser -k 3000/tcp
2. lsof -ti:3000 | xargs kill -9
3. **강력한 방법**: pkill -f "node.*3000" && pkill -f "npm.*start" && pkill -f "vite"

**Python 프로젝트 (포트 8000, 5000):**
1. lsof -i:8000 또는 fuser -k 8000/tcp
2. lsof -ti:8000 | xargs kill -9
3. **강력한 방법**: pkill -f "python.*8000" && pkill -f "django.*runserver" && pkill -f "flask"`;

            default:
                return `**일반 환경 포트 해제 가이드:**
포트 사용 오류가 발생할 경우, 다음 명령어들을 OS에 맞게 적응하여 사용하세요:
- 포트 사용 프로세스 확인: netstat 또는 lsof 사용
- 프로세스 종료: kill, taskkill, 또는 pkill 사용
- 강제 종료: -9 플래그 또는 /F 옵션 사용`;
        }
    }

    /**
     * LLM 서비스를 설정합니다.
     */
    public setLlmService(llmService: LlmService): void {
        this.llmService = llmService;
        // console.log('[TerminalMonitorService] LLM 서비스 설정 완료');
    }

    /**
     * 최근 터미널 로그를 가져옵니다.
     * @param maxEntries 최대 로그 엔트리 수 (기본값: 50)
     * @returns 최근 터미널 로그 배열
     */
    public getRecentTerminalLogs(maxEntries: number = 50): LogEntry[] {
        return this.logEntries
            .slice(-maxEntries)
            .filter(entry => entry.source === 'terminal')
            .sort((a, b) => b.timestamp - a.timestamp);
    }

    /**
     * 터미널 로그를 텍스트 형태로 가져옵니다.
     * @param maxEntries 최대 로그 엔트리 수 (기본값: 50)
     * @returns 터미널 로그 텍스트
     */
    public getTerminalLogsAsText(maxEntries: number = 50): string {
        const recentLogs = this.getRecentTerminalLogs(maxEntries);
        return recentLogs
            .map(log => `[${new Date(log.timestamp).toISOString()}] ${log.level.toUpperCase()}: ${log.message}`)
            .join('\n');
    }

    /**
     * 웹뷰를 설정합니다.
     */
    public setWebview(webview: vscode.Webview): void {
        this.currentWebview = webview;
        // console.log('[TerminalMonitorService] Webview set');
    }

    /**
     * 웹뷰에 처리 상태를 전송합니다.
     */
    private sendProcessingStatus(step: string, status: string): void {
        if (this.currentWebview) {
            try {
                this.currentWebview.postMessage({ command: 'updateProcessingStatus', step, status });
            } catch (error) {
                console.warn('[TerminalMonitorService] Failed to send processing status:', error);
            }
        }
    }

    /**
     * 단계별 진행 상황을 VS Code Progress API로 표시합니다.
     */
    private async showStepProgress(steps: string[], currentStep: number): Promise<void> {
        return new Promise((resolve) => {
            // 상태바에만 표시 (알림 영역 사용 안함)
            const totalSteps = steps.length;
            const stepDescription = currentStep < steps.length ? steps[currentStep] : "완료";

            // VS Code 상태바에 진행 상황 표시
            vscode.window.setStatusBarMessage(
                `🔧 오류 수정 진행 중: ${currentStep + 1}/${totalSteps} - ${stepDescription}`,
                3000
            );

            // 각 단계 간 짧은 지연
            setTimeout(() => {
                resolve();
            }, 500);
        });
    }

    /**
     * 자동 오류 수정 기능을 활성화/비활성화합니다.
     */
    public setAutoCorrectionEnabled(enabled: boolean): void {
        this.autoCorrectionEnabled = enabled;
        // console.log(`[TerminalMonitorService] 자동 오류 수정 ${enabled ? '활성화' : '비활성화'}`);
    }

    /**
     * 에러 패턴을 초기화합니다.
     */
    private initializeErrorPatterns(): void {
        this.errorPatterns = [
            // JavaScript/TypeScript 에러
            { pattern: 'Error:', severity: 'high', description: '일반적인 에러' },
            { pattern: 'TypeError:', severity: 'high', description: '타입 에러' },
            { pattern: 'ReferenceError:', severity: 'high', description: '참조 에러' },
            { pattern: 'SyntaxError:', severity: 'critical', description: '문법 에러' },
            { pattern: 'RangeError:', severity: 'medium', description: '범위 에러' },
            { pattern: 'EvalError:', severity: 'high', description: '평가 에러' },

            // Node.js 에러
            { pattern: 'Module not found:', severity: 'high', description: '모듈을 찾을 수 없음' },
            { pattern: 'Cannot resolve module:', severity: 'high', description: '모듈 해결 불가' },
            { pattern: 'Cannot find package', severity: 'high', description: '패키지를 찾을 수 없음' },
            { pattern: 'ENOENT:', severity: 'medium', description: '파일 또는 디렉토리 없음' },
            { pattern: 'EACCES:', severity: 'medium', description: '권한 거부' },
            { pattern: 'EISDIR:', severity: 'medium', description: '디렉토리 관련 에러' },
            { pattern: 'ENOTEMPTY:', severity: 'medium', description: '디렉토리가 비어있지 않음' },
            { pattern: 'ELIFECYCLE', severity: 'high', description: 'npm lifecycle 에러' },
            { pattern: 'npm ERR!', severity: 'high', description: 'npm 에러' },
            { pattern: 'npm error code', severity: 'high', description: 'npm 오류 코드' },
            { pattern: 'error Command failed with exit code', severity: 'high', description: '명령 실패 (Yarn/Pnpm)' },

            // esbuild 관련 오류
            { pattern: 'SyntaxError: Invalid or unexpected token', severity: 'critical', description: 'esbuild 바이너리 손상' },
            { pattern: 'esbuild.*SyntaxError', severity: 'critical', description: 'esbuild 문법 오류' },
            { pattern: 'esbuild.*command failed', severity: 'high', description: 'esbuild 명령 실패' },

            // Vite 관련 오류
            { pattern: 'failed to load config from.*vite.config.js', severity: 'high', description: 'Vite 설정 로드 실패' },
            { pattern: 'Cannot find package.*vite.*imported from', severity: 'high', description: 'Vite 패키지 누락' },
            { pattern: 'ERR_MODULE_NOT_FOUND.*vite', severity: 'high', description: 'Vite 모듈을 찾을 수 없음' },

            // 빌드/컴파일 에러
            { pattern: 'Build failed:', severity: 'critical', description: '빌드 실패' },
            { pattern: 'Compilation failed:', severity: 'critical', description: '컴파일 실패' },
            { pattern: 'Failed to compile:', severity: 'critical', description: '컴파일 실패' },
            { pattern: 'Build error:', severity: 'critical', description: '빌드 에러' },
            { pattern: 'ERROR in', severity: 'critical', description: '웹팩/빌드 에러' },
            { pattern: 'Compilation error', severity: 'critical', description: '컴파일 에러' },
            { pattern: 'COMPILATION ERROR', severity: 'critical', description: 'Java 컴파일 오류' },
            { pattern: 'No compiler is provided in this environment', severity: 'critical', description: 'Java 컴파일러 누락 (JRE 대신 JDK 필요)' },
            { pattern: 'Perhaps you are running on a JRE rather than a JDK', severity: 'high', description: 'JRE 대신 JDK 필요' },

            // Maven 관련 오류
            { pattern: 'BUILD FAILURE', severity: 'critical', description: 'Maven 빌드 실패' },
            { pattern: 'No such file or directory', severity: 'high', description: '파일 또는 디렉토리를 찾을 수 없음' },
            { pattern: 'command not found', severity: 'high', description: '명령어를 찾을 수 없음' },
            { pattern: 'Permission denied', severity: 'medium', description: '권한 거부' },
            { pattern: 'Failed to execute goal', severity: 'critical', description: 'Maven 목표 실행 실패' },
            { pattern: 'MojoExecutionException', severity: 'critical', description: 'Maven 플러그인 실행 예외' },
            { pattern: 'MojoFailureException', severity: 'critical', description: 'Maven 플러그인 실행 실패' },
            { pattern: 'PluginExecutionException', severity: 'critical', description: 'Maven 플러그인 실행 예외' },
            { pattern: 'ProjectBuildingException', severity: 'critical', description: 'Maven 프로젝트 빌드 예외' },
            { pattern: 'Application finished with exit code: 1', severity: 'critical', description: '애플리케이션 비정상 종료' },
            { pattern: 'must be a valid version but is.*spring-boot.version', severity: 'high', description: 'Spring Boot 버전 변수 오류' },
            { pattern: 'zip file is empty', severity: 'critical', description: '빈 ZIP 파일 오류' },

            // Spring Boot 관련 오류
            { pattern: 'APPLICATION FAILED TO START', severity: 'critical', description: 'Spring Boot 애플리케이션 시작 실패' },
            { pattern: 'Web server failed to start', severity: 'critical', description: '웹 서버 시작 실패' },
            { pattern: 'Port.*was already in use', severity: 'high', description: '포트가 이미 사용 중' },
            { pattern: 'Failed to start bean.*webServerStartStop', severity: 'critical', description: '웹 서버 빈 시작 실패' },
            { pattern: 'ApplicationContextException', severity: 'critical', description: 'Spring 컨텍스트 예외' },

            // Java 환경 설정 오류
            { pattern: 'JAVA_HOME environment variable is not defined correctly', severity: 'critical', description: 'JAVA_HOME 환경 변수 설정 오류' },
            { pattern: 'this environment variable is needed to run this program', severity: 'high', description: '필수 환경 변수 누락' },
            { pattern: 'UnsupportedClassVersionError', severity: 'critical', description: 'Java 버전 호환성 오류' },
            { pattern: 'has been compiled by a more recent version of the Java Runtime', severity: 'critical', description: 'Java 버전 불일치 (높은 버전으로 컴파일됨)' },
            { pattern: 'class file version 61.0', severity: 'critical', description: 'Java 17로 컴파일된 클래스 파일' },
            { pattern: 'only recognizes class file versions up to 52.0', severity: 'critical', description: 'Java 8 런타임에서 Java 17 클래스 실행 시도' },
            { pattern: 'Port 8080 was already in use', severity: 'high', description: '포트 8080 충돌' },
            { pattern: 'Address already in use', severity: 'high', description: '포트 주소 충돌' },
            { pattern: 'this version of the Java Runtime only recognizes class file versions up to', severity: 'high', description: 'Java 런타임 버전이 낮음' },

            // 터미널 세션 간 환경 변수 유지 문제
            { pattern: 'export.*JAVA_HOME.*&&.*mvn', severity: 'medium', description: '터미널 세션 간 환경 변수 유지 문제' },

            // 네트워크 연결 오류
            { pattern: 'Failed to connect to.*port.*after.*ms', severity: 'medium', description: '서버 연결 실패' },
            { pattern: 'Couldn\'t connect to server', severity: 'medium', description: '서버 연결 불가' },
            { pattern: 'Unable to access jarfile', severity: 'high', description: 'JAR 파일 접근 불가' },

            // 테스트 에러
            { pattern: 'Test failed:', severity: 'medium', description: '테스트 실패' },
            { pattern: 'Assertion failed:', severity: 'medium', description: '어설션 실패' },
            { pattern: 'Expected:', severity: 'low', description: '예상값 불일치' },

            // 네트워크 에러
            { pattern: 'ECONNREFUSED:', severity: 'medium', description: '연결 거부' },
            { pattern: 'ETIMEDOUT:', severity: 'medium', description: '연결 시간 초과' },
            { pattern: 'Network error:', severity: 'medium', description: '네트워크 에러' },

            // 파일 시스템 에러
            { pattern: 'File not found:', severity: 'medium', description: '파일 없음' },
            { pattern: 'Permission denied:', severity: 'medium', description: '권한 거부' },
            { pattern: 'Access denied:', severity: 'medium', description: '접근 거부' },

            // 일반적인 에러 패턴
            { pattern: 'Failed:', severity: 'medium', description: '실패' },
            { pattern: 'Exception:', severity: 'high', description: '예외 발생' },
            { pattern: 'Fatal error:', severity: 'critical', description: '치명적 에러' },
            { pattern: 'Critical error:', severity: 'critical', description: '치명적 에러' },
            { pattern: 'Abort:', severity: 'high', description: '중단' },
            { pattern: 'Timeout:', severity: 'medium', description: '시간 초과' },
            { pattern: 'Traceback', severity: 'high', description: '파이썬 스택 트레이스' },
            { pattern: 'panic:', severity: 'critical', description: 'Go 패닉' },
            { pattern: '^fatal:', severity: 'critical', description: 'Git/일반 치명적 에러' },
            { pattern: 'Exit status [1-9]', severity: 'high', description: '비정상 종료 코드' },
            { pattern: 'Exception in thread', severity: 'high', description: '자바 예외' },
            { pattern: 'FAILURE: Build failed with an exception\.', severity: 'critical', description: 'Gradle 빌드 실패' },
            { pattern: 'BUILD FAILED', severity: 'critical', description: '빌드 실패' },
            { pattern: 'ModuleNotFoundError', severity: 'high', description: '파이썬 모듈 없음' },
            { pattern: 'Cannot find module', severity: 'high', description: 'Node 모듈 없음' },
            { pattern: 'segmentation fault', severity: 'critical', description: '세그멘테이션 폴트' },
            { pattern: 'Out of memory', severity: 'critical', description: '메모리 부족' }
        ];

        // 정규식 패턴 생성
        this.errorPatterns.forEach(pattern => {
            try {
                pattern.regex = new RegExp(pattern.pattern, 'i');
            } catch (error) {
                console.warn(`[TerminalMonitorService] 잘못된 정규식 패턴: ${pattern.pattern}`);
            }
        });
    }

    /**
     * 터미널 모니터링을 시작합니다.
     */
    public startMonitoring(): void {
        if (this.isMonitoring) {
            // console.log('[TerminalMonitorService] 이미 모니터링 중입니다.');
            return;
        }

        this.isMonitoring = true;
        this.logEntries = [];
        this.lastTerminalCount = vscode.window.terminals.length;
        // console.log('[TerminalMonitorService] 터미널 모니터링 시작');

        // 터미널 생성 이벤트 리스너
        this.terminalDisposables.push(
            vscode.window.onDidOpenTerminal((terminal) => {
                // console.log(`[TerminalMonitorService] 터미널 생성됨: ${terminal.name}`);
                this.activeTerminals.add(terminal);
                this.monitorTerminal(terminal);
                this.logTerminalEvent('info', 'terminal', `터미널 생성됨: ${terminal.name}`);
            })
        );

        // 터미널 종료 이벤트 리스너
        this.terminalDisposables.push(
            vscode.window.onDidCloseTerminal((terminal) => {
                console.log(`[TerminalMonitorService] 터미널 종료됨: ${terminal.name}`);
                this.activeTerminals.delete(terminal);
                this.logTerminalEvent('info', 'terminal', `터미널 종료됨: ${terminal.name}`);
            })
        );

        // 기존 터미널들 모니터링 시작
        vscode.window.terminals.forEach(terminal => {
            this.activeTerminals.add(terminal);
            this.monitorTerminal(terminal);
            this.logTerminalEvent('info', 'terminal', `기존 터미널 발견: ${terminal.name}`);
        });

        // 주기적 모니터링 시작
        this.startPeriodicMonitoring();
    }

    /**
     * 외부에서 터미널 출력을 주입받습니다.
     * 이 메서드는 terminalManager에서 호출됩니다.
     */
    public ingestExternalOutput(source: string, data: string): void {
        if (!this.isMonitoring) return;

        // console.log(`[TerminalMonitorService] 외부 출력 수신: ${source} - ${data.substring(0, 100)}...`);

        // 터미널 이름 추출 (source에서)
        const terminalName = source.includes(':') ? source.split(':')[0] : 'external';

        this.processTerminalOutput(terminalName, data);
    }

    /**
     * 최근 실행된 명령어를 저장합니다.
     */
    public storeRecentCommand(terminalName: string, command: string): void {
        console.log(`[TerminalMonitorService] 명령어 저장: ${terminalName} - ${command}`);

        // 최근 명령어를 로그에 추가
        const logEntry: LogEntry = {
            timestamp: Date.now(),
            level: 'info',
            source: 'terminal',
            message: command,
            rawOutput: command
        };

        this.logEntries.push(logEntry);

        // 최근 명령어 맵에 저장
        this.recentCommands.set(`${terminalName}:${command}`, {
            command,
            errorOutput: '',
            workingDirectory: '',
            timestamp: Date.now(),
            terminalName,
            retryCount: 0
        });
    }

    /**
     * 터미널 모니터링을 중지합니다.
     */
    public stopMonitoring(): void {
        this.isMonitoring = false;

        // 모든 이벤트 리스너 정리
        this.terminalDisposables.forEach(disposable => disposable.dispose());
        this.terminalDisposables = [];
        this.activeTerminals.clear();

        // 주기적 모니터링 중지
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }

        // console.log('[TerminalMonitorService] 터미널 모니터링 중지');
    }

    /**
     * 주기적 모니터링을 시작합니다.
     */
    private startPeriodicMonitoring(): void {
        this.monitoringInterval = setInterval(() => {
            if (!this.isMonitoring) return;

            this.checkTerminalChanges();
            this.checkActiveTerminals();
        }, 1000); // 1초마다 확인
    }

    /**
     * 터미널 변경사항을 확인합니다.
     */
    private checkTerminalChanges(): void {
        const currentTerminalCount = vscode.window.terminals.length;

        if (currentTerminalCount !== this.lastTerminalCount) {
            // console.log(`[TerminalMonitorService] 터미널 수 변경: ${this.lastTerminalCount} → ${currentTerminalCount}`);
            this.logTerminalEvent('info', 'terminal', `터미널 수 변경: ${this.lastTerminalCount} → ${currentTerminalCount}`);
            this.lastTerminalCount = currentTerminalCount;
        }
    }

    /**
     * 터미널 이벤트를 로그에 기록합니다.
     */
    private logTerminalEvent(level: 'info' | 'warn' | 'error' | 'debug', source: 'terminal' | 'console' | 'output', message: string): void {
        // OUTPUT 로그가 비활성화된 경우 로그를 기록하지 않음
        if (!this.outputLogEnabled) {
            return;
        }

        const logEntry: LogEntry = {
            timestamp: Date.now(),
            level,
            source,
            message,
            rawOutput: message
        };

        this.logEntries.push(logEntry);
        this.outputChannel.appendLine(`[${new Date().toISOString()}] ${level.toUpperCase()}: ${message}`);
    }


    /**
     * 특정 터미널을 모니터링합니다.
     * @param terminal 모니터링할 터미널
     */
    private monitorTerminal(terminal: vscode.Terminal): void {
        if (!this.isMonitoring) return;

        // console.log(`[TerminalMonitorService] 터미널 모니터링 시작: ${terminal.name}`);

        // 터미널 데이터 이벤트 리스너 (VSCode API 제한으로 인해 직접적인 터미널 출력 모니터링은 제한적)
        // 대신 주기적으로 터미널 상태를 확인하는 방식 사용
        this.startTerminalStatusCheck(terminal);
    }

    /**
     * 터미널 상태를 주기적으로 확인합니다.
     * @param terminal 확인할 터미널
     */
    private startTerminalStatusCheck(terminal: vscode.Terminal): void {
        const checkInterval = setInterval(() => {
            if (!this.isMonitoring || !this.activeTerminals.has(terminal)) {
                clearInterval(checkInterval);
                return;
            }

            // 터미널이 여전히 활성 상태인지 확인
            if (terminal.exitStatus !== undefined) {
                const exitCode = terminal.exitStatus.code;
                if (this.outputLogEnabled) console.log(`[TerminalMonitorService] 터미널 종료됨: ${terminal.name} (exit code: ${exitCode})`);

                // 종료 코드가 0이 아니면 에러로 간주
                if (exitCode !== 0) {
                    const errorMessage = `터미널 '${terminal.name}'이 에러 코드 ${exitCode}로 종료되었습니다.`;
                    this.processTerminalOutput(terminal.name, errorMessage);
                    this.notificationService.showErrorMessage(`터미널 에러: ${errorMessage}`);
                }

                this.activeTerminals.delete(terminal);
                clearInterval(checkInterval);
            }
        }, 2000); // 2초마다 확인
    }

    /**
     * 터미널 출력을 처리합니다.
     * @param terminalName 터미널 이름
     * @param data 출력 데이터
     */
    private processTerminalOutput(terminalName: string, data: string): void {
        if (!this.isMonitoring) return;

        // if (this.outputLogEnabled) console.log(`[TerminalMonitorService] processTerminalOutput called: ${terminalName} - ${data}`);

        const isErrorLike = /(^error:|^fatal:|\berror\b|\bfail(ed)?\b|\bexception\b|npm ERR!|^npm\s+error\b|ERROR in|Traceback|panic:|Exit status [1-9]|^exit status [1-9-]|Process exited \(code\s*-?\d+\)|BUILD FAILED|Missing script:|Missing script\s*:\s*"\w+")/i.test(data);
        const level: 'info' | 'warn' | 'error' = isErrorLike ? 'error' : 'info';

        // console.log(`[TerminalMonitorService] isErrorLike: ${isErrorLike}, level: ${level}`);

        // OUTPUT 로그가 활성화된 경우에만 로그 기록
        if (this.outputLogEnabled) {
            const logEntry: LogEntry = {
                timestamp: Date.now(),
                level,
                source: 'terminal',
                message: data.trim(),
                rawOutput: data
            };

            this.logEntries.push(logEntry);
            this.outputChannel.appendLine(`[${new Date().toISOString()}] ${terminalName} ${level.toUpperCase()}: ${data.trim()}`);
        }
        const hasErr = this.checkForErrors(data);
        if (this.outputLogEnabled) console.log(`[TerminalMonitorService] hasErr from checkForErrors: ${hasErr}`);

        if (isErrorLike || hasErr) {
            if (this.outputLogEnabled) console.log(`[TerminalMonitorService] Error detected, firing onError event`);
            if (this.outputLogEnabled) console.log(`[TerminalMonitorService] Error data: ${data}`);
            if (this.outputLogEnabled) console.log(`[TerminalMonitorService] isErrorLike: ${isErrorLike}, hasErr: ${hasErr}`);
            // 에러가 감지되면 출력 채널 노출 (OUTPUT 로그가 활성화된 경우에만)
            if (this.outputLogEnabled) {
                try { this.outputChannel.show(true); } catch { }
            }
            try {
                const recent = this.getRecentErrors(30);
                if (this.outputLogEnabled) console.log(`[TerminalMonitorService] Recent errors:`, recent);
                this.onErrorEmitter.fire({
                    time: Date.now(),
                    source: terminalName,
                    message: data.trim(),
                    recentLogs: recent
                });
                if (this.outputLogEnabled) console.log(`[TerminalMonitorService] onErrorEmitter.fire() called successfully`);

                // 자동 오류 수정 시도
                if (this.autoCorrectionEnabled && this.llmService) {
                    if (this.outputLogEnabled) console.log('[TerminalMonitorService] Attempting auto correction...');
                    this.attemptAutoCorrection(terminalName, data.trim(), recent);
                } else {
                    if (this.outputLogEnabled) console.log('[TerminalMonitorService] Auto correction disabled or LLM service not available');
                }
            } catch (e) {
                console.warn('[TerminalMonitorService] onError emit failed:', e);
            }
        } else {
            if (this.outputLogEnabled) console.log(`[TerminalMonitorService] No error detected, not firing onError event`);
        }
    }



    /**
     * 활성 터미널들의 상태를 확인합니다.
     */
    private checkActiveTerminals(): void {
        const currentTerminals = vscode.window.terminals;

        // 새로 생성된 터미널 확인
        currentTerminals.forEach(terminal => {
            if (!this.activeTerminals.has(terminal)) {
                console.log(`[TerminalMonitorService] 새 터미널 발견: ${terminal.name}`);
                this.activeTerminals.add(terminal);
                this.monitorTerminal(terminal);
            }
        });

        // 종료된 터미널 확인
        this.activeTerminals.forEach(terminal => {
            if (!currentTerminals.includes(terminal)) {
                console.log(`[TerminalMonitorService] 터미널 제거됨: ${terminal.name}`);
                this.activeTerminals.delete(terminal);
            }
        });
    }

    /**
     * 출력에서 에러를 확인합니다.
     * @param output 출력 텍스트
     * @returns 에러 발견 여부
     */
    private checkForErrors(output: string): boolean {
        let hasErrors = false;
        const foundErrors: { pattern: string; severity: string; description: string }[] = [];

        console.log(`[TerminalMonitorService] checkForErrors called with: "${output}"`);

        // Normalize CLIXML noise and extract human-readable error text
        const sanitize = (text: string): string => {
            if (!text) return '';
            let t = text;
            t = t.replace(/_x000D__x000A_/g, '\n');
            t = t.replace(/<Objs[\s\S]*?>/g, '')
                .replace(/<\/Objs>/g, '')
                .replace(/<Obj[\s\S]*?>/g, '')
                .replace(/<\/Obj>/g, '')
                .replace(/<S\s+S="Error">([\s\S]*?)<\/S>/g, '$1')
                .replace(/<[^>]+>/g, '');
            t = t.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
            return t;
        };
        const cleaned = sanitize(output);

        // Detect PowerShell common errors (both ko/en)
        const errorRegexes: { pattern: string; severity: 'medium' | 'high'; description: string; re: RegExp }[] = [
            { pattern: 'CommandNotFound', severity: 'high', description: '명령 또는 cmdlet을 찾을 수 없음', re: /(CommandNotFoundException|용어가\s+cmdlet|용어가\s+함수|용어가\s+스크립트)/i },
            { pattern: 'AccessDenied', severity: 'high', description: '권한/실행정책 문제', re: /(Access\s+is\s+denied|UnauthorizedAccess|실행할\s+수\s+없습니다|ExecutionPolicy)/i },
            { pattern: 'FileNotFound', severity: 'medium', description: '파일/경로 없음', re: /(No\s+such\s+file|경로가\s+올바른지|찾을\s+수\s+없습니다)/i },
            { pattern: 'SyntaxError', severity: 'medium', description: '구문 오류', re: /(ParserError|Unexpected\s+token|예기치\s+않은\s+토큰)/i },
            { pattern: 'PythonNotFound', severity: 'medium', description: 'Python 미설치/경로문제', re: /(Python\s+not\s+found|py(thon)?\s+.*not\s+found)/i },
        ];
        for (const r of errorRegexes) {
            if (r.re.test(cleaned)) {
                hasErrors = true;
                foundErrors.push({ pattern: r.pattern, severity: r.severity, description: r.description });
            }
        }

        // pom.xml 관련 오류 감지
        if (this.isPomXmlError(cleaned)) {
            hasErrors = true;
            foundErrors.push({
                pattern: 'pom.xml-error',
                severity: 'high',
                description: 'Maven POM 파일 오류 감지'
            });
            console.log(`[TerminalMonitorService] POM.xml 오류 감지: ${output.substring(0, 100)}...`);

            // pom.xml 자동 교체 시도
            this.handlePomXmlError();
        }

        for (const errorPattern of this.errorPatterns) {
            if (errorPattern.regex && errorPattern.regex.test(cleaned)) {
                hasErrors = true;
                foundErrors.push({
                    pattern: errorPattern.pattern,
                    severity: errorPattern.severity,
                    description: errorPattern.description
                });

                console.log(`[TerminalMonitorService] 에러 감지: ${errorPattern.pattern} (${errorPattern.severity})`);
            }
        }

        if (hasErrors) {
            this.handleErrors(foundErrors);
        }

        return hasErrors;
    }

    /**
     * pom.xml 관련 오류인지 확인합니다.
     * @param output 출력 텍스트
     * @returns pom.xml 오류 여부
     */
    private isPomXmlError(output: string): boolean {
        const pomErrorPatterns = [
            /Non-resolvable parent POM/i,
            /spring-boot-starter-parent.*not found/i,
            /spring\.boot\.version.*not found/i,
            /BUILD FAILURE.*POM/i,
            /ProjectBuildingException/i,
            /UnresolvableModelException/i,
            /class file version.*Java Runtime/i,
            /has been compiled by a more recent version/i
        ];

        return pomErrorPatterns.some(pattern => pattern.test(output));
    }

    /**
     * pom.xml 오류 발생 시 표준 pom.xml로 자동 교체합니다.
     */
    private async handlePomXmlError(): Promise<void> {
        try {
            console.log('[TerminalMonitorService] POM.xml 오류 감지, 표준 POM.xml로 교체 시도...');

            // 현재 작업 디렉토리에서 pom.xml 찾기
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                console.log('[TerminalMonitorService] 워크스페이스 폴더를 찾을 수 없습니다.');
                return;
            }

            const workspaceRoot = workspaceFolders[0].uri.fsPath;
            const pomPath = path.join(workspaceRoot, 'pom.xml');

            // pom.xml이 존재하는지 확인
            if (!fs.existsSync(pomPath)) {
                console.log('[TerminalMonitorService] pom.xml 파일을 찾을 수 없습니다.');
                return;
            }

            // 표준 pom.xml 생성
            const standardPomXml = this.generateStandardPomXml();

            // 백업 생성
            const backupPath = pomPath + '.backup.' + Date.now();
            fs.copyFileSync(pomPath, backupPath);
            console.log(`[TerminalMonitorService] 기존 pom.xml 백업: ${backupPath}`);

            // 표준 pom.xml로 교체
            fs.writeFileSync(pomPath, standardPomXml, 'utf8');
            console.log('[TerminalMonitorService] 표준 pom.xml로 교체 완료');

            // 웹뷰에 알림 전송
            if (this.currentWebview) {
                this.currentWebview.postMessage({
                    command: 'showErrorCorrectionSuccess',
                    message: '✅ POM.xml 오류 감지 및 자동 교체 완료',
                    correctedCommand: '표준 Spring Boot 3.4.0 POM.xml로 교체됨'
                });
            }

        } catch (error) {
            console.error('[TerminalMonitorService] POM.xml 교체 실패:', error);
            if (this.currentWebview) {
                this.currentWebview.postMessage({
                    command: 'showErrorCorrectionFailure',
                    message: '❌ POM.xml 자동 교체 실패: ' + error
                });
            }
        }
    }

    /**
     * 표준 Spring Boot 3.4.0 pom.xml을 생성합니다.
     */
    private generateStandardPomXml(): string {
        return `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0
                             https://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <groupId>com.example</groupId>
    <artifactId>demo</artifactId>
    <version>0.0.1-SNAPSHOT</version>
    <name>demo</name>
    <description>Demo Spring Boot project</description>
    <packaging>jar</packaging>

    <properties>
        <java.version>17</java.version>
        <spring.boot.version>3.4.0</spring.boot.version>
        <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
    </properties>

    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.4.0</version>
        <relativePath/> <!-- lookup parent from repository -->
    </parent>

    <dependencies>
        <!-- Spring Boot Web -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>

        <!-- Spring Boot Test -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-test</artifactId>
            <scope>test</scope>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <!-- Maven Compiler Plugin -->
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-compiler-plugin</artifactId>
                <version>3.11.0</version>
                <configuration>
                    <source>17</source>
                    <target>17</target>
                </configuration>
            </plugin>

            <!-- Spring Boot Maven Plugin -->
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
                <version>3.4.0</version>
                <executions>
                    <execution>
                        <goals>
                            <goal>repackage</goal>
                        </goals>
                    </execution>
                </executions>
            </plugin>
        </plugins>
    </build>

</project>`;
    }

    /**
     * 발견된 에러들을 처리합니다.
     * @param errors 발견된 에러들
     */
    private handleErrors(errors: { pattern: string; severity: string; description: string }[]): void {
        console.log(`[TerminalMonitorService] handleErrors called with ${errors.length} errors:`, errors);

        const criticalErrors = errors.filter(e => e.severity === 'critical');
        const highErrors = errors.filter(e => e.severity === 'high');
        const mediumErrors = errors.filter(e => e.severity === 'medium');

        if (criticalErrors.length > 0) {
            this.notificationService.showErrorMessage(
                `치명적 에러 발견: ${criticalErrors.map(e => e.pattern).join(', ')}`
            );
            try { console.error('[TerminalMonitorService] Critical errors:', criticalErrors); } catch { }
        } else if (highErrors.length > 0) {
            this.notificationService.showWarningMessage(
                `높은 심각도 에러 발견: ${highErrors.map(e => e.pattern).join(', ')}`
            );
            try { console.error('[TerminalMonitorService] High severity errors:', highErrors); } catch { }
        } else if (mediumErrors.length > 0) {
            console.log(`[TerminalMonitorService] 중간 심각도 에러: ${mediumErrors.map(e => e.pattern).join(', ')}`);
        }

        // 에러 정보를 출력 채널에 기록 (설정에 따라)
        if (this.outputLogEnabled) {
            this.outputChannel.appendLine(`[${new Date().toISOString()}] 에러 감지:`);
            errors.forEach(error => {
                this.outputChannel.appendLine(`  - ${error.pattern} (${error.severity}): ${error.description}`);
            });
        }

        // Fire onError event for all detected errors
        if (errors.length > 0) {
            console.log(`[TerminalMonitorService] Firing onError event with ${errors.length} errors`);
            try {
                const recentLogs = this.getRecentErrors(30);
                const errorEvent: TerminalErrorEvent = {
                    time: Date.now(),
                    source: 'terminal',
                    message: errors.map(e => `${e.pattern}: ${e.description}`).join('; '),
                    recentLogs: recentLogs
                };
                console.log(`[TerminalMonitorService] Error event to fire:`, errorEvent);
                this.onErrorEmitter.fire(errorEvent);
                console.log(`[TerminalMonitorService] onError event fired successfully`);
            } catch (e) {
                console.warn('[TerminalMonitorService] onError fire failed:', e);
            }
        } else {
            console.log(`[TerminalMonitorService] No errors to fire onError event`);
        }
    }

    /**
     * 특정 에러 패턴이 있는지 확인합니다.
     * @param patterns 확인할 에러 패턴들
     * @returns 에러 발견 여부
     */
    public checkForSpecificErrors(patterns: string[]): boolean {
        if (!this.isMonitoring) return false;

        const recentLogs = this.getRecentLogs(30); // 최근 30초 로그
        let hasErrors = false;

        for (const log of recentLogs) {
            for (const pattern of patterns) {
                if (log.message.includes(pattern) || log.rawOutput.includes(pattern)) {
                    hasErrors = true;
                    console.log(`[TerminalMonitorService] 특정 에러 패턴 발견: ${pattern}`);
                    break;
                }
            }
            if (hasErrors) break;
        }

        return hasErrors;
    }

    /**
     * 최근 로그를 가져옵니다.
     * @param seconds 최근 몇 초간의 로그
     * @returns 로그 엔트리 배열
     */
    public getRecentLogs(seconds: number): LogEntry[] {
        const cutoffTime = Date.now() - (seconds * 1000);
        return this.logEntries.filter(log => log.timestamp >= cutoffTime);
    }

    /**
     * 최근 에러 로그만 반환합니다.
     */
    public getRecentErrors(seconds: number): LogEntry[] {
        const cutoffTime = Date.now() - (seconds * 1000);
        return this.logEntries.filter(log => log.timestamp >= cutoffTime && log.level === 'error');
    }

    /**
     * 모든 로그를 가져옵니다.
     * @returns 로그 엔트리 배열
     */
    public getAllLogs(): LogEntry[] {
        return [...this.logEntries];
    }

    /**
     * 로그를 초기화합니다.
     */
    public clearLogs(): void {
        this.logEntries = [];
        console.log('[TerminalMonitorService] 로그 초기화');
    }

    /**
     * 에러 패턴을 추가합니다.
     * @param pattern 에러 패턴
     * @param severity 심각도
     * @param description 설명
     */
    public addErrorPattern(pattern: string, severity: 'low' | 'medium' | 'high' | 'critical', description: string): void {
        // Escape special regex characters in pattern to treat it as a literal string
        // This prevents regex syntax errors when patterns contain parentheses, etc.
        const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        let regex: RegExp;
        try {
            regex = new RegExp(escapedPattern, 'i');
        } catch (e) {
            console.warn(`[TerminalMonitorService] Failed to create regex from pattern "${pattern}": ${e}, using literal match`);
            // Fallback to literal string match
            regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        }

        const errorPattern: ErrorPattern = {
            pattern,
            severity,
            description,
            regex
        };

        this.errorPatterns.push(errorPattern);
        console.log(`[TerminalMonitorService] 에러 패턴 추가: ${pattern} (${severity})`);
    }


    /**
     * 출력 채널을 표시합니다.
     */
    public showOutputChannel(): void {
        if (this.outputLogEnabled) {
            this.outputChannel.show();
        }
    }

    /**
     * 모니터링 상태를 반환합니다.
     * @returns 모니터링 상태 정보
     */
    public getMonitoringStatus(): { isMonitoring: boolean, activeTerminals: number, totalLogs: number } {
        return {
            isMonitoring: this.isMonitoring,
            activeTerminals: this.activeTerminals.size,
            totalLogs: this.logEntries.length
        };
    }

    /**
     * 터미널 모니터링 테스트를 실행합니다.
     */
    public testTerminalMonitoring(): void {
        console.log('[TerminalMonitorService] 터미널 모니터링 테스트 시작');
        this.logTerminalEvent('info', 'terminal', '터미널 모니터링 테스트 시작');

        // 현재 터미널 상태 출력
        const terminals = vscode.window.terminals;
        console.log(`[TerminalMonitorService] 현재 터미널 수: ${terminals.length}`);
        terminals.forEach((terminal, index) => {
            console.log(`[TerminalMonitorService] 터미널 ${index + 1}: ${terminal.name}`);
            this.logTerminalEvent('info', 'terminal', `터미널 ${index + 1}: ${terminal.name}`);
        });

        this.notificationService.showInfoMessage(`터미널 모니터링 테스트 완료. 현재 ${terminals.length}개 터미널 감지됨.`);
    }

    /**
     * 자동 오류 수정을 시도합니다.
     */
    private async attemptAutoCorrection(terminalName: string, errorMessage: string, recentLogs: LogEntry[]): Promise<void> {
        // console.log(`[TerminalMonitorService] attemptAutoCorrection called with error: ${errorMessage}`);
        if (!this.llmService || !this.autoCorrectionEnabled) {
            // console.log(`[TerminalMonitorService] Auto correction disabled or LLM service not available`);
            return;
        }

        try {
            this.sendProcessingStatus('error_correction', '터미널 오류 감지됨 - 자동 수정 시도 중...');

            // 단계별 진행 상황 정의
            const errorCorrectionSteps = [
                "오류 원인 분석",
                "환경 확인",
                "LLM 수정 요청",
                "수정된 명령어 실행",
                "결과 검증"
            ];

            // 1단계: 오류 원인 분석
            await this.showStepProgress(errorCorrectionSteps, 0);

            // 최근 명령어 추출
            const recentCommand = this.extractRecentCommand(recentLogs);
            if (!recentCommand) {
                console.log('[TerminalMonitorService] 최근 명령어를 찾을 수 없음');
                this.sendProcessingStatus('error_correction', '최근 명령어를 찾을 수 없어 자동 수정을 건너뜁니다.');
                return;
            }

            this.sendProcessingStatus('error_correction', `실패한 명령어 분석 중: ${recentCommand}`);

            // 2단계: 환경 확인
            await this.showStepProgress(errorCorrectionSteps, 1);

            // 중복 수정 시도 방지 (명령어별로 개별 관리)
            const commandKey = `${terminalName}:${recentCommand}`;
            if (this.recentCommands.has(commandKey)) {
                const lastAttempt = this.recentCommands.get(commandKey)!;
                const timeSinceLastAttempt = Date.now() - lastAttempt.timestamp;

                // 30초 내 중복 방지
                if (timeSinceLastAttempt < 30000) {
                    console.log(`[TerminalMonitorService] 최근에 이미 수정 시도한 명령어 (${Math.round(timeSinceLastAttempt / 1000)}초 전)`);
                    return;
                }

                // 같은 명령어에 대한 재시도 횟수 확인
                if (lastAttempt.retryCount >= this.maxErrorRetries) {
                    console.log(`[TerminalMonitorService] 명령어 '${recentCommand}'에 대한 최대 재시도 횟수 초과`);

                    // 명령어별 최대 재시도 횟수 초과 시 알림 표시
                    vscode.window.showErrorMessage(
                        `❌ 자동 오류 수정 실패`,
                        `명령어 '${recentCommand}'에 대한 최대 재시도 횟수(${this.maxErrorRetries})를 초과했습니다.`,
                        '수동으로 문제를 해결해주세요.'
                    );

                    return;
                }
            }

            // 전역 재시도 횟수 확인 (모든 명령어 합계)
            if (this.errorRetryCount >= this.maxErrorRetries * 2) {
                console.log('[TerminalMonitorService] 전역 최대 재시도 횟수 초과');

                // 전역 최대 재시도 횟수 초과 시 알림 표시
                vscode.window.showErrorMessage(
                    `❌ 자동 오류 수정 실패`,
                    `전역 최대 재시도 횟수(${this.maxErrorRetries * 2})를 초과했습니다.`,
                    '수동으로 문제를 해결해주세요.'
                );

                this.errorRetryCount = 0;
                return;
            }

            this.errorRetryCount++;
            console.log(`[TerminalMonitorService] 오류 수정 시도 ${this.errorRetryCount}/${this.maxErrorRetries}`);
            // 3단계: LLM 수정 요청
            await this.showStepProgress(errorCorrectionSteps, 2);
            this.sendProcessingStatus('error_correction', `LLM에게 오류 수정 요청 중... (시도 ${this.errorRetryCount}/${this.maxErrorRetries})`);

            // LLM에게 오류 수정 요청
            const correctedCommand = await this.getCorrectedCommandFromLlm(recentCommand, errorMessage, terminalName);
            if (!correctedCommand) {
                console.log('[TerminalMonitorService] LLM에서 수정된 명령어를 받지 못함');
                this.sendProcessingStatus('error_correction', 'LLM에서 수정된 명령어를 받지 못했습니다.');
                return;
            }

            this.sendProcessingStatus('error_correction', `수정된 명령어 생성됨: ${correctedCommand}`);

            // 수정된 명령어 저장 (재시도 횟수 업데이트)
            const existingContext = this.recentCommands.get(commandKey);
            const retryCount = existingContext ? existingContext.retryCount + 1 : 1;

            this.recentCommands.set(commandKey, {
                command: recentCommand,
                errorOutput: errorMessage,
                workingDirectory: process.cwd(),
                timestamp: Date.now(),
                terminalName,
                retryCount
            });

            // 4단계: 수정된 명령어 실행
            await this.showStepProgress(errorCorrectionSteps, 3);
            this.sendProcessingStatus('error_correction', `수정된 명령어 실행 중: ${correctedCommand}`);
            await this.executeCorrectedCommand(terminalName, correctedCommand);

            // 5단계: 결과 검증
            await this.showStepProgress(errorCorrectionSteps, 4);
            this.sendProcessingStatus('error_correction', '자동 오류 수정 완료');

            // 완료 메시지를 상태바에 표시
            vscode.window.setStatusBarMessage('✅ 오류 수정 완료!', 5000);

        } catch (error) {
            console.error('[TerminalMonitorService] 자동 오류 수정 실패:', error);
            this.sendProcessingStatus('error_correction', `자동 오류 수정 실패: ${error instanceof Error ? error.message : String(error)}`);

            // 실패 메시지를 상태바에 표시
            vscode.window.setStatusBarMessage('❌ 오류 수정 실패', 3000);
        }
    }

    /**
     * 최근 로그에서 명령어를 추출합니다.
     */
    private extractRecentCommand(recentLogs: LogEntry[]): string | null {
        console.log(`[TerminalMonitorService] extractRecentCommand called with ${recentLogs.length} logs`);

        // 최근 로그에서 명령어 패턴 찾기
        for (let i = recentLogs.length - 1; i >= 0; i--) {
            const log = recentLogs[i];
            const message = log.message;

            console.log(`[TerminalMonitorService] Checking log message: "${message}"`);

            // 일반적인 명령어 패턴들
            const commandPatterns = [
                /^npm\s+(install|run|start|build|test|dev)/,
                /^yarn\s+(install|add|start|build|test|dev)/,
                /^git\s+(clone|pull|push|commit|add)/,
                /^docker\s+(build|run|start|stop)/,
                /^python\s+/,
                /^node\s+/,
                /^npm\s+run\s+(\w+)/,
                /^cd\s+/,
                /^mkdir\s+/,
                /^rm\s+/,
                /^cp\s+/,
                /^mv\s+/,
                /^\.\/\w+\.sh/,  // 스크립트 실행 명령어
                /^\.\/\w+/,      // 실행 파일 실행
                /^mvn\s+/,
                /^gradle\s+/,
                /^chmod\s+/,
                /^ls\s*/,
                /^pwd\s*/,
                /^echo\s+/
            ];

            for (const pattern of commandPatterns) {
                if (pattern.test(message)) {
                    console.log(`[TerminalMonitorService] Found command: "${message.trim()}"`);
                    return message.trim();
                }
            }
        }

        // 로그에서 찾지 못한 경우, 저장된 명령어에서 찾기
        console.log(`[TerminalMonitorService] No command found in logs, checking stored commands`);
        console.log(`[TerminalMonitorService] Stored commands count: ${this.recentCommands.size}`);

        // 가장 최근 명령어 찾기 (시간순으로 정렬)
        const sortedCommands = Array.from(this.recentCommands.entries())
            .sort((a, b) => b[1].timestamp - a[1].timestamp);

        console.log(`[TerminalMonitorService] Sorted commands:`, sortedCommands.map(([key, ctx]) => `${key} (${Math.round((Date.now() - ctx.timestamp) / 1000)}초 전)`));

        // 스크립트 실행 명령어 우선 찾기
        for (const [key, context] of sortedCommands) {
            const timeSinceCommand = Date.now() - context.timestamp;
            if (timeSinceCommand < 30000) { // 30초 이내
                const command = key.split(':').slice(1).join(':');
                // 스크립트 실행 명령어 우선 선택
                if (command.startsWith('./') || command.includes('.sh') || command.includes('mvn') || command.includes('gradle')) {
                    console.log(`[TerminalMonitorService] Found script command: "${key}" (${Math.round(timeSinceCommand / 1000)}초 전)`);
                    return command;
                }
            }
        }

        // 스크립트 명령어가 없으면 가장 최근 명령어 선택
        for (const [key, context] of sortedCommands) {
            const timeSinceCommand = Date.now() - context.timestamp;
            if (timeSinceCommand < 30000) { // 30초 이내
                console.log(`[TerminalMonitorService] Found stored command: "${key}" (${Math.round(timeSinceCommand / 1000)}초 전)`);
                return key.split(':').slice(1).join(':'); // 터미널 이름 제거하고 명령어만 반환
            }
        }

        console.log(`[TerminalMonitorService] No recent command found`);
        return null;
    }

    /**
     * LLM에게 오류 수정을 요청합니다.
     */
    private async getCorrectedCommandFromLlm(failedCommand: string, errorOutput: string, terminalName: string): Promise<string | null> {
        if (!this.llmService) {
            return null;
        }

        try {
            // 오류 유형에 따른 특화된 가이드라인 생성
            let specificGuidance = '';

            if (errorOutput.includes('esbuild') && errorOutput.includes('SyntaxError')) {
                specificGuidance = 'esbuild 바이너리가 손상된 것 같습니다. node_modules를 완전히 삭제하고 재설치하는 명령어를 제안해주세요.';
            } else if (errorOutput.includes('ENOTEMPTY')) {
                specificGuidance = '디렉토리가 비어있지 않아서 삭제할 수 없습니다. 강제 삭제 명령어를 제안해주세요.';
            } else if (errorOutput.includes('Cannot find package') && errorOutput.includes('vite')) {
                specificGuidance = 'vite 패키지가 누락되었습니다. 의존성을 재설치하는 명령어를 제안해주세요.';
            } else if (errorOutput.includes('npm error code')) {
                specificGuidance = 'npm 설치 중 오류가 발생했습니다. 캐시를 정리하고 재설치하는 명령어를 제안해주세요.';
            } else if (errorOutput.includes('ERR_MODULE_NOT_FOUND')) {
                specificGuidance = '모듈을 찾을 수 없습니다. 의존성을 재설치하는 명령어를 제안해주세요.';
            } else if (errorOutput.includes('failed to load config from') && errorOutput.includes('vite.config.js')) {
                specificGuidance = 'vite 설정 파일을 로드할 수 없습니다. 의존성을 재설치하는 명령어를 제안해주세요.';
            } else if (errorOutput.includes('Port') && errorOutput.includes('was already in use')) {
                specificGuidance = '포트가 이미 사용 중입니다. 다른 포트를 사용하거나 기존 프로세스를 종료하는 명령어를 제안해주세요.';
            } else if (errorOutput.includes('BUILD FAILURE') || errorOutput.includes('Failed to execute goal')) {
                specificGuidance = 'Maven 빌드가 실패했습니다. 의존성을 정리하고 재빌드하는 명령어를 제안해주세요.';
            } else if (errorOutput.includes('APPLICATION FAILED TO START')) {
                specificGuidance = 'Spring Boot 애플리케이션이 시작에 실패했습니다. 설정을 확인하고 재시작하는 명령어를 제안해주세요.';
            } else if (errorOutput.includes('No compiler is provided in this environment') || errorOutput.includes('Perhaps you are running on a JRE rather than a JDK')) {
                specificGuidance = 'Java 컴파일러가 누락되었습니다. JRE 대신 JDK가 필요합니다. 다음 명령어로 Java 17 JDK를 설정하세요: export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home && export PATH=$JAVA_HOME/bin:$PATH';
            } else if (errorOutput.includes('JAVA_HOME environment variable is not defined correctly')) {
                specificGuidance = 'JAVA_HOME 환경 변수가 올바르게 설정되지 않았습니다. 올바른 Java 17 JDK 경로를 설정하세요: export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home && export PATH=$JAVA_HOME/bin:$PATH';
            } else if (errorOutput.includes('UnsupportedClassVersionError') || errorOutput.includes('class file version 61.0') || errorOutput.includes('only recognizes class file versions up to 52.0')) {
                specificGuidance = 'Java 버전 불일치 오류입니다. Java 17 JDK를 사용해야 합니다. export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home && export PATH=$JAVA_HOME/bin:$PATH && mvn clean compile';
            } else if (errorOutput.includes('Port 8080 was already in use') || errorOutput.includes('Address already in use') || errorOutput.includes('port is already in use') || errorOutput.includes('Web server failed to start. Port 8080 was already in use')) {
                specificGuidance = '포트 8080이 이미 사용 중입니다. 기존 프로세스를 강제 종료한 후 재실행하세요. **lsof -ti:8080 | xargs kill -9 && mvn spring-boot:run**';
            } else if (errorOutput.includes('Invalid Spring Boot version') || errorOutput.includes('Spring Boot compatibility range is >=3.4.0')) {
                specificGuidance = 'Spring Boot 3.2.0은 더 이상 지원되지 않습니다. Spring Boot 3.4.0 이상을 사용하세요. curl https://start.spring.io/starter.zip -d dependencies=web,data-jpa,h2 -d type=maven-project -d language=java -d bootVersion=3.4.0 -d baseDir=project-name -d groupId=com.example -d artifactId=demo -d name=demo -d description="Demo project for Spring Boot" -d packageName=com.example.demo -d packaging=jar -d javaVersion=17 -o project.zip';
            } else if (errorOutput.includes('must be a valid version but is') && errorOutput.includes('spring-boot.version')) {
                specificGuidance = 'POM 파일에서 spring-boot.version 변수가 정의되지 않았습니다. POM 파일을 수정하여 Spring Boot 3.4.0 버전을 직접 지정하세요. sed -i \'s/${spring-boot.version}/3.4.0/g\' pom.xml';
            } else if (errorOutput.includes('ProjectBuildingException') || errorOutput.includes('MojoFailureException') || errorOutput.includes('MojoExecutionException')) {
                specificGuidance = 'Maven 프로젝트 빌드에 실패했습니다. POM 파일을 확인하고 의존성을 정리하는 명령어를 제안해주세요.';
            } else if (errorOutput.includes('Failed to connect to') && errorOutput.includes('port')) {
                specificGuidance = '서버에 연결할 수 없습니다. 서버가 실행 중인지 확인하고, 실행되지 않았다면 먼저 서버를 시작하는 명령어를 제안해주세요.';
            } else if (errorOutput.includes('Unable to access jarfile')) {
                specificGuidance = 'JAR 파일에 접근할 수 없습니다. 먼저 프로젝트를 빌드하여 JAR 파일을 생성하는 명령어를 제안해주세요.';
            } else if (errorOutput.includes('surefirebooter') || errorOutput.includes('The forked VM terminated without properly saying goodbye')) {
                specificGuidance = 'Maven Surefire 플러그인 오류입니다. Java 17 JDK 경로를 직접 설정하세요: export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home && export PATH=$JAVA_HOME/bin:$PATH';
            } else if (errorOutput.includes('zip file is empty')) {
                specificGuidance = 'ZIP 파일이 비어있습니다. Maven 빌드 과정에서 문제가 발생했습니다. 의존성을 정리하고 재빌드하는 명령어를 제안해주세요.';
            } else if (errorOutput.includes('UnsupportedClassVersionError') || errorOutput.includes('has been compiled by a more recent version')) {
                specificGuidance = 'Java 버전 호환성 문제입니다. 빌드에 사용한 Java 버전과 실행에 사용한 Java 버전이 다릅니다. 같은 Java 버전으로 빌드하고 실행하는 명령어를 제안해주세요.';
            } else if (errorOutput.includes('PluginExecutionException')) {
                specificGuidance = 'Maven 플러그인 실행에 실패했습니다. 플러그인 설정을 확인하고 의존성을 정리한 후 재빌드하는 명령어를 제안해주세요.';
            }

            const onWindows = process.platform === 'win32';
            const andGuidance = onWindows
                ? `PowerShell에서는 &&를 명령 연결자로 사용하지 마세요. 여러 명령을 연결해야 하면 cmd.exe /d /c "명령1 && 명령2" 형태로 cmd.exe 내부에서만 사용하세요.`
                : `여러 명령이 필요하면 && 로 안전하게 연결하세요.`;

            const errorCorrectionPrompt = `다음 명령어가 터미널에서 실행 중 오류가 발생했습니다. 오류를 분석하고 수정된 명령어를 제안해주세요.

실행된 명령어: ${failedCommand}
터미널: ${terminalName}
오류 출력:
${errorOutput}

${specificGuidance}

**MojoExecutionException 특별 분석:**
이 오류는 주로 Maven POM 파일의 설정 문제로 발생합니다:
1. spring-boot.version 변수가 정의되지 않았거나 잘못된 경우
2. Maven 플러그인 버전이 유효하지 않은 경우  
3. Java 환경 변수 설정 문제
4. Maven 의존성 다운로드 실패

**일반적인 해결 방법:**
- spring-boot.version 변수 문제: sed -i 's/\${spring-boot.version}/3.4.0/g' pom.xml
- Java 환경 변수: export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home && export PATH=$JAVA_HOME/bin:$PATH
- Maven 캐시 정리: mvn clean && rm -rf ~/.m2/repository/org/springframework/boot/
- **포트 확인 후 해제**: 
  1. 포트 사용 프로세스 확인: lsof -i:8080
  2. 강제 종료: lsof -ti:8080 | xargs kill -9
  3. 2초 대기 후 재확인: sleep 2 && lsof -i:8080
  4. 여전히 사용 중이면 pkill 사용: pkill -f "spring-boot" && pkill -f "java.*8080"
  5. 최종 확인: lsof -i:8080 || echo "포트 해제 완료"
  6. 애플리케이션 실행: mvn spring-boot:run
- 다른 포트 사용: mvn spring-boot:run -Dspring-boot.run.arguments="--server.port=8081"

**새로운 패턴 발견**: 이 오류가 기존 패턴과 다른 새로운 유형이라면, 다음 정보도 함께 제공해주세요:
- 새로운 오류 패턴의 특징
- 향후 유사한 오류를 자동으로 감지할 수 있는 키워드
- 이 패턴에 대한 일반적인 해결 방법

수정된 명령어를 JSON 형식으로 응답해주세요:
{
  "correctedCommand": "수정된 명령어",
  "reasoning": "오류 원인과 해결 방법 설명",
  "newPattern": {
    "isNew": true/false,
    "pattern": "새로운 오류 패턴 키워드",
    "description": "패턴 설명",
    "solution": "일반적인 해결 방법"
  }
}

${andGuidance}`;

            const response = await this.llmService.sendMessageForErrorCorrection(errorCorrectionPrompt);

            // JSON 응답 파싱
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                if (parsed.correctedCommand) {
                    // 새로운 패턴 발견 시 처리
                    if (parsed.newPattern && parsed.newPattern.isNew) {
                        console.log(`[TerminalMonitorService] 새로운 오류 패턴 발견: ${parsed.newPattern.pattern}`);
                        await this.addErrorPattern(
                            parsed.newPattern.pattern,
                            'high',
                            parsed.newPattern.description
                        );

                        // 사용자에게 새로운 패턴 학습 알림
                        vscode.window.showInformationMessage(
                            `🆕 새로운 오류 패턴을 발견했습니다: ${parsed.newPattern.pattern}`,
                            '패턴 저장됨'
                        );
                    }

                    console.log(`[TerminalMonitorService] LLM 수정 제안: ${parsed.correctedCommand}`);
                    console.log(`[TerminalMonitorService] 수정 이유: ${parsed.reasoning}`);
                    return parsed.correctedCommand;
                }
            }
        } catch (error) {
            console.error('[TerminalMonitorService] LLM 오류 수정 요청 실패:', error);
        }

        return null;
    }

    /**
     * 수정된 명령어를 실행합니다.
     */
    private async executeCorrectedCommand(terminalName: string, correctedCommand: string): Promise<void> {
        try {
            // 터미널 찾기
            const terminal = vscode.window.terminals.find(t => t.name === terminalName);
            if (!terminal) {
                console.log(`[TerminalMonitorService] 터미널을 찾을 수 없음: ${terminalName}`);
                return;
            }

            // 수정된 명령어 실행
            terminal.sendText(correctedCommand);

            // 사용자에게 알림
            this.notificationService.showInfoMessage(
                `🔧 자동 오류 수정: ${correctedCommand}`
            );

            // OUTPUT 채널에 로그 (설정에 따라)
            if (this.outputLogEnabled) {
                this.outputChannel.appendLine(`[${new Date().toISOString()}] 자동 오류 수정 실행: ${correctedCommand}`);
            }

            if (this.outputLogEnabled) {
                console.log(`[TerminalMonitorService] 수정된 명령어 실행: ${correctedCommand}`);
            }

        } catch (error) {
            console.error('[TerminalMonitorService] 수정된 명령어 실행 실패:', error);
        }
    }

    /**
     * 오류 재시도 횟수를 리셋합니다.
     */
    public resetErrorRetryCount(): void {
        this.errorRetryCount = 0;
        this.recentCommands.clear();
        console.log('[TerminalMonitorService] 오류 재시도 횟수 리셋');
    }

    /**
     * 터미널 로그를 종합하여 오류 수정 상황을 LLM에게 전송하고 채팅창에 출력합니다.
     */
    public async analyzeAndCorrectErrors(): Promise<void> {
        if (this.errorCorrectionInProgress) {
            console.log('[TerminalMonitorService] 오류 수정이 이미 진행 중입니다.');
            return;
        }

        if (!this.llmService) {
            console.log('[TerminalMonitorService] LLM 서비스가 초기화되지 않았습니다.');
            return;
        }

        this.errorCorrectionInProgress = true;

        try {
            // 최근 오류 로그 수집
            const recentLogs = this.getRecentErrorLogs();
            if (recentLogs.length === 0) {
                console.log('[TerminalMonitorService] 분석할 오류 로그가 없습니다.');
                return;
            }

            // 오류 분석을 위한 컨텍스트 구성
            const errorContext = this.buildErrorContext(recentLogs);

            // LLM에게 오류 분석 요청
            const correctionAnalysis = await this.requestErrorCorrectionFromLLM(errorContext);

            // 채팅창에 오류 수정 상황 출력
            await this.sendErrorCorrectionToChat(correctionAnalysis);

        } catch (error) {
            console.error('[TerminalMonitorService] 오류 분석 및 수정 실패:', error);
        } finally {
            this.errorCorrectionInProgress = false;
        }
    }

    /**
     * 최근 오류 로그를 수집합니다.
     */
    private getRecentErrorLogs(): LogEntry[] {
        const now = Date.now();
        const oneHourAgo = now - (60 * 60 * 1000); // 1시간 전

        return this.logEntries
            .filter(log => log.timestamp >= oneHourAgo && log.level === 'error')
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, 20); // 최근 20개 오류만
    }

    /**
     * 오류 분석을 위한 컨텍스트를 구성합니다.
     */
    private buildErrorContext(recentLogs: LogEntry[]): string {
        const context = {
            timestamp: new Date().toISOString(),
            totalErrors: recentLogs.length,
            recentErrors: recentLogs.map(log => ({
                time: new Date(log.timestamp).toLocaleString(),
                source: log.source,
                level: log.level,
                message: log.message,
                rawOutput: log.rawOutput
            })),
            errorPatterns: this.errorPatterns.map(pattern => ({
                pattern: pattern.pattern,
                severity: pattern.severity,
                description: pattern.description
            })),
            recentCommands: Array.from(this.recentCommands.values()).map(cmd => ({
                command: cmd.command,
                workingDirectory: cmd.workingDirectory,
                retryCount: cmd.retryCount,
                timestamp: new Date(cmd.timestamp).toLocaleString()
            }))
        };

        return JSON.stringify(context, null, 2);
    }

    /**
     * LLM에게 오류 수정 요청을 전송합니다.
     */
    private async requestErrorCorrectionFromLLM(errorContext: string): Promise<string> {
        const systemPrompt = `당신은 전문적인 소프트웨어 개발자입니다. 터미널에서 발생한 오류들을 분석하고 수정 방안을 제시해주세요.

주요 지침:
1. 오류 로그를 분석하여 근본 원인을 파악하세요.
2. 각 오류에 대한 구체적인 수정 방안을 제시하세요.
3. 명령어 실행 순서나 의존성 문제가 있는지 확인하세요.
4. 한글로 설명을 제공하세요.
5. 실행 가능한 명령어나 코드 수정 사항을 포함하세요.

특별 가이드 - 포트 사용 오류 해결:
포트 사용 오류("Port was already in use")가 발생할 경우, 현재 사용자의 OS 환경에 맞는 포트 해제 방법을 제시하세요:

${this.generateOSSpecificPortReleaseGuide()}

**⚠️ 중요: 포트 해제 명령은 새로운 터미널에서 실행해야 합니다!**
- 현재 실행 중인 터미널이 아닌 새로운 터미널에서 포트 해제 명령을 실행하세요.
- 백그라운드 프로세스는 계속 실행될 수 있으므로 강력한 방법을 사용하세요.
- 여러 포트를 동시에 사용하는 경우 모든 관련 포트를 확인하세요.

오류 분석 결과를 다음 형식으로 제공해주세요:
## 🔍 오류 분석 결과

### 📊 오류 요약
- 총 오류 수: [숫자]
- 주요 오류 유형: [유형들]
- 심각도: [low/medium/high/critical]

### 🎯 근본 원인
[오류의 근본 원인 분석]

### 🛠️ 수정 방안
1. [수정 방안 1]
2. [수정 방안 2]
3. [수정 방안 3]

### 💡 권장 명령어
\`\`\`bash
[수정을 위한 명령어들]
\`\`\`

### ⚠️ 주의사항
[실행 시 주의할 점들]`;

        const userPrompt = `다음은 터미널에서 발생한 오류 로그들입니다. 분석하고 수정 방안을 제시해주세요:

${errorContext}`;

        try {
            // LLM 서비스를 통해 오류 분석 요청
            const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

            // 임시 웹뷰 생성 (오류 분석용)
            const tempWebview = this.currentWebview;
            if (!tempWebview) {
                throw new Error('웹뷰가 설정되지 않았습니다.');
            }

            // LLM 서비스의 handleUserMessageAndRespond 메서드 사용
            await this.llmService!.handleUserMessageAndRespond(
                fullPrompt,
                tempWebview,
                'error-correction' as any
            );

            return '오류 분석이 완료되었습니다. 결과를 확인해주세요.';
        } catch (error) {
            console.error('[TerminalMonitorService] LLM 오류 수정 요청 실패:', error);
            return '오류 분석 중 문제가 발생했습니다.';
        }
    }

    /**
     * 오류 수정 결과를 채팅창에 전송합니다.
     */
    private async sendErrorCorrectionToChat(analysis: string): Promise<void> {
        if (!this.currentWebview) {
            console.log('[TerminalMonitorService] 웹뷰가 초기화되지 않았습니다.');
            return;
        }

        try {
            // 채팅창에 오류 수정 분석 결과 전송
            await this.currentWebview.postMessage({
                command: 'receiveMessage',
                sender: 'AIDEV-IDE',
                text: analysis,
                timestamp: new Date().toISOString()
            });

            console.log('[TerminalMonitorService] 오류 수정 분석 결과를 채팅창에 전송했습니다.');
        } catch (error) {
            console.error('[TerminalMonitorService] 채팅창 전송 실패:', error);
        }
    }


    /**
     * 수동으로 오류 분석을 트리거합니다.
     */
    public async triggerErrorAnalysis(): Promise<void> {
        console.log('[TerminalMonitorService] 수동 오류 분석을 시작합니다.');
        await this.analyzeAndCorrectErrors();
    }

    /**
     * 명령어 실행을 즉시 중지합니다.
     */
    public stopCommandExecution(): void {
        this.isCommandExecutionStopped = true;
        console.log('[TerminalMonitorService] 명령어 실행이 중지되었습니다.');

        // 활성 터미널들 종료
        this.activeTerminals.forEach(terminal => {
            if (terminal.exitStatus === undefined) {
                terminal.sendText('\x03'); // Ctrl+C 전송
            }
        });
    }

    /**
     * 명령어 실행 중지 상태를 확인합니다.
     */
    public isExecutionStopped(): boolean {
        return this.isCommandExecutionStopped;
    }

    /**
     * 명령어 실행 중지 상태를 리셋합니다.
     */
    public resetExecutionStop(): void {
        this.isCommandExecutionStopped = false;
        console.log('[TerminalMonitorService] 명령어 실행 중지 상태가 리셋되었습니다.');
    }
}
