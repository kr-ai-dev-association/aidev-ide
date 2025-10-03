import * as vscode from 'vscode';
import { ActionPlan, ActionStep } from './actionPlannerService';
import { TerminalMonitorService } from './terminalMonitorService';
import { runCommandCapture } from '../utils/processRunner';
import { NotificationService } from '../services/notificationService';

export interface ExecutionResult {
    success: boolean;
    message: string;
    output?: string;
    error?: string;
    nextStep?: ActionStep;
    shouldRetry?: boolean;
    retryCount?: number;
}

export interface ExecutionContext {
    planId: string;
    currentStep: ActionStep;
    plan: ActionPlan;
    terminalMonitor: TerminalMonitorService;
    maxRetries: number;
    retryDelay: number;
}

export class ActionExecutionEngine {
    private notificationService: NotificationService;
    private terminalMonitor: TerminalMonitorService;
    private activeExecutions: Map<string, ExecutionContext> = new Map();
    private executionQueue: string[] = [];

    constructor(notificationService: NotificationService, terminalMonitor: TerminalMonitorService) {
        this.notificationService = notificationService;
        this.terminalMonitor = terminalMonitor;
    }

    /**
     * 액션 플랜을 실행합니다.
     * @param plan 액션 플랜
     * @returns 실행 결과
     */
    public async executePlan(plan: ActionPlan): Promise<ExecutionResult> {
        console.log(`[ActionExecutionEngine] 플랜 실행 시작: ${plan.id}`);
        
        const context: ExecutionContext = {
            planId: plan.id,
            currentStep: plan.steps[plan.currentStepIndex],
            plan,
            terminalMonitor: this.terminalMonitor,
            maxRetries: 3,
            retryDelay: 2000
        };

        this.activeExecutions.set(plan.id, context);
        
        try {
            const result = await this.executeStep(context);
            return result;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`[ActionExecutionEngine] 플랜 실행 중 오류: ${errorMessage}`);
            return {
                success: false,
                message: `플랜 실행 중 오류: ${errorMessage}`,
                error: errorMessage
            };
        } finally {
            this.activeExecutions.delete(plan.id);
        }
    }

    /**
     * 개별 액션 단계를 실행합니다.
     * @param context 실행 컨텍스트
     * @returns 실행 결과
     */
    private async executeStep(context: ExecutionContext): Promise<ExecutionResult> {
        const { currentStep, plan } = context;
        
        console.log(`[ActionExecutionEngine] 단계 실행: ${currentStep.id} - ${currentStep.description}`);
        
        // 의존성 확인
        if (currentStep.dependencies && currentStep.dependencies.length > 0) {
            const dependencyResults = await this.checkDependencies(currentStep.dependencies, plan);
            if (!dependencyResults.success) {
                return {
                    success: false,
                    message: `의존성 확인 실패: ${dependencyResults.message}`,
                    error: dependencyResults.message
                };
            }
        }

        // 액션 타입별 실행
        let result: ExecutionResult;
        switch (currentStep.type) {
            case 'analysis':
                result = await this.executeAnalysis(currentStep, context);
                break;
            case 'code_generation':
                result = await this.executeCodeGeneration(currentStep, context);
                break;
            case 'file_operation':
                result = await this.executeFileOperation(currentStep, context);
                break;
            case 'terminal_command':
                result = await this.executeTerminalCommand(currentStep, context);
                break;
            case 'verification':
                result = await this.executeVerification(currentStep, context);
                break;
            default:
                result = {
                    success: false,
                    message: `지원하지 않는 액션 타입: ${currentStep.type}`,
                    error: `Unknown action type: ${currentStep.type}`
                };
        }

        // 실행 결과 처리
        if (result.success) {
            console.log(`[ActionExecutionEngine] 단계 성공: ${currentStep.id}`);
            plan.currentStepIndex++;
            
            if (plan.currentStepIndex < plan.steps.length) {
                const nextStep = plan.steps[plan.currentStepIndex];
                result.nextStep = nextStep;
                result.message += ` 다음 단계: ${nextStep.description}`;
            } else {
                plan.status = 'completed';
                result.message += ' 모든 단계가 완료되었습니다.';
            }
        } else {
            console.log(`[ActionExecutionEngine] 단계 실패: ${currentStep.id} - ${result.message}`);
            
            // 에러 발생 시 재계획 필요 여부 확인
            if (this.shouldReplan(result, context)) {
                result.shouldRetry = true;
                result.message += ' 재계획이 필요합니다.';
            }
        }

        return result;
    }

    /**
     * 의존성을 확인합니다.
     * @param dependencies 의존성 ID 배열
     * @param plan 액션 플랜
     * @returns 의존성 확인 결과
     */
    private async checkDependencies(dependencies: string[], plan: ActionPlan): Promise<{ success: boolean; message: string }> {
        for (const depId of dependencies) {
            const depStep = plan.steps.find(step => step.id === depId);
            if (!depStep) {
                return { success: false, message: `의존성 단계를 찾을 수 없습니다: ${depId}` };
            }
            
            // 의존성 단계가 현재 단계보다 앞에 있는지 확인
            const depIndex = plan.steps.findIndex(step => step.id === depId);
            if (depIndex >= plan.currentStepIndex) {
                return { success: false, message: `의존성 단계가 아직 실행되지 않았습니다: ${depId}` };
            }
        }
        
        return { success: true, message: '의존성 확인 완료' };
    }

    /**
     * 분석 액션을 실행합니다.
     * @param step 액션 단계
     * @param context 실행 컨텍스트
     * @returns 실행 결과
     */
    private async executeAnalysis(step: ActionStep, context: ExecutionContext): Promise<ExecutionResult> {
        console.log(`[ActionExecutionEngine] 분석 실행: ${step.description}`);
        
        try {
            // TODO: 실제 분석 로직 구현
            // 현재는 성공으로 처리
            await new Promise(resolve => setTimeout(resolve, 1000)); // 시뮬레이션
            
            return {
                success: true,
                message: '분석 완료',
                output: '프로젝트 구조 분석이 완료되었습니다.'
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
                success: false,
                message: `분석 실패: ${errorMessage}`,
                error: errorMessage
            };
        }
    }

    /**
     * 코드 생성 액션을 실행합니다.
     * @param step 액션 단계
     * @param context 실행 컨텍스트
     * @returns 실행 결과
     */
    private async executeCodeGeneration(step: ActionStep, context: ExecutionContext): Promise<ExecutionResult> {
        console.log(`[ActionExecutionEngine] 코드 생성 실행: ${step.description}`);
        
        try {
            if (!step.filePath || !step.content) {
                return {
                    success: false,
                    message: '파일 경로 또는 내용이 지정되지 않았습니다.',
                    error: 'Missing filePath or content'
                };
            }

            // TODO: 실제 코드 생성 로직 구현
            // 현재는 성공으로 처리
            await new Promise(resolve => setTimeout(resolve, 2000)); // 시뮬레이션
            
            return {
                success: true,
                message: '코드 생성 완료',
                output: `파일 ${step.filePath}에 코드가 생성되었습니다.`
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
                success: false,
                message: `코드 생성 실패: ${errorMessage}`,
                error: errorMessage
            };
        }
    }

    /**
     * 파일 작업 액션을 실행합니다.
     * @param step 액션 단계
     * @param context 실행 컨텍스트
     * @returns 실행 결과
     */
    private async executeFileOperation(step: ActionStep, context: ExecutionContext): Promise<ExecutionResult> {
        console.log(`[ActionExecutionEngine] 파일 작업 실행: ${step.description}`);
        
        try {
            // TODO: 실제 파일 작업 로직 구현
            // 현재는 성공으로 처리
            await new Promise(resolve => setTimeout(resolve, 1000)); // 시뮬레이션
            
            return {
                success: true,
                message: '파일 작업 완료',
                output: '파일 작업이 완료되었습니다.'
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
                success: false,
                message: `파일 작업 실패: ${errorMessage}`,
                error: errorMessage
            };
        }
    }

    /**
     * 터미널 명령 액션을 실행합니다.
     * @param step 액션 단계
     * @param context 실행 컨텍스트
     * @returns 실행 결과
     */
    private async executeTerminalCommand(step: ActionStep, context: ExecutionContext): Promise<ExecutionResult> {
        console.log(`[ActionExecutionEngine] 터미널 명령 실행: ${step.command}`);
        
        if (!step.command) {
            return {
                success: false,
                message: '실행할 명령이 없습니다.',
                error: 'Missing command'
            };
        }

        try {
            // 터미널 모니터링 시작
            context.terminalMonitor.startMonitoring();
            
            // 캡처 기반 명령 실행으로 stdout/stderr를 모니터에 주입
            const result = await runCommandCapture(
                step.command,
                { cwd: context.plan.context.projectRoot, shell: true },
                chunk => context.terminalMonitor.ingestExternalOutput('process:stdout', chunk),
                chunk => context.terminalMonitor.ingestExternalOutput('process:stderr', chunk),
            );
            
            // 에러 패턴 확인
            const hasErrors = context.terminalMonitor.checkForSpecificErrors(step.errorPatterns || []);
            
            if (hasErrors || result.code !== 0) {
                return {
                    success: false,
                    message: '터미널 명령 실행 중 에러가 발생했습니다.',
                    error: result.stderr || 'Terminal command execution failed with errors',
                    output: result.stdout
                };
            }
            
            return {
                success: true,
                message: '터미널 명령 실행 완료',
                output: result.stdout || `명령 '${step.command}'이 성공적으로 실행되었습니다.`
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
                success: false,
                message: `터미널 명령 실행 실패: ${errorMessage}`,
                error: errorMessage
            };
        } finally {
            context.terminalMonitor.stopMonitoring();
        }
    }

    /**
     * 검증 액션을 실행합니다.
     * @param step 액션 단계
     * @param context 실행 컨텍스트
     * @returns 실행 결과
     */
    private async executeVerification(step: ActionStep, context: ExecutionContext): Promise<ExecutionResult> {
        console.log(`[ActionExecutionEngine] 검증 실행: ${step.description}`);
        
        try {
            // 터미널/콘솔 로그에서 에러 확인
            const hasErrors = context.terminalMonitor.checkForSpecificErrors(step.errorPatterns || []);
            
            if (hasErrors) {
                return {
                    success: false,
                    message: '검증 중 에러가 발견되었습니다.',
                    error: 'Verification failed due to errors in logs'
                };
            }
            
            return {
                success: true,
                message: '검증 완료',
                output: '모든 검증이 통과했습니다.'
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
                success: false,
                message: `검증 실패: ${errorMessage}`,
                error: errorMessage
            };
        }
    }

    /**
     * 재계획이 필요한지 확인합니다.
     * @param result 실행 결과
     * @param context 실행 컨텍스트
     * @returns 재계획 필요 여부
     */
    private shouldReplan(result: ExecutionResult, context: ExecutionContext): boolean {
        // 에러가 발생했고, 치명적이거나 높은 심각도인 경우
        if (result.error) {
            const criticalPatterns = ['Fatal error:', 'Critical error:', 'Build failed:', 'Compilation failed:'];
            const hasCriticalError = criticalPatterns.some(pattern => 
                result.error?.includes(pattern) || result.message.includes(pattern)
            );
            
            if (hasCriticalError) {
                console.log(`[ActionExecutionEngine] 치명적 에러로 인한 재계획 필요: ${result.error}`);
                return true;
            }
        }
        
        // 터미널에서 에러가 감지된 경우
        const hasTerminalErrors = context.terminalMonitor.checkForSpecificErrors(['Error:', 'Failed:', 'Exception:']);
        if (hasTerminalErrors) {
            console.log(`[ActionExecutionEngine] 터미널 에러로 인한 재계획 필요`);
            return true;
        }
        
        return false;
    }

    /**
     * 활성 실행 컨텍스트를 가져옵니다.
     * @param planId 플랜 ID
     * @returns 실행 컨텍스트
     */
    public getActiveContext(planId: string): ExecutionContext | undefined {
        return this.activeExecutions.get(planId);
    }

    /**
     * 모든 활성 실행을 가져옵니다.
     * @returns 활성 실행 컨텍스트 배열
     */
    public getAllActiveExecutions(): ExecutionContext[] {
        return Array.from(this.activeExecutions.values());
    }

    /**
     * 실행을 중지합니다.
     * @param planId 플랜 ID
     */
    public stopExecution(planId: string): void {
        const context = this.activeExecutions.get(planId);
        if (context) {
            context.terminalMonitor.stopMonitoring();
            this.activeExecutions.delete(planId);
            console.log(`[ActionExecutionEngine] 실행 중지: ${planId}`);
        }
    }
}
