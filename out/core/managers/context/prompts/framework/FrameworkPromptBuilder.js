"use strict";
/**
 * Framework Prompt Builder
 * 프레임워크 이름 기반으로 프롬프트 생성
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.FrameworkPromptBuilder = void 0;
const framework = __importStar(require("./index"));
/**
 * Framework Prompt Builder
 * 프레임워크 이름 기반으로 프롬프트 생성
 */
class FrameworkPromptBuilder {
    /**
     * 프로젝트 컨텍스트 프롬프트 생성
     * 프레임워크 이름 기반으로 프롬프트 생성
     */
    static buildProjectContextPrompt(projectType, framework) {
        let prompt = `\n## 프로젝트 컨텍스트:\n프로젝트 타입: ${projectType}`;
        if (framework && framework.length > 0) {
            prompt += `\n기술 스택: ${framework.join(', ')}`;
            // 프레임워크별 프롬프트 추가
            const frameworkPrompt = this.getFrameworkPromptByName(framework);
            if (frameworkPrompt) {
                prompt += `\n\n${frameworkPrompt}`;
            }
        }
        // LLM이 프로젝트 파일을 읽어서 판단하도록 지시
        prompt += `\n\n**중요**: 프로젝트의 설정 파일(package.json, pom.xml, build.gradle, vite.config.ts 등)을 읽어서 적절한 명령어와 구조를 판단하세요.`;
        return prompt;
    }
    /**
     * 프레임워크 이름으로 프롬프트 가져오기
     */
    static getFrameworkPromptByName(frameworkNames) {
        const prompts = [];
        for (const name of frameworkNames) {
            const lowerName = name.toLowerCase();
            if (lowerName.includes('vite')) {
                prompts.push(framework.getViteTypePrompt());
            }
            else if (lowerName.includes('express')) {
                prompts.push(framework.getExpressPrompt());
            }
            else if (lowerName.includes('spring') || lowerName.includes('spring-boot')) {
                prompts.push(framework.getSpringBootPrompt());
            }
            else if (lowerName.includes('typescript') || lowerName.includes('node')) {
                prompts.push(framework.getNodeTypeScriptPrompt());
            }
        }
        return prompts.join('\n\n');
    }
}
exports.FrameworkPromptBuilder = FrameworkPromptBuilder;
//# sourceMappingURL=FrameworkPromptBuilder.js.map