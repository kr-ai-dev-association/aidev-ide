/**
 * RetryCoordinator
 * 9개 재시도 위치를 대체하는 통합 재시도 관리자
 *
 * 기능:
 * - 통합 재시도 진입점 (handleTestFailure)
 * - 구조적 패턴 추적 (retryFingerprint 기반)
 * - 동일 패턴 반복 시 조기 종료 (같은 에러 3회 반복 = 이 방법으로는 해결 불가)
 * - 수정된 파일 컨텍스트를 항상 포함
 */
import * as fs from "fs/promises";
import * as path from "path";
import { WebviewBridge } from "../../../webview/WebviewBridge";
import { ErrorClassifier, ErrorCategory } from "./ErrorClassifier";
import { AutoRemediator } from "./AutoRemediator";
import { buildClassifiedRetryPrompt } from "../../context/prompts/rules";
import { ProjectDetector } from "../../project/ProjectDetector";
export class RetryCoordinator {
    lastFingerprint = '';
    samePatternCount = 0;
    /**
     * 통합 재시도 처리
     * ConversationManager의 9개 재시도 블록을 이 메서드 하나로 대체
     */
    async handleTestFailure(ctx) {
        const { testResult, testFixAttempts, maxTestFixAttempts, isAutoTestRetryEnabled, } = ctx;
        // 1. 재시도 허용 여부 확인
        if (!isAutoTestRetryEnabled || testFixAttempts >= maxTestFixAttempts) {
            return {
                action: 'give_up',
                testFixAttempts,
                retryFingerprint: ''
            };
        }
        // 2. 분류 결과 가져오기 (TestResult에 포함되어 있으면 사용, 없으면 fallback)
        const classification = testResult.classification
            || this.classifyFromErrorMessage(testResult.errorMessage || '', ctx.workspaceRoot);
        // 3. 비재시도 카테고리 즉시 종료 (LLM이 해결할 수 없는 실행 레벨 실패)
        if (this.isNonRetryable(classification.dominantCategory)) {
            console.log(`[RetryCoordinator] Non-retryable category: ${classification.dominantCategory}. ` +
                `Giving up immediately. fingerprint=${classification.retryFingerprint}`);
            WebviewBridge.sendProcessingStatus(ctx.webview, 'executing', this.getNonRetryableMessage(classification.dominantCategory));
            return {
                action: 'give_up',
                testFixAttempts,
                retryFingerprint: classification.retryFingerprint
            };
        }
        // 3.5. BUILD_TIMEOUT → 캐시 클리어 시도 후 재시도
        if (classification.dominantCategory === ErrorCategory.BUILD_TIMEOUT) {
            console.log('[RetryCoordinator] BUILD_TIMEOUT detected — attempting cache clear before retry');
            WebviewBridge.sendProcessingStatus(ctx.webview, 'executing', '빌드 타임아웃 — 캐시 정리 후 재시도 중...');
            const remediation = await AutoRemediator.attemptFix(classification, ctx.workspaceRoot, ctx.webview);
            if (remediation.attempted) {
                console.log(`[RetryCoordinator] Cache clear ${remediation.success ? 'succeeded' : 'failed'}: ${remediation.message}`);
            }
        }
        // 4. 구조적 패턴 추적 (fingerprint 기반, 키워드 매칭 없음)
        const currentFingerprint = classification.retryFingerprint;
        if (currentFingerprint === this.lastFingerprint) {
            this.samePatternCount++;
        }
        else {
            this.lastFingerprint = currentFingerprint;
            this.samePatternCount = 1;
        }
        // 5. 동일 패턴 반복 시 조기 종료
        // 같은 에러가 3회 반복 = 이 접근법으로는 해결 불가 → give_up
        if (this.samePatternCount >= 3) {
            console.log(`[RetryCoordinator] Same pattern repeated ${this.samePatternCount} times — giving up. ` +
                `fingerprint=${currentFingerprint}, category=${classification.dominantCategory}`);
            WebviewBridge.sendProcessingStatus(ctx.webview, 'executing', `동일 에러 ${this.samePatternCount}회 반복 — 자동 수정 중단`);
            return {
                action: 'give_up',
                testFixAttempts,
                retryFingerprint: currentFingerprint
            };
        }
        // 6. 시도 횟수 증가
        const newAttempts = testFixAttempts + 1;
        // 7. 수정된 파일 컨텍스트 읽기 (항상 포함)
        const modifiedFilesContext = await this.readModifiedFiles(ctx);
        // 8. 통합 프롬프트 생성
        const prompt = buildClassifiedRetryPrompt(classification, modifiedFilesContext, false, // escalation 없음 — 3회 도달 전에만 여기에 옴
        this.samePatternCount);
        // 9. UI 업데이트
        WebviewBridge.sendProcessingStep(ctx.webview, 'executing');
        WebviewBridge.sendProcessingStatus(ctx.webview, 'executing', `테스트 실패 - 자동 수정 중 (${newAttempts}/${maxTestFixAttempts})...`);
        console.log(`[RetryCoordinator] Retry ${newAttempts}/${maxTestFixAttempts}, ` +
            `category=${classification.dominantCategory}, ` +
            `samePattern=${this.samePatternCount}`);
        return {
            action: 'retry',
            prompt,
            testFixAttempts: newAttempts,
            retryFingerprint: currentFingerprint
        };
    }
    /**
     * 패턴 추적 상태 리셋 (새 요청 시작 시)
     */
    reset() {
        this.lastFingerprint = '';
        this.samePatternCount = 0;
    }
    /**
     * LLM 재시도가 무의미한 카테고리인지 확인
     */
    isNonRetryable(category) {
        return category === ErrorCategory.EXECUTION_TIMEOUT
            || category === ErrorCategory.COMMAND_NOT_FOUND
            || category === ErrorCategory.SILENT_FAILURE;
    }
    /**
     * 비재시도 카테고리별 사용자 메시지
     */
    getNonRetryableMessage(category) {
        switch (category) {
            case ErrorCategory.EXECUTION_TIMEOUT:
                return '검증 명령어 타임아웃 — 자동 수정 불가';
            case ErrorCategory.COMMAND_NOT_FOUND:
                return '검증 도구 미설치 — 자동 수정 불가';
            case ErrorCategory.SILENT_FAILURE:
                return '명령어 실패 (출력 없음) — 자동 수정 불가';
            default:
                return '자동 수정 불가';
        }
    }
    /**
     * errorMessage만 있을 때의 fallback 분류
     */
    classifyFromErrorMessage(errorMessage, workspaceRoot) {
        const envHealth = ProjectDetector.checkEnvironmentHealth(workspaceRoot);
        return ErrorClassifier.classifyFromMessage(errorMessage, envHealth);
    }
    /**
     * 수정된 파일들의 최신 내용 읽기
     */
    async readModifiedFiles(ctx) {
        const result = [];
        const allPaths = [...new Set([...ctx.createdFiles, ...ctx.modifiedFiles])];
        for (const filePath of allPaths) {
            try {
                const absolutePath = path.isAbsolute(filePath)
                    ? filePath
                    : path.join(ctx.workspaceRoot, filePath);
                const content = await fs.readFile(absolutePath, 'utf-8');
                result.push({ path: filePath, content });
            }
            catch {
                // 읽기 실패 파일은 스킵
            }
        }
        return result;
    }
}
//# sourceMappingURL=RetryCoordinator.js.map