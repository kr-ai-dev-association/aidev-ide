/**
 * Tool Calling Prompts
 * JSON Function Calling 관련 프롬프트
 */

import { ToolSpec, Tool } from '../../../../tools/types';

/**
 * 도구 호출 형식 프롬프트
 */
export function getToolCallingFormatPrompt(): string {
    let prompt = '## 도구 호출 규칙 (필수)\n\n';

    prompt += '### 도구 호출 형식\n';
    prompt += '**반드시** 다음 형식만 사용하세요. 다른 형식은 무시됩니다.\n\n';

    prompt += '**파일 생성 (create_file):**\n';
    prompt += '```\n';
    prompt += '{ "tool": "create_file", "path": "src/example.py" }\n';
    prompt += '<<<<<<<CODE\n';
    prompt += 'def example():\n';
    prompt += '    print("hello")\n';
    prompt += '>>>>>>>END\n';
    prompt += '```\n\n';

    prompt += '**파일 수정 (update_file):**\n';
    prompt += '```\n';
    prompt += '{ "tool": "update_file", "path": "src/App.tsx" }\n';
    prompt += '<<<<<<<CODE\n';
    prompt += '<<<<<<< SEARCH\n';
    prompt += '기존 코드\n';
    prompt += '=======\n';
    prompt += '새 코드\n';
    prompt += '>>>>>>> REPLACE\n';
    prompt += '>>>>>>>END\n';
    prompt += '```\n\n';

    prompt += '**코드 없는 도구 (read_file, list_files, run_command 등):**\n';
    prompt += '```\n';
    prompt += '{ "tool": "read_file", "path": "src/file.ts" }\n';
    prompt += '{ "tool": "list_files", "path": "src", "recursive": "true" }\n';
    prompt += '{ "tool": "run_command", "command": "npm install" }\n';
    prompt += '```\n\n';

    prompt += '### 여러 도구 동시 호출\n';
    prompt += '```\n';
    prompt += '{ "tool": "read_file", "path": "src/a.ts" }\n';
    prompt += '{ "tool": "read_file", "path": "src/b.ts" }\n';
    prompt += '```\n\n';

    prompt += '**⛔ 금지된 형식 (사용하지 마세요):**\n';
    prompt += '- ` ```json ``` ` 블록 안에 도구 호출\n';
    prompt += '- XML 태그 형식\n';
    prompt += '- 위 형식 외의 모든 변형\n\n';

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

        prompt += '**⚠️ SEARCH 블록 무결성 규칙 (필수) ⚠️**\n';
        prompt += 'SEARCH 블록에는 반드시:\n';
        prompt += '- **현재 파일의 내용을 그대로 복사**해서 사용하세요 (read_file 결과에서 복사)\n';
        prompt += '- **수정 전 코드에 오타, 중복, 누락을 절대 만들지 마세요**\n';
        prompt += '- **기존 코드 구조를 재작성하거나 변형하지 마세요**\n';
        prompt += '- SEARCH 블록이 현재 파일 내용과 정확히 일치하지 않으면 수정이 실패합니다\n\n';

        prompt += '**흔한 실수 (절대 금지):**\n';
        prompt += '- ❌ `export default App;}` (중복 중괄호)\n';
        prompt += '- ❌ 코드 블록 누락 또는 추가\n';
        prompt += '- ❌ 들여쓰기/공백 임의 변경\n';
        prompt += '- ❌ 세미콜론, 쉼표 임의 추가/삭제\n';
        prompt += '- ❌ 기억에 의존한 코드 작성 (반드시 read_file 결과 확인)\n\n';
    }

    prompt += '**파라미터:**\n';
    for (const param of spec.parameters) {
        prompt += `- \`${param.name}\`${param.required ? ' (필수)' : ' (선택)'}: ${param.description}\n`;
    }
    prompt += '\n';

    // 예시 - 백틱 코드블럭 형식으로 표시
    prompt += '**사용 예시:**\n';

    // create_file과 update_file은 CODE 블록 형식으로
    if (spec.name === Tool.CREATE_FILE) {
        prompt += '```\n';
        prompt += '{ "tool": "create_file", "path": "src/example.ts" }\n';
        prompt += '<<<<<<<CODE\n';
        prompt += '// 파일 내용\n';
        prompt += 'export function example() {\n';
        prompt += '    return "hello";\n';
        prompt += '}\n';
        prompt += '>>>>>>>END\n';
        prompt += '```\n\n';
    } else if (spec.name === Tool.UPDATE_FILE) {
        prompt += '```\n';
        prompt += '{ "tool": "update_file", "path": "src/App.tsx" }\n';
        prompt += '<<<<<<<CODE\n';
        prompt += '<<<<<<< SEARCH\n';
        prompt += '기존 코드\n';
        prompt += '=======\n';
        prompt += '새 코드\n';
        prompt += '>>>>>>> REPLACE\n';
        prompt += '>>>>>>>END\n';
        prompt += '```\n\n';
    } else {
        // 다른 도구들은 간단한 JSON 형식
        prompt += '```\n';
        prompt += `{ "tool": "${spec.name}"`;
        for (const param of spec.parameters) {
            if (param.required) {
                let exampleValue = '...';
                if (param.name === 'path') exampleValue = 'src/example.ts';
                else if (param.name === 'command') exampleValue = 'npm install';
                else if (param.name === 'pattern') exampleValue = 'TODO';
                prompt += `, "${param.name}": "${exampleValue}"`;
            }
        }
        prompt += ' }\n';
        prompt += '```\n\n';
    }

    return prompt;
}

/**
 * 작업 흐름 가이드라인 프롬프트
 */
export function getWorkflowGuidelinePrompt(): string {
    let prompt = '### 작업 흐름 가이드라인\n\n';

    // 파일 읽기 전략 (핵심!)
    prompt += '**⚠️ 파일 읽기 전략 (필수!):**\n';
    prompt += '파일을 읽기 전에 **반드시** `stat_file`로 파일 크기를 먼저 확인하세요.\n';
    prompt += '큰 파일을 전체 읽으면 컨텍스트가 낭비됩니다.\n\n';

    prompt += '| 라인 수 | 권장 방법 |\n';
    prompt += '|---------|----------|\n';
    prompt += '| ~200줄 | `read_file` 전체 읽기 |\n';
    prompt += '| 200~500줄 | `list_imports` + `read_file` 부분 읽기 |\n';
    prompt += '| 500줄+ | `stat_file` → `list_imports` → 필요한 범위만 읽기 |\n\n';

    prompt += '**파일 읽기 워크플로우 (권장):**\n';
    prompt += '```\n';
    prompt += '// 1단계: 파일 정보 확인\n';
    prompt += '{ "tool": "stat_file", "path": "src/chat.js" }\n';
    prompt += '// 2단계: 큰 파일이면 구조 파악\n';
    prompt += '{ "tool": "list_imports", "path": "src/chat.js" }\n';
    prompt += '// 3단계: 필요한 부분만 읽기\n';
    prompt += '{ "tool": "read_file", "path": "src/chat.js", "startLine": "200", "endLine": "350" }\n';
    prompt += '```\n\n';

    prompt += '**검색 후 컨텍스트 확인:**\n';
    prompt += '```\n';
    prompt += '{ "tool": "ripgrep_search", "pattern": "handleSubmit" }\n';
    prompt += '// 결과: src/chat.js:245에서 발견\n';
    prompt += '{ "tool": "expand_around_line", "path": "src/chat.js", "line": "245", "before": "15", "after": "15" }\n';
    prompt += '```\n\n';

    prompt += '**파일 수정 워크플로우:**\n';
    prompt += '```\n';
    prompt += '// 1단계: 먼저 파일 읽기 (필수!)\n';
    prompt += '{ "tool": "read_file", "path": "src/App.tsx" }\n';
    prompt += '// 2단계: 읽은 내용을 기반으로 수정\n';
    prompt += '{ "tool": "update_file", "path": "src/App.tsx" }\n';
    prompt += '<<<<<<<CODE\n';
    prompt += '<<<<<<< SEARCH\n';
    prompt += '기존 코드\n';
    prompt += '=======\n';
    prompt += '새 코드\n';
    prompt += '>>>>>>> REPLACE\n';
    prompt += '>>>>>>>END\n';
    prompt += '```\n\n';

    return prompt;
}

/**
 * 중요 규칙 프롬프트
 */
export function getImportantRulesPrompt(): string {
    let prompt = '### 중요 규칙\n\n';

    // 🔥 도구 호출 전후 텍스트 금지 (가장 중요!)
    prompt += '**도구 호출 전후 텍스트 절대 금지:**\n';
    prompt += '- 도구 호출 전에 설명, 생각, 계획, 분석을 출력하지 마세요\n';
    prompt += '- 도구 호출 후에도 추가 설명을 출력하지 마세요\n';
    prompt += '- **오직 `{ "tool": ... }` JSON만 출력하세요**\n';
    prompt += '- 텍스트 출력은 UI 오류를 발생시킵니다\n\n';

    prompt += '❌ **잘못된 예시 (절대 금지):**\n';
    prompt += '```\n';
    prompt += '파일을 먼저 읽어보겠습니다.\n';
    prompt += '{ "tool": "read_file", "path": "src/app.ts" }\n';
    prompt += '```\n\n';

    prompt += '✅ **올바른 예시:**\n';
    prompt += '```\n';
    prompt += '{ "tool": "read_file", "path": "src/app.ts" }\n';
    prompt += '```\n\n';

    prompt += '**⚠️ 출력 형식 (절대 준수):**\n';
    prompt += '- **오직 `{ "tool": "..." }` 형식만 사용하세요**\n';
    prompt += '- XML 태그 형식은 **사용 금지**\n';
    prompt += '- 설명, 생각, 분석, 계획 텍스트는 시스템이 무시합니다\n';
    prompt += '- 도구 호출 외의 모든 텍스트는 무효 처리됩니다\n\n';
    prompt += '**파일 작업 규칙:**\n';
    prompt += '1. **update_file 전에 read_file 필수**: 파일 수정 전 반드시 최신 내용을 읽으세요.\n';
    prompt += '2. **create_file은 <<<<<<<CODE 필수**: 빈 코드 블록은 허용되지 않습니다.\n';
    prompt += '3. **수정 범위가 넓으면 create_file 사용**: 전체를 다시 작성하세요.\n';
    prompt += '4. **일괄 수정 금지**: sed -i 대신 read_file → update_file 순서로.\n\n';
    prompt += '** 파일 삭제 규칙 (절대 금지):**\n';
    prompt += '- **테스트/빌드/검증 실패 시 파일 삭제 금지**: 에러 해결을 위해 기존 파일을 삭제하지 마세요.\n';
    prompt += '- **remove_file은 사용자가 명시적으로 요청한 경우에만 사용**\n';
    prompt += '- **에러 해결 방법**: 파일을 삭제하는 대신 코드를 수정하거나 설정을 변경하세요.\n\n';
    prompt += '**올바른 응답:**\n';
    prompt += '```\n';
    prompt += '{ "tool": "read_file", "path": "src/App.tsx" }\n';
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
