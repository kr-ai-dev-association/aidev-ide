# Windows 전용 쉘 스크립트 처리 개선 방안

## 문제 분석

### 발생한 오류
PowerShell에서 배치 스크립트를 실행할 때 다음과 같은 오류가 발생:

```
앰퍼샌드(&) 문자를 사용할 수 없습니다. & 연산자는 나중에 사용하도록 예약되었습니다.
```

### 원인
1. **PowerShell의 특수 문자 처리**: PowerShell은 `&`를 명령어 연결 연산자로 해석합니다.
2. **배치 스크립트의 `&` 사용**: Windows 배치 파일에서는 `&`가 명령 구분자로 사용됩니다.
3. **명령 전달 방식**: `cmd.exe /d /c @echo off & cd /d "%~dp0" & ...` 형식의 명령이 PowerShell에 전달될 때, PowerShell이 먼저 파싱을 시도합니다.

### 현재 코드 동작
`src/terminal/terminalManager.ts`의 `extractBashCommandsFromLlmResponse` 함수에서:
- 배치 스크립트를 `cmd.exe /d /c ${joined}` 형식으로 변환
- `joined`는 ` & `로 연결된 명령어 문자열
- PowerShell에서 실행 시 `&`가 PowerShell 파서에 의해 먼저 해석됨

## 해결 방안

### 방안 1: 명령어 전체를 따옴표로 묶기 (권장)
```typescript
commands.push(`cmd.exe /d /c "${joined}"`);
```
**장점**: 간단하고 직관적
**단점**: `joined` 내부에 따옴표가 있을 경우 이스케이프 필요

### 방안 2: PowerShell 이스케이프 문자 사용
```typescript
// PowerShell에서 실행될 때를 감지하여 백틱 이스케이프
if (process.platform === 'win32') {
    const escaped = joined.replace(/&/g, '`&');
    commands.push(`cmd.exe /d /c ${escaped}`);
} else {
    commands.push(`cmd.exe /d /c ${joined}`);
}
```
**장점**: PowerShell 특수 문자를 안전하게 처리
**단점**: 복잡도 증가

### 방안 3: 전체 명령을 큰따옴표로 감싸기 + 내부 따옴표 이스케이프 (최종 권장)
```typescript
// 내부 따옴표를 이스케이프하고 전체를 큰따옴표로 감싸기
const escaped = joined.replace(/"/g, '\\"');
commands.push(`cmd.exe /d /c "${escaped}"`);
```

### 방안 4: 임시 배치 파일 생성 후 실행
```typescript
// 임시 .bat 파일을 생성하고 실행
const tempBatPath = path.join(os.tmpdir(), `aidev-ide-${Date.now()}.bat`);
await fs.promises.writeFile(tempBatPath, block, 'utf8');
commands.push(tempBatPath);
// 실행 후 정리 필요
```
**장점**: 파싱 문제 완전 회피
**단점**: 파일 I/O 오버헤드, 임시 파일 관리 필요

## LLM 오류 수정 프롬프트 개선

### OS별 가이드라인 분기 처리
LLM이 오류를 수정할 때 OS에 따라 다른 가이드라인을 제공하도록 개선:

#### Windows 환경 (Windows만 제공)
1. **PowerShell 환경**: PowerShell에서 배치 스크립트(cmd.exe) 실행 시 특수 문자 처리
2. **배치 스크립트 오류**: "앰퍼샌드(&) 문자를 사용할 수 없습니다" 오류 해결 방법
3. **복잡한 배치 스크립트**: 여러 명령이 &로 연결된 스크립트 처리 방법
4. **경로 구분자**: 백슬래시(\\) 사용 권장

#### Unix 계열 환경 (Linux/macOS 공통)
1. **경로 처리**: 슬래시(/) 사용, 공백이 있는 경로는 따옴표로 감싸기
2. **실행 권한**: chmod +x를 사용한 실행 권한 부여
3. **환경 변수**: export 사용 및 $변수명 참조 방식
4. **파이프 및 리다이렉션**: 올바른 구분자 사용

#### 공통 가이드라인
- 셸 환경 문제
- 경로 문제
- 권한 문제 (OS별 다른 명령어)
- 환경 변수 문제 (OS별 다른 명령어)
- 프로젝트 타입별 빌드 도구

## 구현 완료 사항

### ✅ 1단계: 즉시 적용 완료
- ✅ 방안 3 적용: 배치 스크립트를 큰따옴표로 감싸고 cmd.exe 스타일(`""`)로 따옴표 이스케이프
- ✅ LLM 프롬프트에 Windows 쉘 특수 문자 처리 가이드 추가 (11-13번 항목)

### 구현된 변경사항
1. **`src/terminal/terminalManager.ts`**:
   - `extractBashCommandsFromLlmResponse` 함수에서 cmd.exe 명령을 따옴표로 감싸기
   - 내부 따옴표를 cmd.exe 스타일(`""`)로 이스케이프 처리
   - 이제 `cmd.exe /d /c "..."` 형식으로 실행되어 PowerShell이 `&`를 파싱하지 않음

2. **오류 수정 프롬프트 개선**:
   - **OS별 가이드라인 분기 처리**: Windows는 Windows 전용 가이드만, Linux/macOS는 Unix 계열 가이드 제공
   - Windows PowerShell 환경에서의 특수 문자 처리 가이드 추가 (Windows만)
   - 배치 스크립트 오류 해결 방법 명시 (Windows만)
   - Unix 계열 환경 특별 고려사항 추가 (Linux/macOS)
   - 공통 가이드라인은 OS에 맞게 동적으로 조정 (권한 명령어, 환경 변수 설정 등)

### 향후 개선 사항

### 2단계: 장기 개선
- 명령어 타입별 이스케이프 처리 함수 분리
- PowerShell vs CMD 실행 환경 자동 감지 및 최적화
- 더 복잡한 스크립트를 위한 추가 검증

### 3단계: 고급 기능
- 임시 파일 기반 실행 옵션 (복잡한 스크립트용)
- 명령어 미리보기 및 사용자 확인 기능

## 테스트 시나리오

1. **기본 배치 스크립트**
   ```cmd
   echo "Hello" & echo "World"
   ```

2. **경로 포함 스크립트**
   ```cmd
   cd /d "C:\Users\Test" & dir
   ```

3. **따옴표 포함 스크립트**
   ```cmd
   echo "Test & More" & echo "Done"
   ```

4. **복잡한 스크립트**
   ```cmd
   @echo off & cd /d "%~dp0" & mvn clean & mvn package
   ```

## 참고사항

- PowerShell은 `cmd.exe` 호출 전에 명령어를 파싱합니다
- `Invoke-Expression` 사용 시 더 복잡한 이스케이프가 필요할 수 있습니다
- Windows 10/11에서는 WSL 사용 시 다른 규칙이 적용됩니다

