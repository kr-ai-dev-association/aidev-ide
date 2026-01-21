"use strict";
/**
 * Action Registry
 * 액션 정의를 등록하고 관리하는 레지스트리
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActionRegistry = void 0;
const types_1 = require("./types");
class ActionRegistry {
    static instance;
    actions = new Map();
    customActions = new Map();
    constructor() {
        this.registerDefaultActions();
    }
    static getInstance() {
        if (!ActionRegistry.instance) {
            ActionRegistry.instance = new ActionRegistry();
        }
        return ActionRegistry.instance;
    }
    /**
     * 액션 정의를 등록합니다
     */
    register(definition) {
        if (this.actions.has(definition.type)) {
            console.warn(`[ActionRegistry] Action type "${definition.type}" is already registered. Overwriting.`);
        }
        this.actions.set(definition.type, definition);
        console.log(`[ActionRegistry] Registered action: ${definition.type} - ${definition.name}`);
    }
    /**
     * 커스텀 액션을 등록합니다
     */
    registerCustom(id, definition) {
        if (this.customActions.has(id)) {
            console.warn(`[ActionRegistry] Custom action "${id}" is already registered. Overwriting.`);
        }
        this.customActions.set(id, definition);
        console.log(`[ActionRegistry] Registered custom action: ${id} - ${definition.name}`);
    }
    /**
     * 액션 정의를 가져옵니다
     */
    get(type) {
        return this.actions.get(type);
    }
    /**
     * 커스텀 액션 정의를 가져옵니다
     */
    getCustom(id) {
        return this.customActions.get(id);
    }
    /**
     * 모든 액션 타입을 가져옵니다
     */
    getAllTypes() {
        return Array.from(this.actions.keys());
    }
    /**
     * 모든 커스텀 액션 ID를 가져옵니다
     */
    getAllCustomIds() {
        return Array.from(this.customActions.keys());
    }
    /**
     * 액션 정의 존재 여부를 확인합니다
     */
    has(type) {
        return this.actions.has(type);
    }
    /**
     * 커스텀 액션 존재 여부를 확인합니다
     */
    hasCustom(id) {
        return this.customActions.has(id);
    }
    /**
     * 기본 액션들을 등록합니다
     */
    registerDefaultActions() {
        // CODE_GENERATION 액션
        this.register({
            type: types_1.ActionType.CODE_GENERATION,
            name: 'Code Generation',
            description: 'Generate or modify code files',
            permissions: [types_1.Permission.READ_FILE, types_1.Permission.WRITE_FILE],
            validation: [
                { field: 'filePath', type: 'required', message: 'File path is required' },
                { field: 'code', type: 'required', message: 'Code content is required' }
            ],
            handler: this.createPlaceholderHandler('code_generation')
        });
        // FILE_OPERATION 액션
        this.register({
            type: types_1.ActionType.FILE_OPERATION,
            name: 'File Operation',
            description: 'Create, update, delete, or move files',
            permissions: [types_1.Permission.READ_FILE, types_1.Permission.WRITE_FILE, types_1.Permission.DELETE_FILE],
            validation: [
                { field: 'operation', type: 'required', message: 'Operation type is required' },
                { field: 'sourcePath', type: 'required', message: 'Source path is required' }
            ],
            handler: this.createPlaceholderHandler('file_operation')
        });
        // TERMINAL_COMMAND 액션
        this.register({
            type: types_1.ActionType.TERMINAL_COMMAND,
            name: 'Terminal Command',
            description: 'Execute terminal commands',
            permissions: [types_1.Permission.EXECUTE_COMMAND],
            validation: [
                { field: 'command', type: 'required', message: 'Command is required' }
            ],
            handler: this.createPlaceholderHandler('terminal_command')
        });
        // ANALYSIS 액션
        this.register({
            type: types_1.ActionType.ANALYSIS,
            name: 'Code Analysis',
            description: 'Analyze code for errors, performance, or security issues',
            permissions: [types_1.Permission.READ_FILE],
            validation: [
                { field: 'analysisType', type: 'required', message: 'Analysis type is required' }
            ],
            handler: this.createPlaceholderHandler('analysis')
        });
        // VERIFICATION 액션
        this.register({
            type: types_1.ActionType.VERIFICATION,
            name: 'Verification',
            description: 'Verify execution results against expected output',
            permissions: [types_1.Permission.READ_FILE],
            validation: [],
            handler: this.createPlaceholderHandler('verification')
        });
        // SEARCH 액션
        this.register({
            type: types_1.ActionType.SEARCH,
            name: 'Code Search',
            description: 'Search for code patterns or symbols',
            permissions: [types_1.Permission.READ_FILE],
            validation: [
                { field: 'query', type: 'required', message: 'Search query is required' }
            ],
            handler: this.createPlaceholderHandler('search')
        });
        // FILE_READ 액션
        this.register({
            type: types_1.ActionType.FILE_READ,
            name: 'Read File',
            description: 'Read the content of one or more files',
            permissions: [types_1.Permission.READ_FILE],
            validation: [
                { field: 'path', type: 'required', message: 'File path is required' }
            ],
            handler: this.createPlaceholderHandler('file_read')
        });
        // FILE_LIST 액션
        this.register({
            type: types_1.ActionType.FILE_LIST,
            name: 'List Files',
            description: 'List files in a directory or by glob patterns',
            permissions: [types_1.Permission.READ_FILE],
            validation: [
                { field: 'path', type: 'required', message: 'Directory path is required' }
            ],
            handler: this.createPlaceholderHandler('file_list')
        });
        // FILE_SEARCH 액션
        this.register({
            type: types_1.ActionType.FILE_SEARCH,
            name: 'File Content Search',
            description: 'Search within files by keyword or regex',
            permissions: [types_1.Permission.READ_FILE],
            validation: [
                { field: 'pattern', type: 'required', message: 'Search pattern is required' }
            ],
            handler: this.createPlaceholderHandler('file_search')
        });
        // REFACTOR 액션
        this.register({
            type: types_1.ActionType.REFACTOR,
            name: 'Code Refactoring',
            description: 'Refactor code (rename, extract, inline, move)',
            permissions: [types_1.Permission.READ_FILE, types_1.Permission.WRITE_FILE],
            validation: [
                { field: 'refactorType', type: 'required', message: 'Refactor type is required' }
            ],
            handler: this.createPlaceholderHandler('refactor')
        });
        console.log('[ActionRegistry] Default actions registered');
    }
    /**
     * 플레이스홀더 핸들러를 생성합니다 (실제 구현은 ActionManager에서 주입)
     */
    createPlaceholderHandler(type) {
        return async (action) => {
            console.warn(`[ActionRegistry] Placeholder handler called for ${type}. This should be replaced by ActionManager.`);
            return {
                success: false,
                actionId: action.id,
                message: `Handler not implemented for ${type}`,
                error: {
                    code: 'NOT_IMPLEMENTED',
                    message: `Handler for action type "${type}" is not implemented`
                }
            };
        };
    }
    /**
     * 액션 핸들러를 업데이트합니다
     */
    updateHandler(type, handler) {
        const definition = this.actions.get(type);
        if (!definition) {
            throw new Error(`Action type "${type}" is not registered`);
        }
        definition.handler = handler;
        console.log(`[ActionRegistry] Updated handler for action: ${type}`);
    }
    /**
     * 레지스트리를 초기화합니다 (테스트용)
     */
    clear() {
        this.actions.clear();
        this.customActions.clear();
        this.registerDefaultActions();
    }
}
exports.ActionRegistry = ActionRegistry;
//# sourceMappingURL=ActionRegistry.js.map