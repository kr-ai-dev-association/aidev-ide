/**
 * Conversation Service
 * ConversationManager를 위한 진입점 서비스
 * 각 매니저를 호출하여 대화 흐름을 제어
 */
import { ConversationManager } from './ConversationManager';
import { SettingsManager } from '../state/SettingsManager';
import { StateManager } from '../state/StateManager';
/**
 * ConversationService
 * ConversationManager를 사용하여 사용자 메시지를 처리하는 진입점
 */
export class ConversationService {
    /**
     * 사용자 메시지를 처리하고 응답을 생성합니다
     */
    static async handleUserMessage(options) {
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
                currentModelType = await stateManager.getCurrentAiModel();
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
            terminalContext: options.terminalContext,
            diagnosticsContext: options.diagnosticsContext,
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
    static cancelCurrentCall() {
        try {
            const conversationManager = ConversationManager.getInstance();
            conversationManager.cancelCurrentCall();
            console.log('[ConversationService] Current call cancelled');
        }
        catch (error) {
            // ConversationManager가 아직 초기화되지 않은 경우 무시
            console.warn('[ConversationService] Failed to cancel call:', error);
        }
    }
    /**
     * 히스토리를 초기화합니다
     */
    static async clearHistory(promptType, extensionContext) {
        if (!extensionContext)
            return;
        const { SessionManager } = await import('../state/SessionManager');
        const sessionManager = SessionManager.getInstance(extensionContext);
        // 현재 세션의 대화 히스토리 및 토큰 사용량 초기화
        sessionManager.clearConversationHistory();
        sessionManager.resetTokensUsed();
    }
}
//# sourceMappingURL=ConversationService.js.map