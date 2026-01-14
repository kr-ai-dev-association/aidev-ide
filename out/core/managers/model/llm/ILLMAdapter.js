"use strict";
/**
 * LLM별 추상화 인터페이스
 * 공통 프롬프트와 LLM별 특화 프롬프트를 관리
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LLMFeature = void 0;
/**
 * LLM 기능
 */
var LLMFeature;
(function (LLMFeature) {
    LLMFeature["STREAMING"] = "streaming";
    LLMFeature["FUNCTION_CALLING"] = "function_calling";
    LLMFeature["CODE_GENERATION"] = "code_generation";
    LLMFeature["ERROR_CORRECTION"] = "error_correction";
    LLMFeature["MULTI_TURN"] = "multi_turn";
    LLMFeature["FILE_OPERATIONS"] = "file_operations";
    LLMFeature["COMMAND_EXECUTION"] = "command_execution";
})(LLMFeature || (exports.LLMFeature = LLMFeature = {}));
//# sourceMappingURL=ILLMAdapter.js.map