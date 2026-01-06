# AiDev-IDE 아키텍처 문서

## 📋 개요

aidev-ide는 9개의 핵심 매니저 시스템을 기반으로 한 계층형 아키텍처를 사용합니다. 모든 추상화 레이어(OS, LLM, Framework, Code Parser)는 각 매니저에 통합되어 있으며, `abstractions` 디렉토리는 더 이상 사용하지 않습니다. 추가로 대화 오케스트레이션(`ConversationManager`, `ConversationService`), 플랜 관리(`PlanManager`), LLM 통신 및 포맷팅(`LLMManager`), 웹뷰 브리지(`WebviewBridge`) 등의 핵심 서비스가 통합되어 있습니다.

**참고**: v5.0.0에서 `src/ai/llmService.ts`는 `ConversationService`의 thin wrapper로만 남고, 모든 핵심 로직은 `ConversationManager`와 core 매니저들로 완전히 이동했습니다. 약 480줄의 orphaned 코드가 제거되었으며, 매니저 아키텍처로 마이그레이션이 완료되었습니다.


## 📁 디렉토리 구조

```
src/
├── core/                            # 핵심 매니저 레이어 
│   ├── action/                      # 1. Action Manager
│   │   ├── ActionManager.ts          # 메인 액션 매니저
│   │   ├── ActionRegistry.ts         # 액션 등록/관리
│   │   ├── ActionValidator.ts        # 액션 검증
│   │   ├── ActionMapper.ts           # LLM 요청 → 액션 매핑
│   │   ├── IntentDetector.ts         # 의도 분석 (v6.1.0: 현재 활성 모델을 사용하여 의도 파악 수행)
│   │   ├── types.ts                  # 액션 타입 정의
│   │   ├── index.ts
│   │   └── file/                     # 파일 변경 추적
│   │       ├── FileChangeTracker.ts  # 파일 변경 추적 및 검증
│   │       ├── types.ts               # 파일 변경 타입 정의
│   │       └── index.ts
│   │
│   ├── execution/                   # 2. Execution Manager
│   │   ├── ExecutionManager.ts       # 메인 실행 매니저 (v5.2.0: 소프트 타임아웃 및 백그라운드 관리)
│   │   ├── ProcessManager.ts         # 프로세스(PID) 관리
│   │   ├── StreamManager.ts          # stdout/stderr 스트림 관리
│   │   ├── ErrorDetector.ts          # 에러/포트 충돌 감지
│   │   ├── types.ts
│   │   ├── index.ts
│   │   └── os/                       # OS 추상화 (통합됨)
│   │       ├── IOperatingSystemAdapter.ts
│   │       ├── DarwinAdapter.ts
│   │       ├── WindowsAdapter.ts
│   │       ├── LinuxAdapter.ts
│   │       └── OSAdapterFactory.ts
│   │
│   ├── terminal/                    # 3. Terminal Manager
│   │   ├── TerminalManager.ts        # 터미널 세션 관리
│   │   ├── TerminalSession.ts        # 개별 터미널 세션
│   │   ├── TerminalHistory.ts        # 터미널 히스토리
│   │   ├── types.ts
│   │   └── index.ts
│   │
│   ├── task/                        # 4. Task Manager
│   │   ├── TaskManager.ts           # 작업 큐 관리 (v5.2.1: 페이즈 상태 동기화 및 실시간 UI 업데이트)
│   │   ├── TaskQueue.ts             # 작업 큐 데이터 구조
│   │   ├── TaskScheduler.ts         # 우선순위 스케줄링
│   │   ├── TaskRetry.ts             # 재시도 로직
│   │   ├── PlanManager.ts           # 플랜 생성 및 파싱
│   │   ├── types.ts
│   │   └── index.ts
│   │
│   ├── project/                     # 5. Project Manager
│   │   ├── ProjectManager.ts        # 프로젝트 구조 관리
│   │   ├── ProjectDetector.ts       # 프로젝트 타입 감지
│   │   ├── ProjectIndexer.ts        # 파일 인덱싱
│   │   ├── ConfigParser.ts           # 설정 파일 파싱
│   │   ├── types.ts
│   │   ├── index.ts
│   │   └── codeParser/              # Code Parser 추상화 (통합됨)
│   │       ├── ICodeParserAdapter.ts
│   │       ├── TreeSitterAdapter.ts
│   │       ├── languageParser.ts
│   │       └── queries/
│   │
│   ├── context/                     # 6. Context Manager
│   │   ├── ContextManager.ts        # LLM 컨텍스트 관리
│   │   ├── ContextHistoryManager.ts # 컨텍스트 히스토리 관리 및 자동 요약
│   │   ├── ConversationSummarizer.ts # 대화 요약 생성
│   │   ├── PromptBuilder.ts         # 프롬프트 생성 (OS별, 모델별) @deprecated
│   │   ├── EditorContext.ts         # 에디터 컨텍스트
│   │   ├── TerminalContext.ts       # 터미널 로그 컨텍스트
│   │   ├── file/                    # 파일 관련 컨텍스트 수집
│   │   │   ├── FileContext.ts       # 파일 컨텍스트 수집
│   │   │   ├── RelevantFilesFinder.ts # 관련 파일 찾기
│   │   │   ├── FileSearcher.ts      # Regex 기반 파일 검색
│   │   │   ├── FileContextTracker.ts # 파일 컨텍스트 추적기 (파일 안정화 대기)
│   │   │   └── index.ts
│   │   ├── types/                   # 컨텍스트 히스토리 타입 정의
│   │   │   └── contextHistory.ts    # ContextUpdate, ConversationSummary 등
│   │   ├── prompts/                 # 프롬프트 컴포넌트 시스템
│   │   │   ├── PromptComposer.ts    # 프롬프트 조합기 (OS/LLM/Framework/Task 조합)
│   │   │   ├── base/                # 베이스 프롬프트 컴포넌트
│   │   │   │   ├── agentRole.ts     # 에이전트 역할 정의 (한글 응답 강제)
│   │   │   │   ├── objective.ts     # 목표 정의
│   │   │   │   ├── rules.ts         # 기본 규칙 (v5.2.0: 파일 삭제 안전 규칙, 내부 독백 금지)
│   │   │   │   ├── fileOperations.ts # 파일 작업 규칙
│   │   │   │   ├── terminalCommands.ts # 터미널 명령 규칙
│   │   │   │   └── codeVsScript.ts  # 코드 vs 스크립트 구별 규칙
│   │   │   ├── os/                  # OS별 프롬프트
│   │   │   │   ├── WindowsPrompt.ts
│   │   │   │   ├── MacOSPrompt.ts
│   │   │   │   ├── LinuxPrompt.ts
│   │   │   │   └── DefaultOSPrompt.ts
│   │   │   ├── llm/                 # LLM별 프롬프트
│   │   │   │   ├── GeminiPrompt.ts
│   │   │   │   ├── GPTOSSPrompt.ts
│   │   │   │   ├── DeepSeekPrompt.ts
│   │   │   │   ├── GemmaPrompt.ts
│   │   │   │   ├── CodeLlamaPrompt.ts
│   │   │   │   └── DefaultLLMPrompt.ts
│   │   │   ├── framework/           # 프레임워크별 프롬프트
│   │   │   │   ├── FrameworkPromptBuilder.ts # 프레임워크 이름 기반 프롬프트 생성
│   │   │   │   ├── VitePrompt.ts
│   │   │   │   ├── SpringBootPrompt.ts
│   │   │   │   ├── NodeTypeScriptPrompt.ts
│   │   │   │   └── ExpressPrompt.ts
│   │   │   └── task/                # 작업 타입별 프롬프트
│   │   │       ├── CodeWorkPrompt.ts
│   │   │       ├── ExecutionWorkPrompt.ts
│   │   │       └── summarize.ts     # 요약 프롬프트
│   │   ├── types.ts
│   │   └── index.ts
│   │
│   ├── conversation/                # 대화 오케스트레이션
│   │   ├── ConversationManager.ts   # 사용자 메시지 처리 및 응답 생성 (v6.3.0: 경량 FSM 통합, v6.4.0: REVIEW 최적화)
│   │   │                            # - 단계별(조사/실행) 상태 레이블링 지원
│   │   │                            # - 인터리브드(Interleaved) 출력 및 실시간 UI 업데이트
│   │   │                            # - 스마트 너징(Nudging) 로직
│   │   │                            # - 경량 FSM을 통한 상태 관리 및 전환 검증
│   │   │                            # - v6.4.0: REVIEW 단계 LLM 호출 최적화 (2회 → 1회)
│   │   │                            # - v6.4.0: 검증 단계별 상태 표시 (Smoke Test, Lint Check 진행 상황)
│   │   ├── AgentStateManager.ts     # v6.3.0: 경량 FSM - 상태 관리, 전환 규칙, Output Contract
│   │   ├── ConversationService.ts   # ConversationManager 진입점 서비스
│   │   └── index.ts
│   │
│   ├── investigation/               # 7. Investigation Manager
│   │   ├── InvestigationManager.ts  # v5.2.0: 조사 단계 강제 및 읽기 전용 도구 제한
│   │   │                            # v6.4.0: 프롬프트 강화로 plan과 실행 도구 동시 사용 금지
│   │   └── index.ts
│   │
│   ├── state/                       # 8. State/Session Manager
│   │   ├── StateManager.ts          # 전역 상태 관리
│   │   ├── SessionManager.ts        # 세션 관리
│   │   ├── SettingsManager.ts       # 사용자 설정
│   │   ├── ConfigurationService.ts  # VS Code 설정 캐싱 및 추상화
│   │   ├── types.ts
│   │   └── index.ts
│   │
│   ├── error/                       # 9. Error Manager
│   │   ├── ErrorManager.ts          # 에러 관리
│   │   ├── ErrorParser.ts           # 에러 파싱
│   │   ├── StackTraceAnalyzer.ts    # 스택 트레이스 분석
│   │   ├── ErrorHistory.ts          # 에러 히스토리
│   │   ├── AutoFixService.ts        # 자동 오류 수정 서비스
│   │   ├── AutoErrorHandler.ts      # 자동 오류 처리 핸들러
│   │   ├── types.ts
│   │   └── index.ts
│   │
│   ├── model/                       # 10. LLM Manager (통합 LLM 관리)
│   │   ├── LLMApiClient.ts          # LLM API 호출 클라이언트 (Gemini, Ollama 통합)
│   │   ├── LLMManager.ts            # LLM 서버 통신 및 응답 포맷팅
│   │   ├── types.ts                 # 모델 관련 공통 타입
│   │   ├── index.ts
│   │   └── llm/                     # LLM 어댑터
│   │       ├── ILLMAdapter.ts
│   │       ├── GptAdapter.ts
│   │       └── GemmaAdapter.ts
│   │
│   │
│   ├── base/                        # 공통 추상화 레이어
│   │   ├── BaseManager.ts           # 싱글톤 패턴 공통 제공
│   │   └── index.ts
│   │
│   ├── utils/                       # Core 유틸리티
│   │   ├── SafeSettingsHelper.ts    # 안전한 설정값 가져오기
│   │   └── index.ts
│   ├── tools/                       # LLM Tool 레이어 (XML 툴 콜링)
│   │   ├── ToolParser.ts            # 툴 파싱 및 엄격한 계획(Plan) 추출 (v5.2.0)
│   │   ├── ToolExecutor.ts          # 툴 통합 실행기
│   │   ├── ToolSpecBuilder.ts       # 툴 명세 및 페이즈별 도구 제한 생성
│   │   ├── file/                    # 파일/프로젝트 관련 툴
│   │   │   ├── CreateFileToolHandler.ts
│   │   │   ├── UpdateFileToolHandler.ts # v5.2.0: 강력한 매칭 도입
│   │   │   │                          # - Fuzzy, Block Anchor, Structural 매칭
│   │   │   ├── RemoveFileToolHandler.ts # v5.2.0: 삭제 안전 규칙 적용
│   │   │   ├── ReadFileToolHandler.ts
│   │   │   ├── ListFilesToolHandler.ts  # v5.2.0: 지능형 경로 필터링 추가
│   │   │   ├── SearchFilesToolHandler.ts
│   │   │   └── RipgrepSearchToolHandler.ts # v6.2.0: 고성능 키워드 검색 및 결과 포맷 도입
│   │   ├── terminal/                # 터미널/명령 실행 툴
│   │   │   └── RunCommandToolHandler.ts # v5.2.0: 소프트 타임아웃 지원
│   │   └── code/                    # 코드 분석/리팩토링 툴
│   │
│   └── webview/                     # WebviewBridge 등 UI 브리지
│       └── WebviewBridge.ts         # v5.2.0: 중앙 집중식 UI 상태 및 진행 메시지 관리
│
└── index.ts                     # 모든 매니저 및 추상화 export
```

## 🎭 매니저별 상세 책임 (v5.2.0 업데이트)

### 7️⃣ Investigation Manager (v5.2.0 신규, v6.3.0 FSM 통합, v6.4.0 프롬프트 강화)
**역할**: AI가 코드를 수정하기 전 프로젝트 상태를 분석하는 '조사' 단계를 관리합니다.

**책임**:
- **읽기 전용 도구 제한**: 조사 단계에서 `read_file`, `list_files`, `search_files`, `ripgrep_search` 외의 도구 호출 차단.
- **단계 전환 관리**: 반드시 유효한 XML `<plan>`이 수립되어야만 '실행' 단계로의 전환 허용.
- **조사 전용 지침 제공**: "Sherlock Holmes for Code" 역할을 LLM에게 부여하여 팩트 기반 분석 유도.
- **v6.3.0**: `AgentStateManager`와 통합되어 상태 전환 검증 및 Output Contract 강제.
- **v6.4.0**: 프롬프트 강화로 `<plan>` 태그와 실행 도구를 같은 응답에 포함하는 것을 엄격히 금지. 조사 단계에서는 오직 읽기 전용 도구만 사용하고 계획만 제출하도록 명확히 지시.

### 🔟 Agent State Manager (v6.3.0 신규)
**역할**: 에이전트의 상태 관리 및 전환 규칙을 중앙화하여 관리하는 경량 FSM입니다.

**책임**:
- **상태 관리**: `INVESTIGATION`, `EXECUTION` 상태 추적 및 현재 상태 반환.
- **도구 허용/금지 관리**: 각 상태별로 허용되는 도구 목록을 정의하고 검증.
- **상태 전환 검증**: 유효한 전환만 허용하며, 전환 전 조건(plan 존재, 조사 이력 등)을 검사.
- **Output Contract 강제**: 각 상태에서 허용되는 출력 형식(plan 태그, 도구 호출, 텍스트만)을 검증.
- **조사 이력 추적**: INVESTIGATION 단계에서 조사 도구 사용 이력을 추적하여 Blind Planning 방지.

**구현 파일**:
- `AgentStateManager.ts` - 경량 FSM 구현

**상태 전환 규칙**:
- `INVESTIGATION` → `EXECUTION`: plan 존재 + (도구 호출 또는 조사 이력) 필요
- `EXECUTION` → 종료: 모든 plan item 완료 시

**Output Contract**:
- `INVESTIGATION`: plan 허용, 조사 도구만 허용, 텍스트 허용
- `EXECUTION`: plan 금지, 모든 도구 허용, 텍스트 허용

### 🔟 Tool Parser (v5.2.0 개선)
**역할**: LLM 응답에서 XML 도구 호출 및 계획 정보를 정밀하게 추출합니다.

**책임**:
- **엄격한 계획 파싱**: `<plan><item>...` 구조를 강제하며, 일반 텍스트 리스트는 무시합니다.
- **인터리브드 파싱**: 텍스트와 XML이 섞인 응답에서 순서를 유지하며 요소를 분리합니다.

### 📱 Webview Bridge (v5.2.1 개선, v6.4.0 UI 개선)
**역할**: 확장 기능과 채팅 UI 간의 실시간 통신 및 상태 표시를 담당합니다.

**책임**:
- **조건부 스티키 메시지**: 진행 상태 메시지가 스크롤 시 상단에 고정되도록 제어.
- **타자기 애니메이션**: 현재 에이전트의 페이즈와 진행 단계를 애니메이션으로 시각화.
- **작업 큐(Plan) 실시간 동기화**: `TaskQueue` 팝업 UI와 연동하여 작업 진행 상태를 실시간 업데이트.
- **도구 결과 렌더링**: 실행된 코드나 터미널 출력을 채팅 패널에 통합 표시.
- **v6.4.0**: 작업 계획 팝업 UI 개선 (제목/상세 분리 표시), 검증 단계별 상태 표시 (Smoke Test, Lint Check 진행 상황).│
└── index.ts                     # 모든 매니저 및 추상화 export
│
├── services/                        # 보조 서비스 (도메인별 분류)
│   ├── index.ts                     # 배럴 파일 (모든 서비스 export)
│   ├── Types.ts                     # AI 모델 타입 정의 (AiModelType, PromptType)
│   ├── llm/                         # LLM 관련 서비스
│   │   ├── GeminiApi.ts             # Gemini API 클라이언트
│   │   ├── OllamaApi.ts             # Ollama API 클라이언트
│   │   └── OllamaBlockerService.ts  # Ollama 차단 서비스
│   ├── external/                    # 외부 API 서비스
│   │   └── ExternalApiService.ts    # 날씨, 뉴스, 주식 API
│   ├── git/                         # Git 관련 서비스
│   │   ├── GitRepositoryService.ts
│   │   └── GitBranchAnalysisService.ts
│   ├── license/                     # 라이센스 서비스
│   │   └── LicenseService.ts
│   └── notification/                # 알림 서비스
│       └── NotificationService.ts
│
├── webview/                         # UI 레이어
│   ├── chat.html                    # 메인 채팅 UI (v5.2.1: React 기반 TaskQueue 팝업 도입)
│   ├── chat.js                      # UI 상호작용 및 타자기 애니메이션 구현
│   ├── providers/                   # Webview Provider
│   │   ├── index.ts                 # 배럴 파일
│   │   ├── ChatViewProvider.ts      # CODE 탭 Provider
│   │   ├── AskViewProvider.ts       # ASK 탭 Provider
│   │   └── SettingsPanelProvider.ts  # 설정 패널 Provider (re-export)
│   └── services/                    # 웹뷰 보조 서비스
│       ├── index.ts                 # 배럴 파일
│       └── LocaleService.ts        # 언어(locale) 파일 로더
│   # UI note: v5.2.1: TaskQueue UI re-introduced as a dynamic floating popup with React.
│
├── utils/                           # 유틸리티
│   ├── index.ts                     # 배럴 파일
│   ├── panelUtils.ts                # 웹뷰 공용 유틸 (safePostMessage, html 로더 등)
│   ├── tokenUtils.ts                # 토큰 관련 유틸
│   ├── debugLogger.ts               # 디버그 로거
│   ├── cryptoUtils.ts               # 암호화 유틸
│   ├── fileUtils.ts                 # 파일 유틸
│   └── string.ts                    # 문자열 유틸 (v5.1.2: removeCDataSections 추가)
│
└── extension.ts                     # 진입점
```

## 🎭 매니저별 상세 책임 (v5.0.8, 코드 분석 및 구조 리팩토링)

### 1️⃣ Action Manager
**역할**: LLM 요청을 실행 가능한 액션으로 변환

```typescript
// 핵심 인터페이스
interface Action {
  id: string;
  type: ActionType;
  params: ActionParams;
  permissions: Permission[];
  validation: ValidationRule[];
}

// 주요 메서드
class ActionManager {
  async mapResponse(llmResponse: LLMResponse): Promise<ActionMappingResult>
  async validateAction(action: Action): Promise<ValidationResult>
  async executeAction(action: Action): Promise<ActionResult>
  registerAction(actionDef: ActionDefinition): void
}
```

**책임**:
- LLM 응답 파싱 및 액션 추출
- 액션 타입 결정 (CODE_GENERATION, FILE_OPERATION, TERMINMINAL_COMMAND 등)
- **의도 분석 및 페이즈 결정** (v5.2.2): 키워드 기반 매칭의 한계를 극복하기 위해 LLM 기반의 동적 의도 판단 및 자율적 페이즈 전환 로직 적용
- 액션 파라미터 검증
- 권한 체크
- 컨텍스트 주입
- Execution Manager에 실행 요청 전달
- **파일 컨텍스트 안정화 대기**:
  - `FileContextTracker`를 주입받아 코드 생성(`executeCodeGeneration`) 및 파일 작업(`executeFileOperation`) 실행 직전에
    대상 파일을 `trackFile()`로 추적하고 `waitForFileStability()`로 크기/mtime이 일정 시간 동안 변하지 않을 때까지 대기
  - 직후 `ContextManager.collectContext()`에서 파일을 다시 읽더라도, 저장 중간 상태(부분 기록)를 읽지 않도록 보장

**구현 파일**:
- `ActionManager.ts` - 메인 액션 매니저
- `ActionRegistry.ts` - 액션 등록 및 관리 (7가지 액션 타입)
- `ActionValidator.ts` - 액션 검증 (위험한 명령어 차단, 순환 의존성 감지)
- `ActionMapper.ts` - LLM 응답 → 액션 매핑 (코드 블록, 명령어 추출)

---

### 2️⃣ Execution Manager
**역할**: 액션을 실제 실행으로 변환

```typescript
class ExecutionManager {
  async executeCommand(cmd: string, options: ExecutionOptions): Promise<ExecutionResult>
  async startProcess(cmd: string): Promise<Process>
  async stopProcess(pid: number): Promise<void>
  async monitorProcess(pid: number): ProcessMonitor
  async detectError(output: string): ErrorInfo | null
  normalizeCommand(command: string): string  // OS별 명령어 정규화
  getOSAdapter(): IOperatingSystemAdapter  // OS 어댑터 접근
}
```

**책임**:
- 터미널 명령 실행 (동기/비동기)
- 프로세스 생성 및 관리 (PID 추적)
- 장기 실행 프로세스 관리 (개발 서버, 빌드 프로세스)
- stdout/stderr 스트림 라우팅
- 에러 감지 (10가지 에러 타입: PORT_CONFLICT, COMMAND_NOT_FOUND 등)
- 실행 상태 추적
- OS별 명령어 정규화

**구현 파일**:
- `ExecutionManager.ts` - 메인 실행 매니저
- `ProcessManager.ts` - 프로세스(PID) 관리
- `StreamManager.ts` - stdout/stderr 스트림 관리
- `ErrorDetector.ts` - 에러/포트 충돌 감지
- `os/` - OS 추상화 통합 (Darwin, Windows, Linux 어댑터)

---

### 3️⃣ Terminal Manager
**역할**: 터미널 세션 생명주기 관리

```typescript
class TerminalManager {
  createTerminal(options: TerminalCreationOptions): TerminalSession
  getTerminal(id: string): TerminalSession | null
  listTerminals(): TerminalSession[]
  destroyTerminal(id: string): void
  async executeCommand(command: string, options?: CommandOptions): Promise<CommandExecutionDetail>
  getHistory(filter?: HistoryFilter): TerminalCommand[]
}
```

**책임**:
- VS Code 터미널 생성/삭제
- 멀티 터미널 관리
- 터미널 히스토리 유지 (1000개 엔트리)
- 출력 스트림 캡처 및 라우팅
- 가장 많이 사용된 명령어 통계

**구현 파일**:
- `TerminalManager.ts` - 터미널 세션 관리
- `TerminalSession.ts` - 개별 터미널 세션
- `TerminalHistory.ts` - 명령어 히스토리

---

### 4️⃣ Task Manager
**역할**: 비동기 작업 큐 관리

```typescript
class TaskManager {
  enqueue(task: Task, priority?: Priority): string
  dequeue(): Task | null
  updateStatus(taskId: string, status: TaskStatus): void
  retry(taskId: string): void
  cancel(taskId: string): void
  getHistory(): Task[]
  start(): void
  stop(): void
  // PlanQueue 기능
  listPlanItems(): PlanItem[]
  addPlanItems(items: PlanItem[]): void
  updatePlanItemStatus(itemId: string, status: PlanItemStatus): void
  clearPlanItems(): void
}

class PlanManager {
  async splitUserInstructionIntoActions(userQuery: string): Promise<string[]>
  async buildPlanPrompt(userQuery: string, keywords: string[], os: string, modelName: string, includedFiles: FileInfo[]): Promise<string>
  parsePlanToItems(planMarkdown: string): PlanItem[]
  parseCheckboxItemsFromPlan(planMarkdown: string): PlanItem[]
  async summarizePlanItemsForQueue(items: PlanItem[]): Promise<PlanItem[]>
}
```

**책임**:
- 작업 큐 관리 (우선순위 기반)
- 장기 작업 진행률 업데이트
- 실패 시 재시도 (Exponential Backoff)
- 작업 히스토리 저장
- 이벤트 시스템 (작업 시작/완료/실패)
- 플랜 아이템 관리 (PlanQueue)
- 사용자 지시를 액션으로 분할
- 플랜 생성 및 파싱

**구현 파일**:
- `TaskManager.ts` - 작업 큐 관리
- `TaskQueue.ts` - 큐 구현
- `TaskScheduler.ts` - 우선순위 스케줄링
- `TaskRetry.ts` - 재시도 로직
- `PlanManager.ts` - 플랜 생성 및 파싱

---

### 5️⃣ Project Manager
**역할**: 프로젝트 구조 및 메타데이터 관리

```typescript
class ProjectManager {
  async initialize(projectRoot: string): Promise<ProjectInfo>
  async detectProjectType(projectRoot?: string): Promise<ProjectDetectionResult>
  async detectProjectTypeFromQuery(
    userQuery: string,
    projectRoot?: string,
    geminiApi?: GeminiApi,
    ollamaApi?: OllamaApi,
    currentModelType?: AiModelType,
    abortSignal?: AbortSignal
  ): Promise<{ projectType: string, confidence: number, needsUserSelection: boolean }>
  async getProjectStructure(projectRoot?: string): Promise<FileTreeNode>
  async findBuildCommands(projectRoot?: string): Promise<BuildCommands>
  async parseConfig(configFile: string): Promise<ConfigFile | null>
  async indexFiles(pattern: string, options?: IndexOptions): Promise<FileIndex>
  getCurrentProject(): ProjectInfo | undefined
  getFrameworkAdapter(): IFrameworkAdapter | null  // Framework 어댑터 접근
  getCodeParserAdapter(): ICodeParserAdapter  // Code Parser 접근
}
```

**책임**:
- 프로젝트 타입 감지 (React, Flutter, Spring Boot 등)
- LLM 기반 프로젝트 타입 감지 (사용자 쿼리에서 프로젝트 타입 추론)
- 파일 트리 파싱
- 설정 파일 분석 (package.json, pom.xml, build.gradle)
- 빌드/테스트 스크립트 추출
- 파일 인덱싱 (Tree-sitter 통합)
- Code Parser 관리

**구현 파일**:
- `ProjectManager.ts` - 프로젝트 구조 관리
- `ProjectDetector.ts` - 프로젝트 타입 감지
- `ProjectIndexer.ts` - 파일 인덱싱 (Tree-sitter 사용)
- `ConfigParser.ts` - 설정 파일 파싱
- `codeParser/` - Code Parser 추상화 통합 (Tree-sitter)

**참고**: FrameworkAdapter는 v5.0.5에서 제거되었습니다. LLM이 프로젝트 파일을 읽어서 판단하도록 프롬프트로 지시합니다.

---

### 6️⃣ Context Manager
**역할**: LLM에게 제공할 컨텍스트 수집

```typescript
class ContextManager {
  async getCurrentFileContext(): Promise<FileContext>
  async getSelectedTextContext(): Promise<CursorContext>
  async getCursorContext(): Promise<CursorContext>
  async getRecentErrors(): Promise<ErrorContext[]>
  async getRelatedFiles(file: string): Promise<RelatedFilesContext>
  async collectContext(options: ContextCollectionOptions): Promise<ContextBundle>
  setTerminalManager(manager: TerminalManager): void
  setErrorManager(manager: ErrorManager): void
}
```

**책임**:
- 현재 파일 내용
- 선택된 텍스트
- 커서 위치 및 주변 코드
- 최근 터미널 에러
- 편집 기록
- 관련 파일 자동 탐색 (import 분석)
- 토큰 추정 및 제한 관리
- 프롬프트 생성 및 조합 (OS별, LLM별, 프레임워크별)

**구현 파일**:
- `ContextManager.ts` - 컨텍스트 관리
  - `collectFileContext()`에서 현재 활성 파일을 읽기 전에 `FileContextTracker.waitForFileStability()`를 호출하여, 큰 파일/자동 저장 시에도 완전히 저장된 후 컨텍스트를 수집
- `ContextHistoryManager.ts` - 컨텍스트 히스토리 관리 및 자동 요약
  - 컨텍스트 업데이트 기록 및 추적
  - 컨텍스트 크기 모니터링 및 압축
  - 체크포인트 관리
  - 자동 요약 트리거
  - 요약 저장 및 조회
- `ConversationSummarizer.ts` - 대화 요약 생성
  - LLM을 통한 대화 요약 생성
  - 요약 형식 검증 및 파싱
- `file/FileContext.ts` - 파일 컨텍스트 수집
- `file/RelevantFilesFinder.ts` - 관련 파일 찾기
- `file/FileSearcher.ts` - Regex 기반 파일 검색
- `file/FileContextTracker.ts` - 파일 컨텍스트 추적 및 안정화 대기
  - VS Code `FileSystemWatcher`로 파일 변경(create/change/delete) 추적
  - `waitForFileStability(filePath, timeout, stableDuration, pollInterval)`로 파일 크기/mtime이 일정 시간 동안 변하지 않을 때까지 대기
- `EditorContext.ts` - 에디터 컨텍스트 수집
- `TerminalContext.ts` - 터미널 컨텍스트 수집
- `PromptBuilder.ts` - 프롬프트 생성 (deprecated, PromptComposer 사용 권장)
- `prompts/PromptComposer.ts` - 프롬프트 조합기
- `types/contextHistory.ts` - 컨텍스트 히스토리 타입 정의
- `prompts/base/` - 베이스 프롬프트 컴포넌트 (agentRole, objective, rules, fileOperations, terminalCommands, codeVsScript, codeGeneration, errorCorrection, outputFormat)  
  - XML-only로 단순화: fileOperations에서 마크다운 지시어 제거, outputFormat을 툴 실행 결과 요약 중심으로 축소, CodeWorkPrompt는 XML 툴 콜만 사용하도록 정리
- `prompts/os/` - OS별 프롬프트 (Windows, macOS, Linux)
- `prompts/llm/` - LLM별 프롬프트 (Gemini, GPT-OSS, DeepSeek, Gemma, CodeLlama)
- `prompts/framework/` - 프레임워크별 프롬프트 (Vite, Spring Boot, Node.js TypeScript, Express)
- `prompts/task/` - 작업 타입별 프롬프트 (code_work, execution_work, summarize)

**read_file 결과 표시 개선** (v5.1.1):
- Tree-sitter를 사용하여 함수/클래스 위치를 정확하게 검색
- 사용자 질의에서 함수명을 추출하여 매칭되는 정의의 라인 번호 사용
- 전체 파일 대신 특정 라인 주변(위아래 5줄)만 표시하여 가독성 향상
- follow-up tool call의 `read_file` 결과는 중복 방지를 위해 표시하지 않음

**LLM 자율 판단 중심 아키텍처** (v5.1.2):
- **시스템 자동 follow-up 제거**: `ConversationManager`에서 자동으로 follow-up을 생성하지 않음
  - 기존: `read_file`만 실행되면 자동으로 follow-up 생성하여 파일 수정 유도
  - 변경: LLM이 스스로 판단하여 필요한 tool call을 생성하도록 함 
- **에러 처리 개선**: `UpdateFileToolHandler`에서 실패 시 에러 메시지에 최신 파일 내용 포함
  - LLM이 다음 응답에서 스스로 판단하여 올바른 SEARCH/REPLACE 패턴으로 재시도
  - 시스템이 강제로 재시도하지 않고, LLM의 자율 판단에 맡김
- **프롬프트 개선**: 강한 지시("반드시", "같은 응답에서") 제거, 가이드라인 중심으로 변경
  - `ToolSpecBuilder`에서 예시 중심의 가이드라인 제공
  - 한글로 번역하여 LLM 이해도 향상
- **update_file 매칭 전략 강화**:
  - Line-trimmed 매칭: 공백/들여쓰기 차이로 인한 실패 감소
  - Block anchor 매칭: 3줄 이상 블록에서 첫/마지막 줄을 앵커로 사용
  - 실패 시 명확한 에러 메시지와 최신 파일 내용 제공

**프롬프트 시스템 아키텍처**:
- **모듈화된 컴포넌트**: 프롬프트를 OS, LLM, 프레임워크, 작업 타입별로 분리하여 재사용 가능한 컴포넌트로 구성
- **동적 조합**: `PromptComposer`가 OSAdapter 정보를 활용하여 동적으로 프롬프트 조합
- **추상화 레이어 통합**: OSAdapter의 정보를 프롬프트에 자동 반영
- **프레임워크 처리**: FrameworkAdapter 제거, LLM이 프로젝트 파일(package.json, pom.xml 등)을 읽어서 판단하도록 프롬프트 지시
- **일관성 보장**: 모든 LLM 어댑터(GptAdapter, GemmaAdapter 등)가 PromptComposer를 통해 일관된 프롬프트 사용
- **완전 통합**: 모든 프롬프트 관련 코드가 `context/prompts/`에 위치하여 중복 제거 및 구조 단순화
  - `base/`: 베이스 프롬프트 (agentRole, objective, rules, fileOperations, terminalCommands, codeVsScript, codeGeneration, errorCorrection, outputFormat)
  - `os/`: OS별 프롬프트 (Windows, macOS, Linux, DefaultOS) - PromptComposer.getOSPrompt()로 통합 접근
  - `llm/`: LLM별 특화 프롬프트 (Gemini, GPT-OSS, DeepSeek, Gemma, CodeLlama)
  - `framework/`: 프레임워크별 프롬프트 (Vite, Spring Boot, Node.js TypeScript, Express) - 이름 기반 프롬프트만 제공, LLM이 프로젝트 파일 읽어 판단
  - `task/`: 작업 타입별 프롬프트 (code_work, execution_work, summarize)
- **중복 제거**: `commonGuides.ts`, `helpers.ts`, `framework/` 어댑터 디렉토리 제거, 모든 프롬프트가 적절한 컴포넌트로 분산

**컨텍스트 히스토리 관리 및 자동 요약**:
- **컨텍스트 추적**: 메시지별 컨텍스트 변경사항 추적 (파일, 선택, 커서, 터미널, 에러)
- **크기 모니터링**: 컨텍스트 크기(문자 수, 토큰 수) 실시간 모니터링
- **자동 압축**: 토큰 사용량 기반 자동 압축 전략 (none, lastTwo, half, quarter)
- **체크포인트 관리**: 특정 시점의 컨텍스트 스냅샷 저장 및 복원
- **자동 요약**: 컨텍스트 크기 초과 시 LLM을 통한 대화 요약 자동 생성
- **요약 저장**: 요약을 영구 저장소에 저장 (VS Code globalState)
- **세션 재개**: 요약된 세션을 continuation prompt로 변환하여 다음 대화에 포함
- **삭제 범위 추적**: `conversationHistoryDeletedRange`로 삭제된 메시지 범위 관리
- **이중 히스토리 구조**: API 히스토리와 UI 메시지 분리 (향후 확장용)

---

### 7️⃣ State/Session Manager
**역할**: 전역 상태 및 세션 유지

```typescript
class StateManager {
  getState<T>(key: string): T | undefined
  setState<T>(key: string, value: T): void
  getWorkspaceState<T>(key: string): T | undefined
  setWorkspaceState<T>(key: string, value: T): void
}

class SessionManager {
  createSession(projectPath: string): Session
  getSession(sessionId: string): Session | null
  updateSession(sessionId: string, data: Partial<Session>): void
  deleteSession(sessionId: string): void
}

class SettingsManager {
  getSetting<T>(key: SettingKey): T | undefined
  setSetting<T>(key: SettingKey, value: T): void
  validateSetting(key: SettingKey, value: SettingValue): boolean
}
```

**책임**:
- 선택된 LLM 모델
- extension 모드 (Assist, Auto-Fix, Chat)
- 최근 실행 명령/액션
- 사용자 설정 (autoExecute, autoCorrect 등)
- 프로젝트별 세션
- 대화 히스토리

**구현 파일**:
- `StateManager.ts` - 전역 상태 관리
- `SessionManager.ts` - 세션 관리
- `SettingsManager.ts` - 설정 관리

---

### 8️⃣ Error Manager
**역할**: 에러 감지, 파싱, 분석

```typescript
class ErrorManager {
  async captureError(source: ErrorSource, output: string): Promise<ParsedError>
  async parseStackTrace(trace: string): Promise<StackFrame[]>
  async extractFileLocation(error: ParsedError): Promise<FileLocation>
  getErrorHistory(filter?: ErrorFilter): ParsedError[]
  async suggestFix(error: ParsedError): Promise<FixSuggestion[]>
  async sendMessageForErrorCorrection(prompt: string, llmService: any, abortSignal?: AbortSignal): Promise<string>
  async analyzeErrors(): Promise<void>  // 수동 오류 분석
  getHistoryAsText(): string
  readonly onError: vscode.Event<ParsedError>  // 에러 이벤트
  setExecutionManager(manager: ExecutionManager): void
}

class AutoFixService {
  tryAutoFix(error: ParsedError, context: AutoFixContext): Promise<boolean>
  configure(options: { llmClient: AutoFixLlmClient, maxRetries?: number }): void
}
```

**책임**:
- 터미널 에러 감지
- 스택 트레이스 파싱 (JavaScript/TypeScript, Java, Python)
- 파일/라인 번호 추출
- 에러 히스토리 저장
- LLM에게 전달하기 쉽게 구조화
- 자동 수정 제안
- 에러 이벤트 발행 (`onError`)
- LLM 기반 오류 수정 요청
- 휴리스틱 기반 자동 수정 (esbuild, npm ENOTEMPTY 등)

**구현 파일**:
- `ErrorManager.ts` - 에러 관리
- `ErrorParser.ts` - 에러 파싱 (10가지 에러 타입 지원)
- `StackTraceAnalyzer.ts` - 스택 트레이스 분석
- `ErrorHistory.ts` - 에러 히스토리
- `AutoFixService.ts` - 자동 오류 수정 서비스
- `AutoErrorHandler.ts` - 자동 오류 처리 핸들러

---

### 9️⃣ Model Manager (통합 LLM 관리)
**역할**: LLM 서버 통신 및 응답 포맷팅 관리

```typescript
class LLMApiClient {
  async sendMessage(message: string, options?: LLMRequestOptions): Promise<string>
  async sendMessageWithSystemPrompt(systemPrompt: string, userParts: LLMMessagePart[], options?: LLMRequestOptions): Promise<string>
  setCurrentModel(modelType: AiModelType): void
  getCurrentModel(): AiModelType
  cancelCurrentCall(): void
  async getCurrentModelName(): Promise<string>
}

class LLMManager {
  async sendMessage(prompt: string, options?: LLMRequestOptions): Promise<string>
  async sendMessageWithSystemPrompt(systemPrompt: string, userParts: LLMMessagePart[], options?: LLMRequestOptions): Promise<string>
  formatResponse(response: string, options?: any): string
  extractResponseText(llmResponse: string): string
  formatErrorForChat(evt: any): string
  createResponse(text: string, raw?: string): LLMResponse
}
```

**책임**:
- LLM 서버 통신 (로컬 Ollama / 원격 Gemini)
- API 키 관리 및 동적 모델 로드 (SettingsManager 통합)
- 오프라인 상황 자동 폴백 (Gemini -> Ollama)
- 응답 데이터 정제 및 텍스트 추출
- 채팅용 에러 메시지 포맷팅
- 코드 블록 및 툴 지시어 필터링

**구현 파일**:
- `LLMApiClient.ts` - LLM API 통합 클라이언트
- `LLMManager.ts` - 통신 처리 및 응답 포맷팅
- `types.ts` - 모델 관련 공통 타입
- `llm/` - 개별 모델 어댑터 (ILLMAdapter, GptAdapter, GemmaAdapter)

---

### 🔟 File Change Tracker (Action Manager 내부)
**역할**: 파일 변경사항 추적 및 검증

```typescript
class FileChangeTracker {
  startTracking(filePath: string): void
  async recordChange(
    filePath: string,
    changeType: 'create' | 'modify' | 'delete',
    beforeContent?: string,
    afterContent?: string,
    metadata?: FileChange['metadata']
  ): Promise<string>
  getChangeHistory(filePath: string): FileChange[]
  async revertToChange(changeId: string, options?: RevertOptions): Promise<void>
  getChangeDiff(changeId: string): FileChangeDiff | null
  onFileChange(filePath: string, callback: (change: FileChange) => void): vscode.Disposable
  stopTracking(filePath: string): void
  clearAllTracking(): void
}
```

**책임**:
- 파일 변경 전후 상태 추적
- 파일 타임라인에 모든 변경사항 기록
- 변경사항 diff 뷰 제공
- 변경사항 직접 편집/되돌리기 가능
- 변경 이력 영구 저장 (VS Code globalState)
- 변경사항 리스너 등록 및 알림

**구현 파일**:
- `action/file/FileChangeTracker.ts` - 파일 변경 추적 및 검증
- `action/file/types.ts` - 파일 변경 타입 정의 (FileChange, FileChangeHistory, FileChangeDiff, RevertOptions)

**통합**:
- `ActionManager`에 통합되어 파일 생성/수정/삭제 시 자동 추적
- 변경 전후 내용 자동 저장
- 메타데이터 기록 (taskId, source 등)
- 위치: `src/core/action/file/` (ActionManager 전용)
- `llm/` - LLM 추상화 통합
  - `ILLMAdapter.ts` - LLM 어댑터 인터페이스
  - `GptAdapter.ts` - GPT 어댑터 (PromptComposer 사용)

**LLM 어댑터와 프롬프트 시스템**:
- `ILLMAdapter` 인터페이스: `buildSystemPrompt()` 메서드로 시스템 프롬프트 생성
- `GptAdapter`: `PromptComposer`를 사용하여 일관된 프롬프트 생성
- OSAdapter, FrameworkAdapter 정보를 자동으로 프롬프트에 반영

---

## 🔗 Manager 간 연결

```
┌─────────────────┐
│  Action Manager │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│Execution Manager│◄──┐
│  (OS 통합)       │   │
└────────┬────────┘   │
         │            │
         ▼            │
┌─────────────────┐  │
│Terminal Manager │  │
└────────┬────────┘  │
         │           │
         ▼           │
┌─────────────────┐ │
│  Error Manager  │─┘
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│Context Manager  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Project Manager │
│(Framework 통합) │
│(CodeParser 통합)│
└─────────────────┘

┌─────────────────┐
│  Task Manager   │ (독립적)
└─────────────────┘

┌─────────────────┐
│State/Session Mgr│ (독립적)
└─────────────────┘

┌─────────────────┐
│  Model Manager  │ (독립적)
│  (LLM 통합)     │
└─────────────────┘
```

## 🔄 통신 플로우

### 기본 플로우 (v6.3.0: FSM 통합)
```
사용자 입력
  ↓
ConversationService.handleUserMessage()
  ↓
ConversationManager.handleUserMessageAndRespond()
  ↓
IntentDetector (의도 분석 - LLM 기반)
  ↓
AgentStateManager 초기화 (INVESTIGATION 또는 EXECUTION)
  ↓
[INVESTIGATION Phase]
  ↓
InvestigationManager (조사 프롬프트 생성)
  ↓
Context Manager (컨텍스트 수집)
  ↓
LLM Manager (LLM 호출)
  ↓
ToolParser (도구 호출 파싱)
  ↓
AgentStateManager.validateOutput() (Output Contract 검증)
  ↓
AgentStateManager.isToolAllowed() (도구 허용 여부 검증)
  ↓
ToolExecutor (도구 실행 - read_file, list_files 등)
  ↓
[Plan 생성 시]
  ↓
AgentStateManager.transitionTo(EXECUTION) (상태 전환 검증)
  ↓
[EXECUTION Phase]
  ↓
TaskManager (Plan Item 관리)
  ↓
ToolExecutor (도구 실행 - create_file, update_file 등)
  ↓
Execution Manager (명령 실행)
  ↓
Terminal Manager (터미널 세션)
  ↓
Error Manager (에러 감지)
  ↓
WebviewBridge (UI 업데이트)
```

### 상태 전환 플로우 (v6.3.0)
```
INVESTIGATION Phase
  ├─ 조사 도구 사용 (read_file, list_files, ripgrep_search)
  ├─ 조사 이력 추적 (hasInvestigationHistory = true)
  ├─ Plan 생성 (<plan> 태그)
  ├─ AgentStateManager.transitionTo(EXECUTION) 호출
  │   ├─ 전환 조건 검증:
  │   │   - hasPlan: true
  │   │   - toolCallsInTurn.length > 0 OR hasInvestigationHistory: true
  │   └─ 조건 충족 시 전환 성공
  └─ EXECUTION Phase로 전환

EXECUTION Phase
  ├─ Plan Item 순차 실행
  ├─ 도구 호출 (create_file, update_file, remove_file, run_command)
  ├─ AgentStateManager.isToolAllowed() 검증 (모든 도구 허용)
  ├─ Plan Item 완료 처리
  └─ 모든 Plan Item 완료 시 루프 종료
```

### 에러 복구 플로우
```
Error Manager (에러 감지)
  ↓
Error Manager (에러 파싱 & 분석)
  ↓
Context Manager (에러 컨텍스트)
  ↓
Model Manager (LLM에게 수정 요청)
  ↓
Action Manager (수정 액션 생성)
  ↓
Execution Manager (재실행)
```

## 📊 통계

### 코드 통계
- **총 매니저 파일 수**: 40+ 파일
- **총 라인 수**: 약 8,000+ 라인
- **타입 정의**: 9개 매니저 × 평균 200 라인 = 1,800+ 라인

### 매니저별 라인 수 (추정)
1. Action Manager: ~800 라인
2. Execution Manager: ~900 라인 (OS 추상화 포함)
3. Terminal Manager: ~700 라인
4. Task Manager: ~1,000 라인
5. Error Manager: ~900 라인
6. Context Manager: ~800 라인
7. State/Session Manager: ~700 라인
8. Project Manager: ~1,200 라인 (Framework, CodeParser 포함)
9. Model Manager: ~450 라인 (LLM 추상화 포함)

## 📝 사용 예시

### ManagerAdapter를 통한 사용

```typescript
import { getManagerAdapter } from './core/integration/ManagerAdapter';

const adapter = getManagerAdapter();

// Action Manager 사용
const actions = await adapter.getActionManager().mapResponse(llmResponse);

// Execution Manager 사용 (OS 어댑터 포함)
const execManager = adapter.getExecutionManager();
const normalizedCmd = execManager.normalizeCommand('npm install');
const result = await execManager.executeCommand(normalizedCmd);

// Context Manager 사용
const context = await adapter.getContextManager().collectContext({
    types: [ContextType.FILE, ContextType.CURSOR],
    includeContent: true
});

// Error Manager 사용
const error = await adapter.getErrorManager().captureError(
    ErrorSource.TERMINAL,
    errorOutput
);

// Project Manager 사용 (Framework, CodeParser 포함)
const projectManager = adapter.getProjectManager();
const projectInfo = projectManager.getCurrentProject();
const framework = projectManager.getFrameworkAdapter();
const codeParser = projectManager.getCodeParserAdapter();

// Model Manager 사용 (LLM 어댑터 포함)
const modelManager = adapter.getModelManager();
const currentModel = modelManager?.getCurrentModel();
const llmAdapter = modelManager?.getLLMAdapter();
```

### 직접 매니저 사용

```typescript
import { 
    ExecutionManager, 
    ProjectManager, 
    ModelManager 
} from './core';

// Execution Manager에서 OS 어댑터 사용
const execManager = ExecutionManager.getInstance();
const osAdapter = execManager.getOSAdapter();
const normalizedCmd = execManager.normalizeCommand('npm install');

// Project Manager에서 Framework 어댑터 사용
const projectManager = ProjectManager.getInstance();
const framework = projectManager.getFrameworkAdapter();
if (framework) {
    const buildCmd = framework.getBuildCommand();
}

// Project Manager에서 Code Parser 사용
const codeParser = projectManager.getCodeParserAdapter();
const summary = await codeParser.getProjectSummary(projectRoot, {
    maxFiles: 30,
    includeTests: false
});

// Model Manager에서 LLM 어댑터 사용
const modelManager = ModelManager.getInstance(context);
const llmAdapter = modelManager.getLLMAdapter();
const prompt = await llmAdapter.buildSystemPrompt(context);
```

## ✅ 구현 완료 상태

### Phase 1: 매니저 인터페이스 정의 ✅
- [x] 각 매니저의 인터페이스 및 타입 정의
- [x] 매니저 간 의존성 그래프 정리

### Phase 2: 핵심 매니저 구현 ✅
- [x] Action Manager
- [x] Execution Manager (OS 추상화 통합)
- [x] Terminal Manager

### Phase 3: 보조 매니저 구현 ✅
- [x] Task Manager
- [x] Context Manager
- [x] Error Manager

### Phase 4: 상태 및 프로젝트 매니저 ✅
- [x] State/Session Manager
- [x] Project Manager (Framework, CodeParser 통합)
- [x] Model Manager (LLM 추상화 통합)

### Phase 5: 기존 코드 마이그레이션 ✅
- [x] extension.ts에 모든 매니저 초기화
- [x] ManagerAdapter 통합
- [x] llmService.ts에 ManagerAdapter 통합
- [x] 모든 import 경로를 core로 변경
- [x] abstractions 디렉토리 코드를 core로 통합

### Phase 6: 통합 및 테스트
- [ ] End-to-end 테스트
- [ ] 성능 테스트
- [ ] UI 통합

## 🎯 성공 기준

1. **코드 품질**
   - 각 파일 500 라인 이하
   - 순환 의존성 0개
   - 단일 책임 원칙 준수

2. **유지보수성**
   - 새로운 액션 타입 추가 시 1개 파일만 수정
   - 새로운 LLM 모델 추가 시 Model Manager만 수정
   - 단위 테스트 커버리지 80% 이상

3. **확장성**
   - 플러그인 방식 액션 추가
   - 멀티 LLM 동시 지원
   - 커스텀 에러 패턴 등록

4. **성능**
   - 액션 매핑 < 100ms
   - 컨텍스트 수집 < 500ms
   - 메모리 사용량 < 200MB

## 🚀 다음 단계

1. **통합 테스트 작성**
   - 각 매니저의 단위 테스트
   - Manager 간 통합 테스트
   - End-to-end 테스트

2. **성능 최적화**
   - 컨텍스트 수집 최적화
   - 파일 인덱싱 성능 개선
   - 메모리 사용량 최적화

3. **UI 통합**
   - 매니저 상태 표시
   - 에러 히스토리 UI
   - 작업 큐 모니터링 UI

4. **문서화**
   - API 문서 작성
   - 사용 가이드 작성
   - 아키텍처 다이어그램

## ✅ 검증 완료

- ✅ 모든 매니저 컴파일 성공
- ✅ extension.ts 통합 완료
- ✅ ManagerAdapter 통합 완료
- ✅ llmService.ts 통합 완료
- ✅ 타입 안정성 확인
- ✅ abstractions 디렉토리 코드를 core로 통합 완료
- ✅ 모든 import 경로 변경 완료
- ✅ LLMManager 생성 및 ResponseFormatter 통합 완료
- ✅ llmService.ts, terminal/terminalManager.ts 남은 기능 분산 완료
- ✅ llmService.ts orphaned 코드 완전 제거 완료 (약 480줄 제거)
- ✅ ProjectManager에 detectProjectTypeFromQuery 메서드 추가 완료
- ✅ llmService.ts 모든 linter 에러 해결 완료 (5개 → 0개)
- ✅ llmService.ts가 ConversationService의 thin wrapper로 완전 전환 완료
- ✅ `src/ai/` 디렉토리 파일들을 `services/`로 이동 완료:
  - `gemini.ts` → `services/llm/GeminiApi.ts`
  - `ollama.ts` → `services/llm/OllamaApi.ts`
  - `externalApiService.ts` → `services/external/ExternalApiService.ts`
  - `types.ts` → `services/Types.ts`
  - 모든 import 경로 수정 완료 (14개 파일)
  - `src/ai/` 디렉토리 비어있음
- ✅ 웹뷰 보조 서비스 분리
  - `webview/services/LocaleService.ts` (로케일 파일 로더)
  - `panelManager.ts`에서 언어 파일 로딩 로직 제거, 서비스 호출로 단순화
- ✅ `src/webview` 디렉토리 리팩토링 완료:
  - `chatViewProvider.ts` → `webview/providers/ChatViewProvider.ts`
  - `askViewProvider.ts` → `webview/providers/AskViewProvider.ts`
  - `panelManager.ts` → `webview/providers/SettingsPanelProvider.ts` (re-export) + `core/webview/SettingsPanelProvider.ts` (core 로직)
  - `panelUtils.ts` → `utils/panelUtils.ts`
  - 배럴 파일 생성 (`webview/providers/index.ts`, `webview/services/index.ts`)
- ✅ `src/services` 정리 완료:
  - 도메인별 서브디렉토리 생성 (`llm/`, `external/`, `git/`, `license/`, `notification/`)
  - 파일명 PascalCase로 변경 (클래스 파일)
  - 배럴 파일 생성 (`services/index.ts`)
  - `OllamaBlockerService`를 `services/llm/`으로 이동
- ✅ `src/utils` 정리 완료:
  - 배럴 파일 생성 (`utils/index.ts`)
  - 모든 유틸리티 함수 통합 export
- ✅ Deprecated 주석 제거 완료:
  - `webview/providers/*`, `services/llm/*`, `core/webview/*`, `extension.ts`에서 모든 deprecated 주석 제거
- ✅ `core/index.ts` export 충돌 해결 완료:
  - 중복 타입 export 문제 해결 (alias 사용)
  - 존재하지 않는 타입 제거
- ✅ 추상화 개선 완료:
  - Singleton 패턴 추상화: `BaseManager` 클래스 생성 및 `StateManager`, `SettingsManager` 마이그레이션
  - Configuration 반복 호출 추상화: `ConfigurationService` 생성 및 `SettingsManager`에서 사용
  - 에러 처리 패턴 추상화: `SafeSettingsHelper` 생성 및 `TerminalManager`에서 사용
  - `ManagerAdapter` 제거: 불필요한 추상화 레이어 제거, 각 매니저 직접 사용
- ✅ 프롬프트 시스템 리팩토링 완료:
  - `PromptComposer` 생성: OS별, LLM별, 프레임워크별, 작업 타입별 프롬프트 컴포넌트를 동적으로 조합
  - 프롬프트 컴포넌트 모듈화: `base/`, `os/`, `llm/`, `framework/`, `task/` 디렉토리로 분리
  - OSAdapter 통합: OS 정보를 프롬프트에 자동 반영
  - FrameworkAdapter 통합: `FrameworkPromptBuilder`를 통해 프레임워크별 프롬프트 동적 생성
  - GptAdapter 통합: `GptAdapter.buildSystemPrompt()`가 `PromptComposer`를 사용하도록 수정
  - COMMON_SYSTEM_PROMPTS 제거: 중복 프롬프트 제거, 일관된 프롬프트 시스템으로 통합
- ✅ 프롬프트 시스템 완전 통합 완료:
  - 모든 프롬프트를 `context/prompts/`로 통합: `commonGuides.ts` 제거, 프롬프트 가이드들을 `base/`로 이동
  - OS 프롬프트 헬퍼 통합: `os/helpers.ts` 제거, `PromptComposer.getOSPrompt()` public 메서드로 통합
  - 어댑터 단순화: GptAdapter, GemmaAdapter가 PromptComposer를 직접 사용하도록 변경
  - 중복 제거: 프롬프트 관련 코드 중복 완전 제거, 구조 단순화

## 📅 완료 일자

**2024년 12월** - 모든 매니저 구현 및 통합 완료, 추상화 레이어 통합 완료
**2024년 12월** - LLMManager 생성 및 남은 기능 분산 완료
**2024년 12월** - llmService.ts 완전 정리 완료 (orphaned 코드 제거, ProjectManager 통합, 모든 linter 에러 해결)
**2024년 12월** - `src/ai/` 디렉토리 파일들을 `services/`로 이동 완료 (gemini.ts, ollama.ts, externalApiService.ts, types.ts)
**2024년 12월** - `panelManager.ts`의 모델/로케일 로더를 `webview/services/*`로 분리, ExternalApiService/ModelConnectionService/SettingsManager 연동 완료
**2024년 12월** - `src/webview` 디렉토리 리팩토링 완료 (providers/ 디렉토리 구조, 배럴 파일 생성)
**2024년 12월** - `src/services` 정리 완료 (도메인별 서브디렉토리, PascalCase 파일명, 배럴 파일)
**2024년 12월** - `src/utils` 배럴 파일 생성 및 정리 완료
**2024년 12월** - Deprecated 주석 제거 및 `core/index.ts` export 충돌 해결 완료
**2024년 12월** - 추상화 개선 완료 (BaseManager, ConfigurationService, SafeSettingsHelper, ManagerAdapter 제거)
**2024년 12월** - 프롬프트 시스템 리팩토링 완료 (PromptComposer, 프롬프트 컴포넌트 모듈화, OSAdapter/FrameworkAdapter 통합, COMMON_SYSTEM_PROMPTS 제거)
**2024년 12월** - 프롬프트 시스템 완전 통합 완료 (commonGuides.ts 제거, helpers.ts 제거, 모든 프롬프트를 context/prompts/로 통합, 중복 제거)
**2024년 12월** - FrameworkAdapter 구조 제거 완료 ( LLM이 프로젝트 파일을 읽어서 판단하도록 프롬프트 개선, framework/ 디렉토리 삭제)

