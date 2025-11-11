# VS Code 확장 프로그램 디버깅 가이드

## 🚀 빠른 시작

### 1단계: 코드 컴파일

디버깅 전에 TypeScript 코드를 JavaScript로 컴파일해야 합니다.

```bash
# 터미널에서 실행
npm run compile
```

또는 **자동 감시 모드**로 실행 (코드 변경 시 자동 재컴파일):

```bash
npm run watch
```

### 2단계: 디버깅 시작

1. **F5 키를 누르거나**
2. **디버그 패널 열기**:
   - `Cmd+Shift+D` (Mac) 또는 `Ctrl+Shift+D` (Windows/Linux)
   - 상단에서 "Run Extension" 선택
   - 녹색 재생 버튼 클릭

### 3단계: 새 VS Code 창에서 테스트

디버깅이 시작되면 **새로운 VS Code 창(Extension Development Host)**이 열립니다.

이 창에서:
- 확장 프로그램이 자동으로 로드됨
- 브레이크포인트가 작동함
- 콘솔 로그를 확인할 수 있음

---

## 📋 디버깅 설정 설명

현재 프로젝트에는 3가지 디버깅 설정이 있습니다:

### 1. Run Extension (기본)

**위치**: `.vscode/launch.json`

```json
{
  "name": "Run Extension",
  "type": "extensionHost",
  "request": "launch",
  "args": [
    "--extensionDevelopmentPath=${workspaceFolder}",
    "--disable-extensions",      // 다른 확장 프로그램 비활성화
    "--new-window"              // 새 창에서 열기
  ],
  "outFiles": [
    "${workspaceFolder}/dist/**/*.js"  // 컴파일된 JS 파일 위치
  ],
  "preLaunchTask": "npm: compile",     // 디버깅 전 자동 컴파일
  "console": "integratedTerminal",     // 콘솔 출력 위치
  "env": {
    "NODE_ENV": "development"
  }
}
```

**특징**:
- 디버깅 시작 전 자동으로 `npm run compile` 실행
- 다른 확장 프로그램 비활성화 (충돌 방지)
- 통합 터미널에 콘솔 출력

### 2. Run Extension (Clean)

```json
{
  "name": "Run Extension (Clean)",
  "args": [
    "--no-cached-data"  // 캐시 없이 실행
  ]
}
```

**사용 시기**:
- 캐시 문제로 인한 이상 동작 시
- 확장 프로그램이 제대로 로드되지 않을 때

### 3. Extension Tests

테스트 실행용 설정입니다.

---

## 🔍 브레이크포인트 사용법

### 브레이크포인트 설정

1. **소스 코드에서 브레이크포인트 설정**:
   - 코드 왼쪽 여백 클릭 (빨간 점 표시)
   - 또는 `F9` 키

2. **조건부 브레이크포인트**:
   - 브레이크포인트 우클릭 → "Edit Breakpoint"
   - 조건 입력 (예: `userQuery.length > 100`)

3. **로그포인트**:
   - 브레이크포인트 우클릭 → "Add Logpoint"
   - 로그 메시지 입력 (예: `User query: {userQuery}`)

### 디버깅 패널 사용

디버깅 중 다음 패널을 활용하세요:

- **Variables**: 현재 스코프의 변수 값
- **Watch**: 관찰할 표현식 추가
- **Call Stack**: 함수 호출 스택
- **Breakpoints**: 모든 브레이크포인트 목록
- **Debug Console**: 디버깅 중 코드 실행

---

## 🛠️ 디버깅 팁

### 1. 콘솔 로그 확인

**Extension Development Host 창**에서:
- `View` → `Output` 메뉴
- 드롭다운에서 "Log (Extension Host)" 선택
- 확장 프로그램의 `console.log()` 출력 확인

### 2. 디버그 콘솔 사용

디버깅 중 **Debug Console**에서:
```javascript
// 변수 값 확인
userQuery
contextFiles.length

// 함수 호출
this.parseCheckboxItemsFromPlan(planText)

// 객체 탐색
JSON.stringify(fileOperations, null, 2)
```

### 3. 소스맵 확인

`tsconfig.json`에 `"sourceMap": true`가 설정되어 있어야 합니다.
- ✅ 설정되어 있음
- TypeScript 소스 코드에서 직접 디버깅 가능

### 4. 핫 리로드

코드 수정 후:
1. `npm run watch` 실행 중이면 자동 재컴파일
2. **Extension Development Host 창**에서:
   - `Cmd+R` (Mac) 또는 `Ctrl+R` (Windows/Linux)로 재로드
   - 또는 `Developer: Reload Window` 명령 실행

---

## 📍 주요 디버깅 포인트

### LlmService 디버깅

**파일**: `src/ai/llmService.ts`

**주요 브레이크포인트 위치**:
```typescript
// 1. 사용자 입력 처리 시작
public async handleUserMessageAndRespond(...) {
  // 브레이크포인트 설정
}

// 2. Plan 생성
const planText = await this.ollamaApi.sendMessageWithSystemPrompt(...);

// 3. Plan 파싱
let itemsToEnqueue = this.parseCheckboxItemsFromPlan(planText);

// 4. 큐에 추가
this.planQueueService.enqueue(itemsToEnqueue, 'pending');
```

### LlmResponseProcessor 디버깅

**파일**: `src/ai/llmResponseProcessor.ts`

**주요 브레이크포인트 위치**:
```typescript
// 1. 파일 작업 파싱
while ((match = codeBlockRegex.exec(llmResponse)) !== null) {
  // 브레이크포인트 설정
  const originalDirective = match[1].trim();
  const llmSpecifiedPath = match[2].trim();
}

// 2. 파일 작업 실행
if (autoUpdateEnabled) {
  // 자동 실행 로직
} else {
  // 수동 확인 로직
}
```

### TerminalManager 디버깅

**파일**: `src/terminal/terminalManager.ts`

**주요 브레이크포인트 위치**:
```typescript
// 1. 큐 처리 시작
async function processQueue(): Promise<void> {
  // 브레이크포인트 설정
}

// 2. 파일 작업 실행
async function executeFileOpFromToken(token: string): Promise<boolean> {
  // 브레이크포인트 설정
}

// 3. 명령어 실행
async function handleInteractiveCommand(...) {
  // 브레이크포인트 설정
}
```

---

## 🐛 일반적인 문제 해결

### 문제 1: 브레이크포인트가 작동하지 않음

**해결 방법**:
1. 코드가 컴파일되었는지 확인: `npm run compile`
2. 소스맵이 생성되었는지 확인: `dist/extension.js.map` 파일 존재 여부
3. `outFiles` 경로 확인: `.vscode/launch.json`의 `outFiles` 설정
4. Extension Development Host 창에서 재로드

### 문제 2: 변경사항이 반영되지 않음

**해결 방법**:
1. `npm run watch` 실행 (자동 재컴파일)
2. Extension Development Host 창 재로드 (`Cmd+R` / `Ctrl+R`)
3. 디버깅 세션 재시작 (F5 중지 후 다시 시작)

### 문제 3: 콘솔 로그가 보이지 않음

**해결 방법**:
1. Extension Development Host 창에서:
   - `View` → `Output`
   - 드롭다운에서 "Log (Extension Host)" 선택
2. 통합 터미널 확인 (`.vscode/launch.json`에서 `"console": "integratedTerminal"` 설정)

### 문제 4: 다른 확장 프로그램과 충돌

**해결 방법**:
- `.vscode/launch.json`의 `--disable-extensions` 플래그가 이미 설정되어 있음
- 필요시 수동으로 Extension Development Host 창에서 다른 확장 프로그램 비활성화

---

## 📝 디버깅 워크플로우 예시

### 예시: Plan 파싱 문제 디버깅

1. **브레이크포인트 설정**:
   ```typescript
   // src/ai/llmService.ts
   private parseCheckboxItemsFromPlan(planMarkdown: string) {
     const lines = planMarkdown.split('\n');
     // 여기에 브레이크포인트
   }
   ```

2. **F5로 디버깅 시작**

3. **Extension Development Host 창에서 확장 프로그램 사용**

4. **브레이크포인트에서 멈춤**

5. **변수 확인**:
   - `planMarkdown`: Plan 텍스트 전체
   - `lines`: 줄 단위로 분리된 배열

6. **단계별 실행**:
   - `F10`: Step Over (다음 줄)
   - `F11`: Step Into (함수 진입)
   - `Shift+F11`: Step Out (함수 나가기)
   - `F5`: Continue (다음 브레이크포인트까지)

7. **Watch 패널에서 표현식 추가**:
   ```
   lines.length
   lines[0]
   checkboxMatch1
   ```

---

## 🎯 고급 디버깅 기법

### 1. 조건부 브레이크포인트

특정 조건에서만 멈추기:
```typescript
// 예: userQuery가 특정 키워드를 포함할 때만
userQuery.includes('프로젝트 생성')
```

### 2. 로그포인트

브레이크 없이 로그만 출력:
```
User query: {userQuery}
File operations count: {fileOperations.length}
```

### 3. 디버그 콘솔에서 코드 실행

디버깅 중 변수 수정:
```javascript
// 변수 값 변경
userQuery = "테스트 쿼리"

// 함수 재실행
this.parseCheckboxItemsFromPlan(planText)
```

### 4. Call Stack 탐색

함수 호출 경로 추적:
- Call Stack 패널에서 이전 함수로 이동
- 각 스택 프레임의 변수 확인

---

## 📚 추가 리소스

### VS Code 디버깅 문서
- [VS Code Debugging Guide](https://code.visualstudio.com/docs/editor/debugging)
- [Extension Development](https://code.visualstudio.com/api/get-started/your-first-extension)

### 프로젝트 관련
- `LLM_TASK_QUEUE_FLOW.md`: 전체 흐름 이해
- `src/ai/llmService.ts`: 메인 서비스 로직
- `src/ai/llmResponseProcessor.ts`: 응답 처리 로직

---

## ✅ 체크리스트

디버깅 시작 전 확인사항:

- [ ] `npm run compile` 또는 `npm run watch` 실행
- [ ] `.vscode/launch.json` 파일 존재 확인
- [ ] `tsconfig.json`에 `"sourceMap": true` 설정 확인
- [ ] 브레이크포인트 설정
- [ ] F5로 디버깅 시작
- [ ] Extension Development Host 창 확인
- [ ] Output 패널에서 로그 확인

---

**문서 작성일**: 2024년
**작성자**: AI Assistant
**버전**: 1.0

