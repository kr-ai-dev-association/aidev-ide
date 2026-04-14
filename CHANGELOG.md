# AgentGoCoder

VS Code용 AI 코딩 어시스턴트 — Ollama / OpenAI / Gemini / Anthropic 멀티 LLM 지원

> **현재 버전: v1.1.0**  
> **브랜치:** `agentgocoder-v1.1.0`

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
