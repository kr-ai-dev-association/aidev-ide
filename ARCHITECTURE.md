# CodePilot 아키텍처 문서

## 목차

1. [FSM (유한 상태 기계) 에이전트 루프](#1-fsm-유한-상태-기계-에이전트-루프)
2. [의도 감지 (Intent Detection)](#2-의도-감지-intent-detection)
3. [메인 실행 루프](#3-메인-실행-루프)
4. [도구 시스템 (Tool System)](#4-도구-시스템-tool-system)
5. [보안 검증 (Pre-Tool Validation)](#5-보안-검증-pre-tool-validation)
6. [멀티 에이전트 오케스트레이션](#6-멀티-에이전트-오케스트레이션)
7. [인라인 Diff & 체크포인트 시스템](#7-인라인-diff--체크포인트-시스템)
8. [에러 핸들링 & 자동 수정](#8-에러-핸들링--자동-수정)
9. [빌드/테스트 자동 검증](#9-빌드테스트-자동-검증)
10. [Hot Load 시스템](#10-hot-load-시스템)
11. [파일 트랜잭션](#11-파일-트랜잭션)
12. [스트리밍 & 코드 적용](#12-스트리밍--코드-적용)
13. [전체 실행 흐름도](#13-전체-실행-흐름도)
14. [설정값 & 상수](#14-설정값--상수)

---

## 1. FSM (유한 상태 기계) 에이전트 루프

**파일:** `src/core/managers/conversation/AgentStateManager.ts`

### 1.1 페이즈 정의

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ INVESTIGATION│───→│  EXECUTION   │───→│    REVIEW    │───→│     DONE     │
│  (조사)      │    │  (실행)      │    │  (검토)      │    │  (완료)      │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
     읽기 전용           전체 도구           도구 없음           도구 없음
```

| 페이즈 | 목적 | 허용 도구 | LLM 호출 |
|--------|------|-----------|----------|
| `INVESTIGATION` | 정보 수집, 파일 읽기, 분석 | 읽기 전용 도구만 | O |
| `EXECUTION` | 파일 생성/수정, 명령 실행 | 모든 도구 | O |
| `REVIEW` | 결과 요약 생성 | 없음 (시스템 처리) | X |
| `DONE` | 최종 상태 | 없음 | X |

### 1.2 페이즈별 허용 도구

**INVESTIGATION (읽기 전용)**
```
✅ read_file, list_files, search_files, ripgrep_search
✅ stat_file, list_imports, expand_around_line, git_diff
✅ read_active_file, fetch_url, lsp, list_code_definitions
❌ create_file, update_file, remove_file, run_command
```

**EXECUTION (전체)**
```
✅ 모든 도구 사용 가능
✅ create_file, update_file, remove_file, run_command
✅ 읽기 전용 도구 포함
```

### 1.3 상태 전환 조건

```
INVESTIGATION → EXECUTION
  조건: LLM이 계획(plan JSON)을 제출했거나,
        실행 도구(create_file 등)를 호출한 경우

EXECUTION → REVIEW
  조건: 파일 변경이 발생하고 테스트 검증이 완료된 경우,
        또는 모든 도구 실행이 완료된 경우

REVIEW → DONE
  조건: 항상 진행 (미완료 작업 감지 시 EXECUTION으로 복귀 가능)

DONE → (전환 불가)
  최종 상태
```

### 1.4 LLM 출력 규약

| 페이즈 | 계획 허용 | 도구 호출 필수 | 텍스트만 허용 |
|--------|-----------|---------------|---------------|
| INVESTIGATION | O | X | O |
| EXECUTION | X | **O (필수)** | X |
| REVIEW | X | X | X (시스템) |

### 1.5 루프 감지 & 복구

- **동일 전환 5회 반복** → 전환 차단, 강제 종료
- **INVESTIGATION 5분 이상 정체** → 자동 중단
- **연속 실패 3회** → 자동 복구 전략 실행

```
INVESTIGATION 실패 복구:
  'no_plan'      → 재시도 (LLM에 계획 생성 유도)
  'loop_detected' → DONE으로 강제 전환
  'stale_state'   → DONE으로 중단

EXECUTION 실패 복구:
  'text_only'     → 재시도 (도구 호출 강제)
  'loop_detected' → REVIEW로 강제 전환
```

---

## 2. 의도 감지 (Intent Detection)

**파일:** `src/core/managers/action/IntentDetector.ts`

### 2.1 의도 카테고리 & 서브타입

| 카테고리 | 서브타입 | 설명 | 계획 필요 |
|----------|----------|------|-----------|
| `code` | `code_generate` | 새 코드/파일 생성 | O |
| `code` | `code_modify` | 기존 코드 수정 | O |
| `code` | `code_remove` | 코드/파일 삭제 | O |
| `execution` | `execution_build` | 빌드 실행 | O |
| `execution` | `execution_run` | 서버/앱 실행 | O |
| `execution` | `execution_install` | 패키지 설치 | O |
| `execution` | `execution_deploy` | 배포 | O |
| `analysis` | `analysis_structure` | 프로젝트 구조 분석 | X |
| `analysis` | `analysis_technology` | 기술 스택 분석 | X |
| `analysis` | `analysis_function` | 함수/로직 분석 | X |
| `analysis` | `analysis_branch` | 브랜치 분석 | X |
| `documentation` | `documentation_general` | 문서 생성 | X |
| `terminal` | `terminal_error_fix` | 터미널 에러 수정 | O |

### 2.2 의도 감지 흐름

```
사용자 입력
    ↓
[1] 입력 전처리
    - @filename 제거
    - 터미널 컨텍스트 분리
    - 진단 정보 분리
    ↓
[2] LLM 분류
    - 의도 감지 전용 프롬프트로 LLM 호출
    - JSON 응답 파싱: { subtype, confidence, reasoning, requiresPlan }
    ↓
[3] 결과 반환
    IntentDetectionResult {
        category: "code"
        subtype: "code_generate"
        taskType: "code_work"
        confidence: 0.97
        reasoning: "사용자가 새 프로젝트 생성을 요청..."
        requiresPlan: true
    }
    ↓
[4] 폴백
    - LLM 실패 시 → analysis_function (confidence: 0.1)
```

### 2.3 의도에 따른 시작 페이즈

```
code_generate    → 기존 프로젝트 있으면 INVESTIGATION, 없으면 EXECUTION
code_modify      → INVESTIGATION (기존 코드 파악 필요)
code_remove      → INVESTIGATION
execution_*      → 기존 프로젝트 있으면 INVESTIGATION, 없으면 EXECUTION
analysis_*       → INVESTIGATION (직접 응답, 에이전트 루프 불필요)
documentation_*  → INVESTIGATION
terminal_error_* → EXECUTION (바로 수정 시도)
```

---

## 3. 메인 실행 루프

**파일:** `src/core/managers/conversation/ConversationManager.ts`

### 3.1 진입점: handleUserMessageAndRespond()

```
사용자 메시지
    ↓
[1] 의도 감지 (IntentDetector.detectIntent)
    ↓
[2] 컨텍스트 수집 (ContextGatherer.gatherContext)
    - 프로젝트 구조, 의존성, 파일
    - VS Code 진단 정보
    - 터미널 출력, Git 상태
    - RAG 검색 (소스 등록된 경우만)
    ↓
[3] 시스템 프롬프트 생성
    - Hot Load 규칙 (최우선)
    - 프레임워크 규칙
    - 코딩 컨벤션 (Admin 스킬)
    - 도구 스펙
    ↓
[4] 에이전트 루프 실행
```

### 3.2 메인 While 루프

```typescript
while (turnCount < maxTurns) {    // maxTurns = 20~30
    turnCount++

    // ─── REVIEW 페이즈 ───
    if (currentPhase === REVIEW) {
        시스템이 자동으로 결과 요약 생성 (LLM 호출 없음)
        → DONE으로 전환
        continue
    }

    // ─── DONE 페이즈 ───
    if (currentPhase === DONE) {
        세션 저장, 정리
        break
    }

    // ─── INVESTIGATION 페이즈 ───
    if (currentPhase === INVESTIGATION) {
        LLM 호출 (조사 프롬프트)
        응답 파싱: 계획 JSON, 도구 호출, 텍스트

        if (계획 있음 OR 실행 도구 호출) {
            → EXECUTION으로 전환
        }
        continue
    }

    // ─── EXECUTION 페이즈 ───
    if (currentPhase === EXECUTION) {
        LLM 호출 (실행 프롬프트)
        응답 파싱: 도구 호출 (필수)

        for (각 도구 호출) {
            PreToolUseValidator로 사전 검증
            도구 실행
            결과를 대화에 추가
        }

        // 완료 판단
        handlePostToolTransition() 호출
    }
}
```

### 3.3 handlePostToolTransition() — 실행 후 전환 판단

이 메서드가 실행 루프의 핵심 분기점입니다.

```
도구 실행 완료
    ↓
[1] 도구 호출이 없었고 계획도 없으면 → proceed (다음 턴)
    ↓
[2] 남은 계획 항목이 있으면 → continue (다음 계획 항목 실행)
    ↓
[3] INVESTIGATION 페이즈이면 → continue (계획 생성 유도)
    ↓
[4] code_modify/code_generate인데 write 도구가 없으면 → continue
    (list_files만 실행하고 끝나는 문제 방지)
    ↓
[5] 파일 변경이 있으면 → 자동 테스트 실행 후 REVIEW
    ↓
[6] MCP 도구가 실행되었으면 → continue (결과를 LLM에 전달)
    ↓
[7] execution_run인데 run_command가 없으면 → continue
    ↓
[8] 그 외 → REVIEW로 전환
```

### 3.4 턴 컨텍스트 상태

```typescript
{
    turnCount: number               // 현재 턴 (0 ~ maxTurns)
    pendingRetryPrompt: boolean     // 재시도 프롬프트 대기 중
    executionNoToolRetryCount: number  // EXECUTION에서 도구 없이 재시도 횟수
    createdFiles: string[]          // 누적 생성 파일
    modifiedFiles: string[]         // 누적 수정 파일
    conversationTurnId: string      // 이 턴의 UUID (체크포인트용)
}
```

---

## 4. 도구 시스템 (Tool System)

**파일:** `src/core/tools/ToolRegistry.ts`

### 4.1 내장 도구 목록

| 도구 | 설명 | 읽기 전용 | 페이즈 |
|------|------|-----------|--------|
| `create_file` | 파일 생성/작성 | X | EXECUTION |
| `update_file` | 기존 파일 수정 | X | EXECUTION |
| `remove_file` | 파일 삭제 | X | EXECUTION |
| `run_command` | 셸 명령 실행 | X | EXECUTION |
| `read_file` | 파일 내용 읽기 | O | 모두 |
| `list_files` | 디렉토리 목록 | O | 모두 |
| `search_files` | 퍼지 파일 검색 | O | 모두 |
| `ripgrep_search` | 정규식 코드 검색 | O | 모두 |
| `expand_around_line` | 특정 줄 주변 읽기 | O | 모두 |
| `list_imports` | import 목록 추출 | O | 모두 |
| `stat_file` | 파일 메타데이터 | O | 모두 |
| `git_diff` | Git 변경사항 | O | 모두 |
| `fetch_url` | URL 내용 다운로드 | O | 모두 |
| `lsp` | Language Server 쿼리 | O | 모두 |
| `list_code_definitions` | 심볼 정의 추출 | O | 모두 |
| `read_active_file` | 현재 열린 파일 읽기 | O | 모두 |

### 4.2 MCP 도구 (동적 등록)

```
외부 MCP 서버에서 동적으로 등록되는 도구
  - 이름 충돌 시 서버명 접두사 추가 (예: slack_fetch_channels)
  - INVESTIGATION, EXECUTION 페이즈에서만 사용 가능
  - 자동 실행 ON/OFF 설정 가능
```

### 4.3 도구 호출 파싱 형식

**새 XML 형식 (v9.2.0+)**
```
{ "tool": "create_file", "path": "src/App.tsx" }
<file_content>
import React from 'react';
export default function App() { ... }
</file_content>
```

**레거시 코드 블록 형식**
```markdown
```typescript:src/App.tsx
import React from 'react';
export default function App() { ... }
```⠀
```

### 4.4 도구 실행 흐름

```
LLM 응답에서 도구 호출 파싱
    ↓
PreToolUseValidator로 보안 검증
    ↓
ToolExecutionContext 구성
    ↓
ToolRegistry에서 핸들러 조회
    ↓
핸들러.execute(context)
    ↓
ToolResponse { success, message, data } 반환
    ↓
결과를 대화 컨텍스트에 추가 → LLM의 다음 턴에 전달
```

---

## 5. 보안 검증 (Pre-Tool Validation)

**파일:** `src/core/tools/PreToolUseValidator.ts`

### 5.1 명령어 검증 (run_command)

| 차단 패턴 | 사유 |
|-----------|------|
| `rm -rf /` | 시스템 파괴 |
| `sudo` | 권한 상승 |
| `shutdown`, `reboot` | 시스템 종료 |
| `git push --force` | 코드 손실 |
| `git reset --hard` | 변경사항 손실 |
| `chmod 777` | 보안 취약 |
| `curl \| bash` | 원격 코드 실행 |
| `$(...)` + rm | 변수 확장 공격 |

### 5.2 파일 접근 검증

**읽기 차단:**
- 프로젝트 외부 파일
- Admin이 설정한 hidden 패턴

**쓰기 차단:**
- `.env`, `.git`, `.gitignore`
- `package-lock.json`, `yarn.lock` (읽기만 허용)
- 프로젝트 외부 경로

**경로 보안:**
- 심볼릭 링크 해석 (디렉토리 탈출 방지)
- `..`, `.` 경로 정규화
- 실제 경로(realpath) 기반 검증

### 5.3 규칙 우선순위

```
1. 하드코딩된 기본 차단 규칙
2. 사용자 정의 규칙 (IDE 설정)
3. Admin 서버 필수 규칙 (required - 변경 불가)
4. Admin 서버 권장 규칙 (recommended - 비활성화 가능)
```

---

## 6. 멀티 에이전트 오케스트레이션

**파일:** `src/core/orchestration/OrchestrationRouter.ts`

### 6.1 싱글 루프 vs 멀티 에이전트

```
오케스트레이션 OFF (기본값):
    ConversationManager.executeAgentLoop()
    → 단일 FSM 루프

오케스트레이션 ON:
    TaskSplitter가 요청 분석
    ├─ shouldSplit = false → 싱글 루프 (위와 동일)
    └─ shouldSplit = true  → 서브태스크로 분할
        ├─ SubAgentLoop[] 병렬 실행 (최대 3개)
        └─ ResultMerger로 결과 병합
```

### 6.2 TaskSplitter 판단 기준

**파일:** `src/core/orchestration/TaskSplitter.ts`

```
분할하지 않음:
  - 단일 파일 수정
  - 하나의 기능
  - 순차 의존성이 강한 작업

분할함:
  - 서로 다른 모듈 (프론트 + 백엔드)
  - 독립적인 컴포넌트 여러 개
  - 병렬 처리 가능한 작업
```

### 6.3 SubTask 구조

```typescript
{
    id: "task-1"
    title: "프론트엔드 프로젝트 초기화"
    description: "React + TypeScript Vite 프로젝트 생성..."
    dependencies: []                  // 선행 태스크 ID
    toolPermission: "full"            // "read-only" | "read-only-with-commands" | "full"
}
```

### 6.4 SubAgentLoop

**파일:** `src/core/orchestration/SubAgentLoop.ts`

메인 ConversationManager와의 차이:

| 항목 | ConversationManager | SubAgentLoop |
|------|--------------------:|-------------:|
| FSM 페이즈 | O (4단계) | X (단순 루프) |
| 최대 턴 | 20~30 | 15 |
| 스트리밍 UI | O | X |
| 사용자 승인 | O | X |
| 세션 관리 | O | X |
| 에러 재시도 | O | 제한적 |

```
SubAgentLoop 실행 흐름:

while (turnCount < 15) {
    LLM 호출 (전용 시스템 프롬프트)
        ↓
    도구 호출 파싱
        ↓
    도구 실행 (검증 포함)
        ↓
    결과를 대화에 추가
        ↓
    도구 호출 없음 + 코드 완성 → 종료
}
    ↓
AgentLoopResult {
    subtaskId, success,
    response, createdFiles,
    modifiedFiles, errors
}
```

---

## 7. 인라인 Diff & 체크포인트 시스템

**파일:** `src/core/managers/diff/InlineDiffManager.ts`

### 7.1 변경 단위 (InlineChange)

```typescript
{
    id: "change-uuid"
    filePath: "/project/src/App.tsx"
    range: Range(10, 0, 15, 0)      // 에디터 내 위치
    oldText: "기존 코드"              // Reject 시 복원용
    newText: "AI가 생성한 코드"        // 이미 에디터에 반영됨
    type: "add" | "delete" | "modify"
    status: "pending"                // pending → accepted/rejected/dirty
    conversationTurnId: "turn-uuid"  // LLM 턴 ID
}
```

### 7.2 체크포인트 (AICheckpoint)

```typescript
{
    id: "checkpoint-uuid"
    fileUri: "file:///project/src/App.tsx"
    beforeContent: "AI 수정 전 전체 파일 내용"
    changes: [InlineChange, ...]
    status: "pending"               // pending → accepted/rejected
    conversationTurnId: "turn-uuid"
}
```

### 7.3 턴 체크포인트 스택 (Undo History)

```
스택 (오래된 것부터):
[Turn0_Checkpoint, Turn1_Checkpoint, Turn2_Checkpoint, ...]

Undo Turn2 → Turn2 이전 상태로 복원 (cascade undo)
Undo Turn1 → Turn1, Turn2 모두 되돌림
```

### 7.4 Accept / Reject 흐름

```
Accept:
  Change.status = 'accepted'
  에디터에 이미 반영되어 있으므로 추가 작업 없음

Reject:
  Change.status = 'rejected'
  에디터에서 newText 제거, oldText 복원
  체크포인트의 모든 변경이 rejected → Checkpoint.status = 'rejected'

사용자 직접 수정:
  Change.status = 'dirty' (AI 변경이 사용자 수정으로 무효화)
```

### 7.5 UI 표시

```
초록색 배경  = 추가된 코드 (add)
빨간색 배경  = 삭제된 코드 (delete) - decoration.before로 표시
노란색 배경  = 수정된 코드 (modify)

CodeLens 버튼:
  [Accept] [Reject] - 개별 변경 단위
  [Accept All] [Reject All] - 파일 단위
  [Keep Turn] [Undo Turn] - 턴 단위
```

---

## 8. 에러 핸들링 & 자동 수정

### 8.1 에러 분류

**파일:** `src/core/managers/error/ErrorManager.ts`

| 카테고리 | 설명 | 심각도 |
|----------|------|--------|
| `SYNTAX_ERROR` | 코드 문법 오류 | MEDIUM |
| `RUNTIME_ERROR` | 런타임 예외 | MEDIUM |
| `BUILD_ERROR` | 빌드/컴파일 실패 | HIGH |
| `DEPENDENCY_ERROR` | 의존성 누락/버전 충돌 | MEDIUM |
| `EXECUTION_ERROR` | 명령 실행 실패 | HIGH |
| `FILE_NOT_FOUND` | 파일 없음 | LOW |
| `PERMISSION_ERROR` | 접근 거부 | HIGH |
| `TIMEOUT_ERROR` | 작업 시간 초과 | HIGH |

### 8.2 자동 수정 루프

**파일:** `src/core/managers/error/AutoErrorHandler.ts`

```
에러 발생 (터미널/빌드/콘솔)
    ↓
[1] ErrorManager.captureError()
    - 소스: TERMINAL, BUILD, CONSOLE, DIAGNOSTIC
    - 출력 파싱 → ErrorCategory, ErrorSeverity
    ↓
[2] autoCorrectionEnabled 설정 확인
    ↓
[3] 쿨다운 체크 (마지막 에러로부터 8초)
    ↓
[4] 에러 메시지로 LLM 호출
    shortPrompt: "터미널 에러 해결: {error}"
    ↓
[5] LLM이 수정 도구 호출 (update_file, run_command 등)
    ↓
[6] 수정 후 재실행 → 성공 or 새 에러 감지
```

### 8.3 재시도 코디네이터

**파일:** `src/core/managers/conversation/handlers/RetryCoordinator.ts`

```
에러 분류 (ErrorClassifier)
    ↓
동일 에러 반복 감지
    ├─ 1~2회: 자동 수정 시도
    ├─ 3회: 최대 재시도 도달 → 포기
    └─ 에러 폴백 모델: 동일 에러 2회 반복 시
       → 지정된 고성능 모델로 마지막 재시도
```

---

## 9. 빌드/테스트 자동 검증

**파일:** `src/core/managers/conversation/handlers/TestRunner.ts`

### 9.1 검증 파이프라인

```
EXECUTION 완료 (파일 변경 감지)
    ↓
[1] 프로젝트 타입 감지
    - npm/Node.js → tsc --noEmit, npm test
    - Python → python -m pytest
    - Java → mvn verify
    - 사용자 지정 명령어 (codepilot.validationCommand)
    ↓
[2] Smoke Test 실행
    - 빌드 검증
    - 린트 검증
    - 테스트 실행
    ↓
[3] 출력 분석
    ├─ 성공 → REVIEW로 전환
    └─ 실패:
        ├─ 에러 분류 (ErrorClassifier)
        ├─ 자동 수정 시도 (LLM에 에러 전달)
        ├─ 수정된 코드로 재검증
        └─ 최대 재시도 (testRetryCount, 기본 5회)
```

### 9.2 검증 결과

```typescript
{
    success: boolean
    errorMessage?: string
    classification?: {          // 에러 상세
        category: ErrorCategory
        severity: ErrorSeverity
        suggestions: string[]
    }
}
```

---

## 10. Hot Load 시스템

**파일:** `src/core/managers/hotload/HotLoadManager.ts`

### 10.1 구조

```typescript
HotLoadItem {
    keywords: "빌드해줘, 빌드"        // 트리거 키워드
    command: "npm run build"          // 실행할 명령
    completionCondition: {
        type: "exit_code"             // exit_code | output_contains | file_exists
        value: "0"
    }
    maxRetries: 3                     // 최대 재시도
    onFailure: "pass_to_llm"         // stop | pass_to_llm
}
```

### 10.2 실행 흐름

```
사용자 입력: "빌드해줘"
    ↓
LLM이 Hot Load 키워드와 매칭 (의미론적 매칭)
    ↓
미리 정의된 명령 실행: npm run build
    ↓
완료 조건 확인: exit_code === 0
    ├─ 성공 → 완료 보고
    └─ 실패:
        ├─ 재시도 (최대 maxRetries회)
        └─ onFailure = "pass_to_llm" → LLM에 에러 전달
```

### 10.3 규칙 소스

```
Admin 서버 규칙 (required)  → 변경 불가
Admin 서버 규칙 (recommended) → 사용자 비활성화 가능
사용자 로컬 규칙 → IDE에서 직접 설정
```

---

## 11. 파일 트랜잭션

**파일:** `src/core/managers/action/file/FileTransactionManager.ts`

### 11.1 트랜잭션 패턴

```
대화 시작
    ↓
[1] beginTransaction({ userQuery, source: "conversation" })
    - 트랜잭션 ID 생성
    - 이전 트랜잭션 자동 커밋
    ↓
[2] 파일 변경 기록
    recordFileChange(filePath, afterContent)
    - 변경 히스토리에 추가
    ↓
[3-a] 성공 → commit()
    - 변경 확정
    - 히스토리 유지 (최대 50개)

[3-b] 에러 → rollback(txnId)
    - 변경 취소
    - 원본 복원
```

---

## 12. 스트리밍 & 코드 적용

**파일:** `src/core/tools/StreamingCodeApplier.ts`

### 12.1 스트리밍 전략

```
LLM 응답 청크 수신
    ↓
rawBuffer에 축적
    ↓
도구 호출 패턴 감지?
    ├─ Yes → 출력 보류 (텍스트 스트리밍 중단)
    │        도구 호출 완료 후 코드 블록으로 변환
    └─ No  → 안전한 텍스트만 UI로 스트리밍
```

### 12.2 타이핑 효과

```
CHARS_PER_TICK = 8        // 틱당 문자 수
TICK_INTERVAL_MS = 16     // ~60fps

rawBuffer → displayBuffer → UI 출력
  (빠르게 축적)  (천천히 방출)   (타이핑 효과)
```

### 12.3 XML → 마크다운 변환

```
입력 (LLM 원본):
{ "tool": "create_file", "path": "src/App.tsx" }
<file_content>
import React from 'react';
</file_content>

출력 (채팅 UI):
📄 src/App.tsx
```typescript
import React from 'react';
```⠀
```

---

## 13. 전체 실행 흐름도

```
사용자 메시지 입력
    ↓
[1] 의도 감지 (IntentDetector)
    - 분류: code / execution / analysis / documentation / terminal
    - 서브타입: code_generate, code_modify, execution_run, ...
    - 신뢰도: 0.0 ~ 1.0
    ↓
[2] 컨텍스트 수집 (ContextGatherer)
    - 프로젝트 구조, 의존성
    - VS Code 진단 정보
    - 터미널 출력, Git 상태
    - RAG 검색 (소스 등록 시)
    ↓
[3] 시스템 프롬프트 생성
    - Hot Load 규칙
    - 프레임워크/코딩 규칙 (Admin 스킬)
    - 도구 스펙
    ↓
[4] 오케스트레이션 판단
    ├─ 싱글 모드 → ConversationManager 단일 루프
    └─ 멀티 모드 → TaskSplitter → SubAgentLoop[] 병렬
    ↓
[5] 에이전트 FSM 루프 (turnCount < maxTurns)
    │
    ├── INVESTIGATION
    │   ├─ LLM: 분석, 파일 읽기, 계획 수립
    │   ├─ 읽기 전용 도구 실행
    │   └─ 계획 완성 or 실행 도구 호출 → EXECUTION
    │
    ├── EXECUTION
    │   ├─ LLM: 파일 생성/수정, 명령 실행
    │   ├─ PreToolUseValidator 보안 검증
    │   ├─ 도구 실행 + 결과 피드백
    │   ├─ 파일 변경 시 InlineDiffManager 체크포인트 생성
    │   ├─ 완료 판단 (handlePostToolTransition)
    │   │   ├─ write 도구 없으면 → continue (루프 계속)
    │   │   ├─ 파일 변경 있으면 → 자동 테스트 → REVIEW
    │   │   └─ MCP 도구 실행 → continue (결과 해석)
    │   └─ TestRunner 자동 검증
    │       ├─ 통과 → REVIEW
    │       └─ 실패 → 에러 분석 → 자동 수정 → 재검증
    │
    ├── REVIEW
    │   ├─ 시스템이 결과 요약 생성 (LLM 호출 없음)
    │   ├─ 파일 변경 목록, 코드 diff 표시
    │   └─ → DONE
    │
    └── DONE
        ├─ 세션 저장
        ├─ 파일 트랜잭션 커밋
        └─ 루프 종료
    ↓
[6] 에러 발생 시
    ├─ RetryCoordinator: 동일 에러 분류 → 재시도 관리
    ├─ AutoErrorHandler: 터미널 에러 자동 감지 → 수정
    └─ 에러 폴백 모델: 2회 반복 → 고성능 모델 전환
    ↓
[7] UI 출력 (WebviewBridge)
    ├─ INVESTIGATION: 분석 상태 표시
    ├─ EXECUTION: 코드 블록 스트리밍, 진행 상태
    ├─ REVIEW: 요약, Diff 표시
    └─ 에러: 포맷팅된 에러 메시지
    ↓
[8] 사용자 리뷰
    ├─ Accept / Reject (변경 단위)
    ├─ Keep Turn / Undo Turn (턴 단위)
    └─ Accept All / Reject All (파일 단위)
```

---

## 14. 설정값 & 상수

**파일:** `src/core/config/AgentConfig.ts`

| 상수 | 값 | 설명 |
|------|-----|------|
| `MAX_TURNS` | 20~30 | 메인 루프 최대 반복 |
| `MAX_INVESTIGATION_TURNS` | 10 | INVESTIGATION 최대 깊이 |
| `MAX_CONSECUTIVE_FAILURES` | 3 | 연속 실패 제한 |
| `MAX_SAME_TRANSITION_COUNT` | 5 | 루프 감지 임계값 |
| `SESSION_TRIM_THRESHOLD` | 50 | 세션 히스토리 자동 압축 기준 |
| `SESSION_TRIM_TARGET` | 20 | 압축 후 유지 항목 수 |
| `VALIDATION_COMMAND_TIMEOUT` | 30000ms | 테스트 타임아웃 |
| `MIN_INTENT_CONFIDENCE` | 0.5 | 의도 감지 최소 신뢰도 |
| `MAX_HISTORY_ENTRIES` | 10 | 이전 대화 컨텍스트 포함 수 |
| `errorRetryCount` | 5 | 에러 자동 수정 최대 횟수 |
| `testRetryCount` | 5 | 테스트 자동 재시도 최대 횟수 |

### 주요 파일 경로

| 목적 | 파일 |
|------|------|
| FSM 상태 관리 | `src/core/managers/conversation/AgentStateManager.ts` |
| 메인 실행 루프 | `src/core/managers/conversation/ConversationManager.ts` |
| 의도 감지 | `src/core/managers/action/IntentDetector.ts` |
| 도구 레지스트리 | `src/core/tools/ToolRegistry.ts` |
| 보안 검증 | `src/core/tools/PreToolUseValidator.ts` |
| 오케스트레이션 | `src/core/orchestration/OrchestrationRouter.ts` |
| 태스크 분할 | `src/core/orchestration/TaskSplitter.ts` |
| 서브 에이전트 | `src/core/orchestration/SubAgentLoop.ts` |
| 결과 병합 | `src/core/orchestration/ResultMerger.ts` |
| Diff 관리 | `src/core/managers/diff/InlineDiffManager.ts` |
| 에러 관리 | `src/core/managers/error/ErrorManager.ts` |
| 자동 수정 | `src/core/managers/error/AutoErrorHandler.ts` |
| 재시도 조정 | `src/core/managers/conversation/handlers/RetryCoordinator.ts` |
| 테스트 실행 | `src/core/managers/conversation/handlers/TestRunner.ts` |
| Hot Load | `src/core/managers/hotload/HotLoadManager.ts` |
| 파일 트랜잭션 | `src/core/managers/action/file/FileTransactionManager.ts` |
| 스트리밍 파서 | `src/core/tools/StreamingToolParser.ts` |
| 코드 적용 | `src/core/tools/StreamingCodeApplier.ts` |
| 컨텍스트 수집 | `src/core/managers/conversation/handlers/ContextGatherer.ts` |
| 설정 관리 | `src/core/managers/state/SettingsManager.ts` |
| 세션 관리 | `src/core/managers/state/SessionManager.ts` |
