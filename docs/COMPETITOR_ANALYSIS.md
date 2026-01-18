# Codepilot vs 경쟁사 상세 기능 비교 분석

## 1. 도구(Tool) 시스템 상세 비교

### 1.1 도구 호출 형식 비교

| 항목 | Codepilot | Cursor | Cline | Claude Code | Copilot | Windsurf | Continue |
|------|-----------|--------|-------|-------------|---------|----------|----------|
| 호출 형식 | XML 태그 | JSON Function Call | JSON Function Call | JSON Function Call | Function Call | Function Call | Function Call |
| 파싱 방식 | 정규식 | Native API | Native API | Native API | Native API | Native API | Native API |
| 스트리밍 지원 | ⚠️ 부분 | ✅ 완전 | ✅ 완전 | ✅ 완전 | ✅ 완전 | ✅ 완전 | ✅ 완전 |
| 병렬 호출 | ❌ 순차 | ✅ 병렬 | ✅ 병렬 | ✅ 병렬 | ✅ 병렬 | ✅ 병렬 | ✅ 병렬 |

**Codepilot 현황:**
```xml
<!-- XML 기반 도구 호출 -->
<create_file>
<path>src/App.tsx</path>
<content>...</content>
</create_file>
```

**경쟁사 현황 (JSON Function Call):**
```json
{
  "name": "create_file",
  "arguments": {
    "path": "src/App.tsx",
    "content": "..."
  }
}
```

### 1.2 파일 수정 전략 비교

| 항목 | Codepilot | Cursor | Cline | Claude Code | Windsurf |
|------|-----------|--------|-------|-------------|----------|
| 수정 형식 | SEARCH/REPLACE 블록 | Unified Diff | Full File Replace | SEARCH/REPLACE | Unified Diff |
| 매칭 전략 | 5단계 폴백 | Apply Model | Exact Match | Fuzzy Match | Apply Model |
| 실패 복구 | 자동 전체 덮어쓰기 | Reapply Tool | 재시도 요청 | 재시도 요청 | Checkpoint 복원 |
| Diff 표시 | ✅ 인라인 | ✅ 인라인 | ✅ 인라인 | ✅ 인라인 | ✅ 인라인 |
| 줄 단위 수락 | ❌ | ✅ | ✅ | ✅ | ✅ |

**Codepilot의 5단계 매칭 폴백:**
```
1. 정확한 매칭 (Exact Match)
2. 라인 트림 매칭 (Line-Trimmed)
3. 블록 앵커 매칭 (Block Anchor)
4. 구조적 공백 무시 (Structural)
5. 퍼지 매칭 (Fuzzy Match)
```

**Cursor의 접근법:**
```
1. Main model이 edit_file 호출
2. Apply model (약한 모델)이 실제 적용
3. 실패 시 Reapply tool로 강한 모델 재호출
```

### 1.3 등록된 도구 비교

| 도구 카테고리 | Codepilot | Cursor | Cline | Claude Code | Windsurf | Continue |
|--------------|-----------|--------|-------|-------------|----------|----------|
| 파일 읽기 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ @file |
| 파일 생성 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 파일 수정 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 파일 삭제 | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| 파일 목록 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ @tree |
| 파일 검색 | ✅ ripgrep | ✅ semantic | ✅ ripgrep | ✅ glob/grep | ✅ | ✅ @search |
| 명령어 실행 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 웹 검색 | ❌ | ✅ | ❌ | ✅ WebSearch | ✅ | ❌ |
| 브라우저 | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Git 작업 | ❌ | ✅ | ✅ | ✅ Bash | ✅ | ✅ @diff |
| LSP 연동 | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ |
| 코드 분석 | ❌ (미구현) | ✅ | ❌ | ❌ | ✅ | ✅ @code |
| MCP 지원 | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |

### 1.4 도구 확장성 비교

| 항목 | Codepilot | Cursor | Cline | Continue |
|------|-----------|--------|-------|----------|
| 확장 방식 | 코드 수정 필요 | MCP + Rules | MCP + "add tool" | Context Provider |
| 동적 추가 | ❌ | ✅ | ✅ AI가 직접 생성 | ✅ |
| 커스텀 서버 | ❌ | ✅ | ✅ | ✅ HTTP Provider |
| 플러그인 | ❌ | ✅ | ✅ | ✅ |

**Cline의 동적 도구 생성:**
```
사용자: "add a tool that fetches Jira tickets"
→ Cline이 MCP 서버 생성 및 자동 설치
→ 새 도구로 등록
```

---

## 2. 세션/히스토리 관리 상세 비교

### 2.1 세션 저장 방식

| 항목 | Codepilot | Cursor | Copilot | Cline | Windsurf | Claude Code |
|------|-----------|--------|---------|-------|----------|-------------|
| 저장소 | globalState | 로컬 파일 | 클라우드 | 로컬 파일 | 클라우드 | 로컬 파일 |
| 영속성 | ✅ VS Code | ❌ 세션 내 | ⚠️ Pro만 | ❌ 세션 내 | ✅ Memory | ✅ CLAUDE.md |
| 프로젝트별 | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ |
| 세션 복원 | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ |
| 내보내기 | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ JSON |

### 2.2 컨텍스트 압축 전략

| 항목 | Codepilot | Cursor | Copilot | Windsurf | Claude Code |
|------|-----------|--------|---------|----------|-------------|
| 압축 방식 | LLM 요약 | 슬라이딩 윈도우 | Auto-compact | LLM 요약 | LLM 요약 |
| 트리거 | 80% 토큰 | 컨텍스트 한계 | 95% 토큰 | 자동 | 자동 |
| 최근 유지 | 12-20개 | 가변 | 가변 | 가변 | 가변 |
| 요약 저장 | ✅ compactedSummaries | ❌ 휘발 | ❌ 휘발 | ✅ Memory | ❌ 휘발 |
| 폴백 | 슬라이딩 윈도우 | - | - | - | - |

**Codepilot의 압축 흐름:**
```
토큰 > 80% 임계값
    ↓
오래된 메시지 추출 (전체 - 최근 20개)
    ↓
LLM 요약 요청
    ↓
compactedSummaries에 저장
    ↓
다음 요청 시 "요약 + 최근 20개" 전달
```

**Copilot의 압축 흐름:**
```
토큰 > 95% 컨텍스트
    ↓
자동 요약 (휘발)
    ↓
다음 세션 시 컨텍스트 상실
```

### 2.3 대화 히스토리 구조

| 항목 | Codepilot | Cursor | Cline | Claude Code |
|------|-----------|--------|-------|-------------|
| 저장 내용 | 요청+응답+메타데이터 | 요청+응답 | 요청+응답+비용 | 요청+응답 |
| 파일 변경 추적 | ✅ filesCreated/Modified | ❌ | ❌ | ❌ |
| 명령어 추적 | ✅ commandsExecuted | ❌ | ✅ | ❌ |
| 토큰 사용량 | ✅ tokensUsed | ❌ | ✅ | ✅ |
| 수행 시간 | ✅ durationMs | ❌ | ❌ | ❌ |

**Codepilot ConversationEntry 구조:**
```typescript
{
    id: string,
    timestamp: number,
    userRequest: string,
    assistantResponse?: string,
    actions: ActionEntry[],
    filesCreated?: string[],
    filesModified?: string[],
    commandsExecuted?: string[],
    result: 'success' | 'error' | 'cancelled',
    model?: string,
    tokensUsed?: number,
    durationMs?: number
}
```

### 2.4 메모리 시스템 비교

| 항목 | Codepilot | Windsurf | Copilot (신규) |
|------|-----------|----------|----------------|
| 타입 | 대화 요약 | 규칙/패턴 학습 | 리포지토리 메모리 |
| 학습 대상 | 이전 작업 내용 | 코딩 스타일, API | 코드베이스 인사이트 |
| 적용 범위 | 현재 세션 | 모든 세션 | 리포지토리 전체 |
| 수동 편집 | ❌ | ✅ | ❌ |
| 자동 생성 | ✅ | ✅ | ✅ |

---

## 3. 파싱/컨텍스트 수집 상세 비교

### 3.1 컨텍스트 소스

| 소스 | Codepilot | Cursor | Cline | Windsurf | Continue |
|------|-----------|--------|-------|----------|----------|
| 현재 파일 | ✅ | ✅ | ✅ | ✅ | ✅ @file |
| 선택 영역 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 커서 주변 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 열린 파일 | ❌ | ✅ | ❌ | ✅ | ❌ |
| 터미널 | ✅ | ✅ | ✅ | ✅ | ❌ |
| 에러 | ✅ ErrorParser | ✅ | ✅ | ✅ Linter | ❌ |
| Git diff | ✅ (기본) | ✅ | ✅ | ✅ | ✅ @diff |
| 클립보드 | ❌ | ❌ | ❌ | ✅ | ❌ |
| 브라우저 | ❌ | ❌ | ✅ | ❌ | ❌ |
| 실시간 액션 | ❌ | ❌ | ❌ | ✅ | ❌ |

**Windsurf의 실시간 액션 추적:**
```
사용자가 파일 수정 → Cascade 자동 인식
사용자가 명령어 실행 → Cascade 결과 인식
사용자가 텍스트 복사 → Cascade 클립보드 인식
→ 프롬프트에 명시적으로 전달할 필요 없음
```

### 3.2 코드 파싱 (AST)

| 항목 | Codepilot | Cursor | Continue | Windsurf |
|------|-----------|--------|----------|----------|
| 파서 | Tree-sitter | 내장 | Tree-sitter | 내장 |
| 지원 언어 | JS/TS/Python/Java | 다수 | 다수 | 다수 |
| 추출 정보 | 클래스/함수/메서드 | Semantic | Symbol | Symbol |
| 관계 분석 | import/export | ✅ | ❌ | ✅ |
| 심볼 검색 | ✅ findDefinition | ✅ | ✅ @code | ✅ |

**Codepilot TreeSitterAdapter 기능:**
```typescript
// 정의 찾기
findDefinition('MyClass', DefinitionType.CLASS, projectRoot)

// 사용 위치 찾기
findDefinitionUsages('foo', DefinitionType.FUNCTION, projectRoot)

// 관련 파일 찾기 (import 기반)
findRelatedFiles(filePath, projectRoot)
```

### 3.3 관련 파일 찾기

| 항목 | Codepilot | Cursor | Cline | Continue |
|------|-----------|--------|-------|----------|
| 검색 엔진 | Ripgrep | Semantic Search | Ripgrep | Ripgrep |
| 키워드 추출 | ✅ 한/영 분리 | ✅ | ❌ | ❌ |
| LLM 스코어링 | ✅ 배치 8개 | ✅ | ❌ | ❌ |
| 명시적 파일 감지 | ✅ 정규식 | ✅ | ✅ | ✅ |
| 임베딩 검색 | ❌ | ✅ | ❌ | ✅ |

**Codepilot의 4단계 파일 찾기:**
```
1. 명시적 파일명 추출 (정규식)
   → design.md, App.tsx 등 직접 언급된 파일

2. 키워드 확장
   → 한국어 형태소 + 영어 단어 + 기술 용어

3. 이중 필터링
   → Ripgrep 검색 + 파일명/경로 매칭

4. 배치 LLM 스코어링
   → 8개씩 배치 처리, 점수 ≥ 30점만 선택
```

**Cursor의 Semantic Search:**
```
임베딩 기반 유사도 검색
→ 코드의 의미적 유사성으로 관련 파일 탐색
```

### 3.4 프로젝트 분석

| 항목 | Codepilot | Cursor | Windsurf |
|------|-----------|--------|----------|
| 타입 감지 | ✅ 파일+LLM 혼합 | ✅ | ✅ |
| 프레임워크 | ✅ React/Vue/Angular/Django/Flask/Spring | ✅ | ✅ |
| 빌드 명령어 | ✅ 자동 추출 | ✅ | ✅ |
| 의존성 | ✅ package.json/pom.xml | ✅ | ✅ |
| 신뢰도 점수 | ✅ (0.6-0.95) | ❌ | ❌ |

**Codepilot 프로젝트 감지 신뢰도:**
```typescript
PROJECT_TYPE_CONFIDENCE = {
    DEPENDENCY_BASED: 0.95,    // package.json 라이브러리
    FILE_BASED: 0.85,         // 설정 파일
    LOCAL_HEURISTIC: 0.7,     // 휴리스틱
    KEYWORD_BASED: 0.6        // 키워드
}
// 신뢰도 < 0.7이면 사용자 선택 요청
```

---

## 4. 에이전트 루프/상태 관리 비교

### 4.1 상태 머신 비교

| 항목 | Codepilot | Cursor | Cline | Windsurf |
|------|-----------|--------|-------|----------|
| 상태 머신 | FSM 4단계 | 암묵적 | Plan-then-Act | Planning Agent |
| 계획 단계 | INVESTIGATION | Plan Mode | Plan | Planning |
| 실행 단계 | EXECUTION | Agent Mode | Act | Action |
| 검토 단계 | REVIEW | ❌ | ❌ | ❌ |
| 완료 단계 | DONE | ❌ | ❌ | ❌ |

**Codepilot FSM:**
```
INVESTIGATION (조사)
    ↓ [파일/검색 도구만 허용]
EXECUTION (실행)
    ↓ [모든 도구 허용]
REVIEW (검토)
    ↓ [도구 사용 금지, 자동 요약]
DONE (완료)
```

**Cline Plan-then-Act:**
```
Plan Mode: 접근 방식 설명, 사용자 동의 요청
    ↓
Act Mode: 승인 후 실행
```

### 4.2 도구 제한

| 단계 | Codepilot | Cursor | Cline |
|------|-----------|--------|-------|
| 조사 | READ_FILE, LIST_FILES, SEARCH_FILES, RIPGREP | 전체 | 전체 |
| 실행 | 전체 | 전체 | 전체 (승인 필요) |
| 검토 | 없음 (텍스트만) | - | - |

### 4.3 자동화 수준

| 항목 | Codepilot | Cursor | Cline | Windsurf |
|------|-----------|--------|-------|----------|
| 자동 실행 | ⚠️ 명령어만 | ✅ | ⚠️ 승인 필요 | ✅ Turbo Mode |
| 파일 변경 | 승인 필요 (Diff) | 자동 | 승인 필요 | 자동 |
| 명령어 실행 | 설정 가능 | 승인 필요 | 승인 필요 | 자동 |
| 테스트 재시도 | ✅ 자동 | ❌ | ❌ | ❌ |
| 에러 자동 수정 | ✅ | ✅ | ❌ | ❌ |

---

## 5. 프롬프트/LLM 통신 비교

### 5.1 프롬프트 구성

| 항목 | Codepilot | Cursor | Continue |
|------|-----------|--------|----------|
| OS별 프롬프트 | ✅ | ✅ | ✅ |
| LLM별 프롬프트 | ✅ Gemini/Banya/Ollama | ✅ | ✅ |
| 작업별 프롬프트 | ✅ code/execution/analysis | ✅ | ✅ |
| 커스텀 규칙 | ✅ .agent/rules/ | ✅ .cursor/rules/ | ✅ config |
| 프롬프트 캐싱 | ❌ | ✅ | ❌ |

**Codepilot 규칙 파일:**
```
.agent/rules/
├── stable-version.md
├── coding-style.md
├── project-architecture.md
└── db-policy.md
```

**Cursor 규칙:**
```
.cursor/rules/*.mdc (프로젝트)
User rules (전역)
Team rules (팀 대시보드)
AGENTS.md (에이전트용)
```

### 5.2 응답 처리

| 항목 | Codepilot | Cursor | Claude Code |
|------|-----------|--------|-------------|
| 응답 정제 | ✅ thinking 태그 제거 | ✅ | ✅ |
| 도구 호출 검증 | ✅ | ✅ | ✅ |
| 요약 생성 | ✅ 파일 검증 포함 | ❌ | ❌ |
| 형식 검증 | ✅ 페이즈별 규칙 | ✅ | ✅ |

---

## 6. 개선사항 및 권장사항

### 6.1 도구 시스템 개선

| 현재 | 문제점 | 권장 개선 |
|------|--------|-----------|
| XML 파싱 | 정규식 기반, 오류 가능성 | JSON Function Call로 전환 |
| 순차 실행 | 성능 저하 | 병렬 도구 실행 지원 |
| MCP 미지원 | 확장성 제한 | MCP 프로토콜 구현 |
| 웹 검색 없음 | 문서 참조 불가 | WebSearchTool 추가 |
| 브라우저 없음 | E2E 테스트 불가 | BrowserTool 추가 |
| 코드 분석 미구현 | AST 활용 부족 | AnalyzeCodeTool 완성 |

### 6.2 세션/히스토리 개선

| 현재 | 문제점 | 권장 개선 |
|------|--------|-----------|
| globalState만 | 내보내기/공유 불가 | 파일 내보내기 추가 |
| 단순 압축 | 중요 정보 손실 가능 | 선택적 압축 (중요도 기반) |
| 세션 공유 없음 | 팀 협업 불가 | 팀 세션 공유 기능 |
| 메모리 시스템 없음 | 스타일 학습 불가 | Windsurf式 Memory 추가 |

### 6.3 파싱/컨텍스트 개선

| 현재 | 문제점 | 권장 개선 |
|------|--------|-----------|
| Ripgrep만 | 의미 검색 불가 | 임베딩 기반 검색 추가 |
| 실시간 추적 없음 | 반복 프롬프팅 필요 | Windsurf式 액션 추적 |
| 열린 파일 미포함 | 컨텍스트 손실 | 열린 탭 컨텍스트 추가 |
| 클립보드 미포함 | 복사된 코드 누락 | 클립보드 추적 추가 |

### 6.4 에이전트 루프 개선

| 현재 | 문제점 | 권장 개선 |
|------|--------|-----------|
| 단일 에이전트 | 복잡한 작업 비효율 | 병렬 에이전트 (Cursor式) |
| Checkpoint 없음 | 롤백 불가 | 상태 체크포인트 시스템 |
| 진행 표시 기본 | 사용자 불안 | 상세 진행률/예상 시간 |

---

## 7. 우선순위별 개선 로드맵

### Phase 1: 핵심 격차 해소
1. **JSON Function Call 전환** - XML → JSON (모든 LLM 호환)
2. **MCP 프로토콜 지원** - 도구 확장성 확보
3. **병렬 도구 실행** - 성능 개선
4. **웹 검색 도구** - 문서/API 참조

### Phase 2: 경쟁력 강화
1. **실시간 액션 추적** - Windsurf式 컨텍스트 자동 수집
2. **메모리 시스템** - 코딩 스타일/패턴 학습
3. **임베딩 검색** - 의미 기반 파일 탐색
4. **줄 단위 Diff 수락** - 세밀한 변경 제어

### Phase 3: 차별화
1. **병렬 에이전트** - Cursor式 다중 작업
2. **Checkpoint 시스템** - 상태 복원
3. **팀 세션 공유** - 협업 지원
4. **브라우저 자동화** - E2E 테스트

---

## Sources

- [How Cursor AI IDE Works](https://www.cursor.com)
- [Cursor Agent System Prompt](https://github.com/x1xhlol/system-prompts-and-models-of-ai-tools)
- [Cline GitHub](https://github.com/cline/cline)
- [Cline MCP Configuration](https://github.com/cline/cline/blob/main/docs/mcp.md)
- [Claude Code SDK](https://docs.anthropic.com/claude/docs/claude-code)
- [Copilot Memory](https://github.blog/changelog/2024-11-13-copilot-memory/)
- [Windsurf Cascade](https://codeium.com/windsurf)
- [Continue Context Providers](https://continue.dev/docs)
