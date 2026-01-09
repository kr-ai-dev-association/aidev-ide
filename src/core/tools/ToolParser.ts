/**
 * Tool Parser
 * LLM 응답에서 XML 툴 콜을 파싱하는 클래스
 */

import { ToolUse, Tool } from './types';

export class ToolParser {
    /**
     * LLM 응답에서 툴 콜을 파싱
     */
    static parseToolCalls(content: string, warnings?: string[]): ToolUse[] {
        const toolCalls: ToolUse[] = [];
        const toolNames = Object.values(Tool);

        // XML 태그 기반 파싱
        for (const toolName of toolNames) {
            const pattern = new RegExp(`<${toolName}>([\\s\\S]*?)<\\/${toolName}>`, 'gi');
            let match;

            while ((match = pattern.exec(content)) !== null) {
                const innerContent = match[1];
                const params = this.parseToolParams(innerContent);

                // create_file은 content 필수: 누락 시 경고를 추가하고 스킵
                if (toolName === Tool.CREATE_FILE) {
                    const hasContent = typeof params.content === 'string' && params.content.trim().length > 0;
                    if (!hasContent) {
                        warnings?.push(`⚠️ create_file에 content가 없습니다 (path=${params.path || 'unknown'})`);
                        continue; // 이 호출은 무시
                    }
                }

                // run_command는 command 파라미터 필수: 누락 시 경고를 추가하고 스킵
                if (toolName === Tool.RUN_COMMAND) {
                    const hasCommand = typeof params.command === 'string' && params.command.trim().length > 0;
                    console.log(`[ToolParser] run_command 파싱: innerContent="${innerContent.substring(0, 100)}", params=`, params, `hasCommand=${hasCommand}`);
                    if (!hasCommand) {
                        warnings?.push(`⚠️ run_command에 command가 없습니다`);
                        console.log(`[ToolParser] run_command 스킵: command 파라미터가 없습니다. params:`, params);
                        continue; // 이 호출은 무시
                    }
                }

                // ripgrep_search는 pattern 파라미터 필수: 누락 시 경고를 추가하고 스킵
                if (toolName === Tool.RIPGREP_SEARCH) {
                    const hasPattern = typeof params.pattern === 'string' && params.pattern.trim().length > 0;
                    if (!hasPattern) {
                        warnings?.push(`ripgrep_search에 pattern이 없습니다`);
                        console.log(`[ToolParser] ripgrep_search 스킵: pattern 파라미터가 없습니다. innerContent="${innerContent.substring(0, 200)}", params:`, params);
                        continue; // 이 호출은 무시
                    }
                }

                toolCalls.push({
                    name: toolName as Tool,
                    params,
                    partial: false
                });
            }
        }

        return toolCalls;
    }

    /**
     * 툴 파라미터 파싱
     */
    private static parseToolParams(content: string): Record<string, string> {
        const params: Record<string, string> = {};
        const paramPattern = /<(\w+)>([\s\S]*?)<\/\1>/g;
        let match;
        const pathValues: string[] = [];

        while ((match = paramPattern.exec(content)) !== null) {
            const [, paramName, paramValue] = match;

            // read_file의 경우 여러 <path> 태그를 paths로 변환
            if (paramName === 'path') {
                pathValues.push(paramValue.trim());
            } else {
                params[paramName] = paramValue.trim();
                // 디버깅: command 파라미터 파싱 확인
                if (paramName === 'command') {
                    console.log(`[ToolParser] parseToolParams: command 파라미터 발견, value="${paramValue.trim()}"`);
                }
            }
        }

        // path 태그가 여러 개인 경우 paths로 변환
        if (pathValues.length > 1) {
            params['paths'] = pathValues.join(',');
        } else if (pathValues.length === 1) {
            params['path'] = pathValues[0];
        }

        return params;
    }

    /**
     * 부분 블록 감지 (스트리밍 중)
     */
    static detectPartialBlock(content: string): boolean {
        // 닫는 태그가 없으면 부분 블록
        const openTags = content.match(/<(\w+)>/g) || [];
        const closeTags = content.match(/<\/(\w+)>/g) || [];
        return openTags.length > closeTags.length;
    }

    /**
     * 부분 툴 콜 파싱 (스트리밍 중)
     */
    static parsePartialToolCall(content: string): ToolUse | null {
        // 열린 태그만 있는 경우 감지
        const openTagPattern = /<(\w+)>/g;
        const closeTagPattern = /<\/(\w+)>/g;

        const openTags: string[] = [];
        const closeTags: string[] = [];

        let match;
        while ((match = openTagPattern.exec(content)) !== null) {
            openTags.push(match[1]);
        }
        while ((match = closeTagPattern.exec(content)) !== null) {
            closeTags.push(match[1]);
        }

        // 닫히지 않은 태그가 있으면 부분 블록
        if (openTags.length > closeTags.length) {
            const lastOpenTag = openTags[openTags.length - 1];
            if (Object.values(Tool).includes(lastOpenTag as Tool)) {
                // 부분 파라미터 파싱
                const partialParams = this.parsePartialParams(content, lastOpenTag);
                return {
                    name: lastOpenTag as Tool,
                    params: partialParams,
                    partial: true
                };
            }
        }

        return null;
    }

    /**
     * 부분 파라미터 파싱
     */
    private static parsePartialParams(content: string, toolName: string): Record<string, string> {
        const params: Record<string, string> = {};
        const toolStart = content.lastIndexOf(`<${toolName}>`);
        if (toolStart === -1) return params;

        const toolContent = content.substring(toolStart);
        const paramPattern = /<(\w+)>([\s\S]*?)(?:<\/\1>|$)/g;
        let match;

        while ((match = paramPattern.exec(toolContent)) !== null) {
            const [, paramName, paramValue] = match;
            if (paramValue && !paramValue.includes(`</${paramName}>`)) {
                // 닫히지 않은 파라미터
                params[paramName] = paramValue.trim();
            }
        }

        return params;
    }

    /**
     * LLM 응답에서 task_progress를 파싱
     * task_progress는 툴 콜의 파라미터로 포함되거나 별도의 <task_progress> 태그로 포함될 수 있음
     */
    static parseTaskProgress(content: string): string | undefined {
        // 방법 1: 별도의 <task_progress> 태그로 포함된 경우
        const standalonePattern = /<task_progress>([\s\S]*?)<\/task_progress>/gi;
        let match = standalonePattern.exec(content);
        if (match && match[1]) {
            return match[1].trim();
        }

        // 방법 2: 툴 콜 내부의 task_progress 파라미터로 포함된 경우
        // 모든 툴 콜을 순회하면서 task_progress 파라미터 찾기
        const toolNames = Object.values(Tool);
        for (const toolName of toolNames) {
            const toolPattern = new RegExp(`<${toolName}>([\\s\\S]*?)<\\/${toolName}>`, 'gi');
            let toolMatch;
            while ((toolMatch = toolPattern.exec(content)) !== null) {
                const innerContent = toolMatch[1];
                const taskProgressPattern = /<task_progress>([\s\S]*?)<\/task_progress>/gi;
                const taskProgressMatch = taskProgressPattern.exec(innerContent);
                if (taskProgressMatch && taskProgressMatch[1]) {
                    return taskProgressMatch[1].trim();
                }
            }
        }

        return undefined;
    }

    /**
     * LLM 응답에서 플랜 아이템들을 파싱 (v5.2.0: 엄격한 XML 구조 강제, kind 필드 추가)
     */
    static parsePlanItems(content: string): Array<{ title: string; detail?: string; kind?: 'investigation' | 'execution' }> {
        const items: Array<{ title: string; detail?: string; kind?: 'investigation' | 'execution' }> = [];
        const planPattern = /<plan>([\s\S]*?)<\/plan>/gi;
        const match = planPattern.exec(content);

        if (match && match[1]) {
            const planContent = match[1].trim();

            // <item> 태그 파싱
            const itemPattern = /<item>([\s\S]*?)<\/item>/gi;
            let itemMatch;

            while ((itemMatch = itemPattern.exec(planContent)) !== null) {
                const itemContent = itemMatch[1];
                const titleMatch = /<title>([\s\S]*?)<\/title>/gi.exec(itemContent);
                const detailMatch = /<detail>([\s\S]*?)<\/detail>/gi.exec(itemContent);
                const kindMatch = /<kind>([\s\S]*?)<\/kind>/gi.exec(itemContent);

                if (titleMatch && titleMatch[1]) {
                    const kindValue = kindMatch && kindMatch[1] ? kindMatch[1].trim().toLowerCase() : undefined;
                    const kind = (kindValue === 'investigation' || kindValue === 'execution') ? kindValue : undefined;

                    items.push({
                        title: titleMatch[1].trim(),
                        detail: detailMatch ? detailMatch[1].trim() : undefined,
                        kind: kind as 'investigation' | 'execution' | undefined
                    });
                }
            }
        }

        return items;
    }

    /**
     * LLM 응답에서 <investigation_done/> 토큰을 파싱
     * 조사 완료를 명시적으로 선언하는 토큰
     */
    static parseInvestigationDone(content: string): boolean {
        const pattern = /<investigation_done\s*\/?>/gi;
        return pattern.test(content);
    }
}
