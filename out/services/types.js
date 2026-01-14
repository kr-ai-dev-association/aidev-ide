"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PromptType = exports.AiModelType = void 0;
var AiModelType;
(function (AiModelType) {
    AiModelType["GEMINI"] = "gemini";
    AiModelType["OLLAMA"] = "ollama";
})(AiModelType || (exports.AiModelType = AiModelType = {}));
var PromptType;
(function (PromptType) {
    PromptType["CODE_GENERATION"] = "code_generation";
    PromptType["GENERAL_ASK"] = "general_ask";
})(PromptType || (exports.PromptType = PromptType = {}));
//# sourceMappingURL=types.js.map