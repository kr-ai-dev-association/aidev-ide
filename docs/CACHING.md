# 프롬프트 최적화 계획


---

## API Prefix Caching (토큰 비용 90% 절감) — 미적용

### 현재 문제

CodePilot은 매 턴마다 시스템 프롬프트 + 도구 정의 + 서버 규칙을 **전체 재전송**한다.
10턴 대화에서 시스템 프롬프트가 8,000토큰이면 → 80,000토큰이 반복 과금.

### 프로바이더별 캐시 메커니즘

| 프로바이더 | 방식 | 최소 토큰 | 할인율 | TTL | 구현 난이도 |
|-----------|------|----------|--------|-----|-----------|
| **Gemini** | 암시적 (자동) + 명시적 (`cachedContent` API) | 1,024 (Flash) / 4,096 (Pro) | 캐시 읽기 90% 할인 | 기본 60분, 설정 가능 | 중 |
| **Anthropic** | `cache_control: {"type": "ephemeral"}` 블록 마커 | 2,048~4,096 (모델별) | 캐시 읽기 90% 할인, 쓰기 25% 추가 | 5분 (자동 갱신) 또는 1시간 | 낮음 |
| **OpenAI** | 완전 자동 (코드 변경 불필요) | 1,024 | 50% 할인 | 5~10분 (비활성 시 제거) | 없음 |

### 캐시 적중 조건

**핵심 원리**: 프롬프트의 **접두사(prefix)**가 이전 요청과 동일해야 캐시 적중.

```
[캐시 가능 영역 - 매 턴 동일]
├── 시스템 프롬프트 (identity, rules, constraints)
├── 도구 정의 (tools/function declarations)
├── 서버 규칙 (Skills, DevRules)
└── RAG 청크 (세션 내 동일)

[캐시 불가 영역 - 매 턴 변경]
├── 대화 히스토리 (messages)
├── 현재 파일 컨텍스트
├── RepoMap (파일 변경 시 갱신)
└── 사용자 쿼리
```

### 구현 방안

#### Phase 1: Anthropic `cache_control` 적용

```typescript
// AnthropicProvider.ts 변경
const messages = [
  {
    role: 'system',
    content: [
      {
        type: 'text',
        text: systemPrompt,
        cache_control: { type: 'ephemeral' }  // ← 캐시 마커
      }
    ]
  },
];
```

**변경 파일**: `AnthropicProvider.ts` — 시스템 메시지에 `cache_control` 추가

#### Phase 2: Gemini 명시적 캐싱

```typescript
// GeminiProvider.ts 변경
const cache = await client.caches.create({
  model: modelName,
  config: {
    systemInstruction: staticSystemPrompt,
    contents: [toolDefinitions, serverRules],
    ttl: '3600s'
  }
});

const response = await client.models.generateContent({
  model: modelName,
  contents: dynamicMessages,
  config: { cachedContent: cache.name }
});
```

**변경 파일**: `GeminiProvider.ts` — 세션별 캐시 생성/참조

### 예상 비용 절감

10턴 대화 기준 (시스템 프롬프트 8,000토큰):

| 시나리오 | 전체 입력 토큰 | 절감 토큰 | 절감률 |
|---------|-------------|----------|--------|
| 캐시 없음 | 80,000 (8K × 10턴) | 0 | 0% |
| 캐시 적용 | 8,000 + 72,000 × 0.1 | 64,800 | **81%** |

### 주의사항

- 프로젝트 전환, 설정 변경 시 캐시 무효화 로직 필수
- Ollama(로컬)에는 효과 없음 — 서버 모델(admin) 사용 시에만 의미
- `PromptComposer`의 정적/동적 분리가 선행되어야 함

---

## 참고 자료

- [Gemini Context Caching](https://ai.google.dev/gemini-api/docs/caching) — 명시적/암시적 캐싱
- [Anthropic Prompt Caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) — cache_control
- [OpenAI Prompt Caching](https://developers.openai.com/api/docs/guides/prompt-caching) — 자동 캐싱
- [Anthropic XML Tags Guide](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/use-xml-tags) — XML 구조화 권장
- [Cursor Agent System Prompt](https://gist.github.com/sshh12/25ad2e40529b269a88b80e7cf1c38084) — XML 섹션 구조
- [Forge Large Output Handling](https://github.com/antinomyhq/forge/issues/741) — 대형 출력 잘라내기
- [Claude Code Bash Output Limit](https://github.com/anthropics/claude-code/issues/19901) — 30K자 제한
