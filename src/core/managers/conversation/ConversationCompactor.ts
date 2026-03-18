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
  keepRecentCount: 12,
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

    const totalTokens = this.calculateTotalTokens(userParts, systemPrompt);
    const threshold = maxTokens * this.config.tokenThreshold;

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
      // LLM을 사용해 오래된 대화 요약
      const summary = await this.generateSummary(
        messagesToSummarize,
        abortSignal,
      );
      this.lastSummary = summary;

      // 요약을 새 userParts의 첫 번째 메시지로 추가
      const compactedParts = [
        {
          text: `[이전 대화 요약]\n${summary}\n\n[이전 대화 요약 끝 - 아래는 최근 대화입니다]`,
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
      console.error(
        "[ConversationCompactor] Compaction failed, using fallback strategy:",
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
        { text: `[이전 대화 요약]:\n${summary}` },
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
    console.log(
      `[ConversationCompactor] 요약 입력 토큰: ${inputTokens.toLocaleString()}`,
    );

    // 요약 프롬프트 생성
    const summarizationPrompt = getCompactSummarizationPrompt();

    const userParts = [
      {
        text: `다음 대화를 요약해주세요:\n\n${conversationText}`,
      },
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

    // 최근 메시지는 보호
    const protectedCount = Math.min(this.config.keepRecentCount, userParts.length);
    const trimTarget = userParts.length - protectedCount;

    if (trimTarget <= 0) {
      return { trimmed: false, parts: userParts, savedTokens: 0 };
    }

    // 도구 결과 패턴 (read_file 내용, glob 결과, ripgrep 결과 등)
    const toolResultPatterns = [
      { pattern: /^```[\s\S]{500,}```/m, label: '코드 블록' },
      { pattern: /^\d+[→│\|].+(\n\d+[→│\|].+){10,}/m, label: '파일 내용' },
      { pattern: /^(검색 결과|Search results|Found \d+|파일 목록)/m, label: '검색 결과' },
      { pattern: /^\[?(read_file|glob_search|ripgrep_search)\]?\s*결과/mi, label: '도구 결과' },
    ];

    let trimmed = false;
    const newParts = [...userParts];

    for (let i = 0; i < trimTarget; i++) {
      const part = newParts[i];
      if (!part.text || part.text.length < 500) continue;

      // 이전 대화 요약은 건드리지 않음
      if (part.text.startsWith('[이전 대화 요약]') || part.text.startsWith('[시스템]')) continue;

      // 파일 경로 추출 시도
      const filePathMatch = part.text.match(/(?:파일|file|path)[:\s]*[`"]?([^\s`"]+\.\w+)/i)
        || part.text.match(/^([^\s]+\.\w{1,5})\s*(?:\(|의|:)/m);
      const filePath = filePathMatch ? filePathMatch[1] : '';

      // 도구 결과 패턴 매칭
      let matched = false;
      for (const { pattern, label } of toolResultPatterns) {
        if (pattern.test(part.text)) {
          const lineCount = part.text.split('\n').length;
          newParts[i] = {
            text: `[이전 ${label} 생략: ${filePath || '(경로 미확인)'} — ${lineCount}줄, 내용 생략됨]`,
          };
          matched = true;
          trimmed = true;
          break;
        }
      }

      // 패턴 매치 안 되더라도 500자 이상이고 보호 영역 밖이면 축약
      if (!matched && part.text.length > 2000) {
        const preview = part.text.substring(0, 200);
        const lineCount = part.text.split('\n').length;
        newParts[i] = {
          text: `[이전 내용 축약 — ${lineCount}줄]\n${preview}\n... [이하 생략]`,
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
            text: `[시스템] 컨텍스트 최적화: 이전 메시지가 점진적으로 정리되었습니다. 필요한 정보가 있으면 다시 요청해주세요.`,
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
      { text: `다음 대화를 요약해주세요:\n\n${conversationText}` },
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
        { text: `다음 대화를 요약해주세요:\n\n${conversationText}` },
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
