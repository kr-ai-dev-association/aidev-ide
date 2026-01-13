/**
 * Core Manager System
 * 모든 매니저와 추상화 레이어를 통합
 */

// =============== Base ===============
export * from './managers/base';

// =============== Action ===============
export { ActionManager } from './managers/action/ActionManager';
export { ActionRegistry } from './managers/action/ActionRegistry';
export { ActionValidator } from './managers/action/ActionValidator';
export { ActionMapper } from './managers/action/ActionMapper';
export { IntentDetector } from './managers/action/IntentDetector';
export type {
    IntentDetectionResult,
    IntentCategory,
    IntentSubtype,
    TaskType as IntentTaskType
} from './managers/action/IntentDetector';
export type {
    Action,
    ActionContext,
    ActionDefinition,
    ActionHandler,
    ActionMappingResult,
    ValidationRule,
    Permission,
    ActionType,
    LLMResponse as ActionLLMResponse
} from './managers/action/types';
export * from './managers/action/file';

// =============== Execution/Terminal/Task ===============
export * from './managers/execution';
export * from './managers/terminal';
export { TaskManager, PlanItem, PlanQueue, PlanItemStatus } from './managers/task/TaskManager';
export { TaskQueue } from './managers/task/TaskQueue';
export { TaskScheduler } from './managers/task/TaskScheduler';
export { TaskRetry } from './managers/task/TaskRetry';
export { PlanManager } from './managers/task/PlanManager';
export type {
    Priority,
    TaskStatus,
    TaskType as TaskQueueType,
    Task,
    TaskProgress,
    TaskMetadata,
    TaskResult,
    TaskError,
    TaskExecutionContext,
    TaskHandler
} from './managers/task/types';

// =============== Error ===============
export * from './managers/error';
export type { ParsedError, ErrorSource, ErrorCategory, ErrorSeverity, ErrorPattern as CoreErrorPattern, ErrorStats } from './managers/error/types';

// =============== Investigation ===============
export * from './managers/investigation';

// =============== Context/State/Conversation/Webview/Utils ===============
export * from './managers/context';
export * from './managers/state';
export * from './managers/conversation';
export * from './webview';
export * from './utils';

// =============== Model ===============
export * from './managers/model/types';
export { LLMApiClient } from './managers/model/LLMApiClient';
export type { LLMMessagePart, LLMRequestOptions } from './managers/model/LLMApiClient';
export { LLMManager } from './managers/model/LLMManager';
export type { LLMMessagePart as LLMManagerMessagePart, LLMRequestOptions as LLMManagerRequestOptions, LLMResponse } from './managers/model/LLMManager';
export { ModelConnectionService } from './managers/model/ModelConnectionService';
export type { ParsedLLMResponse } from './managers/model/llm/ILLMAdapter';

// =============== Project ===============
export { ProjectManager } from './managers/project/ProjectManager';
export { ProjectDetector } from './managers/project/ProjectDetector';
export { ProjectIndexer } from './managers/project/ProjectIndexer';
export { ConfigParser } from './managers/project/ConfigParser';
export type {
    ProjectProfile,
    FrameworkMatch,
    ProjectType,
    BuildTool,
    ProjectInfo,
    ConfigFile,
    BuildCommands,
    Dependency,
    ProjectMetadata,
    FileTreeNode,
    FileMetadata,
    FileIndex,
    IndexedFile,
    Definition,
    Import,
    Export
} from './managers/project/types';
export type {
    Definition as CodeParserDefinition,
    CodeDefinitions,
    FileDefinitions,
    DefinitionType
} from './managers/project/codeParser/ICodeParserAdapter';

// =============== OS Abstraction (from execution) ===============
export * from './managers/execution/os/IOperatingSystemAdapter';
export * from './managers/execution/os/DarwinAdapter';
export * from './managers/execution/os/WindowsAdapter';
export * from './managers/execution/os/LinuxAdapter';
export * from './managers/execution/os/OSAdapterFactory';

// =============== LLM Abstraction (from model) ===============
export * from './managers/model/llm/ILLMAdapter';
export * from './managers/model/llm/GptAdapter';

// =============== Framework Abstraction (from project) ===============

// =============== Code Parser Abstraction (from project) ===============
export * from './managers/project/codeParser/ICodeParserAdapter';
export * from './managers/project/codeParser/TreeSitterAdapter';
export * from './managers/project/codeParser/languageParser';
