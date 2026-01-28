/**
 * Tool Spec Builder
 * 프롬프트에 포함될 툴 스펙을 생성하는 빌더
 *
 * v8.9.0: JSON Function Calling 지원 추가
 * - buildFunctionDeclarations(): Gemini/OpenAI 호환 function declarations
 * - buildToolPromptSectionJson(): JSON 기반 도구 호출 프롬프트
 */

import { ToolSpec, Tool } from './types';
import { buildToolPromptSection } from '../managers/context/prompts/tools';

/**
 * JSON Schema 형식의 Function Declaration (Gemini/OpenAI 호환)
 */
export interface FunctionDeclaration {
    name: string;
    description: string;
    parameters: {
        type: 'object';
        properties: Record<string, {
            type: string;
            description: string;
            enum?: string[];
        }>;
        required: string[];
    };
}

/**
 * Native Function Call 응답 형식
 */
export interface FunctionCall {
    name: string;
    args: Record<string, any>;
}

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
                description: '지정된 경로의 파일 내용을 읽습니다. 여러 파일을 한 번에 읽으려면 <paths> 태그에 쉼표로 구분된 경로 목록을 제공하거나, 여러 <path> 태그를 사용할 수 있습니다. 큰 파일의 경우 startLine과 endLine을 사용하여 특정 범위만 읽을 수 있습니다.',
                parameters: [
                    { name: 'path', required: false, description: '읽을 파일 경로 (단일 파일인 경우)', type: 'string' },
                    { name: 'paths', required: false, description: '읽을 파일 경로 목록 (쉼표로 구분된 문자열 또는 여러 <path> 태그)', type: 'string' },
                    { name: 'startLine', required: false, description: '읽기 시작할 줄 번호 (1부터 시작, 생략하면 처음부터)', type: 'number' },
                    { name: 'endLine', required: false, description: '읽기 끝낼 줄 번호 (포함, 생략하면 끝까지)', type: 'number' }
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
                description: 'ripgrep(rg)을 사용하여 파일 내용을 검색합니다. 대규모 프로젝트에서 매우 빠릅니다. **권장 플로우**: 여러 파일에서 동일한 텍스트를 찾아 수정해야 할 때는 1) ripgrep_search로 패턴 검색, 2) read_file로 각 파일 내용 확인, 3) update_file로 SEARCH/REPLACE 블록 사용하여 수정. find + sed -i 같은 쉘 명령어는 절대 사용하지 마세요.',
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
                description: '프로젝트 디렉토리에서 터미널 명령을 실행합니다. **⚠️ 중요: 파일 일괄 수정(find + sed 등)은 절대 사용하지 마세요. 대신 ripgrep_search → read_file → update_file 플로우를 사용하세요.**',
                parameters: [
                    { name: 'command', required: true, description: '실행할 명령어. **절대 금지: find + sed -i, perl -i, xargs sed 등 파일 일괄 수정 명령어**', type: 'string' },
                    { name: 'timeout', required: false, description: '명령어 타임아웃 (초)', type: 'string' }
                ]
            });
        }

        // expand_around_line - 특정 라인 주변 컨텍스트 읽기
        if (!allowedTools || allowedTools.includes(Tool.EXPAND_AROUND_LINE)) {
            specs.push({
                name: Tool.EXPAND_AROUND_LINE,
                description: '특정 라인 번호를 중심으로 주변 컨텍스트를 읽습니다. ripgrep_search 결과에서 찾은 라인의 주변 코드를 확인할 때 유용합니다.',
                parameters: [
                    { name: 'path', required: true, description: '읽을 파일 경로', type: 'string' },
                    { name: 'line', required: true, description: '중심 라인 번호 (1부터 시작)', type: 'number' },
                    { name: 'before', required: false, description: '중심 라인 위로 읽을 라인 수 (기본값: 20)', type: 'number' },
                    { name: 'after', required: false, description: '중심 라인 아래로 읽을 라인 수 (기본값: 20)', type: 'number' }
                ]
            });
        }

        // list_imports - 파일의 import/export 문 추출
        if (!allowedTools || allowedTools.includes(Tool.LIST_IMPORTS)) {
            specs.push({
                name: Tool.LIST_IMPORTS,
                description: '파일의 import/export 문을 추출합니다. 파일의 의존성과 내보내기를 빠르게 파악할 때 유용합니다. JS/TS, Python, Java, Go, Rust, C/C++ 등 다양한 언어를 지원합니다.',
                parameters: [
                    { name: 'path', required: true, description: '분석할 파일 경로', type: 'string' }
                ]
            });
        }

        // stat_file - 파일 메타데이터 조회
        if (!allowedTools || allowedTools.includes(Tool.STAT_FILE)) {
            specs.push({
                name: Tool.STAT_FILE,
                description: '파일의 메타데이터와 구조 요약을 조회합니다. 파일 크기, 라인 수, 수정 시간, 그리고 클래스/함수/인터페이스 등의 심볼 목록을 반환합니다. 파일 내용을 읽지 않고 구조만 파악할 때 유용합니다.',
                parameters: [
                    { name: 'path', required: true, description: '조회할 파일 경로', type: 'string' },
                    { name: 'symbols', required: false, description: '심볼(클래스, 함수 등) 추출 여부 (기본값: true)', type: 'string' }
                ]
            });
        }

        return specs;
    }

    /**
     * @deprecated XML 형식은 더 이상 사용되지 않습니다. buildToolPromptSectionJson()을 사용하세요.
     */
    static buildToolPromptSection(allowedTools?: Tool[]): string {
        // JSON Function Calling으로 리다이렉트
        return this.buildToolPromptSectionJson(allowedTools);
    }

    // ==================== JSON Function Calling 지원 (v8.9.0) ====================

    /**
     * Gemini/OpenAI 호환 Function Declarations 생성
     * Native API function calling에 사용됩니다.
     */
    static buildFunctionDeclarations(allowedTools?: Tool[]): FunctionDeclaration[] {
        const specs = this.buildToolSpecs(allowedTools);
        return specs.map(spec => this.specToFunctionDeclaration(spec));
    }

    /**
     * ToolSpec을 FunctionDeclaration으로 변환
     */
    private static specToFunctionDeclaration(spec: ToolSpec): FunctionDeclaration {
        const properties: Record<string, { type: string; description: string }> = {};
        const required: string[] = [];

        for (const param of spec.parameters) {
            properties[param.name] = {
                type: param.type || 'string',
                description: param.description
            };
            if (param.required) {
                required.push(param.name);
            }
        }

        return {
            name: spec.name,
            description: spec.description,
            parameters: {
                type: 'object',
                properties,
                required
            }
        };
    }

    /**
     * JSON 기반 도구 호출 프롬프트 섹션 생성
     * v8.9.0: XML 대신 JSON Function Calling 형식 사용
     */
    static buildToolPromptSectionJson(allowedTools?: Tool[]): string {
        const specs = this.buildToolSpecs(allowedTools);
        return buildToolPromptSection(specs);
    }

    /**
     * Gemini API용 tools 설정 객체 생성
     */
    static buildGeminiToolsConfig(allowedTools?: Tool[]): {
        functionDeclarations: FunctionDeclaration[];
    } {
        return {
            functionDeclarations: this.buildFunctionDeclarations(allowedTools)
        };
    }

    /**
     * OpenAI/Ollama 호환 tools 설정 객체 생성
     */
    static buildOpenAIToolsConfig(allowedTools?: Tool[]): Array<{
        type: 'function';
        function: FunctionDeclaration;
    }> {
        const declarations = this.buildFunctionDeclarations(allowedTools);
        return declarations.map(decl => ({
            type: 'function' as const,
            function: decl
        }));
    }
}

