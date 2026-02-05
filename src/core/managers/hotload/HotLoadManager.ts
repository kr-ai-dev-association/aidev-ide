/**
 * Hot Load Manager
 * JSON 파일 기반 Hot Load 관리
 *
 * Hot Load는 사용자가 정의한 키워드/설명과 자연어 입력을
 * LLM이 비교하여 매칭되면 미리 정의된 명령어를 자동 실행하는 기능
 */

import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

export interface HotLoadCompletionCondition {
  type: 'exit_code' | 'output_contains' | 'output_not_contains' | 'file_exists';
  value: string;
}

export type HotLoadOnFailureAction = 'stop' | 'pass_to_llm';

export interface HotLoadItem {
  id: number;
  keywords: string; // 트리거 키워드 (쉼표 구분)
  description: string; // 동작원리 설명 (LLM이 매칭 판단에 사용)
  command: string; // 실행할 명령어
  createdAt: string;
  completionCondition?: HotLoadCompletionCondition; // 완료 조건
  maxRetries?: number; // 최대 재시도 횟수 (기본: 0)
  onFailure?: HotLoadOnFailureAction; // 실패 시 동작 (기본: 'stop')
}

export interface HotLoadExecutionResult {
  success: boolean;
  output: string;
  exitCode: number;
  attempts: number;
  failureAction?: HotLoadOnFailureAction;
}

interface HotLoadData {
  nextId: number;
  items: HotLoadItem[];
}

export class HotLoadManager {
  private static instance: HotLoadManager;
  private dataPath: string;
  private data: HotLoadData = { nextId: 1, items: [] };
  private initialized: boolean = false;
  private context: vscode.ExtensionContext;

  private constructor(context: vscode.ExtensionContext) {
    this.context = context;
    // globalStorageUri에 데이터 저장 (확장 데이터 디렉토리)
    this.dataPath = path.join(context.globalStorageUri.fsPath, "hotload.json");
  }

  public static getInstance(context?: vscode.ExtensionContext): HotLoadManager {
    if (!HotLoadManager.instance) {
      if (!context) {
        throw new Error(
          "HotLoadManager requires ExtensionContext for first initialization",
        );
      }
      HotLoadManager.instance = new HotLoadManager(context);
    }
    return HotLoadManager.instance;
  }

  /**
   * 데이터 초기화 및 로드
   */
  private async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // 디렉토리 생성
      const dataDir = path.dirname(this.dataPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      // 기존 데이터 파일이 있으면 로드
      if (fs.existsSync(this.dataPath)) {
        const fileContent = fs.readFileSync(this.dataPath, "utf-8");
        this.data = JSON.parse(fileContent);
      }

      this.initialized = true;
      console.log("[HotLoadManager] Data initialized at:", this.dataPath);
    } catch (error) {
      console.error("[HotLoadManager] Failed to initialize:", error);
      // 오류 시 빈 데이터로 초기화
      this.data = { nextId: 1, items: [] };
      this.initialized = true;
    }
  }

  /**
   * 데이터를 파일에 저장
   */
  private saveData(): void {
    try {
      const dataDir = path.dirname(this.dataPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      fs.writeFileSync(
        this.dataPath,
        JSON.stringify(this.data, null, 2),
        "utf-8",
      );
    } catch (error) {
      console.error("[HotLoadManager] Failed to save data:", error);
    }
  }

  /**
   * Hot Load 항목 추가
   */
  public async addHotLoad(
    keywords: string,
    description: string,
    command: string,
    completionCondition?: HotLoadCompletionCondition,
    maxRetries?: number,
    onFailure?: HotLoadOnFailureAction,
  ): Promise<number> {
    await this.initialize();

    const newItem: HotLoadItem = {
      id: this.data.nextId++,
      keywords,
      description,
      command,
      createdAt: new Date().toISOString(),
      ...(completionCondition && { completionCondition }),
      ...(maxRetries !== undefined && maxRetries > 0 && { maxRetries }),
      ...(onFailure && onFailure !== 'stop' && { onFailure }),
    };

    this.data.items.push(newItem);
    this.saveData();

    console.log("[HotLoadManager] Added Hot Load:", newItem.id);
    return newItem.id;
  }

  /**
   * Hot Load 항목 수정
   */
  public async updateHotLoad(
    id: number,
    keywords: string,
    description: string,
    command: string,
    completionCondition?: HotLoadCompletionCondition,
    maxRetries?: number,
    onFailure?: HotLoadOnFailureAction,
  ): Promise<void> {
    await this.initialize();

    const index = this.data.items.findIndex((item) => item.id === id);
    if (index === -1) {
      throw new Error(`Hot Load item with id ${id} not found`);
    }

    this.data.items[index] = {
      ...this.data.items[index],
      keywords,
      description,
      command,
      completionCondition: completionCondition || undefined,
      maxRetries: (maxRetries !== undefined && maxRetries > 0) ? maxRetries : undefined,
      onFailure: (onFailure && onFailure !== 'stop') ? onFailure : undefined,
    };

    this.saveData();
    console.log("[HotLoadManager] Updated Hot Load:", id);
  }

  /**
   * Hot Load 항목 삭제
   */
  public async deleteHotLoad(id: number): Promise<void> {
    await this.initialize();

    const index = this.data.items.findIndex((item) => item.id === id);
    if (index !== -1) {
      this.data.items.splice(index, 1);
      this.saveData();
      console.log("[HotLoadManager] Deleted Hot Load:", id);
    }
  }

  /**
   * 특정 Hot Load 항목 조회
   */
  public async getHotLoad(id: number): Promise<HotLoadItem | null> {
    await this.initialize();
    return this.data.items.find((item) => item.id === id) || null;
  }

  /**
   * 모든 Hot Load 항목 조회
   */
  public async getAllHotLoads(): Promise<HotLoadItem[]> {
    await this.initialize();
    return [...this.data.items];
  }

  /**
   * 사용자 쿼리에서 키워드 매칭되는 HotLoad 항목 찾기
   * LLM을 사용하여 자연어 의미 기반으로 매칭
   *
   * @param userQuery 사용자 입력
   * @param llmManager LLM 호출용 매니저
   * @returns 매칭된 HotLoadItem 또는 null
   */
  public async matchKeywordWithLLM(
    userQuery: string,
    llmManager: any,
  ): Promise<HotLoadItem | null> {
    await this.initialize();

    if (this.data.items.length === 0) {
      return null;
    }

    // 1. 빠른 사전 필터: 너무 긴 쿼리는 HotLoad 의도가 아님
    if (userQuery.length > 100) {
      return null;
    }

    // 2. LLM에게 HotLoad 항목 중 매칭되는 ID 판단 요청
    const itemsForPrompt = this.data.items.map(item => ({
      id: item.id,
      keywords: item.keywords,
      description: item.description,
    }));

    const prompt = `다음 사용자 입력이 아래 HotLoad 항목 중 어느 것과 매칭되는지 판단하세요.

사용자 입력: "${userQuery}"

HotLoad 항목:
${itemsForPrompt.map(i => `- ID ${i.id}: 키워드="${i.keywords}", 설명="${i.description}"`).join('\n')}

응답 규칙:
- 매칭되는 항목이 있으면 해당 ID만 숫자로 응답 (예: 3)
- 매칭되는 항목이 없으면 0 응답
- 설명이나 추가 텍스트 없이 숫자만 응답`;

    try {
      // 가벼운 모델로 빠르게 판단
      const response = await llmManager.generateSimpleResponse(prompt, {
        maxTokens: 10,
        temperature: 0,
      });

      const matchedId = parseInt(response.trim(), 10);

      if (matchedId > 0) {
        const matchedItem = this.data.items.find(item => item.id === matchedId);
        if (matchedItem) {
          console.log(`[HotLoadManager] LLM matched: id=${matchedId}, keywords="${matchedItem.keywords}"`);
          return matchedItem;
        }
      }

      console.log(`[HotLoadManager] LLM found no match for: "${userQuery}"`);
      return null;
    } catch (error) {
      console.warn('[HotLoadManager] LLM matching failed, falling back to simple match:', error);
      return this.matchKeywordSimple(userQuery);
    }
  }

  /**
   * 단순 키워드 매칭 (LLM 실패 시 fallback)
   */
  private matchKeywordSimple(userQuery: string): HotLoadItem | null {
    const queryLower = userQuery.toLowerCase().replace(/\s+/g, '');

    for (const item of this.data.items) {
      const keywords = item.keywords.split(',').map(k => k.trim().toLowerCase().replace(/\s+/g, ''));

      for (const keyword of keywords) {
        if (!keyword) continue;

        // 정확 일치 또는 쿼리가 키워드로 시작
        if (queryLower === keyword || queryLower.startsWith(keyword)) {
          console.log(`[HotLoadManager] Simple matched: "${keyword}"`);
          return item;
        }
      }
    }

    return null;
  }

  // ─── 명령 실행 + 재시도 ───

  /**
   * Hot Load 항목의 명령어를 실행하고, 완료 조건에 따라 재시도
   * @returns 실행 결과 (ConversationManager에서 failureAction 처리)
   */
  public async executeWithRetry(
    item: HotLoadItem,
    workspaceRoot: string,
    webview: vscode.Webview,
  ): Promise<HotLoadExecutionResult> {
    const maxAttempts = (item.maxRetries || 0) + 1; // 최초 1회 + 재시도 횟수

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        if (attempt > 1) {
          console.log(
            `[HotLoadManager] Retry ${attempt - 1}/${item.maxRetries} for: ${item.command}`,
          );
          // 재시도 전 1초 대기
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        const result = await this.runCommand(item.command, workspaceRoot);

        // 완료 조건 검사
        if (this.checkCompletion(item, result)) {
          return {
            success: true,
            output: result.output,
            exitCode: result.exitCode,
            attempts: attempt,
          };
        }

        // 조건 미충족 → 재시도 대상
        if (attempt === maxAttempts) {
          // 모든 시도 실패
          return {
            success: false,
            output: result.output,
            exitCode: result.exitCode,
            attempts: attempt,
            failureAction: item.onFailure || 'stop',
          };
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        if (attempt === maxAttempts) {
          return {
            success: false,
            output: `Error: ${errorMsg}`,
            exitCode: -1,
            attempts: attempt,
            failureAction: item.onFailure || 'stop',
          };
        }
      }
    }

    // fallback (도달하지 않음)
    return {
      success: false,
      output: 'Max attempts reached',
      exitCode: -1,
      attempts: maxAttempts,
      failureAction: item.onFailure || 'stop',
    };
  }

  /**
   * 완료 조건 검사
   */
  private checkCompletion(
    item: HotLoadItem,
    result: { output: string; exitCode: number },
  ): boolean {
    const condition = item.completionCondition;

    // 조건 없으면 exit code 0을 기본 성공으로 판단
    if (!condition) {
      return result.exitCode === 0;
    }

    switch (condition.type) {
      case 'exit_code':
        return result.exitCode === parseInt(condition.value, 10);
      case 'output_contains':
        return result.output.includes(condition.value);
      case 'output_not_contains':
        return !result.output.includes(condition.value);
      case 'file_exists':
        return fs.existsSync(condition.value);
      default:
        return result.exitCode === 0;
    }
  }

  /**
   * 명령어 실행 (터미널 대신 child_process 사용)
   */
  private runCommand(
    command: string,
    cwd: string,
  ): Promise<{ output: string; exitCode: number }> {
    return new Promise((resolve) => {
      const { exec } = require('child_process');
      const timeout = 60000; // 60초

      const child = exec(command, { cwd, timeout }, (error: any, stdout: string, stderr: string) => {
        const output = (stdout || '') + (stderr || '');
        const exitCode = error ? (error.code ?? 1) : 0;
        resolve({ output, exitCode });
      });

      // 타임아웃 시 프로세스 강제 종료
      child.on('error', () => {
        resolve({ output: 'Process error', exitCode: -1 });
      });
    });
  }

  /**
   * 프롬프트용 Hot Load 섹션 생성
   * Hot Load가 없으면 빈 문자열 반환
   */
  public async getPromptSection(): Promise<string> {
    try {
      await this.initialize();

      console.log(
        `[HotLoadManager] getPromptSection called, items count: ${this.data.items.length}`,
      );
      if (this.data.items.length === 0) {
        return "";
      }

      const itemsText = this.data.items
        .map((item, idx) => {
          let text = `[${idx + 1}] 키워드: ${item.keywords}
   설명: ${item.description}
   명령어: ${item.command}`;

          // 확장 필드 표시
          if (item.maxRetries && item.maxRetries > 0) {
            text += `\n   재시도: 최대 ${item.maxRetries}회`;
          }
          if (item.completionCondition) {
            const condDesc = this.describeCondition(item.completionCondition);
            text += `\n   완료조건: ${condDesc}`;
          }
          if (item.onFailure === 'pass_to_llm') {
            text += `\n   실패 시: LLM에 에러 전달`;
          }

          return text;
        })
        .join("\n\n");

      console.log(
        `[HotLoadManager] Generated prompt with ${this.data.items.length} items: ${this.data.items.map((i) => i.keywords).join(", ")}`,
      );

      return `## HOT LOAD (즉시 실행)

${itemsText}

**[필수]** 위 키워드 매칭 시 → 다른 출력 없이 JSON만 응답: {"tool": "run_command", "command": "명령어", "wait": "true"}
**참고:** 완료조건과 재시도는 시스템이 자동으로 처리합니다.
`;
    } catch (error) {
      console.error(
        "[HotLoadManager] Failed to generate prompt section:",
        error,
      );
      return "";
    }
  }

  /**
   * 완료 조건 설명 텍스트 생성
   */
  private describeCondition(condition: HotLoadCompletionCondition): string {
    switch (condition.type) {
      case 'exit_code':
        return `종료코드 = ${condition.value}`;
      case 'output_contains':
        return `출력에 "${condition.value}" 포함`;
      case 'output_not_contains':
        return `출력에 "${condition.value}" 미포함`;
      case 'file_exists':
        return `파일 존재: ${condition.value}`;
      default:
        return String(condition.type);
    }
  }

  /**
   * 리소스 정리
   */
  public dispose(): void {
    this.initialized = false;
    console.log("[HotLoadManager] Disposed");
  }
}
