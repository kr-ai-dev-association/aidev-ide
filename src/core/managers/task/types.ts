/**
 * Task Manager 타입 정의
 * 비동기 작업 큐를 관리하는 매니저의 타입들
 */

/**
 * 작업 우선순위
 */
export enum Priority {
    CRITICAL = 0,
    HIGH = 1,
    NORMAL = 2,
    LOW = 3,
    BACKGROUND = 4
}

/**
 * 작업 상태
 */
export enum TaskStatus {
    PENDING = 'pending',
    IN_PROGRESS = 'in_progress',
    PAUSED = 'paused',
    COMPLETED = 'completed',
    FAILED = 'failed',
    CANCELLED = 'cancelled',
    SKIPPED = 'skipped'
}

/**
 * 작업 타입
 */
export enum TaskType {
    ACTION = 'action',
    COMMAND = 'command',
    FILE_OPERATION = 'file_operation',
    CODE_GENERATION = 'code_generation',
    ANALYSIS = 'analysis',
    REFACTOR = 'refactor'
}

/**
 * 작업
 */
export interface Task {
    id: string;
    type: TaskType;
    title: string;
    description?: string;
    priority: Priority;
    status: TaskStatus;
    progress?: TaskProgress;
    dependencies?: string[];
    metadata?: TaskMetadata;
    createdAt: number;
    startedAt?: number;
    completedAt?: number;
    result?: TaskResult;
    error?: TaskError;
}

/**
 * 작업 진행률
 */
export interface TaskProgress {
    current: number;
    total: number;
    percentage: number;
    message?: string;
}

/**
 * 작업 메타데이터
 */
export interface TaskMetadata {
    source?: 'user' | 'llm' | 'system';
    actionId?: string;
    projectPath?: string;
    retryCount?: number;
    maxRetries?: number;
    timeout?: number;
    tags?: string[];
}

/**
 * 작업 결과
 */
export interface TaskResult {
    success: boolean;
    data?: any;
    message?: string;
    duration: number;
    output?: string;
}

/**
 * 작업 에러
 */
export interface TaskError {
    code: string;
    message: string;
    stack?: string;
    recoverable: boolean;
    suggestion?: string;
}

/**
 * 작업 실행 컨텍스트
 */
export interface TaskExecutionContext {
    task: Task;
    signal: AbortSignal;
    onProgress: (progress: TaskProgress) => void;
    onLog: (message: string) => void;
}

/**
 * 작업 핸들러
 */
export type TaskHandler = (context: TaskExecutionContext) => Promise<TaskResult>;

/**
 * 재시도 전략
 */
export interface RetryStrategy {
    maxRetries: number;
    initialDelay: number;
    maxDelay: number;
    backoffMultiplier: number;
    retryableErrors?: string[];
}

/**
 * 작업 큐 설정
 */
export interface TaskQueueConfig {
    maxConcurrent: number;
    defaultPriority: Priority;
    defaultTimeout: number;
    retryStrategy: RetryStrategy;
    persistTasks: boolean;
}

/**
 * 작업 필터
 */
export interface TaskFilter {
    status?: TaskStatus[];
    type?: TaskType[];
    priority?: Priority[];
    startTime?: number;
    endTime?: number;
    tags?: string[];
}

/**
 * 작업 통계
 */
export interface TaskStats {
    total: number;
    byStatus: Record<TaskStatus, number>;
    byType: Record<TaskType, number>;
    byPriority: Record<Priority, number>;
    averageDuration: number;
    successRate: number;
}

/**
 * 작업 이벤트
 */
export enum TaskEvent {
    ENQUEUED = 'enqueued',
    STARTED = 'started',
    PROGRESS = 'progress',
    COMPLETED = 'completed',
    FAILED = 'failed',
    CANCELLED = 'cancelled',
    RETRYING = 'retrying'
}

/**
 * 작업 이벤트 데이터
 */
export interface TaskEventData {
    event: TaskEvent;
    task: Task;
    timestamp: number;
    data?: any;
}

/**
 * 작업 이벤트 리스너
 */
export type TaskEventListener = (data: TaskEventData) => void;

