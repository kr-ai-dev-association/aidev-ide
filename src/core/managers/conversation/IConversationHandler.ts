/**
 * IConversationHandler
 * ConversationManager의 인터페이스
 * 순환 의존성 방지를 위해 분리
 */

import * as vscode from 'vscode';
import { PromptType } from '../../../services';

export interface UserMessageOptions {
    userQuery: string;
    webviewToRespond: vscode.Webview;
    promptType: PromptType;
    extensionContext?: vscode.ExtensionContext;
}

export interface IConversationHandler {
    /**
     * 사용자 메시지를 처리하고 응답합니다
     */
    handleUserMessageAndRespond(options: UserMessageOptions): Promise<void>;
}
