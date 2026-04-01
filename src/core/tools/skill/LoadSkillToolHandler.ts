/**
 * Load Skill Tool Handler
 * Tool for sub-agents to load skill content on-demand
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
                message: 'skill_key parameter is required. Check the list of available skills.',
                error: { code: 'MISSING_PARAM', message: 'skill_key is required' },
            };
        }

        const entry = PromptComposer.getSkillContent(skillKey);
        if (!entry) {
            // List available skills
            const available = PromptComposer.getSkillDescriptions();
            const listText = available.length > 0
                ? `Available skills: ${available.map(s => s.key).join(', ')}`
                : 'No skills registered.';
            return {
                success: false,
                message: `Skill '${skillKey}' not found. ${listText}`,
                error: { code: 'SKILL_NOT_FOUND', message: `Skill '${skillKey}' not found` },
            };
        }

        console.log(`[LoadSkillToolHandler] Skill loaded: ${skillKey} (${entry.content.length} chars)`);

        // Add loaded skill to references
        PromptComposer.addSkillReference(skillKey, entry.source);

        return {
            success: true,
            message: `## Skill: ${skillKey}\n\n${entry.content}`,
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
