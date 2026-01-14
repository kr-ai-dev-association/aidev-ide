"use strict";
/**
 * Context Manager
 * LLM에게 제공할 컨텍스트를 수집하는 메인 매니저
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContextManager = void 0;
const vscode = __importStar(require("vscode"));
const types_1 = require("./types");
const types_2 = require("../error/types");
const FileContext_1 = require("./file/FileContext");
const EditorContext_1 = require("./EditorContext");
const TerminalContext_1 = require("./TerminalContext");
const utils_1 = require("../../../utils");
const RelevantFilesFinder_1 = require("./file/RelevantFilesFinder");
const FileContextTracker_1 = require("./file/FileContextTracker");
class ContextManager {
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
        this.fileCollector = new FileContext_1.FileContextCollector();
        this.editorCollector = new EditorContext_1.EditorContextCollector();
        this.fileContextTracker = FileContextTracker_1.FileContextTracker.getInstance();
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
        this.terminalCollector = new TerminalContext_1.TerminalContextCollector(terminalManager);
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
        this.relevantFilesService = new RelevantFilesFinder_1.RelevantFilesFinder(projectManager);
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
        const types = options.types || Object.values(types_1.ContextType);
        const contextData = {
            metadata: {
                collectedAt: Date.now(),
                types: [],
                tokenEstimate: 0,
                compressed: false
            }
        };
        // 파일 컨텍스트
        if (types.includes(types_1.ContextType.FILE)) {
            const fileContext = await this.collectFileContext(options);
            if (fileContext) {
                contextData.file = fileContext;
                contextData.metadata.types.push(types_1.ContextType.FILE);
            }
        }
        // 선택 텍스트 컨텍스트
        if (types.includes(types_1.ContextType.SELECTION)) {
            const selectionContext = await this.collectSelectionContext();
            if (selectionContext) {
                contextData.selection = selectionContext;
                contextData.metadata.types.push(types_1.ContextType.SELECTION);
            }
        }
        // 커서 컨텍스트
        if (types.includes(types_1.ContextType.CURSOR)) {
            const cursorContext = await this.collectCursorContext();
            if (cursorContext) {
                contextData.cursor = cursorContext;
                contextData.metadata.types.push(types_1.ContextType.CURSOR);
            }
        }
        // 터미널 컨텍스트
        if (types.includes(types_1.ContextType.TERMINAL) && this.terminalCollector) {
            const terminalContext = await this.collectTerminalContext();
            if (terminalContext) {
                contextData.terminal = terminalContext;
                contextData.metadata.types.push(types_1.ContextType.TERMINAL);
            }
        }
        // 에러 컨텍스트
        if (types.includes(types_1.ContextType.ERROR) && this.errorManager) {
            const errorContexts = await this.collectErrorContext(options);
            if (errorContexts.length > 0) {
                contextData.errors = errorContexts;
                contextData.metadata.types.push(types_1.ContextType.ERROR);
            }
        }
        // 관련 파일 컨텍스트
        if (types.includes(types_1.ContextType.RELATED_FILES) && contextData.file) {
            const relatedFiles = await this.collectRelatedFiles(contextData.file.path, options);
            if (relatedFiles) {
                contextData.relatedFiles = relatedFiles;
                contextData.metadata.types.push(types_1.ContextType.RELATED_FILES);
            }
        }
        // 프로젝트 컨텍스트
        if (types.includes(types_1.ContextType.PROJECT)) {
            const projectContext = await this.collectProjectContext();
            if (projectContext) {
                contextData.project = projectContext;
                contextData.metadata.types.push(types_1.ContextType.PROJECT);
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
     * 토큰을 추정합니다
     */
    estimateTokens(contextData) {
        let tokens = 0;
        if (contextData.file?.content) {
            tokens += (0, utils_1.estimateTokens)(contextData.file.content);
        }
        if (contextData.selection?.text) {
            tokens += (0, utils_1.estimateTokens)(contextData.selection.text);
        }
        if (contextData.cursor?.surroundingLines) {
            tokens += (0, utils_1.estimateTokens)(contextData.cursor.surroundingLines.join('\n'));
        }
        if (contextData.terminal?.lastOutput) {
            tokens += (0, utils_1.estimateTokens)(contextData.terminal.lastOutput);
        }
        if (contextData.errors) {
            for (const error of contextData.errors) {
                tokens += (0, utils_1.estimateTokens)(error.message);
                if (error.stackTrace) {
                    tokens += (0, utils_1.estimateTokens)(error.stackTrace);
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
            options.types.push(types_1.ContextType.FILE);
        }
        if (request.includeSelection) {
            options.types.push(types_1.ContextType.SELECTION);
        }
        if (request.includeCursor) {
            options.types.push(types_1.ContextType.CURSOR);
        }
        if (request.includeTerminal) {
            options.types.push(types_1.ContextType.TERMINAL);
        }
        if (request.includeErrors) {
            options.types.push(types_1.ContextType.ERROR);
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
     * ErrorSource를 문자열로 변환합니다
     */
    mapErrorSourceToString(source) {
        switch (source) {
            case types_2.ErrorSource.TERMINAL:
                return 'terminal';
            case types_2.ErrorSource.DIAGNOSTIC:
                return 'diagnostic';
            case types_2.ErrorSource.RUNTIME:
            case types_2.ErrorSource.COMPILE:
            case types_2.ErrorSource.LINT:
            case types_2.ErrorSource.SYSTEM:
                return 'runtime';
            default:
                return 'runtime';
        }
    }
}
exports.ContextManager = ContextManager;
//# sourceMappingURL=ContextManager.js.map