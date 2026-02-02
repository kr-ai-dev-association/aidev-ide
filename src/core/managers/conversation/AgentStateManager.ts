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
        Tool.SEARCH_FILES,
        Tool.RIPGREP_SEARCH
    ], // Investigation에서는 조사 도구 허용 (파일 수정 없음, 조사 행위)
    [AgentPhase.EXECUTION]: [
        Tool.CREATE_FILE,
        Tool.UPDATE_FILE,
        Tool.REMOVE_FILE,
        Tool.READ_FILE,
        Tool.LIST_FILES,
        Tool.SEARCH_FILES,
        Tool.RIPGREP_SEARCH,
        Tool.RUN_COMMAND
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
        // Tool.READ_FILE, Tool.LIST_FILES, Tool.SEARCH_FILES, Tool.RIPGREP_SEARCH는 허용 (조사 행위, 부작용 없음)
        Tool.RUN_COMMAND
    ], // Investigation에서는 조사 도구만 허용, 실행 도구 금지
    [AgentPhase.EXECUTION]: [], // EXECUTION에서는 모든 도구 허용
    [AgentPhase.REVIEW]: [
        Tool.CREATE_FILE,
        Tool.UPDATE_FILE,
        Tool.REMOVE_FILE,
        Tool.READ_FILE,
        Tool.LIST_FILES,
        Tool.SEARCH_FILES,
        Tool.RIPGREP_SEARCH,
        Tool.RUN_COMMAND
    ], // REVIEW에서는 모든 도구 금지
    [AgentPhase.DONE]: [
        Tool.CREATE_FILE,
        Tool.UPDATE_FILE,
        Tool.REMOVE_FILE,
        Tool.READ_FILE,
        Tool.LIST_FILES,
        Tool.SEARCH_FILES,
        Tool.RIPGREP_SEARCH,
        Tool.RUN_COMMAND
    ] // DONE에서는 모든 도구 금지
};

/**
 * 상태 전환 규칙
 */
const VALID_TRANSITIONS: Record<AgentPhase, AgentPhase[]> = {
    [AgentPhase.INVESTIGATION]: [AgentPhase.EXECUTION],
    [AgentPhase.EXECUTION]: [AgentPhase.REVIEW], // EXECUTION 완료 시 REVIEW로 전환
    [AgentPhase.REVIEW]: [AgentPhase.DONE], // REVIEW 완료 시 DONE으로 전환
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
 * Agent State Manager (경량 FSM)
 */
export class AgentStateManager {
    private currentState: AgentPhase;

    constructor(initialState: AgentPhase = AgentPhase.INVESTIGATION) {
        this.currentState = initialState;
    }

    /**
     * 현재 상태 반환
     */
    getCurrentState(): AgentPhase {
        return this.currentState;
    }

    /**
     * 상태 전환 (검증 포함)
     */
    transitionTo(newState: AgentPhase, context?: any): { success: boolean; reason?: string } {
        // 같은 상태로의 전환은 허용
        if (this.currentState === newState) {
            return { success: true };
        }

        // 전환 규칙 검증
        const allowedTransitions = VALID_TRANSITIONS[this.currentState];
        if (!allowedTransitions.includes(newState)) {
            return {
                success: false,
                reason: `Invalid transition: ${this.currentState} → ${newState}. Allowed transitions: ${allowedTransitions.join(', ')}`
            };
        }

        // Output Contract 검증 (전환 전 조건 확인)
        const contract = OUTPUT_CONTRACTS[this.currentState];
        if (contract.requiredBeforeTransition && contract.requiredBeforeTransition.to === newState) {
            if (!contract.requiredBeforeTransition.condition(context || {})) {
                return {
                    success: false,
                    reason: `Transition condition not met: Plan must exist and investigation must be completed (tool calls or investigation history required)`
                };
            }
        }

        // 전환 실행
        this.currentState = newState;
        return { success: true };
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
}

