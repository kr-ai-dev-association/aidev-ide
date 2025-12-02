/**
 * Action Validator
 * 액션의 유효성을 검증하는 클래스
 */

import {
    Action,
    ActionParams,
    ValidationRule,
    ValidationResult,
    ValidationError,
    Permission,
    FileOperationType
} from './types';

export class ActionValidator {
    /**
     * 액션을 검증합니다
     */
    public validate(action: Action, rules: ValidationRule[]): ValidationResult {
        const errors: ValidationError[] = [];
        const warnings: string[] = [];

        // 기본 필드 검증
        if (!action.id) {
            errors.push({
                field: 'id',
                message: 'Action ID is required',
                code: 'MISSING_ID'
            });
        }

        if (!action.type) {
            errors.push({
                field: 'type',
                message: 'Action type is required',
                code: 'MISSING_TYPE'
            });
        }

        // 규칙 기반 검증
        for (const rule of rules) {
            const error = this.validateRule(action.params, rule);
            if (error) {
                errors.push(error);
            }
        }

        // 파라미터별 특수 검증
        const paramErrors = this.validateParams(action);
        errors.push(...paramErrors);

        // 권한 검증
        const permissionWarnings = this.validatePermissions(action);
        warnings.push(...permissionWarnings);

        return {
            valid: errors.length === 0,
            errors,
            warnings: warnings.length > 0 ? warnings : undefined
        };
    }

    /**
     * 개별 규칙을 검증합니다
     */
    private validateRule(params: ActionParams, rule: ValidationRule): ValidationError | null {
        const value = (params as any)[rule.field];

        switch (rule.type) {
            case 'required':
                if (value === undefined || value === null || value === '') {
                    return {
                        field: rule.field,
                        message: rule.message,
                        code: 'REQUIRED_FIELD'
                    };
                }
                break;

            case 'pattern':
                if (value && rule.value instanceof RegExp && !rule.value.test(String(value))) {
                    return {
                        field: rule.field,
                        message: rule.message,
                        code: 'PATTERN_MISMATCH'
                    };
                }
                break;

            case 'custom':
                if (rule.value && typeof rule.value === 'function') {
                    const isValid = rule.value(value);
                    if (!isValid) {
                        return {
                            field: rule.field,
                            message: rule.message,
                            code: 'CUSTOM_VALIDATION_FAILED'
                        };
                    }
                }
                break;
        }

        return null;
    }

    /**
     * 액션 파라미터의 특수 검증을 수행합니다
     */
    private validateParams(action: Action): ValidationError[] {
        const errors: ValidationError[] = [];
        const params = action.params;

        // CODE_GENERATION 검증
        if (action.type === 'code_generation') {
            if (!params.filePath) {
                errors.push({
                    field: 'filePath',
                    message: 'File path is required for code generation',
                    code: 'MISSING_FILE_PATH'
                });
            }
            if (!params.code) {
                errors.push({
                    field: 'code',
                    message: 'Code content is required for code generation',
                    code: 'MISSING_CODE'
                });
            }
            // 파일 경로 유효성 검증
            if (params.filePath && this.hasInvalidPathCharacters(params.filePath)) {
                errors.push({
                    field: 'filePath',
                    message: 'File path contains invalid characters',
                    code: 'INVALID_PATH'
                });
            }
        }

        // FILE_OPERATION 검증
        if (action.type === 'file_operation') {
            if (!params.operation) {
                errors.push({
                    field: 'operation',
                    message: 'Operation type is required for file operation',
                    code: 'MISSING_OPERATION'
                });
            }
            if (!params.sourcePath) {
                errors.push({
                    field: 'sourcePath',
                    message: 'Source path is required for file operation',
                    code: 'MISSING_SOURCE_PATH'
                });
            }
            // RENAME, MOVE 작업은 targetPath 필수
            if ((params.operation === FileOperationType.RENAME || params.operation === FileOperationType.MOVE) && !params.targetPath) {
                errors.push({
                    field: 'targetPath',
                    message: `Target path is required for ${params.operation} operation`,
                    code: 'MISSING_TARGET_PATH'
                });
            }
            // CREATE, UPDATE 작업은 content 필수
            if ((params.operation === FileOperationType.CREATE || params.operation === FileOperationType.UPDATE) && params.content === undefined) {
                errors.push({
                    field: 'content',
                    message: `Content is required for ${params.operation} operation`,
                    code: 'MISSING_CONTENT'
                });
            }
        }

        // TERMINAL_COMMAND 검증
        if (action.type === 'terminal_command') {
            if (!params.command) {
                errors.push({
                    field: 'command',
                    message: 'Command is required for terminal command',
                    code: 'MISSING_COMMAND'
                });
            }
            // 위험한 명령어 검증
            if (params.command && this.isDangerousCommand(params.command)) {
                errors.push({
                    field: 'command',
                    message: 'Command contains potentially dangerous operations',
                    code: 'DANGEROUS_COMMAND'
                });
            }
        }

        // ANALYSIS 검증
        if (action.type === 'analysis') {
            if (!params.analysisType) {
                errors.push({
                    field: 'analysisType',
                    message: 'Analysis type is required',
                    code: 'MISSING_ANALYSIS_TYPE'
                });
            }
        }

        // SEARCH 검증
        if (action.type === 'search') {
            if (!params.query) {
                errors.push({
                    field: 'query',
                    message: 'Search query is required',
                    code: 'MISSING_QUERY'
                });
            }
        }

        // REFACTOR 검증
        if (action.type === 'refactor') {
            if (!params.refactorType) {
                errors.push({
                    field: 'refactorType',
                    message: 'Refactor type is required',
                    code: 'MISSING_REFACTOR_TYPE'
                });
            }
            if (params.refactorType === 'rename' && !params.newName) {
                errors.push({
                    field: 'newName',
                    message: 'New name is required for rename refactoring',
                    code: 'MISSING_NEW_NAME'
                });
            }
        }

        return errors;
    }

    /**
     * 권한 검증을 수행합니다
     */
    private validatePermissions(action: Action): string[] {
        const warnings: string[] = [];

        // 위험한 권한 조합 검증
        if (action.permissions.includes(Permission.DELETE_FILE) && 
            action.permissions.includes(Permission.EXECUTE_COMMAND)) {
            warnings.push('Action has both DELETE_FILE and EXECUTE_COMMAND permissions. Use with caution.');
        }

        // 네트워크 접근 권한
        if (action.permissions.includes(Permission.NETWORK_ACCESS)) {
            warnings.push('Action requires network access. Ensure this is intentional.');
        }

        return warnings;
    }

    /**
     * 파일 경로에 유효하지 않은 문자가 있는지 확인합니다
     */
    private hasInvalidPathCharacters(path: string): boolean {
        // Windows와 Unix 모두에서 유효하지 않은 문자들
        const invalidChars = /[<>:"|?*\x00-\x1F]/;
        return invalidChars.test(path);
    }

    /**
     * 위험한 명령어인지 확인합니다
     */
    private isDangerousCommand(command: string): boolean {
        const dangerousPatterns = [
            /rm\s+-rf\s+\/(?!\w)/,  // rm -rf / (루트 삭제)
            /:\(\)\{.*\|.*&\s*\}/,   // Fork bomb
            /dd\s+if=/,              // dd 명령어 (주의 필요)
            /mkfs\./,                // 파일 시스템 포맷
            />\s*\/dev\/sd[a-z]/,    // 디스크 직접 쓰기
        ];

        return dangerousPatterns.some(pattern => pattern.test(command));
    }

    /**
     * 의존성 순환을 검증합니다
     */
    public validateDependencies(actions: Action[]): ValidationResult {
        const errors: ValidationError[] = [];
        const graph = new Map<string, Set<string>>();

        // 의존성 그래프 생성
        for (const action of actions) {
            if (!graph.has(action.id)) {
                graph.set(action.id, new Set());
            }
            if (action.dependencies) {
                for (const dep of action.dependencies) {
                    graph.get(action.id)!.add(dep);
                }
            }
        }

        // 순환 참조 검증
        for (const action of actions) {
            const visited = new Set<string>();
            const stack = new Set<string>();

            if (this.hasCycle(action.id, graph, visited, stack)) {
                errors.push({
                    field: 'dependencies',
                    message: `Circular dependency detected for action ${action.id}`,
                    code: 'CIRCULAR_DEPENDENCY'
                });
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * DFS를 사용하여 순환 참조를 검증합니다
     */
    private hasCycle(
        nodeId: string,
        graph: Map<string, Set<string>>,
        visited: Set<string>,
        stack: Set<string>
    ): boolean {
        visited.add(nodeId);
        stack.add(nodeId);

        const neighbors = graph.get(nodeId);
        if (neighbors) {
            for (const neighbor of neighbors) {
                if (!visited.has(neighbor)) {
                    if (this.hasCycle(neighbor, graph, visited, stack)) {
                        return true;
                    }
                } else if (stack.has(neighbor)) {
                    return true;
                }
            }
        }

        stack.delete(nodeId);
        return false;
    }
}

