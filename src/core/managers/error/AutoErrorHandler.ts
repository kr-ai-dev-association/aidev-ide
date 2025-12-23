/**
 * Auto Error Handler
 * 자동 오류 처리 및 수정을 담당하는 서비스
 * ErrorManager의 onError 이벤트를 구독하여 자동으로 오류 수정 시도
 */

import * as vscode from 'vscode';
import { ErrorManager } from './ErrorManager';
import { SettingsManager } from '../state/SettingsManager';
import { ConversationManager } from '../conversation/ConversationManager';
import { PromptType } from '../../../services';
import { safePostMessage } from '../../../utils';
import { LLMManager } from '../model/LLMManager';

export interface AutoErrorHandlerOptions {
    conversationManager: ConversationManager;
    chatWebview?: vscode.Webview;
    askWebview?: vscode.Webview;
    extensionContext?: vscode.ExtensionContext;
}

export class AutoErrorHandler {
    private static instance: AutoErrorHandler;
    private conversationManager?: ConversationManager;
    private chatWebview?: vscode.Webview;
    private askWebview?: vscode.Webview;
    private extensionContext?: vscode.ExtensionContext;
    private lastErrorHandledAt: number = 0;
    private suppressCancelNoticeOnce: boolean = false;

    private constructor() {
        console.log('[AutoErrorHandler] Initialized');
    }

    public static getInstance(): AutoErrorHandler {
        if (!AutoErrorHandler.instance) {
            AutoErrorHandler.instance = new AutoErrorHandler();
        }
        return AutoErrorHandler.instance;
    }

    /**
     * AutoErrorHandler를 설정합니다
     */
    public configure(options: AutoErrorHandlerOptions): void {
        this.conversationManager = options.conversationManager;
        this.chatWebview = options.chatWebview;
        this.askWebview = options.askWebview;
        this.extensionContext = options.extensionContext;

        // ErrorManager의 onError 이벤트 구독
        const errorManager = ErrorManager.getInstance();
        errorManager.onError(async (evt) => {
            await this.handleError(evt);
        });

        console.log('[AutoErrorHandler] Configured');
    }

    /**
     * 웹뷰를 업데이트합니다
     */
    public setChatWebview(webview: vscode.Webview | undefined): void {
        this.chatWebview = webview;
    }

    /**
     * 웹뷰를 업데이트합니다
     */
    public setAskWebview(webview: vscode.Webview | undefined): void {
        this.askWebview = webview;
    }

    /**
     * 에러를 처리합니다
     */
    private async handleError(evt: any): Promise<void> {
        try {
            // 자동 오류 수정이 비활성화된 경우 처리하지 않음
            const autoCorrectionEnabled = await SettingsManager.getInstance().isAutoCorrectionEnabled();
            if (!autoCorrectionEnabled) {
                console.log('[AutoErrorHandler] Auto error correction is disabled, skipping error handling');
                return;
            }

            const now = Date.now();
            if (now - this.lastErrorHandledAt < 8000) {
                console.log('[AutoErrorHandler] Skipping terminal error due to cooldown');
                return;
            }
            this.lastErrorHandledAt = now;

            const target = this.chatWebview || this.askWebview;
            if (!target) {
                console.log('[AutoErrorHandler] No webview available to post terminal error');
                return;
            }

            if (!this.conversationManager) {
                console.warn('[AutoErrorHandler] ConversationManager not configured');
                return;
            }

            // 에러 메시지 포맷팅 및 전송
            // LLMManager를 통해 포맷팅 (ResponseFormatter는 deprecated)
            // LLMManager는 singleton이지만 초기화가 필요할 수 있으므로, formatErrorForChat을 static으로 사용하거나
            // ErrorManager에서 직접 포맷팅하도록 변경
            const pretty = LLMManager.formatErrorForChat(evt);
            safePostMessage(target, { command: 'receiveMessage', sender: 'AIDEV-IDE', text: pretty });

            // 자동 오류 수정 시도
            const shortPrompt = `터미널 에러 해결: ${evt.message}`;
            console.log('[AutoErrorHandler] Auto error fix prompt:', shortPrompt);
            console.log('[AutoErrorHandler] Starting auto error correction...');

            // ConversationManager를 통해 오류 수정 요청
            await this.conversationManager.handleUserMessageAndRespond({
                userQuery: shortPrompt,
                webviewToRespond: target,
                promptType: PromptType.CODE_GENERATION,
                extensionContext: this.extensionContext
            });

            console.log('[AutoErrorHandler] Auto error correction completed');
        } catch (autoErr) {
            console.warn('[AutoErrorHandler] Auto error handling failed:', autoErr);
        }
    }
}

