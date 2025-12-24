/**
 * Tool Spec Builder
 * 프롬프트에 포함될 툴 스펙을 생성하는 빌더
 */

import { ToolSpec, Tool } from './types';

export class ToolSpecBuilder {
    /**
     * 모든 툴 스펙 생성 (프롬프트에 포함)
     */
    static buildToolSpecs(): ToolSpec[] {
        const specs: ToolSpec[] = [];

        // create_file (기존 CODE_GENERATION과 매핑)
        specs.push({
            name: Tool.CREATE_FILE,
            description: '새 파일을 생성하거나 기존 파일을 덮어씁니다. 필요한 디렉토리는 자동으로 생성됩니다.',
            parameters: [
                { name: 'path', required: true, description: '작성할 파일 경로 (프로젝트 루트 기준 상대 경로)', type: 'string' },
                { name: 'content', required: true, description: '파일에 작성할 전체 내용', type: 'string' }
            ]
        });

        // update_file (기존 FILE_OPERATION UPDATE와 매핑)
        specs.push({
            name: Tool.UPDATE_FILE,
            description: '기존 파일의 특정 부분만 수정합니다. 전체 파일을 덮어쓰지 않습니다.',
            parameters: [
                { name: 'path', required: true, description: '수정할 파일 경로', type: 'string' },
                { name: 'diff', required: true, description: 'SEARCH/REPLACE 블록 형식: ------- SEARCH\n[내용]\n=======\n[새 내용]\n------- REPLACE', type: 'string' }
            ]
        });

        // remove_file (기존 FILE_OPERATION DELETE와 매핑)
        specs.push({
            name: Tool.REMOVE_FILE,
            description: '프로젝트에서 파일을 삭제합니다.',
            parameters: [
                { name: 'path', required: true, description: '삭제할 파일 경로', type: 'string' }
            ]
        });

        // read_file (기존 FILE_READ와 매핑)
        specs.push({
            name: Tool.READ_FILE,
            description: '지정된 경로의 파일 내용을 읽습니다.',
            parameters: [
                { name: 'path', required: true, description: '읽을 파일 경로', type: 'string' }
            ]
        });

        // list_files (기존 FILE_LIST와 매핑)
        specs.push({
            name: Tool.LIST_FILES,
            description: '지정된 디렉토리 내의 파일과 디렉토리를 나열합니다.',
            parameters: [
                { name: 'path', required: false, description: '디렉토리 경로 (기본값: 프로젝트 루트)', type: 'string' },
                { name: 'recursive', required: false, description: '재귀적으로 나열할지 여부 (true/false)', type: 'string' }
            ]
        });

        // search_files (기존 FILE_SEARCH와 매핑)
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

        // run_command (기존 TERMINAL_COMMAND와 매핑)
        specs.push({
            name: Tool.RUN_COMMAND,
            description: '프로젝트 디렉토리에서 터미널 명령을 실행합니다.',
            parameters: [
                { name: 'command', required: true, description: '실행할 명령어', type: 'string' },
                { name: 'timeout', required: false, description: '명령어 타임아웃 (초)', type: 'string' }
            ]
        });

        return specs;
    }

    /**
     * 프롬프트용 툴 설명 텍스트 생성
     */
    static buildToolPromptSection(): string {
        const specs = this.buildToolSpecs();
        let prompt = '## 도구 (TOOLS)\n\n';
        prompt += '**매우 중요**\n';
        prompt += '1. **모든 작업은 반드시 XML 도구 호출로 수행해야 합니다.**\n';
        prompt += '2. **마크다운 코드 블록(```bash, ```sh, ```python 등)은 절대 사용하지 마세요.**\n';
        prompt += '   - 잘못됨: ```bash\\n명령어\\n```\n';
        prompt += '   - 올바름: <run_command><command>명령어</command></run_command>\n';
        prompt += '3. **명령 실행 요청은 반드시 `<run_command>` XML 도구를 사용하세요.**\n';
        prompt += '   - "npm install 해줘" → <run_command><command>npm install</command></run_command>\n';
        prompt += '   - "빌드해줘" → <run_command><command>npm run build</command></run_command>\n';
        prompt += '   - "파일 실행해줘" → 먼저 파일 찾기, 그 다음 <run_command> 사용\n';
        prompt += '4. **파일을 찾아야 하는 경우 먼저 `<search_files>` 또는 `<list_files>` XML 도구를 사용하세요.**\n';
        prompt += '5. **JSON 형식을 사용하지 마세요.** **텍스트 설명을 추가하지 마세요.** **XML만 출력하세요.**\n';
        prompt += '6. **`thinking` 필드는 비워두고, 모든 XML 도구 호출을 `response` 필드에 넣으세요.**\n';
        prompt += '7. **어떤 명령이든, 어떤 복잡도든 상관없이 항상 XML 도구 호출을 사용하세요.**\n\n';
        prompt += '**중요: 도구 호출 형식 규칙**\n';
        prompt += '1. **XML 형식만 허용됨** - JSON, 텍스트 설명, 혼합 형식 사용 금지\n';
        prompt += '2. **모든 도구 호출은 XML 형식이어야 함**: `<tool_name>...</tool_name>`\n';
        prompt += '3. **매개변수는 XML 태그로 감싸야 함**: `<param_name>value</param_name>`\n';
        prompt += '4. **XML 앞뒤에 텍스트 없음** - XML 도구 호출만 출력\n';
        prompt += '5. **JSON 형식 사용 금지** - `{"tool": "...", "path": "..."}` 형식 사용 금지\n';
        prompt += '6. **설명 추가 금지** - "We will call..." 같은 텍스트 작성 금지\n';
        prompt += '\n';
        prompt += '**올바른 예시 (XML만):**\n';
        prompt += '```\n';
        prompt += '<read_file>\n';
        prompt += '<path>src/App.tsx</path>\n';
        prompt += '</read_file>\n';
        prompt += '```\n\n';
        prompt += '**또 다른 올바른 예시:**\n';
        prompt += '```\n';
        prompt += '<create_file>\n';
        prompt += '<path>src/App.tsx</path>\n';
        prompt += '<content>import React from \'react\';\n\nexport default function App() {\n  return <div>Hello</div>;\n}</content>\n';
        prompt += '</create_file>\n';
        prompt += '```\n\n';

        for (const spec of specs) {
            prompt += `### ${spec.name}\n`;
            prompt += `${spec.description}\n\n`;
            prompt += '**매개변수:**\n';
            for (const param of spec.parameters) {
                prompt += `- ${param.name}${param.required ? ' (필수)' : ' (선택)'}: ${param.description}\n`;
            }
            prompt += `\n**XML 사용 예시:**\n`;
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

        prompt += '**작업 흐름 가이드라인:**\n';
        prompt += '사용자가 기능 추가나 코드 수정을 요청할 때 다음 워크플로우를 따르세요:\n';
        prompt += '1. **먼저 프로젝트 구조 파악**: 변경하기 전에 `list_files`를 사용하여 프로젝트 디렉토리 구조를 탐색하세요. 파일이 어떻게 구성되어 있는지 이해하는 데 도움이 됩니다.\n';
        prompt += '2. **기존 코드 분석**: `read_file`를 사용하여 관련 파일을 검토하여 현재 코드베이스 구조와 패턴을 이해하세요.\n';
        prompt += '3. **파일 구성 계획**: 새 기능을 추가할 때 적절한 디렉토리 구조를 만들고 논리적으로 파일을 분할하세요. 단일 파일에 모든 코드를 넣지 마세요.\n';
        prompt += '4. **필요한 디렉토리 생성**: `create_file` 도구는 필요한 디렉토리를 자동으로 생성하므로, `src/components/Button.tsx` 또는 `src/utils/helpers.ts` 같은 적절한 파일 경로를 사용하세요.\n';
        prompt += '5. **모범 사례 따르기**: 프로젝트 유형(React, Vue 등)에 따라 컴포넌트, 유틸리티, 훅 등으로 코드를 분할하세요.\n';
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
        prompt += '<update_file>\n';
        prompt += '<path>src/App.tsx</path>\n';
        prompt += '<diff>------- SEARCH\nimport React from \'react\';\n=======\nimport React from \'react\';\nimport Button from \'./components/Button\';\nimport { helper } from \'./utils/helpers\';\n------- REPLACE</diff>\n';
        prompt += '</update_file>\n';
        prompt += '```\n\n';
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
        prompt += 'XML은 `response` 필드에 있어야 하며, `thinking`에 있으면 안 됩니다. ';
        prompt += '도구 호출을 `thinking`에만 넣으면 실행되지 않습니다.\n';

        return prompt;
    }
}

