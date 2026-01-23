/**
 * StreamingToolParser
 * 스트리밍 응답에서 도구 호출을 점진적으로 파싱하는 유틸리티
 *
 * 핵심 원리:
 * 1. 스트리밍 중에는 텍스트만 UI에 표시
 * 2. { "tool": ... } <<<<<<<CODE ... >>>>>>>END가 감지되면 도구 호출로 분리
 * 3. 응답 완료 후 전체 도구 파싱 및 실행
 *
 * v8.9.7: CODE 블록 형식 전용 (function_call 형식 제거)
 */

import { ToolUse } from './types';
import { ToolParser } from './ToolParser';

export interface StreamingParseResult {
    /** UI에 표시할 텍스트 (도구 호출 제외) */
    displayText: string;
    /** 파싱된 도구 호출 목록 */
    toolCalls: ToolUse[];
    /** 아직 완성되지 않은 JSON 블록이 있는지 */
    hasPendingJson: boolean;
    /** 전체 원본 텍스트 */
    fullText: string;
}

export interface StreamingCallbacks {
    /** 텍스트 청크 수신 시 호출 */
    onTextChunk: (text: string) => void;
    /** 도구 호출 감지 시 호출 (선택적) */
    onToolCallDetected?: (toolCall: ToolUse) => void;
    /** 스트리밍 완료 시 호출 */
    onComplete: (result: StreamingParseResult) => void;
}

/**
 * 스트리밍 응답에서 도구 호출을 분리하면서 텍스트를 실시간 표시
 */
export class StreamingToolParser {
    // CODE 블록 마커 상수
    private static readonly CODE_START_MARKER = '<<<<<<<CODE';
    private static readonly CODE_END_MARKER = '>>>>>>>END';

    private buffer: string = '';
    private displayedLength: number = 0;
    private inJsonBlock: boolean = false;
    private inCodeBlock: boolean = false;
    private jsonBlockStart: number = -1;
    private toolJsonStart: number = -1;
    private detectedToolCalls: ToolUse[] = [];
    private callbacks: StreamingCallbacks;

    constructor(callbacks: StreamingCallbacks) {
        this.callbacks = callbacks;
    }

    /**
     * 스트리밍 청크 처리
     */
    processChunk(chunk: string): void {
        this.buffer += chunk;
        this.parseAndStream();
    }

    /**
     * 버퍼를 파싱하고 안전한 텍스트만 스트리밍
     */
    private parseAndStream(): void {
        const buffer = this.buffer;

        // JSON 블록 시작 감지: ```json
        const jsonStartPattern = /```json\s*/g;
        const jsonEndPattern = /```/g;

        // CODE 블록 패턴: { "tool": ... } 다음에 <<<<<<<CODE ... >>>>>>>END
        const toolJsonPattern = /\{\s*["']tool["']\s*:/g;

        let safeEndIndex = this.displayedLength;
        let currentIndex = this.displayedLength;

        while (currentIndex < buffer.length) {
            if (!this.inJsonBlock && !this.inCodeBlock) {
                // 1. 새로운 CODE 블록 형식 감지: { "tool": ... }
                toolJsonPattern.lastIndex = currentIndex;
                const toolMatch = toolJsonPattern.exec(buffer);

                // 2. 기존 JSON 블록 형식 감지: ```json
                jsonStartPattern.lastIndex = currentIndex;
                const jsonMatch = jsonStartPattern.exec(buffer);

                // 둘 중 먼저 나오는 것 처리
                const toolIndex = toolMatch ? toolMatch.index : Infinity;
                const jsonIndex = jsonMatch ? jsonMatch.index : Infinity;

                if (toolIndex < jsonIndex && toolIndex !== Infinity) {
                    // CODE 블록 형식이 먼저
                    safeEndIndex = toolMatch!.index;
                    this.inCodeBlock = true;
                    this.toolJsonStart = toolMatch!.index;
                    currentIndex = toolMatch!.index;
                } else if (jsonIndex !== Infinity) {
                    // JSON 블록이 먼저
                    safeEndIndex = jsonMatch!.index;
                    this.inJsonBlock = true;
                    this.jsonBlockStart = jsonMatch!.index;
                    currentIndex = jsonMatch!.index + jsonMatch![0].length;
                } else {
                    // 둘 다 없음 - 끝까지 안전
                    // 단, 마지막 15자는 패턴이 잘려서 올 수 있으므로 보류
                    safeEndIndex = Math.max(this.displayedLength, buffer.length - 15);
                    break;
                }
            } else if (this.inJsonBlock) {
                // JSON 블록 끝 찾기 (```json 이후의 ```)
                jsonEndPattern.lastIndex = currentIndex;
                const endMatch = jsonEndPattern.exec(buffer);

                if (endMatch) {
                    // JSON 블록 완성됨
                    const jsonBlockContent = buffer.substring(this.jsonBlockStart, endMatch.index + endMatch[0].length);
                    this.tryParseJsonBlock(jsonBlockContent);

                    this.inJsonBlock = false;
                    this.jsonBlockStart = -1;
                    currentIndex = endMatch.index + endMatch[0].length;
                    safeEndIndex = currentIndex;
                } else {
                    // JSON 블록이 아직 완성되지 않음
                    break;
                }
            } else if (this.inCodeBlock) {
                // CODE 블록 끝 찾기: >>>>>>>END
                const codeEndIndex = buffer.indexOf(StreamingToolParser.CODE_END_MARKER, currentIndex);

                if (codeEndIndex !== -1) {
                    // CODE 블록 완성됨
                    const codeBlockContent = buffer.substring(this.toolJsonStart, codeEndIndex + StreamingToolParser.CODE_END_MARKER.length);
                    this.tryParseCodeBlock(codeBlockContent);

                    this.inCodeBlock = false;
                    this.toolJsonStart = -1;
                    currentIndex = codeEndIndex + StreamingToolParser.CODE_END_MARKER.length;
                    safeEndIndex = currentIndex;
                } else {
                    // CODE 블록이 시작되지 않았을 수도 있음 - JSON만 있는 경우
                    // JSON 닫는 } 찾기
                    const jsonCloseBrace = this.findJsonEnd(buffer, this.toolJsonStart);
                    if (jsonCloseBrace !== -1) {
                        const afterJson = buffer.substring(jsonCloseBrace + 1, Math.min(buffer.length, jsonCloseBrace + 20));
                        // <<<<<<<CODE가 없으면 JSON만 있는 도구 호출
                        if (!afterJson.includes('<<<<<<<') && buffer.length > jsonCloseBrace + 15) {
                            const jsonOnly = buffer.substring(this.toolJsonStart, jsonCloseBrace + 1);
                            this.tryParseCodeBlock(jsonOnly);

                            this.inCodeBlock = false;
                            this.toolJsonStart = -1;
                            currentIndex = jsonCloseBrace + 1;
                            safeEndIndex = currentIndex;
                            continue;
                        }
                    }
                    // CODE 블록이 아직 완성되지 않음
                    break;
                }
            }
        }

        // 안전한 텍스트만 스트리밍 (도구 호출 블록 제외)
        if (safeEndIndex > this.displayedLength) {
            const textToDisplay = this.getDisplayableText(this.displayedLength, safeEndIndex);
            if (textToDisplay) {
                this.callbacks.onTextChunk(textToDisplay);
            }
            this.displayedLength = safeEndIndex;
        }
    }

    /**
     * JSON 객체의 끝 위치 찾기
     */
    private findJsonEnd(content: string, startIndex: number): number {
        let depth = 0;
        let inString = false;
        let escape = false;

        for (let i = startIndex; i < content.length; i++) {
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
                        return i;
                    }
                }
            }
        }

        return -1;
    }

    /**
     * CODE 블록 형식에서 도구 호출 파싱
     */
    private tryParseCodeBlock(block: string): void {
        const toolCalls = ToolParser.parseCodeBlockFormat(block);
        for (const toolCall of toolCalls) {
            this.detectedToolCalls.push(toolCall);
            if (this.callbacks.onToolCallDetected) {
                this.callbacks.onToolCallDetected(toolCall);
            }
        }
    }

    /**
     * 도구 호출 블록을 제외한 표시 가능한 텍스트 추출
     */
    private getDisplayableText(start: number, end: number): string {
        let segment = this.buffer.substring(start, end);

        // JSON 블록 패턴 제거
        segment = segment
            .replace(/```json[\s\S]*?```/g, '')
            .replace(/```json[\s\S]*/g, '');

        // CODE 블록 형식 제거: { "tool": ... } <<<<<<<CODE ... >>>>>>>END
        segment = segment
            .replace(/\{\s*["']tool["'][^}]*\}\s*<<<<<<<CODE[\s\S]*?>>>>>>>END/g, '')
            .replace(/\{\s*["']tool["'][^}]*\}\s*<<<<<<<CODE[\s\S]*/g, '')
            .replace(/\{\s*["']tool["'][^}]*\}/g, ''); // JSON만 있는 도구 호출도 제거

        return segment;
    }

    /**
     * JSON 블록에서 plan 등 파싱 (도구 호출은 CODE 블록 형식으로만 처리)
     */
    private tryParseJsonBlock(block: string): void {
        try {
            // ```json ... ``` 에서 JSON 부분만 추출
            const jsonMatch = block.match(/```json\s*([\s\S]*?)\s*```/);
            if (!jsonMatch) return;

            const jsonStr = jsonMatch[1].trim();
            // JSON 파싱만 하고, plan 등은 ToolParser에서 처리
            JSON.parse(jsonStr); // 유효성 검증용
        } catch (e) {
            // JSON 파싱 실패 - 무시 (불완전한 JSON일 수 있음)
            console.debug('[StreamingToolParser] Failed to parse JSON block:', e);
        }
    }

    /**
     * 스트리밍 완료 처리
     */
    complete(): StreamingParseResult {
        // 남은 버퍼 처리
        if (this.displayedLength < this.buffer.length && !this.inJsonBlock && !this.inCodeBlock) {
            const remainingText = this.getDisplayableText(this.displayedLength, this.buffer.length);
            if (remainingText) {
                this.callbacks.onTextChunk(remainingText);
            }
        }

        // 전체 응답에서 도구 호출 최종 파싱 (ToolParser 사용)
        const allToolCalls = ToolParser.parseToolCallsUnified(this.buffer);

        // 스트리밍 중 감지된 것과 최종 파싱 결과 병합 (중복 제거)
        const finalToolCalls = this.mergeToolCalls(this.detectedToolCalls, allToolCalls);

        // 표시용 텍스트 (도구 호출 블록 제거)
        let displayText = this.buffer
            .replace(/```json[\s\S]*?```/g, '')
            .replace(/\{\s*["']tool["'][^}]*\}\s*<<<<<<<CODE[\s\S]*?>>>>>>>END/g, '')
            .replace(/\{\s*["']tool["'][^}]*\}/g, '')
            .trim();

        const result: StreamingParseResult = {
            displayText,
            toolCalls: finalToolCalls,
            hasPendingJson: this.inJsonBlock || this.inCodeBlock,
            fullText: this.buffer
        };

        this.callbacks.onComplete(result);
        return result;
    }

    /**
     * 도구 호출 목록 병합 (중복 제거)
     */
    private mergeToolCalls(detected: ToolUse[], parsed: ToolUse[]): ToolUse[] {
        // 파싱된 결과를 기준으로 사용 (더 정확함)
        if (parsed.length > 0) {
            return parsed;
        }
        return detected;
    }

    /**
     * 현재 버퍼 내용 반환
     */
    getBuffer(): string {
        return this.buffer;
    }

    /**
     * 상태 초기화
     */
    reset(): void {
        this.buffer = '';
        this.displayedLength = 0;
        this.inJsonBlock = false;
        this.inCodeBlock = false;
        this.jsonBlockStart = -1;
        this.toolJsonStart = -1;
        this.detectedToolCalls = [];
    }
}

/**
 * 스트리밍 콜백을 StreamingToolParser와 연동하는 헬퍼 함수
 */
export function createStreamingToolCallback(
    onTextChunk: (text: string) => void,
    onComplete: (result: StreamingParseResult) => void,
    onToolCallDetected?: (toolCall: ToolUse) => void
): {
    onChunk: (chunk: string, done: boolean) => void;
    parser: StreamingToolParser;
} {
    const parser = new StreamingToolParser({
        onTextChunk,
        onToolCallDetected,
        onComplete
    });

    const onChunk = (chunk: string, done: boolean) => {
        if (chunk) {
            parser.processChunk(chunk);
        }
        if (done) {
            parser.complete();
        }
    };

    return { onChunk, parser };
}
