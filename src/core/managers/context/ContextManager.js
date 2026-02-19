/**
 * Context Manager
 * LLM에게 제공할 컨텍스트를 수집하는 메인 매니저
 */
import * as vscode from 'vscode';
import { ContextType } from './types';
import { ErrorSource } from '../error/types';
import { FileContextCollector } from './file/FileContext';
import { EditorContextCollector } from './EditorContext';
import { TerminalContextCollector } from './TerminalContext';
import { estimateTokens } from '../../../utils';
import { RelevantFilesFinder } from './file/RelevantFilesFinder';
import { FileContextTracker } from './file/FileContextTracker';
export class ContextManager {
    static instance;
    fileCollector;
    editorCollector;
    terminalCollector;
    terminalManager;
    errorManager;
    projectManager;
    relevantFilesService;
    fileContextTracker;
    constructor() {
        this.fileCollector = new FileContextCollector();
        this.editorCollector = new EditorContextCollector();
        this.fileContextTracker = FileContextTracker.getInstance();
    }
    static getInstance() {
        if (!ContextManager.instance) {
            ContextManager.instance = new ContextManager();
        }
        return ContextManager.instance;
    }
    /**
     * Terminal Manager를 설정합니다
     */
    setTerminalManager(terminalManager) {
        this.terminalManager = terminalManager;
        this.terminalCollector = new TerminalContextCollector(terminalManager);
        console.log('[ContextManager] Terminal Manager set');
    }
    /**
     * Error Manager를 설정합니다
     */
    setErrorManager(errorManager) {
        this.errorManager = errorManager;
        console.log('[ContextManager] Error Manager set');
    }
    /**
     * Project Manager를 설정합니다
     */
    setProjectManager(projectManager) {
        this.projectManager = projectManager;
        this.relevantFilesService = new RelevantFilesFinder(projectManager);
        console.log('[ContextManager] Project Manager set');
    }
    /**
     * LLM Manager를 설정합니다 (내용 기반 relevance scoring용)
     */
    setLLMManager(llmManager) {
        if (this.relevantFilesService) {
            this.relevantFilesService.setLLMManager(llmManager);
            console.log('[ContextManager] LLM Manager set for RelevantFilesFinder');
        }
    }
    /**
     * 관련 파일 컨텍스트를 가져옵니다
     */
    async getRelevantFilesContext(userQuery, abortSignal, conversationHistory) {
        if (!this.relevantFilesService || !this.projectManager) {
            throw new Error('Project Manager not set');
        }
        const projectInfo = this.projectManager.getCurrentProject();
        if (!projectInfo) {
            throw new Error('Project not initialized');
        }
        return await this.relevantFilesService.getRelevantFilesContext(userQuery, projectInfo.root, abortSignal, conversationHistory);
    }
    /**
     * 컨텍스트를 수집합니다
     */
    async collectContext(options = {}) {
        console.log('[ContextManager] Collecting context...');
        const types = options.types || Object.values(ContextType);
        const contextData = {
            metadata: {
                collectedAt: Date.now(),
                types: [],
                tokenEstimate: 0,
                compressed: false
            }
        };
        // 파일 컨텍스트
        if (types.includes(ContextType.FILE)) {
            const fileContext = await this.collectFileContext(options);
            if (fileContext) {
                contextData.file = fileContext;
                contextData.metadata.types.push(ContextType.FILE);
            }
        }
        // 선택 텍스트 컨텍스트
        if (types.includes(ContextType.SELECTION)) {
            const selectionContext = await this.collectSelectionContext();
            if (selectionContext) {
                contextData.selection = selectionContext;
                contextData.metadata.types.push(ContextType.SELECTION);
            }
        }
        // 커서 컨텍스트
        if (types.includes(ContextType.CURSOR)) {
            const cursorContext = await this.collectCursorContext();
            if (cursorContext) {
                contextData.cursor = cursorContext;
                contextData.metadata.types.push(ContextType.CURSOR);
            }
        }
        // 터미널 컨텍스트
        if (types.includes(ContextType.TERMINAL) && this.terminalCollector) {
            const terminalContext = await this.collectTerminalContext();
            if (terminalContext) {
                contextData.terminal = terminalContext;
                contextData.metadata.types.push(ContextType.TERMINAL);
            }
        }
        // 에러 컨텍스트
        if (types.includes(ContextType.ERROR) && this.errorManager) {
            const errorContexts = await this.collectErrorContext(options);
            if (errorContexts.length > 0) {
                contextData.errors = errorContexts;
                contextData.metadata.types.push(ContextType.ERROR);
            }
        }
        // 관련 파일 컨텍스트
        if (types.includes(ContextType.RELATED_FILES) && contextData.file) {
            const relatedFiles = await this.collectRelatedFiles(contextData.file.path, options);
            if (relatedFiles) {
                contextData.relatedFiles = relatedFiles;
                contextData.metadata.types.push(ContextType.RELATED_FILES);
            }
        }
        // 프로젝트 컨텍스트
        if (types.includes(ContextType.PROJECT)) {
            const projectContext = await this.collectProjectContext();
            if (projectContext) {
                contextData.project = projectContext;
                contextData.metadata.types.push(ContextType.PROJECT);
            }
        }
        // 열린 탭 컨텍스트
        if (types.includes(ContextType.OPEN_TABS)) {
            const openTabsContext = await this.collectOpenTabsContext();
            if (openTabsContext) {
                contextData.openTabs = openTabsContext;
                contextData.metadata.types.push(ContextType.OPEN_TABS);
            }
        }
        // 토큰 추정
        contextData.metadata.tokenEstimate = this.estimateTokens(contextData);
        // 토큰 제한 확인
        if (options.maxTokens && contextData.metadata.tokenEstimate > options.maxTokens) {
            console.warn(`[ContextManager] Token estimate (${contextData.metadata.tokenEstimate}) exceeds max (${options.maxTokens})`);
            // 압축 필요 (나중에 구현)
        }
        console.log(`[ContextManager] Context collected: ${contextData.metadata.types.length} types, ${contextData.metadata.tokenEstimate} tokens`);
        return contextData;
    }
    /**
     * 파일 컨텍스트를 수집합니다
     */
    async collectFileContext(options) {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return null;
        }
        const filePath = editor.document.uri.fsPath;
        // 파일 크기 확인
        if (options.maxFileSize) {
            const stats = require('fs').statSync(filePath);
            if (stats.size > options.maxFileSize) {
                console.warn(`[ContextManager] File too large: ${stats.size} bytes, max: ${options.maxFileSize}`);
                return null;
            }
        }
        // 파일이 완전히 써질 때까지 잠시 대기 (큰 파일/저장 지연 대비)
        if (this.fileContextTracker) {
            try {
                this.fileContextTracker.trackFile(filePath);
                await this.fileContextTracker.waitForFileStability(filePath, 3000, 400, 200);
            }
            catch (error) {
                console.warn('[ContextManager] waitForFileStability failed:', error);
            }
        }
        const fileContext = await this.fileCollector.collect(filePath);
        // 내용 포함 여부 확인
        if (!options.includeContent && fileContext) {
            fileContext.content = ''; // 내용 제거
        }
        return fileContext;
    }
    /**
     * 선택 텍스트 컨텍스트를 수집합니다
     */
    async collectSelectionContext() {
        return await this.editorCollector.collectSelectionContext();
    }
    /**
     * 커서 컨텍스트를 수집합니다
     */
    async collectCursorContext() {
        return await this.editorCollector.collectCursorContext();
    }
    /**
     * 터미널 컨텍스트를 수집합니다
     */
    async collectTerminalContext() {
        if (!this.terminalCollector) {
            return null;
        }
        return await this.terminalCollector.collect();
    }
    /**
     * 에러 컨텍스트를 수집합니다
     */
    async collectErrorContext(options) {
        if (!this.errorManager) {
            return [];
        }
        const unresolvedErrors = this.errorManager.getUnresolvedErrors();
        const maxErrors = options.maxFiles || 5;
        return unresolvedErrors.slice(0, maxErrors).map(error => ({
            message: error.message,
            type: error.category,
            source: this.mapErrorSourceToString(error.source),
            file: error.location?.file,
            line: error.location?.line,
            column: error.location?.column,
            stackTrace: error.stackTrace?.raw,
            timestamp: error.timestamp
        }));
    }
    /**
     * 관련 파일 컨텍스트를 수집합니다
     */
    async collectRelatedFiles(filePath, options) {
        const maxFiles = options.maxRelatedFiles || 10;
        // Import된 파일 찾기
        const imports = await this.fileCollector.findImportedFiles(filePath);
        const limitedImports = imports.slice(0, maxFiles);
        // 같은 디렉토리 파일
        const relatedFiles = await this.fileCollector['findRelatedFiles'](filePath);
        const limitedRelated = relatedFiles.slice(0, maxFiles - limitedImports.length);
        if (limitedImports.length === 0 && limitedRelated.length === 0) {
            return null;
        }
        return {
            imports: limitedImports,
            importedBy: [], // TODO: 역참조 구현
            sameDirectory: limitedRelated,
            sameType: [] // TODO: 같은 타입 파일 찾기
        };
    }
    /**
     * 프로젝트 컨텍스트를 수집합니다
     */
    async collectProjectContext() {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return null;
        }
        // 간단한 프로젝트 정보
        return {
            type: 'unknown', // TODO: Project Manager와 통합
            framework: undefined,
            buildTool: undefined,
            dependencies: [],
            structure: ''
        };
    }
    /**
     * 열린 탭 컨텍스트를 수집합니다
     */
    async collectOpenTabsContext() {
        const tabGroups = vscode.window.tabGroups;
        if (!tabGroups || tabGroups.all.length === 0) {
            return null;
        }
        const tabs = [];
        const activeEditor = vscode.window.activeTextEditor;
        const activeTabPath = activeEditor?.document.uri.fsPath;
        for (const group of tabGroups.all) {
            for (const tab of group.tabs) {
                // 파일 탭만 처리 (터미널, 설정 등 제외)
                if (tab.input instanceof vscode.TabInputText) {
                    const uri = tab.input.uri;
                    const filePath = uri.fsPath;
                    const fileName = filePath.split(/[/\\]/).pop() || filePath;
                    // 언어 감지
                    let language = 'plaintext';
                    try {
                        const document = await vscode.workspace.openTextDocument(uri);
                        language = document.languageId;
                    }
                    catch {
                        // 파일 확장자로 fallback
                        const ext = fileName.split('.').pop() || '';
                        const extToLang = {
                            'ts': 'typescript', 'tsx': 'typescriptreact',
                            'js': 'javascript', 'jsx': 'javascriptreact',
                            'py': 'python', 'java': 'java', 'go': 'go',
                            'rs': 'rust', 'c': 'c', 'cpp': 'cpp', 'h': 'c',
                            'css': 'css', 'scss': 'scss', 'less': 'less',
                            'html': 'html', 'vue': 'vue', 'svelte': 'svelte',
                            'json': 'json', 'yaml': 'yaml', 'yml': 'yaml',
                            'md': 'markdown', 'sh': 'shellscript', 'bash': 'shellscript'
                        };
                        language = extToLang[ext] || 'plaintext';
                    }
                    tabs.push({
                        path: filePath,
                        name: fileName,
                        language,
                        isActive: filePath === activeTabPath,
                        isDirty: tab.isDirty || false
                    });
                }
            }
        }
        if (tabs.length === 0) {
            return null;
        }
        return {
            tabs,
            activeTabPath
        };
    }
    /**
     * 열린 탭 목록을 가져옵니다 (public 메서드)
     */
    async getOpenTabsContext() {
        return await this.collectOpenTabsContext();
    }
    /**
     * 토큰을 추정합니다
     */
    estimateTokens(contextData) {
        let tokens = 0;
        if (contextData.file?.content) {
            tokens += estimateTokens(contextData.file.content);
        }
        if (contextData.selection?.text) {
            tokens += estimateTokens(contextData.selection.text);
        }
        if (contextData.cursor?.surroundingLines) {
            tokens += estimateTokens(contextData.cursor.surroundingLines.join('\n'));
        }
        if (contextData.terminal?.lastOutput) {
            tokens += estimateTokens(contextData.terminal.lastOutput);
        }
        if (contextData.errors) {
            for (const error of contextData.errors) {
                tokens += estimateTokens(error.message);
                if (error.stackTrace) {
                    tokens += estimateTokens(error.stackTrace);
                }
            }
        }
        return tokens;
    }
    /**
     * 현재 파일 컨텍스트를 가져옵니다
     */
    async getCurrentFileContext() {
        return await this.collectFileContext({ includeContent: true });
    }
    /**
     * 선택된 텍스트 컨텍스트를 가져옵니다
     */
    async getSelectedTextContext() {
        return await this.collectSelectionContext();
    }
    /**
     * 커서 컨텍스트를 가져옵니다
     */
    async getCursorContext() {
        return await this.collectCursorContext();
    }
    /**
     * 최근 에러 컨텍스트를 가져옵니다
     */
    async getRecentErrors(maxCount = 5) {
        return await this.collectErrorContext({ maxFiles: maxCount });
    }
    /**
     * 관련 파일을 가져옵니다
     */
    async getRelatedFiles(filePath, maxFiles = 10) {
        const relatedFiles = await this.collectRelatedFiles(filePath, { maxRelatedFiles: maxFiles });
        if (!relatedFiles) {
            return [];
        }
        return [
            ...relatedFiles.imports,
            ...relatedFiles.importedBy,
            ...relatedFiles.sameDirectory,
            ...relatedFiles.sameType
        ];
    }
    /**
     * LLM 요청을 위한 컨텍스트를 빌드합니다
     */
    async buildLLMContext(request) {
        const options = {
            types: [],
            includeContent: true,
            maxTokens: request.maxTokens
        };
        if (request.includeFile) {
            options.types.push(ContextType.FILE);
        }
        if (request.includeSelection) {
            options.types.push(ContextType.SELECTION);
        }
        if (request.includeCursor) {
            options.types.push(ContextType.CURSOR);
        }
        if (request.includeTerminal) {
            options.types.push(ContextType.TERMINAL);
        }
        if (request.includeErrors) {
            options.types.push(ContextType.ERROR);
        }
        return await this.collectContext(options);
    }
    /**
     * 프로필 컨텍스트를 빌드합니다
     */
    buildProfileContext(profile, projectType) {
        if (!this.projectManager) {
            throw new Error('Project Manager not set');
        }
        return this.projectManager.buildProfileContext(profile, projectType);
    }
    /**
     * 의도 컨텍스트를 빌드합니다
     * 작업 유형별 지침은 PromptComposer의 task 프롬프트에서 자동으로 포함됩니다.
     */
    buildIntentContext(intent) {
        const lines = [];
        lines.push(`카테고리: ${intent.category}`);
        lines.push(`세부 유형: ${intent.subtype}`);
        lines.push(`작업 유형: ${intent.taskType}`);
        lines.push(`신뢰도: ${(intent.confidence * 100).toFixed(0)}%`);
        if (intent.reasoning) {
            lines.push(`근거: ${intent.reasoning}`);
        }
        return lines.join('\n');
    }
    /**
     * 프로젝트의 세부 기술 스택을 감지합니다
     * ProjectManager에 위임
     */
    async detectDetailedStack(forceRefresh = false) {
        if (!this.projectManager) {
            console.warn('[ContextManager] Project Manager not set, cannot detect stack');
            return null;
        }
        return await this.projectManager.detectDetailedStack(forceRefresh);
    }
    /**
     * 캐시된 세부 스택 반환 (동기)
     * ProjectManager에 위임
     */
    getCachedDetailedStack() {
        return this.projectManager?.getCachedDetailedStack();
    }
    /**
     * 스택 캐시 초기화
     * ProjectManager에 위임
     */
    clearStackCache() {
        this.projectManager?.clearStackCache();
    }
    /**
     * 프로젝트 전체 컨텍스트 빌드 (프로필 + 스택 정보)
     * ProjectManager에 위임
     */
    async buildFullProjectContext(profile, projectType) {
        if (!this.projectManager) {
            return '';
        }
        return await this.projectManager.buildFullProjectContext(profile, projectType);
    }
    /**
     * 프레임워크 규칙 프롬프트 생성
     * 스택 정보를 LLM 컨텍스트용 문자열로 변환
     */
    async getFrameworkRulesPrompt(forceRefresh = false) {
        if (!this.projectManager) {
            return '';
        }
        // 스택 감지
        const detailedStack = await this.projectManager.detectDetailedStack(forceRefresh);
        if (!detailedStack || detailedStack.stacks.length === 0) {
            return '';
        }
        // 스택 요약 문자열 반환
        return this.projectManager.getStackSummary();
    }
    /**
     * ErrorSource를 문자열로 변환합니다
     */
    mapErrorSourceToString(source) {
        switch (source) {
            case ErrorSource.TERMINAL:
                return 'terminal';
            case ErrorSource.DIAGNOSTIC:
                return 'diagnostic';
            case ErrorSource.RUNTIME:
            case ErrorSource.COMPILE:
            case ErrorSource.LINT:
            case ErrorSource.SYSTEM:
                return 'runtime';
            default:
                return 'runtime';
        }
    }
}
//# sourceMappingURL=ContextManager.js.map