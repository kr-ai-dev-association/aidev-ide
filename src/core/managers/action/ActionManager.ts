
/**
 * Action Manager
 * LLM 요청을 실행 가능한 액션으로 변환하고 관리하는 메인 매니저
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { promises as fsPromises } from 'fs';
import {
    Action,
    ActionType,
    ActionResult,
    LLMRequest,
    LLMResponse,
    ActionContext,
    ActionMappingResult,
    ValidationResult,
    Permission,
    FileOperationType
} from './types';
import { ActionRegistry } from './ActionRegistry';
import { ActionValidator } from './ActionValidator';
import { ActionMapper } from './ActionMapper';
import { TerminalManager } from '../terminal/TerminalManager';
import { FileChangeTracker } from './file/FileChangeTracker';
import { FileContextTracker } from '../context/file/FileContextTracker';

export class ActionManager {
    private static instance: ActionManager;
    private registry: ActionRegistry;
    private validator: ActionValidator;
    private mapper: ActionMapper;
    private context?: ActionContext;
    private activeActions: Map<string, Action> = new Map();
    private fileChangeTracker?: FileChangeTracker;
    private fileContextTracker?: FileContextTracker;

    private constructor() {
        this.registry = ActionRegistry.getInstance();
        this.validator = new ActionValidator();
        this.mapper = new ActionMapper();
    }

    /**
     * FileChangeTracker 설정
     */
    public setFileChangeTracker(tracker: FileChangeTracker): void {
        this.fileChangeTracker = tracker;
        console.log('[ActionManager] FileChangeTracker set');
    }

    /**
     * FileContextTracker 설정
     * - 코드/파일 액션 실행 직전에 파일 안정화(waitForFileStability)를 보장하기 위해 사용
     */
    public setFileContextTracker(tracker: FileContextTracker): void {
        this.fileContextTracker = tracker;
        console.log('[ActionManager] FileContextTracker set');
    }

    public static getInstance(): ActionManager {
        if (!ActionManager.instance) {
            ActionManager.instance = new ActionManager();
        }
        return ActionManager.instance;
    }

    /**
     * 액션 컨텍스트를 설정합니다
     */
    public setContext(context: ActionContext): void {
        this.context = context;
        console.log('[ActionManager] Context set:', {
            projectRoot: context.projectRoot,
            currentFile: context.currentFile
        });
    }

    /**
     * 현재 컨텍스트를 가져옵니다
     */
    public getContext(): ActionContext | undefined {
        return this.context;
    }

    /**
     * LLM 요청을 분석하여 액션으로 매핑합니다
     */
    public async mapRequest(llmRequest: LLMRequest): Promise<ActionMappingResult> {
        console.log('[ActionManager] Mapping LLM request to actions');
        console.log('[ActionManager] Query:', llmRequest.query.substring(0, 100) + '...');

        try {
            // LLM 응답이 직접 전달된 경우 (이미 처리된 응답)
            const llmResponse: LLMResponse = {
                content: llmRequest.query,
                actions: undefined,
                explanation: undefined
            };

            // 액션 매핑
            const mappingResult = this.mapper.mapResponse(llmResponse);

            // 컨텍스트 주입
            this.injectContext(mappingResult.actions);

            console.log(`[ActionManager] Mapped ${mappingResult.actions.length} actions`);

            return mappingResult;
        } catch (error) {
            console.error('[ActionManager] Error mapping request:', error);
            throw error;
        }
    }

    /**
     * LLM 응답을 액션으로 매핑합니다
     */
    public async mapResponse(llmResponse: LLMResponse): Promise<ActionMappingResult> {
        console.log('[ActionManager] Mapping LLM response to actions');

        try {
            const mappingResult = this.mapper.mapResponse(llmResponse);
            this.injectContext(mappingResult.actions);

            console.log(`[ActionManager] Mapped ${mappingResult.actions.length} actions`);

            return mappingResult;
        } catch (error) {
            console.error('[ActionManager] Error mapping response:', error);
            throw error;
        }
    }

    /**
     * 액션을 검증합니다
     */
    public async validateAction(action: Action): Promise<ValidationResult> {
        console.log(`[ActionManager] Validating action: ${action.id} (${action.type})`);

        try {
            // 등록된 액션 정의 가져오기
            const definition = this.registry.get(action.type);
            if (!definition) {
                return {
                    valid: false,
                    errors: [{
                        field: 'type',
                        message: `Action type "${action.type}" is not registered`,
                        code: 'UNREGISTERED_TYPE'
                    }]
                };
            }

            // 검증 실행
            const result = this.validator.validate(action, definition.validation);

            if (!result.valid) {
                console.warn(`[ActionManager] Validation failed for action ${action.id}:`, result.errors);
            } else {
                console.log(`[ActionManager] Validation passed for action ${action.id}`);
            }

            return result;
        } catch (error) {
            console.error('[ActionManager] Error validating action:', error);
            return {
                valid: false,
                errors: [{
                    field: 'unknown',
                    message: error instanceof Error ? error.message : String(error),
                    code: 'VALIDATION_ERROR'
                }]
            };
        }
    }

    /**
     * 액션 배열의 의존성을 검증합니다
     */
    public validateDependencies(actions: Action[]): ValidationResult {
        console.log(`[ActionManager] Validating dependencies for ${actions.length} actions`);
        return this.validator.validateDependencies(actions);
    }

    /**
     * 액션을 실행합니다
     * 실제 실행은 Execution Manager에 위임됩니다
     */
    public async executeAction(action: Action): Promise<ActionResult> {
        console.log(`[ActionManager] Executing action: ${action.id} (${action.type})`);

        try {
            // 검증
            const validationResult = await this.validateAction(action);
            if (!validationResult.valid) {
                return {
                    success: false,
                    actionId: action.id,
                    message: 'Validation failed',
                    error: {
                        code: 'VALIDATION_FAILED',
                        message: validationResult.errors.map(e => e.message).join(', '),
                        details: validationResult.errors
                    }
                };
            }

            // 권한 체크
            const permissionResult = this.checkPermissions(action);
            if (!permissionResult.allowed) {
                return {
                    success: false,
                    actionId: action.id,
                    message: 'Permission denied',
                    error: {
                        code: 'PERMISSION_DENIED',
                        message: permissionResult.message || 'Required permissions not granted'
                    }
                };
            }

            // 액션을 활성 목록에 추가
            this.activeActions.set(action.id, action);

            // 액션 타입별 실제 실행
            const startTime = Date.now();
            let result: ActionResult;

            switch (action.type) {
                case 'code_generation':
                    result = await this.executeCodeGeneration(action);
                    break;
                case 'file_operation':
                    result = await this.executeFileOperation(action);
                    break;
                case 'terminal_command':
                    result = await this.executeTerminalCommand(action);
                    break;
                default:
                    // 기본 핸들러 사용
                    const definition = this.registry.get(action.type);
                    if (!definition) {
                        throw new Error(`No definition found for action type: ${action.type}`);
                    }
                    result = await definition.handler(action);
            }

            const duration = Date.now() - startTime;

            // 활성 목록에서 제거
            this.activeActions.delete(action.id);

            console.log(`[ActionManager] Action ${action.id} completed in ${duration}ms`);

            return {
                ...result,
                duration
            };

        } catch (error) {
            this.activeActions.delete(action.id);
            console.error(`[ActionManager] Error executing action ${action.id}:`, error);

            return {
                success: false,
                actionId: action.id,
                message: 'Execution failed',
                error: {
                    code: 'EXECUTION_ERROR',
                    message: error instanceof Error ? error.message : String(error),
                    stack: error instanceof Error ? error.stack : undefined
                }
            };
        }
    }

    /**
     * 여러 액션을 순차적으로 실행합니다
     */
    public async executeActions(actions: Action[]): Promise<ActionResult[]> {
        console.log(`[ActionManager] Executing ${actions.length} actions sequentially`);

        // 의존성 검증
        const depValidation = this.validateDependencies(actions);
        if (!depValidation.valid) {
            console.error('[ActionManager] Dependency validation failed:', depValidation.errors);
            return [{
                success: false,
                actionId: 'batch',
                message: 'Dependency validation failed',
                error: {
                    code: 'DEPENDENCY_ERROR',
                    message: depValidation.errors.map(e => e.message).join(', ')
                }
            }];
        }

        const results: ActionResult[] = [];

        for (const action of actions) {
            // 의존성 확인
            if (action.dependencies && action.dependencies.length > 0) {
                const depsSucceeded = action.dependencies.every(depId => {
                    const depResult = results.find(r => r.actionId === depId);
                    return depResult && depResult.success;
                });

                if (!depsSucceeded) {
                    results.push({
                        success: false,
                        actionId: action.id,
                        message: 'Dependencies failed',
                        error: {
                            code: 'DEPENDENCY_FAILED',
                            message: 'One or more dependencies failed to execute'
                        }
                    });
                    continue;
                }
            }

            // 액션 실행
            const result = await this.executeAction(action);
            results.push(result);

            // 실패 시 중단 여부 (옵션으로 나중에 추가 가능)
            if (!result.success) {
                console.warn(`[ActionManager] Action ${action.id} failed, continuing...`);
            }
        }

        const successCount = results.filter(r => r.success).length;
        console.log(`[ActionManager] Batch execution complete: ${successCount}/${results.length} succeeded`);

        return results;
    }

    /**
     * 컨텍스트를 액션에 주입합니다
     */
    private injectContext(actions: Action[]): void {
        if (!this.context) {
            return;
        }

        for (const action of actions) {
            // 파일 경로가 상대 경로인 경우 프로젝트 루트 기준으로 변환
            if (action.params.filePath && !action.params.filePath.startsWith('/')) {
                action.params.filePath = `${this.context.projectRoot}/${action.params.filePath}`;
            }

            // CWD 설정
            if (!action.params.cwd) {
                action.params.cwd = this.context.workspaceRoot;
            }

            // 환경 변수 주입 (필요 시)
            if (this.context.environmentVariables) {
                // 나중에 환경 변수 처리 로직 추가 가능
            }
        }
    }

    /**
     * 권한을 체크합니다
     */
    private checkPermissions(action: Action): { allowed: boolean; message?: string } {
        // 기본적으로 모든 권한 허용 (나중에 설정에서 제어 가능)
        // 위험한 작업의 경우 사용자에게 확인 요청 필요

        const dangerousPermissions = [
            Permission.DELETE_FILE,
            Permission.NETWORK_ACCESS
        ];

        const hasDangerousPermission = action.permissions.some(p =>
            dangerousPermissions.includes(p)
        );

        if (hasDangerousPermission) {
            // TODO: 나중에 사용자 확인 로직 추가
            console.warn(`[ActionManager] Action ${action.id} requires dangerous permissions:`, action.permissions);
        }

        return { allowed: true };
    }

    /**
     * 활성 액션 목록을 가져옵니다
     */
    public getActiveActions(): Action[] {
        return Array.from(this.activeActions.values());
    }

    /**
     * 특정 액션을 취소합니다
     */
    public cancelAction(actionId: string): boolean {
        if (this.activeActions.has(actionId)) {
            this.activeActions.delete(actionId);
            console.log(`[ActionManager] Cancelled action: ${actionId}`);
            return true;
        }
        return false;
    }

    /**
     * 모든 활성 액션을 취소합니다
     */
    public cancelAllActions(): void {
        const count = this.activeActions.size;
        this.activeActions.clear();
        console.log(`[ActionManager] Cancelled ${count} active actions`);
    }

    /**
     * 액션 레지스트리를 가져옵니다
     */
    public getRegistry(): ActionRegistry {
        return this.registry;
    }

    /**
     * 코드 생성 액션을 실행합니다
     */
    private async executeCodeGeneration(action: Action): Promise<ActionResult> {
        const { filePath, code } = action.params;

        if (!filePath || !code) {
            return {
                success: false,
                actionId: action.id,
                message: 'File path and code are required',
                error: {
                    code: 'MISSING_PARAMS',
                    message: 'File path and code are required for code generation'
                }
            };
        }

        try {
            // 프로젝트 루트 확인
            const projectRoot = this.context?.projectRoot ||
                vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

            if (!projectRoot) {
                return {
                    success: false,
                    actionId: action.id,
                    message: 'Project root not found',
                    error: {
                        code: 'NO_PROJECT_ROOT',
                        message: 'Cannot create file without project root'
                    }
                };
            }

            // 절대 경로 생성
            const cleanPath = filePath.replace(/^`+|`+$/g, '').trim();
            const absolutePath = path.isAbsolute(cleanPath)
                ? path.normalize(cleanPath)
                : path.normalize(path.join(projectRoot, cleanPath));

            // 파일 컨텍스트 추적 및 안정화 대기 (파일이 존재하는 경우에만)
            if (this.fileContextTracker) {
                try {
                    // 파일이 존재하는지 확인
                    try {
                        await fsPromises.access(absolutePath);
                        // 파일이 존재하면 추적 및 안정화 대기
                        this.fileContextTracker.trackFile(absolutePath);
                        await this.fileContextTracker.waitForFileStability(absolutePath, 3000, 400, 200);
                    } catch (accessError: any) {
                        // 파일이 존재하지 않으면 (ENOENT) 추적만 시작하고 안정화 대기는 건너뜀
                        if (accessError.code === 'ENOENT') {
                            console.log(`[ActionManager] File does not exist yet, will track after creation: ${absolutePath}`);
                            // 파일 생성 후 추적 시작
                        } else {
                            // 다른 에러는 재발생
                            throw accessError;
                        }
                    }
                } catch (e) {
                    console.warn('[ActionManager] waitForFileStability failed for code_generation:', e);
                }
            }

            // 디렉토리 생성
            const dir = path.dirname(absolutePath);
            try {
                await fsPromises.mkdir(dir, { recursive: true });
            } catch (e) {
                // 디렉토리가 이미 존재하는 경우 무시
            }

            // 파일 생성/수정
            await fsPromises.writeFile(absolutePath, code, 'utf8');

            // 파일 생성 후 추적 시작 (파일이 없었던 경우)
            if (this.fileContextTracker) {
                try {
                    // 파일이 생성되었으므로 추적 시작
                    this.fileContextTracker.trackFile(absolutePath);
                } catch (e) {
                    console.warn('[ActionManager] Failed to track file after creation:', e);
                }
            }

            const contentBytes = Buffer.from(code, 'utf8');
            console.log(`[ActionManager] File created/updated: ${absolutePath} (${contentBytes.length} bytes)`);

            // package.json 파일 자체를 수정하는 경우는 import 분석을 건너뜀 (무한 루프 방지)
            const fileName = path.basename(absolutePath).toLowerCase();
            if (fileName === 'package.json') {
                console.log('[ActionManager] Skipping package.json import analysis for package.json file itself');
            } else {
                // TypeScript/JavaScript 파일인 경우 import 문 분석하여 package.json 업데이트
                const fileExt = path.extname(absolutePath).toLowerCase();
                if (['.ts', '.tsx', '.js', '.jsx'].includes(fileExt)) {
                    try {
                        // 파일이 안정화될 때까지 잠시 대기 (다른 파일이 package.json을 수정 중일 수 있음)
                        await new Promise(resolve => setTimeout(resolve, 100));
                        await this.updatePackageJsonFromImports(projectRoot, code, absolutePath);
                    } catch (error) {
                        console.warn('[ActionManager] Failed to update package.json from imports:', error);
                        // package.json 업데이트 실패는 치명적이지 않으므로 계속 진행
                    }
                }
            }

            return {
                success: true,
                actionId: action.id,
                message: `File ${filePath} created/updated successfully`
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`[ActionManager] Error executing code generation:`, error);
            return {
                success: false,
                actionId: action.id,
                message: `Failed to create/update file: ${errorMessage}`,
                error: {
                    code: 'EXECUTION_ERROR',
                    message: errorMessage
                }
            };
        }
    }

    /**
     * 코드에서 import 문을 분석하여 package.json에 의존성을 자동으로 추가합니다
     * @param projectRoot 프로젝트 루트 경로
     * @param code 분석할 코드 내용
     * @param sourceFilePath 소스 파일 경로 (package.json 위치 찾기용)
     */
    private async updatePackageJsonFromImports(projectRoot: string, code: string, sourceFilePath: string): Promise<void> {
        // 소스 파일과 같은 디렉토리 또는 상위 디렉토리에서 package.json 찾기
        let searchDir = path.dirname(sourceFilePath);
        let packageJsonPath: string | null = null;

        // 최대 5단계까지 상위 디렉토리로 올라가며 package.json 찾기
        for (let i = 0; i < 5; i++) {
            const candidatePath = path.join(searchDir, 'package.json');
            if (fs.existsSync(candidatePath)) {
                packageJsonPath = candidatePath;
                break;
            }
            const parentDir = path.dirname(searchDir);
            if (parentDir === searchDir) {
                // 루트에 도달
                break;
            }
            searchDir = parentDir;
        }

        // package.json을 찾지 못하면 프로젝트 루트에서 찾기
        if (!packageJsonPath) {
            packageJsonPath = path.join(projectRoot, 'package.json');
        }

        // package.json이 없으면 스킵
        if (!fs.existsSync(packageJsonPath)) {
            console.log(`[ActionManager] package.json not found at ${packageJsonPath}, skipping dependency update`);
            return;
        }

        console.log(`[ActionManager] Using package.json at: ${packageJsonPath}`);

        // import 문에서 외부 패키지 추출
        const externalPackages = this.extractExternalPackages(code);
        if (externalPackages.length === 0) {
            return;
        }

        // package.json 읽기
        const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf8');
        const packageJson = JSON.parse(packageJsonContent);

        // 의존성 섹션 초기화
        if (!packageJson.dependencies) {
            packageJson.dependencies = {};
        }
        if (!packageJson.devDependencies) {
            packageJson.devDependencies = {};
        }

        let updated = false;
        const addedPackages: string[] = [];

        // 각 패키지 확인 및 추가
        for (const pkg of externalPackages) {
            const pkgName = pkg.name;
            const isDevDep = pkg.isDevDep;

            // 이미 존재하는지 확인
            const existsInDeps = packageJson.dependencies[pkgName];
            const existsInDevDeps = packageJson.devDependencies[pkgName];

            if (!existsInDeps && !existsInDevDeps) {
                // 의존성 추가는 LLM이 프롬프트의 패키지 버전 정보를 참조하여 package.json에 직접 추가하도록 함
                // 이 함수는 자동으로 패키지를 추가하지 않고, LLM이 코드 생성 시 package.json을 수정하도록 의존
                console.log(`[ActionManager] Package ${pkgName} not found in package.json. LLM should add it with appropriate version from prompt guidelines.`);

                // TypeScript 프로젝트이고 @types 패키지가 필요한 경우
                // react-router-dom v6는 타입이 내장되어 있으므로 @types가 필요없음
                if (pkg.needsTypes) {
                    // 스코프 패키지(@scope/package)의 경우 @types/scope__package 형식 사용
                    let typesPackageName: string;
                    if (pkgName.startsWith('@')) {
                        // @scope/package -> @types/scope__package
                        typesPackageName = `@types/${pkgName.substring(1).replace('/', '__')}`;
                    } else {
                        // 일반 패키지 -> @types/package
                        typesPackageName = `@types/${pkgName}`;
                    }

                    if (!packageJson.devDependencies[typesPackageName]) {
                        // 타입 정의 패키지 추가는 LLM이 프롬프트의 패키지 버전 정보를 참조하여 package.json에 직접 추가하도록 함
                        console.log(`[ActionManager] Type definitions package ${typesPackageName} not found. LLM should add it with appropriate version from prompt guidelines.`);
                    }
                }
            }
        }

        // package.json 업데이트
        if (updated) {
            const updatedContent = JSON.stringify(packageJson, null, 2) + '\n';
            fs.writeFileSync(packageJsonPath, updatedContent, 'utf8');
            console.log(`[ActionManager] Updated package.json with packages: ${addedPackages.join(', ')}`);
        }
    }

    /**
     * 코드에서 외부 패키지 import 문을 추출합니다
     */
    private extractExternalPackages(code: string): Array<{ name: string; isDevDep: boolean; needsTypes: boolean }> {
        const packages: Array<{ name: string; isDevDep: boolean; needsTypes: boolean }> = [];

        // import 패턴들
        const importPatterns = [
            // import xxx from 'package'
            /import\s+(?:\*\s+as\s+)?[\w\s,{}]+\s+from\s+['"]([^'"]+)['"]/g,
            // import 'package'
            /import\s+['"]([^'"]+)['"]/g,
            // require('package')
            /require\(['"]([^'"]+)['"]\)/g,
            // import('package')
            /import\(['"]([^'"]+)['"]\)/g
        ];

        const foundPackages = new Set<string>();

        for (const pattern of importPatterns) {
            let match;
            while ((match = pattern.exec(code)) !== null) {
                const importPath = match[1];

                // 상대 경로나 절대 경로는 제외 (./, ../, /, @/ 등)
                if (importPath.startsWith('.') || importPath.startsWith('/') || importPath.startsWith('@/')) {
                    continue;
                }

                // 스코프 패키지(@scope/package) 또는 일반 패키지
                let packageName: string;
                if (importPath.startsWith('@')) {
                    // @scope/package 형식
                    const parts = importPath.split('/');
                    packageName = parts.length >= 2 ? `${parts[0]}/${parts[1]}` : parts[0];
                } else {
                    // 일반 패키지
                    packageName = importPath.split('/')[0];
                }

                if (packageName && !foundPackages.has(packageName)) {
                    foundPackages.add(packageName);

                    // 특수 패키지 처리
                    if (packageName.startsWith('@types/')) {
                        continue; // @types는 이미 devDependency
                    }

                    // eslint 관련 패키지는 자동 추가하지 않음 (설정 파일에서 관리)
                    if (packageName.toLowerCase().includes('eslint') ||
                        packageName.toLowerCase().includes('prettier')) {
                        console.log(`[ActionManager] Skipping eslint/prettier package: ${packageName}`);
                        continue;
                    }

                    // 개발 의존성인지 확인 (일반적으로 타입 정의나 빌드 도구)
                    const isDevDep = this.isDevDependency(packageName);

                    // TypeScript 타입 정의가 필요한지 확인
                    const needsTypes = this.needsTypeDefinitions(packageName);

                    packages.push({
                        name: packageName,
                        isDevDep,
                        needsTypes
                    });
                }
            }
        }

        return packages;
    }


    /**
     * 패키지가 개발 의존성인지 확인
     */
    private isDevDependency(packageName: string): boolean {
        const devDeps = [
            'typescript', '@types', 'tsx', 'ts-node', 'vite', 'webpack', 'esbuild',
            'eslint', 'prettier', '@vitejs', 'rollup', 'jest', 'mocha', 'chai'
        ];
        return devDeps.some(dep => packageName.toLowerCase().includes(dep.toLowerCase()));
    }

    /**
     * 패키지가 TypeScript 타입 정의가 필요한지 확인
     */
    private needsTypeDefinitions(packageName: string): boolean {
        // 내장 타입이 있는 패키지들 (TypeScript로 작성되었거나 타입이 내장됨)
        const hasBuiltInTypes = [
            'react', 'react-dom', 'react-router-dom', 'vite', 'typescript', '@vitejs'
        ];

        if (hasBuiltInTypes.some(pkg => packageName.toLowerCase().includes(pkg.toLowerCase()))) {
            return false;
        }

        // 일반 JavaScript 라이브러리는 타입 정의가 필요할 수 있음
        // 단, @types 패키지 자체는 제외
        if (packageName.startsWith('@types/')) {
            return false;
        }

        return true;
    }

    /**
     * 파일 작업 액션을 실행합니다
     */
    private async executeFileOperation(action: Action): Promise<ActionResult> {
        const { operation, sourcePath, targetPath, content } = action.params;

        if (!operation || !sourcePath) {
            return {
                success: false,
                actionId: action.id,
                message: 'Operation and source path are required',
                error: {
                    code: 'MISSING_PARAMS',
                    message: 'Operation and source path are required for file operation'
                }
            };
        }

        try {
            const projectRoot = this.context?.projectRoot ||
                vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

            if (!projectRoot) {
                return {
                    success: false,
                    actionId: action.id,
                    message: 'Project root not found',
                    error: {
                        code: 'NO_PROJECT_ROOT',
                        message: 'Cannot perform file operation without project root'
                    }
                };
            }

            const sourceUri = vscode.Uri.file(
                path.isAbsolute(sourcePath)
                    ? path.normalize(sourcePath)
                    : path.normalize(path.join(projectRoot, sourcePath))
            );

            // 파일 컨텍스트 추적 및 안정화 대기
            if (this.fileContextTracker) {
                try {
                    this.fileContextTracker.trackFile(sourceUri.fsPath);
                    await this.fileContextTracker.waitForFileStability(sourceUri.fsPath, 3000, 400, 200);
                } catch (e) {
                    console.warn('[ActionManager] waitForFileStability failed for file_operation:', e);
                }
            }

            switch (operation) {
                case FileOperationType.CREATE:
                    if (content === undefined) {
                        return {
                            success: false,
                            actionId: action.id,
                            message: 'Content is required for create operation',
                            error: {
                                code: 'MISSING_CONTENT',
                                message: 'Content is required for create operation'
                            }
                        };
                    }
                    // 변경사항 추적 (파일 생성 전)
                    let createBeforeContent: string | undefined;
                    try {
                        createBeforeContent = await fsPromises.readFile(sourceUri.fsPath, 'utf8');
                    } catch {
                        // 파일이 없으면 undefined 유지
                        createBeforeContent = undefined;
                    }

                    // 디렉토리 생성
                    const dir = path.dirname(sourceUri.fsPath);
                    try {
                        await fsPromises.mkdir(dir, { recursive: true });
                    } catch (e) {
                        // 디렉토리가 이미 존재하는 경우 무시
                    }
                    // 파일 생성
                    await fsPromises.writeFile(sourceUri.fsPath, content, 'utf8');

                    // 변경사항 기록
                    if (this.fileChangeTracker) {
                        await this.fileChangeTracker.recordChange(
                            sourceUri.fsPath,
                            'create',
                            createBeforeContent,
                            content,
                            {
                                taskId: undefined,
                                message: `File created: ${sourcePath}`,
                                source: 'ai',
                            }
                        );
                    }

                    return {
                        success: true,
                        actionId: action.id,
                        message: `File ${sourcePath} created successfully`
                    };

                case FileOperationType.UPDATE:
                    if (content === undefined) {
                        return {
                            success: false,
                            actionId: action.id,
                            message: 'Content is required for update operation',
                            error: {
                                code: 'MISSING_CONTENT',
                                message: 'Content is required for update operation'
                            }
                        };
                    }
                    // 변경사항 추적 (파일 수정 전)
                    let updateBeforeContent: string | undefined;
                    try {
                        updateBeforeContent = await fsPromises.readFile(sourceUri.fsPath, 'utf8');
                    } catch {
                        // 파일이 없으면 undefined 유지
                        updateBeforeContent = undefined;
                    }

                    await fsPromises.writeFile(sourceUri.fsPath, content, 'utf8');

                    // 변경사항 기록
                    if (this.fileChangeTracker) {
                        await this.fileChangeTracker.recordChange(
                            sourceUri.fsPath,
                            'modify',
                            updateBeforeContent,
                            content,
                            {
                                taskId: undefined,
                                message: `File updated: ${sourcePath}`,
                                source: 'ai',
                            }
                        );
                    }

                    return {
                        success: true,
                        actionId: action.id,
                        message: `File ${sourcePath} updated successfully`
                    };

                case FileOperationType.DELETE:
                    // 변경사항 추적 (파일 삭제 전)
                    let deleteBeforeContent: string | undefined;
                    try {
                        deleteBeforeContent = await fsPromises.readFile(sourceUri.fsPath, 'utf8');
                    } catch {
                        // 파일이 없으면 undefined 유지
                        deleteBeforeContent = undefined;
                    }

                    await fsPromises.unlink(sourceUri.fsPath);

                    // 변경사항 기록
                    if (this.fileChangeTracker) {
                        await this.fileChangeTracker.recordChange(
                            sourceUri.fsPath,
                            'delete',
                            deleteBeforeContent,
                            undefined,
                            {
                                taskId: undefined,
                                message: `File deleted: ${sourcePath}`,
                                source: 'ai',
                            }
                        );
                    }

                    return {
                        success: true,
                        actionId: action.id,
                        message: `File ${sourcePath} deleted successfully`
                    };

                case FileOperationType.RENAME:
                case FileOperationType.MOVE:
                    if (!targetPath) {
                        return {
                            success: false,
                            actionId: action.id,
                            message: 'Target path is required for rename/move operation',
                            error: {
                                code: 'MISSING_TARGET_PATH',
                                message: 'Target path is required for rename/move operation'
                            }
                        };
                    }
                    const targetUri = vscode.Uri.file(
                        path.isAbsolute(targetPath)
                            ? path.normalize(targetPath)
                            : path.normalize(path.join(projectRoot, targetPath))
                    );
                    // 디렉토리 생성
                    const targetDir = path.dirname(targetUri.fsPath);
                    try {
                        await fsPromises.mkdir(targetDir, { recursive: true });
                    } catch (e) {
                        // 디렉토리가 이미 존재하는 경우 무시
                    }
                    // 파일 이동
                    await fsPromises.rename(sourceUri.fsPath, targetUri.fsPath);
                    return {
                        success: true,
                        actionId: action.id,
                        message: `File moved from ${sourcePath} to ${targetPath}`
                    };

                default:
                    return {
                        success: false,
                        actionId: action.id,
                        message: `Unsupported operation: ${operation}`,
                        error: {
                            code: 'UNSUPPORTED_OPERATION',
                            message: `Unsupported operation: ${operation}`
                        }
                    };
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`[ActionManager] Error executing file operation:`, error);
            return {
                success: false,
                actionId: action.id,
                message: `Failed to execute file operation: ${errorMessage}`,
                error: {
                    code: 'EXECUTION_ERROR',
                    message: errorMessage
                }
            };
        }
    }

    /**
     * 터미널 명령어 액션을 실행합니다
     */
    private async executeTerminalCommand(action: Action): Promise<ActionResult> {
        const { command, cwd } = action.params;

        if (!command) {
            return {
                success: false,
                actionId: action.id,
                message: 'Command is required',
                error: {
                    code: 'MISSING_COMMAND',
                    message: 'Command is required for terminal command'
                }
            };
        }

        try {
            // TerminalManager를 사용하여 명령어 실행
            const terminalManager = TerminalManager.getInstance();

            const workingDir = cwd || this.context?.projectRoot ||
                vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

            const sanitized = this.sanitizeCommand(command, workingDir);
            if (!sanitized) {
                return {
                    success: false,
                    actionId: action.id,
                    message: 'Command is invalid or empty after sanitization',
                    error: {
                        code: 'INVALID_COMMAND',
                        message: 'Command contained placeholders or became empty after cleanup'
                    }
                };
            }

            // 명령어를 큐에 추가
            await terminalManager.enqueueCommand(sanitized, {
                cwd: workingDir,
                priority: false
            });

            return {
                success: true,
                actionId: action.id,
                message: `Command queued: ${sanitized}`
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`[ActionManager] Error executing terminal command:`, error);
            return {
                success: false,
                actionId: action.id,
                message: `Failed to execute command: ${errorMessage}`,
                error: {
                    code: 'EXECUTION_ERROR',
                    message: errorMessage
                }
            };
        }
    }

    /**
     * 터미널 명령어에서 플레이스홀더나 주석을 정리합니다.
     * - "/path/to/your/project" 같은 안내용 경로를 실제 cwd로 치환
     * - "# ← 실제 경로로 바꿔 주세요"와 같은 주석 제거
     * - 정리 후 비어 있으면 null 반환
     */
    private sanitizeCommand(command: string, cwd?: string): string | null {
        if (!command || typeof command !== 'string') return null;

        let cleaned = command.trim();

        // 플레이스홀더 경로 패턴
        const placeholderPatterns = [
            /\/path\/to\/your\/project/gi,
            /<path[-_ ]?to[-_ ]?project>/gi,
            /\$PROJECT_ROOT/gi,
            /PROJECT_ROOT/gi
        ];

        for (const pattern of placeholderPatterns) {
            cleaned = cleaned.replace(pattern, cwd || '');
        }

        cleaned = cleaned.trim();

        // 연속 공백 축소
        cleaned = cleaned.replace(/\s+/g, ' ').trim();

        // 치환 후 비어 있으면 무효
        if (!cleaned) return null;

        return cleaned;
    }

}
