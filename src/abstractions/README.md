# 추상화 레이어 (Abstraction Layers)

이 디렉토리는 AIDEV-IDE의 핵심 추상화 레이어를 포함합니다. 
OS, LLM, 기술 스택에 따라 다르게 동작해야 하는 로직을 추상화하여 관리합니다.

## 📁 디렉토리 구조

```
abstractions/
├── os/                          # OS별 추상화
│   ├── IOperatingSystemAdapter.ts
│   ├── DarwinAdapter.ts        # macOS
│   ├── WindowsAdapter.ts       # Windows
│   ├── LinuxAdapter.ts         # Linux
│   └── OSAdapterFactory.ts
├── llm/                         # LLM별 추상화
│   ├── ILLMAdapter.ts
│   └── GptOssAdapter.ts        # GPT-OSS (현재 기본)
├── techStack/                   # 기술 스택별 추상화
│   ├── ITechStackAdapter.ts
│   ├── TypeScriptAdapter.ts
│   ├── SpringBootAdapter.ts
│   └── TechStackAdapterFactory.ts
├── AbstractionIntegrationService.ts  # 통합 서비스
├── index.ts                     # Export 통합
├── README.md                    # 이 파일
└── MIGRATION_GUIDE.md          # 마이그레이션 가이드
```

## 🎯 목적

### 1. OS별 추상화
- **문제**: 터미널 명령어, 파일 경로, 프로세스 관리 등이 OS마다 다름
- **해결**: OS에 맞는 어댑터가 자동으로 적절한 명령어/경로를 생성

```typescript
// Before
if (process.platform === 'win32') {
    command = 'npm.cmd install';
} else {
    command = 'npm install';
}

// After
const osAdapter = getAbstractionService().getOSAdapter();
const command = `${osAdapter.getNpmCommand()} install`;
```

### 2. LLM별 추상화
- **문제**: LLM마다 최적의 프롬프트 구조와 응답 형식이 다름
- **해결**: 공통 프롬프트 + LLM별 특화 프롬프트를 자동으로 조합

```typescript
// Before
const prompt = `You are an AI assistant.\nOS: ${os.platform()}`;

// After
const prompt = llmAdapter.buildSystemPrompt({
    osType: 'darwin',
    projectType: 'TypeScript',
    // OS, 기술 스택 정보가 LLM에 맞게 자동 포함
});
```

### 3. 기술 스택별 추상화
- **문제**: 프로젝트 타입에 따라 빌드 명령어, 파일 구조, 에러 패턴이 다름
- **해결**: 기술 스택별 어댑터가 프로젝트에 맞는 동작 제공

```typescript
// Before
if (projectType === 'Spring Boot') {
    return './mvnw spring-boot:run';
} else if (projectType === 'Node.js') {
    return 'npm run dev';
}

// After
const command = techStackAdapter.getDevCommand();
// Spring Boot: ./mvnw spring-boot:run
// TypeScript: npm run dev
```

## 🚀 사용 방법

### 기본 사용

```typescript
import { getAbstractionService } from './abstractions';

// 1. 서비스 초기화 (extension.ts의 activate)
const service = getAbstractionService();
await service.setProjectPath(workspacePath);

// 2. OS 기능 사용
const osAdapter = service.getOSAdapter();
const command = osAdapter.normalizeCommand('npm install');
const path = osAdapter.normalizePath('/some/path');

// 3. LLM 기능 사용
const systemPrompt = service.buildSystemPrompt();
const userPrompt = service.buildUserPrompt({
    query: 'Create a new component',
    includedFiles: files
});

// 4. 기술 스택 기능 사용
const buildCommand = service.generateCommand('build');
const template = service.generateFileTemplate('component', 'MyComponent');
```

### 고급 사용

```typescript
// OS 정보 직접 접근
const osResult = service.getOSDetectionResult();
console.log(osResult.osType); // 'darwin' | 'win32' | 'linux'
console.log(osResult.shellType); // 'bash' | 'zsh' | 'powershell' | 'cmd'

// 기술 스택 어댑터 직접 접근
const techAdapter = service.getTechStackAdapter();
if (techAdapter) {
    const errorPatterns = techAdapter.getErrorPatterns();
    const fix = techAdapter.suggestErrorFix(error);
}

// LLM 어댑터 직접 접근
const llmAdapter = service.getLLMAdapter();
const codePrompt = llmAdapter.buildCodeGenerationPrompt({
    intent: 'code_generation',
    projectType: 'Spring Boot',
    techStack: ['Java', 'Spring Boot'],
    requirements: 'Create a REST API'
});
```

## 🔧 확장하기

### 새로운 OS 추가

```typescript
// src/abstractions/os/FreeBSDAdapter.ts
export class FreeBSDAdapter implements IOperatingSystemAdapter {
    readonly osType = 'freebsd';
    readonly osName = 'FreeBSD';
    
    getDefaultShell(): string {
        return '/bin/sh';
    }
    
    // ... IOperatingSystemAdapter의 모든 메서드 구현
}

// OSAdapterFactory.ts에 추가
case 'freebsd':
    return new FreeBSDAdapter();
```

### 새로운 LLM 추가

```typescript
// src/abstractions/llm/GeminiAdapter.ts
export class GeminiAdapter implements ILLMAdapter {
    readonly llmId = 'gemini';
    readonly llmName = 'Gemini';
    readonly modelName = 'gemini-2.0-flash-exp';
    
    buildSystemPrompt(context: SystemPromptContext): string {
        // Gemini에 최적화된 프롬프트 생성
        return COMMON_SYSTEM_PROMPTS.BASE + geminiSpecificPrompts;
    }
    
    // ... ILLMAdapter의 모든 메서드 구현
}

// 사용
service.setLLMAdapter(new GeminiAdapter());
```

### 새로운 기술 스택 추가

```typescript
// src/abstractions/techStack/PythonDjangoAdapter.ts
export class PythonDjangoAdapter implements ITechStackAdapter {
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
    
    // ... ITechStackAdapter의 모든 메서드 구현
}

// TechStackAdapterFactory.ts에 추가
const detectors = [
    { 
        detect: PythonDjangoAdapter.detect, 
        create: () => new PythonDjangoAdapter() 
    },
    // ... 기존 detectors
];
```

## 📊 아키텍처

```
┌─────────────────────────────────────────┐
│  AbstractionIntegrationService          │
│  (통합 서비스 - 싱글톤)                    │
└─────────────────┬───────────────────────┘
                  │
        ┌─────────┼─────────┐
        │         │         │
    ┌───▼───┐ ┌──▼──┐ ┌────▼────┐
    │  OS   │ │ LLM │ │TechStack│
    │Adapter│ │Adapt│ │ Adapter │
    └───┬───┘ └──┬──┘ └────┬────┘
        │        │         │
    ┌───▼────────▼─────────▼───┐
    │   Application Layer       │
    │ (extension, services,     │
    │  managers, processors)    │
    └───────────────────────────┘
```

## 🧪 테스트

```typescript
import { AbstractionIntegrationService } from './AbstractionIntegrationService';

describe('AbstractionIntegrationService', () => {
    beforeEach(() => {
        AbstractionIntegrationService.reset();
    });

    it('should detect OS correctly', () => {
        const service = AbstractionIntegrationService.getInstance();
        const osResult = service.getOSDetectionResult();
        expect(osResult.osType).toBeDefined();
    });

    it('should generate OS-specific commands', () => {
        const service = AbstractionIntegrationService.getInstance();
        const osAdapter = service.getOSAdapter();
        const npmCommand = osAdapter.getNpmCommand();
        
        if (process.platform === 'win32') {
            expect(npmCommand).toBe('npm.cmd');
        } else {
            expect(npmCommand).toBe('npm');
        }
    });

    it('should detect tech stack', async () => {
        const service = AbstractionIntegrationService.getInstance();
        await service.setProjectPath('/path/to/typescript/project');
        
        const techAdapter = service.getTechStackAdapter();
        expect(techAdapter).not.toBeNull();
        expect(techAdapter?.language).toBe('TypeScript');
    });
});
```

## 📝 주요 개념

### 어댑터 패턴
각 OS, LLM, 기술 스택에 대한 인터페이스를 정의하고, 구체적인 구현을 어댑터로 제공합니다.

### 팩토리 패턴
현재 환경을 감지하여 적절한 어댑터를 자동으로 생성합니다.

### 싱글톤 패턴
AbstractionIntegrationService는 싱글톤으로 관리되어 전역 상태를 유지합니다.

## 🔍 디버깅

```typescript
// 전체 컨텍스트 확인
const context = service.getFullContext();
console.log('Full Context:', JSON.stringify(context, null, 2));

// OS 정보
const osAdapter = service.getOSAdapter();
console.log('OS Type:', osAdapter.osType);
console.log('OS Name:', osAdapter.osName);
console.log('Shell:', osAdapter.getShellType());

// 기술 스택 정보
const techAdapter = service.getTechStackAdapter();
if (techAdapter) {
    console.log('Stack:', techAdapter.stackName);
    console.log('Language:', techAdapter.language);
    console.log('Required Files:', techAdapter.getRequiredConfigFiles());
}
```

## 📚 추가 문서

- [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) - 기존 코드 마이그레이션 가이드
- [OS Adapter Interface](./os/IOperatingSystemAdapter.ts) - OS 추상화 인터페이스
- [LLM Adapter Interface](./llm/ILLMAdapter.ts) - LLM 추상화 인터페이스
- [TechStack Adapter Interface](./techStack/ITechStackAdapter.ts) - 기술 스택 추상화 인터페이스

## ⚠️ 주의사항

1. **싱글톤**: AbstractionIntegrationService는 싱글톤이므로 항상 `getInstance()` 사용
2. **프로젝트 경로**: 기술 스택 감지를 위해 `setProjectPath()` 필수 호출
3. **Null 체크**: 기술 스택이 감지되지 않을 수 있으므로 null 체크 필수
4. **비동기**: `setProjectPath()`와 감지 메서드는 비동기이므로 await 사용

## 🤝 기여하기

새로운 OS, LLM, 기술 스택을 추가할 때는 다음을 준수하세요:

1. 해당 인터페이스의 모든 메서드 구현
2. 팩토리에 감지 로직 추가
3. 테스트 코드 작성
4. MIGRATION_GUIDE.md 업데이트

