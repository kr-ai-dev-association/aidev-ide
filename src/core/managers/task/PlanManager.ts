/**
 * Plan Manager
 * 플랜 생성 및 파싱을 담당하는 서비스
 * TaskManager와 함께 사용하여 작업 계획을 관리
 */

import { SettingsManager } from '../state/SettingsManager';
import { LLMApiClient } from '../model/LLMApiClient';
import { AiModelType } from '../../../services';
import {
    getSplitInstructionPrompt,
    getSplitInstructionSystemPrompt,
    getStructuredPlanPrompt,
    getLegacyPlanPrompt,
    getSummarizePlanPrompt,
    getSummarizePlanSystemPrompt
} from '../context/prompts/plan';

export interface PlanItem {
    title: string;
    detail?: string;
}

export class PlanManager {
    private static instance: PlanManager;
    private llmService?: LLMApiClient;
    private currentModelType: AiModelType = AiModelType.ADMIN;

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
        ollamaApi?: any,
        abortSignal?: AbortSignal
    ): Promise<string[]> {
        // 20자 이하인 경우 분리하지 않음
        if (userQuery.length <= 20) {
            return [userQuery];
        }

        const lang = (await SettingsManager.getInstance().getLanguage?.()) || 'ko';
        const forceKorean = lang.toLowerCase().startsWith('ko');

        const splitPrompt = getSplitInstructionPrompt({ userQuery, forceKorean });

        try {
            const parts = [{ text: splitPrompt }];
            const systemPromptForSplit = getSplitInstructionSystemPrompt(forceKorean);

            if (!ollamaApi) {
                return [userQuery];
            }

            let response: string;
            try { await ollamaApi.loadSettingsFromStorage(); } catch { }
            response = await ollamaApi.sendMessageWithSystemPrompt(systemPromptForSplit, parts, { signal: abortSignal });

            // JSON 파싱 (think 블록 제거 후)
            const stripped = response.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
            const jsonMatch = stripped.match(/\{[\s\S]*\}/);
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
     * 사용자 질의/키워드/환경을 입력으로 받아 구조화된 계획(JSON) 수립 프롬프트를 생성합니다.
     */
    public async buildStructuredPlanPrompt(
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

        return getStructuredPlanPrompt({
            userQuery,
            os,
            modelName,
            topFiles,
            keywords: kw,
            forceKorean
        });
    }

    /**
     * JSON 형태의 계획 텍스트를 파싱하여 PlanItem 배열로 변환합니다.
     */
    public parseStructuredPlan(jsonText: string): Array<{ title: string, detail?: string }> {
        try {
            // 마크다운 코드 블록 제거
            const cleanText = jsonText.replace(/```json\s*|\s*```/g, '').trim();
            // JSON 파싱 시도
            const parsed = JSON.parse(cleanText);

            if (Array.isArray(parsed)) {
                return parsed.map((item: any) => ({
                    title: item.title || 'Untitled Step',
                    detail: item.description || ''
                }));
            }
        } catch (e) {
            console.warn('[PlanManager] Failed to parse structured plan JSON:', e);
        }

        // 파싱 실패 시 기존 마크다운 파서로 폴백
        return this.parseCheckboxItemsFromPlan(jsonText);
    }

    /**
     * 사용자 질의/키워드/환경을 입력으로 받아 계획 수립 프롬프트를 생성합니다. (Legacy Support)
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

        return getLegacyPlanPrompt({
            userQuery,
            os,
            modelName,
            topFiles,
            keywords: kw,
            forceKorean
        });
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
        console.log(`[PlanManager] planText 길이: ${planMarkdown.length} chars`);

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
                    items.push({ title: trimmedTitle, detail: '' });
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
                    items.push({ title: trimmedTitle, detail: '' });
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
                    items.push({ title: trimmedTitle, detail: '' });
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
                    items.push({ title: trimmedTitle, detail: '' });
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
                            items.push({ title: trimmedTitle, detail: '' });
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
                    items.push({ title: trimmedTitle, detail: '' });
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
        ollamaApi?: any,
        abortSignal?: AbortSignal
    ): Promise<Array<{ title: string, detail?: string }> | null> {
        const lang = (await SettingsManager.getInstance().getLanguage?.()) || 'ko';
        const forceKorean = lang.toLowerCase().startsWith('ko');

        const itemsText = items.map((item, idx) => `${idx + 1}. ${item.title}${item.detail ? ` - ${item.detail}` : ''}`).join('\n');

        const summaryPrompt = getSummarizePlanPrompt({ itemsText, forceKorean });

        try {
            const parts = [{ text: summaryPrompt }];
            const systemPrompt = getSummarizePlanSystemPrompt(forceKorean);

            if (!ollamaApi) {
                return null;
            }

            let response: string;
            try { await ollamaApi.loadSettingsFromStorage(); } catch { }
            response = await ollamaApi.sendMessageWithSystemPrompt(systemPrompt, parts, { signal: abortSignal });

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

