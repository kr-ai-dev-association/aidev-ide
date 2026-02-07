import { safePostMessage } from '../../utils';
import { createStreamingToolCallback } from '../tools/StreamingToolParser';
/**
 * 웹뷰 브리지 유틸리티 클래스
 * 모든 웹뷰 통신은 이 클래스를 통해 일원화됩니다.
 */
export class WebviewBridge {
    /**
     * 처리 상태 업데이트 (로딩 바 표시용)
     */
    static updateProcessingStatus(webview, status, step) {
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
    static receiveMessage(webview, sender, text) {
        if (webview) {
            safePostMessage(webview, {
                command: 'receiveMessage',
                sender,
                text
            });
        }
    }
    /**
     * 로딩 상태 숨기기
     */
    static hideLoading(webview) {
        if (webview) {
            safePostMessage(webview, {
                command: 'hideLoading'
            });
        }
    }
    /**
     * 작업 큐(플랜) 업데이트
     */
    static updateTaskQueue(webview, tasks) {
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
    static clearTaskQueue(webview) {
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
    static sendProcessingStep(webview, step) {
        console.log(`[WebviewBridge] sendProcessingStep called: step=${step}, webview=${!!webview}`);
        if (webview) {
            safePostMessage(webview, { command: 'setProcessingStep', step });
        }
        else {
            console.warn(`[WebviewBridge] sendProcessingStep skipped: webview is undefined`);
        }
    }
    /**
     * 처리 상태 전송 (호환성 유지)
     */
    static sendProcessingStatus(webview, step, status) {
        console.log(`[WebviewBridge] sendProcessingStatus called: step=${step}, status=${status.substring(0, 30)}..., webview=${!!webview}`);
        if (webview) {
            safePostMessage(webview, { command: 'updateProcessingStatus', step, status });
        }
        else {
            console.warn(`[WebviewBridge] sendProcessingStatus skipped: webview is undefined`);
        }
    }
    /**
     * 처리 단계 콜백 생성
     */
    static createProcessingStepCallback(webview) {
        return (step) => {
            WebviewBridge.sendProcessingStep(webview, step);
        };
    }
    /**
     * 처리 상태 콜백 생성
     */
    static createProcessingStatusCallback(webview) {
        return (step, status) => {
            WebviewBridge.sendProcessingStatus(webview, step, status);
        };
    }
    /**
     * 컨텍스트 정보 업데이트
     */
    static updateContextInfo(webview, contextInfo) {
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
    static startStreamingMessage(webview, sender) {
        if (webview) {
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
    static streamMessageChunk(webview, chunk) {
        if (webview && chunk) {
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
    static endStreamingMessage(webview) {
        if (webview) {
            safePostMessage(webview, {
                command: 'endStreamingMessage'
            });
        }
    }
    /**
     * 🔥 텍스트를 스트리밍 효과로 전송 (타이핑 효과)
     * receiveMessage 대신 사용하여 한 번에 보이지 않고 점진적으로 표시
     */
    static async streamText(webview, sender, text, charsPerTick = 30, tickIntervalMs = 10) {
        if (!webview || !text) {
            return;
        }
        return new Promise((resolve) => {
            WebviewBridge.startStreamingMessage(webview, sender);
            let index = 0;
            const interval = setInterval(() => {
                if (index >= text.length) {
                    clearInterval(interval);
                    WebviewBridge.endStreamingMessage(webview);
                    resolve();
                    return;
                }
                const chunk = text.substring(index, index + charsPerTick);
                WebviewBridge.streamMessageChunk(webview, chunk);
                index += charsPerTick;
            }, tickIntervalMs);
        });
    }
    /**
     * 스트리밍 청크 콜백 생성
     * LLM 스트리밍 응답에 사용할 콜백 함수를 생성합니다
     */
    static createStreamingCallback(webview) {
        let isStarted = false;
        return (chunk, done) => {
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
    static createStreamingCallbackWithToolParsing(webview, onToolCallsReady) {
        let isStarted = false;
        const onTextChunk = (text) => {
            if (!isStarted && text) {
                WebviewBridge.startStreamingMessage(webview, 'assistant');
                isStarted = true;
            }
            if (text) {
                WebviewBridge.streamMessageChunk(webview, text);
            }
        };
        const onComplete = (result) => {
            WebviewBridge.endStreamingMessage(webview);
            onToolCallsReady(result);
        };
        return createStreamingToolCallback(onTextChunk, onComplete);
    }
}
//# sourceMappingURL=WebviewBridge.js.map