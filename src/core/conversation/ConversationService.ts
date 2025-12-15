/**
 * Conversation Service
 * ConversationManager를 위한 진입점 서비스
 * 각 매니저를 호출하여 대화 흐름을 제어
 */

import * as vscode from 'vscode';
import { PromptType, GeminiApi, OllamaApi, AiModelType, NotificationService, GitRepositoryService } from '../../services';
import { ConversationManager } from './ConversationManager';
import { SettingsManager } from '../state/SettingsManager';
import { StateManager } from '../state/StateManager';

export interface ConversationServiceOptions {
    userQuery: string;
    webviewToRespond: vscode.Webview;
    promptType: PromptType;
    imageData?: string;
    imageMimeType?: string;
    selectedFiles?: string[];
    extensionContext?: vscode.ExtensionContext;
    geminiApi?: GeminiApi;
    ollamaApi?: OllamaApi;
    currentModelType?: AiModelType;
    userOS?: string;
    notificationService?: NotificationService;
    gitRepositoryService?: GitRepositoryService;
    abortSignal?: AbortSignal;
}

/**
 * ConversationService
 * ConversationManager를 사용하여 사용자 메시지를 처리하는 진입점
 */
export class ConversationService {
    /**
     * 사용자 메시지를 처리하고 응답을 생성합니다
     */
    public static async handleUserMessage(options: ConversationServiceOptions): Promise<void> {
        const conversationManager = ConversationManager.getInstance();
        
        // 필요한 정보 수집
        const extensionContext = options.extensionContext;
        let geminiApi = options.geminiApi;
        let ollamaApi = options.ollamaApi;
        let currentModelType = options.currentModelType;
        let userOS = options.userOS;
        
        // extensionContext가 있으면 설정에서 정보 가져오기
        if (extensionContext) {
            const stateManager = StateManager.getInstance(extensionContext);
            const settingsManager = SettingsManager.getInstance(extensionContext);
            
            if (!userOS) {
                const platform = require('os').platform();
                userOS = platform === 'darwin' ? 'macOS' : platform === 'win32' ? 'Windows' : platform === 'linux' ? 'Linux' : 'Unknown';
            }
            
            if (!currentModelType) {
                currentModelType = await stateManager.getCurrentAiModel() as AiModelType;
            }
        }
        
        // ConversationManager에 옵션 전달
        await conversationManager.handleUserMessageAndRespond({
            userQuery: options.userQuery,
            webviewToRespond: options.webviewToRespond,
            promptType: options.promptType,
            imageData: options.imageData,
            imageMimeType: options.imageMimeType,
            selectedFiles: options.selectedFiles,
            extensionContext: options.extensionContext,
            geminiApi: geminiApi,
            ollamaApi: ollamaApi,
            currentModelType: currentModelType,
            userOS: userOS,
            notificationService: options.notificationService,
            gitRepositoryService: options.gitRepositoryService,
            abortSignal: options.abortSignal
        });
    }
    
    /**
     * 현재 호출을 취소합니다
     */
    public static cancelCurrentCall(): void {
        const conversationManager = ConversationManager.getInstance();
        // ConversationManager는 LLMApiClient를 통해 취소 처리
        // 필요시 추가 구현
    }
    
    /**
     * 히스토리를 초기화합니다
     */
    public static async clearHistory(promptType: PromptType, extensionContext?: vscode.ExtensionContext): Promise<void> {
        if (!extensionContext) return;
        
        const { SessionManager } = await import('../state/SessionManager');
        const sessionManager = SessionManager.getInstance(extensionContext);
        const tabType = promptType === PromptType.CODE_GENERATION ? 'code' : 'ask';
        sessionManager.clearTabHistory(tabType);
    }
}

