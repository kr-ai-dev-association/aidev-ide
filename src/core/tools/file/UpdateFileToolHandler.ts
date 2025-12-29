/**
 * Update File Tool Handler
 * 파일 수정 툴 핸들러 (부분 수정 지원)
 */

import { IToolHandler, ToolExecutionContext } from '../IToolHandler';
import { ToolUse, ToolResponse, Tool } from '../types';
import { fixModelHtmlEscaping, removeCDataSections } from '../../../utils/string';
import * as fs from 'fs/promises';
import * as path from 'path';

export class UpdateFileToolHandler implements IToolHandler {
    readonly name = Tool.UPDATE_FILE;

    async execute(toolUse: ToolUse, context: ToolExecutionContext): Promise<ToolResponse> {
        const filePath = toolUse.params.path;
        const diff = toolUse.params.diff;

        if (!filePath || !diff) {
            return {
                success: false,
                message: 'Path and diff parameters are required',
                error: { code: 'MISSING_PARAM', message: 'path and diff are required' }
            };
        }

        // HTML 엔티티 처리 (AI 모델이 잘못 이스케이프한 경우 수정)
        let cleanedDiff = fixModelHtmlEscaping(diff);
        // CDATA 섹션 제거 (LLM이 JSON 등을 CDATA로 감싸는 경우 처리)
        cleanedDiff = removeCDataSections(cleanedDiff);

        // SEARCH/REPLACE 블록 파싱
        const replacements = this.parseDiff(cleanedDiff);
        if (replacements.length === 0) {
            return {
                success: false,
                message: 'No valid SEARCH/REPLACE blocks found in diff',
                error: { code: 'INVALID_DIFF', message: 'Diff must contain SEARCH/REPLACE blocks' }
            };
        }

        // 파일 읽기
        const absolutePath = path.isAbsolute(filePath)
            ? filePath
            : path.join(context.projectRoot, filePath);

        let fileContent = '';
        try {
            fileContent = await fs.readFile(absolutePath, 'utf8');
        } catch (error) {
            return {
                success: false,
                message: `File not found: ${filePath}`,
                error: {
                    code: 'FILE_NOT_FOUND',
                    message: error instanceof Error ? error.message : String(error)
                }
            };
        }

        // 각 REPLACE 블록 적용
        let newContent = fileContent;
        let lastProcessedIndex = 0;

        for (const replacement of replacements) {
            // 매칭 전략 1: 정확한 매칭 시도
            const exactIndex = newContent.indexOf(replacement.search, lastProcessedIndex);
            if (exactIndex !== -1) {
                newContent = newContent.substring(0, exactIndex) + replacement.replace + newContent.substring(exactIndex + replacement.search.length);
                lastProcessedIndex = exactIndex + replacement.replace.length;
                console.log(`[UpdateFileToolHandler] Exact match found for ${filePath}`);
                continue;
            }

            // 매칭 전략 2: Line-trimmed 매칭 
            const lineMatch = this.lineTrimmedFallbackMatch(newContent, replacement.search, lastProcessedIndex);
            if (lineMatch) {
                const [matchStartIndex, matchEndIndex] = lineMatch;
                newContent = newContent.substring(0, matchStartIndex) + replacement.replace + newContent.substring(matchEndIndex);
                lastProcessedIndex = matchStartIndex + replacement.replace.length;
                console.log(`[UpdateFileToolHandler] Line-trimmed match found for ${filePath}`);
                continue;
            }

            // 매칭 전략 3: Block anchor 매칭 
            const blockMatch = this.blockAnchorFallbackMatch(newContent, replacement.search, lastProcessedIndex);
            if (blockMatch) {
                const [matchStartIndex, matchEndIndex] = blockMatch;
                newContent = newContent.substring(0, matchStartIndex) + replacement.replace + newContent.substring(matchEndIndex);
                lastProcessedIndex = matchStartIndex + replacement.replace.length;
                console.log(`[UpdateFileToolHandler] Block anchor match found for ${filePath}`);
                continue;
            }

            // 모든 매칭 전략 실패 - 에러 반환
            console.warn(`[UpdateFileToolHandler] Search pattern not found in file: ${filePath}`);
            console.warn(`[UpdateFileToolHandler] Search pattern (first 200 chars): ${replacement.search.substring(0, 200)}`);
            console.warn(`[UpdateFileToolHandler] File content preview (first 500 chars): ${newContent.substring(0, 500)}`);

            let errorMessage = `This is likely because the SEARCH block content doesn't match exactly with what's in the file, or if you used multiple SEARCH/REPLACE blocks they may not have been in the order they appear in the file. (Please also ensure that when using the update_file tool, Do NOT add extra characters to the markers (e.g., ------- SEARCH> is INVALID). Do NOT forget to use the closing ------- REPLACE marker. Do NOT modify the marker format in any way. Malformed XML will cause complete tool failure and break the entire editing process.)\n\n`;
            errorMessage += `The file was reverted to its original state:\n\n`;
            errorMessage += `<file_content path="${filePath}">\n${fileContent}\n</file_content>\n\n`;
            errorMessage += `Now that you have the latest state of the file, try the operation again with fewer, more precise SEARCH blocks. For large files especially, it may be prudent to try to limit yourself to <5 SEARCH/REPLACE blocks at a time, then wait for the user to respond with the result of the operation before following up with another update_file call to make additional edits.\n(If you run into this error 3 times in a row, you may use the create_file tool as a fallback.)`;

            return {
                success: false,
                message: errorMessage,
                error: {
                    code: 'PATTERN_NOT_FOUND',
                    message: 'Search block not found. All matching strategies failed.'
                },
                data: {
                    filePath: filePath,
                    originalContent: fileContent // 최신 파일 내용 포함
                }
            };
        }

        // 파일 쓰기
        await fs.writeFile(absolutePath, newContent, 'utf8');

        return {
            success: true,
            message: `File ${filePath} updated successfully`,
            data: { filePath, changes: replacements.length },
            filePath: filePath,
            fileContent: newContent
        };
    }

    private parseDiff(diff: string): Array<{ search: string; replace: string }> {
        const replacements: Array<{ search: string; replace: string }> = [];

        // SEARCH/REPLACE 블록 파싱
        // 형식: ------- SEARCH\n[content]\n=======\n[new content]\n------- REPLACE
        const blockPattern = /-------\s*SEARCH\s*\n([\s\S]*?)\n=======\s*\n([\s\S]*?)\n-------\s*REPLACE/g;
        let match;

        while ((match = blockPattern.exec(diff)) !== null) {
            replacements.push({
                search: match[1].trim(),
                replace: match[2].trim()
            });
        }

        return replacements;
    }

    /**
     * 각 줄을 trim()한 후 비교하여 leading/trailing whitespace 차이를 허용
     */
    private lineTrimmedFallbackMatch(
        originalContent: string,
        searchContent: string,
        startIndex: number
    ): [number, number] | false {
        const originalLines = originalContent.split('\n');
        const searchLines = searchContent.split('\n');

        // 마지막 빈 줄 제거 (trailing \n 처리)
        if (searchLines[searchLines.length - 1] === '') {
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
     * 3줄 이상 블록의 경우 첫 줄과 마지막 줄을 앵커로 사용
     */
    private blockAnchorFallbackMatch(
        originalContent: string,
        searchContent: string,
        startIndex: number
    ): [number, number] | false {
        const originalLines = originalContent.split('\n');
        const searchLines = searchContent.split('\n');

        // 3줄 미만이면 이 방법 사용 안 함
        if (searchLines.length < 3) {
            return false;
        }

        // 마지막 빈 줄 제거
        if (searchLines[searchLines.length - 1] === '') {
            searchLines.pop();
        }

        const firstLineSearch = searchLines[0].trim();
        const lastLineSearch = searchLines[searchLines.length - 1].trim();
        const searchBlockSize = searchLines.length;

        // startIndex가 어느 줄에 있는지 찾기
        let startLineNum = 0;
        let currentIndex = 0;
        while (currentIndex < startIndex && startLineNum < originalLines.length) {
            currentIndex += originalLines[startLineNum].length + 1;
            startLineNum++;
        }

        // 첫 줄과 마지막 줄이 일치하는 위치 찾기
        for (let i = startLineNum; i <= originalLines.length - searchBlockSize; i++) {
            // 첫 줄이 일치하는지 확인
            if (originalLines[i].trim() !== firstLineSearch) {
                continue;
            }

            // 마지막 줄이 예상 위치에서 일치하는지 확인
            if (originalLines[i + searchBlockSize - 1].trim() !== lastLineSearch) {
                continue;
            }

            // 정확한 문자 위치 계산
            let matchStartIndex = 0;
            for (let k = 0; k < i; k++) {
                matchStartIndex += originalLines[k].length + 1;
            }

            let matchEndIndex = matchStartIndex;
            for (let k = 0; k < searchBlockSize; k++) {
                matchEndIndex += originalLines[i + k].length + 1;
            }

            return [matchStartIndex, matchEndIndex];
        }

        return false;
    }

    getDescription(toolUse: ToolUse): string {
        return `[update_file for '${toolUse.params.path}']`;
    }
}


