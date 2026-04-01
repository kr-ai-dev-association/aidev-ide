/**
 * Agent State Manager (경량 FSM)
 * 에이전트의 상태 관리 및 전환 규칙을 정의합니다.
 */

import { Tool } from '../../tools/types';
import { ToolRegistry } from '../../tools/ToolRegistry';

/**
 * 에이전트 상태
 */
export enum AgentPhase {
    INVESTIGATION = 'investigation',
    EXECUTION = 'execution',
    REVIEW = 'review',
    DONE = 'done'
}

/**
 * 상태별 허용 도구 정의
 */
const ALLOWED_TOOLS: Record<AgentPhase, Tool[]> = {
    [AgentPhase.INVESTIGATION]: [
        Tool.READ_FILE,
        Tool.LIST_FILES,
        Tool.RIPGREP_SEARCH,
        Tool.LIST_IMPORTS,
        Tool.STAT_FILE,

        Tool.READ_ACTIVE_FILE,
        Tool.FETCH_URL,
        Tool.LSP,
        Tool.LIST_CODE_DEFINITIONS,
        Tool.GLOB_SEARCH,

        Tool.MEMORY_SAVE,
        Tool.MEMORY_DELETE,
        Tool.ASK_QUESTION,
    ],
    [AgentPhase.EXECUTION]: [
        Tool.CREATE_FILE,
        Tool.UPDATE_FILE,
        Tool.REMOVE_FILE,
        Tool.READ_FILE,
        Tool.LIST_FILES,
        Tool.RIPGREP_SEARCH,
        Tool.RUN_COMMAND,
        Tool.LIST_IMPORTS,
        Tool.STAT_FILE,

        Tool.READ_ACTIVE_FILE,
        Tool.FETCH_URL,
        Tool.LSP,
        Tool.LIST_CODE_DEFINITIONS,
        Tool.GLOB_SEARCH,

        Tool.MEMORY_SAVE,
        Tool.MEMORY_DELETE,
        Tool.ASK_QUESTION,
    ],
    [AgentPhase.REVIEW]: [], // REVIEW 단계에서는 도구 사용 불가 (시스템이 요약 생성)
    [AgentPhase.DONE]: [] // DONE 단계에서는 도구 사용 불가
};

/**
 * 상태별 금지 도구 정의
 */
const FORBIDDEN_TOOLS: Record<AgentPhase, Tool[]> = {
    [AgentPhase.INVESTIGATION]: [
        Tool.CREATE_FILE,
        Tool.UPDATE_FILE,
        Tool.REMOVE_FILE,
        // Tool.READ_FILE, Tool.LIST_FILES, Tool.RIPGREP_SEARCH는 허용 (조사 행위, 부작용 없음)
        Tool.RUN_COMMAND
    ], // Investigation에서는 조사 도구만 허용, 실행 도구 금지
    [AgentPhase.EXECUTION]: [], // EXECUTION에서는 모든 도구 허용
    [AgentPhase.REVIEW]: [
        Tool.CREATE_FILE,
        Tool.UPDATE_FILE,
        Tool.REMOVE_FILE,
        Tool.READ_FILE,
        Tool.LIST_FILES,
        Tool.RIPGREP_SEARCH,
        Tool.RUN_COMMAND,
        Tool.LIST_IMPORTS,
        Tool.STAT_FILE,

        Tool.READ_ACTIVE_FILE,
        Tool.FETCH_URL,
        Tool.LSP,
        Tool.LIST_CODE_DEFINITIONS,
        Tool.GLOB_SEARCH,
    ], // REVIEW에서는 모든 도구 금지
    [AgentPhase.DONE]: [
        Tool.CREATE_FILE,
        Tool.UPDATE_FILE,
        Tool.REMOVE_FILE,
        Tool.READ_FILE,
        Tool.LIST_FILES,
        Tool.RIPGREP_SEARCH,
        Tool.RUN_COMMAND,
        Tool.LIST_IMPORTS,
        Tool.STAT_FILE,

        Tool.READ_ACTIVE_FILE,
        Tool.FETCH_URL,
        Tool.LSP,
        Tool.LIST_CODE_DEFINITIONS,
        Tool.GLOB_SEARCH,
    ] // DONE에서는 모든 도구 금지
};

/**
 * 상태 전환 규칙
 */
const VALID_TRANSITIONS: Record<AgentPhase, AgentPhase[]> = {
    [AgentPhase.INVESTIGATION]: [AgentPhase.EXECUTION, AgentPhase.DONE], // EXECUTION 또는 DONE (파일 미존재 등 즉시 종료 케이스)
    [AgentPhase.EXECUTION]: [AgentPhase.REVIEW], // EXECUTION 완료 시 REVIEW로 전환
    [AgentPhase.REVIEW]: [AgentPhase.DONE, AgentPhase.EXECUTION], // REVIEW 완료 시 DONE, 또는 미완료 시 EXECUTION으로 복귀
    [AgentPhase.DONE]: [] // DONE에서는 전환 불가 (최종 상태)
};

/**
 * Output Contract: 각 상태에서 허용/금지된 출력
 */
interface OutputContract {
    allowPlan: boolean;
    allowToolCalls: boolean;
    allowTextOnly: boolean;
    requiredBeforeTransition?: {
        to: AgentPhase;
        condition: (context: any) => boolean;
    };
}

const OUTPUT_CONTRACTS: Record<AgentPhase, OutputContract> = {
    [AgentPhase.INVESTIGATION]: {
        allowPlan: true,
        allowToolCalls: true, // Investigation에서는 조사 도구 호출 허용
        allowTextOnly: true, // nudge 등을 위해 허용 (의도 없을 때만)
        requiredBeforeTransition: {
            to: AgentPhase.EXECUTION,
            condition: (context: any) => {
                // EXECUTION으로 전환 조건:
                // 1. plan이 있으면 전환 가능 (계획 수립 완료)
                // 2. 실행 도구가 나왔으면 전환 가능 (실행 의도가 명확함)
                //
                // 🔥 개선: 실행 도구 자체가 "실행 의도"의 증거이므로 plan 없이도 전환 허용
                // - 단순 작업에서 LLM이 바로 create_file/update_file을 호출하는 경우
                // - 불필요한 plan 수립 강요로 인한 턴 낭비 방지
                const hasPlan = context.hasPlan || false;
                const hasToolCalls = context.toolCallsInTurn && context.toolCallsInTurn.length > 0;

                // plan이 있거나 실행 도구가 있으면 전환 가능
                return hasPlan || hasToolCalls;
            }
        }
    },
    [AgentPhase.EXECUTION]: {
        allowPlan: false, // EXECUTION에서는 새로운 plan 생성 금지
        allowToolCalls: true,
        allowTextOnly: false // EXECUTION에서는 텍스트만 출력 금지 (도구 호출 필수)
    },
    [AgentPhase.REVIEW]: {
        allowPlan: false,
        allowToolCalls: false, // REVIEW에서는 도구 호출 금지
        allowTextOnly: false // REVIEW는 시스템이 자동으로 처리하므로 LLM 응답 불필요
    },
    [AgentPhase.DONE]: {
        allowPlan: false,
        allowToolCalls: false,
        allowTextOnly: false // DONE은 최종 상태이므로 LLM 응답 불필요
    }
};

/**
 * 상태 전환 기록
 */
export interface StateTransitionRecord {
    from: AgentPhase;
    to: AgentPhase;
    timestamp: number;
    success: boolean;
    reason?: string;
    context?: any;
}

/**
 * FSM 검증 결과
 */
export interface FSMValidationResult {
    valid: boolean;
    issues: string[];
    transitionHistory: StateTransitionRecord[];
}

/**
 * 전환 실패 시 복구 전략
 * v9.6.0: Phase 2-5 상태 관리 일관성 강화
 */
export interface RecoveryStrategy {
    action: 'retry' | 'skip' | 'force_transition' | 'abort';
    targetState?: AgentPhase;
    message: string;
    recommendation: string;
}

/**
 * 상태별 복구 전략 매핑
 */
const RECOVERY_STRATEGIES: Record<AgentPhase, Record<string, RecoveryStrategy>> = {
    [AgentPhase.INVESTIGATION]: {
        'no_plan': {
            action: 'retry',
            message: 'Plan이 없어 EXECUTION으로 전환할 수 없습니다',
            recommendation: 'LLM에게 plan JSON 생성을 재요청하거나, 조사 도구 호출을 유도하세요'
        },
        'loop_detected': {
            action: 'force_transition',
            targetState: AgentPhase.DONE,
            message: 'Investigation 단계에서 무한 루프 감지',
            recommendation: '조사가 진전되지 않습니다. 현재까지의 정보로 작업을 종료합니다'
        },
        'stale_state': {
            action: 'abort',
            targetState: AgentPhase.DONE,
            message: 'Investigation 단계에서 5분 이상 진전 없음',
            recommendation: '작업을 종료하고 사용자에게 상황을 알립니다'
        }
    },
    [AgentPhase.EXECUTION]: {
        'text_only': {
            action: 'retry',
            message: 'EXECUTION 단계에서 도구 호출 없이 텍스트만 출력',
            recommendation: 'LLM에게 도구 호출을 강제하는 프롬프트를 추가하세요'
        },
        'loop_detected': {
            action: 'force_transition',
            targetState: AgentPhase.REVIEW,
            message: 'Execution 단계에서 무한 루프 감지',
            recommendation: '현재까지의 작업을 정리하고 REVIEW로 전환합니다'
        }
    },
    [AgentPhase.REVIEW]: {
        'incomplete': {
            action: 'force_transition',
            targetState: AgentPhase.EXECUTION,
            message: 'Review에서 미완료 작업 발견',
            recommendation: 'EXECUTION으로 복귀하여 나머지 작업을 완료합니다'
        }
    },
    [AgentPhase.DONE]: {}
};

/**
 * Agent State Manager (경량 FSM)
 * - 상태 전환 검증 및 히스토리 추적
 * - 잘못된 전환 시도 감지
 * - 상태 복원 기능
 */
export class AgentStateManager {
    private currentState: AgentPhase;
    private transitionHistory: StateTransitionRecord[] = [];
    private static readonly MAX_HISTORY_SIZE = 50;
    private static readonly MAX_SAME_TRANSITION_COUNT = 5; // 동일 전환 반복 제한

    constructor(initialState: AgentPhase = AgentPhase.INVESTIGATION) {
        this.currentState = initialState;
        // 초기 상태 기록
        this.transitionHistory.push({
            from: initialState,
            to: initialState,
            timestamp: Date.now(),
            success: true,
            reason: 'Initial state'
        });
    }

    /**
     * 현재 상태 반환
     */
    getCurrentState(): AgentPhase {
        return this.currentState;
    }

    /**
     * 상태 전환 (검증 포함)
     * - 전환 규칙 검증
     * - 반복 전환 감지
     * - 전환 히스토리 기록
     */
    transitionTo(newState: AgentPhase, context?: any): { success: boolean; reason?: string } {
        const oldState = this.currentState;

        // 같은 상태로의 전환은 허용 (히스토리에 기록하지 않음)
        if (this.currentState === newState) {
            return { success: true };
        }

        // 전환 규칙 검증
        const allowedTransitions = VALID_TRANSITIONS[this.currentState];
        if (!allowedTransitions.includes(newState)) {
            const reason = `Invalid transition: ${this.currentState} → ${newState}. Allowed transitions: ${allowedTransitions.join(', ') || 'none'}`;
            this.recordTransition(oldState, newState, false, reason, context);
            console.warn(`[AgentStateManager] ${reason}`);
            return { success: false, reason };
        }

        // 동일 전환 반복 감지 (무한 루프 방지)
        const sameTransitionCount = this.countRecentSameTransitions(oldState, newState);
        if (sameTransitionCount >= AgentStateManager.MAX_SAME_TRANSITION_COUNT) {
            const reason = `Transition loop detected: ${oldState} → ${newState} repeated ${sameTransitionCount} times`;
            this.recordTransition(oldState, newState, false, reason, context);
            console.error(`[AgentStateManager] ${reason}`);
            return { success: false, reason };
        }

        // Output Contract 검증 (전환 전 조건 확인)
        const contract = OUTPUT_CONTRACTS[this.currentState];
        if (contract.requiredBeforeTransition && contract.requiredBeforeTransition.to === newState) {
            if (!contract.requiredBeforeTransition.condition(context || {})) {
                const reason = `Transition condition not met: Plan must exist and investigation must be completed (tool calls or investigation history required)`;
                this.recordTransition(oldState, newState, false, reason, context);
                console.warn(`[AgentStateManager] ${reason}`);
                return { success: false, reason };
            }
        }

        // 전환 실행
        this.currentState = newState;
        this.recordTransition(oldState, newState, true, undefined, context);
        console.log(`[AgentStateManager] State transition: ${oldState} → ${newState}`);
        return { success: true };
    }

    /**
     * 전환 히스토리 기록
     */
    private recordTransition(
        from: AgentPhase,
        to: AgentPhase,
        success: boolean,
        reason?: string,
        context?: any
    ): void {
        this.transitionHistory.push({
            from,
            to,
            timestamp: Date.now(),
            success,
            reason,
            context: context ? { ...context } : undefined
        });

        // 히스토리 크기 제한
        if (this.transitionHistory.length > AgentStateManager.MAX_HISTORY_SIZE) {
            this.transitionHistory = this.transitionHistory.slice(-AgentStateManager.MAX_HISTORY_SIZE);
        }
    }

    /**
     * 최근 동일 전환 횟수 계산
     */
    private countRecentSameTransitions(from: AgentPhase, to: AgentPhase): number {
        let count = 0;
        // 최근 10개의 전환만 확인
        const recentHistory = this.transitionHistory.slice(-10);
        for (const record of recentHistory) {
            if (record.from === from && record.to === to && record.success) {
                count++;
            }
        }
        return count;
    }

    /**
     * 도구가 현재 상태에서 허용되는지 확인
     * 빌트인 도구는 allowed/forbidden 리스트로 검증
     * MCP 동적 도구는 INVESTIGATION/EXECUTION 상태에서 허용
     */
    isToolAllowed(toolName: string): boolean {
        const allowed = ALLOWED_TOOLS[this.currentState];
        const forbidden = FORBIDDEN_TOOLS[this.currentState];

        // 금지 목록에 있으면 차단
        if (forbidden.includes(toolName as Tool)) {
            return false;
        }

        // 빌트인 도구: 허용 목록에 있으면 허용
        if (Object.values(Tool).includes(toolName as Tool)) {
            return allowed.includes(toolName as Tool);
        }

        // MCP 등 동적 등록 도구: INVESTIGATION/EXECUTION에서 허용
        if (ToolRegistry.getInstance().isMCPTool(toolName)) {
            return this.currentState === AgentPhase.INVESTIGATION
                || this.currentState === AgentPhase.EXECUTION;
        }

        // 알 수 없는 도구는 차단
        return false;
    }

    /**
     * 현재 상태에서 허용되는 도구 목록 반환
     */
    getAllowedTools(): Tool[] {
        return [...ALLOWED_TOOLS[this.currentState]];
    }

    /**
     * 현재 상태에서 금지된 도구 목록 반환
     */
    getForbiddenTools(): Tool[] {
        return [...FORBIDDEN_TOOLS[this.currentState]];
    }

    /**
     * Output Contract 검증
     */
    validateOutput(response: {
        hasPlan?: boolean;
        hasToolCalls?: boolean;
        toolCalls?: any[];
        hasTextOnly?: boolean;
    }): { valid: boolean; reason?: string } {
        const contract = OUTPUT_CONTRACTS[this.currentState];

        // Plan 검증
        if (response.hasPlan && !contract.allowPlan) {
            return {
                valid: false,
                reason: `Plan tag is not allowed in ${this.currentState} phase`
            };
        }

        // Tool Calls 검증
        if (response.hasToolCalls && !contract.allowToolCalls) {
            return {
                valid: false,
                reason: `Tool calls are not allowed in ${this.currentState} phase`
            };
        }

        // Text Only 검증
        if (response.hasTextOnly && !contract.allowTextOnly) {
            return {
                valid: false,
                reason: `Text-only responses are not allowed in ${this.currentState} phase`
            };
        }

        // 도구별 검증 (금지된 도구 사용 확인)
        if (response.toolCalls) {
            for (const toolCall of response.toolCalls) {
                if (!this.isToolAllowed(toolCall.name)) {
                    return {
                        valid: false,
                        reason: `Tool ${toolCall.name} is forbidden in ${this.currentState} phase`
                    };
                }
            }
        }

        return { valid: true };
    }

    /**
     * 상태별 설명 반환
     */
    getStateDescription(): string {
        const descriptions: Record<AgentPhase, string> = {
            [AgentPhase.INVESTIGATION]: '조사(Investigation) 단계: 정보 수집 및 계획 수립',
            [AgentPhase.EXECUTION]: '실행(Execution) 단계: 계획에 따른 작업 수행',
            [AgentPhase.REVIEW]: '검토(Review) 단계: 작업 결과 요약 및 검증',
            [AgentPhase.DONE]: '완료(Done) 단계: 모든 작업 완료'
        };
        return descriptions[this.currentState];
    }

    // ─── 상태 히스토리 및 복원 ───

    /**
     * 전환 히스토리 조회
     */
    getTransitionHistory(): StateTransitionRecord[] {
        return [...this.transitionHistory];
    }

    /**
     * 실패한 전환 시도 조회
     */
    getFailedTransitions(): StateTransitionRecord[] {
        return this.transitionHistory.filter(r => !r.success);
    }

    /**
     * FSM 상태 검증 (무결성 체크)
     */
    validateFSMState(): FSMValidationResult {
        const issues: string[] = [];

        // 1. 현재 상태가 유효한지 확인
        if (!Object.values(AgentPhase).includes(this.currentState)) {
            issues.push(`Invalid current state: ${this.currentState}`);
        }

        // 2. 연속 실패 전환 감지
        const recentFailures = this.transitionHistory
            .slice(-5)
            .filter(r => !r.success);
        if (recentFailures.length >= 3) {
            issues.push(`Multiple consecutive transition failures detected: ${recentFailures.length} in last 5 attempts`);
        }

        // 3. 전환 루프 감지
        const loopDetected = this.detectTransitionLoop();
        if (loopDetected) {
            issues.push(`Transition loop detected: ${loopDetected}`);
        }

        // 4. 비정상적으로 오래된 상태 감지 (INVESTIGATION에서 너무 오래 머무름)
        const lastTransition = this.transitionHistory[this.transitionHistory.length - 1];
        if (lastTransition && this.currentState === AgentPhase.INVESTIGATION) {
            const staleThreshold = 5 * 60 * 1000; // 5분
            if (Date.now() - lastTransition.timestamp > staleThreshold) {
                issues.push(`State appears stale: stuck in ${this.currentState} for over 5 minutes`);
            }
        }

        return {
            valid: issues.length === 0,
            issues,
            transitionHistory: this.getTransitionHistory()
        };
    }

    /**
     * 전환 루프 감지
     */
    private detectTransitionLoop(): string | null {
        if (this.transitionHistory.length < 4) {
            return null;
        }

        // 최근 10개 전환에서 패턴 감지
        const recent = this.transitionHistory.slice(-10);
        const transitionCounts = new Map<string, number>();

        for (const record of recent) {
            if (record.success) {
                const key = `${record.from}->${record.to}`;
                transitionCounts.set(key, (transitionCounts.get(key) || 0) + 1);
            }
        }

        for (const [transition, count] of transitionCounts) {
            if (count >= 3) {
                return `${transition} occurred ${count} times`;
            }
        }

        return null;
    }

    /**
     * 상태 강제 리셋 (긴급 복구용)
     * 주의: 정상적인 상황에서는 사용하지 않음
     */
    forceReset(targetState: AgentPhase = AgentPhase.INVESTIGATION): void {
        console.warn(`[AgentStateManager] Force reset: ${this.currentState} → ${targetState}`);
        this.recordTransition(this.currentState, targetState, true, 'Force reset');
        this.currentState = targetState;
    }

    /**
     * 히스토리 초기화
     */
    clearHistory(): void {
        this.transitionHistory = [{
            from: this.currentState,
            to: this.currentState,
            timestamp: Date.now(),
            success: true,
            reason: 'History cleared'
        }];
    }

    /**
     * 디버그 정보 출력
     */
    getDebugInfo(): string {
        const validation = this.validateFSMState();
        const failedCount = this.getFailedTransitions().length;
        const totalCount = this.transitionHistory.length;

        return `[FSM Debug]
  Current State: ${this.currentState}
  Total Transitions: ${totalCount}
  Failed Transitions: ${failedCount}
  Valid: ${validation.valid}
  Issues: ${validation.issues.length > 0 ? validation.issues.join(', ') : 'none'}`;
    }

    // ─── 복구 전략 (v9.6.0) ───

    /**
     * 현재 상태에서 발생한 문제에 대한 복구 전략 조회
     * @param issueType 문제 유형 ('no_plan', 'loop_detected', 'text_only' 등)
     */
    getRecoveryStrategy(issueType: string): RecoveryStrategy | null {
        const strategies = RECOVERY_STRATEGIES[this.currentState];
        return strategies[issueType] || null;
    }

    /**
     * FSM 검증 결과를 기반으로 자동 복구 시도
     * @returns 복구 성공 여부와 수행된 액션
     */
    attemptAutoRecovery(): { recovered: boolean; action?: string; message?: string } {
        const validation = this.validateFSMState();

        if (validation.valid) {
            return { recovered: true, message: 'FSM 상태 정상' };
        }

        // 문제별 복구 시도
        for (const issue of validation.issues) {
            // 루프 감지
            if (issue.includes('loop detected')) {
                const strategy = this.getRecoveryStrategy('loop_detected');
                if (strategy && strategy.action === 'force_transition' && strategy.targetState) {
                    console.warn(`[AgentStateManager] Auto-recovery: ${strategy.message}`);
                    this.forceReset(strategy.targetState);
                    return {
                        recovered: true,
                        action: 'force_transition',
                        message: strategy.recommendation
                    };
                }
            }

            // 오래된 상태
            if (issue.includes('stale')) {
                const strategy = this.getRecoveryStrategy('stale_state');
                if (strategy && strategy.action === 'abort' && strategy.targetState) {
                    console.warn(`[AgentStateManager] Auto-recovery: ${strategy.message}`);
                    this.forceReset(strategy.targetState);
                    return {
                        recovered: true,
                        action: 'abort',
                        message: strategy.recommendation
                    };
                }
            }
        }

        return { recovered: false, message: '자동 복구 실패' };
    }

    /**
     * 전환 실패 시 권고 사항 반환
     */
    getTransitionFailureAdvice(targetState: AgentPhase, reason: string): string {
        const fromState = this.currentState;

        // INVESTIGATION → EXECUTION 실패
        if (fromState === AgentPhase.INVESTIGATION && targetState === AgentPhase.EXECUTION) {
            if (reason.includes('Plan must exist') || reason.includes('condition not met')) {
                return '조사 단계에서 plan JSON을 생성하거나 실행 도구를 호출해야 합니다. ' +
                       'LLM 프롬프트에 plan 생성 또는 도구 호출을 명시적으로 요청하세요.';
            }
        }

        // 잘못된 전환 시도
        if (reason.includes('Invalid transition')) {
            const allowed = VALID_TRANSITIONS[fromState];
            return `현재 상태 ${fromState}에서는 ${allowed.join(' 또는 ')}으로만 전환 가능합니다. ` +
                   `${targetState}로의 전환은 허용되지 않습니다.`;
        }

        // 루프 감지
        if (reason.includes('loop detected')) {
            return '동일한 전환이 반복되고 있습니다. 무한 루프 방지를 위해 전환이 차단되었습니다. ' +
                   'forceReset()을 사용하거나 작업을 종료하세요.';
        }

        return `전환 실패: ${reason}. 현재 상태: ${fromState}`;
    }
}

