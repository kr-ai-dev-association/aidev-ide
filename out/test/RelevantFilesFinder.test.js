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
const assert = __importStar(require("assert"));
const vscode = __importStar(require("vscode"));
const RelevantFilesFinder_1 = require("../core/managers/context/file/RelevantFilesFinder");
const ProjectManager_1 = require("../core/managers/project/ProjectManager");
/**
 * RelevantFilesFinder 테스트 스위트
 *
 * ✅ 테스트 검증 항목:
 * 1. 인스턴스 생성
 * 2. 키워드 추출
 * 3. 명시적 파일 찾기
 * 4. Ripgrep 필터링
 * 5. 빈 쿼리 처리
 * 6. AbortSignal 처리
 */
suite('RelevantFilesFinder Test Suite', () => {
    let finder;
    let projectManager;
    let testWorkspacePath;
    suiteSetup(async () => {
        vscode.window.showInformationMessage('RelevantFilesFinder 테스트 시작');
        // 테스트 워크스페이스 경로 설정
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            testWorkspacePath = workspaceFolders[0].uri.fsPath;
        }
        else {
            testWorkspacePath = process.cwd();
        }
        // ProjectManager 초기화
        projectManager = ProjectManager_1.ProjectManager.getInstance();
        if (testWorkspacePath) {
            try {
                await projectManager.initialize(testWorkspacePath);
            }
            catch (error) {
                console.warn('[Test] ProjectManager 초기화 실패:', error);
            }
        }
        // RelevantFilesFinder 초기화
        finder = new RelevantFilesFinder_1.RelevantFilesFinder(projectManager);
    });
    test('RelevantFilesFinder 인스턴스 생성', () => {
        assert.ok(finder, 'RelevantFilesFinder 인스턴스가 생성되어야 합니다');
    });
    test('키워드 추출 테스트', async () => {
        const userQuery = 'React 컴포넌트 버튼 만들기';
        const result = await finder.getRelevantFilesContext(userQuery, testWorkspacePath, new AbortController().signal);
        assert.ok(result, '결과가 반환되어야 합니다');
        assert.ok(Array.isArray(result.extractedKeywords), '키워드 배열이 있어야 합니다');
        console.log(`[Test] 추출된 키워드: ${result.extractedKeywords?.join(', ')}`);
    });
    test('명시적 파일 찾기 테스트', async () => {
        const userQuery = 'package.json 파일 읽기';
        const result = await finder.getRelevantFilesContext(userQuery, testWorkspacePath, new AbortController().signal);
        assert.ok(result, '결과가 반환되어야 합니다');
        assert.ok(Array.isArray(result.includedFilesForContext), '포함된 파일 배열이 있어야 합니다');
        // package.json이 명시적으로 언급되었으므로 포함되어야 함
        const hasPackageJson = result.includedFilesForContext.some(file => file.name === 'package.json' || file.name.includes('package.json'));
        console.log(`[Test] package.json 포함 여부: ${hasPackageJson}`);
    });
    test('Ripgrep 필터링 테스트 (LLM 없이)', async () => {
        const userQuery = 'React 컴포넌트';
        const result = await finder.getRelevantFilesContext(userQuery, testWorkspacePath, new AbortController().signal);
        assert.ok(result, '결과가 반환되어야 합니다');
        assert.ok(Array.isArray(result.includedFilesForContext), '포함된 파일 배열이 있어야 합니다');
        console.log(`[Test] 포함된 파일 수: ${result.includedFilesForContext.length}`);
    });
    test('빈 쿼리 처리 테스트', async () => {
        const userQuery = '';
        const result = await finder.getRelevantFilesContext(userQuery, testWorkspacePath, new AbortController().signal);
        assert.ok(result, '결과가 반환되어야 합니다');
        assert.ok(typeof result.fileContentsContext === 'string', 'fileContentsContext는 문자열이어야 합니다');
    });
    test('AbortSignal 처리 테스트', async () => {
        const abortController = new AbortController();
        abortController.abort(); // 즉시 중단
        const userQuery = '테스트 쿼리';
        const result = await finder.getRelevantFilesContext(userQuery, testWorkspacePath, abortController.signal);
        assert.ok(result, '중단되어도 결과는 반환되어야 합니다');
    });
});
//# sourceMappingURL=RelevantFilesFinder.test.js.map