import * as vscode from 'vscode';
import { safePostMessage } from '../../utils';

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
}
