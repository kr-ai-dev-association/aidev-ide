# 매니저 시스템 통합 가이드

새로운 매니저 기반 아키텍처를 기존 코드에 통합하는 방법을 설명합니다.

## 📋 목차
1. [개요](#개요)
2. [통합 방법](#통합-방법)
3. [사용 예제](#사용-예제)
4. [마이그레이션 체크리스트](#마이그레이션-체크리스트)

---

## 개요

### 완성된 매니저
- ✅ **Action Manager**: LLM 응답 → 실행 가능한 액션 변환
- ✅ **Execution Manager**: 프로세스 실행 및 관리
- ✅ **Terminal Manager**: 터미널 세션 관리

### 통합 전략
**점진적 마이그레이션**: 기존 코드를 유지하면서 새로운 매니저를 옵션으로 활성화

---

## 통합 방법

### 1. ManagerAdapter 사용

`ManagerAdapter`는 기존 코드와 새로운 매니저 시스템을 연결합니다.

```typescript
import { getManagerAdapter } from './managers/integration/ManagerAdapter';

// 싱글톤 인스턴스 가져오기
const managerAdapter = getManagerAdapter();
```

### 2. extension.ts에 초기화 추가

```typescript
// src/extension.ts
import { getManagerAdapter } from './managers/integration/ManagerAdapter';

export async function activate(context: vscode.ExtensionContext) {
    // ... 기존 초기화 코드 ...

    // 매니저 시스템 초기화
    const managerAdapter = getManagerAdapter();
    
    // 설정 (선택사항 - 기본값은 모두 true)
    managerAdapter.updateConfig({
        useActionManager: true,
        useExecutionManager: true,
        useTerminalManager: true
    });

    console.log('[Extension] Manager system initialized');
    console.log('[Extension] Stats:', managerAdapter.getStats());

    // ... 나머지 코드 ...
}
```

### 3. llmService.ts에 통합

#### 3.1 LLM 응답 처리 (Action Manager)

```typescript
// src/ai/llmService.ts
import { getManagerAdapter } from '../managers/integration/ManagerAdapter';

export class LlmService {
    private managerAdapter = getManagerAdapter();

    async handleUserMessageAndRespond(
        userMessage: string,
        // ... 기타 파라미터 ...
    ): Promise<void> {
        // ... 기존 LLM 호출 코드 ...

        // LLM 응답 받음
        const llmResponse = await this.callLLM(/* ... */);

        // 🆕 새로운 방법: Action Manager 사용
        if (this.managerAdapter.isActionManagerEnabled()) {
            const result = await this.managerAdapter.processLLMResponse(
                llmResponse,
                {
                    projectRoot: vscode.workspace.workspaceFolders?.[0].uri.fsPath || '',
                    workspaceRoot: vscode.workspace.workspaceFolders?.[0].uri.fsPath || '',
                    currentFile: vscode.window.activeTextEditor?.document.uri.fsPath
                }
            );

            console.log(`[LlmService] Extracted ${result.actions.length} actions`);
            console.log('[LlmService] Confidence:', result.confidence);

            // 액션 실행
            for (const action of result.actions) {
                await this.executeAction(action);
            }
        } else {
            // 기존 방법 유지
            await this.llmResponseProcessor.processLlmResponseAndApplyUpdates(/* ... */);
        }
    }

    private async executeAction(action: any): Promise<void> {
        const actionManager = this.managerAdapter.getActionManager();
        
        // 액션 검증
        const validation = await actionManager.validateAction(action);
        if (!validation.valid) {
            console.error('[LlmService] Action validation failed:', validation.errors);
            return;
        }

        // 액션 실행
        const result = await actionManager.executeAction(action);
        console.log('[LlmService] Action result:', result);
    }
}
```

#### 3.2 명령어 실행 (Execution Manager)

```typescript
// src/ai/llmService.ts 또는 src/terminal/terminalManager.ts

import { getManagerAdapter } from '../managers/integration/ManagerAdapter';

async function executeCommand(command: string, cwd?: string): Promise<void> {
    const managerAdapter = getManagerAdapter();

    // 🆕 새로운 방법: Execution Manager 사용
    if (managerAdapter.isExecutionManagerEnabled()) {
        const result = await managerAdapter.executeCommand(command, {
            cwd,
            timeout: 300000 // 5분
        });

        if (result.success) {
            console.log('[Success]', result.stdout);
        } else {
            console.error('[Error]', result.stderr);
        }

        return;
    }

    // 기존 방법 유지
    // ... 기존 processRunner 사용 코드 ...
}
```

#### 3.3 터미널에서 명령어 실행 (Terminal Manager)

```typescript
import { getManagerAdapter } from '../managers/integration/ManagerAdapter';

async function runInTerminal(command: string, cwd?: string): Promise<void> {
    const managerAdapter = getManagerAdapter();

    // 🆕 새로운 방법: Terminal Manager 사용
    if (managerAdapter.isTerminalManagerEnabled()) {
        const result = await managerAdapter.executeInTerminal(command, {
            cwd,
            createNew: false, // 기존 터미널 재사용
            captureOutput: true // 출력 캡처
        });

        console.log('[Terminal] Session:', result.sessionId);
        console.log('[Terminal] Command:', result.commandId);

        return;
    }

    // 기존 방법 유지
    // ... 기존 terminalManager 사용 코드 ...
}
```

---

## 사용 예제

### 예제 1: LLM 응답에서 액션 추출

```typescript
import { getManagerAdapter } from './managers/integration/ManagerAdapter';

const managerAdapter = getManagerAdapter();

// LLM 응답
const llmResponse = `
Create a new file src/utils/helper.ts with the following code:

\`\`\`typescript:src/utils/helper.ts
export function formatDate(date: Date): string {
    return date.toISOString();
}
\`\`\`

Then run:
\`\`\`bash
npm install
\`\`\`
`;

// 액션 추출
const result = await managerAdapter.processLLMResponse(
    llmResponse,
    {
        projectRoot: '/path/to/project',
        workspaceRoot: '/path/to/project'
    }
);

console.log('Actions:', result.actions);
// [
//   { type: 'code_generation', params: { filePath: 'src/utils/helper.ts', code: '...' } },
//   { type: 'terminal_command', params: { command: 'npm install' } }
// ]
```

### 예제 2: 명령어 실행 및 출력 캡처

```typescript
const managerAdapter = getManagerAdapter();

// 명령어 실행
const result = await managerAdapter.executeCommand('npm run build', {
    cwd: '/path/to/project',
    timeout: 60000
});

if (result.success) {
    console.log('Build successful!');
    console.log('Output:', result.stdout);
} else {
    console.error('Build failed!');
    console.error('Error:', result.stderr);
}

console.log('Duration:', result.duration, 'ms');
```

### 예제 3: 장기 실행 프로세스

```typescript
const managerAdapter = getManagerAdapter();

// 개발 서버 시작
const { pid, sessionId } = await managerAdapter.startLongRunningProcess(
    'npm run dev',
    { cwd: '/path/to/project' }
);

console.log('Dev server started:');
console.log('  PID:', pid);
console.log('  Terminal Session:', sessionId);

// 나중에 중지
const executionManager = managerAdapter.getExecutionManager();
await executionManager.stopProcess(pid);
```

### 예제 4: 에러 감지

```typescript
const managerAdapter = getManagerAdapter();
const executionManager = managerAdapter.getExecutionManager();

// 명령어 실행
const result = await managerAdapter.executeCommand('npm start');

// 에러 감지
const error = executionManager.detectError(result.stderr);
if (error) {
    console.log('Error detected:');
    console.log('  Type:', error.type);
    console.log('  Severity:', error.severity);
    console.log('  Message:', error.message);
    
    if (error.details?.suggestion) {
        console.log('  Suggestion:', error.details.suggestion);
    }
}

// 포트 충돌 감지
const portConflict = executionManager.detectPortConflict(result.stderr);
if (portConflict) {
    console.log(`Port ${portConflict.port} is already in use!`);
}
```

### 예제 5: 터미널 히스토리 조회

```typescript
const managerAdapter = getManagerAdapter();
const terminalManager = managerAdapter.getTerminalManager();
const history = terminalManager.getHistory();

// 최근 명령어
const recent = history.getRecent(10);
console.log('Recent commands:', recent);

// 가장 많이 사용된 명령어
const mostUsed = history.getMostUsed(5);
console.log('Most used:', mostUsed);

// 실패한 명령어
const failed = history.getFailed();
console.log('Failed commands:', failed);
```

---

## 마이그레이션 체크리스트

### Phase 1: 초기화 ✅
- [x] `ManagerAdapter` import
- [x] `extension.ts`에 초기화 코드 추가
- [x] 설정 확인 (useActionManager, useExecutionManager, useTerminalManager)

### Phase 2: LLM 응답 처리 마이그레이션
- [ ] `llmService.ts`의 `handleUserMessageAndRespond` 수정
- [ ] Action Manager를 통한 액션 추출 구현
- [ ] 기존 `llmResponseProcessor` 호출과 병행 실행
- [ ] 결과 비교 및 검증

### Phase 3: 명령어 실행 마이그레이션
- [ ] `terminalManager.ts`의 명령어 실행 로직 수정
- [ ] Execution Manager 사용
- [ ] 출력 캡처 기능 활용
- [ ] 에러 감지 통합

### Phase 4: 터미널 관리 마이그레이션
- [ ] 기존 터미널 관리 로직 → Terminal Manager
- [ ] 세션 관리 통합
- [ ] 히스토리 기능 활용

### Phase 5: 검증 및 최적화
- [ ] End-to-end 테스트
- [ ] 성능 측정
- [ ] 메모리 사용량 확인
- [ ] 에러 핸들링 개선

### Phase 6: 기존 코드 제거 (선택사항)
- [ ] 기존 코드와 새 코드 병행 운영 검증 완료 후
- [ ] 단계적으로 기존 코드 제거
- [ ] 설정 플래그로 전환 가능하도록 유지

---

## 설정

### 매니저 활성화/비활성화

```typescript
const managerAdapter = getManagerAdapter();

// 개별 매니저 제어
managerAdapter.updateConfig({
    useActionManager: true,     // LLM 응답 → 액션 변환
    useExecutionManager: true,  // 프로세스 실행 관리
    useTerminalManager: true    // 터미널 세션 관리
});

// 현재 설정 확인
const stats = managerAdapter.getStats();
console.log('Action Manager:', stats.actionManager);
console.log('Execution Manager:', stats.executionManager);
console.log('Terminal Manager:', stats.terminalManager);
```

### 디버깅

```typescript
// 통합 통계
const stats = managerAdapter.getStats();
console.log('Manager Statistics:', stats);

// 개별 매니저 상태
const actionManager = managerAdapter.getActionManager();
console.log('Active Actions:', actionManager.getActiveActions());

const executionManager = managerAdapter.getExecutionManager();
console.log('Running Processes:', executionManager.getRunningProcesses());

const terminalManager = managerAdapter.getTerminalManager();
console.log('Active Terminals:', terminalManager.getActiveTerminals());
```

---

## 문제 해결

### Q: 기존 코드가 동작하지 않아요
**A**: `ManagerAdapter`의 설정을 확인하세요. 기본값은 모두 활성화되어 있지만, 개별적으로 비활성화할 수 있습니다.

```typescript
managerAdapter.updateConfig({
    useActionManager: false // 기존 방식 사용
});
```

### Q: 성능이 저하되었어요
**A**: 새로운 시스템은 추가 검증 및 로깅을 수행합니다. 프로덕션 환경에서는 로깅 레벨을 조정하세요.

### Q: 액션이 추출되지 않아요
**A**: LLM 응답 형식을 확인하세요. ActionMapper는 다음 패턴을 인식합니다:
- 코드 블록: ` ```typescript:path/to/file.ts ... ``` `
- 명령어: ` ```bash ... ``` ` 또는 `Run: \`command\``
- 파일 작업: "Create file", "Delete file", "Rename ... to ..."

---

## 다음 단계

1. **통합 테스트 작성**: 새로운 매니저 시스템의 통합 테스트
2. **문서화**: 각 매니저의 상세 API 문서
3. **나머지 매니저 구현**: Task, Context, State, Error, Model Manager
4. **UI 통합**: 매니저 상태를 VS Code UI에 표시

---

## 참고 자료

- [아키텍처 리팩토링 계획](./ARCHITECTURE_REFACTORING.md)
- [리팩토링 진행 상황](./REFACTORING_PROGRESS.md)
- [Action Manager 타입](./src/managers/action/types.ts)
- [Execution Manager 타입](./src/managers/execution/types.ts)
- [Terminal Manager 타입](./src/managers/terminal/types.ts)

