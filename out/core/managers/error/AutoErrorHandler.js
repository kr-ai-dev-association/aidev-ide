"use strict";
/**
 * Auto Error Handler
 * 자동 오류 처리 및 수정을 담당하는 서비스
 * ErrorManager의 onError 이벤트를 구독하여 자동으로 오류 수정 시도
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutoErrorHandler = void 0;
const ErrorManager_1 = require("./ErrorManager");
const SettingsManager_1 = require("../state/SettingsManager");
const services_1 = require("../../../services");
const utils_1 = require("../../../utils");
const LLMManager_1 = require("../model/LLMManager");
class AutoErrorHandler {
    static instance;
    conversationManager;
    chatWebview;
    askWebview;
    extensionContext;
    lastErrorHandledAt = 0;
    suppressCancelNoticeOnce = false;
    constructor() {
        console.log('[AutoErrorHandler] Initialized');
    }
    static getInstance() {
        if (!AutoErrorHandler.instance) {
            AutoErrorHandler.instance = new AutoErrorHandler();
        }
        return AutoErrorHandler.instance;
    }
    /**
     * AutoErrorHandler를 설정합니다
     */
    configure(options) {
        this.conversationManager = options.conversationManager;
        this.chatWebview = options.chatWebview;
        this.askWebview = options.askWebview;
        this.extensionContext = options.extensionContext;
        // ErrorManager의 onError 이벤트 구독
        const errorManager = ErrorManager_1.ErrorManager.getInstance();
        errorManager.onError(async (evt) => {
            await this.handleError(evt);
        });
        console.log('[AutoErrorHandler] Configured');
    }
    /**
     * 웹뷰를 업데이트합니다
     */
    setChatWebview(webview) {
        this.chatWebview = webview;
    }
    /**
     * 웹뷰를 업데이트합니다
     */
    setAskWebview(webview) {
        this.askWebview = webview;
    }
    /**
     * 에러를 처리합니다
     */
    async handleError(evt) {
        try {
            // 자동 오류 수정이 비활성화된 경우 처리하지 않음
            const autoCorrectionEnabled = await SettingsManager_1.SettingsManager.getInstance().isAutoCorrectionEnabled();
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
            const pretty = LLMManager_1.LLMManager.formatErrorForChat(evt);
            (0, utils_1.safePostMessage)(target, { command: 'receiveMessage', sender: 'CODEPILOT', text: pretty });
            // 자동 오류 수정 시도
            const shortPrompt = `터미널 에러 해결: ${evt.message}`;
            console.log('[AutoErrorHandler] Auto error fix prompt:', shortPrompt);
            console.log('[AutoErrorHandler] Starting auto error correction...');
            // ConversationManager를 통해 오류 수정 요청
            await this.conversationManager.handleUserMessageAndRespond({
                userQuery: shortPrompt,
                webviewToRespond: target,
                promptType: services_1.PromptType.CODE_GENERATION,
                extensionContext: this.extensionContext
            });
            console.log('[AutoErrorHandler] Auto error correction completed');
        }
        catch (autoErr) {
            console.warn('[AutoErrorHandler] Auto error handling failed:', autoErr);
        }
    }
}
exports.AutoErrorHandler = AutoErrorHandler;
//# sourceMappingURL=AutoErrorHandler.js.map