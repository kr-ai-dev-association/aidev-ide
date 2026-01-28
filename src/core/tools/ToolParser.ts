/**
 * Tool Parser
 * LLM 응답에서 도구 호출을 파싱하는 클래스
 *
 * v8.9.7: 새로운 CODE 블록 형식 전용
 *   - JSON + <<<<<<<CODE / >>>>>>>END 형식
 *   - 스트리밍 지원 및 코드 내 ``` 충돌 방지
 *   - function_call/function_calls 형식 제거
 *
 * 지원 형식:
 *    { "tool": "create_file", "path": "..." }
 *    <<<<<<<CODE
 *    코드 내용
 *    >>>>>>>END
 *
 *    { "tool": "read_file", "path": "src/file.ts" }
 */

import { ToolUse, Tool } from './types';

export class ToolParser {
    // CODE 블록 마커 상수
    private static readonly CODE_START_MARKER = '<<<<<<<CODE';
    private static readonly CODE_END_MARKER = '>>>>>>>END';

    /**
     * LLM 응답에서 새로운 CODE 블록 형식 파싱
     *
     * 형식:
     * { "tool": "create_file", "path": "src/example.py", "lang": "python" }
     * <<<<<<<CODE
     * 코드 내용
     * >>>>>>>END
     *
     * 또는 코드가 필요 없는 도구:
     * { "tool": "read_file", "path": "src/file.ts" }
     */
    static parseCodeBlockFormat(content: string, warnings?: string[]): ToolUse[] {
        const toolCalls: ToolUse[] = [];

        // JSON + CODE 블록 패턴 찾기
        // { "tool": "..." ... }로 시작하고, 선택적으로 <<<<<<<CODE ... >>>>>>>END가 따라옴
        const toolJsonPattern = /\{\s*["']tool["']\s*:\s*["']([^"']+)["'][^}]*\}/g;
        let match;

        while ((match = toolJsonPattern.exec(content)) !== null) {
            const jsonStr = match[0];
            const jsonEndIndex = match.index + jsonStr.length;

            try {
                const parsed = JSON.parse(jsonStr);
                const toolName = parsed.tool;

                if (!this.isValidToolName(toolName)) {
                    warnings?.push(`알 수 없는 도구: ${toolName}`);
                    continue;
                }

                // JSON 이후 CODE 블록 찾기
                const afterJson = content.substring(jsonEndIndex);
                const codeStartIndex = afterJson.indexOf(this.CODE_START_MARKER);
                const codeEndIndex = afterJson.indexOf(this.CODE_END_MARKER);

                let codeContent: string | undefined;

                // CODE 블록이 있고, 다음 JSON 이전에 있는 경우에만 사용
                if (codeStartIndex !== -1 && codeEndIndex !== -1 && codeStartIndex < codeEndIndex) {
                    // 다음 tool JSON이 CODE 블록 전에 있는지 확인
                    const nextToolMatch = /\{\s*["']tool["']\s*:/.exec(afterJson);
                    if (!nextToolMatch || nextToolMatch.index > codeEndIndex) {
                        // CODE 블록이 현재 도구에 속함
                        const codeStart = codeStartIndex + this.CODE_START_MARKER.length;
                        codeContent = afterJson.substring(codeStart, codeEndIndex).trim();
                    }
                }

                // ToolUse 생성
                const params: Record<string, string> = {};

                // path 파라미터 처리
                if (parsed.path) {
                    params.path = String(parsed.path);
                }

                // content/code 파라미터 처리
                if (codeContent !== undefined) {
                    // create_file, update_file의 content
                    if (toolName === Tool.CREATE_FILE) {
                        params.content = codeContent;
                    } else if (toolName === Tool.UPDATE_FILE) {
                        params.diff = codeContent;
                    } else {
                        params.content = codeContent;
                    }
                }

                // 기타 파라미터 복사
                for (const [key, value] of Object.entries(parsed)) {
                    if (key !== 'tool' && key !== 'lang' && !params[key]) {
                        params[key] = String(value);
                    }
                }

                // 필수 파라미터 검증
                const validationResult = this.validateToolParams(toolName, params);
                if (!validationResult.valid) {
                    warnings?.push(validationResult.message || '');
                    console.log(`[ToolParser] ${toolName} 스킵: ${validationResult.message}`);
                    continue;
                }

                toolCalls.push({
                    name: toolName as Tool,
                    params,
                    partial: false
                });

            } catch (error) {
                console.debug('[ToolParser] CODE 블록 JSON 파싱 실패:', jsonStr.substring(0, 100));
                warnings?.push(`JSON 파싱 실패: ${jsonStr.substring(0, 50)}...`);
            }
        }

        console.log(`[ToolParser] parseCodeBlockFormat result: ${toolCalls.length} tool calls found`, toolCalls.map(c => c.name));
        return toolCalls;
    }


    /**
     * 도구별 필수 파라미터 검증
     */
    private static validateToolParams(toolName: string, params: Record<string, string>): { valid: boolean; message?: string } {
        // create_file은 path와 content 필수
        if (toolName === Tool.CREATE_FILE) {
            if (!params.path || params.path.trim().length === 0) {
                return { valid: false, message: `create_file에 path가 없습니다` };
            }
            if (!params.content || params.content.trim().length === 0) {
                return { valid: false, message: `create_file에 content가 없습니다 (path=${params.path})` };
            }
        }

        // run_command는 command 필수
        if (toolName === Tool.RUN_COMMAND) {
            if (!params.command || params.command.trim().length === 0) {
                return { valid: false, message: `run_command에 command가 없습니다` };
            }
        }

        // ripgrep_search는 pattern 필수
        if (toolName === Tool.RIPGREP_SEARCH) {
            if (!params.pattern || params.pattern.trim().length === 0) {
                return { valid: false, message: `ripgrep_search에 pattern이 없습니다` };
            }
        }

        // read_file은 path 필수
        if (toolName === Tool.READ_FILE) {
            if (!params.path || params.path.trim().length === 0) {
                return { valid: false, message: `read_file에 path가 없습니다` };
            }
        }

        // list_files는 path가 undefined/null이면 안됨 (빈 문자열은 프로젝트 루트를 의미하므로 허용)
        if (toolName === Tool.LIST_FILES) {
            if (params.path === undefined || params.path === null) {
                return { valid: false, message: `list_files에 path가 없습니다` };
            }
            // 빈 문자열 ""은 프로젝트 루트를 의미하므로 유효함
        }

        // expand_around_line은 path와 line 필수
        if (toolName === Tool.EXPAND_AROUND_LINE) {
            if (!params.path || params.path.trim().length === 0) {
                return { valid: false, message: `expand_around_line에 path가 없습니다` };
            }
            if (!params.line || params.line.trim().length === 0) {
                return { valid: false, message: `expand_around_line에 line이 없습니다` };
            }
        }

        // list_imports는 path 필수
        if (toolName === Tool.LIST_IMPORTS) {
            if (!params.path || params.path.trim().length === 0) {
                return { valid: false, message: `list_imports에 path가 없습니다` };
            }
        }

        // stat_file은 path 필수
        if (toolName === Tool.STAT_FILE) {
            if (!params.path || params.path.trim().length === 0) {
                return { valid: false, message: `stat_file에 path가 없습니다` };
            }
        }

        return { valid: true };
    }

    /**
     * 도구 이름이 유효한지 확인
     */
    private static isValidToolName(name: string): boolean {
        return Object.values(Tool).includes(name as Tool);
    }

    /**
     * 문자열에서 첫 번째 JSON 객체 추출 (중첩 괄호 처리)
     * plan, task_progress 등 파싱에 사용
     */
    private static extractJsonObject(content: string): string | null {
        const jsonStart = content.indexOf('{');
        if (jsonStart === -1) return null;

        let depth = 0;
        let inString = false;
        let escape = false;

        for (let i = jsonStart; i < content.length; i++) {
            const char = content[i];

            if (escape) {
                escape = false;
                continue;
            }

            if (char === '\\') {
                escape = true;
                continue;
            }

            if (char === '"') {
                inString = !inString;
                continue;
            }

            if (!inString) {
                if (char === '{') depth++;
                else if (char === '}') {
                    depth--;
                    if (depth === 0) {
                        return content.substring(jsonStart, i + 1);
                    }
                }
            }
        }

        return null;
    }

    /**
     * 통합 파싱 메서드 - CODE 블록 형식 전용
     */
    static parseToolCallsUnified(
        content: string,
        _nativeResponse?: any,
        _provider?: 'gemini' | 'openai' | 'ollama',
        warnings?: string[]
    ): ToolUse[] {
        // CODE 블록 형식 파싱
        if (content.includes('"tool"') || content.includes("'tool'")) {
            return this.parseCodeBlockFormat(content, warnings);
        }
        return [];
    }

    /**
     * 도구 호출 파싱 (CODE 블록 형식)
     */
    static parseToolCalls(content: string, warnings?: string[]): ToolUse[] {
        return this.parseToolCallsUnified(content, warnings);
    }

    // ==================== 플랜/진행상황 파싱 (유지) ====================

    /**
     * LLM 응답에서 task_progress를 파싱 (JSON 형식)
     */
    static parseTaskProgress(content: string): string | undefined {
        try {
            // JSON 블록에서 task_progress 찾기
            const jsonBlockPattern = /```json\s*([\s\S]*?)```/gi;
            let match;

            while ((match = jsonBlockPattern.exec(content)) !== null) {
                const jsonStr = match[1].trim();
                try {
                    const parsed = JSON.parse(jsonStr);
                    if (parsed.task_progress) {
                        return parsed.task_progress;
                    }
                } catch {
                    // 무시
                }
            }

            // 직접 JSON 객체에서 찾기
            const directJsonStr = this.extractJsonObject(content);
            if (directJsonStr) {
                try {
                    const parsed = JSON.parse(directJsonStr);
                    if (parsed.task_progress) {
                        return parsed.task_progress;
                    }
                } catch {
                    // 무시
                }
            }
        } catch {
            // 무시
        }

        return undefined;
    }

    /**
     * LLM 응답에서 플랜 아이템들을 파싱 (JSON 형식)
     */
    static parsePlanItems(content: string): Array<{ title: string; detail?: string; kind?: 'investigation' | 'execution' }> {
        const items: Array<{ title: string; detail?: string; kind?: 'investigation' | 'execution' }> = [];

        try {
            // JSON 블록에서 plan 찾기
            const jsonBlockPattern = /```json\s*([\s\S]*?)```/gi;
            let match;

            while ((match = jsonBlockPattern.exec(content)) !== null) {
                const jsonStr = match[1].trim();
                try {
                    const parsed = JSON.parse(jsonStr);
                    if (parsed.plan && Array.isArray(parsed.plan)) {
                        for (const item of parsed.plan) {
                            if (item.title) {
                                items.push({
                                    title: item.title,
                                    detail: item.detail,
                                    kind: (item.kind === 'investigation' || item.kind === 'execution') ? item.kind : undefined
                                });
                            }
                        }
                    }
                } catch {
                    // 무시
                }
            }

            // 직접 JSON 객체에서 찾기
            if (items.length === 0) {
                const directJsonStr = this.extractJsonObject(content);
                if (directJsonStr) {
                    try {
                        const parsed = JSON.parse(directJsonStr);
                        if (parsed.plan && Array.isArray(parsed.plan)) {
                            for (const item of parsed.plan) {
                                if (item.title) {
                                    items.push({
                                        title: item.title,
                                        detail: item.detail,
                                        kind: (item.kind === 'investigation' || item.kind === 'execution') ? item.kind : undefined
                                    });
                                }
                            }
                        }
                    } catch {
                        // 무시
                    }
                }
            }
        } catch {
            // 무시
        }

        return items;
    }

    /**
     * LLM 응답에서 investigation_done을 파싱 (JSON 형식)
     */
    static parseInvestigationDone(content: string): boolean {
        try {
            // JSON 블록에서 investigation_done 찾기
            const jsonBlockPattern = /```json\s*([\s\S]*?)```/gi;
            let match;

            while ((match = jsonBlockPattern.exec(content)) !== null) {
                const jsonStr = match[1].trim();
                try {
                    const parsed = JSON.parse(jsonStr);
                    if (parsed.investigation_done === true) {
                        return true;
                    }
                } catch {
                    // 무시
                }
            }

            // 직접 JSON 객체에서 찾기
            const directJsonStr = this.extractJsonObject(content);
            if (directJsonStr) {
                try {
                    const parsed = JSON.parse(directJsonStr);
                    if (parsed.investigation_done === true) {
                        return true;
                    }
                } catch {
                    // 무시
                }
            }
        } catch {
            // 무시
        }

        return false;
    }

    // ==================== 스트리밍 지원 (유지) ====================

    /**
     * 부분 블록 감지 (스트리밍 중) - JSON 형식
     */
    static detectPartialBlock(content: string): boolean {
        // ```json이 열렸지만 닫히지 않은 경우
        const openBlocks = (content.match(/```json/g) || []).length;
        const closeBlocks = (content.match(/```(?!json)/g) || []).length;
        return openBlocks > closeBlocks;
    }

    /**
     * 부분 툴 콜 파싱 (스트리밍 중)
     * { "tool": "..." } 형식에서 도구 이름 추출
     */
    static parsePartialToolCall(content: string): ToolUse | null {
        try {
            // { "tool": "..." } 패턴에서 도구 이름 찾기
            const toolMatch = content.match(/\{\s*["']tool["']\s*:\s*["']([^"']+)["']/);
            if (toolMatch && this.isValidToolName(toolMatch[1])) {
                return {
                    name: toolMatch[1] as Tool,
                    params: {},
                    partial: true
                };
            }
        } catch {
            // 무시
        }

        return null;
    }
}
