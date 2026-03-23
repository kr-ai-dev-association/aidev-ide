/**
 * Action Registry
 * 액션 정의를 등록하고 관리하는 레지스트리
 */

import {
    ActionType,
    ActionDefinition,
    ActionHandler,
    Action,
    ActionResult,
    ValidationRule,
    Permission
} from './types';

export class ActionRegistry {
    private static instance: ActionRegistry;
    private actions: Map<ActionType, ActionDefinition> = new Map();
    private customActions: Map<string, ActionDefinition> = new Map();

    private constructor() {
        this.registerDefaultActions();
    }

    public static getInstance(): ActionRegistry {
        if (!ActionRegistry.instance) {
            ActionRegistry.instance = new ActionRegistry();
        }
        return ActionRegistry.instance;
    }

    /**
     * 액션 정의를 등록합니다
     */
    public register(definition: ActionDefinition): void {
        if (this.actions.has(definition.type)) {
            console.warn(`[ActionRegistry] Action type "${definition.type}" is already registered. Overwriting.`);
        }
        this.actions.set(definition.type, definition);
    }

    /**
     * 커스텀 액션을 등록합니다
     */
    public registerCustom(id: string, definition: ActionDefinition): void {
        if (this.customActions.has(id)) {
            console.warn(`[ActionRegistry] Custom action "${id}" is already registered. Overwriting.`);
        }
        this.customActions.set(id, definition);
        console.log(`[ActionRegistry] Registered custom action: ${id} - ${definition.name}`);
    }

    /**
     * 액션 정의를 가져옵니다
     */
    public get(type: ActionType): ActionDefinition | undefined {
        return this.actions.get(type);
    }

    /**
     * 커스텀 액션 정의를 가져옵니다
     */
    public getCustom(id: string): ActionDefinition | undefined {
        return this.customActions.get(id);
    }

    /**
     * 모든 액션 타입을 가져옵니다
     */
    public getAllTypes(): ActionType[] {
        return Array.from(this.actions.keys());
    }

    /**
     * 모든 커스텀 액션 ID를 가져옵니다
     */
    public getAllCustomIds(): string[] {
        return Array.from(this.customActions.keys());
    }

    /**
     * 액션 정의 존재 여부를 확인합니다
     */
    public has(type: ActionType): boolean {
        return this.actions.has(type);
    }

    /**
     * 커스텀 액션 존재 여부를 확인합니다
     */
    public hasCustom(id: string): boolean {
        return this.customActions.has(id);
    }

    /**
     * 기본 액션들을 등록합니다
     */
    private registerDefaultActions(): void {
        // CODE_GENERATION 액션
        this.register({
            type: ActionType.CODE_GENERATION,
            name: 'Code Generation',
            description: 'Generate or modify code files',
            permissions: [Permission.READ_FILE, Permission.WRITE_FILE],
            validation: [
                { field: 'filePath', type: 'required', message: 'File path is required' },
                { field: 'code', type: 'required', message: 'Code content is required' }
            ],
            handler: this.createPlaceholderHandler('code_generation')
        });

        // FILE_OPERATION 액션
        this.register({
            type: ActionType.FILE_OPERATION,
            name: 'File Operation',
            description: 'Create, update, delete, or move files',
            permissions: [Permission.READ_FILE, Permission.WRITE_FILE, Permission.DELETE_FILE],
            validation: [
                { field: 'operation', type: 'required', message: 'Operation type is required' },
                { field: 'sourcePath', type: 'required', message: 'Source path is required' }
            ],
            handler: this.createPlaceholderHandler('file_operation')
        });

        // TERMINAL_COMMAND 액션
        this.register({
            type: ActionType.TERMINAL_COMMAND,
            name: 'Terminal Command',
            description: 'Execute terminal commands',
            permissions: [Permission.EXECUTE_COMMAND],
            validation: [
                { field: 'command', type: 'required', message: 'Command is required' }
            ],
            handler: this.createPlaceholderHandler('terminal_command')
        });

        // ANALYSIS 액션
        this.register({
            type: ActionType.ANALYSIS,
            name: 'Code Analysis',
            description: 'Analyze code for errors, performance, or security issues',
            permissions: [Permission.READ_FILE],
            validation: [
                { field: 'analysisType', type: 'required', message: 'Analysis type is required' }
            ],
            handler: this.createPlaceholderHandler('analysis')
        });

        // VERIFICATION 액션
        this.register({
            type: ActionType.VERIFICATION,
            name: 'Verification',
            description: 'Verify execution results against expected output',
            permissions: [Permission.READ_FILE],
            validation: [],
            handler: this.createPlaceholderHandler('verification')
        });

        // SEARCH 액션
        this.register({
            type: ActionType.SEARCH,
            name: 'Code Search',
            description: 'Search for code patterns or symbols',
            permissions: [Permission.READ_FILE],
            validation: [
                { field: 'query', type: 'required', message: 'Search query is required' }
            ],
            handler: this.createPlaceholderHandler('search')
        });

        // FILE_READ 액션
        this.register({
            type: ActionType.FILE_READ,
            name: 'Read File',
            description: 'Read the content of one or more files',
            permissions: [Permission.READ_FILE],
            validation: [
                { field: 'path', type: 'required', message: 'File path is required' }
            ],
            handler: this.createPlaceholderHandler('file_read')
        });

        // FILE_LIST 액션
        this.register({
            type: ActionType.FILE_LIST,
            name: 'List Files',
            description: 'List files in a directory or by glob patterns',
            permissions: [Permission.READ_FILE],
            validation: [
                { field: 'path', type: 'required', message: 'Directory path is required' }
            ],
            handler: this.createPlaceholderHandler('file_list')
        });

        // FILE_SEARCH 액션
        this.register({
            type: ActionType.FILE_SEARCH,
            name: 'File Content Search',
            description: 'Search within files by keyword or regex',
            permissions: [Permission.READ_FILE],
            validation: [
                { field: 'pattern', type: 'required', message: 'Search pattern is required' }
            ],
            handler: this.createPlaceholderHandler('file_search')
        });

        // REFACTOR 액션
        this.register({
            type: ActionType.REFACTOR,
            name: 'Code Refactoring',
            description: 'Refactor code (rename, extract, inline, move)',
            permissions: [Permission.READ_FILE, Permission.WRITE_FILE],
            validation: [
                { field: 'refactorType', type: 'required', message: 'Refactor type is required' }
            ],
            handler: this.createPlaceholderHandler('refactor')
        });

    }

    /**
     * 플레이스홀더 핸들러를 생성합니다 (실제 구현은 ActionManager에서 주입)
     */
    private createPlaceholderHandler(type: string): ActionHandler {
        return async (action: Action): Promise<ActionResult> => {
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
    public updateHandler(type: ActionType, handler: ActionHandler): void {
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
    public clear(): void {
        this.actions.clear();
        this.customActions.clear();
        this.registerDefaultActions();
    }
}

