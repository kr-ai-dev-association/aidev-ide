/**
 * Managers Module
 * 매니저 기반 아키텍처의 진입점
 */

// Action Manager
export * from './action';

// Execution Manager
export * from './execution';

// Terminal Manager
export * from './terminal';

// 타입 re-export
export type {
    // Action types
    Action,
    ActionType,
    ActionResult,
    LLMRequest,
    LLMResponse,
    ActionContext,
    ActionMappingResult,
    ValidationResult,
    Permission,
    FileOperationType
} from './action/types';

export type {
    // Execution types
    ExecutionOptions,
    ExecutionResult,
    Process,
    ProcessStatus,
    ProcessMonitor,
    StreamData,
    ErrorInfo,
    ErrorType,
    ExecutionStats
} from './execution/types';

export type {
    // Terminal types
    TerminalSession as ITerminalSession,
    TerminalStatus,
    TerminalCommand,
    TerminalCreateOptions,
    TerminalStats,
    HistoryEntry,
    HistoryFilter
} from './terminal/types';

