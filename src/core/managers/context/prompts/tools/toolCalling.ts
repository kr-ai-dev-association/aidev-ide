/**
 * Tool Calling Prompts
 * JSON Function Calling 관련 프롬프트
 */

import { ToolSpec, Tool } from '../../../../tools/types';

/**
 * 도구 호출 형식 프롬프트
 */
export function getToolCallingFormatPrompt(): string {
    let prompt = '## 도구 호출 규칙 (JSON Function Calling)\n\n';

    prompt += '### 도구 호출 형식\n';
    prompt += '도구를 호출할 때는 반드시 다음 JSON 형식을 사용하세요:\n';
    prompt += '```json\n';
    prompt += '{\n';
    prompt += '  "function_call": {\n';
    prompt += '    "name": "도구_이름",\n';
    prompt += '    "args": {\n';
    prompt += '      "파라미터1": "값1",\n';
    prompt += '      "파라미터2": "값2"\n';
    prompt += '    }\n';
    prompt += '  }\n';
    prompt += '}\n';
    prompt += '```\n\n';

    prompt += '### 여러 도구 동시 호출\n';
    prompt += '여러 도구를 한 번에 호출하려면 배열 형식을 사용하세요:\n';
    prompt += '```json\n';
    prompt += '{\n';
    prompt += '  "function_calls": [\n';
    prompt += '    { "name": "도구1", "args": { ... } },\n';
    prompt += '    { "name": "도구2", "args": { ... } }\n';
    prompt += '  ]\n';
    prompt += '}\n';
    prompt += '```\n\n';

    return prompt;
}

/**
 * 도구 스펙 프롬프트 생성
 */
export function getToolSpecPrompt(spec: ToolSpec): string {
    let prompt = `#### ${spec.name}\n`;
    prompt += `${spec.description}\n\n`;

    // update_file에 대한 특별 경고
    if (spec.name === Tool.UPDATE_FILE) {
        prompt += '**⚠️ CRITICAL WARNING ⚠️**\n';
        prompt += '`update_file`을 사용하기 전에 **반드시** `read_file`로 최신 파일 내용을 먼저 읽어야 합니다!\n';
        prompt += '- 파일이 이미 수정되었을 수 있습니다\n';
        prompt += '- 이전에 읽은 내용이나 추측을 기반으로 SEARCH 패턴을 만들면 실패합니다\n';
        prompt += '- **항상 `read_file` → `update_file` 순서로 사용하세요**\n\n';
    }

    prompt += '**파라미터:**\n';
    for (const param of spec.parameters) {
        prompt += `- \`${param.name}\`${param.required ? ' (필수)' : ' (선택)'}: ${param.description}\n`;
    }
    prompt += '\n';

    // 예시
    prompt += '**사용 예시:**\n';
    prompt += '```json\n';
    prompt += '{\n';
    prompt += '  "function_call": {\n';
    prompt += `    "name": "${spec.name}",\n`;
    prompt += '    "args": {\n';

    const exampleArgs: string[] = [];
    for (const param of spec.parameters) {
        if (param.required) {
            let exampleValue = '...';
            if (param.name === 'path') exampleValue = 'src/example.ts';
            else if (param.name === 'content') exampleValue = '// 파일 내용';
            else if (param.name === 'command') exampleValue = 'npm install';
            else if (param.name === 'pattern') exampleValue = 'TODO';
            else if (param.name === 'diff') exampleValue = '<<<<<<< SEARCH\\n기존 내용\\n=======\\n새 내용\\n>>>>>>> REPLACE';
            exampleArgs.push(`      "${param.name}": "${exampleValue}"`);
        }
    }
    prompt += exampleArgs.join(',\n');
    prompt += '\n    }\n';
    prompt += '  }\n';
    prompt += '}\n';
    prompt += '```\n\n';

    return prompt;
}

/**
 * 작업 흐름 가이드라인 프롬프트
 */
export function getWorkflowGuidelinePrompt(): string {
    let prompt = '### 작업 흐름 가이드라인\n\n';
    prompt += '**파일 수정 워크플로우:**\n';
    prompt += '```json\n';
    prompt += '// 1단계: 먼저 파일 읽기 (필수!)\n';
    prompt += '{ "function_call": { "name": "read_file", "args": { "path": "src/App.tsx" } } }\n';
    prompt += '\n// 2단계: 읽은 내용을 기반으로 수정\n';
    prompt += '{ "function_call": { "name": "update_file", "args": { "path": "src/App.tsx", "diff": "<<<<<<< SEARCH\\n...\\n=======\\n...\\n>>>>>>> REPLACE" } } }\n';
    prompt += '```\n\n';

    prompt += '**기능 추가 워크플로우:**\n';
    prompt += '```json\n';
    prompt += '{\n';
    prompt += '  "function_calls": [\n';
    prompt += '    { "name": "list_files", "args": { "path": "src", "recursive": "true" } },\n';
    prompt += '    { "name": "read_file", "args": { "path": "src/App.tsx" } },\n';
    prompt += '    { "name": "create_file", "args": { "path": "src/components/Button.tsx", "content": "// Button component" } }\n';
    prompt += '  ]\n';
    prompt += '}\n';
    prompt += '```\n\n';

    return prompt;
}

/**
 * 중요 규칙 프롬프트
 */
export function getImportantRulesPrompt(): string {
    let prompt = '### 중요 규칙\n\n';
    prompt += '**⚠️ 출력 형식 (절대 준수):**\n';
    prompt += '- **오직 JSON function_call만 출력하세요**\n';
    prompt += '- 설명, 생각, 분석, 계획 텍스트는 시스템이 무시합니다\n';
    prompt += '- "~하겠습니다", "~해야 합니다" 같은 의도 표현 금지\n';
    prompt += '- JSON 외의 모든 텍스트는 무효 처리됩니다\n\n';
    prompt += '**파일 작업 규칙:**\n';
    prompt += '1. **update_file 전에 read_file 필수**: 파일 수정 전 반드시 최신 내용을 읽으세요.\n';
    prompt += '2. **create_file은 content 필수**: 빈 content는 허용되지 않습니다.\n';
    prompt += '3. **수정 범위가 넓으면 create_file 사용**: 전체를 다시 작성하세요.\n';
    prompt += '4. **일괄 수정 금지**: sed -i 대신 read_file → update_file 순서로.\n\n';
    prompt += '**올바른 응답 예시:**\n';
    prompt += '```json\n';
    prompt += '{ "function_call": { "name": "read_file", "args": { "path": "src/App.tsx" } } }\n';
    prompt += '```\n\n';
    prompt += '**잘못된 응답 예시 (무시됨):**\n';
    prompt += '```\n';
    prompt += '버튼을 추가하겠습니다. 먼저 파일을 읽어보겠습니다.\n';
    prompt += '```\n';

    return prompt;
}

/**
 * 전체 도구 프롬프트 섹션 생성
 */
export function buildToolPromptSection(specs: ToolSpec[]): string {
    let prompt = getToolCallingFormatPrompt();
    prompt += '### 사용 가능한 도구\n\n';

    for (const spec of specs) {
        prompt += getToolSpecPrompt(spec);
    }

    prompt += getWorkflowGuidelinePrompt();
    prompt += getImportantRulesPrompt();

    return prompt;
}
