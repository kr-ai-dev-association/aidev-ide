/**
 * Conversation Service
 * ConversationManager를 위한 진입점 서비스
 * 각 매니저를 호출하여 대화 흐름을 제어
 */

import * as vscode from 'vscode';
import { PromptType, OllamaApi, AiModelType, NotificationService } from '../../../services';
import { ConversationManager } from './ConversationManager';
import { SettingsManager } from '../state/SettingsManager';
import { StateManager } from '../state/StateManager';
import { OrchestrationRouter } from '../../orchestration/OrchestrationRouter';

export interface ConversationServiceOptions {
    userQuery: string;
    webviewToRespond: vscode.Webview;
    promptType: PromptType;
    imageData?: string;
    imageMimeType?: string;
    selectedFiles?: string[];
    selectedCode?: string; // 에디터에서 선택된 코드
    terminalContext?: string;
    diagnosticsContext?: string;
    extensionContext?: vscode.ExtensionContext;
    ollamaApi?: OllamaApi;
    currentModelType?: AiModelType;
    userOS?: string;
    notificationService?: NotificationService;
    abortSignal?: AbortSignal;
}

/**
 * ConversationService
 * ConversationManager를 사용하여 사용자 메시지를 처리하는 진입점
 */
export class ConversationService {
    /** 현재 진행 중인 메시지 처리 AbortController */
    private static _currentAbortController: AbortController | null = null;

    /**
     * 사용자 메시지를 처리하고 응답을 생성합니다
     */
    public static async handleUserMessage(options: ConversationServiceOptions): Promise<void> {
        // 필요한 정보 수집
        const extensionContext = options.extensionContext;
        let ollamaApi = options.ollamaApi;
        let currentModelType = options.currentModelType;
        let userOS = options.userOS;

        // 이전 호출 취소 후 새 AbortController 생성
        if (ConversationService._currentAbortController) {
            ConversationService._currentAbortController.abort();
        }
        const abortController = new AbortController();
        ConversationService._currentAbortController = abortController;

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

        const resolvedOptions = {
            userQuery: options.userQuery,
            webviewToRespond: options.webviewToRespond,
            promptType: options.promptType,
            imageData: options.imageData,
            imageMimeType: options.imageMimeType,
            selectedFiles: options.selectedFiles,
            selectedCode: options.selectedCode,
            terminalContext: options.terminalContext,
            diagnosticsContext: options.diagnosticsContext,
            extensionContext: options.extensionContext,
            ollamaApi: ollamaApi,
            currentModelType: currentModelType,
            userOS: userOS,
            notificationService: options.notificationService,
            abortSignal: options.abortSignal ?? abortController.signal
        };

        try {
            // OrchestrationRouter를 통해 분기
            // OFF → ConversationManager 직접 호출 (기존 동작)
            // ON → Orchestrator 실행 → 단순 작업이면 자동 폴백
            await OrchestrationRouter.route(resolvedOptions);
        } finally {
            // 완료 후 정리
            if (ConversationService._currentAbortController === abortController) {
                ConversationService._currentAbortController = null;
            }
        }
    }

    /**
     * 현재 호출을 취소합니다
     */
    public static cancelCurrentCall(): void {
        // OrchestrationRouter AbortSignal 취소
        if (ConversationService._currentAbortController) {
            ConversationService._currentAbortController.abort();
            ConversationService._currentAbortController = null;
            console.log('[ConversationService] AbortController signal aborted');
        }
        // ConversationManager (non-orchestration) 취소
        try {
            const conversationManager = ConversationManager.getInstance();
            conversationManager.cancelCurrentCall();
            console.log('[ConversationService] Current call cancelled');
        } catch (error) {
            // ConversationManager가 아직 초기화되지 않은 경우 무시
            console.warn('[ConversationService] Failed to cancel call:', error);
        }
    }

    /**
     * 히스토리를 초기화합니다
     * Claude Code /clear 방식: 새 세션 생성 + 모든 캐시 클리어
     */
    public static async clearHistory(promptType: PromptType, extensionContext?: vscode.ExtensionContext): Promise<void> {
        if (!extensionContext) return;

        const { SessionManager } = await import('../state/SessionManager');
        const sessionManager = SessionManager.getInstance(extensionContext);

        // 1. 현재 세션의 대화 히스토리 및 토큰 사용량 초기화
        sessionManager.clearConversationHistory();
        sessionManager.resetTokensUsed();

        // 3. ProjectContextCache 클리어 (stale 파일 내용 방지)
        try {
            const { ProjectContextCache } = await import('../context/ProjectContextCache');
            const cache = ProjectContextCache.getInstance();
            cache.clearAll();
        } catch { /* not initialized */ }

        // 4. ToolSpecBuilder 캐시 클리어 (이전 Rules 기준 방지)
        try {
            const { ToolSpecBuilder } = await import('../../tools/ToolSpecBuilder');
            ToolSpecBuilder.clearSpecCache();
        } catch { /* not initialized */ }

        // 5. InlineDiffManager 턴 체크포인트 스택 클리어
        try {
            const { InlineDiffManager } = await import('../diff/InlineDiffManager');
            const diffMgr = InlineDiffManager.getInstance();
            diffMgr.clearTurnCheckpointStack();
        } catch { /* not initialized */ }

        console.log('[ConversationService] Session cleared: history + caches flushed');
    }
}

