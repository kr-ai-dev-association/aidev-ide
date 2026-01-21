"use strict";
/**
 * CodeLlama LLM 프롬프트 컴포넌트
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCodeLlamaPrompt = getCodeLlamaPrompt;
function getCodeLlamaPrompt() {
    return `**CodeLlama 모델 최적화 지침:**
- **XML 도구 활용**: 모든 코드는 XML 태그(<create_file>, <update_file>) 내에 작성하고 마크다운 코드 블록은 피하세요.
- **코드 중심**: 불필요한 설명은 줄이고 바로 실행 가능한 도구 호출을 수행하세요.`;
}
//# sourceMappingURL=CodeLlamaPrompt.js.map