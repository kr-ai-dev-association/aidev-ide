# CodePilot 구현 체크리스트

> ANALYSIS.md 기반 — 35개 격차 항목을 구현 난이도 순으로 정렬
> 작성일: 2026-03-23

---

## 난이도 범례
- ⚡ 매우 쉬움 — 프롬프트/규칙 텍스트 추가만 (30분 이내)
- 🟢 쉬움 — 50줄 이내 코드 변경 (반나절)
- 🟡 보통 — 새 클래스/모듈 작성 (1-2일)
- 🔴 어려움 — 아키텍처 변경 또는 외부 의존성 (3일+)

---

## 1단계: 프롬프트 규칙 추가 (코드 변경 없음)

> `base.ts` 또는 `PromptComposer.ts`에 텍스트 섹션만 추가. 가장 빠른 효과.

- [ ] ⚡ **GAP-07** 도구 호출 최적화 규칙 추가
  - `base.ts`에 섹션 추가: "cat 대신 read_file", "grep 대신 ripgrep_search", "update_file 전 read_file 필수", "병렬 호출 최대화"
  - 파일: `src/prompts/base.ts`

- [ ] ⚡ **GAP-21** 오버엔지니어링 방지 규칙 추가
  - `base.ts`에 섹션 추가: "요청된 변경만", "docstring 자동 추가 금지", "불가능한 에러핸들링 금지", "일회성 추상화 금지"
  - 파일: `src/prompts/base.ts`

- [ ] ⚡ **GAP-24** 출력 효율성 규칙 추가
  - `base.ts`에 섹션 추가: "간결하고 직접적", "답변/행동으로 시작", "사용자 말 반복 금지", "도구 호출 전 콜론 금지"
  - 파일: `src/prompts/base.ts`

- [ ] ⚡ **GAP-25** 파일 참조 마크다운 링크 형식 규칙
  - `base.ts`에 추가: 파일 참조 시 `` `src/foo.ts` `` 대신 `[foo.ts](src/foo.ts)` 형식 사용 규칙
  - (선택) WebView에서 `[text](path#Lnn)` 클릭 → 에디터 이동 핸들러 추가
  - 파일: `src/prompts/base.ts`, `webview/chat/chat.js`

---

## 2단계: 작은 코드 변경 (기존 코드 확장)

### 안정성

- [ ] 🟢 **GAP-01** Git 위험 명령 안전 프로토콜
  - `PreToolUseValidator.ts`에 `GIT_DANGEROUS_COMMANDS` 패턴 배열 추가
  - 대상: `push --force`, `reset --hard`, `checkout --`, `clean -f`, `branch -D`
  - `autoExecuteCommands=true`여도 해당 명령은 확인 다이얼로그 강제 표시
  - 파일: `src/core/tools/PreToolUseValidator.ts`

- [ ] 🟢 **GAP-20** 거부 후 이유 파악 옵션
  - 도구 실행 확인 모달에 "건너뛰기" 외 "이유 입력" 버튼 추가
  - 입력된 이유를 `USER_REJECTED: <reason>` 형태로 LLM 피드백에 포함
  - 파일: `src/core/tools/ToolExecutor.ts`, 관련 UI 컴포넌트

- [ ] 🟢 **GAP-29** Agentic Loop 최대 턴 수 하드 리밋
  - `ConversationManager` 또는 에이전트 루프에 `MAX_AGENT_TURNS = 25` 추가
  - 20턴 도달 시 WebView에 경고 메시지 표시
  - 25턴 도달 시 루프 강제 종료 + 사용자 알림
  - 파일: `src/core/managers/ConversationManager.ts`

### 도구 기능 확장

- [ ] 🟢 **GAP-14** `ripgrep_search` 고급 옵션 추가
  - 파라미터 추가: `output_mode` (content/files/count), `context` (전후 줄 수), `multiline`, `glob`, `head_limit`
  - 기존 ripgrep 호출 래퍼에 옵션 전달
  - 파일: `src/core/tools/implementations/RipgrepSearchTool.ts`

- [ ] 🟢 **GAP-18** `ask_user` 구조화 질문 도구
  - 신규 도구: `ask_user(question: string, options?: string[])` 추가
  - WebView에 선택지 UI 표시 (버튼 목록)
  - 선택 결과를 LLM 다음 호출에 피드백
  - 파일: `src/core/tools/implementations/AskUserTool.ts`

### 워크플로우 표준화

- [ ] 🟢 **GAP-22** 커밋 워크플로우 표준화
  - 프롬프트 또는 스킬에 5단계 커밋 프로세스 추가
  - (1) git status+diff+log 병렬 확인 → (2) why 중심 메시지 작성 → (3) 구체적 파일 add → (4) HEREDOC 커밋 → (5) 성공 확인
  - 파일: `src/prompts/base.ts` 또는 `.agent/skills/commit.md`

- [ ] 🟢 **GAP-23** PR 워크플로우 표준화
  - 프롬프트 또는 스킬에 PR 생성 4단계 추가
  - (1) 전체 커밋 히스토리 분석 → (2) 제목+본문 작성 → (3) gh pr create → (4) URL 반환
  - 파일: `.agent/skills/create-pr.md`

---

## 3단계: 새 모듈/클래스 작성 (중간 난이도)

### 비용 최적화

- [ ] 🟡 **GAP-31** 프롬프트 캐싱 적용
  - Anthropic API 호출 시 시스템 프롬프트 마지막 블록에 `cache_control: { type: "ephemeral" }` 추가
  - 캐시 히트율 로깅 추가 (비용 모니터링)
  - 파일: `src/llm/providers/AnthropicProvider.ts`

- [ ] 🟡 **GAP-08** Deferred Tool Loading (도구 지연 로드)
  - 즉시 로드 (핵심 5개): `read_file`, `update_file`, `create_file`, `run_command`, `ripgrep_search`
  - 지연 로드 (나머지): 이름 + 1줄 설명만 시스템 프롬프트에 포함
  - `get_tool_schema(tool_name)` 메타 도구 추가로 필요 시 스키마 반환
  - 파일: `src/core/tools/ToolRegistry.ts`, `src/prompts/PromptComposer.ts`

### 안정성 강화

- [ ] 🟡 **GAP-02** 위험 작업 4단계 분류 시스템
  - `RiskLevel` enum 추가: SAFE / CAUTION / DANGEROUS / DESTRUCTIVE
  - `classifyRisk(toolUse)` 함수: 명령어/파일 경로 기반 위험도 판정
  - 위험도별 다른 UX: 자동실행 / 토스트 확인 / 모달 확인 / 상세 설명 포함 모달
  - 파일: `src/core/tools/PreToolUseValidator.ts`, `src/core/tools/ToolExecutor.ts`

- [ ] 🟡 **GAP-03** 승인 범위 관리 (맥락별 승인)
  - 승인 히스토리 추적 (어떤 파일, 어떤 명령 패턴)
  - 다른 파일/명령 패턴이면 재확인 요청
  - 지속적 인가는 `.agent/rules/`에 명시된 경우에만
  - 파일: `src/core/tools/ToolExecutor.ts`, 신규 `ApprovalHistoryManager.ts`

- [ ] 🟡 **GAP-28** 프롬프트 인젝션 감지 및 경고
  - 도구 결과 분석: `<script>`, `ignore previous`, `system:` 등 의심 패턴 감지
  - 감지 시 WebView에 경고 표시 + LLM에 경고 주석 추가
  - 파일: 신규 `src/core/security/InjectionDetector.ts`

### 생산성 기능

- [ ] 🟡 **GAP-05** 백그라운드 명령 실행
  - `run_command`에 `background: boolean` 파라미터 추가
  - `BackgroundTaskManager`: 프로세스 관리, 완료 알림
  - WebView에 실행 중 작업 목록 표시 (스피너 + 종료 버튼)
  - 파일: `src/core/tools/implementations/RunCommandTool.ts`, 신규 `BackgroundTaskManager.ts`

- [ ] 🟡 **GAP-09** 작업 관리 도구 (TaskTracker)
  - 기존 `updateTaskQueue` 웹뷰 브리지 활용
  - `task_update(todos: [{content, status}])` 도구 추가
  - WebView 작업 목록을 대화 내 체크리스트로 표시
  - 파일: 신규 `src/core/tools/implementations/TaskUpdateTool.ts`

- [ ] 🟡 **GAP-12** 웹 검색 도구
  - `web_search(query: string)` 도구 추가
  - 서버 프록시 또는 Brave/SerpAPI 연동
  - 결과를 요약 형태로 LLM에 반환
  - 파일: 신규 `src/core/tools/implementations/WebSearchTool.ts`

- [ ] 🟡 **GAP-06** 멀티 워킹 디렉토리 지원
  - 설정 추가: `codepilot.additionalWorkingDirectories: string[]`
  - 시스템 프롬프트에 모든 디렉토리 목록 주입
  - 도구 호출 시 프로젝트 경계를 추가 디렉토리로 확장
  - 파일: `src/prompts/PromptComposer.ts`, `src/core/tools/PreToolUseValidator.ts`

- [ ] 🟡 **GAP-30** 프로젝트 규칙 계층 구조
  - 디렉토리별 `.agent/RULES.md` 자동 수집 지원
  - `~/.codepilot/rules/global.md` 개인 글로벌 규칙 지원
  - 파일: `src/core/rules/AgentRulesLoader.ts`

- [ ] 🟡 **GAP-10** Plan 모드 명시적 전환
  - `/plan` 슬래시 커맨드 추가
  - Plan 모드에서 쓰기 도구 비활성화 (read_file, ripgrep_search, glob_search만)
  - WebView에 "Plan Mode" 뱃지 표시
  - 계획 확인 후 실행 모드 전환 버튼
  - 파일: `src/core/commands/`, `src/core/tools/ToolExecutor.ts`

- [ ] 🟡 **GAP-17** 서브에이전트 모델 선택
  - 오케스트레이션 서브에이전트 호출 시 `model` 파라미터 추가
  - 작업 유형별 자동 모델 선택: 탐색→최소모델, 계획→중간모델, 구현→메인모델
  - 파일: `src/core/orchestration/SubAgentManager.ts`

- [ ] 🟡 **GAP-19** 이벤트 기반 훅 시스템
  - 이벤트 타입 정의: `on_tool_call`, `on_file_save`, `on_commit`, `on_error`
  - 설정에서 이벤트별 셸 명령 등록 가능
  - 훅 실행 결과를 LLM 컨텍스트에 주입
  - 파일: 신규 `src/core/hooks/EventHookManager.ts`

- [ ] 🟡 **GAP-35** system-reminder 비동기 주입
  - `SystemReminderManager`: 이벤트 발생 시 다음 LLM 호출에 리마인더 삽입
  - 파일 외부 변경 감지 (`fs.watch`) → 리마인더
  - 파일: 신규 `src/core/SystemReminderManager.ts`

### 영속성

- [x] 🟡 **GAP-04** 영속적 메모리 시스템 (핵심) ✅ 2026-03-23
  - 저장 위치: `context.globalStorageUri.fsPath/memory/{project-hash}/`
  - `MemoryManager` 클래스: save, recall, update, remove, validate
  - 메모리 타입 4가지:
    - `user`: 사용자 역할·선호·지식수준 (응답 톤 조절)
    - `feedback`: 행동 교정 규칙 (Why/How to apply 포함)
    - `project`: 마감일·담당자·제약사항 (절대 날짜로 저장)
    - `reference`: 외부 시스템 URL·Linear·Slack 등
  - 대화 시작 시 `MEMORY.md` 로드 → 시스템 프롬프트 주입
  - 파일: `src/core/memory/MemoryManager.ts`, `src/prompts/PromptComposer.ts`

- [x] 🟡 **GAP-04-a** 메모리 저장 트리거 ✅ 2026-03-23
  - 방식 A: LLM이 `memory_save` / `memory_delete` 도구를 직접 호출 (키워드 패턴 매칭 없음)
  - 도구 스펙: name, description, type(user/feedback/project/reference), content
  - 저장 전 중복 체크 → 있으면 덮어쓰기 (같은 이름이면 업데이트)
  - 파일: `src/core/tools/memory/MemorySaveToolHandler.ts`, `ToolSpecBuilder.ts`, `types.ts`

- [x] 🟡 **GAP-04-b** 메모리 삭제/갱신 (Stale Memory 방지) ✅ 2026-03-23
  - `memory_delete` 도구로 명시적 삭제
  - 자동 정리: 50개 초과 시 silent cleanup (project 만료 → project 오래된 → reference → feedback, user 보호)
  - MEMORY.md 인덱스 200줄 하드 리밋
  - 파일: `src/core/tools/memory/MemoryDeleteToolHandler.ts`, `MemoryManager.autoCleanup()`

- [x] 🟡 **GAP-04-c** 저장하지 않는 것 필터링 ✅ 2026-03-23
  - 프롬프트 지시로 처리: 코드·git·문서에서 파악 가능한 것은 저장 금지
  - 현재 대화 한정 임시 상태, 민감 정보(API 키 등) 저장 금지
  - 시스템 프롬프트의 기존 memory 가이드라인 준용

---

## 4단계: 복잡한 기능 (어려움)

- [ ] 🔴 **GAP-11** Worktree 격리 실행
  - `WorktreeManager`: `git worktree add/remove` 래핑
  - 오케스트레이션 서브에이전트에 `isolation: "worktree"` 옵션
  - 변경 없으면 자동 정리
  - 파일: 신규 `src/core/git/WorktreeManager.ts`

- [ ] 🔴 **GAP-13** 멀티모달 파일 읽기
  - `read_file`에 `type` 파라미터 추가: `text` / `image` / `pdf` / `notebook`
  - PDF: `pdf-parse` 라이브러리로 텍스트 추출 (최대 20페이지)
  - 이미지: base64 인코딩 → LLM 멀티모달 입력
  - `.ipynb`: 셀 + 출력 결합 파서
  - 파일: `src/core/tools/implementations/ReadFileTool.ts`

- [ ] 🔴 **GAP-15** 인라인 편집 (Cmd+K 스타일)
  - `vscode.commands.registerTextEditorCommand` 등록
  - 선택 영역 + 사용자 지시 입력 UI (QuickInput)
  - LLM 호출 → diff 생성 → 에디터 인라인 diff 표시
  - 수락/거부 UI (기존 InlineDiffManager 활용)
  - 파일: `src/commands/InlineEditCommand.ts`, `src/core/managers/diff/InlineDiffManager.ts`

- [ ] 🔴 **GAP-16** 시맨틱 코드베이스 검색
  - 로컬 벡터 인덱싱 (hnswlib-node 또는 서버 기반)
  - `codebase_search(query: string)` 도구 추가
  - 프로젝트 파일 변경 감지 → 증분 인덱스 업데이트
  - 파일: 신규 `src/core/indexing/SemanticIndexer.ts`

- [ ] 🔴 **GAP-26** 크론 반복 작업
  - `CronManager`: 반복 실행 스케줄러
  - `cron_create`, `cron_list`, `cron_delete` 도구
  - WebView에 활성 크론 목록 표시
  - 파일: 신규 `src/core/cron/CronManager.ts`

- [ ] 🔴 **GAP-27** Jupyter 노트북 편집
  - `.ipynb` 파서: 셀 읽기/쓰기
  - `notebook_edit(path, cell_index, content)` 도구
  - 파일: 신규 `src/core/tools/implementations/NotebookEditTool.ts`

- [ ] 🔴 **GAP-33** AI 기반 버그 탐지
  - 파일 저장 이벤트 훅 (`vscode.workspace.onDidSaveTextDocument`)
  - 변경된 부분만 추출 → LLM 분석
  - 잠재적 버그 → 인라인 경고 또는 채팅 알림
  - 파일: 신규 `src/core/analysis/BugDetector.ts`

- [ ] 🔴 **GAP-34** 외부 문서 인덱싱
  - 문서 URL 등록 UI
  - 문서 크롤링 + 청킹 + 임베딩 인덱싱
  - `@docs <keyword>` 멘션으로 참조
  - 파일: 신규 `src/core/indexing/DocIndexer.ts`

- [ ] 🔴 **GAP-32** 클라우드 백그라운드 에이전트 (장기)
  - 백엔드 서버에 에이전트 실행 환경
  - GitHub webhook → 에이전트 트리거
  - PR 자동 생성 + 코드 리뷰 코멘트 자동 대응
  - 파일: 백엔드 서버 (`codepilot-backend`)

---

## 우선순위 요약

### 즉시 (이번 주)
안정성 위험 + 프롬프트만으로 가능한 것:

| 순위 | 항목 | 이유 |
|------|------|------|
| 1 | GAP-07, 21, 24, 25 | 프롬프트 추가만, 즉각적 LLM 동작 개선 |
| 2 | GAP-01 | force push 사고 방지, PreToolUseValidator 10줄 추가 |
| 3 | GAP-31 | 프롬프트 캐싱, Anthropic 호출 비용 최대 90% 절감 |
| 4 | GAP-29 | 무한 루프 방지, 턴 카운터 20줄 추가 |
| 5 | GAP-22, 23 | 커밋/PR 스킬 추가, 프롬프트 파일 작성만 |

### 1-2주
| 순위 | 항목 | 이유 |
|------|------|------|
| 6 | GAP-04 | 영속적 메모리, 대화 간 학습으로 사용자 경험 대폭 향상 |
| 7 | GAP-02 | 위험 작업 분류, 안전성 핵심 |
| 8 | GAP-09 | 작업 관리, 복잡한 작업 추적 |
| 9 | GAP-05 | 백그라운드 명령, 빌드/테스트 블로킹 해소 |
| 10 | GAP-14 | Grep 고급 옵션, 코드 탐색 정밀도 향상 |

### 2-4주
GAP-06, 08, 10, 12, 17, 18, 19, 20, 28, 30, 35

### 장기 (4주+)
GAP-11, 13, 15, 16, 26, 27, 32, 33, 34

---

## 진행 현황

- 완료: 0 / 35
- 진행 중: 0
- 남은 항목: 35

> 체크리스트 업데이트: 각 항목 완료 시 `- [ ]` → `- [x]` 변경
