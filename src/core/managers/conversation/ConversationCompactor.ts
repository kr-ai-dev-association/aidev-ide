/**
 * ConversationCompactor - 대화 컨텍스트 자동 압축/요약 관리
 *
 * 코드 어시스턴트에서 널리 사용되는 하이브리드 방식 구현:
 * - 토큰 임계값 초과 시 자동 트리거
 * - 오래된 대화를 LLM으로 요약
 * - 최근 대화는 원본 유지
 * - 시스템 프롬프트 + 요약 + 최근 대화 구조
 */

import { LLMManager } from "../model/LLMManager";
import { StateManager } from "../state/StateManager";
import { estimateTokens } from "../../../utils";
import { getSummarizationPrompt } from "../context/prompts/task";
import { SummarizationOptions } from "../context/types/contextHistory";
import { AgentConfig } from "../../config/AgentConfig";
import { StringUtils } from "../../utils/StringUtils";
import { getCompactSummarizationPrompt } from "../context/prompts/rules";
import { PromptComposer, RulePrecedence } from "../context/prompts/PromptComposer";
import { Part } from "../../../services/types";

export interface ConversationMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: number;
}

export interface CompactionResult {
  compacted: boolean;
  originalTokens: number;
  compactedTokens: number;
  summary?: string;
  recentMessages: Part[];
  savedTokens: number;
}

export interface CompactorConfig {
  /** 압축 트리거 토큰 임계값 (기본: 최대 토큰의 80%) */
  tokenThreshold: number;
  /** 원본 유지할 최근 메시지 수 (기본: 6) */
  keepRecentCount: number;
  /** 요약 시 포함할 옵션 */
  summarizationOptions: SummarizationOptions;
  /** 압축 활성화 여부 */
  enabled: boolean;
}

const DEFAULT_CONFIG: CompactorConfig = {
  tokenThreshold: AgentConfig.COMPACTION_TOKEN_THRESHOLD,
  keepRecentCount: 4,
  summarizationOptions: {
    includeTechnicalDetails: true,
    includeCodeSnippets: true,
    includeFileChanges: true,
    maxSummaryLength: 4000,
  },
  enabled: true,
};

export class ConversationCompactor {
  private static instance: ConversationCompactor;
  private llmManager: LLMManager;
  private stateManager: StateManager | null = null;
  private config: CompactorConfig;
  private lastSummary: string | null = null;
  private compactionHistory: Array<{
    timestamp: number;
    originalTokens: number;
    compactedTokens: number;
  }> = [];
  private consecutiveCompactFailures = 0;

  private constructor(
    llmManager: LLMManager,
    config?: Partial<CompactorConfig>,
  ) {
    this.llmManager = llmManager;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  public static getInstance(
    llmManager?: LLMManager,
    config?: Partial<CompactorConfig>,
  ): ConversationCompactor {
    if (!ConversationCompactor.instance && llmManager) {
      ConversationCompactor.instance = new ConversationCompactor(
        llmManager,
        config,
      );
    }
    return ConversationCompactor.instance!;
  }

  /**
   * StateManager 설정 (모델 라우팅에 사용)
   */
  public setStateManager(stateManager: StateManager): void {
    this.stateManager = stateManager;
    console.log("[ConversationCompactor] StateManager configured for model routing");
  }

  /**
   * 현재 대화가 압축이 필요한지 확인
   */
  public needsCompaction(
    userParts: Part[],
    systemPrompt: string,
    maxTokens: number,
  ): boolean {
    if (!this.config.enabled) {
      return false;
    }

    const SUMMARY_RESERVED_TOKENS = 20000;
    const AUTOCOMPACT_BUFFER_TOKENS = 13000; // Extra buffer to prevent frequent re-compaction
    const effectiveMaxTokens = maxTokens - SUMMARY_RESERVED_TOKENS - AUTOCOMPACT_BUFFER_TOKENS;
    const totalTokens = this.calculateTotalTokens(userParts, systemPrompt);
    const threshold = effectiveMaxTokens * this.config.tokenThreshold;

    console.log(
      `[ConversationCompactor] Token check: ${totalTokens}/${maxTokens} (threshold: ${threshold})`,
    );

    return totalTokens > threshold;
  }

  /**
   * 대화 컨텍스트 압축 수행
   *
   * 전략:
   * 1. 최근 N개 메시지는 원본 유지
   * 2. 나머지 오래된 메시지는 LLM으로 요약
   * 3. [요약] + [최근 메시지] 구조로 재구성
   */
  public async compact(
    userParts: Part[],
    systemPrompt: string,
    maxTokens: number,
    abortSignal?: AbortSignal,
  ): Promise<CompactionResult> {
    // Circuit breaker: skip compaction after 3 consecutive failures
    if (this.consecutiveCompactFailures >= 3) {
      console.warn(
        `[ConversationCompactor] Circuit breaker: skipping compaction after ${this.consecutiveCompactFailures} consecutive failures`,
      );
      const skipTokens = this.calculateTotalTokens(userParts, systemPrompt);
      return {
        compacted: false,
        originalTokens: skipTokens,
        compactedTokens: skipTokens,
        recentMessages: userParts,
        savedTokens: 0,
      };
    }

    const originalTokens = this.calculateTotalTokens(userParts, systemPrompt);

    // 압축이 필요없으면 원본 반환
    if (!this.needsCompaction(userParts, systemPrompt, maxTokens)) {
      return {
        compacted: false,
        originalTokens,
        compactedTokens: originalTokens,
        recentMessages: userParts,
        savedTokens: 0,
      };
    }

    console.log(
      `[ConversationCompactor] Starting compaction. Original tokens: ${originalTokens}`,
    );

    // 최근 메시지와 요약 대상 분리
    const keepCount = Math.min(this.config.keepRecentCount, userParts.length);
    const recentMessages = userParts.slice(-keepCount);
    const messagesToSummarize = userParts.slice(0, -keepCount);

    // 요약할 메시지가 없으면 원본 반환
    if (messagesToSummarize.length === 0) {
      console.log(
        "[ConversationCompactor] No messages to summarize, skipping compaction",
      );
      return {
        compacted: false,
        originalTokens,
        compactedTokens: originalTokens,
        recentMessages: userParts,
        savedTokens: 0,
      };
    }

    try {
      // Strip inline images before summarization (save tokens)
      const strippedMessages = messagesToSummarize.map(part => {
        if (part.inlineData) {
          return { text: `[image: ${part.inlineData.mimeType || 'unknown'}]` };
        }
        return part;
      });

      // LLM을 사용해 오래된 대화 요약
      let summary = await this.generateSummary(
        strippedMessages,
        abortSignal,
      );
      this.lastSummary = summary;

      // Re-inject essential rules after compression
      const essentialRules = PromptComposer.getEssentialRules();
      if (essentialRules.length > 0) {
          const essentialText = essentialRules
              .map(r => `[Essential Rule: ${r.key}]\n${r.content}`)
              .join('\n\n');
          // Prepend essential rules to the summary
          summary = `${essentialText}\n\n${summary}`;
      }

      // 요약을 새 userParts의 첫 번째 메시지로 추가
      const compactedParts = [
        {
          text: `[Previous conversation summary]\n${summary}\n\n[End of summary - recent conversation follows below]`,
        },
        ...recentMessages,
      ];

      const compactedTokens = this.calculateTotalTokens(
        compactedParts,
        systemPrompt,
      );
      const savedTokens = originalTokens - compactedTokens;

      // 압축 히스토리 기록
      this.compactionHistory.push({
        timestamp: Date.now(),
        originalTokens,
        compactedTokens,
      });

      this.consecutiveCompactFailures = 0;

      console.log(
        `[ConversationCompactor] Compaction complete. Saved ${savedTokens} tokens (${originalTokens} -> ${compactedTokens})`,
      );

      return {
        compacted: true,
        originalTokens,
        compactedTokens,
        summary,
        recentMessages: compactedParts,
        savedTokens,
      };
    } catch (error) {
      this.consecutiveCompactFailures++;
      console.error(
        `[ConversationCompactor] Compaction failed (consecutiveFailures=${this.consecutiveCompactFailures}), using fallback strategy:`,
        error,
      );

      // 폴백: LLM 요약 실패 시 점진적 제거 적용
      return this.fallbackCompaction(userParts, systemPrompt, originalTokens, maxTokens);
    }
  }

  /**
   * 강제 압축 실행 (슬래시 명령어용, 임계값 무시)
   * @param userParts 압축할 대화 내용
   * @param maxTokens 최대 토큰 수
   */
  public async forceCompact(
    userParts: Part[],
    maxTokens: number,
  ): Promise<CompactionResult> {
    // 메시지가 충분하지 않으면 압축 불가
    if (userParts.length < 3) {
      console.log(
        "[ConversationCompactor] Force compact - not enough messages",
      );
      return {
        compacted: false,
        originalTokens: 0,
        compactedTokens: 0,
        recentMessages: userParts,
        savedTokens: 0,
      };
    }

    const originalTokens = this.calculateTotalTokens(userParts, "");
    console.log(
      `[ConversationCompactor] Force compact starting. Messages: ${userParts.length}, Tokens: ${originalTokens}`,
    );

    // 최근 메시지와 요약 대상 분리 (keepRecentCount 사용)
    const keepCount = Math.min(
      this.config.keepRecentCount,
      Math.max(2, Math.floor(userParts.length / 2)),
    );
    const recentMessages = userParts.slice(-keepCount);
    const messagesToSummarize = userParts.slice(0, -keepCount);

    if (messagesToSummarize.length === 0) {
      console.log(
        "[ConversationCompactor] Force compact - all messages are recent, nothing to summarize",
      );
      return {
        compacted: false,
        originalTokens,
        compactedTokens: originalTokens,
        recentMessages: userParts,
        savedTokens: 0,
      };
    }

    try {
      // LLM을 사용해 오래된 대화 요약
      const summary = await this.generateSummary(messagesToSummarize);
      this.lastSummary = summary;

      // 요약을 새 userParts의 첫 번째 메시지로 추가
      const compactedParts = [
        { text: `[Previous conversation summary]:\n${summary}` },
        ...recentMessages,
      ];

      const compactedTokens = this.calculateTotalTokens(compactedParts, "");
      const savedTokens = originalTokens - compactedTokens;

      // 압축 히스토리 기록
      this.compactionHistory.push({
        timestamp: Date.now(),
        originalTokens,
        compactedTokens,
      });

      console.log(
        `[ConversationCompactor] Force compact complete. Saved ${savedTokens} tokens (${originalTokens} -> ${compactedTokens})`,
      );

      return {
        compacted: true,
        originalTokens,
        compactedTokens,
        summary,
        recentMessages: compactedParts,
        savedTokens,
      };
    } catch (error) {
      console.error("[ConversationCompactor] Force compact failed:", error);
      return {
        compacted: false,
        originalTokens,
        compactedTokens: originalTokens,
        recentMessages: userParts,
        savedTokens: 0,
      };
    }
  }

  /**
   * LLM을 사용해 대화 요약 생성
   * StateManager가 설정된 경우 compactorModel 사용, 아니면 메인 모델 사용
   */
  private async generateSummary(
    messagesToSummarize: Part[],
    abortSignal?: AbortSignal,
  ): Promise<string> {
    console.log(
      `[ConversationCompactor] 요약 생성 시작 - ${messagesToSummarize.length}개 메시지 요약 중...`,
    );
    const startTime = Date.now();

    // 메시지들을 문자열로 변환
    const conversationText = messagesToSummarize
      .map((part, index) => {
        const role = index % 2 === 0 ? "User" : "Assistant";
        return `[${role}]: ${part.text || JSON.stringify(part)}`;
      })
      .join("\n\n");

    const inputTokens = estimateTokens(conversationText);
    // 요약 토큰 상한: 입력의 50% 또는 최대 2000토큰 (Claude Code: 20K이지만 로컬 모델은 더 작게)
    const maxSummaryTokens = Math.min(Math.floor(inputTokens * 0.5), 2000);
    console.log(
      `[ConversationCompactor] 요약 입력 토큰: ${inputTokens.toLocaleString()}, 요약 상한: ${maxSummaryTokens}`,
    );

    // 요약 프롬프트 생성
    const summarizationPrompt = getCompactSummarizationPrompt();

    const userParts = [
      {
        text: `Summarize the following conversation:\n\n${conversationText}`,
      },
    ];

    // StateManager가 있으면 compactorModel 사용, 없으면 메인 모델 사용
    let response: string;
    const llmOptions = { signal: abortSignal, maxTokens: maxSummaryTokens };
    if (this.stateManager) {
      response = await this.llmManager.sendMessageWithCompactorModel(
        summarizationPrompt,
        userParts,
        this.stateManager,
        llmOptions,
      );
    } else {
      response = await this.llmManager.sendMessageWithSystemPrompt(
        summarizationPrompt,
        userParts,
        llmOptions,
      );
    }

    const summary = this.extractSummaryFromResponse(response);
    const outputTokens = estimateTokens(summary);
    const elapsed = Date.now() - startTime;

    console.log(
      `[ConversationCompactor] 요약 생성 완료 - 출력 토큰: ${outputTokens.toLocaleString()}, 소요시간: ${elapsed}ms`,
    );

    return summary;
  }

  /**
   * LLM 응답에서 요약 텍스트 추출
   */
  private extractSummaryFromResponse(response: string): string {
    // JSON 형태로 래핑된 경우 파싱 시도
    try {
      if (response.startsWith("{")) {
        const parsed = JSON.parse(response);
        return parsed.response || parsed.content || parsed.summary || response;
      }
    } catch (e) {
      // JSON 파싱 실패 시 원본 사용
    }

    // Strip <analysis> blocks (used for chain-of-thought, not kept in summary)
    response = response.replace(/<analysis>[\s\S]*?<\/analysis>/gi, '').trim();

    // StringUtils를 사용하여 thinking 태그 및 기타 불필요한 내용 제거
    return StringUtils.cleanText(response, {
      removeThinking: true,
      removeNaturalLanguage: false, // 요약은 자연어이므로 제거하지 않음
      removeSystemMessages: false,
      removeToolTags: true,
      removeJsonThinking: true,
      extractJson: false,
    }).trim();
  }

  /**
   * Tier 1: 도구 결과 경량 트림 (LLM 호출 없음)
   * 오래된 도구 결과(read_file 내용, glob/ripgrep 결과 등)를 짧은 요약으로 교체
   * 최근 keepRecentCount 이내 메시지는 원본 유지
   */
  public trimToolResults(
    userParts: Part[],
    systemPrompt: string,
    maxTokens: number,
  ): { trimmed: boolean; parts: Part[]; savedTokens: number } {
    if (!this.config.enabled) {
      return { trimmed: false, parts: userParts, savedTokens: 0 };
    }

    const totalTokens = this.calculateTotalTokens(userParts, systemPrompt);
    const threshold = maxTokens * 0.6; // 60% 이상일 때 트림 시작

    if (totalTokens <= threshold) {
      return { trimmed: false, parts: userParts, savedTokens: 0 };
    }

    // 최근 메시지는 보호 (but large tool results in protected area are still truncated)
    const protectedCount = Math.min(this.config.keepRecentCount, userParts.length);
    const trimTarget = userParts.length - protectedCount;

    if (trimTarget <= 0 && totalTokens <= maxTokens * 0.75) {
      return { trimmed: false, parts: userParts, savedTokens: 0 };
    }

    // Step 1: Deduplicate read_file results (Cline-style optimization)
    // Keep only the latest read of each file, replace older ones with placeholder
    const fileReadPositions = new Map<string, number[]>(); // filePath -> [indices]
    for (let i = 0; i < userParts.length; i++) {
      const text = userParts[i].text || '';
      // Detect read_file results by line-numbered content pattern
      const pathMatch = text.match(/(?:file|path)[:\s]*[`"]?([^\s`"]+\.\w{1,6})/i)
        || text.match(/^([^\s]+\.\w{1,5})\s*[\(:|]/m);
      if (pathMatch && /^\d+[→│|]/m.test(text)) {
        const fp = pathMatch[1];
        const positions = fileReadPositions.get(fp) || [];
        positions.push(i);
        fileReadPositions.set(fp, positions);
      }
    }

    let trimmed = false;
    const newParts = [...userParts];

    // Replace older duplicate file reads with placeholder (keep latest only)
    for (const [fp, positions] of fileReadPositions) {
      if (positions.length <= 1) continue;
      // Keep the last position, replace all others
      for (let j = 0; j < positions.length - 1; j++) {
        const idx = positions[j];
        if (idx >= userParts.length - protectedCount) continue; // Don't touch protected area
        newParts[idx] = {
          text: `[File previously read: ${fp} — see latest read below]`,
        };
        trimmed = true;
      }
    }

    // Step 2: Trim old tool results (non-protected area)
    const toolResultPatterns = [
      { pattern: /^```[\s\S]{500,}```/m, label: 'code block' },
      { pattern: /^(Search results|Found \d+)/m, label: 'search results' },
      { pattern: /^\[?(read_file|glob_search|ripgrep_search)\]?\s*result/mi, label: 'tool result' },
    ];

    for (let i = 0; i < trimTarget; i++) {
      const part = newParts[i];
      if (!part.text || part.text.length < 500) continue;
      if (part.text.startsWith('[Previous conversation summary]') || part.text.startsWith('[System]') || part.text.startsWith('[File previously read:')) continue;

      // Skip if this is the latest read of a file (already handled by dedup)
      const isLatestRead = [...fileReadPositions.values()].some(positions => positions[positions.length - 1] === i);
      if (isLatestRead) continue;

      // File path extraction
      const filePathMatch = part.text.match(/(?:file|path)[:\s]*[`"]?([^\s`"]+\.\w+)/i)
        || part.text.match(/^([^\s]+\.\w{1,5})\s*[\(:|]/m);
      const filePath = filePathMatch ? filePathMatch[1] : '';

      // Tool result pattern matching
      let matched = false;
      for (const { pattern, label } of toolResultPatterns) {
        if (pattern.test(part.text)) {
          const lineCount = part.text.split('\n').length;
          newParts[i] = {
            text: `[Previous ${label} omitted: ${filePath || '(path unknown)'} - ${lineCount} lines, content omitted]`,
          };
          matched = true;
          trimmed = true;
          break;
        }
      }

      // Truncate large content even without pattern match
      if (!matched && part.text.length > 2000) {
        const preview = part.text.substring(0, 200);
        const lineCount = part.text.split('\n').length;
        newParts[i] = {
          text: `[Previous content truncated - ${lineCount} lines]\n${preview}\n... [rest omitted]`,
        };
        trimmed = true;
      }
    }

    // Also truncate oversized tool results in protected (recent) area
    // But preserve the latest read of each file (needed for accurate update_file SEARCH blocks)
    const PROTECTED_MAX_CHARS = 3000;
    for (let i = Math.max(0, trimTarget); i < newParts.length; i++) {
      const part = newParts[i];
      if (!part.text || part.text.length <= PROTECTED_MAX_CHARS) continue;
      if (part.text.startsWith('[Previous conversation summary]') || part.text.startsWith('[File previously read:')) continue;

      // Skip if this is the latest read of any file (preserve for update_file accuracy)
      const isLatestFileRead = [...fileReadPositions.values()].some(positions => positions[positions.length - 1] === i);
      if (isLatestFileRead) continue;

      // Check if it looks like a tool result (search results, command output — NOT file content)
      const hasNonFileToolMarkers = /^```|^\[?(glob_search|ripgrep_search|run_command)\]?/m.test(part.text);
      if (hasNonFileToolMarkers) {
        const head = part.text.substring(0, 1500);
        const tail = part.text.substring(part.text.length - 1000);
        const lineCount = part.text.split('\n').length;
        newParts[i] = {
          text: `${head}\n\n... [truncated: ${lineCount} lines, ${part.text.length.toLocaleString()} chars total] ...\n\n${tail}`,
        };
        trimmed = true;
      }
    }

    if (!trimmed) {
      return { trimmed: false, parts: userParts, savedTokens: 0 };
    }

    const newTokens = this.calculateTotalTokens(newParts, systemPrompt);
    const savedTokens = totalTokens - newTokens;

    console.log(
      `[ConversationCompactor] Tier1 trim: ${savedTokens} tokens saved (${totalTokens} → ${newTokens})`,
    );

    return { trimmed: true, parts: newParts, savedTokens };
  }

  /**
   * 폴백 압축 전략: 점진적 제거 (cliff drop 방지)
   * 가장 오래된 25%씩 제거, threshold 이하가 될 때까지 반복 (최대 3라운드)
   */
  private fallbackCompaction(
    userParts: Part[],
    systemPrompt: string,
    originalTokens: number,
    maxTokens?: number,
  ): CompactionResult {
    console.log(
      "[ConversationCompactor] Using gradual fallback strategy",
    );

    let currentParts = [...userParts];
    const targetTokens = maxTokens ? maxTokens * this.config.tokenThreshold : originalTokens * 0.5;
    const maxRounds = 3;

    for (let round = 0; round < maxRounds; round++) {
      // 최소 4개는 유지
      if (currentParts.length <= 4) break;

      // 25%씩 오래된 것부터 제거
      const removeCount = Math.max(1, Math.floor(currentParts.length * 0.25));
      const droppedCount = removeCount;
      const remaining = currentParts.slice(removeCount);

      // 첫 라운드에서만 시스템 메시지 추가
      if (round === 0) {
        currentParts = [
          {
            text: `[System] Context optimized: previous messages have been progressively cleaned up. If you need any information, please ask again.`,
          },
          ...remaining,
        ];
      } else {
        currentParts = remaining;
      }

      const currentTokens = this.calculateTotalTokens(currentParts, systemPrompt);
      console.log(
        `[ConversationCompactor] Fallback round ${round + 1}: removed ${droppedCount}, remaining ${currentParts.length}, tokens ${currentTokens}`,
      );

      if (currentTokens <= targetTokens) break;
    }

    const compactedTokens = this.calculateTotalTokens(currentParts, systemPrompt);

    return {
      compacted: true,
      originalTokens,
      compactedTokens,
      recentMessages: currentParts,
      savedTokens: originalTokens - compactedTokens,
    };
  }

  /**
   * 토큰 수 계산
   */
  public calculateTotalTokens(userParts: Part[], systemPrompt: string): number {
    let totalTokens = estimateTokens(systemPrompt);

    for (const part of userParts) {
      if (part.text) {
        totalTokens += estimateTokens(part.text);
      } else if (typeof part === "string") {
        totalTokens += estimateTokens(part);
      }
    }

    return totalTokens;
  }

  /**
   * 설정 업데이트
   */
  public updateConfig(config: Partial<CompactorConfig>): void {
    this.config = { ...this.config, ...config };
    console.log("[ConversationCompactor] Config updated:", this.config);
  }

  /**
   * 압축 활성화/비활성화
   */
  public setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    console.log(
      `[ConversationCompactor] Compaction ${enabled ? "enabled" : "disabled"}`,
    );
  }

  /**
   * 마지막 요약 조회
   */
  public getLastSummary(): string | null {
    return this.lastSummary;
  }

  /**
   * 압축 히스토리 조회
   */
  public getCompactionHistory(): typeof this.compactionHistory {
    return [...this.compactionHistory];
  }

  /**
   * 압축 통계 조회
   */
  public getStats(): {
    totalCompactions: number;
    totalSavedTokens: number;
    averageSavings: number;
  } {
    if (this.compactionHistory.length === 0) {
      return {
        totalCompactions: 0,
        totalSavedTokens: 0,
        averageSavings: 0,
      };
    }

    const totalSaved = this.compactionHistory.reduce(
      (sum, h) => sum + (h.originalTokens - h.compactedTokens),
      0,
    );

    return {
      totalCompactions: this.compactionHistory.length,
      totalSavedTokens: totalSaved,
      averageSavings: totalSaved / this.compactionHistory.length,
    };
  }

  /**
   * 상태 초기화
   */
  public reset(): void {
    this.lastSummary = null;
    this.compactionHistory = [];
    console.log("[ConversationCompactor] State reset");
  }

  /**
   * 텍스트로부터 직접 요약 생성 (SessionManager 통합용)
   * StateManager가 설정된 경우 compactorModel 사용
   */
  public async generateSummaryFromText(
    conversationText: string,
    abortSignal?: AbortSignal,
  ): Promise<string> {
    const summarizationPrompt = getCompactSummarizationPrompt();
    const userParts = [
      { text: `Summarize the following conversation:\n\n${conversationText}` },
    ];

    // 요약 토큰 상한: 입력의 50% 또는 최대 2000토큰
    const inputTokens = estimateTokens(conversationText);
    const maxSummaryTokens = Math.min(Math.floor(inputTokens * 0.5), 2000);

    // StateManager가 있으면 compactorModel 사용, 없으면 메인 모델 사용
    let response: string;
    const llmOptions = { signal: abortSignal, maxTokens: maxSummaryTokens };
    if (this.stateManager) {
      response = await this.llmManager.sendMessageWithCompactorModel(
        summarizationPrompt,
        userParts,
        this.stateManager,
        llmOptions,
      );
    } else {
      response = await this.llmManager.sendMessageWithSystemPrompt(
        summarizationPrompt,
        userParts,
        llmOptions,
      );
    }

    return this.extractSummaryFromResponse(response);
  }

  // ===== 세션 요약 (여러 대화 누적 시) =====

  /**
   * 세션 요약이 필요한지 확인
   */
  public needsSessionCompaction(
    totalTokensUsed: number,
    maxTokens: number,
  ): boolean {
    if (!this.config.enabled) {
      return false;
    }

    const threshold = maxTokens * this.config.tokenThreshold;
    console.log(
      `[ConversationCompactor] Session token check: ${totalTokensUsed}/${maxTokens} (threshold: ${threshold})`,
    );

    return totalTokensUsed > threshold;
  }

  /**
   * 세션의 대화 히스토리를 요약
   */
  public async compactSessionHistory(
    conversationHistory: Array<{
      type: string;
      content: string;
      timestamp?: number;
    }>,
    maxTokens: number,
    abortSignal?: AbortSignal,
  ): Promise<{
    compacted: boolean;
    summary: string;
    keepEntries: Array<{ type: string; content: string; timestamp?: number }>;
    savedTokens: number;
  }> {
    if (conversationHistory.length <= this.config.keepRecentCount) {
      return {
        compacted: false,
        summary: "",
        keepEntries: conversationHistory,
        savedTokens: 0,
      };
    }

    // 원본 토큰 계산
    let originalTokens = 0;
    conversationHistory.forEach((entry) => {
      originalTokens += estimateTokens(entry.content || "");
    });

    // 요약할 메시지와 유지할 메시지 분리
    const keepCount = Math.min(
      this.config.keepRecentCount,
      conversationHistory.length,
    );
    const keepEntries = conversationHistory.slice(-keepCount);
    const entriesToSummarize = conversationHistory.slice(0, -keepCount);

    if (entriesToSummarize.length === 0) {
      return {
        compacted: false,
        summary: "",
        keepEntries: conversationHistory,
        savedTokens: 0,
      };
    }

    console.log(
      `[ConversationCompactor] Session compaction: summarizing ${entriesToSummarize.length} entries, keeping ${keepCount} recent`,
    );

    try {
      // 요약 생성
      const conversationText = entriesToSummarize
        .map(
          (entry) =>
            `[${entry.type === "user" ? "User" : "Assistant"}]: ${entry.content}`,
        )
        .join("\n\n");

      const summarizationPrompt = getCompactSummarizationPrompt();
      const userParts = [
        { text: `Summarize the following conversation:\n\n${conversationText}` },
      ];

      // StateManager가 있으면 compactorModel 사용, 없으면 메인 모델 사용
      let response: string;
      if (this.stateManager) {
        response = await this.llmManager.sendMessageWithCompactorModel(
          summarizationPrompt,
          userParts,
          this.stateManager,
          { signal: abortSignal },
        );
      } else {
        response = await this.llmManager.sendMessageWithSystemPrompt(
          summarizationPrompt,
          userParts,
          { signal: abortSignal },
        );
      }

      const summary = this.extractSummaryFromResponse(response);
      const summaryTokens = estimateTokens(summary);
      let keepTokens = 0;
      keepEntries.forEach((entry) => {
        keepTokens += estimateTokens(entry.content || "");
      });

      const savedTokens = originalTokens - summaryTokens - keepTokens;
      console.log(
        `[ConversationCompactor] Session compacted. Saved ${savedTokens} tokens (${originalTokens} → ${summaryTokens + keepTokens})`,
      );

      return {
        compacted: true,
        summary,
        keepEntries,
        savedTokens,
      };
    } catch (error) {
      console.error(
        "[ConversationCompactor] Session compaction failed:",
        error,
      );
      return {
        compacted: false,
        summary: "",
        keepEntries: conversationHistory,
        savedTokens: 0,
      };
    }
  }
}
