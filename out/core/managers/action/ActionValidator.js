"use strict";
/**
 * Action Validator
 * 액션의 유효성을 검증하는 클래스
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActionValidator = void 0;
const types_1 = require("./types");
class ActionValidator {
    /**
     * 액션을 검증합니다
     */
    validate(action, rules) {
        const errors = [];
        const warnings = [];
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
    validateRule(params, rule) {
        const value = params[rule.field];
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
    validateParams(action) {
        const errors = [];
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
            if (params.filePath) {
                const originalPath = params.filePath;
                const cleanedPath = this.cleanFilePath(params.filePath);
                console.log(`[ActionValidator] File path validation:`, {
                    original: originalPath,
                    cleaned: cleanedPath
                });
                if (!cleanedPath) {
                    errors.push({
                        field: 'filePath',
                        message: 'File path is empty after cleaning',
                        code: 'EMPTY_PATH'
                    });
                }
                else if (this.hasInvalidPathCharacters(cleanedPath)) {
                    console.warn(`[ActionValidator] Invalid characters detected in path: ${cleanedPath}`);
                    errors.push({
                        field: 'filePath',
                        message: 'File path contains invalid characters',
                        code: 'INVALID_PATH'
                    });
                }
                else {
                    // 정제된 경로로 업데이트
                    params.filePath = cleanedPath;
                    console.log(`[ActionValidator] File path validated and cleaned: ${cleanedPath}`);
                }
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
            if ((params.operation === types_1.FileOperationType.RENAME || params.operation === types_1.FileOperationType.MOVE) && !params.targetPath) {
                errors.push({
                    field: 'targetPath',
                    message: `Target path is required for ${params.operation} operation`,
                    code: 'MISSING_TARGET_PATH'
                });
            }
            // CREATE, UPDATE 작업은 content 필수
            if ((params.operation === types_1.FileOperationType.CREATE || params.operation === types_1.FileOperationType.UPDATE) && params.content === undefined) {
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
            // 플레이스홀더/샘플 경로 포함 여부 검사
            const placeholderPatterns = [
                /\/path\/to\/your\/project/i,
                /<path[-_ ]?to[-_ ]?project>/i,
                /\$PROJECT_ROOT/i,
                /PROJECT_ROOT/i,
                /실제\s*경로로\s*바꿔\s*주세요/i,
                /replace\s+with\s+actual\s+path/i
            ];
            if (params.command) {
                const cmd = params.command;
                if (placeholderPatterns.some(p => p.test(cmd))) {
                    errors.push({
                        field: 'command',
                        message: 'Command contains placeholder path. Please provide a real path.',
                        code: 'INVALID_COMMAND_PLACEHOLDER'
                    });
                }
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
        // SEARCH 검증 (일반 코드 검색)
        if (action.type === 'search') {
            if (!params.query) {
                errors.push({
                    field: 'query',
                    message: 'Search query is required',
                    code: 'MISSING_QUERY'
                });
            }
        }
        // FILE_READ 검증
        if (action.type === 'file_read') {
            if (!params.path && (!params.paths || params.paths.length === 0)) {
                errors.push({
                    field: 'path',
                    message: 'At least one file path is required for file_read action',
                    code: 'MISSING_FILE_PATH'
                });
            }
        }
        // FILE_LIST 검증
        if (action.type === 'file_list') {
            if (!params.path && (!params.paths || params.paths.length === 0) &&
                (!params.includeGlobs || params.includeGlobs.length === 0)) {
                errors.push({
                    field: 'path',
                    message: 'Directory path or includeGlobs is required for file_list action',
                    code: 'MISSING_LIST_TARGET'
                });
            }
        }
        // FILE_SEARCH 검증
        if (action.type === 'file_search') {
            if (!params.pattern && !params.query) {
                errors.push({
                    field: 'pattern',
                    message: 'Search pattern or query is required for file_search action',
                    code: 'MISSING_SEARCH_PATTERN'
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
    validatePermissions(action) {
        const warnings = [];
        // 위험한 권한 조합 검증
        if (action.permissions.includes(types_1.Permission.DELETE_FILE) &&
            action.permissions.includes(types_1.Permission.EXECUTE_COMMAND)) {
            warnings.push('Action has both DELETE_FILE and EXECUTE_COMMAND permissions. Use with caution.');
        }
        // 네트워크 접근 권한
        if (action.permissions.includes(types_1.Permission.NETWORK_ACCESS)) {
            warnings.push('Action requires network access. Ensure this is intentional.');
        }
        return warnings;
    }
    /**
     * 파일 경로를 정제합니다 (마크다운 코드 블록, 공백 등 제거)
     */
    cleanFilePath(path) {
        if (!path || typeof path !== 'string') {
            return null;
        }
        // 마크다운 코드 블록 제거 (백틱)
        let cleaned = path.replace(/^`+|`+$/g, '');
        // 따옴표 제거 (단일/이중 따옴표)
        cleaned = cleaned.replace(/^["']+|["']+$/g, '');
        // 앞뒤 공백 제거
        cleaned = cleaned.trim();
        // 빈 문자열이면 null 반환
        if (!cleaned) {
            return null;
        }
        // 상대 경로 표시 제거 (./ 또는 ../)
        cleaned = cleaned.replace(/^\.\//, '');
        // 마크다운 강조 제거 (**파일명**)
        cleaned = cleaned.replace(/\*\*/g, '');
        // 파일명 뒤에 붙은 괄호 설명 제거 
        cleaned = cleaned.replace(/\s*\([^)]*\)\s*$/g, '');
        // trailing 구두점/공백 정리
        cleaned = cleaned.replace(/[,:;.\s]+$/g, '').trim();
        // 앞뒤 공백 다시 제거
        cleaned = cleaned.trim();
        // 절대 경로는 그대로 유지
        // 파일명만 있는 경우도 허용
        return cleaned || null;
    }
    /**
     * 파일 경로에 유효하지 않은 문자가 있는지 확인합니다
     */
    hasInvalidPathCharacters(path) {
        if (!path || typeof path !== 'string') {
            return true;
        }
        // Windows와 Unix 모두에서 유효하지 않은 문자들
        // 단, 백슬래시(\)는 Windows 경로에서 허용되므로 제외
        // 제어 문자(\x00-\x1F)와 특수 문자(< > : " | ? *)
        const invalidChars = /[<>:"|?*\x00-\x1F]/;
        // 경로 구분자(/ 또는 \)는 허용
        // 전체 경로를 검증하되, 경로 구분자는 제외
        const pathParts = path.split(/[/\\]/);
        // 각 경로 부분(디렉토리명, 파일명)을 검증
        for (const part of pathParts) {
            if (!part || part.trim() === '') {
                // 빈 경로 부분은 허용 (예: // 또는 \\)
                continue;
            }
            // 각 부분에 유효하지 않은 문자가 있는지 확인
            if (invalidChars.test(part)) {
                console.warn(`[ActionValidator] Invalid character found in path part: "${part}"`);
                return true;
            }
            // Windows 예약 이름 체크 (CON, PRN, AUX, NUL, COM1-9, LPT1-9)
            const reservedNames = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i;
            if (reservedNames.test(part)) {
                console.warn(`[ActionValidator] Reserved name found: "${part}"`);
                return true;
            }
        }
        return false;
    }
    /**
     * 위험한 명령어인지 확인합니다
     */
    isDangerousCommand(command) {
        const dangerousPatterns = [
            /rm\s+-rf\s+\/(?!\w)/, // rm -rf / (루트 삭제)
            /:\(\)\{.*\|.*&\s*\}/, // Fork bomb
            /dd\s+if=/, // dd 명령어 (주의 필요)
            /mkfs\./, // 파일 시스템 포맷
            />\s*\/dev\/sd[a-z]/, // 디스크 직접 쓰기
        ];
        return dangerousPatterns.some(pattern => pattern.test(command));
    }
    /**
     * 의존성 순환을 검증합니다
     */
    validateDependencies(actions) {
        const errors = [];
        const graph = new Map();
        // 의존성 그래프 생성
        for (const action of actions) {
            if (!graph.has(action.id)) {
                graph.set(action.id, new Set());
            }
            if (action.dependencies) {
                for (const dep of action.dependencies) {
                    graph.get(action.id).add(dep);
                }
            }
        }
        // 순환 참조 검증
        for (const action of actions) {
            const visited = new Set();
            const stack = new Set();
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
    hasCycle(nodeId, graph, visited, stack) {
        visited.add(nodeId);
        stack.add(nodeId);
        const neighbors = graph.get(nodeId);
        if (neighbors) {
            for (const neighbor of neighbors) {
                if (!visited.has(neighbor)) {
                    if (this.hasCycle(neighbor, graph, visited, stack)) {
                        return true;
                    }
                }
                else if (stack.has(neighbor)) {
                    return true;
                }
            }
        }
        stack.delete(nodeId);
        return false;
    }
}
exports.ActionValidator = ActionValidator;
//# sourceMappingURL=ActionValidator.js.map