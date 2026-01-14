"use strict";
/**
 * Prompt Composer
 * OS별, LLM별, 프레임워크별 프롬프트 컴포넌트를 조합하여 최종 프롬프트 생성
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
exports.PromptComposer = void 0;
const services_1 = require("../../../../services");
const OSAdapterFactory_1 = require("../../execution/os/OSAdapterFactory");
const base = __importStar(require("./base"));
const os = __importStar(require("./os"));
const llm = __importStar(require("./llm"));
const framework = __importStar(require("./framework"));
const task_1 = require("./task");
class PromptComposer {
    /**
     * 최종 시스템 프롬프트를 생성합니다.
     */
    static composeSystemPrompt(options) {
        const { userOS, modelType, taskType, frameworkName, projectType, codebaseContext, allowedTools } = options;
        // OS 정보 가져오기 (OSAdapter 사용)
        const osDetectionResult = OSAdapterFactory_1.OSAdapterFactory.detect();
        const osContextInfo = `**실행 환경:**
- OS: ${osDetectionResult.osName} (${osDetectionResult.osType})
- 셸: ${osDetectionResult.shellType}
- 아키텍처: ${osDetectionResult.architecture}
`;
        // 베이스 프롬프트 조합
        const basePrompt = [
            base.getAgentRole(),
            base.getObjective(),
            base.getBaseRules(),
            base.getFileOperationsRules(),
            base.getCodeVsScriptRules(),
            base.getToolsPrompt(allowedTools)
        ].join('\n\n');
        // OS별 프롬프트
        const osPrompt = this.getOSPrompt(userOS);
        // LLM별 프롬프트
        const llmPrompt = this.getLLMPrompt(modelType);
        // 작업 타입별 프롬프트
        const taskPrompt = taskType ? this.getTaskPrompt(taskType) : '';
        // 프레임워크별 프롬프트 (이름 기반)
        const frameworkPrompt = frameworkName ? this.getFrameworkPrompt(frameworkName) : '';
        // 터미널 명령 규칙 (execution_work일 때만 포함)
        const terminalCommandRules = taskType === 'execution_work' ? base.getTerminalCommandRules() : '';
        // 코드베이스 컨텍스트 (관련 파일 내용)
        const codebaseSection = codebaseContext ? `**코드베이스 컨텍스트:**
다음 파일들의 내용을 참고하여 작업을 수행하세요. 이 파일들은 사용자 요청과 관련된 중요한 정보를 포함하고 있습니다.

${codebaseContext}` : '';
        // 조합
        const parts = [
            osContextInfo,
            basePrompt,
            terminalCommandRules,
            taskPrompt,
            frameworkPrompt,
            codebaseSection,
            llmPrompt,
            osPrompt
        ].filter(part => part && part.trim() !== '');
        return parts.join('\n\n');
    }
    /**
     * OS별 프롬프트 가져오기
     * public으로 노출하여 어댑터의 fallback 경로에서도 사용 가능
     */
    static getOSPrompt(userOS) {
        const osLower = userOS.toLowerCase();
        if (osLower.includes('windows')) {
            return os.getWindowsPrompt();
        }
        else if (osLower.includes('mac') || osLower.includes('darwin')) {
            return os.getMacOSPrompt();
        }
        else if (osLower.includes('linux')) {
            return os.getLinuxPrompt();
        }
        else {
            return os.getDefaultOSPrompt();
        }
    }
    /**
     * LLM별 프롬프트 가져오기
     */
    static getLLMPrompt(modelType) {
        switch (modelType) {
            case services_1.AiModelType.GEMINI:
                return llm.getGeminiPrompt();
            case services_1.AiModelType.OLLAMA:
                return llm.getGPTOSSPrompt(); // Ollama 기본 프롬프트로 GPT-OSS 스타일 사용
            default:
                return llm.getDefaultLLMPrompt();
        }
    }
    /**
     * 작업 타입별 프롬프트 가져오기
     */
    static getTaskPrompt(taskType) {
        switch (taskType) {
            case 'code_work':
                return (0, task_1.getCodeWorkPrompt)();
            case 'execution_work':
                return (0, task_1.getExecutionWorkPrompt)();
            default:
                return '';
        }
    }
    /**
     * 프레임워크별 프롬프트 가져오기 (frameworkName 문자열 기반)
     */
    static getFrameworkPrompt(frameworkName) {
        const frameworkLower = frameworkName.toLowerCase();
        // React + TypeScript + Vite 감지
        if (frameworkLower.includes('vite')) {
            // Vite는 대부분 React/TypeScript 조합으로 사용된다고 가정하고 ViteTypePrompt 사용
            return framework.getViteTypePrompt();
        }
        // Spring Boot 감지
        if (frameworkLower.includes('spring') || frameworkLower.includes('spring-boot')) {
            return framework.getSpringBootPrompt();
        }
        // Express 감지
        if (frameworkLower.includes('express')) {
            return framework.getExpressPrompt();
        }
        // Node.js TypeScript 감지
        if (frameworkLower.includes('typescript') || frameworkLower.includes('node')) {
            console.log('[PromptComposer] Node.js TypeScript 프레임워크 감지, getNodeTypeScriptPrompt 호출');
            return framework.getNodeTypeScriptPrompt();
        }
        return '';
    }
}
exports.PromptComposer = PromptComposer;
//# sourceMappingURL=PromptComposer.js.map