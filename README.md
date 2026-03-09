# Codepilot (Cloud)

VSCode AI 코딩 어시스턴트 — Ollama / OpenAI / Gemini / Anthropic 멀티 LLM 지원

---

## v1.0.0

### Core

- **멀티에이전트 오케스트레이션**: TaskSplitter가 요청을 분석해 병렬 서브태스크로 분할, OrchestrationRouter가 의존성 그래프 기반으로 병렬/순차 실행
- **5단계 FSM 에이전트 루프**: Investigation → Plan → Execution → Review → Done 자동 전환
- **도구 시스템 (15종)**: 파일 CRUD, ripgrep 검색, 명령어 실행, LSP 연동, Git diff, 코드 정의 맵 등
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
