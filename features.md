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

### 2. 파일 변경 추적 및 검증 시스템 ⭐⭐⭐

**현재 상태**: 기본적인 파일 생성/수정만 지원

**구현 방식**:
- 파일 변경 전후 상태 추적
- 파일 타임라인에 모든 변경사항 기록
- 변경사항 diff 뷰 제공
- 변경사항 직접 편집/되돌리기 가능

**추가 필요 기능**:
```typescript
// src/core/file/FileChangeTracker.ts
class FileChangeTracker {
  // 변경사항 추적 시작
  startTracking(filePath: string): void
  
  // 변경사항 기록
  recordChange(
    filePath: string,
    changeType: 'create' | 'modify' | 'delete',
    beforeContent?: string,
    afterContent?: string
  ): void
  
  // 변경 이력 조회
  getChangeHistory(filePath: string): FileChange[]
  
  // 특정 시점으로 되돌리기
  async revertToChange(changeId: string): Promise<void>
}
```

**기대 효과**:
- 파일 변경 이력 추적으로 디버깅 용이
- 실수한 변경사항 빠른 복구
- 변경사항 검토 및 승인 프로세스 개선

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

### 4. 잠금(Lock) 관리 시스템 ⭐⭐

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

### 5. 컨텍스트 히스토리 관리 및 자동 요약 ⭐⭐⭐

**현재 상태**: 기본적인 컨텍스트 관리만 지원

**구현 방식**:
- 메시지별 컨텍스트 변경사항 추적
- 타임스탬프 기반 컨텍스트 업데이트 기록
- 체크포인트 복원 시 컨텍스트도 함께 복원
- 컨텍스트 윈도우 관리 및 최적화
- **컨텍스트 크기 초과 시 자동 요약 및 히스토리 저장**
  - 토큰/문자 수 임계값 감지
  - LLM을 통한 대화 요약 생성 (`summarize_task`)
  - 요약된 컨텍스트로 히스토리 교체
  - 요약된 세션 재개 기능 (`continuationPrompt`)

**추가 필요 기능**:
```typescript
// src/core/context/ContextHistoryManager.ts
class ContextHistoryManager {
  // 컨텍스트 변경사항 기록
  recordContextUpdate(
    messageIndex: number,
    updateType: 'add' | 'remove' | 'modify',
    content: string,
    metadata?: any
  ): void
  
  // 특정 시점의 컨텍스트 복원
  restoreContextToCheckpoint(checkpointId: string): void
  
  // 컨텍스트 히스토리 조회
  getContextHistory(messageIndex: number): ContextUpdate[]
  
  // 컨텍스트 크기 확인
  checkContextSize(): { 
    currentSize: number, 
    maxSize: number, 
    isExceeded: boolean 
  }
  
  // 자동 요약 트리거
  async triggerAutoSummarization(
    conversationHistory: Message[],
    taskProgress?: TaskProgress
  ): Promise<ConversationSummary>
  
  // 요약된 세션 재개
  createContinuationPrompt(summary: ConversationSummary): string
}

// src/core/context/ConversationSummarizer.ts
class ConversationSummarizer {
  // 대화 요약 생성
  async summarizeConversation(
    messages: Message[],
    options: {
      includeTechnicalDetails: boolean,
      includeCodeSnippets: boolean,
      includeFileChanges: boolean
    }
  ): Promise<ConversationSummary>
  
  // 요약 형식 검증
  validateSummaryFormat(summary: ConversationSummary): boolean
  
  // 요약에서 필수 정보 추출
  extractEssentialInfo(summary: ConversationSummary): {
    primaryRequest: string,
    keyConcepts: string[],
    filesModified: string[],
    pendingTasks: string[],
    nextSteps: string[]
  }
}
```

**요약 프롬프트 구조**:
- Primary Request and Intent: 사용자의 명시적 요청 및 의도
- Key Technical Concepts: 기술 개념, 프레임워크, 패턴
- Files and Code Sections: 검토/수정/생성된 파일 및 코드 섹션
- Problem Solving: 해결된 문제 및 진행 중인 트러블슈팅
- Pending Tasks: 명시적으로 요청받은 미완료 작업
- Task Evolution: 작업의 진화 과정 (원본 → 수정 → 현재)
- Current Work: 요약 직전 작업 내용
- Next Step: 다음 단계 (사용자 요청과 직접 연관)
- Required Files: 다음 단계에 필요한 파일 목록

**기대 효과**:
- 컨텍스트 변경 이력 추적
- 체크포인트 복원 시 정확한 컨텍스트 상태 유지
- **장기 대화에서 컨텍스트 윈도우 초과 방지**
- **요약을 통한 핵심 정보 보존**
- **대규모 프로젝트에서도 연속 작업 가능**
- 디버깅 및 문제 해결 용이

**구현 난이도**: 중-높음

---

## 정확도 향상 기능

### 6. 도구 실행 검증 강화 ⭐⭐⭐

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

### 7. 자동 승인 시스템 ⭐⭐

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

---

### 8. 파일 컨텍스트 추적기 ⭐⭐⭐

**현재 상태**: 기본적인 파일 읽기만 지원

**구현 방식**:
- 파일 변경사항 추적
- 파일 크기 안정화 대기 (pollInterval)
- 컨텍스트에 포함된 파일 목록 관리
- 중복 파일 읽기 방지

**추가 필요 기능**:
```typescript
// src/core/context/FileContextTracker.ts
class FileContextTracker {
  // 파일 추적 시작
  trackFile(filePath: string): void
  
  // 파일 변경 감지
  onFileChanged(
    callback: (filePath: string, changeType: string) => void
  ): void
  
  // 추적 중인 파일 목록
  getTrackedFiles(): string[]
  
  // 파일 안정화 대기 (쓰기 완료 대기)
  async waitForFileStability(
    filePath: string,
    timeout?: number
  ): Promise<void>
}
```

**기대 효과**:
- 파일 변경사항 실시간 추적
- 불완전한 파일 읽기 방지
- 컨텍스트 정확도 향상

**구현 난이도**: 중

---

### 9. 후크(Hook) 시스템 ⭐⭐

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

### 10. 멀티 파일 Diff 뷰 ⭐⭐⭐

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

### 11. 작업 진행 상황 시각화 ⭐⭐

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

### 12. 토큰 및 비용 추적 ⭐⭐

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

### 13. 컨텍스트 추가 기능 (@mentions) ⭐⭐⭐

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

### 15. 사용자 주도 대화 요약 (Condense) ⭐⭐

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

### 14. 작업 히스토리 재구성 ⭐⭐

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

## 구현 우선순위

### Phase 1: 핵심 안정성 기능 (즉시 구현 권장)
1. **체크포인트/스냅샷 시스템** ⭐⭐⭐
2. **진단(Diagnostics) 모니터링** ⭐⭐⭐
3. **파일 변경 추적 및 검증** ⭐⭐⭐
4. **컨텍스트 히스토리 관리 및 자동 요약** ⭐⭐⭐

### Phase 2: 정확도 향상 (단기)
5. **도구 실행 검증 강화** ⭐⭐⭐
6. **파일 컨텍스트 추적기** ⭐⭐⭐
7. **멀티 파일 Diff 뷰** ⭐⭐⭐

### Phase 3: 사용자 경험 개선 (중기)
8. **컨텍스트 추가 기능 (@mentions)** ⭐⭐⭐
9. **사용자 주도 대화 요약 (Condense)** ⭐⭐
10. **토큰 및 비용 추적** ⭐⭐
11. **작업 진행 상황 시각화** ⭐⭐

### Phase 4: 고급 기능 (장기)
12. **자동 승인 시스템** ⭐⭐
13. **잠금(Lock) 관리 시스템** ⭐⭐
14. **후크(Hook) 시스템** ⭐⭐
15. **작업 히스토리 재구성** ⭐⭐

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

