# Codepilot Architecture (v9.7.2)

AI 기반 VSCode 확장 프로그램의 상세 아키텍처 문서

---

## 목차

1. [개요](#1-개요)
2. [디렉토리 구조](#2-디렉토리-구조)
3. [Core 매니저 시스템](#3-core-매니저-시스템)
4. [도구(Tool) 시스템](#4-도구tool-시스템)
5. [MCP 통합](#5-mcp-통합)
6. [호출 흐름](#6-호출-흐름)
7. [에러 처리](#7-에러-처리)
8. [Webview 통신](#8-webview-통신)
9. [설계 패턴](#9-설계-패턴)

---

## 1. 개요

Codepilot은 커스터마이징 가능한 LLM 백엔드를 지원하는 AI 개발 어시스턴트 VSCode 확장입니다.

### 핵심 특징
- **멀티 LLM 지원**: Gemini, Ollama, Banya API
- **FSM 기반 에이전트**: INVESTIGATION → PLANNING → EXECUTION → REVIEW → DONE
- **MCP 통합**: Model Context Protocol을 통한 도구 확장
- **자동 에러 수정**: 터미널 에러 감지 및 자동 복구
- **인라인 Diff**: 코드 변경사항 실시간 미리보기

---

## 2. 디렉토리 구조

```
src/
├── extension.ts              # 진입점 - 확장 활성화/비활성화
├── core/                     # 핵심 매니저 시스템
│   ├── managers/             # 도메인별 매니저
│   │   ├── action/           # 액션 실행 및 변환
│   │   ├── context/          # 컨텍스트 수집 및 프롬프트 빌딩
│   │   ├── conversation/     # 대화 오케스트레이션
│   │   ├── diff/             # Diff 뷰 및 인라인 편집
│   │   ├── error/            # 에러 감지 및 자동 수정
│   │   ├── execution/        # 명령 실행
│   │   ├── file/             # 파일 변경 추적
│   │   ├── hotload/          # HotLoad 프롬프트
│   │   ├── investigation/    # 에러 조사
│   │   ├── model/            # LLM 매니저
│   │   ├── project/          # 프로젝트 분석
│   │   ├── state/            # 상태 및 설정 관리
│   │   ├── task/             # 태스크 큐 관리
│   │   └── terminal/         # 터미널 세션 관리
│   ├── tools/                # 도구 핸들러
│   │   ├── file/             # 파일 도구 (create, read, update, delete)
│   │   ├── terminal/         # 터미널 도구 (run_command)
│   │   ├── git/              # Git 도구 (git_diff)
│   │   ├── ide/              # IDE 도구 (read_active_file)
│   │   ├── web/              # 웹 도구 (fetch_url)
│   │   └── mcp/              # MCP 도구 핸들러
│   ├── mcp/                  # Model Context Protocol
│   ├── config/               # 에이전트 설정
│   ├── webview/              # Webview 브리지
│   └── utils/                # Core 유틸리티
├── services/                 # 외부 서비스 통합
│   ├── llm/                  # LLM API (Gemini, Ollama, Banya)
│   ├── git/                  # Git 서비스
│   ├── notification/         # 알림 서비스
│   └── license/              # 라이선스 서비스
├── webview/                  # Webview 프로바이더
│   └── providers/            # Chat, Settings 프로바이더
└── utils/                    # 공통 유틸리티
```

---

## 3. Core 매니저 시스템

모든 매니저는 **싱글톤 패턴**을 따릅니다.

### 3.1 ConversationManager (대화 오케스트레이터)

```
ConversationManager
├── LLMManager          # LLM API 호출
├── ContextManager      # 컨텍스트 수집
├── PromptBuilder       # 프롬프트 생성
├── TaskManager         # 태스크 큐
├── ActionManager       # 액션 변환
├── ExecutionManager    # 명령 실행
├── TerminalManager     # 터미널 관리
├── ErrorManager        # 에러 처리
├── ToolExecutor        # 도구 실행
├── MCPManager          # MCP 통합
└── SessionManager      # 세션 관리
```

### 3.2 주요 매니저 역할

| 매니저 | 역할 |
|--------|------|
| **ActionManager** | LLM 응답 → 실행 가능한 액션 변환 |
| **ContextManager** | 프로젝트, 파일, 터미널 컨텍스트 수집 |
| **ExecutionManager** | OS별 명령 실행 (Darwin/Windows/Linux) |
| **TerminalManager** | VSCode 터미널 세션 관리 |
| **TaskManager** | 태스크 큐 및 플랜 관리 |
| **ErrorManager** | 에러 감지, 분류, 자동 수정 |
| **ProjectManager** | 프로젝트 타입/스택 감지 |
| **LLMManager** | LLM API 라우팅 및 스트리밍 |
| **StateManager** | 전역 상태 및 설정 저장 |
| **DiffManager** | 코드 Diff 및 인라인 편집 |
| **HotLoadManager** | 우선순위 프롬프트 관리 |

### 3.3 AgentStateManager (FSM)

```
[INVESTIGATION] ─→ [PLANNING] ─→ [EXECUTION] ─→ [REVIEW] ─→ [DONE]
       ↑                               │
       └───────────── (retry) ─────────┘
```

**Phase 규칙**:
- INVESTIGATION: 코드 분석, 파일 탐색만 허용
- PLANNING: 실행 계획 수립
- EXECUTION: 파일 수정, 명령 실행 허용
- REVIEW: 결과 검증, 테스트 실행
- DONE: 완료 보고

---

## 4. 도구(Tool) 시스템

### 4.1 도구 타입

```typescript
enum Tool {
  CREATE_FILE, UPDATE_FILE, REMOVE_FILE, READ_FILE, LIST_FILES,
  SEARCH_FILES, RUN_COMMAND, RIPGREP_SEARCH, EXPAND_AROUND_LINE,
  LIST_IMPORTS, STAT_FILE, GIT_DIFF, READ_ACTIVE_FILE, FETCH_URL
}
```

### 4.2 도구 핸들러 인터페이스

```typescript
interface IToolHandler {
  name: string;
  description: string;
  schema?: ToolSpec;
  canHandle(toolUse: ToolUse): boolean;
  execute(toolUse: ToolUse, context?: ToolContext): Promise<ToolResponse>;
}
```

### 4.3 도구 실행 파이프라인

```
LLM Response
    ↓
StreamingToolParser.parse()
    ↓
PreToolUseValidator.validate()  ← 보안 검증
    ↓
ToolExecutor.executeTools()
    ├─→ ToolRegistry.getHandler()
    └─→ handler.execute()
           ↓
      ToolResponse
```

### 4.4 PreToolUseValidator (보안)

차단되는 작업:
- 위험한 명령어: `rm -rf`, `sudo`, `chmod`
- 프로젝트 외부 경로 접근
- 민감한 파일 수정: `.env`, 인증서, 비밀키

---

## 5. MCP 통합

### 5.1 MCP 아키텍처

```
MCPManager
├── MCPClient[]           # 서버별 클라이언트
├── ToolRegistry 등록     # 동적 도구 등록
└── MCPToolHandler        # MCP 도구 실행
```

### 5.2 MCP 도구 등록 흐름

```
1. MCP 서버 연결
2. 서버에서 도구 목록 조회
3. 각 도구를 MCPToolHandler로 래핑
4. ToolRegistry에 등록 (이름 충돌 시 접두사 추가)
5. 시스템 프롬프트에 도구 스펙 포함
```

---

## 6. 호출 흐름

### 6.1 사용자 메시지 → 응답 흐름

```
Webview User Input
    ↓
ChatViewProvider.onDidReceiveMessage()
    ↓
ConversationService.handleUserMessage()
    ↓
ConversationManager.handleUserMessageAndRespond()
    │
    ├── [1] 의도 감지
    │   └── IntentDetector.detectIntent()
    │
    ├── [2] 컨텍스트 수집
    │   └── ContextManager.collectContext()
    │       ├── 프로젝트 파일 스캔
    │       ├── 터미널 히스토리
    │       └── 활성 파일 내용
    │
    ├── [3] 프롬프트 빌드
    │   ├── HotLoad 프롬프트 로드
    │   ├── MCP 커스텀 프롬프트
    │   └── PromptBuilder.buildPrompt()
    │
    └── [4] 에이전트 루프 실행
        └── executeAgentLoop()
```

### 6.2 에이전트 루프 상세

```
executeAgentLoop(systemPrompt, userParts, options)
    │
    ├── 초기화
    │   ├── maxTurns = 10
    │   ├── LoopState (무한루프 감지)
    │   └── ToolExecutor 생성
    │
    └── 메인 루프 (turnCount < maxTurns)
        │
        ├── [TURN N]
        │   ├── Phase 프롬프트 생성
        │   │
        │   ├── LLM 스트리밍 호출
        │   │   └── LLMManager.sendMessageWithSystemPromptStreaming()
        │   │
        │   ├── 도구 호출 파싱
        │   │   └── StreamingToolParser.parse()
        │   │
        │   ├── PreToolUse 검증
        │   │
        │   ├── 도구 실행
        │   │   └── ToolExecutor.executeTools()
        │   │       ├── 각 도구 순차 실행
        │   │       ├── 진행 상태 Webview 전송
        │   │       └── 결과 수집
        │   │
        │   ├── 완료 판정
        │   │   └── CompletionJudge.judgeCompletion()
        │   │
        │   ├── Phase 전환
        │   │   ├── INVESTIGATION → PLANNING
        │   │   ├── PLANNING → EXECUTION
        │   │   ├── EXECUTION → REVIEW
        │   │   └── REVIEW → DONE
        │   │
        │   ├── 무한루프 감지
        │   │   └── updateAndCheckLoopState()
        │   │
        │   └── 세션 저장
        │       └── SessionManager.addConversationEntry()
        │
        └── [TURN N+1] 반복
```

### 6.3 도구 실행 상세

```
ToolExecutor.executeTools(toolCalls)
    │
    ├── 각 도구에 대해:
    │   ├── ToolRegistry.getHandler(toolName)
    │   │
    │   ├── handler.execute(toolUse, context)
    │   │   │
    │   │   ├── [File Tools]
    │   │   │   ├── CreateFileToolHandler
    │   │   │   ├── ReadFileToolHandler
    │   │   │   ├── UpdateFileToolHandler
    │   │   │   └── RemoveFileToolHandler
    │   │   │
    │   │   ├── [Terminal Tools]
    │   │   │   └── RunCommandToolHandler
    │   │   │       ├── 프로세스 생성
    │   │   │       ├── stdout/stderr 캡처
    │   │   │       └── 타임아웃 처리
    │   │   │
    │   │   ├── [Git Tools]
    │   │   │   └── GitDiffToolHandler
    │   │   │
    │   │   ├── [Web Tools]
    │   │   │   └── FetchUrlToolHandler
    │   │   │
    │   │   └── [MCP Tools]
    │   │       └── MCPToolHandler → MCPClient
    │   │
    │   ├── ToolResponse 수집
    │   └── 메트릭 기록
    │
    └── ToolExecutionCoordinator.createToolResultSummary()
```

---

## 7. 에러 처리

### 7.1 에러 분류

```typescript
enum ErrorCategory {
  SYNTAX, TYPE, RUNTIME, NETWORK,
  FILE_SYSTEM, PERMISSION, DEPENDENCY,
  CONFIGURATION, UNKNOWN
}

enum ErrorSeverity {
  LOW, MEDIUM, HIGH, CRITICAL
}
```

### 7.2 자동 에러 수정 흐름

```
터미널 출력
    ↓
ErrorDetector.detect()
    ↓
ErrorParser.parse()
    ↓
ErrorManager.handleError()
    │
    ├── [자동 수정 활성화 시]
    │   └── AutoErrorHandler
    │       ├── 에러 컨텍스트 수집
    │       ├── LLM에 수정 요청
    │       └── 수정된 명령 실행
    │
    └── [수동 처리]
        └── 사용자에게 에러 표시
```

### 7.3 FSM 복구 전략

```
무한 루프 감지 시:
├── Step 1: 현재 플랜 항목 스킵
├── Step 2: Phase 강제 전환
└── Step 3: 복구 불가 시 루프 종료

출력 형식 위반 시:
├── 형식 수정 프롬프트 전송
└── 재요청
```

---

## 8. Webview 통신

### 8.1 WebviewBridge API

```typescript
class WebviewBridge {
  // 메시지 전송
  static receiveMessage(webview, sender, text)

  // 스트리밍
  static startStreamingMessage(webview)
  static streamMessageChunk(webview, chunk)
  static endStreamingMessage(webview)

  // 상태 업데이트
  static updateProcessingStatus(webview, step, status)
  static updateTaskQueue(webview, tasks)
  static updateContextInfo(webview, info)

  // 로딩
  static showLoading(webview)
  static hideLoading(webview)

  // 도구 결과
  static receiveToolUse(webview, toolName, params)
  static applyCode(webview, filePath, content)
}
```

### 8.2 메시지 흐름

```
Extension → Webview:
├── receiveMessage (채팅 메시지)
├── streamMessageChunk (실시간 스트리밍)
├── updateProcessingStatus (진행 상태)
├── updatePendingChanges (파일 변경)
└── applyCode (코드 적용)

Webview → Extension:
├── sendMessage (사용자 입력)
├── applyCode (코드 승인)
├── cancelApplyCode (코드 취소)
├── gitCommand (Git 명령)
└── settingsCommand (설정 변경)
```

---

## 9. 설계 패턴

### 9.1 사용된 패턴

| 패턴 | 적용 |
|------|------|
| **Singleton** | 모든 매니저 (ActionManager, TerminalManager 등) |
| **Adapter** | OS 어댑터 (Darwin, Windows, Linux), LLM 어댑터 |
| **Factory** | OSAdapterFactory, Tool 핸들러 생성 |
| **Observer** | VSCode 이벤트 구독, Webview 메시지 |
| **Strategy** | IConversationHandler, 다양한 프롬프트 빌더 |
| **Decorator** | DiffCodeLens, 코드 데코레이션 |
| **Command** | 도구 실행, 액션 처리 |

### 9.2 의존성 주입

```typescript
// ConversationManager 초기화 시
ConversationManager.getInstance().initialize({
  contextManager,
  llmManager,
  actionManager,
  executionManager,
  terminalManager,
  taskManager,
  errorManager,
  projectManager
});
```

### 9.3 확장 포인트

1. **MCP 서버**: 새 도구 추가
2. **IToolHandler**: 커스텀 도구 구현
3. **ILLMAdapter**: 새 LLM 백엔드
4. **ICodeParserAdapter**: 언어별 파서
5. **IOperatingSystemAdapter**: OS별 어댑터

---

## 핵심 파일 참조

| 파일 | 역할 |
|------|------|
| [extension.ts](src/extension.ts) | 확장 진입점 |
| [ConversationManager.ts](src/core/managers/conversation/ConversationManager.ts) | 에이전트 루프 |
| [LLMManager.ts](src/core/managers/model/LLMManager.ts) | LLM API 관리 |
| [ToolRegistry.ts](src/core/tools/ToolRegistry.ts) | 도구 등록 |
| [ToolExecutor.ts](src/core/tools/ToolExecutor.ts) | 도구 실행 |
| [PreToolUseValidator.ts](src/core/tools/PreToolUseValidator.ts) | 보안 검증 |
| [WebviewBridge.ts](src/core/webview/WebviewBridge.ts) | Webview 통신 |
| [MCPManager.ts](src/core/mcp/MCPManager.ts) | MCP 통합 |
| [ErrorManager.ts](src/core/managers/error/ErrorManager.ts) | 에러 처리 |
| [AgentStateManager.ts](src/core/managers/conversation/AgentStateManager.ts) | FSM 관리 |

---

## 버전 히스토리

- **v9.7.2**: 순환 의존성 제거, any 타입 제거, 로딩 상태 피드백
- **v9.6.0**: FSM 복구 전략, 에러 해결 매핑 시스템
- **v9.4.0**: 자동 파일 삭제 설정, MCP 슬래시 명령어
- **v9.3.2**: PreToolUse 보안 검증, HotLoad 확장
