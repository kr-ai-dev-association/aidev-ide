/**
 * Session Manager
 * 세션을 관리하는 클래스
 */

import * as vscode from 'vscode';
import {
    Session,
    SessionState,
    ConversationEntry,
    ExtensionMode
} from './types';
import { ProjectContextCache } from '../context/ProjectContextCache';

export class SessionManager {
    private static instance: SessionManager;
    private context: vscode.ExtensionContext;
    private sessions: Map<string, Session> = new Map();
    private currentSessionId?: string;
    private contextCache?: ProjectContextCache;

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
     * 탭별 대화 히스토리를 가져옵니다 (llmService 호환)
     * @param tabType 'code' 또는 'ask'
     * @param maxEntries 최대 엔트리 수 (기본값: 5)
     * @returns 대화 히스토리 배열
     */
    public getTabHistory(tabType: 'code' | 'ask', maxEntries: number = 5): Array<{ userQuery: string, aiResponse?: string, timestamp: number }> {
        const historyKey = tabType === 'code' ? 'codeTabHistory' : 'askTabHistory';
        const history = this.context.globalState.get<Array<{ userQuery: string, aiResponse?: string, timestamp: number }>>(historyKey, []);
        
        if (maxEntries && history.length > maxEntries) {
            return history.slice(-maxEntries);
        }
        
        return history;
    }

    /**
     * 탭별 대화 히스토리에 엔트리를 추가합니다 (llmService 호환)
     * @param tabType 'code' 또는 'ask'
     * @param userQuery 사용자 쿼리
     * @param aiResponse AI 응답 (선택)
     */
    public async addTabHistoryEntry(tabType: 'code' | 'ask', userQuery: string, aiResponse?: string): Promise<void> {
        const historyKey = tabType === 'code' ? 'codeTabHistory' : 'askTabHistory';
        const history = this.context.globalState.get<Array<{ userQuery: string, aiResponse?: string, timestamp: number }>>(historyKey, []);
        
        history.push({
            userQuery,
            aiResponse,
            timestamp: Date.now()
        });

        // 최대 5개 대화만 유지
        const trimmedHistory = history.length > 5 ? history.slice(-5) : history;
        
        await this.context.globalState.update(historyKey, trimmedHistory);
    }

    /**
     * 탭별 대화 히스토리를 컨텍스트 문자열로 반환합니다 (llmService 호환)
     * @param tabType 'code' 또는 'ask'
     * @param maxEntries 최대 엔트리 수 (기본값: 5)
     * @returns 히스토리 컨텍스트 문자열
     */
    public getTabHistoryContext(tabType: 'code' | 'ask', maxEntries: number = 5): string {
        const history = this.getTabHistory(tabType, maxEntries);
        
        if (history.length === 0) {
            return '';
        }

        return '--- 최근 대화 내역 ---\n' +
            history.map((conv, i) => {
                let conversationText = `${i + 1}. 사용자: ${conv.userQuery}`;
                if (conv.aiResponse) {
                    conversationText += `\n   AI: ${conv.aiResponse}`;
                }
                return conversationText;
            }).join('\n\n') + '\n\n';
    }

    /**
     * 탭별 대화 히스토리를 초기화합니다
     * @param tabType 'code' 또는 'ask'
     */
    public async clearTabHistory(tabType: 'code' | 'ask'): Promise<void> {
        const historyKey = tabType === 'code' ? 'codeTabHistory' : 'askTabHistory';
        await this.context.globalState.update(historyKey, []);
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
     * 캐시된 파일 내용 가져오기
     */
    public async getCachedFile(filePath: string): Promise<string | null> {
        if (!this.contextCache) {
            return null;
        }
        return await this.contextCache.getFile(filePath);
    }

    /**
     * 파일을 캐시에 추가
     */
    public async cacheFile(filePath: string): Promise<void> {
        if (!this.contextCache) {
            return;
        }
        await this.contextCache.cacheFile(filePath);
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
}

