<p align="right">
  🇺🇸 <a href="README.md">View in English</a>
</p>

# aidev-ide README

VSCode 기반 코드 어시스턴트 플러그인 (LLM 및 LM 지원)

## v8.7.3 (재시도 횟수 기본값 증가 및 UI 개선)
- **재시도 횟수 기본값 증가**: 에러 복구를 위해 기본 재시도 횟수를 증가했습니다.
  - 에러 자동 수정 기본 재시도 횟수: 3회 → 5회
  - 자동 테스트 재시도 기본 횟수: 3회 → 5회
- **UI 용어 개선**: "자동 테스트 실패 시 재시도" → "자동 코드 검증"으로 용어 변경하여 의미 명확화
- **Pending Changes 동기화 개선**: 채팅 패널과 드롭다운 간 동기화를 개선했습니다.
  - 채팅 패널에서 Keep/Undo 클릭 시 같은 파일의 모든 코드 블록 버튼이 제거됨
  - 채팅 패널에서 변경사항 승인/거부 시 드롭다운이 자동으로 업데이트됨

## v8.7.2 (프롬프트 규칙 충돌 해결)
- **프롬프트 규칙 우선순위 명확화**: LLM 혼란과 무반응을 야기하던 프롬프트 규칙 충돌을 해결했습니다.
  - 명확한 우선순위 설정: 1) 정보 수집 우선, 2) 복잡한 작업은 계획 필요, 3) 행동 우선, 4) 실행 중심
  - `getBaseRules()`를 우선순위 구조와 실용적인 예시로 업데이트
  - "의심스러우면 파일을 읽고 실행하라" 가이드라인 추가로 분석 마비 방지
  - 불명확한 상황에 대한 예외 조항을 포함한 `getNoInternalMonologueRules()` 개선
  - 작업 모드 결정 가이드라인을 포함한 `getCodeWorkPrompt()`, `getExecutionWorkPrompt()` 개선
  - LLM이 행동 없이 내부 추론("We need to...", "According to...")만 출력하던 문제 해결
  - 올바른 워크플로우(읽기 → 실행)와 잘못된 워크플로우(내부 독백만) 비교 예시 추가

## v8.7.1 (Pending Changes UI 개선)
- **Pending Changes 드롭다운 UI 개선**: 사용성을 향상시킨 pending changes 드롭다운 인터페이스 개선.
  - 파일 경로 표시: 파일명 대신 전체 상대 경로 표시 (예: `src/app.ts`)
  - 버튼 레이블: "Accept" → "Keep", "Reject" → "Undo"로 변경하여 액션 의미 명확화
  - Undo 버튼 스타일: Undo 버튼 배경색 검은색 (#1e1e1e)으로 Keep 버튼과 구분
  - 드롭다운 너비: 파일 경로 수용을 위해 320px에서 420px로 확장
  - 아이콘 업데이트: 화살표 아이콘 `>` → `›`로 변경하여 시각적 일관성 향상
  - 채팅 패널 버튼: 코드 블록 아래 Accept/Reject 버튼도 드롭다운과 동일한 스타일로 업데이트 (Keep/Undo, 동일한 색상)

## v8.7.0 (Pending Changes 팝업)
- **Pending Changes 팝업**: 아직 승인/거부되지 않은 파일 변경사항(diff)을 관리하는 팝업 UI를 추가했습니다.
  - 인풋 패널에 새 버튼 추가 (모델 선택기 옆) - pending changes 개수 배지 표시
  - 클릭하면 pending changes가 있는 모든 파일 목록 팝업 표시
  - 각 파일별 표시: 파일명, 추가/삭제 라인 수
  - 파일별 액션: View Diff, Accept, Reject
  - 전체 액션: Accept All, Reject All
  - 파일 변경 시 자동 업데이트
- **InlineDiffManager 개선**: UI 연동을 위한 `getPendingChangesStats()`, `hasPendingChanges()` 메서드 추가
- **실시간 업데이트**: 도구 실행 후 pending changes 팝업 자동 새로고침

## v8.6.0 (컨텍스트 자동 압축)
- **컨텍스트 자동 압축**: 긴 대화를 관리하기 위한 자동 컨텍스트 압축 기능을 추가했습니다. 대화 컨텍스트가 모델의 토큰 제한의 80%를 초과하면 시스템이 자동으로:
  - LLM을 사용하여 오래된 메시지를 요약
  - 최근 12개 메시지는 원본 형태로 유지
  - [이전 대화 요약] + [최근 메시지] 구조로 압축
  - LLM 요약 실패 시 슬라이딩 윈도우로 폴백
- **ConversationCompactor**: 하이브리드 요약 전략을 구현하는 새 클래스 (`ConversationCompactor.ts`):
  - 토큰 임계값 모니터링 (설정 가능, 기본 80%)
  - 오래된 메시지에 대한 LLM 기반 지능형 요약
  - 안정성을 위한 슬라이딩 윈도우 폴백
  - 압축 통계 추적
- **UI 알림**: 컨텍스트 압축 발생 시 절약된 토큰 정보와 함께 사용자에게 알림

## v8.5.1 (프롬프트 시스템 정리)
- **프롬프트 시스템 정리**: 중복 및 미사용 프롬프트 규칙을 정리하여 유지보수성을 개선했습니다.
  - base 프롬프트에서 미사용 `getXmlToolRules()` 함수 제거
  - 작업별 프롬프트에서 중복된 XML/마크다운 규칙 제거 (base 규칙에 이미 포함됨)
  - base.ts의 전역 규칙을 간결하게 통합하여 가독성 향상
  - 모든 필수 기능을 유지하면서 프롬프트 구조 간소화

## v8.5.0 (개발 규칙 자동 로드)
- **개발 규칙 자동 로드**: `.agent/rules` 디렉토리에서 개발 규칙을 자동으로 로드하는 기능을 추가했습니다. 이제 시스템은 `.agent/rules` 디렉토리의 마크다운 파일들(stable-version.md, coding-style.md, project-architecture.md, dependency-policy.md, db-policy.md)을 자동으로 읽어서 시스템 프롬프트에 강제 규칙으로 포함시킵니다. 존재하는 파일만 로드되므로 일부 규칙 파일만 있어도 정상적으로 동작합니다.

## v8.4.0 (프레임워크별 프롬프트 제거)
- **프레임워크별 프롬프트 제거**: 프롬프트 시스템을 단순화하기 위해 모든 프레임워크별 프롬프트 파일을 제거했습니다. 이제 시스템은 하드코딩된 프레임워크 프롬프트 대신 LLM이 프로젝트 파일(package.json, pom.xml 등)을 읽어서 프레임워크별 요구사항을 동적으로 감지하고 처리하도록 변경되었습니다.

## v8.2.0 (파일 Diff 표시 및 Formatter 통합 개선)
- **파일 Diff 표시**: 추가 및 삭제된 라인에 대한 시각적 표시가 개선된 코드 블록의 파일 diff 표시 기능 향상. Diff 블록의 헤더에 라인 수 변경 사항이 표시됩니다.
- **Formatter 인식 Decoration 관리**: Formatter 실행 중 및 실행 후 decoration 처리를 개선했습니다. 코드 포맷팅 후 decoration이 올바르게 보존되고 재적용되어, formatter가 파일을 수정할 때 decoration 손실을 방지합니다.
- **문서 변경 감지**: Formatter로 인한 변경을 올바르게 처리하도록 문서 변경 감지를 개선했습니다. Formatter 완료 후 첫 번째 문서 변경은 자동으로 무시되어 잘못된 reconciliation을 방지합니다.

## v8.1.0 (Diff UI/UX 개선 및 코드 블록 향상)
- **Accept/Reject All 버튼**: diff를 표시하는 코드 블록 아래에 "Accept"와 "Reject" 버튼을 추가하여 파일의 모든 변경사항을 한 번에 승인하거나 거부할 수 있습니다. 버튼은 클릭 후 자동으로 제거됩니다.
- **코드 블록 구문 강조**: Highlight.js를 사용하여 VS Code 다크 테마 색상으로 코드 블록에 구문 강조를 구현했습니다. 다양한 언어 별칭을 지원하는 포괄적인 언어 매핑을 추가했습니다.
- **버튼 가시성 개선**: Bash/PowerShell/Cmd 블록의 Copy 및 Run 버튼이 이제 항상 표시됩니다 (호버 시에만 표시되지 않음). 일반 코드 블록에서는 Copy 버튼을 제거하고 Bash 블록에만 유지했습니다.
- **새 파일 Decoration 타이밍 수정**: 새로 생성된 파일의 decoration 적용 타이밍 문제를 해결했습니다. 파일이 생성되고 즉시 포맷팅되어도 decoration이 올바르게 적용됩니다.
- **Formatter 통합**: 코드 포맷팅 완료 후 decoration 재적용을 개선했습니다. 포맷팅이 완료된 후 decoration이 올바르게 복원됩니다.
- **파일 경로 해석**: 상대 경로를 절대 경로로 정규화하여 Accept/Reject All 기능의 파일 경로 매칭 문제를 해결했습니다.

## v8.0.0 (CryptoUtils 향상)
- **CryptoUtils 보안 개선**: `cryptoUtils.ts`의 보안, 코드 품질, 타입 안전성, 오류 처리를 향상시켰습니다. 라이선스 시리얼 암호화 기능을 추가했습니다.

## v7.0.1 (확률 기반 판단 로직 일관성 개선)
- **임계값 중앙화 관리**: 모든 확률 기반 판단 임계값(confidence, threshold, percentage)을 `AgentConfig.ts`에 중앙화하여 유지보수성과 일관성을 크게 향상시켰습니다.
- **일관된 Confidence 값**: 같은 용도에 대해 통일된 confidence 값 적용:
  - 로컬 감지: 모두 0.8로 통일 (이전: 0.7, 0.8 혼재)
  - 프레임워크 감지: Express도 0.8로 통일 (이전: 0.7)
  - Python 프로젝트 감지: Django 0.9, Flask/FastAPI 0.85, 일반 0.8
  - 에러 수정 confidence: 자동 0.9, 반자동 0.85, 수동 0.7
- **계층화된 Confidence 체계**: 감지 방법에 따라 계층화된 confidence 체계 구현:
  - `DEPENDENCY_BASED` (0.95): package.json dependencies 기반 (가장 정확)
  - `FILE_BASED` (0.9): 설정 파일 존재 기반
  - `LOCAL_HEURISTIC` (0.8): 로컬 파일 패턴 매칭
  - `KEYWORD_BASED` (0.7): 사용자 쿼리 키워드 기반 (가장 불확실)
- **업데이트된 파일**: 하드코딩된 값을 `AgentConfig` 상수로 교체:
  - `ProjectManager.ts`, `ProjectDetector.ts`, `FileMutationManager.ts`
  - `UpdateFileToolHandler.ts`, `tokenUtils.ts`, `ActionMapper.ts`
  - `ErrorManager.ts`, `KeywordSelector.ts`
- **문서화**: `PROBABILITY_BASED_DECISIONS.md` 문서를 생성하여 모든 확률 기반 판단 로직, 개선 사항, 제거된 로직 히스토리를 문서화했습니다.

## v7.1.0 (프롬프트 파일 통합 및 구조 개선)
- **프롬프트 파일 통합**: 분산되어 있던 프롬프트 파일들을 분류별로 통합하여 유지보수성을 크게 향상시켰습니다.
  - `base/` 디렉토리 (11개 파일) → `base.ts` 하나로 통합: `agentRole`, `objective`, `rules`, `fileOperations`, `codeVsScript`, `codeGeneration`, `errorCorrection`, `outputFormat`, `tools`, `terminalCommands`, `commonRules` 등 모든 기본 프롬프트 컴포넌트를 단일 파일로 통합
  - `rules/` 디렉토리 (2개 파일) → `rules.ts` 하나로 통합: `executionFirst`, `errorRetry` 규칙 프롬프트 통합
  - `task/` 디렉토리 (3개 파일) → `task.ts` 하나로 통합: `CodeWorkPrompt`, `ExecutionWorkPrompt`, `summarize` 작업 타입별 프롬프트 통합
  - `phase/` 디렉토리 (2개 파일) → `phase.ts` 하나로 통합: `investigation`, `execution` 단계별 프롬프트 통합
- **Import 경로 정리**: 모든 프롬프트 호출 위치의 import 경로를 통합된 파일 구조에 맞게 수정하여 일관성을 보장했습니다.
- **코드 구조 개선**: 프롬프트 파일 수를 18개에서 4개로 대폭 감소시켜 파일 탐색과 수정이 훨씬 쉬워졌습니다.

## v7.0.0 (리팩토링 및 Analysis 답변 생성 로직 개선)
- **리팩토링: `ripgrep_search` 결과 파싱 개선**: `RipgrepSearchToolHandler`가 원본 `SearchResult[]` 배열을 `rawResults`로 함께 반환하도록 수정하여 자동 답변 생성 로직이 올바르게 파싱할 수 있도록 개선했습니다.
- **리팩토링: 함수명 추출 로직 개선**: 함수 검색 시 사용자 쿼리에서 먼저 함수명을 추출하도록 우선순위를 변경했습니다. 이제 "test 함수가 어디에 있어?" 같은 쿼리에서 "test"를 정확히 추출할 수 있습니다.
- **리팩토링: 자동 조사 도구 중복 실행 방지**: 자동 조사에서 실행한 도구를 `executedInTurn`에 추가하여 LLM이 동일한 도구를 다시 호출할 때 중복 실행을 방지합니다.
- **Analysis 답변 생성 로직 개선**: `investigation_done` 토큰이 없어도 `ripgrep_search` 결과가 있으면 자동으로 답변을 생성하도록 개선했습니다. LLM 호출 없이 검색 결과를 직접 파싱하여 답변을 생성합니다.
- **중복 출력 문제 해결**: `ripgrep_search` 결과가 있을 때 LLM이 직접 답변을 생성해도 자동 답변 생성 로직이 우선 처리되어 중복 출력을 방지합니다.
- **`ripgrep_search` 패턴 파싱 오류 처리**: `ripgrep_search`의 `pattern` 파라미터가 없거나 비어있으면 경고를 추가하고 해당 호출을 스킵하도록 검증 로직을 추가했습니다.
- **요약 한글 강제**: REVIEW 단계에서 생성되는 요약이 항상 한글로 출력되도록 프롬프트에 명시적인 지시를 추가했습니다.

## v6.10.0 (Execution-first 판단 로직 통일 및 FSM 일관성 보장)
- **Execution-first 판단 로직 통일**: execution-first 작업 판단을 공통 함수 `isExecutionFirstTask()`로 통일하여 모든 위치에서 동일한 기준을 적용합니다. 이제 `code_generate`, `code_run` 같은 작업도 초기 판단과 후속 판단에서 일관되게 처리되어 FSM 상태 전환, 도구 허용 여부, retry/auto-transition이 올바르게 동작합니다.
- **논리 연산자 우선순위 명확화**: Phase 전환 조건의 논리 연산자 우선순위를 괄호로 명확히 하여 의도한 대로 동작하도록 수정했습니다.

## v6.9.0 (Analysis 응답 표시 문제 해결)
- **Analysis 응답 패널 표시 수정**: `investigation_done` 후 생성된 analysis 응답이 패널에 표시되지 않던 문제를 해결했습니다. `WebviewBridge.receiveMessage`에서 `'Assistant'` sender를 `'CODEPILOT'`으로 변경하여 webview에서 정상적으로 처리되도록 수정했습니다.

## v6.8.0 (테스트 재시도 로직 개선 및 TypeScript 검증 순서 최적화)
- **EXECUTION phase 도구 실행 보장**: EXECUTION phase에서 `run_command`가 차단되는 문제를 해결했습니다. 이제 테스트 실패 후 LLM이 제안한 수정 명령어(`npm install` 등)가 정상적으로 실행됩니다.
- **테스트 재시도 프롬프트 개선**: 테스트 실패 후 재시도 시 "이미 존재하는 파일은 생성하지 말 것" 안내를 추가하여 중복 파일 생성 문제를 방지합니다.
- **테스트 성공 후 REVIEW 전환 개선**: 테스트 성공 후 즉시 REVIEW 단계로 전환되도록 로직을 개선했습니다. EXECUTION phase에서 모든 도구가 차단된 경우 더 이상 실행할 작업이 없으면 자동으로 REVIEW로 전환됩니다.
- **TypeScript 검증 순서 최적화**: TypeScript 프로젝트에서 `tsc --noEmit`을 먼저 실행하고, 그 다음 린트 도구를 실행하도록 검증 순서를 개선했습니다. 타입 에러를 먼저 확인한 후 린트 에러를 확인합니다.
- **설정 패널 UI 동기화 수정**: 설정 패널을 다시 열 때 저장된 `autoTestRetryEnabled` 값이 토글에 올바르게 반영되도록 수정했습니다.
- **검증 명령어 판단 기준**: `getValidationCommand()`가 null을 반환하면 LLM에게 질의합니다. null은 규칙 기반으로 안전하게 결정 가능한 검증 명령이 존재하지 않음을 의미하며, 이 경우에만 LLM을 보조적인 추론 수단(fallback)으로 사용합니다. 하드코딩에 포함되지 않는 프로젝트 타입이나 특수한 경우를 처리하기 위한 설계입니다.

## v6.7.0 (자동 테스트 제어 및 Investigation 단계 개선)
- **자동 테스트 실행 제어**: 자동 테스트(Smoke Test, Lint Check) 및 에러 메시지는 이제 "auto test retry" 설정이 활성화된 경우에만 실행되고 표시됩니다. 비활성화 시 테스트는 완전히 건너뛰고 에러 메시지도 표시하지 않습니다.
- **Investigation 단계 도구 전환**: INVESTIGATION 단계에서 실행 도구가 차단될 때, 시스템이 이제 자동으로 EXECUTION 단계로 전환하면서 도구를 함께 실행하여 원활한 단계 전환을 보장합니다.
- **통일된 파일 리스트 형식**: INVESTIGATION 단계가 이제 EXECUTION 단계와 동일한 `[D] [F]` 형식의 파일 인벤토리를 사용하여 일관성을 제공합니다. `formatFileTree` 메서드는 `buildProjectInventorySection`으로 대체되어 제거되었습니다.

## v6.6.0 (LLM 호출 최적화 완료 및 실행 보장)
- **LLM 호출 최적화 완료**: 
  - DONE 단계에서 LLM 호출이 전혀 발생하지 않도록 완전히 제거했습니다.
  - 테스트 통과/실패 시 모두 REVIEW 단계를 거쳐 요약이 생성되도록 보장했습니다.
  - 루프 종료 전 중복 테스트 실행을 방지하여 불필요한 LLM 호출을 제거했습니다.
- **EXECUTION 단계 실행 보장**: 
  - INVESTIGATION에서 plan만 나오고 tool call이 없을 때 EXECUTION으로 전환되지 않도록 FSM 전환 조건을 강화했습니다.
  - EXECUTION 단계에서 plan item에 실행 도구가 없을 때 LLM을 호출하여 필요한 tool call을 생성하도록 개선했습니다.
  - 이제 모든 plan item이 실제로 실행되어 파일이 생성됩니다.
- **CODE/ASK 색상 교체**: CODE 모드는 파란색, ASK 모드는 녹색으로 색상을 교체하여 시각적 구분을 개선했습니다.

## v6.5.0 (LLM 호출 최적화 및 실행 로직 개선)
- **EXECUTION 단계 실행 로직 개선**: INVESTIGATION에서 plan만 나오고 tool call이 없을 때 EXECUTION으로 전환되지 않도록 수정했습니다. 이제 조사가 완료된 후에만 EXECUTION으로 전환되어 파일이 생성되지 않고 종료되는 문제를 해결했습니다.
- **Plan Item 실행 보장**: EXECUTION 단계에서 plan item에 실행 도구가 없을 때 LLM을 호출하여 필요한 tool call을 생성하도록 개선했습니다. 이제 모든 plan item이 실제로 실행되어 파일이 생성됩니다.
- **LLM 호출 최적화**: 
  - DONE 단계에서 LLM 호출이 전혀 발생하지 않도록 확인 및 수정했습니다.
  - 테스트 통과/실패 시 모두 REVIEW 단계를 거쳐 요약이 생성되도록 개선했습니다.
  - 루프 종료 전 중복 테스트 실행을 방지하여 불필요한 LLM 호출을 제거했습니다.
- **CODE/ASK 색상 교체**: CODE 모드는 파란색, ASK 모드는 녹색으로 색상을 교체하여 시각적 구분을 개선했습니다.

## v6.4.0 (Investigation 단계 강화 및 UI 개선)
- **Investigation 단계 프롬프트 강화**: `<plan>` 태그와 실행 도구(`<create_file>`, `<update_file>` 등)를 같은 응답에 포함하는 것을 엄격히 금지하도록 프롬프트를 강화했습니다. 조사 단계에서는 오직 읽기 전용 도구만 사용하고, 계획만 제출하도록 명확히 지시합니다.
- **작업 계획 팝업 UI 개선**: 작업 계획 팝업에서 제목과 상세 설명이 한 줄로 붙어 보이던 문제를 해결했습니다. 이제 제목과 상세가 다음 줄로 분리되어 가독성이 향상되었습니다.
- **검증 단계별 상태 표시**: 코드 검증(Smoke Test, Lint Check) 과정을 실시간으로 표시합니다. 프로젝트 타입 감지, Smoke Test 실행, Lint Check 실행 등 각 단계별 진행 상황을 `processSteps`에 표시하여 사용자가 검증 과정을 명확히 파악할 수 있습니다.
- **REVIEW 단계 LLM 호출 최적화**: REVIEW 단계에서 요약 생성 시 LLM을 2번 호출하던 문제를 해결했습니다. 이제 `generateVerifiedSummary`가 원본 요약이 없을 때만 LLM을 호출하여 1회로 최적화되었습니다.

## v6.3.0 (경량 FSM 및 Plan-First 아키텍처)
- **경량 FSM 구현**: 상태 관리 중앙화, 엄격한 전환 규칙, Output Contract를 제공하는 `AgentStateManager`를 도입했습니다.
- **상태 전환 검증**: 전환 전 조건 검사를 통해 유효한 상태 전환(INVESTIGATION → EXECUTION)만 허용합니다.
- **Output Contract 강제**: 각 상태(INVESTIGATION, EXECUTION)별로 허용되는 출력(plan 태그, 도구 호출, 텍스트만)에 대한 명시적 규칙을 정의했습니다.
- **Blind Planning 방지**: INVESTIGATION 단계에서 EXECUTION으로 전환하기 전에 도구 호출 또는 조사 이력이 필요하도록 하여, 정보 수집 없이 계획만 수립하는 것을 방지합니다.
- **배치 파일 읽기**: `read_file` 도구가 이제 여러 `<path>` 태그 또는 `<paths>` 파라미터를 사용하여 한 번의 호출로 여러 파일을 읽을 수 있습니다.
- **자동 Plan Item 완료 처리**: EXECUTION 단계에서 LLM이 도구 호출 없이 요약만 제공할 경우 자동으로 plan item을 완료 처리합니다.
- **조사 이력 추적**: 시스템이 조사 도구 사용을 추적하여 상태 전환을 검증하고 조기 실행을 방지합니다.

## v6.2.0 (고성능 검색 도구 및 토큰 효율 최적화)
- **Ripgrep 기반 고성능 검색**: 대규모 프로젝트에서도 매우 빠른 속도로 키워드 및 정규식을 검색할 수 있는 `ripgrep_search` 도구를 추가했습니다.
- **스타일의 검색 결과 포맷**: 검색 결과에 매칭 라인 전후의 코드 컨텍스트를 파이프(|) 구분자와 함께 표시하여, LLM이 파일 전체를 읽지 않고도 코드의 의도를 정확히 파악할 수 있도록 개선했습니다.
- **토큰 사용 효율 최적화**: 
  - 도구 호출(XML)이 포함된 응답에서 중간 텍스트 설명을 생략하도록 지시하여 응답 속도를 높이고 토큰 낭비를 방지했습니다. 
  - 상세한 한글 요약은 작업이 완전히 완료된 마지막 턴에서만 제공됩니다.
- **JSONC 파싱 개선**: `tsconfig.json`, `jsconfig.json` 등 주석과 후행 쉼표(trailing comma)가 포함된 설정 파일을 안전하게 읽을 수 있도록 전용 클리너 로직을 도입했습니다.
- **Gemini 플랜 파싱 수정**: Gemini 모델이 계획 수립 시 숫자 리스트를 사용하는 문제를 해결하기 위해, 반드시 정해진 XML 구조(`<item><title>...</title></item>`)를 사용하도록 전용 프롬프트를 강화했습니다.
- **로그 관리 정제**: 콘솔 로그에서 지나치게 긴 LLM 응답을 축약 표시하고 중복된 출력 로직을 제거하여 개발자 경험을 개선했습니다.

## v6.1.1 (완전한 LLM 전용 의도 분석 및 버그 수정)
- **완전한 LLM 전용 의도 분석**: 의도 분석 파이프라인에서 `keywords` 의존성을 완전히 제거했습니다. 이제 시스템은 어떠한 휴리스틱 키워드 매칭 없이 100% LLM의 추론에만 의존하여 의도를 분류합니다.
- **UI 단순화**: 처리 단계 UI에서 불필요한 "키워드 분석" 단계를 삭제하여 더 빠르고 깔끔한 에이전트 흐름을 제공합니다.
- **의도 분석 엔진 안정화**: `IntentDetector`에서 누락되었던 하위 유형 매핑 로직을 복구하여 컴파일 오류를 해결했습니다.

## v6.1.0 (UI 정제 및 통합 의도 분석)
- **모델 선택 UI 개선**: 채팅창 모델 선택 드롭다운에 시각적 컬러 바(Gemini: 파란색, Ollama: 주황색)를 추가하여 모델 간 구분을 명확히 하고 디자인 통일성을 높였습니다.
- **LLM 전용 의도 분석 엔진**: `IntentDetector`가 하드코딩된 키워드 매칭이나 폴백 없이 현재 활성화된 LLM(Gemini 또는 Ollama)만을 사용하여 의도를 분류하도록 개선했습니다.
- **브랜드 일관성 강화 (CODEPILOT)**: 채팅 패널, 설정 UI, 로컬라이징 파일 전반에 걸쳐 브랜드명을 "CODEPILOT"으로 표준화했습니다.
- **Gemini 모델 최적화**: 기본 Gemini 모델을 `gemini-3-pro-preview`로 업데이트하고 선택 옵션을 정돈했습니다.
- **반응형 UI 레이아웃**: 설정 패널의 드롭다운이 좁은 화면에서도 올바르게 확장되도록 레이아웃 문제를 수정했습니다.
- **기능 단순화**: 사용하지 않는 "Planning (Reasoning)" 기능을 제거하여 코드베이스를 정리하고 사용자 경험을 집중시켰습니다.

## v6.0.0 (LLM 전용 의도 분석 및 지능형 에러 처리)
- **LLM 전용 의도 분석**: 하드코딩된 키워드 매칭을 완전히 제거하고, 100% LLM 기반의 의도 분류를 도입하여 정확도와 유연성을 극대화했습니다.
- **지능형 반복 실패 감지**: 동일한 도구가 반복적으로 실패할 경우 이를 감지하여 LLM에게 경고(System Alert)를 보내고, 파일 존재 여부 확인 등 구체적인 해결 가이드를 제공하여 자가 수정을 유도합니다.
- **UI 로컬라이징 강화**: `processSteps` UI에 노출되는 영문 도구명을 사용자 친화적인 한글 레이블(예: '파일 수정', '파일 읽기' 등)로 치환하여 가독성을 높였습니다.
- **작업 큐 가시성 개선**: 웹뷰에서 작업 큐 팝업이 가려지거나 클릭되지 않던 렌더링 문제를 해결하고, 항상 최상단에 표시되도록 개선했습니다.
- **자율적 에이전트 제약 완화**: '조사(Investigation)' 단계의 제약을 완화하여 LLM이 스스로 조사와 실행의 시점을 판단할 수 있도록 자율성을 부여했습니다.
- **공격적 자가 수정 도입**: 빈 응답(Thinking만 있고 Action이 없는 경우)에 대한 API 레벨의 재시도 로직을 강화하고, 모든 턴에서 반드시 결과물이 나오도록 규칙을 강화했습니다.

## v5.2.2 (LLM 자율성 강화 및 의도 분석 리팩토링)
- **지능형 의도 분석 리팩토링**: 하드코딩된 키워드 의존도를 낮추고 LLM 중심의 유연한 의도 판단 구조로 전환하여 대응력을 높였습니다.
- **LLM 자가 수정 로직 (Ollama)**: 모델이 생각(`thinking`)만 하고 실제 행동(XML 도구 호출)을 누락한 경우, 시스템이 이를 감지하여 자동으로 재시도하고 도구 호출을 유도하는 로직을 구현했습니다.
- **실행 중심 시스템 프롬프트**: "설명만 하는 응답은 시스템 에러"로 규정하고, 모든 턴에 반드시 하나 이상의 XML 도구 호출이 포함되도록 글로벌 규칙을 강화했습니다.
- **대화 루프 최적화**: 불필요하고 반복적인 재촉 로직을 제거하고, 정교해진 시스템 프롬프트와 API 레벨의 자가 수정을 통해 더 자연스러운 에이전트 흐름을 구축했습니다.

## v5.2.1 (작업 큐 UI 혁신 및 안정성 강화)
- **플로팅 작업 큐**: React 기반의 동적 플로팅 팝업으로 작업 큐를 재도입했습니다.
  - **실시간 상태 동기화**: 작업 상태(`대기`, `진행 중`, `완료`)를 실시간으로 동기화합니다.
  - **시각적 진행률**: 헤더에 완료 진행률(예: "2/5 작업 완료")을 표시합니다.
  - **애니메이션 상태**: 진행 중인 작업에 대해 깜빡이는 동그라미 아이콘을 적용하여 명확한 피드백을 제공합니다.
  - **제어 기능**: UI 방해를 최소화하기 위해 최소화/최대화 및 닫기 기능을 추가했습니다.
- **안정성 개선**:
  - **자동 초기화**: 새로운 요청이 시작되면 기존 작업 큐를 자동으로 비우고 숨깁니다.
  - **턴 단위 중복 제거**: 한 턴 내에서 동일한 도구(예: 중복된 `read_file` 호출)의 중복 실행을 방지하여 UI 로그를 정리했습니다.
  - **스마트 작업 완료**: 에이전트 루프가 정상 종료될 때 남은 작업들을 자동으로 완료 상태로 처리합니다.
  - **사이드 이펙트 추적**: 파일이나 시스템 변경을 유도하는 도구 실행 시 즉시 작업 상태를 업데이트합니다.
- **로그 최적화**: 콘솔 출력에서 불필요한 시스템 헤더를 제거하여 더 깔끔한 디버깅 경험을 제공합니다.

## v5.2.0 (조사 관리자 도입 및 UI/UX 대전환)
- **조사 관리자 (Investigation Manager)**:
  - **읽기 전용 단계 강제**: 코드 수정 전 반드시 '조사' 단계를 거치도록 강제합니다. 이 단계에서는 읽기 도구(`read_file`, `list_files`, `search_files`)만 허용됩니다.
  - **엄격한 단계 전환**: 유효한 XML 형식의 `<plan>`이 제출되고 승인되어야만 '실행' 단계로 전환됩니다.
  - **파일 삭제 안전 규칙**: 자의적인 파일 삭제를 방지하기 위해 엄격한 규칙을 도입했습니다. `remove_file`은 사용자의 명시적 요청이나 계획에 포함된 경우에만 허용됩니다.
- **UI/UX 대전환**:
  - **페이즈 레이블**: 실시간 진행 상태에 `[조사]` 및 `[실행]` 레이블을 추가하여 현재 에이전트의 모드를 명확히 표시합니다.
  - **상태 표시 통합**: `TaskQueue` 패널과 상단 `ProcessingSteps`를 제거하고, 하단 로딩 영역에서 터미널 스타일의 타자기 애니메이션으로 통합했습니다.
  - **조건부 스티키 바**: 진행 상태 바가 화면을 따라다니며 스크롤 시 상단에 고정됩니다.
- **에이전트 루프 고도화**:
  - **엄격한 계획 포맷**: `<plan><item>...` 구조를 엄격히 강제하여 명확하고 실행 가능한 계획 수립을 보장합니다.
  - **인터리브드(Interleaved) 출력**: LLM의 설명과 도구 실행 결과(코드 미리보기 포함)를 순차적으로 배치하여 투명성을 높였습니다.
  - **스마트 너징(Nudging)**: 분석만 하고 행동하지 않는 경우를 감지하여 도구 호출이나 계획 수립을 유도합니다.
- **도구 및 의도 감지 강화**:
  - **초강력 update_file**: 공백 무시 구조적 매칭, 블록 앵커 매칭 등을 통해 파일 수정의 안정성을 대폭 향상시켰습니다.
  - **의도 감지 오류 수정**: TypeScript 컴파일 및 린트 에러를 정확하게 감지하여 코드 수정 작업으로 분류하도록 개선했습니다.
  - **지능형 list_files 필터링**: `node_modules`, `.git` 등 불필요한 경로를 자동으로 제외합니다.

## v5.1.3 (외부 API 제거)
- **외부 API 제거**: 모든 외부 API 연동 기능 제거 (날씨, 주식, 뉴스 API)
  - 날씨 API 연동 제거 (기상청 API)
  - 주식 API 연동 제거 (Alpha Vantage API)
  - 뉴스 API 연동 제거 (네이버 뉴스 API)
  - 관련 UI 컴포넌트, 설정, 핸들러 모두 제거
  - 설정 항목 및 상태 관리 코드 정리

## v5.1.2 (LLM 자율 판단 & 파일 수정 개선)
- **LLM 자율 판단**: 시스템 자동 follow-up 생성 제거. LLM이 실패한 작업 재시도 및 후속 tool call 생성을 스스로 판단하도록 변경 
- **update_file 매칭 개선**: 
  - Line-trimmed 매칭: 공백을 제거한 후 줄 단위 비교 (들여쓰기 구조 유지)
  - Block anchor 매칭: 3줄 이상 블록에서 첫 줄/마지막 줄을 앵커로 사용
  - 에러 메시지 개선: SEARCH 패턴 실패 시 최신 파일 내용 포함하여 LLM이 자가 수정 가능하도록 함
- **프롬프트 한글화**: 모든 도구 관련 프롬프트를 한글로 번역하여 LLM 이해도 향상.
- **CDATA 섹션 처리**: LLM이 생성한 CDATA 섹션을 처리하기 위한 `removeCDataSections()` 유틸리티 추가.
- **에러 처리 개선**: 실패한 `update_file` 작업 시 에러 메시지에 최신 파일 내용을 포함하여 LLM이 올바른 패턴으로 재시도할 수 있도록 함.

## v5.1.1 (Tree-sitter 기반 함수 위치 검색 & read_file 표시 개선)
- **Tree-sitter 통합**: 정규식 대신 tree-sitter AST 파싱을 사용하여 함수/클래스 위치를 정확하게 검색합니다.
- **read_file 결과 표시 개선**: 전체 파일 대신 특정 라인 주변(위아래 5줄)만 표시하여 가독성을 향상시켰습니다.
- **작업 큐 개수 일치**: `list_files`를 successCount/failCount에서도 제외하여 작업 큐 표시 개수와 실행 완료 개수가 일치합니다.
- **중복 표시 제거**: follow-up tool call의 `read_file` 결과는 표시하지 않아 중복 표시를 방지합니다.
- **함수 위치 자동 검색**: 사용자 질의에서 함수명을 추출하여 tree-sitter로 정확한 선언 위치를 찾습니다.

## v5.1.0 (XML 툴 전용 프롬프트 & 툴 UX 개선)
- **XML-only 프롬프트**: fileOperations/outputFormat/CodeWorkPrompt에서 마크다운 지시어 안내를 제거하고 XML 툴 콜만 사용하도록 단순화했습니다.
- **create_file 필수 content**: `create_file` 호출 시 `content`가 비어 있으면 실패하도록 프롬프트에서 강하게 안내합니다.
- **작업 큐 소음 감소**: `list_files` 툴 호출은 작업 큐 표시에서 제외하여 잡 리스트가 깔끔하게 보입니다.
- **문서 업데이트**: `prompt.md`, `ARCHITECTURE.md`에 새 툴 디렉토리 구조(`tools/file`, `tools/terminal`, `tools/code`)와 XML-only 규칙을 반영했습니다.
- **응답 규율 강화**: XML 툴 콜은 반드시 `response`에 넣고 `thinking`은 비워두도록 강조했습니다.

## v5.0.11 (처리 단계 UI 개선)
- **ProcessingSteps 상태 업데이트 수정**: 초기 step이 설정되지 않은 상태에서 `updateProcessingStatus` 메시지가 프로그레스를 표시하지 않던 문제를 수정했습니다. 이제 상태 업데이트를 받을 때 step이 없으면 자동으로 새 step을 생성합니다.
- **디버깅 로그**: 프로그레스 표시 문제 진단을 위해 `setProcessingStep`과 `updateProcessingStatus` 명령에 콘솔 로그를 추가했습니다.

## v5.0.10 (파일 컨텍스트 트래커 연동 & 안정성 가드)
- **FileContextTracker 연동**: `FileContextTracker`가 `ContextManager.collectFileContext`와 `ActionManager` 양쪽에 연결되어, 디스크에 완전히 기록되기 전에 파일을 읽지 않도록 보호합니다.
- **액션 실행 전 안정성 가드**: `CODE_GENERATION`, `FILE_OPERATION` 액션 실행 직전에 `trackFile()`과 `waitForFileStability()`를 호출하여, 실행 직후 컨텍스트를 다시 수집하더라도 저장 중간 상태(부분 기록)가 아닌 안정된 내용을 읽도록 보장합니다.
- **대용량/자동 저장 파일 안전 처리**: 파일 크기와 mtime이 일정 시간 동안 변하지 않을 때까지 짧게 대기하여, 자동 저장이나 긴 쓰기 작업과의 레이스 컨디션을 줄였습니다.

## v5.0.9 (단일 Codepilot 패널 & 실시간 Ollama 선택기)
- **Codepilot 단일 패널**: CODE/ASK 모드를 하나의 Codepilot 패널에서 드롭다운으로 전환
- **실시간 Ollama 모델 선택**: 상단 Model 드롭다운이 로컬 Ollama `/api/tags`에서 실시간 모델 목록을 불러와 선택/저장
- **UI 정리**: 기존 ASK 패널 제거, 입력창/아이콘 정돈

## v5.0.8 (코드 분석 및 파일 검색 강화, 구조 리팩토링)
- **AST 기반 코드 분석**: Tree-sitter를 통한 고급 코드 분석 기능 추가
  - 코드 정의 이름 목록 추출 (`listCodeDefinitionNames`)
  - 정의 사용 위치 검색 (`findDefinitionUsages`) - import, call, reference, extend, implement
  - import/export 관계 기반 관련 파일 찾기 (`findRelatedFiles`)
- **Regex 기반 파일 검색**: ripgrep을 통한 빠른 파일 검색 기능 추가
  - VS Code 내장 ripgrep 또는 시스템 ripgrep 사용
  - ripgrep 없을 때 네이티브 검색으로 자동 폴백
  - 검색 결과에 주변 컨텍스트 포함
  - 파일 패턴 필터링 (include/exclude)
- **구조 리팩토링**:
  - `src/core/file/` → `src/core/action/file/`로 이동 (FileChangeTracker)
  - `src/core/context/file/` 구조로 파일 관련 컨텍스트 수집 기능 통합
    - FileContext, RelevantFilesFinder, FileSearcher를 한 곳에 모음
- **추가된 파일**:
  - `src/core/context/file/FileSearcher.ts` - Regex 기반 파일 검색
  - `src/core/project/codeParser/types.ts` - AST 분석 타입 정의
- **이동된 파일**:
  - `src/core/file/` → `src/core/action/file/` (FileChangeTracker)
  - `src/core/context/FileContext.ts` → `src/core/context/file/FileContext.ts`
  - `src/core/context/RelevantFilesFinder.ts` → `src/core/context/file/RelevantFilesFinder.ts`

## v5.0.7 (파일 변경 추적 및 검증)
- **파일 변경 추적**: 파일 변경 전후 상태를 추적하여 모든 변경사항 기록
  - 자동 추적: ActionManager를 통한 모든 파일 작업이 자동으로 추적됨
  - 변경 이력: 모든 파일의 완전한 변경 이력 조회 가능
  - Diff 생성: 추가/삭제/수정된 라인을 보여주는 자동 diff 생성
  - 되돌리기 기능: 이전 변경 시점으로 파일 복원 가능
  - 영구 저장: 모든 변경 이력이 VS Code globalState에 저장됨
  - 변경 리스너: 파일 변경 시 알림을 받을 수 있는 콜백 등록
- **추가된 파일**:
  - `src/core/action/file/FileChangeTracker.ts` - 파일 변경 추적 및 검증
  - `src/core/action/file/types.ts` - 타입 정의 (FileChange, FileChangeHistory, FileChangeDiff, RevertOptions)
  - `src/core/action/file/index.ts` - 배럴 파일

## v5.0.6 (컨텍스트 히스토리 관리 및 자동 요약)
- **컨텍스트 히스토리 관리**: 메시지별 컨텍스트 변경사항 추적, 컨텍스트 크기 모니터링, 체크포인트 관리
  - 컨텍스트 업데이트 추적: 파일, 선택, 커서, 터미널, 에러 컨텍스트 변경사항 기록
  - 크기 모니터링: 컨텍스트 크기 실시간 모니터링 (문자 수, 토큰 수)
  - 자동 압축: 토큰 사용량 기반 자동 압축 전략 (none, lastTwo, half, quarter)
  - 체크포인트 관리: 특정 시점의 컨텍스트 스냅샷 저장 및 복원
- **자동 요약**: 컨텍스트 크기 초과 시 대화 자동 요약
  - LLM 기반 요약: LLM을 사용한 포괄적인 요약 생성 (10개 섹션 구조)
  - 자동 트리거: 토큰 사용량이 95% 초과 시 자동 실행
  - 요약 저장: VS Code globalState에 영구 저장
  - 세션 재개: 요약을 continuation prompt로 변환하여 원활한 세션 재개
  - 삭제 범위 추적: `conversationHistoryDeletedRange`로 삭제된 메시지 범위 추적
- **이중 히스토리 구조**: 향후 확장을 위한 API 히스토리와 UI 메시지 분리
- **추가된 파일**:
  - `src/core/context/ContextHistoryManager.ts` - 컨텍스트 히스토리 관리
  - `src/core/context/ConversationSummarizer.ts` - 대화 요약 생성
  - `src/core/context/types/contextHistory.ts` - 타입 정의
  - `src/core/context/prompts/task/summarize.ts` - 요약 프롬프트

## v5.0.5 (FrameworkAdapter 제거 )
- FrameworkAdapter 구조 제거: LLM이 프로젝트 파일(package.json, pom.xml 등)을 읽어서 적절한 명령어와 설정을 판단하도록 전환했습니다.
- framework 디렉토리 삭제: `src/core/project/framework/` 디렉토리 제거 (TypeScriptAdapter, SpringBootAdapter, IFrameworkAdapter, FrameworkAdapterFactory).
- 프롬프트 개선: LLM이 명령어나 설정을 생성하기 전에 프로젝트 파일을 먼저 읽도록 지시를 추가했습니다.
- 아키텍처 단순화: 프레임워크별 프롬프트는 이름 기반 매칭만 사용하며, LLM이 프로젝트 파일에서 동적으로 감지하도록 처리합니다.

## v5.0.4 (채팅 버블 레이아웃 수정)
- 채팅 웹뷰 버블을 패널 전체 폭으로 확장하고 배경/테두리/패딩을 제거해 텍스트 가독성을 개선했습니다.

## v5.0.3 (프레임워크 프롬프트 개선 및 수정)
- 프레임워크 프롬프트 개선: Vite, NodeTypeScript, Express 프롬프트에 "먼저 확인하고" 우선순위 및 "새 프로젝트 생성 시에만" 조건 추가.
- 프레임워크 프롬프트에서 버전 하드코딩 제거: LLM이 프로젝트 파일을 읽어 적절한 설정을 판단하도록 개선.
- extension.ts의 ESM import 에러 수정: Node16/NodeNext 모듈 해석을 위해 모든 동적 import에 명시적 `.js` 확장자 추가.
- 작업 큐 표시 기능: 액션 실행 시 작업 큐에 등록되고 실행 상태가 실시간으로 업데이트됩니다.

## v5.0.2 (프롬프트 시스템 완전 통합)
- 모든 프롬프트를 `context/prompts/`로 통합: `commonGuides.ts`, `helpers.ts` 제거, 모든 프롬프트 가이드를 적절한 컴포넌트 디렉토리로 이동.
- OS 프롬프트 접근 통합: `os/helpers.ts` 제거, `PromptComposer.getOSPrompt()` public 메서드로 통합.
- 어댑터 단순화: GptAdapter와 GemmaAdapter가 PromptComposer를 직접 사용하여 일관된 프롬프트 생성.
- 중복 완전 제거: 프롬프트 관련 코드 중복 완전 제거, 아키텍처 단순화.

## v5.0.1 (프롬프트 시스템 리팩토링)
- 모듈형 프롬프트 스택(`PromptComposer`)으로 베이스/OS/LLM/프레임워크/작업 타입 컴포넌트 조합.
- OSAdapter, FrameworkAdapter 정보를 프롬프트에 자동 반영하여 지침 일관성 강화.
- GptAdapter가 PromptComposer를 사용하도록 통합, `COMMON_SYSTEM_PROMPTS` 제거.
- 버전 5.0.1 반영.

## v5.0.0 (마이그레이션 완료 요약)
- 새로운 매니저 아키텍처로 전면 통합(ARCHITECTURE.md 참조): Action/Execution/Terminal/Task/Project/Context/State-Session/Error/Model 매니저 중심으로 OS·LLM·Framework 추상화 일원화.
- STABILITY_GUIDE 기반 안정화: 최소 명령 정책(주석/조건문 금지, 최대 4개), 설치 플로우 핵심 명령만 유지, 플레이스홀더/중복/불필요 진단 명령 제거, 완료 신호/작업 큐 정리 강화, 안전 cwd 폴백.
- 프롬프트 강화: 실행 의도 시 한 줄 순수 명령만, lock 여부별 install 1개, 버전 확인 1회, 프레임워크 타입별 실행 명령 1줄.
- Action 파이프라인 정리: 명령 파싱 필터 강화, 요약 시 실제 명령 표시, 액션 실행 완료 후 큐 클리어 및 완료 이벤트 전송.
- README/ARCHITECTURE/STABILITY_GUIDE 업데이트: 최신 구조와 안정성 가이드 반영.

## 주요 기능

<img src="https://drive.google.com/uc?export=view&id=1Qnb_rdSzjfSR34o4lZB5nDCCTuwD7lLJ" width="700" height="500"/>
<img src="https://drive.google.com/uc?export=view&id=1BpN9SVQiEnxi0R67NFzQceRkhgQyogic" width="700" height="500"/><br>
<img src="https://drive.google.com/uc?export=view&id=1KYN5wO_lE8lBgyrldAtMpKReJYUYnwTO" width="700" height="500"/><br>
<img src="https://drive.google.com/uc?export=view&id=1sADJQZCmOatGiHyeop1pa0dipg_Zs5SP" width="700" height="500"/><br>

- **계획 관리**: 로컬 Ollama 추론 모델을 선택하여 실행 가능한 할 일 계획을 생성하고 새로운 Plan Queue 패널에서 항목 관리 (실행/완료/취소/지속)
- **Bash 스크립트 실행 수정**: 다중 라인 bash 구문(if/then/else/fi)이 단일 명령어로 병합되어 동일한 터미널 세션에서 실행되어 구문 오류 방지

### 🤖 AI 기반 코드 어시스턴스
- **멀티모델 AI 지원**:
  - **Gemini 2.5 Pro Flash**: Google의 고급 LLM으로 지능형 코드 생성 및 분석
  - **Ollama 통합**: 오프라인 AI 처리를 위한 로컬 Ollama 서버 통합
    - **gpt-oss:120b-cloud**: 120B 파라미터 모델로 고급 추론 및 코드 생성
    - **gemma3:27b**: 27B 파라미터 모델로 128K 토큰 제한의 코드 생성 및 분석
    - **llama3.1:8b**: 8B 파라미터 모델로 일반적인 작업에 최적화
    - **codellama:7b**: 7B 파라미터 모델로 코드 생성 및 분석에 특화
  - **동적 모델 선택**: 설정에서 클라우드와 로컬 AI 모델 간 전환 가능
- **스마트 컨텍스트 관리**:
  - **지능형 파일 필터링**: `src/` 디렉토리 파일을 자동으로 포함하고 키워드 기반으로 다른 파일 필터링
  - **컨텍스트 히스토리 관리**: 대화 전반에 걸친 컨텍스트 변경사항 추적 및 관리
    - 메시지별 컨텍스트 업데이트 추적 (파일, 선택, 커서, 터미널, 에러)
    - 컨텍스트 크기 실시간 모니터링 (문자 수, 토큰 수)
    - 한계에 도달 시 자동 압축
    - 컨텍스트 스냅샷을 위한 체크포인트 관리
  - **자동 요약**: 컨텍스트 윈도우 초과를 방지하기 위한 긴 대화 자동 요약
    - LLM 기반 포괄적인 요약 (10개 섹션 구조)
    - 토큰 사용량이 95% 초과 시 자동 트리거
    - VS Code globalState에 영구 요약 저장
    - continuation prompt를 통한 원활한 세션 재개
  - **파일 변경 추적**: 모든 파일 수정사항을 완전한 이력으로 추적
    - 모든 파일 작업(생성, 수정, 삭제) 자동 추적
    - 변경 전후 상태를 포함한 완전한 변경 이력
    - 추가/삭제/수정된 라인을 보여주는 diff 뷰
    - 이전 변경 시점으로 복원 가능
    - VS Code globalState에 영구 저장
  - **프레임워크 인식 컨텍스트**: 프로젝트 타입을 자동 감지하고 관련 설정 파일 포함
    - Node.js: `package.json`, `tsconfig.json`, 빌드 설정
    - Java/Spring: `pom.xml`, `build.gradle`, 애플리케이션 속성
    - Python Django/Flask/FastAPI: `manage.py`, `requirements.txt`, `main.py`
    - 기타 프레임워크 지원
- **듀얼 모드 인터페이스**:
  - **CODE 탭**: 코드 생성, 수정, 프로젝트 작업에 특화
  - **ASK 탭**: 일반 Q&A 및 실시간 정보 질의
- **맥락 인식 응답**: 프로젝트 구조와 기존 코드를 분석하여 관련성 높은 제안 제공
- **자연어 처리**: 복잡한 요청도 자연어로 이해
- **로컬 AI 처리**: Ollama 통합으로 완전한 오프라인 기능 제공

### 🚀 **NEW in v4.10.0+ - 완전한 매니저 기반 아키텍처**

#### **9개 핵심 매니저 시스템**

1. **Action Manager** - LLM 응답을 실행 가능한 액션으로 변환
   - 7가지 액션 타입: CODE_GENERATION, FILE_OPERATION, TERMINAL_COMMAND, ANALYSIS, VERIFICATION, SEARCH, REFACTOR
   - 의존성 체크를 통한 스마트 검증
   - 순환 의존성 자동 감지
   - 권한 제어 및 위험한 명령어 차단

2. **Execution Manager** - 프로세스 생명주기 관리
   - 동기/비동기 명령어 실행
   - 프로세스 모니터링 (PID 추적)
   - 10가지 에러 타입 자동 감지
   - 장기 실행 프로세스 지원
   - Grace period 종료 (SIGTERM → SIGKILL)

3. **Terminal Manager** - 터미널 세션 관리
   - 멀티 터미널 세션 관리
   - 명령어 히스토리 추적 (1000개 엔트리)
   - 가장 많이 사용된 명령어 통계
   - 세션 재사용 및 자동 생성

4. **Task Manager** - 비동기 작업 큐 관리
   - 우선순위 기반 스케줄링
   - Exponential Backoff 재시도
   - 작업 이벤트 시스템
   - 최대 동시 실행 제어

5. **Error Manager** - 에러 분석 및 관리
   - 에러 파싱 및 분류
   - 스택 트레이스 분석
   - 에러 히스토리 관리
   - 수정 제안 생성

6. **Context Manager** - LLM 컨텍스트 수집
   - 파일/에디터/터미널 컨텍스트 수집
   - 토큰 추정 및 제한 관리
   - 관련 파일 자동 탐색
   - Import/Export 분석

7. **State/Session Manager** - 상태 및 세션 관리
   - 전역 상태 관리
   - 프로젝트별 세션 관리
   - 사용자 설정 관리
   - 통계 추적

8. **Project Manager** - 프로젝트 구조 분석
   - 프로젝트 타입 자동 감지
   - 설정 파일 파싱
   - 파일 인덱싱 (Tree-sitter 통합)
   - 빌드 명령어 추출

9. **Model Manager** - LLM 모델 관리
   - 모델 등록 및 선택
   - API 키 관리
   - 모델 사용량 추적
   - 기능별 모델 추천

#### **스마트 액션 추출**
- **코드 블록 인식**: ` ```language:path/to/file ... ``` ` 패턴 자동 감지
- **명령어 추출**: bash/shell 코드 블록 및 실행 요청 인식
- **파일 작업 감지**: 생성/삭제/이름변경/이동 작업 식별
- **신뢰도 점수**: 85-95% 신뢰도로 액션 추출
- **검증 시스템**: 필수 필드 체크, 경로 검증, 위험한 명령어 차단

#### **에러 감지 및 복구**
- **10가지 에러 타입 지원**: PORT_CONFLICT, COMMAND_NOT_FOUND, PERMISSION_DENIED, SYNTAX_ERROR, RUNTIME_ERROR, NETWORK_ERROR, FILE_NOT_FOUND, OUT_OF_MEMORY, TIMEOUT, UNKNOWN
- **포트 충돌 감지**: EADDRINUSE 자동 감지 및 해결 방안 제시
- **스택 트레이스 파싱**: 에러 메시지에서 파일/라인/컬럼 추출
- **자동 수정 제안**: 일반적인 에러에 대한 지능형 수정 권장사항
- **에러 히스토리**: 에러 패턴 추적 및 분석

#### **통합 레이어**
- **ManagerAdapter**: 기존 코드와 완벽한 통합
- **플래그 기반 제어**: `useNewManagerSystem` 플래그로 on/off
- **안전한 폴백**: 에러 발생 시 기존 시스템으로 자동 전환
- **병렬 실행**: 새 액션 시스템 + 기존 UI 프로세서 동시 실행

### 🚀 **NEW in v4.9.3 - Tree-sitter 코드 파싱 및 프레임워크 추상화**

#### **Tree-sitter 통합**
- **코드 구조 파싱**: 프로젝트 파일에서 코드 정의(클래스, 함수, 인터페이스) 자동 추출
- **토큰 최적화**: 전체 파일 내용 대신 코드 구조만 LLM에 전송 (70-80% 토큰 절감)
- **다중 언어 지원**: TypeScript, JavaScript, Python, Java 등 WASM 파서를 통한 지원
- **스마트 타임아웃**: 파싱 차단 방지를 위한 3초 타임아웃
- **온프레미스 지원**: 모든 WASM 파일 번들링, 외부 의존성 불필요

#### **프레임워크 추상화 레이어**
- **통합 아키텍처**: OS, LLM, 프레임워크 감지를 위한 깔끔한 추상화 레이어
- **프레임워크 감지**: TypeScript, Spring Boot 등 프레임워크 자동 감지
- **OS별 처리**: Darwin(macOS), Windows, Linux 어댑터로 터미널/파일 작업 처리
- **LLM 어댑터**: 플러그인 방식의 LLM 어댑터(GPT, Gemini, Ollama)와 모델별 프롬프트
- **빌드 도구 인식**: 프레임워크별 명령어(npm, maven, gradle) 자동 감지

#### **향상된 코드 컨텍스트**
- **정의만 포함**: LLM은 구현 세부사항 없이 클래스/함수 시그니처만 수신
- **빠른 응답**: 토큰 사용량 감소로 더 빠른 LLM 응답
- **더 나은 이해**: 구조화된 코드 정의로 LLM의 프로젝트 아키텍처 이해 향상
- **자동 통합**: CODE 탭에서 코드 관련 질의 시 자동으로 작동

### 🚀 **NEW in v4.6.0 - Plan Queue 관리 및 Bash 스크립트 실행 수정**

#### **Plan Queue 관리**
- **계획 모델 선택**: 계획 생성을 위해 로컬 Ollama 설치에서 특화된 추론 모델 선택
- **Plan Queue 패널**: 실행/완료/취소/지속 기능으로 실행 가능한 할 일 항목을 관리하는 새로운 웹뷰 패널
- **구조화된 계획 생성**: 추론 LLM을 사용하여 사용자 쿼리를 체계적이고 실행 가능한 계획 항목으로 변환
- **계획 항목 관리**: 상태 추적 및 실행을 통한 각 계획 항목의 개별 제어

#### **Bash 스크립트 실행 수정**
- **다중 라인 스크립트 병합**: 복잡한 bash 구문(if/then/else/fi)이 자동으로 단일 명령어로 병합
- **단일 세션 실행**: heredoc/here-string 구문을 사용하여 동일한 터미널 세션에서 스크립트 실행
- **구문 오류 방지**: 라인별 실행으로 인한 "unexpected end of file" 및 "unexpected token" 오류 제거
- **명령어 정규화**: 멱등성, OS별 셸 명령어를 위한 개선된 명령어 전처리

### 🚀 **NEW in v4.5.0 - 명령어 자동 실행 및 개별 Callout 실행 상태 표시**

#### **명령어 자동 실행 기능**
- **자동 실행 토글**: 설정에서 bash/powershell/cmd 명령어 자동 실행을 활성화/비활성화 가능
- **스마트 실행 제어**: LLM 응답의 명령어를 자동으로 감지하고 설정에 따라 실행
- **실시간 상태 표시**: 자동 실행 시 "Executing commands..." 상태를 실시간으로 표시
- **수동 실행 지원**: 자동 실행 비활성화 시 수동으로 Run 버튼을 클릭하여 실행

#### **개별 Callout 실행 상태 표시**
- **개별 실행 애니메이션**: 각 shell script callout 박스마다 독립적인 "Executing..." 애니메이션 표시
- **실시간 피드백**: Run 버튼 클릭 시 해당 callout 박스에만 executing 상태 표시
- **자동 실행 시 전체 표시**: 자동 명령어 실행 시 모든 callout 박스에 executing 상태 표시
- **시각적 구분**: Auto Correcting과 Run 버튼 실행 상태를 명확히 구분하여 표시

#### **설정 시스템 개선**
- **설정 등록 완료**: `aidevIde.autoExecuteCommands` 설정이 package.json에 정식 등록
- **Global 설정 지원**: 사용자 전역 설정으로 저장되어 모든 워크스페이스에서 일관된 동작
- **실시간 설정 반영**: 설정 변경 시 즉시 적용되는 동적 설정 시스템

### 🚀 **NEW in v4.3 - OUTPUT 로그 제어 및 bash 명령어 실행 개선**

#### **OUTPUT 로그 제어 기능**
- **완전한 로그 제어**: VS Code의 OUTPUT 패널에 표시되는 모든 로그를 활성화/비활성화 가능
- **터미널 로그 최적화**: OUTPUT 로그 비활성화 시 터미널 로그 확인이 더욱 편리해짐
- **실시간 설정 변경**: 설정에서 즉시 적용되는 로그 제어 기능
- **메모리 최적화**: 비활성화 시 로그 엔트리 정리로 메모리 사용량 감소

#### **bash 명령어 실행 개선**
- **새로운 터미널 생성**: bash callout의 "Run" 버튼 클릭 시 새로운 VS Code 터미널에서 명령어 실행
- **순차적 명령어 실행**: 여러 명령어를 500ms 간격으로 안전하게 실행
- **향상된 디버깅**: 명령어 실행 과정을 상세히 추적할 수 있는 로그 시스템
- **터미널 준비 시간**: 터미널이 완전히 준비된 후 명령어 실행으로 안정성 향상

#### **자동 오류 수정 설정**
- **사용자 정의 재시도 횟수**: 1-10회 범위에서 자동 오류 수정 횟수 설정 가능
- **실시간 설정 반영**: 설정 변경 시 즉시 적용되는 오류 수정 횟수 조정
- **상태 표시**: 현재 설정된 오류 수정 횟수를 UI에서 확인 가능

### 🚀 **NEW in v4.1 - 향상된 설정 UI 및 구성 관리**

#### **개선된 Ollama 구성**
- **로컬 Ollama 섹션**: 로컬 머신 Ollama 구성을 위한 전용 섹션
- **원격 서버 섹션**: 원격 Ollama 서버 구성을 위한 새로운 섹션
- **서버 타입 토글**: 로컬과 원격 서버 타입 간 쉬운 전환
- **유연한 모델 구성**:
  - 로컬: Ollama 서버에서 자동 모델 감지
  - 원격: 수동 모델명 입력 (예: `gemma3:27b`)
- **향상된 사용자 경험**: 더 깔끔하고 직관적인 설정 인터페이스

#### **간소화된 인터페이스**
- **터미널 데몬 제거**: 불필요한 터미널 데몬 구성 제거
- **더 나은 구성**: 로컬과 원격 구성의 명확한 분리
- **일관된 스타일링**: 모든 설정 섹션에 걸친 통일된 디자인 언어

### 🚀 **NEW in v4.0 - 혁신적인 터미널 자동 오류 수정 시스템**

#### **실시간 터미널 모니터링 및 오류 감지**
- **지속적인 터미널 감시**: VS Code의 터미널 API를 사용하여 모든 터미널 출력을 실시간으로 모니터링
- **지능형 오류 패턴 인식**: 다양한 기술 스택에서 50개 이상의 오류 패턴을 감지
- **맥락 인식 오류 분석**: 명령어 히스토리와 프로젝트 구조를 포함한 오류 맥락 분석
- **다중 언어 지원**: 다양한 프로그래밍 언어와 빌드 도구의 오류 처리

#### **LLM 기반 오류 수정**
- **AI 기반 오류 분석**: 로컬 또는 클라우드 LLM을 사용하여 오류 패턴을 분석하고 수정 제안
- **지능형 명령어 생성**: 오류 맥락과 모범 사례를 기반으로 수정된 명령어 생성
- **맥락 학습**: 프로젝트 타입, 의존성, 환경을 고려하여 정확한 수정 제공
- **다중 수정 전략**: 복잡한 오류에 대한 다양한 수정 접근 방식 제공

#### **스마트 자동 재시도 시스템**
- **자동 명령어 재시도**: 지능형 재시도 로직으로 수정된 명령어를 자동 실행
- **재시도 제한 관리**: 무한 루프를 방지하는 설정 가능한 재시도 제한 (기본값: 3회)
- **쿨다운 기간**: 빠른 재시도 시도를 방지하는 스마트 쿨다운 기간 구현
- **성공/실패 추적**: 재시도 성공률을 추적하고 이전 시도에서 학습

#### **포괄적인 오류 패턴 지원**
- **Maven/Java 생태계**:
  - 빌드 실패 (`BUILD FAILURE`, `MojoExecutionException`)
  - 컴파일 오류 (`No compiler is provided`, `COMPILATION ERROR`)
  - JAVA_HOME 설정 문제
  - Spring Boot 버전 충돌 및 시작 실패
  - JAR 파일 접근 문제 및 버전 호환성 문제
- **Node.js/npm 생태계**:
  - 패키지 설치 실패 (`npm error code`, `ENOTEMPTY`)
  - 의존성 충돌 및 esbuild 오류
  - 모듈 해결 문제 (`ERR_MODULE_NOT_FOUND`)
  - Vite 설정 및 시작 문제
- **Python 생태계**:
  - 임포트 오류 및 가상 환경 문제
  - 패키지 충돌 및 의존성 해결
  - Python 버전 호환성 문제
- **Docker 및 컨테이너화**:
  - 컨테이너 빌드 실패 및 이미지 풀 오류
  - 네트워크 연결 문제
  - 포트 충돌 및 리소스 할당 문제
- **Git 및 버전 관리**:
  - 병합 충돌 및 인증 실패
  - 브랜치 관리 문제
  - 저장소 접근 및 권한 문제

#### **고급 터미널 통합**
- **VS Code 터미널 API 통합**: VS Code의 내장 터미널과 원활하게 작동
- **크로스 플랫폼 지원**: Windows, macOS, Linux에서 작동
- **터미널 세션 관리**: 여러 터미널 세션과 명령어 히스토리 처리
- **실시간 출력 처리**: 터미널 출력이 생성되는 대로 처리

#### **터미널 감시 및 모니터링 기능**
- **지속적인 백그라운드 모니터링**: 모든 터미널 활동을 모니터링하기 위해 백그라운드에서 실행
- **명령어 실행 추적**: 명령어 실행 상태와 출력을 추적
- **오류 감지 파이프라인**: 즉시 응답하는 실시간 오류 감지
- **사용자 알림 시스템**:
  - 오류 감지에 대한 실시간 알림
  - 수정 시도에 대한 진행 상황 업데이트
  - 재시도 작업에 대한 성공/실패 피드백
- **터미널 출력 분석**:
  - 오류 패턴을 위한 터미널 출력 파싱
  - 관련 오류 정보 추출
  - 명령어 맥락 및 히스토리 유지
- **스마트 개입**:
  - 실제 오류가 감지될 때만 개입
  - 사용자 워크플로우를 존중하고 정상 작업을 방해하지 않음
  - 자동 수정에 대한 선택적 수동 오버라이드 제공

### 🔧 **NEW in v4.0 - 고급 DIFF 처리**
- **DIFF 콜아웃 지원**: AI 응답의 DIFF 형식 코드 블록을 자동으로 처리
- **스마트 파일 수정**: 기존 파일에 데이터 손실 없이 지능적으로 변경사항 적용
- **맥락 인식 경로 해결**: 프로젝트 구조에 상대적으로 파일 경로를 자동으로 해결
- **기존 콘텐츠 보존**: 다른 파일 콘텐츠를 보존하면서 지정된 섹션만 수정
- **배치 DIFF 처리**: 단일 응답에서 여러 DIFF 작업 처리

### 📁 고급 파일 관리
- **스마트 파일 선택**: @ 버튼으로 특정 파일을 선택해 맥락에 포함
  - **CODE 탭**: 맥락 인식 코드 생성 및 수정을 위한 전체 파일 작업 기능
  - **ASK 탭**: 맥락 인식 질의를 위한 파일 선택 (읽기 전용, 파일 작업 없음)
- **지속적 파일 컨텍스트**: 선택한 파일이 여러 대화에서 유지됨
- **다중 파일 작업**: 여러 파일을 동시에 생성, 수정, 삭제 지원
- **프로젝트 루트 설정**: 정확한 파일 작업을 위한 루트 경로 설정 가능
- **자동 파일 업데이트**: AI 제안에 따라 파일 자동 생성/수정 옵션 제공
- **파일 태그 관리**: 개별 제거 및 전체 삭제 기능이 있는 시각적 파일 태그

### 🖼️ 시각적 코드 분석
- **이미지 지원**: 코드 분석 및 디버깅을 위한 이미지 업로드 가능
- **드래그&드롭 인터페이스**: 클립보드 붙여넣기로 이미지 첨부 가능
- **시각적 맥락**: AI가 스크린샷, 다이어그램, 코드 이미지를 분석


### 🔢 토큰 관리 시스템
- **입력 토큰 계산**: Gemini와 Ollama 모델 모두에 대한 자동 토큰 카운팅
- **모델별 제한**: 
  - Gemini 2.5 Flash: 1,000,000 입력 토큰, 500,000 출력 토큰
  - Gemma3:27b: 128,000 입력/출력 토큰
  - DeepSeek R1:70B: 200,000 입력/출력 토큰
  - CodeLlama 7B: 8,192 입력/출력 토큰
- **토큰 제한 경고**: 입력 토큰이 모델 제한을 초과할 때 자동 감지 및 사용자 경고
- **사용량 모니터링**: 실시간 토큰 사용량 로깅 및 백분율 추적

### ⚙️ 포괄적 설정
- **멀티모델 AI 설정**:
  - **AI 모델 선택**: Gemini 2.5 Pro Flash와 Ollama 중 선택
  - **Ollama 모델 선택**: 특정 Ollama 모델 선택 (Gemma3:27b, DeepSeek R1:70B, CodeLlama 7B)
  - **Ollama 서버 설정**: Ollama API URL 및 엔드포인트 선택 설정
    - 로컬 Ollama: `http://localhost:11434` + `/api/generate`
    - 외부 서버: `https://your-server.com` + `/api/chat`
    - Vessl AI 클러스터: `https://model-service-gateway-xxx.eu.h100-cluster.vessl.ai` + `/api/chat`
  - **동적 설정**: 선택된 모델에 따라 관련 설정 자동 활성화/비활성화
- **API 키 관리**: API 키를 안전하게 저장
  - Gemini API 키 설정
  - **Banya 라이센스 관리**:
    - AES-256-CBC 암호화로 라이센스 시리얼 저장
    - Firebase Firestore 검증 시스템
    - 저장된 라이센스 읽기 전용 표시
    - 라이센스 삭제 및 재검증 기능
- **소스 경로 설정**: 코드 맥락 포함을 위한 경로 지정 가능
- **자동 업데이트 설정**: 자동 파일 작업 on/off 토글
- **프로젝트 루트 설정**: 유연한 프로젝트 디렉토리 지정

### 💻 개발 경험 향상
- **코드 블록 표시**: 언어 감지 및 하이라이트된 코드 블록
- **복사 버튼**: 원클릭 코드 복사 기능
- **파일 작업 추적**: 파일 생성, 수정, 삭제에 대한 실시간 피드백
- **Diff 보기**: 원본과 AI 제안 코드의 나란히 비교
- **에러 처리**: 포괄적 에러 리포팅 및 사용자 피드백

### 🔒 보안 & 개인정보
- **API 키 안전 저장**: 민감한 API 키를 VS Code SecretStorage에 저장
- **암호화된 라이센스 저장**: Banya 라이센스 시리얼을 AES-256-CBC로 암호화
- **라이센스 보호**: CODE 및 ASK 탭은 유효한 Banya 라이센스가 필요
- **로컬 처리**: 핵심 기능은 인터넷 없이도 동작
- **개인정보 우선**: 외부 전송 없이 로컬 코드 분석

### 🎨 현대적 UI
- **VS Code 통합**: 네이티브 테마 및 스타일 적용
- **반응형 디자인**: 다양한 화면 크기와 테마에 적응
- **직관적 네비게이션**: CODE/ASK 모드 간 손쉬운 전환
- **로딩 인디케이터**: AI 처리 중 시각적 피드백
- **메시지 히스토리**: 명확한 대화 흐름과 기록
- **다국어 지원**: 7개 언어 완전 지원 (한국어, 영어, 일본어, 독일어, 스페인어, 프랑스어, 중국어)
- **라이센스 상태 표시**: 라이센스 검증 상태 및 읽기 전용 라이센스 필드 시각적 표시

### 🚀 성능 기능
- **요청 중단**: AI 요청 취소 가능
- **맥락 최적화**: 최적의 성능을 위한 스마트 맥락 길이 관리
- **파일 타입 필터링**: 바이너리/비코드 파일 자동 제외
- **메모리 관리**: 대용량 코드베이스 효율적 처리
- **네트워크 안정성**: 로컬 네트워크 연결을 위한 Node.js HTTP 모듈 사용
- **웹뷰 안전성**: disposed 웹뷰 에러 방지를 위한 보호된 메시지 처리

### 🧪 변경 사항 (2025/10/17)

#### 버전 3.2.0 - 향상된 컨텍스트 및 파일 처리
- **스마트 컨텍스트 관리**:
  - **지능형 파일 필터링**: `src/` 디렉토리 파일을 자동으로 포함하고 사용자 쿼리에서 추출한 키워드 기반으로 다른 파일 필터링
  - **프레임워크 인식 컨텍스트**: 프로젝트 타입을 자동 감지하고 관련 설정 파일 포함
    - Node.js: `package.json`, `tsconfig.json`, 빌드 설정
    - Java/Spring: `pom.xml`, `build.gradle`, 애플리케이션 속성
    - Python Django/Flask/FastAPI: `manage.py`, `requirements.txt`, `main.py`
    - .NET: `*.csproj`, `appsettings.json`
    - Go: `go.mod`, `go.sum`
    - Rust: `Cargo.toml`, `Cargo.lock`
    - PHP: `composer.json`
    - Ruby: `Gemfile`
- **향상된 파일 처리**:
  - **Callout 정리**: AI 응답에서 파일 경로의 callout 잔여물 (`*`, `**`, 백틱, 따옴표) 자동 제거
  - **경로 검증**: 위험한 작업을 방지하고 시스템 디렉토리 접근을 차단하는 파일 경로 검증
  - **긴 응답 처리**: 메모리 문제를 방지하기 위해 매우 긴 AI 응답을 청크 단위로 처리
  - **개선된 파싱**: 파일 작업을 위한 더 나은 정규식 패턴과 폴백 메커니즘
- **Bash 명령어 실행**:
  - **주석 필터링**: bash 명령어에서 주석 줄 (`#`) 자동 필터링
  - **인라인 주석 제거**: 따옴표 내용을 보존하면서 명령줄에서 인라인 주석 제거
  - **실행 버튼**: 채팅 응답의 bash callout에 실행 버튼 추가 (CODE 및 ASK 탭)
- **오류 처리 및 복구**:
  - **우아한 성능 저하**: 실패한 작업에 대한 폴백 처리
  - **더 나은 오류 메시지**: 파일 작업에 대한 더 설명적인 오류 메시지
  - **메모리 최적화**: 대용량 응답의 청크 처리

#### 버전 3.1.0 - 설정 및 Spring 지원 업데이트
- **Spring 프로젝트 자동 감지**: Spring Boot 프로젝트 자동 감지 및 최적화
  - Maven/Gradle 빌드 파일 우선순위 (pom.xml, build.gradle, build.gradle.kts)
  - Spring 특화 파일 패턴 및 디렉토리 구조 인식
  - Spring 관련 키워드 추출 강화 (controller, service, repository, entity 등)
- **Ollama 클라우드 모델 인증**: gpt-oss-120b:cloud 모델 인증 지원
  - 클라우드 모델 선택 시 자동 인증 섹션 표시
  - 설정 패널에 통합된 ollama auth 기능
- **설정 패널 개선**: 모델 선택 및 표시 문제 해결
  - AI 모델 선택 지속성 개선 (Gemini/Ollama)
  - Ollama 하위 모델 표시 및 선택 수정
  - 원클릭 프로젝트 root 설정 및 제거
- **라이브러리 제외 강화**: 포괄적인 라이브러리 디렉토리 필터링
  - 프레임워크별 라이브러리 경로 (node_modules, target, build, vendor 등)
  - 빌드 아티팩트 및 의존성 제외로 검색 성능 향상
  - 실제 프로젝트 코드에 대한 더 나은 컨텍스트 관련성

#### 버전 3.0.0 - 주요 업데이트 (2025/10/04)
- **터미널 데몬 통합**:
  - 비대화형/장시간 dev 명령을 Go 기반 terminal-daemon으로 실행(Unix 소켓, 정확한 종료 코드, 실시간 로그)
  - 로그는 `CODEPILOT Terminal Capture` Output 채널로 스트리밍
  - 진짜 대화형 명령만 단일 재사용 `aidev-ide Terminal`을 사용
- **출력 정제**: PTY ANSI 제어 시퀀스 제거로 Output 렌더링 개선
- **에러 모니터링 강화**: npm "Missing script:", "Exit status X", "Process exited (code X)" 등 탐지 확장, 챗으로 자동 전달 및 LLM 수정 트리거
- **Node 컨텍스트 개선**: Node.js 프로젝트에서 `package.json`을 항상 프롬프트 최상단에 포함; 프론트엔드 스택은 `package.json`/`src/**`만 검색하고 `node_modules/` 제외; 검색 파일 리스트는 디버그로 기록
- **CWD 처리**: 명령 실행 CWD는 `aidevIde.projectRoot` 우선, 없으면 워크스페이스 루트 사용(실행마다 로깅)
- **챗 전송 큐 & 대기 UI**:
  - AI 응답 중 입력된 질문은 대기열에 쌓여 완료 후 순차 전송
  - 하단 대기 큐 바에 대기 항목 표시 및 개별 취소(×) 가능, 레이아웃 자동 보정
  - 진행 중 입력한 질문도 챗에 즉시 표시되어 맥락 유지
- **에러 우선 오케스트레이션**:
  - 파일/터미널 에러 발생 시 짧은 수정 프롬프트를 우선 전송
  - 진행 중 호출은 조용히 취소 후 에러 수정 우선 처리; 삭제 ENOENT는 큐 중단하지 않음
- **실행 큐 섹션 클릭 가능한 파일 목록**:
  - "🧩 실행 큐 적재" 섹션에 생성/수정/삭제 파일 전체 목록 표시
  - 생성/수정 파일은 절대 경로 링크로 표시, 클릭 시 에디터에서 즉시 열림
- **전체 프롬프트 로깅 & 타이밍**:
  - LLM 호출 전/후 타임스탬프 배너
  - 전체 시스템 프롬프트/사용자 파트 로깅(모델로 전송하지 않고 로컬 로그로만)
- **장시간 dev 명령 처리**:
  - `npm run dev`, `vite` 등은 장시간 명령으로 분류되어 데몬으로 라우팅, 실패로 오인하지 않도록 처리
  - npm 스크립트 사전 검증 제거(존재/대안은 LLM이 결정)

### 🔐 라이센스 보호 시스템
- **Banya 라이센스 검증**:
  - Firebase Firestore 기반 라이센스 검증 시스템
  - 하이픈 포함 16자리 시리얼 번호 형식
  - 클라우드 데이터베이스와의 실시간 라이센스 검증
- **암호화 저장**:
  - 라이센스 시리얼 번호를 AES-256-CBC로 암호화
  - VS Code SecretStorage에 안전하게 저장
  - SHA-256 키 해싱으로 자동 암호화/복호화
- **접근 제어**:
  - CODE 및 ASK 탭은 유효한 라이센스가 필요
  - 다국어 지원 오류 처리
  - 라이센스 상태 표시 및 읽기 전용 표시
- **라이센스 관리**:
  - 라이센스 시리얼 입력 및 검증
  - 라이센스 삭제 및 재검증
  - 라이센스 작업에 대한 시각적 피드백

### 📋 사용 예시
- **코드 생성**: "React 사용자 인증 컴포넌트 생성해줘"
- **코드 수정**: "이 함수에 에러 핸들링 추가해줘"
- **파일 작업**: "날짜 포맷 유틸리티 파일 생성해줘"
- **파일 선택**: @ 버튼으로 특정 파일을 선택하여 맥락에 포함
- **CODE 탭 작업**: "이 코드를 분석하고 리팩토링해줘" (전체 파일 작업)
- **ASK 탭 질의**: "이 코드의 성능을 분석해줘" (읽기 전용 분석)
- **토큰 관리**: 자동 토큰 사용량 모니터링 및 제한 경고

## 요구사항

- nvm 0.39.1
- node v21.7.1
- npm install

## 설치 및 설정

### 사전 요구사항
1. **Node.js 환경 설정**
   ```bash
   # nvm (Node Version Manager) 설치
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh | bash
   
   # Node.js v21.7.1 설치
   nvm install 21.7.1
   nvm use 21.7.1
   ```

2. **VS Code 확장 개발 도구**
   ```bash
   # VS Code 확장 생성기 설치
   npm install -g yo generator-code
   ```

### 개발 환경 설정
1. **저장소 클론 및 의존성 설치**
   ```bash
   git clone https://github.com/DAIOSFoundation/aidev-ide.git
   cd aidev-ide
   npm install
   ```

2. **확장 빌드**
   ```bash
   # 개발 빌드 (감시 모드)
   npm run watch
   
   # 프로덕션 빌드
   npm run package
   ```

3. **개발 모드에서 실행**
   ```bash
   # VS Code에서 F5를 눌러 확장 호스트 실행
   # 또는 명령 팔레트: "Developer: Reload Window"
   ```

### 설정
1. **AI 모델 설정**
   - VS Code 명령 팔레트 열기 (`Ctrl+Shift+P` / `Cmd+Shift+P`)
   - "aidev-ide: Open Settings Panel" 실행
   - **Gemini 사용 시**: Gemini API 키 입력 ([Google AI Studio](https://aistudio.google.com/app/apikey)에서 획득)
   - **Ollama 사용 시**: Ollama 설치 후 API URL 설정 (기본값: http://localhost:11434)

2. **Ollama 설정 (선택사항)**
   ```bash
   # Ollama 설치
   curl -fsSL https://ollama.ai/install.sh | sh
   
   # Ollama 서버 시작
   ollama serve
   
   # 모델 다운로드
   ollama pull gemma3:27b
   ollama pull deepseek-r1:70b
   ollama pull codellama:7b
   ```


### CLI 바이너리: PATH/alias 설정 (선택)
번들된 바이너리를 터미널에서 바로 실행하려면, 셸 프로필에 PATH 또는 alias를 추가하세요 (macOS zsh 예시).

1) PATH 추가 (개발 시 권장)

```bash
# ~/.zshrc
export PATH="$PATH:/Users/tony/Projects/aidev-ide/assets/ollama-blocker"
export PATH="$PATH:/Users/tony/Projects/aidev-ide/assets/terminal-daemon"
```

2) alias 정의

```bash
# ~/.zshrc
alias ollama-blocker-embedded="/Users/tony/Projects/aidev-ide/assets/ollama-blocker/ollama-blocker-embedded"
alias terminal-daemon="/Users/tony/Projects/aidev-ide/assets/terminal-daemon/terminal-daemon"
alias terminal-client="/Users/tony/Projects/aidev-ide/assets/terminal-daemon/terminal-client"
```

3) 시스템 전역 설치 (선택)

```bash
sudo cp /Users/tony/Projects/aidev-ide/assets/ollama-blocker/ollama-blocker-embedded /usr/local/bin/
sudo cp /Users/tony/Projects/aidev-ide/assets/terminal-daemon/terminal-daemon /usr/local/bin/
sudo cp /Users/tony/Projects/aidev-ide/assets/terminal-daemon/terminal-client /usr/local/bin/
sudo chmod +x /usr/local/bin/ollama-blocker-embedded /usr/local/bin/terminal-daemon /usr/local/bin/terminal-client
```

프로필 변경 후 적용:

```bash
source ~/.zshrc
```

## 테스트

### 단위 테스트
```bash
# 모든 테스트 실행
npm test

# 감시 모드에서 테스트 실행
npm run watch-tests

# 린팅 실행
npm run lint
```

### 수동 테스트
1. **확장 활성화**
   - VS Code 열기
   - 확장 뷰로 이동 (`Ctrl+Shift+X`)
   - 활동 표시줄에서 "aidev-ide" 찾기
   - CODE와 ASK 탭이 모두 보이는지 확인

2. **CODE 탭 테스트**
   ```bash
   # 코드 생성 테스트
   - CODE 탭 열기
   - 입력: "간단한 React 컴포넌트 생성해줘"
   - 코드 블록이 포함된 AI 응답 확인
   
   # 파일 작업 테스트
   - @ 버튼으로 파일 선택
   - 파일 수정 요청
   - 파일 생성/수정 확인
   ```

3. **ASK 탭 테스트**
   ```bash
   # 일반 Q&A 테스트
   - ASK 탭 열기
   - 질문: "TypeScript란 무엇인가요?"
   - 유익한 응답 확인
   
   ```

4. **설정 테스트**
   ```bash
   # API 키 관리 테스트
   - 설정 패널 열기
   - API 키 추가/업데이트
   - 안전한 저장 확인
   
   # 언어 전환 테스트
   - 언어 설정 변경
   - UI 즉시 업데이트 확인
   ```

### 통합 테스트
1. **파일 컨텍스트 테스트**
   - 여러 파일이 있는 테스트 프로젝트 생성
   - @ 버튼으로 특정 파일 선택
   - AI 응답에 컨텍스트가 포함되는지 확인

2. **이미지 분석 테스트**
   - 코드 스크린샷이나 다이어그램 업로드
   - 코드 분석 요청
   - AI가 시각적 내용을 이해하는지 확인

3. **다국어 테스트**
   - 지원되는 모든 언어 테스트
   - 적절한 현지화 확인
   - 언어 설정 지속성 테스트

### 성능 테스트
1. **대용량 코드베이스 테스트**
   - 100개 이상 파일이 있는 프로젝트로 테스트
   - 메모리 사용량 모니터링
   - 응답 시간 확인

2. **API 속도 제한 테스트**
   - 여러 빠른 요청 테스트
   - 적절한 에러 처리 확인
   - 중단 기능 확인

### 디버깅
```bash
# 디버그 로깅 활성화
# VS Code settings.json에 추가:
{
  "aidev-ide.debug": true
}

# 확장 로그 보기
# VS Code: 도움말 > 개발자 도구 토글 > 콘솔
```

## 알려진 이슈

알려진 이슈를 명시하면 중복 이슈 등록을 줄일 수 있습니다.

## 릴리즈 노트
릴리즈 노트는 [RELEASE.ko.md](RELEASE.ko.md)를 참조하세요.

### 최신 릴리즈
- **🚀 Version 4.9.0** (2025/11/05) - 명령어 실행 요약 개선 및 작업 큐 완료 상태 표시
  - **명령어 실행 요약 설명**: 각 명령어 실행 요약에 사용자 친화적 설명 phrase 자동 추가
  - **작업 큐 상태 자동 업데이트**: 터미널 명령 실행 시 작업 큐 항목의 상태가 자동으로 업데이트됨
  - **실시간 웹뷰 업데이트**: 작업 큐 상태 변경 시 즉시 웹뷰에 반영
  - **명령어 패턴 인식**: Maven, Gradle, npm, yarn, Git, Docker 등 다양한 명령어 패턴 자동 인식
- **🚀 Version 4.1.0** (2025/10/18) - 향상된 설정 UI 및 구성 관리
- **🚀 Version 4.0.0** (2025/10/18) - 혁신적인 AI 기반 개발 경험
  - **혁신적인 터미널 자동 오류 수정 시스템**: 50개 이상의 오류 패턴을 지원하는 실시간 오류 감지 및 LLM 기반 수정
  - **고급 DIFF 처리**: 스마트 파일 수정을 위한 DIFF 콜아웃 지원
  - **향상된 프로젝트 타입 감지**: LLM 기반 하이브리드 접근 방식으로 24개 이상의 프로젝트 타입 지원
  - **처리 단계 시각화**: 실시간 진행 상황 추적 및 디버그 콘솔 통합
  - **포괄적인 오류 패턴 지원**: Maven/Java, Node.js/npm, Python, Docker, Git 등 다양한 기술 스택
  - **스마트 재시도 관리**: 무한 루프 방지 및 지능형 쿨다운 기간
  - **사용자 알림 시스템**: 실시간 오류 감지 및 수정 시도 알림

- **Version 3.0.0** (2025/10/04)
  - 터미널 데몬 통합 및 명령 라우팅
  - 챗 전송 큐 및 대기 UI(개별 취소 포함)
  - 에러 우선 자동화, 실행 큐 파일 목록 클릭 열기
  - 전체 프롬프트 로깅 및 장시간 dev 명령 안정 처리

### 추가 정보
이 소스코드의 발전에 함께할 분을 찾고 있습니다. 문의: tony@banya.ai

[![GitHub Sponsors](https://img.shields.io/badge/GitHub%20Sponsors-%E2%9D%A4%EF%B8%8F-red?style=for-the-badge&logo=github)](https://github.com/sponsors/tonythefreedom)

[![Ko-fi](https://img.shields.io/badge/Ko--fi-%E2%98%95%EF%B8%8F-purple?style=for-the-badge&logo=ko-fi)](https://ko-fi.com/lizsong)

**즐겁게 사용하세요!** 