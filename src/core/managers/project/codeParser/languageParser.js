import * as path from 'path';
import * as vscode from 'vscode';
import Parser from 'web-tree-sitter';
import { typescriptQuery, javascriptQuery, pythonQuery, javaQuery, goQuery, rustQuery, cQuery, cppQuery, } from './queries';
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
    return await Parser.Language.load(wasmPath);
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
            await Parser.init();
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
export async function loadRequiredLanguageParsers(filesToParse) {
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
                    query = language.query(javascriptQuery);
                    break;
                case 'ts':
                    language = await loadLanguage('typescript');
                    query = language.query(typescriptQuery);
                    break;
                case 'tsx':
                    language = await loadLanguage('tsx');
                    query = language.query(typescriptQuery);
                    break;
                case 'py':
                    language = await loadLanguage('python');
                    query = language.query(pythonQuery);
                    break;
                case 'java':
                    language = await loadLanguage('java');
                    query = language.query(javaQuery);
                    break;
                case 'go':
                    language = await loadLanguage('go');
                    query = language.query(goQuery);
                    break;
                case 'rs':
                    language = await loadLanguage('rust');
                    query = language.query(rustQuery);
                    break;
                case 'c':
                case 'h':
                    language = await loadLanguage('c');
                    query = language.query(cQuery);
                    break;
                case 'cpp':
                case 'hpp':
                case 'cc':
                case 'hh':
                    language = await loadLanguage('cpp');
                    query = language.query(cppQuery);
                    break;
                default:
                    console.log(`[LanguageParser] Unsupported language extension: ${ext}`);
                    continue;
            }
            const parser = new Parser();
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
export async function loadLanguageParser(ext) {
    const parsers = await loadRequiredLanguageParsers([`dummy.${ext}`]);
    return parsers[ext] || null;
}
/**
 * 지원하는 확장자 목록
 */
export function getSupportedExtensions() {
    return [
        'js', 'jsx', // JavaScript
        'ts', 'tsx', // TypeScript
        'py', // Python
        'java', // Java
        'go', // Go
        'rs', // Rust
        'c', 'h', // C
        'cpp', 'hpp', 'cc', 'hh', // C++
    ];
}
/**
 * 파싱 가능한 파일인지 확인
 */
export function canParseFile(filePath) {
    const ext = path.extname(filePath).toLowerCase().slice(1);
    return getSupportedExtensions().includes(ext);
}
//# sourceMappingURL=languageParser.js.map