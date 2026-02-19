/**
 * Model Manager 타입 정의
 * LLM 모델 선택 및 관리를 담당하는 매니저의 타입들
 */
/**
 * 모델 제공자
 */
export var ModelProvider;
(function (ModelProvider) {
    ModelProvider["GEMINI"] = "gemini";
    ModelProvider["GPT"] = "gpt";
    ModelProvider["OLLAMA"] = "ollama";
    ModelProvider["ANTHROPIC"] = "anthropic";
    ModelProvider["CUSTOM"] = "custom";
})(ModelProvider || (ModelProvider = {}));
//# sourceMappingURL=types.js.map