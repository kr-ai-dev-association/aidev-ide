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
