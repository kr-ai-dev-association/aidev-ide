<p align="right">
  🇺🇸 <a href="README.md">View in English</a>
</p>

# aidev-ide README

VSCode 기반 코드 어시스턴트 플러그인 (LLM 및 LM 지원)

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

### 🚀 **NEW in v4.10.0 - 매니저 기반 아키텍처 & 스마트 액션 시스템**

#### **매니저 기반 아키텍처**
- **Action Manager**: LLM 응답에서 액션 자동 추출 및 검증
  - 7가지 액션 타입: CODE_GENERATION, FILE_OPERATION, TERMINAL_COMMAND, ANALYSIS, VERIFICATION, SEARCH, REFACTOR
  - 의존성 체크를 통한 스마트 검증
  - 순환 의존성 자동 감지
  - 권한 제어 및 위험한 명령어 차단
- **Execution Manager**: 에러 감지 기능을 갖춘 프로세스 생명주기 관리
  - 동기/비동기 명령어 실행
  - 프로세스 모니터링 (PID 추적)
  - 10가지 에러 타입 자동 감지 (포트 충돌, 권한 거부, 구문 오류 등)
  - 장기 실행 프로세스 지원 (개발 서버, 빌드 프로세스)
  - Grace period 종료 (SIGTERM → SIGKILL)
- **Terminal Manager**: 터미널 세션 생명주기 관리
  - 멀티 터미널 세션 관리
  - 명령어 히스토리 추적 (1000개 엔트리)
  - 가장 많이 사용된 명령어 통계
  - 세션 재사용 및 자동 생성

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

### 🌐 실시간 정보 서비스
- **날씨 정보**: 기상청 API 연동
  - 현재 날씨 및 예보
  - 7일 예측
  - 위치별 날씨 데이터
- **뉴스 업데이트**: NewsAPI 연동
  - 주제별 뉴스 검색
  - 실시간 뉴스 집계
  - 출처 및 타임스탬프 표시
- **주식 시장 데이터**: Alpha Vantage API 연동
  - 실시간 주가 및 변동
  - 주요 주식(AAPL, GOOGL, MSFT, TSLA, AMZN) 추적
  - 변동률 계산

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
- **API 키 관리**: 여러 외부 API 키를 안전하게 저장
  - Gemini API 키 설정
  - 날씨 API 키 설정
  - 뉴스 API 자격증명(Client ID & Secret)
  - 주식 API 키 관리
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
  - 로그는 `AIDEV-IDE Terminal Capture` Output 채널로 스트리밍
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
- **실시간 정보**: "서울 날씨 알려줘" 또는 "최신 IT 뉴스 보여줘"
- **주식 질의**: "현재 주요 주식 시세 알려줘"
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

3. **선택적 외부 API**
   - **날씨 API**: [기상청 API Hub](https://apihub.kma.go.kr/)에서 API 키 획득
   - **뉴스 API**: [네이버 개발자센터](https://developers.naver.com/)에서 Client ID & Secret 획득
   - **주식 API**: [Alpha Vantage](https://www.alphavantage.co/)에서 API 키 획득

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
   
   # 실시간 정보 테스트
   - 질문: "서울 날씨 알려줘"
   - 질문: "최신 IT 뉴스 보여줘"
   - 질문: "현재 주식 시세 알려줘"
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