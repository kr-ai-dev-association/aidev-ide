/**
 * Session Manager
 * 세션을 관리하는 클래스
 */

import * as vscode from 'vscode';
import {
    Session,
    SessionState,
    ConversationEntry,
    ConversationSummary,
    ExtensionMode
} from './types';
import { ProjectContextCache } from '../context/ProjectContextCache';
import { estimateTokens } from '../../../utils';

export class SessionManager {
    private static instance: SessionManager;
    private context: vscode.ExtensionContext;
    private sessions: Map<string, Session> = new Map();
    private currentSessionId?: string;
    private contextCache?: ProjectContextCache;
    private compactorInstance?: any; // ConversationCompactor (lazy load)

    private constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.loadSessions();

        // 프로젝트 컨텍스트 캐시 초기화
        this.contextCache = ProjectContextCache.getInstance(context);
    }

    public static getInstance(context?: vscode.ExtensionContext): SessionManager {
        if (!SessionManager.instance && context) {
            SessionManager.instance = new SessionManager(context);
        }
        return SessionManager.instance!;
    }

    /**
     * 세션을 생성합니다
     */
    public createSession(projectPath: string): Session {
        const sessionId = this.generateSessionId();
        
        const session: Session = {
            id: sessionId,
            projectPath,
            createdAt: Date.now(),
            lastActiveAt: Date.now(),
            conversationHistory: [],
            state: {
                currentModel: undefined,
                currentMode: undefined,
                recentActions: [],
                recentCommands: [],
                recentFiles: [],
                customSettings: {}
            }
        };

        this.sessions.set(sessionId, session);
        this.currentSessionId = sessionId;
        this.saveSessions();

        console.log(`[SessionManager] Created session: ${sessionId} for ${projectPath}`);

        return session;
    }

    /**
     * 세션을 가져옵니다
     */
    public getSession(sessionId?: string): Session | null {
        const id = sessionId || this.currentSessionId;
        if (!id) {
            return null;
        }

        const session = this.sessions.get(id);
        if (session) {
            // 마지막 활성 시간 업데이트
            session.lastActiveAt = Date.now();
        }

        return session || null;
    }

    /**
     * 현재 세션을 가져옵니다
     */
    public getCurrentSession(): Session | null {
        return this.getSession();
    }

    /**
     * 세션을 업데이트합니다
     */
    public updateSession(sessionId: string, data: Partial<Session>): void {
        const session = this.sessions.get(sessionId);
        if (!session) {
            console.warn(`[SessionManager] Session not found: ${sessionId}`);
            return;
        }

        Object.assign(session, data);
        session.lastActiveAt = Date.now();
        this.saveSessions();

        console.log(`[SessionManager] Updated session: ${sessionId}`);
    }

    /**
     * 세션 상태를 업데이트합니다
     */
    public updateSessionState(sessionId: string, state: Partial<SessionState>): void {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return;
        }

        session.state = {
            ...session.state,
            ...state
        };
        session.lastActiveAt = Date.now();
        this.saveSessions();
    }

    /**
     * 대화 기록을 추가합니다
     */
    public addConversationEntry(sessionId: string, entry: ConversationEntry): void {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return;
        }

        session.conversationHistory.push(entry);
        
        // 최대 100개만 유지
        if (session.conversationHistory.length > 100) {
            session.conversationHistory.shift();
        }

        session.lastActiveAt = Date.now();
        this.saveSessions();
    }

    /**
     * 대화 기록을 가져옵니다
     */
    public getConversationHistory(sessionId?: string, maxEntries?: number): ConversationEntry[] {
        const session = this.getSession(sessionId);
        if (!session) {
            return [];
        }

        const history = session.conversationHistory;
        if (maxEntries) {
            return history.slice(-maxEntries);
        }

        return history;
    }

    /**
     * 대화 히스토리를 초기화합니다
     */
    public clearConversationHistory(sessionId?: string): void {
        const session = this.getSession(sessionId);
        if (!session) {
            return;
        }

        session.conversationHistory = [];
        session.lastActiveAt = Date.now();
        this.saveSessions();
        console.log(`[SessionManager] Cleared conversation history for session: ${session.id}`);
    }

    /**
     * 모든 세션을 가져옵니다
     */
    public getAllSessions(): Session[] {
        return Array.from(this.sessions.values());
    }

    /**
     * 프로젝트 경로로 세션을 찾습니다
     */
    public findSessionByProject(projectPath: string): Session | null {
        for (const session of this.sessions.values()) {
            if (session.projectPath === projectPath) {
                return session;
            }
        }
        return null;
    }

    /**
     * 현재 세션 ID를 설정합니다
     */
    public setCurrentSession(sessionId: string): boolean {
        if (this.sessions.has(sessionId)) {
            this.currentSessionId = sessionId;
            console.log(`[SessionManager] Current session set to: ${sessionId}`);
            return true;
        }
        return false;
    }

    /**
     * 세션을 삭제합니다
     */
    public deleteSession(sessionId: string): boolean {
        if (this.sessions.has(sessionId)) {
            this.sessions.delete(sessionId);
            
            if (this.currentSessionId === sessionId) {
                this.currentSessionId = undefined;
            }

            this.saveSessions();
            console.log(`[SessionManager] Deleted session: ${sessionId}`);
            return true;
        }
        return false;
    }

    /**
     * 오래된 세션을 정리합니다
     */
    public cleanupOldSessions(olderThanMs: number = 7 * 24 * 60 * 60 * 1000): number {
        const cutoff = Date.now() - olderThanMs;
        let removed = 0;

        for (const [sessionId, session] of this.sessions.entries()) {
            if (session.lastActiveAt < cutoff) {
                this.sessions.delete(sessionId);
                if (this.currentSessionId === sessionId) {
                    this.currentSessionId = undefined;
                }
                removed++;
            }
        }

        if (removed > 0) {
            this.saveSessions();
            console.log(`[SessionManager] Cleaned up ${removed} old sessions`);
        }

        return removed;
    }

    /**
     * 세션을 로드합니다
     */
    private loadSessions(): void {
        try {
            const stored = this.context.globalState.get<{ sessions: Session[], currentSessionId?: string }>('codepilot.sessions');
            if (stored && stored.sessions) {
                for (const session of stored.sessions) {
                    this.sessions.set(session.id, session);
                }
                this.currentSessionId = stored.currentSessionId;
                console.log(`[SessionManager] Loaded ${this.sessions.size} sessions`);
            }
        } catch (error) {
            console.error('[SessionManager] Failed to load sessions:', error);
        }
    }

    /**
     * 세션을 저장합니다
     */
    private saveSessions(): void {
        try {
            const sessions = Array.from(this.sessions.values());
            this.context.globalState.update('codepilot.sessions', {
                sessions,
                currentSessionId: this.currentSessionId
            });
        } catch (error) {
            console.error('[SessionManager] Failed to save sessions:', error);
        }
    }

    /**
     * 세션 ID를 생성합니다
     */
    private generateSessionId(): string {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // ===== 프로젝트 컨텍스트 캐시 관련 메서드 =====

    /**
     * 프로젝트의 우선순위 파일들을 미리 캐싱합니다
     */
    public async preloadProjectContext(projectPath: string): Promise<void> {
        if (!this.contextCache) {
            return;
        }
        await this.contextCache.preloadPriorityFiles(projectPath);
    }

    /**
     * 프로젝트 컨텍스트 캐시 무효화
     */
    public invalidateProjectCache(projectPath: string): void {
        if (!this.contextCache) {
            return;
        }
        this.contextCache.invalidateProject(projectPath);
    }

    /**
     * 캐시 통계 가져오기
     */
    public getCacheStats(): {
        totalEntries: number;
        totalSize: number;
        hitCount: number;
        missCount: number;
        hitRate: number;
    } | null {
        if (!this.contextCache) {
            return null;
        }
        return this.contextCache.getStats();
    }

    /**
     * 전체 캐시 초기화
     */
    public clearAllCache(): void {
        if (!this.contextCache) {
            return;
        }
        this.contextCache.clearAll();
    }

    /**
     * 현재 세션의 누적 통계를 가져옵니다
     */
    public getCumulativeSessionStats(): {
        messageCount: number;
        totalTokensUsed: number;
    } {
        const session = this.getCurrentSession();
        if (!session) {
            return { messageCount: 0, totalTokensUsed: 0 };
        }

        // totalTokensUsed가 없으면 각 ConversationEntry의 tokensUsed 합산 (구버전 호환)
        let totalTokens = session.totalTokensUsed || 0;
        if (totalTokens === 0 && session.conversationHistory.length > 0) {
            totalTokens = session.conversationHistory.reduce((sum, entry) => {
                return sum + (entry.tokensUsed || 0);
            }, 0);
            // 계산된 값을 세션에 저장
            if (totalTokens > 0) {
                session.totalTokensUsed = totalTokens;
                this.saveSessions();
            }
        }

        return {
            messageCount: session.conversationHistory.length,
            totalTokensUsed: totalTokens
        };
    }

    /**
     * 현재 세션에 사용된 토큰을 누적합니다
     */
    public addTokensUsed(tokens: number): void {
        const session = this.getCurrentSession();
        if (!session) {
            return;
        }

        session.totalTokensUsed = (session.totalTokensUsed || 0) + tokens;
        session.lastActiveAt = Date.now();
        this.saveSessions();
        console.log(`[SessionManager] Added ${tokens} tokens. Total: ${session.totalTokensUsed}`);
    }

    /**
     * 현재 세션의 누적 토큰을 초기화합니다
     */
    public resetTokensUsed(): void {
        const session = this.getCurrentSession();
        if (!session) {
            return;
        }

        session.totalTokensUsed = 0;
        this.saveSessions();
        console.log('[SessionManager] Token usage reset');
    }

    /**
     * 현재 세션의 누적 토큰을 특정 값으로 설정합니다 (압축 후 사용)
     */
    public setTotalTokensUsed(tokens: number): void {
        const session = this.getCurrentSession();
        if (!session) {
            return;
        }

        const previousTokens = session.totalTokensUsed || 0;
        session.totalTokensUsed = tokens;
        this.saveSessions();
        console.log(`[SessionManager] Token usage set: ${previousTokens} -> ${tokens}`);
    }

    /**
     * 세션 히스토리 정리 (토큰 임계값 초과 시 오래된 항목 제거)
     * LLM 요약 없이 구조화된 메타데이터만 유지
     */
    public trimSessionHistory(keepRecentCount: number = 20): void {
        const session = this.getCurrentSession();
        if (!session) {
            return;
        }

        const history = session.conversationHistory;
        if (history.length <= keepRecentCount) {
            return;
        }

        // 오래된 항목 제거, 최근 keepRecentCount개만 유지
        const removedCount = history.length - keepRecentCount;
        session.conversationHistory = history.slice(-keepRecentCount);
        session.lastActiveAt = Date.now();
        this.saveSessions();

        console.log(`[SessionManager] Session trimmed. Removed ${removedCount} old entries, kept ${keepRecentCount}`);
    }

    /**
     * 압축된 요약을 세션에 추가
     */
    public addCompactedSummary(sessionId: string, summary: string): void {
        const session = this.sessions.get(sessionId);
        if (!session) {
            console.warn(`[SessionManager] Session not found: ${sessionId}`);
            return;
        }

        if (!session.compactedSummaries) {
            session.compactedSummaries = [];
        }

        const summaryEntry: ConversationSummary = {
            id: `summary_${Date.now()}`,
            createdAt: Date.now(),
            messageRange: {
                startIndex: 0,
                endIndex: session.conversationHistory.length - 1
            },
            summary,
            filesModified: [],
            filesCreated: [],
            keyContext: [],
            primaryRequest: '',
            currentWork: ''
        };

        session.compactedSummaries.push(summaryEntry);
        session.lastActiveAt = Date.now();
        this.saveSessions();

        console.log(`[SessionManager] Added compacted summary to session ${sessionId}`);
    }

    /**
     * 세션 히스토리 정리가 필요한지 확인
     */
    public needsSessionTrim(maxEntries: number = 50): boolean {
        const session = this.getCurrentSession();
        if (!session) {
            return false;
        }
        return session.conversationHistory.length > maxEntries;
    }

    /**
     * 대화 히스토리를 컨텍스트 문자열로 변환 (프롬프트용)
     * 요약 + 최근 대화 구조로 반환
     */
    public getHistoryContext(maxEntries: number = 10): string {
        const session = this.getCurrentSession();
        if (!session || session.conversationHistory.length === 0) {
            return '';
        }

        let context = '';

        // 1. 압축된 요약 추가
        if (session.compactedSummaries && session.compactedSummaries.length > 0) {
            const latestSummary = session.compactedSummaries[session.compactedSummaries.length - 1];
            context += `[이전 대화 요약]\n${latestSummary.summary}\n\n`;
        }

        // 2. 최근 대화 원본 추가
        const recentHistory = session.conversationHistory.slice(-maxEntries);

        for (const entry of recentHistory) {
            // 파일 변경 정보 추가
            const fileChanges = [];
            if (entry.filesCreated && entry.filesCreated.length > 0) {
                fileChanges.push(`생성: ${entry.filesCreated.join(', ')}`);
            }
            if (entry.filesModified && entry.filesModified.length > 0) {
                fileChanges.push(`수정: ${entry.filesModified.join(', ')}`);
            }
            const fileInfo = fileChanges.length > 0 ? `\n  - 파일: ${fileChanges.join('; ')}` : '';

            context += `[User]: ${entry.userRequest}\n`;
            if (entry.assistantResponse) {
                context += `[Assistant]: ${entry.assistantResponse}${fileInfo}\n\n`;
            } else {
                // CODE 모드: 응답 대신 파일 변경 정보
                const summary = fileInfo || '작업 완료';
                context += `[Assistant]: ${summary}\n\n`;
            }
        }

        return context;
    }

    /**
     * ConversationCompactor 인스턴스 설정 (lazy injection)
     */
    public setCompactor(compactor: any): void {
        this.compactorInstance = compactor;
    }

    /**
     * 세션 히스토리 자동 압축 (LLM 요약 포함)
     * ConversationCompactor를 사용하여 오래된 대화를 요약
     */
    public async compactSessionIfNeeded(maxTokens: number): Promise<void> {
        const session = this.getCurrentSession();
        if (!session || !this.compactorInstance) {
            return;
        }

        // 토큰 계산
        let totalTokens = 0;
        for (const entry of session.conversationHistory) {
            const content = entry.userRequest + (entry.assistantResponse || '');
            totalTokens += estimateTokens(content);
        }

        // 임계값 초과 시 압축 (80%)
        if (totalTokens > maxTokens * 0.8) {
            await this.compactSessionHistory(maxTokens);
        }
    }

    /**
     * 세션 히스토리 압축 실행 (LLM 요약)
     */
    private async compactSessionHistory(maxTokens: number): Promise<void> {
        const session = this.getCurrentSession();
        if (!session || !this.compactorInstance) {
            return;
        }

        const history = session.conversationHistory;
        const keepRecentCount = 20; // 최근 20개 원본 유지

        if (history.length <= keepRecentCount) {
            return;
        }

        try {
            // 오래된 항목과 최근 항목 분리
            const oldEntries = history.slice(0, -keepRecentCount);
            const recentEntries = history.slice(-keepRecentCount);

            // LLM으로 요약 생성 (ConversationCompactor 사용)
            const conversationText = oldEntries.map(entry => {
                const files = [
                    ...(entry.filesCreated || []),
                    ...(entry.filesModified || [])
                ].join(', ');
                return `[User]: ${entry.userRequest}\n[Assistant]: ${entry.assistantResponse || files || '작업 완료'}`;
            }).join('\n\n');

            // compactorInstance를 통해 요약 생성
            const summaryResult = await this.compactorInstance.generateSummaryFromText(conversationText);

            // 요약 저장
            if (!session.compactedSummaries) {
                session.compactedSummaries = [];
            }

            const summaryEntry: ConversationSummary = {
                id: `summary_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
                createdAt: Date.now(),
                messageRange: {
                    startIndex: 0,
                    endIndex: oldEntries.length - 1
                },
                summary: summaryResult,
                filesModified: this.extractFilesFromEntries(oldEntries, 'modified'),
                filesCreated: this.extractFilesFromEntries(oldEntries, 'created'),
                keyContext: [],
                primaryRequest: oldEntries[0]?.userRequest || '',
                currentWork: oldEntries[oldEntries.length - 1]?.userRequest || ''
            };

            session.compactedSummaries.push(summaryEntry);
            session.conversationHistory = recentEntries;

            // 오래된 엔트리에 요약 ID 참조 추가
            oldEntries.forEach(entry => {
                entry.compactedSummaryId = summaryEntry.id;
            });

            // 압축 후 토큰 재계산 및 업데이트 (중요: 재시작 후에도 정확한 게이지 표시)
            let compactedTokens = estimateTokens(summaryResult); // 요약 토큰
            for (const entry of recentEntries) {
                const content = entry.userRequest + (entry.assistantResponse || '');
                compactedTokens += estimateTokens(content);
            }
            session.totalTokensUsed = compactedTokens;

            this.saveSessions();
            console.log(`[SessionManager] Session compacted. ${oldEntries.length} entries summarized, ${keepRecentCount} kept. Tokens: ${compactedTokens}`);
        } catch (error) {
            console.error('[SessionManager] Failed to compact session history:', error);
            // 압축 실패 시 fallback: 단순 trim
            this.trimSessionHistory(keepRecentCount);
        }
    }

    /**
     * 엔트리에서 파일 목록 추출
     */
    private extractFilesFromEntries(entries: ConversationEntry[], type: 'created' | 'modified'): string[] {
        const files = new Set<string>();
        for (const entry of entries) {
            const fileList = type === 'created' ? entry.filesCreated : entry.filesModified;
            if (fileList) {
                fileList.forEach(f => files.add(f));
            }
        }
        return Array.from(files);
    }
}

