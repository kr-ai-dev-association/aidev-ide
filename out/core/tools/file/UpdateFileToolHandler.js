"use strict";
/**
 * Update File Tool Handler
 * 파일 수정 툴 핸들러 (부분 수정 지원)
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
exports.UpdateFileToolHandler = void 0;
const types_1 = require("../types");
const string_1 = require("../../../utils/string");
const FileMutationManager_1 = require("../../managers/file/FileMutationManager");
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const AgentConfig_1 = require("../../config/AgentConfig");
class UpdateFileToolHandler {
    name = types_1.Tool.UPDATE_FILE;
    async execute(toolUse, context) {
        const filePath = toolUse.params.path;
        const diff = toolUse.params.diff;
        if (!filePath || !diff) {
            return {
                success: false,
                message: "Path and diff parameters are required",
                error: { code: "MISSING_PARAM", message: "path and diff are required" },
            };
        }
        const mutationManager = FileMutationManager_1.FileMutationManager.getInstance();
        // HTML 엔티티 처리 (AI 모델이 잘못 이스케이프한 경우 수정)
        let cleanedDiff = (0, string_1.fixModelHtmlEscaping)(diff);
        // CDATA 섹션 제거 (LLM이 JSON 등을 CDATA로 감싸는 경우 처리)
        cleanedDiff = (0, string_1.removeCDataSections)(cleanedDiff);
        // SEARCH/REPLACE 블록 파싱
        const replacements = this.parseDiff(cleanedDiff);
        if (replacements.length === 0) {
            return {
                success: false,
                message: "No valid SEARCH/REPLACE blocks found in diff",
                error: {
                    code: "INVALID_DIFF",
                    message: "Diff must contain SEARCH/REPLACE blocks",
                },
            };
        }
        // 파일 읽기
        const absolutePath = path.isAbsolute(filePath)
            ? filePath
            : path.join(context.projectRoot, filePath);
        let fileContent = "";
        try {
            fileContent = await fs.readFile(absolutePath, "utf8");
        }
        catch (error) {
            return {
                success: false,
                message: `File not found: ${filePath}`,
                error: {
                    code: "FILE_NOT_FOUND",
                    message: error instanceof Error ? error.message : String(error),
                },
            };
        }
        // --- 사전 파일 검사 (Preflight Inspection) ---
        const analysis = mutationManager.analyzeFile(fileContent);
        // ✅ 핵심: SEARCH/REPLACE diff가 있으면 무조건 SEARCH_REPLACE 전략 사용
        // ❌ 절대 금지: SEARCH/REPLACE diff + STRUCTURAL_REWRITE 혼용
        // STRUCTURAL_REWRITE는 전체 파일 재작성 전략이므로 SEARCH/REPLACE와 모순됨
        let strategy = mutationManager.chooseStrategy(analysis, replacements[0].search);
        // SEARCH/REPLACE 블록이 있으면 무조건 SEARCH_REPLACE 전략 사용
        if (replacements.length > 0) {
            strategy = FileMutationManager_1.PatchStrategy.SEARCH_REPLACE;
            console.log(`[UpdateFileToolHandler] Using SEARCH_REPLACE strategy (SEARCH/REPLACE diff detected) for ${filePath}`);
        }
        else if (strategy === FileMutationManager_1.PatchStrategy.STRUCTURAL_REWRITE) {
            console.log(`[UpdateFileToolHandler] Strategy switched to STRUCTURAL_REWRITE for ${filePath}`);
            // STRUCTURAL_REWRITE는 전체 파일 재작성이므로 별도 처리 필요
            // 하지만 지금은 SEARCH/REPLACE만 처리하므로 여기서는 발생하지 않음
        }
        // 각 REPLACE 블록의 매칭 위치를 찾아서 저장
        const replacementsToApply = [];
        for (const replacement of replacements) {
            let matchResult = false;
            // 매칭 전략 1: 정확한 매칭 시도
            const exactIndex = fileContent.indexOf(replacement.search);
            if (exactIndex !== -1) {
                matchResult = [exactIndex, exactIndex + replacement.search.length];
                console.log(`[UpdateFileToolHandler] Exact match found for ${filePath}`);
            }
            // 매칭 전략 2: Line-trimmed 매칭 (정확한 매칭 실패 시)
            if (!matchResult) {
                const lineMatch = this.lineTrimmedFallbackMatch(fileContent, replacement.search, 0);
                if (lineMatch) {
                    matchResult = lineMatch;
                    console.log(`[UpdateFileToolHandler] Line-trimmed match found for ${filePath}`);
                }
            }
            // 매칭 전략 3: Block anchor 매칭 (여전히 실패 시)
            if (!matchResult) {
                const blockMatch = this.blockAnchorFallbackMatch(fileContent, replacement.search, 0);
                if (blockMatch) {
                    matchResult = blockMatch;
                    console.log(`[UpdateFileToolHandler] Block anchor match found for ${filePath}`);
                }
            }
            // 매칭 전략 4: 구조적 공백 무시 매칭
            if (!matchResult) {
                const structuralMatch = this.structuralFallbackMatch(fileContent, replacement.search, 0);
                if (structuralMatch) {
                    matchResult = structuralMatch;
                    console.log(`[UpdateFileToolHandler] Structural match found for ${filePath}`);
                }
            }
            // 매칭 전략 5: 퍼지 매칭 (유사도 기반)
            if (!matchResult) {
                const fuzzyMatch = mutationManager.fuzzyMatch(fileContent, replacement.search, AgentConfig_1.AgentConfig.MIN_FUZZY_MATCH_THRESHOLD);
                if (fuzzyMatch) {
                    matchResult = fuzzyMatch;
                    console.log(`[UpdateFileToolHandler] Fuzzy match found for ${filePath} (threshold: ${AgentConfig_1.AgentConfig.MIN_FUZZY_MATCH_THRESHOLD})`);
                }
            }
            // 매칭 성공 시 적용 목록에 추가
            if (matchResult) {
                replacementsToApply.push({
                    start: matchResult[0],
                    end: matchResult[1],
                    replace: replacement.replace,
                });
            }
            else {
                // --- 실패 시 Fallback 및 사용자 친화적 메시지 ---
                console.warn(`[UpdateFileToolHandler] Search pattern not found in file: ${filePath}`);
                let errorMessage = `❌ **수정 실패: SEARCH 블록을 찾을 수 없습니다** (파일: ${filePath})\n\n`;
                if (analysis.isViteTemplate && !fileContent.includes('<nav') && !fileContent.includes('Router')) {
                    errorMessage += `**분석 결과:** 에이전트가 예상한 메뉴나 네비게이션 구조가 아직 구현되지 않아 부분 수정(SEARCH/REPLACE)이 불가능합니다.\n\n`;
                }
                else {
                    errorMessage += `에이전트가 제시한 SEARCH 블록의 내용이 실제 파일의 내용과 일치하지 않습니다. (공백, 들여쓰기, 줄바꿈 포함)\n\n`;
                }
                errorMessage += `**현재 파일의 실제 내용 (아래 내용을 복사하여 SEARCH 블록에 사용하세요):**\n`;
                errorMessage += `\`\`\`\n${fileContent}\n\`\`\`\n`;
                return {
                    success: false,
                    message: errorMessage,
                    error: {
                        code: "PATTERN_NOT_FOUND",
                        message: "Search block not found.",
                    },
                };
            }
        }
        // 겹치는 영역이 있는지 확인 및 시작 위치 기준 정렬
        replacementsToApply.sort((a, b) => a.start - b.start);
        // 겹침 검사
        for (let i = 0; i < replacementsToApply.length - 1; i++) {
            if (replacementsToApply[i].end > replacementsToApply[i + 1].start) {
                return {
                    success: false,
                    message: `수정하려는 영역들이 서로 겹칩니다 (${filePath}). 수정을 더 작은 단위로 나누거나 순차적으로 진행하세요.`,
                    error: {
                        code: "OVERLAPPING_REPLACEMENTS",
                        message: "Replacements overlap.",
                    },
                };
            }
        }
        // 정렬된 순서대로 한꺼번에 적용하여 새로운 컨텐츠 생성
        let newContent = "";
        let lastEnd = 0;
        for (const r of replacementsToApply) {
            newContent += fileContent.substring(lastEnd, r.start);
            newContent += r.replace;
            lastEnd = r.end;
        }
        newContent += fileContent.substring(lastEnd);
        // InlineDiffManager를 통해 diff 표시
        const { InlineDiffManager } = await import('../../managers/diff/InlineDiffManager');
        const inlineDiffManager = InlineDiffManager.getInstance();
        // diff 표시
        await inlineDiffManager.showInlineDiff(absolutePath, fileContent, newContent);
        return {
            success: true,
            message: `File ${filePath} ready for review in diff editor. Please approve or reject the changes.`,
            data: { filePath, changes: replacements.length, pending: true },
            filePath: filePath,
            fileContent: newContent,
        };
    }
    parseDiff(diff) {
        const replacements = [];
        const lines = diff.split("\n");
        let currentSearch = "";
        let currentReplace = "";
        let inSearch = false;
        let inReplace = false;
        for (const line of lines) {
            const trimmedLine = line.trim();
            // SEARCH 시작 마커 (유연하게 매칭)
            if (trimmedLine.match(/^([-=]{3,}|<{4,})\s*SEARCH\s*/i)) {
                inSearch = true;
                inReplace = false;
                currentSearch = "";
                continue;
            }
            // 구분자 마커 (======= 등)
            if (inSearch && trimmedLine.match(/^([=]{3,})$/)) {
                inSearch = false;
                inReplace = true;
                currentReplace = "";
                continue;
            }
            // REPLACE 종료 마커 (>>>>>>> REPLACE 등)
            if (inReplace && trimmedLine.match(/^([+]{3,}|>{4,})\s*REPLACE\s*/i)) {
                replacements.push({
                    search: currentSearch.trimEnd(),
                    replace: currentReplace.trimEnd(),
                });
                inReplace = false;
                continue;
            }
            if (inSearch) {
                currentSearch += line + "\n";
            }
            else if (inReplace) {
                currentReplace += line + "\n";
            }
        }
        return replacements;
    }
    /**
     * 각 줄을 trim()한 후 비교하여 leading/trailing whitespace 차이를 허용
     */
    lineTrimmedFallbackMatch(originalContent, searchContent, startIndex) {
        const originalLines = originalContent.split("\n");
        const searchLines = searchContent.split("\n");
        // 마지막 빈 줄 제거 (trailing \n 처리)
        if (searchLines[searchLines.length - 1] === "") {
            searchLines.pop();
        }
        // startIndex가 어느 줄에 있는지 찾기
        let startLineNum = 0;
        let currentIndex = 0;
        while (currentIndex < startIndex && startLineNum < originalLines.length) {
            currentIndex += originalLines[startLineNum].length + 1; // +1 for \n
            startLineNum++;
        }
        // 각 가능한 시작 위치에서 매칭 시도
        for (let i = startLineNum; i <= originalLines.length - searchLines.length; i++) {
            let matches = true;
            // 모든 검색 줄을 이 위치에서 매칭 시도
            for (let j = 0; j < searchLines.length; j++) {
                const originalTrimmed = originalLines[i + j].trim();
                const searchTrimmed = searchLines[j].trim();
                if (originalTrimmed !== searchTrimmed) {
                    matches = false;
                    break;
                }
            }
            if (matches) {
                // 정확한 문자 위치 계산
                let matchStartIndex = 0;
                for (let k = 0; k < i; k++) {
                    matchStartIndex += originalLines[k].length + 1; // +1 for \n
                }
                let matchEndIndex = matchStartIndex;
                for (let k = 0; k < searchLines.length; k++) {
                    matchEndIndex += originalLines[i + k].length + 1; // +1 for \n
                }
                return [matchStartIndex, matchEndIndex];
            }
        }
        return false;
    }
    /**
     * 3줄 이상 블록의 경우 첫 줄과 마지막 줄을 앵커로 사용하여 매칭
     */
    blockAnchorFallbackMatch(originalContent, searchContent, startIndex) {
        const originalLines = originalContent.split("\n");
        const searchLines = searchContent.split("\n");
        // 최소 3줄 이상일 때만 앵커 매칭 적용
        if (searchLines.length < 3) {
            return false;
        }
        // 마지막 빈 줄 제거
        if (searchLines[searchLines.length - 1].trim() === "") {
            searchLines.pop();
        }
        const firstLineSearch = searchLines[0].trim();
        const lastLineSearch = searchLines[searchLines.length - 1].trim();
        const searchBlockSize = searchLines.length;
        for (let i = 0; i <= originalLines.length - searchBlockSize; i++) {
            // 첫 줄과 마지막 줄이 trim() 기준으로 일치하는지 확인
            if (originalLines[i].trim() === firstLineSearch &&
                originalLines[i + searchBlockSize - 1].trim() === lastLineSearch) {
                // 매칭된 시작 인덱스와 끝 인덱스 계산
                let matchStartIndex = 0;
                for (let k = 0; k < i; k++) {
                    matchStartIndex += originalLines[k].length + 1;
                }
                let matchEndIndex = matchStartIndex;
                for (let k = 0; k < searchBlockSize; k++) {
                    matchEndIndex += originalLines[i + k].length + 1;
                }
                // 끝에 붙은 \n 보정 (파일 끝이 아닌 경우)
                if (matchEndIndex > originalContent.length) {
                    matchEndIndex = originalContent.length;
                }
                return [matchStartIndex, matchEndIndex];
            }
        }
        return false;
    }
    /**
     * 공백과 뉴라인의 차이를 무시하고 구조적으로 일치하는 영역을 찾습니다.
     * (연속된 공백/탭/개행을 하나로 압축하여 비교)
     */
    structuralFallbackMatch(originalContent, searchContent, startIndex) {
        // 모든 공백과 뉴라인을 하나로 압축하는 정규식
        const normalizePattern = /\s+/g;
        const normalizedSearch = searchContent
            .replace(normalizePattern, " ")
            .trim();
        // 너무 짧은 패턴은 오탐 위험이 있으므로 제외
        if (normalizedSearch.length < 10) {
            return false;
        }
        const originalSuffix = originalContent.substring(startIndex);
        // 원본 텍스트에서도 공백을 압축하여 위치를 찾음
        // (주의: 정규식 특수문자 이스케이프 필요)
        const escapedSearch = normalizedSearch
            .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
            .replace(/ /g, "\\s+");
        try {
            const pattern = new RegExp(escapedSearch, "m");
            const match = pattern.exec(originalSuffix);
            if (match) {
                const matchStartIndex = startIndex + match.index;
                const matchEndIndex = matchStartIndex + match[0].length;
                return [matchStartIndex, matchEndIndex];
            }
        }
        catch (e) {
            console.error("[UpdateFileToolHandler] Structural matching regex failed:", e);
        }
        return false;
    }
    getDescription(toolUse) {
        return `[update_file for '${toolUse.params.path}']`;
    }
}
exports.UpdateFileToolHandler = UpdateFileToolHandler;
//# sourceMappingURL=UpdateFileToolHandler.js.map