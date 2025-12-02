/**
 * Action Manager
 * LLM 요청을 실행 가능한 액션으로 변환하고 관리하는 메인 매니저
 */

import {
    Action,
    ActionType,
    ActionResult,
    LLMRequest,
    LLMResponse,
    ActionContext,
    ActionMappingResult,
    ValidationResult,
    Permission
} from './types';
import { ActionRegistry } from './ActionRegistry';
import { ActionValidator } from './ActionValidator';
import { ActionMapper } from './ActionMapper';

export class ActionManager {
    private static instance: ActionManager;
    private registry: ActionRegistry;
    private validator: ActionValidator;
    private mapper: ActionMapper;
    private context?: ActionContext;
    private activeActions: Map<string, Action> = new Map();

    private constructor() {
        this.registry = ActionRegistry.getInstance();
        this.validator = new ActionValidator();
        this.mapper = new ActionMapper();
    }

    public static getInstance(): ActionManager {
        if (!ActionManager.instance) {
            ActionManager.instance = new ActionManager();
        }
        return ActionManager.instance;
    }

    /**
     * 액션 컨텍스트를 설정합니다
     */
    public setContext(context: ActionContext): void {
        this.context = context;
        console.log('[ActionManager] Context set:', {
            projectRoot: context.projectRoot,
            currentFile: context.currentFile
        });
    }

    /**
     * 현재 컨텍스트를 가져옵니다
     */
    public getContext(): ActionContext | undefined {
        return this.context;
    }

    /**
     * LLM 요청을 분석하여 액션으로 매핑합니다
     */
    public async mapRequest(llmRequest: LLMRequest): Promise<ActionMappingResult> {
        console.log('[ActionManager] Mapping LLM request to actions');
        console.log('[ActionManager] Query:', llmRequest.query.substring(0, 100) + '...');

        try {
            // LLM 응답이 직접 전달된 경우 (이미 처리된 응답)
            const llmResponse: LLMResponse = {
                content: llmRequest.query,
                actions: undefined,
                explanation: undefined
            };

            // 액션 매핑
            const mappingResult = this.mapper.mapResponse(llmResponse);

            // 컨텍스트 주입
            this.injectContext(mappingResult.actions);

            console.log(`[ActionManager] Mapped ${mappingResult.actions.length} actions`);
            
            return mappingResult;
        } catch (error) {
            console.error('[ActionManager] Error mapping request:', error);
            throw error;
        }
    }

    /**
     * LLM 응답을 액션으로 매핑합니다
     */
    public async mapResponse(llmResponse: LLMResponse): Promise<ActionMappingResult> {
        console.log('[ActionManager] Mapping LLM response to actions');

        try {
            const mappingResult = this.mapper.mapResponse(llmResponse);
            this.injectContext(mappingResult.actions);

            console.log(`[ActionManager] Mapped ${mappingResult.actions.length} actions`);
            
            return mappingResult;
        } catch (error) {
            console.error('[ActionManager] Error mapping response:', error);
            throw error;
        }
    }

    /**
     * 액션을 검증합니다
     */
    public async validateAction(action: Action): Promise<ValidationResult> {
        console.log(`[ActionManager] Validating action: ${action.id} (${action.type})`);

        try {
            // 등록된 액션 정의 가져오기
            const definition = this.registry.get(action.type);
            if (!definition) {
                return {
                    valid: false,
                    errors: [{
                        field: 'type',
                        message: `Action type "${action.type}" is not registered`,
                        code: 'UNREGISTERED_TYPE'
                    }]
                };
            }

            // 검증 실행
            const result = this.validator.validate(action, definition.validation);

            if (!result.valid) {
                console.warn(`[ActionManager] Validation failed for action ${action.id}:`, result.errors);
            } else {
                console.log(`[ActionManager] Validation passed for action ${action.id}`);
            }

            return result;
        } catch (error) {
            console.error('[ActionManager] Error validating action:', error);
            return {
                valid: false,
                errors: [{
                    field: 'unknown',
                    message: error instanceof Error ? error.message : String(error),
                    code: 'VALIDATION_ERROR'
                }]
            };
        }
    }

    /**
     * 액션 배열의 의존성을 검증합니다
     */
    public validateDependencies(actions: Action[]): ValidationResult {
        console.log(`[ActionManager] Validating dependencies for ${actions.length} actions`);
        return this.validator.validateDependencies(actions);
    }

    /**
     * 액션을 실행합니다
     * 실제 실행은 Execution Manager에 위임됩니다
     */
    public async executeAction(action: Action): Promise<ActionResult> {
        console.log(`[ActionManager] Executing action: ${action.id} (${action.type})`);

        try {
            // 검증
            const validationResult = await this.validateAction(action);
            if (!validationResult.valid) {
                return {
                    success: false,
                    actionId: action.id,
                    message: 'Validation failed',
                    error: {
                        code: 'VALIDATION_FAILED',
                        message: validationResult.errors.map(e => e.message).join(', '),
                        details: validationResult.errors
                    }
                };
            }

            // 권한 체크
            const permissionResult = this.checkPermissions(action);
            if (!permissionResult.allowed) {
                return {
                    success: false,
                    actionId: action.id,
                    message: 'Permission denied',
                    error: {
                        code: 'PERMISSION_DENIED',
                        message: permissionResult.message || 'Required permissions not granted'
                    }
                };
            }

            // 액션을 활성 목록에 추가
            this.activeActions.set(action.id, action);

            // 핸들러 실행
            const definition = this.registry.get(action.type);
            if (!definition) {
                throw new Error(`No definition found for action type: ${action.type}`);
            }

            const startTime = Date.now();
            const result = await definition.handler(action);
            const duration = Date.now() - startTime;

            // 활성 목록에서 제거
            this.activeActions.delete(action.id);

            console.log(`[ActionManager] Action ${action.id} completed in ${duration}ms`);

            return {
                ...result,
                duration
            };

        } catch (error) {
            this.activeActions.delete(action.id);
            console.error(`[ActionManager] Error executing action ${action.id}:`, error);
            
            return {
                success: false,
                actionId: action.id,
                message: 'Execution failed',
                error: {
                    code: 'EXECUTION_ERROR',
                    message: error instanceof Error ? error.message : String(error),
                    stack: error instanceof Error ? error.stack : undefined
                }
            };
        }
    }

    /**
     * 여러 액션을 순차적으로 실행합니다
     */
    public async executeActions(actions: Action[]): Promise<ActionResult[]> {
        console.log(`[ActionManager] Executing ${actions.length} actions sequentially`);

        // 의존성 검증
        const depValidation = this.validateDependencies(actions);
        if (!depValidation.valid) {
            console.error('[ActionManager] Dependency validation failed:', depValidation.errors);
            return [{
                success: false,
                actionId: 'batch',
                message: 'Dependency validation failed',
                error: {
                    code: 'DEPENDENCY_ERROR',
                    message: depValidation.errors.map(e => e.message).join(', ')
                }
            }];
        }

        const results: ActionResult[] = [];

        for (const action of actions) {
            // 의존성 확인
            if (action.dependencies && action.dependencies.length > 0) {
                const depsSucceeded = action.dependencies.every(depId => {
                    const depResult = results.find(r => r.actionId === depId);
                    return depResult && depResult.success;
                });

                if (!depsSucceeded) {
                    results.push({
                        success: false,
                        actionId: action.id,
                        message: 'Dependencies failed',
                        error: {
                            code: 'DEPENDENCY_FAILED',
                            message: 'One or more dependencies failed to execute'
                        }
                    });
                    continue;
                }
            }

            // 액션 실행
            const result = await this.executeAction(action);
            results.push(result);

            // 실패 시 중단 여부 (옵션으로 나중에 추가 가능)
            if (!result.success) {
                console.warn(`[ActionManager] Action ${action.id} failed, continuing...`);
            }
        }

        const successCount = results.filter(r => r.success).length;
        console.log(`[ActionManager] Batch execution complete: ${successCount}/${results.length} succeeded`);

        return results;
    }

    /**
     * 컨텍스트를 액션에 주입합니다
     */
    private injectContext(actions: Action[]): void {
        if (!this.context) {
            return;
        }

        for (const action of actions) {
            // 파일 경로가 상대 경로인 경우 프로젝트 루트 기준으로 변환
            if (action.params.filePath && !action.params.filePath.startsWith('/')) {
                action.params.filePath = `${this.context.projectRoot}/${action.params.filePath}`;
            }

            // CWD 설정
            if (!action.params.cwd) {
                action.params.cwd = this.context.workspaceRoot;
            }

            // 환경 변수 주입 (필요 시)
            if (this.context.environmentVariables) {
                // 나중에 환경 변수 처리 로직 추가 가능
            }
        }
    }

    /**
     * 권한을 체크합니다
     */
    private checkPermissions(action: Action): { allowed: boolean; message?: string } {
        // 기본적으로 모든 권한 허용 (나중에 설정에서 제어 가능)
        // 위험한 작업의 경우 사용자에게 확인 요청 필요
        
        const dangerousPermissions = [
            Permission.DELETE_FILE,
            Permission.NETWORK_ACCESS
        ];

        const hasDangerousPermission = action.permissions.some(p => 
            dangerousPermissions.includes(p)
        );

        if (hasDangerousPermission) {
            // TODO: 나중에 사용자 확인 로직 추가
            console.warn(`[ActionManager] Action ${action.id} requires dangerous permissions:`, action.permissions);
        }

        return { allowed: true };
    }

    /**
     * 활성 액션 목록을 가져옵니다
     */
    public getActiveActions(): Action[] {
        return Array.from(this.activeActions.values());
    }

    /**
     * 특정 액션을 취소합니다
     */
    public cancelAction(actionId: string): boolean {
        if (this.activeActions.has(actionId)) {
            this.activeActions.delete(actionId);
            console.log(`[ActionManager] Cancelled action: ${actionId}`);
            return true;
        }
        return false;
    }

    /**
     * 모든 활성 액션을 취소합니다
     */
    public cancelAllActions(): void {
        const count = this.activeActions.size;
        this.activeActions.clear();
        console.log(`[ActionManager] Cancelled ${count} active actions`);
    }

    /**
     * 액션 레지스트리를 가져옵니다
     */
    public getRegistry(): ActionRegistry {
        return this.registry;
    }
}

