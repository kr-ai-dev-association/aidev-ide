/**
 * Usage Metrics Manager
 * 확장 프로그램의 리소스 사용량 및 성능 지표를 추적하는 매니저
 * v9.7.0: Phase 3 모니터링
 */
/**
 * 사용량 지표 관리자
 */
export class UsageMetricsManager {
    static instance;
    metrics;
    llmCallRecords = [];
    toolExecutionRecords = [];
    memoryCheckInterval = null;
    MAX_RECORDS = 1000; // 최대 기록 수
    constructor() {
        this.metrics = this.initializeMetrics();
        this.startMemoryMonitoring();
    }
    static getInstance() {
        if (!UsageMetricsManager.instance) {
            UsageMetricsManager.instance = new UsageMetricsManager();
        }
        return UsageMetricsManager.instance;
    }
    /**
     * 메트릭 초기화
     */
    initializeMetrics() {
        return {
            memoryUsage: 0,
            peakMemory: 0,
            llmCallCount: 0,
            llmTotalTokens: 0,
            llmAvgResponseTime: 0,
            llmErrors: 0,
            toolExecutionCount: 0,
            toolSuccessCount: 0,
            toolFailureCount: 0,
            toolAvgExecutionTime: 0,
            sessionStartTime: Date.now(),
            sessionDuration: 0,
            turnCount: 0,
            filesCreated: 0,
            filesModified: 0,
            filesRead: 0,
            contextCompactionCount: 0,
            tokensSaved: 0,
        };
    }
    /**
     * 메모리 모니터링 시작 (30초 간격)
     */
    startMemoryMonitoring() {
        this.updateMemoryUsage();
        this.memoryCheckInterval = setInterval(() => {
            this.updateMemoryUsage();
        }, 30000);
    }
    /**
     * 메모리 사용량 업데이트
     */
    updateMemoryUsage() {
        const memUsage = process.memoryUsage();
        const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
        this.metrics.memoryUsage = heapUsedMB;
        if (heapUsedMB > this.metrics.peakMemory) {
            this.metrics.peakMemory = heapUsedMB;
        }
        // 세션 지속 시간 업데이트
        this.metrics.sessionDuration = Date.now() - this.metrics.sessionStartTime;
    }
    /**
     * LLM 호출 기록
     */
    recordLLMCall(responseTime, tokenCount, success) {
        this.metrics.llmCallCount++;
        this.metrics.llmTotalTokens += tokenCount;
        if (!success) {
            this.metrics.llmErrors++;
        }
        // 기록 추가
        this.llmCallRecords.push({
            timestamp: Date.now(),
            responseTime,
            tokenCount,
            success,
        });
        // 오래된 기록 제거
        if (this.llmCallRecords.length > this.MAX_RECORDS) {
            this.llmCallRecords = this.llmCallRecords.slice(-this.MAX_RECORDS);
        }
        // 평균 응답 시간 계산
        const successfulCalls = this.llmCallRecords.filter(r => r.success);
        if (successfulCalls.length > 0) {
            const totalTime = successfulCalls.reduce((sum, r) => sum + r.responseTime, 0);
            this.metrics.llmAvgResponseTime = Math.round(totalTime / successfulCalls.length);
        }
        console.log(`[UsageMetrics] LLM call recorded: ${responseTime}ms, ${tokenCount} tokens, success=${success}`);
    }
    /**
     * 도구 실행 기록
     */
    recordToolExecution(toolName, executionTime, success) {
        this.metrics.toolExecutionCount++;
        if (success) {
            this.metrics.toolSuccessCount++;
        }
        else {
            this.metrics.toolFailureCount++;
        }
        // 기록 추가
        this.toolExecutionRecords.push({
            timestamp: Date.now(),
            toolName,
            executionTime,
            success,
        });
        // 오래된 기록 제거
        if (this.toolExecutionRecords.length > this.MAX_RECORDS) {
            this.toolExecutionRecords = this.toolExecutionRecords.slice(-this.MAX_RECORDS);
        }
        // 평균 실행 시간 계산
        if (this.toolExecutionRecords.length > 0) {
            const totalTime = this.toolExecutionRecords.reduce((sum, r) => sum + r.executionTime, 0);
            this.metrics.toolAvgExecutionTime = Math.round(totalTime / this.toolExecutionRecords.length);
        }
    }
    /**
     * 턴 카운트 증가
     */
    incrementTurnCount() {
        this.metrics.turnCount++;
    }
    /**
     * 파일 생성 기록
     */
    recordFileCreated() {
        this.metrics.filesCreated++;
    }
    /**
     * 파일 수정 기록
     */
    recordFileModified() {
        this.metrics.filesModified++;
    }
    /**
     * 파일 읽기 기록
     */
    recordFileRead() {
        this.metrics.filesRead++;
    }
    /**
     * 컨텍스트 압축 기록
     */
    recordContextCompaction(tokensSaved) {
        this.metrics.contextCompactionCount++;
        this.metrics.tokensSaved += tokensSaved;
    }
    /**
     * 현재 메트릭 가져오기
     */
    getMetrics() {
        this.updateMemoryUsage();
        return { ...this.metrics };
    }
    /**
     * 메트릭 요약 문자열 생성
     */
    getMetricsSummary() {
        this.updateMemoryUsage();
        const m = this.metrics;
        const duration = this.formatDuration(m.sessionDuration);
        return `📊 사용량 통계
━━━━━━━━━━━━━━━━━━━━━━━━━━━
메모리: ${m.memoryUsage}MB / 최고: ${m.peakMemory}MB
세션 시간: ${duration}
━━━━━━━━━━━━━━━━━━━━━━━━━━━
LLM 호출: ${m.llmCallCount}회 (오류: ${m.llmErrors})
평균 응답: ${m.llmAvgResponseTime}ms
총 토큰: ${m.llmTotalTokens.toLocaleString()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━
도구 실행: ${m.toolExecutionCount}회
성공: ${m.toolSuccessCount} / 실패: ${m.toolFailureCount}
평균 실행: ${m.toolAvgExecutionTime}ms
━━━━━━━━━━━━━━━━━━━━━━━━━━━
파일 작업: 생성 ${m.filesCreated} / 수정 ${m.filesModified} / 읽기 ${m.filesRead}
컨텍스트 압축: ${m.contextCompactionCount}회 (${m.tokensSaved.toLocaleString()} 토큰 절약)
턴 수: ${m.turnCount}`;
    }
    /**
     * 시간 포맷팅
     */
    formatDuration(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        if (hours > 0) {
            return `${hours}시간 ${minutes % 60}분`;
        }
        else if (minutes > 0) {
            return `${minutes}분 ${seconds % 60}초`;
        }
        else {
            return `${seconds}초`;
        }
    }
    /**
     * 도구별 실행 통계 가져오기
     */
    getToolStats() {
        const stats = new Map();
        for (const record of this.toolExecutionRecords) {
            const current = stats.get(record.toolName) || { total: 0, success: 0, totalTime: 0 };
            current.total++;
            if (record.success) {
                current.success++;
            }
            current.totalTime += record.executionTime;
            stats.set(record.toolName, current);
        }
        const result = new Map();
        for (const [toolName, data] of stats) {
            result.set(toolName, {
                count: data.total,
                avgTime: Math.round(data.totalTime / data.total),
                successRate: Math.round((data.success / data.total) * 100),
            });
        }
        return result;
    }
    /**
     * 메트릭 리셋 (새 세션 시작)
     */
    resetMetrics() {
        this.metrics = this.initializeMetrics();
        this.llmCallRecords = [];
        this.toolExecutionRecords = [];
        console.log('[UsageMetrics] Metrics reset for new session');
    }
    /**
     * 리소스 정리
     */
    dispose() {
        if (this.memoryCheckInterval) {
            clearInterval(this.memoryCheckInterval);
            this.memoryCheckInterval = null;
        }
    }
}
//# sourceMappingURL=UsageMetricsManager.js.map