"use strict";
/**
 * Conversation Service
 * ConversationManager를 위한 진입점 서비스
 * 각 매니저를 호출하여 대화 흐름을 제어
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConversationService = void 0;
const services_1 = require("../../../services");
const ConversationManager_1 = require("./ConversationManager");
const SettingsManager_1 = require("../state/SettingsManager");
const StateManager_1 = require("../state/StateManager");
/**
 * ConversationService
 * ConversationManager를 사용하여 사용자 메시지를 처리하는 진입점
 */
class ConversationService {
    /**
     * 사용자 메시지를 처리하고 응답을 생성합니다
     */
    static async handleUserMessage(options) {
        const conversationManager = ConversationManager_1.ConversationManager.getInstance();
        // 필요한 정보 수집
        const extensionContext = options.extensionContext;
        let geminiApi = options.geminiApi;
        let ollamaApi = options.ollamaApi;
        let currentModelType = options.currentModelType;
        let userOS = options.userOS;
        // extensionContext가 있으면 설정에서 정보 가져오기
        if (extensionContext) {
            const stateManager = StateManager_1.StateManager.getInstance(extensionContext);
            const settingsManager = SettingsManager_1.SettingsManager.getInstance(extensionContext);
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
        const conversationManager = ConversationManager_1.ConversationManager.getInstance();
        // ConversationManager는 LLMApiClient를 통해 취소 처리
        // 필요시 추가 구현
    }
    /**
     * 히스토리를 초기화합니다
     */
    static async clearHistory(promptType, extensionContext) {
        if (!extensionContext)
            return;
        const { SessionManager } = await import('../state/SessionManager');
        const sessionManager = SessionManager.getInstance(extensionContext);
        const tabType = promptType === services_1.PromptType.CODE_GENERATION ? 'code' : 'ask';
        sessionManager.clearTabHistory(tabType);
    }
}
exports.ConversationService = ConversationService;
//# sourceMappingURL=ConversationService.js.map