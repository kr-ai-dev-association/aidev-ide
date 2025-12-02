/**
 * Execution Manager 타입 정의
 * 액션을 실제 실행으로 변환하는 매니저의 타입들
 */

/**
 * 실행 옵션
 */
export interface ExecutionOptions {
    cwd?: string;
    env?: Record<string, string>;
    shell?: string | boolean;
    timeout?: number;
    encoding?: BufferEncoding;
    killSignal?: NodeJS.Signals;
    maxBuffer?: number;
}

/**
 * 실행 결과
 */
export interface ExecutionResult {
    success: boolean;
    exitCode: number;
    stdout: string;
    stderr: string;
    duration: number;
    pid?: number;
    error?: ExecutionError;
}

/**
 * 실행 에러
 */
export interface ExecutionError {
    code: string;
    message: string;
    killed: boolean;
    signal?: NodeJS.Signals;
}

/**
 * 프로세스 정보
 */
export interface Process {
    pid: number;
    command: string;
    cwd: string;
    startTime: number;
    status: ProcessStatus;
    metadata?: ProcessMetadata;
}

/**
 * 프로세스 상태
 */
export enum ProcessStatus {
    STARTING = 'starting',
    RUNNING = 'running',
    STOPPING = 'stopping',
    STOPPED = 'stopped',
    FAILED = 'failed',
    KILLED = 'killed'
}

/**
 * 프로세스 메타데이터
 */
export interface ProcessMetadata {
    type?: 'dev-server' | 'build' | 'test' | 'app';
    port?: number;
    url?: string;
    framework?: string;
}

/**
 * 프로세스 모니터
 */
export interface ProcessMonitor {
    process: Process;
    onOutput: (callback: (data: string) => void) => void;
    onError: (callback: (data: string) => void) => void;
    onExit: (callback: (code: number, signal?: string) => void) => void;
    stop: () => Promise<void>;
}

/**
 * 스트림 데이터
 */
export interface StreamData {
    type: 'stdout' | 'stderr';
    pid: number;
    data: string;
    timestamp: number;
}

/**
 * 스트림 핸들러
 */
export type StreamHandler = (data: StreamData) => void;

/**
 * 에러 정보
 */
export interface ErrorInfo {
    type: ErrorType;
    message: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    source: 'terminal' | 'process' | 'system';
    timestamp: number;
    details?: ErrorDetails;
}

/**
 * 에러 타입
 */
export enum ErrorType {
    PORT_CONFLICT = 'port_conflict',
    COMMAND_NOT_FOUND = 'command_not_found',
    PERMISSION_DENIED = 'permission_denied',
    SYNTAX_ERROR = 'syntax_error',
    RUNTIME_ERROR = 'runtime_error',
    NETWORK_ERROR = 'network_error',
    FILE_NOT_FOUND = 'file_not_found',
    OUT_OF_MEMORY = 'out_of_memory',
    TIMEOUT = 'timeout',
    UNKNOWN = 'unknown'
}

/**
 * 에러 상세 정보
 */
export interface ErrorDetails {
    command?: string;
    file?: string;
    line?: number;
    column?: number;
    port?: number;
    stackTrace?: string;
    suggestion?: string;
}

/**
 * 실행 통계
 */
export interface ExecutionStats {
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    averageDuration: number;
    lastExecutionTime: number;
}

/**
 * 장기 실행 명령어 정보
 */
export interface LongRunningCommand {
    pattern: RegExp;
    description: string;
    defaultPort?: number;
    shutdownGracePeriod?: number;
}

