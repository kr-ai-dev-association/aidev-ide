/**
 * Terminal History
 * 터미널 명령어 히스토리를 관리하는 클래스
 */
export class TerminalHistory {
    entries = [];
    maxEntries = 1000;
    /**
     * 히스토리 엔트리를 추가합니다
     */
    add(sessionId, sessionName, command) {
        const entry = {
            sessionId,
            sessionName,
            command
        };
        this.entries.push(entry);
        // 최대 개수 제한
        if (this.entries.length > this.maxEntries) {
            const excess = this.entries.length - this.maxEntries;
            this.entries = this.entries.slice(excess);
            console.log(`[TerminalHistory] Trimmed ${excess} old entries`);
        }
    }
    /**
     * 모든 히스토리를 가져옵니다
     */
    getAll() {
        return [...this.entries];
    }
    /**
     * 필터링된 히스토리를 가져옵니다
     */
    getFiltered(filter) {
        return this.entries.filter(entry => {
            // 세션 ID 필터
            if (filter.sessionId && entry.sessionId !== filter.sessionId) {
                return false;
            }
            // 시간 범위 필터
            if (filter.startTime && entry.command.timestamp < filter.startTime) {
                return false;
            }
            if (filter.endTime && entry.command.timestamp > filter.endTime) {
                return false;
            }
            // 명령어 패턴 필터
            if (filter.command) {
                const pattern = new RegExp(filter.command, 'i');
                if (!pattern.test(entry.command.command)) {
                    return false;
                }
            }
            // Exit code 필터
            if (filter.exitCode !== undefined && entry.command.exitCode !== filter.exitCode) {
                return false;
            }
            return true;
        });
    }
    /**
     * 특정 세션의 히스토리를 가져옵니다
     */
    getBySession(sessionId) {
        return this.entries.filter(entry => entry.sessionId === sessionId);
    }
    /**
     * 최근 N개의 엔트리를 가져옵니다
     */
    getRecent(count = 50) {
        return this.entries.slice(-count);
    }
    /**
     * 성공한 명령어만 가져옵니다
     */
    getSuccessful() {
        return this.entries.filter(entry => entry.command.exitCode === 0);
    }
    /**
     * 실패한 명령어만 가져옵니다
     */
    getFailed() {
        return this.entries.filter(entry => entry.command.exitCode !== undefined && entry.command.exitCode !== 0);
    }
    /**
     * 명령어를 검색합니다
     */
    search(query) {
        const pattern = new RegExp(query, 'i');
        return this.entries.filter(entry => pattern.test(entry.command.command));
    }
    /**
     * 가장 많이 사용된 명령어를 가져옵니다
     */
    getMostUsed(count = 10) {
        const commandCounts = new Map();
        for (const entry of this.entries) {
            const cmd = entry.command.command;
            commandCounts.set(cmd, (commandCounts.get(cmd) || 0) + 1);
        }
        return Array.from(commandCounts.entries())
            .map(([command, count]) => ({ command, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, count);
    }
    /**
     * 히스토리를 초기화합니다
     */
    clear() {
        const count = this.entries.length;
        this.entries = [];
        console.log(`[TerminalHistory] Cleared ${count} entries`);
    }
    /**
     * 특정 세션의 히스토리를 삭제합니다
     */
    clearSession(sessionId) {
        const before = this.entries.length;
        this.entries = this.entries.filter(entry => entry.sessionId !== sessionId);
        const removed = before - this.entries.length;
        console.log(`[TerminalHistory] Removed ${removed} entries for session ${sessionId}`);
    }
    /**
     * 오래된 엔트리를 삭제합니다
     */
    clearOld(olderThanMs) {
        const cutoff = Date.now() - olderThanMs;
        const before = this.entries.length;
        this.entries = this.entries.filter(entry => entry.command.timestamp >= cutoff);
        const removed = before - this.entries.length;
        console.log(`[TerminalHistory] Removed ${removed} old entries`);
    }
    /**
     * 최대 엔트리 수를 설정합니다
     */
    setMaxEntries(max) {
        this.maxEntries = max;
        if (this.entries.length > max) {
            const excess = this.entries.length - max;
            this.entries = this.entries.slice(excess);
            console.log(`[TerminalHistory] Trimmed to ${max} entries (removed ${excess})`);
        }
    }
    /**
     * 통계를 가져옵니다
     */
    getStats() {
        const uniqueCommands = new Set(this.entries.map(e => e.command.command));
        const successful = this.entries.filter(e => e.command.exitCode === 0);
        const failed = this.entries.filter(e => e.command.exitCode !== undefined && e.command.exitCode !== 0);
        const withDuration = this.entries.filter(e => e.command.duration !== undefined);
        const totalDuration = withDuration.reduce((sum, e) => sum + (e.command.duration || 0), 0);
        const averageDuration = withDuration.length > 0 ? totalDuration / withDuration.length : 0;
        return {
            totalCommands: this.entries.length,
            uniqueCommands: uniqueCommands.size,
            successfulCommands: successful.length,
            failedCommands: failed.length,
            averageDuration,
            oldestEntry: this.entries.length > 0 ? this.entries[0].command.timestamp : undefined,
            newestEntry: this.entries.length > 0 ? this.entries[this.entries.length - 1].command.timestamp : undefined
        };
    }
    /**
     * 히스토리를 JSON으로 내보냅니다
     */
    export() {
        return JSON.stringify(this.entries, null, 2);
    }
    /**
     * JSON에서 히스토리를 가져옵니다
     */
    import(json) {
        try {
            const imported = JSON.parse(json);
            if (Array.isArray(imported)) {
                this.entries = imported;
                console.log(`[TerminalHistory] Imported ${imported.length} entries`);
            }
            else {
                console.error('[TerminalHistory] Invalid import format');
            }
        }
        catch (error) {
            console.error('[TerminalHistory] Failed to import:', error);
        }
    }
}
//# sourceMappingURL=TerminalHistory.js.map