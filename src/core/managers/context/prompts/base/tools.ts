/**
 * Tools 프롬프트 컴포넌트
 * 툴 콜링 시스템에 대한 프롬프트
 */

import { ToolSpecBuilder } from '../../../../tools/ToolSpecBuilder';
import { Tool } from '../../../../tools/types';

export function getToolsPrompt(allowedTools?: Tool[]): string {
    return ToolSpecBuilder.buildToolPromptSection(allowedTools);
}

