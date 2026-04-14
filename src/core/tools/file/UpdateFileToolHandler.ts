/**
 * Update File Tool Handler
 * File modification tool handler (supports partial edits)
 */

import { IToolHandler, ToolExecutionContext } from "../IToolHandler";
import { ToolUse, ToolResponse, Tool } from "../types";
import {
  fixModelHtmlEscaping,
  removeCDataSections,
} from "../../../utils/string";
import {
  FileMutationManager,
  PatchStrategy,
} from "../../managers/file/FileMutationManager";
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
  /** Track failed SEARCH patterns per file (for detecting repeated pattern failures) */
  private _failedSearchPatterns: Map<
    string,
    { pattern: string; count: number }[]
  > = new Map();

  async execute(
    toolUse: ToolUse,
    context: ToolExecutionContext,
  ): Promise<ToolResponse> {
    const parseResult = UpdateFileParamsSchema.safeParse(toolUse.params);
    if (!parseResult.success) {
      const msg = parseResult.error.errors[0]?.message ?? "Invalid params";
      return {
        success: false,
        message: msg,
        error: { code: "INVALID_PARAMS", message: msg },
      };
    }
    const filePath = parseResult.data.path;
    let diff = parseResult.data.diff;

    // B-3: Pre-execution validation
    if (!filePath || filePath.trim().length === 0) {
      return {
        success: false,
        message: "Path parameter is empty",
        error: {
          code: "EMPTY_PARAM",
          message: "path parameter must not be empty",
        },
      };
    }
    if (diff && diff.trim().length < 10) {
      return {
        success: false,
        message:
          "Diff parameter is too short (< 10 chars). Provide a valid SEARCH/REPLACE block.",
        error: {
          code: "INVALID_DIFF",
          message: "diff is too short to contain a valid SEARCH/REPLACE block",
        },
      };
    }

    // Handle case where LLM sent content instead of diff
    if (!diff && parseResult.data.content) {
      const content = parseResult.data.content;
      // If content contains SEARCH/REPLACE markers, re-route as diff
      if (
        /^<{4,}\s*SEARCH/m.test(content) ||
        /^-{3,}\s*SEARCH/m.test(content)
      ) {
        console.log(
          `[UpdateFileToolHandler] LLM sent SEARCH/REPLACE diff in 'content' param. Re-routing as diff for ${filePath}`,
        );
        diff = content;
      } else {
        console.log(
          `[UpdateFileToolHandler] LLM sent 'content' instead of 'diff'. Using create_file fallback for ${filePath}`,
        );
        const { CreateFileToolHandler } =
          await import("./CreateFileToolHandler");
        const createHandler = new CreateFileToolHandler();
        return createHandler.execute(
          {
            ...toolUse,
            name: Tool.CREATE_FILE,
            params: {
              path: filePath,
              content: content,
            },
          },
          context,
        );
      }
    }

    if (!filePath || !diff) {
      return {
        success: false,
        message:
          "Path and diff parameters are required. Use 'diff' parameter with SEARCH/REPLACE blocks, not 'content'.",
        error: {
          code: "MISSING_PARAM",
          message:
            "path and diff are required. If you want to replace entire file, use 'content' parameter instead.",
        },
      };
    }

    const mutationManager = FileMutationManager.getInstance();

    // Handle HTML entities (fix incorrect escaping by AI models)
    let cleanedDiff = fixModelHtmlEscaping(diff);
    // Remove CDATA sections (handle cases where LLM wraps JSON etc. in CDATA)
    cleanedDiff = removeCDataSections(cleanedDiff);

    // Parse SEARCH/REPLACE blocks
    console.log(
      `[UpdateFileToolHandler] Raw diff: (${cleanedDiff.length} chars)`,
    );
    const replacements = this.parseDiff(cleanedDiff);
    console.log(
      `[UpdateFileToolHandler] Parsed ${replacements.length} replacement(s)`,
    );
    replacements.forEach((r, i) => {
      console.log(
        `[UpdateFileToolHandler] Replacement ${i}: search=(${r.search.length} chars), replace=(${r.replace.length} chars)`,
      );
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

    // B-5: No-op edit detection (search === replace)
    for (const replacement of replacements) {
      if (replacement.search === replacement.replace) {
        console.log(
          `[UpdateFileToolHandler] No-op edit detected (search === replace), skipping: ${filePath}`,
        );
        return {
          success: true,
          message: `No changes needed for ${filePath} — search and replace content are identical.`,
          filePath,
        };
      }
    }

    // Ellipsis pattern detection: fail early if LLM uses "... (omitted)", "// ...", etc. in SEARCH blocks
    // These patterns do not match actual file content and cause infinite loops
    const ELLIPSIS_PATTERNS = [
      /^\s*\.\.\.\s*\(생략됨\)\s*$/m, // ... (omitted)
      /^\s*\/\/\s*\.\.\.\s*$/m, // // ...
      /^\s*#\s*\.\.\.\s*$/m, // # ...
      /^\s*\.\.\.\s*$/m, // ... (standalone line)
      /^\s*\/\*\s*\.\.\.\s*\*\/\s*$/m, // /* ... */
      /^\s*<!--\s*\.\.\.\s*-->\s*$/m, // <!-- ... -->
    ];

    for (const replacement of replacements) {
      const hasEllipsis = ELLIPSIS_PATTERNS.some((p) =>
        p.test(replacement.search),
      );
      if (hasEllipsis) {
        console.warn(
          `[UpdateFileToolHandler] Ellipsis pattern detected in SEARCH block for ${filePath}`,
        );
        const llmMsg = `The SEARCH block contains ellipsis expressions ("... (omitted)", "// ...", "..." etc.) (file: ${filePath}).\n\nThe SEARCH block must contain the exact actual code from the file. Ellipsis expressions are strictly forbidden.\n\nUse read_file to check the current file content, and copy the exact code range to be modified into the SEARCH block.`;
        return {
          success: false,
          message: `**Edit failed: Ellipsis expressions are not allowed in SEARCH blocks** (file: ${filePath})`,
          error: { code: "ELLIPSIS_IN_SEARCH", message: llmMsg },
        };
      }
    }

    // Read file
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

    // Use shadow content for SEARCH if available
    // LLM generates search patterns based on shadow (accumulated edit state),
    // so SEARCH must also use shadow as reference (prevents pending change mismatch on toggle)
    try {
      const diffModule = await import("../../managers/diff/InlineDiffManager");
      const inlineDiffManager = diffModule.InlineDiffManager.getInstance();
      const shadowContent =
        inlineDiffManager.getCurrentDocumentContent(absolutePath);
      if (shadowContent !== undefined) {
        fileContent = shadowContent;
        console.log(
          `[UpdateFileToolHandler] Using shadow content for SEARCH (pending changes included): ${filePath}`,
        );
      }
    } catch {
      /* Use disk content if shadow is unavailable */
    }

    // --- Preflight Inspection ---
    const analysis = mutationManager.analyzeFile(fileContent);

    // Core: Always use SEARCH_REPLACE strategy when SEARCH/REPLACE diff is present
    // Never mix: SEARCH/REPLACE diff + STRUCTURAL_REWRITE
    // STRUCTURAL_REWRITE is a full file rewrite strategy, contradicting SEARCH/REPLACE
    let strategy = mutationManager.chooseStrategy(
      analysis,
      replacements[0].search,
    );

    // Always use SEARCH_REPLACE strategy when SEARCH/REPLACE blocks exist
    if (replacements.length > 0) {
      strategy = PatchStrategy.SEARCH_REPLACE;
      console.log(
        `[UpdateFileToolHandler] Using SEARCH_REPLACE strategy (SEARCH/REPLACE diff detected) for ${filePath}`,
      );
    } else if (strategy === PatchStrategy.STRUCTURAL_REWRITE) {
      console.log(
        `[UpdateFileToolHandler] Strategy switched to STRUCTURAL_REWRITE for ${filePath}`,
      );
      // STRUCTURAL_REWRITE requires separate handling for full file rewrite
      // But currently only SEARCH/REPLACE is handled, so this case should not occur
    }

    // Find and store matching positions for each REPLACE block
    const replacementsToApply: Array<{
      start: number;
      end: number;
      replace: string;
    }> = [];

    for (const replacement of replacements) {
      let matchResult: [number, number] | false = false;

      // Match strategy 1: Try exact match
      const exactIndex = fileContent.indexOf(replacement.search);
      if (exactIndex !== -1) {
        matchResult = [exactIndex, exactIndex + replacement.search.length];
        console.log(
          `[UpdateFileToolHandler] Exact match found for ${filePath}`,
        );
      }

      // B-4: Quote normalization fallback for exact match
      if (!matchResult) {
        const normalizedFile = this.normalizeQuotes(fileContent);
        const normalizedSearch = this.normalizeQuotes(replacement.search);
        const normalizedIndex = normalizedFile.indexOf(normalizedSearch);
        if (normalizedIndex !== -1) {
          matchResult = [
            normalizedIndex,
            normalizedIndex + normalizedSearch.length,
          ];
          console.log(
            `[UpdateFileToolHandler] Quote-normalized exact match found for ${filePath}`,
          );
        }
      }

      // Match strategy 2: Line-trimmed match (when exact match fails)
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

      // Match strategy 3: Block anchor match (when still failing)
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

      // Match strategy 4: Structural whitespace-ignoring match
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

      // Add to apply list on successful match
      if (matchResult) {
        replacementsToApply.push({
          start: matchResult[0],
          end: matchResult[1],
          replace: replacement.replace,
        });
      } else {
        // --- Fallback on failure ---
        console.warn(
          `[UpdateFileToolHandler] Search pattern not found in file: ${filePath}`,
        );

        // SEARCH match failed - return error (include file content so LLM can retry)
        // Full overwrite fallback removed: replacing entire file with only REPLACE block would lose remaining code
        {
          // Short message for UI display
          const uiMessage = `**Edit failed: SEARCH block not found** (file: ${filePath})`;

          // Detailed message for LLM (includes file content for retry)
          let llmMessage = `SEARCH block not found (file: ${filePath})\n\n`;

          // Detect repeated failures with same file + same pattern
          const searchKey = replacement.search.substring(0, 80);
          const failedList = this._failedSearchPatterns.get(filePath) || [];
          const existing = failedList.find((f) => f.pattern === searchKey);
          if (existing) {
            existing.count++;
          } else {
            failedList.push({ pattern: searchKey, count: 1 });
          }
          this._failedSearchPatterns.set(filePath, failedList);
          const repeatCount = existing?.count || 1;

          if (repeatCount >= 2) {
            llmMessage += `**Same SEARCH pattern has failed ${repeatCount} times in a row.** This file may have already been modified in a previous turn. The previous SEARCH pattern is no longer valid. You must use read_file to re-read the current file content and write a new SEARCH block based on the actual content.\n\n`;
          } else if (
            analysis.isViteTemplate &&
            !fileContent.includes("<nav") &&
            !fileContent.includes("Router")
          ) {
            llmMessage += `Analysis: The menu or navigation structure expected by the agent has not been implemented yet, making partial modification (SEARCH/REPLACE) impossible.\n\n`;
          } else {
            llmMessage += `SEARCH block does not match the file content. This file may have been modified in a previous turn. Use read_file to re-read the current content and copy it exactly. (including whitespace, indentation, newlines)\n\n`;
          }

          // Provide more content on 2+ repeated failures
          const maxPreviewLength = repeatCount >= 2 ? 8000 : 3000;
          const preview =
            fileContent.length > maxPreviewLength
              ? fileContent.substring(0, maxPreviewLength) +
                `\n... (${fileContent.length - maxPreviewLength} chars omitted)`
              : fileContent;
          llmMessage += `Current actual file content (copy the content below into the SEARCH block):\n`;
          llmMessage += `\`\`\`\n${preview}\n\`\`\`\n`;
          llmMessage += `\nTo completely replace the file, use create_file instead of update_file.`;

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

    // Check for overlapping regions and sort by start position
    replacementsToApply.sort((a, b) => a.start - b.start);

    // Overlap check
    for (let i = 0; i < replacementsToApply.length - 1; i++) {
      if (replacementsToApply[i].end > replacementsToApply[i + 1].start) {
        return {
          success: false,
          message: `The regions to modify overlap each other (${filePath}). Split the modifications into smaller units or apply them sequentially.`,
          error: {
            code: "OVERLAPPING_REPLACEMENTS",
            message: "Replacements overlap.",
          },
        };
      }
    }

    // Apply all replacements in sorted order to generate new content
    let newContent = "";
    let lastEnd = 0;
    for (const r of replacementsToApply) {
      newContent += fileContent.substring(lastEnd, r.start);
      newContent += r.replace;
      lastEnd = r.end;
    }
    newContent += fileContent.substring(lastEnd);

    // Show diff via InlineDiffManager
    const diffModule = await import("../../managers/diff/InlineDiffManager");
    const inlineDiffManager = diffModule.InlineDiffManager.getInstance();

    // Core fix: Get the actual content of the current document (excluding pending changes)
    // fileContent is read from disk, but the actual document may already have pending changes applied
    // getCurrentDocumentContent() returns "stable content" excluding pending changes, so we use that
    let currentDocumentContent: string;
    try {
      const currentContent =
        inlineDiffManager.getCurrentDocumentContent(absolutePath);
      if (currentContent !== undefined) {
        currentDocumentContent = currentContent;
        console.log(
          `[UpdateFileToolHandler] Using current document content (pending changes excluded) for ${filePath}`,
        );
      } else {
        // Fallback: Get directly from VS Code editor
        const vscode = await import("vscode");
        const uri = vscode.Uri.file(absolutePath);
        try {
          const document = await vscode.workspace.openTextDocument(uri);
          currentDocumentContent = document.getText();
          console.log(
            `[UpdateFileToolHandler] Using document.getText() as fallback for ${filePath}`,
          );
        } catch {
          // Final Fallback: Use content read from disk
          currentDocumentContent = fileContent;
          console.log(
            `[UpdateFileToolHandler] Using fileContent from disk as final fallback for ${filePath}`,
          );
        }
      }
    } catch (error) {
      console.warn(
        `[UpdateFileToolHandler] Could not get current document content, using fileContent: ${error}`,
      );
      currentDocumentContent = fileContent;
    }

    // Show diff (based on current document state)
    await inlineDiffManager.showInlineDiff(
      absolutePath,
      currentDocumentContent,
      newContent,
      context.conversationTurnId,
    );

    // E-1: Git diff verification (fire and forget)
    try {
      const { execSync } = require("child_process");
      const gitRoot = context.projectRoot;
      const nullDev = process.platform === "win32" ? "2>nul" : "2>/dev/null";
      const diffOutput = execSync(
        `git diff --stat -- "${absolutePath}" ${nullDev}`,
        { cwd: gitRoot, timeout: 3000 },
      )
        .toString()
        .trim();
      if (diffOutput) {
        console.log(
          `[UpdateFileToolHandler] Git diff for ${filePath}: ${diffOutput}`,
        );
      }
    } catch {
      // Not a git repo or git not available — ignore
    }

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
    let hadSeparator = false; // Track whether ======= separator was encountered

    for (const line of lines) {
      const trimmedLine = line.trim();

      // SEARCH start marker (flexible matching)
      if (trimmedLine.match(/^([-=]{3,}|<{4,})\s*SEARCH\s*/i)) {
        inSearch = true;
        inReplace = false;
        hadSeparator = false;
        currentSearch = "";
        continue;
      }

      // Separator marker (======= etc.)
      if (inSearch && trimmedLine.match(/^([=]{3,})$/)) {
        inSearch = false;
        inReplace = true;
        hadSeparator = true;
        currentReplace = "";
        continue;
      }

      // REPLACE end marker (>>>>>>> REPLACE etc.)
      // Core fix: Handle case where >>>>>>> REPLACE appears directly without ======= separator
      if (trimmedLine.match(/^([+]{3,}|>{4,})\s*REPLACE\s*/i)) {
        if (inSearch && !hadSeparator) {
          // Case where SEARCH transitions directly to REPLACE without =======
          // Keep SEARCH content as-is and start collecting REPLACE
          console.log(
            "[UpdateFileToolHandler] Warning: Missing ======= separator, treating content after >>>>>>> REPLACE as replacement",
          );
          inSearch = false;
          inReplace = true;
          currentReplace = "";
          continue;
        } else if (inReplace) {
          // Normal case: REPLACE block complete
          replacements.push({
            search: currentSearch.trimEnd(),
            replace: currentReplace.trimEnd(),
          });
          inReplace = false;
          hadSeparator = false;
          // Prevent duplicate push: reset state after block completion
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

    // Handle last block: case where it ends without a REPLACE marker (content after >>>>>>> REPLACE)
    if (currentSearch && currentReplace) {
      replacements.push({
        search: currentSearch.trimEnd(),
        replace: currentReplace.trimEnd(),
      });
    }

    return replacements;
  }

  /**
   * Compare each line after trim() to allow leading/trailing whitespace differences
   */
  private lineTrimmedFallbackMatch(
    originalContent: string,
    searchContent: string,
    startIndex: number,
  ): [number, number] | false {
    const originalLines = originalContent.split("\n");
    const searchLines = searchContent.split("\n");

    // Remove last empty line (handle trailing \n)
    if (searchLines[searchLines.length - 1] === "") {
      searchLines.pop();
    }

    // Find which line startIndex falls on
    let startLineNum = 0;
    let currentIndex = 0;
    while (currentIndex < startIndex && startLineNum < originalLines.length) {
      currentIndex += originalLines[startLineNum].length + 1; // +1 for \n
      startLineNum++;
    }

    // Try matching at each possible start position
    for (
      let i = startLineNum;
      i <= originalLines.length - searchLines.length;
      i++
    ) {
      let matches = true;

      // Try matching all search lines from this position
      for (let j = 0; j < searchLines.length; j++) {
        const originalTrimmed = originalLines[i + j].trim();
        const searchTrimmed = searchLines[j].trim();

        if (originalTrimmed !== searchTrimmed) {
          matches = false;
          break;
        }
      }

      if (matches) {
        // Calculate exact character positions
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
   * For blocks of 3+ lines, use first and last lines as anchors for matching
   */
  private blockAnchorFallbackMatch(
    originalContent: string,
    searchContent: string,
    startIndex: number,
  ): [number, number] | false {
    const originalLines = originalContent.split("\n");
    const searchLines = searchContent.split("\n");

    // Apply anchor matching only for 3+ lines
    if (searchLines.length < 3) {
      return false;
    }

    // Remove last empty line
    if (searchLines[searchLines.length - 1].trim() === "") {
      searchLines.pop();
    }

    const firstLineSearch = searchLines[0].trim();
    const lastLineSearch = searchLines[searchLines.length - 1].trim();
    const searchBlockSize = searchLines.length;

    // Middle lines (excluding first/last): must match exactly after trim()
    const middleSearchLines = searchLines.slice(1, -1).map((l) => l.trim());

    for (let i = 0; i <= originalLines.length - searchBlockSize; i++) {
      // Check if first and last lines match based on trim()
      if (
        originalLines[i].trim() !== firstLineSearch ||
        originalLines[i + searchBlockSize - 1].trim() !== lastLineSearch
      ) {
        continue;
      }

      if (middleSearchLines.length > 0) {
        const middleOriginalLines = originalLines
          .slice(i + 1, i + searchBlockSize - 1)
          .map((l) => l.trim());

        if (middleOriginalLines.length !== middleSearchLines.length) {
          continue;
        }
        let middleOk = true;
        for (let k = 0; k < middleSearchLines.length; k++) {
          if (middleSearchLines[k] !== middleOriginalLines[k]) {
            middleOk = false;
            break;
          }
        }
        if (!middleOk) {
          continue;
        }
      }

      // Calculate matched start and end indices
      let matchStartIndex = 0;
      for (let k = 0; k < i; k++) {
        matchStartIndex += originalLines[k].length + 1;
      }

      let matchEndIndex = matchStartIndex;
      for (let k = 0; k < searchBlockSize; k++) {
        matchEndIndex += originalLines[i + k].length + 1;
      }

      // Correct trailing \n (when not at end of file)
      if (matchEndIndex > originalContent.length) {
        matchEndIndex = originalContent.length;
      }

      return [matchStartIndex, matchEndIndex];
    }

    return false;
  }

  /**
   * Find structurally matching regions while ignoring whitespace and newline differences.
   * (Compresses consecutive spaces/tabs/newlines into one for comparison)
   */
  private structuralFallbackMatch(
    originalContent: string,
    searchContent: string,
    startIndex: number,
  ): [number, number] | false {
    // Regex to compress all whitespace and newlines into one
    const normalizePattern = /\s+/g;
    const normalizedSearch = searchContent
      .replace(normalizePattern, " ")
      .trim();

    // Exclude overly short patterns due to risk of false positives
    if (normalizedSearch.length < 10) {
      return false;
    }

    const originalSuffix = originalContent.substring(startIndex);

    // Find position in original text by compressing whitespace
    // (Note: regex special characters need escaping)
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

  /**
   * B-4: Normalize curly/smart quotes to straight quotes for matching
   */
  private normalizeQuotes(str: string): string {
    return str
      .replace(/[\u2018\u2019]/g, "'") // curly single quotes -> straight
      .replace(/[\u201C\u201D]/g, '"'); // curly double quotes -> straight
  }

  getDescription(toolUse: ToolUse): string {
    return `[update_file for '${toolUse.params.path}']`;
  }
}
