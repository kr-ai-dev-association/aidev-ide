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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadRequiredLanguageParsers = loadRequiredLanguageParsers;
exports.loadLanguageParser = loadLanguageParser;
exports.getSupportedExtensions = getSupportedExtensions;
exports.canParseFile = canParseFile;
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const web_tree_sitter_1 = __importDefault(require("web-tree-sitter"));
const queries_1 = require("./queries");
/**
 * WASM 파일 로드
 */
async function loadLanguage(langName) {
    // VS Code extension path 가져오기
    const extension = vscode.extensions.getExtension('banya.codepilot');
    if (!extension) {
        throw new Error('codepilot extension not found');
    }
    // WASM 파일은 webpack으로 dist/tree-sitter에 복사됨
    const wasmPath = path.join(extension.extensionPath, 'dist', 'tree-sitter', `tree-sitter-${langName}.wasm`);
    console.log(`[TreeSitter] Loading ${langName} from: ${wasmPath}`);
    return await web_tree_sitter_1.default.Language.load(wasmPath);
}
/**
 * Parser 초기화 상태 관리 클래스
 * 전역변수 대신 클래스로 캡슐화
 */
class ParserInitializer {
    static initialized = false;
    /**
     * Parser 초기화 (한 번만 실행)
     */
    static async initialize() {
        if (!this.initialized) {
            console.log('[TreeSitter] Initializing Parser...');
            await web_tree_sitter_1.default.init();
            this.initialized = true;
            console.log('[TreeSitter] Parser initialized ✓');
        }
    }
    /**
     * 초기화 상태 확인
     */
    static isInitialized() {
        return this.initialized;
    }
    /**
     * 초기화 상태 리셋 (테스트용)
     */
    static reset() {
        this.initialized = false;
    }
}
/**
 * Parser 초기화 (한 번만 실행)
 */
async function initializeParser() {
    await ParserInitializer.initialize();
}
/**
 * 파일 확장자에 따라 필요한 언어 파서 로드
 *
 * WASM 방식 사용 이유:
 * - VS Code Extension에서 네이티브 바인딩은 Electron과 호환성 문제
 * - WASM은 크로스 플랫폼 지원
 * - web-tree-sitter와 tree-sitter-wasms 활용
 *
 * @param filesToParse 파싱할 파일 목록
 * @returns 언어별 파서와 쿼리 맵
 */
async function loadRequiredLanguageParsers(filesToParse) {
    console.log(`[TreeSitter] Loading parsers for ${filesToParse.length} files...`);
    await initializeParser();
    // 고유한 확장자 추출
    const extensionsToLoad = new Set(filesToParse.map((file) => path.extname(file).toLowerCase().slice(1)));
    console.log(`[TreeSitter] Extensions to load:`, Array.from(extensionsToLoad));
    const parsers = {};
    for (const ext of extensionsToLoad) {
        try {
            let language;
            let query;
            switch (ext) {
                case 'js':
                case 'jsx':
                    language = await loadLanguage('javascript');
                    query = language.query(queries_1.javascriptQuery);
                    break;
                case 'ts':
                    language = await loadLanguage('typescript');
                    query = language.query(queries_1.typescriptQuery);
                    break;
                case 'tsx':
                    language = await loadLanguage('tsx');
                    query = language.query(queries_1.typescriptQuery);
                    break;
                case 'py':
                    language = await loadLanguage('python');
                    query = language.query(queries_1.pythonQuery);
                    break;
                case 'java':
                    language = await loadLanguage('java');
                    query = language.query(queries_1.javaQuery);
                    break;
                // 추가 언어는 여기에 case 추가
                // case 'rs':
                //     language = await loadLanguage('rust');
                //     query = language.query(rustQuery);
                //     break;
                default:
                    console.log(`[LanguageParser] Unsupported language extension: ${ext}`);
                    continue;
            }
            const parser = new web_tree_sitter_1.default();
            parser.setLanguage(language);
            parsers[ext] = { parser, query };
        }
        catch (error) {
            console.error(`[LanguageParser] Failed to load parser for ${ext}:`, error);
        }
    }
    return parsers;
}
/**
 * 단일 확장자에 대한 파서 로드
 */
async function loadLanguageParser(ext) {
    const parsers = await loadRequiredLanguageParsers([`dummy.${ext}`]);
    return parsers[ext] || null;
}
/**
 * 지원하는 확장자 목록
 */
function getSupportedExtensions() {
    return [
        'js', 'jsx', // JavaScript
        'ts', 'tsx', // TypeScript
        'py', // Python
        'java', // Java
        // 필요시 추가
        // 'rs',               // Rust
        // 'go',               // Go
        // 'c', 'h',           // C
        // 'cpp', 'hpp',       // C++
        // 'cs',               // C#
        // 'rb',               // Ruby
        // 'php',              // PHP
        // 'swift',            // Swift
        // 'kt',               // Kotlin
    ];
}
/**
 * 파싱 가능한 파일인지 확인
 */
function canParseFile(filePath) {
    const ext = path.extname(filePath).toLowerCase().slice(1);
    return getSupportedExtensions().includes(ext);
}
//# sourceMappingURL=languageParser.js.map