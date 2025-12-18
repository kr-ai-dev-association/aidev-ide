# aidev-ide 기능 개선 제안서

## 목차

1. [안정성 향상 기능](#안정성-향상-기능)
2. [정확도 향상 기능](#정확도-향상-기능)
3. [사용자 경험 개선 기능](#사용자-경험-개선-기능)
4. [구현 우선순위](#구현-우선순위)

---

## 안정성 향상 기능

### 1. 체크포인트/스냅샷 시스템 ⭐⭐⭐

**현재 상태**: 없음

**구현 방식**:
- 각 작업 단계마다 워크스페이스 스냅샷 생성
- 파일 변경사항 추적 및 타임스탬프 기록
- 체크포인트 간 diff 비교 기능
- 선택적 복원 (워크스페이스만 / 작업 + 워크스페이스)

**추가 필요 기능**:
```typescript
// src/core/checkpoint/CheckpointManager.ts
class CheckpointManager {
  // 스냅샷 생성
  async createCheckpoint(taskId: string): Promise<CheckpointId>
  
  // 스냅샷 비교
  async compareCheckpoints(
    checkpointId1: CheckpointId,
    checkpointId2: CheckpointId
  ): Promise<FileDiff[]>
  
  // 복원
  async restoreCheckpoint(
    checkpointId: CheckpointId,
    options: { workspaceOnly?: boolean, taskHistory?: boolean }
  ): Promise<void>
}
```

**기대 효과**:
- 작업 중 실수로 인한 손실 방지
- 다양한 접근 방식 안전하게 테스트 가능
- 롤백을 통한 빠른 복구

**구현 난이도**: 중

---

### 3. 진단(Diagnostics) 모니터링 및 자동 수정 ⭐⭐⭐

**현재 상태**: 기본적인 에러 감지만 지원

**구현 방식**:
- VS Code Diagnostics API를 통한 실시간 린터/컴파일러 오류 모니터링
- 파일 수정 시 자동으로 오류 감지
- 누락된 import, 문법 오류 등 자동 수정
- 오류 발생 시 LLM에 자동 전달하여 수정 제안

**추가 필요 기능**:
```typescript
// src/core/diagnostics/DiagnosticsMonitor.ts
class DiagnosticsMonitor {
  // 진단 모니터링 시작
  startMonitoring(): void
  
  // 파일별 진단 정보 가져오기
  getDiagnostics(filePath: string): Diagnostic[]
  
  // 오류 자동 수정 시도
  async autoFixDiagnostics(
    filePath: string,
    diagnostics: Diagnostic[]
  ): Promise<FixResult>
  
  // 진단 변경 이벤트 구독
  onDiagnosticsChanged(
    callback: (filePath: string, diagnostics: Diagnostic[]) => void
  ): void
}
```

**기대 효과**:
- 코드 생성 후 즉시 오류 감지 및 수정
- 사용자 개입 없이 자동으로 문제 해결
- 코드 품질 향상

**구현 난이도**: 중-높음

---

### 4. 잠금(Lock) 관리 시스템 ⭐⭐ (Phase 5로 이동)

**현재 상태**: 없음

**구현 방식**:
- SQLite 기반 분산 잠금 관리
- 동시 작업 충돌 방지
- 폴더/파일 단위 잠금

**추가 필요 기능**:
```typescript
// src/core/locks/LockManager.ts
class LockManager {
  // 잠금 획득
  async acquireLock(
    resourceId: string,
    taskId: string,
    timeout?: number
  ): Promise<Lock>
  
  // 잠금 해제
  async releaseLock(lockId: string): Promise<void>
  
  // 잠금 상태 확인
  async isLocked(resourceId: string): Promise<boolean>
}
```

**기대 효과**:
- 동시 작업 시 파일 충돌 방지
- 멀티 워크스페이스 환경에서 안전한 작업
- 데이터 무결성 보장

**구현 난이도**: 중

---

---

### 5. 브라우저 자동화 (Browser Automation) ⭐⭐⭐

**현재 상태**: 없음

**구현 방식**:
- Puppeteer/Chrome DevTools Protocol을 통한 헤드리스 브라우저 제어
- 웹 페이지 방문, 클릭, 타이핑, 스크롤 등 상호작용
- 스크린샷 캡처 및 콘솔 로그 모니터링
- 로컬 개발 서버 테스트 및 런타임 에러 디버깅
- 원격 브라우저 연결 지원 (선택적)

**추가 필요 기능**:
```typescript
// src/core/browser/BrowserSession.ts
class BrowserSession {
  // 브라우저 실행
  async launchBrowser(options?: BrowserOptions): Promise<void>
  
  // 페이지 방문
  async navigateTo(url: string): Promise<void>
  
  // 요소 클릭
  async clickElement(selector: string): Promise<void>
  
  // 텍스트 입력
  async typeText(selector: string, text: string): Promise<void>
  
  // 스크롤
  async scroll(direction: 'up' | 'down' | 'left' | 'right', pixels: number): Promise<void>
  
  // 스크린샷 캡처
  async captureScreenshot(options?: ScreenshotOptions): Promise<string>
  
  // 콘솔 로그 가져오기
  getConsoleLogs(): ConsoleMessage[]
  
  // 브라우저 종료
  async closeBrowser(): Promise<void>
}

// src/core/browser/BrowserToolHandler.ts
class BrowserToolHandler {
  // 브라우저 액션 실행
  async executeBrowserAction(
    action: 'navigate' | 'click' | 'type' | 'scroll' | 'screenshot',
    params: any
  ): Promise<BrowserActionResult>
}
```

**기대 효과**:
- 웹 개발 작업에서 런타임 에러 즉시 감지 및 수정
- 시각적 버그 확인 및 수정
- E2E 테스트 자동화
- 로컬 개발 서버 자동 테스트
- 인터랙티브 디버깅

**구현 난이도**: 중-높음

---

### 6. MCP (Model Context Protocol) 통합 ⭐⭐⭐

**현재 상태**: 없음

**구현 방식**:
- MCP 서버와의 통신 (STDIO/SSE)
- 동적 도구 및 리소스 로드
- 커스텀 MCP 서버 생성 및 설치 지원
- MCP 마켓플레이스 통합

**추가 필요 기능**:
```typescript
// src/core/mcp/McpHub.ts
class McpHub {
  // MCP 서버 연결
  async connectToServer(serverConfig: McpServerConfig): Promise<void>
  
  // 사용 가능한 도구 목록 가져오기
  getAvailableTools(): McpTool[]
  
  // MCP 도구 실행
  async executeMcpTool(
    serverName: string,
    toolName: string,
    args: Record<string, any>
  ): Promise<any>
  
  // MCP 리소스 접근
  async accessMcpResource(
    serverName: string,
    resourceName: string
  ): Promise<any>
  
  // 커스텀 MCP 서버 생성
  async createCustomMcpServer(
    name: string,
    tools: McpToolDefinition[],
    resources?: McpResourceDefinition[]
  ): Promise<void>
}

// src/core/mcp/McpToolHandler.ts
class McpToolHandler {
  // MCP 도구 실행 핸들러
  async handleMcpToolCall(
    serverName: string,
    toolName: string,
    args: any
  ): Promise<ToolResult>
}
```

**기대 효과**:
- 외부 API 및 서비스 통합
- 실시간 데이터 접근
- 애플리케이션 및 로컬 시스템 제어
- 확장 가능한 도구 생태계
- 커스텀 워크플로우 구축

**구현 난이도**: 높음

---

### 7. Plan Mode / Act Mode 전환 ⭐⭐⭐

**현재 상태**: 없음

**구현 방식**:
- Plan Mode: 정보 수집 및 계획 수립 후 사용자 승인 대기
- Act Mode: 도구를 사용하여 실제 작업 수행
- 모드 간 전환 시 작업 상태 보존
- 모드별 다른 프롬프트 및 동작

**추가 필요 기능**:
```typescript
// src/core/mode/ModeManager.ts
class ModeManager {
  // 현재 모드 가져오기
  getCurrentMode(): 'plan' | 'act'
  
  // 모드 전환
  async switchMode(
    mode: 'plan' | 'act',
    preserveTask?: boolean
  ): Promise<void>
  
  // Plan Mode에서 계획 생성
  async generatePlan(userRequest: string): Promise<Plan>
  
  // 계획 승인 및 Act Mode 전환
  async approvePlanAndSwitchToAct(plan: Plan): Promise<void>
  
  // 모드별 프롬프트 생성
  getModePrompt(mode: 'plan' | 'act'): string
}

// src/core/mode/Plan.ts
interface Plan {
  steps: PlanStep[]
  estimatedTime?: number
  requiredFiles?: string[]
  risks?: string[]
}

interface PlanStep {
  description: string
  tools?: string[]
  files?: string[]
}
```

**기대 효과**:
- 복잡한 작업 전 계획 수립으로 정확도 향상
- 사용자 승인을 통한 안전한 작업 수행
- 작업 전략 명확화
- 예상치 못한 작업 방지

**구현 난이도**: 중

---

### 10. 파일 Timeline 추적 ⭐⭐⭐

**현재 상태**: 기본적인 파일 변경만 지원

**구현 방식**:
- VS Code Timeline API 활용
- 파일 변경 이력 자동 기록
- 변경사항 diff 뷰 제공
- 특정 시점으로 되돌리기

**추가 필요 기능**:
```typescript
// src/core/timeline/FileTimelineManager.ts
class FileTimelineManager {
  // 파일 변경 이력 기록
  async recordFileChange(
    filePath: string,
    changeType: 'create' | 'modify' | 'delete',
    content: string,
    metadata?: {
      taskId?: string
      message?: string
    }
  ): Promise<void>
  
  // 파일 Timeline 가져오기
  async getFileTimeline(filePath: string): Promise<TimelineEntry[]>
  
  // 특정 시점으로 되돌리기
  async revertToTimelineEntry(
    filePath: string,
    entryId: string
  ): Promise<void>
  
  // Timeline diff 뷰 생성
  async createTimelineDiff(
    filePath: string,
    entryId1: string,
    entryId2: string
  ): Promise<Diff>
}

interface TimelineEntry {
  id: string
  timestamp: number
  changeType: 'create' | 'modify' | 'delete'
  content: string
  metadata?: {
    taskId?: string
    message?: string
  }
}
```

**기대 효과**:
- 모든 파일 변경사항 추적
- 실수한 변경사항 빠른 복구
- 작업 이력 명확한 추적
- 디버깅 용이성 향상

**구현 난이도**: 중

---

### 11. 누락된 파일 탐색 Action 타입 추가 ⭐⭐⭐

**현재 상태**: 정규식 기반 파싱으로 파일 생성/수정/삭제, 터미널 명령 실행은 지원하지만, 파일 읽기/목록/검색을 수행하는 명시적인 Action 타입은 없음.

**구현 방식**:
- Tool 기반 액션 커버리지를 참고하여, aidev-ide의 `ActionType` 및 `ActionMapper`에 파일 탐색 계열 액션을 단계적으로 도입
- LLM 응답에서 아래 패턴을 인식해 Action으로 매핑:
  - **파일 읽기**: 특정 파일 내용을 읽어야 할 때 → `FILE_READ` 액션
  - **파일 목록 조회**: 디렉터리 또는 글롭 패턴에 맞는 파일 목록을 요청할 때 → `FILE_LIST` 액션
  - **파일 검색**: 키워드/정규식 기반으로 파일 내용을 검색할 때 → `FILE_SEARCH` 액션
- 이미 구현된 `FileSearcher`, `RelevantFilesFinder` 등을 재사용하여, Action 실행 시 실제 파일 시스템에서 읽기/목록/검색 수행

**추가 필요 기능**:
```typescript
// src/core/action/types.ts
export enum ActionType {
  CODE_GENERATION = 'code_generation',
  FILE_OPERATION = 'file_operation',
  TERMINAL_COMMAND = 'terminal_command',
  ANALYSIS = 'analysis',
  VERIFICATION = 'verification',
  SEARCH = 'search',           // 일반 검색/코드 검색
  FILE_READ = 'file_read',     // 단일/복수 파일 읽기
  FILE_LIST = 'file_list',     // 디렉터리/글롭 기반 파일 목록 조회
  FILE_SEARCH = 'file_search', // 파일 내용 검색 (정규식/키워드)
  REFACTOR = 'refactor'
}

export interface ActionParams {
  // ...
  // FILE_READ / FILE_LIST / FILE_SEARCH 파라미터
  paths?: string[];           // 읽거나 나열할 파일/디렉터리 경로 목록
  path?: string;              // 단일 경로 (파일 또는 디렉터리)
  includeGlobs?: string[];    // 포함 글롭 패턴
  excludeGlobs?: string[];    // 제외 글롭 패턴
  pattern?: string;           // 내용 검색용 정규식/키워드
  maxResults?: number;        // 검색/목록 결과 최대 개수
}

// src/core/action/ActionRegistry.ts
class ActionRegistry {
  private registerDefaultActions() {
    // FILE_READ 액션
    this.register({
      type: ActionType.FILE_READ,
      name: 'Read File',
      description: 'Read the content of one or more files',
      permissions: [Permission.READ_FILE],
      validation: [
        { field: 'path', type: 'required', message: 'File path is required' }
      ],
      handler: this.createPlaceholderHandler('file_read')
    });

    // FILE_LIST 액션
    this.register({
      type: ActionType.FILE_LIST,
      name: 'List Files',
      description: 'List files in a directory or by glob patterns',
      permissions: [Permission.READ_FILE],
      validation: [
        { field: 'path', type: 'required', message: 'Directory path is required' }
      ],
      handler: this.createPlaceholderHandler('file_list')
    });

    // FILE_SEARCH 액션
    this.register({
      type: ActionType.FILE_SEARCH,
      name: 'File Content Search',
      description: 'Search within files by keyword or regex',
      permissions: [Permission.READ_FILE],
      validation: [
        { field: 'pattern', type: 'required', message: 'Search pattern is required' }
      ],
      handler: this.createPlaceholderHandler('file_search')
    });
  }
}

// src/core/action/ActionValidator.ts
class ActionValidator {
  private validateBusinessRules(action: Action): ValidationError[] {
    const errors: ValidationError[] = [];

    if (action.type === ActionType.FILE_READ) {
      if (!action.params.path && (!action.params.paths || action.params.paths.length === 0)) {
        errors.push({
          field: 'path',
          message: 'At least one file path is required for file_read action',
          code: 'MISSING_FILE_PATH'
        });
      }
    }

    if (action.type === ActionType.FILE_LIST) {
      if (!action.params.path &&
          (!action.params.paths || action.params.paths.length === 0) &&
          (!action.params.includeGlobs || action.params.includeGlobs.length === 0)) {
        errors.push({
          field: 'path',
          message: 'Directory path or includeGlobs is required for file_list action',
          code: 'MISSING_LIST_TARGET'
        });
      }
    }

    if (action.type === ActionType.FILE_SEARCH) {
      if (!action.params.pattern && !action.params.query) {
        errors.push({
          field: 'pattern',
          message: 'Search pattern or query is required for file_search action',
          code: 'MISSING_SEARCH_PATTERN'
        });
      }
    }

    return errors;
  }
}
```

**기대 효과**:
- LLM이 “이 파일 내용 읽어줘 / 이 폴더 파일 목록 보여줘 / 이 키워드로 검색해줘” 같은 요청을 명시적인 Action으로 수행 가능
- 파일 탐색/검색 결과를 컨텍스트로 자연스럽게 연결하여 코드 생성/분석 정확도 향상
- 향후 Tool 기반 구조(브라우저 자동화, MCP 등) 도입 시 액션 타입 확장을 위한 기반 마련

**구현 난이도**: 중

---

### 12. 도구 실행 검증 강화 ⭐⭐⭐

**현재 상태**: 기본적인 검증만 지원

**구현 방식**:
- ToolValidator를 통한 사전 검증
- 필수 파라미터 검증
- 경로 유효성 검증

**추가 필요 기능**:
```typescript
// src/core/action/ToolValidator.ts (강화)
class ToolValidator {
  // 사전 검증
  async validateBeforeExecution(
    action: Action,
    context: ExecutionContext
  ): Promise<ValidationResult>
  
  // 경로 검증
  validatePath(path: string, operation: string): ValidationResult
  
  // 무시 규칙 검증 (.aidevignore)
  isIgnored(filePath: string): boolean
  
  // 위험한 작업 검증
  isDangerousOperation(action: Action): boolean
}
```

**기대 효과**:
- 잘못된 명령/파일 작업 사전 차단
- 보안 및 안정성 향상
- 사용자 실수 방지

**구현 난이도**: 낮음-중

---

### 13. 자동 승인 시스템 ⭐⭐

**현재 상태**: 모든 작업 수동 승인 필요

**구현 방식**:
- 설정 기반 자동 승인 규칙
- 도구별/경로별 자동 승인 설정
- 안전한 작업만 자동 승인

**추가 필요 기능**:
```typescript
// src/core/action/AutoApproveManager.ts
class AutoApproveManager {
  // 자동 승인 여부 확인
  shouldAutoApprove(
    action: Action,
    context: ExecutionContext
  ): boolean
  
  // 자동 승인 규칙 설정
  setAutoApproveRule(
    pattern: string,
    actionTypes: ActionType[],
    enabled: boolean
  ): void
  
  // 안전성 검증
  isSafeToAutoApprove(action: Action): boolean
}
```

**기대 효과**:
- 반복적인 작업 자동화
- 작업 효율성 향상
- 안전한 작업만 자동 승인으로 사용자 경험 개선

**구현 난이도**: 중

--

### 14. 후크(Hook) 시스템 ⭐⭐

**현재 상태**: 없음

**구현 방식**:
- 작업 전/후 후크 실행
- 사용자 정의 스크립트 실행
- 후크 결과에 따른 작업 제어

**추가 필요 기능**:
```typescript
// src/core/hooks/HookManager.ts
class HookManager {
  // 후크 등록
  registerHook(
    event: 'beforeAction' | 'afterAction',
    hook: HookFunction
  ): void
  
  // 후크 실행
  async executeHooks(
    event: string,
    context: HookContext
  ): Promise<HookResult>
  
  // 후크 발견 및 캐싱
  discoverHooks(workspaceRoot: string): Promise<Hook[]>
}
```

**기대 효과**:
- 사용자 정의 검증 로직 추가 가능
- 작업 전/후 커스텀 처리
- 프로젝트별 특화 기능 구현

**구현 난이도**: 중-높음

---

### 15. 멀티 파일 Diff 뷰 ⭐⭐⭐

**현재 상태**: 기본적인 파일 변경만 지원

**구현 방식**:
- 여러 파일 변경사항을 하나의 diff 뷰로 표시
- 파일별 변경사항 개별 편집 가능
- 변경사항 일괄 승인/거부

**추가 필요 기능**:
```typescript
// src/core/diff/MultiFileDiffView.ts
class MultiFileDiffView {
  // 멀티 파일 diff 생성
  createMultiFileDiff(
    changes: FileChange[]
  ): MultiFileDiff
  
  // diff 뷰 표시
  showDiffView(diff: MultiFileDiff): void
  
  // 변경사항 편집
  editChange(changeId: string, newContent: string): void
  
  // 변경사항 승인/거부
  approveChanges(changeIds: string[]): void
  rejectChanges(changeIds: string[]): void
}
```

**기대 효과**:
- 여러 파일 변경사항 한눈에 확인
- 선택적 변경사항 승인
- 사용자 제어 강화

**구현 난이도**: 중

---

## 사용자 경험 개선 기능

### 16. 작업 진행 상황 시각화 ⭐⭐

**현재 상태**: 기본적인 진행 상황만 표시

**구현 방식**:
- 단계별 진행 상황 표시
- 각 단계별 상세 정보
- 예상 시간 표시

**추가 필요 기능**:
```typescript
// src/core/ui/ProgressVisualizer.ts
class ProgressVisualizer {
  // 진행 상황 업데이트
  updateProgress(
    step: string,
    progress: number,
    details?: string
  ): void
  
  // 단계별 상세 정보 표시
  showStepDetails(step: string, details: any): void
  
  // 예상 시간 계산 및 표시
  estimateRemainingTime(): number
}
```

**기대 효과**:
- 사용자에게 명확한 진행 상황 제공
- 대기 시간 예측 가능
- 사용자 경험 개선

**구현 난이도**: 낮음

---

### 17. 토큰 및 비용 추적 ⭐⭐

**현재 상태**: 기본적인 토큰 계산만 지원

**구현 방식**:
- 작업 전체 토큰 사용량 추적
- 개별 요청별 토큰 및 비용 표시
- API 제공자별 비용 계산
- 누적 사용량 통계

**추가 필요 기능**:
```typescript
// src/core/analytics/TokenCostTracker.ts
class TokenCostTracker {
  // 토큰 사용량 기록
  recordTokenUsage(
    requestId: string,
    inputTokens: number,
    outputTokens: number,
    model: string
  ): void
  
  // 비용 계산
  calculateCost(
    tokens: number,
    model: string,
    provider: string
  ): number
  
  // 통계 조회
  getStatistics(
    period: 'day' | 'week' | 'month'
  ): UsageStatistics
}
```

**기대 효과**:
- API 사용 비용 투명성
- 비용 최적화 가능
- 사용량 모니터링

**구현 난이도**: 낮음-중

---

### 18. 컨텍스트 추가 기능 (@mentions) ⭐⭐⭐

**현재 상태**: 기본적인 파일 추가만 지원

**구현 방식**:
- `@file`: 파일 내용 추가
- `@folder`: 폴더 내 모든 파일 추가
- `@url`: URL 내용을 마크다운으로 변환하여 추가
- `@problems`: 워크스페이스 오류/경고 추가

**추가 필요 기능**:
```typescript
// src/core/mentions/MentionHandler.ts
class MentionHandler {
  // 파일 멘션 처리
  async handleFileMention(filePath: string): Promise<string>
  
  // 폴더 멘션 처리
  async handleFolderMention(folderPath: string): Promise<string>
  
  // URL 멘션 처리
  async handleUrlMention(url: string): Promise<string>
  
  // 문제 멘션 처리
  async handleProblemsMention(): Promise<string>
}
```

**기대 효과**:
- 컨텍스트 추가 편의성 향상
- 관련 정보 빠른 포함
- 작업 효율성 향상

**구현 난이도**: 중

---

### 19. 사용자 주도 대화 요약 (Condense) ⭐⭐

**현재 상태**: 없음

**구현 방식**:
- 사용자가 명시적으로 요청하는 대화 요약 기능 (`/condense`, `/smol`, `/compact`)
- LLM을 통한 상세 요약 생성
- 요약 미리보기 제공 후 사용자 승인
- 요약된 컨텍스트로 대화 히스토리 교체
- 작업 진행 상황(task_progress) 포함 가능

**추가 필요 기능**:
```typescript
// src/core/context/ConversationCondenser.ts
class ConversationCondenser {
  // 사용자 요청 기반 대화 요약
  async condenseConversation(
    messages: Message[],
    taskProgress?: TaskProgress,
    userInstructions?: string
  ): Promise<ConversationSummary>
  
  // 요약 미리보기 생성
  async createSummaryPreview(
    summary: ConversationSummary
  ): Promise<SummaryPreview>
  
  // 요약 적용 (히스토리 교체)
  async applyCondensedSummary(
    summary: ConversationSummary,
    taskId: string
  ): Promise<void>
  
  // 요약 검증
  validateSummaryCompleteness(
    summary: ConversationSummary,
    originalMessages: Message[]
  ): ValidationResult
}
```

**요약 포함 내용** :
1. Previous Conversation: 전체 대화의 고수준 요약
2. Current Work: 최근 작업 내용
3. Key Technical Concepts: 기술 개념, 코딩 규칙, 프레임워크
4. Relevant Files and Code: 관련 파일 및 코드 섹션
5. Problem Solving: 해결된 문제 및 진행 중인 트러블슈팅
6. Pending Tasks and Next Steps: 미완료 작업 및 다음 단계

**기대 효과**:
- 사용자가 필요할 때 대화 압축 가능
- 컨텍스트 윈도우 효율적 관리
- 장기 작업에서 핵심 정보 보존
- 작업 효율성 향상

**구현 난이도**: 중

---

### 20. 작업 히스토리 재구성 ⭐⭐

**현재 상태**: 기본적인 히스토리만 지원

**구현 방식**:
- 작업 히스토리 파일 기반 저장
- 히스토리 재구성 및 복원
- 작업 재개 기능

**추가 필요 기능**:
```typescript
// src/core/task/TaskHistoryReconstructor.ts
class TaskHistoryReconstructor {
  // 히스토리 저장
  async saveTaskHistory(taskId: string, history: TaskHistory): Promise<void>
  
  // 히스토리 로드
  async loadTaskHistory(taskId: string): Promise<TaskHistory>
  
  // 히스토리 재구성
  async reconstructHistory(taskId: string): Promise<TaskHistory>
  
  // 작업 재개
  async resumeTask(taskId: string): Promise<void>
}
```

**기대 효과**:
- 작업 중단 후 재개 가능
- 작업 히스토리 보존
- 장기 작업 관리

**구현 난이도**: 중

---

## 참고사항

- 모든 기능은 aidev-ide의 기존 매니저 아키텍처와 통합되어야 합니다.
- 기존 기능과의 호환성을 유지해야 합니다.
- 점진적 구현을 통해 단계적으로 안정성과 정확도를 향상시킬 수 있습니다.
- 사용자 피드백을 수집하여 우선순위를 조정할 수 있습니다.

---

## 추가 고려사항

### 보안 강화
- 파일 시스템 접근 권한 검증
- 위험한 명령어 실행 전 사용자 확인
- 민감한 정보 필터링

### 성능 최적화
- 대용량 파일 처리 최적화
- 컨텍스트 윈도우 관리 개선
- 캐싱 전략 도입

### 확장성
- 플러그인 시스템 고려
- 커스텀 도구 추가 기능
- API 확장성

### 파일 읽기 요청오면 현재 디렉토리에서 파일 찾아서 읽기
### 필터링 없이 bash 명령어 모두 처리 
### 새로운 프로젝트 만들때만 넣을 프롬프거
### 중복된 프롬프트 제거