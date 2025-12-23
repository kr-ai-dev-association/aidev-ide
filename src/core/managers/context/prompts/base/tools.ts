/**
 * Tools 프롬프트 컴포넌트
 * 툴 콜링 시스템에 대한 프롬프트
 */

import { ToolSpecBuilder } from '../../../../tools/ToolSpecBuilder';

export function getToolsPrompt(): string {
    return ToolSpecBuilder.buildToolPromptSection();
}

