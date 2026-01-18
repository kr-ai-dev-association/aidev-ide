/**
 * AgentConfig
 * 에이전트 관련 설정 상수들을 관리하는 클래스
 */

export class AgentConfig {
    // 루프 및 재시도 설정
    static readonly MAX_TURNS = 15;
    static readonly MAX_TEST_FIX_ATTEMPTS = 5; // 기본값 (실제로는 SettingsManager에서 가져옴)

    // 파일 관련 설정
    static readonly MAX_PROJECT_INVENTORY_FILES = 200;
    static readonly MAX_FILE_PREVIEW_LINES = 50;
    static readonly MAX_ERROR_MESSAGE_LENGTH = 500;

    // 타임아웃 설정 (밀리초)
    static readonly VALIDATION_COMMAND_TIMEOUT = 15000;

    // ===== 의도 감지 임계값 =====
    static readonly MIN_INTENT_CONFIDENCE = 0.3;
    static readonly MIN_EXECUTION_FIRST_CONFIDENCE = 0.7;
    static readonly MIN_GREETING_CONFIDENCE = 0.5;

    // ===== 프로젝트 타입 감지 =====
    static readonly MIN_PROJECT_TYPE_CONFIDENCE = 0.5;  // 이 이하면 사용자 선택 필요
    static readonly PROJECT_TYPE_CONFIDENCE = {
        DEPENDENCY_BASED: 0.95,  // package.json dependencies (React, Vue, Angular 등)
        FILE_BASED: 0.9,         // tsconfig.json, pom.xml 등 설정 파일
        LOCAL_HEURISTIC: 0.8,    // 로컬 파일 패턴 매칭 (통일된 값)
        KEYWORD_BASED: 0.7       // 사용자 쿼리 키워드 기반
    };

    // ===== 프레임워크 감지 =====
    static readonly FRAMEWORK_CONFIDENCE = {
        MAJOR: 0.9,    // React, Vue, Angular, Django
        COMMON: 0.8,   // Express, Flask, NestJS, Next.js, Vite
        TOOLING: 0.75  // 빌드 도구 등
    };

    // ===== 파일 매칭 =====
    static readonly MIN_FUZZY_MATCH_THRESHOLD = 0.8;

    // ===== 토큰 모니터링 =====
    static readonly TOKEN_USAGE_WARNING_THRESHOLD = 80; // 퍼센트

    // ===== 액션 Confidence =====
    static readonly ACTION_CONFIDENCE = {
        LLM_PROVIDED: 0.95,      // LLM이 구조화 응답 제공
        FILE_CREATE: 0.9,        // 파일 생성
        FILE_MODIFY_EXACT: 0.85, // 정확한 매칭으로 파일 수정
        FILE_MODIFY_FUZZY: 0.75, // 퍼지 매칭으로 파일 수정
        TERMINAL_SAFE: 0.85,     // 안전한 터미널 명령
        TERMINAL_RISKY: 0.7,     // 위험한 터미널 명령
        FILE_OPERATION: 0.8,     // 일반 파일 작업
        DEFAULT: 0.5             // 기본값
    };

    // ===== 에러 수정 Confidence =====
    static readonly ERROR_FIX_CONFIDENCE = {
        AUTOMATED: 0.9,   // 자동 해결 가능 (패키지 설치)
        SEMI_AUTO: 0.85,  // 반자동 (포트 충돌)
        MANUAL: 0.7       // 수동 해결 필요 (파일 시스템)
    };

    // ===== Python 프로젝트 감지 =====
    static readonly PYTHON_PROJECT_CONFIDENCE = {
        DJANGO: 0.9,      // manage.py는 명확한 지표
        FLASK_FASTAPI: 0.85, // app.py, main.py는 일반적일 수 있음
        GENERAL: 0.8      // requirements.txt만 있는 경우
    };

    // 파일 경로 관련
    static readonly IGNORED_DIRECTORIES = ['.git', '.cursor', '.DS_Store', 'node_modules', '.idea', '.vscode'];

    // 응답 처리 관련
    static readonly MIN_RESPONSE_LENGTH = 2;
    static readonly DEFAULT_GREETING_MESSAGE = '안녕하세요! 무엇을 도와드릴까요?';
    static readonly DEFAULT_COMPLETION_MESSAGE = '작업이 완료되었습니다.';
}
