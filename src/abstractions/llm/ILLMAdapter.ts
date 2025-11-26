/**
 * LLM별 추상화 인터페이스
 * 공통 프롬프트와 LLM별 특화 프롬프트를 관리
 */

export interface ILLMAdapter {
    /**
     * LLM 식별자
     */
    readonly llmId: string;

    /**
     * LLM 이름
     */
    readonly llmName: string;

    /**
     * 모델명
     */
    readonly modelName: string;

    // ==================== 프롬프트 생성 ====================

    /**
     * 시스템 프롬프트 생성
     * 공통 프롬프트 + LLM별 특화 프롬프트
     */
    buildSystemPrompt(context: SystemPromptContext): string;

    /**
     * 사용자 프롬프트 생성
     */
    buildUserPrompt(context: UserPromptContext): string;

    /**
     * 코드 생성/수정용 프롬프트 생성
     */
    buildCodeGenerationPrompt(context: CodeGenerationContext): string;

    /**
     * 에러 수정용 프롬프트 생성
     */
    buildErrorCorrectionPrompt(context: ErrorCorrectionContext): string;

    /**
     * 명령어 실행용 프롬프트 생성
     */
    buildCommandExecutionPrompt(context: CommandExecutionContext): string;

    // ==================== 응답 처리 ====================

    /**
     * LLM 응답을 파싱
     */
    parseResponse(response: string): ParsedLLMResponse;

    /**
     * 스트리밍 응답 처리
     */
    handleStreamingChunk(chunk: string): StreamingChunk | null;

    // ==================== 토큰 관리 ====================

    /**
     * 최대 입력 토큰 수
     */
    getMaxInputTokens(): number;

    /**
     * 최대 출력 토큰 수
     */
    getMaxOutputTokens(): number;

    /**
     * 토큰 수 계산
     */
    estimateTokenCount(text: string): number;

    // ==================== API 설정 ====================

    /**
     * API 엔드포인트 반환
     */
    getApiEndpoint(): string;

    /**
     * API 요청 헤더
     */
    getApiHeaders(): Record<string, string>;

    /**
     * API 요청 바디 생성
     */
    buildApiRequestBody(prompt: string, options?: LLMRequestOptions): any;

    // ==================== LLM별 특화 기능 ====================

    /**
     * LLM이 지원하는 기능 목록
     */
    getSupportedFeatures(): LLMFeature[];

    /**
     * 특정 기능 지원 여부
     */
    supportsFeature(feature: LLMFeature): boolean;

    /**
     * LLM별 특화 설정 반환
     */
    getModelSpecificSettings(): Record<string, any>;
}

/**
 * 시스템 프롬프트 컨텍스트
 */
export interface SystemPromptContext {
    osType: 'darwin' | 'win32' | 'linux';
    osName: string;
    shellType: 'bash' | 'zsh' | 'powershell' | 'cmd' | 'sh';
    projectType?: string;
    framework?: string[];
    codebaseContext?: string;
}

/**
 * 사용자 프롬프트 컨텍스트
 */
export interface UserPromptContext {
    query: string;
    conversationHistory?: Array<{ role: string; content: string }>;
    includedFiles?: Array<{ name: string; content: string }>;
    projectRoot?: string;
}

/**
 * 코드 생성 컨텍스트
 */
export interface CodeGenerationContext {
    intent: string;
    projectType: string;
    framework: string[];
    existingFiles?: Array<{ path: string; content: string }>;
    requirements: string;
}

/**
 * 에러 수정 컨텍스트
 */
export interface ErrorCorrectionContext {
    errorMessage: string;
    errorType: string;
    commandExecuted?: string;
    terminalOutput?: string;
    relevantFiles?: Array<{ path: string; content: string }>;
}

/**
 * 명령어 실행 컨텍스트
 */
export interface CommandExecutionContext {
    intent: string;
    osType: 'darwin' | 'win32' | 'linux';
    shellType: 'bash' | 'zsh' | 'powershell' | 'cmd' | 'sh';
    projectType: string;
    currentDirectory: string;
}

/**
 * 파싱된 LLM 응답
 */
export interface ParsedLLMResponse {
    text: string;
    codeBlocks?: Array<{ language: string; code: string }>;
    fileOperations?: Array<{
        operation: 'create' | 'modify' | 'delete';
        path: string;
        content?: string;
    }>;
    commands?: string[];
    summary?: string;
}

/**
 * 스트리밍 청크
 */
export interface StreamingChunk {
    type: 'text' | 'code' | 'command' | 'complete';
    content: string;
}

/**
 * LLM 요청 옵션
 */
export interface LLMRequestOptions {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    stream?: boolean;
    stopSequences?: string[];
}

/**
 * LLM 기능
 */
export enum LLMFeature {
    STREAMING = 'streaming',
    FUNCTION_CALLING = 'function_calling',
    CODE_GENERATION = 'code_generation',
    ERROR_CORRECTION = 'error_correction',
    MULTI_TURN = 'multi_turn',
    FILE_OPERATIONS = 'file_operations',
    COMMAND_EXECUTION = 'command_execution',
}

/**
 * 공통 프롬프트 템플릿
 */
export const COMMON_SYSTEM_PROMPTS = {
    BASE: `You are AIDEV-IDE, an AI coding assistant integrated into VS Code.
Your role is to help developers with code generation, debugging, and project management.`,

    CODE_GENERATION: `When generating or modifying code:
- Always output COMPLETE file contents, not partial snippets
- Use clear file operation directives: "새 파일:", "수정 파일:", "삭제 파일:"
- Include a work summary listing all files created/modified/deleted
- Provide detailed explanations of your changes`,

    ERROR_CORRECTION: `When fixing errors:
- Analyze the error message and terminal output carefully
- Identify the root cause before suggesting fixes
- Provide corrected commands or code changes
- Explain why the error occurred and how your fix addresses it`,

    COMMAND_EXECUTION: `When generating commands:
- Consider the user's operating system and shell type
- Use OS-appropriate syntax (bash for macOS/Linux, PowerShell for Windows)
- Ensure commands are safe and non-destructive
- Provide clear explanations of what each command does`,

    FILE_OPERATIONS: `When performing file operations:
- Always validate file paths
- Check if files exist before modifying
- Use project root-relative paths when possible
- Preserve existing content when making partial modifications`,
};

