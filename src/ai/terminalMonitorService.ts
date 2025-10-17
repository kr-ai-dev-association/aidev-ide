import * as vscode from 'vscode';
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
    private onErrorEmitter = new vscode.EventEmitter<TerminalErrorEvent>();
    public readonly onError = this.onErrorEmitter.event;

    // 오류 수정 관련 속성
    private llmService: LlmService | undefined = undefined;
    private errorRetryCount = 0;
    private readonly MAX_ERROR_RETRIES = 3;
    private recentCommands: Map<string, CommandErrorContext> = new Map();
    private autoCorrectionEnabled = true;

    constructor(notificationService: NotificationService) {
        this.notificationService = notificationService;
        this.outputChannel = vscode.window.createOutputChannel('AIDEV-IDE Terminal Monitor');
        this.initializeErrorPatterns();
    }

    /**
     * LLM 서비스를 설정합니다.
     */
    public setLlmService(llmService: LlmService): void {
        this.llmService = llmService;
        console.log('[TerminalMonitorService] LLM 서비스 설정 완료');
    }

    /**
     * 자동 오류 수정 기능을 활성화/비활성화합니다.
     */
    public setAutoCorrectionEnabled(enabled: boolean): void {
        this.autoCorrectionEnabled = enabled;
        console.log(`[TerminalMonitorService] 자동 오류 수정 ${enabled ? '활성화' : '비활성화'}`);
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
            { pattern: 'ENOENT:', severity: 'medium', description: '파일 또는 디렉토리 없음' },
            { pattern: 'EACCES:', severity: 'medium', description: '권한 거부' },
            { pattern: 'EISDIR:', severity: 'medium', description: '디렉토리 관련 에러' },
            { pattern: 'ELIFECYCLE', severity: 'high', description: 'npm lifecycle 에러' },
            { pattern: 'npm ERR!', severity: 'high', description: 'npm 에러' },
            { pattern: 'error Command failed with exit code', severity: 'high', description: '명령 실패 (Yarn/Pnpm)' },

            // 빌드/컴파일 에러
            { pattern: 'Build failed:', severity: 'critical', description: '빌드 실패' },
            { pattern: 'Compilation failed:', severity: 'critical', description: '컴파일 실패' },
            { pattern: 'Failed to compile:', severity: 'critical', description: '컴파일 실패' },
            { pattern: 'Build error:', severity: 'critical', description: '빌드 에러' },
            { pattern: 'ERROR in', severity: 'critical', description: '웹팩/빌드 에러' },
            { pattern: 'Compilation error', severity: 'critical', description: '컴파일 에러' },

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
            console.log('[TerminalMonitorService] 이미 모니터링 중입니다.');
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

        console.log(`[TerminalMonitorService] 외부 출력 수신: ${source} - ${data.substring(0, 100)}...`);
        
        // 터미널 이름 추출 (source에서)
        const terminalName = source.includes(':') ? source.split(':')[0] : 'external';
        
        this.processTerminalOutput(terminalName, data);
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

        console.log('[TerminalMonitorService] 터미널 모니터링 중지');
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
            console.log(`[TerminalMonitorService] 터미널 수 변경: ${this.lastTerminalCount} → ${currentTerminalCount}`);
            this.logTerminalEvent('info', 'terminal', `터미널 수 변경: ${this.lastTerminalCount} → ${currentTerminalCount}`);
            this.lastTerminalCount = currentTerminalCount;
        }
    }

    /**
     * 터미널 이벤트를 로그에 기록합니다.
     */
    private logTerminalEvent(level: 'info' | 'warn' | 'error' | 'debug', source: 'terminal' | 'console' | 'output', message: string): void {
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
                console.log(`[TerminalMonitorService] 터미널 종료됨: ${terminal.name} (exit code: ${exitCode})`);

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

        console.log(`[TerminalMonitorService] processTerminalOutput called: ${terminalName} - ${data}`);

        const isErrorLike = /(^error:|^fatal:|\berror\b|\bfail(ed)?\b|\bexception\b|npm ERR!|^npm\s+error\b|ERROR in|Traceback|panic:|Exit status [1-9]|^exit status [1-9-]|Process exited \(code\s*-?\d+\)|BUILD FAILED|Missing script:|Missing script\s*:\s*"\w+")/i.test(data);
        const level: 'info' | 'warn' | 'error' = isErrorLike ? 'error' : 'info';

        console.log(`[TerminalMonitorService] isErrorLike: ${isErrorLike}, level: ${level}`);

        const logEntry: LogEntry = {
            timestamp: Date.now(),
            level,
            source: 'terminal',
            message: data.trim(),
            rawOutput: data
        };

        this.logEntries.push(logEntry);
        // 출력 채널에도 즉시 기록
        this.outputChannel.appendLine(`[${new Date().toISOString()}] ${terminalName} ${level.toUpperCase()}: ${data.trim()}`);
        const hasErr = this.checkForErrors(data);
        console.log(`[TerminalMonitorService] hasErr from checkForErrors: ${hasErr}`);

        if (isErrorLike || hasErr) {
            console.log(`[TerminalMonitorService] Error detected, firing onError event`);
            // 에러가 감지되면 출력 채널 노출
            try { this.outputChannel.show(true); } catch { }
            try {
                const recent = this.getRecentErrors(30);
                console.log(`[TerminalMonitorService] Recent errors:`, recent);
                this.onErrorEmitter.fire({
                    time: Date.now(),
                    source: terminalName,
                    message: data.trim(),
                    recentLogs: recent
                });
                console.log(`[TerminalMonitorService] onErrorEmitter.fire() called successfully`);

                // 자동 오류 수정 시도
                if (this.autoCorrectionEnabled && this.llmService) {
                    this.attemptAutoCorrection(terminalName, data.trim(), recent);
                }
            } catch (e) {
                console.warn('[TerminalMonitorService] onError emit failed:', e);
            }
        } else {
            console.log(`[TerminalMonitorService] No error detected, not firing onError event`);
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

        for (const errorPattern of this.errorPatterns) {
            if (errorPattern.regex && errorPattern.regex.test(output)) {
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

        // 에러 정보를 출력 채널에 기록
        this.outputChannel.appendLine(`[${new Date().toISOString()}] 에러 감지:`);
        errors.forEach(error => {
            this.outputChannel.appendLine(`  - ${error.pattern} (${error.severity}): ${error.description}`);
        });

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
        const errorPattern: ErrorPattern = {
            pattern,
            severity,
            description,
            regex: new RegExp(pattern, 'i')
        };

        this.errorPatterns.push(errorPattern);
        console.log(`[TerminalMonitorService] 에러 패턴 추가: ${pattern} (${severity})`);
    }


    /**
     * 출력 채널을 표시합니다.
     */
    public showOutputChannel(): void {
        this.outputChannel.show();
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
        if (!this.llmService || !this.autoCorrectionEnabled) {
            return;
        }

        try {
            // 최근 명령어 추출
            const recentCommand = this.extractRecentCommand(recentLogs);
            if (!recentCommand) {
                console.log('[TerminalMonitorService] 최근 명령어를 찾을 수 없음');
                return;
            }

            // 중복 수정 시도 방지
            const commandKey = `${terminalName}:${recentCommand}`;
            if (this.recentCommands.has(commandKey)) {
                const lastAttempt = this.recentCommands.get(commandKey)!;
                if (Date.now() - lastAttempt.timestamp < 30000) { // 30초 내 중복 방지
                    console.log('[TerminalMonitorService] 최근에 이미 수정 시도한 명령어');
                    return;
                }
            }

            // 재시도 횟수 확인
            if (this.errorRetryCount >= this.MAX_ERROR_RETRIES) {
                console.log('[TerminalMonitorService] 최대 재시도 횟수 초과');
                this.errorRetryCount = 0;
                return;
            }

            this.errorRetryCount++;
            console.log(`[TerminalMonitorService] 오류 수정 시도 ${this.errorRetryCount}/${this.MAX_ERROR_RETRIES}`);

            // LLM에게 오류 수정 요청
            const correctedCommand = await this.getCorrectedCommandFromLlm(recentCommand, errorMessage, terminalName);
            if (!correctedCommand) {
                console.log('[TerminalMonitorService] LLM에서 수정된 명령어를 받지 못함');
                return;
            }

            // 수정된 명령어 저장
            this.recentCommands.set(commandKey, {
                command: recentCommand,
                errorOutput: errorMessage,
                workingDirectory: process.cwd(),
                timestamp: Date.now(),
                terminalName
            });

            // 수정된 명령어 실행
            await this.executeCorrectedCommand(terminalName, correctedCommand);

        } catch (error) {
            console.error('[TerminalMonitorService] 자동 오류 수정 실패:', error);
        }
    }

    /**
     * 최근 로그에서 명령어를 추출합니다.
     */
    private extractRecentCommand(recentLogs: LogEntry[]): string | null {
        // 최근 로그에서 명령어 패턴 찾기
        for (let i = recentLogs.length - 1; i >= 0; i--) {
            const log = recentLogs[i];
            const message = log.message;

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
                /^mv\s+/
            ];

            for (const pattern of commandPatterns) {
                if (pattern.test(message)) {
                    return message.trim();
                }
            }
        }
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
            const errorCorrectionPrompt = `다음 명령어가 터미널에서 실행 중 오류가 발생했습니다. 오류를 분석하고 수정된 명령어를 제안해주세요.

실행된 명령어: ${failedCommand}
터미널: ${terminalName}
오류 출력:
${errorOutput}

수정된 명령어를 JSON 형식으로 응답해주세요:
{
  "correctedCommand": "수정된 명령어",
  "reasoning": "수정 이유"
}`;

            const response = await this.llmService.sendMessageForErrorCorrection(errorCorrectionPrompt);

            // JSON 응답 파싱
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                if (parsed.correctedCommand) {
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

            // OUTPUT 채널에 로그
            this.outputChannel.appendLine(`[${new Date().toISOString()}] 자동 오류 수정 실행: ${correctedCommand}`);

            console.log(`[TerminalMonitorService] 수정된 명령어 실행: ${correctedCommand}`);

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
}
