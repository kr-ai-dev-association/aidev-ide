# Ollama Blocker Integration

aidev-ide에 통합된 Ollama Blocker는 Ollama 프로세스를 자동으로 관리하고 Firebase 인증을 통해 제어할 수 있는 고급 기능입니다.

## 주요 기능

### 🔒 프로세스 제어
- **자동 차단**: Ollama 프로세스를 자동으로 감지하고 차단
- **스마트 필터링**: ollama-blocker 자체 프로세스는 제외하고 정확한 타겟팅
- **실시간 모니터링**: 지속적인 프로세스 감시 및 관리

### 🔐 Firebase 인증
- **시리얼 번호 인증**: Firestore에 저장된 시리얼 번호로 안전한 인증
- **자동 Ollama 시작**: 인증 성공 시 Ollama가 실행되지 않은 경우 자동 시작
- **보안 통신**: Firebase Firestore를 통한 안전한 인증 프로세스

### 🔄 자동 재시작
- **데몬 모니터링**: 메인 프로세스 종료 시 자동 재시작
- **외부 스크립트**: 독립적인 자동 재시작 메커니즘
- **안정성 보장**: 시스템 재부팅 후에도 자동 복구

## VSCode 통합

### 명령어 사용법

aidev-ide이 활성화된 상태에서 `Ctrl+Shift+P` (또는 `Cmd+Shift+P`)를 눌러 명령 팔레트를 열고 다음 명령어들을 사용할 수 있습니다:

#### 1. Ollama Blocker 시작
```
Ollama Blocker: Start Ollama Blocker
```
- Ollama 프로세스 차단 데몬을 시작합니다
- 설정에서 `codepilot.ollamaBlocker.enabled`가 `true`로 설정되어 있어야 합니다

#### 2. Ollama Blocker 중지
```
Ollama Blocker: Stop Ollama Blocker
```
- 실행 중인 Ollama Blocker 데몬을 중지합니다
- 자동 재시작 데몬도 함께 중지됩니다

#### 3. 인증 및 Ollama 시작
```
Ollama Blocker: Authenticate and Start Ollama
```
- 시리얼 번호를 입력하여 인증합니다
- 인증 성공 시 Ollama가 실행되지 않은 경우 자동으로 시작합니다

#### 4. 상태 확인
```
Ollama Blocker: Check Ollama Blocker Status
```
- 현재 Ollama Blocker의 상태를 확인합니다
- 실행 중인 프로세스 정보를 표시합니다

### 설정 옵션

VSCode 설정에서 다음 옵션들을 구성할 수 있습니다:

```json
{
  "codepilot.ollamaBlocker.enabled": true,
  "codepilot.ollamaBlocker.executablePath": "./ollama-blocker/ollama-blocker-embedded",
  "codepilot.ollamaBlocker.autoRestartPath": "./ollama-blocker/auto-restart.sh",
  "codepilot.ollamaBlocker.workingDirectory": "./ollama-blocker"
}
```

## 설치 및 설정

### 1. Ollama Blocker 활성화
VSCode 설정에서 `codepilot.ollamaBlocker.enabled`를 `true`로 설정합니다.

### 2. 실행 파일 경로 설정
- `executablePath`: Ollama Blocker 실행 파일 경로
- `autoRestartPath`: 자동 재시작 스크립트 경로
- `workingDirectory`: 작업 디렉토리

### 3. Firebase 설정
- Firestore에 시리얼 번호를 등록해야 합니다
- 기본 테스트 시리얼 번호: `TEST_SERIAL_123`, `DEMO_SERIAL_456`, `VALID_SERIAL_789`

## 사용 시나리오

### 시나리오 1: 개발 환경 보호
1. Ollama Blocker를 시작하여 Ollama 프로세스를 차단
2. 개발 작업 중 Ollama 사용이 필요한 경우
3. 인증 명령어로 시리얼 번호 입력
4. 인증 성공 시 Ollama 자동 시작 및 사용 가능

### 시나리오 2: 자동화된 프로세스 관리
1. Ollama Blocker를 시작하여 백그라운드에서 실행
2. 자동 재시작 기능으로 안정성 보장
3. 필요 시 VSCode 명령어로 제어

## 로그 및 디버깅

### 출력 채널
- VSCode의 "출력" 패널에서 "Ollama Blocker" 채널을 선택하여 로그를 확인할 수 있습니다
- 모든 명령어 실행과 프로세스 상태가 로그로 기록됩니다

### 일반적인 문제 해결

#### 1. 권한 문제
```bash
chmod +x ollama-blocker/ollama-blocker-embedded
chmod +x ollama-blocker/auto-restart.sh
```

#### 2. 실행 파일을 찾을 수 없는 경우
- 설정에서 `executablePath`가 올바른지 확인
- 파일이 존재하고 실행 권한이 있는지 확인

#### 3. Firebase 인증 실패
- Firestore에 시리얼 번호가 등록되어 있는지 확인
- 네트워크 연결 상태 확인

## 보안 고려사항

- 시리얼 번호는 안전하게 관리되어야 합니다
- Firebase 프로젝트의 보안 규칙을 적절히 설정하세요
- 프로덕션 환경에서는 강력한 시리얼 번호를 사용하세요

## 지원 및 문제 신고

문제가 발생하거나 기능 요청이 있는 경우 GitHub Issues를 통해 신고해주세요.
