import * as vscode from 'vscode';
import { StorageService } from '../services/storage';
import { CodebaseContextService } from './codebaseContextService';
import { LlmResponseProcessor } from './llmResponseProcessor';
import { NotificationService } from '../services/notificationService';
import { ConfigurationService } from '../services/configurationService';
import { ExternalApiService } from './externalApiService';
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
    private externalApiService: ExternalApiService;
    private currentCallController: AbortController | null = null;
    private currentModelType: AiModelType = AiModelType.GEMINI; // 기본값

    // 액션 플래너 관련 서비스들
    private actionPlannerService: ActionPlannerService;
    private terminalMonitorService: TerminalMonitorService;
    private actionExecutionEngine: ActionExecutionEngine;
    private activePlans: Map<string, ActionPlan> = new Map();
    private projectProfileService?: ProjectProfileService;
    private projectProfile?: ProjectProfile;
    private intentDetectionService?: IntentDetectionService;
    private chatWebview?: vscode.Webview;
    private askWebview?: vscode.Webview;
    private lastErrorHandledAt: number = 0;

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
        this.externalApiService = new ExternalApiService(configurationService);

        // 액션 플래너 서비스들 초기화
        this.actionPlannerService = new ActionPlannerService(notificationService, configurationService);
        this.terminalMonitorService = new TerminalMonitorService(notificationService);
        this.actionExecutionEngine = new ActionExecutionEngine(notificationService, this.terminalMonitorService);

        if (extensionContext) {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (workspaceFolder) {
                this.projectProfileService = new ProjectProfileService(workspaceFolder.uri.fsPath, extensionContext.globalState);
            }
        }

        this.intentDetectionService = new IntentDetectionService(ollamaApi);

        // Start terminal monitoring and subscribe for errors
        try {
            this.terminalMonitorService.startMonitoring();
            this.terminalMonitorService.onError(async (evt) => {
                try {
                    const now = Date.now();
                    if (now - this.lastErrorHandledAt < 8000) {
                        console.log('[LlmService] Skipping terminal error due to cooldown');
                        return;
                    }
                    this.lastErrorHandledAt = now;

                    const target = this.chatWebview || this.askWebview;
                    if (!target) {
                        console.log('[LlmService] No webview available to post terminal error');
                        return;
                    }

                    const pretty = this.formatErrorForChat(evt);
                    safePostMessage(target, { command: 'receiveMessage', sender: 'AIDEV-IDE', text: pretty });

                    const shortPrompt = `터미널 에러 해결: ${evt.message}`;
                    console.log('[LlmService] Auto error fix prompt:', shortPrompt);
                    await this.handleUserMessageAndRespond(shortPrompt, target, PromptType.CODE_GENERATION);
                } catch (autoErr) {
                    console.warn('[LlmService] Auto error handling failed:', autoErr);
                }
            });
        } catch (e) {
            console.warn('[LlmService] Terminal monitor setup failed:', e);
        }
    }

    public setChatWebview(webview: vscode.Webview | undefined): void { this.chatWebview = webview; }
    public setAskWebview(webview: vscode.Webview | undefined): void { this.askWebview = webview; }
    public getTerminalMonitorService(): TerminalMonitorService { return this.terminalMonitorService; }

    public setCurrentModel(modelType: AiModelType): void {
        this.currentModelType = modelType;
        console.log(`[LlmService] Current model set to: ${modelType}`);
    }

    private formatErrorForChat(evt: { time: number; source: string; message: string; recentLogs: any[] }): string {
        const header = `터미널 에러 감지 (${new Date(evt.time).toLocaleString()}):\n소스: ${evt.source}\n메시지: ${evt.message}`;
        const tail = evt.recentLogs && evt.recentLogs.length > 0
            ? '\n\n최근 로그 (최대 10줄):\n' + evt.recentLogs.slice(-10).map((l: any) => `- ${l.message || l.rawOutput || ''}`).join('\n')
            : '';
        return header + tail;
    }

    /**
     * 현재 설정된 모델의 실제 이름을 가져옵니다.
     * @returns 현재 모델명
     */
    private async getCurrentModelName(): Promise<string> {
        try {
            if (this.currentModelType === AiModelType.GEMINI) {
                return 'Gemini 2.5 Flash';
            } else if (this.currentModelType === AiModelType.OLLAMA_Gemma ||
                this.currentModelType === AiModelType.OLLAMA_DeepSeek ||
                this.currentModelType === AiModelType.OLLAMA_CodeLlama) {
                // Ollama 모델의 경우 실제 모델명을 가져옴
                return await this.ollamaApi.getCurrentModelName();
            }
        } catch (error) {
            console.warn(`[LlmService] 모델명 가져오기 실패: ${error}`);
        }

        // 기본값 반환
        switch (this.currentModelType) {
            case AiModelType.GEMINI:
                return 'Gemini 2.5 Flash';
            case AiModelType.OLLAMA_Gemma:
                return 'Gemma3:27b';
            case AiModelType.OLLAMA_DeepSeek:
                return 'DeepSeek R1:70B';
            case AiModelType.OLLAMA_CodeLlama:
                return 'CodeLlama 7B';
            default:
                return 'Unknown Model';
        }
    }

    public getCurrentModel(): AiModelType {
        return this.currentModelType;
    }

    public cancelCurrentCall(): void {
        console.log(`[ AIDEV-IDE ] Attempting to cancel current ${this.currentModelType} call.`);
        if (this.currentCallController) {
            this.currentCallController.abort();
            this.currentCallController = null;
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
            safePostMessage(webviewToRespond, { command: 'showLoading' });
            const currentModelNameForLog = await this.getCurrentModelName();
            console.log(`[LlmService] Using model: type=${this.currentModelType}, name=${currentModelNameForLog}`);

            if (this.projectProfileService) {
                this.projectProfile = await this.projectProfileService.loadProfile();
            }

            let intentResult: IntentDetectionResult | undefined;
            if (this.intentDetectionService) {
                try {
                    intentResult = await this.intentDetectionService.detectIntent(userQuery);
                    console.log('[LlmService] Detected intent:', intentResult);
                } catch (error) {
                    console.warn('[LlmService] Intent detection failed:', error);
                }
            }

            // --- 대화 기록 관리 ---
            const historyKey = promptType === PromptType.CODE_GENERATION ? 'codeTabHistory' : 'askTabHistory';
            let history: { userQuery: string, aiResponse?: string, timestamp: number }[] = [];
            if (this.extensionContext) {
                history = this.extensionContext.globalState.get(historyKey, []);
            }

            // --- 최근 5개 대화 context 생성 ---
            let historyContext = '';
            if (history.length > 0) {
                const recentConversations = history.slice(-5); // 최근 5개 대화
                if (recentConversations.length > 0) {
                    historyContext = '--- 최근 대화 내역 ---\n' +
                        recentConversations.map((conv, i) => {
                            let conversationText = `${i + 1}. 사용자: ${conv.userQuery}`;
                            if (conv.aiResponse) {
                                conversationText += `\n   AI: ${conv.aiResponse}`;
                            }
                            return conversationText;
                        }).join('\n\n') + '\n\n';
                }
            }

            // 실시간 정보 요청 처리
            const realTimeInfo = await this.processRealTimeInfoRequest(userQuery);

            // 코드베이스 컨텍스트 수집
            let fileContentsContext = '';
            let includedFilesForContext: { name: string, fullPath: string }[] = [];

            if (promptType === PromptType.CODE_GENERATION) {
                // 새로운 방식: 질의 기반 관련 파일 자동 검색 (CODE 탭에도 적용)
                const relevantContextResult = await this.codebaseContextService.getRelevantFilesContext(userQuery, abortSignal, history);
                fileContentsContext = relevantContextResult.fileContentsContext;
                includedFilesForContext = relevantContextResult.includedFilesForContext;
            } else if (promptType === PromptType.GENERAL_ASK) {
                // 새로운 방식: 질의 기반 관련 파일 자동 검색
                const relevantContextResult = await this.codebaseContextService.getRelevantFilesContext(userQuery, abortSignal, history);
                fileContentsContext = relevantContextResult.fileContentsContext;
                includedFilesForContext = relevantContextResult.includedFilesForContext;
            }

            // 선택된 파일들의 내용을 읽어서 컨텍스트에 추가
            let selectedFilesContext = "";
            if (selectedFiles && selectedFiles.length > 0) {
                for (const filePath of selectedFiles) {
                    try {
                        const fileUri = vscode.Uri.file(filePath);
                        const contentBytes = await vscode.workspace.fs.readFile(fileUri);
                        const content = Buffer.from(contentBytes).toString('utf8');
                        const fileName = filePath.split(/[/\\]/).pop() || 'Unknown';

                        // 선택된 파일을 includedFilesForContext 배열에 추가
                        includedFilesForContext.push({
                            name: fileName,
                            fullPath: filePath
                        });

                        selectedFilesContext += `파일명: ${fileName}\n경로: ${filePath}\n코드:\n\`\`\`\n${content}\n\`\`\`\n\n`;
                    } catch (error) {
                        console.error(`Error reading selected file ${filePath}:`, error);
                        selectedFilesContext += `파일명: ${filePath.split(/[/\\]/).pop() || 'Unknown'}\n경로: ${filePath}\n오류: 파일을 읽을 수 없습니다.\n\n`;
                    }
                }
            }

            // 선택된 파일 컨텍스트를 기존 컨텍스트에 추가
            const fullFileContentsContext = selectedFilesContext
                ? `${fileContentsContext}\n--- 사용자가 선택한 추가 파일들 ---\n${selectedFilesContext}`
                : fileContentsContext;



            // 시스템 프롬프트 생성
            const profileContext = this.projectProfile ? this.buildProfileContext(this.projectProfile) : '';
            const intentContext = intentResult ? this.buildIntentContext(intentResult) : '';
            const systemPrompt = this.generateSystemPrompt(promptType, fullFileContentsContext, realTimeInfo, profileContext, intentContext);

            // 사용자 메시지 파트 구성
            const userParts: any[] = [];

            // 대화 기록이 있으면 먼저 추가
            if (historyContext) {
                userParts.push({ text: historyContext });
            }

            // 현재 질문 추가
            userParts.push({ text: userQuery });

            // 이미지가 있는 경우 추가
            if (imageData && imageMimeType) {
                // Gemini와 Ollama 모두 이미지 데이터 전달 (Ollama는 멀티모달 모델에서 지원)
                userParts.push({
                    inlineData: {
                        data: imageData,
                        mimeType: imageMimeType
                    }
                });
            }



            // 토큰 제한 확인
            const tokenCheck = checkTokenLimit(systemPrompt, userParts, this.currentModelType, currentModelNameForLog);
            logTokenUsage(systemPrompt, userParts, this.currentModelType, currentModelNameForLog);

            if (tokenCheck.isExceeded) {
                const errorMessage = tokenCheck.message;
                console.error(`[LlmService] ${errorMessage}`);
                this.notificationService.showErrorMessage(`AIDEV-IDE: ${errorMessage}`);
                safePostMessage(webviewToRespond, {
                    command: 'receiveMessage',
                    sender: 'AIDEV-IDE',
                    text: errorMessage
                });
                return;
            }

            // ===== 전송 시작 배너 및 타임스탬프 로그 =====
            const sendStartedAt = Date.now();
            console.log('\n********************************************** 전송시작 ************************************************');
            console.log(`[LlmService] Send Time: ${new Date(sendStartedAt).toISOString()}`);
            console.log(`[LlmService] Model: type=${this.currentModelType}, name=${currentModelNameForLog}`);
            console.log('[LlmService] Full System Prompt:\n', systemPrompt);
            console.log('[LlmService] Full User Parts:\n', userParts.map(p => p.text || '[Image Data]').join('\n'));
            // end of send banner

            let llmResponse: string;

            if (this.currentModelType === AiModelType.GEMINI) {
                const requestOptions = { signal: abortSignal };
                llmResponse = await this.geminiApi.sendMessageWithSystemPrompt(
                    systemPrompt,
                    userParts,
                    requestOptions
                );
            } else if (
                this.currentModelType === AiModelType.OLLAMA_Gemma ||
                this.currentModelType === AiModelType.OLLAMA_DeepSeek ||
                this.currentModelType === AiModelType.OLLAMA_CodeLlama
            ) {
                // Ollama API에 직접 호출 (selectedFiles는 이미 시스템 프롬프트에 포함됨)
                const requestOptions = { signal: abortSignal };
                llmResponse = await this.ollamaApi.sendMessageWithSystemPrompt(
                    systemPrompt,
                    userParts,
                    requestOptions
                );
            } else {
                throw new Error(`Unsupported model type: ${this.currentModelType}`);
            }

            // ===== 전송 완료 배너 및 타임스탬프/소요시간 로그 =====
            const sendFinishedAt = Date.now();
            const durationMs = sendFinishedAt - sendStartedAt;
            console.log('\n********************************************** 전송 완료 ************************************************');
            console.log(`[LlmService] Receive Time: ${new Date(sendFinishedAt).toISOString()} (Duration: ${durationMs} ms)`);
            console.log(`[LlmService] Response length: ${llmResponse?.length ?? 0}`);
            const preview = (llmResponse || '').slice(0, 500);
            console.log('[LlmService] Response preview:\n', preview, llmResponse && llmResponse.length > 500 ? '\n... (truncated)' : '');
            // end of receive banner

            // 컨텍스트 파일 목록에 선택된 파일들도 포함
            const allContextFiles = [...includedFilesForContext];
            if (selectedFiles && selectedFiles.length > 0) {
                for (const filePath of selectedFiles) {
                    const fileName = filePath.split(/[/\\]/).pop() || 'Unknown';
                    allContextFiles.push({ name: fileName, fullPath: filePath });
                }
            }

            // GENERAL_ASK 타입일 때는 파일 업데이트를 위한 컨텍스트 파일을 넘기지 않음
            await this.llmResponseProcessor.processLlmResponseAndApplyUpdates(
                llmResponse,
                promptType === PromptType.CODE_GENERATION ? allContextFiles : [],
                webviewToRespond,
                promptType
            );

            // --- AI 응답을 대화 기록에 저장 ---
            if (this.extensionContext && userQuery) {
                const summarizedResponse = this.summarizeAiResponse(llmResponse);
                history.push({
                    userQuery: userQuery,
                    aiResponse: summarizedResponse,
                    timestamp: Date.now()
                });

                // 최대 5개 대화만 유지
                if (history.length > 5) {
                    history = history.slice(-5);
                }

                await this.extensionContext.globalState.update(historyKey, history);
            }

        } catch (error: any) {
            if (error.name === 'AbortError') {
                console.warn(`[AIDEV-IDE] ${this.currentModelType.toUpperCase()} API call was explicitly aborted.`);
                safePostMessage(webviewToRespond, { command: 'receiveMessage', sender: 'AIDEV-IDE', text: 'AI 호출이 취소되었습니다.' });
            } else {
                console.error(`Error in handleUserMessageAndRespond (${this.currentModelType}):`, error);
                this.notificationService.showErrorMessage(`Error: Failed to process request. ${error.message}`);
                safePostMessage(webviewToRespond, { command: 'receiveMessage', sender: 'AIDEV-IDE', text: `Failed to process request. ${error.message}` });
            }
        } finally {
            this.currentCallController = null;
            safePostMessage(webviewToRespond, { command: 'hideLoading' });
        }
    }

    /**
     * AI 응답을 요약하여 대화 기록에 저장합니다.
     * 코드 블록과 긴 설명을 간단히 요약하여 토큰 사용량을 줄입니다.
     */
    private summarizeAiResponse(response: string): string {
        // 응답이 너무 짧으면 그대로 반환
        if (response.length <= 200) {
            return response;
        }

        // 코드 블록 추출
        const codeBlocks = response.match(/```[\s\S]*?```/g) || [];
        const hasCodeBlocks = codeBlocks.length > 0;

        // 파일 작업 지시어 추출
        const fileOperations = response.match(/(새 파일|수정 파일|삭제 파일):\s*[^\n]+/g) || [];
        const hasFileOperations = fileOperations.length > 0;

        // 요약 생성
        let summary = '';

        if (hasFileOperations) {
            summary += `파일 작업: ${fileOperations.join(', ')}. `;
        }

        if (hasCodeBlocks) {
            summary += `코드 블록 ${codeBlocks.length}개 포함. `;
        }

        // 코드 블록과 파일 작업 지시어를 제거한 텍스트에서 첫 2-3문장 추출
        let textContent = response;
        textContent = textContent.replace(/```[\s\S]*?```/g, ''); // 코드 블록 제거
        textContent = textContent.replace(/(새 파일|수정 파일|삭제 파일):\s*[^\n]+/g, ''); // 파일 작업 지시어 제거
        textContent = textContent.replace(/\n+/g, ' ').trim(); // 줄바꿈 정리

        // 첫 2-3문장 추출 (마침표 기준)
        const sentences = textContent.split(/[.!?]+/).filter(s => s.trim().length > 10);
        const firstSentences = sentences.slice(0, 2).join('. ').trim();

        if (firstSentences) {
            summary += firstSentences + '.';
        }

        // 요약이 너무 길면 더 줄임
        if (summary.length > 300) {
            summary = summary.substring(0, 297) + '...';
        }

        return summary || 'AI가 응답을 제공했습니다.';
    }

    private buildProfileContext(profile: ProjectProfile): string {
        const lines: string[] = [];
        lines.push(`언어: ${profile.language}`);
        if (profile.frameworks.length > 0) {
            const formatted = profile.frameworks
                .map(f => `${f.framework} (신뢰도 ${(f.confidence * 100).toFixed(0)}%)`)
                .join(', ');
            lines.push(`프레임워크: ${formatted}`);
        }
        if (profile.packageManager) {
            lines.push(`패키지 매니저: ${profile.packageManager}`);
        }
        if (profile.entryPoints.length > 0) {
            lines.push(`실행 엔트리포인트: ${profile.entryPoints.slice(0, 5).join(', ')}`);
        }
        if (Object.keys(profile.scripts || {}).length > 0) {
            const highlightedScripts = ['start', 'dev', 'serve', 'build', 'test'];
            const selected = highlightedScripts
                .filter(name => profile.scripts[name])
                .map(name => `${name}: ${profile.scripts[name]}`);
            if (selected.length > 0) {
                lines.push('주요 npm 스크립트:');
                lines.push(...selected.map(script => `- ${script}`));
            }
        }
        return lines.join('\n');
    }

    private buildIntentContext(intent: IntentDetectionResult): string {
        const lines: string[] = [];
        lines.push(`카테고리: ${intent.category}`);
        lines.push(`세부 유형: ${intent.subtype}`);
        lines.push(`신뢰도: ${(intent.confidence * 100).toFixed(0)}%`);
        if (intent.keywords && intent.keywords.length > 0) {
            lines.push(`매칭 키워드: ${intent.keywords.join(', ')}`);
        }
        if (intent.reasoning) {
            lines.push(`근거: ${intent.reasoning}`);
        }
        return lines.join('\n');
    }

    /**
     * 실시간 정보 요청을 처리합니다
     */
    private async processRealTimeInfoRequest(userQuery: string): Promise<string> {
        try {
            // ExternalApiService를 통해 실시간 정보 요청 처리
            // 기본적으로 서울 날씨 정보만 포함
            return await this.externalApiService.getRealTimeSummary('서울');
        } catch (error) {
            console.warn('Failed to process real-time info request:', error);
            return '';
        }
    }

    /**
     * 시스템 프롬프트를 생성합니다
     */
    private generateSystemPrompt(promptType: PromptType, codebaseContext: string, realTimeInfo: string, profileContext: string, intentContext: string): string {
        let systemPrompt = '';

        // DeepSeek 모델에 대한 특별한 언어 지시사항 추가
        const isDeepSeek = this.currentModelType === AiModelType.OLLAMA_DeepSeek;
        const languageInstruction = isDeepSeek ?
            '\n\n️중요: 반드시 한국어로만 답변하세요. 중국어, 영어, 일본어 등 다른 언어는 사용하지 마세요. 모든 설명과 응답은 한국어로 작성해주세요.' : '';

        if (promptType === PromptType.CODE_GENERATION) {
            systemPrompt = `당신은 전문적인 소프트웨어 개발자입니다. 사용자의 요청에 따라 코드를 생성하고 수정하는 작업을 수행합니다.

주요 지침:
1. 코드 생성 시 항상 완전하고 실행 가능한 코드를 제공하세요.
2. 코드 수정 시 기존 코드의 구조와 스타일을 유지하세요.
3. 파일 경로를 포함한 구체적인 수정 사항을 명시하세요.
4. 한글로 설명을 제공하세요.
5. 새 파일을 생성할 때는 반드시 "새 파일: [파일경로]" 형식으로 시작하고, 그 다음에 코드 블록을 포함하세요.
6. 기존 파일을 수정할 때는 반드시 "수정 파일: [파일경로]" 형식으로 시작하고, 그 다음에 수정된 코드 블록을 포함하세요.
7. 파일을 삭제할 때는 "삭제 파일: [파일경로]" 형식으로 명시하세요.
8. 마크다운 파일(.md)을 생성할 때는 코드 블록 없이 마크다운 내용을 직접 포함하세요.
9. 터미널 명령어가 필요한 경우 "bash" 코드 블록으로 제공하세요. 이 명령어들은 자동으로 실행됩니다.

파일 생성/수정 형식 예시:

코드 파일의 경우:
새 파일: src/components/Button.jsx
\`\`\`javascript
import React from 'react';

function Button({ children, onClick }) {
  return (
    <button onClick={onClick}>
      {children}
    </button>
  );
}

export default Button;
\`\`\`

마크다운 파일의 경우:
새 파일: docs/README.md

# 프로젝트 문서

이 프로젝트는 React 기반의 웹 애플리케이션입니다.

## 기능

- 사용자 인증
- 데이터 관리
- 실시간 업데이트

## 설치 방법

\`\`\`bash
npm install
npm start
\`\`\`

터미널 명령어의 경우:
\`\`\`bash
npm install
npm run build
npm start
\`\`\`

코드베이스 컨텍스트:
${codebaseContext}

프로젝트 프로필:
${profileContext}

사용자 의도:
${intentContext}

실시간 정보:
${realTimeInfo}

사용자의 요청에 따라 적절한 코드를 생성하거나 수정해주세요.${languageInstruction}`;
        } else {
            systemPrompt = `당신은 전문적인 소프트웨어 개발자이자 기술 전문가입니다. 사용자의 질문에 대해 정확하고 유용한 답변을 제공합니다.

주요 지침:
1. 기술적 질문에 대해 명확하고 이해하기 쉬운 답변을 제공하세요.
2. 코드 예제가 필요한 경우 완전하고 실행 가능한 코드를 제공하세요.
3. 한글로 답변하되, 필요한 경우 영어 용어나 코드는 그대로 사용하세요.
4. 실시간 정보가 있는 경우 이를 활용하여 답변하세요.
5. 파일 생성, 수정, 삭제 또는 터미널 명령어 실행은 하지 마세요. 이는 단순 질의 응답 모드입니다.
6. 첨부된 파일이 있는 경우 해당 파일의 내용을 분석하여 답변하세요.

코드베이스 컨텍스트:
${codebaseContext}

프로젝트 프로필:
${profileContext}

사용자 의도:
${intentContext}

실시간 정보:
${realTimeInfo}

사용자의 질문에 대해 전문적이고 유용한 답변을 제공해주세요.${languageInstruction}`;
        }

        return systemPrompt;
    }
}
