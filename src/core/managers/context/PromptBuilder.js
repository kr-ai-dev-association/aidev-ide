/**
 * Prompt Builder
 * LLM 프롬프트 생성을 담당하는 서비스
 * OS별, 모델별, 프로젝트별 프롬프트 생성
 *
 * @deprecated 이 클래스는 PromptComposer를 사용하도록 리팩토링되었습니다.
 * 새로운 코드에서는 PromptComposer를 직접 사용하세요.
 */
import { PromptType } from '../../../services';
import { getGeneralAskPrompt } from './prompts/general/generalAsk';
export { PromptType };
import { PromptComposer } from './prompts/PromptComposer';
import { ProjectManager } from '../project/ProjectManager';
export class PromptBuilder {
    userOS;
    modelType;
    constructor(userOS, modelType) {
        this.userOS = userOS;
        this.modelType = modelType;
    }
    /**
     * 최종 시스템 프롬프트를 생성합니다.
     */
    generateSystemPrompt(options) {
        const { promptType, codebaseContext, realTimeInfo, profileContext, intentContext, gitContext, languageInstruction, taskType } = options;
        if (promptType === PromptType.GENERAL_ASK) {
            return getGeneralAskPrompt({
                codebaseContext,
                profileContext,
                intentContext,
                realTimeInfo,
                gitContext,
                languageInstruction,
                selectedFilesContent: options.selectedFilesContent,
                terminalContextContent: options.terminalContextContent,
                diagnosticsContextContent: options.diagnosticsContextContent
            });
        }
        // CODE_GENERATION 타입은 PromptComposer 사용
        const projectManager = ProjectManager.getInstance();
        const currentProject = projectManager.getCurrentProject();
        const composerOptions = {
            userOS: this.userOS,
            modelType: this.modelType,
            taskType: taskType,
            projectType: currentProject?.type,
            codebaseContext: codebaseContext, // 코드베이스 컨텍스트 포함
            selectedFilesContent: options.selectedFilesContent, // 사용자가 선택한 파일들 내용 포함
            terminalContextContent: options.terminalContextContent, // 사용자가 선택한 터미널 히스토리 포함
            diagnosticsContextContent: options.diagnosticsContextContent, // 사용자가 선택한 Diagnostics 포함
            allowedTools: options.allowedTools, // 허용된 도구 전달
            frameworkRulesPrompt: options.frameworkRulesPrompt, // v9.2.1: 동적 프레임워크 규칙
            hotLoadPrompt: options.hotLoadPrompt, // Hot Load 프롬프트
            mcpCustomPrompts: options.mcpCustomPrompts, // MCP 커스텀 프롬프트
        };
        return PromptComposer.composeSystemPrompt(composerOptions);
    }
    /**
     * 모델 타입을 업데이트합니다.
     */
    setModelType(modelType) {
        this.modelType = modelType;
    }
    /**
     * OS를 업데이트합니다.
     */
    setUserOS(userOS) {
        this.userOS = userOS;
    }
}
//# sourceMappingURL=PromptBuilder.js.map