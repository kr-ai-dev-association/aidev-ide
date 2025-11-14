# LLM 코드 생성 → TASK 생성 → 큐 실행 전체 흐름 인수인계 문서

## 📋 목차
1. [전체 아키텍처 개요](#1-전체-아키텍처-개요)
2. [단계별 상세 흐름](#2-단계별-상세-흐름)
3. [데이터 구조](#3-데이터-구조)
4. [핵심 설정값과 플래그](#4-핵심-설정값과-플래그)
5. [에러 처리 및 예외 상황](#5-에러-처리-및-예외-상황)
6. [주의사항 및 트러블슈팅](#6-주의사항-및-트러블슈팅)

---

## 1. 전체 아키텍처 개요

### 1.1 두 가지 큐 시스템

이 시스템은 **두 개의 독립적인 큐**를 운영합니다:

1. **PlanQueueService (작업 목록 큐)**
   - 위치: `src/services/planQueueService.ts`
   - 용도: LLM이 생성한 Plan을 파싱하여 TASK 목록으로 관리
   - 상태: `pending` → `in_progress` → `done`/`failed`
   - UI 표시용 (사용자에게 작업 진행 상황을 보여줌)

2. **TerminalManager 큐 (실행 큐)**
   - 위치: `src/terminal/terminalManager.ts`
   - 용도: 실제 파일 작업과 터미널 명령어 실행
   - 두 개의 큐: `_priorityQueue`, `_normalQueue`
   - 실제 작업 수행용

### 1.2 주요 컴포넌트

```
┌─────────────────────────────────────────────────────────────┐
│                    사용자 입력 (Webview)                      │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  LlmService.handleUserMessageAndRespond()                    │
│  - 의도 분석 (IntentDetectionService)                        │
│  - 컨텍스트 수집 (CodebaseContextService)                    │
│  - Plan 생성 (LLM 호출)                                      │
│  - Plan 파싱 → PlanQueueService에 추가                       │
│  - 코드 생성 (LLM 호출)                                      │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  LlmResponseProcessor.processLlmResponseAndApplyUpdates()    │
│  - 파일 작업 파싱 (새 파일, 수정 파일, 삭제 파일)            │
│  - Bash 명령어 추출                                          │
│  - autoUpdateEnabled에 따라 즉시 실행 또는 큐 추가           │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  TerminalManager.enqueueCommandsBatch()                      │
│  - 파일 작업 → FILE_OP_PREFIX 토큰 변환                      │
│  - 명령어 → 실행 큐에 추가                                   │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  TerminalManager.processQueue()                              │
│  - 큐에서 순차적으로 꺼내기                                  │
│  - 파일 작업: executeFileOpFromToken()                       │
│  - 명령어: handleInteractiveCommand()                        │
│  - PlanQueueService 상태 업데이트                            │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. 단계별 상세 흐름

### 2.1 단계 1: 사용자 입력 및 초기화

**위치**: `src/ai/llmService.ts` - `handleUserMessageAndRespond()`

**처리 내용**:

```typescript
// 1. AbortController 생성 (취소 가능하도록)
this.currentCallController = new AbortController();
const abortSignal = this.currentCallController.signal;

// 2. Webview에 로딩 표시
safePostMessage(webviewToRespond, { command: 'showLoading' });

// 3. 시스템 정보 수집
- OS 정보
- 현재 사용 중인 모델명
- 프로젝트 루트 경로
```

**중요 포인트**:
- `abortSignal`은 모든 비동기 작업에 전달되어 취소 가능하게 함
- Webview 통신은 `safePostMessage` 유틸리티 사용

---

### 2.2 단계 2: 의도 분석 (Intent Detection)

**위치**: `src/ai/llmService.ts` - `handleUserMessageAndRespond()`

**처리 내용**:

```typescript
// IntentDetectionService를 통해 사용자 질의 분석
intentResult = await this.intentDetectionService.detectIntent(userQuery);

// 결과 예시:
{
  category: 'code',
  subtype: 'code_generate',
  taskType: 'code_generation',
  confidence: 0.9,
  reasoning: '사용자가 새 프로젝트 생성을 요청함'
}
```

**의도 타입**:
- `code_generate`: 새 코드 생성
- `code_modify`: 기존 코드 수정
- `code_remove`: 코드 삭제
- `execution_install`: 설치 명령
- `execution_build`: 빌드 명령
- `execution_run`: 실행 명령
- `analysis_*`: 분석 작업
- `documentation_*`: 문서 작성

**중요 포인트**:
- 의도 분석 결과는 이후 Plan 생성과 코드 생성에 영향을 줌
- `code` 카테고리인 경우에만 파일 컨텍스트 수집

---

### 2.3 단계 3: 컨텍스트 수집

**위치**: `src/ai/llmService.ts` - `handleUserMessageAndRespond()`

**처리 내용**:

```typescript
// CodebaseContextService를 통해 관련 파일 찾기
relevantContextResult = await this.codebaseContextService.getRelevantFilesContext(
  userQuery, 
  abortSignal, 
  history, 
  intentResult
);

// 결과:
{
  fileContentsContext: string,        // 파일 내용들
  includedFilesForContext: Array<{    // 포함된 파일 목록
    name: string,
    fullPath: string
  }>,
  extractedKeywords: string[],        // 추출된 키워드
  selectedKeywords: {                 // 선택된 키워드
    keywords: string[],
    reasoning: string,
    confidence: number
  }
}
```

**중요 포인트**:
- 키워드 기반으로 관련 파일을 자동 검색
- `code` 카테고리가 아닌 경우 컨텍스트 수집 생략
- 파일 내용이 너무 길면 토큰 제한 체크

---

### 2.4 단계 4: Plan 생성 (작업 계획)

**위치**: `src/ai/llmService.ts` - `handleUserMessageAndRespond()`

**처리 내용**:

```typescript
// Plan 프롬프트 생성
const planPrompt = await this.buildPlanPrompt(
  userQuery, 
  relevantContextResult.selectedKeywords.keywords, 
  this.userOS, 
  await this.getCurrentModelName(), 
  includedFilesForContext
);

// 시스템 프롬프트: 반드시 체크박스 형식으로 출력하도록 지시
const systemPromptForPlan = `
**매우 중요: 반드시 체크박스 형식으로 출력하세요.**
- 올바른 형식: "- [ ] 작업 내용"
- 잘못된 형식: "- 작업 내용", "1. 작업" 등
`;

// LLM 호출
planText = await this.ollamaApi.sendMessageWithSystemPrompt(
  systemPromptForPlan, 
  [{ text: planPrompt }], 
  { signal: abortSignal }
);
```

**LLM 응답 예시**:
```markdown
- [ ] 프로젝트 구조 확인
- [ ] package.json 생성
- [ ] 기본 파일 생성
- [ ] 의존성 설치
- [ ] 빌드 테스트
```

**중요 포인트**:
- Plan은 **코드 블록이나 명령어를 포함하지 않음** (작업 설명만)
- 체크박스 형식(`- [ ]`)을 강제함
- Plan 생성 실패해도 코드 생성은 계속 진행

---

### 2.5 단계 5: Plan 파싱 및 TASK 큐에 추가

**위치**: `src/ai/llmService.ts` - `parseCheckboxItemsFromPlan()`

**처리 내용**:

```typescript
// Plan 텍스트에서 체크박스 항목 파싱
let itemsToEnqueue = this.parseCheckboxItemsFromPlan(planText);

// 파싱 로직:
// 1. 줄 단위로 분리
// 2. 정규식으로 체크박스 패턴 매칭:
//    - "- [ ] 작업" (가장 일반적)
//    - "- [x] 작업" (완료된 작업)
//    - "* [ ] 작업" (별표 형식)
//    - "1. [ ] 작업" (번호 형식)
//    - "- ✅ 작업" (이모지 형식)
// 3. 최대 20개 항목까지 파싱
// 4. 제목이 100자 초과 시 자동 잘림

// PlanQueueService에 추가
if (!this.planQueueService && this.extensionContext) {
  this.planQueueService = new PlanQueueService(this.extensionContext);
}

// 기존 큐 초기화 (새로운 Plan 생성 시)
this.planQueueService.clear();

// 큐에 추가
this.planQueueService.enqueue(itemsToEnqueue, 'pending');
```

**PlanQueueService.enqueue() 내부**:

```typescript
public enqueue(items: Omit<PlanItem, 'id' | 'status' | 'createdAt'>[], 
               defaultStatus: PlanItemStatus = 'pending'): number {
  const now = Date.now();
  const added: PlanItem[] = items.map((it) => ({
    id: 'plan_' + Math.random().toString(36).slice(2) + now.toString(36),
    title: it.title,
    detail: it.detail,
    status: defaultStatus,  // 'pending'
    createdAt: now
  }));
  this.queue.push(...added);
  this.persist();  // VS Code globalState에 저장
  return added.length;
}
```

**중요 포인트**:
- 각 TASK에 고유 ID 부여 (`plan_` + 랜덤 문자열)
- 상태는 기본값 `pending`
- VS Code `globalState`에 영구 저장 (확장 프로그램 재시작 후에도 유지)
- Webview에 `updateTaskQueue` 메시지 전송하여 UI 업데이트

---

### 2.6 단계 6: 코드 생성 (LLM 호출)

**위치**: `src/ai/llmService.ts` - `handleUserMessageAndRespond()`

**처리 내용**:

```typescript
// 시스템 프롬프트 생성
const systemPrompt = await this.generateSystemPrompt(
  promptType,              // CODE_GENERATION 또는 GENERAL_ASK
  fullFileContentsContext, // 파일 컨텍스트
  realTimeInfo,            // 실시간 정보 (터미널 로그 등)
  profileContext,          // 프로젝트 프로필
  intentContext            // 의도 컨텍스트
);

// 사용자 메시지 구성
const userParts = [
  { text: historyContext },  // 대화 기록
  { text: userQuery },        // 현재 질문
  // 이미지가 있으면 추가
];

// LLM 호출
llmResponse = await this.ollamaApi.sendMessageWithSystemPrompt(
  systemPrompt,
  userParts,
  { signal: abortSignal }
);
```

**LLM 응답 형식**:
```markdown
새 파일: src/index.js
```javascript
console.log('Hello World');
```

수정 파일: src/package.json
```json
{
  "name": "my-project",
  "version": "1.0.0"
}
```

```bash
npm install
npm run build
```
```

**중요 포인트**:
- `CODE_GENERATION` 타입일 때만 파일 작업 지시어 포함
- `GENERAL_ASK` 타입은 질의응답만 (파일 작업 금지)
- 토큰 제한 체크 수행

---

### 2.7 단계 7: LLM 응답 파싱

**위치**: `src/ai/llmResponseProcessor.ts` - `processLlmResponseAndApplyUpdates()`

**처리 내용**:

#### 7.1 파일 작업 파싱

```typescript
// 정규식으로 파일 작업 추출
const codeBlockRegex = /(?:##\s*)?(새 파일|수정 파일):\s*([^\r\n]+?)(?:\s*\r?\n\s*\r?\n|\s*\r?\n)\s*```[^\n]*\r?\n([\s\S]*?)\r?\n```/g;

let match;
while ((match = codeBlockRegex.exec(llmResponse)) !== null) {
  const originalDirective = match[1].trim();  // "새 파일" 또는 "수정 파일"
  let llmSpecifiedPath = match[2].trim();     // "src/index.js"
  const newContent = match[3];                 // 코드 블록 내용
  
  // 경로 정규화 및 검증
  llmSpecifiedPath = this.cleanFilePath(llmSpecifiedPath);
  const pathValidation = this.validateFilePath(llmSpecifiedPath);
  
  // 절대 경로로 변환
  if (originalDirective === '수정 파일') {
    // 컨텍스트 파일 목록에서 찾기
    const matchedFile = contextFiles.find(f => 
      f.name === fileName || f.fullPath.endsWith(llmSpecifiedPath)
    );
    absolutePath = matchedFile?.fullPath;
  } else if (originalDirective === '새 파일') {
    // 프로젝트 루트 기준으로 절대 경로 생성
    absolutePath = path.join(projectRoot, llmSpecifiedPath);
  }
  
  // FileOperation 객체 생성
  fileOperations.push({
    type: operationType,      // 'create' | 'modify' | 'delete'
    originalDirective,        // "새 파일" | "수정 파일" | "삭제 파일"
    llmSpecifiedPath,         // LLM이 지정한 경로
    absolutePath,             // 절대 경로
    newContent                // 파일 내용
  });
}
```

#### 7.2 삭제 파일 파싱

```typescript
const deleteFileRegex = /삭제 파일:\s+(.+?)(?:\r?\n|$)/g;
while ((match = deleteFileRegex.exec(llmResponse)) !== null) {
  const llmSpecifiedPath = match[1].trim();
  // ... 경로 검증 및 절대 경로 변환
  fileOperations.push({
    type: 'delete',
    originalDirective: '삭제 파일',
    llmSpecifiedPath,
    absolutePath
    // newContent는 삭제 작업에서 불필요
  });
}
```

#### 7.3 Bash 명령어 추출

**위치**: `src/terminal/terminalManager.ts` - `extractBashCommandsFromLlmResponse()`

```typescript
export function extractBashCommandsFromLlmResponse(llmResponse: string): string[] {
  const commands: string[] = [];
  const bashBlockRegex = /```bash\s*\n([\s\S]*?)\n```/g;
  const pwshBlockRegex = /```(?:powershell|pwsh)\s*\n([\s\S]*?)\n```/g;
  const cmdBlockRegex = /```(?:cmd|batch|bat)\s*\n([\s\S]*?)\n```/g;
  
  // 각 코드 블록에서 명령어 추출
  let match;
  while ((match = bashBlockRegex.exec(llmResponse)) !== null) {
    const block = match[1].trim();
    const lines = block.split('\n');
    
    // 주석 제거, 빈 줄 제거
    for (const raw of lines) {
      const line = removeInlineComment(raw.trim());
      if (!line || line.startsWith('#')) continue;
      
      // if 문 처리 (중첩 if 지원)
      // ... 복잡한 로직 ...
      
      commands.push(line);
    }
  }
  
  return commands;
}
```

**중요 포인트**:
- 모델별로 다른 정규식 사용 (GPT-OSS, DeepSeek, 표준 모델)
- 마크다운 파일은 별도 처리 (코드 블록 없이 내용 직접 포함)
- DIFF callout도 별도 처리
- 경로 검증 및 정규화 필수

---

### 2.8 단계 8: 파일 작업 실행 방식 결정

**위치**: `src/ai/llmResponseProcessor.ts` - `processLlmResponseAndApplyUpdates()`

**핵심 설정**: `autoUpdateEnabled`

```typescript
const autoUpdateEnabled = await this.configurationService.isAutoUpdateEnabled();
```

#### 8.1 autoUpdateEnabled = true (자동 업데이트)

**즉시 실행**:

```typescript
// 파일 작업 즉시 실행
for (const operation of processedFileOperations) {
  const fileUri = vscode.Uri.file(operation.absolutePath);
  
  if (operation.type === 'create' || operation.type === 'modify') {
    // 디렉토리 생성 (필요 시)
    const dirPath = path.dirname(fileUri.fsPath);
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(dirPath));
    
    // 파일 쓰기
    await vscode.workspace.fs.writeFile(
      fileUri, 
      Buffer.from(operation.newContent || '', 'utf8')
    );
  } else if (operation.type === 'delete') {
    await vscode.workspace.fs.delete(fileUri);
  }
}

// Bash 명령어도 즉시 실행 (autoExecuteEnabled가 true인 경우)
const autoExecuteEnabled = await this.configurationService.isAutoExecuteCommandsEnabled();
if (autoExecuteEnabled && hasBashCommands(llmResponse)) {
  const commands = extractBashCommandsFromLlmResponse(llmResponse);
  enqueueCommandsBatch(commands, true);  // 우선순위 큐에 추가
}
```

#### 8.2 autoUpdateEnabled = false (수동 확인)

**사용자 확인 후 실행**:

```typescript
for (const operation of processedFileOperations) {
  // 사용자에게 확인 요청
  const userChoice = await vscode.window.showInformationMessage(
    `AI가 '${fileName}' 파일 ${operationTypeText}을(를) 제안했습니다.`,
    { modal: true },
    "적용",  // 또는 "생성", "삭제"
    "Diff 보기",  // 수정인 경우
    "취소"
  );
  
  if (userChoice === "적용") {
    // 사용자가 승인한 경우에만 실행
    await vscode.workspace.fs.writeFile(fileUri, Buffer.from(operation.newContent, 'utf8'));
  }
}

// 파일 작업을 큐에 추가 (사용자가 나중에 실행할 수 있도록)
if (!autoUpdateEnabled) {
  const fileOpTokens = buildFileOpTokens(processedFileOperations.map(op => ({
    type: op.type,
    path: op.absolutePath,
    content: op.newContent
  })));
  const bashCommands = extractBashCommandsFromLlmResponse(llmResponse);
  const combined = [...fileOpTokens, ...bashCommands];
  enqueueCommandsBatch(combined, true);  // 큐에 추가
}
```

**중요 포인트**:
- `autoUpdateEnabled = true`: 즉시 실행, 사용자 확인 없음
- `autoUpdateEnabled = false`: 사용자 확인 후 실행 또는 큐에 추가
- Remote SSH 환경 고려 (경로 처리, URI 스키마)

---

### 2.9 단계 9: 파일 작업 토큰 변환

**위치**: `src/terminal/terminalManager.ts` - `buildFileOpTokens()`

**처리 내용**:

```typescript
const FILE_OP_PREFIX = '__AIDEV_FILE_OP__::';

export function buildFileOpTokens(ops: { 
  type: 'create' | 'modify' | 'delete'; 
  path: string; 
  content?: string 
}[]): string[] {
  return ops.map(op => {
    // JSON 직렬화 → Base64 인코딩 → 프리픽스 추가
    const json = JSON.stringify(op);
    const base64 = Buffer.from(json, 'utf8').toString('base64');
    return FILE_OP_PREFIX + base64;
  });
}

// 예시:
// 입력: { type: 'create', path: '/path/to/file.js', content: 'console.log("hello");' }
// 출력: '__AIDEV_FILE_OP__::eyJ0eXBlIjoiY3JlYXRlIiwicGF0aCI6Ii9wYXRoL3RvL2ZpbGUuanMiLCJjb250ZW50IjoiY29uc29sZS5sb2coImhlbGxvIik7In0='
```

**중요 포인트**:
- 파일 작업과 일반 명령어를 구분하기 위한 특수 토큰 사용
- Base64 인코딩으로 바이너리 안전성 보장
- 큐에서 토큰을 다시 디코딩하여 실행

---

### 2.10 단계 10: 실행 큐에 추가

**위치**: `src/terminal/terminalManager.ts` - `enqueueCommandsBatch()`

**처리 내용**:

```typescript
export function enqueueCommandsBatch(
  commands: string[], 
  priority = false, 
  projectRoot?: string
): void {
  // 로깅
  const channel = getCaptureOutputChannel();
  const timestamp = new Date().toLocaleString();
  
  // 파일 작업과 명령어 분리
  let fileOps: { type: string; path: string; size?: number }[] = [];
  const bash: string[] = [];
  
  for (const c of commands) {
    if (typeof c === 'string' && c.startsWith(FILE_OP_PREFIX)) {
      // 파일 작업 토큰 디코딩
      const b64 = c.substring(FILE_OP_PREFIX.length);
      const decoded = Buffer.from(b64, 'base64').toString('utf8');
      const payload = JSON.parse(decoded);
      fileOps.push({ 
        type: payload.type, 
        path: payload.path, 
        size: (payload.content || '').length 
      });
    } else {
      bash.push(String(c));
    }
  }
  
  // OUTPUT 채널에 로그 기록
  channel.appendLine(`\n===== Queue Enqueue (${timestamp}) =====`);
  channel.appendLine(`Priority: ${priority ? 'yes' : 'no'} | Items: ${commands.length}`);
  channel.appendLine(`fileOps: ${fileOps.length} | bash: ${bash.length}`);
  
  // 실제 큐에 추가
  enqueueCommands(commands, priority);
}

function enqueueCommands(commands: string[], priority = false): void {
  if (priority) {
    _priorityQueue = commands.concat(_priorityQueue);  // 앞에 추가
  } else {
    _normalQueue = _normalQueue.concat(commands);      // 뒤에 추가
  }
  processQueue();  // 큐 처리 시작
}
```

**중요 포인트**:
- `priority = true`: 우선순위 큐 (`_priorityQueue`)에 추가 (앞에 삽입)
- `priority = false`: 일반 큐 (`_normalQueue`)에 추가 (뒤에 추가)
- 큐에 추가하면 자동으로 `processQueue()` 호출

---

### 2.11 단계 11: 큐 처리 및 실행

**위치**: `src/terminal/terminalManager.ts` - `processQueue()`

**처리 내용**:

```typescript
async function processQueue(): Promise<void> {
  // 중복 실행 방지
  if (_isProcessingQueue) return;
  _isProcessingQueue = true;
  
  try {
    // 우선순위 큐 → 일반 큐 순서로 처리
    while (_priorityQueue.length > 0 || _normalQueue.length > 0) {
      // 큐에서 항목 꺼내기
      const command = _priorityQueue.length > 0 
        ? _priorityQueue.shift()! 
        : _normalQueue.shift()!;
      
      // 로깅
      const channel = getCaptureOutputChannel();
      const ts = new Date().toLocaleTimeString();
      
      if (typeof command === 'string' && command.startsWith(FILE_OP_PREFIX)) {
        // ===== 파일 작업 처리 =====
        channel.appendLine(`[QUEUE] (${ts}) Dequeue FILE-OP: ${payload.type} ${payload.path}`);
        
        const ok = await executeFileOpFromToken(command);
        if (!ok) {
          channel.appendLine(`[QUEUE] stop: file-op failed`);
          break;  // 실패 시 중단
        }
      } else {
        // ===== 터미널 명령어 처리 =====
        channel.appendLine(`[QUEUE] (${ts}) Dequeue CMD: ${String(command)}`);
        
        // PlanQueueService 상태 업데이트: pending → in_progress
        let processingItemId: string | undefined = undefined;
        if (_planQueueService && _currentWebview) {
          const queueItems = _planQueueService.list();
          const firstPendingItem = queueItems.find(item => item.status === 'pending');
          if (firstPendingItem) {
            processingItemId = firstPendingItem.id;
            _planQueueService.updateStatus(firstPendingItem.id, 'in_progress');
            
            // Webview에 상태 업데이트 전송
            safePostMessage(_currentWebview, {
              command: 'taskQueueUpdate',
              item: { id: firstPendingItem.id, status: 'in_progress' }
            });
            safePostMessage(_currentWebview, {
              command: 'updateTaskQueue',
              items: _planQueueService.list()
            });
          }
        }
        
        // 명령어 실행
        const projectRoot = await getEffectiveCwd();  // 워크스페이스 루트
        const ok = await handleInteractiveCommand(command, projectRoot);
        
        // PlanQueueService 상태 업데이트: in_progress → done/failed
        if (_planQueueService && _currentWebview && processingItemId) {
          const newStatus = ok ? 'done' : 'failed';
          _planQueueService.updateStatus(processingItemId, newStatus);
          
          safePostMessage(_currentWebview, {
            command: 'taskQueueUpdate',
            item: { id: processingItemId, status: newStatus }
          });
          safePostMessage(_currentWebview, {
            command: 'updateTaskQueue',
            items: _planQueueService.list()
          });
        }
        
        if (!ok) {
          channel.appendLine(`[QUEUE] stop: command failed or cancelled`);
          break;  // 실패 시 중단
        }
      }
      
      // 장기 실행 명령 감지 (dev server 등)
      if (isLongRunningDevCommand(command)) {
        _queuePausedForLongRunning = true;
        channel.appendLine(`[QUEUE] paused for long-running command`);
        return;  // 큐 일시 정지
      }
    }
  } finally {
    _isProcessingQueue = false;
  }
}
```

#### 11.1 파일 작업 실행

**위치**: `src/terminal/terminalManager.ts` - `executeFileOpFromToken()`

```typescript
async function executeFileOpFromToken(token: string): Promise<boolean> {
  try {
    // 토큰 디코딩
    const b64 = token.substring(FILE_OP_PREFIX.length);
    const decoded = Buffer.from(b64, 'base64').toString('utf8');
    const payload = JSON.parse(decoded) as { 
      type: 'create' | 'modify' | 'delete'; 
      path: string; 
      content?: string 
    };
    
    const uri = vscode.Uri.file(payload.path);
    const channel = getCaptureOutputChannel();
    
    if (payload.type === 'delete') {
      try {
        await vscode.workspace.fs.delete(uri);
        channel.appendLine(`[FILE-OP] deleted: ${payload.path}`);
      } catch (e: any) {
        // 파일이 없으면 무시 (이미 삭제됨)
        if (/ENOENT|not exist|FileNotFound/i.test(e?.message)) {
          channel.appendLine(`[FILE-OP] delete skipped (not found): ${payload.path}`);
          return true;  // 성공으로 처리
        }
        throw e;
      }
    } else {
      // create 또는 modify
      // 디렉토리 생성 (필요 시)
      const dir = path.dirname(payload.path);
      await vscode.workspace.fs.createDirectory(vscode.Uri.file(dir));
      
      // 파일 쓰기
      if (payload.content === undefined) {
        channel.appendLine(`[FILE-OP] skipped: ${payload.type} ${payload.path} (no content provided)`);
        return false;
      }
      
      await vscode.workspace.fs.writeFile(
        uri, 
        Buffer.from(payload.content, 'utf8')
      );
      channel.appendLine(`[FILE-OP] ${payload.type}: ${payload.path} (${payload.content.length} bytes)`);
    }
    
    return true;
  } catch (e: any) {
    const channel = getCaptureOutputChannel();
    channel.appendLine(`[FILE-OP] failed: ${e?.message || String(e)}`);
    return false;
  }
}
```

#### 11.2 터미널 명령어 실행

**위치**: `src/terminal/terminalManager.ts` - `handleInteractiveCommand()`

```typescript
async function handleInteractiveCommand(
  command: string, 
  projectRoot?: string
): Promise<boolean> {
  // 대화형 명령어 감지
  const isInteractive = isInteractiveCommand(command);
  
  if (isInteractive) {
    // 통합 터미널 사용
    const terminal = getAidevIdeTerminal(projectRoot);
    terminal.show();
    terminal.sendText(command);
    // 대화형 명령은 완료 여부를 알 수 없으므로 true 반환
    return true;
  } else {
    // 비대화형 명령: 데몬을 통해 실행
    const daemonClient = getTerminalDaemonClient();
    const result = await daemonClient.runCommand(command, projectRoot);
    return result.exitCode === 0;
  }
}
```

**중요 포인트**:
- 파일 작업은 항상 `vscode.workspace.fs` API 사용 (Remote SSH 지원)
- 명령어는 대화형/비대화형 구분하여 처리
- 장기 실행 명령(`npm run dev` 등) 감지 시 큐 일시 정지
- 실패 시 즉시 중단 (나머지 큐는 유지)

---

## 3. 데이터 구조

### 3.1 PlanItem (작업 큐 아이템)

**위치**: `src/services/planQueueService.ts`

```typescript
export type PlanItemStatus = 'pending' | 'in_progress' | 'done' | 'failed' | 'skipped';

export interface PlanItem {
  id: string;              // 'plan_' + 랜덤 문자열
  title: string;           // 작업 제목 (최대 100자)
  detail?: string;         // 상세 설명 (선택)
  status: PlanItemStatus;  // 현재 상태
  createdAt: number;       // 생성 시간 (타임스탬프)
}
```

### 3.2 FileOperation (파일 작업)

**위치**: `src/ai/llmResponseProcessor.ts`

```typescript
interface FileOperation {
  type: 'modify' | 'create' | 'delete';
  originalDirective: string;    // "수정 파일" | "새 파일" | "삭제 파일"
  llmSpecifiedPath: string;     // LLM이 지정한 경로 (상대 경로)
  absolutePath: string;         // 절대 경로
  newContent?: string;          // 파일 내용 (delete 시 undefined)
}
```

### 3.3 큐 항목 형식

**파일 작업 토큰**:
```
__AIDEV_FILE_OP__::<base64_encoded_json>
```

**일반 명령어**:
```
npm install
npm run build
```

---

## 4. 핵심 설정값과 플래그

### 4.1 ConfigurationService 설정

```typescript
// 자동 파일 업데이트
const autoUpdateEnabled = await configurationService.isAutoUpdateEnabled();

// 자동 명령어 실행
const autoExecuteEnabled = await configurationService.isAutoExecuteCommandsEnabled();

// 프로젝트 루트
const projectRoot = await configurationService.getProjectRoot();
```

### 4.2 TerminalManager 전역 변수

```typescript
let _priorityQueue: string[] = [];        // 우선순위 큐
let _normalQueue: string[] = [];          // 일반 큐
let _isProcessingQueue = false;           // 큐 처리 중 플래그
let _queuePausedForLongRunning = false;   // 장기 실행으로 인한 일시 정지
let _planQueueService: PlanQueueService | undefined;  // 작업 큐 서비스
let _currentWebview: vscode.Webview | undefined;      // 현재 Webview
```

### 4.3 상수

```typescript
const FILE_OP_PREFIX = '__AIDEV_FILE_OP__::';  // 파일 작업 토큰 프리픽스
const MAX_ERROR_RETRIES = 5;                    // 최대 에러 재시도 횟수
```

---

## 5. 에러 처리 및 예외 상황

### 5.1 파일 작업 에러

**권한 에러**:
```typescript
if (err.message.includes('permission') || err.message.includes('EACCES')) {
  const permissionMsg = isWindows
    ? 'Windows에서는 VS Code를 관리자 권한으로 실행하거나 대상 폴더의 쓰기 권한을 부여하세요.'
    : 'Remote SSH/로컬 환경에서 파일 권한(chmod/chown)과 소유자를 확인해주세요.';
  this.notificationService.showErrorMessage(`aidev-ide: ${permissionMsg}`);
}
```

**파일 없음 에러**:
```typescript
if (err.message.includes('ENOENT') || err.message.includes('not found')) {
  // 삭제 작업의 경우 무시 (이미 삭제됨)
  // 생성/수정 작업의 경우 에러 처리
}
```

### 5.2 큐 처리 에러

**파일 작업 실패**:
- `executeFileOpFromToken()`이 `false` 반환
- 큐 처리 즉시 중단 (`break`)
- 나머지 큐 항목은 유지 (사용자가 수동으로 재시도 가능)

**명령어 실행 실패**:
- `handleInteractiveCommand()`가 `false` 반환
- PlanQueueService 상태를 `failed`로 업데이트
- 큐 처리 즉시 중단

### 5.3 LLM 응답 파싱 에러

**경로 검증 실패**:
```typescript
const pathValidation = this.validateFilePath(llmSpecifiedPath);
if (!pathValidation.isValid) {
  console.error(`파일 경로 검증 실패: ${pathValidation.error}`);
  continue;  // 해당 파일 작업 건너뛰기
}
```

**파일을 찾을 수 없음 (수정 작업)**:
```typescript
if (originalDirective === '수정 파일') {
  const matchedFile = contextFiles.find(/* ... */);
  if (!matchedFile) {
    const warnMsg = `AI가 수정을 제안한 파일을 컨텍스트 목록에서 찾을 수 없습니다.`;
    safePostMessage(webview, { command: 'receiveMessage', text: warnMsg });
    continue;  // 해당 파일 작업 건너뛰기
  }
}
```

---

## 6. 주의사항 및 트러블슈팅

### 6.1 중요한 주의사항

1. **두 개의 큐 시스템**
   - PlanQueueService: UI 표시용 (작업 목록)
   - TerminalManager 큐: 실제 실행용
   - 두 큐는 독립적이지만, TerminalManager가 PlanQueueService 상태를 업데이트함

2. **autoUpdateEnabled 설정**
   - `true`: 즉시 실행, 사용자 확인 없음
   - `false`: 사용자 확인 또는 큐에 추가
   - 설정에 따라 완전히 다른 흐름으로 동작

3. **Remote SSH 환경**
   - 경로 처리가 복잡함 (`vscode.Uri` 사용 필수)
   - URI 스키마 확인 (`file:` vs `vscode-remote:`)
   - 워크스페이스 루트 기준으로 경로 정규화

4. **장기 실행 명령**
   - `npm run dev` 같은 명령은 큐를 일시 정지시킴
   - 사용자가 수동으로 종료해야 큐 재개 가능

5. **Plan 생성 실패**
   - Plan 생성이 실패해도 코드 생성은 계속 진행
   - PlanQueueService에 TASK가 없어도 파일 작업/명령어는 실행됨

### 6.2 트러블슈팅

**문제: 파일 작업이 실행되지 않음**
- 확인 사항:
  1. `autoUpdateEnabled` 설정 확인
  2. 경로 검증 실패 로그 확인
  3. Remote SSH 환경인 경우 URI 스키마 확인
  4. OUTPUT 채널에서 `[FILE-OP]` 로그 확인

**문제: 명령어가 실행되지 않음**
- 확인 사항:
  1. `autoExecuteEnabled` 설정 확인
  2. `hasBashCommands()` 결과 확인
  3. `extractBashCommandsFromLlmResponse()` 파싱 결과 확인
  4. OUTPUT 채널에서 `[QUEUE]` 로그 확인

**문제: PlanQueueService 상태가 업데이트되지 않음**
- 확인 사항:
  1. `setPlanQueueService()` 호출 여부 확인
  2. `_currentWebview` 설정 여부 확인
  3. Webview 메시지 전송 로그 확인

**문제: 큐가 멈춤**
- 확인 사항:
  1. `_isProcessingQueue` 플래그 확인
  2. `_queuePausedForLongRunning` 플래그 확인
  3. 장기 실행 명령이 실행 중인지 확인
  4. 에러로 인한 중단 여부 확인 (OUTPUT 채널 로그)

### 6.3 디버깅 팁

1. **OUTPUT 채널 확인**
   - `AIDEV-IDE Terminal Capture` 채널에서 모든 큐 작업 로그 확인
   - `[QUEUE]`, `[FILE-OP]` 태그로 필터링

2. **Console 로그 확인**
   - `[LlmService]`, `[LLM Response Processor]`, `[TerminalManager]` 태그로 필터링
   - Plan 파싱, 파일 작업 파싱, 큐 처리 로그 확인

3. **Webview 메시지 확인**
   - `updateTaskQueue`, `taskQueueUpdate` 메시지 전송 여부 확인
   - Webview 개발자 도구에서 메시지 수신 확인

4. **상태 확인 함수**
   ```typescript
   // PlanQueueService 상태 확인
   const queueItems = planQueueService.list();
   console.log('Queue items:', queueItems);
   
   // TerminalManager 큐 상태 확인
   console.log('Priority queue:', _priorityQueue);
   console.log('Normal queue:', _normalQueue);
   console.log('Is processing:', _isProcessingQueue);
   ```

---

## 7. 코드 위치 요약

| 기능 | 파일 | 주요 함수/클래스 |
|------|------|-----------------|
| 사용자 입력 처리 | `src/ai/llmService.ts` | `handleUserMessageAndRespond()` |
| Plan 생성 | `src/ai/llmService.ts` | `buildPlanPrompt()`, LLM 호출 |
| Plan 파싱 | `src/ai/llmService.ts` | `parseCheckboxItemsFromPlan()` |
| 작업 큐 관리 | `src/services/planQueueService.ts` | `PlanQueueService` |
| LLM 응답 파싱 | `src/ai/llmResponseProcessor.ts` | `processLlmResponseAndApplyUpdates()` |
| 파일 작업 파싱 | `src/ai/llmResponseProcessor.ts` | 정규식 매칭 로직 |
| Bash 명령어 추출 | `src/terminal/terminalManager.ts` | `extractBashCommandsFromLlmResponse()` |
| 파일 작업 토큰 변환 | `src/terminal/terminalManager.ts` | `buildFileOpTokens()` |
| 큐에 추가 | `src/terminal/terminalManager.ts` | `enqueueCommandsBatch()` |
| 큐 처리 | `src/terminal/terminalManager.ts` | `processQueue()` |
| 파일 작업 실행 | `src/terminal/terminalManager.ts` | `executeFileOpFromToken()` |
| 명령어 실행 | `src/terminal/terminalManager.ts` | `handleInteractiveCommand()` |

---

## 8. 추가 참고사항

### 8.1 Webview 통신

모든 Webview 통신은 `safePostMessage` 유틸리티 사용:
```typescript
import { safePostMessage } from '../webview/panelUtils';

safePostMessage(webview, {
  command: 'updateTaskQueue',
  items: queueItems
});
```

### 8.2 상태 저장

PlanQueueService는 VS Code `globalState`에 저장:
```typescript
this.context.globalState.update(PlanQueueService.STORAGE_KEY, this.queue);
```

### 8.3 AbortSignal

모든 LLM 호출은 `AbortSignal`을 받아 취소 가능:
```typescript
const abortSignal = this.currentCallController.signal;
await this.ollamaApi.sendMessageWithSystemPrompt(/* ... */, { signal: abortSignal });
```

---

**문서 작성일**: 2024년
**작성자**: AI Assistant
**버전**: 1.0

