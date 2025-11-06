import * as vscode from 'vscode';
import { StorageService } from '../services/storage';
import { CodebaseContextService } from './codebaseContextService';
import { LlmKeywordSelectionService } from './llmKeywordSelectionService';
import { LlmResponseProcessor } from './llmResponseProcessor';
import { NotificationService } from '../services/notificationService';
import { ConfigurationService } from '../services/configurationService';
import { ExternalApiService } from './externalApiService';
import { safePostMessage } from '../webview/panelUtils';
import { GeminiApi } from './gemini';
import { OllamaApi } from './ollama';
import { checkTokenLimit, logTokenUsage, estimateTokens } from '../utils/tokenUtils';
import { AiModelType, PromptType } from './types';
import { ActionPlannerService, ActionPlan } from './actionPlannerService';
import { TerminalMonitorService } from './terminalMonitorService';
import { ActionExecutionEngine } from './actionExecutionEngine';
import { ProjectProfileService, ProjectProfile } from './projectProfileService';
import { IntentDetectionService, IntentDetectionResult } from './intentDetectionService';
import { PlanQueueService } from '../services/planQueueService';
import { GitRepositoryService } from '../services/gitRepositoryService';
import { GitBranchAnalysisService } from '../services/gitBranchAnalysisService';

export class LlmService {
    private storageService: StorageService;
    private geminiApi: GeminiApi;
    private ollamaApi: OllamaApi;
    private codebaseContextService: CodebaseContextService;
    private llmKeywordSelectionService: LlmKeywordSelectionService;
    private llmResponseProcessor: LlmResponseProcessor;
    private planQueueService?: PlanQueueService;
    private notificationService: NotificationService;
    private configurationService: ConfigurationService;
    private externalApiService: ExternalApiService;
    private currentCallController: AbortController | null = null;
    private currentModelType: AiModelType = AiModelType.GEMINI; // 기본값
    private currentPanel: vscode.WebviewPanel | null = null;

    // 액션 플래너 관련 서비스들
    private actionPlannerService: ActionPlannerService;
    private terminalMonitorService: TerminalMonitorService;
    private actionExecutionEngine: ActionExecutionEngine;

    // Git 리포지토리 서비스
    private gitRepositoryService: GitRepositoryService;
    private gitBranchAnalysisService: GitBranchAnalysisService;

    // 처리 단계 전송 함수
    private sendProcessingStep(step: string) {
        if (this.currentPanel) {
            safePostMessage(this.currentPanel.webview, { command: 'setProcessingStep', step });
        }
    }

    // 처리 상태 업데이트 함수
    private sendProcessingStatus(step: string, status: string) {
        if (this.currentPanel) {
            safePostMessage(this.currentPanel.webview, { command: 'updateProcessingStatus', step, status });
        }
    }
    private activePlans: Map<string, ActionPlan> = new Map();
    private projectProfileService?: ProjectProfileService;
    private projectProfile?: ProjectProfile;
    private intentDetectionService?: IntentDetectionService;
    private chatWebview?: vscode.Webview;
    private askWebview?: vscode.Webview;
    private lastErrorHandledAt: number = 0;
    private suppressCancelNoticeOnce: boolean = false;
    private userOS: string = 'unknown';
    // 전역 디버그 플래그 (필요 시 true로)
    private readonly debug: boolean = false;

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

        // Git 리포지토리 서비스 초기화
        this.gitRepositoryService = new GitRepositoryService(extensionContext!);
        this.gitBranchAnalysisService = new GitBranchAnalysisService(this.gitRepositoryService);

        // LLM 키워드 선택 서비스 초기화
        this.llmKeywordSelectionService = new LlmKeywordSelectionService(this);
        this.codebaseContextService.setLlmKeywordSelectionService(this.llmKeywordSelectionService);

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
            this.terminalMonitorService.setLlmService(this);
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

                    // 에러 처리를 최우선으로 하기 위해, 진행 중인 호출이 있다면 조용히 취소
                    try {
                        if (this.currentCallController) {
                            this.suppressCancelNoticeOnce = true;
                            this.cancelCurrentCall();
                        }
                    } catch { /* noop */ }

                    const pretty = this.formatErrorForChat(evt);
                    safePostMessage(target, { command: 'receiveMessage', sender: 'AIDEV-IDE', text: pretty });

                    const shortPrompt = `터미널 에러 해결: ${evt.message}`;
                    console.log('[LlmService] Auto error fix prompt:', shortPrompt);
                    console.log('[LlmService] Starting auto error correction...');
                    await this.handleUserMessageAndRespond(shortPrompt, target, PromptType.CODE_GENERATION);
                    console.log('[LlmService] Auto error correction completed');
                } catch (autoErr) {
                    console.warn('[LlmService] Auto error handling failed:', autoErr);
                }
            });
        } catch (e) {
            console.warn('[LlmService] Terminal monitor setup failed:', e);
        }
    }

    public setChatWebview(webview: vscode.Webview | undefined): void {
        this.chatWebview = webview;
        // 터미널 모니터링 서비스에도 웹뷰 설정
        if (webview) {
            this.terminalMonitorService.setWebview(webview);
        }
    }
    public setAskWebview(webview: vscode.Webview | undefined): void {
        this.askWebview = webview;
        // 터미널 모니터링 서비스에도 웹뷰 설정
        if (webview) {
            this.terminalMonitorService.setWebview(webview);
        }
    }
    public getTerminalMonitorService(): TerminalMonitorService { return this.terminalMonitorService; }

    /**
     * 사용자의 OS 정보를 설정합니다.
     */
    public setUserOS(os: string): void {
        this.userOS = os;
        // console.log(`[LlmService] 사용자 OS 설정: ${os}`);
    }

    /**
     * 현재 사용자의 OS 정보를 반환합니다.
     */
    public getUserOS(): string {
        return this.userOS;
    }

    /**
     * 프로젝트 파일 리스트를 분석합니다.
     * @param analysisPrompt 분석 프롬프트
     * @returns 분석 결과
     */
    public async analyzeProject(analysisPrompt: string): Promise<string> {
        try {
            console.log('[LlmService] 프로젝트 분석 시작');

            // 현재 런타임에 설정된 모델 타입으로 분기 (저장소 재조회 대신 즉시 반영)
            if (this.currentModelType === AiModelType.GEMINI) {
                return await this.geminiApi.sendMessage(analysisPrompt);
            } else {
                return await this.ollamaApi.sendMessage(analysisPrompt);
            }
        } catch (error) {
            console.error('[LlmService] 프로젝트 분석 중 오류:', error);
            throw error;
        }
    }

    /**
     * OS별 시스템 프롬프트를 생성합니다.
     * 모델 타입에 따라 최적화된 프롬프트를 제공합니다.
     */
    private generateOSSpecificSystemPrompt(): string {
        const commonGuidelines = this.getCommonGuidelines();
        const modelSpecificPrompt = this.getModelSpecificSystemPrompt();
        const osSpecificGuidelines = this.getOSSpecificGuidelines();

        return `${commonGuidelines}

${modelSpecificPrompt}

${osSpecificGuidelines}`;
    }

    /**
     * 모든 모델에 공통으로 적용되는 기본 지침
     */
    private getCommonGuidelines(): string {
        return `당신은 전문적인 소프트웨어 개발자입니다. 사용자의 요청에 따라 코드를 생성하고 수정하는 작업을 수행합니다.

기본 규칙:
- 완전하고 실행 가능한 코드 제공
- 기존 코드 구조와 스타일 유지
- 파일 경로 포함하여 구체적으로 명시
- 한글로 설명 제공

파일 작업 형식:
- 새 파일: "새 파일: [파일경로]" + 코드 블록
- 수정 파일: "수정 파일: [파일경로]" + 수정된 코드 블록
- 삭제 파일: "삭제 파일: [파일경로]"
- 마크다운(.md): 코드 블록 없이 마크다운 내용 직접 포함

프로젝트 특화:
- Vite: package.json에서 "vite" 대신 "npx vite" 사용
- Spring Boot: 3.4.0 이상 사용

**코드 작성 vs 쉘 스크립트 작업 구별 (절대 필수 - 최우선 규칙):**
- **code_work**: 소스 코드 파일(.js, .ts, .py, .java, .go, .rs 등) 생성/수정만 수행.
  - **절대로 쉘 스크립트(.sh, .bat, .ps1)를 생성하지 마세요.**
  - **절대로 터미널 명령어 코드 블록을 생성하지 마세요.**
  - **프로젝트 생성 작업**: pom.xml, package.json, build.gradle 등 프로젝트 구조 파일과 소스 코드 파일만 생성. 빌드/실행 명령은 생성하지 마세요.
- **execution_work**: 설치/빌드/배포/실행 스크립트(.sh, .bat, .ps1) 생성 또는 터미널 명령 실행만 수행. 소스 코드 생성 금지.
- **사용자 의도 컨텍스트의 taskType을 반드시 확인하고 그에 맞게 작업하세요.**

쉘 스크립트 규칙:
- 빌드/실행/테스트/배포 관련 작업일 때만 생성
- 일반 작업(파일 정리, 문서화 등)에는 생성하지 않음
- 스크립트 내 프로그래밍 코드는 언어명 callout 명시 (\`\`\`python, \`\`\`javascript 등)

환경: ${this.userOS.toUpperCase()}`;
    }

    /**
     * 모델 타입에 따른 특화 시스템 프롬프트
     */
    private getModelSpecificSystemPrompt(): string {
        switch (this.currentModelType) {
            case AiModelType.GEMINI:
                return this.getGeminiSystemPrompt();

            case AiModelType.OLLAMA_GPT_OSS:
                return this.getGPTOSSSystemPrompt();

            case AiModelType.OLLAMA_DeepSeek:
                return this.getDeepSeekSystemPrompt();

            case AiModelType.OLLAMA_Gemma:
                return this.getGemmaSystemPrompt();

            case AiModelType.OLLAMA_CodeLlama:
                return this.getCodeLlamaSystemPrompt();

            default:
                return this.getDefaultSystemPrompt();
        }
    }

    /**
     * Gemini 모델용 특화 프롬프트
     */
    private getGeminiSystemPrompt(): string {
        return `**Gemini 모델 특화 지침:**
- 표준 마크다운 형식 사용
- 코드 블록: \`\`\`언어 형식
- 파일 작업 시 명확한 구분자 사용
- 구조화된 응답 제공`;
    }

    /**
     * GPT-OSS 모델용 특화 프롬프트
     */
    private getGPTOSSSystemPrompt(): string {
        return `**GPT-OSS 모델 특화 지침:**
- 표준 마크다운 형식 준수
- 코드 블록: \`\`\`언어 형식으로 명시
- 파일 작업 시 명확한 구분자 사용
- GPT-OSS 출력 형식에 맞춰 응답
- 간결하고 명확한 응답 선호`;
    }

    /**
     * DeepSeek 모델용 특화 프롬프트
     */
    private getDeepSeekSystemPrompt(): string {
        return `**DeepSeek 모델 특화 지침:**
- 표준 마크다운 형식 사용
- 코드 블록: \`\`\`언어 형식
- 파일 작업 시 명확한 구분자 사용
- 반드시 한국어로만 답변 (중국어, 영어, 일본어 사용 금지)
- 간결하고 실용적인 응답 제공`;
    }

    /**
     * Gemma 모델용 특화 프롬프트
     */
    private getGemmaSystemPrompt(): string {
        return `**Gemma 모델 특화 지침:**
- 표준 마크다운 형식 사용
- 코드 블록: \`\`\`언어 형식
- 간결하고 명확한 응답
- 구조화된 형식 선호`;
    }

    /**
     * CodeLlama 모델용 특화 프롬프트
     */
    private getCodeLlamaSystemPrompt(): string {
        return `**CodeLlama 모델 특화 지침:**
- 코드 중심 응답 제공
- 표준 마크다운 형식 사용
- 코드 블록: \`\`\`언어 형식
- 코드 품질과 가독성 중시`;
    }

    /**
     * 기본 모델용 프롬프트 (기타 모델)
     */
    private getDefaultSystemPrompt(): string {
        return `**기본 지침:**
- 표준 마크다운 형식 사용
- 코드 블록: \`\`\`언어 형식
- 명확하고 구조화된 응답 제공`;
    }

    /**
     * TaskType을 한글 라벨로 변환합니다.
     */
    private getTaskTypeLabel(taskType: string): string {
        const labels: Record<string, string> = {
            'code_work': '코드작성',
            'execution_work': '설치/빌드/배포/실행',
            'analysis': '분석',
            'documentation': '문서화',
            'terminal': '터미널'
        };
        return labels[taskType] || taskType;
    }

    /**
     * OS별 특화 가이드라인을 반환합니다.
     */
    private getOSSpecificGuidelines(): string {
        switch (this.userOS.toLowerCase()) {
            case 'windows':
                return `**Windows 환경 특화 가이드라인:**
- PowerShell 또는 Command Prompt 명령어를 사용하세요.
- 파일 경로는 백슬래시(\\) 또는 슬래시(/) 모두 사용 가능합니다.
- 환경변수는 %VARIABLE_NAME% 형식을 사용하세요.
- 터미널 명령어는 \`\`\`cmd 또는 \`\`\`powershell 코드 블록을 사용하세요.
- 포트 해제: netstat -ano | findstr :포트번호, taskkill /PID 프로세스ID /F
- 프로세스 종료: taskkill /IM 프로세스명 /F
- 서비스 관리: net start/stop 서비스명
- 권한 문제 시 관리자 권한으로 실행하도록 안내하세요.`;

            case 'macos':
                return `**macOS 환경 특화 가이드라인:**
- Bash/Zsh 쉘 명령어를 사용하세요.
- 파일 경로는 슬래시(/)를 사용하세요.
- 환경변수는 $VARIABLE_NAME 형식을 사용하세요.
- 터미널 명령어는 \`\`\`bash 코드 블록을 사용하세요.
- 포트 해제: lsof -ti:포트번호 | xargs kill -9
- 프로세스 종료: pkill -f "프로세스명"
- Homebrew 패키지 관리자 사용을 권장하세요.
- 권한 문제 시 sudo 명령어 사용을 안내하세요.
- **중요: 쉘 스크립트 생성 조건 및 규칙:**
  - 쉘 스크립트는 **프로젝트 빌드, 실행, 테스트, 배포**와 직접 관련된 작업일 때만 생성하세요.
  - 프로젝트 빌드/실행과 무관한 작업에는 절대 쉘 스크립트를 생성하지 마세요.
  - 쉘 스크립트 내에 프로그래밍 언어 코드(Python, Node.js, Java 등)가 필요한 경우:
    * 반드시 해당 언어명 callout을 사용하세요 (예: \`\`\`python, \`\`\`javascript)
    * "새 파일: [파일경로]" 형식으로 파일 생성 가이드를 따르세요
  - 복잡한 bash 스크립트(함수 정의, 여러 줄 변수, if/for/while 루프 포함)는 반드시 .sh 파일로 생성하고, 생성 후 \`chmod +x 스크립트.sh && ./스크립트.sh\` 형식으로 실행하세요.
  - 단순한 한 줄 명령어만 코드 블록에 직접 작성하세요 (예: \`mvn clean package\`, \`npm install\` 등).`;

            case 'linux':
                return `**Linux 환경 특화 가이드라인:**
- Bash 쉘 명령어를 사용하세요.
- 파일 경로는 슬래시(/)를 사용하세요.
- 환경변수는 $VARIABLE_NAME 형식을 사용하세요.
- 터미널 명령어는 \`\`\`bash 코드 블록을 사용하세요.
- 포트 해제: lsof -ti:포트번호 | xargs kill -9 또는 fuser -k 포트번호/tcp
- 프로세스 종료: pkill -f "프로세스명" 또는 killall 프로세스명
- 패키지 관리자: apt (Ubuntu/Debian), yum/dnf (RHEL/CentOS), pacman (Arch)
- 권한 문제 시 sudo 명령어 사용을 안내하세요.
- **중요: 쉘 스크립트 생성 조건 및 규칙:**
  - 쉘 스크립트는 **프로젝트 빌드, 실행, 테스트, 배포**와 직접 관련된 작업일 때만 생성하세요.
  - 프로젝트 빌드/실행과 무관한 작업에는 절대 쉘 스크립트를 생성하지 마세요.
  - 쉘 스크립트 내에 프로그래밍 언어 코드(Python, Node.js, Java 등)가 필요한 경우:
    * 반드시 해당 언어명 callout을 사용하세요 (예: \`\`\`python, \`\`\`javascript)
    * "새 파일: [파일경로]" 형식으로 파일 생성 가이드를 따르세요
  - 복잡한 bash 스크립트(함수 정의, 여러 줄 변수, if/for/while 루프 포함)는 반드시 .sh 파일로 생성하고, 생성 후 \`chmod +x 스크립트.sh && ./스크립트.sh\` 형식으로 실행하세요.
  - 단순한 한 줄 명령어만 코드 블록에 직접 작성하세요 (예: \`mvn clean package\`, \`npm install\` 등).`;

            default:
                return `**일반 환경 가이드라인:**
- 플랫폼에 독립적인 명령어를 사용하세요.
- 파일 경로는 슬래시(/)를 사용하세요.
- 환경변수는 $VARIABLE_NAME 형식을 사용하세요.
- 터미널 명령어는 \`\`\`bash 코드 블록을 사용하세요.
- 포트 해제 및 프로세스 종료 명령어는 OS별로 다를 수 있으니 주의하세요.`;
        }
    }

    public setCurrentModel(modelType: AiModelType): void {
        this.currentModelType = modelType;
        if (this.debug) console.log(`[LlmService] Current model set to: ${modelType}`);
    }

    private formatErrorForChat(evt: { time: number; source: string; message: string; recentLogs: any[] }): string {
        const header = `터미널 에러 감지 (${new Date(evt.time).toLocaleString()}):\n소스: ${evt.source}\n메시지: ${evt.message}`;
        const tail = evt.recentLogs && evt.recentLogs.length > 0
            ? '\n\n최근 로그 (최대 10줄):\n' + evt.recentLogs.slice(-10).map((l: any) => `- ${l.message || l.rawOutput || ''}`).join('\n')
            : '';
        return header + tail;
    }

    /**
     * 20자 넘는 지시사항을 행위 단위로 분리합니다 (reasoning LLM 사용)
     */
    private async splitUserInstructionIntoActions(userQuery: string): Promise<string[]> {
        // 20자 이하인 경우 분리하지 않음
        if (userQuery.length <= 20) {
            return [userQuery];
        }

        const lang = (await this.configurationService.getLanguage?.()) || 'ko';
        const forceKorean = lang.toLowerCase().startsWith('ko');

        const splitPrompt = forceKorean
            ? `다음 사용자 지시사항을 행위 단위로 분리하세요. 각 행위는 독립적으로 실행 가능한 단위여야 합니다.

사용자 지시사항:
"""
${userQuery}
"""

요구사항:
- 각 행위를 하나의 문장으로 표현하세요.
- 행위는 동사로 시작하는 명확한 액션으로 작성하세요.
- 각 행위는 순서대로 번호를 매겨주세요.
- JSON 배열 형식으로 출력하세요.

출력 형식 (JSON):
{
  "actions": [
    "첫 번째 행위",
    "두 번째 행위",
    "세 번째 행위"
  ]
}`
            : `Split the following user instruction into action units. Each action should be independently executable.

User instruction:
"""
${userQuery}
"""

Requirements:
- Express each action as a single sentence.
- Actions should start with a verb and be clear actions.
- Number each action in order.
- Output in JSON array format.

Output format (JSON):
{
  "actions": [
    "First action",
    "Second action",
    "Third action"
  ]
}`;

        try {
            let reasoningModelName = '';
            try {
                reasoningModelName = (await this.storageService.getPlanningModel()) || (await this.storageService.getOllamaModel()) || '';
            } catch { }

            const parts = [{ text: splitPrompt }];
            const systemPromptForSplit = forceKorean
                ? '행위 단위로 지시사항을 분리하세요. JSON 형식으로 응답하세요.'
                : 'Split instructions into action units. Respond in JSON format.';

            let response: string;
            if (this.currentModelType === AiModelType.GEMINI) {
                response = await this.geminiApi.sendMessageWithSystemPrompt(systemPromptForSplit, parts, { signal: this.currentCallController?.signal });
            } else {
                try { await this.ollamaApi.loadSettingsFromStorage(); } catch { }
                response = await this.ollamaApi.sendMessageWithSystemPrompt(systemPromptForSplit, parts, { signal: this.currentCallController?.signal });
            }

            // JSON 파싱
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                if (parsed.actions && Array.isArray(parsed.actions) && parsed.actions.length > 0) {
                    console.log(`[LlmService] Split ${userQuery.length} chars into ${parsed.actions.length} actions`);
                    return parsed.actions;
                }
            }
        } catch (error) {
            console.warn('[LlmService] Failed to split user instruction:', error);
        }

        // 실패 시 원본 반환
        return [userQuery];
    }

    /**
     * 사용자 질의/키워드/환경을 입력으로 받아 계획 수립 프롬프트를 생성합니다.
     */
    private async buildPlanPrompt(userQuery: string, keywords: string[], os: string, modelName: string, includedFiles: { name: string, fullPath: string }[]): Promise<string> {
        const topFiles = includedFiles.slice(0, 8).map(f => `- ${f.name} (${f.fullPath})`).join('\n');
        const kw = keywords.join(', ');
        const lang = (await this.configurationService.getLanguage?.()) || 'ko';
        const forceKorean = lang.toLowerCase().startsWith('ko');
        const languageRule = forceKorean
            ? '\n- 모든 출력은 한국어로 작성하세요. 영어 표현이 필요한 식별자/코드는 그대로 두되 설명과 계획은 한국어로 작성하세요.'
            : '';
        return (
            `${forceKorean ? '당신은 시니어 소프트웨어 플래너입니다. 사용자의 요청을 실행 가능한 검증 가능한 계획으로 변환하세요.' : "You are a senior software planner. Convert the user's query into an actionable, verifiable plan."}

${forceKorean ? '사용자 요청:' : 'User query:'}
"""
${userQuery}
"""

Context:
- OS: ${os}
- Current model: ${modelName}
- Relevant files (${includedFiles.length}):
${topFiles || '- (none)'}
- Keywords: ${kw}

Requirements:
- ${forceKorean ? '**반드시 마크다운 체크박스 형식 "- [ ] 작업 내용"을 사용하세요.**' : '**MUST use markdown checkbox format "- [ ] task description".**'}
- ${forceKorean ? '올바른 형식: "- [ ] 작업 내용" 또는 "- [x] 완료된 작업"' : 'Correct format: "- [ ] task description" or "- [x] completed task"'}
- ${forceKorean ? '잘못된 형식: "- 작업", "- ✅ 작업", "1. 작업" 등은 사용하지 마세요.' : 'Wrong format: "- task", "- ✅ task", "1. task" etc. are not allowed.'}
- ${forceKorean ? '각 항목은 원자적이고 테스트 가능하며 논리 순서로 정렬하세요.' : 'Each item should be atomic, testable, and ordered logically.'}
- ${forceKorean ? '필요 전제조건과 리스크를 포함하세요.' : 'Capture any prerequisites and risks.'}
- ${forceKorean ? '이 코드베이스에 실용적으로 적용 가능하도록 작성하세요.' : 'Keep it pragmatic for this codebase.'}
- ${forceKorean ? '실행 가능한 코드 블록(```bash, ```sh 등)이나 터미널 명령어는 절대 포함하지 마세요.' : 'Do NOT include executable code blocks (```bash, ```sh, etc.) or terminal commands.'}
${languageRule}
`);
    }

    /**
     * 간단한 Markdown 체크박스/불릿 리스트를 PlanItem 입력 형태로 파싱
     * 최대 10개까지만 파싱하여 과도한 항목 수집 방지
     */
    private parsePlanToItems(planMarkdown: string): Array<{ title: string, detail?: string }> {
        const lines = planMarkdown.split('\n');
        const items: Array<{ title: string, detail?: string }> = [];
        let itemCount = 0;
        const maxItems = 10; // 최대 파싱 항목 수 제한

        for (const raw of lines) {
            if (itemCount >= maxItems) break;

            const line = raw.trim();
            if (!line) continue;

            // - [ ] Task 또는 - Task, * Task, 1. Task 등 폭넓게 수용
            const match = line.match(/^([-*]|\d+\.)\s*(\[\s*[xX]?\s*\]\s*)?(.*)$/);
            if (match) {
                const title = (match[3] || '').trim();
                if (title) {
                    // 제목이 너무 길면 100자로 제한
                    const trimmedTitle = title.length > 100 ? title.substring(0, 97) + '...' : title;
                    items.push({ title: trimmedTitle });
                    itemCount++;
                }
            }
        }
        return items;
    }

    /**
     * Plan 텍스트에서 체크박스 항목만 추출하여 작업 큐 아이템으로 변환
     * - [ ] 또는 - [x] 형식의 항목만 파싱
     */
    private parseCheckboxItemsFromPlan(planMarkdown: string): Array<{ title: string, detail?: string }> {
        const lines = planMarkdown.split('\n');
        const items: Array<{ title: string, detail?: string }> = [];
        let itemCount = 0;
        const maxItems = 20; // 최대 파싱 항목 수 제한 (모든 항목 표시를 위해 증가)

        console.log('[LlmService] parseCheckboxItemsFromPlan 시작, 총 라인 수:', lines.length);
        console.log('[LlmService] planText 샘플 (처음 500자):', planMarkdown.substring(0, 500));

        for (const raw of lines) {
            if (itemCount >= maxItems) break;

            const line = raw.trim();
            if (!line) continue;

            // 체크박스 형식 우선 파싱 (더 정확한 패턴부터 시도)
            // - [ ] Task
            // - [x] Task  
            // * [ ] Task
            // 숫자. [ ] Task
            // 들여쓰기 포함 형식

            // 가장 일반적인 형식: - [ ] 또는 - [x] (공백이 0개 이상)
            // 패턴: - [ ] 텍스트 또는 - [x] 텍스트
            const checkboxMatch1 = line.match(/^[-*]\s*\[\s*([xX]?)\s*\]\s*(.+)$/);
            if (checkboxMatch1) {
                const title = (checkboxMatch1[2] || '').trim();
                if (title && title.length > 0) {
                    const trimmedTitle = title.length > 100 ? title.substring(0, 97) + '...' : title;
                    items.push({ title: trimmedTitle });
                    itemCount++;
                    console.log(`[LlmService] 체크박스 항목 파싱 (패턴1): "${line.substring(0, 60)}" -> "${trimmedTitle.substring(0, 50)}..."`);
                    continue;
                }
            }

            // 이모지 체크박스 형식: - ✅ 또는 - ☑️
            const emojiCheckboxMatch = line.match(/^[-*]\s*[✅☑️✓]\s+(.+)$/);
            if (emojiCheckboxMatch) {
                const title = (emojiCheckboxMatch[1] || '').trim();
                if (title && title.length > 0) {
                    const trimmedTitle = title.length > 100 ? title.substring(0, 97) + '...' : title;
                    items.push({ title: trimmedTitle });
                    itemCount++;
                    console.log(`[LlmService] 이모지 체크박스 항목 파싱: "${line.substring(0, 60)}" -> "${trimmedTitle.substring(0, 50)}..."`);
                    continue;
                }
            }

            // 숫자로 시작하는 체크박스: 1. [ ] Task
            const checkboxMatch2 = line.match(/^\d+\.\s*\[\s*([xX]?)\s*\]\s+(.+)$/);
            if (checkboxMatch2) {
                const title = (checkboxMatch2[2] || '').trim();
                if (title && title.length > 0) {
                    const trimmedTitle = title.length > 100 ? title.substring(0, 97) + '...' : title;
                    items.push({ title: trimmedTitle });
                    itemCount++;
                    console.log(`[LlmService] 체크박스 항목 파싱 (패턴2): ${trimmedTitle.substring(0, 50)}...`);
                    continue;
                }
            }

            // 들여쓰기 포함:   - [ ] Task
            const checkboxMatch3 = line.match(/^\s+[-*]\s*\[\s*([xX]?)\s*\]\s+(.+)$/);
            if (checkboxMatch3) {
                const title = (checkboxMatch3[2] || '').trim();
                if (title && title.length > 0) {
                    const trimmedTitle = title.length > 100 ? title.substring(0, 97) + '...' : title;
                    items.push({ title: trimmedTitle });
                    itemCount++;
                    console.log(`[LlmService] 체크박스 항목 파싱 (패턴3): ${trimmedTitle.substring(0, 50)}...`);
                    continue;
                }
            }

            // 체크박스가 없는 경우 일반 불릿 포인트 파싱 (체크박스가 하나도 없을 때만)
            if (items.length === 0 && itemCount < maxItems) {
                // 일반 불릿 포인트: - Task 또는 * Task (단, [ ] 가 없는 경우만)
                if (!line.includes('[') || !line.includes(']')) {
                    const bulletMatch = line.match(/^[-*]\s+(.+)$/);
                    if (bulletMatch) {
                        const title = (bulletMatch[1] || '').trim();
                        if (title && title.length > 0 &&
                            !title.startsWith('**') &&
                            !title.startsWith('##') &&
                            !title.startsWith('[') &&
                            !title.match(/^\d+\./)) {
                            const trimmedTitle = title.length > 100 ? title.substring(0, 97) + '...' : title;
                            items.push({ title: trimmedTitle });
                            itemCount++;
                            console.log(`[LlmService] 불릿 포인트 항목 파싱: ${trimmedTitle.substring(0, 50)}...`);
                        }
                    }
                }
            }
        }

        console.log(`[LlmService] parseCheckboxItemsFromPlan 완료: ${items.length}개 항목 파싱`);
        if (items.length > 0) {
            console.log('[LlmService] 파싱된 모든 항목:', items.map((item, idx) => `${idx + 1}. ${item.title.substring(0, 60)}`));
        }
        return items;
    }

    /**
     * 작업 큐 아이템을 LLM에게 요약 요청하여 간결한 명령어 리스트로 변환
     */
    private async summarizePlanItemsForQueue(
        items: Array<{ title: string, detail?: string }>,
        abortSignal?: AbortSignal
    ): Promise<Array<{ title: string, detail?: string }> | null> {
        const lang = (await this.configurationService.getLanguage?.()) || 'ko';
        const forceKorean = lang.toLowerCase().startsWith('ko');

        const itemsText = items.map((item, idx) => `${idx + 1}. ${item.title}${item.detail ? ` - ${item.detail}` : ''}`).join('\n');

        const summaryPrompt = forceKorean
            ? `다음 작업 목록을 매우 간결하게 요약하세요.

**중요 요구사항:**
- 전체 요약을 정확히 100자 이하로 작성 (초과 금지)
- 최대 3개의 핵심 명령어만 출력
- 각 명령어는 30자 이내로 매우 간결하게
- 마크다운 불릿 포인트 형식으로만 출력
- 반복되는 내용은 제거하고 핵심만 추출

**출력 형식 (정확히 이 형식으로만):**
- 전체 요약 (100자 이하)
- 명령어 1 (30자 이내)
- 명령어 2 (30자 이내)
- 명령어 3 (30자 이내)

작업 목록:
${itemsText}

출력:`
            : `Summarize the following task list very concisely.

**Critical Requirements:**
- Write a summary in exactly 100 characters or less (no exceed)
- Output maximum 3 core commands only
- Each command should be very concise within 30 characters
- Output only in markdown bullet point format
- Remove repetitive content and extract only core points

**Output format (exactly this format only):**
- Overall summary (100 chars or less)
- Command 1 (30 chars or less)
- Command 2 (30 chars or less)
- Command 3 (30 chars or less)

Task list:
${itemsText}

Output:`;

        try {
            const parts = [{ text: summaryPrompt }];
            const systemPrompt = forceKorean
                ? '작업 목록을 간결한 명령어 리스트로 요약하세요. 100자 이하 요약과 최대 3개의 핵심 명령어만 출력하세요.'
                : 'Summarize task list into concise command list. Output summary under 100 chars and max 3 core commands.';

            let response: string;
            if (this.currentModelType === AiModelType.GEMINI) {
                response = await this.geminiApi.sendMessageWithSystemPrompt(systemPrompt, parts, { signal: abortSignal });
            } else {
                try { await this.ollamaApi.loadSettingsFromStorage(); } catch { }
                response = await this.ollamaApi.sendMessageWithSystemPrompt(systemPrompt, parts, { signal: abortSignal });
            }

            if (!response || !response.trim()) {
                return null;
            }

            // 응답에서 요약과 명령어 파싱
            const lines = response.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            const result: Array<{ title: string, detail?: string }> = [];

            // 첫 줄은 요약으로 사용
            let summaryLine = lines[0] || '';
            // 마크다운 불릿 제거
            summaryLine = summaryLine.replace(/^[-*]\s*/, '').trim();
            if (summaryLine && summaryLine.length <= 100) {
                result.push({ title: summaryLine });
            }

            // 나머지 줄에서 명령어 추출 (최대 3개)
            let commandCount = 0;
            for (const line of lines.slice(1)) {
                if (commandCount >= 3) break;
                const cleanLine = line.replace(/^[-*]\s*/, '').replace(/^\d+\.\s*/, '').trim();
                if (cleanLine && cleanLine.length <= 50) {
                    result.push({ title: cleanLine });
                    commandCount++;
                }
            }

            // 결과가 없으면 null 반환
            if (result.length === 0) {
                return null;
            }

            return result;
        } catch (error) {
            console.warn('[LlmService] 작업 큐 요약 실패:', error);
            return null;
        }
    }

    /**
     * 현재 설정된 모델의 실제 이름을 가져옵니다.
     * @returns 현재 모델명
     */
    private async getCurrentModelName(): Promise<string> {
        try {
            if (this.currentModelType === AiModelType.GEMINI) {
                return 'Gemini 2.5 Flash';
            }
            // Ollama 계열은 저장된 실제 모델명을 사용
            return await this.ollamaApi.getCurrentModelName();
        } catch (error) {
            console.warn(`[LlmService] 모델명 가져오기 실패: ${error}`);
            return this.currentModelType === AiModelType.GEMINI ? 'Gemini 2.5 Flash' : 'Unknown Model';
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
            // webviewToRespond를 currentPanel로 설정 (sendProcessingStep에서 사용)
            // webviewToRespond는 Webview이므로, 이를 WebviewPanel로 래핑
            this.currentPanel = { webview: webviewToRespond } as vscode.WebviewPanel;
            safePostMessage(webviewToRespond, { command: 'showLoading' });
            const currentModelNameForLog = await this.getCurrentModelName();
            console.log(`[LlmService] Using model: type=${this.currentModelType}, name=${currentModelNameForLog}`);
            try {
                const savedUi = await this.storageService.getAiModel();
                const savedRuntime = await this.storageService.getCurrentAiModel();
                console.log(`[LlmService] Saved models -> ui='${savedUi}', runtime='${savedRuntime}'`);
            } catch { }

            if (this.projectProfileService) {
                this.projectProfile = await this.projectProfileService.loadProfile();
            }

            // Systems 단계 표시: OS, 모델명, 프로젝트 루트
            try {
                const projectRootForStatus = await this.configurationService.getProjectRoot();
                this.sendProcessingStep('systems');
                this.sendProcessingStatus('systems', `OS: ${this.userOS} | Model: ${currentModelNameForLog} | Root: ${projectRootForStatus || '(not set)'}`);
            } catch (e) {
                console.warn('[LlmService] Failed to send systems status:', e);
            }

            let intentResult: IntentDetectionResult | undefined;
            if (this.intentDetectionService) {
                try {
                    this.sendProcessingStep('intent');
                    this.sendProcessingStatus('intent', `Analyzing user query: "${userQuery.substring(0, 50)}${userQuery.length > 50 ? '...' : ''}"`);

                    // 프로젝트 타입 감지 및 출력 (파일 기반 + LLM 기반)
                    let projectTypeInfo = '';
                    let detectedProjectType = 'unknown';

                    if (this.codebaseContextService) {
                        try {
                            const projectRoot = await this.configurationService.getProjectRoot();
                            if (projectRoot) {
                                // 1. LLM 기반 프로젝트 타입 감지 (질의어 분석 + 로컬 파일 시스템)
                                const projectTypeResult = await this.detectProjectTypeFromQuery(userQuery, projectRoot);
                                console.log(`[LlmService] LLM 기반 프로젝트 타입: ${projectTypeResult.projectType}, confidence: ${projectTypeResult.confidence}, needsUserSelection: ${projectTypeResult.needsUserSelection}`);

                                // 2. 사용자 선택이 필요한 경우
                                if (projectTypeResult.needsUserSelection || projectTypeResult.projectType === 'unknown') {
                                    // 웹뷰에 프로젝트 타입 선택 UI 표시
                                    safePostMessage(webviewToRespond, {
                                        command: 'showProjectTypeSelection',
                                        detectedType: projectTypeResult.projectType,
                                        confidence: projectTypeResult.confidence,
                                        supportedTypes: [
                                            { id: 'nodejs-npm', label: 'Node.js (npm)' },
                                            { id: 'python', label: 'Python' },
                                            { id: 'java-maven', label: 'Java (Maven)' },
                                            { id: 'java-gradle', label: 'Java (Gradle)' },
                                            { id: 'go', label: 'Go' },
                                            { id: 'android', label: 'Android' },
                                            { id: 'ios', label: 'iOS' }
                                        ]
                                    });
                                    this.sendProcessingStatus('intent', '프로젝트 타입 선택 필요 | OS: ' + this.userOS);
                                    // 사용자 선택을 기다리기 위해 임시로 unknown 설정
                                    detectedProjectType = 'unknown';
                                } else {
                                    // 프로젝트 타입이 확실한 경우
                                    detectedProjectType = projectTypeResult.projectType;
                                }

                                projectTypeInfo = ` | Project Type: ${detectedProjectType}`;
                                this.sendProcessingStatus('intent', `Detected project type: ${detectedProjectType} (confidence: ${projectTypeResult.confidence}) | OS: ${this.userOS}`);
                            }
                        } catch (error) {
                            console.warn('[LlmService] Failed to detect project type during intent analysis:', error);
                        }
                    }

                    intentResult = await this.intentDetectionService.detectIntent(userQuery);
                    console.log('[LlmService] Detected intent:', intentResult);
                    if (intentResult) {
                        const confidence = Math.round(intentResult.confidence * 100);
                        const reasoning = intentResult.reasoning || 'No reasoning provided';
                        const taskTypeLabel = this.getTaskTypeLabel(intentResult.taskType);
                        this.sendProcessingStatus('intent', `Intent: ${intentResult.category}/${intentResult.subtype} | TaskType: ${taskTypeLabel} (${confidence}%)${projectTypeInfo} | OS: ${this.userOS} - ${reasoning.substring(0, 100)}${reasoning.length > 100 ? '...' : ''}`);
                        // Debug Console 로그를 활용한 추가 정보
                        console.log(`[LlmService] Intent analysis result: ${intentResult.category}/${intentResult.subtype} | TaskType: ${intentResult.taskType} with ${confidence}% confidence${projectTypeInfo} | OS: ${this.userOS}`);
                    } else {
                        this.sendProcessingStatus('intent', `Intent analysis completed - No specific intent detected${projectTypeInfo}`);
                        console.log('[LlmService] No specific intent detected from user query');
                    }
                } catch (error) {
                    console.warn('[LlmService] Intent detection failed:', error);
                    this.sendProcessingStatus('intent', 'Intent analysis failed, using default behavior');
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

            // 터미널 관련 의도인 경우 터미널 로그를 context에 추가
            let terminalLogsContext = '';
            if (intentResult && intentResult.category === 'terminal' && intentResult.subtype === 'terminal_error_fix') {
                console.log('[LlmService] 터미널 오류 수정 의도 감지, 터미널 로그 수집 중...');
                const terminalLogs = this.terminalMonitorService.getTerminalLogsAsText(30); // 최근 30개 로그
                if (terminalLogs.trim()) {
                    terminalLogsContext = `--- 최근 터미널 로그 ---\n${terminalLogs}\n\n`;
                    console.log(`[LlmService] 터미널 로그 ${terminalLogs.split('\n').length}개를 context에 추가`);
                } else {
                    console.log('[LlmService] 터미널 로그가 없음');
                }
            }

            // 브랜치 분석 의도 처리
            if (intentResult && intentResult.category === 'analysis' && intentResult.subtype === 'analysis_branch') {
                console.log('[LlmService] 브랜치 분석 의도 감지, 브랜치 분석 시작...');
                try {
                    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                    if (workspaceFolder) {
                        const branchAnalysisReport = await this.analyzeBranchIssues(workspaceFolder.uri.fsPath);
                        // 브랜치 분석 결과를 직접 반환
                        this.sendProcessingStatus('analyzing', '브랜치 분석 완료');
                        this.sendProcessingStep('printing');
                        this.sendProcessingStatus('printing', '브랜치 분석 보고서 생성 중...');

                        // 웹뷰에 결과 전송
                        if (webviewToRespond) {
                            safePostMessage(webviewToRespond, {
                                command: 'displayUserMessage',
                                message: userQuery,
                                timestamp: new Date().toISOString()
                            });

                            safePostMessage(webviewToRespond, {
                                command: 'displayAiMessage',
                                message: branchAnalysisReport,
                                timestamp: new Date().toISOString()
                            });
                        }

                        this.sendProcessingStatus('printing', '브랜치 분석 보고서 완료');
                        this.sendProcessingStep('completed');
                        return;
                    } else {
                        console.log('[LlmService] 워크스페이스 폴더를 찾을 수 없습니다.');
                    }
                } catch (error) {
                    console.error('[LlmService] 브랜치 분석 실패:', error);
                }
            }

            // 코드베이스 컨텍스트 수집
            let fileContentsContext = '';
            let includedFilesForContext: { name: string, fullPath: string }[] = [];

            // 의도 분석 결과 확인 - 코드 관련 질문일 때만 파일 컨텍스트 수집
            const isCodeRelated = intentResult && this.isCodeRelatedIntent(intentResult);

            if (isCodeRelated) {
                if (promptType === PromptType.CODE_GENERATION) {
                    // CODE 탭: 코드 관련 질문인 경우에만 파일 컨텍스트 수집
                    this.sendProcessingStep('keywords');
                    this.sendProcessingStatus('keywords', `Extracting keywords from query: "${userQuery.substring(0, 30)}${userQuery.length > 30 ? '...' : ''}"`);

                    // 새로운 프로젝트 분석 로직 사용
                    const projectAnalysisResult = await this.codebaseContextService.getProjectFileListForAnalysis(userQuery, abortSignal);

                    let relevantContextResult: any = null;

                    if (projectAnalysisResult.analysisResult) {
                        const analysis = projectAnalysisResult.analysisResult;
                        console.log(`[LlmService] 프로젝트 분석 결과:`, analysis);

                        // 프로그래밍 관련이 아닌 경우 파일 컨텍스트 제외
                        if (analysis.programmingRelated === 'GENERAL') {
                            console.log(`[LlmService] 프로그래밍 관련이 아니므로 파일 컨텍스트 제외`);
                            fileContentsContext = "";
                            includedFilesForContext = [];
                            // ensure non-null structure to avoid downstream null access
                            relevantContextResult = { fileContentsContext: '', includedFilesForContext: [], extractedKeywords: [], selectedKeywords: { keywords: [], reasoning: '', confidence: 0 } };
                        } else {
                            // 기존 키워드 기반 파일 컨텍스트 수집
                            relevantContextResult = await this.codebaseContextService.getRelevantFilesContext(userQuery, abortSignal, history, intentResult);
                            fileContentsContext = relevantContextResult?.fileContentsContext || '';
                            includedFilesForContext = Array.isArray(relevantContextResult?.includedFilesForContext) ? relevantContextResult.includedFilesForContext : [];
                        }
                    } else {
                        // 분석 실패 시 기존 로직 사용
                        relevantContextResult = await this.codebaseContextService.getRelevantFilesContext(userQuery, abortSignal, history, intentResult);
                        fileContentsContext = relevantContextResult?.fileContentsContext || '';
                        includedFilesForContext = Array.isArray(relevantContextResult?.includedFilesForContext) ? relevantContextResult.includedFilesForContext : [];
                    }

                    // normalize structure to guard against nulls
                    if (!relevantContextResult || typeof relevantContextResult !== 'object') {
                        relevantContextResult = { fileContentsContext: fileContentsContext || '', includedFilesForContext: includedFilesForContext || [], extractedKeywords: [], selectedKeywords: { keywords: [], reasoning: '', confidence: 0 } };
                    } else {
                        if (!Array.isArray(relevantContextResult.extractedKeywords)) relevantContextResult.extractedKeywords = [];
                        if (!relevantContextResult.selectedKeywords) relevantContextResult.selectedKeywords = { keywords: [], reasoning: '', confidence: 0 };
                    }

                    if (relevantContextResult && relevantContextResult.selectedKeywords) {
                        const keywordsStr = relevantContextResult.selectedKeywords.keywords.join(', ');
                        const confidence = (relevantContextResult.selectedKeywords.confidence * 100).toFixed(1);
                        const fileNames = includedFilesForContext.slice(0, 3).map(f => f.name).join(', ');
                        const moreFiles = includedFilesForContext.length > 3 ? ` (+${includedFilesForContext.length - 3} more)` : '';

                        this.sendProcessingStatus('keywords', `LLM 선택: ${keywordsStr} (${confidence}%) → ${includedFilesForContext.length} files: ${fileNames}${moreFiles}`);
                        console.log(`[LlmService] LLM selected keywords: ${keywordsStr} (confidence: ${confidence}%, reasoning: ${relevantContextResult.selectedKeywords.reasoning})`);
                        console.log(`[LlmService] Found ${includedFilesForContext.length} relevant files: ${includedFilesForContext.map(f => f.name).join(', ')}`);

                        // --- Plan 단계: 키워드/컨텍스트를 기반으로 To-Do 생성 ---
                        try {
                            this.sendProcessingStep('plan');
                            // 계획 생성 시작: reasoning 모델명과 작업 요약 안내
                            let reasoningModelNameForPlan = '';
                            try { reasoningModelNameForPlan = (await this.storageService.getPlanningModel()) || (await this.storageService.getOllamaModel()) || ''; } catch { }
                            this.sendProcessingStatus('plan', `Reasoning 모델: ${reasoningModelNameForPlan || '(미설정)'} - 계획 생성 시작`);

                            const planPrompt = await this.buildPlanPrompt(userQuery, relevantContextResult.selectedKeywords.keywords, this.userOS, await this.getCurrentModelName(), includedFilesForContext);
                            const parts = [{ text: planPrompt }];
                            const lang = (await this.configurationService.getLanguage?.()) || 'ko';
                            const forceKorean = lang.toLowerCase().startsWith('ko');
                            const systemPromptForPlan = forceKorean
                                ? '**매우 중요: 반드시 체크박스 형식으로 출력하세요.**\n\n' +
                                '계획을 작성할 때는 반드시 마크다운 체크박스 형식 "- [ ] 작업 내용"을 사용하세요.\n' +
                                '- 올바른 형식: "- [ ] 작업 내용" 또는 "- [x] 완료된 작업"\n' +
                                '- 잘못된 형식: "- 작업 내용", "- ✅ 작업", "1. 작업" 등\n\n' +
                                '출력 규칙:\n' +
                                '1. 반드시 "- [ ]" 형식의 체크박스를 사용하세요 (대시, 공백, 대괄호, 공백 순서)\n' +
                                '2. 각 작업 항목은 "- [ ] 작업 설명" 형식으로 작성하세요\n' +
                                '3. 실행 가능한 코드 블록은 절대 포함하지 마세요\n' +
                                '4. 터미널 명령어나 코드 블록은 포함하지 마세요\n' +
                                '5. 한글로 출력하세요\n' +
                                '6. 간결하고 명확한 작업 설명만 제공하세요\n\n' +
                                '예시:\n' +
                                '- [ ] 전제조건 확인\n' +
                                '- [ ] 프로젝트 빌드\n' +
                                '- [ ] 테스트 실행\n' +
                                '- [ ] 결과 검증'
                                : '**CRITICAL: You MUST output in checkbox format.**\n\n' +
                                'When writing a plan, you MUST use markdown checkbox format "- [ ] task description".\n' +
                                '- Correct format: "- [ ] task description" or "- [x] completed task"\n' +
                                '- Wrong format: "- task", "- ✅ task", "1. task", etc.\n\n' +
                                'Output rules:\n' +
                                '1. MUST use "- [ ]" checkbox format (dash, space, brackets, space)\n' +
                                '2. Each task item must be written as "- [ ] task description"\n' +
                                '3. Do NOT include executable code blocks\n' +
                                '4. Do NOT include terminal commands or code blocks\n' +
                                '5. Provide only concise and clear task descriptions\n\n' +
                                'Example:\n' +
                                '- [ ] Check prerequisites\n' +
                                '- [ ] Build project\n' +
                                '- [ ] Run tests\n' +
                                '- [ ] Verify results';
                            let planText: string | null = null;
                            if (this.currentModelType === AiModelType.GEMINI) {
                                planText = await this.geminiApi.sendMessageWithSystemPrompt(systemPromptForPlan, parts, { signal: abortSignal });
                            } else {
                                try { await this.ollamaApi.loadSettingsFromStorage(); } catch { }
                                planText = await this.ollamaApi.sendMessageWithSystemPrompt(systemPromptForPlan, parts, { signal: abortSignal });
                            }
                            const stripTerminalBlocks = (text: string): string => {
                                if (!text) return text;
                                // Remove fenced code blocks entirely (generic and shell types)
                                const fenceAny = /```[a-zA-Z0-9_-]*\s*[\s\S]*?```/g;
                                let cleaned = text.replace(fenceAny, (m) => {
                                    // Preserve a placeholder note once if needed
                                    return '';
                                });
                                // Also remove inline backtick code that looks like commands (heuristic)
                                cleaned = cleaned.replace(/`[^`\n]*?(?:\bpython\b|\bnpm\b|\bnode\b|\\|\/)\S*?`/g, (m) => m.replace(/`/g, ''));
                                // Collapse excessive blank lines
                                cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();
                                return cleaned;
                            };

                            if (planText && planText.trim()) {
                                // 요약: 첫 줄 또는 첫 항목으로 간단 요약 표시
                                const firstLine = planText.split('\n').find(l => l.trim().length > 0)?.trim() || '';
                                const summary = firstLine.length > 80 ? (firstLine.slice(0, 80) + '...') : firstLine;
                                this.sendProcessingStatus('plan', `Reasoning 모델: ${reasoningModelNameForPlan || '(미설정)'} - ${summary || 'Plan ready.'}`);
                                // 챗 패널에 plan 출력하지 않음 (작업 큐에만 표시)

                                // 큐에 추가할 아이템 준비 - 체크박스 항목만 파싱 (원본 planText 사용)
                                console.log('[LlmService] planText 파싱 시작, planText 길이:', planText.length);
                                let itemsToEnqueue: Array<{ title: string, detail?: string }> = this.parseCheckboxItemsFromPlan(planText);
                                console.log('[LlmService] 파싱된 항목 수:', itemsToEnqueue.length);
                                console.log('[LlmService] 파싱된 항목:', itemsToEnqueue.map(i => i.title.substring(0, 30)));

                                // 각 항목의 길이를 50자로 제한 (모든 항목 표시)
                                itemsToEnqueue = itemsToEnqueue.map(item => ({
                                    title: item.title.length > 50 ? item.title.substring(0, 47) + '...' : item.title,
                                    detail: item.detail
                                }));

                                console.log('[LlmService] 최종 큐에 추가할 항목:', itemsToEnqueue.length, '개');

                                // 큐에 추가
                                try {
                                    if (!this.planQueueService && this.extensionContext) {
                                        this.planQueueService = new PlanQueueService(this.extensionContext);
                                    }
                                    if (this.planQueueService && itemsToEnqueue.length > 0) {
                                        // 다중 큐: 기존 큐들과 매칭 시도, 없으면 새 큐 생성
                                        const queueTitle = (userQuery || '새 작업 큐').split('\n')[0].slice(0, 60);
                                        const activeQueueId = this.planQueueService.getActiveQueueId();
                                        // 사용자가 명시적으로 "계속/이어서"를 말한 경우에만 활성 큐에 추가
                                        const continueRegex = /(계속|이어서|이어|이전\s*작업|continue|keep\s+going)/i;
                                        const isContinue = continueRegex.test(userQuery || '');
                                        let queueId: string;
                                        if (isContinue && activeQueueId) {
                                            queueId = activeQueueId;
                                            console.log('[LlmService] 사용자 요청에 따라 활성 큐에 이어서 추가:', queueId);
                                            this.planQueueService.enqueueTo(queueId, itemsToEnqueue, 'pending');
                                        } else {
                                            queueId = this.planQueueService.createQueue(queueTitle, itemsToEnqueue, 'pending');
                                            console.log('[LlmService] 새 작업 큐 생성:', queueId, queueTitle);
                                        }
                                        this.planQueueService.setActiveQueue(queueId);
                                        this.sendProcessingStatus('plan', `Queued ${itemsToEnqueue.length} to-do items. (queue ${queueId})`);

                                        // 웹뷰에 해당 큐 업데이트 전송 (queueId 포함)
                                        const queueItems = this.planQueueService.getQueue(queueId);
                                        safePostMessage(webviewToRespond, {
                                            command: 'updateTaskQueue',
                                            queueId,
                                            title: queueTitle,
                                            items: queueItems
                                        });
                                        console.log('[LlmService] updateTaskQueue 메시지 전송 완료 (queueId=', queueId, ')');

                                        // TerminalManager 설정은 ChatViewProvider에서 초기화되므로 여기서는 생략
                                        // 활성 실행 큐 식별은 TerminalManager가 잠금 상태에 따라 처리
                                        console.log('[LlmService] 작업 큐 준비 완료 (queueId=', queueId, ')');
                                    } else {
                                        console.warn('[LlmService] 큐에 추가할 항목이 없거나 planQueueService가 없음:', {
                                            itemsCount: itemsToEnqueue.length,
                                            hasService: !!this.planQueueService,
                                            hasContext: !!this.extensionContext
                                        });
                                    }
                                } catch (e) {
                                    console.error('[LlmService] Failed to enqueue plan items:', e);
                                }
                            } else {
                                this.sendProcessingStatus('plan', 'Plan generation returned empty content.');
                            }
                        } catch (planErr) {
                            console.warn('[LlmService] Plan generation failed:', planErr);
                            this.sendProcessingStatus('plan', 'Plan generation failed.');
                        }
                    } else if (relevantContextResult.extractedKeywords && relevantContextResult.extractedKeywords.length > 0) {
                        const extracted = Array.isArray((relevantContextResult as any)?.extractedKeywords) ? (relevantContextResult as any).extractedKeywords as string[] : [];
                        if (extracted.length > 0) {
                            const keywordsStr = extracted.slice(0, 5).join(', ');
                            const moreKeywords = extracted.length > 5 ? ` (+${extracted.length - 5} more)` : '';
                            this.sendProcessingStatus('keywords', `Keywords: ${keywordsStr}${moreKeywords} → Found ${includedFilesForContext.length} files (${fileContentsContext.length.toLocaleString()} chars)`);
                            console.log(`[LlmService] Extracted ${extracted.length} keywords: ${extracted.join(', ')}`);
                            console.log(`[LlmService] Found ${includedFilesForContext.length} relevant files with ${fileContentsContext.length.toLocaleString()} characters of context`);
                        } else {
                            this.sendProcessingStatus('keywords', `No specific keywords found → Found ${includedFilesForContext.length} files (${fileContentsContext.length.toLocaleString()} chars)`);
                            console.log(`[LlmService] No keywords extracted, but found ${includedFilesForContext.length} files with ${fileContentsContext.length.toLocaleString()} characters of context`);
                        }
                    } else {
                        this.sendProcessingStatus('keywords', `No specific keywords found → Found ${includedFilesForContext.length} files (${fileContentsContext.length.toLocaleString()} chars)`);
                        console.log(`[LlmService] No keywords extracted, but found ${includedFilesForContext.length} files with ${fileContentsContext.length.toLocaleString()} characters of context`);
                    }
                } else if (promptType === PromptType.GENERAL_ASK) {
                    // ASK 탭: 코드 관련 질문인 경우에만 파일 컨텍스트 수집
                    this.sendProcessingStep('keywords');
                    this.sendProcessingStatus('keywords', 'Extracting keywords from query...');
                    let relevantContextResult = await this.codebaseContextService.getRelevantFilesContext(userQuery, abortSignal, history, intentResult);
                    if (!relevantContextResult) {
                        console.warn('[LlmService] getRelevantFilesContext returned null. Using default.');
                        relevantContextResult = { fileContentsContext: '', includedFilesForContext: [], extractedKeywords: [], selectedKeywords: { keywords: [], reasoning: '', confidence: 0 } } as any;
                    }
                    fileContentsContext = relevantContextResult.fileContentsContext || '';
                    includedFilesForContext = Array.isArray(relevantContextResult.includedFilesForContext) ? relevantContextResult.includedFilesForContext : [];

                    {
                        const extracted = Array.isArray((relevantContextResult as any)?.extractedKeywords) ? (relevantContextResult as any).extractedKeywords as string[] : [];
                        if (extracted.length > 0) {
                            const keywordsStr = extracted.slice(0, 5).join(', ');
                            const moreKeywords = extracted.length > 5 ? ` (+${extracted.length - 5} more)` : '';
                            this.sendProcessingStatus('keywords', `Keywords: ${keywordsStr}${moreKeywords} → Found ${includedFilesForContext.length} files`);
                        } else {
                            this.sendProcessingStatus('keywords', `No specific keywords found → Found ${includedFilesForContext.length} files`);
                        }
                    }
                }
            } else {
                // 코드 관련 질문이 아닌 경우 파일 컨텍스트 수집하지 않음
                console.log(`[LlmService] 코드 관련 질문이 아니므로 파일 컨텍스트 제외. 의도: ${intentResult?.category}/${intentResult?.subtype}`);
                this.sendProcessingStatus('keywords', 'Non-code related question - skipping file context collection');
            }

            // 선택된 파일들의 내용을 읽어서 컨텍스트에 추가
            let selectedFilesContext = "";
            if (selectedFiles && selectedFiles.length > 0) {
                this.sendProcessingStep('analyzing');
                this.sendProcessingStatus('analyzing', `Reading ${selectedFiles.length} selected files...`);
                for (let i = 0; i < selectedFiles.length; i++) {
                    const filePath = selectedFiles[i];
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

                        // 진행 상황 업데이트
                        this.sendProcessingStatus('analyzing', `Reading file ${i + 1}/${selectedFiles.length}: ${fileName} (${content.length.toLocaleString()} chars)`);
                        // Debug Console 로그를 활용한 추가 정보
                        console.log(`[LlmService] Reading selected file ${i + 1}/${selectedFiles.length}: ${fileName} (${content.length.toLocaleString()} characters)`);
                    } catch (error) {
                        console.error(`Error reading selected file ${filePath}:`, error);
                        selectedFilesContext += `파일명: ${filePath.split(/[/\\]/).pop() || 'Unknown'}\n경로: ${filePath}\n오류: 파일을 읽을 수 없습니다.\n\n`;
                    }
                }
            } else if (includedFilesForContext.length > 0) {
                // 자동으로 찾은 파일들 표시
                this.sendProcessingStep('analyzing');
                const fileNames = includedFilesForContext.slice(0, 5).map(f => f.name).join(', ');
                const moreFiles = includedFilesForContext.length > 5 ? ` (+${includedFilesForContext.length - 5} more)` : '';
                this.sendProcessingStatus('analyzing', `Analyzing ${includedFilesForContext.length} files: ${fileNames}${moreFiles}`);
                // Debug Console 로그를 활용한 추가 정보
                console.log(`[LlmService] Analyzing ${includedFilesForContext.length} automatically found files: ${includedFilesForContext.map(f => f.name).join(', ')}`);
            }

            // 선택된 파일 컨텍스트와 터미널 로그를 기존 컨텍스트에 추가
            let fullFileContentsContext = fileContentsContext;

            if (selectedFilesContext) {
                fullFileContentsContext += `\n--- 사용자가 선택한 추가 파일들 ---\n${selectedFilesContext}`;
            }

            if (terminalLogsContext) {
                fullFileContentsContext += `\n${terminalLogsContext}`;
            }

            // 프로젝트 인벤토리(파일/디렉터리 스냅샷) 추가: 새로 생성된 항목도 항상 포함됨
            try {
                const inventory = await this.buildProjectInventorySection();
                if (inventory) {
                    fullFileContentsContext += `\n${inventory}`;
                }
            } catch { /* ignore inventory errors */ }

            // 프로젝트 타입 감지
            let detectedProjectType = '';
            if (this.codebaseContextService) {
                try {
                    const projectRoot = await this.configurationService.getProjectRoot();
                    if (projectRoot) {
                        detectedProjectType = await this.codebaseContextService.detectProjectType([projectRoot]);
                        console.log(`[LlmService] 감지된 프로젝트 타입: ${detectedProjectType}`);
                    }
                } catch (error) {
                    console.warn('[LlmService] Failed to detect project type:', error);
                }
            }

            // 시스템 프롬프트 생성
            const profileContext = this.projectProfile ? this.buildProfileContext(this.projectProfile, detectedProjectType) : '';
            const intentContext = intentResult ? this.buildIntentContext(intentResult) : '';

            const systemPrompt = await this.generateSystemPrompt(promptType, fullFileContentsContext, realTimeInfo, profileContext, intentContext);

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

            this.sendProcessingStep('assembling');
            const totalContextLength = systemPrompt.length + userParts.reduce((sum, part) => sum + (part.text?.length || 0), 0);
            const estimatedTokens = estimateTokens(systemPrompt + userParts.map(part => part.text || '').join(''));
            this.sendProcessingStatus('assembling', `Generating with ${currentModelNameForLog} (${totalContextLength.toLocaleString()} chars, ~${estimatedTokens.toLocaleString()} tokens)...`);
            // Debug Console 로그를 활용한 추가 정보
            console.log(`[LlmService] Assembling response with ${currentModelNameForLog}: ${totalContextLength.toLocaleString()} characters (~${estimatedTokens.toLocaleString()} tokens)`);
            console.log(`[LlmService] System prompt length: ${systemPrompt.length.toLocaleString()} chars, User parts: ${userParts.length} parts`);
            if (this.currentModelType === AiModelType.GEMINI) {
                const requestOptions = { signal: abortSignal };
                llmResponse = await this.geminiApi.sendMessageWithSystemPrompt(
                    systemPrompt,
                    userParts,
                    requestOptions
                );

                // Offline fallback trigger
                if (typeof llmResponse === 'string' && llmResponse.startsWith('OFFLINE:')) {
                    try {
                        this.sendProcessingStatus('assembling', 'Network unavailable. Falling back to local model (Ollama)...');
                    } catch { }
                    // Attempt fallback to Ollama if configured
                    try { await this.ollamaApi.loadSettingsFromStorage(); } catch { }
                    const requestOptions2 = { signal: abortSignal };
                    llmResponse = await this.ollamaApi.sendMessageWithSystemPrompt(
                        systemPrompt,
                        userParts,
                        requestOptions2
                    );
                }
            } else if (
                this.currentModelType === AiModelType.OLLAMA_Gemma ||
                this.currentModelType === AiModelType.OLLAMA_DeepSeek ||
                this.currentModelType === AiModelType.OLLAMA_CodeLlama ||
                this.currentModelType === AiModelType.OLLAMA_GPT_OSS
            ) {
                // Ollama 호출 전에 최신 설정을 스토리지에서 로드하여 원격 설정이 즉시 반영되도록 함
                try { await this.ollamaApi.loadSettingsFromStorage(); } catch { }
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
            // 필요 시 명령어만 재구성 단계 실행 (간단한 정규식으로 감지)
            try {
                if (llmResponse && (/```\s*(bash|sh)\s*[\s\S]*?```/i.test(llmResponse) || /```\s*(powershell|ps1|pwsh)\s*[\s\S]*?```/i.test(llmResponse))) {
                    this.sendProcessingStep('executing');
                    this.sendProcessingStatus('executing', 'Generating OS-specific runnable commands...');
                    const isVenvTask = /venv|가상환경|virtual\s*env|virtualenv/i.test(userQuery || '');
                    const baseGuide = `당신은 전문적인 셸 명령어 변환기입니다.\n\n현재 사용자 OS: ${this.userOS}\n\n출력 규칙(아주 엄격):\n1) 오직 하나의 코드블록만 출력하세요. 설명/주석/말머리/말미 금지.\n2) OS별로 정확한 셸을 사용하세요:\n   - Windows: \`\`\`powershell ...\`\`\` (cmd 아님, bash 아님)\n   - macOS/Linux: \`\`\`bash ...\`\`\` (powershell 아님)\n3) 서로 다른 OS의 명령을 혼합 금지. 현재 OS에 부적합한 명령은 동등한 대안으로 변환하세요.\n   - 패키지 관리자 예: Windows(winget/choco), macOS(brew), Linux(apt/yum 등)\n   - 경로/환경변수 표기: Windows(\\, $Env:VAR), macOS/Linux(/, $VAR)\n4) 실행 순서 고려(의존 명령 선행).\n5) 파일은 이미 생성/수정되었다고 가정하고 필요한 설치/실행 명령만.\n6) cd 명령 절대 사용 금지. 현재 작업 디렉토리를 기준으로만 작업.\n7) 불완전한 제어구문 금지. if/then/fi는 항상 완결형. 한 줄 if는 ; 로 닫고 PS2 프롬프트 유발 금지.\n8) 비정상 종료 금지. exit 1, set -e 등 사용 금지. 실패 안내는 echo/Write-Output으로만.\n9) 불필요한 빈 줄과 중복 echo 출력 금지.\n10) 반드시 해당 OS용 코드블록 언어 태그만 사용.`;
                    const venvGuide = this.userOS === 'Windows'
                        ? `\n\n[파이썬 가상환경(Windows 전용) 지침]\n- 가상환경 이름: 기본 .venv, $Env:VENV_NAME 가 있으면 그 값을 사용합니다.\n- 존재하면 재생성하지 말고 안내만 출력(idempotent).\n- python 또는 py 유무를 Get-Command로 확인하고 없으면 winget/choco 설치 안내는 Write-Output으로만 표시(강제 설치 금지).\n- 생성: python -m venv $venv\n- 활성화: & \"$venv\\Scripts\\Activate.ps1\"\n- 활성화 검증: $Env:VIRTUAL_ENV를 우선 확인하고 (Get-Command python).Path를 보조로 출력.\n- 불완전 if/블록 금지. 한 줄 if는 ; 로 닫습니다.\n- 실패(exit 1) 같은 비정상 종료 명령은 금지.\n- cd, 빈 echo, 중복 echo 출력 금지.`
                        : `\n\n[파이썬 가상환경(macOS/Linux 전용) 지침]\n- 가상환경 이름: 기본 .venv, $VENV_NAME 가 있으면 그 값을 사용합니다.\n- 존재하면 재생성하지 말고 안내만 출력(idempotent).\n- python3 유무 확인은 command -v python3로. 없으면 macOS(brew install python) 또는 Linux(apt install python3) 안내를 echo로만 표시(강제 설치 금지).\n- 생성: python3 -m venv \"$VENV_DIR\"\n- 활성화: . \"$VENV_DIR/bin/activate\"\n- 활성화 검증: [ -n \"$VIRTUAL_ENV\" ]를 우선 확인하고, 보조로 which python 또는 python -V를 간결히 출력. which python 단독으로 활성화 여부를 판단하지 말 것.\n- 모든 변수/경로는 인용부호로 감싸고, if/then/fi는 항상 완결형으로 작성(PS2 프롬프트 유발 금지).\n- 실패(exit 1) 같은 비정상 종료 명령은 금지.\n- cd, 빈 echo, 중복 echo 출력 금지.`;
                    const sys = isVenvTask ? `${baseGuide}${venvGuide}` : baseGuide;
                    const parts = [{ text: llmResponse }];
                    let refined: string | null = null;
                    if (this.currentModelType === AiModelType.GEMINI) {
                        refined = await this.geminiApi.sendMessageWithSystemPrompt(sys, parts, { signal: abortSignal });
                    } else {
                        try { await this.ollamaApi.loadSettingsFromStorage(); } catch { }
                        refined = await this.ollamaApi.sendMessageWithSystemPrompt(sys, parts, { signal: abortSignal });
                    }
                    if (refined && refined.trim()) {
                        // 정제된 응답을 실제 처리 대상으로 대체하여 이후 파일/명령 처리 단계가 정제본을 사용하도록 함
                        llmResponse = refined;
                        // 중복 출력 방지: 표시(채팅 전송)는 llmResponseProcessor에서 단일 경로로 처리
                    }
                }
            } catch (e) {
                console.warn('[LlmService] command refinement step failed:', e);
            }

            const outputTokens = estimateTokens(llmResponse);
            this.sendProcessingStatus('assembling', `Generated ${llmResponse.length.toLocaleString()} chars (~${outputTokens.toLocaleString()} tokens) response`);
            // Debug Console 로그를 활용한 추가 정보
            console.log(`[LlmService] Response generated: ${llmResponse.length.toLocaleString()} characters (~${outputTokens.toLocaleString()} tokens)`);
            console.log(`[LlmService] Response preview: ${llmResponse.substring(0, 100)}${llmResponse.length > 100 ? '...' : ''}`);

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

            // 중복 파일 제거 (파일명 기준)
            const deduplicatedFiles = this.removeDuplicateFiles(allContextFiles);
            console.log(`[LlmService] Original files: ${allContextFiles.length}, After deduplication: ${deduplicatedFiles.length}`);

            // GENERAL_ASK 타입일 때는 파일 업데이트를 위한 컨텍스트 파일을 넘기지 않음
            this.sendProcessingStep('parsing');
            this.sendProcessingStatus('parsing', 'Processing response format...');
            await this.llmResponseProcessor.processLlmResponseAndApplyUpdates(
                llmResponse,
                promptType === PromptType.CODE_GENERATION ? deduplicatedFiles : [],
                webviewToRespond,
                promptType,
                (status: string) => this.sendProcessingStatus('parsing', status),
                this // LLM 서비스 전달
            );
            this.sendProcessingStatus('parsing', 'Response processed successfully');
            this.sendProcessingStep('printing');
            this.sendProcessingStatus('printing', 'Preparing final output...');

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
                if (!this.suppressCancelNoticeOnce) {
                    safePostMessage(webviewToRespond, { command: 'receiveMessage', sender: 'AIDEV-IDE', text: 'AI 호출이 취소되었습니다.' });
                }
                this.suppressCancelNoticeOnce = false;
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

    private buildProfileContext(profile: ProjectProfile, projectType?: string): string {
        const lines: string[] = [];
        lines.push(`언어: ${profile.language}`);
        if (projectType) {
            lines.push(`프로젝트 타입: ${projectType}`);
        }
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
        lines.push(`작업 유형: ${intent.taskType}`);
        lines.push(`신뢰도: ${(intent.confidence * 100).toFixed(0)}%`);
        if (intent.keywords && intent.keywords.length > 0) {
            lines.push(`매칭 키워드: ${intent.keywords.join(', ')}`);
        }
        if (intent.reasoning) {
            lines.push(`근거: ${intent.reasoning}`);
        }

        // 작업 유형에 따른 명확한 지침 추가
        if (intent.taskType === 'code_work') {
            lines.push(`\n**작업 지침: 코드 작성 작업 (절대 필수)**`);
            lines.push(`- 소스 코드 파일(.js, .ts, .py, .java, .go, .rs 등)을 생성/수정/삭제해야 합니다.`);
            lines.push(`- **절대로 쉘 스크립트(.sh, .bat, .ps1)나 빌드 스크립트를 생성하지 마세요.**`);
            lines.push(`- **절대로 터미널 명령어 코드 블록을 생성하지 마세요.**`);
            lines.push(`- 프로그래밍 언어의 소스 코드 파일만 작성하세요.`);
            if (intent.subtype === 'code_generate' && (intent.reasoning?.includes('프로젝트 생성') || intent.reasoning?.includes('프로젝트 만들'))) {
                lines.push(`- **프로젝트 생성 작업**: 프로젝트 구조 파일(pom.xml, package.json, build.gradle 등)과 소스 코드 파일을 먼저 생성하세요.`);
                lines.push(`- 빌드나 실행은 소스 파일 생성 후 별도로 처리됩니다.`);
            }
        } else if (intent.taskType === 'execution_work') {
            lines.push(`\n**작업 지침: 쉘 스크립트 작업 (설치/빌드/배포/실행)**`);
            lines.push(`- 프로젝트의 설치, 빌드, 배포, 실행을 위한 스크립트(.sh, .bat, .ps1 등)를 생성하거나 터미널 명령을 실행해야 합니다.`);
            lines.push(`- 소스 코드 파일을 생성/수정하지 마세요.`);
            lines.push(`- 빌드/실행 스크립트나 터미널 명령어를 제공하세요.`);
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
    private async generateSystemPrompt(promptType: PromptType, codebaseContext: string, realTimeInfo: string, profileContext: string, intentContext: string): Promise<string> {
        let systemPrompt = '';

        // DeepSeek 모델에 대한 특별한 언어 지시사항 추가
        const isDeepSeek = this.currentModelType !== AiModelType.GEMINI && (this.ollamaApi.getModel?.() || '').includes('deepseek');
        const languageInstruction = isDeepSeek ?
            '\n\n️중요: 반드시 한국어로만 답변하세요. 중국어, 영어, 일본어 등 다른 언어는 사용하지 마세요. 모든 설명과 응답은 한국어로 작성해주세요.' : '';

        // Git 리포지토리 정보 가져오기
        const gitContext = await this.gitRepositoryService.getGitContextForLlm();

        if (promptType === PromptType.CODE_GENERATION) {
            systemPrompt = `${this.generateOSSpecificSystemPrompt()}

코드베이스 컨텍스트:
${codebaseContext}

프로젝트 프로필:
${profileContext}

사용자 의도:
${intentContext}

실시간 정보:
${realTimeInfo}

${gitContext}

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

${gitContext}

사용자의 질문에 대해 전문적이고 유용한 답변을 제공해주세요.${languageInstruction}`;
        }



        return systemPrompt;
    }

    /**
     * 사용자 질의어에서 프로젝트 타입을 LLM으로 감지합니다.
     * 하나의 프로젝트 타입만 선택하도록 강제합니다.
     */
    private async detectProjectTypeFromQuery(userQuery: string, projectRoot?: string): Promise<{ projectType: string, confidence: number, needsUserSelection: boolean }> {
        try {
            // 로컬 파일 시스템 기반 감지 먼저 시도
            let localProjectType = 'unknown';
            if (projectRoot) {
                const fs = require('fs');
                const path = require('path');
                try {
                    if (fs.existsSync(path.join(projectRoot, 'package.json'))) {
                        localProjectType = 'nodejs-npm';
                    } else if (fs.existsSync(path.join(projectRoot, 'requirements.txt')) || fs.existsSync(path.join(projectRoot, 'pyproject.toml'))) {
                        localProjectType = 'python';
                    } else if (fs.existsSync(path.join(projectRoot, 'pom.xml'))) {
                        localProjectType = 'java-maven';
                    } else if (fs.existsSync(path.join(projectRoot, 'build.gradle'))) {
                        localProjectType = 'java-gradle';
                    } else if (fs.existsSync(path.join(projectRoot, 'go.mod'))) {
                        localProjectType = 'go';
                    } else if (fs.existsSync(path.join(projectRoot, 'build.gradle')) && fs.existsSync(path.join(projectRoot, 'app'))) {
                        // Android 프로젝트 확인
                        const androidManifest = fs.existsSync(path.join(projectRoot, 'app', 'src', 'main', 'AndroidManifest.xml'));
                        if (androidManifest) {
                            localProjectType = 'android';
                        }
                    } else if (fs.existsSync(path.join(projectRoot, 'Podfile')) || fs.existsSync(path.join(projectRoot, '*.xcodeproj'))) {
                        localProjectType = 'ios';
                    }
                } catch (e) {
                    console.warn('[LlmService] 로컬 프로젝트 타입 감지 실패:', e);
                }
            }

            const supportedTypes = [
                'nodejs-npm',
                'python',
                'java-maven',
                'java-gradle',
                'go',
                'android',
                'ios'
            ];

            const projectTypePrompt = `다음 사용자 요청과 로컬 프로젝트 구성을 분석하여 프로젝트 타입을 정확히 하나만 선택하세요.

지원하는 프로젝트 타입 (반드시 이 중 하나만 선택):
1. nodejs-npm: Node.js 프로젝트 (package.json 존재)
2. python: Python 프로젝트 (requirements.txt, pyproject.toml 등)
3. java-maven: Java Maven 프로젝트 (pom.xml 존재)
4. java-gradle: Java Gradle 프로젝트 (build.gradle 존재)
5. go: Go 프로젝트 (go.mod 존재)
6. android: Android 프로젝트 (AndroidManifest.xml, build.gradle 존재)
7. ios: iOS 프로젝트 (Podfile, .xcodeproj 존재)

로컬 프로젝트 구성: ${localProjectType !== 'unknown' ? localProjectType : '감지되지 않음'}

**중요 규칙:**
- 반드시 위 7개 타입 중 하나만 선택해야 합니다.
- 여러 타입이 가능해 보이면 가장 확실한 하나만 선택하세요.
- 확신이 없으면 (confidence < 0.7) needsUserSelection을 true로 설정하세요.
- 로컬 파일 시스템에서 감지된 타입이 있으면 그것을 우선 고려하세요.

출력 형식 (JSON):
{
  "projectType": "nodejs-npm",
  "confidence": 0.9,
  "reasoning": "package.json 파일이 존재하고 사용자 요청에 npm 키워드가 포함되어 있습니다.",
  "needsUserSelection": false
}

사용자 요청: "${userQuery}"`;

            let response: string;

            if (this.currentModelType === AiModelType.GEMINI) {
                response = await this.geminiApi.sendMessage(projectTypePrompt, undefined, { signal: this.currentCallController?.signal });
            } else if (this.currentModelType === AiModelType.OLLAMA_Gemma || this.currentModelType === AiModelType.OLLAMA_DeepSeek || this.currentModelType === AiModelType.OLLAMA_CodeLlama || this.currentModelType === AiModelType.OLLAMA_GPT_OSS) {
                response = await this.ollamaApi.sendMessage(projectTypePrompt, { signal: this.currentCallController?.signal });
            } else {
                return {
                    projectType: 'unknown',
                    confidence: 0,
                    needsUserSelection: true
                };
            }

            console.log(`[LlmService] LLM 프로젝트 타입 감지 응답: ${response}`);

            // JSON 응답 파싱
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const result = JSON.parse(jsonMatch[0]);
                if (result.projectType && supportedTypes.includes(result.projectType)) {
                    console.log(`[LlmService] LLM 프로젝트 타입 감지 성공: ${result.projectType} (신뢰도: ${result.confidence}, 사용자 선택 필요: ${result.needsUserSelection || false})`);
                    return {
                        projectType: result.projectType,
                        confidence: result.confidence || 0.5,
                        needsUserSelection: result.needsUserSelection || (result.confidence < 0.7)
                    };
                }
            }

            // 로컬에서 감지된 타입이 있으면 그것을 우선 사용
            if (localProjectType !== 'unknown' && supportedTypes.includes(localProjectType)) {
                console.log(`[LlmService] 로컬 프로젝트 타입 사용: ${localProjectType}`);
                return {
                    projectType: localProjectType,
                    confidence: 0.8,
                    needsUserSelection: false
                };
            }

            // JSON 파싱 실패 및 로컬 감지 실패 시 키워드 기반 감지
            const lowerQuery = userQuery.toLowerCase();
            let detectedType = 'unknown';

            if (lowerQuery.includes('node') || lowerQuery.includes('npm') || lowerQuery.includes('javascript') || lowerQuery.includes('typescript')) {
                detectedType = 'nodejs-npm';
            } else if (lowerQuery.includes('python')) {
                detectedType = 'python';
            } else if (lowerQuery.includes('maven') || (lowerQuery.includes('java') && lowerQuery.includes('maven'))) {
                detectedType = 'java-maven';
            } else if (lowerQuery.includes('gradle') || (lowerQuery.includes('java') && lowerQuery.includes('gradle'))) {
                detectedType = 'java-gradle';
            } else if (lowerQuery.includes('java')) {
                detectedType = 'java-maven'; // 기본값
            } else if (lowerQuery.includes('go ') || lowerQuery.includes('golang')) {
                detectedType = 'go';
            } else if (lowerQuery.includes('android')) {
                detectedType = 'android';
            } else if (lowerQuery.includes('ios')) {
                detectedType = 'ios';
            }

            if (detectedType !== 'unknown') {
                return {
                    projectType: detectedType,
                    confidence: 0.6,
                    needsUserSelection: true // 키워드 기반이므로 사용자 확인 필요
                };
            }

            return {
                projectType: 'unknown',
                confidence: 0,
                needsUserSelection: true
            };
        } catch (error) {
            console.warn('[LlmService] LLM 프로젝트 타입 감지 실패:', error);
            return {
                projectType: 'unknown',
                confidence: 0,
                needsUserSelection: true
            };
        }
    }

    /**
     * 명령어 오류 수정을 위한 LLM 메시지 전송
     */
    public async sendMessageForErrorCorrection(prompt: string): Promise<string> {
        try {
            let response: string;

            if (this.currentModelType === AiModelType.GEMINI) {
                response = await this.geminiApi.sendMessage(prompt, undefined, { signal: this.currentCallController?.signal });
            } else if (this.currentModelType === AiModelType.OLLAMA_Gemma || this.currentModelType === AiModelType.OLLAMA_DeepSeek || this.currentModelType === AiModelType.OLLAMA_CodeLlama || this.currentModelType === AiModelType.OLLAMA_GPT_OSS) {
                response = await this.ollamaApi.sendMessage(prompt, { signal: this.currentCallController?.signal });
            } else {
                throw new Error('지원하지 않는 모델 타입');
            }

            console.log(`[LlmService] 오류 수정 응답: ${response}`);
            return response;
        } catch (error) {
            console.error('[LlmService] 오류 수정 메시지 전송 실패:', error);
            throw error;
        }
    }

    /**
     * 의도 분석 결과가 코드 관련 질문인지 확인합니다.
     * @param intentResult 의도 분석 결과
     * @returns 코드 관련 의도인지 여부
     */
    private isCodeRelatedIntent(intentResult: { category: string; subtype: string; confidence: number }): boolean {
        // 코드, 실행, 분석 카테고리는 파일 컨텍스트가 필요
        const codeRelatedCategories = ['code', 'execution', 'analysis'];
        return codeRelatedCategories.includes(intentResult.category);
    }

    /**
     * 중복된 파일을 제거합니다. 파일명이 동일한 경우 가장 최근에 추가된 파일을 유지합니다.
     * @param files 파일 목록
     * @returns 중복이 제거된 파일 목록
     */
    private removeDuplicateFiles(files: { name: string, fullPath: string }[]): { name: string, fullPath: string }[] {
        const fileMap = new Map<string, { name: string, fullPath: string }>();

        // 파일명을 키로 하여 Map에 저장 (동일한 파일명이 있으면 덮어쓰기)
        for (const file of files) {
            fileMap.set(file.name, file);
        }

        const deduplicatedFiles = Array.from(fileMap.values());

        if (files.length !== deduplicatedFiles.length) {
            const removedFiles = files.length - deduplicatedFiles.length;
            console.log(`[LlmService] Removed ${removedFiles} duplicate files. Remaining files: ${deduplicatedFiles.map(f => f.name).join(', ')}`);
        }

        return deduplicatedFiles;
    }

    /**
     * 브랜치별 이슈 분석 및 개선 방안 도출
     */
    public async analyzeBranchIssues(projectRoot: string): Promise<string> {
        try {
            this.sendProcessingStep('analyzing');
            this.sendProcessingStatus('analyzing', '브랜치별 이슈 분석 중...');

            const analysis = await this.gitBranchAnalysisService.analyzeAllBranches(projectRoot);

            // 분석 결과를 마크다운 형식으로 포맷팅
            let report = `# 🔍 브랜치별 이슈 분석 보고서\n\n`;

            // 전체 프로젝트 상태
            report += `## 📊 전체 프로젝트 상태\n`;
            report += `- **총 브랜치 수**: ${analysis.totalBranches}\n`;
            report += `- **총 이슈 수**: ${analysis.totalIssues}\n`;
            report += `- **전체 건강도**: ${this.getHealthStatusEmoji(analysis.overallHealth)} ${analysis.overallHealth}\n\n`;

            // 브랜치별 분석
            report += `## 🌿 브랜치별 분석\n\n`;
            analysis.branchAnalyses.forEach(branchAnalysis => {
                report += `### ${branchAnalysis.branch}\n`;
                report += `- **상태**: ${this.getHealthStatusEmoji(branchAnalysis.branchHealth)} ${branchAnalysis.branchHealth}\n`;
                report += `- **총 이슈**: ${branchAnalysis.totalIssues}개\n`;

                if (branchAnalysis.criticalIssues.length > 0) {
                    report += `- **심각한 이슈**: ${branchAnalysis.criticalIssues.length}개\n`;
                }

                // 카테고리별 이슈 수
                const categories = Object.keys(branchAnalysis.issuesByCategory);
                if (categories.length > 0) {
                    report += `- **이슈 카테고리**: ${categories.map(cat => `${cat}(${branchAnalysis.issuesByCategory[cat].length})`).join(', ')}\n`;
                }

                // 개선 방안
                if (branchAnalysis.suggestedImprovements.length > 0) {
                    report += `- **개선 방안**:\n`;
                    branchAnalysis.suggestedImprovements.forEach(improvement => {
                        report += `  - ${improvement}\n`;
                    });
                }

                report += `\n`;
            });

            // 공통 이슈
            if (analysis.crossBranchIssues.length > 0) {
                report += `## 🔄 브랜치 간 공통 이슈\n\n`;
                analysis.crossBranchIssues.forEach(issue => {
                    report += `### ${issue.issue}\n`;
                    report += `- **심각도**: ${this.getSeverityEmoji(issue.severity)} ${issue.severity}\n`;
                    report += `- **카테고리**: ${issue.category}\n`;
                    report += `- **설명**: ${issue.description}\n`;
                    report += `- **개선 방안**: ${issue.suggestedFix}\n\n`;
                });
            }

            // 권장 액션
            if (analysis.recommendedActions.length > 0) {
                report += `## 🎯 권장 액션\n\n`;
                analysis.recommendedActions.forEach((action, index) => {
                    report += `${index + 1}. ${action}\n`;
                });
                report += `\n`;
            }

            // 상세 이슈 목록
            report += `## 📋 상세 이슈 목록\n\n`;
            analysis.branchAnalyses.forEach(branchAnalysis => {
                if (branchAnalysis.totalIssues > 0) {
                    report += `### ${branchAnalysis.branch} 상세 이슈\n\n`;

                    Object.entries(branchAnalysis.issuesByCategory).forEach(([category, issues]) => {
                        if (issues.length > 0) {
                            report += `#### ${category} (${issues.length}개)\n\n`;
                            issues.forEach(issue => {
                                report += `- **${issue.issue}**\n`;
                                report += `  - 심각도: ${this.getSeverityEmoji(issue.severity)} ${issue.severity}\n`;
                                report += `  - 우선순위: ${issue.priority}/10\n`;
                                report += `  - 설명: ${issue.description}\n`;
                                report += `  - 개선 방안: ${issue.suggestedFix}\n\n`;
                            });
                        }
                    });
                }
            });

            this.sendProcessingStatus('analyzing', '브랜치 분석 완료');
            return report;

        } catch (error) {
            console.error('[LlmService] 브랜치 분석 실패:', error);
            this.sendProcessingStatus('analyzing', '브랜치 분석 실패');
            return `브랜치 분석 중 오류가 발생했습니다: ${error}`;
        }
    }

    /**
     * 건강도 상태에 따른 이모지 반환
     */
    private getHealthStatusEmoji(health: string): string {
        switch (health) {
            case 'excellent': return '🟢';
            case 'good': return '🟡';
            case 'needs_attention': return '🟠';
            case 'critical': return '🔴';
            default: return '⚪';
        }
    }

    /**
     * 심각도에 따른 이모지 반환
     */
    private getSeverityEmoji(severity: string): string {
        switch (severity) {
            case 'critical': return '🔴';
            case 'high': return '🟠';
            case 'medium': return '🟡';
            case 'low': return '🟢';
            default: return '⚪';
        }
    }

    /**
     * 대화기록을 삭제합니다.
     * @param promptType 프롬프트 타입 (CODE_GENERATION 또는 GENERAL_ASK)
     */
    public async clearHistory(promptType: PromptType): Promise<void> {
        if (!this.extensionContext) {
            console.warn('[LlmService] Extension context not available for clearing history');
            return;
        }

        try {
            const historyKey = promptType === PromptType.CODE_GENERATION ? 'codeTabHistory' : 'askTabHistory';
            await this.extensionContext.globalState.update(historyKey, []);
            console.log(`[LlmService] Cleared history for ${promptType === PromptType.CODE_GENERATION ? 'Code' : 'Ask'} tab`);

            // 프로젝트 컨텍스트도 초기화
            if (this.codebaseContextService) {
                this.codebaseContextService.clearProjectContext();
            }
        } catch (error) {
            console.error('[LlmService] Failed to clear history:', error);
            throw error;
        }
    }

    private async buildProjectInventorySection(): Promise<string> {
        try {
            const projectRoot = await this.configurationService.getProjectRoot?.();
            if (!projectRoot) return '';
            const rootUri = vscode.Uri.file(projectRoot);
            const maxEntries = 400; // hard cap to avoid token blowup
            const items: string[] = [];

            const rel = (p: string) => {
                const norm = p.replace(/\\/g, '/');
                const rootNorm = projectRoot.replace(/\\/g, '/');
                return norm.startsWith(rootNorm) ? norm.substring(rootNorm.length + (rootNorm.endsWith('/') ? 0 : 1)) : norm;
            };

            const walk = async (dir: vscode.Uri, depth: number) => {
                if (items.length >= maxEntries) return;
                let entries: [string, vscode.FileType][] = [];
                try {
                    entries = await vscode.workspace.fs.readDirectory(dir);
                } catch { return; }
                for (const [name, type] of entries) {
                    if (items.length >= maxEntries) break;
                    const child = vscode.Uri.joinPath(dir, name);
                    if (type === vscode.FileType.Directory) {
                        items.push(`[D] ${rel(child.fsPath)}`);
                        if (depth < 6) {
                            await walk(child, depth + 1);
                        }
                    } else if (type === vscode.FileType.File) {
                        items.push(`[F] ${rel(child.fsPath)}`);
                    }
                }
            };

            await walk(rootUri, 0);
            if (items.length === 0) return '';
            const header = `\n--- 프로젝트 파일 인벤토리 (최대 ${maxEntries}개, 최신 루트 스냅샷) ---\n`;
            return header + items.join('\n');
        } catch {
            return '';
        }
    }
}

