# AiDev-IDE 아키텍처 리팩토링 계획

## 🎯 목표
- 명확한 책임 분리 (Single Responsibility Principle)
- 유지보수 용이성 향상
- 확장 가능한 구조
- 매니저 기반 계층 아키텍처

## 📁 새로운 디렉토리 구조

```
src/
├── managers/                      # 핵심 매니저 레이어
│   ├── action/                    # 1. Action Manager
│   │   ├── ActionManager.ts       # 메인 액션 매니저
│   │   ├── ActionRegistry.ts      # 액션 등록/관리
│   │   ├── ActionValidator.ts     # 액션 검증
│   │   ├── ActionMapper.ts        # LLM 요청 → 액션 매핑
│   │   └── types.ts               # 액션 타입 정의
│   │
│   ├── execution/                 # 2. Execution Manager
│   │   ├── ExecutionManager.ts    # 메인 실행 매니저
│   │   ├── ProcessManager.ts      # 프로세스(PID) 관리
│   │   ├── StreamManager.ts       # stdout/stderr 스트림 관리
│   │   ├── ErrorDetector.ts       # 에러/포트 충돌 감지
│   │   └── types.ts
│   │
│   ├── terminal/                  # 3. Terminal Manager
│   │   ├── TerminalManager.ts     # 터미널 세션 관리
│   │   ├── TerminalSession.ts     # 개별 터미널 세션
│   │   ├── TerminalHistory.ts     # 터미널 히스토리
│   │   └── types.ts
│   │
│   ├── task/                      # 4. Task Manager
│   │   ├── TaskManager.ts         # 작업 큐 관리
│   │   ├── TaskQueue.ts           # 작업 큐 구현
│   │   ├── TaskScheduler.ts       # 우선순위 스케줄링
│   │   ├── TaskRetry.ts           # 재시도 로직
│   │   └── types.ts
│   │
│   ├── project/                   # 5. Project Manager
│   │   ├── ProjectManager.ts      # 프로젝트 구조 관리
│   │   ├── ProjectDetector.ts     # 프로젝트 타입 감지
│   │   ├── ProjectIndexer.ts      # 파일 인덱싱
│   │   ├── ConfigParser.ts        # 설정 파일 파싱
│   │   └── types.ts
│   │
│   ├── context/                   # 6. Context Manager
│   │   ├── ContextManager.ts      # LLM 컨텍스트 관리
│   │   ├── FileContext.ts         # 파일 컨텍스트
│   │   ├── EditorContext.ts       # 에디터 컨텍스트
│   │   ├── TerminalContext.ts     # 터미널 로그 컨텍스트
│   │   └── types.ts
│   │
│   ├── state/                     # 7. State/Session Manager
│   │   ├── StateManager.ts        # 전역 상태 관리
│   │   ├── SessionManager.ts      # 세션 관리
│   │   ├── SettingsManager.ts     # 사용자 설정
│   │   └── types.ts
│   │
│   ├── error/                     # 8. Error Manager
│   │   ├── ErrorManager.ts        # 에러 관리
│   │   ├── ErrorParser.ts         # 에러 파싱
│   │   ├── StackTraceAnalyzer.ts  # 스택 트레이스 분석
│   │   ├── ErrorHistory.ts        # 에러 히스토리
│   │   └── types.ts
│   │
│   └── model/                     # 9. Model Manager
│       ├── ModelManager.ts        # LLM 모델 관리
│       ├── ModelSelector.ts       # 모델 선택
│       ├── ApiKeyManager.ts       # API 키 관리
│       ├── ModelAdapter.ts        # 모델 어댑터 인터페이스
│       └── types.ts
│
├── abstractions/                  # 기존 추상화 레이어 (유지)
│   ├── os/
│   ├── llm/
│   ├── framework/
│   └── codeParser/
│
├── services/                      # 보조 서비스 (유틸리티성)
│   ├── storage.ts
│   ├── notification.ts
│   ├── license.ts
│   └── git/
│
├── webview/                       # UI 레이어
│   ├── chat/
│   ├── ask/
│   └── panels/
│
├── utils/                         # 유틸리티
│
└── extension.ts                   # 진입점
```

## 🎭 매니저별 상세 책임

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
  async mapRequest(llmRequest: LLMRequest): Promise<Action[]>
  async validateAction(action: Action): Promise<ValidationResult>
  async executeAction(action: Action): Promise<ActionResult>
  registerAction(actionDef: ActionDefinition): void
}
```

**책임**:
- LLM 응답 파싱 및 액션 추출
- 액션 타입 결정 (file_operation, terminal_command, code_generation)
- 액션 파라미터 검증
- 권한 체크
- 컨텍스트 주입
- Execution Manager에 실행 요청 전달

**기존 코드 통합**:
- `llmResponseProcessor.ts` (액션 추출 부분)
- `actionPlannerService.ts` (액션 계획 부분)
- `intentDetectionService.ts` (의도 감지)

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
}
```

**책임**:
- 터미널 명령 실행
- 프로세스 생성 및 관리 (PID)
- 장기 실행 프로세스 관리
- stdout/stderr 스트림 라우팅
- 에러 감지 (포트 충돌, 실행 실패)
- 실행 상태 추적

**기존 코드 통합**:
- `actionExecutionEngine.ts` (실행 엔진)
- `terminalManager.ts` (명령 실행 부분)
- `processRunner.ts`

---

### 3️⃣ Terminal Manager
**역할**: 터미널 세션 생명주기 관리

```typescript
class TerminalManager {
  createTerminal(name: string): TerminalSession
  getTerminal(id: string): TerminalSession | null
  listTerminals(): TerminalSession[]
  destroyTerminal(id: string): void
  captureOutput(terminalId: string): Observable<string>
}
```

**책임**:
- VS Code 터미널 생성/삭제
- 멀티 터미널 관리
- 터미널 히스토리 유지
- 출력 스트림 캡처 및 라우팅

**기존 코드 통합**:
- `terminalManager.ts` (세션 관리 부분)
- `terminalDaemonClient.ts`

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
}
```

**책임**:
- 작업 큐 관리
- 우선순위 처리
- 장기 작업 진행률 업데이트
- 실패 시 재시도
- 작업 히스토리 저장

**기존 코드 통합**:
- `planQueueService.ts`
- `terminalManager.ts` (큐 관리 부분)

---

### 5️⃣ Project Manager
**역할**: 프로젝트 구조 및 메타데이터 관리

```typescript
class ProjectManager {
  async detectProjectType(): Promise<ProjectType>
  async getProjectStructure(): Promise<FileTree>
  async findBuildCommands(): Promise<BuildCommands>
  async parseConfig(configFile: string): Promise<ConfigData>
  async indexFiles(pattern: string): Promise<FileIndex>
}
```

**책임**:
- 프로젝트 타입 감지 (React, Flutter, Spring Boot 등)
- 파일 트리 파싱
- 설정 파일 분석 (package.json, pubspec.yaml)
- 빌드/테스트 스크립트 추출
- 파일 인덱싱 (캐싱)

**기존 코드 통합**:
- `projectProfileService.ts`
- `codebaseContextService.ts` (프로젝트 분석 부분)
- `FrameworkAdapterFactory.ts`

---

### 6️⃣ Context Manager
**역할**: LLM에게 제공할 컨텍스트 수집

```typescript
class ContextManager {
  async getCurrentFileContext(): Promise<FileContext>
  async getSelectedTextContext(): Promise<TextContext>
  async getCursorContext(): Promise<CursorContext>
  async getRecentErrors(): Promise<ErrorContext[]>
  async getRelatedFiles(file: string): Promise<string[]>
  buildLLMContext(request: LLMRequest): Promise<ContextData>
}
```

**책임**:
- 현재 파일 내용
- 선택된 텍스트
- 커서 위치 및 주변 코드
- 최근 터미널 에러
- 편집 기록
- 관련 파일 자동 탐색 (import 분석)

**기존 코드 통합**:
- `codebaseContextService.ts` (컨텍스트 수집 부분)
- `llmKeywordSelectionService.ts`

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
}
```

**책임**:
- 선택된 LLM 모델
- extension 모드 (Assist, Auto-Fix, Chat)
- 최근 실행 명령/액션
- 사용자 설정 (autoExecute, autoCorrect 등)
- 프로젝트별 세션
- 대화 히스토리

**기존 코드 통합**:
- `configurationService.ts`
- `storage.ts`
- `llmService.ts` (상태 관리 부분)

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
}
```

**책임**:
- 터미널 에러 감지
- 스택 트레이스 파싱
- 파일/라인 번호 추출
- 에러 히스토리 저장
- LLM에게 전달하기 쉽게 구조화
- 자동 수정 제안

**기존 코드 통합**:
- `terminalMonitorService.ts`
- `terminalManager.ts` (에러 처리 부분)

---

### 9️⃣ Model Manager
**역할**: LLM 모델 선택 및 관리

```typescript
class ModelManager {
  listAvailableModels(): Model[]
  selectModel(modelId: string): void
  getCurrentModel(): Model
  async validateApiKey(provider: string, key: string): Promise<boolean>
  setApiKey(provider: string, key: string): void
}
```

**책임**:
- LLM 모델 목록 관리
- 모델 선택/전환
- API 키 관리 (Gemini, GPT, Ollama)
- 모델별 설정 (temperature, max_tokens)

**기존 코드 통합**:
- `llmService.ts` (모델 관리 부분)
- `gemini.ts`, `ollama.ts` (어댑터)
- `configurationService.ts` (모델 설정)

---

## 🔄 통신 플로우

### 기본 플로우
```
사용자 입력
  ↓
Context Manager (컨텍스트 수집)
  ↓
Model Manager (LLM 호출)
  ↓
Action Manager (액션 매핑 & 검증)
  ↓
Task Manager (작업 큐잉)
  ↓
Execution Manager (실제 실행)
  ↓
Terminal Manager (터미널 세션)
  ↓
Error Manager (에러 감지)
  ↓
State Manager (상태 저장)
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

## 📋 마이그레이션 계획

### Phase 1: 매니저 인터페이스 정의
- [ ] 각 매니저의 인터페이스 및 타입 정의
- [ ] 매니저 간 의존성 그래프 정리

### Phase 2: 핵심 매니저 구현
- [ ] Action Manager
- [ ] Execution Manager
- [ ] Terminal Manager

### Phase 3: 보조 매니저 구현
- [ ] Task Manager
- [ ] Context Manager
- [ ] Error Manager

### Phase 4: 상태 및 프로젝트 매니저
- [ ] State/Session Manager
- [ ] Project Manager
- [ ] Model Manager

### Phase 5: 기존 코드 마이그레이션
- [ ] llmService 분해
- [ ] terminalManager 리팩토링
- [ ] 서비스 레이어 정리

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

