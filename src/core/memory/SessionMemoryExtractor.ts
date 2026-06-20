/**
 * Session Memory Auto-extraction
 * Automatically extracts key information from conversations and saves to memory.
 * Triggered after each conversation entry is saved, if token threshold is met.
 */

import { LLMManager } from '../managers/model/LLMManager';
import { MemoryManager } from './MemoryManager';
import { UsageMetricsManager } from '../managers/state/UsageMetricsManager';
import { estimateTokens } from '../../utils';

interface ExtractionConfig {
    minTokensForExtraction: number;  // Minimum tokens in session before extraction
    minTurnsSinceLastExtraction: number;  // Minimum turns between extractions
    maxExtractionTokens: number;  // Max tokens for extraction LLM call
}

const DEFAULT_CONFIG: ExtractionConfig = {
    minTokensForExtraction: 20000,
    minTurnsSinceLastExtraction: 5,
    maxExtractionTokens: 500,
};

export class SessionMemoryExtractor {
    private static instance: SessionMemoryExtractor;
    private llmManager: LLMManager;
    private lastExtractionTurn: number = 0;
    private config: ExtractionConfig;

    private constructor(llmManager: LLMManager) {
        this.llmManager = llmManager;
        this.config = DEFAULT_CONFIG;
    }

    static getInstance(llmManager?: LLMManager): SessionMemoryExtractor {
        if (!this.instance && llmManager) {
            this.instance = new SessionMemoryExtractor(llmManager);
        }
        return this.instance;
    }

    /**
     * Check if extraction should run based on thresholds
     */
    shouldExtract(currentTokens: number, currentTurn: number): boolean {
        if (currentTokens < this.config.minTokensForExtraction) return false;
        if (currentTurn - this.lastExtractionTurn < this.config.minTurnsSinceLastExtraction) return false;
        return true;
    }

    /**
     * Extract key information from conversation summary and save to memory
     */
    async extractAndSave(
        conversationSummary: string,
        currentTurn: number,
        abortSignal?: AbortSignal,
    ): Promise<void> {
        if (!conversationSummary || conversationSummary.trim().length < 100) return;

        try {
            console.log(`[SessionMemoryExtractor] Starting extraction at turn ${currentTurn}`);

            const extractionPrompt = `You are a memory extraction assistant. Analyze the conversation summary below and extract ONLY information worth remembering for future sessions.

Extract these types ONLY if genuinely useful:
- **user**: User's role, preferences, expertise level
- **project**: Project decisions, architecture choices, important constraints
- **feedback**: User corrections or confirmed approaches

Rules:
- Output JSON array of objects: [{"type": "user|project|feedback", "name": "short_name", "content": "one-line description"}]
- Maximum 3 items per extraction
- Skip if nothing is worth remembering
- Output [] if no useful memories found

Conversation summary:
${conversationSummary}`;

            const _llmStart = Date.now();
            const response = await this.llmManager.sendMessageWithSystemPrompt(
                'You are a JSON-only extraction assistant. Output only valid JSON arrays.',
                [{ text: extractionPrompt }],
                { signal: abortSignal, maxTokens: this.config.maxExtractionTokens, retry: { querySource: 'background' } },
            );
            try {
                UsageMetricsManager.getInstance().recordLLMCall(Date.now() - _llmStart, estimateTokens(response), true);
            } catch { /* metrics should never break main flow */ }

            // Parse response
            const jsonMatch = response.match(/\[[\s\S]*\]/);
            if (!jsonMatch) {
                console.log('[SessionMemoryExtractor] No JSON array found in response');
                return;
            }

            const memories = JSON.parse(jsonMatch[0]);
            if (!Array.isArray(memories) || memories.length === 0) {
                console.log('[SessionMemoryExtractor] No memories to extract');
                return;
            }

            // Save each memory
            const memoryManager = MemoryManager.getInstance();
            for (const mem of memories.slice(0, 3)) {
                if (mem.type && mem.name && mem.content) {
                    await memoryManager.save({
                        name: `auto_${mem.name}`,
                        type: mem.type,
                        content: mem.content,
                        description: `[자동 추출] ${mem.content.substring(0, 50)}`,
                    });
                    console.log(`[SessionMemoryExtractor] Saved: ${mem.type}/${mem.name}`);
                }
            }

            this.lastExtractionTurn = currentTurn;
            console.log(`[SessionMemoryExtractor] Extraction complete: ${memories.length} memories saved`);
        } catch (error) {
            console.warn('[SessionMemoryExtractor] Extraction failed:', error);
        }
    }

    reset(): void {
        this.lastExtractionTurn = 0;
    }
}
