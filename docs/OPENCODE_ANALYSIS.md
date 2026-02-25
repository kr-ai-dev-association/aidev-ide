# OpenCode 상세 분석 및 Codepilot 비교

> 분석일: 2026-02-07
> 대상: OpenCode, oh-my-opencode
> 비교: Codepilot (aidev-ide)

---

## 목차

1. [OpenCode 아키텍처](#1-opencode-아키텍처)
2. [oh-my-opencode 분석](#2-oh-my-opencode-분석)
3. [도구 시스템 비교](#3-도구-시스템-비교)
4. [Codepilot과 차별점](#4-codepilot과-차별점)
5. [Codepilot에 추가해야 할 기능](#5-codepilot에-추가해야-할-기능)
6. [Codepilot 잘못된 로직](#6-codepilot-잘못된-로직)
7. [개선 우선순위](#7-개선-우선순위)

---

## 1. OpenCode 아키텍처

> 출처: [OpenCode GitHub](https://github.com/opencode-ai/opencode), [OpenCode Internals Deep Dive](https://cefboud.com/posts/coding-agents-internals-opencode-deepdive/)

### 1.1 시스템 구조

```
┌─────────────────────────────────────────────────────────┐
│                    OpenCode Architecture                 │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────┐    HTTP/SSE     ┌──────────────────────┐  │
│  │  Go TUI  │ ◄─────────────► │  Bun/Hono Server     │  │
│  │ (Bubble  │                 │                      │  │
│  │   Tea)   │                 │  ┌────────────────┐  │  │
│  └──────────┘                 │  │  Session Mgr   │  │  │
│                               │  │  ┌──────────┐  │  │  │
│  ┌──────────┐                 │  │  │ AI SDK   │  │  │  │
│  │ Web App  │ ◄──────────────►│  │  │ (LLM)    │  │  │  │
│  └──────────┘                 │  │  └──────────┘  │  │  │
│                               │  │  ┌──────────┐  │  │  │
│  ┌──────────┐                 │  │  │  Tools   │  │  │  │
│  │ Mobile   │ ◄──────────────►│  │  └──────────┘  │  │  │
│  └──────────┘                 │  │  ┌──────────┐  │  │  │
│                               │  │  │   LSP    │  │  │  │
│                               │  │  └──────────┘  │  │  │
│                               │  │  ┌──────────┐  │  │  │
│                               │  │  │   MCP    │  │  │  │
│                               │  └──┴──────────┴──┘  │  │
│                               └──────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### 1.2 핵심 특징

| 구성 요소 | 기술 | 설명 |
|----------|------|------|
| **백엔드** | Bun + Hono | JS 런타임, HTTP 서버 |
| **프론트엔드** | Go + Bubble Tea | 터미널 TUI |
| **LLM 통합** | Vercel AI SDK | 스트리밍, 도구 호출 표준화 |
| **저장소** | SQLite | 세션, 히스토리 영속화 |
| **코드 분석** | LSP | 언어별 서버 통합 |
| **확장성** | MCP | 외부 도구 프로토콜 |

### 1.3 에이전트 루프

```typescript
// OpenCode의 streamText 기반 에이전트 루프
const result = await streamText({
  model,
  messages: [systemPrompt, ...history],
  tools: { ...builtinTools, ...mcpTools },
  stopWhen: async ({ steps }) => steps.length >= 1000,
  onToolCall: async (call) => processor.process(call),
  onToolResult: async (result) => processor.process(result)
});
```

**특징**:
- `streamText`로 실시간 스트리밍
- 도구 호출/결과를 이벤트로 처리
- 최대 1000 스텝까지 자율 실행
- Event Bus로 TUI에 실시간 전달

### 1.4 컨텍스트 관리

```
토큰 제한 = (model.context_limit - output_limit) * 0.9

초과 시:
1. 별도 LLM 호출로 요약 생성
2. 이전 히스토리를 요약으로 교체
3. 필수 정보 보존
```

**스냅샷 메커니즘**:
- `git write-tree` / `git read-tree` 사용
- 각 스텝 시작 시 상태 캡처
- 도구 실패 시 롤백 가능
- 커밋 히스토리 건드리지 않음

### 1.5 도구 정의 패턴

```typescript
// Zod 스키마 기반 도구 정의
Tool.define("read", {
  description: "Read file contents from your codebase",
  parameters: z.object({
    path: z.string().describe("File path to read"),
    offset: z.number().optional().describe("Start line"),
    limit: z.number().optional().describe("Number of lines")
  }),
  async execute(params, ctx) {
    // 절대 경로 변환
    const absPath = path.resolve(ctx.workingDir, params.path);
    // 프로젝트 디렉토리 내 확인
    if (!absPath.startsWith(ctx.workingDir)) {
      throw new Error("Path outside project");
    }
    // 바이너리 파일 거부
    if (isBinary(absPath)) {
      throw new Error("Binary file not supported");
    }
    // 2000자 이상 라인 잘림
    return readWithTruncation(absPath, 2000);
  }
});
```

### 1.6 LSP 통합

```
언어 감지 → LSP 서버 선택 → JSON-RPC 통신 → 진단 결과 → LLM 컨텍스트
    │            │                │              │            │
    ▼            ▼                ▼              ▼            ▼
 확장자      pyright,          stdio          에러/경고     다음 턴에
 스캔       gopls 등                          수집         포함
```

**지원 기능**:
- `goToDefinition`: 정의로 이동
- `findReferences`: 참조 찾기
- `documentSymbol`: 문서 심볼
- `workspaceSymbol`: 워크스페이스 심볼
- `diagnostics`: 진단 (에러/경고)
- `hover`: 호버 정보
- `callHierarchy`: 호출 계층

### 1.7 권한 모델

```json
// opencode.json
{
  "permissions": {
    "bash": "ask",      // 실행 전 사용자 승인
    "edit": "allow",    // 자동 허용
    "mcp_*": "ask",     // 모든 MCP 도구 승인 필요
    "read": "allow"     // 자동 허용
  }
}
```

| 권한 | 설명 |
|------|------|
| `allow` | 자동 실행 |
| `deny` | 사용 불가 |
| `ask` | 사용자 승인 필요 |

---

## 2. oh-my-opencode 분석

> 출처: [oh-my-opencode GitHub](https://github.com/code-yeongyu/oh-my-opencode), [Agent Orchestration Overview](https://deepwiki.com/code-yeongyu/oh-my-opencode/4.1-sisyphus-orchestrator)

### 2.1 개요

oh-my-opencode는 OpenCode 위에 구축된 **"Batteries-Included" 에이전트 하네스**로, 멀티 모델 오케스트레이션을 통해 LLM을 팀처럼 운영합니다.

### 2.2 에이전트 계층 구조

```
                    ┌─────────────────┐
                    │    Sisyphus     │  Primary Orchestrator
                    │  (Claude Opus)  │  - 작업 분류
                    │                 │  - 위임 결정
                    │                 │  - 완료 검증
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  Hephaestus  │    │    Oracle    │    │   Frontend   │
│ (GPT 5.2)    │    │  (GPT 5.2)   │    │ (Gemini 3)   │
│              │    │              │    │              │
│ - 자율 개발   │    │ - 아키텍처   │    │ - UI/UX     │
│ - 목표 지향   │    │ - 디버깅     │    │ - 프론트     │
└──────────────┘    └──────────────┘    └──────────────┘
        │                    │                    │
        ▼                    ▼                    ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  Librarian   │    │   Explore    │    │ Background   │
│ (Sonnet 4.5) │    │ (Haiku 4.5)  │    │   Tasks      │
│              │    │              │    │              │
│ - 문서화      │    │ - 빠른 탐색  │    │ - 병렬 실행  │
│ - 코드 탐색   │    │ - 리포 맵핑  │    │ - 컨텍스트   │
└──────────────┘    └──────────────┘    └──────────────┘
```

### 2.3 Primary vs Subagent

| 구분 | Primary | Subagent |
|------|---------|----------|
| **모델 선택** | UI에서 변경 가능 | 고정 |
| **위임 권한** | `delegate_task`, `call_omo_agent` | 제한적 |
| **용도** | 오케스트레이터 | 전문 작업 |
| **예시** | Sisyphus | Hephaestus, Oracle |

### 2.4 핵심 기능

**1. Todo Continuation Enforcer**
```typescript
// 미완료 작업이 있으면 종료 방지
if (hasPendingTodos()) {
  return {
    shouldStop: false,
    message: "작업이 남아있습니다. 계속 진행하세요."
  };
}
```

**2. 멀티 모델 라우팅**
```
전략적 작업 → GPT 5.2 (Oracle)
코드 생성   → GPT 5.2 Codex (Hephaestus)
시각적 작업 → Gemini 3 (Frontend)
문서화      → Claude Sonnet (Librarian)
빠른 탐색   → Claude Haiku (Explore)
```

**3. 백그라운드 에이전트**
- 병렬로 탐색 에이전트 실행
- 컨텍스트 수집하면서 메인 에이전트 작업
- 인지 부하 분산

**4. 내장 MCP 서버**
- Exa: 웹 검색
- Context7: 공식 문서
- Grep.app: GitHub 코드 검색

### 2.5 활성화 키워드

```
"ultrawork" 또는 "ulw" → 전체 시스템 활성화
```

---

## 3. 도구 시스템 비교

### 3.1 OpenCode 내장 도구

| 도구 | 설명 | Codepilot 대응 |
|------|------|---------------|
| `read` | 파일 읽기 (offset/limit) | `read_file` ✅ |
| `edit` | 문자열 교체 편집 | `update_file` ✅ |
| `write` | 파일 생성/덮어쓰기 | `create_file` ✅ |
| `bash` | 셸 명령 실행 | `run_command` ✅ |
| `glob` | 패턴 파일 검색 | `search_files` ✅ |
| `grep` | 정규식 내용 검색 | `ripgrep_search` ✅ |
| `list` | 디렉토리 목록 | `list_files` ✅ |
| `lsp` | LSP 작업 (정의, 참조 등) | ❌ 미지원 |
| `patch` | 패치 적용 | ❌ 미지원 |
| `webfetch` | 웹 페이지 fetch | `fetch_url` ✅ |
| `websearch` | Exa AI 웹 검색 | ❌ 미지원 |
| `todoread` | 할일 읽기 | ❌ TaskManager (다름) |
| `todowrite` | 할일 쓰기 | ❌ TaskManager (다름) |
| `question` | 사용자 질문 | ❌ 미지원 |
| `skill` | SKILL.md 로드 | HotLoad (유사) |

### 3.2 도구 정의 방식 비교

**OpenCode (Zod 스키마)**:
```typescript
Tool.define("read", {
  description: "...",
  parameters: z.object({ path: z.string() }),
  async execute(params, ctx) { ... }
});
```

**Codepilot (클래스 기반)**:
```typescript
class ReadFileToolHandler implements IToolHandler {
  name = "read_file";
  description = "...";
  schema = { path: { type: "string" } };
  async execute(toolUse: ToolUse): Promise<ToolResponse> { ... }
}
```

**차이점**:
- OpenCode: 함수형, Zod 런타임 검증
- Codepilot: 클래스 기반, JSON 스키마

---

## 4. Codepilot과 차별점

### 4.1 OpenCode 장점 (Codepilot 대비)

| 영역 | OpenCode | Codepilot | 차이 |
|------|----------|-----------|------|
| **LSP 통합** | 진단, 정의, 참조 등 | Tree-sitter만 | OpenCode 우수 |
| **Git 스냅샷** | 스텝별 롤백 | 트랜잭션 기반 | OpenCode 정교 |
| **히스토리 압축** | 자동 LLM 요약 | ConversationCompactor | 유사 |
| **권한 모델** | allow/deny/ask | PreToolUseValidator | OpenCode 유연 |
| **클라이언트 분리** | TUI/Web/Mobile | VSCode 전용 | OpenCode 유연 |
| **웹 검색** | Exa AI 내장 | 없음 | OpenCode 우수 |
| **사용자 질문** | question 도구 | 없음 | OpenCode 우수 |

### 4.2 Codepilot 장점 (OpenCode 대비)

| 영역 | Codepilot | OpenCode | 차이 |
|------|-----------|----------|------|
| **IDE 통합** | VSCode 네이티브 | 터미널 기반 | Codepilot 우수 |
| **인라인 Diff** | 에디터 내 미리보기 | 없음 | Codepilot 우수 |
| **자동 에러 수정** | AutoErrorHandler | 없음 | Codepilot 우수 |
| **FSM 기반** | 5단계 Phase | 단순 루프 | Codepilot 구조화 |
| **HotLoad** | 우선순위 프롬프트 | SKILL.md (유사) | 유사 |
| **MCP 통합** | 있음 | 있음 | 동등 |

### 4.3 oh-my-opencode 장점

| 영역 | oh-my-opencode | Codepilot | 차이 |
|------|---------------|-----------|------|
| **멀티 에이전트** | 6+ 전문 에이전트 | 단일 에이전트 | omo 우수 |
| **모델 라우팅** | 작업별 최적 모델 | 수동 선택 | omo 우수 |
| **백그라운드 태스크** | 병렬 탐색 | 순차 실행 | omo 우수 |
| **작업 완료 강제** | Todo Enforcer | 없음 | omo 우수 |

---

## 5. Codepilot에 추가해야 할 기능

### 5.1 높은 우선순위

#### A. LSP 통합 강화

**현황**: Tree-sitter로 AST 파싱만 지원
**목표**: 전체 LSP 기능 통합

```typescript
// 추가할 LSP 도구
const lspTool = {
  name: "lsp",
  operations: [
    "goToDefinition",    // 정의로 이동
    "findReferences",    // 참조 찾기
    "hover",             // 호버 정보
    "documentSymbol",    // 문서 심볼
    "workspaceSymbol",   // 워크스페이스 심볼
    "diagnostics"        // 진단 (에러/경고)
  ]
};
```

**구현 방안**:
1. `vscode.languages` API 활용
2. 또는 LSP 클라이언트 직접 구현
3. 파일 수정 후 자동 진단 → LLM 컨텍스트 포함

**예상 효과**: 코드 분석 정확도 대폭 향상

---

#### B. 웹 검색 도구 (Exa AI)

**현황**: URL fetch만 지원
**목표**: 자연어 웹 검색

```typescript
interface WebSearchTool {
  name: "web_search";
  params: {
    query: string;
    numResults?: number;
  };
  // Exa AI, Tavily, Perplexity 등 통합
}
```

**예상 효과**: 문서 검색, 최신 정보 접근

---

#### C. 사용자 질문 도구

**현황**: LLM이 질문하려면 응답에 텍스트로 포함
**목표**: 명시적 question 도구

```typescript
const questionTool = {
  name: "ask_user",
  params: {
    question: string,
    options?: string[],      // 선택지
    multiSelect?: boolean    // 다중 선택
  }
};
```

**예상 효과**: 애매한 요청 시 명확화, UX 개선

---

#### D. Git 스냅샷 기반 롤백

**현황**: FileTransactionManager (인메모리)
**목표**: Git 기반 스텝별 스냅샷

```typescript
class GitSnapshotManager {
  private snapshots: Map<string, string> = new Map(); // stepId → treeHash

  async captureSnapshot(stepId: string): Promise<void> {
    const treeHash = await exec("git write-tree");
    this.snapshots.set(stepId, treeHash);
  }

  async rollback(stepId: string): Promise<void> {
    const treeHash = this.snapshots.get(stepId);
    await exec(`git read-tree ${treeHash}`);
    await exec("git checkout-index -a -f");
  }
}
```

**예상 효과**: 더 안정적인 롤백, 커밋 히스토리 보존

---

### 5.2 중간 우선순위

#### E. 권한 모델 개선

**현황**: PreToolUseValidator (차단 위주)
**목표**: allow/deny/ask 3단계

```typescript
interface ToolPermission {
  tool: string;          // 도구명 또는 패턴 (mcp_*)
  permission: "allow" | "deny" | "ask";
}

// 설정 예시
{
  "permissions": {
    "read_file": "allow",
    "run_command": "ask",
    "remove_file": "deny"
  }
}
```

---

#### F. 멀티 에이전트 오케스트레이션

**현황**: 단일 ConversationManager
**목표**: 전문화된 서브 에이전트

```typescript
interface AgentConfig {
  name: string;
  model: string;              // 사용할 모델
  systemPrompt: string;       // 전문화된 프롬프트
  tools: string[];            // 허용된 도구
  mode: "primary" | "subagent";
}

// 예시 에이전트
const agents = [
  { name: "Architect", model: "gpt-4", focus: "설계/분석" },
  { name: "Coder", model: "claude-sonnet", focus: "코드 생성" },
  { name: "Reviewer", model: "claude-haiku", focus: "빠른 검토" }
];
```

---

#### G. 백그라운드 에이전트

**현황**: 모든 작업 순차 실행
**목표**: 탐색 작업 병렬 실행

```typescript
// 메인 에이전트 작업 중 백그라운드로 탐색
async function executeWithBackground(mainTask: string) {
  // 백그라운드 탐색 시작
  const explorePromise = spawnBackgroundAgent({
    type: "explore",
    query: "관련 파일 및 패턴 탐색"
  });

  // 메인 작업 실행
  const mainResult = await executeMainTask(mainTask);

  // 백그라운드 결과 병합
  const exploreResult = await explorePromise;
  return mergeContexts(mainResult, exploreResult);
}
```

---

### 5.3 낮은 우선순위

#### H. 히스토리 자동 요약 개선

**현황**: ConversationCompactor (규칙 기반)
**목표**: LLM 기반 요약

```typescript
async function compressHistory(messages: Message[]): Promise<Message[]> {
  const summary = await llm.call({
    prompt: "다음 대화를 핵심 정보만 보존하여 요약하세요",
    messages
  });

  return [{ role: "system", content: `이전 대화 요약: ${summary}` }];
}
```

---

#### I. 터미널 TUI 모드

**현황**: VSCode 전용
**목표**: 터미널에서도 사용 가능한 TUI

---

## 6. Codepilot 잘못된 로직

### 6.1 이미 수정된 문제 (이번 세션)

| # | 문제 | 파일 | 상태 |
|---|------|------|------|
| 1 | MCPManager 자동 연결 실패 무시 | MCPManager.ts | ✅ 수정됨 |
| 2 | TerminalManager 이벤트 리스너 누수 | TerminalManager.ts | ✅ 수정됨 |
| 3 | 무음 에러 처리 | TerminalManager.ts | ✅ 수정됨 |
| 4 | URL Fetch 실패 무시 | ConversationManager.ts | ✅ 수정됨 |
| 5 | 루프 탈출 무제한 호출 | ConversationManager.ts | ✅ 수정됨 |
| 6 | 테스트 재시도 undefined | ConversationManager.ts | ✅ 수정됨 |
| 7 | any 타입 과다 사용 | ConversationManager.ts | ✅ 수정됨 |

### 6.2 추가 발견된 문제

#### A. LSP 없이 코드 분석

**현황**: Tree-sitter AST만 사용
**문제**: 타입 정보, 참조 관계 파악 불가
**OpenCode 방식**: LSP 서버 통합으로 정확한 분석

```
Codepilot:  소스 파일 → Tree-sitter → AST → 패턴 매칭
OpenCode:   소스 파일 → LSP 서버 → 타입/참조/진단 → 정확한 분석
```

---

#### B. 스냅샷 없는 롤백

**현황**: FileTransactionManager (인메모리 백업)
**문제**: 메모리 누수 가능, 복잡한 변경 추적 어려움
**OpenCode 방식**: `git write-tree` 기반 스냅샷

```typescript
// Codepilot 현재
class FileTransactionManager {
  private backups: Map<string, string> = new Map(); // 메모리에 파일 내용 저장
  // 문제: 대용량 파일, 많은 파일 시 메모리 부담
}

// OpenCode 방식 (개선안)
class GitSnapshotManager {
  // Git 내부 객체 사용, 메모리 효율적
  async snapshot() {
    return exec("git write-tree");
  }
}
```

---

#### C. 단일 모델 의존

**현황**: 설정된 하나의 모델만 사용
**문제**: 모델별 강점 활용 못함
**oh-my-opencode 방식**: 작업별 최적 모델 라우팅

```typescript
// Codepilot 현재
const response = await llmManager.call(prompt); // 항상 같은 모델

// oh-my-opencode 방식 (개선안)
const response = await routeToOptimalModel({
  task: "코드 생성",
  model: "claude-sonnet"  // 코드 생성에 최적
});
const analysis = await routeToOptimalModel({
  task: "아키텍처 분석",
  model: "gpt-4"  // 분석에 최적
});
```

---

#### D. 권한 모델 경직성

**현황**: 차단 목록 기반 (PreToolUseValidator)
**문제**: 사용자 승인 요청 옵션 없음
**OpenCode 방식**: allow/deny/ask 3단계

```typescript
// Codepilot 현재
if (isDangerous(command)) {
  return { blocked: true }; // 무조건 차단
}

// OpenCode 방식 (개선안)
if (permission === "ask") {
  const approved = await askUserApproval(command);
  if (!approved) return { blocked: true };
}
```

---

#### E. Phase 전환 검증 부족

**현황**: FSM이지만 전환 조건 느슨함
**문제**: 잘못된 Phase에서 도구 실행 가능
**OpenCode 방식**: 에이전트 모드별 도구 제한 명확

```typescript
// Codepilot 현재 (느슨한 검증)
if (phase === AgentPhase.INVESTIGATION) {
  // 경고만 하고 실행은 허용
  console.warn("INVESTIGATION에서 write 도구 사용");
}

// 개선안 (엄격한 검증)
const allowedTools = {
  [AgentPhase.INVESTIGATION]: ["read_file", "list_files", "search_files"],
  [AgentPhase.EXECUTION]: ["create_file", "update_file", "run_command"]
};

if (!allowedTools[phase].includes(toolName)) {
  return { blocked: true, reason: "현재 Phase에서 허용되지 않는 도구" };
}
```

---

## 7. 개선 우선순위

### 7.1 즉시 개선 (이번 주)

| # | 작업 | 예상 시간 | 영향도 |
|---|------|----------|--------|
| 1 | LSP 진단 통합 (vscode.languages) | 4h | 높음 |
| 2 | question 도구 추가 | 2h | 중간 |
| 3 | Phase별 도구 제한 엄격화 | 2h | 중간 |

### 7.2 단기 개선 (2주)

| # | 작업 | 예상 시간 | 영향도 |
|---|------|----------|--------|
| 4 | Git 스냅샷 기반 롤백 | 8h | 높음 |
| 5 | 권한 모델 3단계 (allow/deny/ask) | 4h | 중간 |
| 6 | 웹 검색 도구 (Exa/Tavily) | 4h | 중간 |

### 7.3 중기 개선 (1개월)

| # | 작업 | 예상 시간 | 영향도 |
|---|------|----------|--------|
| 7 | 멀티 에이전트 오케스트레이션 | 3주 | 매우 높음 |
| 8 | 백그라운드 탐색 에이전트 | 1주 | 높음 |
| 9 | LLM 기반 히스토리 요약 | 1주 | 중간 |

---

## 참고 자료

### OpenCode
- [OpenCode 공식 사이트](https://opencode.ai/)
- [OpenCode GitHub](https://github.com/opencode-ai/opencode)
- [OpenCode 도구 문서](https://opencode.ai/docs/tools/)
- [OpenCode 에이전트 문서](https://opencode.ai/docs/agents/)
- [OpenCode LSP 문서](https://opencode.ai/docs/lsp/)
- [OpenCode MCP 문서](https://opencode.ai/docs/mcp-servers/)
- [OpenCode 내부 동작 분석](https://cefboud.com/posts/coding-agents-internals-opencode-deepdive/)

### oh-my-opencode
- [oh-my-opencode GitHub](https://github.com/code-yeongyu/oh-my-opencode)
- [Sisyphus 오케스트레이터](https://deepwiki.com/code-yeongyu/oh-my-opencode/4.1-sisyphus-orchestrator)
- [에이전트 설정 문서](https://github.com/code-yeongyu/oh-my-opencode/blob/dev/docs/configurations.md)

### 비교 기사
- [OpenCode vs Claude Code vs Copilot](https://www.infoq.com/news/2026/02/opencode-coding-agent/)
- [OpenCode Complete Guide 2026](https://brlikhon.engineer/blog/opencode-ai-the-complete-guide-to-the-open-source-terminal-coding-agent-revolutionizing-development-in-2026)


# CodePilot 경쟁사 심층 분석 레퍼런스

> 최초 작성: 2026-02-08 | 최종 업데이트: 2026-02-22
> 대상: Cline, Continue, OpenCode (오픈소스 소스코드 기반 분석)
> 목적: CodePilot 기능 갭 분석, 개선 방향 도출, 장기 레퍼런스 문서

---

## 목차

1. [경쟁사 개요](#1-경쟁사-개요)
2. [Cline 심층 분석](#2-cline-심층-분석)
3. [Continue 심층 분석](#3-continue-심층-분석)
4. [OpenCode 심층 분석](#4-opencode-심층-분석)
5. [CodePilot 현재 상태](#5-codepilot-현재-상태)
6. [기능 비교 매트릭스](#6-기능-비교-매트릭스)
7. [CodePilot 갭 분석 및 개선 로드맵](#7-codepilot-갭-분석-및-개선-로드맵)
8. [아키텍처 비교](#8-아키텍처-비교)
9. [파일 수정 / Diff / Undo 심층 비교](#9-파일-수정--diff--undo-심층-비교)
10. [부록: 기타 경쟁사 요약](#10-부록-기타-경쟁사-요약)

---

## 1. 경쟁사 개요

| 프로젝트 | 타입 | 언어 | Stars | 라이선스 | 핵심 차별점 |
|----------|------|------|-------|---------|------------|
| **Cline** | VS Code 확장 + CLI | TypeScript + Go | 40K+ | Apache 2.0 | Plan&Act, Shadow Git, Parallel Tool Calling |
| **Continue** | VS Code/JetBrains + CLI | TypeScript + Kotlin | 25K+ | Apache 2.0 | Hub 마켓플레이스, 40+ Context Provider, Next Edit |
| **OpenCode** | CLI (TUI) | Go | 95K+ | MIT | LSP 30+개 내장, 커스텀 Patch 형식, Sub-agent |
| **CodePilot** | VS Code 확장 | TypeScript | - | 상용 | 4단계 퍼지매칭, FSM 에이전트, 다국어 7개, 서버 설정 동기화 |

---

## 2. Cline 심층 분석

### 2.1 아키텍처 개요

```
VS Code Extension (TypeScript)
├── Webview UI (React)
│   ├── ChatView (대화, 도구 승인/거부)
│   ├── SettingsView (API 키, 자동 승인 설정)
│   └── HistoryView (세션 목록, 검색)
├── Core
│   ├── Cline (메인 에이전트 클래스)
│   ├── Task (작업 단위, mutex 보호)
│   └── Coordinator (도구 실행 총괄)
├── Tool System (27개 도구)
│   ├── File Tools (read, write, replace_in_file, apply_patch)
│   ├── Terminal Tools (execute_command)
│   ├── Browser Tools (Puppeteer 자동화)
│   ├── MCP Tools (동적 외부 도구)
│   └── Meta Tools (attempt_completion, ask_followup_question)
├── Checkpoint System (Shadow Git)
└── CLI (Go 바이너리, gRPC 서버)
```

### 2.2 에이전트 루프

```
사용자 입력
    │
    ▼
[Plan Mode 체크] ──Yes──▶ 읽기 전용 도구만 활성화
    │No                      Plan 작성 후 Act 전환
    ▼
[System Prompt 구성]
    │  - .clinerules 로드
    │  - Skills 매칭 (이름/설명만 → 매칭시 전문 로드)
    │  - Focus Chain (6메시지마다 TODO 주입)
    │  - 도구 스키마 (JSON 또는 XML)
    ▼
[API 호출] ◀──────────────────────────┐
    │  - 네이티브 Tool Calling (Claude4+, GPT-5, Gemini2.5)
    │  - XML 폴백 (지원 안되는 모델)
    │  - Prompt Caching (Anthropic)
    ▼                                  │
[응답 파싱]                            │
    ├── 텍스트 → 사용자에게 표시        │
    ├── tool_use → 승인 요청            │
    │      ├── 승인 → 도구 실행 ────────┘
    │      └── 거부 → 피드백 추가 ──────┘
    └── attempt_completion → 결과 제시
```

**핵심 특성:**
- **Mutex Guard**: 에이전트 상태를 mutex로 보호, 동시 접근 방지
- **Auto Compact**: 컨텍스트 80% 도달시 자동 요약 → 대화 교체
- **Checkpoint**: 매 도구 실행마다 Shadow Git 스냅샷
- **Parallel Tool Calling**: 독립 도구 동시 실행 (v3.56+, 모델 지원 필요)

### 2.3 도구 시스템 (27개)

| 카테고리 | 도구 | 설명 |
|----------|------|------|
| **파일** | `read_file` | 파일 읽기 (라인 범위 지정 가능) |
| | `write_to_file` | 전체 파일 교체 (Diff Editor 표시) |
| | `replace_in_file` | SEARCH/REPLACE 정밀 수정 |
| | `apply_patch` | GPT-5+ 전용 패치 형식 |
| | `list_files` | 디렉토리 목록 (재귀적/비재귀적) |
| | `search_files` | ripgrep 기반 콘텐츠 검색 |
| | `list_code_definition_names` | 심볼 정의 목록 (tree-sitter) |
| **터미널** | `execute_command` | 쉘 명령 실행 (streaming output) |
| **브라우저** | `browser_action` | Puppeteer: 클릭, 타이핑, 스크롤, 스크린샷 |
| **MCP** | 동적 등록 | McpHub를 통한 외부 도구 |
| **메타** | `attempt_completion` | 작업 완료 선언 |
| | `ask_followup_question` | 사용자에게 질문 |
| | `new_rule` | 프로젝트 규칙 생성 |

### 2.4 승인 정책 (8 카테고리)

```typescript
// 각 카테고리별 auto-approve 설정 가능
autoApproveSettings = {
    readFiles: true,       // 파일 읽기
    editFiles: false,      // 파일 수정
    executeCommands: false, // 터미널 명령
    useBrowser: false,     // 브라우저 자동화
    useMcp: false,         // MCP 도구
    writeToFile: false,    // 파일 생성
    search: true,          // 파일 검색
    listFiles: true        // 디렉토리 목록
}
```

- 워크스페이스 외부 파일 접근 시 추가 경고
- YOLO 모드: 모든 도구 자동 승인 (위험 명령 제외)
- Strict 모드: 읽기 전용만 자동 승인

### 2.5 체크포인트 시스템 (Shadow Git)

```
체크포인트 생성 흐름:
1. 도구 실행 완료
2. Shadow branch에 git add + commit
3. 체크포인트 ID 기록 (메시지별)
4. Diff 미리보기: 이전 체크포인트 vs 현재

롤백:
- UI에서 특정 체크포인트 선택
- git reset --hard로 워크스페이스 복원
- 멀티 루트 워크스페이스 지원

특징:
- .gitignore 기반 제외 패턴
- node_modules, .env 등 자동 제외
- 체크포인트 간 diff 표시
```

### 2.6 MCP 통합

- **3가지 전송 프로토콜**: stdio, SSE, HTTP
- **McpHub 중앙 관리**: 모든 MCP 서버/도구/리소스/프롬프트 통합
- **설정 파일 핫리로드**: chokidar로 `mcpconfig.json` 실시간 감시
- **OAuth 인증**: MCP 서버 OAuth 플로우 지원
- **MCP Prompts**: 슬래시 명령으로 프롬프트 실행 (v3.55+)
- **MCP Resources**: 데이터 소스 접근 (파일, DB, API 등)

### 2.7 LLM 통합

- **30+ 프로바이더**: Anthropic, OpenAI, Google, AWS Bedrock, Azure, DeepSeek, Groq, OpenRouter, Ollama 등
- **네이티브 Tool Calling**: Claude 4+, GPT-5, Gemini 2.5 등 지원 모델은 JSON 형식
- **XML 폴백**: 네이티브 미지원 모델은 XML 텍스트 파싱
- **Prompt Caching**: Anthropic API의 cache_control 활용
- **Extended Thinking**: Claude Thinking 모드 지원
- **4-Part Token 회계**: input / output / cache-read / cache-write 분리 추적
- **비용 실시간 표시**: 요청별 + 태스크 누적 비용

### 2.8 컨텍스트 관리

| 기능 | 설명 |
|------|------|
| **Auto Compact** | 컨텍스트 80% 도달시 자동 요약, 대화 교체 |
| **Focus Chain** | 6메시지마다 TODO 주입 (장기 작업 방향 유지) |
| **Skills** | 온디맨드 전문지식 (이름/설명 매칭 → 매칭시 전문 로드) |
| **.clinerules** | 프로젝트별 행동 규칙 파일 |
| **@멘션** | @file, @url, @problems 등 명시적 컨텍스트 주입 |

### 2.9 고유 기능

| 기능 | 설명 |
|------|------|
| **브라우저 자동화** | Puppeteer 기반: 페이지 탐색, 클릭, 타이핑, 스크린샷 |
| **CLI/Standalone** | Go 바이너리로 VS Code 없이 실행 가능 |
| **Parallel Tool Calling** | 독립 도구를 동시 실행 (v3.56+) |
| **Script Hooks** | PreToolUse, PostToolUse 등 6개 이벤트에 쉘 스크립트 실행 |
| **attempt_completion** | LLM이 명시적으로 작업 완료를 선언하는 도구 |
| **new_rule** | LLM이 스스로 프로젝트 규칙을 생성 |

---

## 3. Continue 심층 분석

### 3.1 아키텍처 개요

```
VS Code/JetBrains Extension (TypeScript/Kotlin)
├── Webview UI (React)
│   ├── Chat Mode (순수 Q&A)
│   ├── Edit Mode (인라인 코드 수정)
│   ├── Plan Mode (읽기 전용 탐색)
│   └── Agent Mode (전체 도구 활성화)
├── Core
│   ├── StreamDiffManager (인라인 diff 스트리밍)
│   ├── ContextProviderRegistry (40+ 컨텍스트 프로바이더)
│   └── ToolPolicyManager (3레벨 정책)
├── Indexing System
│   ├── FTS (전문 검색)
│   ├── Snippets (코드 조각)
│   ├── Chunks (청크 기반)
│   └── Embeddings (벡터 임베딩, LanceDB)
├── Tool System (23개 도구)
├── MCP Integration
└── Hub / Marketplace (커뮤니티 공유)
```

### 3.2 에이전트 루프

```
사용자 입력
    │
    ▼
[모드 선택]
    ├── Chat: 도구 없음, 순수 Q&A
    ├── Edit: 인라인 Diff, 선택 코드 수정
    ├── Plan: 읽기 전용 탐색
    └── Agent: 전체 도구 활성화
    │
    ▼ (Agent 모드)
[config.yaml 기반 설정 로드]
    │  - models (역할별: chat, edit, autocomplete, embed, rerank)
    │  - rules (.continue/rules/ + Hub 블록)
    │  - context providers (@멘션 기반)
    │  - tool policies (automatic/allowedWithPermission/blocked)
    ▼
[LLM 호출] ◀────────────────────────┐
    │  - 60+ 프로바이더 통합           │
    │  - 역할별 다른 모델 사용          │
    ▼                                │
[응답 처리]                           │
    ├── tool_call → 정책 확인          │
    │    ├── automatic → 즉시 실행 ───┘
    │    ├── allowedWithPermission → 승인 후 실행
    │    └── blocked → 실행 차단
    └── 텍스트/완료 → 사용자에게 표시
```

### 3.3 도구 시스템 (23개)

| 카테고리 | 도구 | 설명 |
|----------|------|------|
| **파일** | `create_new_file` | 새 파일 생성 |
| | `edit_existing_file` | 라인 범위 기반 수정 |
| | `read_file` | 파일 읽기 |
| | `read_currently_open_file` | 현재 열린 파일 읽기 |
| | `search_files` | 파일명 기반 검색 |
| | `grep_search` | 콘텐츠 검색 (ripgrep) |
| | `view_diff` | Git diff 보기 |
| | `view_repo_map` | 리포지토리 구조 맵 |
| **터미널** | `run_terminal_command` | 쉘 명령 실행 |
| **웹** | `search_web` | 웹 검색 |
| | `fetch_url` | URL 콘텐츠 가져오기 |
| **코드** | `codebase_search` | 임베딩 기반 시맨틱 검색 |
| | `exact_search` | 정확한 문자열 검색 |
| **MCP** | 동적 등록 | 외부 MCP 도구 |

### 3.4 승인 정책 (3 레벨)

```yaml
# config.yaml
tools:
  - name: create_new_file
    policy: allowedWithPermission  # 사용자 승인 필요
  - name: read_file
    policy: automatic              # 자동 실행
  - name: run_terminal_command
    policy: allowedWithPermission
```

- **automatic**: 사용자 승인 없이 즉시 실행
- **allowedWithPermission**: 사용자 승인 후 실행
- **blocked**: 실행 차단 (도구 목록에서도 숨김)
- 워크스페이스 외부 파일 접근 시 자동 escalation → `allowedWithPermission`

### 3.5 컨텍스트 시스템 (40+ Provider)

| 카테고리 | Provider | 설명 |
|----------|----------|------|
| **코드** | `@File` | 특정 파일 내용 |
| | `@Code` | 코드베이스 시맨틱 검색 |
| | `@Codebase` | 전체 코드베이스 검색 |
| | `@CurrentFile` | 현재 열린 파일 |
| | `@Terminal` | 터미널 출력 |
| **Git** | `@Git Diff` | 스테이징된 변경사항 |
| | `@Commit` | 커밋 히스토리 |
| **외부** | `@URL` | 웹 페이지 내용 |
| | `@Docs` | 문서 사이트 인덱싱 |
| | `@Google` | Google 검색 결과 |
| **IDE** | `@Problems` | LSP 진단 결과 |
| | `@Open` | 열린 파일 목록 |
| | `@Folder` | 폴더 내용 |
| **커스텀** | Hub 블록 | 커뮤니티 공유 컨텍스트 |

### 3.6 인덱싱 시스템

```
4가지 인덱싱 전략:

1. FTS (Full Text Search)
   - SQLite 기반 전문 검색
   - 파일 내용 토큰화

2. Snippets
   - 코드 조각 단위 인덱싱
   - 함수/클래스 레벨 추출

3. Chunks
   - 고정 크기 청크 분할
   - 오버랩 기반 연속성 보장

4. Embeddings
   - LanceDB 벡터 저장소
   - MiniLM-L6 임베딩 모델
   - 코사인 유사도 검색
   - Reranking: LLM 기반 결과 재정렬
```

- **Pauseable**: 인덱싱 일시정지/재개 가능
- **Incremental**: 변경 파일만 재인덱싱
- **Error Recovery**: 인덱싱 실패시 복구

### 3.7 인라인 Diff 스트리밍

```
LLM 응답 스트리밍 중:
    │
    ├── StreamDiffManager가 토큰 단위로 diff 계산
    ├── 에디터에 실시간 ghost text 표시
    ├── 라인 단위: 추가(초록) / 삭제(빨강)
    ├── 스트리밍 완료 후:
    │   ├── Cmd+Opt+Y: 전체 Accept
    │   ├── Cmd+Opt+N: 전체 Reject
    │   └── 라인별 개별 Accept/Reject
    └── Instant Find/Replace 옵션 (v1.5.8)
```

### 3.8 LLM 통합

- **60+ 프로바이더**: Anthropic, OpenAI, Google, Ollama, Azure, AWS, DeepSeek, Groq, Together, Mistral 등
- **역할별 모델 분리**: chat / edit / autocomplete / embed / rerank 각각 다른 모델
- **Tab Autocomplete**: Next Edit 예측 기능 포함
- **네이티브 Tool Calling**: 지원 모델은 JSON 형식, 폴백은 마크다운 코드블록
- **MiniLM-L6 임베딩**: 로컬 벡터 임베딩

### 3.9 고유 기능

| 기능 | 설명 |
|------|------|
| **Hub / Marketplace** | Rules, Models, Context Provider 등을 커뮤니티에서 공유 |
| **Mission Control** | 클라우드 에이전트 관리, Sentry/Snyk/GitHub 통합 |
| **Next Edit 예측** | Tab 자동완성 시 다음 편집 위치 예측 |
| **Headless CLI** | 비대화형 모드로 CI/CD 파이프라인 통합 |
| **Colocated Rules** | 디렉토리별 rules.md 배치 (glob 조건부 적용) |
| **Repository Map** | 경량 코드 구조 개요 (view_repo_map 도구) |
| **임베딩 기반 코드 검색** | LanceDB + MiniLM 시맨틱 검색 |
| **Reranking** | 검색 결과를 LLM으로 재정렬하여 관련성 향상 |

---

## 4. OpenCode 심층 분석

### 4.1 아키텍처 개요

```
Go CLI Application (Single Binary)
├── TUI Frontend (Bubble Tea)
│   ├── Chat Page (메시지, 에디터)
│   ├── Dialogs (권한, 모델, 세션)
│   └── Themes (12개 내장 테마)
├── Agent System
│   ├── Coder Agent (전체 도구, 코드 작성/실행)
│   ├── Task Agent (읽기 전용 서브에이전트)
│   ├── Title Agent (세션 제목 생성)
│   └── Summarizer Agent (대화 요약)
├── Tool System (13개 도구)
├── LSP Integration (30+ 언어 서버)
├── Permission System (pub/sub 기반)
├── Storage (SQLite)
└── MCP Integration (stdio + SSE)
```

### 4.2 에이전트 루프

```go
// agent.go 핵심 루프 (Go)
for {
    agentMessage, toolResults, err := a.streamAndHandleEvents(ctx, sessionID, msgHistory)
    if err != nil {
        return error
    }
    if agentMessage.FinishReason() == ToolUse && toolResults != nil {
        msgHistory = append(msgHistory, agentMessage, *toolResults)
        continue  // 도구 사용 → 루프 계속
    }
    return agentMessage  // 완료 → 루프 종료
}
```

**핵심 특성:**
- **Streaming-first**: 모든 프로바이더 통신이 Go 채널 기반 이벤트 스트리밍
- **Agent 계층**: Coder(전체 도구) → Task(읽기 전용 서브에이전트) 위임 패턴
- **Auto Compact**: 95% 컨텍스트 도달시 Summarizer Agent로 자동 요약
- **LSP 피드백**: 파일 수정 후 즉시 LSP 진단 → 오류시 LLM에 피드백

### 4.3 도구 시스템 (13개)

| 도구 | 설명 | 권한 |
|------|------|------|
| `bash` | 쉘 명령 실행 | Ask |
| `write` | 파일 생성/전체 교체 | Ask |
| `edit` | old_string→new_string 정밀 수정 | Ask |
| `patch` | 멀티파일 원자적 변경 | Ask per file |
| `view` | 파일 내용 읽기 | Auto |
| `glob` | 파일 패턴 검색 | Auto |
| `grep` | 콘텐츠 검색 | Auto |
| `ls` | 디렉토리 목록 | Auto |
| `fetch` | URL 콘텐츠 가져오기 | Ask |
| `diagnostics` | LSP 오류 확인 | Auto |
| `sourcegraph` | 공개 코드 검색 | Ask |
| `agent` | 서브에이전트 실행 | Auto |
| MCP Tools | 외부 도구 | Ask |

### 4.4 파일 수정 3종 도구

#### Write (전체 교체)
```
LLM → 전체 파일 내용
  → 권한 확인 (allow/ask/deny)
  → 외부 수정 감지 (modTime vs lastRead)
  → 파일 히스토리 버전 생성
  → 디스크 쓰기
  → LSP 진단 대기 → 오류시 LLM에 피드백
```

#### Edit (정밀 수정)
```
LLM → old_string / new_string 쌍
  → old_string이 파일 내 정확히 1회 존재하는지 검증
  → 파일이 먼저 View 도구로 읽혔는지 확인
  → 교체 적용
  → LSP 진단 → 오류시 자동 수정 시도
```

#### Patch (멀티파일 원자적)
```
커스텀 형식:
*** Update File: path/to/file
@@
 context line
-old line
+new line
 context line

*** Add File: path/to/new_file
+entire content

*** Delete File: path/to/file

특징:
- 모든 변경이 원자적 (전부 성공 또는 전부 실패)
- Fuzz level 3 허용 (근접 매칭)
- 각 파일별 권한 확인
```

### 4.5 권한 시스템

```go
type PermissionRequest struct {
    ID          string    // UUID
    SessionID   string    // 세션 컨텍스트
    ToolName    string    // write, edit, bash 등
    Action      string    // "write", "create", "delete"
    Path        string    // 접근 디렉토리
    Description string    // 사용자용 설명
}
```

- **세션 스코프**: 권한 결정은 세션 단위
- **Pub/Sub 기반**: TUI에 다이얼로그 표시 → 사용자 선택
- **Grant/Deny/GrantPersistent**: 일회/거부/세션 영구 승인
- **AutoApproveSession()**: 비대화형 모드용 전체 자동 승인

### 4.6 LSP 통합 (30+ 언어)

```
지원 언어 서버:
Go (gopls), TypeScript (typescript-language-server),
Python (pylance/pyright), Rust (rust-analyzer),
Java, C/C++ (clangd), Ruby, PHP, Kotlin, Swift,
Elixir, Haskell, Lua, Zig, Nim, OCaml 등

피드백 루프:
파일 수정 → waitForLspDiagnostics() → 진단 결과 수집
  → 오류 있으면 도구 응답에 포함 → LLM이 자동 수정 시도
```

### 4.7 LLM 통합

- **8개 프로바이더**: Anthropic, OpenAI, Google Gemini, AWS Bedrock, Groq, Azure, OpenRouter, X.AI
- **비용 추적**: 모델별 per-1M token 가격 설정, 세션별 총 비용 추적
- **Prompt Caching**: Anthropic/OpenAI 캐시 지원 (마지막 2메시지 ephemeral)
- **Reasoning Effort**: low/medium/high 사고 수준 설정 (o1, o3 모델)
- **최대 8회 재시도**: 지수 백오프

### 4.8 컨텍스트 관리

| 기능 | 설명 |
|------|------|
| **Auto Compact** | 95% 컨텍스트 도달시 Summarizer Agent로 요약 |
| **Context Rules** | `.cursorrules`, `CLAUDE.md`, `opencode.md` 등 다수 규칙 파일 지원 |
| **Custom Commands** | `~/.config/opencode/commands/` 마크다운 기반 커스텀 명령 |
| **Session Summary** | 요약 메시지로 새 세션 시작, SummaryMessageID로 연결 |

### 4.9 고유 기능

| 기능 | 설명 |
|------|------|
| **LSP 30+ 언어 통합** | 파일 수정 후 즉시 타입/문법 오류 감지 및 피드백 |
| **Patch 도구** | 멀티파일 원자적 변경 (fuzz 매칭 지원) |
| **Sub-agent (Task Agent)** | 읽기 전용 서브에이전트로 탐색 위임 |
| **Custom Commands** | 마크다운 파일 기반 재사용 가능 명령 ($ARGUMENT_NAME 변수) |
| **12개 TUI 테마** | Catppuccin, Dracula, TokyoNight, Gruvbox 등 |
| **비대화형 모드** | `opencode -p "query"` 파이프라인 통합 |
| **SQLite 영속성** | 세션, 메시지, 파일 히스토리 로컬 저장 |
| **Sourcegraph 통합** | 공개 코드 검색 도구 |

---

## 5. CodePilot 현재 상태

### 5.1 아키텍처

```
VS Code Extension (TypeScript)
├── Webview UI (HTML/JS)
│   ├── ChatViewProvider (대화)
│   ├── AskViewProvider (빠른 질문)
│   └── SettingsPanelProvider (설정)
├── Core
│   ├── ConversationManager (대화 흐름 제어)
│   ├── AgentStateManager (FSM: Investigation→Execution→Review→Done)
│   ├── LLMManager (Ollama + AdminModel)
│   ├── PromptComposer (OS별/태스크별/프레임워크별 프롬프트)
│   ├── ToolParser + StreamingToolParser (텍스트 기반 도구 파싱)
│   ├── ToolExecutor + ToolRegistry (도구 실행)
│   ├── InlineDiffManager (Shadow Document + AICheckpoint)
│   ├── FileTransactionManager (원자적 롤백)
│   └── MCPManager (stdio MCP 클라이언트)
├── Tool System (17개 도구)
├── Services
│   ├── CodePilotApiClient (백엔드 통신)
│   ├── AuthService (OAuth JWT)
│   ├── SettingsManager (서버 설정 동기화)
│   └── UsageMetricsManager (사용량 리포팅)
└── Backend (Django REST API) - 별도 프로젝트
    ├── 조직별 설정 관리
    ├── 라이선스/사용량 관리
    └── 모니터링 대시보드
```

### 5.2 에이전트 루프 (FSM 기반)

```
사용자 입력
    │
    ▼
[IntentDetector] → 의도 분류
    │  (code_work, execution_work, analysis, documentation, terminal)
    ▼
[AgentPhase FSM]
    │
    ├── INVESTIGATION (읽기 전용)
    │   허용: READ, LIST, SEARCH, RIPGREP
    │   전환: 플랜 존재 OR 도구 호출시 → EXECUTION
    │
    ├── EXECUTION (전체 도구)
    │   허용: 모든 도구
    │   전환: 실행 완료 → REVIEW
    │
    ├── REVIEW (요약)
    │   도구 없음, 결과 요약
    │   전환: 재시도 필요 → EXECUTION, 완료 → DONE
    │
    └── DONE (종료)

무한루프 방지:
- 동일 전환 5회 연속 → 탈출 전략 (retry/skip/force/abort)
- 동일 플랜 항목 3회 → skip 또는 force_transition
- 진행 없음 3턴 → abort
```

### 5.3 도구 시스템 (17개)

| 도구 | 설명 |
|------|------|
| `create_file` | 파일 생성 (InlineDiff + Accept/Reject) |
| `update_file` | SEARCH/REPLACE diff 기반 수정 (4단계 퍼지매칭) |
| `remove_file` | 파일 삭제 |
| `read_file` | 파일 읽기 |
| `list_files` | 디렉토리 목록 |
| `search_files` | 파일명 검색 |
| `ripgrep_search` | 콘텐츠 검색 |
| `run_command` | 터미널 명령 실행 |
| `analyze_code` | 코드 분석 |
| `verify_code` | 코드 검증 |
| `refactor_code` | 리팩토링 |
| `expand_around_line` | 특정 라인 주변 확장 읽기 |
| `list_imports` | import 목록 |
| `stat_file` | 파일 메타데이터 |
| `git_diff` | Git diff |
| `read_active_file` | 현재 열린 파일 읽기 |
| `fetch_url` | URL 콘텐츠 가져오기 |

### 5.4 파일 수정 특징

- **4단계 퍼지매칭** (업계 최고 수준):
  1. Exact: 정확한 문자열 매칭
  2. Line-Trimmed: 공백 제거 후 매칭
  3. Block Anchor: 첫줄+끝줄 앵커 매칭
  4. Structural: 정규식 구조 매칭
- **InlineDiffManager**: Shadow Document 패턴, AICheckpoint, 데코레이션 기반 diff
- **FileTransactionManager**: 원자적 트랜잭션, 최대 50개 이력 보관
- **`<file_content>` XML 태그**: 백틱 충돌 방지를 위한 커스텀 형식 (v9.2.0)
- **HTML 엔티티/CDATA 클리닝**: LLM 출력 정제

### 5.5 독자적 강점

| 기능 | 설명 |
|------|------|
| **FSM 에이전트** | 업계 유일한 명시적 4단계 상태 머신 + 무한루프 방지 |
| **4단계 퍼지매칭** | SEARCH 블록 매칭 실패시 4단계 폴백 (업계 최고) |
| **다국어 7개** | 한/영/일/중/독/프/스 UI 지원 |
| **서버 설정 동기화** | 백엔드에서 조직별 설정 강제/추천/기본 3단계 적용 |
| **관리자 모델 통합** | AdminModelApi: provider 기반 라우팅 (Gemini REST + OpenAI-compatible) |
| **HotLoad 프롬프트** | 서버에서 동적으로 프롬프트 로드 |
| **보안 규칙 동기화** | 백엔드에서 파일 보호 패턴, 차단 명령 등 서버 관리 |

---

## 6. 기능 비교 매트릭스

### 6.1 에이전트 루프 & 아키텍처

| 기능 | CodePilot | Cline | Continue | OpenCode |
|------|:---------:|:-----:|:--------:|:--------:|
| Agent Loop (자율 실행) | O | O | O | O |
| Plan/Act 모드 분리 | △ (FSM 자동) | O (사용자 토글) | O (4모드) | O (Agent별) |
| Subagent (병렬) | X | O (v3.56) | X | O (Task Agent) |
| Background/CLI 모드 | X | O (Go CLI) | O (Headless) | O (TUI+CLI) |
| 네이티브 Tool Calling | X | O | O | O |
| 병렬 Tool Calling | X | O | O | X |
| 명시적 완료 도구 | X | O (attempt_completion) | X | X |
| 무한루프 감지 | O (5회+4전략) | O (루프 방지) | X | X |

### 6.2 LLM & 모델

| 기능 | CodePilot | Cline | Continue | OpenCode |
|------|:---------:|:-----:|:--------:|:--------:|
| 멀티 프로바이더 | △ (Ollama+Admin) | O (30+) | O (60+) | O (8+) |
| Prompt Caching | X | O | X | O |
| Extended Thinking | X | O | X | O |
| 역할별 모델 분리 | X | X | O (5역할) | O (2역할) |
| Tab Autocomplete | X | X | O | X |
| 비용 실시간 표시 | X | O | X | O |

### 6.3 컨텍스트 관리

| 기능 | CodePilot | Cline | Continue | OpenCode |
|------|:---------:|:-----:|:--------:|:--------:|
| Auto Compact | O (ConversationCompactor) | O (80%) | X | O (95%) |
| Focus Chain/TODO 주입 | X | O (6메시지) | X | X |
| @멘션 컨텍스트 | X | O | O (14+종류) | X |
| Repo Map | X | X | O (view_repo_map) | X |
| 임베딩 코드 검색 | X | X | O (LanceDB) | X |
| 프로젝트 Rules 파일 | X | O (.clinerules) | O (.continue/rules/) | O (opencode.md) |
| 체크포인트/롤백 | △ (FileTransaction) | O (Shadow Git) | X | O (File History) |

### 6.4 도구 시스템

| 기능 | CodePilot | Cline | Continue | OpenCode |
|------|:---------:|:-----:|:--------:|:--------:|
| 도구 수 | 17 | 27 | 23 | 13 |
| 도구 승인 세분화 | △ (블록리스트) | O (8카테고리) | O (3레벨) | O (per-tool) |
| 브라우저 자동화 | X | O (Puppeteer) | X | X |
| LSP 통합 | X | X | X | O (30+) |
| Patch/Diff 도구 | X | O (apply_patch) | X | O (patch) |
| 사용자 질문 도구 | X | O (ask_followup) | X | O (question) |
| 퍼지 매칭 | O (4단계) | X | X | X |

### 6.5 MCP 통합

| 기능 | CodePilot | Cline | Continue | OpenCode |
|------|:---------:|:-----:|:--------:|:--------:|
| MCP Tools | O | O | O | O |
| MCP Resources | X | O | O | X |
| MCP Prompts | X | O (v3.55) | O | X |
| MCP OAuth | X | O | O | O |
| 설정 핫리로드 | X | O (chokidar) | X | X |

### 6.6 UI/UX

| 기능 | CodePilot | Cline | Continue | OpenCode |
|------|:---------:|:-----:|:--------:|:--------:|
| Diff 미리보기 | O (InlineDiff) | O (VS Code Diff) | O (인라인 스트리밍) | X (TUI) |
| 토큰/비용 표시 | X | O | X | O |
| 메시지 편집/재시도 | X | O | X | O |
| 다국어 | O (7개) | X | X | X |
| 세션 관리 | △ (기본) | O (HistoryView) | O | O (SQLite) |
| 테마 | O (dark/light) | O (VS Code) | O | O (12개) |

---

## 7. CodePilot 갭 분석 및 개선 로드맵

### 7.1 [P0] 즉시 추가 — 경쟁력 핵심

| # | 기능 | 현재 | 목표 | 참고 | 난이도 |
|---|------|------|------|------|--------|
| 1 | **네이티브 Tool Calling** | 텍스트 파싱 (`<file_content>`) | API JSON Tool Calling (폴백으로 텍스트 유지) | Cline: 15% 토큰 절감 | 중 |
| 2 | **도구 승인 세분화** | autoExecute 온/오프 | 카테고리별 (읽기auto/쓰기ask/실행ask/MCP ask) | Cline 8카테고리, Continue 3레벨 | 중 |
| 3 | **@멘션 컨텍스트** | 없음 | @file, @folder, @url, @problems | Cline, Continue, Cursor | 중 |
| 4 | **Plan & Act 모드 토글** | FSM 자동 전환만 | 사용자가 UI에서 Plan↔Act 명시적 전환 | Cline, Continue | 하 |
| 5 | **토큰/비용 실시간 표시** | 없음 | 요청별, 누적, 컨텍스트 사용률 | Cline, OpenCode | 하 |
| 6 | **체크포인트/롤백** | FileTransaction (50개 이력) | Shadow Git 또는 파일 히스토리 기반 비교/롤백 UI | Cline, OpenCode | 중 |

### 7.2 [P1] 단기 추가 — UX 향상

| # | 기능 | 현재 | 목표 | 참고 | 난이도 |
|---|------|------|------|------|--------|
| 7 | **프로젝트 Rules 파일** | 없음 | `.codepilot/rules/` glob 조건부 적용 | Cline, Continue, Cursor | 하 |
| 8 | **Focus Chain / TODO 주입** | 없음 | N메시지마다 작업 목록 컨텍스트 주입 | Cline (6메시지), Claude Code | 중 |
| 9 | **사용자 질문 도구** | 없음 | LLM이 사용자에게 객관식/주관식 질문 | Cline, OpenCode, Claude Code | 하 |
| 10 | **메시지 편집/재시도** | 없음 | 이전 메시지 수정 후 해당 시점부터 재실행 | Cline, OpenCode | 중 |
| 11 | **MCP Resources/Prompts** | Tools만 | Resources + Prompts 추가 | Cline, Continue | 중 |
| 12 | **Hooks 시스템** | 없음 | PreToolUse/PostToolUse 이벤트 스크립트 | Cline (6이벤트), Claude Code | 중 |
| 13 | **attempt_completion** | CompletionJudge | LLM이 명시적 완료 도구 호출로 결과 제출 | Cline | 하 |

### 7.3 [P2] 중기 추가 — 차별화

| # | 기능 | 현재 | 목표 | 참고 | 난이도 |
|---|------|------|------|------|--------|
| 14 | **Repo Map** | 없음 | tree-sitter 함수/클래스 시그니처 추출 | Aider, Continue | 상 |
| 15 | **임베딩 코드 검색** | 없음 | 벡터 인덱싱 + 시맨틱 검색 | Continue (LanceDB) | 상 |
| 16 | **역할별 모델 분리** | 단일 모델 | chat/edit/autocomplete 각각 다른 모델 | Continue, Aider | 중 |
| 17 | **병렬 Tool Calling** | 순차 실행 | 독립 도구 동시 실행 | Cline, Continue | 중 |
| 18 | **LSP 피드백 루프** | 없음 | 파일 수정 → LSP 진단 → 오류시 LLM 피드백 | OpenCode | 상 |
| 19 | **Patch/Apply 도구** | 없음 | unified diff 또는 커스텀 패치 형식 | OpenCode (patch), Cline (apply_patch) | 중 |
| 20 | **Skills 시스템** | 없음 | 온디맨드 전문지식 패키지 | Cline | 중 |

### 7.4 [P3] 장기 추가 — 플랫폼 확장

| # | 기능 | 설명 | 참고 | 난이도 |
|---|------|------|------|--------|
| 21 | **CLI/Headless 모드** | 비대화형 실행, CI/CD 통합 | Cline, Continue, OpenCode | 상 |
| 22 | **Tab Autocomplete** | 인라인 자동완성 (소형 모델) | Continue, Cursor | 상 |
| 23 | **브라우저 자동화** | Puppeteer/Playwright 웹 테스트 | Cline | 상 |
| 24 | **Hub/Marketplace** | Rules, MCP, 모델설정 공유 | Continue Hub | 상 |
| 25 | **Sub-agent 위임** | 탐색/분석을 별도 에이전트에 위임 | OpenCode, Claude Code | 상 |

### 7.5 수정/개선이 필요한 기존 기능

| # | 현재 상태 | 개선 방향 | 이유 |
|---|----------|----------|------|
| 1 | **텍스트 기반 도구 파싱** | 네이티브 Tool Calling + 텍스트 폴백 | 토큰 절감, 파싱 오류 감소 |
| 2 | **EXECUTION에서 텍스트 응답 차단** | 텍스트+도구 혼합 허용 | 사용자에게 진행상황 알림 |
| 3 | **REVIEW 단계 수동** | Auto-review: lint/test 결과 자동 포함 | OpenCode LSP, Aider lint 루프 |
| 4 | **파일 삭제 미승인** | RemoveFile도 사용자 승인 필요 | Cline/OpenCode는 삭제도 승인 |
| 5 | **PreToolUseValidator 블록리스트** | 카테고리별 세분화 + glob 패턴 | OpenCode bash glob 패턴 |
| 6 | **MCP 설정 변경시 재시작** | chokidar fs.watch 핫리로드 | Cline: 실시간 감시 |
| 7 | **ConversationCompactor 단일 방식** | 임계값 자동 트리거 + Focus Chain 이중 전략 | Cline 80%, OpenCode 95% |
| 8 | **토큰 사용량 비가시적** | 요청별/누적 토큰 + 비용 표시 | 업계 표준 |

### 7.6 잘못된/비효율적 로직

| # | 위치 | 문제 | 수정 방향 |
|---|------|------|----------|
| 1 | `ToolParser.ts` | `indexOf` → 중첩 `</file_content>` 시 첫 번째 태그에서 잘림 | `lastIndexOf` 사용 (**v9.7.3 수정 완료**) |
| 2 | `StreamingToolParser.ts` | 동일 문제 | `lastIndexOf` 사용 (**v9.7.3 수정 완료**) |
| 3 | `StreamingCodeApplier.ts` | `<file_content>` → 고정 ` ``` ` 변환 시 내용에 백틱 있으면 충돌 가능 | 동적 fence 길이 (```→````→````` 등) |
| 4 | `RemoveFileToolHandler` | 삭제 시 사용자 승인 없이 즉시 실행 | 승인 플로우 추가 |
| 5 | `ConversationManager` | Investigation 단계에서 FetchUrl 도구 사용 불가 | Investigation 허용 도구에 추가 |
| 6 | `AgentStateManager` | 사용자가 Plan↔Act 모드를 전환할 수 없음 | UI 토글 버튼 + API 추가 |

---

## 8. 아키텍처 비교

### 8.1 에이전트 상태 관리

| 프로젝트 | 방식 | 상태/단계 | 전환 조건 |
|----------|------|----------|----------|
| **CodePilot** | 명시적 FSM (4상태) | Investigation→Execution→Review→Done | 도구 호출/플랜 시 자동 전환 |
| **Cline** | 암묵적 루프 + 모드 토글 | Plan ↔ Act (사용자 전환) | 사용자 토글 |
| **Continue** | 모드 기반 (도구 제한) | Chat/Edit/Plan/Agent | 사용자 선택 |
| **OpenCode** | Agent 기반 분리 | Coder/Task/Title/Summarizer | Agent 선택시 도구셋 결정 |

**평가:**
- CodePilot FSM: 가장 체계적 (자동 단계 전환 + 무한루프 감지 + 4 복구 전략)
- 개선점: 사용자 수동 전환 부재, EXECUTION 텍스트 차단, REVIEW 자동화 부족

### 8.2 도구 호출 방식

| 프로젝트 | 방식 | 장점 | 단점 |
|----------|------|------|------|
| **CodePilot** | 텍스트 파싱 (`<file_content>` XML) | 모든 모델 호환 | 토큰 오버헤드, 파싱 에러 |
| **Cline** | 네이티브 + XML 폴백 | 최적 성능 + 호환성 | 복잡도 증가 |
| **Continue** | 네이티브 + 마크다운 폴백 | 유연함 | 코드블록 파싱 불안정 |
| **OpenCode** | 네이티브 (AI SDK) | 깔끔 | 네이티브 미지원 모델 제한 |

### 8.3 컨텍스트 관리 전략

| 프로젝트 | 압축 방식 | 트리거 | 추가 전략 |
|----------|----------|--------|----------|
| **CodePilot** | ConversationCompactor 요약 | 수동/자동 | 없음 |
| **Cline** | Auto Compact 요약 교체 | 80% | Focus Chain (6메시지 TODO) |
| **Continue** | 없음 (사용자 수동) | - | 40+ Context Provider |
| **OpenCode** | Summarizer Agent 요약 | 95% | Session Summary 연결 |

---

## 9. 파일 수정 / Diff / Undo 심층 비교

### 9.1 파일 수정 방식 총괄 비교

| 방식 | CodePilot | Cline | Continue | OpenCode |
|------|-----------|-------|----------|----------|
| **전체 파일 교체** | O (CreateFile) | O (write_to_file) | O (create_new_file) | O (write) |
| **SEARCH/REPLACE** | O (UpdateFile, 4단계 퍼지) | O (replace_in_file) | O (edit_existing_file) | O (edit, 1회 매칭) |
| **Find & Replace** | X | X | O (single_find_and_replace) | X |
| **Patch/Diff** | X | O (apply_patch, GPT-5+) | X | O (patch, 원자적) |
| **인라인 Diff UI** | O (데코레이션 기반) | O (VS Code Diff Editor) | O (인라인 스트리밍) | X (TUI) |
| **사용자 승인** | O (pending→accept/reject) | O (Approve/Reject) | O (Accept/Reject) | O (allow/deny) |
| **개별 변경 Accept/Reject** | **O (change 단위)** | X (도구 호출 단위) | O (hunk 단위) | X (파일 단위) |
| **퍼지 매칭** | **O (업계 최고: 4단계)** | X | X | △ (fuzz 3) |
| **원자적 트랜잭션** | O (FileTransactionManager) | O (Shadow Git) | X | O (patch only) |
| **LSP 피드백 루프** | X | X | X | O (30+언어) |
| **Lint/Test 자동 수정** | △ (TestRunner 별도) | X | X | O (LSP 기반) |

---

### 9.2 Cline 파일 수정 상세

#### 9.2.1 도구별 수정 방식

**write_to_file (전체 파일 교체):**
```xml
<write_to_file>
<path>src/Header.tsx</path>
<content>
// 전체 파일 내용 (잘림 불가, MUST be COMPLETE)
</content>
</write_to_file>
```
- 기존 파일 완전 교체 또는 신규 파일 생성
- 시스템 프롬프트에서 "ALWAYS provide COMPLETE content, no truncation" 명시

**replace_in_file (SEARCH/REPLACE 정밀 수정):**
```
<<<<<<< SEARCH
[정확히 일치하는 기존 코드 — 글자 하나 틀려도 실패]
=======
[교체할 새 코드]
>>>>>>> REPLACE
```
- 각 SEARCH 블록은 파일에서 **정확히 1회** 존재해야 함
- 여러 SEARCH/REPLACE 블록을 한 번에 적용 가능 (파일 순서대로)
- **constructNewFileContent()** 알고리즘이 순서 무관하게 적용 (order-invariant)
- 3번 연속 매칭 실패 시 write_to_file 폴백 권장

**apply_patch (V4A 형식, GPT-5+ 전용):**
```
*** Begin Patch
*** Update File: src/Header.tsx
@@ [컨텍스트 앵커 텍스트]
 context line
-old line
+new line
*** End Patch
```
- 라인 번호 불필요 — 컨텍스트 앵커 텍스트로 위치 결정
- 멀티파일: `*** Add File:`, `*** Delete File:`, `*** Move to:`
- GPT-5.1, GPT-5.2 전용 (OpenAI V4A diff 형식)

#### 9.2.2 Diff 표시 방식

```
Cline Diff 아키텍처:
┌─────────────────────────────────────────────────┐
│ VS Code Native Diff Editor (vscode.diff 명령)    │
│                                                   │
│  ┌──────────────┐  ┌──────────────────────────┐  │
│  │ 원본 (읽기전용) │  │ 제안 (편집 가능)          │  │
│  │ cline-diff:   │  │ 실제 파일 URI            │  │
│  │ URI 스킴      │  │                          │  │
│  │ (base64 원본)  │  │ ← 사용자 직접 수정 가능    │  │
│  └──────────────┘  └──────────────────────────┘  │
│                                                   │
│  [DecorationController]                           │
│  ├── fadedOverlay: 미생성 영역 반투명 오버레이       │
│  └── activeLine: 현재 스트리밍 중인 라인 하이라이트   │
└─────────────────────────────────────────────────┘
```

- **Side-by-Side**: 왼쪽(원본 읽기전용) / 오른쪽(제안, 편집가능)
- **스트리밍 실시간 표시**: `DiffViewProvider.update(partialContent)` 반복 호출
  - fadedOverlay: 아직 생성 안 된 영역 반투명 처리
  - activeLine: 현재 스트리밍 중인 라인 강조
  - 대규모 변경: 60fps 10단계 스무스 스크롤 애니메이션
- **사용자 편집 감지**: Approve 시 AI 제안 vs 실제 저장 내용 diff → LLM에 피드백
- **cline-diff: URI 스킴**: 원본을 base64로 URI 쿼리에 임베딩 (임시 파일 불필요)

#### 9.2.3 Undo/Keep (Accept/Reject)

| 동작 | 방법 | 결과 |
|------|------|------|
| **Approve** | Webview 버튼 | `saveChanges()` → 파일 저장, 사용자 수정 감지, diff 닫힘 |
| **Reject** | Webview 버튼 | `revertChanges()` → 변경 폐기, 파일 원본 유지, diff 닫힘 |
| **편집 후 Approve** | 오른쪽 패널 수정 → Approve | 수정된 내용 저장, user_edits diff를 LLM에 피드백 |

- **개별 변경 Accept/Reject**: **불가능** — 도구 호출 단위로 전체 승인/거부
- **Approve 후 Undo**: **Shadow Git 체크포인트**로 롤백 가능
- **Auto-Approve 모드**: 카테고리별 자동 승인 설정 가능

**Shadow Git 체크포인트 시스템:**
```
체크포인트 생성:
  매 도구 실행 완료 → Shadow Git commit
  저장소: {globalStorageUri}/checkpoints/{cwdHash}/.git/
  core.worktree = 실제 워크스페이스 (프로젝트 .git과 완전 분리)

3가지 복원 옵션:
  ┌─────────────────────┬──────────┬──────────┐
  │ 옵션                 │ 파일     │ 대화      │
  ├─────────────────────┼──────────┼──────────┤
  │ Restore Files       │ 복원     │ 유지      │
  │ Restore Task Only   │ 유지     │ 복원      │
  │ Restore Files&Task  │ 복원     │ 복원      │
  └─────────────────────┴──────────┴──────────┘

복원 방식: git reset --hard {commitHash}
```

---

### 9.3 Continue 파일 수정 상세

#### 9.3.1 도구별 수정 방식

**builtin_edit_existing_file (라인 범위 기반):**
```json
{
  "name": "builtin_edit_existing_file",
  "arguments": {
    "path": "README.md",
    "start_line": 3,
    "end_line": 5,
    "replacement": "## Quick-start\nRun `make dev`."
  }
}
```
- **라인 번호 기반** (1-indexed, inclusive) — Cline/OpenCode의 텍스트 매칭과 다른 접근
- AST 기반 타겟 에디트 (v1.0.9+): 대형 파일에서 정확한 위치 결정
- 약한 모델(Gemini Flash, DeepSeek)은 "Invalid apply state" 오류 빈발

**single_find_and_replace (문자열 매칭):**
```json
{
  "filepath": "src/app.ts",
  "old_string": "const x = 1;",
  "new_string": "const x = 2;",
  "replace_all": false
}
```
- Cline의 replace_in_file과 유사한 방식
- Instant Apply로 즉시 적용 (v1.5.8+, 스트리밍 불필요)

**Apply Model (2단계 적용):**
```
Chat/Agent 모델 → "코드 변경 의도" 생성
     ↓
Apply 모델 → "정밀한 적용 가능 diff" 생성
     ↓
에디터에 적용
```
- 전용 Apply 모델: Morph Fast Apply, Relace Instant Apply, FastApply 15B
- 생성 모델과 적용 모델 분리 (Cursor와 유사한 접근)

#### 9.3.2 Diff 표시 방식

```
Continue Diff 아키텍처:
┌────────────────────────────────────────────┐
│ 인라인 Vertical Diff (에디터 내부)            │
│                                             │
│  line 10: const x = 1;  ██ 빨강 + 취소선     │
│  line 10: const x = 2;  ██ 초록 배경         │
│  line 11: ...            (변경 없음)          │
│                                             │
│  [$(check) Keep] [$(close) Reject]  ← 거터  │
│                                             │
│  VerticalDiffManager가 관리                  │
│  스트리밍 중 실시간 decoration 업데이트          │
└────────────────────────────────────────────┘
```

- **인라인 표시**: Side-by-side가 아닌 **같은 에디터 내부**에 표시
- **초록 배경**: 추가/신규 라인
- **빨강 배경 + 취소선**: 삭제/기존 라인
- **스트리밍**: Edit 모드(Cmd+I)에서 토큰 단위 실시간 diff 업데이트
- **Instant Apply**: Find/Replace는 스트리밍 없이 즉시 적용 (v1.5.8+)

#### 9.3.3 Undo/Keep (Accept/Reject)

| 동작 | macOS 단축키 | 효과 |
|------|-------------|------|
| **Accept 블록** | `Alt+Cmd+Y` | 해당 hunk 승인 |
| **Reject 블록** | `Alt+Cmd+N` | 해당 hunk 거부 |
| **Accept 전체** | `Shift+Cmd+Enter` | 파일 내 모든 변경 승인 |
| **Reject 전체** | `Shift+Cmd+Delete` 또는 **`Cmd+Z`** | 파일 내 모든 변경 거부 |

- **개별 hunk Accept/Reject**: **가능** — 블록(hunk) 단위로 개별 결정
- **Cmd+Z = Reject**: `continue.diffVisible` 상태에서 Cmd+Z는 Reject All로 매핑 (직관적 UX)
- **Accept 후 Undo**: VS Code 네이티브 Undo 스택 의존 (별도 체크포인트 없음)
- **체크포인트**: **없음** — VS Code Undo + Git에 의존

---

### 9.4 OpenCode 파일 수정 상세

#### 9.4.1 도구별 수정 방식

**write (전체 파일 교체):**
```
LLM → 전체 파일 내용
  → 권한 확인 (allow/ask/deny)
  → 외부 수정 감지 (modTime vs lastRead)
  → 파일 히스토리 버전 생성 (SQLite)
  → 디스크 쓰기
  → LSP 진단 대기 → 오류시 LLM에 피드백
```
- modTime 체크로 외부 수정 감지 (충돌 방지)
- 쓰기 전후 파일 히스토리 SQLite 저장

**edit (정밀 수정):**
```
LLM → old_string / new_string 쌍
  → old_string이 파일에 정확히 1회 존재 확인
  → View 도구로 파일을 먼저 읽었는지 검증
  → 교체 적용
  → LSP 진단 → 오류시 자동 수정 시도
```
- old_string이 0회 또는 2회 이상 매칭되면 실패
- View 도구로 먼저 읽지 않은 파일은 수정 거부 (blind edit 방지)

**patch (멀티파일 원자적 변경):**
```
*** Update File: path/to/file
@@
 context line
-old line
+new line
 context line

*** Add File: path/to/new_file
+entire content

*** Delete File: path/to/old_file
```
- **원자적**: 전부 성공 또는 전부 실패 (하나라도 실패하면 전체 롤백)
- **Fuzz level 3**: 근접 매칭 허용 (정확한 위치에 없어도 주변에서 찾기)
- 각 파일별 개별 권한 확인 (파일 A는 allow, 파일 B는 deny 가능)

#### 9.4.2 Diff 표시 방식

```
OpenCode TUI Diff (Bubble Tea):
┌──────────────────────────────────────┐
│ Permission Dialog                     │
│                                      │
│  Tool: write                         │
│  Path: src/app.ts                    │
│  Action: write                       │
│                                      │
│  - old line 1                        │  ← 빨강
│  + new line 1                        │  ← 초록
│    context line                      │  ← 일반
│                                      │
│  [Allow] [Deny] [Allow All Session]  │
└──────────────────────────────────────┘
```

- **TUI 기반**: Bubble Tea + lipgloss 렌더링
- **권한 다이얼로그 내 diff 표시**: 승인 요청과 diff가 하나의 다이얼로그
- **색상**: 빨강(삭제), 초록(추가), 일반(컨텍스트)
- **구문 강조 없음**: 일반 텍스트 diff

#### 9.4.3 Undo/Keep (Accept/Reject)

| 동작 | 방법 | 결과 |
|------|------|------|
| **Allow** | 다이얼로그 선택 | 변경 적용, LSP 진단 실행 |
| **Deny** | 다이얼로그 선택 | 변경 거부, LLM에 거부 이유 전달 |
| **Allow Persistent** | 다이얼로그 선택 | 세션 동안 해당 도구+경로 자동 승인 |

- **개별 변경 Accept/Reject**: **불가능** — 파일 단위 (patch는 파일별 가능)
- **파일 히스토리**: SQLite에 수정 전/후 내용 저장
- **체크포인트**: 없음 (파일 히스토리가 대체)

**LSP 피드백 루프 (업계 유일):**
```
파일 수정 완료
     ↓
waitForLspDiagnostics() — 최대 5초 대기
     ↓
진단 결과 수집 (Error/Warning)
     ↓
오류 있음 → 도구 응답에 포함 → LLM 자동 수정 시도
오류 없음 → 정상 응답
```

---

### 9.5 CodePilot 파일 수정 상세

#### 9.5.1 도구별 수정 방식

**create_file (파일 생성):**
- 전체 파일 내용 작성
- InlineDiffManager에 전달 → 인라인 diff 표시
- 사용자 Keep/Undo 대기

**update_file (SEARCH/REPLACE, 4단계 퍼지매칭):**
```
SEARCH 블록 매칭 시도:
  1단계: Exact Match — 정확한 문자열 매칭
     ↓ 실패
  2단계: Line-Trimmed — 각 라인 앞뒤 공백 제거 후 매칭
     ↓ 실패
  3단계: Block Anchor — 첫줄+끝줄 앵커로 범위 특정
     ↓ 실패
  4단계: Structural — 정규식 구조 패턴 매칭
     ↓ 실패
  최종 실패 → 에러 응답
```

**HTML 엔티티/CDATA 클리닝:**
- LLM 출력의 `&lt;`, `&gt;`, `&amp;` 등 HTML 엔티티 자동 변환
- `<![CDATA[...]]>` 래핑 자동 제거
- `<file_content>` XML 태그 기반 커스텀 형식 (백틱 충돌 방지)

#### 9.5.2 Diff 표시 방식

```
CodePilot InlineDiffManager 아키텍처:
┌──────────────────────────────────────────────────┐
│ 에디터 내부 인라인 Diff (Cursor IDE 방식)           │
│                                                    │
│  [$(check) Keep] [$(close) Undo]  ← CodeLens       │
│  line 10: const x = 2;           ██ 초록 배경       │
│  ░░░░░░░ const x = 1; ░░░░░░░░   ← decoration.before│
│  line 11: ...                     (변경 없음)        │
│                                                    │
│  Shadow Document Pattern:                           │
│  ├── shadow: 작업 중 가상 문서 (LLM에게 보여줄 누적)    │
│  ├── disk: 실제 디스크 상태 (Accept 전)               │
│  └── checkpoint: AI 요청 직전 스냅샷 (Reject 기준점)   │
│                                                    │
│  change 상태 머신:                                   │
│  pending → accepted (Keep)                          │
│  pending → rejected (Undo)                          │
│  pending → dirty (사용자 직접 수정)                    │
└──────────────────────────────────────────────────┘
```

- **인라인 표시**: Side-by-side가 아닌 에디터 내부 데코레이션
- **초록 배경**: 추가/수정된 라인 (`diffEditor.insertedLineBackground`)
- **빨강 배경 + decoration.before**: 삭제된 라인 (`diffEditor.removedLineBackground`)
  - 삭제된 코드는 decoration.before로만 표시 (선택/편집 불가)
- **CodeLens**: 각 change마다 `$(check) Keep` / `$(close) Undo` 버튼
- **change 타입 표시**: modify → `~ Modified`, add → `+ Added`, delete → `- Deleted`

**Shadow Document 패턴:**
```
LLM 요청 시:
  getContentForEditing() → shadow 반환 (없으면 disk)
     ↓
LLM 응답 적용:
  shadow 업데이트 + decoration 표시
     ↓
Accept 시: disk = shadow, checkpoint 정리
Reject 시: shadow = checkpoint.beforeContent (복원)
```

#### 9.5.3 Undo/Keep (Accept/Reject)

| 동작 | 방법 | 결과 |
|------|------|------|
| **Keep** | CodeLens 클릭 | 해당 change 승인 — decoration 제거, 코드 유지 |
| **Undo** | CodeLens 클릭 | 해당 change 거부 — oldText로 복원 |
| **Keep All** | 명령 | 파일 내 모든 pending change 승인 |
| **Undo All** | 명령 | 파일 내 모든 pending change 거부 |

- **개별 change Accept/Reject**: **가능** — change ID 기반 개별 처리 (업계 최고 세분화)
- **Reject 로직**: offset 기반으로 현재 위치 계산 → newText를 oldText로 교체
- **Dirty 감지**: 사용자가 AI change 영역을 직접 수정하면 자동 무효화
- **Undo/Redo 감지**: VS Code Undo/Redo 시 pending diff 전체 폐기 (혼선 방지)
- **Formatter 보호**: formatter 실행 중/직후 변경은 무시 (diff 보호)

**AICheckpoint 시스템:**
```typescript
interface AICheckpoint {
    id: string;
    fileUri: string;
    beforeContent: string;  // AI 요청 직전 상태 (Reject 기준점)
    changes: InlineChange[];  // AI가 제안한 변경사항
    status: 'pending' | 'accepted' | 'rejected';
}
```
- 파일당 활성 체크포인트 1개
- Reject 시 `checkpoint.beforeContent`로 정확히 복원
- VS Code Undo 스택과 완전 분리 (독립적 상태 관리)

**FileTransactionManager:**
- 원자적 트랜잭션 (전부 성공 또는 전부 롤백)
- 최대 50개 이력 보관
- 파일별 버전 관리

---

### 9.6 종합 비교: Diff 표시 방식

| 항목 | CodePilot | Cline | Continue | OpenCode |
|------|-----------|-------|----------|----------|
| **표시 위치** | 에디터 내부 인라인 | VS Code Diff Editor (별도 탭) | 에디터 내부 인라인 | TUI 다이얼로그 |
| **표시 형태** | decoration 기반 | Side-by-side | decoration 기반 | 텍스트 diff |
| **추가 라인** | 초록 배경 | 초록 (VS Code 기본) | 초록 배경 | + 초록 텍스트 |
| **삭제 라인** | 빨강 + decoration.before | 빨강 (VS Code 기본) | 빨강 + 취소선 | - 빨강 텍스트 |
| **스트리밍** | X (완성 후 표시) | O (라인 단위 실시간) | O (토큰 단위 실시간) | X |
| **사용자 편집** | 에디터에서 직접 가능 | 오른쪽 패널 편집 가능 | 에디터에서 직접 가능 | 불가 |
| **CodeLens 버튼** | Keep/Undo (change별) | X (Webview 버튼) | X (키보드 단축키) | X (다이얼로그) |

### 9.7 종합 비교: Undo/Keep 방식

| 항목 | CodePilot | Cline | Continue | OpenCode |
|------|-----------|-------|----------|----------|
| **승인 단위** | **change (가장 세분화)** | 도구 호출 단위 | hunk 단위 | 파일 단위 |
| **Accept 방법** | CodeLens Keep 클릭 | Webview Approve | Alt+Cmd+Y | TUI Allow |
| **Reject 방법** | CodeLens Undo 클릭 | Webview Reject | Alt+Cmd+N 또는 Cmd+Z | TUI Deny |
| **Reject 복원** | checkpoint.beforeContent | 파일 미수정 (저장 안 됨) | 원본 라인 복원 | 파일 미수정 |
| **Accept 후 Undo** | VS Code Undo + checkpoint | **Shadow Git 롤백** | VS Code Undo | 파일 히스토리 |
| **체크포인트** | AICheckpoint (파일별) | **Shadow Git (워크스페이스)** | 없음 | 파일 히스토리 (SQLite) |
| **Dirty 감지** | O (사용자 수정 → 자동 무효화) | X | X | X |
| **Formatter 보호** | O (formatter 변경 무시) | X | X | X |

---

### 9.8 CodePilot 개선 방향

#### 강점 (유지/강화)

| # | 강점 | 설명 |
|---|------|------|
| 1 | **4단계 퍼지매칭** | 업계 유일, LLM의 부정확한 SEARCH 블록도 높은 확률로 매칭 |
| 2 | **change 단위 Accept/Reject** | 업계 최고 세분화 — Cline은 도구 단위, Continue는 hunk 단위 |
| 3 | **Shadow Document 패턴** | LLM에게 누적 상태 제공, Accept 전까지 disk 미반영 |
| 4 | **Dirty 자동 감지** | 사용자 편집 시 AI change 자동 무효화 (경쟁사 없음) |
| 5 | **Formatter 보호** | formatter/linter 변경으로 인한 diff 오염 방지 (경쟁사 없음) |
| 6 | **AICheckpoint + VS Code Undo 분리** | 두 시스템이 혼선 없이 독립 동작 |

#### 약점 (개선 필요)

| # | 약점 | 현재 | 개선 방향 | 참고 |
|---|------|------|----------|------|
| 1 | **스트리밍 Diff** | 완성 후 일괄 표시 | 토큰 단위 실시간 표시 | Cline, Continue |
| 2 | **Patch 도구** | 없음 | 멀티파일 원자적 패치 형식 | OpenCode, Cline |
| 3 | **LSP 피드백 루프** | 없음 | 수정 후 LSP 진단 → LLM 피드백 | OpenCode |
| 4 | **워크스페이스 체크포인트** | 파일별 AICheckpoint | Shadow Git 또는 전체 스냅샷 | Cline |
| 5 | **키보드 단축키** | CodeLens만 | Cmd+Z=Reject, Alt+Cmd+Y=Accept 등 | Continue |
| 6 | **파일 삭제 승인** | 즉시 실행 | 사용자 승인 후 실행 | Cline, OpenCode |
| 7 | **Apply 모델 분리** | 단일 모델 | 생성/적용 모델 분리 | Continue |
| 8 | **사용자 수정 피드백** | 없음 | Accept 시 user_edits를 LLM에 전달 | Cline |

---

## 10. 부록: 기타 경쟁사 요약

### 10.1 Aider (CLI, Python)

| 항목 | 내용 |
|------|------|
| **핵심** | CLI 기반, Git-native, Architect+Editor 2단계 |
| **Repo Map** | tree-sitter로 전체 코드 구조 요약 (토큰 절약) |
| **Edit Format** | 모델별 최적: Whole / Unified Diff / SEARCH-REPLACE |
| **Git 통합** | 모든 변경 자동 커밋, git reset으로 롤백 |
| **Lint+Test 루프** | 변경 → lint → 오류시 자동 수정 → test → 실패시 자동 수정 |
| **2-모델 전략** | Architect(대형: 설계) → Editor(소형: 코드 적용) |
| **CodePilot에 참고** | Repo Map, Lint+Test 자동 루프, 2-모델 전략 |

### 10.2 Cursor (독립 IDE)

| 항목 | 내용 |
|------|------|
| **핵심** | VS Code 포크 독립 IDE, 상용 |
| **Tab Autocomplete** | 커서 위치 기반 인라인 자동완성 (자체 모델) |
| **Agent (Composer)** | 멀티파일 자동 수정, 오류시 자동수정 루프 |
| **Background Agent** | 원격 VM에서 비동기 작업 실행 |
| **BugBot** | PR에 자동 버그 리뷰 |
| **.cursorrules** | 프로젝트별 행동 규칙 |
| **CodePilot에 참고** | Tab Autocomplete, Background Agent, BugBot |

### 10.3 Claude Code (CLI)

| 항목 | 내용 |
|------|------|
| **핵심** | Anthropic 공식 CLI, Claude 전용 |
| **Subagent** | 최대 10개 병렬 (Explore/Plan/Bash) |
| **TodoWrite** | 구조화된 작업 관리 (컨텍스트 유지) |
| **Hooks** | PreToolUse, PostToolUse, TaskStart 등 |
| **Memory** | ~/.claude/memory/ 영속 메모리 시스템 |
| **CLAUDE.md** | 프로젝트+글로벌 규칙 파일 |
| **AskUserQuestion** | LLM→사용자 질문 도구 (객관식/주관식) |
| **CodePilot에 참고** | Subagent 패턴, TodoWrite, Hooks, Memory |

### 10.4 GitHub Copilot

| 항목 | 내용 |
|------|------|
| **핵심** | GitHub 통합, 멀티 IDE 플러그인, 상용 |
| **Agent Mode** | 멀티파일 수정, 터미널 실행 |
| **Copilot Workspace** | Issue → Plan → Code → PR 전체 워크플로우 |
| **GitHub 통합** | PR, Issue, Actions와 네이티브 연동 |
| **CodePilot에 참고** | Issue→PR 워크플로우 자동화 |

### 10.5 Windsurf (독립 IDE)

| 항목 | 내용 |
|------|------|
| **핵심** | 독립 IDE, Cascade 에이전트, 상용 |
| **Write/Chat 분리** | Write 모드 (코드 수정) / Chat 모드 (대화) 명확 분리 |
| **Turbo 모드** | 사용자 승인 없이 연속 실행 |
| **CodePilot에 참고** | 모드 분리 UX |

---

> **이 문서 활용 방법:**
> 1. 새로운 기능 기획 시 → §6 매트릭스에서 경쟁사 현황 확인
> 2. 기능 우선순위 결정 시 → §7 로드맵에서 P0~P3 확인
> 3. 특정 경쟁사 기능 상세 → §2~4에서 구현 방식 확인
> 4. 파일 수정/Diff/Undo 비교 → §9에서 경쟁사별 상세 구현 + CodePilot 개선 방향
> 5. 코드 참고 시 → 각 섹션의 코드 경로/구현 설명 참조

---

> **핵심 결론:**
> CodePilot은 **FSM 에이전트 제어**, **4단계 퍼지매칭**, **다국어 지원**, **서버 설정 동기화**에서 독자적 강점을 보유합니다.
> 그러나 **네이티브 Tool Calling**, **@멘션 컨텍스트**, **도구 승인 세분화**, **체크포인트/롤백**, **토큰/비용 표시** 등 업계 표준 기능의 부재가 가장 큰 갭입니다.
> P0 (6개 항목)을 우선 구현하면 경쟁사 대비 기능 격차를 크게 줄일 수 있습니다.
