/**
 * Core Manager System
 * 모든 매니저와 추상화 레이어를 통합
 */

// =============== Base ===============
export * from './base';

// =============== Action ===============
export { ActionManager } from './action/ActionManager';
export { ActionRegistry } from './action/ActionRegistry';
export { ActionValidator } from './action/ActionValidator';
export { ActionMapper } from './action/ActionMapper';
export { IntentDetector } from './action/IntentDetector';
export type {
    IntentDetectionResult,
    IntentCategory,
    IntentSubtype,
    TaskType as IntentTaskType
} from './action/IntentDetector';
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
} from './action/types';

// =============== Execution/Terminal/Task ===============
export * from './execution';
export * from './terminal';
export { TaskManager, PlanItem, PlanQueue, PlanItemStatus } from './task/TaskManager';
export { TaskQueue } from './task/TaskQueue';
export { TaskScheduler } from './task/TaskScheduler';
export { TaskRetry } from './task/TaskRetry';
export { PlanManager } from './task/PlanManager';
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
} from './task/types';

// =============== Error ===============
export * from './error';
export type { ParsedError, ErrorSource, ErrorCategory, ErrorSeverity, ErrorPattern as CoreErrorPattern, ErrorStats } from './error/types';

// =============== Context/State/Conversation/Webview/Utils ===============
export * from './context';
export * from './state';
export * from './conversation';
export * from './webview';
export * from './utils';

// =============== Model ===============
export * from './model/types';
export { ModelManager } from './model/ModelManager';
export { LLMApiClient } from './model/LLMApiClient';
export type { LLMMessagePart, LLMRequestOptions } from './model/LLMApiClient';
export { LLMManager } from './model/LLMManager';
export type { LLMMessagePart as LLMManagerMessagePart, LLMRequestOptions as LLMManagerRequestOptions, LLMResponse } from './model/LLMManager';
export { ModelConnectionService } from './model/ModelConnectionService';
export type { ParsedLLMResponse } from './model/llm/ILLMAdapter';

// =============== Project ===============
export { ProjectManager } from './project/ProjectManager';
export { ProjectDetector } from './project/ProjectDetector';
export { ProjectIndexer } from './project/ProjectIndexer';
export { ConfigParser } from './project/ConfigParser';
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
} from './project/types';
export type {
    Definition as CodeParserDefinition,
    CodeDefinitions,
    FileDefinitions,
    DefinitionType
} from './project/codeParser/ICodeParserAdapter';

// =============== OS Abstraction (from execution) ===============
export * from './execution/os/IOperatingSystemAdapter';
export * from './execution/os/DarwinAdapter';
export * from './execution/os/WindowsAdapter';
export * from './execution/os/LinuxAdapter';
export * from './execution/os/OSAdapterFactory';

// =============== LLM Abstraction (from model) ===============
export * from './model/llm/ILLMAdapter';
export * from './model/llm/GptAdapter';

// =============== Framework Abstraction (from project) ===============

// =============== Code Parser Abstraction (from project) ===============
export * from './project/codeParser/ICodeParserAdapter';
export * from './project/codeParser/TreeSitterAdapter';
export * from './project/codeParser/languageParser';

// =============== File Change Tracking ===============
export * from './file';
