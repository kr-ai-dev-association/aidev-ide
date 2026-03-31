/**
 * Load Skill Tool Handler
 * 서브에이전트가 스킬 content를 on-demand로 로드하는 도구
 */

import { IToolHandler, ToolExecutionContext } from '../IToolHandler';
import { ToolUse, ToolResponse, Tool } from '../types';
import { PromptComposer } from '../../managers/context/prompts/PromptComposer';

export class LoadSkillToolHandler implements IToolHandler {
    readonly name = Tool.LOAD_SKILL;

    async execute(toolUse: ToolUse, context: ToolExecutionContext): Promise<ToolResponse> {
        const skillKey = toolUse.params.skill_key || toolUse.params.key || toolUse.params.name;

        if (!skillKey) {
            return {
                success: false,
                message: 'skill_key 파라미터가 필요합니다. 사용 가능한 스킬 목록을 확인하세요.',
                error: { code: 'MISSING_PARAM', message: 'skill_key is required' },
            };
        }

        const entry = PromptComposer.getSkillContent(skillKey);
        if (!entry) {
            // 사용 가능한 스킬 목록 안내
            const available = PromptComposer.getSkillDescriptions();
            const listText = available.length > 0
                ? `사용 가능한 스킬: ${available.map(s => s.key).join(', ')}`
                : '등록된 스킬이 없습니다.';
            return {
                success: false,
                message: `스킬 '${skillKey}'을(를) 찾을 수 없습니다. ${listText}`,
                error: { code: 'SKILL_NOT_FOUND', message: `Skill '${skillKey}' not found` },
            };
        }

        console.log(`[LoadSkillToolHandler] Skill loaded: ${skillKey} (${entry.content.length} chars)`);

        // 참조에 로드된 스킬 추가
        PromptComposer.addSkillReference(skillKey, entry.source);

        return {
            success: true,
            message: `## 스킬: ${skillKey}\n\n${entry.content}`,
            data: {
                key: entry.key,
                source: entry.source,
                enforcement: entry.enforcement,
            },
        };
    }

    getDescription(toolUse: ToolUse): string {
        return `[load_skill: ${toolUse.params.skill_key || toolUse.params.key || toolUse.params.name}]`;
    }
}
