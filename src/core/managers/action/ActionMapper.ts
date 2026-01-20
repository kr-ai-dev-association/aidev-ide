/**
 * Action Mapper
 * LLM 응답을 액션으로 매핑하는 클래스
 */

import {
  Action,
  ActionType,
  ActionParams,
  LLMResponse,
  ActionMappingResult,
  Permission,
  FileOperationType,
} from "./types";
import { AgentConfig } from "../../config/AgentConfig";

export class ActionMapper {
  private actionIdCounter = 0;
  private readonly MAX_TERMINAL_COMMANDS = 10;

  /**
   * LLM 응답을 액션 배열로 매핑합니다
   */
  public mapResponse(llmResponse: LLMResponse): ActionMappingResult {
    console.log("[ActionMapper] Mapping LLM response to actions");

    // LLM이 이미 액션을 제공한 경우
    if (llmResponse.actions && llmResponse.actions.length > 0) {
      return {
        actions: llmResponse.actions,
        explanation: llmResponse.explanation,
        confidence: AgentConfig.ACTION_CONFIDENCE.LLM_PROVIDED,
      };
    }

    // 텍스트에서 액션 추출
    const actions = this.extractActionsFromText(llmResponse.content);

    return {
      actions,
      explanation: llmResponse.explanation,
      confidence: this.calculateConfidence(actions, llmResponse.content),
    };
  }

  /**
   * 텍스트에서 액션을 추출합니다
   */
  private extractActionsFromText(content: string): Action[] {
    // LLM 출력에서 파일 작업 지시어 라인을 정규화합니다.
    // 예: "**새 파일: design.md**" → "새 파일: design.md"
    //     "- 새 파일: src/App.tsx"  → "새 파일: src/App.tsx"
    const normalizedContent = this.normalizeFileOperationDirectives(content);

    const actions: Action[] = [];

    // 파일 생성 영역을 먼저 감지 (명령어 추출 전에)
    const fileCreationRanges = this.detectFileCreationRanges(normalizedContent);
    console.log(
      `[ActionMapper] Detected ${fileCreationRanges.length} file creation ranges:`,
      fileCreationRanges.map((r) => `${r.start}-${r.end}`),
    );

    // 코드 블록 추출 (파일 작성/수정)
    const codeBlockActions = this.extractCodeBlocks(normalizedContent);
    actions.push(...codeBlockActions);
    console.log(
      `[ActionMapper] Extracted ${codeBlockActions.length} code block actions`,
    );

    // 파일 작업 추출 (명령어 추출 전에 파일 영역 파악)
    const fileOpActions = this.extractFileOperations(normalizedContent);
    actions.push(...fileOpActions);
    console.log(
      `[ActionMapper] Extracted ${fileOpActions.length} file operation actions`,
    );

    // 터미널 명령어 추출 (파일 생성 영역 제외)
    const commandActions = this.extractCommands(
      normalizedContent,
      codeBlockActions,
      fileCreationRanges,
    );
    // 디버그: 추출된 명령어 로그
    if (commandActions.length > 0) {
      console.log(
        `[ActionMapper] Extracted ${commandActions.length} command actions:`,
        commandActions.map((a) => a.params?.command).filter(Boolean),
      );
    }
    actions.push(...commandActions);
    console.log(
      `[ActionMapper] Extracted ${commandActions.length} command actions`,
    );

    console.log(
      `[ActionMapper] Total extracted ${actions.length} actions from text`,
    );
    // 중복 제거 (같은 터미널 명령은 한 번만 실행)
    return this.deduplicateTerminalCommands(actions);
  }

  /**
   * 파일 경로 문자열을 정리합니다.
   * - 양쪽 공백 제거
   * - 백틱(`), 큰따옴표(") 제거
   * - 마크다운 볼드/이탤릭(*) 마커 제거 (예: **file.md** → file.md)
   */
  private sanitizeFilePath(rawPath: string): string {
    if (!rawPath) {
      return "";
    }
    let filePath = rawPath.trim();
    // 백틱/큰따옴표 제거
    filePath = filePath.replace(/^`+|`+$/g, "").replace(/^"+|"+$/g, "");
    // 양끝 * / ** 제거 (마크다운 볼드/이탤릭)
    filePath = filePath.replace(/^\*+|\*+$/g, "");
    return filePath.trim();
  }

  /**
   * LLM 출력에서 파일 작업 지시어 라인을 정규화합니다.
   * - 마크다운 볼드/이탤릭으로 둘러싼 지시어를 평문으로 변환
   *   예: "**새 파일: design.md**" → "새 파일: design.md"
   * - 목록 기호(-, *) 앞에 붙은 지시어를 제거
   *   예: "- 새 파일: src/App.tsx" → "새 파일: src/App.tsx"
   */
  private normalizeFileOperationDirectives(content: string): string {
    if (!content) {
      return "";
    }

    let normalized = content;

    // 1) 볼드/이탤릭으로 둘러싸인 지시어 제거
    //    "**새 파일: design.md**" → "새 파일: design.md"
    normalized = normalized.replace(
      /\*\*(\s*(?:새 파일|수정 파일|삭제 파일):[^\n*]+)\*\*/g,
      (_, inner: string) => inner.trim(),
    );
    normalized = normalized.replace(
      /__(\s*(?:새 파일|수정 파일|삭제 파일):[^\n_]+)__/g,
      (_, inner: string) => inner.trim(),
    );

    // 2) 목록 기호(-, *) 제거: "- 새 파일: ..." → "새 파일: ..."
    normalized = normalized.replace(
      /(^|\n)[\t ]*[-*]\s*((?:새 파일|수정 파일|삭제 파일):\s*[^\n]+)/g,
      (_, prefix: string, directive: string) => `${prefix}${directive}`,
    );

    return normalized;
  }

  /**
   * 코드 블록에서 액션을 추출합니다
   */
  private extractCodeBlocks(content: string): Action[] {
    const actions: Action[] = [];

    // 파일 경로와 코드 블록을 함께 추출하는 정규식
    // 예: ```typescript:src/example.ts ... ```
    const codeBlockPattern = /```(?:[\w]+)?:?([\w\/\.\-]+)?\n([\s\S]*?)```/g;
    let match;

    while ((match = codeBlockPattern.exec(content)) !== null) {
      const filePath = match[1];
      const code = match[2].trim();

      if (filePath && code) {
        const cleanedPath = this.sanitizeFilePath(filePath);
        if (cleanedPath) {
          actions.push(this.createCodeGenerationAction(cleanedPath, code));
        }
      }
    }

    // 마크다운 헤더 형식: "## 새 파일: `package.json`" 또는 "## 새 파일: package.json"
    const markdownHeaderPattern =
      /##\s*(?:새 파일|수정 파일):\s*[`"]?([^\r\n`"]+?)[`"]?\s*\r?\n\s*\r?\n\s*```[^\n]*\r?\n([\s\S]*?)\r?\n```/g;
    while ((match = markdownHeaderPattern.exec(content)) !== null) {
      let filePath = match[1].trim();
      const code = match[2].trim();

      filePath = this.sanitizeFilePath(filePath);

      if (filePath && code) {
        const isDuplicate = actions.some(
          (a) =>
            a.type === ActionType.CODE_GENERATION &&
            a.params.filePath === filePath,
        );

        if (!isDuplicate) {
          actions.push(this.createCodeGenerationAction(filePath, code));
        }
      }
    }

    // 파일 경로가 명시된 패턴 (예: "Create file src/example.ts:")
    const filePathPattern =
      /(?:Create|Update|Modify)\s+(?:file\s+)?[`"]?([\/\w\.\-]+)[`"]?:?\s*```[\w]*\n([\s\S]*?)```/gi;

    while ((match = filePathPattern.exec(content)) !== null) {
      const filePath = this.sanitizeFilePath(match[1]);
      const code = match[2].trim();

      if (filePath && code) {
        // 중복 체크
        const isDuplicate = actions.some(
          (a) =>
            a.type === ActionType.CODE_GENERATION &&
            a.params.filePath === filePath,
        );

        if (!isDuplicate) {
          actions.push(this.createCodeGenerationAction(filePath, code));
        }
      }
    }

    // 한국어 지시어 패턴: "새 파일:" 또는 "수정 파일:" 다음에 파일 경로와 코드 블록
    // 예: "새 파일: src/example.ts\n```typescript\n...```"
    // 더 유연한 패턴: 마크다운 헤더, 백틱, 여러 줄 허용
    // 패턴 1: "새 파일: `package.json`\n\n```json\n..."
    const koreanCodeBlockPattern1 =
      /(?:##\s*)?(?:새 파일|수정 파일):\s*[`"]?([^\r\n`"]+?)[`"]?\s*\r?\n\s*\r?\n\s*```[^\n]*\r?\n([\s\S]*?)\r?\n```/g;
    while ((match = koreanCodeBlockPattern1.exec(content)) !== null) {
      let filePath = match[1].trim();
      const code = match[2].trim();
      filePath = this.sanitizeFilePath(filePath);
      if (filePath && code) {
        const isDuplicate = actions.some(
          (a) =>
            a.type === ActionType.CODE_GENERATION &&
            a.params.filePath === filePath,
        );
        if (!isDuplicate) {
          actions.push(this.createCodeGenerationAction(filePath, code));
        }
      }
    }

    // 패턴 2: "새 파일: package.json\n```json\n..." (줄바꿈이 하나만)
    const koreanCodeBlockPattern2 =
      /(?:##\s*)?(?:새 파일|수정 파일):\s*[`"]?([^\r\n`"]+?)[`"]?\s*\r?\n\s*```[^\n]*\r?\n([\s\S]*?)\r?\n```/g;
    while ((match = koreanCodeBlockPattern2.exec(content)) !== null) {
      let filePath = match[1].trim();
      const code = match[2].trim();
      filePath = this.sanitizeFilePath(filePath);
      if (filePath && code) {
        const isDuplicate = actions.some(
          (a) =>
            a.type === ActionType.CODE_GENERATION &&
            a.params.filePath === filePath,
        );
        if (!isDuplicate) {
          actions.push(this.createCodeGenerationAction(filePath, code));
        }
      }
    }

    // 패턴 3: "새 파일: `package.json`" (백틱 포함)
    const koreanCodeBlockPattern3 =
      /(?:##\s*)?(?:새 파일|수정 파일):\s*`([^`]+)`\s*\r?\n\s*\r?\n\s*```[^\n]*\r?\n([\s\S]*?)\r?\n```/g;
    while ((match = koreanCodeBlockPattern3.exec(content)) !== null) {
      const filePath = this.sanitizeFilePath(match[1]);
      const code = match[2].trim();
      if (filePath && code) {
        const isDuplicate = actions.some(
          (a) =>
            a.type === ActionType.CODE_GENERATION &&
            a.params.filePath === filePath,
        );
        if (!isDuplicate) {
          actions.push(this.createCodeGenerationAction(filePath, code));
        }
      }
    }

    // 한국어 마크다운 파일 패턴: "새 파일:" 또는 "수정 파일:" 다음에 .md 파일과 내용
    // - 다음 지시어(새 파일/수정 파일/삭제 파일/--- 작업 요약/--- 작업 수행 설명) 직전까지 또는 문자열 끝까지를 본문으로 취급
    const koreanMarkdownPattern =
      /(새 파일|수정 파일):\s*([^\r\n]+\.md)\s*\r?\n\s*\r?\n?([\s\S]*?)(?=(?:\r?\n\s*(?:새 파일|수정 파일|삭제 파일|--- 작업 요약|--- 작업 수행 설명))|$)/gs;

    while ((match = koreanMarkdownPattern.exec(content)) !== null) {
      const directive = match[1].trim();
      let filePath = match[2].trim();
      const mdBody = match[3].trim();

      // 파일 경로 정리
      filePath = this.sanitizeFilePath(filePath);

      if (filePath && mdBody) {
        // 중복 체크
        const isDuplicate = actions.some(
          (a) =>
            a.type === ActionType.CODE_GENERATION &&
            a.params.filePath === filePath,
        );

        if (!isDuplicate) {
          actions.push(
            this.createCodeGenerationAction(filePath, mdBody, "markdown"),
          );
        }
      }
    }

    // 패턴 5: 코드블록이 없고, 단순히 "새 파일: xxx.ext" 다음에 전체 본문이 오는 경우
    // 예: "새 파일: src/App.css\n\ncss\n6 lines\n...코드...\nCopy"
    if (actions.length === 0) {
      const plainFilePattern =
        /(?:^|\n)\s*(?:새 파일|수정 파일):\s*([^\r\n]+)\s*\r?\n([\s\S]*)$/;
      const plainMatch = plainFilePattern.exec(content);
      if (plainMatch) {
        const rawPath = plainMatch[1];
        const rawBody = plainMatch[2] || "";
        const cleanedPath = this.sanitizeFilePath(rawPath);

        if (cleanedPath) {
          // 헤더/불필요 라인 제거: 언어 표시(cs, tsx 등), "6 lines", "Copy" 같은 메타라인 제거
          const lines = rawBody.split(/\r?\n/);
          const codeLines: string[] = [];
          for (let line of lines) {
            const trimmed = line.trimEnd();
            const headerLike = /^[A-Za-z0-9#+\-\s]+$/.test(trimmed);
            const isLineCount = /^\d+\s+lines$/i.test(trimmed);
            const isCopy = /^copy$/i.test(trimmed);
            if (!trimmed) {
              // 빈 줄은 그대로 유지 (코드 내 공백 보존)
              codeLines.push("");
              continue;
            }
            if (headerLike || isLineCount || isCopy) {
              // 언어/라인수/Copy 라인은 건너뜀
              continue;
            }
            codeLines.push(trimmed);
          }
          const body = codeLines.join("\n").trim();

          // .md인 경우에는 이미 위에서 처리했으므로 여기서는 건너뜀
          if (cleanedPath.toLowerCase().endsWith(".md")) {
            // nothing
          } else if (body) {
            actions.push(this.createCodeGenerationAction(cleanedPath, body));
          }
        }
      }
    }

    return actions;
  }

  /**
   * 파일 생성 영역을 감지합니다 (명령어 추출 전에 호출)
   * "새 파일:" 또는 "수정 파일:" 다음에 오는 모든 내용을 파일 생성 영역으로 간주
   * codepilot-old와 동일하게 오직 bash 코드 블록만 명령어로 처리하므로,
   * 파일 생성 영역 내부의 모든 내용(코드 블록 포함)을 제외해야 함
   */
  private detectFileCreationRanges(
    content: string,
  ): Array<{ start: number; end: number }> {
    const ranges: Array<{ start: number; end: number }> = [];

    // 파일 지시어 패턴: "새 파일:", "수정 파일:" 등
    const fileDirectivePattern =
      /(?:새 파일|수정 파일|Create file|Update file|Modify file):\s*[`"]?([^\r\n`"]+?)[`"]?/gi;
    let match: RegExpExecArray | null = null;

    while ((match = fileDirectivePattern.exec(content)) !== null) {
      const startIndex = match.index;
      const afterDirective = content.substring(startIndex + match[0].length);

      // 다음 파일 지시어 찾기
      const nextFileDirective = afterDirective.search(
        /(?:새 파일|수정 파일|Create file|Update file|Modify file):/i,
      );

      // 파일 생성 영역의 끝: 다음 파일 지시어 또는 문자열 끝
      // 중요: 파일 생성 영역 내부의 모든 bash 블록은 파일 내용으로 간주하고 제외
      let endIndex = startIndex + match[0].length + afterDirective.length;

      if (nextFileDirective !== -1) {
        endIndex = startIndex + match[0].length + nextFileDirective;
      }

      ranges.push({ start: startIndex, end: endIndex });
      console.log(
        `[ActionMapper] Detected file creation range: ${startIndex}-${endIndex} (file: ${match[1]})`,
      );
    }

    return ranges;
  }

  /**
   * 터미널 명령어를 추출합니다
   * @param content LLM 응답 내용
   * @param codeBlockActions 이미 추출된 코드 블록 액션들 (파일 생성 영역 제외용)
   * @param fileCreationRanges 파일 생성 영역 범위들 (명령어 추출에서 제외)
   */
  private extractCommands(
    content: string,
    codeBlockActions: Action[] = [],
    fileCreationRanges: Array<{ start: number; end: number }> = [],
  ): Action[] {
    const actions: Action[] = [];

    // 모든 코드 블록 범위 수집 (bash가 아닌 코드 블록 제외용)
    const allCodeBlockPattern = /```[\s\S]*?```/g;
    const allCodeBlockRanges: Array<{ start: number; end: number }> = [];
    let match: RegExpExecArray | null = null;
    while ((match = allCodeBlockPattern.exec(content)) !== null) {
      allCodeBlockRanges.push({
        start: match.index,
        end: match.index + match[0].length,
      });
    }

    // 파일 생성 영역은 이미 detectFileCreationRanges에서 감지했으므로 그대로 사용
    const fileActionRanges = fileCreationRanges;

    // bash, sh, shell, powershell, cmd 코드 블록만 추출
    // codepilot-old와 동일하게 오직 bash 코드 블록만 명령어로 처리
    // 중요: 파일 생성 영역 내부의 bash 블록은 파일 내용일 수 있으므로 제외해야 함
    const commandBlockPattern =
      /```(?:bash|sh|shell|powershell|cmd|terminal)\s*\n([\s\S]*?)\n```/g;
    match = null;

    while ((match = commandBlockPattern.exec(content)) !== null) {
      // 파일 생성 영역 내부에 있는지 확인
      const isInsideFileAction = fileActionRanges.some(
        (range: { start: number; end: number }) =>
          match!.index >= range.start && match!.index < range.end,
      );

      if (isInsideFileAction) {
        console.log(
          `[ActionMapper] Skipping bash block inside file creation range: ${match.index}-${match.index + match[0].length}`,
        );
        continue; // 파일 생성 영역 내부의 bash 블록은 스킵 (파일 내용일 수 있음)
      }

      const block = this.normalizeCommandBlock(match[1]);
      if (!block) {
        continue;
      }

      const commands = block.split("\n");

      for (const cmd of commands) {
        const cleanCmd = this.stripInlineComment(cmd.trim());

        // 빈 줄이나 주석은 건너뜀
        if (
          !cleanCmd ||
          cleanCmd.startsWith("#") ||
          cleanCmd.startsWith("//")
        ) {
          continue;
        }

        // 단순 파일명만 있는 경우 제외 (공백이 없고 파일 확장자로 끝나는 경우)
        // 예: "init.sql", "App.tsx" 같은 경우만 제외
        // "psql -f init.sql" 같은 명령어는 포함 (공백이 있으므로)
        if (
          !/\s/.test(cleanCmd) &&
          /\.(md|ts|tsx|js|jsx|json|css|html|py|java|go|rs|rb|php|sh|bat|ps1|sql|yml|yaml)$/i.test(
            cleanCmd,
          )
        ) {
          console.log(
            `[ActionMapper] Skipping file name only in bash block as command: ${cleanCmd}`,
          );
          continue;
        }

        // 절대 경로만 있는 경우 제외 (공백이 없고 / 또는 \로 시작하는 경우)
        // 예: "/path/to/file", "./file" 같은 경우만 제외
        // "psql -f ./file.sql" 같은 명령어는 포함 (공백이 있으므로)
        if (!/\s/.test(cleanCmd) && /^\/|^\.\/|^[A-Z]:\\/i.test(cleanCmd)) {
          console.log(
            `[ActionMapper] Skipping file path only in bash block as command: ${cleanCmd}`,
          );
          continue;
        }

        // "새 파일:", "수정 파일:" 같은 파일 지시어는 제외
        if (
          /(?:새 파일|수정 파일|Create file|Update file|Modify file):/i.test(
            cleanCmd,
          )
        ) {
          console.log(
            `[ActionMapper] Skipping file directive in bash block as command: ${cleanCmd}`,
          );
          continue;
        }

        // bash 코드 블록 내 명령어는 키워드 체크 없이 바로 실행 (LLM이 명시적으로 명령어 블록으로 제공)
        if (cleanCmd.length > 0) {
          actions.push(this.createTerminalCommandAction(cleanCmd));
        }
      }
    }

    // codepilot-old와 동일하게 오직 bash 코드 블록만 명령어로 처리
    // 프롬프트에서도 ` ```bash ... ``` ` 형식으로 명령어를 제공하도록 지시하므로,
    // 인라인 백틱이나 명시적 명령어 패턴은 추출하지 않음
    // (파일 내용 내의 백틱이 명령어로 오인되는 문제 방지)

    // 개수 제한 및 중복 제거
    const deduped = this.deduplicateTerminalCommands(actions);
    const limitedDiagnostics = this.limitDiagnosticCommands(deduped);
    const filtered = this.filterInstallFlow(limitedDiagnostics);
    return filtered.slice(0, this.MAX_TERMINAL_COMMANDS);
  }

  /**
   * 코드블록에서 추출한 명령 문자열을 정규화합니다.
   * - \r 제거
   * - 이스케이프된 \n을 실제 개행으로 변환
   */
  private normalizeCommandBlock(block: string): string {
    let normalized = block.replace(/\r/g, "");
    normalized = normalized.replace(/\\n/g, "\n");
    return normalized.trim();
  }

  /**
   * 한 줄 명령에서 인라인 주석(#, //)을 제거합니다.
   */
  private stripInlineComment(command: string): string {
    if (!command) {
      return "";
    }
    // 공백 뒤에 오는 주석만 제거해 URL(https://) 등은 보존
    let cleaned = command.replace(/\s+#.*$/, "").replace(/\s+\/\/.*$/, "");
    return cleaned.trim();
  }

  /**
   * 터미널 명령 액션 중 중복을 제거합니다.
   */
  private deduplicateTerminalCommands(actions: Action[]): Action[] {
    const seen = new Set<string>();
    const result: Action[] = [];

    for (const action of actions) {
      if (action.type !== ActionType.TERMINAL_COMMAND) {
        result.push(action);
        continue;
      }
      const cmd = (action.params.command || "").trim();
      const key = `terminal:${cmd}`;
      if (!cmd || seen.has(key)) {
        continue;
      }
      seen.add(key);
      result.push(action);
    }

    return result;
  }

  /**
   * npm install/ci 플로우일 때 필수 명령만 남기고 나머지를 제거합니다.
   * - 허용: node -v, npm -v, npm install, npm ci
   * - 플레이스홀더 경로 포함 명령은 제거
   * - 최대 4개로 제한
   */
  private filterInstallFlow(actions: Action[]): Action[] {
    const placeholderPatterns = [
      /\/path\/to\/your\/project/i,
      /<path[-_ ]?to[-_ ]?project>/i,
      /\$PROJECT_ROOT/i,
      /PROJECT_ROOT/i,
    ];

    const filtered: Action[] = [];
    let keptVersionCheck = false;
    let keptInstall = false;

    const isVersionCheck = (cmd: string) =>
      /^node\s+-v\b/i.test(cmd) ||
      /^npm\s+-v\b/i.test(cmd) ||
      /^yarn\s+-v\b/i.test(cmd) ||
      /^pnpm\s+-v\b/i.test(cmd) ||
      /^node\s+-v\b.*npm\s+-v\b/i.test(cmd) ||
      /^npm\s+-v\b.*node\s+-v\b/i.test(cmd);

    const isInstall = (cmd: string) =>
      /(npm|yarn|pnpm)\s+(install|ci|add)\b/i.test(cmd);

    const isAuditOrList = (cmd: string) =>
      /\b(npm\s+audit|npm\s+list|npm\s+outdated|yarn\s+audit|pnpm\s+audit)\b/i.test(
        cmd,
      );

    const isInit = (cmd: string) =>
      /\b(npm\s+init|yarn\s+init|pnpm\s+init)\b/i.test(cmd);

    for (const action of actions) {
      if (action.type !== ActionType.TERMINAL_COMMAND) {
        continue;
      }
      const cmd = (action.params.command || "").trim();
      if (!cmd) {
        continue;
      }
      if (placeholderPatterns.some((p) => p.test(cmd))) {
        continue;
      }

      // 불필요 명령 스킵
      if (isAuditOrList(cmd)) {
        continue;
      }
      if (isInit(cmd)) {
        continue;
      }
      if (/dependencies\.txt/i.test(cmd)) {
        continue;
      }

      // 버전 확인: 한 번만
      if (isVersionCheck(cmd)) {
        if (keptVersionCheck) {
          continue;
        }
        keptVersionCheck = true;
        filtered.push(action);
        continue;
      }

      // 설치: 한 번만
      if (isInstall(cmd)) {
        if (keptInstall) {
          continue;
        }
        keptInstall = true;
        filtered.push(action);
        continue;
      }

      // 기타 명령은 설치 플로우에서는 스킵
      continue;
    }

    return filtered.length > 0
      ? filtered.slice(0, this.MAX_TERMINAL_COMMANDS)
      : actions;
  }

  /**
   * 진단성 명령어를 제한합니다 (pwd/ls/which 류 1~2회만 허용)
   */
  private limitDiagnosticCommands(actions: Action[]): Action[] {
    const diagnosticPrefixes = ["pwd", "ls", "which"];
    let diagnosticCount = 0;
    const result: Action[] = [];

    for (const action of actions) {
      if (action.type !== ActionType.TERMINAL_COMMAND) {
        result.push(action);
        continue;
      }

      const cmd = (action.params.command || "").trim().toLowerCase();
      const isDiagnostic = diagnosticPrefixes.some(
        (prefix) => cmd === prefix || cmd.startsWith(prefix + " "),
      );

      if (isDiagnostic) {
        if (diagnosticCount >= 2) {
          continue;
        }
        diagnosticCount++;
      }

      result.push(action);
    }

    return result;
  }

  /**
   * 파일 작업을 추출합니다
   */
  private extractFileOperations(content: string): Action[] {
    const actions: Action[] = [];

    // 파일 삭제 패턴 (영어) - 매우 엄격한 패턴
    // "Delete file: path" 또는 "Remove file: path" 형식만 매칭
    // "file:" 키워드가 반드시 포함되어야 함 (SQL "DELETE FROM" 같은 것과 구분)
    const deletePattern =
      /(?:Delete|Remove)\s+file\s*:?\s+[`"]?([\/\w\.\-]+(?:\.\w+)?(?:\/[\/\w\.\-]+)*)[`"]?/gi;
    let match;

    while ((match = deletePattern.exec(content)) !== null) {
      const rawPath = match[1];
      const filePath = this.sanitizeFilePath(rawPath);

      // 사전 필터링: SQL 키워드나 일반 단어는 즉시 거부
      const lowerPath = filePath.toLowerCase().trim();
      const sqlKeywords = [
        "from",
        "to",
        "where",
        "select",
        "insert",
        "update",
        "delete",
        "drop",
        "create",
        "alter",
        "table",
        "database",
        "cascade",
        "constraint",
        "index",
        "primary",
        "foreign",
        "key",
        "references",
        "on",
        "as",
        "is",
        "not",
        "null",
        "and",
        "or",
        "in",
        "like",
        "between",
        "order",
        "by",
        "group",
        "having",
        "join",
        "inner",
        "outer",
        "left",
        "right",
        "union",
        "all",
        "distinct",
      ];

      if (sqlKeywords.includes(lowerPath)) {
        console.log(
          `[ActionMapper] Skipping SQL keyword as file path: ${filePath}`,
        );
        continue;
      }

      // 단일 대문자 단어 거부
      if (/^[A-Z]+$/.test(filePath.trim()) && filePath.trim().length <= 10) {
        console.log(
          `[ActionMapper] Skipping single uppercase word as file path: ${filePath}`,
        );
        continue;
      }

      if (this.isValidFilePath(filePath)) {
        console.log(
          `[ActionMapper] Extracted file delete operation: ${filePath}`,
        );
        actions.push(
          this.createFileOperationAction(FileOperationType.DELETE, filePath),
        );
      } else {
        console.log(
          `[ActionMapper] Invalid file path filtered: ${filePath} (raw: ${rawPath})`,
        );
      }
    }

    // 한국어 삭제 패턴: "삭제 파일: ..."
    const koreanDeletePattern = /삭제 파일:\s+(.+?)(?:\r?\n|$)/g;

    while ((match = koreanDeletePattern.exec(content)) !== null) {
      const rawPath = match[1].trim();
      let filePath = this.sanitizeFilePath(rawPath);

      // 사전 필터링: SQL 키워드나 일반 단어는 즉시 거부
      const lowerPath = filePath.toLowerCase();
      const sqlKeywords = [
        "from",
        "to",
        "where",
        "select",
        "insert",
        "update",
        "delete",
        "drop",
        "create",
        "alter",
        "table",
        "database",
        "cascade",
        "constraint",
        "index",
        "primary",
        "foreign",
        "key",
        "references",
        "on",
        "as",
        "is",
        "not",
        "null",
        "and",
        "or",
        "in",
        "like",
        "between",
        "order",
        "by",
        "group",
        "having",
        "join",
        "inner",
        "outer",
        "left",
        "right",
        "union",
        "all",
        "distinct",
      ];

      if (sqlKeywords.includes(lowerPath)) {
        console.log(
          `[ActionMapper] Skipping SQL keyword as file path (Korean): ${filePath}`,
        );
        continue;
      }

      // 단일 대문자 단어 거부
      if (/^[A-Z]+$/.test(filePath.trim()) && filePath.trim().length <= 10) {
        console.log(
          `[ActionMapper] Skipping single uppercase word as file path (Korean): ${filePath}`,
        );
        continue;
      }

      if (filePath && this.isValidFilePath(filePath)) {
        console.log(
          `[ActionMapper] Extracted file delete operation (Korean): ${filePath}`,
        );
        actions.push(
          this.createFileOperationAction(FileOperationType.DELETE, filePath),
        );
      } else {
        console.log(
          `[ActionMapper] Invalid file path filtered (Korean): ${filePath} (raw: ${rawPath})`,
        );
      }
    }

    // 파일 이름 변경 패턴
    const renamePattern =
      /Rename\s+[`"]?([\/\w\.\-]+)[`"]?\s+to\s+[`"]?([\/\w\.\-]+)[`"]?/gi;

    while ((match = renamePattern.exec(content)) !== null) {
      const sourcePath = this.sanitizeFilePath(match[1]);
      const targetPath = this.sanitizeFilePath(match[2]);
      if (
        this.isValidFilePath(sourcePath) &&
        this.isValidFilePath(targetPath)
      ) {
        actions.push(
          this.createFileOperationAction(
            FileOperationType.RENAME,
            sourcePath,
            targetPath,
          ),
        );
      }
    }

    // 파일 이동 패턴
    const movePattern =
      /Move\s+[`"]?([\/\w\.\-]+)[`"]?\s+to\s+[`"]?([\/\w\.\-]+)[`"]?/gi;

    while ((match = movePattern.exec(content)) !== null) {
      const sourcePath = this.sanitizeFilePath(match[1]);
      const targetPath = this.sanitizeFilePath(match[2]);
      if (
        this.isValidFilePath(sourcePath) &&
        this.isValidFilePath(targetPath)
      ) {
        actions.push(
          this.createFileOperationAction(
            FileOperationType.MOVE,
            sourcePath,
            targetPath,
          ),
        );
      }
    }

    return actions;
  }

  /**
   * 파일 경로가 유효한지 검증합니다
   */
  private isValidFilePath(filePath: string): boolean {
    if (!filePath || filePath.trim().length === 0) {
      return false;
    }

    const trimmedPath = filePath.trim();

    // "N/A", "null", "undefined" 같은 무효한 값 필터링
    const invalidValues = ["n/a", "null", "undefined", "none", "없음", "없다"];
    const lowerPath = trimmedPath.toLowerCase();
    if (invalidValues.includes(lowerPath)) {
      return false;
    }

    // SQL 키워드나 일반적인 영어 단어 필터링
    const sqlKeywords = [
      "from",
      "to",
      "where",
      "select",
      "insert",
      "update",
      "delete",
      "drop",
      "create",
      "alter",
      "table",
      "database",
      "cascade",
      "constraint",
      "index",
      "primary",
      "foreign",
      "key",
      "references",
      "on",
      "as",
      "is",
      "not",
      "null",
      "and",
      "or",
      "in",
      "like",
      "between",
      "order",
      "by",
      "group",
      "having",
      "join",
      "inner",
      "outer",
      "left",
      "right",
      "union",
      "all",
      "distinct",
    ];
    if (sqlKeywords.includes(lowerPath)) {
      return false;
    }

    // 단일 대문자 단어 필터링 (SQL 키워드일 가능성 높음)
    if (/^[A-Z]+$/.test(trimmedPath) && trimmedPath.length <= 10) {
      return false;
    }

    // 최소 길이 체크
    if (trimmedPath.length < 2) {
      return false;
    }

    // 경로에 유효한 문자가 있어야 함
    if (!/[a-zA-Z0-9가-힣_\-\.\/]/.test(trimmedPath)) {
      return false;
    }

    // 파일 확장자 또는 경로 구분자(/, \)가 있어야 함 (단순 단어 거부)
    // 예외: 일반적인 파일명 패턴 (예: README, LICENSE, .gitignore)
    const hasExtension = /\.[a-zA-Z0-9]+$/.test(trimmedPath);
    const hasPathSeparator = /[\/\\]/.test(trimmedPath);
    const isCommonFileName =
      /^(readme|license|changelog|contributing|\.gitignore|\.env|\.dockerignore)$/i.test(
        trimmedPath,
      );

    if (!hasExtension && !hasPathSeparator && !isCommonFileName) {
      // 단일 단어는 거부 (SQL 키워드나 일반 단어일 가능성)
      return false;
    }

    // 절대 경로가 루트(/)만 있는 경우 거부
    if (trimmedPath === "/" || trimmedPath === "\\") {
      return false;
    }

    return true;
  }

  /**
   * CODE_GENERATION 액션을 생성합니다
   */
  private createCodeGenerationAction(
    filePath: string,
    code: string,
    language?: string,
  ): Action {
    return {
      id: this.generateActionId(),
      type: ActionType.CODE_GENERATION,
      params: {
        filePath,
        code,
        language: language || this.detectLanguage(filePath),
        description: `Generate/update file: ${filePath}`,
      },
      permissions: [Permission.READ_FILE, Permission.WRITE_FILE],
      validation: [
        {
          field: "filePath",
          type: "required",
          message: "File path is required",
        },
        {
          field: "code",
          type: "required",
          message: "Code content is required",
        },
      ],
      metadata: {
        source: "llm",
        timestamp: Date.now(),
        confidence: AgentConfig.ACTION_CONFIDENCE.FILE_CREATE,
      },
    };
  }

  /**
   * TERMINAL_COMMAND 액션을 생성합니다
   */
  private createTerminalCommandAction(command: string, cwd?: string): Action {
    return {
      id: this.generateActionId(),
      type: ActionType.TERMINAL_COMMAND,
      params: {
        command,
        cwd,
        description: `Execute: ${command}`,
      },
      permissions: [Permission.EXECUTE_COMMAND],
      validation: [
        { field: "command", type: "required", message: "Command is required" },
      ],
      metadata: {
        source: "llm",
        timestamp: Date.now(),
        confidence: AgentConfig.ACTION_CONFIDENCE.TERMINAL_SAFE,
      },
    };
  }

  /**
   * FILE_OPERATION 액션을 생성합니다
   */
  private createFileOperationAction(
    operation: FileOperationType,
    sourcePath: string,
    targetPath?: string,
    content?: string,
  ): Action {
    const permissions: Permission[] = [Permission.READ_FILE];

    if (operation === FileOperationType.DELETE) {
      permissions.push(Permission.DELETE_FILE);
    } else {
      permissions.push(Permission.WRITE_FILE);
    }

    return {
      id: this.generateActionId(),
      type: ActionType.FILE_OPERATION,
      params: {
        operation,
        sourcePath,
        targetPath,
        content,
        description: `${operation} file: ${sourcePath}${targetPath ? ` → ${targetPath}` : ""}`,
      },
      permissions,
      validation: [
        {
          field: "operation",
          type: "required",
          message: "Operation type is required",
        },
        {
          field: "sourcePath",
          type: "required",
          message: "Source path is required",
        },
      ],
      metadata: {
        source: "llm",
        timestamp: Date.now(),
        confidence: AgentConfig.ACTION_CONFIDENCE.FILE_OPERATION,
      },
    };
  }

  /**
   * 파일 확장자로부터 언어를 감지합니다
   */
  private detectLanguage(filePath: string): string {
    const ext = filePath.split(".").pop()?.toLowerCase();

    const languageMap: Record<string, string> = {
      ts: "typescript",
      tsx: "typescript",
      js: "javascript",
      jsx: "javascript",
      py: "python",
      java: "java",
      go: "go",
      rs: "rust",
      c: "c",
      cpp: "cpp",
      cs: "csharp",
      rb: "ruby",
      php: "php",
      swift: "swift",
      kt: "kotlin",
      dart: "dart",
      json: "json",
      xml: "xml",
      yaml: "yaml",
      yml: "yaml",
      md: "markdown",
      html: "html",
      css: "css",
      scss: "scss",
      sql: "sql",
    };

    return ext ? languageMap[ext] || ext : "text";
  }

  /**
   * 신뢰도를 계산합니다
   */
  private calculateConfidence(actions: Action[], content: string): number {
    if (actions.length === 0) {
      return 0;
    }

    let totalConfidence = 0;
    for (const action of actions) {
      totalConfidence +=
        action.metadata?.confidence || AgentConfig.ACTION_CONFIDENCE.DEFAULT;
    }

    const averageConfidence = totalConfidence / actions.length;

    // 코드 블록이나 명령어 블록이 명확하게 있으면 신뢰도 증가
    const hasCodeBlocks = /```[\s\S]*?```/.test(content);
    const confidenceBonus = hasCodeBlocks ? 0.1 : 0;

    return Math.min(averageConfidence + confidenceBonus, 1.0);
  }

  /**
   * 고유한 액션 ID를 생성합니다
   */
  private generateActionId(): string {
    return `action_${Date.now()}_${++this.actionIdCounter}`;
  }

  /**
   * 카운터를 리셋합니다 (테스트용)
   */
  public resetCounter(): void {
    this.actionIdCounter = 0;
  }
}
