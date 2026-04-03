/**
 * AgentConfig
 * 에이전트 관련 설정 상수들을 관리하는 클래스
 */

export class AgentConfig {
    // 루프 및 재시도 설정
    static readonly MAX_TURNS = 15;
    static readonly AGENT_MAX_TURNS = 25;
    static readonly AGENT_MAX_CONSECUTIVE_ERRORS = 3;
    static readonly AGENT_MAX_NO_PROGRESS_TURNS = 5;
    static readonly MAX_TEST_FIX_ATTEMPTS = 5; // 기본값 (실제로는 SettingsManager에서 가져옴)
    static readonly MAX_NUDGE_COUNT = 1; // INVESTIGATION 단계에서 최대 nudge 횟수
    static readonly MAX_NUDGE_COUNT_EXECUTION = 1; // EXECUTION 단계에서 최대 nudge 횟수
    static readonly MAX_INVESTIGATION_TEXT_ONLY_COUNT = 3; // 텍스트만 출력 시 최대 허용 횟수

    // 무한 루프 감지 설정 (v9.4.0)
    static readonly LOOP_DETECTION_NO_PROGRESS_THRESHOLD = 3;   // 진전 없이 연속된 턴 수 임계값
    static readonly LOOP_DETECTION_SAME_PLAN_ITEM_THRESHOLD = 5; // 동일 Plan Item 연속 처리 임계값
    static readonly LOOP_DETECTION_SAME_PHASE_THRESHOLD = 8;     // 동일 Phase 연속 임계값
    static readonly LOOP_DETECTION_SAME_RESPONSE_THRESHOLD = 3;  // 동일 LLM 응답 연속 임계값

    // 대화 히스토리 설정
    static readonly MAX_HISTORY_ENTRIES = 10; // ASK 모드에서 포함할 최대 대화 히스토리 수
    static readonly MAX_LOG_PREVIEW_LENGTH = 500; // 로그 출력 시 truncate 길이
    static readonly MAX_HISTORY_ACTION_PREVIEW_LENGTH = 200; // 히스토리 액션 미리보기 길이

    // 메모리 누수 방지 설정 (v9.4.0)
    static readonly MAX_ACCUMULATED_PARTS = 100;          // accumulatedUserParts 최대 항목 수
    static readonly ACCUMULATED_PARTS_TRIM_TARGET = 50;   // 초과 시 유지할 항목 수 (최근)
    static readonly MAX_PART_TEXT_LENGTH = 50000;         // 개별 part의 최대 텍스트 길이
    static readonly PART_TEXT_TRIM_LENGTH = 30000;        // 초과 시 자를 길이

    // 세션 관리 설정
    static readonly SESSION_TRIM_THRESHOLD = 50; // 세션 트림 필요 여부 판단 임계값
    static readonly SESSION_TRIM_TARGET = 30; // 트림 후 유지할 세션 수

    // 문자열 길이 (로그/미리보기용)
    static readonly MIN_ANALYSIS_RESPONSE_LENGTH = 100; // 로그 출력 시 응답 미리보기 길이
    static readonly MIN_SIGNIFICANT_MODIFICATION_LINES = 10; // 유의미한 수정으로 간주하는 최소 라인 수
    static readonly MAX_LINT_CHECK_FILES = 10; // Lint 체크 시 최대 파일 수
    static readonly MAX_FAILURE_KEYWORDS = 5; // 실패 패턴 추출 시 최대 키워드 수
    static readonly MIN_KEYWORD_LENGTH = 3; // 최소 키워드 길이
    static readonly MIN_FILE_PATH_LENGTH = 3; // 최소 파일 경로 길이

    // 파일 관련 설정
    static readonly MAX_PROJECT_INVENTORY_FILES = 200;
    static readonly MAX_FILE_PREVIEW_LINES = 50;
    static readonly MAX_ERROR_MESSAGE_LENGTH = 500;

    // 타임아웃 설정 (밀리초)
    static readonly VALIDATION_COMMAND_TIMEOUT = 30000;
    static readonly BUILD_RETRY_TIMEOUT_MULTIPLIER = 2;  // 빌드 타임아웃 재시도 시 타임아웃 배수
    static readonly MAX_BUILD_TIMEOUT = 120000;           // 빌드 최대 타임아웃 (2분)

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

    // ===== 토큰 모니터링 =====
    static readonly TOKEN_USAGE_WARNING_THRESHOLD = 80; // 퍼센트

    // ===== 액션 Confidence =====
    static readonly ACTION_CONFIDENCE = {
        LLM_PROVIDED: 0.95,      // LLM이 구조화 응답 제공
        FILE_CREATE: 0.9,        // 파일 생성
        FILE_MODIFY_EXACT: 0.85, // 정확한 매칭으로 파일 수정
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

    // ===== 오케스트레이션 =====
    static readonly MAX_CONCURRENT_AGENTS = 3; // 병렬 Sub-Agent 최대 수
    static readonly SUB_AGENT_LLM_CALL_TIMEOUT = 360000; // Sub-Agent LLM 호출 타임아웃 (6분)
    static readonly SUB_AGENT_TOTAL_TIMEOUT = 600000;     // Sub-Agent 전체 루프 타임아웃 (10분)

    // ===== 프로젝트 타입별 빌드 검증 타임아웃 =====
    static readonly VALIDATION_TIMEOUT_BY_PROJECT: Record<string, number> = {
        'node': 15000,
        'react': 20000,
        'vue': 20000,
        'angular': 25000,
        'nextjs': 25000,
        'java': 60000,
        'gradle': 60000,
        'maven': 60000,
        'python': 20000,
        'django': 25000,
        'dotnet': 30000,
        'rust': 45000,
        'go': 20000,
        'default': 15000,
    };

    // ===== 대화 압축 =====
    static readonly COMPACTION_TOKEN_THRESHOLD = 0.9; // 압축 트리거 토큰 임계값 (90%)

    // ===== 메모리 누수 방지 =====
    static readonly MAX_DELETED_FILES = 100; // deletedFiles 배열 최대 크기
    static readonly MAX_TERMINAL_OUTPUT_PER_ENTRY = 100000; // 히스토리 엔트리당 최대 출력 길이 (100KB)

    // ===== 에디터 선택 컨텍스트 =====
    static readonly EDITOR_SELECTION_MIN_LENGTH = 5;    // 무시할 최소 선택 길이
    static readonly EDITOR_SELECTION_MAX_LENGTH = 5000; // 최대 허용 선택 길이

    // ===== 웹뷰 =====
    static readonly WEBVIEW_RESTORE_DELAY_MS = 2000; // 상태 복원 재시도 딜레이 (ms)
}
