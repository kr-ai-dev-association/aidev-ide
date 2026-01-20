import * as vscode from 'vscode';
import { safePostMessage } from '../../utils';
import { StreamingToolParser, StreamingParseResult, createStreamingToolCallback } from '../tools/StreamingToolParser';
import { ToolUse } from '../tools/types';

export interface ProcessingStatusCallback {
    (step: string, status: string): void;
}

export interface ProcessingStepCallback {
    (step: string): void;
}

/**
 * 웹뷰 브리지 유틸리티 클래스
 * 모든 웹뷰 통신은 이 클래스를 통해 일원화됩니다.
 */
export class WebviewBridge {
    /**
     * 처리 상태 업데이트 (로딩 바 표시용)
     */
    public static updateProcessingStatus(webview: vscode.Webview | undefined, status: string, step: 'processing' | 'done' | 'error' | 'Waiting...'): void {
        if (webview) {
            safePostMessage(webview, { 
                command: 'updateProcessingStatus', 
                status, 
                step 
            });
        }
    }

    /**
     * 채팅 메시지 전송
     */
    public static receiveMessage(webview: vscode.Webview | undefined, sender: string, text: string): void {
        if (webview) {
            console.log(`[WebviewBridge] receiveMessage: sender="${sender}", textLength=${text?.length || 0}, hasCodeBlock=${text?.includes('\`\`\`') || false}`);
            safePostMessage(webview, {
                command: 'receiveMessage',
                sender,
                text
            });
        } else {
            console.warn(`[WebviewBridge] receiveMessage SKIPPED: webview is undefined, sender="${sender}"`);
        }
    }

    /**
     * 로딩 상태 숨기기
     */
    public static hideLoading(webview: vscode.Webview | undefined): void {
        if (webview) {
            safePostMessage(webview, { 
                command: 'hideLoading' 
            });
        }
    }

    /**
     * 작업 큐(플랜) 업데이트
     */
    public static updateTaskQueue(webview: vscode.Webview | undefined, tasks: any[]): void {
        if (webview) {
            safePostMessage(webview, { 
                command: 'updateTaskQueue', 
                tasks 
            });
        }
    }

    /**
     * 작업 큐 초기화 (새 요청 시작 시)
     */
    public static clearTaskQueue(webview: vscode.Webview | undefined): void {
        if (webview) {
            safePostMessage(webview, { 
                command: 'updateTaskQueue', 
                tasks: [],
                clear: true
            });
        }
    }

    /**
     * 처리 단계 전송 (호환성 유지)
     */
    public static sendProcessingStep(webview: vscode.Webview | undefined, step: string): void {
        if (webview) {
            safePostMessage(webview, { command: 'setProcessingStep', step });
        }
    }

    /**
     * 처리 상태 전송 (호환성 유지)
     */
    public static sendProcessingStatus(webview: vscode.Webview | undefined, step: string, status: string): void {
        if (webview) {
            safePostMessage(webview, { command: 'updateProcessingStatus', step, status });
        }
    }

    /**
     * 처리 단계 콜백 생성
     */
    public static createProcessingStepCallback(webview: vscode.Webview | undefined): ProcessingStepCallback {
        return (step: string) => {
            WebviewBridge.sendProcessingStep(webview, step);
        };
    }

    /**
     * 처리 상태 콜백 생성
     */
    public static createProcessingStatusCallback(webview: vscode.Webview | undefined): ProcessingStatusCallback {
        return (step: string, status: string) => {
            WebviewBridge.sendProcessingStatus(webview, step, status);
        };
    }

    /**
     * 컨텍스트 정보 업데이트
     */
    public static updateContextInfo(
        webview: vscode.Webview | undefined,
        contextInfo: {
            messageCount: number;
            tokenUsage: {
                current: number;
                max: number;
                percentage: number;
            };
        }
    ): void {
        if (webview) {
            safePostMessage(webview, {
                command: 'updateContextInfo',
                contextInfo
            });
        }
    }

    /**
     * 스트리밍 메시지 시작
     * 새로운 스트리밍 응답 시작을 알립니다
     */
    public static startStreamingMessage(webview: vscode.Webview | undefined, sender: string): void {
        if (webview) {
            console.log(`[WebviewBridge] startStreamingMessage: sender="${sender}"`);
            safePostMessage(webview, {
                command: 'startStreamingMessage',
                sender
            });
        }
    }

    /**
     * 스트리밍 메시지 청크 전송
     * 스트리밍 응답의 일부분을 전송합니다
     */
    public static streamMessageChunk(webview: vscode.Webview | undefined, chunk: string): void {
        if (webview) {
            safePostMessage(webview, {
                command: 'streamMessageChunk',
                chunk
            });
        }
    }

    /**
     * 스트리밍 메시지 완료
     * 스트리밍 응답 완료를 알립니다
     */
    public static endStreamingMessage(webview: vscode.Webview | undefined): void {
        if (webview) {
            console.log(`[WebviewBridge] endStreamingMessage`);
            safePostMessage(webview, {
                command: 'endStreamingMessage'
            });
        }
    }

    /**
     * 스트리밍 청크 콜백 생성
     * LLM 스트리밍 응답에 사용할 콜백 함수를 생성합니다
     */
    public static createStreamingCallback(webview: vscode.Webview | undefined): (chunk: string, done: boolean) => void {
        let isStarted = false;
        return (chunk: string, done: boolean) => {
            if (!isStarted && !done) {
                WebviewBridge.startStreamingMessage(webview, 'assistant');
                isStarted = true;
            }
            if (chunk) {
                WebviewBridge.streamMessageChunk(webview, chunk);
            }
            if (done) {
                WebviewBridge.endStreamingMessage(webview);
            }
        };
    }

    /**
     * CODE 모드용 스트리밍 콜백 생성 (도구 호출 파싱 포함)
     * 텍스트는 실시간 스트리밍하고, 도구 호출은 분리하여 처리
     * @param webview 웹뷰 인스턴스
     * @param onToolCallsReady 도구 호출 파싱 완료 시 호출되는 콜백
     * @returns 스트리밍 청크 콜백과 파서 인스턴스
     */
    public static createStreamingCallbackWithToolParsing(
        webview: vscode.Webview | undefined,
        onToolCallsReady: (result: StreamingParseResult) => void
    ): {
        onChunk: (chunk: string, done: boolean) => void;
        parser: StreamingToolParser;
    } {
        let isStarted = false;

        const onTextChunk = (text: string) => {
            if (!isStarted && text) {
                WebviewBridge.startStreamingMessage(webview, 'assistant');
                isStarted = true;
            }
            if (text) {
                WebviewBridge.streamMessageChunk(webview, text);
            }
        };

        const onComplete = (result: StreamingParseResult) => {
            WebviewBridge.endStreamingMessage(webview);
            onToolCallsReady(result);
        };

        return createStreamingToolCallback(onTextChunk, onComplete);
    }
}
