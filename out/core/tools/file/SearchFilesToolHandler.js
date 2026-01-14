"use strict";
/**
 * Search Files Tool Handler
 * 파일 내용 검색 툴 핸들러
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
exports.SearchFilesToolHandler = void 0;
const types_1 = require("../types");
const FileSearcher_1 = require("../../managers/context/file/FileSearcher");
const path = __importStar(require("path"));
class SearchFilesToolHandler {
    name = types_1.Tool.SEARCH_FILES;
    async execute(toolUse, context) {
        let searchPath = toolUse.params.path || context.projectRoot;
        const pattern = toolUse.params.pattern || toolUse.params.regex;
        const filePattern = toolUse.params.filePattern;
        // 경로가 프로젝트 루트를 벗어나지 않도록 보정
        if (!path.isAbsolute(searchPath)) {
            searchPath = path.join(context.projectRoot, searchPath);
        }
        else if (!searchPath.startsWith(context.projectRoot) && searchPath !== context.projectRoot) {
            // 절대 경로인 경우 프로젝트 루트 외부 검색이면 프로젝트 루트로 강제 (보안 및 에러 방지)
            console.warn(`[SearchFilesToolHandler] External search path blocked: ${searchPath}. Using project root instead.`);
            searchPath = context.projectRoot;
        }
        if (!pattern) {
            return {
                success: false,
                message: 'Pattern parameter is required',
                error: { code: 'MISSING_PARAM', message: 'pattern is required' }
            };
        }
        // 기존 FileSearcher 사용 (싱글톤 패턴)
        const searcher = FileSearcher_1.FileSearcher.getInstance();
        const results = await searcher.searchFiles(pattern, searchPath, {
            include: filePattern ? [filePattern] : undefined,
            maxResults: toolUse.params.maxResults ? parseInt(toolUse.params.maxResults) : 100
        });
        const formattedResults = searcher.formatResults(results, context.projectRoot);
        return {
            success: true,
            message: `Found ${results.length} matches`,
            data: { results: formattedResults }
        };
    }
    getDescription(toolUse) {
        return `[search_files: ${toolUse.params.pattern}]`;
    }
}
exports.SearchFilesToolHandler = SearchFilesToolHandler;
//# sourceMappingURL=SearchFilesToolHandler.js.map