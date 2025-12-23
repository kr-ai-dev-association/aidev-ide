/**
 * Terminal Manager 타입 정의
 * 터미널 세션 생명주기를 관리하는 매니저의 타입들
 */

import * as vscode from 'vscode';

/**
 * 터미널 세션
 */
export interface TerminalSession {
    id: string;
    name: string;
    terminal: vscode.Terminal;
    status: TerminalStatus;
    createdAt: number;
    lastUsedAt: number;
    history: TerminalCommand[];
    cwd?: string;
    metadata?: TerminalMetadata;
}

/**
 * 터미널 상태
 */
export enum TerminalStatus {
    CREATING = 'creating',
    READY = 'ready',
    BUSY = 'busy',
    WAITING_INPUT = 'waiting_input',
    CLOSED = 'closed',
    ERROR = 'error'
}

/**
 * 터미널 메타데이터
 */
export interface TerminalMetadata {
    type?: 'default' | 'build' | 'test' | 'dev-server';
    project?: string;
    framework?: string;
    shellType?: 'bash' | 'zsh' | 'powershell' | 'cmd' | 'sh';
}

/**
 * 터미널 명령어
 */
export interface TerminalCommand {
    id: string;
    command: string;
    cwd?: string;
    timestamp: number;
    exitCode?: number;
    duration?: number;
    output?: TerminalOutput;
}

/**
 * 터미널 출력
 */
export interface TerminalOutput {
    stdout: string;
    stderr: string;
    combined: string;
}

/**
 * 터미널 생성 옵션
 */
export interface TerminalCreateOptions {
    name?: string;
    cwd?: string;
    env?: Record<string, string>;
    shellPath?: string;
    shellArgs?: string[];
    iconPath?: vscode.Uri | { light: vscode.Uri; dark: vscode.Uri } | vscode.ThemeIcon;
    color?: vscode.ThemeColor;
    message?: string;
    location?: vscode.TerminalLocation | vscode.TerminalEditorLocationOptions | vscode.TerminalSplitLocationOptions;
    hideFromUser?: boolean;
    strictEnv?: boolean;
    metadata?: TerminalMetadata;
}

/**
 * 터미널 출력 캡처 옵션
 */
export interface CaptureOptions {
    includeStdout?: boolean;
    includeStderr?: boolean;
    maxBufferSize?: number;
    timeout?: number;
}

/**
 * 터미널 히스토리 필터
 */
export interface HistoryFilter {
    sessionId?: string;
    startTime?: number;
    endTime?: number;
    command?: string;
    exitCode?: number;
}

/**
 * 터미널 히스토리 엔트리
 */
export interface HistoryEntry {
    sessionId: string;
    sessionName: string;
    command: TerminalCommand;
}

/**
 * 터미널 통계
 */
export interface TerminalStats {
    totalSessions: number;
    activeSessions: number;
    totalCommands: number;
    averageCommandDuration: number;
    mostUsedCommands: Array<{ command: string; count: number }>;
}

