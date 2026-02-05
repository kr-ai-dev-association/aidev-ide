/**
 * ErrorClassifier
 * 범용 에러 분류 시스템 - 키워드 패턴 매칭 없이 구조적 신호만 사용
 *
 * 분류 원칙:
 * 1. diagnostic.source + diagnostic.code 그룹핑 (LSP 자체 분류 활용)
 * 2. 파일시스템 상태 검사 (manifest 있는데 dep dir 없음 = 설치 필요)
 * 3. 에러 군집 비율 (동일 source+code가 50% 이상 = 단일 근본 원인)
 */

// ==================== Types ====================

export interface RichDiagnostic {
    file: string;
    line: number;
    message: string;
    code: string | number;
    source: string;            // "ts", "eslint", "pylint", "rust-analyzer" 등
    relatedFiles: string[];    // diagnostic.relatedInformation에서 추출
    tags: number[];            // deprecated=1, unnecessary=2
    severity: 'error' | 'warning';
}

/**
 * CLI 실행 결과에서 분류에 필요한 구조적 신호만 추출한 경량 어댑터.
 * ExecutionResult를 대체하지 않고 ErrorClassifier의 입력으로만 사용.
 */
export interface ExecutionOutcome {
    command: string;              // 실행된 명령어 (fingerprint용)
    exitCode: number | undefined; // -1 for killed, undefined for background
    hasStderr: boolean;           // stderr.length > 0
    hasStdout: boolean;           // stdout.length > 0
    duration: number;             // ms
    errorCode?: string;           // 'TIMEOUT'|'TIMEOUT_CONTINUE'|'NON_ZERO_EXIT'|'EXECUTION_FAILED'
    killed: boolean;
    signal?: string;              // SIGTERM, SIGKILL 등
    stderrSnippet: string;        // stderr 처음 200자
}

export enum ErrorCategory {
    ENVIRONMENT_MISSING = 'environment_missing',         // dep dir 없음 (node_modules, venv 등)
    SOURCE_ERRORS_CLUSTERED = 'source_errors_clustered', // 동일 source+code 50%+ → 단일 근본 원인
    SOURCE_ERRORS_SCATTERED = 'source_errors_scattered', // 다양한 에러 → 개별 버그
    CONFIG_ERROR = 'config_error',                       // 설정 파일(tsconfig 등)에만 에러
    EXECUTION_TIMEOUT = 'execution_timeout',             // 명령어 타임아웃 (SIGTERM/SIGKILL)
    BUILD_TIMEOUT = 'build_timeout',                     // 빌드 타임아웃 (캐시 클리어 후 재시도 가능)
    COMMAND_NOT_FOUND = 'command_not_found',             // exit code 127 또는 "command not found"
    SILENT_FAILURE = 'silent_failure',                   // non-zero exit, 출력 없음
    UNKNOWN = 'unknown'
}

export interface ErrorGroup {
    category: ErrorCategory;
    source: string;              // diagnostic.source 값
    representativeCode: string;  // 그룹 내 가장 흔한 diagnostic.code
    count: number;               // 그룹 내 에러 수
    affectedFiles: string[];     // 영향받는 파일 목록
    sampleMessages: string[];    // 최대 3개 샘플 메시지
    rootCauseHypothesis: string; // 구조적 분석 기반 근본 원인 가설
    autoRemediable: boolean;     // LLM 없이 자동 수정 가능 여부
}

export interface EnvironmentHealth {
    hasManifestFile: boolean;    // package.json, Cargo.toml 등 존재 여부
    hasDependencyDir: boolean;   // node_modules, vendor 등 존재 여부
    hasLockFile: boolean;        // package-lock.json, yarn.lock 등 존재 여부
    needsInstall: boolean;       // manifest 있고 dep dir 없음
    packageManager?: string;     // 감지된 패키지 매니저
    installCommand?: string;     // 실행할 설치 명령어
}

export interface ClassificationResult {
    groups: ErrorGroup[];
    totalErrorCount: number;
    dominantCategory: ErrorCategory;
    environmentCheck: EnvironmentHealth;
    retryFingerprint: string;    // 패턴 추적용 결정론적 해시
}

// ==================== Classifier ====================

export class ErrorClassifier {

    /**
     * 메인 분류 함수
     * 에러 목록 + 환경 상태 + 설정 파일 목록 → 구조적 분류 결과
     */
    static classify(
        diagnostics: RichDiagnostic[],
        envHealth: EnvironmentHealth,
        configFiles: string[]
    ): ClassificationResult {
        if (diagnostics.length === 0) {
            return {
                groups: [],
                totalErrorCount: 0,
                dominantCategory: ErrorCategory.UNKNOWN,
                environmentCheck: envHealth,
                retryFingerprint: 'empty'
            };
        }

        // Step 1: 환경 문제가 최우선 (파일시스템 기반 감지)
        if (envHealth.needsInstall) {
            return this.buildEnvironmentResult(diagnostics, envHealth);
        }

        // Step 2: (source, code) 쌍으로 그룹핑
        const groups = this.groupBySourceAndCode(diagnostics);

        // Step 3: 설정 파일에만 에러가 있는지 확인
        const normalizedConfigFiles = configFiles.map(f => f.replace(/^\.\//, ''));
        const allInConfig = diagnostics.every(d =>
            normalizedConfigFiles.some(cf => d.file === cf || d.file.endsWith('/' + cf))
        );
        if (allInConfig && diagnostics.length > 0) {
            for (const g of groups) {
                g.category = ErrorCategory.CONFIG_ERROR;
                g.rootCauseHypothesis = `설정 파일에서만 에러 발생 (${g.affectedFiles.join(', ')})`;
            }
            return this.buildResult(groups, ErrorCategory.CONFIG_ERROR, envHealth);
        }

        // Step 4: 군집 비율 확인 — 가장 큰 그룹이 전체의 50% 이상이면 CLUSTERED
        const largestGroup = groups.reduce((a, b) => a.count > b.count ? a : b, groups[0]);
        const clusterRatio = largestGroup.count / diagnostics.length;

        if (clusterRatio >= 0.5 && diagnostics.length >= 3) {
            // 하나의 (source, code) 쌍이 지배적 → 단일 근본 원인 가능성
            for (const g of groups) {
                if (g === largestGroup) {
                    g.category = ErrorCategory.SOURCE_ERRORS_CLUSTERED;
                    g.rootCauseHypothesis =
                        `${g.count}개 에러가 동일한 원인 [${g.source}:${g.representativeCode}]에서 발생. ` +
                        `${g.affectedFiles.length}개 파일에 영향. 단일 근본 원인일 가능성이 높음.`;
                } else {
                    g.category = ErrorCategory.SOURCE_ERRORS_SCATTERED;
                    g.rootCauseHypothesis = `부수적 에러 [${g.source}:${g.representativeCode}]`;
                }
            }
            return this.buildResult(groups, ErrorCategory.SOURCE_ERRORS_CLUSTERED, envHealth);
        }

        // Step 5: 분산된 에러
        for (const g of groups) {
            g.category = ErrorCategory.SOURCE_ERRORS_SCATTERED;
            g.rootCauseHypothesis =
                `${g.count}개 에러 [${g.source}:${g.representativeCode}] - ${g.affectedFiles.length}개 파일`;
        }
        return this.buildResult(groups, ErrorCategory.SOURCE_ERRORS_SCATTERED, envHealth);
    }

    /**
     * errorMessage 문자열만 있을 때의 fallback 분류
     * (classification 없이 TestResult가 반환된 경우)
     */
    static classifyFromMessage(errorMessage: string, envHealth?: EnvironmentHealth): ClassificationResult {
        const fallbackEnv: EnvironmentHealth = envHealth || {
            hasManifestFile: false,
            hasDependencyDir: true,
            hasLockFile: false,
            needsInstall: false
        };

        return {
            groups: [{
                category: ErrorCategory.UNKNOWN,
                source: 'unknown',
                representativeCode: 'unknown',
                count: 1,
                affectedFiles: [],
                sampleMessages: [errorMessage.substring(0, 200)],
                rootCauseHypothesis: '구조적 분류 불가 — 에러 메시지 직접 전달',
                autoRemediable: false
            }],
            totalErrorCount: 1,
            dominantCategory: ErrorCategory.UNKNOWN,
            environmentCheck: fallbackEnv,
            retryFingerprint: `unknown:${errorMessage.substring(0, 50)}`
        };
    }

    /**
     * ExecutionOutcome 기반 구조적 분류
     * CLI 실행 결과의 메타데이터(exitCode, signal, duration)를 활용하여
     * 문자열 분석 없이 에러 유형을 결정
     *
     * 결정 트리:
     * 1. TIMEOUT/TIMEOUT_CONTINUE → EXECUTION_TIMEOUT
     * 2. exitCode 127 또는 "command not found" → COMMAND_NOT_FOUND
     * 3. non-zero exit + 출력 없음 → SILENT_FAILURE
     * 4. 그 외 → classifyFromMessage() fallback
     */
    static classifyFromExecution(
        outcome: ExecutionOutcome,
        envHealth?: EnvironmentHealth
    ): ClassificationResult {
        const fallbackEnv: EnvironmentHealth = envHealth || {
            hasManifestFile: false,
            hasDependencyDir: true,
            hasLockFile: false,
            needsInstall: false
        };

        // 1. 타임아웃 — 빌드 명령이면 BUILD_TIMEOUT (재시도 가능)
        if (outcome.errorCode === 'TIMEOUT' || outcome.errorCode === 'TIMEOUT_CONTINUE') {
            const isBuild = this.isBuildCommand(outcome.command);
            const category = isBuild ? ErrorCategory.BUILD_TIMEOUT : ErrorCategory.EXECUTION_TIMEOUT;
            const desc = isBuild ? '빌드 타임아웃' : '명령어 타임아웃';
            return this.buildExecutionResult(
                category,
                outcome,
                `${desc} (${outcome.duration}ms): ${outcome.command}`,
                fallbackEnv
            );
        }

        // 2. 명령어 미발견 (Unix exit code 127 또는 stderr 패턴)
        if (outcome.exitCode === 127 ||
            /command not found|not found/i.test(outcome.stderrSnippet)) {
            return this.buildExecutionResult(
                ErrorCategory.COMMAND_NOT_FOUND,
                outcome,
                `명령어를 찾을 수 없음: ${outcome.command}`,
                fallbackEnv
            );
        }

        // 3. 무출력 실패 (non-zero exit, stdout/stderr 모두 없음)
        if (outcome.exitCode !== 0 && !outcome.hasStderr && !outcome.hasStdout) {
            return this.buildExecutionResult(
                ErrorCategory.SILENT_FAILURE,
                outcome,
                `명령어가 코드 ${outcome.exitCode}로 종료됨. 출력 없음 (killed=${outcome.killed}, signal=${outcome.signal || 'none'})`,
                fallbackEnv
            );
        }

        // 4. 출력이 있는 실패 → 기존 문자열 기반 분류 fallback
        return this.classifyFromMessage(outcome.stderrSnippet, fallbackEnv);
    }

    // ==================== Private Helpers ====================

    /** 빌드 관련 명령어 패턴 (타임아웃 시 BUILD_TIMEOUT 분류용) */
    private static readonly BUILD_COMMAND_PATTERNS = [
        /\b(gradle|gradlew)\b/i,
        /\b(mvn|maven)\b/i,
        /\b(npm|yarn|pnpm|bun)\s+run\s+(build|compile|tsc)\b/i,
        /\bcargo\s+build\b/i,
        /\bgo\s+build\b/i,
        /\bdotnet\s+build\b/i,
        /\bmake\b/i,
        /\btsc\b/,
        /\bwebpack\b/i,
        /\bvite\s+build\b/i,
        /\bnext\s+build\b/i,
    ];

    /**
     * 명령어가 빌드 관련인지 판단
     */
    private static isBuildCommand(command: string): boolean {
        return this.BUILD_COMMAND_PATTERNS.some(p => p.test(command));
    }

    /**
     * (source, code) 쌍으로 diagnostics를 그룹핑
     * 키워드 매칭 없이 LSP 자체 분류만 활용
     */
    private static groupBySourceAndCode(diagnostics: RichDiagnostic[]): ErrorGroup[] {
        const map = new Map<string, RichDiagnostic[]>();

        for (const d of diagnostics) {
            const key = `${d.source}::${d.code}`;
            if (!map.has(key)) { map.set(key, []); }
            map.get(key)!.push(d);
        }

        return Array.from(map.entries())
            .map(([key, diags]) => {
                const [source, code] = key.split('::');
                const files = [...new Set(diags.map(d => d.file))];
                return {
                    category: ErrorCategory.UNKNOWN,
                    source: source || 'unknown',
                    representativeCode: code || 'unknown',
                    count: diags.length,
                    affectedFiles: files,
                    sampleMessages: diags.slice(0, 3).map(d => d.message),
                    rootCauseHypothesis: '',
                    autoRemediable: false
                };
            })
            .sort((a, b) => b.count - a.count); // 가장 큰 그룹 우선
    }

    /**
     * 환경 문제(의존성 미설치)에 대한 분류 결과 생성
     */
    private static buildEnvironmentResult(
        diagnostics: RichDiagnostic[],
        envHealth: EnvironmentHealth
    ): ClassificationResult {
        const groups = this.groupBySourceAndCode(diagnostics);

        for (const g of groups) {
            g.category = ErrorCategory.ENVIRONMENT_MISSING;
            g.autoRemediable = true;
            g.rootCauseHypothesis =
                `의존성 디렉토리 누락 감지. ` +
                `설치 명령어: ${envHealth.installCommand || '알 수 없음'}. ` +
                `이 그룹의 에러는 의존성 설치 후 자동 해결될 가능성이 높음.`;
        }

        return this.buildResult(groups, ErrorCategory.ENVIRONMENT_MISSING, envHealth);
    }

    /**
     * 최종 ClassificationResult 조립
     */
    private static buildResult(
        groups: ErrorGroup[],
        dominantCategory: ErrorCategory,
        envHealth: EnvironmentHealth
    ): ClassificationResult {
        const totalCount = groups.reduce((sum, g) => sum + g.count, 0);
        return {
            groups,
            totalErrorCount: totalCount,
            dominantCategory,
            environmentCheck: envHealth,
            retryFingerprint: this.buildFingerprint(groups)
        };
    }

    /**
     * ExecutionOutcome 기반 ClassificationResult 조립
     * fingerprint: "{category}:{command}" 또는 "{category}:{command}:{exitCode}"
     */
    private static buildExecutionResult(
        category: ErrorCategory,
        outcome: ExecutionOutcome,
        hypothesis: string,
        envHealth: EnvironmentHealth
    ): ClassificationResult {
        const group: ErrorGroup = {
            category,
            source: 'execution',
            representativeCode: outcome.errorCode || `exit:${outcome.exitCode}`,
            count: 1,
            affectedFiles: [],
            sampleMessages: outcome.stderrSnippet
                ? [outcome.stderrSnippet]
                : [`${outcome.command} exited with code ${outcome.exitCode}`],
            rootCauseHypothesis: hypothesis,
            autoRemediable: false,
        };

        const fingerprint = `${category}:${outcome.command}` +
            (outcome.exitCode !== undefined ? `:${outcome.exitCode}` : '');

        return {
            groups: [group],
            totalErrorCount: 1,
            dominantCategory: category,
            environmentCheck: envHealth,
            retryFingerprint: fingerprint,
        };
    }

    /**
     * 결정론적 핑거프린트 생성 (패턴 추적용)
     * (category:source:code:count) 튜플의 결합
     */
    private static buildFingerprint(groups: ErrorGroup[]): string {
        return groups
            .map(g => `${g.category}:${g.source}:${g.representativeCode}:${g.count}`)
            .join('|');
    }
}
