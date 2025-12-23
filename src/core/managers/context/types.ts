/**
 * Context Manager 타입 정의
 * LLM에게 제공할 컨텍스트를 수집하는 매니저의 타입들
 */

import * as vscode from 'vscode';

/**
 * 컨텍스트 타입
 */
export enum ContextType {
    FILE = 'file',
    SELECTION = 'selection',
    CURSOR = 'cursor',
    ERROR = 'error',
    TERMINAL = 'terminal',
    EDIT_HISTORY = 'edit_history',
    RELATED_FILES = 'related_files',
    PROJECT = 'project'
}

/**
 * 파일 컨텍스트
 */
export interface FileContext {
    path: string;
    name: string;
    language: string;
    content: string;
    lines: number;
    size: number;
    isOpen: boolean;
    isDirty: boolean;
    relatedFiles?: string[];
}

/**
 * 선택 텍스트 컨텍스트
 */
export interface SelectionContext {
    text: string;
    startLine: number;
    endLine: number;
    startColumn: number;
    endColumn: number;
    file: string;
    surroundingCode?: string;
}

/**
 * 커서 컨텍스트
 */
export interface CursorContext {
    line: number;
    column: number;
    file: string;
    currentLineText: string;
    surroundingLines: string[];
    symbolAtCursor?: SymbolInfo;
}

/**
 * 심볼 정보
 */
export interface SymbolInfo {
    name: string;
    kind: vscode.SymbolKind;
    range: { start: { line: number; column: number }; end: { line: number; column: number } };
    definition?: string;
}

/**
 * 에러 컨텍스트
 */
export interface ErrorContext {
    message: string;
    type: string;
    source: 'terminal' | 'diagnostic' | 'runtime';
    file?: string;
    line?: number;
    column?: number;
    stackTrace?: string;
    timestamp: number;
}

/**
 * 터미널 컨텍스트
 */
export interface TerminalContext {
    lastCommands: string[];
    lastOutput: string;
    lastErrors: string[];
    currentWorkingDirectory: string;
}

/**
 * 편집 기록 컨텍스트
 */
export interface EditHistoryContext {
    recentEdits: Edit[];
    mostEditedFiles: string[];
}

/**
 * 편집 정보
 */
export interface Edit {
    file: string;
    timestamp: number;
    range: { start: { line: number; column: number }; end: { line: number; column: number } };
    oldText: string;
    newText: string;
}

/**
 * 관련 파일 컨텍스트
 */
export interface RelatedFilesContext {
    imports: string[];
    importedBy: string[];
    sameDirectory: string[];
    sameType: string[];
}

/**
 * 프로젝트 컨텍스트
 */
export interface ProjectContext {
    type: string;
    framework?: string;
    buildTool?: string;
    dependencies?: string[];
    structure?: string;
}

/**
 * 통합 컨텍스트 데이터
 */
export interface ContextData {
    file?: FileContext;
    selection?: SelectionContext;
    cursor?: CursorContext;
    errors?: ErrorContext[];
    terminal?: TerminalContext;
    editHistory?: EditHistoryContext;
    relatedFiles?: RelatedFilesContext;
    project?: ProjectContext;
    metadata: ContextMetadata;
}

/**
 * 컨텍스트 메타데이터
 */
export interface ContextMetadata {
    collectedAt: number;
    types: ContextType[];
    tokenEstimate: number;
    compressed: boolean;
}

/**
 * 컨텍스트 수집 옵션
 */
export interface ContextCollectionOptions {
    types?: ContextType[];
    maxFileSize?: number;
    maxFiles?: number;
    includeContent?: boolean;
    compressContent?: boolean;
    maxTokens?: number;
    includeRelatedFiles?: boolean;
    maxRelatedFiles?: number;
}

/**
 * 컨텍스트 필터
 */
export interface ContextFilter {
    excludeFiles?: string[];
    excludeExtensions?: string[];
    includeOnlyExtensions?: string[];
    maxAge?: number;
}

