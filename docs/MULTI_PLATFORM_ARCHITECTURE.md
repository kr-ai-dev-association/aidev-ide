# CodePilot 멀티 플랫폼 전환 아키텍처 분석서

> **목적**: CodePilot을 VS Code 전용에서 **VS Code + JetBrains + CLI** 멀티 플랫폼으로 전환하기 위한
> 아키텍처 분석, 타 프로젝트 벤치마크, 구체적 마이그레이션 계획 수립
>
> **분석 기준일**: 2026-03-31
> **CodePilot 버전**: v1.0.37
> **분석 대상**: Continue, Cline, OpenCode, Aider, Cursor, oh-my-opencode

---

## 목차

- [Part A: CodePilot 현재 아키텍처 분석](#part-a-codepilot-현재-아키텍처-분석)
  - [A1. 전체 구조](#a1-전체-구조)
  - [A2. VS Code API 의존성 전수 조사](#a2-vs-code-api-의존성-전수-조사)
  - [A3. 기존 추상화 계층](#a3-기존-추상화-계층)
  - [A4. 분리 가능성 평가](#a4-분리-가능성-평가)
- [Part B: 타 코드 어시스턴트 멀티 플랫폼 아키텍처 분석](#part-b-타-코드-어시스턴트-멀티-플랫폼-아키텍처-분석)
  - [B1. Continue — 모노레포 + IDE 인터페이스 + 바이너리 패키징](#b1-continue--모노레포--ide-인터페이스--바이너리-패키징)
  - [B2. Cline — gRPC 프로토콜 + CLI 공유](#b2-cline--grpc-프로토콜--cli-공유)
  - [B3. OpenCode — Go 서비스 아키텍처 + pub/sub](#b3-opencode--go-서비스-아키텍처--pubsub)
  - [B4. Aider — IO 추상화 + 파일 워칭](#b4-aider--io-추상화--파일-워칭)
  - [B5. Cursor — VS Code 포크](#b5-cursor--vs-code-포크)
  - [B6. oh-my-opencode — 플러그인 아키텍처](#b6-oh-my-opencode--플러그인-아키텍처)
  - [B7. 종합 비교표](#b7-종합-비교표)
- [Part C: 추천 아키텍처 설계](#part-c-추천-아키텍처-설계)
  - [C1. 타겟 모노레포 구조](#c1-타겟-모노레포-구조)
  - [C2. IDE 인터페이스 설계](#c2-ide-인터페이스-설계)
  - [C3. 메시지 프로토콜 설계](#c3-메시지-프로토콜-설계)
  - [C4. JetBrains 바이너리 전략](#c4-jetbrains-바이너리-전략)
  - [C5. GUI 공유 전략](#c5-gui-공유-전략)
  - [C6. CLI 아키텍처](#c6-cli-아키텍처)
- [Part D: 마이그레이션 계획](#part-d-마이그레이션-계획)
  - [D1. 단계별 로드맵](#d1-단계별-로드맵)
  - [D2. 파일별 마이그레이션 매핑](#d2-파일별-마이그레이션-매핑)
  - [D3. 리스크 및 의사결정 포인트](#d3-리스크-및-의사결정-포인트)

---

# Part A: CodePilot 현재 아키텍처 분석

## A1. 전체 구조

```
codepilot/                          (257 TypeScript 파일)
├── src/
│   ├── extension.ts                 ← 메인 진입점 (850+ lines)
│   ├── commands/                    (6 파일) 커맨드 핸들러
│   ├── core/                        (200+ 파일) 핵심 비즈니스 로직
│   │   ├── completion/              인라인 자동완성
│   │   ├── config/                  설정 상수
│   │   ├── managers/                (16 하위 디렉토리, 180+ 파일)
│   │   │   ├── action/              액션 관리, 인텐트 탐지
│   │   │   ├── base/                BaseManager 기반 클래스
│   │   │   ├── context/             컨텍스트, 프롬프트, 파일 추적
│   │   │   ├── conversation/        대화/에이전트 루프
│   │   │   ├── diff/                Diff 뷰, 인라인 데코레이션
│   │   │   ├── error/               에러 관리, AutoFix
│   │   │   ├── execution/           프로세스/명령 실행
│   │   │   ├── file/                파일 뮤테이션
│   │   │   ├── hotload/             핫 로드 규칙
│   │   │   ├── investigation/       정보 수집
│   │   │   ├── model/               LLM API 클라이언트
│   │   │   ├── project/             프로젝트 탐지, Tree-sitter
│   │   │   ├── state/               상태, 설정, 세션
│   │   │   ├── task/                태스크 큐, 플래너
│   │   │   └── terminal/            터미널 관리
│   │   ├── mcp/                     MCP 프로토콜
│   │   ├── memory/                  영속 메모리
│   │   ├── orchestration/           멀티 에이전트
│   │   ├── tools/                   (35+ 파일) 도구 시스템
│   │   ├── utils/                   유틸리티
│   │   └── webview/                 웹뷰 브릿지
│   ├── services/                    (10 파일) 외부 서비스
│   └── webview/                     웹뷰 프로바이더
├── webview/                         (27 JS 파일) 프론트엔드 UI
│   ├── chat.js                      (129KB)
│   ├── settings.js                  (190KB)
│   ├── chat/                        채팅 모듈 (15 파일)
│   ├── settings/                    설정 모듈 (7 파일)
│   ├── shared/                      공유 유틸 (3 파일)
│   └── locales/                     i18n (7 언어)
└── package.json                     VS Code extension manifest
```

### 핵심 아키텍처 패턴

| 패턴 | 적용 위치 | 설명 |
|------|----------|------|
| **싱글톤 매니저** | 모든 매니저 | `getInstance()` 패턴, DI 대신 직접 참조 |
| **레지스트리** | ToolRegistry, ActionRegistry | 동적 등록/검색 |
| **FSM** | AgentStateManager | INVESTIGATION → EXECUTION → REVIEW → DONE |
| **전략** | LLM Providers, OS Adapters | 인터페이스 기반 다형성 |
| **팩토리** | OSAdapterFactory, LanguageParser | 플랫폼/언어별 생성 |
| **이벤트 드리븐** | WebviewBridge, MCPManager | 이벤트 기반 통신 |

---

## A2. VS Code API 의존성 전수 조사

### 전체 통계

| 위치 | vscode import 파일 수 | 비율 | 문제 수준 |
|------|---------------------|------|----------|
| `src/core/` | **64 파일** | 82% | **심각** — core는 IDE 무관해야 함 |
| `src/services/` | 7 파일 | 9% | **문제** — 서비스 계층은 IDE 무관해야 함 |
| `src/commands/` | 5 파일 | 6% | 정상 (IDE 전용 예상) |
| `src/webview/` | 2 파일 | 3% | 정상 (IDE 전용 예상) |
| **합계** | **78 파일** | 100% | |

### 사용된 VS Code API 목록 (62개)

```
vscode.CancellationToken          vscode.CodeLens
vscode.CodeLensProvider           vscode.Command
vscode.ConfigurationTarget        vscode.DecorationOptions
vscode.DiagnosticSeverity         vscode.Disposable
vscode.DocumentSymbol             vscode.Event
vscode.EventEmitter               vscode.ExtensionContext
vscode.FileSystemWatcher          vscode.FileType
vscode.Hover                      vscode.InlineCompletionContext
vscode.InlineCompletionItem       vscode.InlineCompletionItemProvider
vscode.Location                   vscode.LocationLink
vscode.Memento                    vscode.OutputChannel
vscode.OverviewRulerLane          vscode.Position
vscode.ProviderResult             vscode.Range
vscode.RelativePattern            vscode.Selection
vscode.StatusBarAlignment         vscode.SymbolInformation
vscode.SymbolKind                 vscode.TabInputText
vscode.Terminal                   vscode.TerminalLocation
vscode.TerminalOptions            vscode.TextDocument
vscode.TextDocumentContentProvider vscode.TextEditor
vscode.TextEditorDecorationType   vscode.TextEditorRevealType
vscode.ThemeColor                 vscode.ThemeIcon
vscode.Uri                        vscode.ViewColumn
vscode.Webview                    vscode.WebviewPanel
vscode.WebviewView                vscode.WebviewViewProvider
vscode.WebviewViewResolveContext   vscode.WorkspaceConfiguration
vscode.WorkspaceEdit              vscode.commands
vscode.diff                       vscode.env
vscode.extensions                 vscode.languages
vscode.window                     vscode.workspace
```

### 가장 많이 사용된 API Top 5

| API | 사용 횟수 | 주요 용도 |
|-----|----------|----------|
| `vscode.ExtensionContext` | 60+ | 상태 저장 (`globalState`, `workspaceState`, `secrets`) |
| `vscode.workspace` | 65+ | 파일 시스템, 설정, 워처 |
| `vscode.window` | 60+ | UI 다이얼로그, 알림, 에디터 접근 |
| `vscode.Uri` | 35+ | 경로 처리 |
| `vscode.commands` | 35+ | 커맨드 실행/등록 |

### 카테고리별 VS Code 의존성 상세

#### 1. Diff 시스템 (6 파일) — 🔴 가장 심각

| 파일 | vscode API 사용 | 핵심 의존성 |
|------|----------------|------------|
| `InlineDiffManager.ts` | `vscode.window` ×31, `vscode.Range` ×23, `vscode.workspace` ×14 | 에디터 데코레이션, 이벤트 리스너 |
| `VscodeDiffViewProvider.ts` | `vscode.window` ×3, `vscode.TextEditor`, `vscode.Range` | Diff 에디터 열기 |
| `DecorationController.ts` | `vscode.window` ×4, `vscode.Range` ×4 | 텍스트 장식 생성/적용 |
| `DiffCodeLensProvider.ts` | `vscode.CodeLensProvider`, `vscode.CodeLens`, `vscode.Range` | 인라인 수락/거절 버튼 |
| `DiffContentProvider.ts` | `vscode.TextDocumentContentProvider`, `vscode.Uri` | 가상 문서 제공 |
| `DiffManager.ts` | `vscode.commands.executeCommand("vscode.diff")` | Diff 에디터 열기 |

> **왜 심각한가**: 에디터 데코레이션, CodeLens, 가상 문서 등 VS Code 전용 UI 개념이
> JetBrains에는 동등한 API가 없거나 완전히 다른 방식으로 구현해야 함

#### 2. 터미널 시스템 (3 파일) — 🟠 높음

| 파일 | 핵심 의존성 |
|------|------------|
| `TerminalManager.ts` | `vscode.window.createTerminal()`, `vscode.Terminal` 직접 사용 |
| `TerminalSession.ts` | `vscode.Terminal` 래핑 |
| `types.ts` | `vscode.Uri`, `vscode.Terminal` 타입 참조 |

#### 3. 컨텍스트 시스템 (8 파일) — 🟠 높음

| 파일 | 핵심 의존성 |
|------|------------|
| `EditorContext.ts` | `vscode.window.activeTextEditor`, `vscode.Position`, `vscode.commands` |
| `ContextManager.ts` | `vscode.window`, `vscode.workspace` |
| `FileContextTracker.ts` | `vscode.workspace.onDidChangeTextDocument()` |
| `FileSearcher.ts` | `vscode.workspace`, `vscode.Uri` |
| `PromptComposer.ts` | `vscode.workspace.workspaceFolders` |

#### 4. 상태/설정 시스템 (5 파일) — 🟡 중간

| 파일 | 핵심 의존성 |
|------|------------|
| `StateManager.ts` | `context.globalState`, `context.workspaceState` |
| `SettingsManager.ts` | `vscode.workspace.getConfiguration()` ×15 |
| `SessionManager.ts` | `vscode.ExtensionContext` 저장소 |
| `ConfigurationService.ts` | `vscode.workspace.getConfiguration()` |

#### 5. IDE 도구 (2 파일) — 🟡 중간

| 파일 | 핵심 의존성 |
|------|------------|
| `LspToolHandler.ts` | `vscode.commands.executeCommand()` (정의 찾기, 참조, 호버 등 6개) |
| `ReadActiveFileToolHandler.ts` | `vscode.window.activeTextEditor` |

#### 6. 서비스 계층 (7 파일) — 🟡 중간

| 파일 | 핵심 의존성 |
|------|------------|
| `NotificationService.ts` | `vscode.window.showInfoMessage()` 직접 호출 |
| `AuthService.ts` | `vscode.window`, `vscode.ExtensionContext`, `vscode.Uri` |
| `OllamaApi.ts` | `vscode.ExtensionContext` |
| `CodePilotApiClient.ts` | `vscode.workspace` |

#### 7. 인라인 완성 (1 파일) — 🟡 중간

| 파일 | 핵심 의존성 |
|------|------------|
| `InlineCompletionProvider.ts` | `vscode.InlineCompletionItemProvider` 인터페이스 구현 |

#### 8. 대화/에이전트 (12 파일) — 🟢 낮음 (대부분 ExtensionContext만 사용)

대부분 `vscode.ExtensionContext`를 상태 저장용으로만 사용.
비즈니스 로직 자체는 IDE 무관하므로 Context 주입만 추상화하면 분리 가능.

#### 9. 프로젝트/코드 파싱 (3 파일) — 🟢 낮음

Tree-sitter 기반이므로 IDE 무관. `vscode.workspace`만 파일 경로 획득에 사용.

---

## A3. 기존 추상화 계층

CodePilot은 이미 4개의 추상화 인터페이스를 가지고 있어 멀티 플랫폼 전환에 유리:

### 1. OS 추상화 (`IOperatingSystemAdapter`)
```
├── DarwinAdapter    (macOS)
├── WindowsAdapter   (Windows)
├── LinuxAdapter     (Linux)
└── OSAdapterFactory (팩토리)
```
- 셸 탐지, 명령 정규화, 경로 처리, 프로세스 관리
- **상태**: ✅ 이미 완성됨, IDE 전환에 그대로 사용 가능

### 2. 코드 파서 추상화 (`ICodeParserAdapter`)
```
└── TreeSitterAdapter
    ├── JavaScript/TypeScript
    ├── Python, Go, Rust
    ├── Java, C, C++
    └── (WASM 기반)
```
- **상태**: ✅ IDE 무관, 그대로 사용 가능

### 3. LLM 프로바이더 추상화 (`ILLMProvider`)
```
├── OpenAICompatProvider
├── AnthropicProvider
├── GeminiProvider
└── AdminModelApi (백엔드 관리 모델)
```
- **상태**: ✅ IDE 무관, 그대로 사용 가능

### 4. 도구 핸들러 추상화 (`IToolHandler`)
```
├── 파일 도구 (10개): Read, Create, Update, Delete, List, Search...
├── 터미널 도구: RunCommand
├── IDE 도구: ReadActiveFile, LSP
├── 웹 도구: FetchUrl
├── 메모리 도구: Save, Delete
└── MCP 도구: Dynamic
```
- **상태**: ⚠️ 인터페이스는 있으나 일부 구현체가 `vscode.*` 직접 사용

---

## A4. 분리 가능성 평가

### Core로 이동 가능한 것 (IDE 무관)

| 모듈 | 파일 수 | 조건 |
|------|---------|------|
| LLM 관리 (`model/`) | 4 | 없음 — 이미 IDE 무관 |
| 대화 로직 (`conversation/`) | 12 | `ExtensionContext` → 스토리지 인터페이스로 대체 |
| 에이전트 상태 (`AgentStateManager`) | 1 | 없음 |
| 도구 시스템 (`tools/`) | 35+ | IDE 도구 2개만 어댑터 필요 |
| 액션 관리 (`action/`) | 10 | `vscode.workspace` → 파일시스템 인터페이스로 대체 |
| 에러 관리 (`error/`) | 10 | `vscode.window` 1개만 알림 인터페이스로 대체 |
| 태스크 관리 (`task/`) | 6 | `ExtensionContext` → 스토리지 인터페이스 |
| 프로젝트 탐지 (`project/`) | 20 | `vscode.workspace` → 파일시스템 인터페이스 |
| 오케스트레이션 (`orchestration/`) | 5 | `vscode.window` 1개만 대체 |
| MCP (`mcp/`) | 4 | `ExtensionContext` → 스토리지 인터페이스 |
| 메모리 (`memory/`) | 1 | `ExtensionContext` → 스토리지 인터페이스 |
| 프롬프트 (`context/prompts/`) | 20+ | `vscode.workspace` 1개만 대체 |
| **합계** | ~130 파일 | |

### IDE 전용으로 남아야 하는 것

| 모듈 | 파일 수 | 이유 |
|------|---------|------|
| Diff 시스템 (`diff/`) | 6 | 에디터 UI 깊이 결합 |
| 인라인 완성 (`completion/`) | 1 | IDE 전용 API |
| 웹뷰 (`webview/`) | 7 | IDE 전용 웹뷰 |
| 터미널 (`terminal/`) | 5 | IDE 터미널 API 사용 |
| 커맨드 (`commands/`) | 6 | IDE 커맨드 팔레트 |
| 에디터 컨텍스트 | 3 | 활성 에디터 접근 |
| **합계** | ~28 파일 | |

> **결론**: 전체 78개 vscode 의존 파일 중 **~50개는 인터페이스 추출만으로 분리 가능**.
> 나머지 ~28개는 IDE별 구현이 필요.

---

# Part B: 타 코드 어시스턴트 멀티 플랫폼 아키텍처 분석

## B1. Continue — 모노레포 + IDE 인터페이스 + 바이너리 패키징

> **GitHub**: [continuedev/continue](https://github.com/continuedev/continue)
> **지원 플랫폼**: VS Code, JetBrains (IntelliJ/WebStorm/PyCharm 등), CLI

### 모노레포 구조

```
continue/
├── core/                    ← 100% IDE 무관 비즈니스 로직
│   ├── index.d.ts           ← IDE 인터페이스 정의 (~40개 메서드)
│   ├── protocol/            ← 메시지 프로토콜 정의
│   │   ├── core.ts          ← ToCoreProtocol (~60+ 메시지 타입)
│   │   ├── ide.ts           ← ToIdeProtocol (~35 메시지 타입)
│   │   ├── coreWebview.ts
│   │   ├── ideCore.ts
│   │   ├── ideWebview.ts
│   │   ├── passThrough.ts   ← 자동 전달 리스트 (87개 타입)
│   │   └── messenger/       ← IMessenger 인터페이스
│   ├── autocomplete/        ← 자동완성 로직
│   ├── indexing/            ← 코드 인덱싱
│   ├── llm/                 ← LLM 프로바이더
│   ├── tools/               ← 도구 시스템
│   └── config/              ← 설정 관리
│
├── gui/                     ← React 웹뷰 (Vite 빌드, 모든 IDE 공유)
│   ├── src/
│   └── vite.config.ts
│
├── extensions/
│   ├── vscode/              ← VS Code 확장
│   │   ├── src/
│   │   │   ├── VsCodeIde.ts ← IDE 인터페이스 구현
│   │   │   └── extension.ts
│   │   └── package.json
│   │
│   ├── intellij/            ← JetBrains 플러그인 (Kotlin)
│   │   ├── src/main/kotlin/
│   │   │   ├── IntelliJIde.kt    ← IDE 인터페이스 구현
│   │   │   ├── CoreMessenger.kt  ← 바이너리 프로세스 관리
│   │   │   ├── IdeProtocolClient.kt ← 메시지 디스패치
│   │   │   └── ContinueBrowserService.kt ← JCEF 웹뷰
│   │   └── build.gradle.kts
│   │
│   └── cli/                 ← CLI 도구
│       └── CliIde.ts        ← IDE 인터페이스 최소 구현
│
├── binary/                  ← core를 독립 실행파일로 패키징
│   ├── src/index.ts
│   ├── build.js             ← esbuild → pkg 파이프라인
│   └── utils/bundle-binary.js
│
├── packages/                ← 공유 npm 패키지
│   ├── config-types/
│   ├── config-yaml/
│   ├── openai-adapters/
│   ├── llm-info/
│   ├── fetch/
│   └── terminal-security/
│
└── package.json             ← 루트 (concurrently로 병렬 빌드)
```

### IDE 인터페이스 (`core/index.d.ts`)

Continue의 핵심 추상화 — **이 인터페이스만 구현하면 새 IDE 지원 가능**:

```typescript
interface IDE {
  // === 파일 시스템 ===
  readFile(filepath: string): Promise<string>;
  writeFile(filepath: string, contents: string): Promise<void>;
  removeFile(filepath: string): Promise<void>;
  fileExists(filepath: string): Promise<boolean>;
  listDir(filepath: string): Promise<[string, FileType][]>;
  getFileStats(filepath: string): Promise<FileStats>;

  // === 에디터 상태 ===
  getCurrentFile(): Promise<{ path: string; contents: string } | undefined>;
  getOpenFiles(): Promise<string[]>;
  getPinnedFiles(): Promise<string[]>;
  showLines(filepath: string, startLine: number, endLine: number): Promise<void>;
  readRangeInFile(filepath: string, range: Range): Promise<string>;

  // === 에디터 동작 ===
  openFile(filepath: string): Promise<void>;
  showDiff(filepath: string, newContents: string, stepIndex: number): Promise<void>;
  showVirtualFile(name: string, contents: string): Promise<void>;
  saveFile(filepath: string): Promise<void>;

  // === Git ===
  getDiff(includeUnstaged: boolean): Promise<string>;
  getBranch(dir: string): Promise<string>;
  getTags(dir: string): Promise<string[]>;
  getRepoName(dir: string): Promise<string | undefined>;
  getGitRootPath(dir: string): Promise<string | undefined>;

  // === 실행 ===
  runCommand(command: string): Promise<void>;
  subprocess(command: string, cwd?: string): Promise<[string, string]>;
  getTerminalContents(): Promise<string>;

  // === 디버깅 ===
  getDebugLocals(threadIndex: number): Promise<string>;
  getTopLevelCallStackSources(threadIndex: number, depth: number): Promise<string[]>;
  getAvailableThreads(): Promise<Thread[]>;

  // === 코드 인텔리전스 ===
  gotoDefinition(location: Location): Promise<RangeInFile[]>;
  gotoTypeDefinition(location: Location): Promise<RangeInFile[]>;
  getReferences(location: Location): Promise<RangeInFile[]>;
  getDocumentSymbols(filepath: string): Promise<DocumentSymbol[]>;
  getSignatureHelp(location: Location): Promise<SignatureHelp | undefined>;

  // === 검색 ===
  getSearchResults(query: string): Promise<string>;
  getFileResults(query: string): Promise<string[]>;
  getProblems(filepath?: string): Promise<Problem[]>;

  // === 환경 ===
  getWorkspaceDirs(): Promise<string[]>;
  getIdeInfo(): Promise<IdeInfo>;  // { name: "vscode" | "jetbrains", version: string }
  getIdeSettings(): Promise<IdeSettings>;
  isTelemetryEnabled(): Promise<boolean>;
  isWorkspaceRemote(): Promise<boolean>;
  getUniqueId(): Promise<string>;

  // === UI ===
  showToast(type: ToastType, message: string): Promise<void>;
  openUrl(url: string): Promise<void>;
  getClipboardContent(): Promise<{ text: string; copiedAt: string }>;

  // === 보안 ===
  readSecrets(keys: string[]): Promise<Record<string, string>>;
  writeSecrets(secrets: Record<string, string>): Promise<void>;
}
```

### 3계층 메시지 아키텍처

```
┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│   GUI        │  ◄───►  │  Extension   │  ◄───►  │   Core       │
│  (React)     │         │ (IDE-specific)│         │ (비즈니스로직) │
└──────────────┘         └──────────────┘         └──────────────┘
     Webview              IDE 어댑터                 에이전트 엔진
```

프로토콜 방향:
- **`ToCoreProtocol`** (~60+ 타입): GUI/IDE → Core (채팅 요청, 자동완성, 설정 변경)
- **`FromCoreProtocol`**: Core → GUI/IDE (스트리밍 청크, 인덱싱 진행률)
- **`ToIdeProtocol`** (~35 타입): Core → IDE (파일 읽기/쓰기, 정의 찾기 등 IDE 동작 요청)
- **Pass-through**: 87개 메시지가 Extension을 거치지 않고 자동 전달

`IMessenger` 인터페이스:
- `invoke()` — 요청-응답 (타입화된 반환값)
- `send()` — 일방 통보 (fire-and-forget)

### VS Code vs JetBrains 연결 방식

| 항목 | VS Code | JetBrains |
|------|---------|-----------|
| **Core 실행** | 같은 Node.js 프로세스 (in-process) | 별도 바이너리 서브프로세스 (out-of-process) |
| **메신저** | `InProcessMessenger` (직접 메서드 호출) | `CoreMessenger` (TCP 또는 stdin/stdout) |
| **전송 형식** | 없음 (메모리 공유) | JSON 라인별 직렬화 |
| **GUI 렌더링** | VS Code Webview (`postMessage`) | JCEF (내장 Chromium) |
| **지연** | 최소 (in-process) | 직렬화 오버헤드 있음 |

### 바이너리 패키징 파이프라인

```
core/ TypeScript 소스
        │
        ▼
    esbuild (번들링)
        │
        ▼
  out/index.js (단일 JS 파일)
        │
        ▼
    pkg (네이티브 패키징)
        │
        ▼
  ┌─────────────────────────────┐
  │ darwin-arm64  │ darwin-x64  │
  │ linux-x64     │ win-x64     │
  └─────────────────────────────┘
```

추가 처리:
- `@lancedb` 플랫폼별 네이티브 모듈 다운로드
- `tree-sitter.wasm` 복사
- `onnxruntime-node` 불필요 바이너리 제거 (Linux CUDA/TensorRT)

JetBrains Gradle 빌드 시 `binary/bin` → 플러그인 JAR의 `core/` 디렉토리로 복사.

---

## B2. Cline — gRPC 프로토콜 + CLI 공유

> **GitHub**: [cline/cline](https://github.com/cline/cline)
> **지원 플랫폼**: VS Code, CLI

### 구조

```
cline/
├── src/                     ← Extension 백엔드 (Node.js)
│   ├── shared/proto/        ← 컴파일된 gRPC 타입
│   └── core/
│       ├── Controller.ts    ← 중앙 오케스트레이터
│       ├── Task.ts          ← 에이전트 태스크
│       ├── StateManager.ts  ← 상태 관리
│       └── ApiHandler.ts    ← LLM API
│
├── webview-ui/              ← React 프론트엔드 (Vite)
│   └── src/services/
│       └── grpc-client.ts   ← gRPC 클라이언트 스텁
│
├── cli/                     ← CLI (Ink 기반 터미널 UI)
│   ├── CliWebviewProvider.ts
│   ├── FileEditProvider.ts
│   └── StandaloneTerminalManager.ts
│
└── proto/                   ← Protocol Buffer 정의
    ├── cline/               (16 .proto 파일)
    │   ├── task.proto       ← TaskService RPC
    │   ├── state.proto      ← StateService RPC
    │   ├── ui.proto         ← UiService RPC
    │   ├── file.proto       ← FileService RPC
    │   ├── mcp.proto        ← McpService RPC
    │   ├── account.proto    ← AccountService RPC
    │   ├── browser.proto
    │   ├── checkpoints.proto
    │   ├── commands.proto
    │   ├── common.proto     ← 공유 타입 (Metadata, Empty 등)
    │   ├── models.proto
    │   ├── hooks.proto
    │   ├── slash.proto
    │   └── web.proto
    └── host/                (5 .proto 파일)
        ├── workspace.proto  ← WorkspaceService RPC
        ├── diff.proto
        ├── env.proto
        ├── testing.proto
        └── window.proto
```

### gRPC 프로토콜 상세

**전송 방식**: VS Code 내에서는 `postMessage`를 gRPC 전송층으로 사용 (`nice-grpc-web`).
웹뷰가 `WebviewMessage { type: "grpc_request", request_id }` 전송 →
Extension이 `ExtensionMessage { type: "grpc_response", request_id }` 응답.

**주요 서비스 (proto/cline/)**:

| Service | 주요 RPC |
|---------|---------|
| `TaskService` | `newTask`, `cancelTask`, `clearTask`, `showTaskWithId`, `askResponse`, `taskFeedback`, `getTaskHistory` |
| `StateService` | `getLatestState`, `subscribeToState` (서버 스트리밍), `updateSettings`, `resetState` |
| `UiService` | URL 내비게이션, UI 제어 |
| `FileService` | 파일/디렉토리 피커, 클립보드 |
| `McpService` | MCP 서버 연결, 설정 |

**호스트 환경 서비스 (proto/host/)**:

| Service | 주요 RPC |
|---------|---------|
| `WorkspaceService` | `getWorkspacePaths`, `getDiagnostics`, `executeCommandInTerminal`, `openFolder` |
| `DiffService` | Diff 보기 |
| `EnvService` | 환경 정보 |

**빌드**: `ts-proto`로 `.proto` → TypeScript 컴파일. `go_package`, `java_package` 옵션 포함 → 향후 다른 언어 지원 준비.

### CLI 아키텍처

- **UI**: Ink (React for terminal) + commander
- **Core 공유**: 같은 `Controller`/`Task`/`StateManager` 사용
- **어댑터**: `CliWebviewProvider`, `FileEditProvider`, `StandaloneTerminalManager`
- **렌더링**: Static/Dynamic 분할 (완료 메시지 Static, 스트리밍 Dynamic)
- **출력 모드**: Interactive (TTY), Headless (JSON 스트리밍), YOLO (-y 자동 승인)

---

## B3. OpenCode — Go 서비스 아키텍처 + pub/sub

> **GitHub**: [opencode-ai/opencode](https://github.com/opencode-ai/opencode)
> **지원 플랫폼**: CLI 전용 (TUI)

### 구조

```
opencode/internal/
├── app/                ← 의존성 주입 루트
├── llm/
│   ├── agent/          ← 에이전트 로직
│   ├── provider/       ← LLM 프로바이더
│   ├── models/         ← 모델 정의
│   ├── prompt/         ← 프롬프트 구성
│   └── tools/          ← 도구 (bash, edit, grep, glob, patch, view, write)
├── lsp/                ← 실제 LSP 클라이언트 (언어 서버와 통신)
│   ├── protocol/
│   └── watcher/
├── db/                 ← SQLite (sqlc 생성)
├── session/            ← 세션 관리
├── message/            ← 메시지 관리
├── history/            ← 히스토리
├── pubsub/             ← 제네릭 Broker[T] 이벤트 버스
└── tui/                ← Bubble Tea TUI
    ├── pages/
    ├── components/
    └── themes/
```

### 핵심 패턴

- **pub/sub 이벤트 버스**: `agent.Service`가 `pubsub.Subscriber[AgentEvent]`를 내장 →
  TUI가 Go 채널로 구독하여 에이전트 이벤트 (응답, 에러, 요약 진행) 수신
- **서비스 인터페이스**: `App` 구조체가 `session.Service`, `message.Service`, `agent.Service` 조립
- **단일 바이너리**: 모든 것이 하나의 Go 바이너리로 컴파일

> **CodePilot에 대한 시사점**: pub/sub 패턴은 단일 프로세스 내 디커플링에 효과적.
> 새로운 UI (웹, IDE 확장)는 같은 `pubsub.Broker`에 구독자로 추가하면 됨.

---

## B4. Aider — IO 추상화 + 파일 워칭

> **GitHub**: [paul-gauthier/aider](https://github.com/paul-gauthier/aider)
> **지원 플랫폼**: CLI, 브라우저 GUI, 모든 에디터 (파일 워칭)

### 구조

```
aider/
├── main.py                  ← CLI 진입점
├── coders/
│   ├── base_coder.py        ← 핵심 엔진 (2000+ lines)
│   ├── editblock_coder.py   ← 편집 전략 1
│   ├── wholefile_coder.py   ← 편집 전략 2
│   ├── udiff_coder.py       ← 편집 전략 3
│   ├── patch_coder.py       ← 편집 전략 4
│   └── architect_coder.py   ← 아키텍트 전략
├── io.py                    ← InputOutput 클래스 (핵심 추상화)
├── gui.py                   ← Streamlit 브라우저 GUI
├── llm.py                   ← litellm 기반 LLM
├── repo.py                  ← Git 통합
├── repomap.py               ← Tree-sitter 기반 코드맵
└── watch.py                 ← 파일 워칭 (IDE 연동)
```

### 멀티 플랫폼 전략

1. **IO 추상화**: `InputOutput` 클래스가 모든 사용자 상호작용 담당
   - CLI: `prompt_toolkit` 기반 터미널 IO
   - 브라우저: `CaptureIO` (출력을 리스트로 캡처 → Streamlit 렌더링)
   - 같은 `Coder` 인스턴스 재사용

2. **파일 워칭**: 에디터 플러그인 없이 IDE 연동
   - 사용자가 에디터에서 AI 주석 추가 → Aider가 파일 변경 감지 → 처리
   - 모든 에디터에서 작동 (VS Code, Vim, Emacs, JetBrains...)

> **CodePilot에 대한 시사점**: IO 추상화는 가장 단순한 멀티 플랫폼 접근법.
> 하지만 에디터 내 깊은 통합 (인라인 완성, Diff 뷰, CodeLens 등)이 불가능.

---

## B5. Cursor — VS Code 포크

> **지원 플랫폼**: 자체 에디터 (VS Code 포크)

### 아키텍처

| 컴포넌트 | 구현 |
|----------|------|
| 에디터 | VS Code 포크 (풀 소스 접근) |
| 코드 인덱싱 | `cursor-retrieval` 내부 확장 (272K 토큰 컨텍스트) |
| Shadow Workspace | 숨겨진 VS Code 윈도우에서 AI 편집 미리 린팅 |
| 토큰화 | `cursor-tokenize` 내부 확장 |
| Tab 완성 | 네이티브 제안 엔진에 직접 통합 |

### Shadow Workspace 패턴

```
사용자 에디터 ────────────────────────────────────
                      │
                      ▼ (AI 편집 생성)
              ┌────────────────┐
              │ Shadow Window  │  ← 숨겨진 VS Code 인스턴스
              │ (AI 편집 적용)  │
              │ (린터 실행)     │
              │ (타입 체커 실행) │
              └───────┬────────┘
                      │ (린트 통과?)
                      ▼
              사용자에게 편집 제안
```

> **CodePilot에 대한 시사점**: 포크는 가장 깊은 통합을 제공하지만 유지보수 부담이 막대.
> Shadow Workspace 패턴 자체는 확장으로도 구현 가능 (CodePilot이 이미 부분적으로 사용 중).

---

## B6. oh-my-opencode — 플러그인 아키텍처

> **GitHub**: [opensoft/oh-my-opencode](https://github.com/opensoft/oh-my-opencode)
> **성격**: OpenCode CLI의 플러그인 (독립 앱 아님)

### 구조

```
oh-my-opencode/
├── src/
│   ├── agents/        ← 전문 에이전트 (oracle, librarian, atlas, sisyphus...)
│   ├── tools/         ← 커스텀 도구 (ast-grep, LSP, glob, grep, delegate-task...)
│   ├── hooks/         ← 라이프사이클 훅 (25+ 개)
│   ├── features/      ← 배경 에이전트, 컨텍스트 주입, 스킬 로딩
│   ├── mcp/           ← MCP 서버
│   └── shared/        ← tmux 서브에이전트, 변형 해석
├── packages/          ← 플랫폼별 바이너리 (darwin-arm64, linux-x64, windows-x64)
└── cli/               ← CLI 래퍼
```

### 핵심 패턴

- **훅 기반 아키텍처**: 25+ 훅으로 에이전트 라이프사이클 가로챔
  (pre-message, post-response, error-recovery, compaction 등)
- **전문 에이전트 오케스트레이션**: `delegate-task`/`call-omo-agent` 도구로 디스패치
- **LSP as a Tool**: 자체 LSP 클라이언트로 AI가 진단, 정의 찾기 등 활용

> **CodePilot에 대한 시사점**: 플러그인 인터페이스 (훅, 도구, 에이전트)를 정의하면
> 커뮤니티/팀이 코어를 건드리지 않고 확장 가능. CodePilot의 `HotLoadManager`가 이미 유사한 역할.

---

## B7. 종합 비교표

| 항목 | Continue | Cline | OpenCode | Aider | Cursor | oh-my-opencode |
|------|----------|-------|----------|-------|--------|----------------|
| **언어** | TypeScript | TypeScript | Go | Python | TypeScript (포크) | TypeScript |
| **레포 전략** | 모노레포 | 모노레포 (3 workspace) | 단일 모듈 | 단일 패키지 | 단일 포크 | 플러그인 |
| **코어-UI 분리** | IDE 인터페이스 (~40 메서드) | gRPC proto 계약 | pub/sub 서비스 | IO 클래스 추상화 | 내부 확장 (포크) | 훅 시스템 |
| **통신 방식** | 타입 메시지 (invoke/send) | gRPC-over-postMessage | Go 채널 (in-process) | 메서드 호출 | 내부 (포크) | 플러그인 훅 |
| **VS Code** | ✅ 확장 | ✅ 확장 | ❌ | ❌ (파일워칭) | ✅ 포크 | ❌ |
| **JetBrains** | ✅ 바이너리+Kotlin | ❌ (proto 준비됨) | ❌ | ❌ (파일워칭) | ❌ | ❌ |
| **CLI** | ✅ | ✅ (Ink) | ✅ (Bubble Tea) | ✅ (prompt_toolkit) | ❌ | ✅ |
| **GUI 공유** | React (Vite) → 양쪽 | React (Vite) | N/A | Streamlit | N/A | N/A |
| **JetBrains 방식** | esbuild+pkg 바이너리 → stdin/stdout | N/A | N/A | N/A | N/A | N/A |

### 핵심 교훈

| # | 교훈 | 출처 |
|---|------|------|
| 1 | **IDE 인터페이스가 핵심** — ~40개 메서드 하나만 구현하면 새 IDE 지원 | Continue |
| 2 | **프로토콜 계약이 확장성의 열쇠** — gRPC proto로 타입 안전한 IPC | Cline |
| 3 | **바이너리 패키징으로 JVM ↔ Node.js 브릿지** — esbuild+pkg | Continue |
| 4 | **GUI는 한 번만 빌드** — React 웹뷰를 JCEF/WebView 양쪽에서 공유 | Continue, Cline |
| 5 | **CLI는 IO 추상화만으로 충분** — 같은 코어에 다른 IO 주입 | Aider, Cline |
| 6 | **포크는 최후의 수단** — 유지보수 부담이 기능 이점을 상회 | Cursor 교훈 |
| 7 | **pub/sub으로 UI 디커플링** — 새 프론트엔드는 구독자 추가 | OpenCode |

---

# Part C: 추천 아키텍처 설계

## C1. 타겟 모노레포 구조

Continue의 검증된 패턴을 기반으로 CodePilot에 맞게 조정:

```
codepilot/
│
├── packages/
│   │
│   ├── core/                          ← IDE 무관 비즈니스 로직 (~130 파일)
│   │   ├── protocol/
│   │   │   ├── IdeInterface.ts        ← IDE 추상화 인터페이스
│   │   │   ├── ToCoreProtocol.ts      ← GUI/IDE → Core 메시지
│   │   │   ├── FromCoreProtocol.ts    ← Core → GUI/IDE 메시지
│   │   │   ├── ToIdeProtocol.ts       ← Core → IDE 동작 요청
│   │   │   └── IMessenger.ts          ← 메신저 인터페이스
│   │   ├── managers/
│   │   │   ├── conversation/          (ConversationManager, AgentState...)
│   │   │   ├── context/               (ContextManager, PromptBuilder...)
│   │   │   ├── model/                 (LLMApiClient, LLMManager...)
│   │   │   ├── action/                (ActionManager, IntentDetector...)
│   │   │   ├── error/                 (ErrorManager, AutoFix...)
│   │   │   ├── task/                  (TaskManager, PlanManager...)
│   │   │   ├── execution/             (ExecutionManager, OS어댑터...)
│   │   │   ├── project/               (ProjectManager, TreeSitter...)
│   │   │   ├── hotload/               (HotLoadManager)
│   │   │   ├── investigation/         (InvestigationManager)
│   │   │   └── file/                  (FileMutationManager)
│   │   ├── tools/
│   │   │   ├── IToolHandler.ts        ← 도구 인터페이스
│   │   │   ├── ToolRegistry.ts
│   │   │   ├── ToolExecutor.ts
│   │   │   ├── file/                  (Read, Create, Update, Delete, Search...)
│   │   │   ├── terminal/              (RunCommand — IDE 인터페이스 통해)
│   │   │   ├── web/                   (FetchUrl)
│   │   │   ├── memory/               (Save, Delete)
│   │   │   └── mcp/                  (MCPToolHandler)
│   │   ├── services/
│   │   │   ├── llm/                   (프로바이더: OpenAI, Anthropic, Gemini, Ollama)
│   │   │   ├── api/                   (CodePilotApiClient)
│   │   │   └── auth/                  (AuthService — 순수 로직만)
│   │   ├── orchestration/             (멀티 에이전트)
│   │   ├── memory/                    (MemoryManager)
│   │   ├── mcp/                       (MCPManager)
│   │   ├── config/                    (상수, 패턴)
│   │   └── utils/                     (순수 유틸리티)
│   │
│   ├── gui/                           ← React 웹뷰 (Vite, 모든 IDE 공유)
│   │   ├── src/
│   │   │   ├── chat/                  (채팅 UI — 현재 webview/chat/ 마이그레이션)
│   │   │   ├── settings/              (설정 UI — 현재 webview/settings/)
│   │   │   ├── shared/                (테마, i18n, vscode-api 래퍼)
│   │   │   └── protocol/             (메시지 타입 import from @codepilot/core)
│   │   ├── locales/                   (ko, en, zh, es, de, fr, ja)
│   │   ├── vite.config.ts
│   │   └── package.json
│   │
│   └── shared/                        ← 공유 타입/유틸
│       ├── types.ts                   (공통 인터페이스, 열거형)
│       └── package.json
│
├── extensions/
│   │
│   ├── vscode/                        ← VS Code 확장 (~28 파일)
│   │   ├── src/
│   │   │   ├── VsCodeIde.ts           ← IdeInterface 구현
│   │   │   ├── extension.ts           ← 진입점 (현재의 축소판)
│   │   │   ├── providers/
│   │   │   │   ├── InlineCompletionProvider.ts
│   │   │   │   ├── DiffCodeLensProvider.ts
│   │   │   │   ├── DiffContentProvider.ts
│   │   │   │   └── ChatViewProvider.ts
│   │   │   ├── managers/
│   │   │   │   ├── VsCodeDiffManager.ts
│   │   │   │   ├── VsCodeTerminalManager.ts
│   │   │   │   └── VsCodeStateManager.ts
│   │   │   ├── commands/              (VS Code 커맨드 등록)
│   │   │   └── services/
│   │   │       └── VsCodeNotificationService.ts
│   │   └── package.json               (VS Code extension manifest)
│   │
│   ├── jetbrains/                     ← JetBrains 플러그인 (Kotlin)
│   │   ├── src/main/kotlin/com/banya/codepilot/
│   │   │   ├── JetBrainsIde.kt        ← IdeInterface 구현
│   │   │   ├── CoreBinaryManager.kt   ← 바이너리 라이프사이클 관리
│   │   │   ├── MessageProtocol.kt     ← JSON 메시지 직렬화
│   │   │   ├── WebviewPanel.kt        ← JCEF로 gui/ 렌더링
│   │   │   ├── DiffManager.kt         ← JetBrains Diff API
│   │   │   ├── TerminalManager.kt     ← JetBrains Terminal API
│   │   │   ├── CompletionProvider.kt  ← JetBrains 자동완성 API
│   │   │   └── ToolWindowFactory.kt   ← Tool Window 등록
│   │   ├── src/main/resources/
│   │   │   └── META-INF/plugin.xml
│   │   └── build.gradle.kts
│   │
│   └── cli/                           ← CLI 도구
│       ├── src/
│       │   ├── CliIde.ts              ← IdeInterface 최소 구현
│       │   ├── index.ts               ← 진입점
│       │   ├── tui/                   ← Ink 터미널 UI
│       │   │   ├── App.tsx
│       │   │   ├── ChatView.tsx
│       │   │   └── StatusBar.tsx
│       │   └── adapters/
│       │       ├── FileSystem.ts      ← Node.js fs 기반
│       │       ├── Terminal.ts        ← child_process 기반
│       │       └── Storage.ts         ← JSON 파일 기반
│       └── package.json
│
├── binary/                            ← Core 독립 실행파일 (JetBrains용)
│   ├── src/
│   │   └── index.ts                   ← Core 초기화 + TCP/stdin 리스너
│   ├── esbuild.config.ts              ← Core → 단일 JS 번들
│   └── package.json
│
├── package.json                       ← 루트 (npm workspaces)
├── turbo.json                         ← Turborepo 빌드 오케스트레이션
└── tsconfig.base.json                 ← 공유 TypeScript 설정
```

### npm workspaces 설정

```json
// 루트 package.json
{
  "name": "codepilot-monorepo",
  "private": true,
  "workspaces": [
    "packages/*",
    "extensions/*",
    "binary"
  ],
  "devDependencies": {
    "turbo": "^2.0.0",
    "typescript": "^5.4.0"
  }
}
```

---

## C2. IDE 인터페이스 설계

Continue의 검증된 패턴을 CodePilot 기능에 맞게 확장:

```typescript
// packages/core/protocol/IdeInterface.ts

export interface IdeInterface {
  // ===== 파일 시스템 =====
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  removeFile(path: string): Promise<void>;
  fileExists(path: string): Promise<boolean>;
  listDir(path: string): Promise<{ name: string; type: 'file' | 'dir' }[]>;
  getFileStats(path: string): Promise<{ size: number; mtime: number }>;
  watchFiles(pattern: string, callback: (event: FileChangeEvent) => void): Disposable;

  // ===== 에디터 상태 =====
  getActiveFile(): Promise<ActiveFileInfo | null>;
  getOpenFiles(): Promise<string[]>;
  getWorkspaceDirs(): Promise<string[]>;
  getSelection(): Promise<SelectionInfo | null>;
  getVisibleRange(path: string): Promise<Range | null>;

  // ===== 에디터 동작 =====
  openFile(path: string, options?: { line?: number; column?: number }): Promise<void>;
  revealLine(path: string, line: number): Promise<void>;
  applyEdit(path: string, edits: TextEdit[]): Promise<boolean>;

  // ===== Diff =====
  showDiff(original: string, modified: string, title?: string): Promise<void>;
  showInlineDiff(path: string, changes: InlineChange[]): Promise<void>;
  getInlineDiffResponse(path: string): Promise<'accept' | 'reject' | null>;

  // ===== 자동완성 =====
  showInlineCompletion(items: CompletionItem[]): Promise<void>;
  registerCompletionProvider(provider: CompletionProvider): Disposable;

  // ===== 터미널 =====
  createTerminal(options?: TerminalOptions): Promise<IdeTerminal>;
  runCommand(command: string, cwd?: string): Promise<CommandResult>;
  getTerminalContents(): Promise<string>;

  // ===== 코드 인텔리전스 (LSP) =====
  getDefinition(path: string, position: Position): Promise<Location[]>;
  getReferences(path: string, position: Position): Promise<Location[]>;
  getHoverInfo(path: string, position: Position): Promise<string | null>;
  getDocumentSymbols(path: string): Promise<DocumentSymbol[]>;
  getWorkspaceSymbols(query: string): Promise<SymbolInfo[]>;
  getDiagnostics(path: string): Promise<Diagnostic[]>;

  // ===== Git =====
  getDiff(options?: { staged?: boolean }): Promise<string>;
  getBranch(): Promise<string>;
  getRepoRoot(): Promise<string | null>;

  // ===== 검색 =====
  searchFiles(query: string, options?: SearchOptions): Promise<SearchResult[]>;
  findFiles(glob: string): Promise<string[]>;

  // ===== UI =====
  showNotification(message: string, type: 'info' | 'warning' | 'error'): void;
  showQuickPick<T extends QuickPickItem>(items: T[], options?: QuickPickOptions): Promise<T | undefined>;
  showInputBox(options?: InputBoxOptions): Promise<string | undefined>;
  setStatusBarMessage(text: string, timeout?: number): Disposable;

  // ===== 상태 저장 =====
  getState<T>(key: string): Promise<T | undefined>;
  setState<T>(key: string, value: T): Promise<void>;
  getSecret(key: string): Promise<string | undefined>;
  setSecret(key: string, value: string): Promise<void>;

  // ===== 설정 =====
  getConfig<T>(section: string): T | undefined;
  setConfig(section: string, value: any): Promise<void>;
  onConfigChange(callback: (section: string) => void): Disposable;

  // ===== 환경 =====
  getIdeInfo(): IdeInfo;  // { type: 'vscode' | 'jetbrains' | 'cli', version: string }
  getPlatform(): 'darwin' | 'linux' | 'win32';
  getShell(): string;
  openUrl(url: string): Promise<void>;
}

// ===== 관련 타입 =====
export interface ActiveFileInfo {
  path: string;
  content: string;
  languageId: string;
  selection?: SelectionInfo;
}

export interface SelectionInfo {
  text: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export interface InlineChange {
  startLine: number;
  endLine: number;
  originalContent: string;
  newContent: string;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface IdeTerminal {
  sendText(text: string): void;
  getOutput(): Promise<string>;
  dispose(): void;
}

export interface Disposable {
  dispose(): void;
}

export interface IdeInfo {
  type: 'vscode' | 'jetbrains' | 'cli';
  version: string;
  name: string;  // 'VS Code', 'IntelliJ IDEA', 'WebStorm', 'codepilot-cli'
}
```

### 구현 예시

```typescript
// extensions/vscode/src/VsCodeIde.ts
import * as vscode from 'vscode';
import { IdeInterface, ActiveFileInfo } from '@codepilot/core';

export class VsCodeIde implements IdeInterface {
  constructor(private context: vscode.ExtensionContext) {}

  async getActiveFile(): Promise<ActiveFileInfo | null> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return null;
    return {
      path: editor.document.uri.fsPath,
      content: editor.document.getText(),
      languageId: editor.document.languageId,
      selection: editor.selection.isEmpty ? undefined : {
        text: editor.document.getText(editor.selection),
        startLine: editor.selection.start.line,
        startColumn: editor.selection.start.character,
        endLine: editor.selection.end.line,
        endColumn: editor.selection.end.character,
      }
    };
  }

  async readFile(path: string): Promise<string> {
    const uri = vscode.Uri.file(path);
    const bytes = await vscode.workspace.fs.readFile(uri);
    return new TextDecoder().decode(bytes);
  }

  showNotification(message: string, type: 'info' | 'warning' | 'error'): void {
    switch (type) {
      case 'info': vscode.window.showInformationMessage(message); break;
      case 'warning': vscode.window.showWarningMessage(message); break;
      case 'error': vscode.window.showErrorMessage(message); break;
    }
  }

  async getState<T>(key: string): Promise<T | undefined> {
    return this.context.globalState.get(key);
  }

  async setState<T>(key: string, value: T): Promise<void> {
    await this.context.globalState.update(key, value);
  }

  getIdeInfo() {
    return { type: 'vscode' as const, version: vscode.version, name: 'VS Code' };
  }

  // ... 나머지 메서드 구현
}
```

```kotlin
// extensions/jetbrains/src/.../JetBrainsIde.kt
// IdeInterface의 Kotlin 측 구현은 CoreBinaryManager를 통해
// JSON 메시지로 core와 통신하며, IntelliJ Platform SDK를 사용

class JetBrainsIde(private val project: Project) {
    fun getActiveFile(): ActiveFileInfo? {
        val editor = FileEditorManager.getInstance(project).selectedTextEditor ?: return null
        val document = editor.document
        val file = FileDocumentManager.getInstance().getFile(document) ?: return null
        return ActiveFileInfo(
            path = file.path,
            content = document.text,
            languageId = file.fileType.name.lowercase()
        )
    }

    fun showNotification(message: String, type: String) {
        val notificationType = when (type) {
            "error" -> NotificationType.ERROR
            "warning" -> NotificationType.WARNING
            else -> NotificationType.INFORMATION
        }
        Notifications.Bus.notify(
            Notification("CodePilot", "CodePilot", message, notificationType),
            project
        )
    }

    // ... IntelliJ Platform SDK 사용한 나머지 구현
}
```

---

## C3. 메시지 프로토콜 설계

### 프로토콜 방향

```
┌───────────┐     ToCoreProtocol      ┌───────────┐
│           │  ──────────────────────► │           │
│  GUI /    │     FromCoreProtocol     │   Core    │
│  Extension│  ◄────────────────────── │           │
│           │                          │           │
│           │     ToIdeProtocol        │           │
│           │  ◄────────────────────── │           │
└───────────┘                          └───────────┘
```

### 메시지 타입 정의

```typescript
// packages/core/protocol/ToCoreProtocol.ts

export interface ToCoreProtocol {
  // 대화
  'chat/send': { message: string; attachments?: Attachment[] };
  'chat/cancel': void;
  'chat/clear': void;
  'chat/history': void;
  'chat/restore': { sessionId: string };

  // 자동완성
  'completion/request': { filepath: string; position: Position; prefix: string };
  'completion/accept': { completionId: string };
  'completion/cancel': void;

  // 도구 응답
  'tool/response': { toolCallId: string; approved: boolean };

  // 설정
  'config/update': { section: string; value: any };
  'config/sync': void;

  // 상태
  'state/get': void;
  'state/save-session': { name: string };

  // MCP
  'mcp/connect': { serverConfig: MCPServerConfig };
  'mcp/disconnect': { serverId: string };
}

// packages/core/protocol/FromCoreProtocol.ts

export interface FromCoreProtocol {
  // 스트리밍
  'chat/streaming': { chunk: string; messageId: string };
  'chat/complete': { messageId: string; response: AgentResponse };
  'chat/error': { error: string };

  // 도구 요청
  'tool/request': { toolCall: ToolCall; requiresApproval: boolean };
  'tool/result': { toolCallId: string; result: ToolResult };

  // 상태 업데이트
  'state/update': { agentPhase: AgentPhase; progress?: string };
  'state/metrics': { tokensUsed: number; cost: number };

  // 설정 동기화
  'config/changed': { section: string; value: any };
}

// packages/core/protocol/ToIdeProtocol.ts
// Core가 IDE에게 요청하는 동작 (IdeInterface 메서드와 1:1 매핑)

export interface ToIdeProtocol {
  'ide/readFile': { path: string };
  'ide/writeFile': { path: string; content: string };
  'ide/getActiveFile': void;
  'ide/openFile': { path: string; line?: number };
  'ide/showDiff': { original: string; modified: string };
  'ide/showInlineDiff': { path: string; changes: InlineChange[] };
  'ide/runCommand': { command: string; cwd?: string };
  'ide/getDefinition': { path: string; position: Position };
  'ide/getReferences': { path: string; position: Position };
  'ide/getDiagnostics': { path: string };
  'ide/showNotification': { message: string; type: 'info' | 'warning' | 'error' };
  'ide/getWorkspaceDirs': void;
  'ide/getConfig': { section: string };
  // ...
}
```

### 메신저 인터페이스

```typescript
// packages/core/protocol/IMessenger.ts

export interface IMessenger<TTo, TFrom> {
  // 요청-응답 (타입 안전)
  invoke<K extends keyof TTo>(
    method: K,
    params: TTo[K]
  ): Promise<ResponseType<K>>;

  // 일방 통보
  send<K extends keyof TFrom>(
    method: K,
    params: TFrom[K]
  ): void;

  // 이벤트 구독
  on<K extends keyof TTo>(
    method: K,
    handler: (params: TTo[K]) => Promise<ResponseType<K>>
  ): Disposable;
}
```

### 전송 구현별 차이

| 환경 | 구현 | 직렬화 |
|------|------|--------|
| VS Code (in-process) | `InProcessMessenger` — 직접 메서드 호출 | 없음 (메모리 참조) |
| JetBrains (out-of-process) | `StdioMessenger` — stdin/stdout 파이프 | JSON 라인 (newline-delimited) |
| CLI (in-process) | `InProcessMessenger` | 없음 |

---

## C4. JetBrains 바이너리 전략

### 패키징 파이프라인

```
packages/core/ ──────► esbuild ──────► binary/out/index.js ──────► pkg ──────► 네이티브 바이너리
                       (번들링)          (단일 JS)                    (패키징)
                                                                        │
                                                    ┌───────────────────┼───────────────────┐
                                                    │                   │                   │
                                              darwin-arm64        linux-x64          win-x64.exe
```

```typescript
// binary/esbuild.config.ts
import { build } from 'esbuild';

build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  outfile: 'out/index.js',
  external: [
    'web-tree-sitter',    // WASM이므로 번들 제외
    'tree-sitter-wasms',
  ],
  define: {
    'process.env.BINARY_MODE': '"true"',
  },
});
```

```typescript
// binary/src/index.ts
import { CoreEngine } from '@codepilot/core';
import { StdioTransport } from './transport/StdioTransport';
import { TcpTransport } from './transport/TcpTransport';

const mode = process.argv.includes('--tcp') ? 'tcp' : 'stdio';
const port = parseInt(process.env.CODEPILOT_PORT || '9418');

async function main() {
  const transport = mode === 'tcp'
    ? new TcpTransport(port)
    : new StdioTransport();

  const engine = new CoreEngine();
  await engine.initialize(transport);

  console.error(`[codepilot-core] Running in ${mode} mode`);
}

main().catch(console.error);
```

### JetBrains 플러그인 통신

```kotlin
// extensions/jetbrains/.../CoreBinaryManager.kt
class CoreBinaryManager(private val project: Project) {
    private var process: Process? = null
    private val gson = Gson()

    fun start() {
        val binaryPath = getBinaryPath()  // plugin jar 내 core/ 디렉토리에서 추출
        val builder = ProcessBuilder(binaryPath)
            .directory(project.basePath?.let { File(it) })
            .redirectErrorStream(false)

        process = builder.start()

        // stdin/stdout으로 JSON 메시지 교환
        startMessageReader()
    }

    fun send(method: String, params: Any?) {
        val message = JsonObject().apply {
            addProperty("method", method)
            add("params", gson.toJsonTree(params))
            addProperty("id", UUID.randomUUID().toString())
        }
        process?.outputStream?.let { out ->
            out.write((gson.toJson(message) + "\n").toByteArray())
            out.flush()
        }
    }

    private fun startMessageReader() {
        CoroutineScope(Dispatchers.IO.limitedParallelism(4)).launch {
            process?.inputStream?.bufferedReader()?.useLines { lines ->
                lines.forEach { line ->
                    val message = gson.fromJson(line, JsonObject::class.java)
                    handleMessage(message)
                }
            }
        }
    }
}
```

---

## C5. GUI 공유 전략

### 현재 상태

현재 CodePilot의 웹뷰는 **바닐라 JavaScript** (chat.js 129KB, settings.js 190KB)로 작성.

### 전환 옵션

| 옵션 | 장점 | 단점 |
|------|------|------|
| **A. React 마이그레이션 (권장)** | Vite 빌드, 컴포넌트 재사용, Continue/Cline 검증 | 마이그레이션 공수 |
| **B. 현재 바닐라 JS 유지** | 변경 없음 | 모듈화 어려움, IDE별 별도 작업 필요 |
| **C. Web Component** | 프레임워크 무관 | 생태계 빈약, 복잡한 상태 관리 |

### React 마이그레이션 시 구조

```
packages/gui/
├── src/
│   ├── App.tsx
│   ├── chat/
│   │   ├── ChatView.tsx           ← webview/chat.js 마이그레이션
│   │   ├── MessageList.tsx
│   │   ├── MessageInput.tsx
│   │   ├── CodeBlock.tsx          ← webview/chat/codeBlock.js
│   │   ├── StreamingMessage.tsx   ← webview/chat/streaming.js
│   │   ├── AtMentions.tsx         ← webview/chat/at-mentions.js
│   │   └── SlashCommands.tsx      ← webview/chat/slash-commands.js
│   ├── settings/
│   │   ├── SettingsView.tsx       ← webview/settings.js 마이그레이션
│   │   ├── ApiKeySettings.tsx
│   │   ├── OllamaSettings.tsx
│   │   └── McpSettings.tsx
│   ├── shared/
│   │   ├── ThemeProvider.tsx      ← webview/shared/theme-manager.js
│   │   ├── I18nProvider.tsx       ← webview/shared/language-manager.js
│   │   └── IdeApiContext.tsx      ← 플랫폼별 API 주입
│   └── protocol/
│       └── useMessenger.ts        ← Core 통신 React 훅
├── locales/                       ← 그대로 이동
└── vite.config.ts
```

### IDE별 GUI 렌더링

| IDE | 렌더링 방식 |
|-----|------------|
| VS Code | `WebviewViewProvider`에서 Vite 빌드 HTML 로드, `postMessage`로 통신 |
| JetBrains | JCEF (`JBCefBrowser`)에서 같은 빌드 HTML 로드, `CefMessageRouter`로 통신 |
| CLI | GUI 없음 — Ink TUI 사용 (별도 구현) |

---

## C6. CLI 아키텍처

### 설계

```typescript
// extensions/cli/src/CliIde.ts
import { IdeInterface, ActiveFileInfo, CommandResult } from '@codepilot/core';
import * as fs from 'fs/promises';
import { execSync, spawn } from 'child_process';

export class CliIde implements IdeInterface {
  private cwd: string;

  constructor(cwd: string = process.cwd()) {
    this.cwd = cwd;
  }

  // 파일 시스템 — Node.js fs 직접 사용
  async readFile(path: string): Promise<string> {
    return fs.readFile(path, 'utf-8');
  }

  async writeFile(path: string, content: string): Promise<void> {
    await fs.writeFile(path, content, 'utf-8');
  }

  // 에디터 상태 — CLI에는 에디터가 없으므로 최소 구현
  async getActiveFile(): Promise<ActiveFileInfo | null> {
    return null;  // CLI에는 활성 파일 개념 없음
  }

  async getOpenFiles(): Promise<string[]> {
    return [];  // CLI에는 열린 파일 없음
  }

  // 터미널 — child_process 사용
  async runCommand(command: string, cwd?: string): Promise<CommandResult> {
    return new Promise((resolve) => {
      const proc = spawn('sh', ['-c', command], {
        cwd: cwd || this.cwd,
      });
      let stdout = '', stderr = '';
      proc.stdout.on('data', (d) => stdout += d);
      proc.stderr.on('data', (d) => stderr += d);
      proc.on('close', (code) => resolve({ stdout, stderr, exitCode: code || 0 }));
    });
  }

  // LSP — CLI에서는 ripgrep/tree-sitter 직접 사용으로 대체
  async getDefinition(): Promise<Location[]> { return []; }
  async getReferences(): Promise<Location[]> { return []; }

  // Diff — CLI에서는 터미널 diff 출력
  async showDiff(original: string, modified: string): Promise<void> {
    // 터미널에 컬러 diff 출력
    console.log(createColorDiff(original, modified));
  }

  // UI — 터미널 출력
  showNotification(message: string, type: 'info' | 'warning' | 'error'): void {
    const prefix = { info: 'ℹ', warning: '⚠', error: '✖' }[type];
    console.log(`${prefix} ${message}`);
  }

  // 상태 — JSON 파일 기반
  async getState<T>(key: string): Promise<T | undefined> {
    const statePath = path.join(this.getDataDir(), 'state.json');
    const state = JSON.parse(await fs.readFile(statePath, 'utf-8').catch(() => '{}'));
    return state[key];
  }

  getIdeInfo() {
    return { type: 'cli' as const, version: '1.0.0', name: 'codepilot-cli' };
  }
}
```

### TUI (Ink 기반)

```
┌─ CodePilot CLI ─────────────────────────────────────┐
│                                                       │
│  User: 이 함수에 에러 핸들링 추가해줘                     │
│                                                       │
│  ┌─ Agent ───────────────────────────────────────┐   │
│  │ 📂 Reading src/utils/api.ts                    │   │
│  │ ✏️  Updating src/utils/api.ts                   │   │
│  │ 🔍 Running tests...                            │   │
│  │ ✅ All 12 tests passed                         │   │
│  │                                                │   │
│  │ try-catch 블록을 추가하고 커스텀 에러 타입으로      │   │
│  │ 래핑했습니다. 테스트도 통과합니다.                  │   │
│  └────────────────────────────────────────────────┘   │
│                                                       │
│  > _                                                  │
│                                                       │
│  [Tab] 자동완성  [Ctrl+C] 취소  [/help] 도움말          │
└───────────────────────────────────────────────────────┘
```

---

# Part D: 마이그레이션 계획

## D1. 단계별 로드맵

### Phase 0: 사전 준비 (1~2주)

| 작업 | 설명 |
|------|------|
| 모노레포 설정 | npm workspaces + Turborepo 설정 |
| tsconfig 분리 | `tsconfig.base.json` + 패키지별 tsconfig |
| 빌드 파이프라인 | 기존 webpack → 패키지별 빌드 (core: tsc, vscode: esbuild) |
| CI 업데이트 | 모노레포 빌드/테스트 파이프라인 |

### Phase 1: IDE 인터페이스 정의 + Core 추출 (3~4주)

| 작업 | 영향 파일 | 설명 |
|------|----------|------|
| `IdeInterface` 정의 | 신규 1 파일 | ~45개 메서드 정의 |
| 메시지 프로토콜 정의 | 신규 4 파일 | ToCoreProtocol, FromCoreProtocol, ToIdeProtocol, IMessenger |
| `BaseManager` 리팩토링 | 1 파일 | `vscode.ExtensionContext` → `IdeInterface` 주입 |
| 스토리지 추상화 | 5+ 파일 | `context.globalState` → `ide.getState()`/`ide.setState()` |
| 설정 추상화 | 5+ 파일 | `vscode.workspace.getConfiguration()` → `ide.getConfig()` |
| 파일 시스템 추상화 | 10+ 파일 | `vscode.workspace.fs` → `ide.readFile()`/`ide.writeFile()` |
| 알림 추상화 | 7+ 파일 | `vscode.window.showMessage()` → `ide.showNotification()` |
| 에디터 상태 추상화 | 8+ 파일 | `vscode.window.activeTextEditor` → `ide.getActiveFile()` |
| **합계** | **~50 파일 수정** | |

#### 핵심 리팩토링 패턴

```typescript
// BEFORE (현재)
import * as vscode from 'vscode';

export class StateManager {
  private context: vscode.ExtensionContext;

  async getState(key: string) {
    return this.context.globalState.get(key);
  }

  async setState(key: string, value: any) {
    await this.context.globalState.update(key, value);
  }
}

// AFTER (인터페이스 추출 후)
import { IdeInterface } from '@codepilot/core';

export class StateManager {
  private ide: IdeInterface;

  async getState<T>(key: string): Promise<T | undefined> {
    return this.ide.getState(key);
  }

  async setState<T>(key: string, value: T): Promise<void> {
    await this.ide.setState(key, value);
  }
}
```

### Phase 2: 패키지 분리 (2~3주)

| 작업 | 설명 |
|------|------|
| `packages/core/` 생성 | core 모듈 이동 + package.json |
| `packages/shared/` 생성 | 공유 타입 추출 |
| `extensions/vscode/` 생성 | IDE 전용 파일 이동 + `VsCodeIde` 구현 |
| import 경로 업데이트 | 상대 경로 → 패키지 경로 (`@codepilot/core`) |
| 빌드 검증 | VS Code 확장이 기존과 동일하게 동작하는지 |

### Phase 3: GUI React 마이그레이션 (3~4주)

| 작업 | 설명 |
|------|------|
| `packages/gui/` 생성 | Vite + React 프로젝트 셋업 |
| 채팅 UI 마이그레이션 | `webview/chat.js` (129KB) → React 컴포넌트 |
| 설정 UI 마이그레이션 | `webview/settings.js` (190KB) → React 컴포넌트 |
| i18n 마이그레이션 | `webview/locales/` → React i18n |
| VS Code 웹뷰 연결 | `ChatViewProvider`에서 React 빌드 로드 |

### Phase 4: CLI 확장 (2~3주)

| 작업 | 설명 |
|------|------|
| `extensions/cli/` 생성 | `CliIde` 구현 |
| Ink TUI 개발 | 채팅, 상태, 도구 출력 |
| npm 패키지 설정 | `npx codepilot` 실행 가능하게 |
| 테스트 | 전체 대화 플로우 검증 |

### Phase 5: 바이너리 패키징 (1~2주)

| 작업 | 설명 |
|------|------|
| `binary/` 셋업 | esbuild 번들링 |
| pkg 패키징 | darwin-arm64, linux-x64, win-x64 |
| TCP/stdio 전송 | `StdioTransport`, `TcpTransport` 구현 |
| 통합 테스트 | 바이너리 → stdin/stdout → 메시지 교환 검증 |

### Phase 6: JetBrains 플러그인 (4~6주)

| 작업 | 설명 |
|------|------|
| Kotlin 프로젝트 셋업 | Gradle + IntelliJ Platform Plugin |
| `JetBrainsIde` 구현 | IdeInterface의 Kotlin 구현 |
| `CoreBinaryManager` | 바이너리 라이프사이클 관리 |
| JCEF 웹뷰 | `packages/gui/` 빌드를 JCEF에서 렌더링 |
| Diff 통합 | JetBrains Diff API 사용 |
| 터미널 통합 | JetBrains Terminal API |
| 자동완성 | JetBrains Completion API |
| Tool Window | 사이드바 등록 |

### 전체 타임라인

```
Phase 0 ████░░░░░░░░░░░░░░░░░░░░░░░░░░  (2주)
Phase 1 ░░░░████████░░░░░░░░░░░░░░░░░░  (4주)
Phase 2 ░░░░░░░░░░░░████░░░░░░░░░░░░░░  (3주)
Phase 3 ░░░░░░░░░░░░░░░░████████░░░░░░  (4주)  ← Phase 2 이후
Phase 4 ░░░░░░░░░░░░░░░░████░░░░░░░░░░  (3주)  ← Phase 2와 병렬 가능
Phase 5 ░░░░░░░░░░░░░░░░░░░░████░░░░░░  (2주)
Phase 6 ░░░░░░░░░░░░░░░░░░░░░░░░██████████████  (6주)
────────────────────────────────────────────────
총 기간: ~16-20주 (핵심 인력 2-3명 기준)
```

---

## D2. 파일별 마이그레이션 매핑

### `packages/core/`로 이동 (IDE 무관 로직)

| 현재 경로 | 새 경로 | 변경 사항 |
|----------|---------|----------|
| `src/core/managers/conversation/*` | `packages/core/managers/conversation/*` | `ExtensionContext` → `IdeInterface` |
| `src/core/managers/model/*` | `packages/core/managers/model/*` | 변경 없음 |
| `src/core/managers/action/*` | `packages/core/managers/action/*` | `vscode.workspace` → `ide.readFile()` |
| `src/core/managers/error/*` | `packages/core/managers/error/*` | `vscode.window` → `ide.showNotification()` |
| `src/core/managers/task/*` | `packages/core/managers/task/*` | `ExtensionContext` → `ide.getState()` |
| `src/core/managers/execution/*` | `packages/core/managers/execution/*` | `vscode.workspace` → `ide.getWorkspaceDirs()` |
| `src/core/managers/project/*` | `packages/core/managers/project/*` | `vscode.Uri/workspace` → `ide.readFile()` |
| `src/core/managers/hotload/*` | `packages/core/managers/hotload/*` | `ExtensionContext` → `ide.getState()` |
| `src/core/managers/investigation/*` | `packages/core/managers/investigation/*` | `ExtensionContext` → `ide.getState()` |
| `src/core/managers/file/*` | `packages/core/managers/file/*` | `ExtensionContext` → `ide.getState()` |
| `src/core/managers/base/BaseManager.ts` | `packages/core/managers/base/BaseManager.ts` | `ExtensionContext` → `IdeInterface` |
| `src/core/tools/file/*` | `packages/core/tools/file/*` | `vscode.workspace` → `ide.readFile()` |
| `src/core/tools/terminal/*` | `packages/core/tools/terminal/*` | `vscode.Uri` → 문자열 경로 |
| `src/core/tools/web/*` | `packages/core/tools/web/*` | 변경 없음 |
| `src/core/tools/memory/*` | `packages/core/tools/memory/*` | 변경 없음 |
| `src/core/tools/mcp/*` | `packages/core/tools/mcp/*` | `vscode.window` → `ide.showNotification()` |
| `src/core/mcp/*` | `packages/core/mcp/*` | `ExtensionContext` → `ide.getState()` |
| `src/core/memory/*` | `packages/core/memory/*` | `ExtensionContext` → `ide.getState()` |
| `src/core/orchestration/*` | `packages/core/orchestration/*` | `vscode.window` → `ide.showNotification()` |
| `src/core/config/*` | `packages/core/config/*` | 변경 없음 |
| `src/core/utils/*` | `packages/core/utils/*` | `ExtensionContext` 참조 제거 |
| `src/services/llm/*` | `packages/core/services/llm/*` | `ExtensionContext` → `ide.getState()` |
| `src/services/api/*` | `packages/core/services/api/*` | `vscode.workspace` → `ide.getConfig()` |

### `extensions/vscode/`에 유지 (IDE 전용)

| 현재 경로 | 새 경로 | 역할 |
|----------|---------|------|
| `src/extension.ts` | `extensions/vscode/src/extension.ts` | 진입점 (축소됨) |
| 신규 | `extensions/vscode/src/VsCodeIde.ts` | IdeInterface 구현 |
| `src/core/managers/diff/*` | `extensions/vscode/src/managers/diff/*` | VS Code Diff UI |
| `src/core/managers/terminal/*` | `extensions/vscode/src/managers/terminal/*` | VS Code Terminal |
| `src/core/managers/state/StateManager.ts` | `extensions/vscode/src/managers/VsCodeStateManager.ts` | VS Code 상태 저장 |
| `src/core/managers/state/SettingsManager.ts` | `extensions/vscode/src/managers/VsCodeSettingsManager.ts` | VS Code 설정 |
| `src/core/completion/*` | `extensions/vscode/src/providers/InlineCompletionProvider.ts` | VS Code 자동완성 |
| `src/core/tools/ide/*` | `extensions/vscode/src/tools/*` | VS Code LSP 도구 |
| `src/webview/providers/*` | `extensions/vscode/src/providers/*` | VS Code 웹뷰 |
| `src/commands/*` | `extensions/vscode/src/commands/*` | VS Code 커맨드 |
| `src/services/notification/*` | `extensions/vscode/src/services/VsCodeNotification.ts` | VS Code 알림 |
| `src/services/auth/AuthService.ts` | `extensions/vscode/src/services/VsCodeAuthService.ts` | VS Code OAuth |
| `src/core/webview/*` | `extensions/vscode/src/webview/*` | VS Code 웹뷰 브릿지 |

---

## D3. 리스크 및 의사결정 포인트

### 주요 리스크

| # | 리스크 | 영향 | 완화 전략 |
|---|--------|------|----------|
| 1 | **싱글톤 매니저 DI 전환** | 모든 매니저가 `getInstance()`로 서로 참조 → `IdeInterface` 주입이 전파되어야 함 | `IdeInterface`를 글로벌 컨텍스트로 한 번만 설정하고 각 매니저가 참조하는 방식 사용 |
| 2 | **바닐라 JS → React 마이그레이션** | 129KB + 190KB의 바닐라 JS를 React로 재작성 | Phase 3에서 별도 진행, 기존 webview는 Phase 2까지 유지 |
| 3 | **Tree-sitter WASM 바이너리 포함** | 바이너리 크기 증가 (각 언어 ~1MB) | 필요 언어만 포함, 나머지 lazy 다운로드 |
| 4 | **JetBrains Diff API 차이** | VS Code의 decoration/CodeLens 패턴이 JetBrains에 없음 | JetBrains 자체 Diff API (`DiffManager`, `EditorGutter`) 사용 |
| 5 | **Extension 마켓플레이스 호환성** | 모노레포 빌드 산출물이 기존 확장과 호환되어야 함 | Phase 2 완료 후 기존과 동일한 .vsix 생성 검증 |

### 의사결정 포인트

| # | 결정 사항 | 옵션 | 추천 |
|---|----------|------|------|
| 1 | **빌드 도구** | Turborepo vs Nx vs concurrently | **Turborepo** — 캐싱 + 병렬 빌드, Continue와 같은 규모에 적합 |
| 2 | **프로토콜 포맷** | TypeScript 타입 vs Protocol Buffers | **TypeScript 타입** (Phase 1-5), 향후 proto 전환 검토 (Cline처럼) |
| 3 | **GUI 프레임워크** | React vs Svelte vs Vue | **React** — Continue/Cline 검증, JCEF 호환성 확인됨, 생태계 최대 |
| 4 | **CLI TUI 라이브러리** | Ink (React) vs Blessed vs Bubble Tea | **Ink** — React 개발자가 바로 작업 가능, Cline CLI 검증 |
| 5 | **JetBrains 바이너리 전송** | stdin/stdout vs TCP | **stdin/stdout** (기본) + TCP (개발용) — Continue와 동일 |
| 6 | **JetBrains 최소 지원 IDE** | IntelliJ만 vs 전체 JetBrains IDE | **전체** — `plugin.xml`에서 `platformType` 미지정 시 모든 JetBrains IDE 지원 |
| 7 | **Phase 3 시점** | Phase 2 직후 vs Phase 6 이후 | **Phase 2 직후 권장** — JetBrains에서 GUI 공유 필수, CLI는 TUI 별도 |

---

## 부록: 참고 자료

### 프로젝트 소스코드

| 프로젝트 | GitHub |
|----------|--------|
| Continue | [github.com/continuedev/continue](https://github.com/continuedev/continue) |
| Cline | [github.com/cline/cline](https://github.com/cline/cline) |
| OpenCode | [github.com/opencode-ai/opencode](https://github.com/opencode-ai/opencode) |
| Aider | [github.com/paul-gauthier/aider](https://github.com/paul-gauthier/aider) |
| oh-my-opencode | [github.com/opensoft/oh-my-opencode](https://github.com/opensoft/oh-my-opencode) |

### Continue 아키텍처 문서

| 주제 | 출처 |
|------|------|
| IDE 인터페이스 | `core/index.d.ts` (40+ 메서드) |
| 메시지 프로토콜 | `core/protocol/` (60+ 메시지 타입) |
| IntelliJ 플러그인 | [DeepWiki - IntelliJ Plugin](https://deepwiki.com/continuedev/continue/7-intellij-plugin) |
| 바이너리 빌드 | [DeepWiki - Build System](https://deepwiki.com/continuedev/continue/7.1-build-system) |
| 통신 플로우 | [DeepWiki - Communication Flow](https://deepwiki.com/continuedev/continue/2.4-communication-flow) |

### Cline 아키텍처 문서

| 주제 | 출처 |
|------|------|
| gRPC 프로토콜 | `proto/cline/` (16 .proto), `proto/host/` (5 .proto) |
| CLI 아키텍처 | [DeepWiki - CLI Tool](https://deepwiki.com/cline/cline/12-cli-tool) |
| gRPC 통신 | [DeepWiki - gRPC Communication](https://deepwiki.com/cline/cline/6.1-grpc-communication-system) |
