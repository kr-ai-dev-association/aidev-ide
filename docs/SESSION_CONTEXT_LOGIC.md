# 세션, 대화 히스토리, 요약, 컨텍스트 로직 문서

이 문서는 aidev-ide의 세션 관리, 대화 히스토리, 자동 요약, 컨텍스트 관리 시스템을 설명합니다.

---

## 1. 전체 아키텍처 개요

```
┌─────────────────────────────────────────────────────────────────┐
│                         VSCode Extension                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────┐ │
│  │ SessionManager  │◄──►│ ConversationMgr │◄──►│  LLMManager │ │
│  │   (세션 저장)    │    │  (대화 진행)     │    │ (LLM 호출)  │ │
│  └────────┬────────┘    └────────┬────────┘    └─────────────┘ │
│           │                      │                              │
│           ▼                      ▼                              │
│  ┌─────────────────┐    ┌─────────────────┐                    │
│  │ ConversationCom │    │ ContextHistory  │                    │
│  │    pactor       │    │    Manager      │                    │
│  │  (대화 요약)     │    │  (변경 추적)    │                    │
│  └─────────────────┘    └─────────────────┘                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  globalState    │
                    │ (영속 저장소)    │
                    └─────────────────┘
```

---

## 2. 핵심 데이터 구조

### 2.1 Session (세션)
**파일**: `src/core/managers/state/types.ts`

```typescript
interface Session {
    id: string;                           // 세션 고유 ID (예: "session_1737123456789_abc123def")
    projectPath: string;                  // 프로젝트 경로
    createdAt: number;                    // 생성 시간 (timestamp)
    lastActiveAt: number;                 // 마지막 활성 시간
    conversationHistory: ConversationEntry[];  // 대화 히스토리 (최대 100개)
    compactedSummaries?: ConversationSummary[]; // 압축된 과거 대화 요약
    state: SessionState;                  // 세션 상태 (모델, 모드 등)
    totalTokensUsed?: number;             // 누적 토큰 사용량
}
```

### 2.2 ConversationEntry (대화 엔트리)
**파일**: `src/core/managers/state/types.ts`

```typescript
interface ConversationEntry {
    id: string;                    // 대화 고유 ID
    timestamp: number;             // 대화 시간

    // 전체 대화 내용
    userRequest: string;           // 사용자 요청 원문
    assistantResponse?: string;    // AI 응답 전문 (ASK 모드)

    // 구조화된 메타데이터 (CODE 모드)
    actions: ActionEntry[];        // 실행된 도구들
    filesCreated?: string[];       // 생성된 파일 목록
    filesModified?: string[];      // 수정된 파일 목록
    commandsExecuted?: string[];   // 실행된 명령어 목록

    // 상태 및 성능
    result: 'success' | 'error' | 'cancelled';
    tokensUsed?: number;           // 이 대화에서 사용된 토큰
    durationMs?: number;           // 실행 시간

    // 압축 참조
    compactedSummaryId?: string;   // 요약으로 대체되면 요약 ID 참조
}
```

### 2.3 ConversationSummary (대화 요약)
**파일**: `src/core/managers/state/types.ts`

```typescript
interface ConversationSummary {
    id: string;                    // 요약 ID
    createdAt: number;             // 요약 생성 시간
    messageRange: {
        startIndex: number;        // 요약된 메시지 시작 인덱스
        endIndex: number;          // 요약된 메시지 끝 인덱스
    };
    summary: string;               // LLM이 생성한 요약 텍스트
    filesModified: string[];       // 요약 범위 내 수정된 파일들
    filesCreated: string[];        // 요약 범위 내 생성된 파일들
    keyContext: string[];          // 다음 작업에 필요한 핵심 컨텍스트
    primaryRequest: string;        // 주요 요청
    currentWork: string;           // 현재 진행 중인 작업
}
```

---

## 3. 데이터 흐름

### 3.1 VSCode 시작 시 (세션 복원)

```
1. extension.ts activate()
   │
   ├─► SessionManager.getInstance(context)
   │   └─► loadSessions() - globalState에서 세션 로드
   │
   ├─► sessionManager.findSessionByProject(workspacePath)
   │   │
   │   ├─ 기존 세션 있음 → setCurrentSession(existingSession.id)
   │   │                   └─► currentSessionId 설정
   │   │
   │   └─ 기존 세션 없음 → createSession(workspacePath)
   │                       └─► 새 세션 생성 및 저장
   │
   └─► ChatViewProvider.resolveWebviewView()
       └─► restoreSessionOnStartup()
           │
           ├─► sessionManager.getCurrentSession()
           │
           ├─► restoreConversationHistory(conversationHistory)
           │   └─► 웹뷰에 대화 메시지 표시
           │
           └─► sessionManager.getCumulativeSessionStats()
               └─► 웹뷰에 토큰/컨텍스트 정보 전송
```

### 3.2 사용자 메시지 전송 시

```
1. 사용자가 채팅창에 메시지 입력
   │
   ▼
2. ConversationService.handleUserMessage()
   │
   ├─► ContextManager.collectContext()
   │   └─► 현재 파일, 선택 텍스트, 에러 등 수집
   │
   ├─► PromptBuilder.buildPrompt()
   │   └─► 시스템 프롬프트 + 히스토리 + 컨텍스트 조합
   │
   ├─► ConversationCompactor.needsCompaction()
   │   │
   │   ├─ 토큰 > 임계값(90%) → compact() 실행
   │   │   └─► LLM으로 오래된 대화 요약
   │   │
   │   └─ 토큰 < 임계값 → 원본 유지
   │
   ├─► LLMManager.sendMessage()
   │   └─► AI 응답 받기
   │
   └─► SessionManager.addConversationEntry()
       └─► 대화 엔트리 저장 + saveSessions()
```

### 3.3 대화 압축 (자동 요약)

```
토큰 사용량 > maxTokens * 0.9 (90%)
   │
   ▼
ConversationCompactor.compact()
   │
   ├─► 최근 12개 메시지 원본 유지 (keepRecentCount)
   │
   ├─► 나머지 오래된 메시지 → generateSummary()
   │   │
   │   ├─► LLM에 요약 프롬프트 전송
   │   │   "다음 대화를 요약해주세요..."
   │   │
   │   └─► 요약 형식:
   │       ### 사용자 요청
   │       ### 완료된 작업
   │       ### 핵심 컨텍스트
   │       ### 대기 중인 작업
   │
   └─► 결과: [요약] + [최근 12개 메시지]
       │
       └─► SessionManager.addCompactedSummary()
           └─► compactedSummaries에 저장
```

---

## 4. 주요 클래스 상세

### 4.1 SessionManager
**파일**: `src/core/managers/state/SessionManager.ts`

| 메서드 | 설명 | 호출 시점 |
|--------|------|----------|
| `createSession(projectPath)` | 새 세션 생성 | 워크스페이스 열 때 (기존 세션 없으면) |
| `getSession(sessionId?)` | 세션 조회 | 대화 처리 시 |
| `getCurrentSession()` | 현재 세션 조회 | 대화 저장/조회 시 |
| `setCurrentSession(sessionId)` | 현재 세션 설정 | 세션 전환 시 |
| `addConversationEntry(sessionId, entry)` | 대화 엔트리 추가 | 대화 완료 시 |
| `getConversationHistory(sessionId?, maxEntries?)` | 대화 히스토리 조회 | 컨텍스트 구성 시 |
| `clearConversationHistory(sessionId?)` | 대화 히스토리 초기화 | Clear History 버튼 클릭 시 |
| `getCumulativeSessionStats()` | 누적 통계 조회 | UI 표시용 |
| `addTokensUsed(tokens)` | 토큰 사용량 누적 | 대화 완료 시 |
| `getHistoryContext(maxEntries)` | 프롬프트용 컨텍스트 문자열 | 프롬프트 구성 시 |
| `compactSessionIfNeeded(maxTokens)` | 자동 압축 확인/실행 | 대화 루프 중 |
| `addCompactedSummary(sessionId, summary)` | 압축 요약 저장 | 압축 완료 시 |
| `trimSessionHistory(keepRecentCount)` | 히스토리 정리 (요약 없이) | 폴백 정리 시 |
| `cleanupOldSessions(olderThanMs)` | 오래된 세션 삭제 | 주기적 정리 |

**저장소**: `globalState.codepilot.sessions`

### 4.2 ConversationCompactor
**파일**: `src/core/managers/conversation/ConversationCompactor.ts`

| 메서드 | 설명 | 호출 시점 |
|--------|------|----------|
| `needsCompaction(userParts, systemPrompt, maxTokens)` | 압축 필요 여부 확인 | 메시지 전송 전 |
| `compact(userParts, systemPrompt, maxTokens)` | 자동 압축 실행 | 토큰 초과 시 |
| `forceCompact(userParts, maxTokens)` | 강제 압축 실행 | /compact 명령어 |
| `generateSummaryFromText(conversationText)` | 텍스트 요약 생성 | SessionManager 통합용 |
| `calculateTotalTokens(userParts, systemPrompt)` | 토큰 수 계산 | 압축 판단용 |
| `getLastSummary()` | 마지막 요약 조회 | 디버깅용 |
| `getStats()` | 압축 통계 조회 | 통계 표시용 |

**설정값**:
```typescript
{
    tokenThreshold: 0.9,        // 90%에서 압축 트리거
    keepRecentCount: 12,        // 최근 12개 메시지 원본 유지
    summarizationOptions: {
        includeTechnicalDetails: true,
        includeCodeSnippets: true,
        includeFileChanges: true,
        maxSummaryLength: 4000
    }
}
```

### 4.3 ContextHistoryManager
**파일**: `src/core/managers/context/ContextHistoryManager.ts`

| 메서드 | 설명 | 호출 시점 |
|--------|------|----------|
| `recordContextUpdate(...)` | 컨텍스트 변경 기록 | 파일/에러 변경 시 |
| `createCheckpoint(messageIndex, contextData)` | 체크포인트 생성 | 중요 상태 저장 시 |
| `restoreContextToCheckpoint(checkpointId)` | 체크포인트 복원 | 상태 롤백 시 |
| `checkContextSize(contextData, conversationHistory)` | 컨텍스트 크기 확인 | 토큰 관리 |
| `getConversationHistoryDeletedRange()` | 삭제된 대화 범위 조회 | 인덱스 관리 |
| `setConversationHistoryDeletedRange(range)` | 삭제된 대화 범위 설정 | 압축 후 |
| `getNextTruncationRange(...)` | 다음 삭제 범위 계산 | 정리 전략 |
| `exportHistoryToFile(filePath)` | 히스토리 파일 내보내기 | 백업용 |
| `importHistoryFromFile(filePath)` | 히스토리 파일 가져오기 | 복원용 |
| `createBackup()` | 백업 생성 | 안전 백업 |
| `restoreFromBackup(backupId)` | 백업 복원 | 복구 시 |

**저장소**: `globalState.contextHistory`

---

## 5. 요약 데이터 상세

### 5.1 요약 생성 프롬프트
```
당신은 대화 요약 전문가입니다. 코드 어시스턴트의 대화를 간결하게 요약해주세요.

## 요약 형식:

### 사용자 요청
- 사용자가 요청한 주요 작업들

### 완료된 작업
- 완료된 파일 생성/수정 목록
- 실행된 명령어

### 핵심 컨텍스트
- 다음 작업에 필요한 중요 정보
- 프로젝트 구조, 기술 스택, 설정 등

### 대기 중인 작업
- 아직 완료되지 않은 작업

## 지침:
1. 핵심 정보만 포함하세요 (토큰 절약이 목적)
2. 코드는 포함하지 마세요 (파일명만 기록)
3. 한국어로 작성하세요
4. 다음 작업에 필수적인 컨텍스트만 유지하세요
```

### 5.2 요약 결과 예시
```
### 사용자 요청
- 실시간 액션 트래커 UI 추가
- 열린 탭 컨텍스트 기능 추가
- 파일 부분 읽기 도구 개선

### 완료된 작업
- 생성: 없음
- 수정: WebviewBridge.ts, ToolExecutor.ts, types.ts, ContextManager.ts, ReadFileToolHandler.ts
- 명령: npm run compile

### 핵심 컨텍스트
- VSCode Extension 프로젝트 (TypeScript)
- 채팅 웹뷰 기반 UI
- LLM 도구 콜링 시스템 사용
- 버전: 8.8.0

### 대기 중인 작업
- README 업데이트 완료 필요
```

---

## 6. 컨텍스트 흐름

### 6.1 LLM에 전송되는 컨텍스트 구조

```
┌─────────────────────────────────────────────────────────┐
│                    System Prompt                         │
│  - 기본 규칙 및 지침                                      │
│  - 도구 명세 (XML 형식)                                   │
│  - 프로젝트 컨텍스트                                      │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│             [이전 대화 요약] (압축된 경우)                  │
│  - 사용자 요청 요약                                       │
│  - 완료된 작업 목록                                       │
│  - 핵심 컨텍스트                                          │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│              최근 대화 (원본 유지)                         │
│  [User]: 첫 번째 요청...                                  │
│  [Assistant]: 첫 번째 응답...                             │
│  [User]: 두 번째 요청...                                  │
│  ...                                                     │
│  [User]: 현재 요청                                        │
└─────────────────────────────────────────────────────────┘
```

### 6.2 컨텍스트 크기 관리

```
┌──────────────────────────────────────────────────────────┐
│                    토큰 임계값                            │
│                                                          │
│  0%          70%         90%        100%                │
│  ├───────────┼───────────┼──────────┤                   │
│  │   정상     │   주의     │  압축    │  초과            │
│  │           │  (노란색)  │  트리거  │                   │
│  └───────────┴───────────┴──────────┘                   │
│                                                          │
│  • 90% 초과: ConversationCompactor.compact() 자동 실행    │
│  • 압축 실패 시: fallbackCompaction() (슬라이딩 윈도우)    │
└──────────────────────────────────────────────────────────┘
```

---

## 7. 저장소 구조

### 7.1 globalState 키

| 키 | 내용 | 관리 클래스 |
|----|------|------------|
| `codepilot.sessions` | 모든 세션 데이터 + currentSessionId | SessionManager |
| `contextHistory` | 컨텍스트 업데이트, 체크포인트, 요약 | ContextHistoryManager |
| `contextHistory.backup.*` | 백업 데이터 | ContextHistoryManager |

### 7.2 세션 데이터 예시

```json
{
  "sessions": [
    {
      "id": "session_1737123456789_abc123def",
      "projectPath": "/Users/user/project",
      "createdAt": 1737123456789,
      "lastActiveAt": 1737123556789,
      "conversationHistory": [
        {
          "id": "conv_1737123460000_xyz",
          "timestamp": 1737123460000,
          "userRequest": "파일 읽기 도구에 줄 범위 지원 추가해줘",
          "assistantResponse": "ReadFileToolHandler에 startLine, endLine 매개변수를 추가했습니다...",
          "actions": [
            { "type": "modify", "file": "ReadFileToolHandler.ts", "result": "success" }
          ],
          "filesModified": ["src/core/tools/file/ReadFileToolHandler.ts"],
          "result": "success",
          "tokensUsed": 1500
        }
      ],
      "compactedSummaries": [
        {
          "id": "summary_1737120000000",
          "createdAt": 1737120000000,
          "messageRange": { "startIndex": 0, "endIndex": 15 },
          "summary": "### 사용자 요청\n- 프로젝트 초기 설정...",
          "filesModified": ["package.json", "tsconfig.json"],
          "filesCreated": ["src/index.ts"]
        }
      ],
      "state": {
        "currentModel": "gemini",
        "currentMode": "code"
      },
      "totalTokensUsed": 25000
    }
  ],
  "currentSessionId": "session_1737123456789_abc123def"
}
```

---

## 8. 트러블슈팅

### 8.1 세션이 복원되지 않음
1. `globalState`에 세션 데이터가 있는지 확인
2. `findSessionByProject(workspacePath)` 결과 확인
3. `restoreSessionOnStartup()` 로그 확인

### 8.2 대화 히스토리가 사라짐
1. `conversationHistory.length > 100` 체크 (최대 100개 제한)
2. `compactSessionIfNeeded()` 호출 여부 확인
3. `compactedSummaries`에 요약이 있는지 확인

### 8.3 토큰 사용량이 맞지 않음
1. `estimateTokens()` 함수 정확도 확인
2. `addTokensUsed()` 호출 위치 확인
3. `resetTokensUsed()` 호출 여부 확인

### 8.4 요약이 생성되지 않음
1. `ConversationCompactor.config.enabled` 확인 (기본: true)
2. `keepRecentCount` 설정 확인 (기본: 12)
3. LLM 연결 상태 확인

---

## 9. 관련 파일 목록

| 파일 | 역할 |
|------|------|
| `src/core/managers/state/SessionManager.ts` | 세션 관리 핵심 |
| `src/core/managers/state/types.ts` | 타입 정의 |
| `src/core/managers/conversation/ConversationCompactor.ts` | 대화 압축/요약 |
| `src/core/managers/conversation/ConversationManager.ts` | 대화 진행 관리 |
| `src/core/managers/context/ContextHistoryManager.ts` | 컨텍스트 변경 추적 |
| `src/core/managers/context/ContextManager.ts` | 컨텍스트 수집 |
| `src/webview/providers/ChatViewProvider.ts` | 웹뷰 UI 관리 |
| `src/extension.ts` | 확장 진입점 |

---

## 10. 버전 히스토리

| 버전 | 변경 내용 |
|------|----------|
| v8.7.5 | 세션 대화 히스토리 저장 기능 추가 |
| v8.7.6 | 통합된 히스토리 시스템, ConversationEntry 타입 확장, 자동 세션 압축 |
| v8.8.0 | VSCode 시작 시 세션 자동 복원 (대화 + 토큰/컨텍스트 정보) |
