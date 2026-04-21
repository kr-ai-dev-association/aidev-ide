# AgentGoCoder

VS Code용 AI 코딩 어시스턴트 — Ollama / OpenAI / Gemini / Anthropic 멀티 LLM 지원

> **현재 버전: v1.1.6**  
> **브랜치:** `agentgocoder`

---

## v1.1.6 (2026-04-21)

### 라이트 모드 — 기본 차단 명령어 리스트 가독성

- **아이템이 컨테이너와 구분 안 되던 문제 수정**: `#blocked-command-default-list > div` 에 강제로 적용되던 `background: transparent !important`로 인해 컨테이너(`#f3f4f6`)와 아이템이 동색으로 보이던 문제 해결 — **흰색(`#ffffff`) 배경 + `#e5e7eb` 엷은 테두리 + `#374151` 글자**로 다크 모드와 유사한 구분감 확보
- **검은 OS 스크롤바 → 흰색 계열 스크롤바**: WebKit 의사 요소(`::-webkit-scrollbar`, `-track`, `-thumb`)로 라이트 테마 전용 흰색 계열 강제 — 트랙 `#f3f4f6`, thumb `#d1d5db` (hover `#9ca3af`), width 10px
- **적용 범위**: `#blocked-command-default-list` 만 (tab-security의 기본 차단 명령어 리스트)

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
