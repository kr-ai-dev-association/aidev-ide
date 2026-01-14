"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebviewBridge = void 0;
const utils_1 = require("../../utils");
/**
 * 웹뷰 브리지 유틸리티 클래스
 * 모든 웹뷰 통신은 이 클래스를 통해 일원화됩니다.
 */
class WebviewBridge {
    /**
     * 처리 상태 업데이트 (로딩 바 표시용)
     */
    static updateProcessingStatus(webview, status, step) {
        if (webview) {
            (0, utils_1.safePostMessage)(webview, {
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
            (0, utils_1.safePostMessage)(webview, {
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
            (0, utils_1.safePostMessage)(webview, {
                command: 'hideLoading'
            });
        }
    }
    /**
     * 작업 큐(플랜) 업데이트
     */
    static updateTaskQueue(webview, tasks) {
        if (webview) {
            (0, utils_1.safePostMessage)(webview, {
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
            (0, utils_1.safePostMessage)(webview, {
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
        if (webview) {
            (0, utils_1.safePostMessage)(webview, { command: 'setProcessingStep', step });
        }
    }
    /**
     * 처리 상태 전송 (호환성 유지)
     */
    static sendProcessingStatus(webview, step, status) {
        if (webview) {
            (0, utils_1.safePostMessage)(webview, { command: 'updateProcessingStatus', step, status });
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
}
exports.WebviewBridge = WebviewBridge;
//# sourceMappingURL=WebviewBridge.js.map