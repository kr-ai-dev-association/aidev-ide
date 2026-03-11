/**
 * CompletionJudge
 * A4: AI 자체 판단 추가 작업
 *
 * REVIEW 단계에서 작업 완료 여부를 LLM으로 판단하여
 * 미완성 시 추가 작업을 자동 실행
 *
 * 판단 기준:
 * - 사용자 요청 대비 생성/수정된 파일이 충분한지
 * - 명백한 TODO/FIXME가 남아있는지
 * - 에러나 경고가 해결되었는지
 */

import { LLMManager } from "../../model/LLMManager";

export interface CompletionJudgment {
    isComplete: boolean;
    confidence: number;           // 0.0 ~ 1.0
    reason: string;
    suggestedAction?: string;     // 미완성 시 추가 작업 제안
}

export class CompletionJudge {
    private static readonly CONFIDENCE_THRESHOLD = 0.7;
    private static readonly MAX_AUTO_CONTINUE = 2;  // 자동 추가 작업 최대 횟수

    private autoContinueCount: number = 0;

    constructor(private llmManager: LLMManager) {}

    /**
     * 작업 완료 여부 판단
     * @param buildTestPassed - 빌드/테스트 통과 여부 (true면 완료 가능성 높음)
     */
    async judge(
        userQuery: string,
        createdFiles: string[],
        modifiedFiles: string[],
        lastResponse: string,
        abortSignal?: AbortSignal,
        buildTestPassed: boolean = false
    ): Promise<CompletionJudgment> {
        // 자동 추가 작업 횟수 초과 시 강제 완료
        if (this.autoContinueCount >= CompletionJudge.MAX_AUTO_CONTINUE) {
            console.log(`[CompletionJudge] Max auto-continue reached (${this.autoContinueCount}), forcing complete`);
            return {
                isComplete: true,
                confidence: 1.0,
                reason: '최대 자동 추가 작업 횟수 도달'
            };
        }

        // 파일 변경이 없으면 완료로 간주 (질문/설명 요청 등)
        if (createdFiles.length === 0 && modifiedFiles.length === 0) {
            return {
                isComplete: true,
                confidence: 0.9,
                reason: '파일 변경 없음 (정보 제공 작업)'
            };
        }

        // LLM으로 완료 여부 판단
        const prompt = this.buildJudgmentPrompt(userQuery, createdFiles, modifiedFiles, lastResponse, buildTestPassed);

        try {
            const response = await this.llmManager.generateSimpleResponse(prompt, {
                maxTokens: 200,
                temperature: 0.1,
            });

            return this.parseJudgmentResponse(response);
        } catch (error) {
            console.warn('[CompletionJudge] LLM judgment failed, assuming complete:', error);
            return {
                isComplete: true,
                confidence: 0.5,
                reason: 'LLM 판단 실패 - 기본 완료 처리'
            };
        }
    }

    /**
     * 자동 추가 작업 카운터 증가
     */
    incrementAutoContinue(): void {
        this.autoContinueCount++;
        console.log(`[CompletionJudge] Auto-continue count: ${this.autoContinueCount}/${CompletionJudge.MAX_AUTO_CONTINUE}`);
    }

    /**
     * 카운터 리셋 (새 요청 시작 시)
     */
    reset(): void {
        this.autoContinueCount = 0;
    }

    /**
     * 자동 추가 작업이 아직 가능한지 확인
     * true이면 CompletionJudge가 아직 판단 중이므로 TestRunner를 건너뛸 수 있음
     */
    canAutoContinue(): boolean {
        return this.autoContinueCount < CompletionJudge.MAX_AUTO_CONTINUE;
    }

    /**
     * 판단 프롬프트 생성
     */
    private buildJudgmentPrompt(
        userQuery: string,
        createdFiles: string[],
        modifiedFiles: string[],
        lastResponse: string,
        buildTestPassed: boolean = false
    ): string {
        return `작업 완료 여부를 판단하세요.

## 사용자 요청
${userQuery}

## 수행된 작업
- 생성된 파일: ${createdFiles.length > 0 ? createdFiles.join(', ') : '없음'}
- 수정된 파일: ${modifiedFiles.length > 0 ? modifiedFiles.join(', ') : '없음'}
- 빌드/테스트 결과: ${buildTestPassed ? '통과' : '미실행 또는 실패'}

## 마지막 응답
${lastResponse.substring(0, 500)}${lastResponse.length > 500 ? '...' : ''}

## 판단 기준
1. 사용자가 요청한 모든 항목이 생성/수정되었는가? (파일 목록과 요청을 비교)
2. 사용자가 여러 파일/기능을 요청했는데 일부만 생성된 경우 → 미완성
3. 명백한 TODO나 미완성 부분이 있는가?
4. 빌드/테스트 통과는 참고 사항일 뿐, 요청 이행 여부와는 별개

## 응답 형식 (JSON만)
{"complete": true/false, "confidence": 0.0~1.0, "reason": "판단 이유", "action": "미완성 시 필요한 추가 작업"}

JSON만 응답하세요:`;
    }

    /**
     * LLM 응답 파싱
     */
    private parseJudgmentResponse(response: string): CompletionJudgment {
        try {
            // JSON 추출
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('No JSON found');
            }

            const parsed = JSON.parse(jsonMatch[0]);

            return {
                isComplete: Boolean(parsed.complete),
                confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0.5)),
                reason: String(parsed.reason || ''),
                suggestedAction: parsed.action ? String(parsed.action) : undefined
            };
        } catch (error) {
            console.warn('[CompletionJudge] Failed to parse response:', response);
            // 파싱 실패 시 기본값
            return {
                isComplete: true,
                confidence: 0.5,
                reason: '응답 파싱 실패 - 기본 완료 처리'
            };
        }
    }

    /**
     * 판단 결과에 따라 추가 작업이 필요한지 확인
     */
    shouldContinue(judgment: CompletionJudgment): boolean {
        // 완료로 판단되면 추가 작업 불필요
        if (judgment.isComplete) {
            return false;
        }

        // confidence가 낮으면 (불확실하면) 완료로 처리
        if (judgment.confidence < CompletionJudge.CONFIDENCE_THRESHOLD) {
            console.log(`[CompletionJudge] Low confidence (${judgment.confidence}), treating as complete`);
            return false;
        }

        // 미완성이고 confidence가 높으면 추가 작업 필요
        return true;
    }

    /**
     * 추가 작업 프롬프트 생성
     */
    buildContinuePrompt(judgment: CompletionJudgment): string {
        if (judgment.suggestedAction) {
            return `이전 작업이 완료되지 않았습니다: ${judgment.reason}\n\n추가로 수행해야 할 작업: ${judgment.suggestedAction}\n\n계속 진행해주세요.`;
        }

        return `이전 작업이 완료되지 않았습니다: ${judgment.reason}\n\n남은 작업을 계속 진행해주세요.`;
    }
}
