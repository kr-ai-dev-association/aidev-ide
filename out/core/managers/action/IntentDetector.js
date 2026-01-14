"use strict";
/**
 * Intent Detector
 * 사용자 요청의 의도를 감지하는 서비스
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntentDetector = void 0;
class IntentDetector {
    llmManager;
    subtypeToCategory = {
        code_generate: 'code',
        code_modify: 'code',
        code_remove: 'code',
        execution_build: 'execution',
        execution_run: 'execution',
        execution_install: 'execution',
        execution_deploy: 'execution',
        analysis_structure: 'analysis',
        analysis_technology: 'analysis',
        analysis_function: 'analysis',
        analysis_branch: 'analysis',
        documentation_general: 'documentation',
        terminal_error_fix: 'terminal'
    };
    subtypeToTaskType = {
        code_generate: 'code_work',
        code_modify: 'code_work',
        code_remove: 'code_work',
        execution_build: 'execution_work',
        execution_run: 'execution_work',
        execution_install: 'execution_work',
        execution_deploy: 'execution_work',
        analysis_structure: 'analysis',
        analysis_technology: 'analysis',
        analysis_function: 'analysis',
        analysis_branch: 'analysis',
        documentation_general: 'documentation',
        terminal_error_fix: 'terminal'
    };
    constructor(llmManager) {
        this.llmManager = llmManager;
    }
    /**
     * TaskType을 한글 라벨로 변환합니다.
     */
    static getTaskTypeLabel(taskType) {
        const labels = {
            'code_work': '코드작성',
            'execution_work': '설치/빌드/배포/실행',
            'analysis': '분석',
            'documentation': '문서화',
            'terminal': '터미널'
        };
        return labels[taskType] || taskType;
    }
    /**
     * 사용자 쿼리에서 의도를 감지합니다.
     */
    async detectIntent(userQuery, options) {
        // 1. LLM을 통한 의도 판별 (Only)
        try {
            // 현재 활성화된 모델을 사용하여 의도 파악
            const llmRaw = await this.queryLLMForIntent(userQuery);
            if (llmRaw) {
                const subtype = llmRaw.subtype;
                const taskType = this.subtypeToTaskType[subtype] || 'analysis';
                const result = {
                    category: this.subtypeToCategory[subtype] || 'analysis',
                    subtype: subtype,
                    taskType: taskType,
                    confidence: llmRaw.confidence,
                    reasoning: llmRaw.reasoning
                };
                console.log('[IntentDetector] LLM intent result:', result);
                return result;
            }
        }
        catch (error) {
            console.error('[IntentDetector] LLM 의도 판별 실패:', error);
        }
        // Fallback: LLM 실패 시 기본값 반환
        return {
            category: 'analysis',
            subtype: 'analysis_function',
            taskType: 'analysis',
            confidence: 0.1,
            reasoning: 'LLM 의도 판별 실패로 인한 기본값 사용.'
        };
    }
    /**
     * LLM을 사용한 의도 분류
     */
    async queryLLMForIntent(userQuery) {
        const prompt = `다음 사용자 요청을 분석하여 의도(Subtype)를 분류하세요.

**분류 기준:**
1. 코드 작성/수정/삭제 (code_generate, code_modify, code_remove)
2. 프로젝트 실행 환경 설정/빌드/실행/배포 (execution_install, execution_build, execution_run, execution_deploy)
3. 코드베이스 구조/기술/기능 분석 (analysis_structure, analysis_technology, analysis_function, analysis_branch)
4. 문서 작성 (documentation_general)
5. 터미널 오류 해결 (terminal_error_fix)

출력 형식 (JSON):
{
  "subtype": "code_modify",
  "confidence": 0.9,
  "reasoning": "요청의 구체적인 이유"
}

사용자 요청: "${userQuery}"`;
        try {
            // 현재 활성화된 모델(Gemini 또는 Ollama)로 메시지 전송
            const response = await this.llmManager.sendMessage(prompt, {});
            return this.safeParseIntentResponse(response);
        }
        catch (error) {
            console.error('[IntentDetector] queryLLMForIntent failed:', error);
            throw error;
        }
    }
    /**
     * LLM 응답 파싱
     */
    safeParseIntentResponse(response) {
        try {
            const match = response.match(/\{[\s\S]*\}/);
            if (!match)
                return null;
            const parsed = JSON.parse(match[0]);
            if (parsed.subtype && this.subtypeToCategory[parsed.subtype]) {
                return {
                    subtype: parsed.subtype,
                    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.6,
                    reasoning: parsed.reasoning || 'LLM 기반 분류'
                };
            }
        }
        catch (error) {
            console.warn('[IntentDetector] 의도 응답 파싱 실패:', error);
        }
        return null;
    }
}
exports.IntentDetector = IntentDetector;
//# sourceMappingURL=IntentDetector.js.map