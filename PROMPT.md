# 프롬프트 구성 및 사용 위치

## 베이스 프롬프트 (PromptComposer에서 항상 포함)
- `base/agentRole.ts` : 에이전트 역할 정의
- `base/objective.ts` : 목표(완전한 실행 코드, 스타일 유지, 경로 명시, 한글 설명)
- `base/rules.ts` : 기본 규칙 + 설정파일 선행 읽기
- `base/fileOperations.ts` : 파일 작업 형식 (XML 우선, 마크다운 하위호환)
- `base/codeVsScript.ts` : code_work vs execution_work 구분, 스크립트 생성 금지 규칙
- `base/tools.ts` → `ToolSpecBuilder` : 툴 스펙, XML-only, thinking 비움, response에만 XML
- `base/codeGeneration.ts` : 코드 생성/수정 지침, 파일 분할/의존성/버전 규칙
- `base/outputFormat.ts` : 기본 출력 형식 가이드

## 작업 타입별 프롬프트 (PromptComposer.taskType)
- `task/CodeWorkPrompt.ts` : code_work 전용 (파일 지시어 형식, 스크립트/명령 금지)
- `task/ExecutionWorkPrompt.ts` : execution_work 전용 (명령 실행/스크립트, 코드 생성 금지)
- `task/summarize.ts` : 대화 요약 포맷

## OS 프롬프트 (PromptComposer.getOSPrompt)
- `os/WindowsPrompt.ts`
- `os/MacOSPrompt.ts`
- `os/LinuxPrompt.ts`
- `os/DefaultOSPrompt.ts` (fallback)

## LLM 프롬프트 (LLM 어댑터)
- `llm/GeminiPrompt.ts`
- `llm/GPTOSSPrompt.ts`
- `llm/DeepSeekPrompt.ts`
- `llm/GemmaPrompt.ts`
- `llm/CodeLlamaPrompt.ts`
- `llm/DefaultLLMPrompt.ts`

## 프레임워크 프롬프트 (FrameworkPromptBuilder)
- `framework/ViteTypeScriptPrompt.ts`
- `framework/NodeTypeScriptPrompt.ts`
- `framework/ExpressPrompt.ts`
- `framework/SpringBootPrompt.ts`

## 사용 흐름
- `PromptComposer`가 OS/LLM/Framework/Task에 맞춰 위 컴포넌트를 조합하여 system prompt 생성
- `ToolSpecBuilder`가 툴 스펙과 XML-only 규칙을 system prompt에 삽입

## 정리 사항
- 파일 작업 형식: XML-only로 단순화 (`fileOperations.ts`), 마크다운 지시어 안내 제거
- code_work: XML 툴 콜만 사용하도록 단순화 (`CodeWorkPrompt.ts`)
- 출력 형식: 파일 지시어 안내를 제거하고, 툴 실행 결과 요약 중심으로 축소 (`outputFormat.ts`)
- XML-only 규칙: `ToolSpecBuilder`에서 thinking 비우고 response에만 XML 출력하도록 가장 강하게 명시

