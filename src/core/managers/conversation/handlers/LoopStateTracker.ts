/**
 * LoopStateTracker
 * 무한 루프 감지 및 탈출 로직 — ConversationManager에서 분리
 * v11.12.0
 */

import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { LoopState } from '../types/TurnContext';
import { AgentConfig } from '../../../config/AgentConfig';
import { AgentPhase, AgentStateManager } from '../AgentStateManager';
import { TaskManager } from '../../task/TaskManager';
import { WebviewBridge } from '../../../webview/WebviewBridge';

export class LoopStateTracker {
    private escapeAttemptCount = 0;
    private static readonly MAX_ESCAPE_ATTEMPTS = 3;

    /**
     * 탈출 시도 카운터 리셋 (새 대화 시작 시 호출)
     */
    resetEscapeCount(): void {
        this.escapeAttemptCount = 0;
    }

    /**
     * LoopState 초기화
     */
    initializeLoopState(): LoopState {
        return {
            lastPhase: AgentPhase.INVESTIGATION,
            lastPlanItemId: null,
            lastToolCalls: [],
            lastResponseHash: '',
            consecutiveNoProgressTurns: 0,
            consecutiveSamePhase: 0,
            consecutiveSamePlanItem: 0,
        };
    }

    /**
     * LLM 응답의 간단한 해시 생성 (중복 응답 감지용)
     */
    computeResponseHash(response: string): string {
        const normalized = response
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 500);
        return crypto.createHash('md5').update(normalized).digest('hex');
    }

    /**
     * LoopState 업데이트 및 무한 루프 감지
     * @returns 무한 루프가 감지되었는지 여부
     */
    updateAndCheckLoopState(
        loopState: LoopState,
        currentPhase: AgentPhase,
        currentPlanItemId: string | null,
        toolCalls: string[],
        llmResponse: string,
        hasProgress: boolean,
    ): { isLoop: boolean; reason?: string } {
        const responseHash = this.computeResponseHash(llmResponse);

        // Phase 연속 카운트 업데이트
        if (currentPhase === loopState.lastPhase) {
            loopState.consecutiveSamePhase++;
        } else {
            loopState.consecutiveSamePhase = 1;
            loopState.lastPhase = currentPhase;
        }

        // Plan Item 연속 카운트 업데이트
        if (currentPlanItemId !== null && currentPlanItemId === loopState.lastPlanItemId) {
            loopState.consecutiveSamePlanItem++;
        } else {
            loopState.consecutiveSamePlanItem = 1;
            loopState.lastPlanItemId = currentPlanItemId;
        }

        // 진전 있으면 Phase 연속 카운트도 리셋
        // (plan 생성 등 phase 전환 직전의 유의미한 진전)
        if (hasProgress) {
            loopState.consecutiveSamePhase = 1;
        }

        // 진전 없음 카운트 업데이트
        const sameToolCalls = JSON.stringify(toolCalls) === JSON.stringify(loopState.lastToolCalls);
        const sameResponse = responseHash === loopState.lastResponseHash;

        if (!hasProgress && (sameToolCalls || sameResponse)) {
            loopState.consecutiveNoProgressTurns++;
        } else if (hasProgress) {
            loopState.consecutiveNoProgressTurns = 0;
        }

        loopState.lastToolCalls = toolCalls;
        loopState.lastResponseHash = responseHash;

        // 무한 루프 감지 조건 체크
        if (loopState.consecutiveNoProgressTurns >= AgentConfig.LOOP_DETECTION_NO_PROGRESS_THRESHOLD) {
            return { isLoop: true, reason: `진전 없이 ${loopState.consecutiveNoProgressTurns}턴 연속 반복` };
        }

        if (loopState.consecutiveSamePlanItem >= AgentConfig.LOOP_DETECTION_SAME_PLAN_ITEM_THRESHOLD) {
            return { isLoop: true, reason: `동일 Plan Item에서 ${loopState.consecutiveSamePlanItem}턴 연속 미완료` };
        }

        if (loopState.consecutiveSamePhase >= AgentConfig.LOOP_DETECTION_SAME_PHASE_THRESHOLD) {
            return { isLoop: true, reason: `동일 Phase(${currentPhase})에서 ${loopState.consecutiveSamePhase}턴 연속` };
        }

        return { isLoop: false };
    }

    /**
     * 무한 루프 탈출 처리
     * @returns 루프를 종료해야 하는지 여부
     */
    handleInfiniteLoopEscape(
        reason: string,
        loopState: LoopState,
        stateManager: AgentStateManager,
        taskManager: TaskManager,
        webview: vscode.Webview,
    ): { shouldBreak: boolean; message: string } {
        console.warn(`[LoopStateTracker] 무한 루프 감지: ${reason}`);

        this.escapeAttemptCount++;
        if (this.escapeAttemptCount >= LoopStateTracker.MAX_ESCAPE_ATTEMPTS) {
            console.error(`[LoopStateTracker] 최대 탈출 시도 횟수(${LoopStateTracker.MAX_ESCAPE_ATTEMPTS}) 초과 - 강제 종료`);
            WebviewBridge.receiveMessage(webview, 'SYSTEM_WARNING', `⚠️ 작업이 반복적으로 멈춰 자동으로 중단되었습니다.`);
            return { shouldBreak: true, message: `탈출 시도 횟수 초과로 작업을 중단합니다.` };
        }

        // 1단계: 현재 Plan Item 스킵 시도
        const currentPlanItem = taskManager.getNextPendingItem();
        if (currentPlanItem && loopState.consecutiveSamePlanItem >= AgentConfig.LOOP_DETECTION_SAME_PLAN_ITEM_THRESHOLD) {
            console.log(`[LoopStateTracker] Plan Item "${currentPlanItem.title}" 스킵 처리`);
            taskManager.updatePlanItemStatus(currentPlanItem.id, 'skipped');
            WebviewBridge.updateTaskQueue(webview, taskManager.listPlanItems());

            const nextItem = taskManager.getNextPendingItem();
            if (nextItem) {
                loopState.consecutiveSamePlanItem = 0;
                loopState.consecutiveNoProgressTurns = 0;
                return { shouldBreak: false, message: `작업 "${currentPlanItem.title}"을(를) 건너뛰고 다음 작업으로 진행합니다.` };
            }
        }

        // 2단계: Phase 전환 강제
        const currentPhase = stateManager.getCurrentState();
        if (currentPhase === AgentPhase.INVESTIGATION || currentPhase === AgentPhase.EXECUTION) {
            console.log(`[LoopStateTracker] ${currentPhase} → REVIEW 강제 전환`);
            stateManager.transitionTo(AgentPhase.REVIEW);
            loopState.consecutiveSamePhase = 0;
            loopState.consecutiveNoProgressTurns = 0;
            return { shouldBreak: false, message: `반복이 감지되어 검토 단계로 전환합니다.` };
        }

        // 3단계: 최종 탈출
        console.log(`[LoopStateTracker] 무한 루프 탈출 불가 - 대화 종료`);
        WebviewBridge.receiveMessage(webview, 'SYSTEM_WARNING', `⚠️ 작업이 반복되어 자동으로 중단되었습니다. (${reason})`);
        return { shouldBreak: true, message: `무한 루프가 감지되어 작업을 중단합니다: ${reason}` };
    }
}
