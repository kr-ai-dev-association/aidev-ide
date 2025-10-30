# Dev Log

> 변경 지시와 수행 결과를 순차적으로 기록합니다.

---

## 2025-10-30

### 항목 #0001
- 지시: devlog.md 에 수정 요청사항을 계속 기록하고, 새로운 지시사항을 수행 및 결과를 지속 기록
- 수행: devlog.md 생성, 로깅 템플릿 정의, 기록 워크플로우 시작
- 결과: 준비 완료. 이후 각 지시 수신 시 항목을 순차 추가 예정
- 비고: 시간 표기는 로컬 날짜 기준(세부 시간 필요 시 UTC 표기 병행)
 - 커밋: N/A (초기 설정)

---

템플릿
- 지시:
- 수행:
- 결과:
- 비고:

커밋 지향 템플릿
- 커밋 해시:
- 커밋 메시지:
- 범위(scope):
- 작성자(author):
- 커밋 시간(date):
- 관련 이슈/PR:
- 변경 파일:
  - path: 설명
- 요약(변경 이유/영향):
- 비고:

---

## 2025-10-31

### 항목 #0028 (로그 분석)
- 지시: 제공된 런타임 로그 분석 및 주요 이슈 파악
- 수행: 로그 분석 결과 정리
- 결과:
  - **ollama-blocker 설치 실패**: 서비스 계정 키 파일을 찾을 수 없어 설치 실패
  - **PowerShell 실행 오류**: 
    - EncodedCommand 디코딩 검증 실패 (cmdletIntegrityCheck=false)
    - 디코딩된 스크립트에서 PowerShell cmdlet을 찾을 수 없음 (Test-Path, Split-Path, Join-Path, Write-Output 등)
    - CLIXML 형식 오류 출력 감지
    - 제한된 언어 모드(Constrained Language Mode) 환경에서 실행되는 것으로 추정
  - **LLM 오류 수정 시도**:
    - 1차 시도: PowerShell -Command 블록으로 재구성 (실패 - 여전히 cmdlet 미인식)
    - 2차 시도: CMD 방식으로 전환 제안 (cmd /c를 사용한 Windows 네이티브 명령어 실행)
    - 3차 시도: 간단한 mvn 명령어로 단순화 (작업 디렉터리 이동 + mvn clean package)
  - **새로운 오류 패턴 발견**: "PowerShell cmdlet not found in constrained language sessions" 패턴 식별
- 비고: PowerShell 제한 환경에서는 네이티브 shell(cmd.exe) 사용을 권장하는 것으로 확인됨. 오류 수정 로직의 폴백 전략 강화 필요.

### 항목 #0021
- 커밋 해시: 7c3e35614133e9e14f5261eb5bc5229eeca98d0a
- 커밋 메시지: fix(settings): Improve AI model dropdown loading and remove CodePilot references - Remove UPDATED date from AI model settings title - Fix AI model dropdown to load saved model correctly (prioritize currentAiModel) - Replace all CodePilot references with AIDEV-IDE across all files and locales
- 범위(scope): settings
- 작성자(author): Administrator
- 커밋 시간(date): 2025-10-31 07:02:17 +0900
- 관련 이슈/PR:
- 변경 파일:
  - dist/extension.js
  - dist/extension.js.map
  - dist/webview/ask.js
  - dist/webview/ask.js.map
  - dist/webview/chat.js
  - dist/webview/chat.js.map
  - dist/webview/codeCopy.js
  - dist/webview/codeCopy.js.map
  - dist/webview/settings.js
  - dist/webview/settings.js.map
  - src/ai/codebaseContextService.ts
  - src/webview/panelManager.ts
  - webview/ask.js
  - webview/chat.js
  - webview/codeCopy.js
  - webview/locales/lang_de.json
  - webview/locales/lang_en.json
  - webview/locales/lang_es.json
  - webview/locales/lang_fr.json
  - webview/locales/lang_ja.json
  - webview/locales/lang_zh.json
  - webview/settings.html
  - webview/settings.js
- 요약(변경 이유/영향): AI 모델 드롭다운 로딩 개선, CodePilot 참조 제거 및 AIDEV-IDE로 전면 교체, 모든 로케일 파일 업데이트.
- 비고:

### 항목 #0022
- 커밋 해시: 8d3c587d6be0d75015e4d04173fd5b94198ec00a
- 커밋 메시지: refactor(settings): CodePilot Root 설정 UI 및 관련 코드 정리 - VS Code 다이얼로그 대신 사용
- 범위(scope): settings
- 작성자(author): Administrator
- 커밋 시간(date): 2025-10-31 06:53:51 +0900
- 관련 이슈/PR:
- 변경 파일:
  - dist/extension.js
  - dist/extension.js.map
  - dist/webview/settings.js
  - dist/webview/settings.js.map
  - src/webview/panelManager.ts
  - webview/settings.html
  - webview/settings.js
- 요약(변경 이유/영향): Root 설정 UI 리팩토링 및 관련 코드 정리, VS Code 다이얼로그 통합.
- 비고:

### 항목 #0023
- 커밋 해시: d26cebb6cec4b5e5d96a5ece93918752b9df5df1
- 커밋 메시지: feat(terminal): 이전 PowerShell 실행 오류 LLM 피드백 추가
- 범위(scope): terminal
- 작성자(author): Administrator
- 커밋 시간(date): 2025-10-31 06:50:07 +0900
- 관련 이슈/PR:
- 변경 파일:
  - dist/extension.js
  - dist/extension.js.map
  - src/ai/terminalMonitorService.ts
  - src/terminal/terminalManager.ts
- 요약(변경 이유/영향): PowerShell 실행 오류 발생 시 LLM 피드백 기능 추가.
- 비고:

### 항목 #0024
- 커밋 해시: b8cdb377701c63c30b2e76a3a8118a4ae5a780f7
- 커밋 메시지: fix(terminal): PowerShell 실행 오류 이전 피드백, JSON 파싱 폴백 먼저 적용 개선
- 범위(scope): terminal
- 작성자(author): Administrator
- 커밋 시간(date): 2025-10-31 06:47:13 +0900
- 관련 이슈/PR:
- 변경 파일:
  - dist/extension.js
  - dist/extension.js.map
  - src/ai/terminalMonitorService.ts
  - src/terminal/terminalManager.ts
- 요약(변경 이유/영향): PowerShell 오류 피드백 흐름 개선, JSON 파싱 폴백 처리 우선순위 조정.
- 비고:

### 항목 #0025
- 커밋 해시: d2f0ec67b20b5a21f155af665001cdd9c924584a
- 커밋 메시지: fix(terminal): 오류 해결 시 -Command 변경 및 JSON 파싱 개선
- 범위(scope): terminal
- 작성자(author): Administrator
- 커밋 시간(date): 2025-10-31 06:44:16 +0900
- 관련 이슈/PR:
- 변경 파일:
  - dist/extension.js
  - dist/extension.js.map
  - src/terminal/terminalManager.ts
- 요약(변경 이유/영향): 오류 해결 시 -Command 사용 전환 및 JSON 파싱 처리 개선.
- 비고:

### 항목 #0026
- 커밋 해시: 1d0295a8241ad623353e9aebbea08a5325b5ff83
- 커밋 메시지: fix(terminal): 인코딩 오류 시 -EncodedCommand 대신 PowerShell 직접 실행
- 범위(scope): terminal
- 작성자(author): Administrator
- 커밋 시간(date): 2025-10-31 06:41:18 +0900
- 관련 이슈/PR:
- 변경 파일:
  - dist/extension.js
  - dist/extension.js.map
  - src/terminal/terminalManager.ts
- 요약(변경 이유/영향): 인코딩 오류 시 -EncodedCommand 대신 PowerShell 직접 실행 방식 적용.
- 비고:

### 항목 #0027
- 커밋 해시: 7bd617fb9eb175447f5ae53b0663b1dfb288ca05
- 커밋 메시지: fix(terminal): 인코딩 PowerShell 명령 실행 오류 이전 피드백 전달
- 범위(scope): terminal
- 작성자(author): Administrator
- 커밋 시간(date): 2025-10-31 06:38:26 +0900
- 관련 이슈/PR:
- 변경 파일:
  - devlog.md
  - dist/extension.js
  - dist/extension.js.map
  - src/terminal/terminalManager.ts
- 요약(변경 이유/영향): PowerShell 인코딩 오류 발생 시 이전 피드백을 LLM에 전달하도록 개선.
- 비고:

### 항목 #0019
- 커밋 해시: abfed3a0c9286fdec1747ceac8fe3f74cebd26ad
- 커밋 메시지: fix(terminal): PowerShell quote escaping; strengthen JSON fallback parser
- 범위(scope): terminal
- 작성자(author): Administrator
- 커밋 시간(date): 2025-10-31 06:32:12 +0900
- 관련 이슈/PR:
- 변경 파일:
  - dist/extension.js
  - dist/extension.js.map
  - src/terminal/terminalManager.ts
- 요약(변경 이유/영향): PowerShell 따옴표 이스케이프 처리 강화 및 JSON 폴백 파서 안정화.
- 비고:

### 항목 #0020
- 커밋 해시: 1af345fb6d87e46d0c01bfb41f9e29aec8f08f60
- 커밋 메시지: fix(terminal): decode -EncodedCommand to -Command before exec; ban mvn/gradle in auto-correction when type unknown fix(monitor): CLIXML sanitize and robust PowerShell error detection build: update dist
- 범위(scope): terminal, monitor
- 작성자(author): Administrator
- 커밋 시간(date): 2025-10-31 06:24:42 +0900
- 관련 이슈/PR:
- 변경 파일:
  - devlog.md
  - dist/extension.js
  - dist/extension.js.map
  - src/ai/llmResponseProcessor.ts
  - src/ai/terminalMonitorService.ts
  - src/terminal/terminalManager.ts
- 요약(변경 이유/영향): -EncodedCommand 디코딩 후 실행, mvn/gradle 자동 수정 제한(타입 미상 시), CLIXML 정제 및 PowerShell 오류 감지 강화.
- 비고:

### 항목 #0018
- 커밋 해시: d11dc998a94dc51a7da47082c97fae14c61a92ce
- 커밋 메시지: feat(terminal): pass projectRoot to queue and error-correction; fix placeholder guards; feat(utils): string shell capture; fix(llm): enqueue with projectRoot
- 범위(scope): terminal, utils, llm
- 작성자(author): Administrator
- 커밋 시간(date): 2025-10-31 06:16:31 +0900
- 관련 이슈/PR:
- 변경 파일:
  - devlog.md
  - dist/extension.js
  - dist/extension.js.map
  - src/ai/llmResponseProcessor.ts
  - src/terminal/terminalManager.ts
  - src/utils/processRunner.ts
  - webview/chat.html
- 요약(변경 이유/영향): 프로젝트 루트 전달로 큐/오류수정 흐름 일관화, 플레이스홀더 가드 보강, 셸 출력 캡처 유틸 추가, LLM 큐 등록 시 projectRoot 반영.
- 비고:

### 항목 #0002
- 커밋 해시: 7399e91a121b69f9e8100624da111ea1dd2be1cc
- 커밋 메시지: feat(terminal): auto-exec PowerShell via -EncodedCommand; cmd.exe enforcement for CMD blocks fix(planner): prevent duplicate command rendering; strip code blocks from plan output feat(context): include project file inventory snapshot in LLM context chore: quiet unnecessary logs and improve Windows path handling; add Run button for PS/CMD build: update dist bundles
- 범위(scope): terminal
- 작성자(author): Administrator
- 커밋 시간(date): 2025-10-31 05:06:53 +0900
- 관련 이슈/PR:
- 변경 파일:
  - devlog.md
  - dist/extension.js
  - dist/extension.js.map
  - dist/webview/ask.js
  - dist/webview/ask.js.map
  - dist/webview/chat.js
  - dist/webview/chat.js.map
  - dist/webview/codeCopy.js
  - dist/webview/codeCopy.js.map
  - dist/webview/settings.js
  - dist/webview/settings.js.map
  - package-lock.json
  - src/ai/llmResponseProcessor.ts
  - src/ai/llmService.ts
  - src/extension.ts
  - src/services/storage.ts
  - src/terminal/terminalManager.ts
  - src/webview/panelManager.ts
  - webview/chat.html
  - webview/codeCopy.js
  - webview/settings.js
- 요약(변경 이유/영향): PowerShell 자동 실행 및 CMD 블록 강제, 플래너 중복 렌더링 방지, 컨텍스트 강화, Windows 경로/로그 개선, 실행 버튼 추가.
- 비고:

---

## 2025-10-24

### 항목 #0003
- 커밋 해시: d470491081095136a76be76457e6ea80a8e6347f
- 커밋 메시지: Release v4.6.0: Package VSIX with bash script execution fixes
- 범위(scope): release
- 작성자(author): Tony
- 커밋 시간(date): 2025-10-24 12:10:32 +0900
- 관련 이슈/PR:
- 변경 파일:
  - release/aidevIde-4.6.0.vsix
- 요약(변경 이유/영향): v4.6.0 VSIX 배포 패키징.
- 비고:

### 항목 #0004
- 커밋 해시: 6669a1316ef4a6410fc405d7f74726cc7b170dff
- 커밋 메시지: Fix bash script execution: merge multi-line constructs into single command
- 범위(scope): 
- 작성자(author): Tony
- 커밋 시간(date): 2025-10-24 00:24:46 +0900
- 관련 이슈/PR:
- 변경 파일:
  - README.md
  - RELEASE.ko.md
  - RELEASE.md
  - dist/extension.js
  - dist/extension.js.map
  - dist/webview/ask.js
  - dist/webview/ask.js.map
  - dist/webview/chat.js
  - dist/webview/chat.js.map
  - dist/webview/codeCopy.js
  - dist/webview/codeCopy.js.map
  - dist/webview/settings.js
  - dist/webview/settings.js.map
  - package.json
  - src/ai/codebaseContextService.ts
  - src/ai/gemini.ts
  - src/ai/llmService.ts
  - src/extension.ts
  - src/services/planQueueService.ts
  - src/services/storage.ts
  - src/terminal/terminalManager.ts
  - src/webview/askViewProvider.ts
  - src/webview/chatViewProvider.ts
  - src/webview/panelManager.ts
  - src/webview/panelUtils.ts
  - webview/ask.html
  - webview/ask.js
  - webview/chat.html
  - webview/chat.js
  - webview/codeCopy.js
  - webview/plan.html
  - webview/plan.js
  - webview/settings.js
- 요약(변경 이유/영향): Bash 다중 라인 구문 단일 명령 병합으로 실행 안정화.
- 비고:

---

## 2025-10-23

### 항목 #0005
- 커밋 해시: c5377dd5bfd8a7df25ab8aad4bc62304402bc175
- 커밋 메시지: chore: bump to v4.5.1, add offline fallback, Windows permission guidance, webview offline, processing step updates
- 범위(scope): 
- 작성자(author): Tony
- 커밋 시간(date): 2025-10-23 12:05:50 +0900
- 관련 이슈/PR:
- 변경 파일:
  - dist/extension.js
  - dist/extension.js.map
  - package-lock.json
  - package.json
  - release/aidevIde-4.5.1.vsix
  - src/ai/gemini.ts
  - src/ai/llmResponseProcessor.ts
  - src/ai/llmService.ts
  - webview/ask.html
- 요약(변경 이유/영향): v4.5.1 업데이트, 오프라인 폴백/권한 가이드/웹뷰 오프라인 대응.
- 비고:

---

## 2025-10-22

### 항목 #0006
- 커밋 해시: 540216d9f99b2e0081324cf71d54fc8ff3d2cec3
- 커밋 메시지: chore(release): package v4.5.0 VSIX and update .vscodeignore
- 범위(scope): release
- 작성자(author): Tony
- 커밋 시간(date): 2025-10-22 04:28:17 +0900
- 관련 이슈/PR:
- 변경 파일:
  - .vscodeignore
  - dist/extension.js
  - dist/extension.js.map
  - dist/webview/settings.js
  - dist/webview/settings.js.map
  - release/aidevIde-4.5.0.vsix
  - src/ai/gemini.ts
  - src/ai/llmService.ts
  - src/extension.ts
  - src/webview/askViewProvider.ts
  - src/webview/chatViewProvider.ts
  - src/webview/panelManager.ts
  - webview/settings.js
- 요약(변경 이유/영향): v4.5.0 VSIX 패키징 및 .vscodeignore 업데이트.
- 비고:

### 항목 #0008
- 커밋 해시: e6337c800c3fe7110b19f00944a99c693c098e30
- 커밋 메시지: chore(release): v4.5.0 package to release, Processing Steps UI, cancel/reset logic, auto-execute toggle, bug fixes
- 범위(scope): release
- 작성자(author): Tony
- 커밋 시간(date): 2025-10-22 04:00:32 +0900
- 관련 이슈/PR:
- 변경 파일:
  - dist/extension.js
  - dist/extension.js.map
  - release/aidevIde-4.5.0.vsix
  - src/ai/llmResponseProcessor.ts
  - src/ai/terminalMonitorService.ts
  - src/webview/askViewProvider.ts
  - src/webview/chatViewProvider.ts
  - webview/ask.html
  - webview/chat.html
- 요약(변경 이유/영향): v4.5.0 패키징 및 Processing Steps/UI 관련 개선 포함.
- 비고:

### 항목 #0009
- 커밋 해시: 16b83f33e134581eea6f232471eadaa4df091551
- 커밋 메시지: 🚀 Version 4.5.0 - Auto Command Execution & Individual Callout Execution Status
- 범위(scope): 
- 작성자(author): Tony
- 커밋 시간(date): 2025-10-22 03:05:52 +0900
- 관련 이슈/PR:
- 변경 파일:
  - .DS_Store
  - .vscode/launch.json
  - .vscode/tasks.json
  - PROJECT_ROOT_SETUP.md
  - README.ko.md
  - README.md
  - RELEASE.ko.md
  - RELEASE.md
  - debug-extension.sh
  - dist/extension.js
  - dist/extension.js.map
  - dist/webview/ask.js
  - dist/webview/ask.js.map
  - dist/webview/chat.js
  - dist/webview/chat.js.map
  - dist/webview/codeCopy.js
  - dist/webview/codeCopy.js.map
  - dist/webview/settings.js
  - dist/webview/settings.js.map
  - package.json
  - release/aidevIde-4.4.2.vsix
  - release/aidevIde-4.5.0.vsix
  - src/ai/codebaseContextService.ts
  - src/ai/llmResponseProcessor.ts
  - src/ai/llmService.ts
  - src/ai/ollama.ts
  - src/ai/terminalMonitorService.ts
  - src/extension.ts
  - src/services/configurationService.ts
  - src/services/storage.ts
  - src/terminal/terminalManager.ts
  - src/webview/askViewProvider.ts
  - src/webview/chatViewProvider.ts
  - src/webview/panelManager.ts
  - webview/ask.html
  - webview/chat.html
  - webview/chat.js
  - webview/codeCopy.js
  - webview/settings.html
  - webview/settings.js
- 요약(변경 이유/영향): 4.5.0 릴리즈. 자동 명령 실행 토글/개별 콜아웃 실행 상태 등 포함.
- 비고:

---

## 2025-10-21

### 항목 #0010
- 커밋 해시: 8f152a85f2278e95e2e5559fa4af54370816b82d
- 커밋 메시지: Fix language files path and add Ollama model debugging
- 범위(scope): 
- 작성자(author): Tony
- 커밋 시간(date): 2025-10-21 22:22:01 +0900
- 관련 이슈/PR:
- 변경 파일:
  - aidevIde-4.4.2.vsix
  - dist/extension.js
  - dist/extension.js.map
  - release/aidevIde-4.4.2.vsix
  - src/webview/panelManager.ts
- 요약(변경 이유/영향): 언어 파일 경로 절대화 및 Ollama 모델 로딩 디버깅 로그 추가.
- 비고:

### 항목 #0011
- 커밋 해시: 8eb22f4f82e4a900518f97fef8c8419fa746b0b6
- 커밋 메시지: Add debugging logs for Ollama model loading issue
- 범위(scope): 
- 작성자(author): Tony
- 커밋 시간(date): 2025-10-21 22:19:08 +0900
- 관련 이슈/PR:
- 변경 파일:
  - aidevIde-4.4.2.vsix
  - dist/extension.js
  - dist/extension.js.map
  - dist/webview/settings.js
  - dist/webview/settings.js.map
  - release/aidevIde-4.4.2.vsix
  - src/webview/panelManager.ts
  - webview/settings.js
- 요약(변경 이유/영향): Ollama 모델 적용 문제 진단을 위한 상세 로깅 추가.
- 비고:

### 항목 #0012
- 커밋 해시: cfcc76b6c70a74e60b62d3224995db75a09b404f
- 커밋 메시지: Fix Ollama model dropdown not showing saved model on settings load
- 범위(scope): 
- 작성자(author): Tony
- 커밋 시간(date): 2025-10-21 22:16:25 +0900
- 관련 이슈/PR:
- 변경 파일:
  - aidevIde-4.4.2.vsix
  - dist/webview/settings.js
  - dist/webview/settings.js.map
  - release/aidevIde-4.4.2.vsix
  - webview/settings.js
- 요약(변경 이유/영향): 저장된 모델 표시 문제 수정.
- 비고:

### 항목 #0013
- 커밋 해시: 1cdc808dda07e2fbad60f76a755808f39999fb6d
- 커밋 메시지: Fix error retry count saving issue and comment out unnecessary logs
- 범위(scope): 
- 작성자(author): Tony
- 커밋 시간(date): 2025-10-21 22:12:41 +0900
- 관련 이슈/PR:
- 변경 파일:
  - aidevIde-4.4.2.vsix
  - dist/extension.js
  - dist/extension.js.map
  - dist/webview/ask.js
  - dist/webview/ask.js.map
  - dist/webview/chat.js
  - dist/webview/chat.js.map
  - dist/webview/codeCopy.js
  - dist/webview/codeCopy.js.map
  - dist/webview/settings.js
  - dist/webview/settings.js.map
  - release/aidevIde-4.4.2.vsix
  - src/webview/panelManager.ts
  - webview/settings.js
- 요약(변경 이유/영향): 오류 재시도 횟수 저장 문제 수정 및 불필요 로그 정리.
- 비고:

### 항목 #0014
- 커밋 해시: 993ba0f66a42884c857920324ee9e2e0ce597a16
- 커밋 메시지: Fix local Ollama settings and language data loading issues
- 범위(scope): 
- 작성자(author): Tony
- 커밋 시간(date): 2025-10-21 22:08:09 +0900
- 관련 이슈/PR:
- 변경 파일:
  - aidevIde-4.4.2.vsix
  - dist/extension.js
  - dist/extension.js.map
  - dist/webview/ask.js
  - dist/webview/ask.js.map
  - dist/webview/chat.js
  - dist/webview/chat.js.map
  - dist/webview/codeCopy.js
  - dist/webview/codeCopy.js.map
  - dist/webview/settings.js
  - dist/webview/settings.js.map
  - release/aidevIde-4.4.2.vsix
  - src/webview/panelManager.ts
- 요약(변경 이유/영향): 로컬 Ollama 설정/언어 데이터 로딩 문제 수정.
- 비고:

### 항목 #0015
- 커밋 해시: 112ea0c36591ddd3f7a9e180a8b132ce2d136e76
- 커밋 메시지: Fix project root path selection functionality
- 범위(scope): 
- 작성자(author): Tony
- 커밋 시간(date): 2025-10-21 22:05:01 +0900
- 관련 이슈/PR:
- 변경 파일:
  - aidevIde-4.4.2.vsix
  - dist/extension.js
  - dist/extension.js.map
  - dist/webview/settings.js
  - dist/webview/settings.js.map
  - release/aidevIde-4.4.2.vsix
  - src/webview/panelManager.ts
  - webview/settings.js
- 요약(변경 이유/영향): 프로젝트 루트 경로 선택 기능 구현 및 오류 처리 강화.
- 비고:

### 항목 #0016
- 커밋 해시: 4386bb952b996021b86d4780b1157ee349d6c62b
- 커밋 메시지: Fix language settings and data loading issues
- 범위(scope): 
- 작성자(author): Tony
- 커밋 시간(date): 2025-10-21 22:02:22 +0900
- 관련 이슈/PR:
- 변경 파일:
  - aidevIde-4.4.2.vsix
  - dist/extension.js
  - dist/extension.js.map
  - dist/webview/settings.js
  - dist/webview/settings.js.map
  - release/aidevIde-4.4.2.vsix
  - src/webview/panelManager.ts
  - webview/settings.js
- 요약(변경 이유/영향): 언어 설정/데이터 로딩 안정화.
- 비고:

### 항목 #0017
- 커밋 해시: 9c411e8e27eae038dcc3cbb8f5a757ba96327e71
- 커밋 메시지: Fix Ollama model and local settings command errors
- 범위(scope): 
- 작성자(author): Tony
- 커밋 시간(date): 2025-10-21 21:57:05 +0900
- 관련 이슈/PR:
- 변경 파일:
  - aidevIde-4.4.2.vsix
  - dist/extension.js
  - dist/extension.js.map
  - release/aidevIde-4.4.2.vsix
  - src/webview/panelManager.ts
- 요약(변경 이유/영향): Ollama 모델/로컬 설정 명령 오류 수정.
- 비고:

