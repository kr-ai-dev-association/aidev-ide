# CodePilot 코드 품질 이슈 분석

> 다른 AI 코드 어시스턴트 프로젝트(Cline, Continue, OpenCode)의 표준 패턴과 비교한 현재 코드베이스의 문제점

---

## 1. 심각도 요약

| 심각도 | 건수 | 내용 |
|--------|:----:|------|
| 🔴 치명 | 3 | 즉시 수정 필요, 서비스 안정성 직결 |
| 🟠 높음 | 6 | 유지보수·확장 심각하게 저해 |
| 🟡 중간 | 6 | 누적되면 버그·보안 이슈 |
| 🟢 낮음 | 4 | 코드 가독성·품질 |

---

## 2. 🔴 치명 이슈

### 2-1. ConversationManager — 5,700줄 God Class ✅ **v11.12.0 부분 완료**

**파일:** `src/core/managers/conversation/ConversationManager.ts`

**완료된 추출:**
- `handlers/LoopStateTracker.ts` (~160줄) — 무한 루프 감지·탈출 로직
- `handlers/ContextGatherer.ts` (~210줄) — UI 준비, MCP 프롬프트, Intent 감지, Context 수집

**남은 문제:**
- `executeAgentLoop()` (3,076줄 FSM) — 테스트 없이 건드리기 위험, 중기 과제
- 단위 테스트 불가 (외부 의존성이 모두 내부에 혼재)
- 신규 페이즈 추가 시 이 파일을 반드시 수정해야 함

---

### 2-2. 병렬 에이전트 컨텍스트 공유 — Race Condition ✅ **v11.12.0 완료**

**파일:** `src/core/managers/diff/InlineDiffManager.ts`

**완료된 수정:**
`showInlineDiff()`에 파일별 Promise-chain Mutex(`fileLocks` Map + `withFileLock<T>`) 추가.
동일 파일에 대한 동시 diff 적용이 직렬화되어 경쟁 조건 해소.

---

### 2-3. InlineDiffManager — 비동기 상태 저장 Race Condition ✅ **v11.12.0 완료**

**파일:** `src/core/managers/diff/InlineDiffManager.ts`

**완료된 수정:**
- `savePersistedState()` → `async savePersistedState(): Promise<void>` 전환
- `globalState.update()` 4곳 모두 `await` 추가 (savePersistedState 2곳 + loadPersistedState 2곳)
- `setTimeout` 콜백에서 `void` 처리로 Promise float 명시화

---

## 3. 🟠 높음 이슈

### 3-1. AdminModelApi — 6개 메서드 중복 구조

**파일:** `src/services/llm/AdminModelApi.ts` (833줄)

**문제:**
`sendOpenAI`, `streamOpenAI`, `sendAnthropic`, `streamAnthropic`, `sendGemini`, `streamGemini` 6개 메서드가 각각 인증 헤더 구성 / 응답 파싱 / 에러 핸들링을 반복합니다.
새 공급자(예: Mistral) 추가 시 2개 메서드를 새로 작성해야 합니다.

**일반적인 방법 (Continue, OpenCode 패턴):**
```typescript
interface LLMProvider {
  buildRequest(messages, options): RequestBody;
  parseResponse(raw): string;
  parseStreamChunk(chunk): string | null;
}

class OpenAIProvider implements LLMProvider { ... }
class AnthropicProvider implements LLMProvider { ... }
class GeminiProvider implements LLMProvider { ... }
```

공통 전송 로직은 `BaseLLMClient`에 한 번만 작성.

---

### 3-2. OrchestrationRouter — 강결합 의존성

**파일:** `src/core/orchestration/OrchestrationRouter.ts` (import 블록 10-32줄)

**문제:**
`ProjectManager`, `ActionManager`, `ExecutionManager`, `TerminalManager` 등 12개 싱글톤을 직접 import합니다.
테스트 시 실제 파일 시스템·터미널이 없으면 실행 불가합니다.

**일반적인 방법:**
```typescript
// 의존성 주입 패턴
class OrchestrationRouter {
  constructor(private services: ServiceContainer) {}
}
// 또는 서비스 로케이터
const router = new OrchestrationRouter(ServiceContainer.getInstance());
```

---

### 3-3. chat.js — 4,000줄 단일 파일 (모듈 분리 미완성)

**파일:** `webview/chat.js` (4,001줄)

**문제:**
이미 `chat/` 디렉터리로 일부 모듈이 분리됐지만 (`streaming.js`, `mention-handler.js` 등) 핵심 로직의 상당 부분이 `chat.js`에 남아 있습니다.
상태 변수 (`selectedFiles`, `loadingDepth`, `selectedEditorCode` 등)가 전역으로 흩어져 있어 추적이 어렵습니다.

**일반적인 방법:**
React/Preact 컴포넌트 + 중앙 상태 스토어 (zustand 등) 사용.
또는 최소한 상태 객체를 단일 `ChatState` 모듈로 집중.

---

### 3-4. 프롬프트 — TypeScript 하드코딩

**파일:** `src/core/managers/context/prompts/` 내 다수

**문제:**
LLM 프롬프트가 TypeScript 소스 안에 문자열로 박혀 있습니다.
프롬프트 수정 = 코드 재배포가 필요합니다.
`OrchestrationRouter.ts` 라인 772-792에 20줄짜리 인라인 프롬프트가 있습니다.

**일반적인 방법:**
`.md` 또는 `.txt` 파일로 분리 후 런타임에 로드하거나,
관리자 콘솔에서 수정 가능한 서버 설정으로 관리합니다 (CodePilot은 백엔드 인프라가 있으므로 더 쉽게 적용 가능).

---

### 3-5. ToolExecutor — 병렬 실행 시 부분 실패 미처리

**파일:** `src/core/tools/ToolExecutor.ts`

**문제:**
병렬 도구 실행 시 `Promise.all()`을 사용합니다.
하나가 실패하면 나머지 성공 결과가 모두 버려집니다.

```typescript
// 현재 (잘못된 패턴)
const results = await Promise.all(toolCalls.map(execute));

// 올바른 패턴
const results = await Promise.allSettled(toolCalls.map(execute));
const succeeded = results.filter(r => r.status === 'fulfilled');
// 성공한 것만 반영, 실패한 것만 재시도
```

---

### 3-6. 타입 안전성 — any 타입 남용

**파일:** `OrchestrationRouter.ts`, `AdminModelApi.ts`, `CodePilotApiClient.ts` 등

**문제:**
```typescript
promptType: any;      // RouteOptions 인터페이스
ollamaApi?: any;      // RouteOptions 인터페이스
const data: any = await response.json();
```

`any` 타입은 TypeScript 컴파일러의 타입 검사를 우회합니다.
런타임에서만 발견되는 버그의 주요 원인입니다.

---

## 4. 🟡 중간 이슈

### 4-1. Magic Number 산재

관련 상수가 각 파일에 하드코딩돼 있습니다.

| 위치 | 값 | 의미 |
|------|----|------|
| `OrchestrationRouter.ts` | `3` | 최대 병렬 에이전트 수 |
| `SettingsManager.ts` | `5 * 60 * 1000` | 캐시 TTL |
| `ConversationCompactor.ts` | `0.9` | 압축 트리거 토큰 비율 |
| `ChatViewProvider.ts` | `2000` | 복원 재시도 지연 ms |
| `ConversationManager.ts` | `6` | 유지할 최근 메시지 수 |
| `OllamaApi.ts` | `5000` | 선택 코드 최대 길이 |

**수정:** 중앙 `src/constants/AgentConfig.ts` 파일로 통합

---

### 4-2. ConversationManager — deletedFiles 메모리 누수

**파일:** `src/core/managers/conversation/ConversationManager.ts` 라인 129

```typescript
private deletedFiles: string[] = [];
```

대화가 길어질수록 무한 증가합니다. 상한도, 초기화 시점도 없습니다.
장시간 사용 시 메모리 증가 원인이 됩니다.

---

### 4-3. 입력값 검증 없음

**파일:** 도구 핸들러 전반

파일 경로, 검색 패턴, 명령어에 대한 스키마 검증이 없습니다.
`package.json`에 `zod`가 이미 의존성으로 있지만 도구 입력 검증에 사용되지 않습니다.

```typescript
// 현재
async execute(params: { path: string }) { ... }

// 올바른 패턴
const schema = z.object({ path: z.string().min(1).refine(isAbsolutePath) });
const validated = schema.parse(params);
```

---

### 4-4. OllamaApi — 재시도 로직 없음

**파일:** `src/services/llm/OllamaApi.ts`

Ollama 로컬 서버 연결 실패 시 즉시 에러를 던집니다.
`AdminModelApi`에는 재시도가 있지만 `OllamaApi`에는 없어 일관성이 없습니다.

---

### 4-5. 응답 검증 없이 `as` 캐스팅

**파일:** `AdminModelApi.ts`, `CodePilotApiClient.ts`

```typescript
// 현재
return userParts as AdminModelMessagePart[];

// 올바른 패턴
if (!isAdminModelMessageParts(userParts)) throw new TypeError(...);
return userParts;
```

타입 가드 없이 `as` 캐스팅은 런타임 타입 오류를 컴파일 타임에 숨깁니다.

---

### 4-6. 세션 상태 격리 없음

`InlineDiffManager`가 글로벌 싱글톤이므로 다른 워크스페이스 창에서 같은 인스턴스를 공유합니다.
멀티 워크스페이스 시나리오에서 diff 상태가 섞일 수 있습니다.

---

## 5. 🟢 낮음 이슈

### 5-1. Deprecated 메서드 잔존 ✅ **v11.10.0 완료**

`@deprecated` 빈 메서드 5개(setSessionManager 등)는 v11.10.0에서 제거됨.
현재 남은 `setLLMService`, `setPromptBuilder`, `setStateManager`는 `extension.ts`에서 실제로 호출되며 기능적임 (레거시 setter 아님).

### 5-2. 에러 메시지 다국어 처리 없음

UI 다국어(7개국어)를 지원하지만 에러 메시지·로그는 한국어/영어 혼용입니다.

### 5-3. 프롬프트 버전 관리 없음

프롬프트가 코드에 박혀 있어 어떤 버전의 프롬프트가 어떤 결과를 냈는지 추적 불가합니다.

### 5-4. 테스트 코드 전무

핵심 로직(`ConversationManager`, `ToolExecutor`, `AdminModelApi`)에 대한 단위 테스트가 없습니다.
`package.json`에 `mocha`가 있지만 테스트 파일이 없습니다.

---

## 6. 개선 우선순위 로드맵

### 즉시 (v12.0 이전)
1. ~~`InlineDiffManager` globalState `await` 추가 — 데이터 유실 방지~~ ✅ **v11.12.0 완료**
2. ~~`ToolExecutor` `Promise.all` → `Promise.allSettled` 전환~~ ✅ **v11.11.0 완료**
3. ~~병렬 에이전트 컨텍스트 격리 (최소한 파일 쓰기 직렬화)~~ ✅ **v11.12.0 완료** (showInlineDiff per-file mutex)

### 단기 (v12.x)
1. ~~`AdminModelApi` Provider 어댑터 패턴으로 리팩토링~~ ✅ **v11.11.0 완료** (ILLMProvider + OpenAICompatProvider + AnthropicProvider + GeminiProvider)
2. ~~Magic Number → `AgentConfig.ts` 중앙화~~ ✅ **v11.10.0 완료**
3. ~~`any` 타입 핵심 인터페이스에서 제거~~ ✅ **v11.11.0 완료** (RouteOptions v11.10.0, McpServerInfo/RagResult v11.11.0)
4. ~~`deletedFiles` 크기 제한 추가~~ ✅ **v11.10.0 완료**
5. ~~`@deprecated` setter 메서드 제거~~ ✅ **v11.10.0 완료**
6. ~~`chat.js` 모듈 분리 (model-selector, theme-language)~~ ✅ **v11.11.0 완료**

### 중기 (v13.x)
1. ~~`ConversationManager` LoopStateTracker + ContextGatherer 추출~~ ✅ **v11.12.0 완료** — executeAgentLoop FSM 분리는 v13.x 과제
2. 도구 입력 Zod 검증 추가
3. `OrchestrationRouter` 의존성 주입 도입
4. 핵심 로직 단위 테스트 작성
5. 프롬프트 외부 파일 분리
