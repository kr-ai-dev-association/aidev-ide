import * as vscode from 'vscode';
import { NotificationService } from '../services/notificationService';

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

export class TerminalMonitorService {
    private notificationService: NotificationService;
    private logEntries: LogEntry[] = [];
    private errorPatterns: ErrorPattern[] = [];
    private isMonitoring: boolean = false;
    private outputChannel: vscode.OutputChannel;

    constructor(notificationService: NotificationService) {
        this.notificationService = notificationService;
        this.outputChannel = vscode.window.createOutputChannel('AIDEV-IDE Terminal Monitor');
        this.initializeErrorPatterns();
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
            
            // 빌드/컴파일 에러
            { pattern: 'Build failed:', severity: 'critical', description: '빌드 실패' },
            { pattern: 'Compilation failed:', severity: 'critical', description: '컴파일 실패' },
            { pattern: 'Failed to compile:', severity: 'critical', description: '컴파일 실패' },
            { pattern: 'Build error:', severity: 'critical', description: '빌드 에러' },
            
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
            { pattern: 'Timeout:', severity: 'medium', description: '시간 초과' }
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
        console.log('[TerminalMonitorService] 터미널 모니터링 시작');

        // TODO: VSCode 터미널 이벤트 리스너 구현
        // 현재는 주기적으로 터미널 상태를 확인하는 방식으로 대체
        this.startPeriodicMonitoring();

        // 출력 패널 모니터링
        this.monitorOutputChannels();
    }

    /**
     * 터미널 모니터링을 중지합니다.
     */
    public stopMonitoring(): void {
        this.isMonitoring = false;
        console.log('[TerminalMonitorService] 터미널 모니터링 중지');
    }

    /**
     * 터미널 출력을 처리합니다.
     * @param terminalName 터미널 이름
     * @param data 출력 데이터
     */
    private processTerminalOutput(terminalName: string, data: string): void {
        if (!this.isMonitoring) return;

        const logEntry: LogEntry = {
            timestamp: Date.now(),
            level: 'info',
            source: 'terminal',
            message: data.trim(),
            rawOutput: data
        };

        this.logEntries.push(logEntry);
        this.checkForErrors(data);
    }

    /**
     * 주기적 모니터링을 시작합니다.
     */
    private startPeriodicMonitoring(): void {
        setInterval(() => {
            if (!this.isMonitoring) return;
            
            // 터미널 상태 확인
            this.checkTerminalStatus();
        }, 2000); // 2초마다 확인
    }

    /**
     * 터미널 상태를 확인합니다.
     */
    private checkTerminalStatus(): void {
        // TODO: 실제 터미널 상태 확인 구현
        // 현재는 시뮬레이션
        const mockOutput = `[${new Date().toISOString()}] Terminal status check`;
        this.processTerminalOutput('monitor', mockOutput);
    }

    /**
     * 출력 채널들을 모니터링합니다.
     */
    private monitorOutputChannels(): void {
        // VSCode의 출력 패널들을 주기적으로 확인
        setInterval(() => {
            if (!this.isMonitoring) return;
            
            // TODO: 실제 출력 채널 모니터링 구현
            // 현재는 로그 엔트리만 추가
        }, 1000);
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
        const criticalErrors = errors.filter(e => e.severity === 'critical');
        const highErrors = errors.filter(e => e.severity === 'high');
        const mediumErrors = errors.filter(e => e.severity === 'medium');

        if (criticalErrors.length > 0) {
            this.notificationService.showErrorMessage(
                `치명적 에러 발견: ${criticalErrors.map(e => e.pattern).join(', ')}`
            );
        } else if (highErrors.length > 0) {
            this.notificationService.showWarningMessage(
                `높은 심각도 에러 발견: ${highErrors.map(e => e.pattern).join(', ')}`
            );
        } else if (mediumErrors.length > 0) {
            console.log(`[TerminalMonitorService] 중간 심각도 에러: ${mediumErrors.map(e => e.pattern).join(', ')}`);
        }

        // 에러 정보를 출력 채널에 기록
        this.outputChannel.appendLine(`[${new Date().toISOString()}] 에러 감지:`);
        errors.forEach(error => {
            this.outputChannel.appendLine(`  - ${error.pattern} (${error.severity}): ${error.description}`);
        });
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
     * 모니터링 상태를 가져옵니다.
     * @returns 모니터링 상태
     */
    public getMonitoringStatus(): { isMonitoring: boolean; logCount: number; errorCount: number } {
        const errorCount = this.logEntries.filter(log => 
            this.errorPatterns.some(pattern => 
                pattern.regex && pattern.regex.test(log.message)
            )
        ).length;

        return {
            isMonitoring: this.isMonitoring,
            logCount: this.logEntries.length,
            errorCount
        };
    }

    /**
     * 출력 채널을 표시합니다.
     */
    public showOutputChannel(): void {
        this.outputChannel.show();
    }
}
