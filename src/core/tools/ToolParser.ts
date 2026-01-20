/**
 * Tool Parser
 * LLM 응답에서 JSON Function Call을 파싱하는 클래스
 *
 * v8.9.2: JSON Function Calling만 사용 (XML/Native 제거)
 * - parseJsonFunctionCalls(): 텍스트 기반 JSON 응답 파싱
 * - parseToolCallsUnified(): JSON 파싱만 수행
 */

import { ToolUse, Tool } from './types';

export class ToolParser {
    /**
     * LLM 응답에서 JSON function call을 파싱
     * ```json ... ``` 블록 또는 직접 JSON 형식 지원
     */
    static parseJsonFunctionCalls(content: string, warnings?: string[]): ToolUse[] {
        const toolCalls: ToolUse[] = [];

        console.log(`[ToolParser] parseJsonFunctionCalls called, contentLength=${content.length}`);

        try {
            // 1. JSON 코드 블록 추출 (```json ... ```)
            const jsonBlockPattern = /```json\s*([\s\S]*?)```/gi;
            let match;

            while ((match = jsonBlockPattern.exec(content)) !== null) {
                const jsonStr = match[1].trim();
                const parsed = this.parseJsonToolCall(jsonStr, warnings);
                toolCalls.push(...parsed);
            }

            // 2. 코드 블록 없이 직접 JSON인 경우
            if (toolCalls.length === 0) {
                // { "function_call": ... } 또는 { "function_calls": [...] } 패턴 찾기
                // ⚠️ 수정: /g 플래그 제거하여 lastIndex 문제 방지
                const hasDirectJson = /\{\s*["']function_calls?["']\s*:/.test(content);
                if (hasDirectJson) {
                    // JSON 추출 시도 - 중첩된 JSON을 올바르게 처리
                    const jsonStr = this.extractJsonObject(content);
                    if (jsonStr) {
                        console.log(`[ToolParser] Extracted direct JSON: ${jsonStr.substring(0, 100)}...`);
                        const parsed = this.parseJsonToolCall(jsonStr, warnings);
                        toolCalls.push(...parsed);
                    }
                }
            }
        } catch (error) {
            console.warn('[ToolParser] JSON function call 파싱 실패:', error);
            warnings?.push(`JSON 파싱 실패: ${error instanceof Error ? error.message : String(error)}`);
        }

        console.log(`[ToolParser] parseJsonFunctionCalls result: ${toolCalls.length} tool calls found`, toolCalls.map(c => c.name));
        return toolCalls;
    }

    /**
     * 문자열에서 올바른 JSON 객체 추출 (중첩 괄호 처리)
     * 여러 JSON 객체가 있을 경우 function_call(s)가 포함된 것을 우선 반환
     */
    private static extractJsonObject(content: string): string | null {
        const allJsonObjects = this.extractAllJsonObjects(content);

        // function_calls가 포함된 JSON을 우선 찾기
        for (const json of allJsonObjects) {
            if (/["']function_calls?["']\s*:/.test(json)) {
                return json;
            }
        }

        // 없으면 첫 번째 JSON 반환
        return allJsonObjects.length > 0 ? allJsonObjects[0] : null;
    }

    /**
     * 문자열에서 모든 JSON 객체 추출
     */
    private static extractAllJsonObjects(content: string): string[] {
        const results: string[] = [];
        let startIndex = 0;

        while (startIndex < content.length) {
            const jsonStart = content.indexOf('{', startIndex);
            if (jsonStart === -1) break;

            let depth = 0;
            let inString = false;
            let escape = false;
            let foundEnd = false;

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
                            results.push(content.substring(jsonStart, i + 1));
                            startIndex = i + 1;
                            foundEnd = true;
                            break;
                        }
                    }
                }
            }

            if (!foundEnd) {
                // 불완전한 JSON, 더 이상 진행하지 않음
                break;
            }
        }

        return results;
    }

    /**
     * JSON 문자열 내부의 실제 개행문자를 \n으로 변환
     *
     * 🔥 문제: LLM이 JSON 문자열 값 내부에 실제 개행을 넣으면 JSON.parse 실패
     * 예: "diff": "<<<<<<< SEARCH\n  code\n=======
     *   new code\n>>>>>>> REPLACE"
     *
     * 해결: 문자열 값 내부의 실제 개행(\n, \r)을 이스케이프된 \n으로 변환
     */
    private static normalizeJsonNewlines(jsonStr: string): string {
        // 문자열 값 내부의 실제 개행을 찾아서 변환
        // JSON 파싱 전에 수행
        let result = '';
        let inString = false;
        let escape = false;

        for (let i = 0; i < jsonStr.length; i++) {
            const char = jsonStr[i];

            if (escape) {
                result += char;
                escape = false;
                continue;
            }

            if (char === '\\') {
                result += char;
                escape = true;
                continue;
            }

            if (char === '"') {
                inString = !inString;
                result += char;
                continue;
            }

            // 문자열 내부의 실제 개행문자를 \n으로 변환
            if (inString && (char === '\n' || char === '\r')) {
                // \r\n 시퀀스 처리
                if (char === '\r' && jsonStr[i + 1] === '\n') {
                    result += '\\n';
                    i++; // \n 건너뛰기
                } else {
                    result += '\\n';
                }
                continue;
            }

            result += char;
        }

        return result;
    }

    /**
     * JSON 문자열에서 function call 파싱
     *
     * 🔥 수정: LLM이 문자열 값 내부에 실제 개행문자를 넣는 경우 처리
     * - JSON 표준에서 문자열 내 개행은 \n으로 이스케이프해야 함
     * - LLM이 이를 지키지 않으면 JSON.parse 실패
     */
    private static parseJsonToolCall(jsonStr: string, warnings?: string[]): ToolUse[] {
        const toolCalls: ToolUse[] = [];

        try {
            // 🔥 전처리: 문자열 값 내부의 실제 개행을 \n으로 변환
            const normalizedJsonStr = this.normalizeJsonNewlines(jsonStr);
            const parsed = JSON.parse(normalizedJsonStr);

            // 단일 function_call
            if (parsed.function_call) {
                const fc = parsed.function_call;
                const toolCall = this.createToolCallFromFunctionCall(fc, warnings);
                if (toolCall) {
                    toolCalls.push(toolCall);
                }
            }

            // 다중 function_calls
            if (parsed.function_calls && Array.isArray(parsed.function_calls)) {
                for (const fc of parsed.function_calls) {
                    const toolCall = this.createToolCallFromFunctionCall(fc, warnings);
                    if (toolCall) {
                        toolCalls.push(toolCall);
                    }
                }
            }
        } catch (error) {
            // JSON 파싱 실패
            console.debug('[ToolParser] JSON 파싱 실패:', jsonStr.substring(0, 100));
            warnings?.push(`JSON 파싱 실패: ${jsonStr.substring(0, 50)}...`);
        }

        return toolCalls;
    }

    /**
     * function_call 객체에서 ToolUse 생성
     */
    private static createToolCallFromFunctionCall(fc: any, warnings?: string[]): ToolUse | null {
        if (!fc || !fc.name) {
            warnings?.push('function_call에 name이 없습니다');
            return null;
        }

        if (!this.isValidToolName(fc.name)) {
            warnings?.push(`알 수 없는 도구: ${fc.name}`);
            return null;
        }

        const params = this.normalizeParams(fc.args || {});

        // 필수 파라미터 검증
        const validationResult = this.validateToolParams(fc.name, params);
        if (!validationResult.valid) {
            warnings?.push(validationResult.message || '');
            console.log(`[ToolParser] ${fc.name} 스킵: ${validationResult.message}`);
            return null;
        }

        return {
            name: fc.name as Tool,
            params,
            partial: false
        };
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

        return { valid: true };
    }

    /**
     * 도구 이름이 유효한지 확인
     */
    private static isValidToolName(name: string): boolean {
        return Object.values(Tool).includes(name as Tool);
    }

    /**
     * 파라미터 정규화 (모든 값을 문자열로 변환)
     */
    private static normalizeParams(args: Record<string, any>): Record<string, string> {
        const normalized: Record<string, string> = {};
        for (const [key, value] of Object.entries(args)) {
            if (value !== undefined && value !== null) {
                normalized[key] = String(value);
            }
        }
        return normalized;
    }

    /**
     * 통합 파싱 메서드 - JSON만 사용
     */
    static parseToolCallsUnified(
        content: string,
        _nativeResponse?: any,
        _provider?: 'gemini' | 'openai' | 'ollama',
        warnings?: string[]
    ): ToolUse[] {
        // JSON 파싱만 수행
        return this.parseJsonFunctionCalls(content, warnings);
    }

    /**
     * 레거시 호환성: parseToolCalls는 parseJsonFunctionCalls로 리다이렉트
     */
    static parseToolCalls(content: string, warnings?: string[]): ToolUse[] {
        return this.parseJsonFunctionCalls(content, warnings);
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
     */
    static parsePartialToolCall(content: string): ToolUse | null {
        // JSON 블록이 완성되지 않은 경우 부분 파싱 시도
        const jsonBlockStart = content.lastIndexOf('```json');
        if (jsonBlockStart === -1) return null;

        const partialJson = content.substring(jsonBlockStart + 7); // '```json' 이후

        try {
            // function_call.name을 찾아서 부분 파싱
            const nameMatch = partialJson.match(/"name"\s*:\s*"([^"]+)"/);
            if (nameMatch && this.isValidToolName(nameMatch[1])) {
                return {
                    name: nameMatch[1] as Tool,
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
