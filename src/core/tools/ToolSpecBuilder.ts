/**
 * Tool Spec Builder
 * 프롬프트에 포함될 툴 스펙을 생성하는 빌더
 */

import { ToolSpec, Tool } from './types';

export class ToolSpecBuilder {
    /**
     * 모든 툴 스펙 생성 (프롬프트에 포함)
     */
    static buildToolSpecs(allowedTools?: Tool[]): ToolSpec[] {
        const specs: ToolSpec[] = [];

        // create_file
        if (!allowedTools || allowedTools.includes(Tool.CREATE_FILE)) {
            specs.push({
                name: Tool.CREATE_FILE,
                description: '새 파일을 생성하거나 기존 파일을 덮어씁니다. 필요한 디렉토리는 자동으로 생성됩니다.',
                parameters: [
                    { name: 'path', required: true, description: '작성할 파일 경로 (프로젝트 루트 기준 상대 경로)', type: 'string' },
                    { name: 'content', required: true, description: '파일에 작성할 전체 내용', type: 'string' }
                ]
            });
        }

        // update_file
        if (!allowedTools || allowedTools.includes(Tool.UPDATE_FILE)) {
            specs.push({
                name: Tool.UPDATE_FILE,
                description: '기존 파일의 특정 부분만 수정합니다. 전체 파일을 덮어쓰지 않습니다. **CRITICAL: update_file을 사용하기 전에 반드시 read_file로 최신 파일 내용을 먼저 읽어야 합니다.**',
                parameters: [
                    { name: 'path', required: true, description: '수정할 파일 경로', type: 'string' },
                    { name: 'diff', required: true, description: 'SEARCH/REPLACE 블록 형식:\n<<<<<<< SEARCH\n[정확한 현재 파일 내용]\n=======\n[새 내용]\n>>>>>>> REPLACE\n\n**중요:** SEARCH 블록의 내용은 반드시 read_file로 읽은 최신 파일 내용과 정확히 일치해야 합니다. 공백, 들여쓰기, 줄바꿈까지 정확히 일치해야 합니다.', type: 'string' }
                ]
            });
        }

        // remove_file
        if (!allowedTools || allowedTools.includes(Tool.REMOVE_FILE)) {
            specs.push({
                name: Tool.REMOVE_FILE,
                description: '프로젝트에서 파일을 삭제합니다.',
                parameters: [
                    { name: 'path', required: true, description: '삭제할 파일 경로', type: 'string' }
                ]
            });
        }

        // read_file
        if (!allowedTools || allowedTools.includes(Tool.READ_FILE)) {
            specs.push({
                name: Tool.READ_FILE,
                description: '지정된 경로의 파일 내용을 읽습니다. 여러 파일을 한 번에 읽으려면 <paths> 태그에 쉼표로 구분된 경로 목록을 제공하거나, 여러 <path> 태그를 사용할 수 있습니다.',
                parameters: [
                    { name: 'path', required: false, description: '읽을 파일 경로 (단일 파일인 경우)', type: 'string' },
                    { name: 'paths', required: false, description: '읽을 파일 경로 목록 (쉼표로 구분된 문자열 또는 여러 <path> 태그)', type: 'string' }
                ]
            });
        }

        // list_files
        if (!allowedTools || allowedTools.includes(Tool.LIST_FILES)) {
            specs.push({
                name: Tool.LIST_FILES,
                description: '지정된 디렉토리 내의 파일과 디렉토리를 나열합니다.',
                parameters: [
                    { name: 'path', required: false, description: '디렉토리 경로 (기본값: 프로젝트 루트)', type: 'string' },
                    { name: 'recursive', required: false, description: '재귀적으로 나열할지 여부 (true/false)', type: 'string' }
                ]
            });
        }

        // search_files
        if (!allowedTools || allowedTools.includes(Tool.SEARCH_FILES)) {
            specs.push({
                name: Tool.SEARCH_FILES,
                description: '정규식을 사용하여 파일에서 패턴을 검색합니다.',
                parameters: [
                    { name: 'path', required: false, description: '검색할 디렉토리 (기본값: 프로젝트 루트)', type: 'string' },
                    { name: 'pattern', required: true, description: '검색할 정규식 패턴', type: 'string' },
                    { name: 'filePattern', required: false, description: '파일 패턴 필터 (예: *.ts)', type: 'string' },
                    { name: 'maxResults', required: false, description: '최대 결과 수', type: 'string' }
                ]
            });
        }

        // ripgrep_search
        if (!allowedTools || allowedTools.includes(Tool.RIPGREP_SEARCH)) {
            specs.push({
                name: Tool.RIPGREP_SEARCH,
                description: 'ripgrep(rg)을 사용하여 파일 내용을 검색합니다. 대규모 프로젝트에서 매우 빠릅니다.',
                parameters: [
                    { name: 'pattern', required: true, description: '검색할 정규식 또는 키워드', type: 'string' },
                    { name: 'path', required: false, description: '검색할 디렉토리 (기본값: 프로젝트 루트)', type: 'string' },
                    { name: 'include', required: false, description: '포함할 파일 패턴 (쉼표로 구분)', type: 'string' },
                    { name: 'exclude', required: false, description: '제외할 파일 패턴 (쉼표로 구분)', type: 'string' },
                    { name: 'caseSensitive', required: false, description: '대소문자 구분 여부 (true/false)', type: 'string' },
                    { name: 'contextLines', required: false, description: '주변 컨텍스트 라인 수 (기본: 2)', type: 'string' }
                ]
            });
        }

        // run_command
        if (!allowedTools || allowedTools.includes(Tool.RUN_COMMAND)) {
            specs.push({
                name: Tool.RUN_COMMAND,
                description: '프로젝트 디렉토리에서 터미널 명령을 실행합니다.',
                parameters: [
                    { name: 'command', required: true, description: '실행할 명령어', type: 'string' },
                    { name: 'timeout', required: false, description: '명령어 타임아웃 (초)', type: 'string' }
                ]
            });
        }

        return specs;
    }

    static buildToolPromptSection(allowedTools?: Tool[]): string {
        const specs = this.buildToolSpecs(allowedTools);
        let prompt = '## 도구 호출 및 응답 규칙 (CRITICAL)\n\n';
        prompt += '1. **작업 수행은 반드시 XML 도구 호출을 사용하세요.**\n';
        prompt += '2. **한국어 설명과 도구 호출을 병행할 수 있습니다.**\n';
        prompt += '   - 예: "파일 목록을 확인하겠습니다. <list_files><path>src</path></list_files>"\n';
        prompt += '3. **내부 독백(English Thinking)을 최소화하고 즉시 한국어 설명이나 도구 호출을 하세요.**\n';
        prompt += '4. **"해야 한다"는 말만 하지 말고 실제 도구를 호출하세요.**\n';
        prompt += '   - 잘못됨: "src/App.tsx 파일을 읽어야 합니다." (텍스트만 출력)\n';
        prompt += '   - 올바름: "src/App.tsx 파일을 읽어 내용을 확인하겠습니다. <read_file><path>src/App.tsx</path></read_file>"\n';
        prompt += '5. **JSON 형식을 절대 사용하지 마세요.** 응답은 순수 텍스트와 XML이어야 합니다.\n';
        prompt += '6. **마크다운 코드 블록(```)을 절대 사용하지 마세요.** 모든 코드는 XML 도구 내부에 있어야 합니다.\n';
        prompt += '7. **수정 범위가 넓거나 복잡한 경우**: `update_file` 대신 `create_file`을 사용하여 파일 전체 내용을 새로 작성하세요. 특히 한 번의 응답에서 여러 파일을 다루는 경우 이것이 훨씬 안전합니다.\n';
        prompt += '8. **도구 호출 시 텍스트 설명을 생략하세요.** "파일을 생성합니다"와 같은 말 없이 즉시 XML 도구를 출력하세요. 도구 호출이 포함된 응답에서 텍스트 요약은 불필요한 토큰만 낭비합니다.\n';
        prompt += '9. **최종 요약은 마지막에만**: 모든 도구 실행 결과가 수집된 후, 마지막 턴에서만 한국어로 상세 요약을 제공하세요.\n\n';

        prompt += '### 도구 목록\n\n';

        for (const spec of specs) {
            prompt += `### ${spec.name}\n`;
            prompt += `${spec.description}\n\n`;

            // update_file에 대한 특별 경고
            if (spec.name === Tool.UPDATE_FILE) {
                prompt += '**⚠️ CRITICAL WARNING ⚠️**\n';
                prompt += '`update_file`을 사용하기 전에 **반드시** `read_file`로 최신 파일 내용을 먼저 읽어야 합니다!\n';
                prompt += '- 파일이 이미 수정되었을 수 있습니다\n';
                prompt += '- 이전에 읽은 내용이나 추측을 기반으로 SEARCH 패턴을 만들면 실패합니다\n';
                prompt += '- `read_file` 없이 `update_file`을 사용하면 SEARCH 패턴이 일치하지 않아 실패합니다\n';
                prompt += '- **항상 `read_file` → `update_file` 순서로 사용하세요**\n';
                prompt += '\n';
            }

            prompt += '**매개변수:**\n';
            for (const param of spec.parameters) {
                prompt += `- ${param.name}${param.required ? ' (필수)' : ' (선택)'}: ${param.description}\n`;
            }
            prompt += `\n**XML 사용 예시:**\n`;

            // update_file 예시에 read_file 추가
            if (spec.name === Tool.UPDATE_FILE) {
                prompt += '```\n';
                prompt += '<!-- 1단계: 먼저 파일 읽기 (필수!) -->\n';
                prompt += '<read_file>\n';
                prompt += '<path>파일/경로</path>\n';
                prompt += '</read_file>\n';
                prompt += '<!-- 2단계: 위에서 읽은 정확한 내용을 기반으로 update_file -->\n';
                prompt += `<${spec.name}>\n`;
                for (const param of spec.parameters) {
                    if (param.required) {
                        prompt += `<${param.name}>${param.name === 'content' ? '파일 내용' : param.name === 'path' ? '파일/경로' : '값'}</${param.name}>\n`;
                    }
                }
                prompt += `</${spec.name}>\n`;
                prompt += '```\n\n';
            } else {
                prompt += '```\n';
                prompt += `<${spec.name}>\n`;
                for (const param of spec.parameters) {
                    if (param.required) {
                        prompt += `<${param.name}>${param.name === 'content' ? '파일 내용' : param.name === 'path' ? '파일/경로' : '값'}</${param.name}>\n`;
                    }
                }
                prompt += `</${spec.name}>\n`;
                prompt += '```\n\n';
            }
        }

        prompt += '**작업 흐름 가이드라인:**\n';
        prompt += '- 파일을 수정하려면 변경 사항을 표시할 필요 없이 `update_file` 또는 `create_file` 도구를 직접 사용하세요.\n';
        prompt += '- **중요**: 사용자가 "수정해줘", "추가해줘", "생성해줘", "구현해줘" 등을 요청한 경우, `read_file`로 파일을 읽었다면 **반드시 같은 응답에서 `update_file` 또는 `create_file` 도구를 사용하여 실제 변경 사항을 구현해야 합니다.** 파일을 읽기만 하고 끝내지 마세요.\n';
        prompt += '- 예를 들어, 편집이나 개선을 요청받았을 때는 `list_files`를 사용하여 프로젝트 구조를 파악하고, `read_file`을 사용하여 관련 파일의 내용을 검토한 후, 코드를 분석하고 필요한 편집을 수행한 다음 **반드시 `update_file` 도구를 사용하여 변경 사항을 구현하세요.**\n';
        prompt += '- 코드베이스의 다른 부분에 영향을 줄 수 있는 코드를 리팩토링한 경우, `search_files`를 사용하여 필요에 따라 다른 파일도 업데이트하세요.\n';
        prompt += '- 새 기능을 추가할 때는 적절한 디렉토리 구조를 만들고 논리적으로 파일을 분할하세요. 모든 코드를 단일 파일에 넣지 마세요.\n';
        prompt += '- `create_file` 도구는 필요한 디렉토리를 자동으로 생성하므로, `src/components/Button.tsx` 또는 `src/utils/helpers.ts`와 같은 적절한 파일 경로를 사용하세요.\n';
        prompt += '- 모범 사례를 따르세요: 프로젝트 유형(React, Vue 등)에 따라 코드를 컴포넌트, 유틸리티, 훅, 서비스 등으로 분할하세요.\n';
        prompt += '\n';
        prompt += '**CRITICAL: update_file 사용 규칙**\n';
        prompt += '`update_file`을 사용하기 전에 **반드시** 다음 규칙을 따르세요:\n';
        prompt += '1. **항상 먼저 `read_file`로 최신 파일 내용을 읽으세요**\n';
        prompt += '   - 파일이 이미 수정되었을 수 있습니다\n';
        prompt += '   - 이전에 읽은 내용이나 추측을 기반으로 SEARCH 패턴을 만들지 마세요\n';
        prompt += '   - `update_file` 직전에 `read_file`을 실행하세요\n';
        prompt += '2. **SEARCH 블록은 read_file로 읽은 내용과 정확히 일치해야 합니다**\n';
        prompt += '   - 공백, 들여쓰기, 줄바꿈까지 가급적 정확히 유지하세요.\n';
        prompt += '   - 하지만 모델의 한계로 인해 미세한 공백 차이가 발생하더라도 시스템이 보정하여 매칭을 시도합니다.\n';
        prompt += '3. **실패가 예상되면 덮어쓰세요**: `SEARCH` 블록 매칭이 어려울 것 같거나 파일 구조가 크게 바뀐다면 즉시 `create_file` 도구로 파일 전체를 다시 작성하세요. 이것이 가장 확실한 방법입니다.\n';
        prompt += '4. **올바른 워크플로우 예시:**\n';
        prompt += '```\n';
        prompt += '<read_file>\n';
        prompt += '<path>src/App.tsx</path>\n';
        prompt += '</read_file>\n';
        prompt += '<!-- 위에서 읽은 정확한 파일 내용을 기반으로 SEARCH 블록 작성 -->\n';
        prompt += '<update_file>\n';
        prompt += '<path>src/App.tsx</path>\n';
        prompt += '<diff>\n<<<<<<< SEARCH\nimport React from \'react\';\nimport \'./App.css\';\n=======\nimport React from \'react\';\nimport { BrowserRouter } from \'react-router-dom\';\nimport \'./App.css\';\n>>>>>>> REPLACE\n</diff>\n';
        prompt += '</update_file>\n';
        prompt += '```\n';
        prompt += '4. **잘못된 워크플로우 (절대 하지 마세요):**\n';
        prompt += '   - `read_file` 없이 `update_file` 사용 \n';
        prompt += '   - 이전에 읽은 내용을 기반으로 추측하여 SEARCH 패턴 생성 \n';
        prompt += '   - 파일이 "아마도 이럴 것이다"라고 추측하여 SEARCH 패턴 생성 \n';
        prompt += '\n';
        prompt += '\n';
        prompt += '**중요: 파일 구성 규칙**\n';
        prompt += '- **단일 파일에 모든 코드를 넣지 마세요**\n';
        prompt += '- **컴포넌트, 유틸리티, 훅, 서비스 등을 별도 파일로 생성하세요**\n';
        prompt += '- **적절한 디렉토리 구조를 만드세요** (예: `src/components/`, `src/utils/`, `src/hooks/`)\n';
        prompt += '- **먼저 `list_files`를 사용하여 기존 프로젝트 구조를 이해하세요**\n';
        prompt += '- **기존 프로젝트의 파일 구성 패턴을 따르세요**\n';
        prompt += '\n';
        prompt += '**기능 추가 예시 워크플로우:**\n';
        prompt += '```\n';
        prompt += '<list_files>\n';
        prompt += '<path>src</path>\n';
        prompt += '<recursive>true</recursive>\n';
        prompt += '</list_files>\n';
        prompt += '<read_file>\n';
        prompt += '<path>src/App.tsx</path>\n';
        prompt += '</read_file>\n';
        prompt += '<create_file>\n';
        prompt += '<path>src/components/Button.tsx</path>\n';
        prompt += '<content>// Button 컴포넌트 코드</content>\n';
        prompt += '</create_file>\n';
        prompt += '<create_file>\n';
        prompt += '<path>src/utils/helpers.ts</path>\n';
        prompt += '<content>// 헬퍼 함수</content>\n';
        prompt += '</create_file>\n';
        prompt += '<!-- update_file 전에 반드시 read_file로 최신 내용 확인 -->\n';
        prompt += '<read_file>\n';
        prompt += '<path>src/App.tsx</path>\n';
        prompt += '</read_file>\n';
        prompt += '<!-- 위 read_file 결과를 기반으로 정확한 SEARCH 블록 작성 -->\n';
        prompt += '<update_file>\n';
        prompt += '<path>src/App.tsx</path>\n';
        prompt += '<diff>\n<<<<<<< SEARCH\nimport React from \'react\';\n=======\nimport React from \'react\';\nimport Button from \'./components/Button\';\nimport { helper } from \'./utils/helpers\';\n>>>>>>> REPLACE\n</diff>\n';
        prompt += '</update_file>\n';
        prompt += '```\n';
        prompt += '\n';
        prompt += '**명령 실행 규칙 (execution_work):**\n';
        prompt += '사용자가 명령 실행을 요청하면 (예: "npm install 해줘", "빌드해줘", "psql로 실행해줘", "파일 실행해줘" 등):\n';
        prompt += '1. **필요한 파일을 찾아야 하는 경우**: 먼저 `search_files` 또는 `list_files` XML 도구를 사용하세요.\n';
        prompt += '2. **명령 실행**: 반드시 `run_command` XML 도구를 사용하세요.\n';
        prompt += '\n';
        prompt += '**올바른 형식:**\n';
        prompt += '```\n';
        prompt += '<run_command>\n';
        prompt += '<command>실행할 명령어</command>\n';
        prompt += '</run_command>\n';
        prompt += '```\n';
        prompt += '\n';
        prompt += '**잘못된 형식 (절대 사용 금지):**\n';
        prompt += '```\n';
        prompt += '```bash\n';
        prompt += '명령어\n';
        prompt += '```\n';
        prompt += '```\n';
        prompt += '\n';
        prompt += '**작업 완료 후 정보 제공:**\n';
        prompt += '도구 호출 실행이 완료되면, 시스템이 자동으로 다음 정보를 사용자에게 표시합니다:\n';
        prompt += '- 생성된 파일 목록 (파일명, 경로, 라인 수, 전체 내용)\n';
        prompt += '- 수정된 파일 목록 (파일명, 경로, 라인 수, 전체 내용)\n';
        prompt += '- 삭제된 파일 목록\n';
        prompt += '- 실행 결과 요약 (성공/실패 개수)\n';
        prompt += '\n';
        prompt += '**최종 주의사항:**\n';
        prompt += '- **XML 형식만** - JSON, 텍스트, 마크다운 사용 금지\n';
        prompt += '- **XML만 출력** - 설명이나 "We will..." 같은 텍스트 추가 금지\n';
        prompt += '- **`response` 필드에 반드시 포함** - `thinking`이나 다른 필드가 아님\n';
        prompt += '- **thinking은 비워두고**, 모든 XML 도구 호출을 `response`에 넣으세요 (response를 비워두면 실패)\n';
        prompt += '- **create_file 호출 시 `content`는 필수**: 전체 파일 내용을 넣지 않으면 실패합니다. 빈 content 금지.\n';
        prompt += '- **여러 도구 사용** - 여러 XML 블록을 연속으로 사용\n';
        prompt += '- **항상 먼저 `list_files` 사용** - 변경하기 전에 프로젝트 구조 이해\n';
        prompt += '- **여러 파일로 코드 분할** - 모든 것을 하나의 파일에 넣지 마세요\n';
        prompt += '\n';
        prompt += '**기억하세요:** 응답에는 XML 도구 호출만 포함되어야 하며, 그 외에는 아무것도 없어야 합니다. ';
        prompt += 'XML은 응답의 가장 바깥쪽에 있어야 하며, `thinking` 내부에 있으면 안 됩니다.\n';
        prompt += '\n';
        prompt += '**중요: 모든 응답 가이드라인**\n';
        prompt += '- 도구 호출이 필요한 경우: 즉시 해당 XML 블록을 출력하세요.\n';
        prompt += '- 단순 인사, 질문, 설명 등: 즉시 한국어 텍스트로 답변하세요.\n';
        prompt += '- **절대 JSON 형식을 사용하지 마세요.** 응답은 순수 텍스트이거나 XML이어야 합니다.\n';
        prompt += '- **thinking은 추론용으로만 사용**하고, 실제 답변은 thinking 블록 외부에 작성하세요.\n';

        return prompt;
    }
}

