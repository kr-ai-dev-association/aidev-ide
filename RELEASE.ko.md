# aidev-ide 릴리즈 노트

이 문서는 aidev-ide VSCode 확장의 완전한 릴리즈 히스토리를 포함합니다.

## 🚀 Version 4.9.5 (2025/11/26) - 버그 수정: 중복 파일 작업 및 Git 리포지토리 연결

<details>
<summary>버그 수정 및 개선</summary>

### 수정됨
- **중복 파일 작업**: ActionPlan 실행 중 파일이 여러 번 생성/수정되는 문제 수정
  - `isActionPlanExecuting` 플래그 추가로 중복 파일 작업 방지
  - ActionPlan 실행 경로에서 일반 LLM 응답 경로의 파일 작업 스킵
  - ActionExecutionEngine과 LlmResponseProcessor 간 충돌 방지
- **Git 리포지토리 연결**: 확장 자체의 Git 리포지토리가 표시되던 문제 수정
  - `getRepositoryInfo()`가 현재 워크스페이스 Git 정보만 확인하도록 수정
  - 워크스페이스에 Git이 없을 때 저장된 정보 사용하지 않음
  - Git 리포지토리가 없을 때 초기화 안내 메시지 표시

### 개선됨
- **Git 리포지토리 감지**: 현재 워크스페이스 Git 리포지토리 실시간 감지
- **파일 작업 안정성**: 계획 단계에서 중복 파일 생성/수정 제거
- **사용자 경험**: Git 리포지토리가 초기화되지 않았을 때 명확한 메시지 표시

### 기술적 개선
- `llmService.ts`: ActionPlan 실행 상태 추적을 위한 `isActionPlanExecuting` 플래그 추가
- `llmResponseProcessor.ts`: ActionPlan 실행 중 파일 작업 스킵
- `gitRepositoryService.ts`: 현재 워크스페이스 Git 정보만 사용, 저장된 정보로 폴백하지 않음
- `chatViewProvider.ts`: Git 리포지토리가 없을 때 초기화 안내 메시지 표시

</details>

## 🚀 Version 4.9.3 (2025/11/26) - Tree-sitter 통합 및 프레임워크 추상화

<details>
<summary>코드 파싱 시스템 및 아키텍처 리팩토링</summary>

### 추가
- **Tree-sitter 코드 파서 통합**: 토큰 효율적인 LLM 컨텍스트를 위한 자동 코드 구조 추출
  - 다중 언어 지원: WASM 파서를 통한 TypeScript, JavaScript, Python, Java 지원
  - 구현 세부사항 없이 정의만 추출 (클래스, 함수, 인터페이스)
  - LLM에 코드 구조만 전송하여 70-80% 토큰 절감
  - 블로킹 방지를 위한 3초 타임아웃
  - 온프레미스 지원: webpack으로 모든 WASM 파일 번들링
- **프레임워크 추상화 레이어**: OS, LLM, 프레임워크 관심사의 깔끔한 분리
  - TypeScript 및 Spring Boot 구현을 포함한 `IFrameworkAdapter` 인터페이스
  - 자동 프레임워크 감지를 위한 `FrameworkAdapterFactory`
  - 프레임워크별 명령어, 템플릿, 에러 처리
- **코드 파서 추상화**: 확장 가능한 파싱을 위한 `ICodeParserAdapter` 및 `TreeSitterAdapter`
  - `getProjectCodeSummary()`: 포맷된 프로젝트 구조 요약 생성
  - `parseFile()`: 개별 파일에서 정의 추출
  - `findDefinition()`: 프로젝트 전체에서 특정 클래스/함수 검색

### 개선
- **LLM 컨텍스트 효율성**: 전체 파일 내용 대신 코드 정의만 전송 (3초 타임아웃)
- **프레임워크 감지**: 향상된 정확도로 TypeScript, Spring Boot 프로젝트 자동 감지
- **빌드 명령어 생성**: 프레임워크 인식 빌드/개발/테스트 명령어 생성
- **에러 메시지**: 프레임워크별 에러 패턴 및 수정 제안

### 기술적 개선
- `webpack.config.js`: tree-sitter WASM 파일 번들링을 위한 `copy-webpack-plugin` 추가
- `llmService.ts`: CODE 탭 플로우에 타임아웃이 적용된 tree-sitter 파싱 통합
- `AbstractionIntegrationService.ts`: 모든 추상화 레이어에 대한 중앙집중식 접근
- `languageParser.ts`: 여러 프로그래밍 언어를 위한 동적 WASM 로딩
- `TreeSitterAdapter.ts`: 정의 추출을 위한 tree-sitter 쿼리 구현

### 이름 변경
- **TechStack → Framework**: 더 명확한 도메인 모델링을 위한 전면 이름 변경
  - `ITechStackAdapter` → `IFrameworkAdapter`
  - `TechStackAdapterFactory` → `FrameworkAdapterFactory`
  - `stackId` → `frameworkId`, `stackName` → `frameworkName`
  - 코드베이스 전체의 모든 참조 업데이트

</details>

## 🚀 Version 4.10.0 (2025/11/26) - ActionPlanner 및 ActionExecutionEngine 메인 플로우 통합

<details>
<summary>에이전트 루프 기반 실행 시스템 통합</summary>

### 추가
- **실행 의도 기반 ActionPlan 경로**: 실행(intent category `execution`) 의도가 감지되면 ActionPlannerService와 ActionExecutionEngine을 통한 단계별 실행 루프로 자동 라우팅
  - `LlmService.handleExecutionIntentWithActionPlan()` 메서드 추가
  - 사용자 요청을 ActionPlan으로 변환하여 단계별 실행 가능한 작업 목록 생성
  - 각 ActionStep을 PlanQueueService에 등록하여 UI 작업 큐와 실시간 동기화
- **실제 파일 작업 구현**: ActionExecutionEngine의 더미 구현을 실제 VS Code FS API 기반으로 교체
  - `executeCodeGeneration`: VS Code `workspace.fs.writeFile`을 사용한 실제 파일 생성/수정
  - `executeFileOperation`: 파일 삭제 및 디렉터리 자동 생성 지원
  - `executeTerminalCommand`: 기존 TerminalMonitorService와 통합된 명령 실행
  - `executeVerification`: 터미널 로그 기반 에러 패턴 검증

### 개선
- **에이전트 루프 완성**: 사용자 요청 → 의도 분석 → ActionPlan 생성 → 단계별 실행 → 검증의 완전한 에이전트 루프 구현
- **작업 큐 연동**: ActionPlan의 각 단계가 PlanQueueService에 등록되어 UI에서 실시간 진행 상황 확인 가능
- **파일 작업 안정성**: 실제 파일 시스템 API를 사용하여 더 안정적이고 예측 가능한 파일 작업 수행

### 기술적 개선
- `llmService.ts`: `handleExecutionIntentWithActionPlan()` 메서드 추가로 실행 의도를 ActionPlanner 경로로 라우팅
- `actionExecutionEngine.ts`: `executeCodeGeneration`, `executeFileOperation`에서 실제 VS Code FS API 사용
- `actionPlannerService.ts`: 생성된 ActionPlan을 PlanQueueService와 연동하여 UI에 표시
- 더미 setTimeout 구현 제거 및 실제 파일 시스템 작업으로 교체

</details>

## 🚀 Version 4.9.0 (2025/11/05) - 명령어 실행 요약 개선 및 작업 큐 완료 상태 표시

<details>
<summary>명령어 실행 요약 개선 및 작업 큐 완료 상태 표시</summary>

### 추가
- **명령어 실행 요약 설명**: 명령어 실행 요약에 각 명령어의 사용자 친화적 설명 phrase 추가
  - Maven/Gradle 빌드 명령어: "프로젝트를 패키징하여 실행 가능한 JAR 파일 생성", "프로젝트 소스 코드 컴파일" 등
  - npm/yarn 명령어: "프로젝트 빌드", "개발 서버 실행", "테스트 실행" 등
  - 설치 명령어: "npm 패키지 의존성 설치", "Python 패키지 설치", "Homebrew 패키지 설치" 등
  - 실행 명령어: "Java 애플리케이션 실행", "Node.js 스크립트 실행", "Python 스크립트 실행" 등
  - Git/Docker 명령어: "Git 저장소 복제", "Docker 이미지 빌드" 등
- **작업 큐 완료 상태 자동 업데이트**: 터미널 명령 실행 시 작업 큐 항목의 상태가 자동으로 업데이트됨
  - 명령 실행 시작: `pending` → `in_progress`
  - 명령 실행 완료: `in_progress` → `done` (성공) 또는 `failed` (실패)
  - 실시간 웹뷰 업데이트: 작업 큐 상태 변경 시 즉시 웹뷰에 반영

### 개선
- **명령어 설명 패턴 매칭**: 다양한 명령어 패턴을 인식하여 적절한 설명 자동 생성
- **작업 큐 통합**: TerminalManager와 PlanQueueService 간 통합으로 작업 큐 상태 관리 개선
- **사용자 경험 향상**: 명령어 실행 요약이 더 명확하고 이해하기 쉬워짐

### 기술적 개선
- `llmResponseProcessor.ts`: `describeCommand()` 함수 추가로 명령어 패턴 분석 및 설명 생성
- `terminalManager.ts`: `setPlanQueueService()` 함수 추가 및 `processQueue()`에서 작업 큐 상태 자동 업데이트
- `llmService.ts`: 작업 큐 생성 시 TerminalManager에 PlanQueueService 인스턴스 전달

</details>

## 🚀 Version 4.6.0 (2025/10/23) - 계획(Planning) & 플랜 큐

<details>
<summary>🧠 Planning 섹션, Plan 단계 요약, Plan Queue 패널</summary>

### 추가
- Settings에 Planning 섹션 추가: 로컬 Ollama reasoning 모델 드롭다운 표시, 모델 미존재 시 다운로드 안내
- Plan 단계: 생성된 계획을 자동으로 큐잉, Processing Steps의 plan 단계에 reasoning 모델명과 현재 작업 요약 표시
- Plan Queue 패널: 항목 목록/실행/완료/취소/비우기 및 지속화(globalState)

### 개선
- 내부 오류 처리 및 상태 메시지 가독성 개선

</details>

## 🚀 Version 4.5.0 (2025/10/21) - 명령어 자동 실행 및 개별 Callout 실행 상태 표시

<details>
<summary>🎯 명령어 자동 실행 기능 및 개별 Callout 실행 상태 표시</summary>

### 추가
- **명령어 자동 실행 토글**: 설정에서 bash/powershell/cmd 명령어 자동 실행을 활성화/비활성화 가능
- **개별 Callout 실행 상태 표시**: 각 shell script callout 박스마다 독립적인 "Executing..." 애니메이션 표시
- **자동 실행 시 전체 표시**: 자동 명령어 실행 시 모든 callout 박스에 executing 상태 표시
- **설정 등록 완료**: `aidevIde.autoExecuteCommands` 설정이 package.json에 정식 등록

### 개선
- **실시간 상태 표시**: 자동 실행 시 "Executing commands..." 상태를 실시간으로 표시
- **시각적 구분**: Auto Correcting과 Run 버튼 실행 상태를 명확히 구분하여 표시
- **Global 설정 지원**: 사용자 전역 설정으로 저장되어 모든 워크스페이스에서 일관된 동작
- **실시간 설정 반영**: 설정 변경 시 즉시 적용되는 동적 설정 시스템

### 수정
- **설정 저장 문제 해결**: "Unable to write to User Settings because aidevIde.autoExecuteCommands is not a registered configuration" 오류 해결
- **개별 Run 버튼 클릭 시**: 해당 callout 박스에만 executing 상태 표시
- **자동 실행 비활성화 시**: 사용자에게 수동 실행 안내 메시지 표시

</details>

## 🚀 Version 4.4.1 (2025/10/20) - 실행 명령 단계 & 안정성

<details>
<summary>🎯 실행 명령(executing) 단계, OS별 명령 재구성, 설정 유지</summary>

### 추가
- Executing Commands 단계: 초기 LLM 응답 후 bash/powershell 콜아웃을 감지하여 사용자 OS에 맞는 명령어만 재구성
- 엄격한 시스템 프롬프트: 단일 코드블록 강제, Windows(powershell) vs macOS/Linux(bash) 분리, 설명/혼합 금지

### 개선
- Processing Steps: 정적 HTML 중복 제거(React 단일 렌더링), 단계 순서에 executing 추가
- 자동 오류 수정: 설정에 On/Off 토글 추가, Off 시 최대 횟수 스피너 비활성화
- 자동 오류 수정 유지: 워크스페이스 설정 저장 및 시작 시 적용

### 수정
- 원격 Ollama 설정: 설정 패널 초기 로드시 저장값을 불러와 섹션 표시/비활성 상태 정확히 반영
- OS 정보: 시작 시 감지된 OS를 executing 단계 프롬프트에 활용

</details>

## 🚀 Version 4.3.0 (2025/10/19) - OUTPUT 로그 제어 및 bash 명령어 실행 개선

<details>
<summary>🎯 OUTPUT 로그 제어 및 bash 명령어 실행 개선</summary>

### **OUTPUT 로그 제어 기능**
- **완전한 로그 제어**: VS Code의 OUTPUT 패널에 표시되는 모든 로그를 활성화/비활성화 가능
- **터미널 로그 최적화**: OUTPUT 로그 비활성화 시 터미널 로그 확인이 더욱 편리해짐
- **실시간 설정 변경**: 설정에서 즉시 적용되는 로그 제어 기능
- **메모리 최적화**: 비활성화 시 로그 엔트리 정리로 메모리 사용량 감소

### **bash 명령어 실행 개선**
- **새로운 터미널 생성**: bash callout의 "Run" 버튼 클릭 시 새로운 VS Code 터미널에서 명령어 실행
- **순차적 명령어 실행**: 여러 명령어를 500ms 간격으로 안전하게 실행
- **향상된 디버깅**: 명령어 실행 과정을 상세히 추적할 수 있는 로그 시스템
- **터미널 준비 시간**: 터미널이 완전히 준비된 후 명령어 실행으로 안정성 향상

### **자동 오류 수정 설정**
- **사용자 정의 재시도 횟수**: 1-10회 범위에서 자동 오류 수정 횟수 설정 가능
- **실시간 설정 반영**: 설정 변경 시 즉시 적용되는 오류 수정 횟수 조정
- **상태 표시**: 현재 설정된 오류 수정 횟수를 UI에서 확인 가능

### **기술적 개선사항**
- **더미 채널 구현**: OUTPUT 로그 비활성화 시 빈 채널 반환으로 성능 최적화
- **설정 변경 감지**: VS Code 설정 변경 시 자동으로 TerminalManager에 반영
- **중복 코드 제거**: ChatViewProvider와 AskViewProvider의 중복된 executeBashCommands 케이스 정리
- **향상된 오류 처리**: bash 명령어 실행 시 더 강력한 오류 처리 및 사용자 피드백

</details>

## 🚀 Version 4.1.0 (2025/10/18) - 향상된 설정 UI 및 구성 관리

<details>
<summary>🎯 향상된 설정 UI 및 구성 관리</summary>

### **개선된 Ollama 구성**
- **로컬 Ollama 섹션**: 로컬 머신 Ollama 구성을 위한 전용 섹션
- **원격 서버 섹션**: 원격 Ollama 서버 구성을 위한 새로운 섹션
- **서버 타입 토글**: 로컬과 원격 서버 타입 간 쉬운 전환
- **유연한 모델 구성**:
  - 로컬: Ollama 서버에서 자동 모델 감지
  - 원격: 수동 모델명 입력 (예: `gemma3:27b`)
- **향상된 사용자 경험**: 더 깔끔하고 직관적인 설정 인터페이스

### **간소화된 인터페이스**
- **터미널 데몬 제거**: 불필요한 터미널 데몬 구성 제거
- **더 나은 구성**: 로컬과 원격 구성의 명확한 분리
- **일관된 스타일링**: 모든 설정 섹션에 걸친 통일된 디자인 언어

### **기술적 개선사항**
- **독립적 저장**: 로컬과 원격 설정을 위한 독립적인 구성 저장
- **스마트 UI 전환**: 서버 타입 선택에 따른 자동 섹션 가시성
- **향상된 이벤트 처리**: 더 나은 반응성을 위한 향상된 JavaScript 이벤트 리스너
- **더 나은 오류 처리**: 구성 변경에 대한 더 강력한 오류 처리

</details>

## 🚀 Version 4.0.0 (2025/10/18) - 혁신적인 AI 기반 개발 경험

<details>
<summary>🚀 혁신적인 터미널 자동 오류 수정 시스템</summary>

- **실시간 오류 감지**: 
  - 터미널 출력을 실시간으로 모니터링하여 명령어 실행 오류를 자동 감지
  - 50개 이상의 오류 패턴을 지원하는 다양한 기술 및 프레임워크
  - VS Code의 내장 터미널 API와 원활하게 통합
- **LLM 기반 오류 수정**: 
  - 오류 세부사항을 LLM에 자동으로 전송하여 수정 제안 요청
  - 지능형 오류 패턴 인식과 맥락 인식 수정 제공
  - 신뢰할 수 있는 명령어 수정을 위한 JSON 형식 응답 파싱
- **스마트 로직을 통한 자동 재시도**: 
  - 지능형 수정으로 실패한 명령어를 자동으로 재시도
  - 지능형 제한으로 무한 루프를 방지하는 스마트 재시도 관리
  - 중복 재시도 시도를 방지하는 쿨다운 기간
- **포괄적인 오류 패턴 인식**: 
  - **Maven/Java**: 빌드 실패, 컴파일 오류, JAVA_HOME 문제, 버전 충돌
  - **Node.js/npm**: 패키지 설치 실패, 의존성 충돌, esbuild 오류
  - **Python**: 임포트 오류, 가상 환경 문제, 패키지 충돌
  - **Docker**: 컨테이너 빌드 실패, 이미지 풀 오류, 네트워크 문제
  - **Git**: 병합 충돌, 인증 실패, 브랜치 문제
- **사용자 알림 시스템**: 
  - 오류 감지 및 수정 시도에 대한 실시간 알림
  - 오류 수정 프로세스에 대한 진행 상황 추적
  - 재시도 작업에 대한 성공/실패 피드백

</details>

<details>
<summary>🔧 고급 DIFF 처리</summary>

- **DIFF 콜아웃 지원**: 
  - AI 응답의 DIFF 형식 코드 블록을 자동으로 처리
  - 적절한 파싱 및 검증을 통한 표준 DIFF 형식 지원
- **스마트 파일 수정**: 
  - 데이터 손실 없이 기존 파일에 지능적으로 변경사항 적용
  - 지정된 변경사항만 적용하면서 기존 콘텐츠 보존
- **맥락 인식 경로 해결**: 
  - 프로젝트 구조에 상대적으로 파일 경로를 자동으로 해결
  - 절대 및 상대 경로 사양 모두 처리
- **배치 DIFF 처리**: 
  - 단일 응답에서 여러 DIFF 작업 처리
  - 복잡한 다중 파일 변경의 효율적인 처리

</details>

<details>
<summary>🎨 향상된 프로젝트 타입 감지</summary>

- **LLM 기반 감지**: 
  - 사용자 쿼리와 파일 분석에서 AI를 사용하여 프로젝트 타입 감지
  - 자연어 설명에서 지능형 프로젝트 타입 추론
- **하이브리드 감지**: 
  - 최대 정확도를 위해 파일 기반과 쿼리 기반 감지를 결합
  - 안정적인 프로젝트 타입 식별을 위한 폴백 메커니즘
- **확장된 프레임워크 지원**: 
  - **웹 프레임워크**: React, Vue, Angular, Next.js, Nuxt.js, Svelte
  - **백엔드 프레임워크**: Spring Boot, Django, Flask, FastAPI, Express.js
  - **모바일**: React Native, Flutter, iOS, Android
  - **데스크톱**: Electron, .NET, Java Swing
- **기본 파일 포함**: 
  - 각 프로젝트 타입에 대한 필수 파일을 자동으로 포함
  - 프레임워크별 파일 우선순위 및 포함

</details>

<details>
<summary>📊 처리 단계 시각화</summary>

- **실시간 단계 표시**: 
  - 애니메이션 인디케이터로 현재 처리 단계 표시
  - 시각적 피드백이 있는 동적 단계 진행
- **상세한 단계 정보**: 
  - 각 처리 단계에 대한 포괄적인 정보 표시
  - 맥락 인식 단계 설명 및 진행 상황 추적
- **디버그 콘솔 통합**: 
  - 콘솔에서 상세한 디버깅 정보 제공
  - 문제 해결 및 개발을 위한 향상된 로깅
- **토큰 사용량 표시**: 
  - 입력 토큰 수 및 사용 통계 표시
  - 실시간 토큰 소비 모니터링

</details>

## Version 3.2.0 (2025/10/17) - 향상된 컨텍스트 및 파일 처리

<details>
<summary>스마트 컨텍스트 관리 및 프레임워크 감지</summary>

- **지능형 파일 필터링**: 
  - 컨텍스트에 `src/` 디렉토리 파일을 자동으로 포함
  - 사용자 쿼리에서 추출한 키워드를 기반으로 다른 파일 필터링
  - 일반적인 불용어를 제거하고 관련 용어에 집중
- **프레임워크 인식 컨텍스트**: 프로젝트 타입 자동 감지 및 관련 설정 파일 포함:
  - **Node.js**: `package.json`, `package-lock.json`, `tsconfig.json`, 빌드 설정
  - **Java/Spring**: `pom.xml`, `build.gradle`, `application.properties`, `application.yml`
  - **Python Django**: `manage.py`, `requirements.txt`, `settings.py`, `urls.py`
  - **Python Flask**: `app.py`, `flask_app.py`, `requirements.txt`, `config.py`
  - **Python FastAPI**: `main.py`, `requirements.txt`, `pyproject.toml`
  - **.NET**: `*.csproj`, `*.sln`, `appsettings.json`
  - **Go**: `go.mod`, `go.sum`, `main.go`
  - **Rust**: `Cargo.toml`, `Cargo.lock`, `main.rs`
  - **PHP**: `composer.json`, `composer.lock`, `index.php`
  - **Ruby**: `Gemfile`, `Gemfile.lock`, `Rakefile`

</details>

<details>
<summary>향상된 파일 처리 및 경로 검증</summary>

- **Callout 정리**: 
  - AI 응답에서 파일 경로의 callout 잔여물 (`*`, `**`, 백틱, 따옴표) 자동 제거
  - 다양한 마크다운 포맷팅 문제 처리
  - 원치 않는 문자를 정리하면서 유효한 파일 경로 보존
- **경로 검증**: 
  - 위험한 작업을 방지하기 위한 파일 경로 검증
  - 시스템 디렉토리 (`/etc`, `/usr`, `/var` 등) 접근 차단
  - 디렉토리 순회 공격 (`../` 패턴) 방지
  - 파일명 및 경로 길이 제한 적용
- **긴 응답 처리**: 
  - 메모리 문제를 방지하기 위해 매우 긴 AI 응답을 청크 단위로 처리
  - 더 나은 처리를 위해 파일 작업별로 응답 분할
  - 청킹 중 코드 블록 무결성 유지
- **개선된 파싱**: 
  - 파일 작업을 위한 더 나은 정규식 패턴
  - 파싱 실패에 대한 폴백 메커니즘
  - 향상된 오류 처리 및 복구

</details>

<details>
<summary>Bash 명령어 실행 개선</summary>

- **주석 필터링**: 
  - bash 명령어에서 주석 줄 (`#`) 자동 필터링
  - bash callout에서 실행 가능한 명령어만 보존
- **인라인 주석 제거**: 
  - 명령줄에서 인라인 주석 제거
  - 따옴표 내용과 이스케이프 문자 보존
  - 주석이 있는 복잡한 명령 구조 처리
- **실행 버튼**: 
  - 채팅 응답의 bash callout에 실행 버튼 추가
  - CODE 및 ASK 탭 모두에서 사용 가능
  - 복사 버튼 옆에 배치되어 쉬운 접근
  - 명령 실행 중 시각적 피드백 제공

</details>

<details>
<summary>오류 처리 및 복구</summary>

- **우아한 성능 저하**: 
  - 실패한 작업에 대한 폴백 처리
  - 하나가 실패해도 다른 파일 처리 계속
  - 사용자에게 의미 있는 오류 메시지 제공
- **더 나은 오류 메시지**: 
  - 파일 작업에 대한 더 설명적인 오류 메시지
  - 무엇이 잘못되었는지와 이유에 대한 명확한 표시
  - 일반적인 문제 해결을 위한 제안
- **메모리 최적화**: 
  - 대용량 응답의 청크 처리
  - 처리 청크 간 메모리 정리
  - 긴 작업 중 메모리 누수 방지

</details>

## Version 3.1.0 (2025/10/15) - 설정 및 Spring 지원 업데이트

<details>
<summary>Spring 프로젝트 자동 감지 및 컨텍스트 강화</summary>

- **Spring Boot 프로젝트 감지**: 다음 기준으로 Spring Boot 프로젝트 자동 감지:
  - Spring Boot 의존성을 포함한 Maven 빌드 파일 (pom.xml)
  - Spring Boot 플러그인이 있는 Gradle 빌드 파일 (build.gradle, build.gradle.kts)
  - 애플리케이션 설정 파일 (application.properties, application.yml, application.yaml)
  - @SpringBootApplication 또는 @SpringBootTest 어노테이션이 있는 Java 파일
- **빌드 파일 우선순위**: Spring 프로젝트에서 pom.xml, build.gradle, build.gradle.kts를 컨텍스트에 우선 포함
- **키워드 추출 강화**: Spring 관련 키워드 추가 (controller, service, repository, entity, config, application)
- **Spring 파일 패턴**: Java 소스 파일, 설정 파일, Spring 특화 디렉토리에 최적화된 검색 패턴

</details>

<details>
<summary>Ollama 클라우드 모델 인증</summary>

- **gpt-oss-120b:cloud 지원**: 인증이 필요한 Ollama 클라우드 모델 지원 추가
- **자동 UI 표시**: 클라우드 모델 선택 시 인증 섹션이 자동으로 표시됨
- **통합 인증**: 설정 패널에 ollama auth 기능 통합
- **시리얼 번호 입력**: 인증 시리얼 번호 입력을 위한 사용자 친화적 인터페이스
- **상태 피드백**: 인증 시도에 대한 명확한 성공/실패 메시지

</details>

<details>
<summary>설정 패널 개선</summary>

- **모델 선택 수정**: AI 모델 선택 지속성 문제 해결 (Gemini/Ollama)
- **하위 모델 표시 수정**: Ollama 하위 모델 표시 및 선택 문제 해결
- **원클릭 프로젝트 root**: 프로젝트 root 설정 및 제거 기능 개선
- **에러 처리 강화**: 모든 설정 작업에 대한 더 나은 에러 메시지 및 상태 피드백
- **로깅 개선**: 설정 패널 문제 디버깅을 위한 상세 로깅 추가

</details>

<details>
<summary>라이브러리 제외 시스템 강화</summary>

- **포괄적 필터링**: 광범위한 라이브러리 디렉토리 제외 패턴 추가:
  - Node.js: node_modules, .npm, npm-cache
  - Java/Maven: .m2, target, build, .gradle, gradle
  - Python: __pycache__, .pytest_cache, venv, env, .venv, .env, site-packages, .pip
  - .NET: bin, obj, packages, .nuget
  - Go: vendor, pkg
  - Rust: target, Cargo.lock
  - PHP: vendor, composer
  - Ruby: vendor, bundle, .bundle
  - 일반: dist, out, build, .build, coverage, .coverage, logs, .logs, tmp, .tmp, temp, .temp, cache, .cache
  - IDE: .vscode, .idea, .eclipse, .settings, .project, .classpath
  - 버전 관리: .git, .svn, .hg, .bzr
  - OS: .DS_Store, Thumbs.db, .Spotlight-V100, .Trashes, .fseventsd, .TemporaryItems
- **성능 향상**: 빌드 아티팩트 및 의존성 제외로 파일 검색 속도 대폭 개선
- **더 나은 컨텍스트 관련성**: 실제 프로젝트 소스 코드만 LLM 컨텍스트에 포함

</details>

## Version 3.0.0 (2025/10/04) - 터미널 데몬, 전송 큐, 에러 우선 자동화

<details>
<summary>터미널 데몬 통합 & 명령 라우팅</summary>

- 비대화형/장시간 dev 명령을 위한 Go 기반 terminal-daemon 연동
- Unix 소켓 기반 순차 실행 및 정확한 종료 코드 수집
- VS Code Output 채널(`AIDEV-IDE Terminal Capture`)로 stdout/stderr 실시간 스트리밍
- 진짜 대화형 명령만 통합 터미널을 사용, `aidev-ide Terminal` 단일 재사용
- CWD는 설정의 `aidevIde.projectRoot` 우선, 없으면 워크스페이스 루트 사용

</details>

<details>
<summary>출력 정제 & 에러 모니터링</summary>

- ANSI/PTY 제어 시퀀스 제거로 깨끗한 로그 표시
- 에러 패턴 확대: `npm error`, `Missing script:`, `Exit status X`, `Process exited (code X)` 등
- 에러를 챗에 자동 전송하고 LLM 기반 자동 수정 프롬프트를 트리거(루프 방지 8초 쿨다운)

</details>

<details>
<summary>Node.js 컨텍스트 수집 개선</summary>

- Node.js 프로젝트에서 `package.json`을 항상 컨텍스트 최상단에 포함
- 프론트엔드 스택 탐지 시 `package.json`/`src/**` 제한 검색 및 `node_modules/` 제외
- 검색된 파일 리스트를 디버그 로그로 투명하게 출력

</details>

<details>
<summary>챗 전송 큐 & 대기 UI</summary>

- AI 응답 대기 중 질문을 대기열에 쌓고, 완료 후 순서대로 자동 전송
- 하단 대기 큐 바에 항목들이 순서대로 표시되며 각 항목은 x로 개별 취소 가능
- 진행 중에 입력한 질문은 즉시 챗에 보이고, 현재 응답 종료 후 전송됨
- 에러 프롬프트는 항상 대기열보다 우선 처리(“에러 우선 오케스트레이션” 참조)

</details>

<details>
<summary>에러 우선 오케스트레이션</summary>

- 파일/터미널 에러 발생 시 즉시 짧은 “수정” 프롬프트를 우선 전송
- 진행 중인 AI 호출은 조용히 취소(취소 메시지 노출 없음) 후 에러 수정 우선 처리
- 큐는 파일 작업 및 bash 명령을 순차 실행하며, 삭제 시 ENOENT는 큐를 중단하지 않음

</details>

<details>
<summary>실행 큐 섹션의 클릭 가능한 파일 리스트</summary>

- “🧩 실행 큐 적재” 섹션에 생성/수정/삭제 파일 전체 목록 표시
- 생성/수정 파일은 절대 경로 링크로 표시하며 클릭 시 에디터에서 즉시 열림
- 웹뷰 내부 링크 핸들러로 안전하게 로컬 파일 열기 지원

</details>

<details>
<summary>LLM 프롬프트 로깅 & 타이밍</summary>

- LLM 호출 전/후 배너와 타임스탬프 추가
- 전체 시스템 프롬프트와 사용자 파트 로깅(지연 원인 진단 용이)
- CodebaseContext 로그는 모델로 보내지 않으며, 디버깅에만 사용

</details>

<details>
<summary>장시간 dev 명령 처리</summary>

- `npm run dev`, `vite` 등을 장시간 명령으로 분류하여 데몬으로 라우팅, 실패로 오인하지 않음
- npm 스크립트 사전 검증 제거: 스크립트 존재/대안 여부는 LLM이 결정

</details>

---

## Version 2.5.9 (2025/09/15) - CodeLlama 7B 지원 추가

<details>
<summary>새로운 Ollama 모델 지원</summary>

- **CodeLlama 7B 통합**: Ollama를 통한 CodeLlama 7B 모델 지원 추가
- **코드 생성 최적화**: CodeLlama 7B는 코드 생성 및 분석 작업에 특화 설계
- **토큰 관리**: 8,192 입력/출력 토큰 제한과 자동 토큰 카운팅 및 경고
- **모델 선택**: 설정의 Ollama 모델 드롭다운에 CodeLlama 7B 추가
- **통합 인터페이스**: CODE 탭과 ASK 탭 모두에서 CodeLlama 7B 사용 가능

</details>

<details>
<summary>향상된 모델 관리</summary>

- **개선된 UI 구조**: "Ollama"를 메인 옵션으로 하는 간소화된 AI 모델 선택
- **특정 모델 선택**: Gemma3:27b, DeepSeek R1:70B, CodeLlama 7B 중 선택
- **자동 모델 매핑**: 백엔드에서 모델 선택을 올바른 AI 모델 타입으로 자동 매핑
- **마이그레이션 지원**: 레거시 설정을 새로운 모델 구조로 자동 변환

</details>

<details>
<summary>다국어 지원 업데이트</summary>

- **현지화 업데이트**: 모든 언어 파일 업데이트 (한국어, 영어, 일본어, 중국어, 독일어, 스페인어, 프랑스어)
- **일관된 용어**: 모든 언어에서 "Ollama" 용어 표준화
- **UI 텍스트 개선**: 더 깔끔하고 직관적인 모델 선택 인터페이스

</details>

<details>
<summary>패키지 릴리즈</summary>

- **VSIX 패키지**: [codepilot-2.5.9.vsix](release/codepilot-2.5.9.vsix) (32.46 MB)
- **설치 방법**: `code --install-extension codepilot-2.5.9.vsix` 또는 VS Code에서 VSIX 설치
- **릴리즈 구성**: 더 나은 프로젝트 구조를 위해 `release/` 디렉토리에 패키지 파일 정리

</details>

## Version 2.5.7 - Remote SSH 환경 파일 수정 문제 해결

<details>
<summary>Remote SSH 환경 지원 강화</summary>

- **Remote SSH 환경 파일 수정 문제 해결**: VSCode Remote SSH 환경에서 LLM 응답 후 소스코드 수정이 안 되는 문제 완전 해결
- **향상된 경로 처리**: Remote SSH 환경에서 워크스페이스 경로와 파일 경로를 정확히 해석하는 로직 개선
- **URI 스키마 감지**: Remote 환경(`vscode-remote://`)과 로컬 환경(`file://`)을 자동으로 구분하여 처리
- **경로 정규화**: `path.resolve()`를 사용하여 상대 경로와 절대 경로를 정확히 처리
- **워크스페이스 경계 검증**: 파일이 워크스페이스 내부/외부에 있는지 정확히 판단하여 적절한 URI 생성

</details>

<details>
<summary>상세한 디버그 로깅 시스템</summary>

- **경로 처리 과정 추적**: 워크스페이스 경로, 절대 경로, 정규화된 경로를 모두 로깅하여 문제 진단 가능
- **파일 작업 단계별 로깅**: 파일 생성/수정/삭제 과정의 각 단계를 상세히 기록
- **오류 상세 정보**: 오류 발생 시 name, message, code, stack 정보를 모두 로깅하여 문제 해결 지원
- **Remote SSH 디버그 태그**: `[Remote SSH Debug]` 태그로 Remote SSH 관련 로그를 쉽게 식별 가능

</details>

<details>
<summary>파일 시스템 접근성 검증</summary>

- **디렉토리 접근성 테스트**: 파일 작업 전 부모 디렉토리 접근 가능 여부를 미리 확인
- **Remote URI 처리**: Remote SSH 환경에서 올바른 URI 스키마를 유지하여 파일 시스템 접근 보장
- **권한 및 경로 오류 감지**: 다양한 파일 시스템 오류에 대한 구체적인 안내 메시지 제공
- **접근 불가능 경로 경고**: Remote 환경에서 접근할 수 없는 경로에 대한 사전 경고

</details>

<details>
<summary>향상된 오류 처리 및 사용자 안내</summary>

- **권한 오류**: `EACCES`, `EPERM` 등 권한 관련 오류에 대한 구체적 해결 방법 안내
- **파일 없음 오류**: `ENOENT` 오류에 대한 경로 확인 및 해결 방법 안내
- **디렉토리 오류**: `ENOTDIR` 오류에 대한 경로 구조 확인 안내
- **파일 존재 오류**: `EEXIST` 오류에 대한 파일 상태 확인 안내
- **Remote SSH 환경 특화 메시지**: Remote SSH 환경에서 발생할 수 있는 문제에 대한 맞춤형 해결 방법 제공

</details>

<details>
<summary>기술적 개선</summary>

- **경로 해석 로직 개선**: Remote SSH 환경에서 복잡한 경로 구조를 정확히 처리
- **파일 시스템 API 활용**: VSCode의 `vscode.workspace.fs` API를 최대한 활용하여 안정성 향상
- **오류 복구 메커니즘**: 파일 작업 실패 시 대안 경로로 자동 전환하는 폴백 시스템
- **성능 최적화**: 불필요한 파일 시스템 호출을 줄이고 효율적인 경로 처리

</details>

## Version 2.5.6 (2025/08/26) - 마크다운 파일 생성 수정

<details>
<summary>마크다운 파일 생성 수정</summary>

- **3단계 정규식 시스템**: 마크다운 파일 감지를 위한 강력한 3단계 정규식 시스템 구현
- **순차적 폴백 메커니즘**: 하나의 정규식 패턴이 실패하면 시스템이 자동으로 다음 패턴을 시도
- **향상된 패턴 매칭**: 
  - 1단계: 작업 요약 및 설명 섹션을 포함한 엄격한 패턴
  - 2단계: 기본 지시어만 고려하는 중간 패턴
  - 3단계: 모든 내용을 캡처하는 간단한 패턴
- **개선된 디버깅**: 정규식 매칭 과정을 추적하기 위한 포괄적인 로깅 추가
- **안정적인 파일 생성**: 요청 시 마크다운 파일이 일관되게 생성됨

</details>

<details>
<summary>기술적 개선</summary>

- **정규식 패턴 최적화**: 마크다운 파일 감지 패턴 단순화 및 개선
- **오류 처리**: 파일 생성 작업에 대한 더 나은 오류 처리
- **디버그 로깅**: 파일 생성 문제 해결을 위한 향상된 로깅 시스템
- **코드 안정성**: 파일 생성 시스템의 전반적인 안정성 개선

</details>

## Version 2.5.3 (2025/08/19) - 대화형 명령어 처리

<details>
<summary>대화형 명령어 처리</summary>

- **대화형 명령어 감지**: npm create, git clone, SSH, Docker 등 대화형 명령어 자동 감지
- **자동 응답 시스템**: 일반적인 대화형 시나리오에 대한 기본 응답 제공
- **명령어 시퀀스 실행**: 적절한 타이밍으로 여러 명령어를 순차적으로 처리
- **기본 응답 지원**: 
  - npm create 명령어: 기본 응답 'y' (yes)
  - git clone: Enter 키만 누름
  - SSH 연결: 호스트 키 확인을 위한 'yes'
  - Docker 대화형 명령어: 컨테이너에서 빠져나오기 위한 'exit'
- **명령어 시퀀스 관리**: 명령어 시퀀스의 상태 추적 및 중단 기능
- **향상된 사용자 경험**: 대화형 명령어 실행에 대한 실시간 알림

</details>

<details>
<summary>기술적 개선</summary>

- **새로 추가된 함수들**:
  - `isInteractiveCommand()`: 대화형 명령어 감지
  - `getDefaultResponseForCommand()`: 기본 응답 제공
  - `handleInteractiveCommand()`: 대화형 명령어 처리
  - `executeCommandSequence()`: 명령어 시퀀스 실행
  - `getCommandSequenceStatus()`: 실행 상태 추적
  - `stopCommandSequence()`: 명령어 시퀀스 중단
- **향상된 터미널 관리**: 타이밍과 응답 처리가 개선된 명령어 실행
- **더 나은 오류 처리**: 대화형 명령어에 대한 포괄적인 오류 보고

</details>

## Version 2.5.2 (2025/08/19) - 멀티모델 AI 지원 및 Ollama 통합

<details>
<summary>멀티모델 AI 지원</summary>

- **Ollama 통합**: 로컬 Ollama Gemma3:27b 모델 지원 추가
- **동적 모델 선택**: 설정에서 Gemini와 Ollama 중 선택 가능한 AI 모델 드롭다운
- **모델별 설정**: 선택된 모델에 따라 관련 설정 자동 활성화/비활성화
- **통합 LLM 서비스**: Gemini와 Ollama API 호출을 처리하는 중앙화된 서비스
- **오프라인 기능**: 로컬 Ollama 서버로 완전한 오프라인 AI 처리

</details>

<details>
<summary>향상된 설정 인터페이스</summary>

- **AI 모델 설정**: AI 모델 선택 드롭다운 (Gemini 2.5 Pro Flash / Gemma3:27b)
- **Ollama API URL 설정**: 로컬 Ollama 서버 주소 설정 입력 필드
- **Banya 라이센스 관리**: 라이센스 시리얼 입력 및 검증 시스템
- **동적 UI**: 모델 선택에 따라 설정 섹션 자동 활성화/비활성화
- **기본 설정**: Gemini 2.5 Pro Flash를 기본 모델로 설정

</details>

<details>
<summary>자동 Bash 명령어 실행</summary>

- **Bash 명령어 감지**: LLM 응답에서 ```bash 코드 블록을 자동으로 감지
- **터미널 통합**: 감지된 명령어를 VSCode 통합 터미널에서 실행
- **다중 명령어 지원**: 단일 응답에서 여러 명령어를 순차적으로 처리
- **대화형 명령어 처리**: npm create, git clone, SSH 연결 등 대화형 명령어 자동 응답
- **사용자 알림**: 실행된 명령어에 대한 실시간 피드백 (성공/오류 상태)
- **aidev-ide 터미널**: aidev-ide 명령어 실행을 위한 전용 터미널 인스턴스
- **자동 터미널 활성화**: 명령어 실행 시 터미널 자동 표시
- **오류 처리**: 명령어 실행 실패에 대한 포괄적인 오류 보고
- **시스템 프롬프트 개선**: bash 명령어 형식 예시를 포함한 AI 지시사항 업데이트

</details>

<details>
<summary>기술적 개선</summary>

- **네트워크 안정성**: 로컬 연결을 위해 fetch를 Node.js HTTP 모듈로 교체
- **웹뷰 안전성**: disposed 웹뷰 에러 방지를 위한 safePostMessage 함수 추가
- **에러 처리**: 네트워크 연결 문제에 대한 향상된 에러 처리
- **타입 안전성**: TypeScript 타입 정의 및 에러 검사 개선
- **성능**: 메시지 처리 및 웹뷰 통신 최적화
- **터미널 관리**: bash 명령어 추출 및 실행 기능을 갖춘 새로운 터미널 관리자

</details>

<details>
<summary>Ollama 설정 가이드</summary>

- **서버 설치**: curl -fsSL https://ollama.ai/install.sh | sh
- **모델 다운로드**: ollama pull gemma3:27b
- **서버 시작**: ollama serve
- **API URL**: 기본값 http://localhost:11434
- **네트워크 설정**: 로컬 네트워크 주소 지원

</details>

## Version 2.5.0 (2025/08/19) - Ollama 파일 작업 수정 및 정규식 지원 강화

<details>
<summary>Ollama 파일 작업 수정</summary>

- **파일 경로 파싱 수정**: Ollama 응답에서 파일명에 `**` 접미사가 포함되는 문제 해결
- **정규식 패턴 강화**: Ollama 응답의 마크다운 헤더(`##`) 처리 기능 추가
- **파일명 정리**: 파일 경로에서 `**` 접미사 자동 제거로 정확한 매칭 보장
- **컨텍스트 파일 매칭**: 수정된 파일을 컨텍스트 파일 목록에서 찾지 못하는 문제 해결
- **디버깅 로그**: 정규식 매치 그룹에 대한 상세 로깅으로 문제 해결 개선

</details>

<details>
<summary>기술적 개선</summary>

- **정규식 패턴 강화**: `(?:##\s*)?(새 파일|수정 파일):\s+([^\r\n]+?)(?:\r?\n\s*\r?\n```[^\n]*\r?\n([\s\S]*?)\r?\n```)/g` 패턴으로 업데이트
- **파일 경로 처리**: `llmSpecifiedPath.replace(/\*\*$/, '')`로 파일명 정리 기능 추가
- **PromptType Import 수정**: `geminiService`에서 `llmService`로 import 경로 수정
- **중복 타입 정의 제거**: `ollamaService.ts`에서 중복된 `PromptType` 정의 제거
- **시스템 프롬프트 강화**: 파일 생성 지시사항이 포함된 Ollama 시스템 프롬프트 개선

</details>

<details>
<summary>Ollama 통합 개선</summary>

- **외부 서버 지원**: 외부 Ollama 서버(Vessl AI 등) 지원 강화
- **SSL 인증서 처리**: 외부 HTTPS 서버를 위한 SSL 인증서 우회 기능 추가
- **API 엔드포인트 유연성**: `/api/generate`(로컬) 및 `/api/chat`(외부) 엔드포인트 지원
- **사용자 설정 가능한 엔드포인트**: 설정에서 엔드포인트 선택을 위한 드롭다운 추가
- **응답 형식 처리**: 다양한 응답 형식의 자동 감지 및 처리

</details>

<details>
<summary>파일 작업 기능 강화</summary>

- **정확한 파일 매칭**: 파일 수정을 위한 컨텍스트 파일 목록 매칭 수정
- **다중 파일 지원**: 단일 응답에서 여러 파일 작업 처리 개선
- **에러 처리**: 파일 작업 실패에 대한 향상된 에러 메시지
- **성공 인디케이터**: 파일 생성, 수정, 삭제에 대한 명확한 성공/에러 인디케이터
- **디버그 정보**: 파일 작업 디버깅을 위한 포괄적인 로깅 추가

</details>

## Version 2.4.1 (2025/08/18) - LLM 프롬프트 구조 개선 및 코드 생성/수정 요청 방식 고도화

<details>
<summary>LLM 프롬프트 및 코드 생성/수정 요청 방식 개선</summary>

- LLM(대형 언어 모델)에게 코드 생성/수정/삭제 요청 시, 엄격한 출력 형식과 규칙을 시스템 프롬프트로 명시하도록 개선
- 전체 파일 코드, 파일별 지시어(수정 파일/새 파일/삭제 파일), 작업 요약, 상세 설명을 반드시 포함하도록 프롬프트 구조 강화
- 실제 코드 컨텍스트, 사용자 요청, 프로젝트 구조 정보가 함께 전달되어 AI의 작업 신뢰성 및 자동화 수준 향상
- 작업 요약(생성/수정/삭제 파일 목록)과 작업 수행 설명(동작 원리, 주요 함수/클래스, 개선점, 테스트 방법 등) 출력이 필수화됨
- 프롬프트 예시 및 규칙이 시스템 프롬프트에 명확히 포함되어, 일관된 응답 형식 보장
- geminiService.ts의 프롬프트 생성 로직을 직접 수정 및 고도화함(사용자 커스텀 반영)

</details>

## Version 2.4.0 (2025/06/26) - AI 응답 구조 및 UX 개선

<details>
<summary>AI 응답 구조 개선</summary>

- 코드 생성/수정/삭제 작업 시 명확한 파일 작업 지시어와 전체 코드 출력 필수화
- 작업 요약 및 상세 설명 출력 강화
- 에러 처리 및 사용자 피드백 개선

</details>

<details>
<summary>사용자 경험 개선</summary>

- 채팅 인터페이스 스크롤 문제 수정, 즉각적인 응답 가시성 확보
- 메시지 표시 순서 최적화: AI 응답 → 파일 작업 → 작업 요약 → 작업 설명
- 이모지 인디케이터 추가로 시각적 구분 강화:
  - 📁 파일 업데이트 결과
  - 📋 AI 작업 요약
  - 💡 작업 실행 설명
- 생각 중 애니메이션 타이밍 및 가시성 개선

</details>

<details>
<summary>코드 생성 기능 강화</summary>

- "수정 파일:", "새 파일:", "삭제 파일:" 등 파일 작업 지시어 필수화
- 부분 변경이 아닌 전체 파일 코드 출력
- 모든 작업에 대해 자동 작업 요약 생성
- 상세한 작업 설명 필수화

</details>

<details>
<summary>파일 작업 개선</summary>

- 순차 처리: 생각 중 애니메이션 제거 → 파일 작업 → 결과 표시
- 파일 작업 피드백 강화(성공/에러 인디케이터)
- 파일 생성, 수정, 삭제 시 에러 처리 개선
- 코드 수정 diff 보기 개선

</details>

<details>
<summary>API 키 관리</summary>

- Gemini API 키 설정을 라이선스에서 설정 메뉴로 이동
- 설정 패널에서 API 키 중앙 관리
- VS Code SecretStorage로 보안 강화
- API 키 유효성 검사 및 에러 처리 개선

</details>

<details>
<summary>실시간 정보 기능 강화</summary>

- 7일 예보 등 날씨 정보 강화
- 주제별 뉴스 검색 개선
- 주식 정보 표시 개선(변동률 등)
- 자연어 기반 정보 질의 강화

</details>

<details>
<summary>다국어 지원</summary>

- 포괄적 국제화(i18n) 지원 추가
- 지원 언어: 한국어, 영어, 중국어, 스페인어, 독일어, 프랑스어, 일본어
- 실시간 언어 전환 및 UI 즉시 반영
- 설정 인터페이스 현지화
- 언어 선호도 영구 저장
- 페이지 새로고침 없이 실시간 언어 변경

</details>

<details>
<summary>기술적 개선</summary>

- 웹뷰 메시지 처리 및 표시 문제 수정
- 코드 블록 렌더링 및 하이라이트 개선
- 맥락 관리 개선으로 AI 응답 품질 향상
- 에러 복구 및 사용자 알림 시스템 개선
- 언어 데이터 로딩 및 캐싱 최적화
- 언어 변경 시 UI 반응성 향상

</details>

## Version 2.3b (2025/6/15) - 실시간 정보 기능 추가

<details>
<summary>ASK 탭 실시간 정보 기능 추가</summary>

- 날씨 정보 조회(기상청 API 연동)
- 뉴스 정보 조회(NewsAPI 연동)
- 주식 정보 조회(Alpha Vantage API 연동)
- 실시간 정보에 대한 자연어 질의 지원

</details>

<details>
<summary>설정</summary>

- 외부 API 키 설정 옵션 추가(날씨, 뉴스, 주식)
- API 키를 VS Code 설정에 안전하게 관리
- 설정 페이지에 새로운 API 키 관리 섹션 추가
- 각 API 키별 개별 저장 버튼
- API 키 설정 상태 실시간 표시

</details>

<details>
<summary>사용 예시</summary>

- "서울 날씨" → 서울의 현재 날씨 정보
- "뉴스" → 최신 뉴스 헤드라인
- "주식" → 주요 주식 정보(AAPL, GOOGL, MSFT, TSLA, AMZN)

</details>

## Version 2.2b (2025/06/10) - API 호환성 수정

<details>
<summary>AI</summary>

- Gemini API의 미지원 webSearch 도구 관련 오류 수정
- API 호환성 문제로 웹 검색 기능 임시 제거
- ASK 탭이 웹 검색 없이도 동작하도록 개선
- API 호출 에러 처리 개선

</details>

## Version 2.1b (2025/06/5) - 파일 선택 & 컨텍스트

<details>
<summary>CHAT 패널</summary>

- CODE 탭에서 @ 버튼으로 파일 선택 기능 추가
- 선택한 파일을 흰색 테두리의 태그로 표시
- 선택한 파일이 여러 메시지에서 지속적으로 유지
- 파일 선택 영역과 입력 영역 사이에 구분선 추가
- 선택 파일 태그의 수직 중앙 정렬
- 파일 선택기가 설정된 프로젝트 루트 경로에서 시작
- 다중 파일 선택 지원

</details>

<details>
<summary>AI</summary>

- @ 버튼으로 선택한 파일을 LLM에 추가 컨텍스트로 포함
- CODE/ASK 탭 모두에서 파일 컨텍스트 동작
- 파일 작업 추적을 위한 맥락 처리 강화

</details>

## Version 2.0.0 - UI 전면 개편

<details>
<summary>주요 변경점</summary>

- 현대적 UI로 전면 개편
- CODE/ASK 탭이 있는 전용 뷰 컨테이너 추가
- 지속적 파일 선택 기능 구현
- 복사 기능이 있는 코드 블록 표시 강화
- 실시간 정보 기능 추가

</details>

## Version 1.4.0 - 이미지 지원 & 파일 선택기

<details>
<summary>기능</summary>

- 코드 분석을 위한 이미지 지원 추가
- 파일 선택기 기능 구현
- 맥락 관리 강화

</details>

## Version 1.3.0 - 채팅 인터페이스 개선

<details>
<summary>개선 사항</summary>

- 코드 블록 표시 개선
- 파일 작업 추적 기능 추가
- 에러 처리 개선

</details>

## Version 1.2.0 - 프로젝트 범위 기능

<details>
<summary>기능</summary>

- 프로젝트 범위 코드 감시 추가
- 자동 디버그 기능 구현
- 다양한 UI 이슈 수정

</details>

## Version 1.1.0 - LLM 지원 강화

<details>
<summary>강화 사항</summary>

- 커스텀 LLM 모델 지원 추가
- 코드 생성 정확도 향상
- 자연어 처리 강화

</details>

## Version 1.0.0 - 최초 릴리즈

<details>
<summary>초기 기능</summary>

aidev-ide의 최초 릴리즈

</details>

---

## 지원

추가 정보나 지원이 필요하시면 문의해 주세요: tony@banya.ai

[![GitHub Sponsors](https://img.shields.io/badge/GitHub%20Sponsors-%E2%9D%A4%EF%B8%8F-red?style=for-the-badge&logo=github)](https://github.com/sponsors/tonythefreedom)

[![Ko-fi](https://img.shields.io/badge/Ko--fi-%E2%98%95%EF%B8%8F-purple?style=for-the-badge&logo=ko-fi)](https://ko-fi.com/lizsong)
