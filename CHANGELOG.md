# AgentGoCoder

VS Code용 AI 코딩 어시스턴트 — Ollama / OpenAI / Gemini / Anthropic 멀티 LLM 지원

> **현재 버전: v1.2.7**  
> **브랜치:** `agentgocoder`

---

## v1.2.7 (2026-06-25)

### ASK 모드 읽기 전용 동작 수정

- **ASK 모드 백엔드 연결**: 그동안 채팅 모드 드롭다운의 `ASK`가 UI에만 존재하고 백엔드는 이를 무시(`CODE_GENERATION` 하드코딩)하여, ASK 모드에서도 파일이 생성·수정되던 문제를 수정했습니다. 이제 선택한 모드가 webview → 백엔드 → ConversationManager로 정확히 전달됩니다.
- **ASK = 읽기 전용 강제**: ASK 턴에서는 파일 쓰기/삭제·명령 실행 도구를 LLM에 노출하지 않고(read-only allowedTools), 모든 실행 경로(INVESTIGATION 시작 강제, EXECUTION 전환 차단, 스트리밍 파일 쓰기 차단)에서 write를 차단합니다.

---

## v1.2.6 (2026-06-10)

### 설정 UI 정리 + 사용자 매뉴얼 문서

- **언어 설정 제거**: 일반 탭의 언어 선택 UI를 제거했습니다. 다국어 기능이 아직 완성되지 않아, 미완성 기능 노출을 막기 위해 숨깁니다. (i18n 핸들러는 가드되어 비활성 상태로 남아 있으며, 추후 완성 시 재노출 예정)
- **설정 매뉴얼 추가**: `docs/settings-manual.md` — 설정 화면 7개 탭(일반·AI 모델·빌드/테스트·Hot Load·Skills·보안·사용량)의 모든 옵션을 표로 정리한 사용자 매뉴얼. (스크린샷 자리 표시 포함)

---

## v1.2.5 (2026-06-10)

### 모델 ID 직접 입력 (프로바이더 설정 카드)

각 프로바이더(Claude / OpenAI / Gemini) 설정 카드의 모델 드롭다운에 **`+ 직접 입력…`** 옵션 추가:

- 선택 시 모델 ID 텍스트 입력칸이 나타나고, 엔드포인트·인증은 해당 프로바이더 기준으로 자동 적용 → **모델 ID만 입력**하면 됨.
- 새 LLM 버전이 나와도 프리셋/확장 업데이트 없이 즉시 사용 가능.
- 영속 인코딩 `supported:custom::{group}::{modelId}` — 재시작 시 복원.
- 채팅 패널·드롭다운에는 인코딩 문자열 대신 **모델 ID로 깔끔하게 표시**(클릭 시 재적용 지원).

**유지:** 기존 "사용자 정의 모델" 기능은 그대로. 프리셋 드롭다운도 그대로(편의용).

---

## v1.2.4 (2026-06-10)

### 최신 모델 추가 + 모델 직접 입력 간소화

**추가된 프리셋 모델** (`settings.js` + `SettingsManager.ts`):

- **Claude Opus 4.8** (`claude-opus-4-8`) — Anthropic 최신 플래그십 (2026-05-28 출시)
- **Gemini 3.5 Flash** (`gemini-3.5-flash`) — Google 최신 GA 모델
- **Gemini 3.1 Flash-Lite** (`gemini-3.1-flash-lite`) — 최저가 옵션

**모델 ID 직접 입력 간소화 — 엔드포인트 자동채움:**

- 사용자 모델 추가 폼에서 프로바이더(OpenAI / Gemini / Claude / vllm 등)를 선택하면 **엔드포인트가 자동으로 채워짐** → 모델 ID·이름·API 키만 입력하면 등록.
- 새 LLM 버전이 나와도 **프리셋/확장 업데이트 없이** 사용자가 직접 모델을 추가 가능 (드롭다운 버전 프리셋 유지보수 부담 해소).
- 편집 시 저장된 엔드포인트는 보존.

---

## v1.2.3 (2026-06-10)

### OpenAI 추론 모델(GPT-5 / o-시리즈) 호출 지원

`OpenAICompatProvider`가 추론 모델을 자동 감지해 올바른 파라미터로 요청하도록 수정. 기존엔 모든 모델에 `max_tokens` + `temperature`/`top_p`를 보내, GPT-5·o-시리즈가 **400 에러**로 호출 불가했음.

- **추론 모델 감지**: **엔드포인트가 OpenAI/Azure일 때만**(provider=`openai`/`azure` 또는 호스트 `api.openai.com`/`openai.azure.com`) 모델 ID가 `o1`/`o3`/`o4`·`gpt-5*` 패턴(예: `gpt-5.5`, `gpt-5.4-mini`, `openai/gpt-5.1`)이면 추론 모델로 판별.
- **`max_completion_tokens` 전환**: 추론 모델은 `max_tokens` 대신 `max_completion_tokens`를 요구 → 자동 전환.
- **샘플링 파라미터 생략**: 추론 모델이 거부하는 `temperature`/`top_p`를 제외.
- **비표준 `think` 차단**: 네이티브 툴 콜링 OFF 상태에서도 추론 모델엔 `think:false`를 보내지 않음.

**오인 방지:** vllm·Groq·DeepSeek 등 커스텀/호환 엔드포인트는 모델 이름이 `gpt-5*`·`o3` 같아도 추론 모델로 **오인하지 않고** 기존 동작(`max_tokens` + `temperature`/`top_p`)을 유지. `gpt-4o`·`gpt-3.5-turbo` 등 일반 OpenAI 모델도 영향 없음.

---

## v1.2.2 (2026-04-26)

### 설정 내보내기 / 가져오기 — 누락 항목 6개 추가

기존 export/import에서 빠져 있던 다음 6개 config key를 양쪽에 추가:

- `sourcePaths` — 컨텍스트 소스 경로 목록
- `terminalDaemonEnabled` — 터미널 데몬 활성화
- `validationCommand` — 코드 생성 후 검증 명령 (e.g. `tsc --noEmit`)
- `formatterCommand` — 코드 생성 후 포맷터 명령 (e.g. `prettier --write .`)
- `autoMcpToolExecution` — MCP 도구 자동 실행
- `promptSuggestion` — 다음 작업 제안

**유지:** 모델 라우팅 API 키 / Admin Config는 보안 목적으로 export 대상에서 의도적으로 제외.

---

## v1.2.1 (2026-04-26)

### Removed — 자동 오류 수정 기능 제거

**제거된 기능:**

- **자동 오류 수정(Auto Error Correction)**: 터미널 명령 실패 시 LLM이 명령을 자동 수정·재시도하던 기능 전체 제거.
  - `agentgocoder.autoCorrectionEnabled` 설정 제거
  - `agentgocoder.errorRetryCount` 설정 제거 (자동 수정 시도 횟수)
  - "자동 오류 수정" 토글 + 스피너 UI 제거
  - "Stop Error Correction" 상태바 버튼 + `agentgocoder.stopErrorCorrection` 명령 제거

**삭제된 모듈:**

- `src/core/managers/error/AutoFix.ts` (자동 수정 싱글톤 서비스)
- `src/core/managers/error/AutoErrorHandler.ts` (ErrorManager.onError 구독 → LLM 자동 수정)
- `src/core/utils/SafeSettingsHelper.ts` (auto-correction 전용 helper, 빈 파일이 되어 삭제)
- 관련 LLM 클라이언트 주입 / 상태 / 핸들러 코드 일괄 정리

**유지된 기능:**

- **자동 테스트 재시도(Auto Test Retry)**: `agentgocoder.autoTestRetryEnabled`, `agentgocoder.testRetryCount` — 별개 기능으로 그대로 유지. Smoke Test / Lint Check 실패 시 재시도하는 메커니즘.
- **ErrorManager / ErrorParser / ErrorHistory / StackTraceAnalyzer**: 일반 진단·로깅 인프라로 다른 기능에서 사용. 그대로 유지.

**참고**: 사용자 워크스페이스 state에 저장된 `agentgocoder.autoCorrection*` / `agentgocoder.errorRetryCount` 키는 코드에서 더 이상 참조하지 않으므로 무해한 잔존 데이터로 남는다 (자동 정리 안 함).

---

## v1.2.0 (2026-04-26)

### Removed — 멀티 에이전트 / 소스코드 인라인 자동완성 기능 제거

**제거된 기능:**

- **멀티 에이전트(Orchestration)**: `agentgocoder.orchestration` 설정 및 관련 코드 전체 제거. ConversationService는 항상 단일 에이전트 경로(`ConversationManager.handleUserMessageAndRespond()`)로 동작.
- **소스코드 인라인 자동완성(Ghost Text)**: `agentgocoder.inlineCompletion` 설정 및 VS Code `InlineCompletionItemProvider` 등록 제거.

**제거된 모델 라우팅 슬롯:**

- 서브에이전트 모델 (Orchestration 전용)
- 소스코드 자동완성 모델 (Inline Completion 전용)
- 나머지 4개 라우팅 슬롯(Compactor / Command / Intent / Error Fallback)은 그대로 유지.

**삭제된 모듈:**

- `src/core/orchestration/` (OrchestrationRouter, TaskSplitter, SubAgentLoop, ResultMerger, PromisePool, types, index)
- `src/core/completion/InlineCompletionProvider.ts`

**참고**: 사용자 SecretStorage / globalState에 저장된 `agentgocoder.subagent*` 및 `agentgocoder.completion*` 키는 코드에서 더 이상 참조하지 않으므로 무해한 잔존 데이터로 남는다 (자동 정리 안 함).

---

## v1.1.7 (2026-04-23)

### TaskSplitter ↔ SubAgent 책임 분리

**문제**: 멀티 에이전트 orchestration 에서 TaskSplitter 가 `subtask.description` 에 스택/프레임워크 이름 (예: "Node.js 로 백엔드 초기화") 을 박으면서, SubAgent 는 "구체적 task > 일반 rule" 로 해석해 rule 과 충돌해도 task 를 우선하는 케이스 발생. SubAgent 가 rule 을 받고도 각주 처리.

**원인**: 책임 구분 불명확 — TaskSplitter 가 stack 을 결정하는 구조였고, SubAgent 는 rule 의 우선순위 명시적 지시가 없었음.

**수정**:

- `src/core/orchestration/TaskSplitter.ts`: SYSTEM_PROMPT 에 **"CRITICAL: Do Not Specify Technology Stacks"** 섹션 추가. `subtask.description` 에 프레임워크/언어/런타임/라이브러리 이름 금지. stack 선택은 SubAgent 에 위임.
- `src/core/orchestration/SubAgentLoop.ts`: `buildSystemPrompt()` 의 `## Rules` 최상단에 **"PROJECT RULES TAKE PRIORITY OVER TASK DESCRIPTION"** 규칙 추가. `[Required]` rule 이 task description 과 충돌하면 rule 우선, `[Recommended]` 만 override 가능.
- `src/core/managers/context/prompts/PromptComposer.ts`: `loadServerPromptTemplates()` 의 rule 태그를 enforcement 별 `[Required]` / `[Recommended]` 로 구분 (기존엔 전부 `[Required]` hardcode). Rules 섹션 헤더에 **"Rule priority (how to resolve conflicts)"** 소섹션 추가 — multi-agent 뿐 아니라 single-agent 경로에도 동일 정책 적용.

**결과**:

- TaskSplitter: "뭘 나눌지" 만 담당, stack 선택 금지 → 일관된 generic description 생성.
- SubAgent: 명시적 "rule > task" 가이드 받음 → stack 충돌 시 rule 따름.
- Single-agent: 동일 priority 문구가 주입되어 사용자 요청 vs rule 충돌 상황에서도 정책 일관.

### VSCode 알림창 영문 메시지 한글화

기존 `showInformationMessage` / `showInfoMessage` / `showWarningMessage` / `showErrorMessage` 에 전달되던 영문 메시지 **65건 → 한글**.

**주요 파일**:

- `src/extension.ts` — "No file selected..." / "Settings panel could not be opened..." 2건.
- `src/core/managers/diff/DiffManager.ts` — diff 열기/변경사항 없음 4건.
- `src/core/managers/diff/InlineDiffManager.ts` — 파일 생성/열기 실패 2건.
- `src/core/orchestration/OrchestrationRouter.ts` — 도구 실행 확인 모달 + 버튼("Execute"/"Skip" → "실행"/"건너뛰기").
- `src/core/webview/SettingsPanelProvider.ts` — API 키/Ollama/모델/설정 저장·로드·테스트 관련 ~52건.
- `src/core/webview/handlers/AgentPolicyHandler.ts` — 규칙 Markdown 저장/삭제 관련 ~23건.
- `src/core/webview/handlers/UserModelHandler.ts` — 사용자 모델 핸들러 오류 1건.

**참고**: 이미 한글이었던 메시지 (`AskViewProvider.ts` 의 `warningMsg` 변수 등) 는 건드리지 않음. `AgentGoCoder:` 프리픽스는 브랜드 식별용으로 유지.

---

## v1.1.6 (2026-04-21)

### 라이트 모드 — 기본 차단 명령어 리스트 가독성

- **아이템이 컨테이너와 구분 안 되던 문제 수정**: `#blocked-command-default-list > div` 에 강제로 적용되던 `background: transparent !important`로 인해 컨테이너(`#f3f4f6`)와 아이템이 동색으로 보이던 문제 해결 — **흰색(`#ffffff`) 배경 + `#e5e7eb` 엷은 테두리 + `#374151` 글자**로 다크 모드와 유사한 구분감 확보
- **검은 OS 스크롤바 → 흰색 계열 스크롤바**: WebKit 의사 요소(`::-webkit-scrollbar`, `-track`, `-thumb`)로 라이트 테마 전용 흰색 계열 강제 — 트랙 `#f3f4f6`, thumb `#d1d5db` (hover `#9ca3af`), width 10px
- **적용 범위**: `#blocked-command-default-list` 만 (tab-security의 기본 차단 명령어 리스트)

### 사용자 정의 모델 UI 마무리 (follow-up)

- **리스트 아이템 양쪽 여백 정렬**: `border:1px solid` + `border-radius:4px` 제거 → `border-bottom:1px solid var(--vscode-panel-border)`로 변경. 섹션 내 다른 입력 그룹(모델 라우팅 설정 등)과 시각적 여백 일치
- **"(표시용)" 문구 제거**: `<label for="user-model-name">` 텍스트를 "모델 이름 (표시용)" → "모델 이름"으로 단축
- **삭제 버튼 빨강 제거**: 인라인 `background-color:#ef4444` 삭제 — 기본 파란 버튼 스타일 사용

### 사용자 정의 모델 활성화를 채팅 패널로 이동 (follow-up)

- **설정 패널 리스트**: 라디오 선택 버튼·"활성 모델로 적용" 메시지·프로바이더 접미사(`(openai)`)·🔑/⚠ 이모지 제거 → 추가/편집/삭제/연결 테스트만 담당
- **메인 AI 모델 드롭다운 (`#ai-model-select`)**: 사용자 모델을 그룹 없이 평문 `<option>`으로 직접 주입 (label 없음, 이름만) — 이전 반복 중 "사용자 정의" optgroup 추가/제거를 거쳐 최종 "직접 리스팅"으로 확정
- **채팅 패널 모델 셀렉터**: Admin 섹션과 Ollama 섹션 사이에 **"User" 섹션** 추가. 항목 클릭 시 `setUserModel` 메시지 전송 → `ChatViewProvider`가 `UserModelHandler.buildAdminConfigByKey` 로 `AdminModelConfig` 빌드 후 `LLMManager.setAdminModelConfig` + `AiModelType.ADMIN` 적용
- **Extension**: `ChatViewProvider.ollamaModels` 브로드캐스트 3곳에 `userModels` 필드 포함. `UserModelHandler.listForChatDropdown()` static 헬퍼 추가

### 스킬 저장 시 Optimistic UI 갱신 (follow-up)

- **문제**: 스킬을 파일/URL/경로로 저장하면 백엔드는 성공했지만 리스트가 즉시 갱신 안 됨 — 사용자에게는 "저장됨" 메시지만 보이고 항목은 안 나타남
- **수정 (webview)**: `agentPolicyFileAdded` 핸들러에서 로컬 캐시(`agentPolicyFilesCache`/`TypesCache`/`DescsCache`)에 즉시 추가 후 `renderPolicyFileList()` 호출 → 백엔드 `listAllAgentPolicyFiles` 응답을 기다리지 않고 즉시 표시. 응답 도착 시 frontmatter 메타로 덮어써 동기화
- **수정 (backend)**: `addAgentPolicyFile` / `addPathAgentPolicy` 성공 응답에 `policyType` + `skillDescription` 추가 → optimistic 렌더 시 규칙/스킬 badge·설명이 올바르게 표시

### 스킬 저장·삭제·리스팅이 워크스페이스 없이도 동작 (follow-up)

- **문제**: 워크스페이스(폴더) 미오픈 상태에서 글로벌 규칙 외 카테고리(stable-version / coding-style / project-architecture / dependency-policy / db-policy)의 스킬·룰 저장·삭제·리스팅 시 `"저장 실패: 워크스페이스가 열려있지 않습니다."` 에러 발생
- **수정**: `AgentPolicyHandler.ts` 의 `addAgentPolicyFile` / `addPathAgentPolicy` / `deleteAgentPolicyFile` / `listAllAgentPolicyFiles` 4개 핸들러에서 `context.storageUri!` non-null 단언과 워크스페이스 체크 throw 제거 → `(context.storageUri || context.globalStorageUri).fsPath` 폴백 적용
- **설계 유지**: `global-rules` 는 여전히 `globalStorageUri` (기기 전역), 나머지 5개는 워크스페이스 있으면 `storageUri` (프로젝트 전용), 없으면 `globalStorageUri` 폴백
- **Legacy 단일 파일 업로드 핸들러**(`uploadAgentPolicyStableVersion` 등)는 건드리지 않음

---

## v1.1.5 (2026-04-21)

### 다크 테마 드롭다운·입력창 테두리 가시성 수정

- **문제**: VS Code 일부 다크 테마에서 `--vscode-input-border`가 투명 계열(`rgba(*,*,*,0)`)로 설정되어 `select` / `input[type="text|password|number"]` / `textarea`의 라운드 테두리가 배경과 같아져 **보이지 않음**
- **수정**: 다크 테마(`body:not([data-theme="light"])`) 전용 CSS로 테두리를 `rgba(255,255,255,0.18)`로 명시 — 라이트 테마(`body[data-theme="light"]`) 기존 규칙은 그대로 유지되어 영향 없음
- **대상**: `.api-key-input-group` 내부 select/text/password/number, `.settings-section select`, `#user-model-form` 내부 select/text/password/number/textarea
- **포커스 링**: 동일 셀렉터에 `var(--vscode-focusBorder, #007acc)` 보완

---

## v1.1.4 (2026-04-21)

### 사용자 정의 모델 UI 다듬기

- **"새 AI 모델 추가" 폼 타이틀 제거**: `#user-model-form-title` h4 제거 — 폼이 열리는 맥락 자체로 용도가 명확해 불필요
- **저장소 안내 문구 제거**: "추가한 모델은 이 기기에만 저장되며, API 키는 VS Code SecretStorage에 안전하게 보관됩니다." 삭제 (`userModelsDescription` 단축 — ko/en 동기화)
- **숫자 입력 스타일 통일**: `#user-model-form input[type="number"]` (컨텍스트 윈도우 / 최대 출력 토큰 / 기본 온도 / Top P)에 `.spinner-container input[type="number"]`과 동일한 스타일 적용 — `padding: 8px 12px`, `border: 2px solid`, `border-radius: 6px`, `font-size: 14px`, focus 시 파란 링

---

## v1.1.3 (2026-04-21)

### Skills/Rules 설정 패널 UX 재구성

- **통합 Add 모달**: 6개 카테고리(글로벌 관리 / 버전 관리 / 코딩 스타일 / 프로젝트 아키텍처 / 의존성 정책 / DB) 각각 기존 "파일 추가 / 저장 / 경로 추가 / URL 다운로드" 다중 입력 그룹을 **`+ 추가` 버튼 하나**로 통합
- **Add 모달 구성**: 타입 토글(규칙/스킬) + (스킬 선택 시) 필요 상황 설명 input + 방법 드롭다운(파일 업로드 / 경로 추가 / URL 다운로드) + 동적 입력 영역 + `[취소]` / `[다음]`
- **미리보기 모달 연계**: Add 모달 `다음` → 파일 읽기(클라이언트) / 경로 읽기(백엔드 `previewAgentPolicyPath`) / URL fetch(`downloadSkillFromUrl`) → MD 미리보기 모달 → `[취소]` / `[저장]`

### 버그 수정

- **global-rules 카테고리 setup 누락 해결**: 카테고리 목록에 정식 추가 — "파일 추가" 버튼 무반응 문제 해결
- **`application/octet-stream` Content-Type 허용**: URL 이 `.md`/`.markdown` 확장자인 경우에만 octet-stream 통과 (화이트리스트 2차 검증)
- **frontmatter 필수 검증 제거**: `injectOriginMetadata` 가 frontmatter 없으면 origin 메타만 포함한 블록 자동 생성 → Core 의 `injectFm` 이 이후 type/description 병합

### 테마/스타일 개선 — 라이트 모드

- **일반 탭 저장 버튼 outline 스타일**: 파란 배경 → 투명 + 회색 테두리 + 회색 글씨
- **규칙/스킬 토글 `.policy-type-btn`**: 양쪽 테마 모두 active 파란색 유지
- **보안 탭 기본 차단 명령어 목록**: 컨테이너 `#f3f4f6` 회색 배경 + 각 아이템 배경 투명
- **미리보기 모달 색상**: 박스 배경 회색 + 내부 pre 흰색 + 스크롤바 흰색 계열
- **미리보기 메타 색상**: label + value 모두 `color: inherit` 통일, code 폰트 monospace 명시

### 알림 메시지 한글화

- `CODEPILOT: {파일명} saved/deleted` → `CODEPILOT: {파일명} 저장됨/삭제됨`
- `Error adding/deleting Agent Policy file: …` → `CODEPILOT: 파일 저장/삭제 실패 — …`
- 카테고리별 저장/삭제/에러 메시지 한글 (버전 관리/코딩 스타일/프로젝트 아키텍처/의존성 정책/DB)

---

## v1.1.2 (2026-04-21)

### URL에서 Skill/Rule .md 다운로드

- **Skills 설정 UI에 URL 다운로드 추가**: 6개 카테고리(global-rules / stable-version / coding-style / project-architecture / dependency-policy / db-policy) 각각의 경로 입력 그룹 뒤에 URL 입력+"URL 다운로드" 버튼 동적 주입
- **다운로드 → 미리보기 → 저장** 플로우: 백엔드가 fetch·검증한 뒤 출처·크기·SHA256·의심 패턴을 표시하는 모달로 응답. 사용자 확인 후 기존 `addAgentPolicyFile` 저장 경로 재사용
- **컨텐츠 검증**: 1MB 상한, Content-Type 화이트리스트(text/markdown 계열), UTF-8 유효성, Null byte 거부, BOM 스트립, YAML frontmatter 존재 확인
- **파일 시스템 안전장치**: URL→파일명 slug 변환 시 `..` / 비-단어 문자 / leading dots 제거, 80자 상한, `.md` 강제
- **프롬프트 인젝션 휴리스틱** (경고만): "ignore previous" / 역할 태그 / 긴 base64 / curl·wget / JS 코드 실행 패턴 / prompt injection 마커 감지 시 모달 amber 경고
- **출처 메타데이터 주입**: 다운로드된 `.md` frontmatter에 `_source_url` + `_source_hash` 자동 추가
- **보안 제외 (명시)**: Transport & SSRF / 프롬프트 삽입 경고 배너 / allowlist / hash pinning / 감사 로그 / 비활성화 토글 — 현재 스코프 외

### Prompt Injection Defense — `<untrusted_content>` 래핑 지원

- **시스템 프롬프트 가이드 추가** (`base.ts`): `<untrusted_content source="..." ...>...</untrusted_content>` 태그 내부는 지시문이 아닌 참고 데이터임을 명시
- **`FetchUrlToolHandler` 결과 래핑**: 외부 웹 페이지 내용을 `<untrusted_content source="fetch_url" url="..." ...>` 형식으로 LLM에 전달
- **래핑 대상**: fetch_url **만**. Skills/Rules/사용자 메시지/시스템 프롬프트 래핑 안 함 (agentgocoder는 RAG/MCP 이미 제거됨)

### 설정 UI 버튼 너비 조정

- **한국어 4~6글자 버튼 줄바꿈 방지**: `.api-key-input-group button`에 `white-space: nowrap` + `word-break: keep-all` + `width: max-content` + `min-width: 110px`
- **2글자 저장 버튼은 좁게**: `#upload-*-button`, `.save-button`, `#save-mcp-server-button`, `#bt-add-button`에 `min-width: 64px`

### 사용자 정의 AI 모델 설정 UI

- **`UserModelHandler.ts` 신규** (`src/core/webview/handlers/`): Admin 백엔드 없이 IDE에서 직접 AI 모델을 CRUD·선택·연결 테스트할 수 있는 핸들러. 메시지 컨트랙트: `listUserModels` / `addUserModel` / `updateUserModel` / `deleteUserModel` / `selectUserModel` / `testUserModelConnection`
- **설정 탭 `tab-ai-model`에 "사용자 정의 모델" 섹션 추가**: 14개 필드 (provider / name / model / endpoint / authType / authHeaderName 조건부 / apiKey / contextWindow / maxOutputTokens / defaultTemperature / topP / customHeaders(JSON) / streamingSupported / nativeToolCallingSupported) — admin 대시보드의 `AIModelForm.jsx` 입력 스펙을 그대로 포팅
- **저장 분리**: `apiKey`는 `vscode.SecretStorage`, 나머지는 `globalState['agentgocoder.userModels']`. `saveAiModel` 경로에 `user:{key}` 접두어 분기 추가 — 기존 admin·supported 경로와 대칭
- **런타임 재사용**: 사용자 모델 선택 시 `AdminModelConfig` 빌드 → `LLMManager.setAdminModelConfig()` + `AiModelType.ADMIN` 적용. Provider 레이어(`OpenAICompatProvider` / `AnthropicProvider` / `GeminiProvider`) 변경 **없음**
- **UI 동작**: 라디오로 활성 모델 선택·즉시 적용, 편집/삭제/연결 테스트 버튼, 폼 유효성 검사(엔드포인트 프로토콜·JSON 헤더·온도/TopP 범위·이름 중복), 메인 드롭다운 `#ai-model-select`에 "사용자 정의" optgroup 자동 주입
- **i18n**: `userModelsTitle` / `userModelsDescription` / `userModelAddButton` 등 11개 키 추가 (ko/en)
- **의의**: RAG/Admin 서버 없이도 IDE 단독으로 임의의 OpenAI-호환·Anthropic·Gemini 엔드포인트를 사용할 수 있음. Cloud 버전 admin 대시보드의 기능 공백을 IDE 자체가 메움

---

## v1.1.1 (2026-04-20)

### 컨텍스트 주입 가시화 (채팅 패널)

- **Rules 참조 알림**: 서버 등록 Rules가 프롬프트에 포함되면 `📋 [Rules] {title 목록}` 출력 (기본 회색)
- **Skills 참조 알림**: IntentDetector가 선택하고 실제로 skill registry에 등록된 Skills만 `🧩 [Skills] {key 목록}` 출력 (emerald 색상)
- **MCP/RAG 알림 미포함**: agentgocoder v1.1.0에서 MCP·RAG 제거됨 → 해당 알림 path 없음
- **webview 색상 매핑 확장**: `webview/chat/message-display.js`의 system-message 색상 분기에 Skills(emerald) 케이스 추가

### update_file Block Anchor Matching 제거

- **`UpdateFileToolHandler.blockAnchorFallbackMatch()` 제거**: Match strategy "Block anchor" (3+ lines의 첫/마지막 라인 anchor 기반 매칭) 전체 삭제
- **이유**: 보일러플레이트 첫/끝 라인을 공유하는 다른 블록(예: 여러 try/catch, 같은 prefix를 가진 여러 함수)을 잘못 매칭할 위험. 중간 라인 trim 일치 요구 버전이더라도 anchor 기반 매칭은 구조적으로 서로 다른 위치 중 하나를 선택해야 하는 ambiguity 존재
- **영향**: update_file 매칭은 이제 4단계 (exact → quote → line-trimmed → structural)로 축소. 모든 라인이 완전 일치하는 경로(line-trimmed) 또는 공백 무시하되 내용은 엄격 일치하는 경로(structural)만 남음
- **"정확 매칭만 유지" 원칙 재확인**: v1.1.0 Fuzzy 제거 연장선상 — anchor 기반의 구조적 partial 매칭까지 제거

### Admin 등록 빌드/테스트 명령에 Baseline 신택스 게이트 prefix

- **`ProjectDetector.buildBaselineCommand()` 신규**: `projectType`별로 빠른 신택스 검사 전용 baseline 명령 생성 (Python → `python -m compileall -q -j 0 {files}`). 기본은 Python 계열(Python/Django/Flask/FastAPI)만 지원, 다른 타입은 null 반환
- **LEVEL 0 동작 변경**: `getValidationCommand`의 `serverOverride` 경로에서 admin이 등록한 명령 앞에 `{baseline} && {admin}` 형태로 체인. 예: admin이 `cd backend && pytest` 등록 시 실제 실행은 `python3 -m compileall -q -j 0 backend/app/main.py && cd backend && pytest`
- **의도**: admin이 좁은 검증만 등록(예: 라우터 존재 체크)하고 신택스 검사 포함 잊어버리는 실수 방지. 기본 신택스 에러를 깊은 검증 전에 조기 발견
- **범위 제한 — baseline만 체인**: pytest/pyright/import cascade 같은 의견·도구선택 축은 여전히 admin이 완전 override (중복 실행·도구 충돌 회피)
- **description 표기**: `Baseline + {원래 description}` 으로 변경 → 체인 여부 식별 가능
- **fromSettings 플래그 유지**: COMMAND_NOT_FOUND 발생 시 기존 폴백 로직 그대로 작동. 실패한 combined 명령은 exclude 목록에 들어가고 auto-detect 후보로 폴백

### update_file 프롬프트 규칙 강화

- **SEARCH 블록 사이즈 가드**: 툴 설명의 CRITICAL rules 1번에 "3줄 이상 AND 공백 제외 10자 이상" 하한, "20줄 이내" 상한 추가 — 한 줄짜리 SEARCH 금지 명시
- **턴당 동일 파일 1회 호출 규칙**: CRITICAL rules 2번을 "동일 파일에 연속 수정 필요하면 하나의 update_file에 여러 SEARCH/REPLACE 블록으로 묶을 것" 로 강화 — shadow 콘텐츠 갱신으로 인한 이후 SEARCH 어긋남 방지

### Python import 검증 캐스케이드

- **compileall 이후 import 검증 추가**: `ProjectDetector.getValidationCommand`/`getValidationCandidates`의 Python 분기를 `python -m compileall && [cascade]` 형태로 확장
- **캐스케이드 우선순위** (프로젝트 설정 기준 자동 선택, 미검출 시 스킵):
  1. `manage.py` 존재 → `python manage.py check` (Django system check)
  2. `pytest.ini` / `tox.ini` / `pyproject.toml [tool.pytest]` / `tests/` 중 하나라도 있음 → `pytest --collect-only -q` (conftest.py가 env/mock을 주입 → FastAPI/DB side effect 억제)
  3. `pyrightconfig.json` / `pyproject.toml [tool.pyright]` 존재 → `pyright` (static import 해상도, 부작용 없음)
  4. 루트 `main.py`/`app.py`/`wsgi.py`/`asgi.py` 또는 `app/main.py`/`app/__init__.py` 감지 → `python -c "import X"` (entry point smoke test)
- **도구 미설치 시 폴백**: 설정 파일 없으면 조용히 스킵 → compileall만 수행하고 빌드 통과 처리 (설치 강요 없음)

---

## v1.1.0 (2026-04-14)

### 이전 버전에서의 전환

| 항목 | 이전 | 현재 |
|------|------|------|
| 제품 / 패키지 | `codepilot-standalone` (CODEPILOT Standalone) | **AgentGoCoder** (`agentgocoder`) |
| 기준 릴리스 | **v1.0.65** (`main-standalone` 마지막 정리본) | **v1.1.0** |
| 익스텐션 ID | `codepilot-standalone` 계열 | **`banya.agentgocoder`** |
| 표시 이름 | CODEPILOT | **AgentGoCoder** |

CODEPILOT Standalone **v1.0.65**까지의 세부 변경 이력은 이 저장소의 **`main-standalone` 브랜치 커밋·태그**를 참고하세요. 본 CHANGELOG는 AgentGoCoder **v1.1.0** 분기부터 다시 씁니다.

### 제거된 기능 (v1.0.65 → v1.1.0)

- **AGENT 모드**: 서브에이전트 spawn/stop, Work Plan 도구, AgentLoopManager 등 자율 에이전트 경로 전부 제거  
- **PLAN 모드**: 읽기 전용 계획 전용 모드·UI·프롬프트(`planPrompt`) 제거. 대화 흐름은 **CODE 경로**만 사용  
- **AutoDream**: 세션 종료 후 메모리 자동 통합(consolidation) 서비스 제거  
- **대화 완료 후 후속 작업 제안**: `PromptSuggestionService` 및 채팅/설정 UI 제거  
- **MCP (Model Context Protocol)**: 서버 연결, MCP 도구, 설정 탭·`/mcp` 명령 등 제거  
- **규칙/스킬 `@include` 및 `paths:` 프론트매터**: `PromptComposer`의 포함 해석·경로 스코프 로직 제거  
- **Fuzzy Content Matching**: `UpdateFileToolHandler`의 유사도 기반 매칭 제거 — **정확 매칭만** 유지  

### 정리·유지

- **스트리밍 즉시 실행**: 유지 (`StreamingCodeApplier`, 설정 `agentgocoder.streamingEnabled`, 웹뷰 스트리밍 UI)  
- **PLAN/AGENT 잔여 플래그 정리**: `ConversationManager`에서 `isPlanMode`·`_isAgentMode` 및 실행되지 않던 PLAN 승인/저장 분기 제거 — 동작은 CODE 전용과 일치하도록 단순화  
- 자세한 파일 단위 목록: `docs/v1.1.0-removed-features.md`

### 유지되는 핵심

CODE 모드 에이전트 루프, 멀티 에이전트 오케스트레이션, 도구 실행(파일/터미널/검색 등), 스트리밍, 보안 규칙, 자동 테스트 재시도, 인라인 완성, 세션·모델 라우팅, Hot Load, 다국어 등 — 위 “제거” 목록에 없는 기능은 v1.1.0에서 계속 제공합니다.

---

## 향후

이 파일에는 **AgentGoCoder v1.1.0 이후** 릴리스만 누적합니다.
