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
exports.TreeSitterAdapter = void 0;
const path = __importStar(require("path"));
const fs = __importStar(require("fs/promises"));
const vscode = __importStar(require("vscode"));
const ICodeParserAdapter_1 = require("./ICodeParserAdapter");
const languageParser_1 = require("./languageParser");
/**
 * Tree-sitter 기반 코드 파서 어댑터
 */
class TreeSitterAdapter {
    parserId = 'tree-sitter';
    parserName = 'Tree-sitter Code Parser';
    getSupportedLanguages() {
        return [
            'javascript',
            'typescript',
            'python',
            'java',
            // 필요시 추가
        ];
    }
    async parseDirectory(dirPath, options) {
        const maxFiles = options?.maxFiles ?? 50;
        const includeTests = options?.includeTests ?? false;
        // 파일 목록 가져오기
        const files = await this.getFilesToParse(dirPath, {
            ...options,
            maxFiles,
        });
        // 언어 파서 로드
        const languageParsers = await (0, languageParser_1.loadRequiredLanguageParsers)(files);
        // 각 파일 파싱
        const fileDefinitions = [];
        const summary = {
            totalFiles: 0,
            totalDefinitions: 0,
            byType: {},
            byLanguage: {},
        };
        for (const filePath of files) {
            try {
                const fileResult = await this.parseFileWithParser(filePath, languageParsers, dirPath);
                if (fileResult) {
                    fileDefinitions.push(fileResult);
                    summary.totalFiles++;
                    summary.totalDefinitions += fileResult.definitions.length;
                    // 타입별 집계
                    fileResult.definitions.forEach(def => {
                        summary.byType[def.type] = (summary.byType[def.type] || 0) + 1;
                    });
                    // 언어별 집계
                    summary.byLanguage[fileResult.language] =
                        (summary.byLanguage[fileResult.language] || 0) + 1;
                }
            }
            catch (error) {
                console.error(`[TreeSitterAdapter] Error parsing ${filePath}:`, error);
            }
        }
        return {
            projectPath: dirPath,
            files: fileDefinitions,
            summary,
        };
    }
    async parseFile(filePath) {
        if (!(0, languageParser_1.canParseFile)(filePath)) {
            return null;
        }
        const ext = path.extname(filePath).toLowerCase().slice(1);
        const languageParsers = await (0, languageParser_1.loadRequiredLanguageParsers)([filePath]);
        return await this.parseFileWithParser(filePath, languageParsers, path.dirname(filePath));
    }
    async findDefinition(name, type, searchPath) {
        const definitions = await this.parseDirectory(searchPath, { maxFiles: 100 });
        for (const file of definitions.files) {
            const found = file.definitions.find(def => def.name === name && def.type === type);
            if (found) {
                return found;
            }
        }
        return null;
    }
    async getClassMethods(className, searchPath) {
        const classDef = await this.getClassDefinition(className, searchPath);
        return classDef?.methods || [];
    }
    async getClassDefinition(className, searchPath) {
        const definitions = await this.parseDirectory(searchPath, { maxFiles: 100 });
        for (const file of definitions.files) {
            const classDef = file.definitions.find(def => def.name === className && def.type === ICodeParserAdapter_1.DefinitionType.CLASS);
            if (classDef) {
                // 같은 파일 내에서 메서드 찾기
                const methods = file.definitions.filter(def => def.type === ICodeParserAdapter_1.DefinitionType.METHOD &&
                    def.startLine > classDef.startLine &&
                    def.startLine < classDef.endLine);
                methods.forEach(method => {
                    method.className = className;
                });
                return {
                    ...classDef,
                    methods,
                    properties: [],
                };
            }
        }
        return null;
    }
    async getFileSummary(filePath) {
        const fileResult = await this.parseFile(filePath);
        if (!fileResult) {
            return `파일을 파싱할 수 없습니다: ${filePath}`;
        }
        return fileResult.formattedOutput || '정의를 찾을 수 없습니다.';
    }
    async getProjectSummary(projectPath, options) {
        const definitions = await this.parseDirectory(projectPath, options);
        let summary = `# 프로젝트 구조 요약\n\n`;
        summary += `총 ${definitions.summary.totalFiles}개 파일, ${definitions.summary.totalDefinitions}개 정의\n\n`;
        // 타입별 통계
        summary += `## 정의 타입별 분포:\n`;
        Object.entries(definitions.summary.byType)
            .sort((a, b) => b[1] - a[1])
            .forEach(([type, count]) => {
            summary += `- ${type}: ${count}개\n`;
        });
        summary += `\n## 파일별 정의:\n\n`;
        // 파일별 정의 출력
        definitions.files.forEach(file => {
            summary += `### ${file.relativePath}\n`;
            summary += file.formattedOutput;
            summary += `\n`;
        });
        return summary;
    }
    // ==================== Private 헬퍼 메서드 ====================
    /**
     * 파싱할 파일 목록 가져오기
     */
    async getFilesToParse(dirPath, options) {
        const maxFiles = options?.maxFiles ?? 50;
        const files = [];
        try {
            const uri = vscode.Uri.file(dirPath);
            const entries = await vscode.workspace.fs.readDirectory(uri);
            for (const [name, type] of entries) {
                if (files.length >= maxFiles)
                    break;
                const fullPath = path.join(dirPath, name);
                // 디렉토리는 재귀적으로 탐색
                if (type === vscode.FileType.Directory) {
                    // 제외할 디렉토리
                    if (this.shouldExcludeDirectory(name)) {
                        continue;
                    }
                    const subFiles = await this.getFilesToParse(fullPath, {
                        ...options,
                        maxFiles: maxFiles - files.length,
                    });
                    files.push(...subFiles);
                }
                // 파일은 확장자 확인
                else if (type === vscode.FileType.File) {
                    if ((0, ICodeParserAdapter_1.isParsableFile)(fullPath)) {
                        // 테스트 파일 제외 옵션
                        if (!options?.includeTests && this.isTestFile(fullPath)) {
                            continue;
                        }
                        files.push(fullPath);
                    }
                }
            }
        }
        catch (error) {
            console.error(`[TreeSitterAdapter] Error reading directory ${dirPath}:`, error);
        }
        return files.slice(0, maxFiles);
    }
    /**
     * 제외할 디렉토리 확인
     */
    shouldExcludeDirectory(dirName) {
        const excludedDirs = [
            'node_modules',
            'dist',
            'build',
            'out',
            '.git',
            '.vscode',
            '.idea',
            'coverage',
            '.next',
            '.nuxt',
            'target',
            'bin',
            'obj',
        ];
        return excludedDirs.includes(dirName) || dirName.startsWith('.');
    }
    /**
     * 테스트 파일 확인
     */
    isTestFile(filePath) {
        const fileName = path.basename(filePath).toLowerCase();
        return fileName.includes('.test.') ||
            fileName.includes('.spec.') ||
            fileName.includes('_test.') ||
            filePath.includes('__tests__') ||
            filePath.includes('/test/') ||
            filePath.includes('/tests/');
    }
    /**
     * 파일 파싱 (Tree-sitter 사용)
     */
    async parseFileWithParser(filePath, languageParsers, projectRoot) {
        try {
            const fileContent = await fs.readFile(filePath, 'utf-8');
            const ext = path.extname(filePath).toLowerCase().slice(1);
            const language = (0, ICodeParserAdapter_1.getLanguageFromExtension)(`.${ext}`);
            if (!language) {
                return null;
            }
            const { parser, query } = languageParsers[ext] || {};
            if (!parser || !query) {
                return null;
            }
            // AST 파싱
            const tree = parser.parse(fileContent);
            if (!tree || !tree.rootNode) {
                return null;
            }
            // 쿼리 실행
            const captures = query.captures(tree.rootNode);
            captures.sort((a, b) => a.node.startPosition.row - b.node.startPosition.row);
            const lines = fileContent.split('\n');
            const definitions = [];
            let formattedOutput = '|----\n';
            let lastLine = -1;
            captures.forEach((capture) => {
                const { node, name } = capture;
                const startLine = node.startPosition.row;
                const endLine = node.endPosition.row;
                // 간격이 있으면 구분선 추가
                if (lastLine !== -1 && startLine > lastLine + 1) {
                    formattedOutput += '|----\n';
                }
                // 정의 이름만 추출
                if (name.includes('name') && lines[startLine]) {
                    formattedOutput += `│${lines[startLine]}\n`;
                    // Definition 객체 생성
                    const defType = this.extractDefinitionType(name);
                    const defName = this.extractDefinitionName(lines[startLine], defType);
                    if (defName) {
                        definitions.push({
                            type: defType,
                            name: defName,
                            startLine,
                            endLine,
                            content: lines[startLine],
                            filePath,
                        });
                    }
                }
                lastLine = endLine;
            });
            formattedOutput += '|----\n';
            return {
                filePath,
                relativePath: path.relative(projectRoot, filePath),
                language,
                definitions,
                formattedOutput,
            };
        }
        catch (error) {
            console.error(`[TreeSitterAdapter] Error parsing file ${filePath}:`, error);
            return null;
        }
    }
    /**
     * 캡처 이름에서 정의 타입 추출
     */
    extractDefinitionType(captureName) {
        if (captureName.includes('class'))
            return ICodeParserAdapter_1.DefinitionType.CLASS;
        if (captureName.includes('function'))
            return ICodeParserAdapter_1.DefinitionType.FUNCTION;
        if (captureName.includes('method'))
            return ICodeParserAdapter_1.DefinitionType.METHOD;
        if (captureName.includes('interface'))
            return ICodeParserAdapter_1.DefinitionType.INTERFACE;
        if (captureName.includes('type'))
            return ICodeParserAdapter_1.DefinitionType.TYPE;
        if (captureName.includes('enum'))
            return ICodeParserAdapter_1.DefinitionType.ENUM;
        if (captureName.includes('module'))
            return ICodeParserAdapter_1.DefinitionType.MODULE;
        return ICodeParserAdapter_1.DefinitionType.VARIABLE;
    }
    /**
     * 코드 라인에서 정의 이름 추출
     */
    extractDefinitionName(line, type) {
        const trimmed = line.trim();
        // 클래스
        if (type === ICodeParserAdapter_1.DefinitionType.CLASS) {
            const match = trimmed.match(/class\s+(\w+)/);
            return match ? match[1] : null;
        }
        // 함수
        if (type === ICodeParserAdapter_1.DefinitionType.FUNCTION) {
            const match = trimmed.match(/function\s+(\w+)/) ||
                trimmed.match(/const\s+(\w+)\s*=/) ||
                trimmed.match(/export\s+(?:async\s+)?function\s+(\w+)/);
            return match ? match[1] : null;
        }
        // 메서드
        if (type === ICodeParserAdapter_1.DefinitionType.METHOD) {
            const match = trimmed.match(/(\w+)\s*\([^)]*\)/) ||
                trimmed.match(/async\s+(\w+)\s*\(/);
            return match ? match[1] : null;
        }
        // 인터페이스
        if (type === ICodeParserAdapter_1.DefinitionType.INTERFACE) {
            const match = trimmed.match(/interface\s+(\w+)/);
            return match ? match[1] : null;
        }
        // 타입
        if (type === ICodeParserAdapter_1.DefinitionType.TYPE) {
            const match = trimmed.match(/type\s+(\w+)/);
            return match ? match[1] : null;
        }
        // Enum
        if (type === ICodeParserAdapter_1.DefinitionType.ENUM) {
            const match = trimmed.match(/enum\s+(\w+)/);
            return match ? match[1] : null;
        }
        return null;
    }
    /**
     * 특정 디렉토리의 최상위 레벨 코드 정의 이름 목록 반환
     */
    async listCodeDefinitionNames(dirPath, options) {
        const definitions = await this.parseDirectory(dirPath, {
            maxFiles: options?.recursive ? 200 : 50,
            includeTests: false,
        });
        const names = new Set();
        definitions.files.forEach(file => {
            file.definitions.forEach(def => {
                if (!options?.definitionTypes || options.definitionTypes.includes(def.type)) {
                    names.add(def.name);
                }
            });
        });
        return Array.from(names).sort();
    }
    /**
     * 특정 정의가 사용되는 모든 위치 찾기
     */
    async findDefinitionUsages(definitionName, definitionType, projectRoot) {
        const usages = [];
        const definitionsInProject = await this.parseDirectory(projectRoot, { maxFiles: 200 });
        for (const file of definitionsInProject.files) {
            try {
                const fileContent = await fs.readFile(file.filePath, 'utf-8');
                const lines = fileContent.split('\n');
                lines.forEach((line, lineNum) => {
                    const trimmedLine = line.trim();
                    // 정의 자체의 위치도 포함
                    if (file.definitions.some(def => def.name === definitionName &&
                        def.type === definitionType &&
                        def.startLine === lineNum + 1)) {
                        usages.push({
                            filePath: file.filePath,
                            line: lineNum + 1,
                            column: line.indexOf(definitionName),
                            context: trimmedLine,
                            usageType: 'definition',
                        });
                    }
                    // import 문에서 사용
                    if (trimmedLine.includes('import') && trimmedLine.includes(definitionName)) {
                        const importMatch = trimmedLine.match(new RegExp(`(?:import\\s+(?:\\{[^}]*?\\b${definitionName}\\b[^}]*\\}|\\b${definitionName}\\b)|from\\s+['"].*?\\b${definitionName}\\b['"])`, 'g'));
                        if (importMatch) {
                            usages.push({
                                filePath: file.filePath,
                                line: lineNum + 1,
                                column: line.indexOf(definitionName),
                                context: trimmedLine,
                                usageType: 'import',
                            });
                        }
                    }
                    // 함수/메서드 호출
                    if (definitionType === ICodeParserAdapter_1.DefinitionType.FUNCTION ||
                        definitionType === ICodeParserAdapter_1.DefinitionType.METHOD) {
                        const callPattern = new RegExp(`\\b${definitionName}\\s*\\(`, 'g');
                        if (callPattern.test(trimmedLine)) {
                            usages.push({
                                filePath: file.filePath,
                                line: lineNum + 1,
                                column: line.indexOf(definitionName),
                                context: trimmedLine,
                                usageType: 'call',
                            });
                        }
                    }
                    // 클래스 상속/구현
                    if (definitionType === ICodeParserAdapter_1.DefinitionType.CLASS) {
                        if (trimmedLine.includes(`extends ${definitionName}`) ||
                            trimmedLine.includes(`implements ${definitionName}`)) {
                            usages.push({
                                filePath: file.filePath,
                                line: lineNum + 1,
                                column: line.indexOf(definitionName),
                                context: trimmedLine,
                                usageType: trimmedLine.includes('extends') ? 'extend' : 'implement',
                            });
                        }
                    }
                    // 일반 참조
                    const refPattern = new RegExp(`\\b${definitionName}\\b`, 'g');
                    const matches = [...trimmedLine.matchAll(refPattern)];
                    matches.forEach(match => {
                        // 이미 추가된 사용 위치가 아니면 추가
                        const alreadyAdded = usages.some(u => u.filePath === file.filePath &&
                            u.line === lineNum + 1 &&
                            u.column === (match.index || 0));
                        if (!alreadyAdded && match.index !== undefined) {
                            usages.push({
                                filePath: file.filePath,
                                line: lineNum + 1,
                                column: match.index,
                                context: trimmedLine,
                                usageType: 'reference',
                            });
                        }
                    });
                });
            }
            catch (error) {
                console.error(`[TreeSitterAdapter] Error finding usages in ${file.filePath}:`, error);
            }
        }
        return usages;
    }
    /**
     * 관련 파일 찾기 (import/export 기반)
     * 특정 파일과 import/export 관계가 있는 파일들을 찾음
     */
    async findRelatedFiles(filePath, projectRoot) {
        const relatedFiles = [];
        try {
            const fileContent = await fs.readFile(filePath, 'utf-8');
            const lines = fileContent.split('\n');
            const fileName = path.basename(filePath, path.extname(filePath));
            const fileDir = path.dirname(filePath);
            // 현재 파일에서 export하는 심볼 추출
            const exportedSymbols = [];
            const fileDefs = await this.parseFile(filePath);
            if (fileDefs) {
                exportedSymbols.push(...fileDefs.definitions
                    .filter(def => {
                    // export 키워드가 있는 정의 찾기
                    const defLine = lines[def.startLine - 1] || '';
                    return defLine.includes('export');
                })
                    .map(def => def.name));
            }
            // 프로젝트 전체에서 import 문 검색
            const definitions = await this.parseDirectory(projectRoot, { maxFiles: 200 });
            for (const otherFile of definitions.files) {
                if (otherFile.filePath === filePath)
                    continue;
                try {
                    const otherContent = await fs.readFile(otherFile.filePath, 'utf-8');
                    const otherLines = otherContent.split('\n');
                    const importedSymbols = [];
                    // Import 문에서 현재 파일 참조 확인
                    for (const line of otherLines) {
                        const trimmed = line.trim();
                        // 상대 경로 import
                        if (trimmed.includes('import') && trimmed.includes('from')) {
                            const fromMatch = trimmed.match(/from\s+['"](.+?)['"]/);
                            if (fromMatch) {
                                const importPath = fromMatch[1];
                                const otherFileDir = path.dirname(otherFile.filePath);
                                // 상대 경로를 절대 경로로 변환
                                let resolvedPath;
                                if (importPath.startsWith('.')) {
                                    resolvedPath = path.resolve(otherFileDir, importPath);
                                }
                                else {
                                    // 절대 경로나 node_modules는 스킵
                                    continue;
                                }
                                // 현재 파일과 일치하는지 확인
                                const normalizedResolved = path.normalize(resolvedPath);
                                const normalizedCurrent = path.normalize(filePath);
                                if (normalizedResolved === normalizedCurrent ||
                                    normalizedResolved === path.normalize(filePath.replace(/\.(ts|tsx|js|jsx)$/, ''))) {
                                    // import된 심볼 추출
                                    const importMatch = trimmed.match(/import\s+(.+?)\s+from/);
                                    if (importMatch) {
                                        const symbols = importMatch[1]
                                            .replace(/\{|\}/g, '')
                                            .split(',')
                                            .map(s => s.trim().split(' as ')[0]);
                                        importedSymbols.push(...symbols);
                                    }
                                }
                            }
                        }
                        // 파일명 기반 import (간단한 매칭)
                        if (trimmed.includes(`from './${fileName}'`) ||
                            trimmed.includes(`from '../${fileName}'`) ||
                            trimmed.includes(`from '${fileName}'`)) {
                            const importMatch = trimmed.match(/import\s+(.+?)\s+from/);
                            if (importMatch) {
                                const symbols = importMatch[1]
                                    .replace(/\{|\}/g, '')
                                    .split(',')
                                    .map(s => s.trim().split(' as ')[0]);
                                importedSymbols.push(...symbols);
                            }
                        }
                    }
                    if (importedSymbols.length > 0) {
                        relatedFiles.push({
                            filePath: otherFile.filePath,
                            relationship: 'imported_by',
                            symbols: importedSymbols,
                        });
                    }
                }
                catch (error) {
                    console.error(`[TreeSitterAdapter] Error checking related files for ${otherFile.filePath}:`, error);
                }
            }
            // 현재 파일이 import하는 파일들 찾기
            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.includes('import') && trimmed.includes('from')) {
                    const fromMatch = trimmed.match(/from\s+['"](.+?)['"]/);
                    if (fromMatch) {
                        const importPath = fromMatch[1];
                        if (importPath.startsWith('.')) {
                            const resolvedPath = path.resolve(fileDir, importPath);
                            const normalizedResolved = path.normalize(resolvedPath);
                            // 프로젝트 내 파일 찾기
                            for (const otherFile of definitions.files) {
                                const normalizedOther = path.normalize(otherFile.filePath);
                                if (normalizedResolved === normalizedOther ||
                                    normalizedResolved === path.normalize(otherFile.filePath.replace(/\.(ts|tsx|js|jsx)$/, ''))) {
                                    const importMatch = trimmed.match(/import\s+(.+?)\s+from/);
                                    const symbols = importMatch
                                        ? importMatch[1]
                                            .replace(/\{|\}/g, '')
                                            .split(',')
                                            .map(s => s.trim().split(' as ')[0])
                                        : [];
                                    relatedFiles.push({
                                        filePath: otherFile.filePath,
                                        relationship: 'imports',
                                        symbols,
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }
        catch (error) {
            console.error(`[TreeSitterAdapter] Error finding related files for ${filePath}:`, error);
        }
        return relatedFiles;
    }
}
exports.TreeSitterAdapter = TreeSitterAdapter;
//# sourceMappingURL=TreeSitterAdapter.js.map