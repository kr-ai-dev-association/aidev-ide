/**
 * Intent Detector
 * 사용자 요청의 의도를 감지하는 서비스
 */

import { OllamaApi, AiModelType } from "../../../services";
import { LLMManager } from "../model/LLMManager";
import { getIntentPrompt } from "../context/prompts/phase";

export type IntentCategory =
  | "code"
  | "execution"
  | "analysis"
  | "documentation"
  | "terminal";

export type IntentSubtype =
  | "code_generate"
  | "code_modify"
  | "code_remove"
  | "execution_build"
  | "execution_run"
  | "execution_install"
  | "execution_deploy"
  | "analysis_structure"
  | "analysis_technology"
  | "analysis_function"
  | "analysis_branch"
  | "documentation_general"
  | "terminal_error_fix";

export type TaskType =
  | "code_work"
  | "execution_work"
  | "analysis"
  | "documentation"
  | "terminal";

export interface IntentDetectionResult {
  category: IntentCategory;
  subtype: IntentSubtype;
  taskType: TaskType;
  confidence: number;
  reasoning: string;
}

export class IntentDetector {
  private subtypeToCategory: Record<IntentSubtype, IntentCategory> = {
    code_generate: "code",
    code_modify: "code",
    code_remove: "code",
    execution_build: "execution",
    execution_run: "execution",
    execution_install: "execution",
    execution_deploy: "execution",
    analysis_structure: "analysis",
    analysis_technology: "analysis",
    analysis_function: "analysis",
    analysis_branch: "analysis",
    documentation_general: "documentation",
    terminal_error_fix: "terminal",
  };

  private subtypeToTaskType: Record<IntentSubtype, TaskType> = {
    code_generate: "code_work",
    code_modify: "code_work",
    code_remove: "code_work",
    execution_build: "execution_work",
    execution_run: "execution_work",
    execution_install: "execution_work",
    execution_deploy: "execution_work",
    analysis_structure: "analysis",
    analysis_technology: "analysis",
    analysis_function: "analysis",
    analysis_branch: "analysis",
    documentation_general: "documentation",
    terminal_error_fix: "terminal",
  };

  constructor(private llmManager: LLMManager) {}

  /**
   * TaskType을 한글 라벨로 변환합니다.
   */
  public static getTaskTypeLabel(taskType: string): string {
    const labels: Record<string, string> = {
      code_work: "코드작성",
      execution_work: "설치/빌드/배포/실행",
      analysis: "분석",
      documentation: "문서화",
      terminal: "터미널",
    };
    return labels[taskType] || taskType;
  }

  /**
   * 멘션 텍스트를 쿼리에서 제거합니다.
   * @파일명, Terminal: ..., Diagnostics: ... 패턴 제거
   */
  private removeMentionsFromQuery(query: string): string {
    // 파일 멘션: @파일명 (공백에서 종료)
    // 터미널 멘션: Terminal: 터미널이름
    // Diagnostics 멘션: Diagnostics: N errors, M warnings
    return query
      .replace(/@[a-zA-Z0-9\.\-\_\/\\]+/g, '')
      .replace(/Terminal:\s*[^\s]+/g, '')
      .replace(/Diagnostics:\s*\d+\s*errors?,\s*\d+\s*warnings?/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * 사용자 쿼리에서 의도를 감지합니다.
   */
  public async detectIntent(
    userQuery: string,
    options?: { modelName?: string },
  ): Promise<IntentDetectionResult> {
    // 멘션 텍스트 제거 후 의도 판별
    const cleanedQuery = this.removeMentionsFromQuery(userQuery);
    console.log('[IntentDetector] Cleaned query for intent:', cleanedQuery);

    // 1. LLM을 통한 의도 판별 (Only)
    try {
      // 현재 활성화된 모델을 사용하여 의도 파악
      const llmRaw = await this.queryLLMForIntent(cleanedQuery);
      if (llmRaw) {
        const subtype = llmRaw.subtype;
        const taskType = this.subtypeToTaskType[subtype] || "analysis";

        const result: IntentDetectionResult = {
          category: this.subtypeToCategory[subtype] || "analysis",
          subtype: subtype,
          taskType: taskType,
          confidence: llmRaw.confidence,
          reasoning: llmRaw.reasoning,
        };

        console.log("[IntentDetector] LLM intent result:", result);
        return result;
      }
    } catch (error) {
      console.error("[IntentDetector] LLM 의도 판별 실패:", error);
    }

    // Fallback: LLM 실패 시 기본값 반환
    return {
      category: "analysis",
      subtype: "analysis_function",
      taskType: "analysis",
      confidence: 0.1,
      reasoning: "LLM 의도 판별 실패로 인한 기본값 사용.",
    };
  }

  /**
   * LLM을 사용한 의도 분류
   */
  private async queryLLMForIntent(userQuery: string): Promise<{
    subtype: IntentSubtype;
    confidence: number;
    reasoning: string;
  } | null> {
    const prompt = getIntentPrompt(userQuery);

    try {
      // 현재 활성화된 모델로 메시지 전송
      const response = await this.llmManager.sendMessage(prompt, {});
      return this.safeParseIntentResponse(response);
    } catch (error) {
      console.error("[IntentDetector] queryLLMForIntent failed:", error);
      throw error;
    }
  }

  /**
   * LLM 응답 파싱
   */
  private safeParseIntentResponse(
    response: string,
  ): { subtype: IntentSubtype; confidence: number; reasoning: string } | null {
    try {
      const match = response.match(/\{[\s\S]*\}/);
      if (!match) {
        return null;
      }

      const parsed = JSON.parse(match[0]);
      if (
        parsed.subtype &&
        this.subtypeToCategory[parsed.subtype as IntentSubtype]
      ) {
        return {
          subtype: parsed.subtype as IntentSubtype,
          confidence:
            typeof parsed.confidence === "number" ? parsed.confidence : 0.6,
          reasoning: parsed.reasoning || "LLM 기반 분류",
        };
      }
    } catch (error) {
      console.warn("[IntentDetector] 의도 응답 파싱 실패:", error);
    }
    return null;
  }
}
