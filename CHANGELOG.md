# Codepilot (Standalone)

VSCode AI 코딩 어시스턴트 — Ollama / OpenAI / Gemini / Anthropic 멀티 LLM 지원

> **현재 버전: v1.0.19**

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

---

## v1.0.1

### LLM

- **Anthropic 프롬프트 캐싱**: Claude 모델 사용 시 시스템 프롬프트 및 tool definitions에 `cache_control` 자동 적용 (최대 90% 비용 절감)
- **Gemini OpenAI 호환 엔드포인트 전환**: Gemini 네이티브 API → OpenAI 호환 엔드포인트(`/v1beta/openai/chat/completions`)로 변경, 인증 안정성 향상
- **최신 모델 추가**: Gemini 3.1 Pro, Gemini 3 Flash, GPT-5.4, GPT-5.4 Pro, GPT-5.3 Codex, GPT-5 Mini
- **Gemini think 필드 호환성 수정**: Gemini OpenAI 호환 엔드포인트에서 `think` 필드 전송 시 400 에러 방지

### 안정성

- **프리셋 설정 동기화 수정**: 확장 재시작 시 globalState에 저장된 stale config(provider, endpoint, authType)를 최신 프리셋 값으로 항상 동기화

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
