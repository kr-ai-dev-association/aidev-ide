/**
 * AgentConfig
 * 에이전트 관련 설정 상수들을 관리하는 클래스
 */

export class AgentConfig {
    // 루프 및 재시도 설정
    static readonly MAX_TURNS = 15;
    static readonly MAX_TEST_FIX_ATTEMPTS = 3; // 기본값 (실제로는 SettingsManager에서 가져옴)

    // 파일 관련 설정
    static readonly MAX_PROJECT_INVENTORY_FILES = 200;
    static readonly MAX_FILE_PREVIEW_LINES = 50;
    static readonly MAX_ERROR_MESSAGE_LENGTH = 500;

    // 타임아웃 설정 (밀리초)
    static readonly VALIDATION_COMMAND_TIMEOUT = 15000;

    // 의도 감지 임계값
    static readonly MIN_INTENT_CONFIDENCE = 0.3;
    static readonly MIN_EXECUTION_FIRST_CONFIDENCE = 0.7;
    static readonly MIN_GREETING_CONFIDENCE = 0.5;

    // 파일 경로 관련
    static readonly IGNORED_DIRECTORIES = ['.git', '.cursor', '.DS_Store', 'node_modules', '.idea', '.vscode'];

    // 응답 처리 관련
    static readonly MIN_RESPONSE_LENGTH = 2;
    static readonly DEFAULT_GREETING_MESSAGE = '안녕하세요! 무엇을 도와드릴까요?';
    static readonly DEFAULT_COMPLETION_MESSAGE = '작업이 완료되었습니다.';
}
