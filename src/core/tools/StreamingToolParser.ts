/**
 * StreamingToolParser
 * 스트리밍 응답에서 도구 호출을 점진적으로 파싱하는 유틸리티
 *
 * 핵심 원리:
 * 1. 스트리밍 중에는 텍스트만 UI에 표시
 * 2. ```json 블록이 감지되면 도구 호출로 분리
 * 3. 응답 완료 후 전체 도구 파싱 및 실행
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
    private buffer: string = '';
    private displayedLength: number = 0;
    private inJsonBlock: boolean = false;
    private jsonBlockStart: number = -1;
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

        let safeEndIndex = this.displayedLength;
        let currentIndex = this.displayedLength;

        while (currentIndex < buffer.length) {
            if (!this.inJsonBlock) {
                // JSON 블록 시작 찾기
                jsonStartPattern.lastIndex = currentIndex;
                const startMatch = jsonStartPattern.exec(buffer);

                if (startMatch && startMatch.index >= currentIndex) {
                    // JSON 블록 시작 전까지는 안전하게 표시 가능
                    safeEndIndex = startMatch.index;
                    this.inJsonBlock = true;
                    this.jsonBlockStart = startMatch.index;
                    currentIndex = startMatch.index + startMatch[0].length;
                } else {
                    // JSON 블록이 없으면 끝까지 안전
                    // 단, 마지막 10자는 ```json이 잘려서 올 수 있으므로 보류
                    safeEndIndex = Math.max(this.displayedLength, buffer.length - 10);
                    break;
                }
            } else {
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
     * 도구 호출 블록을 제외한 표시 가능한 텍스트 추출
     */
    private getDisplayableText(start: number, end: number): string {
        const segment = this.buffer.substring(start, end);
        // JSON 블록 패턴 제거
        return segment
            .replace(/```json[\s\S]*?```/g, '')
            .replace(/```json[\s\S]*/g, ''); // 불완전한 블록도 제거
    }

    /**
     * JSON 블록에서 도구 호출 파싱 시도
     */
    private tryParseJsonBlock(block: string): void {
        try {
            // ```json ... ``` 에서 JSON 부분만 추출
            const jsonMatch = block.match(/```json\s*([\s\S]*?)\s*```/);
            if (!jsonMatch) return;

            const jsonStr = jsonMatch[1].trim();
            const parsed = JSON.parse(jsonStr);

            // function_call 또는 function_calls 형식 처리
            let toolCalls: ToolUse[] = [];

            if (parsed.function_call) {
                toolCalls.push({
                    name: parsed.function_call.name,
                    params: parsed.function_call.args || {}
                });
            } else if (parsed.function_calls && Array.isArray(parsed.function_calls)) {
                toolCalls = parsed.function_calls.map((fc: any) => ({
                    name: fc.name,
                    params: fc.args || {}
                }));
            }

            // 감지된 도구 호출 저장
            for (const toolCall of toolCalls) {
                this.detectedToolCalls.push(toolCall);
                if (this.callbacks.onToolCallDetected) {
                    this.callbacks.onToolCallDetected(toolCall);
                }
            }
        } catch (e) {
            // JSON 파싱 실패 - 무시 (불완전한 JSON일 수 있음)
            console.warn('[StreamingToolParser] Failed to parse JSON block:', e);
        }
    }

    /**
     * 스트리밍 완료 처리
     */
    complete(): StreamingParseResult {
        // 남은 버퍼 처리
        if (this.displayedLength < this.buffer.length && !this.inJsonBlock) {
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
        const displayText = this.buffer
            .replace(/```json[\s\S]*?```/g, '')
            .trim();

        const result: StreamingParseResult = {
            displayText,
            toolCalls: finalToolCalls,
            hasPendingJson: this.inJsonBlock,
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
        this.jsonBlockStart = -1;
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
