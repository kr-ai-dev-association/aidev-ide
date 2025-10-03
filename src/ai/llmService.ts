import * as vscode from 'vscode';
import { StorageService } from '../services/storage';
import { CodebaseContextService } from './codebaseContextService';
import { LlmResponseProcessor } from './llmResponseProcessor';
import { NotificationService } from '../services/notificationService';
import { ConfigurationService } from '../services/configurationService';
import { safePostMessage } from '../webview/panelUtils';
import { GeminiApi } from './gemini';
import { OllamaApi } from './ollamaService';
import { checkTokenLimit, logTokenUsage } from '../utils/tokenUtils';
import { AiModelType, PromptType } from './types';
import { ActionPlannerService, ActionPlan } from './actionPlannerService';
import { TerminalMonitorService } from './terminalMonitorService';
import { ActionExecutionEngine } from './actionExecutionEngine';
import { ProjectProfileService, ProjectProfile } from './projectProfileService';
import { IntentDetectionService, IntentDetectionResult } from './intentDetectionService';

export class LlmService {
    private storageService: StorageService;
    private geminiApi: GeminiApi;
    private ollamaApi: OllamaApi;
    private codebaseContextService: CodebaseContextService;
    private llmResponseProcessor: LlmResponseProcessor;
    private notificationService: NotificationService;
    private configurationService: ConfigurationService;
    private currentCallController: AbortController | null = null;
    private currentModelType: AiModelType = AiModelType.GEMINI;

    private actionPlannerService: ActionPlannerService;
    public terminalMonitorService: TerminalMonitorService;
    private actionExecutionEngine: ActionExecutionEngine;
    private activePlans: Map<string, ActionPlan> = new Map();
    private projectProfileService?: ProjectProfileService;
    private projectProfile?: ProjectProfile;
    private intentDetectionService?: IntentDetectionService;

    private chatWebview?: vscode.Webview;
    private askWebview?: vscode.Webview;

    constructor(
        storageService: StorageService,
        geminiApi: GeminiApi,
        ollamaApi: OllamaApi,
        codebaseContextService: CodebaseContextService,
        llmResponseProcessor: LlmResponseProcessor,
        notificationService: NotificationService,
        configurationService: ConfigurationService,
        private readonly extensionContext?: vscode.ExtensionContext
    ) {
        this.storageService = storageService;
        this.geminiApi = geminiApi;
        this.ollamaApi = ollamaApi;
        this.codebaseContextService = codebaseContextService;
        this.llmResponseProcessor = llmResponseProcessor;
        this.notificationService = notificationService;
        this.configurationService = configurationService;

        this.actionPlannerService = new ActionPlannerService(notificationService, configurationService);
        this.terminalMonitorService = new TerminalMonitorService(notificationService);
        this.actionExecutionEngine = new ActionExecutionEngine(notificationService, this.terminalMonitorService);

        try { this.terminalMonitorService.startMonitoring(); } catch {}

        if (extensionContext) {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (workspaceFolder) {
                this.projectProfileService = new ProjectProfileService(workspaceFolder.uri.fsPath, extensionContext.globalState);
            }
        }

        this.intentDetectionService = new IntentDetectionService(ollamaApi);
    }

    public setChatWebview(webview: vscode.Webview | undefined): void { this.chatWebview = webview; }
    public setAskWebview(webview: vscode.Webview | undefined): void { this.askWebview = webview; }
    public getTerminalMonitorService(): TerminalMonitorService { return this.terminalMonitorService; }

    public setCurrentModel(modelType: AiModelType): void {
        this.currentModelType = modelType;
        console.log(`[LlmService] Current model set to: ${modelType}`);
    }

    public getCurrentModel(): AiModelType {
        return this.currentModelType;
    }

    public cancelCurrentCall(): void {
        if (this.currentCallController) {
            this.currentCallController.abort();
            this.currentCallController = null;
        }
    }

    private async getCurrentModelName(): Promise<string> {
        try {
            if (this.currentModelType === AiModelType.GEMINI) {
                return 'Gemini 2.5 Flash';
            }
            return await this.ollamaApi.getCurrentModelName();
        } catch {
            return 'Unknown Model';
        }
    }

    public async handleUserMessageAndRespond(
        userQuery: string,
        webviewToRespond: vscode.Webview,
        promptType: PromptType,
        imageData?: string,
        imageMimeType?: string,
        selectedFiles?: string[]
    ): Promise<void> {
        this.currentCallController = new AbortController();
        const abortSignal = this.currentCallController.signal;

        try {
            // Log model used for this query
            const modelName = await this.getCurrentModelName();
            console.log(`[LlmService] Using model: type=${this.currentModelType}, name=${modelName}`);

            safePostMessage(webviewToRespond, { command: 'showLoading' });

            // Minimal passthrough without heavy context to keep compilable
            const systemPrompt = `개발 도우미.`;
            const userParts: any[] = [{ text: userQuery }];

            const tokenCheck = checkTokenLimit(systemPrompt, userParts, this.currentModelType, modelName);
            logTokenUsage(systemPrompt, userParts, this.currentModelType);
            if (tokenCheck.isExceeded) {
                const msg = tokenCheck.message;
                this.notificationService.showErrorMessage(`AIDEV-IDE: ${msg}`);
                safePostMessage(webviewToRespond, { command: 'receiveMessage', sender: 'AIDEV-IDE', text: msg });
                return;
            }

            let llmResponse = '';
            const requestOptions = { signal: abortSignal } as any;
            if (this.currentModelType === AiModelType.GEMINI) {
                llmResponse = await this.geminiApi.sendMessageWithSystemPrompt(systemPrompt, userParts, requestOptions);
            } else {
                llmResponse = await this.ollamaApi.sendMessageWithSystemPrompt(systemPrompt, userParts, requestOptions);
            }

            await this.llmResponseProcessor.processLlmResponseAndApplyUpdates(
                llmResponse,
                [],
                webviewToRespond,
                promptType
            );
        } catch (error: any) {
            if (error?.name === 'AbortError') {
                safePostMessage(webviewToRespond, { command: 'receiveMessage', sender: 'AIDEV-IDE', text: 'AI 호출이 취소되었습니다.' });
            } else {
                this.notificationService.showErrorMessage(`Error: Failed to process request. ${error?.message || error}`);
                safePostMessage(webviewToRespond, { command: 'receiveMessage', sender: 'AIDEV-IDE', text: `Failed to process request. ${error?.message || error}` });
            }
        } finally {
            this.currentCallController = null;
            safePostMessage(webviewToRespond, { command: 'hideLoading' });
        }
    }
}
