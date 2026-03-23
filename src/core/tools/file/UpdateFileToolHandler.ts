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
import { FileMutationManager, PatchStrategy } from "../../managers/file/FileMutationManager";
import * as fs from "fs/promises";
import * as path from "path";
import { z } from "zod";

const UpdateFileParamsSchema = z.object({
  path: z.string().min(1),
  diff: z.string().optional(),
  content: z.string().optional(),
});

export class UpdateFileToolHandler implements IToolHandler {
  readonly name = Tool.UPDATE_FILE;

  async execute(
    toolUse: ToolUse,
    context: ToolExecutionContext,
  ): Promise<ToolResponse> {
    const parseResult = UpdateFileParamsSchema.safeParse(toolUse.params);
    if (!parseResult.success) {
      const msg = parseResult.error.errors[0]?.message ?? 'Invalid params';
      return { success: false, message: msg, error: { code: 'INVALID_PARAMS', message: msg } };
    }
    const filePath = parseResult.data.path;
    let diff = parseResult.data.diff;

    // LLM이 diff 대신 content를 보낸 경우 처리
    if (!diff && parseResult.data.content) {
      const content = parseResult.data.content;
      // content에 SEARCH/REPLACE 마커가 있으면 diff로 재처리
      if (/^<{4,}\s*SEARCH/m.test(content) || /^-{3,}\s*SEARCH/m.test(content)) {
        console.log(`[UpdateFileToolHandler] ⚠️ LLM sent SEARCH/REPLACE diff in 'content' param. Re-routing as diff for ${filePath}`);
        diff = content;
      } else {
        console.log(`[UpdateFileToolHandler] ⚠️ LLM sent 'content' instead of 'diff'. Using create_file fallback for ${filePath}`);
        const { CreateFileToolHandler } = await import('./CreateFileToolHandler');
        const createHandler = new CreateFileToolHandler();
        return createHandler.execute({
          ...toolUse,
          name: Tool.CREATE_FILE,
          params: {
            path: filePath,
            content: content
          }
        }, context);
      }
    }

    if (!filePath || !diff) {
      return {
        success: false,
        message: "Path and diff parameters are required. Use 'diff' parameter with SEARCH/REPLACE blocks, not 'content'.",
        error: { code: "MISSING_PARAM", message: "path and diff are required. If you want to replace entire file, use 'content' parameter instead." },
      };
    }

    const mutationManager = FileMutationManager.getInstance();

    // HTML 엔티티 처리 (AI 모델이 잘못 이스케이프한 경우 수정)
    let cleanedDiff = fixModelHtmlEscaping(diff);
    // CDATA 섹션 제거 (LLM이 JSON 등을 CDATA로 감싸는 경우 처리)
    cleanedDiff = removeCDataSections(cleanedDiff);

    // SEARCH/REPLACE 블록 파싱
    console.log(`[UpdateFileToolHandler] Raw diff (first 500 chars): ${cleanedDiff.substring(0, 500)}`);
    const replacements = this.parseDiff(cleanedDiff);
    console.log(`[UpdateFileToolHandler] Parsed ${replacements.length} replacement(s)`);
    replacements.forEach((r, i) => {
      console.log(`[UpdateFileToolHandler] Replacement ${i}: search="${r.search.substring(0, 50)}...", replace="${r.replace.substring(0, 50)}..."`);
    });
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

    // ✅ Shadow content가 있으면 SEARCH 기준으로 shadow 사용
    // LLM은 shadow(누적된 수정 상태)를 보고 search pattern을 생성하므로
    // SEARCH도 shadow 기준이어야 함 (껐다 켰을 때 pending change 불일치 방지)
    try {
      const diffModule = await import('../../managers/diff/InlineDiffManager');
      const inlineDiffManager = diffModule.InlineDiffManager.getInstance();
      const shadowContent = inlineDiffManager.getCurrentDocumentContent(absolutePath);
      if (shadowContent !== undefined) {
        fileContent = shadowContent;
        console.log(`[UpdateFileToolHandler] Using shadow content for SEARCH (pending changes included): ${filePath}`);
      }
    } catch { /* shadow 없으면 disk content 사용 */ }

    // --- 사전 파일 검사 (Preflight Inspection) ---
    const analysis = mutationManager.analyzeFile(fileContent);

    // ✅ 핵심: SEARCH/REPLACE diff가 있으면 무조건 SEARCH_REPLACE 전략 사용
    // ❌ 절대 금지: SEARCH/REPLACE diff + STRUCTURAL_REWRITE 혼용
    // STRUCTURAL_REWRITE는 전체 파일 재작성 전략이므로 SEARCH/REPLACE와 모순됨
    let strategy = mutationManager.chooseStrategy(analysis, replacements[0].search);

    // SEARCH/REPLACE 블록이 있으면 무조건 SEARCH_REPLACE 전략 사용
    if (replacements.length > 0) {
      strategy = PatchStrategy.SEARCH_REPLACE;
      console.log(`[UpdateFileToolHandler] Using SEARCH_REPLACE strategy (SEARCH/REPLACE diff detected) for ${filePath}`);
    } else if (strategy === PatchStrategy.STRUCTURAL_REWRITE) {
      console.log(`[UpdateFileToolHandler] Strategy switched to STRUCTURAL_REWRITE for ${filePath}`);
      // STRUCTURAL_REWRITE는 전체 파일 재작성이므로 별도 처리 필요
      // 하지만 지금은 SEARCH/REPLACE만 처리하므로 여기서는 발생하지 않음
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

      // 매칭 전략 4: 구조적 공백 무시 매칭
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
        // --- 실패 시 Fallback ---
        console.warn(
          `[UpdateFileToolHandler] Search pattern not found in file: ${filePath}`,
        );

        // SEARCH 매칭 실패 → 에러 반환 (파일 내용 포함하여 LLM이 재시도 가능)
        // ⚠️ 전체 덮어쓰기 Fallback 제거: REPLACE 블록만으로 파일 전체를 대체하면 나머지 코드가 소실됨
        {
          // UI 표시용 짧은 메시지
          const uiMessage = `❌ **수정 실패: SEARCH 블록을 찾을 수 없습니다** (파일: ${filePath})`;

          // LLM 전달용 상세 메시지 (파일 내용 포함하여 재시도 가능)
          let llmMessage = `SEARCH 블록을 찾을 수 없습니다 (파일: ${filePath})\n\n`;

          if (analysis.isViteTemplate && !fileContent.includes('<nav') && !fileContent.includes('Router')) {
            llmMessage += `분석 결과: 에이전트가 예상한 메뉴나 네비게이션 구조가 아직 구현되지 않아 부분 수정(SEARCH/REPLACE)이 불가능합니다.\n\n`;
          } else {
            llmMessage += `SEARCH 블록이 파일 내용과 일치하지 않습니다. read_file로 현재 내용을 읽고 정확히 복사하세요. (공백, 들여쓰기, 줄바꿈 포함)\n\n`;
          }

          // 파일이 짧으면 전체 내용, 길면 앞부분만 제공
          const maxPreviewLength = 3000;
          const preview = fileContent.length > maxPreviewLength
            ? fileContent.substring(0, maxPreviewLength) + `\n... (${fileContent.length - maxPreviewLength}자 생략)`
            : fileContent;
          llmMessage += `현재 파일의 실제 내용 (아래 내용을 복사하여 SEARCH 블록에 사용하세요):\n`;
          llmMessage += `\`\`\`\n${preview}\n\`\`\`\n`;
          llmMessage += `\n파일을 완전히 교체하려면 update_file 대신 create_file을 사용하세요.`;

          return {
            success: false,
            message: uiMessage,
            error: {
              code: "PATTERN_NOT_FOUND",
              message: llmMessage,
            },
          };
        }
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
    const diffModule = await import('../../managers/diff/InlineDiffManager');
    const inlineDiffManager = diffModule.InlineDiffManager.getInstance();

    // ✅ 핵심 수정: 현재 문서의 실제 내용을 가져오기 (pending changes 제외)
    // fileContent는 디스크에서 읽은 내용이지만, 실제 문서에는 이미 pending changes가 적용되어 있을 수 있음
    // getCurrentDocumentContent()는 pending changes를 제외한 "stable content"를 반환하므로 이를 사용
    let currentDocumentContent: string;
    try {
      const currentContent = inlineDiffManager.getCurrentDocumentContent(absolutePath);
      if (currentContent !== undefined) {
        currentDocumentContent = currentContent;
        console.log(`[UpdateFileToolHandler] Using current document content (pending changes excluded) for ${filePath}`);
      } else {
        // Fallback: VS Code editor에서 직접 가져오기
        const vscode = await import('vscode');
        const uri = vscode.Uri.file(absolutePath);
        try {
          const document = await vscode.workspace.openTextDocument(uri);
          currentDocumentContent = document.getText();
          console.log(`[UpdateFileToolHandler] Using document.getText() as fallback for ${filePath}`);
        } catch {
          // 최종 Fallback: 디스크에서 읽은 내용 사용
          currentDocumentContent = fileContent;
          console.log(`[UpdateFileToolHandler] Using fileContent from disk as final fallback for ${filePath}`);
        }
      }
    } catch (error) {
      console.warn(`[UpdateFileToolHandler] Could not get current document content, using fileContent: ${error}`);
      currentDocumentContent = fileContent;
    }

    // diff 표시 (현재 문서 상태를 기준으로)
    await inlineDiffManager.showInlineDiff(absolutePath, currentDocumentContent, newContent, context.conversationTurnId);

    return {
      success: true,
      message: `File ${filePath} ready for review in diff editor. Please approve or reject the changes.`,
      data: { filePath, changes: replacements.length, pending: true },
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
    let hadSeparator = false; // ======= 구분자가 있었는지 추적

    for (const line of lines) {
      const trimmedLine = line.trim();

      // SEARCH 시작 마커 (유연하게 매칭)
      if (trimmedLine.match(/^([-=]{3,}|<{4,})\s*SEARCH\s*/i)) {
        inSearch = true;
        inReplace = false;
        hadSeparator = false;
        currentSearch = "";
        continue;
      }

      // 구분자 마커 (======= 등)
      if (inSearch && trimmedLine.match(/^([=]{3,})$/)) {
        inSearch = false;
        inReplace = true;
        hadSeparator = true;
        currentReplace = "";
        continue;
      }

      // REPLACE 종료 마커 (>>>>>>> REPLACE 등)
      // 🔥 핵심 수정: ======= 구분자 없이 바로 >>>>>>> REPLACE가 나온 경우 처리
      if (trimmedLine.match(/^([+]{3,}|>{4,})\s*REPLACE\s*/i)) {
        if (inSearch && !hadSeparator) {
          // ======= 없이 SEARCH에서 바로 REPLACE로 전환된 경우
          // SEARCH 내용을 그대로 유지하고 REPLACE 수집 시작
          console.log('[UpdateFileToolHandler] Warning: Missing ======= separator, treating content after >>>>>>> REPLACE as replacement');
          inSearch = false;
          inReplace = true;
          currentReplace = "";
          continue;
        } else if (inReplace) {
          // 정상 케이스: REPLACE 블록 완료
          replacements.push({
            search: currentSearch.trimEnd(),
            replace: currentReplace.trimEnd(),
          });
          inReplace = false;
          hadSeparator = false;
          // 🔥 중복 push 방지: 블록 완료 후 상태 초기화
          currentSearch = "";
          currentReplace = "";
          continue;
        }
      }

      if (inSearch) {
        currentSearch += line + "\n";
      } else if (inReplace) {
        currentReplace += line + "\n";
      }
    }

    // 🔥 마지막 블록 처리: REPLACE 마커 없이 끝난 경우 (>>>>>>> REPLACE 이후 내용)
    if (currentSearch && currentReplace) {
      replacements.push({
        search: currentSearch.trimEnd(),
        replace: currentReplace.trimEnd(),
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

    // 중간 줄 유사도 검증용 (첫 줄/마지막 줄 제외)
    const middleSearchLines = searchLines.slice(1, -1).map(l => l.trim());
    const MIDDLE_SIMILARITY_THRESHOLD = 0.6;

    let bestMatch: [number, number] | false = false;
    let bestSimilarity = -1;

    for (let i = 0; i <= originalLines.length - searchBlockSize; i++) {
      // 첫 줄과 마지막 줄이 trim() 기준으로 일치하는지 확인
      if (
        originalLines[i].trim() !== firstLineSearch ||
        originalLines[i + searchBlockSize - 1].trim() !== lastLineSearch
      ) {
        continue;
      }

      // 중간 줄 유사도 검사 (false positive 방지)
      if (middleSearchLines.length > 0) {
        const middleOriginalLines = originalLines
          .slice(i + 1, i + searchBlockSize - 1)
          .map(l => l.trim());

        let matchCount = 0;
        const compareLen = Math.min(middleSearchLines.length, middleOriginalLines.length);
        for (let k = 0; k < compareLen; k++) {
          if (middleSearchLines[k] === middleOriginalLines[k]) matchCount++;
        }
        const similarity = compareLen > 0 ? matchCount / compareLen : 1.0;

        if (similarity < MIDDLE_SIMILARITY_THRESHOLD) continue;

        // 가장 유사도 높은 매칭 선택
        if (similarity <= bestSimilarity) continue;
        bestSimilarity = similarity;
      }

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

      bestMatch = [matchStartIndex, matchEndIndex];

      // 완벽 매칭이면 즉시 반환
      if (bestSimilarity === 1.0) return bestMatch;
    }

    return bestMatch;
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
