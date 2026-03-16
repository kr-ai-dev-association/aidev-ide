/**
 * Turn Loop Context & Action Types
 * 턴 루프의 모든 상태를 캡슐화하는 컨텍스트 및 액션 타입
 *
 * v9.3.0: ConversationManager 턴 루프 리팩토링
 * v9.7.3: any 타입 제거, 명시적 타입 정의
 */

import * as vscode from 'vscode';
import { AgentStateManager, AgentPhase } from '../AgentStateManager';
import { TaskManager } from '../../task/TaskManager';
import { RetryCoordinator } from '../handlers/RetryCoordinator';
import { ConversationOptions } from '../ConversationManager';
import { ToolUse } from '../../../tools/types';
import { IntentDetectionResult } from '../../action/IntentDetector';
import { Part } from '../../../../services/types';

/**
 * LLM에 전달되는 사용자 메시지 파트
 */
export type UserPart = Part;

/**
 * 수집된 액션 정보
 */
export interface CollectedAction {
  type: string;
  file?: string;
  command?: string;
  result?: string;
}

/**
 * UI 메시지 수집
 */
export interface CollectedUIMessage {
  sender: 'USER' | 'CODEPILOT' | 'System';
  text: string;
  type?: 'action' | 'code' | 'summary' | 'message';
}

/**
 * 무한 루프 감지를 위한 상태 추적
 * v9.4.0: 무한 루프 감지 메커니즘 추가
 */
export interface LoopState {
  /** 마지막 턴의 Phase */
  lastPhase: AgentPhase;
  /** 마지막 처리된 Plan Item ID */
  lastPlanItemId: string | null;
  /** 마지막 턴에서 실행된 도구 호출 시그니처 */
  lastToolCalls: string[];
  /** LLM 응답의 해시 (중복 응답 감지) */
  lastResponseHash: string;
  /** 진전 없이 연속된 턴 수 */
  consecutiveNoProgressTurns: number;
  /** 동일 Phase에서 연속된 턴 수 */
  consecutiveSamePhase: number;
  /** 동일 Plan Item에서 연속된 턴 수 */
  consecutiveSamePlanItem: number;
}

/**
 * 턴 루프의 모든 가변 상태 + 불변 설정을 하나로 캡슐화
 */
export interface TurnContext {
  // ── 턴 카운터 ──
  turnCount: number;
  readonly maxTurns: number;

  // ── 플래그 (가변) ──
  pendingRetryPrompt: boolean;
  pendingMCPResultInterpretation: boolean;
  lastTurnHadSuccessfulToolExecution: boolean;
  executionNoToolRetryCount: number;
  testFixAttempts: number;
  hasInvestigationHistory: boolean;
  autoInvestigationCompleted: boolean;
  hasExecutionIntentEver: boolean;

  // ── 누적 데이터 (가변) ──
  accumulatedUserParts: UserPart[];
  createdFiles: string[];
  modifiedFiles: string[];
  preloadedFiles: Set<string>;
  toolCallsFromPlanCreation: ToolUse[];

  // ── 메타데이터 수집 (가변) ──
  collectedActions: CollectedAction[];
  collectedUIMessages: CollectedUIMessage[];
  lastAssistantResponse: string;
  recentlyExecutedCommands: Set<string>;

  // ── 설정 (불변) ──
  readonly maxTestFixAttempts: number;
  readonly maxExecutionNoToolRetries: number;
  readonly isAutoTestRetryEnabled: boolean;
  readonly intent: IntentDetectionResult | null;
  readonly hasNoIntent: boolean;
  readonly webview: vscode.Webview;
  readonly abortSignal?: AbortSignal;
  readonly userQuery: string;
  readonly options: ConversationOptions;
  readonly systemPrompt: string;

  // ── 서비스 참조 (불변) ──
  readonly stateManager: AgentStateManager;
  readonly taskManager: TaskManager;
  readonly retryCoordinator: RetryCoordinator;
}

/**
 * 추출된 메서드가 턴 루프에 continue/break/proceed 의도를 전달
 */
export type TurnAction =
  | { action: 'continue' }
  | { action: 'break' }
  | { action: 'proceed' };
