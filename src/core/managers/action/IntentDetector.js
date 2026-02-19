/**
 * Intent Detector
 * 사용자 요청의 의도를 감지하는 서비스
 */
import { getIntentPrompt } from "../context/prompts/phase";
export class IntentDetector {
    llmManager;
    subtypeToCategory = {
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
    subtypeToTaskType = {
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
    /** 카테고리별 계획 필요 여부 (analysis, documentation은 계획 불필요) */
    categoryRequiresPlan = {
        code: true,
        execution: true,
        analysis: false,
        documentation: false,
        terminal: true,
    };
    stateManager = null;
    constructor(llmManager) {
        this.llmManager = llmManager;
    }
    /**
     * StateManager 설정 (Intent 모델 라우팅에 사용)
     */
    setStateManager(stateManager) {
        this.stateManager = stateManager;
        console.log("[IntentDetector] StateManager configured for intent model routing");
    }
    /**
     * TaskType을 한글 라벨로 변환합니다.
     */
    static getTaskTypeLabel(taskType) {
        const labels = {
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
    removeMentionsFromQuery(query) {
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
    async detectIntent(userQuery, options) {
        // 멘션 텍스트 제거 후 의도 판별
        const cleanedQuery = this.removeMentionsFromQuery(userQuery);
        console.log('[IntentDetector] Cleaned query for intent:', cleanedQuery);
        // 1. LLM을 통한 의도 판별 (Only)
        try {
            // 현재 활성화된 모델을 사용하여 의도 파악
            const llmRaw = await this.queryLLMForIntent(cleanedQuery);
            if (llmRaw) {
                const subtype = llmRaw.subtype;
                const category = this.subtypeToCategory[subtype] || "analysis";
                const taskType = this.subtypeToTaskType[subtype] || "analysis";
                // LLM이 반환한 requiresPlan 우선 사용, 없으면 카테고리 기반 기본값
                const requiresPlan = llmRaw.requiresPlan !== undefined
                    ? llmRaw.requiresPlan
                    : (this.categoryRequiresPlan[category] ?? true);
                const result = {
                    category: category,
                    subtype: subtype,
                    taskType: taskType,
                    confidence: llmRaw.confidence,
                    reasoning: llmRaw.reasoning,
                    requiresPlan: requiresPlan,
                };
                console.log("[IntentDetector] LLM intent result:", result);
                return result;
            }
        }
        catch (error) {
            console.error("[IntentDetector] LLM 의도 판별 실패:", error);
        }
        // Fallback: LLM 실패 시 기본값 반환 (analysis는 계획 불필요)
        return {
            category: "analysis",
            subtype: "analysis_function",
            taskType: "analysis",
            confidence: 0.1,
            reasoning: "LLM 의도 판별 실패로 인한 기본값 사용.",
            requiresPlan: false,
        };
    }
    /**
     * LLM을 사용한 의도 분류
     * StateManager가 설정된 경우 Intent 모델 사용, 아니면 메인 모델 사용
     */
    async queryLLMForIntent(userQuery) {
        const prompt = getIntentPrompt(userQuery);
        try {
            let response;
            // StateManager가 있으면 Intent 모델 사용, 없으면 메인 모델 사용
            if (this.stateManager) {
                const userParts = [{ text: prompt }];
                response = await this.llmManager.sendMessageWithIntentModel("", // 시스템 프롬프트 없음 (프롬프트에 이미 포함)
                userParts, this.stateManager);
            }
            else {
                response = await this.llmManager.sendMessage(prompt, {});
            }
            return this.safeParseIntentResponse(response);
        }
        catch (error) {
            console.error("[IntentDetector] queryLLMForIntent failed:", error);
            throw error;
        }
    }
    /**
     * LLM 응답 파싱
     */
    safeParseIntentResponse(response) {
        try {
            const match = response.match(/\{[\s\S]*\}/);
            if (!match) {
                return null;
            }
            const parsed = JSON.parse(match[0]);
            if (parsed.subtype &&
                this.subtypeToCategory[parsed.subtype]) {
                return {
                    subtype: parsed.subtype,
                    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.6,
                    reasoning: parsed.reasoning || "LLM 기반 분류",
                    requiresPlan: typeof parsed.requiresPlan === "boolean" ? parsed.requiresPlan : undefined,
                };
            }
        }
        catch (error) {
            console.warn("[IntentDetector] 의도 응답 파싱 실패:", error);
        }
        return null;
    }
}
//# sourceMappingURL=IntentDetector.js.map