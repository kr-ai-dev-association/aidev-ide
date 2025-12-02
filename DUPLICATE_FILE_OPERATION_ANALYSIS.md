# 파일 생성/수정 중복 문제 분석

## 문제 현상
파일 생성, 수정 시 중복 생성/수정이 발생하고 있음. analyzing 또는 planning 단계에서 task가 중복으로 생성되는 것으로 보임.

## 원인 분석

### 1. 두 가지 실행 경로가 존재

#### 경로 1: ActionPlan 경로 (execution 의도)
- **위치**: `src/ai/llmService.ts` - `handleExecutionIntentWithActionPlan()`
- **조건**: `intentResult.category === 'execution'` && `autoExecute === true`
- **실행 흐름**:
  1. `ActionPlannerService.createActionPlan()` - 액션 플랜 생성
  2. `ActionExecutionEngine.executePlan()` - 플랜 실행
  3. `ActionExecutionEngine.executeCodeGeneration()` - **파일 직접 생성/수정** (245라인)
     ```typescript
     await vscode.workspace.fs.writeFile(fileUri, Buffer.from(step.content, 'utf8'));
     ```
  4. return (1189라인) - 여기서 종료되어야 함

#### 경로 2: 일반 LLM 응답 경로
- **위치**: `src/ai/llmService.ts` - `handleUserMessageAndRespond()`
- **실행 흐름**:
  1. LLM 호출하여 응답 받음
  2. `LlmResponseProcessor.processLlmResponseAndApplyUpdates()` - 응답 파싱
  3. 파일 작업 파싱 및 실행/큐 추가
  4. `enqueueCommandsBatch()` - 파일 작업을 큐에 추가

### 2. 중복 발생 시나리오

#### 시나리오 A: ActionPlan 경로 실행 후 일반 경로도 실행
```
1. 사용자 요청: "새 파일 생성해줘"
2. Intent 감지: execution 의도
3. handleExecutionIntentWithActionPlan() 호출
   - ActionPlan 생성
   - ActionExecutionEngine.executeCodeGeneration() 실행
   - 파일 생성 ✅ (첫 번째)
4. return (1189라인) - 여기서 종료되어야 하지만...
5. 일반 LLM 응답 경로도 계속 진행될 수 있음
   - LLM 응답에 파일 작업 포함
   - processLlmResponseAndApplyUpdates() 실행
   - 파일 생성 ✅ (두 번째 - 중복!)
```

#### 시나리오 B: ActionPlan의 code_generation 단계와 LLM 응답의 파일 작업이 겹침
```
1. ActionPlannerService.generateDefaultActionSteps()에서 code_generation 단계 생성
2. ActionExecutionEngine.executeCodeGeneration() 실행
   - 파일 생성 ✅
3. 동시에 LLM 응답에도 같은 파일 작업이 포함됨
4. processLlmResponseAndApplyUpdates() 실행
   - 파일 생성 ✅ (중복!)
```

### 3. 코드 위치

#### ActionExecutionEngine.executeCodeGeneration()
```typescript
// src/ai/actionExecutionEngine.ts:206-260
private async executeCodeGeneration(step: ActionStep, context: ExecutionContext): Promise<ExecutionResult> {
    // ...
    // 파일 내용 쓰기 (기존 파일이 있으면 덮어쓰기)
    await vscode.workspace.fs.writeFile(fileUri, Buffer.from(step.content, 'utf8'));
    // ...
}
```

#### LlmResponseProcessor.processLlmResponseAndApplyUpdates()
```typescript
// src/ai/llmResponseProcessor.ts:61-1797
public async processLlmResponseAndApplyUpdates(...) {
    // 파일 작업 파싱
    // ...
    // 파일 작업 실행 또는 큐 추가
    if (autoUpdateEnabled) {
        // 즉시 실행
        await vscode.workspace.fs.writeFile(fileUri, Buffer.from(operation.newContent!, 'utf8'));
    } else {
        // 큐에 추가
        enqueueCommandsBatch(combined, true, projectRootForQueue);
    }
}
```

#### LlmService.handleExecutionIntentWithActionPlan()
```typescript
// src/ai/llmService.ts:969-1063
private async handleExecutionIntentWithActionPlan(...) {
    // ...
    const result = await this.actionExecutionEngine.executePlan(plan);
    // return 없음 - 여기서 종료되어야 하지만 계속 진행될 수 있음
}
```

## 해결 방안

### 방안 1: ActionPlan 실행 중 플래그 설정 (권장)
- ActionPlan 실행 중일 때 일반 LLM 응답 경로에서 파일 작업 스킵
- `LlmService`에 `isActionPlanExecuting` 플래그 추가
- `processLlmResponseAndApplyUpdates()`에서 플래그 확인 후 파일 작업 스킵

### 방안 2: ActionPlan 실행 후 명시적 return 확인
- `handleExecutionIntentWithActionPlan()`에서 return이 제대로 작동하는지 확인
- return 후에도 일반 경로가 실행되는지 확인

### 방안 3: ActionExecutionEngine에서 파일 작업 시 큐 사용
- ActionExecutionEngine도 `enqueueCommandsBatch()`를 통해 파일 작업 수행
- 중복 제거 로직이 이미 `enqueueCommandsBatch()`에 있음 (1294-1299라인)

### 방안 4: ActionPlan과 일반 경로 분리
- execution 의도일 때는 ActionPlan 경로만 사용
- 일반 LLM 응답 경로는 완전히 스킵

## 권장 수정 사항

1. **즉시 수정**: `handleExecutionIntentWithActionPlan()`에서 return 후 일반 경로가 실행되지 않도록 확인
2. **플래그 추가**: ActionPlan 실행 중 플래그로 일반 경로에서 파일 작업 스킵
3. **로깅 강화**: 중복 생성 발생 시 로그로 추적 가능하도록 개선

