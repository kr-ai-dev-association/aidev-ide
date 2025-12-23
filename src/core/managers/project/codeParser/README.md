# CodeParser - Tree-sitter 기반 코드 분석

## 개요

Tree-sitter를 사용하여 소스 코드의 구조와 정의(클래스, 함수, 메서드 등)를 추출하는 모듈입니다.

## 주요 기능

- **AST 기반 파싱**: Tree-sitter로 정확한 코드 구조 분석
- **다국어 지원**: JavaScript, TypeScript, Python, Java 등
- **LLM 컨텍스트 최적화**: 전체 코드가 아닌 정의만 추출하여 토큰 절약
- **빠른 검색**: 클래스, 함수, 메서드 정의 빠르게 찾기

## 지원 언어

- JavaScript (.js, .jsx)
- TypeScript (.ts, .tsx)
- Python (.py)
- Java (.java)

## 사용법

### 1. 기본 사용 (AbstractionIntegrationService 통해)

```typescript
import { getAbstractionService } from '@/abstractions';

// 서비스 초기화
const abstractionService = getAbstractionService();
await abstractionService.setProjectPath('/path/to/project');

// 프로젝트 전체 정의 추출
const definitions = await abstractionService.parseProjectCode({
    maxFiles: 50,
    includeTests: false,
});

console.log(`총 ${definitions.summary.totalFiles}개 파일, ${definitions.summary.totalDefinitions}개 정의`);
```

### 2. 프로젝트 요약 (LLM 컨텍스트용)

```typescript
// 프로젝트 구조 요약 가져오기
const summary = await abstractionService.getProjectCodeSummary({
    maxFiles: 30,
});

// LLM 프롬프트에 포함
const prompt = `
다음은 프로젝트 구조입니다:

${summary}

사용자 요청: ${userQuery}
`;
```

### 3. 특정 파일 파싱

```typescript
// 단일 파일의 정의 추출
const fileSummary = await abstractionService.parseFile(
    '/path/to/project/src/services/UserService.ts'
);

console.log(fileSummary);
// 출력:
// |----
// │export class UserService {
// │  async findById(id: string): Promise<User> {
// │  async create(data: CreateUserDto): Promise<User> {
// |----
```

### 4. 클래스 찾기

```typescript
// 특정 클래스 정의 찾기
const userClass = await abstractionService.findClass('UserService');

if (userClass) {
    console.log(`Class: ${userClass.name}`);
    console.log(`Methods: ${userClass.methods.length}개`);
    
    userClass.methods.forEach(method => {
        console.log(`  - ${method.name}()`);
    });
}
```

### 5. 직접 사용 (TreeSitterAdapter)

```typescript
import { TreeSitterAdapter } from '@/abstractions/codeParser';

const parser = new TreeSitterAdapter();

// 디렉토리 파싱
const result = await parser.parseDirectory('/path/to/src', {
    maxFiles: 50,
    includeTests: false,
    languages: ['typescript', 'javascript'],
});

// 특정 정의 찾기
const definition = await parser.findDefinition(
    'UserController',
    DefinitionType.CLASS,
    '/path/to/src'
);
```

## 실전 예시

### 예시 1: LLM에게 프로젝트 컨텍스트 제공

```typescript
async function generateCodeWithContext(userQuery: string) {
    const abstractionService = getAbstractionService();
    
    // 프로젝트 코드 구조 추출
    const codeSummary = await abstractionService.getProjectCodeSummary({
        maxFiles: 30,
        includeTests: false,
    });
    
    // LLM 프롬프트 생성
    const llmAdapter = abstractionService.getLLMAdapter();
    const prompt = llmAdapter.buildUserPrompt({
        query: userQuery,
        includedFiles: [{
            name: 'project-structure.md',
            content: codeSummary,
        }],
    });
    
    // LLM 호출...
}
```

### 예시 2: 에러 발생 시 관련 코드 자동 제공

```typescript
async function handleTypeError(error: TypeScriptError) {
    const abstractionService = getAbstractionService();
    
    // 에러 메시지에서 클래스명 추출
    // "Property 'email' does not exist on type 'User'"
    const match = error.message.match(/on type '(\w+)'/);
    if (!match) return;
    
    const className = match[1];
    
    // 해당 클래스 정의 찾기
    const classDef = await abstractionService.findClass(className);
    
    if (classDef) {
        // LLM에게 에러와 클래스 정의를 함께 전달
        const llmAdapter = abstractionService.getLLMAdapter();
        const prompt = llmAdapter.buildErrorCorrectionPrompt({
            errorType: 'TYPE_ERROR',
            errorMessage: error.message,
            relevantFiles: [{
                path: classDef.filePath,
                content: classDef.content,
            }],
        });
        
        // LLM이 클래스 정의를 보고 정확한 수정 제안...
    }
}
```

### 예시 3: 코드 생성 시 기존 스타일 참고

```typescript
async function generateNewMethod(className: string, methodName: string) {
    const abstractionService = getAbstractionService();
    
    // 기존 클래스 구조 파악
    const classDef = await abstractionService.findClass(className);
    
    if (classDef) {
        // 기존 메서드 스타일 분석
        const existingMethods = classDef.methods;
        const isAsync = existingMethods.some(m => m.isAsync);
        const hasPrivateMethods = existingMethods.some(m => m.visibility === 'private');
        
        // 일관된 스타일로 새 메서드 생성
        const newMethod = `
            ${isAsync ? 'async' : ''} ${methodName}() {
                // 구현
            }
        `;
        
        // LLM에게 기존 메서드와 함께 전달하여 더 일관된 코드 생성...
    }
}
```

## 성능 최적화

### 토큰 절약

```typescript
// ❌ 나쁜 예: 전체 파일 내용을 LLM에 전달
const fileContent = await fs.readFile('UserService.ts', 'utf-8');
// 전체 파일: 500줄, ~2000 토큰

// ✅ 좋은 예: 정의만 추출하여 전달
const fileSummary = await abstractionService.parseFile('UserService.ts');
// 정의만: 20줄, ~100 토큰 (95% 절약!)
```

### 파일 수 제한

```typescript
// 대형 프로젝트는 파일 수 제한
const summary = await abstractionService.getProjectCodeSummary({
    maxFiles: 50,  // 최대 50개 파일만
    includeTests: false,  // 테스트 파일 제외
});
```

## 제약사항

### 1. WASM 파일 자동 처리

Tree-sitter 언어 파서는 WASM 파일이 필요하지만, **자동으로 설치됩니다**:

```bash
npm install  # tree-sitter-wasms가 자동 설치
npm run compile  # webpack이 자동으로 dist/에 복사
```

빌드 후 구조:
```
dist/tree-sitter/
├── tree-sitter-javascript.wasm
├── tree-sitter-typescript.wasm
├── tree-sitter-tsx.wasm
├── tree-sitter-python.wasm
└── tree-sitter-java.wasm
```

### 2. 지원 언어

현재 JavaScript, TypeScript, Python, Java만 지원합니다.
추가 언어가 필요한 경우 쿼리 파일과 languageParser.ts를 업데이트하세요.

### 3. 성능

대형 프로젝트(1000+ 파일)는 파싱에 시간이 걸릴 수 있습니다.
`maxFiles` 옵션으로 제한하세요.

## 향후 계획

- [ ] Rust, Go, C++, C# 지원 추가
- [ ] 캐싱 기능 (동일 프로젝트 재파싱 방지)
- [ ] 증분 파싱 (변경된 파일만 재파싱)
- [ ] 더 상세한 정의 정보 (파라미터, 리턴 타입 등)
- [ ] 의존성 그래프 분석

## 참고 자료

- [Tree-sitter 공식 문서](https://tree-sitter.github.io/tree-sitter/)
- [web-tree-sitter](https://github.com/tree-sitter/tree-sitter/tree/master/lib/binding_web)
- [Tree-sitter 쿼리 문법](https://tree-sitter.github.io/tree-sitter/using-parsers#pattern-matching-with-queries)

