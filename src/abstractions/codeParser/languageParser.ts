import * as path from 'path';
import Parser from 'web-tree-sitter';
import {
    typescriptQuery,
    javascriptQuery,
    pythonQuery,
    javaQuery,
} from './queries';

/**
 * 언어 파서 맵
 */
export interface LanguageParser {
    [key: string]: {
        parser: Parser;
        query: Parser.Query;
    };
}

/**
 * WASM 파일 로드
 */
async function loadLanguage(langName: string): Promise<Parser.Language> {
    // WASM 파일은 webpack으로 dist/tree-sitter에 복사됨
    // __dirname은 dist/abstractions/codeParser이므로 ../../tree-sitter로 접근
    const wasmPath = path.join(__dirname, '..', '..', 'tree-sitter', `tree-sitter-${langName}.wasm`);
    console.log(`[TreeSitter] Loading ${langName} from: ${wasmPath}`);
    return await Parser.Language.load(wasmPath);
}

let isParserInitialized = false;

/**
 * Parser 초기화 (한 번만 실행)
 */
async function initializeParser(): Promise<void> {
    if (!isParserInitialized) {
        console.log('[TreeSitter] Initializing Parser...');
        await Parser.init();
        isParserInitialized = true;
        console.log('[TreeSitter] Parser initialized ✓');
    }
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
export async function loadRequiredLanguageParsers(filesToParse: string[]): Promise<LanguageParser> {
    console.log(`[TreeSitter] Loading parsers for ${filesToParse.length} files...`);
    await initializeParser();
    
    // 고유한 확장자 추출
    const extensionsToLoad = new Set(
        filesToParse.map((file) => path.extname(file).toLowerCase().slice(1))
    );
    console.log(`[TreeSitter] Extensions to load:`, Array.from(extensionsToLoad));
    
    const parsers: LanguageParser = {};
    
    for (const ext of extensionsToLoad) {
        try {
            let language: Parser.Language;
            let query: Parser.Query;
            
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
                    
                // 추가 언어는 여기에 case 추가
                // case 'rs':
                //     language = await loadLanguage('rust');
                //     query = language.query(rustQuery);
                //     break;
                
                default:
                    console.log(`[LanguageParser] Unsupported language extension: ${ext}`);
                    continue;
            }
            
            const parser = new Parser();
            parser.setLanguage(language);
            parsers[ext] = { parser, query };
            
        } catch (error) {
            console.error(`[LanguageParser] Failed to load parser for ${ext}:`, error);
        }
    }
    
    return parsers;
}

/**
 * 단일 확장자에 대한 파서 로드
 */
export async function loadLanguageParser(ext: string): Promise<{ parser: Parser; query: Parser.Query } | null> {
    const parsers = await loadRequiredLanguageParsers([`dummy.${ext}`]);
    return parsers[ext] || null;
}

/**
 * 지원하는 확장자 목록
 */
export function getSupportedExtensions(): string[] {
    return [
        'js', 'jsx',           // JavaScript
        'ts', 'tsx',           // TypeScript
        'py',                  // Python
        'java',                // Java
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
export function canParseFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase().slice(1);
    return getSupportedExtensions().includes(ext);
}

