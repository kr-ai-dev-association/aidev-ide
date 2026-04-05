# Claude Code 기능 분석 — CodePilot 적용 후보

> Claude Code 소스코드 분석 후, CodePilot에 아직 없는 기능 정리
> 이미 적용된 기능은 제외

---

## 우선순위 높음 (효과 큼)

### 1. File Checkpoint + 재시작 후 UNDO 보장 ✅ 적용됨
- **설명**: 매 턴마다 수정된 파일의 스냅샷 저장. VS Code 재시작 후에도 UNDO 정상 동작
- **Claude Code**: `src/utils/fileHistory.ts`
  - `messageId: UUID`로 스냅샷 식별 (불변 ID → 재시작 후에도 매칭)
  - `~/.claude/file-history/{sessionId}/` 디렉토리에 백업 파일 저장
  - `fileHistoryRewind(messageId)` → 해당 시점으로 파일 복원
  - 세션 복원 시 `fileHistoryRestoreStateFromLog()` → 스냅샷 + 백업 파일 복원
  - MAX_SNAPSHOTS = 100, 초과 시 오래된 것 제거
- **현재 CodePilot 문제**:
  - `InlineDiffManager`의 `turnCheckpointStack`은 복원되지만 `conversationTurnId`가 채팅 패널의 턴 ID와 불일치
  - 재시작 후 일부 턴이 `"legacy"` ID로 폴백 → 레거시 per-change 방식으로 undo (파일 삭제 미지원)
- **해결 방향**: Claude Code처럼 **불변 UUID**를 체크포인트 + 채팅 패널 양쪽에서 사용. 재시작 후에도 UUID 매칭 보장
  1. `conversationTurnId`를 영속적 UUID로 생성 (현재도 `crypto.randomUUID()` 사용)
  2. 채팅 패널 복원 시 같은 UUID를 webview에 전달
  3. `rejectChangesByTurn(turnId)` 호출 시 복원된 UUID로 체크포인트 매칭
- **효과**: 재시작 후에도 UNDO 정상 동작, 새 파일 삭제 포함
- **난이도**: 🟡 보통
- **상태**: ✅ 완료 — `conversationTurnId`를 세션 엔트리에 저장 + 복원 시 webview에 전달

### 4. Session Memory 자동 추출 ✅ 적용됨
- **설명**: 대화 중 주기적으로 중요 정보를 메모리로 자동 추출. 토큰 임계값 기반 트리거
- **Claude Code**: `src/services/SessionMemory/` — 최소 토큰 임계값, 도구 호출 기반 업데이트, 마지막 추출 메시지 ID 추적
- **효과**: 장시간 세션에서 컨텍스트 보존 향상
- **난이도**: 🔴 높음
- **상태**: ✅ 완료 — `SessionMemoryExtractor` 서비스 (20K토큰 + 5턴 임계값, 자동 추출 최대 3개, CODE+AGENT 통합)

---

## 우선순위 중간 (유용)

### 6. Diagnostic Tracking (LSP 진단 추적) ✅ 적용됨
- **설명**: LSP 진단 정보를 베이스라인과 비교하여 delta 감지. 수정 전/후 에러 변화 추적
- **Claude Code**: `src/services/diagnosticTracking.ts` — baseline 비교, 파일 수정 시간 추적
- **효과**: "내 수정이 에러를 늘렸는지 줄었는지" 정확히 판단
- **난이도**: 🟡 보통
- **상태**: ✅ 완료 — `DiagnosticTracker` 서비스 생성 (captureBaseline + getDelta)

### 7. Prompt Suggestion (다음 질의 제안)
- **설명**: 대화 의도 기반으로 다음 할 일을 제안. speculation 모듈로 다음 N턴을 미리 시뮬레이션
- **Claude Code**: `src/services/PromptSuggestion/` — 예측 제안, speculation overlay
- **효과**: 사용자 생산성 향상 (다음 뭘 해야 할지 안내)
- **난이도**: 🔴 높음
- **상태**: ⬜ 미진행


### 9. autoDream (메모리 통합)
- **설명**: 백그라운드에서 메모리를 주기적으로 통합/정리. 최소 시간/세션 수 기반 트리거. `/dream` 슬래시 명령어는 제외 — 시스템 자동 실행만
- **Claude Code**: `src/services/autoDream/` — forked subagent로 통합 실행, 통합 잠금, 세션 카운트 추적
- **효과**: 장기 사용 시 메모리 품질 유지
- **난이도**: 🔴 높음
- **상태**: ⬜ 미진행

### 10. LSP 도구 확장
- **설명**: 현재 CodePilot LSP는 기본 기능만. Claude Code는 9개 operation 지원
- **Claude Code**: `src/tools/LSPTool/` — goToDefinition, findReferences, hover, documentSymbol, workspaceSymbol, goToImplementation, prepareCallHierarchy, incomingCalls, outgoingCalls
- **현재 CodePilot**: LSP 도구 있지만 기본 수준
- **효과**: 코드 탐색 정확도 향상
- **난이도**: 🟡 보통
- **상태**: ⬜ 미진행



---

## 명령 실행 개선



---

## 엔지니어링 패턴 (코드 품질)

### P1. Lazy Schema Loading
```typescript
const inputSchema = lazySchema(() => z.strictObject({...}))
```
- 스키마 검증 오버헤드를 지연 로딩으로 절약
- **난이도**: 🟢 쉬움


### P3. Forked Agent Pattern
```typescript
const result = await runForkedAgent({
  prompt: "...",
  signal: abortController.signal,
})
```
- 백그라운드 작업(suggestions 등)을 메인 세션과 격리
- **난이도**: 🟡 보통

### P4. Prompt Cache Break Detection
- 시스템 프롬프트/컨텍스트 변경 시 캐시 무효화 감지
- 압축 서비스에 캐시 브레이크 알림
- **난이도**: 🟡 보통

---

## CodePilot 현재 상태 분석

| # | 기능 | CodePilot 현재 상태 | 적용 모드 | 기존 동작 변경 위험 |
|---|------|-------------------|----------|------------------|
| 1 | File Checkpoint | ✅ 완료 — conversationTurnId 세션 저장 + 복원 시 UUID 매칭 | 공통 (CODE+AGENT) | ✅ 적용됨 |
| 4 | Session Memory 자동추출 | ✅ 완료 — SessionMemoryExtractor (20K토큰 + 5턴 임계값) | 공통 (CODE+AGENT) | ✅ 적용됨 |
| 5 | Auto Compaction 개선 | ✅ 완료 — circuit breaker + BUFFER_TOKENS 13K 추가 | 공통 (CODE+AGENT) | ✅ 적용됨 |
| 6 | Diagnostic Delta | ✅ 완료 — DiagnosticTracker 서비스 (baseline + delta) | 공통 (CODE+AGENT) | ✅ 적용됨 |
| 7 | Prompt Suggestion | ❌ 거의 없음 — `IntentDetector`가 의도 분석은 하지만 다음 질의 제안 없음 | 공통 (CODE+AGENT) | ❌ 없음 — UI 추가 + 별도 서비스 |
| 9 | autoDream | ❌ 없음 — 메모리 자동 통합/정리 기능 없음 | 공통 (CODE+AGENT) | ❌ 없음 — 백그라운드 서비스 |
| 10 | LSP 확장 | ✅ 완료 — 9/9 operation (callHierarchy 3개 추가) | 공통 (CODE+AGENT) | ✅ 적용됨 |
| 11 | Stall Detection | ✅ 완료 — 5초 간격 모니터링, 45초 threshold, 대화형 프롬프트 감지 | 공통 (CODE+AGENT) | ✅ 적용됨 |
| 13 | 자동 백그라운드 | ✅ 완료 — AUTO_BACKGROUND_PATTERNS 12개 패턴 | 공통 (CODE+AGENT) | ✅ 적용됨 |
| 14 | sleep 차단 | ✅ 완료 — DEFAULT_BLOCKED_COMMANDS에 추가 | 공통 (CODE+AGENT) | ✅ 적용됨 |

### 엔지니어링 패턴

| # | 패턴 | CodePilot 현재 상태 | 적용 모드 | 기존 동작 변경 위험 |
|---|------|-------------------|----------|------------------|
| P1 | Lazy Schema | ✅ 완료 — ToolSpecBuilder 캐시 적용 | 공통 | ✅ 적용됨 |
| P2 | Semantic Boolean | ✅ 완료 — `semanticBoolean()` 유틸 + RunCommandToolHandler 적용 | 공통 | ✅ 적용됨 |
| P3 | Forked Agent | 🟡 부분 — `spawn_agent`의 `run_in_background`가 유사 | AGENT만 | ❌ 없음 |
| P4 | Cache Break | ✅ 완료 — PromptComposer 해시 비교 + ToolSpecBuilder 캐시 클리어 | 공통 | ✅ 적용됨 |

### 모드별 정리

| 적용 대상 | 기능 |
|----------|------|
| **CODE + AGENT 공통** | #1 Checkpoint, #2 Memory, #4 Diagnostic, #7 Suggestion, #9 autoDream |
| **CODE만** | 해당 없음 (CODE 전용 추가 기능 없음) |

---

## 추천 구현 순서

| 순서 | 항목 | 이유 |
|------|------|------|
| 1 | Diagnostic Delta (#4) | 검증 정확도 향상 |
| 2 | File Checkpoint (#1) | UNDO 기능 강화 |
| 3 | Session Memory (#2) | 장시간 세션 품질 |
