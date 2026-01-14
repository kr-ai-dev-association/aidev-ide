"use strict";
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
exports.getFileType = getFileType;
const path = __importStar(require("path"));
/**
 * 파일 경로의 확장자에 따라 코드 언어 타입을 반환합니다.
 */
function getFileType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
        case '.ts':
        case '.tsx': return 'typescript';
        case '.js':
        case '.jsx': return 'javascript';
        case '.py': return 'python';
        case '.html': return 'html';
        case '.css': return 'css';
        case '.java': return 'java';
        case '.swift': return 'swift';
        case '.c': return 'c';
        case '.cpp': return 'cpp';
        case '.go': return 'go';
        case '.rs': return 'rust';
        case '.md': return 'markdown';
        case '.json': return 'json';
        case '.xml': return 'xml';
        case '.yaml':
        case '.yml': return 'yaml';
        case '.sh': return 'shell';
        case '.rb': return 'ruby';
        case '.php': return 'php';
        case '.sql': return 'sql';
        default: return '';
    }
}
//# sourceMappingURL=fileUtils.js.map