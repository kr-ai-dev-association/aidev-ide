import * as vscode from 'vscode';
import { NotificationService } from '../services/notificationService';
import { ConfigurationService } from '../services/configurationService';

export interface ActionStep {
    id: string;
    type: 'code_generation' | 'file_operation' | 'terminal_command' | 'analysis' | 'verification';
    description: string;
    command?: string;
    filePath?: string;
    content?: string;
    dependencies?: string[];
    expectedOutput?: string;
    errorPatterns?: string[];
}

export interface ActionPlan {
    id: string;
    userQuery: string;
    context: {
        conversationHistory: { userQuery: string, aiResponse?: string, timestamp: number }[];
        includedFiles: { name: string, fullPath: string }[];
        projectRoot: string;
    };
    steps: ActionStep[];
    currentStepIndex: number;
    status: 'planning' | 'executing' | 'completed' | 'failed' | 'paused';
    createdAt: number;
    lastExecutedAt?: number;
}

export class ActionPlannerService {
    private notificationService: NotificationService;
    private configurationService: ConfigurationService;
    private activePlans: Map<string, ActionPlan> = new Map();
    private actionQueue: ActionStep[] = [];

    constructor(notificationService: NotificationService, configurationService: ConfigurationService) {
        this.notificationService = notificationService;
        this.configurationService = configurationService;
    }

    /**
     * 사용자 질의를 분석하여 액션 플랜을 생성합니다.
     * @param userQuery 사용자 질의
     * @param conversationHistory 대화 기록
     * @param includedFiles 포함된 파일들
     * @param projectRoot 프로젝트 루트
     * @returns 생성된 액션 플랜
     */
    public async createActionPlan(
        userQuery: string,
        conversationHistory: { userQuery: string, aiResponse?: string, timestamp: number }[],
        includedFiles: { name: string, fullPath: string }[],
        projectRoot: string
    ): Promise<ActionPlan> {
        const planId = `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        console.log(`[ActionPlannerService] 액션 플랜 생성 시작: ${planId}`);
        console.log(`[ActionPlannerService] 사용자 질의: "${userQuery}"`);
        console.log(`[ActionPlannerService] 포함된 파일: ${includedFiles.length}개`);
        console.log(`[ActionPlannerService] 대화 기록: ${conversationHistory.length}개`);

        // LLM을 통한 액션 계획 생성
        const steps = await this.generateActionSteps(userQuery, conversationHistory, includedFiles, projectRoot);
        
        const plan: ActionPlan = {
            id: planId,
            userQuery,
            context: {
                conversationHistory,
                includedFiles,
                projectRoot
            },
            steps,
            currentStepIndex: 0,
            status: 'planning',
            createdAt: Date.now()
        };

        this.activePlans.set(planId, plan);
        console.log(`[ActionPlannerService] 액션 플랜 생성 완료: ${steps.length}개 단계`);
        
        return plan;
    }

    /**
     * LLM을 통해 액션 단계들을 생성합니다.
     * @param userQuery 사용자 질의
     * @param conversationHistory 대화 기록
     * @param includedFiles 포함된 파일들
     * @param projectRoot 프로젝트 루트
     * @returns 생성된 액션 단계들
     */
    private async generateActionSteps(
        userQuery: string,
        conversationHistory: { userQuery: string, aiResponse?: string, timestamp: number }[],
        includedFiles: { name: string, fullPath: string }[],
        projectRoot: string
    ): Promise<ActionStep[]> {
        // 대화 기록 요약
        const historySummary = this.summarizeConversationHistory(conversationHistory);
        
        // 포함된 파일 정보 요약
        const filesSummary = includedFiles.map(file => ({
            name: file.name,
            path: file.fullPath.replace(projectRoot, '').replace(/^[\/\\]/, '')
        }));

        // LLM 프롬프트 구성
        const prompt = this.buildActionPlanningPrompt(userQuery, historySummary, filesSummary, projectRoot);
        
        console.log(`[ActionPlannerService] LLM 프롬프트 생성 완료`);
        console.log(`[ActionPlannerService] 프롬프트 길이: ${prompt.length}자`);

        // TODO: 실제 LLM 호출 구현
        // 임시로 기본 액션 단계들 반환
        return this.generateDefaultActionSteps(userQuery, includedFiles);
    }

    /**
     * 대화 기록을 요약합니다.
     * @param conversationHistory 대화 기록
     * @returns 요약된 대화 기록
     */
    private summarizeConversationHistory(conversationHistory: { userQuery: string, aiResponse?: string, timestamp: number }[]): string {
        if (conversationHistory.length === 0) {
            return '대화 기록이 없습니다.';
        }

        const recentConversations = conversationHistory.slice(-3); // 최근 3개 대화만
        return recentConversations.map(conv => {
            let summary = `사용자: ${conv.userQuery}`;
            if (conv.aiResponse) {
                const shortResponse = conv.aiResponse.length > 100 
                    ? conv.aiResponse.substring(0, 100) + '...' 
                    : conv.aiResponse;
                summary += `\nAI: ${shortResponse}`;
            }
            return summary;
        }).join('\n\n');
    }

    /**
     * 액션 계획을 위한 LLM 프롬프트를 구성합니다.
     * @param userQuery 사용자 질의
     * @param historySummary 대화 기록 요약
     * @param filesSummary 파일 정보 요약
     * @param projectRoot 프로젝트 루트
     * @returns LLM 프롬프트
     */
    private buildActionPlanningPrompt(
        userQuery: string,
        historySummary: string,
        filesSummary: { name: string, path: string }[],
        projectRoot: string
    ): string {
        return `
사용자 질의: "${userQuery}"

프로젝트 루트: ${projectRoot}

대화 기록:
${historySummary}

포함된 파일들:
${filesSummary.map(file => `- ${file.name} (${file.path})`).join('\n')}

위 정보를 바탕으로 사용자의 질의를 해결하기 위한 단계별 액션 플랜을 생성해주세요.

각 액션은 다음 형식으로 JSON 배열로 응답해주세요:
[
  {
    "id": "step_1",
    "type": "analysis",
    "description": "현재 코드 구조 분석",
    "dependencies": [],
    "expectedOutput": "코드 구조 분석 결과"
  },
  {
    "id": "step_2", 
    "type": "code_generation",
    "description": "필요한 함수 구현",
    "filePath": "src/utils/helper.js",
    "content": "구현할 코드 내용",
    "dependencies": ["step_1"],
    "expectedOutput": "함수 구현 완료"
  },
  {
    "id": "step_3",
    "type": "terminal_command",
    "description": "코드 테스트 실행",
    "command": "npm test",
    "dependencies": ["step_2"],
    "expectedOutput": "테스트 통과",
    "errorPatterns": ["Error:", "Failed:", "Exception:"]
  }
]

액션 타입:
- analysis: 코드/파일 분석
- code_generation: 코드 생성/수정
- file_operation: 파일 생성/삭제/이동
- terminal_command: 터미널 명령 실행
- verification: 결과 검증

각 단계는 이전 단계의 성공을 전제로 하며, 터미널/콘솔 로그에서 에러가 발생하면 중단되어야 합니다.
`;
    }

    /**
     * 기본 액션 단계들을 생성합니다. (임시 구현)
     * @param userQuery 사용자 질의
     * @param includedFiles 포함된 파일들
     * @returns 기본 액션 단계들
     */
    private generateDefaultActionSteps(
        userQuery: string,
        includedFiles: { name: string, fullPath: string }[]
    ): ActionStep[] {
        const steps: ActionStep[] = [];

        // 1단계: 분석
        steps.push({
            id: 'step_1',
            type: 'analysis',
            description: '현재 프로젝트 구조 및 포함된 파일들 분석',
            dependencies: [],
            expectedOutput: '프로젝트 구조 분석 완료'
        });

        // 2단계: 코드 생성/수정 (필요한 경우)
        if (userQuery.includes('생성') || userQuery.includes('만들') || userQuery.includes('추가')) {
            steps.push({
                id: 'step_2',
                type: 'code_generation',
                description: '사용자 요청에 따른 코드 생성/수정',
                dependencies: ['step_1'],
                expectedOutput: '코드 생성/수정 완료'
            });
        }

        // 3단계: 검증
        steps.push({
            id: 'step_3',
            type: 'verification',
            description: '생성된 코드 검증 및 테스트',
            dependencies: steps.length > 1 ? ['step_2'] : ['step_1'],
            expectedOutput: '코드 검증 완료',
            errorPatterns: ['Error:', 'Failed:', 'Exception:', 'TypeError:', 'ReferenceError:']
        });

        return steps;
    }

    /**
     * 액션 플랜을 실행합니다.
     * @param planId 플랜 ID
     * @returns 실행 결과
     */
    public async executeActionPlan(planId: string): Promise<{ success: boolean; message: string; nextStep?: ActionStep }> {
        const plan = this.activePlans.get(planId);
        if (!plan) {
            return { success: false, message: '액션 플랜을 찾을 수 없습니다.' };
        }

        if (plan.currentStepIndex >= plan.steps.length) {
            plan.status = 'completed';
            return { success: true, message: '모든 액션 단계가 완료되었습니다.' };
        }

        const currentStep = plan.steps[plan.currentStepIndex];
        console.log(`[ActionPlannerService] 액션 실행: ${currentStep.id} - ${currentStep.description}`);

        try {
            // 액션 실행
            const result = await this.executeActionStep(currentStep, plan);
            
            if (result.success) {
                plan.currentStepIndex++;
                plan.lastExecutedAt = Date.now();
                
                if (plan.currentStepIndex < plan.steps.length) {
                    const nextStep = plan.steps[plan.currentStepIndex];
                    return { 
                        success: true, 
                        message: `단계 ${currentStep.id} 완료. 다음 단계: ${nextStep.description}`,
                        nextStep 
                    };
                } else {
                    plan.status = 'completed';
                    return { success: true, message: '모든 액션 단계가 완료되었습니다.' };
                }
            } else {
                plan.status = 'failed';
                return { success: false, message: `단계 ${currentStep.id} 실패: ${result.message}` };
            }
        } catch (error) {
            plan.status = 'failed';
            return { success: false, message: `액션 실행 중 오류: ${error}` };
        }
    }

    /**
     * 개별 액션 단계를 실행합니다.
     * @param step 액션 단계
     * @param plan 전체 플랜
     * @returns 실행 결과
     */
    private async executeActionStep(step: ActionStep, plan: ActionPlan): Promise<{ success: boolean; message: string }> {
        console.log(`[ActionPlannerService] 액션 단계 실행: ${step.type} - ${step.description}`);

        switch (step.type) {
            case 'analysis':
                return await this.executeAnalysisStep(step, plan);
            case 'code_generation':
                return await this.executeCodeGenerationStep(step, plan);
            case 'file_operation':
                return await this.executeFileOperationStep(step, plan);
            case 'terminal_command':
                return await this.executeTerminalCommandStep(step, plan);
            case 'verification':
                return await this.executeVerificationStep(step, plan);
            default:
                return { success: false, message: `지원하지 않는 액션 타입: ${step.type}` };
        }
    }

    /**
     * 분석 단계를 실행합니다.
     * @param step 액션 단계
     * @param plan 전체 플랜
     * @returns 실행 결과
     */
    private async executeAnalysisStep(step: ActionStep, plan: ActionPlan): Promise<{ success: boolean; message: string }> {
        console.log(`[ActionPlannerService] 분석 단계 실행: ${step.description}`);
        
        // TODO: 실제 분석 로직 구현
        // 현재는 성공으로 처리
        return { success: true, message: '분석 완료' };
    }

    /**
     * 코드 생성 단계를 실행합니다.
     * @param step 액션 단계
     * @param plan 전체 플랜
     * @returns 실행 결과
     */
    private async executeCodeGenerationStep(step: ActionStep, plan: ActionPlan): Promise<{ success: boolean; message: string }> {
        console.log(`[ActionPlannerService] 코드 생성 단계 실행: ${step.description}`);
        
        // TODO: 실제 코드 생성 로직 구현
        // 현재는 성공으로 처리
        return { success: true, message: '코드 생성 완료' };
    }

    /**
     * 파일 작업 단계를 실행합니다.
     * @param step 액션 단계
     * @param plan 전체 플랜
     * @returns 실행 결과
     */
    private async executeFileOperationStep(step: ActionStep, plan: ActionPlan): Promise<{ success: boolean; message: string }> {
        console.log(`[ActionPlannerService] 파일 작업 단계 실행: ${step.description}`);
        
        // TODO: 실제 파일 작업 로직 구현
        // 현재는 성공으로 처리
        return { success: true, message: '파일 작업 완료' };
    }

    /**
     * 터미널 명령 단계를 실행합니다.
     * @param step 액션 단계
     * @param plan 전체 플랜
     * @returns 실행 결과
     */
    private async executeTerminalCommandStep(step: ActionStep, plan: ActionPlan): Promise<{ success: boolean; message: string }> {
        console.log(`[ActionPlannerService] 터미널 명령 단계 실행: ${step.command}`);
        
        if (!step.command) {
            return { success: false, message: '실행할 명령이 없습니다.' };
        }

        try {
            // TODO: 실제 터미널 명령 실행 및 에러 감지 구현
            // 현재는 성공으로 처리
            return { success: true, message: `명령 실행 완료: ${step.command}` };
        } catch (error) {
            return { success: false, message: `명령 실행 실패: ${error}` };
        }
    }

    /**
     * 검증 단계를 실행합니다.
     * @param step 액션 단계
     * @param plan 전체 플랜
     * @returns 실행 결과
     */
    private async executeVerificationStep(step: ActionStep, plan: ActionPlan): Promise<{ success: boolean; message: string }> {
        console.log(`[ActionPlannerService] 검증 단계 실행: ${step.description}`);
        
        // TODO: 실제 검증 로직 구현
        // 터미널/콘솔 로그에서 에러 패턴 확인
        const hasErrors = await this.checkForErrors(step.errorPatterns || []);
        
        if (hasErrors) {
            return { success: false, message: '검증 중 에러가 발견되었습니다.' };
        }
        
        return { success: true, message: '검증 완료' };
    }

    /**
     * 에러 패턴을 확인합니다.
     * @param errorPatterns 에러 패턴 배열
     * @returns 에러 존재 여부
     */
    private async checkForErrors(errorPatterns: string[]): Promise<boolean> {
        // TODO: 실제 터미널/콘솔 로그에서 에러 패턴 확인 구현
        // 현재는 에러 없음으로 처리
        return false;
    }

    /**
     * 활성 플랜을 가져옵니다.
     * @param planId 플랜 ID
     * @returns 액션 플랜
     */
    public getActivePlan(planId: string): ActionPlan | undefined {
        return this.activePlans.get(planId);
    }

    /**
     * 모든 활성 플랜을 가져옵니다.
     * @returns 활성 플랜 배열
     */
    public getAllActivePlans(): ActionPlan[] {
        return Array.from(this.activePlans.values());
    }

    /**
     * 플랜을 삭제합니다.
     * @param planId 플랜 ID
     */
    public removePlan(planId: string): void {
        this.activePlans.delete(planId);
        console.log(`[ActionPlannerService] 플랜 삭제: ${planId}`);
    }
}
