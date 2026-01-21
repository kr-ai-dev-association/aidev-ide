"use strict";
/**
 * Prompt Builder
 * LLM 프롬프트 생성을 담당하는 서비스
 * OS별, 모델별, 프로젝트별 프롬프트 생성
 *
 * @deprecated 이 클래스는 PromptComposer를 사용하도록 리팩토링되었습니다.
 * 새로운 코드에서는 PromptComposer를 직접 사용하세요.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PromptBuilder = exports.PromptType = void 0;
const services_1 = require("../../../services");
Object.defineProperty(exports, "PromptType", { enumerable: true, get: function () { return services_1.PromptType; } });
const generalAsk_1 = require("./prompts/general/generalAsk");
const PromptComposer_1 = require("./prompts/PromptComposer");
const ProjectManager_1 = require("../project/ProjectManager");
class PromptBuilder {
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
        if (promptType === services_1.PromptType.GENERAL_ASK) {
            return (0, generalAsk_1.getGeneralAskPrompt)({
                codebaseContext,
                profileContext,
                intentContext,
                realTimeInfo,
                gitContext,
                languageInstruction
            });
        }
        // CODE_GENERATION 타입은 PromptComposer 사용
        const projectManager = ProjectManager_1.ProjectManager.getInstance();
        const currentProject = projectManager.getCurrentProject();
        // 프레임워크 감지
        let frameworkName;
        if (currentProject?.framework) {
            frameworkName = currentProject.framework.toLowerCase();
            console.log(`[PromptBuilder] 프로젝트에서 프레임워크 감지: ${frameworkName}`);
        }
        else if (options.userQuery) {
            // 프로젝트가 감지되지 않았을 때 사용자 쿼리에서 프레임워크 추출
            frameworkName = this.extractFrameworkFromQuery(options.userQuery);
            console.log(`[PromptBuilder] 사용자 쿼리에서 프레임워크 추출: ${frameworkName || '없음'} (쿼리: ${options.userQuery.substring(0, 100)})`);
        }
        const composerOptions = {
            userOS: this.userOS,
            modelType: this.modelType,
            taskType: taskType,
            frameworkName,
            projectType: currentProject?.type,
            codebaseContext: codebaseContext, // 코드베이스 컨텍스트 포함
            allowedTools: options.allowedTools, // 허용된 도구 전달
        };
        return PromptComposer_1.PromptComposer.composeSystemPrompt(composerOptions);
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
    /**
     * 사용자 쿼리에서 프레임워크 키워드를 추출합니다.
     */
    extractFrameworkFromQuery(userQuery) {
        const lower = userQuery.toLowerCase();
        // Vite 감지 (React TypeScript + Vite 조합)
        if (lower.includes('vite')) {
            return 'vite';
        }
        // Spring Boot 감지
        if (lower.includes('spring') || lower.includes('spring-boot') || lower.includes('springboot')) {
            return 'spring-boot';
        }
        // Express 감지
        if (lower.includes('express')) {
            return 'express';
        }
        // Node.js TypeScript 감지 (한글 포함)
        const hasNode = lower.includes('node') || lower.includes('nodejs') || lower.includes('node.js') || userQuery.includes('노드');
        const hasTypeScript = lower.includes('typescript') || lower.includes('type script') || lower.includes('ts') ||
            userQuery.includes('타입스크립트') || userQuery.includes('타입 스크립트');
        if (hasNode && hasTypeScript) {
            return 'node-typescript';
        }
        // 백엔드 프로젝트 + TypeScript 조합도 감지
        if ((lower.includes('backend') || lower.includes('back-end') || lower.includes('백엔드') || lower.includes('백엔')) && hasTypeScript) {
            return 'node-typescript';
        }
        return undefined;
    }
}
exports.PromptBuilder = PromptBuilder;
//# sourceMappingURL=PromptBuilder.js.map