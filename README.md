# Codepilot (Cloud)

VSCode AI 코딩 어시스턴트 — Ollama / OpenAI / Gemini / Anthropic 멀티 LLM 지원

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
