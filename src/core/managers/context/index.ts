/**
 * Context Manager Module
 * LLM에게 제공할 컨텍스트를 수집
 */

export * from './types';
export { ContextManager } from './ContextManager';
export { PromptBuilder } from './PromptBuilder';
export type { PromptBuilderOptions } from './PromptBuilder';
export * from './file';
export { EditorContextCollector } from './EditorContext';
export { TerminalContextCollector } from './TerminalContext';
export { ContextHistoryManager } from './ContextHistoryManager';

// contextHistory 타입들 (ConversationSummary와 충돌 방지를 위해 명시적 export)
export type {
    ContextUpdateType,
    ContextUpdate,
    ContextCheckpoint,
    ContextSizeInfo,
    SummarizationOptions,
    ContextConversationSummary,
    ContinuationPrompt,
    TaskProgress,
    ConversationHistoryDeletedRange,
    MessageHistoryIndex
} from './types/contextHistory';

