# Codepilot (Cloud)

VSCode AI 코딩 어시스턴트 — Ollama / OpenAI / Gemini / Anthropic 멀티 LLM 지원

> **현재 버전: v1.0.70**

---

## v1.0.70 (2026-04-22)

### 스킬 저장·삭제·리스팅이 워크스페이스 없이도 동작

- **문제**: 워크스페이스(폴더) 미오픈 상태에서 글로벌 규칙 외 카테고리(stable-version / coding-style / project-architecture / dependency-policy / db-policy)의 스킬·룰 저장·삭제·리스팅 시 `"저장 실패: 워크스페이스가 열려있지 않습니다."` 에러 발생
- **수정**: `AgentPolicyHandler.ts` 의 `addAgentPolicyFile` / `addPathAgentPolicy` / `deleteAgentPolicyFile` / `listAllAgentPolicyFiles` 4개 핸들러에서 `context.storageUri!` non-null 단언과 워크스페이스 체크 throw 제거 → `(context.storageUri || context.globalStorageUri).fsPath` 폴백 적용
- **설계 유지**: `global-rules` 는 여전히 `globalStorageUri` (기기 전역), 나머지 5개는 워크스페이스 있으면 `storageUri` (프로젝트 전용), 없으면 `globalStorageUri` 폴백
- **Legacy 단일 파일 업로드 핸들러**(`uploadAgentPolicyStableVersion` 등)는 건드리지 않음
- standalone v1.0.70 / agentgocoder v1.1.6 과 동일 패치

---

## v1.0.69 (2026-04-21)

### 다크 테마 드롭다운·입력창 테두리 가시성 수정

- **문제**: VS Code 일부 다크 테마에서 `--vscode-input-border`가 투명 계열(`rgba(*,*,*,0)`)로 설정되어 `select` / `input[type="text|password|number"]`의 라운드 테두리가 배경과 같아져 **보이지 않음**
- **수정**: 다크 테마(`body:not([data-theme="light"])`) 전용 CSS로 테두리를 `rgba(255,255,255,0.18)`로 명시 — 라이트 테마(`body[data-theme="light"]`) 기존 규칙은 그대로 유지되어 영향 없음
- **대상**: `.api-key-input-group` 내부 select/text/password/number, `.settings-section select` 및 해당 입력 타입
- **포커스 링**: 동일 셀렉터에 `var(--vscode-focusBorder, #007acc)` 보완
- standalone v1.0.69와 동일 패치 적용으로 버전 정렬

### 라이트 모드 계정/조직 연결 UI 다듬기

- **로그아웃 / 계정 탈퇴 버튼 테두리 제거**: 라이트 모드 전역 버튼 규칙(`border: 1px solid #d1d5db`)이 이들 링크형 버튼에도 적용되어 불필요한 회색 라운드선이 보이던 문제 수정 — `.account-logout-link`·`#settings-delete-account-btn`에 `border: none !important; outline: none !important;`
- **계정 탈퇴 버튼 색 완화**: `--vscode-errorForeground` 원색에서 `#c85050` (부드러운 빨강) + opacity 0.8, hover 시 `#b04343`
- **조직 연결 "탈퇴" 버튼 색 완화**: 기본 secondary 회색 → 부드러운 빨강 톤(`#fde2e2` 배경 + `#b04343` 글자 + `#f0b8b8` 테두리), hover 시 `#fbcfcf` 배경 + `#933636` 글자
- **"미설정" 코드 블록 배경 진하게**: `--vscode-textCodeBlock-background` → `#d6dae0` (기존 약한 회색 → 가독성 확보), 글자색 `#1f2937`
- **"조직 연결" 설명 문구 진하게**: 기본 회색 → `#4b5563` (한 단계 진하게)

### 라이트 모드 — 기본 차단 명령어 리스트 가독성 (follow-up)

- **아이템이 컨테이너와 구분 안 되던 문제 수정**: `#blocked-command-default-list > div`에 강제 적용되던 `background: transparent !important`로 인해 컨테이너(`#f3f4f6`)와 아이템이 동색으로 보이던 문제 해결 — 흰색(`#ffffff`) 배경 + `#e5e7eb` 엷은 테두리 + `#374151` 글자로 다크 모드와 유사한 구분감 확보
- **검은 OS 스크롤바 → 흰색 계열 스크롤바**: WebKit 의사 요소(`::-webkit-scrollbar`, `-track`, `-thumb`)로 라이트 테마 전용 흰색 계열 강제 — 트랙 `#f3f4f6`, thumb `#d1d5db` (hover `#9ca3af`), width 10px
- standalone v1.0.69와 동일 패치 적용

---

## v1.0.68 (2026-04-21)

### Skills/Rules 설정 패널 UX 재구성

- **통합 Add 모달**: 6개 카테고리(글로벌 관리 / 버전 관리 / 코딩 스타일 / 프로젝트 아키텍처 / 의존성 정책 / DB) 각각 기존 "파일 추가 / 저장 / 경로 추가 / URL 다운로드" 다중 입력 그룹을 **`+ 추가` 버튼 하나**로 통합
- **Add 모달 구성**: 타입 토글(규칙/스킬) + (스킬 선택 시) 필요 상황 설명 input + 방법 드롭다운(파일 업로드 / 경로 추가 / URL 다운로드) + 동적 입력 영역 + `[취소]` / `[다음]`
- **미리보기 모달 연계**: Add 모달 `다음` → 파일 읽기(클라이언트) / 경로 읽기(백엔드 `previewAgentPolicyPath`) / URL fetch(`downloadSkillFromUrl`) → MD 미리보기 모달 → `[취소]` / `[저장]`
- **진단 로깅**: `allAgentPolicyFilesList` 수신 시 카테고리별 파일 목록 console 출력

### 버그 수정

- **global-rules 카테고리 setup 누락 해결**: `categoryStatusMap`, `setupAgentPolicyFileUpload`, `setupAgentPolicyPathInput` 에서 빠져 있어 "파일 추가" 버튼이 무반응이던 문제 — 카테고리 목록에 정식 추가
- **`application/octet-stream` Content-Type 허용**: 많은 서버가 `.md` MIME 매핑 없어 octet-stream 내려주는 현실 반영 — URL 이 `.md`/`.markdown` 확장자인 경우에만 octet-stream 통과 (화이트리스트 2차 검증)
- **frontmatter 필수 검증 제거**: `injectOriginMetadata` 가 frontmatter 없으면 origin 메타만 포함한 블록 자동 생성 → Core 의 `injectFm` 이 이후 type/description 병합. 사용자가 순수 `.md` (frontmatter 없는) 도 URL 로 받을 수 있음
- **로그인 직후 프로젝트 목록 갱신 누락**: `SettingsPanelProvider.onDidChangeAuth` 가 서버 설정만 갱신, 프로젝트 목록은 미로그인 상태 진입 시 빈 드롭다운으로 고정되던 문제 — 로그인 이벤트 수신 시 `/organizations/{orgId}/projects/` 재호출 + `projectListUpdated` 브로드캐스트. 진단 로그 추가

### 테마/스타일 개선 — 라이트 모드

- **일반 탭 저장 버튼 outline 스타일**: 파란 배경 → 투명 + 회색 테두리 + 회색 글씨
- **규칙/스킬 토글 `.policy-type-btn`**: 양쪽 테마 모두 active 파란색 유지 — 라이트 모드 전역 `:not(.policy-type-btn)` override 에 예외 처리
- **보안 탭 기본 차단 명령어 목록**: 컨테이너 `#f3f4f6` 회색 배경 유지. 각 아이템 inline badge 회색 → 투명. 설명+패턴이 한 줄로 깔끔
- **미리보기 모달 색상**: 박스 배경 회색 + 내부 pre 흰색 + 스크롤바 track/thumb 흰색 계열
- **미리보기 메타 색상**: label(b) + value(code) 모두 `color: inherit` 로 통일, code 폰트 monospace 명시

### 알림 메시지 한글화

- `CODEPILOT: {파일명} saved` → `CODEPILOT: {파일명} 저장됨`
- `CODEPILOT: {파일명} deleted` → `CODEPILOT: {파일명} 삭제됨`
- `CODEPILOT: file added from path` → `CODEPILOT: 경로에서 파일 추가됨`
- `Error adding/deleting Agent Policy file: …` → `CODEPILOT: 파일 저장/삭제 실패 — …`
- 카테고리별 5종 저장/삭제/에러 메시지 (버전 관리/코딩 스타일/프로젝트 아키텍처/의존성 정책/DB) 모두 한글

---

## v1.0.67 (2026-04-21)

### URL에서 Skill/Rule .md 다운로드

- **Skills 설정 UI에 URL 다운로드 추가**: 6개 카테고리(global-rules / stable-version / coding-style / project-architecture / dependency-policy / db-policy) 각각의 경로 입력 그룹 뒤에 URL 입력+"URL 다운로드" 버튼 동적 주입
- **다운로드 → 미리보기 → 저장** 플로우: 백엔드가 fetch·검증한 뒤 출처·크기·SHA256·의심 패턴을 표시하는 모달로 응답. 사용자 확인 후 기존 `addAgentPolicyFile` 저장 경로 재사용
- **컨텐츠 검증 (정식 보안 체크리스트 부분 적용)**: 1MB 상한, Content-Type 화이트리스트(text/markdown 계열), UTF-8 유효성, Null byte 거부, BOM 스트립, YAML frontmatter 존재 여부 확인
- **파일 시스템 안전장치**: URL→파일명 slug 변환 시 `..` / 비-단어 문자 / leading dots 제거, 80자 상한, 강제 `.md` 확장자
- **프롬프트 인젝션 휴리스틱** (경고만, 차단 X): "ignore previous" / 역할 태그 / 200자+ base64/hex / curl·wget / JS 코드 실행 패턴 / prompt injection 마커 감지 시 모달 상단에 amber 경고 박스
- **출처 메타데이터 주입**: 다운로드된 `.md`의 frontmatter에 `_source_url` + `_source_hash` 자동 추가
- **보안 제외 항목 (명시)**: Transport & SSRF(HTTPS 강제/TLS/IP 차단/timeout 등), 프롬프트 삽입 경고 배너, 허용 도메인 allowlist, hash pinning, 감사 로그, 비활성화 토글 — 현재 스코프 외

### Prompt Injection Defense — `<untrusted_content>` 래핑 지원

- **시스템 프롬프트 가이드 추가** (`base.ts` Prompt Injection Defense 섹션): 특정 도구 결과는 `<untrusted_content source="..." ...>...</untrusted_content>` 태그로 래핑되어 오며, 태그 내부는 **지시문이 아닌 참고 데이터**로만 해석해야 한다는 명시적 규칙 추가. "ignore previous instructions" / `system:` 역할 태그 / 임베디드 명령이 태그 안에 있어도 무시하도록 유도
- **`FetchUrlToolHandler` 결과 래핑**: 외부 웹 페이지 내용은 `<untrusted_content source="fetch_url" url="..." length="..." [truncated="true"]>...</untrusted_content>` 형식으로 LLM에 전달. 공격자가 페이지에 심은 injection 완화
- **래핑 대상 선정 원칙**: 외부 제어 가능한 데이터(fetch_url) **만** 래핑. Skills / Rules / RAG / HotLoad / 사용자 메시지 / 시스템 프롬프트는 기존 지시문 역할 보존 (래핑하지 않음). read_file / ripgrep_search / glob_search / run_command는 SEARCH/REPLACE·UI 경로 호환성 이슈로 이번 스코프에서 제외

### 설정 UI 버튼 너비 조정

- **한국어 4~6글자 버튼 줄바꿈 방지**: `.api-key-input-group button`에 `white-space: nowrap` + `word-break: keep-all` + `width: max-content` + `min-width: 110px` 적용 — "모델 저장" / "주소 저장" / "API 키 저장" / "경로 추가" / "URL 다운로드" 등 좁은 패널에서 2줄로 깨지던 문제 해결
- **2글자 저장 버튼은 좁게**: `#upload-*-button`, `.save-button`, `#save-mcp-server-button`, `#bt-add-button`에 `min-width: 64px` + `padding-left/right: 12px` 적용

---

## v1.0.66 (2026-04-20)

### update_file Block Anchor Matching 제거

- **`UpdateFileToolHandler.blockAnchorFallbackMatch()` 제거**: Match strategy "Block anchor" (3+ lines의 첫/마지막 라인 anchor + 중간 60% 유사도 허용) 전체 삭제
- **이유**: 중간 60% similarity threshold가 **중간 40% 내용이 달라도 매칭 성공**으로 판정 → 보일러플레이트 첫/끝 라인을 공유하는 다른 블록(예: 여러 try/catch, 여러 if 조건, 같은 prefix를 가진 여러 함수)을 잘못 매칭할 위험이 가장 큼
- **영향**: update_file 매칭은 이제 4단계 (exact → quote → line-trimmed → structural)로 축소. "모든 라인이 완전 일치" 또는 "공백 무시하되 내용 엄격 일치" 경로만 남음 — 유사도 기반 partial 매칭 사라짐
- **Fuzzy 제거와 같은 원칙**: "매칭 실패 → LLM 재시도로 회복" vs "잘못된 위치 매칭 → 조용한 코드 오염"의 비대칭에서 후자 제거가 우선

### update_file Fuzzy Matching 제거

- **`UpdateFileToolHandler.fuzzyContentMatch()` 제거**: Match strategy 5 (formatter 라인 브레이크 변경 복구용 토큰 기반 fuzzy 매칭) 전체 삭제
- **이유**: Fuzzy 매칭은 구조적으로 유사한 다른 위치(예: 형태가 비슷한 다른 함수)를 silent하게 잘못 수정할 리스크 존재. "매칭 실패 → LLM 재시도로 회복 가능" vs "잘못된 위치 매칭 → 조용한 코드 오염"의 비대칭에서 후자가 훨씬 비쌈
- **영향**: update_file 매칭은 이제 5단계 (exact → quote → line-trimmed → block anchor → structural)로 축소. 예전 Fuzzy가 잡던 일부 케이스는 "SEARCH block not found" 에러로 반환되며, LLM이 에러+파일내용 받고 재시도하는 기존 경로로 처리됨
- **agentgocoder v1.1.0의 "정확 매칭만 유지" 원칙과 정렬** — 4개 프로젝트 매칭 전략 통일 방향

### Admin 등록 빌드/테스트 명령에 Baseline 신택스 게이트 prefix

- **`ProjectDetector.buildBaselineCommand()` 신규**: `projectType`별로 빠른 신택스 검사 전용 baseline 명령 생성 (Python → `python -m compileall -q -j 0 {files}`). 기본은 Python 계열(Python/Django/Flask/FastAPI)만 지원, 다른 타입은 null 반환
- **LEVEL 0 동작 변경**: `getValidationCommand`의 `serverOverride` 경로에서 admin이 등록한 명령 앞에 `{baseline} && {admin}` 형태로 체인. 예: admin이 `cd backend && pytest` 등록 시 실제 실행은 `python3 -m compileall -q -j 0 backend/app/main.py && cd backend && pytest`
- **의도**: admin이 좁은 검증만 등록(예: 라우터 존재 체크)하고 신택스 검사 포함 잊어버리는 실수 방지. 기본 신택스 에러를 깊은 검증 전에 조기 발견
- **범위 제한 — baseline만 체인**: pytest/pyright/import cascade 같은 의견·도구선택 축은 여전히 admin이 완전 override (중복 실행·도구 충돌 회피)
- **description 표기**: `Baseline + {원래 description}` 으로 변경 → 체인 여부 식별 가능
- **fromSettings 플래그 유지**: COMMAND_NOT_FOUND 발생 시 기존 폴백 로직 그대로 작동. 실패한 combined 명령은 exclude 목록에 들어가고 auto-detect 후보로 폴백

### 컨텍스트 주입 가시화 (채팅 패널)

- **RAG 참조 알림**: `ContextGatherer`가 RAG 검색 결과 N개 문서를 시스템 프롬프트에 포함한 순간 `📚 [RAG] {문서명} (N개 청크)`를 채팅 패널에 출력 (amber 색상)
- **Rules 참조 알림**: 서버 등록 Rules가 프롬프트에 포함되면 `📋 [Rules] {title 목록}` 출력 (기본 회색)
- **Skills 참조 알림**: IntentDetector가 선택하고 실제로 skill registry에 등록된 Skills만 `🧩 [Skills] {key 목록}` 출력 (emerald 색상)
- **MCP 프롬프트 알림**: MCP 커스텀 프롬프트 포함 시 `🔌 [MCP] N개 서버 프롬프트 포함` 출력 (purple 색상)
- **webview 색상 매핑 확장**: `webview/chat/message-display.js`의 system-message 색상 분기에 RAG(amber)/Skills(emerald)/MCP(purple) 케이스 추가

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

## v1.0.65 (2026-04-08)

### 크래시 복구 UI 개선

- **webview 팝업으로 변경**: 이전 세션 중단 감지 시 VS Code toast(`showInformationMessage`) 대신 webview 모달 팝업으로 표시 — 사용자 놓침 방지
- **복구 모드 전달 수정**: 중단된 세션 이어하기 시 `mode: "CODE"` 누락으로 undefined 전달되던 문제 수정

### TestRunner 개선

- **TypeScript 빌드 검증 강화**: `npx tsc --noEmit` → `npx tsc --noEmit && ${pm} run build` — build 스크립트가 있는 프로젝트에서 타입 체크 + 빌드까지 검증
- **autoTestRetryEnabled 기본값 변경**: `false` → `true` — 테스트 실패 시 자동 재시도가 기본 동작
- **TestRunner npm install 자동 실행 제거**: 빌드 전 자동 npm install은 LLM이 자율적으로 판단하도록 변경

### 스트리밍 안정성

- **streamingHandledPaths 전체 실패 추적**: 보안 차단만 추적하던 것을 모든 실패 케이스로 확장 — 스트리밍 pre-execution 실패 후 post-parse에서 중복 실행되던 문제 해결

### 기타

- **디버그 로그/이모지 정리**: 불필요한 디버그 출력 및 이모지 제거

---

## v1.0.64 (2026-04-08)

### AGENT 모드 — 완전 자율화

- **턴 제한 제거**: `MAX_AGENT_TURNS=25` 경고 프롬프트, `MAX_TURNS_WARNING_THRESHOLD` 제거 — 턴 무제한
- **연속 실패 프롬프트 제거**: `MAX_CONSECUTIVE_TOOL_FAILURES=3` 제거 — LLM이 에러를 보고 자율 판단
- **AGENT 모드 streaming 조기 종료 수정**: streaming pre-execution으로 파일이 생성된 후 tool call이 스킵되면 "text-only → task completed"로 1턴 만에 종료되던 문제 수정 — streaming 실행 델타 체크로 계속 진행
- **Proactive Execution 프롬프트 추가**: 패키지 설치, 빌드 검증, 타입 체크, 테스트 실행을 LLM이 자율적으로 수행하도록 AGENT 시스템 프롬프트에 지시 추가

### 무한 루프 방지

- **SubAgentLoop update_file 무한 재시도 방지**: 같은 파일 `update_file` 3회 실패 시 실행 자체를 스킵하고 "다른 방법 사용" 피드백 전달
- **run_command 반복 실패 무한 루프 방지**: 같은 명령어 3회 연속 실패 시 스킵 + LLM에 피드백 전달 (`commandFailureCounts`)

### 네이티브 도구 설정 수정

- **SubAgentLoop 사용자 설정 존중**: SubAgentLoop에서 `isNativeToolCallingEnabled()` 사용자 설정을 무시하고 서버 설정(`nativeToolCallingSupported`)만 확인하던 문제 수정 — 이제 사용자 설정 OFF 시 SubAgentLoop에서도 네이티브 도구 비활성화

### 토큰 사용량 추적 완전화

- **전체 LLM 호출 경로 토큰 기록**: 기존 2곳(메인 루프)에서만 기록되던 `recordLLMCall`을 15개 파일 36+개 호출 경로에 추가
  - SubAgentLoop, ConversationCompactor, OrchestrationRouter, IntentDetector, TaskSplitter, TestRunner, ResponseProcessor, SessionMemoryExtractor, AutoDreamService, RelevantFilesFinder, PromptSuggestionService, ProjectDetector, ProjectManager, PlanManager, ErrorManager
  - ConversationManager 내 보조 호출 (greeting, plan item, analysis, ask, summary)
- **누락 없는 사용량 집계**: 이전에는 SubAgentLoop(CODE 모드 주요 경로) 등에서 토큰이 미기록되어 어드민 대시보드에 실제보다 적게 표시되던 문제 해결

### PLAN 모드 수정

- **PLAN 모드 무한 루프 수정**: LLM이 JSON plan 대신 텍스트로 응답 시 INVESTIGATION에서 무한 반복(11턴→강제 종료)되던 문제 수정 — 텍스트를 plan으로 수용하고 승인 팝업 표시
- **JSON plan 채팅 노출 방지**: PLAN 모드 INVESTIGATION에서 스트리밍 UI 표시 OFF + JSON 포함 응답은 파싱 후 요약 형식으로 표시
- **스트리밍 커서 미종료 수정**: PLAN 모드 종료 시 `endStreamingMessage` + `sendProcessingStep('done')` 호출 추가

### 버그 수정

- **로그아웃 시 프로젝트 선택 초기화**: 다른 계정으로 로그인 시 이전 계정의 프로젝트가 드롭다운에 남아있던 문제 수정 — `codepilot.projectId` 초기화

---

## v1.0.63 (2026-04-07)

### ask_question 전체 활성화

- **AGENT 모드 ask_question 수정**: AgentLoopManager의 ToolExecutionContext에 webview 누락으로 AGENT 모드에서 `ask_question` 실행 실패하던 문제 수정
- **CODE 모드 plan item 실행 시 ask_question 활성화**: `includeWebviewInContext`를 전체 true로 변경 — plan item, tool calls, 일반 EXECUTION 모두에서 `ask_question` 사용 가능
- **멀티 에이전트 ask_question 활성화**: `OrchestrationRouter.buildToolContext()`에 webview 전달 추가 — SubAgentLoop에서도 `ask_question` 동작

### 컨텍스트 압축 3단계 (Microcompact 추가)

- **Microcompact 단계 추가**: Tier1 trim(60%)과 LLM 요약(90%) 사이에 Microcompact(70%) 삽입 — 도구 결과를 파일명/라인수/크기 1줄 요약으로 축약 (LLM 호출 없음)
- **압축 파이프라인**: Tier0 trim → **Tier1.5 Microcompact** → Tier2 LLM 요약 (3단계)
- **CODE + AGENT 모두 적용**: ConversationManager, AgentLoopManager 양쪽에서 microcompact 호출

### 개선

- **Windows PowerShell spawn 방식 개선**: `shell: false` 직접 실행 방식으로 변경 — 프로세스 1개로 축소, 이중 셸 파싱 제거
- **스트리밍 실패 메시지 구분**: 보안 차단(`🚫 [차단]`)과 일반 실패(`❌ [Failed]`)를 구분하여 표시

---

## v1.0.62 (2026-04-07)

### 프로젝트 외부 파일 차단 설정화

- **세팅 > 일반 > 토글 추가**: "프로젝트 외부 파일 차단" — 프로젝트 디렉토리 밖의 파일 생성/수정/삭제/읽기 차단 (기본: ON)
- **하드코딩 제거**: `PreToolUseValidator`의 프로젝트 외부 차단이 사용자 설정으로 전환
- **차단 시 채팅 메시지 표시**: 스트리밍 pre-execution 차단 시 `🚫 [차단]` 메시지를 채팅 패널에 표시, 중복 실행 방지
- **READ_ONLY_FILES 죽은 코드 제거**: `DEFAULT_PROTECTED_FILES`가 빈 배열이라 동작하지 않던 lock 파일 차단 코드 정리

### 버그 수정

- **AGENT 모드 Prompt Suggestion 설정 무시 수정**: AGENT 모드에서 `promptSuggestion` 설정 OFF인데도 제안이 표시되던 문제 수정
- **Windows PowerShell 실행 방식 개선**: `shell: false` 직접 실행으로 변경 — cmd.exe 이중 경유 제거, 프로세스 1개로 축소, 인자 파싱 안전성 향상

---

## v1.0.61 (2026-04-07)

### 버그 수정

- **RunCommandToolHandler cwd 이중 경로 수정**: `dotnet run --project MyApp/MyApp.csproj` 실행 시 cwd가 서브 프로젝트로 변경되어 이중 경로가 되는 문제 수정 — 명령어에 상대 경로가 포함된 경우 cwd를 projectRoot로 유지
- **FileChangeHandler/TestRunner cwd 수정**: LLM 폴백으로 프로젝트 타입 감지 후 `dotnet format`/`dotnet build`가 워크스페이스 루트에서 실행되어 실패하는 문제 수정 — LLM 타입 감지 후 서브디렉토리 BFS로 실제 프로젝트 루트 탐색
- **Webview classList null 에러 수정**: 참조 패널 토글 클릭 시 `Cannot read properties of null` 에러 수정
- **Webview processing-steps 디버그 로그 제거**: `[processing-steps]` console.log 4개 제거

### AGENT 모드 — 스타일 cwd 관리

- **AGENT 모드 cwd 자동 추론 스킵**: AGENT 모드에서 `resolveCommandCwd` 비활성화 — LLM이 직접 경로를 관리 
- **ToolExecutionContext에 `isAgentMode` 플래그 추가**: AgentLoopManager에서 true로 설정, CODE 모드는 기존 cwd 자동 추론 유지
- **Windows 경로 대소문자 보안 차단 수정**: `PreToolUseValidator`에서 Windows 드라이브 문자 대소문자 불일치(`c:` vs `C:`)로 모든 파일 조작이 차단되는 문제 수정
- **모델 미선택 알림**: 모델이 설정되지 않은 상태에서 채팅 패널 상단에 "모델을 선택해주세요" 배너 표시 — 클릭 시 모델 드롭다운 자동 열림

---

## v1.0.60 (2026-04-07)

### AGENT 모드 — 자율 탐색

- **ProjectDetector 제거**: AGENT 모드에서 시스템이 프로젝트 정보를 주입하지 않음 — LLM이 직접 `list_files`, `glob_search`, `read_file`로 프로젝트 구조를 파악
- **워크스페이스 경로만 제공**: 최소한의 정보만 전달하여 LLM이 자율적으로 탐색
- **CODE 모드 영향 없음**: CODE 모드는 기존 ProjectDetector + 자동 빌드 검증 유지

### 컨텍스트 압축 4단계 (budget 추가)

- **budget (메시지별 크기 제한)**: 3턴 이전의 도구 결과를 2000자로 자동 축약 — LLM 호출 없이 즉시 처리
- **압축 단계**: Tier1 trim → budget → LLM 요약 → collapse-drain (4단계)
- **적용 범위**: CODE + AGENT 모두

### 서브 프로젝트 cwd 감지 개선

- **명령어 경로 분석**: `dotnet build MyWebApi/MyWebApi.csproj` → MyWebApi 디렉토리에서 실행 (이전: 첫 번째 감지된 서브 프로젝트로 이동)
- **cd 패턴 인식**: `cd MyWebApi && dotnet build` → MyWebApi 디렉토리 자동 감지
- **폴백 유지**: 경로 추출 실패 시 기존 BFS 탐색 사용

### 설정 내보내기/가져오기

- **errorReportingEnabled 추가**: 내보내기/가져오기에 빠져있던 에러 보고 설정 포함

---

## v1.0.59 (2026-04-06)

### AGENT 모드 개선

- **에러 누적 감지**: 같은 도구 3회 연속 실패 시 LLM에 "다른 방법을 시도하세요" 프롬프트 자동 삽입
- **max_turns 경고**: 25턴 중 20턴 도달 시 LLM에 "남은 턴 N회" 알림 — 작업 마무리 유도

### Windows 셸 폴백 개선

- **폴백 순서 변경**: Git Bash → **PowerShell (Bypass + NoProfile)** → cmd.exe (이전: Git Bash → cmd.exe)
- **PowerShell 자동 감지**: `pwsh` (7+) 우선, `powershell` (5.1) 폴백
- **셸 정보 LLM 전달**: 현재 사용 중인 셸(Git Bash/PowerShell/cmd)을 시스템 프롬프트에 포함 — LLM이 적절한 명령어 생성

### reactive-compact 연결

- **LLMManager → withRetry onCompact 연결**: context overflow 시 collapse-drain 자동 실행 — sendMessage, sendMessageWithSystemPrompt, streaming 3곳 모두 적용

### 버그 수정

- **git diff stderr 억제**: git 미초기화 프로젝트에서 도움말 출력 방지 (`2>nul`/`2>/dev/null`)
- **result?.success 크래시 방지**: toolResults에 undefined 요소 시 TypeError 방지
- **OllamaApi quota 즉시 중단**: "usage limit"/"quota" 에러는 재시도 안 함 (일반 429 rate limit은 재시도 유지)

---

## v1.0.58 (2026-04-06)

### repair agent 무한 루프 방지

- **repair agent MAX_TURNS 제한**: 25턴 → **10턴** — 에러 수정용 repair agent는 짧게 제한
- **연속 실패 탈출**: 같은 파일 update_file이 **3회 연속 실패** 시 `__done__` 강제 허용 — 무한 루프 방지
- **파일별 실패 카운트 추적**: `_fileFailureCounts` Map으로 파일별 실패 횟수 추적 + 로그에 `(attempt N/3)` 표시

### 백그라운드 프로세스 크래시 감지

- **즉시 종료 감지**: 백그라운드 명령어(uvicorn 등)가 타임아웃 전에 exit≠0으로 종료되면 `failed` 반환 — 이전엔 죽은 프로세스를 "백그라운드 실행 중"으로 잘못 보고
- **LLM에 에러 전달**: 실패 시 exit code + stderr를 LLM에 전달하여 원인 파악 및 수정 유도

### AGENT 모드 개선

- **에러 누적 감지**: 같은 도구 3회 연속 실패 시 LLM에 "다른 방법을 시도하세요" 프롬프트 자동 삽입
- **max_turns 경고**: 25턴 중 20턴 도달 시 LLM에 "남은 턴 N회" 알림 — 작업 마무리 유도

### 버그 수정

- **git diff stderr 억제**: git 미초기화 프로젝트에서 도움말 출력 방지 (`2>nul`/`2>/dev/null`)
- **result?.success 크래시 방지**: toolResults에 undefined 요소 시 TypeError 방지
- **OllamaApi quota 즉시 중단**: "usage limit"/"quota" 에러는 재시도 안 함 (일반 429 rate limit은 재시도 유지)
- **LLMRetryHelper quota 비재시도**: quota 초과 에러를 isRetryableError에서 false 반환

### 에러 복구 인프라 (공용)

- **reactive-compact**: context overflow (400/413) 시 `onCompact` 콜백으로 메시지 압축 후 재시도 — CODE + AGENT + SubAgentLoop 모두 적용
- **collapse-drain**: `ConversationCompactor.collapseDrain()` — 압축 후에도 초과 시 오래된 메시지 20%씩 단계적 제거
- **413 에러 감지**: `isContextOverflowError`에 413 Payload Too Large + request entity too large 추가
- **max-output 에스컬레이션**: `isOutputTruncated()` — 코드블록 미닫힘, 중괄호 불균형으로 응답 잘림 감지 / `escalateMaxTokens()` — 1.5배 증가 (최대 16384)

---

## v1.0.57 (2026-04-06)

### 스트리밍 즉시 실행

- **update_file 스트리밍 즉시 실행**: CODE 모드에서 update_file도 스트리밍 중 즉시 적용 (create_file과 동일 패턴)
- **AgentLoopManager 스트리밍 즉시 실행**: AGENT 모드에도 create_file + update_file 스트리밍 즉시 실행 추가 — 파일이 하나씩 실시간 표시
- **스트리밍 dedup**: 이미 실행된 파일은 post-stream에서 자동 스킵 (`Streaming-pre-executed skipped`)

### 다음 작업 제안 (Prompt Suggestion)

- **제안 3개로 확대**: 2개 → 3개 (Few-shot 프롬프트 예시도 3개로 변경)
- **`<think>` 태그 처리**: LLM이 thinking 태그를 출력하는 경우 제거 후 JSON 파싱
- **maxTokens 증가**: 500 → 2000 (thinking + JSON 생성 여유 확보)
- **disableThinking 옵션 추가**: thinking 토큰 낭비 방지

### 세션 관리

- **clearHistory 개선**: 히스토리 삭제 시 ProjectContextCache + ToolSpecBuilder 캐시 + InlineDiffManager 체크포인트 일괄 클리어
- **세션 복원 수정**: clearHistory에서 불필요한 새 세션 생성 제거 — 재시작 시 대화 히스토리 정상 복원
- **conversationTurnId 전달**: AgentLoopManager → ToolExecutionContext에 UUID 전달 — Undo Turn cascade 정상 동작

### AutoDream 메모리 통합

- **JSON 파싱 강화**: `[project]` 같은 텍스트를 JSON 배열로 오인하는 버그 수정 — `\[\s*\{` 정규식으로 실제 객체 배열만 매칭
- **disableThinking 추가**: thinking 토큰이 JSON 생성을 방해하는 문제 방지

### 언어 / 프레임워크 지원

- **Next.js 감지**: `next` 패키지 감지 → React 스택 재사용 + tsc/Prettier 빌드/포맷
- **Nuxt.js 감지**: `nuxt` 패키지 감지 → Vue 스택 재사용 + tsc/Prettier 빌드/포맷
- **Svelte 감지**: `svelte`/`@sveltejs/kit` 감지 → SvelteKit 스택 + Vitest/Playwright/Tailwind 공통 감지
- **Kotlin 감지**: `.kt`/`.kts` 파일 감지 → Ktor, Spring Boot, Exposed, Koin, Coroutines 스택
- **Elixir 감지**: `mix.exs` 감지 → Phoenix, Ecto, Absinthe, LiveView 스택
- **Scala 감지**: `build.sbt` 감지 → Akka, Play, http4s, ZIO, Spark 스택
- **Angular 스택 보강**: Angular Material, NgRx, AngularFire, RxJS 감지
- **PHP 스택 보강**: Laravel, Symfony, Slim, Filament, Livewire, Inertia.js, Doctrine, PHPUnit/Pest 감지
- **Ruby 스택 보강**: Rails, Sinatra, Hanami, RSpec, Sidekiq, Devise, GraphQL 감지
- **Swift 스택 보강**: Vapor, Kitura, SwiftUI, Combine 감지

### .NET 지원 강화

- **dotnet test 자동 실행**: 테스트 프로젝트(`.Tests`/`.Test`) 감지 시 `dotnet test` 실행
- **StackDetector**: .csproj 파싱 → ASP.NET Core, EF Core, Blazor, SignalR, xUnit, NUnit, MSTest, Dapper, MediatR, AutoMapper, Serilog, Swagger 감지
- **토큰 추정**: `.cs`/`.csproj`/`.sln` → 3 bytes/token (verbose syntax 반영)

### 윈도우 호환성

- **git diff 플랫폼 분기**: `2>/dev/null` → Windows에서 `2>nul` 자동 전환
- **안전 명령어 확장**: Windows 명령어 (`dir`, `findstr`, `where`, PowerShell cmdlets) + `dotnet --version` 추가

### SubAgentLoop 개선

- **RAG 프롬프트 강화**: "RAG 문서는 로컬 파일이 아닐 수 있음 — read_file로 읽지 마세요" 명시
- **spawn_agent processStep**: 워커 실행 시 "실행 중" 상태로 업데이트 (이전: "작업 계획중" 고정)

### UI / UX

- **파일 변경 요약 중복 제거**: AGENT 모드에서 시스템 메시지 + Turn Actions 이중 표시 문제 해결
- **빈 시스템 메시지 방지**: displayText가 비어있는 경우 렌더링 안 함
- **Turn Actions 영문 유지**: Undo Turn / Keep Turn + "N개 파일 생성됨, N개 파일 수정됨" 한글 표시
- **sleep 차단 제거**: 기본 차단 명령어에서 sleep 제거

---

## v1.0.56 (2026-04-06)

### 안전성 / 안정성

- **Pre-execution Validation**: 도구 실행 전 입력 검증 — 빈 파라미터, 짧은 diff, 빈 명령어 조기 차단
- **따옴표 정규화 (Quote Normalization)**: curly quote → straight quote 자동 정규화로 SEARCH 매칭 성공률 향상
- **No-op 편집 감지**: search === replace인 편집 요청 조기 거부 (불필요한 포맷터 실행 방지)
- **Cleanup Registry + Graceful Shutdown**: 전역 cleanup 함수 레지스트리 + 5초 timeout 다단계 종료
- **Query Source Retry**: foreground(사용자 대면) vs background(자동 추출/통합) 쿼리 구분 — 백그라운드는 429/529 즉시 실패

### 성능 / 최적화

- **파일타입별 토큰 추정**: JSON(2B/token), YAML(3B), 코드(4B), 텍스트(5B) — 압축 빈도 감소
- **바이너리 파일 감지**: 첫 8KB 샘플링으로 바이너리 판단 → read_file 시 토큰 낭비 방지
- **시간 기반 MicroCompaction**: 오래된 메시지 (상위 30%) 200자로 공격적 축약 → 최근 컨텍스트 보존

### 컨텍스트 / 응답

- **컨텍스트 우선순위 토큰 예산**: 압축 후 파일 최대 5개/50K토큰, 도구 결과 5K 초과 시 2K로 축약
- **컨텍스트 오버플로우 자동 조절**: 400 에러 시 max_tokens 25% 축소 + 1000토큰 안전 버퍼로 자동 재시도
- **파일 읽기 토큰 가드**: 대용량 파일 읽기 시 "offset/limit 사용" 가이드 메시지 제공

### 파일 I/O

- **Git Diff 편집 검증**: update_file 후 git diff --stat 로깅 (포맷터 의도치 않은 변경 감지)

### IMPROVEMENT_TODO_V2 전체 완료

- 12개 항목 모두 구현 (미진행 0개)

---

## v1.0.55 (2026-04-05)

### 기능 추가

- **Prompt Suggestion (다음 질의 제안)**: 대화 완료 후 2-3개 후속 작업을 클릭 가능한 버튼으로 제안 — 클릭 시 자동 전송
- **autoDream (메모리 자동 통합)**: 24시간 + 5세션 임계값 충족 시 백그라운드에서 메모리 통합/정리 — 중복 병합, 오래된 정보 삭제, 날짜 정규화

- 총 적용: File Checkpoint, Session Memory 자동 추출, Diagnostic Tracker, autoDream, Prompt Suggestion, ToolSpecBuilder 캐시, Cache Break Detection, Semantic Boolean, LSP 9/9, Stall Detection, 자동 백그라운드, sleep 차단

---

## v1.0.54 (2026-04-05)

### 기능 추가

- **Session Memory 자동 추출**: 대화 완료 후 자동으로 중요 정보 메모리 저장 (20K토큰 + 5턴 임계값, 최대 3개 항목) — CODE + AGENT 공통
- **Diagnostic Tracker**: LSP 진단 베이스라인 캡처 + delta 감지 (수정 전/후 에러 변화 추적)
- **File Checkpoint UUID 매칭**: `conversationTurnId`를 세션 엔트리에 저장 → 재시작 후에도 UNDO 정상 동작

### 성능 / 캐시

- **ToolSpecBuilder 캐시**: 도구 스펙 빌드 결과 캐싱 (동일 allowedTools → 즉시 반환)
- **Cache Break Detection**: 시스템 프롬프트 변경 시 ToolSpec 캐시 자동 클리어 (PromptComposer 해시 비교)

---

## v1.0.53 (2026-04-05)

### AGENT 모드 아키텍처 리팩토링

- **AgentLoopManager 클래스 분리**: ConversationManager에서 AGENT 전용 루프를 별도 클래스(`AgentLoopManager.ts`)로 분리 — FSM 없는 순수 `while(true)` 자율 루프
- **CODE 모드 코드 정리**: `isAgentMode` 체크 20곳+ 제거 — AGENT가 별도 클래스로 가서 더 이상 불필요
- **SubAgentLoop 도구 제한**: `work_plan`, `spawn_agent`, `stop_agent`를 서브에이전트 도구 목록에서 제외 (메인 루프 전용)
- **work_plan 채팅 표시 제거**: work_plan 결과는 작업큐 UI에만 표시, 채팅에 JSON 텍스트로 안 보임

### AGENT 기능 보완

- **참조 문서 표시**: 완료 시 RAG/Rules/Skills 참조 정보 채팅에 표시
- **파일 변경 요약**: Created/Updated 파일 목록 완료 시 표시
- **FileTransactionManager 통합**: 트랜잭션 시작/커밋으로 롤백 지원
- **processing step 완료 표시**: 루프 종료 시 `done` step 전송

### 기타

- **sleep 차단 완화**: `sleep ≥2s` → `sleep ≥30s`로 변경 (`sleep 3 && curl` 허용)
- **pytest no tests 통과 처리**: exit code 5 (no tests collected) → 에러가 아닌 통과로 처리

---

## v1.0.52 (2026-04-03)

### 명령 실행 개선

- **자동 백그라운드 허용리스트**: `npm run dev`, `uvicorn`, `flask run` 등 12개 패턴 자동 백그라운드 전환 (30초 대기 제거)
- **sleep 명령 차단**: `sleep ≥2s` 차단 — `DEFAULT_BLOCKED_COMMANDS`에 추가
- **Stall Detection (멈춤 감지)**: 5초 간격 출력 모니터링, 45초 무응답 시 대화형 프롬프트 패턴 감지 → 사용자 알림
- **pytest exit code 5 통과 처리**: "no tests collected"는 에러가 아닌 통과로 처리 (불필요한 retry 방지)

### 도구 개선

- **Semantic Boolean Parsing**: `semanticBoolean()` 유틸 — `'true'`, `'yes'`, `1` 등 다양한 LLM boolean 출력 처리
- **LSP 도구 확장 (9/9)**: `prepareCallHierarchy`, `incomingCalls`, `outgoingCalls` 3개 operation 추가
- **Fuzzy Content Matching**: update_file 5단계 매칭 — 포맷터 줄바꿈 변경에도 매칭 가능
- **update_file SEARCH 블록 최소화 프롬프트**: "변경 부분 + 전후 2-3줄만" 유도 (파일 전체 SEARCH 방지)

### 압축 / 토큰

- **Ollama 기본 컨텍스트**: 65,536 → 131,072 (context length 미감지 시)
- **압축 threshold**: 0.8 → 0.9 (90%에서 압축)
- **AUTOCOMPACT_BUFFER_TOKENS**: 13,000 추가 (압축 후 바로 재압축 방지)
- **요약 maxTokens 제한**: `min(입력의 50%, 2000)` → Ollama `num_predict`로 강제 전달

### AGENT 모드 안정성

- **execution_run 재촉 AGENT 제외**: `run_command` 없으면 재촉하는 FSM 로직이 AGENT에서 발동 안 되도록 수정
- **게이지 실제 컨텍스트 표시**: ASK 경로에서 세션 누적 대신 실제 LLM 컨텍스트 토큰 표시
- **새 파일 UNDO 시 삭제**: 생성된 파일의 마지막 UNDO → 파일 자체 삭제

### 기타

- **ruleExcludes 기능 제거**
- **중복 프롬프트 제거**: `getNoInternalMonologueRules` 삭제
- **모델 라우팅 설명 추가**: "CODE 모드 전용, AGENT는 메인 모델만"

---

## v1.0.51 (2026-04-03)

### AGENT 모드 개선

- **자동 검증 스킵**: AGENT 모드에서 시스템 자동 tsc 검증 제거 — LLM이 직접 `run_command`로 검증 
- **work_plan 도구**: AGENT 모드 전용 작업 계획 도구 — 기존 작업큐 UI 재사용, 매 턴 시스템 메시지에 상태 주입
- **검증 에이전트**: 복잡한 작업(3+ 파일) 완료 후 `spawn_agent`로 검증 worker 스폰 — 빌드/테스트 실행 + 회의적 검증
- **세션 저장 로그**: `Saving AGENT mode entry` (이전: `CODE mode entry`)

### 코드 품질 / 정확성

- **`<analysis>` 태그 요약**: 압축 시 LLM이 `<analysis>` 블록에서 사고 정리 후 요약 → 요약 품질 향상, analysis 블록은 자동 제거
- **NEVER 규칙 3개**: 파일 읽기 전 수정 금지, 파괴적 명령 금지, 시크릿 코드 포함 금지
- **프롬프트 인젝션 방어**: 도구 결과의 외부 데이터를 비신뢰 입력으로 취급하라는 지시 추가
- **ruleExcludes 기능 제거**: 불필요한 설정 항목 삭제
- **중복 프롬프트 제거**: `getNoInternalMonologueRules` 삭제 (`getNoThinkingLeakageRules`에 통합)

### 안전성

- **continuation line 보안**: 백슬래시 줄바꿈으로 위험 명령 숨기기 감지 (`hasSuspiciousContinuation`)
- **리다이렉트 대상 검증**: `> $HOME`, `> $(cmd)` 등 동적 리다이렉트 대상 차단 (`unsafe_redirect` 패턴)

### 에러 처리

- **압축 실패 차단기**: 3회 연속 압축 실패 시 중단 (무한 API 호출 방지)
- **buildTimeoutCount 리셋**: 빌드 성공 시 타임아웃 카운터 초기화 (`onValidationSuccess`)

### 토큰 절약

- **요약 토큰 예약**: 압축 시 maxTokens에서 20,000 토큰 예약 (요약 출력 공간 확보)
- **요약 토큰 상한 제한**: `maxTokens = min(입력의 50%, 2000)` → Ollama `num_predict`로 강제 전달
- **게이지 실제 토큰 표시**: ASK 경로에서 세션 누적 대신 실제 LLM 컨텍스트 토큰 표시

### UI

- **모델 라우팅 설명**: "CODE 모드에서 단계별로 다른 모델 사용. AGENT 모드에서는 메인 모델만 사용"
- **파일 생성 UNDO 시 삭제**: 새로 생성된 파일의 마지막 UNDO → 파일 자체 삭제
- **스트리밍 코드블록**: CODE + AGENT 공통으로 스트리밍 중 즉시 코드블록 표시

---

## v1.0.50 (2026-04-02)

### 세션 관리 개선

- **크래시 복구**: 중단된 세션 감지 (`wasLastSessionInterrupted`) — 마지막 대화가 사용자 요청인데 응답 없으면 "이전 작업이 중단되었습니다. 이어서 진행할까요?" 알림
- **세션 간 이어하기**: 이전 세션의 압축 요약을 새 대화 컨텍스트에 `[Previous session context]`로 자동 주입
- **PLAN 계획 파일 저장**: PLAN 모드 승인 시 `globalStorage/plans/plan_{sessionId}.md`로 디스크 저장
- **세션 삭제 시 plan 파일 정리**: 세션 삭제 시 연관된 plan 파일도 함께 삭제

### 도구 개선

- **ask_question 유일성 검증**: 질문 텍스트 중복 / 옵션 라벨 중복 시 에러 반환 (DUPLICATE_QUESTION, DUPLICATE_OPTION)

### 프롬프트 개선

- **프롬프트 차별화**: 
  - `Code Quality Rules` → `Code Quality — Minimize Change Scope` (맥락 + 이유 설명)
  - `Git Best Practices` → `Version Control Awareness` (행동 + 근거)
  - `Security & Ethical Guidelines` → `Security-Conscious Code Generation` (구체적 기법: 파라미터 쿼리, XSS 이스케이프, 시크릿 관리)

---

## v1.0.49 (2026-04-02)

### 프롬프트 강화

- **Cyber Risk / OWASP 보안 프롬프트**: SQL injection, XSS, command injection 방지 지시 + 보안 테스트 윤리 가이드라인
- **Git 워크플로 프롬프트**: conventional commit, 파일별 staging, force push 금지, hooks skip 금지
- **코드 품질 프롬프트**: 과도한 추상화 금지, 불필요한 에러 처리 금지, 기존 스타일 유지
- **spawn_agent 프롬프트 강화**: sync vs background 결정 트리 (5가지 상황별 판단 가이드)

### UI 한글화

- **processStep 영어 → 한글**: `Preparing command` → `명령 준비 중`, `Running build/test validation` → `빌드/테스트 검증 실행 중`, `Auto-repair validation in progress` → `자동 수정 검증 진행 중`

---

## v1.0.48 (2026-04-02)

### 보안 강화

- **Zsh 위험 명령 차단**: `zmodload`, `emulate -c`, `sysopen`, `zpty`, `ztcp`, `zsocket` 6개 + `curl|bash`, `wget|bash`, `/proc/environ` 3개 추가 (총 +9 패턴)
- **읽기 전용 명령 화이트리스트**: `READ_ONLY_SAFE_COMMANDS` + `isReadOnlySafeCommand()` 인프라 추가 (INVESTIGATION 단계 적용 준비)

### 컨텍스트 압축 개선

- **9섹션 구조화 요약 프롬프트**: 4섹션 자유 형식 → 9섹션 구조화 (사용자 요청, 기술 개념, 파일/코드, 에러/수정, 문제 해결, 사용자 메시지, 대기 작업, 현재 상태, 다음 단계)
- **이미지 제거**: 압축 전 인라인 이미지를 `[image: mimeType]` 마커로 대체 → 토큰 절약

### 프로세스 관리

- **크기 감시 (watchdog)**: 프로세스 출력 10MB 초과 시 경고 로그 (stdout + stderr 모니터링)

### 프로젝트 감지

- **Go 스택 감지**: `go.mod` 파싱 — Go 버전, Gin/Echo/Fiber/Gorilla 프레임워크, GORM/sqlx/Ent ORM, go.work 워크스페이스 감지
- **Rust 스택 감지**: `Cargo.toml` 파싱 — Rust edition, `[workspace]` 모노레포, Actix-web/Axum/Rocket/Warp 프레임워크, Diesel/SQLx/SeaORM, Tokio/Serde 감지

---

## v1.0.47 (2026-04-02)

### 규칙/프롬프트 시스템 개선

- **규칙 우선순위 명시화**: `RulePrecedence` enum (1-10 레벨) + `RuleEntry` 인터페이스 — 규칙 간 충돌 시 예측 가능한 동작
- **Essential 규칙 (압축 후 보존)**: HotLoad(required) + 한국어 응답 규칙은 Tier2 압축 후에도 재주입
- **토큰 예산 체크**: 시스템 프롬프트가 모델 입력 토큰의 30% 초과 시 경고 로그
- **@include 지시자**: 규칙 파일에서 `@./shared/common.md`, `@~/path` 형태로 다른 파일 참조 — 순환 방지, 깊이 5 제한
- **조건부 규칙 (paths: frontmatter)**: 규칙 파일에 `paths: "src/**/*.tsx"` 지정 시 해당 파일 터치할 때만 로드 → 토큰 절약
- **상세 로깅**: 규칙 로드 시 precedence 레벨 + 토큰 수 상세 로그 출력

### AGENT 모드 안정화

- **FSM 강제 전환 14곳 우회**: CODE 모드의 REVIEW 강제 전환, 도구 호출 재촉, 텍스트 거부 등이 AGENT 모드에서 발동하지 않도록 `isAgentMode` 가드 추가
  - `transitionToReview` 8곳 가드
  - `executionNoToolRetryCount` nudge 2곳 가드
  - `naturalLanguageRetry` nudge 확인 (이미 도달 불가)
  - `handleBlockedTools` REVIEW 전환 가드
  - `consecutiveReadOnlyTurns` nudge 가드
  - "No file changes → REVIEW" 전환 가드
- **도구 실패 후 루프 계속**: AGENT 모드에서 도구 실패 시 REVIEW 전환 대신 LLM에게 재시도 기회 부여

---

## v1.0.46 (2026-04-02)

### AGENT 모드 신규

- **LLM 주도 오케스트레이션**: AGENT 모드는 TaskSplitter/ResultMerger를 우회하고, LLM이 `spawn_agent` 도구로 직접 worker를 스폰·관리
- **spawn_agent 도구**: 동기(blocking) / 비동기(background) worker 스폰 지원 — SubAgentLoop 재사용
- **stop_agent 도구**: 실행 중인 background worker 중단
- **AgentTaskManager**: 비동기 worker 상태 관리, `<task-notification>` XML 알림 큐
- **worker 알림 자동 주입**: 매 턴 시작 시 완료된 worker의 알림을 LLM 컨텍스트에 주입
- **worker 완료 대기**: LLM이 텍스트만 응답 + worker 실행 중 → 자동 대기 후 다음 턴
- **무제한 턴**: AGENT 모드는 턴 제한 없음 (LLM이 텍스트만 응답하면 종료)
- **FSM 완전 우회**: INVESTIGATION/EXECUTION/REVIEW 단계 없음, EXECUTION → DONE 직접 전환
- **REVIEW 스킵**: LLM의 마지막 텍스트 응답이 곧 리뷰 (별도 요약 LLM 호출 없음)
- **도구 제한 없음**: 모든 도구 항상 사용 가능, FSM 도구 필터링 비활성화
- **텍스트 재요청 방지**: EXECUTION에서 텍스트만 응답 시 CODE 모드의 강제 재촉 비활성화

### AGENT 모드 프롬프트

- **시스템 프롬프트 최적화**: AGENT 모드에서 `getObjective()`, `getCodeVsScriptRules()` 제외 (불필요한 plan/FSM 지시 절감)
- **spawn_agent 사용 가이드**: 언제 worker를 위임하고 언제 직접 할지 상세 지시
- **promptType 전달**: PromptBuilder → PromptComposer까지 promptType 파이프라인 연결

### AGENT 모드 UI

- **모드 드롭다운 순서**: CODE → AGENT → ASK → PLAN
- **보내기 버튼 색상**: AGENT=검정(#000000), ASK=초록, PLAN=파란
- **큐 전송 버튼 색상 동기화**: 대기 중 전송 버튼에도 모드별 배경색 적용
- **스트리밍 코드블록 즉시 표시**: 파일 생성 시 바로바로 코드블록 채팅에 표시 (post-stream 일괄 전송 → 즉시 전송)
- **스트리밍 커서 최하단 유지**: 코드블록 전송 전 커서 닫기 → 전송 후 재열기
- **shouldStreamToUI 활성화**: AGENT 모드에서 LLM 텍스트/코드블록 실시간 스트리밍

### AGENT 모드 에러 처리

- **runTestsAndTransition REVIEW 방지**: 테스트 통과해도 REVIEW 전환 안 함 (LLM이 완료 결정)
- **조기 REVIEW 전환 방지**: plan 완료 시 자동 REVIEW 전환 비활성화
- **멀티에이전트 수리 재시도**: AGENT=10회 / CODE=2회
- **동일 에러 반복 한계**: AGENT=3회 / CODE=1회
- **non-retryable 에러**: AGENT 모드는 한 번 수정 시도 허용

### 멀티에이전트 한글화

- **최종 요약 한글 강제**: `generateUnifiedSummary` 프롬프트에 한국어 CRITICAL 규칙 추가

### 기타

- **EXECUTION → DONE 직접 전환 허용**: AgentStateManager VALID_TRANSITIONS 추가
- **스트리밍 커서 도구 실행 전 닫기**: AGENT 모드에서 도구 실행 시작 시 `endStreamingMessage` 호출

---

## v1.0.45 (2026-04-02)

### 신규 기능

- **`ask_question` 도구 추가**: LLM이 사용자에게 다중 선택 질문을 할 수 있는 인터랙티브 도구 — requestId 기반 동시 호출 지원, 5분 타임아웃
- **ask_question 팝업 UI**: 입력 패널 위 인라인 팝업, 컴팩트 디자인 (max-height 300px, 11-12px 폰트, flex-wrap 옵션)

### PLAN 모드 개선

- **PLAN 모드 승인 팝업**: 계획 작성 후 VS Code 모달로 승인/거절 — 승인 시 자동 CODE 모드 실행
- **JSON 계획 출력 억제**: PLAN 모드에서 JSON plan이 채팅에 표시되지 않도록 차단
- **작업큐 숨김**: PLAN 모드에서 task queue UI 비표시
- **스트리밍 write 차단**: PLAN 모드에서 스트리밍 중 create_file 실행 방지
- **Investigation 자동 시작**: PLAN 모드 진입 시 항상 INVESTIGATION 단계부터 시작

### 버그 수정

- **read_file 실패 추적 제거**: `_readFailedPaths` 시스템 삭제 — create_file 차단 오류 해소
- **Investigation write 필터링**: 스트리밍 pre-execution에서도 PLAN 모드 체크 추가

---

## v1.0.44 (2026-04-01)

### 프롬프트 최적화

- **시스템 프롬프트 영문 전환**: 47개 파일의 LLM 프롬프트를 한글→영문으로 변환 — 시스템 프롬프트 토큰 ~85% 절감 (105K→16K 토큰)
- **한국어 응답 강화**: "CRITICAL Language Rule — NEVER respond in English" 지시 추가, plan/review/summary 헤딩 한국어 예시 포함
- **XML 태그 구조화**: 20개 프롬프트 섹션을 `<identity_and_rules>`, `<dev_rules>`, `<rag_context>` 등 XML 태그로 분리
- **Cursor 참고 규칙 추가**: 설명성 주석 금지, 바이너리/해시 출력 금지, 되돌리기 금지, 도구명 비노출, 병렬 호출 일반화

### 도구 & 검증 개선

- **`is_background` 파라미터** (`run_command`): LLM이 장기 실행 명령어를 명시적으로 백그라운드 지정 가능
- **타임아웃 30초 + 무조건 백그라운드**: 15초→30초 타임아웃, 초과 시 패턴 매칭 없이 즉시 백그라운드 전환
- **검증 명령어 lint 분리**: `npx tsc --noEmit && npm run lint` → `npx tsc --noEmit`만 (lint는 LLM이 필요 시 직접 실행). Python, Go도 동일 적용
- **Python 런타임 uv 우선**: `pyproject.toml` + `uv.lock` 존재 시 `uv run python`을 1순위로 감지
- **`expand_around_line` 도구 제거**: `read_file`의 startLine/endLine으로 완전 대체

### 컨텍스트 압축 개선

- **중복 read_file 최적화** (직접 실행 방식): 같은 파일 여러 번 읽으면 마지막 것만 보존
- **최신 파일 읽기 보호**: Tier1 압축에서 각 파일의 최신 read_file 결과는 잘라내지 않음 → update_file SEARCH 정확도 유지
- **keepRecentCount 4→4 유지**, 보호 영역 내 도구 결과는 3000자 초과 시만 잘라내기

### Investigation 단계 강화

- **write 도구 필터링**: Investigation에서 LLM이 read+write를 동시에 보내면 write 도구를 응답에서 제거, read만 실행
- **read then write 규칙 강화**: "STRICT: NEVER call read_file and update_file for the same file in the same response"

### UI 한글화

- **리뷰 헤딩**: `Task Complete`→`작업 완료`, `Changes`→`변경 사항`, `How to Use`→`사용 방법`
- **작업 상세**: `Task Details`→`작업 상세`, `Agent 1`→`에이전트 1`
- **작업큐**: plan title/detail 한국어 예시 + "MUST be written in Korean" 지시
- **빌드 에러 수정**: `Build/test error fix`→`빌드/테스트 에러 수정`
- **스트리밍 상태**: `Generating response`→`응답 생성 중`, toolLabels 한글 복원
- **동기화 시 프로젝트 목록 갱신**: syncSettings에서 프로젝트 목록도 함께 갱신

### 문서

- **프롬프트 최적화 계획** (`docs/PROMPT_OPTIMIZATION.md`): API 캐싱 로드맵
- **Claw-Code 분석** (`docs/CLAW_CODE_ANALYSIS.md`): 재구현체 상세 분석 및 30+ 개선 항목

---

## v1.0.43 (2026-03-31)

### 최적화

- **시스템 프롬프트 XML 태그 구조화** (`PromptComposer`): 모든 프롬프트 섹션을 `<identity_and_rules>`, `<dev_rules>`, `<rag_context>`, `<repo_map>` 등 XML 태그로 감싸기 — LLM 규칙 준수율 향상 (Anthropic/Cursor 권장 패턴)
- **대형 출력 잘라내기** (`RunCommandToolHandler`): 30,000자 초과 시 앞 15K + 뒤 15K 보존, 중간 생략 — npm install, ls -R, 빌드 로그 등에서 컨텍스트 오버플로 방지

---

## v1.0.42 (2026-03-31)

### 버그 수정

- **같은 턴 read_file + update_file 스킵 제거** (`ConversationManager`, `SubAgentLoop`): read_file과 update_file이 같은 턴에 있으면 무조건 update를 스킵하던 버그 수정 — 보호 파일(sensitive file)만 차단, 일반 파일은 허용
- **검증 명령어 `npm eslint .` 오류** (`ProjectDetector`): eslint/biome/standard 등 CLI 도구를 `npm` 대신 `npx`로 실행하도록 수정 — `npm eslint .`는 유효하지 않은 명령어
- **검증 명령어 우선순위** (`ProjectDetector`): package.json의 `lint`/`type-check`/`validate` 스크립트를 eslint 설정 파일보다 먼저 체크 — 프로젝트 작성자의 의도된 린트 옵션 우선 적용

### 개선

- **대화형 명령어 차단 추가** (`TerminalManager`): `npm init` 을 대화형 명령어 목록에 추가 — `npm init @eslint/config` 등 대화형 명령이 자동 실행되어 멈추는 문제 방지
- **서브에이전트 요약 길이 확대** (`types.ts`): `SUMMARY_MAX_LENGTH` 500 → 2500 — 멀티 에이전트 작업 상세가 잘리는 문제 해결
- **설정 동기화 시 프로젝트 목록 갱신** (`SettingsPanelProvider`, `settings.js`): 동기화 버튼 클릭 시 서버 설정과 함께 프로젝트 목록도 갱신

### 문서

- **프롬프트 최적화 계획** (`docs/PROMPT_OPTIMIZATION.md`): API 캐싱, 대형 출력 처리, XML 태그 구조화 분석 및 구현 로드맵

---

## v1.0.41 (2026-03-31)

### 기능 추가

- **프로젝트별 설정**: IDE에서 프로젝트 선택 → 프로젝트별 AI 모델, MCP, RAG, 스킬, 보안 규칙 적용
- **팀 기본/프로젝트 분리 표시**: 설정 화면에서 팀 기본 설정과 프로젝트 설정을 구분 표시
- **스킬 참조 추적 강화**: IntentDetector + load_skill 두 경로로 정확한 스킬 참조 표시

### 보안

- **하드코딩 차단 명령어** (`PreToolUseValidator`): 11개 위험 명령어 기본 차단 (rm -rf /, chmod 777, curl|sh 등)
- **보호 파일 체크** (`ConversationManager`): 같은 턴 read+update 시 민감 파일(.env 등) 수정 차단

### 개선

- **Ollama max output** (`OllamaApi`): `num_predict: 16384`로 일관된 최대 출력 토큰 설정
- **RAG 유사도 임계값**: 80% → 75%로 조정 (검색 결과 0건 방지)

---

## v1.0.40

### 버그 수정

- **서브에이전트 `__done__` 가상 도구 등록** (`ToolSpecBuilder`, `SubAgentLoop`): 네이티브 툴 콜링에서 `__done__`이 tools 목록에 없어 `run_command`로 실행되던 버그 수정 — `buildOpenAIToolsConfig(allowedTools, true)`로 서브에이전트용 `__done__` 도구 자동 등록
- **서브에이전트 중복 read_file 무한 루프** (`SubAgentLoop`): 크로스턴 중복 read skip 시 파일 내용 미포함으로 LLM이 재요청 반복하던 문제 수정 — skip 피드백에 실제 파일 내용(최대 5,000자) 포함
- **update_file 반복 실패 감지** (`UpdateFileToolHandler`): 같은 파일에 같은 SEARCH 패턴으로 2회+ 실패 시 "이미 수정된 파일" 경고 + 파일 프리뷰 확대 (3K→8K자)

### 개선

- **에러 수정 프롬프트 강화** (`base.ts`, `OrchestrationRouter`): 패키지 누락 에러는 코드 수정이 아닌 패키지 설치로 해결 지시 + lock 파일 기반 패키지 매니저 선택 (uv/npm/yarn/pnpm) — 서브에이전트/repair 에이전트에도 적용
- **서브에이전트 토큰 최적화** (`OrchestrationRouter`, `SubAgentLoop`): Hot Load 제외, RAG 유사도 80%+ 필터링 (5→3개 제한), 대화 압축 (30K chars 초과 시 중간 도구 결과 요약)
- **RepoMap 제외 패턴 확장** (`RepoMapGenerator`): `.venv`, `.pyenv`, `.gradle`, `target`, `.idea`, `cmake-build-*`, `bin`, `obj`, `.hg`, `.svn` 등 20+ 패턴 추가
- **Thinking 레벨 선택** (`SettingsPanelProvider`, `settings.html`, `GeminiProvider`, `OpenAICompatProvider`): 설정에서 Low/Medium/High 선택 가능, 기본값 Medium — 설정 내보내기/가져오기에도 포함
- **Abort signal 전파 강화** (`ToolExecutor`, `TestRunner`, `ConversationManager`, `SubAgentLoop`): 도구 실행, 테스트 실행에 abort signal 전달 — 취소 시 진행 중인 도구/테스트도 중단

---

## v1.0.39

### 기능 추가

- **서브에이전트 모델 라우팅** (`StateManager`, `LLMManager`, `SubAgentLoop`, `SettingsPanelProvider`, `settings.html`): 멀티 에이전트 실행 시 서브에이전트가 메인 모델과 다른 모델을 사용할 수 있도록 설정 UI + 모델 전환 로직 추가
- **서브에이전트 스킬 로드 도구** (`LoadSkillToolHandler`, `ToolSpecBuilder`): 서브에이전트가 `load_skill` 도구로 필요한 스킬을 on-demand 로드 — 메인 IntentDetector가 추천한 candidateSkillKeys 힌트 + 스킬 description 목록 제공, 서브에이전트가 판단하여 필요한 스킬만 로드
- **서브에이전트 스킬 전달 구조** (`OrchestrationRouter`): 메인 IntentDetector → candidateSkillKeys 수집 → 서브에이전트 시스템 프롬프트에 스킬 description + 후보 힌트 포함 (전체 스킬 포함 대신 선택적 로드)

---

## v1.0.38

### 개선

- **LLM 재시도 강화** (`LLMRetryHelper`, `OllamaApi`): 최대 retry 3→5회, base delay 1s→2s, max delay 30s로 통일 — 일시적 429/500/503 복구율 향상
- **Hidden Retry** (`LLMRetryHelper`, `LLMManager`): 처음 2회 재시도는 UI에 표시하지 않음 — 1~2초에 복구되는 일시적 에러로 유저 불안감 제거
- **에러별 재시도 메시지** (`LLMRetryHelper`): 429(요청 한도 초과), 500/503(응답 오류), 502(게이트웨이 오류), ECONNREFUSED(서버 연결 불가) 등 에러 유형별 한국어 메시지 + "N초 후 재시도합니다" 카운트다운 표시
- **Retry-After 헤더 지원** (`OllamaApi`): HTTP 응답의 Retry-After 헤더를 파싱하여 서버 지정 대기 시간 준수
- **스트리밍 기본값 ON** (`package.json`): `codepilot.streamingEnabled` 기본값 false→true로 변경

### 기능 추가

- **계정 탈퇴** (`SettingsPanelProvider`, `settings.html`): IDE 설정 하단에 계정 탈퇴 버튼 추가 — "탈퇴" 입력 확인 후 `DELETE /auth/me/` 호출

---

## v1.0.37

### 기능 추가

- **`ripgrep_search` 고급 옵션 추가** (`RipgrepSearchToolHandler`, `FileSearcher`, `ToolSpecBuilder`): `outputMode`(content/files_with_matches/count), `multiline`(여러 줄 패턴 매칭), `headLimit`(상위 N개 결과 제한) 파라미터 추가 — LLM이 파일 목록만 받거나 결과를 잘라서 토큰 절감 가능
- **Ollama 네이티브 툴 콜링 활성화** (`ConversationManager`): 설정에서 네이티브 툴 콜링 ON 시 Ollama 로컬 모델에도 `tools` 배열이 API 요청에 포함되도록 분기 추가 — 기존에는 Admin 모델만 동작했고 Ollama는 설정 ON해도 무시됨

### 버그 수정

- **standalone `FileChangeHandler` import 경로 수정** (`FileChangeHandler.ts`): `../../managers/context/file/FileSearcher` → `../../context/file/FileSearcher`로 수정 — 빌드 warning 해소

---

## v1.0.36

### 버그 수정

- **취소(Cancel) 후 REVIEW 단계가 계속 실행되는 버그 수정** (`ConversationManager`): AbortSignal이 발동된 후에도 `runTestsAndTransition` 호출이 이어져 REVIEW 단계까지 진행되던 문제 수정 — while 루프 내 7개 호출 지점 및 루프 외 2개 지점에 `abortSignal?.aborted` 조기 종료 체크 추가
- **취소 후 OrchestrationRouter 요약 LLM 호출이 계속 실행되는 버그 수정** (`OrchestrationRouter`): 서브 에이전트 중단 후에도 `generateUnifiedSummary` 및 `formatMergedResult` 호출이 이어지던 문제 수정 — 요약 생성 전후에 `abortSignal?.aborted` 체크 추가
- **PLAN 모드에서 파일이 생성되는 버그 수정** (`OrchestrationRouter`, `ConversationManager`): PLAN 모드가 멀티 에이전트로 분기되어 서브에이전트가 파일을 생성하던 문제 수정 — PLAN/ASK 모드는 단일 에이전트로 강제 라우팅
- **PLAN 모드 EXECUTION 단계에서 도구 호출이 강제되는 버그 수정** (`ConversationManager`): EXECUTION 단계 프롬프트(`getExecutionPhasePrompt`)가 planPrompt를 덮어써 LLM이 계획 텍스트 대신 도구 호출을 생성하던 문제 수정 — `isPlanMode` 시 EXECUTION 단계 프롬프트를 "텍스트로 계획 출력" 지시로 교체
- **PLAN 모드 자연어 응답이 nudge로 거부되는 버그 수정** (`ConversationManager`): LLM이 계획 텍스트를 출력해도 "write 이력 없음" nudge 로직이 도구 호출을 강제하던 문제 수정 — `isPlanMode` 시 nudge 건너뜀
- **PLAN 모드 자연어 응답이 두 번째 거절 로직에 의해 재요청되는 버그 수정** (`ConversationManager`): EXECUTION 단계의 Output Contract 위반 거절 로직이 PLAN 모드 텍스트 응답도 거부하던 문제 수정 — `!isPlanMode` 조건 추가
- **PLAN 모드 루프가 종료되지 않는 버그 수정** (`ConversationManager`): 계획 텍스트 출력 후에도 루프가 계속 돌던 문제 수정 — 실제 계획 텍스트가 있을 때 `break`로 루프 종료, `<think>` 태그만 있을 경우 재요청
- **PLAN 모드 계획 텍스트가 UI에 표시되지 않는 버그 수정** (`ConversationManager`): EXECUTION 단계는 UI 스트리밍이 차단되어 있어 계획 텍스트가 화면에 나타나지 않던 근본 원인 수정 — `shouldStreamToUI` 조건에 `|| isPlanMode` 추가

### 보안 개선

- **콘솔 로그 민감 데이터 제거** (`OllamaApi`, `TerminalManager`, `IntentDetector`, `HotLoadManager`, `CreateFileToolHandler`, `UpdateFileToolHandler`, `ConversationManager`): LLM 응답 본문, 파일 내용, 터미널 출력, 사용자 쿼리 원문 등이 로그에 그대로 출력되던 부분을 길이(chars)만 표시하도록 일괄 변경

---

## v1.0.35

### 버그 수정

- **에러 수정 요청 시 memory-only INVESTIGATION 턴에서 작업 없이 종료되는 버그 수정** (`ConversationManager`): `@diagnostics` 첨부 후 "에러 수정해줘" 요청 시 INVESTIGATION 페이즈에서 LLM이 `memory_save`만 호출하면 DONE으로 바로 전환되어 실제 수정이 이루어지지 않던 문제 수정 — `terminal` / `code_work` taskType인 경우 memory-only 조기 종료 로직을 건너뛰고 다음 턴에서 실제 작업을 수행하도록 처리

### 개선

- **`list_files` 툴 설명 명확화** (`ToolSpecBuilder`): "디렉토리 구조 파악 전용" 용도를 명시하고 파일 검색 시 `glob_search` / `ripgrep_search` 사용을 안내 — LLM이 파일 검색에 `list_files`를 남용하는 패턴 방지
- **`ListFilesToolHandler` `.gitignore` 지원 추가**: 프로젝트 루트의 `.gitignore`를 읽어 파일 탐색 시 자동으로 제외 — 기본 제외 디렉토리 목록 확장 (`.venv`, `coverage`, `.pytest_cache`, `.gradle`, `Pods`, `.terraform`, `logs` 등 추가)
- **`SubAgentLoop` 시스템 프롬프트 규칙 추가**: 파일 검색 시 `glob_search` / `ripgrep_search` 우선 사용, `node_modules` 등 빌드 아티팩트 탐색 금지, RAG 컨텍스트 재사용 규칙 명시
- **`ToolParser` 응답당 최대 툴콜 수 조정**: 30개 → 20개로 축소 — LLM이 과도한 파일 탐색 툴콜을 반복하는 토큰 폭발 방지
- **설정 패널 컨텍스트 제외 설명 추가** (`settings.html`): `.gitignore`에 등록된 경로는 LLM 파일 탐색 시 자동으로 제외됨을 안내

---

## v1.0.34

### 기능 추가

- **`/restore-session`, `/delete-session` 슬래시 커맨드 추가**: `/` 메뉴 세션 카테고리에 세션 복원(`/restore-session`)과 세션 삭제(`/delete-session`) 항목 추가 — 삭제는 QuickPick 다중 선택 후 확인 모달을 거쳐 처리 (`commands.js`, `sessionCommands.ts`, `ChatViewProvider.ts`)

### 버그 수정

- **Formatter 중복 실행 수정** (`ConversationManager`, `executeToolsWithUI`): `afterFileChanges` 호출 시 누적된 전체 `modifiedFiles`를 넘기던 것을 이번 도구 실행에서 새로 변경된 파일만 넘기도록 수정 — 이전 턴의 pending diff가 남아있는 경우 `run_command` 등 파일 변경 없는 도구 실행 후에도 ruff 등 포매터가 반복 실행되던 문제 수정
- **plan item 실행 중 `__done__` Unknown tool 에러 수정** (`ConversationManager`): LLM이 plan item 완료 시 `__done__`을 호출하면 `ToolExecutor`가 "Unknown tool: __done__" 에러를 반환하여 패널에 ❌가 표시되던 문제 수정 — `executeToolsWithUI` 전달 전에 `__done__`을 필터링하여 처리 (멀티에이전트 SubAgentLoop의 `__done__` 처리에는 영향 없음)

---

## v1.0.33

### 버그 수정

- **update_file SEARCH 블록 생략 표현 감지 및 조기 실패** (`UpdateFileToolHandler`): LLM이 SEARCH 블록에 `... (생략됨)`, `// ...`, `...` 등 생략 표현을 사용할 경우 파일 매칭 시도 없이 즉시 `ELLIPSIS_IN_SEARCH` 에러 반환 — 기존에는 `PATTERN_NOT_FOUND` 실패 후 `__done__` 거부 루프가 반복되던 문제 수정

### 개선

- **SubAgentLoop 시스템 프롬프트 규칙 추가**: SEARCH 블록에 생략 표현 사용 금지 규칙 명시 — LLM이 처음부터 파일의 실제 코드를 그대로 작성하도록 예방

---

## v1.0.32

### 기능 추가

- **PLAN 모드 추가**: CODE / ASK 모드 외 새로운 세 번째 모드. 코드베이스 탐색 후 구현 계획 Markdown을 생성하는 읽기 전용 모드 (Plan-Act 패턴)
  - `PromptType.PLAN` 열거값 추가 (`src/services/types.ts`)
  - 드롭다운에 PLAN 옵션 추가 (`webview/chat.html`) — `applyMode()` 정규화 업데이트
  - `ChatViewProvider`: `data.mode === 'PLAN'` → `PromptType.PLAN` 매핑
  - `planPrompt.ts` 신규 생성: 읽기 전용 탐색 지시 + 구조화된 계획 출력 형식 (개요/분석결과/변경대상/구현단계/리스크/난이도)
  - `PromptBuilder`: `PromptType.PLAN` 분기 추가
  - `ConversationManager`: PLAN 모드를 `executeAgentLoop` 경로로 라우팅 (CODE 모드와 동일한 에이전트 루프)
  - `executeToolsWithUI`에 `isPlanMode` 플래그 추가 — `create_file`, `update_file`, `delete_file`, `run_command` 호출 시 프레임워크 레벨에서 즉시 차단, LLM에 읽기 전용 안내 피드백 반환

### 버그 수정

- **PLAN 모드 실행 루프 무한 반복 수정** (`ConversationManager`): 쓰기 도구 차단 후 "파일 변경 없음 → 재시도 강제" 루프에 빠지던 문제 수정 — `isPlanMode`일 때 재시도 건너뛰고 텍스트 응답(플랜 내용)을 즉시 표시 후 REVIEW 단계로 종료
- **SubAgentLoop 읽기 전용 모드 스트리밍 파일 생성 우회 수정**: `toolPermission !== 'full'`일 때 `onNativeToolComplete` 및 `onChunk` 스트리밍 핸들러에서 `create_file` 실행 차단 — 기존에는 post-stream 권한 검사 이전에 스트리밍 단계에서 파일이 생성되던 문제

### 개선

- **보내기 버튼 색상 통일** (`webview/chat/theme-language.js`, `webview/chat/input-handler.js`, `webview/chat.html`): ASK 모드는 라이트/다크 테마 모두 `#10B981` (초록), PLAN 모드는 라이트/다크 테마 모두 `#2563EB` (파란)으로 통일
- **SubAgentLoop RAG 탐색 제한 규칙 제거**: "RAG에 있는 문서는 로컬 파일시스템에서 중복 탐색하지 마세요" 규칙 제거 — RAG 문서도 로컬 파일시스템에서 탐색 가능하도록 원복

- **도구 설명 개선**: `stat_file` / `ripgrep_search` / `list_files` / `glob_search` 설명에 용도 구분 명확화 — 줄 번호 필요 시 `ripgrep_search` 직접 사용 유도
- **집계 태스크 재조회 방지**: `OrchestrationRouter.generateUnifiedSummary()` 시스템 프롬프트에 "선행 태스크 결과는 이미 검증됨, 재조회 금지" 규칙 추가
- **SubAgentLoop 크로스 턴 stat_file 중복 방지**: `alreadyStattedFiles` Set 추가 — 동일 파일 stat_file 재호출 스킵 및 synthetic 피드백 반환
- **서브에이전트 __done__ 요약 품질 강화**: 파일 경로·크기·줄 번호 등 구체적 수치를 요약에 포함하도록 규칙 추가
- **의존성 태스크 재조회 방지**: `buildSystemPrompt()`에서 `dependencies.length > 0`일 때 "선행 태스크 요약의 정보를 도구로 재조회하지 말 것" 규칙 주입
- **ConversationManager 크로스 턴 stat_file 중복 방지**: 싱글에이전트 루프에도 `alreadyStattedFiles` Set 및 필터링 로직 적용

---

## v1.0.31

### 기능 추가

- **스트리밍 중 파일 생성 즉시 pending 지원**: `도구 자동 실행 OFF` 또는 `파일 자동 업데이트 OFF` 상태에서 스트리밍 응답 중 `</file_content>` 감지 즉시 (혹은 네이티브 tool_call 완성 즉시) 승인 모달 표시. 기존에는 스트리밍 완료 후 일괄 처리했으나 이제 파일별로 즉시 순차 처리
  - `executeStreamingCreateFile(needsApproval)` / `executeStreamingCreate(needsApproval)` — 승인 필요 여부 파라미터 추가
  - `onNativeToolComplete` — ON+ON 제한 제거, 도구/파일 OFF 시에도 즉시 pending 처리
  - `onChunk` else 브랜치 — 위치 추적만 하던 것에서 `</file_content>` 감지 즉시 `onToolApprovalRequired` 콜백 호출로 변경
  - `streamingHandledPaths` Set 추가 — 스트리밍 중 pending 처리된 경로 추적, post-stream 중복 모달 방지
  - 거부 시 post-stream에서 재처리하지 않음 (LLM에 "[거부됨]" 피드백 전달)
  - `ConversationManager`, `SubAgentLoop` 모두 적용 (싱글/멀티에이전트)

---

## v1.0.30

### 기능 추가

- **SubAgentLoop 도구 승인 pending 지원**: 멀티에이전트 실행 시에도 싱글에이전트와 동일하게 도구 자동 실행 설정을 준수하도록 변경
  - `AgentLoopCallbacks`에 `onToolApprovalRequired` 콜백 추가
  - `OrchestrationRouter`에서 설정 읽어 콜백 주입 — 기존 `checkToolNeedsConfirmation` 로직 동일하게 재현
  - 도구 OFF: 모든 도구 pending, 파일 OFF: create/update_file pending, 명령어 OFF: run_command pending
  - 승인 대기 시간은 `SUB_AGENT_TOTAL_TIMEOUT`에서 제외 (`pausedDuration` 추적)
  - 거부된 도구는 LLM에 `[거부됨]` synthetic 피드백으로 전달

- **Native tool calling 시스템 프롬프트 분기**: `nativeMode` 플래그를 전체 프롬프트 생성 체인에 전파하여 네이티브 모드에서 코드블록 형식 교육을 완전히 제거
  - `getNativeToolCallingFormatPrompt()`, `getNativeToolSpecPrompt()`, `getNativeWorkflowGuidelinePrompt()` 추가
  - `buildToolPromptSection(specs, nativeMode?)` — nativeMode 분기
  - `PromptComposer`, `PromptBuilder`, `ConversationManager`, `SubAgentLoop` 전체 체인에 `nativeMode` 전파
  - `getBaseRules`, `getFileOperationsRules`, `getCodeVsScriptRules`, `getNoThinkingLeakageRules` 모두 nativeMode 조건 분기

---

## v1.0.29

### 개선

- **검증 명령어 COMMAND_NOT_FOUND 처리 개선**: 설치되지 않은 명령어 발견 시 LLM에게 바로 물어보는 대신 하드코딩된 다음 후보를 먼저 시도하도록 변경. 후보 소진 후 LLM 추천 (마지막 수단)
  - 설정된 명령어(`validationCommand`)가 없는 경우: UI에 "설정하신 '[명령어]'를 찾을 수 없습니다. 자동 감지 명령어로 대체합니다." 알림 표시
  - 하드코딩 자동 감지 명령어가 없는 경우: 조용히 다음 후보 탐색
  - `ProjectDetector.getValidationCommand()` 반환에 `fromSettings` 필드 추가로 출처 구분

---

## v1.0.28

### 개선

- **Thinking 스트리밍 중 최신 내용 표시**: 접힌 상태에서 thinking 블록이 업데이트될 때 항상 최신 내용(하단)이 보이도록 수정. CSS `position: absolute; bottom: 0` bottom-anchor 방식으로 변경, `processing-steps.js`에서 `.thinking-text-inner` inner div 구조로 업데이트
- **노이즈 로그 제거**: 디버그용 console.log 다수 제거
  - `[WebviewBridge] sendProcessingStatus called` / `sendProcessingStep called`
  - `[InlineDiffManager] Persisted state` / `Shadow synced to formatter output` / `Turn snapshot captured`
  - `[GeminiProvider] chunk parts` / `🧠 thinking start`
  - `[ToolRegistry] Registered tool`
  - `[ActionRegistry] Registered action` / `Default actions registered`

---

## v1.0.27

### 기능 추가

- **Thinking On/Off 설정**: 세팅 화면에 Thinking 활성화 토글 추가. OFF 시 모델이 지원하는 경우에도 thinking 완전 비활성화. SettingsManager → OrchestrationRouter → SubAgentLoop 연동 (`codepilot.thinkingEnabled`)
- **스트리밍 중 create_file 즉시 실행 (Fix 8)**: 스트리밍 응답 수신 중 `</file_content>` 닫는 태그가 완성될 때마다 즉시 파일 생성 실행. Promise 체인으로 직렬 실행 보장. 응답 완료 후 중복 실행 방지

### 버그 수정

- **`<think>` 블록 내 JSON이 tool call로 실행되는 문제 (Fix 1)**: SubAgentLoop에서 ToolParser 호출 전 `THINKING_TAG_REGEX`로 think 블록 제거. LLM 히스토리에는 원본 유지
- **크로스턴 read_file 스킵 시 silent drop 제거 (Fix 4)**: `alreadyReadFiles`로 스킵된 read_file에 대해 synthetic 피드백 추가. "이미 읽었습니다, 다시 호출하지 마세요" 메시지를 LLM에 전달하여 루프 방지

### 개선

- **max_tokens 잘림 감지 및 LLM 피드백 (Fix 7)**: GeminiProvider (`finishReason=MAX_TOKENS`), OpenAICompatProvider (`finish_reason=length`), AnthropicProvider (`stop_reason=max_tokens`) 세 프로바이더 모두에서 응답 잘림 감지. `[MAX_TOKENS_REACHED]` 마커를 응답에 추가하고 SubAgentLoop에서 감지 후 계속 요청 메시지 주입

---

## v1.0.26

### 기능 추가

- **SubAgentLoop Native Tool Calling 실제 구현**: `nativeToolCallingSupported=true` 설정 시 SubAgentLoop의 LLM 호출(스트리밍/비스트리밍 모두)에 `nativeTools`를 실제로 전달. 기존에는 `disableThinking` 제어에만 반영되고 실제 API-level function calling은 미동작하던 문제 해결. `isNativeAdmin` 및 `nativeTools` 계산을 루프 밖으로 이동하여 매 턴 중복 계산 제거

### 버그 수정

- **OpenAICompatProvider Gemini thinking 400 에러 수정**: Gemini OpenAI-compat 엔드포인트(`/v1beta/openai/chat/completions`)에서 지원하지 않는 `thinking_config`, `google` 키 전송으로 발생하던 400 Bad Request 수정. `reasoning_effort: 'high'`로 대체
- **Think 블록 내 JSON이 tool call로 파싱되는 문제**: `<think>` 블록을 strip하지 않고 ToolParser에 전달하여 thinking 중 작성한 예시 JSON이 실제 tool call로 실행되던 문제 확인 (TaskSplitter, RelevantFilesFinder, PlanManager, ProjectManager의 JSON 추출은 이미 strip 적용)
- **LLMManager `resolveDisableThinking` native tools 연동**: native tools 사용 시 thinking을 비활성화하지 않도록 `hasNativeTools` 파라미터 추가. 기존에는 시스템 프롬프트에 tool spec이 있으면 무조건 thinking 비활성화

### 개선

- **SubAgentLoop 턴 간 중복 read_file 방지**: `alreadyReadFiles` Set으로 이미 읽은 파일 경로를 추적하여 동일 파일을 다음 턴에서 재시도하는 할루시네이션 패턴 차단
- **UpdateFileToolHandler SEARCH 실패 에러 메시지 개선**: SEARCH 블록 매칭 실패 시 "read_file로 현재 내용을 읽고 정확히 복사하세요" 안내 추가. 모델이 파일을 읽지 않고 메모리로 SEARCH 블록을 생성하는 패턴 방지 유도

---

## v1.0.25

### 기능 추가

- **`__done__` 가상 도구 기반 서브에이전트 완료 감지**: SubAgentLoop에 `__done__` 가상 도구 도입. LLM이 `{ "tool": "__done__", "status": "completed"|"already_done", "summary": "..." }` 형태로 명시적 완료 선언. 기존 텍스트 길이 기반 heuristic(200자 이상 응답 시 완료 간주) 제거
- **`doneStatus` 결과 필드 추가**: `AgentLoopResult`에 `doneStatus?: 'completed' | 'already_done'` 필드 추가. 의존 태스크가 선행 태스크의 완료 상태를 정확히 파악 가능

### 버그 수정

- **`__done__`과 다른 도구가 같은 턴에 호출될 때 도구 실행 누락 수정**: LLM이 `create_file`, `update_file` 등과 함께 `__done__`을 같은 턴에 호출하면, `__done__`이 도구 실행 전에 감지되어 모든 실제 도구 호출이 스킵되던 치명적 버그 수정. `__done__`을 분리하여 다른 도구 실행 완료 후 처리하도록 변경
- **`warnings` 변수 섀도잉 수정**: SubAgentLoop 내 ToolParser 결과 처리에서 `const warnings`가 외부 `warnings` 배열을 섀도잉하여 에이전트 레벨 경고가 누락되던 문제 수정. `parseWarnings`로 이름 변경
- **스트리밍 상태 스팸 수정**: `parseStreamingToolStatus`가 성장하는 버퍼 전체를 반복 스캔하여 동일 도구 상태를 중복 감지하던 문제 수정. `lastScanPos` 추적으로 새 컨텐츠만 스캔
- **ToolParser `__done__` 차단 수정**: `isValidToolName()`이 Tool enum과 ToolRegistry만 검사하여 `__done__` 가상 도구가 거부되던 문제 수정. `__done__` 예외 추가

### 개선

- **`already_done` 경고 스킵**: `__done__(already_done)` 완료 시 "파일 수정 없이 완료됨" 경고를 생성하지 않음. 이미 구현된 기능을 확인만 한 경우 불필요한 경고 제거
- **의존 태스크 `already_done` 컨텍스트 주입**: `enrichWithPriorResults`에서 선행 태스크의 `doneStatus`를 명시적으로 전달. 모든 선행이 `already_done`이면 "이미 구현되어 있으니 확인 후 `__done__`하라" 안내를 의존 태스크에 주입하여 불필요한 파일 재탐색 방지
- **"(경고 있음)" 상태 메시지 제거**: OrchestrationRouter 완료 상태에서 `'완료 (경고 있음)'` 분기 제거. 성공 시 항상 `'완료'`로 표시

---

## v1.0.24

### 버그 수정

- **read_file 전용 retry 턴 TestRunner 스킵**: retry 중 LLM이 read_file만 실행하고 write tool을 사용하지 않은 턴에서 TestRunner가 동일한 코드를 다시 실행하여 retry 횟수를 낭비하던 문제 수정. `hasWriteToolSinceLastTest` 파라미터를 `runTestsAndTransition`에 추가하여 write tool 없는 턴에서는 테스트 스킵

### 개선

- **의존 태스크 update_file 안내 강화**: `enrichWithPriorResults`에서 선행 태스크가 생성한 파일을 의존 태스크에 알릴 때 `create_file`로 덮어쓰지 말고 `update_file`을 사용하라는 명시적 안내 추가
- **스캐폴딩 도구 사용 금지 프롬프트 추가**: SubAgentLoop 및 base rules에 `create-vite`, `create-react-app` 등 스캐폴딩 도구 사용 금지 규칙 추가. 설정 파일과 소스 코드를 `create_file`로 직접 생성하도록 유도
- **상태 메시지 개선**: `'응답 생성 중...'` → `'LLM 응답 대기 중...'`으로 변경 (ConversationManager, OrchestrationRouter)
- **AgentConfig 타임아웃 주석 수정**: `SUB_AGENT_LLM_CALL_TIMEOUT` 주석 `(2분)` → `(6분)`으로 실제 값과 일치하도록 수정

---

## v1.0.23

### 개선

- **의존성 설치 프롬프트 기반 전환**: DependencyInstaller 삭제. 시스템 레벨 자동 설치 대신 LLM이 프롬프트 지시에 따라 직접 의존성 설치 수행. 업계 표준 방식과 동일
- **TestRunner/OrchestrationRouter 자동 설치 제거**: TestRunner의 `checkEnvironmentHealth()` + `attemptInstall()`, OrchestrationRouter의 ENVIRONMENT_MISSING 자동 수정 블록 제거. 모든 의존성 에러는 LLM repair agent가 처리
- **AutoRemediator 간소화**: 의존성 설치 기능(`attemptInstall`, `runInstallCommand`, ENVIRONMENT_MISSING 케이스) 제거. BUILD_TIMEOUT 빌드 캐시 클리어만 유지
- **의존성 설치 프롬프트 간소화**: 8줄 패키지 매니저 열거 → 4줄로 축소. LLM이 이미 알고 있는 매핑은 생략하고 핵심 규칙만 명시
- **FileChangeHandler projectTypeCache 추가**: 프로젝트 타입 감지 결과를 세션 단위 static 캐시로 저장. 동일 프로젝트 반복 감지 방지

---

## v1.0.22

### 버그 수정

- **Single Loop 조기 종료 수정**: plan 없이 실행 시 도구 하나 성공만으로 "작업 완료"로 판정하던 버그 수정. plan이 생성되지 않은 상태에서는 조기 종료를 금지하고 LLM에게 다음 턴을 줘서 계속 작업하게 함. plan 존재 여부(`taskManager.listPlanItems()`)로 종료 판정 (2개 exit point 모두 수정)
- **TestRunner sub-project 경로 rebase 수정**: sub-project 감지 시 `workspaceRoot` 변경 후 `createdFiles`/`modifiedFiles` 경로가 이중 프리픽스되던 문제 수정. `effectiveCreatedFiles`/`effectiveModifiedFiles`로 rebase하여 모든 downstream 호출에 전달
- **TestRunner stepProcess 미표시 수정**: OrchestrationRouter validation 중 TestRunner가 `"executing"` step으로 상태를 보냈지만 실제 활성 step은 `"review"`여서 UI에 표시되지 않던 문제 수정. `uiStep` 파라미터를 추가하여 호출 컨텍스트에 따라 step을 동적 전달

### 개선

- **stepsProcess 프리픽스 제거**: OrchestrationRouter의 서브태스크 상태에서 `(2/3)` 스타일 progressLabel 프리픽스 제거
- **도구 완료 후 "응답 생성 중..." 표시**: 도구 완료 후 stale 상태("파일 생성 중: xxx")가 남아있던 문제 개선. onToolComplete 콜백에서 "응답 생성 중..." 상태로 업데이트
- **서브태스크 완료 상태에서 턴/초 제거**: `(2턴, 27초)` 형식의 실행 정보를 stepsProcess에서 제거
- **비범용 프롬프트 수정**: rules.ts, base.ts에서 React+TS+Vite 하드코딩 예시를 스택 중립적으로 변경. OS 프롬프트의 마크다운 코드 블록 규칙을 `run_command` 도구 사용으로 통일

---

## v1.0.21

### 버그 수정

- **Processing Step 테스트 검증 상태 미표시 수정**: ToolExecutionCoordinator에서 step name이 `'execution'`으로 전송되어 TestRunner의 `'executing'`과 별도 항목으로 등록되던 문제 수정. `'executing'`으로 통일하여 테스트 검증 실패/성공 상태가 정상 표시
- **빈 파일 생성 거부 수정 (`__init__.py` 등)**: ToolParser가 빈 content를 거부하고, CreateFileToolHandler가 placeholder로 판정하여 `__init__.py`, `.gitkeep`, `.keep` 등 빈 파일 생성이 불가능하던 문제 수정. 빈 문자열 content 허용 + allowEmpty 파일명 예외 추가

### 개선

- **Processing Step 타이핑 애니메이션 최적화**: 도구 연속 실행 시 20ms/char 타이핑 애니메이션이 UI를 지연시키던 문제 개선. 150ms 이내 연속 업데이트 시 애니메이션 생략하고 즉시 표시. 기본 타이핑 속도 20ms → 10ms로 단축
- **RAG 유사도 임계값 조정**: 문서 검색 유사도 임계값을 85% → 80%로 하향. 관련 문서가 임계값 미달로 누락되던 문제 개선

---

## v1.0.20

### 성능 개선

- **대화 압축 3-Tier 전략**: Tier 1 (60% 토큰 사용 시 LLM 호출 없이 오래된 도구 결과 축약), Tier 2 (80% 시 LLM 요약), Tier 3 (폴백 시 한번에 70% 삭제 대신 라운드당 25%씩 점진적 제거, 최대 3라운드). 컨텍스트 윈도우를 더 효율적으로 활용
- **read_file 중복 제거**: 동일 파일을 여러 번 읽은 경우 마지막 읽기만 유지하고 이전 읽기는 짧은 요약으로 대체. accumulatedUserParts 메모리 절감
- **Investigation 스킵 최적화**: LLM IntentDetector의 `requiresPlan: false` 판정 시 code/execution 카테고리를 EXECUTION 단계로 직행. 불필요한 INVESTIGATION 턴 절감
- **토큰 추정 정확도 향상**: BPE 토크나이저 실측 기반으로 코드 기호(`{ } ( ) ; :` 등)를 별도 분류하여 1:1 토큰 매핑. 영숫자 비율을 4→3.5 문자/토큰으로 조정
- **스트리밍 버퍼 크기 제한**: StreamingCodeApplier rawBuffer에 512KB 상한 추가. 초과 시 컨텍스트 인식 flush로 메모리 누수 방지

---

## v1.0.19

### 버그 수정

- **Thinking Bubble 최상단 고정 문제 수정**: 질의 시 stepProcess가 질의 아래가 아닌 최상단에 고정되던 문제 수정. `scrollIntoView({ block: "end" })`가 버블을 입력 영역 뒤에 배치하여 `is-forced-top`이 즉시 적용되던 문제를 `chatContainer.scrollTo()`로 변경하여 `padding-bottom`이 보상하도록 수정
- **Thinking Bubble 스크롤 복귀 시 해제 안 되는 문제**: 스크롤을 올렸다 내리면 `_bubbleNaturalScrollOffset`이 갱신되지 않아 `is-forced-top`이 해제되지 않던 문제 수정. 해제 조건을 스크롤 하단 근접 여부로 단순화

### 개선

- **glob_search 도구 실행 상태 상세 표시**: Processing Step에 `> 파일 검색 중: **/Toggle.tsx` 형태로 실제 검색 패턴 표시. ripgrep_search도 `코드 검색 중:` 으로 구분
- **update_file 실패 시 UI 메시지 간소화**: SEARCH 블록 매칭 실패 시 UI에는 한 줄 에러만 표시, LLM에는 파일 내용 포함 상세 메시지 전달 (message/error.message 분리)

---

## v1.0.18

### 기능 추가

- **Repo Map (Aider 스타일 프로젝트 맵)**: 시스템 프롬프트에 프로젝트 파일 경로 + 주요 심볼(함수/클래스/인터페이스 등) 맵을 자동 주입. LLM이 파일 경로를 추측하지 않고 정확한 경로를 사용하도록 유도. 파일 수 기반 3단계 전략: ≤500 full, ≤2000 medium, >2000 compact. 5분 TTL 캐시, 8000자 제한
- **glob_search 도구 추가**: fast-glob 기반 파일 패턴 검색 도구. `**/*.tsx`, `**/Dashboard*.tsx` 등 glob 패턴으로 프로젝트 전체 파일 검색. vscode API 미사용으로 CLI 환경에서도 동작

### 버그 수정

- **hasWriteToolExecution 조기 완료 방지**: `executeToolsWithUI` early return 시 `hasWriteToolExecution: false` 누락으로 write tool 없이도 작업 완료로 판정되던 문제 수정
- **read_file → create_file 경로 가드**: `read_file`에서 존재하지 않는 것으로 확인된 경로에 `create_file` 시도 시 차단. LLM에게 `glob_search`로 실제 경로를 찾도록 유도

### 개선

- **UI 메시지 / LLM 지시 분리**: `ToolResponse`의 `message`(채팅 패널 표시)와 `error.message`(LLM 전달) 분리. 파일 미발견 시 사용자에게는 간결한 메시지, LLM에게는 glob_search 사용 지시를 포함한 상세 메시지 전달
- **채팅 패널 스크롤 복원**: VS Code 재시작 후 대화 히스토리 복원 시 자동으로 최하단 스크롤

### 문서

- **README.md 재구성**: 기존 CHANGELOG 내용을 `CHANGELOG.md`로 분리, README.md는 제품 소개 중심으로 변경

---

## v1.0.17

### 개선

- **Windows 확장자 기반 쉘 라우팅**: 스크립트 확장자에 따라 적합한 쉘로 자동 분기. `.ps1` → PowerShell, `.sh` → Git Bash, `.bat/.cmd` → cmd.exe, 그 외 → 기본 쉘(Git Bash → cmd.exe fallback)
- **PowerShell .ps1 한글 깨짐 수정**: `.ps1` 실행 시 `[Console]::OutputEncoding = UTF8` 강제 설정. `-File` 대신 `-Command`로 실행하여 인코딩 설정을 주입. 사용자 스크립트 수정 없이 코드어시스턴트에서 처리
- **Windows 출력 인코딩 자동 감지/변환**: StreamManager에서 UTF-8 디코딩 후 깨진 문자(U+FFFD) 감지 시 CP949(EUC-KR)로 자동 재디코딩. 어떤 쉘/프로그램이든 CP949 출력을 자동 변환하여 채팅패널에 한글 정상 표시

---

## v1.0.16

### 버그 수정

- **채팅패널 모델 드롭다운 초기화 오류**: 새로 설치 또는 Windows에서 채팅패널 모델 드롭다운이 "Model"로 표시되거나 `supported:key` raw text가 노출되던 문제 수정. SecretStorage(Windows Credential Manager) 지연으로 초기 모델 값이 빈 상태로 반환되는 케이스 대응
- **설정 패널 모델 변경 시 채팅패널 미반영**: 설정에서 모델을 변경해도 채팅패널 드롭다운이 갱신되지 않던 문제 수정. 전체 모델 목록과 현재 선택값을 함께 전송하여 드롭다운 재구성

### 개선

- **모델 정보 Proactive Push**: 웹뷰 초기화 후 1.5초, 4초에 현재 모델 정보를 자동 전송하여 SecretStorage 지연 환경에서도 안정적으로 모델 표시. 일회성 호출로 폴링 없음

---

## v1.0.15

### 버그 수정

- **Hot Load 명령어 JSON 이스케이프 오류**: LLM이 핫로드 명령어를 JSON으로 출력할 때 `.\r`이 캐리지 리턴으로 파싱되어 명령어가 깨지던 문제 수정. 프롬프트에 명령어를 전달할 때 `\`를 `/`로 변환하여 JSON 이스케이프 시퀀스 원천 차단
- **Hot Load 프롬프트 플레이스홀더 복사 문제**: LLM이 `<actual command>` 등 플레이스홀더를 그대로 복사하여 실행하던 문제 수정. JSON 예시 템플릿을 제거하고 등록된 명령어를 직접 실행하도록 지시 변경

### 개선

- **Git Bash 경로 구분자 자동 치환**: ProcessManager에서 Git Bash 사용 시 `.\`를 `./`로 자동 변환. 사용자가 Windows 습관대로 `.\`로 핫로드 명령어를 등록해도 정상 실행

### UI 개선

- **참조 패널 상단 구분선 제거**: "n개 참조" 패널 위의 `border-top` 라인 제거

---

## v1.0.14

### 버그 수정

- **CODE 모드 토큰 뱃지 미표시**: CODE 모드에서 응답 토큰 수가 표시되지 않던 문제 수정. LLM 응답 직후(요약 메시지 렌더링 전) `updateMessageTokenInfo`를 호출하여 컨테이너가 없었던 문제를 REVIEW 요약 메시지 렌더링 후로 이동. 멀티턴 시 전체 토큰 누적 표시

### 개선

- **Hot Load 프롬프트 강화**: LLM이 핫로드 키워드 매칭 시 직접 코드 생성으로 빠지는 문제 개선. 최우선 규칙 명시, 의미적 매칭 예시 추가, "명령어" 플레이스홀더 리터럴 방지 지시 추가
- **Hot Load 오케스트레이션 분할 방지**: 핫로드 키워드가 매칭되는 요청이 TaskSplitter에 의해 멀티 에이전트로 분할되어 핫로드가 무시되던 문제 수정. TaskSplitter에 핫로드 키워드를 전달하여 매칭 시 `shouldSplit: false` 반환
- **Windows cmd.exe 한글 깨짐 수정**: cmd.exe 기본 코드페이지(CP949)로 인한 한글 출력 깨짐 수정. 명령 실행 시 `chcp 65001`로 UTF-8 코드페이지 설정
- **Windows `./` 경로 변환 제거**: `normalizeCommand()`가 `./`를 `.\`로 변환하여 Git Bash에서 `.run_script.sh`로 인식되던 문제 수정. Git Bash는 `./`가 정상, cmd.exe도 `shell: true`로 처리 가능하므로 변환 제거

---

## v1.0.13

### 버그 수정

- **Windows PowerShell Execution Policy 쉘 실행 실패**: PowerShell의 Execution Policy가 Restricted일 때 명령어가 실행되지 않고 파일로 떨어지던 문제 수정. 기본 쉘을 cmd.exe로 변경 (Git Bash 있으면 우선 사용)
- **TestRunner LLM 프로젝트 타입 감지 매턴 중복 호출**: 검증 턴마다 LLM을 호출하여 프로젝트 타입을 감지하던 문제 수정. `llmProjectTypeCache` 정적 Map으로 워크스페이스별 캐싱
- **TestRunner LLM이 `"..."` 등 무효 명령어 반환**: LLM이 말줄임표, 구두점 등을 검증 명령어로 반환하여 exit 127 발생하던 문제 수정. `isValidCommand()` 검증 추가
- **오케스트레이션 참조 리스트 미표시**: 오케스트레이션(멀티 에이전트) 모드에서 참조 문서 패널이 표시되지 않던 문제 수정. `sendReferenceInfo` 호출 시점을 에이전트 실행 전에서 요약 메시지 전송 후로 변경
- **오케스트레이션 재시도 후 의존 태스크 스킵**: Phase C(재시도)에서 실패 태스크가 성공해도 해당 태스크에 의존하는 skipped 태스크가 실행되지 않던 문제 수정. Phase D 추가로 의존성이 해소된 태스크 자동 실행

### 개선

- **Windows 기본 쉘 cmd.exe로 변경**: PowerShell은 ExecutionPolicy 제한으로 명령어 실행 실패 가능성이 높아 기본 쉘을 cmd.exe로 변경. Git Bash가 있으면 우선 사용. 시스템 조회(`Get-CimInstance` 등) PowerShell 전용 명령어만 `powershell -ExecutionPolicy Bypass -Command`로 직접 호출
- **오케스트레이션 참조 추적**: `gatherRulesContext`에서 로컬 규칙, 서버 규칙, RAG 문서 참조를 수집하여 웹뷰에 전송. `PromptComposer.getLastIncludedServerRuleKeys()` getter 추가

---

## v1.0.12

### 기능 추가

- **설정 내보내기 / 가져오기**: 일반 탭에서 전체 설정을 JSON 파일로 내보내고 가져오기 가능. 일반 설정, AI 모델, 라우팅 모델, 빌드/테스트, MCP 서버, Hot Load, 보안 규칙(활성화/비활성화 상태 포함), 컨텍스트 제외 패턴 모두 포함. API 키, 토큰 등 민감 정보는 제외

---

## v1.0.11

### 버그 수정

- **SubAgentLoop create_file→update_file 무한루프 수정**: create_file로 생성한 파일에 update_file 시도 시 스킵만 하고 피드백이 없어 LLM이 동일 호출을 반복하던 문제 수정. 스킵된 파일에 synthetic feedback 메시지를 추가하여 루프 탈출
- **RunCommandToolHandler 이중 실행 수정**: `exitCode !== undefined && !initialResult.error` 조건으로 인해 실패한 명령어(exitCode=1 + error)가 완료 대기 블록에서 재실행되던 문제 수정. `!initialResult.error` 조건 제거
- **ToolExecutor 병렬 실행 인덱스 매핑 오류**: `results.filter(r => r !== undefined)`가 배열 길이를 변경하여 `uniqueCalls[i] ↔ results[i]` 매핑이 깨지던 문제 수정. `filter` → `map` + 폴백 에러 응답으로 전환

### 기능 확장

- **COMMAND_MANIFEST_MAP 50+개 명령어**: Python (uv, poetry, pdm, hatch, pipenv), Rust, Go, Ruby, PHP, Dart/Flutter, Java/JVM (gradle, maven, sbt), .NET, C/C++, Swift, Elixir, Zig, Gleam, Erlang, Clojure, Terraform, Helm 추가
- **resolveCommandCwd BFS 2-depth 탐색**: 1-depth 탐색에서 BFS 2-depth로 확장. `*.csproj`, `*.sln` 등 glob suffix 패턴 지원. `packages/api/`, `apps/web/`, `services/auth/` 등 모노레포 구조 자동 감지
- **resolveInstallCommand 19개 의존성 파일**: composer.json, pubspec.yaml, build.gradle(.kts), pom.xml, Package.swift, mix.exs, build.zig, gleam.toml, deno.json(c) 자동 감지 및 설치 명령어 매핑

### UI 개선

- **규칙/스킬 라벨 색상 통일**: 스킬 라벨 배지를 `#3b82f6` (파란색)으로 통일
- **삭제 버튼 hover 효과 제거**: 삭제 버튼의 빨간색 hover 배경 제거

### 성능 개선

- **채팅 히스토리 lazy loading**: 시작 시 최근 10개 메시지만 로드, 스크롤업 시 이전 메시지 추가 로드. 스크롤 위치 보존

---

## v1.0.10

### 버그 수정

- **IntentDetector `<think>` 태그 호환**: Ollama 모델이 `<think>...</think>` 태그를 포함한 응답을 반환할 때 JSON 파싱 실패하던 문제 수정. think 태그 제거 + bracket-counting 방식으로 정확한 JSON 추출
- **CompletionJudge `<think>` 태그 호환**: IntentDetector와 동일한 think 태그 제거 + bracket-counting JSON 파싱 적용
- **LoopStateTracker 진전 감지 리셋 누락**: `hasProgress=true`일 때 `consecutiveSamePhase` 카운트가 리셋되지 않아 유의미한 진전이 있어도 루프 탈출로 이어지던 문제 수정
- **CompletionJudge 미완성 판정 시 루프 중단**: incomplete 판정 후에도 LLM 호출 없이 루프가 종료되던 문제 수정. `forceNextLLMCall` 플래그로 다음 턴에서 LLM 호출을 강제

### 개선

- **CompletionJudge 명령 실행 이력 전달**: `executedCommands` 목록을 판단 프롬프트에 포함하여 SQL 실행, DB 반영 등 명령 기반 작업 완료 여부를 정확하게 판단
- **debug_log 생성 방지**: `.gitignore`에 `debug_log/` 추가

---

## v1.0.9

### 개선

- **의존성 자동 설치 (AutoInstall)**: 의존성 파일(package.json, requirements.txt, pyproject.toml, go.mod, Cargo.toml, Gemfile) 변경 감지 시 자동으로 패키지 설치 실행
  - lock 파일 기반 패키지 매니저 탐지: `pnpm-lock.yaml` → pnpm, `yarn.lock` → yarn, `bun.lockb` → bun, `package-lock.json` → npm
  - manifest 필드 탐지: `packageManager` 필드, `[tool.uv]`, `[tool.poetry]` 등
  - 실행 가능성 검증: `cmd --version`으로 OS 무관하게 도구 존재 확인
  - corepack fallback: lock 파일은 있지만 도구가 없으면 `corepack` 경유 시도
  - Python 지원: `uv.lock` → uv sync, `poetry.lock` → poetry install, `Pipfile.lock` → pipenv install
  - 서브디렉토리 지원: `server/package.json` 등 모노레포 구조에서 올바른 디렉토리에서 설치 실행
- **터미널 명령 규칙 강화**: LLM 프롬프트에 "의존성 파일 수정 후 설치 필수" 규칙 추가

### 버그 수정

- **SubAgentLoop approve JSON 패널 출력**: LLM이 tool call 없이 approve JSON만 출력할 때 채팅 패널에 raw JSON이 표시되던 버그 수정. `isRawJsonOnly` 판별로 내부 제어 JSON을 사용자 응답에서 필터링

---

## v1.0.8

### 개선

- **TerminalManager 비범용 프롬프트 제거**: 오류 수정 가이드라인에서 Spring Boot/Maven/Gradle/ts-node-dev 등 특정 기술 하드코딩 제거. 범용적 빌드/컴파일 오류 가이드라인으로 대체
  - `commonGuidelines`: Spring Boot 전용 규칙 7~10번 제거, 프로젝트 타입 자동 감지 기반 범용 가이드로 통합
  - `compilationGuidelines`: ESM/ts-node-dev, POM 누락, Maven 전용 가이드라인 전체 제거 → 범용 빌드 오류 가이드라인으로 대체
  - `isPomOrGradle` 필터: 컴파일 오류 시 pom.xml/build.gradle만 허용하던 제한 제거
  - `create→modify` 강제 변환: POM/Gradle 전용 로직 제거
  - `isSpringBootProject` 검증: Maven/Gradle 명령어 차단 로직 제거
- **Native Tool Calling 기본 OFF**: 스트리밍 네이티브 tool calling이 턴당 1개 tool call로 제한되는 문제 해결. 텍스트 기반 파싱으로 다중 tool call 지원 (턴당 14개 확인)
- **UpdateFileToolHandler content→diff 재라우팅**: LLM이 `content` 파라미터에 SEARCH/REPLACE 마커를 보내는 경우 자동으로 diff로 재라우팅. 마커가 파일에 리터럴 텍스트로 기록되던 버그 수정
- **BYPASS_PATTERNS 제거**: 린트 스크립트 우회 감지(echo, exit 0, true 패턴) 하드코딩 제거

---

## v1.0.7

### 개선

- **Skills 우선순위 강화**: 관리자 등록 Skills(dev_rules)를 시스템 프롬프트 최상단으로 이동. 모든 Skills 라벨을 [필수]로 통일 (enforcement 설정과 무관하게 강제 적용). 프롬프트 하단에 Skills 준수 리마인더 추가. LLM이 코드 생성 시 디자인 시스템·아키텍처·코딩 컨벤션을 반드시 따르도록 개선

### 코드 정리

- **디버그 로그 제거**: `SettingsPanelProvider.ts` waitForSync 관련 console.log 제거, `webview/settings.js` renderOrgSettings 내 console.log 제거
- **설정 패널 개선**: currentSettings에 `hasOrganization` 플래그 추가
- **GitRepositoryService 제거**

---

## v1.0.6

### 개선

- **Skills 래핑 텍스트 강화**: 스킬 주입 시 "모든 작업의 결과물에 반드시 반영" 등 구체적 적용 지시 추가. 디자인 시스템→UI코드, 아키텍처→코드구조, 코딩컨벤션→네이밍/스타일 등 카테고리별 명시. 서버(관리자) 등록 스킬에도 래핑 텍스트 추가
- **서버 설정 동기화 완료 대기**: 익스텐션 시작 직후 서버 sync가 미완료 상태에서 스킬/설정이 누락되던 문제 수정. `SettingsManager.waitForSync()` 추가하여 프롬프트 생성, 세팅 화면 로드, 서버 설정 조회 시 sync 완료를 보장

### 버그 수정

- **세팅 화면 서버 설정 미표시 수정**: 익스텐션 재시작 후 세팅 화면에서 서버 설정이 보이지 않던 문제 수정. `initializePanel`, `loadSettings`, `getServerSettings` 핸들러에 `waitForSync()` 대기 추가
- **서버 스킬 프롬프트 누락 수정**: 시작 직후 첫 프롬프트에서 서버 등록 스킬(dev_rules)이 반영되지 않던 문제 수정. `ConversationManager`, `OrchestrationRouter`에서 프롬프트 생성 전 sync 완료 대기

---

## v1.0.5

### 버그 수정

- **CompletionJudge 조기 완료 수정**: 빈 프로젝트에서 빌드/테스트 통과 + 파일 1개 변경만으로 작업 완료로 판정하던 문제 수정. `buildTestPassed` 숏컷을 제거하고 항상 LLM 판단을 거치도록 변경. 판단 프롬프트에 빌드/테스트 결과를 참고 정보로 포함
- **ProjectDetector JSON 파싱 크래시 수정**: LLM 응답에서 greedy 정규식(`\{[\s\S]*\}`)이 JSON 이후 텍스트까지 캡처하여 `SyntaxError` 발생하던 문제 수정. non-greedy 정규식 + try-catch + 코드 블록 폴백 추가
- **TaskSplitter 디버그 로깅 추가**: 분할 거부 시 사유가 출력되지 않던 문제 수정. `shouldSplit=false` 판정 및 독립 태스크 부족 시 로그 출력 추가

---

## v1.0.4

### 도구 정리

- **Git 전용 도구 제거**: `git_status`, `git_log`, `git_commit`, `git_branch`, `git_pr`, `git_diff` 6개 전용 도구 삭제. `run_command` + `PreToolUseValidator`로 통합하여 유지보수 부담 감소
- **`search_files` 제거**: `ripgrep_search`와 기능 중복. `ripgrep_search`로 통합 (대소문자 구분, context lines 등 상위 호환)
- **미구현 도구 제거**: `analyze_code`, `verify_code`, `refactor_code` enum에서 삭제. 기존 도구 조합(read_file + run_command + update_file)으로 대체 가능
- **도구 수 최적화**: 18종 → 14종. LLM 도구 선택 정확도 향상 및 프롬프트 토큰 절감

### 버그 수정

- **ToolParser 중복 파싱 수정**: LLM이 동일 JSON을 2회 출력할 때 중복 tool call이 생성되던 문제 수정. `deduplicateToolCalls`로 동일 name+params 조합 자동 제거
- **병렬 실행 undefined 크래시 수정**: `executeToolsParallel`에서 앞 명령어 실패로 뒷 명령어가 스킵될 때 `TypeError: Cannot read properties of undefined` 발생하던 문제 수정
- **`@` 멘션 오탐 수정**: `git@github.com` 등 이메일 형식에서 `@` 이후가 파일 멘션으로 인식되던 문제 수정. 공백 또는 줄 시작 뒤의 `@`만 멘션으로 처리
- **AgentStateManager 누락 도구 등록**: `expand_around_line`, `list_imports`, `stat_file`, `read_active_file`, `fetch_url`, `lsp`, `list_code_definitions`이 ALLOWED_TOOLS에 없어 차단되던 문제 수정

### 개선

- **명령어 실패 시 채팅 표시 개선**: `run_command` 실패 시 `❌ [명령 실패] {command}` + stderr를 bash 코드 블록으로 채팅 패널에 표시
- **불필요한 완료 메시지 제거**: 명령어만 실행한 경우 "작업이 완료되었습니다" 메시지 미표시. 파일 변경이 있을 때만 파일 목록 표시

---

## v1.0.3

### 버그 수정

- **Thinking-only 응답 복구**: 모델이 `content` 필드 대신 `thinking` 필드에 tool call을 넣는 버그 대응. thinking 내용에서 tool call JSON을 자동 추출하여 정상 실행하도록 fallback 추가
- **Thinking-only 재시도 로직 개선**: `disableThinking=true`에서 thinking-only 응답 시 즉시 포기하던 문제 수정. 강화 프롬프트와 함께 나머지 retry를 소진하도록 변경
- **create_file→update_file 동일 파일 충돌 방지**: 같은 턴/세션에서 `create_file`로 생성한 파일에 `update_file`이 원본 기준 SEARCH를 시도하여 실패하던 문제 수정. create_file 이후 동일 경로 update_file을 자동 스킵

### 개선

- **SubAgentLoop read-only 연속 턴 가드**: `full` 권한 서브태스크에서 read-only 도구만 4턴 연속 사용 시 write 단계로 유도하는 프롬프트 자동 주입. 서브에이전트가 조사만 반복하고 파일 생성을 하지 않는 패턴 방지

---

## v1.0.2

### 버그 수정

- **code_generate 실행 루프 조기 종료 수정**: 빈 프로젝트에서 코드 생성 요청 시 `list_files` 조사 후 파일을 생성하지 않고 바로 REVIEW로 전환되던 버그 수정. `code_generate` intent에서도 write tool 실행 전까지 루프를 계속하도록 변경
- **세션 전환 시 Undo/Keep Turn 버튼 잔존 수정**: 다른 프로젝트를 열었을 때 이전 세션의 Undo Turn / Keep Turn 버튼이 빈 채팅에 표시되던 버그 수정. 대화 메시지가 없으면 턴 액션을 표시하지 않도록 가드 추가
- **Clear History 시 턴 액션 초기화**: 대화 삭제 시 `_latestTurnStats` 및 pending changes UI 상태가 초기화되지 않던 문제 수정
- **로그인 버튼 색상 깜빡임 수정**: 채팅 패널 로그인 버튼이 VS Code 테마 색상(초록)에서 파란색으로 깜빡이던 문제 수정. CSS 변수 대신 하드코딩 색상 적용

### 최적화

- **RAG 불필요한 API 호출 제거**: RAG 소스가 등록되지 않은 상태에서도 매 요청마다 RAG 검색 API를 호출하던 문제 수정. `SettingsManager`에서 RAG 소스 존재 여부를 먼저 확인하고, 없으면 검색 스킵

---

## v1.0.1

### LLM

- **Anthropic 프롬프트 캐싱**: Claude 모델 사용 시 시스템 프롬프트 및 tool definitions에 `cache_control` 자동 적용 (최대 90% 비용 절감)
- **기능 비교표 업데이트**: Cursor 제거, OpenCode 추가 분석 반영

### Docs

- **PROMPT_CACHING_GUIDE.md**: Anthropic / OpenAI / Gemini 프롬프트 캐싱 구현 가이드 추가
- **FEATURE_COMPARISON.md**: OpenCode 비교 컬럼 추가

---

## v1.0.0

### Core

- **멀티에이전트 오케스트레이션**: TaskSplitter가 요청을 분석해 병렬 서브태스크로 분할, OrchestrationRouter가 의존성 그래프 기반으로 병렬/순차 실행
- **5단계 FSM 에이전트 루프**: Investigation → Plan → Execution → Review → Done 자동 전환
- **도구 시스템 (14종)**: 파일 CRUD, ripgrep 검색, 명령어 실행, LSP 연동, 코드 정의 맵 등
- **인라인 Diff 리뷰**: 파일 변경을 에디터 내 인라인 diff로 표시, 턴별 체크포인트 Undo 지원

### LLM 지원

- **Ollama**: 로컬 모델 직접 연결 (/api/chat), 네이티브 tool calling + 텍스트 파싱 폴백
- **Admin 모델 (클라우드)**: OpenAI 호환 / Gemini Native / Anthropic Native 프로바이더 자동 감지
- **라우팅 모델**: 컴팩터, 명령어 생성, 의도 분석, 에러 폴백, 자동완성 — 각각 독립 모델 설정 가능
- **스트리밍**: 전 프로바이더 네이티브 스트리밍 + 네이티브 tool calling 지원

### 코드 품질 자동화

- **자동 테스트 & 빌드 검증**: 코드 생성 후 프로젝트 타입별 검증 명령어 자동 실행 (최대 5회 재시도)
- **에러 자동 분류 & 수정**: ErrorClassifier → AutoRemediator → RetryCoordinator 파이프라인
- **에러 폴백 모델**: 동일 에러 2회 반복 시 지정된 고성능 모델로 마지막 재시도
- **Prettier / ESLint 자동 포맷팅**: 파일 생성/수정 후 프로젝트 포맷터 자동 실행

### 에디터 통합

- **인라인 코드 자동완성 (Ghost Text)**: 커서 컨텍스트 기반 LLM 호출, Tab 수락
- **에디터 선택 코드 컨텍스트**: 코드 선택 시 채팅에 자동 첨부, RAG 검색 쿼리 보강
- **설정 UI**: VS Code 스타일 사이드바 레이아웃, 프로바이더/모델/토글 통합 관리

### 안정성

- **네이티브 Tool Call 폴백**: 네임스페이스 자동 strip, 실패 시 텍스트 파싱 모드 재호출
- **플레이스홀더 콘텐츠 차단**: 빈 파일 / `...` / `TODO` 등 무의미한 파일 생성 방지
- **같은 턴 내 중복 도구 제거**: 동일 (도구, 경로) 조합 자동 dedup
- **크로스 플랫폼**: Windows / macOS / Linux OS 어댑터 (셸, 프로세스, 경로 자동 분기)

### 기타

- **MCP (Model Context Protocol)**: 외부 도구 서버 연동, 관리자/프리셋/사용자 설정 분리
- **RAG**: 프로젝트 문서 기반 컨텍스트 검색, 일반 지식 폴백
- **HotLoad**: 서버 설정 실시간 반영 (빌드 명령어, 프롬프트 등)
- **대화 압축**: 컨텍스트 윈도우 임계치 도달 시 자동 컴팩션
