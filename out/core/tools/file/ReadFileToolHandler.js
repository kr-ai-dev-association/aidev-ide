"use strict";
/**
 * Read File Tool Handler
 * 파일 읽기 툴 핸들러
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
exports.ReadFileToolHandler = void 0;
const types_1 = require("../types");
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
class ReadFileToolHandler {
    name = types_1.Tool.READ_FILE;
    async execute(toolUse, context) {
        const filePath = toolUse.params.path;
        const paths = toolUse.params.paths; // 여러 파일 경로 지원
        // 단일 경로 또는 여러 경로 처리
        const pathsToRead = [];
        if (paths) {
            // paths가 문자열인 경우 (쉼표로 구분된 경로 또는 JSON 배열)
            try {
                const parsed = typeof paths === 'string' ? JSON.parse(paths) : paths;
                if (Array.isArray(parsed)) {
                    pathsToRead.push(...parsed);
                }
                else {
                    pathsToRead.push(paths);
                }
            }
            catch {
                // JSON 파싱 실패 시 쉼표로 구분된 문자열로 처리
                if (typeof paths === 'string') {
                    pathsToRead.push(...paths.split(',').map(p => p.trim()).filter(p => p));
                }
            }
        }
        else if (filePath) {
            pathsToRead.push(filePath);
        }
        if (pathsToRead.length === 0) {
            return {
                success: false,
                message: 'Path or paths parameter is required',
                error: { code: 'MISSING_PARAM', message: 'path or paths is required' }
            };
        }
        // 여러 파일 읽기
        const results = [];
        let hasError = false;
        for (const filePath of pathsToRead) {
            let absolutePath = path.isAbsolute(filePath)
                ? filePath
                : path.join(context.projectRoot, filePath);
            // 프로젝트 루트 외부 파일 접근 차단
            if (!absolutePath.startsWith(context.projectRoot) && absolutePath !== context.projectRoot) {
                console.warn(`[ReadFileToolHandler] External file access blocked: ${absolutePath}`);
                results.push({
                    path: filePath,
                    content: '',
                    error: `Access denied: ${filePath} is outside of project root`
                });
                hasError = true;
                continue;
            }
            try {
                const content = await fs.readFile(absolutePath, 'utf8');
                results.push({
                    path: filePath,
                    content
                });
            }
            catch (error) {
                results.push({
                    path: filePath,
                    content: '',
                    error: error instanceof Error ? error.message : String(error)
                });
                hasError = true;
            }
        }
        // 단일 파일인 경우 기존 형식 유지 (하위 호환성)
        if (results.length === 1) {
            const result = results[0];
            if (result.error) {
                return {
                    success: false,
                    message: `Failed to read file: ${result.path}`,
                    error: {
                        code: 'READ_ERROR',
                        message: result.error
                    }
                };
            }
            return {
                success: true,
                message: `File read: ${result.path}`,
                data: { path: result.path, content: result.content }
            };
        }
        // 여러 파일인 경우 배열 형식 반환
        return {
            success: !hasError,
            message: `Read ${results.length} file(s)`,
            data: {
                files: results.map(r => ({
                    path: r.path,
                    content: r.content,
                    error: r.error
                }))
            }
        };
    }
    getDescription(toolUse) {
        return `[read_file: ${toolUse.params.path}]`;
    }
}
exports.ReadFileToolHandler = ReadFileToolHandler;
//# sourceMappingURL=ReadFileToolHandler.js.map