# 터미널 캐치 GO 데몬 디자인

## 1. 개요
- 목표: VS Code 확장이 직접 실행하거나 LLM이 제안한 터미널 명령의 표준 출력/에러를 안정적으로 수집한다.
- 접근 방식: 기존 `ollama-blocker` 패턴을 재활용하여 별도 Go 데몬(`terminal-daemon`)을 자율 실행시키고, 확장과 IPC(소켓)로 통신한다.
- 기대 효과: VS Code API로 포착하기 어려운 로그를 OS 레벨에서 독립적으로 수집하고, 자동 에러 플로우와 연결한다.

## 2. 아키텍처
1. **VS Code 확장 (TypeScript)**
   - 활성화 시 `terminal-daemon` 바이너리를 확인하고 필요 시 다운로드/설치 안내.
   - 명령 실행 전 데몬을 `spawn`하여 Unix Domain Socket(또는 TCP)으로 접속.
   - 명령 실행 요청, 중지, 로그 구독, 최근 로그 요청 등 명령을 JSON 메시지로 주고받음.
   - 데몬이 전송한 로그/에러 이벤트를 `TerminalMonitorService`와 LLM 파이프라인에 전달.

2. **terminal-daemon (Go)**
   - PTY 기반으로 하위 프로세스를 실행하여 stdout/stderr을 실시간 스트리밍.
   - `run`, `stop`, `logs`, `subscribe` 등 JSON 명령을 처리.
   - 이벤트를 소켓으로 push하여 확장이 실시간 수신.
   - 최근 로그를 일정 버퍼에 보관하여 요청 시 반환.

3. **데이터 플로우**
   1. 확장 → 데몬: `{"type":"run","id":"cmd-123","command":"npm start","cwd":"/path"}`
   2. 데몬 → 확장: `{"type":"log","id":"cmd-123","stream":"stderr","chunk":"npm ERR!..."}`
   3. 데몬 → 확장: `{"type":"exit","id":"cmd-123","code":1}`
   4. 확장: 로그를 `TerminalMonitorService`에 전달하고, 에러 시 LLM 자동 플로우를 호출.

## 3. Go 데몬 상세 디자인
### 3.1 패키지 구성 (예시)
```
cmd/daemon/main.go          // 엔트리 포인트
internal/ipc/server.go      // 소켓 리스너/JSON 프로토콜
internal/runner/process.go  // pty를 이용한 명령 실행
internal/logs/buffer.go     // 최근 로그 버퍼 관리
internal/types/messages.go  // 요청/응답 구조체 정의
```

### 3.2 주요 기능
- **소켓 리스너**: `net.Listen("unix", socketPath)`로 연결 대기.
- **메시지 프로토콜**: `encoding/json`으로 직렬화, `Request`/`Response` 구조체 유지.
- **명령 실행**: `pty.Start(exec.Command(...))`, `io.Copy`로 stdout/stderr 읽기.
- **에러 감지**: stderr 라인 기반으로 정규식 매칭 or 단순 분류 후 이벤트 전송.
- **로그 버퍼**: 최근 N초 또는 N라인 저장, 메모리 순환 버퍼 형태.
- **종료 처리**: OS 신호(`os/signal`) 수신 시 실행 중인 명령 종료 후 깨끗하게 종료.

### 3.3 메시지 정의 (예시)
```go
type Request struct {
    Type    string            `json:"type"`
    ID      string            `json:"id"`
    Command string            `json:"command,omitempty"`
    CWD     string            `json:"cwd,omitempty"`
    Env     map[string]string `json:"env,omitempty"`
}

type Response struct {
    Type    string `json:"type"`
    ID      string `json:"id"`
    Stream  string `json:"stream,omitempty"`
    Chunk   string `json:"chunk,omitempty"`
    Code    int    `json:"code,omitempty"`
    Error   string `json:"error,omitempty"`
}
```

### 3.4 명령 처리 흐름
1. **run**: 실행 중인 명령 맵에 등록 → PTY 생성 → goroutine으로 로그 전송 → 종료 시 `exit` 이벤트.
2. **stop**: ID로 실행 중인 명령을 찾아 `Process.Kill()`.
3. **logs**: 버퍼에 저장된 최근 로그를 한번에 전송.
4. **subscribe**: 실시간 이벤트 스트림을 위해 소켓 유지.

## 4. VS Code 확장 연동
### 4.1 서비스 구조
- `src/services/terminalDaemonService.ts`
  - `start()`: 바이너리 경로 확인, 실행(`spawn`), 소켓 연결.
  - `stop()`: 프로세스 종료.
  - `runCommand(command, cwd, env)`: 데몬에 JSON 명령, 응답 스트림 핸들러 등록.
  - `onLog / onExit / onError`: 이벤트Emitter로 VS Code 내 다른 서비스에 전달.

### 4.2 에러 처리 연동
- `TerminalMonitorService.ingestExternalOutput()`에 데몬 로그 전달.
- 에러 이벤트 수신 시 최근 로그 & 실행 컨텍스트를 `LlmService`에 전달.
- LLM이 자동으로 “에러 분석 → 수정 계획 → 실행”을 생성하도록 플로우 구성.

### 4.3 사용자 인터페이스
- 설정(Preferences)에 “터미널 데몬 사용” 토글과 바이너리 업데이트 버튼 제공.
- 상태바(Status Bar)에 데몬 연결 상태 표시.
- 오류 발생 시 Output 채널과 Notifications에 명확히 안내.

## 5. 빌드 & 배포 가이드
1. **Go 바이너리 빌드**
   ```sh
   # macOS Universal
   GOOS=darwin GOARCH=amd64 go build -o assets/terminal-daemon/terminal-daemon cmd/daemon/main.go
   GOOS=darwin GOARCH=arm64 go build -o assets/terminal-daemon/terminal-daemon-arm64 cmd/daemon/main.go

   # Linux
   GOOS=linux GOARCH=amd64 go build -o assets/terminal-daemon/terminal-daemon-linux cmd/daemon/main.go
   ```
   (Windows 지원이 필요하면 별도 빌드 프로세스 준비)

2. **확장 패키징**
   - `package.json`의 `contributes.assets` 또는 커스텀 로직으로 바이너리 포함.
   - 사용자에게 최초 실행 시 `chmod +x` 안내.

3. **설치/업데이트**
   - Ollama-blocker 스타일로 자동 업데이트 로직을 재활용.
   - 바이너리 해시 검증, 다운로드 실패 시 롤백 처리.

4. **문서화**
   - `assets/terminal-daemon/README.md`에 빌드 및 수동 설치 안내.
   - VS Code 설정 문서에 사용법/제한 사항 명시.

## 6. 보안 및 권한 고려
- 사용자 승인 없이 시스템 전역 터미널을 훑어보지 않고, 확장이 실행한 명령만 데몬을 통해 실행.
- Unix 소켓 사용 시 권한을 600으로 설정하여 다른 사용자 접근 차단.
- 로그에 민감한 정보가 포함될 수 있으므로 최대한 메모리 내에서만 유지하거나 사용자 설정으로 보존 기간 제한.

## 7. 자동화 플로우 시나리오
1. 명령 실행 → 데몬 로그 수집 → 에러 감지 이벤트 발생.
2. 확장은 최근 로그, 실행 명령, 프로젝트 컨텍스트를 LLM에 전달.
3. LLM이 에러 분석/수정 플랜 출력 → 사용자가 승인하면 실행.
4. 플랜 실행 역시 데몬을 통해 진행 → 성공 시 사용자에게 결과 보고.

## 8. 후속 작업 체크리스트
- [ ] 데몬 스켈레톤 구현
- [ ] 단위 테스트: 명령 실행, 로그 수집, 에러 패턴 매칭
- [ ] 확장 서비스 작성 및 Ollama-blocker 유사 lifecycle 적용
- [ ] 자동 에러 플로우(LlmService ↔ TerminalMonitorService ↔ Daemon) 연결
- [ ] 문서화 및 사용자 가이드 업데이트

---

위 설계를 바탕으로 Go 데몬과 확장 측 연동 로직을 작성하면, VS Code 내에서 실행되는 명령의 성공/실패를 훨씬 안정적으로 분석할 수 있습니다. 추가적인 세부 구현이 필요하면 각 모듈별로 더 상세한 설계를 이어 나가면 됩니다.
