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
    compactedSummaries?: ConversationSummary[]; // 압축된 과거 대화 요약
    state: SessionState;
    metadata?: SessionMetadata;
    totalTokensUsed?: number; // 세션 전체 누적 토큰
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
 * 도구 실행 기록
 */
export interface ActionEntry {
    type: 'create' | 'modify' | 'read' | 'delete' | 'execute' | 'search';
    file?: string;
    command?: string;
    result?: 'success' | 'error';
}

/**
 * UI 메시지 엔트리 (히스토리 복원용)
 */
export interface UIMessageEntry {
    sender: 'USER' | 'CODEPILOT' | 'System';
    text: string;
    type?: 'action' | 'code' | 'summary' | 'message';  // 메시지 타입
}

/**
 * 대화 엔트리 (전체 대화 내용 + 구조화된 메타데이터)
 */
export interface ConversationEntry {
    id: string;
    timestamp: number;

    // 전체 대화 내용 (ASK 모드 컨텍스트 재사용을 위해)
    userRequest: string;           // 사용자 원본 요청
    assistantResponse?: string;    // LLM 전체 응답 (CODE 모드는 파일 변경으로 대체 가능)

    // 구조화된 메타데이터 (CODE 모드)
    actions: ActionEntry[];        // 실행된 도구들
    filesCreated?: string[];       // 생성된 파일 목록
    filesModified?: string[];      // 수정된 파일 목록
    commandsExecuted?: string[];   // 실행된 명령어 목록

    // ✅ UI 메시지 히스토리 (세션 복원용)
    uiMessages?: UIMessageEntry[]; // 웹뷰에 표시된 모든 메시지 (액션, 코드블록 포함)

    // 상태 및 성능 지표
    result: 'success' | 'error' | 'cancelled';
    model?: string;
    tokensUsed?: number;
    durationMs?: number;           // 실행 시간

    // 요약 참조 (압축 후)
    compactedSummaryId?: string;   // 요약으로 대체되면 요약 ID 참조
}

/**
 * 대화 요약 (LLM 생성)
 */
export interface ConversationSummary {
    id: string;
    createdAt: number;
    messageRange: {
        startIndex: number;
        endIndex: number;
    };
    summary: string;               // LLM 생성 요약
    filesModified: string[];
    filesCreated: string[];
    keyContext: string[];          // 다음 작업에 필요한 핵심 컨텍스트
    primaryRequest: string;        // 주요 요청
    currentWork: string;           // 현재 진행 중인 작업
    nextStep?: string;             // 다음 단계
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

