/**
 * Error History
 * 에러 히스토리를 관리하는 클래스
 */
export class ErrorHistory {
    entries = [];
    maxEntries = 1000;
    /**
     * 에러를 추가합니다
     */
    add(error) {
        const entry = {
            error,
            resolved: false
        };
        this.entries.push(entry);
        // 최대 개수 제한
        if (this.entries.length > this.maxEntries) {
            const excess = this.entries.length - this.maxEntries;
            this.entries = this.entries.slice(excess);
            console.log(`[ErrorHistory] Trimmed ${excess} old entries`);
        }
        console.log(`[ErrorHistory] Added error: ${error.id} (${error.category}, ${error.severity})`);
    }
    /**
     * 에러를 해결된 것으로 표시합니다
     */
    resolve(errorId, resolution) {
        const entry = this.entries.find(e => e.error.id === errorId);
        if (!entry) {
            return false;
        }
        entry.resolved = true;
        entry.resolvedAt = Date.now();
        entry.resolution = resolution;
        console.log(`[ErrorHistory] Resolved error: ${errorId}`);
        return true;
    }
    /**
     * 모든 엔트리를 가져옵니다
     */
    getAll() {
        return [...this.entries];
    }
    /**
     * 필터링된 엔트리를 가져옵니다
     */
    getFiltered(filter) {
        return this.entries.filter(entry => {
            const error = entry.error;
            // 소스 필터
            if (filter.source && !filter.source.includes(error.source)) {
                return false;
            }
            // 카테고리 필터
            if (filter.category && !filter.category.includes(error.category)) {
                return false;
            }
            // 심각도 필터
            if (filter.severity && !filter.severity.includes(error.severity)) {
                return false;
            }
            // 시간 범위 필터
            if (filter.startTime && error.timestamp < filter.startTime) {
                return false;
            }
            if (filter.endTime && error.timestamp > filter.endTime) {
                return false;
            }
            // 해결 여부 필터
            if (filter.resolved !== undefined && entry.resolved !== filter.resolved) {
                return false;
            }
            // 파일 필터
            if (filter.file && error.location?.file !== filter.file) {
                return false;
            }
            return true;
        });
    }
    /**
     * 해결되지 않은 에러를 가져옵니다
     */
    getUnresolved() {
        return this.entries.filter(e => !e.resolved);
    }
    /**
     * 해결된 에러를 가져옵니다
     */
    getResolved() {
        return this.entries.filter(e => e.resolved);
    }
    /**
     * 특정 에러를 가져옵니다
     */
    get(errorId) {
        return this.entries.find(e => e.error.id === errorId);
    }
    /**
     * 통계를 가져옵니다
     */
    getStats() {
        const bySource = {};
        const byCategory = {};
        const bySeverity = {};
        let resolved = 0;
        let unresolved = 0;
        let totalResolutionTime = 0;
        let resolvedCount = 0;
        const errorMessages = new Map();
        for (const entry of this.entries) {
            const error = entry.error;
            // 소스별 집계
            bySource[error.source] = (bySource[error.source] || 0) + 1;
            // 카테고리별 집계
            byCategory[error.category] = (byCategory[error.category] || 0) + 1;
            // 심각도별 집계
            bySeverity[error.severity] = (bySeverity[error.severity] || 0) + 1;
            // 해결 여부
            if (entry.resolved) {
                resolved++;
                if (entry.resolvedAt && entry.error.timestamp) {
                    totalResolutionTime += entry.resolvedAt - entry.error.timestamp;
                    resolvedCount++;
                }
            }
            else {
                unresolved++;
            }
            // 메시지별 집계
            const messageKey = error.message.substring(0, 100);
            errorMessages.set(messageKey, (errorMessages.get(messageKey) || 0) + 1);
        }
        const averageResolutionTime = resolvedCount > 0
            ? totalResolutionTime / resolvedCount
            : 0;
        const mostCommonErrors = Array.from(errorMessages.entries())
            .map(([message, count]) => ({ message, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);
        return {
            total: this.entries.length,
            bySource: bySource,
            byCategory: byCategory,
            bySeverity: bySeverity,
            resolved,
            unresolved,
            averageResolutionTime,
            mostCommonErrors
        };
    }
    /**
     * 유사한 에러를 그룹화합니다
     */
    groupSimilar() {
        const groups = new Map();
        for (const entry of this.entries) {
            const error = entry.error;
            const pattern = this.getErrorPattern(error);
            if (!groups.has(pattern)) {
                groups.set(pattern, {
                    id: `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    pattern,
                    errors: [],
                    count: 0,
                    firstOccurrence: error.timestamp,
                    lastOccurrence: error.timestamp,
                    resolved: false
                });
            }
            const group = groups.get(pattern);
            group.errors.push(error);
            group.count++;
            group.firstOccurrence = Math.min(group.firstOccurrence, error.timestamp);
            group.lastOccurrence = Math.max(group.lastOccurrence, error.timestamp);
            group.resolved = group.resolved || entry.resolved;
        }
        return Array.from(groups.values());
    }
    /**
     * 에러 패턴을 추출합니다 (그룹화용)
     */
    getErrorPattern(error) {
        // 카테고리 + 메시지의 첫 부분
        const messagePrefix = error.message.substring(0, 50).toLowerCase();
        return `${error.category}:${messagePrefix}`;
    }
    /**
     * 히스토리를 초기화합니다
     */
    clear() {
        const count = this.entries.length;
        this.entries = [];
        console.log(`[ErrorHistory] Cleared ${count} entries`);
    }
    /**
     * 오래된 엔트리를 제거합니다
     */
    clearOld(olderThanMs) {
        const cutoff = Date.now() - olderThanMs;
        const before = this.entries.length;
        this.entries = this.entries.filter(e => e.error.timestamp >= cutoff);
        const removed = before - this.entries.length;
        console.log(`[ErrorHistory] Removed ${removed} old entries`);
        return removed;
    }
    /**
     * 최대 엔트리 수를 설정합니다
     */
    setMaxEntries(max) {
        this.maxEntries = max;
        if (this.entries.length > max) {
            const excess = this.entries.length - max;
            this.entries = this.entries.slice(excess);
            console.log(`[ErrorHistory] Trimmed to ${max} entries (removed ${excess})`);
        }
    }
}
//# sourceMappingURL=ErrorHistory.js.map