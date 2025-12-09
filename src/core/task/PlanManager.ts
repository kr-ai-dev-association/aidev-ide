/**
 * Plan Manager
 * 플랜 생성 및 파싱을 담당하는 서비스
 * TaskManager와 함께 사용하여 작업 계획을 관리
 */

import { SettingsManager } from '../state/SettingsManager';
import { LLMApiClient } from '../model/LLMApiClient';
import { AiModelType } from '../../services';

export interface PlanItem {
    title: string;
    detail?: string;
}

export class PlanManager {
    private static instance: PlanManager;
    private llmService?: LLMApiClient;
    private currentModelType: AiModelType = AiModelType.GEMINI;

    private constructor() {
        console.log('[PlanManager] Initialized');
    }

    public static getInstance(): PlanManager {
        if (!PlanManager.instance) {
            PlanManager.instance = new PlanManager();
        }
        return PlanManager.instance;
    }

    /**
     * LLM Service를 설정합니다
     */
    public setLLMService(llmService: LLMApiClient, modelType: AiModelType): void {
        this.llmService = llmService;
        this.currentModelType = modelType;
    }

    /**
     * 사용자 지시를 액션으로 분할합니다
     */
    public async splitUserInstructionIntoActions(
        userQuery: string,
        extensionContext?: any,
        geminiApi?: any,
        ollamaApi?: any,
        abortSignal?: AbortSignal
    ): Promise<string[]> {
        // 20자 이하인 경우 분리하지 않음
        if (userQuery.length <= 20) {
            return [userQuery];
        }

        const lang = (await SettingsManager.getInstance().getLanguage?.()) || 'ko';
        const forceKorean = lang.toLowerCase().startsWith('ko');

        const splitPrompt = forceKorean
            ? `다음 사용자 지시사항을 행위 단위로 분리하세요. 각 행위는 독립적으로 실행 가능한 단위여야 합니다.

사용자 지시사항:
"""
${userQuery}
"""

요구사항:
- 각 행위를 하나의 문장으로 표현하세요.
- 행위는 동사로 시작하는 명확한 액션으로 작성하세요.
- 각 행위는 순서대로 번호를 매겨주세요.
- JSON 배열 형식으로 출력하세요.

출력 형식 (JSON):
{
  "actions": [
    "첫 번째 행위",
    "두 번째 행위",
    "세 번째 행위"
  ]
}`
            : `Split the following user instruction into action units. Each action should be independently executable.

User instruction:
"""
${userQuery}
"""

Requirements:
- Express each action as a single sentence.
- Actions should start with a verb and be clear actions.
- Number each action in order.
- Output in JSON array format.

Output format (JSON):
{
  "actions": [
    "First action",
    "Second action",
    "Third action"
  ]
}`;

        try {
            const parts = [{ text: splitPrompt }];
            const systemPromptForSplit = forceKorean
                ? '행위 단위로 지시사항을 분리하세요. JSON 형식으로 응답하세요.'
                : 'Split instructions into action units. Respond in JSON format.';

            if (!geminiApi && !ollamaApi) {
                return [userQuery];
            }

            let response: string;
            if (this.currentModelType === AiModelType.GEMINI && geminiApi) {
                response = await geminiApi.sendMessageWithSystemPrompt(systemPromptForSplit, parts, { signal: abortSignal });
            } else if (ollamaApi) {
                try { await ollamaApi.loadSettingsFromStorage(); } catch { }
                response = await ollamaApi.sendMessageWithSystemPrompt(systemPromptForSplit, parts, { signal: abortSignal });
            } else {
                return [userQuery];
            }

            // JSON 파싱
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                if (parsed.actions && Array.isArray(parsed.actions) && parsed.actions.length > 0) {
                    console.log(`[PlanManager] Split ${userQuery.length} chars into ${parsed.actions.length} actions`);
                    return parsed.actions;
                }
            }
        } catch (error) {
            console.warn('[PlanManager] Failed to split user instruction:', error);
        }

        // 실패 시 원본 반환
        return [userQuery];
    }

    /**
     * 사용자 질의/키워드/환경을 입력으로 받아 계획 수립 프롬프트를 생성합니다.
     */
    public async buildPlanPrompt(
        userQuery: string,
        keywords: string[],
        os: string,
        modelName: string,
        includedFiles: { name: string, fullPath: string }[]
    ): Promise<string> {
        const topFiles = includedFiles.slice(0, 8).map(f => `- ${f.name} (${f.fullPath})`).join('\n');
        const kw = keywords.join(', ');
        const lang = (await SettingsManager.getInstance().getLanguage?.()) || 'ko';
        const forceKorean = lang.toLowerCase().startsWith('ko');
        const languageRule = forceKorean
            ? '\n- 모든 출력은 한국어로 작성하세요. 영어 표현이 필요한 식별자/코드는 그대로 두되 설명과 계획은 한국어로 작성하세요.'
            : '\n- Write all output in English. Keep identifiers/code in their original language, but write descriptions and plans in English.';

        const prompt = forceKorean
            ? `다음 사용자 요청을 분석하여 단계별 실행 계획을 수립하세요.

사용자 요청:
"""
${userQuery}
"""

프로젝트 컨텍스트:
- OS: ${os}
- 모델: ${modelName}
- 관련 파일:
${topFiles || '(없음)'}
- 키워드: ${kw || '(없음)'}

요구사항:
- 각 단계는 명확하고 실행 가능해야 합니다.
- 단계는 순서대로 번호를 매겨주세요.
- 각 단계는 한 문장으로 간결하게 작성하세요.
- 마크다운 체크박스 형식(- [ ] 단계 설명)으로 작성하세요.
- 최대 10개 단계로 제한하세요.${languageRule}

출력 형식:
- [ ] 1단계: 첫 번째 작업
- [ ] 2단계: 두 번째 작업
- [ ] 3단계: 세 번째 작업
...`
            : `Analyze the following user request and create a step-by-step execution plan.

User request:
"""
${userQuery}
"""

Project context:
- OS: ${os}
- Model: ${modelName}
- Related files:
${topFiles || '(none)'}
- Keywords: ${kw || '(none)'}

Requirements:
- Each step should be clear and executable.
- Number steps in order.
- Write each step concisely in one sentence.
- Write in markdown checkbox format (- [ ] step description).
- Limit to maximum 10 steps.${languageRule}

Output format:
- [ ] Step 1: First task
- [ ] Step 2: Second task
- [ ] Step 3: Third task
...`;

        return prompt;
    }

    /**
     * Plan 텍스트에서 체크박스 항목만 추출하여 작업 큐 아이템으로 변환
     * - [ ] 또는 - [x] 형식의 항목만 파싱
     */
    public parseCheckboxItemsFromPlan(planMarkdown: string): Array<{ title: string, detail?: string }> {
        const lines = planMarkdown.split('\n');
        const items: Array<{ title: string, detail?: string }> = [];
        let itemCount = 0;
        const maxItems = 20; // 최대 파싱 항목 수 제한 (모든 항목 표시를 위해 증가)

        console.log('[PlanManager] parseCheckboxItemsFromPlan 시작, 총 라인 수:', lines.length);
        console.log('[PlanManager] planText 샘플 (처음 500자):', planMarkdown.substring(0, 500));

        for (const raw of lines) {
            if (itemCount >= maxItems) break;

            const line = raw.trim();
            if (!line) continue;

            // 체크박스 형식 우선 파싱 (더 정확한 패턴부터 시도)
            // - [ ] Task
            // - [x] Task  
            // * [ ] Task
            // 숫자. [ ] Task
            // 들여쓰기 포함 형식

            // 가장 일반적인 형식: - [ ] 또는 - [x] (공백이 0개 이상)
            // 패턴: - [ ] 텍스트 또는 - [x] 텍스트
            const checkboxMatch1 = line.match(/^[-*]\s*\[\s*([xX]?)\s*\]\s*(.+)$/);
            if (checkboxMatch1) {
                const title = (checkboxMatch1[2] || '').trim();
                if (title && title.length > 0) {
                    const trimmedTitle = title.length > 100 ? title.substring(0, 97) + '...' : title;
                    items.push({ title: trimmedTitle });
                    itemCount++;
                    console.log(`[PlanManager] 체크박스 항목 파싱 (패턴1): "${line.substring(0, 60)}" -> "${trimmedTitle.substring(0, 50)}..."`);
                    continue;
                }
            }

            // 이모지 체크박스 형식: - ✅ 또는 - ☑️
            const emojiCheckboxMatch = line.match(/^[-*]\s*[✅☑️✓]\s+(.+)$/);
            if (emojiCheckboxMatch) {
                const title = (emojiCheckboxMatch[1] || '').trim();
                if (title && title.length > 0) {
                    const trimmedTitle = title.length > 100 ? title.substring(0, 97) + '...' : title;
                    items.push({ title: trimmedTitle });
                    itemCount++;
                    console.log(`[PlanManager] 이모지 체크박스 항목 파싱: "${line.substring(0, 60)}" -> "${trimmedTitle.substring(0, 50)}..."`);
                    continue;
                }
            }

            // 숫자로 시작하는 체크박스: 1. [ ] Task
            const checkboxMatch2 = line.match(/^\d+\.\s*\[\s*([xX]?)\s*\]\s+(.+)$/);
            if (checkboxMatch2) {
                const title = (checkboxMatch2[2] || '').trim();
                if (title && title.length > 0) {
                    const trimmedTitle = title.length > 100 ? title.substring(0, 97) + '...' : title;
                    items.push({ title: trimmedTitle });
                    itemCount++;
                    console.log(`[PlanManager] 체크박스 항목 파싱 (패턴2): ${trimmedTitle.substring(0, 50)}...`);
                    continue;
                }
            }

            // 들여쓰기 포함:   - [ ] Task
            const checkboxMatch3 = line.match(/^\s+[-*]\s*\[\s*([xX]?)\s*\]\s+(.+)$/);
            if (checkboxMatch3) {
                const title = (checkboxMatch3[2] || '').trim();
                if (title && title.length > 0) {
                    const trimmedTitle = title.length > 100 ? title.substring(0, 97) + '...' : title;
                    items.push({ title: trimmedTitle });
                    itemCount++;
                    console.log(`[PlanManager] 체크박스 항목 파싱 (패턴3): ${trimmedTitle.substring(0, 50)}...`);
                    continue;
                }
            }

            // 체크박스가 없는 경우 일반 불릿 포인트 파싱 (체크박스가 하나도 없을 때만)
            if (items.length === 0 && itemCount < maxItems) {
                // 일반 불릿 포인트: - Task 또는 * Task (단, [ ] 가 없는 경우만)
                if (!line.includes('[') || !line.includes(']')) {
                    const bulletMatch = line.match(/^[-*]\s+(.+)$/);
                    if (bulletMatch) {
                        const title = (bulletMatch[1] || '').trim();
                        if (title && title.length > 0 &&
                            !title.startsWith('**') &&
                            !title.startsWith('##') &&
                            !title.startsWith('[') &&
                            !title.match(/^\d+\./)) {
                            const trimmedTitle = title.length > 100 ? title.substring(0, 97) + '...' : title;
                            items.push({ title: trimmedTitle });
                            itemCount++;
                            console.log(`[PlanManager] 불릿 포인트 항목 파싱: ${trimmedTitle.substring(0, 50)}...`);
                        }
                    }
                }
            }
        }

        console.log(`[PlanManager] parseCheckboxItemsFromPlan 완료: ${items.length}개 항목 파싱`);
        if (items.length > 0) {
            console.log('[PlanManager] 파싱된 모든 항목:', items.map((item, idx) => `${idx + 1}. ${item.title.substring(0, 60)}`));
        }
        return items;
    }

    /**
     * Plan 텍스트에서 일반 항목을 파싱합니다
     */
    public parsePlanToItems(planMarkdown: string): Array<{ title: string, detail?: string }> {
        const lines = planMarkdown.split('\n');
        const items: Array<{ title: string, detail?: string }> = [];
        let itemCount = 0;
        const maxItems = 10; // 최대 파싱 항목 수 제한

        for (const raw of lines) {
            if (itemCount >= maxItems) break;

            const line = raw.trim();
            if (!line) continue;

            // - [ ] Task 또는 - Task, * Task, 1. Task 등 폭넓게 수용
            const match = line.match(/^([-*]|\d+\.)\s*(\[\s*[xX]?\s*\]\s*)?(.*)$/);
            if (match) {
                const title = (match[3] || '').trim();
                if (title) {
                    // 제목이 너무 길면 100자로 제한
                    const trimmedTitle = title.length > 100 ? title.substring(0, 97) + '...' : title;
                    items.push({ title: trimmedTitle });
                    itemCount++;
                }
            }
        }
        return items;
    }

    /**
     * 작업 큐 아이템을 LLM에게 요약 요청하여 간결한 명령어 리스트로 변환
     */
    public async summarizePlanItemsForQueue(
        items: Array<{ title: string, detail?: string }>,
        geminiApi?: any,
        ollamaApi?: any,
        abortSignal?: AbortSignal
    ): Promise<Array<{ title: string, detail?: string }> | null> {
        const lang = (await SettingsManager.getInstance().getLanguage?.()) || 'ko';
        const forceKorean = lang.toLowerCase().startsWith('ko');

        const itemsText = items.map((item, idx) => `${idx + 1}. ${item.title}${item.detail ? ` - ${item.detail}` : ''}`).join('\n');

        const summaryPrompt = forceKorean
            ? `다음 작업 목록을 매우 간결하게 요약하세요.

**중요 요구사항:**
- 전체 요약을 정확히 100자 이하로 작성 (초과 금지)
- 최대 3개의 핵심 명령어만 출력
- 각 명령어는 30자 이내로 매우 간결하게
- 마크다운 불릿 포인트 형식으로만 출력
- 반복되는 내용은 제거하고 핵심만 추출

**출력 형식 (정확히 이 형식으로만):**
- 전체 요약 (100자 이하)
- 명령어 1 (30자 이내)
- 명령어 2 (30자 이내)
- 명령어 3 (30자 이내)

작업 목록:
${itemsText}

출력:`
            : `Summarize the following task list very concisely.

**Critical Requirements:**
- Write a summary in exactly 100 characters or less (no exceed)
- Output maximum 3 core commands only
- Each command should be very concise within 30 characters
- Output only in markdown bullet point format
- Remove repetitive content and extract only core points

**Output format (exactly this format only):**
- Overall summary (100 chars or less)
- Command 1 (30 chars or less)
- Command 2 (30 chars or less)
- Command 3 (30 chars or less)

Task list:
${itemsText}

Output:`;

        try {
            const parts = [{ text: summaryPrompt }];
            const systemPrompt = forceKorean
                ? '작업 목록을 간결한 명령어 리스트로 요약하세요. 100자 이하 요약과 최대 3개의 핵심 명령어만 출력하세요.'
                : 'Summarize task list into concise command list. Output summary under 100 chars and max 3 core commands.';

            if (!geminiApi && !ollamaApi) {
                return null;
            }

            let response: string;
            if (this.currentModelType === AiModelType.GEMINI && geminiApi) {
                response = await geminiApi.sendMessageWithSystemPrompt(systemPrompt, parts, { signal: abortSignal });
            } else if (ollamaApi) {
                try { await ollamaApi.loadSettingsFromStorage(); } catch { }
                response = await ollamaApi.sendMessageWithSystemPrompt(systemPrompt, parts, { signal: abortSignal });
            } else {
                return null;
            }

            if (!response || !response.trim()) {
                return null;
            }

            // 응답에서 요약과 명령어 파싱
            const lines = response.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            const result: Array<{ title: string, detail?: string }> = [];

            // 첫 줄은 요약으로 사용
            let summaryLine = lines[0] || '';
            // 마크다운 불릿 제거
            summaryLine = summaryLine.replace(/^[-*]\s*/, '').trim();
            if (summaryLine && summaryLine.length <= 100) {
                result.push({ title: summaryLine });
            }

            // 나머지 줄에서 명령어 추출 (최대 3개)
            let commandCount = 0;
            for (const line of lines.slice(1)) {
                if (commandCount >= 3) break;
                const cleanLine = line.replace(/^[-*]\s*/, '').replace(/^\d+\.\s*/, '').trim();
                if (cleanLine && cleanLine.length <= 50) {
                    result.push({ title: cleanLine });
                    commandCount++;
                }
            }

            // 결과가 없으면 null 반환
            if (result.length === 0) {
                return null;
            }

            return result;
        } catch (error) {
            console.warn('[PlanManager] 작업 큐 요약 실패:', error);
            return null;
        }
    }
}

