"use strict";
/**
 * Create File Tool Handler
 * 파일 생성 툴 핸들러
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
exports.CreateFileToolHandler = void 0;
const types_1 = require("../types");
const string_1 = require("../../../utils/string");
const path = __importStar(require("path"));
class CreateFileToolHandler {
    name = types_1.Tool.CREATE_FILE;
    async execute(toolUse, context) {
        const filePath = toolUse.params.path || toolUse.params.absolutePath;
        const content = toolUse.params.content;
        if (!filePath) {
            return {
                success: false,
                message: 'Path parameter is required',
                error: { code: 'MISSING_PARAM', message: 'path is required' }
            };
        }
        if (!content) {
            return {
                success: false,
                message: 'Content parameter is required',
                error: { code: 'MISSING_PARAM', message: 'content is required' }
            };
        }
        // HTML 엔티티 처리 (AI 모델이 잘못 이스케이프한 경우 수정)
        let cleanedContent = (0, string_1.fixModelHtmlEscaping)(content);
        // CDATA 섹션 제거 (LLM이 JSON 등을 CDATA로 감싸는 경우 처리)
        cleanedContent = (0, string_1.removeCDataSections)(cleanedContent);
        const absolutePath = path.isAbsolute(filePath)
            ? filePath
            : path.join(context.projectRoot, filePath);
        // InlineDiffManager를 통해 diff 표시
        const { InlineDiffManager } = await import('../../managers/diff/InlineDiffManager');
        const inlineDiffManager = InlineDiffManager.getInstance();
        // 원본 내용 (새 파일이므로 빈 문자열)
        const originalContent = '';
        // diff 표시
        await inlineDiffManager.showInlineDiff(absolutePath, originalContent, cleanedContent);
        return {
            success: true,
            message: `File ${filePath} ready for review in diff editor. Please approve or reject the changes.`,
            data: { filePath, pending: true },
            filePath: filePath,
            fileContent: cleanedContent
        };
    }
    getDescription(toolUse) {
        const path = toolUse.params.path || toolUse.params.absolutePath;
        return `[create_file for '${path}']`;
    }
}
exports.CreateFileToolHandler = CreateFileToolHandler;
//# sourceMappingURL=CreateFileToolHandler.js.map