/**
 * Tool Parser
 * LLM 응답에서 도구 호출을 파싱하는 클래스
 *
 * v9.2.0: XML 스타일 file_content 태그 형식
 *   - JSON + <file_content> / </file_content> 형식
 *   - Git merge conflict 마커 혼동 방지
 *   - 스트리밍 지원 및 코드 내 ``` 충돌 방지
 *
 * v11.5.0: 파서 안정성 개선
 *   - 정규식 [^}]* → 괄호 균형 파서로 교체: } 포함 값 처리
 *   - 섹션 기반 상태 기계: tool JSON 간 구간으로 content 추출 범위 한정
 *   - ToolParseResult 구조화 실패 반환
 *
 * 지원 형식:
 *    { "tool": "create_file", "path": "..." }
 *    <file_content>
 *    코드 내용
 *    </file_content>
 *
 *    { "tool": "read_file", "path": "src/file.ts" }
 */

import { ToolUse, Tool, ToolName, ToolParseResult } from './types';
import { ToolRegistry } from './ToolRegistry';

/** 괄호 균형 파서가 반환하는 JSON 후보 */
interface JsonCandidate {
    json: string;
    startIndex: number;
    endIndex: number;
}

export class ToolParser {
    // CODE 블록 마커 상수 (XML 스타일)
    private static readonly CODE_START_MARKER = '<file_content>';
    private static readonly CODE_END_MARKER = '</file_content>';

    // ==================== 핵심 파싱 ====================

    /**
     * 텍스트에서 모든 JSON 객체를 추출 (괄호 균형 파서)
     *
     * 기존 정규식 /\{\s*["']tool["']\s*:\s*["']([^"']+)["'][^}]*\}/ 의 한계 극복:
     *   - [^}]* 패턴: path 값에 } 포함되면 JSON이 잘림
     *   - 중첩 객체 (예: "metadata": { ... }) 처리 불가
     *
     * 개선: 문자 단위로 스캔, 문자열 내부·이스케이프 처리, 깊이 추적
     */
    private static extractAllJsonCandidates(text: string): JsonCandidate[] {
        const results: JsonCandidate[] = [];
        let i = 0;

        while (i < text.length) {
            if (text[i] !== '{') { i++; continue; }

            const startIndex = i;
            let depth = 0;
            let inString = false;
            let escape = false;
            let j = i;
            let found = false;

            while (j < text.length) {
                const ch = text[j];

                if (escape) { escape = false; j++; continue; }
                if (ch === '\\' && inString) { escape = true; j++; continue; }
                if (ch === '"') { inString = !inString; j++; continue; }
                if (inString) { j++; continue; }

                if (ch === '{') { depth++; j++; continue; }
                if (ch === '}') {
                    depth--;
                    if (depth === 0) {
                        results.push({
                            json: text.slice(startIndex, j + 1),
                            startIndex,
                            endIndex: j + 1,
                        });
                        i = j + 1;
                        found = true;
                        break;
                    }
                    j++;
                    continue;
                }
                j++;
            }

            // 닫히지 않은 JSON (스트리밍 partial) → 더 이상 스캔 불필요
            if (!found) break;
        }

        return results;
    }

    /**
     * 섹션(tool JSON 뒤 ~ 다음 tool JSON 앞)에서 <file_content> 내용 추출
     *
     * 상태 기계:
     *   SCAN → CODE_START_FOUND → IN_CONTENT → DONE
     *   SCAN → NO_TAG (content 없음 or SEARCH/REPLACE fallback)
     *
     * 섹션 경계를 미리 잘라두므로 "다음 tool JSON 탐색" 로직이 불필요해짐.
     */
    private static extractFileContent(
        toolName: string,
        section: string,
        warnings?: string[],
    ): string | undefined {
        const codeStartIdx = section.indexOf(this.CODE_START_MARKER);

        if (codeStartIdx === -1) {
            // SEARCH/REPLACE fallback (태그 없이 직접 diff가 온 경우)
            if (toolName === Tool.CREATE_FILE || toolName === Tool.UPDATE_FILE) {
                const trimmed = section.trim();
                if (trimmed.includes('<<<<<<< SEARCH') && trimmed.includes('>>>>>>> REPLACE')) {
                    warnings?.push(`[ToolParser] Fallback: SEARCH/REPLACE 마커로 content 추출, length=${trimmed.length}`);
                    return trimmed;
                }
            }
            return undefined;
        }

        const contentStart = codeStartIdx + this.CODE_START_MARKER.length;
        const codeEndIdx = section.indexOf(this.CODE_END_MARKER, contentStart);

        if (codeEndIdx !== -1) {
            // 정상: 열기·닫기 태그 모두 존재
            return section.substring(contentStart, codeEndIdx).trim();
        }

        // Fallback: <file_content> 열림만 있고 </file_content> 없음
        // (max_tokens 잘림 또는 LLM 누락)
        const extracted = section.substring(contentStart).trim();
        warnings?.push(`[ToolParser] Fallback: </file_content> 닫는 태그 없음, length=${extracted.length}`);
        return extracted;
    }

    /**
     * LLM 응답에서 XML 스타일 file_content 태그 형식 파싱
     *
     * 개선점 (v11.5.0):
     *   1. JSON 추출: 정규식 → 괄호 균형 파서 (중첩·특수문자 안전)
     *   2. content 추출 범위: 섹션 기반 (tool JSON ↔ 다음 tool JSON 구간)
     *      → <file_content> 내부에 { "tool": ... } 코드가 있어도 오탐 없음
     *   3. 조기 화이트리스트 검증: JSON 파싱 직후 tool 이름 확인
     */
    static parseCodeBlockFormat(content: string, warnings?: string[]): ToolUse[] {
        const toolCalls: ToolUse[] = [];

        // Step 1: 괄호 균형 파서로 모든 JSON 후보 추출
        const candidates = this.extractAllJsonCandidates(content);

        // Step 2: "tool" 키 보유 후보만 필터링 (tool call header)
        const toolCandidates: Array<{ parsed: any; startIndex: number; endIndex: number }> = [];

        for (const candidate of candidates) {
            let parsed: any;
            try {
                parsed = JSON.parse(candidate.json);
            } catch {
                // tool 키가 있어 보이면 경고 기록, 없으면 조용히 skip
                if (candidate.json.includes('"tool"') || candidate.json.includes("'tool'")) {
                    warnings?.push(`JSON 파싱 실패: ${candidate.json.substring(0, 80)}...`);
                }
                continue;
            }

            if (!parsed.tool || typeof parsed.tool !== 'string') continue;

            // 조기 화이트리스트 검증 — 실행 직전이 아닌 파싱 단계에서 차단
            if (!this.isValidToolName(parsed.tool)) {
                warnings?.push(`알 수 없는 도구: ${parsed.tool}`);
                continue;
            }

            toolCandidates.push({ parsed, startIndex: candidate.startIndex, endIndex: candidate.endIndex });
        }

        // Step 3: 각 tool candidate의 섹션에서 content 추출 + ToolUse 생성
        for (let i = 0; i < toolCandidates.length; i++) {
            const { parsed, endIndex } = toolCandidates[i];
            const toolName: string = parsed.tool;

            // 섹션: 이 JSON 끝 ~ 다음 JSON 시작 (없으면 전체 끝)
            // → <file_content> 내부에 JSON이 있어도 섹션 범위 밖이므로 안전
            const nextStart = i + 1 < toolCandidates.length
                ? toolCandidates[i + 1].startIndex
                : content.length;
            const section = content.substring(endIndex, nextStart);

            // <file_content> 내용 추출 (상태 기계)
            const codeContent = this.extractFileContent(toolName, section, warnings);

            // params 구성
            const params: Record<string, string> = {};

            // path / paths 처리
            // v9.2.3: paths(복수) → 여러 read_file 호출로 확장
            if (parsed.path !== undefined) {
                params.path = String(parsed.path);
            } else if (parsed.paths && toolName === Tool.READ_FILE) {
                const pathList = String(parsed.paths)
                    .split(',')
                    .map((p: string) => p.trim())
                    .filter((p: string) => p.length > 0);
                if (pathList.length > 0) {
                    params.path = pathList[0];
                    for (let j = 1; j < pathList.length; j++) {
                        toolCalls.push({ name: Tool.READ_FILE, params: { path: pathList[j] }, partial: false });
                    }
                    console.log(`[ToolParser] read_file paths expanded: ${pathList.length} files`);
                }
            }

            // content / diff 할당
            if (codeContent !== undefined) {
                if (toolName === Tool.CREATE_FILE) {
                    params.content = codeContent;
                } else if (toolName === Tool.UPDATE_FILE) {
                    params.diff = codeContent;
                } else {
                    params.content = codeContent;
                }
            }

            // 나머지 파라미터 복사 (tool, lang 제외)
            for (const [key, value] of Object.entries(parsed)) {
                if (key !== 'tool' && key !== 'lang' && !params[key]) {
                    params[key] = String(value);
                }
            }

            // 필수 파라미터 검증
            const validation = this.validateToolParams(toolName, params);
            if (!validation.valid) {
                warnings?.push(validation.message || `${toolName}: 필수 파라미터 누락`);
                console.log(`[ToolParser] ${toolName} 스킵: ${validation.message}`);
                continue;
            }

            toolCalls.push({ name: toolName as ToolName, params, partial: false });
        }

        // 중복 도구 호출 제거 (동일 이름 + 동일 파라미터)
        const deduped = this.deduplicateToolCalls(toolCalls);
        if (deduped.length < toolCalls.length) {
            console.log(`[ToolParser] Deduplicated: ${toolCalls.length} → ${deduped.length} tool calls`);
        }

        // 응답당 최대 30개 제한
        const MAX_TOOL_CALLS_PER_RESPONSE = 20;
        const capped = deduped.length > MAX_TOOL_CALLS_PER_RESPONSE ? deduped.slice(0, MAX_TOOL_CALLS_PER_RESPONSE) : deduped;
        if (capped.length < deduped.length) {
            console.warn(`[ToolParser] Tool call cap applied: ${deduped.length} → ${capped.length} (max ${MAX_TOOL_CALLS_PER_RESPONSE})`);
        }

        console.log(`[ToolParser] parseCodeBlockFormat result: ${capped.length} tool calls found`, capped.map(c => c.name));
        return capped;
    }

    /**
     * 동일한 도구 호출 중복 제거
     * LLM이 같은 JSON을 여러 번 출력하는 경우 방지
     */
    private static deduplicateToolCalls(toolCalls: ToolUse[]): ToolUse[] {
        const seen = new Set<string>();
        return toolCalls.filter(call => {
            const key = JSON.stringify({ name: call.name, params: call.params });
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    // ==================== 파라미터 검증 ====================

    /**
     * 도구별 필수 파라미터 검증
     */
    private static validateToolParams(toolName: string, params: Record<string, string>): { valid: boolean; message?: string } {
        // MCP 동적 등록 도구는 서버에서 검증 — 내부 검증 bypass
        if (ToolRegistry.getInstance().isMCPTool(toolName)) {
            return { valid: true };
        }

        if (toolName === Tool.CREATE_FILE) {
            if (!params.path || params.path.trim().length === 0) {
                return { valid: false, message: `create_file에 path가 없습니다` };
            }
            if (!params.content && params.content !== '') {
                // content가 완전히 없는 경우만 거부 (빈 문자열은 허용 — __init__.py 등 빈 파일 생성용)
                return { valid: false, message: `create_file에 content가 없습니다 (path=${params.path})` };
            }
        }

        if (toolName === Tool.RUN_COMMAND) {
            if (!params.command || params.command.trim().length === 0) {
                return { valid: false, message: `run_command에 command가 없습니다` };
            }
        }

        if (toolName === Tool.RIPGREP_SEARCH) {
            if (!params.pattern || params.pattern.trim().length === 0) {
                return { valid: false, message: `ripgrep_search에 pattern이 없습니다` };
            }
        }

        if (toolName === Tool.READ_FILE) {
            if (!params.path || params.path.trim().length === 0) {
                return { valid: false, message: `read_file에 path가 없습니다` };
            }
        }

        // list_files: 빈 문자열 ""은 프로젝트 루트를 의미하므로 허용, undefined/null만 차단
        if (toolName === Tool.LIST_FILES) {
            if (params.path === undefined || params.path === null) {
                return { valid: false, message: `list_files에 path가 없습니다` };
            }
        }

        if (toolName === Tool.EXPAND_AROUND_LINE) {
            if (!params.path || params.path.trim().length === 0) {
                return { valid: false, message: `expand_around_line에 path가 없습니다` };
            }
            if (!params.line || params.line.trim().length === 0) {
                return { valid: false, message: `expand_around_line에 line이 없습니다` };
            }
        }

        if (toolName === Tool.LIST_IMPORTS) {
            if (!params.path || params.path.trim().length === 0) {
                return { valid: false, message: `list_imports에 path가 없습니다` };
            }
        }

        if (toolName === Tool.STAT_FILE) {
            if (!params.path || params.path.trim().length === 0) {
                return { valid: false, message: `stat_file에 path가 없습니다` };
            }
        }

        if (toolName === Tool.FETCH_URL) {
            if (!params.url || params.url.trim().length === 0) {
                return { valid: false, message: `fetch_url에 url이 없습니다` };
            }
        }

        // git_diff, read_active_file은 파라미터 불필요
        return { valid: true };
    }

    /**
     * 도구 이름 유효성 확인 (빌트인 + Registry 동적 등록)
     */
    private static isValidToolName(name: string): boolean {
        if (name === '__done__') return true; // SubAgentLoop 완료 시그널 가상 도구
        if (Object.values(Tool).includes(name as Tool)) return true;
        return ToolRegistry.getInstance().hasHandler(name);
    }

    // ==================== 공개 API ====================

    /**
     * 통합 파싱 메서드 — CODE 블록 형식 전용
     */
    static parseToolCallsUnified(
        content: string,
        _nativeResponse?: any,
        _provider?: 'gemini' | 'chat_completions' | 'ollama',
        warnings?: string[],
    ): ToolUse[] {
        if (content.includes('"tool"') || content.includes("'tool'")) {
            return this.parseCodeBlockFormat(content, warnings);
        }
        return [];
    }

    /**
     * 도구 호출 파싱 (ToolUse[] 반환 — 기존 호환 API)
     */
    static parseToolCalls(content: string, warnings?: string[]): ToolUse[] {
        return this.parseToolCallsUnified(content, undefined, undefined, warnings);
    }

    /**
     * 도구 호출 파싱 (ToolParseResult 반환 — 구조화 실패 포함)
     *
     * ConversationManager에서 파싱 실패 여부를 명시적으로 체크하거나
     * LLM에 재시도 프롬프트를 삽입할 때 사용.
     */
    static parseToolCallsWithResult(content: string): ToolParseResult {
        const warnings: string[] = [];
        const tools = this.parseToolCallsUnified(content, undefined, undefined, warnings);
        const hasErrors = warnings.some(w =>
            w.includes('JSON 파싱 실패') ||
            w.includes('알 수 없는 도구') ||
            w.includes('필수 파라미터 누락'),
        );
        return { tools, warnings, hasErrors };
    }

    // ==================== 플랜/진행상황 파싱 ====================

    /**
     * 문자열에서 첫 번째 JSON 객체 추출 (괄호 균형 파서)
     * plan, task_progress 등 파싱에 사용
     */
    private static extractJsonObject(content: string): string | null {
        const candidates = this.extractAllJsonCandidates(content);
        return candidates.length > 0 ? candidates[0].json : null;
    }

    /**
     * LLM 응답에서 task_progress를 파싱 (JSON 형식)
     */
    static parseTaskProgress(content: string): string | undefined {
        try {
            const jsonBlockPattern = /```json\s*([\s\S]*?)```/gi;
            let match;

            while ((match = jsonBlockPattern.exec(content)) !== null) {
                try {
                    const parsed = JSON.parse(match[1].trim());
                    if (parsed.task_progress) return parsed.task_progress;
                } catch { /* 무시 */ }
            }

            const directJsonStr = this.extractJsonObject(content);
            if (directJsonStr) {
                try {
                    const parsed = JSON.parse(directJsonStr);
                    if (parsed.task_progress) return parsed.task_progress;
                } catch { /* 무시 */ }
            }
        } catch { /* 무시 */ }

        return undefined;
    }

    /**
     * LLM 응답에서 플랜 아이템들을 파싱 (JSON 형식)
     */
    static parsePlanItems(content: string): Array<{ title: string; detail?: string; kind?: 'investigation' | 'execution' }> {
        const items: Array<{ title: string; detail?: string; kind?: 'investigation' | 'execution' }> = [];

        const parseItems = (parsed: any) => {
            if (parsed.plan && Array.isArray(parsed.plan)) {
                for (const item of parsed.plan) {
                    if (item.title) {
                        items.push({
                            title: item.title,
                            detail: item.detail,
                            kind: (item.kind === 'investigation' || item.kind === 'execution') ? item.kind : undefined,
                        });
                    }
                }
            }
        };

        try {
            const jsonBlockPattern = /```json\s*([\s\S]*?)```/gi;
            let match;
            while ((match = jsonBlockPattern.exec(content)) !== null) {
                try { parseItems(JSON.parse(match[1].trim())); } catch { /* 무시 */ }
            }

            if (items.length === 0) {
                const directJsonStr = this.extractJsonObject(content);
                if (directJsonStr) {
                    try { parseItems(JSON.parse(directJsonStr)); } catch { /* 무시 */ }
                }
            }
        } catch { /* 무시 */ }

        return items;
    }

    /**
     * LLM 응답에서 investigation_done을 파싱 (JSON 형식)
     */
    static parseInvestigationDone(content: string): boolean {
        try {
            const jsonBlockPattern = /```json\s*([\s\S]*?)```/gi;
            let match;
            while ((match = jsonBlockPattern.exec(content)) !== null) {
                try {
                    const parsed = JSON.parse(match[1].trim());
                    if (parsed.investigation_done === true) return true;
                } catch { /* 무시 */ }
            }

            const directJsonStr = this.extractJsonObject(content);
            if (directJsonStr) {
                try {
                    const parsed = JSON.parse(directJsonStr);
                    if (parsed.investigation_done === true) return true;
                } catch { /* 무시 */ }
            }
        } catch { /* 무시 */ }

        return false;
    }

    // ==================== 스트리밍 지원 ====================

    /**
     * 부분 블록 감지 (스트리밍 중)
     *
     * 개선 (v11.5.0):
     *   <file_content> 열린 태그 > 닫힌 태그 → partial 상태 (기본)
     *   ```json 블록 미닫힘 → 기존 fallback (보조)
     */
    static detectPartialBlock(content: string): boolean {
        const openTags = (content.match(/<file_content>/g) ?? []).length;
        const closeTags = (content.match(/<\/file_content>/g) ?? []).length;
        if (openTags > closeTags) return true;

        // 기존 fallback: ```json 블록 미닫힘
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
            const toolMatch = content.match(/\{\s*["']tool["']\s*:\s*["']([^"']+)["']/);
            if (toolMatch && this.isValidToolName(toolMatch[1])) {
                return { name: toolMatch[1] as ToolName, params: {}, partial: true };
            }
        } catch { /* 무시 */ }
        return null;
    }
}
