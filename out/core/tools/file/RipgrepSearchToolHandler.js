"use strict";
/**
 * Ripgrep Search Tool Handler
 * ripgrep을 사용한 고성능 파일 검색 툴 핸들러
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
exports.RipgrepSearchToolHandler = void 0;
const types_1 = require("../types");
const FileSearcher_1 = require("../../managers/context/file/FileSearcher");
const path = __importStar(require("path"));
class RipgrepSearchToolHandler {
    name = types_1.Tool.RIPGREP_SEARCH;
    async execute(toolUse, context) {
        let searchPath = toolUse.params.path || context.projectRoot;
        const pattern = toolUse.params.pattern || toolUse.params.regex;
        const filePattern = toolUse.params.filePattern;
        const include = toolUse.params.include;
        const exclude = toolUse.params.exclude;
        const caseSensitive = toolUse.params.caseSensitive === 'true';
        // 경로 보정
        if (!path.isAbsolute(searchPath)) {
            searchPath = path.join(context.projectRoot, searchPath);
        }
        else if (!searchPath.startsWith(context.projectRoot) && searchPath !== context.projectRoot) {
            searchPath = context.projectRoot;
        }
        if (!pattern) {
            return {
                success: false,
                message: 'Pattern parameter is required',
                error: { code: 'MISSING_PARAM', message: 'pattern is required' }
            };
        }
        const searcher = FileSearcher_1.FileSearcher.getInstance();
        const results = await searcher.searchFiles(pattern, searchPath, {
            include: include ? include.split(',').map(s => s.trim()) : (filePattern ? [filePattern] : undefined),
            exclude: exclude ? exclude.split(',').map(s => s.trim()) : undefined,
            caseSensitive,
            maxResults: toolUse.params.maxResults ? parseInt(toolUse.params.maxResults) : 100,
            contextLines: toolUse.params.contextLines ? parseInt(toolUse.params.contextLines) : 2
        });
        const formattedResults = searcher.formatResults(results, context.projectRoot);
        return {
            success: true,
            message: `ripgrep found ${results.length} files with matches`,
            data: {
                results: formattedResults, // 포맷된 문자열 (LLM용)
                rawResults: results // 원본 SearchResult[] 배열 (파싱용)
            }
        };
    }
    getDescription(toolUse) {
        return `[ripgrep_search: ${toolUse.params.pattern}]`;
    }
}
exports.RipgrepSearchToolHandler = RipgrepSearchToolHandler;
//# sourceMappingURL=RipgrepSearchToolHandler.js.map