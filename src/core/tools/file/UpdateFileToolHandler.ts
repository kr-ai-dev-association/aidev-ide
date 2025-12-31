/**
 * Update File Tool Handler
 * 파일 수정 툴 핸들러 (부분 수정 지원)
 */

import { IToolHandler, ToolExecutionContext } from "../IToolHandler";
import { ToolUse, ToolResponse, Tool } from "../types";
import {
  fixModelHtmlEscaping,
  removeCDataSections,
} from "../../../utils/string";
import * as fs from "fs/promises";
import * as path from "path";

export class UpdateFileToolHandler implements IToolHandler {
  readonly name = Tool.UPDATE_FILE;

  async execute(
    toolUse: ToolUse,
    context: ToolExecutionContext,
  ): Promise<ToolResponse> {
    const filePath = toolUse.params.path;
    const diff = toolUse.params.diff;

    if (!filePath || !diff) {
      return {
        success: false,
        message: "Path and diff parameters are required",
        error: { code: "MISSING_PARAM", message: "path and diff are required" },
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
    } catch (error) {
      return {
        success: false,
        message: `File not found: ${filePath}`,
        error: {
          code: "FILE_NOT_FOUND",
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }

    // 각 REPLACE 블록의 매칭 위치를 찾아서 저장
    const replacementsToApply: Array<{
      start: number;
      end: number;
      replace: string;
    }> = [];

    for (const replacement of replacements) {
      let matchResult: [number, number] | false = false;

      // 매칭 전략 1: 정확한 매칭 시도
      const exactIndex = fileContent.indexOf(replacement.search);
      if (exactIndex !== -1) {
        matchResult = [exactIndex, exactIndex + replacement.search.length];
        console.log(
          `[UpdateFileToolHandler] Exact match found for ${filePath}`,
        );
      }

      // 매칭 전략 2: Line-trimmed 매칭 (정확한 매칭 실패 시)
      if (!matchResult) {
        const lineMatch = this.lineTrimmedFallbackMatch(
          fileContent,
          replacement.search,
          0,
        );
        if (lineMatch) {
          matchResult = lineMatch;
          console.log(
            `[UpdateFileToolHandler] Line-trimmed match found for ${filePath}`,
          );
        }
      }

      // 매칭 전략 3: Block anchor 매칭 (여전히 실패 시)
      if (!matchResult) {
        const blockMatch = this.blockAnchorFallbackMatch(
          fileContent,
          replacement.search,
          0,
        );
        if (blockMatch) {
          matchResult = blockMatch;
          console.log(
            `[UpdateFileToolHandler] Block anchor match found for ${filePath}`,
          );
        }
      }

      // 매칭 전략 4: 구조적 공백 무시 매칭 (가장 강력한 폴백)
      if (!matchResult) {
        const structuralMatch = this.structuralFallbackMatch(
          fileContent,
          replacement.search,
          0,
        );
        if (structuralMatch) {
          matchResult = structuralMatch;
          console.log(
            `[UpdateFileToolHandler] Structural match found for ${filePath}`,
          );
        }
      }

      // 매칭 성공 시 적용 목록에 추가
      if (matchResult) {
        replacementsToApply.push({
          start: matchResult[0],
          end: matchResult[1],
          replace: replacement.replace,
        });
      } else {
        console.warn(
          `[UpdateFileToolHandler] Search pattern not found in file: ${filePath}`,
        );
        console.log(
          `[UpdateFileToolHandler] Failed SEARCH block (lines: ${replacement.search.split("\n").length}):\n[START]\n${replacement.search}\n[END]`,
        );

        let errorMessage = `파일(${filePath})에서 SEARCH 블록의 내용을 찾을 수 없습니다.\n\n`;
        errorMessage += `**현재 파일의 실제 내용:**\n`;
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

    // 파일 쓰기
    await fs.writeFile(absolutePath, newContent, "utf8");

    return {
      success: true,
      message: `File ${filePath} updated successfully`,
      data: { filePath, changes: replacements.length },
      filePath: filePath,
      fileContent: newContent,
    };
  }

  private parseDiff(diff: string): Array<{ search: string; replace: string }> {
    const replacements: Array<{ search: string; replace: string }> = [];
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
      } else if (inReplace) {
        currentReplace += line + "\n";
      }
    }

    return replacements;
  }

  /**
   * 각 줄을 trim()한 후 비교하여 leading/trailing whitespace 차이를 허용
   */
  private lineTrimmedFallbackMatch(
    originalContent: string,
    searchContent: string,
    startIndex: number,
  ): [number, number] | false {
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
    for (
      let i = startLineNum;
      i <= originalLines.length - searchLines.length;
      i++
    ) {
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
  private blockAnchorFallbackMatch(
    originalContent: string,
    searchContent: string,
    startIndex: number,
  ): [number, number] | false {
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
      if (
        originalLines[i].trim() === firstLineSearch &&
        originalLines[i + searchBlockSize - 1].trim() === lastLineSearch
      ) {
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
  private structuralFallbackMatch(
    originalContent: string,
    searchContent: string,
    startIndex: number,
  ): [number, number] | false {
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
    } catch (e) {
      console.error(
        "[UpdateFileToolHandler] Structural matching regex failed:",
        e,
      );
    }

    return false;
  }

  getDescription(toolUse: ToolUse): string {
    return `[update_file for '${toolUse.params.path}']`;
  }
}
