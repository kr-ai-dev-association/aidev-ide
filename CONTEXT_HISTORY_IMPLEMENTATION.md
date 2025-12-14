# 컨텍스트 히스토리 관리 및 자동 요약 구현 계획

## 현재 상태 분석

### 기존 대화 히스토리 관리 방식

1. **SessionManager** (`src/core/state/SessionManager.ts`)
   - 세션별 대화 기록: `conversationHistory: ConversationEntry[]` (최대 100개)
   - 탭별 대화 히스토리: `codeTabHistory`, `askTabHistory` (최대 5개)
   - 저장 위치: `vscode.ExtensionContext.globalState`
   - 형식: `{ userQuery: string, aiResponse?: string, timestamp: number }[]`

2. **ConversationEntry 타입** (`src/core/state/types.ts`)
   ```typescript
   interface ConversationEntry {
     id: string;
     timestamp: number;
     type: 'user' | 'assistant' | 'system';
     content: string;
     model?: string;
     tokensUsed?: number;
     metadata?: Record<string, any>;
   }
   ```

3. **현재 사용 방식**
   - `ConversationManager`에서 `getTabHistoryContext()`로 최근 5개 대화를 문자열로 변환
   - 단순히 프롬프트에 포함하여 사용
   - 컨텍스트 크기 제한 없음
   - 요약 기능 없음

### 문제점
- 대화가 길어질수록 컨텍스트 윈도우 초과 가능
- 토큰/문자 수 추적 없음
- 컨텍스트 변경사항 추적 없음
- 체크포인트 복원 기능 없음
- 자동 요약 기능 없음

---

## Cline의 대화 히스토리 관리 방식 (참고)

### 1. MessageStateHandler (`src/core/task/message-state.ts`)

**이중 히스토리 구조**:
- `apiConversationHistory: Anthropic.MessageParam[]` - API에 전송할 실제 대화 히스토리
- `clineMessages: ClineMessage[]` - UI에 표시할 메시지들

**주요 특징**:
- **Mutex 기반 동시성 제어**: `withStateLock()`으로 모든 상태 변경 보호
- **인덱스 추적**: `conversationHistoryIndex`로 API 히스토리와 UI 메시지 연결
- **삭제 범위 추적**: `conversationHistoryDeletedRange`로 삭제된 대화 범위 저장
- **디스크 저장**: `saveApiConversationHistory()`, `saveClineMessages()`로 task 디렉토리에 저장

**ClineMessage 구조**:
```typescript
interface ClineMessage {
  conversationHistoryIndex?: number  // API 히스토리 인덱스
  conversationHistoryDeletedRange?: [number, number]  // 삭제된 범위
  // ... 기타 필드
}
```

### 2. ContextManager (`src/core/context/context-management/ContextManager.ts`)

**컨텍스트 변경사항 추적**:
- `contextHistoryUpdates: Map<number, [number, Map<number, ContextUpdate[]>]>`
- 형식: `{ messageIndex => [EditType, { blockIndex => [[timestamp, updateType, update, metadata], ...] }] }`
- 타임스탬프 기반 정렬로 체크포인트 복원 지원

**컨텍스트 압축**:
- `shouldCompactContextWindow()`: 토큰 사용량 기반 압축 필요 여부 판단
- `getNextTruncationRange()`: 삭제할 메시지 범위 계산
- `getAndAlterTruncatedMessages()`: 삭제된 메시지에 "[NOTE] Some previous conversation history..." 추가

**압축 전략**:
- `keep: "none" | "lastTwo" | "half" | "quarter"`
- 첫 번째 user-assistant 페어는 항상 유지
- 토큰 사용량이 `maxAllowedSize`에 근접하면 자동 압축

### 3. SummarizeTaskHandler (`src/core/task/tools/handlers/SummarizeTaskHandler.ts`)

**요약 툴 실행**:
- LLM이 `summarize_task` 툴을 호출하여 요약 생성
- 요약 형식: `continuationPrompt()`로 포맷팅
- "Required Files" 섹션에서 파일 자동 읽기 (최대 8개, 100K 문자)

**요약 후 처리**:
- `conversationHistoryDeletedRange` 업데이트
- 컨텍스트 히스토리 초기화
- 요약을 continuation prompt로 변환하여 다음 대화에 포함

### 4. TaskState (`src/core/task/TaskState.ts`)

**상태 관리**:
- `conversationHistoryDeletedRange?: [number, number]` - 삭제된 대화 범위
- `currentlySummarizing: boolean` - 요약 진행 중 플래그

### 5. 주요 차이점 (Cline vs Aidev-ide)

| 항목 | Cline | Aidev-ide (현재) |
|------|-------|------------------|
| 히스토리 저장 | 디스크 (task 디렉토리) | VS Code globalState |
| 동시성 제어 | Mutex | 없음 |
| 컨텍스트 추적 | 상세한 변경사항 추적 | 없음 |
| 요약 방식 | LLM 툴 호출 | 없음 |
| 압축 전략 | 토큰 기반 자동 압축 | 없음 |
| 삭제 범위 추적 | `conversationHistoryDeletedRange` | 없음 |

### 6. 참고할 만한 Cline 패턴

1. **이중 히스토리 구조**: API 히스토리와 UI 메시지 분리
2. **인덱스 추적**: 메시지 간 관계 유지
3. **Mutex 보호**: 동시성 문제 방지
4. **디스크 저장**: 메모리 부담 감소
5. **자동 압축**: 토큰 사용량 기반 자동 처리
6. **요약 툴**: LLM이 필요시 요약 생성

### 7. Cline의 요약 프롬프트 구조

**summarizeTask 프롬프트** (`src/core/prompts/contextManagement.ts`):
- 10개 섹션으로 구성된 상세한 요약 형식
- `<thinking>` 태그로 분석 과정 포함
- "Required Files" 섹션에서 파일 자동 읽기 지원

**continuationPrompt**:
```typescript
export const continuationPrompt = (summaryText: string) => `
This session is being continued from a previous conversation that ran out of context. 
The conversation is summarized below: ${summaryText}.
Please continue the conversation from where we left it off...
`
```

**요약 섹션 구조** (Cline):
1. Primary Request and Intent
2. Key Technical Concepts
3. Files and Code Sections (파일별 상세 정보 포함)
4. Problem Solving
5. Pending Tasks
6. Task Evolution (Original Task → Modifications → Current Active Task)
7. Current Work
8. Next Step (직접적인 다음 단계)
9. Required Files (상대 경로, 최소한의 파일만)
10. Task Progress (선택적)

### 8. Aidev-ide에 적용할 Cline 패턴

**적용 가능한 패턴**:
1. ✅ **이중 히스토리**: `apiConversationHistory`와 `clineMessages` 분리 (현재는 단일 히스토리)
2. ✅ **인덱스 추적**: 메시지 간 관계 유지
3. ✅ **Mutex 보호**: 동시성 문제 방지 (VS Code extension에서는 필요시에만)
4. ⚠️ **디스크 저장**: VS Code globalState 사용 (디스크 저장은 선택적)
5. ✅ **자동 압축**: 토큰 사용량 기반 자동 처리
6. ✅ **요약 툴**: LLM이 필요시 요약 생성 (또는 자동 트리거)

**차이점 고려사항**:
- Cline은 task 기반, Aidev-ide는 세션 기반
- Cline은 디스크 저장, Aidev-ide는 VS Code state 사용
- Cline은 툴 호출 방식, Aidev-ide는 자동 트리거 가능

---

## 구현 단계

### Phase 1: 타입 정의 및 기본 구조 (기초 작업)

#### 1.1 타입 정의 파일 생성
**파일**: `src/core/context/types/contextHistory.ts`

**내용**:
- `ContextUpdateType`: 'add' | 'remove' | 'modify'
- `ContextUpdate`: 컨텍스트 업데이트 정보
- `ContextCheckpoint`: 컨텍스트 체크포인트
- `ContextSizeInfo`: 컨텍스트 크기 정보
- `SummarizationOptions`: 요약 옵션
- `ConversationSummary`: 대화 요약 구조
- `ContinuationPrompt`: 요약된 세션 재개 프롬프트
- `TaskProgress`: 작업 진행 상태

**예상 작업 시간**: 30분

---

#### 1.2 ContextHistoryManager 기본 구조
**파일**: `src/core/context/ContextHistoryManager.ts`

**기본 메서드**:
- `getInstance()`: 싱글톤 패턴
- `recordContextUpdate()`: 컨텍스트 업데이트 기록
- `getContextHistory()`: 히스토리 조회
- `checkContextSize()`: 크기 확인
- `saveHistory()` / `loadHistory()`: 저장/로드

**저장 위치**: `vscode.ExtensionContext.globalState` (`contextHistory` 키)

**예상 작업 시간**: 1시간

---

### Phase 2: 컨텍스트 추적 기능 (핵심 기능)

#### 2.1 컨텍스트 업데이트 기록
**위치**: `ContextHistoryManager.recordContextUpdate()`

**기능**:
- 메시지 인덱스별 컨텍스트 변경사항 추적
- 타임스탬프 기반 정렬
- 메타데이터 저장 (파일 경로, 컨텍스트 타입 등)

**통합 위치**: `ConversationManager.handleUserMessageAndRespond()`
- 컨텍스트 수집 후 `recordContextUpdate()` 호출

**예상 작업 시간**: 1시간

---

#### 2.2 컨텍스트 크기 모니터링
**위치**: `ContextHistoryManager.checkContextSize()`

**기능**:
- 현재 컨텍스트 크기 계산 (문자 수, 토큰 수)
- 임계값 비교 (기본: 100K 문자, 50K 토큰)
- 초과 여부 반환

**통합 위치**: `ConversationManager`에서 컨텍스트 수집 후 호출

**예상 작업 시간**: 30분

---

#### 2.3 체크포인트 관리
**위치**: `ContextHistoryManager.createCheckpoint()`, `restoreContextToCheckpoint()`

**기능**:
- 특정 시점의 컨텍스트 스냅샷 저장
- 체크포인트 ID로 복원
- 체크포인트별 업데이트 이력 저장

**예상 작업 시간**: 1시간

---

### Phase 3: 요약 기능 구현 (핵심 기능)

#### 3.1 요약 프롬프트 생성
**파일**: `src/core/context/prompts/task/summarize.ts`

**기능**:
- 요약 프롬프트 템플릿 생성
- 요약 옵션에 따른 프롬프트 커스터마이징
- 작업 진행 상태 포함

**프롬프트 구조**:
- Primary Request and Intent
- Key Technical Concepts
- Files and Code Sections
- Problem Solving
- Pending Tasks
- Task Evolution
- Current Work
- Next Step
- Required Files

**예상 작업 시간**: 1시간

---

#### 3.2 ConversationSummarizer 구현
**파일**: `src/core/context/ConversationSummarizer.ts`

**기능**:
- `summarizeConversation()`: LLM을 통한 대화 요약 생성
- `validateSummaryFormat()`: 요약 형식 검증
- `extractEssentialInfo()`: 필수 정보 추출
- `parseSummary()`: 요약 텍스트 파싱

**LLM 호출**:
- `LLMApiClient.sendMessageWithSystemPrompt()` 사용
- 시스템 프롬프트: `getSummarizationPrompt()`
- 사용자 메시지: 대화 히스토리 텍스트

**예상 작업 시간**: 2시간

---

#### 3.3 자동 요약 트리거
**위치**: `ContextHistoryManager.triggerAutoSummarization()`

**기능**:
- 컨텍스트 크기 초과 시 자동 요약 트리거
- `ConversationSummarizer`를 통한 요약 생성
- 요약된 히스토리로 교체

**통합 위치**: `ConversationManager`에서 컨텍스트 크기 확인 후 호출

**예상 작업 시간**: 1시간

---

#### 3.4 요약된 세션 재개
**위치**: `ContextHistoryManager.createContinuationPrompt()`

**기능**:
- 요약 정보를 프롬프트 형식으로 변환
- 다음 대화에서 요약을 컨텍스트로 포함

**통합 위치**: `ConversationManager`에서 히스토리 컨텍스트 생성 시

**예상 작업 시간**: 30분

---

### Phase 4: ConversationManager 통합 (통합 작업)

#### 4.1 ContextHistoryManager 초기화
**위치**: `src/extension.ts`

**작업**:
- `ContextHistoryManager.getInstance(context)` 호출
- `ConversationManager.setContextHistoryManager()` 설정

**예상 작업 시간**: 15분

---

#### 4.2 컨텍스트 수집 후 기록
**위치**: `ConversationManager.handleUserMessageAndRespond()`

**작업**:
- 컨텍스트 수집 후 `recordContextUpdate()` 호출
- 파일 컨텍스트, 선택 컨텍스트 등 각각 기록

**예상 작업 시간**: 30분

---

#### 4.3 컨텍스트 크기 확인 및 자동 요약
**위치**: `ConversationManager.handleUserMessageAndRespond()`

**작업**:
- `checkContextSize()` 호출
- 초과 시 `triggerAutoSummarization()` 호출
- 요약 생성 후 `createContinuationPrompt()`로 히스토리 교체

**예상 작업 시간**: 1시간

---

#### 4.4 ConversationSummarizer 설정
**위치**: `src/extension.ts`, `ConversationManager`

**작업**:
- `ConversationSummarizer` 인스턴스 생성
- `setLLMClient()` 설정
- `ConversationManager.setConversationSummarizer()` 설정

**예상 작업 시간**: 15분

---

### Phase 5: 테스트 및 최적화 (마무리)

#### 5.1 단위 테스트
**작업**:
- `ContextHistoryManager` 메서드 테스트
- `ConversationSummarizer` 파싱 테스트
- 요약 형식 검증 테스트

**예상 작업 시간**: 2시간

---

#### 5.2 통합 테스트
**작업**:
- 긴 대화 시나리오 테스트
- 컨텍스트 크기 초과 시나리오 테스트
- 요약 후 세션 재개 테스트

**예상 작업 시간**: 2시간

---

#### 5.3 성능 최적화
**작업**:
- 요약 생성 비용 최적화 (필요시만 트리거)
- 히스토리 저장 크기 최적화
- 메모리 사용량 모니터링

**예상 작업 시간**: 1시간

---

## 전체 예상 작업 시간

- **Phase 1**: 1.5시간
- **Phase 2**: 2.5시간
- **Phase 3**: 4.5시간
- **Phase 4**: 2시간
- **Phase 5**: 5시간

**총 예상 시간**: 약 15.5시간

---

## 구현 우선순위

1. **High Priority** (필수 기능)
   - Phase 1: 타입 정의 및 기본 구조
   - Phase 2.2: 컨텍스트 크기 모니터링
   - Phase 3.2: ConversationSummarizer 구현
   - Phase 3.3: 자동 요약 트리거
   - Phase 4: ConversationManager 통합

2. **Medium Priority** (중요 기능)
   - Phase 2.1: 컨텍스트 업데이트 기록
   - Phase 3.4: 요약된 세션 재개

3. **Low Priority** (향후 개선)
   - Phase 2.3: 체크포인트 관리
   - Phase 5: 테스트 및 최적화

---

## 다음 단계

1. Phase 1부터 시작하여 단계별로 구현
2. 각 Phase 완료 후 테스트
3. 문제 발견 시 즉시 수정
4. 다음 Phase로 진행

**시작**: Phase 1.1 타입 정의 파일 생성부터 진행

