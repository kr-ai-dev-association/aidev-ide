"use strict";
/**
 * 코드 파서 추상화 인터페이스
 * Tree-sitter 기반 코드 분석 및 정의 추출
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SUPPORTED_EXTENSIONS = exports.DefinitionType = void 0;
exports.getLanguageFromExtension = getLanguageFromExtension;
exports.isParsableFile = isParsableFile;
/**
 * 정의 타입
 */
var DefinitionType;
(function (DefinitionType) {
    DefinitionType["CLASS"] = "class";
    DefinitionType["FUNCTION"] = "function";
    DefinitionType["METHOD"] = "method";
    DefinitionType["INTERFACE"] = "interface";
    DefinitionType["TYPE"] = "type";
    DefinitionType["ENUM"] = "enum";
    DefinitionType["MODULE"] = "module";
    DefinitionType["VARIABLE"] = "variable";
    DefinitionType["CONSTANT"] = "constant";
})(DefinitionType || (exports.DefinitionType = DefinitionType = {}));
/**
 * 지원 언어 확장자 매핑
 */
exports.SUPPORTED_EXTENSIONS = {
    javascript: ['.js', '.jsx'],
    typescript: ['.ts', '.tsx'],
    python: ['.py'],
    rust: ['.rs'],
    go: ['.go'],
    c: ['.c', '.h'],
    cpp: ['.cpp', '.hpp', '.cc', '.hh'],
    csharp: ['.cs'],
    ruby: ['.rb'],
    java: ['.java'],
    php: ['.php'],
    swift: ['.swift'],
    kotlin: ['.kt', '.kts'],
};
/**
 * 언어별 확장자 가져오기
 */
function getLanguageFromExtension(ext) {
    for (const [language, extensions] of Object.entries(exports.SUPPORTED_EXTENSIONS)) {
        if (extensions.includes(ext.toLowerCase())) {
            return language;
        }
    }
    return null;
}
/**
 * 파싱 가능한 파일인지 확인
 */
function isParsableFile(filePath) {
    const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase();
    return getLanguageFromExtension(ext) !== null;
}
//# sourceMappingURL=ICodeParserAdapter.js.map