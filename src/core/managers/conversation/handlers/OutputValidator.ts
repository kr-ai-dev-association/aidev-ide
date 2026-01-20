/**
 * Output Validator
 * LLM 응답의 출력 형식을 검증하는 핸들러
 *
 * - thinking/reasoning 누출 검사
 * - JSON Function Calling 형식 확인
 * - Phase별 허용 형식 검증
 */

import { ToolParser } from '../../../tools/ToolParser';
import { Tool } from '../../../tools/types';
import { AgentPhase } from '../AgentStateManager';
import { hasThinkingPattern } from '../../../config/ThinkingPatterns';

/**
 * 출력 형식 검증 결과
 */
export interface OutputValidationResult {
    valid: boolean;
    reason?: OutputValidationReason;
    isThinkingLeak?: boolean;
    hasAllowedFormat?: boolean;
}

/**
 * 검증 실패 사유
 */
export type OutputValidationReason =
    | 'THINKING_LEAK'
    | 'CREATE_FILE_CONTENT_MISSING'
    | 'EXECUTION_TOOL_IN_INVESTIGATION'
    | 'NO_ALLOWED_FORMAT_IN_INVESTIGATION'
    | 'THINKING_LEAK_IN_EXECUTION';

/**
 * LLM 응답 출력 형식 검증기
 */
export class OutputValidator {
    /**
     * LLM 응답의 출력 형식을 검증합니다
     * - thinking/reasoning 누출 여부
     * - Phase에 맞는 도구 사용 여부
     * - 필수 파라미터 존재 여부
     *
     * @param response LLM 원본 응답
     * @param phase 현재 에이전트 단계
     * @returns 검증 결과
     */
    public static validate(response: string, phase: AgentPhase): OutputValidationResult {
        // 1. thinking/reasoning 누출 검사 (가장 치명적)
        // 중앙화된 ThinkingPatterns 모듈 사용
        const isThinkingLeak = hasThinkingPattern(response);

        // JSON Function Calling 형식 확인
        const hasJsonFunctionCall = /\{\s*"function_call(?:s)?"\s*:/.test(response) ||
            /```json[\s\S]*?\{[\s\S]*?"function_call(?:s)?"[\s\S]*?\}[\s\S]*?```/i.test(response);
        const hasJsonPlan = /\{\s*"plan"\s*:/.test(response) ||
            /```json[\s\S]*?\{[\s\S]*?"plan"[\s\S]*?\}[\s\S]*?```/i.test(response);

        if (isThinkingLeak && !hasJsonFunctionCall && !hasJsonPlan) {
            return {
                valid: false,
                reason: 'THINKING_LEAK',
                isThinkingLeak: true,
                hasAllowedFormat: false
            };
        }

        // 2. 허용된 형식 확인 (JSON Function Calling)
        const hasAllowedFormat = hasJsonFunctionCall || hasJsonPlan;

        // 2-1. create_file 필수 파라미터(content) 누락 검증
        const validationWarnings: string[] = [];
        ToolParser.parseToolCalls(response, validationWarnings);
        const hasMissingCreateFileContent = validationWarnings.some(w => w.includes('create_file에 content가 없습니다'));
        if (hasMissingCreateFileContent) {
            return {
                valid: false,
                reason: 'CREATE_FILE_CONTENT_MISSING',
                isThinkingLeak: false,
                hasAllowedFormat: hasAllowedFormat
            };
        }

        // 3. Phase별 허용 형식 검증
        if (phase === AgentPhase.INVESTIGATION) {
            return OutputValidator.validateInvestigationPhase(response, isThinkingLeak, hasAllowedFormat);
        } else if (phase === AgentPhase.EXECUTION) {
            return OutputValidator.validateExecutionPhase(response, isThinkingLeak, hasAllowedFormat);
        }

        return { valid: true, hasAllowedFormat };
    }

    /**
     * INVESTIGATION 단계 검증
     */
    private static validateInvestigationPhase(
        response: string,
        isThinkingLeak: boolean,
        hasAllowedFormat: boolean
    ): OutputValidationResult {
        // INVESTIGATION: plan, 조사 도구만 허용 (JSON Function Calling 검증)
        const parsedToolCalls = ToolParser.parseToolCalls(response);
        const executionTools = [Tool.CREATE_FILE, Tool.UPDATE_FILE, Tool.REMOVE_FILE, Tool.RUN_COMMAND];
        const hasExecutionTool = parsedToolCalls.some(call => executionTools.includes(call.name as Tool));

        if (hasExecutionTool) {
            return {
                valid: false,
                reason: 'EXECUTION_TOOL_IN_INVESTIGATION',
                isThinkingLeak: false,
                hasAllowedFormat: hasAllowedFormat
            };
        }

        // INVESTIGATION에서 허용된 형식이 없고 텍스트만 있으면 위반
        // 단, thinking 패턴이 없는 일반 텍스트는 허용 (analysis 응답 등)
        if (!hasAllowedFormat && response.trim() && !response.trim().match(/^[\s\S]*?$/)) {
            // thinking 패턴이 포함된 경우만 위반으로 처리
            if (isThinkingLeak) {
                return {
                    valid: false,
                    reason: 'NO_ALLOWED_FORMAT_IN_INVESTIGATION',
                    isThinkingLeak: isThinkingLeak,
                    hasAllowedFormat: false
                };
            }
            // thinking 패턴이 없는 일반 텍스트는 허용
            return { valid: true, hasAllowedFormat: false };
        }

        return { valid: true, hasAllowedFormat };
    }

    /**
     * EXECUTION 단계 검증
     */
    private static validateExecutionPhase(
        response: string,
        isThinkingLeak: boolean,
        hasAllowedFormat: boolean
    ): OutputValidationResult {
        // EXECUTION: 도구 호출만 허용, 설명 금지
        // thinking/reasoning이 포함된 텍스트는 위반 (길이 무관)
        if (!hasAllowedFormat && response.trim() && isThinkingLeak) {
            return {
                valid: false,
                reason: 'THINKING_LEAK_IN_EXECUTION',
                isThinkingLeak: true,
                hasAllowedFormat: false
            };
        }

        return { valid: true, hasAllowedFormat };
    }
}
