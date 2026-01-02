/**
 * State/Session Manager 타입 정의
 * 전역 상태 및 세션을 유지하는 매니저의 타입들
 */

/**
 * Extension 모드
 */
export enum ExtensionMode {
    ASSIST = 'assist',
    AUTO_FIX = 'auto_fix',
    CHAT = 'chat',
    CODE = 'code'
}

/**
 * 세션
 */
export interface Session {
    id: string;
    projectPath: string;
    createdAt: number;
    lastActiveAt: number;
    conversationHistory: ConversationEntry[];
    state: SessionState;
    metadata?: SessionMetadata;
}

/**
 * 세션 상태
 */
export interface SessionState {
    currentModel?: string;
    currentMode?: ExtensionMode;
    recentActions?: string[];
    recentCommands?: string[];
    recentFiles?: string[];
    customSettings?: Record<string, any>;
}

/**
 * 세션 메타데이터
 */
export interface SessionMetadata {
    name?: string;
    description?: string;
    tags?: string[];
}

/**
 * 대화 엔트리
 */
export interface ConversationEntry {
    id: string;
    timestamp: number;
    type: 'user' | 'assistant' | 'system';
    content: string;
    model?: string;
    tokensUsed?: number;
    metadata?: Record<string, any>;
}

/**
 * 전역 상태
 */
export interface GlobalState {
    // 모델 설정
    selectedModel?: string;
    modelSettings?: ModelSettings;

    // Extension 설정
    extensionMode?: ExtensionMode;
    autoExecuteCommands?: boolean;
    autoCorrectErrors?: boolean;
    outputLogEnabled?: boolean;

    // 최근 활동
    recentProjects?: string[];
    recentActions?: RecentAction[];
    recentErrors?: string[];

    // 통계
    stats?: ExtensionStats;

    // 플래그
    flags?: Record<string, boolean>;
}

/**
 * 모델 설정
 */
export interface ModelSettings {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
    stopSequences?: string[];
}

/**
 * 최근 액션
 */
export interface RecentAction {
    id: string;
    type: string;
    description: string;
    timestamp: number;
    success: boolean;
}

/**
 * Extension 통계
 */
export interface ExtensionStats {
    totalRequests: number;
    totalTokensUsed: number;
    totalCommandsExecuted: number;
    totalFilesModified: number;
    totalErrors: number;
    errorsCorrected: number;
    averageResponseTime: number;
    lastResetAt: number;
}

/**
 * 사용자 설정
 */
export interface UserSettings {
    // LLM 설정
    aiModel?: 'gemini' | 'ollama';
    geminiApiKey?: string;
    geminiModel?: string;
    ollamaUrl?: string;
    ollamaModel?: string;
    useRemoteOllama?: boolean;

    // 동작 설정
    autoExecuteCommands: boolean;
    autoCorrectErrors: boolean;
    maxErrorRetries: number;
    outputLogEnabled: boolean;

    // UI 설정
    theme?: 'light' | 'dark' | 'auto';
    showNotifications: boolean;
    showProcessingSteps: boolean;

    // 고급 설정
    maxContextSize: number;
    includeAllSrcFiles: boolean;
    customSystemPrompt?: string;
}

/**
 * 워크스페이스 설정
 */
export interface WorkspaceSettings {
    projectPath: string;
    excludePatterns?: string[];
    includePatterns?: string[];
    customCommands?: CustomCommand[];
    environmentVariables?: Record<string, string>;
}

/**
 * 커스텀 명령어
 */
export interface CustomCommand {
    id: string;
    name: string;
    command: string;
    description?: string;
    icon?: string;
}

/**
 * 설정 변경 이벤트
 */
export interface SettingChangeEvent {
    key: string;
    oldValue: any;
    newValue: any;
    scope: 'global' | 'workspace';
    timestamp: number;
}

/**
 * 설정 변경 리스너
 */
export type SettingChangeListener = (event: SettingChangeEvent) => void;

/**
 * 상태 스냅샷
 */
export interface StateSnapshot {
    globalState: GlobalState;
    sessions: Session[];
    settings: UserSettings;
    timestamp: number;
}

