/**
 * Webview Bridge
 * 웹뷰와의 통신을 담당하는 유틸리티
 * 처리 단계 및 상태 업데이트를 웹뷰로 전송
 */

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
 */
export class WebviewBridge {
    /**
     * 처리 단계를 웹뷰로 전송
     */
    public static sendProcessingStep(webview: vscode.Webview | undefined, step: string): void {
        if (webview) {
            safePostMessage(webview, { command: 'setProcessingStep', step });
        }
    }

    /**
     * 처리 상태를 웹뷰로 전송
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
}

