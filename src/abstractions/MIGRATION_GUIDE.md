# 추상화 레이어 마이그레이션 가이드

이 문서는 기존 코드를 새로운 추상화 레이어로 마이그레이션하는 방법을 설명합니다.

## 개요

새로운 추상화 레이어는 다음 세 가지로 구성됩니다:

1. **OS 추상화**: 터미널, 파일 처리, 명령어 처리, API 호출 방식
2. **LLM 추상화**: 공통 프롬프트 + LLM별 특화 프롬프트
3. **기술 스택 추상화**: TypeScript, Spring Boot 등 프로젝트별 특화 기능

## 1. 초기 설정

### extension.ts에서 초기화

```typescript
import { getAbstractionService } from './abstractions';

export async function activate(context: vscode.ExtensionContext) {
    // 추상화 서비스 초기화
    const abstractionService = getAbstractionService();
    
    // 프로젝트 경로 설정 (기술 스택 자동 감지)
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspacePath) {
        await abstractionService.setProjectPath(workspacePath);
    }
    
    // 전체 컨텍스트 확인 (디버깅용)
    console.log('[Extension] Abstraction context:', 
        abstractionService.getFullContext());
    
    // ... 기존 코드 ...
}
```

## 2. OS 추상화 사용

### 터미널 명령어 처리 (terminalManager.ts)

**변경 전:**
```typescript
// OS별 분기 처리
let command: string;
if (process.platform === 'win32') {
    command = 'npm.cmd install';
} else {
    command = 'npm install';
}
```

**변경 후:**
```typescript
import { getAbstractionService } from '../abstractions';

const abstractionService = getAbstractionService();
const osAdapter = abstractionService.getOSAdapter();

// OS에 맞는 명령어 자동 반환
const npmCommand = osAdapter.getNpmCommand(); // win32: npm.cmd, others: npm
const command = `${npmCommand} install`;
```

### 경로 처리

**변경 전:**
```typescript
// 경로 구분자 수동 처리
const separator = process.platform === 'win32' ? '\\' : '/';
const fullPath = basePath + separator + fileName;
```

**변경 후:**
```typescript
const fullPath = osAdapter.normalizePath(path.join(basePath, fileName));
```

### 프로세스 종료

**변경 전:**
```typescript
if (process.platform === 'win32') {
    exec(`taskkill /F /PID ${pid}`);
} else {
    exec(`kill -9 ${pid}`);
}
```

**변경 후:**
```typescript
const killCommand = osAdapter.getKillProcessCommand(pid);
exec(killCommand);
```

## 3. LLM 추상화 사용

### 프롬프트 생성 (llmService.ts)

**변경 전:**
```typescript
const systemPrompt = `You are an AI assistant.
OS: ${os.platform()}
Shell: ${process.env.SHELL}`;

const userPrompt = userQuery + '\n\nFiles:\n' + files.join('\n');
```

**변경 후:**
```typescript
import { getAbstractionService } from '../abstractions';

const abstractionService = getAbstractionService();

// 시스템 프롬프트 (OS + 기술 스택 정보 자동 포함)
const systemPrompt = abstractionService.buildSystemPrompt({
    codebaseContext: 'Additional context here'
});

// 사용자 프롬프트
const userPrompt = abstractionService.buildUserPrompt({
    query: userQuery,
    includedFiles: files.map(f => ({ name: f.name, content: f.content })),
    projectRoot: workspacePath
});
```

### 코드 생성 프롬프트

**변경 전:**
```typescript
const prompt = `Generate code for: ${requirements}
Project: ${projectType}`;
```

**변경 후:**
```typescript
const llmAdapter = abstractionService.getLLMAdapter();

const prompt = llmAdapter.buildCodeGenerationPrompt({
    intent: 'code_generation',
    projectType: projectType,
    techStack: ['TypeScript', 'React'],
    requirements: requirements
});
```

### 에러 수정 프롬프트

**변경 전:**
```typescript
const errorPrompt = `Fix this error: ${errorMessage}`;
```

**변경 후:**
```typescript
const errorPrompt = llmAdapter.buildErrorCorrectionPrompt({
    errorMessage: errorMessage,
    errorType: 'BUILD_ERROR',
    commandExecuted: failedCommand,
    terminalOutput: terminalLog
});
```

## 4. 기술 스택 추상화 사용

### 빌드 명령어 생성 (llmResponseProcessor.ts)

**변경 전:**
```typescript
let buildCommand: string;
if (projectType === 'Node.js') {
    buildCommand = 'npm run build';
} else if (projectType === 'Spring Boot') {
    buildCommand = './mvnw clean package';
}
```

**변경 후:**
```typescript
const abstractionService = getAbstractionService();

// 기술 스택에 맞는 빌드 명령어 자동 생성
const buildCommand = abstractionService.generateCommand('build');

// OS에 맞게 변환까지 자동으로 처리됨
// macOS/Linux: ./mvnw clean package
// Windows: mvnw.cmd clean package
```

### 파일 템플릿 생성

**변경 전:**
```typescript
let template: string;
if (fileType === 'component' && projectType === 'React') {
    template = `import React from 'react';\n\nexport function ${name}() { ... }`;
} else if (fileType === 'service' && projectType === 'Spring Boot') {
    template = `@Service\npublic class ${name}Service { ... }`;
}
```

**변경 후:**
```typescript
const techStackAdapter = abstractionService.getTechStackAdapter();

if (techStackAdapter) {
    // 기술 스택에 맞는 템플릿 자동 생성
    const template = techStackAdapter.getFileTemplate('component', componentName);
}
```

### 에러 자동 수정

**변경 전:**
```typescript
// 수동으로 에러 패턴 매칭
if (errorMessage.includes('MODULE_NOT_FOUND')) {
    return `Try: npm install ${moduleName}`;
}
```

**변경 후:**
```typescript
const techStackAdapter = abstractionService.getTechStackAdapter();

if (techStackAdapter) {
    const fix = techStackAdapter.suggestErrorFix({
        message: errorMessage,
        type: 'MODULE_NOT_FOUND'
    });
    
    if (fix) {
        console.log('Diagnosis:', fix.diagnosis);
        console.log('Suggested fix:', fix.suggestedFix);
        console.log('Commands:', fix.commands);
    }
}
```

## 5. 통합 사용 예제

### ActionExecutionEngine에서 명령어 실행

```typescript
import { getAbstractionService } from '../abstractions';

export class ActionExecutionEngine {
    private abstractionService = getAbstractionService();

    private async executeTerminalCommand(
        step: ActionStep,
        context: ExecutionContext
    ): Promise<ExecutionResult> {
        const osAdapter = this.abstractionService.getOSAdapter();
        
        // 명령어를 OS에 맞게 정규화
        let command = step.command || '';
        command = osAdapter.normalizeCommand(command);
        
        // 현재 디렉토리 정규화
        const cwd = osAdapter.normalizePath(context.plan.context.projectRoot);
        
        // 셸 실행 옵션 가져오기
        const shellOptions = osAdapter.getShellExecutionOptions();
        
        // 명령어 실행
        const result = await runCommandCapture(command, {
            cwd,
            ...shellOptions
        });
        
        return { success: result.exitCode === 0, message: result.stdout };
    }
}
```

### LlmService에서 프롬프트 생성

```typescript
import { getAbstractionService } from '../abstractions';

export class LlmService {
    private abstractionService = getAbstractionService();

    async handleUserMessageAndRespond(
        userQuery: string,
        webviewToRespond: vscode.Webview
    ): Promise<void> {
        // 시스템 프롬프트 생성 (OS + 기술 스택 정보 자동 포함)
        const systemPrompt = this.abstractionService.buildSystemPrompt();
        
        // 사용자 프롬프트 생성
        const userPrompt = this.abstractionService.buildUserPrompt({
            query: userQuery,
            includedFiles: this.includedFiles,
            projectRoot: this.projectRoot
        });
        
        // LLM 호출
        const llmAdapter = this.abstractionService.getLLMAdapter();
        const response = await this.callLLM(systemPrompt, userPrompt);
        
        // 응답 파싱 (LLM별로 자동 처리)
        const parsed = llmAdapter.parseResponse(response);
        
        // 파일 작업 처리
        if (parsed.fileOperations) {
            for (const op of parsed.fileOperations) {
                await this.handleFileOperation(op);
            }
        }
    }
}
```

## 6. 마이그레이션 체크리스트

### extension.ts
- [ ] AbstractionIntegrationService 초기화
- [ ] 프로젝트 경로 설정
- [ ] 서비스를 전역적으로 사용 가능하게 설정

### terminalManager.ts
- [ ] OS 명령어 분기 제거 → OSAdapter 사용
- [ ] 경로 처리 로직 → normalizePath 사용
- [ ] 프로세스 관리 → OSAdapter 메서드 사용

### llmService.ts
- [ ] 하드코딩된 프롬프트 → LLMAdapter 사용
- [ ] OS 정보 수동 추가 → SystemPromptContext 사용
- [ ] 프로젝트 타입별 분기 → TechStackAdapter 사용

### llmResponseProcessor.ts
- [ ] 명령어 생성 로직 → TechStackAdapter 사용
- [ ] 파일 템플릿 → getFileTemplate 사용
- [ ] 에러 처리 → suggestErrorFix 사용

### actionExecutionEngine.ts
- [ ] 파일 작업 → OSAdapter의 경로 정규화 사용
- [ ] 명령어 실행 → normalizeCommand 사용
- [ ] 에러 처리 → TechStackAdapter의 에러 패턴 사용

## 7. 테스트

```typescript
import { getAbstractionService } from '../abstractions';

// 테스트 전 초기화
const service = getAbstractionService();
await service.setProjectPath('/path/to/test/project');

// 컨텍스트 확인
console.log(service.getFullContext());

// OS 기능 테스트
const osAdapter = service.getOSAdapter();
console.log('npm command:', osAdapter.getNpmCommand());
console.log('build command:', service.getBuildCommand());

// 클린업
AbstractionIntegrationService.reset();
```

## 8. 주의사항

1. **싱글톤 패턴**: AbstractionIntegrationService는 싱글톤이므로 항상 `getInstance()` 또는 `getAbstractionService()` 사용
2. **프로젝트 경로 설정**: 기술 스택 감지를 위해 반드시 `setProjectPath()` 호출
3. **에러 처리**: 기술 스택이 감지되지 않은 경우 null 체크 필수
4. **테스트**: 각 어댑터는 독립적으로 테스트 가능 (팩토리의 `createAdapterForOS` 등 활용)

## 9. 추가 LLM 지원 예제

추후 Gemini나 다른 LLM을 추가할 경우:

```typescript
import { ILLMAdapter } from './abstractions';

export class GeminiAdapter implements ILLMAdapter {
    readonly llmId = 'gemini';
    readonly llmName = 'Gemini';
    readonly modelName = 'gemini-2.0-flash-exp';
    
    // ILLMAdapter 인터페이스 구현
    buildSystemPrompt(context: SystemPromptContext): string {
        // Gemini 특화 프롬프트
        return COMMON_SYSTEM_PROMPTS.BASE + this.getGeminiSpecificPrompt();
    }
    
    // ... 나머지 메서드 구현
}

// 사용
const service = getAbstractionService();
service.setLLMAdapter(new GeminiAdapter());
```

## 10. 추가 기술 스택 지원 예제

Python/Django를 추가할 경우:

```typescript
export class DjangoAdapter implements ITechStackAdapter {
    readonly stackId = 'python-django';
    readonly stackName = 'Django';
    readonly language = 'Python';
    readonly framework = 'Django';
    
    getBuildCommand(): string {
        return 'python manage.py collectstatic --noinput';
    }
    
    getDevCommand(): string {
        return 'python manage.py runserver';
    }
    
    // ... 나머지 구현
}

// TechStackAdapterFactory.ts에 추가
const detectors = [
    { detect: DjangoAdapter.detect, create: () => new DjangoAdapter() },
    // ... 기존 detectors
];
```

